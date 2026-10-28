create or replace function public.create_owner_appointment_ultralight_v2(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_required_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_booking_request_id uuid;
  v_appointment_id uuid;
  v_normalized_customer_name text;
  v_normalized_customer_phone text;
  v_normalized_customer_email citext;
  v_normalized_customer_instagram text;
  v_normalized_customer_note text;
  v_normalized_customer_source text;
  v_normalized_service_name text;
  v_normalized_salon_code text;
  v_normalized_operator_id text;
  v_normalized_operator_name text;
  v_required_role text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_normalized_salon_code := nullif(lower(trim(coalesce(p_salon_code, ''))), '');

  if v_normalized_salon_code is not null then
    select w.id
    into v_workspace_id
    from public.workspaces as w
    join public.workspace_members as wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
      and w.slug = v_normalized_salon_code
      and w.subscription_status in ('demo', 'active')
    limit 1;
  else
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_normalized_customer_name := trim(coalesce(p_customer_name, ''));
  v_normalized_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_normalized_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_normalized_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_normalized_customer_note := trim(coalesce(p_customer_note, ''));
  v_normalized_customer_source := case when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend' else 'salon' end;
  v_normalized_service_name := trim(coalesce(p_service_name, ''));
  v_normalized_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_normalized_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');
  v_required_role := nullif(regexp_replace(trim(coalesce(p_required_role, '')), '\s+', ' ', 'g'), '');

  if v_normalized_customer_name = '' then
    raise exception 'customer_name_required';
  end if;
  if v_normalized_service_name = '' then
    raise exception 'service_name_required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid_duration';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);
  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if p_create_booking_request then
    insert into public.booking_requests (
      workspace_id,
      customer_id,
      requested_service_name,
      requested_price,
      requested_duration_minutes,
      required_role,
      appointment_date,
      appointment_time,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      notes,
      requested_operator_id,
      requested_operator_name,
      origin,
      status,
      cancellation_source,
      viewed_by_customer
    ) values (
      v_workspace_id,
      null,
      v_normalized_service_name,
      p_price,
      p_duration_minutes,
      v_required_role,
      p_appointment_date,
      p_appointment_time,
      split_part(v_normalized_customer_name, ' ', 1),
      case when position(' ' in v_normalized_customer_name) > 0 then trim(substring(v_normalized_customer_name from position(' ' in v_normalized_customer_name) + 1)) else '' end,
      coalesce(v_normalized_customer_email, ''::citext),
      coalesce(v_normalized_customer_phone, ''),
      v_normalized_customer_instagram,
      nullif(v_normalized_customer_note, ''),
      v_normalized_operator_id,
      v_normalized_operator_name,
      (case when v_normalized_customer_source = 'frontend' then 'frontend' else 'backoffice' end)::public.request_origin,
      'accepted',
      null,
      false
    ) returning id into v_booking_request_id;
  end if;

  insert into public.appointments (
    workspace_id,
    customer_id,
    booking_request_id,
    appointment_date,
    appointment_time,
    customer_name,
    service_name,
    price,
    duration_minutes,
    required_role,
    operator_id,
    operator_name,
    completed,
    no_show,
    cashed_in,
    created_by
  ) values (
    v_workspace_id,
    null,
    v_booking_request_id,
    p_appointment_date,
    p_appointment_time,
    v_normalized_customer_name,
    v_normalized_service_name,
    p_price,
    p_duration_minutes,
    v_required_role,
    v_normalized_operator_id,
    v_normalized_operator_name,
    false,
    false,
    false,
    'backoffice'
  ) returning id into v_appointment_id;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'bookingRequestId', v_booking_request_id,
    'customerId', null,
    'workspaceId', v_workspace_id
  );
end;
$$;
