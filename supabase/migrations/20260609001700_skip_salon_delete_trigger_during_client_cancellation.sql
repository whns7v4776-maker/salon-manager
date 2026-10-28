create or replace function public.handle_backoffice_appointment_delete_client_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := null;
  v_customer_email citext := null;
  v_customer_phone text := null;
  v_customer_instagram text := null;
  v_customer_full_name text := trim(coalesce(old.customer_name, ''));
  v_customer_first_name text;
  v_customer_last_name text;
  v_existing_request_id uuid;
begin
  if coalesce(current_setting('salonpro.skip_appointment_delete_client_cancellation', true), '') = 'on' then
    return old;
  end if;

  if old.workspace_id is null then
    return old;
  end if;

  v_customer_first_name := split_part(v_customer_full_name, ' ', 1);
  if position(' ' in v_customer_full_name) > 0 then
    v_customer_last_name := trim(
      substring(v_customer_full_name from position(' ' in v_customer_full_name) + 1)
    );
  else
    v_customer_last_name := '';
  end if;

  if old.customer_id is not null then
    select
      customer.id,
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_id, v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.id = old.customer_id
      and customer.workspace_id = old.workspace_id;
  end if;

  if v_customer_id is null and v_customer_full_name <> '' then
    select
      customer.id,
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_id, v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.workspace_id = old.workspace_id
      and lower(trim(customer.full_name)) = lower(v_customer_full_name)
    order by
      case when nullif(customer.email, '') is not null or nullif(customer.phone, '') is not null then 0 else 1 end,
      customer.updated_at desc nulls last,
      customer.created_at desc nulls last
    limit 1;
  end if;

  if old.booking_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.id = old.booking_request_id
      and request.workspace_id = old.workspace_id
      and (
        request.status is distinct from 'cancelled'::public.request_status
        or coalesce(request.cancellation_source, '') is distinct from 'salone'
        or request.viewed_by_customer is distinct from false
      );

    return old;
  end if;

  select request.id
  into v_existing_request_id
  from public.booking_requests as request
  where request.workspace_id = old.workspace_id
    and request.appointment_date = old.appointment_date
    and request.appointment_time = old.appointment_time
    and lower(trim(request.requested_service_name)) = lower(trim(old.service_name))
    and (
      (
        v_customer_id is not null
        and request.customer_id = v_customer_id
      )
      or (
        lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
        lower(v_customer_full_name)
      )
      or (
        v_customer_email is not null
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
      when request.status = 'cancelled'::public.request_status
        and coalesce(request.cancellation_source, '') = 'salone' then 1
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
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.id = v_existing_request_id
      and (
        request.status is distinct from 'cancelled'::public.request_status
        or coalesce(request.cancellation_source, '') is distinct from 'salone'
        or request.viewed_by_customer is distinct from false
      );

    return old;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return old;
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
    origin,
    status,
    cancellation_source,
    viewed_by_salon,
    viewed_by_customer
  ) values (
    old.workspace_id,
    v_customer_id,
    old.service_name,
    old.price,
    old.duration_minutes,
    old.appointment_date,
    old.appointment_time,
    v_customer_first_name,
    v_customer_last_name,
    coalesce(v_customer_email, ''),
    coalesce(v_customer_phone, ''),
    v_customer_instagram,
    'backoffice',
    'cancelled',
    'salone',
    true,
    false
  );

  return old;
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
  v_previous_status public.request_status;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_full_name text;
  v_deleted_appointment_id uuid;
  v_date_label text;
  v_time_label text;
  v_operator_label text;
  v_role_label text;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
  v_detail_parts text[];
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
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

  v_previous_status := v_request.status;
  v_customer_full_name := trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')));

  update public.booking_requests
  set status = 'cancelled'::public.request_status,
      cancellation_source = 'cliente',
      viewed_by_customer = true,
      viewed_by_salon = false,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  perform set_config('salonpro.skip_appointment_delete_client_cancellation', 'on', true);

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = v_request.id
  returning appointment.id into v_deleted_appointment_id;

  if v_deleted_appointment_id is null and v_previous_status = 'accepted'::public.request_status then
    delete from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = v_request.appointment_date
      and appointment.appointment_time = v_request.appointment_time
      and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
      and appointment.completed = false
      and appointment.cashed_in = false
      and appointment.no_show = false
      and (
        (v_request.customer_id is not null and appointment.customer_id = v_request.customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
        or exists (
          select 1
          from public.customers as customer
          where customer.id = appointment.customer_id
            and customer.workspace_id = v_workspace_id
            and (
              (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
              or (
                v_customer_phone is not null
                and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
              )
            )
        )
      )
      and (
        (
          nullif(trim(coalesce(v_request.requested_operator_id, '')), '') is null
          and nullif(trim(coalesce(v_request.requested_operator_name, '')), '') is null
        )
        or nullif(trim(coalesce(appointment.operator_id, '')), '') = nullif(trim(coalesce(v_request.requested_operator_id, '')), '')
        or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') = nullif(lower(trim(coalesce(v_request.requested_operator_name, ''))), '')
      )
    returning appointment.id into v_deleted_appointment_id;
  end if;

  perform set_config('salonpro.skip_appointment_delete_client_cancellation', 'off', true);

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  begin
    perform public.process_public_slot_waitlist(v_workspace_id, v_request.appointment_date, v_request.appointment_time);
  exception
    when undefined_function then
      null;
    when others then
      null;
  end;

  if not exists (
    select 1
    from public.push_notifications as push
    where push.workspace_id = v_workspace_id
      and push.event_type = 'booking_request_status_changed'
      and push.payload ->> 'bookingRequestId' = v_request.id::text
      and push.payload ->> 'statusCode' = 'cancelled'
      and coalesce(push.payload ->> 'cancellationSource', '') = 'cliente'
      and push.created_at > timezone('utc', now()) - interval '2 minutes'
  ) then
    v_date_label := coalesce(to_char(v_request.appointment_date, 'DD/MM/YYYY'), '');
    v_time_label := case
      when v_request.appointment_time is not null then to_char(v_request.appointment_time, 'HH24:MI')
      else ''
    end;
    v_operator_label := nullif(trim(coalesce(v_request.requested_operator_name, '')), '');
    v_role_label := nullif(trim(coalesce(v_request.required_role, '')), '');
    v_push_title := case
      when v_previous_status = 'pending'::public.request_status then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;
    v_detail_parts := array_remove(
      array[
        case when nullif(v_customer_full_name, '') is not null then 'Cliente: ' || v_customer_full_name else null end,
        case when nullif(trim(coalesce(v_request.requested_service_name, '')), '') is not null then 'Servizio: ' || trim(v_request.requested_service_name) else null end,
        case when v_role_label is not null then 'Mestiere: ' || v_role_label else null end,
        case when v_operator_label is not null then 'Operatore: ' || v_operator_label else null end,
        case
          when v_date_label <> '' and v_time_label <> '' then 'Data: ' || v_date_label || ' alle ' || v_time_label
          when v_date_label <> '' then 'Data: ' || v_date_label
          else null
        end
      ],
      null
    );
    v_push_body := 'Annullata' ||
      case
        when coalesce(array_length(v_detail_parts, 1), 0) > 0 then '. ' || array_to_string(v_detail_parts, '. ') || '.'
        else '.'
      end;
    v_push_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'booking_request_status_changed',
      'bookingRequestId', v_request.id,
      'appointmentId', v_deleted_appointment_id,
      'status', 'Annullata',
      'statusCode', 'cancelled',
      'cancellationSource', 'cliente',
      'appointmentDate', v_request.appointment_date,
      'appointmentTime', v_request.appointment_time,
      'customerName', v_customer_full_name,
      'serviceName', v_request.requested_service_name,
      'roleName', coalesce(v_role_label, ''),
      'operatorName', coalesce(v_operator_label, '')
    );

    perform public.queue_workspace_push(
      v_workspace_id,
      'booking_request_status_changed',
      v_push_title,
      v_push_body,
      v_push_payload
    );
  end if;

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to anon;
grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to authenticated;

notify pgrst, 'reload schema';
