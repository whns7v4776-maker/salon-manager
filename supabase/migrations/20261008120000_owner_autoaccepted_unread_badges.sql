-- Keep autoaccepted customer bookings unread until actual owner viewing.
CREATE OR REPLACE FUNCTION public.queue_owner_badge_refresh_after_auto_accept(p_workspace_id uuid, p_booking_request_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device record;
  v_unread_requests_count integer := 0;
  v_unread_clients_count integer := 0;
  v_badge_count integer := 0;
  v_inserted integer := 0;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  select device.id
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

  -- One logical booking has one unread badge, including autoaccepted bookings.
  -- Technical phases share a group; distinct bookings never collapse by name/time.
  with eligible as (
    select request.*,
      case when request.appointment_group_id is not null
        then 'group:' || request.appointment_group_id::text
        else 'id:' || request.id::text end as logical_key
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and (
        request.origin::text = 'frontend'
        or (request.status::text = 'cancelled' and coalesce(request.cancellation_source, '') in ('cliente', 'customer'))
        or (request.status::text = 'accepted' and request.operator_change_status = 'accepted')
        or (request.status::text = 'cancelled' and request.operator_change_status in ('rejected', 'expired'))
      )
  ), ranked as (
    select eligible.*,
      bool_and(coalesce(viewed_by_salon, false)) over (partition by logical_key) as logical_viewed,
      row_number() over (
        partition by logical_key
        order by coalesce(updated_at, created_at) desc nulls last,
          case
            when status::text = 'cancelled' and coalesce(cancellation_source, '') in ('cliente', 'customer') then 50
            when status::text in ('accepted', 'auto_accepted') then 40
            when status::text = 'pending' then 30
            when status::text = 'cancelled' then 15
            when status::text in ('declined', 'rejected') then 10
            else 0 end desc,
          id::text desc
      ) as logical_rank
    from eligible
  )
  select count(*) into v_unread_requests_count
  from ranked
  where logical_rank = 1 and not logical_viewed
    and (
      (status::text in ('pending', 'accepted', 'auto_accepted') and coalesce(operator_change_status, '') <> 'pending')
      or (status::text = 'cancelled' and (
        coalesce(cancellation_source, '') in ('cliente', 'customer')
        or coalesce(operator_change_status, '') in ('rejected', 'expired')
      ))
    );

  select count(*)
  into v_unread_clients_count
  from public.customers as customer
  where customer.workspace_id = p_workspace_id
    and coalesce(customer.viewed_by_salon, false) = false
    and customer.source = 'frontend';

  v_badge_count := greatest(v_unread_requests_count, 0) + greatest(v_unread_clients_count, 0);

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
$function$;

revoke all on function public.queue_owner_badge_refresh_after_auto_accept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.queue_owner_badge_refresh_after_auto_accept(uuid, uuid) to service_role;
