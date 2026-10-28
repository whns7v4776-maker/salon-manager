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
begin
  v_settings := coalesce(
    public.get_public_portal_owner_payload(p_workspace_id) -> 'availabilitySettings',
    '{}'::jsonb
  );

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

grant execute on function public.is_public_booking_calendar_exception_allowed(uuid, date, time, integer, text, text)
  to anon, authenticated;

do $$
declare
  v_definition text;
  v_anchor text := $needle$
  v_settings := coalesce(
    public.get_public_portal_owner_payload(p_workspace_id) -> 'availabilitySettings',
    '{}'::jsonb
  );
$needle$;
begin
  select pg_get_functiondef(
    'public.is_public_booking_time_allowed_by_availability(uuid,date,time,integer)'::regprocedure
  ) into v_definition;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'calendar_exception_time_guard_anchor_missing';
  end if;

  v_definition := replace(
    v_definition,
    v_anchor,
    v_anchor || $inject$

  if not public.is_public_booking_calendar_exception_allowed(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    null,
    null
  ) then
    return false;
  end if;
$inject$
  );

  execute v_definition;
end;
$$;

do $$
declare
  v_definition text;
  v_availability_guard_pattern text := $pattern$if[[:space:]]+not[[:space:]]+public\.is_public_booking_time_allowed_by_availability\([[:space:]]*p_workspace_id,[[:space:]]*p_appointment_date,[[:space:]]*p_appointment_time,[[:space:]]*greatest\(coalesce\(p_requested_duration_minutes,[[:space:]]*60\),[[:space:]]*1\)[[:space:]]*\)[[:space:]]+then[[:space:]]+return[[:space:]]+false;[[:space:]]+end[[:space:]]+if;$pattern$;
  v_operator_filter_pattern text := $pattern$\)[[:space:]]*=[[:space:]]*v_requested_role[[:space:]]+and[[:space:]]+\([[:space:]]*operator_item[[:space:]]*->[[:space:]]*'availability'[[:space:]]+is[[:space:]]+null$pattern$;
  v_availability_guard text;
  v_operator_filter_anchor text;
begin
  select pg_get_functiondef(
    'public.is_public_booking_slot_available(uuid,date,time,integer,text,text,text)'::regprocedure
  ) into v_definition;

  v_availability_guard := substring(v_definition from v_availability_guard_pattern);
  if v_availability_guard is null then
    raise exception 'calendar_exception_slot_guard_anchor_missing';
  end if;

  v_definition := replace(
    v_definition,
    v_availability_guard,
    v_availability_guard || $inject$

  if not public.is_public_booking_calendar_exception_allowed(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    return false;
  end if;
$inject$
  );

  v_operator_filter_anchor := substring(v_definition from v_operator_filter_pattern);
  if v_operator_filter_anchor is null then
    raise exception 'calendar_exception_operator_filter_anchor_missing';
  end if;

  v_definition := replace(
    v_definition,
    v_operator_filter_anchor,
    $inject$
      ) = v_requested_role
        and public.is_public_booking_calendar_exception_allowed(
          p_workspace_id,
          p_appointment_date,
          p_appointment_time,
          greatest(coalesce(p_requested_duration_minutes, 60), 1),
          nullif(trim(coalesce(operator_item ->> 'id', '')), ''),
          nullif(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')), '')
        )
        and (
          operator_item -> 'availability' is null
$inject$
  );

  execute v_definition;
end;
$$;

create or replace function public.merge_client_portal_availability_settings_v2(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb;
  v_existing_ts timestamptz;
  v_incoming_ts timestamptz;
begin
  v_result := public.merge_client_portal_availability_settings(v_existing, v_incoming);

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
    v_result := jsonb_set(
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

create or replace function public.update_client_portal_availability_settings(
  p_owner_email text,
  p_salon_code text,
  p_availability_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  update public.client_portals as portal
  set
    availability_settings = public.merge_client_portal_availability_settings_v2(
      portal.availability_settings,
      coalesce(p_availability_settings, '{}'::jsonb)
    ),
    updated_at = timezone('utc'::text, now())
  where portal.workspace_id = v_workspace_id
    and lower(trim(portal.owner_email::text)) = lower(trim(coalesce(p_owner_email, '')))
    and lower(trim(portal.salon_code)) = lower(trim(coalesce(p_salon_code, '')))
  returning portal.* into v_portal;

  if not found then
    raise exception 'workspace_not_found';
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.salon_name, ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

revoke all on function public.update_client_portal_availability_settings(text, text, jsonb)
  from public, anon;
grant execute on function public.update_client_portal_availability_settings(text, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
