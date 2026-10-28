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
