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
  v_device_id uuid;
  v_owner_email citext := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  if v_owner_email is null then
    raise exception 'owner_email_required';
  end if;

  update public.push_devices
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and recipient_kind = 'owner'
    and lower(trim(coalesce(owner_email::text, ''))) = v_owner_email::text
    and is_active = true
    and expo_push_token <> p_expo_push_token;

  insert into public.push_devices (
    workspace_id,
    owner_email,
    expo_push_token,
    platform,
    device_model,
    app_version,
    audience,
    recipient_kind,
    is_active,
    last_seen_at
  )
  values (
    p_workspace_id,
    v_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    'auth',
    'owner',
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
    customer_email = null,
    customer_phone = null,
    is_active = true,
    last_seen_at = timezone('utc', now())
  returning id into v_device_id;

  update public.push_devices
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and recipient_kind = 'owner'
    and lower(trim(coalesce(owner_email::text, ''))) = v_owner_email::text
    and id <> v_device_id
    and is_active = true;

  return v_device_id;
end;
$$;

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
  v_owner_email citext;
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

  v_owner_email := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
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
    v_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    case when v_recipient_kind = 'owner' then 'auth' else 'public' end,
    v_recipient_kind,
    case when v_recipient_kind = 'client' then v_customer_email else null end,
    case when v_recipient_kind = 'client' then v_customer_phone else null end,
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

  if v_recipient_kind = 'owner' then
    update public.push_devices
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where workspace_id = p_workspace_id
      and recipient_kind = 'owner'
      and id <> v_device_id
      and (
        v_owner_email is null
        or lower(trim(coalesce(owner_email::text, ''))) = v_owner_email::text
      )
      and is_active = true;
  elsif v_customer_email is not null or v_customer_phone is not null then
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
        and notification.status in ('queued', 'processing', 'sent')
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

create or replace function public.queue_public_owner_push(
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
begin
  return public.queue_workspace_push(
    p_workspace_id,
    p_event_type,
    p_title,
    p_body,
    p_payload
  );
end;
$$;

with ranked_owner_devices as (
  select
    device.id,
    row_number() over (
      partition by device.workspace_id, lower(trim(coalesce(device.owner_email::text, '')))
      order by
        case when device.audience = 'auth' then 0 else 1 end,
        device.is_active desc,
        device.last_seen_at desc nulls last,
        device.updated_at desc nulls last,
        device.created_at desc nulls last,
        device.id desc
    ) as device_rank
  from public.push_devices as device
  where device.recipient_kind = 'owner'
)
update public.push_devices as device
set
  is_active = (ranked.device_rank = 1),
  updated_at = timezone('utc', now())
from ranked_owner_devices as ranked
where device.id = ranked.id
  and device.is_active is distinct from (ranked.device_rank = 1);

create unique index if not exists push_devices_single_active_owner_idx
  on public.push_devices (workspace_id, (lower(trim(coalesce(owner_email::text, '')))))
  where recipient_kind = 'owner' and is_active = true;
