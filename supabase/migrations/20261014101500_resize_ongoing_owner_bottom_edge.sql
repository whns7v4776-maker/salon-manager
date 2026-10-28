-- Only the lower edge of an active appointment may change. Existing resize
-- contracts remain responsible for collisions, resources and booking sync.
create or replace function public.resize_owner_ongoing_appointment_duration_v1(
 p_appointment_id uuid, p_next_duration_minutes integer,
 p_allow_operator_overlap boolean default false,
 p_allow_customer_overlap boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare wid uuid; a public.appointments%rowtype; live_time timestamp; start_time timestamp;
begin
 if auth.uid() is null then raise exception 'auth_required'; end if;
 wid:=public.current_workspace_id();
 if wid is null or not public.workspace_access_allowed() then raise exception 'workspace_access_denied'; end if;
 select * into a from appointments where workspace_id=wid and id=p_appointment_id;
 if a.id is null then raise exception 'appointment_not_found'; end if;
 perform pg_advisory_xact_lock(hashtext(wid::text||':'||a.appointment_date::text));
 select * into a from appointments where workspace_id=wid and id=p_appointment_id for update;
 live_time:=clock_timestamp() at time zone 'Europe/Rome';
 start_time:=a.appointment_date::timestamp+a.appointment_time;
 if live_time<start_time or live_time>=start_time+make_interval(mins=>greatest(coalesce(a.duration_minutes,60),1)) then raise exception 'ongoing_phase_not_active'; end if;
 if coalesce(a.phase_snapshot->>'mode','')='phased' then raise exception 'appointment_is_phased'; end if;
 if p_next_duration_minutes is null or p_next_duration_minutes<5 or p_next_duration_minutes>720 then raise exception 'invalid_duration'; end if;
 if start_time+make_interval(mins=>p_next_duration_minutes)<=live_time then raise exception 'duration_end_in_past'; end if;
 -- Shrinking cannot introduce collisions: preserve the existing safe shortening contract.
 if p_next_duration_minutes < greatest(coalesce(a.duration_minutes,60),1) then
  return public.shorten_owner_appointment_duration(p_appointment_id,p_next_duration_minutes);
 end if;
 return public.resize_owner_linked_appointment_duration_v1(p_appointment_id,p_next_duration_minutes,p_allow_operator_overlap,p_allow_customer_overlap);
end $$;
revoke all on function public.resize_owner_ongoing_appointment_duration_v1(uuid,integer,boolean,boolean) from public;
grant execute on function public.resize_owner_ongoing_appointment_duration_v1(uuid,integer,boolean,boolean) to authenticated;

create or replace function public.resize_owner_ongoing_phased_segment_v1(
  p_appointment_id uuid,
  p_phase text,
  p_next_phase_duration_minutes integer,
  p_next_processing_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_phase text := lower(trim(coalesce(p_phase, '')));
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_phase_enabled boolean;
  v_next_initial integer;
  v_next_processing integer;
  v_next_final integer;
  v_now timestamp := now() at time zone 'Europe/Rome';
  v_appointment_start timestamp;
  v_phase_start timestamp;
  v_phase_end timestamp;
  v_next_phase_end timestamp;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  if p_appointment_id is null
     or v_phase not in ('initial', 'final')
     or p_next_phase_duration_minutes is null then
    raise exception 'invalid_arguments';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_appointment.appointment_date::text)
  );

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;

  v_initial := nullif(
    v_appointment.phase_snapshot ->> 'initialDurationMinutes',
    ''
  )::integer;
  v_processing := nullif(
    v_appointment.phase_snapshot ->> 'processingDurationMinutes',
    ''
  )::integer;
  v_final := nullif(
    v_appointment.phase_snapshot ->> 'finalDurationMinutes',
    ''
  )::integer;
  v_final_phase_enabled := coalesce(
    (v_appointment.phase_snapshot ->> 'finalPhaseEnabled')::boolean,
    true
  );

  if v_initial is null
     or v_initial < 5
     or v_processing is null
     or v_processing < 0
     or v_final is null
     or (v_final_phase_enabled and v_final < 5) then
    raise exception 'invalid_phase_snapshot';
  end if;
  if p_next_phase_duration_minutes < 5
     or p_next_phase_duration_minutes > 480
     or p_next_phase_duration_minutes % 5 <> 0 then
    raise exception 'invalid_phase_duration';
  end if;

  v_appointment_start :=
    v_appointment.appointment_date::timestamp + v_appointment.appointment_time;
  if v_phase = 'initial' then
    v_phase_start := v_appointment_start;
    v_phase_end := v_phase_start + make_interval(mins => v_initial);
    v_next_initial := p_next_phase_duration_minutes;
    -- Keep the already-planned final phase fixed. The newly freed interval is
    -- operator availability inside the existing customer pose window.
    v_next_processing := coalesce(p_next_processing_duration_minutes, greatest(0, v_processing + v_initial - v_next_initial));
    v_next_final := v_final;
    if v_next_processing < 0 or v_next_processing > 480 then
      raise exception 'invalid_phase_duration';
    end if;
  else
    if not v_final_phase_enabled then
      raise exception 'final_phase_disabled';
    end if;
    v_phase_start := v_appointment_start
      + make_interval(mins => v_initial + v_processing);
    v_phase_end := v_phase_start + make_interval(mins => v_final);
    v_next_initial := v_initial;
    v_next_processing := v_processing;
    v_next_final := p_next_phase_duration_minutes;
  end if;

  v_now := clock_timestamp() at time zone 'Europe/Rome';
  if v_now < v_phase_start or v_now >= v_phase_end then
    raise exception 'ongoing_phase_not_active';
  end if;

  v_next_phase_end :=
    v_phase_start + make_interval(mins => p_next_phase_duration_minutes);
  if v_next_phase_end <= v_now then
    raise exception 'duration_end_in_past';
  end if;

  v_result := public.update_owner_phased_appointment_times_v3(
    p_appointment_id,
    v_next_initial,
    v_next_processing,
    v_next_final,
    false,
    false
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'resizedPhase', v_phase,
    'previousPhaseDurationMinutes',
      case when v_phase = 'initial' then v_initial else v_final end,
    'nextPhaseDurationMinutes', p_next_phase_duration_minutes
  );
end;
$$;

revoke all on function public.resize_owner_ongoing_phased_segment_v1(
  uuid, text, integer, integer
) from public;
grant execute on function public.resize_owner_ongoing_phased_segment_v1(
  uuid, text, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
