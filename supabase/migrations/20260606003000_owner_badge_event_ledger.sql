create table if not exists public.owner_push_badge_event_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  booking_request_id text not null,
  event_kind text not null,
  counted_at timestamptz not null default timezone('utc', now()),
  unique (device_id, booking_request_id, event_kind)
);

create index if not exists owner_push_badge_event_ledger_workspace_idx
  on public.owner_push_badge_event_ledger (workspace_id, counted_at desc);

alter table public.owner_push_badge_event_ledger enable row level security;

drop policy if exists "owner push badge ledger service only" on public.owner_push_badge_event_ledger;
create policy "owner push badge ledger service only"
on public.owner_push_badge_event_ledger
for all
using (false)
with check (false);

create or replace function public.sync_owner_push_badge_count(
  p_workspace_id uuid,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := greatest(coalesce(p_count, 0), 0);
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  update public.push_devices as device
  set
    owner_badge_count = v_count,
    owner_badge_synced_at = timezone('utc', now()),
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and device.audience = 'auth'
    and device.is_active = true;

  get diagnostics v_updated = row_count;

  delete from public.owner_push_badge_event_ledger as ledger
  using public.push_devices as device
  where ledger.workspace_id = p_workspace_id
    and ledger.device_id = device.id
    and device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and device.audience = 'auth'
    and device.is_active = true;

  return v_updated;
end;
$$;

grant execute on function public.sync_owner_push_badge_count(uuid, integer) to authenticated;
