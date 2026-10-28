-- Public slot batches validate many candidate starts for the same date. The
-- canonical exact-slot validator used to re-query the day's appointments and
-- requests for every candidate, interval and operator. Keep those immutable
-- read inputs once per PostgreSQL request and use them only from read planners;
-- booking writers continue to call the original live validator.

create or replace function public.get_public_booking_busy_records_cached_read_v1(
  p_workspace_id uuid,
  p_appointment_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cache_key text := coalesce(p_workspace_id::text, '') || ':' || coalesce(p_appointment_date::text, '');
  v_cached_key text := nullif(current_setting('salonpro.public_booking_busy_key', true), '');
  v_cached_value text := nullif(current_setting('salonpro.public_booking_busy_json', true), '');
  v_value jsonb;
begin
  if p_workspace_id is null or p_appointment_date is null then
    return '[]'::jsonb;
  end if;

  if v_cached_key = v_cache_key and v_cached_value is not null then
    begin
      return v_cached_value::jsonb;
    exception when others then
      null;
    end;
  end if;

  with appointment_records as (
    select jsonb_build_object(
      'source', 'appointment',
      'recordId', appointment.id,
      'bookingRequestId', appointment.booking_request_id,
      'appointmentDate', appointment.appointment_date,
      'appointmentTime', appointment.appointment_time,
      'durationMinutes', coalesce(appointment.duration_minutes, 60),
      'phaseSnapshot', coalesce(appointment.phase_snapshot, '{}'::jsonb),
      'existingServiceName', appointment.service_name,
      'existingOperatorId', appointment.operator_id,
      'existingOperatorName', appointment.operator_name
    ) as value
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = p_workspace_id
          and terminal_request.status in ('cancelled', 'rejected')
          and terminal_request.appointment_date = appointment.appointment_date
          and terminal_request.appointment_time = appointment.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(appointment.service_name, '')))
          and lower(trim(concat_ws(
            ' ',
            coalesce(terminal_request.customer_name, ''),
            coalesce(terminal_request.customer_surname, '')
          ))) = lower(trim(coalesce(appointment.customer_name, '')))
          and not exists (
            select 1
            from public.booking_requests as newer_active_request
            where newer_active_request.workspace_id = terminal_request.workspace_id
              and newer_active_request.status in ('pending', 'accepted')
              and newer_active_request.appointment_date = terminal_request.appointment_date
              and newer_active_request.appointment_time = terminal_request.appointment_time
              and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                lower(trim(coalesce(terminal_request.requested_service_name, '')))
              and lower(trim(concat_ws(
                ' ',
                coalesce(newer_active_request.customer_name, ''),
                coalesce(newer_active_request.customer_surname, '')
              ))) = lower(trim(concat_ws(
                ' ',
                coalesce(terminal_request.customer_name, ''),
                coalesce(terminal_request.customer_surname, '')
              )))
              and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                coalesce(terminal_request.updated_at, terminal_request.created_at)
          )
      )
  ), request_records as (
    select jsonb_build_object(
      'source', 'request',
      'recordId', booking_request.id,
      'bookingRequestId', booking_request.id,
      'appointmentDate', booking_request.appointment_date,
      'appointmentTime', booking_request.appointment_time,
      'durationMinutes', coalesce(booking_request.requested_duration_minutes, 60),
      'phaseSnapshot', coalesce(booking_request.phase_snapshot, '{}'::jsonb),
      'existingServiceName', coalesce(matched_appointment.service_name, booking_request.requested_service_name),
      'existingOperatorId', coalesce(matched_appointment.operator_id, booking_request.requested_operator_id),
      'existingOperatorName', coalesce(matched_appointment.operator_name, booking_request.requested_operator_name)
    ) as value
    from public.booking_requests as booking_request
    left join lateral (
      select
        appointment.service_name,
        appointment.operator_id,
        appointment.operator_name
      from public.appointments as appointment
      where appointment.workspace_id = booking_request.workspace_id
        and (
          appointment.booking_request_id = booking_request.id
          or (
            appointment.appointment_date = booking_request.appointment_date
            and appointment.appointment_time = booking_request.appointment_time
            and lower(trim(coalesce(appointment.service_name, ''))) =
              lower(trim(coalesce(booking_request.requested_service_name, '')))
            and (
              appointment.customer_id = booking_request.customer_id
              or lower(trim(coalesce(appointment.customer_name, ''))) =
                lower(trim(concat_ws(
                  ' ',
                  coalesce(booking_request.customer_name, ''),
                  coalesce(booking_request.customer_surname, '')
                )))
            )
          )
        )
      order by case when appointment.booking_request_id = booking_request.id then 0 else 1 end
      limit 1
    ) as matched_appointment on booking_request.status = 'accepted'
    where booking_request.workspace_id = p_workspace_id
      and booking_request.appointment_date = p_appointment_date
      and booking_request.status in ('pending', 'accepted')
      and (booking_request.status <> 'accepted' or matched_appointment.service_name is not null)
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = p_workspace_id
          and terminal_request.status in ('cancelled', 'rejected')
          and terminal_request.appointment_date = booking_request.appointment_date
          and terminal_request.appointment_time = booking_request.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(booking_request.requested_service_name, '')))
          and lower(trim(concat_ws(
            ' ',
            coalesce(terminal_request.customer_name, ''),
            coalesce(terminal_request.customer_surname, '')
          ))) = lower(trim(concat_ws(
            ' ',
            coalesce(booking_request.customer_name, ''),
            coalesce(booking_request.customer_surname, '')
          )))
          and not exists (
            select 1
            from public.booking_requests as newer_active_request
            where newer_active_request.workspace_id = terminal_request.workspace_id
              and newer_active_request.status in ('pending', 'accepted')
              and newer_active_request.appointment_date = terminal_request.appointment_date
              and newer_active_request.appointment_time = terminal_request.appointment_time
              and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                lower(trim(coalesce(terminal_request.requested_service_name, '')))
              and lower(trim(concat_ws(
                ' ',
                coalesce(newer_active_request.customer_name, ''),
                coalesce(newer_active_request.customer_surname, '')
              ))) = lower(trim(concat_ws(
                ' ',
                coalesce(terminal_request.customer_name, ''),
                coalesce(terminal_request.customer_surname, '')
              )))
              and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                coalesce(terminal_request.updated_at, terminal_request.created_at)
          )
      )
  ), all_records as (
    select value from appointment_records
    union all
    select value from request_records
  )
  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_value
  from all_records;

  perform set_config('salonpro.public_booking_busy_key', v_cache_key, true);
  perform set_config('salonpro.public_booking_busy_json', v_value::text, true);
  return v_value;
