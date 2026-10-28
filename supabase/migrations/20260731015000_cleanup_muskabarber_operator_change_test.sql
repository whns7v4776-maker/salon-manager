create schema if not exists private;

create table if not exists private.surgical_cleanup_backups (
  id uuid primary key default gen_random_uuid(),
  cleanup_key text not null unique,
  workspace_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
declare
  v_workspace_id uuid;
  v_request_id constant uuid := 'bfe7b196-ea56-4671-aae0-f272cff95411';
  v_target_count integer;
  v_target_appointment_ids uuid[];
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = 'muskabarber-lcom'
  limit 1;

  if v_workspace_id is null then
    raise exception 'cleanup_workspace_not_found';
  end if;

  select count(*)
  into v_target_count
  from public.booking_requests as request
  where request.id = v_request_id
    and request.workspace_id = v_workspace_id
    and request.appointment_date = date '2026-08-01'
    and request.appointment_time = time '10:30'
    and lower(trim(request.requested_service_name)) = lower('Taglio Bambino')
    and request.status::text = 'rejected';

  if v_target_count <> 1 then
    raise exception 'cleanup_target_guard_failed: expected 1 row, found %', v_target_count;
  end if;

  select coalesce(array_agg(appointment.id), '{}'::uuid[])
  into v_target_appointment_ids
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = v_request_id;

  insert into private.surgical_cleanup_backups (
    cleanup_key,
    workspace_id,
    payload
  )
  values (
    'muskabarber-2026-08-01-1030-operator-change-test',
    v_workspace_id,
    jsonb_build_object(
      'bookingRequest',
      (
        select to_jsonb(request)
        from public.booking_requests as request
        where request.id = v_request_id
      ),
      'appointments',
      (
        select coalesce(jsonb_agg(to_jsonb(appointment)), '[]'::jsonb)
        from public.appointments as appointment
        where appointment.id = any(v_target_appointment_ids)
      ),
      'cashMovements',
      (
        select coalesce(jsonb_agg(to_jsonb(movement)), '[]'::jsonb)
        from public.cash_movements as movement
        where movement.appointment_id = any(v_target_appointment_ids)
      ),
      'targetPushNotifications',
      (
        select coalesce(jsonb_agg(to_jsonb(notification)), '[]'::jsonb)
        from public.push_notifications as notification
        where notification.workspace_id = v_workspace_id
          and notification.payload::text like '%' || v_request_id::text || '%'
      ),
      'clientPortal',
      (
        select to_jsonb(portal)
        from public.client_portals as portal
        where portal.workspace_id = v_workspace_id
      ),
      'ownerSnapshot',
      (
        select to_jsonb(snapshot)
        from public.owner_app_snapshots as snapshot
        where snapshot.workspace_id = v_workspace_id
      )
    )
  )
  on conflict (cleanup_key) do nothing;

  -- The user asked to restart the test with all current notification counters at zero.
  -- This marks existing history as read without deleting any legitimate request.
  update public.booking_requests
  set
    viewed_by_salon = true,
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      viewed_by_salon is distinct from true
      or viewed_by_customer is distinct from true
    );

  update public.customers
  set
    viewed_by_salon = true,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and viewed_by_salon is distinct from true;

  update public.push_devices
  set
    owner_badge_count = 0,
    client_badge_count = 0,
    owner_badge_synced_at = timezone('utc', now()),
    client_badge_synced_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id;

  delete from public.push_notifications as notification
  where notification.workspace_id = v_workspace_id
    and notification.payload::text like '%' || v_request_id::text || '%';

  delete from public.cash_movements as movement
  where movement.workspace_id = v_workspace_id
    and movement.appointment_id = any(v_target_appointment_ids);

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = any(v_target_appointment_ids);

  delete from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = v_request_id;

  update public.client_portals as portal
  set
    richieste_prenotazione = coalesce(
      (
        select jsonb_agg(item)
        from jsonb_array_elements(
          coalesce(portal.richieste_prenotazione, '[]'::jsonb)
        ) as item
        where coalesce(item ->> 'id', '') <> v_request_id::text
      ),
      '[]'::jsonb
    ),
    appuntamenti = coalesce(
      (
        select jsonb_agg(item)
        from jsonb_array_elements(
          coalesce(portal.appuntamenti, '[]'::jsonb)
        ) as item
        where not (
          coalesce(item ->> 'bookingRequestId', '') = v_request_id::text
          or coalesce(item ->> 'id', '') = any(
            select appointment_id::text
            from unnest(v_target_appointment_ids) as target_ids(appointment_id)
          )
        )
      ),
      '[]'::jsonb
    ),
    updated_at = timezone('utc', now())
  where portal.workspace_id = v_workspace_id;

  update public.owner_app_snapshots as snapshot
  set
    payload = jsonb_set(
      jsonb_set(
        snapshot.payload,
        '{richiestePrenotazione}',
        coalesce(
          (
            select jsonb_agg(item)
            from jsonb_array_elements(
              coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)
            ) as item
            where coalesce(item ->> 'id', '') <> v_request_id::text
          ),
          '[]'::jsonb
        ),
        true
      ),
      '{appuntamenti}',
      coalesce(
        (
          select jsonb_agg(item)
          from jsonb_array_elements(
            coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb)
          ) as item
          where not (
            coalesce(item ->> 'bookingRequestId', '') = v_request_id::text
            or coalesce(item ->> 'id', '') = any(
              select appointment_id::text
              from unnest(v_target_appointment_ids) as target_ids(appointment_id)
            )
          )
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = timezone('utc', now())
  where snapshot.workspace_id = v_workspace_id;

  if exists (
    select 1
    from public.booking_requests as request
    where request.id = v_request_id
  ) then
    raise exception 'cleanup_request_delete_failed';
  end if;

  if exists (
    select 1
    from public.client_portals as portal
    cross join lateral jsonb_array_elements(
      coalesce(portal.richieste_prenotazione, '[]'::jsonb)
    ) as item
    where portal.workspace_id = v_workspace_id
      and coalesce(item ->> 'id', '') = v_request_id::text
  ) then
    raise exception 'cleanup_client_portal_residue_found';
  end if;

  if exists (
    select 1
    from public.owner_app_snapshots as snapshot
    cross join lateral jsonb_array_elements(
      coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)
    ) as item
    where snapshot.workspace_id = v_workspace_id
      and coalesce(item ->> 'id', '') = v_request_id::text
  ) then
    raise exception 'cleanup_owner_snapshot_residue_found';
  end if;
end
$$;
