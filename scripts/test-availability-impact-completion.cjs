/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/agenda.tsx'), 'utf8');
const between = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing Agenda callback: ${start}`);
  return source.slice(first, last);
};
const code = [
  between('  const getAppointmentImpactKey = useCallback(', '  const doesAppointmentUseSelectedOperator = useCallback('),
  between('  const closeAvailabilityImpactModal = useCallback(', '  const openOperatorLaneBlock = useCallback('),
  'globalThis.complete = completeAvailabilityImpactAction;',
  'globalThis.present = presentAvailabilityImpactAction;',
  'globalThis.close = closeAvailabilityImpactModal;',
  'globalThis.key = getAppointmentImpactKey;',
].join('\n');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const appointment = (id, overrides = {}) => ({
  id, data: '2026-10-20', ora: '09:00', cliente: id, servizio: 'Taglio', ...overrides,
});
const fixture = ({ cancel, save } = {}) => {
  const events = [];
  const alerts = [];
  const context = {
    Error,
    availabilityImpactAction: null,
    availabilityImpactOperationRef: { current: false },
    useCallback: (callback) => callback,
    todayDate: '2026-10-20',
    getSyntheticWeekAppointmentRequestId: (item) => item.syntheticRequestId ?? '',
    normalizeAgendaIdentity: (value) => value.trim().toLowerCase(),
    normalizeServiceName: (value) => value.trim().toLowerCase(),
    isAgendaAppointmentRecentlySuppressedDeleted: (item) => item.suppressed === true,
    setAvailabilityImpactAction: (action) => { context.availabilityImpactAction = action; events.push(action ? 'modal:open' : 'modal:closed'); },
    setAvailabilityImpactBusy: (busy) => events.push(`busy:${busy}`),
    cancelAgendaAppointmentItem: async (item, options) => {
      events.push(`cancel:${item.id}`);
      assert.equal(options.suppressErrorAlert, true);
      assert.equal(options.suppressSuccessHaptic, true);
      const result = cancel ? await cancel(item) : { ok: true };
      events.push(`settled:${item.id}`);
      return result;
    },
    haptic: { success: async () => { events.push('success'); } },
    Alert: { alert: (title, message) => alerts.push({ title, message }) },
  };
  vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    context,
    events,
    alerts,
    open: (appointments) => context.present({
      title: 'Blocca disponibilità', message: 'Appuntamenti coinvolti', appointments,
      applyAvailabilityChange: async () => { events.push('save'); if (save) await save(); },
    }),
  };
};

(async () => {
  const a = appointment('a');
  const b = appointment('b');
  const keep = fixture();
  await keep.open([a, b]);
  await keep.context.complete([]);
  assert.equal(keep.events.some((event) => event.startsWith('cancel:')), false);
  assert.equal(keep.events.filter((event) => event === 'save').length, 1);
  assert.ok(keep.events.indexOf('modal:closed') < keep.events.indexOf('save'));
  assert.equal(keep.context.availabilityImpactOperationRef.current, false);
  assert.equal(keep.events.at(-1), 'busy:false');

  const selected = fixture();
  await selected.open([a, b]);
  await selected.context.complete([selected.context.key(b), 'unknown-key']);
  assert.deepEqual(selected.events.filter((event) => event.startsWith('cancel:')), ['cancel:b']);
  assert.ok(selected.events.indexOf('settled:b') < selected.events.indexOf('save'));
  assert.equal(selected.alerts.length, 0);

  const grouped = fixture();
  await grouped.open([
    appointment('later-group-phase', { appointmentGroupId: 'group-one', ora: '11:00' }),
    appointment('first-group-phase', { appointmentGroupId: 'group-one', ora: '10:00' }),
    appointment('completed', { completato: true }),
    appointment('missed', { nonEffettuato: true }),
    appointment('deleted', { suppressed: true }),
    a,
  ]);
  assert.equal(grouped.context.availabilityImpactAction.appointments.length, 2);
  await grouped.context.complete(['group:group-one', 'group:group-one']);
  assert.deepEqual(grouped.events.filter((event) => event.startsWith('cancel:')), ['cancel:first-group-phase']);
  assert.equal(grouped.context.key(appointment('', { syntheticRequestId: 'request-one' })), 'request:request-one');

  const first = deferred();
  const second = deferred();
  const pending = fixture({ cancel: (item) => item.id === 'a' ? first.promise : second.promise });
  await pending.open([a, b]);
  const completion = pending.context.complete(['appointment:a', 'appointment:b']);
  assert.equal(pending.context.availabilityImpactAction, null, 'Modal selection must close immediately.');
  assert.equal(pending.context.availabilityImpactOperationRef.current, true);
  pending.context.close();
  await pending.open([appointment('new')]);
  assert.equal(pending.alerts.at(-1).title, 'Operazione già in corso');
  first.resolve({ ok: true });
  await new Promise(setImmediate);
  assert.equal(pending.events.includes('save'), false, 'Availability must wait for every selected cancellation.');
  second.resolve({ ok: true });
  await completion;
  assert.ok(pending.events.indexOf('settled:a') < pending.events.indexOf('save'));
  assert.ok(pending.events.indexOf('settled:b') < pending.events.indexOf('save'));

  const partial = fixture({
    cancel: async (item) => {
      if (item.id === 'a') return { ok: false, error: 'server rejected' };
      if (item.id === 'b') throw new Error('network failed');
      return { ok: true };
    },
  });
  await partial.open([a, b, appointment('c')]);
  await partial.context.complete(['appointment:a', 'appointment:b', 'appointment:c']);
  assert.equal(partial.events.filter((event) => event === 'save').length, 1);
  assert.equal(partial.alerts[0].title, 'Blocco salvato, annullamento incompleto');
  assert.match(partial.alerts[0].message, /^2 appuntamenti non sono stati annullati/);
  assert.equal(partial.events.includes('success'), false, 'Partial failure must not report full success.');
  assert.equal(partial.context.availabilityImpactOperationRef.current, false);

  const failedSave = fixture({ save: async () => { throw new Error('server unavailable'); } });
  await failedSave.open([a, b]);
  await failedSave.context.complete(['appointment:a']);
  assert.equal(failedSave.alerts[0].title, 'Salvataggio non riuscito');
  assert.match(failedSave.alerts[0].message, /^1 appuntamento è stato annullato, ma il blocco non è stato confermato/);
  assert.equal(failedSave.context.availabilityImpactOperationRef.current, false);
  assert.equal(failedSave.events.at(-1), 'busy:false');

  const saveOnly = fixture({ save: async () => { throw new Error('server unavailable'); } });
  await saveOnly.open([]);
  assert.equal(saveOnly.events.includes('modal:open'), false, 'No impacted bookings must save without a selection modal.');
  assert.equal(saveOnly.alerts[0].message, 'server unavailable');
  assert.equal(saveOnly.context.availabilityImpactOperationRef.current, false);
  assert.equal(saveOnly.events.at(-1), 'busy:false');
  console.log('PASS: actual Agenda availability-impact callbacks cover keep/selected/grouped cancellations, save-last ordering, operation guard and partial/save failures.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
