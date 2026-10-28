-- Owner-managed extra salon contacts; keep the primary mobile unchanged.
alter table public.workspaces add column if not exists additional_phones jsonb not null default '[]'::jsonb;
alter table public.workspaces add constraint workspaces_additional_phones_array check (jsonb_typeof(additional_phones) = 'array');
grant update (additional_phones) on table public.workspaces to authenticated;
