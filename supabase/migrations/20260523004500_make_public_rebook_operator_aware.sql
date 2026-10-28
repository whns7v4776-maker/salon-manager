create or replace function public.same_public_booking_operator_identity(
  p_left_operator_id text,
  p_left_operator_name text,
  p_right_operator_id text,
  p_right_operator_name text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when nullif(trim(coalesce(p_left_operator_id, '')), '') is not null
       and nullif(trim(coalesce(p_right_operator_id, '')), '') is not null
        then trim(coalesce(p_left_operator_id, '')) = trim(coalesce(p_right_operator_id, ''))
      when nullif(lower(trim(coalesce(p_left_operator_name, ''))), '') is not null
       and nullif(lower(trim(coalesce(p_right_operator_name, ''))), '') is not null
        then lower(trim(coalesce(p_left_operator_name, ''))) =
             lower(trim(coalesce(p_right_operator_name, '')))
      else
        coalesce(nullif(trim(coalesce(p_left_operator_id, '')), ''), '') =
          coalesce(nullif(trim(coalesce(p_right_operator_id, '')), ''), '')
        and
        coalesce(nullif(lower(trim(coalesce(p_left_operator_name, ''))), ''), '') =
          coalesce(nullif(lower(trim(coalesce(p_right_operator_name, ''))), ''), '')
    end;
$$;

create or replace function public.create_public_booking_request_ultralight_v2(
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
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_booking_request public.booking_requests%rowtype;
  v_existing_active_request public.booking_requests%rowtype;
  v_existing_terminal_request public.booking_requests%rowtype;
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
  v_requested_role text := '';
  v_requested_operator_id text;
  v_requested_operator_name text;
  v_customer_full_name text;
  v_owner_payload jsonb := '{}'::jsonb;
  v_portal_services jsonb := '[]'::jsonb;
  v_max_future_appointments integer;
  v_max_future_appointments_mode text := 'total_future';
  v_max_daily_appointments integer;
  v_existing_future_bookings integer := 0;
  v_existing_daily_bookings integer := 0;
  v_first_daily_conflicting_service text;
  v_exact_daily_service_conflict boolean := false;
  v_has_unlimited_future_limit boolean := false;
  v_has_unlimited_daily_limit boolean := false;
  v_active_request_created_at timestamptz;
  v_terminal_request_created_at timestamptz;
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
  v_requested_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');
  v_requested_role := public.resolve_public_booking_limit_role(
    '[]'::jsonb,
    v_service_name,
    p_required_role
  );
  v_customer_full_name := trim(concat_ws(' ', v_customer_name, v_customer_surname));

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

  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_client_portal_snapshot_sync', 'on', true);

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  select
    customer.max_future_appointments,
    coalesce(customer.max_future_appointments_mode, 'total_future'),
    customer.max_daily_appointments
  into
    v_max_future_appointments,
    v_max_future_appointments_mode,
    v_max_daily_appointments
  from public.customers as customer
  where customer.workspace_id = v_workspace.id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by
    case
      when v_customer_email is not null and customer.email = v_customer_email
       and v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone
        then 1000
      when v_customer_email is not null and customer.email = v_customer_email
        then 700
      when v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone
        then 650
      else 0
    end desc,
    case
      when lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
        then 120
      else 0
    end desc,
    case
      when coalesce(customer.source, 'salon') = 'salon'
        then 40
      else 0
    end desc,
    case
      when customer.max_future_appointments is not null or customer.max_daily_appointments is not null
        then 20
      else 0
    end desc,
    coalesce(customer.updated_at, customer.created_at) desc,
    customer.created_at desc
  limit 1;

  v_has_unlimited_future_limit := v_max_future_appointments is null;
  v_has_unlimited_daily_limit := v_max_daily_appointments is null;

  if v_requested_role = '' or v_max_daily_appointments is not null then
    v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
    v_portal_services := coalesce(v_owner_payload -> 'servizi', '[]'::jsonb);
    v_requested_role := public.resolve_public_booking_limit_role(
      v_portal_services,
      v_service_name,
      p_required_role
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace.id::text || ':' || p_appointment_date::text));

  select booking_request.*
  into v_existing_active_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace.id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) =
      lower(trim(v_service_name))
    and public.same_public_booking_operator_identity(
      booking_request.requested_operator_id,
      booking_request.requested_operator_name,
      v_requested_operator_id,
      v_requested_operator_name
    )
    and booking_request.status in ('pending', 'accepted')
    and (
      (v_customer_id is not null and booking_request.customer_id = v_customer_id)
      or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
      or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
         lower(v_customer_full_name)
    )
  order by coalesce(booking_request.created_at, '-infinity'::timestamptz) desc, booking_request.id desc
  limit 1;

  select booking_request.*
  into v_existing_terminal_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace.id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) =
      lower(trim(v_service_name))
    and public.same_public_booking_operator_identity(
      booking_request.requested_operator_id,
      booking_request.requested_operator_name,
      v_requested_operator_id,
      v_requested_operator_name
    )
    and booking_request.status in ('cancelled', 'rejected')
    and (
      (v_customer_id is not null and booking_request.customer_id = v_customer_id)
      or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
      or lower(trim(concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')))) =
         lower(v_customer_full_name)
    )
  order by coalesce(booking_request.created_at, '-infinity'::timestamptz) desc, booking_request.id desc
  limit 1;

  v_active_request_created_at := coalesce(v_existing_active_request.created_at, '-infinity'::timestamptz);
  v_terminal_request_created_at := coalesce(v_existing_terminal_request.created_at, '-infinity'::timestamptz);

  if v_existing_terminal_request.id is not null
     and v_terminal_request_created_at > v_active_request_created_at then
    update public.booking_requests
    set customer_id = v_customer_id,
        requested_price = v_requested_price,
        requested_duration_minutes = v_requested_duration,
        required_role = nullif(v_requested_role, ''),
        appointment_date = p_appointment_date,
        appointment_time = p_appointment_time,
        customer_name = v_customer_name,
        customer_surname = v_customer_surname,
        customer_email = v_customer_email,
        customer_phone = v_customer_phone,
        customer_instagram = v_customer_instagram,
        notes = v_notes,
        requested_operator_id = v_requested_operator_id,
        requested_operator_name = v_requested_operator_name,
        origin = 'frontend',
        status = 'pending',
        viewed_by_customer = false,
        viewed_by_salon = false,
        cancellation_source = null
    where id = v_existing_terminal_request.id
    returning * into v_booking_request;

    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_booking_request;
  end if;

  if v_existing_active_request.id is not null then
    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_existing_active_request;
  end if;

  if not public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    v_requested_duration,
    v_service_name,
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    raise exception 'slot_unavailable';
  end if;

  if v_existing_terminal_request.id is not null then
    update public.booking_requests
    set customer_id = v_customer_id,
        requested_price = v_requested_price,
        requested_duration_minutes = v_requested_duration,
        required_role = nullif(v_requested_role, ''),
        appointment_date = p_appointment_date,
        appointment_time = p_appointment_time,
        customer_name = v_customer_name,
        customer_surname = v_customer_surname,
        customer_email = v_customer_email,
        customer_phone = v_customer_phone,
        customer_instagram = v_customer_instagram,
        notes = v_notes,
        requested_operator_id = v_requested_operator_id,
        requested_operator_name = v_requested_operator_name,
        origin = 'frontend',
        status = 'pending',
        viewed_by_customer = false,
        viewed_by_salon = false,
        cancellation_source = null
    where id = v_existing_terminal_request.id
    returning * into v_booking_request;

    perform public.sync_client_portal_appointments(v_workspace.id);
    perform public.sync_client_portal_booking_requests(v_workspace.id);
    return v_booking_request;
  end if;

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
    viewed_by_customer
  ) values (
    v_workspace.id,
    v_customer_id,
    v_service_name,
    v_requested_price,
    greatest(coalesce(v_requested_duration, 60), 1),
    nullif(v_requested_role, ''),
    p_appointment_date,
    p_appointment_time,
    v_customer_name,
    v_customer_surname,
    v_customer_email,
    v_customer_phone,
    v_customer_instagram,
    v_notes,
    v_requested_operator_id,
    v_requested_operator_name,
    'frontend',
    'pending',
    false
  )
  returning * into v_booking_request;

  perform public.sync_client_portal_appointments(v_workspace.id);
  perform public.sync_client_portal_booking_requests(v_workspace.id);

  return v_booking_request;
end;
$$;

create or replace function public.sync_client_portal_booking_requests(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set richieste_prenotazione = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', booking_request.id,
          'data', booking_request.appointment_date,
          'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
          'servizio', booking_request.requested_service_name,
          'prezzo', booking_request.requested_price,
          'durataMinuti', booking_request.requested_duration_minutes,
          'nome', booking_request.customer_name,
          'cognome', booking_request.customer_surname,
          'email', booking_request.customer_email,
          'telefono', booking_request.customer_phone,
          'instagram', coalesce(booking_request.customer_instagram, ''),
          'note', coalesce(booking_request.notes, ''),
          'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
          'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
          'origine',
            case
              when booking_request.origin = 'backoffice' then 'backoffice'
              else 'frontend'
            end,
          'stato',
            case booking_request.status
              when 'accepted' then 'Accettata'
              when 'rejected' then 'Rifiutata'
              when 'cancelled' then 'Annullata'
              else 'In attesa'
            end,
          'cancellationSource', booking_request.cancellation_source,
          'createdAt', booking_request.created_at,
          'viewedByCliente', booking_request.viewed_by_customer,
          'viewedBySalon',
            case
              when booking_request.status in ('pending', 'cancelled') then false
              else true
            end
        )
        order by booking_request.created_at desc
      )
      from public.booking_requests as booking_request
      where booking_request.workspace_id = portal.workspace_id
        and (
          booking_request.status not in ('pending', 'accepted')
          or not exists (
            select 1
            from public.booking_requests as terminal_request
            where terminal_request.workspace_id = portal.workspace_id
              and terminal_request.status in ('cancelled', 'rejected')
              and terminal_request.appointment_date = booking_request.appointment_date
              and terminal_request.appointment_time = booking_request.appointment_time
              and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                lower(trim(coalesce(booking_request.requested_service_name, '')))
              and public.same_public_booking_operator_identity(
                terminal_request.requested_operator_id,
                terminal_request.requested_operator_name,
                booking_request.requested_operator_id,
                booking_request.requested_operator_name
              )
              and lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(terminal_request.customer_name, ''),
                    coalesce(terminal_request.customer_surname, '')
                  )
                )
              ) = lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(booking_request.customer_name, ''),
                    coalesce(booking_request.customer_surname, '')
                  )
                )
              )
              and not exists (
                select 1
                from public.booking_requests as newer_active_request
                where newer_active_request.workspace_id = terminal_request.workspace_id
                  and newer_active_request.status in ('pending', 'accepted')
                  and newer_active_request.appointment_date = terminal_request.appointment_date
                  and newer_active_request.appointment_time = terminal_request.appointment_time
                  and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                    lower(trim(coalesce(terminal_request.requested_service_name, '')))
                  and public.same_public_booking_operator_identity(
                    newer_active_request.requested_operator_id,
                    newer_active_request.requested_operator_name,
                    terminal_request.requested_operator_id,
                    terminal_request.requested_operator_name
                  )
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(newer_active_request.customer_name, ''),
                        coalesce(newer_active_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  )
                  and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                    coalesce(terminal_request.created_at, '-infinity'::timestamptz)
              )
          )
        )
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_payload jsonb := '{}'::jsonb;
  v_workspace_payload jsonb := '{}'::jsonb;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  order by
    case when w.subscription_status = 'active' then 0 else 1 end,
    w.updated_at desc nulls last,
    w.created_at desc nulls last,
    w.id desc
  limit 1;

  if v_workspace.id is null then
    return null;
  end if;

  v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
  v_workspace_payload := coalesce(v_owner_payload -> 'workspace', '{}'::jsonb);

  return jsonb_build_object(
    'workspace',
      jsonb_build_object(
        'id', v_workspace.id,
        'ownerEmail', coalesce(nullif(trim(v_workspace_payload ->> 'ownerEmail'), ''), v_workspace.owner_email::text),
        'salonCode', coalesce(nullif(trim(v_workspace_payload ->> 'salonCode'), ''), v_workspace.slug),
        'salonName', coalesce(nullif(trim(v_workspace_payload ->> 'salonName'), ''), v_workspace.salon_name),
        'salonNameDisplayStyle', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameDisplayStyle'), ''), 'corsivo'),
        'salonNameFontVariant', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameFontVariant'), ''), 'neon'),
        'businessPhone', coalesce(nullif(trim(v_workspace_payload ->> 'businessPhone'), ''), coalesce(v_workspace.owner_phone, '')),
        'activityCategory', coalesce(nullif(trim(v_workspace_payload ->> 'activityCategory'), ''), ''),
        'salonAddress', coalesce(nullif(trim(v_workspace_payload ->> 'salonAddress'), ''), ''),
        'streetType', coalesce(nullif(trim(v_workspace_payload ->> 'streetType'), ''), ''),
        'streetName', coalesce(nullif(trim(v_workspace_payload ->> 'streetName'), ''), ''),
        'streetNumber', coalesce(nullif(trim(v_workspace_payload ->> 'streetNumber'), ''), ''),
        'city', coalesce(nullif(trim(v_workspace_payload ->> 'city'), ''), ''),
        'postalCode', coalesce(nullif(trim(v_workspace_payload ->> 'postalCode'), ''), ''),
        'subscriptionPlan', v_workspace.subscription_plan,
        'subscriptionStatus', v_workspace.subscription_status,
        'customerReminderHoursBefore',
          greatest(0, least(168, coalesce(v_workspace.customer_reminder_hours_before, 24))),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti', coalesce(v_owner_payload -> 'clienti', '[]'::jsonb),
    'appuntamenti', coalesce(v_owner_payload -> 'appuntamenti', '[]'::jsonb),
    'servizi', coalesce(v_owner_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_owner_payload -> 'operatori', '[]'::jsonb),
    'richiestePrenotazione',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', booking_request.id,
              'data', booking_request.appointment_date,
              'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
              'servizio', booking_request.requested_service_name,
              'prezzo', booking_request.requested_price,
              'durataMinuti', booking_request.requested_duration_minutes,
              'nome', booking_request.customer_name,
              'cognome', booking_request.customer_surname,
              'email', booking_request.customer_email,
              'telefono', booking_request.customer_phone,
              'instagram', coalesce(booking_request.customer_instagram, ''),
              'note', coalesce(booking_request.notes, ''),
              'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
              'origine', case when booking_request.origin = 'backoffice' then 'backoffice' else 'frontend' end,
              'stato',
                case booking_request.status
                  when 'accepted' then 'Accettata'
                  when 'rejected' then 'Rifiutata'
                  when 'cancelled' then 'Annullata'
                  else 'In attesa'
                end,
              'cancellationSource', booking_request.cancellation_source,
              'createdAt', booking_request.created_at,
              'viewedByCliente', booking_request.viewed_by_customer,
              'viewedBySalon',
                case
                  when booking_request.status in ('pending', 'cancelled') then false
                  else true
                end
            )
            order by booking_request.created_at desc
          )
          from public.booking_requests as booking_request
          where booking_request.workspace_id = v_workspace.id
            and (
              booking_request.status not in ('pending', 'accepted')
              or not exists (
                select 1
                from public.booking_requests as terminal_request
                where terminal_request.workspace_id = v_workspace.id
                  and terminal_request.status in ('cancelled', 'rejected')
                  and terminal_request.appointment_date = booking_request.appointment_date
                  and terminal_request.appointment_time = booking_request.appointment_time
                  and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                    lower(trim(coalesce(booking_request.requested_service_name, '')))
                  and public.same_public_booking_operator_identity(
                    terminal_request.requested_operator_id,
                    terminal_request.requested_operator_name,
                    booking_request.requested_operator_id,
                    booking_request.requested_operator_name
                  )
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(booking_request.customer_name, ''),
                        coalesce(booking_request.customer_surname, '')
                      )
                    )
                  )
                  and not exists (
                    select 1
                    from public.booking_requests as newer_active_request
                    where newer_active_request.workspace_id = terminal_request.workspace_id
                      and newer_active_request.status in ('pending', 'accepted')
                      and newer_active_request.appointment_date = terminal_request.appointment_date
                      and newer_active_request.appointment_time = terminal_request.appointment_time
                      and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                        lower(trim(coalesce(terminal_request.requested_service_name, '')))
                      and public.same_public_booking_operator_identity(
                        newer_active_request.requested_operator_id,
                        newer_active_request.requested_operator_name,
                        terminal_request.requested_operator_id,
                        terminal_request.requested_operator_name
                      )
                      and lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(newer_active_request.customer_name, ''),
                            coalesce(newer_active_request.customer_surname, '')
                          )
                        )
                      ) = lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(terminal_request.customer_name, ''),
                            coalesce(terminal_request.customer_surname, '')
                          )
                        )
                      )
                      and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                        coalesce(terminal_request.created_at, '-infinity'::timestamptz)
                  )
              )
            )
        ),
        '[]'::jsonb
      ),
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$$;

notify pgrst, 'reload schema';
