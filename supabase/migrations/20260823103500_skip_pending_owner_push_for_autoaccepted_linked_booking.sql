-- Linked frontend bookings are written as pending rows before their automatic
-- acceptance is materialized. Do not notify the owner about a manual request
-- when the workspace/customer policy already guarantees automatic acceptance.

do $migration$
declare
  v_signature regprocedure :=
    'public.queue_booking_group_created_owner_push_v1(uuid,uuid)'::regprocedure;
  v_definition text;
  v_anchor text := $anchor$  if v_request.id is null then return; end if;

  select coalesce($anchor$;
  v_replacement text := $replacement$  if v_request.id is null then return; end if;

  -- This is a request-created push, not an appointment-created push. An
  -- automatically accepted linked booking must not emit it and then emit the
  -- accepted state as a second, contradictory owner notification.
  if public.resolve_customer_online_auto_accept_v1(
    p_workspace_id,
    v_request.customer_id
  ) then
    return;
  end if;

  select coalesce($replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('automatically accepted linked booking must not emit it' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'linked_owner_autoaccept_push_anchor_missing';
    end if;

    v_definition := replace(v_definition, v_anchor, v_replacement);
    execute v_definition;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
