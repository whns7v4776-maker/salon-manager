create or replace function public.shorten_owner_appointment_duration(
  p_appointment_id uuid,
  p_next_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_next_end_at timestamp;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if p_appointment_id is null or p_next_duration_minutes is null then
    raise exception 'invalid_arguments';
  end if;

  -- Serializza le modifiche dell'agenda con le prenotazioni pubbliche dello stesso giorno.
  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_appointment.appointment_date::text)
  );

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if p_next_duration_minutes < 5 or p_next_duration_minutes > 720 then
    raise exception 'invalid_duration';
  end if;

  if p_next_duration_minutes = greatest(coalesce(v_appointment.duration_minutes, 60), 1) then
    return jsonb_build_object(
      'appointmentId', v_appointment.id,
      'bookingRequestId', v_appointment.booking_request_id,
      'previousDurationMinutes', greatest(coalesce(v_appointment.duration_minutes, 60), 1),
      'nextDurationMinutes', p_next_duration_minutes,
      'changed', false
    );
  end if;

  -- Questa operazione e volutamente solo riduttiva: accorciare non puo creare
  -- sovrapposizioni tra operatori, mestieri, servizi o macchinari.
  if p_next_duration_minutes > greatest(coalesce(v_appointment.duration_minutes, 60), 1) then
    raise exception 'duration_can_only_be_shortened';
  end if;

  v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);

  select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
  into v_slot_interval
  from jsonb_array_elements(coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)) as date_interval
  where date_interval ->> 'date' = v_appointment.appointment_date::text
  limit 1;

  v_slot_interval := coalesce(
    v_slot_interval,
    nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
    30
  );

  if v_slot_interval < 5 or v_slot_interval > 300 or v_slot_interval % 5 <> 0 then
    v_slot_interval := 30;
  end if;

  if (
    greatest(coalesce(v_appointment.duration_minutes, 60), 1)
    - p_next_duration_minutes
  ) % v_slot_interval <> 0 then
    raise exception 'invalid_duration_step';
  end if;

  v_next_end_at :=
    v_appointment.appointment_date::timestamp
    + v_appointment.appointment_time
    + make_interval(mins => p_next_duration_minutes);

  if v_next_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  update public.appointments
  set duration_minutes = p_next_duration_minutes,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = p_next_duration_minutes,
        updated_at = timezone('utc', now())
    where workspace_id = v_workspace_id
      and id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', v_appointment.booking_request_id,
    'previousDurationMinutes', greatest(coalesce(v_appointment.duration_minutes, 60), 1),
    'nextDurationMinutes', p_next_duration_minutes,
    'slotIntervalMinutes', v_slot_interval,
    'changed', true
  );
end;
$$;

revoke all on function public.shorten_owner_appointment_duration(uuid, integer) from public;
grant execute on function public.shorten_owner_appointment_duration(uuid, integer) to authenticated;

create or replace function public.prevent_public_customer_time_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_start_at timestamp;
  v_new_end_at timestamp;
  v_new_email citext;
  v_new_phone text;
begin
  if new.origin::text <> 'frontend' or new.status::text not in ('pending', 'accepted') then
    return new;
  end if;

  v_new_email := nullif(lower(trim(coalesce(new.customer_email::text, ''))), '')::citext;
  v_new_phone := nullif(regexp_replace(coalesce(new.customer_phone, ''), '\D+', '', 'g'), '');
  v_new_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_new_end_at :=
    new.appointment_date::timestamp
    + new.appointment_time
    + make_interval(mins => greatest(coalesce(new.requested_duration_minutes, 60), 1));

  perform pg_advisory_xact_lock(
    hashtext(new.workspace_id::text || ':' || new.appointment_date::text)
  );

  if exists (
    select 1
    from public.booking_requests as existing_request
    where existing_request.workspace_id = new.workspace_id
      and existing_request.id is distinct from new.id
      and existing_request.status::text in ('pending', 'accepted')
      and existing_request.appointment_date = new.appointment_date
      and (
        (new.customer_id is not null and existing_request.customer_id = new.customer_id)
        or (v_new_email is not null and existing_request.customer_email = v_new_email)
        or (
          v_new_phone is not null
          and regexp_replace(coalesce(existing_request.customer_phone, ''), '\D+', '', 'g') =
            v_new_phone
        )
      )
      and (existing_request.appointment_date::timestamp + existing_request.appointment_time) <
        v_new_end_at
      and (
        existing_request.appointment_date::timestamp
        + existing_request.appointment_time
        + make_interval(mins => greatest(coalesce(existing_request.requested_duration_minutes, 60), 1))
      ) > v_new_start_at
  ) then
    raise exception 'customer_time_conflict';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    left join public.customers as customer
      on customer.workspace_id = appointment.workspace_id
      and customer.id = appointment.customer_id
    where appointment.workspace_id = new.workspace_id
      and appointment.booking_request_id is distinct from new.id
      and appointment.appointment_date = new.appointment_date
      and (
        (new.customer_id is not null and appointment.customer_id = new.customer_id)
        or (v_new_email is not null and customer.email = v_new_email)
        or (
          v_new_phone is not null
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_new_phone
        )
      )
      and (appointment.appointment_date::timestamp + appointment.appointment_time) <
        v_new_end_at
      and (
        appointment.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_new_start_at
  ) then
    raise exception 'customer_time_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_prevent_public_customer_time_overlap
  on public.booking_requests;

create trigger booking_requests_prevent_public_customer_time_overlap
before insert
on public.booking_requests
for each row
execute function public.prevent_public_customer_time_overlap();
