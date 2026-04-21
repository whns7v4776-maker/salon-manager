create or replace function public.process_public_slot_waitlist(
  p_workspace_id uuid,
  p_appointment_date date default null,
  p_appointment_time time default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_entry public.booking_slot_waitlist%rowtype;
  v_notified_count integer := 0;
  v_date_label text;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  update public.booking_slot_waitlist
  set
    status = 'expired',
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and status = 'notified'
    and expires_at is not null
    and expires_at <= timezone('utc', now())
    and (p_appointment_date is null or appointment_date = p_appointment_date)
    and (p_appointment_time is null or appointment_time = p_appointment_time);

  for v_slot in
    select distinct appointment_date, appointment_time
    from public.booking_slot_waitlist
    where workspace_id = p_workspace_id
      and status in ('waiting', 'notified')
      and (p_appointment_date is null or appointment_date = p_appointment_date)
      and (p_appointment_time is null or appointment_time = p_appointment_time)
    order by appointment_date asc, appointment_time asc
  loop
    if exists (
      select 1
      from public.booking_slot_waitlist
      where workspace_id = p_workspace_id
        and appointment_date = v_slot.appointment_date
        and appointment_time = v_slot.appointment_time
        and status = 'notified'
        and expires_at is not null
        and expires_at > timezone('utc', now())
    ) then
      continue;
    end if;

    select waitlist.*
    into v_entry
    from public.booking_slot_waitlist as waitlist
    where waitlist.workspace_id = p_workspace_id
      and waitlist.appointment_date = v_slot.appointment_date
      and waitlist.appointment_time = v_slot.appointment_time
      and waitlist.status = 'waiting'
      and public.is_public_booking_slot_available(
        p_workspace_id,
        waitlist.appointment_date,
        waitlist.appointment_time,
        waitlist.requested_duration_minutes,
        waitlist.requested_service_name,
        null,
        null
      )
    order by waitlist.created_at asc
    limit 1;

    if v_entry.id is null then
      continue;
    end if;

    v_date_label := to_char(v_entry.appointment_date, 'DD/MM/YYYY');

    perform public.queue_public_customer_push(
      p_workspace_id,
      'custom',
      'Slot disponibile',
      'Si e liberato uno slot per ' || v_entry.requested_service_name || ' il ' || v_date_label || ' alle ' ||
        to_char(v_entry.appointment_time, 'HH24:MI') || '. Prenota appena puoi: lo slot e visibile a tutti.',
      jsonb_build_object(
        'type', 'slot_waitlist_available',
        'appointmentDate', v_entry.appointment_date,
        'appointmentTime', v_entry.appointment_time,
        'serviceName', v_entry.requested_service_name,
        'waitlistEntryId', v_entry.id
      ),
      v_entry.customer_email,
      v_entry.customer_phone
    );

    update public.booking_slot_waitlist
    set
      status = 'notified',
      notified_at = timezone('utc', now()),
      expires_at = timezone('utc', now()) + interval '10 minutes',
      updated_at = timezone('utc', now())
    where id = v_entry.id;

    v_notified_count := v_notified_count + 1;
  end loop;

  return v_notified_count;
end;
$$;
