alter table public.push_devices
  add column if not exists client_badge_count integer not null default 0,
  add column if not exists client_badge_synced_at timestamptz;

create or replace function public.sync_client_push_badge_count(
  p_workspace_id uuid,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_count integer default 0
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_count integer := greatest(coalesce(p_count, 0), 0);
  v_updated integer := 0;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'customer_identity_required';
  end if;

  update public.push_devices as device
  set
    client_badge_count = v_count,
    client_badge_synced_at = timezone('utc', now()),
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true
    and (
      (v_customer_email is not null and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text)
      or (v_customer_phone is not null and regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g') = v_customer_phone)
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.sync_client_push_badge_count(uuid, citext, text, integer) to anon;
grant execute on function public.sync_client_push_badge_count(uuid, citext, text, integer) to authenticated;
