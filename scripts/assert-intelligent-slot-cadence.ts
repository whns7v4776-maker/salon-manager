import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { getIntelligentPublicSlotMinimum, activateIntelligentGuidedSlots } from '../src/lib/intelligent-slot-cadence';
import { buildPublicDisplayTimeSlots, getPublicSlotIntervalForDate, normalizeAvailabilitySettings, type SharedService } from '../src/lib/booking';
const settings = normalizeAvailabilitySettings({ slotIntervalMinutes: 5 });
const service = (minutes: number, changes: Partial<SharedService> & {soloComposizione?:boolean} = {}): SharedService & {soloComposizione?:boolean} =>
  ({ id: 's'+minutes, nome: 'Servizio '+minutes, prezzo: 20, durataMinuti: minutes, ...changes });
assert.equal(getIntelligentPublicSlotMinimum([service(20),service(30)],settings),10);
assert.equal(getIntelligentPublicSlotMinimum([service(15),service(40)],settings),5);
assert.equal(getIntelligentPublicSlotMinimum([service(20),service(40),service(15,{disponibileOnline:false})],settings),20);
assert.equal(getIntelligentPublicSlotMinimum([],settings),null);
assert.equal(getIntelligentPublicSlotMinimum([service(10,{disponibileOnline:false})],settings),null);
assert.equal(getIntelligentPublicSlotMinimum([service(420)],settings),210);
assert.equal(getIntelligentPublicSlotMinimum([service(12.5)],settings),5);
assert.equal(getIntelligentPublicSlotMinimum([service(Infinity)],settings),null);
assert.equal(getIntelligentPublicSlotMinimum([service(20),service(30)],normalizeAvailabilitySettings({...settings,appointmentBufferEnabled:true,appointmentBufferMinutes:5})),5);
const phase = {version:1 as const,mode:'phased' as const,initialDurationMinutes:10,processingDurationMinutes:30,finalDurationMinutes:20,initialLabel:'Colore',processingLabel:'Posa',finalServiceName:'Piega',sameOperator:false,allowFrontendSplitOperators:true};
assert.equal(getIntelligentPublicSlotMinimum([service(999,{phaseConfig:phase})],settings),10,'Use actual phases, including reusable processing boundaries');
const child20=service(20,{soloComposizione:true}), child30=service(30,{soloComposizione:true});
const composition=service(999,{id:'composition',compositionId:'composition',compositionItems:[
 {serviceId:child20.id,serviceName:child20.nome,durationMinutes:20,price:20,position:0},
 {serviceId:child30.id,serviceName:child30.nome,durationMinutes:30,durationOverrideMinutes:25,price:20,position:1}]});
assert.equal(getIntelligentPublicSlotMinimum([child20,child30,composition],settings),5,'Composition overrides affect the cadence');
assert.equal(getIntelligentPublicSlotMinimum([child20,child30],settings),null,'Composition-only children are not standalone online offers');
const linked=service(20,{linkedServiceConfig:{version:1,dependencyMode:'automatic',requiredServiceIds:['s30'],suggestedServiceIds:[]}});
assert.equal(getIntelligentPublicSlotMinimum([linked,child30],settings),10);
assert.equal(getIntelligentPublicSlotMinimum([linked],settings),null,'A broken dependency must not supply a cadence');
const broken=service(40,{compositionId:'broken',compositionItems:[{serviceId:'missing',serviceName:'Missing',durationMinutes:15,price:1,position:0}]});
assert.equal(getIntelligentPublicSlotMinimum([broken],settings),null);
const cyclic={...broken,id:'cycle',compositionItems:[{serviceId:'cycle',serviceName:'Cycle',durationMinutes:15,price:1,position:0}]};
assert.equal(getIntelligentPublicSlotMinimum([cyclic],settings),null);
const before=structuredClone(settings);
const activated=activateIntelligentGuidedSlots(settings,[service(20),service(30)]);
assert.deepEqual(settings,before,'Activation must not mutate the original settings');
assert.equal(activated.publicSlotMinimumIntervalMinutes,10);
assert.equal(activated.guidedSlotsStrategy,'intelligent');
assert.equal(activated.guidedSlotsVisibility,'recommended_and_all');
assert.equal(activated.slotIntervalMinutes,settings.slotIntervalMinutes,'The internal agenda grid must not change');
assert.equal(activateIntelligentGuidedSlots(settings,[]).publicSlotMinimumIntervalMinutes,settings.publicSlotMinimumIntervalMinutes,'Empty catalogue keeps the previous cadence');
for(const step of [5,10,15,20]){
 const aligned=activateIntelligentGuidedSlots(normalizeAvailabilitySettings({...settings,slotIntervalMinutes:step}),[service(20),service(30)]);
 assert.equal(getPublicSlotIntervalForDate(aligned)%step,0,'Public starts must remain on the authoritative agenda grid');
}
const opening=normalizeAvailabilitySettings({...activated,weeklySchedule:[{weekday:4,isClosed:false,startTime:'09:00',endTime:'10:00'}]});
assert(buildPublicDisplayTimeSlots(opening,'2026-10-08').includes('09:30'),'Mixed 20/30-minute services must keep the 09:30 start');
const started=performance.now();
getIntelligentPublicSlotMinimum(Array.from({length:10000},(_,i)=>service((i%12+1)*5,{id:'service-'+i})),settings);
assert(performance.now()-started<1000,'Cadence calculation must stay local and inexpensive');
console.log('Intelligent initial cadence: mixed durations, phases, dependencies, compositions, empty catalogue, buffers and unchanged agenda passed.');
