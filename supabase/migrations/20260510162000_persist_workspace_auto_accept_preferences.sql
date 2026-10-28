alter table public.workspaces
  add column if not exists auto_accept_booking_requests boolean not null default false;

alter table public.workspaces
  add column if not exists auto_accept_booking_requests_updated_at timestamptz not null default timezone('utc', now());

update public.workspaces
set
  auto_accept_booking_requests = coalesce(auto_accept_booking_requests, false),
  auto_accept_booking_requests_updated_at = coalesce(
    auto_accept_booking_requests_updated_at,
    updated_at,
    timezone('utc', now())
  )
where auto_accept_booking_requests_updated_at is null;

create or replace function public.upsert_client_portal_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace jsonb;
  v_workspace_id uuid;
  v_workspace_row public.workspaces%rowtype;
  v_owner_email citext;
  v_salon_code text;
  v_salon_name text;
  v_business_phone text;
  v_activity_category text;
  v_salon_address text;
  v_street_type text;
  v_street_name text;
  v_street_number text;
  v_city text;
  v_postal_code text;
  v_display_style text;
  v_font_variant text;
  v_subscription_plan public.subscription_plan;
  v_subscription_status public.subscription_status;
  v_auto_accept_booking_requests boolean;
  v_auto_accept_booking_requests_updated_at timestamptz;
  v_customer_reminder_hours_before integer;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select w.*
  into v_workspace_row
  from public.workspaces as w
  where w.id = v_workspace_id
  limit 1;

  if v_workspace_row.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_workspace := coalesce(p_payload -> 'workspace', '{}'::jsonb);
  v_owner_email := lower(trim(coalesce(v_workspace ->> 'ownerEmail', v_workspace_row.owner_email::text, '')))::citext;
  v_salon_code := lower(trim(coalesce(v_workspace ->> 'salonCode', v_workspace_row.slug, '')));
  v_salon_name := trim(coalesce(v_workspace ->> 'salonName', v_workspace_row.salon_name, ''));
  v_business_phone := trim(coalesce(v_workspace ->> 'businessPhone', v_workspace_row.owner_phone, ''));
  v_activity_category := trim(coalesce(v_workspace ->> 'activityCategory', ''));
  v_salon_address := trim(coalesce(v_workspace ->> 'salonAddress', ''));
  v_street_type := trim(coalesce(v_workspace ->> 'streetType', ''));
  v_street_name := trim(coalesce(v_workspace ->> 'streetName', ''));
  v_street_number := trim(coalesce(v_workspace ->> 'streetNumber', ''));
  v_city := trim(coalesce(v_workspace ->> 'city', ''));
  v_postal_code := trim(coalesce(v_workspace ->> 'postalCode', ''));
  v_display_style := trim(coalesce(v_workspace ->> 'salonNameDisplayStyle', 'corsivo'));
  v_font_variant := trim(coalesce(v_workspace ->> 'salonNameFontVariant', 'neon'));
  v_subscription_plan := coalesce((v_workspace ->> 'subscriptionPlan')::public.subscription_plan, v_workspace_row.subscription_plan);
  v_subscription_status := coalesce((v_workspace ->> 'subscriptionStatus')::public.subscription_status, v_workspace_row.subscription_status);
  v_auto_accept_booking_requests := coalesce(
    (v_workspace ->> 'autoAcceptBookingRequests')::boolean,
    v_workspace_row.auto_accept_booking_requests,
    false
  );
  v_auto_accept_booking_requests_updated_at := coalesce(
    nullif(trim(coalesce(v_workspace ->> 'autoAcceptBookingRequestsUpdatedAt', '')), '')::timestamptz,
    v_workspace_row.auto_accept_booking_requests_updated_at,
    timezone('utc', now())
  );
  v_customer_reminder_hours_before := greatest(
    0,
    least(
      168,
      coalesce(
        nullif(trim(coalesce(v_workspace ->> 'customerReminderHoursBefore', '')), '')::integer,
        v_workspace_row.customer_reminder_hours_before,
        24
      )
    )
  );

  if v_owner_email is null or v_owner_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  if v_salon_code = '' or v_salon_name = '' then
    raise exception 'salon_code_and_name_required';
  end if;

  if v_workspace_row.owner_email is distinct from v_owner_email then
    raise exception 'owner_email_mismatch';
  end if;

  if v_workspace_row.slug is distinct from v_salon_code then
    raise exception 'salon_code_mismatch';
  end if;

  update public.workspaces
  set
    salon_name = v_salon_name,
    owner_phone = nullif(v_business_phone, ''),
    auto_accept_booking_requests = v_auto_accept_booking_requests,
    auto_accept_booking_requests_updated_at = v_auto_accept_booking_requests_updated_at,
    customer_reminder_hours_before = v_customer_reminder_hours_before,
    updated_at = timezone('utc', now())
  where id = v_workspace_id;

  insert into public.client_portals (
    workspace_id,
    owner_email,
    salon_code,
    salon_name,
    salon_name_display_style,
    salon_name_font_variant,
    business_phone,
    activity_category,
    salon_address,
    street_type,
    street_name,
    street_number,
    city,
    postal_code,
    subscription_plan,
    subscription_status,
    customer_reminder_hours_before,
    clienti,
    appuntamenti,
    servizi,
    operatori,
    richieste_prenotazione,
    availability_settings
  )
  values (
    v_workspace_id,
    v_owner_email,
    v_salon_code,
    v_salon_name,
    v_display_style,
    v_font_variant,
    v_business_phone,
    v_activity_category,
    v_salon_address,
    v_street_type,
    v_street_name,
    v_street_number,
    v_city,
    v_postal_code,
    v_subscription_plan,
    v_subscription_status,
    v_customer_reminder_hours_before,
    coalesce(p_payload -> 'clienti', '[]'::jsonb),
    coalesce(p_payload -> 'appuntamenti', '[]'::jsonb),
    coalesce(p_payload -> 'servizi', '[]'::jsonb),
    coalesce(p_payload -> 'operatori', '[]'::jsonb),
    coalesce(p_payload -> 'richiestePrenotazione', '[]'::jsonb),
    coalesce(p_payload -> 'availabilitySettings', '{}'::jsonb)
  )
  on conflict (workspace_id)
  do update set
    owner_email = excluded.owner_email,
    salon_code = excluded.salon_code,
    salon_name = excluded.salon_name,
    salon_name_display_style = excluded.salon_name_display_style,
    salon_name_font_variant = excluded.salon_name_font_variant,
    business_phone = excluded.business_phone,
    activity_category = excluded.activity_category,
    salon_address = excluded.salon_address,
    street_type = excluded.street_type,
    street_name = excluded.street_name,
    street_number = excluded.street_number,
    city = excluded.city,
    postal_code = excluded.postal_code,
    subscription_plan = excluded.subscription_plan,
    subscription_status = excluded.subscription_status,
    customer_reminder_hours_before = excluded.customer_reminder_hours_before,
    clienti = excluded.clienti,
    appuntamenti = excluded.appuntamenti,
    servizi = excluded.servizi,
    operatori = excluded.operatori,
    richieste_prenotazione = excluded.richieste_prenotazione,
    availability_settings = public.merge_client_portal_availability_settings(
      public.client_portals.availability_settings,
      excluded.availability_settings
    ),
    updated_at = timezone('utc', now());

  perform public.log_workspace_audit_event(
    v_workspace_id,
    'client_portal_snapshot_upserted',
    'client_portals',
    v_workspace_id::text,
    jsonb_build_object(
      'salonCode', v_salon_code,
      'salonName', v_salon_name,
      'autoAcceptBookingRequests', v_auto_accept_booking_requests,
      'autoAcceptBookingRequestsUpdatedAt', v_auto_accept_booking_requests_updated_at,
      'customerReminderHoursBefore', v_customer_reminder_hours_before
    )
  );

  return v_workspace_id;
