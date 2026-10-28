/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const start = source.indexOf('  const releaseQuickSlotInteractionLocks = useCallback(');
const end = source.indexOf('  const resetQuickSlotModalDraftState', start);
assert(start >= 0 && end > start, 'Use the actual quick-slot release callbacks.');
const callbacks = source.slice(start, end);
const closeStart = source.indexOf('  const closeQuickSlotModal = useCallback(');
assert(closeStart > end, 'The close path must remain available.');
const closeCallback = source.slice(closeStart, source.indexOf('\n  useEffect(', closeStart));
const recoveryStart = source.indexOf('  const recoverAgendaScrollAfterContextGesture = useCallback(');
const recoveryCallback = source.slice(recoveryStart, source.indexOf('  const weekConfirmationWasOpenRef', recoveryStart));
const hostStart = source.indexOf('<QuickSlotModalHost ref={quickSlotModalHostRef}');
const syntaxTree = ts.createSourceFile('agenda.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let dismissCallback;
let draftEffectCallback;
function findLifecycleCallbacks(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(syntaxTree) === 'onDismiss' &&
      node.getStart(syntaxTree) > hostStart && !dismissCallback) {
    dismissCallback = node.initializer.expression.getText(syntaxTree);
  }
  if (ts.isCallExpression(node) && node.expression.getText(syntaxTree) === 'useEffect' &&
      node.getStart(syntaxTree) > closeStart && !draftEffectCallback &&
      node.arguments[0]?.getText(syntaxTree).includes('if (quickSlotDraft) return;')) {
    draftEffectCallback = node.arguments[0].getText(syntaxTree);
  }
  ts.forEachChild(node, findLifecycleCallbacks);
}
findLifecycleCallbacks(syntaxTree);
assert(recoveryStart >= 0 && hostStart >= 0 && dismissCallback && draftEffectCallback,
  'Exercise the real recovery callback, native onDismiss and draft-null effect.');
assert.match(
  closeCallback,
  /scheduleQuickSlotInteractionRelease\(true\)/,
  'An unchanged close still requires a forced release of its own old locks.',
);
for (const [begin, next, label] of [
  ['const beginWeekAppointmentDragLatest = useCallback(', 'const beginWeekAppointmentDrag =', 'drag'],
  ['const beginWeekAppointmentResize = useCallback(', 'const moveWeekAppointmentResize =', 'resize'],
]) {
  const beginIndex = source.indexOf(begin);
  const nextIndex = source.indexOf(next, beginIndex);
  assert(beginIndex >= 0 && nextIndex > beginIndex);
  assert.match(
    source.slice(beginIndex, nextIndex),
    /weekInteractionGenerationRef\.current \+= 1;/,
    `An accepted ${label} must invalidate cleanup from older interactions.`,
  );
}

