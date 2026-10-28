const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('tsx/cjs');
const booking = require('../src/lib/booking.ts');
const { limitPhoneToTenDigits } = require('../src/lib/validators.ts');
const { reuseUnchangedJsonValue, reuseUnchangedJsonFields } = require('../src/lib/reuse-unchanged-json-value.ts');

// Execute the actual screen helpers with their production dependencies.
const source = fs.readFileSync(path.join(__dirname, '../app/cliente-screen.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = [
  'matchesFrontendClientIdentity', 'matchesLimitedClientProfile',
  'getLimitedClientProfileMatchScore', 'resolveAuthoritativeLimitedClientProfile',
  'buildKnownClientIdentityNames', 'normalizeIdentityText', 'matchesCustomerDisplayName',
  'findLiveAppointmentForAcceptedRequest', 'buildFrontendConstraintRequestIdentityKey',
  'getFrontendConstraintRequestTimeline', 'getLatestFrontendSameDayScopeRequestStatus',
  'hasFrontendTerminalSameDayScopeOverride', 'getFrontendConstraintRelevantAppointments',
  'isFrontendRequestStillBlockingConstraints', 'countScheduledBookingsForClient',
  'findSameDayBookingComponentConflictForClient', 'findAnySameDayBookingForClient',
];
const declarations = new Map();
for (const statement of ast.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) {
      declarations.set(declaration.name.text, `const ${declaration.getText(ast)};`);
    }
  }
}
for (const name of names) assert.ok(declarations.has(name), `Missing helper ${name}`);
const js = ts.transpileModule(names.map(name => declarations.get(name)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText.replace(
  'const getFrontendConstraintRequestTimeline = (requests) => {',
  'const getFrontendConstraintRequestTimeline = (requests) => { metrics.timelineBuilds++;',
);
function load(legacy) {
  const metrics = { timelineBuilds: 0 };
  const context = vm.createContext({ ...booking, limitPhoneToTenDigits, metrics, getTodayDateString: () => '2026-09-06' });
  // Reference implementation rebuilds the index for every request, as before.
  const body = legacy ? js.replace('requestTimeline ?? getFrontendConstraintRequestTimeline(requests)', 'getFrontendConstraintRequestTimeline(requests)') : js;
  vm.runInContext(`${body}\nglobalThis.api = { ${names.join(', ')} };`, context);
  return { api: context.api, metrics };
}
const optimized = load(false), legacy = load(true);
const profile = { nome: 'Cliente', cognome: 'Test', email: 'test@example.invalid', telefono: '3330000000' };
const services = ['Taglio', 'Barba'].map((nome, index) => ({ id: `s${index}`, nome, prezzo: 20, durataMinuti: 30, mestiereRichiesto: 'Barber' }));
const clienti = [{ nome: 'Cliente Test', email: profile.email, telefono: profile.telefono, maxFutureAppointments: 4, maxDailyAppointments: 3 }];
const states = ['In attesa', 'Accettata', 'Annullata', 'Rifiutata', 'accepted', 'cancelled', 'rejected'];
const request = (id, seed = 0) => ({
  id: `r${id}`, nome: id % 3 ? 'Altro' : 'Cliente', cognome: 'Test',
  email: id % 4 ? profile.email : '', telefono: id % 5 ? profile.telefono : '',
  data: id % 3 ? '2026-09-07' : '2026-09-06', ora: `1${id % 8}:00`,
  servizio: services[id % 2].nome, stato: states[(id + seed) % states.length],
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, id % 7)).toISOString(),
  operatoreId: id % 4 ? 'op-1' : '', operatoreNome: id % 4 ? 'Operatore' : '',
  appointmentGroupId: id % 11 ? undefined : `g${id % 3}`,
  compositionId: id % 13 ? undefined : 'composition',
  dependencyServiceId: id % 17 ? undefined : 'linked',
});
const comparable = value => JSON.parse(JSON.stringify(value));
let comparisons = 0;
for (let seed = 0; seed < 80; seed++) {
  const requests = Array.from({ length: 40 }, (_, i) => request(i, seed));
  // Same identity and timestamp: retain the original last-in-array precedence.
  requests.push({ ...requests[seed % 40], id: `duplicate-${seed}`, stato: states[(seed + 2) % states.length] });
  const appointments = requests.filter((_, i) => i % 7 === 0).map(item => ({
    id: `a${item.id}`, data: item.data, ora: item.ora, servizio: item.servizio,
    cliente: `${item.nome} ${item.cognome}`, bookingRequestId: item.id,
    appointmentGroupId: item.appointmentGroupId,
  }));
  for (const date of ['2026-09-06', '2026-09-07', '2026-09-08']) {
    const args = { profile, clienti, services, appointments, requests, appointmentDate: date, requestedServiceName: services[seed % 2].nome };
    for (const name of ['countScheduledBookingsForClient', 'findSameDayBookingComponentConflictForClient', 'findAnySameDayBookingForClient']) {
      assert.deepEqual(comparable(optimized.api[name](args)), comparable(legacy.api[name](args)), `${name}, case ${seed}, ${date}`);
      comparisons++;
    }
  }
}
const pending = { ...request(1), stato: 'In attesa', compositionId: undefined, dependencyServiceId: undefined, appointmentGroupId: undefined };
const freshArgs = { profile, clienti, services, requests: [pending], appointments: [], appointmentDate: pending.data, requestedServiceName: pending.servizio };
assert.ok(optimized.api.findSameDayBookingComponentConflictForClient(freshArgs));
assert.equal(optimized.api.findSameDayBookingComponentConflictForClient({ ...freshArgs, requests: [{ ...pending, stato: 'Annullata' }] }), null);

const before = { workspace: { id: 'salon' }, services, requests: [{ id: 'r1', status: 'pending' }], settings: { step: 15, duration: 10 } };
const incoming = JSON.parse(JSON.stringify(before)); incoming.requests[0].status = 'cancelled';
const shared = reuseUnchangedJsonFields(before, incoming);
assert.equal(shared.services, before.services);
assert.equal(shared.workspace, before.workspace);
assert.equal(shared.settings, before.settings);
assert.equal(shared.requests, incoming.requests);
assert.equal(before.requests[0].status, 'pending');
assert.deepEqual(shared, incoming);
assert.equal(reuseUnchangedJsonValue(before, JSON.parse(JSON.stringify(before))), before);
assert.notEqual(reuseUnchangedJsonValue(before, incoming), before);
assert.deepEqual(reuseUnchangedJsonFields({ a: 1, removed: true }, { a: 2 }), { a: 2 });

const benchArgs = { profile, clienti, services, requests: Array.from({ length: 500 }, (_, i) => ({ ...request(i), compositionId: undefined, dependencyServiceId: undefined, appointmentGroupId: undefined })), appointments: [], appointmentDate: '2026-09-08', requestedServiceName: 'Taglio' };
function measure(engine) {
  engine.metrics.timelineBuilds = 0;
  const start = performance.now();
  engine.api.findSameDayBookingComponentConflictForClient(benchArgs);
  return { ms: Math.round((performance.now() - start) * 100) / 100, timelineBuilds: engine.metrics.timelineBuilds };
}
const previous = measure(legacy), next = measure(optimized);
assert.equal(next.timelineBuilds, 1, 'The entire history must be indexed only once per evaluation');
assert.equal(previous.timelineBuilds, 501);
console.log(JSON.stringify({ comparisons, parity: 'PASS', freshCancellation: 'PASS', structuralSharing: 'PASS', benchmark500Requests: { previous, next } }));
