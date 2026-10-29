const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const exportsForTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/agenda-premium-layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsForTest});
const {agendaVisibleDays,agendaSlotRowHeight,toggleAgendaOperator}=exportsForTest;
// Adding an operator forces a day without overwriting the user's multi-day choice.
for(let preferred=1;preferred<=7;preferred++){
 for(const count of [0,1])assert.equal(agendaVisibleDays(preferred,count),preferred);
 for(const count of [2,3,4,12])assert.equal(agendaVisibleDays(preferred,count),1);
 assert.equal(agendaVisibleDays(preferred,1),preferred);
}
for(const web of [true,false])for(const scale of [.58,.7,.82,.91,1]){
 const height=agendaSlotRowHeight(web,scale);
 assert.ok(height>=(web?30:40));
 // 15+ minute grids keep the density height; the app never shrinks rows.
 assert.equal(agendaSlotRowHeight(web,scale,30),height);
 if(!web)assert.deepEqual([5,10,15].map(minutes=>agendaSlotRowHeight(web,scale,minutes)),[height,height,height]);
 else{
  // Web 5/10 minute rows shrink with their duration but stay one readable line.
  const five=agendaSlotRowHeight(web,scale,5),ten=agendaSlotRowHeight(web,scale,10);
  assert.ok(five>=20&&five<height&&ten>five&&ten<=height);
  // An hour of 5 minute rows takes far less than 12 full rows.
  assert.ok(five*12<=height*8);
 }
}
for(const scale of [NaN,Infinity,-1,0])assert.equal(agendaSlotRowHeight(false,scale),52);
const normalize=value=>JSON.parse(JSON.stringify(value));
const ids=['alex','gabriele','sofia'];
assert.deepEqual(normalize(toggleAgendaOperator(null,'alex',ids)),['alex']);
assert.deepEqual(normalize(toggleAgendaOperator(['alex'],'sofia',ids)),['alex','sofia']);
assert.deepEqual(normalize(toggleAgendaOperator(['alex','sofia'],'alex',ids)),['sofia']);
assert.equal(toggleAgendaOperator(['alex'],'alex',ids),null);
assert.equal(toggleAgendaOperator(['deleted'],'deleted',ids),null);
assert.deepEqual(normalize(toggleAgendaOperator(['alex','alex','deleted'],'sofia',ids)),['alex','sofia']);
console.log('PASS Agenda presentation policy: day count, retained preference, readable row spacing, invalid scales and operator selection.');
