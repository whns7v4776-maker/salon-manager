do $$
declare
  v_row record;
begin
  for v_row in
    select
      'client_portals.appuntamenti' as source,
      portal.salon_code as salon_code,
      item.value as payload
    from public.client_portals as portal,
      jsonb_array_elements(coalesce(portal.appuntamenti, '[]'::jsonb)) as item(value)
    where (item.value ->> 'data')::text = '2026-06-10'
      and (
        lower(coalesce(item.value ->> 'cliente', '')) like '%ludovica%'
        or lower(coalesce(item.value ->> 'servizio', '')) like '%ludovica%'
      )
    union all
    select
      'client_portals.richieste' as source,
      portal.salon_code as salon_code,
      item.value as payload
    from public.client_portals as portal,
      jsonb_array_elements(coalesce(portal.richieste_prenotazione, '[]'::jsonb)) as item(value)
    where (item.value ->> 'data')::text = '2026-06-10'
      and (
        lower(concat_ws(' ', item.value ->> 'nome', item.value ->> 'cognome')) like '%ludovica%'
        or lower(coalesce(item.value ->> 'servizio', '')) like '%ludovica%'
      )
    union all
    select
      'owner_app_snapshots.appuntamenti' as source,
      workspace.slug as salon_code,
      item.value as payload
    from public.owner_app_snapshots as snapshot
    join public.workspaces as workspace on workspace.id = snapshot.workspace_id,
      jsonb_array_elements(coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb)) as item(value)
    where (item.value ->> 'data')::text = '2026-06-10'
      and (
        lower(coalesce(item.value ->> 'cliente', '')) like '%ludovica%'
        or lower(coalesce(item.value ->> 'servizio', '')) like '%ludovica%'
      )
    union all
    select
      'owner_app_snapshots.richieste' as source,
      workspace.slug as salon_code,
      item.value as payload
    from public.owner_app_snapshots as snapshot
    join public.workspaces as workspace on workspace.id = snapshot.workspace_id,
      jsonb_array_elements(coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)) as item(value)
    where (item.value ->> 'data')::text = '2026-06-10'
      and (
        lower(concat_ws(' ', item.value ->> 'nome', item.value ->> 'cognome')) like '%ludovica%'
        or lower(coalesce(item.value ->> 'servizio', '')) like '%ludovica%'
      )
  loop
    raise notice 'LUDOVICA_DIAG source=% salon=% payload=%',
      v_row.source,
      v_row.salon_code,
      v_row.payload::text;
  end loop;
end $$;
