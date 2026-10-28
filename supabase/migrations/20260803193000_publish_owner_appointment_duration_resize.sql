create or replace function public.resize_owner_appointment_duration_v1(
  p_appointment_id uuid,
  p_next_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_previous_duration integer;
  v_start_at timestamp;
  v_next_end_at timestamp;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  if p_appointment_id is null or p_next_duration_minutes is null then
    raise exception 'invalid_arguments';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id and appointment.id = p_appointment_id;
  if v_appointment.id is null then raise exception 'appointment_not_found'; end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_appointment.appointment_date::text)
  );
  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id and appointment.id = p_appointment_id
  for update;

  if v_appointment.phase_snapshot is not null then raise exception 'phased_duration_requires_editor'; end if;
  if p_next_duration_minutes < 5 or p_next_duration_minutes > 720 then
    raise exception 'invalid_duration';
  end if;

  v_previous_duration := greatest(coalesce(v_appointment.duration_minutes, 60), 1);
  if p_next_duration_minutes = v_previous_duration then
    return jsonb_build_object(
      'appointmentId', v_appointment.id,
      'bookingRequestId', v_appointment.booking_request_id,
      'previousDurationMinutes', v_previous_duration,
      'nextDurationMinutes', p_next_duration_minutes,
      'changed', false
    );
  end if;

  v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);
  select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
  into v_slot_interval
  from jsonb_array_elements(coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)) as date_interval
  where date_interval ->> 'date' = v_appointment.appointment_date::text
  limit 1;
  v_slot_interval := coalesce(
    v_slot_interval,
    nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
    30
  );
  if v_slot_interval < 5 or v_slot_interval > 300 or v_slot_interval % 5 <> 0 then
    v_slot_interval := 30;
  end if;
  if abs(p_next_duration_minutes - v_previous_duration) % v_slot_interval <> 0 then
    raise exception 'invalid_duration_step';
  end if;

  v_start_at := v_appointment.appointment_date::timestamp + v_appointment.appointment_time;
  v_next_end_at := v_start_at + make_interval(mins => p_next_duration_minutes);
  if v_next_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  if p_next_duration_minutes > v_previous_duration and exists(
    select 1
    from public.appointments as other
    where other.workspace_id = v_workspace_id
      and other.id <> v_appointment.id
      and other.appointment_date = v_appointment.appointment_date
      and (other.appointment_date::timestamp + other.appointment_time) < v_next_end_at
      and (
        other.appointment_date::timestamp + other.appointment_time
        + make_interval(mins => greatest(coalesce(other.duration_minutes, 60), 1))
      ) > v_start_at
      and (
        (v_appointment.customer_id is not null and other.customer_id = v_appointment.customer_id)
        or lower(trim(other.customer_name)) = lower(trim(v_appointment.customer_name))
        or (
          nullif(trim(coalesce(v_appointment.operator_id, '')), '') is not null
          and (
            other.operator_id = v_appointment.operator_id
            or (
              nullif(trim(coalesce(other.operator_id, '')), '') is null
              and lower(trim(coalesce(other.operator_name, ''))) =
                lower(trim(coalesce(v_appointment.operator_name, '')))
            )
          )
        )
        or (
          nullif(trim(coalesce(v_appointment.operator_id, '')), '') is null
          and nullif(trim(coalesce(v_appointment.operator_name, '')), '') is null
          and nullif(trim(coalesce(other.operator_id, '')), '') is null
          and nullif(trim(coalesce(other.operator_name, '')), '') is null
          and lower(trim(coalesce(other.required_role, ''))) =
            lower(trim(coalesce(v_appointment.required_role, '')))
        )
      )
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set duration_minutes = p_next_duration_minutes,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id and id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = p_next_duration_minutes,
        updated_at = timezone('utc', now())
    where workspace_id = v_workspace_id and id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', v_appointment.booking_request_id,
    'previousDurationMinutes', v_previous_duration,
    'nextDurationMinutes', p_next_duration_minutes,
    'slotIntervalMinutes', v_slot_interval,
    'changed', true
  );
end;
$$;

revoke all on function public.resize_owner_appointment_duration_v1(uuid, integer) from public;
grant execute on function public.resize_owner_appointment_duration_v1(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
