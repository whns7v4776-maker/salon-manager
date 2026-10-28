-- Owner-created compositions are one logical customer appointment even when
-- the selected customer originally registered through the frontend. The
-- appointment group `source` describes that customer provenance, while each
-- booking request `origin` describes who created the appointment. Use the
-- latter to batch only real backoffice creations and preserve the operator of
-- every component in the single visible push.

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
  v_backoffice_request_count integer := 0;
  v_expected_count integer := 0;
  v_timeline text := '';
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
    coalesce(
      array_agg(
        request.id
        order by request.appointment_group_order nulls last,
          request.created_at,
          request.id
      ),
      '{}'::uuid[]
    ),
    count(*)::integer,
    count(*) filter (
      where request.origin::text = 'backoffice'
    )::integer,
    coalesce(
      string_agg(
        concat(
          coalesce(
            nullif(trim(request.requested_service_name), ''),
            'Servizio'
          ),
          case
            when request.appointment_time is not null
            then ' alle ' || to_char(request.appointment_time, 'HH24:MI')
            else ''
          end,
          case
            when nullif(trim(coalesce(
              request.phase_operator_assignments #>> '{initial,name}',
              request.phase_snapshot ->> 'initialOperatorName',
              request.requested_operator_name,
              ''
            )), '') is not null
            then ' con ' || trim(coalesce(
              request.phase_operator_assignments #>> '{initial,name}',
              request.phase_snapshot ->> 'initialOperatorName',
              request.requested_operator_name
            ))
            else ''
          end,
          case
            when lower(coalesce(
              request.phase_snapshot ->> 'finalPhaseEnabled',
              'false'
            )) = 'true'
              and nullif(trim(coalesce(
                request.phase_operator_assignments #>> '{final,name}',
                request.phase_snapshot ->> 'finalOperatorName',
                ''
              )), '') is not null
              and lower(trim(coalesce(
                request.phase_operator_assignments #>> '{final,name}',
                request.phase_snapshot ->> 'finalOperatorName',
                ''
              ))) is distinct from lower(trim(coalesce(
                request.phase_operator_assignments #>> '{initial,name}',
                request.phase_snapshot ->> 'initialOperatorName',
                request.requested_operator_name,
                ''
              )))
            then ', ripresa con ' || trim(coalesce(
              request.phase_operator_assignments #>> '{final,name}',
              request.phase_snapshot ->> 'finalOperatorName'
            ))
            else ''
          end,
          case
            when coalesce(request.phase_snapshot ->> 'mode', '') = 'phased'
              and coalesce(
                request.phase_snapshot ->> 'processingDurationMinutes',
                ''
              ) ~ '^[0-9]+$'
              and (
                request.phase_snapshot ->> 'processingDurationMinutes'
              )::integer > 0
            then ' (posa ' ||
              (
                request.phase_snapshot ->> 'processingDurationMinutes'
              )::integer::text ||
              ' min)'
            else ''
          end
        ),
        ' · '
        order by request.appointment_group_order nulls last,
          request.created_at,
          request.id
      ),
      ''
    )
  into
    v_request_ids,
    v_request_count,
    v_backoffice_request_count,
    v_timeline
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

  -- Wait until the complete group exists, and never relabel a composition
  -- created by the public customer as an appointment created by the salon.
  if v_request_count < v_expected_count
    or v_backoffice_request_count <> v_request_count
    or nullif(trim(v_timeline), '') is null
  then
    return;
  end if;

  select request.*
  into v_first_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id
  order by request.appointment_group_order nulls last,
    request.created_at,
    request.id
  limit 1;

  if v_first_request.id is null then
    return;
  end if;

  v_group_title := coalesce(
    nullif(trim(v_group.title), ''),
    nullif(trim(v_first_request.requested_service_name), ''),
    'Composizione'
  );
  v_body := concat_ws(
    ' · ',
    v_timeline,
    case
      when v_first_request.appointment_date is not null
      then to_char(v_first_request.appointment_date, 'DD/MM/YYYY')
      else null
    end
  );
  v_dedupe_key := concat_ws(
    '|',
    p_workspace_id::text,
    'appointment_created_by_salon',
    p_appointment_group_id::text
  );

  -- Remove only the still-unsent per-component creation pushes from this
  -- exact group. The canonical group push and every other event stay intact.
  delete from public.push_notifications as notification
  where notification.workspace_id = p_workspace_id
    and notification.status = 'queued'::public.push_delivery_status
    and coalesce(notification.payload ->> 'notificationScope', '') <>
      'appointment_group'
    and lower(coalesce(
      notification.payload ->> 'type',
      notification.payload ->> '_pushEventType',
      ''
    )) in (
      'appointment_created_by_salon',
      'owner_created_client_push',
      'booking_request_status_changed'
    )
    and lower(coalesce(
      notification.payload ->> 'statusCode',
      notification.payload ->> 'status',
      ''
    )) in ('accepted', 'accettata')
    and exists (
      select 1
      from unnest(v_request_ids) as request_id
      where request_id::text = coalesce(
        notification.payload ->> 'bookingRequestId',
        notification.payload ->> 'requestId'
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
      -- Every component time is already present in the ordered timeline.
      'appointmentTime', null,
      'customerName', trim(concat_ws(
        ' ',
        v_first_request.customer_name,
        v_first_request.customer_surname
      )),
      'customerEmail', coalesce(v_first_request.customer_email::text, ''),
      'customerPhone', coalesce(v_first_request.customer_phone, ''),
      -- send-push builds the visible native body from serviceName. Keeping the
      -- ordered timeline here preserves each service-to-operator assignment.
      'serviceName', v_timeline,
      'operatorName', '',
      'bookingTimeline', v_timeline,
      'groupTitle', v_group_title,
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

create or replace function public.finalize_owner_composition_created_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The trigger already fires only for updates of customer_id/total_price. The
  -- helper verifies completeness and backoffice origin, so customer provenance
  -- (`appointment_groups.source`) must not be used as the creation actor.
  if new.status = 'active' then
    perform public.queue_owner_composition_created_push_v1(
      new.workspace_id,
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists zz_finalize_owner_composition_created_push_v1
  on public.appointment_groups;

create trigger zz_finalize_owner_composition_created_push_v1
after update of customer_id, total_price on public.appointment_groups
for each row execute function public.finalize_owner_composition_created_push_v1();

notify pgrst, 'reload schema';
