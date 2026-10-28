/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual callbacks and animated styles. In Reanimated, a changed
// useAnimatedStyle closure is installed in a passive effect; the layout effect
// may therefore release the clone while the previous UI mapper is still live.
const root = path.resolve(__dirname, '..');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag >= 0
  ? path.resolve(process.argv[sourceFlag + 1])
  : path.join(root, 'app', '(tabs)', 'agenda.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const baselinePath = path.join(root, 'work', 'single-slot-release-20261010', 'agenda.before.tsx');
const checks = [];

const walk = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  ts.forEachChild(node, child => { walk(child, predicate, found); });
  return found;
};
const declaration = (name, searchTree = tree) => {
  const matches = walk(searchTree, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name);
  if (matches.length !== 1) throw new Error(`Expected one declaration: ${name}.`);
  return matches[0];
};
const draggable = walk(tree, node => ts.isFunctionDeclaration(node)
  && node.name?.text === 'DraggableWeekAppointment')[0];
if (!draggable) throw new Error('Missing actual DraggableWeekAppointment.');
const transpile = text => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const evaluate = (context, expression) => vm.runInContext(transpile(expression), context);
const hookCallbacks = (searchNode, text) => walk(searchNode, node => ts.isCallExpression(node)
  && ts.isIdentifier(node.expression) && node.expression.text === 'useLayoutEffect'
  && node.arguments[0]?.getText(tree).includes(text)).map(node => node.arguments[0]);
const resizeEffects = hookCallbacks(draggable, 'previousResizeCommitEpochRef');
if (resizeEffects.length !== 1) throw new Error('Expected the actual resize commit layout effect.');
const resizeUpdater = declaration('resizeContainerStyle').initializer.arguments[0];
const dragUpdater = declaration('dragAnimatedStyle', draggable).initializer.arguments[0];
const nativePan = declaration('nativeResizePan').initializer;
const nativeEnd = walk(nativePan, node => ts.isCallExpression(node)
  && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'onEnd')[0]?.arguments[0];
const nativeFinalize = walk(nativePan, node => ts.isCallExpression(node)
  && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'onFinalize')[0]?.arguments[0];
if (!nativeEnd || !nativeFinalize) throw new Error('Missing actual native resize terminal callbacks.');

