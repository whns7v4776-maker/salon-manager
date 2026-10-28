-- DISABLED SAFETY PATCH
-- This migration previously deleted every owner/workspace not present in a tiny allowlist.
-- Keeping that behavior in the repo is too dangerous because a fresh db push or a new environment
-- could wipe legitimate salon data again.
--
-- Important:
-- - This file is now intentionally a no-op.
-- - It does NOT restore data already deleted in a remote database.
-- - It only prevents future environments from replaying the destructive prune logic.

do $$
begin
  raise notice '20260504002000_prune_owner_accounts_to_allowlist.sql disabled intentionally';
end
$$;
