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
    trim(coalesce(p_payload ->> 'bookingRequestId', p_payload ->> 'requestId', '')),
    ''
  );
  v_appointment_id text := nullif(trim(coalesce(p_payload ->> 'appointmentId', '')), '');
  v_customer_name text := nullif(trim(coalesce(p_payload ->> 'customerName', '')), '');
  v_service_name text := nullif(trim(coalesce(p_payload ->> 'serviceName', '')), '');
  v_appointment_date text := nullif(trim(coalesce(p_payload ->> 'appointmentDate', '')), '');
  v_appointment_time text := nullif(trim(coalesce(p_payload ->> 'appointmentTime', '')), '');
  v_status_code text := lower(nullif(trim(coalesce(p_payload ->> 'statusCode', p_payload ->> 'status', '')), ''));
  v_cancellation_source text := lower(nullif(trim(coalesce(p_payload ->> 'cancellationSource', '')), ''));
  v_dedupe_key text := lower(nullif(trim(coalesce(p_payload ->> '_dedupeKey', '')), ''));
begin
  if p_workspace_id is null then
    return 0;
  end if;

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  with matching_devices as (
    select
      device.id,
      row_number() over (
        order by
          case
            when v_customer_email is not null
              and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text
            then 0
            else 1
          end,
          device.last_seen_at desc nulls last,
          device.updated_at desc nulls last,
          device.created_at desc nulls last,
          device.id desc
      ) as device_rank
    from public.push_devices as device
    where device.workspace_id = p_workspace_id
      and device.recipient_kind = 'client'
      and device.is_active = true
      and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null
      and (
        (
          v_customer_email is not null
          and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text
        )
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        )
      )
  ),
  single_workspace_fallback as (
    select device.id, 1 as device_rank
    from public.push_devices as device
    where not exists (select 1 from matching_devices)
      and device.workspace_id = p_workspace_id
      and device.recipient_kind = 'client'
      and device.is_active = true
      and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null
      and (
        nullif(lower(trim(coalesce(device.customer_email::text, ''))), '') is null
        and nullif(right(regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g'), 10), '') is null
      )
      and (
        select count(*)
        from public.push_devices as candidate
        where candidate.workspace_id = p_workspace_id
          and candidate.recipient_kind = 'client'
          and candidate.is_active = true
          and nullif(trim(coalesce(candidate.expo_push_token, '')), '') is not null
      ) = 1
    order by device.last_seen_at desc nulls last,
      device.updated_at desc nulls last,
      device.created_at desc nulls last,
      device.id desc
    limit 1
  ),
  target_devices as (
    select id from matching_devices where device_rank = 1
    union
    select id from single_workspace_fallback where device_rank = 1
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
    target.id,
    p_event_type,
    p_title,
    p_body,
    p_payload,
    'queued'
  from target_devices as target
  where not exists (
    select 1
    from public.push_notifications as notification
    where notification.workspace_id = p_workspace_id
      and notification.device_id = target.id
      and notification.status in ('queued', 'processing', 'sent')
      and (
        notification.event_type = p_event_type
        or (
          p_event_type in (
            'booking_request_status_changed'::public.push_event_type,
            'appointment_cancelled'::public.push_event_type,
            'custom'::public.push_event_type
          )
          and notification.event_type in (
            'booking_request_status_changed'::public.push_event_type,
            'appointment_cancelled'::public.push_event_type,
            'custom'::public.push_event_type
          )
        )
      )
      and (
        (
          v_dedupe_key is not null
          and lower(trim(coalesce(notification.payload ->> '_dedupeKey', ''))) = v_dedupe_key
        )
        or (
          v_booking_request_id is not null
          and nullif(trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', '')), '') = v_booking_request_id
          and lower(nullif(trim(coalesce(notification.payload ->> 'statusCode', notification.payload ->> 'status', '')), '')) is not distinct from v_status_code
          and lower(nullif(trim(coalesce(notification.payload ->> 'cancellationSource', '')), '')) is not distinct from v_cancellation_source
        )
        or (
          v_booking_request_id is null
          and v_appointment_id is not null
          and nullif(trim(coalesce(notification.payload ->> 'appointmentId', '')), '') = v_appointment_id
          and lower(nullif(trim(coalesce(notification.payload ->> 'statusCode', notification.payload ->> 'status', '')), '')) is not distinct from v_status_code
          and lower(nullif(trim(coalesce(notification.payload ->> 'cancellationSource', '')), '')) is not distinct from v_cancellation_source
        )
        or (
          v_booking_request_id is null
          and v_appointment_id is null
          and v_dedupe_key is null
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

grant execute on function public.queue_public_customer_push(
  uuid,
  public.push_event_type,
  text,
  text,
  jsonb,
  citext,
  text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
