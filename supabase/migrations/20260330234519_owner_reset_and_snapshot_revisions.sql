create table if not exists public.client_portal_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  owner_email citext,
  salon_code text,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  previous_snapshot jsonb,
  next_snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists client_portal_revisions_workspace_idx
  on public.client_portal_revisions (workspace_id, created_at desc);

create index if not exists client_portal_revisions_owner_email_idx
  on public.client_portal_revisions (owner_email, created_at desc);

alter table public.client_portal_revisions enable row level security;

drop policy if exists "client portal revisions select own workspace" on public.client_portal_revisions;
create policy "client portal revisions select own workspace"
on public.client_portal_revisions
for select
using (workspace_id = public.current_workspace_id());

create or replace function public.capture_client_portal_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.client_portal_revisions (
      workspace_id,
      owner_email,
      salon_code,
      operation,
      previous_snapshot,
      next_snapshot
    )
    values (
      new.workspace_id,
      new.owner_email,
      new.salon_code,
      'insert',
      null,
      jsonb_build_object(
        'workspace', jsonb_build_object(
          'id', new.workspace_id,
          'ownerEmail', new.owner_email,
          'salonCode', new.salon_code,
          'salonName', new.salon_name,
          'salonNameDisplayStyle', new.salon_name_display_style,
          'salonNameFontVariant', new.salon_name_font_variant,
          'businessPhone', new.business_phone,
          'activityCategory', new.activity_category,
          'salonAddress', new.salon_address,
          'streetType', new.street_type,
          'streetName', new.street_name,
          'streetNumber', new.street_number,
          'city', new.city,
          'postalCode', new.postal_code,
          'subscriptionPlan', new.subscription_plan,
          'subscriptionStatus', new.subscription_status,
          'createdAt', new.created_at,
          'updatedAt', new.updated_at
        ),
        'clienti', new.clienti,
        'appuntamenti', new.appuntamenti,
        'servizi', new.servizi,
        'operatori', new.operatori,
        'richiestePrenotazione', new.richieste_prenotazione,
        'availabilitySettings', new.availability_settings
      )
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.client_portal_revisions (
      workspace_id,
      owner_email,
      salon_code,
      operation,
      previous_snapshot,
      next_snapshot
    )
    values (
      new.workspace_id,
      new.owner_email,
      new.salon_code,
      'update',
      jsonb_build_object(
        'workspace', jsonb_build_object(
          'id', old.workspace_id,
          'ownerEmail', old.owner_email,
          'salonCode', old.salon_code,
          'salonName', old.salon_name,
          'salonNameDisplayStyle', old.salon_name_display_style,
          'salonNameFontVariant', old.salon_name_font_variant,
          'businessPhone', old.business_phone,
          'activityCategory', old.activity_category,
          'salonAddress', old.salon_address,
          'streetType', old.street_type,
          'streetName', old.street_name,
          'streetNumber', old.street_number,
          'city', old.city,
          'postalCode', old.postal_code,
          'subscriptionPlan', old.subscription_plan,
          'subscriptionStatus', old.subscription_status,
          'createdAt', old.created_at,
          'updatedAt', old.updated_at
        ),
        'clienti', old.clienti,
        'appuntamenti', old.appuntamenti,
        'servizi', old.servizi,
        'operatori', old.operatori,
        'richiestePrenotazione', old.richieste_prenotazione,
        'availabilitySettings', old.availability_settings
      ),
      jsonb_build_object(
        'workspace', jsonb_build_object(
          'id', new.workspace_id,
          'ownerEmail', new.owner_email,
          'salonCode', new.salon_code,
          'salonName', new.salon_name,
          'salonNameDisplayStyle', new.salon_name_display_style,
          'salonNameFontVariant', new.salon_name_font_variant,
          'businessPhone', new.business_phone,
          'activityCategory', new.activity_category,
          'salonAddress', new.salon_address,
          'streetType', new.street_type,
          'streetName', new.street_name,
          'streetNumber', new.street_number,
          'city', new.city,
          'postalCode', new.postal_code,
          'subscriptionPlan', new.subscription_plan,
          'subscriptionStatus', new.subscription_status,
          'createdAt', new.created_at,
          'updatedAt', new.updated_at
        ),
        'clienti', new.clienti,
        'appuntamenti', new.appuntamenti,
        'servizi', new.servizi,
        'operatori', new.operatori,
        'richiestePrenotazione', new.richieste_prenotazione,
        'availabilitySettings', new.availability_settings
      )
    );

    return new;
  end if;

  insert into public.client_portal_revisions (
    workspace_id,
    owner_email,
    salon_code,
    operation,
    previous_snapshot,
    next_snapshot
  )
  values (
    old.workspace_id,
    old.owner_email,
    old.salon_code,
    'delete',
    jsonb_build_object(
      'workspace', jsonb_build_object(
        'id', old.workspace_id,
        'ownerEmail', old.owner_email,
        'salonCode', old.salon_code,
        'salonName', old.salon_name,
        'salonNameDisplayStyle', old.salon_name_display_style,
        'salonNameFontVariant', old.salon_name_font_variant,
        'businessPhone', old.business_phone,
        'activityCategory', old.activity_category,
        'salonAddress', old.salon_address,
        'streetType', old.street_type,
        'streetName', old.street_name,
        'streetNumber', old.street_number,
        'city', old.city,
        'postalCode', old.postal_code,
        'subscriptionPlan', old.subscription_plan,
        'subscriptionStatus', old.subscription_status,
        'createdAt', old.created_at,
        'updatedAt', old.updated_at
      ),
      'clienti', old.clienti,
      'appuntamenti', old.appuntamenti,
      'servizi', old.servizi,
      'operatori', old.operatori,
      'richiestePrenotazione', old.richieste_prenotazione,
      'availabilitySettings', old.availability_settings
    ),
    null
  );

  return old;
end;
$$;

drop trigger if exists capture_client_portal_revision on public.client_portals;
create trigger capture_client_portal_revision
after insert or update or delete on public.client_portals
for each row execute procedure public.capture_client_portal_revision();

create or replace function public.reset_owner_workspace_data(p_confirm_email citext)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_owner_email citext;
  v_deleted_client_portals integer := 0;
  v_deleted_services integer := 0;
  v_deleted_customers integer := 0;
  v_deleted_booking_requests integer := 0;
  v_deleted_appointments integer := 0;
  v_deleted_cash_movements integer := 0;
  v_deleted_connected_cards integer := 0;
  v_deleted_events integer := 0;
  v_deleted_message_templates integer := 0;
  v_deleted_push_notifications integer := 0;
  v_deleted_push_devices integer := 0;
  v_deleted_backup_runs integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select owner_email
  into v_owner_email
  from public.workspaces
  where id = v_workspace_id;

  if v_owner_email is null then
    raise exception 'workspace_not_found';
  end if;

  if lower(trim(coalesce(p_confirm_email::text, '')))::citext <> lower(trim(v_owner_email::text))::citext then
    raise exception 'confirmation_email_mismatch';
  end if;

  delete from public.push_notifications
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_push_notifications = row_count;

  delete from public.push_devices
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_push_devices = row_count;

  delete from public.client_portals
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_client_portals = row_count;

  delete from public.services
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_services = row_count;

  delete from public.customers
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_customers = row_count;

  delete from public.booking_requests
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_booking_requests = row_count;

  delete from public.appointments
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_appointments = row_count;

  delete from public.cash_movements
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_cash_movements = row_count;

  delete from public.connected_cards
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_connected_cards = row_count;

  delete from public.events
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_events = row_count;

  delete from public.message_templates
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_message_templates = row_count;

  delete from public.backup_runs
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_backup_runs = row_count;

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'ownerEmail', v_owner_email,
    'deleted', jsonb_build_object(
      'clientPortals', v_deleted_client_portals,
      'services', v_deleted_services,
      'customers', v_deleted_customers,
      'bookingRequests', v_deleted_booking_requests,
      'appointments', v_deleted_appointments,
      'cashMovements', v_deleted_cash_movements,
      'connectedCards', v_deleted_connected_cards,
      'events', v_deleted_events,
      'messageTemplates', v_deleted_message_templates,
      'pushNotifications', v_deleted_push_notifications,
      'pushDevices', v_deleted_push_devices,
      'backupRuns', v_deleted_backup_runs
    )
  );
end;
$$;

grant execute on function public.reset_owner_workspace_data(citext) to authenticated;
