import assert from 'node:assert/strict';
import { buildPublicDisplayTimeSlots, getPublicAdjacentAppointmentStarts, normalizeAvailabilitySettings } from '../src/lib/booking';
const date='2026-10-05';
const settings=normalizeAvailabilitySettings({slotIntervalMinutes:30,publicSlotIntervalMode:'follow_agenda',weeklySchedule:[{weekday:1,isClosed:false,startTime:'09:00',endTime:'12:00'}]});
const appointment={id:'a',data:date,ora:'09:30',durataMinuti:50,cliente:'',servizio:'Taglio',prezzo:0,operatoreId:'a'};
const starts=getPublicAdjacentAppointmentStarts([appointment],[],date,'a');
assert.deepEqual(starts,['10:20']);
const baseline=buildPublicDisplayTimeSlots(settings,date);
const augmented=buildPublicDisplayTimeSlots(settings,date,starts);
assert(augmented.includes('10:20'));
assert(baseline.every(t=>augmented.includes(t)));
assert.deepEqual(buildPublicDisplayTimeSlots(settings,date,[]),baseline);
assert.deepEqual(getPublicAdjacentAppointmentStarts([appointment],[],date,'b'),[]);
assert.deepEqual(getPublicAdjacentAppointmentStarts([appointment],[],'2026-10-06'),[]);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,durataMinuti:undefined}],[],date),[]);
assert.equal(buildPublicDisplayTimeSlots(settings,date,['12:00','08:50','10:20','10:20']).filter(t=>t==='10:20').length,1);
assert(!buildPublicDisplayTimeSlots(settings,date,['12:00']).includes('12:00'));
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,ora:'23:30',durataMinuti:60}],[],date),[]);
console.log('PASS: adjacent starts, preserved grid, operator/date scope, deduplication, closing and unknown duration');

// Persisted appointment timing must not drift with later catalogue edits.
const service = { id:'s', nome:'Taglio', prezzo:20, durataMinuti:30, mestiereRichiesto:'Barber' };
assert.deepEqual(getPublicAdjacentAppointmentStarts([appointment],[service],date,'a'),['10:20']);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,durataMinuti:undefined}],[service],date,'a'),['10:00']);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,operatoreNome:'Alex'}],[],date,'b','Alex'),[]);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,ora:'09:99'}],[],date),[]);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,durataMinuti:undefined}],[{...service,durataMinuti:undefined}],date),[]);
const phaseConfig = {version:1 as const,mode:'phased' as const,initialLabel:'Colore',initialDurationMinutes:20,processingLabel:'Posa',processingDurationMinutes:30,finalPhaseEnabled:true,finalServiceName:'Piega',finalDurationMinutes:20,sameOperator:false,allowFrontendSplitOperators:true};
const phased = {...appointment,phaseConfig,phaseOperatorAssignments:{version:1 as const,initial:{id:'a',name:'Alex'},final:{id:'b',name:'Bea'}}};
assert.deepEqual(getPublicAdjacentAppointmentStarts([phased],[],date,'b'),['10:40']);
assert.deepEqual(getPublicAdjacentAppointmentStarts([phased],[],date,'a'),['09:50']);
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,ora:'10:00'}],[],date,'a'),['10:50']);
assert.deepEqual(getPublicAdjacentAppointmentStarts([],[],date,'a'),[]);

