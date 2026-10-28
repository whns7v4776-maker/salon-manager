const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
  __dirname,
  '../supabase/migrations/20260831233000_harden_service_realtime_and_portal_projection.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const clientPortalSource = fs.readFileSync(
  path.resolve(__dirname, '../src/lib/client-portal.ts'),
  'utf8',
);
const atomicBookingSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/20260601184500_ignore_cancelled_customer_conflicts_in_public_booking_create.sql',
  ),
  'utf8',
);
const slotAvailabilitySource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/20260701003000_treat_salon_capacity_roles_as_public_slot_capacity.sql',
  ),
  'utf8',
);
const dependencyBookingSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/20260811183000_client_service_dependencies.sql',
  ),
  'utf8',
);
const compositionBookingSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/20260807150000_public_composition_split_operators.sql',
  ),
  'utf8',
);

for (const table of [
  'services',
  'service_compositions',
  'service_composition_items',
]) {
  assert.match(
    sql,
    new RegExp(`alter table public\\.${table} replica identity full`, 'i'),
    `${table} must retain workspace_id in filtered DELETE events.`,
  );
  assert.match(
    sql,
    new RegExp(
      `pg_publication_tables[\\s\\S]*?tablename = '${table}'[\\s\\S]*?alter publication supabase_realtime[\\s\\S]*?add table public\\.${table}`,
      'i',
    ),
    `${table} must be added to supabase_realtime idempotently.`,
  );
}

