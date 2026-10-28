const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourceRoot = process.env.AUDIT_CHECKOUT_SOURCE_ROOT || root;
const files = ['app/(tabs)/agenda.tsx', 'components/agenda-cash-action.tsx',
  'components/owner-appointment-checkout.tsx', 'components/cash-stripe-panel.tsx'];
const sources = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(sourceRoot, file), 'utf8')]));
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const flush = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
const children = node => (node?.props?.children || []).flat(Infinity);
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...children(node).flatMap(nodes)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return children(node).map(text).join('');
}
function button(tree, label) {
  const match = nodes(tree).find(node => node.type === 'HapticTouchable' && text(node) === label);
  assert.ok(match, `Actual rendered button ${label}`);
  return match;
}
function harness(component, options = {}) {
  let cursor = 0, pending = [], subscription;
  const slots = [], calls = [], presentation = [], completions = [], alerts = [];
  let price = 20;
  const React = {
    Fragment: 'Fragment',
    createElement(type, props, ...childNodes) { return { type, props: { ...props, children: childNodes } }; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
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
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    useCallback(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) slots[index] = { dependencies, value: callback };
      return slots[index].value;
    },
  };
  const workspaceId = 'd84f3211-d20f-45a3-9d7f-f551400690fd';
  const supabase = {
    from(table) {
      assert.equal(table, 'appointments');
      const query = { select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: { price } }) };
      return query;
    },
    functions: { invoke: async (endpoint, config) => {
      assert.equal(endpoint, 'cash-stripe');
      calls.push({ endpoint, ...config.body });
      assert.ok(['appointment', 'check'].includes(config.body.action), 'Fixture cannot charge, checkout, share, cancel or publish.');
      if (options.error) return { data: null, error: { message: 'offline' } };
      return { data: config.body.action === 'check'
        ? options.checkout || { status: 'expired' }
        : { movement: { id: 'isolated-movement', importo: 20 } }, error: null };
    } },
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      assert.equal(name, 'prepare_owner_appointment_checkout_v1', 'Fixture cannot collect or confirm payment.');
      return options.error ? { data: null, error: { message: 'offline' } }
        : { data: { id: 'isolated-movement', importo: 20, digitalAvailable: options.digitalAvailable }, error: null };
    },
  };
  const noExternalAction = () => { throw Error('External action denied in isolated fixture'); };
  const dependencies = {
    react: React,
    'react-native': { Text: 'Text', View: 'View', ScrollView: 'ScrollView', Modal: 'Modal',
      Platform: { OS: options.OS || 'ios' }, StyleSheet: { create: value => value },
      useWindowDimensions: () => ({ width: 390 }), AppState: { currentState: 'active' },
      Alert: { alert: (...args) => alerts.push(args) }, Linking: { openURL: noExternalAction }, Share: { share: noExternalAction } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../src/lib/supabase': { supabase },
    '../src/lib/service-packages': { subscribePackageChanges(callback) { subscription = callback; return () => { subscription = undefined; }; } },
    './ui/haptic-touchable': { HapticTouchable: 'HapticTouchable' },
    './cash-stripe-panel': { CashStripePanel: 'CashStripePanel' },
    './loyalty-checkout-reminder': { LoyaltyCheckoutReminder: 'LoyaltyCheckoutReminder' },
    '../src/context/AppContext': { useAppContext: () => ({ salonWorkspace: { id: workspaceId } }) },
    '../src/lib/use-cash-refresh': { useCashRefresh() {} },
    './ui/premium-guide-dock': { PremiumGuideDock: 'PremiumGuideDock' },
    'react-native-qrcode-svg': 'QRCode', 'expo-constants': { expoConfig: { extra: {} } },
    './cash-contactless': { CashContactless: 'CashContactless' },
    './cash-tap-to-pay-setup': { CashTapToPaySetup: 'CashTapToPaySetup' },
  };
  const exports = {};
  vm.runInNewContext(compile(sources[`components/${component.file}.tsx`]), { exports, Intl, Date, Map, Error,
    setInterval: () => 1, clearInterval() {}, require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Explicit isolated dependency ${name}`);
      return dependencies[name];
    } });
  const defaults = { appointmentId: 'isolated-appointment', workspaceId,
    onCheckoutActiveChange: active => presentation.push(active), onCompleted: () => completions.push(true),
    movement: { id: 'isolated-movement', importo: 20 }, modalOnly: true, inlineCheckout: true,
    onClose: () => completions.push(true) };
  return { calls, presentation, completions, alerts,
    render(props = {}) {
      cursor = 0; pending = [];
      const tree = exports[component.name]({ ...defaults, ...props });
      const effects = pending; pending = []; effects.forEach(run => run());
      return tree;
    },
    async cover() { price = 0; subscription?.(); await flush(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

const agenda = sources['app/(tabs)/agenda.tsx'];
const ast = ts.createSourceFile('agenda.tsx', agenda, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let detailScroll;
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !declarations.has(node.name.text)) declarations.set(node.name.text, node.initializer);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'ScrollView' && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'ref' && attribute.initializer?.getText(ast) === '{weekAppointmentDetailsScrollRef}')) detailScroll = node;
  ts.forEachChild(node, collect);
}
collect(ast);
function expression(name) {
  assert.ok(declarations.has(name), `Actual Agenda initializer ${name}`);
  return declarations.get(name).getText(ast);
}
const actualExpressions = detailScroll.children.filter(ts.isJsxExpression).filter(node => node.expression).map(node => node.expression);
const compactSummary = actualExpressions.find(node => ts.isConditionalExpression(node) && node.condition.getText(ast) === 'weekAppointmentInlineCheckoutActive');
const detailControls = actualExpressions.find(node => ts.isConditionalExpression(node) && node.condition.getText(ast) === '!weekAppointmentInlineCheckoutActive');
assert.ok(compactSummary && detailControls, 'Actual details renderer must reserve space for active checkout.');
const ReactTree = { Fragment: 'Fragment', createElement(type, props, ...childNodes) { return { type, props: { ...props, children: childNodes } }; } };
const actualRender = compile(`const weekAppointmentInlineCheckoutActive = ${expression('weekAppointmentInlineCheckoutActive')};
  const weekAppointmentCheckoutActions = ${expression('weekAppointmentCheckoutActions')};
  exports.active = weekAppointmentInlineCheckoutActive; exports.actions = weekAppointmentCheckoutActions;
  exports.summary = weekAppointmentInlineCheckoutActive ? (${compactSummary.whenTrue.getText(ast)}) : null;
  exports.showOriginalControls = (${detailControls.condition.getText(ast)});`);
function renderAgenda(overrides = {}) {
  const completions = [], activation = [];
  const context = { exports: {}, React: ReactTree, IS_WEB: false,
    weekAppointmentDetails: { id: 'isolated-appointment', servizio: 'Servizio audit', data: '2026-10-10', ora: '09:00', prezzo: 20, operatoreNome: 'Operatore audit' },
    weekAppointmentCheckoutActiveId: null, weekAppointmentPendingRequest: false, todayDate: '2026-10-09',
    isSyntheticWeekAppointmentId: id => id.startsWith('synthetic-'),
    salonWorkspace: { id: 'isolated-workspace' }, styles: new Proxy({}, { get: (_, key) => String(key) }),
    AppointmentPackageAction: 'AppointmentPackageAction', AppointmentGiftCardAction: 'AppointmentGiftCardAction',
    LoyaltyCheckoutReminder: 'LoyaltyCheckoutReminder', OwnerAppointmentCheckout: 'OwnerAppointmentCheckout', AgendaCashAction: 'AgendaCashAction',
    View: 'View', Text: 'Text', formatDateLongLocalized: date => date, appLanguage: 'it', data: '2026-10-09',
    completeCheckoutDetailsRefresh: id => completions.push(id), handleWeekAppointmentCheckoutActiveChange: active => activation.push(active), ...overrides };
  vm.runInNewContext(actualRender, context);
  return { ...context.exports, completions, activation, context };
}
const records = [];
async function check(name, run) { await run(); records.push({ name, passed: true }); }
const future = { file: 'agenda-cash-action', name: 'AgendaCashAction' };
const owner = { file: 'owner-appointment-checkout', name: 'OwnerAppointmentCheckout' };
const stripe = { file: 'cash-stripe-panel', name: 'CashStripePanel' };
(async () => {
  await check('future appointment opens the actual inline panel and return restores presentation without another preparation', async () => {
    const s = harness(future); let tree = s.render(); await flush();
    assert.equal(s.presentation.at(-1), false);
    await button(tree, 'Incassa').props.onPress(); tree = s.render();
    assert.equal(s.presentation.at(-1), true); assert.equal(s.calls.length, 1);
    const panel = nodes(tree).find(node => node.type === 'CashStripePanel'); assert.ok(panel);
    assert.equal(panel.props.inlineCheckout, true); panel.props.onClose(); tree = s.render();
    assert.equal(s.presentation.at(-1), false); assert.ok(button(tree, 'Incassa')); assert.equal(s.calls.length, 1);
  });
  await check('future preparation error keeps original details active and permits the existing retry', async () => {
    const s = harness(future, { error: true }); let tree = s.render(); await flush();
    await button(tree, 'Incassa').props.onPress(); tree = s.render();
    assert.equal(s.presentation.at(-1), false); assert.ok(nodes(tree).some(node => node.props.accessibilityRole === 'alert'));
    await button(tree, 'Incassa').props.onPress(); assert.equal(s.calls.length, 2);
  });
  await check('covering an already open appointment cannot leave the compact layout active', async () => {
    const s = harness(future); let tree = s.render(); await flush();
    await button(tree, 'Incassa').props.onPress(); s.render(); assert.equal(s.presentation.at(-1), true);
    await s.cover(); assert.equal(s.render(), null); assert.equal(s.presentation.at(-1), false);
  });
  await check('future checkout unmount releases the active parent presentation', async () => {
    const s = harness(future); let tree = s.render(); await flush();
    await button(tree, 'Incassa').props.onPress(); s.render(); s.unmount();
    assert.equal(s.presentation.at(-1), false);
  });
  await check('ordinary payment methods remain in original details without preparing or collecting payment', async () => {
    const s = harness(owner); let tree = s.render(); button(tree, 'Incassa e completa').props.onPress(); tree = s.render();
    for (const label of ['Contanti', 'POS esterno', 'Bonifico', 'QR, link o Tap to Pay']) assert.ok(button(tree, label));
    button(tree, 'Contanti').props.onPress();
    assert.equal(s.alerts.length, 1); assert.equal(s.calls.length, 0); assert.equal(s.presentation.at(-1), false);
  });
  await check('owner digital prepare and return use original completion callback and restore detail controls', async () => {
    const s = harness(owner); let tree = s.render(); button(tree, 'Incassa e completa').props.onPress(); tree = s.render();
    button(tree, 'QR, link o Tap to Pay').props.onPress(); await flush(); tree = s.render();
    assert.equal(s.presentation.at(-1), true); assert.equal(s.calls.length, 1);
    const panel = nodes(tree).find(node => node.type === 'CashStripePanel'); assert.ok(panel); panel.props.onClose(); tree = s.render();
    assert.equal(s.presentation.at(-1), false); assert.equal(s.completions.length, 1); assert.equal(s.calls.length, 1);
    assert.ok(button(tree, 'Contanti'), 'Existing payment form open state is preserved.');
  });
  await check('digital separation authority failure never hides original details', async () => {
    const s = harness(owner, { digitalAvailable: false }); let tree = s.render(); button(tree, 'Incassa e completa').props.onPress(); tree = s.render();
    button(tree, 'QR, link o Tap to Pay').props.onPress(); await flush(); tree = s.render();
    assert.equal(s.presentation.at(-1), false); assert.ok(text(tree).includes('Acconto e saldo sono separati'));
    assert.equal(nodes(tree).some(node => node.type === 'CashStripePanel'), false);
  });
  await check('owner digital unmount releases active presentation', async () => {
    const s = harness(owner); let tree = s.render(); button(tree, 'Incassa e completa').props.onPress(); tree = s.render();
    button(tree, 'QR, link o Tap to Pay').props.onPress(); await flush(); s.render(); s.unmount();
    assert.equal(s.presentation.at(-1), false);
  });
  await check('future versus current appointment keeps the exact original checkout component eligibility', () => {
    assert.ok(nodes(renderAgenda().actions).some(node => node.type === 'AgendaCashAction'));
    const r = renderAgenda({ todayDate: '2026-10-10' });
    const checkout = nodes(r.actions).find(node => node.type === 'OwnerAppointmentCheckout'); assert.ok(checkout);
    checkout.props.onCompleted(); assert.deepEqual(r.completions, ['isolated-appointment']);
  });
  await check('pending paid no-show and synthetic appointments do not gain an Incassa action', () => {
    for (const override of [{ weekAppointmentPendingRequest: true }, { weekAppointmentDetails: { id: 'isolated-appointment', incassato: true } },
      { weekAppointmentDetails: { id: 'isolated-appointment', nonEffettuato: true } }, { weekAppointmentDetails: { id: 'synthetic-appointment' } }, { weekAppointmentDetails: null }]) assert.equal(renderAgenda(override).actions, null);
  });
  await check('native compact summary reserves room while retaining same payment component identity', () => {
    const original = renderAgenda(), compact = renderAgenda({ weekAppointmentCheckoutActiveId: 'isolated-appointment' });
    assert.equal(original.active, false); assert.equal(original.showOriginalControls, true);
    assert.equal(compact.active, true); assert.equal(compact.showOriginalControls, false);
    for (const value of ['Servizio audit', '2026-10-10', '09:00', '€ 20.00', 'Operatore audit']) assert.ok(text(compact.summary).includes(value));
    const before = nodes(original.actions).find(node => node.type === 'AgendaCashAction'), after = nodes(compact.actions).find(node => node.type === 'AgendaCashAction');
    assert.equal(before.type, after.type); assert.equal(before.props.key, after.props.key);
    assert.equal(nodes(compact.actions).some(node => node.type === 'AppointmentGiftCardAction'), false);
    assert.equal(nodes(original.actions).some(node => node.type === 'AppointmentGiftCardAction'), true);
  });
  await check('stale active appointment identity cannot compact a different appointment', () => {
    const r = renderAgenda({ weekAppointmentCheckoutActiveId: 'other-appointment' });
    assert.equal(r.active, false); assert.equal(r.showOriginalControls, true);
  });
  await check('web presentation retains original controls and never receives a native compact callback', () => {
    const r = renderAgenda({ IS_WEB: true, weekAppointmentCheckoutActiveId: 'isolated-appointment' });
    assert.equal(r.active, false); assert.equal(r.showOriginalControls, true); assert.equal(r.summary, null);
    const checkout = nodes(r.actions).find(node => node.type === 'AgendaCashAction'); assert.equal(checkout.props.onCheckoutActiveChange, undefined);
    assert.ok(nodes(r.actions).some(node => node.type === 'AppointmentPackageAction'));
  });
  await check('actual native activation callback scrolls to the top and clears by appointment identity', () => {
    const states = [], scrolls = [];
    const context = { exports: {}, IS_WEB: false, weekAppointmentDetails: { id: 'isolated-appointment' },
      setWeekAppointmentCheckoutActiveId: id => states.push(id), requestAnimationFrame: run => run(),
      weekAppointmentDetailsScrollRef: { current: { scrollTo: value => scrolls.push(value.y) } }, useCallback: fn => fn };
    vm.runInNewContext(compile(`exports.activate = ${expression('handleWeekAppointmentCheckoutActiveChange')};`), context);
    context.exports.activate(true); context.exports.activate(false);
    assert.deepEqual(states, ['isolated-appointment', null]); assert.deepEqual(scrolls, [0, 0]);
    context.IS_WEB = true; context.exports.activate(false); assert.deepEqual(scrolls, [0, 0]);
  });
  await check('actual details renderer places native checkout before edit actions and retains the web lower position', () => {
    const top = actualExpressions.findIndex(node => node.getText(ast) === '!IS_WEB ? weekAppointmentCheckoutActions : null');
    const controls = actualExpressions.indexOf(detailControls); assert.ok(top >= 0 && top < controls);
    let webPosition;
    function walk(node) {
      if (ts.isConditionalExpression(node) && node.getText(ast) === 'IS_WEB ? weekAppointmentCheckoutActions : null') webPosition = node;
      ts.forEachChild(node, walk);
    }
    walk(detailControls); assert.ok(webPosition);
  });
  await check('inline native actual Stripe renderer keeps methods instructions and return within natural content', async () => {
    const s = harness(stripe); s.render(); await flush(); const tree = s.render();
    for (const label of ['QR / link', 'Tap to Pay', 'Torna all’appuntamento']) assert.ok(button(tree, label));
    assert.ok(text(tree).includes('Scegli come incassare')); button(tree, 'Torna all’appuntamento').props.onPress();
    assert.equal(s.completions.length, 1); assert.ok(s.calls.every(call => call.action === 'check'));
    const flattened = tree.props.style.flat(Infinity).filter(Boolean); assert.equal(flattened.at(-1).width, '100%');
    const body = nodes(tree).find(node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.padding === 24 && text(node).includes('Torna all’appuntamento')); assert.ok(body);
    const styles = body.props.style.flat(Infinity).filter(Boolean); assert.equal(styles.at(-1).alignSelf, 'stretch');
    assert.equal(styles.some(style => style.height != null || style.maxHeight != null), false);
  });
  await check('already open QR remains accessible without checkout cancellation or charge calls', async () => {
    const s = harness(stripe, { checkout: { status: 'open', url: 'https://isolated.invalid/payment', amountCents: 2000 } });
    s.render(); await flush(); const tree = s.render();
    for (const label of ['Condividi link', 'Verifica pagamento', 'Annulla link di pagamento', 'Torna all’appuntamento']) assert.ok(button(tree, label));
    assert.ok(nodes(tree).some(node => node.type === 'QRCode')); assert.deepEqual(s.calls.map(call => call.action), ['check']);
  });
  await check('web and standalone Stripe styles keep previous resolved layout', async () => {
    for (const [options, props] of [[{ OS: 'web' }, {}], [{ OS: 'ios' }, { inlineCheckout: false }]]) {
      const s = harness(stripe, options); s.render(props); await flush(); const tree = s.render(props);
      assert.equal(tree.props.style.flat(Infinity).filter(Boolean).length, 0);
      const body = nodes(tree).find(node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.padding === 24 && text(node).includes('Scegli come incassare')); assert.ok(body);
      assert.equal(body.props.style.flat(Infinity).filter(Boolean).length, 1);
    }
  });
  const report = { platform: 'actual component hooks and Agenda/Stripe JSX renderer executed in isolation; API responses mocked; no device pixels',
    cases: records, sourceSha256: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(sources[file]).digest('hex')])),
    remoteApiCalls: 0, realPreparations: 0, realCollections: 0, payments: 0, notifications: 0 };
  if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
  else console.log(`PASS ${records.length} actual native checkout presentation scenarios; no remote calls or device validation.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
