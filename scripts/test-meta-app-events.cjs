const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/meta-app-events.native.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function setup({ enabled = true, native = true, bridge = true, permission = 'granted', os = 'ios' } = {}) {
  const calls = [], store = new Map(), state = { permission, diskFailure: false };
  const Settings = Object.fromEntries(['initializeSDK', 'setAutoLogAppEventsEnabled', 'setAdvertiserIDCollectionEnabled', 'setAdvertiserTrackingEnabled'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const modules = {
    'expo-modules-core': { requireOptionalNativeModule: () => native && bridge ? { activate: async consent => {
      assert.equal(consent, true);
      calls.push(['nativeInstall']);
      if (os === 'ios') calls.push(['event', 'fb_mobile_activate_app']);
      return true;
    } } : null },
    '@react-native-async-storage/async-storage': {
      getItem: async key => store.get(key),
      setItem: async (key, value) => { if (state.diskFailure) throw Error('disk'); store.set(key, value); },
    },
    'expo-constants': { expoConfig: { extra: { metaAppEventsEnabled: enabled } } },
    'react-native': { Platform: { OS: os }, NativeModules: native ? { FBSettings: {}, FBAppEventsLogger: {} } : {} },
    'expo-tracking-transparency': {
      getTrackingPermissionsAsync: async () => ({ status: state.permission }),
      requestTrackingPermissionsAsync: async () => ({ status: state.permission }),
    },
    'react-native-fbsdk-next': { Settings, AppEventsLogger: { logEvent: (...args) => calls.push(['event', ...args]), flush: () => {} } },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!native && ['expo-tracking-transparency', 'react-native-fbsdk-next'].includes(name)) throw Error('eager native import');
    assert.ok(modules[name], name); return modules[name];
  } });
  return { api: exports, calls, state, events: () => calls.filter(call => call[0] === 'event') };
}
(async () => {
  for (const options of [{ enabled: false }, { native: false }, { bridge: false }]) {
    const t = setup(options); await t.api.resumeMetaMeasurement(); await t.api.logMetaOwnerRegistration();
    assert.equal(t.calls.length, 0);
  }
  const t = setup();
  await t.api.resumeMetaMeasurement(); await t.api.logMetaOwnerRegistration();
  assert.equal(t.events().length, 0);
  assert.equal(await t.api.setMetaMeasurementConsent(true), true);
  await t.api.resumeMetaMeasurement(); await t.api.resumeMetaMeasurement();
  assert.equal(t.events().length, 1);
  assert.equal(t.calls.filter(call => call[0] === 'nativeInstall').length, 1);
  await t.api.logMetaOwnerRegistration();
  assert.deepEqual(t.events(), [['event', 'fb_mobile_activate_app'], ['event', 'fb_mobile_complete_registration']]);
  assert.ok(!t.calls.some(call => call[0] === 'setAutoLogAppEventsEnabled' && call[1]));
  await t.api.setMetaMeasurementConsent(false); await t.api.logMetaOwnerRegistration();
  assert.equal(t.events().length, 2);
  const denied = setup({ permission: 'denied' });
  assert.equal(await denied.api.setMetaMeasurementConsent(true), false);
  await denied.api.logMetaOwnerRegistration(); assert.equal(denied.events().length, 0);
  const revoked = setup(); await revoked.api.setMetaMeasurementConsent(true);
  revoked.state.permission = 'denied'; await revoked.api.resumeMetaMeasurement(); await revoked.api.logMetaOwnerRegistration();
  assert.equal(revoked.events().length, 1);
  const disk = setup(); await disk.api.setMetaMeasurementConsent(true); disk.state.diskFailure = true;
  await disk.api.setMetaMeasurementConsent(false); await disk.api.logMetaOwnerRegistration();
  assert.equal(disk.events().length, 1);
  assert.ok(disk.api.getMetaMeasurementSaveError());
  assert.equal(await disk.api.getMetaMeasurementConsent(), false);
  const android = setup({ os: 'android' }); await android.api.setMetaMeasurementConsent(true);
  assert.equal(android.events().length, 1);
  assert.equal(android.calls.filter(call => call[0] === 'nativeInstall').length, 1);
  const race = setup();
  await Promise.all([race.api.setMetaMeasurementConsent(true), race.api.setMetaMeasurementConsent(false)]);
  assert.equal(race.events().length, 0);
  console.log('PASS: Meta consent, ATT denial/revocation, storage failure, old binary, disabled flag, activation deduplication, payloads, Android.');
})().catch(error => { console.error(error); process.exitCode = 1; });
