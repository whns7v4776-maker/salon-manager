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
declare
  v_count integer;
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
    and device.recipient_kind = 'owner'
    and device.is_active = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.queue_public_owner_push(uuid, public.push_event_type, text, text, jsonb) to anon;
grant execute on function public.queue_public_owner_push(uuid, public.push_event_type, text, text, jsonb) to authenticated;
