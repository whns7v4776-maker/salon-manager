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

  v_requested_uses_operator := v_requested_role <> '';

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

    v_existing_uses_operator := coalesce(v_existing_role, '') <> '';

    v_existing_operator_id := nullif(trim(coalesce(v_overlapping_record.existing_operator_id, '')), '');
    v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), '');

    if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0
       and exists (
         select 1
         from unnest(v_requested_machinery_ids) as requested_machinery_id
         join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id
           on existing_machinery_id = requested_machinery_id
       ) then
      return false;
    end if;

    if v_requested_operator_id is null and v_requested_operator_name is null then
      if not v_requested_uses_operator and not v_existing_uses_operator
         and v_existing_operator_id is null and v_existing_operator_name is null then
        return false;
      end if;

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

create or replace function public.create_public_booking_request(
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
  p_operator_id text default null,
  p_operator_name text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_booking_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_notes text;
  v_requested_duration integer;
  v_requested_price numeric(10,2);
  v_requested_operator_id text;
  v_requested_operator_name text;
  v_customer_full_name text;
  v_portal_clients jsonb := '[]'::jsonb;
  v_max_future_appointments integer;
  v_existing_future_bookings integer := 0;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_surname := trim(coalesce(p_customer_surname, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_service_name := trim(coalesce(p_requested_service_name, ''));
  v_notes := nullif(trim(coalesce(p_notes, '')), '');
  v_requested_duration := greatest(coalesce(p_requested_duration_minutes, 60), 1);
  v_requested_price := greatest(coalesce(p_requested_price, 0), 0);
  v_requested_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');
  v_customer_full_name := trim(concat_ws(' ', v_customer_name, v_customer_surname));

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  select coalesce(client_portal.clienti, '[]'::jsonb)
  into v_portal_clients
  from public.client_portals as client_portal
  where client_portal.workspace_id = v_workspace.id
  limit 1;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      or regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_customer_phone
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  select
    case
      when matched_client.max_future_appointments_text ~ '^\d+$'
        then matched_client.max_future_appointments_text::integer
      else null
    end
  into v_max_future_appointments
  from (
    select nullif(trim(coalesce(client_item ->> 'maxFutureAppointments', '')), '') as max_future_appointments_text
    from jsonb_array_elements(v_portal_clients) as client_item
    where (
      (v_customer_phone is not null and regexp_replace(coalesce(client_item ->> 'phone', ''), '\D+', '', 'g') = v_customer_phone)
      or (v_customer_email is not null and lower(trim(coalesce(client_item ->> 'email', ''))) = v_customer_email::text)
      or lower(trim(coalesce(client_item ->> 'full_name', ''))) = lower(v_customer_full_name)
    )
    limit 1
  ) as matched_client;

  if v_max_future_appointments is not null and v_max_future_appointments >= 0 then
    select
      coalesce((
        select count(*)
        from public.appointments as appointment
        where appointment.workspace_id = v_workspace.id
          and appointment.appointment_date >= current_date
          and (
            (v_customer_id is not null and appointment.customer_id = v_customer_id)
            or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
          )
      ), 0)
      +
      coalesce((
        select count(*)
        from public.booking_requests as booking_request
        where booking_request.workspace_id = v_workspace.id
          and booking_request.appointment_date >= current_date
          and booking_request.status in ('pending', 'accepted')
          and (
            (v_customer_id is not null and booking_request.customer_id = v_customer_id)
            or (v_customer_phone is not null and regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone)
            or (v_customer_email is not null and lower(trim(coalesce(booking_request.customer_email::text, ''))) = v_customer_email::text)
            or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) = lower(v_customer_full_name)
          )
      ), 0)
    into v_existing_future_bookings;

    if v_existing_future_bookings >= v_max_future_appointments then
      raise exception 'max_future_appointments_reached';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    v_requested_duration,
    v_service_name,
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    raise exception 'slot_unavailable';
  end if;

  if v_customer_id is null then
    insert into public.customers (
      workspace_id,
      full_name,
      phone,
      email,
      instagram,
      note,
      source,
      viewed_by_salon
    )
    values (
      v_workspace.id,
      v_customer_full_name,
      v_customer_phone,
      v_customer_email,
      v_customer_instagram,
      coalesce(v_notes, ''),
      'frontend',
      false
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      full_name = v_customer_full_name,
      phone = v_customer_phone,
      email = v_customer_email,
      instagram = coalesce(v_customer_instagram, instagram),
      note = coalesce(v_notes, note),
      source = 'frontend',
      updated_at = timezone('utc', now())
    where id = v_customer_id;
  end if;

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    appointment_date,
    appointment_time,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    requested_operator_id,
    requested_operator_name,
    origin,
    status,
    viewed_by_customer
  )
  values (
    v_workspace.id,
    v_customer_id,
    v_service_name,
    v_requested_price,
    v_requested_duration,
    p_appointment_date,
    p_appointment_time,
    v_customer_name,
    v_customer_surname,
    v_customer_email,
    v_customer_phone,
    v_customer_instagram,
    v_notes,
    v_requested_operator_id,
    v_requested_operator_name,
    'frontend',
    'pending',
    false
  )
  returning * into v_booking_request;

  return v_booking_request;
end;
$$;
