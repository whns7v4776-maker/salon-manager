const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const compile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const start = source.indexOf('  const quickBookingPackageSuggestionsActive =');
const end = source.indexOf('  const quickBookingPackageConflictPreview =', start);
assert.ok(start > 0 && end > start);
const calculate = compile(`(() => {
  ${source.slice(start, end)}
  return { items: quickBookingPackageScheduleSuggestions, ready: quickBookingPackageSuggestionInputsReady };
})`);
const retention = compile(fs.readFileSync('hooks/use-retained-quick-slot-suggestions.ts', 'utf8'));
const toMinutes = time => time.split(':').reduce((hours, minutes) => Number(hours) * 60 + Number(minutes));
const toTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value));

// Drive committed and interrupted renders separately, holding deferred inputs
// back while the real Agenda calculation receives newly allocated plan objects.
function session(isWeb = false) {
  let deferred = [], deferredIndex = 0, refs = [], refIndex = 0, effects = [], settle;
  const hooks = {
    useMemo: fn => fn(),
    useDeferredValue(value) {
      const index = deferredIndex++;
      if (!(index in deferred) || settle) deferred[index] = value;
      return deferred[index];
    },
    useRef(value) { return refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }); },
    useLayoutEffect(fn) { effects.push(fn); },
  };
  const hookModule = { exports: {} };
  vm.runInNewContext(retention, { exports: hookModule.exports, require: name => {
    assert.equal(name, 'react');
    return hooks;
  } });
  const state = {
    ...hooks,
    ...hookModule.exports,
    IS_WEB: isWeb,
    quickBookingPackageMode: true,
    quickSlotDraft: { date: '2026-09-14', time: '09:30' },
    selectedQuickCustomer: { id: 'client-a', nome: 'Cliente A', telefono: '', email: '' },
    quickBookingPackagePlan: {
      items: ['piega', 'colore'].map((id, index) => ({
        serviceId: id, serviceName: id, timeValue: index ? '10:00' : '09:30',
        durationMinutes: 30, pauseAfterMinutes: 0, priceValue: 25,
      })),
      totalDurationMinutes: 60, error: '',
    },
    EMPTY_QUICK_BOOKING_PACKAGE_PLAN: { items: [], error: '', totalDurationMinutes: 0 },
    quickBookingPackageSuggestionOriginTimeRef: { current: '' },
    agendaServices: ['piega', 'colore'].map(id => ({ id, nome: id, mestiereRichiesto: 'Hair Stylist' })),
    operatori: ['Marco', 'Sara'].map(nome => ({ id: nome.toLowerCase(), nome, mestiere: 'Hair Stylist' })),
    availabilitySettings: {},
    canScheduleServiceAtSlot: () => true,
    findQuickBookingCustomerOverlap: () => null,
    getEligibleOperatorsForService: ({ operators }) => operators,
    buildDisplayTimeSlots: () => ['09:30', '10:00', '14:00'],
    timeToMinutes: toMinutes,
    minutesToTime: toTime,
    normalizeSalonCapacityRoleKey: name => name.toLowerCase(),
  };
  const context = vm.createContext(state);
  return {
    state,
    render({ settled = false, commit = true } = {}) {
      deferredIndex = refIndex = 0;
      effects = [];
      settle = settled;
      const result = vm.runInContext(calculate, context)();
      if (commit) effects.forEach(effect => effect());
      return result;
    },
  };
}

const native = session();
const initial = native.render();
assert.equal(initial.items.length, 6);
for (let index = 0; index < 25; index++) {
  native.state.quickBookingPackagePlan = clone(native.state.quickBookingPackagePlan);
  native.state.quickSlotDraft = clone(native.state.quickSlotDraft);
  native.state.selectedQuickCustomer = clone(native.state.selectedQuickCustomer);
  const next = native.render();
  assert.equal(next.ready, true, 'Equal values with new identities must not trigger a pending frame');
  assert.equal(JSON.stringify(next.items), JSON.stringify(initial.items), 'Idle updates must never hide the panel');
}

