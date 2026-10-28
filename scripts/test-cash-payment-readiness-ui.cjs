// Render the actual panel with isolated native modules and server status.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('components/cash-stripe-panel.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  esModuleInterop: true, target: ts.ScriptTarget.ES2022,
} }).outputText;
function render(options = {}) {
  let cursor = 0;
  const values = [false, false,
    options.status ?? { configured: true, connected: true, ready: true, live: true },
    options.terminal ?? { enabled: true, locations: [{ id: 'fixture' }] },
    options.terminalError ?? false, options.statusError ?? false,
    false, false, 'checkout', '', false, options.checkout ?? null];
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => [values[cursor++] ?? (typeof initial === 'function' ? initial() : initial), () => {}],
    useRef: initial => ({ current: initial }), useEffect: () => {}, useCallback: fn => fn,
  };
  const dependencies = {
    react,
    'react-native': { Platform: { OS: options.platform ?? 'ios' },
      NativeModules: options.module === false ? {} : { StripeTerminalReactNative: {} },
      StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }),
      Text: 'Text', View: 'View', Modal: 'Modal', ScrollView: 'ScrollView' },
    'expo-constants': { expoConfig: { extra: { terminalBuildEnabled: options.build !== false } } },
    '../src/context/AppContext': { useAppContext: () => ({ salonWorkspace: { id: 'fixture' } }) },
    '../src/lib/use-cash-refresh': { useCashRefresh: () => {} },
    '../src/lib/supabase': { supabase: {} },
    './cash-web-dialog': { CashWebDialog: 'WebDialog' },
    './cash-stripe-web-panel': { CashStripeWebPanel: 'WebPanel' },
    './cash-web-panel': { useCashPanelStyles: value => value },
    './access-premium': { useAccessAppearance: () => ({ palette: { ink:'#222', muted:'#666', border:'#bbb', field:'#eee', action:'#333', actionText:'#fff' } }) },
    './ui/haptic-touchable': { HapticTouchable: 'Button' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    './loyalty-checkout-reminder': { LoyaltyCheckoutReminder: 'Loyalty' },
    './ui/premium-guide-dock': { PremiumGuideDock: 'Guide' },
    './cash-contactless': { CashContactless: 'Contactless' },
    './cash-tap-to-pay-setup': { CashTapToPaySetup: 'Setup' },
    'react-native-qrcode-svg': 'QR',
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  }, Map, Intl, console });
  const tree = exports.CashStripePanel({ movement: { id: 'fixture', importo: 10 },
    onClose: () => {}, inlineCheckout: true, modalOnly: true });
  const labels = [];
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Text') labels.push(node.children.flat(Infinity).filter(x => typeof x === 'string').join(''));
    walk(node.children);
  }
  walk(tree); return labels;
}
assert(render().includes('Tap to Pay'));
assert(render({ platform: 'android' }).includes('Tap to Pay'));
for (const options of [{ platform: 'web' }, { build: false }, { module: false },
  { terminalError: true }, { statusError: true },
  { status: { configured: true, connected: true, ready: false } },
  { terminal: { enabled: false, locations: [{}] } }, { terminal: { enabled: true, locations: [] } }]) {
  assert(!render(options).includes('Tap to Pay'), JSON.stringify(options));
}
const existingAttempt = render({ build: false, checkout: { channel: 'terminal', status: 'open' } });
assert(existingAttempt.includes('Verifica pagamento'));
assert(existingAttempt.includes('Annulla tentativo contactless'));
console.log('PASS 11 actual Cassa renders: compatible native methods, unavailable Tap excluded, existing verification/cancellation preserved. No remote payments.');
