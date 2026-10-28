/* Actual component hooks with isolated API, clock and lifecycle boundaries. No remote mutation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/client-booking-payment.tsx'), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function pure(relative) {
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, relative), 'utf8')), { exports, Intl, URL, Date });
  return exports;
}
const policy = pure('src/lib/booking-payment-policy.ts');
const flow = pure('src/lib/booking-payment-flow.ts');
const flush = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
const identityKey = identity => JSON.stringify([identity.salonCode, identity.email, identity.phone]);
const authError = () => Object.assign(new Error('Conferma l’accesso.'), { code: 'auth_required' });
function fixture({ platform = 'ios', component = 'BookingPaymentBanner', waitForToken = false } = {}) {
  let cursor = 0, effects = [], timerId = 0, disposed = false;
  const slots = [], requests = [], authRequests = [], tokenRequests = [], stateWrites = [], wrapperOptions = [];
  const deadlines = new Map();
  const timers = new Map(), appListeners = new Set(), sessionListeners = new Map(), documentListeners = new Map(), windowListeners = new Map();
  const defaults = { salonCode: 'salon-a', email: 'registered@example.invalid', phone: '3331234567', active: true };
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        assert.equal(disposed, false, 'A completed stale operation must never write after unmount.');
        stateWrites.push(index); slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: { current: initial } }; return slots[index].value; },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    useMemo(factory) { return factory(); },
    useCallback(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) slots[index] = { value: callback, dependencies };
      return slots[index].value;
    },
  };
  const defer = target => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); target.push({ resolve, reject }); return promise; };
  const appState = { currentState: 'active', addEventListener(_name, callback) { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } };
  const document = { visibilityState: 'visible', addEventListener(name, listener) { documentListeners.set(name, listener); }, removeEventListener(name, listener) { if (documentListeners.get(name) === listener) documentListeners.delete(name); } };
  const window = { location: { assign() { throw new Error('No checkout navigation is permitted by this fixture.'); } },
    addEventListener(name, listener) { windowListeners.set(name, listener); }, removeEventListener(name, listener) { if (windowListeners.get(name) === listener) windowListeners.delete(name); } };
  const dependencies = {
    react: React,
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: value => value }, AppState: appState,
      Linking: { openURL() { throw new Error('No checkout navigation is permitted by this fixture.'); } }, Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '../src/lib/client-payment-session': {
      withCustomerPaymentToken: async (identity, operation, options) => { wrapperOptions.push({ identity, options }); if (waitForToken) await defer(tokenRequests); return operation('fixture-token'); },
      customerPaymentAccessError: value => value instanceof Error ? value : new Error('Verifica non disponibile. Riprova.'),
      isCustomerPaymentAuthenticationError: value => value?.code === 'auth_required' || /password/i.test(value?.message ?? ''),
      subscribeCustomerPaymentSession(identity, listener) {
        const key = identityKey(identity); if (!sessionListeners.has(key)) sessionListeners.set(key, new Set());
        sessionListeners.get(key).add(listener); return () => sessionListeners.get(key).delete(listener);
      },
      authenticateCustomerPayment() { return defer(authRequests); },
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../src/lib/supabase': { supabaseUrl: 'https://isolated.invalid', supabase: { functions: { invoke() { throw new Error('Customer payment must not wait for the owner session.'); } } }, publicSupabase: { functions: {
      invoke(endpoint, options) { assert.equal(endpoint, 'cash-stripe?action=booking'); const promise = defer(requests); requests.at(-1).options = options; return promise; },
    } } },
    '../src/lib/booking-payment-policy': policy, '../src/lib/booking-payment-flow': flow,
    './ui/haptic-touchable': { HapticTouchable: 'HapticTouchable' },
    './access-premium': { useAccessAppearance: () => ({ palette: {night:false,ink:'#262725',muted:'#6D6C68',field:'rgba(255,255,255,.54)',surface:'rgba(255,255,255,.66)',border:'rgba(255,255,255,.88)',line:'#DAD6CE',action:'#343735',actionText:'#FFFFFF'} }) },
    './customer-portal-styles': { customerPortalStyles: styles => styles },
  };
  const exports = {};
  vm.runInNewContext(compile(source) + '\nexports.PaymentVerification = PaymentVerification;', { exports, Intl, URL, Date, Error, Set, AbortController,
    document, window,
    setTimeout(callback, ms) { const id = ++timerId; deadlines.set(id, { callback, ms }); return id; },
    clearTimeout(id) { deadlines.delete(id); },
    setInterval(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  const render = props => {
    cursor = 0; effects = []; const tree = exports[component]({ ...defaults, ...props });
    const pending = effects; effects = []; pending.forEach(run => run()); return tree;
  };
  return { render, requests, authRequests, tokenRequests, stateWrites, timers, deadlines, defaults, wrapperOptions,
    reply(index, response) { requests[index].resolve({ data: response, error: null }); },
    emitSession(identity = defaults, event = 'authenticated') { sessionListeners.get(identityKey(identity))?.forEach(listener => listener(event)); },
    timer(ms = 15000) { [...timers.values()].filter(timer => timer.ms === ms).forEach(timer => timer.callback()); },
    deadline() { const pending = [...deadlines.values()]; deadlines.clear(); pending.forEach(timer => { assert.equal(timer.ms, 30000); timer.callback(); }); },
    app(state = 'active') { appState.currentState = state; appListeners.forEach(listener => listener(state)); },
    web(visible = true) { document.visibilityState = visible ? 'visible' : 'hidden'; documentListeners.get('visibilitychange')?.(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); disposed = true; },
    refreshNotices() { exports.refreshBookingPaymentNotices(); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...(tree.props?.children ?? []).flatMap(nodes)];
}
const hasVerification = tree => nodes(tree).some(node => node.type?.name === 'PaymentVerification');
const text = tree => {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (!tree || typeof tree !== 'object') return '';
  return (tree.props?.children ?? []).map(text).join(' ');
};
const press = (tree, label) => {
  const button = nodes(tree).find(node => node.type === 'HapticTouchable' && text(node).includes(label));
  assert.ok(button, `Missing button: ${label}`); button.props.onPress();
};
const item = { requestId: 'request-a', serviceName: 'Taglio', mode: 'deposit', percent: 50,
  status: 'payment_required', holdExpiresAt: new Date(Date.now() + 240000).toISOString(), dueCents: 1000, totalCents: 2000 };
const result = { enabled: true, policy: { mode: 'deposit', percent: 50 }, status: 'payment_required',
  holdExpiresAt: item.holdExpiresAt, dueCents: 1000, totalCents: 2000 };
const checks = [];
const check = async (name, run) => { await run(); checks.push({ name, passed: true }); };
(async () => {
  for (const platform of ['ios', 'android', 'web']) {
    await check(`${platform}: settled payment removes the banner and ignores an older in-flight summary`, async () => {
      const f = fixture({ platform }); f.render(); await flush();
      f.reply(0, { enabled: true, items: [item] }); await flush();
      press(f.render(), 'Dettagli'); const expanded = f.render();
      f.timer(); await flush(); assert.equal(f.requests.length, 2);
      const panel = nodes(expanded).find(node => node.type?.name === 'BookingPaymentHoldPanel'); assert.ok(panel);
      panel.props.onSettled({ enabled: true, status: 'deposit_paid', paidCents: 1000, balanceCents: 1000 });
      f.render(); await flush(); assert.equal(f.requests.length, 3);
      f.reply(2, { enabled: true, items: [] }); await flush(); assert.equal(f.render(), null);
      f.reply(1, { enabled: true, items: [item] }); await flush(); assert.equal(f.render(), null);
      f.unmount();
    });
    await check(`${platform}: cancelled or expired payment disappears on the next server summary without an app restart`, async () => {
      const f = fixture({ platform }); f.render(); await flush();
      f.reply(0, { enabled: true, items: [item] }); await flush(); assert.ok(text(f.render()).includes('Taglio'));
      f.refreshNotices(); await flush();
      f.reply(1, { enabled: true, items: [] }); await flush(); assert.equal(f.render(), null);
      f.unmount();
    });
  }
  await check('passive checks do not claim that checkout is opening', async () => {
    const f = fixture({ component: 'ClientBookingPayment' });
    const props = { requestId: 'request-a', initialResult: result };
    f.render(props); await flush();
    const checking = text(f.render(props));
    assert.ok(checking.includes('Verifica pagamento…'));
    assert.ok(!checking.includes('Apertura pagamento…'));
    f.reply(0, result); await flush();
    press(f.render(props), 'Paga'); await flush();
    assert.equal(f.requests[1].options.body.operation, 'checkout');
    assert.ok(text(f.render(props)).includes('Apertura pagamento…'));
    f.unmount();
  });
  for (const platform of ['web', 'ios', 'android']) {
    await check(`${platform}: historical unpaid amount does not restart loading every five seconds`, async () => {
      const due = { enabled: true, policy: { mode: 'deposit', percent: 50 }, status: 'due', dueCents: 1000, totalCents: 2000 };
      const props = { requestId: 'old-request', initialResult: due };
      const f = fixture({ platform, component: 'ClientBookingPayment' });
      f.render(props); await flush(); f.reply(0, due); await flush();
      assert.ok(text(f.render(props)).includes('Paga'));
      f.timer(5000); await flush(); assert.equal(f.requests.length, 1);
      press(f.render(props), 'Ho già pagato'); await flush(); assert.equal(f.requests.length, 2);
      assert.equal(f.requests[1].options.body.operation, 'check');
      f.reply(1, due); await flush(); assert.ok(!text(f.render(props)).includes('Verifica in corso'));
      f.app(); await flush(); assert.equal(f.requests.length, 3, 'Returning from another page still checks the amount.');
      f.reply(2, due); await flush(); f.unmount();
    });
  }
  for (const platform of ['web', 'ios', 'android']) {
    await check(`${platform}: stalled response releases the spinner, preserves the amount and ignores a late paid response`, async () => {
      const f = fixture({ platform, component: 'ClientBookingPayment' });
      const props = { requestId: 'request-a', initialResult: result };
      f.render(props); await flush(); const signal = f.requests[0].options.signal;
      f.deadline(); await flush(); const tree = f.render(props);
      assert.equal(signal.aborted, true);
      assert.ok(text(tree).includes('non ha risposto'));
      assert.equal(text(tree).includes('Verifica in corso'), false);
      assert.equal(nodes(tree).find(node => node.type === 'HapticTouchable' && text(node).includes('Ho già pagato'))?.props.disabled, false);
      f.timer(5000); await flush(); assert.equal(f.requests.length, 1, 'A failure waits for retry rather than looping.');
      f.reply(0, { ...result, status: 'paid', paidCents: 2000 }); await flush();
      assert.ok(!text(f.render(props)).includes('Pagamento ricevuto'));
      press(f.render(props), 'Ho già pagato'); await flush(); assert.equal(f.requests.length, 2);
      f.reply(1, result); await flush(); assert.equal(f.deadlines.size, 0); f.unmount();
    });
    await check(`${platform}: token arriving after the deadline cannot start a late checkout`, async () => {
      const f = fixture({ platform, component: 'ClientBookingPayment', waitForToken: true });
      const props = { requestId: 'request-a', initialResult: result };
      f.render(props); await flush(); f.deadline(); await flush(); f.render(props);
      assert.equal(f.requests.length, 0);
      press(f.render(props), 'Paga'); await flush(); assert.equal(f.tokenRequests.length, 2);
      f.deadline(); await flush(); assert.equal(text(f.render(props)).includes('Apertura pagamento'), false);
      f.tokenRequests.forEach(request => request.resolve()); await flush();
      assert.equal(f.requests.length, 0, 'Neither the expired check nor checkout may reach the server.'); f.unmount();
    });
  }
  for (const failure of [authError(), new Error('Verifica la password per accedere ai pagamenti.')]) {
    await check(`${failure.code ? 'typed' : 'legacy'} auth failure without known payments shows no global password form and stops polling`, async () => {
      const f = fixture(); f.render(); await flush(); f.requests[0].reject(failure); await flush();
      assert.equal(f.render(), null); assert.equal(f.timers.size, 0);
      f.timer(); f.app(); f.refreshNotices(); await flush(); assert.equal(f.requests.length, 1);
      f.unmount();
    });
  }
  await check('successful account verification resumes suspended summary once; invalidation and other identities do not', async () => {
    const f = fixture(); f.render(); await flush(); f.requests[0].reject(authError()); await flush(); f.render();
    f.emitSession(f.defaults, 'invalidated'); f.emitSession({ ...f.defaults, salonCode: 'different' }); await flush(); assert.equal(f.requests.length, 1);
    f.emitSession(); await flush(); assert.equal(f.requests.length, 2); assert.equal(f.timers.size, 1);
    f.reply(1, { enabled: true, items: [] }); await flush(); assert.equal(f.render(), null); f.unmount();
  });
  await check('known payment items remain visible after auth rejection; verification is contextual only after expansion', async () => {
    const f = fixture(); f.render(); await flush(); f.reply(0, { enabled: true, items: [item] }); await flush(); f.render();
    f.timer(); await flush(); f.requests[1].reject(authError()); await flush(); const collapsed = f.render();
    assert.ok(text(collapsed).includes('Taglio')); assert.equal(hasVerification(collapsed), false);
    press(collapsed, 'Dettagli'); const expanded = f.render(); assert.equal(hasVerification(expanded), true);
    assert.ok(text(expanded).includes('Taglio')); assert.equal(nodes(expanded).some(node => node.type?.name === 'BookingPaymentHoldPanel'), false);
    f.unmount();
  });
  await check('network failure preserves known payments and offers retry without requesting a password', async () => {
    const f = fixture(); f.render(); await flush(); f.reply(0, { enabled: true, items: [item] }); await flush(); f.render();
    f.timer(); await flush(); f.requests[1].reject(new Error('Offline')); await flush(); const tree = f.render();
    assert.ok(text(tree).includes('Taglio')); assert.equal(hasVerification(tree), false); assert.equal(f.timers.size, 1);
    press(tree, 'Riprova'); f.render(); await flush(); assert.equal(f.requests.length, 3); f.reply(2, { enabled: true, items: [] }); await flush(); assert.equal(f.render(), null); f.unmount();
  });
  for (const platform of ['ios', 'android', 'web']) {
    await check(`${platform}: inactive and hidden/background pages do not poll`, async () => {
      const f = fixture({ platform }); assert.equal(f.render({ active: false }), null); await flush(); assert.equal(f.requests.length, 0);
      f.render(); await flush(); f.reply(0, { enabled: true, items: [] }); await flush(); f.render();
      if (platform === 'web') f.web(false); else f.app('background');
      f.timer(); await flush(); assert.equal(f.requests.length, 1);
      if (platform === 'web') f.web(true); else f.app(); await flush(); assert.equal(f.requests.length, 2);
      f.unmount();
    });
  }
  await check('A to B to A ignores old summary success and old auth failure', async () => {
    const f = fixture(); f.render(); await flush(); f.render({ salonCode: 'salon-b' }); await flush(); f.render(); await flush();
    f.reply(2, { enabled: true, items: [item] }); await flush(); assert.ok(text(f.render()).includes('Taglio'));
    f.reply(0, { enabled: false }); f.requests[1].reject(authError()); await flush();
    assert.ok(text(f.render()).includes('Taglio')); assert.equal(f.timers.size, 1); f.unmount();
  });
  await check('identity switches do not flash another customer payment or error before effects run', async () => {
    const f = fixture(); f.render(); await flush(); f.reply(0, { enabled: true, items: [item] }); await flush(); f.render();
    assert.equal(f.render({ email: 'other@example.invalid' }), null); await flush(); f.requests[1].reject(authError()); await flush();
    assert.equal(f.render({ email: 'other@example.invalid' }), null); assert.equal(f.render(), null); f.unmount();
  });
  await check('unmount cancels summary and unsubscribes lifecycle/session listeners', async () => {
    const f = fixture(); f.render(); await flush(); const writes = f.stateWrites.length;
    f.unmount(); f.reply(0, { enabled: true, items: [item] }); await flush();
    f.emitSession(); f.app(); f.refreshNotices(); assert.equal(f.requests.length, 1); assert.equal(f.stateWrites.length, writes); assert.equal(f.timers.size, 0);
  });
  await check('request payment access does not permit the anonymous policy exception', async () => {
    const f = fixture({ component: 'ClientBookingPayment' }); f.render({ requestId: 'request-a', initialResult: result }); await flush();
    assert.equal(f.wrapperOptions[0].options.allowUnauthenticated, false); f.reply(0, result); await flush(); f.render({ requestId: 'request-a', initialResult: result }); f.unmount();
  });
  for (const initialResult of [undefined, result]) {
    await check(`passive request ${initialResult ? 'with known hold' : 'without known payment data'} never opens verification automatically`, async () => {
      const f = fixture({ component: 'ClientBookingPayment' }); const props = { requestId: 'request-a', initialResult };
      f.render(props); await flush(); f.requests[0].reject(authError()); await flush(); const tree = f.render(props);
      assert.equal(hasVerification(tree), false);
      if (initialResult) { assert.ok(text(tree).includes('Paga')); press(tree, 'Ho già pagato'); }
      else press(tree, 'Dettagli pagamento');
      assert.equal(hasVerification(f.render(props)), true); f.unmount();
    });
  }
  await check('external recovery never starts a previous checkout; the next explicit Pay tap uses the same held request', async () => {
    const f = fixture({ component: 'ClientBookingPayment' }); const props = { requestId: 'request-a', initialResult: result };
    f.render(props); await flush(); f.reply(0, result); await flush();
    press(f.render(props), 'Paga'); await flush(); assert.equal(f.requests[1].options.body.operation, 'checkout');
    f.requests[1].reject(authError()); await flush(); const tree = f.render(props); assert.equal(hasVerification(tree), true);
    assert.ok(text(tree).includes('Paga')); f.timer(5000); f.app(); await flush(); assert.equal(f.requests.length, 2);
    f.emitSession(); await flush(); assert.equal(f.requests.length, 2); const recovered = f.render(props); assert.equal(hasVerification(recovered), false);
    press(recovered, 'Paga'); await flush(); assert.equal(f.requests.length, 3); assert.equal(f.requests[2].options.body.operation, 'checkout'); assert.equal(f.requests[2].options.body.requestId, 'request-a');
    f.unmount();
  });
  await check('external recovery never resumes a previous cancellation without another explicit confirmation', async () => {
    const f = fixture({ component: 'ClientBookingPayment' }); const props = { requestId: 'request-a', initialResult: result };
    f.render(props); await flush(); f.reply(0, result); await flush();
    press(f.render(props), 'Annulla e libera'); press(f.render(props), 'Libera orario'); await flush();
    assert.equal(f.requests[1].options.body.operation, 'cancel'); f.requests[1].reject(authError()); await flush(); f.render(props);
    f.emitSession(); await flush(); assert.equal(f.requests.length, 2); const recovered = f.render(props); assert.equal(hasVerification(recovered), false);
    press(recovered, 'Libera orario'); await flush(); assert.equal(f.requests.length, 3); assert.equal(f.requests[2].options.body.operation, 'cancel'); assert.equal(f.requests[2].options.body.requestId, 'request-a');
    f.unmount();
  });
  for (const operation of ['checkout', 'cancel']) {
    await check(`inline verification resumes the explicitly requested ${operation} once without a competing session-event read`, async () => {
      const f = fixture({ component: 'ClientBookingPayment' }); const props = { requestId: 'request-a', initialResult: result };
      f.render(props); await flush(); f.reply(0, result); await flush();
      if (operation === 'checkout') press(f.render(props), 'Paga');
      else { press(f.render(props), 'Annulla e libera'); press(f.render(props), 'Libera orario'); }
      await flush(); assert.equal(f.requests[1].options.body.operation, operation); f.requests[1].reject(authError()); await flush();
      const verification = nodes(f.render(props)).find(node => node.type?.name === 'PaymentVerification'); assert.ok(verification);
      const dialog = fixture({ component: 'PaymentVerification' });
      nodes(dialog.render(verification.props)).find(node => node.type === 'TextInput').props.onChangeText('fixture-password');
      press(dialog.render(verification.props), 'Conferma accesso'); await flush();
      f.emitSession(); await flush(); assert.equal(f.requests.length, 2, 'The session event must not race the inline onVerified intent.');
      dialog.authRequests[0].resolve('token'); await flush();
      assert.equal(f.requests.length, 3); assert.equal(f.requests[2].options.body.operation, operation); assert.equal(f.requests[2].options.body.requestId, 'request-a');
      f.emitSession(); await flush(); assert.equal(f.requests.length, 3, 'A second session event cannot duplicate an active operation.');
      dialog.unmount(); f.unmount();
    });
  }
  for (const [failure, expected] of [[authError(), 'Password non verificata'], [new Error('Network request failed'), 'Controlla la connessione']]) {
    await check(`password verification distinguishes ${expected.includes('Password') ? 'bad credentials' : 'connection errors'}`, async () => {
      let verified = 0; const f = fixture({ component: 'PaymentVerification' }); const props = { identity: f.defaults, onVerified: () => verified++ };
      const initial = f.render(props); const input = nodes(initial).find(node => node.type === 'TextInput'); input.props.onChangeText('fixture-password');
      press(f.render(props), 'Conferma accesso'); await flush(); f.authRequests[0].reject(failure); await flush();
      assert.ok(text(f.render(props)).includes(expected)); assert.equal(verified, 0); f.unmount();
    });
  }
  await check('late verification of a previous identity cannot resume a different customer operation', async () => {
    let verified = 0; const f = fixture({ component: 'PaymentVerification' }); const props = { identity: f.defaults, onVerified: () => verified++ };
    nodes(f.render(props)).find(node => node.type === 'TextInput').props.onChangeText('fixture-password');
    press(f.render(props), 'Conferma accesso'); await flush(); f.render({ ...props, identity: { ...f.defaults, email: 'other@example.invalid' } });
    f.authRequests[0].resolve('token'); await flush(); assert.equal(verified, 0); f.unmount();
  });
  await check('repeated verification taps issue one authentication operation and expose recovery through the supplied callback', async () => {
    let verified = 0, recovered = 0;
    const f = fixture({ component: 'PaymentVerification' }); const props = { identity: f.defaults, onVerified: () => verified++, onAccessRecovery: () => recovered++ };
    nodes(f.render(props)).find(node => node.type === 'TextInput').props.onChangeText('fixture-password');
    const tree = f.render(props); press(tree, 'Conferma accesso'); press(tree, 'Conferma accesso'); await flush();
    assert.equal(f.authRequests.length, 1); f.authRequests[0].resolve('token'); await flush(); assert.equal(verified, 1);
    press(f.render(props), 'Imposta o recupera'); assert.equal(recovered, 1); f.unmount();
  });
  const report = { sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), checks,
    evidence: 'Real component hooks, isolated transport/lifecycle/session clock; no device UI or live database claims', remoteCalls: 0, checkoutsOpened: 0, payments: 0 };
  if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
  else console.log(`PASS ${checks.length} payment access UI scenarios: passive banner, known payments, polling, stale identities, contextual verification, checkout resumption and connection errors.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
