/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260903103000_cache_public_booking_owner_payload_per_request.sql',
  ),
  'utf8',
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(migration)) throw new Error(message);
};

requirePattern(
  /get_public_portal_owner_payload_cached_v1\([\s\S]*?current_setting\('salonpro\.public_booking_payload_workspace_id',[\s\S]*?current_setting\('salonpro\.public_booking_payload_json',[\s\S]*?get_public_portal_owner_payload\(p_workspace_id\)[\s\S]*?set_config\([\s\S]*?'salonpro\.public_booking_payload_workspace_id'[\s\S]*?set_config\([\s\S]*?'salonpro\.public_booking_payload_json'/,
  'The cache must be transaction-local, workspace-scoped and backed by the canonical owner payload.',
);
requirePattern(
  /is_public_booking_service_available\(uuid,text\)[\s\S]*?is_public_booking_time_allowed_by_availability\(uuid,date,time without time zone,integer\)[\s\S]*?is_public_booking_slot_available\(uuid,date,time without time zone,integer,text,text,text\)/,
  'Every shared public availability reader must use the same cached payload source.',
);
requirePattern(
  /pg_get_functiondef[\s\S]*?replace\([\s\S]*?'public\.get_public_portal_owner_payload\(p_workspace_id\)'[\s\S]*?'public\.get_public_portal_owner_payload_cached_v1\(p_workspace_id\)'/,
  'The migration must preserve the deployed availability definitions and patch only their payload source.',
);
requirePattern(
  /revoke all on function public\.get_public_portal_owner_payload_cached_v1\(uuid\)[\s\S]*?from public, anon, authenticated/,
  'The internal cache helper must not become a new public RPC.',
);

console.log('Public booking payload cache contracts verified.');
