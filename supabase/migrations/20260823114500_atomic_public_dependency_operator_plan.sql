-- Public linked services must be advertised and persisted with the same
-- operator plan. The customer timeline includes processing/pose, while only
-- the real work phases reserve an operator.

create or replace function public.public_operator_covers_service_plan_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_service_name text,
  p_required_role text,
  p_operator_id text,
  p_operator_name text,
  p_phase_config jsonb default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phase jsonb := coalesce(p_phase_config, '{}'::jsonb);
  v_initial_minutes integer;
  v_processing_minutes integer;
  v_final_minutes integer;
  v_final_enabled boolean;
  v_start_minutes integer := extract(hour from p_appointment_time)::integer * 60
    + extract(minute from p_appointment_time)::integer;
  v_final_time time;
begin
  if not public.public_operator_can_book_service_v1(
    p_workspace_id,
    p_operator_id,
    p_operator_name,
    p_service_name,
    p_required_role
  ) then
    return false;
  end if;

  if coalesce(v_phase ->> 'mode', '') <> 'phased' then
    if v_start_minutes + greatest(coalesce(p_requested_duration_minutes, 1), 1) > 1440 then
      return false;
    end if;
    return public.is_public_operator_interval_available_v1(
      p_workspace_id,
      p_appointment_date,
      p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 1), 1),
      p_service_name,
      p_operator_id,
      p_operator_name
    );
  end if;

  v_initial_minutes := greatest(
    case when coalesce(v_phase ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
      then (v_phase ->> 'initialDurationMinutes')::integer else 0 end,
    1
  );
  v_processing_minutes := greatest(
    case when coalesce(v_phase ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
      then (v_phase ->> 'processingDurationMinutes')::integer else 0 end,
    0
  );
  v_final_enabled := lower(coalesce(v_phase ->> 'finalPhaseEnabled', 'true')) <> 'false';
  v_final_minutes := case when v_final_enabled then greatest(
    case when coalesce(v_phase ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
      then (v_phase ->> 'finalDurationMinutes')::integer else 0 end,
    1
  ) else 0 end;

  if v_start_minutes + v_initial_minutes + v_processing_minutes + v_final_minutes > 1440 then
    return false;
  end if;

  if not public.is_public_operator_interval_available_v1(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    v_initial_minutes,
    p_service_name,
    p_operator_id,
    p_operator_name
  ) then
    return false;
  end if;

  if v_final_minutes > 0 then
    v_final_time := p_appointment_time + make_interval(
      mins => v_initial_minutes + v_processing_minutes
    );
    if not public.is_public_operator_interval_available_v1(
      p_workspace_id,
      p_appointment_date,
      v_final_time,
      v_final_minutes,
      p_service_name,
      p_operator_id,
      p_operator_name
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.public_operator_covers_service_plan_v1(
  uuid, date, time, integer, text, text, text, text, jsonb
) from public;
grant execute on function public.public_operator_covers_service_plan_v1(
  uuid, date, time, integer, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.resolve_public_dependency_operator_plan_v1(
  p_workspace_id uuid,
  p_parent_service_name text,
  p_dependency_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent public.services%rowtype;
  v_dependency public.services%rowtype;
  v_parent_timing jsonb;
  v_dependency_timing jsonb;
  v_parent_duration integer;
  v_dependency_duration integer;
  v_dependency_time time;
  v_parent_operator public.operators%rowtype;
  v_dependency_operator public.operators%rowtype;
  v_operator public.operators%rowtype;
  v_requested_operator boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
begin
  select service.* into v_parent
  from public.services as service
  where service.workspace_id = p_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_parent_service_name, '')))
    and service.is_online is true
    and service.superseded_by_composition_id is null
  order by service.updated_at desc, service.created_at desc
  limit 1;

  select service.* into v_dependency
  from public.services as service
  where service.workspace_id = p_workspace_id
    and service.id = p_dependency_service_id
    and service.is_online is true
    and service.superseded_by_composition_id is null
  limit 1;

  if v_parent.id is null or v_dependency.id is null or v_parent.id = v_dependency.id then
    return jsonb_build_object('available', false);
  end if;

  -- Keep this authorization contract identical to the dependency writer:
  -- automatic links come from requiredServiceIds, while customer choices
  -- come from suggestedServiceIds. Both routes use the same slot planner.
  if not (
    (
      (
        lower(trim(coalesce(v_parent.linked_service_config ->> 'dependencyMode', ''))) = 'automatic'
        or (
          nullif(trim(coalesce(v_parent.linked_service_config ->> 'dependencyMode', '')), '') is null
          and lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) <> 'true'
        )
      )
      and exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(v_parent.linked_service_config -> 'requiredServiceIds') = 'array'
            then v_parent.linked_service_config -> 'requiredServiceIds' else '[]'::jsonb end
        ) as configured(service_id)
        where configured.service_id = v_dependency.id::text
      )
    )
    or (
      lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) = 'true'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(v_parent.linked_service_config -> 'suggestedServiceIds') = 'array'
            then v_parent.linked_service_config -> 'suggestedServiceIds' else '[]'::jsonb end
        ) as configured(service_id)
        where configured.service_id = v_dependency.id::text
      )
    )
  )
    or lower(trim(coalesce(v_parent.required_role, ''))) is distinct from
      lower(trim(coalesce(v_dependency.required_role, '')))
  then
    return jsonb_build_object('available', false);
  end if;

  v_parent_timing := public.resolve_customer_service_timing_v1(
    p_workspace_id, p_customer_email, p_customer_phone, v_parent.name
  );
  v_dependency_timing := public.resolve_customer_service_timing_v1(
    p_workspace_id, p_customer_email, p_customer_phone, v_dependency.name
  );
  v_parent_duration := greatest(
    coalesce((v_parent_timing ->> 'durationMinutes')::integer, v_parent.duration_minutes, 60), 5
  );
  v_dependency_duration := greatest(
    coalesce((v_dependency_timing ->> 'durationMinutes')::integer, v_dependency.duration_minutes, 60), 5
  );

  if extract(hour from p_appointment_time)::integer * 60
      + extract(minute from p_appointment_time)::integer
      + v_parent_duration + v_dependency_duration > 1440 then
    return jsonb_build_object('available', false);
  end if;
  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);

  -- Prefer one operator for the complete route. This keeps the visible choice
  -- stable whenever the same person can really cover both services.
  for v_operator in
    select candidate.*
    from public.operators as candidate
    where candidate.workspace_id = p_workspace_id
      and (
        not v_requested_operator
        or candidate.id::text = trim(coalesce(p_requested_operator_id, ''))
        or lower(trim(candidate.name)) = lower(trim(coalesce(p_requested_operator_name, '')))
      )
    order by
      case when candidate.id::text = trim(coalesce(p_requested_operator_id, '')) then 0 else 1 end,
      candidate.created_at,
      candidate.name,
      candidate.id
  loop
    if public.public_operator_covers_service_plan_v1(
      p_workspace_id, p_appointment_date, p_appointment_time, v_parent_duration,
      v_parent.name, v_parent.required_role, v_operator.id::text, v_operator.name,
      coalesce(v_parent_timing -> 'phaseConfig', v_parent.phase_config)
    ) and public.public_operator_covers_service_plan_v1(
      p_workspace_id, p_appointment_date, v_dependency_time, v_dependency_duration,
      v_dependency.name, v_dependency.required_role, v_operator.id::text, v_operator.name,
      coalesce(v_dependency_timing -> 'phaseConfig', v_dependency.phase_config)
    ) then
      v_parent_operator := v_operator;
      v_dependency_operator := v_operator;
      exit;
    end if;
  end loop;

  if v_parent_operator.id is null and not v_requested_operator then
    select candidate.* into v_parent_operator
    from public.operators as candidate
    where candidate.workspace_id = p_workspace_id
      and public.public_operator_covers_service_plan_v1(
        p_workspace_id, p_appointment_date, p_appointment_time, v_parent_duration,
        v_parent.name, v_parent.required_role, candidate.id::text, candidate.name,
        coalesce(v_parent_timing -> 'phaseConfig', v_parent.phase_config)
      )
    order by candidate.created_at, candidate.name, candidate.id
    limit 1;

    select candidate.* into v_dependency_operator
    from public.operators as candidate
    where candidate.workspace_id = p_workspace_id
      and public.public_operator_covers_service_plan_v1(
        p_workspace_id, p_appointment_date, v_dependency_time, v_dependency_duration,
        v_dependency.name, v_dependency.required_role, candidate.id::text, candidate.name,
        coalesce(v_dependency_timing -> 'phaseConfig', v_dependency.phase_config)
      )
    order by candidate.created_at, candidate.name, candidate.id
    limit 1;
  end if;

  if v_parent_operator.id is null or v_dependency_operator.id is null then
    return jsonb_build_object('available', false);
  end if;

  return jsonb_build_object(
    'available', true,
    'parentOperatorId', v_parent_operator.id,
    'parentOperatorName', v_parent_operator.name,
    'dependencyOperatorId', v_dependency_operator.id,
    'dependencyOperatorName', v_dependency_operator.name
  );
