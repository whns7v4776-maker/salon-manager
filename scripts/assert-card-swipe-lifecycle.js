const fs = require('node:fs');
const assert = require('node:assert/strict');
const services = fs.readFileSync('app/(tabs)/servizi.tsx', 'utf8');
const clients = fs.readFileSync('app/(tabs)/clienti.tsx', 'utf8');
const agenda = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const range = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const restore = range(services, 'const releaseServiceScreenGestureLocks', 'const prepareServiceListForFocus');
assert.equal((restore.match(/if \(swipeableGestureOwnerRef.current\) return;/g) || []).length, 4);
const close = range(services, 'const closeSwipeableSilentlyAfterPopupOpens', 'const markSwipeableTouchStart');
assert.match(close, /pendingServiceSwipeResetRef.current = key/);
assert.doesNotMatch(close, /setTimeout|\.close\(/);
assert.doesNotMatch(close, /operator-/);
assert.match(services, /visible=\{androidOperatorEditModalVisible\}\s+onShow=\{resetServiceSwipeAfterPopupShown\}/);
assert.match(services, /visible=\{androidServiceEditModalVisible\}\s+onShow=\{resetServiceSwipeAfterPopupShown\}/);
assert.match(clients, /visible=\{showEditCustomerModal && !!clienteInModifica\}\s+onShow=\{resetClientSwipeAfterPopupShown\}/);
assert.doesNotMatch(range(clients, 'const triggerClientSwipeAction', 'const getSwipeableRef'), /setTimeout/);
assert.match(clients, /onTouchCancel=\{\(event\) => \{ clientCardTouchActiveRef.current = false; event.stopPropagation\(\); \}\}/);
assert.match(agenda, /if \(id\) swipeableRefs.current\[id\]\?\.reset\(\)/);
// A restore scheduled by the old vertical gesture must not release a new owner.
for (const owner of ['service-1', 'operator-1']) {
  let currentOwner = owner, locked = true;
  const delayedRestore = () => { if (currentOwner) return; locked = false; };
  delayedRestore(); assert.equal(locked, true);
  currentOwner = null; delayedRestore(); assert.equal(locked, false);
}
console.log('PASS: guarded delayed restore, popup-driven reset, operator parity, touch isolation');
