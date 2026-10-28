const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
for (const platform of ['android', 'ios']) for (const step of ['Day', 'Operator', 'Time']) {
  const start = source.indexOf(`const scheduleNativeBooking${step}StepAutoScroll = useCallback(() => {`);
  const bodyStart = source.indexOf('{', start) + 1;
  const end = source.indexOf('\n  }, [', bodyStart);
  let queue = [], scrolls = 0, target = null;
  const generation = { current: 0 }, layout = { current: { y: 0, height: 200 } };
  const context = {
    isWeb: false, height: 800, Platform: { OS: platform },
    androidBookingViewportRef: { current: { height: 800, bottomInset: 100 } },
    nativeBookingLayoutScrollRef: { current: null },
    bookingDayContextVisibleRef: { current: false },
    bookingDependencyLayoutRef: { current: {y: 0, height: 0} },
    [`nativeBooking${step}AutoScrollGenerationRef`]: generation,
    [`booking${step}SectionLayoutRef`]: layout,
    [`booking${step}SectionY`]: 0,
    [`booking${step}SectionHeight`]: 200,
    [`booking${step}SectionRef`]: {},
    [`didAutoScrollBooking${step}StepRef`]: { current: false },
    requestAnimationFrame: fn => queue.push(fn), setTimeout: fn => queue.push(fn),
    scrollFrontendToY: y => { target = y; scrolls++; }, scrollBookingSectionIntoView: () => scrolls++,
  };
  const run = () => vm.runInNewContext(`(function(){${source.slice(bodyStart,end).replace(/: number \| null/g, '')}})()`, context);
  run(); queue.shift()(); assert.equal(scrolls, 0, `${step}: wait for layout`);
  layout.current.y = 500; queue.forEach(fn => fn());
  assert.equal(scrolls, 1, `${step}: valid layout scrolls exactly once across retries`);
  assert.equal(target, platform === 'android' ? 250 : 500 - ({Day:48,Operator:24,Time:18}[step]), `${platform} ${step}: expected alignment`);
  layout.current.y = 650; queue.forEach(fn => fn());
  assert.equal(scrolls, 2, `${step}: follows a layout change after the first valid measurement`);
  queue.forEach(fn => fn());
  assert.equal(scrolls, 2, `${step}: unchanged target never restarts animation`);
  queue = []; run(); generation.current++; queue.forEach(fn => fn());
  assert.equal(scrolls, 2, `${step}: cancelled generation cannot scroll`);
  queue = []; context.isWeb = true; run(); assert.equal(queue.length, 0);
}
const tabs = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');
const start = tabs.indexOf('    const nextCount =', tabs.indexOf('const [stableOwnerRequestsBadgeCount'));
const end = tabs.indexOf('    setStableOwnerRequestsBadgeCount', start);
const count = (remote, local) => vm.runInNewContext(`${tabs.slice(start,end)}nextCount`, { IS_WEB: false, remoteOwnerUnreadRequestsCount: remote, localOwnerUnreadRequestEventsCount: local });
assert.equal(count(0,16),0, 'refresh must not expose 16 local composition events');
assert.equal(count(3,16),3, 'real unread requests stay visible');
assert.equal(count(0,0),0, 'read requests clear the cache');
console.log('PASS: native scroll retries, cancellation, web isolation and request badge fallback');
const agenda = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const summaryStart = agenda.indexOf('const weekAppointmentDetailsWholeServiceSummary = useMemo(() => {');
const summaryBody = agenda.indexOf('{', summaryStart) + 1;
const summaryEnd = agenda.indexOf('\n  }, [', summaryBody);
const phases = [
 { id: 'a', appointmentGroupId: 'g', servizio: 'Colore', ora: '10:00', operatoreNome: 'Sara', pause: 0 },
 { id: 'b', appointmentGroupId: 'g', servizio: 'Piega', ora: '10:30', operatoreNome: 'Sara', pause: 25 },
 { id: 'c', appointmentGroupId: 'g', servizio: 'Balayage', ora: '11:25', operatoreNome: 'Marco', pause: 0 },
];
const getSummary = () => vm.runInNewContext(`(function(){${agenda.slice(summaryBody,summaryEnd)}})()`, {
 weekAppointmentDetails: phases[1], getLinkedReorganizationAppointments: () => phases,
 normalizeWeekReorganizationPauseMinutes: v => v, resolveWeekLinkedPauseAfterMinutes: v => v.pause,
 getAppointmentEndTime: () => '12:25',
});
let summary = getSummary();
assert.equal(summary.phases[2].operator,'Marco');
assert.equal(summary.phases[1].pauseMinutes,25);
assert.equal(summary.detailLabel,'10:00–12:25');
phases[2].operatoreNome = 'Alex';
assert.equal(getSummary().phases[2].operator,'Alex','summary follows updated phase operator');
console.log('PASS: phase-specific operators, pose and time-only footer');
for (const kind of ['TimeStepTop', 'Section']) {
 const start = source.indexOf(`  const scheduleWebBooking${kind}Scroll = useCallback(`);
 const bodyStart = kind === 'TimeStepTop' ? source.indexOf('{',start)+1 : source.indexOf('    ) => {',start)+10;
 const end = kind === 'TimeStepTop' ? source.indexOf('\n  }, [',bodyStart) : source.indexOf('\n    },',bodyStart);
 let queue=[], scrolls=0;
 const ctx={ Platform:{OS:'web'}, requestAnimationFrame: fn=>queue.push(fn), setTimeout: fn=>queue.push(fn),
   blurActiveWebElement:()=>{}, scrollBookingStepDomIntoView:()=>{scrolls++;return true;},
   BOOKING_TIME_SECTION_DOM_ID:'time', bookingTimeSectionLayoutRef:{current:{y:500}}, bookingTimeSectionY:500,
   isChromeOrEdgeBrowserUserAgent:()=>false, isEdgeBrowserUserAgent:()=>false,
   additionalOffset:0, sectionDomId:'day', sectionY:500, sectionHeight:200, sectionRef:{},
 };
 vm.runInNewContext(`(function(){${source.slice(bodyStart,end)}})()`,ctx);
 while(queue.length)queue.shift()();
 assert.equal(scrolls,1,`${kind}: web scroll not restarted by retries`);
}
console.log('PASS: web booking step scroll retries');
