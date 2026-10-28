do $$
declare
  v_workspace_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@icloud.com'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    raise notice 'workspace_not_found:marziomus@icloud.com';
    return;
  end if;

  delete from public.push_notifications
  where workspace_id = v_workspace_id
    and event_type in (
      'booking_request_created',
      'booking_request_status_changed',
      'appointment_cancelled'
    );

  delete from public.cash_movements
  where workspace_id = v_workspace_id
     or appointment_id in (
       select appointment.id
       from public.appointments as appointment
       where appointment.workspace_id = v_workspace_id
     );

  delete from public.appointments
  where workspace_id = v_workspace_id;

  delete from public.booking_requests
  where workspace_id = v_workspace_id;

  delete from public.booking_slot_waitlist
  where workspace_id = v_workspace_id;

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
end
$$;

create or replace function public.refresh_workspace_agenda_state(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workspace_id is null then
    return;
  end if;

  begin
    perform public.sync_client_portal_appointments(p_workspace_id);
  exception
    when others then
      null;
  end;

  begin
    perform public.sync_client_portal_booking_requests(p_workspace_id);
  exception
    when others then
      null;
  end;
end;
$$;

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
  v_requested_start_at timestamp;
  v_requested_end_at timestamp;
  v_requested_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
begin
  if p_workspace_id is null or p_appointment_date is null or p_appointment_time is null then
    return false;
  end if;

  v_requested_start_at := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at :=
    p_appointment_date::timestamp + p_appointment_time
    + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1));

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (p_appointment_date::timestamp + appointment.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_requested_start_at
      and (
        (v_requested_operator_id is null and v_requested_operator_name is null)
        or nullif(trim(coalesce(appointment.operator_id, '')), '') = v_requested_operator_id
        or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = v_requested_operator_name
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.booking_requests as booking_request
    where booking_request.workspace_id = p_workspace_id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and (p_appointment_date::timestamp + booking_request.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + booking_request.appointment_time)
        + make_interval(mins => greatest(coalesce(booking_request.requested_duration_minutes, 60), 1))
      ) > v_requested_start_at
      and (
        (v_requested_operator_id is null and v_requested_operator_name is null)
        or nullif(trim(coalesce(booking_request.requested_operator_id, '')), '') = v_requested_operator_id
        or nullif(lower(trim(coalesce(booking_request.requested_operator_name, ''))), '') = v_requested_operator_name
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

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

create or replace function public.create_owner_appointment_ultralight_v2(
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
  p_operator_name text default null,
  p_required_role text default null
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
  v_customer_name text;
  v_customer_phone text;
  v_customer_email citext;
  v_customer_full_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if nullif(lower(trim(coalesce(p_salon_code, ''))), '') is not null then
    select w.id
    into v_workspace_id
    from public.workspaces as w
    join public.workspace_members as wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
      and w.slug = lower(trim(coalesce(p_salon_code, '')))
      and w.subscription_status in ('demo', 'active')
    limit 1;
  else
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_full_name := v_customer_name;

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;
  if trim(coalesce(p_service_name, '')) = '' then
    raise exception 'service_name_required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_duration_minutes, 60), 1),
    trim(coalesce(p_service_name, '')),
    nullif(trim(coalesce(p_operator_id, '')), ''),
    nullif(trim(coalesce(p_operator_name, '')), '')
  ) then
    raise exception 'target_slot_occupied';
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_customer_id is null and p_create_customer_record then
    insert into public.customers (
      workspace_id,
      full_name,
      phone,
      email,
      instagram,
      note,
      source,
      viewed_by_salon
    ) values (
      v_workspace_id,
      v_customer_full_name,
      v_customer_phone,
      v_customer_email,
      nullif(trim(coalesce(p_customer_instagram, '')), ''),
      coalesce(p_customer_note, ''),
      case when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend' else 'salon' end,
      true
    )
    returning id into v_customer_id;
  end if;

  if p_create_booking_request then
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
      v_workspace_id,
      v_customer_id,
      trim(coalesce(p_service_name, '')),
      greatest(coalesce(p_price, 0), 0),
      greatest(coalesce(p_duration_minutes, 60), 1),
      nullif(trim(coalesce(p_required_role, '')), ''),
      p_appointment_date,
      p_appointment_time,
      split_part(v_customer_name, ' ', 1),
      case when position(' ' in v_customer_name) > 0 then trim(substring(v_customer_name from position(' ' in v_customer_name) + 1)) else '' end,
      coalesce(v_customer_email, ''::citext),
      coalesce(v_customer_phone, ''),
      nullif(trim(coalesce(p_customer_instagram, '')), ''),
      nullif(trim(coalesce(p_customer_note, '')), ''),
      nullif(trim(coalesce(p_operator_id, '')), ''),
      nullif(trim(coalesce(p_operator_name, '')), ''),
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
    required_role,
    operator_id,
    operator_name,
    completed,
    no_show,
    cashed_in,
    created_by
  ) values (
    v_workspace_id,
    v_customer_id,
    v_booking_request_id,
    p_appointment_date,
    p_appointment_time,
    v_customer_full_name,
    trim(coalesce(p_service_name, '')),
    greatest(coalesce(p_price, 0), 0),
    greatest(coalesce(p_duration_minutes, 60), 1),
    nullif(trim(coalesce(p_required_role, '')), ''),
    nullif(trim(coalesce(p_operator_id, '')), ''),
    nullif(trim(coalesce(p_operator_name, '')), ''),
    false,
    false,
    false,
    'backoffice'
  )
  returning id into v_appointment_id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'bookingRequestId', v_booking_request_id,
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

create or replace function public.update_owner_booking_request_status_core(
  p_workspace_id uuid,
  p_request_id uuid,
  p_status public.request_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_appointment_id uuid;
  v_customer_full_name text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = p_workspace_id
    and booking_request.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  v_customer_full_name := trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')));

  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text || ':' || v_request.appointment_date::text));

  if p_status = 'accepted' then
    if exists (
      select 1
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
        and appointment.booking_request_id is distinct from v_request.id
        and appointment.appointment_date = v_request.appointment_date
        and appointment.appointment_time = v_request.appointment_time
        and (
          (
            nullif(trim(coalesce(v_request.requested_operator_id, '')), '') is null
            and nullif(trim(coalesce(v_request.requested_operator_name, '')), '') is null
          )
          or nullif(trim(coalesce(appointment.operator_id, '')), '') = nullif(trim(coalesce(v_request.requested_operator_id, '')), '')
          or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = nullif(lower(trim(coalesce(v_request.requested_operator_name, ''))), '')
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    select appointment.id
    into v_appointment_id
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and (
        appointment.booking_request_id = v_request.id
        or (
          appointment.appointment_date = v_request.appointment_date
          and appointment.appointment_time = v_request.appointment_time
          and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
          and lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
        )
      )
    order by appointment.updated_at desc, appointment.created_at desc
    limit 1;

    if v_appointment_id is null then
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
        required_role,
        operator_id,
        operator_name,
        completed,
        no_show,
        cashed_in,
        created_by
      ) values (
        p_workspace_id,
        v_request.customer_id,
        v_request.id,
        v_request.appointment_date,
        v_request.appointment_time,
        v_customer_full_name,
        v_request.requested_service_name,
        coalesce(v_request.requested_price, 0),
        greatest(coalesce(v_request.requested_duration_minutes, 60), 1),
        nullif(trim(coalesce(v_request.required_role, '')), ''),
        nullif(trim(coalesce(v_request.requested_operator_id, '')), ''),
        nullif(trim(coalesce(v_request.requested_operator_name, '')), ''),
        false,
        false,
        false,
        case when v_request.origin = 'frontend' then 'frontend' else 'backoffice' end
      )
      returning id into v_appointment_id;
    else
      update public.appointments
      set booking_request_id = v_request.id,
          customer_id = coalesce(v_request.customer_id, customer_id),
          appointment_date = v_request.appointment_date,
          appointment_time = v_request.appointment_time,
          customer_name = v_customer_full_name,
          service_name = v_request.requested_service_name,
          price = coalesce(v_request.requested_price, price),
          duration_minutes = greatest(coalesce(v_request.requested_duration_minutes, duration_minutes), 1),
          required_role = coalesce(nullif(trim(coalesce(v_request.required_role, '')), ''), required_role),
          operator_id = coalesce(nullif(trim(coalesce(v_request.requested_operator_id, '')), ''), operator_id),
          operator_name = coalesce(nullif(trim(coalesce(v_request.requested_operator_name, '')), ''), operator_name),
          updated_at = timezone('utc', now())
      where id = v_appointment_id;
    end if;
  else
    delete from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.booking_request_id = v_request.id
    returning appointment.id into v_appointment_id;
  end if;

  update public.booking_requests
  set status = p_status,
      viewed_by_customer = false,
      cancellation_source = case when p_status = 'cancelled' then 'salone' else null end,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  perform public.refresh_workspace_agenda_state(p_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'customerId', v_request.customer_id,
    'workspaceId', p_workspace_id
  );
end;
$$;

create or replace function public.update_owner_booking_request_status_v2(
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

create or replace function public.update_owner_booking_request_status_by_email_v2(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

create or replace function public.accept_owner_booking_request_atomic_v2(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_customer_id uuid default null,
  p_appointment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_response jsonb;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  if p_appointment_id is not null then
    update public.appointments
    set booking_request_id = p_request_id,
        customer_id = coalesce(p_customer_id, customer_id),
        updated_at = timezone('utc', now())
    where id = p_appointment_id
      and workspace_id = v_workspace_id;
  end if;

  v_response := public.update_owner_booking_request_status_core(
    v_workspace_id,
    p_request_id,
    'accepted'::public.request_status
  );

  return jsonb_build_object(
    'appointmentId', coalesce((v_response ->> 'appointmentId')::uuid, p_appointment_id),
    'customerId', coalesce((v_response ->> 'customerId')::uuid, p_customer_id),
    'workspaceId', v_workspace_id
  );
end;
$$;

create or replace function public.cancel_public_booking_request(
  p_salon_code text,
  p_request_id uuid,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_customer_email citext;
  v_customer_phone text;
  v_deleted_appointment_id uuid;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_request_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(booking_request.customer_email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  for update;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  update public.booking_requests
  set status = 'cancelled'::public.request_status,
      cancellation_source = 'cliente',
      viewed_by_customer = true,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = v_request.id
  returning appointment.id into v_deleted_appointment_id;

  update public.customers
  set viewed_by_salon = false,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      (v_request.customer_id is not null and id = v_request.customer_id)
      or (v_customer_email is not null and lower(trim(coalesce(email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    );

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

create or replace function public.move_owner_appointment(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
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

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.id <> v_appointment.id
      and appointment.appointment_date = p_next_appointment_date
      and appointment.appointment_time = p_next_appointment_time
      and (
        nullif(trim(coalesce(v_appointment.operator_id, '')), '') is null
        or nullif(trim(coalesce(appointment.operator_id, '')), '') = nullif(trim(coalesce(v_appointment.operator_id, '')), '')
        or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = nullif(lower(trim(coalesce(v_appointment.operator_name, ''))), '')
      )
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      updated_at = timezone('utc', now())
  where id = v_appointment.id;

  update public.booking_requests
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      updated_at = timezone('utc', now())
  where id = v_appointment.booking_request_id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'previousDate', v_appointment.appointment_date,
    'previousTime', v_appointment.appointment_time,
    'nextDate', p_next_appointment_date,
    'nextTime', p_next_appointment_time
  );
end;
$$;

create or replace function public.swap_owner_appointments(
  p_source_appointment_id uuid,
  p_target_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_source public.appointments%rowtype;
  v_target public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_source
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_source_appointment_id
  for update;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_target_appointment_id
  for update;

  if v_source.id is null or v_target.id is null then
    raise exception 'appointment_not_found';
  end if;

  update public.appointments
  set appointment_date = v_target.appointment_date,
      appointment_time = v_target.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_source.id;

  update public.appointments
  set appointment_date = v_source.appointment_date,
      appointment_time = v_source.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_target.id;

  update public.booking_requests
  set appointment_date = v_target.appointment_date,
      appointment_time = v_target.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_source.booking_request_id;

  update public.booking_requests
  set appointment_date = v_source.appointment_date,
      appointment_time = v_source.appointment_time,
      updated_at = timezone('utc', now())
  where id = v_target.booking_request_id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'sourceAppointmentId', v_source.id,
    'targetAppointmentId', v_target.id,
    'sourceDate', v_source.appointment_date,
    'sourceTime', v_source.appointment_time,
    'targetDate', v_target.appointment_date,
    'targetTime', v_target.appointment_time
  );
end;
$$;
