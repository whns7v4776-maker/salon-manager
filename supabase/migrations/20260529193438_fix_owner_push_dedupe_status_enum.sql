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
  v_booking_request_id text := nullif(
    trim(
      coalesce(
        p_payload ->> 'bookingRequestId',
        p_payload ->> 'requestId',
        ''
      )
    ),
    ''
  );
  v_appointment_id text := nullif(trim(coalesce(p_payload ->> 'appointmentId', '')), '');
  v_customer_name text := nullif(trim(coalesce(p_payload ->> 'customerName', '')), '');
  v_service_name text := nullif(trim(coalesce(p_payload ->> 'serviceName', '')), '');
  v_appointment_date text := nullif(trim(coalesce(p_payload ->> 'appointmentDate', '')), '');
  v_appointment_time text := nullif(trim(coalesce(p_payload ->> 'appointmentTime', '')), '');
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
  where device.id in (
    select latest_owner.id
    from public.push_devices as latest_owner
    where latest_owner.workspace_id = p_workspace_id
      and latest_owner.recipient_kind = 'owner'
      and latest_owner.audience = 'auth'
      and latest_owner.is_active = true
    order by latest_owner.last_seen_at desc nulls last,
      latest_owner.updated_at desc nulls last,
      latest_owner.created_at desc nulls last,
      latest_owner.id desc
    limit 1
  )
    and not exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = p_workspace_id
        and notification.event_type = p_event_type
        and notification.created_at >= timezone('utc', now()) - interval '5 minutes'
        and notification.status in ('queued', 'sent')
        and (
          (
            v_booking_request_id is not null
            and nullif(
              trim(
                coalesce(
                  notification.payload ->> 'bookingRequestId',
                  notification.payload ->> 'requestId',
                  ''
                )
              ),
              ''
            ) = v_booking_request_id
          )
          or (
            v_booking_request_id is null
            and v_appointment_id is not null
            and nullif(trim(coalesce(notification.payload ->> 'appointmentId', '')), '') = v_appointment_id
          )
          or (
            v_booking_request_id is null
            and v_appointment_id is null
            and coalesce(notification.title, '') = coalesce(p_title, '')
            and coalesce(notification.body, '') = coalesce(p_body, '')
            and nullif(trim(coalesce(notification.payload ->> 'customerName', '')), '') is not distinct from v_customer_name
            and nullif(trim(coalesce(notification.payload ->> 'serviceName', '')), '') is not distinct from v_service_name
            and nullif(trim(coalesce(notification.payload ->> 'appointmentDate', '')), '') is not distinct from v_appointment_date
            and nullif(trim(coalesce(notification.payload ->> 'appointmentTime', '')), '') is not distinct from v_appointment_time
          )
        )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
