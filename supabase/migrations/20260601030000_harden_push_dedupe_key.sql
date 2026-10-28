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
  v_dedupe_key text := nullif(trim(coalesce(p_payload ->> '_dedupeKey', '')), '');
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
        and notification.status in ('queued', 'processing', 'sent')
        and (
          (
            v_dedupe_key is not null
            and notification.created_at >= timezone('utc', now()) - interval '24 hours'
            and nullif(trim(coalesce(notification.payload ->> '_dedupeKey', '')), '') = v_dedupe_key
          )
          or (
            v_dedupe_key is null
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

create or replace function public.claim_push_notifications(p_limit integer default 50)
returns table (
  notification_id uuid,
  expo_push_token text,
  title text,
  body text,
  payload jsonb
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select
      notification.id,
      notification.workspace_id,
      notification.event_type,
      notification.title,
      notification.body,
      notification.payload,
      notification.created_at,
      device.expo_push_token,
      coalesce(
        nullif(lower(trim(coalesce(notification.payload ->> '_dedupeKey', ''))), ''),
        concat_ws('|',
          notification.workspace_id::text,
          notification.event_type::text,
          lower(trim(coalesce(notification.payload ->> '_pushTarget', ''))),
          lower(trim(coalesce(notification.payload ->> '_pushAudience', ''))),
          lower(trim(coalesce(notification.payload ->> '_pushEventType', notification.payload ->> 'type', ''))),
          lower(trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentId', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentDate', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentTime', ''))),
          lower(trim(coalesce(notification.payload ->> 'customerName', ''))),
          lower(trim(coalesce(notification.payload ->> 'serviceName', ''))),
          lower(trim(coalesce(notification.payload ->> 'statusCode', notification.payload ->> 'status', ''))),
          lower(trim(coalesce(notification.title, ''))),
          lower(trim(coalesce(notification.body, '')))
        )
      ) as logical_key
    from public.push_notifications as notification
    join public.push_devices as device
      on device.id = notification.device_id
    where notification.status = 'queued'
      and device.is_active = true
      and device.expo_push_token is not null
      and device.expo_push_token <> ''
    order by notification.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) * 3
    for update of notification skip locked
  ),
  ranked as (
    select
      candidates.*,
      row_number() over (
        partition by candidates.logical_key
        order by candidates.created_at asc, candidates.id asc
      ) as logical_rank
    from candidates
  ),
  suppressed_duplicates as (
    update public.push_notifications as notification
    set status = 'sent',
        sent_at = coalesce(notification.sent_at, timezone('utc', now())),
        updated_at = timezone('utc', now()),
        last_error = null
    from ranked
    where notification.id = ranked.id
      and ranked.logical_rank > 1
      and notification.status = 'queued'
    returning notification.id
  ),
  selected as (
    select *
    from ranked
    where logical_rank = 1
    order by created_at asc, id asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ),
  claimed as (
    update public.push_notifications as notification
    set attempts = notification.attempts + 1,
        status = 'sent',
        sent_at = coalesce(notification.sent_at, timezone('utc', now())),
        updated_at = timezone('utc', now()),
        last_error = null
    from selected
    where notification.id = selected.id
      and notification.status = 'queued'
    returning
      selected.id as notification_id,
      selected.expo_push_token,
      selected.title,
      selected.body,
      selected.payload
  )
  select * from claimed;
$$;

with recent as (
  select
    notification.id,
    row_number() over (
      partition by coalesce(
        nullif(lower(trim(coalesce(notification.payload ->> '_dedupeKey', ''))), ''),
        concat_ws('|',
          notification.workspace_id::text,
          notification.event_type::text,
          lower(trim(coalesce(notification.payload ->> '_pushTarget', ''))),
          lower(trim(coalesce(notification.payload ->> '_pushAudience', ''))),
          lower(trim(coalesce(notification.payload ->> '_pushEventType', notification.payload ->> 'type', ''))),
          lower(trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentId', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentDate', ''))),
          lower(trim(coalesce(notification.payload ->> 'appointmentTime', ''))),
          lower(trim(coalesce(notification.payload ->> 'customerName', ''))),
          lower(trim(coalesce(notification.payload ->> 'serviceName', ''))),
          lower(trim(coalesce(notification.payload ->> 'statusCode', notification.payload ->> 'status', ''))),
          lower(trim(coalesce(notification.title, ''))),
          lower(trim(coalesce(notification.body, '')))
        )
      )
      order by notification.created_at asc, notification.id asc
    ) as logical_rank
  from public.push_notifications as notification
  where notification.status = 'queued'
    and notification.created_at > timezone('utc', now()) - interval '24 hours'
)
update public.push_notifications as notification
set status = 'sent',
    sent_at = coalesce(notification.sent_at, timezone('utc', now())),
    updated_at = timezone('utc', now()),
    last_error = null
from recent
where notification.id = recent.id
  and recent.logical_rank > 1
  and notification.status = 'queued';
