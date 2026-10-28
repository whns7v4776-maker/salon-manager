-- Keep a durable, idempotent ledger of real production subscription money.
-- Trials and sandbox transactions never enter this table.
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  revenuecat_event_id text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_kind text not null check (event_kind in ('charge', 'refund', 'refund_reversal')),
  event_type text not null,
  store_platform public.store_platform not null,
  transaction_id text,
  original_transaction_id text,
  product_id text,
  purchased_at timestamptz not null,
  amount numeric(14, 4),
  currency text check (currency ~ '^[A-Z]{3}$'),
  amount_usd numeric(14, 4),
  tax_percentage numeric(8, 6),
  commission_percentage numeric(8, 6),
  environment text not null check (environment = 'PRODUCTION'),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscription_payments_workspace_purchased_idx
  on public.subscription_payments (workspace_id, purchased_at desc);

create index if not exists subscription_payments_currency_purchased_idx
  on public.subscription_payments (currency, purchased_at desc);

alter table public.subscription_payments enable row level security;

revoke all on table public.subscription_payments from public, anon, authenticated;
grant select, insert, update on table public.subscription_payments to service_role;

comment on table public.subscription_payments is
  'Production RevenueCat charge/refund ledger. Known prices are signed and stored in the purchased currency.';
