create type public.push_event_type as enum (
  'booking_request_created',
  'booking_request_status_changed',
  'appointment_cancelled',
  'custom'
);

create type public.push_delivery_status as enum ('queued', 'sent', 'failed');

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_email citext not null,
  expo_push_token text not null unique,
  platform public.store_platform not null default 'manual',
  device_model text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, expo_push_token)
);

create index if not exists push_devices_workspace_active_idx
  on public.push_devices (workspace_id, is_active, last_seen_at desc);

create table if not exists public.push_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_id uuid references public.push_devices(id) on delete set null,
  event_type public.push_event_type not null default 'custom',
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.push_delivery_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists push_notifications_queue_idx
  on public.push_notifications (status, created_at asc);

create index if not exists push_notifications_workspace_idx
  on public.push_notifications (workspace_id, created_at desc);

create or replace function public.upsert_push_device(
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
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_workspace_id is null or p_workspace_id <> public.current_workspace_id() then
    raise exception 'workspace_not_allowed';
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

create or replace function public.queue_workspace_push(
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

create or replace function public.claim_push_notifications(p_limit integer default 50)
returns table (
  notification_id uuid,
  expo_push_token text,
  title text,
  body text,
  payload jsonb
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select
      notification.id,
      device.expo_push_token,
      notification.title,
      notification.body,
      notification.payload
    from public.push_notifications as notification
    join public.push_devices as device
      on device.id = notification.device_id
    where notification.status = 'queued'
      and device.is_active = true
      and device.expo_push_token is not null
      and device.expo_push_token <> ''
    order by notification.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update of notification skip locked
  ),
  bumped as (
    update public.push_notifications as notification
    set attempts = notification.attempts + 1,
        updated_at = timezone('utc', now())
    from candidates
    where notification.id = candidates.id
    returning
      candidates.id as notification_id,
      candidates.expo_push_token,
      candidates.title,
      candidates.body,
      candidates.payload
  )
  select * from bumped;
$$;

create or replace function public.mark_push_notification_result(
  p_notification_id uuid,
  p_status public.push_delivery_status,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_notifications
  set status = p_status,
      last_error = case when p_status = 'failed' then p_error else null end,
      sent_at = case when p_status = 'sent' then timezone('utc', now()) else sent_at end,
      updated_at = timezone('utc', now())
  where id = p_notification_id;
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
begin
  if tg_op = 'INSERT' then
    if new.origin = 'frontend' and new.status = 'pending' then
      v_title := 'Nuova richiesta prenotazione';
      v_body := coalesce(new.customer_name, 'Cliente') || ' - ' || new.requested_service_name || ' alle ' || to_char(new.appointment_time, 'HH24:MI');

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

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_title := 'Aggiornamento prenotazione';
    v_body := 'Stato richiesta: ' || new.status;

    v_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      'bookingRequestId', new.id,
      'status', new.status,
      'appointmentDate', new.appointment_date,
      'appointmentTime', new.appointment_time,
      'customerName', new.customer_name,
      'serviceName', new.requested_service_name
    );

    perform public.queue_workspace_push(
      new.workspace_id,
      'booking_request_status_changed',
      v_title,
      v_body,
      v_payload
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_updated_at_push_devices on public.push_devices;
create trigger set_updated_at_push_devices
before update on public.push_devices
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_push_notifications on public.push_notifications;
create trigger set_updated_at_push_notifications
before update on public.push_notifications
for each row execute procedure public.set_updated_at();

drop trigger if exists booking_requests_push_queue_trigger on public.booking_requests;
create trigger booking_requests_push_queue_trigger
after insert or update of status on public.booking_requests
for each row execute procedure public.handle_booking_requests_push_queue();

alter table public.push_devices enable row level security;
alter table public.push_notifications enable row level security;

drop policy if exists "push_devices select own workspace" on public.push_devices;
create policy "push_devices select own workspace"
on public.push_devices
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "push_devices mutate own workspace" on public.push_devices;
create policy "push_devices mutate own workspace"
on public.push_devices
for all
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "push_notifications select own workspace" on public.push_notifications;
create policy "push_notifications select own workspace"
on public.push_notifications
for select
using (workspace_id = public.current_workspace_id());

grant execute on function public.upsert_push_device(uuid, citext, text, public.store_platform, text, text) to authenticated;
grant execute on function public.queue_workspace_push(uuid, public.push_event_type, text, text, jsonb) to authenticated;
