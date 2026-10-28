-- Isolated sandbox pipeline. No real cash movements or customer records are changed.
alter table public.cash_fiscal_sandbox drop constraint cash_fiscal_sandbox_status_check;
alter table public.cash_fiscal_sandbox add constraint cash_fiscal_sandbox_status_check check (status in ('waiting_payment','submitting','uncertain','new','submitted','ready','retry','failed'));
alter table public.cash_fiscal_sandbox
 add column payment_status text check(payment_status in ('pending','succeeded','failed')),
 add column payment_scenario text check(payment_scenario in ('success','declined')),
 add column stripe_account text,
 add column stripe_intent text unique,
 add column paid_at timestamptz;
-- Only one unresolved provider submission per tester. Waiting for Stripe is also an active attempt.
drop index if exists cash_fiscal_one_uncertain;
create unique index cash_fiscal_sandbox_flow_pending on public.cash_fiscal_sandbox(workspace_id) where status in ('waiting_payment','submitting','uncertain');
