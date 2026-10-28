/* global __dirname */
/*
 * Exercise the actual Agenda density callbacks and JSX without mounting the
 * 60k-line screen. Native uses accessible +/- buttons; web retains the thumb
 * slider. This focused check does not replace device QA or the broader legacy
 * stable-owner contracts, and deliberately leaves those contracts untouched.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const agendaPath = path.resolve(__dirname, '../app/(tabs)/agenda.tsx');

function assertAgendaDensityStorageBoundary(source) {
  const tree = ts.createSourceFile(agendaPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const localCalls = [];
  let nativeDaysKey;
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'nativeDaysKey') nativeDaysKey = node.initializer;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(tree) === 'AsyncStorage'
      && ['getItem', 'setItem'].includes(node.expression.name.text)) localCalls.push(node);
    ts.forEachChild(node, walk);
  };
  walk(tree);
  assert.ok(!/AGENDA_DENSITY_STORAGE_KEY/.test(source), 'The former device-only density key must stay removed.');
  for (const call of localCalls) {
    // The one independently reviewed screen-local preference is visible days,
    // not density. Unknown keys fail closed until their purpose is reviewed.
    assert.equal(call.arguments[0]?.getText(tree), 'nativeDaysKey', 'Density cannot introduce a screen-local AsyncStorage preference.');
    assert.ok(nativeDaysKey && ts.isTemplateExpression(nativeDaysKey));
    assert.equal(nativeDaysKey.head.text, 'native-days:');
    assert.equal(nativeDaysKey.templateSpans.length, 1);
    assert.equal(nativeDaysKey.templateSpans[0].expression.getText(tree), 'webWeekVisibleDaysStorageKey');
    assert.equal(nativeDaysKey.templateSpans[0].literal.text, '');
    let statement = call;
    while (statement.parent && !ts.isStatement(statement)) statement = statement.parent;
    assert.ok(!/agendaDensity|setAgendaDensity/i.test(statement.getText(tree)), 'Local visible-day storage must not read or write density state.');
  }
}

function verifyAgendaDensityControls(source) {
  const tree = ts.createSourceFile(agendaPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, walk);
  };
  walk(tree);
  const initializer = (name) => {
    const node = declarations.get(name);
    assert.ok(node, `Missing density declaration: ${name}`);
    return node;
  };
  const evaluate = (node, context = {}) => vm.runInNewContext(
    ts.transpileModule(`(${node.getText(tree)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText,
    context,
    { timeout: 1000 },
  );
  const options = evaluate(initializer('AGENDA_DENSITY_OPTIONS'));
  assert.deepEqual(Array.from(options, (option) => [option.id, option.scale]), [
    ['massima', 0.58], ['panorama', 0.7], ['compatta', 0.82], ['comoda', 0.91], ['normale', 1],
  ], 'App and web must preserve all five shared density levels.');

  const commitNode = initializer('commitAgendaDensityIndex');
  assert.ok(ts.isCallExpression(commitNode), 'Density commit must remain a callback.');
  const commitCallback = commitNode.arguments[0];
  const createCommit = (initial) => {
    const state = { index: initial, saved: [], haptics: 0 };
    const commit = evaluate(commitCallback, {
      AGENDA_DENSITY_OPTIONS: options,
      setAgendaDensityIndex: (update) => { state.index = update(state.index); },
      setAgendaDensityPreferencePersisted: (id) => { state.saved.push(id); },
      haptic: { light: () => { state.haptics += 1; return Promise.resolve(); } },
    });
    return { state, commit };
  };
  let commitCases = 0;
  for (const initial of options.keys()) {
    for (const delta of [-10, -1, 0, 1, 10, 0.4, 0.6]) {
      const { state, commit } = createCommit(initial);
      commit(initial + delta);
      const expected = Math.max(0, Math.min(options.length - 1, Math.round(initial + delta)));
      assert.equal(state.index, expected, 'Commit must round and clamp the selected level.');
      assert.deepEqual(state.saved, [options[expected].id], 'Commit must persist the bounded ID through shared AppContext.');
      assert.equal(state.haptics, expected === initial ? 0 : 1, 'A changed native choice gets one feedback call.');
      commitCases += 1;
    }
  }
  const quiet = createCommit(0);
  quiet.commit(1, false);
  assert.equal(quiet.state.haptics, 0, 'Web slider release must not add native haptics.');

  const element = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });
  const descendants = (node) => {
    if (!node || typeof node !== 'object') return [];
    return [node, ...(node.children || []).flatMap(descendants)];
  };
  const render = (isWeb, index, commit) => {
    const context = {
      IS_WEB: isWeb, React: { createElement: element }, View: 'View', Text: 'Text',
      availabilityPalette: {border:'#777777',field:'#EEEEEE',ink:'#222222',muted:'#888888'},
      Reanimated: { View: 'Reanimated.View' }, HapticTouchable: 'HapticTouchable', Ionicons: 'Ionicons',
      GestureDetector: 'GestureDetector', styles: new Proxy({}, { get: (_, key) => key }),
      AGENDA_DENSITY_OPTIONS: options, AGENDA_DENSITY_THUMB_SIZE: 20,
      agendaDensityIndex: index, agendaDensityScale: options[index].scale, agendaDensityOption: options[index],
      agendaDensityTrackWidth: 120, agendaDensityTrackUsableWidth: 100,
      agendaDensityFillStyle: {}, agendaDensityThumbStyle: {}, agendaDensityHaloStyle: {},
      agendaDensityHovered: { value: false }, agendaDensityGesture: {},
      setAgendaDensityTrackWidth: () => {}, commitAgendaDensityIndex: commit,
    };
    context.agendaDensityThumb = evaluate(initializer('agendaDensityThumb'), context);
    context.agendaDensityRail = evaluate(initializer('agendaDensityRail'), context);
    return { node: evaluate(initializer('agendaDensitySlider'), context), ...context };
  };
  let nativeCases = 0;
  for (const platform of ['ios', 'android']) {
    assert.equal(evaluate(initializer('AGENDA_DENSITY_SURFACE'), { IS_WEB: false }), 'app', `${platform} must use the shared app density preference.`);
    for (const index of options.keys()) {
      const { state, commit } = createCommit(index);
      const result = render(false, index, commit);
      const nodes = descendants(result.node);
      assert.equal(nodes.filter((node) => node.type === 'GestureDetector').length, 0, 'Native density controls must never bind the old pan gesture.');
      const buttons = nodes.filter((node) => node.type === 'HapticTouchable');
      assert.equal(buttons.length, 2, 'Native density must expose exactly two adjustment actions.');
      const [minus, plus] = buttons;
      for (const button of buttons) {
        assert.equal(button.props.accessibilityRole, 'button');
        assert.ok(button.props.style.minHeight >= 44 && button.props.style.minWidth >= 44, 'Density adjustment targets must remain touch-sized.');
      }
      assert.equal(minus.props.accessibilityLabel, 'Riduci dimensione Agenda');
      assert.equal(plus.props.accessibilityLabel, 'Aumenta dimensione Agenda');
      assert.equal(minus.props.disabled, index === 0, 'Minus must disable at the minimum.');
      assert.equal(plus.props.disabled, index === options.length - 1, 'Plus must disable at the maximum.');
      assert.equal(minus.props.accessibilityState.disabled, minus.props.disabled);
      assert.equal(plus.props.accessibilityState.disabled, plus.props.disabled);
      const value = nodes.find((node) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite');
      assert.ok(value, 'Native density percentage must be announced when it changes.');
      assert.equal(value.children.join(''), `${Math.round(options[index].scale * 100)}%`);
      // Invoke each actual JSX handler, including disabled boundaries to prove
      // the shared commit still prevents out-of-range updates programmatically.
      minus.props.onPress();
      assert.equal(state.index, Math.max(0, index - 1), 'Minus must reduce the current level.');
      plus.props.onPress();
      assert.equal(state.index, Math.min(options.length - 1, index + 1), 'Plus must increase the current level.');
      assert.deepEqual(state.saved, [options[Math.max(0, index - 1)].id, options[Math.min(options.length - 1, index + 1)].id]);
      nativeCases += 1;
    }
  }
  assert.equal(evaluate(initializer('AGENDA_DENSITY_SURFACE'), { IS_WEB: true }), 'web', 'Web density must use its independent preference surface.');
  const webResult = render(true, 2, () => {});
  const detectors = descendants(webResult.node).filter((node) => node.type === 'GestureDetector');
  assert.equal(detectors.length, 1, 'Web must retain one density gesture.');
  assert.equal(detectors[0].children[0], webResult.agendaDensityThumb, 'Only the web thumb may own the density pan.');
  assert.equal(descendants(webResult.node).filter((node) => node.type === 'HapticTouchable').length, 0, 'Native +/- controls must not replace the web slider.');

  const handlers = {};
  const pan = {
    minDistance: () => pan,
    onStart: (fn) => { handlers.start = fn; return pan; },
    onUpdate: (fn) => { handlers.update = fn; return pan; },
    onEnd: (fn) => { handlers.end = fn; return pan; },
    onFinalize: (fn) => { handlers.finalize = fn; return pan; },
  };
  let commits = [];
  const gestureContext = {
    IS_WEB: true, Gesture: { Pan: () => pan }, AGENDA_DENSITY_OPTIONS: options,
    AGENDA_DENSITY_THUMB_SIZE: 20, agendaDensityTrackUsableWidth: 100,
    commitAgendaDensityIndex: (...args) => { commits.push(args); },
    triggerAgendaDensityGrabHaptic: () => assert.fail('Web must not trigger a native grab haptic.'),
    triggerAgendaDensityStepHaptic: () => assert.fail('Web must not trigger native latch haptics.'),
    runOnJS: (fn) => fn,
  };
  for (const key of ['agendaDensityGestureActive', 'agendaDensityGestureStartX', 'agendaDensityFingerStartX', 'agendaDensityGestureStepIndex', 'agendaDensityThumbX']) {
    gestureContext[key] = { value: 0 };
  }
  evaluate(initializer('agendaDensityGesture').arguments[0], gestureContext)();
  const webCases = [[50, 13, 3], [50, -13, 1], [50, 500, 4], [50, -500, 0], [25, 0, 1]];
  for (const [start, drag, expected] of webCases) {
    commits = [];
    gestureContext.agendaDensityThumbX.value = start;
    handlers.start({ x: 10, absoluteX: 60, translationX: 0 });
    assert.equal(gestureContext.agendaDensityThumbX.value, start, 'Web grab must preserve the current thumb position.');
    handlers.update({ translationX: drag });
    assert.equal(gestureContext.agendaDensityThumbX.value, expected * 25, 'Web thumb must snap to the nearest bounded density stop.');
    assert.equal(commits.length, 0, 'Dragging must not persist a new preference before release.');
    handlers.end({}, true);
    assert.deepEqual(commits, [[expected, false]], 'A web release must persist exactly one selected stop.');
    handlers.finalize({}, true);
    assert.equal(gestureContext.agendaDensityGestureActive.value, 0, 'Finalizing must release the active gesture state.');
  }
  return { commitCases, nativeCases, webCases: webCases.length };
}

if (require.main === module) {
  const source = fs.readFileSync(agendaPath, 'utf8');
  const result = verifyAgendaDensityControls(source);
  assertAgendaDensityStorageBoundary(source);
  // Negative controls prove these checks reject behavior regressions instead
  // of merely accepting the current syntax. They change in-memory fixtures only.
  const mutations = [
    ['reversed minus', 'onPress={() => commitAgendaDensityIndex(agendaDensityIndex - 1)}', 'onPress={() => commitAgendaDensityIndex(agendaDensityIndex + 1)}'],
    ['wrong minimum boundary', 'disabled={agendaDensityIndex === 0}', 'disabled={agendaDensityIndex === 1}'],
    ['wrong maximum boundary', 'disabled={agendaDensityIndex === AGENDA_DENSITY_OPTIONS.length - 1}', 'disabled={false}'],
    ['lost persistence', 'void setAgendaDensityPreferencePersisted(nextDensity.id);', 'void nextDensity.id;'],
    ['inverted platform branch', 'const agendaDensitySlider = IS_WEB ? agendaDensityRail : (', 'const agendaDensitySlider = !IS_WEB ? agendaDensityRail : ('],
    ['native gesture restored', '><Ionicons name="remove" size={20}', '><GestureDetector gesture={agendaDensityGesture} /><Ionicons name="remove" size={20}'],
  ];
  for (const [label, before, after] of mutations) {
    assert.ok(source.includes(before), `Update the ${label} negative-control fixture after the density JSX is refactored.`);
    assert.throws(() => verifyAgendaDensityControls(source.replace(before, after)), undefined, `Density regression escaped detection: ${label}`);
  }
  const storageMutations = [
    source + '\nAsyncStorage.setItem("old-device-density", String(agendaDensityIndex));',
    source.replace('AsyncStorage.getItem(nativeDaysKey)', 'AsyncStorage.getItem("old-device-density")'),
    source.replace('AsyncStorage.setItem(nativeDaysKey, String(boundedWeekVisibleDays))', 'AsyncStorage.setItem(nativeDaysKey, String(agendaDensityIndex))'),
    source.replace('setNativeDaysChoice({ key: nativeDaysKey, days });', 'setAgendaDensityIndex(days);'),
  ];
  for (const fixture of storageMutations) {
    assert.notEqual(fixture, source, 'Density storage mutation must change its fixture.');
    assert.throws(() => assertAgendaDensityStorageBoundary(fixture), undefined, 'Device-only density storage escaped detection.');
  }
  console.log(`Agenda density controls passed: ${result.commitCases} commit/persistence cases, ${result.nativeCases} iOS/Android button cases, ${result.webCases} web gesture cases; ${mutations.length + storageMutations.length} negative controls rejected.`);
}

module.exports = { verifyAgendaDensityControls, assertAgendaDensityStorageBoundary };
