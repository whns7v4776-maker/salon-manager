-- Dependency bookings are persisted as two rows whose public card title lives
-- on appointment_groups (for example "Colore + Piega") while the root request
-- stores the atomic service name ("Colore"). Lost-acknowledgement recovery must
-- recognize either representation, otherwise a successful request is reported
-- as uncertain and the customer can submit a duplicate.

create or replace function public.find_public_booking_request_by_composite(
  p_salon_code text,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_service_name text,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_requested_service_name text := lower(trim(coalesce(p_requested_service_name, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_booking_request record;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    return null;
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is null then
    return null;
  end if;

  select
    booking_request.id,
    booking_request.workspace_id,
    booking_request.status,
    booking_request.appointment_date,
    booking_request.appointment_time,
    booking_request.requested_service_name,
    booking_request.customer_email,
    booking_request.customer_phone,
    booking_request.created_at,
    booking_request.updated_at,
    booking_request.cancellation_source,
    booking_request.appointment_group_id
  into v_booking_request
  from public.booking_requests as booking_request
  left join public.appointment_groups as appointment_group
    on appointment_group.workspace_id = booking_request.workspace_id
   and appointment_group.id = booking_request.appointment_group_id
  where booking_request.workspace_id = v_workspace_id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and booking_request.status in ('pending', 'accepted')
    and (
      lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_requested_service_name
      or (
        booking_request.appointment_group_id is not null
        and coalesce(booking_request.appointment_group_order, 0) = 0
        and lower(trim(coalesce(appointment_group.title, ''))) = v_requested_service_name
      )
    )
    and (
      (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
    )
  order by
    case
      when lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_requested_service_name then 0
      else 1
    end,
    case booking_request.status when 'accepted' then 0 when 'pending' then 1 else 2 end,
    booking_request.updated_at desc nulls last,
    booking_request.created_at desc nulls last
  limit 1;

  if v_booking_request.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_booking_request.id,
    'workspaceId', v_booking_request.workspace_id,
    'status', v_booking_request.status,
    'appointmentDate', v_booking_request.appointment_date,
    'appointmentTime', v_booking_request.appointment_time,
    'serviceName', v_booking_request.requested_service_name,
    'appointmentGroupId', v_booking_request.appointment_group_id,
    'customerEmail', coalesce(v_booking_request.customer_email::text, ''),
    'customerPhone', coalesce(v_booking_request.customer_phone, ''),
    'createdAt', v_booking_request.created_at,
    'updatedAt', v_booking_request.updated_at,
    'cancellationSource', v_booking_request.cancellation_source
  );
end;
$$;

grant execute on function public.find_public_booking_request_by_composite(
  text,
  date,
  time,
  text,
  text,
  text
) to anon, authenticated;

-- Remove only the inspected orphaned SalonPro request. It is marked accepted
-- but has no Agenda appointment, so it incorrectly reserves Moira's 10:00-11:00
-- final phase while the Agenda visibly shows that interval as free.
do $cleanup$
declare
  v_workspace_id constant uuid := 'd84f3211-d20f-45a3-9d7f-f551400690fd';
  v_request_id constant uuid := 'b6717394-c269-4658-abe0-2b0f08cef124';
  v_matching_request_count integer := 0;
  v_appointment_count integer := 0;
begin
  select count(*)::integer
  into v_matching_request_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = v_request_id
    and request.status = 'accepted'::public.request_status
    and request.origin = 'frontend'
    and request.appointment_group_id is null
    and request.appointment_date = date '2026-08-24'
    and request.appointment_time = time '09:00'
    and lower(trim(request.requested_service_name)) = 'colore + piega'
    and lower(trim(coalesce(request.requested_operator_name, ''))) = 'moira';

  select count(*)::integer
  into v_appointment_count
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = v_request_id;

  if v_appointment_count <> 0
    or v_matching_request_count not in (0, 1)
    or (
      v_matching_request_count = 0
      and exists (
        select 1
        from public.booking_requests as request
        where request.workspace_id = v_workspace_id
          and request.id = v_request_id
      )
    )
  then
    raise exception
      'orphan_dependency_cleanup_state_changed:matching=%,appointments=%',
      v_matching_request_count,
      v_appointment_count;
  end if;

  if v_matching_request_count = 1 then
    perform set_config('salonpro.skip_booking_request_push', 'on', true);

    delete from public.push_notifications as notification
    where notification.workspace_id = v_workspace_id
      and coalesce(
        notification.payload ->> 'bookingRequestId',
        notification.payload ->> 'requestId',
        ''
      ) = v_request_id::text;

    if to_regclass('public.owner_push_badge_event_ledger') is not null then
      execute $sql$
        delete from public.owner_push_badge_event_ledger as ledger
        where ledger.workspace_id = $1
          and ledger.booking_request_id = $2
      $sql$
      using v_workspace_id, v_request_id::text;
    end if;

    delete from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = v_request_id;

    perform public.sync_client_portal_booking_requests(v_workspace_id);
    perform public.refresh_workspace_agenda_state(v_workspace_id);
  end if;
end;
$cleanup$;

notify pgrst, 'reload schema';
