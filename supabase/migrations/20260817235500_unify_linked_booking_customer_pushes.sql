-- Linked services are separate rows for Agenda scheduling, but they are one
-- customer booking. Batch their status notifications and present one ordered
-- timeline for phased services, dependencies and compositions.

create or replace function public.format_booking_group_timeline_v1(
  p_workspace_id uuid,
  p_appointment_group_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    string_agg(
      trim(request.requested_service_name) || ' alle ' ||
      to_char(request.appointment_time, 'HH24:MI') ||
      case
        when coalesce(request.phase_snapshot ->> 'mode', '') = 'phased'
          and coalesce(request.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
          and (request.phase_snapshot ->> 'processingDurationMinutes')::integer > 0
        then ' · posa ' ||
          (request.phase_snapshot ->> 'processingDurationMinutes')::integer::text || ' min'
        else ''
      end,
      ' · ' order by request.appointment_group_order, request.created_at, request.id
    ),
    ''
  )
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id;
$$;

revoke all on function public.format_booking_group_timeline_v1(uuid, uuid) from public;
grant execute on function public.format_booking_group_timeline_v1(uuid, uuid)
  to authenticated, service_role;

create or replace function public.queue_booking_group_status_push_v1(
  p_workspace_id uuid,
  p_appointment_group_id uuid,
  p_status public.request_status,
  p_cancellation_source text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.appointment_groups%rowtype;
  v_request public.booking_requests%rowtype;
  v_timeline text;
  v_title text;
  v_body text;
  v_event_type public.push_event_type := 'booking_request_status_changed';
  v_status_label text;
  v_payload jsonb;
  v_dedupe_key text;
begin
  select appointment_group.* into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = p_workspace_id
    and appointment_group.id = p_appointment_group_id;

  if v_group.id is null then return; end if;

  select request.* into v_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.appointment_group_id = p_appointment_group_id
  order by request.appointment_group_order, request.created_at, request.id
  limit 1;

  if v_request.id is null then return; end if;

  v_timeline := public.format_booking_group_timeline_v1(
    p_workspace_id,
    p_appointment_group_id
  );
  if nullif(trim(v_timeline), '') is null then return; end if;

  if p_status = 'accepted'::public.request_status then
    v_title := 'Prenotazione confermata';
    v_status_label := 'Accettata';
    v_body := v_timeline || '. Data: ' || to_char(v_request.appointment_date, 'DD/MM/YYYY') || '.';
  elsif p_status = 'rejected'::public.request_status then
    v_title := 'Prenotazione rifiutata';
    v_status_label := 'Rifiutata';
    v_body := v_timeline || '. Data: ' || to_char(v_request.appointment_date, 'DD/MM/YYYY') || '.';
  elsif p_status = 'cancelled'::public.request_status
    and coalesce(p_cancellation_source, '') = 'cliente'
  then
    v_title := 'Prenotazione annullata dal cliente';
    v_status_label := 'Annullata';
    v_body := trim(concat_ws(' ', v_request.customer_name, v_request.customer_surname)) ||
      '. ' || v_timeline || '. Data: ' || to_char(v_request.appointment_date, 'DD/MM/YYYY') || '.';
  else
    v_title := 'Appuntamento cancellato dal salone';
    v_status_label := 'Annullata';
    v_event_type := 'appointment_cancelled'::public.push_event_type;
    v_body := v_timeline || '. Data: ' || to_char(v_request.appointment_date, 'DD/MM/YYYY') || '.';
  end if;

  v_dedupe_key := concat_ws(
    '|',
    p_workspace_id::text,
    'booking_group_status',
    p_appointment_group_id::text,
    p_status::text,
    coalesce(p_cancellation_source, '')
  );

  v_payload := jsonb_build_object(
    'type', case
      when p_status = 'cancelled'::public.request_status
        and coalesce(p_cancellation_source, '') = 'salone'
      then 'appointment_cancelled_by_salon'
      else 'booking_request_status_changed'
    end,
    'event_type', case
      when p_status = 'cancelled'::public.request_status
        and coalesce(p_cancellation_source, '') = 'salone'
      then 'appointment_cancelled_by_salon'
      else 'booking_request_status_changed'
    end,
    'notificationType', case
      when p_status = 'cancelled'::public.request_status
        and coalesce(p_cancellation_source, '') = 'salone'
      then 'appointment_cancelled_by_salon'
      else 'booking_request_status_changed'
    end,
    '_pushEventType', case
      when p_status = 'cancelled'::public.request_status
        and coalesce(p_cancellation_source, '') = 'salone'
      then 'appointment_cancelled_by_salon'
      else 'booking_request_status_changed'
    end,
    '_dedupeKey', v_dedupe_key,
    'bookingRequestId', v_request.id,
    'appointmentGroupId', p_appointment_group_id,
    'status', v_status_label,
    'statusCode', p_status::text,
    'cancellationSource', coalesce(p_cancellation_source, ''),
    'appointmentDate', v_request.appointment_date,
    'appointmentTime', v_request.appointment_time,
    'customerName', trim(concat_ws(' ', v_request.customer_name, v_request.customer_surname)),
    'serviceName', coalesce(nullif(trim(v_group.title), ''), v_request.requested_service_name),
    'bookingTimeline', v_timeline
  );

  if p_status = 'cancelled'::public.request_status
    and coalesce(p_cancellation_source, '') = 'cliente'
  then
    v_payload := v_payload || jsonb_build_object(
      '_pushAudience', 'auth',
      '_pushTarget', 'owner'
    );
    perform public.queue_workspace_push(
      p_workspace_id,
      'booking_request_status_changed',
      v_title,
      v_body,
      v_payload
    );
  else
    v_payload := v_payload || jsonb_build_object(
      '_pushAudience', 'public',
      '_pushTarget', 'client',
      'customerEmail', coalesce(v_request.customer_email::text, ''),
      'customerPhone', coalesce(v_request.customer_phone, ''),
      'source', 'owner'
    );
    perform public.queue_public_customer_push(
      p_workspace_id,
      v_event_type,
      v_title,
      v_body,
      v_payload,
      v_request.customer_email,
      v_request.customer_phone
    );
  end if;
end;
$$;

revoke all on function public.queue_booking_group_status_push_v1(
  uuid, uuid, public.request_status, text
) from public;
grant execute on function public.queue_booking_group_status_push_v1(
  uuid, uuid, public.request_status, text
) to authenticated, service_role;

-- This guard runs before the canonical per-row push trigger. The final group
-- trigger below queues the one customer-visible event after every row is final.
create or replace function public.guard_booking_group_push_batch_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.appointment_group_id is not null
    and (
      new.status is distinct from old.status
      or coalesce(new.cancellation_source, '') is distinct from
        coalesce(old.cancellation_source, '')
      or (
        new.status = 'accepted'::public.request_status
        and new.viewed_by_customer = false
        and (
          new.appointment_date is distinct from old.appointment_date
          or new.appointment_time is distinct from old.appointment_time
          or coalesce(new.requested_operator_id, '') is distinct from
            coalesce(old.requested_operator_id, '')
          or coalesce(new.requested_operator_name, '') is distinct from
            coalesce(old.requested_operator_name, '')
          or coalesce(new.phase_operator_assignments, '{}'::jsonb) is distinct from
            coalesce(old.phase_operator_assignments, '{}'::jsonb)
        )
      )
    )
  then
    perform set_config('salonpro.skip_booking_request_push', 'on', true);
  end if;
  return new;
end;
$$;

drop trigger if exists aa_guard_booking_group_push_batch_v1 on public.booking_requests;
create trigger aa_guard_booking_group_push_batch_v1
before update on public.booking_requests
for each row execute function public.guard_booking_group_push_batch_v1();

create or replace function public.queue_final_booking_group_status_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_cancelled integer := 0;
  v_cancellation_source text := '';
begin
  select
    count(*),
    count(*) filter (where request.status = 'accepted'::public.request_status),
    count(*) filter (where request.status = 'rejected'::public.request_status),
    count(*) filter (where request.status = 'cancelled'::public.request_status),
    max(coalesce(request.cancellation_source, '')) filter (
      where request.status = 'cancelled'::public.request_status
    )
  into v_total, v_accepted, v_rejected, v_cancelled, v_cancellation_source
  from public.booking_requests as request
  where request.workspace_id = new.workspace_id
    and request.appointment_group_id = new.id;

  if v_total > 0 and v_accepted = v_total then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id, new.id, 'accepted'::public.request_status, null
    );
  elsif v_total > 0 and v_rejected = v_total then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id, new.id, 'rejected'::public.request_status, null
    );
  elsif v_total > 0 and v_cancelled = v_total and new.status = 'cancelled' then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id,
      new.id,
      'cancelled'::public.request_status,
      coalesce(nullif(v_cancellation_source, ''), 'salone')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_final_booking_group_status_v1 on public.appointment_groups;
create trigger queue_final_booking_group_status_v1
after update of status, updated_at on public.appointment_groups
for each row execute function public.queue_final_booking_group_status_v1();

notify pgrst, 'reload schema';
