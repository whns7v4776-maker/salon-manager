-- An old native build cannot prove that an owner refresh came from a real
-- backoffice login rather than its legacy background timer. When a client
-- currently owns the token, the legacy RPC therefore keeps the client active.
-- New builds use claim_owner_push_device_v2 only from a real owner route.

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
  v_active_client_device_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(trim(coalesce(p_expo_push_token, '')), '') is null then
    raise exception 'expo_push_token_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_expo_push_token, 0));

  select device.id
  into v_active_client_device_id
  from public.push_devices as device
  where device.expo_push_token = p_expo_push_token
    and device.recipient_kind = 'client'
    and device.is_active = true
  order by device.last_seen_at desc nulls last, device.updated_at desc nulls last, device.id desc
  limit 1;

  if v_active_client_device_id is not null then
    return v_active_client_device_id;
  end if;

  return public.upsert_push_device_owner_claim_v1(
    p_workspace_id,
    p_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version
  );
end;
$$;

create or replace function public.claim_owner_push_device_v2(
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
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  return public.upsert_push_device_owner_claim_v1(
    p_workspace_id,
    p_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version
  );
end;
$$;

revoke all on function public.claim_owner_push_device_v2(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) from public, anon;

grant execute on function public.upsert_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) to authenticated;

grant execute on function public.claim_owner_push_device_v2(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) to authenticated;

-- Prefer client safety for tokens already refreshed by the legacy owner timer.
-- A client row seen after the owner token was originally created proves that
-- the device entered a client account after that owner association.
do $$
declare
  v_candidate record;
begin
  for v_candidate in
    select distinct on (active_owner.expo_push_token)
      active_owner.expo_push_token,
      client_device.id as client_device_id
    from public.push_devices as active_owner
    join lateral (
      select candidate_client.*
      from public.push_devices as candidate_client
      where candidate_client.expo_push_token = active_owner.expo_push_token
        and candidate_client.recipient_kind = 'client'
        and candidate_client.last_seen_at > active_owner.created_at
      order by
        candidate_client.last_seen_at desc nulls last,
        candidate_client.updated_at desc nulls last,
        candidate_client.id desc
      limit 1
    ) as client_device on true
    where active_owner.recipient_kind = 'owner'
      and active_owner.is_active = true
    order by
      active_owner.expo_push_token,
      client_device.last_seen_at desc nulls last,
      client_device.id desc
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_candidate.expo_push_token, 0));

    update public.push_devices as device
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where device.expo_push_token = v_candidate.expo_push_token
      and device.id <> v_candidate.client_device_id
      and device.is_active = true;

    update public.push_notifications as notification
    set
      status = 'failed',
      updated_at = timezone('utc', now()),
      last_error = 'legacy owner refresh replaced by newer client identity'
    from public.push_devices as device
    where notification.device_id = device.id
      and device.expo_push_token = v_candidate.expo_push_token
      and device.id <> v_candidate.client_device_id
      and device.is_active = false
      and notification.status = 'queued';

    update public.push_devices
    set
      is_active = true,
      updated_at = timezone('utc', now())
    where id = v_candidate.client_device_id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
