alter table public.push_devices
  add column if not exists owner_badge_count integer not null default 0,
  add column if not exists owner_badge_synced_at timestamptz;

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
  return v_updated;
end;
$$;

grant execute on function public.sync_owner_push_badge_count(uuid, integer) to authenticated;
