do $$
declare
  v_portal_client_count integer;
  v_portal_request_count integer;
begin
  select count(*)
  into v_portal_client_count
  from public.client_portals as portal,
    lateral jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as item
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(item ->> 'email', ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g') = '3245678090'
    );

  select count(*)
  into v_portal_request_count
  from public.client_portals as portal,
    lateral jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb)) as item
  where portal.salon_code = 'barberia-lcom'
    and (
      lower(trim(coalesce(item ->> 'email', ''))) = 'francesco.rossi@gmail.com'
      or regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g') = '3245678090'
    );

  raise notice 'barberia_lcom_frontend_conflict_check => clienti:% richieste:%',
    v_portal_client_count,
    v_portal_request_count;
end
$$;