import { doesServiceFitWithinDaySchedule, doesServiceOverlapLunchBreak, doesServiceBookingConflictWithAppointment, getPublicEligibleOperatorsForService, getDateAvailabilityInfo } from '../src/lib/booking';
const operators: import('../src/lib/booking').SharedOperator[] = [{id:'a',nome:'Alex',mestiere:'Barber'},{id:'b',nome:'Bea',mestiere:'Hair Stylist'}];
const eligibility = (configuration=settings, staff=operators) => getPublicEligibleOperatorsForService({serviceName:'Taglio',services:[service],operators:staff,appointmentDate:date,settings:configuration});
assert.deepEqual(eligibility().map(o=>o.id),['a']);
assert.deepEqual(eligibility(settings,[operators[1]]),[]);
assert.deepEqual(eligibility(settings,[{...operators[0],availability:{enabledWeekdays:[2],dateRanges:[]}}]),[]);
const closed = {...settings,dateOverrides:[{date,closed:true,isClosed:true}]};
assert.equal(getDateAvailabilityInfo(closed,date).closed,true);
assert.deepEqual(eligibility(closed),[]);
const absent = {...settings,calendarExceptions:[{id:'absence',kind:'vacation' as const,startDate:date,endDate:date,allDay:true,scope:'operators' as const,operatorIds:['a']}]};
assert.deepEqual(eligibility(absent),[]);
assert.equal(doesServiceFitWithinDaySchedule({settings,dateValue:date,startTime:'11:50',durationMinutes:30}),false);
assert.equal(doesServiceFitWithinDaySchedule({settings,dateValue:date,startTime:'10:20',durationMinutes:30}),true);
assert.equal(doesServiceOverlapLunchBreak({settings:{...settings,lunchBreakEnabled:true,lunchBreakStart:'10:30',lunchBreakEnd:'11:00'},dateValue:date,startTime:'10:20',durationMinutes:30}),true);
assert.equal(doesServiceOverlapLunchBreak({settings:{...settings,calendarExceptions:[{id:'break',kind:'break',startDate:date,endDate:date,allDay:false,startTime:'10:25',endTime:'10:45',scope:'operators',operatorIds:['a']}]},dateValue:date,startTime:'10:20',durationMinutes:30,selectedOperatorId:'a'}),true);
assert.equal(doesServiceBookingConflictWithAppointment({startTime:'10:20',serviceName:'Taglio',appointment,services:[],settings}),false);
assert.equal(doesServiceBookingConflictWithAppointment({startTime:'10:20',serviceName:'Taglio',appointment:{...appointment,ora:'10:30'},services:[service],settings}),true);
for (const mode of ['follow_agenda','custom'] as const) {
  for (const interval of [5,10,15,20,30,60]) {
    const config={...settings,slotIntervalMinutes:interval,publicSlotIntervalMode:mode,publicSlotMinimumIntervalMinutes:30};
    const old=buildPublicDisplayTimeSlots(config,date);
    const next=buildPublicDisplayTimeSlots(config,date,['10:20']);
    assert(old.every(time=>next.includes(time)));
    assert(next.includes('10:20'));
    assert.equal(new Set(next).size,next.length);
  }
}
console.log('PASS: operator identity/change/absence, roles, phases, saved duration, closures, breaks, end of day, conflicts and 12 cadence combinations');

// Regression: operator release during processing, buffered release and force-open dates.
assert.deepEqual(getPublicAdjacentAppointmentStarts([phased],[],date), ['09:50','10:40']);
const buffered = {...settings, appointmentBufferEnabled:true, appointmentBufferMinutes:5};
assert.deepEqual(getPublicAdjacentAppointmentStarts([appointment],[],date,'a',undefined,buffered), ['10:25']);
assert(buildPublicDisplayTimeSlots(buffered,date,getPublicAdjacentAppointmentStarts([appointment],[],date,'a',undefined,buffered)).includes('10:25'));
assert.deepEqual(getPublicAdjacentAppointmentStarts([phased],[],date,'a',undefined,buffered), ['09:55']);
const reopened = {...settings, weeklySchedule:[{weekday:1,isClosed:true,startTime:'09:00',endTime:'12:00'}],dateOverrides:[{date,forceOpen:true}]};
assert.equal(getDateAvailabilityInfo(reopened,date).closed,false);
assert(buildPublicDisplayTimeSlots(reopened,date,['10:20']).includes('10:20'));
assert(!buildPublicDisplayTimeSlots({...reopened,dateOverrides:[]},date,['10:20']).includes('10:20'));
assert.deepEqual(getPublicAdjacentAppointmentStarts([{...appointment,ora:'23:35',durataMinuti:20}],[],date,'a',undefined,{...buffered,appointmentBufferMinutes:5}),[]);
console.log('PASS: phase release, buffer, exceptional opening and midnight buffer boundary');
