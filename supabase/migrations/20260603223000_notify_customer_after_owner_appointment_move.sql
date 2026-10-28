create or replace function public.queue_customer_appointment_rescheduled_push(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_body text;
  v_payload jsonb;
begin
  if p_workspace_id is null or p_booking_request_id is null then
    return 0;
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = p_workspace_id
    and booking_request.id = p_booking_request_id;

  if v_request.id is null then
    return 0;
  end if;

  v_body :=
    'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
    '. Prima: ' || to_char(p_previous_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
    '. Nuovo orario: ' || to_char(p_next_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
    case
      when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Operatore: ' || trim(p_operator_name) || '.'
      else '.'
    end;

  v_payload := jsonb_build_object(
    'type', 'appointment_rescheduled',
    'bookingRequestId', v_request.id,
    'appointmentId', p_appointment_id,
    'previousDate', p_previous_date,
    'previousTime', to_char(p_previous_time, 'HH24:MI'),
    'appointmentDate', p_next_date,
    'appointmentTime', to_char(p_next_time, 'HH24:MI'),
    'customerName', coalesce(nullif(trim(p_customer_name), ''), trim(v_request.customer_name || ' ' || v_request.customer_surname)),
    'serviceName', coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name),
    'operatorName', nullif(trim(coalesce(p_operator_name, '')), ''),
    'source', 'owner'
  );

  return public.queue_public_customer_push(
    p_workspace_id,
    'custom'::public.push_event_type,
    'Appuntamento spostato dal salone',
    v_body,
    v_payload,
    v_request.customer_email,
    v_request.customer_phone
  );
end;
$$;

revoke all on function public.queue_customer_appointment_rescheduled_push(
  uuid,
  uuid,
  uuid,
  date,
  time,
  date,
  time,
  text,
  text,
  text
) from public, anon;

grant execute on function public.queue_customer_appointment_rescheduled_push(
  uuid,
  uuid,
  uuid,
  date,
  time,
  date,
  time,
  text,
  text,
  text
) to authenticated;

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
      and (
        nullif(trim(coalesce(v_appointment.operator_id, '')), '') is null
        or nullif(trim(coalesce(appointment.operator_id, '')), '') = nullif(trim(coalesce(v_appointment.operator_id, '')), '')
        or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = nullif(lower(trim(coalesce(v_appointment.operator_name, ''))), '')
      )
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      updated_at = timezone('utc', now())
  where id = v_appointment.id;

  update public.booking_requests
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
  where id = v_appointment.booking_request_id;

  perform public.queue_customer_appointment_rescheduled_push(
    v_workspace_id,
    v_appointment.booking_request_id,
    v_appointment.id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    p_next_appointment_date,
    p_next_appointment_time,
    v_appointment.service_name,
    v_appointment.customer_name,
    v_appointment.operator_name
  );

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'previousDate', v_appointment.appointment_date,
    'previousTime', v_appointment.appointment_time,
    'nextDate', p_next_appointment_date,
    'nextTime', p_next_appointment_time
  );
end;
$$;

grant execute on function public.move_owner_appointment(uuid, date, time) to authenticated;

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
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_source
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_source_appointment_id
  for update;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_target_appointment_id
  for update;

  if v_source.id is null or v_target.id is null then
    raise exception 'appointment_not_found';
  end if;

  update public.appointments
  set appointment_date = v_target.appointment_date,
      appointment_time = v_target.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_source.id;

  update public.appointments
  set appointment_date = v_source.appointment_date,
      appointment_time = v_source.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_target.id;

  update public.booking_requests
  set appointment_date = v_target.appointment_date,
      appointment_time = v_target.appointment_time,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
  where id = v_source.booking_request_id;

  update public.booking_requests
  set appointment_date = v_source.appointment_date,
      appointment_time = v_source.appointment_time,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
  where id = v_target.booking_request_id;

  perform public.queue_customer_appointment_rescheduled_push(
    v_workspace_id,
    v_source.booking_request_id,
    v_source.id,
    v_source.appointment_date,
    v_source.appointment_time,
    v_target.appointment_date,
    v_target.appointment_time,
    v_source.service_name,
    v_source.customer_name,
    v_source.operator_name
  );

  perform public.queue_customer_appointment_rescheduled_push(
    v_workspace_id,
    v_target.booking_request_id,
    v_target.id,
    v_target.appointment_date,
    v_target.appointment_time,
    v_source.appointment_date,
    v_source.appointment_time,
    v_target.service_name,
    v_target.customer_name,
    v_target.operator_name
  );

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'sourceAppointmentId', v_source.id,
    'targetAppointmentId', v_target.id,
    'sourceDate', v_source.appointment_date,
    'sourceTime', v_source.appointment_time,
    'targetDate', v_target.appointment_date,
    'targetTime', v_target.appointment_time
  );
end;
$$;

grant execute on function public.swap_owner_appointments(uuid, uuid) to authenticated;
