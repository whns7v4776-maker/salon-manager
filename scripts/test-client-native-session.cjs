const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/lib/client-native-session.ts');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const KEY = 'salon_manager_frontend_native_active_session_v1';
const INSTANCE = 'salon_manager_frontend_client_app_instance_id';
const REVISION = 'salon_manager_frontend_native_session_revision_v1';
const base = { salonCode: 'fixture-salon', email: 'customer@example.test', phone: '3003003000', customerId: '12345678-1234-4234-8234-123456789abc', appInstanceId: 'fixture-installation', passwordRequired: true };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(platform = 'ios', config = {}) {
  const durable = config.durable ?? { secure: new Map(), storage: new Map([[INSTANCE, base.appInstanceId]]) };
  const calls = [];
  const mocks = {
    'react-native': { Platform: { OS: platform } },
    './client-gps-reminders': { pauseClientGpsReminders: () => calls.push(['gps-pause']) },
    'expo-secure-store': {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async key => { calls.push(['secure-read', key]); if (config.read) await config.read.promise; if (config.readFailure) throw Error('unavailable'); return durable.secure.get(key) ?? null; },
      setItemAsync: async (key, value, options) => { calls.push(['secure-write', key, options]); if (config.write) await config.write.promise; if (config.writeFailure) throw Error('unavailable'); durable.secure.set(key, value); },
      deleteItemAsync: async key => { calls.push(['secure-delete', key]); if (config.deleteFailure) throw Error('unavailable'); durable.secure.delete(key); },
    },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => { calls.push(['storage-read', key]); if (config.instanceRead && key === INSTANCE) await config.instanceRead.promise; return durable.storage.get(key) ?? null; },
      setItem: async (key, value) => { calls.push(['storage-write', key]); if (config.revisionFailure && key === REVISION) throw Error('unavailable'); durable.storage.set(key, value); },
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled.outputText, { exports, require: name => { assert.ok(mocks[name], name); return mocks[name]; }, Date, Math, Promise }, { filename: file });
  return { api: exports, durable, calls, config };
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
for (const platform of ['ios', 'android']) {
  test(`${platform}: only validated identity persists with device-only secure storage`, async () => {
    const f = fixture(platform); assert.equal(await f.api.readNativeCustomerSession(), null);
    assert.equal(await f.api.persistNativeCustomerSession(base, f.api.nativeCustomerSessionGeneration()), true);
    const saved = await f.api.readNativeCustomerSession(); assert.deepEqual(JSON.parse(JSON.stringify(saved)), { version: 1, ...base, platform });
    assert.equal(f.calls.find(call => call[0] === 'secure-write')[2].keychainAccessible, 'device-only');
    assert.ok(!f.durable.secure.get(KEY).includes('password:'));
    const reopened = fixture(platform, { durable: f.durable }); assert.ok(await reopened.api.readNativeCustomerSession());
  });
  test(`${platform}: logout remains revoked after cold restart`, async () => {
    const f = fixture(platform); await f.api.persistNativeCustomerSession(base, 0);
    const cleanup = f.api.invalidateNativeCustomerSession(); assert.equal(f.api.nativeCustomerSessionGeneration(), 1);
    await cleanup; await flush(); assert.ok(f.calls.some(call => call[0] === 'gps-pause')); const reopened = fixture(platform, { durable: f.durable }); assert.equal(await reopened.api.readNativeCustomerSession(), null);
  });
  test(`${platform}: surviving Keychain item after deletion failure remains revoked`, async () => {
    const f = fixture(platform, { deleteFailure: true }); await f.api.persistNativeCustomerSession(base, 0); await f.api.invalidateNativeCustomerSession();
    assert.ok(f.durable.secure.has(KEY)); const reopened = fixture(platform, { durable: f.durable }); assert.equal(await reopened.api.readNativeCustomerSession(), null);
  });
  test(`${platform}: AsyncStorage revocation failure still removes Keychain hint`, async () => {
    const f = fixture(platform); await f.api.persistNativeCustomerSession(base, 0); f.config.revisionFailure = true; await f.api.invalidateNativeCustomerSession();
    const reopened = fixture(platform, { durable: f.durable }); assert.equal(await reopened.api.readNativeCustomerSession(), null);
  });
  test(`${platform}: new installation rejects a surviving secure item`, async () => {
    const f = fixture(platform); await f.api.persistNativeCustomerSession(base, 0); f.durable.storage.set(INSTANCE, 'new-installation'); assert.equal(await f.api.readNativeCustomerSession(), null);
    assert.equal(await f.api.persistNativeCustomerSession(base, 0), false);
    f.durable.storage.delete(INSTANCE); assert.equal(await f.api.readNativeCustomerSession(), null);
  });
}
test('web never reads, creates, or deletes native storage', async () => {
  const f = fixture('web'); assert.equal(await f.api.readNativeCustomerSession(), null); assert.equal(await f.api.persistNativeCustomerSession(base, 0), false); await f.api.invalidateNativeCustomerSession(); assert.equal(f.calls.length, 0);
});
for (const [field, value] of [['salonCode', 'other'], ['email', 'other@example.test'], ['phone', '4004004000']]) {
  test(`scope: ${field} mismatch never restores`, async () => {
    const f = fixture(); await f.api.persistNativeCustomerSession(base, 0); assert.equal(await f.api.readNativeCustomerSession({ [field]: value }), null); assert.ok(await f.api.readNativeCustomerSession(base));
  });
}
test('server matching requires immutable ID and both contacts', async () => {
  const f = fixture(); await f.api.persistNativeCustomerSession(base, 0); const saved = await f.api.readNativeCustomerSession();
  assert.equal(f.api.matchesNativeCustomerSession(saved, base), true);
  for (const field of ['customerId', 'salonCode', 'email', 'phone']) assert.equal(f.api.matchesNativeCustomerSession(saved, { ...base, [field]: field === 'phone' ? '4004004000' : 'changed' }), false, field);
});
test('normalization matches safely without mutating the caller input', async () => {
  const f = fixture(); const input = { ...base, salonCode: ' FIXTURE-SALON ', email: ' CUSTOMER@EXAMPLE.TEST ', phone: '300 300 3000' }; assert.equal(await f.api.persistNativeCustomerSession(input, 0), true); assert.ok(await f.api.readNativeCustomerSession(input)); assert.equal(input.salonCode, ' FIXTURE-SALON ');
});
for (const change of [{ customerId: '' }, { customerId: 'profile-cache-id' }, { phone: '123' }, { appInstanceId: '' }, { passwordRequired: undefined }, { salonCode: '' }]) {
  test(`invalid marker input rejected: ${Object.keys(change)[0]} ${String(Object.values(change)[0])}`, async () => { const f = fixture(); assert.equal(await f.api.persistNativeCustomerSession({ ...base, ...change }, 0), false); assert.ok(!f.durable.secure.has(KEY)); });
}
for (const payload of ['broken-json', '{}', JSON.stringify({ version: 1, ...base, platform: 'android' })]) {
  test(`malformed or wrong-platform marker ignored: ${payload.slice(0, 20)}`, async () => { const f = fixture(); f.durable.secure.set(KEY, payload); assert.equal(await f.api.readNativeCustomerSession(), null); });
}
test('read failure does not create an authenticated customer', async () => { const f = fixture('ios', { readFailure: true }); await f.api.persistNativeCustomerSession(base, 0); assert.equal(await f.api.readNativeCustomerSession(), null); });
test('secure write failure remains optional for already validated current login', async () => { const f = fixture('ios', { writeFailure: true }); assert.equal(await f.api.persistNativeCustomerSession(base, 0), false); assert.equal(await f.api.readNativeCustomerSession(), null); });
test('revision write failure cannot leave a resumable new marker', async () => { const f = fixture('ios', { revisionFailure: true }); assert.equal(await f.api.persistNativeCustomerSession(base, 0), false); assert.equal(await f.api.readNativeCustomerSession(), null); });
test('late secure write after logout is deleted and cannot reappear on cold start', async () => {
  const gate = deferred(); const f = fixture('ios', { write: gate }); const saving = f.api.persistNativeCustomerSession(base, 0); await flush(); const cleanup = f.api.invalidateNativeCustomerSession(); gate.resolve(); assert.equal(await saving, false); await cleanup;
  assert.equal(await fixture('ios', { durable: f.durable }).api.readNativeCustomerSession(), null);
});
test('late installation read after logout does not start a secure write', async () => {
  const gate = deferred(); const f = fixture('ios', { instanceRead: gate }); const saving = f.api.persistNativeCustomerSession(base, 0); await flush(); const cleanup = f.api.invalidateNativeCustomerSession(); gate.resolve(); assert.equal(await saving, false); await cleanup; assert.ok(!f.calls.some(call => call[0] === 'secure-write'));
});
test('in-flight marker read cannot return after logout', async () => {
  const f = fixture(); await f.api.persistNativeCustomerSession(base, 0); const gate = deferred(); f.config.read = gate; const reading = f.api.readNativeCustomerSession(); await flush(); const cleanup = f.api.invalidateNativeCustomerSession(); gate.resolve(); assert.equal(await reading, null); await cleanup;
});
test('new verified login supersedes revoked marker in order', async () => {
  const f = fixture(); await f.api.persistNativeCustomerSession(base, 0); const cleanup = f.api.invalidateNativeCustomerSession(); const next = { ...base, customerId: '87654321-4321-4321-8321-cba987654321', email: 'new@example.test' }; const saving = f.api.persistNativeCustomerSession(next, f.api.nativeCustomerSessionGeneration()); await cleanup; assert.equal(await saving, true); assert.equal((await f.api.readNativeCustomerSession()).customerId, next.customerId);
});
(async () => { for (const item of tests) { await item.run(); process.stdout.write(`PASS ${item.name}\n`); } process.stdout.write(`${tests.length}/${tests.length} native session runtime tests passed; source SHA256 ${crypto.createHash('sha256').update(source).digest('hex')}\n`); })().catch(error => { console.error(error); process.exitCode = 1; });
