-- Historical owner moves remain valid mutations. Only their move push is suppressed.
create or replace function public.is_past_owner_move_push(
  p_payload jsonb,
  p_reference timestamptz default clock_timestamp()
) returns boolean
language plpgsql stable set search_path = public
as $$
declare
  v_event text := lower(coalesce(p_payload->>'event_type', p_payload->>'notificationType', p_payload->>'_pushEventType', p_payload->>'type', ''));
  v_target timestamp;
begin
  if v_event <> 'appointment_rescheduled_by_salon' then return false; end if;
  if coalesce(p_payload->>'appointmentDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload->>'appointmentTime', '') !~ '^\d{1,2}:\d{2}(:\d{2})?$'
  then return false; end if;
  v_target := (p_payload->>'appointmentDate')::date + (p_payload->>'appointmentTime')::time;
  return v_target < (p_reference at time zone 'Europe/Rome');
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

do $migration$
declare
  v_definition text;
  v_anchor text := E'begin\n  if p_workspace_id is null then';
begin
  select pg_get_functiondef(oid) into strict v_definition
  from pg_proc where pronamespace = 'public'::regnamespace
    and proname = 'queue_public_customer_push';
  if strpos(v_definition, v_anchor) = 0 then
    raise exception 'queue_public_customer_push shape changed; migration aborted';
  end if;
  execute replace(v_definition, v_anchor,
    E'begin\n  if public.is_past_owner_move_push(p_payload) then return 0; end if;\n  if p_workspace_id is null then');
end;
$migration$;
