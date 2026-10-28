const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/appointment-impact-modal.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).length, 0, 'Impact modal must transpile');

// Render the actual component with native host nodes and a deterministic hook runner.
// This verifies its tree and interactions without modifying a real salon.
function createHarness(platform, height, topInset) {
  const state = [];
  const effectDependencies = [];
  let stateCursor = 0;
  let effectCursor = 0;
  let effects = [];
  let dirty = false;
  let tree;
  let currentProps;
  const React = {
    createContext: () => ({}),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter((child) => child != null && child !== false) } }),
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (next) => {
        const value = typeof next === 'function' ? next(state[index]) : next;
        if (!Object.is(value, state[index])) {
          state[index] = value;
          dirty = true;
        }
      }];
    },
    useMemo: (callback) => callback(),
    useCallback: (callback) => callback,
    useEffect(callback, dependencies) {
      const index = effectCursor++;
      const previous = effectDependencies[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous[position]))) {
        effects.push(callback);
        effectDependencies[index] = dependencies;
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require(id) {
      if (id === 'react') return { ...React, default: React };
      if (id === 'react-native') return {
        Modal: 'Modal', View: 'View', Text: 'Text', ScrollView: 'ScrollView',
        Platform: { OS: platform }, StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
        useWindowDimensions: () => ({ width: 390, height }),
      };
      if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: topInset, bottom: 34, left: 0, right: 0 }) };
      if (id === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (id === './ui/native-sheet-drag') return { NativeSheetHandle: 'NativeSheetHandle' };
      if (id === './ui/docked-sheet-surface') return { DockedSheetSurface: 'DockedSheetSurface' };
      if (id === './ui/haptic-touchable') return { HapticTouchable: 'HapticTouchable' };
      if (id === './ui/premium-expand-button') return { PremiumExpandButton: 'PremiumExpandButton' };
      if (id === './access-premium') return {useAccessAppearance:()=>({palette:{night:false,ink:'#262725',muted:'#777777',border:'#AAAAAA',line:'#BBBBBB',field:'#EEEEEE',surface:'#F8F5EF',action:'#343735',actionText:'#FFFFFF'}})};
      if (id === '../src/lib/tablet-modal-orientations') return {TABLET_MODAL_ORIENTATIONS:['portrait','landscape-left','landscape-right']};
      if (id === './agenda-premium-style') {
        const styleExports={};
        vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/agenda-premium-style.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:styleExports,require:name=>name==='react'?{...React,default:React}:{Platform:{OS:platform},StyleSheet:{flatten:style=>style}}});
        return styleExports;
      }
      if (id === './ui/web-expandable-card') return {
        getWebExpandableCardProps: (onPress, { disabled }) => platform === 'web' && !disabled ? { onClick: onPress } : {},
        getWebExpandableCardStyle: () => null,
      };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename: 'appointment-impact-modal.tsx' });
  const render = (props = currentProps) => {
    currentProps = props;
    let attempts = 0;
    do {
      dirty = false;
      effects = [];
      stateCursor = 0;
      effectCursor = 0;
      tree = exports.AppointmentImpactModal(props);
      effects.forEach((effect) => effect());
      assert.ok(++attempts < 10, 'Component state must settle without a render loop');
    } while (dirty);
    return tree;
  };
  const nodes = (type, node = tree) => {
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...node.props.children.flatMap((child) => nodes(type, child))];
  };
  const text = (node) => typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : node?.props?.children.map(text).join('') ?? '';
  const button = (label) => nodes('HapticTouchable').find((node) => text(node).startsWith(label));
  const press = (node) => {
    assert.ok(node, 'Requested control exists');
    if (!node.props.disabled) node.props.onPress?.();
    render();
  };
  return { render, nodes, text, button, press, get tree() { return tree; } };
}

