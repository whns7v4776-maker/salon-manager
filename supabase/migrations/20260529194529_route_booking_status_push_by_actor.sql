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
  v_operator_label text;
  v_role_label text;
  v_detail_parts text[];
begin
  if coalesce(current_setting('salonpro.skip_booking_request_push', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_customer_full_name := trim(
    concat_ws(' ', coalesce(new.customer_name, ''), coalesce(new.customer_surname, ''))
  );
  v_customer_name_label := nullif(trim(v_customer_full_name), '');
  v_date_label := coalesce(to_char(new.appointment_date, 'DD/MM/YYYY'), '');
  v_time_label := case
    when new.appointment_time is not null then to_char(new.appointment_time, 'HH24:MI')
    else ''
  end;
  v_operator_label := nullif(trim(coalesce(new.requested_operator_name, '')), '');
  v_role_label := nullif(trim(coalesce(new.required_role, '')), '');

  if tg_op = 'INSERT' then
    if new.origin = 'frontend' and new.status = 'pending' then
      v_title := 'Nuova richiesta di prenotazione';
      v_detail_parts := array_remove(
        array[
          case
            when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
              'Servizio: ' || trim(new.requested_service_name)
            else null
          end,
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
      v_body := coalesce(v_customer_name_label, 'Cliente') ||
        case
          when coalesce(array_length(v_detail_parts, 1), 0) > 0 then
            '. ' || array_to_string(v_detail_parts, '. ') || '.'
          else
            '.'
        end;

      v_payload := jsonb_build_object(
        'type', 'booking_request_created',
        '_pushAudience', 'auth',
        '_pushTarget', 'owner',
        '_pushEventType', 'booking_request_created',
        'bookingRequestId', new.id,
        'appointmentDate', new.appointment_date,
        'appointmentTime', new.appointment_time,
        'customerName', v_customer_full_name,
        'serviceName', new.requested_service_name,
        'roleName', coalesce(v_role_label, ''),
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
    -- Accepted/rejected/salon-cancelled statuses are customer-facing events.
    -- They are queued by the app/RPC with targeted customer identity and must
    -- not be broadcast back to the owner device.
    if not (new.status = 'cancelled' and coalesce(new.cancellation_source, '') = 'cliente') then
      return new;
    end if;

    v_title := case
      when old.status = 'pending' then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;

    v_detail_parts := array_remove(
      array[
        case when v_customer_name_label is not null then 'Cliente: ' || v_customer_name_label else null end,
        case
          when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
            'Servizio: ' || trim(new.requested_service_name)
          else null
        end,
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
    v_body := 'Annullata' ||
      case
        when coalesce(array_length(v_detail_parts, 1), 0) > 0 then
          '. ' || array_to_string(v_detail_parts, '. ') || '.'
        else
          '.'
      end;

    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'booking_request_status_changed',
      'bookingRequestId', new.id,
      'status', 'Annullata',
      'statusCode', new.status::text,
      'cancellationSource', coalesce(new.cancellation_source, ''),
      'appointmentDate', new.appointment_date,
      'appointmentTime', new.appointment_time,
      'customerName', v_customer_full_name,
      'serviceName', new.requested_service_name,
      'roleName', coalesce(v_role_label, ''),
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

delete from public.push_notifications
where status = 'queued'
  and event_type = 'booking_request_status_changed'
  and payload ->> 'statusCode' in ('accepted', 'rejected')
  and coalesce(payload ->> '_pushTarget', '') = 'owner';
