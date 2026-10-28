create or replace function public.cancel_owner_appointment(
  p_appointment_id uuid default null,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_service_name text default null,
  p_owner_email citext default null,
  p_salon_code text default null,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_cancellation_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_customer_email citext := '';
  v_customer_phone text := '';
  v_customer_instagram text := null;
  v_customer_name_first text;
  v_customer_name_last text;
  v_new_request_id uuid;
  v_existing_request_id uuid;
  v_effective_customer_name text := trim(coalesce(p_customer_name, ''));
  v_effective_service_name text := trim(coalesce(p_service_name, ''));
begin
  if auth.uid() is not null and public.workspace_access_allowed() then
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null then
    select workspace.id
    into v_workspace_id
    from public.workspaces as workspace
    where lower(trim(workspace.owner_email::text)) = lower(trim(coalesce(p_owner_email::text, '')))
      and workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and (
      (p_appointment_id is not null and appointment.id = p_appointment_id)
      or (
        p_appointment_date is not null
        and p_appointment_time is not null
        and appointment.appointment_date = p_appointment_date
        and appointment.appointment_time = p_appointment_time
        and lower(trim(appointment.customer_name)) = lower(v_effective_customer_name)
        and lower(trim(appointment.service_name)) = lower(v_effective_service_name)
      )
    )
  order by
    case when p_appointment_id is not null and appointment.id = p_appointment_id then 0 else 1 end,
    appointment.created_at desc
  limit 1;

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := coalesce(nullif(trim(coalesce(p_customer_phone, '')), ''), '');

  if v_appointment.id is null then
    if p_appointment_date is null or p_appointment_time is null or v_effective_service_name = '' then
      raise exception 'appointment_not_found';
    end if;

    v_customer_name_first := split_part(v_effective_customer_name, ' ', 1);
    if position(' ' in v_effective_customer_name) > 0 then
      v_customer_name_last := trim(
        substring(v_effective_customer_name from position(' ' in v_effective_customer_name) + 1)
      );
    else
      v_customer_name_last := '';
    end if;

    select request.id
    into v_existing_request_id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_date = p_appointment_date
      and request.appointment_time = p_appointment_time
      and lower(trim(request.requested_service_name)) = lower(v_effective_service_name)
      and (
        lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
          lower(v_effective_customer_name)
        or (
          nullif(v_customer_email::text, '') is not null
          and lower(trim(request.customer_email::text)) = lower(trim(v_customer_email::text))
        )
        or (
          nullif(regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g'), '') is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
              regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g')
        )
      )
    order by
      case
        when request.status = 'cancelled'::public.request_status
          and coalesce(request.cancellation_source, '') = 'salone' then 0
        when request.status = 'accepted'::public.request_status then 1
        when request.status = 'pending'::public.request_status then 2
        else 3
      end,
      request.updated_at desc nulls last,
      request.created_at desc nulls last
    limit 1;

    if v_existing_request_id is not null then
      update public.booking_requests as request
      set status = 'cancelled',
          cancellation_source = 'salone',
          customer_email = coalesce(
            nullif(request.customer_email::text, '')::citext,
            nullif(v_customer_email::text, '')::citext,
            ''
          ),
          customer_phone = coalesce(nullif(request.customer_phone, ''), nullif(v_customer_phone, ''), ''),
          viewed_by_customer = false,
          updated_at = timezone('utc', now())
      where request.id = v_existing_request_id
        and request.workspace_id = v_workspace_id
      returning
        request.id,
        coalesce(nullif(request.customer_email::text, ''), v_customer_email::text, ''),
        coalesce(nullif(request.customer_phone, ''), v_customer_phone, '')
      into v_new_request_id, v_customer_email, v_customer_phone;
    else
      insert into public.booking_requests (
        workspace_id,
        requested_service_name,
        requested_price,
        requested_duration_minutes,
        appointment_date,
        appointment_time,
        customer_name,
        customer_surname,
        customer_email,
        customer_phone,
        origin,
        status,
        cancellation_source,
        viewed_by_salon,
        viewed_by_customer
      ) values (
        v_workspace_id,
        v_effective_service_name,
        0,
        60,
        p_appointment_date,
        p_appointment_time,
        coalesce(nullif(v_customer_name_first, ''), v_effective_customer_name, 'Cliente'),
        coalesce(v_customer_name_last, ''),
        coalesce(v_customer_email, ''),
        coalesce(v_customer_phone, ''),
        'backoffice',
        'cancelled',
        'salone',
        true,
        false
      )
      returning id into v_new_request_id;
    end if;

    return jsonb_build_object(
      'appointmentId', p_appointment_id,
      'bookingRequestId', v_new_request_id,
      'customerEmail', coalesce(v_customer_email::text, ''),
      'customerPhone', coalesce(v_customer_phone, ''),
      'workspaceId', v_workspace_id,
      'cancellationEventId', coalesce(p_cancellation_event_id, '')
    );
  end if;

  if v_appointment.customer_id is not null then
    select
      coalesce(customer.email, ''),
      coalesce(customer.phone, ''),
      customer.instagram
    into v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.id = v_appointment.customer_id
      and customer.workspace_id = v_workspace_id;
  end if;

  v_customer_email := coalesce(
    nullif(v_customer_email::text, '')::citext,
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext,
    ''
  );
  v_customer_phone := coalesce(
    nullif(v_customer_phone, ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    ''
  );

  v_customer_name_first := split_part(trim(v_appointment.customer_name), ' ', 1);
  if position(' ' in trim(v_appointment.customer_name)) > 0 then
    v_customer_name_last := trim(
      substring(trim(v_appointment.customer_name)
        from position(' ' in trim(v_appointment.customer_name)) + 1)
    );
  else
    v_customer_name_last := '';
  end if;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        customer_email = coalesce(
          nullif(request.customer_email::text, '')::citext,
          nullif(v_customer_email::text, '')::citext,
          request.customer_email
        ),
        customer_phone = coalesce(nullif(request.customer_phone, ''), nullif(v_customer_phone, ''), request.customer_phone),
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.id = v_appointment.booking_request_id
      and request.workspace_id = v_workspace_id
    returning
      coalesce(nullif(request.customer_email::text, ''), v_customer_email::text),
      coalesce(nullif(request.customer_phone, ''), v_customer_phone)
    into v_customer_email, v_customer_phone;
  else
    select request.id
    into v_existing_request_id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_date = v_appointment.appointment_date
      and request.appointment_time = v_appointment.appointment_time
      and lower(trim(request.requested_service_name)) = lower(trim(v_appointment.service_name))
      and (
        (
          v_appointment.customer_id is not null
          and request.customer_id = v_appointment.customer_id
        )
        or (
          lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
          lower(trim(v_appointment.customer_name))
        )
        or (
          nullif(v_customer_email::text, '') is not null
          and lower(trim(request.customer_email::text)) = lower(trim(v_customer_email::text))
        )
        or (
          nullif(regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g'), '') is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
              regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g')
        )
      )
    order by
      case
        when request.status = 'accepted'::public.request_status then 0
        when request.status = 'pending'::public.request_status then 1
        when request.status = 'cancelled'::public.request_status
          and coalesce(request.cancellation_source, '') = 'salone' then 2
        else 3
      end,
      request.updated_at desc nulls last,
      request.created_at desc nulls last
    limit 1;

    if v_existing_request_id is not null then
      update public.booking_requests as request
      set status = 'cancelled',
          cancellation_source = 'salone',
          customer_email = coalesce(
            nullif(request.customer_email::text, '')::citext,
            nullif(v_customer_email::text, '')::citext,
            request.customer_email
          ),
          customer_phone = coalesce(nullif(request.customer_phone, ''), nullif(v_customer_phone, ''), request.customer_phone),
          viewed_by_customer = false,
          updated_at = timezone('utc', now())
      where request.id = v_existing_request_id
        and request.workspace_id = v_workspace_id
      returning
        request.id,
        coalesce(nullif(request.customer_email::text, ''), v_customer_email::text),
        coalesce(nullif(request.customer_phone, ''), v_customer_phone)
      into v_new_request_id, v_customer_email, v_customer_phone;
    else
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
        origin,
        status,
        cancellation_source,
        viewed_by_salon,
        viewed_by_customer
      ) values (
        v_workspace_id,
        v_appointment.customer_id,
        v_appointment.service_name,
        v_appointment.price,
        v_appointment.duration_minutes,
        v_appointment.appointment_date,
        v_appointment.appointment_time,
        v_customer_name_first,
        v_customer_name_last,
        coalesce(v_customer_email, ''),
        coalesce(v_customer_phone, ''),
        v_customer_instagram,
        'backoffice',
        'cancelled',
        'salone',
        true,
        false
      )
      returning id into v_new_request_id;
    end if;
  end if;

  delete from public.appointments as appointment
  where appointment.id = v_appointment.id
    and appointment.workspace_id = v_workspace_id;

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', coalesce(v_appointment.booking_request_id, v_new_request_id),
    'customerId', v_appointment.customer_id,
    'customerEmail', coalesce(v_customer_email::text, ''),
    'customerPhone', coalesce(v_customer_phone, ''),
    'workspaceId', v_workspace_id,
    'cancellationEventId', coalesce(p_cancellation_event_id, '')
  );
end;
$$;

grant execute on function public.cancel_owner_appointment(uuid, date, time, text, text, citext, text, citext, text, text) to anon;
grant execute on function public.cancel_owner_appointment(uuid, date, time, text, text, citext, text, citext, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
