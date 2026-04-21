create or replace function public.upsert_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  insert into public.push_devices (
    workspace_id,
    owner_email,
    expo_push_token,
    platform,
    device_model,
    app_version,
    audience,
    recipient_kind,
    is_active,
    last_seen_at
  )
  values (
    p_workspace_id,
    lower(trim(p_owner_email::text))::citext,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    'auth',
    'owner',
    true,
    timezone('utc', now())
  )
  on conflict (expo_push_token)
  do update set
    workspace_id = excluded.workspace_id,
    owner_email = excluded.owner_email,
    platform = excluded.platform,
    device_model = excluded.device_model,
    app_version = excluded.app_version,
    audience = excluded.audience,
    recipient_kind = excluded.recipient_kind,
    is_active = true,
    last_seen_at = timezone('utc', now())
  returning id into v_device_id;

  return v_device_id;
end;
$$;

with recent_owner_devices as (
  select
    device.id,
    row_number() over (
      partition by device.workspace_id, lower(trim(device.owner_email::text))
      order by device.last_seen_at desc, device.updated_at desc, device.created_at desc, device.id desc
    ) as device_rank
  from public.push_devices as device
  where device.recipient_kind = 'owner'
    and device.last_seen_at >= timezone('utc', now()) - interval '14 days'
)
update public.push_devices as device
set
  is_active = true,
  updated_at = timezone('utc', now())
from recent_owner_devices as recent
where device.id = recent.id
  and recent.device_rank <= 3
  and device.is_active = false;
