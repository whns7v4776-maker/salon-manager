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
  v_portal_services jsonb := '[]'::jsonb;
  v_max_future_appointments integer;
  v_max_future_appointments_mode text := 'total_future';
  v_max_daily_appointments integer;
  v_existing_future_bookings integer := 0;
  v_existing_daily_bookings integer := 0;
  v_requested_role text := '';
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

  select
    coalesce(client_portal.clienti, '[]'::jsonb),
    coalesce(client_portal.servizi, '[]'::jsonb)
  into v_portal_clients, v_portal_services
  from public.client_portals as client_portal
  where client_portal.workspace_id = v_workspace.id
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
    )
  into v_requested_role
  from jsonb_array_elements(v_portal_services) as service_item
  where lower(trim(coalesce(service_item ->> 'nome', ''))) = lower(v_service_name)
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
    end,
    case
      when matched_client.max_future_appointments_mode in ('monthly', 'total_future')
        then matched_client.max_future_appointments_mode
      else 'total_future'
    end,
    case
      when matched_client.max_daily_appointments_text ~ '^\d+$'
        then matched_client.max_daily_appointments_text::integer
      else null
    end
  into v_max_future_appointments, v_max_future_appointments_mode, v_max_daily_appointments
  from (
    select
      nullif(trim(coalesce(client_item ->> 'maxFutureAppointments', '')), '') as max_future_appointments_text,
      nullif(trim(coalesce(client_item ->> 'maxFutureAppointmentsMode', '')), '') as max_future_appointments_mode,
      nullif(trim(coalesce(client_item ->> 'maxDailyAppointments', '')), '') as max_daily_appointments_text
    from jsonb_array_elements(v_portal_clients) as client_item
    where (
      (v_customer_phone is not null and regexp_replace(coalesce(client_item ->> 'phone', ''), '\D+', '', 'g') = v_customer_phone)
      or (v_customer_email is not null and lower(trim(coalesce(client_item ->> 'email', ''))) = v_customer_email::text)
      or lower(trim(coalesce(client_item ->> 'full_name', client_item ->> 'nome', ''))) = lower(v_customer_full_name)
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
            v_max_future_appointments_mode <> 'monthly'
            or date_trunc('month', appointment.appointment_date::timestamp) =
               date_trunc('month', p_appointment_date::timestamp)
          )
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
          and (
            v_max_future_appointments_mode <> 'monthly'
            or date_trunc('month', booking_request.appointment_date::timestamp) =
               date_trunc('month', p_appointment_date::timestamp)
          )
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

  if v_max_daily_appointments is not null and v_max_daily_appointments >= 0 then
    select
      coalesce((
        select count(*)
        from public.appointments as appointment
        where appointment.workspace_id = v_workspace.id
          and appointment.appointment_date = p_appointment_date
          and (
            (v_customer_id is not null and appointment.customer_id = v_customer_id)
            or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
          )
          and (
            (
              v_requested_role <> ''
              and coalesce((
                select lower(
                  regexp_replace(
                    regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', '')), '\s+', ' ', 'g'),
                    '[^a-z0-9 ]',
                    '',
                    'g'
                  )
                )
                from jsonb_array_elements(v_portal_services) as service_item
                where lower(trim(coalesce(service_item ->> 'nome', ''))) = lower(trim(coalesce(appointment.service_name, '')))
                limit 1
              ), '') = v_requested_role
            )
            or (
              v_requested_role = ''
              and lower(trim(coalesce(appointment.service_name, ''))) = lower(v_service_name)
            )
          )
      ), 0)
      +
      coalesce((
        select count(*)
        from public.booking_requests as booking_request
        where booking_request.workspace_id = v_workspace.id
          and booking_request.appointment_date = p_appointment_date
          and booking_request.status in ('pending', 'accepted')
          and (
            (v_customer_id is not null and booking_request.customer_id = v_customer_id)
            or (v_customer_phone is not null and regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone)
            or (v_customer_email is not null and lower(trim(coalesce(booking_request.customer_email::text, ''))) = v_customer_email::text)
            or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) = lower(v_customer_full_name)
          )
          and (
            (
              v_requested_role <> ''
              and coalesce((
                select lower(
                  regexp_replace(
                    regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', '')), '\s+', ' ', 'g'),
                    '[^a-z0-9 ]',
                    '',
                    'g'
                  )
                )
                from jsonb_array_elements(v_portal_services) as service_item
                where lower(trim(coalesce(service_item ->> 'nome', ''))) = lower(trim(coalesce(booking_request.requested_service_name, '')))
                limit 1
              ), '') = v_requested_role
            )
            or (
              v_requested_role = ''
              and lower(trim(coalesce(booking_request.requested_service_name, ''))) = lower(v_service_name)
            )
          )
      ), 0)
    into v_existing_daily_bookings;

    if v_existing_daily_bookings >= v_max_daily_appointments then
      raise exception 'max_daily_appointments_reached';
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
  returning *
  into v_booking_request;

  return v_booking_request;
end;
$$;
