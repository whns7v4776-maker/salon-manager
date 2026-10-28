const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/lib/customer-notification-consent-reporter.ts');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter(value => value.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(platform = 'ios', configuration = {}) {
  let time = 0;
  let nextTimer = 1;
  const timers = new Map();
  const subscribers = new Set();
  const calls = { reads: 0, rpc: [], permission: [], confirmed: [], removed: 0 };
  const state = {
    permission: configuration.permission ?? 'granted',
    read: configuration.read,
    rpc: configuration.rpc ?? (async () => ({ data: true, error: null })),
    appState: configuration.appState ?? 'active',
  };
  const appState = {
    get currentState() { return state.appState; },
    addEventListener: (name, callback) => {
      assert.equal(name, 'change');
      subscribers.add(callback);
      return { remove: () => { calls.removed++; subscribers.delete(callback); } };
    },
  };
  const mocks = {
    'react-native': { Platform: { OS: platform }, AppState: appState },
    'expo-notifications': {
      getPermissionsAsync: async () => { calls.reads++; return state.read ? state.read() : { status: state.permission }; },
    },
    './supabase': { publicSupabase: {
      rpc: (name, args) => {
        const call = { name, args, signal: null };
        calls.rpc.push(call);
        const request = {
          then(resolve, reject) { return Promise.resolve().then(() => state.rpc(call)).then(resolve, reject); },
        };
        if (!configuration.noRequestAbort) request.abortSignal = signal => { call.signal = signal; return request; };
        return request;
      },
    } },
  };
  const exports = {};
  const setTimer = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: time + delay }); return id; };
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: name => { assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`); return mocks[name]; },
    setTimeout: setTimer,
    clearTimeout: id => timers.delete(id),
    AbortController: configuration.noAbort ? undefined : AbortController,
    Promise, Error,
  }, { filename: file });
  const reporter = exports.createCustomerNotificationConsentReporter({
    salonCode: configuration.salonCode ?? ' morph-fixture ',
    appInstanceId: configuration.appInstanceId ?? ' customer-installation ',
    platform: configuration.reportedPlatform ?? platform,
    onPermission: permission => { calls.permission.push(permission); return configuration.onPermission?.(permission); },
    onConfirmed: permission => { calls.confirmed.push(permission); return configuration.onConfirmed?.(permission); },
  });
  const emit = async value => {
    state.appState = value;
    for (const callback of [...subscribers]) callback(value);
    await flush();
  };
  const advance = async elapsed => {
    const target = time + elapsed;
    let iterations = 0;
    for (;;) {
      const candidate = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!candidate) break;
      assert.ok(iterations++ < 200, 'Unexpected timer loop');
      const [id, timer] = candidate;
      time = timer.at;
      timers.delete(id);
      timer.callback();
      await flush();
    }
    time = target;
    await flush();
  };
  return { reporter, state, calls, timers, subscribers, emit, advance, clock: () => time };
}

const records = [];
async function check(name, run) {
  try {
    await run();
    records.push({ name, passed: true });
  } catch (error) {
    records.push({ name, passed: false, error: error?.stack ?? String(error) });
  }
}

(async () => {
  for (const platform of ['ios', 'android']) {
    for (const permission of ['granted', 'denied', 'undetermined']) {
      await check(`${platform} reports actual ${permission} only for its scoped native identity`, async () => {
        const f = fixture(platform, { permission });
        assert.equal(await f.reporter.refresh(), true);
        assert.equal(f.calls.rpc.length, 1);
        assert.equal(f.calls.rpc[0].name, 'report_customer_notification_permission_v1');
        assert.deepEqual({ ...f.calls.rpc[0].args }, {
          p_salon_code: 'morph-fixture', p_app_instance_id: 'customer-installation', p_permission: permission, p_platform: platform,
        });
        assert.deepEqual(f.calls.permission, [permission]);
        assert.deepEqual(f.calls.confirmed, [permission]);
        assert.equal(f.timers.size, 0);
        f.reporter.stop();
        assert.equal(f.subscribers.size, 0);
      });
    }
  }
  await check('no report, permission read, timer, or listener exists on web', async () => {
    const f = fixture('web');
    assert.equal(await f.reporter.refresh(), false);
    assert.equal(f.calls.reads, 0); assert.equal(f.calls.rpc.length, 0);
    assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
    f.reporter.stop();
  });
  await check('native identity cannot be mislabeled as another platform', async () => {
    const f = fixture('android', { reportedPlatform: 'ios' });
    assert.equal(await f.reporter.refresh(), false);
    assert.equal(f.calls.reads, 0); assert.equal(f.subscribers.size, 0);
  });
  await check('blank identity is never reported or kept in retry state', async () => {
    for (const args of [{ salonCode: ' ' }, { appInstanceId: '' }]) {
      const f = fixture('ios', args);
      assert.equal(await f.reporter.refresh(), false);
      assert.equal(f.calls.reads, 0); assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
    }
  });
  for (const [label, response] of [
    ['false identity-claim response', { data: false, error: null }],
    ['RPC error even with true data', { data: true, error: { message: 'temporarily unavailable' } }],
    ['nonboolean success payload', { data: { accepted: true }, error: null }],
    ['missing explicit error-null acknowledgment', { data: true }],
  ]) {
    await check(`${label} retries and does not claim server confirmation`, async () => {
      const f = fixture('ios', { rpc: async () => response });
      assert.equal(await f.reporter.refresh(), false);
      assert.deepEqual(f.calls.confirmed, []);
      assert.deepEqual(f.calls.permission, ['granted']);
      f.state.permission = 'denied';
      f.state.rpc = async () => ({ data: true, error: null });
      await f.advance(1499); assert.equal(f.calls.rpc.length, 1);
      await f.advance(1);
      assert.equal(f.calls.rpc.length, 2);
      assert.equal(f.calls.rpc[1].args.p_permission, 'denied');
      assert.deepEqual(f.calls.confirmed, ['denied']);
      assert.equal(f.timers.size, 0);
      f.reporter.stop();
    });
  }
  await check('thrown transport errors stay retryable and re-read the OS', async () => {
    const f = fixture('android', { rpc: async () => { throw new Error('Offline'); } });
    assert.equal(await f.reporter.refresh(), false);
    f.state.permission = 'undetermined';
    f.state.rpc = async () => ({ data: true, error: null });
    await f.advance(1500);
    assert.deepEqual(f.calls.confirmed, ['undetermined']);
    assert.equal(f.calls.reads, 2);
    f.reporter.stop();
  });
  await check('OS permission read failures never fabricate denied or send an RPC', async () => {
    const f = fixture('ios', { read: async () => { throw new Error('OS unavailable'); } });
    assert.equal(await f.reporter.refresh(), false);
    assert.deepEqual(f.calls.permission, []); assert.deepEqual(f.calls.confirmed, []); assert.equal(f.calls.rpc.length, 0);
    f.state.read = undefined; f.state.permission = 'granted';
    await f.advance(1500);
    assert.deepEqual(f.calls.permission, ['granted']); assert.deepEqual(f.calls.confirmed, ['granted']);
    f.reporter.stop();
  });
  await check('unknown OS permission never becomes a stored denial', async () => {
    const f = fixture('android', { permission: 'unreadable' });
    assert.equal(await f.reporter.refresh(), false);
    assert.deepEqual(f.calls.permission, []); assert.equal(f.calls.rpc.length, 0);
    f.reporter.stop();
  });
  await check('concurrent refresh requests serialize one followup with the newest permission', async () => {
    const gate = deferred();
    const f = fixture('ios', { rpc: async () => gate.promise });
    const first = f.reporter.refresh();
    await flush(); assert.equal(f.calls.rpc.length, 1);
    f.state.permission = 'denied';
    const followups = Array.from({ length: 10 }, () => f.reporter.refresh());
    f.state.rpc = async () => ({ data: true, error: null });
    gate.resolve({ data: true, error: null });
    assert.deepEqual(await Promise.all([first, ...followups]), Array(11).fill(true));
    assert.equal(f.calls.rpc.length, 2); assert.equal(f.calls.reads, 2);
    assert.deepEqual(f.calls.permission, ['granted', 'denied']);
    assert.deepEqual(f.calls.confirmed, ['denied']);
    f.reporter.stop();
  });
  await check('an explicit refresh bypasses a queued retry after a successful session claim', async () => {
    const f = fixture('android', { rpc: async () => ({ data: false, error: null }) });
    assert.equal(await f.reporter.refresh(), false);
    f.state.rpc = async () => ({ data: true, error: null });
    assert.equal(await f.reporter.refresh(), true);
    await f.advance(1500);
    assert.equal(f.calls.rpc.length, 2); assert.equal(f.timers.size, 0);
    f.reporter.stop();
  });
  await check('every acknowledged refresh publishes confirmation without caching an old grant', async () => {
    const f = fixture('ios');
    await f.reporter.refresh(); await f.reporter.refresh();
    f.state.permission = 'denied'; await f.reporter.refresh();
    assert.deepEqual(f.calls.confirmed, ['granted', 'granted', 'denied']);
    f.reporter.stop();
  });
  await check('stopping a pending OS read resolves immediately and rejects its late result', async () => {
    const gate = deferred();
    const f = fixture('ios', { read: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    f.reporter.stop();
    assert.equal(await waiting, false);
    gate.resolve({ status: 'granted' }); await flush();
    assert.equal(f.calls.rpc.length, 0); assert.deepEqual(f.calls.permission, []);
    assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
    assert.equal(await f.reporter.refresh(), false);
  });
  await check('stopping a pending RPC aborts it and rejects a late acknowledgment', async () => {
    const gate = deferred();
    const f = fixture('android', { rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    const signal = f.calls.rpc[0].signal;
    f.reporter.stop(); f.reporter.stop();
    assert.equal(await waiting, false); assert.equal(signal.aborted, true);
    gate.resolve({ data: true, error: null }); await flush();
    assert.deepEqual(f.calls.confirmed, []); assert.equal(f.calls.removed, 1); assert.equal(f.timers.size, 0);
  });
  await check('reporting stays cancellable when native AbortController is unavailable', async () => {
    const gate = deferred();
    const f = fixture('ios', { noAbort: true, rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush(); f.reporter.stop();
    assert.equal(await waiting, false);
    gate.resolve({ data: true, error: null }); await flush();
    assert.deepEqual(f.calls.confirmed, []);
  });
  await check('reporting stays cancellable when the transport cannot attach an abort signal', async () => {
    const gate = deferred();
    const f = fixture('android', { noRequestAbort: true, rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush(); f.reporter.stop();
    assert.equal(await waiting, false); assert.equal(f.calls.rpc[0].signal, null);
    gate.resolve({ data: true, error: null }); await flush();
    assert.deepEqual(f.calls.confirmed, []);
  });
  await check('background cancels pending report and resume reports a fresh OS denial immediately', async () => {
    const gate = deferred();
    const f = fixture('ios', { rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    await f.emit('background'); assert.equal(await waiting, false);
    assert.equal(f.calls.rpc[0].signal.aborted, true); assert.equal(f.timers.size, 0);
    gate.resolve({ data: true, error: null }); await flush(); assert.deepEqual(f.calls.confirmed, []);
    f.state.permission = 'denied'; f.state.rpc = async () => ({ data: true, error: null });
    await f.emit('active');
    assert.equal(f.calls.rpc.length, 2); assert.deepEqual(f.calls.confirmed, ['denied']);
    f.reporter.stop();
  });
  await check('rapid inactive-active transitions cannot lose the fresh resume report', async () => {
    const gate = deferred();
    const f = fixture('ios', { rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    const pausing = f.emit('inactive');
    f.state.permission = 'denied'; f.state.rpc = async () => ({ data: true, error: null });
    const resuming = f.emit('active');
    await Promise.all([pausing, resuming]);
    assert.equal(await waiting, true);
    gate.resolve({ data: true, error: null }); await flush();
    assert.equal(f.calls.rpc.length, 2); assert.deepEqual(f.calls.confirmed, ['denied']);
    f.reporter.stop();
  });
  await check('duplicate active events do not duplicate already acknowledged reports', async () => {
    const f = fixture('android');
    await f.reporter.refresh(); await f.emit('active'); await f.emit('active');
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.timers.size, 0);
    f.reporter.stop();
  });
  await check('background initial state never reads or retries until first active event', async () => {
    const f = fixture('android', { appState: 'background' });
    assert.equal(await f.reporter.refresh(), false); await f.advance(600000);
    assert.equal(f.calls.reads, 0); assert.equal(f.calls.rpc.length, 0);
    await f.emit('active'); assert.equal(f.calls.rpc.length, 1);
    f.reporter.stop();
  });
  await check('failed reports retry at bounded low rate only while foreground', async () => {
    const f = fixture('ios', { rpc: async () => ({ data: false, error: null }) });
    assert.equal(await f.reporter.refresh(), false);
    for (const delay of [1500, 4000, 10000, 30000, 60000, 60000]) {
      const before = f.calls.rpc.length;
      await f.advance(delay - 1); assert.equal(f.calls.rpc.length, before);
      await f.advance(1); assert.equal(f.calls.rpc.length, before + 1);
    }
    await f.emit('background'); await f.advance(3600000);
    assert.equal(f.calls.rpc.length, 7); assert.equal(f.timers.size, 0);
    f.state.rpc = async () => ({ data: true, error: null });
    await f.emit('active'); assert.equal(f.calls.rpc.length, 8);
    f.reporter.stop();
  });
  await check('hung OS reads time out, never send stale permission, and retry a fresh read', async () => {
    const gate = deferred();
    const f = fixture('ios', { read: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    await f.advance(10000); assert.equal(await waiting, false);
    f.state.read = undefined; f.state.permission = 'denied';
    await f.advance(1500); assert.deepEqual(f.calls.confirmed, ['denied']);
    gate.resolve({ status: 'granted' }); await flush();
    assert.deepEqual(f.calls.permission, ['denied']); assert.equal(f.calls.rpc.length, 1);
    f.reporter.stop();
  });
  await check('hung transport requests time out, abort, and cannot confirm an old grant later', async () => {
    const gate = deferred();
    const f = fixture('android', { rpc: async () => gate.promise });
    const waiting = f.reporter.refresh(); await flush();
    await f.advance(10000); assert.equal(await waiting, false); assert.equal(f.calls.rpc[0].signal.aborted, true);
    f.state.permission = 'undetermined'; f.state.rpc = async () => ({ data: true, error: null });
    await f.advance(1500); gate.resolve({ data: true, error: null }); await flush();
    assert.deepEqual(f.calls.confirmed, ['undetermined']);
    f.reporter.stop();
  });
  await check('separate customer installations and salons never share queued statuses', async () => {
    const gate = deferred();
    const old = fixture('ios', { salonCode: 'old-salon', rpc: async () => gate.promise });
    const waiting = old.reporter.refresh(); await flush(); old.reporter.stop();
    const current = fixture('ios', { salonCode: 'current-salon', appInstanceId: 'new-installation', permission: 'denied' });
    assert.equal(await current.reporter.refresh(), true);
    gate.resolve({ data: true, error: null }); assert.equal(await waiting, false); await flush();
    assert.deepEqual(old.calls.confirmed, []); assert.deepEqual(current.calls.confirmed, ['denied']);
    assert.equal(current.calls.rpc[0].args.p_salon_code, 'current-salon');
    assert.equal(current.calls.rpc[0].args.p_app_instance_id, 'new-installation');
    current.reporter.stop();
  });
  await check('consumer callback failures never reject refresh or duplicate persisted reports', async () => {
    const f = fixture('ios', {
      onPermission: () => { throw new Error('UI callback failed'); },
      onConfirmed: async () => { throw new Error('Push registration failed'); },
    });
    assert.equal(await f.reporter.refresh(), true); await flush();
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.timers.size, 0);
    f.reporter.stop();
  });
  await check('a stop triggered by the OS callback prevents writing into a switched account', async () => {
    let reporter;
    const f = fixture('ios', { onPermission: () => reporter.stop() }); reporter = f.reporter;
    assert.equal(await reporter.refresh(), false);
    assert.equal(f.calls.rpc.length, 0); assert.equal(f.timers.size, 0);
  });

  const output = { allPassed: records.every(record => record.passed), count: records.length,
    sourceSha256: createHash('sha256').update(source).digest('hex'), cases: records };
  if (process.env.NOTIFICATION_CONSENT_REPORTER_REPORT) fs.writeFileSync(process.env.NOTIFICATION_CONSENT_REPORTER_REPORT, JSON.stringify(output, null, 2));
  for (const record of records) console.log(`${record.passed ? 'PASS' : 'FAIL'} ${record.name}${record.error ? '\n' + record.error : ''}`);
  console.log(`${records.filter(record => record.passed).length}/${records.length} customer notification consent reporter cases passed.`);
  if (!output.allPassed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
