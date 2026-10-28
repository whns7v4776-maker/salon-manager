const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual snapshot publisher: both fresh responses and cache hits
// use it. A full date remains selectable for the availability waitlist.
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const start = source.indexOf('    const publishBlockSnapshot = (');
const end = source.indexOf('    type DaySummaryBlockResolutionState', start);
assert(start > 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end) + '\nglobalThis.publish = publishBlockSnapshot;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup() {
  const state = { confirmed: true, time: '10:00', summary: { planKey: 'vip-90-edoardo', statuses: {} }, active: true };
  const context = {
    isActive: () => state.active,
    livePublicDaySummaryCacheRef: { current: new Map() },
    FRONTEND_DAY_SUMMARY_CACHE_MAX_ENTRIES: 10,
    livePublicDaySummarySelectedDateRef: { current: '2026-10-03' },
    livePublicDaySummaryPriorityBlockKeyRef: { current: '' },
    livePublicDaySummaryBlockKeyByDate: { '2026-10-03': 'october', '2026-10-04': 'october' },
    livePublicDaySummaryInitialBlockKey: 'october',
    livePublicDaySummaryPlanKey: 'vip-90-edoardo',
    livePublicDaySummaryConfirmedDateRef: { current: true },
    livePublicDaySummaryStateRef: { current: state.summary },
    setDaySummaryFailedPlan: () => {},
    setHasConfirmedBookingDay: value => { state.confirmed = value; },
    setOra: value => { state.time = value; },
    setLivePublicDaySummaryState: update => { state.summary = update(state.summary); },
    scheduleSnapshotTtl: () => {},
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  return { state, context };
}
const full = { blockKey: 'october', statuses: { '2026-10-03': 'full' } };
for (const scenario of ['fresh response', 'exit and reopen booking', 'another day then return']) {
  const { state, context: c } = setup();
  if (scenario !== 'fresh response') {
    c.publish(full, 'cached');
    if (scenario === 'another day then return') {
      c.livePublicDaySummarySelectedDateRef.current = '2026-10-04';
      c.publish({ blockKey: 'october', statuses: { '2026-10-04': 'available' } }, 'other');
    }
    state.confirmed = true;
    c.livePublicDaySummaryConfirmedDateRef.current = true;
    c.livePublicDaySummarySelectedDateRef.current = '2026-10-03';
    state.time = '10:00';
  }
  c.publish(c.livePublicDaySummaryCacheRef.current.get('cached') || full, 'cached');
  assert.equal(state.confirmed, true, `${scenario}: keep day open for waitlist`);
  assert.equal(c.livePublicDaySummaryConfirmedDateRef.current, true);
  assert.equal(state.time, '', `${scenario}: discard unavailable selected time`);
  assert.equal(state.summary.statuses['2026-10-03'], 'full');
}
{
  const { state, context: c } = setup();
  c.publish({ blockKey: 'october', statuses: { '2026-10-04': 'full' } }, 'other');
  assert.equal(state.time, '10:00', 'Other full date cannot clear current time');
  c.publish({ blockKey: 'october', statuses: { '2026-10-03': 'available' } }, 'available');
  assert.equal(state.time, '10:00', 'Available date retains current time');
  state.active = false;
  assert.equal(c.publish(full, 'late'), false);
  assert.equal(state.time, '10:00', 'Late response cannot change selection');
}
{
  const guardStart = source.indexOf('  const isDayDisabled = useCallback(');
  const guardEnd = source.indexOf('  const centerDay = useCallback(', guardStart);
  assert(guardStart > 0 && guardEnd > guardStart);
  const c = { useCallback: fn => fn, availabilitySettings: {}, canChooseDay: true,
    today: '2026-09-30', isDayAuthorityCurrent: date => date !== '2026-10-07',
    getDateAvailabilityInfo: (_,date) => ({closed:date === '2026-10-06'}),
    isDayFullForService: date => date === '2026-10-03' ? true : date === '2026-10-05' ? null : false };
  vm.createContext(c);
  vm.runInContext(ts.transpileModule(source.slice(guardStart,guardEnd) + '\nglobalThis.disabled = isDayDisabled;', {
    compilerOptions: {target:ts.ScriptTarget.ES2022},
  }).outputText,c);
  assert.equal(c.disabled('2026-10-03'),false,'A verified full day opens for alerts');
  assert.equal(c.disabled('2026-10-04'),false,'Available day stays selectable');
  for(const date of ['2026-10-05','2026-10-06','2026-10-07','2026-09-29'])
    assert.equal(c.disabled(date),true,'Unknown, closed, stale and past dates remain disabled');
}
console.log('PASS full-day selection survives fresh/cached publication and reentry; unavailable time cleared; other dates and stale requests isolated; full-day access preserves date guards.');
