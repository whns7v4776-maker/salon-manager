alter function public.propose_owner_booking_operator_change_v1(
  uuid,
  text,
  text,
  integer
) rename to propose_owner_booking_operator_change_impl_v1;

create or replace function public.propose_owner_booking_operator_change_v1(
  p_request_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_next_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_request public.booking_requests%rowtype;
  v_customer_name text;
  v_push_queued_count integer := 0;
  v_existing_notification_id uuid;
  v_event_key text;
begin
  v_result := public.propose_owner_booking_operator_change_impl_v1(
    p_request_id,
    p_operator_id,
    p_operator_name,
    p_next_duration_minutes
  );

  select request.*
  into v_request
  from public.booking_requests as request
  where request.id = p_request_id
    and request.workspace_id = public.current_workspace_id()
  limit 1;

  if v_request.id is null
    or v_request.status::text <> 'pending'
    or v_request.operator_change_status <> 'pending'
    or v_request.operator_change_requested_at is null then
    raise exception 'operator_change_not_persisted';
  end if;

  select notification.id
  into v_existing_notification_id
  from public.push_notifications as notification
  where notification.workspace_id = v_request.workspace_id
    and notification.payload ->> 'bookingRequestId' = v_request.id::text
    and coalesce(
      notification.payload ->> 'type',
      notification.payload ->> '_pushEventType',
      ''
    ) = 'booking_operator_change_confirmation'
    and notification.created_at >= v_request.operator_change_requested_at - interval '1 second'
    and notification.status in ('queued', 'processing', 'sent')
  order by notification.created_at desc
  limit 1;

  if v_existing_notification_id is not null then
    v_push_queued_count := 1;
  else
    v_customer_name := trim(
      concat_ws(
        ' ',
        coalesce(v_request.customer_name, ''),
        coalesce(v_request.customer_surname, '')
      )
    );
    v_event_key := concat_ws(
      '|',
      v_request.workspace_id::text,
      'operator_change',
      v_request.id::text,
      extract(epoch from v_request.operator_change_requested_at)::bigint::text
    );

    v_push_queued_count := public.queue_public_customer_push(
      v_request.workspace_id,
      'custom'::public.push_event_type,
      'Conferma cambio operatore',
      concat(
        'Per ', trim(v_request.requested_service_name), ' del ',
        to_char(v_request.appointment_date, 'DD/MM'), ' alle ',
        to_char(v_request.appointment_time, 'HH24:MI'), ' il salone propone ',
        trim(v_request.operator_change_proposed_name),
        case
          when nullif(trim(v_request.operator_change_original_name), '') is not null
            then ' al posto di ' || trim(v_request.operator_change_original_name)
          else ''
        end,
        '. Apri SalonPro per accettare o rifiutare.'
      ),
      jsonb_build_object(
        'type', 'booking_operator_change_confirmation',
        'eventType', 'booking_operator_change_confirmation',
        'notificationType', 'booking_operator_change_confirmation',
        '_pushEventType', 'booking_operator_change_confirmation',
        '_pushAudience', 'public',
        '_pushTarget', 'client',
        '_dedupeKey', v_event_key,
        'statusCode', concat(
          'operator_change_pending:',
          extract(epoch from v_request.operator_change_requested_at)::bigint::text
        ),
        'bookingRequestId', v_request.id,
        'appointmentDate', v_request.appointment_date,
        'appointmentTime', v_request.appointment_time,
        'customerName', v_customer_name,
        'customerEmail', coalesce(v_request.customer_email::text, ''),
        'customerPhone', coalesce(v_request.customer_phone, ''),
        'serviceName', v_request.requested_service_name,
        'originalOperatorName', coalesce(v_request.operator_change_original_name, ''),
        'proposedOperatorName', coalesce(v_request.operator_change_proposed_name, ''),
        'operatorChangeRequestedAt', v_request.operator_change_requested_at
      ),
      v_request.customer_email,
      v_request.customer_phone
    );
  end if;

  return v_result || jsonb_build_object(
    'persisted', true,
    'pushQueuedCount', greatest(coalesce(v_push_queued_count, 0), 0),
    'pushQueued', greatest(coalesce(v_push_queued_count, 0), 0) > 0
  );
end;
$$;

revoke all on function public.propose_owner_booking_operator_change_v1(
  uuid,
  text,
  text,
  integer
) from public;
grant execute on function public.propose_owner_booking_operator_change_v1(
  uuid,
  text,
  text,
  integer
) to authenticated;

do $$
declare
  v_request public.booking_requests%rowtype;
  v_customer_name text;
  v_event_key text;
begin
  for v_request in
    select request.*
    from public.booking_requests as request
    where request.status::text = 'pending'
      and request.operator_change_status = 'pending'
      and request.operator_change_requested_at is not null
      and not exists (
        select 1
        from public.push_notifications as notification
        where notification.workspace_id = request.workspace_id
          and notification.payload ->> 'bookingRequestId' = request.id::text
          and coalesce(
            notification.payload ->> 'type',
            notification.payload ->> '_pushEventType',
            ''
          ) = 'booking_operator_change_confirmation'
          and notification.created_at >= request.operator_change_requested_at - interval '1 second'
          and notification.status in ('queued', 'processing', 'sent')
      )
  loop
    v_customer_name := trim(
      concat_ws(
        ' ',
        coalesce(v_request.customer_name, ''),
        coalesce(v_request.customer_surname, '')
      )
    );
    v_event_key := concat_ws(
      '|',
      v_request.workspace_id::text,
      'operator_change',
      v_request.id::text,
      extract(epoch from v_request.operator_change_requested_at)::bigint::text
    );

    perform public.queue_public_customer_push(
      v_request.workspace_id,
      'custom'::public.push_event_type,
      'Conferma cambio operatore',
      concat(
        'Per ', trim(v_request.requested_service_name), ' del ',
        to_char(v_request.appointment_date, 'DD/MM'), ' alle ',
        to_char(v_request.appointment_time, 'HH24:MI'), ' il salone propone ',
        trim(v_request.operator_change_proposed_name),
        '. Apri SalonPro per accettare o rifiutare.'
      ),
      jsonb_build_object(
        'type', 'booking_operator_change_confirmation',
        'eventType', 'booking_operator_change_confirmation',
        'notificationType', 'booking_operator_change_confirmation',
        '_pushEventType', 'booking_operator_change_confirmation',
        '_pushAudience', 'public',
        '_pushTarget', 'client',
        '_dedupeKey', v_event_key,
        'statusCode', concat(
          'operator_change_pending:',
          extract(epoch from v_request.operator_change_requested_at)::bigint::text
        ),
        'bookingRequestId', v_request.id,
        'appointmentDate', v_request.appointment_date,
        'appointmentTime', v_request.appointment_time,
        'customerName', v_customer_name,
        'customerEmail', coalesce(v_request.customer_email::text, ''),
        'customerPhone', coalesce(v_request.customer_phone, ''),
        'serviceName', v_request.requested_service_name,
        'originalOperatorName', coalesce(v_request.operator_change_original_name, ''),
        'proposedOperatorName', coalesce(v_request.operator_change_proposed_name, ''),
        'operatorChangeRequestedAt', v_request.operator_change_requested_at
      ),
      v_request.customer_email,
      v_request.customer_phone
    );
  end loop;
end;
$$;
