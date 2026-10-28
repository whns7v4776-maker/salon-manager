const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const load = relative => {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source + (relative === 'src/lib/client-portal.ts' ? '\nexport { normalizePortalSnapshot };' : ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, Date, Set, Map, console, setTimeout, clearTimeout,
    require: id => {
      if (id === './supabase') return { publicSupabase: {}, supabase: {} };
      if (id === './platform') return { normalizeWorkspace: value => value ?? {} };
      assert.ok(id.startsWith('.'), `Unexpected dependency ${id}`);
      return load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)));
    },
  }, { filename });
  return exports;
};
const portal = load('src/lib/client-portal.ts');
const booking = load('src/lib/booking.ts');
const date = '2026-10-13';
const phaseConfig = {
  version: 1, mode: 'phased', initialLabel: 'Applicazione', initialDurationMinutes: 10,
  processingLabel: 'Posa', processingDurationMinutes: 40,
  finalServiceName: 'Asciugatura', finalDurationMinutes: 10, sameOperator: false,
  allowFrontendSplitOperators: true,
};
const rawHold = {
  id: 'hold-1', data: date, ora: '09:00', servizio: 'Colore', durataMinuti: 60,
  paymentHoldState: 'awaiting_payment', paymentHoldExpiresAt: '2026-10-09T12:05:00Z',
  phaseSnapshot: phaseConfig,
  phaseOperatorAssignments: { version: 1, initial: { id: 'op-1', name: 'Alex' }, final: { id: 'op-2', name: 'Ludo' } },
  operatoreId: 'op-1', operatoreNome: 'Alex', requiredRole: 'Hair',
  macchinarioIds: ['dryer-1'], appointmentGroupId: 'batch-1', appointmentGroupOrder: 0,
  email: 'private@example.invalid', phone: 'secret', customerId: 'private', nome: 'Private', prezzo: 200,
};
const normalized = portal.normalizePublicPaymentHoldOccupancy([
  rawHold, { ...rawHold, id: 'paid', paymentHoldState: 'paid' },
  { ...rawHold, id: 'expired', paymentHoldState: 'expired' }, null,
]);
assert.equal(normalized.length, 1);
assert.equal(normalized[0].cliente, '');
assert.equal(normalized[0].prezzo, 0);
for (const field of ['email', 'phone', 'customerId', 'nome']) assert.equal(field in normalized[0], false);
assert.equal(normalized[0].phaseOperatorAssignments.final.id, 'op-2');
assert.equal(normalized[0].macchinarioIds[0], 'dryer-1');
const snapshot = portal.normalizePortalSnapshot({ workspace: {}, paymentHoldOccupancy: [rawHold], richiestePrenotazione: [], appuntamenti: [] });
assert.equal(snapshot.richiestePrenotazione.length, 0, 'holds are not ordinary customer requests');
assert.equal(snapshot.appuntamenti.length, 0, 'holds are not confirmed appointments');
assert.equal(snapshot.paymentHoldOccupancy.length, 1);
const legacySnapshot = portal.normalizePortalSnapshot({ workspace: {}, paymentHoldOccupancy: [rawHold], richiestePrenotazione: [rawHold] });
assert.equal(legacySnapshot.richiestePrenotazione.length, 0, 'legacy hold rows cannot become ordinary booking requests');
assert.equal(legacySnapshot.paymentHoldOccupancy.length, 1, 'the same legacy hold must reserve capacity only once');
const occupied = portal.derivePublicBookingOccupancyFromSnapshot(snapshot, date);
assert.equal(occupied.length, 1, 'unpaid hold remains busy in fallback availability');
assert.equal(occupied[0].id, 'payment-hold:hold-1');
assert.equal(portal.derivePublicBookingOccupancyFromSnapshot(snapshot, '2026-10-14').length, 0);
const operators = [{ id: 'op-1', nome: 'Alex', mestiere: 'Hair' }, { id: 'op-2', nome: 'Ludo', mestiere: 'Hair' }, { id: 'op-3', nome: 'Sam', mestiere: 'Hair' }];
const services = [{ id: 'color', nome: 'Colore', prezzo: 30, durataMinuti: 60, mestiereRichiesto: 'Hair', phaseConfig }, { id: 'cut', nome: 'Taglio', prezzo: 20, durataMinuti: 20, mestiereRichiesto: 'Hair' }];
const availability = time => booking.getManualAcceptanceOperatorOptions({
  request: { id: 'new', data: date, ora: time, servizio: 'Taglio', mestiereRichiesto: 'Hair' },
  durationMinutes: 20, services, operators, appointments: occupied, bookingRequests: [],
}).map(item => [item.operator.id, item.available]);
assert.equal(availability('09:05').find(([id]) => id === 'op-1')[1], false, 'initial hold phase reserves Alex');
assert.equal(availability('09:15').find(([id]) => id === 'op-1')[1], true, 'processing interval releases Alex');
assert.equal(availability('09:45').find(([id]) => id === 'op-2')[1], false, 'final hold phase reserves Ludo');
assert.equal(availability('09:45').find(([id]) => id === 'op-3')[1], true, 'independent operator remains bookable');
const expiredSnapshot = portal.normalizePortalSnapshot({ workspace: {}, paymentHoldOccupancy: [{ ...rawHold, paymentHoldState: 'expired' }] });
assert.equal(portal.derivePublicBookingOccupancyFromSnapshot(expiredSnapshot, date).length, 0, 'server-confirmed expiry releases capacity');
console.log('PASS: unpaid holds are private capacity only; phase operators, processing time, other dates/operators and verified expiry remain correct.');
