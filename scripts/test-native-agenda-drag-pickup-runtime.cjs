/* global __dirname, process, console */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

// Execute the real main-Pan callbacks. The root and card measurements belong
// to one simulated UI frame; the JS-cached overlay origin is deliberately stale.
// Only the clone's rendered coordinates may change. Dispatchers still receive
// exactly the original page-space geometry used by the Agenda drop engine.
const root = path.resolve(__dirname, '..');
const sourceIndex = process.argv.indexOf('--source');
const sourcePath = sourceIndex >= 0
  ? path.resolve(process.argv[sourceIndex + 1])
  : path.join(root, 'app', '(tabs)', 'agenda.tsx');
const baselinePath = path.join(root, 'work', 'single-slot-release-20261010', 'agenda.before.tsx');
const checks = [];

const walk = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  ts.forEachChild(node, child => { walk(child, predicate, found); });
  return found;
};
const transpile = text => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function loadCallbacks(file) {
  const text = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = walk(tree, node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'DraggableWeekAppointment')[0];
  assert.ok(component, 'Actual DraggableWeekAppointment must exist.');
  const gesture = walk(component, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'gesture')[0];
  assert.ok(gesture, 'Actual main Pan declaration must exist.');
  const callbacks = {};
  const mainPanChain = expression => {
    if (ts.isIdentifier(expression)) return expression.text === 'pan';
    if (ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression)) {
      return mainPanChain(expression.expression);
    }
    return false;
  };
  for (const name of ['onBegin', 'onStart', 'onUpdate', 'onEnd']) {
    const calls = walk(gesture.initializer, node => ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name
      && mainPanChain(node.expression));
    assert.equal(calls.length, 1, `Expected one real main Pan ${name}.`);
    callbacks[name] = calls[0].arguments[0].getText(tree);
  }
  const constants = {};
  for (const name of ['WEEK_DRAG_EDGE_CONTACT_INSET', 'WEEK_DRAG_RETURN_HOME_TOLERANCE']) {
    const value = walk(tree, node => ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name) && node.name.text === name)[0];
    constants[name] = Number(value?.initializer?.getText(tree));
    assert.ok(Number.isFinite(constants[name]), `Actual ${name} must be numeric.`);
  }
  return { callbacks, constants, tree };
}

const current = loadCallbacks(sourcePath);
const baseline = fs.existsSync(baselinePath) ? loadCallbacks(baselinePath) : null;