end;
$$;

revoke all on function public.get_public_booking_busy_records_cached_read_v1(uuid, date)
  from public, anon, authenticated;

create or replace function public.get_public_phased_busy_intervals_cached_read_v1(
  p_workspace_id uuid,
  p_appointment_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cache_key text := coalesce(p_workspace_id::text, '') || ':' || coalesce(p_appointment_date::text, '');
  v_cached_key text := nullif(current_setting('salonpro.public_booking_phased_busy_key', true), '');
  v_cached_value text := nullif(current_setting('salonpro.public_booking_phased_busy_json', true), '');
  v_value jsonb;
begin
  if p_workspace_id is null or p_appointment_date is null then
    return '[]'::jsonb;
  end if;

  if v_cached_key = v_cache_key and v_cached_value is not null then
    begin
      return v_cached_value::jsonb;
    exception when others then
      null;
    end;
  end if;

  with appointment_intervals as (
    select jsonb_build_object(
      'startsAt', appointment.appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => phase.start_offset),
      'endsAt', appointment.appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => phase.start_offset + phase.duration_minutes),
      'operatorId', nullif(trim(coalesce(
        appointment.phase_operator_assignments -> phase.phase_name ->> 'id',
        appointment.operator_id
      )), ''),
      'operatorName', lower(nullif(trim(coalesce(
        appointment.phase_operator_assignments -> phase.phase_name ->> 'name',
        appointment.operator_name
      )), ''))
    ) as value
    from public.appointments as appointment
    cross join lateral (
      select
        'initial'::text as phase_name,
        0 as start_offset,
        case
          when coalesce(appointment.phase_snapshot ->> 'mode', '') = 'phased'
            then greatest(coalesce((appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
          else greatest(coalesce(appointment.duration_minutes, 60), 1)
        end as duration_minutes
      union all
      select
        'final'::text,
        greatest(coalesce((appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 0)
          + greatest(coalesce((appointment.phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 0),
        greatest(coalesce((appointment.phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 0)
      where coalesce(appointment.phase_snapshot ->> 'mode', '') = 'phased'
    ) as phase
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
  ), request_intervals as (
    select jsonb_build_object(
      'startsAt', booking_request.appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => phase.start_offset),
      'endsAt', booking_request.appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => phase.start_offset + phase.duration_minutes),
      'operatorId', nullif(trim(coalesce(
        booking_request.phase_operator_assignments -> phase.phase_name ->> 'id',
        booking_request.requested_operator_id
      )), ''),
      'operatorName', lower(nullif(trim(coalesce(
        booking_request.phase_operator_assignments -> phase.phase_name ->> 'name',
        booking_request.requested_operator_name
      )), ''))
    ) as value
    from public.booking_requests as booking_request
    cross join lateral (
      select
        'initial'::text as phase_name,
        0 as start_offset,
        case
          when coalesce(booking_request.phase_snapshot ->> 'mode', '') = 'phased'
            then greatest(coalesce((booking_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
          else greatest(coalesce(booking_request.requested_duration_minutes, 60), 1)
        end as duration_minutes
      union all
      select
        'final'::text,
        greatest(coalesce((booking_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 0)
          + greatest(coalesce((booking_request.phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 0),
        greatest(coalesce((booking_request.phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 0)
      where coalesce(booking_request.phase_snapshot ->> 'mode', '') = 'phased'
    ) as phase
    where booking_request.workspace_id = p_workspace_id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and not exists (
        select 1
        from public.appointments as linked
        where linked.booking_request_id = booking_request.id
      )
  ), all_intervals as (
    select value from appointment_intervals
    union all
    select value from request_intervals
  )
  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_value
  from all_intervals;

  perform set_config('salonpro.public_booking_phased_busy_key', v_cache_key, true);
  perform set_config('salonpro.public_booking_phased_busy_json', v_value::text, true);
  return v_value;
end;
$$;

revoke all on function public.get_public_phased_busy_intervals_cached_read_v1(uuid, date)
  from public, anon, authenticated;

create or replace function public.phased_operator_interval_conflicts_cached_read_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_operator_id text default null,
  p_operator_name text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      p_appointment_date::timestamp + p_start_time as starts_at,
      p_appointment_date::timestamp + p_start_time
        + make_interval(mins => greatest(coalesce(p_duration_minutes, 1), 1)) as ends_at,
      nullif(trim(coalesce(p_operator_id, '')), '') as operator_id,
      lower(nullif(trim(coalesce(p_operator_name, '')), '')) as operator_name
  )
  select exists (
    select 1
    from jsonb_array_elements(
      public.get_public_phased_busy_intervals_cached_read_v1(
        p_workspace_id,
        p_appointment_date
      )
    ) as busy(value)
    cross join target
    where (busy.value ->> 'startsAt')::timestamp < target.ends_at
      and (busy.value ->> 'endsAt')::timestamp > target.starts_at
      and (
        (
          target.operator_id is not null
          and nullif(busy.value ->> 'operatorId', '') = target.operator_id
        )
        or (
          target.operator_name is not null
          and nullif(busy.value ->> 'operatorName', '') = target.operator_name
          and (
            target.operator_id is null
            or nullif(busy.value ->> 'operatorId', '') is null
          )
        )
        or (
          target.operator_id is null
          and target.operator_name is null
          and nullif(busy.value ->> 'operatorId', '') is null
          and nullif(busy.value ->> 'operatorName', '') is null
        )
      )
  );
$$;

revoke all on function public.phased_operator_interval_conflicts_cached_read_v1(
  uuid, date, time, integer, text, text
) from public, anon, authenticated;

-- Clone the currently deployed exact validator, preserving all accumulated
-- calendar, capacity, terminal-request and machinery rules. Replace only its
-- busy-record source with the request-local snapshot above.
do $install_cached_exact_read_validator$
declare
  v_source_signature regprocedure :=
    'public.is_public_booking_slot_available(uuid,date,time without time zone,integer,text,text,text)'::regprocedure;
  v_definition text;
  v_loop_start integer;
  v_loop_tail integer;
  v_tail_anchor text := 'loop';
  v_replacement text := $replacement$  for v_overlapping_record in
    select
      busy.value ->> 'existingServiceName' as existing_service_name,
      busy.value ->> 'existingOperatorId' as existing_operator_id,
      busy.value ->> 'existingOperatorName' as existing_operator_name
    from jsonb_array_elements(
      public.get_public_booking_busy_records_cached_read_v1(
        p_workspace_id,
        p_appointment_date
      )
    ) as busy(value)
    where coalesce(busy.value ->> 'recordId', '') <> coalesce(
        nullif(current_setting('app.booking_exclude_appointment_id', true), ''),
        '__none__'
      )
      and coalesce(busy.value ->> 'bookingRequestId', '') <> coalesce(
        nullif(current_setting('app.booking_exclude_request_id', true), ''),
        '__none__'
      )
      and public.booking_busy_snapshot_overlaps_range(
        (busy.value ->> 'appointmentDate')::date,
        (busy.value ->> 'appointmentTime')::time,
        greatest(coalesce((busy.value ->> 'durationMinutes')::integer, 60), 1),
        coalesce(busy.value -> 'phaseSnapshot', '{}'::jsonb),
        v_requested_start_at,
        v_requested_end_at
      )
$replacement$;
begin
  select pg_get_functiondef(v_source_signature) into v_definition;
  v_definition := replace(
    v_definition,
    'FUNCTION public.is_public_booking_slot_available(',
    'FUNCTION public.is_public_booking_slot_available_cached_read_v1('
  );

  v_loop_start := position('for v_overlapping_record in' in lower(v_definition));
  if v_loop_start = 0 then
    raise exception 'cached_public_booking_loop_start_missing';
  end if;

  v_loop_tail := position(v_tail_anchor in lower(substring(v_definition from v_loop_start)));
  if v_loop_tail = 0 then
    raise exception 'cached_public_booking_loop_tail_missing';
  end if;

  v_definition := substring(v_definition from 1 for v_loop_start - 1)
    || v_replacement
    || substring(v_definition from v_loop_start + v_loop_tail - 1);
  execute v_definition;
end;
$install_cached_exact_read_validator$;

revoke all on function public.is_public_booking_slot_available_cached_read_v1(
  uuid, date, time, integer, text, text, text
) from public, anon, authenticated;

create or replace function public.is_public_operator_interval_available_cached_read_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_requested_service_name text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_public_booking_slot_available_cached_read_v1(
      p_workspace_id,
      p_appointment_date,
      p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 1), 1),
      p_requested_service_name,
      p_requested_operator_id,
      p_requested_operator_name
    )
    and not public.phased_operator_interval_conflicts_cached_read_v1(
      p_workspace_id,
      p_appointment_date,
      p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 1), 1),
      p_requested_operator_id,
      p_requested_operator_name
    );
$$;

revoke all on function public.is_public_operator_interval_available_cached_read_v1(
  uuid, date, time, integer, text, text, text
) from public, anon, authenticated;

-- Only availability readers are redirected. Atomic booking writers retain the
-- uncached exact validator so their in-transaction inserts are always visible.
do $install_cached_public_read_planners$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.get_public_booking_slot_availability_batch(uuid,date,jsonb,text,text,text)'::regprocedure,
    'public.get_public_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text)'::regprocedure,
    'public.get_public_phased_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text,boolean)'::regprocedure,
    'public.get_public_phased_booking_slot_availability_batch_v3(uuid,date,jsonb,text,text,text,text,boolean)'::regprocedure,
    'public.resolve_public_composition_operator_plan_v1(uuid,uuid,date,time without time zone,text,text,text,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated := replace(
      v_definition,
      'public.is_public_operator_interval_available_v1(',
      'public.is_public_operator_interval_available_cached_read_v1('
    );

    if v_updated = v_definition then
      raise exception 'cached_public_read_planner_anchor_missing:%', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$install_cached_public_read_planners$;

notify pgrst, 'reload schema';
