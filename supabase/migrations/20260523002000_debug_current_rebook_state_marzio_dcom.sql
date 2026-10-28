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

  raise notice 'workspace=%', v_workspace_id;

  for v_row in
    select
      br.id,
      br.status,
      coalesce(br.cancellation_source, '') as cancellation_source,
      br.customer_email::text as customer_email,
      br.customer_phone,
      br.requested_service_name,
      br.appointment_date,
      br.appointment_time,
      coalesce(br.requested_operator_id, '') as requested_operator_id,
      coalesce(br.requested_operator_name, '') as requested_operator_name,
      br.created_at,
      br.updated_at
    from public.booking_requests br
    where br.workspace_id = v_workspace_id
      and br.appointment_date = date '2026-05-27'
      and br.appointment_time = time '09:00'
      and lower(trim(coalesce(br.requested_service_name, ''))) = 'capelli'
      and lower(trim(coalesce(br.customer_email::text, ''))) = 'giuseppe.verdi@gmail.com'
      and regexp_replace(coalesce(br.customer_phone, ''), '\D+', '', 'g') = '3013013001'
    order by coalesce(br.updated_at, br.created_at) desc, br.created_at desc, br.id desc
    limit 25
  loop
    raise notice 'request id=% status=% cancel=% date=% time=% service=% email=% phone=% op_id=% op_name=% created=% updated=%',
      v_row.id,
      v_row.status,
      v_row.cancellation_source,
      v_row.appointment_date,
      v_row.appointment_time,
      v_row.requested_service_name,
      v_row.customer_email,
      v_row.customer_phone,
      v_row.requested_operator_id,
      v_row.requested_operator_name,
      v_row.created_at,
      v_row.updated_at;
  end loop;
end;
$$;
