-- Queue one customer push for every persisted owner move. The appointment
-- updated_at value is the stable identity of the mutation: the atomic server
-- enqueue and the immediate client safety-net share it, while a later move
-- (even back to an already used time/operator) gets a fresh identity.

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
declare
  v_request public.booking_requests%rowtype;
  v_appointment_updated_at timestamptz;
  v_body text;
  v_note text;
  v_payload jsonb;
  v_status_code text;
  v_title text;
  v_revision text;
  v_operator_only boolean := p_previous_date = p_next_date and p_previous_time = p_next_time;
  v_operator_changed boolean :=
    nullif(trim(coalesce(p_previous_operator_name, '')), '') is not null
    and nullif(trim(coalesce(p_operator_name, '')), '') is not null
    and lower(trim(p_previous_operator_name)) is distinct from lower(trim(p_operator_name));
  v_operator_copy text := '';
begin
  if p_workspace_id is null or p_booking_request_id is null then return 0; end if;

  select booking_request.* into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = p_workspace_id
    and booking_request.id = p_booking_request_id;
  if v_request.id is null then return 0; end if;

  select appointment.updated_at
  into v_appointment_updated_at
  from public.appointments as appointment
  where appointment.workspace_id = p_workspace_id
    and appointment.id = p_appointment_id;

  -- A direct owner move always has the appointment row. Keep a safe fallback
  -- for legacy callers without an appointment id.
  v_revision := to_char(
    coalesce(v_appointment_updated_at, clock_timestamp()) at time zone 'UTC',
    'YYYYMMDDHH24MISSUS'
  );

  if v_operator_changed then
    v_operator_copy := ' Operatore cambiato da ' || trim(p_previous_operator_name) ||
      ' a ' || trim(p_operator_name) || '.';
  elsif nullif(trim(coalesce(p_operator_name, '')), '') is not null then
    v_operator_copy := ' Operatore: ' || trim(p_operator_name) || '.';
  end if;

  if v_operator_only then
    v_title := 'Aggiornamento appuntamento';
    v_body :=
      'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      '.' || v_operator_copy || ' Appuntamento: ' || to_char(p_next_date, 'DD/MM/YYYY') ||
      ' alle ' || to_char(p_next_time, 'HH24:MI') || '.';
    v_note :=
      'appointment_rescheduled_by_salon. Orario invariato: ' ||
      to_char(p_next_date, 'YYYY-MM-DD') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      '.' || v_operator_copy;
    v_status_code := 'rescheduled:' || to_char(p_next_date, 'YYYY-MM-DD') || ':' ||
      to_char(p_next_time, 'HH24:MI') || ':operator:move:' || v_revision;
  else
    v_title := 'Appuntamento spostato';
    v_body :=
      'Servizio: ' || coalesce(nullif(trim(p_service_name), ''), v_request.requested_service_name, 'appuntamento') ||
      '. Prima: ' || to_char(p_previous_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_previous_time, 'HH24:MI') ||
      '. Nuovo orario: ' || to_char(p_next_date, 'DD/MM/YYYY') || ' alle ' || to_char(p_next_time, 'HH24:MI') ||
      '.' || v_operator_copy;
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
    '_dedupeKey', p_workspace_id::text || '|appointment_rescheduled_by_salon|' ||
      coalesce(p_appointment_id::text, v_request.id::text) || '|move|' || v_revision
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

revoke all on function public.queue_customer_appointment_rescheduled_push_v2(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push_v2(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text
) to authenticated, service_role;

create or replace function public.move_owner_appointment_direct_v1(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.appointments%rowtype;
  v_after public.appointments%rowtype;
  v_result jsonb;
  v_operator_changed boolean := false;
  v_previous_notification_operator_name text;
  v_notification_operator_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select appointment.*
  into v_before
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_before.id is null then
    raise exception 'appointment_not_found';
  end if;

  v_result := public.move_owner_appointment_direct_v1_core_20260819(
    p_appointment_id,
    p_next_appointment_date,
    p_next_appointment_time,
    p_next_initial_operator_id,
    p_next_initial_operator_name,
    p_next_final_operator_id,
    p_next_final_operator_name,
    p_scope,
    p_allow_overlap
  );

  select appointment.*
  into v_after
  from public.appointments as appointment
  where appointment.id = p_appointment_id;

  v_operator_changed :=
    coalesce(v_before.operator_id, '') is distinct from coalesce(v_after.operator_id, '')
    or coalesce(v_before.operator_name, '') is distinct from coalesce(v_after.operator_name, '')
    or coalesce(v_before.phase_operator_assignments, '{}'::jsonb)
      is distinct from coalesce(v_after.phase_operator_assignments, '{}'::jsonb);

  v_previous_notification_operator_name := case
    when p_scope = 'final' then coalesce(
      nullif(trim(v_before.phase_operator_assignments -> 'final' ->> 'name'), ''),
      nullif(trim(v_before.operator_name), '')
    )
    else coalesce(
      nullif(trim(v_before.phase_operator_assignments -> 'initial' ->> 'name'), ''),
      nullif(trim(v_before.operator_name), '')
    )
  end;

  v_notification_operator_name := case
    when p_scope = 'final' then coalesce(
      nullif(trim(v_after.phase_operator_assignments -> 'final' ->> 'name'), ''),
      nullif(trim(v_after.operator_name), '')
    )
    else coalesce(
      nullif(trim(v_after.phase_operator_assignments -> 'initial' ->> 'name'), ''),
      nullif(trim(v_after.operator_name), '')
    )
  end;

  if v_after.booking_request_id is not null
    and (
      v_before.appointment_date is distinct from v_after.appointment_date
      or v_before.appointment_time is distinct from v_after.appointment_time
      or v_operator_changed
    ) then
    perform public.queue_customer_appointment_rescheduled_push_v2(
      v_after.workspace_id,
      v_after.booking_request_id,
      v_after.id,
      v_before.appointment_date,
      v_before.appointment_time,
      v_after.appointment_date,
      v_after.appointment_time,
      v_after.service_name,
      v_after.customer_name,
      v_notification_operator_name,
      v_previous_notification_operator_name
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'booking_request_id', v_after.booking_request_id,
    'bookingRequestId', v_after.booking_request_id,
    'updated_at', v_after.updated_at,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) to authenticated;

comment on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) is 'Moves an owner appointment and atomically queues exactly one targeted customer push per persisted mutation.';

notify pgrst, 'reload schema';
