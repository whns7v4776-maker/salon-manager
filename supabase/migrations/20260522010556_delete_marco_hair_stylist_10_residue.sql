do $$
declare
  v_workspace_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marco.rossi@gmail.com'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found:marco.rossi@gmail.com';
  end if;

  delete from public.cash_movements
  where appointment_id in (
    select appointment.id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = date '2026-05-22'
      and appointment.appointment_time = time '10:00'
      and lower(trim(coalesce(appointment.service_name, ''))) = 'piega'
      and lower(trim(coalesce(appointment.customer_name, ''))) = 'giuseppe verdi'
  );

  delete from public.appointments
  where workspace_id = v_workspace_id
    and appointment_date = date '2026-05-22'
    and appointment_time = time '10:00'
    and lower(trim(coalesce(service_name, ''))) = 'piega'
    and lower(trim(coalesce(customer_name, ''))) = 'giuseppe verdi';

  delete from public.booking_requests
  where workspace_id = v_workspace_id
    and appointment_date = date '2026-05-22'
    and appointment_time = time '10:00'
    and lower(trim(coalesce(requested_service_name, ''))) = 'piega'
    and (
      lower(trim(coalesce(customer_email::text, ''))) = 'giuseppe.verdi@gmail.com'
      or regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = '3013013001'
      or lower(trim(coalesce(customer_name, '') || ' ' || coalesce(customer_surname, ''))) = 'giuseppe verdi'
    );

  perform public.sync_client_portal_customers(v_workspace_id);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
end
$$;
