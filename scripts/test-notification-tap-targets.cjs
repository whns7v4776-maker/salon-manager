const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, { exports, require: () => ({ ICON_ASSET_VERSION: 'test' }), ...globals });
  return exports;
}
const { resolveOwnerNotificationTarget: resolve } = load('src/lib/push/owner-notification-target.ts');
const path = (payload) => resolve(payload)?.pathname;
assert.equal(path({ _pushEventType: 'custom', kind: 'frontend_customer_registered' }), '/(tabs)/clienti');
const booking = { _pushTarget: 'owner', type: 'booking_request_created', bookingRequestId: 'r1', appointmentDate: '2026-09-16', appointmentTime: '11:30' };
assert.equal(path(booking), '/(tabs)/agenda');
assert.equal(resolve(booking).params.requestId, 'r1');
assert.equal(resolve(booking).params.start, '2026-09-16');
assert.equal(resolve(booking).params.requestTime, '11:30');
assert.equal(path({ ...booking, appointmentDate: undefined }), '/(tabs)/prenotazioni');
for (const status of ['cancelled', 'rejected', 'expired']) {
  assert.equal(resolve({ ...booking, status }).params.section, 'cancelled');
}
assert.equal(resolve({ ...booking, type: 'booking_operator_change_response', response: 'accepted' }).params.section, 'accepted');
for (const payload of [
  { ...booking, _pushTarget: 'client' }, { ...booking, _pushAudience: 'public' },
  { ...booking, _badgeOnly: true }, { ...booking, _badgeOnly: 'true' },
  { ...booking, _playInAppBannerSound: true }, { type: 'owner_badge_refresh' },
  { url: 'https://example.invalid', type: 'unknown' }
]) assert.equal(resolve(payload), null);
assert.equal(resolve({ ...booking, salonCode: 'other' }, 'mine'), null);
assert.equal(resolve({ ...booking, salonCode: ' MINE ' }, 'mine').pathname, '/(tabs)/agenda');
assert.equal(resolve({ ...booking, _pushWorkspaceId: 'other' }, 'mine', 'current'), null);
assert.equal(path({_pushTarget:'owner',type:'shop_order',shopOrderId:'order1'}), '/(tabs)/cassa');
assert.equal(resolve({_pushTarget:'client',type:'shop_order'}), null);
const declinedPayment={_pushTarget:'owner',type:'cash_terminal_outcome',workspaceId:'current',movementId:'movement1'};
assert.equal(resolve(declinedPayment,'mine','current').pathname,'/(tabs)/cassa');
assert.equal(resolve({...declinedPayment,_pushTarget:'client'},'mine','current'),null);
assert.equal(resolve({...declinedPayment,workspaceId:'other'},'mine','current'),null);
const notifications = [];
let focused = 0, tapped = 0, closed = 0;
class FakeNotification {
  static permission = 'granted';
  constructor() { notifications.push(this); }
  close() { closed++; }
}
const { showWebNotification } = load('src/lib/push/web-notifications.ts', {
  window: { Notification: FakeNotification, focus: () => focused++ },
  document: { visibilityState: 'hidden', hasFocus: () => false }
});
(async () => {
assert.equal(await showWebNotification({ title: 'Test', body: 'Test', onPress: () => tapped++ }), true);
assert.equal(tapped, 0, 'Receipt must not navigate');
notifications[0].onclick();
assert.equal(tapped, 1); assert.equal(focused, 1); assert.equal(closed, 1);
console.log('PASS: owner destinations, request details, audience/salon isolation, silent events, browser click dispatch.');
})().catch(error=>{console.error(error);process.exitCode=1;});
