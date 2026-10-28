/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const clientsScreenSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'clienti.tsx'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260901221500_delete_owner_customer_atomically.sql',
  ),
  'utf8',
);
const tombstoneReadMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260902092000_get_owner_customer_deletion_tombstones.sql',
  ),
  'utf8',
);

const deleteStart = contextSource.indexOf(
  'const deleteClientePersisted = async',
);
const deleteEnd = contextSource.indexOf(
  'const createMovimentoPersisted = async',
  deleteStart,
);
assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);
const deleteSource = contextSource.slice(deleteStart, deleteEnd);

assert.match(
  deleteSource,
  /const rpcPayload = \{[\s\S]*?p_workspace_id: workspaceId[\s\S]*?p_customer_ids: backendCustomerIds[\s\S]*?p_full_name:[\s\S]*?supabase\.rpc\('delete_owner_customer_v1', rpcPayload\)/,
  'Customer deletion must use the exact-workspace atomic RPC.',
);
assert.match(
  deleteSource,
  /isStatementTimeoutError\(deleteResponse\.error\)[\s\S]*?deleteResponse = await invokeDeleteCustomerRpc\(\)/,
  'A statement timeout must retry only the same idempotent deletion payload.',
);
assert.match(
  deleteSource,
  /deleteResult\.workspace_id[\s\S]*?workspaceId\.toLowerCase\(\)[\s\S]*?await addDeletedCustomerAliases[\s\S]*?clientiRef\.current = nextClientiAfterDelete[\s\S]*?enqueuePortalPublish/,
  'Local removal and snapshot publication must happen only after exact-workspace server confirmation.',
);
assert.doesNotMatch(
  deleteSource,
  /linkedFutureAppointments|linkedActiveRequests|devi prima chiudere|agenda e richieste future sono vuote/,
  'Future appointments and open requests must remain orphan snapshots, not block customer deletion.',
);
assert.doesNotMatch(
  deleteSource,
  /\.from\('customers'\)[\s\S]{0,120}?\.delete\(\)/,
  'The app must not restore the timeout-prone direct customer delete path.',
);

assert.match(
  contextSource,
  /rawStoredClienti,[\s\S]*?rawStoredRecentlyDeletedCustomers,[\s\S]*?STORAGE_KEYS\.recently_deleted_customers[\s\S]*?recentlyDeletedCustomerKeysRef\.current\s*=\s*hydratedDeletedCustomerKeys[\s\S]*?storedClienti = filterRecentlyDeletedCustomers/,
  'Deleted-customer aliases must hydrate in the same cache batch and filter cached customers before first render.',
);
assert.match(
  contextSource,
  /const isCustomerBlockedByDeletionGuard =[\s\S]*?isUuidValue\(normalizedId\)[\s\S]*?deletedKeys\.has\(`id:\$\{normalizedId\}`\)[\s\S]*?buildCustomerIdentityAliases\(item\)/,
  'A newly registered canonical customer must not inherit a deleted customer contact alias when its UUID is new.',
);
assert.match(
  clientsScreenSource,
  /const rawClienti = localClienti[\s\S]*?isUuidLike\(normalizedId\)[\s\S]*?deletedKeySet\.has\(`id:\$\{normalizedId\}`\)[\s\S]*?buildFrontendClientIdentityAliases\(item\)/,
  'The Clienti screen must apply the same exact-incarnation deletion rule before rendering.',
);

const primeStart = contextSource.indexOf(
  'const primeScopedOwnerAccountState = React.useCallback',
);
const primeEnd = contextSource.indexOf(
  'const loadOwnerAccounts = async',
  primeStart,
);
assert.ok(primeStart >= 0 && primeEnd > primeStart);
const primeSource = contextSource.slice(primeStart, primeEnd);
assert.match(
  primeSource,
  /if \(Platform\.OS !== 'web'\) \{[\s\S]*?setClienti\(normalizeClienti\(\[\]\)\)/,
  'Native account priming must fail closed instead of rendering cached customer rows.',
);
assert.doesNotMatch(
  primeSource,
  /setClienti\([\s\S]{0,180}?clientiSalvati/,
  'A native build must never publish stale customer cache before server authority.',
);

assert.match(
  clientsScreenSource,
  /deletedClientIdentityKeysHydratedFor[\s\S]*?const deletionGuardReady =[\s\S]*?if \(!deletionGuardReady\) \{[\s\S]*?return nextClienti;[\s\S]*?richiestePrenotazione\.forEach/,
  'The Clienti list must not derive customer cards from requests before deletion aliases are hydrated.',
);
assert.match(
  clientsScreenSource,
  /get_owner_customer_deletion_tombstones_v1[\s\S]*?serverNames\.push\(normalizedName\)[\s\S]*?setDeletedClientNormalizedNames[\s\S]*?setDeletedClientIdentityKeysHydratedFor\(normalizedEmail\)/,
  'A clean install must hydrate deleted customer names from server authority before enabling request-derived cards.',
);
assert.match(
  clientsScreenSource,
  /const fullName = `\$\{item\.nome\} \$\{item\.cognome\}`\.trim\(\);[\s\S]*?deletedNameSet\.has\(normalizeIdentityText\(fullName\)\)[\s\S]*?return;[\s\S]*?const derivedClientId/,
  'Accepted historical requests must not recreate a customer protected by a server tombstone.',
);

assert.match(
  migrationSource,
  /create or replace function public\.delete_owner_customer_v1[\s\S]*?auth\.uid\(\) is null[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?for update/,
  'The server must authenticate, scope, and serialize deletion in the selected workspace.',
);
assert.match(
  migrationSource,
  /insert into public\.customer_deletion_tombstones[\s\S]*?v_tombstone_count = 0[\s\S]*?v_existing_tombstone[\s\S]*?raise exception 'customer_not_found'[\s\S]*?set_config\([\s\S]*?'salonpro\.skip_client_portal_snapshot_sync'[\s\S]*?delete from public\.customers[\s\S]*?'ok', true/,
  'The anti-resurrection tombstone must commit atomically with the canonical lightweight deletion.',
);
assert.match(
  migrationSource,
  /create or replace function public\.clear_customer_tombstone_on_recreation[\s\S]*?delete from public\.customer_deletion_tombstones[\s\S]*?revoke all on function public\.clear_customer_tombstone_on_recreation\(\)[\s\S]*?from public, anon, authenticated[\s\S]*?create trigger clear_customer_tombstone_before_recreation[\s\S]*?before insert on public\.customers/,
  'A validated new registration must clear the old tombstone before projection.',
);
assert.match(
  migrationSource,
  /create or replace function public\.tombstone_customer_before_delete[\s\S]*?insert into public\.customer_deletion_tombstones[\s\S]*?create trigger tombstone_customer_before_delete[\s\S]*?before delete on public\.customers[\s\S]*?create trigger sync_client_portal_after_customers_change[\s\S]*?after insert or update on public\.customers/,
  'Installed app builds must retain a lightweight tombstoned direct-delete path without the timeout-prone portal rewrite.',
);
assert.match(
  migrationSource,
  /customer_login_credentials[\s\S]*?on delete cascade|delete from public\.customers/,
  'Canonical customer deletion must remain the authority that cascades customer credentials.',
);
assert.match(
  migrationSource,
  /grant execute on function public\.delete_owner_customer_v1\(uuid, uuid\[\], text\)[\s\S]*?to authenticated/,
  'Only authenticated callers may invoke owner customer deletion.',
);
assert.match(
  tombstoneReadMigrationSource,
  /create or replace function public\.get_owner_customer_deletion_tombstones_v1[\s\S]*?auth\.uid\(\) is null[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?public\.workspace_access_allowed\(\)[\s\S]*?from public\.customer_deletion_tombstones/,
  'The tombstone reader must authenticate and remain scoped to the exact accessible workspace.',
);
assert.match(
  tombstoneReadMigrationSource,
  /revoke all on function public\.get_owner_customer_deletion_tombstones_v1\(uuid\)[\s\S]*?from public, anon, service_role;[\s\S]*?grant execute[\s\S]*?to authenticated/,
  'Only authenticated owner clients may read deletion identities.',
);

console.log('Owner customer deletion contracts: OK');
