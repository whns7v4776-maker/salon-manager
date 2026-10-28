const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(process.argv[2] || 'src/context/AppContext.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let createNode;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'createOwnerAppointmentForSalon') {
    createNode = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert(createNode, 'Callback di creazione owner non trovata');
const callback = ts.transpileModule(`const create = ${createNode.getText(ast)}; create;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ticks = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const identity = value => String(value ?? '').trim().toLowerCase();

function fixture({ failRpc = false, retry = false, mirror = false } = {}) {
  const push = deferred();
  const rpc = deferred();
  const otherAppointment = { id: 'existing', data: '2026-10-12', ora: '10:00', cliente: 'Altro cliente', servizio: 'Taglio' };
  let appointments = [otherAppointment];
  const pushCalls = [];
  const rpcCalls = [];
  const logs = [];
  const workspace = { id: 'workspace-1', salonCode: 'TEST', ownerEmail: 'owner@example.test' };
  const appointmentsRef = { current: appointments };
  const context = {
    console: { log: (...args) => logs.push(args) }, Date, Math, Set, Map,
    normalizeSalonCode: value => String(value ?? '').trim().toUpperCase(),
    normalizeAccountEmail: identity,
    normalizeIdentityText: identity,
    normalizeTimeIdentity: identity,
    normalizePhoneForIdentity: identity,
    normalizeServicePhaseConfig: value => value || null,
    normalizeStringIdArray: value => value || [],
    normalizeAppuntamenti: value => value,
    normalizeClienti: value => value,
    normalizeRichiestePrenotazione: value => value,
    mergeClientiCollections: (first, second) => [...first, ...second],
    filterRecentlyDeletedAppointments: value => value,
    unmarkRecentlyDeletedAppointment() {}, markRecentlyCreatedAppointment() {},
    getTodayDateString: () => '2026-10-10',
    salonWorkspace: workspace,
    salonWorkspaceRef: { current: workspace }, salonAccountEmail: workspace.ownerEmail,
    servizi: [{ nome: 'Taglio', mestiereRichiesto: 'Barber' }], operatori: [],
    serviziRef: { current: [{ nome: 'Taglio', mestiereRichiesto: 'Barber' }] },
    operatoriRef: { current: [] }, clientiRef: { current: [] },
    appuntamentiRef: appointmentsRef, richiestePrenotazione: [],
    richiestePrenotazioneRef: { current: [] },
    availabilitySettingsRef: { current: {} },
    serviceCardColorOverridesRef: { current: {} }, roleCardColorOverridesRef: { current: {} },
    ownerAppointmentMutationRevisionRef: { current: 0 },
    setAppuntamenti(value) { appointments = typeof value === 'function' ? value(appointments) : value; },
    setClienti() {}, setRichiestePrenotazione() {}, setSalonWorkspace() {},
    ensureRealtimeOwnerSession: async () => ({ ok: true, email: workspace.ownerEmail }),
    invokeCreateOwnerAppointmentRpcCompat: async payload => {
      rpcCalls.push(payload);
      if (retry && rpcCalls.length === 1) return { error: { message: 'workspace_access_denied' } };
      await rpc.promise;
      return failRpc
        ? { error: { message: 'operator_overlap' } }
        : { data: { appointmentId: 'saved-1', workspaceId: workspace.id, bookingRequestId: mirror ? 'request-1' : null } };
    },
    ensureOwnerBackendBootstrap: async () => ({ ok: true }),
    getOwnerAppointmentSaveErrorMessage: error => error.message,
    getOwnerAppointmentSaveErrorCode: error => error.message,
    shouldSilenceTransientSyncError: () => false,
    queueWorkspacePushNotification: payload => { pushCalls.push(payload); return push.promise; },
    flushQueuedPushNotifications: () => { pushCalls.push({ flush: true }); return push.promise; },
    formatPushDateLabel: value => value,
    enqueuePortalPublish: async () => workspace.id,
    matchesCustomerDisplayName: (first, second) => identity(first) === identity(second),
    buildRichiestaMergeKey: value => value.id,
  };
  const create = vm.runInNewContext(callback, context);
  const params = {
    salonCode: 'TEST', dateValue: '2026-10-12', timeValue: '09:00',
    customerName: 'Cliente test', customerPhone: '+390000000000', customerEmail: 'customer@example.test',
    serviceName: 'Taglio', priceValue: 20, durationMinutes: 30,
    createBookingRequest: mirror,
  };
  return { create, params, push, rpc, pushCalls, rpcCalls, logs, get appointments() { return appointments; } };
}

async function verifySuccessfulCreation({ retry = false, mirror = false, rejectPush = false } = {}) {
  const test = fixture({ retry, mirror });
  let result;
  const creation = test.create(test.params).then(value => { result = value; return value; });
  await ticks();
  assert.equal(result, undefined, 'Non confermare prima della RPC');
  assert.equal(test.appointments.filter(item => item.id.startsWith('owner-pending-')).length, 1, 'Una sola anteprima ottimistica');
  assert.equal(test.pushCalls.length, 0, 'Non avviare push prima del salvataggio');
  test.rpc.resolve();
  await ticks();
  assert.equal(test.appointments.filter(item => item.id === 'saved-1').length, 1, 'Un solo appuntamento confermato');
  assert.equal(test.appointments.filter(item => item.id.startsWith('owner-pending-')).length, 0, 'Anteprima sostituita, senza duplicati');
  assert.equal(test.appointments.filter(item => item.id === 'existing').length, 1, 'Appuntamenti già presenti preservati');
  assert.equal(test.pushCalls.length, 1, 'Invio push avviato una sola volta');
  const returnedBeforeDelivery = result?.ok === true;
  if (rejectPush) test.push.reject(new Error('Consegna push lenta o indisponibile'));
  else test.push.resolve(mirror ? undefined : true);
  const completed = await creation;
  await ticks();
  assert.equal(completed.ok, true, 'Un errore push non annulla il commit confermato');
  assert.equal(test.rpcCalls.length, retry ? 2 : 1, 'Nessun nuovo inserimento per consegnare la push');
  assert.equal(test.rpcCalls.at(-1).p_allow_operator_overlap, false, 'Policy conflitti invariata');
  assert.equal(returnedBeforeDelivery, true, 'Prenota Slot deve finire appena la RPC conferma, senza attendere la push');
}

async function verifyRejectedCreation() {
  const test = fixture({ failRpc: true });
  const creation = test.create(test.params);
  await ticks();
  test.rpc.resolve();
  const result = await creation;
  assert.equal(result.ok, false);
  assert.equal(test.appointments.length, 1, 'Errore server rimuove solo l’anteprima');
  assert.equal(test.appointments[0].id, 'existing');
  assert.equal(test.pushCalls.length, 0, 'Nessuna push per salvataggio rifiutato');
}

function verifyPlannerPreparation() {
  const agendaPath = path.resolve('app/(tabs)/agenda.tsx');
  const agendaSource = fs.readFileSync(agendaPath, 'utf8');
  const agendaAst = ts.createSourceFile(agendaPath, agendaSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let holdNode;
  function visitAgenda(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(agendaAst) === 'holdWeekPlannerForQuickBooking') holdNode = node.initializer;
    ts.forEachChild(node, visitAgenda);
  }
  visitAgenda(agendaAst);
  assert(holdNode, 'Uso la condizione reale che congela il planner');
  const evaluate = (IS_WEB, quickSlotDraft, quickBookingSubmitState) => vm.runInNewContext(holdNode.getText(agendaAst), { IS_WEB, quickSlotDraft, quickBookingSubmitState });
  assert.equal(evaluate(false, {}, 'idle'), true, 'Non ricostruire la griglia durante la compilazione');
  assert.equal(evaluate(false, {}, 'sending'), true, 'Attendere conferma del salvataggio');
  assert.equal(evaluate(false, {}, 'sent'), false, 'Preparare l’Agenda confermata prima che il popup si chiuda');
  assert.equal(evaluate(false, null, 'idle'), false, 'Agenda aperta sempre aggiornata');
  assert.equal(evaluate(true, {}, 'idle'), false, 'Web non cambia comportamento');
}

(async () => {
  await verifySuccessfulCreation();
  await verifySuccessfulCreation({ mirror: true });
  await verifySuccessfulCreation({ retry: true });
  await verifySuccessfulCreation({ rejectPush: true });
  await verifyRejectedCreation();
  verifyPlannerPreparation();
  console.log('PASS Prenota Slot: commit immediato dopo RPC, push indipendente, retry senza duplicati e rollback preservato');
})().catch(error => { console.error(error); process.exitCode = 1; });
