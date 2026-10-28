begin;

alter table public.owner_profiles
  add column if not exists last_owner_app_access_at timestamptz,
  add column if not exists last_owner_app_session_started_at timestamptz,
  add column if not exists last_owner_app_session_duration_seconds integer
    check (
      last_owner_app_session_duration_seconds is null
      or last_owner_app_session_duration_seconds >= 0
    );

update public.owner_profiles
set
  last_owner_app_access_at = active_mobile_last_seen_at,
  last_owner_app_session_started_at = active_mobile_claimed_at,
  last_owner_app_session_duration_seconds = greatest(
    0,
    floor(
      extract(
        epoch from (
          active_mobile_last_seen_at - coalesce(active_mobile_claimed_at, active_mobile_last_seen_at)
        )
      )
    )::integer
  )
where active_mobile_last_seen_at is not null
  and (
    last_owner_app_access_at is null
    or last_owner_app_access_at < active_mobile_last_seen_at
  );

create or replace function public.claim_owner_mobile_app_session(
  p_app_instance_id text,
  p_platform public.store_platform default 'manual',
  p_stale_after_seconds integer default 240
)
returns table(ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_existing_instance_id text;
  v_existing_claimed_at timestamptz;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 240), 60);
  v_continues_current_session boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    raise exception 'app_instance_required';
  end if;

  select
    profile.id,
    nullif(trim(coalesce(profile.active_mobile_app_instance_id, '')), ''),
    profile.active_mobile_claimed_at,
    profile.active_mobile_last_seen_at
  into
    v_profile_id,
    v_existing_instance_id,
    v_existing_claimed_at,
    v_existing_last_seen_at
  from public.owner_profiles as profile
  where profile.user_id = auth.uid()
  for update;

  if v_profile_id is null then
    raise exception 'owner_profile_not_found';
  end if;

  v_continues_current_session :=
    v_existing_instance_id = trim(p_app_instance_id)
    and v_existing_last_seen_at is not null
    and v_existing_last_seen_at > v_now - make_interval(secs => v_stale_after_seconds);

  if
    v_existing_instance_id is null
    or v_existing_instance_id = trim(p_app_instance_id)
    or v_existing_last_seen_at is null
    or v_existing_last_seen_at <= v_now - make_interval(secs => v_stale_after_seconds)
  then
    update public.owner_profiles
    set
      active_mobile_app_instance_id = trim(p_app_instance_id),
      active_mobile_platform = p_platform,
      active_mobile_claimed_at = case
        when v_continues_current_session
          then coalesce(v_existing_claimed_at, v_now)
        else v_now
      end,
      active_mobile_last_seen_at = v_now,
      last_owner_app_access_at = v_now,
      last_owner_app_session_started_at = case
        when v_continues_current_session
          then coalesce(v_existing_claimed_at, v_now)
        else v_now
      end,
      last_owner_app_session_duration_seconds = case
        when v_continues_current_session
          then greatest(
            0,
            floor(extract(epoch from (v_now - coalesce(v_existing_claimed_at, v_now))))::integer
          )
        else 0
      end,
      updated_at = v_now
    where id = v_profile_id;

    return query select true, 'ok'::text;
    return;
  end if;

  return query select false, 'active_on_another_mobile_device'::text;
end;
$$;

create or replace function public.heartbeat_owner_mobile_app_session(
  p_app_instance_id text,
  p_stale_after_seconds integer default 240
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_existing_instance_id text;
  v_existing_claimed_at timestamptz;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 240), 60);
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    return false;
  end if;

  select
    profile.id,
    nullif(trim(coalesce(profile.active_mobile_app_instance_id, '')), ''),
    profile.active_mobile_claimed_at,
    profile.active_mobile_last_seen_at
  into
    v_profile_id,
    v_existing_instance_id,
    v_existing_claimed_at,
    v_existing_last_seen_at
  from public.owner_profiles as profile
  where profile.user_id = auth.uid()
  for update;

  if v_profile_id is null then
    return false;
  end if;

  if v_existing_instance_id = trim(p_app_instance_id) then
    update public.owner_profiles
    set
      active_mobile_claimed_at = coalesce(v_existing_claimed_at, v_now),
      active_mobile_last_seen_at = v_now,
      last_owner_app_access_at = v_now,
      last_owner_app_session_started_at = coalesce(v_existing_claimed_at, v_now),
      last_owner_app_session_duration_seconds = greatest(
        0,
        floor(extract(epoch from (v_now - coalesce(v_existing_claimed_at, v_now))))::integer
      ),
      updated_at = v_now
    where id = v_profile_id;

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

create or replace function public.release_owner_mobile_app_session(
  p_app_instance_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_existing_claimed_at timestamptz;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    return false;
  end if;

  select
    profile.id,
    profile.active_mobile_claimed_at
  into
    v_profile_id,
    v_existing_claimed_at
  from public.owner_profiles as profile
  where profile.user_id = auth.uid()
    and nullif(trim(coalesce(profile.active_mobile_app_instance_id, '')), '') = trim(p_app_instance_id)
  for update;

  if v_profile_id is null then
    return false;
  end if;

  update public.owner_profiles
  set
    last_owner_app_access_at = v_now,
    last_owner_app_session_started_at = coalesce(v_existing_claimed_at, v_now),
    last_owner_app_session_duration_seconds = greatest(
      0,
      floor(extract(epoch from (v_now - coalesce(v_existing_claimed_at, v_now))))::integer
    ),
    active_mobile_app_instance_id = null,
    active_mobile_platform = null,
    active_mobile_claimed_at = null,
    active_mobile_last_seen_at = null,
    updated_at = v_now
  where id = v_profile_id;

  return true;
end;
$$;

grant execute on function public.claim_owner_mobile_app_session(text, public.store_platform, integer)
  to authenticated;
grant execute on function public.heartbeat_owner_mobile_app_session(text, integer)
  to authenticated;
grant execute on function public.release_owner_mobile_app_session(text)
  to authenticated;

commit;
