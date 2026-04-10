create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.subscription_plan as enum ('demo', 'starter', 'pro');
create type public.subscription_status as enum ('demo', 'active', 'suspended', 'expired');
create type public.workspace_role as enum ('owner');
create type public.request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
create type public.request_origin as enum ('frontend', 'backoffice');
create type public.payment_method as enum ('cash', 'card', 'bank_transfer');
create type public.auth_provider as enum ('email', 'apple', 'google');
create type public.trial_check_status as enum ('pending', 'allowed', 'blocked', 'review');
create type public.trial_check_reason as enum (
  'duplicate_email',
  'duplicate_phone',
  'duplicate_provider_user',
  'duplicate_device',
  'duplicate_workspace_identity',
  'manual_review',
  'none'
);
create type public.store_platform as enum ('ios', 'android', 'manual');

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null,
  slug text not null unique,
  owner_email citext not null unique,
  owner_phone text,
  owner_profile_id uuid,
  subscription_plan public.subscription_plan not null default 'demo',
  subscription_status public.subscription_status not null default 'demo',
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  notes text,
  last_backup_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role public.workspace_role not null default 'owner',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id),
  unique (user_id),
  unique (email)
);

create table if not exists public.owner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  phone text,
  first_name text not null,
  last_name text not null,
  business_phone text,
  auth_provider public.auth_provider not null default 'email',
  provider_user_id text,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (auth_provider, provider_user_id)
);

create index if not exists owner_profiles_phone_idx on public.owner_profiles (phone);
create index if not exists owner_profiles_business_phone_idx on public.owner_profiles (business_phone);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  provider text not null default 'manual',
  store_platform public.store_platform not null default 'manual',
  external_subscription_id text,
  original_transaction_id text,
  store_customer_ref text,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  trial_used boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  last_validated_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists subscriptions_original_transaction_idx
  on public.subscriptions (store_platform, original_transaction_id)
  where original_transaction_id is not null;

create table if not exists public.device_fingerprints (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.owner_profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  device_fingerprint text not null,
  platform public.store_platform not null,
  biometric_enabled boolean not null default false,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_profile_id, device_fingerprint)
);

create index if not exists device_fingerprints_workspace_idx
  on public.device_fingerprints (workspace_id, device_fingerprint);

