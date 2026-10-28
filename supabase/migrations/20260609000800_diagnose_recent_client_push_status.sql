do $$
declare
  v_row record;
begin
  for v_row in
    select
      notification.id,
      notification.status,
      notification.event_type,
      notification.created_at,
      notification.sent_at,
      notification.last_error,
      notification.title,
      notification.body,
      notification.payload
    from public.push_notifications as notification
    join public.push_devices as device on device.id = notification.device_id
    join public.workspaces as workspace on workspace.id = notification.workspace_id
    where workspace.slug = 'marzio-dcom'
      and device.recipient_kind = 'client'
      and notification.created_at >= timezone('utc', now()) - interval '12 hours'
    order by notification.created_at desc
    limit 10
  loop
    raise notice 'CLIENT_PUSH_STATUS id=% status=% event=% created=% sent=% error=% title=% body=% payload=%',
      v_row.id,
      v_row.status,
      v_row.event_type,
      v_row.created_at,
      v_row.sent_at,
      coalesce(v_row.last_error, ''),
      coalesce(v_row.title, ''),
      coalesce(v_row.body, ''),
      v_row.payload::text;
  end loop;
end $$;