function runtime(source, { web = false, resizeEnabled = false, measureRoot = true, rootRef = true,
  measureCard = true, card = { pageX: 190, pageY: 300, width: 150, height: 92 },
  overlayRoot = { pageX: 40, pageY: 20 }, cachedOrigin = { pageX: 100, pageY: 80 } } = {}) {
  let inUiFrame = false;
  const shared = value => ({ value });
  const calls = [];
  const measurements = [];
  let now = 1_000;
  const ctx = vm.createContext({
    IS_WEB: web,
    resizeEnabled,
    resizeBottomBandHeight: 27,
    resizeBottomBandOvershoot: 8,
    resolvedResizeMinimumHeight: 23,
    resolvedContentHeight: card.height,
    resizeShrinkOnly: false,
    nativeResizeSnapStep: 23,
    nativeDragOverlayAppointmentKey: 'appointment|whole',
    appointmentViewRef: { kind: 'card' },
    nativeResizeOverlayRootRef: rootRef ? { kind: 'root' } : undefined,
    measuredCard: { ...card },
    measuredRoot: { ...overlayRoot },
    mainPanTouchStartedOnResizeHandle: shared(0),
    mainPanStarted: shared(0),
    active: shared(0),
    nativeDragReleasePending: shared(0),
    nativeCancelledDrop: shared(0),
    ended: shared(0),
    translateX: shared(0),
    translateY: shared(0),
    lastWebMoveDispatchAt: shared(0),
    lastNativeMoveDispatchAt: shared(0),
    resizeTranslationY: shared(0),
    resizeReleasePending: shared(0),
    cardWidth: shared(card.width),
    cardHeight: shared(card.height),
    grabOffsetX: shared(0),
    grabOffsetY: shared(0),
    startCardLeftPageX: shared(0),
    startCardTopPageY: shared(0),
    nativeDragCloneOriginX: shared(0),
    nativeDragCloneOriginY: shared(0),
    nativeDragOverlayOriginX: shared(cachedOrigin.pageX),
    nativeDragOverlayOriginY: shared(cachedOrigin.pageY),
    nativeDragOverlayActiveKey: shared(''),
    nativeDragOverlayX: shared(0),
    nativeDragOverlayY: shared(0),
    nativeDragOverlayWidth: shared(0),
    nativeDragOverlayHeight: shared(0),
    nativeDropPreviewVisible: shared(0),
    webPointerDownReady: shared(0),
    webPointerDownAbsoluteX: shared(0),
    webPointerDownAbsoluteY: shared(0),
    webPointerDownLocalX: shared(0),
    webPointerDownLocalY: shared(0),
    nativeResizeTouchStartAbsoluteY: shared(0),
    resizeMode: shared(0),
    resizeHandleArmed: shared(0),
    gestureOwner: shared(0),
    autoScrollCompensationX: shared(0),
    autoScrollCompensationY: shared(0),
    scale: shared(1),
    debugGestureId: 'pickup-runtime-test',
    ...source.constants,
    Date: { now: () => now },
    Math,
    Number,
    measure: ref => {
      assert.ok(inUiFrame, 'Native measurement must run inside the gesture UI callback.');
      measurements.push(ref.kind);
      if (ref.kind === 'card') return measureCard ? ctx.measuredCard : null;
      if (ref.kind === 'root') return measureRoot ? ctx.measuredRoot : null;
      throw new Error('Unknown animated ref.');
    },
    runOnJS: callback => callback,
    withTiming: value => value,
    setWebAgendaInteractionCursor: value => calls.push(['cursor', value]),
    logNativeWeekDragLifecycle: () => {},
  });
  for (const name of ['dispatchDragStart', 'dispatchDragMove', 'dispatchDragEnd', 'dispatchDragCancel',
    'dispatchResizeStart', 'dispatchResizeMove', 'dispatchResizeEnd', 'dispatchResizeCancel']) {
    ctx[name] = (...args) => calls.push([name, ...args]);
  }
  const callbacks = {};
  for (const [name, callback] of Object.entries(source.callbacks)) {
    callbacks[name] = vm.runInContext(transpile(`(${callback});`), ctx);
  }
  const invoke = (name, event, success) => {
    now += 50;
    inUiFrame = true;
    try { callbacks[name](event, success); } finally { inUiFrame = false; }
  };
  const visible = () => ({
    left: ctx.measuredRoot.pageX + ctx.nativeDragOverlayX.value,
    top: ctx.measuredRoot.pageY + ctx.nativeDragOverlayY.value,
    width: ctx.nativeDragOverlayWidth.value,
    height: ctx.nativeDragOverlayHeight.value,
    key: ctx.nativeDragOverlayActiveKey.value,
  });
  const snapshot = () => ({
    calls, width: ctx.cardWidth.value, height: ctx.cardHeight.value,
    grabX: ctx.grabOffsetX.value, grabY: ctx.grabOffsetY.value,
    startLeft: ctx.startCardLeftPageX.value, startTop: ctx.startCardTopPageY.value,
    translateX: ctx.translateX.value, translateY: ctx.translateY.value,
    resizeMode: ctx.resizeMode.value, resizeDelta: ctx.resizeTranslationY.value,
    gestureOwner: ctx.gestureOwner.value,
  });
  return { ctx, calls, measurements, invoke, visible, snapshot };
}

