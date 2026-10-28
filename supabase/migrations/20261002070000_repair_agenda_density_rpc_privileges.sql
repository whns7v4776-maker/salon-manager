-- The density RPC is the only writer of its versioned preference. Workspace
-- UPDATE is deliberately restricted to a column allowlist, which excludes
-- density and its revision tokens; SECURITY INVOKER therefore fails with 42501.
-- Keep direct table access restricted. The existing RPC validates both
-- current_workspace_id() and workspace_access_allowed(), locks the scoped row,
-- and applies only a matching revision for the requested app/web surface.
alter function public.set_owner_agenda_density_preference_v1(uuid, text, text, timestamptz)
  security definer;

revoke all on function public.set_owner_agenda_density_preference_v1(uuid, text, text, timestamptz)
  from public, anon;
grant execute on function public.set_owner_agenda_density_preference_v1(uuid, text, text, timestamptz)
  to authenticated;
