/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const clientScreen = read('app/cliente-screen.tsx');
const appContext = read('src/context/AppContext.tsx');

const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const bookingPreflight = sliceBetween(
  clientScreen,
  'const normalizedBookingSalonCode =',
  'let sameDayRepeatConflictForConfirmation =',
);
const policyPromiseIndex = bookingPreflight.indexOf('refreshCustomerOnlineBookingPolicy()');
const publicStatePromiseIndex = bookingPreflight.indexOf('verifyPublicSalonStateForBooking(');
const joinedAwaitIndex = bookingPreflight.indexOf('await Promise.all([');
assert.ok(policyPromiseIndex >= 0, 'Booking must still refresh the customer online-booking policy.');
assert.ok(publicStatePromiseIndex >= 0, 'Booking must still verify the authoritative public salon state.');
assert.ok(
  joinedAwaitIndex > policyPromiseIndex && joinedAwaitIndex > publicStatePromiseIndex,
  'Independent booking preflight reads must start before their shared await.',
);
assert.match(
  bookingPreflight,
  /await Promise\.all\(\[\s*latestCustomerOnlinePolicyPromise,\s*freshPublicSalonStatePromise,?\s*\]\)/,
  'Policy and public-state preflight reads must run in parallel.',
);
assert.match(
  bookingPreflight,
  /confirmedCustomerPolicy\?\.identityKey === bookingCustomerPolicyIdentityKey[\s\S]*?confirmedCustomerPolicy\.confirmedAt <= FRONTEND_CUSTOMER_POLICY_WARM_MAX_AGE_MS/,
  'A warm policy may be reused only for the same client identity and inside its strict freshness window.',
);
assert.match(
  bookingPreflight,
  /authoritativeCatalog\.salonCode === normalizedBookingSalonCode[\s\S]*?authoritativeCatalog\.confirmedAt <= FRONTEND_BOOKING_PREFLIGHT_WARM_MAX_AGE_MS[\s\S]*?buildFrontendServicesSignature\(latestSalonSnapshot\.servizi\) === authoritativeCatalog\.servicesSignature[\s\S]*?latestSnapshotContainsSelectedService/,
  'A warm catalog may be reused only for the same salon, unchanged service catalog, selected service and strict freshness window.',
);
assert.match(
  clientScreen,
  /const submitPromise = addBookingRequestForSalon\([\s\S]*?const saved = await Promise\.race/,
  'The final booking mutation must remain the authoritative server path after any warm UI preflight.',
);
assert.match(
  clientScreen,
  /Parte mentre il cliente completa giorno\/operatore\/orario[\s\S]*?void refreshPublicSalonState\(\)[\s\S]*?void refreshCustomerOnlineBookingPolicy\(\)/,
  'Catalog and customer policy must prefetch in the background after service selection.',
);

const earlySubmitReconciliation = sliceBetween(
  clientScreen,
  'const earlySubmitReconciliationPromise =',
  'const saved = await Promise.race([',
);
assert.match(
  earlySubmitReconciliation,
  /for \(const delayMs of \[180, 320, 600, 1000, 1600, 2400\]\)/,
  'Committed bookings must be discoverable early while a slow submit acknowledgement is pending.',
);
assert.match(
  earlySubmitReconciliation,
  /findActiveBookingRequestForSalon\([\s\S]*?nextRequest/,
  'Early completion must remain an authoritative idempotent server lookup.',
);
assert.doesNotMatch(
  earlySubmitReconciliation,
  /resolve\(\{ ok: true(?!, request: authoritativeRequest)/,
  'Early completion must never synthesize success without an authoritative saved request.',
);

const cancelContextBlock = sliceBetween(
  appContext,
  'const cancelClientAppointmentForSalon = async ({',
  'const cancelOwnerAppointmentForSalon = async ({',
);
assert.match(
  cancelContextBlock,
  /resolveSalonByCode\(normalizedCode, \{[\s\S]*?allowCachedPublicSnapshot: true[\s\S]*?cachedPublicSnapshotMaxAgeMs: 5 \* 60 \* 1000/,
  'Client cancellation must reuse the freshly loaded public snapshot before the atomic RPC.',
);
assert.match(
  cancelContextBlock,
  /if \(persistedRequestCancellationFailed\)[\s\S]*?return \{[\s\S]*?ok: false[\s\S]*?if \(cancelError && !isLegacySnapshotOnlyRequest\)[\s\S]*?return \{[\s\S]*?ok: false[\s\S]*?notifyPersistedCancellation\(\);/,
  'The persisted callback must run only after authoritative cancellation error checks pass.',
);
assert.match(
  cancelContextBlock,
  /notifyPersistedCancellation\(\);[\s\S]*?latestResolved = await resolveSalonByCode\(normalizedCode\)/,
  'Slow snapshot reconciliation must happen after the authoritative persisted callback.',
);
assert.match(
  cancelContextBlock,
  /effectiveRequestToCancel\.stato === 'Accettata' &&[\s\S]*?!isUuid\(persistRequestId\)[\s\S]*?invokeFindPublicBookingRequestByCompositeRpcCompat/,
  'A persisted accepted request must go straight to atomic cancellation; composite lookup remains fallback-only.',
);

const cancelCallerBlock = sliceBetween(
  clientScreen,
  'const result = await cancelClientAppointmentForSalon({',
  'if (!result.ok)',
);
assert.match(
  cancelCallerBlock,
  /onPersisted: \(\) => \{[\s\S]*?clearCancelDialogFreeze\(requestId\);[\s\S]*?setCancellingRequestId/,
  'The cancellation spinner must stop as soon as the atomic mutation is confirmed.',
);
assert.match(
  clientScreen,
  /cancellingRequestIdsRef\.current\.add\(requestId\)[\s\S]*?finally \{[\s\S]*?cancellingRequestIdsRef\.current\.delete\(requestId\)/,
  'Duplicate cancellation taps must remain blocked until all post-success work settles.',
);

const markViewedBlock = sliceBetween(
  clientScreen,
  'const markFrontendBookingRequestsAsViewed = useCallback(',
  '// Il retry di cold-start deve restare stabile',
);
const localViewedIndex = markViewedBlock.indexOf(
  'setLocallyViewedFrontendRequestKeys',
);
const globalOptimisticIndex = markViewedBlock.indexOf('optimisticallyDecrementClientBookingUnread(');
const viewedRpcIndex = markViewedBlock.indexOf(
  "'mark_public_booking_notification_events_viewed_v2'",
);
assert.ok(localViewedIndex >= 0 && viewedRpcIndex > localViewedIndex, 'Seen UI must update before remote persistence.');
assert.ok(
  globalOptimisticIndex > localViewedIndex && viewedRpcIndex > globalOptimisticIndex,
  'Native custom-bar and launcher counters must decrement by logical viewed items before remote persistence.',
);
assert.match(
  markViewedBlock,
  /optimisticallyDecrementClientBookingUnread\(\s*matchedLogicalKeys\.length,\s*matchedLogicalKeys\s*\)/,
  'The native decrement must carry exact logical keys, not a count-only approximation.',
);
assert.match(
  markViewedBlock,
  /'mark_public_booking_notification_events_viewed_v2'[\s\S]*?p_events: eventsToCommit\.map[\s\S]*?expectedStatus[\s\S]*?expectedUpdatedAt/,
  'Web and native must persist the exact authoritative notification event, not an id-only approximation.',
);
assert.match(
  markViewedBlock,
  /await persistPendingViewedIds\(\)/,
  'A background persistence failure must retain the exact request ids for later synchronization.',
);
assert.doesNotMatch(
  markViewedBlock,
  /if \(error\) \{[\s\S]*?persistPendingViewedIds\(\);[\s\S]*?refreshBadges\(\);[\s\S]*?return;/,
  'A transient persist failure must not immediately overwrite the scoped optimistic native counters.',
);
assert.doesNotMatch(
  markViewedBlock,
  /markSectionAsRead\('prenotazioni'\)/,
  'Viewing selected cards must not clear unrelated unseen booking notifications.',
);
assert.doesNotMatch(
  clientScreen,
  /remoteClientBookingUnreadCount\s*-\s*optimisticallyViewedFrontendLogicalKeys\.size/,
  'The screen must not create a second unread-count offset outside the shared badge authority.',
);

const pendingViewedSyncBlock = sliceBetween(
  clientScreen,
  'const retryPendingFrontendViewedRequestSync = useCallback',
  'const getFrontendBookingSectionItemsForReadSession = useCallback',
);
assert.match(
  clientScreen,
  /window\.addEventListener\('online', retryWhenVisible\)[\s\S]*?window\.addEventListener\('focus', retryWhenVisible\)[\s\S]*?document\.addEventListener\('visibilitychange', commitWhenHidden\)/,
  'Web pending viewed ids must synchronize on natural browser resume events.',
);
assert.match(
  clientScreen,
  /AppState\.addEventListener\('change'[\s\S]*?nextState === 'active'/,
  'Native pending viewed ids must synchronize on app resume.',
);

console.log('Client action latency contracts: OK');
