/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourceArg = process.argv.indexOf('--source');
const sourcePath = sourceArg >= 0 ? path.resolve(process.argv[sourceArg + 1])
  : path.join(root, 'src/context/AppContext.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const walk = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
  ts.forEachChild(node, walk);
};
walk(tree);
const callback = name => {
  const initializer = declarations.get(name)?.initializer;
  assert.ok(initializer, `Extract actual production callback ${name}`);
  return initializer.getText(tree);
};
const executable = ts.transpileModule(`globalThis.resize = ${callback('shortenOwnerAppointmentDurationForSalon')};
  globalThis.move = ${callback('moveOwnerAppointmentForSalon')};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const original = { id: 'single-a', data: '2026-10-13', ora: '09:00',
  durataMinuti: 60, cliente: 'Demo', servizio: 'Taglio', operatoreId: 'alex', operatoreNome: 'Alex' };
const resizeArgs = { salonCode: 'demo', appointmentId: original.id,
  appointmentDate: original.data, appointmentTime: original.ora,
  customerName: original.cliente, serviceName: original.servizio, nextDurationMinutes: 30 };
const moveArgs = { salonCode: 'demo', appointmentId: original.id,
  currentDate: original.data, currentTime: original.ora,
  nextDate: original.data, nextTime: '09:30', nextOperatorId: 'gabriele', nextOperatorName: 'Gabriele',
  enforceCustomerOverlap: true, customerName: original.cliente, serviceName: original.servizio };

function runtime({ resizeError, resizeThrows, sessionGate, sourceAppointment = original, stalledWaitlist = false, bookingRequestId } = {}) {
  const resizeGate = deferred();
  const database = new Map([[sourceAppointment.id, { ...sourceAppointment }]]);
  const identity = value => String(value ?? '').trim().toLowerCase();
  let firstSession = true;
  const context = {
    console: { log: (...args) => context.logs.push(args.map(String).join(' ')) },
    logs: [], calls: [], snapshots: [], database, resizeGate,
    normalizeSalonCode: identity, normalizeIdentityText: identity,
    normalizeTimeIdentity: value => String(value ?? '').slice(0, 5),
    salonWorkspace: { id: 'workspace-demo', salonCode: 'demo' },
    salonWorkspaceRef: { current: { id: 'workspace-demo', salonCode: 'demo' } },
    appuntamentiRef: { current: [{ ...sourceAppointment }] },
    richiestePrenotazioneRef: { current: [] }, availabilitySettingsRef: { current: {} },
    pendingOwnerSingleAppointmentResizeCommitsRef: { current: new Map() },
    pendingOwnerAppointmentMoveSnapshotsRef: { current: new Map() },
    ownerAppointmentMutationRevisionRef: { current: 0 },
    clienti: [], servizi: [], operatori: [],
    getTodayDateString: () => original.data,
    normalizeServicePhaseConfig: value => value ?? null,
    normalizeServicePhaseOperatorAssignments: value => value ?? null,
    normalizeServicePhaseOverlapOverrides: value => value ?? null,
    normalizeAppuntamenti: value => value, normalizeRichiestePrenotazione: value => value,
    filterRecentlyDeletedAppointments: value => value,
    markRecentlyMovedAppointmentSnapshot: value => context.snapshots.push({ ...value }),
    replaceOwnerFinancialAppointmentsForWorkspace: () => undefined,
    setAppuntamenti: value => { context.state = typeof value === 'function' ? value(context.appuntamentiRef.current) : value; },
    setRichiestePrenotazione: () => undefined,
    normalizeOwnerAppointmentNotificationRevision: value => String(value ?? ''),
    hasOwnerAppointmentLogicalStartMoved: (before, after) => before !== after,
    resolveOwnerAppointmentLogicalStart: values => values[0]?.ora,
    mergeRichiesteCollections: (left, right) => [...left, ...right],
    matchesCustomerDisplayName: () => false,
    checkMovedCustomerNotification: async () => undefined,
    enqueuePortalPublish: async () => 'workspace-demo',
    flushQueuedPushNotifications: async () => undefined,
    shouldSilenceTransientSyncError: () => false,
    isNamedRpcUnavailableError: () => false,
    ensureRealtimeOwnerSession: async () => {
      if (firstSession && sessionGate) { firstSession = false; await sessionGate.promise; }
      return { ok: true, email: 'owner@example.test' };
    },
    processPublicSlotWaitlistAndFlush: () => stalledWaitlist ? new Promise(() => undefined) : Promise.resolve(),
    invokeRpcWithSchemaRetry: async (name, params) => {
      context.calls.push({ name, params: { ...params } });
      if (name.startsWith('resize_')) {
        await resizeGate.promise;
        if (resizeThrows) throw new Error('resize transport failure');
        if (resizeError) return { data: null, error: { message: resizeError } };
        const row = database.get(params.p_appointment_id);
        row.durataMinuti = params.p_next_duration_minutes;
        return { data: { nextDurationMinutes: row.durataMinuti, bookingRequestId }, error: null };
      }
      const row = database.get(params.p_appointment_id);
      // Match the actual positional move contract: it validates the duration
      // currently persisted in the server row, not an uncommitted visual preview.
      if (row.durataMinuti > 30 && params.p_next_initial_operator_id === 'gabriele') {
        return { data: null, error: { message: 'owner_operator_overlap' } };
      }
      row.ora = params.p_next_appointment_time;
      row.data = params.p_next_appointment_date;
      row.operatoreId = params.p_next_initial_operator_id;
      row.operatoreNome = params.p_next_initial_operator_name;
      return { data: { duration_minutes: row.durataMinuti, updated_at: '2026-10-10T10:00:00Z' }, error: null };
    },
  };
  vm.createContext(context);
  vm.runInContext(executable, context);
  return context;
}
const moveCallCount = context => context.calls.filter(call => call.name.startsWith('move_')).length;

(async () => {
  const checks = [];
  async function test(name, run) {
    let timeout;
    try {
      await Promise.race([
        run(),
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Production callbacks did not settle within the test deadline')), 1500);
        }),
      ]);
      checks.push({ name, passed: true });
    }
    catch (error) { checks.push({ name, passed: false, error: error.message }); }
    finally { clearTimeout(timeout); }
  }
  await test('Immediate move waits for committed shortening before validating a 30-minute hole', async () => {
    const context = runtime();
    const shortening = context.resize(resizeArgs);
    await tick();
    const moving = context.move(moveArgs);
    await tick();
    const callsBeforeCommit = moveCallCount(context);
    context.resizeGate.resolve();
    const [resized, moved] = await Promise.all([shortening, moving]);
    assert.equal(callsBeforeCommit, 0, 'A move RPC must not read server duration60 while resize30 is pending');
    assert.equal(resized.ok, true);
    assert.equal(moved.ok, true);
    assert.equal(context.state[0].durataMinuti, 30);
    assert.equal(context.state[0].ora, '09:30');
    assert.equal(context.database.get(original.id).durataMinuti, 30);
    assert.equal(context.database.get(original.id).ora, '09:30');
    assert.equal(moveCallCount(context), 1);
    assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.size, 0);
    const movePayload = context.calls.find(call => call.name.startsWith('move_')).params;
    assert.deepEqual(Object.keys(movePayload).sort(), [
      'p_appointment_id', 'p_next_appointment_date', 'p_next_appointment_time',
      'p_next_initial_operator_id', 'p_next_initial_operator_name',
      'p_next_final_operator_id', 'p_next_final_operator_name', 'p_scope',
      'p_allow_overlap', 'p_allow_customer_overlap',
    ].sort(), 'The existing positional RPC payload stays unchanged');
  });
  await test('The same-id barrier exists before a delayed owner session', async () => {
    const sessionGate = deferred();
    const context = runtime({ sessionGate });
    const shortening = context.resize(resizeArgs);
    const moving = context.move(moveArgs);
    await tick();
    const callsBeforeSession = moveCallCount(context);
    sessionGate.resolve();
    context.resizeGate.resolve();
    const [resized, moved] = await Promise.all([shortening, moving]);
    assert.equal(callsBeforeSession, 0);
    assert.equal(resized.ok, true);
    assert.equal(moved.ok, true);
  });
  for (const failure of ['server rejection', 'transport throw']) {
    await test(`A ${failure} releases the barrier without persisting a move based on an unsaved duration`, async () => {
      const context = runtime(failure === 'server rejection'
        ? { resizeError: 'target_slot_occupied' } : { resizeThrows: true });
      const shortening = context.resize(resizeArgs);
      await tick();
      const moving = context.move(moveArgs);
      context.resizeGate.resolve();
      const [resized, moved] = await Promise.all([shortening, moving]);
      assert.equal(resized.ok, false);
      assert.equal(moved.ok, false);
      assert.equal(moved.errorCode, 'duration_not_saved');
      assert.equal(moveCallCount(context), 0);
      assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.size, 0);
      assert.equal(context.database.get(original.id).durataMinuti, 60);
    });
  }
  await test('Another appointment can move while the first resize is pending', async () => {
    const context = runtime();
    const other = { ...original, id: 'single-b', durataMinuti: 20, cliente: 'Other' };
    context.appuntamentiRef.current.push(other);
    context.database.set(other.id, { ...other });
    const shortening = context.resize(resizeArgs);
    await tick();
    const moved = await context.move({ ...moveArgs, appointmentId: other.id, customerName: other.cliente });
    context.resizeGate.resolve();
    await shortening;
    assert.equal(moved.ok, true);
    assert.equal(moveCallCount(context), 1);
  });
  await test('A duration no-op registers no pending persistence', async () => {
    const context = runtime();
    const result = await context.resize({ ...resizeArgs, nextDurationMinutes: 60 });
    assert.equal(result.ok, true);
    assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.size, 0);
    assert.equal(context.calls.length, 0);
  });
  await test('The resize commit preserves current placement, other rows and request edits made while RPC is pending', async () => {
    const context = runtime({ bookingRequestId: 'request-a' });
    context.richiestePrenotazioneRef.current = [{ id: 'request-a', durataMinuti: 60, note: 'before' }];
    const shortening = context.resize(resizeArgs);
    await tick();
    context.appuntamentiRef.current = [
      { ...original, ora: '09:30', operatoreId: 'gabriele', operatoreNome: 'Gabriele' },
      { ...original, id: 'other-row', ora: '12:00', durataMinuti: 40 },
    ];
    context.richiestePrenotazioneRef.current = [
      { id: 'request-a', durataMinuti: 60, note: 'edited while saving', viewedByCliente: true },
      { id: 'other-request', durataMinuti: 20, note: 'new request' },
    ];
    context.resizeGate.resolve();
    const result = await shortening;
    assert.equal(result.ok, true);
    assert.equal(context.appuntamentiRef.current.length, 2);
    assert.equal(context.appuntamentiRef.current[0].ora, '09:30');
    assert.equal(context.appuntamentiRef.current[0].operatoreId, 'gabriele');
    assert.equal(context.appuntamentiRef.current[0].durataMinuti, 30);
    assert.equal(context.appuntamentiRef.current[1].ora, '12:00');
    assert.equal(context.snapshots.at(-1).ora, '09:30', 'The realtime protection uses the same current placement');
    assert.equal(context.snapshots.at(-1).durataMinuti, 30);
    assert.equal(context.richiestePrenotazioneRef.current[0].note, 'edited while saving');
    assert.equal(context.richiestePrenotazioneRef.current[0].viewedByCliente, true);
    assert.equal(context.richiestePrenotazioneRef.current[0].durataMinuti, 30);
    assert.equal(context.richiestePrenotazioneRef.current[1].note, 'new request');
  });
  for (const kind of ['linked', 'phased']) {
    await test(`${kind} persistence retains its existing independent behavior`, async () => {
      const sourceAppointment = kind === 'linked'
        ? { ...original, appointmentGroupId: 'group-a', appointmentGroupSize: 2 }
        : { ...original, phaseConfig: { initialDurationMinutes: 20, processingDurationMinutes: 20, finalDurationMinutes: 20 } };
      const context = runtime({ sourceAppointment });
      const shortening = context.resize(resizeArgs);
      await tick();
      const moving = context.move(moveArgs);
      await tick();
      const callsBeforeCommit = moveCallCount(context);
      const pendingBeforeCommit = context.pendingOwnerSingleAppointmentResizeCommitsRef.current.size;
      context.resizeGate.resolve();
      await Promise.all([shortening, moving]);
      assert.equal(pendingBeforeCommit, 0);
      assert.equal(callsBeforeCommit, 1, 'No new synchronization policy is introduced for groups/phases');
    });
  }
  await test('Changing salon while waiting prevents a move RPC and does not install an old resize into the new salon', async () => {
    const context = runtime();
    const shortening = context.resize(resizeArgs);
    await tick();
    const moving = context.move(moveArgs);
    await tick();
    const newSalonRows = [{ ...original, id: 'new-salon-row' }];
    context.salonWorkspaceRef.current = { id: 'workspace-other', salonCode: 'other' };
    context.appuntamentiRef.current = newSalonRows;
    context.resizeGate.resolve();
    const [resized, moved] = await Promise.all([shortening, moving]);
    assert.equal(resized.ok, false);
    assert.equal(moved.ok, false);
    assert.equal(moveCallCount(context), 0);
    assert.equal(context.appuntamentiRef.current, newSalonRows);
    assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.size, 0);
  });
  await test('A duplicate same-id resize does not replace the barrier or issue another resize RPC', async () => {
    const context = runtime();
    const shortening = context.resize(resizeArgs);
    await tick();
    const barrier = context.pendingOwnerSingleAppointmentResizeCommitsRef.current.get('demo|single-a');
    const duplicate = await context.resize({ ...resizeArgs, nextDurationMinutes: 45 });
    assert.equal(duplicate.ok, false);
    assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.get('demo|single-a'), barrier);
    assert.equal(context.calls.filter(call => call.name.startsWith('resize_')).length, 1);
    context.resizeGate.resolve();
    assert.equal((await shortening).ok, true);
  });
  await test('A duplicate old-duration request cannot be reported as a successful no-op while a different resize is pending', async () => {
    const context = runtime();
    const shortening = context.resize(resizeArgs);
    await tick();
    const duplicate = await context.resize({ ...resizeArgs, nextDurationMinutes: 60 });
    context.resizeGate.resolve();
    assert.equal(duplicate.ok, false);
    assert.equal((await shortening).ok, true);
    assert.equal(context.calls.filter(call => call.name.startsWith('resize_')).length, 1);
  });
  await test('Completing an old resize cannot delete a newer barrier entry', async () => {
    const context = runtime();
    const shortening = context.resize(resizeArgs);
    await tick();
    const ownBarrier = context.pendingOwnerSingleAppointmentResizeCommitsRef.current.get('demo|single-a');
    assert.ok(ownBarrier, 'The production callback registered a barrier');
    const newer = { completion: Promise.resolve(true), resolve: () => undefined };
    context.pendingOwnerSingleAppointmentResizeCommitsRef.current.set('demo|single-a', newer);
    context.resizeGate.resolve();
    assert.equal((await shortening).ok, true);
    assert.equal(await ownBarrier.completion, true);
    assert.equal(context.pendingOwnerSingleAppointmentResizeCommitsRef.current.get('demo|single-a'), newer);
  });
  await test('An equal appointment id in another salon does not wait for this salon barrier', async () => {
    const context = runtime({ sourceAppointment: { ...original, durataMinuti: 20 } });
    context.pendingOwnerSingleAppointmentResizeCommitsRef.current.set('other|single-a', { completion: new Promise(() => undefined), resolve: () => undefined });
    assert.equal((await context.move(moveArgs)).ok, true);
    assert.equal(moveCallCount(context), 1);
  });
  await test('A slow freed-slot notification does not hold an already committed resize or move', async () => {
    const context = runtime({ stalledWaitlist: true });
    const shortening = context.resize(resizeArgs);
    await tick();
    const moving = context.move(moveArgs);
    context.resizeGate.resolve();
    const [resized, moved] = await Promise.all([shortening, moving]);
    assert.equal(resized.ok, true);
    assert.equal(moved.ok, true);
    assert.equal(context.state[0].durataMinuti, 30);
  });
  console.log(JSON.stringify({ source: path.relative(root, sourcePath), allPassed: checks.every(check => check.passed), checks }, null, 2));
  if (checks.some(check => !check.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
