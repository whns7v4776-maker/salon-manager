/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../app/(tabs)/servizi.tsx'),
  'utf8',
);
const appContextSource = fs.readFileSync(
  path.resolve(__dirname, '../src/context/AppContext.tsx'),
  'utf8',
);
const atomicServiceMigrationSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/20260901001000_update_existing_services_atomically.sql',
  ),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const sliceContextBetween = (startToken, endToken, label) => {
  const start = appContextSource.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = appContextSource.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return appContextSource.slice(start, end);
};

const bulkPersistence = sliceBetween(
  'const aggiornaDisponibilitaOnlineMestiere = (',
  'const gestisciArchivioMestiere = (',
  'bulk role persistence',
);

assert.match(
  bulkPersistence,
  /service\.soloComposizione\s*!==\s*true/,
  'Profession bulk actions must leave private components saved and derive their visibility from the active profession.',
);
assert.match(
  bulkPersistence,
  /normalizeRoleName\(service\.mestiereRichiesto\s*\?\?\s*''\)\s*===\s*normalizedRole/,
  'The operation must target one normalized profession only.',
);
assert.match(
  bulkPersistence,
  /const currentServices = latestServicesForBulkAvailabilityRef\.current/,
  'The confirmation must derive targets from the latest catalogue, not the render that opened the dialog.',
);
assert.match(
  bulkPersistence,
  /const targetServiceIds = Array\.from\([\s\S]*?new Set\([\s\S]*?service\.id\.trim\(\)[\s\S]*?filter\(Boolean\)/,
  'The exact non-empty canonical target IDs must be deduplicated before saving.',
);
assert.match(
  bulkPersistence,
  /await saveServicesPersisted\(nextServicesPreview,\s*\{\s*changedServiceIds:\s*targetServiceIds,\s*changedServiceFields:\s*\['is_online'\],\s*requireExistingChangedServiceIds:\s*true,?\s*\}\)/,
  'All profession rows must be confirmed by one targeted authoritative save.',
);
assert.match(
  bulkPersistence,
  /targetServiceIdSet\.has\(service\.id\.trim\(\)\)/,
  'The preview must apply the exact normalized IDs that are sent to persistence.',
);
assert.doesNotMatch(
  bulkPersistence,
  /setServizi\(/,
  'The bulk action must not show a locally successful half-state before server confirmation.',
);
assert.match(
  bulkPersistence,
  /setIsServiceSaving\(true\)[\s\S]*?finally\s*\{[\s\S]*?setIsServiceSaving\(false\)/,
  'Concurrent service mutations must remain locked until the whole bulk save settles.',
);
assert.match(
  bulkPersistence,
  /if \(serviceBulkAvailabilityInFlightRef\.current \|\| isServiceSaving\) return;[\s\S]*?serviceBulkAvailabilityInFlightRef\.current = true;[\s\S]*?finally\s*\{[\s\S]*?serviceBulkAvailabilityInFlightRef\.current = false;/,
  'A synchronous ref lock must reject a double confirmation before React can re-render the disabled state.',
);

const backendPersistence = sliceContextBetween(
  'const syncServicesTableForWorkspace = React.useCallback(',
  'const syncOperatorsTableForWorkspace = React.useCallback(',
  'authoritative service persistence',
);
assert.match(
  backendPersistence,
  /requireExistingChangedServiceIds\?: boolean/,
  'The backend persistence contract must expose an opt-in exact-existing-target guard.',
);
assert.match(
  backendPersistence,
  /if \(options\?\.requireExistingChangedServiceIds\)[\s\S]*?const activeCanonicalServiceIds = new Set\([\s\S]*?activeCurrentRows\.map\([\s\S]*?const unresolvedChangedServiceIds = Array\.from\([\s\S]*?explicitlyChangedServiceIds[\s\S]*?!activeCanonicalServiceIds\.has\(serviceId\)[\s\S]*?throw new Error/,
  'Every bulk target ID must resolve exactly inside the active canonical rows of the current workspace.',
);
assert.match(
  backendPersistence,
  /const isExactOnlineAvailabilityUpdate = !!\([\s\S]*?requireExistingChangedServiceIds === true[\s\S]*?if \(isExactOnlineAvailabilityUpdate\)[\s\S]*?localServiceByCanonicalId[\s\S]*?matchedService\.count !== 1[\s\S]*?throw new Error[\s\S]*?supabase\.rpc\(\s*'update_existing_services_v1'/,
  'The fast bulk path must reject invalid or duplicate local IDs before calling the atomic RPC.',
);
assert.match(
  atomicServiceMigrationSource,
  /for v_locked_id in[\s\S]*?for update of service[\s\S]*?if v_locked_count <> v_requested_count then[\s\S]*?service_update_target_changed[\s\S]*?with requested as \([\s\S]*?update public\.services/,
  'The atomic RPC must lock and resolve every requested canonical row before making any service update.',
);
const firstServiceWriteIndex = backendPersistence.indexOf(
  "supabase.rpc(\n            'update_existing_services_v1'",
);
assert.notEqual(
  firstServiceWriteIndex,
  -1,
  'The exact-target bulk path must call the atomic existing-service RPC.',
);
assert.doesNotMatch(
  backendPersistence.slice(firstServiceWriteIndex),
  /\.from\('services'\)[\s\S]*?\.upsert\(rowsToUpdate/,
  'An existing-service bulk update must never fall back to UPSERT.',
);

const saveServicesPersistence = sliceContextBetween(
  'const saveServicesPersisted = React.useCallback(',
  'const saveOperatorsPersisted = React.useCallback(',
  'public service persistence',
);
assert.match(
  saveServicesPersistence,
  /requireExistingChangedServiceIds:\s*options\?\.requireExistingChangedServiceIds/,
  'The public save helper must propagate the exact-existing-target guard unchanged.',
);
assert.match(
  saveServicesPersistence,
  /changedServiceFields:\s*options\?\.changedServiceFields/,
  'The public save helper must propagate the field-scoped update contract.',
);
assert.match(
  saveServicesPersistence,
  /servicesPersistenceDirtyRef\.current\s*=\s*options\?\.requireExistingChangedServiceIds\s*!==\s*true/,
  'A failed non-optimistic bulk must release the dirty guard so server refresh can repair a stale catalogue.',
);
assert.match(
  saveServicesPersistence,
  /error\.message\.startsWith\('Operazione massiva servizi annullata:'\)[\s\S]*?error:\s*exactTargetError/,
  'An exact-target preflight failure must explain that the authoritative catalogue changed.',
);

const roleAction = sliceBetween(
  'const gestisciArchivioMestiere = (',
  'const gestisciArchivioServizio = (',
  'bulk role confirmation',
);
assert.match(roleAction, /Ripristina tutto/);
assert.match(roleAction, /Archivia tutto/);
assert.match(roleAction, /appuntamenti, richieste, componenti privati o storico/);
assert.match(roleAction, /componenti privati salvati ricompariranno automaticamente/);

const gridRenderer = sliceBetween(
  'const renderServiceGridRow = useCallback(',
  '\n\n  return (',
  'shared app/web service grid',
);
assert.match(
  gridRenderer,
  /gestisciArchivioMestiere\([\s\S]*?row\.availability/,
  'The shared service grid must expose the profession action for online and archive sections.',
);
assert.match(gridRenderer, /'Ripristina tutto'/);
assert.match(gridRenderer, /'Archivia tutto'/);
assert.match(
  gridRenderer,
  /disabled=\{isServiceSaving\}/,
  'Bulk actions must reject double taps while any service save is in progress.',
);

// Executable selection example: the archive action changes every public row
// of exactly one profession. Private components remain saved and their popup
// visibility follows whether the profession has an online public service.
const services = [
  { id: 'hair-1', role: 'Hair Stylist', online: true, technical: false },
  { id: 'hair-2', role: 'hair stylist', online: true, technical: false },
  { id: 'hair-tech', role: 'Hair Stylist', online: true, technical: true },
  { id: 'barber-1', role: 'Barber', online: true, technical: false },
];
const normalize = (value) => value.trim().toLocaleLowerCase('it');
const targets = services.filter(
  (service) =>
    !service.technical &&
    normalize(service.role) === normalize('Hair Stylist') &&
    service.online,
);
assert.deepEqual(
  targets.map((service) => service.id),
  ['hair-1', 'hair-2'],
);

console.log('Contratti Archivia/Ripristina tutto per mestiere verificati (app + web).');
