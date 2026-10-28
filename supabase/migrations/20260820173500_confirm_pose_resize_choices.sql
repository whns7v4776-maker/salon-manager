-- A pose can be shortened down to zero only after the salon confirms it in
-- the client. Keeping the pose and shifting later composition items is a
-- separate, explicit atomic operation; ordinary phase resizing stays local.

create or replace function public.update_owner_phased_appointment_times_v2(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_customer_overlap boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_snapshot jsonb;
  v_assignments jsonb;
  v_initial_operator_id text;
  v_initial_operator_name text;
  v_final_operator_id text;
  v_final_operator_name text;
  v_final_phase_enabled boolean;
  v_previous_total integer;
  v_total integer;
  v_start_at timestamp;
  v_end_at timestamp;
  v_final_time time;
  v_customer_conflict boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
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
  if coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;

  v_final_phase_enabled := coalesce(
    (v_appointment.phase_snapshot ->> 'finalPhaseEnabled')::boolean,
    true
  );
  if coalesce(p_initial_duration_minutes, 0) < 5
     or p_initial_duration_minutes > 480
     or coalesce(p_processing_duration_minutes, -1) < 0
     or p_processing_duration_minutes > 480
     or coalesce(p_final_duration_minutes, -1) < 0
     or p_final_duration_minutes > 480
     or (v_final_phase_enabled and p_final_duration_minutes < 5)
     or (not v_final_phase_enabled and p_final_duration_minutes <> 0)
     or p_initial_duration_minutes % 5 <> 0
     or p_processing_duration_minutes % 5 <> 0
     or p_final_duration_minutes % 5 <> 0 then
    raise exception 'invalid_phase_duration';
  end if;

  v_previous_total := case
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
  v_total := p_initial_duration_minutes + p_processing_duration_minutes
    + p_final_duration_minutes;
  v_start_at := v_appointment.appointment_date::timestamp
    + v_appointment.appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_total);
  v_final_time := (
    v_appointment.appointment_time
    + make_interval(mins => p_initial_duration_minutes + p_processing_duration_minutes)
  )::time;
  v_snapshot := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_appointment.phase_snapshot,
        '{initialDurationMinutes}',
        to_jsonb(p_initial_duration_minutes)
      ),
      '{processingDurationMinutes}',
      to_jsonb(p_processing_duration_minutes)
    ),
    '{finalDurationMinutes}',
    to_jsonb(p_final_duration_minutes)
  );

  v_assignments := coalesce(v_appointment.phase_operator_assignments, '{}'::jsonb);
  v_initial_operator_id := coalesce(
    nullif(v_assignments #>> '{initial,id}', ''),
    nullif(v_appointment.operator_id, '')
  );
  v_initial_operator_name := coalesce(
    nullif(v_assignments #>> '{initial,name}', ''),
    nullif(v_appointment.operator_name, '')
  );
  v_final_operator_id := coalesce(
    nullif(v_assignments #>> '{final,id}', ''),
    v_initial_operator_id
  );
  v_final_operator_name := coalesce(
    nullif(v_assignments #>> '{final,name}', ''),
    v_initial_operator_name
  );

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || v_appointment.appointment_date::text)
  );

  if current_setting('salonpro.allow_owner_operator_overlap', true) <> 'on'
     and (
       public.phased_operator_interval_conflicts_v1(
         v_appointment.workspace_id,
         v_appointment.appointment_date,
         v_appointment.appointment_time,
         p_initial_duration_minutes,
         v_initial_operator_id,
         v_initial_operator_name,
         v_appointment.id,
         v_appointment.booking_request_id
       )
       or (
         v_final_phase_enabled
         and public.phased_operator_interval_conflicts_v1(
           v_appointment.workspace_id,
           v_appointment.appointment_date,
           v_final_time,
           p_final_duration_minutes,
           v_final_operator_id,
           v_final_operator_name,
           v_appointment.id,
           v_appointment.booking_request_id
         )
       )
     ) then
    raise exception 'target_slot_occupied';
  end if;

  if v_total > v_previous_total and not coalesce(p_allow_customer_overlap, false) then
    select exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_appointment.workspace_id
        and other.id <> v_appointment.id
        and other.appointment_date = v_appointment.appointment_date
        and (
          (v_appointment.customer_id is not null and other.customer_id = v_appointment.customer_id)
          or (
            trim(coalesce(v_appointment.customer_name, '')) <> ''
            and lower(regexp_replace(trim(coalesce(other.customer_name, '')), '\s+', ' ', 'g')) =
              lower(regexp_replace(trim(coalesce(v_appointment.customer_name, '')), '\s+', ' ', 'g'))
          )
        )
        and (other.appointment_date::timestamp + other.appointment_time) < v_end_at
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
        ) > v_start_at
    ) into v_customer_conflict;

    if v_customer_conflict then
      raise exception 'customer_time_overlap';
    end if;
  end if;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = v_snapshot
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = v_total,
        phase_snapshot = v_snapshot,
        updated_at = timezone('utc', now())
    where id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_appointment.workspace_id);
  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'duration_minutes', v_total,
    'phase_snapshot', v_snapshot,
    'customer_overlap_forced', coalesce(p_allow_customer_overlap, false)
  );
