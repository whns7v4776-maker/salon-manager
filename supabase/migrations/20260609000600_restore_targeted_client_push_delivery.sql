alter table public.push_devices
  add column if not exists customer_email citext;

alter table public.push_devices
  add column if not exists customer_phone text;

create index if not exists push_devices_workspace_customer_target_idx
  on public.push_devices (
    workspace_id,
    recipient_kind,
    customer_email,
    customer_phone,
    is_active,
    last_seen_at desc
  );

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
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

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
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  returning id into v_device_id;

  return v_device_id;
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
    trim(coalesce(p_payload ->> 'bookingRequestId', p_payload ->> 'requestId', '')),
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
      and notification.event_type = p_event_type
      and notification.created_at >= timezone('utc', now()) - interval '5 minutes'
      and notification.status in ('queued', 'processing', 'sent')
      and (
        (
          v_booking_request_id is not null
          and nullif(trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', '')), '') = v_booking_request_id
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

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  citext,
  text
) to anon, authenticated;

grant execute on function public.queue_public_customer_push(
  uuid,
  public.push_event_type,
  text,
  text,
  jsonb,
  citext,
  text
) to anon, authenticated, service_role;

do $$
declare
  v_row record;
  v_payload jsonb;
  v_title text;
  v_body text;
  v_inserted integer := 0;
begin
  for v_row in
    select *
    from public.booking_requests as request
    where request.origin = 'frontend'
      and request.viewed_by_customer = false
      and request.status in ('accepted'::public.request_status, 'rejected'::public.request_status, 'cancelled'::public.request_status)
      and not (request.status = 'cancelled'::public.request_status and coalesce(request.cancellation_source, '') = 'cliente')
      and request.updated_at >= timezone('utc', now()) - interval '12 hours'
    order by request.updated_at desc
    limit 100
  loop
    v_title := case
      when v_row.status = 'accepted'::public.request_status then 'Prenotazione confermata'
      when v_row.status = 'rejected'::public.request_status then 'Prenotazione rifiutata'
      else 'Prenotazione annullata'
    end;
    v_body := concat_ws(
      '. ',
      nullif('Servizio: ' || trim(coalesce(v_row.requested_service_name, '')), 'Servizio: '),
      case
        when v_row.appointment_date is not null and v_row.appointment_time is not null
        then 'Data: ' || to_char(v_row.appointment_date, 'DD/MM/YYYY') || ' alle ' || to_char(v_row.appointment_time, 'HH24:MI')
        else null
      end
    ) || '.';
    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      '_pushAudience', 'public',
      '_pushTarget', 'client',
      '_pushEventType', 'booking_request_status_changed',
      '_dedupeKey', concat_ws('|', v_row.workspace_id::text, 'client_status_requeue', v_row.id::text, v_row.status::text, coalesce(v_row.cancellation_source, '')),
      'bookingRequestId', v_row.id,
      'status', case
        when v_row.status = 'accepted'::public.request_status then 'Accettata'
        when v_row.status = 'rejected'::public.request_status then 'Rifiutata'
        else 'Annullata'
      end,
      'statusCode', v_row.status::text,
      'cancellationSource', coalesce(v_row.cancellation_source, ''),
      'appointmentDate', v_row.appointment_date,
      'appointmentTime', v_row.appointment_time,
      'customerName', trim(concat_ws(' ', coalesce(v_row.customer_name, ''), coalesce(v_row.customer_surname, ''))),
      'serviceName', v_row.requested_service_name,
      'customerEmail', coalesce(v_row.customer_email::text, ''),
      'customerPhone', coalesce(v_row.customer_phone, '')
    );

    v_inserted := v_inserted + public.queue_public_customer_push(
      v_row.workspace_id,
      'booking_request_status_changed',
      v_title,
      v_body,
      v_payload,
      v_row.customer_email,
      v_row.customer_phone
    );
  end loop;

  raise notice 'Requeued recent client status pushes: %', v_inserted;
end $$;

notify pgrst, 'reload schema';
