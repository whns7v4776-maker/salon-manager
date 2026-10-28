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
  v_booking_request public.booking_requests%rowtype;
  v_existing_terminal_request public.booking_requests%rowtype;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_notes text;
  v_requested_duration integer;
  v_requested_price numeric(10,2);
  v_requested_role text;
  v_requested_operator_id text;
  v_requested_operator_name text;
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
  v_requested_role := nullif(
    lower(
      regexp_replace(
        regexp_replace(trim(coalesce(p_required_role, '')), '\s+', ' ', 'g'),
        '[^a-z0-9 ]',
        '',
        'g'
      )
    ),
    ''
  );
  v_requested_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');

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

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);
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

  select booking_request.*
  into v_existing_terminal_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace.id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) =
      lower(trim(v_service_name))
    and booking_request.status in ('cancelled', 'rejected')
    and (
      (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
    )
  order by booking_request.updated_at desc nulls last, booking_request.created_at desc nulls last
  limit 1;

  if v_existing_terminal_request.id is not null then
    update public.booking_requests
    set requested_price = v_requested_price,
        requested_duration_minutes = v_requested_duration,
        required_role = v_requested_role,
        appointment_date = p_appointment_date,
        appointment_time = p_appointment_time,
        customer_name = v_customer_name,
        customer_surname = v_customer_surname,
        customer_email = v_customer_email,
        customer_phone = v_customer_phone,
        customer_instagram = v_customer_instagram,
        notes = v_notes,
        requested_operator_id = v_requested_operator_id,
        requested_operator_name = v_requested_operator_name,
        origin = 'frontend',
        status = 'pending',
        viewed_by_customer = false,
        viewed_by_salon = false,
        cancellation_source = null
    where id = v_existing_terminal_request.id
    returning * into v_booking_request;

    return v_booking_request;
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
    viewed_by_customer
  ) values (
    v_workspace.id,
    null,
    v_service_name,
    v_requested_price,
    v_requested_duration,
    v_requested_role,
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