end;
$$;

create or replace function public.update_owner_linked_phased_appointment_times_v2(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false,
  p_shift_following boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.appointments%rowtype;
  v_previous_duration integer;
  v_next_duration integer;
  v_delta integer;
  v_result jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_reorganization_result jsonb;
  v_shifted jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select appointment.* into v_target
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;
  if v_target.id is null then
    raise exception using errcode = 'P0002', message = 'appointment_not_found';
  end if;

  if v_target.appointment_group_id is not null then
    perform 1
    from public.appointments
    where workspace_id = v_target.workspace_id
      and appointment_group_id = v_target.appointment_group_id
    for update;
  end if;

  v_previous_duration := greatest(coalesce(v_target.duration_minutes, 0), 1);
  v_next_duration := p_initial_duration_minutes + p_processing_duration_minutes
    + p_final_duration_minutes;
  v_result := public.update_owner_phased_appointment_times_v3(
    p_appointment_id,
    p_initial_duration_minutes,
    p_processing_duration_minutes,
    p_final_duration_minutes,
    case when p_shift_following then true else p_allow_operator_overlap end,
    case when p_shift_following then true else p_allow_customer_overlap end
  );
  v_delta := v_next_duration - v_previous_duration;

  if p_shift_following and v_delta <> 0 and v_target.appointment_group_id is not null then
    if exists (
      select 1
      from public.appointments as later
      where later.workspace_id = v_target.workspace_id
        and later.appointment_group_id = v_target.appointment_group_id
        and coalesce(later.appointment_group_order, 0) >
          coalesce(v_target.appointment_group_order, 0)
        and (extract(epoch from later.appointment_time)::integer / 60 + v_delta)
          not between 0 and 1439
    ) then
      raise exception using errcode = '22023', message = 'linked_timeline_outside_day';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'appointmentId', item.id,
        'appointmentDate', item.appointment_date,
        'appointmentTime', to_char(
          case
            when coalesce(item.appointment_group_order, 0) >
              coalesce(v_target.appointment_group_order, 0)
              then (item.appointment_time + make_interval(mins => v_delta))::time
            else item.appointment_time
          end,
          'HH24:MI'
        ),
        'initialOperatorId', coalesce(
          item.phase_operator_assignments -> 'initial' ->> 'id',
          item.operator_id
        ),
        'initialOperatorName', coalesce(
          item.phase_operator_assignments -> 'initial' ->> 'name',
          item.operator_name
        ),
        'finalOperatorId', coalesce(
          item.phase_operator_assignments -> 'final' ->> 'id',
          item.operator_id
        ),
        'finalOperatorName', coalesce(
          item.phase_operator_assignments -> 'final' ->> 'name',
          item.operator_name
        ),
        'phaseOverlapOverrides', item.phase_overlap_overrides
      ) order by item.appointment_group_order, item.id
    ) into v_plan
    from public.appointments as item
    where item.workspace_id = v_target.workspace_id
      and item.appointment_group_id = v_target.appointment_group_id;

    v_reorganization_result := public.apply_owner_linked_reorganization_v1(
      p_appointment_id,
      v_plan,
      p_allow_operator_overlap,
      p_allow_customer_overlap
    );

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'appointmentId', item ->> 'id',
          'appointmentDate', item ->> 'appointment_date',
          'appointmentTime', left(item ->> 'appointment_time', 5)
        ) order by (item ->> 'appointment_group_order')::integer, item ->> 'id'
      ) filter (
        where coalesce((item ->> 'appointment_group_order')::integer, 0) >
          coalesce(v_target.appointment_group_order, 0)
      ),
      '[]'::jsonb
    ) into v_shifted
    from jsonb_array_elements(
      coalesce(v_reorganization_result -> 'appointments', '[]'::jsonb)
    ) as item;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'shiftedAppointments', v_shifted
  );
end;
$$;

revoke all on function public.update_owner_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean
) from public;
grant execute on function public.update_owner_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean
) to authenticated;

revoke all on function public.update_owner_linked_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean, boolean, boolean
) from public;
grant execute on function public.update_owner_linked_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