end;
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
        'autoAcceptBookingRequests',
          coalesce(
            (v_workspace_payload ->> 'autoAcceptBookingRequests')::boolean,
            v_workspace.auto_accept_booking_requests,
            false
          ),
        'autoAcceptBookingRequestsUpdatedAt',
          coalesce(
            nullif(trim(coalesce(v_workspace_payload ->> 'autoAcceptBookingRequestsUpdatedAt', '')), '')::timestamptz,
            v_workspace.auto_accept_booking_requests_updated_at,
            v_workspace.updated_at
          ),
        'customerReminderHoursBefore',
          greatest(
            0,
            least(
              168,
              coalesce(
                nullif(trim(coalesce(v_workspace_payload ->> 'customerReminderHoursBefore', '')), '')::integer,
                v_workspace.customer_reminder_hours_before,
                24
              )
            )
          ),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti',
      coalesce(
        v_owner_payload -> 'clienti',
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', customer.id,
              'nome', customer.full_name,
              'telefono', coalesce(customer.phone, ''),
              'email', coalesce(customer.email::text, ''),
              'instagram', coalesce(customer.instagram, ''),
              'birthday', '',
              'nota', coalesce(customer.note, ''),
              'fonte', case when customer.source = 'frontend' then 'frontend' else 'salone' end,
              'viewedBySalon', customer.viewed_by_salon,
              'annullamentiCount', 0,
              'inibito', false,
              'maxFutureAppointments', customer.max_future_appointments,
              'maxFutureAppointmentsMode', customer.max_future_appointments_mode,
              'maxDailyAppointments', customer.max_daily_appointments
            )
            order by customer.updated_at desc, customer.created_at desc
          )
          from public.customers as customer
          where customer.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
    'appuntamenti',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', appointment.id,
              'data', appointment.appointment_date,
              'ora', to_char(appointment.appointment_time, 'HH24:MI'),
              'cliente', appointment.customer_name,
              'servizio', appointment.service_name,
              'prezzo', appointment.price,
              'durataMinuti', appointment.duration_minutes,
              'operatoreId', nullif(trim(coalesce(appointment.operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(appointment.operator_name, '')), ''),
              'incassato', appointment.cashed_in,
              'completato', appointment.completed,
              'nonEffettuato', appointment.no_show
            )
            order by appointment.appointment_date asc, appointment.appointment_time asc, appointment.created_at asc
          )
          from public.appointments as appointment
          where appointment.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
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
        ),
        '[]'::jsonb
      ),
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$$;
