do $$
declare
  v_table_frontend_requests integer;
  v_table_any_requests integer;
  v_portal_requests integer;
begin
  select count(*)
  into v_table_frontend_requests
  from public.booking_requests as booking_request
  join public.client_portals as portal
    on portal.workspace_id = booking_request.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and booking_request.origin = 'frontend'
    and (
      lower(trim(coalesce(booking_request.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_table_any_requests
  from public.booking_requests as booking_request
  join public.client_portals as portal
    on portal.workspace_id = booking_request.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(booking_request.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_portal_requests
  from public.client_portals as portal,
    lateral jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb)) as item
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(item ->> 'email', ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g') = '3245678090'
    );

  raise notice 'barberia_lcom_request_state => table_frontend:% table_any:% portal:%',
    v_table_frontend_requests,
    v_table_any_requests,
    v_portal_requests;
end
$$;
