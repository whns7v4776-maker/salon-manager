create or replace function public.accept_owner_booking_request_with_operator_v1(
  p_request_id uuid,
  p_operator_id uuid,
  p_next_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_operator public.operators%rowtype;
  v_request_role text;
  v_operator_role text;
  v_previous_duration integer;
  v_next_duration integer;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_start_at timestamp;
  v_end_at timestamp;
  v_response jsonb;
  v_appointment_id uuid;
  v_customer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if coalesce(
    (
      select workspace.auto_accept_booking_requests
      from public.workspaces as workspace
      where workspace.id = v_workspace_id
    ),
    false
  ) then
    raise exception 'manual_acceptance_required';
  end if;

  if p_request_id is null or p_operator_id is null then
    raise exception 'invalid_arguments';
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_request_id;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_request_id
  for update;

  select operator.*
  into v_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and operator.id = p_operator_id
  for share;

  if v_operator.id is null then
    raise exception 'operator_not_found';
  end if;

  v_request_role := lower(
    regexp_replace(trim(coalesce(v_request.required_role, '')), '\s+', ' ', 'g')
  );
  if v_request_role = '' then
    select lower(regexp_replace(trim(coalesce(service.required_role, '')), '\s+', ' ', 'g'))
    into v_request_role
    from public.services as service
    where service.workspace_id = v_workspace_id
      and lower(trim(service.name)) = lower(trim(v_request.requested_service_name))
    order by service.updated_at desc, service.created_at desc
    limit 1;
  end if;

  v_operator_role := lower(
    regexp_replace(trim(coalesce(v_operator.required_role, '')), '\s+', ' ', 'g')
  );

  if coalesce(v_request_role, '') = ''
    or coalesce(v_operator_role, '') = ''
    or v_request_role <> v_operator_role then
    raise exception 'operator_not_eligible';
  end if;

  if v_operator.availability is not null then
    if jsonb_typeof(coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)
        ) as weekday_value
        where weekday_value::integer =
          extract(dow from v_request.appointment_date)::integer
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;

    if jsonb_typeof(coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)
        ) as range_item
        where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null
          and trim(coalesce(range_item ->> 'startDate', '')) <= v_request.appointment_date::text
          and trim(coalesce(range_item ->> 'endDate', '')) >= v_request.appointment_date::text
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;
  end if;

  v_previous_duration := greatest(coalesce(v_request.requested_duration_minutes, 60), 1);
  v_next_duration := coalesce(p_next_duration_minutes, v_previous_duration);

  if v_request.status::text = 'accepted'
    and nullif(trim(coalesce(v_request.requested_operator_id, '')), '') = v_operator.id::text
    and v_previous_duration = v_next_duration then
    select appointment.id, appointment.customer_id
    into v_appointment_id, v_customer_id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id = v_request.id
    order by appointment.updated_at desc, appointment.created_at desc
    limit 1;

    return jsonb_build_object(
      'appointmentId', v_appointment_id,
      'customerId', coalesce(v_customer_id, v_request.customer_id),
      'workspaceId', v_workspace_id,
      'operatorId', v_operator.id,
      'operatorName', v_operator.name,
      'previousDurationMinutes', v_previous_duration,
      'nextDurationMinutes', v_next_duration,
      'changed', false
    );
  end if;

  if v_request.status::text <> 'pending' then
    raise exception 'booking_request_already_processed';
  end if;

  if v_next_duration < 5 or v_next_duration > 720 then
    raise exception 'invalid_duration';
  end if;

  if v_next_duration > v_previous_duration then
    raise exception 'duration_can_only_be_shortened';
  end if;

  if v_next_duration < v_previous_duration then
    v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);

    select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
    into v_slot_interval
    from jsonb_array_elements(
      coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)
    ) as date_interval
    where date_interval ->> 'date' = v_request.appointment_date::text
    limit 1;

    v_slot_interval := coalesce(
      v_slot_interval,
      nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
      30
    );

    if v_slot_interval < 5 or v_slot_interval > 300 or v_slot_interval % 5 <> 0 then
      v_slot_interval := 30;
    end if;

    if (v_previous_duration - v_next_duration) % v_slot_interval <> 0 then
      raise exception 'invalid_duration_step';
    end if;
  end if;

  v_start_at := v_request.appointment_date::timestamp + v_request.appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_next_duration);

  if v_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id is distinct from v_request.id
      and appointment.appointment_date = v_request.appointment_date
      and (v_request.appointment_date::timestamp + appointment.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_start_at
      and (
        nullif(trim(coalesce(appointment.operator_id, '')), '') = v_operator.id::text
        or lower(trim(coalesce(appointment.operator_name, ''))) =
          lower(trim(v_operator.name))
      )
  ) then
    raise exception 'booking_request_conflict';
  end if;

  if exists (
    select 1
    from public.booking_requests as other_request
    where other_request.workspace_id = v_workspace_id
      and other_request.id <> v_request.id
      and other_request.status::text in ('pending', 'accepted')
      and other_request.appointment_date = v_request.appointment_date
      and (v_request.appointment_date::timestamp + other_request.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + other_request.appointment_time
        + make_interval(
            mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1)
          )
      ) > v_start_at
      and (
        nullif(trim(coalesce(other_request.requested_operator_id, '')), '') =
          v_operator.id::text
        or lower(trim(coalesce(other_request.requested_operator_name, ''))) =
          lower(trim(v_operator.name))
      )
  ) then
    raise exception 'booking_request_conflict';
  end if;

  update public.booking_requests
  set requested_operator_id = v_operator.id::text,
      requested_operator_name = trim(v_operator.name),
      requested_duration_minutes = v_next_duration,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and id = v_request.id;

  v_response := public.update_owner_booking_request_status_core(
    v_workspace_id,
    v_request.id,
    'accepted'::public.request_status
  );

  return jsonb_build_object(
    'appointmentId', v_response ->> 'appointmentId',
    'customerId', v_response ->> 'customerId',
    'workspaceId', v_workspace_id,
    'operatorId', v_operator.id,
    'operatorName', v_operator.name,
    'previousDurationMinutes', v_previous_duration,
    'nextDurationMinutes', v_next_duration,
    'slotIntervalMinutes', v_slot_interval,
    'changed', true
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_with_operator_v1(uuid, uuid, integer)
  from public;
grant execute on function public.accept_owner_booking_request_with_operator_v1(uuid, uuid, integer)
  to authenticated;
