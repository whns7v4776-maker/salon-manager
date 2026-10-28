alter table public.services
  add column if not exists client_badge text,
  add column if not exists client_role_display_order integer not null default 0,
  add column if not exists client_display_order integer not null default 0;

with distinct_roles as (
  select distinct
    workspace_id,
    lower(
      coalesce(
        nullif(regexp_replace(btrim(required_role), '\s+', ' ', 'g'), ''),
        '__senza_mestiere__'
      )
    ) as role_key
  from public.services
),
ranked_roles as (
  select
    workspace_id,
    role_key,
    dense_rank() over (
      partition by workspace_id
      order by role_key
    ) - 1 as role_position
  from distinct_roles
),
ranked_services as (
  select
    service.id,
    role.role_position,
    row_number() over (
      partition by
        service.workspace_id,
        lower(
          coalesce(
            nullif(regexp_replace(btrim(service.required_role), '\s+', ' ', 'g'), ''),
            '__senza_mestiere__'
          )
        )
      order by lower(service.name), service.name, service.created_at, service.id
    ) - 1 as service_position
  from public.services as service
  join ranked_roles as role
    on role.workspace_id = service.workspace_id
   and role.role_key = lower(
     coalesce(
       nullif(regexp_replace(btrim(service.required_role), '\s+', ' ', 'g'), ''),
       '__senza_mestiere__'
     )
   )
)
update public.services as service
set
  client_role_display_order = ranked.role_position,
  client_display_order = ranked.service_position
from ranked_services as ranked
where ranked.id = service.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_client_badge_length_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_client_badge_length_check
      check (client_badge is null or char_length(btrim(client_badge)) between 1 and 48);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_client_role_display_order_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_client_role_display_order_check
      check (client_role_display_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_client_display_order_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_client_display_order_check
      check (client_display_order >= 0);
  end if;
end
$$;

create index if not exists services_workspace_client_catalog_order_idx
  on public.services (
    workspace_id,
    client_role_display_order,
    required_role,
    client_display_order,
    created_at,
    id
  );

notify pgrst, 'reload schema';
