do $$
declare
  v_workspace_id uuid;
  v_row record;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where slug = 'marzio-dcom'
  limit 1;

  raise notice 'debug workspace=%', v_workspace_id;

  for v_row in
    select
      br.id,
      br.status,
      coalesce(br.cancellation_source, '') as cancellation_source,
      br.customer_name,
      br.customer_surname,
      br.customer_email::text as customer_email,
      br.customer_phone,
      br.requested_service_name,
      coalesce(br.requested_operator_id, '') as requested_operator_id,
      coalesce(br.requested_operator_name, '') as requested_operator_name,
      br.created_at,
      br.updated_at
    from public.booking_requests br
    where br.workspace_id = v_workspace_id
      and br.appointment_date = date '2026-05-27'
      and br.appointment_time = time '09:00'
    order by coalesce(br.updated_at, br.created_at) desc, br.created_at desc, br.id desc
    limit 25
  loop
    raise notice 'request id=% status=% cancel=% email=% phone=% service=% op_id=% op_name=% created=% updated=%',
      v_row.id,
      v_row.status,
      v_row.cancellation_source,
      v_row.customer_email,
      v_row.customer_phone,
      v_row.requested_service_name,
      v_row.requested_operator_id,
      v_row.requested_operator_name,
      v_row.created_at,
      v_row.updated_at;
  end loop;

  for v_row in
    select
      a.id,
      a.booking_request_id,
      a.customer_name,
      a.service_name,
      a.operator_id,
      a.operator_name,
      a.created_at
    from public.appointments a
    where a.workspace_id = v_workspace_id
      and a.appointment_date = date '2026-05-27'
      and a.appointment_time = time '09:00'
    order by a.created_at desc, a.id desc
    limit 10
  loop
    raise notice 'appointment id=% req_id=% customer=% service=% op_id=% op_name=% created=%',
      v_row.id,
      v_row.booking_request_id,
      v_row.customer_name,
      v_row.service_name,
      coalesce(v_row.operator_id, ''),
      coalesce(v_row.operator_name, ''),
      v_row.created_at;
  end loop;
end;
$$;
