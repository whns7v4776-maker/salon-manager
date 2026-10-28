-- Salon-controlled public assignment for phased services.
-- Existing services remain compatible because a missing flag means enabled.

create or replace function public.get_public_phased_booking_slot_availability_batch_v2(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_allow_split_operators boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_interval jsonb;
  v_slot_time text;
  v_interval_time text;
  v_interval_duration integer;
  v_available boolean;
  v_operator public.operators%rowtype;
  v_has_operators boolean;
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(p_slot_requests) <> 'array'
  then
    return v_result;
  end if;

  if nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null
  then
    return public.get_public_booking_slot_availability_batch(
      p_workspace_id,
      p_appointment_date,
      p_slot_requests,
      p_requested_service_name,
      p_requested_operator_id,
      p_requested_operator_name
    );
  end if;

  select exists(
    select 1
    from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
  ) into v_has_operators;

  if not v_has_operators then
    return public.get_public_booking_slot_availability_batch(
      p_workspace_id,
      p_appointment_date,
      p_slot_requests,
      p_requested_service_name,
      null,
      null
    );
  end if;

  for v_slot in select value from jsonb_array_elements(p_slot_requests)
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    v_available := false;

    if v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and jsonb_typeof(v_slot -> 'intervals') = 'array'
      and jsonb_array_length(v_slot -> 'intervals') > 0
    then
      if coalesce(p_allow_split_operators, true) then
        v_available := true;
        for v_interval in select value from jsonb_array_elements(v_slot -> 'intervals')
        loop
          v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
          v_interval_duration := case
            when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
              then (v_interval ->> 'durationMinutes')::integer
            else 0
          end;

          if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
            or v_interval_duration <= 0
            or not exists(
              select 1
              from public.operators as operator
              where operator.workspace_id = p_workspace_id
                and (
                  nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
                  or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
                )
                and public.is_public_booking_slot_available(
                  p_workspace_id,
                  p_appointment_date,
                  v_interval_time::time,
                  v_interval_duration,
                  p_requested_service_name,
                  operator.id::text,
                  operator.name
                )
            )
          then
            v_available := false;
            exit;
          end if;
        end loop;
      else
        for v_operator in
          select operator.*
          from public.operators as operator
          where operator.workspace_id = p_workspace_id
            and (
              nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
              or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
            )
          order by operator.created_at, operator.name
        loop
          v_available := true;
          for v_interval in select value from jsonb_array_elements(v_slot -> 'intervals')
          loop
            v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
            v_interval_duration := case
              when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
                then (v_interval ->> 'durationMinutes')::integer
              else 0
            end;
            if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
              or v_interval_duration <= 0
              or not public.is_public_booking_slot_available(
                p_workspace_id,
                p_appointment_date,
                v_interval_time::time,
                v_interval_duration,
                p_requested_service_name,
                v_operator.id::text,
                v_operator.name
              )
            then
              v_available := false;
              exit;
            end if;
          end loop;
          exit when v_available;
        end loop;
      end if;
    end if;

    if v_slot_time <> '' then
      v_result := v_result || jsonb_build_object(v_slot_time, v_available);
    end if;
  end loop;

  return v_result;
end;
$$;

grant execute on function public.get_public_phased_booking_slot_availability_batch_v2(
  uuid, date, jsonb, text, text, text, text, boolean
) to anon, authenticated;

create or replace function public.create_public_phased_booking_request_v3(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_phase_snapshot jsonb default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_operator public.operators%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_allow_split boolean := coalesce((p_phase_snapshot ->> 'allowFrontendSplitOperators')::boolean, true);
begin
  if v_allow_split
    or nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null
  then
    return public.create_public_phased_booking_request_v2(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, p_operator_id,
      p_operator_name, p_phase_snapshot
    );
  end if;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  if not exists(select 1 from public.operators where workspace_id = v_workspace_id) then
    return public.create_public_phased_booking_request_v2(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, null, null, p_phase_snapshot
    );
  end if;

  v_initial := greatest(coalesce((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 1);
  v_processing := greatest(coalesce((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 1);
  v_final := greatest(coalesce((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 1);
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  select operator.* into v_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
      or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
    )
    and public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
      p_requested_service_name, operator.id::text, operator.name
    )
    and public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, v_final_time, v_final,
      p_requested_service_name, operator.id::text, operator.name
    )
  order by operator.created_at, operator.name
  limit 1;

  if v_operator.id is null then raise exception 'slot_unavailable'; end if;

  return public.create_public_phased_booking_request_v2(
    p_salon_code, p_requested_service_name, p_requested_price,
    p_requested_duration_minutes, p_appointment_date, p_appointment_time,
    p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
    p_customer_instagram, p_notes, p_required_role,
    v_operator.id::text, v_operator.name, p_phase_snapshot
  );
end;
$$;

grant execute on function public.create_public_phased_booking_request_v3(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.resize_owner_appointment_duration_v1(
  p_appointment_id uuid,
  p_next_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_previous_duration integer;
  v_start_at timestamp;
  v_next_end_at timestamp;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  if p_appointment_id is null or p_next_duration_minutes is null then
    raise exception 'invalid_arguments';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id and appointment.id = p_appointment_id;
  if v_appointment.id is null then raise exception 'appointment_not_found'; end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_appointment.appointment_date::text)
  );
  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id and appointment.id = p_appointment_id
  for update;

  if v_appointment.phase_snapshot is not null then raise exception 'phased_duration_requires_editor'; end if;
  if p_next_duration_minutes < 5 or p_next_duration_minutes > 720 then
    raise exception 'invalid_duration';
  end if;

  v_previous_duration := greatest(coalesce(v_appointment.duration_minutes, 60), 1);
  if p_next_duration_minutes = v_previous_duration then
    return jsonb_build_object(
      'appointmentId', v_appointment.id,
      'bookingRequestId', v_appointment.booking_request_id,
      'previousDurationMinutes', v_previous_duration,
      'nextDurationMinutes', p_next_duration_minutes,
      'changed', false
    );
  end if;

  v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);
  select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
  into v_slot_interval
  from jsonb_array_elements(coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)) as date_interval
  where date_interval ->> 'date' = v_appointment.appointment_date::text
  limit 1;
  v_slot_interval := coalesce(
    v_slot_interval,
    nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
    30
  );
  if v_slot_interval < 5 or v_slot_interval > 300 or v_slot_interval % 5 <> 0 then
    v_slot_interval := 30;
  end if;
  if abs(p_next_duration_minutes - v_previous_duration) % v_slot_interval <> 0 then
    raise exception 'invalid_duration_step';
  end if;

  v_start_at := v_appointment.appointment_date::timestamp + v_appointment.appointment_time;
  v_next_end_at := v_start_at + make_interval(mins => p_next_duration_minutes);
  if v_next_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  if p_next_duration_minutes > v_previous_duration and exists(
    select 1
    from public.appointments as other
    where other.workspace_id = v_workspace_id
      and other.id <> v_appointment.id
      and other.appointment_date = v_appointment.appointment_date
      and (other.appointment_date::timestamp + other.appointment_time) < v_next_end_at
      and (
        other.appointment_date::timestamp + other.appointment_time
        + make_interval(mins => greatest(coalesce(other.duration_minutes, 60), 1))
      ) > v_start_at
      and (
        (v_appointment.customer_id is not null and other.customer_id = v_appointment.customer_id)
        or lower(trim(other.customer_name)) = lower(trim(v_appointment.customer_name))
        or (
          nullif(trim(coalesce(v_appointment.operator_id, '')), '') is not null
          and (
            other.operator_id = v_appointment.operator_id
            or (
              nullif(trim(coalesce(other.operator_id, '')), '') is null
              and lower(trim(coalesce(other.operator_name, ''))) =
                lower(trim(coalesce(v_appointment.operator_name, '')))
            )
          )
        )
        or (
          nullif(trim(coalesce(v_appointment.operator_id, '')), '') is null
          and nullif(trim(coalesce(v_appointment.operator_name, '')), '') is null
          and nullif(trim(coalesce(other.operator_id, '')), '') is null
          and nullif(trim(coalesce(other.operator_name, '')), '') is null
          and lower(trim(coalesce(other.required_role, ''))) =
            lower(trim(coalesce(v_appointment.required_role, '')))
        )
      )
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set duration_minutes = p_next_duration_minutes,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id and id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = p_next_duration_minutes,
        updated_at = timezone('utc', now())
    where workspace_id = v_workspace_id and id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', v_appointment.booking_request_id,
    'previousDurationMinutes', v_previous_duration,
    'nextDurationMinutes', p_next_duration_minutes,
    'slotIntervalMinutes', v_slot_interval,
    'changed', true
  );
end;
$$;

revoke all on function public.resize_owner_appointment_duration_v1(uuid, integer) from public;
grant execute on function public.resize_owner_appointment_duration_v1(uuid, integer) to authenticated;

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
declare
  v_request public.booking_requests%rowtype;
  v_body text;
  v_note text;
  v_payload jsonb;
  v_status_code text;
  v_title text;
  v_operator_only boolean := p_previous_date = p_next_date and p_previous_time = p_next_time;
begin
  if p_workspace_id is null or p_booking_request_id is null then return 0; end if;

  select booking_request.* into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = p_workspace_id
    and booking_request.id = p_booking_request_id;
  if v_request.id is null then return 0; end if;

  if v_operator_only then
    v_title := 'Operatore aggiornato dal salone';
    v_body :=
      'Il tuo appuntamento di ' ||
      coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      ' resta il ' || to_char(p_next_date, 'DD/MM/YYYY') || ' alle ' ||
      to_char(p_next_time, 'HH24:MI') ||
      case when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Nuovo operatore: ' || trim(p_operator_name) || '.' else '.' end;
    v_note :=
      'appointment_rescheduled_by_salon. Il salone ha aggiornato l''operatore senza cambiare data e ora' ||
      case when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Nuovo operatore: ' || trim(p_operator_name) || '.' else '.' end;
    v_status_code := 'rescheduled:' || to_char(p_next_date, 'YYYY-MM-DD') || ':' ||
      to_char(p_next_time, 'HH24:MI') || ':operator';
  else
    v_title := 'Appuntamento spostato dal salone';
    v_body :=
      'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      '. Prima: ' || to_char(p_previous_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
      '. Nuovo orario: ' || to_char(p_next_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      case when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Operatore: ' || trim(p_operator_name) || '.' else '.' end;
    v_note :=
      'appointment_rescheduled_by_salon. Il salone ha spostato il tuo appuntamento di ' ||
      coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      ' da ' || to_char(p_previous_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
      ' a ' || to_char(p_next_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      case when nullif(trim(coalesce(p_operator_name, '')), '') is not null
        then '. Operatore: ' || trim(p_operator_name) || '.' else '.' end;
    v_status_code := 'rescheduled:' || to_char(p_next_date, 'YYYY-MM-DD') || ':' || to_char(p_next_time, 'HH24:MI');
  end if;

  update public.booking_requests
  set viewed_by_customer = false, notes = v_note, updated_at = timezone('utc', now())
  where id = v_request.id and workspace_id = p_workspace_id;

  v_payload := jsonb_build_object(
    'type', 'appointment_rescheduled_by_salon',
    'event_type', 'appointment_rescheduled_by_salon',
    'notificationType', 'appointment_rescheduled_by_salon',
    '_pushEventType', 'appointment_rescheduled_by_salon',
    '_pushTarget', 'client',
    '_pushAudience', 'public',
    'status', v_status_code,
    'statusCode', v_status_code,
    'bookingRequestId', v_request.id,
    'appointmentId', p_appointment_id,
    'previousDate', p_previous_date,
    'previousTime', to_char(p_previous_time, 'HH24:MI'),
    'appointmentDate', p_next_date,
    'appointmentTime', to_char(p_next_time, 'HH24:MI'),
    'customerName', coalesce(nullif(trim(p_customer_name), ''), trim(v_request.customer_name || ' ' || v_request.customer_surname)),
    'serviceName', coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name),
    'operatorName', nullif(trim(coalesce(p_operator_name, '')), ''),
    'customerEmail', coalesce(v_request.customer_email::text, ''),
    'customerPhone', coalesce(v_request.customer_phone, ''),
    'source', 'owner',
    '_dedupeKey', p_workspace_id::text || '|appointment_rescheduled_by_salon|' ||
      coalesce(p_appointment_id::text, v_request.id::text) || '|' ||
      to_char(p_previous_date, 'YYYY-MM-DD') || '|' || to_char(p_previous_time, 'HH24:MI') || '|' ||
      to_char(p_next_date, 'YYYY-MM-DD') || '|' || to_char(p_next_time, 'HH24:MI') || '|' ||
      coalesce(nullif(trim(p_operator_name), ''), '')
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

revoke all on function public.queue_customer_appointment_rescheduled_push(
  uuid, uuid, uuid, date, time, date, time, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push(
  uuid, uuid, uuid, date, time, date, time, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';
