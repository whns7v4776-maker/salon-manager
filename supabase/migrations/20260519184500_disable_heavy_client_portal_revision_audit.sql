-- Disable the client portal revision audit trail for now.
-- It is not part of the app's hot path, while the revision history table can
-- grow quickly and add expensive cleanup work on every client_portals change.

drop trigger if exists capture_client_portal_revision on public.client_portals;

create or replace function public.capture_client_portal_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(new, old);
end;
$$;

truncate table public.client_portal_revisions;
