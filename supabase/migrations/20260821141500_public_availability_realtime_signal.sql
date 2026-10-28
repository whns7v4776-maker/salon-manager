-- Client portals contain private salon data and must not be exposed through
-- Realtime. Publish a minimal revision signal instead; clients receive only
-- the salon code and a timestamp, then reload authoritative settings via RPC.

create table if not exists public.public_availability_revisions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  salon_code text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists public_availability_revisions_salon_code_idx
  on public.public_availability_revisions (lower(salon_code));

alter table public.public_availability_revisions enable row level security;
grant select on public.public_availability_revisions to anon, authenticated;
revoke insert, update, delete on public.public_availability_revisions
  from anon, authenticated;

drop policy if exists "public availability revision read"
  on public.public_availability_revisions;
create policy "public availability revision read"
on public.public_availability_revisions for select
using (true);

create or replace function public.touch_public_availability_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.public_availability_revisions (
    workspace_id,
    salon_code,
    updated_at
  ) values (
    new.workspace_id,
    lower(trim(new.salon_code)),
    timezone('utc', now())
  )
  on conflict (workspace_id) do update set
    salon_code = excluded.salon_code,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function public.touch_public_availability_revision_v1()
  from public, anon, authenticated;

drop trigger if exists client_portal_touch_public_availability_revision
  on public.client_portals;
create trigger client_portal_touch_public_availability_revision
after insert or update of availability_settings on public.client_portals
for each row execute function public.touch_public_availability_revision_v1();

insert into public.public_availability_revisions (
  workspace_id,
  salon_code,
  updated_at
)
select
  portal.workspace_id,
  lower(trim(portal.salon_code)),
  coalesce(portal.updated_at, timezone('utc', now()))
from public.client_portals as portal
on conflict (workspace_id) do update set
  salon_code = excluded.salon_code,
  updated_at = excluded.updated_at;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'public_availability_revisions'
  ) then
    alter publication supabase_realtime
      add table public.public_availability_revisions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
