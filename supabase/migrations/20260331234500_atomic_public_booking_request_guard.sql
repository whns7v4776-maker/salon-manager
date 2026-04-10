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
  p_notes text default null
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
  v_request_start timestamp;
  v_request_end timestamp;
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

  v_request_start := p_appointment_date::timestamp + p_appointment_time;
  v_request_end := v_request_start + make_interval(mins => v_requested_duration);

  -- Serialize public bookings per salon/day to prevent double-booking races
  -- when two frontend clients try to reserve overlapping slots at the same time.
  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace.id
      and appointment.appointment_date = p_appointment_date
      and (p_appointment_date::timestamp + appointment.appointment_time) < v_request_end
      and (
        (p_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => coalesce(appointment.duration_minutes, 60))
      ) > v_request_start
  ) then
    raise exception 'slot_unavailable';
  end if;

  if exists (
    select 1
    from public.booking_requests as booking_request
    where booking_request.workspace_id = v_workspace.id
      and booking_request.appointment_date = p_appointment_date
      and booking_request.status in ('pending', 'accepted')
      and (p_appointment_date::timestamp + booking_request.appointment_time) < v_request_end
      and (
        (p_appointment_date::timestamp + booking_request.appointment_time)
        + make_interval(mins => coalesce(booking_request.requested_duration_minutes, 60))
      ) > v_request_start
  ) then
    raise exception 'slot_unavailable';
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      or regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_customer_phone
      or lower(trim(coalesce(customer.full_name, ''))) = lower(trim(concat_ws(' ', v_customer_name, v_customer_surname)))
    )
  order by customer.updated_at desc, customer.created_at desc
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
      v_workspace.id,
      trim(concat_ws(' ', v_customer_name, v_customer_surname)),
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
      full_name = trim(concat_ws(' ', v_customer_name, v_customer_surname)),
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
    'frontend',
    'pending',
    false
  )
  returning * into v_booking_request;

  return v_booking_request;
end;
$$;

grant execute on function public.create_public_booking_request(
  text,
  text,
  numeric,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to anon;

grant execute on function public.create_public_booking_request(
  text,
  text,
  numeric,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to authenticated;
