drop function if exists public.process_public_slot_waitlist(uuid, date, time);

create or replace function public.process_public_slot_waitlist(
  p_workspace_id uuid,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
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
  v_operator_label text;
  v_operator_id_filter text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_operator_name_filter text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
begin
  if p_workspace_id is null then
    return 0;
  end if;

  update public.booking_slot_waitlist
  set
    status = 'notified',
    expires_at = null,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and status = 'expired'
    and notified_at is not null
    and (
      appointment_date > current_date
      or (
        appointment_date = current_date
        and appointment_time > localtime
      )
    )
    and (p_appointment_date is null or appointment_date = p_appointment_date)
    and (p_appointment_time is null or appointment_time = p_appointment_time)
    and (
      v_operator_id_filter is null
      or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
    )
    and (
      v_operator_name_filter is null
      or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
    );

  with expired_rows as (
    update public.booking_slot_waitlist
    set
      status = 'expired',
      updated_at = timezone('utc', now())
    where workspace_id = p_workspace_id
      and status in ('waiting', 'notified')
      and (
        appointment_date < current_date
        or (
          appointment_date = current_date
          and appointment_time <= localtime
        )
      )
      and (p_appointment_date is null or appointment_date = p_appointment_date)
      and (p_appointment_time is null or appointment_time = p_appointment_time)
      and (
        v_operator_id_filter is null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null
        or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
      )
    returning *
  )
  insert into public.booking_slot_waitlist_archive (
    source_waitlist_id,
    workspace_id,
    appointment_date,
    appointment_time,
    requested_service_name,
    requested_duration_minutes,
    requested_operator_id,
    requested_operator_name,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    archived_status,
    archived_reason,
    notified_at,
    expires_at,
    original_created_at,
    original_updated_at,
    archived_at
  )
  select
    expired_rows.id,
    expired_rows.workspace_id,
    expired_rows.appointment_date,
    expired_rows.appointment_time,
    expired_rows.requested_service_name,
    greatest(coalesce(expired_rows.requested_duration_minutes, 60), 1),
    expired_rows.requested_operator_id,
    expired_rows.requested_operator_name,
    coalesce(expired_rows.customer_name, ''),
    coalesce(expired_rows.customer_surname, ''),
    expired_rows.customer_email,
    coalesce(expired_rows.customer_phone, ''),
    expired_rows.customer_instagram,
    expired_rows.notes,
    'expired',
    'expired_by_slot_time',
    expired_rows.notified_at,
    expired_rows.expires_at,
    expired_rows.created_at,
    expired_rows.updated_at,
    expired_rows.updated_at
  from expired_rows
  on conflict do nothing;

  if p_appointment_date is null then
    return 0;
  end if;

  for v_slot in
    select distinct
      appointment_date,
      appointment_time,
      lower(trim(requested_service_name)) as requested_service_key,
      nullif(trim(coalesce(requested_operator_id, '')), '') as requested_operator_id,
      nullif(lower(trim(coalesce(requested_operator_name, ''))), '') as requested_operator_name
    from public.booking_slot_waitlist
    where workspace_id = p_workspace_id
      and status = 'waiting'
      and appointment_date = p_appointment_date
      and (p_appointment_time is null or appointment_time = p_appointment_time)
      and (
        v_operator_id_filter is null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null
        or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
      )
    order by appointment_date asc, appointment_time asc
  loop
    if exists (
      select 1
      from public.booking_slot_waitlist
      where workspace_id = p_workspace_id
        and appointment_date = v_slot.appointment_date
        and appointment_time = v_slot.appointment_time
        and lower(trim(requested_service_name)) = v_slot.requested_service_key
        and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') =
          coalesce(v_slot.requested_operator_id, '')
        and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') =
          coalesce(v_slot.requested_operator_name, '')
        and status = 'notified'
        and (
          appointment_date > current_date
          or (
            appointment_date = current_date
            and appointment_time > localtime
          )
        )
    ) then
      continue;
    end if;

    select waitlist.*
    into v_entry
    from public.booking_slot_waitlist as waitlist
    where waitlist.workspace_id = p_workspace_id
      and waitlist.appointment_date = v_slot.appointment_date
      and waitlist.appointment_time = v_slot.appointment_time
      and lower(trim(waitlist.requested_service_name)) = v_slot.requested_service_key
      and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
        coalesce(v_slot.requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
        coalesce(v_slot.requested_operator_name, '')
      and waitlist.status = 'waiting'
      and public.is_public_booking_slot_available(
        p_workspace_id,
        waitlist.appointment_date,
        waitlist.appointment_time,
        waitlist.requested_duration_minutes,
        waitlist.requested_service_name,
        waitlist.requested_operator_id,
        waitlist.requested_operator_name
      )
    order by waitlist.created_at asc
    for update skip locked
    limit 1;

    if v_entry.id is null then
      continue;
    end if;

    update public.booking_slot_waitlist
    set
      status = 'notified',
      notified_at = timezone('utc', now()),
      expires_at = null,
      updated_at = timezone('utc', now())
    where id = v_entry.id
      and status = 'waiting'
    returning * into v_entry;

    if v_entry.id is null then
      continue;
    end if;

    perform public.archive_public_slot_waitlist_entry(v_entry.id, 'notified', 'slot_available');

    with cancelled_siblings as (
      update public.booking_slot_waitlist
      set
        status = 'cancelled',
        notified_at = null,
        expires_at = null,
        updated_at = timezone('utc', now())
      where workspace_id = p_workspace_id
        and appointment_date = v_entry.appointment_date
        and appointment_time <> v_entry.appointment_time
        and lower(trim(requested_service_name)) = lower(trim(v_entry.requested_service_name))
        and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') =
          coalesce(nullif(trim(coalesce(v_entry.requested_operator_id, '')), ''), '')
        and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') =
          coalesce(nullif(lower(trim(coalesce(v_entry.requested_operator_name, ''))), ''), '')
        and lower(trim(customer_email::text)) = lower(trim(v_entry.customer_email::text))
        and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') =
          regexp_replace(coalesce(v_entry.customer_phone, ''), '\D+', '', 'g')
        and status = 'waiting'
      returning *
    )
    insert into public.booking_slot_waitlist_archive (
      source_waitlist_id,
      workspace_id,
      appointment_date,
      appointment_time,
      requested_service_name,
      requested_duration_minutes,
      requested_operator_id,
      requested_operator_name,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      notes,
      archived_status,
      archived_reason,
      notified_at,
      expires_at,
      original_created_at,
      original_updated_at,
      archived_at
    )
    select
      cancelled_siblings.id,
      cancelled_siblings.workspace_id,
      cancelled_siblings.appointment_date,
      cancelled_siblings.appointment_time,
      cancelled_siblings.requested_service_name,
      greatest(coalesce(cancelled_siblings.requested_duration_minutes, 60), 1),
      cancelled_siblings.requested_operator_id,
      cancelled_siblings.requested_operator_name,
      coalesce(cancelled_siblings.customer_name, ''),
      coalesce(cancelled_siblings.customer_surname, ''),
      cancelled_siblings.customer_email,
      coalesce(cancelled_siblings.customer_phone, ''),
      cancelled_siblings.customer_instagram,
      cancelled_siblings.notes,
      'cancelled',
      'superseded_by_available_slot',
      cancelled_siblings.notified_at,
      cancelled_siblings.expires_at,
      cancelled_siblings.created_at,
      cancelled_siblings.updated_at,
      cancelled_siblings.updated_at
    from cancelled_siblings
    on conflict do nothing;

    v_date_label := to_char(v_entry.appointment_date, 'DD/MM/YYYY');
    v_operator_label := nullif(trim(coalesce(v_entry.requested_operator_name, '')), '');

    perform public.queue_public_customer_push(
      p_workspace_id,
      'custom',
      'Slot disponibile',
      'Si è liberato uno slot per ' || v_entry.requested_service_name ||
        case
          when v_operator_label is not null then ' con ' || v_operator_label
          else ''
        end ||
        ' il ' || v_date_label || ' alle ' || to_char(v_entry.appointment_time, 'HH24:MI') ||
        '. Prenota appena puoi: lo slot è visibile a tutti.',
      jsonb_build_object(
        'type', 'slot_waitlist_available',
        '_dedupeKey', p_workspace_id::text || '|slot_waitlist_available|' || v_entry.id::text,
        'appointmentDate', v_entry.appointment_date,
        'appointmentTime', v_entry.appointment_time,
        'serviceName', v_entry.requested_service_name,
        'operatorId', v_entry.requested_operator_id,
        'operatorName', v_entry.requested_operator_name,
        'waitlistEntryId', v_entry.id
      ),
      v_entry.customer_email,
      v_entry.customer_phone
    );

    v_notified_count := v_notified_count + 1;
  end loop;

  return v_notified_count;
end;
$$;

create or replace function public.handle_backoffice_appointment_delete_client_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_email citext := null;
  v_customer_phone text := null;
  v_customer_instagram text := null;
  v_customer_first_name text;
  v_customer_last_name text;
  v_existing_request_id uuid;
begin
  if old.workspace_id is null then
    return old;
  end if;

  begin
    perform public.process_public_slot_waitlist(
      old.workspace_id,
      old.appointment_date,
      null,
      nullif(trim(coalesce(old.operator_id, '')), ''),
      nullif(trim(coalesce(old.operator_name, '')), '')
    );
  exception
    when others then
      null;
  end;

  v_customer_first_name := split_part(trim(coalesce(old.customer_name, '')), ' ', 1);
  if position(' ' in trim(coalesce(old.customer_name, ''))) > 0 then
    v_customer_last_name := trim(
      substring(
        trim(coalesce(old.customer_name, ''))
        from position(' ' in trim(coalesce(old.customer_name, ''))) + 1
      )
    );
  else
    v_customer_last_name := '';
  end if;

  if old.customer_id is not null then
    select
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.id = old.customer_id
      and customer.workspace_id = old.workspace_id;
  end if;

  if old.booking_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_customer = false,
        requested_operator_id = coalesce(nullif(trim(coalesce(old.operator_id, '')), ''), request.requested_operator_id),
        requested_operator_name = coalesce(nullif(trim(coalesce(old.operator_name, '')), ''), request.requested_operator_name),
        updated_at = timezone('utc', now())
    where request.id = old.booking_request_id
      and request.workspace_id = old.workspace_id
      and (
        request.status is distinct from 'cancelled'::public.request_status
        or coalesce(request.cancellation_source, '') is distinct from 'salone'
        or request.viewed_by_customer is distinct from false
        or coalesce(nullif(trim(coalesce(request.requested_operator_id, '')), ''), '') is distinct from
          coalesce(nullif(trim(coalesce(old.operator_id, '')), ''), '')
        or coalesce(nullif(trim(coalesce(request.requested_operator_name, '')), ''), '') is distinct from
          coalesce(nullif(trim(coalesce(old.operator_name, '')), ''), '')
      );

    return old;
  end if;

  select request.id
  into v_existing_request_id
  from public.booking_requests as request
  where request.workspace_id = old.workspace_id
    and request.appointment_date = old.appointment_date
    and request.appointment_time = old.appointment_time
    and lower(trim(request.requested_service_name)) = lower(trim(old.service_name))
    and coalesce(nullif(trim(coalesce(request.requested_operator_id, '')), ''), '') =
      coalesce(nullif(trim(coalesce(old.operator_id, '')), ''), '')
    and coalesce(nullif(lower(trim(coalesce(request.requested_operator_name, ''))), ''), '') =
      coalesce(nullif(lower(trim(coalesce(old.operator_name, ''))), ''), '')
    and request.status = 'cancelled'::public.request_status
    and coalesce(request.cancellation_source, '') = 'salone'
    and (
      (
        old.customer_id is not null
        and request.customer_id = old.customer_id
      )
      or (
        lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
        lower(trim(coalesce(old.customer_name, '')))
      )
    )
  order by request.updated_at desc nulls last, request.created_at desc nulls last
  limit 1;

  if v_existing_request_id is not null then
    update public.booking_requests
    set viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where id = v_existing_request_id
      and viewed_by_customer is distinct from false;

    return old;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return old;
  end if;

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    requested_operator_id,
    requested_operator_name,
    appointment_date,
    appointment_time,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    origin,
    status,
    cancellation_source,
    viewed_by_salon,
    viewed_by_customer
  ) values (
    old.workspace_id,
    old.customer_id,
    old.service_name,
    old.price,
    old.duration_minutes,
    nullif(trim(coalesce(old.operator_id, '')), ''),
    nullif(trim(coalesce(old.operator_name, '')), ''),
    old.appointment_date,
    old.appointment_time,
    v_customer_first_name,
    v_customer_last_name,
    coalesce(v_customer_email, ''),
    coalesce(v_customer_phone, ''),
    v_customer_instagram,
    'backoffice',
    'cancelled',
    'salone',
    true,
    false
  );

  return old;
end;
$$;

grant execute on function public.process_public_slot_waitlist(uuid, date, time, text, text) to anon;
grant execute on function public.process_public_slot_waitlist(uuid, date, time, text, text) to authenticated;

notify pgrst, 'reload schema';
