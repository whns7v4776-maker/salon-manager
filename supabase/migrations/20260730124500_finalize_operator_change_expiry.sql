alter function public.respond_public_booking_operator_change_v1(
  text,
  uuid,
  text,
  text,
  text
) rename to respond_public_booking_operator_change_impl_v1;

create or replace function public.expire_booking_operator_changes_v1(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_expired_count integer := 0;
  v_customer_name text;
begin
  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  for v_request in
    select request.*
    from public.booking_requests as request
    where request.status::text = 'pending'
      and request.operator_change_status = 'pending'
      and request.operator_change_expires_at <= timezone('utc', now())
    order by request.operator_change_expires_at asc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    update public.booking_requests
    set status = 'cancelled'::public.request_status,
        cancellation_source = null,
        operator_change_status = 'expired',
        operator_change_responded_at = timezone('utc', now()),
        viewed_by_customer = false,
        viewed_by_salon = false,
        updated_at = timezone('utc', now())
    where id = v_request.id
      and status::text = 'pending'
      and operator_change_status = 'pending';

    if found then
      v_expired_count := v_expired_count + 1;
      v_customer_name := trim(
        concat_ws(
          ' ',
          coalesce(v_request.customer_name, ''),
          coalesce(v_request.customer_surname, '')
        )
      );

      perform public.refresh_workspace_agenda_state(v_request.workspace_id);

      perform public.queue_public_owner_push(
        v_request.workspace_id,
        'custom'::public.push_event_type,
        'Cambio operatore scaduto',
        concat(
          v_customer_name,
          ' non ha confermato in tempo il cambio operatore per ',
          trim(v_request.requested_service_name),
          ' del ', to_char(v_request.appointment_date, 'DD/MM'),
          ' alle ', to_char(v_request.appointment_time, 'HH24:MI'),
          '. La richiesta è stata chiusa.'
        ),
        jsonb_build_object(
          'type', 'booking_operator_change_response',
          'eventType', 'booking_operator_change_response',
          '_pushEventType', 'booking_operator_change_response',
          '_pushAudience', 'auth',
          '_pushTarget', 'owner',
          '_dedupeKey', concat_ws(
            '|',
            v_request.workspace_id::text,
            'operator_change_response',
            v_request.id::text,
            'expired'
          ),
          'bookingRequestId', v_request.id,
          'response', 'expired',
          'appointmentDate', v_request.appointment_date,
          'appointmentTime', v_request.appointment_time,
          'customerName', v_customer_name,
          'serviceName', v_request.requested_service_name
        )
      );

      perform public.queue_public_customer_push(
        v_request.workspace_id,
        'custom'::public.push_event_type,
        'Cambio operatore scaduto',
        concat(
          'La richiesta di cambio operatore per ',
          trim(v_request.requested_service_name),
          ' del ', to_char(v_request.appointment_date, 'DD/MM'),
          ' alle ', to_char(v_request.appointment_time, 'HH24:MI'),
          ' è scaduta.'
        ),
        jsonb_build_object(
          'type', 'booking_operator_change_response',
          'eventType', 'booking_operator_change_response',
          '_pushEventType', 'booking_operator_change_response',
          '_pushAudience', 'public',
          '_pushTarget', 'client',
          '_dedupeKey', concat_ws(
            '|',
            v_request.workspace_id::text,
            'operator_change_response',
            v_request.id::text,
            'expired'
          ),
          'bookingRequestId', v_request.id,
          'response', 'expired',
          'appointmentDate', v_request.appointment_date,
          'appointmentTime', v_request.appointment_time,
          'customerName', v_customer_name,
          'serviceName', v_request.requested_service_name
        ),
        v_request.customer_email,
        v_request.customer_phone
      );

      begin
        perform public.process_public_slot_waitlist(
          v_request.workspace_id,
          v_request.appointment_date,
          v_request.appointment_time
        );
      exception
        when others then
          null;
      end;
    end if;
  end loop;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_booking_operator_changes_v1(integer) from public;
grant execute on function public.expire_booking_operator_changes_v1(integer) to service_role;

create or replace function public.respond_public_booking_operator_change_v1(
  p_salon_code text,
  p_request_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
begin
  select request.*
  into v_request
  from public.booking_requests as request
  join public.workspaces as workspace
    on workspace.id = request.workspace_id
  where lower(trim(workspace.slug)) = lower(trim(coalesce(p_salon_code, '')))
    and request.id = p_request_id
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '') is not null
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10)
  limit 1;

  if v_request.id is null then
    raise exception 'operator_change_not_found';
  end if;

  if v_request.operator_change_status = 'pending'
    and v_request.operator_change_expires_at <= timezone('utc', now()) then
    perform public.expire_booking_operator_changes_v1(100);
    return jsonb_build_object(
      'requestId', v_request.id,
      'operatorChangeStatus', 'expired',
      'requestStatus', 'cancelled',
      'changed', true
    );
  end if;

  return public.respond_public_booking_operator_change_impl_v1(
    p_salon_code,
    p_request_id,
    p_customer_email,
    p_customer_phone,
    p_response
  );
end;
$$;

revoke all on function public.respond_public_booking_operator_change_v1(
  text,
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.respond_public_booking_operator_change_v1(
  text,
  uuid,
  text,
  text,
  text
) to anon, authenticated;

do $$
declare
  v_job record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not available: operator change expiry remains response-driven.';
    return;
  end if;

  for v_job in
    execute
      'select jobid from cron.job where jobname = $1'
      using 'expire-booking-operator-changes-every-minute'
  loop
    execute 'select cron.unschedule($1)' using v_job.jobid;
  end loop;

  begin
    execute
      'select cron.schedule($1, $2, $3)'
      using
        'expire-booking-operator-changes-every-minute',
        '* * * * *',
        'select public.expire_booking_operator_changes_v1(200);';
  exception
    when others then
      raise notice 'Could not schedule operator change expiry cron: %', SQLERRM;
  end;
end
$$;

notify pgrst, 'reload schema';