end;
$$;

revoke all on function public.resolve_public_dependency_operator_plan_v1(
  uuid, text, uuid, date, time, text, text, text, text
) from public;
grant execute on function public.resolve_public_dependency_operator_plan_v1(
  uuid, text, uuid, date, time, text, text, text, text
) to anon, authenticated;

create or replace function public.get_public_dependency_slot_availability_batch_v1(
  p_salon_code text,
  p_parent_service_name text,
  p_dependency_service_id uuid,
  p_appointment_date date,
  p_slot_times jsonb,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_slot text;
  v_plan jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_workspace_id is null or jsonb_typeof(coalesce(p_slot_times, '[]'::jsonb)) <> 'array' then
    return v_result;
  end if;

  for v_slot in
    select value
    from jsonb_array_elements_text(p_slot_times)
    where value ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  loop
    v_plan := public.resolve_public_dependency_operator_plan_v1(
      v_workspace_id,
      p_parent_service_name,
      p_dependency_service_id,
      p_appointment_date,
      v_slot::time,
      p_customer_email,
      p_customer_phone,
      p_requested_operator_id,
      p_requested_operator_name
    );
    v_result := v_result || jsonb_build_object(v_slot, coalesce((v_plan ->> 'available')::boolean, false));
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_dependency_slot_availability_batch_v1(
  text, text, uuid, date, jsonb, text, text, text, text
) from public;
grant execute on function public.get_public_dependency_slot_availability_batch_v1(
  text, text, uuid, date, jsonb, text, text, text, text
) to anon, authenticated;

-- Patch the current effective dependency writer (including later lifecycle and
-- acknowledgement fixes) instead of replacing it with an older definition.
do $migration$
declare
  v_signature regprocedure :=
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := $anchor$  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);$anchor$;
  v_replacement text := $replacement$  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);

  v_operator_plan := public.resolve_public_dependency_operator_plan_v1(
    v_workspace_id,
    v_parent.name,
    v_dependency.id,
    p_appointment_date,
    p_appointment_time,
    p_customer_email::text,
    p_customer_phone,
    p_requested_operator_id,
    p_requested_operator_name
  );
  if coalesce((v_operator_plan ->> 'available')::boolean, false) is not true then
    raise exception 'slot_unavailable';
  end if;
  v_planned_parent_operator_id := nullif(v_operator_plan ->> 'parentOperatorId', '');
  v_planned_parent_operator_name := nullif(v_operator_plan ->> 'parentOperatorName', '');
  v_planned_dependency_operator_id := nullif(v_operator_plan ->> 'dependencyOperatorId', '');
  v_planned_dependency_operator_name := nullif(v_operator_plan ->> 'dependencyOperatorName', '');$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('v_operator_plan jsonb' in v_definition) = 0 then
    v_next := replace(
      v_definition,
      '  v_customer_id uuid;',
      E'  v_customer_id uuid;\n  v_operator_plan jsonb;\n  v_planned_parent_operator_id text;\n  v_planned_parent_operator_name text;\n  v_planned_dependency_operator_id text;\n  v_planned_dependency_operator_name text;'
    );
    if v_next = v_definition then raise exception 'dependency_operator_plan_declaration_anchor_missing'; end if;
    v_definition := v_next;
  end if;

  if position('resolve_public_dependency_operator_plan_v1' in v_definition) = 0 then
    v_next := replace(v_definition, v_anchor, v_replacement);
    if v_next = v_definition then raise exception 'dependency_operator_plan_call_anchor_missing'; end if;
    v_definition := v_next;
  end if;

  v_definition := replace(
    v_definition,
    'v_parent.required_role, p_requested_operator_id, p_requested_operator_name',
    'v_parent.required_role, v_planned_parent_operator_id, v_planned_parent_operator_name'
  );
  v_definition := replace(
    v_definition,
    'v_dependency.required_role, p_requested_operator_id, p_requested_operator_name',
    'v_dependency.required_role, v_planned_dependency_operator_id, v_planned_dependency_operator_name'
  );

  if position(
    'v_parent.required_role, v_planned_parent_operator_id, v_planned_parent_operator_name'
    in v_definition
  ) = 0
    or position(
      'v_dependency.required_role, v_planned_dependency_operator_id, v_planned_dependency_operator_name'
      in v_definition
    ) = 0 then
    raise exception 'dependency_operator_plan_writer_patch_missing';
  end if;

  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
