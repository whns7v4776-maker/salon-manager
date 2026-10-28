const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const tree = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'shortenOwnerAppointmentDurationForSalon') declaration = node.getText(tree);
  ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(declaration, 'Extract the actual production resize callback');
const code = ts.transpileModule(`globalThis.resize = ${declaration.slice(declaration.indexOf('=') + 1)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const original = { id: 'appointment-a', data: '2026-10-13', ora: '09:00', cliente: 'Demo', servizio: 'Taglio', durataMinuti: 60 };
const args = { salonCode: 'demo', appointmentId: original.id, appointmentDate: original.data, appointmentTime: original.ora, customerName: original.cliente, serviceName: original.servizio, nextDurationMinutes: 30 };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ rpcError = null, waitlist = async () => undefined } = {}) {
  const context = {
    console: { log: () => undefined },
    normalizeSalonCode: value => String(value).trim(),
    salonWorkspace: { salonCode: 'demo', id: 'workspace' },
    salonWorkspaceRef: { current: { salonCode: 'demo', id: 'workspace' } },
    clienti: [], servizi: [], operatori: [],
    appuntamentiRef: { current: [{ ...original }] },
    richiestePrenotazioneRef: { current: [] }, availabilitySettingsRef: { current: {} },
    ownerAppointmentMutationRevisionRef: { current: 0 },
    pendingOwnerAppointmentMoveSnapshotsRef: { current: new Map() },
    pendingOwnerSingleAppointmentResizeCommitsRef: { current: new Map() },
    normalizeServicePhaseConfig: value => value ?? null,
    getTodayDateString: () => original.data,
    normalizeIdentityText: value => String(value || '').trim().toLowerCase(),
    normalizeTimeIdentity: value => String(value || ''),
    ensureRealtimeOwnerSession: async () => ({ ok: true, email: 'owner@example.test' }),
    invokeRpcWithSchemaRetry: async (...values) => { context.rpcCalls.push(values); return { data: { bookingRequestId: null }, error: rpcError }; },
    isNamedRpcUnavailableError: () => false,
    normalizeAppuntamenti: value => value,
    normalizeRichiestePrenotazione: value => value,
    markRecentlyMovedAppointmentSnapshot: value => { context.guard = value; },
    filterRecentlyDeletedAppointments: value => value,
    setAppuntamenti: value => { context.state = typeof value === 'function' ? value(context.appuntamentiRef.current) : value; },
    setRichiestePrenotazione: value => { context.requests = value; },
    processPublicSlotWaitlistAndFlush: async (...values) => { context.waitlistCalls++; return waitlist(...values); },
    shouldSilenceTransientSyncError: () => false,
    matchesCustomerDisplayName: () => false,
    waitlistCalls: 0,
    rpcCalls: [],
    updateOwnerFinancialAppointmentsForWorkspace: () => undefined,
    replaceOwnerFinancialAppointmentsForWorkspace: () => undefined,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

(async () => {
  const checks = [];
  async function test(name, run) {
    try { await run(); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false, error: error.message }); }
  }

  await test('Successful shortening stays successful when the waitlist transport rejects', async () => {
    const context = setup({ waitlist: async () => { throw new Error('waitlist transport unavailable'); } });
    const result = await context.resize(args);
    await tick();
    assert.equal(context.state[0].durataMinuti, 30, 'RPC success commits target duration');
    assert.equal(context.guard.durataMinuti, 30, 'A stale refresh is guarded by the canonical target');
    assert.equal(result.ok, true, 'A secondary waitlist error cannot authorize an Agenda preview rollback');
    assert.equal(context.waitlistCalls, 1, 'Freed-slot processing is preserved');
  });

  await test('A stalled secondary waitlist does not stall a committed resize', async () => {
    let releaseWaitlist;
    const context = setup({ waitlist: () => new Promise(resolve => { releaseWaitlist = resolve; }) });
    let settled = false;
    const resultPromise = context.resize(args).then(result => { settled = true; return result; });
    await tick();
    const settledBeforeSideEffect = settled;
    releaseWaitlist();
    const result = await resultPromise;
    assert.equal(context.state[0].durataMinuti, 30);
    assert.equal(result.ok, true);
    assert.equal(settledBeforeSideEffect, true, 'The UI can settle immediately after primary persistence');
  });

  await test('A true operator conflict remains an error without committing the target', async () => {
    const context = setup({ rpcError: { message: 'target_slot_occupied' } });
    const result = await context.resize(args);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'operator_overlap');
    assert.equal(context.state, undefined);
    assert.equal(context.waitlistCalls, 0);
  });

  await test('An extension preserves success and never emits a freed-slot waitlist action', async () => {
    const context = setup();
    const result = await context.resize({ ...args, nextDurationMinutes: 75 });
    assert.equal(result.ok, true);
    assert.equal(context.state[0].durataMinuti, 75);
    assert.equal(context.waitlistCalls, 0);
  });

  await test('Shortening preserves the exact primary RPC and frees the original day once', async () => {
    let waitlistPayload;
    const context = setup({ waitlist: async payload => { waitlistPayload = payload; return true; } });
    const result = await context.resize({ ...args, allowOperatorOverlap: true, allowCustomerOverlap: true });
    await tick();
    assert.equal(result.ok, true);
    assert.equal(context.rpcCalls.length, 1);
    assert.equal(context.rpcCalls[0][0], 'resize_owner_appointment_duration_v3');
    assert.equal(context.rpcCalls[0][1].p_appointment_id, original.id);
    assert.equal(context.rpcCalls[0][1].p_next_duration_minutes, 30);
    assert.equal(context.rpcCalls[0][1].p_allow_operator_overlap, true);
    assert.equal(context.rpcCalls[0][1].p_allow_customer_overlap, true);
    assert.equal(context.waitlistCalls, 1);
    assert.equal(waitlistPayload.scope, 'day');
    assert.equal(waitlistPayload.appointmentDate, original.data);
    assert.equal(waitlistPayload.appointmentTime, original.ora);
  });

  await test('No-op duration neither persists nor schedules a waitlist', async () => {
    const context = setup();
    const result = await context.resize({ ...args, nextDurationMinutes: original.durataMinuti });
    assert.equal(result.ok, true);
    assert.equal(context.rpcCalls.length, 0);
    assert.equal(context.waitlistCalls, 0);
    assert.equal(context.state, undefined);
  });
  console.log(JSON.stringify({ allPassed: checks.every(check => check.passed), checks }, null, 2));
  if (checks.some(check => !check.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