const flattenStyle = (styles) => Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));
const fixture = (key) => ({ key, customerName: `Cliente ${key}`, serviceLabel: 'Taglio e piega', dateLabel: '8 ottobre', timeLabel: '10:30', operatorLabel: 'Operatore' });
for (const [platform, height, topInset] of [['ios', 844, 59], ['ios', 480, 20], ['android', 800, 24], ['web', 900, 0], ['web', 360, 0]]) {
  const harness = createHarness(platform, height, topInset);
  let closes = 0;
  let keeps = 0;
  let reviews = 0;
  const cancellations = [];
  let props = {
    visible: true, title: 'Blocca questa giornata', message: 'Mantieni o annulla gli appuntamenti coinvolti.',
    items: [fixture('a'), fixture('b'), fixture('c')],
    onClose: () => { closes += 1; },
    onKeepAppointments: () => { keeps += 1; },
    onReviewAppointments: () => { reviews += 1; },
    onCancelAppointments: (keys) => { cancellations.push(Array.from(keys)); },
  };
  harness.render(props);
  assert.equal(harness.nodes('ScrollView').length, 1, `${platform}: one scroll container while collapsed`);
  const surface = platform === 'web'
    ? harness.nodes('View').find((node) => node.props.testID === 'appointment-impact-surface')
    : harness.nodes('DockedSheetSurface')[0];
  assert.equal(flattenStyle(surface.props.style).maxHeight, height - (platform === 'web' ? 32 : Math.max(56, topInset + 12)));
  assert.equal(flattenStyle(surface.props.style).overflow, 'hidden', 'Rounded sheet owns bounded content');
  const scroll = harness.nodes('ScrollView')[0];
  assert.equal(flattenStyle(scroll.props.style).minHeight, 0);
  assert.equal(flattenStyle(scroll.props.style).flexShrink, 1, 'Long content can shrink inside the viewport');
  assert.ok(flattenStyle(scroll.props.contentContainerStyle).paddingBottom >= 18, 'Final controls have scroll-end padding');
  if (platform !== 'web') {
    assert.equal(surface.props.children[0].type, 'NativeSheetHandle', 'Drag target is outside the scroll content');
    assert.equal(harness.nodes('NativeSheetHandle', scroll).length, 0);
    assert.equal(surface.props.dismissDisabled, false);
  }
  const review = flattenStyle(harness.button('Modifica prima in Agenda').props.style);
  assert.ok(review.marginTop >= 12, 'Review does not touch the expandable card');
  assert.equal(review.flex, undefined, 'Standalone review must not inherit row flex');
  const cancelStyle=flattenStyle(harness.button('Annulla').props.style);
  assert.equal(cancelStyle.flex, undefined, 'Do not emit flex:0: React Native Web turns that into a zero basis');
  assert.equal(cancelStyle.flexBasis, 'auto', 'Centered actions keep their content width');
  assert.equal(cancelStyle.flexShrink, 0, 'Action copy cannot be squeezed outside its border');
  harness.press(harness.button('Modifica prima in Agenda'));
  assert.equal(reviews, 1);
  assert.equal(keeps, 0, 'Review never saves the block');
  assert.equal(cancellations.length, 0, 'Review never cancels an appointment');
  harness.press(harness.button('Blocca e mantieni'));
  assert.equal(keeps, 1);
  assert.equal(cancellations.length, 0, 'Keep never enters the cancellation flow');
  harness.press(harness.nodes('PremiumExpandButton')[0]);
  assert.equal(harness.nodes('ScrollView').length, 1, `${platform}: expanded list uses the outer scroll`);
  assert.equal(harness.button('Annulla selezionati').props.disabled, true, 'Empty selection cannot cancel');
  harness.press(harness.button('Cliente a'));
  assert.equal(harness.button('Cliente a').props.accessibilityState.checked, true);
  harness.press(harness.button('Annulla selezionati'));
  assert.deepEqual(cancellations.at(-1), ['a']);
  harness.press(harness.button('Seleziona tutti'));
  assert.equal(harness.button('Deseleziona tutti').props.accessibilityState.checked, true);
  harness.press(harness.button('Annulla selezionati'));
  assert.deepEqual(cancellations.at(-1), ['a', 'b', 'c']);
  harness.press(harness.button('Deseleziona tutti'));
  assert.equal(harness.button('Annulla selezionati').props.disabled, true);
  harness.press(harness.button('Annulla tutti'));
  assert.deepEqual(cancellations.at(-1), ['a', 'b', 'c']);
  harness.press(harness.button('Cliente a'));
  harness.press(harness.button('Cliente b'));
  props = { ...props, items: [fixture('b'), fixture('d')] };
  harness.render(props);
  assert.equal(harness.button('Cliente b').props.accessibilityState.checked, true, 'A remaining selected appointment survives live item refresh');
  assert.equal(harness.button('Cliente d').props.accessibilityState.checked, false, 'New arrivals are not selected silently');
  harness.press(harness.button('Annulla selezionati'));
  assert.deepEqual(cancellations.at(-1), ['b'], 'Removed appointments are pruned from selection');
  props = { ...props, busy: true };
  harness.render(props);
  const eventsBefore = [closes, keeps, reviews, cancellations.length];
  for (const control of harness.nodes('HapticTouchable')) {
    assert.equal(control.props.disabled, true, `${platform}: every action is disabled while saving`);
    harness.press(control);
  }
  harness.tree.props.onRequestClose();
  assert.deepEqual([closes, keeps, reviews, cancellations.length], eventsBefore);
  if (platform !== 'web') assert.equal(harness.nodes('DockedSheetSurface')[0].props.dismissDisabled, true);
  props = { ...props, busy: false, visible: false };
  harness.render(props);
  props = { ...props, visible: true };
  harness.render(props);
  assert.equal(harness.nodes('PremiumExpandButton')[0].props.expanded, false, 'Reopening starts collapsed');
  harness.press(harness.nodes('PremiumExpandButton')[0]);
  assert.equal(harness.button('Annulla selezionati').props.disabled, true, 'Reopening clears prior selection');
  harness.tree.props.onRequestClose();
  assert.equal(closes, 1, 'System dismissal remains available outside saving');
  props = { ...props, items: [] };
  harness.render(props);
  assert.equal(harness.button('Annulla selezionati').props.disabled, true);
  assert.equal(harness.button('Annulla tutti').props.disabled, true, 'No appointments cannot enter a cancellation flow');
}
console.log('PASS: impact modal iOS/Android/web constrained render, one scroll, handle scope, spaced controls, selected/all/keep/review actions, busy guard and selection reset.');
