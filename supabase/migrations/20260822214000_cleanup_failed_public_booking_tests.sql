-- Remove only the two inspected failed test submissions from SalonPro's
-- 24/08/2026 Agenda. Abort if their authoritative shape has changed.

do $cleanup$
declare
  v_workspace_id constant uuid := 'd84f3211-d20f-45a3-9d7f-f551400690fd';
  v_group_id constant uuid := 'ef7d7f51-0378-4364-8e96-f3b76c52f4d8';
  v_group_request_ids constant uuid[] := array[
    'f7a57119-9073-4bf7-af1a-d0632b67f445'::uuid,
    'd0f4a0ff-5d21-4e16-85bb-2742fa8c9d3e'::uuid
  ];
  v_group_appointment_ids constant uuid[] := array[
    '819b9078-0fd5-4645-8f1a-95d996d5a8ba'::uuid,
    'c592831d-226a-4c4b-9b05-d2449cf110f8'::uuid
  ];
  v_single_request_id constant uuid := 'efec28da-50fc-4705-aee4-0f58b1f82f54';
  v_single_appointment_id constant uuid := '6540d8a2-ef80-472e-9de0-56c4d59c40fd';
  v_group_count integer;
  v_group_matching integer;
  v_group_appointments integer;
  v_single_requests integer;
  v_single_appointments integer;
begin
  select count(*)::integer,
         count(*) filter (
           where request.id = any(v_group_request_ids)
             and request.status in (
               'pending'::public.request_status,
               'accepted'::public.request_status
             )
             and request.origin = 'frontend'
         )::integer
  into v_group_count, v_group_matching
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  select count(*)::integer
  into v_group_appointments
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id
    and appointment.id = any(v_group_appointment_ids)
    and appointment.booking_request_id = any(v_group_request_ids);

  select count(*)::integer
  into v_single_requests
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = v_single_request_id
    and request.status = 'accepted'::public.request_status
    and request.origin = 'frontend'
    and request.appointment_group_id is null;

  select count(*)::integer
  into v_single_appointments
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = v_single_appointment_id
    and appointment.booking_request_id = v_single_request_id;

  if v_group_count not in (0, 2)
    or v_group_matching <> v_group_count
    or v_group_appointments not in (0, 2)
    or v_group_appointments <> (
      select count(*)::integer
      from public.appointments as appointment
      where appointment.workspace_id = v_workspace_id
        and appointment.appointment_group_id = v_group_id
    )
    or v_single_requests not in (0, 1)
    or v_single_appointments <> v_single_requests
  then
    raise exception
      'failed_booking_cleanup_state_changed:group=%,matching=%,group_appointments=%,single_requests=%,single_appointments=%',
      v_group_count,
      v_group_matching,
      v_group_appointments,
      v_single_requests,
      v_single_appointments;
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  delete from public.push_notifications as notification
  where notification.workspace_id = v_workspace_id
    and (
      notification.payload ->> 'appointmentGroupId' = v_group_id::text
      or notification.payload ->> 'bookingRequestId' = any(
        array[
          v_group_request_ids[1]::text,
          v_group_request_ids[2]::text,
          v_single_request_id::text
        ]
      )
    );

  if to_regclass('public.owner_push_badge_event_ledger') is not null then
    execute $sql$
      delete from public.owner_push_badge_event_ledger as ledger
      where ledger.workspace_id = $1
        and ledger.booking_request_id = any($2)
    $sql$
    using v_workspace_id,
      array[
        v_group_request_ids[1]::text,
        v_group_request_ids[2]::text,
        v_single_request_id::text
      ];
  end if;

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id
    and appointment.id = any(v_group_appointment_ids)
    and appointment.booking_request_id = any(v_group_request_ids);

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = v_single_appointment_id
    and appointment.booking_request_id = v_single_request_id;

  delete from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and (
      request.id = v_single_request_id
      or (
        request.appointment_group_id = v_group_id
        and request.id = any(v_group_request_ids)
      )
    );

  delete from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id
    and not exists (
      select 1
      from public.booking_requests as request
      where request.appointment_group_id = appointment_group.id
    );

  perform public.refresh_workspace_agenda_state(v_workspace_id);
end;
$cleanup$;

notify pgrst, 'reload schema';
