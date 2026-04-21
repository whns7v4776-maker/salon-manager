with ranked_owner_devices as (
  select
    device.id,
    row_number() over (
      partition by device.workspace_id, lower(trim(device.owner_email::text))
      order by device.is_active desc, device.last_seen_at desc, device.updated_at desc, device.created_at desc, device.id desc
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
  and (
    device.is_active is distinct from (ranked.device_rank = 1)
  );
