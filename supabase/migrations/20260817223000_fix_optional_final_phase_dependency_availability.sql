-- Optional-final phased services must not reserve a synthetic final minute.
--
-- Service dependencies are persisted atomically as two consecutive requests.
-- Both the automatic dependency and the customer-choice dependency use that
-- same writer.  When the parent has no final phase, the add-on begins exactly
-- after initial work + processing.  The original overlap helper coerced a
-- stored final duration of 0 to 1 minute and rejected that valid boundary.
--
-- Legacy phased snapshots did not carry finalPhaseEnabled, so absence keeps
-- the historical behaviour (a real final phase).  Only an explicit false
-- disables the final busy interval.

create or replace function public.booking_busy_snapshot_overlaps_range(
  p_appointment_date date,
  p_appointment_time time,
  p_fallback_duration_minutes integer,
  p_phase_snapshot jsonb,
  p_requested_start_at timestamp,
  p_requested_end_at timestamp
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_base_start timestamp := p_appointment_date::timestamp + p_appointment_time;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_start timestamp;
  v_has_final boolean := lower(trim(coalesce(
    p_phase_snapshot ->> 'finalPhaseEnabled',
    'true'
  ))) <> 'false';
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') = 'phased'
    and coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
    and coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
    and (
      not v_has_final
      or coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
    )
  then
    v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
    v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);

    if (
      v_base_start < p_requested_end_at
      and v_base_start + make_interval(mins => v_initial) > p_requested_start_at
    ) then
      return true;
    end if;

    if not v_has_final then
      return false;
    end if;

    v_final := greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1);
    v_final_start := v_base_start + make_interval(mins => v_initial + v_processing);

    return v_final_start < p_requested_end_at
      and v_final_start + make_interval(mins => v_final) > p_requested_start_at;
  end if;

  return v_base_start < p_requested_end_at
    and v_base_start + make_interval(
      mins => greatest(coalesce(p_fallback_duration_minutes, 60), 1)
    ) > p_requested_start_at;
end;
$$;

comment on function public.booking_busy_snapshot_overlaps_range(
  date, time, integer, jsonb, timestamp, timestamp
) is
  'Checks operator-busy segments for continuous or phased bookings. An explicit finalPhaseEnabled=false reserves only the initial operator segment and never creates a synthetic final interval.';

notify pgrst, 'reload schema';
