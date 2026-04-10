create or replace function public.swap_owner_appointments(
  p_source_appointment_id uuid,
  p_target_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_source public.appointments%rowtype;
  v_target public.appointments%rowtype;
  v_first_id uuid;
  v_second_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if p_source_appointment_id is null or p_target_appointment_id is null then
    raise exception 'invalid_arguments';
  end if;

  if p_source_appointment_id = p_target_appointment_id then
    raise exception 'same_appointment';
  end if;

  select appointment.*
  into v_source
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_source_appointment_id;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_target_appointment_id;

  if v_source.id is null or v_target.id is null then
    raise exception 'appointment_not_found';
  end if;

  v_first_id := least(v_source.id, v_target.id);
  v_second_id := greatest(v_source.id, v_target.id);

  perform 1
  from public.appointments as appointment
  where appointment.id in (v_first_id, v_second_id)
  order by appointment.id
  for update;

  update public.appointments as appointment
  set appointment_date = v_target.appointment_date,
      appointment_time = v_target.appointment_time,
      updated_at = timezone('utc', now())
  where appointment.id = v_source.id;

  update public.appointments as appointment
  set appointment_date = v_source.appointment_date,
      appointment_time = v_source.appointment_time,
      updated_at = timezone('utc', now())
  where appointment.id = v_target.id;

  if v_source.booking_request_id is not null then
    update public.booking_requests as booking_request
    set appointment_date = v_target.appointment_date,
        appointment_time = v_target.appointment_time,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where booking_request.id = v_source.booking_request_id;
  end if;

  if v_target.booking_request_id is not null then
    update public.booking_requests as booking_request
    set appointment_date = v_source.appointment_date,
        appointment_time = v_source.appointment_time,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where booking_request.id = v_target.booking_request_id;
  end if;

  return jsonb_build_object(
    'sourceAppointmentId', v_source.id,
    'targetAppointmentId', v_target.id,
    'sourceBookingRequestId', v_source.booking_request_id,
    'targetBookingRequestId', v_target.booking_request_id,
    'sourceDate', v_source.appointment_date,
    'sourceTime', v_source.appointment_time,
    'targetDate', v_target.appointment_date,
    'targetTime', v_target.appointment_time
  );
end;
$$;

create or replace function public.move_owner_appointment(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if p_appointment_id is null or p_next_appointment_date is null or p_next_appointment_time is null then
    raise exception 'invalid_arguments';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.id <> v_appointment.id
      and appointment.appointment_date = p_next_appointment_date
      and appointment.appointment_time = p_next_appointment_time
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments as appointment
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      updated_at = timezone('utc', now())
  where appointment.id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests as booking_request
    set appointment_date = p_next_appointment_date,
        appointment_time = p_next_appointment_time,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where booking_request.id = v_appointment.booking_request_id;
  end if;

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', v_appointment.booking_request_id,
    'previousDate', v_appointment.appointment_date,
    'previousTime', v_appointment.appointment_time,
    'nextDate', p_next_appointment_date,
    'nextTime', p_next_appointment_time
  );
end;
$$;

grant execute on function public.swap_owner_appointments(uuid, uuid) to authenticated;
grant execute on function public.move_owner_appointment(uuid, date, time) to authenticated;
