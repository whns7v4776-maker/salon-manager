const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const tree = ts.createSourceFile('agenda.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'clearLocalSlotGuardsForNewBooking') callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback);
const text = callback.getText(tree);
const calls = [];
const context = {
  operatoreId: 'wrong-outer-lane',
  setWeekClearedSlotSettleEpoch: () => {},
  getAgendaStickyAssignmentCompositeKey: value => { calls.push(value); return 'composite'; },
  getAgendaStickyAssignmentKey: () => '',
  buildWeekSlotVisualKey: () => '',
};
for (const name of new Set(text.match(/\b\w+Ref\b/g))) context[name] = { current: new Map() };
for (const name of ['buildAgendaRequestSlotSyncKeyFromAppointment', 'buildAgendaRequestSyncKeyFromAppointment', 'buildAgendaRequestBaseSyncKeyFromAppointment']) {
  context[name] = value => { calls.push(value); return JSON.stringify(value); };
}
const cleanup = vm.runInNewContext(ts.transpileModule(`(${text})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
context.recentlySuppressedDeletedAppointmentKeysRef.current.set('composite', true);
cleanup({ date: '2026-10-06', time: '10:00', customerName: 'QA', serviceName: 'Taglio', durationMinutes: 30, price: 0, operatorId: 'selected', operatorName: 'Alex', roleName: 'Barber' });
assert.equal(calls[0].prezzo, 0);
assert.equal(calls[0].operatoreId, 'selected');
assert.equal(calls[0].mestiereRichiesto, 'Barber');
assert.ok(calls.every(value => value.operatoreId !== 'wrong-outer-lane'));
assert.equal(context.recentlySuppressedDeletedAppointmentKeysRef.current.has('composite'), false);
assert.match(source, /clearLocalSlotGuardsForNewBooking\(\{[\s\S]*?price: quickBenefitSelection \? 0 : getCustomerServicePrice/);

const exportsObject = {};
const cacheCode = ts.transpileModule(fs.readFileSync('hooks/use-appointment-benefits.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(cacheCode, {
  exports: exportsObject, Date,
  require: name => name === 'react' ? { useMemo: fn => fn(), useCallback: fn => fn, useState: fn => [fn(), () => {}] } : name === 'expo-router' ? { useFocusEffect: () => {} } : {},
});
exportsObject.rememberConfirmedAppointmentBenefits('salon-a', ['confirmed'], 'subscription');
assert.equal(exportsObject.useAppointmentBenefits('salon-a', [{ id: 'confirmed' }]).get('confirmed')[0], 'subscription');
assert.equal(exportsObject.useAppointmentBenefits('salon-b', [{ id: 'confirmed' }]).size, 0);
assert.equal(exportsObject.useAppointmentBenefits('salon-a', [{ id: 'unconfirmed' }]).size, 0);
console.log('Rebooking cleanup and confirmed benefit visibility: PASS');
