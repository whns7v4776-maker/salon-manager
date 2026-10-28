do $$
declare
  v_queued integer;
  v_processing integer;
  v_failed integer;
  v_sent_recent integer;
  v_client_devices integer;
begin
  select count(*)
    into v_queued
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
  where notification.created_at >= timezone('utc', now()) - interval '12 hours'
    and notification.status = 'queued'
    and device.recipient_kind = 'client';

  select count(*)
    into v_processing
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
  where notification.created_at >= timezone('utc', now()) - interval '12 hours'
    and notification.status = 'processing'
    and device.recipient_kind = 'client';

  select count(*)
    into v_failed
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
  where notification.created_at >= timezone('utc', now()) - interval '12 hours'
    and notification.status = 'failed'
    and device.recipient_kind = 'client';

  select count(*)
    into v_sent_recent
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
  where notification.created_at >= timezone('utc', now()) - interval '12 hours'
    and notification.status = 'sent'
    and device.recipient_kind = 'client';

  select count(*)
    into v_client_devices
  from public.push_devices
  where recipient_kind = 'client'
    and is_active = true
    and expo_push_token is not null
    and expo_push_token <> '';

  raise notice 'CLIENT_PUSH_QUEUE_AFTER_FIX active_client_devices=% queued=% processing=% failed=% sent_recent=%',
    v_client_devices,
    v_queued,
    v_processing,
    v_failed,
    v_sent_recent;
end $$;
