alter table public.push_devices
  drop constraint if exists push_devices_expo_push_token_key;

alter table public.push_devices
  drop constraint if exists push_devices_workspace_id_expo_push_token_key;

create unique index if not exists push_devices_owner_token_identity_idx
  on public.push_devices (
    workspace_id,
    expo_push_token,
    lower(trim(coalesce(owner_email::text, '')))
  )
  where recipient_kind = 'owner';

create unique index if not exists push_devices_client_token_identity_idx
  on public.push_devices (
    workspace_id,
    expo_push_token,
    coalesce(lower(trim(customer_email::text)), ''),
    coalesce(right(regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g'), 10), '')
  )
  where recipient_kind = 'client';

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
  v_owner_email citext := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  if v_owner_email is null then
    raise exception 'owner_email_required';
  end if;

  update public.push_devices
  set
    workspace_id = p_workspace_id,
    owner_email = v_owner_email,
    expo_push_token = p_expo_push_token,
    platform = p_platform,
    device_model = p_device_model,
    app_version = p_app_version,
    audience = 'auth',
    recipient_kind = 'owner',
    customer_email = null,
    customer_phone = null,
    is_active = true,
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and expo_push_token = p_expo_push_token
    and recipient_kind = 'owner'
    and lower(trim(coalesce(owner_email::text, ''))) = v_owner_email::text
  returning id into v_device_id;

  if v_device_id is null then
    insert into public.push_devices (
      workspace_id,
      owner_email,
      expo_push_token,
      platform,
      device_model,
      app_version,
      audience,
      recipient_kind,
      customer_email,
      customer_phone,
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
      null,
      null,
      true,
      timezone('utc', now())
    )
    returning id into v_device_id;
  end if;

  update public.push_devices
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and recipient_kind = 'owner'
    and lower(trim(coalesce(owner_email::text, ''))) = v_owner_email::text
    and id <> v_device_id
    and is_active = true;

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
  p_recipient_kind text default 'client',
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_recipient_kind text;
  v_owner_email citext;
  v_customer_email citext;
  v_customer_phone text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  v_recipient_kind := lower(trim(coalesce(p_recipient_kind, 'client')));
  if v_recipient_kind not in ('owner', 'client') then
    v_recipient_kind := 'client';
  end if;

  v_owner_email := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  update public.push_devices
  set
    workspace_id = p_workspace_id,
    owner_email = v_owner_email,
    expo_push_token = p_expo_push_token,
    platform = p_platform,
    device_model = p_device_model,
    app_version = p_app_version,
    audience = case when v_recipient_kind = 'owner' then 'auth' else 'public' end,
    recipient_kind = v_recipient_kind,
    customer_email = case when v_recipient_kind = 'client' then v_customer_email else null end,
    customer_phone = case when v_recipient_kind = 'client' then v_customer_phone else null end,
    is_active = true,
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and expo_push_token = p_expo_push_token
    and recipient_kind = v_recipient_kind
    and (
      (
        v_recipient_kind = 'owner'
        and lower(trim(coalesce(owner_email::text, ''))) = coalesce(v_owner_email::text, '')
      )
      or (
        v_recipient_kind = 'client'
        and coalesce(lower(trim(customer_email::text)), '') = coalesce(v_customer_email::text, '')
        and coalesce(right(regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g'), 10), '') =
          coalesce(v_customer_phone, '')
      )
    )
  returning id into v_device_id;

  if v_device_id is null then
    insert into public.push_devices (
      workspace_id,
      owner_email,
      expo_push_token,
      platform,
      device_model,
      app_version,
      audience,
      recipient_kind,
      customer_email,
      customer_phone,
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
      case when v_recipient_kind = 'owner' then 'auth' else 'public' end,
      v_recipient_kind,
      case when v_recipient_kind = 'client' then v_customer_email else null end,
      case when v_recipient_kind = 'client' then v_customer_phone else null end,
      true,
      timezone('utc', now())
    )
    returning id into v_device_id;
  end if;

  return v_device_id;
end;
$$;
