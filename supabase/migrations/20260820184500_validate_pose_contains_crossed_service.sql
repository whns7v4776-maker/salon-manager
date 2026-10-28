-- A service crossed by a transparent processing window is conflict-free only
-- when its complete customer envelope fits inside that processing window.
-- Busy phases were already checked; this closes the nested phased-service gap.

create or replace function public.move_owner_appointment_direct_v3(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_next_start timestamp;
  v_next_end timestamp;
  v_pose_start timestamp;
  v_pose_end timestamp;
  v_initial_minutes integer;
  v_processing_minutes integer;
  v_customer_duration_minutes integer;
  v_target_operator_id text;
  v_target_operator_name text;
  v_pose_does_not_cover_service boolean := false;
  v_customer_conflict boolean := false;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_scope not in ('whole', 'initial', 'final') then
    raise exception 'invalid_scope';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || p_next_appointment_date::text)
  );

  v_initial_minutes := case
    when coalesce(v_appointment.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
      then greatest((v_appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 1)
    else greatest(coalesce(v_appointment.duration_minutes, 60), 1)
  end;
  v_processing_minutes := case
    when coalesce(v_appointment.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
      then greatest((v_appointment.phase_snapshot ->> 'processingDurationMinutes')::integer, 0)
    else 0
  end;
  v_target_operator_id := coalesce(
    nullif(trim(p_next_initial_operator_id), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'id'), ''),
    nullif(trim(v_appointment.operator_id), '')
  );
  v_target_operator_name := lower(coalesce(
    nullif(trim(p_next_initial_operator_name), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'name'), ''),
    nullif(trim(v_appointment.operator_name), '')
  ));

  if p_scope = 'whole'
     and v_processing_minutes > 0
     and not coalesce(p_allow_overlap, false) then
    v_pose_start := p_next_appointment_date::timestamp + p_next_appointment_time
      + make_interval(mins => v_initial_minutes);
    v_pose_end := v_pose_start + make_interval(mins => v_processing_minutes);

    with candidate_envelopes as (
      select
        appointment.id::text as candidate_id,
        appointment.appointment_date::timestamp + appointment.appointment_time as starts_at,
        appointment.appointment_date::timestamp + appointment.appointment_time
          + make_interval(
              mins => case
                when coalesce(appointment.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(appointment.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(appointment.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
                then greatest(
                  (appointment.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (appointment.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (appointment.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  1
                )
                else greatest(coalesce(appointment.duration_minutes, 60), 1)
              end
            ) as ends_at,
        coalesce(
          nullif(trim(appointment.phase_operator_assignments -> 'initial' ->> 'id'), ''),
          nullif(trim(appointment.operator_id), '')
        ) as initial_operator_id,
        lower(coalesce(
          nullif(trim(appointment.phase_operator_assignments -> 'initial' ->> 'name'), ''),
          nullif(trim(appointment.operator_name), '')
        )) as initial_operator_name,
        nullif(trim(appointment.phase_operator_assignments -> 'final' ->> 'id'), '') as final_operator_id,
        lower(nullif(trim(appointment.phase_operator_assignments -> 'final' ->> 'name'), '')) as final_operator_name
      from public.appointments as appointment
      where appointment.workspace_id = v_appointment.workspace_id
        and appointment.appointment_date = p_next_appointment_date
        and appointment.id <> v_appointment.id

      union all

      select
        request.id::text,
        request.appointment_date::timestamp + request.appointment_time,
        request.appointment_date::timestamp + request.appointment_time
          + make_interval(
              mins => case
                when coalesce(request.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(request.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(request.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
                then greatest(
                  (request.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (request.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (request.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  1
                )
                else greatest(coalesce(request.requested_duration_minutes, 60), 1)
              end
            ),
        coalesce(
          nullif(trim(request.phase_operator_assignments -> 'initial' ->> 'id'), ''),
          nullif(trim(request.requested_operator_id), '')
        ),
        lower(coalesce(
          nullif(trim(request.phase_operator_assignments -> 'initial' ->> 'name'), ''),
          nullif(trim(request.requested_operator_name), '')
        )),
        nullif(trim(request.phase_operator_assignments -> 'final' ->> 'id'), ''),
        lower(nullif(trim(request.phase_operator_assignments -> 'final' ->> 'name'), ''))
      from public.booking_requests as request
      where request.workspace_id = v_appointment.workspace_id
        and request.appointment_date = p_next_appointment_date
        and request.status in ('pending', 'accepted')
        and request.id is distinct from v_appointment.booking_request_id
        and not exists (
          select 1
          from public.appointments as linked
          where linked.booking_request_id = request.id
        )
    )
    select exists (
      select 1
      from candidate_envelopes as candidate
      where candidate.starts_at < v_pose_end
        and candidate.ends_at > v_pose_start
        and not (
          candidate.starts_at >= v_pose_start
          and candidate.ends_at <= v_pose_end
        )
        and (
          (
            v_target_operator_id is not null
            and v_target_operator_id in (
              candidate.initial_operator_id,
              candidate.final_operator_id
            )
          )
          or (
            v_target_operator_id is null
            and v_target_operator_name <> ''
            and v_target_operator_name in (
              candidate.initial_operator_name,
              candidate.final_operator_name
            )
          )
        )
    ) into v_pose_does_not_cover_service;

    if v_pose_does_not_cover_service then
      raise exception 'pose_does_not_cover_service';
    end if;
  end if;

  if not p_allow_customer_overlap then
    v_customer_duration_minutes := case
      when coalesce(v_appointment.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
       and coalesce(v_appointment.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
       and coalesce(v_appointment.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
      then greatest(
        (v_appointment.phase_snapshot ->> 'initialDurationMinutes')::integer
          + (v_appointment.phase_snapshot ->> 'processingDurationMinutes')::integer
          + (v_appointment.phase_snapshot ->> 'finalDurationMinutes')::integer,
        1
      )
      else greatest(coalesce(v_appointment.duration_minutes, 60), 1)
    end;

    v_next_start := p_next_appointment_date::timestamp + p_next_appointment_time;
    v_next_end := v_next_start + make_interval(mins => v_customer_duration_minutes);

    select exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_appointment.workspace_id
        and other.id <> v_appointment.id
        and (
          (
            v_appointment.customer_id is not null
            and other.customer_id is not null
            and other.customer_id = v_appointment.customer_id
          )
          or (
            lower(regexp_replace(trim(coalesce(other.customer_name, '')), '\s+', ' ', 'g')) =
              lower(regexp_replace(trim(coalesce(v_appointment.customer_name, '')), '\s+', ' ', 'g'))
            and trim(coalesce(v_appointment.customer_name, '')) <> ''
          )
        )
        and (other.appointment_date::timestamp + other.appointment_time) < v_next_end
        and (
          other.appointment_date::timestamp + other.appointment_time
          + make_interval(
              mins => case
                when coalesce(other.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(other.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(other.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
                then greatest(
                  (other.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  1
                )
                else greatest(coalesce(other.duration_minutes, 60), 1)
              end
            )
        ) > v_next_start
    ) into v_customer_conflict;

    if v_customer_conflict then
      raise exception 'customer_time_overlap';
    end if;
  end if;

  v_result := public.move_owner_appointment_direct_v2(
    p_appointment_id,
    p_next_appointment_date,
    p_next_appointment_time,
    p_next_initial_operator_id,
    p_next_initial_operator_name,
    p_next_final_operator_id,
    p_next_final_operator_name,
    p_scope,
    p_allow_overlap
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'customer_overlap_forced', p_allow_customer_overlap,
    'pose_coverage_checked', p_scope = 'whole' and v_processing_minutes > 0
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v3(
  uuid, date, time, text, text, text, text, text, boolean, boolean
) from public;
grant execute on function public.move_owner_appointment_direct_v3(
  uuid, date, time, text, text, text, text, text, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