assert.match(
  sql,
  /service\.is_online = true[\s\S]*?coalesce\(service\.composition_only, false\) = false[\s\S]*?service\.superseded_by_composition_id is null/i,
  'The public portal projection must exclude archived, private, and superseded services.',
);
assert.match(
  sql,
  /existing_item ->> 'nome'[\s\S]*?existing_item ->> 'mestiereRichiesto'[\s\S]*?existing_item ->> 'required_role'[\s\S]*?service\.required_role/i,
  'Legacy name fallback must also match the role when present, so same-name services cannot exchange stale fields across professions.',
);
assert.match(
  sql,
  /'disponibileOnline', true[\s\S]*?'soloComposizione', false[\s\S]*?'compositionId', null[\s\S]*?'supersededByCompositionId', null/i,
  'Canonical projection must clear stale private/composition markers retained by an older snapshot item.',
);
assert.match(
  sql,
  /jsonb_typeof\(existing_item\) = 'object'/i,
  'Corrupt scalar snapshot entries must not be merged into a canonical public service object.',
);
assert.match(
  sql,
  /create or replace function public\.sync_client_portal_services\([\s\S]*?public\.project_public_services_v1\(\s*portal\.workspace_id,\s*portal\.servizi\s*\)/i,
  'The client_portals copy must use the shared canonical service projection.',
);
assert.match(
  sql,
  /create or replace function public\.get_public_portal_owner_payload\([\s\S]*?snapshot_payload\.payload \|\| jsonb_build_object\([\s\S]*?'servizi',[\s\S]*?public\.project_public_services_v1\(/i,
  'Public snapshot/catalog reads must overlay services from the canonical table instead of trusting an owner snapshot.',
);
assert.match(
  sql,
  /when jsonb_typeof\(raw_payload\.payload\) = 'object'[\s\S]*?else '\{\}'::jsonb/i,
  'A corrupt non-object owner payload must be normalized before the canonical service field is overlaid.',
);
assert.match(
  sql,
  /revoke all on function public\.sync_client_portal_services\(uuid\)[\s\S]*?from public, anon[\s\S]*?grant execute[\s\S]*?to authenticated/i,
  'The SECURITY DEFINER projection helper must not remain directly executable by public or anon.',
);
assert.match(
  sql,
  /revoke all on function public\.project_public_services_v1\(uuid, jsonb\)[\s\S]*?from public, anon, authenticated/i,
  'The canonical projection helper must only be callable by trusted server functions.',
);
assert.match(
  sql,
  /revoke all on function public\.get_public_portal_owner_payload\(uuid\)[\s\S]*?from public, anon, authenticated/i,
  'The private owner payload helper must never be exposed as a direct RPC.',
);
assert.match(
  sql,
  /create or replace function public\.is_public_booking_service_available_v2\([\s\S]*?service\.is_online = true[\s\S]*?coalesce\(service\.composition_only, false\) = false[\s\S]*?service\.superseded_by_composition_id is null[\s\S]*?service\.required_role/i,
  'The booking write guard must resolve an active canonical service by name and role.',
);
assert.match(
  sql,
  /v_canonical_guard text :=[\s\S]*?is_public_booking_service_available_v2\(v_workspace\.id, v_service_name, v_required_role\)[\s\S]*?pg_get_functiondef\(v_signature\)[\s\S]*?replace\(v_definition, v_legacy_guard, v_canonical_guard\)/i,
  'The canonical atomic booking writer must use the role-aware service guard.',
);
assert.match(
  sql,
  /revoke all on function public\.is_public_booking_service_available_v2\([\s\S]*?uuid,[\s\S]*?text,[\s\S]*?text[\s\S]*?\) from public, anon, authenticated/i,
  'The internal booking guard must not become a directly callable RPC.',
);
assert.match(
  sql,
  /grant execute on function public\.get_client_portal_snapshot\(text\)[\s\S]*?to anon, authenticated/i,
  'The safe public snapshot entrypoint must remain callable after helper hardening.',
);
assert.match(
  sql,
  /grant execute on function public\.get_client_portal_catalog\(text\)[\s\S]*?to anon, authenticated/i,
  'The safe lightweight catalog entrypoint must remain callable after helper hardening.',
);

assert.match(
  clientPortalSource,
  /const isServiceAvailableOnline = \(item: Record<string, any>\) =>[\s\S]*?disponibileOnline[\s\S]*?!== false[\s\S]*?soloComposizione[\s\S]*?!== true/,
  'The app/web publisher must also exclude archived and composition-only rows before sending a portal snapshot.',
);
assert.match(
  atomicBookingSource,
  /create or replace function public\.is_public_booking_service_available\([\s\S]*?get_public_portal_owner_payload\(p_workspace_id\) -> 'servizi'/i,
  'The active atomic booking gate must derive its catalog from the hardened owner-payload helper, not client_portals.servizi.',
);
assert.match(
  atomicBookingSource,
  /create or replace function public\.create_public_booking_request_ultralight_v2\([\s\S]*?is_public_booking_service_available\(v_workspace\.id, v_service_name\)/i,
  'Every ordinary/phased wrapper must reach the canonical service gate through the atomic v2 writer.',
);
assert.match(
  slotAvailabilitySource,
  /create or replace function public\.is_public_booking_slot_available\([\s\S]*?get_public_portal_owner_payload\(p_workspace_id\)[\s\S]*?v_owner_payload -> 'servizi'/i,
  'The active slot engine must derive service eligibility from the hardened owner-payload helper.',
);
assert.match(
  dependencyBookingSource,
  /create or replace function public\.create_public_booking_dependency_v1\([\s\S]*?from public\.services as service[\s\S]*?service\.is_online is true[\s\S]*?service\.superseded_by_composition_id is null/i,
  'Dependency writes must validate their services against canonical online rows.',
);
const compositionWriterStart = compositionBookingSource.indexOf(
  'create or replace function public.create_public_booking_composition_v1(',
);
assert.notEqual(
  compositionWriterStart,
  -1,
  'The canonical public composition writer must exist.',
);
const compositionWriterSource = compositionBookingSource.slice(
  compositionWriterStart,
);
assert.match(
  compositionWriterSource,
  /join public\.services as service/i,
  'Composition writes must join canonical service rows in the write transaction.',
);
assert.match(
  compositionWriterSource,
  /service\.is_online is not false/i,
  'Composition writes must reject archived components in the write transaction.',
);
assert.match(
  compositionWriterSource,
  /service\.superseded_by_composition_id is null/i,
  'Composition writes must reject superseded components in the write transaction.',
);

const migrationOutsideFunction = sql.replace(
  /create or replace function public\.sync_client_portal_services\([\s\S]*?\$\$;/i,
  '',
);
assert.doesNotMatch(
  migrationOutsideFunction,
  /\b(?:insert\s+into|update|delete\s+from|truncate)\s+public\.(?:services|service_compositions|service_composition_items|client_portals|owner_app_snapshots|workspaces)\b/i,
  'Installing this migration must not mutate account rows.',
);

console.log('Contratto Realtime catalogo servizi e composizioni verificato.');
