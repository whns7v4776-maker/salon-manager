create table if not exists public.instagram_assistant_settings (
  singleton boolean primary key default true check (singleton),
  automation_enabled boolean not null default false,
  dry_run boolean not null default true,
  model text not null default 'gpt-5-mini',
  confidence_threshold numeric(4, 3) not null default 0.780
    check (confidence_threshold between 0 and 1),
  max_history_messages integer not null default 16
    check (max_history_messages between 4 and 40),
  reply_delay_seconds integer not null default 0
    check (reply_delay_seconds between 0 and 300),
  tone text not null default
    'Italiano semplice, cordiale e professionale. Frasi brevi, mai insistenti.',
  business_context text not null default
    'SalonPro è un gestionale per saloni con agenda, operatori, servizi, clienti, prenotazioni online e promemoria.',
  handoff_message text not null default
    'Grazie, passo la conversazione a Marzio così può seguirti personalmente.',
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.instagram_assistant_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.instagram_contacts (
  id uuid primary key default gen_random_uuid(),
  instagram_scoped_user_id text not null unique,
  username text,
  display_name text,
  crm_stage text not null default 'new'
    check (crm_stage in (
      'new', 'interested', 'trial', 'customer', 'subscriber', 'support', 'not_interested'
    )),
  tags text[] not null default '{}',
  notes text,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.instagram_contacts(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'human_required', 'human_active', 'closed')),
  ai_enabled boolean not null default true,
  summary text,
  detected_intent text,
  handoff_reason text,
  last_message_at timestamptz not null default timezone('utc', now()),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (contact_id)
);

create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.instagram_conversations(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('customer', 'assistant', 'human')),
  message_type text not null default 'text',
  body text,
  status text not null default 'received'
    check (status in ('received', 'draft', 'queued', 'sent', 'failed', 'ignored')),
  reply_to_message_id uuid references public.instagram_messages(id) on delete set null,
  openai_response_id text,
  raw_payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create index if not exists instagram_messages_conversation_created_idx
  on public.instagram_messages (conversation_id, created_at desc);

create table if not exists public.instagram_inbox_jobs (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid not null unique
    references public.instagram_messages(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists instagram_inbox_jobs_claim_idx
  on public.instagram_inbox_jobs (status, available_at, created_at);

create table if not exists public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  object_type text,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now())
);

alter table public.instagram_assistant_settings enable row level security;
alter table public.instagram_contacts enable row level security;
alter table public.instagram_conversations enable row level security;
alter table public.instagram_messages enable row level security;
alter table public.instagram_inbox_jobs enable row level security;
alter table public.instagram_webhook_events enable row level security;

revoke all on public.instagram_assistant_settings from anon, authenticated;
revoke all on public.instagram_contacts from anon, authenticated;
revoke all on public.instagram_conversations from anon, authenticated;
revoke all on public.instagram_messages from anon, authenticated;
revoke all on public.instagram_inbox_jobs from anon, authenticated;
revoke all on public.instagram_webhook_events from anon, authenticated;

create or replace function public.claim_instagram_inbox_jobs(p_limit integer default 5)
returns setof public.instagram_inbox_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select job.id
    from public.instagram_inbox_jobs as job
    where (
      job.status = 'pending'
      or (
        job.status = 'processing'
        and job.locked_at < timezone('utc', now()) - interval '5 minutes'
      )
    )
      and job.available_at <= timezone('utc', now())
      and job.attempts < 5
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.instagram_inbox_jobs as job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    locked_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from claimable
  where job.id = claimable.id
  returning job.*;
end;
$$;

revoke all on function public.claim_instagram_inbox_jobs(integer) from public;
grant execute on function public.claim_instagram_inbox_jobs(integer) to service_role;

comment on table public.instagram_assistant_settings is
  'Non-secret Instagram assistant behavior configuration. Tokens remain in Edge Function secrets.';
comment on table public.instagram_inbox_jobs is
  'Idempotent asynchronous queue populated by Meta webhooks and consumed by the AI worker.';
