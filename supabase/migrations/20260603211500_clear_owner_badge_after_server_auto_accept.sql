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

  select count(*)
  into v_badge_count
  from public.push_notifications as notification
  left join public.booking_requests as booking_request
    on nullif(trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', '')), '') = booking_request.id::text
  where notification.workspace_id = p_workspace_id
    and notification.device_id = v_device.id
    and notification.status in ('queued', 'sent')
    and notification.created_at > coalesce(v_device.last_seen_at, '-infinity'::timestamptz)
    and coalesce(notification.payload ->> '_badgeOnly', 'false') <> 'true'
    and (
      (
        notification.event_type = 'booking_request_created'
        and booking_request.id is not null
        and booking_request.status = 'pending'
        and coalesce(booking_request.viewed_by_salon, false) = false
      )
      or notification.event_type in ('booking_request_status_changed', 'appointment_cancelled')
      or notification.event_type = 'custom'
    );

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
      'badgeCount', greatest(v_badge_count, 0)
    ),
    'queued'
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.queue_owner_badge_refresh_after_auto_accept(uuid, uuid) to service_role;

create or replace function public.process_due_auto_accept_booking_requests(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select
      booking_request.id,
      booking_request.workspace_id
    from public.booking_requests as booking_request
    join public.workspaces as workspace
      on workspace.id = booking_request.workspace_id
    where booking_request.origin = 'frontend'
      and booking_request.status = 'pending'
      and coalesce(workspace.auto_accept_booking_requests, false) = true
      and booking_request.created_at <= v_now - interval '15 seconds'
    order by booking_request.created_at asc, booking_request.id asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update of booking_request skip locked
  loop
    begin
      perform public.update_owner_booking_request_status_core(
        v_row.workspace_id,
        v_row.id,
        'accepted'::public.request_status
      );
      perform public.queue_owner_badge_refresh_after_auto_accept(v_row.workspace_id, v_row.id);
      v_processed := v_processed + 1;
    exception
      when others then
        if position('booking_request_conflict' in SQLERRM) > 0 then
          null;
        elsif position('booking_request_not_found' in SQLERRM) > 0 then
          null;
        else
          raise notice 'process_due_auto_accept_booking_requests failed for %: %', v_row.id, SQLERRM;
        end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception
  when others then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer) to authenticated;
grant execute on function public.process_due_auto_accept_booking_requests(integer) to service_role;

notify pgrst, 'reload schema';
