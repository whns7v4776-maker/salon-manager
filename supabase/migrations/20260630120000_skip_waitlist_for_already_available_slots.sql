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
  p_notes text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
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

  if public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_service_name,
    v_requested_operator_id,
    v_requested_operator_name
  ) then
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
$$;

notify pgrst, 'reload schema';
