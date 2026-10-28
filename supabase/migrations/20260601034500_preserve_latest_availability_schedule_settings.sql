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
begin
  begin
    v_existing_guided_ts := nullif(trim(coalesce(v_existing ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_existing_guided_ts := null;
  end;

  begin
    v_incoming_guided_ts := nullif(trim(coalesce(v_incoming ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_incoming_guided_ts := null;
  end;

  begin
    v_existing_weekly_ts := nullif(trim(coalesce(v_existing ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_existing_weekly_ts := null;
  end;

  begin
    v_incoming_weekly_ts := nullif(trim(coalesce(v_incoming ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_incoming_weekly_ts := null;
  end;

  begin
    v_existing_slot_ts := nullif(trim(coalesce(v_existing ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_existing_slot_ts := null;
  end;

  begin
    v_incoming_slot_ts := nullif(trim(coalesce(v_incoming ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_incoming_slot_ts := null;
  end;

  if v_existing_guided_ts is not null
     and (v_incoming_guided_ts is null or v_existing_guided_ts > v_incoming_guided_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_result, '{guidedSlotsEnabled}', coalesce(v_existing -> 'guidedSlotsEnabled', 'false'::jsonb), true),
          '{guidedSlotsStrategy}',
          coalesce(v_existing -> 'guidedSlotsStrategy', to_jsonb('balanced'::text)),
          true
        ),
        '{guidedSlotsVisibility}',
        coalesce(v_existing -> 'guidedSlotsVisibility', to_jsonb('recommended_first'::text)),
        true
      ),
      '{guidedSlotsUpdatedAt}',
      coalesce(v_existing -> 'guidedSlotsUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  if v_existing_weekly_ts is not null
     and (v_incoming_weekly_ts is null or v_existing_weekly_ts > v_incoming_weekly_ts) then
    v_result := jsonb_set(
      jsonb_set(
        v_result,
        '{weeklySchedule}',
        coalesce(v_existing -> 'weeklySchedule', '[]'::jsonb),
        true
      ),
      '{weeklyScheduleUpdatedAt}',
      coalesce(v_existing -> 'weeklyScheduleUpdatedAt', 'null'::jsonb),
      true
    );

    v_result := jsonb_set(
      jsonb_set(
        v_result,
        '{lunchBreakStart}',
        coalesce(v_existing -> 'lunchBreakStart', to_jsonb('13:00'::text)),
        true
      ),
      '{lunchBreakEnd}',
      coalesce(v_existing -> 'lunchBreakEnd', to_jsonb('14:00'::text)),
      true
    );

    v_result := jsonb_set(
      v_result,
      '{lunchBreakEnabled}',
      coalesce(v_existing -> 'lunchBreakEnabled', 'false'::jsonb),
      true
    );
  end if;

  if v_existing_slot_ts is not null
     and (v_incoming_slot_ts is null or v_existing_slot_ts > v_incoming_slot_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_result,
          '{slotIntervalMinutes}',
          coalesce(v_existing -> 'slotIntervalMinutes', to_jsonb(30)),
          true
        ),
        '{dateSlotIntervals}',
        coalesce(v_existing -> 'dateSlotIntervals', '[]'::jsonb),
        true
      ),
      '{slotIntervalUpdatedAt}',
      coalesce(v_existing -> 'slotIntervalUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return v_result;
end;
$$;
