-- A slot interval can be programmed in advance. The same date-aware rule is
-- shared by owner operations and public booking guards; explicit per-date
-- overrides always win so existing appointments keep their original grid.

create or replace function public.availability_slot_interval_for_date(
  p_settings jsonb,
  p_date date
)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_settings jsonb := coalesce(p_settings, '{}'::jsonb);
  v_interval integer;
  v_scheduled_interval integer;
  v_effective_from date;
begin
  if p_date is not null then
    select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
    into v_interval
    from jsonb_array_elements(
      coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)
    ) as date_interval
    where date_interval ->> 'date' = p_date::text
    limit 1;
  end if;

  if v_interval is null and p_date is not null then
    begin
      v_scheduled_interval := nullif(
        trim(coalesce(v_settings ->> 'scheduledSlotIntervalMinutes', '')),
        ''
      )::integer;
    exception when others then
      v_scheduled_interval := null;
    end;
    begin
      v_effective_from := nullif(
        trim(coalesce(v_settings ->> 'scheduledSlotIntervalEffectiveFrom', '')),
        ''
      )::date;
    exception when others then
      v_effective_from := null;
    end;

    if v_effective_from is not null and p_date >= v_effective_from then
      v_interval := v_scheduled_interval;
    end if;
  end if;

  if v_interval is null then
    begin
      v_interval := nullif(
        trim(coalesce(v_settings ->> 'slotIntervalMinutes', '')),
        ''
      )::integer;
    exception when others then
      v_interval := null;
    end;
  end if;

  if v_interval is null
     or v_interval < 5
     or v_interval > 300
     or v_interval % 5 <> 0 then
    return 30;
  end if;

  return v_interval;
end;
$$;

grant execute on function public.availability_slot_interval_for_date(jsonb, date)
to anon, authenticated;

create or replace function public.merge_client_portal_slot_interval_schedule_v1(
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
    v_existing_ts := nullif(
      trim(coalesce(v_existing ->> 'slotIntervalUpdatedAt', '')),
      ''
    )::timestamptz;
  exception when others then
    v_existing_ts := null;
  end;
  begin
    v_incoming_ts := nullif(
      trim(coalesce(v_incoming ->> 'slotIntervalUpdatedAt', '')),
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
         and not (v_incoming ? 'scheduledSlotIntervalMinutes')
         and (v_existing ? 'scheduledSlotIntervalMinutes')
       )
     ) then
    return jsonb_set(
      jsonb_set(
        v_result,
        '{scheduledSlotIntervalMinutes}',
        coalesce(v_existing -> 'scheduledSlotIntervalMinutes', 'null'::jsonb),
        true
      ),
      '{scheduledSlotIntervalEffectiveFrom}',
      coalesce(
        v_existing -> 'scheduledSlotIntervalEffectiveFrom',
        'null'::jsonb
      ),
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
  v_anchor text :=
    'return public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result);';
  v_replacement text :=
    'return public.merge_client_portal_slot_interval_schedule_v1(v_existing, v_incoming, public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result));';
  v_next text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('merge_client_portal_slot_interval_schedule_v1' in v_definition) > 0 then
    return;
  end if;

  v_next := replace(v_definition, v_anchor, v_replacement);
  if v_next = v_definition then
    raise exception 'slot_interval_schedule_merge_anchor_missing';
  end if;

  execute v_next;
end;
$$;

-- The existing RPCs historically resolved an explicit date override and then
-- the global interval inline. Replace only that resolution block with the
-- shared date-aware helper, leaving every surrounding conflict and permission
-- rule untouched.
do $$
declare
  v_proc record;
  v_definition text;
  v_next text;
  v_start integer;
  v_end_relative integer;
  v_end integer;
  v_date_expression text;
  v_start_anchor text :=
    'select nullif(date_interval ->> ''slotIntervalMinutes'', '''')::integer';
begin
  for v_proc in
    select
      procedure.oid,
      procedure.proname
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'shorten_owner_appointment_duration',
        'accept_owner_booking_request_with_duration_v1',
        'accept_owner_booking_request_with_operator_v1',
        'propose_owner_booking_operator_change_v1',
        'resize_owner_appointment_duration_v1',
        'resize_owner_appointment_duration_v2'
      )
  loop
    select pg_get_functiondef(v_proc.oid) into v_definition;
    if position('availability_slot_interval_for_date' in v_definition) > 0 then
      continue;
    end if;

    v_start := position(v_start_anchor in v_definition);
    if v_start = 0 then
      -- Some RPC names have newer wrapper overloads that delegate to the
      -- original implementation and intentionally contain no interval logic.
      -- Leave those wrappers byte-for-byte unchanged and patch only the
      -- overload that owns the date interval validation.
      continue;
    end if;

    v_end_relative := position('end if;' in substring(v_definition from v_start));
    if v_end_relative = 0 then
      raise exception 'slot_interval_validation_anchor_missing:%', v_proc.proname;
    end if;
    v_end := v_start + v_end_relative - 1 + length('end if;') - 1;

    v_date_expression := case
      when v_proc.proname in (
        'accept_owner_booking_request_with_duration_v1',
        'accept_owner_booking_request_with_operator_v1',
        'propose_owner_booking_operator_change_v1'
      ) then 'v_request.appointment_date'
      else 'v_appointment.appointment_date'
    end;

    v_next :=
      substring(v_definition from 1 for v_start - 1)
      || 'v_slot_interval := public.availability_slot_interval_for_date(v_settings, '
      || v_date_expression
      || ');'
      || substring(v_definition from v_end + 1);

    execute v_next;
  end loop;
end;
$$;
