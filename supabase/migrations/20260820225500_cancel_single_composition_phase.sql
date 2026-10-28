-- Removing one technical row from a composition is an appointment update, not
-- a cancellation of the whole customer booking. The remaining rows stay fixed
-- and exactly one customer push describes the updated composition.

create or replace function public.cancel_owner_composition_phase_v1(
  p_appointment_id uuid,
  p_cancellation_event_id text default null,
  p_owner_email citext default null,
  p_salon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_target public.appointments%rowtype;
  v_group public.appointment_groups%rowtype;
  v_request public.booking_requests%rowtype;
  v_remaining_count integer := 0;
  v_timeline text := '';
  v_event_id text;
begin
  if auth.uid() is not null and public.workspace_access_allowed() then
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null then
    select workspace.id
    into v_workspace_id
    from public.workspaces as workspace
    where lower(trim(workspace.owner_email::text)) = lower(trim(coalesce(p_owner_email::text, '')))
      and workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if v_target.id is null then
    raise exception 'appointment_not_found';
  end if;
  if v_target.appointment_group_id is null then
    raise exception 'appointment_not_linked';
  end if;

  select count(*)
  into v_remaining_count
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_target.appointment_group_id;

  if v_remaining_count <= 1 then
    raise exception 'cannot_remove_last_group_phase';
  end if;

  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_target.appointment_group_id;

  if v_target.booking_request_id is not null then
    select request.*
    into v_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = v_target.booking_request_id;
  end if;
  if v_request.id is null then
    select request.*
    into v_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_target.appointment_group_id
    order by request.appointment_group_order, request.created_at, request.id
    limit 1;
  end if;

  perform set_config('salonpro.skip_appointment_delete_client_cancellation', 'on', true);
  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  if v_target.booking_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_salon = true,
        viewed_by_customer = false,
        appointment_group_id = null,
        appointment_group_order = null,
        appointment_group_size = null,
        updated_at = timezone('utc', now())
    where request.workspace_id = v_workspace_id
      and request.id = v_target.booking_request_id;
  end if;

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = v_target.id;

  with ordered as (
    select
      appointment.id,
      row_number() over (
        order by appointment.appointment_group_order, appointment.appointment_time, appointment.id
      ) - 1 as next_order,
      count(*) over () as next_size
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_group_id = v_target.appointment_group_id
  )
  update public.appointments as appointment
  set appointment_group_order = ordered.next_order,
      appointment_group_size = ordered.next_size,
      updated_at = timezone('utc', now())
  from ordered
  where appointment.id = ordered.id;

  with ordered as (
    select
      request.id,
      row_number() over (
        order by request.appointment_group_order, request.appointment_time, request.id
      ) - 1 as next_order,
      count(*) over () as next_size
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_target.appointment_group_id
  )
  update public.booking_requests as request
  set appointment_group_order = ordered.next_order,
      appointment_group_size = ordered.next_size,
      updated_at = timezone('utc', now())
  from ordered
  where request.id = ordered.id;

  select coalesce(
    string_agg(
      trim(appointment.service_name) || ' alle ' ||
      to_char(appointment.appointment_time, 'HH24:MI'),
      ' · ' order by appointment.appointment_group_order, appointment.appointment_time, appointment.id
    ),
    ''
  )
  into v_timeline
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_target.appointment_group_id;

  v_event_id := coalesce(
    nullif(trim(p_cancellation_event_id), ''),
    concat('phase-', v_target.id::text, '-', extract(epoch from clock_timestamp())::bigint::text)
  );

  if v_request.id is not null
    and (nullif(trim(v_request.customer_email::text), '') is not null
      or nullif(trim(v_request.customer_phone), '') is not null)
  then
    perform public.queue_public_customer_push(
      v_workspace_id,
      'appointment_updated'::public.push_event_type,
      'Appuntamento aggiornato dal salone',
      'È stata rimossa la fase ' || trim(v_target.service_name) || '. Restano: ' ||
        v_timeline || '. Data: ' || to_char(v_target.appointment_date, 'DD/MM/YYYY') || '.',
      jsonb_build_object(
        'type', 'appointment_updated',
        'event_type', 'appointment_updated',
        'notificationType', 'appointment_updated',
        '_pushEventType', 'appointment_updated',
        '_dedupeKey', concat_ws('|', v_workspace_id::text, 'composition_phase_removed', v_event_id),
        'appointmentGroupId', v_target.appointment_group_id,
        'appointmentId', v_target.id,
        'appointmentDate', v_target.appointment_date,
        'appointmentTime', v_target.appointment_time,
        'customerName', v_target.customer_name,
        'serviceName', coalesce(nullif(trim(v_group.title), ''), v_target.service_name),
        'removedServiceName', v_target.service_name,
        'bookingTimeline', v_timeline,
        'source', 'owner',
        '_pushAudience', 'public',
        '_pushTarget', 'client',
        'customerEmail', coalesce(v_request.customer_email::text, ''),
        'customerPhone', coalesce(v_request.customer_phone, '')
      ),
      v_request.customer_email,
      v_request.customer_phone
    );
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'appointmentId', v_target.id,
    'appointmentGroupId', v_target.appointment_group_id,
    'removedOnlyPhase', true,
    'remainingAppointmentCount', v_remaining_count - 1,
    'bookingRequestId', v_target.booking_request_id,
    'customerEmail', coalesce(v_request.customer_email::text, ''),
    'customerPhone', coalesce(v_request.customer_phone, '')
  );
end;
$$;

revoke all on function public.cancel_owner_composition_phase_v1(uuid, text, citext, text) from public;
grant execute on function public.cancel_owner_composition_phase_v1(uuid, text, citext, text)
  to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
