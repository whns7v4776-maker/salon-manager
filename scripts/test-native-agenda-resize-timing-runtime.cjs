/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the production projections and handlers with persistence/React mocked
// only at their boundaries. A move bridge may outlive a later resize.
const root = path.resolve(__dirname, '..');
const sourceArg = process.argv.indexOf('--source');
const sourcePath = sourceArg >= 0 ? path.resolve(process.argv[sourceArg + 1])
  : path.join(root, 'app', '(tabs)', 'agenda.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const effects = [];
const walk = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    declarations.set(node.name.text, node);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'useLayoutEffect') effects.push(node.arguments[0]);
  ts.forEachChild(node, walk);
};
walk(tree);
const callback = name => {
  const initializer = declarations.get(name)?.initializer;
  assert.ok(initializer && ts.isCallExpression(initializer), `Missing production hook ${name}`);
  return initializer.arguments[0].getText(tree);
};
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const evaluate = (ctx, code) => vm.runInContext(transpile(code), ctx);
const noop = () => undefined;
const original = { id: 'single-a', data: '2026-10-13', ora: '09:00',
  durataMinuti: 60, cliente: 'Runtime demo', servizio: 'Taglio',
  operatoreId: 'alex', operatoreNome: 'Alex' };
const moved = { ...original, ora: '09:30', operatoreId: 'gabriele', operatoreNome: 'Gabriele' };

