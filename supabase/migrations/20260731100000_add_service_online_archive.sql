alter table public.services
  add column if not exists is_online boolean not null default true;

comment on column public.services.is_online is
  'True when the service is visible and bookable in the public client catalog; false keeps it archived for the salon.';

create index if not exists services_workspace_online_catalog_order_idx
  on public.services (
    workspace_id,
    is_online,
    client_role_display_order,
    required_role,
    client_display_order,
    created_at,
    id
  );

create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'descrizione', coalesce(service.description, ''),
          'prezzo', service.price,
          'prezzoOriginale', service.original_price,
          'scontoAttivo', service.discount_enabled,
          'scontoValidoDal', service.discount_valid_from,
          'scontoValidoAl', service.discount_valid_to,
          'scontoOraDalle',
            case
              when service.discount_start_time is null then null
              else to_char(service.discount_start_time, 'HH24:MI')
            end,
          'scontoOraAlle',
            case
              when service.discount_end_time is null then null
              else to_char(service.discount_end_time, 'HH24:MI')
            end,
          'durataMinuti', service.duration_minutes,
          'mestiereRichiesto', coalesce(service.required_role, ''),
          'badgeCliente', coalesce(service.client_badge, ''),
          'ordineMestiereCliente', service.client_role_display_order,
          'ordineCliente', service.client_display_order,
          'disponibileOnline', true
        )
        order by
          service.client_role_display_order,
          service.required_role,
          service.client_display_order,
          service.updated_at desc,
          service.created_at desc
      )
      from public.services as service
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(
          coalesce(portal.servizi, '[]'::jsonb)
        ) with ordinality as existing(existing_item, existing_position)
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
        and service.is_online = true
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

notify pgrst, 'reload schema';
