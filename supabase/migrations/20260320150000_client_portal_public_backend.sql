create table if not exists public.client_portals (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_email citext not null unique,
  salon_code text not null unique,
  salon_name text not null,
  salon_name_display_style text not null default 'corsivo',
  salon_name_font_variant text not null default 'neon',
  business_phone text not null default '',
  activity_category text not null default '',
  salon_address text not null default '',
  street_type text not null default '',
  street_name text not null default '',
  street_number text not null default '',
  city text not null default '',
  postal_code text not null default '',
  subscription_plan public.subscription_plan not null default 'starter',
  subscription_status public.subscription_status not null default 'active',
  clienti jsonb not null default '[]'::jsonb,
  appuntamenti jsonb not null default '[]'::jsonb,
  servizi jsonb not null default '[]'::jsonb,
  operatori jsonb not null default '[]'::jsonb,
  richieste_prenotazione jsonb not null default '[]'::jsonb,
  availability_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_updated_at_client_portals on public.client_portals;
create trigger set_updated_at_client_portals
before update on public.client_portals
for each row execute procedure public.set_updated_at();

create or replace function public.upsert_client_portal_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace jsonb;
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
  v_workspace_id uuid;
begin
  v_workspace := coalesce(p_payload -> 'workspace', '{}'::jsonb);
  v_owner_email := lower(trim(coalesce(v_workspace ->> 'ownerEmail', '')))::citext;
  v_salon_code := lower(trim(coalesce(v_workspace ->> 'salonCode', '')));
  v_salon_name := trim(coalesce(v_workspace ->> 'salonName', ''));
  v_business_phone := trim(coalesce(v_workspace ->> 'businessPhone', ''));
  v_activity_category := trim(coalesce(v_workspace ->> 'activityCategory', ''));
  v_salon_address := trim(coalesce(v_workspace ->> 'salonAddress', ''));
  v_street_type := trim(coalesce(v_workspace ->> 'streetType', ''));
  v_street_name := trim(coalesce(v_workspace ->> 'streetName', ''));
  v_street_number := trim(coalesce(v_workspace ->> 'streetNumber', ''));
  v_city := trim(coalesce(v_workspace ->> 'city', ''));
  v_postal_code := trim(coalesce(v_workspace ->> 'postalCode', ''));
  v_display_style := trim(coalesce(v_workspace ->> 'salonNameDisplayStyle', 'corsivo'));
  v_font_variant := trim(coalesce(v_workspace ->> 'salonNameFontVariant', 'neon'));
  v_subscription_plan := coalesce((v_workspace ->> 'subscriptionPlan')::public.subscription_plan, 'starter');
  v_subscription_status := coalesce((v_workspace ->> 'subscriptionStatus')::public.subscription_status, 'active');

  if v_owner_email is null or v_owner_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  if v_salon_code = '' or v_salon_name = '' then
    raise exception 'salon_code_and_name_required';
  end if;

  insert into public.workspaces (
    salon_name,
    slug,
    owner_email,
    owner_phone,
    subscription_plan,
    subscription_status
  )
  values (
    v_salon_name,
    v_salon_code,
    v_owner_email,
    nullif(v_business_phone, ''),
    v_subscription_plan,
    v_subscription_status
  )
  on conflict (owner_email)
  do update set
    salon_name = excluded.salon_name,
    slug = excluded.slug,
    owner_phone = excluded.owner_phone,
    subscription_plan = excluded.subscription_plan,
    subscription_status = excluded.subscription_status,
    updated_at = timezone('utc', now())
  returning id into v_workspace_id;

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
    clienti = excluded.clienti,
    appuntamenti = excluded.appuntamenti,
    servizi = excluded.servizi,
    operatori = excluded.operatori,
    richieste_prenotazione = excluded.richieste_prenotazione,
    availability_settings = excluded.availability_settings,
    updated_at = timezone('utc', now());

  return v_workspace_id;
end;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', portal.workspace_id,
      'ownerEmail', portal.owner_email,
      'salonCode', portal.salon_code,
      'salonName', portal.salon_name,
      'salonNameDisplayStyle', portal.salon_name_display_style,
      'salonNameFontVariant', portal.salon_name_font_variant,
      'businessPhone', portal.business_phone,
      'activityCategory', portal.activity_category,
      'salonAddress', portal.salon_address,
      'streetType', portal.street_type,
      'streetName', portal.street_name,
      'streetNumber', portal.street_number,
      'city', portal.city,
      'postalCode', portal.postal_code,
      'subscriptionPlan', portal.subscription_plan,
      'subscriptionStatus', portal.subscription_status,
      'createdAt', portal.created_at,
      'updatedAt', portal.updated_at
    ),
    'clienti', portal.clienti,
    'appuntamenti', portal.appuntamenti,
    'servizi', portal.servizi,
    'operatori', portal.operatori,
    'richiestePrenotazione', portal.richieste_prenotazione,
    'availabilitySettings', portal.availability_settings
  )
  from public.client_portals as portal
  where portal.salon_code = lower(trim(p_salon_code))
    and portal.subscription_status = 'active'
  limit 1
$$;

create or replace function public.upsert_public_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  insert into public.push_devices (
    workspace_id,
    owner_email,
    expo_push_token,
    platform,
    device_model,
    app_version,
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
    is_active = true,
    last_seen_at = timezone('utc', now())
  returning id into v_device_id;

  return v_device_id;
end;
$$;

create or replace function public.queue_public_workspace_push(
  p_workspace_id uuid,
  p_event_type public.push_event_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_workspace_id is null then
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
    and device.is_active = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.upsert_client_portal_snapshot(jsonb) to anon, authenticated;
grant execute on function public.get_client_portal_snapshot(text) to anon, authenticated;
grant execute on function public.upsert_public_push_device(uuid, citext, text, public.store_platform, text, text) to anon, authenticated;
grant execute on function public.queue_public_workspace_push(uuid, public.push_event_type, text, text, jsonb) to anon, authenticated;
