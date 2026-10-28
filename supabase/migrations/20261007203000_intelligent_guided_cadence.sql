-- Server-owned backup: stale/older app snapshots cannot erase it or resurrect it.
-- A manual change must follow even an automatic write made a millisecond earlier,
-- or a preference previously stamped by a device whose clock was ahead.
do $$
declare
  v_definition text;
  v_anchor text := 'v_server_updated_at := clock_timestamp();';
  v_replacement text := $patch$v_server_updated_at := clock_timestamp();
  begin
    if isfinite((v_portal.availability_settings->>'publicSlotIntervalUpdatedAt')::timestamptz) then
      v_server_updated_at := greatest(v_server_updated_at,
        (v_portal.availability_settings->>'publicSlotIntervalUpdatedAt')::timestamptz + interval '1 millisecond');
    end if;
  exception when others then null;
  end;$patch$;
begin
  select pg_get_functiondef('public.set_public_slot_interval_v1(text,integer)'::regprocedure) into v_definition;
  if position(v_replacement in v_definition) > 0 then return; end if;
  if position(v_anchor in v_definition) = 0 then raise exception 'public_slot_interval_timestamp_anchor_missing'; end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$$;

create or replace function public.protect_intelligent_guided_cadence_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_backup jsonb := old.availability_settings->'intelligentGuidedCadenceRestore';
  v_stamp timestamptz := clock_timestamp();
begin
  if current_setting('salonpro.guided_cadence_write', true) = '1' then return new; end if;
  if jsonb_typeof(v_backup) = 'object' then
    if new.availability_settings->>'guidedSlotsEnabled' = 'true'
       and new.availability_settings->>'guidedSlotsStrategy' = 'intelligent' then
      new.availability_settings := jsonb_set(new.availability_settings,
        '{intelligentGuidedCadenceRestore}', v_backup, true);
      return new;
    end if;
    -- Legacy clients can also leave the mode. Restore only an untouched automatic cadence.
    if old.availability_settings->>'publicSlotIntervalMode' = 'custom'
       and old.availability_settings->'publicSlotMinimumIntervalMinutes' = v_backup->'automaticMinimum'
       and old.availability_settings->>'publicSlotIntervalUpdatedAt' = v_backup->>'appliedAt'
       and new.availability_settings->'publicSlotIntervalMode' = old.availability_settings->'publicSlotIntervalMode'
       and new.availability_settings->'publicSlotMinimumIntervalMinutes' = old.availability_settings->'publicSlotMinimumIntervalMinutes'
       and new.availability_settings->'publicSlotIntervalUpdatedAt' = old.availability_settings->'publicSlotIntervalUpdatedAt' then
      begin
        v_stamp := greatest(v_stamp, (old.availability_settings->>'publicSlotIntervalUpdatedAt')::timestamptz + interval '1 millisecond');
      exception when others then null;
      end;
      new.availability_settings := new.availability_settings || jsonb_build_object(
        'publicSlotIntervalMode', v_backup->'previousMode',
        'publicSlotMinimumIntervalMinutes', v_backup->'previousMinimum',
        'publicSlotIntervalUpdatedAt', v_stamp);
    end if;
  end if;
  new.availability_settings := jsonb_set(new.availability_settings,
    '{intelligentGuidedCadenceRestore}', 'null'::jsonb, true);
  return new;
end;
$$;

create trigger zz_intelligent_guided_cadence_v1
before update of availability_settings on public.client_portals
for each row execute function public.protect_intelligent_guided_cadence_v1();

create or replace function public.protect_owner_intelligent_guided_cadence_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_backup jsonb; v_settings jsonb;
begin
  if current_setting('salonpro.guided_cadence_write', true) = '1' then return new; end if;
  select availability_settings->'intelligentGuidedCadenceRestore' into v_backup
  from public.client_portals where workspace_id = new.workspace_id;
  if not found then return new; end if;
  v_settings := case when jsonb_typeof(new.payload->'availabilitySettings') = 'object'
    then new.payload->'availabilitySettings' else '{}'::jsonb end;
  new.payload := jsonb_set(new.payload, '{availabilitySettings}', v_settings ||
    jsonb_build_object('intelligentGuidedCadenceRestore', coalesce(v_backup, 'null'::jsonb)), true);
  return new;
end;
$$;

create trigger zz_owner_intelligent_guided_cadence_v1
before insert or update of payload on public.owner_app_snapshots
for each row execute function public.protect_owner_intelligent_guided_cadence_v1();

