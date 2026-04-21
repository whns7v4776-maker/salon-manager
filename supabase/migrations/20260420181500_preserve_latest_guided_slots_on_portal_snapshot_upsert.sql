create or replace function public.merge_client_portal_availability_settings(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_existing_guided_ts timestamptz;
  v_incoming_guided_ts timestamptz;
begin
  begin
    v_existing_guided_ts := nullif(trim(coalesce(v_existing ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_existing_guided_ts := null;
  end;

  begin
    v_incoming_guided_ts := nullif(trim(coalesce(v_incoming ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception
    when others then
      v_incoming_guided_ts := null;
  end;

  if v_existing_guided_ts is not null
     and (v_incoming_guided_ts is null or v_existing_guided_ts > v_incoming_guided_ts) then
    return jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_incoming, '{guidedSlotsEnabled}', coalesce(v_existing -> 'guidedSlotsEnabled', 'false'::jsonb), true),
          '{guidedSlotsStrategy}',
          coalesce(v_existing -> 'guidedSlotsStrategy', to_jsonb('balanced'::text)),
          true
        ),
        '{guidedSlotsVisibility}',
        coalesce(v_existing -> 'guidedSlotsVisibility', to_jsonb('recommended_first'::text)),
        true
      ),
      '{guidedSlotsUpdatedAt}',
      coalesce(v_existing -> 'guidedSlotsUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return v_incoming;
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
      'customerReminderHoursBefore', v_customer_reminder_hours_before
    )
  );

  return v_workspace_id;
end;
$$;
