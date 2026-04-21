create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_backend_services boolean;
begin
  select exists(
    select 1
    from public.services as service
    where service.workspace_id = p_workspace_id
  )
  into v_has_backend_services;

  if not coalesce(v_has_backend_services, false) then
    return;
  end if;

  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'prezzo', service.price,
          'durataMinuti', service.duration_minutes
        )
        order by coalesce(matched.position, 2147483647), service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select
          existing_item as item,
          existing_position as position
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb)) with ordinality as existing(existing_item, existing_position)
        where (
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
        ) or (
          lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
        )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0
            else 1
          end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
    ),
    portal.servizi,
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;
