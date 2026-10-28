-- Resize one item of a linked composition and shift every later item in the
-- same transaction. Existing overlap and workspace guards still run for each
-- updated appointment row; any refusal rolls the complete operation back.

create or replace function public.resize_owner_linked_appointment_duration_v1(
  p_appointment_id uuid,
  p_next_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.appointments%rowtype;
  v_previous_duration integer;
  v_delta integer;
  v_result jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_reorganization_result jsonb;
  v_shifted jsonb := '[]'::jsonb;
begin
  select * into v_target
  from public.appointments
  where id = p_appointment_id
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
  v_result := public.resize_owner_appointment_duration_v3(
    p_appointment_id,
    p_next_duration_minutes,
    true,
    true
  );
  v_delta := p_next_duration_minutes - v_previous_duration;

  if v_delta <> 0 and v_target.appointment_group_id is not null then
    if exists (
      select 1
      from public.appointments as later
      where later.workspace_id = v_target.workspace_id
        and later.appointment_group_id = v_target.appointment_group_id
        and coalesce(later.appointment_group_order, 0) >
          coalesce(v_target.appointment_group_order, 0)
        and (
          extract(epoch from later.appointment_time)::integer / 60 + v_delta
        ) not between 0 and 1439
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

create or replace function public.update_owner_linked_phased_appointment_times_v1(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
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
  select * into v_target
  from public.appointments
  where id = p_appointment_id
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
  v_next_duration := p_initial_duration_minutes +
    p_processing_duration_minutes + p_final_duration_minutes;
  v_result := public.update_owner_phased_appointment_times_v3(
    p_appointment_id,
    p_initial_duration_minutes,
    p_processing_duration_minutes,
    p_final_duration_minutes,
    true,
    true
  );
  v_delta := v_next_duration - v_previous_duration;

  if v_delta <> 0 and v_target.appointment_group_id is not null then
    if exists (
      select 1
      from public.appointments as later
      where later.workspace_id = v_target.workspace_id
        and later.appointment_group_id = v_target.appointment_group_id
        and coalesce(later.appointment_group_order, 0) >
          coalesce(v_target.appointment_group_order, 0)
        and (
          extract(epoch from later.appointment_time)::integer / 60 + v_delta
        ) not between 0 and 1439
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

revoke all on function public.resize_owner_linked_appointment_duration_v1(
  uuid, integer, boolean, boolean
) from public;
grant execute on function public.resize_owner_linked_appointment_duration_v1(
  uuid, integer, boolean, boolean
) to authenticated;

revoke all on function public.update_owner_linked_phased_appointment_times_v1(
  uuid, integer, integer, integer, boolean, boolean
) from public;
grant execute on function public.update_owner_linked_phased_appointment_times_v1(
  uuid, integer, integer, integer, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
