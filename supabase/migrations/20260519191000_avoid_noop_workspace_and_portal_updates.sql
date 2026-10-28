create or replace function public.sync_workspace_customer_reminder_hours(
  p_salon_code text default null,
  p_hours integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_email citext;
  v_salon_code text;
  v_hours integer;
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if public.current_workspace_id() is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select w.*
  into v_workspace
  from public.workspaces as w
  where w.id = public.current_workspace_id()
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_owner_email := v_workspace.owner_email;
  v_salon_code := lower(trim(coalesce(p_salon_code, v_workspace.slug, '')));
  v_hours := greatest(0, least(168, coalesce(p_hours, v_workspace.customer_reminder_hours_before, 24)));

  if v_owner_email is null or v_owner_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  if v_salon_code = '' then
    raise exception 'salon_code_required';
  end if;

  update public.workspaces as w
  set
    customer_reminder_hours_before = v_hours,
    updated_at = timezone('utc', now())
  where w.owner_email = v_owner_email
    and lower(trim(coalesce(w.slug, ''))) = v_salon_code
    and w.customer_reminder_hours_before is distinct from v_hours;

  get diagnostics v_updated_count = row_count;

  update public.client_portals as portal
  set
    customer_reminder_hours_before = v_hours,
    updated_at = timezone('utc', now())
  where portal.workspace_id in (
      select w.id
      from public.workspaces as w
      where w.owner_email = v_owner_email
        and lower(trim(coalesce(w.slug, ''))) = v_salon_code
    )
    and portal.customer_reminder_hours_before is distinct from v_hours;

  return v_updated_count;
end;
$$;

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
  v_portal_write_count integer := 0;
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
      coalesce(v_workspace_row.customer_reminder_hours_before, 24)
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
    updated_at = timezone('utc', now())
  where id = v_workspace_id
    and (
      salon_name is distinct from v_salon_name
      or owner_phone is distinct from nullif(v_business_phone, '')
      or auto_accept_booking_requests is distinct from v_auto_accept_booking_requests
      or auto_accept_booking_requests_updated_at is distinct from v_auto_accept_booking_requests_updated_at
    );

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
    updated_at = timezone('utc', now())
  where
    public.client_portals.owner_email is distinct from excluded.owner_email
    or public.client_portals.salon_code is distinct from excluded.salon_code
    or public.client_portals.salon_name is distinct from excluded.salon_name
    or public.client_portals.salon_name_display_style is distinct from excluded.salon_name_display_style
    or public.client_portals.salon_name_font_variant is distinct from excluded.salon_name_font_variant
    or public.client_portals.business_phone is distinct from excluded.business_phone
    or public.client_portals.activity_category is distinct from excluded.activity_category
    or public.client_portals.salon_address is distinct from excluded.salon_address
    or public.client_portals.street_type is distinct from excluded.street_type
    or public.client_portals.street_name is distinct from excluded.street_name
    or public.client_portals.street_number is distinct from excluded.street_number
    or public.client_portals.city is distinct from excluded.city
    or public.client_portals.postal_code is distinct from excluded.postal_code
    or public.client_portals.subscription_plan is distinct from excluded.subscription_plan
    or public.client_portals.subscription_status is distinct from excluded.subscription_status
    or public.client_portals.customer_reminder_hours_before is distinct from excluded.customer_reminder_hours_before
    or public.client_portals.clienti is distinct from excluded.clienti
    or public.client_portals.appuntamenti is distinct from excluded.appuntamenti
    or public.client_portals.servizi is distinct from excluded.servizi
    or public.client_portals.operatori is distinct from excluded.operatori
    or public.client_portals.richieste_prenotazione is distinct from excluded.richieste_prenotazione
    or public.client_portals.availability_settings is distinct from public.merge_client_portal_availability_settings(
      public.client_portals.availability_settings,
      excluded.availability_settings
    );

  get diagnostics v_portal_write_count = row_count;

  if v_portal_write_count > 0 then
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
  end if;

  return v_workspace_id;
end;
$$;
