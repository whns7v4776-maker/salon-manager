-- A physical Expo token belongs to exactly one active SalonPro identity.
-- Switching between owner and client (or between client accounts) must make
-- the most recently registered identity the only push recipient on that device.

with ranked_active_devices as (
  select
    device.id,
    row_number() over (
      partition by device.expo_push_token
      order by
        device.last_seen_at desc nulls last,
        device.updated_at desc nulls last,
        device.created_at desc nulls last,
        device.id desc
    ) as active_rank
  from public.push_devices as device
  where device.is_active = true
    and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null
)
update public.push_devices as device
set
  is_active = false,
  updated_at = timezone('utc', now())
from ranked_active_devices as ranked
where device.id = ranked.id
  and ranked.active_rank > 1;

-- A notification queued for an identity that just lost the device must never
-- be delivered later if that old identity is selected again.
update public.push_notifications as notification
set
  status = 'failed',
  updated_at = timezone('utc', now()),
  last_error = 'device identity replaced before Expo send'
from public.push_devices as inactive_device
where notification.device_id = inactive_device.id
  and notification.status = 'queued'
  and inactive_device.is_active = false
  and exists (
    select 1
    from public.push_devices as active_device
    where active_device.expo_push_token = inactive_device.expo_push_token
      and active_device.is_active = true
  );

create unique index if not exists push_devices_one_active_identity_per_token_idx
  on public.push_devices (expo_push_token)
  where is_active = true;

create or replace function public.deactivate_other_push_identities_for_token_v1(
  p_expo_push_token text,
  p_keep_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_devices as device
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where device.expo_push_token = p_expo_push_token
    and device.id is distinct from p_keep_device_id
    and device.is_active = true;

  update public.push_notifications as notification
  set
    status = 'failed',
    updated_at = timezone('utc', now()),
    last_error = 'device identity replaced before Expo send'
  from public.push_devices as device
  where notification.device_id = device.id
    and device.expo_push_token = p_expo_push_token
    and device.id is distinct from p_keep_device_id
    and device.is_active = false
    and notification.status = 'queued';
end;
$$;

revoke all on function public.deactivate_other_push_identities_for_token_v1(text, uuid)
  from public, anon, authenticated;

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

  if nullif(trim(coalesce(p_expo_push_token, '')), '') is null then
    raise exception 'expo_push_token_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_expo_push_token, 0));

  select device.id
  into v_device_id
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.expo_push_token = p_expo_push_token
    and device.recipient_kind = 'owner'
    and lower(trim(coalesce(device.owner_email::text, ''))) = v_owner_email::text
  order by device.last_seen_at desc nulls last, device.updated_at desc nulls last, device.id desc
  limit 1;

  perform public.deactivate_other_push_identities_for_token_v1(
    p_expo_push_token,
    v_device_id
  );

  update public.push_devices as device
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and lower(trim(coalesce(device.owner_email::text, ''))) = v_owner_email::text
    and device.id is distinct from v_device_id
    and device.is_active = true;

  update public.push_notifications as notification
  set
    status = 'failed',
    updated_at = timezone('utc', now()),
    last_error = 'owner moved to another device before Expo send'
  from public.push_devices as device
  where notification.device_id = device.id
    and device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and lower(trim(coalesce(device.owner_email::text, ''))) = v_owner_email::text
    and device.id is distinct from v_device_id
    and device.is_active = false
    and notification.status = 'queued';

  if v_device_id is not null then
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
    where id = v_device_id;
  else
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
    ) values (
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

  if nullif(trim(coalesce(p_expo_push_token, '')), '') is null then
    raise exception 'expo_push_token_required';
  end if;

  v_recipient_kind := lower(trim(coalesce(p_recipient_kind, 'client')));
  if v_recipient_kind not in ('owner', 'client') then
    v_recipient_kind := 'client';
  end if;

  v_owner_email := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );

  if v_recipient_kind = 'owner' and v_owner_email is null then
    raise exception 'owner_email_required';
  end if;

  if v_recipient_kind = 'client' and v_customer_email is null and v_customer_phone is null then
    raise exception 'customer_identity_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_expo_push_token, 0));

  select device.id
  into v_device_id
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.expo_push_token = p_expo_push_token
    and device.recipient_kind = v_recipient_kind
    and (
      (
        v_recipient_kind = 'owner'
        and lower(trim(coalesce(device.owner_email::text, ''))) = coalesce(v_owner_email::text, '')
      )
      or (
        v_recipient_kind = 'client'
        and coalesce(lower(trim(device.customer_email::text)), '') = coalesce(v_customer_email::text, '')
        and coalesce(
          right(regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g'), 10),
          ''
        ) = coalesce(v_customer_phone, '')
      )
    )
  order by device.last_seen_at desc nulls last, device.updated_at desc nulls last, device.id desc
  limit 1;

  perform public.deactivate_other_push_identities_for_token_v1(
    p_expo_push_token,
    v_device_id
  );

  if v_recipient_kind = 'owner' then
    update public.push_devices as device
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where device.workspace_id = p_workspace_id
      and device.recipient_kind = 'owner'
      and lower(trim(coalesce(device.owner_email::text, ''))) = v_owner_email::text
      and device.id is distinct from v_device_id
      and device.is_active = true;
  end if;

  if v_device_id is not null then
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
    where id = v_device_id;
  else
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
    ) values (
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

grant execute on function public.upsert_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) to authenticated;

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  citext,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
