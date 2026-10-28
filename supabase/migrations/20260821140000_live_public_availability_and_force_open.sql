-- Availability is one live contract: owner writes, portal snapshots, public
-- reads and booking guards must agree on calendar exceptions and explicit
-- day reopenings.

create or replace function public.merge_client_portal_calendar_exceptions_v1(
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
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_existing_ts timestamptz;
  v_incoming_ts timestamptz;
begin
  begin
    v_existing_ts := nullif(trim(coalesce(v_existing ->> 'calendarExceptionsUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_existing_ts := null;
  end;
  begin
    v_incoming_ts := nullif(trim(coalesce(v_incoming ->> 'calendarExceptionsUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_incoming_ts := null;
  end;

  if v_existing_ts is not null
     and (v_incoming_ts is null or v_existing_ts > v_incoming_ts) then
    return jsonb_set(
      jsonb_set(
        v_result,
        '{calendarExceptions}',
        coalesce(v_existing -> 'calendarExceptions', '[]'::jsonb),
        true
      ),
      '{calendarExceptionsUpdatedAt}',
      coalesce(v_existing -> 'calendarExceptionsUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return v_result;
end;
$$;

do $$
declare
  v_signature regprocedure :=
    'public.merge_client_portal_availability_settings(jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_next text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('merge_client_portal_calendar_exceptions_v1' in v_definition) > 0 then
    return;
  end if;

  v_next := replace(
    v_definition,
    'return v_result;',
    'return public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result);'
  );

  if v_next = v_definition
     or position('merge_client_portal_calendar_exceptions_v1' in v_next) = 0 then
    raise exception 'calendar_exception_merge_anchor_missing';
  end if;

  execute v_next;
end;
$$;

create or replace function public.is_public_booking_calendar_exception_allowed(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer default 60,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_exception jsonb;
  v_date_text text := p_appointment_date::text;
  v_requested_start_at timestamp := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at timestamp :=
    p_appointment_date::timestamp + p_appointment_time
    + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1));
  v_exception_start time;
  v_exception_end time;
  v_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
  v_matches_operator boolean;
  v_all_day boolean;
  v_force_open boolean := false;
begin
  v_settings := public.resolve_public_portal_availability_settings(p_workspace_id);

  select coalesce((item ->> 'forceOpen')::boolean, false)
  into v_force_open
  from jsonb_array_elements(coalesce(v_settings -> 'dateOverrides', '[]'::jsonb)) as item
  where item ->> 'date' = v_date_text
  limit 1;

  for v_exception in
    select item
    from jsonb_array_elements(coalesce(v_settings -> 'calendarExceptions', '[]'::jsonb)) as item
    where coalesce(item ->> 'startDate', '') <= v_date_text
      and v_date_text <= coalesce(item ->> 'endDate', '')
  loop
    if coalesce(v_exception ->> 'scope', 'salon') = 'operators' then
      if v_operator_id is null and v_operator_name is null then
        continue;
      end if;

      v_matches_operator :=
        (v_operator_id is not null and exists (
          select 1
          from jsonb_array_elements_text(coalesce(v_exception -> 'operatorIds', '[]'::jsonb)) as operator_id
          where trim(operator_id) = v_operator_id
        ))
        or
        (v_operator_name is not null and exists (
          select 1
          from jsonb_array_elements_text(coalesce(v_exception -> 'operatorNames', '[]'::jsonb)) as operator_name
          where lower(trim(operator_name)) = v_operator_name
        ));

      if not v_matches_operator then
        continue;
      end if;
    elsif v_force_open then
      -- Reopening one day overrides salon-wide ferie/closures only. Personal
      -- operator absences remain effective.
      continue;
    end if;

    v_all_day := true;
    if jsonb_typeof(v_exception -> 'allDay') = 'boolean' then
      v_all_day := (v_exception ->> 'allDay')::boolean;
    end if;

    if v_all_day then
      return false;
    end if;

    begin
      v_exception_start := nullif(v_exception ->> 'startTime', '')::time;
      v_exception_end := nullif(v_exception ->> 'endTime', '')::time;
    exception when others then
      v_exception_start := null;
      v_exception_end := null;
    end;

    if v_exception_start is not null
      and v_exception_end is not null
      and v_requested_start_at < (p_appointment_date::timestamp + v_exception_end)
      and v_requested_end_at > (p_appointment_date::timestamp + v_exception_start)
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.get_client_portal_availability_settings(text)'::regprocedure,
    'public.get_client_portal_snapshot(text)'::regprocedure,
    'public.get_client_portal_catalog(text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_next := replace(
      v_definition,
      'and w.subscription_status in (''demo'', ''active'')',
      'and (w.is_internal_tester = true or w.subscription_status in (''demo'', ''active''))'
    );
    v_next := replace(
      v_next,
      'and workspace.subscription_status in (''demo'', ''active'')',
      'and (workspace.is_internal_tester = true or workspace.subscription_status in (''demo'', ''active''))'
    );

    if position('is_internal_tester = true' in v_next) = 0 then
      raise exception 'internal_tester_public_availability_patch_missing:%',
        v_signature::text;
    end if;

    if v_next is distinct from v_definition then
      execute v_next;
    end if;
  end loop;
end;
$$;

-- Repair any portal row that a stale full snapshot published without the
-- latest exception group. The timestamp-aware merge prevents regressions.
update public.client_portals as portal
set availability_settings = public.merge_client_portal_availability_settings(
      portal.availability_settings,
      coalesce(snapshot.payload -> 'availabilitySettings', '{}'::jsonb)
    ),
    updated_at = timezone('utc', now())
from public.owner_app_snapshots as snapshot
where snapshot.workspace_id = portal.workspace_id
  and portal.availability_settings is distinct from
      public.merge_client_portal_availability_settings(
        portal.availability_settings,
        coalesce(snapshot.payload -> 'availabilitySettings', '{}'::jsonb)
      );

notify pgrst, 'reload schema';
