const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function scenario({ connectionError = false, educationAccepted = true } = {}) {
  const events = [];
  let busy = false;
  let sdkCallbacks;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => ({ current: value }),
    useEffect: () => {},
    useState: (() => {
      let index = 0;
      const initial = [{ enabled: true, locations: [{ id: 'loc_test' }] }, 'loc_test'];
      return fallback => [index < initial.length ? initial[index++] : fallback, () => {}];
    })(),
  };
  const sdk = Object.fromEntries(['initialize', 'disconnectReader', 'clearCachedCredentials'].map(name =>
    [name, async () => { events.push(name); return {}; }]));
  Object.assign(sdk, {
    supportsReadersOfType: async () => ({ readerSupportResult: true }),
    easyConnect: async params => {
      events.push('connect');
      assert.equal(params.tosAcceptancePermitted, true);
      return connectionError ? { error: { message: 'Terms or connection not completed' } } : {};
    },
    retrievePaymentIntent: async () => ({ paymentIntent: { id: 'pi_test' } }),
    processPaymentIntent: async () => { events.push('process'); return {}; },
  });
  const modules = {
    react: React,
    'react-native': { Platform: { OS: 'ios' }, Text: 'Text', View: 'View', ActivityIndicator: 'Progress' },
    '@stripe/stripe-terminal-react-native': {
      StripeTerminalProvider: 'Provider',
      useStripeTerminal: callbacks => { sdkCallbacks = callbacks; return sdk; },
    },
    'expo-location': { requestForegroundPermissionsAsync: async () => ({ status: 'granted' }) },
    '../src/lib/supabase': { supabase: { functions: { invoke: async (_fn, { body }) => {
      events.push(body.action);
      return { data: body.action === 'terminal-intent' ? { clientSecret: 'test' } : { status: 'paid' } };
    } } } },
    './ui/haptic-touchable': { HapticTouchable: 'Button' },
    '../src/lib/tap-to-pay-education': { showTapToPayEducation: async () => {
      events.push('education'); return educationAccepted;
    } },
    '../src/lib/android-contactless-readiness': {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/cash-contactless-session.tsx', 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  const root = exports.CashContactlessSession({ movementId: 'movement_test', onPaid: () => events.push('paid'), onBusyChange: value => { busy = value; } });
  const flow = root.props.children[0];
  const tree = flow.type(flow.props);
  function find(node, label) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'Button' && node.props.children[0]?.props.children[0] === label) return node;
    for (const child of node.props?.children?.flat(Infinity) ?? []) { const result = find(child, label); if (result) return result; }
    return null;
  }
  const accept = find(tree, 'Incassa contactless');
  assert.ok(accept);
  accept.props.onPress();
  assert.equal(busy, true);
  for (let i = 0; i < 20 && busy; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(busy, false);
  assert.equal(typeof sdkCallbacks.onDidReportReaderSoftwareUpdateProgress, 'function');
  return events;
}

(async () => {
  const success = await scenario();
  assert.ok(success.indexOf('connect') < success.indexOf('education'), 'Merchant terms must precede first education');
  assert.ok(success.indexOf('education') < success.indexOf('terminal-intent'), 'Education must precede payment reservation');
  assert.ok(success.indexOf('process') < success.indexOf('terminal-check'), 'Server verifies the payment result');
  assert.ok(success.includes('paid'));
  const failed = await scenario({ connectionError: true });
  assert.ok(!failed.includes('education') && !failed.includes('terminal-intent'), 'An incomplete connection cannot reserve a payment');
  const cancelled = await scenario({ educationAccepted: false });
  assert.ok(!cancelled.includes('terminal-intent'), 'Leaving education cannot reserve a payment');
  console.log('PASS merchant setup, education order, failed/cancelled setup and authoritative payment verification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
