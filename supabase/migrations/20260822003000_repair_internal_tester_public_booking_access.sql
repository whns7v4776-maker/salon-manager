-- Keep every public booking writer aligned with the public catalog for internal
-- tester workspaces. pg_get_functiondef normalizes `IN (...)` to
-- `= ANY (ARRAY[...])`, so the previous textual patch could leave the actual
-- workspace lookup unchanged even though `is_internal_tester` appeared
-- elsewhere in the same function body.

do $$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_names constant text[] := array[
    'create_public_booking_request',
    'create_public_booking_request_lightweight_v1',
    'create_public_booking_request_ultralight_v1',
    'create_public_booking_request_ultralight_v2',
    'create_public_booking_request_ultralight_v3',
    'create_public_booking_request_ultralight_v4',
    'create_public_phased_booking_request_v1',
    'create_public_phased_booking_request_v2',
    'create_public_phased_booking_request_v3',
    'create_public_phased_booking_request_v4',
    'create_public_phased_booking_request_v5',
    'create_public_phased_booking_request_with_assignments_v1',
    'create_public_phased_booking_request_with_assignments_v1_with_final',
    'create_public_booking_dependency_v1',
    'create_public_booking_composition_v1'
  ];
begin
  for v_function in
    select procedure.oid, procedure.proname, procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname = any(v_names)
  loop
    select pg_get_functiondef(v_function.oid) into v_definition;
    v_updated := v_definition;

    -- Source-form definitions.
    v_updated := replace(
      v_updated,
      'workspace.subscription_status in (''demo'', ''active'')',
      '(workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active''))'
    );
    v_updated := replace(
      v_updated,
      'w.subscription_status in (''demo'', ''active'')',
      '(w.is_internal_tester is true or w.subscription_status in (''demo'', ''active''))'
    );

    -- Canonical pg_get_functiondef form.
    v_updated := replace(
      v_updated,
      'workspace.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text])',
      '(workspace.is_internal_tester IS TRUE OR workspace.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text]))'
    );
    v_updated := replace(
      v_updated,
      'w.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text])',
      '(w.is_internal_tester IS TRUE OR w.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text]))'
    );

    if v_updated is distinct from v_definition then
      execute v_updated;
    end if;
  end loop;

  -- Fail atomically if even one public booking writer still contains the old
  -- subscription-only gate. This prevents another partial production patch.
  for v_function in
    select procedure.oid, procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname = any(v_names)
  loop
    select pg_get_functiondef(v_function.oid) into v_definition;

    if position(
      'workspace.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text])'
      in replace(
        v_definition,
        '(workspace.is_internal_tester IS TRUE OR workspace.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text]))',
        ''
      )
    ) > 0 or position(
      'w.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text])'
      in replace(
        v_definition,
        '(w.is_internal_tester IS TRUE OR w.subscription_status = ANY (ARRAY[''demo''::text, ''active''::text]))',
        ''
      )
    ) > 0 then
      raise exception 'subscription_only_public_booking_gate_remains:%', v_function.signature;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