function runtime({ oldHeight = 92, direct = true, web = false } = {}) {
  const queue = [];
  let onUi = false;
  let observer = () => {};
  const shared = value => {
    let current = value;
    return Object.defineProperty({}, 'value', {
      get: () => current,
      set: next => {
        if (onUi) current = next;
        else queue.push(() => { current = next; });
      },
    });
  };
  const key = 'single-appointment|whole';
  const context = vm.createContext({
    IS_WEB: web,
    nativeDirectReleaseHandoffEnabled: direct,
    resolvedResizeMinimumHeight: 23,
    nativeResizeSnapStep: 23,
    nativeResizeReturnHomeDeadband: 5.75,
    resizeShrinkOnly: false,
    resizeOngoing: false,
    resolvedContentHeight: oldHeight,
    resizeCommitEpoch: 0,
    previousResizeCommitEpochRef: { current: 0 },
    nativeCommittedContentHeight: shared(oldHeight),
    cardHeight: shared(oldHeight),
    cardWidth: shared(150),
    grabOffsetX: shared(20),
    grabOffsetY: shared(20),
    resizeMode: shared(1),
    resizeReleasePending: shared(1),
    resizeTranslationY: shared(0),
    scale: shared(1),
    nativeResizeOverlayAppointmentKey: key,
    nativeResizeOverlayActiveKey: shared(key),
    nativeResizeOverlayHeight: shared(oldHeight),
    nativeResizeOverlayInteractionActive: shared(1),
    nativeResizeOverlayHandleHeight: shared(18),
    nativeDragOverlayAppointmentKey: key,
    nativeDragOverlayActiveKey: shared(''),
    autoScrollCompensationX: shared(0),
    autoScrollCompensationY: shared(0),
    translateX: shared(0),
    translateY: shared(0),
    active: shared(1),
    ended: shared(0),
    gestureOwner: shared(2),
    resizeHandleArmed: shared(1),
    nativeResizePanStarted: shared(1),
    nativeResizeTouchStartAbsoluteX: shared(20),
    nativeResizeTouchStartAbsoluteY: shared(300),
    nativeResizeTouchStartLocalX: shared(20),
    nativeResizeTouchStartLocalY: shared(oldHeight),
    nativeResizeTouchStartedAt: shared(100),
    nativeResizeTouchStartAgendaScrollY: shared(100),
    nativeResizeTouchStartWeekScrollX: shared(0),
    nativeAgendaVerticalScrollOffsetY: shared(100),
    debugGestureId: 'release-runtime-test',
    previewHidden: false,
    getNativeWeekResizeIndicatorHeight: height => Math.min(30, Math.max(9, height - 11)),
    logNativeWeekDragLifecycle: () => {},
    dispatchResizeCancel: () => { context.cancelCalls += 1; },
    dispatchResizeEnd: delta => { context.endCalls.push(delta); },
    cancelCalls: 0,
    endCalls: [],
    runOnJS: callback => callback,
    runOnUI: callback => (...args) => queue.push(() => callback(...args)),
    withTiming: value => value,
    withDelay: (_delay, value) => value,
  });
  const ui = callback => {
    onUi = true;
    try { callback(); } finally { onUi = false; }
    observer();
  };
  const flush = () => { while (queue.length) ui(queue.shift()); };
  const capture = (node, height) => {
    evaluate(context, `globalThis.__captured = ((resolvedContentHeight) => (${node.getText(tree)}))(${height});`);
    return context.__captured;
  };
  return { context, key, ui, flush, capture, observe: next => { observer = next; } };
}

function simulateCommit(oldHeight, newHeight, { direct = true, web = false } = {}) {
  const rt = runtime({ oldHeight, direct, web });
  const ctx = rt.context;
  rt.ui(() => {
    ctx.resizeTranslationY.value = newHeight - oldHeight;
    ctx.nativeResizeOverlayHeight.value = newHeight;
    ctx.nativeResizeOverlayInteractionActive.value = 0;
    ctx.active.value = 0;
  });
  const oldMapper = rt.capture(resizeUpdater, oldHeight);
  const sourceMapper = rt.capture(dragUpdater, oldHeight);
  const visibleHeights = [];
  const visibleOwners = [];
  rt.observe(() => {
    const sourceVisible = sourceMapper().opacity > 0;
    const overlayVisible = ctx.nativeResizeOverlayActiveKey.value === rt.key;
    visibleOwners.push(Number(sourceVisible) + Number(overlayVisible));
    visibleHeights.push(overlayVisible ? ctx.nativeResizeOverlayHeight.value : oldMapper().height);
  });
  ctx.resizeCommitEpoch = 1;
  const commit = rt.capture(resizeEffects[0], newHeight);
  // This is the hazardous schedule: commit and queued UI writes complete
  // before React flushes passive effects that replace the old mapper.
  commit();
  rt.flush();
  const staleMapperHeight = oldMapper().height;
  const nextMapperHeight = rt.capture(resizeUpdater, newHeight)().height;
  return { visibleHeights, visibleOwners, staleMapperHeight, nextMapperHeight };
}

