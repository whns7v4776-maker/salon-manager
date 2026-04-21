delete from public.customers
where id = '61523512-2674-473e-8976-b6684e716acc'
   or (
    workspace_id = 'c3e6bd83-aed6-4a2f-b3a7-b88a82ec8f98'
    and lower(trim(coalesce(full_name, ''))) = 'codex verifica 1717'
    and lower(trim(coalesce(email::text, ''))) = 'codex.verifica.1717@example.com'
  );

update public.client_portals as portal
set clienti = coalesce(
  (
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as item
    where not (
      nullif(trim(coalesce(item ->> 'id', '')), '') = '61523512-2674-473e-8976-b6684e716acc'
      or lower(trim(coalesce(item ->> 'nome', ''))) = 'codex verifica 1717'
      or lower(trim(coalesce(item ->> 'email', ''))) = 'codex.verifica.1717@example.com'
      or regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g') = '390171700001'
    )
  ),
  '[]'::jsonb
),
updated_at = timezone('utc', now())
where portal.workspace_id = 'c3e6bd83-aed6-4a2f-b3a7-b88a82ec8f98';
