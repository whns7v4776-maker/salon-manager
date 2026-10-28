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
  v_note text;
  v_payload jsonb;
  v_status_code text;
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

  v_note :=
    'appointment_rescheduled_by_salon. Il salone ha spostato il tuo appuntamento di ' ||
    coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
    ' da ' || to_char(p_previous_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
    ' a ' || to_char(p_next_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
    case
      when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Operatore: ' || trim(p_operator_name) || '.'
      else '.'
    end;

  v_status_code := 'rescheduled:' || to_char(p_next_date, 'YYYY-MM-DD') || ':' || to_char(p_next_time, 'HH24:MI');

  update public.booking_requests
  set
    viewed_by_customer = false,
    notes = v_note,
    updated_at = timezone('utc', now())
  where id = v_request.id
    and workspace_id = p_workspace_id;

  v_payload := jsonb_build_object(
    'type', 'appointment_rescheduled_by_salon',
    'event_type', 'appointment_rescheduled_by_salon',
    'notificationType', 'appointment_rescheduled_by_salon',
    '_pushEventType', 'appointment_rescheduled_by_salon',
    '_pushTarget', 'client',
    '_pushAudience', 'public',
    'status', v_status_code,
    'statusCode', v_status_code,
    'bookingRequestId', v_request.id,
    'appointmentId', p_appointment_id,
    'previousDate', p_previous_date,
    'previousTime', to_char(p_previous_time, 'HH24:MI'),
    'appointmentDate', p_next_date,
    'appointmentTime', to_char(p_next_time, 'HH24:MI'),
    'customerName', coalesce(nullif(trim(p_customer_name), ''), trim(v_request.customer_name || ' ' || v_request.customer_surname)),
    'serviceName', coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name),
    'operatorName', nullif(trim(coalesce(p_operator_name, '')), ''),
    'customerEmail', coalesce(v_request.customer_email::text, ''),
    'customerPhone', coalesce(v_request.customer_phone, ''),
    'source', 'owner',
    '_dedupeKey',
      p_workspace_id::text || '|appointment_rescheduled_by_salon|' ||
      coalesce(p_appointment_id::text, v_request.id::text) || '|' ||
      to_char(p_previous_date, 'YYYY-MM-DD') || '|' ||
      to_char(p_previous_time, 'HH24:MI') || '|' ||
      to_char(p_next_date, 'YYYY-MM-DD') || '|' ||
      to_char(p_next_time, 'HH24:MI')
  );

  return public.queue_public_customer_push(
    p_workspace_id,
    'booking_request_status_changed'::public.push_event_type,
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
) to authenticated, service_role;
