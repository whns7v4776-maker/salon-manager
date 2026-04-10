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
  v_customer_name_label text;
begin
  v_customer_name_label := nullif(upper(trim(coalesce(new.customer_name, ''))), '');

  if tg_op = 'INSERT' then
    if new.origin = 'frontend' and new.status = 'pending' then
      v_title := 'Nuova richiesta prenotazione';
      v_date_label := coalesce(to_char(new.appointment_date, 'DD/MM/YYYY'), '');
      v_body :=
        coalesce(v_customer_name_label, 'CLIENTE') ||
        ' - ' ||
        coalesce(new.requested_service_name, 'Servizio') ||
        case
          when v_date_label <> '' and new.appointment_time is not null then
            ' il ' || v_date_label || ' alle ' || to_char(new.appointment_time, 'HH24:MI')
          when v_date_label <> '' then
            ' il ' || v_date_label
          else ''
        end;

      v_payload := jsonb_build_object(
        'type', 'booking_request_created',
        'bookingRequestId', new.id,
        'appointmentDate', new.appointment_date,
        'appointmentTime', new.appointment_time,
        'customerName', new.customer_name,
        'serviceName', new.requested_service_name
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
    v_title := 'Aggiornamento prenotazione';
    v_body := 'Stato richiesta: ' || new.status;

    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      'bookingRequestId', new.id,
      'status', new.status,
      'appointmentDate', new.appointment_date,
      'appointmentTime', new.appointment_time,
      'customerName', new.customer_name,
      'serviceName', new.requested_service_name
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
