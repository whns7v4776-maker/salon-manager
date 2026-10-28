create or replace function public.resolve_public_portal_availability_settings(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_owner_payload jsonb := '{}'::jsonb;
  v_owner_settings jsonb := '{}'::jsonb;
  v_portal_settings jsonb := '{}'::jsonb;
begin
  v_owner_payload := public.get_public_portal_owner_payload(p_workspace_id);
  v_owner_settings := coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb);

  select coalesce(portal.availability_settings, '{}'::jsonb)
  into v_portal_settings
  from public.client_portals as portal
  where portal.workspace_id = p_workspace_id
  order by portal.updated_at desc nulls last
  limit 1;

  return public.merge_client_portal_availability_settings(
    coalesce(v_portal_settings, '{}'::jsonb),
    coalesce(v_owner_settings, '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_client_portal_availability_settings(p_salon_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_payload jsonb := '{}'::jsonb;
  v_workspace_payload jsonb := '{}'::jsonb;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  order by
    case when w.subscription_status = 'active' then 0 else 1 end,
    w.updated_at desc nulls last,
    w.created_at desc nulls last,
    w.id desc
  limit 1;

  if v_workspace.id is null then
    return null;
  end if;

  v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
  v_workspace_payload := coalesce(v_owner_payload -> 'workspace', '{}'::jsonb);

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_workspace.id,
      'ownerEmail', coalesce(nullif(trim(v_workspace_payload ->> 'ownerEmail'), ''), v_workspace.owner_email::text),
      'salonCode', coalesce(nullif(trim(v_workspace_payload ->> 'salonCode'), ''), v_workspace.slug),
      'salonName', coalesce(nullif(trim(v_workspace_payload ->> 'salonName'), ''), v_workspace.salon_name),
      'updatedAt', v_workspace.updated_at
    ),
    'availabilitySettings', public.resolve_public_portal_availability_settings(v_workspace.id)
  );
end;
$$;

create or replace function public.is_public_booking_time_allowed_by_availability(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_override jsonb;
  v_day_schedule jsonb;
  v_date_text text := p_appointment_date::text;
  v_weekday integer := extract(dow from p_appointment_date)::integer;
  v_requested_start_at timestamp := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at timestamp :=
    p_appointment_date::timestamp + p_appointment_time
    + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1));
  v_force_open boolean := false;
  v_lunch_start time;
  v_lunch_end time;
begin
  v_settings := public.resolve_public_portal_availability_settings(p_workspace_id);

  select override_item
  into v_override
  from jsonb_array_elements(coalesce(v_settings -> 'dateOverrides', '[]'::jsonb)) as override_item
  where override_item ->> 'date' = v_date_text
  limit 1;

  v_force_open := coalesce((v_override ->> 'forceOpen')::boolean, false);

  if coalesce((v_override ->> 'closed')::boolean, false) then
    return false;
  end if;

  if not v_force_open and exists (
    select 1
    from jsonb_array_elements(coalesce(v_settings -> 'vacationRanges', '[]'::jsonb)) as vacation_item
    where coalesce(vacation_item ->> 'startDate', '') <= v_date_text
      and v_date_text <= coalesce(vacation_item ->> 'endDate', '')
  ) then
    return false;
  end if;

  if not v_force_open then
    select schedule_item
    into v_day_schedule
    from jsonb_array_elements(coalesce(v_settings -> 'weeklySchedule', '[]'::jsonb)) as schedule_item
    where (schedule_item ->> 'weekday')::integer = v_weekday
    limit 1;

    if v_day_schedule is not null then
      if coalesce((v_day_schedule ->> 'isClosed')::boolean, false) then
        return false;
      end if;

      if p_appointment_time < coalesce(nullif(v_day_schedule ->> 'startTime', '')::time, '00:00'::time) then
        return false;
      end if;

      if v_requested_end_at > (
        p_appointment_date::timestamp
        + coalesce(nullif(v_day_schedule ->> 'endTime', '')::time, '23:59'::time)
      ) then
        return false;
      end if;
    end if;
  end if;

  if coalesce((v_settings ->> 'lunchBreakEnabled')::boolean, false) then
    v_lunch_start := nullif(v_settings ->> 'lunchBreakStart', '')::time;
    v_lunch_end := nullif(v_settings ->> 'lunchBreakEnd', '')::time;

    if v_lunch_start is not null
      and v_lunch_end is not null
      and v_requested_start_at < (p_appointment_date::timestamp + v_lunch_end)
      and v_requested_end_at > (p_appointment_date::timestamp + v_lunch_start)
    then
      return false;
    end if;
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_public_portal_availability_settings(uuid) to anon;
grant execute on function public.resolve_public_portal_availability_settings(uuid) to authenticated;
grant execute on function public.get_client_portal_availability_settings(text) to anon;
grant execute on function public.get_client_portal_availability_settings(text) to authenticated;
grant execute on function public.is_public_booking_time_allowed_by_availability(uuid, date, time, integer) to anon;
grant execute on function public.is_public_booking_time_allowed_by_availability(uuid, date, time, integer) to authenticated;

notify pgrst, 'reload schema';