native.state.quickBookingPackagePlan.totalDurationMinutes += 5;
native.state.quickBookingPackagePlan.items[0].pauseAfterMinutes = 5;
native.state.quickBookingPackagePlan.items[1].timeValue = '10:05';
const pending = native.render();
assert.equal(pending.ready, false);
assert.equal(JSON.stringify(pending.items), JSON.stringify(initial.items), 'Keep the panel during a real recalculation');
const updated = native.render({ settled: true });
assert.equal(updated.ready, true);
assert.equal(updated.items[0].endTime, '10:35', 'The new pose must update the finished result');

// An interrupted calculation must not replace what the user last saw.
native.state.canScheduleServiceAtSlot = () => false;
assert.equal(native.render({ commit: false }).items.length, 0);
native.state.quickBookingPackagePlan.totalDurationMinutes += 5;
assert.equal(native.render().items, updated.items);
assert.equal(native.render({ settled: true }).items.length, 0, 'A settled empty result must clear stale availability');

native.state.canScheduleServiceAtSlot = () => true;
assert.ok(native.render().items.length);
native.state.selectedQuickCustomer = { id: 'client-b', nome: 'Cliente B' };
assert.equal(native.render().items.length, 0, 'Never retain results across customers');
assert.ok(native.render({ settled: true }).items.length);
native.state.quickSlotDraft.date = '2026-09-15';
assert.equal(native.render().items.length, 0, 'Never retain results across days');
assert.ok(native.render({ settled: true }).items.length);
native.state.quickBookingPackageMode = false;
assert.equal(native.render().items.length, 0, 'Leaving composition clears the retained list');
native.state.quickBookingPackageMode = true;
native.state.quickSlotDraft.time = '10:00';
assert.equal(native.render().items.length, 0, 'Reopening cannot resurrect the old list');
native.render({ settled: true });
native.state.quickSlotDraft = null;
assert.equal(native.render().items.length, 0, 'Closing the popup clears the list');

const web = session(true);
assert.equal(web.render().items.length, 6);
web.state.quickBookingPackagePlan.totalDurationMinutes = 75;
assert.equal(web.render().items[0].endTime, '10:45', 'Web keeps immediate results without deferral');
web.state.canScheduleServiceAtSlot = () => false;
assert.equal(web.render().items.length, 0, 'Web never retains an obsolete result');

const cardStart = source.indexOf('key={`composition-schedule-');
const cardEnd = source.indexOf('hapticType="light"', cardStart);
const card = source.slice(cardStart, cardEnd);
assert.match(card, /disabled=\{!IS_WEB && !quickBookingPackageSuggestionInputsReady\}/);
const pressStart = card.indexOf('onPress={() => {') + 'onPress={'.length;
const pressEnd = card.lastIndexOf('}}') + 1;
const press = compile(`(${card.slice(pressStart, pressEnd)})`);
for (const [isWeb, ready, expectedWrites] of [[false, false, 0], [false, true, 3], [true, false, 3]]) {
  let writes = 0;
  const onPress = vm.runInNewContext(press, {
    IS_WEB: isWeb, quickBookingPackageSuggestionInputsReady: ready,
    suggestion: { startTime: '09:30', operatorAssignments: { piega: 'marco' } },
    setQuickBookingPackageOperatorOverrides: () => writes++,
    setQuickBookingCustomerRecalculationNotice: () => writes++,
    setQuickSlotDraft: () => writes++,
    quickBookingPackageIdempotencyRef: { current: '' },
  });
  onPress();
  assert.equal(writes, expectedWrites, 'Retained native choices must be inert until recalculated; web stays immediate');
}

console.log('Quick-slot suggestions: native continuity, pose updates, interrupted renders, customer/day/reset isolation, stale-tap guard and immediate web behavior OK.');
