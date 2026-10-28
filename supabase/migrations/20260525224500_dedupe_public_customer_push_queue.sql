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
  v_customer_email citext;
  v_customer_phone text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  v_recipient_kind := lower(trim(coalesce(p_recipient_kind, 'client')));
  if v_recipient_kind not in ('owner', 'client') then
    v_recipient_kind := 'client';
  end if;

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

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
  )
  values (
    p_workspace_id,
    lower(trim(p_owner_email::text))::citext,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    'public',
    v_recipient_kind,
    v_customer_email,
    v_customer_phone,
    true,
    timezone('utc', now())
  )
  on conflict (expo_push_token)
  do update set
    workspace_id = excluded.workspace_id,
    owner_email = excluded.owner_email,
    platform = excluded.platform,
    device_model = excluded.device_model,
    app_version = excluded.app_version,
    audience = excluded.audience,
    recipient_kind = excluded.recipient_kind,
    customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone,
    is_active = true,
    last_seen_at = timezone('utc', now())
  returning id into v_device_id;

  if v_recipient_kind = 'client' and (v_customer_email is not null or v_customer_phone is not null) then
    update public.push_devices
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where workspace_id = p_workspace_id
      and recipient_kind = 'client'
      and id <> v_device_id
      and (
        (v_customer_email is not null and lower(trim(coalesce(customer_email::text, ''))) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      );
  end if;

  return v_device_id;
end;
$$;

create or replace function public.queue_public_workspace_push(
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
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true
    and not exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = p_workspace_id
        and notification.device_id = device.id
        and notification.event_type = p_event_type
        and notification.created_at >= timezone('utc', now()) - interval '5 minutes'
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
    and device.recipient_kind = 'client'
    and device.is_active = true
    and (
      (v_customer_email is not null and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
    and not exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = p_workspace_id
        and notification.device_id = device.id
        and notification.event_type = p_event_type
        and notification.created_at >= timezone('utc', now()) - interval '5 minutes'
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
