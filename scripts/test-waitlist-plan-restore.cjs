const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const s=fs.readFileSync('app/cliente-screen.tsx','utf8');
const start=s.indexOf('  const openWaitlistAlertInBooking =');
const end=s.indexOf('  const buildWaitlistAlertRenderKey',start);
const state={};const events=[];const ctx={effectiveServizi:[{id:'service-1',nome:'Colore'}],effectiveOperatori:[{id:'operator-1',nome:'Alex'}],
 normalizeIdentityText:s=>s.toLowerCase(),isSalonCapacityOperatorId:()=>false,dependencyParentServiceIdRef:{current:''},
 latestBookingDateRef:{current:'2026-09-19'},requestSilentLivePublicSlotAvailabilityRefresh(){events.push('invalidate')},
 markWaitlistAlertAsViewed(){},refreshPublicSalonAvailability:async()=>{events.push('refresh:'+ctx.latestBookingDateRef.current)},selectFrontendClientTab(){},requestAnimationFrame:()=>{}};
for(const key of ['SelectedDependencyServiceId','Servizio','SelectedServiceId','Data','HasConfirmedBookingDay','OperatoreId','OperatoreNome','Ora'])ctx['set'+key]=v=>{state[key]=v};
vm.createContext(ctx);vm.runInContext(ts.transpileModule(s.slice(start,end)+'\nglobalThis.open=openWaitlistAlertInBooking;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,ctx);
ctx.open({id:'alert',appointment_date:'2026-10-01',appointment_time:'10:00:00',requested_service_name:'Colore',requested_operator_id:'operator-1',booking_plan:{serviceId:'service-1',dependencyServiceId:'service-2'}});
assert.equal(state.SelectedDependencyServiceId,'service-2');assert.equal(state.SelectedServiceId,'service-1');assert.equal(ctx.dependencyParentServiceIdRef.current,'service-1');assert.equal(state.OperatoreId,'operator-1');assert.equal(state.Ora,'10:00');assert.equal(state.HasConfirmedBookingDay,true);
console.log('PASS: notification restores parent, added service, operator, date/time without clearing the added service');

assert.equal(ctx.latestBookingDateRef.current,'2026-10-01');assert.deepEqual(events,['invalidate','refresh:2026-10-01']);
console.log('PASS: released slot invalidates stale availability and refreshes the restored day');
