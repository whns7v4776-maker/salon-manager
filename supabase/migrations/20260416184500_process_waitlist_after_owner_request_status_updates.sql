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
  v_customer_id uuid;
  v_existing_appointment_id uuid;
  v_result_appointment_id uuid;
  v_request_customer_name text;
  v_request_operator_id text;
  v_request_operator_name text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = p_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  v_request_customer_name := trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')));
  v_request_operator_id := nullif(trim(coalesce(v_request.requested_operator_id, '')), '');
  v_request_operator_name := nullif(lower(trim(coalesce(v_request.requested_operator_name, ''))), '');

  if p_status = 'accepted' then
    if v_request.status = 'accepted' then
      select appointment.id
      into v_existing_appointment_id
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
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

      return jsonb_build_object(
        'appointmentId', v_existing_appointment_id,
        'customerId', v_request.customer_id,
        'workspaceId', p_workspace_id
      );
    end if;

    perform pg_advisory_xact_lock(hashtext(p_workspace_id::text || ':' || v_request.appointment_date::text));

    if exists (
      select 1
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
        and appointment.appointment_date = v_request.appointment_date
        and tsrange(
          (v_request.appointment_date::timestamp + v_request.appointment_time),
          (v_request.appointment_date::timestamp + v_request.appointment_time + make_interval(mins => greatest(coalesce(v_request.requested_duration_minutes, 60), 1))),
          '[)'
        ) && tsrange(
          (appointment.appointment_date::timestamp + appointment.appointment_time),
          (appointment.appointment_date::timestamp + appointment.appointment_time + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))),
          '[)'
        )
        and appointment.booking_request_id is distinct from v_request.id
        and (
          (v_request_operator_id is null and v_request_operator_name is null)
          or (
            nullif(trim(coalesce(appointment.operator_id, '')), '') is null
            and nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') is null
          )
          or nullif(trim(coalesce(appointment.operator_id, '')), '') = v_request_operator_id
          or (
            v_request_operator_name is not null
            and nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = v_request_operator_name
          )
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    if exists (
      select 1
      from public.booking_requests as other_request
      where other_request.workspace_id = p_workspace_id
        and other_request.id <> v_request.id
        and other_request.status in ('pending', 'accepted')
        and other_request.appointment_date = v_request.appointment_date
        and tsrange(
          (v_request.appointment_date::timestamp + v_request.appointment_time),
          (v_request.appointment_date::timestamp + v_request.appointment_time + make_interval(mins => greatest(coalesce(v_request.requested_duration_minutes, 60), 1))),
          '[)'
        ) && tsrange(
          (other_request.appointment_date::timestamp + other_request.appointment_time),
          (other_request.appointment_date::timestamp + other_request.appointment_time + make_interval(mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1))),
          '[)'
        )
        and (
          (v_request_operator_id is null and v_request_operator_name is null)
          or (
            nullif(trim(coalesce(other_request.requested_operator_id, '')), '') is null
            and nullif(lower(trim(coalesce(other_request.requested_operator_name, ''))), '') is null
          )
          or nullif(trim(coalesce(other_request.requested_operator_id, '')), '') = v_request_operator_id
          or (
            v_request_operator_name is not null
            and nullif(lower(trim(coalesce(other_request.requested_operator_name, ''))), '') = v_request_operator_name
          )
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    select customer.id
    into v_customer_id
    from public.customers as customer
    where customer.workspace_id = p_workspace_id
      and (
        (nullif(regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'), '') is not null and customer.phone = regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'))
        or (nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '') is not null and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(coalesce(v_request.customer_email::text, ''))))
        or lower(trim(coalesce(customer.full_name, ''))) = lower(v_request_customer_name)
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
        p_workspace_id,
        v_request_customer_name,
        regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'),
        nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '')::citext,
        nullif(trim(coalesce(v_request.customer_instagram, '')), ''),
        coalesce(v_request.notes, ''),
        case when v_request.origin = 'frontend' then 'frontend' else 'salon' end,
        true
      )
      returning id into v_customer_id;
    else
      update public.customers
      set
        full_name = v_request_customer_name,
        phone = coalesce(nullif(regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'), ''), phone),
        email = coalesce(nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '')::citext, email),
        instagram = coalesce(nullif(trim(coalesce(v_request.customer_instagram, '')), ''), instagram),
        note = case when nullif(trim(coalesce(v_request.notes, '')), '') is not null then trim(v_request.notes) else note end,
        source = case when v_request.origin = 'frontend' then 'frontend' else 'salon' end,
        viewed_by_salon = true,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
    end if;

    update public.booking_requests
    set
      customer_id = v_customer_id,
      status = 'accepted',
      cancellation_source = null,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
    where id = v_request.id;

    select appointment.id
    into v_existing_appointment_id
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
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

    if v_existing_appointment_id is null then
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
        p_workspace_id,
        v_customer_id,
        v_request.id,
        v_request.appointment_date,
        v_request.appointment_time,
        v_request_customer_name,
        trim(coalesce(v_request.requested_service_name, '')),
        greatest(coalesce(v_request.requested_price, 0), 0),
        greatest(coalesce(v_request.requested_duration_minutes, 60), 1),
        v_request_operator_id,
        nullif(trim(coalesce(v_request.requested_operator_name, '')), ''),
        false,
        false,
        false,
        case when v_request.origin = 'frontend' then 'frontend' else 'backoffice' end
      )
      returning id into v_result_appointment_id;
    else
      update public.appointments
      set
        customer_id = v_customer_id,
        booking_request_id = v_request.id,
        appointment_date = v_request.appointment_date,
        appointment_time = v_request.appointment_time,
        customer_name = v_request_customer_name,
        service_name = trim(coalesce(v_request.requested_service_name, '')),
        price = greatest(coalesce(v_request.requested_price, 0), 0),
        duration_minutes = greatest(coalesce(v_request.requested_duration_minutes, 60), 1),
        operator_id = v_request_operator_id,
        operator_name = nullif(trim(coalesce(v_request.requested_operator_name, '')), ''),
        updated_at = timezone('utc', now())
      where id = v_existing_appointment_id;

      v_result_appointment_id := v_existing_appointment_id;
    end if;

    return jsonb_build_object(
      'appointmentId', v_result_appointment_id,
      'customerId', v_customer_id,
      'workspaceId', p_workspace_id
    );
  end if;

  update public.booking_requests
  set
    status = p_status,
    cancellation_source = case when p_status = 'cancelled' then 'salone' else null end,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = v_request.id;

  with deleted_appointments as (
    delete from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and (
        appointment.booking_request_id = v_request.id
        or (
          appointment.appointment_date = v_request.appointment_date
          and appointment.appointment_time = v_request.appointment_time
          and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
          and lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_request_customer_name)
        )
      )
    returning appointment.id, appointment.updated_at, appointment.created_at
  )
  select deleted_appointments.id
  into v_result_appointment_id
  from deleted_appointments
  order by deleted_appointments.updated_at desc nulls last, deleted_appointments.created_at desc nulls last, deleted_appointments.id desc
  limit 1;

  begin
    perform public.sync_client_portal_booking_requests(p_workspace_id);
  exception
    when others then
      null;
  end;

  begin
    perform public.process_public_slot_waitlist(
      p_workspace_id,
      v_request.appointment_date,
      v_request.appointment_time
    );
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'appointmentId', v_result_appointment_id,
    'customerId', v_request.customer_id,
    'workspaceId', p_workspace_id
  );
end;
$$;
