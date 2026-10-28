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
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Accepted/rejected/salon-cancelled statuses are customer-facing events.
    -- Client cancellations are owner-facing and are emitted exactly once here,
    -- on the status transition, not by the app after the RPC returns.
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

  if v_previous_status = 'cancelled'::public.request_status and coalesce(v_request.cancellation_source, '') = 'cliente' then
    return jsonb_build_object(
      'bookingRequestId', v_request.id,
      'appointmentId', null,
      'workspaceId', v_workspace_id,
      'alreadyCancelled', true
    );
  end if;

  update public.booking_requests
  set status = 'cancelled'::public.request_status,
      cancellation_source = 'cliente',
      viewed_by_customer = true,
      viewed_by_salon = false,
      updated_at = timezone('utc', now())
  where id = v_request.id;

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

  update public.customers
  set viewed_by_salon = false,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      (v_request.customer_id is not null and id = v_request.customer_id)
      or (v_customer_email is not null and lower(trim(coalesce(email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    );

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  begin
    perform public.process_public_slot_waitlist(v_workspace_id, v_request.appointment_date, v_request.appointment_time);
  exception
    when undefined_function then
      null;
    when others then
      null;
  end;

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id,
    'alreadyCancelled', false
  );
end;
$$;

grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to anon;
grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to authenticated;

notify pgrst, 'reload schema';
