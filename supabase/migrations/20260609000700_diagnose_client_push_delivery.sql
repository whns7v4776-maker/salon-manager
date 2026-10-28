do $$
declare
  v_workspace_id uuid;
  v_client_devices integer := 0;
  v_identified_client_devices integer := 0;
  v_recent_client_pushes integer := 0;
  v_recent_unread_statuses integer := 0;
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = 'marzio-dcom'
  limit 1;

  select count(*)
  into v_client_devices
  from public.push_devices as device
  where device.workspace_id = v_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true
    and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null;

  select count(*)
  into v_identified_client_devices
  from public.push_devices as device
  where device.workspace_id = v_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true
    and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null
    and (
      nullif(lower(trim(coalesce(device.customer_email::text, ''))), '') is not null
      or nullif(right(regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g'), 10), '') is not null
    );

  select count(*)
  into v_recent_client_pushes
  from public.push_notifications as notification
  join public.push_devices as device on device.id = notification.device_id
  where notification.workspace_id = v_workspace_id
    and device.recipient_kind = 'client'
    and notification.created_at >= timezone('utc', now()) - interval '12 hours';

  select count(*)
  into v_recent_unread_statuses
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.origin = 'frontend'
    and request.viewed_by_customer = false
    and request.status in ('accepted'::public.request_status, 'rejected'::public.request_status, 'cancelled'::public.request_status)
    and not (request.status = 'cancelled'::public.request_status and coalesce(request.cancellation_source, '') = 'cliente')
    and request.updated_at >= timezone('utc', now()) - interval '12 hours';

  raise notice 'CLIENT_PUSH_DIAG workspace=% active_client_devices=% identified_client_devices=% recent_client_pushes=% recent_unread_statuses=%',
    v_workspace_id,
    v_client_devices,
    v_identified_client_devices,
    v_recent_client_pushes,
    v_recent_unread_statuses;
end $$;
