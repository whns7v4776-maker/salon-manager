-- Keep complex public bookings exact from slot suggestion through acceptance.
--
-- 1. A public dependency/composition must never be announced to the customer
--    as an appointment created by the salon while it is still pending.
-- 2. Auto-accept revalidates weekly hours, lunch, vacations and calendar
--    exceptions for every real operator-busy phase.
-- 3. Remove only the two known orphaned pending rows from the failed Roby
--    dependency test. The guard aborts if the inspected remote state changed.

do $migration$
declare
  v_signature regprocedure :=
    'public.queue_owner_composition_created_push_v1(uuid,uuid)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text :=
    'if v_group.id is null or v_group.status <> ''active'' then';
  v_replacement text :=
    'if v_group.id is null or v_group.status <> ''active'' or v_group.source <> ''salon'' then';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('v_group.source <> ''salon''' in v_definition) = 0 then
    v_next := replace(v_definition, v_anchor, v_replacement);
    if v_next = v_definition then
      raise exception 'owner_composition_push_source_guard_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$migration$;

create or replace function public.finalize_owner_composition_created_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'salon'
    and old.customer_id is null
    and new.customer_id is not null
    and new.status = 'active'
  then
    perform public.queue_owner_composition_created_push_v1(
      new.workspace_id,
      new.id
    );
  end if;

  return new;
end;
$$;

do $migration$
declare
  v_signature regprocedure :=
    'public.validate_booking_request_auto_accept_v1(uuid,uuid)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := $anchor$  perform pg_advisory_xact_lock($anchor$;
  v_guard text := $guard$  if not public.is_public_booking_time_allowed_by_availability(
    p_workspace_id,
    v_request.appointment_date,
    v_request.appointment_time,
    v_initial
  ) or not public.is_public_booking_calendar_exception_allowed(
    p_workspace_id,
    v_request.appointment_date,
    v_request.appointment_time,
    v_initial,
    v_initial_operator_id,
    v_initial_operator_name
  ) then
    raise exception 'booking_request_conflict';
  end if;

  if v_final_enabled then
    v_final_time := (
      v_request.appointment_time
      + make_interval(mins => v_initial + v_processing)
    )::time;

    if not public.is_public_booking_time_allowed_by_availability(
      p_workspace_id,
      v_request.appointment_date,
      v_final_time,
      v_final
    ) or not public.is_public_booking_calendar_exception_allowed(
      p_workspace_id,
      v_request.appointment_date,
      v_final_time,
      v_final,
      v_final_operator_id,
      v_final_operator_name
    ) then
      raise exception 'booking_request_conflict';
    end if;
  end if;

  perform pg_advisory_xact_lock($guard$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('is_public_booking_calendar_exception_allowed' in v_definition) = 0 then
    v_next := replace(v_definition, v_anchor, v_guard);
    if v_next = v_definition then
      raise exception 'auto_accept_availability_guard_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$migration$;

do $cleanup$
declare
  v_workspace_id constant uuid := 'd84f3211-d20f-45a3-9d7f-f551400690fd';
  v_group_id constant uuid := 'f388d6ab-b503-4d8b-8cb5-981451f0fa5f';
  v_expected_ids constant uuid[] := array[
    'f89597b3-c861-46bc-b2f4-50cf0c00cbd0'::uuid,
    '942f6c62-5558-422f-aa6d-dd8574078c64'::uuid
  ];
  v_request_count integer := 0;
  v_appointment_count integer := 0;
  v_matching_count integer := 0;
begin
  select count(*)::integer
  into v_request_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  select count(*)::integer
  into v_matching_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id
    and request.id = any(v_expected_ids)
    and request.status = 'pending'::public.request_status
    and request.origin = 'frontend';

  select count(*)::integer
  into v_appointment_count
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  if v_request_count = 0 and not exists (
    select 1
    from public.appointment_groups as appointment_group
    where appointment_group.workspace_id = v_workspace_id
      and appointment_group.id = v_group_id
  ) then
    return;
  end if;

  if v_request_count <> 2
    or v_matching_count <> 2
    or v_appointment_count <> 0
  then
    raise exception
      'dirty_linked_request_cleanup_state_changed:requests=%,matching=%,appointments=%',
      v_request_count,
      v_matching_count,
      v_appointment_count;
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  delete from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id
    and request.id = any(v_expected_ids);

  delete from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id;
end;
$cleanup$;

notify pgrst, 'reload schema';
