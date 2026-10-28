-- Preserve the selected booking plan; use the same availability RPCs as booking.
alter table public.booking_slot_waitlist add column if not exists booking_plan jsonb;

create or replace function public.is_waitlist_plan_available_v1(p_entry public.booking_slot_waitlist)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_plan jsonb := p_entry.booking_plan;
  v_result jsonb;
  v_intervals jsonb;
  v_slot text := to_char(p_entry.appointment_time, 'HH24:MI');
  v_slug text;
  v_operator_id text := case when p_entry.requested_operator_id like 'salon-capacity::%' then null else p_entry.requested_operator_id end;
  v_name text := trim(p_entry.customer_name || ' ' || p_entry.customer_surname);
begin
  if v_plan is null then
    return public.is_public_booking_slot_available(p_entry.workspace_id, p_entry.appointment_date,
      p_entry.appointment_time, p_entry.requested_duration_minutes, p_entry.requested_service_name,
      v_operator_id, p_entry.requested_operator_name);
  end if;
  if v_plan->>'version' <> '1' then return false; end if;
  select slug into v_slug from public.workspaces where id=p_entry.workspace_id;
  if nullif(v_plan->>'compositionId','') is not null then
    v_result := public.get_public_composition_slot_availability_batch_v1(v_slug,
      (v_plan->>'compositionId')::uuid, p_entry.appointment_date, jsonb_build_array(v_slot),
      p_entry.customer_email::text, p_entry.customer_phone,
      v_operator_id, p_entry.requested_operator_name);
  elsif nullif(v_plan->>'dependencyServiceId','') is not null then
    v_result := public.get_public_dependency_slot_availability_batch_v1(v_slug,
      p_entry.requested_service_name, (v_plan->>'dependencyServiceId')::uuid, p_entry.appointment_date,
      jsonb_build_array(v_slot), p_entry.customer_email::text, p_entry.customer_phone,
      v_operator_id, p_entry.requested_operator_name);
  else
    if jsonb_typeof(v_plan->'intervals') <> 'array' or jsonb_array_length(v_plan->'intervals') not between 1 and 32 then
      return false;
    end if;
    if exists(select 1 from jsonb_array_elements(v_plan->'intervals') i
      where (i->>'startOffsetMinutes')::integer < 0 or (i->>'durationMinutes')::integer <= 0
        or extract(epoch from p_entry.appointment_time)/60 + (i->>'startOffsetMinutes')::integer + (i->>'durationMinutes')::integer > 1440) then
      return false;
    end if;
    select jsonb_agg(jsonb_build_object('time',to_char(p_entry.appointment_time + make_interval(mins=>(i->>'startOffsetMinutes')::integer),'HH24:MI'),
      'durationMinutes',(i->>'durationMinutes')::integer)) into v_intervals from jsonb_array_elements(v_plan->'intervals') i;
    if coalesce((v_plan->>'phased')::boolean,false) then
      v_result := public.get_public_phased_booking_slot_availability_batch_v4(
        p_entry.workspace_id, p_entry.appointment_date, jsonb_build_array(jsonb_build_object('slotTime',v_slot,'intervals',v_intervals)),
        p_entry.requested_service_name, v_plan->>'requiredRole', v_operator_id, p_entry.requested_operator_name,
        coalesce((v_plan->>'allowSplitOperators')::boolean,true),p_entry.customer_email::text,p_entry.customer_phone,v_name,p_entry.requested_duration_minutes);
    else
      v_result := public.get_public_booking_slot_availability_batch_v3(
        p_entry.workspace_id, p_entry.appointment_date, jsonb_build_array(jsonb_build_object('slotTime',v_slot,'intervals',v_intervals)),
        p_entry.requested_service_name, v_plan->>'requiredRole', v_operator_id, p_entry.requested_operator_name,
        p_entry.customer_email::text,p_entry.customer_phone,v_name,p_entry.requested_duration_minutes);
    end if;
  end if;
  return coalesce((v_result->>v_slot)::boolean,false);
exception when invalid_text_representation or raise_exception then
  -- A removed/changed catalog selection cannot generate a false availability alert.
  return false;