function runtime() {
  const ctx = vm.createContext({
    IS_WEB: false, IS_IOS: false, todayDate: original.data,
    WEEK_DRAG_EDGE_CONTACT_INSET: 1,
    normalizeServicePhaseConfig: value => value ?? null,
    normalizeServicePhaseOperatorAssignments: value => value ?? null,
    normalizeAgendaLaneOperatorLabelKey: value => String(value ?? '').trim().toLowerCase(),
    getServicePhaseOperator: ({ assignments, phase, fallbackId, fallbackName }) =>
      ({ ...(assignments?.[phase] ?? { id: fallbackId, name: fallbackName }) }),
    getTodayDateString: () => original.data,
    getWeekOperatorLaneKey: appointment => `operator-id:${appointment.operatoreId}`,
    appointmentsWithReorganizationDraft: [{ ...moved }],
    appointmentsWithResizeVisualPreview: [],
    weekAppointmentResizeVisualPreview: {},
    weekAppointmentResizeVisualPreviewRef: { current: {} },
    weekAppointmentLatestVisualTimingByIdRef: { current: new Map() },
    pendingMovedWeekOptimisticAppointmentsRef: { current: new Map([[moved.id,
      { appointment: { ...moved }, timestamp: Date.now() }]]) },
    prunePendingMovedWeekSlotVisualKeys: noop,
    isMovedWeekAppointmentOldSnapshot: () => false,
    blockingAppointmentsByDate: {}, weekClearedSlotSettleEpoch: 0, weekTimeSlots: [],
    weekReorganizationDraft: null, weekReorganizationDraftRef: { current: null },
    weekAppointmentDurationSavingId: null,
    weekAppointmentResizePendingIdsRef: { current: new Set() },
    salonWorkspace: { salonCode: 'runtime-test' },
    haptic: { success: () => Promise.resolve(), error: () => Promise.resolve(), medium: () => Promise.resolve() },
    Alert: { alert: noop }, presentWeekInteractionConfirmation: noop,
    setWeekReorganizationDraft: updater => updater(null),
    setWeekAppointmentDurationSavingId: value => {
      ctx.weekAppointmentDurationSavingId = typeof value === 'function'
        ? value(ctx.weekAppointmentDurationSavingId) : value;
    },
    setWeekAppointmentResizeVisualPreview: value => {
      ctx.weekAppointmentResizeVisualPreview = typeof value === 'function'
        ? value(ctx.weekAppointmentResizeVisualPreview) : value;
    },
    shortenedRpcCalls: [],
    shortenOwnerAppointmentDurationForSalon: async args => {
      ctx.shortenedRpcCalls.push(args);
      ctx.appointmentsWithReorganizationDraft = ctx.appointmentsWithReorganizationDraft.map(item =>
        item.id === args.appointmentId ? { ...item, durataMinuti: args.nextDurationMinutes } : item);
      return { ok: true };
    },
    effectiveWeekOperatorLaneLayoutByDate: {},
    weekInteractionGenerationRef: { current: 0 }, weekResizeSourceRef: { current: null },
    weekResizeTranslationYRef: { current: 0 }, weekResizeLastPointerYRef: { current: null },
    weekDragAutoScrollCompensationX: { value: 0 }, weekDragAutoScrollCompensationY: { value: 0 },
    weekDragOriginalPlacementRef: { current: null }, weekDragSourceRef: { current: null },
    weekDragLastTargetKeyRef: { current: '' }, weekDragPreviewRef: { current: null },
    weekDragGrabOffsetYRef: { current: 0 }, weekDragStartAgendaScrollYRef: { current: 0 },
    weekDragStartHorizontalScrollXRef: { current: 0 }, agendaVerticalScrollPosRef: { current: 0 },
    weekHorizontalScrollPosRef: { current: 0 }, weekDragStartPointerXRef: { current: 0 },
    weekDragStartPointerYRef: { current: 0 }, weekDragAutoScrollingRef: { current: false },
    startNativeWeekAutoScrollRef: { current: noop }, weekDragStartCardRectRef: { current: null },
    weekDragLastPointerRef: { current: null },
    getWeekAppointmentTemporalState: () => 'future', updateWeekPlannerTableOrigin: noop,
    setWeekAppointmentResizeActiveKey: noop, setWebWeekDragConfirmation: noop,
    hideNativeWeekDropPreview: noop, setWeekAppointmentDragActive: noop,
    setWeekManualAcceptChoiceOpen: noop, setWeekManualAcceptDurationOpen: noop,
    setWeekPhasedTimePickerTarget: noop, setWeekPhasedTimeEditor: noop,
    setWeekAppointmentDetails: noop, showNativeWeekDropPreview: noop, setWeekSwapPreview: noop,
    resolveWeekDragTarget: appointment => { ctx.targetInput = appointment; return null; },
    appuntamenti: [{ ...moved }], capturedOptimistic: [], movedRpcCalls: [],
    registerMovedAppointmentOldSlotGuard: () => new Set(),
    clearMovedAppointmentOldSlotGuard: noop,
    clearMovedAppointmentOptimisticPosition: noop,
    registerMovedAppointmentOptimisticPosition: (appointment, lane) => {
      ctx.capturedOptimistic.push({ appointment, lane });
    },
    stageNativeWeekDragReleaseCommit: noop,
    isAgendaAppointmentRecentlySuppressedDeleted: () => false,
    setAppuntamenti: updater => { ctx.appuntamenti = updater(ctx.appuntamenti); },
    moveOwnerAppointmentForSalon: async args => { ctx.movedRpcCalls.push(args); return { ok: true }; },
  });
  evaluate(ctx, `globalThis.buildNativeWeekPreviewAppointmentKey = ${declarations.get('buildNativeWeekPreviewAppointmentKey').initializer.getText(tree)};`);
  for (const name of ['stageWeekAppointmentResizeVisualPreview', 'clearWeekAppointmentResizeVisualPreview',
    'appointmentsWithResizeVisualPreview', 'weekRenderAppointmentsByDate',
    'saveWeekAppointmentResizeDuration', 'beginWeekAppointmentDragLatest', 'runWeekSwap']) {
    const exportName = name === 'appointmentsWithResizeVisualPreview' ? 'projectResize'
      : name === 'weekRenderAppointmentsByDate' ? 'projectRender' : name;
    evaluate(ctx, `globalThis.${exportName} = ${callback(name)};`);
  }
  if (declarations.has('resolveWeekAppointmentResizeVisualTiming')) {
    evaluate(ctx, `globalThis.resolveWeekAppointmentResizeVisualTiming = ${callback('resolveWeekAppointmentResizeVisualTiming')};`);
  } else {
    ctx.resolveWeekAppointmentResizeVisualTiming = value => value;
  }
  const timingEffect = effects.find(effect => effect?.getText(tree)
    .includes('weekAppointmentLatestVisualTimingByIdRef.current = new Map'));
  if (timingEffect) evaluate(ctx, `globalThis.commitTiming = ${timingEffect.getText(tree)};`);
  else ctx.commitTiming = noop;
  const render = () => {
    ctx.appointmentsWithResizeVisualPreview = ctx.projectResize();
    ctx.commitTiming();
    ctx.blockingAppointmentsByDate = { [original.data]: ctx.appointmentsWithResizeVisualPreview };
    return ctx.projectRender()[original.data];
  };
  return { ctx, render };
}

