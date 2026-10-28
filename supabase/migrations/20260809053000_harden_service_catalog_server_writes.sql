-- Make catalogue writes safe for the currently released owner app.
--
-- A service is identified by name + required role. The original database
-- constraint only used the name, so a valid catalogue containing the same
-- label in two professions made the whole multi-row upsert fail with 23505.
-- The released app then surfaced that refusal as a generic connection error.

alter table public.services
  drop constraint if exists services_workspace_id_name_key;

create table if not exists public.deleted_service_recovery_rows (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  service_id uuid not null,
  service_snapshot jsonb not null,
  deleted_by uuid,
  deleted_at timestamptz not null default timezone('utc', now())
);

create index if not exists deleted_service_recovery_rows_workspace_idx
  on public.deleted_service_recovery_rows (workspace_id, deleted_at desc);

alter table public.deleted_service_recovery_rows enable row level security;
revoke all on public.deleted_service_recovery_rows from anon, authenticated;

create or replace function public.normalize_service_catalog_write_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_duplicate_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  new.name := btrim(coalesce(new.name, ''));
  if new.name = '' then
    raise exception using
      errcode = '22023',
      message = 'service_name_required';
  end if;

  new.required_role := nullif(btrim(coalesce(new.required_role, '')), '');
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.client_badge := nullif(left(btrim(coalesce(new.client_badge, '')), 48), '');
  new.price := round(greatest(coalesce(new.price, 0), 0)::numeric, 2);
  new.duration_minutes := greatest(1, least(coalesce(new.duration_minutes, 60), 480));
  new.client_role_display_order := greatest(coalesce(new.client_role_display_order, 0), 0);
  new.client_display_order := greatest(coalesce(new.client_display_order, 0), 0);
  new.is_online := coalesce(new.is_online, true);

  if new.original_price is not null and new.original_price <= new.price then
    new.original_price := null;
  end if;
  new.discount_enabled := coalesce(new.discount_enabled, false) and new.original_price is not null;

  if
    (new.discount_valid_from is null) <> (new.discount_valid_to is null)
    or (
      new.discount_valid_from is not null
      and new.discount_valid_to < new.discount_valid_from
    )
  then
    new.discount_valid_from := null;
    new.discount_valid_to := null;
  end if;

  if
    (new.discount_start_time is null) <> (new.discount_end_time is null)
    or (
      new.discount_start_time is not null
      and new.discount_end_time <= new.discount_start_time
    )
  then
    new.discount_start_time := null;
    new.discount_end_time := null;
  end if;

  if jsonb_typeof(coalesce(new.phase_config, '{}'::jsonb)) <> 'object' then
    new.phase_config := '{}'::jsonb;
  else
    new.phase_config := coalesce(new.phase_config, '{}'::jsonb);
  end if;

  if jsonb_typeof(coalesce(new.linked_service_config, '{}'::jsonb)) <> 'object' then
    new.linked_service_config := '{}'::jsonb;
  else
    new.linked_service_config := coalesce(new.linked_service_config, '{}'::jsonb);
  end if;

  select service.id
  into v_duplicate_id
  from public.services as service
  where service.workspace_id = new.workspace_id
    and service.id <> new.id
    and lower(btrim(service.name)) = lower(new.name)
    and lower(btrim(coalesce(service.required_role, ''))) =
      lower(btrim(coalesce(new.required_role, '')))
    and service.superseded_by_composition_id is null
    and new.superseded_by_composition_id is null
  limit 1;

  if v_duplicate_id is not null then
    raise exception using
      errcode = '23505',
      constraint = 'services_workspace_name_role_key',
      message = 'duplicate_service_name_for_role';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_service_catalog_write_v1 on public.services;
create trigger normalize_service_catalog_write_v1
before insert or update on public.services
for each row execute function public.normalize_service_catalog_write_v1();

create or replace function public.archive_service_before_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.workspace_id::text, 0));

  insert into public.deleted_service_recovery_rows (
    workspace_id,
    service_id,
    service_snapshot,
    deleted_by
  ) values (
    old.workspace_id,
    old.id,
    to_jsonb(old),
    auth.uid()
  );

  return old;
end;
$$;

drop trigger if exists archive_service_before_delete_v1 on public.services;
create trigger archive_service_before_delete_v1
before delete on public.services
for each row execute function public.archive_service_before_delete_v1();

create or replace function public.reject_authenticated_service_bulk_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_count integer;
begin
  select count(*) into v_deleted_count from deleted_rows;

  if coalesce(auth.role(), '') = 'authenticated' and v_deleted_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'bulk_service_delete_blocked',
      detail = format('An owner client attempted to delete %s services in one request.', v_deleted_count),
      hint = 'Delete exactly one service by its stable id.';
  end if;

  return null;
end;
$$;

drop trigger if exists reject_authenticated_service_bulk_delete_v1 on public.services;
create trigger reject_authenticated_service_bulk_delete_v1
after delete on public.services
referencing old table as deleted_rows
for each statement execute function public.reject_authenticated_service_bulk_delete_v1();

comment on table public.deleted_service_recovery_rows is
  'Server-only recovery ledger for individually deleted catalogue services.';
comment on function public.normalize_service_catalog_write_v1() is
  'Serializes service writes per workspace, normalizes optional fields, and enforces name + role identity.';
comment on function public.reject_authenticated_service_bulk_delete_v1() is
  'Rolls back accidental multi-service deletion requests from owner clients.';

notify pgrst, 'reload schema';
