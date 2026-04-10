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
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    return new;
  end if;

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

  return new;
end;
$$;

create or replace function public.handle_client_portal_public_snapshot_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if tg_table_name = 'booking_requests' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    return coalesce(new, old);
  end if;

  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);

  return coalesce(new, old);
exception
  when others then
    return coalesce(new, old);
end;
$$;
