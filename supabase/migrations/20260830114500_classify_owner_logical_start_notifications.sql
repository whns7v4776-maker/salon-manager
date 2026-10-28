-- An owner edit is a reschedule only when the customer-visible appointment
-- start changes. Operator/final-phase/internal-plan edits keep their existing
-- notification, but use the distinct reorganization semantic so the portal
-- never presents them as a newly moved appointment.

create or replace function public.queue_customer_appointment_rescheduled_push_core_20260830(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null,
  p_previous_operator_name text default null,
  p_move_revision text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_role text := coalesce(auth.role(), '');
  v_request public.booking_requests%rowtype;
  v_appointment_id uuid;
  v_appointment_booking_request_id uuid;
  v_appointment_updated_at timestamptz;
  v_body text;
  v_note text;
  v_payload jsonb;
  v_status_code text;
  v_title text;
  v_revision_input text := nullif(trim(coalesce(p_move_revision, '')), '');
  v_revision text;
  v_dedupe_key text;
  v_same_row_start boolean := p_previous_date = p_next_date and p_previous_time = p_next_time;
  v_appointment_group_id uuid;
  v_logical_start_appointment_id uuid;
  v_logical_start_date date;
  v_logical_start_time time;
  v_is_logical_start_member boolean := true;
  v_is_reorganization boolean := false;
  v_operator_changed boolean :=
    nullif(trim(coalesce(p_previous_operator_name, '')), '') is not null
    and nullif(trim(coalesce(p_operator_name, '')), '') is not null
    and lower(trim(p_previous_operator_name)) is distinct from lower(trim(p_operator_name));
  v_operator_copy text := '';
  v_notification_marker text;
  v_dedupe_action text;
  v_booking_timeline jsonb := '[]'::jsonb;
  v_timeline_copy text := '';
begin
  if v_auth_role = 'service_role' then
    null;
  elsif v_auth_role = 'authenticated'
    and auth.uid() is not null
    and p_workspace_id is not distinct from public.current_workspace_id()
    and public.workspace_access_allowed()
  then
    null;
  else
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if p_workspace_id is null or p_booking_request_id is null then
    return 0;
  end if;

  select booking_request.* into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = p_workspace_id
    and booking_request.id = p_booking_request_id;
  if v_request.id is null then return 0; end if;

  if p_appointment_id is null then
    v_appointment_group_id := v_request.appointment_group_id;
  end if;

  if p_appointment_id is not null then
    select
      appointment.id,
      appointment.booking_request_id,
      appointment.updated_at,
      appointment.appointment_group_id
    into
      v_appointment_id,
      v_appointment_booking_request_id,
      v_appointment_updated_at,
      v_appointment_group_id
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.id = p_appointment_id;

    if v_appointment_id is null then return 0; end if;

    if v_appointment_booking_request_id is distinct from v_request.id
      and (
        v_appointment_group_id is null
        or v_request.appointment_group_id is distinct from v_appointment_group_id
      )
    then
      raise exception 'appointment_request_mismatch' using errcode = '22023';
    end if;
  end if;

  if v_appointment_group_id is not null then
    select appointment.id, appointment.appointment_date, appointment.appointment_time
    into v_logical_start_appointment_id, v_logical_start_date, v_logical_start_time
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_group_id = v_appointment_group_id
    order by
      appointment.appointment_group_order asc nulls last,
      appointment.appointment_date,
      appointment.appointment_time,
      appointment.id
    limit 1;
    v_is_logical_start_member :=
      p_appointment_id is null
      or (
        v_logical_start_appointment_id is not null
        and v_logical_start_appointment_id = p_appointment_id
      );
  else
    v_logical_start_date := p_next_date;
    v_logical_start_time := p_next_time;
  end if;

  -- Build the complete customer-visible plan from the committed appointment
  -- rows. This keeps v2, v3 and the legacy atomic wrapper on the same ordered
  -- timeline without adding parameters or a second client-side push.
  with timeline_rows as (
    select
      appointment.id,
      appointment.service_name,
      appointment.appointment_date,
      appointment.appointment_time,
      coalesce(
        nullif(trim(appointment.phase_operator_assignments #>> '{initial,name}'), ''),
        nullif(trim(appointment.phase_snapshot ->> 'initialOperatorName'), ''),
        nullif(trim(appointment.operator_name), ''),
        ''
      ) as operator_name,
      case
        when coalesce(
          appointment.phase_snapshot ->> 'processingDurationMinutes',
          ''
        ) ~ '^[0-9]+$'
        then greatest(
          (appointment.phase_snapshot ->> 'processingDurationMinutes')::integer,
          0
        )
        else 0
      end as processing_duration_minutes,
      appointment.appointment_group_order,
      appointment.created_at
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and (
        (
          v_appointment_group_id is not null
          and appointment.appointment_group_id = v_appointment_group_id
        )
        or (
          v_appointment_group_id is null
          and (
            appointment.id = p_appointment_id
            or (
              p_appointment_id is null
              and appointment.booking_request_id = p_booking_request_id
            )
          )
        )
      )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'appointmentId', timeline.id,
          'serviceName', coalesce(nullif(trim(timeline.service_name), ''), 'Servizio'),
          'appointmentDate', timeline.appointment_date,
          'appointmentTime', to_char(timeline.appointment_time, 'HH24:MI'),
          'operatorName', timeline.operator_name,
          'processingDurationMinutes', timeline.processing_duration_minutes
        )
        order by
          timeline.appointment_group_order asc nulls last,
          timeline.appointment_date,
          timeline.appointment_time,
          timeline.created_at,
          timeline.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      string_agg(
        coalesce(nullif(trim(timeline.service_name), ''), 'Servizio') ||
        ', ' || to_char(timeline.appointment_date, 'DD/MM/YYYY') ||
        ' alle ' || to_char(timeline.appointment_time, 'HH24:MI') ||
        case
          when timeline.operator_name <> ''
          then ' con ' || timeline.operator_name
          else ''
        end ||
        case
          when timeline.processing_duration_minutes > 0
          then ' · posa ' || timeline.processing_duration_minutes::text || ' min'
          else ''
        end,
        '; ' order by
          timeline.appointment_group_order asc nulls last,
          timeline.appointment_date,
          timeline.appointment_time,
          timeline.created_at,
          timeline.id
      ),
      ''
    )
  into v_booking_timeline, v_timeline_copy
  from timeline_rows as timeline;

  if nullif(trim(v_timeline_copy), '') is null then
    v_booking_timeline := jsonb_build_array(jsonb_build_object(
      'appointmentId', p_appointment_id,
      'serviceName', coalesce(
        nullif(trim(p_service_name), ''),
        v_request.requested_service_name,
        'Servizio'
      ),
      'appointmentDate', p_next_date,
      'appointmentTime', to_char(p_next_time, 'HH24:MI'),
      'operatorName', coalesce(nullif(trim(p_operator_name), ''), ''),
      'processingDurationMinutes', 0
    ));
    v_timeline_copy :=
      coalesce(
        nullif(trim(p_service_name), ''),
        v_request.requested_service_name,
        'Servizio'
      ) || ', ' || to_char(p_next_date, 'DD/MM/YYYY') ||
      ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      case
        when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then ' con ' || trim(p_operator_name)
        else ''
      end;
  end if;

  v_is_reorganization := v_same_row_start or not v_is_logical_start_member;

  if v_revision_input ~ '^[0-9]{20}$' then
    v_revision := v_revision_input;
  elsif v_revision_input is not null then
    begin
      v_revision := to_char(
        v_revision_input::timestamptz at time zone 'UTC',
        'YYYYMMDDHH24MISSUS'
      );
    exception
      when others then
        v_revision := null;
    end;
  end if;

  v_revision := coalesce(
    v_revision,
    to_char(
      coalesce(v_appointment_updated_at, clock_timestamp()) at time zone 'UTC',
      'YYYYMMDDHH24MISSUS'
    )
  );
  v_notification_marker := case
    when v_is_reorganization then 'appointment_reorganized_by_salon'
    else 'appointment_rescheduled_by_salon'
  end;
  v_dedupe_action := case when v_is_reorganization then 'reorganize' else 'move' end;
  v_dedupe_key := lower(
    p_workspace_id::text || '|' || v_notification_marker || '|' ||
    case
      when p_appointment_id is null then p_booking_request_id::text
      else coalesce(
        v_appointment_group_id::text,
        p_appointment_id::text,
        p_booking_request_id::text
      )
    end || '|' || v_dedupe_action || '|' || v_revision
  );

  if exists (
    select 1
    from public.push_notifications as notification
    where notification.workspace_id = p_workspace_id
      and notification.status::text in ('queued', 'processing', 'sent')
      and lower(trim(coalesce(notification.payload ->> '_dedupeKey', ''))) =
        v_dedupe_key
  ) then
    return 0;
  end if;

  if v_operator_changed then
    v_operator_copy := ' Operatore cambiato da ' || trim(p_previous_operator_name) ||
      ' a ' || trim(p_operator_name) || '.';
  elsif nullif(trim(coalesce(p_operator_name, '')), '') is not null then
    v_operator_copy := ' Operatore: ' || trim(p_operator_name) || '.';
  end if;

  if v_is_reorganization then
    v_title := 'Appuntamento aggiornato';
    v_body :=
      'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      '.' || v_operator_copy || ' Inizio appuntamento invariato: ' ||
      to_char(coalesce(v_logical_start_date, p_next_date), 'DD/MM/YYYY') ||
      ' alle ' || to_char(coalesce(v_logical_start_time, p_next_time), 'HH24:MI') ||
      '. Nuova organizzazione: ' || v_timeline_copy || '.';
    v_note :=
      'appointment_reorganized_by_salon. Il salone ha aggiornato il tuo appuntamento. Inizio invariato: ' ||
      to_char(coalesce(v_logical_start_date, p_next_date), 'YYYY-MM-DD') || ' alle ' ||
      to_char(coalesce(v_logical_start_time, p_next_time), 'HH24:MI') ||
      '.' || v_operator_copy;
    v_status_code := 'reorganized:' ||
      to_char(coalesce(v_logical_start_date, p_next_date), 'YYYY-MM-DD') || ':' ||
      to_char(coalesce(v_logical_start_time, p_next_time), 'HH24:MI') ||
      ':internal:' || v_revision;
  else
    v_title := 'Appuntamento spostato';
    v_body :=
      'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      '. Prima: ' || to_char(p_previous_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
      '. Nuovo orario: ' || to_char(p_next_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      '.' || v_operator_copy || ' Programma: ' || v_timeline_copy || '.';
    v_note :=
      'appointment_rescheduled_by_salon. Il salone ha spostato il tuo appuntamento di ' ||
      coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      ' da ' || to_char(p_previous_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
      ' a ' || to_char(p_next_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      '.' || v_operator_copy;
    v_status_code := 'rescheduled:' || to_char(p_next_date, 'YYYY-MM-DD') || ':' ||
      to_char(p_next_time, 'HH24:MI') || ':move:' || v_revision;
  end if;

  update public.booking_requests
  set viewed_by_customer = false,
      notes = v_note,
      updated_at = timezone('utc', now())
  where id = v_request.id and workspace_id = p_workspace_id;

  -- The customer frontend reads the canonical portal projection. Persist the
  -- semantic marker there in the same transaction as the request update;
  -- otherwise its date changes while the old "new appointment" badge survives.
  perform public.sync_client_portal_booking_requests(p_workspace_id);

  v_payload := jsonb_build_object(
    'type', v_notification_marker,
    'event_type', v_notification_marker,
    'notificationType', v_notification_marker,
    '_pushEventType', v_notification_marker,
    '_pushTarget', 'client',
    '_pushAudience', 'public',
    'status', v_status_code,
    'statusCode', v_status_code,
    'moveRevision', v_revision,
    'bookingRequestId', v_request.id,
    'appointmentId', p_appointment_id,
    'previousDate', p_previous_date,
    'previousTime', to_char(p_previous_time, 'HH24:MI'),
    'appointmentDate', p_next_date,
    'appointmentTime', to_char(p_next_time, 'HH24:MI'),
    'customerName', coalesce(nullif(trim(p_customer_name), ''), trim(v_request.customer_name || ' ' || v_request.customer_surname)),
    'serviceName', coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name),
    'previousOperatorName', nullif(trim(coalesce(p_previous_operator_name, '')), ''),
    'operatorName', nullif(trim(coalesce(p_operator_name, '')), ''),
    'customerEmail', coalesce(v_request.customer_email::text, ''),
    'customerPhone', coalesce(v_request.customer_phone, ''),
    'source', 'owner',
    'appointmentGroupId', v_appointment_group_id,
    'notificationScope', case
      when v_appointment_group_id is not null then 'appointment_group'
      else 'appointment'
    end,
    'bookingTimeline', v_timeline_copy,
    'bookingTimelineItems', v_booking_timeline,
    '_dedupeKey', v_dedupe_key
  );

  return public.queue_public_customer_push(
    p_workspace_id,
    'booking_request_status_changed'::public.push_event_type,
    v_title,
    v_body,
    v_payload,
    v_request.customer_email,
    v_request.customer_phone
  );
end;
$$;

create or replace function public.queue_customer_appointment_rescheduled_push_v2(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null,
  p_previous_operator_name text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.queue_customer_appointment_rescheduled_push_core_20260830(
    p_workspace_id,
    p_booking_request_id,
    p_appointment_id,
    p_previous_date,
    p_previous_time,
    p_next_date,
    p_next_time,
    p_service_name,
    p_customer_name,
    p_operator_name,
    p_previous_operator_name,
    null
  );
end;
$$;

create or replace function public.queue_customer_appointment_rescheduled_push_v3(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null,
  p_previous_operator_name text default null,
  p_move_revision text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.queue_customer_appointment_rescheduled_push_core_20260830(
    p_workspace_id,
    p_booking_request_id,
    p_appointment_id,
    p_previous_date,
    p_previous_time,
    p_next_date,
    p_next_time,
    p_service_name,
    p_customer_name,
    p_operator_name,
    p_previous_operator_name,
    p_move_revision
  );
end;
$$;

-- Older move/swap RPCs still call the original helper name. Route them through
-- the same classifier so their atomic enqueue and the client safety-net share
-- one marker and one authoritative dedupe key.
create or replace function public.queue_customer_appointment_rescheduled_push(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.queue_customer_appointment_rescheduled_push_v2(
    p_workspace_id,
    p_booking_request_id,
    p_appointment_id,
    p_previous_date,
    p_previous_time,
    p_next_date,
    p_next_time,
    p_service_name,
    p_customer_name,
    p_operator_name,
    null
  );
end;
$$;

revoke all on function public.queue_customer_appointment_rescheduled_push_core_20260830(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) from public, anon, authenticated;

revoke all on function public.queue_customer_appointment_rescheduled_push_v2(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push_v2(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text
) to authenticated, service_role;

revoke all on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.queue_customer_appointment_rescheduled_push(
  uuid, uuid, uuid, date, time, date, time, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push(
  uuid, uuid, uuid, date, time, date, time, text, text, text
) to authenticated, service_role;

comment on function public.queue_customer_appointment_rescheduled_push_v2(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text
) is 'Queues a move only for a changed logical start; time-invariant edits are customer-visible reorganizations.';

comment on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) is 'Stable safety-net dedupe for both logical-start moves and time-invariant appointment reorganizations.';

comment on function public.queue_customer_appointment_rescheduled_push(
  uuid, uuid, uuid, date, time, date, time, text, text, text
) is 'Compatibility wrapper that applies the canonical logical-start notification classifier.';

notify pgrst, 'reload schema';
