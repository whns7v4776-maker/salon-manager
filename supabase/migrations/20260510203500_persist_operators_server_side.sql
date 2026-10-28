create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  required_role text,
  photo_uri text,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists operators_workspace_name_idx
  on public.operators (workspace_id, lower(name));

alter table public.operators enable row level security;

drop policy if exists "workspace data select" on public.operators;
create policy "workspace data select"
on public.operators
for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.operators;
create policy "workspace data insert"
on public.operators
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.operators;
create policy "workspace data update"
on public.operators
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.operators;
create policy "workspace data delete"
on public.operators
for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

with portal_operators as (
  select
    portal.workspace_id,
    operator_item
  from public.client_portals as portal
  cross join lateral jsonb_array_elements(coalesce(portal.operatori, '[]'::jsonb)) as operator_item
),
snapshot_operators as (
  select
    snapshot.workspace_id,
    operator_item
  from public.owner_app_snapshots as snapshot
  cross join lateral jsonb_array_elements(coalesce(snapshot.payload -> 'operatori', '[]'::jsonb)) as operator_item
),
combined_operators as (
  select * from portal_operators
  union all
  select * from snapshot_operators
),
normalized_operators as (
  select distinct on (
    workspace_id,
    lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')))
  )
    coalesce(
      case
        when trim(coalesce(operator_item ->> 'id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then trim(operator_item ->> 'id')::uuid
        else null
      end,
      gen_random_uuid()
    ) as id,
    workspace_id,
    trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')) as name,
    nullif(trim(coalesce(operator_item ->> 'mestiere', operator_item ->> 'required_role', '')), '') as required_role,
    nullif(trim(coalesce(operator_item ->> 'fotoUri', operator_item ->> 'photo_uri', '')), '') as photo_uri,
    coalesce(operator_item -> 'availability', '{}'::jsonb) as availability
  from combined_operators
  where trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')) <> ''
  order by
    workspace_id,
    lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', ''))),
    case when nullif(trim(coalesce(operator_item ->> 'id', '')), '') is not null then 0 else 1 end,
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
on conflict (id)
do update set
  name = excluded.name,
  required_role = excluded.required_role,
  photo_uri = excluded.photo_uri,
  availability = excluded.availability,
  updated_at = timezone('utc', now());
