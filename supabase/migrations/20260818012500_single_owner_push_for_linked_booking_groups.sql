-- A composition or a service dependency is one customer booking even though
-- it keeps separate request rows for operator capacity and Agenda placement.
-- Suppress the per-row owner pushes while the atomic writer builds the group,
-- then queue exactly one owner event for the completed logical booking.

create or replace function public.queue_booking_group_created_owner_push_v1(
  p_workspace_id uuid,
  p_appointment_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.appointment_groups%rowtype;
  v_request public.booking_requests%rowtype;
  v_timeline text;
  v_request_ids jsonb := '[]'::jsonb;
  v_customer_name text;
  v_body text;
  v_payload jsonb;
begin
  select appointment_group.* into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = p_workspace_id
    and appointment_group.id = p_appointment_group_id;

  if v_group.id is null then return; end if;

  select request.* into v_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id
  order by request.appointment_group_order, request.created_at, request.id
  limit 1;

  if v_request.id is null then return; end if;

  select coalesce(
    jsonb_agg(request.id order by request.appointment_group_order, request.created_at, request.id),
    '[]'::jsonb
  ) into v_request_ids
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id;

  v_timeline := public.format_booking_group_timeline_v1(
    p_workspace_id,
    p_appointment_group_id
  );
  if nullif(trim(v_timeline), '') is null then return; end if;

  v_customer_name := coalesce(
    nullif(trim(concat_ws(' ', v_request.customer_name, v_request.customer_surname)), ''),
    'Cliente'
  );
  v_body := v_customer_name || '. Servizi: ' || v_timeline ||
    '. Data: ' || to_char(v_request.appointment_date, 'DD/MM/YYYY') || '.';

  v_payload := jsonb_build_object(
    'type', 'booking_request_created',
    '_pushAudience', 'auth',
    '_pushTarget', 'owner',
    '_pushEventType', 'booking_request_created',
    '_dedupeKey', concat_ws(
      '|',
      p_workspace_id::text,
      'booking_group_created',
      p_appointment_group_id::text
    ),
    'bookingRequestId', v_request.id,
    'bookingRequestIds', v_request_ids,
    'appointmentGroupId', p_appointment_group_id,
    'appointmentDate', v_request.appointment_date,
    'appointmentTime', v_request.appointment_time,
    'customerName', v_customer_name,
    'serviceName', coalesce(nullif(trim(v_group.title), ''), v_request.requested_service_name),
    'bookingTimeline', v_timeline
  );

  perform public.queue_workspace_push(
    p_workspace_id,
    'booking_request_created',
    'Nuova richiesta di prenotazione',
    v_body,
    v_payload
  );
end;
$$;

revoke all on function public.queue_booking_group_created_owner_push_v1(uuid, uuid)
  from public;
grant execute on function public.queue_booking_group_created_owner_push_v1(uuid, uuid)
  to authenticated, service_role;

-- Patch the current dependency writer instead of copying it, preserving every
-- later authorization, timing, pricing and availability hardening.
do $migration$
declare
  v_definition text;
  v_skip_anchor text := $anchor$  if coalesce(v_parent_timing -> 'phaseConfig' ->> 'mode', '') = 'phased' then$anchor$;
  v_skip_block text := $block$  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  if coalesce(v_parent_timing -> 'phaseConfig' ->> 'mode', '') = 'phased' then$block$;
  v_queue_anchor text := $anchor$  where id = v_group.id;

  return jsonb_build_object($anchor$;
  v_queue_block text := $block$  where id = v_group.id;

  perform public.queue_booking_group_created_owner_push_v1(v_workspace_id, v_group.id);

  return jsonb_build_object($block$;
begin
  select pg_get_functiondef(
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position('queue_booking_group_created_owner_push_v1' in v_definition) = 0 then
    if position(v_skip_anchor in v_definition) = 0 then
      raise exception 'dependency_owner_push_skip_anchor_missing';
    end if;
    if position(v_queue_anchor in v_definition) = 0 then
      raise exception 'dependency_owner_push_queue_anchor_missing';
    end if;

    v_definition := replace(v_definition, v_skip_anchor, v_skip_block);
    v_definition := replace(v_definition, v_queue_anchor, v_queue_block);
    execute v_definition;
  end if;
end;
$migration$;

-- Apply the same one-booking contract to online compositions/combos.
do $migration$
declare
  v_definition text;
  v_skip_anchor text := $anchor$  for v_item in$anchor$;
  v_skip_block text := $block$  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  for v_item in$block$;
  v_queue_anchor text := $anchor$  where id = v_group.id;

  return jsonb_build_object($anchor$;
  v_queue_block text := $block$  where id = v_group.id;

  perform public.queue_booking_group_created_owner_push_v1(v_workspace_id, v_group.id);

  return jsonb_build_object($block$;
begin
  select pg_get_functiondef(
    'public.create_public_booking_composition_v1(text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position('queue_booking_group_created_owner_push_v1' in v_definition) = 0 then
    if position(v_skip_anchor in v_definition) = 0 then
      raise exception 'composition_owner_push_skip_anchor_missing';
    end if;
    if position(v_queue_anchor in v_definition) = 0 then
      raise exception 'composition_owner_push_queue_anchor_missing';
    end if;

    v_definition := replace(v_definition, v_skip_anchor, v_skip_block);
    v_definition := replace(v_definition, v_queue_anchor, v_queue_block);
    execute v_definition;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
