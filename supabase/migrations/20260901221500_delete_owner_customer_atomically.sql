begin;

-- A deliberate recreation is the only operation allowed to clear a deletion
-- tombstone. Running this before the regular customer projection trigger means
-- a newly registered customer is projected immediately with a new identity.
create or replace function public.clear_customer_tombstone_on_recreation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_normalized_name text := lower(
    regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g')
  );
begin
  delete from public.customer_deletion_tombstones as tombstone
  where tombstone.workspace_id = new.workspace_id
    and (
      tombstone.customer_id = new.id
      or (
        v_normalized_name <> ''
        and tombstone.normalized_name = v_normalized_name
      )
    );

  return new;
end;
$$;

revoke all on function public.clear_customer_tombstone_on_recreation()
from public, anon, authenticated;

drop trigger if exists clear_customer_tombstone_before_recreation
  on public.customers;
create trigger clear_customer_tombstone_before_recreation
before insert on public.customers
for each row
execute function public.clear_customer_tombstone_on_recreation();

-- Backward compatibility for app builds that still issue a direct DELETE.
-- Tombstoning stays lightweight and the expensive full-portal JSON rewrite is
-- removed from the DELETE trigger path; those builds already publish their
-- filtered snapshot immediately after the canonical deletion succeeds.
create or replace function public.tombstone_customer_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_normalized_name text := lower(
    regexp_replace(btrim(coalesce(old.full_name, '')), '\s+', ' ', 'g')
  );
begin
  if old.workspace_id is null or v_normalized_name = '' then
    return old;
  end if;

  insert into public.customer_deletion_tombstones (
    workspace_id,
    customer_id,
    normalized_name
  )
  values (old.workspace_id, old.id, v_normalized_name)
  on conflict (workspace_id, normalized_name)
  do update set
    customer_id = excluded.customer_id,
    created_at = timezone('utc', now());

  return old;
end;
$$;

revoke all on function public.tombstone_customer_before_delete()
from public, anon, authenticated;

drop trigger if exists tombstone_customer_before_delete on public.customers;
create trigger tombstone_customer_before_delete
before delete on public.customers
for each row
execute function public.tombstone_customer_before_delete();

drop trigger if exists sync_client_portal_after_customers_change
  on public.customers;
create trigger sync_client_portal_after_customers_change
after insert or update on public.customers
for each row
execute function public.handle_client_portal_customer_sync();

create or replace function public.delete_owner_customer_v1(
  p_workspace_id uuid,
  p_customer_ids uuid[],
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_customer_ids uuid[] := coalesce(p_customer_ids, array[]::uuid[]);
  v_normalized_fallback_name text := lower(
    regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')
  );
  v_deleted_ids uuid[] := array[]::uuid[];
  v_tombstone_count integer := 0;
  v_existing_tombstone boolean := false;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'owner_session_required';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and (
      lower(btrim(workspace.owner_email::text)) =
        lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      or exists (
        select 1
        from public.workspace_members as member
        where member.workspace_id = workspace.id
          and member.user_id = auth.uid()
      )
    )
    and (
      workspace.is_internal_tester = true
      or (
        workspace.subscription_status = 'active'
        and workspace.subscription_ends_at is not null
        and workspace.subscription_ends_at > timezone('utc', now())
      )
    )
  for update;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  if cardinality(v_customer_ids) = 0 then
    raise exception 'customer_id_invalid';
  end if;

  -- Persist the anti-resurrection marker before removing the canonical row.
  -- DISTINCT ON avoids a double-upsert if old devices created duplicate rows
  -- with the same normalized name. The whole function is one transaction.
  insert into public.customer_deletion_tombstones (
    workspace_id,
    customer_id,
    normalized_name
  )
  select distinct on (normalized_name)
    v_workspace_id,
    customer_id,
    normalized_name
  from (
    select
      customer.id as customer_id,
      lower(
        regexp_replace(
          btrim(coalesce(customer.full_name, '')),
          '\s+',
          ' ',
          'g'
        )
      ) as normalized_name
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.id = any(v_customer_ids)
  ) as selected_customer
  where normalized_name <> ''
  order by normalized_name, customer_id
  on conflict (workspace_id, normalized_name)
  do update set
    customer_id = excluded.customer_id,
    created_at = timezone('utc', now());

  get diagnostics v_tombstone_count = row_count;

  -- A transport retry is accepted only when the first transaction already
  -- left its authoritative tombstone. An arbitrary missing UUID must never be
  -- able to hide an unrelated customer merely by supplying the same name.
  if v_tombstone_count = 0 then
    select exists (
      select 1
      from public.customer_deletion_tombstones as tombstone
      where tombstone.workspace_id = v_workspace_id
        and (
          tombstone.customer_id = any(v_customer_ids)
          or (
            v_normalized_fallback_name <> ''
            and tombstone.normalized_name = v_normalized_fallback_name
          )
        )
    )
    into v_existing_tombstone;

    if not v_existing_tombstone then
      raise exception 'customer_not_found';
    end if;
  end if;

  -- The legacy row trigger rewrites the complete public JSON snapshot and can
  -- exceed the API statement timeout. The app publishes the already-filtered
  -- snapshot after this lightweight canonical mutation; the tombstone guards
  -- every later snapshot write in the meantime.
  perform set_config(
    'salonpro.skip_client_portal_snapshot_sync',
    'on',
    true
  );
  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  with deleted_customer as (
    delete from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.id = any(v_customer_ids)
    returning customer.id
  )
  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_deleted_ids
  from deleted_customer;

  return jsonb_build_object(
    'ok', true,
    'workspace_id', v_workspace_id,
    'deleted_customer_ids', to_jsonb(v_deleted_ids),
    'replayed', cardinality(v_deleted_ids) = 0
  );
end;
$$;

revoke all on function public.delete_owner_customer_v1(uuid, uuid[], text)
from public, anon;
grant execute on function public.delete_owner_customer_v1(uuid, uuid[], text)
to authenticated;

comment on function public.delete_owner_customer_v1(uuid, uuid[], text) is
  'Atomically tombstones and deletes an owner customer without rewriting the complete portal snapshot inside the delete statement.';

commit;