function createHarness({ realLifecycle = false, disableGuard = null } = {}) {
  const frames = [];
  const timers = [];
  const interactions = [];
  const mutations = [];
  const context = {
    IS_WEB: false,
    useCallback: (callback) => callback,
    releaseAgendaParentSwipe: () => mutations.push('release-parent'),
    cancelAnimationFrame: () => {},
    clearTimeout: () => {},
    quickBookingKeyboardVisible: false,
    quickSlotDraft: null,
    InteractionManager: { runAfterInteractions: (callback) => interactions.push(callback) },
    Keyboard: { dismiss: () => mutations.push('dismiss-keyboard') },
    recoverAgendaScrollAfterContextGesture: () => mutations.push('recover-scroll'),
    resetQuickSlotModalDraftState: () => mutations.push('reset-draft'),
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback, milliseconds) => {
      timers.push({ callback, milliseconds });
      return timers.length;
    },
  };
  let recovery = recoveryCallback;
  let dismiss = dismissCallback;
  let draftEffect = draftEffectCallback;
  // Negative controls remove one protection at a time, retaining the same
  // real callback bodies. Each must reproduce the old unwanted mutation.
  if (disableGuard === 'dismiss') dismiss = dismiss.replace('if (!IS_WEB && (', 'if (false && (');
  if (disableGuard === 'draft') draftEffect = draftEffect.replace('IS_WEB || (', 'true || (');
  if (disableGuard === 'recovery') {
    recovery = recovery.replace('if (\n        quickSlotModalVisibleRef.current ||', 'if (false && (\n        quickSlotModalVisibleRef.current ||')
      .replace('weekDragSourceRef.current || weekResizeSourceRef.current\n      ) return;', 'weekDragSourceRef.current || weekResizeSourceRef.current\n      )) return;');
    assert.notEqual(recovery, recoveryCallback, 'The recovery negative control must remove its guard.');
  }
  const executable = (realLifecycle ? recovery : '') + callbacks + closeCallback +
    (realLifecycle ? `\nglobalThis.onDismiss = ${dismiss}; globalThis.draftEffect = ${draftEffect}; globalThis.recover = recoverAgendaScrollAfterContextGesture;` : '');
  for (const match of executable.matchAll(/\b([A-Za-z0-9_]+)\.(current|value)\b/g)) {
    context[match[1]] ??= { [match[2]]: match[2] === 'value' ? 0 : null };
  }
  for (const match of executable.matchAll(/\b(set[A-Z][A-Za-z0-9_]+)\(/g)) {
    context[match[1]] ??= (value) => mutations.push([match[1], value]);
  }
  context.stopNativeWeekAutoScrollRef.current = () => mutations.push('stop-scroll');
  context.weekInteractionGenerationRef.current = 0;
  context.quickSlotModalHostRef.current = { dismiss: () => mutations.push('dismiss-host') };
  if (realLifecycle) {
    context.listRef.current = { setNativeProps: () => mutations.push('restore-scroll') };
    context.setDisableParentSwipe = (value) => mutations.push(value ? 'lock-parent' : 'unlock-parent');
  }
  vm.runInNewContext(
    ts.transpileModule(
      `${executable}\nglobalThis.schedule = scheduleQuickSlotInteractionRelease; globalThis.close = closeQuickSlotModal;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  return { context, frames, timers, interactions, mutations };
}

// A normal close must keep its immediate force behavior and both recovery passes.
{
  const { context, frames, timers, mutations } = createHarness();
  context.weekDragSourceRef.current = { id: 'old-drag' };
  context.weekResizeSourceRef.current = { id: 'old-resize' };
  context.schedule(true);
  assert.equal(context.weekDragSourceRef.current, null);
  assert.equal(context.weekResizeSourceRef.current, null);
  assert.equal(frames.length, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].milliseconds, 280);
  frames[0]();
  timers[0].callback();
  assert.equal(mutations.filter((item) => item === 'release-parent').length, 3);
}

// Reproduce the regression with actual source callbacks: a gesture begins
// after closing, but before an already queued frame or timeout is delivered.
for (const kind of ['drag', 'resize']) {
  for (const delivery of ['frame', 'timeout']) {
    const { context, frames, timers, mutations } = createHarness();
    const ref = kind === 'drag' ? context.weekDragSourceRef : context.weekResizeSourceRef;
    const newGesture = { id: `same-appointment-new-${kind}` };
    ref.current = newGesture;
    context.schedule(true);
    if (delivery === 'timeout') frames[0]();
    context.weekInteractionGenerationRef.current += 1;
    ref.current = newGesture;
    const before = mutations.length;
    (delivery === 'frame' ? frames[0] : timers[0].callback)();
    assert.equal(ref.current, newGesture, `${delivery} must preserve the new ${kind}.`);
    assert.equal(mutations.length, before, `${delivery} must not reset a new gesture's UI or scroll.`);
  }
}

// The outer close frame also belongs to the old interaction. Cover a new
// gesture still active, and one already finished before that frame is delivered.
for (const kind of ['drag', 'resize']) {
  for (const ended of [false, true]) {
    const { context, frames, timers, mutations } = createHarness();
    const ref = kind === 'drag' ? context.weekDragSourceRef : context.weekResizeSourceRef;
    const sameAppointment = { id: 'same-appointment-reused' };
    ref.current = sameAppointment;
    context.close();
    assert.deepEqual(mutations, ['dismiss-host'], 'The native host must dismiss before cleanup setters run.');
    context.weekInteractionGenerationRef.current += 1;
    ref.current = ended ? null : sameAppointment;
    frames[0]();
    assert.equal(ref.current, ended ? null : sameAppointment);
    assert.equal(timers.length, 0, 'Stale outer close must not schedule more interaction releases.');
    assert(!mutations.includes('release-parent'));
    assert(!mutations.includes('stop-scroll'));
    assert(!mutations.includes('recover-scroll'));
    frames[1]();
    assert(mutations.includes('reset-draft'), 'Closed composer fields still clean up normally.');
  }
}

// A gesture that has already finished is protected by generation too; ref
// identity alone would miss this and erase its pending confirmation state.
for (const delivery of ['frame', 'timeout']) {
  const { context, frames, timers, mutations } = createHarness();
  context.schedule(true);
  if (delivery === 'timeout') frames[0]();
  context.weekInteractionGenerationRef.current += 1;
  const before = mutations.length;
  (delivery === 'frame' ? frames[0] : timers[0].callback)();
  assert.equal(mutations.length, before, `${delivery} must preserve a newer completed interaction.`);
}

// Normal native close retains its paint-first shell, forced old-lock cleanup,
// both recovery passes, and subsequent composer draft reset.
{
  const { context, frames, timers, mutations } = createHarness();
  context.weekResizeSourceRef.current = { id: 'old-resize' };
  context.close();
  assert.deepEqual(mutations, ['dismiss-host']);
  frames[0]();
  assert.equal(context.weekResizeSourceRef.current, null);
  assert(mutations.includes('recover-scroll'));
  frames[1]();
  frames[2]();
  timers[0].callback();
  assert(mutations.includes('reset-draft'));
}

{
  const { context, frames, timers, mutations } = createHarness();
  context.close();
  context.quickSlotModalVisibleRef.current = true;
  const before = mutations.length;
  frames[0]();
  assert.equal(mutations.length, before, 'An outer close frame must preserve a reopened popup.');
  assert.equal(timers.length, 0);
}

// Reopening normally cancels pending jobs. Even a callback already queued for
// delivery must leave the reopened popup's locks and state untouched.
for (const delivery of ['frame', 'timeout']) {
  const { context, frames, timers, mutations } = createHarness();
  context.schedule(true);
  if (delivery === 'timeout') frames[0]();
  context.quickSlotModalVisibleRef.current = true;
  const before = mutations.length;
  (delivery === 'frame' ? frames[0] : timers[0].callback)();
  assert.equal(mutations.length, before, `${delivery} must not reset a reopened popup.`);
}

// Existing non-forced callers must continue to protect a gesture immediately.
{
  const { context, frames, timers, mutations } = createHarness();
  const activeGesture = { id: 'already-active' };
  context.weekResizeSourceRef.current = activeGesture;
  context.schedule();
  frames[0]();
  timers[0].callback();
  assert.equal(context.weekResizeSourceRef.current, activeGesture);
  assert.equal(mutations.length, 0);
}

// Native Modal.onDismiss and the draft-null effect run independently from the
// close frames. They must protect new active/finished gestures and fast reopen.
for (const callback of ['onDismiss', 'draftEffect']) {
  for (const state of ['drag', 'resize', 'ended', 'reopened']) {
    const { context, mutations } = createHarness({ realLifecycle: true });
    context.quickSlotClosingInteractionGenerationRef.current = 0;
    if (state === 'reopened') context.quickSlotModalVisibleRef.current = true;
    else context.weekInteractionGenerationRef.current += 1;
    if (state === 'drag') context.weekDragSourceRef.current = { id: 'new' };
    if (state === 'resize') context.weekResizeSourceRef.current = { id: 'new' };
    context[callback]();
    assert(!mutations.includes('release-parent'), `${callback} must preserve ${state}.`);
    assert(!mutations.includes('stop-scroll'));
  }
  const { context, mutations } = createHarness({ realLifecycle: true });
  context.quickSlotClosingInteractionGenerationRef.current = 0;
  context[callback]();
  assert(mutations.includes('release-parent'), `${callback} must still release an ordinary closed popup.`);
}

function runRecoveryScenario(disableGuard = null, state = 'ended') {
  const h = createHarness({ realLifecycle: true, disableGuard });
  h.context.recover();
  if (state === 'reopened') h.context.quickSlotModalVisibleRef.current = true;
  else if (state !== 'ordinary') h.context.weekInteractionGenerationRef.current += 1;
  if (state === 'drag') h.context.weekDragSourceRef.current = { id: 'new' };
  if (state === 'resize') h.context.weekResizeSourceRef.current = { id: 'new' };
  // Execute both nested frames, the 180ms timeout, and runAfterInteractions.
  for (let index = 0; index < h.frames.length; index += 1) h.frames[index]();
  h.timers.forEach(({ callback }) => callback());
  h.interactions.forEach((callback) => callback());
  return h.mutations;
}
for (const state of ['drag', 'resize', 'ended', 'reopened']) {
  assert.deepEqual(runRecoveryScenario(null, state), [], `Recovery must preserve ${state}.`);
}
assert.equal(runRecoveryScenario(null, 'ordinary').filter((item) => item === 'restore-scroll').length, 3);
assert(runRecoveryScenario('recovery').includes('restore-scroll'), 'Negative control: old recovery unlocks a newer interaction.');
for (const [disableGuard, callback] of [['dismiss', 'onDismiss'], ['draft', 'draftEffect']]) {
  const { context, mutations } = createHarness({ realLifecycle: true, disableGuard });
  context.quickSlotClosingInteractionGenerationRef.current = 0;
  context.weekInteractionGenerationRef.current = 1;
  context[callback]();
  assert(mutations.includes('release-parent'), `Negative control: old ${callback} unlocks a newer ended interaction.`);
}

// Integrate the independent native lifecycle callbacks in one delivery sequence.
for (const changed of [false, true]) {
  const h = createHarness({ realLifecycle: true });
  h.context.close();
  h.frames[0]();
  const afterOuter = h.mutations.length;
  if (changed) h.context.weekInteractionGenerationRef.current += 1;
  // The new gesture has already ended, but its confirmation/locks still belong
  // to it; null source refs must not let any old cleanup bypass the generation.
  for (let index = 1; index < h.frames.length; index += 1) h.frames[index]();
  h.context.draftEffect();
  h.context.onDismiss();
  h.timers.forEach(({ callback }) => callback());
  h.interactions.forEach((callback) => callback());
  const later = h.mutations.slice(afterOuter);
  if (changed) {
    assert(!later.includes('release-parent'));
    assert(!later.includes('restore-scroll'));
    assert(!later.includes('unlock-parent'));
    assert(!later.includes('stop-scroll'));
  } else {
    assert(later.includes('release-parent'));
    assert(later.includes('restore-scroll'));
    assert(later.includes('reset-draft'));
  }
}

console.log('Quick-slot close: paint-first dismiss and normal cleanup preserved; close frames, timers, native dismiss, scroll recovery and draft effect preserve new/ended gestures and reopened popup. Negative controls reproduce the removed bypasses.');
