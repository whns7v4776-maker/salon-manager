-- Older native builds refreshed an authenticated owner token even while the
-- user was browsing the client frontend. If a client identity claimed the
-- device after that owner login, the stale owner session must not reclaim it.
-- A genuinely newer owner sign-in is still allowed and becomes the new winner.

alter function public.upsert_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) rename to upsert_push_device_owner_claim_v1;

revoke all on function public.upsert_push_device_owner_claim_v1(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) from public, anon, authenticated;

create function public.upsert_push_device(
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
  v_active_client_seen_at timestamptz;
  v_owner_last_sign_in_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(trim(coalesce(p_expo_push_token, '')), '') is null then
    raise exception 'expo_push_token_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_expo_push_token, 0));

  select auth_user.last_sign_in_at
  into v_owner_last_sign_in_at
  from auth.users as auth_user
  where auth_user.id = auth.uid();

  select device.id, device.last_seen_at
  into v_active_client_device_id, v_active_client_seen_at
  from public.push_devices as device
  where device.expo_push_token = p_expo_push_token
    and device.recipient_kind = 'client'
    and device.is_active = true
  order by device.last_seen_at desc nulls last, device.updated_at desc nulls last, device.id desc
  limit 1;

  if v_active_client_device_id is not null
    and coalesce(v_owner_last_sign_in_at, '-infinity'::timestamptz)
      <= coalesce(v_active_client_seen_at, 'infinity'::timestamptz)
  then
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

grant execute on function public.upsert_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';
