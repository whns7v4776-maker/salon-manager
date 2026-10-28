/* Real component hooks with isolated OS/reporter boundaries; no remote writes or permission dialogs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../components/customer-notification-permission.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const flush = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ platform = 'ios', owner = false } = {}) {
  let cursor = 0, effects = [], disposed = false, permission = 'granted', confirmed = true;
  let ensureCalls = 0, grantedCalls = 0, requestCalls = 0, settingsCalls = 0, consent = null;
  let ensureResult = () => Promise.resolve('installation-a'), grantResult = () => Promise.resolve(), requestResult = () => Promise.resolve();
  const slots = [], reporters = [], stateWrites = [], observed = [], opened = [];
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        assert.equal(disposed, false, 'No state write is allowed after unmount.');
        stateWrites.push(index);
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const defaults = owner ? { workspaceId: 'workspace-a', customerId: 'customer-a', phone: '3331234567', name: 'Nome Cliente' } : {
    salonCode: 'salon-a', identityKey: 'customer-a', enabled: true,
    ensureInstanceId: () => { ensureCalls++; return ensureResult(); },
    onGranted: () => { grantedCalls++; return grantResult(); },
    onPermission: status => observed.push(status),
  };
  const dependencies = {
    react: React,
    'react-native': { Platform: { OS: platform }, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
      Linking: { openSettings: async () => { settingsCalls++; }, openURL: async url => { opened.push(url); } } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../src/lib/customer-notification-consent': { useCustomerConsent: () => consent },
    '../src/lib/push/push-notifications': { requestNotificationPermissionsOnly: () => { requestCalls++; return requestResult(); } },
    '../src/lib/customer-notification-consent-reporter': {
      createCustomerNotificationConsentReporter(options) {
        const reporter = { options, stopped: false, refreshCalls: 0,
          async refresh() {
            reporter.refreshCalls++;
            if (reporter.stopped) return false;
            options.onPermission(permission);
            if (confirmed) options.onConfirmed(permission);
            return confirmed;
          },
          stop() { reporter.stopped = true; },
          resume() { return reporter.refresh(); },
        };
        reporters.push(reporter); return reporter;
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Promise, Date, JSON, Error,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected boundary: ${name}`); return dependencies[name]; } });
  let props = defaults;
  return {
    render(next = {}) {
      props = { ...defaults, ...next }; cursor = 0; effects = [];
      const tree = owner ? exports.CustomerNotificationPermission(props) : exports.ClientNotificationPermissionNotice(props);
      const pending = effects; effects = []; pending.forEach(run => run()); return tree;
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); disposed = true; },
    reporters, stateWrites, observed, opened, defaults,
    status(value, saved = true) { permission = value; confirmed = saved; },
    ensure(factory) { ensureResult = factory; }, grant(factory) { grantResult = factory; }, request(factory) { requestResult = factory; },
    consent(value) { consent = value; },
    get ensureCalls() { return ensureCalls; }, get grantedCalls() { return grantedCalls; },
    get requestCalls() { return requestCalls; }, get settingsCalls() { return settingsCalls; },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...(tree.props?.children ?? []).flatMap(nodes)];
}
function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (!tree || typeof tree !== 'object') return '';
  return (tree.props?.children ?? []).map(text).join(' ');
}
function press(tree, label = 'Attiva notifiche') {
  const button = nodes(tree).find(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === label);
  assert.ok(button, `Missing accessible button: ${label}`);
  return button.props.onPress();
}
const checks = [];
const check = async (name, run) => { await run(); checks.push({ name, passed: true }); };
(async () => {
  for (const props of [{ enabled: false }, { salonCode: '   ' }]) {
    await check(`No report before ${props.enabled === false ? 'registration' : 'a valid salon'}`, async () => {
      const f = fixture(); assert.equal(f.render(props), null); await flush();
      assert.equal(f.ensureCalls, 0); assert.equal(f.reporters.length, 0); f.unmount();
    });
  }
  await check('Web mounts never read mobile permissions or report mobile consent', async () => {
    const f = fixture({ platform: 'web' }); assert.equal(f.render(), null); await flush();
    assert.equal(f.ensureCalls, 0); assert.equal(f.reporters.length, 0); f.unmount();
  });
  for (const platform of ['ios', 'android']) {
    await check(`${platform}: initial read reports without a prompt and only persisted grant registers push once`, async () => {
      const f = fixture({ platform }); f.render(); await flush(); assert.equal(f.reporters.length, 1);
      assert.equal(f.reporters[0].options.platform, platform); assert.equal(f.grantedCalls, 1);
      assert.equal(f.requestCalls, 0); assert.equal(f.render(), null);
      await f.reporters[0].refresh(); await flush(); assert.equal(f.grantedCalls, 1); f.unmount();
    });
  }
  await check('A local allowed permission hides the notice but failed persistence never calls onGranted', async () => {
    const f = fixture(); f.status('granted', false); f.render(); await flush();
    assert.equal(f.grantedCalls, 0); assert.deepEqual(f.observed, ['granted']); assert.equal(f.render(), null);
    f.status('granted', true); f.render({ refreshKey: 1 }); await flush(); assert.equal(f.grantedCalls, 1); f.unmount();
  });
  await check('Unstable callbacks do not recreate reporters and refresh uses the latest callback', async () => {
    const f = fixture(); f.status('denied'); f.render(); await flush();
    let grant = 0, observed = 0;
    const props = { ensureInstanceId: async () => 'unexpected-instance', onGranted: async () => { grant++; }, onPermission: () => { observed++; } };
    f.render(props); await flush(); assert.equal(f.reporters.length, 1); assert.equal(f.ensureCalls, 1);
    f.status('granted'); f.render({ ...props, refreshKey: 1 }); await flush();
    assert.equal(grant, 1); assert.equal(observed, 1); assert.equal(f.grantedCalls, 0); f.unmount();
  });
  await check('Claim/heartbeat refreshKey refreshes the existing reporter without rerunning instance setup', async () => {
    const f = fixture(); f.status('undetermined'); f.render(); await flush();
    f.render({ refreshKey: 1 }); await flush(); f.render({ refreshKey: 2 }); await flush(); f.render({ refreshKey: 2 }); await flush();
    assert.equal(f.reporters.length, 1); assert.equal(f.ensureCalls, 1); assert.equal(f.reporters[0].refreshCalls, 3); f.unmount();
  });
  await check('Unmount during instance setup never creates a reporter or updates UI', async () => {
    const f = fixture(), pending = deferred(); f.ensure(() => pending.promise); f.render(); await flush();
    const writes = f.stateWrites.length; f.unmount(); pending.resolve('installation-a'); await flush();
    assert.equal(f.reporters.length, 0); assert.equal(f.stateWrites.length, writes); assert.equal(f.grantedCalls, 0);
  });
  await check('Same-salon customer switch cancels old instance setup and old callbacks', async () => {
    const f = fixture(), pending = deferred(); f.ensure(() => pending.promise); f.render(); await flush();
    f.ensure(async () => 'installation-b'); f.status('denied'); f.render({ identityKey: 'customer-b' }); await flush();
    assert.equal(f.reporters.length, 1); assert.equal(f.reporters[0].options.appInstanceId, 'installation-b');
    pending.resolve('installation-a'); await flush(); assert.equal(f.reporters.length, 1); assert.equal(f.grantedCalls, 0);
    const b = f.reporters[0]; f.render({ identityKey: 'customer-c' }); await flush();
    const writes = f.stateWrites.length; b.options.onPermission('granted'); b.options.onConfirmed('granted'); await flush();
    assert.equal(b.stopped, true); assert.equal(f.stateWrites.length, writes); assert.equal(f.grantedCalls, 0); f.unmount();
  });
  await check('Disabling reporting stops the active reporter and ignores late results', async () => {
    const f = fixture(); f.status('denied'); f.render(); await flush(); const reporter = f.reporters[0];
    assert.equal(f.render({ enabled: false }), null); const writes = f.stateWrites.length;
    reporter.options.onPermission('granted'); reporter.options.onConfirmed('granted'); await flush();
    assert.equal(reporter.stopped, true); assert.equal(f.stateWrites.length, writes); assert.equal(f.grantedCalls, 0); f.unmount();
  });
  await check('Denied notice opens phone settings only on tap; resume confirms the new grant', async () => {
    const f = fixture(); f.status('denied'); f.render(); await flush(); const tree = f.render();
    assert.equal(f.settingsCalls, 0); assert.equal(f.requestCalls, 0); assert.ok(text(tree).includes('Non perdere'));
    await press(tree); assert.equal(f.settingsCalls, 1); assert.equal(f.requestCalls, 0);
    f.status('granted'); await f.reporters[0].resume(); await flush(); assert.equal(f.grantedCalls, 1); assert.equal(f.render(), null); f.unmount();
  });
  await check('Undetermined notice requests permission only on explicit tap then immediately refreshes consent', async () => {
    const f = fixture(); f.status('undetermined'); f.render(); await flush(); assert.equal(f.requestCalls, 0);
    const pending = deferred(); f.request(() => pending.promise); const tree = f.render(); const operation = press(tree);
    await press(tree); assert.equal(f.requestCalls, 1, 'Repeated taps must not open another OS prompt.');
    f.status('granted'); pending.resolve(); await operation; await flush();
    assert.equal(f.reporters[0].refreshCalls, 2); assert.equal(f.grantedCalls, 1); assert.equal(f.render(), null); f.unmount();
  });
  await check('Consent persistence does not depend on push registration and retries callback failure separately', async () => {
    const f = fixture(); f.grant(async () => { throw new Error('Token service unavailable'); }); f.render(); await flush();
    assert.equal(f.grantedCalls, 1); assert.equal(f.render(), null); assert.equal(f.requestCalls, 0);
    f.grant(async () => {}); f.render({ refreshKey: 1 }); await flush(); assert.equal(f.grantedCalls, 2);
    f.render({ refreshKey: 2 }); await flush(); assert.equal(f.grantedCalls, 2); f.unmount();
  });
  await check('A denied-to-granted transition is reported without repeated push registration while granted', async () => {
    const f = fixture(); f.render(); await flush(); assert.equal(f.grantedCalls, 1);
    f.status('denied'); await f.reporters[0].resume(); await flush(); assert.ok(f.render());
    f.status('granted'); await f.reporters[0].resume(); await flush(); assert.equal(f.grantedCalls, 2); f.unmount();
  });
  await check('A failed initial installation lookup can retry after claim without inferring denial', async () => {
    const f = fixture(); f.ensure(async () => { throw new Error('Storage temporarily unavailable'); }); f.render(); await flush();
    assert.equal(f.render(), null); assert.equal(f.observed.length, 0); assert.equal(f.reporters.length, 0);
    f.ensure(async () => 'installation-a'); f.render({ refreshKey: 1 }); await flush(); assert.equal(f.reporters.length, 1); f.unmount();
  });
  await check('Prompt failure stays recoverable and a late prompt never refreshes another identity', async () => {
    const f = fixture(); f.status('undetermined'); f.render(); await flush();
    f.request(async () => { throw new Error('OS prompt unavailable'); }); await press(f.render());
    assert.ok(text(f.render()).includes('Riprova')); assert.equal(f.grantedCalls, 0);
    const pending = deferred(); f.request(() => pending.promise); const operation = press(f.render());
    const old = f.reporters[0]; f.render({ identityKey: 'customer-b' }); await flush();
    const writes = f.stateWrites.length; pending.resolve(); await operation; await flush();
    assert.equal(old.stopped, true); assert.equal(old.refreshCalls, 1); assert.equal(f.stateWrites.length, writes); f.unmount();
  });
  await check('Unverified owner status offers accessible outreach without automatically opening WhatsApp', async () => {
    const f = fixture({ owner: true }); const tree = f.render();
    assert.ok(text(tree).includes('Non verificato')); assert.ok(text(tree).includes('Istruzioni')); assert.equal(f.opened.length, 0);
    await press(tree, 'Prepara istruzioni notifiche su WhatsApp'); assert.equal(f.opened.length, 1);
    assert.ok(f.opened[0].startsWith('https://wa.me/393331234567?text=')); assert.ok(decodeURIComponent(f.opened[0]).includes('Torna nell’app SalonPro')); f.unmount();
  });
  for (const [label, props, consent] of [
    ['granted customer', {}, { notification_permission: 'granted' }], ['no contact number', { phone: '   ' }, null],
  ]) {
    await check(`Owner outreach stays hidden for ${label}`, async () => {
      const f = fixture({ owner: true }); f.consent(consent); const tree = f.render(props);
      assert.equal(nodes(tree).some(node => node.type === 'TouchableOpacity'), false); assert.equal(f.opened.length, 0); f.unmount();
    });
  }
  const report = { allPassed: true, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), count: checks.length,
    checks, evidence: 'Real component hooks; isolated reporter, installation and OS permission boundaries. No live consent writes or device delivery claim.' };
  if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
  else console.log(`PASS ${checks.length} customer notification notice scenarios.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
