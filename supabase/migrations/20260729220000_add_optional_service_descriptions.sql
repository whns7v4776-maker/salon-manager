alter table public.services
  add column if not exists description text;

update public.services as service
set description = source.description
from (
  select
    snapshot.workspace_id,
    nullif(trim(coalesce(service_item ->> 'id', '')), '') as service_id,
    nullif(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', '')), '') as service_name,
    nullif(
      left(
        trim(
          coalesce(
            service_item ->> 'descrizione',
            service_item ->> 'description',
            ''
          )
        ),
        300
      ),
      ''
    ) as description
  from public.owner_app_snapshots as snapshot
  cross join lateral jsonb_array_elements(
    coalesce(snapshot.payload -> 'servizi', '[]'::jsonb)
  ) as service_item
) as source
where service.workspace_id = source.workspace_id
  and (
    service.id::text = source.service_id
    or (
      source.service_id is null
      and lower(trim(service.name)) = lower(source.service_name)
    )
  )
  and source.description is not null
  and nullif(trim(coalesce(service.description, '')), '') is null;

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
          'durataMinuti', service.duration_minutes,
          'mestiereRichiesto', coalesce(service.required_role, '')
        )
        order by coalesce(matched.position, 2147483647), service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select
          existing_item as item,
          existing_position as position
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
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;
