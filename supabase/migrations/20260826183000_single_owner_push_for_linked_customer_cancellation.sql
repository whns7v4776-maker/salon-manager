-- A dependency, composition or phased booking is one logical customer booking.
-- Its atomic cancellation updates every request row, but the owner must receive
-- one notification for the appointment group, not one notification per row.

create or replace function public.queue_linked_customer_cancellation_owner_push_v1(
  p_workspace_id uuid,
  p_appointment_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_request public.booking_requests%rowtype;
  v_request_ids uuid[] := '{}'::uuid[];
  v_timeline text := '';
  v_customer_name text := '';
  v_date_label text := '';
  v_dedupe_key text := '';
begin
  select request.*
  into v_first_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id
  order by request.appointment_group_order nulls last, request.created_at, request.id
  limit 1;

  if v_first_request.id is null then
    return;
  end if;

  select
    coalesce(
      array_agg(
        request.id
        order by request.appointment_group_order nulls last, request.created_at, request.id
      ),
      '{}'::uuid[]
    ),
    coalesce(
      string_agg(
        concat(
          coalesce(nullif(trim(request.requested_service_name), ''), 'Servizio'),
          case
            when request.appointment_time is not null
            then ' alle ' || to_char(request.appointment_time, 'HH24:MI')
            else ''
          end,
          case
            when nullif(trim(coalesce(request.requested_operator_name, '')), '') is not null
            then ' con ' || trim(request.requested_operator_name)
            else ''
          end,
          case
            when coalesce(request.phase_snapshot ->> 'mode', '') = 'phased'
              and coalesce(request.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
              and (request.phase_snapshot ->> 'processingDurationMinutes')::integer > 0
            then ' (posa ' ||
              (request.phase_snapshot ->> 'processingDurationMinutes')::integer::text ||
              ' min)'
            else ''
          end
        ),
        ' · '
        order by request.appointment_group_order nulls last, request.created_at, request.id
      ),
      ''
    )
  into v_request_ids, v_timeline
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id;

  if coalesce(array_length(v_request_ids, 1), 0) = 0
    or nullif(trim(v_timeline), '') is null
  then
    return;
  end if;

  v_customer_name := coalesce(
    nullif(trim(concat_ws(
      ' ',
      v_first_request.customer_name,
      v_first_request.customer_surname
    )), ''),
    'Cliente'
  );
  v_date_label := case
    when v_first_request.appointment_date is not null
    then to_char(v_first_request.appointment_date, 'DD/MM/YYYY')
    else ''
  end;
  v_dedupe_key := concat_ws(
    '|',
    p_workspace_id::text,
    'booking_group_status',
    p_appointment_group_id::text,
    'cancelled',
    'cliente'
  );

  -- Clean only unsent legacy per-row cancellation rows for this exact logical
  -- appointment. Independently booked requests have another group (or none)
  -- and are deliberately left untouched.
  delete from public.push_notifications as notification
  where notification.workspace_id = p_workspace_id
    and notification.status = 'queued'::public.push_delivery_status
    and notification.event_type = 'booking_request_status_changed'::public.push_event_type
    and coalesce(notification.payload ->> 'statusCode', '') = 'cancelled'
    and coalesce(notification.payload ->> 'cancellationSource', '') in ('cliente', 'customer')
    and (
      notification.payload ->> 'appointmentGroupId' = p_appointment_group_id::text
      or exists (
        select 1
        from unnest(v_request_ids) as request_id
        where request_id::text = coalesce(
          notification.payload ->> 'bookingRequestId',
          notification.payload ->> 'requestId'
        )
      )
    );

  perform public.queue_workspace_push(
    p_workspace_id,
    'booking_request_status_changed',
    'Prenotazione annullata dal cliente',
    concat_ws(
      ' · ',
      v_customer_name,
      v_timeline,
      nullif(v_date_label, '')
    ),
    jsonb_build_object(
      'type', 'booking_request_status_changed',
      'event_type', 'booking_request_status_changed',
      'notificationType', 'booking_request_status_changed',
      '_pushEventType', 'booking_request_status_changed',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_dedupeKey', v_dedupe_key,
      'eventId', v_dedupe_key,
      'bookingRequestId', v_first_request.id,
      'bookingRequestIds', to_jsonb(v_request_ids),
      'appointmentGroupId', p_appointment_group_id,
      'notificationScope', 'appointment_group',
      'status', 'Annullata',
      'statusCode', 'cancelled',
      'cancellationSource', 'cliente',
      'appointmentDate', v_first_request.appointment_date,
      -- The timeline already carries every phase time. Keeping this null avoids
      -- repeating only the first time in the compact native notification body.
      'appointmentTime', null,
      'customerName', v_customer_name,
      'serviceName', v_timeline,
      'bookingTimeline', v_timeline,
      'source', 'client'
    )
  );
end;
$$;

revoke all on function public.queue_linked_customer_cancellation_owner_push_v1(uuid, uuid)
  from public;
grant execute on function public.queue_linked_customer_cancellation_owner_push_v1(uuid, uuid)
  to authenticated, service_role;

-- The row trigger remains the source for a genuinely single request. For a
-- linked request it waits for the whole group to be terminal and delegates to
-- the group finalizer above.
do $migration$
declare
  v_definition text;
  v_anchor text := $anchor$    v_title := case
      when old.status = 'pending' then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;$anchor$;
  v_replacement text := $replacement$    if new.appointment_group_id is not null then
      if exists (
        select 1
        from public.booking_requests as sibling
        where sibling.workspace_id = new.workspace_id
          and sibling.appointment_group_id = new.appointment_group_id
          and sibling.status::text in ('pending', 'accepted')
      ) then
        return new;
      end if;

      perform public.queue_linked_customer_cancellation_owner_push_v1(
        new.workspace_id,
        new.appointment_group_id
      );
      return new;
    end if;

    v_title := case
      when old.status = 'pending' then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;$replacement$;
begin
  select pg_get_functiondef(
    'public.handle_booking_requests_push_queue()'::regprocedure
  ) into v_definition;

  if position('queue_linked_customer_cancellation_owner_push_v1' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'linked_customer_cancel_trigger_anchor_missing';
    end if;
    v_definition := replace(v_definition, v_anchor, v_replacement);
    execute v_definition;
  end if;
end;
$migration$;

-- The authoritative single-row RPC has a defensive queue fallback after the
-- trigger. Teach that fallback about the group finalizer and the local defer
-- flag used while the atomic wrapper is cancelling sibling rows.
do $migration$
declare
  v_definition text;
  v_anchor text := $anchor$  if not exists (
    select 1
    from public.push_notifications as push
    where push.workspace_id = v_workspace_id
      and push.event_type = 'booking_request_status_changed'
      and push.payload ->> 'bookingRequestId' = v_request.id::text
      and push.payload ->> 'statusCode' = 'cancelled'$anchor$;
  v_replacement text := $replacement$  if coalesce(
      current_setting('salonpro.defer_linked_customer_cancel_push', true),
      ''
    ) <> 'on'
    and not exists (
      select 1
      from public.push_notifications as push
      where push.workspace_id = v_workspace_id
        and push.event_type = 'booking_request_status_changed'
        and (
          push.payload ->> 'bookingRequestId' = v_request.id::text
          or (
            v_request.appointment_group_id is not null
            and push.payload ->> 'appointmentGroupId' = v_request.appointment_group_id::text
          )
        )
        and push.payload ->> 'statusCode' = 'cancelled'$replacement$;
begin
  select pg_get_functiondef(
    'public.cancel_public_booking_request(text,uuid,citext,text)'::regprocedure
  ) into v_definition;

  if position('salonpro.defer_linked_customer_cancel_push' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'single_customer_cancel_push_guard_anchor_missing';
    end if;
    v_definition := replace(v_definition, v_anchor, v_replacement);
    execute v_definition;
  end if;
end;
$migration$;

-- The request-id wrapper is the normal frontend path. Suppress both trigger
-- and fallback row events only when the persisted request actually belongs to
-- a group, then finalize one group event after every sibling is cancelled.
do $migration$
declare
  v_definition text;
  v_start_anchor text := $anchor$  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);

  for v_request in$anchor$;
  v_start_replacement text := $replacement$  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);

  if v_group_id is not null then
    perform set_config('salonpro.skip_booking_request_push', 'on', true);
    perform set_config('salonpro.defer_linked_customer_cancel_push', 'on', true);
  end if;

  for v_request in$replacement$;
  v_end_anchor text := $anchor$  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);

  return jsonb_build_object($anchor$;
  v_end_replacement text := $replacement$  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);

  if v_group_id is not null then
    perform set_config('salonpro.skip_booking_request_push', 'off', true);
    perform set_config('salonpro.defer_linked_customer_cancel_push', 'off', true);
    perform public.queue_linked_customer_cancellation_owner_push_v1(
      v_workspace_id,
      v_group_id
    );
  end if;

  return jsonb_build_object($replacement$;
begin
  select pg_get_functiondef(
    'public.cancel_public_booking_request_or_group_v2(text,uuid,text,text)'::regprocedure
  ) into v_definition;

  if position('queue_linked_customer_cancellation_owner_push_v1' in v_definition) = 0 then
    if position(v_start_anchor in v_definition) = 0 then
      raise exception 'request_group_cancel_push_start_anchor_missing';
    end if;
    if position(v_end_anchor in v_definition) = 0 then
      raise exception 'request_group_cancel_push_end_anchor_missing';
    end if;
    v_definition := replace(v_definition, v_start_anchor, v_start_replacement);
    v_definition := replace(v_definition, v_end_anchor, v_end_replacement);
    execute v_definition;
  end if;
end;
$migration$;

-- The explicit group-id RPC is used by composition cards. It receives the same
-- transaction-local suppression and exact group finalization contract.
do $migration$
declare
  v_definition text;
  v_start_anchor text := $anchor$  for v_request in
    select request.id$anchor$;
  v_start_replacement text := $replacement$  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);
  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.defer_linked_customer_cancel_push', 'on', true);

  for v_request in
    select request.id$replacement$;
  v_end_anchor text := $anchor$  return jsonb_build_object(
    'groupId', p_appointment_group_id,$anchor$;
  v_end_replacement text := $replacement$  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);
  perform set_config('salonpro.skip_booking_request_push', 'off', true);
  perform set_config('salonpro.defer_linked_customer_cancel_push', 'off', true);
  perform public.queue_linked_customer_cancellation_owner_push_v1(
    v_workspace_id,
    p_appointment_group_id
  );

  return jsonb_build_object(
    'groupId', p_appointment_group_id,$replacement$;
begin
  select pg_get_functiondef(
    'public.cancel_public_booking_group_v1(text,uuid,text,text)'::regprocedure
  ) into v_definition;

  if position('queue_linked_customer_cancellation_owner_push_v1' in v_definition) = 0 then
    if position(v_start_anchor in v_definition) = 0 then
      raise exception 'explicit_group_cancel_push_start_anchor_missing';
    end if;
    if position(v_end_anchor in v_definition) = 0 then
      raise exception 'explicit_group_cancel_push_end_anchor_missing';
    end if;
    v_definition := replace(v_definition, v_start_anchor, v_start_replacement);
    v_definition := replace(v_definition, v_end_anchor, v_end_replacement);
    execute v_definition;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
