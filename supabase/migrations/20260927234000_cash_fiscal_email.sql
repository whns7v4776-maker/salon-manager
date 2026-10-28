alter table public.cash_fiscal_sandbox add column email_status text not null default 'not_sent' check (email_status in ('not_sent','sending','accepted','delivered','uncertain','failed'));
alter table public.cash_fiscal_sandbox add column email_id text;
create unique index cash_fiscal_one_uncertain on public.cash_fiscal_sandbox(workspace_id)
where status in ('submitting','uncertain');
