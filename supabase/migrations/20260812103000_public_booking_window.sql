create or replace function public.merge_client_portal_availability_settings(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_existing_guided_ts timestamptz;
  v_incoming_guided_ts timestamptz;
  v_existing_weekly_ts timestamptz;
  v_incoming_weekly_ts timestamptz;
  v_existing_slot_ts timestamptz;
  v_incoming_slot_ts timestamptz;
  v_existing_contact_ts timestamptz;
  v_incoming_contact_ts timestamptz;
  v_existing_booking_window_ts timestamptz;
  v_incoming_booking_window_ts timestamptz;
begin
  begin
    v_existing_guided_ts := nullif(trim(coalesce(v_existing ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_guided_ts := null;
  end;
  begin
    v_incoming_guided_ts := nullif(trim(coalesce(v_incoming ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_guided_ts := null;
  end;
  begin
    v_existing_weekly_ts := nullif(trim(coalesce(v_existing ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_weekly_ts := null;
  end;
  begin
    v_incoming_weekly_ts := nullif(trim(coalesce(v_incoming ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_weekly_ts := null;
  end;
  begin
    v_existing_slot_ts := nullif(trim(coalesce(v_existing ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_slot_ts := null;
  end;
  begin
    v_incoming_slot_ts := nullif(trim(coalesce(v_incoming ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_slot_ts := null;
  end;
  begin
    v_existing_contact_ts := nullif(trim(coalesce(v_existing ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_contact_ts := null;
  end;
  begin
    v_incoming_contact_ts := nullif(trim(coalesce(v_incoming ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_contact_ts := null;
  end;
  begin
    v_existing_booking_window_ts := nullif(trim(coalesce(v_existing ->> 'publicBookingWindowUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_booking_window_ts := null;
  end;
  begin
    v_incoming_booking_window_ts := nullif(trim(coalesce(v_incoming ->> 'publicBookingWindowUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_booking_window_ts := null;
  end;

  if v_existing_guided_ts is not null
     and (v_incoming_guided_ts is null or v_existing_guided_ts > v_incoming_guided_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_result, '{guidedSlotsEnabled}', coalesce(v_existing -> 'guidedSlotsEnabled', 'false'::jsonb), true),
          '{guidedSlotsStrategy}', coalesce(v_existing -> 'guidedSlotsStrategy', to_jsonb('balanced'::text)), true
        ),
        '{guidedSlotsVisibility}', coalesce(v_existing -> 'guidedSlotsVisibility', to_jsonb('recommended_first'::text)), true
      ),
      '{guidedSlotsUpdatedAt}', coalesce(v_existing -> 'guidedSlotsUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_weekly_ts is not null
     and (v_incoming_weekly_ts is null or v_existing_weekly_ts > v_incoming_weekly_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(v_result, '{weeklySchedule}', coalesce(v_existing -> 'weeklySchedule', '[]'::jsonb), true),
                '{dateOverrides}', coalesce(v_existing -> 'dateOverrides', '[]'::jsonb), true
              ),
              '{vacationRanges}', coalesce(v_existing -> 'vacationRanges', '[]'::jsonb), true
            ),
            '{lunchBreakEnabled}', coalesce(v_existing -> 'lunchBreakEnabled', 'false'::jsonb), true
          ),
          '{lunchBreakStart}', coalesce(v_existing -> 'lunchBreakStart', to_jsonb('13:00'::text)), true
        ),
        '{lunchBreakEnd}', coalesce(v_existing -> 'lunchBreakEnd', to_jsonb('14:00'::text)), true
      ),
      '{weeklyScheduleUpdatedAt}', coalesce(v_existing -> 'weeklyScheduleUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_slot_ts is not null
     and (v_incoming_slot_ts is null or v_existing_slot_ts > v_incoming_slot_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(v_result, '{slotIntervalMinutes}', coalesce(v_existing -> 'slotIntervalMinutes', to_jsonb(30)), true),
        '{dateSlotIntervals}', coalesce(v_existing -> 'dateSlotIntervals', '[]'::jsonb), true
      ),
      '{slotIntervalUpdatedAt}', coalesce(v_existing -> 'slotIntervalUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_contact_ts is not null
     and (v_incoming_contact_ts is null or v_existing_contact_ts > v_incoming_contact_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_result, '{customServiceContactEnabled}', coalesce(v_existing -> 'customServiceContactEnabled', 'false'::jsonb), true),
            '{customServiceContactTitle}', coalesce(v_existing -> 'customServiceContactTitle', to_jsonb('Un servizio pensato su misura per te'::text)), true
          ),
          '{customServiceContactMessage}', coalesce(v_existing -> 'customServiceContactMessage', to_jsonb(''::text)), true
        ),
        '{customServiceContactWhatsappMessage}', coalesce(v_existing -> 'customServiceContactWhatsappMessage', to_jsonb(''::text)), true
      ),
      '{customServiceContactUpdatedAt}', coalesce(v_existing -> 'customServiceContactUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_booking_window_ts is not null
     and (v_incoming_booking_window_ts is null or v_existing_booking_window_ts > v_incoming_booking_window_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_result,
          '{publicBookingWindowValue}',
          coalesce(v_existing -> 'publicBookingWindowValue', to_jsonb(90)),
          true
        ),
        '{publicBookingWindowUnit}',
        coalesce(v_existing -> 'publicBookingWindowUnit', to_jsonb('days'::text)),
        true
      ),
      '{publicBookingWindowUpdatedAt}',
      coalesce(v_existing -> 'publicBookingWindowUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.is_public_booking_date_within_window_v1(
  p_workspace_id uuid,
  p_appointment_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_today date := (timezone('Europe/Rome', now()))::date;
  v_unit text;
  v_value integer;
  v_end_date date;
begin
  if p_workspace_id is null or p_appointment_date is null then
    return false;
  end if;

  v_settings := public.resolve_public_portal_availability_settings(p_workspace_id);
  v_unit := lower(trim(coalesce(v_settings ->> 'publicBookingWindowUnit', 'days')));
  if v_unit not in ('days', 'weeks', 'months', 'years') then
    v_unit := 'days';
  end if;

  begin
    v_value := round(coalesce(nullif(v_settings ->> 'publicBookingWindowValue', '')::numeric, 90))::integer;
  exception when others then
    v_value := 90;
  end;

  v_value := greatest(1, least(
    v_value,
    case v_unit
      when 'weeks' then 104
      when 'months' then 24
      when 'years' then 2
      else 730
    end
  ));

  v_end_date := case v_unit
    when 'weeks' then v_today + (v_value * 7)
    when 'months' then (v_today + make_interval(months => v_value))::date
    when 'years' then (v_today + make_interval(years => v_value))::date
    else v_today + v_value
  end;

  return p_appointment_date between v_today and v_end_date;
end;
$$;

grant execute on function public.is_public_booking_date_within_window_v1(uuid, date)
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

  if position('is_public_booking_date_within_window_v1' in v_definition) > 0 then
    return;
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'public_booking_window_guard_anchor_missing';
  end if;

  v_definition := replace(
    v_definition,
    v_anchor,
    v_anchor || $inject$

  if not public.is_public_booking_date_within_window_v1(
    p_workspace_id,
    p_appointment_date
  ) then
    return false;
  end if;
$inject$
  );

  execute v_definition;
end;
$$;

notify pgrst, 'reload schema';
