/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const unreadBadgeContext = read('src/context/UnreadBadgeContext.tsx');
const androidBadgeCarrier = read('src/lib/android-launcher-badge-carrier.ts');
const badgeSync = read('src/lib/notification-badge-sync.ts');
const unreadBadges = read('src/lib/badges/unread-badges.ts');
const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const clientScreen = read('app/cliente-screen.tsx');

assert.match(
  unreadBadgeContext,
  /nativeRefreshInFlightRef[\s\S]*?nativeRefreshRerunRequestedRef[\s\S]*?latestNativeRefreshRequestRef/,
  'Native badge refreshes must share one in-flight request and retain one trailing rerun.',
);
assert.match(
  unreadBadgeContext,
  /if \(nativeRefreshInFlightRef\.current\) \{[\s\S]*?nativeRefreshRerunRequestedRef\.current = true;[\s\S]*?await nativeRefreshInFlightRef\.current\.promise/,
  'An overlapping native refresh must join the in-flight request and request a trailing pass.',
);
assert.match(
  unreadBadgeContext,
  /const nextSnapshot = await fetchUnreadBadgeSnapshot\(request\.identity\);[\s\S]*?snapshotRef\.current = snapshotToCommit;[\s\S]*?setSnapshot\(snapshotToCommit\);[\s\S]*?syncBadgeSnapshotToAppIcon\(snapshotToCommit[\s\S]*?\} while \([\s\S]*?nativeRefreshRerunRequestedRef\.current/,
  'Every successful native snapshot must update internal state and launcher before a trailing rerun.',
);
assert.match(
  unreadBadgeContext,
  /nativeRefreshInFlightRef\.current = null;[\s\S]*?nativeRefreshDrain\.resolve\(finalResult\);/,
  'A settled drain must be cleared before resolving so a late refresh cannot lose its rerun.',
);
assert.match(
  unreadBadgeContext,
  /if \(Platform\.OS === 'web'\) \{[\s\S]*?const requestSeq = refreshSeqRef\.current \+ 1;[\s\S]*?refreshSeqRef\.current === requestSeq/,
  'Web must retain its existing sequence-gated refresh branch.',
);

assert.match(
  androidBadgeCarrier,
  /getDisplayedNotifications\(\)[\s\S]*?ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID[\s\S]*?notification\.data\?\.unreadCount[\s\S]*?notification\.android\?\.badgeCount/,
  'Android cold start must restore the exact count from the private displayed carrier.',
);
assert.doesNotMatch(
  androidBadgeCarrier,
  /default\.getBadgeCount\(\)/,
  'Android must not bootstrap from Notifee getBadgeCount, which is iOS-only.',
);

assert.match(
  clientScreen,
  /const frontendNotificationTabBadgeCount = effectiveNotificheRisposteCount;[\s\S]*?const frontendCommunicationTabBadgeCount = clientNotificationCommunicationUnreadCount;/,
  'Native client tabs must use the authoritative count for their own inbox.',
);
assert.match(
  clientScreen,
  /key: 'notifications',[\s\S]*?badge: frontendNotificationTabBadgeCount[\s\S]*?key: 'communications',[\s\S]*?badge: frontendCommunicationTabBadgeCount[\s\S]*?key: 'waitlist',[\s\S]*?badge: waitlistUnreadCount/,
  'The native custom bar must render three disjoint inbox badge counts.',
);

assert.match(
  unreadBadgeContext,
  /const optimisticallyDecrementClientBookingUnread = useCallback\([\s\S]*?Platform\.OS === 'web'[\s\S]*?activeIdentity\?\.audience !== 'client'[\s\S]*?activeIdentityKeyRef\.current !== activeIdentityKey[\s\S]*?snapshotIdentityKeyRef\.current !== activeIdentityKey/,
  'Optimistic booking decrements must be native-only and scoped to the current client identity snapshot.',
);
assert.match(
  unreadBadgeContext,
  /logicalEventKeys: readonly string\[\][\s\S]*?currentSnapshot\.clientBookingUnreadLogicalKeys[\s\S]*?currentLogicalKeys\.has\(logicalKey\) && !pendingLogicalKeys\.has\(logicalKey\)[\s\S]*?const appliedLogicalCount = appliedLogicalKeys\.length[\s\S]*?buildClientBookingUnreadSnapshot\([\s\S]*?currentBookingUnread - appliedLogicalCount/,
  'Optimistic decrements must accept exact keys, ignore duplicates/non-unread keys, and clamp the booking count.',
);
assert.match(
  unreadBadgeContext,
  /decrementApplicationBadgeCountFloor\(appliedLogicalCount\);[\s\S]*?syncApplicationBadgeCount\(nextSnapshot\.totalUnread/,
  'The native icon must decrement immediately by the same logical count as React state.',
);
assert.match(
  unreadBadgeContext,
  /request\.reconcileOptimisticClientBookingUnread[\s\S]*?pendingOptimisticClientBookingDecrementRef\.current = null;[\s\S]*?shouldReconcileOptimisticFloor = true/,
  'An explicit successful post-RPC refresh must reconcile the optimistic snapshot exactly.',
);
assert.match(
  unreadBadgeContext,
  /const authoritativeLogicalKeys = new Set\([\s\S]*?const unresolvedLogicalKeys = new Set\([\s\S]*?authoritativeLogicalKeys\.has\(logicalKey\)[\s\S]*?authoritativeBookingUnread - unresolvedLogicalKeys\.size[\s\S]*?!unresolvedLogicalKeys\.has/,
  'Poll/realtime refreshes must subtract only unresolved exact keys so persisted reads are not double-counted and new notifications stay visible.',
);
assert.match(
  unreadBadgeContext,
  /nextPendingLogicalKeys[\s\S]*?appliedLogicalKeys\.forEach[\s\S]*?logicalKeys: nextPendingLogicalKeys/,
  'Pending optimistic reads must retain exact identity-scoped keys until server reconciliation.',
);
assert.match(
  unreadBadges,
  /clientBookingUnreadLogicalKeys\?: string\[\][\s\S]*?appointment_group_id[\s\S]*?`group:\$\{groupId\}`[\s\S]*?`request:\$\{requestId\}`[\s\S]*?clientBookingUnreadLogicalKeys: bookingLogicalKeys/,
  'The authoritative client snapshot must expose the same group-or-request logical keys used by the UI.',
);
assert.match(
  badgeSync,
  /decrementApplicationBadgeCountFloor[\s\S]*?badgeCountFloor = Math\.max\(0, badgeCountFloor - normalizedCount\)/,
  'Android push floor adjustment must subtract only the viewed logical count and clamp at zero.',
);
assert.match(
  clientNotifications,
  /refreshClientUnreadFromDB: \(options\?:[\s\S]*?reconcileOptimisticClientBookingUnread[\s\S]*?optimisticallyDecrementClientBookingUnread: \([\s\S]*?logicalCount: number,[\s\S]*?logicalEventKeys: readonly string\[\][\s\S]*?refreshBadges\(\{[\s\S]*?reconcileOptimisticClientBookingUnread:[\s\S]*?optimisticallyDecrementClientBookingUnread,[\s\S]*?refreshClientUnreadFromDB/,
  'ClientNotificationsContext must expose the scoped optimistic booking decrement to the frontend.',
);
assert.match(
  clientScreen,
  /optimisticallyDecrementClientBookingUnread\(\s*(?:unreadLogicalKeys|matchedLogicalKeys)\.length,\s*(?:unreadLogicalKeys|matchedLogicalKeys)\s*\)/,
  'The native client must pass the exact logical keys it just marked as viewed.',
);

console.log('Client Android badge single-source contract: OK');
