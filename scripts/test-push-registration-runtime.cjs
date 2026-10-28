/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '../src/lib/push/push-notifications.ts'),
  'utf8',
);
const client = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  ownerEmail: 'owner@example.invalid',
  customerEmail: 'client@example.invalid',
  customerPhone: '+39 333 1234567',
};
const ownerParams = {
  workspaceId: client.workspaceId,
  ownerEmail: client.ownerEmail,
  audience: 'auth',
  recipientKind: 'owner',
};
const clientParams = { ...client, audience: 'public', recipientKind: 'client' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const waitUntil = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(setImmediate);
  }
  assert.fail('Expected async registration checkpoint was not reached.');
};

const fixture = (platform = 'ios') => {
  const storage = new Map();
  const calls = [];
  let tokenCount = 0;
  let permission = 'granted';
  let fetchToken = async () => ({ data: 'ExponentPushToken[test-device]' });
  let rpc = async () => ({ error: null });
  const modules = {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      multiSet: async (pairs) => pairs.forEach(([key, value]) => storage.set(key, value)),
    },
    'expo-constants': {
      executionEnvironment: 'standalone',
      expoConfig: { version: 'test', extra: { eas: { projectId: 'test-project' } } },
    },
    'expo-device': { isDevice: true, modelName: 'Test phone' },
    'expo-notifications': {
      getPermissionsAsync: async () => ({ status: permission }),
      getExpoPushTokenAsync: async () => { tokenCount += 1; return fetchToken(); },
      setNotificationChannelAsync: async () => undefined,
      AndroidImportance: { MAX: 5 },
      AndroidNotificationVisibility: { PUBLIC: 1 },
    },
    'react-native': { Platform: { OS: platform }, AppState: { currentState: 'active' } },
    '../notification-badge-sync': {},
    '../supabase': {
      getSupabaseSessionSafely: async () => ({ data: { session: null } }),
      supabase: {
        rpc: async (name, payload) => { calls.push({ name, payload }); return rpc(name, payload); },
      },
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    {
      exports,
      require: (name) => {
        assert.ok(modules[name], `Unexpected runtime import: ${name}`);
        return modules[name];
      },
      console: { log: () => undefined },
      setTimeout,
      clearTimeout,
    },
  );
  return {
    api: exports,
    calls,
    storage,
    tokenCount: () => tokenCount,
    setPermission: (value) => { permission = value; },
    setFetchToken: (value) => { fetchToken = value; },
    setRpc: (value) => { rpc = value; },
  };
};