const pickup = (top = 300, left = 190, offsetY = 26, offsetX = 25) => ({
  absoluteX: left + offsetX, absoluteY: top + offsetY,
  x: offsetX, y: offsetY, translationX: 0, translationY: 0,
});
const move = (event, dx, dy) => ({ ...event,
  absoluteX: event.absoluteX + dx, absoluteY: event.absoluteY + dy,
  translationX: dx, translationY: dy,
});
function check(name, callback) {
  try { callback(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

check('both rendering lanes supply the actual absolute drag overlay root', () => {
  const refs = walk(current.tree, node => ts.isJsxAttribute(node)
    && node.name.getText(current.tree) === 'nativeResizeOverlayRootRef');
  assert.equal(refs.length, 2);
  refs.forEach(ref => assert.equal(ref.initializer.expression.getText(current.tree), 'agendaNativeResizeOverlayRootRef'));
  const roots = walk(current.tree, node => ts.isJsxElement(node)
    && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(current.tree) === 'ref'
      && attribute.initializer?.expression?.getText(current.tree) === 'agendaNativeResizeOverlayRootRef'));
  assert.equal(roots.length, 1);
  assert.ok(roots[0].getText(current.tree).includes('<NativeWeekDragOverlay'));
});

check('native pickup aligns the clone with the card despite a stale cached root', () => {
  const rt = runtime(current);
  rt.invoke('onStart', pickup());
  same(rt.visible(), { left: 190, top: 300, width: 150, height: 92, key: 'appointment|whole' },
    `Actual physical clone at ${JSON.stringify(rt.visible())} must coincide with the source card.`);
});

check('native move keeps the same grabbed pixel without an initial correction jump', () => {
  const rt = runtime(current);
  const event = pickup();
  rt.invoke('onStart', event);
  rt.invoke('onUpdate', move(event, 12, 42));
  same(rt.visible(), { left: 202, top: 342, width: 150, height: 92, key: 'appointment|whole' });
  assert.equal(rt.ctx.translateY.value, 42);
});

check('a later cached JS measurement cannot change the current UI-frame clone origin', () => {
  const rt = runtime(current);
  const event = pickup();
  rt.invoke('onStart', event);
  rt.ctx.nativeDragOverlayOriginX.value = 160;
  rt.ctx.nativeDragOverlayOriginY.value = 100;
  rt.invoke('onUpdate', move(event, -12, 42));
  assert.equal(rt.visible().top, 342);
  assert.equal(rt.visible().left, 178);
});

check('successive pickups remeasure their own origin and do not accumulate an offset', () => {
  const rt = runtime(current);
  for (let i = 0; i < 8; i += 1) {
    const top = 300 + i * 23;
    const left = 190 + (i % 2) * 160;
    rt.ctx.measuredCard = { pageX: left, pageY: top, width: 150, height: 92 + i * 23 };
    rt.ctx.measuredRoot = { pageX: 40 + i * 3, pageY: 20 + i * 5 };
    rt.ctx.nativeDragOverlayOriginX.value = 100 - i * 2;
    rt.ctx.nativeDragOverlayOriginY.value = 80 + i * 7;
    const event = pickup(top, left);
    rt.invoke('onStart', event);
    assert.equal(rt.visible().top, top, `Pickup ${i + 1} moved the source vertically.`);
    assert.equal(rt.visible().left, left, `Pickup ${i + 1} moved the source horizontally.`);
    assert.equal(rt.visible().height, 92 + i * 23);
    rt.invoke('onUpdate', move(event, 12, -23));
    assert.equal(rt.visible().top, top - 23);
    rt.invoke('onEnd', move(event, 12, -23), true);
  }
});

check('card and overlay origin are measured together in the actual native UI callback', () => {
  const rt = runtime(current);
  rt.invoke('onStart', pickup());
  same(rt.measurements, ['card', 'root'], 'Both measurements must belong to the same pickup callback.');
});

check('a missing card measurement still anchors the clone to the event and measured root', () => {
  const rt = runtime(current, { measureCard: false });
  rt.invoke('onStart', pickup());
  assert.equal(rt.visible().top, 300);
  assert.equal(rt.visible().left, 190);
});

if (baseline) {
  check('start, target probes, card bounds and release arguments remain identical to the original engine', () => {
    const after = runtime(current);
    const before = runtime(baseline);
    const event = pickup();
    for (const rt of [after, before]) {
      rt.invoke('onStart', event);
      rt.invoke('onUpdate', move(event, 12, 42));
      rt.invoke('onEnd', move(event, 12, 42), true);
    }
    same(after.snapshot(), before.snapshot(), 'The visual clone correction must not alter any engine argument.');
  });
  for (const [label, options] of [['null root measurement', { measureRoot: false }],
    ['missing root ref', { rootRef: false }]]) {
    check(`${label}: cached-coordinate fallback preserves existing behavior`, () => {
      const after = runtime(current, options);
      const before = runtime(baseline, options);
      for (const rt of [after, before]) {
        rt.invoke('onStart', pickup());
        rt.invoke('onUpdate', move(pickup(), 12, 42));
      }
      same(after.visible(), before.visible());
      same(after.snapshot(), before.snapshot());
    });
  }
  for (const [label, offsetY, resizeEnabled] of [['drag', 26, false], ['resize', 88, true]]) {
    check(`web ${label}: pointer anchor, callbacks and transforms stay unchanged with no native measurements`, () => {
      const after = runtime(current, { web: true, resizeEnabled });
      const before = runtime(baseline, { web: true, resizeEnabled });
      const event = pickup(300, 190, offsetY);
      for (const rt of [after, before]) {
        rt.invoke('onBegin', event);
        rt.invoke('onStart', move(event, 3, 3));
        rt.invoke('onUpdate', move(event, 12, 42));
        rt.invoke('onEnd', move(event, 12, 42), true);
      }
      same(after.snapshot(), before.snapshot());
      assert.equal(after.measurements.length, 0);
      assert.equal(after.ctx.nativeDragOverlayActiveKey.value, '');
    });
  }
}

const result = { source: sourcePath, comparisonBaseline: baseline ? baselinePath : null,
  total: checks.length, passed: checks.filter(item => item.passed).length, checks };
console.log(JSON.stringify(result, null, 2));
if (result.passed !== result.total) process.exitCode = 1;
