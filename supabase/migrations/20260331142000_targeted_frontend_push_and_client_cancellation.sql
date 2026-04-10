do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_devices'
      and column_name = 'customer_email'
  ) then
    alter table public.push_devices
      add column customer_email citext;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_devices'
      and column_name = 'customer_phone'
  ) then
    alter table public.push_devices
      add column customer_phone text;
  end if;
end
$$;

create index if not exists push_devices_workspace_customer_target_idx
  on public.push_devices (workspace_id, recipient_kind, customer_email, customer_phone, is_active);

create or replace function public.upsert_public_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null,
  p_recipient_kind text default 'client',
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_recipient_kind text;
  v_customer_email citext;
  v_customer_phone text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  v_recipient_kind := lower(trim(coalesce(p_recipient_kind, 'client')));
  if v_recipient_kind not in ('owner', 'client') then
    v_recipient_kind := 'client';
  end if;

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  insert into public.push_devices (
    workspace_id,
    owner_email,
    expo_push_token,
    platform,
    device_model,
    app_version,
    audience,
    recipient_kind,
    customer_email,
    customer_phone,
    is_active,
    last_seen_at
  )
  values (
    p_workspace_id,
    lower(trim(p_owner_email::text))::citext,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    'public',
    v_recipient_kind,
    v_customer_email,
    v_customer_phone,
    true,
    timezone('utc', now())
  )
  on conflict (expo_push_token)
  do update set
    workspace_id = excluded.workspace_id,
    owner_email = excluded.owner_email,
    platform = excluded.platform,
    device_model = excluded.device_model,
    app_version = excluded.app_version,
    audience = excluded.audience,
    recipient_kind = excluded.recipient_kind,
    customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone,
    is_active = true,
    last_seen_at = timezone('utc', now())
  returning id into v_device_id;

  return v_device_id;
end;
$$;

create or replace function public.queue_public_customer_push(
  p_workspace_id uuid,
  p_event_type public.push_event_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_customer_email citext;
  v_customer_phone text;
begin
  if p_workspace_id is null then
    return 0;
  end if;

  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  select
    p_workspace_id,
    device.id,
    p_event_type,
    p_title,
    p_body,
    p_payload,
    'queued'
  from public.push_devices as device
  where device.workspace_id = p_workspace_id
    and device.recipient_kind = 'client'
    and device.is_active = true
    and (
      (v_customer_email is not null and lower(trim(coalesce(device.customer_email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(device.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.handle_booking_requests_push_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_title text;
  v_body text;
  v_date_label text;
begin
  if tg_op = 'INSERT' then
    if new.origin = 'frontend' and new.status = 'pending' then
      v_title := 'Nuova richiesta prenotazione';
      v_date_label := coalesce(to_char(new.appointment_date, 'DD/MM/YYYY'), '');
      v_body :=
        coalesce(new.customer_name, 'Cliente') ||
        ' - ' ||
        coalesce(new.requested_service_name, 'Servizio') ||
        case
          when v_date_label <> '' and new.appointment_time is not null then
            ' il ' || v_date_label || ' alle ' || to_char(new.appointment_time, 'HH24:MI')
          when v_date_label <> '' then
            ' il ' || v_date_label
          else ''
        end;

      v_payload := jsonb_build_object(
        'type', 'booking_request_created',
        'bookingRequestId', new.id,
        'appointmentDate', new.appointment_date,
        'appointmentTime', new.appointment_time,
        'customerName', new.customer_name,
        'serviceName', new.requested_service_name
      );

      perform public.queue_workspace_push(
        new.workspace_id,
        'booking_request_created',
        v_title,
        v_body,
        v_payload
      );
    end if;

    return new;
  end if;

  return new;
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

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  citext,
  text
) to anon;

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  citext,
  text
) to authenticated;

grant execute on function public.queue_public_customer_push(
  uuid,
  public.push_event_type,
  text,
  text,
  jsonb,
  citext,
  text
) to anon;

grant execute on function public.queue_public_customer_push(
  uuid,
  public.push_event_type,
  text,
  text,
  jsonb,
  citext,
  text
) to authenticated;

grant execute on function public.cancel_public_booking_request(
  text,
  uuid,
  citext,
  text
) to anon;

grant execute on function public.cancel_public_booking_request(
  text,
  uuid,
  citext,
  text
) to authenticated;
