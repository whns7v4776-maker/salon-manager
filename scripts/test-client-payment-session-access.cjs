const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/lib/client-payment-session.ts');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter(value => value.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
const now = Date.UTC(2026, 9, 10, 12);
const identity = { salonCode: 'morph-test', email: 'existing@customer.test', phone: '333 123 4567' };
const another = { salonCode: 'other-test', email: identity.email, phone: identity.phone };
const token = letter => letter.repeat(64);
const session = (letter = 'a', expiresAt = new Date(now + 3600000).toISOString()) => ({ token: token(letter), expiresAt });
const legacyKey = value => 'customer_payment_' + Array.from(JSON.stringify([
  value.salonCode.trim().toLowerCase(), value.email.trim().toLowerCase(), value.phone.replace(/\D/g, ''),
])).map(char => char.codePointAt(0).toString(16).padStart(6, '0')).join('');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const authError = () => new Error('Verifica la password per accedere ai pagamenti.');

function fixture(platform = 'web', options = {}) {
  const storage = new Map(options.storage ?? []);
  const calls = { rpc: [], readVault: [], saveVault: [], read: [], write: [], remove: [] };
  const state = {
    rpc: options.rpc ?? (async () => ({ data: session('b'), error: null })),
    password: options.password ?? 'fixture-password',
    get: options.get,
    set: options.set,
    remove: options.remove,
    saveVault: options.saveVault,
  };
  const read = key => {
    calls.read.push(key);
    return state.get ? state.get(key, storage) : storage.get(key) ?? null;
  };
  const write = (key, value) => {
    calls.write.push({ key, value });
    return state.set ? state.set(key, value, storage) : storage.set(key, value);
  };
  const remove = key => {
    calls.remove.push(key);
    return state.remove ? state.remove(key, storage) : storage.delete(key);
  };
  const mocks = {
    'react-native': { Platform: { OS: platform } },
    'expo-secure-store': {
      getItemAsync: async key => read(key),
      setItemAsync: async (key, value) => { await write(key, value); },
      deleteItemAsync: async key => { await remove(key); },
    },
    './supabase': { publicSupabase: { rpc: async (name, args) => {
      calls.rpc.push({ name, salon: args.p_salon_code, email: args.p_email, phone: args.p_phone });
      return state.rpc(name, args);
    } } },
    './client-password-vault': {
      readClientPasswordFromVault: async value => { calls.readVault.push(value); return state.password; },
      saveClientPasswordToVault: async value => {
        calls.saveVault.push({ salonCode: value.salonCode, email: value.email, phone: value.phone });
        if (state.saveVault) await state.saveVault(value);
      },
    },
  };
  const exports = {};
  class FixtureDate extends Date { static now() { return now; } }
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: name => { assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`); return mocks[name]; },
    window: { sessionStorage: { getItem: read, setItem: write, removeItem: remove } },
    Date: FixtureDate, Error, Promise, Map, Set, JSON, Array,
  }, { filename: file });
  return { api: exports, storage, calls, state };
}

const records = [];
async function check(name, run) {
  const started = performance.now();
  if (process.env.PAYMENT_SESSION_TEST_PROGRESS) console.error(`Checking: ${name}`);
  let timeout;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Fixture did not complete within 3 seconds.')), 3000); }),
    ]);
    records.push({ name, passed: true, milliseconds: Math.round(performance.now() - started) });
  } catch (error) {
    records.push({ name, passed: false, error: error?.stack ?? String(error), milliseconds: Math.round(performance.now() - started) });
  } finally { clearTimeout(timeout); }
}
async function expectAccessError(promise, code) {
  await assert.rejects(promise, error => error?.name === 'CustomerPaymentAccessError' && error.code === code);
}

(async () => {
  for (const platform of ['web', 'ios', 'android']) {
    await check(`legacy token and normalized identity remain usable on ${platform}`, async () => {
      const f = fixture(platform, { storage: [[legacyKey(identity), JSON.stringify(session())]] });
      const normalized = { salonCode: ' MORPH-TEST ', email: ' EXISTING@CUSTOMER.TEST ', phone: '(333) 123-4567' };
      assert.equal(await f.api.customerPaymentToken(normalized), token('a'));
      assert.equal(await f.api.customerPaymentToken(identity), token('a'));
      assert.equal(f.calls.rpc.length, 0);
      assert.equal(f.calls.readVault.length, 0);
      assert.deepEqual(f.calls.read, [legacyKey(identity)]);
    });
  }
  await check('expired native session renews once for simultaneous consumers', async () => {
    const gate = deferred();
    const f = fixture('ios', {
      storage: [[legacyKey(identity), JSON.stringify(session('a', new Date(now - 1000).toISOString()))]],
      rpc: async () => gate.promise,
    });
    const waiting = Array.from({ length: 5 }, () => f.api.customerPaymentToken(identity));
    await flush(); assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.readVault.length, 1);
    gate.resolve({ data: session('b'), error: null });
    assert.deepEqual(await Promise.all(waiting), Array(5).fill(token('b')));
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('b'));
  });
  await check('incorrect saved password stops repeated background authentication until explicit success', async () => {
    const f = fixture('android', { rpc: async () => ({ data: null, error: { message: 'invalid_customer_password' } }) });
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.readVault.length, 1);
    f.state.rpc = async () => ({ data: session('b'), error: null });
    assert.equal(await f.api.authenticateCustomerPayment(identity, 'new-fixture-password'), token('b'));
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(f.calls.rpc.length, 2);
  });
  await check('RPC transport failures stay temporary and do not become password failures', async () => {
    const f = fixture('ios', { rpc: async () => { throw new Error('fetch failed'); } });
    await expectAccessError(f.api.customerPaymentToken(identity), 'unavailable');
    f.state.rpc = async () => ({ data: session('b'), error: null });
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(f.calls.rpc.length, 2);
    assert.equal(f.api.isCustomerPaymentAuthenticationError(new f.api.CustomerPaymentAccessError('unavailable', 'Verifica la password network timeout')), false);
  });
  await check('RPC error and malformed successful response do not authorize financial access', async () => {
    for (const response of [
      { data: null, error: { message: 'Database temporarily unavailable' } },
      { data: { token: 'not-a-real-token', expiresAt: session().expiresAt }, error: null },
      { data: session('a', new Date(now - 1000).toISOString()), error: null },
    ]) {
      const f = fixture('ios', { rpc: async () => response });
      await expectAccessError(f.api.authenticateCustomerPayment(identity, 'fixture-password'), 'unavailable');
      assert.equal(f.calls.write.length, 0);
    }
  });
  await check('unauthenticated policy access is opt-in and preserves a paid-policy network failure', async () => {
    const f = fixture('web'); const inputs = [];
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async value => inputs.push(value)), 'auth_required');
    assert.deepEqual(inputs, []);
    assert.equal(await f.api.withCustomerPaymentToken(identity, async value => { inputs.push(value); return 'policy'; }, { allowUnauthenticated: true }), 'policy');
    assert.deepEqual(inputs, ['']);
    const offline = fixture('ios', { rpc: async () => { throw new Error('Network unavailable'); } });
    await expectAccessError(offline.api.withCustomerPaymentToken(identity, async value => {
      assert.equal(value, ''); throw authError();
    }, { allowUnauthenticated: true }), 'unavailable');
  });
  await check('public pay-in-salon policy remains accessible despite a local credential-RPC outage', async () => {
    const f = fixture('ios', { rpc: async () => { throw new Error('Network unavailable'); } });
    const calls = [];
    const policy = await f.api.withCustomerPaymentToken(identity, async value => {
      calls.push(value); return { enabled: true, policy: { mode: 'salon', percent: 0 } };
    }, { allowUnauthenticated: true });
    assert.deepEqual(policy, { enabled: true, policy: { mode: 'salon', percent: 0 } });
    assert.deepEqual(calls, ['']);
  });
  await check('public pay-in-salon policy remains accessible despite local session-storage failure', async () => {
    const f = fixture('web', { get: () => { throw new Error('Storage unavailable'); } });
    const calls = [];
    const policy = await f.api.withCustomerPaymentToken(identity, async value => {
      calls.push(value); return { enabled: true, policy: { mode: 'salon', percent: 0 } };
    }, { allowUnauthenticated: true });
    assert.equal(policy.policy.mode, 'salon'); assert.deepEqual(calls, ['']);
  });
  await check('paid-policy server rejection cannot use local storage failure to authorize access', async () => {
    const f = fixture('web', { get: () => { throw new Error('Storage unavailable'); } });
    let calls = 0;
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async value => {
      calls++; assert.equal(value, ''); throw authError();
    }, { allowUnauthenticated: true }), 'unavailable');
    assert.equal(calls, 1);
  });
  await check('server-rejected native token renews securely and retries the consumer exactly once', async () => {
    const f = fixture('ios', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]] });
    const inputs = [];
    const result = await f.api.withCustomerPaymentToken(identity, async value => {
      inputs.push(value); if (value === token('a')) throw authError(); return 'verified';
    });
    assert.equal(result, 'verified'); assert.deepEqual(inputs, [token('a'), token('b')]);
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.remove.length, 1);
  });
  await check('consumer transport failures are never retried as payment mutations', async () => {
    const f = fixture('ios', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]] });
    let attempts = 0;
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async () => { attempts++; throw new Error('Network timeout after request'); }), 'unavailable');
    assert.equal(attempts, 1); assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.remove.length, 0);
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
  });
  await check('second authentication rejection ends retry and prevents background credential loops', async () => {
    const f = fixture('android', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]] });
    let attempts = 0;
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async () => { attempts++; throw authError(); }), 'auth_required');
    assert.equal(attempts, 2); assert.equal(f.calls.rpc.length, 1);
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
    assert.equal(f.calls.rpc.length, 1);
  });
  await check('payment identities and invalidation stay isolated between saloons', async () => {
    const f = fixture('web', { storage: [
      [legacyKey(identity), JSON.stringify(session('a'))], [legacyKey(another), JSON.stringify(session('c'))],
    ] });
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
    assert.equal(await f.api.customerPaymentToken(another), token('c'));
    await f.api.invalidateCustomerPaymentToken(identity);
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
    assert.equal(await f.api.customerPaymentToken(another), token('c'));
    assert.equal(f.storage.has(legacyKey(another)), true);
  });
  await check('logout while credential RPC is pending cannot persist or resurrect a late session', async () => {
    const gate = deferred(); const f = fixture('ios', { rpc: async () => gate.promise });
    const pending = f.api.authenticateCustomerPayment(identity, 'fixture-password');
    const outcome = pending.catch(error => error);
    await flush(); await f.api.invalidateCustomerPaymentToken(identity);
    gate.resolve({ data: session('b'), error: null });
    assert.equal((await outcome).code, 'auth_required');
    assert.equal(f.calls.write.length, 0); assert.equal(f.calls.saveVault.length, 0);
    assert.equal(f.storage.has(legacyKey(identity)), false);
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
  });
  await check('logout racing a native storage write is serialized and removes the late token', async () => {
    const started = deferred(), gate = deferred();
    const f = fixture('android', { set: async (key, value, store) => { started.resolve(); await gate.promise; store.set(key, value); } });
    const pending = f.api.authenticateCustomerPayment(identity, 'fixture-password').catch(error => error);
    await started.promise;
    const logout = f.api.invalidateCustomerPaymentToken(identity);
    gate.resolve(); await logout;
    assert.equal((await pending).code, 'auth_required');
    assert.equal(f.storage.has(legacyKey(identity)), false);
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
  });
  await check('logout racing vault persistence cannot send an authenticated event', async () => {
    const started = deferred(), gate = deferred(), events = [];
    const f = fixture('ios', { saveVault: async () => { started.resolve(); await gate.promise; } });
    f.api.subscribeCustomerPaymentSession(identity, event => events.push(event));
    const pending = f.api.authenticateCustomerPayment(identity, 'fixture-password').catch(error => error);
    await started.promise; const logout = f.api.invalidateCustomerPaymentToken(identity); gate.resolve(); await logout;
    assert.equal((await pending).code, 'auth_required');
    assert.deepEqual(events, ['invalidated']);
    await expectAccessError(f.api.customerPaymentToken(identity), 'auth_required');
  });
  await check('listeners share normalized identity, ignore unrelated accounts, and unsubscribe safely', async () => {
    const f = fixture('web'), events = [], unrelated = [];
    const unsubscribe = f.api.subscribeCustomerPaymentSession(identity, event => events.push(event));
    f.api.subscribeCustomerPaymentSession(another, event => unrelated.push(event));
    f.api.subscribeCustomerPaymentSession(identity, () => { throw new Error('Observer failed'); });
    const equivalent = { ...identity, salonCode: ' MORPH-TEST ', email: 'EXISTING@CUSTOMER.TEST', phone: '333-123-4567' };
    await f.api.authenticateCustomerPayment(equivalent, 'fixture-password');
    await f.api.invalidateCustomerPaymentToken(identity);
    unsubscribe(); await f.api.authenticateCustomerPayment(identity, 'fixture-password');
    assert.deepEqual(events, ['authenticated', 'invalidated']); assert.deepEqual(unrelated, []);
  });
  await check('storage write failure preserves only the verified in-memory session', async () => {
    const f = fixture('ios', { set: async () => { throw new Error('Storage unavailable'); } });
    assert.equal(await f.api.authenticateCustomerPayment(identity, 'fixture-password'), token('b'));
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.storage.size, 0);
  });
  await check('protected financial access cannot fall back when local storage is unavailable', async () => {
    const f = fixture('web', { get: () => { throw new Error('Storage unavailable'); } });
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async () => assert.fail('Protected access cannot bypass verification')), 'unavailable');
    assert.equal(f.calls.rpc.length, 0);
  });
  await check('late old-token rejection during renewal does not cancel the new authentication', async () => {
    const gate = deferred();
    const f = fixture('ios', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]], rpc: async () => gate.promise });
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
    await f.api.invalidateCustomerPaymentToken(identity, token('a'));
    const renewal = f.api.customerPaymentToken(identity).catch(error => error);
    await flush(); await f.api.invalidateCustomerPaymentToken(identity, token('a'));
    gate.resolve({ data: session('b'), error: null });
    assert.equal(await renewal, token('b')); assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(f.calls.rpc.length, 1);
  });
  await check('late old-token rejection after renewal never deletes the newer token', async () => {
    const f = fixture('ios', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]] });
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
    await f.api.invalidateCustomerPaymentToken(identity, token('a'));
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    await f.api.invalidateCustomerPaymentToken(identity, token('a'));
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('b'));
  });
  await check('simultaneous consumers rejected by the server share exactly one renewal', async () => {
    const gate = deferred();
    const f = fixture('ios', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]], rpc: async () => gate.promise });
    const operation = async value => { if (value === token('a')) throw authError(); return value; };
    const outcomes = [f.api.withCustomerPaymentToken(identity, operation), f.api.withCustomerPaymentToken(identity, operation)]
      .map(outcome => outcome.catch(error => error));
    await flush();
    gate.resolve({ data: session('b'), error: null });
    assert.deepEqual(await Promise.all(outcomes), [token('b'), token('b')]);
    assert.equal(f.calls.rpc.length, 1);
  });
  await check('an old invalidation paused on storage lookup cannot invalidate a newer explicit login', async () => {
    const started = deferred(), gate = deferred();
    const f = fixture('ios', {
      storage: [[legacyKey(identity), JSON.stringify(session('a'))]],
      get: async (key, store) => {
        const snapshot = store.get(key) ?? null;
        started.resolve(); await gate.promise; return snapshot;
      },
    });
    const lateRejection = f.api.invalidateCustomerPaymentToken(identity, token('a'));
    await started.promise;
    assert.equal(await f.api.authenticateCustomerPayment(identity, 'new-fixture-password'), token('b'));
    gate.resolve(); await lateRejection;
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('b'));
    assert.equal(f.calls.rpc.length, 1);
  });
  await check('a direct token consumer waits for rejected-token storage deletion before renewing', async () => {
    const started = deferred(), removeGate = deferred();
    const f = fixture('ios', {
      storage: [[legacyKey(identity), JSON.stringify(session('a'))]],
      remove: async (key, store) => { started.resolve(); await removeGate.promise; store.delete(key); },
    });
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
    const invalidation = f.api.invalidateCustomerPaymentToken(identity, token('a'));
    await started.promise;
    const next = f.api.customerPaymentToken(identity).catch(error => error);
    await flush(); removeGate.resolve(); await invalidation;
    assert.equal(await next, token('b'));
    assert.equal(f.calls.rpc.length, 1);
  });
  await check('failed native token deletion cannot make a rejected stored token usable again', async () => {
    const f = fixture('ios', {
      storage: [[legacyKey(identity), JSON.stringify(session('a'))]],
      remove: async () => { throw new Error('Storage write unavailable'); },
    });
    assert.equal(await f.api.customerPaymentToken(identity), token('a'));
    await f.api.invalidateCustomerPaymentToken(identity, token('a'));
    assert.equal(await f.api.customerPaymentToken(identity), token('b'));
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('b'));
  });
  for (const staleResponse of ['invalid-password', 'success']) {
    await check(`a late silent authentication ${staleResponse} cannot block a newer explicit verified login`, async () => {
      const gate = deferred(); let rpcCalls = 0;
      const f = fixture('ios', { rpc: async () => {
        rpcCalls++;
        return rpcCalls === 1 ? gate.promise : { data: session('c'), error: null };
      } });
      const stale = f.api.customerPaymentToken(identity).catch(error => error);
      await flush(); assert.equal(f.calls.rpc.length, 1);
      assert.equal(await f.api.authenticateCustomerPayment(identity, 'new-fixture-password'), token('c'));
      gate.resolve(staleResponse === 'success'
        ? { data: session('b'), error: null }
        : { data: null, error: { message: 'invalid_customer_password' } });
      assert.equal((await stale).code, 'auth_required');
      assert.equal(await f.api.customerPaymentToken(identity), token('c'));
      assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('c'));
      assert.equal(f.calls.rpc.length, 2);
    });
  }
  await check('late retry rejection cannot block a newer explicit authentication', async () => {
    const retryStarted = deferred(), retryGate = deferred(); let authCalls = 0;
    const f = fixture('ios', {
      storage: [[legacyKey(identity), JSON.stringify(session('a'))]],
      rpc: async () => ({ data: session(++authCalls === 1 ? 'b' : 'c'), error: null }),
    });
    const pending = f.api.withCustomerPaymentToken(identity, async value => {
      if (value === token('a')) throw authError();
      retryStarted.resolve(); await retryGate.promise; throw authError();
    }).catch(error => error);
    await retryStarted.promise;
    assert.equal(await f.api.authenticateCustomerPayment(identity, 'new-fixture-password'), token('c'));
    retryGate.resolve(); assert.equal((await pending).code, 'auth_required');
    assert.equal(await f.api.customerPaymentToken(identity), token('c'));
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('c'));
  });
  await check('concurrent explicit native verifications serialize vault writes and preserve the newest login', async () => {
    const started = deferred(), gate = deferred(), saved = []; let authCalls = 0;
    const f = fixture('ios', {
      rpc: async () => ({ data: session(++authCalls === 1 ? 'b' : 'c'), error: null }),
      saveVault: async value => {
        if (value.password === 'first-fixture-password') { started.resolve(); await gate.promise; }
        saved.push(value.password);
      },
    });
    const older = f.api.authenticateCustomerPayment(identity, 'first-fixture-password').catch(error => error);
    await started.promise;
    const latest = f.api.authenticateCustomerPayment(identity, 'latest-fixture-password').catch(error => error);
    await flush(); gate.resolve();
    assert.equal((await older).code, 'auth_required'); assert.equal(await latest, token('c'));
    assert.deepEqual(saved, ['first-fixture-password', 'latest-fixture-password']);
    assert.equal(await f.api.customerPaymentToken(identity), token('c'));
    assert.equal(JSON.parse(f.storage.get(legacyKey(identity))).token, token('c'));
  });
  await check('web rejection never silently renews from a password handoff or grants financial access', async () => {
    const f = fixture('web', { storage: [[legacyKey(identity), JSON.stringify(session('a'))]] });
    let attempts = 0;
    await expectAccessError(f.api.withCustomerPaymentToken(identity, async () => { attempts++; throw authError(); }), 'auth_required');
    assert.equal(attempts, 1); assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.readVault.length, 0);
  });
  const result = {
    checkedAt: new Date().toISOString(), source: 'src/lib/client-payment-session.ts',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    testScope: 'Actual transpiled module; isolated web/native storage, credential RPC, and vault boundaries. No remote calls or payments.',
    allPassed: records.every(record => record.passed), count: records.length,
    passed: records.filter(record => record.passed).length,
    failed: records.filter(record => !record.passed).length,
    records,
  };
  const report = process.env.SALONPRO_TEST_REPORT || path.join(root, 'work/client-payment-access-fix-20261010/session-access-tests.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.allPassed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
