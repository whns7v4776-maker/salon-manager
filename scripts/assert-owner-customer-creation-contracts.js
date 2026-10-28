/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260829233000_idempotent_owner_customer_creation_v4.sql',
  ),
  'utf8',
);

const sliceBetween = (source, startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const customerCreateSource = sliceBetween(
  contextSource,
  'const createClientePersistedOnce = async',
  'const updateClientePersisted = async',
  'owner customer create flow',
);

assert.match(
  contextSource,
  /const createOwnerCustomerId = \(\) => \{[\s\S]*?crypto\?\.randomUUID\?\.\(\)[\s\S]*?crypto\?\.getRandomValues[\s\S]*?bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x40[\s\S]*?bytes\[8\] = \(bytes\[8\] & 0x3f\) \| 0x80/,
  'The client must generate a valid random RFC 4122 v4 customer UUID on every new operation.',
);
assert.equal(
  (customerCreateSource.match(/createOwnerCustomerId\(\)/g) ?? []).length,
  1,
  'One create operation must generate exactly one canonical customer UUID.',
);
assert.match(
  customerCreateSource,
  /const customerId = createOwnerCustomerId\(\)[\s\S]*?const rpcPayload = \{[\s\S]*?p_workspace_id: workspaceId[\s\S]*?p_customer_id: customerId[\s\S]*?p_birthday: normalizedCustomer\.birthday/,
  'The caller-generated UUID and the complete customer payload must travel together.',
);
assert.match(
  customerCreateSource,
  /const invokeCreateCustomerRpc = \(\) =>[\s\S]*?supabase\.rpc\('create_owner_customer_v4', rpcPayload\)[\s\S]*?rpcResponse = await invokeCreateCustomerRpc\(\)[\s\S]*?retriedAmbiguousResponse = true[\s\S]*?rpcResponse = await invokeCreateCustomerRpc\(\)/,
  'Every ambiguous transport retry must reuse the same immutable v4 payload.',
);
assert.doesNotMatch(
  customerCreateSource,
  /create_owner_customer_v3/,
  'The client must not fall back to payload-based v3 replay semantics.',
);
assert.match(
  customerCreateSource,
  /insertedCustomer\.id\.trim\(\)\.toLowerCase\(\) !== customerId[\s\S]*?Nessun dato locale è stato modificato/,
  'The canonical row returned by the server must match the UUID requested by the client.',
);

const tombstoneStart = customerCreateSource.indexOf(
  'const deletedAliasesPersistence = removeDeletedCustomerAliases(',
);
const tombstoneAwait = customerCreateSource.indexOf(
  'await deletedAliasesPersistence;',
  tombstoneStart,
);
const successReturn = customerCreateSource.indexOf(
  'return { ok: true as const, customer: persistedCustomer };',
  tombstoneStart,
);
assert.ok(tombstoneStart >= 0, 'Customer create must clear matching tombstones.');
assert.ok(
  tombstoneAwait > tombstoneStart && successReturn > tombstoneAwait,
  'Tombstone storage persistence must settle before customer creation reports success.',
);
assert.match(
  customerCreateSource,
  /createClientePersistedInFlightRef\.current\.get\(operationKey\)[\s\S]*?createClientePersistedOnce\(customer\)\.finally[\s\S]*?createClientePersistedInFlightRef\.current\.set\(operationKey, operation\)/,
  'Concurrent identical taps must share the operation that owns the generated UUID.',
);

const tombstoneGuardSource = sliceBetween(
  contextSource,
  'const syncRecentlyDeletedCustomerKeysToStorage =',
  'const runWithDeadlockRetry =',
  'customer tombstone hydration guard',
);
assert.match(
  tombstoneGuardSource,
  /const hydrationRevision =[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current[\s\S]*?cancelled \|\|[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current !==[\s\S]*?hydrationRevision/,
  'An AsyncStorage read started before a mutation must not rehydrate stale aliases.',
);
assert.equal(
  (
    tombstoneGuardSource.match(
      /recentlyDeletedCustomerMutationRevisionRef\.current \+= 1/g,
    ) ?? []
  ).length,
  2,
  'Both tombstone additions and removals must invalidate an older hydration read.',
);

assert.match(
  contextSource,
  /const deletedCustomerMutationRevisionAtInitialLoad =[\s\S]*?STORAGE_KEYS\.clienti,[\s\S]*?STORAGE_KEYS\.recently_deleted_customers,[\s\S]*?clientiSalvati,[\s\S]*?clientiEliminatiSalvati,[\s\S]*?deletedCustomerMutationRevisionAtInitialLoad[\s\S]*?recentlyDeletedCustomerKeysRef\.current =[\s\S]*?let nextClienti:[\s\S]*?filterRecentlyDeletedCustomers\(/,
  'Initial owner hydration must load deletion tombstones with the customer cache and filter before publishing the first frame.',
);

assert.match(
  migrationSource,
  /create or replace function public\.create_owner_customer_v4\([\s\S]*?p_workspace_id uuid,[\s\S]*?p_customer_id uuid/,
  'v4 must accept the exact workspace and caller-generated customer UUID.',
);
assert.match(
  migrationSource,
  /auth\.uid\(\) is null[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?member\.user_id = auth\.uid\(\)[\s\S]*?for update/,
  'v4 must retain exact-workspace authentication and serialization.',
);
assert.match(
  migrationSource,
  /customer_birthday_invalid[\s\S]*?customer_limits_invalid/,
  'v4 must retain canonical birthday and booking-limit validation.',
);

const existingIdLookup = migrationSource.indexOf('where customer.id = p_customer_id;');
const exactReplay = migrationSource.indexOf("'replayed', true", existingIdLookup);
const phoneDuplicateLookup = migrationSource.indexOf(
  'into v_phone_customer',
  exactReplay,
);
const canonicalInsert = migrationSource.indexOf(
  'insert into public.customers (',
  phoneDuplicateLookup,
);
assert.ok(existingIdLookup >= 0, 'v4 must look up the caller-generated UUID.');
assert.ok(
  exactReplay > existingIdLookup &&
    phoneDuplicateLookup > exactReplay &&
    canonicalInsert > phoneDuplicateLookup,
  'Only an existing exact UUID may replay; identity duplicates must be checked before insert.',
);
assert.match(
  migrationSource,
  /v_existing_customer\.workspace_id = v_workspace_id[\s\S]*?v_existing_customer\.full_name[\s\S]*?v_existing_customer\.phone[\s\S]*?v_existing_customer\.email[\s\S]*?v_existing_customer\.instagram[\s\S]*?v_existing_customer\.note[\s\S]*?v_existing_customer\.birthday[\s\S]*?v_existing_customer\.max_future_appointments[\s\S]*?v_existing_customer\.max_future_appointments_mode[\s\S]*?v_existing_customer\.max_daily_appointments[\s\S]*?'replayed', true/,
  'A repeated UUID may replay only the exact canonical customer payload.',
);
assert.match(
  migrationSource,
  /'customer_id_conflict'[\s\S]*?'duplicate_email_phone'[\s\S]*?'duplicate_phone'[\s\S]*?'duplicate_email'/,
  'Mismatched UUID reuse and later contact duplicates must remain explicit conflicts.',
);
assert.doesNotMatch(
  migrationSource,
  /array_agg\(customer\.id/,
  'v4 must never infer a replay by adopting a contact-matching row.',
);
assert.match(
  migrationSource,
  /delete from public\.customer_deletion_tombstones[\s\S]*?insert into public\.customers \([\s\S]*?id,[\s\S]*?values \([\s\S]*?p_customer_id[\s\S]*?'replayed', false/,
  'A new canonical UUID must clear the tombstone and be inserted in one transaction.',
);
assert.match(
  migrationSource,
  /revoke all on function public\.create_owner_customer_v4[\s\S]*?from public, anon;[\s\S]*?grant execute on function public\.create_owner_customer_v4[\s\S]*?to authenticated;/,
  'Only authenticated callers may execute owner customer creation v4.',
);

console.log('Owner customer creation contracts: OK');
