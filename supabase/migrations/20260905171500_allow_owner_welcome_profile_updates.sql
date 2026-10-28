-- These profile columns were added after column-level UPDATE grants replaced
-- table-wide access. Preserve RLS and all subscription/identity restrictions.
grant update (
  client_welcome_enabled,
  client_welcome_title,
  client_welcome_message
) on table public.workspaces to authenticated;
