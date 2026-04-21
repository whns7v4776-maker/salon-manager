drop function if exists public.update_owner_booking_request_status_v2(uuid, public.request_status);
drop function if exists public.update_owner_booking_request_status_by_email_v2(citext, text, uuid, public.request_status);

create or replace function public.update_owner_booking_request_status_v2(
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

create or replace function public.update_owner_booking_request_status_by_email_v2(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

grant execute on function public.update_owner_booking_request_status_v2(uuid, text) to authenticated;
grant execute on function public.update_owner_booking_request_status_by_email_v2(citext, text, uuid, text) to anon;
grant execute on function public.update_owner_booking_request_status_by_email_v2(citext, text, uuid, text) to authenticated;

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
    status = 'cancelled'::public.request_status,
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
end;
$$;

grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to anon;
grant execute on function public.cancel_public_booking_request(text, uuid, citext, text) to authenticated;