const checks = [];
async function check(name, run) {
  try { await run(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}

(async () => {
  for (const duration of [30, 75]) {
    await check(`move bridge keeps position while preview changes 60 to ${duration}`, () => {
      const { ctx, render } = runtime();
      ctx.stageWeekAppointmentResizeVisualPreview(moved, duration);
      const row = render()[0];
      assert.equal(row.durataMinuti, duration);
      assert.equal(row.ora, moved.ora);
      assert.equal(row.data, moved.data);
      assert.equal(row.operatoreId, moved.operatoreId);
      assert.equal(ctx.pendingMovedWeekOptimisticAppointmentsRef.current.get(moved.id).appointment.durataMinuti, 60,
        'The test must preserve the old cache record instead of silently rewriting it');
    });
  }
  await check('canonical duration remains current after preview clears within the move TTL', async () => {
    const { ctx, render } = runtime();
    await ctx.saveWeekAppointmentResizeDuration(moved, 30, false, false, false);
    ctx.clearWeekAppointmentResizeVisualPreview(moved.id);
    assert.equal(render()[0].durataMinuti, 30);
    assert.equal(ctx.shortenedRpcCalls.length, 1);
    assert.equal(ctx.pendingMovedWeekOptimisticAppointmentsRef.current.get(moved.id).appointment.durataMinuti, 60);
  });
  await check('a true persistence failure removes only preview and restores original duration', async () => {
    const { ctx, render } = runtime();
    ctx.shortenOwnerAppointmentDurationForSalon = async args => {
      ctx.shortenedRpcCalls.push(args); return { ok: false, errorCode: 'save_failed' };
    };
    await ctx.saveWeekAppointmentResizeDuration(moved, 30, false, false, false);
    assert.equal(render()[0].durataMinuti, 60);
    assert.equal(ctx.weekAppointmentResizeVisualPreviewRef.current[moved.id], undefined);
    assert.equal(ctx.shortenedRpcCalls.length, 1);
  });
  await check('cancelling preview makes an immediate pickup use canonical timing before another render', () => {
    const { ctx, render } = runtime();
    ctx.stageWeekAppointmentResizeVisualPreview(moved, 30);
    assert.equal(render()[0].durataMinuti, 30);
    ctx.clearWeekAppointmentResizeVisualPreview(moved.id);
    const row = ctx.resolveWeekAppointmentResizeVisualTiming({ ...moved, durataMinuti: 30 });
    assert.equal(row.durataMinuti, 60);
    assert.equal(row.ora, moved.ora);
    assert.equal(row.operatoreId, moved.operatoreId);
  });
  await check('immediate pickup from a stale cell forwards the new temporal input', () => {
    const { ctx } = runtime();
    ctx.stageWeekAppointmentResizeVisualPreview(moved, 30);
    ctx.beginWeekAppointmentDragLatest({ ...moved }, 180, 240, 12, 'operator-id:gabriele', 100, 46, 20, '09:30');
    assert.equal(ctx.weekDragSourceRef.current.durataMinuti, 30);
    assert.equal(ctx.targetInput.durataMinuti, 30);
    assert.equal(ctx.weekDragSourceRef.current.ora, moved.ora);
    assert.equal(ctx.weekDragSourceRef.current.operatoreId, moved.operatoreId);
  });
  await check('stale canonical direct move carries current duration with the identical target and one RPC', async () => {
    const { ctx } = runtime();
    ctx.stageWeekAppointmentResizeVisualPreview(moved, 30);
    await ctx.runWeekSwap({ sourceAppointment: { ...moved }, targetDate: moved.data,
      targetTime: '10:00', targetLaneKey: 'operator-id:sofia', targetOperatorId: 'sofia',
      targetOperatorName: 'Sofia', phaseScope: 'whole', hasOverlap: false });
    const row = ctx.capturedOptimistic[0].appointment;
    assert.equal(row.durataMinuti, 30);
    assert.equal(row.ora, '10:00');
    assert.equal(row.data, moved.data);
    assert.equal(row.operatoreId, 'sofia');
    assert.equal(ctx.capturedOptimistic[0].lane, 'operator-id:sofia');
    assert.equal(ctx.movedRpcCalls.length, 1);
    assert.equal(ctx.movedRpcCalls[0].nextTime, '10:00');
    assert.equal(ctx.movedRpcCalls[0].nextOperatorId, 'sofia');
  });
  await check('a move failure after successful resize restores original position without undoing duration30', async () => {
    const { ctx, render } = runtime();
    ctx.stageWeekAppointmentResizeVisualPreview(moved, 30);
    const unrelated = { ...original, id: 'unrelated', ora: '12:00', durataMinuti: 20, note: 'changed during move' };
    ctx.moveOwnerAppointmentForSalon = async args => {
      ctx.movedRpcCalls.push(args);
      ctx.appointmentsWithReorganizationDraft = [{ ...moved, durataMinuti: 30 }];
      ctx.clearWeekAppointmentResizeVisualPreview(moved.id);
      render();
      ctx.appuntamenti.push(unrelated);
      return { ok: false, errorCode: 'operator_overlap' };
    };
    await ctx.runWeekSwap({ sourceAppointment: { ...moved }, targetDate: moved.data,
      targetTime: '10:00', targetLaneKey: 'operator-id:sofia', targetOperatorId: 'sofia',
      targetOperatorName: 'Sofia', phaseScope: 'whole', hasOverlap: false });
    const row = ctx.appuntamenti.find(item => item.id === moved.id);
    assert.equal(row.durataMinuti, 30);
    assert.equal(row.ora, moved.ora);
    assert.equal(row.operatoreId, moved.operatoreId);
    assert.equal(ctx.movedRpcCalls.length, 1);
    assert.equal(ctx.appuntamenti.find(item => item.id === unrelated.id), unrelated,
      'Unrelated realtime updates retain their own object and data during rollback');
  });
  await check('an unsaved resize abort restores original60 even if its preview has not cleared yet and avoids a duplicate alert', async () => {
    const { ctx } = runtime();
    ctx.stageWeekAppointmentResizeVisualPreview(moved, 30);
    let alerts = 0;
    ctx.Alert.alert = () => { alerts++; };
    ctx.moveOwnerAppointmentForSalon = async args => {
      ctx.movedRpcCalls.push(args);
      return { ok: false, errorCode: 'duration_not_saved' };
    };
    await ctx.runWeekSwap({ sourceAppointment: { ...moved }, targetDate: moved.data,
      targetTime: '10:00', targetLaneKey: 'operator-id:sofia', targetOperatorId: 'sofia',
      targetOperatorName: 'Sofia', phaseScope: 'whole', hasOverlap: false });
    const row = ctx.appuntamenti.find(item => item.id === moved.id);
    assert.equal(row.durataMinuti, 60);
    assert.equal(row.ora, moved.ora);
    assert.equal(row.operatoreId, moved.operatoreId);
    assert.equal(alerts, 0);
  });
  await check('latest canonical timing also corrects a stale pickup without an active preview', () => {
    const { ctx, render } = runtime();
    ctx.appointmentsWithReorganizationDraft = [{ ...moved, durataMinuti: 30 }];
    render();
    const row = ctx.resolveWeekAppointmentResizeVisualTiming({ ...moved });
    assert.equal(row.durataMinuti, 30);
    assert.equal(row.ora, moved.ora);
    assert.equal(row.operatoreId, moved.operatoreId);
  });
  for (const scope of ['draft', 'linked', 'phased']) {
    await check(`${scope} pickup input preserves its original object and temporal rules`, () => {
      const { ctx } = runtime();
      const row = { ...moved };
      if (scope === 'draft') ctx.weekReorganizationDraftRef.current = { appointments: [row] };
      if (scope === 'linked') row.appointmentGroupId = 'group-a';
      if (scope === 'phased') row.phaseConfig = { initialDurationMinutes: 20, processingDurationMinutes: 20, finalDurationMinutes: 20 };
      ctx.stageWeekAppointmentResizeVisualPreview(row, 30);
      assert.equal(ctx.resolveWeekAppointmentResizeVisualTiming(row), row);
    });
  }
  await check('a move without resize preserves all position and phase assignments', () => {
    const { ctx, render } = runtime();
    const assignments = { initial: { id: 'gabriele' }, final: { id: 'sofia' } };
    ctx.pendingMovedWeekOptimisticAppointmentsRef.current.get(moved.id).appointment.phaseOperatorAssignments = assignments;
    const row = render()[0];
    assert.equal(row.durataMinuti, 60);
    assert.equal(row.ora, moved.ora);
    assert.equal(row.operatoreId, moved.operatoreId);
    assert.equal(row.phaseOperatorAssignments, assignments);
  });
  const result = { source: sourcePath, total: checks.length,
    passed: checks.filter(item => item.passed).length, checks };
  console.log(JSON.stringify(result, null, 2));
  if (result.passed !== result.total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
