-- Group composition creation delegates each item to these established owner
-- appointment writers. Keep their workspace lookup aligned with the explicit
-- internal-tester access granted to the outer composition RPCs.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.create_owner_appointment_ultralight_v2(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text)'::regprocedure,
    'public.create_owner_phased_appointment_v1(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text,jsonb)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_next := replace(
      v_definition,
      'and w.subscription_status in (''demo'', ''active'')',
      'and (w.is_internal_tester = true or w.subscription_status in (''demo'', ''active''))'
    );
    v_next := replace(
      v_next,
      'and workspace.subscription_status in (''demo'', ''active'')',
      'and (workspace.is_internal_tester = true or workspace.subscription_status in (''demo'', ''active''))'
    );

    if v_next = v_definition
      or position('is_internal_tester = true' in v_next) = 0
    then
      raise exception 'internal_tester_nested_owner_write_patch_missing:%',
        v_signature::text;
    end if;

    execute v_next;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
