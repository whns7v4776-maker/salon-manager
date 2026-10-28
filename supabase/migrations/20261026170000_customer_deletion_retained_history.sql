-- Keep retained history and distinguish FK detachment from booking admission.
begin;
CREATE OR REPLACE FUNCTION public.delete_owner_customer_v1(p_workspace_id uuid, p_customer_ids uuid[], p_full_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_ids uuid[] := coalesce(p_customer_ids, array[]::uuid[]);
  v_normalized_fallback_name text := lower(
    regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')
  );
  v_deleted_ids uuid[] := array[]::uuid[];
  v_tombstone_count integer := 0;
  v_existing_tombstone boolean := false;
  v_owned_customer_ids uuid[];
  v_reference record;
  v_has_reference boolean;
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

  -- Retained benefits and financial records must stay attached to their owner.
  -- Report this before any tombstone or FK detachment can trigger unrelated
  -- booking admission errors. Only inspect customers belonging to this salon.
  select coalesce(array_agg(id),array[]::uuid[]) into v_owned_customer_ids
  from public.customers where workspace_id=v_workspace_id and id=any(v_customer_ids);
  if exists(select 1 from public.customer_service_packages where customer_id=any(v_owned_customer_ids)) then
    raise exception using message='Il cliente ha pacchetti nominativi collegati e non può essere eliminato definitivamente. Puoi inibire nuove prenotazioni mantenendo il suo storico.', detail='customer_has_service_packages';
  end if;
  for v_reference in
    select c.conrelid::regclass as relation_name,a.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.customers'::regclass
      and c.confdeltype in ('a','r') and cardinality(c.conkey)=1
  loop
    execute format('select exists(select 1 from %s where %I=any($1))',v_reference.relation_name,v_reference.column_name)
      into v_has_reference using v_owned_customer_ids;
    if v_has_reference then raise exception using message='Il cliente ha uno storico di fedeltà, ordini o pagamenti collegato e non può essere eliminato definitivamente. Puoi inibire nuove prenotazioni mantenendo lo storico.', detail='customer_has_retained_history'; end if;
  end loop;

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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_customer_registration_booking_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- ON DELETE SET NULL is a referential action, not a new/reopened booking.
  -- Accept only a nested FK detachment after the canonical customer is gone,
  -- with every business field unchanged. Direct identity edits remain gated.
  if tg_op='UPDATE' and pg_trigger_depth()>1
    and old.customer_id is not null and new.customer_id is null
    and (to_jsonb(new)-'customer_id'-'updated_at')=(to_jsonb(old)-'customer_id'-'updated_at')
    and not exists(select 1 from public.customers where id=old.customer_id)
  then return new; end if;
  if new.origin::text <> 'frontend' or new.status::text not in ('pending','accepted') then return new; end if;
  -- Read-marker updates and cancellation workflows remain independent. Reopen,
  -- identity replacement or rescheduling still runs the admission check.
  if tg_op='UPDATE' and old.origin::text='frontend' and old.status::text in ('pending','accepted')
    and new.workspace_id is not distinct from old.workspace_id
    and new.customer_id is not distinct from old.customer_id
    and new.customer_email is not distinct from old.customer_email
    and new.customer_phone is not distinct from old.customer_phone
    and new.requested_service_name is not distinct from old.requested_service_name
    and new.appointment_date is not distinct from old.appointment_date
    and new.appointment_time is not distinct from old.appointment_time then return new; end if;
  -- Some historical RPCs resolve customer_id using one contact field or name.
  -- A pending canonical row remains blocked even if the submitted contacts
  -- differ from the stored pair, or the setting was turned off meanwhile.
  if exists(select 1 from public.customers where workspace_id=new.workspace_id
    and id=new.customer_id and registration_status='pending') then
    raise exception 'customer_registration_pending';
  end if;
  perform public.assert_customer_registration_approved_for_write_v1(new.workspace_id,new.customer_email::text,new.customer_phone);
  return new;
end $function$;

commit;
