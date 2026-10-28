-- Owner-created compositions write one accepted booking_request per phase so
-- the client app can show the logical booking as unread. Suppress the partial
-- per-row push trigger while the group is being assembled; the existing
-- appointment_groups finalizer queues the single complete customer push after
-- every row has its group identity and final order.

do $migration$
declare
  v_definition text;
  v_loop_anchor text := $anchor$  for v_item in select value from jsonb_array_elements(p_items)$anchor$;
  v_loop_with_push_guard text := $replacement$  perform set_config(
    'salonpro.skip_booking_request_push',
    'on',
    true
  );

  for v_item in select value from jsonb_array_elements(p_items)$replacement$;
begin
  select pg_get_functiondef(
    'public.create_owner_appointment_group_v1(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean)'::regprocedure
  ) into v_definition;

  if position('salonpro.skip_booking_request_push' in v_definition) = 0 then
    if position(v_loop_anchor in v_definition) = 0 then
      raise exception 'owner_composition_client_push_guard_anchor_missing';
    end if;

    v_definition := replace(v_definition, v_loop_anchor, v_loop_with_push_guard);
    execute v_definition;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
