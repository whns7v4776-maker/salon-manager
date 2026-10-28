with source_operators as (
  select
    portal.workspace_id,
    operator_item,
    0 as source_priority
  from public.client_portals as portal
  cross join lateral jsonb_array_elements(
    coalesce(portal.operatori, '[]'::jsonb)
  ) as operator_item

  union all

  select
    snapshot.workspace_id,
    operator_item,
    1 as source_priority
  from public.owner_app_snapshots as snapshot
  cross join lateral jsonb_array_elements(
    coalesce(snapshot.payload -> 'operatori', '[]'::jsonb)
  ) as operator_item
),
normalized_operators as (
  select distinct on (
    workspace_id,
    lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')))
  )
    coalesce(
      case
        when trim(coalesce(operator_item ->> 'id', '')) ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then trim(operator_item ->> 'id')::uuid
        else null
      end,
      gen_random_uuid()
    ) as id,
    workspace_id,
    trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')) as name,
    nullif(
      trim(coalesce(operator_item ->> 'mestiere', operator_item ->> 'required_role', '')),
      ''
    ) as required_role,
    nullif(
      trim(coalesce(operator_item ->> 'fotoUri', operator_item ->> 'photo_uri', '')),
      ''
    ) as photo_uri,
    coalesce(operator_item -> 'availability', '{}'::jsonb) as availability
  from source_operators
  where trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')) <> ''
  order by
    workspace_id,
    lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', ''))),
    source_priority,
    case when operator_item ? 'availability' then 0 else 1 end
)
insert into public.operators (
  id,
  workspace_id,
  name,
  required_role,
  photo_uri,
  availability
)
select
  id,
  workspace_id,
  name,
  required_role,
  photo_uri,
  availability
from normalized_operators
on conflict (workspace_id, lower(name))
do update set
  required_role = coalesce(excluded.required_role, public.operators.required_role),
  photo_uri = coalesce(excluded.photo_uri, public.operators.photo_uri),
  availability = case
    when excluded.availability = '{}'::jsonb then public.operators.availability
    else excluded.availability
  end,
  updated_at = timezone('utc', now());
