alter table public.cash_fiscal_sandbox
 add column refund_status text check (refund_status in ('pending','succeeded','failed','uncertain')),
 add column refund_id text unique,
 add column refund_requested_at timestamptz,
 add column void_status text check (void_status in ('submitting','uncertain','new','submitted','ready','retry','failed')),
 add column void_id uuid unique,
 add column void_number text;
