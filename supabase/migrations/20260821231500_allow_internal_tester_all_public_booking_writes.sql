-- Keep the public booking write contract aligned with the public catalog and
-- availability contract for internal tester workspaces. This is deliberately
-- limited to customer booking creation RPCs: real slot, operator, branch and
-- machinery conflicts remain enforced by the existing writers.
do $$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_patched integer := 0;
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
    'create_public_booking_dependency_v1',
    'create_public_booking_composition_v1'
  ];
begin
  for v_function in
    select procedure.oid, procedure.proname
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname = any(v_names)
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := v_definition;

    v_updated := replace(
      v_updated,
      'and workspace.subscription_status in (''demo'', ''active'')',
      'and (workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active''))'
    );
    v_updated := replace(
      v_updated,
      'where workspace.subscription_status in (''demo'', ''active'')',
      'where (workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active''))'
    );
    v_updated := replace(
      v_updated,
      'and w.subscription_status in (''demo'', ''active'')',
      'and (w.is_internal_tester is true or w.subscription_status in (''demo'', ''active''))'
    );
    v_updated := replace(
      v_updated,
      'where w.subscription_status in (''demo'', ''active'')',
      'where (w.is_internal_tester is true or w.subscription_status in (''demo'', ''active''))'
    );

    if v_updated is distinct from v_definition then
      execute v_updated;
      v_patched := v_patched + 1;
    elsif position('subscription_status' in v_definition) > 0
      and position('is_internal_tester' in v_definition) = 0
    then
      raise exception
        'internal tester booking patch anchor missing for function %',
        v_function.proname;
    end if;
  end loop;

  if v_patched = 0 then
    raise exception 'no public booking creation RPC required the internal tester patch';
  end if;
end;
$$;

notify pgrst, 'reload schema';
