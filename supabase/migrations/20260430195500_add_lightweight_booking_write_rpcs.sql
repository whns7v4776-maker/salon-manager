create or replace function public.create_public_booking_request_lightweight_v1(
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
  v_requested_role text := '';
  v_requested_operator_id text;
  v_requested_operator_name text;
  v_customer_full_name text;
  v_max_future_appointments integer;
  v_max_future_appointments_mode text := 'total_future';
  v_max_daily_appointments integer;
  v_existing_future_bookings integer := 0;
  v_existing_daily_bookings integer := 0;
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
  v_requested_role := lower(
    regexp_replace(
      regexp_replace(trim(coalesce(p_required_role, '')), '\s+', ' ', 'g'),
      '[^a-z0-9 ]',
      '',
      'g'
    )
  );
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
    customer.id,
    customer.max_future_appointments,
    coalesce(customer.max_future_appointments_mode, 'total_future'),
    customer.max_daily_appointments
  into
    v_customer_id,
    v_max_future_appointments,
    v_max_future_appointments_mode,
    v_max_daily_appointments
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

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
            or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
            or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
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
            (v_requested_role <> '' and lower(trim(coalesce(appointment.operator_name, ''))) = lower(trim(coalesce(v_requested_operator_name, ''))))
            or (v_requested_role <> '' and lower(trim(coalesce(appointment.service_name, ''))) = lower(v_service_name))
            or (v_requested_role = '' and lower(trim(coalesce(appointment.service_name, ''))) = lower(v_service_name))
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
            or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
            or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
            or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) = lower(v_customer_full_name)
          )
          and (
            (v_requested_role <> '' and lower(trim(coalesce(booking_request.required_role, ''))) = v_requested_role)
            or (v_requested_role = '' and lower(trim(coalesce(booking_request.requested_service_name, ''))) = lower(v_service_name))
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

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    required_role,
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
    nullif(v_requested_role, ''),
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
grant execute on function public.create_public_booking_request_lightweight_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text, text, text, text
) to anon, authenticated;
create or replace function public.create_owner_appointment_lightweight_v1(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_booking_request_id uuid;
  v_appointment_id uuid;
  v_normalized_customer_name text;
  v_normalized_customer_phone text;
  v_normalized_customer_email citext;
  v_normalized_customer_instagram text;
  v_normalized_customer_note text;
  v_normalized_customer_source text;
  v_normalized_service_name text;
  v_normalized_salon_code text;
  v_normalized_operator_id text;
  v_normalized_operator_name text;
  v_new_start_minutes integer;
  v_new_end_minutes integer;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_normalized_salon_code := nullif(lower(trim(coalesce(p_salon_code, ''))), '');

  if v_normalized_salon_code is not null then
    select w.id
    into v_workspace_id
    from public.workspaces as w
    join public.workspace_members as wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
      and w.slug = v_normalized_salon_code
      and w.subscription_status in ('demo', 'active')
    limit 1;
  else
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_normalized_customer_name := trim(coalesce(p_customer_name, ''));
  v_normalized_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_normalized_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_normalized_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_normalized_customer_note := trim(coalesce(p_customer_note, ''));
  v_normalized_customer_source :=
    case
      when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend'
      else 'salon'
    end;
  v_normalized_service_name := trim(coalesce(p_service_name, ''));
  v_normalized_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_normalized_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');

  if v_normalized_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_normalized_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid_duration';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  if p_create_customer_record then
    select c.id
    into v_customer_id
    from public.customers as c
    where c.workspace_id = v_workspace_id
      and (
        (v_normalized_customer_phone is not null and c.phone = v_normalized_customer_phone)
        or (v_normalized_customer_email is not null and c.email = v_normalized_customer_email)
        or lower(trim(c.full_name)) = lower(v_normalized_customer_name)
      )
    order by c.updated_at desc, c.created_at desc
    limit 1;

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
        v_workspace_id,
        v_normalized_customer_name,
        v_normalized_customer_phone,
        v_normalized_customer_email,
        v_normalized_customer_instagram,
        nullif(v_normalized_customer_note, ''),
        v_normalized_customer_source,
        false
      )
      returning id into v_customer_id;
    else
      update public.customers
      set
        full_name = v_normalized_customer_name,
        phone = coalesce(v_normalized_customer_phone, phone),
        email = coalesce(v_normalized_customer_email, email),
        instagram = coalesce(v_normalized_customer_instagram, instagram),
        note = coalesce(nullif(v_normalized_customer_note, ''), note),
        source = v_normalized_customer_source,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
    end if;
  end if;

  v_new_start_minutes :=
    extract(hour from p_appointment_time)::integer * 60 +
    extract(minute from p_appointment_time)::integer;
  v_new_end_minutes := v_new_start_minutes + p_duration_minutes;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_normalized_customer_name)
      )
      and v_new_start_minutes <
        (
          extract(hour from appointment.appointment_time)::integer * 60 +
          extract(minute from appointment.appointment_time)::integer +
          coalesce(appointment.duration_minutes, 60)
        )
      and v_new_end_minutes >
        (
          extract(hour from appointment.appointment_time)::integer * 60 +
          extract(minute from appointment.appointment_time)::integer
        )
  ) then
    raise exception 'customer_time_overlap';
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);

  if p_create_booking_request then
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
      cancellation_source,
      viewed_by_customer
    )
    values (
      v_workspace_id,
      v_customer_id,
      v_normalized_service_name,
      p_price,
      p_duration_minutes,
      p_appointment_date,
      p_appointment_time,
      split_part(v_normalized_customer_name, ' ', 1),
      case
        when position(' ' in v_normalized_customer_name) > 0 then
          trim(substring(v_normalized_customer_name from position(' ' in v_normalized_customer_name) + 1))
        else ''
      end,
      coalesce(v_normalized_customer_email, ''::citext),
      coalesce(v_normalized_customer_phone, ''),
      v_normalized_customer_instagram,
      nullif(v_normalized_customer_note, ''),
      v_normalized_operator_id,
      v_normalized_operator_name,
      'backoffice',
      'accepted',
      null,
      false
    )
    returning id into v_booking_request_id;
  end if;

  insert into public.appointments (
    workspace_id,
    customer_id,
    booking_request_id,
    appointment_date,
    appointment_time,
    customer_name,
    service_name,
    price,
    duration_minutes,
    operator_id,
    operator_name,
    completed,
    no_show,
    cashed_in,
    created_by
  )
  values (
    v_workspace_id,
    v_customer_id,
    v_booking_request_id,
    p_appointment_date,
    p_appointment_time,
    v_normalized_customer_name,
    v_normalized_service_name,
    p_price,
    p_duration_minutes,
    v_normalized_operator_id,
    v_normalized_operator_name,
    false,
    false,
    false,
    'backoffice'
  )
  returning id into v_appointment_id;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'bookingRequestId', v_booking_request_id,
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;
grant execute on function public.create_owner_appointment_lightweight_v1(
  text, text, citext, text, text, text, boolean, boolean, text, numeric, integer, date, time, text, text, text
) to authenticated;
