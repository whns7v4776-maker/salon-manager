do $$
declare
  v_owner_email constant citext := 'marziomus@icloud.com'::citext;
  v_frontend_email constant citext := 'giuseppe.verdi@gmail.com'::citext;
  v_workspace_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, '')))::citext = v_owner_email
  order by w.updated_at desc, w.created_at desc
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found:%', v_owner_email;
  end if;

  delete from public.push_notifications
  where workspace_id = v_workspace_id;

  delete from public.booking_slot_waitlist
  where workspace_id = v_workspace_id
     or lower(trim(coalesce(customer_email::text, '')))::citext = v_frontend_email;

  delete from public.cash_movements
  where workspace_id = v_workspace_id
     or appointment_id in (
       select appointment.id
       from public.appointments as appointment
       where appointment.workspace_id = v_workspace_id
     );

  delete from public.appointments
  where workspace_id = v_workspace_id;

  delete from public.booking_requests
  where workspace_id = v_workspace_id
     or lower(trim(coalesce(customer_email::text, '')))::citext = v_frontend_email;

  delete from public.services
  where workspace_id = v_workspace_id;

  delete from public.operators
  where workspace_id = v_workspace_id;

  update public.owner_app_snapshots
  set
    payload =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(payload, '{}'::jsonb),
                  '{appuntamenti}',
                  '[]'::jsonb,
                  true
                ),
                '{movimenti}',
                '[]'::jsonb,
                true
              ),
              '{servizi}',
              '[]'::jsonb,
              true
            ),
            '{operatori}',
            '[]'::jsonb,
            true
          ),
          '{richiestePrenotazione}',
          '[]'::jsonb,
          true
        ),
        '{serviceCardColorOverrides}',
        '{}'::jsonb,
        true
      ),
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id;

  update public.owner_app_snapshots
  set
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{roleCardColorOverrides}',
      '{}'::jsonb,
      true
    ),
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id;

  update public.client_portals
  set
    appuntamenti = '[]'::jsonb,
    servizi = '[]'::jsonb,
    operatori = '[]'::jsonb,
    richieste_prenotazione = '[]'::jsonb,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
     or lower(trim(coalesce(owner_email::text, '')))::citext = v_owner_email;

  perform public.sync_client_portal_customers(v_workspace_id);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);

  raise notice
    'reset complete for workspace % owned by %, frontend focus %',
    v_workspace_id,
    v_owner_email,
    v_frontend_email;
end
$$;
