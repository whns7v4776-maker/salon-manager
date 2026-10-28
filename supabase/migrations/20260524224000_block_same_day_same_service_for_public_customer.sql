create or replace function public.create_public_booking_request_ultralight_v2(
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
  v_request public.booking_requests%rowtype;
  v_existing_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_customer_full_name text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_name text;
  v_customer_surname text;
  v_service_name text;
  v_operator_id text;
  v_operator_name text;
  v_required_role text;
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
  v_service_name := trim(coalesce(p_requested_service_name, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');
  v_required_role := nullif(trim(coalesce(p_required_role, '')), '');
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

  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      customer.email = v_customer_email
      or coalesce(customer.phone, '') = v_customer_phone
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace.id
      and appointment.appointment_date = p_appointment_date
      and lower(trim(coalesce(appointment.service_name, ''))) = lower(v_service_name)
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
      )
  ) then
    raise exception 'same_day_same_service_conflict';
  end if;

  if exists (
    select 1
    from public.booking_requests as booking_request
    where booking_request.workspace_id = v_workspace.id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and lower(trim(coalesce(booking_request.requested_service_name, ''))) = lower(v_service_name)
      and (
        (v_customer_id is not null and booking_request.customer_id = v_customer_id)
        or booking_request.customer_email = v_customer_email
        or coalesce(booking_request.customer_phone, '') = v_customer_phone
        or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
           lower(v_customer_full_name)
      )
  ) then
    raise exception 'same_day_same_service_conflict';
  end if;

  select booking_request.*
  into v_existing_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace.id
    and booking_request.status in ('pending', 'accepted')
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) = lower(v_service_name)
    and (
      (v_customer_id is not null and booking_request.customer_id = v_customer_id)
      or booking_request.customer_email = v_customer_email
      or coalesce(booking_request.customer_phone, '') = v_customer_phone
      or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
         lower(v_customer_full_name)
    )
  order by booking_request.updated_at desc, booking_request.created_at desc
  limit 1;

  if v_existing_request.id is not null then
    return v_existing_request;
  end if;

  if not public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_service_name,
    v_operator_id,
    v_operator_name
  ) then
    raise exception 'slot_unavailable';
  end if;

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
    cancellation_source,
    viewed_by_customer
  ) values (
    v_workspace.id,
    v_customer_id,
    v_service_name,
    greatest(coalesce(p_requested_price, 0), 0),
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_required_role,
    p_appointment_date,
    p_appointment_time,
    v_customer_name,
    v_customer_surname,
    v_customer_email,
    v_customer_phone,
    nullif(trim(coalesce(p_customer_instagram, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_operator_id,
    v_operator_name,
    'frontend',
    'pending',
    null,
    false
  )
  returning * into v_request;

  perform public.refresh_workspace_agenda_state(v_workspace.id);

  return v_request;
end;
$$;

notify pgrst, 'reload schema';
