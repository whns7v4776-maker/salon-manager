create or replace function public.accept_owner_booking_request_with_duration_v1(
  p_request_id uuid,
  p_next_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_previous_duration integer;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_next_end_at timestamp;
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

  if p_request_id is null or p_next_duration_minutes is null then
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

  v_previous_duration := greatest(coalesce(v_request.requested_duration_minutes, 60), 1);

  if v_request.status::text = 'accepted' and v_previous_duration = p_next_duration_minutes then
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
      'previousDurationMinutes', v_previous_duration,
      'nextDurationMinutes', p_next_duration_minutes,
      'changed', false
    );
  end if;

  if v_request.status::text <> 'pending' then
    raise exception 'booking_request_already_processed';
  end if;

  if p_next_duration_minutes < 5 or p_next_duration_minutes > 720 then
    raise exception 'invalid_duration';
  end if;

  if p_next_duration_minutes >= v_previous_duration then
    raise exception 'duration_can_only_be_shortened';
  end if;

  v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);

  select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
  into v_slot_interval
  from jsonb_array_elements(coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)) as date_interval
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

  if (v_previous_duration - p_next_duration_minutes) % v_slot_interval <> 0 then
    raise exception 'invalid_duration_step';
  end if;

  v_next_end_at :=
    v_request.appointment_date::timestamp
    + v_request.appointment_time
    + make_interval(mins => p_next_duration_minutes);

  if v_next_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  update public.booking_requests
  set requested_duration_minutes = p_next_duration_minutes,
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
    'previousDurationMinutes', v_previous_duration,
    'nextDurationMinutes', p_next_duration_minutes,
    'slotIntervalMinutes', v_slot_interval,
    'changed', true
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_with_duration_v1(uuid, integer) from public;
grant execute on function public.accept_owner_booking_request_with_duration_v1(uuid, integer) to authenticated;
