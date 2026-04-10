create or replace function public.is_public_booking_slot_available(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_requested_service_name text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_services jsonb := '[]'::jsonb;
  v_requested_start_at timestamp;
  v_requested_end_at timestamp;
  v_requested_service_name text := trim(coalesce(p_requested_service_name, ''));
  v_requested_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
  v_requested_role text := '';
  v_requested_machinery_ids text[] := array[]::text[];
  v_overlapping_record record;
  v_existing_role text;
  v_existing_machinery_ids text[];
  v_existing_operator_id text;
  v_existing_operator_name text;
  v_requested_uses_operator boolean := false;
  v_existing_uses_operator boolean := false;
begin
  select coalesce(client_portal.servizi, '[]'::jsonb)
  into v_services
  from public.client_portals as client_portal
  where client_portal.workspace_id = p_workspace_id
  limit 1;

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

  v_requested_uses_operator := v_requested_operator_id is not null or v_requested_operator_name is not null;

  v_requested_start_at := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at :=
    p_appointment_date::timestamp + p_appointment_time
    + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1));

  for v_overlapping_record in
    select
      appointment.service_name as existing_service_name,
      appointment.operator_id as existing_operator_id,
      appointment.operator_name as existing_operator_name
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (p_appointment_date::timestamp + appointment.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => coalesce(appointment.duration_minutes, 60))
      ) > v_requested_start_at

    union all

    select
      booking_request.requested_service_name as existing_service_name,
      booking_request.requested_operator_id as existing_operator_id,
      booking_request.requested_operator_name as existing_operator_name
    from public.booking_requests as booking_request
    where booking_request.workspace_id = p_workspace_id
      and booking_request.appointment_date = p_appointment_date
      and booking_request.status in ('pending', 'accepted')
      and (p_appointment_date::timestamp + booking_request.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + booking_request.appointment_time)
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
    v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), '');
    v_existing_uses_operator := v_existing_operator_id is not null or v_existing_operator_name is not null;

    if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0
       and exists (
         select 1
         from unnest(v_requested_machinery_ids) as requested_machinery_id
         join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id
           on existing_machinery_id = requested_machinery_id
       ) then
      return false;
    end if;

    if not v_requested_uses_operator and not v_existing_uses_operator then
      return false;
    end if;

    if v_requested_operator_id is null and v_requested_operator_name is null then
      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          return false;
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        return false;
      end if;

      continue;
    end if;

    if v_existing_operator_id is null and v_existing_operator_name is null then
      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          return false;
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        return false;
      end if;

      continue;
    end if;

    if v_existing_operator_id = v_requested_operator_id then
      return false;
    end if;

    if v_requested_operator_name is not null and v_existing_operator_name = v_requested_operator_name then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer, text, text, text) to anon;
grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer, text, text, text) to authenticated;