(async () => {
  for (const platform of ['ios', 'android']) {
    const f = fixture(platform);
    const { api } = f;
    for (const route of ['/cliente', '/cliente-screen', '/cliente-login', '/join/abc']) {
      assert.equal(api.isClientPushRegistrationRuntimeRoute(route), true, route);
    }
    for (const route of ['/', '/agenda', '/clienti', '/cliente/123', '/salon-access', '/profilo']) {
      assert.equal(api.isClientPushRegistrationRuntimeRoute(route), false, route);
    }
    assert.equal((await api.registerPushNotifications(clientParams)).reason, 'registration_superseded');
    assert.equal(f.tokenCount(), 0, 'Unresolved startup must not refresh a saved client token.');
    api.setPushRegistrationRuntimeScope({ recipientKind: 'owner' });
    assert.equal((await api.registerPushNotifications(clientParams)).reason, 'registration_superseded');
    assert.equal((await api.registerPushNotifications(ownerParams)).backendSynced, true);
    assert.equal(f.calls[0].name, 'claim_owner_push_device_v2');

    api.setPushRegistrationRuntimeScope({ recipientKind: 'client', clientIdentity: client });
    assert.equal((await api.registerPushNotifications(clientParams)).backendSynced, true);
    assert.equal(f.calls.at(-1).name, 'upsert_public_push_device');
    assert.equal(f.calls.at(-1).payload.p_customer_email, client.customerEmail);
    assert.equal((await api.registerPushNotifications(ownerParams)).reason, 'registration_superseded');
    const beforeWrongIdentity = f.calls.length;
    assert.equal((await api.registerPushNotifications({
      ...clientParams, customerEmail: 'previous-client@example.invalid',
    })).reason, 'registration_superseded');
    assert.equal(f.calls.length, beforeWrongIdentity, 'A stale account may not claim the client runtime.');

    const token = deferred();
    f.setFetchToken(() => token.promise);
    const clientInFlight = api.registerPushNotifications(clientParams);
    const tokenCheckpoint = f.tokenCount();
    await waitUntil(() => f.tokenCount() > tokenCheckpoint);
    api.setPushRegistrationRuntimeScope({ recipientKind: 'owner' });
    token.resolve({ data: 'ExponentPushToken[test-device]' });
    assert.equal((await clientInFlight).reason, 'registration_superseded');
    assert.equal(f.calls.length, beforeWrongIdentity, 'Route change during token fetch must suppress the old RPC.');

    const tokenAccount = deferred();
    f.setFetchToken(() => tokenAccount.promise);
    let currentOwner = true;
    const ownerInFlight = api.registerPushNotifications({
      ...ownerParams, isRegistrationCurrent: () => currentOwner,
    });
    const accountCheckpoint = f.tokenCount();
    await waitUntil(() => f.tokenCount() > accountCheckpoint);
    currentOwner = false;
    tokenAccount.resolve({ data: 'ExponentPushToken[test-device]' });
    assert.equal((await ownerInFlight).reason, 'registration_superseded');
    assert.equal(f.calls.length, beforeWrongIdentity, 'Logout/account switch must suppress a delayed owner claim.');

    f.setFetchToken(async () => ({ data: 'ExponentPushToken[test-device]' }));
    api.setPushRegistrationRuntimeScope({ recipientKind: 'client', clientIdentity: client });
    const oldRpc = deferred();
    f.setRpc((name) => name === 'upsert_public_push_device' ? oldRpc.promise : Promise.resolve({ error: null }));
    const previousClientWrite = api.registerPushNotifications(clientParams);
    await waitUntil(() => f.calls.length === beforeWrongIdentity + 1);
    api.setPushRegistrationRuntimeScope({ recipientKind: 'owner' });
    const newOwnerClaim = api.registerPushNotifications(ownerParams);
    await waitUntil(() => f.tokenCount() >= accountCheckpoint + 3);
    assert.equal(f.calls.length, beforeWrongIdentity + 1, 'Owner must wait for an already-sent older client write.');
    oldRpc.resolve({ error: null });
    assert.equal((await previousClientWrite).reason, 'registration_superseded');
    assert.equal((await newOwnerClaim).backendSynced, true);
    assert.equal(f.calls.at(-1).name, 'claim_owner_push_device_v2', 'Newest runtime must claim the token last.');

    f.setRpc(async () => { throw new Error('temporary network error'); });
    assert.equal((await api.registerPushNotifications(ownerParams)).backendSynced, false);
    f.setRpc(async () => ({ error: null }));
    assert.equal((await api.registerPushNotifications(ownerParams)).backendSynced, true, 'A failed write must release the queue for retry.');
    const beforeDenied = f.calls.length;
    f.setPermission('denied');
    assert.equal((await api.registerPushNotifications(ownerParams)).backendSynced, false);
    assert.equal(f.calls.length, beforeDenied, 'Denied permission must not reactivate a saved token.');
    f.setPermission('granted');
    f.setFetchToken(async () => { throw new Error('temporary token fetch error'); });
    assert.equal((await api.registerPushNotifications(ownerParams)).backendSynced, true, 'Stored-token recovery must still work for the current identity.');
    api.setPushRegistrationRuntimeScope({ recipientKind: null });
    assert.equal((await api.registerPushNotifications(ownerParams)).reason, 'registration_superseded');
    assert.equal((await api.registerPushNotifications(clientParams)).reason, 'registration_superseded');
    assert.ok(f.storage.has('salon_manager_expo_push_token'), 'Scope changes must preserve saved token history and existing OS push delivery.');
  }
  console.log('PASS: iOS/Android push runtime isolation, client/owner switching, delayed token/RPC races, logout guard, permission denial and retry recovery.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
