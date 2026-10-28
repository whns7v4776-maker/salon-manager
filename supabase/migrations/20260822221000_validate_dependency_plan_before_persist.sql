-- A service dependency is one logical public booking. Resolve and validate
-- the complete parent + dependency plan while the day is locked, before the
-- transaction can leave any pending rows behind.

do $migration$
declare
  v_signature regprocedure :=
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_old_lock text := $old$hashtext(
    v_workspace_id::text || ':' || coalesce(p_idempotency_key, '') || ':' ||
    p_appointment_date::text || ':' || p_appointment_time::text
  )$old$;
  v_new_lock text := $new$hashtext(
    v_workspace_id::text || ':' || p_appointment_date::text || ':public_dependency_plan'
  )$new$;
  v_declaration_anchor text := $anchor$  v_customer_id uuid;
begin$anchor$;
  v_declaration_replacement text := $replacement$  v_customer_id uuid;
  v_validate_request_id uuid;
  v_auto_accept boolean := false;
begin$replacement$;
  v_return_anchor text := $anchor$  return jsonb_build_object(
    'groupId', v_group.id,
    'requestIds', v_request_ids,
    'itemCount', 2,
    'totalPrice', v_total_price,
    'requiresSalonApproval', true,
    'idempotent', false
  );$anchor$;
  v_return_replacement text := $replacement$  -- The same validator used by auto-accept now inspects the complete
  -- linked plan. Any conflict aborts this transaction and leaves no partial
  -- group behind.
  for v_validate_request_id in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group.id
      and request.origin = 'frontend'
      and request.status = 'pending'::public.request_status
    order by request.appointment_group_order, request.created_at, request.id
  loop
    perform public.validate_booking_request_auto_accept_v1(
      v_workspace_id,
      v_validate_request_id
    );
  end loop;

  v_auto_accept := public.resolve_customer_online_auto_accept_v1(
    v_workspace_id,
    v_customer_id
  );

  update public.appointment_groups as appointment_group
  set metadata = appointment_group.metadata || jsonb_build_object(
        'requiresSalonApproval', not v_auto_accept,
        'acceptanceMode', case when v_auto_accept then 'automatic' else 'manual' end
      ),
      updated_at = timezone('utc', now())
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group.id;

  return jsonb_build_object(
    'groupId', v_group.id,
    'requestIds', v_request_ids,
    'itemCount', 2,
    'totalPrice', v_total_price,
    'requiresSalonApproval', not v_auto_accept,
    'idempotent', false
  );$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('public_dependency_plan' in v_definition) = 0 then
    v_next := replace(v_definition, v_old_lock, v_new_lock);
    if v_next = v_definition then
      raise exception 'dependency_plan_day_lock_anchor_missing';
    end if;
    v_definition := v_next;
  end if;

  if position('v_validate_request_id uuid' in v_definition) = 0 then
    v_next := replace(v_definition, v_declaration_anchor, v_declaration_replacement);
    if v_next = v_definition then
      raise exception 'dependency_plan_declaration_anchor_missing';
    end if;
    v_definition := v_next;
  end if;

  if position('acceptanceMode' in v_definition) = 0 then
    v_next := replace(v_definition, v_return_anchor, v_return_replacement);
    if v_next = v_definition then
      raise exception 'dependency_plan_validation_anchor_missing';
    end if;
    v_definition := v_next;
  end if;

  execute v_definition;
end;
$migration$;

-- Remove only the inspected failed dependency attempt: two pending frontend
-- rows and no materialized appointment. Abort if the remote state changed.
do $cleanup$
declare
  v_workspace_id constant uuid := 'd84f3211-d20f-45a3-9d7f-f551400690fd';
  v_group_id constant uuid := '37dc2143-a17c-478c-8976-625d0dce78bf';
  v_expected_ids constant uuid[] := array[
    '0e0c32fb-fe44-4e62-9789-f57d3b9b5236'::uuid,
    'db230471-fa56-4d76-814e-d30481c00827'::uuid
  ];
  v_request_count integer := 0;
  v_matching_count integer := 0;
  v_appointment_count integer := 0;
begin
  select count(*)::integer into v_request_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  select count(*)::integer into v_matching_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id
    and request.id = any(v_expected_ids)
    and request.status = 'pending'::public.request_status
    and request.origin = 'frontend';

  select count(*)::integer into v_appointment_count
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  if v_request_count = 0 and not exists (
    select 1 from public.appointment_groups as appointment_group
    where appointment_group.workspace_id = v_workspace_id
      and appointment_group.id = v_group_id
  ) then
    return;
  end if;

  if v_request_count <> 2 or v_matching_count <> 2 or v_appointment_count <> 0 then
    raise exception
      'dependency_cleanup_state_changed:requests=%,matching=%,appointments=%',
      v_request_count, v_matching_count, v_appointment_count;
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  delete from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id
    and request.id = any(v_expected_ids);

  delete from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id;
end;
$cleanup$;

notify pgrst, 'reload schema';