create table if not exists public.trial_checks (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  phone text,
  auth_provider public.auth_provider not null default 'email',
  provider_user_id text,
  device_fingerprint text,
  workspace_identity text,
  ip_hash text,
  status public.trial_check_status not null default 'pending',
  reason public.trial_check_reason not null default 'none',
  matched_profile_id uuid references public.owner_profiles(id) on delete set null,
  matched_workspace_id uuid references public.workspaces(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists trial_checks_email_idx on public.trial_checks (email);
create index if not exists trial_checks_phone_idx on public.trial_checks (phone);
create index if not exists trial_checks_provider_idx
  on public.trial_checks (auth_provider, provider_user_id);

create table if not exists public.trial_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  owner_profile_id uuid references public.owner_profiles(id) on delete set null,
  email citext not null,
  phone text,
  auth_provider public.auth_provider not null default 'email',
  provider_user_id text,
  device_fingerprint text,
  trial_check_id uuid references public.trial_checks(id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  blocked_reason public.trial_check_reason not null default 'none',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists trial_usage_email_idx on public.trial_usage (email);
create index if not exists trial_usage_phone_idx on public.trial_usage (phone);
create index if not exists trial_usage_provider_idx
  on public.trial_usage (auth_provider, provider_user_id);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, lower(name))
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  phone text,
  email citext,
  instagram text,
  note text not null default '',
  source text not null default 'salon' check (source in ('salon', 'frontend')),
  viewed_by_salon boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customers_workspace_phone_idx on public.customers (workspace_id, phone);
create index if not exists customers_workspace_email_idx on public.customers (workspace_id, email);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  requested_service_name text not null,
  requested_price numeric(10,2) not null check (requested_price >= 0),
  requested_duration_minutes integer not null default 60 check (requested_duration_minutes > 0),
  appointment_date date not null,
  appointment_time time not null,
  customer_name text not null,
  customer_surname text not null default '',
  customer_email citext not null,
  customer_phone text not null,
  customer_instagram text,
  notes text,
  origin public.request_origin not null default 'frontend',
  status public.request_status not null default 'pending',
  viewed_by_customer boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_requests_workspace_status_idx
  on public.booking_requests (workspace_id, status, appointment_date, appointment_time);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  booking_request_id uuid unique references public.booking_requests(id) on delete set null,
  appointment_date date not null,
  appointment_time time not null,
  customer_name text not null,
  service_name text not null,
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  completed boolean not null default false,
  no_show boolean not null default false,
  cashed_in boolean not null default false,
  created_by text not null default 'backoffice' check (created_by in ('frontend', 'backoffice')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists appointments_workspace_date_idx
  on public.appointments (workspace_id, appointment_date, appointment_time);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid unique references public.appointments(id) on delete set null,
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method public.payment_method,
  card_label text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.connected_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  circuit text not null,
  last4 text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists connected_cards_one_default_idx
  on public.connected_cards (workspace_id)
  where is_default = true;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time time not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  event_template text not null default 'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.',
  reminder_template text not null default 'Ciao {nome}, ti ricordiamo il tuo appuntamento presso {salone} il {data} alle {ora} per {servizio}. Ti aspettiamo!',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  backup_type text not null check (backup_type in ('daily', 'manual', 'pre_release')),
  status text not null check (status in ('queued', 'running', 'success', 'failed')),
  storage_path text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.workspace_access_allowed()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
      and w.subscription_status in ('demo', 'active')
  )
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and role = 'owner'
  )
$$;

drop trigger if exists set_updated_at_workspaces on public.workspaces;
create trigger set_updated_at_workspaces
before update on public.workspaces
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_workspace_members on public.workspace_members;
create trigger set_updated_at_workspace_members
before update on public.workspace_members
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_owner_profiles on public.owner_profiles;
create trigger set_updated_at_owner_profiles
before update on public.owner_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_subscriptions on public.subscriptions;
create trigger set_updated_at_subscriptions
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_device_fingerprints on public.device_fingerprints;
create trigger set_updated_at_device_fingerprints
before update on public.device_fingerprints
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_trial_checks on public.trial_checks;
create trigger set_updated_at_trial_checks
before update on public.trial_checks
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_trial_usage on public.trial_usage;
create trigger set_updated_at_trial_usage
before update on public.trial_usage
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_services on public.services;
create trigger set_updated_at_services
before update on public.services
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_customers on public.customers;
create trigger set_updated_at_customers
before update on public.customers
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_booking_requests on public.booking_requests;
create trigger set_updated_at_booking_requests
before update on public.booking_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_appointments on public.appointments;
create trigger set_updated_at_appointments
before update on public.appointments
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_cash_movements on public.cash_movements;
create trigger set_updated_at_cash_movements
before update on public.cash_movements
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_connected_cards on public.connected_cards;
create trigger set_updated_at_connected_cards
before update on public.connected_cards
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_events on public.events;
create trigger set_updated_at_events
before update on public.events
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_message_templates on public.message_templates;
create trigger set_updated_at_message_templates
before update on public.message_templates
for each row execute procedure public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.owner_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.device_fingerprints enable row level security;
alter table public.trial_checks enable row level security;
alter table public.trial_usage enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.booking_requests enable row level security;
alter table public.appointments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.connected_cards enable row level security;
alter table public.events enable row level security;
alter table public.message_templates enable row level security;
alter table public.backup_runs enable row level security;

drop policy if exists "workspace members can read own workspace" on public.workspaces;
create policy "workspace members can read own workspace"
on public.workspaces
for select
using (id = public.current_workspace_id());

drop policy if exists "workspace owners can update own workspace" on public.workspaces;
create policy "workspace owners can update own workspace"
on public.workspaces
for update
using (id = public.current_workspace_id())
with check (id = public.current_workspace_id());

drop policy if exists "workspace members can read membership" on public.workspace_members;
create policy "workspace members can read membership"
on public.workspace_members
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "owner profiles read own" on public.owner_profiles;
create policy "owner profiles read own"
on public.owner_profiles
for select
using (user_id = auth.uid());

drop policy if exists "owner profiles update own" on public.owner_profiles;
create policy "owner profiles update own"
on public.owner_profiles
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "workspace data select" on public.services;
create policy "workspace data select"
on public.services
for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.services;
create policy "workspace data insert"
on public.services
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.services;
create policy "workspace data update"
on public.services
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.services;
create policy "workspace data delete"
on public.services
for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "customers select own workspace" on public.customers;
create policy "customers select own workspace"
on public.customers
for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "customers insert own workspace" on public.customers;
create policy "customers insert own workspace"
on public.customers
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "customers update own workspace" on public.customers;
create policy "customers update own workspace"
on public.customers
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "customers delete own workspace" on public.customers;
create policy "customers delete own workspace"
on public.customers
for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "booking_requests select own workspace" on public.booking_requests;
create policy "booking_requests select own workspace"
on public.booking_requests
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "booking_requests insert own workspace" on public.booking_requests;
create policy "booking_requests insert own workspace"
on public.booking_requests
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "booking_requests update own workspace" on public.booking_requests;
create policy "booking_requests update own workspace"
on public.booking_requests
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "appointments select own workspace" on public.appointments;
create policy "appointments select own workspace"
on public.appointments
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "appointments insert own workspace" on public.appointments;
create policy "appointments insert own workspace"
on public.appointments
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "appointments update own workspace" on public.appointments;
create policy "appointments update own workspace"
on public.appointments
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "appointments delete own workspace" on public.appointments;
create policy "appointments delete own workspace"
on public.appointments
for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "cash_movements select own workspace" on public.cash_movements;
create policy "cash_movements select own workspace"
on public.cash_movements
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "cash_movements insert own workspace" on public.cash_movements;
create policy "cash_movements insert own workspace"
on public.cash_movements
for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "cash_movements update own workspace" on public.cash_movements;
create policy "cash_movements update own workspace"
on public.cash_movements
for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "connected_cards select own workspace" on public.connected_cards;
create policy "connected_cards select own workspace"
on public.connected_cards
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "connected_cards mutate own workspace" on public.connected_cards;
create policy "connected_cards mutate own workspace"
on public.connected_cards
for all
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "events select own workspace" on public.events;
create policy "events select own workspace"
on public.events
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "events mutate own workspace" on public.events;
create policy "events mutate own workspace"
on public.events
for all
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "message_templates select own workspace" on public.message_templates;
create policy "message_templates select own workspace"
on public.message_templates
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "message_templates mutate own workspace" on public.message_templates;
create policy "message_templates mutate own workspace"
on public.message_templates
for all
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "subscriptions select own workspace" on public.subscriptions;
create policy "subscriptions select own workspace"
on public.subscriptions
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists "device_fingerprints read own profile" on public.device_fingerprints;
create policy "device_fingerprints read own profile"
on public.device_fingerprints
for select
using (
  owner_profile_id in (
    select id from public.owner_profiles where user_id = auth.uid()
  )
);

drop policy if exists "device_fingerprints mutate own profile" on public.device_fingerprints;
create policy "device_fingerprints mutate own profile"
on public.device_fingerprints
for all
using (
  owner_profile_id in (
    select id from public.owner_profiles where user_id = auth.uid()
  )
)
with check (
  owner_profile_id in (
    select id from public.owner_profiles where user_id = auth.uid()
  )
);

drop policy if exists "trial_checks admin read" on public.trial_checks;
create policy "trial_checks admin read"
on public.trial_checks
for select
using (public.is_admin_user());

drop policy if exists "trial_checks admin mutate" on public.trial_checks;
create policy "trial_checks admin mutate"
on public.trial_checks
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "trial_usage admin read" on public.trial_usage;
create policy "trial_usage admin read"
on public.trial_usage
for select
using (public.is_admin_user());

drop policy if exists "trial_usage admin mutate" on public.trial_usage;
create policy "trial_usage admin mutate"
on public.trial_usage
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "backup_runs select own workspace" on public.backup_runs;
create policy "backup_runs select own workspace"
on public.backup_runs
for select
using (workspace_id = public.current_workspace_id());
