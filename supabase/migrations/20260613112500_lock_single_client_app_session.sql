alter table public.customers
  add column if not exists active_client_app_instance_id text,
  add column if not exists active_client_platform public.store_platform,
  add column if not exists active_client_claimed_at timestamptz,
  add column if not exists active_client_last_seen_at timestamptz;

create or replace function public.claim_public_customer_app_session(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_app_instance_id text default null,
  p_platform public.store_platform default 'manual',
  p_stale_after_seconds integer default 90
)
returns table(ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_existing_instance_id text;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10);
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 90), 60);
begin
  if v_salon_code = '' then
    raise exception 'salon_code_required';
  end if;

  if v_customer_email is null and nullif(v_customer_phone, '') is null then
    raise exception 'customer_identity_required';
  end if;

  if nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    raise exception 'app_instance_required';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = v_salon_code
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select
    customer.id,
    nullif(trim(coalesce(customer.active_client_app_instance_id, '')), ''),
    customer.active_client_last_seen_at
  into
    v_customer_id,
    v_existing_instance_id,
    v_existing_last_seen_at
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
      or (nullif(v_customer_phone, '') is not null and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone)
    )
  order by
    case
      when v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text then 0
      else 1
    end,
    customer.updated_at desc nulls last,
    customer.created_at desc nulls last
  limit 1
  for update;

  if v_customer_id is null then
    raise exception 'customer_not_found';
  end if;

  if
    v_existing_instance_id is null
    or v_existing_instance_id = trim(p_app_instance_id)
    or v_existing_last_seen_at is null
    or v_existing_last_seen_at <= v_now - make_interval(secs => v_stale_after_seconds)
  then
    update public.customers
    set
      active_client_app_instance_id = trim(p_app_instance_id),
      active_client_platform = p_platform,
      active_client_claimed_at = case
        when v_existing_instance_id = trim(p_app_instance_id)
          then coalesce(active_client_claimed_at, v_now)
        else v_now
      end,
      active_client_last_seen_at = v_now,
      updated_at = v_now
    where id = v_customer_id;

    return query select true, 'ok'::text;
    return;
  end if;

  return query select false, 'active_on_another_client_device'::text;
end;
$$;

create or replace function public.heartbeat_public_customer_app_session(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_app_instance_id text default null,
  p_stale_after_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_existing_instance_id text;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10);
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 90), 60);
begin
  if v_salon_code = '' or nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    return false;
  end if;

  if v_customer_email is null and nullif(v_customer_phone, '') is null then
    return false;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = v_salon_code
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  select
    customer.id,
    nullif(trim(coalesce(customer.active_client_app_instance_id, '')), ''),
    customer.active_client_last_seen_at
  into
    v_customer_id,
    v_existing_instance_id,
    v_existing_last_seen_at
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
      or (nullif(v_customer_phone, '') is not null and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone)
    )
  order by
    case
      when v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text then 0
      else 1
    end,
    customer.updated_at desc nulls last,
    customer.created_at desc nulls last
  limit 1
  for update;

  if v_customer_id is null then
    return false;
  end if;

  if v_existing_instance_id = trim(p_app_instance_id) then
    update public.customers
    set
      active_client_last_seen_at = v_now,
      updated_at = v_now
    where id = v_customer_id;

    return true;
  end if;

  if
    v_existing_instance_id is null
    or v_existing_last_seen_at is null
    or v_existing_last_seen_at <= v_now - make_interval(secs => v_stale_after_seconds)
  then
    return false;
  end if;

  return false;
end;
$$;

create or replace function public.release_public_customer_app_session(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_app_instance_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10);
begin
  if v_salon_code = '' or nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    return false;
  end if;

  if v_customer_email is null and nullif(v_customer_phone, '') is null then
    return false;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = v_salon_code
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and nullif(trim(coalesce(customer.active_client_app_instance_id, '')), '') = trim(p_app_instance_id)
    and (
      (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
      or (nullif(v_customer_phone, '') is not null and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone)
    )
  limit 1
  for update;

  if v_customer_id is null then
    return false;
  end if;

  update public.customers
  set
    active_client_app_instance_id = null,
    active_client_platform = null,
    active_client_claimed_at = null,
    active_client_last_seen_at = null,
    updated_at = timezone('utc', now())
  where id = v_customer_id;

  return true;
end;
$$;

grant execute on function public.claim_public_customer_app_session(text, citext, text, text, public.store_platform, integer) to anon, authenticated;
grant execute on function public.heartbeat_public_customer_app_session(text, citext, text, text, integer) to anon, authenticated;
grant execute on function public.release_public_customer_app_session(text, citext, text, text) to anon, authenticated;
