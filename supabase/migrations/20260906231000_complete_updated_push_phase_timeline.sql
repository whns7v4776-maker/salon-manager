CREATE OR REPLACE FUNCTION public.queue_customer_appointment_rescheduled_push_core_20260830(p_workspace_id uuid, p_booking_request_id uuid, p_appointment_id uuid, p_previous_date date, p_previous_time time without time zone, p_next_date date, p_next_time time without time zone, p_service_name text, p_customer_name text, p_operator_name text DEFAULT NULL::text, p_previous_operator_name text DEFAULT NULL::text, p_move_revision text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      appointment.duration_minutes,
      appointment.phase_snapshot,
      appointment.appointment_date + appointment.appointment_time as phase_start,
      coalesce(nullif(trim(final_operator.name), ''),
        nullif(trim(appointment.phase_operator_assignments #>> '{final,name}'), ''),
        nullif(trim(appointment.phase_snapshot ->> 'finalOperatorName'), ''),
        nullif(trim(initial_operator.name), ''), appointment.operator_name, '') as final_operator_name,
      coalesce((select (pause.value ->> 'pauseAfterMinutes')::integer
        from jsonb_array_elements(case when jsonb_typeof(appointment_group.metadata -> 'itemPauses') = 'array'
          then appointment_group.metadata -> 'itemPauses' else '[]'::jsonb end) as pause(value)
        where pause.value ->> 'position' = appointment.appointment_group_order::text
          and coalesce(pause.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]{1,3}$'
        limit 1), 0) as pause_after_minutes,
      appointment.appointment_date,
      appointment.appointment_time,
      coalesce(
        nullif(trim(initial_operator.name), ''),
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
    left join public.appointment_groups as appointment_group
      on appointment_group.id = appointment.appointment_group_id and appointment_group.workspace_id = appointment.workspace_id
    left join public.operators as initial_operator
      on initial_operator.workspace_id = appointment.workspace_id
      and initial_operator.id::text = coalesce(nullif(appointment.phase_operator_assignments #>> '{initial,id}', ''),
        nullif(appointment.phase_snapshot ->> 'initialOperatorId', ''), appointment.operator_id::text)
    left join public.operators as final_operator
      on final_operator.workspace_id = appointment.workspace_id
      and final_operator.id::text = coalesce(nullif(appointment.phase_operator_assignments #>> '{final,id}', ''),
        nullif(appointment.phase_snapshot ->> 'finalOperatorId', ''))
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
  ), phase_durations as (
    select timeline_rows.*,
      case when phase_snapshot ->> 'mode' = 'phased'
        and coalesce(phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]{1,3}$'
        then (phase_snapshot ->> 'initialDurationMinutes')::integer
        else duration_minutes end as initial_minutes,
      case when phase_snapshot ->> 'mode' = 'phased'
        and phase_snapshot ->> 'finalPhaseEnabled' = 'true'
        and coalesce(phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]{1,3}$'
        then (phase_snapshot ->> 'finalDurationMinutes')::integer else 0 end as final_minutes
    from timeline_rows
  ), detailed_timeline as (
    select phase_durations.*, detail.phases, detail.phase_copy
    from phase_durations
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
        'phase', part.kind, 'label', part.label,
        'startAt', part.starts_at, 'endAt', part.starts_at + make_interval(mins => part.minutes),
        'durationMinutes', part.minutes, 'operatorName', part.operator_name
      ) order by part.position) as phases,
      string_agg(part.label || ' ' || to_char(part.starts_at, 'HH24:MI') || '–' ||
        to_char(part.starts_at + make_interval(mins => part.minutes), 'HH24:MI') ||
        ' (' || part.minutes::text || ' min)' ||
        case when coalesce(part.operator_name, '') <> '' then ' con ' || part.operator_name else '' end,
        ' · ' order by part.position) as phase_copy
      from (values
        (1, 'initial', coalesce(nullif(phase_snapshot ->> 'initialLabel', ''), service_name, 'Servizio'),
          phase_start, initial_minutes, operator_name),
        (2, 'processing', coalesce(nullif(phase_snapshot ->> 'processingLabel', ''), 'Posa'),
          phase_start + make_interval(mins => initial_minutes), processing_duration_minutes, null::text),
        (3, 'final', coalesce(nullif(phase_snapshot ->> 'finalServiceName', ''), 'Ripresa'),
          phase_start + make_interval(mins => initial_minutes + processing_duration_minutes), final_minutes, final_operator_name),
        (4, 'pause', 'Pausa',
          phase_start + make_interval(mins => duration_minutes), pause_after_minutes, null::text)
      ) as part(position, kind, label, starts_at, minutes, operator_name)
      where part.minutes > 0
    ) as detail
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
          'processingDurationMinutes', timeline.processing_duration_minutes,
          'durationMinutes', timeline.duration_minutes,
          'phases', timeline.phases
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
        to_char(timeline.appointment_date, 'DD/MM/YYYY') || ': ' || timeline.phase_copy,
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
  from detailed_timeline as timeline;

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
$function$