end;
$$;
revoke all on function public.is_waitlist_plan_available_v1(public.booking_slot_waitlist) from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.join_public_slot_waitlist_v2(p_salon_code text, p_requested_service_name text, p_requested_duration_minutes integer DEFAULT 60, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_customer_name text DEFAULT NULL::text, p_customer_surname text DEFAULT ''::text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text, p_booking_plan jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace public.workspaces%rowtype;
  v_probe public.booking_slot_waitlist%rowtype;
  v_existing public.booking_slot_waitlist%rowtype;
  v_reusable public.booking_slot_waitlist%rowtype;
  v_entry public.booking_slot_waitlist%rowtype;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_requested_operator_id text;
  v_requested_operator_name text;
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
  v_requested_operator_id := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_requested_operator_name, '')), '');

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

  if p_booking_plan is null or p_booking_plan->>'version' is distinct from '1' or coalesce(p_requested_duration_minutes,0) not between 1 and 1440 then
    raise exception 'waitlist_booking_plan_required';
  end if;
  v_probe.workspace_id := v_workspace.id;
  v_probe.appointment_date := p_appointment_date;
  v_probe.appointment_time := p_appointment_time;
  v_probe.requested_duration_minutes := p_requested_duration_minutes;
  v_probe.requested_service_name := v_service_name;
  v_probe.requested_operator_id := v_requested_operator_id;
  v_probe.requested_operator_name := v_requested_operator_name;
  v_probe.customer_email := v_customer_email;
  v_probe.customer_phone := v_customer_phone;
  v_probe.customer_name := v_customer_name;
  v_probe.customer_surname := v_customer_surname;
  v_probe.booking_plan := p_booking_plan;
  if public.is_waitlist_plan_available_v1(v_probe) then
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and booking_plan is not distinct from p_booking_plan
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', null,
      'status', 'available',
      'alreadyJoined', false,
      'slotAlreadyAvailable', true
    );
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
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
    and waitlist.status = 'waiting'
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  if v_existing.id is not null then
    if v_existing.booking_plan is distinct from p_booking_plan then
      raise exception 'waitlist_existing_plan_differs';
    end if;
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and id <> v_existing.id
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', v_existing.id,
      'status', v_existing.status,
      'alreadyJoined', true
    );
  end if;

  select waitlist.*
  into v_reusable
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  update public.booking_slot_waitlist
  set
    status = 'cancelled',
    expires_at = null,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace.id
    and appointment_date = p_appointment_date
    and appointment_time = p_appointment_time
    and lower(trim(requested_service_name)) = lower(v_service_name)
    and lower(trim(customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
    and (v_reusable.id is null or id <> v_reusable.id)
    and status in ('waiting', 'notified', 'expired');

  if v_reusable.id is not null then
    update public.booking_slot_waitlist
    set
      booking_plan = p_booking_plan,
      requested_duration_minutes = greatest(coalesce(p_requested_duration_minutes, 60), 1),
      requested_operator_id = v_requested_operator_id,
      requested_operator_name = v_requested_operator_name,
      customer_name = v_customer_name,
      customer_surname = v_customer_surname,
      customer_email = v_customer_email,
      customer_phone = v_customer_phone,
      customer_instagram = v_customer_instagram,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = 'waiting',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where id = v_reusable.id
    returning * into v_entry;
  else
    insert into public.booking_slot_waitlist (
      booking_plan,
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
      status,
      notified_at,
      expires_at
    )
    values (
      p_booking_plan,
      v_workspace.id,
      p_appointment_date,
      p_appointment_time,
      v_service_name,
      greatest(coalesce(p_requested_duration_minutes, 60), 1),
      v_requested_operator_id,
      v_requested_operator_name,
      v_customer_name,
      v_customer_surname,
      v_customer_email,
      v_customer_phone,
      v_customer_instagram,
      nullif(trim(coalesce(p_notes, '')), ''),
      'waiting',
      null,
      null
    )
    returning * into v_entry;
  end if;

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
$function$
;
revoke all on function public.join_public_slot_waitlist_v2(text,text,integer,date,time,text,text,citext,text,text,text,text,text,jsonb) from public;
grant execute on function public.join_public_slot_waitlist_v2(text,text,integer,date,time,text,text,citext,text,text,text,text,text,jsonb) to anon,authenticated;
CREATE OR REPLACE FUNCTION public.process_public_slot_waitlist(p_workspace_id uuid, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
    and (
      v_operator_id_filter is null or booking_plan is not null
      or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
    )
    and (
      v_operator_name_filter is null or booking_plan is not null
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
      and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
      and (
        v_operator_id_filter is null or booking_plan is not null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null or booking_plan is not null
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
      and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
      and (
        v_operator_id_filter is null or booking_plan is not null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null or booking_plan is not null
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
      and public.is_waitlist_plan_available_v1(waitlist)
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
      'Si è liberato uno slot per ' || coalesce(nullif(v_entry.booking_plan->>'label',''),v_entry.requested_service_name) ||
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
        'bookingPlan', v_entry.booking_plan,
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
$function$
;
alter table public.booking_slot_waitlist_archive add column if not exists booking_plan jsonb;
create or replace function public.snapshot_waitlist_booking_plan_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.booking_plan is null and new.source_waitlist_id is not null then
    select booking_plan into new.booking_plan from public.booking_slot_waitlist where id=new.source_waitlist_id;
  end if;
  return new;
end;
$$;
revoke all on function public.snapshot_waitlist_booking_plan_v1() from public,anon,authenticated;
drop trigger if exists snapshot_waitlist_booking_plan on public.booking_slot_waitlist_archive;
create trigger snapshot_waitlist_booking_plan before insert on public.booking_slot_waitlist_archive
for each row execute function public.snapshot_waitlist_booking_plan_v1();

create or replace function public.get_public_customer_waitlist_alerts_v2(p_salon_code text,p_customer_email citext default null,p_customer_phone text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('booking_plan',case when a.is_archived then (select ar.booking_plan from public.booking_slot_waitlist_archive ar where ar.source_waitlist_id=a.id and ar.archived_at=a.archived_at limit 1) else w.booking_plan end)), '[]'::jsonb)
 from public.get_public_customer_waitlist_alerts(p_salon_code,p_customer_email,p_customer_phone) a
 left join public.booking_slot_waitlist w on w.id=a.id;
$$;
revoke all on function public.get_public_customer_waitlist_alerts_v2(text,citext,text) from public;
grant execute on function public.get_public_customer_waitlist_alerts_v2(text,citext,text) to anon,authenticated;
notify pgrst, 'reload schema';
