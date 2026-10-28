create table if not exists public.customer_deletion_tombstones (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, normalized_name)
);

create unique index if not exists customer_deletion_tombstones_workspace_customer_id_idx
  on public.customer_deletion_tombstones (workspace_id, customer_id)
  where customer_id is not null;

alter table public.customer_deletion_tombstones enable row level security;
revoke all on table public.customer_deletion_tombstones from anon, authenticated;

create or replace function public.filter_deleted_snapshot_customers(
  p_workspace_id uuid,
  p_clienti jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_clienti, '[]'::jsonb)) = 'array'
        then coalesce(p_clienti, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) with ordinality as entry(value, ordinality)
  where not exists (
    select 1
    from public.customer_deletion_tombstones as tombstone
    where tombstone.workspace_id = p_workspace_id
      and (
        (
          tombstone.customer_id is not null
          and coalesce(entry.value ->> 'id', '') = tombstone.customer_id::text
        )
        or tombstone.normalized_name = lower(
          regexp_replace(
            btrim(
              coalesce(
                entry.value ->> 'nome',
                entry.value ->> 'full_name',
                entry.value ->> 'name',
                ''
              )
            ),
            '\s+',
            ' ',
            'g'
          )
        )
      )
  );
$$;

revoke all on function public.filter_deleted_snapshot_customers(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.guard_owner_snapshot_deleted_customers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.payload := jsonb_set(
    coalesce(new.payload, '{}'::jsonb),
    '{clienti}',
    public.filter_deleted_snapshot_customers(
      new.workspace_id,
      coalesce(new.payload -> 'clienti', '[]'::jsonb)
    ),
    true
  );
  return new;
end;
$$;

create or replace function public.guard_client_portal_deleted_customers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.clienti := public.filter_deleted_snapshot_customers(
    new.workspace_id,
    coalesce(new.clienti, '[]'::jsonb)
  );
  return new;
end;
$$;

drop trigger if exists guard_owner_snapshot_deleted_customers
  on public.owner_app_snapshots;
create trigger guard_owner_snapshot_deleted_customers
before insert or update of payload on public.owner_app_snapshots
for each row
execute function public.guard_owner_snapshot_deleted_customers();

drop trigger if exists guard_client_portal_deleted_customers
  on public.client_portals;
create trigger guard_client_portal_deleted_customers
before insert or update of clienti on public.client_portals
for each row
execute function public.guard_client_portal_deleted_customers();

insert into public.customer_deletion_tombstones (
  workspace_id,
  customer_id,
  normalized_name
)
values
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '3a86b4e4-d2c3-4321-924f-def1978418c5', 'alessandro rossi'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '95f8c6b3-842a-4297-912e-6f900a04c74d', 'anna manzi'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'a87a017b-0194-42b3-8995-e7542f0e5fdc', 'antonella cravino'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'ead2e165-08c0-4713-8852-0edb526b9bf9', 'antonio romeo'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '20d3daa7-f35d-484e-ad09-66dc5501f7d3', 'carmela mottola'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'e54c1e93-7753-4b1c-b523-c87a93a55ffd', 'lucia ilacqua'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '25933cec-b4fa-4707-b04f-c0cb5d507c6b', 'ludovica mangione'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'b30356e9-f127-48a5-9f12-feb4f68e752f', 'marzio viola'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'c85fc822-4ce9-402a-9d92-22dacb2d2046', 'patrizia dettori'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '6cdd3019-1f8b-4241-8e94-d031d37c5401', 'placido ilacqua'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '294553d7-b8b6-48cf-bb6d-8a1519f1c4c1', 'roberta michisanti'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '6de73f73-e457-40de-8811-0d40b83c4176', 'stefano marotta')
on conflict (workspace_id, normalized_name)
do update set customer_id = excluded.customer_id;

update public.owner_app_snapshots as snapshot
set payload = jsonb_set(
  coalesce(snapshot.payload, '{}'::jsonb),
  '{clienti}',
  public.filter_deleted_snapshot_customers(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'clienti', '[]'::jsonb)
  ),
  true
)
where snapshot.workspace_id = 'd84f3211-d20f-45a3-9d7f-f551400690fd';

update public.client_portals as portal
set clienti = public.filter_deleted_snapshot_customers(
  portal.workspace_id,
  coalesce(portal.clienti, '[]'::jsonb)
)
where portal.workspace_id = 'd84f3211-d20f-45a3-9d7f-f551400690fd';
