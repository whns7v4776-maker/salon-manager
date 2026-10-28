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
  v_existing_active_request public.booking_requests%rowtype;
  v_existing_terminal_request public.booking_requests%rowtype;
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
  v_owner_payload jsonb := '{}'::jsonb;
  v_portal_services jsonb := '[]'::jsonb;
  v_max_future_appointments integer;
  v_max_future_appointments_mode text := 'total_future';
  v_max_daily_appointments integer;
  v_existing_future_bookings integer := 0;
  v_existing_daily_bookings integer := 0;
  v_first_daily_conflicting_service text;
  v_exact_daily_service_conflict boolean := false;
  v_has_unlimited_future_limit boolean := false;
  v_has_unlimited_daily_limit boolean := false;
  v_active_request_created_at timestamptz;
  v_terminal_request_created_at timestamptz;
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
  v_requested_role := public.resolve_public_booking_limit_role(
    '[]'::jsonb,
    v_service_name,
    p_required_role
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

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  select
    customer.max_future_appointments,
    coalesce(customer.max_future_appointments_mode, 'total_future'),
    customer.max_daily_appointments
  into
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
  order by
    case
      when v_customer_email is not null and customer.email = v_customer_email
       and v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone
        then 1000
      when v_customer_email is not null and customer.email = v_customer_email
        then 700
      when v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone
        then 650
      else 0
    end desc,
    case
      when lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
        then 120
      else 0
    end desc,
    case
      when coalesce(customer.source, 'salon') = 'salon'
        then 40
      else 0
    end desc,
    case
      when customer.max_future_appointments is not null or customer.max_daily_appointments is not null
        then 20
      else 0
    end desc,
    coalesce(customer.updated_at, customer.created_at) desc,
    customer.created_at desc
  limit 1;

  v_has_unlimited_future_limit := v_max_future_appointments is null;
  v_has_unlimited_daily_limit := v_max_daily_appointments is null;

  if v_requested_role = '' or v_max_daily_appointments is not null then
    v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
    v_portal_services := coalesce(v_owner_payload -> 'servizi', '[]'::jsonb);
    v_requested_role := public.resolve_public_booking_limit_role(
      v_portal_services,
      v_service_name,
      p_required_role
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  select booking_request.*
  into v_existing_active_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace.id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) =
      lower(trim(v_service_name))
    and booking_request.status in ('pending', 'accepted')
    and (
      (v_customer_id is not null and booking_request.customer_id = v_customer_id)
      or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
      or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
         lower(v_customer_full_name)
    )
  order by coalesce(booking_request.created_at, '-infinity'::timestamptz) desc, booking_request.id desc
  limit 1;

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
      (v_customer_id is not null and booking_request.customer_id = v_customer_id)
      or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
      or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
         lower(v_customer_full_name)
    )
  order by coalesce(booking_request.created_at, '-infinity'::timestamptz) desc, booking_request.id desc
  limit 1;

  v_active_request_created_at := coalesce(v_existing_active_request.created_at, '-infinity'::timestamptz);
  v_terminal_request_created_at := coalesce(v_existing_terminal_request.created_at, '-infinity'::timestamptz);

  if v_existing_terminal_request.id is not null
     and v_terminal_request_created_at > v_active_request_created_at then
    update public.booking_requests
    set customer_id = v_customer_id,
        requested_price = v_requested_price,
        requested_duration_minutes = v_requested_duration,
        required_role = nullif(v_requested_role, ''),
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

    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_booking_request;
  end if;

  if v_existing_active_request.id is not null then
    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_existing_active_request;
  end if;

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

  if v_existing_terminal_request.id is not null then
    update public.booking_requests
    set customer_id = v_customer_id,
        requested_price = v_requested_price,
        requested_duration_minutes = v_requested_duration,
        required_role = nullif(v_requested_role, ''),
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

    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_booking_request;
  end if;

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
          and not exists (
            select 1
            from public.booking_requests as terminal_request
            where terminal_request.workspace_id = v_workspace.id
              and terminal_request.status in ('cancelled', 'rejected')
              and terminal_request.appointment_date = appointment.appointment_date
              and terminal_request.appointment_time = appointment.appointment_time
              and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                lower(trim(coalesce(appointment.service_name, '')))
              and (
                (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
                or (v_customer_phone is not null and coalesce(terminal_request.customer_phone, '') = v_customer_phone)
                or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
                or lower(trim(concat_ws(' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '')))) =
                   lower(v_customer_full_name)
              )
              and not exists (
                select 1
                from public.booking_requests as newer_active_request
                where newer_active_request.workspace_id = terminal_request.workspace_id
                  and newer_active_request.status in ('pending', 'accepted')
                  and newer_active_request.appointment_date = terminal_request.appointment_date
                  and newer_active_request.appointment_time = terminal_request.appointment_time
                  and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                    lower(trim(coalesce(terminal_request.requested_service_name, '')))
                  and (
                    (v_customer_id is not null and newer_active_request.customer_id = v_customer_id)
                    or (v_customer_phone is not null and coalesce(newer_active_request.customer_phone, '') = v_customer_phone)
                    or (v_customer_email is not null and newer_active_request.customer_email = v_customer_email)
                    or lower(trim(concat_ws(' ', coalesce(newer_active_request.customer_name, ''), coalesce(newer_active_request.customer_surname, '')))) =
                       lower(v_customer_full_name)
                  )
                  and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                    coalesce(terminal_request.updated_at, terminal_request.created_at)
              )
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
          and not exists (
            select 1
            from public.appointments as matched_appointment
            where matched_appointment.workspace_id = booking_request.workspace_id
              and matched_appointment.appointment_date = booking_request.appointment_date
              and matched_appointment.appointment_time = booking_request.appointment_time
              and lower(trim(coalesce(matched_appointment.service_name, ''))) =
                lower(trim(coalesce(booking_request.requested_service_name, '')))
              and (
                (v_customer_id is not null and matched_appointment.customer_id = v_customer_id)
                or lower(trim(coalesce(matched_appointment.customer_name, ''))) = lower(v_customer_full_name)
              )
          )
          and not exists (
            select 1
            from public.booking_requests as terminal_request
            where terminal_request.workspace_id = booking_request.workspace_id
              and terminal_request.status in ('cancelled', 'rejected')
              and terminal_request.appointment_date = booking_request.appointment_date
              and terminal_request.appointment_time = booking_request.appointment_time
              and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                lower(trim(coalesce(booking_request.requested_service_name, '')))
              and (
                (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
                or (v_customer_phone is not null and coalesce(terminal_request.customer_phone, '') = v_customer_phone)
                or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
                or lower(trim(concat_ws(' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '')))) =
                   lower(v_customer_full_name)
              )
              and coalesce(terminal_request.updated_at, terminal_request.created_at) >=
                coalesce(booking_request.updated_at, booking_request.created_at)
          )
      ), 0)
    into v_existing_future_bookings;

    if v_existing_future_bookings >= v_max_future_appointments then
      raise exception 'max_future_appointments_reached';
    end if;
  end if;

  if v_max_daily_appointments is not null and v_max_daily_appointments >= 0 then
    with matching_daily_bookings as (
      select trim(coalesce(appointment.service_name, '')) as service_name
      from public.appointments as appointment
      where appointment.workspace_id = v_workspace.id
        and appointment.appointment_date = p_appointment_date
        and (
          (v_customer_id is not null and appointment.customer_id = v_customer_id)
          or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
        )
        and public.do_public_booking_limit_scopes_overlap(
          v_service_name,
          v_requested_role,
          appointment.service_name,
          null,
          v_portal_services
        )
        and not exists (
          select 1
          from public.booking_requests as terminal_request
          where terminal_request.workspace_id = v_workspace.id
            and terminal_request.status in ('cancelled', 'rejected')
            and terminal_request.appointment_date = appointment.appointment_date
            and terminal_request.appointment_time = appointment.appointment_time
            and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
              lower(trim(coalesce(appointment.service_name, '')))
            and (
              (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
              or (v_customer_phone is not null and coalesce(terminal_request.customer_phone, '') = v_customer_phone)
              or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
              or lower(trim(concat_ws(' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '')))) =
                 lower(v_customer_full_name)
            )
            and not exists (
              select 1
              from public.booking_requests as newer_active_request
              where newer_active_request.workspace_id = terminal_request.workspace_id
                and newer_active_request.status in ('pending', 'accepted')
                and newer_active_request.appointment_date = terminal_request.appointment_date
                and newer_active_request.appointment_time = terminal_request.appointment_time
                and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                  lower(trim(coalesce(terminal_request.requested_service_name, '')))
                and (
                  (v_customer_id is not null and newer_active_request.customer_id = v_customer_id)
                  or (v_customer_phone is not null and coalesce(newer_active_request.customer_phone, '') = v_customer_phone)
                  or (v_customer_email is not null and newer_active_request.customer_email = v_customer_email)
                  or lower(trim(concat_ws(' ', coalesce(newer_active_request.customer_name, ''), coalesce(newer_active_request.customer_surname, '')))) =
                     lower(v_customer_full_name)
                )
                and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                  coalesce(terminal_request.updated_at, terminal_request.created_at)
            )
        )

      union all

      select trim(coalesce(booking_request.requested_service_name, '')) as service_name
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
        and not exists (
          select 1
          from public.appointments as matched_appointment
          where matched_appointment.workspace_id = booking_request.workspace_id
            and matched_appointment.appointment_date = booking_request.appointment_date
            and matched_appointment.appointment_time = booking_request.appointment_time
            and lower(trim(coalesce(matched_appointment.service_name, ''))) =
              lower(trim(coalesce(booking_request.requested_service_name, '')))
            and (
              (v_customer_id is not null and matched_appointment.customer_id = v_customer_id)
              or lower(trim(coalesce(matched_appointment.customer_name, ''))) = lower(v_customer_full_name)
            )
        )
        and public.do_public_booking_limit_scopes_overlap(
          v_service_name,
          v_requested_role,
          booking_request.requested_service_name,
          booking_request.required_role,
          v_portal_services
        )
        and not exists (
          select 1
          from public.booking_requests as terminal_request
          where terminal_request.workspace_id = booking_request.workspace_id
            and terminal_request.status in ('cancelled', 'rejected')
            and terminal_request.appointment_date = booking_request.appointment_date
            and terminal_request.appointment_time = booking_request.appointment_time
            and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
              lower(trim(coalesce(booking_request.requested_service_name, '')))
            and (
              (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
              or (v_customer_phone is not null and coalesce(terminal_request.customer_phone, '') = v_customer_phone)
              or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
              or lower(trim(concat_ws(' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '')))) =
                 lower(v_customer_full_name)
            )
            and coalesce(terminal_request.updated_at, terminal_request.created_at) >=
              coalesce(booking_request.updated_at, booking_request.created_at)
        )
    )
    select
      count(*),
      min(nullif(service_name, '')),
      bool_or(lower(service_name) = lower(v_service_name))
    into
      v_existing_daily_bookings,
      v_first_daily_conflicting_service,
      v_exact_daily_service_conflict
    from matching_daily_bookings;

    if v_existing_daily_bookings >= v_max_daily_appointments then
      raise exception 'max_daily_appointments_reached'
        using detail = format(
          'daily_limit_scope_conflict|limit=%s|requested=%s|existing=%s|exact_service=%s',
          v_max_daily_appointments,
          lower(v_service_name),
          lower(coalesce(v_first_daily_conflicting_service, '')),
          case when v_exact_daily_service_conflict then 'true' else 'false' end
        );
    end if;
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

  perform public.sync_client_portal_appointments(v_workspace.id);
  perform public.sync_client_portal_booking_requests(v_workspace.id);

  return v_booking_request;
end;
$$;

notify pgrst, 'reload schema';
