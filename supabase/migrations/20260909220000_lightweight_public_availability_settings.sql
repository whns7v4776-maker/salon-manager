-- Settings reads need only the two metadata fields, not the full projected
-- service catalogue. Keep the existing merge, access rules and RPC contracts.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_old text;
  v_new text;
begin
  foreach v_signature in array array[
    'public.get_client_portal_availability_settings(text)',
    'public.resolve_public_portal_availability_settings(uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if v_signature = 'public.get_client_portal_availability_settings(text)' then
      v_old := 'v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);';
      v_new := $replacement$v_owner_payload := (
    select jsonb_build_object('workspace', snapshot.payload -> 'workspace')
    from public.owner_app_snapshots as snapshot
    where snapshot.workspace_id = v_workspace.id
    limit 1
  );$replacement$;
    else
      v_old := 'v_owner_payload := public.get_public_portal_owner_payload(p_workspace_id);';
      v_new := $replacement$v_owner_payload := (
    select jsonb_build_object('availabilitySettings', snapshot.payload -> 'availabilitySettings')
    from public.owner_app_snapshots as snapshot
    where snapshot.workspace_id = p_workspace_id
    limit 1
  );$replacement$;
    end if;
    if position(v_old in v_definition) = 0 then
      raise exception 'Unexpected availability settings definition: %', v_signature;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
