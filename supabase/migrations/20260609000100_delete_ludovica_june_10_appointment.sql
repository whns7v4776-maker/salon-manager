do $$
declare
  v_target_date date := date '2026-06-10';
  v_target_time time := time '10:00';
  v_deleted_appointments integer := 0;
  v_updated_requests integer := 0;
begin
  create temporary table if not exists tmp_ludovica_appointment_delete_targets (
    appointment_id uuid primary key,
    workspace_id uuid not null,
    booking_request_id uuid,
    customer_name text not null,
    service_name text not null
  ) on commit drop;

  truncate table tmp_ludovica_appointment_delete_targets;

  insert into tmp_ludovica_appointment_delete_targets (
    appointment_id,
    workspace_id,
    booking_request_id,
    customer_name,
    service_name
  )
  select
    appointment.id,
    appointment.workspace_id,
    appointment.booking_request_id,
    appointment.customer_name,
    appointment.service_name
  from public.appointments as appointment
  where appointment.appointment_date = v_target_date
    and appointment.appointment_time = v_target_time
    and lower(appointment.customer_name) like '%ludovica%';

  update public.booking_requests as request
  set
    status = 'cancelled',
    cancellation_source = 'salone',
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  from tmp_ludovica_appointment_delete_targets as target
  where request.workspace_id = target.workspace_id
    and (
      request.id = target.booking_request_id
      or (
        request.appointment_date = v_target_date
        and request.appointment_time = v_target_time
        and lower(concat_ws(' ', request.customer_name, request.customer_surname)) like '%ludovica%'
      )
    )
    and request.status <> 'cancelled';

  get diagnostics v_updated_requests = row_count;

  delete from public.cash_movements as movement
  using tmp_ludovica_appointment_delete_targets as target
  where movement.appointment_id = target.appointment_id;

  delete from public.appointments as appointment
  using tmp_ludovica_appointment_delete_targets as target
  where appointment.id = target.appointment_id;

  get diagnostics v_deleted_appointments = row_count;

  update public.client_portals as portal
  set
    appuntamenti = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinality)
        from jsonb_array_elements(coalesce(portal.appuntamenti, '[]'::jsonb))
          with ordinality as item(value, ordinality)
        where not (
          item.value ->> 'data' = v_target_date::text
          and item.value ->> 'ora' = to_char(v_target_time, 'HH24:MI')
          and lower(coalesce(item.value ->> 'cliente', '')) like '%ludovica%'
        )
      ),
      '[]'::jsonb
    ),
    richieste_prenotazione = coalesce(
      (
        select jsonb_agg(
          case
            when item.value ->> 'data' = v_target_date::text
              and item.value ->> 'ora' = to_char(v_target_time, 'HH24:MI')
              and lower(concat_ws(' ', item.value ->> 'nome', item.value ->> 'cognome')) like '%ludovica%'
            then item.value
              || jsonb_build_object(
                'stato', 'Annullata',
                'cancellationSource', 'salone',
                'viewedBySalon', true,
                'viewedByCliente', false
              )
            else item.value
          end
          order by item.ordinality
        )
        from jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb))
          with ordinality as item(value, ordinality)
      ),
      '[]'::jsonb
    ),
    updated_at = timezone('utc', now())
  where exists (
    select 1
    from tmp_ludovica_appointment_delete_targets as target
    where target.workspace_id = portal.workspace_id
  );

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
            where not (
              item.value ->> 'data' = v_target_date::text
              and item.value ->> 'ora' = to_char(v_target_time, 'HH24:MI')
              and lower(coalesce(item.value ->> 'cliente', '')) like '%ludovica%'
            )
          ),
          '[]'::jsonb
        ),
        true
      ),
      '{richiestePrenotazione}',
      coalesce(
        (
          select jsonb_agg(
            case
              when item.value ->> 'data' = v_target_date::text
                and item.value ->> 'ora' = to_char(v_target_time, 'HH24:MI')
                and lower(concat_ws(' ', item.value ->> 'nome', item.value ->> 'cognome')) like '%ludovica%'
              then item.value
                || jsonb_build_object(
                  'stato', 'Annullata',
                  'cancellationSource', 'salone',
                  'viewedBySalon', true,
                  'viewedByCliente', false
                )
              else item.value
            end
            order by item.ordinality
          )
          from jsonb_array_elements(coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb))
            with ordinality as item(value, ordinality)
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = timezone('utc', now())
  where exists (
    select 1
    from tmp_ludovica_appointment_delete_targets as target
    where target.workspace_id = snapshot.workspace_id
  );

  perform pg_notify('pgrst', 'reload schema');
  raise notice 'Deleted Ludovica 2026-06-10 10:00 appointments: %, cancelled linked requests: %',
    v_deleted_appointments,
    v_updated_requests;
end $$;
