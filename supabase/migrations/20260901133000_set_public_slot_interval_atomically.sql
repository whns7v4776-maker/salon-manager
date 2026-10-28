-- The cadence offered to public customers is independent from the agenda
-- grid. It is a server-authoritative preference: legacy snapshots that do not
-- know these keys must not remove it after it has been explicitly saved.

create or replace function public.merge_client_portal_public_slot_interval_v1(
  p_existing jsonb,
  p_incoming jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_existing jsonb := case
    when jsonb_typeof(p_existing) = 'object' then p_existing
    else '{}'::jsonb
  end;
  v_incoming jsonb := case
    when jsonb_typeof(p_incoming) = 'object' then p_incoming
    else '{}'::jsonb
  end;
  v_result jsonb := case
    when jsonb_typeof(p_result) = 'object' then p_result
    else '{}'::jsonb
  end;
  v_existing_ts timestamptz;
  v_incoming_ts timestamptz;
begin
  begin
    v_existing_ts := nullif(
      trim(coalesce(v_existing ->> 'publicSlotIntervalUpdatedAt', '')),
      ''
    )::timestamptz;
  exception when others then
    v_existing_ts := null;
  end;

  begin
    v_incoming_ts := nullif(
      trim(coalesce(v_incoming ->> 'publicSlotIntervalUpdatedAt', '')),
      ''
    )::timestamptz;
  exception when others then
    v_incoming_ts := null;
  end;

  if v_existing_ts is not null
     and (
       v_incoming_ts is null
       or v_existing_ts > v_incoming_ts
       or (
         v_existing_ts = v_incoming_ts
         and (
           not (v_incoming ? 'publicSlotIntervalMode')
           or not (v_incoming ? 'publicSlotMinimumIntervalMinutes')
         )
       )
     )
  then
    return jsonb_set(
      jsonb_set(
        jsonb_set(
          v_result,
          '{publicSlotIntervalMode}',
          coalesce(
            v_existing -> 'publicSlotIntervalMode',
            to_jsonb('custom'::text)
          ),
          true
        ),
        '{publicSlotMinimumIntervalMinutes}',
        coalesce(
          v_existing -> 'publicSlotMinimumIntervalMinutes',
          to_jsonb(15)
        ),
        true
      ),
      '{publicSlotIntervalUpdatedAt}',
      coalesce(
        v_existing -> 'publicSlotIntervalUpdatedAt',
        'null'::jsonb
      ),
      true
    );
  end if;

  return v_result;
end;
$$;

-- Extend the canonical availability merge without recreating its evolving
-- implementation. The expected anchor was installed by the scheduled agenda
-- interval migration; fail loudly if the deployed chain is not the one this
-- migration was reviewed against.
do $$
declare
  v_signature regprocedure :=
    'public.merge_client_portal_availability_settings(jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_anchor text :=
    'return public.merge_client_portal_slot_interval_schedule_v1(v_existing, v_incoming, public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result));';
  v_replacement text :=
    'return public.merge_client_portal_public_slot_interval_v1(v_existing, v_incoming, public.merge_client_portal_slot_interval_schedule_v1(v_existing, v_incoming, public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result)));';
  v_next text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('merge_client_portal_public_slot_interval_v1' in v_definition) > 0 then
    return;
  end if;

  v_next := replace(v_definition, v_anchor, v_replacement);
  if v_next = v_definition then
    raise exception 'public_slot_interval_merge_anchor_missing';
  end if;

  execute v_next;
end;
$$;

-- Protect the canonical portal value even if an older authenticated client
-- still publishes an entire availability object instead of using the atomic
-- setter below.
create or replace function public.protect_client_portal_public_slot_interval_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.availability_settings :=
    public.merge_client_portal_public_slot_interval_v1(
      old.availability_settings,
      new.availability_settings,
      new.availability_settings
    );
  return new;
end;
$$;

drop trigger if exists protect_client_portal_public_slot_interval_v1
  on public.client_portals;
create trigger protect_client_portal_public_slot_interval_v1
before update of availability_settings
on public.client_portals
for each row
execute function public.protect_client_portal_public_slot_interval_v1();

-- Apply the same timestamp rule to the private recovery snapshot. This keeps a
-- stale full-payload upload from erasing a value already saved by the server.
create or replace function public.protect_owner_snapshot_public_slot_interval_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_settings jsonb;
  v_new_payload jsonb;
  v_new_settings jsonb;
begin
  v_old_settings := case
    when jsonb_typeof(old.payload -> 'availabilitySettings') = 'object'
      then old.payload -> 'availabilitySettings'
    else '{}'::jsonb
  end;
  v_new_payload := case
    when jsonb_typeof(new.payload) = 'object' then new.payload
    else '{}'::jsonb
  end;
  v_new_settings := case
    when jsonb_typeof(v_new_payload -> 'availabilitySettings') = 'object'
      then v_new_payload -> 'availabilitySettings'
    else '{}'::jsonb
  end;

  new.payload := jsonb_set(
    v_new_payload,
    '{availabilitySettings}',
    public.merge_client_portal_public_slot_interval_v1(
      v_old_settings,
      v_new_settings,
      v_new_settings
    ),
    true
  );
  return new;
end;
$$;

drop trigger if exists protect_owner_snapshot_public_slot_interval_v1
  on public.owner_app_snapshots;
create trigger protect_owner_snapshot_public_slot_interval_v1
before update of payload
on public.owner_app_snapshots
for each row
execute function public.protect_owner_snapshot_public_slot_interval_v1();

-- Persist only this preference group. Missing arguments intentionally resolve
-- to the product default: a custom customer cadence with a 15-minute minimum.
create or replace function public.set_public_slot_interval_v1(
  p_mode text default 'custom',
  p_minimum_interval_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
  v_portal_settings jsonb;
  v_canonical_settings jsonb;
  v_patch jsonb;
  v_mode text;
  v_minimum_interval integer;
  v_server_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using
      errcode = '42501',
      message = 'workspace_access_denied';
  end if;

  v_mode := lower(trim(coalesce(p_mode, 'custom')));
  if v_mode not in ('follow_agenda', 'custom') then
    raise exception using
      errcode = '22023',
      message = 'invalid_public_slot_interval_mode';
  end if;

  v_minimum_interval := coalesce(p_minimum_interval_minutes, 15);
  if v_minimum_interval < 5
     or v_minimum_interval > 300
     or v_minimum_interval % 5 <> 0
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_public_slot_minimum_interval';
  end if;

  -- Snapshot publishers acquire this row before their portal projection. Keep
  -- the same lock order used by the other atomic availability setters.
  perform 1
  from public.owner_app_snapshots as snapshot
  where snapshot.workspace_id = v_workspace_id
  for update;

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'workspace_not_found';
  end if;

  v_server_updated_at := clock_timestamp();
  v_patch := jsonb_build_object(
    'publicSlotIntervalMode', v_mode,
    'publicSlotMinimumIntervalMinutes', v_minimum_interval,
    'publicSlotIntervalUpdatedAt', v_server_updated_at
  );

  v_portal_settings := case
    when jsonb_typeof(v_portal.availability_settings) = 'object'
      then v_portal.availability_settings
    else '{}'::jsonb
  end;
  v_canonical_settings := v_portal_settings || v_patch;

  update public.client_portals as portal
  set
    availability_settings = v_canonical_settings,
    updated_at = v_server_updated_at
  where portal.workspace_id = v_workspace_id
  returning portal.* into v_portal;

  -- Do not manufacture a partial recovery snapshot. When one already exists,
  -- patch only these three keys and preserve every unrelated owner field.
  update public.owner_app_snapshots as snapshot
  set payload = jsonb_set(
    case
      when jsonb_typeof(snapshot.payload) = 'object' then snapshot.payload
      else '{}'::jsonb
    end,
    '{availabilitySettings}',
    (
      case
        when jsonb_typeof(snapshot.payload -> 'availabilitySettings') = 'object'
          then snapshot.payload -> 'availabilitySettings'
        else '{}'::jsonb
      end
    ) || v_patch,
    true
  )
  where snapshot.workspace_id = v_workspace_id;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.salon_name, ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_canonical_settings
  );
end;
$$;

revoke all on function public.protect_client_portal_public_slot_interval_v1()
  from public, anon, authenticated;
revoke all on function public.protect_owner_snapshot_public_slot_interval_v1()
  from public, anon, authenticated;
revoke all on function public.set_public_slot_interval_v1(text, integer)
  from public, anon, service_role;
grant execute on function public.set_public_slot_interval_v1(text, integer)
  to authenticated;

comment on function public.set_public_slot_interval_v1(text, integer) is
  'Atomically persists the authenticated workspace public slot cadence independently from the agenda grid.';

notify pgrst, 'reload schema';
