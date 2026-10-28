alter table public.services
  add column if not exists required_role text;

update public.services as service
set required_role = source.required_role
from (
  select
    workspace.id as workspace_id,
    nullif(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', '')), '') as service_name,
    nullif(
      regexp_replace(
        trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')),
        '\s+',
        ' ',
        'g'
      ),
      ''
    ) as required_role
  from public.owner_app_snapshots snapshot
  join public.workspaces workspace
    on workspace.id = snapshot.workspace_id
  cross join lateral jsonb_array_elements(coalesce(snapshot.payload -> 'servizi', '[]'::jsonb)) as service_item
) as source
where service.workspace_id = source.workspace_id
  and lower(trim(service.name)) = lower(source.service_name)
  and source.required_role is not null
  and nullif(trim(coalesce(service.required_role, '')), '') is null;
