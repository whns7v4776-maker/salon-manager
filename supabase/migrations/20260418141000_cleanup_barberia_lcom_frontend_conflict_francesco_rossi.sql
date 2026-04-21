do $$
declare
  v_workspace_id uuid;
begin
  select portal.workspace_id
  into v_workspace_id
  from public.client_portals as portal
  where portal.salon_code = 'barberia-lcom'
  limit 1;

  if v_workspace_id is null then
    raise exception 'salon_not_found:barberia-lcom';
  end if;

  delete from public.cash_movements
  where appointment_id in (
    select appointment.id
    from public.appointments as appointment
    left join public.booking_requests as booking_request
      on booking_request.id = appointment.booking_request_id
    where appointment.workspace_id = v_workspace_id
      and appointment.created_by = 'frontend'
      and (
        lower(trim(coalesce(appointment.customer_name, ''))) = 'francesco rossi'
        or lower(trim(coalesce(booking_request.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
        or regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = '3245678090'
      )
  );

  delete from public.appointments
  where workspace_id = v_workspace_id
    and created_by = 'frontend'
    and (
      lower(trim(coalesce(customer_name, ''))) = 'francesco rossi'
      or booking_request_id in (
        select booking_request.id
        from public.booking_requests as booking_request
        where booking_request.workspace_id = v_workspace_id
          and booking_request.origin = 'frontend'
          and (
            lower(trim(coalesce(booking_request.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
            or regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = '3245678090'
          )
      )
    );

  delete from public.booking_requests
  where workspace_id = v_workspace_id
    and origin = 'frontend'
    and (
      lower(trim(coalesce(customer_email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = '3245678090'
    );

  perform public.sync_client_portal_customers(v_workspace_id);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
end
$$;
