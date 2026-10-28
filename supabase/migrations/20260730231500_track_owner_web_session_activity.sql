begin;

alter table public.owner_profiles
  add column if not exists last_owner_web_access_at timestamptz,
  add column if not exists last_owner_web_session_started_at timestamptz,
  add column if not exists last_owner_web_session_duration_seconds integer
    check (
      last_owner_web_session_duration_seconds is null
      or last_owner_web_session_duration_seconds >= 0
    ),
  add column if not exists active_owner_web_session_id text;

create or replace function public.heartbeat_owner_web_app_session(
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_existing_session_id text;
  v_existing_started_at timestamptz;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_continues_current_session boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if
    nullif(trim(coalesce(p_session_id, '')), '') is null
    or length(trim(p_session_id)) > 200
  then
    return false;
  end if;

  select
    profile.id,
    nullif(trim(coalesce(profile.active_owner_web_session_id, '')), ''),
    profile.last_owner_web_session_started_at,
    profile.last_owner_web_access_at
  into
    v_profile_id,
    v_existing_session_id,
    v_existing_started_at,
    v_existing_last_seen_at
  from public.owner_profiles as profile
  where profile.user_id = auth.uid()
  for update;

  if v_profile_id is null then
    return false;
  end if;

  v_continues_current_session :=
    v_existing_session_id = trim(p_session_id)
    and v_existing_last_seen_at is not null
    and v_existing_last_seen_at > v_now - interval '2 minutes';

  update public.owner_profiles
  set
    active_owner_web_session_id = trim(p_session_id),
    last_owner_web_access_at = v_now,
    last_owner_web_session_started_at = case
      when v_continues_current_session
        then coalesce(v_existing_started_at, v_now)
      else v_now
    end,
    last_owner_web_session_duration_seconds = case
      when v_continues_current_session
        then greatest(
          0,
          floor(
            extract(epoch from (v_now - coalesce(v_existing_started_at, v_now)))
          )::integer
        )
      else 0
    end,
    updated_at = v_now
  where id = v_profile_id;

  return true;
end;
$$;

revoke all on function public.heartbeat_owner_web_app_session(text) from public;
grant execute on function public.heartbeat_owner_web_app_session(text)
  to authenticated;

commit;
