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
  v_owner_email citext := lower(trim(p_owner_email::text))::citext;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  update public.push_devices
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and recipient_kind = 'owner'
    and lower(trim(owner_email::text)) = v_owner_email::text
    and expo_push_token <> p_expo_push_token
    and is_active = true;

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
    v_owner_email,
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
