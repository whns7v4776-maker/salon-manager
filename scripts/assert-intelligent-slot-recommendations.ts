import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { recommendIntelligentSlots, type IntelligentResourceGroup } from '../src/lib/intelligent-slot-recommendations';
import { buildIntelligentGuidedPlan } from '../src/lib/intelligent-guided-plan';
import { buildSalonCapacityOperatorId, normalizeAvailabilitySettings, minutesToTime, type SharedService, type SharedOperator } from '../src/lib/booking';

const slots=(from:number,to:number,step=5)=>Array.from({length:Math.floor((to-from)/step)+1},(_,i)=>minutesToTime(from+i*step));
const recommend=(times:string[],groups:IntelligentResourceGroup[],duration=40)=>recommendIntelligentSlots({slots:times,planDurationMinutes:duration,resourceGroups:groups});
const lane=(busy:{start:number;end:number}[]=[],duration=40)=>({start:540,end:1080,busy,intervals:[{startOffsetMinutes:0,durationMinutes:duration}],catalogDurations:[20,40,120]});
const empty = recommend(slots(540,1040),[{options:[lane()]}]);
assert(empty.length>20,'Empty day must offer far more than four suggestions');
assert(empty.includes('09:00'));assert(!empty.includes('09:05'));assert(!empty.includes('09:10'));
assert.equal(new Set(empty).size,empty.length);
// Real 10:50 boundary, not last-start plus rounded duration.
assert.deepEqual(recommend(['10:00','10:05','10:10','10:15','10:20'],[{options:[{...lane([{start:540,end:600},{start:650,end:700}],30),catalogDurations:[20,30]}]}],30),['10:00','10:20']);
const previousChoice=recommend(['09:00'],[{options:[{...lane([],30),catalogDurations:[20,30]}]}],30);
assert(previousChoice.includes('09:00'));
const changedChoice=recommend(['09:00'],[{options:[{...lane([{start:580,end:620}],30),catalogDurations:[20,30]}]}],30);
assert(!changedChoice.includes('09:00'),'A previously bookable start must leave recommendations when a new short gap appears');
// A 60-minute service in a broad morning/afternoon must not collapse to four.
const reportedDay=recommend(slots(540,1110,15),[{options:[{start:540,end:1170,busy:[{start:555,end:585},{start:780,end:840}],intervals:[{startOffsetMinutes:0,durationMinutes:60}],catalogDurations:[20,30,45,60,80]}]}],60);
assert.equal(reportedDay.length,24);
assert(reportedDay.includes('10:15')&&reportedDay.includes('11:15')&&reportedDay.includes('14:00')&&reportedDay.includes('18:30'));
assert.deepEqual(recommend([],[]),[]);
assert.deepEqual(recommend(['09:00'],[{options:[]}]),[]);
assert.deepEqual(recommend(['09:00'],[{options:[{...lane(),catalogDurations:[]}]}]),[]);
assert.deepEqual(recommend(['broken','25:00'],[{options:[lane()]}]),[]);
const settings=normalizeAvailabilitySettings({weeklySchedule:Array.from({length:7},(_,weekday)=>({weekday,startTime:'09:00',endTime:'18:00',isClosed:false})), lunchBreakEnabled:false,guidedSlotsStrategy:'intelligent'});
assert.equal(settings.guidedSlotsStrategy,'intelligent');
assert.equal(settings.guidedSlotsVisibility,'recommended_and_all','Intelligent mode defaults to recommendations plus all bookable slots');
for(const visibility of ['recommended_first','recommended_only','recommended_and_all'] as const) {
 assert.equal(normalizeAvailabilitySettings({guidedSlotsStrategy:'intelligent',guidedSlotsVisibility:visibility}).guidedSlotsVisibility,visibility,'Intelligent mode must retain the visibility chosen by the salon');
 for(const strategy of ['balanced','fill_gaps','protect_long_services'] as const)assert.equal(normalizeAvailabilitySettings({guidedSlotsStrategy:strategy,guidedSlotsVisibility:visibility}).guidedSlotsVisibility,visibility,'Existing strategies must retain the chosen visibility');
}
for(const strategy of ['balanced','fill_gaps','protect_long_services'] as const)assert.equal(normalizeAvailabilitySettings({guidedSlotsStrategy:strategy}).guidedSlotsStrategy,strategy);
const services:SharedService[]=[{id:'s20',nome:'Breve',prezzo:10,durataMinuti:20,mestiereRichiesto:'Barber'},{id:'s40',nome:'Lungo',prezzo:20,durataMinuti:40,mestiereRichiesto:'Barber'}];
const operators:SharedOperator[]=[{id:'a',nome:'A',mestiere:'Barber'},{id:'b',nome:'B',mestiere:'Barber'}];
const build=(changes:Partial<Parameters<typeof buildIntelligentGuidedPlan>[0]>={})=>buildIntelligentGuidedPlan({services,operators,appointments:[],date:'2026-10-07',settings,planServices:[services[1]],selectedOperatorId:'b',selectedOperatorName:'',automaticSplit:false,...changes});
for(const visibility of ['recommended_first','recommended_only','recommended_and_all'] as const) {
 assert.deepEqual(build({settings:{...settings,guidedSlotsVisibility:visibility}}),build(),'Changing visibility must not change the intelligent recommendation resource plan');
}
const occupiedA=build({appointments:[{id:'apt',data:'2026-10-07',ora:'10:00',servizio:'Lungo',cliente:'QA',operatoreId:'a',operatoreNome:'A',durataMinuti:40}]});
assert(recommend(['10:00'],occupiedA).includes('10:00'),'A must not block selected B');
assert(!recommend(['10:00'],build({selectedOperatorId:'a',appointments:[{id:'apt',data:'2026-10-07',ora:'10:00',servizio:'Lungo',cliente:'QA',operatoreId:'a',durataMinuti:40}]})).length);
const phase={version:1 as const,mode:'phased' as const,initialLabel:'Colore',initialDurationMinutes:20,processingLabel:'Posa',processingDurationMinutes:40,finalServiceName:'Breve',finalServiceId:'s20',finalDurationMinutes:20,sameOperator:true,allowFrontendSplitOperators:true};
const phased:SharedService={id:'phase',nome:'Colore',prezzo:50,durataMinuti:80,mestiereRichiesto:'Barber',phaseConfig:phase};
const phaseGroups=build({services:[...services,phased],planServices:[phased],selectedOperatorId:'a',appointments:[{id:'during',data:'2026-10-07',ora:'09:20',servizio:'Breve',cliente:'QA',operatoreId:'a',durataMinuti:20}]});
assert(recommend(['09:00'],phaseGroups,80).includes('09:00'),'A processing pause must stay reusable');
const oldSplit=build({appointments:[{id:'split',data:'2026-10-07',ora:'09:00',servizio:'Colore',cliente:'QA',operatoreId:'a',phaseConfig:phase,phaseOperatorAssignments:{version:1,initial:{id:'a',name:'A'},final:{id:'b',name:'B'}}}],services:[...services,phased]});
assert.deepEqual(oldSplit[0].options[0].busy,[{start:600,end:620}],'Saved phase assignment must block its own operator');
const linked={...services[0],linkedServiceConfig:{version:1 as const,dependencyMode:'automatic' as const,requiredServiceIds:['s40'],suggestedServiceIds:[]}};
const linkedGroups=build({services:[linked,services[1]],planServices:[linked,services[1]]});
assert.equal(linkedGroups[0].options[0].intervals.at(-1)?.startOffsetMinutes,20);
assert.equal(linkedGroups[0].options[0].catalogDurations[0],60,'Mandatory dependency must count in catalogue duration');
const twoRoles:SharedService[]=[services[0],{...services[1],mestiereRichiesto:'Hair Stylist'}];
const crossRole=build({services:twoRoles,operators:[operators[0],{...operators[1],mestiere:'Hair Stylist'}],planServices:twoRoles,selectedOperatorId:'',automaticSplit:true});
assert.equal(crossRole.length,2);assert(recommend(['09:00'],crossRole,60).includes('09:00'),'Linked services can use different operators without a primary selection');
const splitGroups=build({planServices:[{...phased,phaseConfig:{...phase,sameOperator:false}}],services:[...services,phased],selectedOperatorId:'',automaticSplit:true});
assert.equal(build({planServices:[phased],services:[...services,phased],selectedOperatorId:'',automaticSplit:true}).length,2);
assert.equal(build({planServices:[{...phased,phaseConfig:{...phase,allowFrontendSplitOperators:false}}],services:[...services,phased],selectedOperatorId:'',automaticSplit:true}).length,1);
assert.equal(splitGroups.length,2);assert.equal(splitGroups[1].options[0].intervals[0].startOffsetMinutes,60);
const lunch=build({settings:{...settings,lunchBreakEnabled:true,lunchBreakStart:'13:00',lunchBreakEnd:'14:00'}});
assert.deepEqual(recommend(['12:50','13:00'],lunch),[]);
const saved=build({selectedOperatorId:'a',appointments:[{id:'saved',data:'2026-10-07',ora:'09:00',servizio:'Lungo',cliente:'QA',operatoreId:'a',durataMinuti:20}]});
assert.equal(saved[0].options[0].busy[0].end,560,'Catalogue changes must not extend saved appointments');
assert.deepEqual(recommend(['09:00'],build({operators:[],selectedOperatorId:buildSalonCapacityOperatorId('Lungo',services)})),['09:00']);
// Each update recomputes; recommendations never add unavailable times.
for(let i=0;i<80;i++){
 const candidates=slots(540,1040).filter((_,index)=>(index+i)%7!==0);
 const result=recommend(candidates,[{options:[lane([{start:780,end:840}])]}]);
 assert(result.every(time=>candidates.includes(time)));
}
const started=performance.now();for(let i=0;i<25;i++)recommend(slots(540,1040),[{options:Array.from({length:12},()=>lane())}]);
const elapsed=performance.now()-started;assert(elapsed<2000,`Unexpected calculation cost ${elapsed}ms`);
console.log(`Intelligent recommendations: scenarios, authoritative subset and 25 x 12-lane calculations passed (${elapsed.toFixed(1)} ms total).`);
