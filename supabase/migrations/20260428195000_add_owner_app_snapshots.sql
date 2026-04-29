create table if not exists public.owner_app_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_updated_at_owner_app_snapshots on public.owner_app_snapshots;
create trigger set_updated_at_owner_app_snapshots
before update on public.owner_app_snapshots
for each row execute procedure public.set_updated_at();

alter table public.owner_app_snapshots enable row level security;

drop policy if exists "owner_app_snapshots select own workspace" on public.owner_app_snapshots;
create policy "owner_app_snapshots select own workspace"
on public.owner_app_snapshots
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "owner_app_snapshots mutate own workspace" on public.owner_app_snapshots;
create policy "owner_app_snapshots mutate own workspace"
on public.owner_app_snapshots
for all
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
