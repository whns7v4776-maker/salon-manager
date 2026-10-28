const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require('typescript');
const agenda = fs.readFileSync('app/(tabs)/agenda.tsx','utf8');
const ast = ts.createSourceFile('agenda.tsx',agenda,99,true,4);
let save;
function walk(n) {
  if(ts.isVariableDeclaration(n) && n.name.getText(ast)==='saveScheduleWithAppointmentChoice') save=n.initializer.getText(ast);
  ts.forEachChild(n,walk);
}
walk(ast); assert.ok(save);
const minutes = value => value.split(':').reduce((h,m)=>Number(h)*60+Number(m));
const base = {weeklySchedule:[{weekday:5,startTime:'09:00',endTime:'18:00',isClosed:false}],dateOverrides:[],lunchBreakEnabled:false,lunchBreakStart:'13:00',lunchBreakEnd:'14:00'};
const today='2099-01-02'; // Friday; future fixtures, no real appointments or settings are written.
assert.equal(new Date(today+'T12:00:00').getDay(),5);
let captured, persisted=0;
const items=[
 {id:'early',data:today,ora:'09:00',durataMinuti:60},
 {id:'edge',data:today,ora:'10:00',durataMinuti:60},
 {id:'noon',data:today,ora:'12:30',durataMinuti:60},
 {id:'late',data:today,ora:'17:30',durataMinuti:30},
 {id:'complete',data:today,ora:'09:30',durataMinuti:60,completato:true},
 {id:'past',data:'2000-01-01',ora:'09:00',durataMinuti:60},
 {id:'group-first',group:'G',data:today,ora:'11:00',durataMinuti:30},
 {id:'group-later',group:'G',data:today,ora:'17:00',durataMinuti:60},
];
const context={availabilitySettings:base,appuntamentiNormalizzati:items,todayDate:today,Date,
 timeToMinutes:minutes,
 getWeeklyDaySchedule:(s,date)=>s.dateOverrides.find(x=>x.date===date)||s.weeklySchedule[0],
 getServiceDuration:()=>30,
 getPhasedServiceTotalDuration:s=>s.durataMinuti,
 getAppointmentDateTime:(date,time)=>new Date(date+'T'+time),
 dedupeImpactAppointments:rows=>[...new Map(rows.filter(x=>!x.completato&&!x.nonEffettuato).map(x=>[x.group||x.id,x])).values()],
 presentAvailabilityImpactAction:action=>{captured=action},
 updateAvailabilitySettingsPersisted:async(change,options)=>{assert.equal(options.waitForServerPersistence,true);persisted++;return change(base)},
};
vm.createContext(context);
vm.runInContext(ts.transpile(`globalThis.save = ${save}`,{target:99}),context);
const changeDay=patch=>s=>({...s,weeklySchedule:[{...s.weeklySchedule[0],...patch}]});
const ids=()=>Array.from(captured.appointments,x=>x.id).sort();
context.save(changeDay({startTime:'10:00'}));assert.deepEqual(ids(),['early']);
context.save(changeDay({endTime:'17:00'}));assert.deepEqual(ids(),['group-later','late']);
context.save(changeDay({isClosed:true}));assert.deepEqual(ids(),['early','edge','group-later','late','noon']);
context.save(changeDay({startTime:'08:00',endTime:'20:00'}));assert.deepEqual(ids(),[]);
context.save(s=>({...s,lunchBreakEnabled:true}));assert.deepEqual(ids(),['noon']);
context.save(s=>({...s,lunchBreakEnabled:true,lunchBreakStart:'13:30'}));assert.deepEqual(ids(),[]);
assert.equal(persisted,0,'Preview must never save or cancel appointments');
(async()=>{await captured.applyAvailabilityChange();assert.equal(persisted,1);
const popup=fs.readFileSync('components/native-settings-popup.tsx','utf8');
assert.match(popup,/<CreationSheet[\s\S]*?<\/CreationSheet>\s*\{overlays\}/);
assert.match(popup,/onRequestClose=\{\(\) => \{ if \(!onOverlayBack\?\.\(\)\) close\(\); \}\}/);
assert.match(agenda,/overlays=\{!IS_WEB \? renderAvailabilitySettingsOverlays\(true\) : null\}/);
assert.match(agenda,/IS_WEB \|\| !showCustomizeHoursExpanded \|\| !mountCustomizeHoursContent \? renderAvailabilitySettingsOverlays\(\) : null/);
const overlay=agenda.slice(agenda.indexOf('const renderAvailabilitySettingsOverlays'),agenda.indexOf('const renderAgendaServiceNumberPickers'));
assert.match(overlay,/<NativeTimePickerModal\s+embedded=\{embedded\}/);
assert.match(overlay,/<NativeDatePickerModal\s+embedded=\{embedded\}\s+visible=\{!!vacationPickerTarget\}/);
assert.ok(!agenda.includes('canCustomizeSelectedDateHours'),'Booked days must not disable the editor');
const clients=fs.readFileSync('app/(tabs)/clienti.tsx','utf8');
const edit=clients.slice(clients.indexOf('<Modal\n        visible={showEditCustomerModal'));
assert.ok(edit.indexOf('visible={editBirthdayPickerValue')<edit.indexOf('</Modal>'),'Birthday belongs inside customer editor');
console.log('PASS: schedule conflict boundaries, complete/past exclusion, grouped later service, deferred save and native picker ownership.');
})().catch(e=>{console.error(e);process.exitCode=1});
