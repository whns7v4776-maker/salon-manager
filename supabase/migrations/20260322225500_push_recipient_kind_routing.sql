do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_devices'
      and column_name = 'recipient_kind'
  ) then
    alter table public.push_devices
      add column recipient_kind text not null default 'client'
      check (recipient_kind in ('owner', 'client'));
  end if;
end
$$;

update public.push_devices
set recipient_kind = case
  when audience = 'auth' then 'owner'
  else 'client'
end
where recipient_kind is null
   or recipient_kind not in ('owner', 'client')
   or (audience = 'auth' and recipient_kind <> 'owner');

create index if not exists push_devices_workspace_recipient_active_idx
  on public.push_devices (workspace_id, recipient_kind, is_active, last_seen_at desc);

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

create or replace function public.upsert_public_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null,
  p_recipient_kind text default 'client'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_recipient_kind text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  v_recipient_kind := lower(trim(coalesce(p_recipient_kind, 'client')));
  if v_recipient_kind not in ('owner', 'client') then
    v_recipient_kind := 'client';
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
    'public',
    v_recipient_kind,
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

create or replace function public.queue_workspace_push(
  p_workspace_id uuid,
  p_event_type public.push_event_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  select
    p_workspace_id,
    device.id,
    p_event_type,
    p_title,
    p_body,
    p_payload,
    'queued'
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and device.is_active = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.queue_public_workspace_push(
  p_workspace_id uuid,
  p_event_type public.push_event_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  select
    p_workspace_id,
    device.id,
    p_event_type,
    p_title,
    p_body,
    p_payload,
    'queued'
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.upsert_push_device(uuid, citext, text, public.store_platform, text, text) to authenticated;
grant execute on function public.upsert_public_push_device(uuid, citext, text, public.store_platform, text, text, text) to anon;
grant execute on function public.upsert_public_push_device(uuid, citext, text, public.store_platform, text, text, text) to authenticated;
grant execute on function public.queue_workspace_push(uuid, public.push_event_type, text, text, jsonb) to authenticated;
grant execute on function public.queue_public_workspace_push(uuid, public.push_event_type, text, text, jsonb) to anon;
grant execute on function public.queue_public_workspace_push(uuid, public.push_event_type, text, text, jsonb) to authenticated;
