/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260901001000_update_existing_services_atomically.sql',
  ),
  'utf8',
);
const context = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const servicesScreen = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);

const functionMatch = migration.match(
  /create or replace function public\.update_existing_services_v1\([\s\S]*?\)\s*returns jsonb[\s\S]*?as \$\$([\s\S]*?)\$\$;/i,
);
assert.ok(functionMatch, 'Missing update_existing_services_v1 RPC.');
const body = functionMatch[1];

assert.match(
  migration,
  /security definer\s+set search_path = public, pg_temp/i,
  'The service update RPC must be SECURITY DEFINER with a fixed search_path.',
);
assert.match(body, /if auth\.uid\(\) is null then/i, 'Missing auth guard.');
assert.match(
  body,
  /v_workspace_id\s*:=\s*public\.current_workspace_id\(\)/i,
  'Workspace identity must come from the authenticated session.',
);
assert.match(
  body,
  /v_workspace_id is null or not public\.workspace_access_allowed\(\)/i,
  'Missing workspace access guard.',
);
assert.match(
  body,
  /jsonb_typeof\([\s\S]*?<> 'array'[\s\S]*?v_requested_count < 1/i,
  'The RPC must reject non-array and empty payloads.',
);
assert.match(
  body,
  /count\(distinct lower\(requested\.item ->> 'id'\)\)[\s\S]*?v_unique_count <> v_requested_count/i,
  'Every requested service ID must be valid and unique.',
);
assert.match(
  body,
  /pg_advisory_xact_lock[\s\S]*?for update of service[\s\S]*?v_locked_count <> v_requested_count/i,
  'All canonical targets must be locked and counted before the update.',
);

const updateIndex = body.indexOf('update public.services as service');
const preflightIndex = body.indexOf('v_locked_count <> v_requested_count');
assert.ok(
  preflightIndex >= 0 && updateIndex > preflightIndex,
  'The complete target preflight must happen before the service UPDATE.',
);
assert.doesNotMatch(
  body,
  /\binsert\s+into\s+public\.services\b/i,
  'The existing-service RPC must never contain an INSERT path.',
);
assert.doesNotMatch(
  body,
  /\bupsert\b/i,
  'The existing-service RPC must never contain an UPSERT path.',
);

for (const field of [
  'name',
  'description',
  'price',
  'original_price',
  'discount_enabled',
  'discount_valid_from',
  'discount_valid_to',
  'discount_start_time',
  'discount_end_time',
  'discount_weekdays',
  'duration_minutes',
  'required_role',
  'client_badge',
  'client_role_display_order',
  'client_display_order',
  'is_online',
  'composition_only',
  'composition_source_kind',
  'composition_source_service_id',
  'composition_source_phase',
  'phase_config',
  'linked_service_config',
]) {
  assert.match(
    body,
    new RegExp(`requested\\.item \\? '${field}'`),
    `The atomic patch contract must preserve omitted ${field}.`,
  );
}
assert.match(
  body,
  /'updatedIds',\s*to_jsonb\(v_updated_ids\)[\s\S]*?'services',\s*v_canonical_services/,
  'The RPC must return the exact updated IDs and canonical workspace services.',
);
assert.match(
  migration,
  /revoke all on function public\.update_existing_services_v1\(jsonb\)[\s\S]*?from public, anon, service_role/i,
  'PUBLIC, anon, and service_role must not execute the RPC.',
);
assert.match(
  migration,
  /grant execute on function public\.update_existing_services_v1\(jsonb\)[\s\S]*?to authenticated/i,
  'Only authenticated owners may execute the RPC.',
);

assert.match(
  context,
  /supabase\.rpc\(\s*'update_existing_services_v1',[\s\S]*?p_services:\s*rowsToUpdate/,
  'Existing canonical updates must use the transactional RPC.',
);
assert.match(
  context,
  /explicitlyChangedServiceFields\.forEach\([\s\S]*?scopedUpdate\[field\] = item\[field\]/,
  'The client must send field-scoped patches, not complete stale service rows.',
);
assert.doesNotMatch(
  context.slice(
    context.indexOf("'update_existing_services_v1'"),
    context.indexOf('if (rowsToInsert.length > 0)'),
  ),
  /\.upsert\(/,
  'A missing or rejected atomic RPC must never fall back to UPSERT.',
);
assert.match(
  context,
  /isMissingUpdateExistingServicesRpcError[\s\S]*?installa prima la migration atomica e riprova/,
  'A missing RPC must fail closed with a deployment-order error.',
);

assert.match(
  servicesScreen,
  /const changedOrderServiceIds = nextServices[\s\S]*?changedServiceIds:\s*changedOrderServiceIds,[\s\S]*?changedServiceFields:\s*\[\s*'client_role_display_order',\s*'client_display_order',?\s*\][\s\S]*?requireExistingChangedServiceIds:\s*true/,
  'Catalogue ordering may update only its two order fields.',
);
const onlinePatchMatches = servicesScreen.match(
  /changedServiceFields:\s*\['is_online'\]/g,
);
assert.equal(
  onlinePatchMatches?.length,
  2,
  'Single and profession archive/restore actions must update only is_online.',
);
assert.match(
  servicesScreen,
  /const changedExistingServiceFields:[\s\S]*?\.filter\(\(\[, changed\]\) => changed\)[\s\S]*?changedServiceFields:\s*changedExistingServiceFields/,
  'Service editing must send only fields that actually changed in the form.',
);

console.log('Atomic existing-service update contracts: OK');
