create table if not exists public.booking_slot_waitlist (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_date date not null,
  appointment_time time not null,
  requested_service_name text not null,
  requested_duration_minutes integer not null default 60 check (requested_duration_minutes > 0),
  customer_name text not null,
  customer_surname text not null default '',
  customer_email citext not null,
  customer_phone text not null,
  customer_instagram text,
  notes text,
  status text not null default 'waiting'
    check (status in ('waiting', 'notified', 'fulfilled', 'expired', 'cancelled')),
  notified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_slot_waitlist_workspace_slot_idx
  on public.booking_slot_waitlist (workspace_id, appointment_date, appointment_time, created_at);

create index if not exists booking_slot_waitlist_workspace_status_idx
  on public.booking_slot_waitlist (workspace_id, status, expires_at);

create unique index if not exists booking_slot_waitlist_active_customer_unique_idx
  on public.booking_slot_waitlist (
    workspace_id,
    appointment_date,
    appointment_time,
    requested_service_name,
    customer_email,
    customer_phone
  )
  where status in ('waiting', 'notified');

drop trigger if exists set_updated_at_booking_slot_waitlist on public.booking_slot_waitlist;
create trigger set_updated_at_booking_slot_waitlist
before update on public.booking_slot_waitlist
for each row execute procedure public.set_updated_at();

create or replace function public.is_public_booking_slot_available(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with requested_range as (
    select
      p_appointment_date::timestamp + p_appointment_time as start_at,
      p_appointment_date::timestamp + p_appointment_time + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1)) as end_at
  )
  select not exists (
    select 1
    from requested_range rr
    join public.appointments appointment
      on appointment.workspace_id = p_workspace_id
     and appointment.appointment_date = p_appointment_date
    where (p_appointment_date::timestamp + appointment.appointment_time) < rr.end_at
      and (
        (p_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => coalesce(appointment.duration_minutes, 60))
      ) > rr.start_at
  )
  and not exists (
    select 1
    from requested_range rr
    join public.booking_requests booking_request
      on booking_request.workspace_id = p_workspace_id
     and booking_request.appointment_date = p_appointment_date
     and booking_request.status in ('pending', 'accepted')
    where (p_appointment_date::timestamp + booking_request.appointment_time) < rr.end_at
      and (
        (p_appointment_date::timestamp + booking_request.appointment_time)
        + make_interval(mins => coalesce(booking_request.requested_duration_minutes, 60))
      ) > rr.start_at
  );
$$;

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
        waitlist.requested_duration_minutes
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

