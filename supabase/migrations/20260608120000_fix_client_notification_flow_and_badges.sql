create or replace function public.handle_backoffice_cancelled_booking_request_customer_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_body text;
  v_date_label text;
  v_time_label text;
  v_customer_full_name text;
  v_operator_label text;
  v_role_label text;
  v_detail_parts text[];
  v_dedupe_key text;
  v_active_role_count integer := 0;
  v_active_operator_count integer := 0;
  v_should_include_role boolean := false;
  v_should_include_operator boolean := false;
begin
  if coalesce(current_setting('salonpro.skip_booking_request_push', true), '') = 'on' then
    return new;
  end if;

  if not (
    new.status = 'cancelled'::public.request_status
    and coalesce(new.cancellation_source, '') = 'salone'
  ) then
    return new;
  end if;

  if coalesce(new.customer_email::text, '') = '' and coalesce(new.customer_phone, '') = '' then
    return new;
  end if;

  v_customer_full_name := trim(
    concat_ws(' ', coalesce(new.customer_name, ''), coalesce(new.customer_surname, ''))
  );
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
    else 'Il salone ha annullato la prenotazione.'
  end;
  v_dedupe_key := concat_ws(
    '|',
    new.workspace_id::text,
    'booking_request_status_changed_client',
    new.id::text,
    'cancelled',
    'salone'
  );

  v_payload := jsonb_build_object(
    'type', 'booking_request_status_changed',
    '_pushAudience', 'public',
    '_pushTarget', 'client',
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
    'operatorName', coalesce(v_operator_label, ''),
    'customerEmail', coalesce(new.customer_email::text, ''),
    'customerPhone', coalesce(new.customer_phone, '')
  );

  perform public.queue_public_customer_push(
    new.workspace_id,
    'booking_request_status_changed',
    'Prenotazione annullata',
    v_body,
    v_payload,
    new.customer_email,
    new.customer_phone
  );

  return new;
end;
$$;

drop trigger if exists backoffice_cancelled_booking_request_customer_push_trigger on public.booking_requests;
create trigger backoffice_cancelled_booking_request_customer_push_trigger
after insert on public.booking_requests
for each row
when (
  new.status = 'cancelled'::public.request_status
  and coalesce(new.cancellation_source, '') = 'salone'
)
execute procedure public.handle_backoffice_cancelled_booking_request_customer_push();

delete from public.push_notifications as push
using public.booking_requests as request
where push.status = 'queued'
  and push.event_type = 'booking_request_status_changed'
  and coalesce(push.payload ->> '_pushTarget', '') = 'client'
  and coalesce(push.payload ->> 'bookingRequestId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and nullif(push.payload ->> 'bookingRequestId', '')::uuid = request.id
  and (
    request.viewed_by_customer = true
    or
    request.status is distinct from (push.payload ->> 'statusCode')::public.request_status
    or (
      request.status = 'cancelled'::public.request_status
      and coalesce(request.cancellation_source, '') = 'cliente'
    )
  );

notify pgrst, 'reload schema';
