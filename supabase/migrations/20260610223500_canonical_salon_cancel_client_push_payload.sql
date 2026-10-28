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
  v_dedupe_key text;
  v_active_role_count integer := 0;
  v_active_operator_count integer := 0;
  v_should_include_role boolean := false;
  v_should_include_operator boolean := false;
  v_is_customer_event boolean := false;
  v_customer_event_changed boolean := false;
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

  select count(*)
  into v_active_role_count
  from (
    select distinct lower(regexp_replace(trim(required_role), '\s+', ' ', 'g')) as role_key
    from public.services
    where workspace_id = new.workspace_id
      and nullif(trim(coalesce(required_role, '')), '') is not null
  ) as active_roles;

  select count(*)
  into v_active_operator_count
  from (
    select distinct lower(regexp_replace(trim(name), '\s+', ' ', 'g')) as operator_key
    from public.operators
    where workspace_id = new.workspace_id
      and nullif(trim(coalesce(name, '')), '') is not null
  ) as active_operators;

  v_active_role_count := greatest(v_active_role_count, case when v_role_label is not null then 1 else 0 end);
  v_active_operator_count := greatest(
    v_active_operator_count,
    case when v_operator_label is not null then 1 else 0 end
  );
  v_should_include_role := v_role_label is not null and v_active_role_count > 1;
  v_should_include_operator := v_operator_label is not null and v_active_operator_count > 1;

  if tg_op = 'INSERT' and new.origin = 'frontend' and new.status = 'pending' then
    v_title := 'Nuova richiesta di prenotazione';
    v_detail_parts := array_remove(
      array[
        case
          when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
            'Servizio: ' || trim(new.requested_service_name)
          else null
        end,
        case when v_should_include_role then 'Mestiere: ' || v_role_label else null end,
        case when v_should_include_operator then 'Operatore: ' || v_operator_label else null end,
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
    v_dedupe_key := concat_ws(
      '|',
      new.workspace_id::text,
      'booking_request_created',
      new.id::text
    );

    v_payload := jsonb_build_object(
      'type', 'booking_request_created',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'booking_request_created',
      '_dedupeKey', v_dedupe_key,
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

    return new;
  end if;

  v_is_customer_event :=
    new.viewed_by_customer = false
    and (
      (
        new.status in ('accepted'::public.request_status, 'rejected'::public.request_status)
        and not (
          tg_op = 'INSERT'
          and new.status = 'accepted'::public.request_status
          and new.origin = 'backoffice'
        )
      )
      or (
        new.status = 'cancelled'::public.request_status
        and coalesce(new.cancellation_source, '') = 'salone'
      )
    );

  v_customer_event_changed :=
    tg_op = 'INSERT'
    or new.status is distinct from old.status
    or coalesce(new.cancellation_source, '') is distinct from coalesce(old.cancellation_source, '')
    or new.viewed_by_customer is distinct from old.viewed_by_customer;

  if v_is_customer_event and v_customer_event_changed then
    v_title := case
      when new.status = 'cancelled'::public.request_status
        and coalesce(new.cancellation_source, '') = 'salone'
      then 'Appuntamento cancellato dal salone'
      when new.status = 'accepted'::public.request_status and new.origin = 'backoffice' then 'Nuova richiesta aggiunta'
      when new.status = 'accepted'::public.request_status then 'Prenotazione confermata'
      when new.status = 'rejected'::public.request_status then 'Prenotazione rifiutata'
      else 'Prenotazione annullata'
    end;

    v_detail_parts := array_remove(
      array[
        case
          when nullif(trim(coalesce(new.requested_service_name, '')), '') is not null then
            'Servizio: ' || trim(new.requested_service_name)
          else null
        end,
        case when v_should_include_role then 'Mestiere: ' || v_role_label else null end,
        case when v_should_include_operator then 'Operatore: ' || v_operator_label else null end,
        case
          when v_date_label <> '' and v_time_label <> '' then 'Data: ' || v_date_label || ' alle ' || v_time_label
          when v_date_label <> '' then 'Data: ' || v_date_label
          else null
        end
      ],
      null
    );
    v_body := case
      when coalesce(array_length(v_detail_parts, 1), 0) > 0 then array_to_string(v_detail_parts, '. ') || '.'
      else coalesce(v_customer_name_label, 'Aggiornamento prenotazione') || '.'
    end;
    v_dedupe_key := concat_ws(
      '|',
      new.workspace_id::text,
      'booking_request_status_changed_client',
      new.id::text,
      new.status::text,
      coalesce(new.cancellation_source, '')
    );

    v_payload := jsonb_build_object(
      'type', case
        when new.status = 'cancelled'::public.request_status
          and coalesce(new.cancellation_source, '') = 'salone'
        then 'appointment_cancelled_by_salon'
        else 'booking_request_status_changed'
      end,
      'event_type', case
        when new.status = 'cancelled'::public.request_status
          and coalesce(new.cancellation_source, '') = 'salone'
        then 'appointment_cancelled_by_salon'
        else 'booking_request_status_changed'
      end,
      'notificationType', case
        when new.status = 'cancelled'::public.request_status
          and coalesce(new.cancellation_source, '') = 'salone'
        then 'appointment_cancelled_by_salon'
        else 'booking_request_status_changed'
      end,
      '_pushAudience', 'public',
      '_pushTarget', 'client',
      '_pushEventType', case
        when new.status = 'cancelled'::public.request_status
          and coalesce(new.cancellation_source, '') = 'salone'
        then 'appointment_cancelled_by_salon'
        else 'booking_request_status_changed'
      end,
      '_dedupeKey', v_dedupe_key,
      'bookingRequestId', new.id,
      'status', case
        when new.status = 'accepted'::public.request_status then 'Accettata'
        when new.status = 'rejected'::public.request_status then 'Rifiutata'
        else 'Annullata'
      end,
      'statusCode', new.status::text,
      'cancellationSource', coalesce(new.cancellation_source, ''),
      'appointmentDate', new.appointment_date,
      'appointmentTime', new.appointment_time,
      'customerName', v_customer_full_name,
      'serviceName', new.requested_service_name,
      'roleName', coalesce(v_role_label, ''),
      'operatorName', coalesce(v_operator_label, ''),
      'customerEmail', coalesce(new.customer_email::text, ''),
      'customerPhone', coalesce(new.customer_phone, ''),
      'source', case
        when new.origin = 'backoffice' then 'backoffice'
        else 'owner'
      end
    );

    perform public.queue_public_customer_push(
      new.workspace_id,
      'booking_request_status_changed',
      v_title,
      v_body,
      v_payload,
      new.customer_email,
      new.customer_phone
    );

    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and new.status = 'cancelled'::public.request_status
    and coalesce(new.cancellation_source, '') = 'cliente'
  then
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
        case when v_should_include_role then 'Mestiere: ' || v_role_label else null end,
        case when v_should_include_operator then 'Operatore: ' || v_operator_label else null end,
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
    v_dedupe_key := concat_ws(
      '|',
      new.workspace_id::text,
      'booking_request_status_changed',
      new.id::text,
      'cancelled',
      'cliente'
    );

    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'booking_request_status_changed',
      '_dedupeKey', v_dedupe_key,
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

drop trigger if exists backoffice_cancelled_booking_request_customer_push_trigger on public.booking_requests;
drop function if exists public.handle_backoffice_cancelled_booking_request_customer_push();

notify pgrst, 'reload schema';
