/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

const sendPush = read('supabase/functions/send-push/index.ts');
const unreadBadges = read('src/lib/badges/unread-badges.ts');
const badgeSync = read('src/lib/notification-badge-sync.ts');
const unreadBadgeContext = read('src/context/UnreadBadgeContext.tsx');
const androidBadgeCarrier = read('src/lib/android-launcher-badge-carrier.ts');
const androidBackgroundBadgeTask = read('src/lib/android-background-badge-task.ts');
const pushNotifications = read('src/lib/push/push-notifications.ts');
const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const clientScreen = read('app/cliente-screen.tsx');
const clientPortal = read('src/lib/client-portal.ts');
const rootLayout = read('app/_layout.tsx');
const ownerTabs = read('app/(tabs)/_layout.tsx');
const ownerRequests = read('app/(tabs)/prenotazioni.tsx');
const communications = read('src/lib/customer-communications.ts');
const waitlistReadMigration = read(
  'supabase/migrations/20260825184500_persist_public_waitlist_notification_reads.sql',
);
const ownerCreatedAppointmentPushMigration = read(
  'supabase/migrations/20260826013000_canonicalize_owner_created_appointment_push.sql',
);

requirePattern(
  sendPush,
  /buildOwnerRequestBadgeBaseKey[\s\S]*?appointment_group_id[\s\S]*?return `group:\$\{appointmentGroupId\}`[\s\S]*?id,appointment_group_id,origin,status/,
  'Owner push badges must collapse linked phases by appointment group.',
);
requirePattern(
  sendPush,
  /status === 'pending' && operatorChangeStatus !== 'pending'/,
  'An owner badge must not count a change that is waiting for the customer.',
);
requirePattern(
  sendPush,
  /buildClientRequestBadgeBaseKey[\s\S]*?appointment_group_id[\s\S]*?return `group:\$\{appointmentGroupId\}`[\s\S]*?return `id:\$\{requestId\}`/,
  'Client push badges must use the same group-or-request identity as the app.',
);
requirePattern(
  sendPush,
  /get_public_customer_unread_booking_badge_rows[\s\S]*?get_public_customer_unread_waitlist_badge_rows[\s\S]*?get_public_customer_unread_communication_count_v1[\s\S]*?clientPrenotazioniUnread \+ clientWaitlistUnread \+ clientCommunicationsUnread/,
  'Client push badges must include bookings, waitlist alerts, and communications.',
);
requirePattern(
  sendPush,
  /calculationSucceeded[\s\S]*?hasAbsoluteBadge[\s\S]*?_badgeSource: 'db_unavailable'[\s\S]*?isAndroidRecipient && !isBadgeOnlyRefresh && hasAbsoluteBadge/,
  'A failed badge lookup must not clear the launcher with a fabricated zero.',
);
requirePattern(
  waitlistReadMigration,
  /viewed_by_customer boolean not null default false[\s\S]*?get_public_customer_unread_waitlist_badge_rows[\s\S]*?mark_public_customer_waitlist_alerts_viewed[\s\S]*?p_waitlist_ids is null[\s\S]*?cardinality\(p_waitlist_ids\) > 0/,
  'Waitlist reads must be persisted and exposed through identity-scoped RPCs.',
);
requirePattern(
  unreadBadges,
  /get_public_customer_unread_waitlist_badge_rows[\s\S]*?mark_public_customer_waitlist_alerts_viewed/,
  'The shared badge authority must read and persist waitlist state on the server.',
);
requirePattern(
  unreadBadges,
  /if \(status === 'pending'\) \{[\s\S]*?return operatorChangeStatus !== 'pending'/,
  'The app and push worker must exclude customer-pending operator changes identically.',
);
requirePattern(
  clientScreen,
  /const visualRemoteClientBookingUnreadCount = remoteClientBookingUnreadCount/,
  'Client cancellation guards must not subtract from the authoritative count twice.',
);
requirePattern(
  clientScreen,
  /matchesFrontendClientIdentity[\s\S]*?!!itemPhone && !!profilePhone[\s\S]*?!!itemEmail && !!profileEmail[\s\S]*?effectiveRichieste\.forEach[\s\S]*?matchesFrontendClientIdentity\(item, profile\)/,
  'Web status banners must never match another customer through two empty identity fields.',
);
requirePattern(
  badgeSync,
  /applicationBadgeSyncQueue[\s\S]*?performApplicationBadgeCountSync[\s\S]*?applicationBadgeSyncQueue\.then[\s\S]*?applicationBadgeSyncQueue = queuedSync\.catch/,
  'Launcher badge writes must be serialized so a stale zero cannot overwrite the current internal count.',
);
requirePattern(
  unreadBadgeContext,
  /nativeRefreshInFlightRef[\s\S]*?nativeRefreshRerunRequestedRef[\s\S]*?latestNativeRefreshRequestRef[\s\S]*?if \(nativeRefreshInFlightRef\.current\) \{[\s\S]*?nativeRefreshRerunRequestedRef\.current = true;[\s\S]*?nativeRefreshInFlightRef\.current\.promise/,
  'Overlapping native badge refreshes must collapse into one in-flight request plus a trailing rerun.',
);
requirePattern(
  unreadBadgeContext,
  /const nextSnapshot = await fetchUnreadBadgeSnapshot\(request\.identity\);[\s\S]*?snapshotRef\.current = snapshotToCommit;[\s\S]*?setSnapshot\(snapshotToCommit\);[\s\S]*?syncBadgeSnapshotToAppIcon\(snapshotToCommit/,
  'Every successful native badge snapshot must commit internal and launcher state together.',
);
requirePattern(
  androidBadgeCarrier,
  /getDisplayedNotifications\(\)[\s\S]*?notification\.data\?\.unreadCount[\s\S]*?notification\.android\?\.badgeCount/,
  'Android cold start must restore its badge floor from SalonPro displayed carrier data.',
);
if (/default\.getBadgeCount\(\)/.test(androidBadgeCarrier)) {
  throw new Error('Android badge bootstrap must not use Notifee getBadgeCount because it is iOS-only.');
}
requirePattern(
  clientScreen,
  /const frontendNotificationTabBadgeCount = effectiveNotificheRisposteCount;[\s\S]*?const frontendCommunicationTabBadgeCount = clientNotificationCommunicationUnreadCount;[\s\S]*?key: 'notifications',[\s\S]*?badge: frontendNotificationTabBadgeCount[\s\S]*?key: 'communications',[\s\S]*?badge: frontendCommunicationTabBadgeCount[\s\S]*?key: 'waitlist',[\s\S]*?badge: waitlistUnreadCount/,
  'Custom bar tabs must keep booking, communication, and waitlist unread counts separate.',
);
requirePattern(
  clientScreen,
  /const requestId = String\(request\.id[\s\S]*?const requestAppointmentGroupId = request\.appointmentGroupId\?\.trim\(\) \?\? '';[\s\S]*?const exactLinkedCandidates = appointments\.filter[\s\S]*?bookingRequestId === requestId[\s\S]*?const groupLinkedCandidates = appointments\.filter[\s\S]*?item\.appointmentGroupId\?\.trim\(\) === requestAppointmentGroupId[\s\S]*?const legacyCandidates = appointments\.filter[\s\S]*?item\.bookingRequestId[\s\S]*?matchesRequestSlot\(item\)[\s\S]*?const candidates = exactLinkedCandidates\.length > 0[\s\S]*?groupLinkedCandidates\.length > 0[\s\S]*?legacyCandidates;/,
  'Accepted requests must hydrate from their exact linked appointment first, then the same group, and use slot matching only for unlinked legacy rows.',
);
requirePattern(
  clientScreen,
  /applyLiveAppointmentDetailsToAcceptedRequest[\s\S]*?appointmentGroupId:[\s\S]*?request\.appointmentGroupId\?\.trim\(\)[\s\S]*?\? request\.appointmentGroupId[\s\S]*?: linkedAppointment\.appointmentGroupId/,
  'Live appointment hydration must never overwrite an authoritative request group with a same-slot composition.',
);
requirePattern(
  unreadBadgeContext,
  /optimisticallyDecrementClientBookingUnread[\s\S]*?logicalEventKeys: readonly string\[\][\s\S]*?activeIdentity\?\.audience !== 'client'[\s\S]*?snapshotIdentityKeyRef\.current !== activeIdentityKey[\s\S]*?currentLogicalKeys\.has\(logicalKey\) && !pendingLogicalKeys\.has\(logicalKey\)[\s\S]*?decrementApplicationBadgeCountFloor\(appliedLogicalCount\)[\s\S]*?syncApplicationBadgeCount\(nextSnapshot\.totalUnread/,
  'Native optimistic reads must be identity-scoped, exact-key deduplicated, and update the launcher immediately.',
);
requirePattern(
  unreadBadgeContext,
  /options\?\.reconcileOptimisticClientBookingUnread === true[\s\S]*?hasPendingOptimisticDecrement[\s\S]*?request\.reconcileOptimisticClientBookingUnread[\s\S]*?pendingOptimisticClientBookingDecrementRef\.current = null[\s\S]*?const unresolvedLogicalKeys = new Set\([\s\S]*?authoritativeBookingUnread - unresolvedLogicalKeys\.size[\s\S]*?ignoreApplicationBadgeFloor: shouldReconcileOptimisticFloor/,
  'An explicit confirmation or exact-key server reflection must reconcile a pending optimistic decrement without hiding new notifications.',
);
requirePattern(
  unreadBadgeContext,
  /const nativeClientIdentity =[\s\S]*?lastNativeClientIdentity[\s\S]*?const activeIdentity = Platform\.OS === 'web'[\s\S]*?identityOverride \?\? ownerIdentity[\s\S]*?: nativeClientIdentity \?\? \(isNativeClientRuntimeRoute \? null : ownerIdentity\)/,
  'Native client bootstrap must retain its client identity without falling through to owner badges, while web keeps its existing route isolation.',
);
const missingIdentityRefreshBlock =
  unreadBadgeContext.match(
    /const refreshBadges = useCallback\(async \([^)]*\) => \{[\s\S]*?if \(!activeIdentity\) \{([\s\S]*?)return emptySnapshot;/,
  )?.[1] ?? '';
if (/setApplicationBadgeSuppressed\(true\)|syncApplicationBadgeCount\(0/.test(missingIdentityRefreshBlock)) {
  throw new Error('Transient native identity hydration must not clear a delivered app badge or push.');
}
requirePattern(
  badgeSync,
  /if \(Platform\.OS === 'android' && normalizedCount <= 0\) \{[\s\S]*?await syncAndroidCarrier\(\);[\s\S]*?return;[\s\S]*?Notifications\.setBadgeCountAsync\(normalizedCount\)/,
  'Android zero must use the private badge carrier before the Expo badge API can cancel delivered pushes.',
);
const androidZeroBadgeBlock =
  badgeSync.match(
    /if \(Platform\.OS === 'android' && normalizedCount <= 0\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? '';
if (/Notifications\.setBadgeCountAsync/.test(androidZeroBadgeBlock)) {
  throw new Error('Android zero must never call Expo setBadgeCountAsync because it maps to cancelAll().');
}
requirePattern(
  androidBadgeCarrier,
  /if \(normalizedCount <= 0\) \{[\s\S]*?notifee\.setBadgeCount\(0\)[\s\S]*?notifee\.cancelNotification/,
  'The Android carrier must clear the launcher count without cancelling unrelated notifications.',
);
requirePattern(
  androidBackgroundBadgeTask,
  /const didSetBadge = unreadCount > 0[\s\S]*?Notifications\.setBadgeCountAsync\(unreadCount\)[\s\S]*?: true;[\s\S]*?syncAndroidLauncherBadgeCarrier\(unreadCount/,
  'The Android background task must never send zero through Expo before syncing the private carrier.',
);
requirePattern(
  pushNotifications,
  /const isAndroidBadgeOnlyRefresh =[^;]*Platform\.OS === 'android'[^;]*notificationData\?\._badgeOnly === true;[\s\S]*?if \(isAndroidBadgeOnlyRefresh\) \{[\s\S]*?await syncApplicationBadgeCountFromPushData\([\s\S]*?shouldShowBanner: false,[\s\S]*?shouldShowList: false,[\s\S]*?shouldPlaySound: false,[\s\S]*?shouldSetBadge: false,[\s\S]*?\}[\s\S]*?if \(isClientForegroundPush\(notificationData\)\)/,
  'The global native handler must consume an Android badge-only refresh before foreground presentation or dedupe.',
);
const globalBadgeOnlyBlock =
  pushNotifications.match(
    /if \(isAndroidBadgeOnlyRefresh\) \{([\s\S]*?)\n          \}\n          if \(isClientForegroundPush\(notificationData\)\)/,
  )?.[1] ?? '';
if (
  /shouldSuppressDuplicateForegroundPush|displayAndroid|scheduleNotificationAsync/.test(
    globalBadgeOnlyBlock,
  )
) {
  throw new Error('The global Android badge-only path must not enter presentation or dedupe.');
}
requirePattern(
  clientNotifications,
  /const isAndroidBadgeOnlyRefresh =[^;]*Platform\.OS === 'android'[^;]*notificationData\._badgeOnly === true;[\s\S]*?if \(isAndroidBadgeOnlyRefresh\) \{[\s\S]*?syncApplicationBadgeCountFromPushData\([\s\S]*?return;[\s\S]*?if \(!identityRef\.current\?\.isRegistered\)/,
  'The client native listener must consume an Android badge-only refresh before session gating or presentation.',
);
const clientBadgeOnlyBlock =
  clientNotifications.match(
    /if \(isAndroidBadgeOnlyRefresh\) \{([\s\S]*?)\n      \}\n\n      if \(!identityRef\.current\?\.isRegistered\)/,
  )?.[1] ?? '';
if (/markPresented|displayAndroidClientForegroundNotification|enqueueForegroundCustomBar/.test(clientBadgeOnlyBlock)) {
  throw new Error('The client Android badge-only path must not consume banner dedupe or render a card.');
}
requirePattern(
  rootLayout,
  /const isAndroidBadgeOnlyRefresh =[^;]*Platform\.OS === 'android'[^;]*notificationData\._badgeOnly === true;[\s\S]*?syncApplicationBadgeCountFromPushData\([\s\S]*?if \(isAndroidBadgeOnlyRefresh\) \{[\s\S]*?return;[\s\S]*?applyOwnerOperatorChangeResponseFromPush\(notificationData\);[\s\S]*?shouldIgnoreDuplicateOwnerReceivedPush/,
  'The owner native listener must consume an Android badge-only refresh before owner mutation or dedupe.',
);
const ownerBadgeOnlyPrefix =
  rootLayout.match(
    /const isAndroidBadgeOnlyRefresh =[\s\S]*?if \(isAndroidBadgeOnlyRefresh\) \{([\s\S]*?)\n        \}\n\n        applyOwnerOperatorChangeResponseFromPush/,
  )?.[1] ?? '';
if (/shouldIgnoreDuplicateOwnerReceivedPush|displayAndroidOwnerForegroundNotification|publishOwnerForegroundBannerPush/.test(ownerBadgeOnlyPrefix)) {
  throw new Error('The owner Android badge-only path must not consume banner dedupe or render a card.');
}
requirePattern(
  ownerTabs,
  /shouldSuppressNativeSinglePendingBatchBanner[\s\S]*?if \(IS_WEB \|\| items\.length === 0\)[\s\S]*?collapseOwnerLogicalBookingEvents\(items\)[\s\S]*?logicalItems\.length === 1[\s\S]*?item\.stato === "In attesa"/,
  'A native pending request, including linked phases, must be recognized as one logical event before any generic owner banner is rendered.',
);
const androidAutoAcceptPendingArrivalBlock =
  ownerTabs.match(
    /const freshPendingRequests = ownerAutoAcceptPendingFrontendRequests\.filter\([\s\S]*?logAndroidAutoacceptVisualFlow\("pending_arrival_visual_batch"/,
  )?.[0] ?? '';
if (
  /setLiveRequestBanner\(|playOwnerForegroundBannerSound\(/.test(
    androidAutoAcceptPendingArrivalBlock,
  )
) {
  throw new Error(
    'Android auto-accept preparation must not emit the generic owner banner before the precise push.',
  );
}
requirePattern(
  ownerTabs,
  /eligibleBannerRequests\.length > 1[\s\S]*?persistOwnerPendingBannerShownState\(\)[\s\S]*?shouldSuppressNativeSinglePendingBatchBanner\(eligibleBannerRequests\)[\s\S]*?customBarEnqueue: false[\s\S]*?return;[\s\S]*?buildOwnerLiveRequestBatchSummary\(eligibleBannerRequests\)/,
  'A native multi-phase request must suppress only the generic aggregate while preserving the real push and its bookkeeping.',
);
requirePattern(
  pushNotifications,
  /Platform\.OS === 'android'[\s\S]*?isOwnerAuthForegroundPush\(notificationData\)[\s\S]*?shouldSuppressDuplicateForegroundPush[\s\S]*?shouldShowBanner: true,[\s\S]*?shouldShowList: true,[\s\S]*?shouldPlaySound: true/,
  'The original Android owner push must remain the foreground system presenter after the in-app summary is removed.',
);
if (/displayAndroidOwnerForegroundNotification\(/.test(rootLayout)) {
  throw new Error('Android owner foreground delivery must not create a second local Notifee copy.');
}
requirePattern(
  ownerTabs,
  /\{liveRequestBanner && !IS_ANDROID \? \(/,
  'The owner in-app live banner must stay hidden on Android.',
);
if (/recentlyCancelledFrontendBookingVisualSuppressions/.test(clientScreen)) {
  throw new Error('The obsolete cancellation visual double-subtraction state must stay removed.');
}
requirePattern(
  clientScreen,
  /type: 'slot_waitlist_available'[\s\S]*?section: 'waitlist'[\s\S]*?showWebNotification/,
  'A new web waitlist event must create both the in-app bar and browser notification.',
);
requirePattern(
  clientScreen,
  /buildFrontendLogicalStatusResponseKey[\s\S]*?`group:\$\{groupId\}\|\$\{status\}\|\$\{cancellationSource\}`[\s\S]*?dedupedUnreadFrontendStatusResponses[\s\S]*?return dedupedUnreadFrontendStatusResponses\.filter/,
  'Linked phases must collapse to one logical unread cancellation and one status response.',
);
requirePattern(
  clientScreen,
  /const buildStatusKey = \(item:[\s\S]*?\) =>\s*buildFrontendLogicalStatusResponseKey\(item\);[\s\S]*?lastUnreadStatusKeysRef/,
  'Web status banners must use only the immutable request/group status identity.',
);
requirePattern(
  clientScreen,
  /CLIENT_DB_UNREAD_SYNC appointment_rescheduled_by_salon[\s\S]*?const isPendingDbUnreadHydration[\s\S]*?normalizedNote\.startsWith\('client_db_unread_sync'\)[\s\S]*?newlyAddedStatusResponses[\s\S]*?!isPendingDbUnreadHydration\(item\)[\s\S]*?previousStatusKeys\.has\(buildStatusKey\(item\)\)/,
  'A new DB-unread fallback must wait for the canonical portal row before showing a web banner.',
);
const webStatusKeyBlock =
  clientScreen.match(
    /const buildStatusKey = \(item:[\s\S]*?\) =>\s*buildFrontendLogicalStatusResponseKey\(item\);/,
  )?.[0] ?? '';
if (/item\.(?:data|ora|note)/.test(webStatusKeyBlock)) {
  throw new Error('Web status banner identity must not change while DB rows hydrate into portal rows.');
}

// Regression: bootstrap unread rows are the baseline. Hydrating the exact same
// logical events with portal details must not enqueue them again.
const buildExpectedWebStatusKey = (item) => {
  const status = String(item.stato ?? '').trim().toLowerCase();
  const cancellationSource = String(item.cancellationSource ?? '').trim().toLowerCase();
  const groupId = String(item.appointmentGroupId ?? '').trim();
  const requestId = String(item.id ?? '').trim();
  return groupId
    ? `group:${groupId}|${status}|${cancellationSource}`
    : `request:${requestId}|${status}|${cancellationSource}`;
};
const isExpectedPendingDbUnreadHydration = (item) => {
  if (item.origine !== 'backoffice') return false;
  const note = String(item.note ?? '').trim().toLowerCase();
  return note.startsWith('client_db_unread_sync');
};
const getExpectedNewWebBannerRows = (previousKeys, rows) =>
  rows.filter(
    (item) =>
      !isExpectedPendingDbUnreadHydration(item) &&
      !previousKeys.has(buildExpectedWebStatusKey(item)),
  );
const getExpectedNextTrackedWebKeys = (previousKeys, rows) =>
  new Set(
    rows
      .filter(
        (item) =>
          !isExpectedPendingDbUnreadHydration(item) ||
          previousKeys.has(buildExpectedWebStatusKey(item)),
      )
      .map(buildExpectedWebStatusKey),
  );
const dbUnreadBaseline = [
  {
    id: 'old-request-a',
    stato: 'Accettata',
    origine: 'backoffice',
    data: '2026-08-26',
    ora: '10:20',
    note: 'CLIENT_DB_UNREAD_SYNC',
  },
  {
    id: 'old-request-b',
    appointmentGroupId: 'old-group-b',
    stato: 'Accettata',
    origine: 'backoffice',
    data: '2026-08-26',
    ora: '11:00',
    note: 'CLIENT_DB_UNREAD_SYNC',
  },
];
const primedWebStatusKeys = new Set(dbUnreadBaseline.map(buildExpectedWebStatusKey));
const portalHydratedSameEvents = [
  {
    ...dbUnreadBaseline[0],
    origine: 'frontend',
    data: '2026-08-27',
    ora: '10:25',
    note: 'Nota cliente idratata dal portale',
    operatoreNome: 'Sara',
  },
  {
    ...dbUnreadBaseline[1],
    origine: 'frontend',
    data: '2026-08-27',
    ora: '11:05',
    note: 'Fase portale idratata',
    operatoreNome: 'Sara',
  },
];
const replayedBootstrapEvents = portalHydratedSameEvents.filter(
  (item) => !primedWebStatusKeys.has(buildExpectedWebStatusKey(item)),
);
if (replayedBootstrapEvents.length !== 0) {
  throw new Error('DB unread bootstrap rows must not replay when the portal hydrates mutable details.');
}
const genuinelyNewDbFallback = {
  id: 'new-request-c',
  stato: 'Accettata',
  origine: 'backoffice',
  data: '2026-08-26',
  ora: '12:00',
  note: 'CLIENT_DB_UNREAD_SYNC',
};
if (getExpectedNewWebBannerRows(primedWebStatusKeys, [genuinelyNewDbFallback]).length !== 0) {
  throw new Error('A newly discovered DB fallback must not show copy before portal hydration.');
}
const trackedWhileFallbackIsPending = getExpectedNextTrackedWebKeys(
  primedWebStatusKeys,
  [...dbUnreadBaseline, genuinelyNewDbFallback],
);
if (trackedWhileFallbackIsPending.has(buildExpectedWebStatusKey(genuinelyNewDbFallback))) {
  throw new Error('A pending DB fallback must not consume the future canonical portal event.');
}
const canonicallyHydratedNewRequest = {
  ...genuinelyNewDbFallback,
  origine: 'frontend',
  note: 'Nota cliente canonica',
  operatoreNome: 'Sara',
};
const canonicalNewRows = getExpectedNewWebBannerRows(trackedWhileFallbackIsPending, [canonicallyHydratedNewRequest]);
if (canonicalNewRows.length !== 1 || canonicalNewRows[0].origine !== 'frontend') {
  throw new Error('The canonical portal row must produce exactly one correctly classified web banner.');
}
if (
  primedWebStatusKeys.has(
    buildExpectedWebStatusKey({ id: 'another-new-request', stato: 'Accettata' }),
  )
) {
  throw new Error('A genuinely new request must retain a distinct web banner identity.');
}
if (
  primedWebStatusKeys.has(
    buildExpectedWebStatusKey({ id: 'old-request-a', stato: 'Annullata', cancellationSource: 'salone' }),
  )
) {
  throw new Error('A real status/cancellation transition must retain a distinct web banner identity.');
}
requirePattern(
  clientScreen,
  /isSalonAddedAppointment[\s\S]*?latestResponse\.origine === 'backoffice'[\s\S]*?'Appuntamento aggiunto dal salone'[\s\S]*?'Prenotazione confermata'[\s\S]*?appointment_created_by_salon/,
  'A salon-created appointment must keep distinct copy and event semantics from an accepted client request.',
);
requirePattern(
  clientScreen,
  /!hasAuthoritativeClientDbUnreadRows[\s\S]*?hasPrimedUnreadStatusNotificationsRef\.current = false[\s\S]*?lastUnreadStatusKeysRef\.current\.clear\(\)/,
  'Refresh or bundle hydration must establish an authoritative unread baseline before showing a web banner.',
);
requirePattern(
  clientScreen,
  /clientDbUnreadBookingSnapshot[\s\S]*?identityKey: string;[\s\S]*?rows: ClientUnreadBookingRow\[\][\s\S]*?commitClientDbUnreadBookingSnapshot\(snapshot\)/,
  'Unread rows and their authoritative customer identity must commit atomically and idempotently.',
);
requirePattern(
  ownerCreatedAppointmentPushMigration,
  /custom''::public\.push_event_type[\s\S]*?Appuntamento aggiunto dal salone[\s\S]*?type'', ''appointment_created_by_salon[\s\S]*?event_type'', ''appointment_created_by_salon[\s\S]*?notificationType'', ''appointment_created_by_salon[\s\S]*?_pushEventType'', ''appointment_created_by_salon/,
  'The owner single-appointment RPC must queue one canonical salon-created client push.',
);
if (/\.select\('status,origin,viewed_by_customer,linked_appointment_id'\)/.test(sendPush)) {
  throw new Error(
    'Accepted/created client push validation must not query the non-existent booking_requests.linked_appointment_id column.',
  );
}
requirePattern(
  sendPush,
  /isStaleCreatedOrAcceptedClientBookingPush[\s\S]*?\.from\('appointments'\)[\s\S]*?\.eq\('booking_request_id', bookingRequestId\)[\s\S]*?\.maybeSingle\(\)/,
  'Accepted/created client pushes must validate the authoritative appointments.booking_request_id relation.',
);
requirePattern(
  clientScreen,
  /frontend-communication:[\s\S]*?type: 'customer_communication'[\s\S]*?section: 'communications'[\s\S]*?communicationId:/,
  'A new web salon communication must create a navigable in-app bar.',
);
requirePattern(
  pushNotifications,
  /if \(isAndroidBadgeOnlyRefresh\) \{[\s\S]*?shouldShowBanner: false[\s\S]*?Platform\.OS === 'android'[\s\S]*?isOwnerAuthForegroundPush\(notificationData\)[\s\S]*?shouldShowBanner: true/,
  'Android owner foreground pushes must stay visible in the system while badge-only refreshes stay silent.',
);
requirePattern(
  ownerTabs,
  /const visualRichiesteInAttesa = ownerTabBadgeDataReady[\s\S]*?remoteOwnerUnreadRequestsCount[\s\S]*?Math\.trunc\(visualRichiesteInAttesa\)[\s\S]*?Math\.trunc\(visualClientiNonLetti\)/,
  'Owner platforms and launcher badges must share the full authoritative count.',
);
requirePattern(
  ownerTabs,
  /OWNER_AUTO_ACCEPT_CLIENT_FALLBACK_ENABLED = false/,
  'Bundle reloads must never use a stale device preference to auto-accept a manual request.',
);
requirePattern(
  ownerRequests,
  /const richiesteAnnullateClienteRecenti = useMemo[\s\S]*?`group:\$\{groupId\}`[\s\S]*?viewedBySalon: ordered\.every[\s\S]*?select\("id,appointment_group_id"\)[\s\S]*?setRemoteCancelledClientUnreadCount\(logicalUnreadKeys\.size\)/,
  'Owner cancellation totals and unread counters must count one logical appointment while marking every phase.',
);
requirePattern(
  communications,
  /byCommunicationId[\s\S]*?current\.readAt !== null && item\.readAt === null[\s\S]*?Array\.from\(byCommunicationId\.values\(\)\)/,
  'Duplicate customer rows must not duplicate one logical communication badge.',
);
requirePattern(
  clientPortal,
  /normalizeAppointmentRecord[\s\S]*?bookingRequestId:[\s\S]*?item\.bookingRequestId \?\? item\.booking_request_id[\s\S]*?bookingOrigin,/,
  'Portal appointment normalization must preserve the canonical booking request and origin.',
);
requirePattern(
  clientScreen,
  /const canonicalBookingRequestId = item\.bookingRequestId\?\.trim\(\) \?\? '';[\s\S]*?linkedCanonicalRequest[\s\S]*?request\.id[\s\S]*?=== canonicalBookingRequestId[\s\S]*?uniqueLegacyLinkedRequest[\s\S]*?findUniqueAcceptedLogicalRequestForLegacyAppointment[\s\S]*?if \(linkedCanonicalRequest \|\| uniqueLegacyLinkedRequest\) \{[\s\S]*?return;[\s\S]*?id: canonicalBookingRequestId \|\| `owner-appointment-\$\{item\.id\}`[\s\S]*?origine: item\.bookingOrigin === 'frontend'/,
  'A request-linked or uniquely matched legacy appointment must reuse its canonical request identity instead of rendering a duplicate owner card.',
);

console.log('Notification alignment contracts passed.');
