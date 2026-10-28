-- Keep the already-published composition push finalizer tolerant of malformed
-- legacy metadata and payload identifiers. This replaces only the function;
-- the finalization trigger and the appointment/in-app notification data stay
-- unchanged.

create or replace function public.queue_owner_composition_created_push_v1(
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
  v_first_request public.booking_requests%rowtype;
  v_request_ids uuid[] := '{}'::uuid[];
  v_request_count integer := 0;
  v_expected_count integer := 0;
  v_timeline text := '';
  v_operator_names text := '';
  v_group_title text := '';
  v_body text := '';
  v_dedupe_key text := '';
begin
  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = p_workspace_id
    and appointment_group.id = p_appointment_group_id;

  if v_group.id is null or v_group.status <> 'active' then
    return;
  end if;

  select
    coalesce(array_agg(request.id order by request.appointment_group_order), '{}'::uuid[]),
    count(*)::integer,
    coalesce(
      string_agg(
        distinct nullif(trim(request.requested_operator_name), ''),
        ', '
      ) filter (where nullif(trim(request.requested_operator_name), '') is not null),
      ''
    )
  into v_request_ids, v_request_count, v_operator_names
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id;

  v_expected_count := greatest(
    case
      when coalesce(v_group.metadata ->> 'itemCount', '') ~ '^[0-9]+$'
      then (v_group.metadata ->> 'itemCount')::integer
      else 0
    end,
    2
  );

  if v_request_count < v_expected_count then
    return;
  end if;

  select request.*
  into v_first_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id
  order by request.appointment_group_order, request.created_at, request.id
  limit 1;

  if v_first_request.id is null then
    return;
  end if;

  v_timeline := public.format_booking_group_timeline_v1(
    p_workspace_id,
    p_appointment_group_id
  );
  v_group_title := coalesce(
    nullif(trim(v_group.title), ''),
    nullif(trim(v_first_request.requested_service_name), ''),
    'Composizione'
  );
  v_body := concat_ws(
    ' · ',
    v_group_title,
    to_char(v_first_request.appointment_date, 'DD/MM/YYYY'),
    to_char(v_first_request.appointment_time, 'HH24:MI'),
    case
      when nullif(v_operator_names, '') is not null
      then 'con ' || v_operator_names
      else null
    end
  );
  v_dedupe_key := concat_ws(
    '|',
    p_workspace_id::text,
    'appointment_created_by_salon',
    p_appointment_group_id::text
  );

  delete from public.push_notifications as notification
  where notification.workspace_id = p_workspace_id
    and notification.status = 'queued'::public.push_delivery_status
    and (
      notification.payload ->> 'appointmentGroupId' = p_appointment_group_id::text
      or exists (
        select 1
        from unnest(v_request_ids) as request_id
        where request_id::text = notification.payload ->> 'bookingRequestId'
      )
    );

  perform public.queue_public_customer_push(
    p_workspace_id,
    'custom'::public.push_event_type,
    'Nuovo appuntamento',
    v_body,
    jsonb_build_object(
      'type', 'appointment_created_by_salon',
      'event_type', 'appointment_created_by_salon',
      'notificationType', 'appointment_created_by_salon',
      '_pushEventType', 'appointment_created_by_salon',
      '_pushAudience', 'public',
      '_pushTarget', 'client',
      '_dedupeKey', v_dedupe_key,
      'eventId', v_dedupe_key,
      'bookingRequestId', v_first_request.id,
      'bookingRequestIds', to_jsonb(v_request_ids),
      'appointmentGroupId', p_appointment_group_id,
      'notificationScope', 'appointment_group',
      'status', 'Accettata',
      'statusCode', 'accepted',
      'appointmentDate', v_first_request.appointment_date,
      'appointmentTime', v_first_request.appointment_time,
      'customerName', trim(concat_ws(
        ' ',
        v_first_request.customer_name,
        v_first_request.customer_surname
      )),
      'customerEmail', coalesce(v_first_request.customer_email::text, ''),
      'customerPhone', coalesce(v_first_request.customer_phone, ''),
      'serviceName', v_group_title,
      'operatorName', v_operator_names,
      'bookingTimeline', v_timeline,
      'source', 'owner'
    ),
    v_first_request.customer_email,
    v_first_request.customer_phone
  );
end;
$$;

revoke all on function public.queue_owner_composition_created_push_v1(uuid, uuid)
  from public;
grant execute on function public.queue_owner_composition_created_push_v1(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