function check(name, callback) {
  try { callback(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

check('both rendered lanes enable the handoff only for an unlinked single slot', () => {
  const attributes = walk(tree, node => ts.isJsxAttribute(node)
    && node.name.getText(tree) === 'nativeDirectReleaseHandoffEnabled');
  assert(attributes.length === 2, 'Both standard and operator-lane card paths must opt in explicitly.');
  for (const attribute of attributes) {
    const expression = attribute.initializer.expression.getText(tree);
    for (const fixture of [
      { appointment: {}, draft: null, expected: true },
      { appointment: { appointmentGroupId: 'linked-group' }, draft: null, expected: false },
      { appointment: { phaseConfig: { initialDurationMinutes: 20 } }, draft: null, expected: false },
      { appointment: {}, draft: { dirty: true }, expected: false },
    ]) {
      const ctx = vm.createContext({
        weekReorganizationDraft: fixture.draft,
        laneStartAppointment: fixture.appointment,
        appointmentStart: fixture.appointment,
        normalizeServicePhaseConfig: value => value ?? null,
      });
      assert(evaluate(ctx, `Boolean(${expression});`) === fixture.expected,
        'A linked, phased or draft card changed to the new direct-only handoff.');
    }
  }
});

for (const [label, oldHeight, newHeight] of [['extend', 92, 138], ['shrink', 138, 69]]) {
  check(`native direct ${label}: old mapper never exposes the initial height`, () => {
    const result = simulateCommit(oldHeight, newHeight);
    assert(result.visibleHeights.length > 0, 'No UI handoff was exercised.');
    assert(result.visibleHeights.every(height => height === newHeight),
      `Visible heights ${JSON.stringify(result.visibleHeights)}; expected only ${newHeight}.`);
    assert(result.nextMapperHeight === newHeight, 'New mapper has incorrect final height.');
    assert(result.visibleOwners.every(count => count === 1), 'Clone/source must have exactly one visible owner.');
  });
}

function keyRuntime() {
  const context = vm.createContext({
    IS_WEB: false,
    useCallback: callback => callback,
    nativeWeekDragReleaseCommitRef: { current: null },
    nativeWeekDragOverlayActiveKey: { value: '' },
    normalizeAgendaLaneOperatorLabelKey: value => String(value ?? '').trim().toLowerCase(),
    normalizeServicePhaseConfig: value => value ?? null,
    normalizeServicePhaseOperatorAssignments: value => value ?? null,
    todayDate: '2026-10-10',
  });
  for (const name of ['getWeekInteractionAppointmentKey', 'buildNativeWeekPreviewAppointmentKey',
    'buildNativeWeekDragReleasePlacementSignature', 'stageNativeWeekDragReleaseCommit']) {
    evaluate(context, `const ${declaration(name).getText(tree)};`);
  }
  return context;
}
const swap = declaration('runWeekSwap').initializer.arguments[0];
const directStageCall = walk(swap, node => ts.isCallExpression(node)
  && ts.isIdentifier(node.expression) && node.expression.text === 'stageNativeWeekDragReleaseCommit')[0];
const acknowledgement = hookCallbacks(tree, 'buildNativeWeekDragReleasePlacementSignature(committedAppointment)')[0];
if (!directStageCall || !acknowledgement) throw new Error('Missing direct move or actual render acknowledgement.');

for (const phase of ['whole', 'initial', 'final']) {
  check(`direct drag ${phase}: actual call site retires the visible clone`, () => {
    const ctx = keyRuntime();
    ctx.preview = { sourceAppointment: { id: 'single-appointment', ora: '09:00', data: '2026-10-11',
      renderedPhase: phase === 'whole' ? undefined : phase } };
    ctx.optimisticSourceAppointment = { ...ctx.preview.sourceAppointment, ora: '10:15' };
    ctx.appointmentsWithReorganizationDraft = [ctx.optimisticSourceAppointment];
    evaluate(ctx, 'nativeWeekDragOverlayActiveKey.value = buildNativeWeekPreviewAppointmentKey(preview.sourceAppointment);');
    evaluate(ctx, `${directStageCall.getText(tree)};`);
    evaluate(ctx, 'globalThis.keysMatch = nativeWeekDragReleaseCommitRef.current.overlayKey === nativeWeekDragOverlayActiveKey.value;');
    assert(ctx.keysMatch, 'Direct stage uses an identifier different from the active visible overlay.');
    evaluate(ctx, `(${acknowledgement.getText(tree)})();`);
    assert(ctx.nativeWeekDragOverlayActiveKey.value === '', 'Actual committed destination did not retire clone.');
    assert(ctx.nativeWeekDragReleaseCommitRef.current === null, 'Commit acknowledgement remained pending.');
  });
}

check('non-zero release remains held until the matching React commit', () => {
  const rt = runtime();
  const end = rt.capture(nativeEnd, 92);
  const finalize = rt.capture(nativeFinalize, 92);
  rt.ui(() => end({ absoluteY: 346, translationY: 46 }, true));
  rt.ui(finalize);
  assert(rt.context.resizeReleasePending.value === 1, 'Non-zero release was reset before commit.');
  assert(rt.context.nativeResizeOverlayActiveKey.value === rt.key, 'Released clone disappeared too early.');
  assert(rt.context.endCalls.length === 1 && rt.context.endCalls[0] === 46, 'Release must dispatch one snapped operation.');
  assert(rt.context.nativeResizeOverlayInteractionActive.value === 0, 'Lift/armed interaction must finish immediately.');
});

check('snap-zero restores the original card without a pending clone', () => {
  const rt = runtime();
  rt.ui(() => { rt.context.resizeReleasePending.value = 0; });
  rt.ui(() => rt.capture(nativeEnd, 92)({ absoluteY: 300, translationY: 0 }, true));
  rt.ui(rt.capture(nativeFinalize, 92));
  assert(rt.context.resizeReleasePending.value === 0, 'Zero snap waits for a nonexistent geometry commit.');
  assert(rt.context.nativeResizeOverlayActiveKey.value === '', 'Zero snap kept clone visible.');
  assert(rt.context.resizeMode.value === 0 && rt.context.resizeTranslationY.value === 0, 'Zero snap changed geometry.');
  assert(rt.context.endCalls.length === 1 && rt.context.endCalls[0] === 0, 'Zero snap dispatch changed.');
});

check('cancelled native release restores the source and dispatches no save', () => {
  const rt = runtime();
  rt.ui(() => { rt.context.resizeReleasePending.value = 0; });
  rt.ui(() => rt.capture(nativeEnd, 92)({ absoluteY: 346, translationY: 46 }, false));
  rt.ui(rt.capture(nativeFinalize, 92));
  assert(rt.context.cancelCalls === 1 && rt.context.endCalls.length === 0, 'Cancellation was duplicated or saved.');
  assert(rt.context.resizeMode.value === 0 && rt.context.resizeTranslationY.value === 0, 'Cancelled geometry remains altered.');
  assert(rt.context.nativeResizeOverlayActiveKey.value === '', 'Cancellation left a suspended clone.');
});

check('the next resize pickup uses the committed height instead of the previous base', () => {
  const rt = runtime();
  rt.context.resizeCommitEpoch = 1;
  rt.capture(resizeEffects[0], 138)();
  rt.flush();
  rt.ui(() => {
    rt.context.nativeResizePanStarted.value = 1;
    rt.context.gestureOwner.value = 2;
    rt.context.active.value = 1;
    rt.context.ended.value = 0;
    rt.context.resizeMode.value = 1;
    rt.context.resizeReleasePending.value = 0;
    rt.context.nativeResizeTouchStartAbsoluteY.value = 300;
    rt.context.nativeResizeOverlayActiveKey.value = rt.key;
  });
  rt.ui(() => rt.capture(nativeEnd, 138)({ absoluteY: 323, translationY: 23 }, true));
  assert(rt.context.cardHeight.value === 138, 'Next pickup retained the old measured height.');
  assert(rt.context.nativeResizeOverlayHeight.value === 161, 'Next release added its delta to the wrong base.');
});

check('a real rollback updates resting geometry even without a new release epoch', () => {
  const rt = runtime();
  rt.context.resizeCommitEpoch = 1;
  rt.capture(resizeEffects[0], 138)();
  rt.flush();
  rt.capture(resizeEffects[0], 92)();
  rt.flush();
  assert(rt.capture(resizeUpdater, 138)().height === 92,
    'Authoritative rollback cannot wait for a new gesture or a passive mapper replacement.');
});

if (fs.existsSync(baselinePath) && path.resolve(sourcePath) !== path.resolve(baselinePath)) {
  const baseline = fs.readFileSync(baselinePath, 'utf8');
  const baselineTree = ts.createSourceFile('baseline.tsx', baseline, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const baselineDraggable = walk(baselineTree, node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'DraggableWeekAppointment')[0];
  const baselineEffects = walk(baselineDraggable, node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'useLayoutEffect'
    && node.arguments[0]?.getText(baselineTree).includes('previousResizeCommitEpochRef')).map(node => node.arguments[0]);
  const baselineUpdater = declaration('resizeContainerStyle', baselineTree).initializer.arguments[0];
  for (const [name, web] of [['draft', false], ['web', true]]) {
    check(`${name}: pre-existing release behavior is unchanged`, () => {
      const previous = runtime({ oldHeight: 92, direct: false, web });
      previous.ui(() => { previous.context.resizeTranslationY.value = 46; });
      previous.context.resizeCommitEpoch = 1;
      evaluate(previous.context, `globalThis.__beforeStyle = ((resolvedContentHeight) => (${baselineUpdater.getText(baselineTree)}))(92);`);
      evaluate(previous.context, `((resolvedContentHeight) => (${baselineEffects[0].getText(baselineTree)}))(138)();`);
      previous.flush();
      const current = simulateCommit(92, 138, { direct: false, web });
      assert(current.staleMapperHeight === previous.context.__beforeStyle().height,
        'Excluded path changed its mapper handoff.');
      assert(current.nextMapperHeight === 138, 'Excluded path final height changed.');
    });
  }
}

checks.push({ name: 'failed persistence clears only the affected resize preview with one RPC', passed: true });
// Run the actual persistence callback separately because it is asynchronous.
async function persistenceFailure() {
  const calls = [];
  const cleared = [];
  const ctx = vm.createContext({
    useCallback: callback => callback,
    weekAppointmentDurationSavingId: null,
    weekAppointmentResizePendingIdsRef: { current: new Set() },
    stageWeekAppointmentResizeVisualPreview: () => {},
    setWeekAppointmentDurationSavingId: () => {},
    shortenOwnerAppointmentDurationForSalon: async args => { calls.push(args); return { ok: false, errorCode: 'save_failed', error: 'simulated failure' }; },
    salonWorkspace: { salonCode: 'runtime-test' },
    todayDate: '2026-10-10',
    setWeekReorganizationDraft: () => { throw new Error('Failure must not create a draft.'); },
    clearWeekAppointmentResizeVisualPreview: id => cleared.push(id),
    Alert: { alert: () => {} },
    haptic: { success: () => Promise.resolve(), error: () => Promise.resolve() },
    presentWeekInteractionConfirmation: () => { throw new Error('Ordinary failure is not an overlap confirmation.'); },
  });
  evaluate(ctx, `const ${declaration('saveWeekAppointmentResizeDuration').getText(tree)};`);
  ctx.appointment = { id: 'single-appointment', ora: '09:00', data: '2026-10-11', cliente: 'Runtime test', servizio: 'Test' };
  const promise = evaluate(ctx, 'saveWeekAppointmentResizeDuration(appointment, 40, false, false, false);');
  await promise;
  assert(calls.length === 1, 'Failed operation dispatched duplicate saves.');
  assert(cleared.length === 1 && cleared[0] === 'single-appointment', 'Failure must clear only its own preview.');
  assert(ctx.weekAppointmentResizePendingIdsRef.current.size === 0, 'Failure kept pending geometry ownership.');
}

(async () => {
  const failureCheck = checks.at(-1);
  try { await persistenceFailure(); }
  catch (error) { failureCheck.passed = false; failureCheck.error = error.message; }
  const result = { source: sourcePath, total: checks.length, passed: checks.filter(item => item.passed).length, checks };
  console.log(JSON.stringify(result, null, 2));
  if (result.passed !== result.total) process.exitCode = 1;
})();
