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
  v_booking_request_id text := nullif(trim(coalesce(p_payload ->> 'bookingRequestId', '')), '');
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
        and notification.device_id = device.id
        and notification.event_type = p_event_type
        and (
          v_booking_request_id <> ''
          and nullif(trim(coalesce(notification.payload ->> 'bookingRequestId', '')), '') = v_booking_request_id
        )
        and notification.created_at >= timezone('utc', now()) - interval '2 minutes'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- register_public_customer is maintained by newer customer-registration
-- migrations. Avoid replaying the outdated legacy definition here.

with ranked_owner_devices as (
  select
    device.id,
    row_number() over (
      partition by device.workspace_id
      order by device.is_active desc,
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
  is_active = case when ranked.device_rank = 1 then true else false end,
  updated_at = timezone('utc', now())
from ranked_owner_devices as ranked
where device.id = ranked.id
  and device.is_active is distinct from (ranked.device_rank = 1);

grant execute on function public.register_public_customer(text, text, text, text, text) to anon, authenticated;
