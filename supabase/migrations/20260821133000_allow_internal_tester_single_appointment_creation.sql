-- Single-service creation has its own workspace lookup, separate from the
-- composition writers. Keep it aligned with the canonical owner access rules:
-- an explicitly authorized internal tester remains writable after the
-- synthetic subscription expires, and an owner identity recreated with the
-- same email can still resolve its workspace.

do $$
declare
  v_signature regprocedure :=
    'public.create_owner_appointment_flexible_v1(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text,jsonb,boolean,boolean,boolean,boolean,boolean)'::regprocedure;
  v_definition text;
  v_next text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  v_next := replace(
    v_definition,
    'join public.workspace_members as member on member.workspace_id = workspace.id',
    'left join public.workspace_members as member on member.workspace_id = workspace.id'
  );
  v_next := replace(
    v_next,
    'where member.user_id = auth.uid()',
    $predicate$where (
      member.user_id = auth.uid()
      or lower(btrim(workspace.owner_email::text)) =
         lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    )$predicate$
  );
  v_next := replace(
    v_next,
    'and workspace.subscription_status in (''demo'', ''active'')',
    'and (workspace.is_internal_tester = true or workspace.subscription_status in (''demo'', ''active''))'
  );

  if v_next = v_definition
    or position(
      'left join public.workspace_members as member on member.workspace_id = workspace.id'
      in v_next
    ) = 0
    or position('lower(btrim(workspace.owner_email::text))' in v_next) = 0
    or position('workspace.is_internal_tester = true' in v_next) = 0
  then
    raise exception 'internal_tester_single_appointment_patch_missing:%',
      v_signature::text;
  end if;

  execute v_next;
end;
$$;

notify pgrst, 'reload schema';
