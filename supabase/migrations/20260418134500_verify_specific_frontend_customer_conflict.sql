do $$
declare
  v_customer_count integer;
  v_frontend_customer_count integer;
  v_booking_request_count integer;
  v_waitlist_count integer;
begin
  select count(*)
  into v_customer_count
  from public.customers as customer
  join public.client_portals as portal
    on portal.workspace_id = customer.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(customer.email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_frontend_customer_count
  from public.customers as customer
  join public.client_portals as portal
    on portal.workspace_id = customer.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and customer.source = 'frontend'
    and (
      lower(trim(coalesce(customer.email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_booking_request_count
  from public.booking_requests as booking_request
  join public.client_portals as portal
    on portal.workspace_id = booking_request.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(booking_request.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_waitlist_count
  from public.booking_slot_waitlist as waitlist
  join public.client_portals as portal
    on portal.workspace_id = waitlist.workspace_id
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(waitlist.customer_email::text, ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = '3245678090'
    );

  raise notice 'conflict_check barberia-lcom francesco.rossi@gmail.com 3245678090 => customers:% frontend_customers:% booking_requests:% waitlist:%',
    v_customer_count,
    v_frontend_customer_count,
    v_booking_request_count,
    v_waitlist_count;
end
$$;
