-- Isolated test ledger: never changes cash movements or real fiscal records.
create table if not exists public.cash_fiscal_sandbox (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id),
 status text not null default 'submitting' check (status in ('submitting','uncertain','new','submitted','ready','retry','failed')),
 provider_id uuid unique,
 document_number text,
 created_at timestamptz not null default now()
);
alter table public.cash_fiscal_sandbox enable row level security;
revoke all on public.cash_fiscal_sandbox from anon, authenticated;
grant all on public.cash_fiscal_sandbox to service_role;
create table if not exists public.cash_fiscal_settings (
 workspace_id uuid primary key references public.workspaces(id),
 settings jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.cash_fiscal_settings enable row level security;
revoke all on public.cash_fiscal_settings from anon, authenticated;
grant all on public.cash_fiscal_settings to service_role;
