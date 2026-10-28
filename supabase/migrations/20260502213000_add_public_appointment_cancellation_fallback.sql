create or replace function public.cancel_public_appointment_by_composite(
  p_salon_code text,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_service_name text,
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
  v_requested_service_name text := lower(trim(coalesce(p_requested_service_name, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_customer public.customers%rowtype;
  v_appointment public.appointments%rowtype;
  v_booking_request_id uuid;
  v_customer_name text;
  v_customer_surname text;
  v_date_label text;
  v_time_label text;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    raise exception 'workspace_not_found';
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    raise exception 'appointment_not_found';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'customer_identity_required';
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select c.*
  into v_customer
  from public.customers as c
  where c.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(c.email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(c.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  left join public.customers as customer
    on customer.id = appointment.customer_id
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_date = p_appointment_date
    and appointment.appointment_time = p_appointment_time
    and lower(trim(coalesce(appointment.service_name, ''))) = v_requested_service_name
    and appointment.completed = false
    and appointment.cashed_in = false
    and appointment.no_show = false
    and (
      (v_customer.id is not null and appointment.customer_id = v_customer.id)
      or (
        v_customer_email is not null
        and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  order by appointment.updated_at desc nulls last, appointment.created_at desc nulls last
  limit 1;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if v_appointment.booking_request_id is not null then
    return public.cancel_public_booking_request(
      p_salon_code,
      v_appointment.booking_request_id,
      v_customer_email,
      v_customer_phone
    );
  end if;

  v_customer_name := trim(coalesce(v_appointment.customer_name, ''));
  v_customer_surname :=
    case
      when position(' ' in v_customer_name) > 0 then
        trim(substring(v_customer_name from position(' ' in v_customer_name) + 1))
      else ''
    end;

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
    coalesce(v_appointment.customer_id, v_customer.id),
    v_appointment.service_name,
    v_appointment.price,
    v_appointment.duration_minutes,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    split_part(v_customer_name, ' ', 1),
    v_customer_surname,
    coalesce(v_customer.email, v_customer_email, ''::citext),
    coalesce(v_customer.phone, v_customer_phone, ''),
    coalesce(v_customer.instagram, ''),
    nullif(coalesce(v_customer.note, ''), ''),
    v_appointment.operator_id,
    v_appointment.operator_name,
    'frontend',
    'cancelled',
    'cliente',
    true
  )
  returning id into v_booking_request_id;

  update public.customers
  set
    viewed_by_salon = false,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      (coalesce(v_appointment.customer_id, v_customer.id) is not null and id = coalesce(v_appointment.customer_id, v_customer.id))
      or (
        v_customer_email is not null
        and lower(trim(coalesce(email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    );

  delete from public.appointments
  where id = v_appointment.id
    and workspace_id = v_workspace_id;

  begin
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  exception
    when others then
      null;
  end;

  v_date_label := coalesce(to_char(v_appointment.appointment_date, 'DD/MM/YYYY'), '');
  v_time_label :=
    case
      when v_appointment.appointment_time is not null then to_char(v_appointment.appointment_time, 'HH24:MI')
      else ''
    end;
  v_push_title := 'Prenotazione annullata dal cliente';
  v_push_body :=
    coalesce(nullif(v_customer_name, ''), 'Cliente') ||
    ' - ' ||
    coalesce(v_appointment.service_name, 'Servizio') ||
    case
      when v_date_label <> '' and v_time_label <> '' then ' il ' || v_date_label || ' alle ' || v_time_label
      when v_date_label <> '' then ' il ' || v_date_label
      else ''
    end;
  v_push_payload := jsonb_build_object(
    'type', 'appointment_cancelled',
    'bookingRequestId', v_booking_request_id,
    'appointmentId', v_appointment.id,
    'appointmentDate', v_appointment.appointment_date,
    'appointmentTime', v_appointment.appointment_time,
    'customerName', v_customer_name,
    'serviceName', v_appointment.service_name,
    'previousStatus', 'Accettata'
  );

  begin
    perform public.queue_workspace_push(
      v_workspace_id,
      'appointment_cancelled',
      v_push_title,
      v_push_body,
      v_push_payload
    );
  exception
    when others then
      null;
  end;

  begin
    perform public.process_public_slot_waitlist(v_workspace_id, v_appointment.appointment_date, v_appointment.appointment_time);
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'bookingRequestId', v_booking_request_id,
    'appointmentId', v_appointment.id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.cancel_public_appointment_by_composite(
  text,
  date,
  time,
  text,
  citext,
  text
) to anon;

grant execute on function public.cancel_public_appointment_by_composite(
  text,
  date,
  time,
  text,
  citext,
  text
) to authenticated;

notify pgrst, 'reload schema';
