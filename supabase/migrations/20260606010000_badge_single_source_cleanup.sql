drop table if exists public.owner_push_badge_event_ledger;

create or replace function public.sync_owner_push_badge_count(
  p_workspace_id uuid,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
  end if;

  update public.push_devices as device
  set
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'owner'
    and device.audience = 'auth'
    and device.is_active = true;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.sync_owner_push_badge_count(uuid, integer) to authenticated;

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
