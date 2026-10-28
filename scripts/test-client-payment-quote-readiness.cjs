const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const componentSource = fs.readFileSync(path.join(root, 'components/client-booking-payment.tsx'), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
function pure(relative) {
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, relative), 'utf8')), { exports, Intl, URL, Date });
  return exports;
}
const policy = pure('src/lib/booking-payment-policy.ts');
const flow = pure('src/lib/booking-payment-flow.ts');
const flush = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
function setup() {
  let cursor = 0, pendingEffects = [];
  const slots = [], requests = [], quotes = [], readiness = [];
  const deadlines = new Set();
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(() => {
          slots[index].cleanup?.(); slots[index].cleanup = effect();
        });
      }
    },
    useCallback(callback) { return callback; },
  };
  const exports = {};
  const dependencies = {
    react: React,
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: value => value },
      AppState: {}, Linking: {}, Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '../src/lib/client-payment-session': {
      withCustomerPaymentToken: async (_identity, operation, options) => {
        assert.equal(options.allowUnauthenticated, true, 'Only this safe policy quote may request legacy access.');
        return operation('');
      },
      customerPaymentAccessError: value => value instanceof Error ? value : new Error('Unavailable'),
      isCustomerPaymentAuthenticationError: value => value?.code === 'auth_required' || /password/i.test(value?.message ?? ''),
      subscribeCustomerPaymentSession: () => () => {},
      authenticateCustomerPayment() { throw new Error('authentication action denied'); },
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../src/lib/supabase': { supabaseUrl: 'https://isolated.invalid', supabase: { functions: { invoke() { throw new Error('An owner session cannot block the customer quote.'); } } }, publicSupabase: { functions: {
      invoke(endpoint, options) {
        assert.equal(endpoint, 'cash-stripe?action=booking');
        assert.equal(options.body.operation, 'quote', 'This fixture cannot checkout, pay or mutate a booking.');
        let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        requests.push({ options, resolve, reject }); return promise;
      },
    } } },
    '../src/lib/booking-payment-policy': policy,
    '../src/lib/booking-payment-flow': flow,
    './ui/haptic-touchable': { HapticTouchable: 'HapticTouchable' },
  };
  vm.runInNewContext(compile(componentSource), { exports, Intl, URL, Date, Error, Set, AbortController,
    setTimeout(callback) { const timer = { callback }; deadlines.add(timer); return timer; }, clearTimeout(timer) { deadlines.delete(timer); },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  const defaults = { salonCode: 'isolated-salon', email: 'customer@isolated.test', phone: '3331234567',
    total: 10, lineTotals: [5, 5], packageApplied: false,
    onQuoteChange(value) { quotes.push(value); }, onQuoteReadyChange(value) { readiness.push(value); } };
  function render(props = {}) {
    cursor = 0; pendingEffects = [];
    const tree = exports.BookingPaymentNotice({ ...defaults, ...props });
    const effects = pendingEffects; pendingEffects = []; effects.forEach(run => run());
    return tree;
  }
  return { render, requests, quotes, readiness, defaults,
    reply(index, result) { requests[index].resolve({ data: result, error: null }); },
    deadline() { const pending = [...deadlines]; deadlines.clear(); pending.forEach(timer => timer.callback()); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
const records = [];
async function check(name, run) { await run(); records.push({ name, passed: true }); }
const quote = (mode = 'deposit', percent = 50) => ({ enabled: true, policy: { mode, percent } });
(async () => {
  await check('a stalled policy quote ends with a retry and cannot later enable booking from a stale response', async () => {
    const s = setup(); s.render(); await flush(); s.deadline(); await flush();
    const tree = s.render(); assert.ok(tree); assert.equal(s.readiness.at(-1), false);
    assert.equal(s.requests[0].options.signal.aborted, true);
    s.reply(0, quote('deposit', 50)); await flush(); s.render();
    assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null); s.unmount();
  });
  await check('unresolved quote cannot enable booking, including after price changes', async () => {
    const s = setup(); s.render(); await flush();
    assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null);
    s.render({ total: 24, lineTotals: [9, 15] });
    assert.equal(s.readiness.at(-1), false);
    s.reply(0, quote()); await flush(); s.render({ total: 24, lineTotals: [9, 15] });
    assert.equal(s.readiness.at(-1), true); assert.equal(s.quotes.at(-1).totalCents, 2400);
    assert.equal(s.quotes.at(-1).dueCents, 1200);
  });
  await check('a fetched deposit policy always prices the current composition lines', async () => {
    const s = setup(); s.render(); await flush(); s.reply(0, quote()); await flush(); s.render();
    assert.equal(s.quotes.at(-1).dueCents, 500);
    s.render({ total: 8, lineTotals: [3, 5] });
    assert.equal(s.quotes.at(-1).totalCents, 800); assert.equal(s.quotes.at(-1).dueCents, 400);
    assert.equal(s.requests.length, 1, 'Changing the draft amount reuses policy but recomputes current cents.');
  });
  await check('full payment and covered package extra quote current payable amounts', async () => {
    const s = setup(); s.render(); await flush(); s.reply(0, quote('full', 100)); await flush();
    s.render({ total: 6, lineTotals: [0, 6], packageApplied: true });
    assert.equal(s.quotes.at(-1).totalCents, 600); assert.equal(s.quotes.at(-1).dueCents, 600);
    assert.equal(s.quotes.at(-1).balanceCents, 0);
    s.render({ total: 0, lineTotals: [0], packageApplied: true });
    assert.equal(s.readiness.at(-1), true); assert.equal(s.quotes.at(-1).dueCents, 0);
  });
  await check('disabled online payments still produce confirmed salon readiness', async () => {
    const s = setup(); s.render(); await flush(); s.reply(0, { enabled: false }); await flush(); s.render();
    assert.equal(s.readiness.at(-1), true); assert.equal(s.quotes.at(-1), null);
  });
  await check('a legacy salon policy quote enables booking without a payment password', async () => {
    const s = setup(); s.render(); await flush(); s.reply(0, quote('salon', 0)); await flush();
    const tree = s.render();
    assert.equal(s.readiness.at(-1), true); assert.equal(s.requests[0].options.body.paymentToken, '');
    assert.ok(tree); assert.equal(s.quotes.at(-1).dueCents, 0);
  });
  await check('an unresolved enabled policy never marks the booking ready', async () => {
    const s = setup(); s.render(); await flush(); s.reply(0, { enabled: true }); await flush(); s.render();
    assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null);
  });
  for (const authError of [Object.assign(new Error('Conferma l’accesso.'), { code: 'auth_required' }), new Error('Verifica la password per accedere ai pagamenti.')]) {
    await check(`${authError.code ? 'typed' : 'legacy'} authentication error stays blocked and offers only contextual verification`, async () => {
      const s = setup(); s.render(); await flush(); s.requests[0].reject(authError); await flush();
      const tree = s.render(); assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null);
      assert.ok(tree.props.children.some(child => child?.type?.name === 'PaymentVerification'));
    });
  }
  await check('an identity change resets readiness and ignores a late previous policy', async () => {
    const s = setup(); s.render(); await flush();
    const next = { salonCode: 'another-salon', email: 'another@isolated.test' };
    s.render(next); await flush(); assert.equal(s.readiness.at(-1), false);
    s.reply(0, quote('full', 100)); await flush(); s.render(next);
    assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null);
    s.reply(1, quote('deposit', 30)); await flush(); s.render(next);
    assert.equal(s.readiness.at(-1), true); assert.equal(s.quotes.at(-1).dueCents, 300);
  });
  await check('A to B to A keeps the newest A policy when the first A response arrives last', async () => {
    const s = setup(); s.render(); await flush(); s.render({ salonCode: 'another-salon' }); await flush();
    s.render(); await flush(); s.reply(2, quote('deposit', 30)); await flush(); s.render();
    assert.equal(s.quotes.at(-1).dueCents, 300);
    s.reply(0, quote('full', 100)); s.reply(1, quote('deposit', 90)); await flush(); s.render();
    assert.equal(s.quotes.at(-1).dueCents, 300);
  });
  await check('a failed quote stays blocked until the actual retry callback receives authority', async () => {
    const s = setup(); s.render(); await flush(); s.requests[0].reject(new Error('offline')); await flush();
    const tree = s.render(); assert.equal(s.readiness.at(-1), false); assert.equal(s.quotes.at(-1), null);
    function findRetry(node) {
      if (!node || typeof node !== 'object') return null;
      if (node.type === 'HapticTouchable' && node.props.onPress) return node;
      for (const child of node.props?.children || []) { const match = findRetry(child); if (match) return match; }
      return null;
    }
    const retry = findRetry(tree); assert.ok(retry); retry.props.onPress(); s.render(); await flush();
    assert.equal(s.requests.length, 2); s.reply(1, quote()); await flush(); s.render();
    assert.equal(s.readiness.at(-1), true); assert.equal(s.quotes.at(-1).dueCents, 500);
  });
  await check('unmount cancels the quote result before it can change readiness', async () => {
    const s = setup(); s.render(); await flush(); const before = s.readiness.length;
    s.unmount(); s.reply(0, quote()); await flush();
    assert.equal(s.readiness.length, before); assert.equal(s.quotes.at(-1), null);
  });
  const report = { platform: 'actual quote component hooks in isolation; read-only quote API stub; no rendered UI',
    sourceSha256: crypto.createHash('sha256').update(componentSource).digest('hex'), cases: records,
    remoteApiCalls: 0, checkouts: 0, payments: 0, productionSourceModified: false };
  if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
  else console.log(`PASS ${records.length} actual quote readiness scenarios: current prices, deposit/full, package extras, identity races, errors, retry and unmount. No remote calls or UI validation.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
