begin;

alter table public.appointments add column if not exists occasional_customer jsonb;

-- Existing booking engines still validate times, phases, permissions and clashes.
-- The wrapper adds only appointment-local contact data, in the same transaction.
create or replace function public.create_owner_occasional_appointment_v1(p_payload jsonb, p_group boolean default false)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r jsonb;
  ids uuid[];
  affected integer;
begin
  if auth.uid() is null then raise exception 'owner_session_required'; end if;
  if nullif(btrim(p_payload->>'p_customer_name'), '') is null then raise exception 'customer_name_required'; end if;
  if p_group then
    r := public.create_owner_appointment_group_flexible_v1(
      p_salon_code => p_payload->>'p_salon_code',
      p_customer_name => p_payload->>'p_customer_name',
      p_customer_phone => p_payload->>'p_customer_phone',
      p_customer_email => null::citext,
      p_customer_instagram => null, p_customer_note => null,
      p_customer_source => 'salon', p_group_title => p_payload->>'p_group_title',
      p_items => p_payload->'p_items', p_idempotency_key => p_payload->>'p_idempotency_key',
      p_create_customer_record => false, p_create_booking_requests => false,
      p_allow_operator_overlap => coalesce((p_payload->>'p_allow_operator_overlap')::boolean,false),
      p_allow_customer_overlap => coalesce((p_payload->>'p_allow_customer_overlap')::boolean,false),
      p_allow_machinery_overlap => coalesce((p_payload->>'p_allow_machinery_overlap')::boolean,false),
      p_allow_outside_schedule => true, p_allow_capability_override => true);
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(r->'appointmentIds');
  else
    r := public.create_owner_appointment_flexible_v1(
      p_salon_code => p_payload->>'p_salon_code',
      p_customer_name => p_payload->>'p_customer_name',
      p_customer_phone => p_payload->>'p_customer_phone',
      p_customer_email => null::citext,
      p_customer_instagram => null, p_customer_note => null,
      p_customer_source => 'salon', p_create_customer_record => false, p_create_booking_request => false,
      p_service_name => p_payload->>'p_service_name', p_price => (p_payload->>'p_price')::numeric,
      p_duration_minutes => (p_payload->>'p_duration_minutes')::integer,
      p_appointment_date => (p_payload->>'p_appointment_date')::date,
      p_appointment_time => (p_payload->>'p_appointment_time')::time,
      p_operator_id => p_payload->>'p_operator_id', p_operator_name => p_payload->>'p_operator_name',
      p_required_role => p_payload->>'p_required_role', p_phase_snapshot => nullif(p_payload->'p_phase_snapshot','null'::jsonb),
      p_allow_operator_overlap => coalesce((p_payload->>'p_allow_operator_overlap')::boolean,false),
      p_allow_customer_overlap => coalesce((p_payload->>'p_allow_customer_overlap')::boolean,false),
      p_allow_machinery_overlap => coalesce((p_payload->>'p_allow_machinery_overlap')::boolean,false),
      p_allow_outside_schedule => true, p_allow_capability_override => true);
    ids := array[(r->>'appointmentId')::uuid];
  end if;
  if coalesce(cardinality(ids),0) = 0 then raise exception 'appointment_not_confirmed'; end if;
  -- A replay must not undo a later explicit promotion to the address book.
  if coalesce((r->>'idempotent')::boolean,false) then return r; end if;
  -- Legacy engines may resolve an existing customer by name even when record
  -- creation is disabled. The occasional choice must not inherit that identity.
  update public.appointments set customer_id = null, occasional_customer = jsonb_build_object(
    'name', btrim(p_payload->>'p_customer_name'), 'phone', coalesce(p_payload->>'p_customer_phone',''))
    where id = any(ids) and workspace_id = (r->>'workspaceId')::uuid;
  get diagnostics affected = row_count;
  if affected <> cardinality(ids) then raise exception 'occasional_customer_not_confirmed'; end if;
  if p_group then
    update public.appointment_groups set customer_id = null
    where id = (r->>'groupId')::uuid and workspace_id = (r->>'workspaceId')::uuid;
  end if;
  r := jsonb_set(r, '{customerId}', 'null'::jsonb);
  perform public.refresh_workspace_agenda_state((r->>'workspaceId')::uuid);
  return r;
end;
$$;
revoke all on function public.create_owner_occasional_appointment_v1(jsonb,boolean) from public, anon;
grant execute on function public.create_owner_occasional_appointment_v1(jsonb,boolean) to authenticated;
-- Promotion is atomic with customer creation. A duplicate never inserts a row.
create or replace function public.save_occasional_customer_v1(
  p_appointment_id uuid, p_name text, p_phone text
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  a public.appointments%rowtype;
  r jsonb;
  customer_uuid uuid;
begin
  if auth.uid() is null then raise exception 'owner_session_required'; end if;
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'appointment_not_found'; end if;
  if a.customer_id is not null then
    return jsonb_build_object('ok', true, 'customer',
      (select to_jsonb(c) from public.customers c where c.id = a.customer_id));
  end if;
  if a.occasional_customer is null then raise exception 'not_occasional_customer'; end if;
  r := public.create_owner_customer_v4(
    p_workspace_id => a.workspace_id,
    p_customer_id => a.id,
    p_full_name => p_name,
    p_phone => p_phone
  );
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  customer_uuid := (r->'customer'->>'id')::uuid;
  update public.appointments
  set customer_id = customer_uuid,
      customer_name = r->'customer'->>'full_name', occasional_customer = null
  where workspace_id = a.workspace_id
    and (id = a.id or (a.appointment_group_id is not null and appointment_group_id = a.appointment_group_id))
    and customer_id is null and occasional_customer is not null;
  if a.appointment_group_id is not null then
    update public.appointment_groups set customer_id = customer_uuid
    where id = a.appointment_group_id and workspace_id = a.workspace_id and customer_id is null;
  end if;
  perform public.refresh_workspace_agenda_state(a.workspace_id);
  return r;
end;
$$;
revoke all on function public.save_occasional_customer_v1(uuid, text, text) from public, anon;
grant execute on function public.save_occasional_customer_v1(uuid, text, text) to authenticated;
commit;
