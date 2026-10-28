-- Internal tester workspaces have full backoffice access without pretending
-- to be paid subscriptions. The owner composition RPCs still used the older
-- demo/active-only lookup, so they rejected an otherwise authorized tester
-- workspace before any appointment row could be created.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.create_owner_appointment_group_v1(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean)'::regprocedure,
    'public.create_owner_appointment_group_flexible_v1(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_next := replace(
      v_definition,
      'and workspace.subscription_status in (''demo'', ''active'')',
      'and (workspace.is_internal_tester = true or workspace.subscription_status in (''demo'', ''active''))'
    );

    if v_next = v_definition then
      raise exception 'internal_tester_composition_patch_missing:%', v_signature::text;
    end if;

    execute v_next;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
