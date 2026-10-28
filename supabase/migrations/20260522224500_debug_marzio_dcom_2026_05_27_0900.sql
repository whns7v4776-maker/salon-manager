do $$
declare
  v_workspace_id uuid;
  v_request record;
  v_appointment record;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.slug, ''))) = 'marzio-dcom'
  order by w.updated_at desc, w.created_at desc
  limit 1;

  if v_workspace_id is null then
    raise notice 'debug_marzio_dcom: workspace_not_found';
    return;
  end if;

  raise notice 'debug_marzio_dcom: workspace_id=%', v_workspace_id;

  for v_request in
    select
      br.id,
      br.status,
      br.cancellation_source,
      br.appointment_date,
      br.appointment_time,
      br.requested_service_name,
      br.customer_name,
      br.customer_surname,
      br.customer_email,
      br.customer_phone,
      br.requested_operator_id,
      br.requested_operator_name,
      br.created_at,
      br.updated_at
    from public.booking_requests as br
    where br.workspace_id = v_workspace_id
      and br.appointment_date = date '2026-05-27'
      and br.appointment_time = time '09:00'
    order by coalesce(br.updated_at, br.created_at) desc, br.created_at desc, br.id desc
  loop
    raise notice
      'debug_marzio_dcom: request id=% status=% cancel=% date=% time=% service=% customer=% % email=% phone=% op_id=% op_name=% created=% updated=%',
      v_request.id,
      v_request.status,
      coalesce(v_request.cancellation_source, ''),
      v_request.appointment_date,
      v_request.appointment_time,
      coalesce(v_request.requested_service_name, ''),
      coalesce(v_request.customer_name, ''),
      coalesce(v_request.customer_surname, ''),
      coalesce(v_request.customer_email::text, ''),
      coalesce(v_request.customer_phone, ''),
      coalesce(v_request.requested_operator_id, ''),
      coalesce(v_request.requested_operator_name, ''),
      v_request.created_at,
      v_request.updated_at;
  end loop;

  for v_appointment in
    select
      appointment.id,
      appointment.appointment_date,
      appointment.appointment_time,
      appointment.customer_name,
      appointment.service_name,
      appointment.operator_id,
      appointment.operator_name,
      appointment.created_at,
      appointment.updated_at,
      appointment.booking_request_id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = date '2026-05-27'
      and appointment.appointment_time = time '09:00'
    order by coalesce(appointment.updated_at, appointment.created_at) desc, appointment.created_at desc, appointment.id desc
  loop
    raise notice
      'debug_marzio_dcom: appointment id=% date=% time=% service=% customer=% op_id=% op_name=% booking_request_id=% created=% updated=%',
      v_appointment.id,
      v_appointment.appointment_date,
      v_appointment.appointment_time,
      coalesce(v_appointment.service_name, ''),
      coalesce(v_appointment.customer_name, ''),
      coalesce(v_appointment.operator_id, ''),
      coalesce(v_appointment.operator_name, ''),
      coalesce(v_appointment.booking_request_id::text, ''),
      v_appointment.created_at,
      v_appointment.updated_at;
  end loop;
end
$$;
