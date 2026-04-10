create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email citext,
  actor_role text not null default 'owner',
  event_type text not null,
  entity_table text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_workspace_created_idx
  on public.audit_logs (workspace_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (workspace_id, entity_table, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs select own workspace" on public.audit_logs;
create policy "audit_logs select own workspace"
on public.audit_logs
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

create or replace function public.log_workspace_audit_event(
  p_workspace_id uuid,
  p_event_type text,
  p_entity_table text,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_actor_email citext;
begin
  if p_workspace_id is null then
    raise exception 'workspace_required';
  end if;

  select lower(trim(coalesce(auth.jwt() ->> 'email', '')))::citext
  into v_actor_email;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    actor_email,
    actor_role,
    event_type,
    entity_table,
    entity_id,
    payload
  )
  values (
    p_workspace_id,
    auth.uid(),
    nullif(v_actor_email, ''::citext),
    case when auth.uid() is null then 'system' else 'owner' end,
    trim(coalesce(p_event_type, '')),
    trim(coalesce(p_entity_table, '')),
    nullif(trim(coalesce(p_entity_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_workspace_audit_event(uuid, text, text, text, jsonb) to authenticated;

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

  perform public.log_workspace_audit_event(
    v_workspace_id,
    'client_portal_snapshot_upserted',
    'client_portals',
    v_workspace_id::text,
    jsonb_build_object(
      'salonCode', v_salon_code,
      'servicesCount', jsonb_array_length(coalesce(p_payload -> 'servizi', '[]'::jsonb)),
      'appointmentsCount', jsonb_array_length(coalesce(p_payload -> 'appuntamenti', '[]'::jsonb)),
      'requestsCount', jsonb_array_length(coalesce(p_payload -> 'richiestePrenotazione', '[]'::jsonb))
    )
  );

  return v_workspace_id;
end;
$$;

revoke execute on function public.upsert_client_portal_snapshot(jsonb) from anon;
grant execute on function public.upsert_client_portal_snapshot(jsonb) to authenticated;

create index if not exists appointments_workspace_operator_slot_idx
  on public.appointments (workspace_id, appointment_date, operator_id, appointment_time);

create index if not exists booking_requests_workspace_operator_status_slot_idx
  on public.booking_requests (
    workspace_id,
    appointment_date,
    requested_operator_id,
    status,
    appointment_time
  );
