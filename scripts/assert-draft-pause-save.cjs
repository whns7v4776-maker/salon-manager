const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const code = source.slice(source.indexOf('const reconcileWeekDraftCompositionPauses ='), source.indexOf('const resolveWeekDraftPoseReductions ='));
const context = {
  normalizeWeekReorganizationPauseMinutes: n => Math.max(0, Math.min(180, Math.round(n / 5) * 5)),
  getAppointmentDateTime: (date, time) => new Date(`${date}T${time}:00`),
};
vm.createContext(context);
vm.runInContext(ts.transpile(code + '\nglobalThis.reconcile = reconcileWeekDraftCompositionPauses;'), context);
const a = { id:'a', appointmentGroupId:'g', appointmentGroupOrder:1, ora:'09:30', durataMinuti:30 };
const b = { id:'b', appointmentGroupId:'g', appointmentGroupOrder:2, ora:'10:40', durataMinuti:60 };
const draft = { appointments:[b,a], pauseAfterMinutesByAppointmentId:{a:15,b:0} };
const before = JSON.stringify(draft);
assert.equal(context.reconcile(draft,'2026-09-11').pauseAfterMinutesByAppointmentId.a,40);
assert.equal(JSON.stringify(draft),before);
assert.equal(context.reconcile({...draft, appointments:[a,{...b,ora:'10:10'}]},'2026-09-11').pauseAfterMinutesByAppointmentId.a,10);
assert.equal(context.reconcile({...draft, appointments:[a,{...b,ora:'10:00'}]},'2026-09-11').pauseAfterMinutesByAppointmentId.a,0);
assert.equal(context.reconcile({...draft, pauseAfterMinutesByAppointmentId:{a:0}},'2026-09-11').pauseAfterMinutesByAppointmentId.a,0);
assert.equal(context.reconcile({...draft, appointments:[a,{...b,appointmentGroupId:'other'}]},'2026-09-11').pauseAfterMinutesByAppointmentId.a,15);
console.log('PASS: persisted pause follows the same-group gap; shorter/zero, unrelated groups and input preserved');
