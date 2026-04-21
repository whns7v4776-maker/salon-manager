create or replace function public.handle_booking_requests_push_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_title text;
  v_body text;
  v_date_label text;
  v_time_label text;
  v_customer_name_label text;
  v_customer_full_name text;
  v_status_label text;
  v_operator_label text;
begin
  v_customer_full_name := trim(
    concat_ws(' ', coalesce(new.customer_name, ''), coalesce(new.customer_surname, ''))
  );
  v_customer_name_label := nullif(upper(v_customer_full_name), '');
  v_date_label := coalesce(to_char(new.appointment_date, 'DD/MM/YYYY'), '');
  v_time_label := case
    when new.appointment_time is not null then to_char(new.appointment_time, 'HH24:MI')
    else ''
  end;
  v_operator_label := nullif(trim(coalesce(new.requested_operator_name, '')), '');

  if tg_op = 'INSERT' then
    if new.origin = 'frontend' and new.status = 'pending' then
      v_title := 'Nuova richiesta prenotazione';
      v_body :=
        coalesce(v_customer_name_label, 'CLIENTE') ||
        case
          when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
            ' - Servizio: ' || trim(new.requested_service_name)
          else ''
        end ||
        case
          when v_date_label <> '' and v_time_label <> '' then
            '. Appuntamento: ' || v_date_label || ' alle ' || v_time_label
          when v_date_label <> '' then
            '. Appuntamento: ' || v_date_label
          else ''
        end ||
        case
          when v_operator_label is not null then
            '. Operatore: ' || v_operator_label
          else ''
        end ||
        '.';

      v_payload := jsonb_build_object(
        'type', 'booking_request_created',
        'bookingRequestId', new.id,
        'appointmentDate', new.appointment_date,
        'appointmentTime', new.appointment_time,
        'customerName', v_customer_full_name,
        'serviceName', new.requested_service_name,
        'operatorName', coalesce(v_operator_label, '')
      );

      perform public.queue_workspace_push(
        new.workspace_id,
        'booking_request_created',
        v_title,
        v_body,
        v_payload
      );
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_status_label := case new.status
      when 'accepted' then 'Accettata'
      when 'rejected' then 'Rifiutata'
      when 'cancelled' then 'Annullata'
      else initcap(coalesce(new.status::text, ''))
    end;

    v_title := case v_status_label
      when 'Accettata' then 'Prenotazione Accettata'
      when 'Rifiutata' then 'Prenotazione Rifiutata'
      else 'Prenotazione Annullata'
    end;
    v_body :=
      v_status_label ||
      case
        when v_customer_name_label is not null then
          '. Cliente: ' || v_customer_name_label
        else ''
      end ||
      case
        when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
          '. Servizio: ' || trim(new.requested_service_name)
        else ''
      end ||
      case
        when v_date_label <> '' and v_time_label <> '' then
          '. Appuntamento: ' || v_date_label || ' alle ' || v_time_label
        when v_date_label <> '' then
          '. Appuntamento: ' || v_date_label
        else ''
      end ||
      case
        when v_operator_label is not null then
          '. Operatore: ' || v_operator_label
        else ''
      end ||
      '.';

    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      'bookingRequestId', new.id,
      'status', v_status_label,
      'statusCode', new.status::text,
      'appointmentDate', new.appointment_date,
      'appointmentTime', new.appointment_time,
      'customerName', v_customer_full_name,
      'serviceName', new.requested_service_name,
      'operatorName', coalesce(v_operator_label, '')
    );

    perform public.queue_workspace_push(
      new.workspace_id,
      'booking_request_status_changed',
      v_title,
      v_body,
      v_payload
    );
  end if;

  return new;
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

    begin
      execute 'alter table public.booking_requests disable trigger booking_requests_push_queue_trigger';
    exception
      when others then null;
    end;
    begin
      execute 'alter table public.booking_requests disable trigger sync_client_portal_after_booking_requests_change';
    exception
      when others then null;
    end;

    update public.booking_requests
    set
      customer_id = v_customer_id,
      status = 'accepted',
      cancellation_source = null,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
    where id = v_request.id;

    begin
      execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
    exception
      when others then null;
    end;
    begin
      execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
    exception
      when others then null;
    end;

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

    begin
      perform public.sync_client_portal_booking_requests(p_workspace_id);
    exception
      when others then null;
    end;

    begin
      perform public.process_public_slot_waitlist(
        p_workspace_id,
        v_request.appointment_date,
        v_request.appointment_time
      );
    exception
      when others then null;
    end;

    return jsonb_build_object(
      'appointmentId', v_result_appointment_id,
      'customerId', v_customer_id,
      'workspaceId', p_workspace_id
    );
  end if;

  begin
    execute 'alter table public.booking_requests disable trigger booking_requests_push_queue_trigger';
  exception
    when others then null;
  end;
  begin
    execute 'alter table public.booking_requests disable trigger sync_client_portal_after_booking_requests_change';
  exception
    when others then null;
  end;

  update public.booking_requests
  set
    status = p_status,
    cancellation_source = case when p_status = 'cancelled' then 'salone' else null end,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = v_request.id;

  begin
    execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
  exception
    when others then null;
  end;
  begin
    execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
  exception
    when others then null;
  end;

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
exception
  when others then
    begin
      execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
    exception
      when others then null;
    end;
    begin
      execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
    exception
      when others then null;
    end;
    raise;
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
  v_deleted_appointment_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_name text;
  v_date_label text;
  v_time_label text;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(br.customer_email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(br.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  begin
    execute 'alter table public.booking_requests disable trigger booking_requests_push_queue_trigger';
  exception
    when others then null;
  end;
  begin
    execute 'alter table public.booking_requests disable trigger sync_client_portal_after_booking_requests_change';
  exception
    when others then null;
  end;

  update public.booking_requests
  set
    status = 'cancelled'::public.request_status,
    cancellation_source = 'cliente',
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where id = v_request.id;

  begin
    execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
  exception
    when others then null;
  end;
  begin
    execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
  exception
    when others then null;
  end;

  update public.customers
  set
    viewed_by_salon = false,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      (v_request.customer_id is not null and id = v_request.customer_id)
      or (
        v_customer_email is not null
        and lower(trim(coalesce(email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    );

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and (
      appointment.booking_request_id = v_request.id
      or (
        appointment.appointment_date = v_request.appointment_date
        and appointment.appointment_time = v_request.appointment_time
        and lower(trim(appointment.service_name)) = lower(trim(coalesce(v_request.requested_service_name, '')))
        and lower(trim(appointment.customer_name)) = lower(
          trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')))
        )
      )
    )
  returning appointment.id into v_deleted_appointment_id;

  begin
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  exception
    when others then
      null;
  end;

  v_customer_name := trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')));
  v_date_label := coalesce(to_char(v_request.appointment_date, 'DD/MM/YYYY'), '');
  v_time_label :=
    case
      when v_request.appointment_time is not null then to_char(v_request.appointment_time, 'HH24:MI')
      else ''
    end;

  v_push_title :=
    case
      when v_request.status = 'pending'::public.request_status then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;

  v_push_body :=
    coalesce(nullif(v_customer_name, ''), 'Cliente') ||
    ' - ' ||
    coalesce(v_request.requested_service_name, 'Servizio') ||
    case
      when v_date_label <> '' and v_time_label <> '' then ' il ' || v_date_label || ' alle ' || v_time_label
      when v_date_label <> '' then ' il ' || v_date_label
      else ''
    end;

  v_push_payload := jsonb_build_object(
    'type', 'appointment_cancelled',
    'bookingRequestId', v_request.id,
    'appointmentDate', v_request.appointment_date,
    'appointmentTime', v_request.appointment_time,
    'customerName', v_customer_name,
    'serviceName', v_request.requested_service_name,
    'previousStatus',
      case v_request.status
        when 'pending'::public.request_status then 'In attesa'
        when 'accepted'::public.request_status then 'Accettata'
        when 'rejected'::public.request_status then 'Rifiutata'
        when 'cancelled'::public.request_status then 'Annullata'
        else v_request.status::text
      end
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
    perform public.process_public_slot_waitlist(v_workspace_id, v_request.appointment_date, v_request.appointment_time);
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
exception
  when others then
    begin
      execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
    exception
      when others then null;
    end;
    begin
      execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
    exception
      when others then null;
    end;
    raise;
end;
$$;
