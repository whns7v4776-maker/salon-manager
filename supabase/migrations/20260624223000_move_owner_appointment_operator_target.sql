drop function if exists public.move_owner_appointment(uuid, date, time);
drop function if exists public.move_owner_appointment(uuid, date, time, text, text);

create or replace function public.move_owner_appointment(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_operator_id text,
  p_next_operator_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_services jsonb := '[]'::jsonb;
  v_next_operator_id text;
  v_next_operator_name text;
  v_requested_operator_id text;
  v_requested_operator_name text;
  v_requested_service_name text;
  v_requested_role text := '';
  v_requested_machinery_ids text[] := array[]::text[];
  v_requested_duration integer;
  v_requested_start_at timestamp;
  v_requested_end_at timestamp;
  v_requested_uses_operator boolean := false;
  v_overlapping_record record;
  v_existing_role text;
  v_existing_machinery_ids text[];
  v_existing_operator_id text;
  v_existing_operator_name text;
  v_existing_uses_operator boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if p_appointment_id is null or p_next_appointment_date is null or p_next_appointment_time is null then
    raise exception 'invalid_arguments';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  select coalesce(client_portal.servizi, '[]'::jsonb)
  into v_services
  from public.client_portals as client_portal
  where client_portal.workspace_id = v_workspace_id
  limit 1;

  v_next_operator_id := coalesce(
    nullif(trim(coalesce(p_next_operator_id, '')), ''),
    nullif(trim(coalesce(v_appointment.operator_id, '')), '')
  );
  v_next_operator_name := coalesce(
    nullif(trim(coalesce(p_next_operator_name, '')), ''),
    nullif(trim(coalesce(v_appointment.operator_name, '')), '')
  );

  v_requested_service_name := trim(coalesce(v_appointment.service_name, ''));
  v_requested_operator_id := v_next_operator_id;
  if v_requested_operator_id like 'salon-capacity::%' then
    v_requested_operator_id := null;
  end if;
  v_requested_operator_name := nullif(lower(trim(coalesce(v_next_operator_name, ''))), '');
  v_requested_duration := greatest(coalesce(v_appointment.duration_minutes, 60), 1);

  select
    coalesce(
      lower(
        regexp_replace(
          regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', '')), '\s+', ' ', 'g'),
          '[^a-z0-9 ]',
          '',
          'g'
        )
      ),
      ''
    ),
    coalesce(
      array(
        select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', '[]'::jsonb)))
      ),
      array[]::text[]
    )
  into v_requested_role, v_requested_machinery_ids
  from jsonb_array_elements(v_services) as service_item
  where lower(trim(coalesce(service_item ->> 'nome', ''))) = lower(v_requested_service_name)
  limit 1;

  v_requested_uses_operator :=
    v_requested_operator_id is not null or v_requested_operator_name is not null;

  v_requested_start_at := p_next_appointment_date::timestamp + p_next_appointment_time;
  v_requested_end_at :=
    p_next_appointment_date::timestamp + p_next_appointment_time
    + make_interval(mins => v_requested_duration);

  for v_overlapping_record in
    select
      appointment.service_name as existing_service_name,
      appointment.operator_id as existing_operator_id,
      appointment.operator_name as existing_operator_name
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.id <> v_appointment.id
      and appointment.appointment_date = p_next_appointment_date
      and (p_next_appointment_date::timestamp + appointment.appointment_time) < v_requested_end_at
      and (
        (p_next_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => coalesce(appointment.duration_minutes, 60))
      ) > v_requested_start_at

    union all

    select
      booking_request.requested_service_name as existing_service_name,
      booking_request.requested_operator_id as existing_operator_id,
      booking_request.requested_operator_name as existing_operator_name
    from public.booking_requests as booking_request
    where booking_request.workspace_id = v_workspace_id
      and booking_request.id is distinct from v_appointment.booking_request_id
      and booking_request.appointment_date = p_next_appointment_date
      and booking_request.status in ('pending', 'accepted')
      and (p_next_appointment_date::timestamp + booking_request.appointment_time) < v_requested_end_at
      and (
        (p_next_appointment_date::timestamp + booking_request.appointment_time)
        + make_interval(mins => coalesce(booking_request.requested_duration_minutes, 60))
      ) > v_requested_start_at
  loop
    select
      coalesce(
        lower(
          regexp_replace(
            regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', '')), '\s+', ' ', 'g'),
            '[^a-z0-9 ]',
            '',
            'g'
          )
        ),
        ''
      ),
      coalesce(
        array(
          select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', '[]'::jsonb)))
        ),
        array[]::text[]
      )
    into v_existing_role, v_existing_machinery_ids
    from jsonb_array_elements(v_services) as service_item
    where lower(trim(coalesce(service_item ->> 'nome', ''))) =
      lower(trim(coalesce(v_overlapping_record.existing_service_name, '')))
    limit 1;

    v_existing_operator_id := nullif(trim(coalesce(v_overlapping_record.existing_operator_id, '')), '');
    if v_existing_operator_id like 'salon-capacity::%' then
      v_existing_operator_id := null;
    end if;
    v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), '');
    v_existing_uses_operator :=
      v_existing_operator_id is not null or v_existing_operator_name is not null;

    if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0
       and exists (
         select 1
         from unnest(v_requested_machinery_ids) as requested_machinery_id
         join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id
           on existing_machinery_id = requested_machinery_id
       ) then
      raise exception 'target_slot_occupied';
    end if;

    if not v_requested_uses_operator and not v_existing_uses_operator then
      raise exception 'target_slot_occupied';
    end if;

    if v_requested_operator_id is null and v_requested_operator_name is null then
      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          raise exception 'target_slot_occupied';
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        raise exception 'target_slot_occupied';
      end if;

      continue;
    end if;

    if v_existing_operator_id is null and v_existing_operator_name is null then
      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          raise exception 'target_slot_occupied';
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        raise exception 'target_slot_occupied';
      end if;

      continue;
    end if;

    if v_existing_operator_id = v_requested_operator_id then
      raise exception 'target_slot_occupied';
    end if;

    if v_requested_operator_name is not null and v_existing_operator_name = v_requested_operator_name then
      raise exception 'target_slot_occupied';
    end if;
  end loop;

  update public.appointments
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      operator_id = v_next_operator_id,
      operator_name = v_next_operator_name,
      updated_at = timezone('utc', now())
  where id = v_appointment.id;

  update public.booking_requests
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      requested_operator_id = coalesce(v_next_operator_id, requested_operator_id),
      requested_operator_name = coalesce(v_next_operator_name, requested_operator_name),
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
  where id = v_appointment.booking_request_id;

  perform public.queue_customer_appointment_rescheduled_push(
    v_workspace_id,
    v_appointment.booking_request_id,
    v_appointment.id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    p_next_appointment_date,
    p_next_appointment_time,
    v_appointment.service_name,
    v_appointment.customer_name,
    v_next_operator_name
  );

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', v_appointment.booking_request_id,
    'previousDate', v_appointment.appointment_date,
    'previousTime', v_appointment.appointment_time,
    'nextDate', p_next_appointment_date,
    'nextTime', p_next_appointment_time,
    'nextOperatorId', v_next_operator_id,
    'nextOperatorName', v_next_operator_name
  );
end;
$$;

grant execute on function public.move_owner_appointment(uuid, date, time, text, text) to authenticated;

create or replace function public.move_owner_appointment(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.move_owner_appointment(
    p_appointment_id,
    p_next_appointment_date,
    p_next_appointment_time,
    null::text,
    null::text
  );
$$;

grant execute on function public.move_owner_appointment(uuid, date, time) to authenticated;