-- Keep the established workspace permissions, lock order, versioned settings and
-- Realtime tables. Only strategy + initial cadence are grouped into one commit.
create or replace function public.set_guided_slots_with_cadence_v1(
  p_enabled boolean,
  p_strategy text,
  p_visibility text,
  p_automatic_minimum_interval_minutes integer default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
  v_settings jsonb;
  v_backup jsonb;
  v_patch jsonb;
  v_stamp timestamptz := clock_timestamp();
  v_existing_stamp timestamptz;
  v_key text;
  v_intelligent boolean;
  v_was_intelligent boolean;
  v_strategy text := lower(trim(p_strategy));
  v_visibility text := lower(trim(p_visibility));
  v_previous_write_scope text := current_setting('salonpro.guided_cadence_write', true);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using errcode = '42501', message = 'workspace_access_denied';
  end if;
  if p_enabled is null or v_strategy is null
     or v_strategy not in ('intelligent', 'balanced', 'protect_long_services', 'fill_gaps')
     or v_visibility is null or v_visibility not in ('recommended_only', 'recommended_first', 'recommended_and_all') then
    raise exception using errcode = '22023', message = 'invalid_guided_slots_settings';
  end if;
  if p_automatic_minimum_interval_minutes is not null and (
      not p_enabled or v_strategy <> 'intelligent' or p_automatic_minimum_interval_minutes < 5
      or p_automatic_minimum_interval_minutes > 300 or p_automatic_minimum_interval_minutes % 5 <> 0) then
    raise exception using errcode = '22023', message = 'invalid_intelligent_slot_interval';
  end if;
  if v_strategy = 'intelligent' then v_visibility := 'recommended_only'; end if;
  perform 1 from public.owner_app_snapshots where workspace_id = v_workspace_id for update;
  select * into v_portal from public.client_portals where workspace_id = v_workspace_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'workspace_not_found'; end if;
  v_settings := coalesce(v_portal.availability_settings, '{}'::jsonb);
  -- Monotonic group timestamps also tolerate a previously skewed device clock.
  foreach v_key in array array['guidedSlotsUpdatedAt', 'publicSlotIntervalUpdatedAt'] loop
    begin
      v_existing_stamp := (v_settings->>v_key)::timestamptz;
      if isfinite(v_existing_stamp) then v_stamp := greatest(v_stamp, v_existing_stamp + interval '1 millisecond'); end if;
    exception when others then null;
    end;
  end loop;
  v_intelligent := p_enabled and v_strategy = 'intelligent';
  v_was_intelligent := coalesce(v_settings->>'guidedSlotsEnabled' = 'true'
    and v_settings->>'guidedSlotsStrategy' = 'intelligent', false);
  v_backup := v_settings->'intelligentGuidedCadenceRestore';
  if v_intelligent and not v_was_intelligent then
    v_backup := 'null'::jsonb;
    if p_automatic_minimum_interval_minutes is not null then
      v_backup := jsonb_build_object(
        'previousMode', coalesce(v_settings->>'publicSlotIntervalMode', 'custom'),
        'previousMinimum', coalesce(v_settings->'publicSlotMinimumIntervalMinutes', '15'::jsonb),
        'automaticMinimum', p_automatic_minimum_interval_minutes,
        'appliedAt', v_stamp);
      v_settings := v_settings || jsonb_build_object('publicSlotIntervalMode', 'custom',
        'publicSlotMinimumIntervalMinutes', p_automatic_minimum_interval_minutes, 'publicSlotIntervalUpdatedAt', v_stamp);
    end if;
  elsif not v_intelligent then
    if jsonb_typeof(v_backup) = 'object'
       and v_settings->>'publicSlotIntervalMode' = 'custom'
       and v_settings->'publicSlotMinimumIntervalMinutes' = v_backup->'automaticMinimum'
       and v_settings->>'publicSlotIntervalUpdatedAt' = v_backup->>'appliedAt' then
      v_settings := v_settings || jsonb_build_object('publicSlotIntervalMode', v_backup->'previousMode',
        'publicSlotMinimumIntervalMinutes', v_backup->'previousMinimum', 'publicSlotIntervalUpdatedAt', v_stamp);
    end if;
    v_backup := 'null'::jsonb;
  end if;
  v_patch := jsonb_build_object('guidedSlotsEnabled', p_enabled, 'guidedSlotsStrategy', v_strategy,
    'guidedSlotsVisibility', v_visibility, 'guidedSlotsUpdatedAt', v_stamp,
    'intelligentGuidedCadenceRestore', coalesce(v_backup, 'null'::jsonb),
    'publicSlotIntervalMode', coalesce(v_settings->>'publicSlotIntervalMode', 'custom'),
    'publicSlotMinimumIntervalMinutes', coalesce(v_settings->'publicSlotMinimumIntervalMinutes', '15'::jsonb),
    'publicSlotIntervalUpdatedAt', v_settings->'publicSlotIntervalUpdatedAt');
  perform set_config('salonpro.guided_cadence_write', '1', true);
  update public.client_portals set availability_settings = v_settings || v_patch,
    updated_at = clock_timestamp() where workspace_id = v_workspace_id returning * into v_portal;
  update public.owner_app_snapshots set payload = jsonb_set(payload, '{availabilitySettings}',
    coalesce(payload->'availabilitySettings', '{}'::jsonb) || v_patch, true)
    where workspace_id = v_workspace_id;
  perform set_config('salonpro.guided_cadence_write', coalesce(v_previous_write_scope, ''), true);
  return jsonb_build_object('workspace', jsonb_build_object('id', v_portal.workspace_id,
    'ownerEmail', v_portal.owner_email, 'salonCode', v_portal.salon_code,
    'salonName', coalesce(v_portal.salon_name, ''), 'updatedAt', v_portal.updated_at),
    'availabilitySettings', v_portal.availability_settings);
end;
$$;

revoke all on function public.protect_intelligent_guided_cadence_v1() from public, anon, authenticated;
revoke all on function public.protect_owner_intelligent_guided_cadence_v1() from public, anon, authenticated;
revoke all on function public.set_guided_slots_with_cadence_v1(boolean,text,text,integer) from public, anon, service_role;
grant execute on function public.set_guided_slots_with_cadence_v1(boolean,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
