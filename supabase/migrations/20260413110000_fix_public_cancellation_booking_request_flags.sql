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

  update public.booking_requests
  set
    status = 'cancelled',
    cancellation_source = 'cliente',
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where id = v_request.id;

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
      when v_request.status = 'pending' then 'Richiesta annullata dal cliente'
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
        when 'pending' then 'In attesa'
        when 'accepted' then 'Accettata'
        when 'rejected' then 'Rifiutata'
        when 'cancelled' then 'Annullata'
        else v_request.status
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
end;
$$;

grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to anon;
grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to authenticated;
