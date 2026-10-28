create or replace function public.queue_owner_badge_refresh_after_auto_accept(
  p_workspace_id uuid,
  p_booking_request_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device record;
  v_unread_requests_count integer := 0;
  v_badge_count integer := 0;
  v_inserted integer := 0;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  select
    device.id,
    device.last_seen_at
  into v_device
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and device.audience = 'auth'
    and device.is_active = true
    and nullif(trim(coalesce(device.expo_push_token, '')), '') is not null
  order by device.last_seen_at desc nulls last,
    device.updated_at desc nulls last,
    device.created_at desc nulls last,
    device.id desc
  limit 1;

  if v_device.id is null then
    return 0;
  end if;

  with canonical_requests as (
    select distinct on (
      lower(trim(coalesce(booking_request.appointment_date::text, ''))),
      lower(trim(coalesce(booking_request.appointment_time::text, ''))),
      lower(regexp_replace(trim(coalesce(booking_request.requested_service_name, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, ''))), '\s+', ' ', 'g'))
    )
      booking_request.status,
      booking_request.cancellation_source,
      coalesce(booking_request.viewed_by_salon, false) as viewed_by_salon
    from public.booking_requests as booking_request
    where booking_request.workspace_id = p_workspace_id
      and (
        booking_request.origin = 'frontend'
        or (
          booking_request.status = 'cancelled'
          and coalesce(booking_request.cancellation_source, '') = 'cliente'
        )
      )
    order by
      lower(trim(coalesce(booking_request.appointment_date::text, ''))),
      lower(trim(coalesce(booking_request.appointment_time::text, ''))),
      lower(regexp_replace(trim(coalesce(booking_request.requested_service_name, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, ''))), '\s+', ' ', 'g')),
      case
        when booking_request.status = 'cancelled' and coalesce(booking_request.cancellation_source, '') = 'cliente' then 50
        when booking_request.status = 'accepted' then 40
        when booking_request.status = 'pending' then 30
        when booking_request.status in ('declined', 'rejected') then 10
        else 0
      end desc,
      booking_request.created_at desc nulls last,
      booking_request.id desc
  )
  select count(*)
  into v_unread_requests_count
  from canonical_requests
  where viewed_by_salon = false
    and (
      status = 'pending'
      or (
        status = 'cancelled'
        and coalesce(cancellation_source, '') = 'cliente'
      )
    );

  v_badge_count := greatest(v_unread_requests_count, 0);

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  values (
    p_workspace_id,
    v_device.id,
    'custom',
    '',
    '',
    jsonb_build_object(
      'type', 'owner_badge_refresh',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'owner_badge_refresh',
      '_badgeOnly', true,
      '_dedupeKey', concat_ws('|', p_workspace_id::text, 'owner_badge_refresh_after_auto_accept', coalesce(p_booking_request_id::text, 'no-request'), v_badge_count::text),
      'bookingRequestId', p_booking_request_id,
      'badgeCount', v_badge_count
    ),
    'queued'
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.queue_owner_badge_refresh_after_auto_accept(uuid, uuid) to service_role;
