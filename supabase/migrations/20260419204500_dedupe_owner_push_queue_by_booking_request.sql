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
  v_booking_request_id text := nullif(trim(coalesce(p_payload ->> 'bookingRequestId', '')), '');
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
    and device.is_active = true
    and not exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = p_workspace_id
        and notification.device_id = device.id
        and notification.event_type = p_event_type
        and (
          v_booking_request_id <> ''
          and nullif(trim(coalesce(notification.payload ->> 'bookingRequestId', '')), '') = v_booking_request_id
        )
        and notification.created_at >= timezone('utc', now()) - interval '2 minutes'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
