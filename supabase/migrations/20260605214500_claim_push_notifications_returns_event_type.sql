drop function if exists public.claim_push_notifications(integer);

create or replace function public.claim_push_notifications(p_limit integer default 50)
returns table (
  notification_id uuid,
  expo_push_token text,
  event_type public.push_event_type,
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
          lower(trim(coalesce(notification.payload ->> '_pushEventType', notification.payload ->> 'type', notification.event_type::text, ''))),
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
      selected.event_type,
      selected.title,
      selected.body,
      selected.payload
  )
  select * from claimed;
$$;
