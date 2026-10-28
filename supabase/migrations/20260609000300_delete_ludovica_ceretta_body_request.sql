do $$
declare
  v_request_id uuid := 'b527b3e1-d901-4872-9a05-e82547e5dde1'::uuid;
  v_deleted_requests integer := 0;
  v_deleted_appointments integer := 0;
  v_updated_portals integer := 0;
  v_updated_snapshots integer := 0;
begin
  delete from public.cash_movements as movement
  using public.appointments as appointment
  where appointment.id = movement.appointment_id
    and appointment.booking_request_id = v_request_id;

  delete from public.appointments
  where booking_request_id = v_request_id;

  get diagnostics v_deleted_appointments = row_count;

  delete from public.booking_requests
  where id = v_request_id;

  get diagnostics v_deleted_requests = row_count;

  update public.client_portals as portal
  set
    appuntamenti = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinality)
        from jsonb_array_elements(coalesce(portal.appuntamenti, '[]'::jsonb))
          with ordinality as item(value, ordinality)
        where coalesce(item.value ->> 'bookingRequestId', item.value ->> 'booking_request_id', '') <> v_request_id::text
      ),
      '[]'::jsonb
    ),
    richieste_prenotazione = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinality)
        from jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb))
          with ordinality as item(value, ordinality)
        where item.value ->> 'id' <> v_request_id::text
      ),
      '[]'::jsonb
    ),
    updated_at = timezone('utc', now())
  where exists (
    select 1
    from jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = v_request_id::text
  )
  or exists (
    select 1
    from jsonb_array_elements(coalesce(portal.appuntamenti, '[]'::jsonb)) as item(value)
    where coalesce(item.value ->> 'bookingRequestId', item.value ->> 'booking_request_id', '') = v_request_id::text
  );

  get diagnostics v_updated_portals = row_count;

  update public.owner_app_snapshots as snapshot
  set
    payload = jsonb_set(
      jsonb_set(
        coalesce(snapshot.payload, '{}'::jsonb),
        '{appuntamenti}',
        coalesce(
          (
            select jsonb_agg(item.value order by item.ordinality)
            from jsonb_array_elements(coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb))
              with ordinality as item(value, ordinality)
            where coalesce(item.value ->> 'bookingRequestId', item.value ->> 'booking_request_id', '') <> v_request_id::text
          ),
          '[]'::jsonb
        ),
        true
      ),
      '{richiestePrenotazione}',
      coalesce(
        (
          select jsonb_agg(item.value order by item.ordinality)
          from jsonb_array_elements(coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb))
            with ordinality as item(value, ordinality)
          where item.value ->> 'id' <> v_request_id::text
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = timezone('utc', now())
  where exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = v_request_id::text
  )
  or exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb)) as item(value)
    where coalesce(item.value ->> 'bookingRequestId', item.value ->> 'booking_request_id', '') = v_request_id::text
  );

  get diagnostics v_updated_snapshots = row_count;

  perform pg_notify('pgrst', 'reload schema');
  raise notice 'Deleted Ludovica Ceretta Body request %, DB requests %, appointments %, portals %, snapshots %',
    v_request_id,
    v_deleted_requests,
    v_deleted_appointments,
    v_updated_portals,
    v_updated_snapshots;
end $$;
