-- Keep owner registration available to the native apps, but make the database
-- authoritative for paid/trial workspace access on every client.

create or replace function public.enforce_active_workspace_operational_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_workspace_id :=
    case
      when tg_op = 'DELETE' then old.workspace_id
      else new.workspace_id
    end;

  if v_workspace_id is null or not exists (
    select 1
    from public.workspaces as workspace
    where workspace.id = v_workspace_id
      and workspace.subscription_status = 'active'
      and (
        workspace.subscription_ends_at is null
        or workspace.subscription_ends_at > timezone('utc', now())
      )
  ) then
    raise exception 'workspace_access_denied';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_active_workspace_operational_write() from public;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'services',
    'customers',
    'booking_requests',
    'appointments',
    'cash_movements',
    'connected_cards',
    'events',
    'message_templates',
    'operators',
    'owner_app_snapshots'
  ]
  loop
    if to_regclass(format('public.%I', v_table_name)) is not null then
      execute format(
        'drop trigger if exists enforce_active_workspace_write on public.%I',
        v_table_name
      );
      execute format(
        'create trigger enforce_active_workspace_write
         before insert or update or delete on public.%I
         for each row execute function public.enforce_active_workspace_operational_write()',
        v_table_name
      );
    end if;
  end loop;
end;
$$;

-- Subscription fields exposed through the public portal are a projection of
-- the authoritative workspace, never values supplied by a client snapshot.
create or replace function public.align_client_portal_subscription_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plan;
  v_status public.subscription_status;
begin
  select workspace.subscription_plan, workspace.subscription_status
  into v_plan, v_status
  from public.workspaces as workspace
  where workspace.id = new.workspace_id;

  if not found then
    raise exception 'workspace_not_found';
  end if;

  new.subscription_plan := v_plan;
  new.subscription_status := v_status;
  return new;
end;
$$;

revoke all on function public.align_client_portal_subscription_from_workspace() from public;

drop trigger if exists align_client_portal_subscription on public.client_portals;
create trigger align_client_portal_subscription
before insert or update of subscription_plan, subscription_status
on public.client_portals
for each row execute function public.align_client_portal_subscription_from_workspace();

create or replace function public.sync_client_portal_subscription_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals
  set
    subscription_plan = new.subscription_plan,
    subscription_status = new.subscription_status,
    updated_at = timezone('utc', now())
  where workspace_id = new.id
    and (
      subscription_plan is distinct from new.subscription_plan
      or subscription_status is distinct from new.subscription_status
    );

  return new;
end;
$$;

revoke all on function public.sync_client_portal_subscription_from_workspace() from public;

drop trigger if exists sync_client_portal_subscription on public.workspaces;
create trigger sync_client_portal_subscription
after update of subscription_plan, subscription_status
on public.workspaces
for each row execute function public.sync_client_portal_subscription_from_workspace();

update public.client_portals as portal
set
  subscription_plan = workspace.subscription_plan,
  subscription_status = workspace.subscription_status,
  updated_at = timezone('utc', now())
from public.workspaces as workspace
where workspace.id = portal.workspace_id
  and (
    portal.subscription_plan is distinct from workspace.subscription_plan
    or portal.subscription_status is distinct from workspace.subscription_status
  );

-- This legacy endpoint is still used by released native clients. Keep its
-- signature, but require the authenticated member and active workspace.
create or replace function public.update_client_portal_availability_settings(
  p_owner_email text,
  p_salon_code text,
  p_availability_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  update public.client_portals as portal
  set
    availability_settings = coalesce(p_availability_settings, '{}'::jsonb),
    updated_at = timezone('utc', now())
  where portal.workspace_id = v_workspace_id
    and lower(trim(portal.owner_email::text)) =
      lower(trim(coalesce(p_owner_email, '')))
    and lower(trim(portal.salon_code)) =
      lower(trim(coalesce(p_salon_code, '')))
  returning portal.* into v_portal;

  if not found then
    raise exception 'workspace_not_found';
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.salon_name, ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

revoke all on function public.update_client_portal_availability_settings(text, text, jsonb)
from public, anon;
grant execute on function public.update_client_portal_availability_settings(text, text, jsonb)
to authenticated;

-- Released clients still call these compatibility RPCs. Run them with caller
-- permissions and remove anonymous execution so RLS and membership apply.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.accept_owner_booking_request_atomic_v2(citext,text,uuid,uuid,uuid)',
    'public.accept_owner_booking_request_by_email_v1(citext,text,uuid,uuid,uuid)',
    'public.reject_owner_booking_request_by_email_v1(citext,text,uuid)',
    'public.cancel_owner_booking_request_by_email_v1(citext,text,uuid)',
    'public.update_owner_booking_request_status_by_email(citext,text,uuid,request_status)',
    'public.update_owner_booking_request_status_by_email(citext,text,uuid,text)',
    'public.update_owner_booking_request_status_by_email_v2(citext,text,uuid,text)',
    'public.update_owner_booking_request_status_by_email_v3(citext,text,uuid,text,uuid,uuid)',
    'public.create_owner_appointment_by_email_v1(citext,text,text,text,citext,text,text,text,boolean,text,numeric,integer,date,time,text,text)',
    'public.move_owner_appointment_by_email_v1(citext,text,uuid,date,time)',
    'public.swap_owner_appointments_by_email_v1(citext,text,uuid,uuid)',
    'public.cancel_owner_appointment(uuid,date,time,text,text,citext,text)',
    'public.cancel_owner_appointment(uuid,date,time,text,text,citext,text,citext,text)',
    'public.cancel_owner_appointment(uuid,date,time,text,text,citext,text,citext,text,text)',
    'public.cancel_owner_appointment(uuid,date,time,text,text,citext,text,citext,text,text,text,text,text)',
    'public.cancel_owner_appointment_lane_guarded(uuid,date,time,text,text,citext,text,citext,text,text,text,text,text)'
  ]
  loop
    v_function := to_regprocedure(v_signature);
    if v_function is not null then
      execute format('alter function %s security invoker', v_function);
      execute format('revoke all on function %s from public, anon', v_function);
      execute format('grant execute on function %s to authenticated', v_function);
    end if;
  end loop;
end;
$$;

drop policy if exists "booking_requests select own workspace" on public.booking_requests;
create policy "booking_requests select own workspace"
on public.booking_requests
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "appointments select own workspace" on public.appointments;
create policy "appointments select own workspace"
on public.appointments
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "cash_movements select own workspace" on public.cash_movements;
create policy "cash_movements select own workspace"
on public.cash_movements
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "connected_cards select own workspace" on public.connected_cards;
create policy "connected_cards select own workspace"
on public.connected_cards
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "events select own workspace" on public.events;
create policy "events select own workspace"
on public.events
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "message_templates select own workspace" on public.message_templates;
create policy "message_templates select own workspace"
on public.message_templates
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "owner_app_snapshots select own workspace" on public.owner_app_snapshots;
create policy "owner_app_snapshots select own workspace"
on public.owner_app_snapshots
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "push_devices select own workspace" on public.push_devices;
create policy "push_devices select own workspace"
on public.push_devices
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "push_notifications select own workspace" on public.push_notifications;
create policy "push_notifications select own workspace"
on public.push_notifications
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "client portal revisions select own workspace"
on public.client_portal_revisions;
create policy "client portal revisions select own workspace"
on public.client_portal_revisions
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

drop policy if exists "backup_runs select own workspace" on public.backup_runs;
create policy "backup_runs select own workspace"
on public.backup_runs
for select
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);
