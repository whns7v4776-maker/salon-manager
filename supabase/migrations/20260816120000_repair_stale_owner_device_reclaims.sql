-- Repair tokens already reclaimed by the legacy 30-second owner refresh.
-- The owner row can have a newer last_seen_at than the client row even though
-- the actual owner authentication happened before the client login.

do $$
declare
  v_candidate record;
begin
  for v_candidate in
    select distinct on (active_owner.expo_push_token)
      active_owner.expo_push_token,
      client_device.id as client_device_id
    from public.push_devices as active_owner
    join auth.users as owner_user
      on lower(trim(owner_user.email)) = lower(trim(active_owner.owner_email::text))
    join lateral (
      select candidate_client.*
      from public.push_devices as candidate_client
      where candidate_client.expo_push_token = active_owner.expo_push_token
        and candidate_client.recipient_kind = 'client'
        and candidate_client.last_seen_at > owner_user.last_sign_in_at
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
      last_error = 'stale owner device reclaim repaired before Expo send'
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
