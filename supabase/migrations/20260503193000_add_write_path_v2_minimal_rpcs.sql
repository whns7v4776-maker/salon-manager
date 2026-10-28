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

grant execute on function public.create_public_booking_request_ultralight_v2(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text, text, text, text
) to anon, authenticated;

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
  p_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
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
  v_normalized_customer_source := case when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend' else 'salon' end;
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

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);
  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

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
    ) values (
      v_workspace_id,
      null,
      v_normalized_service_name,
      p_price,
      p_duration_minutes,
      p_appointment_date,
      p_appointment_time,
      split_part(v_normalized_customer_name, ' ', 1),
      case when position(' ' in v_normalized_customer_name) > 0 then trim(substring(v_normalized_customer_name from position(' ' in v_normalized_customer_name) + 1)) else '' end,
      coalesce(v_normalized_customer_email, ''::citext),
      coalesce(v_normalized_customer_phone, ''),
      v_normalized_customer_instagram,
      nullif(v_normalized_customer_note, ''),
      v_normalized_operator_id,
      v_normalized_operator_name,
      case when v_normalized_customer_source = 'frontend' then 'frontend' else 'backoffice' end,
      'accepted',
      null,
      false
    ) returning id into v_booking_request_id;
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
  ) values (
    v_workspace_id,
    null,
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
  ) returning id into v_appointment_id;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'bookingRequestId', v_booking_request_id,
    'customerId', null,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.create_owner_appointment_ultralight_v2(
  text, text, citext, text, text, text, boolean, boolean, text, numeric, integer, date, time, text, text, text
) to authenticated;

create or replace function public.finalize_owner_booking_request_accept_lightweight_v2(
  p_request_id uuid,
  p_appointment_id uuid default null,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_request_customer_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = v_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);

  v_request_customer_name := trim(
    concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, ''))
  );
  v_customer_id := coalesce(p_customer_id, v_request.customer_id);
  v_appointment_id := p_appointment_id;

  if v_appointment_id is null then
    select appointment.id, appointment.customer_id
    into v_appointment_id, v_customer_id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and (
        appointment.booking_request_id = v_request.id
        or (
          appointment.appointment_date = v_request.appointment_date
          and appointment.appointment_time = v_request.appointment_time
          and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
          and lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_request_customer_name)
        )
      )
    order by appointment.updated_at desc, appointment.created_at desc
    limit 1;
  elsif v_customer_id is null then
    select appointment.customer_id
    into v_customer_id
    from public.appointments as appointment
    where appointment.id = v_appointment_id
      and appointment.workspace_id = v_workspace_id
    limit 1;
  end if;

  update public.booking_requests
  set
    customer_id = coalesce(v_customer_id, customer_id),
    status = 'accepted',
    cancellation_source = null,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = v_request.id
    and workspace_id = v_workspace_id;

  if v_appointment_id is not null then
    update public.appointments
    set
      booking_request_id = v_request.id,
      customer_id = coalesce(v_customer_id, customer_id),
      updated_at = timezone('utc', now())
    where id = v_appointment_id
      and workspace_id = v_workspace_id;
  end if;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.finalize_owner_booking_request_accept_lightweight_v2(uuid, uuid, uuid)
to authenticated;
