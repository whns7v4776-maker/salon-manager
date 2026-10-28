-- The backoffice promises that automatic acceptance keeps every new request
-- visible for 15 seconds. Linked bookings must therefore emit their single
-- group-level owner event even when the request will be accepted automatically.
-- This restores the immediate app/web refresh without re-enabling per-row
-- duplicate pushes.

do $migration$
declare
  v_signature regprocedure :=
    'public.queue_booking_group_created_owner_push_v1(uuid,uuid)'::regprocedure;
  v_definition text;
  v_suppression_block text := $block$  -- This is a request-created push, not an appointment-created push. An
  -- automatically accepted linked booking must not emit it and then emit the
  -- accepted state as a second, contradictory owner notification.
  if public.resolve_customer_online_auto_accept_v1(
    p_workspace_id,
    v_request.customer_id
  ) then
    return;
  end if;

$block$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_suppression_block in v_definition) = 0 then
    raise exception 'linked_owner_autoaccept_suppression_block_missing';
  end if;

  v_definition := replace(v_definition, v_suppression_block, '');
  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
