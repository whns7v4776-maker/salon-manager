-- Keep the public three-phase writer fully atomic while removing work that was
-- repeated only because the phased wrappers are layered on the legacy writer.
--
-- Before this migration the effective v5 -> v4_with_final ->
-- with_assignments_with_final -> ultralight_v2 path rebuilt both portal JSON
-- snapshots three times. The final wrapper also wrote the exact same operator
-- assignments a second time. On a populated salon this could hit the API
-- statement timeout and make the client retry the whole mutation.

do $migration$
declare
  v_signature regprocedure :=
    'public.create_public_booking_request_ultralight_v2(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_refresh_anchor text :=
    E'  perform public.refresh_workspace_agenda_state(v_workspace.id);';
  v_guarded_refresh text :=
    E'  if coalesce(current_setting(''salonpro.defer_client_portal_snapshot_sync'', true), '''') <> ''on'' then\n    perform public.refresh_workspace_agenda_state(v_workspace.id);\n  end if;';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  -- The phased writer has already acquired the workspace/day advisory lock and
  -- validated the initial and final working phases. Avoid the legacy third
  -- initial-slot check only for that exact transaction-local call path.
  v_next := replace(
    v_definition,
    E'  if not public.is_public_booking_slot_available(\n',
    E'  if coalesce(current_setting(''salonpro.phased_slot_prevalidated'', true), '''') <> ''on''\n    and not public.is_public_booking_slot_available(\n'
  );
  if v_next = v_definition then
    raise exception 'ultralight_slot_guard_anchor_missing';
  end if;
  v_definition := v_next;

  -- Suppress only the intermediate portal publication. Direct/single-service
  -- callers still take the original branch and publish exactly as before.
  v_next := replace(v_definition, v_refresh_anchor, v_guarded_refresh);
  if v_next = v_definition then
    raise exception 'ultralight_portal_refresh_anchor_missing_or_unpatched';
  end if;

  execute v_next;
end;
$migration$;

-- Both final-enabled and processing-terminal phased helpers own the atomic
-- lock/revalidation. Mark only their nested legacy insert as prevalidated and
-- defer its early portal publication. The existing row-trigger skip flag also
-- suppresses each intermediate INSERT/UPDATE snapshot rebuild. The statement-
-- level auto-accept kick still runs once on the INSERT, exactly as it does for
-- a single-service booking; phase metadata UPDATEs do not target its columns.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_writer_anchor text :=
    E'  v_request := public.create_public_booking_request_ultralight_v2(\n';
  v_writer_replacement text :=
    E'  perform set_config(''salonpro.skip_client_portal_snapshot_sync'', ''on'', true);\n  perform set_config(''salonpro.defer_client_portal_snapshot_sync'', ''on'', true);\n  perform set_config(''salonpro.phased_slot_prevalidated'', ''on'', true);\n\n  v_request := public.create_public_booking_request_ultralight_v2(\n';
  v_after_writer_anchor text :=
    E'    p_required_role, p_initial_operator_id, p_initial_operator_name\n  );\n\n  v_assignments := jsonb_build_object(';
  v_after_writer_replacement text :=
    E'    p_required_role, p_initial_operator_id, p_initial_operator_name\n  );\n\n  perform set_config(''salonpro.skip_booking_request_push'', ''on'', true);\n\n  v_assignments := jsonb_build_object(';
begin
  for v_signature in
    select signature
    from unnest(array[
      'public.create_public_phased_booking_request_with_assignments_v1_with_final(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure,
      'public.create_public_phased_booking_request_with_assignments_v1(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
    ]) as signatures(signature)
  loop
    select pg_get_functiondef(v_signature) into v_definition;

    v_next := replace(v_definition, v_writer_anchor, v_writer_replacement);
    if v_next = v_definition then
      raise exception 'phased_writer_anchor_missing:%', v_signature;
    end if;
    v_definition := v_next;

    -- The owner push has already been queued by the INSERT. The metadata-only
    -- UPDATE cannot create a new logical notification, so avoid recomputing the
    -- whole role/operator cardinality merely to discover there is no event.
    v_next := replace(
      v_definition,
      v_after_writer_anchor,
      v_after_writer_replacement
    );
    if v_next = v_definition then
      raise exception 'phased_writer_post_insert_anchor_missing:%', v_signature;
    end if;

    execute v_next;
  end loop;
end;
$migration$;

-- The final-enabled v4 helper receives an already-finalized row from the
-- assignments helper. Remove its identical second UPDATE pair and second full
-- portal rebuild; validation, lock ownership and the authoritative final
-- publication remain in the inner helper.
do $migration$
declare
  v_signature regprocedure :=
    'public.create_public_phased_booking_request_v4_with_final(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_definition text;
  v_next text;
  v_duplicate_tail text := $tail$
  v_assignments := jsonb_build_object(
    'version', 1,
    'initial', jsonb_build_object('id', v_initial_operator.id::text, 'name', v_initial_operator.name),
    'final', jsonb_build_object('id', v_final_operator.id::text, 'name', v_final_operator.name)
  );
  update public.booking_requests
  set phase_operator_assignments = v_assignments,
      requested_operator_id = v_initial_operator.id::text,
      requested_operator_name = v_initial_operator.name,
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;
  update public.appointments
  set phase_operator_assignments = v_assignments,
      operator_id = v_initial_operator.id::text,
      operator_name = v_initial_operator.name
  where booking_request_id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
$tail$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(v_definition, v_duplicate_tail, '');
  if v_next = v_definition then
    raise exception 'phased_v4_duplicate_tail_anchor_missing';
  end if;
  execute v_next;
end;
$migration$;

notify pgrst, 'reload schema';
