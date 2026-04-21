with recovered_services as (
  select
    portal.workspace_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            'recovered-' ||
            substr(md5(service_item.service_name), 1, 12),
          'nome', service_item.service_name,
          'prezzo', service_item.price,
          'durataMinuti', service_item.duration_minutes,
          'mestiereRichiesto', service_item.required_role
        )
        order by lower(service_item.service_name)
      ),
      '[]'::jsonb
    ) as servizi
  from public.client_portals as portal
  cross join lateral (
    select
      source.service_name,
      max(source.price) as price,
      max(source.duration_minutes) as duration_minutes,
      coalesce(
        max(source.required_role) filter (where source.required_role <> ''),
        ''
      ) as required_role
    from (
      select
        trim(coalesce(item ->> 'servizio', item ->> 'service_name', item ->> 'requested_service_name', '')) as service_name,
        case
          when coalesce(item ->> 'prezzo', item ->> 'price', item ->> 'requested_price', '') ~ '^-?\d+(\.\d+)?$'
            then (coalesce(item ->> 'prezzo', item ->> 'price', item ->> 'requested_price'))::numeric
          else 0::numeric
        end as price,
        case
          when coalesce(item ->> 'durataMinuti', item ->> 'duration_minutes', item ->> 'requested_duration_minutes', '') ~ '^\d+$'
            then (coalesce(item ->> 'durataMinuti', item ->> 'duration_minutes', item ->> 'requested_duration_minutes'))::integer
          else 60
        end as duration_minutes,
        trim(
          coalesce(
            item ->> 'mestiereRichiesto',
            item ->> 'required_role',
            case
              when coalesce(item ->> 'operatoreId', item ->> 'operator_id', item ->> 'requested_operator_id', '') like 'salon-capacity::%'
                then split_part(coalesce(item ->> 'operatoreId', item ->> 'operator_id', item ->> 'requested_operator_id', ''), '::', 2)
              else ''
            end
          )
        ) as required_role
      from jsonb_array_elements(
        coalesce(portal.appuntamenti, '[]'::jsonb) ||
        coalesce(portal.richieste_prenotazione, '[]'::jsonb)
      ) as item
    ) as source
    where source.service_name <> ''
    group by source.service_name
  ) as service_item
  where coalesce(jsonb_array_length(portal.servizi), 0) = 0
  group by portal.workspace_id
)
update public.client_portals as portal
set
  servizi = recovered_services.servizi,
  updated_at = timezone('utc', now())
from recovered_services
where portal.workspace_id = recovered_services.workspace_id
  and coalesce(jsonb_array_length(portal.servizi), 0) = 0
  and coalesce(jsonb_array_length(recovered_services.servizi), 0) > 0;
