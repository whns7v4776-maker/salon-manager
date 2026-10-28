-- Accept one linked booking group while applying the salon's manual override to
-- exactly the request card that opened the action. The target mutation and the
-- group acceptance share one database transaction, so a failed validation can
-- never leave a partially accepted composition behind.

create or replace function public.accept_owner_booking_request_group_with_member_override_v1(
  p_appointment_group_id uuid,
  p_target_request_id uuid,
  p_initial_operator_id text default null,
  p_initial_operator_name text default null,
  p_final_operator_id text default null,
  p_final_operator_name text default null,
  p_next_duration_minutes integer default null,
  p_ignore_conflicts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial_operator public.operators%rowtype;
  v_final_operator public.operators%rowtype;
  v_initial_operator_requested boolean := false;
  v_final_operator_requested boolean := false;
  v_request_role text;
  v_initial_operator_role text;
  v_final_operator_role text;
  v_is_phased boolean := false;
  v_has_final boolean := false;
  v_previous_duration integer;
  v_next_duration integer;
  v_initial_duration integer := 0;
  v_processing_duration integer := 0;
  v_final_duration integer := 0;
  v_final_time time;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_assignments jsonb;
  v_group_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if p_appointment_group_id is null or p_target_request_id is null then
    raise exception 'invalid_arguments';
  end if;

  if not exists (
    select 1
    from public.appointment_groups as appointment_group
    where appointment_group.id = p_appointment_group_id
      and appointment_group.workspace_id = v_workspace_id
  ) then
    raise exception 'appointment_group_not_found';
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_target_request_id
    and booking_request.appointment_group_id = p_appointment_group_id;

  if v_request.id is null then
    raise exception 'booking_request_not_in_group';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  -- Lock the complete logical booking before validating or changing its target.
  -- The status writer below sees the same locked snapshot and remains atomic.
  perform group_request.id
  from public.booking_requests as group_request
  where group_request.workspace_id = v_workspace_id
    and group_request.appointment_group_id = p_appointment_group_id
  order by group_request.appointment_group_order, group_request.created_at
  for update;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_target_request_id
    and booking_request.appointment_group_id = p_appointment_group_id;

  if v_request.status::text <> 'pending' then
    raise exception 'booking_request_already_processed';
  end if;

  if exists (
    select 1
    from public.booking_requests as group_request
    where group_request.workspace_id = v_workspace_id
      and group_request.appointment_group_id = p_appointment_group_id
      and group_request.status::text <> 'pending'
  ) then
    raise exception 'booking_group_already_processed';
  end if;

  v_initial_operator_requested :=
    nullif(trim(coalesce(p_initial_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_initial_operator_name, '')), '') is not null;
  v_final_operator_requested :=
    nullif(trim(coalesce(p_final_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_final_operator_name, '')), '') is not null;
  v_is_phased := coalesce(v_request.phase_snapshot ->> 'mode', '') = 'phased';
  v_previous_duration := greatest(
    coalesce(v_request.requested_duration_minutes, 60),
    1
  );
  v_request_role := lower(
    regexp_replace(trim(coalesce(v_request.required_role, '')), '\s+', ' ', 'g')
  );
  if v_request_role = '' then
    select lower(
      regexp_replace(trim(coalesce(service.required_role, '')), '\s+', ' ', 'g')
    )
    into v_request_role
    from public.services as service
    where service.workspace_id = v_workspace_id
      and lower(trim(service.name)) = lower(trim(v_request.requested_service_name))
    order by service.updated_at desc, service.created_at desc
    limit 1;
  end if;

  if not v_initial_operator_requested
    and not v_final_operator_requested
    and p_next_duration_minutes is null then
    raise exception 'group_member_override_required';
  end if;

  if not v_is_phased and v_final_operator_requested then
    raise exception 'final_operator_only_for_phased_request';
  end if;

  if v_is_phased then
    v_has_final := coalesce(
      (v_request.phase_snapshot ->> 'finalPhaseEnabled')::boolean,
      true
    );
    v_initial_duration := greatest(
      coalesce((v_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 1),
      1
    );
    v_processing_duration := greatest(
      coalesce((v_request.phase_snapshot ->> 'processingDurationMinutes')::integer, 0),
      0
    );
    v_final_duration := case
      when v_has_final then greatest(
        coalesce((v_request.phase_snapshot ->> 'finalDurationMinutes')::integer, 1),
        1
      )
      else 0
    end;

    if p_next_duration_minutes is not null
      and p_next_duration_minutes <> v_previous_duration then
      raise exception 'phased_duration_override_not_supported';
    end if;

    select operator.*
    into v_initial_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        operator.id::text = nullif(trim(coalesce(
          p_initial_operator_id,
          v_request.phase_operator_assignments -> 'initial' ->> 'id',
          v_request.requested_operator_id,
          ''
        )), '')
        or lower(trim(operator.name)) = lower(trim(coalesce(
          p_initial_operator_name,
          v_request.phase_operator_assignments -> 'initial' ->> 'name',
          v_request.requested_operator_name,
          ''
        )))
      )
    order by case
      when operator.id::text = nullif(trim(coalesce(
        p_initial_operator_id,
        v_request.phase_operator_assignments -> 'initial' ->> 'id',
        v_request.requested_operator_id,
        ''
      )), '') then 0
      else 1
    end
    limit 1;

    if v_initial_operator.id is null then
      raise exception 'operator_not_found';
    end if;

    select operator.*
    into v_final_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        operator.id::text = nullif(trim(coalesce(
          p_final_operator_id,
          v_request.phase_operator_assignments -> 'final' ->> 'id',
          v_initial_operator.id::text,
          ''
        )), '')
        or lower(trim(operator.name)) = lower(trim(coalesce(
          p_final_operator_name,
          v_request.phase_operator_assignments -> 'final' ->> 'name',
          v_initial_operator.name,
          ''
        )))
      )
    order by case
      when operator.id::text = nullif(trim(coalesce(
        p_final_operator_id,
        v_request.phase_operator_assignments -> 'final' ->> 'id',
        v_initial_operator.id::text,
        ''
      )), '') then 0
      else 1
    end
    limit 1;

    if v_final_operator.id is null then
      raise exception 'operator_not_found';
    end if;

    v_initial_operator_role := lower(
      regexp_replace(trim(coalesce(v_initial_operator.required_role, '')), '\s+', ' ', 'g')
    );
    v_final_operator_role := lower(
      regexp_replace(trim(coalesce(v_final_operator.required_role, '')), '\s+', ' ', 'g')
    );
    if coalesce(v_request_role, '') = ''
      or coalesce(v_initial_operator_role, '') = ''
      or coalesce(v_final_operator_role, '') = ''
      or v_initial_operator_role <> v_request_role
      or v_final_operator_role <> v_request_role then
      raise exception 'operator_not_eligible';
    end if;

    if not public.is_public_operator_available_on_date_v1(
      v_workspace_id,
      v_initial_operator.id::text,
      v_initial_operator.name,
      v_request.appointment_date
    ) or (
      v_has_final
      and not public.is_public_operator_available_on_date_v1(
        v_workspace_id,
        v_final_operator.id::text,
        v_final_operator.name,
        v_request.appointment_date
      )
    ) then
      raise exception 'operator_unavailable_on_date';
    end if;

    v_final_time := (
      v_request.appointment_time
      + make_interval(mins => v_initial_duration + v_processing_duration)
    )::time;

    if not coalesce(p_ignore_conflicts, false) and (
      public.phased_operator_interval_conflicts_v1(
        v_workspace_id,
        v_request.appointment_date,
        v_request.appointment_time,
        v_initial_duration,
        v_initial_operator.id::text,
        v_initial_operator.name,
        null,
        v_request.id
      )
      or (
        v_has_final
        and public.phased_operator_interval_conflicts_v1(
          v_workspace_id,
          v_request.appointment_date,
          v_final_time,
          v_final_duration,
          v_final_operator.id::text,
          v_final_operator.name,
          null,
          v_request.id
        )
      )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    v_assignments := jsonb_build_object(
      'version', 1,
      'initial', jsonb_build_object(
        'id', v_initial_operator.id::text,
        'name', v_initial_operator.name
      ),
      'final', jsonb_build_object(
        'id', v_final_operator.id::text,
        'name', v_final_operator.name
      )
    );

    update public.booking_requests
    set requested_operator_id = v_initial_operator.id::text,
        requested_operator_name = v_initial_operator.name,
        phase_operator_assignments = v_assignments,
        operator_change_status = null,
        operator_change_original_id = null,
        operator_change_original_name = null,
        operator_change_proposed_id = null,
        operator_change_proposed_name = null,
        operator_change_requested_at = null,
        operator_change_expires_at = null,
        operator_change_responded_at = null,
        updated_at = timezone('utc', now())
    where workspace_id = v_workspace_id
      and id = v_request.id
      and appointment_group_id = p_appointment_group_id;
  else
    v_next_duration := coalesce(p_next_duration_minutes, v_previous_duration);

    if v_next_duration < 5 or v_next_duration > v_previous_duration then
      raise exception 'duration_can_only_be_shortened';
    end if;

    if v_next_duration < v_previous_duration then
      v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);

      select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
      into v_slot_interval
      from jsonb_array_elements(
        coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)
      ) as date_interval
      where date_interval ->> 'date' = v_request.appointment_date::text
      limit 1;

      v_slot_interval := coalesce(
        v_slot_interval,
        nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
        30
      );
      if v_slot_interval < 5
        or v_slot_interval > 300
        or v_slot_interval % 5 <> 0 then
        v_slot_interval := 30;
      end if;
      if (v_previous_duration - v_next_duration) % v_slot_interval <> 0 then
        raise exception 'invalid_duration_step';
      end if;
    end if;

    if (
      v_request.appointment_date::timestamp
      + v_request.appointment_time
      + make_interval(mins => v_next_duration)
    ) <= (now() at time zone 'Europe/Rome') then
      raise exception 'duration_end_in_past';
    end if;

    if v_initial_operator_requested then
      select operator.*
      into v_initial_operator
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          operator.id::text = nullif(trim(coalesce(p_initial_operator_id, '')), '')
          or lower(trim(operator.name)) = lower(trim(coalesce(p_initial_operator_name, '')))
        )
      order by case
        when operator.id::text = nullif(trim(coalesce(p_initial_operator_id, '')), '') then 0
        else 1
      end
      limit 1;

      if v_initial_operator.id is null then
        raise exception 'operator_not_found';
      end if;

      v_initial_operator_role := lower(
        regexp_replace(trim(coalesce(v_initial_operator.required_role, '')), '\s+', ' ', 'g')
      );
      if coalesce(v_request_role, '') = ''
        or coalesce(v_initial_operator_role, '') = ''
        or v_initial_operator_role <> v_request_role then
        raise exception 'operator_not_eligible';
      end if;

      if not public.is_public_operator_available_on_date_v1(
        v_workspace_id,
        v_initial_operator.id::text,
        v_initial_operator.name,
        v_request.appointment_date
      ) then
        raise exception 'operator_unavailable_on_date';
      end if;

      if not coalesce(p_ignore_conflicts, false)
        and public.phased_operator_interval_conflicts_v1(
          v_workspace_id,
          v_request.appointment_date,
          v_request.appointment_time,
          v_next_duration,
          v_initial_operator.id::text,
          v_initial_operator.name,
          null,
          v_request.id
        ) then
        raise exception 'booking_request_conflict';
      end if;
    end if;

    update public.booking_requests
    set requested_duration_minutes = v_next_duration,
        requested_operator_id = case
          when v_initial_operator_requested then v_initial_operator.id::text
          else requested_operator_id
        end,
        requested_operator_name = case
          when v_initial_operator_requested then v_initial_operator.name
          else requested_operator_name
        end,
        operator_change_status = null,
        operator_change_original_id = null,
        operator_change_original_name = null,
        operator_change_proposed_id = null,
        operator_change_proposed_name = null,
        operator_change_requested_at = null,
        operator_change_expires_at = null,
        operator_change_responded_at = null,
        updated_at = timezone('utc', now())
    where workspace_id = v_workspace_id
      and id = v_request.id
      and appointment_group_id = p_appointment_group_id;
  end if;

  -- One internal status call completes every member. Any exception rolls the
  -- target override back together with the whole group.
  v_group_result := public.update_owner_booking_request_group_status_v1(
    p_appointment_group_id,
    'accepted'
  );

  return coalesce(v_group_result, '{}'::jsonb) || jsonb_build_object(
    'targetRequestId', v_request.id,
    'targetDurationMinutes', case
      when v_is_phased then v_previous_duration
      else v_next_duration
    end,
    'targetInitialOperatorId', case
      when v_initial_operator.id is not null then v_initial_operator.id
      else null
    end,
    'targetInitialOperatorName', case
      when v_initial_operator.id is not null then v_initial_operator.name
      else null
    end,
    'targetFinalOperatorId', case
      when v_is_phased and v_final_operator.id is not null then v_final_operator.id
      else null
    end,
    'targetFinalOperatorName', case
      when v_is_phased and v_final_operator.id is not null then v_final_operator.name
      else null
    end,
    'atomic', true
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_group_with_member_override_v1(
  uuid, uuid, text, text, text, text, integer, boolean
) from public;
grant execute on function public.accept_owner_booking_request_group_with_member_override_v1(
  uuid, uuid, text, text, text, text, integer, boolean
) to authenticated;

notify pgrst, 'reload schema';
