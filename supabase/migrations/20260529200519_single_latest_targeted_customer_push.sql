create or replace function public.queue_public_customer_push(
  p_workspace_id uuid,
  p_event_type public.push_event_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_customer_email citext;
  v_customer_phone text;
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

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  with matching_devices as (
    select
      device.id,
      row_number() over (
        order by
          device.is_active desc,
          device.last_seen_at desc nulls last,
          device.updated_at desc nulls last,
          device.created_at desc nulls last,
          device.id desc
      ) as device_rank
    from public.push_devices as device
    where device.workspace_id = p_workspace_id
      and device.recipient_kind = 'client'
      and device.is_active = true
      and (
        (v_customer_email is not null and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  ),
  disabled_duplicates as (
    update public.push_devices as device
    set
      is_active = false,
      updated_at = timezone('utc', now())
    from matching_devices as matched
    where device.id = matched.id
      and matched.device_rank > 1
    returning device.id
  )
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
    select matched.id
    from matching_devices as matched
    where matched.device_rank = 1
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

with ranked_client_devices as (
  select
    device.id,
    row_number() over (
      partition by
        device.workspace_id,
        lower(trim(coalesce(device.customer_email::text, ''))),
        regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g')
      order by
        device.is_active desc,
        device.last_seen_at desc nulls last,
        device.updated_at desc nulls last,
        device.created_at desc nulls last,
        device.id desc
    ) as device_rank
  from public.push_devices as device
  where device.recipient_kind = 'client'
    and device.is_active = true
    and (
      nullif(lower(trim(coalesce(device.customer_email::text, ''))), '') is not null
      or nullif(regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g'), '') is not null
    )
)
update public.push_devices as device
set
  is_active = false,
  updated_at = timezone('utc', now())
from ranked_client_devices as ranked
where device.id = ranked.id
  and ranked.device_rank > 1;

with duplicate_queued_customer_pushes as (
  select
    notification.id,
    row_number() over (
      partition by
        notification.workspace_id,
        notification.event_type,
        coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', ''),
        coalesce(notification.payload ->> 'appointmentId', ''),
        coalesce(notification.payload ->> 'appointmentDate', ''),
        coalesce(notification.payload ->> 'appointmentTime', ''),
        coalesce(notification.payload ->> 'customerName', ''),
        coalesce(notification.payload ->> 'serviceName', ''),
        coalesce(notification.title, ''),
        coalesce(notification.body, '')
      order by notification.created_at desc, notification.id desc
    ) as push_rank
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
  where notification.status = 'queued'
    and device.recipient_kind = 'client'
)
delete from public.push_notifications as notification
using duplicate_queued_customer_pushes as duplicate
where notification.id = duplicate.id
  and duplicate.push_rank > 1;
