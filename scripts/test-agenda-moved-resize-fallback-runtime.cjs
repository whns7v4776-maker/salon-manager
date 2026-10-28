const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const agendaPath = path.resolve('app/(tabs)/agenda.tsx');
const fallbackPath = path.resolve(process.argv[2] || agendaPath);
const projectionPath = path.resolve(process.argv[3] || agendaPath);
function callback(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(found, `${name} deve essere il callback reale`);
  return found.getText(ast);
}
// Il parametro opzionale verifica il vecchio fallback con gli stessi dati e
// con il resolver corrente disponibile, che il vecchio callback non usava.
const callbacks = `const resolveWeekAppointmentResizeVisualTiming = ${callback(agendaPath, 'resolveWeekAppointmentResizeVisualTiming')};
const getPendingMovedOptimisticWeekAppointmentAtSlot = ${callback(fallbackPath, 'getPendingMovedOptimisticWeekAppointmentAtSlot')};
getPendingMovedOptimisticWeekAppointmentAtSlot;`;
const compiled = ts.transpileModule(callbacks, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const projectionCode = ts.transpileModule(`(${callback(projectionPath, 'weekRenderAppointmentsByDate')});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const date = '2026-10-13';
const time = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

function fixture({ cache = {}, live = {}, preview, draft = null } = {}) {
  const cached = { id: 'appointment-1', data: date, ora: '09:00', durataMinuti: 60, operatoreId: 'operator-1', ...cache };
  const current = { ...cached, durataMinuti: 30, ...live };
  const context = {
    todayDate: date,
    effectiveWeekOperatorLaneLayoutByDate: {},
    pendingMovedWeekOptimisticAppointmentsRef: { current: new Map([[cached.id, { appointment: cached, timestamp: 1 }]]) },
    pendingMovedWeekTargetLaneKeysRef: { current: new Map([[cached.id, { date, laneKey: 'operator-id:operator-1', phaseScope: 'whole' }]]) },
    weekAppointmentLatestVisualTimingByIdRef: { current: new Map([[cached.id, current]]) },
    weekAppointmentResizeVisualPreviewRef: { current: preview ? { [cached.id]: preview } : {} },
    weekReorganizationDraftRef: { current: draft },
    normalizeServicePhaseConfig: value => value || null,
    timeToMinutes: time,
    getAppointmentOperatorBusyIntervals: appointment => [{ phase: 'initial', startOffsetMinutes: 0, durationMinutes: appointment.durataMinuti }],
    doesAppointmentOccupySlot: (appointment, slot) => time(appointment.ora) <= time(slot) && time(slot) < time(appointment.ora) + appointment.durataMinuti,
  };
  return { lookup: vm.runInNewContext(compiled, context), cached, current, context };
}

function renderProjection(test) {
  const unrelated = { id: 'unrelated', data: date, ora: '15:00', durataMinuti: 15 };
  const context = {
    ...test.context,
    appointmentsWithResizeVisualPreview: [test.current],
    weekReorganizationDraft: test.context.weekReorganizationDraftRef.current,
    blockingAppointmentsByDate: { [date]: [test.current, unrelated] },
    prunePendingMovedWeekSlotVisualKeys() {},
    isMovedWeekAppointmentOldSnapshot: () => false,
  };
  const evaluate = vm.runInNewContext(projectionCode, context);
  const rendered = evaluate()[date];
  assert.equal(rendered.find(item => item.id === unrelated.id), unrelated, 'Le altre righe non cambiano');
  return rendered.find(item => item.id === test.cached.id);
}

const confirmed = fixture();
assert.equal(confirmed.lookup(date, '09:45', undefined, 'occupy'), null, 'Il fallback non deve tenere occupati i 30 minuti liberati');
assert.equal(confirmed.lookup(date, '09:15', undefined, 'occupy')?.durataMinuti, 30, 'Il tratto ancora occupato resta prenotato');
assert.equal(confirmed.lookup(date, '09:30', undefined, 'occupy'), null, 'La fine del servizio è un limite esclusivo');
assert.equal(confirmed.lookup(date, '09:00', undefined, 'start')?.durataMinuti, 30, 'Anche la card di fallback usa la durata corrente');
assert.equal(confirmed.cached.durataMinuti, 60, 'Non riscrivere il contenuto della cache o la sua scadenza');
assert.equal(confirmed.context.pendingMovedWeekOptimisticAppointmentsRef.current.get(confirmed.cached.id).timestamp, 1);
const confirmedRendered = renderProjection(confirmed);
assert.equal(confirmedRendered?.durataMinuti, 30, 'La proiezione React applica il timing live allo slot singolo');
assert.equal(confirmedRendered?.ora, confirmed.cached.ora);

const pending = fixture({ live: { durataMinuti: 60 }, preview: { durationMinutes: 20, phaseConfig: null } });
assert.equal(pending.lookup(date, '09:25', undefined, 'occupy'), null, 'L’anteprima appena rilasciata prevale durante la RPC');
assert.equal(pending.lookup(date, '09:15', undefined, 'occupy')?.durataMinuti, 20);
pending.context.weekAppointmentResizeVisualPreviewRef.current = {};
assert.equal(pending.lookup(date, '09:45', undefined, 'occupy')?.durataMinuti, 60, 'Annullamento o rifiuto ripristina il timing canonico');

const pinned = fixture({ cache: { ora: '11:00' }, live: { ora: '09:00', operatoreId: 'operator-2' } });
const pinnedAppointment = pinned.lookup(date, '11:15', 'operator-id:operator-1', 'occupy');
assert.equal(pinnedAppointment?.ora, '11:00', 'La posizione del ponte move rimane invariata');
assert.equal(pinnedAppointment?.operatoreId, 'operator-1', 'La corsia non viene presa dal record temporale');
assert.equal(pinnedAppointment?.durataMinuti, 30);
assert.equal(pinned.lookup(date, '11:15', 'operator-id:operator-2', 'occupy'), null, 'Nessuna seconda corsia');
const pinnedRendered = renderProjection(pinned);
assert.equal(pinnedRendered?.ora, '11:00', 'La proiezione preserva la posizione del move');
assert.equal(pinnedRendered?.operatoreId, 'operator-1', 'La proiezione preserva la corsia del move');
assert.equal(pinnedRendered?.durataMinuti, 30);

for (const options of [
  { draft: { dirty: true } },
  { cache: { appointmentGroupId: 'group-1' } },
  { cache: { phaseConfig: { version: 1, initialDurationMinutes: 30, processingDurationMinutes: 10, finalDurationMinutes: 20 } } },
  { live: { appointmentGroupId: 'group-1' } },
  { live: { phaseConfig: { version: 1, initialDurationMinutes: 20, processingDurationMinutes: 10, finalDurationMinutes: 20 } } },
]) {
  const untouched = fixture(options);
  assert.equal(untouched.lookup(date, '09:45', undefined, 'occupy'), untouched.cached, 'Bozza, gruppi e fasi conservano il loro callback e timing');
  assert.equal(renderProjection(untouched), untouched.cached, 'La proiezione non riscrive la cache di bozza, gruppi o fasi');
}
console.log('PASS cache move + resize: fallback e proiezione corretti, preview/rollback, posizione e bozza/gruppi/fasi preservati');
