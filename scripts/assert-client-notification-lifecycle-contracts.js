/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const clientScreen = read('app/cliente-screen.tsx');
const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const unreadBadges = read('src/lib/badges/unread-badges.ts');

const migrationDirectory = path.join(root, 'supabase/migrations');
const migrationEntries = fs
  .readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => ({
    fileName,
    source: fs.readFileSync(path.join(migrationDirectory, fileName), 'utf8'),
  }));

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

const forbidPattern = (source, pattern, message) => {
  if (pattern.test(source)) {
    throw new Error(message);
  }
};

const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

requirePattern(
  clientScreen,
  /const areClientUnreadBookingSnapshotsEqual = \([\s\S]{0,700}?left\.identityKey === right\.identityKey[\s\S]{0,300}?buildClientUnreadBookingRowsSignature\(left\.rows\)[\s\S]{0,200}?buildClientUnreadBookingRowsSignature\(right\.rows\)/,
  'Equivalent unread-booking snapshots must be detected before committing React state.',
);
requirePattern(
  clientScreen,
  /const commitClientDbUnreadBookingSnapshot = useCallback\([\s\S]{0,500}?setClientDbUnreadBookingSnapshot\(\(current\) =>[\s\S]{0,300}?areClientUnreadBookingSnapshotsEqual\(current, snapshot\)[\s\S]{0,120}?\? current[\s\S]{0,120}?: snapshot/,
  'Unread-booking refreshes must preserve the current state reference when server rows are unchanged.',
);
const unreadSnapshotRefreshBlock = sliceBetween(
  clientScreen,
  'const refreshClientDbUnreadBookingRows = useCallback',
  'const fetchBookingOperatorChanges = useCallback',
);
forbidPattern(
  unreadSnapshotRefreshBlock,
  /setClientDbUnreadBookingSnapshot\(snapshot\)/,
  'Unread-booking effects must not blindly commit a fresh snapshot object on every refresh.',
);
const frontendBookingLifecycleEffect = sliceBetween(
  clientScreen,
  'retryPendingFrontendViewedRequestSyncRef.current =',
  'if (!isReadingFrontendNotifications)',
);
requirePattern(
  frontendBookingLifecycleEffect,
  /retryPendingFrontendViewedRequestSyncRef\.current\(\)[\s\S]{0,500}?refreshFrontendBadgesLifecycleRef\.current\(\)[\s\S]{0,500}?refreshClientDbUnreadBookingRowsRef\.current\(\)/,
  'Notification lifecycle refreshes must call the latest functions through stable refs.',
);
requirePattern(
  frontendBookingLifecycleEffect,
  /\}, \[frontendRequestsViewedStorageKey, isRegistered\]\);/,
  'The native/web notification lifecycle must rerun only for a real identity or registration change.',
);
forbidPattern(
  frontendBookingLifecycleEffect,
  /\}, \[[\s\S]{0,300}?(?:retryPendingFrontendViewedRequestSync|refreshClientDbUnreadBookingRows|refreshBadges),/,
  'Snapshot-derived callbacks must not be lifecycle-effect dependencies.',
);

// Reading a booking accordion is an explicit lifecycle, not a viewport heuristic.
forbidPattern(
  clientScreen,
  /scheduleFrontendRequestHoverRead|cancelFrontendRequestHoverRead/,
  'Hovering a booking card must never be a read authority.',
);
forbidPattern(
  clientScreen,
  /markFrontendNotificationsAsViewedWhenScrolled/,
  'Scrolling the notifications page must never be a read authority.',
);
forbidPattern(
  clientScreen,
  /markVisibleOpenFrontendRequestCardsAsSeenPending|markVisibleFrontendBookingSectionAsSeenPending|markVisibleFrontendBookingSectionAsViewedOnClose/,
  'Viewport measurement must not decide which booking notifications become read.',
);

requirePattern(
  clientScreen,
  /type FrontendBookingReadEventSnapshot = \{[\s\S]*?sectionKey: FrontendBookingSectionKey;[\s\S]*?requestId: string;[\s\S]*?appointmentGroupId: string \| null;[\s\S]*?logicalKey: string;[\s\S]*?expectedStatus: string;[\s\S]*?expectedCancellationSource: string \| null;[\s\S]*?expectedAppointmentDate: string;[\s\S]*?expectedAppointmentTime: string;[\s\S]*?expectedServiceName: string;[\s\S]*?expectedUpdatedAt: string \| null;/,
  'An opened accordion must snapshot the exact logical event and its server version.',
);
requirePattern(
  clientScreen,
  /frontendBookingReadSessionsRef[\s\S]*?Map<FrontendBookingSectionKey, FrontendBookingReadEventSnapshot\[\]>/,
  'Read sessions must be isolated by booking accordion.',
);
requirePattern(
  clientScreen,
  /frontendBookingReadSessionsRef\.current\.set\(\s*sectionKey,[\s\S]*?FrontendBookingReadEventSnapshot/,
  'Opening an accordion must arm a snapshot without marking the section immediately.',
);
requirePattern(
  clientScreen,
  /if \(nextExpanded\) \{[\s\S]{0,900}?(?:arm|begin|open|stage)[A-Za-z0-9_]*Read[A-Za-z0-9_]*\(sectionKey\)[\s\S]{0,900}?\} else \{[\s\S]{0,900}?commit[A-Za-z0-9_]*Read[A-Za-z0-9_]*\(sectionKey/,
  'Accordion open must arm its snapshot and accordion close must commit it.',
);
requirePattern(
  clientScreen,
  /const stagePromise\s*=\s*frontendBookingReadStagePromisesRef\.current\.get\(sectionKey\)[\s\S]{0,1000}?stagePromise\.then\(commitHydratedSession, commitHydratedSession\)/,
  'A rapid accordion close must wait for the authoritative event snapshot before committing.',
);
requirePattern(
  clientScreen,
  /frontendBookingReadCommitPendingSectionsRef\.current\.has\(sectionKey\)[\s\S]{0,350}?return;/,
  'A rapid reopen must not overwrite the session that is still being committed.',
);
requirePattern(
  clientScreen,
  /isLeavingFrontendNotificationsTab[\s\S]{0,900}?commit[A-Za-z0-9_]*(?:Open|Booking)[A-Za-z0-9_]*Read[A-Za-z0-9_]*\(/,
  'Leaving the booking-notifications tab must commit every open accordion snapshot.',
);
requirePattern(
  clientScreen,
  /AppState\.addEventListener\('change',[\s\S]{0,1200}?nextState === 'background'[\s\S]{0,900}?commit[A-Za-z0-9_]*(?:Open|Booking)[A-Za-z0-9_]*Read[A-Za-z0-9_]*\(/,
  'Backgrounding the native app with an open accordion must commit its snapshot.',
);
requirePattern(
  clientScreen,
  /(?:pagehide|visibilitychange)[\s\S]{0,1800}?commit[A-Za-z0-9_]*(?:Open|Booking)[A-Za-z0-9_]*Read[A-Za-z0-9_]*\(/,
  'Hiding or closing the web client with an open accordion must commit its snapshot.',
);

// The armed snapshot is durable before exit. A force-kill is recovered on next launch.
requirePattern(
  clientScreen,
  /FRONTEND_REQUEST_READ_SESSIONS_VERSION[\s\S]*?(?:read[_-]?sessions|ReadSessions)/i,
  'Read-session storage must carry an explicit schema version.',
);
requirePattern(
  clientScreen,
  /AsyncStorage\.setItem\([\s\S]{0,700}?(?:readSessions|ReadSessions|READ_SESSIONS)[\s\S]{0,500}?JSON\.stringify/,
  'Armed accordion snapshots must be persisted for force-kill recovery.',
);
requirePattern(
  clientScreen,
  /AsyncStorage\.getItem\([\s\S]{0,700}?(?:readSessions|ReadSessions|READ_SESSIONS)[\s\S]{0,1800}?frontendBookingReadSessionsRef\.current/,
  'Cold start must restore a previously armed accordion snapshot.',
);
requirePattern(
  clientScreen,
  /frontendBookingReadStorageQueueRef[\s\S]*?\.then\([\s\S]*?AsyncStorage\.(?:setItem|removeItem)/,
  'Read-session storage writes must be serialized so an older snapshot cannot win.',
);

const markViewedBlock = sliceBetween(
  clientScreen,
  'const markFrontendBookingRequestsAsViewed = useCallback(',
  '  const retryPendingFrontendViewedRequestSync = useCallback(',
);
const retryPendingViewedBlock = sliceBetween(
  clientScreen,
  'const retryPendingFrontendViewedRequestSync = useCallback(',
  '  const getFrontendBookingSectionItemsForReadSession = useCallback(',
);
requirePattern(
  markViewedBlock,
  /matchedLogicalKeys\.every\(\(logicalKey\) => current\.has\(logicalKey\)\)[\s\S]{0,180}?return current;/,
  'Retrying the same read event must not recreate optimistic React state.',
);
requirePattern(
  markViewedBlock,
  /item\.viewedByCliente === true[\s\S]{0,100}?return item;/,
  'An already-viewed request must preserve its object identity during retry.',
);
requirePattern(
  markViewedBlock,
  /frontendBookingReadRpcUnavailableUntilRef\.current[\s\S]{0,1800}?error\.code[\s\S]{0,400}?PGRST202[\s\S]{0,500}?60_000/,
  'A missing PostgREST RPC must keep the durable queue without hammering React/network on every focus.',
);
requirePattern(
  clientScreen,
  /markFrontendBookingRequestsAsViewedRef\.current\s*=\s*markFrontendBookingRequestsAsViewed/,
  'Cold-start retry must receive the latest booking-read implementation through a stable ref.',
);
requirePattern(
  retryPendingViewedBlock,
  /markFrontendBookingRequestsAsViewedRef\.current\(eventsToRetry\)/,
  'Cold-start retry must invoke the stable ref instead of capturing request-state-dependent callbacks.',
);
forbidPattern(
  retryPendingViewedBlock,
  /\n\s*markFrontendBookingRequestsAsViewed,\s*\n/,
  'Cold-start retry must not change identity whenever optimistic request state changes.',
);
const persistPendingDefinitionIndex = markViewedBlock.indexOf('const persistPendingViewedIds');
const firstPersistPendingCallIndex = markViewedBlock.indexOf('persistPendingViewedIds()', persistPendingDefinitionIndex + 1);
const firstRpcIndex = markViewedBlock.indexOf('supabase.rpc', persistPendingDefinitionIndex + 1);
assert.ok(persistPendingDefinitionIndex >= 0, 'Missing durable pending-read queue helper.');
assert.ok(firstPersistPendingCallIndex >= 0, 'Pending read ids must be written before network persistence.');
assert.ok(firstRpcIndex >= 0, 'Missing server persistence for booking reads.');
assert.ok(
  firstPersistPendingCallIndex < firstRpcIndex,
  'Pending read ids must reach durable storage before the RPC starts, so a force-kill is recoverable.',
);

// A read update is compare-and-set against the event version and expands linked groups atomically.
const VERSIONED_READ_RPC = 'mark_public_booking_notification_events_viewed_v2';
requirePattern(
  clientScreen,
  new RegExp(`${VERSIONED_READ_RPC}[\\s\\S]*?p_events`),
  'Accordion commits must use the versioned event RPC.',
);
forbidPattern(
  markViewedBlock,
  /mark_public_booking_requests_viewed_by_ids|mark_public_booking_notifications_viewed_by_ids_web_v1/,
  'Accordion commits must not fall back to an unversioned by-id read RPC.',
);
requirePattern(
  clientNotifications,
  /normalizeNotification[\s\S]*?requestId[\s\S]*?appointmentGroupId[\s\S]*?status[\s\S]*?(?:updatedAt|eventAt)/,
  'Push/custom-bar normalization must retain the exact booking event version.',
);
requirePattern(
  unreadBadges,
  new RegExp(`markClientBookingNotificationAsRead[\\s\\S]*?expectedStatus[\\s\\S]*?expectedUpdatedAt[\\s\\S]*?${VERSIONED_READ_RPC}`),
  'A push tap must not let an old confirmation consume a newer booking event.',
);

const versionedMigration = migrationEntries.find((entry) =>
  new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${VERSIONED_READ_RPC}\\b`, 'i').test(
    entry.source,
  ),
);
assert.ok(versionedMigration, `Missing migration for public.${VERSIONED_READ_RPC}.`);
const forwardOnlyReaderRestore = migrationEntries.find(
  (entry) =>
    entry.fileName ===
    '20260829222000_restore_public_booking_notification_event_reader.sql',
);
assert.ok(
  forwardOnlyReaderRestore &&
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${VERSIONED_READ_RPC}\\b`,
      'i',
    ).test(forwardOnlyReaderRestore.source) &&
    /notify\s+pgrst\s*,\s*'reload schema'/i.test(forwardOnlyReaderRestore.source),
  'The exact reader must be republished in a new forward-only migration with a PostgREST cache reload.',
);
const versionedMigrationSource = versionedMigration.source;
requirePattern(
  versionedMigrationSource,
  /p_events\s+jsonb[\s\S]*?jsonb_array_elements/,
  'The versioned reader must accept a batch of exact event snapshots.',
);
for (const expectedField of [
  'request_id',
  'appointment_group_id',
  'expected_status',
  'expected_cancellation_source',
  'expected_appointment_date',
  'expected_appointment_time',
  'expected_service_name',
  'expected_updated_at',
]) {
  assert.ok(
    versionedMigrationSource.toLowerCase().includes(expectedField),
    `Versioned booking reader is missing ${expectedField}.`,
  );
}
requirePattern(
  versionedMigrationSource,
  /viewed_by_customer\s*=\s*false[\s\S]*?status[\s\S]*?cancellation_source[\s\S]*?appointment_date[\s\S]*?appointment_time[\s\S]*?requested_service_name[\s\S]*?updated_at/,
  'The server must compare every mutable event field before marking it read.',
);
requirePattern(
  versionedMigrationSource,
  /appointment_group_id[\s\S]*?(?:matched_anchors|requested_groups|matched_groups|target_groups)[\s\S]*?update\s+public\.booking_requests/,
  'One logical grouped notification must mark every linked phase atomically.',
);
requirePattern(
  versionedMigrationSource,
  /sync_client_portal_booking_requests/,
  'Versioned reads must realign the client portal after persistence.',
);
requirePattern(
  versionedMigrationSource,
  /grant\s+execute[\s\S]*?anon[\s\S]*?authenticated|grant\s+execute[\s\S]*?authenticated[\s\S]*?anon/i,
  'The public client must be allowed to call the versioned reader.',
);

// Bottom navigation owns three disjoint inboxes. The launcher remains their total.
requirePattern(
  clientScreen,
  /type FrontendClientTabKey\s*=\s*[^;]*'notifications'[^;]*'communications'[^;]*'waitlist'/,
  'Communications must have their own frontend tab.',
);
requirePattern(
  clientScreen,
  /const frontendNotificationTabBadgeCount\s*=\s*effectiveNotificheRisposteCount\s*;/,
  'The booking-notifications tab must contain booking unread only.',
);
requirePattern(
  clientScreen,
  /const frontendCommunicationTabBadgeCount\s*=\s*(?:Math\.max\([^;]*clientNotificationCommunicationUnreadCount[^;]*\)|clientNotificationCommunicationUnreadCount)\s*;/,
  'The communications tab must own the communications unread count.',
);
forbidPattern(
  clientScreen,
  /const notificheRisposteCount\s*=\s*effectiveNotificheRisposteCount\s*\+\s*clientNotificationCommunicationUnreadCount/,
  'Booking and communication counters must not be merged into one tab.',
);
requirePattern(
  clientScreen,
  /key:\s*'notifications'[\s\S]{0,350}?badge:\s*frontendNotificationTabBadgeCount/,
  'The notifications tab must render only its booking badge.',
);
requirePattern(
  clientScreen,
  /key:\s*'communications'[\s\S]{0,350}?label:\s*'Comunicazioni'[\s\S]{0,350}?badge:\s*frontendCommunicationTabBadgeCount/,
  'The communications tab must render its own badge.',
);
requirePattern(
  clientScreen,
  /\(\)\s*=>\s*\['booking',\s*'notifications',\s*'communications',\s*'waitlist',\s*'settings'\]/,
  'The new inbox must be inserted without changing the relative order of the existing tabs.',
);
requirePattern(
  clientScreen,
  /key:\s*'communications'[\s\S]{0,220}?icon:\s*'megaphone-outline'[\s\S]{0,120}?activeIcon:\s*'megaphone'/,
  'The Communications tab must use the megaphone in both states.',
);
requirePattern(
  clientScreen,
  /const frontendClientTabBarHeight\s*=\s*64\s*;/,
  'Adding the fifth tab must preserve the established CustomBar height.',
);
requirePattern(
  clientScreen,
  /key:\s*'waitlist'[\s\S]{0,350}?badge:\s*waitlistUnreadCount/,
  'The waitlist tab must keep only the waitlist badge.',
);
requirePattern(
  clientScreen,
  /target\.section === 'communications'[\s\S]{0,700}?setFrontendClientTab\('communications'\)|openSalonCommunicationFromNotification[\s\S]{0,900}?setFrontendClientTab\('communications'\)/,
  'A communication push must navigate to the Communications tab.',
);

// Booking history is a real year -> month archive, not a flat month list with repeated year pills.
requirePattern(
  clientScreen,
  /const richiesteArchiviatePerAnno\s*=\s*useMemo\([\s\S]*?months:\s*new Map|const richiesteArchiviateByYear\s*=\s*useMemo\([\s\S]*?months:\s*new Map/,
  'Booking history must be grouped by year and then by month.',
);
requirePattern(
  clientScreen,
  /richiesteArchiviate(?:PerAnno|ByYear)\.map\(\(yearGroup\)[\s\S]*?yearGroup\.months\.map\(\(monthGroup\)/,
  'Booking archive rendering must nest month accordions inside year groups.',
);
requirePattern(
  clientScreen,
  /const currentArchiveMonthKey\s*=\s*servicePromotionReferenceDate\.slice\(0, 7\)/,
  'Archive routing must follow the live local month instead of a mount-time constant.',
);
requirePattern(
  clientScreen,
  /counts\[rowMonthKey < currentArchiveMonthKey \? 'archive' : 'cancelled'\]/,
  'Only terminal bookings from an earlier month may enter the unread archive bucket.',
);

const classifyTerminalBookingMonth = (bookingMonth, currentMonth) =>
  bookingMonth && bookingMonth < currentMonth ? 'archive' : 'cancelled';
assert.equal(classifyTerminalBookingMonth('2026-07', '2026-08'), 'archive');
assert.equal(classifyTerminalBookingMonth('2026-08', '2026-08'), 'cancelled');
assert.equal(
  classifyTerminalBookingMonth('2026-09', '2026-08'),
  'cancelled',
  'A future cancelled booking must remain in recent cancellations, not the historical archive.',
);

// Client-portal reconciliation preserves every group phase/operator before the reader collapses it logically.
const resolutionKeyBlock = sliceBetween(
  clientScreen,
  'const buildPublicRequestResolutionKey = (',
  'const buildPublicRequestSlotKey = (',
);
requirePattern(
  resolutionKeyBlock,
  /appointmentGroupId/,
  'Client-portal resolution keys must include the appointment group.',
);
requirePattern(
  resolutionKeyBlock,
  /operatoreId[\s\S]*?operatoreNome/,
  'Client-portal resolution keys must preserve operator identity.',
);

const liveAppointmentResolutionBlock = sliceBetween(
  clientScreen,
  'const findLiveAppointmentForAcceptedRequest = (',
  'const shouldReplaceCanonicalPublicRequest = ({',
);
requirePattern(
  liveAppointmentResolutionBlock,
  /const requestAppointmentGroupId\s*=\s*request\.appointmentGroupId\?\.trim\(\)\s*\?\?\s*''/,
  'A rehydrated accepted request must retain its appointment group as the live-match authority.',
);
requirePattern(
  liveAppointmentResolutionBlock,
  /const exactLinkedCandidates = appointments\.filter[\s\S]*?bookingRequestId === requestId[\s\S]*?const groupLinkedCandidates = appointments\.filter[\s\S]*?appointmentGroupId\?\.trim\(\) === requestAppointmentGroupId[\s\S]*?const legacyCandidates = appointments\.filter[\s\S]*?if \(String\(item\.bookingRequestId[\s\S]*?return false;[\s\S]*?matchesRequestSlot\(item\)[\s\S]*?const candidates = exactLinkedCandidates\.length > 0[\s\S]*?groupLinkedCandidates\.length > 0[\s\S]*?legacyCandidates/,
  'Live appointment matching must resolve explicit request or group identity before using slot details only for legacy rows.',
);

const liveAppointmentHydrationBlock = sliceBetween(
  clientScreen,
  'const applyLiveAppointmentDetailsToAcceptedRequest = (',
  'const formatDurationLabel = (',
);
requirePattern(
  liveAppointmentHydrationBlock,
  /appointmentGroupId:\s*request\.appointmentGroupId\?\.trim\(\)\s*\?\s*request\.appointmentGroupId\s*:\s*linkedAppointment\.appointmentGroupId/,
  'Live appointment hydration must never overwrite an authoritative request group.',
);

const legacyAcceptedProjectionDedupeBlock = sliceBetween(
  clientScreen,
  'const findUniqueAcceptedLogicalRequestForLegacyAppointment = ({',
  'const shouldReplaceCanonicalPublicRequest = ({',
);
requirePattern(
  legacyAcceptedProjectionDedupeBlock,
  /if \(appointment\.bookingRequestId\?\.trim\(\)\) \{[\s\S]*?return null;/,
  'The legacy fallback must never replace the authoritative bookingRequestId path.',
);
requirePattern(
  legacyAcceptedProjectionDedupeBlock,
  /request\.stato !== 'Accettata'/,
  'Only accepted requests may absorb a legacy appointment projection.',
);
requirePattern(
  legacyAcceptedProjectionDedupeBlock,
  /\(appointmentGroupId \|\| requestGroupId\)[\s\S]*?!appointmentGroupId \|\| !requestGroupId \|\| appointmentGroupId !== requestGroupId/,
  'Legacy projection matching must require both group ids to exist and agree whenever either side is grouped.',
);
requirePattern(
  legacyAcceptedProjectionDedupeBlock,
  /request\.data[\s\S]*?request\.ora[\s\S]*?request\.servizio[\s\S]*?matchesCustomerDisplayName[\s\S]*?matchesOperatorIdentity/,
  'The fallback must match customer, date, time, service and operator before suppressing a synthetic card.',
);
requirePattern(
  legacyAcceptedProjectionDedupeBlock,
  /const matchesByLogicalIdentity = new Map<[\s\S]*?group:\$\{groupId\}[\s\S]*?request:\$\{requestId\}[\s\S]*?matchesByLogicalIdentity\.size === 1/,
  'The fallback must accept exactly one logical request or group, never a generic same-slot match.',
);

const acceptedAppointmentProjectionBlock = sliceBetween(
  clientScreen,
  'const persistedCanonicalRequestCandidates = Array.from(',
  'const operatorChangesByRequestId = new Map(',
);
requirePattern(
  acceptedAppointmentProjectionBlock,
  /persistedCanonicalRequestCandidates[\s\S]*?effectiveAppuntamenti\.forEach[\s\S]*?canonicalBookingRequestId[\s\S]*?request\.id[\s\S]*?findUniqueAcceptedLogicalRequestForLegacyAppointment[\s\S]*?requests: persistedCanonicalRequestCandidates[\s\S]*?linkedCanonicalRequest \|\| uniqueLegacyLinkedRequest/,
  'Appointment cards must prefer exact request ids and use the unique legacy fallback only before synthesis.',
);

// Executable regression fixtures: two phases are one reader event, while a newer
// status/version for the same group remains unread when an older session closes.
const normalize = (value) => String(value ?? '').trim().toLowerCase();
const findUniqueLegacyProjectionFixture = (appointment, requests) => {
  if (String(appointment.bookingRequestId ?? '').trim()) return null;

  const matching = requests.filter((request) => {
    if (request.stato !== 'Accettata') return false;
    const appointmentGroupId = String(appointment.appointmentGroupId ?? '').trim();
    const requestGroupId = String(request.appointmentGroupId ?? '').trim();
    if (
      (appointmentGroupId || requestGroupId) &&
      (!appointmentGroupId || !requestGroupId || appointmentGroupId !== requestGroupId)
    ) {
      return false;
    }

    const appointmentOperator = normalize(appointment.operatoreId || appointment.operatoreNome);
    const requestOperator = normalize(request.operatoreId || request.operatoreNome);
    return (
      String(appointment.data ?? '').trim() === String(request.data ?? '').trim() &&
      String(appointment.ora ?? '').trim().slice(0, 5) ===
        String(request.ora ?? '').trim().slice(0, 5) &&
      normalize(appointment.servizio) === normalize(request.servizio) &&
      normalize(appointment.cliente) === normalize(`${request.nome} ${request.cognome}`) &&
      appointmentOperator === requestOperator
    );
  });

  const logicalMatches = new Map();
  matching.forEach((request, index) => {
    const groupId = String(request.appointmentGroupId ?? '').trim();
    const requestId = String(request.id ?? '').trim();
    const key = groupId ? `group:${groupId}` : requestId ? `request:${requestId}` : `legacy:${index}`;
    if (!logicalMatches.has(key)) logicalMatches.set(key, request);
  });
  return logicalMatches.size === 1 ? logicalMatches.values().next().value : null;
};

const simpleLegacyAppointment = {
  id: 'appointment-simple',
  data: '2026-09-01',
  ora: '11:50',
  servizio: 'Taglio + Shampoo',
  cliente: 'Nicolo Roselli',
  operatoreNome: 'Edoardo',
};
const simpleAcceptedRequest = {
  id: 'request-simple',
  stato: 'Accettata',
  data: '2026-09-01',
  ora: '11:50',
  servizio: 'Taglio + Shampoo',
  nome: 'Nicolo',
  cognome: 'Roselli',
  operatoreNome: 'Edoardo',
};
assert.equal(
  findUniqueLegacyProjectionFixture(simpleLegacyAppointment, [simpleAcceptedRequest])?.id,
  'request-simple',
  'One exact accepted request must absorb its legacy appointment projection.',
);

const compositionAppointments = [
  {
    id: 'appointment-phase-1',
    appointmentGroupId: 'composition-1',
    appointmentGroupOrder: 0,
    data: '2026-09-01',
    ora: '12:00',
    servizio: 'Colore',
    cliente: 'Cliente Composto',
    operatoreNome: 'Moira',
  },
  {
    id: 'appointment-phase-2',
    appointmentGroupId: 'composition-1',
    appointmentGroupOrder: 1,
    data: '2026-09-01',
    ora: '12:30',
    servizio: 'Piega',
    cliente: 'Cliente Composto',
    operatoreNome: 'Sara',
  },
];
const compositionRequests = compositionAppointments.map((appointment, index) => ({
  id: `request-phase-${index + 1}`,
  appointmentGroupId: appointment.appointmentGroupId,
  appointmentGroupOrder: appointment.appointmentGroupOrder,
  stato: 'Accettata',
  data: appointment.data,
  ora: appointment.ora,
  servizio: appointment.servizio,
  nome: 'Cliente',
  cognome: 'Composto',
  operatoreNome: appointment.operatoreNome,
}));
const compositionSnapshotBeforeMatch = JSON.stringify(compositionRequests);
const matchedCompositionLogicalKeys = compositionAppointments.map((appointment) => {
  const request = findUniqueLegacyProjectionFixture(appointment, compositionRequests);
  return request ? `group:${request.appointmentGroupId}` : null;
});
assert.deepEqual(
  matchedCompositionLogicalKeys,
  ['group:composition-1', 'group:composition-1'],
  'Every linked phase must resolve to the same logical composition without a synthetic duplicate.',
);
assert.equal(
  new Set(matchedCompositionLogicalKeys).size,
  1,
  'Composition phases and linked services must remain one logical booking.',
);
assert.equal(
  JSON.stringify(compositionRequests),
  compositionSnapshotBeforeMatch,
  'Legacy projection matching must not reorder or rewrite phase details.',
);

assert.equal(
  findUniqueLegacyProjectionFixture(simpleLegacyAppointment, [
    simpleAcceptedRequest,
    { ...simpleAcceptedRequest, id: 'request-distinct' },
  ]),
  null,
  'Two real accepted requests in the same slot are ambiguous and must never be merged.',
);
assert.equal(
  findUniqueLegacyProjectionFixture(
    { ...simpleLegacyAppointment, appointmentGroupId: 'group-a' },
    [
      { ...simpleAcceptedRequest, id: 'group-a-request', appointmentGroupId: 'group-a' },
      { ...simpleAcceptedRequest, id: 'group-b-request', appointmentGroupId: 'group-b' },
    ],
  )?.id,
  'group-a-request',
  'A grouped appointment may match its own group but must never absorb another group sharing the slot.',
);
const buildLogicalKey = (row) => {
  const groupId = String(row.appointmentGroupId ?? '').trim();
  return groupId ? `group:${groupId}` : `request:${String(row.requestId ?? '').trim()}`;
};
const buildVersionKey = (row) =>
  [
    buildLogicalKey(row),
    normalize(row.status),
    normalize(row.cancellationSource),
    String(row.appointmentDate ?? '').trim(),
    String(row.appointmentTime ?? '').trim().slice(0, 5),
    normalize(row.serviceName),
    String(row.updatedAt ?? '').trim(),
  ].join('|');
const stageLogicalEvents = (rows) => {
  const byLogicalKey = new Map();
  for (const row of rows) {
    const key = buildLogicalKey(row);
    const current = byLogicalKey.get(key);
    if (!current || String(row.updatedAt ?? '') > String(current.updatedAt ?? '')) {
      byLogicalKey.set(key, row);
    }
  }
  return Array.from(byLogicalKey.values());
};

const groupedPhases = [
  {
    requestId: 'phase-a',
    appointmentGroupId: 'group-1',
    status: 'accepted',
    serviceName: 'Colore',
    operatorId: 'operator-a',
    updatedAt: '2026-08-29T08:00:00.000Z',
  },
  {
    requestId: 'phase-b',
    appointmentGroupId: 'group-1',
    status: 'accepted',
    serviceName: 'Piega',
    operatorId: 'operator-b',
    updatedAt: '2026-08-29T08:00:00.000Z',
  },
];
const stagedGroup = stageLogicalEvents(groupedPhases);
assert.equal(stagedGroup.length, 1, 'A linked multi-operator booking must expose one reader event.');

const stagedAcceptedVersion = buildVersionKey(stagedGroup[0]);
const laterCancellationVersion = buildVersionKey({
  ...stagedGroup[0],
  status: 'cancelled',
  cancellationSource: 'salone',
  updatedAt: '2026-08-29T08:05:00.000Z',
});
assert.notEqual(
  stagedAcceptedVersion,
  laterCancellationVersion,
  'Closing an old accepted session must not consume a newer cancellation.',
);

const buildPortalResolutionKeyFixture = (row) =>
  [
    row.appointmentGroupId,
    row.appointmentDate,
    row.appointmentTime,
    normalize(row.serviceName),
    normalize(row.operatorId || row.operatorName),
  ].join('|');
assert.notEqual(
  buildPortalResolutionKeyFixture({
    ...groupedPhases[0],
    appointmentDate: '2026-08-29',
    appointmentTime: '09:00',
  }),
  buildPortalResolutionKeyFixture({
    ...groupedPhases[1],
    appointmentDate: '2026-08-29',
    appointmentTime: '09:00',
  }),
  'Client-portal hydration must preserve different operators inside the same group.',
);

// Live regression fixture: the portal snapshot does not contain b857, while the
// unread RPC rehydrates it without an operator. Two appointments intentionally
// share customer, slot and service; only the request group may select Roby.
const portalRowsWithoutB857 = [
  {
    requestId: 'portal-maria',
    appointmentGroupId: 'maria-group',
    status: 'accepted',
    appointmentDate: '2026-08-30',
    appointmentTime: '15:00',
    serviceName: 'Piega',
    operatorName: 'Maria',
    updatedAt: '2026-08-30T13:00:00.000Z',
  },
  {
    requestId: 'portal-cancelled',
    appointmentGroupId: 'cancelled-group',
    status: 'cancelled',
    appointmentDate: '2026-08-31',
    appointmentTime: '11:00',
    serviceName: 'Taglio',
    updatedAt: '2026-08-30T13:05:00.000Z',
  },
];
assert.equal(
  portalRowsWithoutB857.some((row) => row.appointmentGroupId === 'b857'),
  false,
  'The regression fixture must model b857 as missing from the portal snapshot.',
);

const unreadRehydratedB857 = {
  requestId: 'unread-b857',
  appointmentGroupId: 'b857',
  stato: 'Accettata',
  status: 'accepted',
  nome: 'Cliente',
  cognome: 'Test',
  data: '2026-08-30',
  ora: '15:00',
  servizio: 'Piega',
  appointmentDate: '2026-08-30',
  appointmentTime: '15:00',
  serviceName: 'Piega',
  updatedAt: '2026-08-30T13:10:00.000Z',
};
assert.equal(
  unreadRehydratedB857.operatoreNome,
  undefined,
  'The unread row must reproduce the missing-operator payload.',
);

const sameSlotAppointments = [
  {
    id: 'appointment-maria',
    appointmentGroupId: 'maria-group',
    data: '2026-08-30',
    ora: '15:00',
    servizio: 'Piega',
    cliente: 'Cliente Test',
    operatoreNome: 'Maria',
  },
  {
    id: 'appointment-roby',
    appointmentGroupId: 'b857',
    data: '2026-08-30',
    ora: '15:00',
    servizio: 'Piega',
    cliente: 'Cliente Test',
    operatoreNome: 'Roby',
  },
];

const findLiveAppointmentFixture = (request, appointments) => {
  const customerName = `${request.nome} ${request.cognome}`.trim();
  const matchesSlot = (appointment) =>
    appointment.data === request.data &&
    appointment.ora === request.ora &&
    normalize(appointment.servizio) === normalize(request.servizio) &&
    normalize(appointment.cliente) === normalize(customerName);
  const requestId = String(request.requestId ?? request.id ?? '').trim();
  const groupId = String(request.appointmentGroupId ?? '').trim();
  const exactLinkedCandidates = appointments.filter(
    (appointment) =>
      requestId && String(appointment.bookingRequestId ?? '').trim() === requestId,
  );
  const groupLinkedCandidates = appointments.filter(
    (appointment) =>
      String(appointment.bookingRequestId ?? '').trim() &&
      groupId &&
      String(appointment.appointmentGroupId ?? '').trim() === groupId,
  );
  const legacyCandidates = appointments.filter((appointment) => {
    if (String(appointment.bookingRequestId ?? '').trim()) return false;
    const appointmentGroupId = String(appointment.appointmentGroupId ?? '').trim();
    const coherentGroup = !groupId && !appointmentGroupId
      ? true
      : Boolean(groupId && appointmentGroupId === groupId);
    return coherentGroup && matchesSlot(appointment);
  });
  const candidates = exactLinkedCandidates.length
    ? exactLinkedCandidates
    : groupLinkedCandidates.length
      ? groupLinkedCandidates
      : legacyCandidates;
  const groupOrderCandidates = typeof request.appointmentGroupOrder === 'number'
    ? candidates.filter(
        (appointment) => appointment.appointmentGroupOrder === request.appointmentGroupOrder,
      )
    : [];
  const phaseCandidates = groupOrderCandidates.length ? groupOrderCandidates : candidates;
  const exactSlotMatch = phaseCandidates.find(matchesSlot);
  if (exactSlotMatch) return exactSlotMatch;
  const operatorName = normalize(request.operatoreNome);
  return (
    phaseCandidates.find((appointment) => normalize(appointment.operatoreNome) === operatorName) ??
    phaseCandidates[0] ??
    null
  );
};

const linkedB857Appointment = findLiveAppointmentFixture(
  unreadRehydratedB857,
  sameSlotAppointments,
);
assert.equal(
  linkedB857Appointment?.operatoreNome,
  'Roby',
  'Missing operator data must not let the repeated Maria slot steal the b857 request.',
);

const sameSlotLinkedRequests = [
  {
    ...unreadRehydratedB857,
    requestId: 'request-one',
    id: 'request-one',
    appointmentGroupId: '',
    operatoreNome: 'Roby',
  },
  {
    ...unreadRehydratedB857,
    requestId: 'request-two',
    id: 'request-two',
    appointmentGroupId: '',
    operatoreNome: 'Roby',
  },
];
const sameSlotLinkedAppointments = sameSlotLinkedRequests.map((request, index) => ({
  id: `linked-appointment-${index + 1}`,
  bookingRequestId: request.id,
  data: request.data,
  ora: request.ora,
  servizio: request.servizio,
  cliente: `${request.nome} ${request.cognome}`,
  operatoreNome: request.operatoreNome,
}));
assert.deepEqual(
  sameSlotLinkedRequests.map(
    (request) => findLiveAppointmentFixture(request, sameSlotLinkedAppointments)?.bookingRequestId,
  ),
  ['request-one', 'request-two'],
  'Two real accepted requests sharing a slot must hydrate only from their own linked appointments.',
);
assert.equal(
  findLiveAppointmentFixture(
    sameSlotLinkedRequests[0],
    sameSlotLinkedAppointments.map((appointment, index) =>
      index === 0
        ? { ...appointment, data: '2026-09-02', ora: '14:20' }
        : appointment,
    ),
  )?.bookingRequestId,
  'request-one',
  'An explicitly linked moved appointment must remain authoritative over stale request slot details.',
);

const hydratedB857 = {
  ...unreadRehydratedB857,
  appointmentGroupId: unreadRehydratedB857.appointmentGroupId?.trim()
    ? unreadRehydratedB857.appointmentGroupId
    : linkedB857Appointment?.appointmentGroupId,
  operatoreNome: linkedB857Appointment?.operatoreNome,
};
assert.equal(
  hydratedB857.appointmentGroupId,
  'b857',
  'The request group must remain authoritative after live appointment hydration.',
);

const stagedRepeatedSlotEvents = stageLogicalEvents([
  ...portalRowsWithoutB857,
  hydratedB857,
]);
assert.deepEqual(
  stagedRepeatedSlotEvents.map(buildLogicalKey).sort(),
  ['group:b857', 'group:cancelled-group', 'group:maria-group'],
  'Portal rows plus the rehydrated b857 unread event must remain three logical notifications.',
);

const unreadBuckets = { booking: 3, communications: 2, waitlist: 1 };
assert.deepEqual(
  {
    notificationsTab: unreadBuckets.booking,
    communicationsTab: unreadBuckets.communications,
    waitlistTab: unreadBuckets.waitlist,
    launcher: unreadBuckets.booking + unreadBuckets.communications + unreadBuckets.waitlist,
  },
  { notificationsTab: 3, communicationsTab: 2, waitlistTab: 1, launcher: 6 },
  'Frontend tabs must remain disjoint while the launcher keeps the global total.',
);

console.log(
  `Client notification lifecycle contracts passed (versioned migration: ${versionedMigration.fileName}).`,
);