create or replace function public.join_public_slot_waitlist(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_existing public.booking_slot_waitlist%rowtype;
  v_entry public.booking_slot_waitlist%rowtype;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_surname := trim(coalesce(p_customer_surname, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_service_name := trim(coalesce(p_requested_service_name, ''));

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  if v_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  select waitlist.*
  into v_existing
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and waitlist.status in ('waiting', 'notified')
  order by waitlist.created_at asc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'waitlistEntryId', v_existing.id,
      'status', v_existing.status,
      'alreadyJoined', true
    );
  end if;

  insert into public.booking_slot_waitlist (
    workspace_id,
    appointment_date,
    appointment_time,
    requested_service_name,
    requested_duration_minutes,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    status
  )
  values (
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    v_service_name,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_customer_name,
    v_customer_surname,
    v_customer_email,
    v_customer_phone,
    v_customer_instagram,
    nullif(trim(coalesce(p_notes, '')), ''),
    'waiting'
  )
  returning * into v_entry;

  perform public.process_public_slot_waitlist(v_workspace.id, p_appointment_date, p_appointment_time);

  select waitlist.*
  into v_entry
  from public.booking_slot_waitlist as waitlist
  where waitlist.id = v_entry.id;

  return jsonb_build_object(
    'waitlistEntryId', v_entry.id,
    'status', v_entry.status,
    'alreadyJoined', false,
    'expiresAt', v_entry.expires_at
  );
end;
$$;

create or replace function public.get_public_slot_waitlist_entries(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_appointment_date date default null,
  p_requested_service_name text default null
)
returns setof public.booking_slot_waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select waitlist.*
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status in ('waiting', 'notified')
    and (p_appointment_date is null or waitlist.appointment_date = p_appointment_date)
    and (
      p_requested_service_name is null
      or lower(trim(waitlist.requested_service_name)) = lower(trim(p_requested_service_name))
    )
    and (
      (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
  order by waitlist.created_at asc;
end;
$$;

drop function if exists public.create_public_booking_request(
  text,
  text,
  numeric,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
);

create or replace function public.create_public_booking_request(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_booking_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_notes text;
  v_requested_duration integer;
  v_requested_price numeric(10,2);
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_surname := trim(coalesce(p_customer_surname, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_service_name := trim(coalesce(p_requested_service_name, ''));
  v_notes := nullif(trim(coalesce(p_notes, '')), '');
  v_requested_duration := greatest(coalesce(p_requested_duration_minutes, 60), 1);
  v_requested_price := greatest(coalesce(p_requested_price, 0), 0);

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    v_requested_duration
  ) then
    raise exception 'slot_unavailable';
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      or regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_customer_phone
      or lower(trim(coalesce(customer.full_name, ''))) = lower(trim(concat_ws(' ', v_customer_name, v_customer_surname)))
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      workspace_id,
      full_name,
      phone,
      email,
      instagram,
      note,
      source,
      viewed_by_salon
    )
    values (
      v_workspace.id,
      trim(concat_ws(' ', v_customer_name, v_customer_surname)),
      v_customer_phone,
      v_customer_email,
      v_customer_instagram,
      coalesce(v_notes, ''),
      'frontend',
      false
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      full_name = trim(concat_ws(' ', v_customer_name, v_customer_surname)),
      phone = v_customer_phone,
      email = v_customer_email,
      instagram = coalesce(v_customer_instagram, instagram),
      note = coalesce(v_notes, note),
      source = 'frontend',
      updated_at = timezone('utc', now())
    where id = v_customer_id;
  end if;

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    appointment_date,
    appointment_time,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    origin,
    status,
    viewed_by_customer
  )
  values (
    v_workspace.id,
    v_customer_id,
    v_service_name,
    v_requested_price,
    v_requested_duration,
    p_appointment_date,
    p_appointment_time,
    v_customer_name,
    v_customer_surname,
    v_customer_email,
    v_customer_phone,
    v_customer_instagram,
    v_notes,
    'frontend',
    'pending',
    false
  )
  returning * into v_booking_request;

  update public.booking_slot_waitlist
  set
    status = 'fulfilled',
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace.id
    and appointment_date = p_appointment_date
    and appointment_time = p_appointment_time
    and lower(trim(requested_service_name)) = lower(v_service_name)
    and lower(trim(customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and status in ('waiting', 'notified', 'expired');

  return v_booking_request;
end;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal public.client_portals%rowtype;
begin
  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.salon_code = lower(trim(p_salon_code))
    and portal.subscription_status = 'active'
  limit 1;

  if v_portal.workspace_id is null then
    return null;
  end if;

  perform public.process_public_slot_waitlist(v_portal.workspace_id, null, null);

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_portal.workspace_id
  limit 1;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', v_portal.salon_name,
      'salonNameDisplayStyle', v_portal.salon_name_display_style,
      'salonNameFontVariant', v_portal.salon_name_font_variant,
      'businessPhone', v_portal.business_phone,
      'activityCategory', v_portal.activity_category,
      'salonAddress', v_portal.salon_address,
      'streetType', v_portal.street_type,
      'streetName', v_portal.street_name,
      'streetNumber', v_portal.street_number,
      'city', v_portal.city,
      'postalCode', v_portal.postal_code,
      'subscriptionPlan', v_portal.subscription_plan,
      'subscriptionStatus', v_portal.subscription_status,
      'createdAt', v_portal.created_at,
      'updatedAt', v_portal.updated_at
    ),
    'clienti', v_portal.clienti,
    'appuntamenti', v_portal.appuntamenti,
    'servizi', v_portal.servizi,
    'operatori', v_portal.operatori,
    'richiestePrenotazione', v_portal.richieste_prenotazione,
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

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
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

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
        and regexp_replace(coalesce(br.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  update public.booking_requests
  set
    status = 'cancelled',
    cancellation_source = 'cliente',
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where id = v_request.id;

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

  perform public.process_public_slot_waitlist(v_workspace_id, v_request.appointment_date, v_request.appointment_time);

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer) to anon;
grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer) to authenticated;

grant execute on function public.process_public_slot_waitlist(uuid, date, time) to anon;
grant execute on function public.process_public_slot_waitlist(uuid, date, time) to authenticated;

grant execute on function public.join_public_slot_waitlist(
  text,
  text,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to anon;

grant execute on function public.join_public_slot_waitlist(
  text,
  text,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to authenticated;

grant execute on function public.get_public_slot_waitlist_entries(
  text,
  citext,
  text,
  date,
  text
) to anon;

grant execute on function public.get_public_slot_waitlist_entries(
  text,
  citext,
  text,
  date,
  text
) to authenticated;

grant execute on function public.create_public_booking_request(
  text,
  text,
  numeric,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to anon;

grant execute on function public.create_public_booking_request(
  text,
  text,
  numeric,
  integer,
  date,
  time,
  text,
  text,
  citext,
  text,
  text,
  text
) to authenticated;

grant execute on function public.get_client_portal_snapshot(text) to anon;
grant execute on function public.get_client_portal_snapshot(text) to authenticated;
