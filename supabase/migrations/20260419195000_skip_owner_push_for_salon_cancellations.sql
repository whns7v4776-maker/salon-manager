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
    if new.status = 'cancelled' and coalesce(new.cancellation_source, '') = 'salone' then
      return new;
    end if;

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
