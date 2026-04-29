alter table public.workspaces
  add column if not exists cash_section_disabled boolean not null default false;
