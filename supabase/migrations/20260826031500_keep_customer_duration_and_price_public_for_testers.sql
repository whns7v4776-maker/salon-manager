-- Customer-specific duration and price rows are authoritative for the public
-- frontend as well as for owner Agenda. Internal-tester workspaces must expose
-- those confirmed rows even when their store subscription is not active.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.get_public_customer_service_duration_overrides_v1(text,text,text)'::regprocedure,
    'public.get_public_customer_service_price_overrides_v1(text,text,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;

    v_next := replace(
      v_definition,
      'and workspace.subscription_status in (''demo'', ''active'')',
      'and (workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active''))'
    );

    if position('workspace.is_internal_tester is true' in v_next) = 0 then
      raise exception 'public_customer_personalization_internal_tester_patch_missing:%',
        v_signature::text;
    end if;

    if v_next is distinct from v_definition then
      execute v_next;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
