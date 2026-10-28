const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const helper = source.match(/const isClientPeriodicRefreshVisible = \(\) => \{[\s\S]*?\n\};/)[0];
const tick = source.match(/const intervalId = setInterval\(\(\) => \{\n\s*if \(!isClientPeriodicRefreshVisible\(\)\) return;[\s\S]*?\}, FRONTEND_PASSIVE_REFRESH_MS\);/)[0];
for (const { os, hidden, state, expected } of [
  { os: 'web', hidden: true, state: 'active', expected: 0 },
  { os: 'web', hidden: false, state: 'active', expected: 4 },
  { os: 'ios', hidden: false, state: 'background', expected: 0 },
  { os: 'android', hidden: false, state: 'inactive', expected: 0 },
  { os: 'ios', hidden: false, state: 'active', expected: 4 },
  { os: 'android', hidden: false, state: 'active', expected: 4 },
]) {
  let calls = 0;
  let scheduled;
  const context = {
    Platform: { OS: os }, AppState: { currentState: state }, document: { hidden },
    FRONTEND_PASSIVE_REFRESH_MS: 15000,
    setInterval(fn, delay) { scheduled = fn; assert.equal(delay, 15000); },
    refreshBadges() { calls++; }, refreshClientDbUnreadBookingRows() { calls++; },
    refreshPublicSalonAvailability() { calls++; }, refreshFrontendWaitlistState() { calls++; },
  };
  vm.runInNewContext(helper + '\n' + tick, context);
  scheduled();
  assert.equal(calls, expected, `${os}/${state}/hidden=${hidden}`);
  // Visibility changes must resume the existing timer without remounting.
  context.document.hidden = false;
  context.AppState.currentState = 'active';
  scheduled();
  assert.equal(calls, expected + 4);
}
console.log('PASS: hidden/background clients issue no periodic requests; visible clients resume on the next tick.');
(async () => {
  const liveTick = source.match(/let refreshInFlight = false;\n\s*const interval = setInterval\(\(\) => \{[\s\S]*?\}, refreshIntervalMs\);/)[0];
  let scheduled;
  let complete;
  let settings = 0;
  let occupancy = 0;
  let pending = new Promise(resolve => { complete = resolve; });
  const context = {
    Platform: { OS: 'ios' }, AppState: { currentState: 'active' },
    isBookingStarted: true, isFrontendRequestsRoute: false, refreshIntervalMs: 1200,
    setInterval(fn) { scheduled = fn; },
    refreshPublicAvailabilitySettingsOnly() { settings++; return pending; },
    refreshBackendDayOccupancy() { occupancy++; return pending; },
    refreshPublicSalonAvailability() { throw new Error('Live tick reloaded the complete portal'); },
  };
  vm.runInNewContext(helper + '\n' + liveTick, context);
  scheduled(); scheduled();
  assert.equal(settings, 1);
  assert.equal(occupancy, 1);
  complete();
  await new Promise(setImmediate);
  pending = Promise.resolve();
  scheduled();
  assert.equal(settings, 2);
  assert.equal(occupancy, 2);
  await new Promise(setImmediate);
  context.AppState.currentState = 'background';
  scheduled();
  assert.equal(settings, 2);
  console.log('PASS: live booking refresh reads only settings/day occupancy, coalesces slow ticks, and pauses in background.');
})().catch(error => { console.error(error); process.exitCode = 1; });
