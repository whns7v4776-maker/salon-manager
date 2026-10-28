-- Repair every public booking writer, including internal helper functions such
-- as create_public_phased_booking_request_v4_with_final. The earlier explicit
-- name list missed that renamed helper, so the outer RPC passed while the inner
-- writer still raised workspace_not_found.

do $$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_line text;
begin
  for v_function in
    select procedure.oid, procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname like 'create_public%booking%'
  loop
    select pg_get_functiondef(v_function.oid) into v_definition;
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

  -- Audit the final effective source line-by-line. Any remaining subscription
  -- gate without the tester alternative aborts the whole migration.
  for v_function in
    select procedure.oid, procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname like 'create_public%booking%'
  loop
    select pg_get_functiondef(v_function.oid) into v_definition;
    for v_line in select line from regexp_split_to_table(v_definition, E'\\n') as line
    loop
      if position('subscription_status' in lower(v_line)) > 0
        and position('is_internal_tester' in lower(v_line)) = 0
      then
        raise exception
          'subscription_only_public_booking_gate_remains:%:%',
          v_function.signature,
          trim(v_line);
      end if;
    end loop;
  end loop;
end;
$$;

drop function if exists public.get_internal_public_booking_function_defs_v1();

notify pgrst, 'reload schema';
