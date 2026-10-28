-- Atomic swap for two complete owner Agenda compositions.
-- This is an additive contract used by the native Agenda only. Both groups are
-- locked, written and validated in one transaction; the canonical workspace
-- snapshot is refreshed before commit so every connected app/web client sees
-- the same final layout through the existing realtime subscriptions.

create or replace function public.apply_owner_composition_swap_v1(
  p_source_anchor_appointment_id uuid,
  p_target_anchor_appointment_id uuid,
  p_items jsonb,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.appointments%rowtype;
  v_target public.appointments%rowtype;
  v_source_ids uuid[] := array[]::uuid[];
  v_target_ids uuid[] := array[]::uuid[];
  v_expected_ids uuid[] := array[]::uuid[];
  v_plan_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_current public.appointments%rowtype;
  v_item_id uuid;
  v_date date;
  v_time time;
  v_initial_id text;
  v_initial_name text;
  v_final_id text;
  v_final_name text;
  v_assignments jsonb;
  v_overrides jsonb;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_operator_conflict boolean := false;
  v_customer_conflict boolean := false;
  v_customer_visible_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_source_anchor_appointment_id is null
     or p_target_anchor_appointment_id is null
     or p_source_anchor_appointment_id = p_target_anchor_appointment_id
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_composition_swap_plan';
  end if;

  select appointment.*
  into v_source
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_source_anchor_appointment_id
  for update;

  if v_source.id is null then
    raise exception 'appointment_not_found';
  end if;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.id = p_target_anchor_appointment_id
    and appointment.workspace_id = v_source.workspace_id
  for update;

  if v_target.id is null then
    raise exception 'appointment_not_found';
  end if;

  select coalesce(array_agg(appointment.id order by appointment.id), array[]::uuid[])
  into v_source_ids
  from public.appointments as appointment
  where appointment.workspace_id = v_source.workspace_id
    and (
      (v_source.appointment_group_id is not null
        and appointment.appointment_group_id = v_source.appointment_group_id)
      or (v_source.appointment_group_id is null and appointment.id = v_source.id)
    );

  select coalesce(array_agg(appointment.id order by appointment.id), array[]::uuid[])
  into v_target_ids
  from public.appointments as appointment
  where appointment.workspace_id = v_source.workspace_id
    and (
      (v_target.appointment_group_id is not null
        and appointment.appointment_group_id = v_target.appointment_group_id)
      or (v_target.appointment_group_id is null and appointment.id = v_target.id)
    );

  if v_source_ids && v_target_ids then
    raise exception 'composition_swap_requires_distinct_groups';
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_expected_ids
  from (
    select unnest(v_source_ids) as id
    union
    select unnest(v_target_ids) as id
  ) as expected;

  select coalesce(array_agg(plan.id order by plan.id), array[]::uuid[])
  into v_plan_ids
  from (
    select distinct nullif(item ->> 'appointmentId', '')::uuid as id
    from jsonb_array_elements(p_items) as item
  ) as plan
  where plan.id is not null;

  if cardinality(v_plan_ids) <> cardinality(v_expected_ids)
     or v_plan_ids <> v_expected_ids then
    raise exception 'incomplete_composition_swap_plan';
  end if;

  perform 1
  from public.appointments as appointment
  where appointment.id = any(v_expected_ids)
  order by appointment.id
  for update;

  perform set_config('salonpro.allow_owner_customer_overlap', 'on', true);
  perform set_config('salonpro.allow_owner_operator_overlap', 'on', true);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item ->> 'appointmentId', '')::uuid;

    select appointment.*
    into v_current
    from public.appointments as appointment
    where appointment.id = v_item_id;

    if v_current.id is null or v_current.workspace_id <> v_source.workspace_id then
      raise exception 'appointment_not_found';
    end if;

    if v_current.appointment_date::timestamp + v_current.appointment_time
       <= timezone('Europe/Rome', now()) then
      raise exception 'appointment_already_started';
    end if;

    v_date := coalesce(
      nullif(v_item ->> 'appointmentDate', '')::date,
      v_current.appointment_date
    );
    v_time := coalesce(
      nullif(v_item ->> 'appointmentTime', '')::time,
      v_current.appointment_time
    );
    v_initial_id := coalesce(
      nullif(trim(v_item ->> 'initialOperatorId'), ''),
      nullif(trim(v_current.phase_operator_assignments -> 'initial' ->> 'id'), ''),
      nullif(trim(v_current.operator_id), '')
    );
    v_initial_name := coalesce(
      nullif(trim(v_item ->> 'initialOperatorName'), ''),
      nullif(trim(v_current.phase_operator_assignments -> 'initial' ->> 'name'), ''),
      nullif(trim(v_current.operator_name), ''),
      'Salone'
    );
    v_final_id := coalesce(
      nullif(trim(v_item ->> 'finalOperatorId'), ''),
      nullif(trim(v_current.phase_operator_assignments -> 'final' ->> 'id'), ''),
      v_initial_id
    );
    v_final_name := coalesce(
      nullif(trim(v_item ->> 'finalOperatorName'), ''),
      nullif(trim(v_current.phase_operator_assignments -> 'final' ->> 'name'), ''),
      v_initial_name
    );
    v_assignments := case
      when coalesce(v_current.phase_snapshot ->> 'mode', '') = 'phased' then
        jsonb_build_object(
          'version', 1,
          'initial', jsonb_build_object('id', v_initial_id, 'name', v_initial_name),
          'final', jsonb_build_object('id', v_final_id, 'name', v_final_name)
        )
      else v_current.phase_operator_assignments
    end;
    v_overrides := coalesce(
      v_item -> 'phaseOverlapOverrides',
      v_current.phase_overlap_overrides
    );
    v_customer_visible_changed :=
      v_current.appointment_date is distinct from v_date
      or v_current.appointment_time is distinct from v_time
      or lower(trim(coalesce(
          v_current.phase_operator_assignments -> 'initial' ->> 'name',
          v_current.operator_name,
          ''
        ))) is distinct from lower(trim(coalesce(v_initial_name, '')))
      or lower(trim(coalesce(
          v_current.phase_operator_assignments -> 'final' ->> 'name',
          v_current.operator_name,
          ''
        ))) is distinct from lower(trim(coalesce(v_final_name, '')));

    update public.appointments
    set appointment_date = v_date,
        appointment_time = v_time,
        operator_id = v_initial_id,
        operator_name = v_initial_name,
        phase_operator_assignments = v_assignments,
        phase_overlap_overrides = v_overrides,
        updated_at = timezone('utc', now())
    where id = v_current.id;

    if v_current.booking_request_id is not null then
      update public.booking_requests
      set appointment_date = v_date,
          appointment_time = v_time,
          requested_operator_id = v_initial_id,
          requested_operator_name = v_initial_name,
          phase_operator_assignments = v_assignments,
          phase_overlap_overrides = v_overrides,
          viewed_by_customer = case
            when v_customer_visible_changed then false
            else viewed_by_customer
          end,
          viewed_by_salon = true,
          updated_at = timezone('utc', now())
      where id = v_current.booking_request_id;
    end if;
  end loop;

  for v_current in
    select appointment.*
    from public.appointments as appointment
    where appointment.id = any(v_expected_ids)
    order by appointment.id
  loop
    v_initial := case
      when coalesce(v_current.phase_snapshot ->> 'mode', '') = 'phased'
        then greatest(
          coalesce((v_current.phase_snapshot ->> 'initialDurationMinutes')::integer, 1),
          1
        )
      else greatest(coalesce(v_current.duration_minutes, 60), 1)
    end;
    v_processing := case
      when coalesce(v_current.phase_snapshot ->> 'mode', '') = 'phased'
        then greatest(
          coalesce((v_current.phase_snapshot ->> 'processingDurationMinutes')::integer, 0),
          0
        )
      else 0
    end;
    v_final := case
      when coalesce(v_current.phase_snapshot ->> 'mode', '') = 'phased'
        then greatest(
          coalesce((v_current.phase_snapshot ->> 'finalDurationMinutes')::integer, 0),
          0
        )
      else 0
    end;
    v_final_time := (
      v_current.appointment_time + make_interval(mins => v_initial + v_processing)
    )::time;

    v_operator_conflict := v_operator_conflict
      or public.phased_operator_interval_conflicts_v1(
        v_current.workspace_id,
        v_current.appointment_date,
        v_current.appointment_time,
        v_initial,
        coalesce(
          v_current.phase_operator_assignments -> 'initial' ->> 'id',
          v_current.operator_id
        ),
        coalesce(
          v_current.phase_operator_assignments -> 'initial' ->> 'name',
          v_current.operator_name
        ),
        v_current.id,
        v_current.booking_request_id
      );

    if v_final > 0 then
      v_operator_conflict := v_operator_conflict
        or public.phased_operator_interval_conflicts_v1(
          v_current.workspace_id,
          v_current.appointment_date,
          v_final_time,
          v_final,
          coalesce(
            v_current.phase_operator_assignments -> 'final' ->> 'id',
            v_current.operator_id
          ),
          coalesce(
            v_current.phase_operator_assignments -> 'final' ->> 'name',
            v_current.operator_name
          ),
          v_current.id,
          v_current.booking_request_id
        );
    end if;

    select exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_current.workspace_id
        and other.id <> v_current.id
        and (
          v_current.appointment_group_id is null
          or other.appointment_group_id is distinct from v_current.appointment_group_id
        )
        and (
          (v_current.customer_id is not null and other.customer_id = v_current.customer_id)
          or lower(trim(other.customer_name)) = lower(trim(v_current.customer_name))
        )
        and other.appointment_date::timestamp + other.appointment_time
          < v_current.appointment_date::timestamp + v_current.appointment_time
            + make_interval(mins => greatest(
                coalesce(
                  (v_current.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (v_current.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (v_current.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  v_current.duration_minutes,
                  60
                ),
                1
              ))
        and other.appointment_date::timestamp + other.appointment_time
            + make_interval(mins => greatest(
                coalesce(
                  (other.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  other.duration_minutes,
                  60
                ),
                1
              ))
          > v_current.appointment_date::timestamp + v_current.appointment_time
    ) into v_customer_conflict;

    exit when v_customer_conflict;
  end loop;

  if v_operator_conflict and not p_allow_operator_overlap then
    raise exception 'owner_operator_overlap';
  end if;
  if v_customer_conflict and not p_allow_customer_overlap then
    raise exception 'customer_time_overlap';
  end if;

  perform public.refresh_workspace_agenda_state(v_source.workspace_id);

  return jsonb_build_object(
    'ok', true,
    'sourceAppointmentIds', to_jsonb(v_source_ids),
    'targetAppointmentIds', to_jsonb(v_target_ids),
    'appointmentIds', to_jsonb(v_expected_ids),
    'operatorOverlap', v_operator_conflict,
    'customerOverlap', v_customer_conflict
  );
end;
$$;

revoke all on function public.apply_owner_composition_swap_v1(
  uuid, uuid, jsonb, boolean, boolean
) from public;

grant execute on function public.apply_owner_composition_swap_v1(
  uuid, uuid, jsonb, boolean, boolean
) to authenticated;

select pg_notify('pgrst', 'reload schema');
