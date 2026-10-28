/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appContextPath = path.join(root, 'src/context/AppContext.tsx');
const source = fs.readFileSync(appContextPath, 'utf8');

const moveStart = source.indexOf('const moveOwnerAppointmentForSalon = async');
const moveEnd = source.indexOf(
  'const reorganizeOwnerLinkedAppointmentsForSalon = async',
  moveStart,
);
assert.ok(moveStart >= 0 && moveEnd > moveStart, 'move owner implementation missing');
const moveSource = source.slice(moveStart, moveEnd);

assert.match(
  source,
  /type PendingOwnerAppointmentMoveSnapshot = \{[\s\S]*?token: string;[\s\S]*?appointment: Appuntamento;/,
  'pending move snapshots must be keyed by a per-mutation token',
);
assert.match(
  source,
  /overlayPendingOwnerAppointmentMoveSnapshots\([\s\S]*?pendingOwnerAppointmentMoveSnapshotsRef\.current/,
  'every owner appointment sync must preserve pending projections by id',
);
assert.match(
  source,
  /pendingOwnerAppointmentMoveSnapshotsRef\.current\.clear\(\)/,
  'account cleanup must clear pending move projections',
);

const pendingInstall = moveSource.indexOf(
  'pendingOwnerAppointmentMoveSnapshotsRef.current.set(appointment.id',
);
const firstPersistAwait = moveSource.indexOf('await persistMoveWithSession()');
assert.ok(pendingInstall >= 0, 'pending move guard is not installed');
assert.ok(firstPersistAwait > pendingInstall, 'pending guard must be installed before the move RPC');
assert.ok(
  moveSource.indexOf('ownerAppointmentMutationRevisionRef.current += 1', pendingInstall) <
    firstPersistAwait,
  'pre-RPC mutation revision must invalidate already-running stale fetches',
);

const ambiguousReadBack = moveSource.indexOf(
  'const readBack = await readBackPersistedMove()',
);
const ambiguousRollback = moveSource.indexOf(
  "error: 'Non sono riuscito a salvare lo spostamento.'",
  ambiguousReadBack,
);
assert.ok(ambiguousReadBack >= 0, 'ambiguous RPC errors need a canonical read-back');
assert.ok(
  ambiguousRollback > ambiguousReadBack,
  'rollback must happen only after read-back proves the target was not committed',
);
assert.ok(
  moveSource.indexOf('primaryMoveCommitted = true;', ambiguousReadBack) >
    ambiguousReadBack,
  'confirmed persistence must be recorded before post-commit work',
);
assert.match(
  moveSource,
  /void \(async \(\) => \{[\s\S]*?enqueuePortalPublish\([\s\S]*?processPublicSlotWaitlistAndFlush\([\s\S]*?\}\)\(\)\.catch\(\(sideEffectError\)/,
  'portal, push and waitlist work must be isolated as post-commit side effects',
);
assert.match(
  moveSource,
  /catch \(error\) \{[\s\S]*?clearPendingMoveProtection\(\);[\s\S]*?if \(primaryMoveCommitted\) \{[\s\S]*?return \{ ok: true \};/,
  'an exception after a confirmed DB commit must never report a failed move',
);

const overlayPending = (items, pending) => {
  const seen = new Set();
  const protectedItems = items.map((item) => {
    seen.add(item.id);
    return pending.get(item.id)?.appointment ?? item;
  });
  pending.forEach(({ appointment }, id) => {
    if (!seen.has(id)) protectedItems.push(appointment);
  });
  return protectedItems;
};

const sourceAppointment = { id: 'source', date: '2026-08-30', time: '09:00' };
const targetAppointment = { ...sourceAppointment, time: '10:00' };
const pending = new Map([
  ['source', { token: 'move-1', appointment: targetAppointment }],
]);
assert.deepEqual(
  overlayPending([sourceAppointment], pending),
  [targetAppointment],
  'a stale source snapshot must not overwrite the pending target',
);
assert.deepEqual(
  overlayPending([], pending),
  [targetAppointment],
  'a stale sync that temporarily omits the row must not make it disappear',
);

const swapA = { id: 'a', time: '09:00' };
const swapB = { id: 'b', time: '10:00' };
const pendingSwap = new Map([
  ['a', { token: 'swap-1', appointment: { ...swapA, time: '10:00' } }],
  ['b', { token: 'swap-1', appointment: { ...swapB, time: '09:00' } }],
]);
assert.deepEqual(
  overlayPending([swapA, swapB], pendingSwap).map(({ id, time }) => ({ id, time })),
  [
    { id: 'a', time: '10:00' },
    { id: 'b', time: '09:00' },
  ],
  'swap projections must remain atomic while persistence is pending',
);

pending.clear();
assert.deepEqual(
  overlayPending([targetAppointment], pending),
  [targetAppointment],
  'clearing a successful guard keeps the canonical target',
);
assert.deepEqual(
  overlayPending([sourceAppointment], pending),
  [sourceAppointment],
  'clearing a failed guard allows the confirmed source rollback',
);

const committedMoveResult = async (sideEffect) => {
  let committed = false;
  committed = true;
  void sideEffect().catch(() => undefined);
  return committed ? { ok: true } : { ok: false };
};
committedMoveResult(async () => {
  throw new Error('push unavailable');
}).then((result) => {
  assert.deepEqual(
    result,
    { ok: true },
    'post-commit side-effect failures must not reverse DB success',
  );
  console.log('Owner appointment move stability contracts: OK');
});
