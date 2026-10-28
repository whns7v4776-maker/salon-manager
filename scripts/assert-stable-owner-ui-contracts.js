/* global __dirname */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const agendaSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const measuredWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (useWebMeasuredCompactLayout)'),
  agendaSource.indexOf('if (useEssentialAdaptiveLayout)'),
);
const essentialWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (useEssentialAdaptiveLayout)'),
  agendaSource.indexOf('if (usePremiumWebAppointmentLayout)'),
);
const premiumWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (usePremiumWebAppointmentLayout)'),
  agendaSource.indexOf('const detailLines = ['),
);
const sharedWebPhaseBadgeSource = agendaSource.slice(
  agendaSource.indexOf('const webNumberedPhaseLabel ='),
  agendaSource.indexOf('const canSplitClientLabel ='),
);
const globalCssSource = fs.readFileSync(
  path.join(root, 'app', 'global.css'),
  'utf8',
);
const draggableWeekAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('function DraggableWeekAppointment'),
  agendaSource.indexOf('function NativeWeekGridPreviewOverlay'),
);
const nativeResizePanSource = draggableWeekAppointmentSource.slice(
  draggableWeekAppointmentSource.indexOf(
    'const nativeResizePan = Gesture.Pan()',
  ),
  draggableWeekAppointmentSource.indexOf('const tap = Gesture.Tap'),
);
const nativeResizeUpdateSource = nativeResizePanSource.slice(
  nativeResizePanSource.indexOf('.onUpdate'),
  nativeResizePanSource.indexOf('.onEnd'),
);
const nativeResizeEndSource = nativeResizePanSource.slice(
  nativeResizePanSource.indexOf('.onEnd'),
  nativeResizePanSource.indexOf('.onFinalize'),
);
const nativeResizeFinalizeSource = nativeResizePanSource.slice(
  nativeResizePanSource.indexOf('.onFinalize'),
);
const nativeGestureScrollViewSource = agendaSource.slice(
  agendaSource.indexOf('const NativeGestureScrollView = React.forwardRef<'),
  agendaSource.indexOf('const WeekPlannerScrollContainer:'),
);
const weekPlannerPanelSource = agendaSource.slice(
  agendaSource.indexOf('const weekPlannerPanel = useMemo'),
  agendaSource.indexOf('const agendaOverviewPanel'),
);
const supabaseSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'supabase.ts'),
  'utf8',
);
const nativeAgendaDayPickerSource = fs.readFileSync(
  path.join(
    root,
    'modules',
    'wheel-picker-haptics',
    'ios',
    'AgendaDayPickerView.swift',
  ),
  'utf8',
);
const servicesSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);
const requestsSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'prenotazioni.tsx'),
  'utf8',
);
const homeSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'index.tsx'),
  'utf8',
);
const rootLayoutSource = fs.readFileSync(
  path.join(root, 'app', '_layout.tsx'),
  'utf8',
);
const landingSource = fs.readFileSync(
  path.join(root, 'app', 'index.tsx'),
  'utf8',
);
const ownerAccessSource = fs.readFileSync(
  path.join(root, 'src', 'screens', 'OwnerAccessScreen.tsx'),
  'utf8',
);
const settingsSource = fs.readFileSync(
  path.join(root, 'app', 'impostazioni.tsx'),
  'utf8',
);
const moduleHeroHeaderSource = fs.readFileSync(
  path.join(root, 'components', 'module-hero-header.tsx'),
  'utf8',
);
const clientsSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'clienti.tsx'),
  'utf8',
);
const clearableTextInputSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'clearable-text-input.tsx'),
  'utf8',
);
const ownerCustomerCreationMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260828111000_harden_owner_customer_workspace_and_birthday.sql',
  ),
  'utf8',
);
const idempotentOwnerCustomerCreationMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260829233000_idempotent_owner_customer_creation_v4.sql',
  ),
  'utf8',
);
const ownerLogicalStartNotificationMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260830114500_classify_owner_logical_start_notifications.sql',
  ),
  'utf8',
);
const clientFrontendSource = fs.readFileSync(
  path.join(root, 'app', 'cliente-screen.tsx'),
  'utf8',
);
const unreadBadgeContextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'UnreadBadgeContext.tsx'),
  'utf8',
);
const customerCommunicationsModalSource = fs.readFileSync(
  path.join(root, 'components', 'customer-communications-modal.tsx'),
  'utf8',
);
const customerCommunicationsSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'customer-communications.ts'),
  'utf8',
);
const customerCommunicationTemplatesMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260820150000_customer_communication_quick_templates.sql',
  ),
  'utf8',
);
const deleteCustomerCommunicationTemplatesMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260820151500_delete_customer_communication_quick_templates.sql',
  ),
  'utf8',
);
const snapshotResurrectionAndColorMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260827160000_prevent_snapshot_resurrection_and_color_drift.sql',
  ),
  'utf8',
);
const canonicalPortalAppointmentsMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260828124500_canonicalize_portal_appointment_projection.sql',
  ),
  'utf8',
);
const canonicalPortalRequestRoleMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260828130000_canonicalize_portal_request_required_role.sql',
  ),
  'utf8',
);
const ownerTabsLayoutSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', '_layout.tsx'),
  'utf8',
);
const clientPortalSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'client-portal.ts'),
  'utf8',
);
const frequentCustomersSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'frequent-customers.ts'),
  'utf8',
);
const compositionOnlyServicesMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260819213000_composition_only_services.sql',
  ),
  'utf8',
);
const separatedCompositionNamesMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260827150000_separate_composition_component_names.sql',
  ),
  'utf8',
);
const updateCompositionOnlyServiceMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260827163000_update_composition_only_service.sql',
  ),
  'utf8',
);
const deletedCompositionComponentGuardMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260827170000_prevent_deleted_composition_component_resurrection.sql',
  ),
  'utf8',
);
const cascadeLinkedDurationMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260819214500_cascade_linked_appointment_duration.sql',
  ),
  'utf8',
);
const unreadBadgesSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'badges', 'unread-badges.ts'),
  'utf8',
);
const servicePhasesSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'service-phases.ts'),
  'utf8',
);
const ownerStartupLoadingSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'OwnerStartupLoadingContext.tsx'),
  'utf8',
);
const premiumExpandButtonSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'premium-expand-button.tsx'),
  'utf8',
);
const premiumGuideDockSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'premium-guide-dock.tsx'),
  'utf8',
);
const numberPickerModalSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'number-picker-modal.tsx'),
  'utf8',
);
const nativeDatePickerModalSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'native-date-picker-modal.tsx'),
  'utf8',
);
const nativeTimePickerModalSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'native-time-picker-modal.tsx'),
  'utf8',
);
const linkedBookingPushMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260817235500_unify_linked_booking_customer_pushes.sql',
  ),
  'utf8',
);
const groupedClientBadgeMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260818001500_group_client_unread_badge_rows.sql',
  ),
  'utf8',
);
const linkedBookingOwnerPushMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260818012500_single_owner_push_for_linked_booking_groups.sql',
  ),
  'utf8',
);
const pushNotificationsSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'push', 'push-notifications.ts'),
  'utf8',
);
const sendPushFunctionSource = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'send-push', 'index.ts'),
  'utf8',
);
const ownerForegroundBannerEventsSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'push', 'owner-foreground-banner-events.ts'),
  'utf8',
);
const ownerPrivateStateLoaderSource = contextSource.slice(
  contextSource.indexOf('const loadOwnerPrivateServerState'),
  contextSource.indexOf('const syncCashTablesForWorkspace'),
);
const authoritativeCustomerLimitsMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260815193000_make_customer_limits_server_authoritative.sql',
  ),
  'utf8',
);

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

const requireTokenOrder = (source, tokens, message) => {
  let cursor = -1;
  tokens.forEach((token) => {
    const next = source.indexOf(token, cursor + 1);
    if (next <= cursor) {
      throw new Error(`${message} Missing or out of order: ${token}`);
    }
    cursor = next;
  });
};

requirePattern(
  contextSource,
  /const hasAuthoritativeRemoteClienti =\s*customersResult\.status === 'fulfilled' && !customersResult\.value\.error;/,
  'The customers table must remain the explicit authoritative client source.',
);
requirePattern(
  contextSource,
  /clienti: hasAuthoritativeRemoteClienti\s*\? remoteClienti/,
  'An authoritative empty customers response must not fall back to a stale snapshot.',
);
if (
  /mergeClientiCollections\(authoritativeRemoteClienti, snapshotClienti\)/.test(
    contextSource,
  )
) {
  throw new Error(
    'Authoritative customers must never be unioned with stale snapshot-only rows.',
  );
}
requirePattern(
  contextSource,
  /nota: authoritativeItem\.nota \?\? '',/,
  'An authoritative empty customer note must clear every stale local or request-derived note.',
);
requirePattern(
  contextSource,
  /maxFutureAppointments:\s*authoritativeItem\.maxFutureAppointments,[\s\S]*?maxFutureAppointmentsMode:\s*authoritativeItem\.maxFutureAppointmentsMode,[\s\S]*?maxDailyAppointments:\s*authoritativeItem\.maxDailyAppointments,/,
  'Authoritative customer limits, including unlimited nulls, must overwrite every cache or portal snapshot.',
);
requirePattern(
  contextSource,
  /Platform\.OS !== 'web' && isUuidValue\(targetIdentity\.id\)[\s\S]*?item\.id\.trim\(\)\.toLowerCase\(\) === targetIdentity\.id\.toLowerCase\(\)/,
  'Native customer edits must target the immutable server UUID, not mutable identity aliases.',
);
requirePattern(
  contextSource,
  /'id, full_name, phone, email, instagram, birthday, note, source, registration_status, viewed_by_salon, is_active, max_future_appointments, max_future_appointments_mode, max_daily_appointments'/,
  'Customer updates must read back every editable server field before reporting success.',
);
requirePattern(
  contextSource,
  /applyAuthoritativeClientServerState\([\s\S]{0,500}?applyLocalCustomerUpdate\(clientiRef\.current\),\s*confirmedServerCustomers,?\s*\)/,
  'The customer card shown after saving must use the confirmed server response.',
);
requirePattern(
  authoritativeCustomerLimitsMigrationSource,
  /'maxFutureAppointments', customer\.max_future_appointments,[\s\S]*?'maxFutureAppointmentsMode', customer\.max_future_appointments_mode,[\s\S]*?'maxDailyAppointments', customer\.max_daily_appointments/,
  'Client portals must derive every booking limit directly from the customers table.',
);
requirePattern(
  authoritativeCustomerLimitsMigrationSource,
  /'maxFutureAppointments', matched_customer\.max_future_appointments,[\s\S]*?'maxFutureAppointmentsMode', matched_customer\.max_future_appointments_mode,[\s\S]*?'maxDailyAppointments', matched_customer\.max_daily_appointments/,
  'Owner snapshots must be repaired from the canonical customers table.',
);
requirePattern(
  contextSource,
  /const serverDidConfirmCustomerFields =[\s\S]*?Platform\.OS === 'web'[\s\S]*?: confirmedCustomerRows\.every\(/,
  'Customer edits must compare the complete server response before updating the native card.',
);
if (
  /if \(backendCustomerIds\.length === 0\) \{\s*setClienti\(\(current\) => applyLocalCustomerUpdate\(current\)\);\s*return \{ ok: true as const \};\s*\}/.test(
    contextSource,
  )
) {
  throw new Error(
    'An unsynchronized customer edit must never report success after changing local state only.',
  );
}
requirePattern(
  contextSource,
  /if \(effectiveBackendCustomerIds\.length === 0\) \{[\s\S]*?non è ancora sincronizzato col server/,
  'Unsynchronized customer cards must fail explicitly instead of reverting after a false success.',
);
requirePattern(
  contextSource,
  /const recentlyUpdatedCustomerSnapshotsRef = React\.useRef<[\s\S]*?customer: Cliente/,
  'Native realtime merges must retain the last server-confirmed customer snapshot.',
);
requirePattern(
  contextSource,
  /const dedupeNativeClientiByStableId = \(items: Cliente\[\]\) => \{[\s\S]*?if \(Platform\.OS === 'web'\) \{[\s\S]*?stableIndexById/,
  'Native customer cards must be deduplicated by immutable UUID without changing web behavior.',
);
requirePattern(
  contextSource,
  /La nota della richiesta riguarda la prenotazione[\s\S]*?nota: '',/,
  'Booking-request notes must never become internal customer notes.',
);
if (
  /if \(normalizedRemoteItems\.length < normalizedLocalItems\.length\)/.test(
    contextSource,
  )
) {
  throw new Error(
    'A smaller authoritative appointment snapshot must not preserve all stale local appointments.',
  );
}
requirePattern(
  contextSource,
  /owner_data_workspace_id: 'salon_manager_owner_data_workspace_id'/,
  'Owner caches must be bound to one explicit workspace id.',
);
requirePattern(
  contextSource,
  /ownerDataWorkspaceIdSalvato\?\.trim\(\) === storedWorkspace\.id\.trim\(\)/,
  'A cached owner dataset must be rejected when its workspace id does not match.',
);
requirePattern(
  contextSource,
  /if \(!privateServerState\?\.appuntamentiAuthoritative\) \{\s*return current;/,
  'Public or snapshot appointments must never overwrite authenticated owner appointments.',
);
requirePattern(
  contextSource,
  /if \(applyToState\) \{[\s\S]*?setOwnerAppointmentsAuthoritative\(false\);/,
  'Every applied owner refresh must invalidate financial authority before reading remote data.',
);
requirePattern(
  contextSource,
  /if \(Platform\.OS === 'web'\) \{[\s\S]*?setOwnerAppointmentsAuthoritative\(false\);[\s\S]*?if \(Platform\.OS !== 'web'\) \{[\s\S]*?setAppuntamenti\(/,
  'Web account priming must never inject cached appointment collections during Fast Refresh.',
);
requirePattern(
  contextSource,
  /const canPersistOwnerScopedData =[\s\S]*?ownerAppointmentsAuthoritative &&/,
  'Owner appointment caches must only be written from a private authoritative dataset.',
);
requirePattern(
  contextSource,
  /upsertRealtimeAppointmentPatch\(current, nextAppointment\)/,
  'A one-row realtime appointment event must preserve the rest of the owner agenda.',
);
requirePattern(
  contextSource,
  /typeof row\.cashed_in === 'boolean'[\s\S]*?\? row\.cashed_in[\s\S]*?: typeof row\.incassato === 'boolean'/,
  'Realtime private appointments must preserve the authoritative cashed_in state.',
);
requirePattern(
  contextSource,
  /ownerFinancialAppointmentsWorkspaceIdRef\.current === workspaceId[\s\S]*?ownerFinancialAppointmentsRef\.current/,
  'Owner snapshots must take financial appointment flags from the private workspace dataset.',
);
requirePattern(
  contextSource,
  /updateOwnerFinancialAppointmentsForWorkspace\([\s\S]*?upsertRealtimeAppointmentPatch\(current, nextAppointment\)/,
  'Private realtime appointment patches must update the Home financial dataset.',
);
requirePattern(
  contextSource,
  /if \(initialPrivateServerState\?\.clientiAuthoritative\)/,
  'Initial owner client hydration must respect an authoritative empty or smaller customers table.',
);
requirePattern(
  clientsSource,
  /Promemoria e comunicazioni/,
  'The customer reminders guide must keep its compact section title.',
);
requirePattern(
  clientFrontendSource,
  /const completeOnlineCatalog = \([\s\S]*?publicSalonState\?\.servizi\?\.length[\s\S]*?cachedPublicCatalogForSelectedSalon\?\.servizi\s*\?\?\s*displayFrontendServizi/,
  'Customer-specific service visibility must not change the salon service-card color mode.',
);
requirePattern(
  clientFrontendSource,
  /!isWeb && IS_ANDROID && selected && styles\.serviceCardActiveAndroid/,
  'Selected Android frontend service cards must retain their dedicated visible 3D depth.',
);
requirePattern(
  clientFrontendSource,
  /serviceCardActiveAndroid:\s*\{[\s\S]*?shadowColor: ['"]#1D4ED8['"],[\s\S]*?elevation: 22,/,
  'The selected Android service-card depth must remain visibly blue and elevated.',
);
requirePattern(
  clientFrontendSource,
  /serviceSelectedBadge:\s*\{[\s\S]*?bottom: -13,[\s\S]*?left: 18,[\s\S]*?right: 18,[\s\S]*?height: 26,[\s\S]*?serviceSelectedBadgeDenseNative:\s*\{[\s\S]*?bottom: -20,[\s\S]*?height: 22/,
  'Selected compact native service badges must sit below the price instead of covering it.',
);
requirePattern(
  clientFrontendSource,
  /serviceSelectedBadgeWeb:\s*\{\s*bottom: -27,[\s\S]*?left: 24,[\s\S]*?right: 24/,
  'The selected web-service badge must sit fully below the card instead of covering the price.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const WEB_AUTO_ACCEPT_VISUAL_STATE_MS = ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS;/,
  'Web auto-accept badges must use the same finite visual window as the app.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const registerWebAutoacceptVisualRequests = React\.useCallback\([\s\S]*?if \(!IS_WEB \|\| items\.length === 0\)[\s\S]*?expiresAt: now \+ WEB_AUTO_ACCEPT_VISUAL_STATE_MS/,
  'Web auto-accept badge pulses must be isolated to web and expire automatically.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const localAgendaPendingRequestsCount = ownerTabBadgeDataReady[\s\S]*?\.\.\.ownerLivePendingFrontendRequests,[\s\S]*?\.\.\.ownerUnreadFrontendRequestEvents\.filter\([\s\S]*?item\.stato === "Accettata"[\s\S]*?!isAutoacceptVisualTrackedEvent\(item\)[\s\S]*?androidAutoacceptVisualRequestsCount \+\s*webAutoacceptVisualRequestsCount/,
  'Agenda must count each temporary auto-accept event exactly once on web and native.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const localOwnerUnreadRequestEventsCount = ownerTabBadgeDataReady[\s\S]*?countOwnerLogicalBookingEvents\([\s\S]*?!isAutoacceptVisualTrackedEvent\(item\)[\s\S]*?\) \+ webAutoacceptVisualRequestsCount/,
  'Requests must retain actual unread accepted bookings and count a temporary autoaccept event once.',
);
requirePattern(
  ownerTabsLayoutSource,
  /now - timestamp <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS/,
  'Web must only pulse badges for genuinely fresh automatic booking requests.',
);
requirePattern(
  ownerTabsLayoutSource,
  /if \(\s*!IS_WEB\s*\|\|\s*Object\.keys\(webAutoacceptVisualRequestsRef\.current\)\.length === 0\s*\)[\s\S]*?request\.viewedBySalon !== true[\s\S]*?isRequestEventViewed\(request, viewedRequestIds\)[\s\S]*?delete next\[key\]/,
  'A server-confirmed read must clear the temporary web auto-accept badge immediately.',
);
requirePattern(
  ownerTabsLayoutSource,
  /ownerAutoAcceptPendingFrontendRequests\.filter\(\(item\) => \{[\s\S]*?item\.viewedBySalon === true \|\|[\s\S]*?isRequestEventViewed\(item, viewedRequestIds\)[\s\S]*?return false;/,
  'A read automatic request must never be queued again by the web visual bridge.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const localAgendaPendingRequestsCount = ownerTabBadgeDataReady[\s\S]*?\.\.\.ownerLivePendingFrontendRequests,[\s\S]*?\]\.filter\([\s\S]*?!IS_WEB \|\|[\s\S]*?item\.viewedBySalon !== true[\s\S]*?!isRequestEventViewed\(item, viewedRequestIds\)/,
  'The web Agenda custom-bar badge must count only server-authoritative unread requests.',
);
requirePattern(
  requestsSource,
  /\.update\(\{ viewed_by_salon: true \}\)[\s\S]*?setRichiestePrenotazione\(\(current\) =>[\s\S]*?viewedBySalon: true/,
  'Reading Requests must persist the shared server flag and update the current client immediately.',
);
requirePattern(
  requestsSource,
  /if \(Platform\.OS !== "web"\) \{\s*await persistLocalViewedState\(\);\s*\}[\s\S]*?\.update\(\{ viewed_by_salon: true \}\)[\s\S]*?if \(Platform\.OS === "web"\) \{\s*await persistLocalViewedState\(\);/,
  'Web must confirm the shared server read state before hiding a notification locally.',
);
requirePattern(
  requestsSource,
  /if \(Platform\.OS !== "web"\) \{[\s\S]*?setViewedRequestIds\([\s\S]*?emitOwnerViewedNotificationChange\([\s\S]*?void refreshBadges\(\);\s*\}[\s\S]*?void persistViewedRequestIds/,
  'Native optimistic read behavior must remain unchanged while web becomes server-authoritative.',
);
requirePattern(
  contextSource,
  /viewedBySalon: row\?\.viewed_by_salon \?\? null/,
  'Realtime booking-request rows must carry the shared server read state to every client.',
);
requirePattern(
  contextSource,
  /table: 'booking_requests',[\s\S]*?filter: `workspace_id=eq\.\$\{realtimeWorkspaceId\}`,[\s\S]*?applyRealtimeBookingRequestRow\(row, eventType\)/,
  'Every open owner client must receive booking-request read changes from the shared realtime channel.',
);
requirePattern(
  agendaSource,
  /syntheticRequestViewedBySalon: item\.viewedBySalon === true/,
  'Synthetic Agenda slots must retain the shared server read state.',
);
requirePattern(
  pushNotificationsSource,
  /shouldUseOwnerBannerOnly[\s\S]*?shouldShowBanner:[\s\S]*?false[\s\S]*?shouldShowList:[\s\S]*?false[\s\S]*?shouldPlaySound:[\s\S]*?Platform\.OS === 'ios' \|\| shouldPlayInAppBannerSoundOnly/,
  'Foreground owner pushes on iOS must keep the original APNs sound while the custom banner replaces only the system visuals.',
);
requirePattern(
  pushNotificationsSource,
  /Platform\.OS === 'android'[\s\S]*?isClientForegroundPush\(notificationData\)[\s\S]*?shouldSuppressDuplicateForegroundPush[\s\S]*?shouldShowBanner: true,[\s\S]*?shouldShowList: true,[\s\S]*?shouldPlaySound: true/,
  'Android client foreground pushes must remain visible as one system notification.',
);
requirePattern(
  pushNotificationsSource,
  /playOwnerForegroundBannerSound[\s\S]*?if \(Platform\.OS === 'ios' \|\| Platform\.OS === 'android'\) \{[\s\S]*?delegatedToIncomingPush: true/,
  'The owner banner helper must not schedule a second empty notification for sound on iOS or Android.',
);
requirePattern(
  rootLayoutSource,
  /Platform\.OS === 'ios' && AppState\.currentState === 'active'[\s\S]*?publishOwnerForegroundBannerPush\(\{[\s\S]*?receivedAt: Date\.now\(\)/,
  'The authenticated iOS runtime must publish the visual banner from the same foreground push that produces its sound.',
);
requirePattern(
  rootLayoutSource,
  /syncOwnerForegroundPushPresentation[\s\S]*?AppState\.addEventListener\([\s\S]*?'change',[\s\S]*?syncOwnerForegroundPushPresentation[\s\S]*?subscription\.remove\(\)/,
  'The owner foreground push presentation must follow every app-state transition so iOS never shows both the system push and the in-app banner.',
);
requirePattern(
  ownerForegroundBannerEventsSource,
  /publishOwnerForegroundBannerPush[\s\S]*?listeners\.forEach[\s\S]*?subscribeOwnerForegroundBannerPush/,
  'Foreground owner push banner events must have one synchronous publish-subscribe bridge.',
);
requirePattern(
  ownerTabsLayoutSource,
  /subscribeOwnerForegroundBannerPush[\s\S]*?ownerPendingCancellationPushesRef\.current\.set[\s\S]*?OWNER_CANCELLATION_PUSH_COALESCE_MS[\s\S]*?setLiveRequestBanner\(\{[\s\S]*?OWNER_LIVE_REQUEST_BANNER_DURATION_MS/,
  'The iOS backoffice must coalesce linked cancellation pushes before starting one full banner lifetime.',
);
requirePattern(
  ownerTabsLayoutSource,
  /buildOwnerCustomerCancellationClaimKeys[\s\S]*?appointmentGroupId[\s\S]*?ownerCustomerCancellationBannerClaimsRef[\s\S]*?claimOwnerCustomerCancellationBanner[\s\S]*?rawEligibleBannerRequests\.filter/,
  'A customer cancellation must atomically claim one logical in-app banner across push, realtime and every linked phase.',
);
requirePattern(
  ownerTabsLayoutSource,
  /targetRouteName === "agenda"[\s\S]*?immediateAgendaPendingRequestTarget[\s\S]*?openDetails: "false"/,
  'Tapping the iOS Agenda tab may focus a pending slot but must never open its popup automatically.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const visualRichiesteInAttesa = ownerTabBadgeDataReady[\s\S]*?remoteOwnerUnreadRequestsCount[\s\S]*?Math\.trunc\(visualRichiesteInAttesa\)[\s\S]*?Math\.trunc\(visualClientiNonLetti\)/,
  'Every owner Requests and launcher badge must use the shared server unread authority.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const renderOwnerTabBar = React\.useCallback\([\s\S]*?<BottomTabBar[\s\S]*?\{\.\.\.props\}[\s\S]*?\/>[\s\S]*?tabBar=\{renderOwnerTabBar\}/,
  'The owner tab bar must keep a stable renderer so an iOS foreground banner survives badge refreshes for its full duration.',
);
requirePattern(
  servicesSource,
  /initialNumToRender=\{[\s\S]*?IS_ANDROID \? 1 : Math\.max\(serviceGridRows\.length, 4\)[\s\S]*?maxToRenderPerBatch=\{[\s\S]*?IS_ANDROID \? 2 : Math\.max\(serviceGridRows\.length, 4\)[\s\S]*?updateCellsBatchingPeriod=\{IS_ANDROID \? 48 : 0\}[\s\S]*?windowSize=\{[\s\S]*?IS_ANDROID \? 5 : Math\.max\(serviceGridRows\.length \+ 4, 21\)[\s\S]*?removeClippedSubviews=\{false\}/,
  'iOS service cards must stay eagerly mounted while Android builds the offscreen catalog in small native batches.',
);
forbidPattern(
  agendaSource,
  /if \(IS_WEB && item\.syntheticRequestViewedBySalon === true\) \{\s*return;\s*\}/,
  'Web Agenda day badges must remain visible after reading until the request is accepted or rejected.',
);
requirePattern(
  agendaSource,
  /pendingOnDay > 0 &&[\s\S]*?\(IS_WEB \|\|[\s\S]*?IS_IOS \|\|[\s\S]*?!isCenteredSelectedCard \|\|[\s\S]*?isPickerGlassActive\)/,
  'The selected web day must keep its pending +1 badge visible at rest.',
);
requirePattern(
  agendaSource,
  /if \(item\.stato === 'In attesa' && syncKey\)[\s\S]*?const snapshot: AgendaRequestVisualSnapshot = \{[\s\S]*?durataMinuti: item\.durataMinuti,[\s\S]*?phaseConfig: item\.phaseConfig,[\s\S]*?phaseOperatorAssignments: item\.phaseOperatorAssignments,[\s\S]*?phaseOverlapOverrides: item\.phaseOverlapOverrides,[\s\S]*?nextPendingSnapshots\.set\(syncKey, snapshot\)/,
  'A pending Agenda bridge must preserve phase timing, operator assignments, and overlap overrides.',
);
requirePattern(
  agendaSource,
  /if \(item\.stato === 'Accettata' && baseSyncKey\)[\s\S]*?const snapshot: AgendaRequestVisualSnapshot = \{[\s\S]*?durataMinuti: item\.durataMinuti,[\s\S]*?phaseConfig: item\.phaseConfig,[\s\S]*?phaseOperatorAssignments: item\.phaseOperatorAssignments,[\s\S]*?phaseOverlapOverrides: item\.phaseOverlapOverrides,[\s\S]*?nextAcceptedBaseSnapshots\.set\(baseSyncKey, snapshot\)/,
  'An accepted Agenda bridge must preserve phase timing, operator assignments, and overlap overrides.',
);
requirePattern(
  agendaSource,
  /const requestSnapshotVisual = requestSnapshot[\s\S]*?phaseOperatorAssignments:[\s\S]*?phaseOverlapOverrides: requestSnapshot\.phaseOverlapOverrides,[\s\S]*?mestiereRichiesto:/,
  'The immediate acceptance snapshot must preserve phased overlap semantics until the authoritative appointment arrives.',
);
requirePattern(
  agendaSource,
  /!isWebAppointmentLayout &&[\s\S]*?weekAppointmentBookingOriginBadgeNativeCorner[\s\S]*?weekAppointmentBookingOriginBadgeNativeCorner:\s*\{\s*top: 3,\s*left: 3,/,
  'Native appointment origin badges must remain anchored in the top-left slot corner.',
);
requirePattern(
  agendaSource,
  /const protectedInteractionContentStyle =[\s\S]*?position: 'absolute' as const,\s*top: 0,\s*left: 0,\s*right: 0,[\s\S]*?overflow: 'hidden' as const,/,
  "Appointment content on web and native must start at the card's real top while reserving the resize footer.",
);

requirePattern(
  agendaSource,
  /const resizeBottomBandHeight = IS_WEB\s*\? webResizeIndicatorHeight\s*: nativeResizeIndicatorHeight;\s*const resizeBottomBandOvershoot = IS_WEB \? 8 : 0;/,
  'Web and native must each use the exact height of their visible adaptive footer as the hit area.',
);
requirePattern(
  agendaSource,
  /const pan = Gesture\.Pan\(\)\.minDistance\(IS_WEB \? 0 : 10\)[\s\S]*?pan\.activateAfterLongPress\(160\)[\s\S]*?pan\.activeOffsetX\(\[-10, 10\]\)[\s\S]*?pan\.failOffsetY\(\[-7, 7\]\)[\s\S]*?runOnJS\(triggerAgendaDensityGrabHaptic\)[\s\S]*?nextStepIndex[\s\S]*?agendaDensityGestureStepIndex\.value = nextStepIndex[\s\S]*?runOnJS\(triggerAgendaDensityStepHaptic\)[\s\S]*?runOnJS\(commitAgendaDensityIndex\)[\s\S]*?false,[\s\S]*?<GestureDetector gesture=\{agendaDensityGesture\}>\s*<Reanimated\.View[\s\S]*?styles\.weekPlannerDensityThumb[\s\S]*?weekPlannerControlDensityLabel:\s*\{[\s\S]*?fontSize: IS_WEB \? 12 : 11\.5,[\s\S]*?weekPlannerControlDensityValue:\s*\{[\s\S]*?fontSize: IS_WEB \? 13 : 12\.5,/,
  'Agenda density must snap to marked steps with one haptic per latch, move only from its thumb, and preserve vertical scrolling.',
);
requirePattern(
  agendaSource,
  /styles\.weekPlannerControlDeck[\s\S]*?styles\.weekPlannerControlMainRow[\s\S]*?styles\.weekPlannerControlNavButton[\s\S]*?styles\.weekPlannerControlDivider[\s\S]*?styles\.weekPlannerControlDaysButton[\s\S]*?styles\.weekPlannerControlDensity[\s\S]*?weekPlannerShouldShowHorizontalCue[\s\S]*?styles\.weekPlannerControlScrollCue/,
  'Agenda navigation, visible days, density and horizontal cue must live in one coherent premium control deck.',
);
requirePattern(
  agendaSource,
  /const weekEffectiveVisibleDays = useMemo\(\s*\(\) => Math\.max\(1, Math\.min\(7, weekManualVisibleDays\)\),\s*\[weekManualVisibleDays\],\s*\)/,
  'The confirmed visible-day selection must remain authoritative on app and web while overflow uses the existing horizontal scroller.',
);
requirePattern(
  agendaSource,
  /buildAgendaWebVisibleDaysStorageKey[\s\S]*?salonpro:agenda-web-visible-days:v1:[\s\S]*?IS_WEB && webWeekVisibleDays !== null[\s\S]*?if \(IS_WEB\) \{[\s\S]*?window\.localStorage\.setItem\([\s\S]*?webWeekVisibleDaysStorageKey[\s\S]*?return;[\s\S]*?updateAvailabilitySettingsPersisted/,
  'Web visible days must persist per salon in the browser without changing the native shared preference.',
);
requirePattern(
  supabaseSource,
  /browserSupabaseAuthLock[\s\S]*?processLock\([\s\S]*?navigatorLock\([\s\S]*?lock: browserSupabaseAuthLock[\s\S]*?lockAcquireTimeout: -1[\s\S]*?__salonProSupabaseClient[\s\S]*?isBrowser[\s\S]*?browserSupabaseSingleton\.__salonProSupabaseClient \?\?=/,
  'Supabase web auth must serialize same-tab refresh work, retain the cross-tab lock and keep one browser client.',
);
requirePattern(
  agendaSource,
  /const webCanUseMeasuredCompactLayout = !!\([\s\S]*?isWebAppointmentLayout &&\s*safeWidth >= 104[\s\S]*?const useEssentialAdaptiveLayout/,
  'Web appointment density must switch from the real lane width instead of the selected day count.',
);
const webMeasuredAppointmentLayout = agendaSource.slice(
  agendaSource.indexOf('if (useWebMeasuredCompactLayout)'),
  agendaSource.indexOf('if (useEssentialAdaptiveLayout)'),
);
if (/numberOfLines=|ellipsizeMode=/.test(webMeasuredAppointmentLayout)) {
  throw new Error(
    'Measured web appointment content must never restore clipping or ellipsis constraints.',
  );
}
forbidPattern(
  sharedWebPhaseBadgeSource,
  /numberOfLines=|ellipsizeMode=/,
  'The complete numbered web phase must never be line-clamped or ellipsized.',
);
requirePattern(
  sharedWebPhaseBadgeSource,
  /whiteSpace:\s*'nowrap'[\s\S]*?\{normalizedPhaseLabel\}/,
  'The complete numbered web phase must remain on one line.',
);
requirePattern(
  clientFrontendSource,
  /frontendServicePhaseTimelineWeb[\s\S]*?numberOfLines=\{isWeb \? undefined : 1\}[\s\S]*?frontendServicePhaseTimelineValueWeb:\s*\{[\s\S]*?fontSize: 10,[\s\S]*?whiteSpace: 'nowrap',[\s\S]*?overflow: 'visible'/,
  'Web service phase labels must stay readable without ellipsis or clipping at narrow card widths.',
);
requirePattern(
  fs.readFileSync(path.join(root, 'src', 'lib', 'service-client-highlight-tone.ts'), 'utf8'),
  /resolveServiceClientHighlightTone[\s\S]*?icon: 'time'[\s\S]*?icon: 'flame'[\s\S]*?icon: 'pricetag'[\s\S]*?icon: 'thumbs-up'[\s\S]*?icon: 'sparkles'[\s\S]*?icon: 'diamond'/,
  'The shared customer service highlight resolver must preserve semantic colors and distinct icons.',
);
requirePattern(
  clientFrontendSource,
  /import \{ resolveServiceClientHighlightTone \} from '\.\.\/src\/lib\/service-client-highlight-tone'[\s\S]*?resolveServiceClientHighlightTone\(clientHighlightBadge\)[\s\S]*?name=\{clientHighlightTone\?\.icon \?\? 'ribbon'\}[\s\S]*?servicesScrollContentWeb:\s*\{[\s\S]*?paddingTop: 28,[\s\S]*?serviceClientHighlightBadgeWeb:\s*\{[\s\S]*?top: -27,/,
  'Customer-facing service badges must use semantic colors and distinct icons while staying raised above the card.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /const isResizeHandleTouch = \([\s\S]*?resolvedContentHeight \?\? cardHeight\.value[\s\S]*?localTouchY >=[\s\S]*?renderedHeight - resizeBottomBandHeight[\s\S]*?localTouchY <= renderedHeight \+ resizeTouchEdgeTolerance/,
  'Web and native must classify the lower footer from one current rendered-height contract.',
);
requirePattern(
  nativeResizePanSource,
  /Gesture\.Pan\(\)[\s\S]*?\.failOffsetX\([\s\S]*?nativeResizeScrollCancelPx[\s\S]*?\.failOffsetY\([\s\S]*?nativeResizeScrollCancelPx[\s\S]*?\.onTouchesDown\([\s\S]*?if \(isResizeHandleTouch\(touch\)\)[\s\S]*?nativeResizeTouchStartAbsoluteY\.value = touch\.absoluteY[\s\S]*?nativeResizeTouchStartLocalY\.value = Number\.isFinite\(touch\.y\)/,
  'Native resize must arm only the visible lower handle and retain the real touch-down anchor after scroll.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /renderedDurationMinutes\?: number;[\s\S]*?nativeResizeSingleRowTarget[\s\S]*?const nativeCompactDurationTarget = !!\([\s\S]*?!IS_WEB[\s\S]*?renderedDurationMinutes[\s\S]*?NATIVE_COMPACT_SHARED_TAP_MAX_MINUTES[\s\S]*?nativeResizeSharedSurfaceTarget =\s*nativeResizeSingleRowTarget \|\| nativeCompactDurationTarget[\s\S]*?nativeResizeIntentHoldMs = nativeResizeSharedSurfaceTarget[\s\S]*?\? 100[\s\S]*?: NATIVE_RESIZE_INTENT_HOLD_MS[\s\S]*?nativeResizeScrollCancelPx = nativeResizeSharedSurfaceTarget[\s\S]*?\? 10[\s\S]*?: NATIVE_RESIZE_SCROLL_CANCEL_PX[\s\S]*?nativeCardDragIntentHoldMs = nativeResizeSharedSurfaceTarget[\s\S]*?NATIVE_COMPACT_CARD_DRAG_HOLD_MS[\s\S]*?: 210/,
  'App-only cards up to 20 rendered minutes or one row must share the faster gesture surface while ordinary cards retain established resize and drag timing.',
);
requirePattern(
  agendaSource,
  /renderedDurationMinutes=\{\s*laneAppointmentVisibleDuration\s*\}[\s\S]*?renderedDurationMinutes=\{\s*appointmentVisibleDurationMinutes\s*\}/,
  'Both Agenda appointment render paths must pass their rendered segment duration to the native gesture owner.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /stageNativeResizeOverlayFromTouchAnchor[\s\S]*?measure\(appointmentViewRef\)[\s\S]*?measure\(nativeResizeOverlayRootRef\)[\s\S]*?measuredTouchY[\s\S]*?rootOriginIsStable[\s\S]*?touchStillBelongsToMeasuredHandle[\s\S]*?measuredCard\.pageY -\s*measuredOverlayRoot\.pageY[\s\S]*?nativeResizeOverlayActiveKey\.value = nativeResizeOverlayAppointmentKey/,
  'The first native resize pickup must reject stale geometry before staging the real overlay host.',
);
requirePattern(
  agendaSource,
  /weekAppointmentResizeIndicatorNative,[\s\S]*?resizeIndicatorStyle[\s\S]*?pointerEvents="none"|pointerEvents="none"[\s\S]*?weekAppointmentResizeIndicatorNative,[\s\S]*?resizeIndicatorStyle/,
  'The native resize footer must leave touch ownership to the stable card gesture.',
);
requirePattern(
  agendaSource,
  /getNativeWeekResizeIndicatorHeight[\s\S]*?safeContentHeight < 30[\s\S]*?safeContentHeight - 11[\s\S]*?nativeResizeIndicatorHeight = getNativeWeekResizeIndicatorHeight\([\s\S]*?weekAppointmentResizeIndicatorNative,[\s\S]*?height: nativeResizeIndicatorHeight/,
  'The native resize footer must shrink with low cards instead of covering their content.',
);
requirePattern(
  agendaSource,
  /interactionBottomInset = isWebAppointmentLayout[\s\S]*?\? reserveResizeFooter[\s\S]*?getWebWeekResizeIndicatorHeight\(safeHeight\) \+ 2[\s\S]*?: 0[\s\S]*?: reserveResizeFooter[\s\S]*?getNativeWeekResizeIndicatorHeight\(safeHeight\) \+ 1[\s\S]*?: 0/,
  'Web and native content must reserve the exact resize footer whenever the handle exists.',
);
requirePattern(
  agendaSource,
  /isWebAppointmentLayout &&[\s\S]*?persistedOverlapLayout[\s\S]*?renderCompactWebBookingOriginBadge\(\)[\s\S]*?clientSurnameLabel[\s\S]*?serviceLabel[\s\S]*?webMeasuredFullClientFitsOneLine[\s\S]*?\? \[clientLabel\][\s\S]*?: \[clientSurnameLabel\]/,
  'Web overlap cards must preserve provenance, while ordinary low cards keep one automatic full-name or surname line before the full service.',
);
requirePattern(
  agendaSource,
  /measureEssentialWebClientLines[\s\S]*?essentialWebAvailableWidth[\s\S]*?requiredHeight <= essentialWebLayoutHeight[\s\S]*?essentialWebSingleClientMeasure\.fits[\s\S]*?\? \[clientLabel\][\s\S]*?: \[clientSurnameLabel\][\s\S]*?essentialWebClientLongestLine/,
  'Narrow web cards must preserve one measured client line, falling back to the surname before the full service can reach the resize footer.',
);
requirePattern(
  agendaSource,
  /const useNativeMinimalInformationLayout = !!\(\s*!isWebAppointmentLayout &&\s*\(safeHeight < 230 \|\| safeWidth < 58\)\s*\);/,
  'Native compact appointments must choose their priority stack from real available space, not duration alone.',
);
forbidPattern(
  agendaSource,
  /useNativeSingleRowInformationLayout|weekAppointmentPremiumNativeMinimalSingleRow/,
  'Native appointment cards must never collapse client, phase and service into a microscopic single row.',
);
requirePattern(
  agendaSource,
  /renderNativePriorityInformationLayout[\s\S]*?priorityClientMinimumFontSize = 4[\s\S]*?fullClientFittedFontSize[\s\S]*?priorityClientLabel = fullClientFitsOneLine\s*\? clientLabel\s*:\s*clientSurnameLabel[\s\S]*?priorityPlainTimeHeight = 12[\s\S]*?showPriorityTime = remainingHeight >= 30[\s\S]*?priorityAvatarSize =[\s\S]*?Math\.min\(safeWidth - 12, remainingHeight\)[\s\S]*?renderBookingOriginBadge\(true, true\)[\s\S]*?weekAppointmentPremiumNativeAvatarTopRow[\s\S]*?renderNativeOperatorAvatar\(priorityAvatarSize\)[\s\S]*?weekAppointmentPremiumNativePlainTimeText[\s\S]*?\{showPriorityOperator \?[\s\S]*?weekAppointmentPremiumNativeOperatorPill[\s\S]*?\{showMandatoryNativePhaseRow[\s\S]*?renderMandatoryNativePhaseFallback\(\)[\s\S]*?weekAppointmentPremiumNativeMinimalClient[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{serviceLabel\}[\s\S]*?\{showPriorityRole \?/,
  'Native compact cards must stack the largest safe avatar above plain time, then render operator, centered phase, client, full service and role.',
);
requirePattern(
  agendaSource,
  /hasMandatoryNativePhaseStatus = !!\(\s*!isWebAppointmentLayout && phasePartLabel\s*\)[\s\S]*?mandatoryNativePhaseNeedsFallback[\s\S]*?showMandatoryNativePhaseRow[\s\S]*?renderMandatoryNativePhaseFallback[\s\S]*?weekAppointmentPremiumNativeMandatoryPhaseRowPill:\s*\{[\s\S]*?alignSelf:\s*'center'[\s\S]*?maxWidth:\s*'76%'/,
  'Native cards must keep real phase badges centered in the vertical body after the operator.',
);
requirePattern(
  agendaSource,
  /usesCompactCornerControlRow = isWebAppointmentLayout[\s\S]*?safeWidth < 148 \|\| safeHeight < webPremiumMinimumHeight[\s\S]*?safeHeight < 230 \|\| safeWidth < 58[\s\S]*?compactCornerControlInset = usesCompactCornerControlRow[\s\S]*?nativeAvatarOriginCollisionRisk[\s\S]*?safeHeight < 190[\s\S]*?adaptiveUsableHeight < 170[\s\S]*?safeWidth < 96[\s\S]*?Math\.max\(20, safeWidth - 48\)/,
  'Cards below the rich-layout capacity must reserve and shrink the origin/avatar treatment before rendering content.',
);
requirePattern(
  agendaSource,
  /protectedInteractionContentHeight = Math\.max\([\s\S]*?safeHeight - interactionBottomInset[\s\S]*?1,[\s\S]*?protectedInteractionContentStyle[\s\S]*?height: protectedInteractionContentHeight[\s\S]*?overflow:\s*'hidden'/,
  'Appointment content must end physically above the lower resize handle instead of relying on padding alone.',
);
requirePattern(
  agendaSource,
  /showNativeOperatorBadge[\s\S]*?adaptiveUsableHeight >= 205[\s\S]*?safeWidth >= 62/,
  'Intermediate native cards must drop only the operator badge before essential content can reach the resize handle.',
);
requirePattern(
  agendaSource,
  /styles\.weekAppointmentPremiumMobileCard,[\s\S]*?renderBookingOriginBadge\([\s\S]*?!isWebAppointmentLayout \?[\s\S]*?weekAppointmentPremiumNativeAvatarTopRow[\s\S]*?renderNativeOperatorAvatar\(nativeStackedAvatarSize\)[\s\S]*?showNativeAdaptiveTime[\s\S]*?weekAppointmentPremiumNativePlainTimeText[\s\S]*?\{showNativeOperatorBadge \?[\s\S]*?weekAppointmentPremiumNativeOperatorPill[\s\S]*?\{showMobileStatus \?[\s\S]*?weekAppointmentPremiumMobileStatusPill[\s\S]*?weekAppointmentPremiumMobileClient[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{serviceLabel\}[\s\S]*?\{showMobileRole \?/,
  'Roomier native cards must preserve the same origin, avatar, plain time, operator, phase, client, service and role order as compact cards.',
);
requirePattern(
  agendaSource,
  /fittedMobileServiceFontSize = isWebAppointmentLayout[\s\S]*?2\.6,[\s\S]*?8,[\s\S]*?: clamp\([\s\S]*?4\.8,[\s\S]*?10\.5/,
  'Native service labels must use a larger readable range without changing the narrow-web fitting range.',
);
requirePattern(
  agendaSource,
  /unconstrainedMobileAvatarSize = isWebAppointmentLayout[\s\S]*?safeWidth \* 0\.62[\s\S]*?adaptiveUsableHeight - 94[\s\S]*?72/,
  'Native operator avatars must grow to the largest size allowed by the remaining card grid.',
);
requirePattern(
  agendaSource,
  /mobileRoleFixedHeight =[\s\S]*?showMobileStatus \? 104 : 86[\s\S]*?canFitWebMobileRole[\s\S]*?baseMobileAvatarSize =[\s\S]*?canFitWebMobileRole[\s\S]*?adaptiveUsableHeight - mobileRoleFixedHeight[\s\S]*?nativeStackedAvatarSize =[\s\S]*?canFitNativeMobileRole[\s\S]*?adaptiveUsableHeight - nativeStackedAvatarSize >=[\s\S]*?mobileRoleFixedHeight[\s\S]*?showMobileRole =[\s\S]*?canFitNativeMobileRole \|\| canFitWebMobileRole/,
  'Native cards must maximize the avatar before admitting the last-priority role, while web keeps its existing reserved-role geometry.',
);
requirePattern(
  measuredWebAppointmentSource,
  /webMeasuredMandatoryHeight[\s\S]*?webMeasuredOptionalHeight[\s\S]*?webMeasuredShowsRole[\s\S]*?webMeasuredShowsOperator[\s\S]*?webMeasuredAvatarHeightBudget[\s\S]*?safeWidth \* 0\.58[\s\S]*?82/,
  'Measured web cards must allocate optional operator and role rows before growing the residual avatar.',
);
requireTokenOrder(
  measuredWebAppointmentSource,
  [
    '{webMeasuredAvatarSize > 0 ? (',
    '{webMeasuredShowsOperator ? (',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebReducedMainRow,',
  ],
  'Measured web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  essentialWebAppointmentSource,
  /essentialWebPhysicalHeight[\s\S]*?essentialWebMandatoryHeight[\s\S]*?essentialWebShowsRole[\s\S]*?essentialWebShowsOperator[\s\S]*?essentialWebAvatarHeightBudget[\s\S]*?safeWidth \* 0\.68[\s\S]*?essentialWebAvatarHeightBudget[\s\S]*?76[\s\S]*?essentialWebLayoutHeight/,
  'Essential web cards must size avatar, operator, and role from physical capacity with the safe 68%-width, 76px avatar cap.',
);
requirePattern(
  essentialWebAppointmentSource,
  /const essentialWebUsesExpandedStack = !!\([\s\S]*?essentialWebPhysicalHeight >= 120[\s\S]*?gap: clamp\([\s\S]*?essentialWebPhysicalHeight \* 0\.018,[\s\S]*?3\.5,[\s\S]*?6/,
  'Essential web cards at 120px or taller must use a moderate dynamic stack gap.',
);
forbidPattern(
  essentialWebAppointmentSource,
  /justifyContent:\s*'space-evenly'/,
  'Essential web cards must not stretch the stack with space-evenly.',
);
requireTokenOrder(
  essentialWebAppointmentSource,
  [
    '{essentialWebAvatarSize > 0 ? (',
    '{essentialWebShowsOperator ? (',
    '{renderWebNumberedPhaseBadge({',
    '{essentialWebIncludesTime ? (',
    "text={essentialWebClientLines.join(' ')}",
    '{essentialWebServicePill}',
  ],
  'Normal essential web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  essentialWebAppointmentSource,
  /const essentialWebServicePill = \([\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{essentialServiceLabel\}[\s\S]*?if \(useWebEssentialSingleRow\)[\s\S]*?weekAppointmentPremiumWebEssentialSingleRowService[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{essentialServiceLabel\}[\s\S]*?width: clamp\(safeWidth \* 0\.72, 58, 72\)/,
  'Essential cards must use a full-service marquee in normal and single-row layouts and the 72%-width normal phase badge.',
);
requirePattern(
  agendaSource,
  /weekAppointmentPremiumWebEssentialStackExpanded:\s*\{[\s\S]*?justifyContent:\s*'center'[\s\S]*?weekAppointmentPremiumWebEssentialServicePill:\s*\{[\s\S]*?minWidth:\s*0[\s\S]*?overflow:\s*'hidden'[\s\S]*?weekAppointmentPremiumWebEssentialServiceMarqueeViewport:\s*\{[\s\S]*?width:\s*'auto'[\s\S]*?minWidth:\s*0[\s\S]*?alignSelf:\s*'stretch'/,
  'Essential web stacks and service marquee viewports must stay centered and physically constrained.',
);
requirePattern(
  premiumWebAppointmentSource,
  /premiumBaseDetailRows[\s\S]*?premiumBaseDetailsHeight[\s\S]*?premiumAvatarHeightBudget = Math\.max\([\s\S]*?premiumWebAvailableContentHeight[\s\S]*?premiumBottomPadding[\s\S]*?premiumOperatorPillHeight[\s\S]*?premiumBaseDetailsHeight[\s\S]*?premiumTopPhaseHeight[\s\S]*?premiumRootGap \* \(prioritizeWebPhase \? 3 : 2\)[\s\S]*?premiumRoleReserve[\s\S]*?safeWidth \* 0\.62[\s\S]*?premiumAvatarHeightBudget[\s\S]*?124/,
  'Premium web cards must grow the avatar only from capacity left after the phase and real detail stack.',
);
requireTokenOrder(
  premiumWebAppointmentSource,
  [
    '{showPremiumWebAvatar ? (',
    'styles.weekAppointmentPremiumWebOperatorPill,',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebDetails,',
  ],
  'Premium web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  agendaSource,
  /webRoleTextColor = getWeekPlannerRoleTextColor\([\s\S]*?serviceBadgeAccent\.shadowColor[\s\S]*?webOperatorDisplayLabel =[\s\S]*?text=\{webOperatorDisplayLabel\}[\s\S]*?weekAppointmentPremiumWebAdaptiveOperatorMarqueeViewport[\s\S]*?color: webRoleTextColor[\s\S]*?text=\{`CON \$\{premiumOperatorName\.toUpperCase\(\)\}`\}/,
  'All adaptive web card tiers must preserve full operator labels and a role color derived from the active card accent.',
);
if (/requireExternalGestureToFail/.test(draggableWeekAppointmentSource)) {
  throw new Error(
    'Native Agenda resize must not depend on cross-detector gesture failure ordering.',
  );
}
if (
  (draggableWeekAppointmentSource.match(/<GestureDetector\b/g) ?? []).length !==
  1
) {
  throw new Error(
    'Native Agenda resize and full-card drag must remain in one composed GestureDetector.',
  );
}
requirePattern(
  draggableWeekAppointmentSource,
  /Gesture\.Exclusive\(nativeResizePan, pan, tap\)/,
  'Native Agenda gesture priority must stay lower handle, long-press card, then tap.',
);
requirePattern(
  agendaSource,
  /weekAppointmentResizeIndicatorWeb:\s*\{[\s\S]*?height: 27,/,
  'The visible web Agenda resize footer must remain 27px high.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /const resizeReleasePending = useSharedValue\(0\);[\s\S]*?releasedResizeTranslationY[\s\S]*?resizeReleasePending\.value = 1;[\s\S]*?keepReleasedResizeHeight[\s\S]*?if \(!keepReleasedResizeHeight\) \{\s*resizeMode\.value = 0;/,
  'Bottom-handle resize must hold the released height until the matching React geometry commit on both app and web.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /previousResizeCommitEpochRef[\s\S]*?if \(!resizeReleasePending\.value\) return;[\s\S]*?resizeMode\.value = 0;[\s\S]*?resizeTranslationY\.value = 0;[\s\S]*?resizeReleasePending\.value = 0;/,
  'Released resize height must clear only after the matching React commit epoch.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /nativeCardDragIntentHoldMs = nativeResizeSharedSurfaceTarget[\s\S]*?NATIVE_COMPACT_CARD_DRAG_HOLD_MS[\s\S]*?: 210;[\s\S]*?pan\.activateAfterLongPress\(nativeCardDragIntentHoldMs\);[\s\S]*?const nativeResizePan = Gesture\.Pan\(\)[\s\S]*?nativeResizePan\.manualActivation\(true\);[\s\S]*?nativeResizePan\.activateAfterLongPress\(nativeResizeIntentHoldMs\);/,
  'Compact native cards must reserve 350ms for tap and defer whole-card drag to 360ms while ordinary drag and resize retain their dedicated long presses.',
);
requirePattern(
  nativeResizePanSource,
  /nativeResizeTouchStartAbsoluteY\.value = touch\.absoluteY;[\s\S]*?nativeResizeTouchStartAgendaScrollY\.value =\s*nativeAgendaVerticalScrollOffsetY\?\.value \?\? 0;/,
  'Native resize must capture both the absolute finger anchor and the Agenda scroll offset at touch-down.',
);
requirePattern(
  nativeResizeUpdateSource,
  /const startAbsoluteY = nativeResizeTouchStartAbsoluteY\.value;[\s\S]*?const currentAgendaScrollY =\s*nativeAgendaVerticalScrollOffsetY\?\.value \?\?\s*nativeResizeTouchStartAgendaScrollY\.value;[\s\S]*?const physicalResizeTranslationY = event\.absoluteY - startAbsoluteY;[\s\S]*?const rawResizeTranslationY =\s*physicalResizeTranslationY \+\s*\(currentAgendaScrollY -\s*nativeResizeTouchStartAgendaScrollY\.value\);[\s\S]*?const boundedResizeTranslationY = resizeShrinkOnly[\s\S]*?: rawResizeTranslationY;[\s\S]*?const boundedPhysicalResizeTranslationY = resizeShrinkOnly[\s\S]*?: physicalResizeTranslationY;[\s\S]*?resizeTranslationY\.value = boundedResizeTranslationY;/,
  'Native resize must combine the live absolute finger delta with scroll movement since touch-down on the UI thread.',
);
const nativeResizeMoveThrottleMatch = agendaSource.match(
  /const NATIVE_RESIZE_MOVE_JS_THROTTLE_MS\s*=\s*(\d+);/,
);
const nativeResizeMoveThrottleMs = Number(
  nativeResizeMoveThrottleMatch?.[1] ?? Number.NaN,
);
if (
  !Number.isFinite(nativeResizeMoveThrottleMs) ||
  nativeResizeMoveThrottleMs < 40 ||
  nativeResizeMoveThrottleMs > 64
) {
  throw new Error(
    'Native lower-handle pointer dispatch must stay throttled to approximately 48ms.',
  );
}
requirePattern(
  nativeResizePanSource,
  /\.onStart\([\s\S]*?lastNativeResizeMoveDispatchAt\.value = 0;[\s\S]*?\.onUpdate/,
  'Every native resize must reset its throttled JS pointer clock at gesture start.',
);
requirePattern(
  nativeResizeUpdateSource,
  /const dispatchAt = Date\.now\(\);[\s\S]*?dispatchAt - lastNativeResizeMoveDispatchAt\.value >=\s*NATIVE_RESIZE_MOVE_JS_THROTTLE_MS[\s\S]*?lastNativeResizeMoveDispatchAt\.value = dispatchAt;[\s\S]*?runOnJS\(dispatchResizeMove\)\(\s*physicalResizeTranslationY,\s*event\.absoluteY,\s*\);/,
  'Native resize may bridge only a throttled physical finger delta and pointer Y to the auto-scroll driver.',
);
if (
  (nativeResizeUpdateSource.match(/runOnJS\(/g) ?? []).length !== 1 ||
  /\bset[A-Z][A-Za-z0-9_]*\s*\(/.test(nativeResizeUpdateSource)
) {
  throw new Error(
    'Native resize onUpdate must stay render-free and expose only its single throttled pointer dispatch to JS.',
  );
}
requirePattern(
  nativeResizeEndSource,
  /const startAbsoluteY = nativeResizeTouchStartAbsoluteY\.value;[\s\S]*?const currentAgendaScrollY =\s*nativeAgendaVerticalScrollOffsetY\?\.value \?\?\s*nativeResizeTouchStartAgendaScrollY\.value;[\s\S]*?const hasTerminalAbsoluteY =\s*startAbsoluteY > 0 && Number\.isFinite\(event\.absoluteY\);[\s\S]*?const terminalRawResizeTranslationY = hasTerminalAbsoluteY\s*\? event\.absoluteY -\s*startAbsoluteY \+\s*\(currentAgendaScrollY -\s*nativeResizeTouchStartAgendaScrollY\.value\)\s*: resizeTranslationY\.value;[\s\S]*?const terminalResizeTranslationY =\s*Math\.abs\(terminalRawResizeTranslationY\) <=\s*nativeResizeReturnHomeDeadband\s*\? 0\s*: terminalRawResizeTranslationY;/,
  'Native resize release must recompute the terminal content-space delta from event.absoluteY and collapse return-home jitter through the deadband.',
);
requirePattern(
  nativeResizeEndSource,
  /const releasedFingerTranslationY = resizeShrinkOnly[\s\S]*?: terminalResizeTranslationY;[\s\S]*?const releasedResizeTranslationY =\s*Math\.round\(releasedFingerTranslationY \/ nativeResizeSnapStep\) \*\s*nativeResizeSnapStep;[\s\S]*?resizeTranslationY\.value = releasedResizeTranslationY;[\s\S]*?const keepReleasedResizeHeight =\s*Math\.abs\(releasedResizeTranslationY\) > 0\.01;[\s\S]*?resizeReleasePending\.value = keepReleasedResizeHeight \? 1 : 0;[\s\S]*?if \(\s*!keepReleasedResizeHeight &&[\s\S]*?nativeResizeOverlayActiveKey\.value = '';[\s\S]*?runOnJS\(dispatchResizeEnd\)\(releasedResizeTranslationY\)/,
  'Native resize must keep only a non-zero snapped height pending and clear the protected overlay immediately for a zero snap.',
);
if (
  (nativeResizeEndSource.match(/resizeReleasePending\.value\s*=/g) ?? [])
    .length !== 1
) {
  throw new Error(
    'Native resize release must have exactly one pending-state assignment, guarded by the non-zero snapped delta.',
  );
}
requirePattern(
  nativeResizeFinalizeSource,
  /const keepReleasedResizeHeight = resizeReleasePending\.value === 1;[\s\S]*?if \(!keepReleasedResizeHeight\) \{[\s\S]*?resizeMode\.value = 0;[\s\S]*?resizeTranslationY\.value = 0;[\s\S]*?resizeReleasePending\.value = 0;[\s\S]*?nativeResizeOverlayActiveKey\.value = '';/,
  'A zero native resize snap must restore the source and clear any remaining overlay during finalize instead of waiting for a React commit.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /pan\.activateAfterLongPress\(nativeCardDragIntentHoldMs\);[\s\S]*?pan\.onTouchesDown\([\s\S]*?mainPanTouchStartedOnResizeHandle\.value = 0;[\s\S]*?if \(isResizeHandleTouch\(touch\)\) \{[\s\S]*?mainPanTouchStartedOnResizeHandle\.value = 1;[\s\S]*?stateManager\.fail\(\);/,
  'The 360ms compact or 210ms ordinary whole-card Pan must still fail immediately when touch starts on the native resize handle.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /const tap = Gesture\.Tap\(\);[\s\S]*?if \(resizeEnabled && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?tap\.hitSlop\(\{ bottom: -resizeBottomBandHeight \}\);[\s\S]*?\.maxDuration\(nativeResizeSharedSurfaceTarget \? 350 : 220\)[\s\S]*?if \(isResizeHandleTouch\(touch\) && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?stateManager\.fail\(\);[\s\S]*?\.onEnd\([\s\S]*?dispatchPress/,
  'Compact native appointments must share their full surface for a 350ms popup tap, while ordinary cards and web keep their exclusive footer.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /\.onTouchesMove\(\(event, stateManager\) => \{[\s\S]*?!nativeResizeSharedSurfaceTarget[\s\S]*?const signedVerticalTravel =\s*touch\.absoluteY - nativeResizeTouchStartAbsoluteY\.value;[\s\S]*?const verticalTravel = Math\.abs\(signedVerticalTravel\);[\s\S]*?heldForMs < nativeResizeIntentHoldMs[\s\S]*?horizontalTravel > nativeResizeScrollCancelPx \|\|[\s\S]*?verticalTravel > nativeResizeScrollCancelPx[\s\S]*?stateManager\.fail\(\);[\s\S]*?const hasIntentionalResizeTravel = nativeResizeSingleRowTarget[\s\S]*?\? signedVerticalTravel >= NATIVE_SINGLE_ROW_RESIZE_ACTIVATION_PX[\s\S]*?: verticalTravel >= NATIVE_SINGLE_ROW_RESIZE_ACTIVATION_PX[\s\S]*?stateManager\.activate\(\);[\s\S]*?if \(nativeResizeSharedSurfaceTarget\) \{[\s\S]*?nativeResizePan\.manualActivation\(true\);[\s\S]*?\} else \{[\s\S]*?nativeResizePan\.activateAfterLongPress\(nativeResizeIntentHoldMs\);/,
  'Shared compact resize must be manual: one-row cards only grow downward, compact two-row cards resize in either direction, and ordinary cards preserve automatic long-press activation.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /if \(IS_WEB\) \{\s*pan\.minDistance\(3\);\s*\} else if \(resizeEnabled\) \{[\s\S]*?pan\.hitSlop\(\{ bottom: -resizeBottomBandHeight \}\);[\s\S]*?nativeResizePan = Gesture\.Pan\(\)[\s\S]*?\.hitSlop\(\{ height: resizeBottomBandHeight, bottom: 0 \}\)/,
  'Native body drag and resize footer must have disjoint physical hit regions, while web keeps its three-pixel drag threshold.',
);
requirePattern(
  agendaSource,
  /const shouldCommitNativeCancelledDrag =\s*!IS_WEB && !resizeMode\.value;\s*if \(success \|\| shouldCommitNativeCancelledDrag\)/,
  'A cancelled native resize must never be committed as a finger release, while native full-card drag keeps its existing recovery path.',
);
const beginWeekAppointmentResizeSource = agendaSource.slice(
  agendaSource.indexOf('const beginWeekAppointmentResize'),
  agendaSource.indexOf('const moveWeekAppointmentResize'),
);
requirePattern(
  beginWeekAppointmentResizeSource,
  /if \(IS_WEB\) \{[\s\S]*?setWeekAppointmentResizeActiveKey\([\s\S]*?setWeekAppointmentDragActive\(true\);[\s\S]*?\} else \{[\s\S]*?hideNativeWeekDropPreview\(\);[\s\S]*?startNativeWeekAutoScrollRef\.current\(\);\s*\}/,
  'Native lower-handle resize must start its imperative auto-scroll timer without scheduling a planner render.',
);
const nativeBeginWeekAppointmentResizeSource =
  beginWeekAppointmentResizeSource.slice(
    beginWeekAppointmentResizeSource.indexOf('} else {'),
  );
for (const forbiddenNativeResizeBeginUpdate of [
  'setWeekAppointmentResizeActiveKey(',
  'setWeekAppointmentDragActive(',
  'setWeekSwapPreview(',
  'setWebWeekDragConfirmation(',
  'setWeekAppointmentDetails(',
  'setDisableParentSwipe(',
]) {
  if (
    nativeBeginWeekAppointmentResizeSource.includes(
      forbiddenNativeResizeBeginUpdate,
    )
  ) {
    throw new Error(
      `Native lower-handle resize must stay render-free while the finger is down: ${forbiddenNativeResizeBeginUpdate}`,
    );
  }
}
requirePattern(
  nativeBeginWeekAppointmentResizeSource,
  /startNativeWeekAutoScrollRef\.current\(\)/,
  'Native lower-handle resize must arm the shared imperative auto-scroll loop on begin.',
);
requirePattern(
  agendaSource.slice(
    agendaSource.indexOf('const beginWeekAppointmentDrag'),
    agendaSource.indexOf('const moveWeekAppointmentDrag'),
  ),
  /startNativeWeekAutoScrollRef\.current\(\)/,
  'Native full-card drag must retain its existing auto-scroll.',
);
const resizeAutoScrollStart = agendaSource.indexOf(
  'const resizeSource = weekResizeSourceRef.current;',
);
const resizeAutoScrollEnd = agendaSource.indexOf(
  'const sourceAppointment = weekDragSourceRef.current;',
  resizeAutoScrollStart,
);
if (resizeAutoScrollStart < 0 || resizeAutoScrollEnd < 0) {
  throw new Error('The dedicated resize auto-scroll tick must remain present.');
}
const resizeAutoScrollSource = agendaSource.slice(
  resizeAutoScrollStart,
  resizeAutoScrollEnd,
);
requirePattern(
  resizeAutoScrollSource,
  /if \(resizeSource && resizePointerY !== null\)[\s\S]*?if \(\s*!IS_WEB &&\s*nativeWeekResizeOverlayInteractionActive\.value <= 0\s*\) \{\s*return;\s*\}[\s\S]*?const resizeSourceIsOngoing =\s*IS_WEB &&[\s\S]*?const nativePhysicalResizeDelta = IS_WEB[\s\S]*?: weekResizeTranslationYRef\.current;[\s\S]*?resizePointerY >= visibleBottom - bottomEdgeThreshold[\s\S]*?\(IS_WEB \|\| nativePhysicalResizeDelta > 2\)[\s\S]*?const resizeScrollStep = IS_WEB\s*\? 12 \+ proximity \* 20\s*:\s*2 \+ proximity \* 5;[\s\S]*?previousY \+ resizeScrollStep[\s\S]*?scrollAgendaNativelyDuringResize\(nextY\);/,
  'Web and native resize must share the lower-edge auto-scroll tick, while native release blocks any already-queued final tick.',
);
if (
  /visibleTop|resizePointerY\s*<=|previousY\s*-\s*resizeScrollStep|nextY\s*=\s*Math\.max/.test(
    resizeAutoScrollSource,
  )
) {
  throw new Error(
    'Lower-handle resize auto-scroll must never grow an appointment by scrolling upward.',
  );
}
const resizeVisibleBoundsSource = agendaSource.slice(
  agendaSource.indexOf('const getWeekResizeVisibleVerticalBounds'),
  agendaSource.indexOf('const scrollAgendaNativelyDuringResize'),
);
requirePattern(
  resizeVisibleBoundsSource,
  /if \(IS_WEB\) \{[\s\S]*?bottomEdgeThreshold: 54[\s\S]*?const customBarTop = agendaViewportHeight - customBarBottomOffset - 64;[\s\S]*?bottom: Math\.min\(bounds\.bottom, customBarTop - 12\),[\s\S]*?bottomEdgeThreshold: 36/,
  'Web must keep its resize edge while native resize activates only above the Custom Bar.',
);
requirePattern(
  agendaSource,
  /if \(IS_WEB\) \{\s*startTimer\(\);\s*\} else \{[\s\S]*?startNativeWeekAutoScrollRef\.current = startTimer;[\s\S]*?stopNativeWeekAutoScrollRef\.current = stopTimer;[\s\S]*?weekDragSourceRef\.current \|\|\s*weekResizeSourceRef\.current[\s\S]*?startTimer\(\);/,
  'A native auto-scroll effect restart must resume either an active card drag or an active lower-handle resize.',
);
const cancelWeekAppointmentResizeSource = agendaSource.slice(
  agendaSource.indexOf('const cancelWeekAppointmentResize'),
  agendaSource.indexOf('const stageWeekReorganizationResize'),
);
const endWeekAppointmentResizeStart = agendaSource.indexOf(
  'const endWeekAppointmentResize',
);
const endWeekAppointmentResizeSource = agendaSource.slice(
  endWeekAppointmentResizeStart,
  agendaSource.indexOf(
    '\n\n  useEffect(() => {',
    endWeekAppointmentResizeStart,
  ),
);
requirePattern(
  cancelWeekAppointmentResizeSource,
  /if \(!IS_WEB\) \{\s*stopNativeWeekAutoScrollRef\.current\(\);\s*\}/,
  'Cancelling a native lower-handle resize must stop its imperative auto-scroll timer.',
);
requirePattern(
  endWeekAppointmentResizeSource,
  /if \(!IS_WEB\) \{\s*stopNativeWeekAutoScrollRef\.current\(\);\s*\}/,
  'Ending a native lower-handle resize must stop its imperative auto-scroll timer.',
);
requirePattern(
  nativeResizeFinalizeSource,
  /if \(active\.value && !ended\.value\) \{\s*runOnJS\(dispatchResizeCancel\)\(\);\s*\}/,
  'A native resize finalized without onEnd must dispatch cancellation, whose cleanup stops auto-scroll.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /nativeResizeOverlayHeight\.value = resolvedMeasuredHeight;[\s\S]*?nativeResizeOverlayStartAgendaScrollY\.value =\s*nativeResizeTouchStartAgendaScrollY\.value;[\s\S]*?const boundedPhysicalResizeTranslationY = resizeShrinkOnly[\s\S]*?: physicalResizeTranslationY;[\s\S]*?nativeResizeOverlayHeight\.value = Math\.max\([\s\S]*?cardHeight\.value \+ boundedPhysicalResizeTranslationY/,
  'Native resize must store a fixed scroll baseline and keep its overlay base height derived only from physical finger movement.',
);
requirePattern(
  agendaSource,
  /const nativeWeekResizeOverlayStartAgendaScrollY = useSharedValue\(0\);/,
  'Native resize must own an immutable Agenda scroll baseline for the active pickup.',
);
requirePattern(
  agendaSource,
  /function NativeWeekDragOverlay\([\s\S]*?const isActivelyResized =\s*isResized && resizeInteractionActive\.value > 0;[\s\S]*?const activeResizeScrollDelta = isActivelyResized\s*\? Math\.max\(\s*0,\s*agendaVerticalScrollOffsetY\.value - resizeStartAgendaScrollY\.value,\s*\)\s*: 0;[\s\S]*?resizeHeight\.value \+ activeResizeScrollDelta/,
  'Native resize overlay height must deterministically add the live-minus-start scroll delta exactly once while interaction is active.',
);
if (/nativeWeekResizeOverlayHeight\.value\s*\+=/.test(agendaSource)) {
  throw new Error(
    'Native resize overlay compensation must never increment shared height state cumulatively.',
  );
}
requirePattern(
  agendaSource,
  /else if \(weekResizeSourceRef\.current\) \{[\s\S]*?if \(IS_WEB && Math\.abs\(actualScrollDelta\) > 0\.01\)/,
  'Web resize must retain JS scroll compensation while native compensation comes only from the real UI-thread offset.',
);
requirePattern(
  agendaSource,
  /const rowDelta = Math\.round\(translationY \/ rowStep\);/,
  'The resize commit must decode the already-frozen native grid row without applying a second snap.',
);
requirePattern(
  agendaSource,
  /weekAppointmentDragActive \|\|\s*!!weekAppointmentResizeActiveKey \|\|\s*!!weekResizeSourceRef\.current/,
  'Native resize must also block density-settle scrolling without React active-key state.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /const resolvedResizeMinimumHeight = IS_WEB\s*\? resizeShrinkOnly[\s\S]*?: 42\s*: Math\.max\(\s*1,[\s\S]*?resizeMinimumHeight[\s\S]*?nativeResizeSnapStep/,
  'Native resize preview must use the real one-row minimum while web keeps 42px.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /const resizeContainerStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*?Math\.max\(\s*resolvedResizeMinimumHeight,[\s\S]*?cardHeight\.value[\s\S]*?resizeTranslationY\.value/,
  'Resize preview must enforce the resolved platform minimum while following the live finger delta.',
);
if (
  (
    agendaSource.match(
      /resizeSnapStep=\{\s*weekPlannerTimeAxisMetrics\.rowStep\s*\}/g,
    ) ?? []
  ).length !== 2 ||
  (
    agendaSource.match(
      /resizeMinimumHeight=\{\s*IS_WEB &&[\s\S]*?\? getWeekOngoingResizeMinimumHeight\([\s\S]*?\)\s*: agendaDensityRowHeight\s*\}/g,
    ) ?? []
  ).length !== 2
) {
  throw new Error(
    'Both appointment render paths must pass the measured native row step and one-row height.',
  );
}
for (const requiredPlannerResizeDependency of [
  'isActiveWeekAppointmentInteractionSource',
  'beginWeekAppointmentResize',
  'moveWeekAppointmentResize',
  'endWeekAppointmentResize',
  'cancelWeekAppointmentResize',
  'weekPlannerTimeAxisMetrics.rowStep',
  'weekAppointmentResizeCommitEpoch',
]) {
  if (!weekPlannerPanelSource.includes(requiredPlannerResizeDependency)) {
    throw new Error(
      `Week planner must refresh native resize authority for ${requiredPlannerResizeDependency}.`,
    );
  }
}
requirePattern(
  draggableWeekAppointmentSource,
  /onLayout=\{\(event\) => \{[\s\S]*?if \(\s*!active\.value &&\s*\(IS_WEB \|\|\s*\(resizeMode\.value === 0 && resizeReleasePending\.value === 0\)\)\s*\) \{\s*cardWidth\.value = event\.nativeEvent\.layout\.width;\s*cardHeight\.value = event\.nativeEvent\.layout\.height;/,
  'Intermediate resize layouts must never replace the original card-height baseline.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /if \(!mainPanStarted\.value\) return;[\s\S]*?if \(!nativeResizePanStarted\.value\) \{[\s\S]{0,420}?return;[\s\S]{0,40}\}/,
  'Losing gestures in the native Exclusive composition must not clean up the active owner.',
);
requirePattern(
  nativeResizePanSource,
  /if \(!keepReleasedResizeHeight\) \{\s*resizeMode\.value = 0;\s*resizeTranslationY\.value = 0;\s*resizeReleasePending\.value = 0;/,
  'Cancelled native resize must reset directly without an elastic animation.',
);
requirePattern(
  nativeGestureScrollViewSource,
  /scrollViewOffset\?: SharedValue<number>;[\s\S]*?const animatedScrollViewRef = useAnimatedRef<ScrollView>\(\);[\s\S]*?React\.useImperativeHandle\(\s*ref,\s*\(\) => animatedScrollViewRef\.current as ScrollView,\s*\[animatedScrollViewRef\],?\s*\);[\s\S]*?<Reanimated\.ScrollView\s*ref=\{animatedScrollViewRef as any\}[\s\S]*?scrollViewOffset=\{scrollViewOffset\}/,
  'The native Agenda scroll host must use an observable AnimatedRef for Reanimated while exposing the ScrollView instance to FlatList.',
);
if (
  /<Reanimated\.ScrollView\s*ref=\{ref as any\}/.test(
    nativeGestureScrollViewSource,
  )
) {
  throw new Error(
    'The plain ref forwarded by FlatList must never be passed to Reanimated.ScrollView when scrollViewOffset is enabled.',
  );
}
requirePattern(
  agendaSource,
  /const nativeAgendaVerticalScrollOffsetY = useSharedValue\(0\);[\s\S]*?const renderAgendaNativeScrollComponent = useCallback\([\s\S]*?scrollViewOffset=\{nativeAgendaVerticalScrollOffsetY\}[\s\S]*?<FlatList[\s\S]*?ref=\{assignAgendaListRef\}[\s\S]*?renderScrollComponent=\{\s*IS_WEB \? undefined : renderAgendaNativeScrollComponent\s*\}/,
  'The native Agenda FlatList must route its shared offset through the real Reanimated ScrollView while preserving its imperative ref.',
);
requirePattern(
  agendaSource,
  /nativeResizeOverlayY\.value =\s*measuredCard\.pageY -\s*measuredOverlayRoot\.pageY \+\s*nativeResizeTouchStartAgendaScrollY\.value;/,
  'Native resize pickup must store the measured card Y in Agenda content coordinates using the touch-down scroll offset.',
);
requirePattern(
  agendaSource,
  /top: isDragged[\s\S]*?\? dragY\.value[\s\S]*?: isResized[\s\S]*?\? resizeY\.value - agendaVerticalScrollOffsetY\.value/,
  'A released native resize overlay must follow Agenda momentum while whole-card drag keeps its existing viewport coordinates.',
);
requirePattern(
  agendaSource,
  /const durationStep = IS_WEB\s*\?[\s\S]*?getSlotIntervalForDate\([\s\S]*?: Math\.max\(5, weekBaseSlotInterval\)/,
  'Native resize duration steps must follow the visible weekly grid while web keeps its per-day behavior.',
);
requirePattern(
  agendaSource,
  /scale\.value = IS_WEB\s*\? 1\s*:\s*withTiming\(1,/,
  'Web and native resize must not scale the card away from the grabbed pointer.',
);
requirePattern(
  agendaSource,
  /appointmentsWithResizeVisualPreview[\s\S]*?durataMinuti: preview\.durationMinutes,[\s\S]*?phaseConfig: preview\.phaseConfig \?\? item\.phaseConfig[\s\S]*?appointments: appointmentsWithResizeVisualPreview/,
  'Agenda resize must merge a timing-only visual preview without changing date, time, operator, or appointment identity.',
);
requirePattern(
  agendaSource,
  /weekAppointmentResizeVisualPreviewRef = useRef<[\s\S]*?Record<string, WeekAppointmentResizeVisualPreview>[\s\S]*?\[appointment\.id\]: nextPreview[\s\S]*?delete nextPreviews\[appointmentId\]/,
  'Concurrent bottom-handle saves must retain a separate visual preview per appointment.',
);
requirePattern(
  agendaSource,
  /stageWeekAppointmentResizeVisualPreview\([\s\S]*?setWeekAppointmentResizeCommitEpoch[\s\S]*?stageWeekReorganizationResize[\s\S]*?saveWeekAppointmentResizeDuration/,
  'The lower resize handle must publish its visual duration before draft staging or server persistence begins.',
);
requirePattern(
  agendaSource,
  /Sovrapposizione rilevata[\s\S]*?text: 'Annulla'[\s\S]*?clearWeekAppointmentResizeVisualPreview\(appointment\.id\)[\s\S]*?clearWeekAppointmentResizeVisualPreview\(appointment\.id\);\s*Alert\.alert\([\s\S]*?'Durata non salvata'/,
  'A rejected or cancelled resize must remove the visual preview and restore the authoritative geometry.',
);
requirePattern(
  agendaSource,
  /name="hand-left"[\s\S]{0,120}?size=\{\(resolvedContentWidth \?\? 54\) < 54 \? 10 : 15\}/,
  'Movable web Agenda cards must keep their visible drag-hand affordance.',
);
requirePattern(
  agendaSource,
  /const quickBookingSubmitReady = quickBookingPackageMode\s*\? quickBookingPackageCanSubmit\s*:\s*quickBookingCanConfirm \|\| quickBookingCanForceConfirm;/,
  'Prenota Slot must keep Create disabled until the single or composition draft is complete.',
);
requirePattern(
  agendaSource,
  /\{quickBookingPackageServiceIds\.length > 0 \? \([\s\S]*?onPress=\{resetQuickBookingPackage\}[\s\S]*?accessibilityLabel="Reset composizione"/,
  'Prenota Slot must expose the same composition reset action on native and web whenever services are selected.',
);
if (
  (agendaSource.match(/accessibilityLabel="Reset composizione"/g) ?? [])
    .length < 2
) {
  throw new Error(
    'Prenota Slot must expose composition reset both above the service cards and in the composition summary.',
  );
}
requirePattern(
  agendaSource,
  /disabled=\{\s*!quickBookingSubmitReady \|\| quickBookingSubmitBusy\s*\}/,
  'Prenota Slot must reject duplicate or incomplete submissions at the primary button.',
);
requirePattern(
  agendaSource,
  /setQuickBookingSubmitState\('sent'\);[\s\S]*?closeQuickSlotModal\(\{ force: true \}\);/,
  'Prenota Slot must show the sent state and close after a confirmed save.',
);
requirePattern(
  agendaSource,
  /visible=\{[\s\S]*?!!webWeekDragConfirmation &&[\s\S]*?!quickSlotModalShellDraft &&[\s\S]*?!weekAppointmentDetails[\s\S]*?\}/,
  'Standalone conflict confirmations must stay visible above Agenda outside Prenota Slot and appointment details.',
);
requirePattern(
  agendaSource,
  /quickSlotModalShellDraft[\s\S]*?webWeekDragConfirmation \? \([\s\S]*?quickBookingConfirmationOverlay[\s\S]*?closeWebWeekDragConfirmation\(\s*button\s*(?:,\s*index\s*)?,?\s*\)/,
  'Prenota Slot conflict confirmations must render inside the active modal so native can force and resume the save.',
);
requirePattern(
  agendaSource,
  /weekInteractionConfirmationMaxHeight[\s\S]*?agendaViewportHeight -[\s\S]*?weekInteractionConfirmationTopInset -[\s\S]*?weekInteractionConfirmationBottomInset/,
  'Native Agenda confirmations must fit between the real top and bottom safe areas.',
);
requirePattern(
  agendaSource,
  /webWeekDragConfirmationCardNative:\s*\{[\s\S]*?maxHeight: '100%'[\s\S]*?overflow: 'hidden'[\s\S]*?webWeekDragConfirmationMessageScrollNative:\s*\{[\s\S]*?minHeight: 0,[\s\S]*?flexShrink: 1/,
  'Native Agenda confirmation copy must shrink and scroll instead of pushing actions outside the card.',
);
requirePattern(
  agendaSource,
  /webWeekDragConfirmationActionsNative:\s*\{[\s\S]*?flexDirection: 'column'[\s\S]*?webWeekDragConfirmationButtonNative:\s*\{[\s\S]*?width: '100%'/,
  'Native Agenda confirmation actions must remain fully contained in one stable vertical stack.',
);
requirePattern(
  agendaSource,
  /quickBookingComposerFeedback\?\.tone === 'error'[\s\S]*?quickBookingSubmitFeedbackError[\s\S]*?modalActionsRow/,
  'Prenota Slot save failures must remain visible directly above the primary actions.',
);
requirePattern(
  agendaSource,
  /releaseQuickSlotInteractionLocks\(true\);[\s\S]*?setQuickSlotModalShellDraft\(null\);/,
  'Closing Prenota Slot must force-release stale Agenda drag and scroll locks.',
);
requirePattern(
  agendaSource,
  /setQuickSlotModalShellDraft\(null\);[\s\S]*?quickSlotCloseCleanupFrameRef\.current = requestAnimationFrame\(\(\) => \{[\s\S]*?resetQuickSlotModalDraftState\(\);/,
  'Prenota Slot must remove the touch-blocking modal shell before its heavy form cleanup.',
);
requirePattern(
  agendaSource,
  /const closeQuickSlotModal = useCallback\([\s\S]*?if \(!IS_WEB\) \{[\s\S]*?quickSlotModalVisibleRef\.current = false;[\s\S]*?listRef\.current\?\.setNativeProps\?\.\(\{ scrollEnabled: true \}\);[\s\S]*?releaseAgendaParentSwipe\(\);[\s\S]*?setQuickSlotModalShellDraft\(null\);[\s\S]*?quickSlotCloseCleanupFrameRef\.current = requestAnimationFrame\(\(\) => \{[\s\S]*?scheduleQuickSlotInteractionRelease\(true\);[\s\S]*?quickSlotCloseCleanupFrameRef\.current = requestAnimationFrame\(\(\) => \{[\s\S]*?resetQuickSlotModalDraftState\(\);/,
  'Native Prenota Slot must unlock scrolling before unmounting, while deferring heavy form cleanup.',
);
requirePattern(
  agendaSource,
  /onDismiss=\{\(\) => \{[\s\S]*?if \(!IS_WEB && quickSlotModalVisibleRef\.current\) \{\s*return;\s*\}[\s\S]*?releaseAgendaParentSwipe\(\);[\s\S]*?recoverAgendaScrollAfterContextGesture\(\);/,
  'A normal native Modal dismiss must reinforce scroll release instead of skipping it.',
);
requirePattern(
  agendaSource,
  /const recoverAgendaScrollAfterContextGesture = useCallback\(\(\) => \{[\s\S]*?const restoreScroll = \(\) => \{\s*if \(quickSlotModalVisibleRef\.current\) return;[\s\S]*?setDisableParentSwipe\(false\);/,
  'Deferred Agenda scroll recovery must not unlock a newly reopened Prenota Slot popup.',
);
requirePattern(
  ownerTabsLayoutSource,
  /function BottomTabBar\(\{[\s\S]*?jumpTo,[\s\S]*?if \(!IS_WEB && index !== activeVisibleIndex\) \{[\s\S]*?immediateIndicatorTargetIndexRef\.current = index;[\s\S]*?primeTabSelection\(index\);[\s\S]*?if \(IS_WEB\) \{[\s\S]*?navigation\.dispatch\(TabActions\.jumpTo\(visibleRoutes\[index\]\.name\)\);[\s\S]*?\} else \{[\s\S]*?jumpTo\(visibleRoutes\[index\]\.key\);/,
  'Native custom-bar taps must prime the selection and jump the native pager immediately while web keeps its navigation dispatch.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const useNativePagerHighlight = true;[\s\S]*?instantSelectionActiveSV=\{instantSelectionActiveSV\}/,
  'Native custom-bar swipes must keep the pager-driven visual path while taps use the isolated instant-selection overlay.',
);
requirePattern(
  ownerTabsLayoutSource,
  /const pagerSettledOnVisibleIndex =[\s\S]*?Math\.abs\(value - nativeRouteIndex\) < 0\.01;[\s\S]*?pagerSettledOnVisibleIndex &&[\s\S]*?visibleIndex !== immediateTargetIndex[\s\S]*?immediateIndicatorTargetIndexRef\.current = null;[\s\S]*?instantSelectionActiveSV\.value = 0;[\s\S]*?pagerPositionSV\.value = continuousVisiblePosition/,
  'A fast reverse swipe must discard a stale instant target and realign the CustomBar to the page actually settled by the native pager.',
);
forbidPattern(
  ownerTabsLayoutSource,
  /if \(pressInNavigatedIndexRef\.current === index\) \{[\s\S]{0,900}?if \(!IS_WEB\) \{[\s\S]{0,500}?instantSelectionActiveSV\.value = 0;/,
  'The native press release must not use the former cross-platform early-clear path.',
);
requirePattern(
  ownerTabsLayoutSource,
  /if \(pressInNavigatedIndexRef\.current === index\) \{[\s\S]{0,900}?if \(IS_ANDROID\) \{[\s\S]{0,500}?requestAnimationFrame\([\s\S]{0,500}?instantSelectionActiveSV\.value = 0;[\s\S]{0,500}?Su iOS non spegnere qui il feedback immediato/,
  'Only Android may keep its established early-clear path; iOS must wait for the pager latch.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageAutoFitOperators,[\s\S]*?setQuickBookingPackageAutoFitOperators,[\s\S]*?useState\(true\);/,
  'Salon compositions must enable automatic operator fitting by default.',
);
requirePattern(
  agendaSource,
  /const commonExactOperators =[\s\S]*?draftsWithRealOperators\.every\([\s\S]*?isExactOperatorForDraft[\s\S]*?assignedRealOperatorIds\.size > 1[\s\S]*?'split'/,
  'Automatic composition fitting must prefer one exact operator before splitting cleanly across operators.',
);
requirePattern(
  agendaSource,
  /const canAttemptDraftWithOperator =[\s\S]*?canAttemptServiceAtSlot\([\s\S]*?const canOfferOverlapForDraft =[\s\S]*?canAttemptDraftWithOperator\(draft, operator\)[\s\S]*?overlapCandidates[\s\S]*?entry\.overlapMinutes > 0[\s\S]*?first\.overlapMinutes - second\.overlapMinutes/,
  'Overlap alternatives must preserve structural schedules and choose the smallest overlap only after exact fitting fails.',
);
requirePattern(
  agendaSource,
  /const readNativeOperatorPlanCache = <T,>[\s\S]*?if \(IS_WEB\) return resolveValue\(\);[\s\S]*?cachedByOperator\?\.has\(cacheKey\)[\s\S]*?canScheduleDraftWithOperator[\s\S]*?canAttemptDraftWithOperator[\s\S]*?getDraftOperatorOverlapMinutes[\s\S]*?getDraftStructuralAvailability/,
  'Native composition planning must reuse identical per-render operator checks while leaving the web path unchanged.',
);
requirePattern(
  agendaSource,
  /setQuickBookingPendingServices\(\(current\) => \{\s*const filtered = current\.filter\([\s\S]*?return filtered\.length === current\.length \? current : filtered;\s*\}\);/,
  'Pending private services must not trigger a no-op render before their realtime catalog echo arrives.',
);
requirePattern(
  agendaSource,
  /accessibilityRole="switch"[\s\S]*?accessibilityLabel="Incastro automatico operatori"[\s\S]*?quickBookingPackagePlan\.operatorFitMode === 'overlap'/,
  'Prenota Slot must expose the salon auto-fit flag and clearly report overlap mode.',
);
requirePattern(
  agendaSource,
  /quickBookingCompositionMissingRequirements[\s\S]*?seleziona almeno 2 servizi[\s\S]*?seleziona ancora 1 servizio[\s\S]*?quickBookingSubmitRequirement[\s\S]*?Per creare la composizione/,
  'Disabled Prenota Slot composition actions must explain the next missing requirement above the buttons.',
);
requirePattern(
  agendaSource,
  /quickBookingSubmitRequirementCopy:\s*\{[\s\S]*?flexDirection:\s*'column'[\s\S]*?quickBookingSubmitRequirementSteps:\s*\{[\s\S]*?flexDirection:\s*'row'[\s\S]*?flexWrap:\s*'wrap'[\s\S]*?quickBookingSubmitRequirementStep:\s*\{[\s\S]*?maxWidth:\s*'100%'[\s\S]*?minWidth:\s*IS_WEB\s*\?\s*145\s*:\s*124/,
  'Prenota Slot requirements must stay in one horizontal sequence and wrap only when the available width is exhausted.',
);
requirePattern(
  servicesSource,
  /compositionMissingRequirement[\s\S]*?seleziona almeno 2 servizi[\s\S]*?seleziona ancora 1 servizio[\s\S]*?Per attivare “Salva composizione”[\s\S]*?compositionFooterRequirement[\s\S]*?compositionComposerFooterActions/,
  'The backoffice composition footer must keep its missing-requirement guidance visible above the buttons.',
);
requirePattern(
  agendaSource,
  /L’incastro automatico ha già scelto l’alternativa con meno sovrapposizione[\s\S]*?allowConflicts: true/,
  'Automatic overlap fitting must still require explicit owner confirmation before saving.',
);
if (
  /quickCompositionPremiumCardNative:\s*\{[^}]*marginHorizontal:\s*-\d+/.test(
    agendaSource,
  )
) {
  throw new Error(
    'Native Prenota Slot composition content must not escape beneath the modal side clipping.',
  );
}
requirePattern(
  agendaSource,
  /quickBookingModalCardNativeWide:\s*\{[\s\S]*?paddingHorizontal: 6,[\s\S]*?quickBookingContentBounded:\s*\{[\s\S]*?paddingHorizontal: 0,/,
  'Native Prenota Slot must use the full white modal width without stacked side padding.',
);
if (
  /<KeyboardAvoidingView[\s\S]{0,500}?styles\.quickBookingNestedOverlay/.test(
    agendaSource,
  )
) {
  throw new Error(
    'Nested Agenda service and customer composers must not compress their entire panel around the keyboard.',
  );
}
requirePattern(
  agendaSource,
  /setQuickBookingKeyboardHeight[\s\S]*?keyboardWillShow[\s\S]*?quickBookingNestedOverlay[\s\S]*?quickBookingKeyboardHeight \+ 36/,
  'Nested Agenda composers must keep a fixed header and add scroll-only keyboard clearance.',
);
// Both nested forms keep the outer card fixed and add clearance only inside
// the ScrollView. Dragging must not dismiss the keyboard or resize the shell.
requirePattern(
  agendaSource,
  /enabled=\{\s*!nestedAgendaComposerOpen\s*&&\s*!\(IS_IOS && quickBookingKeyboardVisible\)/,
  'Nested forms must disable parent keyboard avoidance.',
);
requirePattern(
  agendaSource,
  /!IS_WEB && nestedAgendaComposerOpen && \{\s*flex: 0,\s*flexShrink: 0,\s*height: nestedAgendaComposerHeight,\s*maxHeight: nestedAgendaComposerHeight/,
  'Both native nested forms must share a non-shrinking shell.',
);
requirePattern(
  agendaSource,
  /!quickBookingKeyboardVisible && !Keyboard\.isVisible\(\)[\s\S]*?setAgendaComposerViewportHeight\(agendaViewportHeight\)/,
  'The full composer viewport must not be recaptured while the keyboard obscures it.',
);
const nestedComposerHeightSource = agendaSource.slice(
  agendaSource.indexOf('const nestedAgendaComposerHeight ='),
  agendaSource.indexOf("const [agendaCustomerBirthdayInput"),
);
if (/quickBookingKeyboardHeight/.test(nestedComposerHeightSource)) {
  throw new Error('Keyboard height must not be subtracted from the nested form shell.');
}
const composerScrollMatches = [...agendaSource.matchAll(/ref=\{(?:agendaServiceComposerScrollRef|quickCustomerComposerScrollRef|agendaCustomerComposerScrollRef)\}/g)];
if (composerScrollMatches.length !== 4) {
  throw new Error('Verify both nested and standalone service/customer forms.');
}
composerScrollMatches.forEach((match) => {
  const start = match.index;
  // Stop at the first child element, preserving the entire ScrollView props.
  const scrollProps = agendaSource.slice(start, agendaSource.indexOf('<', start));
  requirePattern(
    scrollProps,
    /!IS_WEB\s*&&\s*quickBookingKeyboardVisible\s*&&\s*\{\s*paddingBottom:\s*quickBookingKeyboardHeight \+ 36/,
    'Both nested forms must add keyboard clearance inside the scroll content on iOS and Android.',
  );
  requirePattern(scrollProps, /automaticallyAdjustKeyboardInsets=\{false\}/,
    'Explicit scroll clearance must not be doubled by automatic keyboard insets.');
  requirePattern(scrollProps, /keyboardDismissMode="none"/,
    'Scrolling either nested form must leave the keyboard open.');
  if (/onScrollBeginDrag=\{[^}]*Keyboard\.dismiss/.test(scrollProps)) {
    throw new Error('Nested form scrolling must not dismiss the keyboard.');
  }
});
[
  numberPickerModalSource,
  nativeDatePickerModalSource,
  nativeTimePickerModalSource,
].forEach((pickerSource) => {
  requirePattern(
    pickerSource,
    /embeddedPanel[\s\S]*?useEmbeddedPanel[\s\S]*?backdropEmbeddedPanel[\s\S]*?backgroundColor: '#FFFFFF'[\s\S]*?sheetEmbeddedPanel[\s\S]*?shadowOpacity: 0,[\s\S]*?elevation: 0,/,
    'Embedded Crea slot pickers must render as one opaque panel without a nested modal backdrop or floating shadow.',
  );
});
requirePattern(
  agendaSource,
  /renderAgendaServiceNumberPickers\(true, true\)[\s\S]*?renderAgendaServiceSchedulePickers\(true, true\)[\s\S]*?customerBirthdayPickerTarget === 'quick'[\s\S]*?<NativeDatePickerModal[\s\S]*?embeddedPanel[\s\S]*?visible=\{quickBookingDatePickerOpen/,
  'Every picker opened inside Crea slot must opt into the clean embedded-panel presentation.',
);
requirePattern(
  agendaSource,
  /popupHorizontalPadding = 12;[\s\S]*?columnsGap = 8;[\s\S]*?quickServiceColumnsScrollContentNativeWide:\s*\{[\s\S]*?paddingLeft: 0,[\s\S]*?paddingRight: 0,/,
  'Native service columns must be calculated from the real modal content width and remain unclipped.',
);
requirePattern(
  agendaSource,
  /children\(gesture\)[\s\S]*?<GestureDetector gesture=\{dragGesture\}>[\s\S]*?quickCompositionDragHandle/,
  'Composition reordering must be owned by the drag handle so inline controls respond without long-press delay.',
);
requirePattern(
  agendaSource,
  /accessibilityLabel=\{`Scegli operatore per la fase[\s\S]*?quickCompositionServiceHeaderNative:\s*\{[\s\S]*?flexWrap: 'wrap'[\s\S]*?quickCompositionServiceSummaryNative:\s*\{[\s\S]*?flexBasis: '100%'[\s\S]*?quickCompositionOperatorSelectorWrapNative:\s*\{[\s\S]*?width: 'auto'[\s\S]*?flex: 1[\s\S]*?quickCompositionOperatorSelectorNative:[\s\S]*?marginLeft: 0,/,
  'Native composition cards must give the service summary a full row and keep the whole flexible operator selector tappable below it.',
);
requirePattern(
  agendaSource,
  /immediatePress[\s\S]*?accessibilityLabel=\{`Scegli operatore per la fase[\s\S]*?operatorPicker = \([\s\S]*?quickCompositionOperatorPickerOverlay/,
  'The native operator picker must open immediately from the complete selector surface.',
);
requirePattern(
  agendaSource,
  /deferredQuickBookingPackageSuggestionPlan = useDeferredValue[\s\S]*?quickBookingPackageSuggestionInputsReady[\s\S]*?quickBookingPackageScheduleSuggestions = useMemo[\s\S]*?!IS_WEB &&[\s\S]*?!quickBookingPackageSuggestionCustomer[\s\S]*?!quickBookingPackageSuggestionInputsReady[\s\S]*?quickBookingPackageSuggestionPlan\.items\.length < 2/,
  'Native composition taps must defer hidden customer-specific schedule suggestions until the urgent interaction has rendered.',
);
requirePattern(
  agendaSource,
  /const plannedOffsets = quickBookingPackageSuggestionPlan\.items\.map[\s\S]*?eligibleOperatorIds: new Set[\s\S]*?scheduleAvailabilityCache = new Map[\s\S]*?customerOverlapCache = new Map[\s\S]*?canScheduleSuggestionItem[\s\S]*?hasSuggestionCustomerOverlap/,
  'Deferred native fit suggestions must reuse eligible operators, availability and customer-overlap results instead of repeating the full planner matrix.',
);
requirePattern(
  agendaSource,
  /const packageOperatorOptions =\s*IS_WEB && service && plannedItem && quickSlotDraft[\s\S]*?const selectedPackageOperatorOption = IS_WEB[\s\S]*?plannedItem\.operatorAvailable === true/,
  'Native composition cards must reuse the resolved plan badge instead of rebuilding every operator matrix while the picker is closed.',
);
requirePattern(
  agendaSource,
  /\{plannedItem &&\s*\(IS_WEB\s*\? packageOperatorOptions\.length > 0\s*:\s*operatori\.length > 0\) \? \([\s\S]*?accessibilityLabel=\{`Scegli operatore per la fase/,
  'Lazy native operator calculations must not remove the tappable operator selector from composition cards.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageIdempotencyRef\.current = '';\s*if \(IS_WEB\) \{\s*Keyboard\.dismiss\(\);\s*\}/,
  'Native composition selection must not dismiss the keyboard and reflow Prenota Slot.',
);
requirePattern(
  agendaSource,
  /<Reanimated\.View\s*layout=\{\s*IS_WEB && activeDragIndex === null\s*\? LinearTransition\.duration\(170\)[\s\S]*?: undefined/,
  'Native composition controls must not wait for a decorative layout transition after every tap.',
);

requirePattern(
  homeSource,
  /const hasWideWebMetricCards = Platform\.OS === 'web' && responsive\.width >= 1100;/,
  'Wide web Home metric cards must keep responsive content enlargement.',
);
requirePattern(
  homeSource,
  /styles\.priorityCardGlassBlue[\s\S]*?priorityCardGlassBlue:\s*\{[\s\S]*?backgroundColor: 'rgba\(22, 117, 241, 0\.26\)'[\s\S]*?operatorAgendaCard:\s*\{[\s\S]*?backgroundColor: '#FFFFFF'/,
  'The Home priority card must keep its distinct cobalt-glass tone while the operator card stays white.',
);
requirePattern(
  homeSource,
  /ownerHomeSettledAccountKeyRef\.current = '';\s*setOwnerHomeDataSettled/,
  'Home metrics must return to a held state while authoritative owner data reloads.',
);
requirePattern(
  homeSource,
  /!ownerAppointmentsAuthoritative/,
  'Financial Home metrics must wait for the private appointments table.',
);
requirePattern(
  homeSource,
  /const appuntamenti = ownerAppointmentsAuthoritative\s*\? ownerFinancialAppointments\s*:\s*liveAppuntamenti;/,
  'Every Home appointment metric must use the workspace-scoped private financial dataset.',
);
requirePattern(
  contextSource,
  /setOwnerMobileSessionAccessReady\(true\);\s*return \{ ok: true as const, conflict: false as const \};/,
  'Native owner content must unlock only after the mobile-session claim succeeds.',
);
requirePattern(
  contextSource,
  /if \(claimResult\.conflict\) \{\s*await forceOwnerMobileSessionConflictLogout\(claimResult\.error\);/,
  'A confirmed second-device conflict must block the salon immediately.',
);
requirePattern(
  contextSource,
  /Puoi usare SalonPro contemporaneamente sul Web e su una sola app mobile, ma non su due app mobili\./,
  'The mobile-session conflict popup must explain that Web plus one app is allowed.',
);
requirePattern(
  contextSource,
  /const shouldKeepRecoveryPending = false;[\s\S]*?else if \(persistedOwnerSession\) \{\s*await AsyncStorage\.removeItem\(STORAGE_KEYS\.owner_session\);[\s\S]*?if \(!shouldRestoreOwnerSessionSilently\) \{\s*setIsLoaded\(true\);/,
  'A stale native owner email must return to access instead of holding the startup overlay.',
);
if (/if \(persistedEmail && allowSilentSessionRecovery\)/.test(contextSource)) {
  throw new Error(
    'A persisted owner email alone must never restore authenticated access.',
  );
}
requirePattern(
  homeSource,
  /const shouldHoldOwnerHomeData =\s*!ownerHomeDataSettled \|\|\s*\(Platform\.OS !== 'web' && \(\s*!isAuthenticated \|\| ownerExplicitLogout \|\| ownerInitialDataHydrating \|\|\s*!ownerServerSyncReady \|\| !ownerAppointmentsAuthoritative \|\|\s*!ownerMobileSessionAccessReady\s*\)\);/,
  'Native startup must show the Home skeleton while the active-device check completes.',
);
if (/const shouldWaitForNativeOwnerSession =/.test(rootLayoutSource)) {
  throw new Error(
    'The native active-device check must not add a second full-screen bootstrap before Home.',
  );
}
requirePattern(
  rootLayoutSource,
  /const shouldShowInitialOwnerBootstrap =\s*Platform\.OS !== 'web' &&/,
  'Web startup must mount the real back-office pages immediately and leave data loading to their skeletons.',
);
requirePattern(
  rootLayoutSource,
  /if \(!fontsLoaded && Platform\.OS !== 'web'\)/,
  'Web startup must not hide the real pages behind a full-screen font-loading card.',
);
// Native bootstrap copy is not evidence of a web loading regression. Check
// the actual web condition: unresolved auth may block, ordinary data refresh
// for an authenticated owner must leave the real pages mounted.
const webBootstrapExpression = rootLayoutSource.match(
  /const shouldShowWebOwnerBootstrap =([\s\S]*?);/,
);
if (!webBootstrapExpression) throw new Error('Missing web auth bootstrap guard');
const evaluateWebBootstrap = new Function(
  'Platform', 'isOwnerProtectedRoute', 'hasInitializedAuth',
  'ownerAuthRecoveryPending', 'isAuthenticated', 'ownerExplicitLogout', 'isLoaded',
  `return (${webBootstrapExpression[1]});`,
);
for (const loaded of [false, true]) {
  if (evaluateWebBootstrap({ OS: 'web' }, true, true, false, true, false, loaded)) {
    throw new Error('Authenticated web data refresh must not show an auth bootstrap');
  }
}
if (!evaluateWebBootstrap({ OS: 'web' }, true, false, false, false, false, false)) {
  throw new Error('Unresolved web authentication must remain protected');
}
if (evaluateWebBootstrap({ OS: 'web' }, false, false, false, false, false, false)) {
  throw new Error('Public routes must not show the owner authentication bootstrap');
}
if (/Platform\.OS === 'web' && !ownerReadyForBackoffice/.test(landingSource)) {
  throw new Error(
    'Authenticated web owners must redirect to the back office before salon data refinement finishes.',
  );
}
requirePattern(
  landingSource,
  /if \(!hasInitializedAuth\)[\s\S]*?if \(\s*isAuthenticated[\s\S]*?return <Redirect href=\{BACKOFFICE_ROUTE\} \/>;[\s\S]*?if \(!isLoaded && !keepNativeOwnerReloginMounted\)/,
  'The native landing must redirect authenticated owners before full data hydration.',
);
requirePattern(
  homeSource,
  /if \(Platform\.OS !== 'web'\) \{\s*ownerHomeSettledAccountKeyRef\.current = ownerKey;\s*setOwnerHomeDataSettled\(true\);/,
  'The native Home skeleton must end as soon as authoritative appointments arrive.',
);
requirePattern(
  contextSource,
  /if \(Platform\.OS !== 'web' && !cancelled\) \{[\s\S]*?setIsLoaded\(true\);\s*setOwnerServerSyncReady\(true\);\s*setOwnerInitialDataHydrating\(false\);/,
  'iOS and Android must release the first authoritative owner state before background refinement.',
);
requirePattern(
  ownerPrivateStateLoaderSource,
  /queryCount: 18[\s\S]*?from\('services'\)[\s\S]*?select\(\s*'id, superseded_by_composition_id, linked_service_config, discount_weekdays, name,[\s\S]*?from\('operators'\)/,
  'Owner startup must load the complete service catalog in one request instead of four.',
);
if (
  /from\('services'\)\s*\.select\('id, linked_service_config'\)|from\('services'\)\s*\.select\('id, discount_weekdays'\)|from\('services'\)\s*\.select\('id, superseded_by_composition_id'\)/.test(
    ownerPrivateStateLoaderSource,
  )
) {
  throw new Error(
    'Owner startup must not restore the three redundant service-column requests.',
  );
}
requirePattern(
  rootLayoutSource,
  /function OwnerBootstrapLoading[\s\S]*?if \(Platform\.OS === 'web'\) \{\s*return <View style=\{styles\.ownerBootstrapFallback\} \/>;/,
  'The protected-route bootstrap must stay native-only and must not restore a web preparation card.',
);
requirePattern(
  rootLayoutSource,
  /function OwnerBootstrapPremiumSpinner[\s\S]*?Animated\.loop\([\s\S]*?Easing\.linear[\s\S]*?outputRange: \['0deg', '360deg'\][\s\S]*?ownerBootstrapSpinnerRing/,
  'The native owner bootstrap must retain its premium circular continuous loader.',
);
requirePattern(
  rootLayoutSource,
  /ownerBootstrapSpinnerRing: \{[\s\S]*?borderLeftColor: 'transparent'[\s\S]*?borderRightColor: 'rgba\(10, 10, 11, 0\.7\)'[\s\S]*?borderTopColor: '#0A0A0B'/,
  'The native owner bootstrap spinner must retain its broken black chasing ring and graduated tail.',
);
requirePattern(
  ownerTabsLayoutSource,
  /let nativeOwnerColdStartTabsSettled = false;[\s\S]*?nativeOwnerColdStartTabsSettled = true;[\s\S]*?setShowNativeOwnerColdStartSkeleton\(false\);/,
  'The native tab skeleton must settle once for the whole foreground session.',
);
requirePattern(
  ownerTabsLayoutSource,
  /ownerMobileSessionAccessReady[\s\S]*?ownerInitialDataHydrating[\s\S]*?ownerServerSyncReady[\s\S]*?ownerAppointmentsAuthoritative[\s\S]*?agendaDensityPreferenceHydrated[\s\S]*?<OwnerStartupLoadingProvider active=\{showNativeOwnerColdStartSkeleton\}>/,
  'Cold-start tabs must share one startup-only signal until owner data and the initial Agenda density are ready.',
);
requirePattern(
  ownerTabsLayoutSource,
  /lazy: false/,
  'Every owner tab must mount immediately during cold start.',
);
if (/function OwnerColdStartTabsSkeleton/.test(ownerTabsLayoutSource)) {
  throw new Error(
    'Startup loading must never replace a real tab with a generic full-page skeleton.',
  );
}
if (/setShowNativeOwnerColdStartSkeleton\(true\)/.test(ownerTabsLayoutSource)) {
  throw new Error(
    'The cold-start tab skeleton must never reactivate during background refreshes.',
  );
}
requirePattern(
  servicesSource,
  /<ScrollView[\s\S]*?horizontal[\s\S]*?removeClippedSubviews=\{false\}[\s\S]*?contentContainerStyle=\{styles\.serviceRoleFilterChipsNative\}/,
  'Native service role filters must remain on one horizontal full-width strip without visual clipping.',
);
requirePattern(
  servicesSource,
  /serviceRoleFiltersNative:\s*\{[\s\S]*?marginHorizontal: IS_ANDROID \? -20 : -18,[\s\S]*?borderTopWidth: 1,[\s\S]*?borderBottomWidth: 1[\s\S]*?serviceRoleFilterChipsViewportNative:\s*\{[\s\S]*?marginHorizontal: 0,[\s\S]*?overflow: 'hidden'/,
  'The complete service role section and both dividers must stop exactly at the white card edges.',
);
requirePattern(
  servicesSource,
  /serviceRoleFilterScrollRef[\s\S]*?captureServiceRoleFilterChipLayout[\s\S]*?scrollServiceRoleFilterIntoView[\s\S]*?serviceRoleFilterScrollRef\.current\?\.scrollTo/,
  'A selected service role must automatically return fully inside the visible strip.',
);
requirePattern(
  clientFrontendSource,
  /frontendServiceRoleFilterPanelWebBleed[\s\S]*?frontendServiceRoleFilterPanelNativeBleed[\s\S]*?marginHorizontal: -18/,
  'Frontend role filters must use the complete white Step 1 card width on web and native.',
);
requirePattern(
  clientFrontendSource,
  /frontendServiceRoleFilterNativeScrollRef[\s\S]*?scrollFrontendServiceRoleFilterIntoView[\s\S]*?scrollTo\(\{[\s\S]*?x: targetOffset/,
  'The active frontend role filter must be scrolled fully into view.',
);
requirePattern(
  agendaSource,
  /renderQuickServiceRoleFilterBar\([\s\S]*?horizontalBleed: number[\s\S]*?scrollRoleIntoView[\s\S]*?marginHorizontal: -horizontalBleed/,
  'Agenda service-role strips must share full-card dividers and active-filter visibility.',
);
requirePattern(
  servicesSource,
  /operatorCard:\s*\{[\s\S]{0,420}?borderWidth: 0,[\s\S]{0,500}?boxShadow: '0 14px 34px rgba\(15, 23, 42, 0\.12\)'/,
  'Operator cards must keep the borderless editorial surface shared by native and web.',
);
requirePattern(
  servicesSource,
  /operatorCardSoftGlow[\s\S]*?operatorCardAccentRail[\s\S]*?operatorAvailabilityRow[\s\S]*?name="calendar-outline"/,
  'Operator cards must retain their coordinated accent rail and compact availability hierarchy.',
);
const operatorCardMarkupSource = servicesSource.slice(
  servicesSource.indexOf('const operatorCardInner = ('),
  servicesSource.indexOf(
    'return (',
    servicesSource.indexOf('const operatorCardInner = ('),
  ),
);
if (
  /serviceCardGlassGlow|serviceCardDiagonalHighlight|serviceCardTopSheen|serviceCardInnerStroke/.test(
    operatorCardMarkupSource,
  )
) {
  throw new Error(
    'Operator cards must not restore the layered service-card borders and white glass patina.',
  );
}
requirePattern(
  servicesSource,
  /catalogOrderAutoConfiguredRef[\s\S]*?onlineServiceCount > 8 \|\| catalogRoleGroups\.length > 3[\s\S]*?setCatalogOrderExpanded\(!hasLargeCatalog\)/,
  'Large catalogs must auto-collapse the combined role and service ordering card.',
);
requirePattern(
  servicesSource,
  /<Text style=\{styles\.catalogOrderTitle\}>Ordine del listino<\/Text>[\s\S]*?<PremiumExpandButton[\s\S]*?expanded=\{catalogOrderExpanded\}[\s\S]*?\{catalogOrderExpanded \? \(/,
  'Role and service ordering must remain together behind one premium arrow control.',
);
requirePattern(
  ownerStartupLoadingSource,
  /function OwnerStartupSkeletonPulse[\s\S]*?pointerEvents="none"/,
  'Startup data cards must share a non-blocking pulse skeleton.',
);
requirePattern(
  agendaSource,
  /useOwnerStartupLoading\(\)[\s\S]*?ownerStartupAgendaGridShell[\s\S]*?ownerStartupAgendaOperatorHeader[\s\S]*?ownerStartupAgendaSlot/,
  'Agenda startup must skeletonize the real operator headers, lanes, and slots.',
);
requirePattern(
  agendaSource,
  /const weekPlannerPanel = useMemo\(\(\) => \{[\s\S]*?if \(\s*ownerStartupLoading \|\|\s*\(IS_ANDROID && !androidInitialAgendaGridReady\)\s*\) \{[\s\S]*?ownerStartupAgendaGridShell[\s\S]*?return \([\s\S]*?weekPlannerVisualShift/,
  'Agenda startup must return the lightweight slot skeleton before building the full planner so lower settings can mount immediately.',
);
requirePattern(
  agendaSource,
  /const nativeWeekDisplacedPreviewCandidates = useMemo\(\(\) => \{[\s\S]*?if \(IS_WEB \|\| ownerStartupLoading\) \{[\s\S]*?return \[\] as NativeWeekGridPreviewCandidate\[\]/,
  'Agenda startup must skip native displaced-card projections while only the slot skeleton is visible.',
);
requirePattern(
  agendaSource,
  /const ownerStartupAgendaSkeletonRows = useMemo\([\s\S]*?Math\.max\([\s\S]*?14,[\s\S]*?Math\.min\(26, Math\.ceil\(agendaViewportHeight \/ 35\)\)[\s\S]*?ownerStartupAgendaSkeletonRows\.map\(\(row\) => \([\s\S]*?startup-fast-agenda-time-\$\{row\}[\s\S]*?ownerStartupAgendaSkeletonRows\.map\(\(row\) => \([\s\S]*?startup-fast-agenda-slot-\$\{column\}-\$\{row\}/,
  'Agenda startup must extend lightweight slot skeleton rows to the real viewport height.',
);
requirePattern(
  agendaSource,
  /const ownerStartupLoading = useOwnerStartupLoading\(\);/,
  'Agenda must not re-show its full skeleton for a background density refresh on any platform.',
);
requirePattern(
  agendaSource,
  /if \(\s*ownerStartupLoading \|\|\s*\(IS_ANDROID && !androidInitialAgendaGridReady\)\s*\) \{[\s\S]*?pointerEvents="none"[\s\S]*?ownerStartupAgendaGridShell[\s\S]*?return \([\s\S]*?weekPlannerVisualShift/,
  'Agenda startup skeleton must replace the planner entirely, leaving no live slots underneath to activate.',
);
requirePattern(
  agendaSource,
  /const toggleCustomizeHours = useCallback\([\s\S]*?setShowCustomizeHoursExpanded\(true\);[\s\S]*?requestAnimationFrame\([\s\S]*?setMountCustomizeHoursContent\(true\)[\s\S]*?onExpandTouchStart=\{[\s\S]*?stopAgendaVerticalMomentumForDayPicker[\s\S]*?onExpandPress=\{toggleCustomizeHours\}[\s\S]*?showCustomizeHoursExpanded && mountCustomizeHoursContent/,
  'Personalizza orari must acknowledge the first tap before mounting its heavy content.',
);
requirePattern(
  agendaSource,
  /openWeekVisibleDaysPicker[\s\S]*?agendaSlotScrollGestureActiveRef\.current[\s\S]*?agendaSlotScrollGestureEndedAtRef\.current[\s\S]*?AGENDA_SLOT_PRESS_RELEASE_GUARD_MS[\s\S]*?AppState\.currentState !== 'active'[\s\S]*?agendaScrollOwnsGesture[\s\S]*?setShowWeekVisibleDaysPicker\(true\)/,
  'The native visible-days picker must open only from an explicit tap while Agenda is active.',
);
requirePattern(
  agendaSource,
  /agendaContextGestureGuardUntilRef[\s\S]*?markAgendaContextGesture[\s\S]*?now < agendaContextGestureGuardUntilRef\.current/,
  'Operator-lane long presses must never leak into the visible-days picker.',
);
requirePattern(
  agendaSource,
  /openOperatorLaneBlock[\s\S]*?markAgendaContextGesture\(\);[\s\S]*?setShowWeekVisibleDaysPicker\(false\);[\s\S]*?recoverAgendaScrollAfterContextGesture\(\);[\s\S]*?setOperatorLaneBlockDraft/,
  'Operator-lane long presses must open their block flow and restore native Agenda scrolling.',
);
requirePattern(
  agendaSource,
  /const closeOperatorLaneBlock = useCallback\([\s\S]*?setOperatorLaneBlockDateTarget\(null\);[\s\S]*?setOperatorLaneBlockTimeTarget\(null\);[\s\S]*?setOperatorLaneBlockDraft\(null\);[\s\S]*?releaseAgendaParentSwipe\(\);[\s\S]*?recoverAgendaScrollAfterContextGesture\(\);/,
  'Every operator-lane popup close path must release the Agenda gesture and vertical scroll.',
);
requirePattern(
  agendaSource,
  /onPressIn=\{markAgendaContextGesture\}[\s\S]*?onPressOut=\{\s*recoverAgendaScrollAfterContextGesture\s*\}[\s\S]*?onTouchCancel=\{\s*recoverAgendaScrollAfterContextGesture\s*\}[\s\S]*?openOperatorLaneBlock/,
  'Operator-lane headers must recover vertical scrolling after both touch release and cancellation.',
);
requirePattern(
  agendaSource,
  /const weekStickyOperatorHeaderTop = IS_WEB[\s\S]*?agendaSafeAreaInsets\.top - 10[\s\S]*?agendaSafeAreaInsets\.top \+ 8/,
  'Sticky operator headers must respect the web top edge and the native safe areas.',
);
requirePattern(
  agendaSource,
  /weekStickyOperatorHeaderTrackStyle = useAnimatedStyle[\s\S]*?translateX: -nativeWeekHorizontalScrollX\.value[\s\S]*?weekStickyOperatorHeaderVisible[\s\S]*?pointerEvents="none"[\s\S]*?entering=\{FadeIn\.duration[\s\S]*?exiting=\{FadeOut\.duration[\s\S]*?weekStickyOperatorHeaderTrackStyle/,
  'Sticky operator headers must mirror horizontal Agenda scrolling and fade softly without intercepting gestures.',
);
requirePattern(
  agendaSource,
  /weekHorizontalScrollPosRef\.current = 0;[\s\S]*?nativeWeekHorizontalScrollX\.value = 0;[\s\S]*?useAnimatedScrollHandler[\s\S]*?nativeWeekHorizontalScrollX\.value = event\.contentOffset\.x[\s\S]*?runOnJS\(syncWeekHorizontalScrollOnJs\)/,
  'Sticky operator headers must share horizontal resets and the native UI-thread scroll offset with the real Agenda grid.',
);
requirePattern(
  agendaSource,
  /weekDayColumnWidthsByDate\[day\.value\] \?\? weekVisibleColWidth[\s\S]*?weekStickyOperatorHeaderDay[\s\S]*?width: dayColumnWidth/,
  'Sticky operator headers must reuse the measured day and operator-lane geometry during horizontal overflow.',
);
requirePattern(
  agendaSource,
  /horizontalViewport\?\.measureInWindow[\s\S]*?if \(IS_WEB\) \{\s*return;\s*\}[\s\S]*?left: x - agendaRootOriginRef\.current\.x[\s\S]*?setWeekStickyOperatorHeaderFrame/,
  'Sticky operator headers must use the stable planner host on web while app retains its measured horizontal viewport.',
);
requirePattern(
  agendaSource,
  /updateWebWeekStickyOperatorHeader[\s\S]*?plannerHost\.measureInWindow[\s\S]*?window\.addEventListener\('scroll', scheduleStickyHeaderUpdate, true\)[\s\S]*?position: 'fixed' as 'absolute'/,
  'Web sticky operator headers must follow both document and FlatList scrolling from a fixed viewport layer.',
);
requirePattern(
  agendaSource,
  /const weekStickyOperatorHeaderContent =[\s\S]*?const weekStickyOperatorHeader =[\s\S]*?IS_WEB[\s\S]*?createPortal\(weekStickyOperatorHeaderContent, document\.body\)/,
  'Web sticky operator headers must escape transformed Expo screen ancestors through a document-level portal.',
);
requirePattern(
  agendaSource,
  /agendaWeekPlannerOverlayHostOffsetRef[\s\S]*?commitPlannerContentOffset[\s\S]*?knownAgendaScrollOffset[\s\S]*?if \(plannerRect\)[\s\S]*?plannerRect\.left \+ WEEK_PLANNER_TIME_COL_TOTAL[\s\S]*?weekPlannerBoundsRef\.current\.left \+ WEEK_PLANNER_TIME_COL_TOTAL[\s\S]*?updateWebWeekStickyOperatorHeader\(nextOffsetY\)/,
  'Web sticky operator headers must use the authoritative FlatList offset and prefer the stable planner frame over translated horizontal content.',
);
if (/weekStickyOperatorHeaderTimeGutter/.test(agendaSource)) {
  throw new Error(
    'Sticky operator headers must float alone without restoring a white gutter or backing panel.',
  );
}
requirePattern(
  agendaSource,
  /originalOperatorHeaderTop - nextOffsetY[\s\S]*?weekStickyOperatorHeaderTop[\s\S]*?plannerGridBottom - nextOffsetY[\s\S]*?setWeekStickyOperatorHeaderVisible/,
  'Sticky operator headers must appear only while the operator grid is passing under the fixed top edge.',
);
requirePattern(
  agendaSource,
  /isConfiguredTimeMarker &&\s*!useOperatorLaneMode &&\s*cellState !== 'occupied' &&\s*!appointmentStart \? \([\s\S]{0,420}?weekPlannerConfiguredMarkerLineWeb/,
  'Day-level web time markers must render only in free non-lane cells.',
);
requirePattern(
  agendaSource,
  /\{isConfiguredTimeMarker &&\s*!laneOccupyingAppointment &&\s*!laneStartAppointment \? \([\s\S]{0,520}?weekPlannerConfiguredMarkerLineWeb/,
  'Per-lane web time markers must skip every occupied appointment lane.',
);
requirePattern(
  agendaSource,
  /\{!IS_WEB &&\s*isConfiguredTimeMarker &&\s*isFirstDayColumn \? \([\s\S]{0,280}?weekPlannerConfiguredMarkerLeadAnchor/,
  'The configured-time lead must stay native-only and never cross the web time gutter.',
);
requirePattern(
  agendaSource,
  /weekPlannerConfiguredMarkerLineWeb:\s*\{[\s\S]{0,520}?top: -1\.25,[\s\S]{0,120}?left: 4,[\s\S]{0,80}?right: 4,[\s\S]{0,80}?height: 2\.5,[\s\S]{0,180}?backgroundColor: 'rgba\(30, 41, 59, 0\.52\)'/,
  'Web configured-time markers must remain visible, inset and centered on slot boundaries.',
);
requirePattern(
  agendaSource,
  /range\.selectNodeContents\(node\)[\s\S]{0,800}?naturalWidth > 0 \? naturalWidth : Math\.max\(boundingWidth, layoutWidth\)[\s\S]{0,1500}?settledFrame = requestAnimationFrame\(\(\) => measureWebTextWidth\(\)\)[\s\S]{0,5000}?measureWebTextWidth\(event\.nativeEvent\.layout\.width\)/,
  'Web appointment marquees must recover intrinsic text width after compact future-card layout settles.',
);
requirePattern(
  agendaSource,
  /visible=\{[\s\S]*?operatorLaneBlockDraft[\s\S]*?onRequestClose=\{closeOperatorLaneBlock\}[\s\S]*?onDismiss=\{recoverAgendaScrollAfterContextGesture\}[\s\S]*?onPress=\{closeOperatorLaneBlock\}/,
  'The operator-lane modal must restore Agenda scrolling after every native dismissal path.',
);
requirePattern(
  agendaSource,
  /<NumberPickerModal[\s\S]*?visible=\{showWeekVisibleDaysPicker && \(IS_WEB \|\| isAgendaScreenFocused\)\}[\s\S]*?onClose=\{closeWeekVisibleDaysPicker\}[\s\S]*?onDismiss=\{closeWeekVisibleDaysPicker\}/,
  'The visible-days picker must close through every native dismissal path without remounting on open.',
);
requirePattern(
  premiumExpandButtonSource,
  /export function PremiumExpandButton[\s\S]*?rotate: `\$\{progress\.value \* 180\}deg`[\s\S]*?accessibilityState=\{\{ expanded, disabled \}\}/,
  'Expandable cards must share one accessible premium arrow control.',
);
requirePattern(
  clientsSource,
  /searchHeaderRow:\s*\{[\s\S]*?flexDirection: 'row',[\s\S]*?paddingLeft: 40,[\s\S]*?paddingRight: 0/,
  'Client section expand arrows must stay aligned on the right in every layout.',
);
requirePattern(
  clientsSource,
  /searchTitle:\s*\{[\s\S]*?flex: 1,[\s\S]*?width: 'auto'/,
  'Client section titles must leave a dedicated right-hand column for the expand arrow.',
);
requirePattern(
  premiumGuideDockSource,
  /infoOnRight\?: boolean[\s\S]*?mode\?: 'corner' \| 'inline'[\s\S]*?const expandButton = showsExpand \? \([\s\S]*?<PremiumExpandButton[\s\S]*?<InfoButton[\s\S]*?onPress=\{onGuidePress\}/,
  'Every section guide must share a compact info badge with an optional expand arrow.',
);
requirePattern(
  premiumGuideDockSource,
  /dock:\s*\{[\s\S]*?backgroundColor: 'transparent'[\s\S]*?cornerSocket:\s*\{[\s\S]*?width: Platform\.OS==='web'\?48:44,[\s\S]*?height: Platform\.OS==='web'\?48:44/,
  'The shared guide must reserve the Services information button size without a card cutout.',
);
if (/dockTopLight|boxShadow: '-[68]px/.test(premiumGuideDockSource)) {
  throw new Error(
    'The shared guide cavity must not restore the former outer badge highlight or shadow.',
  );
}
const premiumGuideDockCounts = {
  agenda: (agendaSource.match(/<PremiumGuideDock/g) ?? []).length,
  requests: (requestsSource.match(/<PremiumGuideDock/g) ?? []).length,
  clients: (clientsSource.match(/<PremiumGuideDock/g) ?? []).length,
  services: (servicesSource.match(/<PremiumGuideDock/g) ?? []).length,
};
if (
  premiumGuideDockCounts.agenda !== 3 ||
  premiumGuideDockCounts.requests !== 2 ||
  premiumGuideDockCounts.clients !== 2 ||
  premiumGuideDockCounts.services !== 4
) {
  throw new Error(
    'All eleven owner section info controls must use the shared premium guide dock.',
  );
}
requirePattern(
  servicesSource,
  /customServiceContactPanel[\s\S]*?\{publicCompositionSettingsPanel\}/,
  'Composizioni online must render immediately after the custom-services section.',
);
requirePattern(
  servicesSource,
  /const hasSavedCompositions = publicCompositionSettings\.length > 0;[\s\S]*?const publicCompositionSettingsPanel =\s*Platform\.OS === 'web' \|\| hasSavedCompositions \? \(/,
  'The app must omit the obsolete empty saved-compositions panel while web and real saved templates remain unchanged.',
);
requirePattern(
  servicesSource,
  /renderCustomServicesGuideDock[\s\S]*?infoOnRight[\s\S]*?expanded=\{expanded\}/,
  'Custom services must keep expand on the left and info on the right in one dock.',
);
requirePattern(
  servicesSource,
  /<AppOnlyFastExpansionBoundary[\s\S]*?webExpanded=\{customServiceContactExpanded\}[\s\S]*?renderCustomServicesGuideDock\([\s\S]*?customServiceExpanded/,
  'Custom services must preserve its web-controlled state while isolating native expansion.',
);
[agendaSource, requestsSource, clientsSource, servicesSource].forEach(
  (source) => {
    if (/<SectionHowItWorksButton/.test(source)) {
      throw new Error(
        'Owner tabs must not restore standalone section info buttons outside the premium dock.',
      );
    }
  },
);
requirePattern(
  clientsSource,
  /searchHeaderRowWithGuide:\s*\{[\s\S]*?paddingLeft: 84,[\s\S]*?paddingRight: 84/,
  'The Rubrica title must remain centered clear of the embedded corner controls.',
);
requirePattern(
  clientsSource,
  /searchCard:\s*\{[\s\S]*?paddingTop: 16,/,
  'Rubrica must not reserve a tall empty native row for the info control.',
);
requirePattern(
  clientsSource,
  /Platform\.OS === 'web'\s*\? 'Scorri una card per aprire modifica, limiti, inibizione ed elimina\.'\s*: 'Scorri una card: puoi modificarla, impostare limiti, inibirla o eliminarla\.'/,
  'Rubrica must use the corrected guidance copy only in the native app.',
);
requirePattern(
  clientsSource,
  /placeholder=\{[\s\S]*?Platform\.OS === 'web'[\s\S]*?'Cerca per nome, telefono, email o Instagram'[\s\S]*?: 'Cerca nome, telefono, email o Instagram'[\s\S]*?Platform\.OS !== 'web' \? styles\.searchInputNative : null[\s\S]*?searchInputNative:\s*\{[\s\S]*?fontSize: 13,[\s\S]*?letterSpacing: 0,/,
  'Rubrica must keep web unchanged while the native search copy and typography fit the field.',
);
requirePattern(
  servicesSource,
  /<PremiumGuideDock[\s\S]*?guideOpen=\{operatorsGuideOpen\}[\s\S]*?guideAccessibilityLabel="Come funziona la Lista Operatori"[\s\S]*?\{operatorsGuideOpen \? \([\s\S]*?<SectionHowItWorksPanel[\s\S]*?Organizza operatori e competenze/,
  'Operator list must retain its premium info-only corner guide.',
);
requirePattern(
  servicesSource,
  /operatorsListCard:\s*\{[\s\S]*?position: 'relative',[\s\S]*?overflow: 'hidden'/,
  'The operator list must clip the shared guide dock into its white card corner.',
);
requirePattern(
  servicesSource,
  /backgroundColor: accent\.baseColor,[\s\S]*?shadowColor: accent\.shadowColor/,
  'Operator cards must stay opaque so swipe actions never bleed through their surface.',
);
requirePattern(
  servicesSource,
  /operatorCardWebHovered:\s*\{[\s\S]*?Platform\.select\(\{[\s\S]*?web:\s*\{[\s\S]*?translateY\(-6px\)[\s\S]*?boxShadow:[\s\S]*?0 30px 62px/,
  'Operator cards must cast a visible shadow behind their raised web-only hover state.',
);
requirePattern(
  servicesSource,
  /serviceOfflineArchiveToggle:\s*\{[\s\S]*?backgroundColor: 'transparent',[\s\S]*?borderWidth: 0/,
  'The offline services header must keep a compact borderless count and expand control.',
);
if (/serviceOfflineArchiveToggleText/.test(servicesSource)) {
  throw new Error(
    'The offline services header must not restore the oversized Espandi text control.',
  );
}
const premiumExpandButtonCounts = {
  home: (homeSource.match(/<PremiumExpandButton/g) ?? []).length,
  agenda: (agendaSource.match(/<PremiumExpandButton/g) ?? []).length,
  requests: (requestsSource.match(/<PremiumExpandButton/g) ?? []).length,
  clients: (clientsSource.match(/<PremiumExpandButton/g) ?? []).length,
  services: (servicesSource.match(/<PremiumExpandButton/g) ?? []).length,
};
if (
  premiumExpandButtonCounts.home < 1 ||
  premiumExpandButtonCounts.agenda < 1 ||
  premiumExpandButtonCounts.requests < 3 ||
  premiumExpandButtonCounts.clients < 2 ||
  premiumExpandButtonCounts.services < 5
) {
  throw new Error(
    'Main expandable cards across owner tabs must use the shared premium arrow control.',
  );
}
requirePattern(
  homeSource,
  /<SalonLogoEditor[\s\S]*?workspaceId=\{salonWorkspace.id\}[\s\S]*?name=\{salonPreviewName\}/,
  'The branding editor must retain the workspace identity and salon-name preview.',
);
[
  [
    agendaSource,
    /<HapticTouchable[\s\S]{0,220}styles\.(?:sectionToggleButton|daySectionHeader)/,
  ],
  [
    requestsSource,
    /<HapticTouchable[\s\S]{0,160}styles\.(?:accordionHeader|dayClusterHeader|archiveMonthHeader)/,
  ],
  [
    clientsSource,
    /<HapticTouchable[\s\S]{0,160}styles\.searchHeaderBlockTouchable/,
  ],
  [
    servicesSource,
    /<HapticTouchable[\s\S]{0,220}styles\.(?:expandHeaderButton|operatorArchiveHeader|customServiceContactHeader)/,
  ],
].forEach(([source, pattern]) => {
  if (pattern.test(source)) {
    throw new Error(
      'A main expandable card surface must stay passive; only its arrow button may toggle it.',
    );
  }
});
requirePattern(
  requestsSource,
  /useOwnerStartupLoading\(\)[\s\S]*?ownerStartupRequestCard/,
  'Requests startup must skeletonize its existing request cards.',
);
requirePattern(
  clientsSource,
  /useOwnerStartupLoading\(\)[\s\S]*?ownerStartupClientCard/,
  'Clients startup must skeletonize its existing customer cards.',
);
requirePattern(
  servicesSource,
  /useOwnerStartupLoading\(\)[\s\S]*?ownerStartupServiceCard/,
  'Services startup must skeletonize its existing service cards.',
);
requirePattern(
  agendaSource,
  /const renderWeekLunchBreakSlotLabel[\s\S]*?pointerEvents="none"[\s\S]*?styles.weekPlannerLunchBreakAction,[\s\S]*?>\s*Pausa\s*<\/Text>/,
  'Every salon-break slot must show Pausa while leaving its parent tap action available.',
);
const lunchBreakActionStyleSource = agendaSource.slice(
  agendaSource.indexOf('weekPlannerLunchBreakAction: {'),
  agendaSource.indexOf('weekPlannerLunchBreakActionPast: {'),
);
if (
  /borderRadius|borderWidth|backgroundColor/.test(lunchBreakActionStyleSource)
) {
  throw new Error(
    'The Pausa action must stay directly on the slot without an extra pill container.',
  );
}
if (
  /weekPlannerLunchBreakForceBadge:\s*\{|weekPlannerLunchBreakForceBadgeText|weekPlannerLunchBreakQuietMark|weekPlannerLunchBreakActionIcon/.test(
    agendaSource,
  )
) {
  throw new Error(
    'Salon-break slots must not restore the old badge, calendar icon, or intermittent dash treatment.',
  );
}
requirePattern(
  agendaSource,
  /const shouldAnimate =\s*animated &&\s*\(!IS_IOS \|\|[\s\S]*?DAY_CARD_FULL_WIDTH \* 1\.25\);[\s\S]*?suppressSettleRef\.current = IS_IOS \? shouldAnimate : true;[\s\S]*?animated: shouldAnimate/,
  'Far iOS day selections must snap directly under the glass without changing Android or web centering.',
);
requirePattern(
  agendaSource,
  /dayPickerWrap:\s*\{[\s\S]*?overflow: IS_WEB \? 'visible' : 'hidden'[\s\S]*?dayPickerBleedWrap:\s*\{[\s\S]*?marginHorizontal: IS_WEB \? -12 : IS_ANDROID \? -24 : IS_IOS \? -18 : 0,[\s\S]*?overflow: IS_WEB \? 'visible' : 'hidden'/,
  'Native day cards must remain clipped inside the Agenda section while web keeps its existing bleed.',
);
requirePattern(
  agendaSource,
  /IS_WEB \? \([\s\S]*?weekPlannerDateTitleRow[\s\S]*?\) : null[\s\S]*?IS_WEB \? \([\s\S]*?weekPlannerControlDeck[\s\S]*?\) : \([\s\S]*?weekPlannerNativeControlDeck[\s\S]*?weekPlannerNativeRangeRow[\s\S]*?weekRangeLabel[\s\S]*?chevron-back[\s\S]*?weekPlannerNativeDaysButton[\s\S]*?weekEffectiveVisibleDays[\s\S]*?chevron-forward[\s\S]*?weekPlannerNativeDensityPanel/,
  'Native Panoramica controls must keep compact period navigation, visible-day selection, and density separate without changing web.',
);
requirePattern(
  agendaSource,
  /weekPlannerNativeDensityPanel[\s\S]*?Dimensione[\s\S]*?\{agendaDensityOption\?\.label \?\? 'Normale'\}[\s\S]*?weekPlannerNativeDensityChoices[\s\S]*?AGENDA_DENSITY_OPTIONS\.map[\s\S]*?onPress=\{\(\) => commitAgendaDensityIndex\(optionIndex\)\}/,
  'Native Agenda density must use immediate tap choices instead of a drag slider.',
);
requirePattern(
  agendaSource,
  /weekPlannerNativeNavigationRow:\s*\{[\s\S]*?minHeight: 50[\s\S]*?weekPlannerNativeDensityChoice:\s*\{[\s\S]*?minHeight: 31/,
  'Native Panoramica controls must retain the reduced-height premium layout.',
);
requirePattern(
  agendaSource,
  /showsHorizontalScrollIndicator:\s*IS_WEB && weekPlannerShouldShowHorizontalCue/,
  'The native Agenda must keep the system scrollbar hidden in favor of the compact in-panel cursor.',
);
requirePattern(
  agendaSource,
  /WEEK_PLANNER_NATIVE_SCROLL_CUE_TRACK_WIDTH = 116[\s\S]*?const weekPlannerNativeScrollCueThumbWidth = useMemo[\s\S]*?availableGridWidth \/[\s\S]*?totalGridWidth[\s\S]*?const weekPlannerNativeScrollCueThumbStyle = useAnimatedStyle[\s\S]*?nativeWeekHorizontalScrollX\.value \/ maxScrollX[\s\S]*?translateX: \(progress - 0\.5\) \* thumbTravel[\s\S]*?weekPlannerShouldShowHorizontalCue \? \([\s\S]*?weekPlannerNativeScrollCue[\s\S]*?WEEK_PLANNER_NATIVE_SCROLL_CUE_TRACK_WIDTH[\s\S]*?weekPlannerControlScrollCueThumb,[\s\S]*?weekPlannerNativeScrollCueThumbStyle/,
  'The native Agenda must reuse the existing premium horizontal cursor, show it only on overflow, and move its thumb with the real grid offset.',
);
requirePattern(
  agendaSource,
  /const markWeekVisibleDaysPickerDirectPress = useCallback[\s\S]*?setDisableParentSwipe\(true\)[\s\S]*?weekVisibleDaysPickerDirectPressAtRef\.current = Date\.now\(\)[\s\S]*?const openWeekVisibleDaysPicker = useCallback[\s\S]*?isDirectPickerPress[\s\S]*?agendaScrollOwnsGesture && !isDirectPickerPress[\s\S]*?setDisableParentSwipe\(false\)[\s\S]*?setShowWeekVisibleDaysPicker\(true\)[\s\S]*?requestAnimationFrame\(\(\) => Keyboard\.dismiss\(\)\)/,
  'A direct visible-days tap must lock the parent pager, open before secondary feedback, and release a rejected tap while stale Agenda scroll guards remain protected.',
);
requirePattern(
  agendaSource,
  /const lockWeekPlannerParentSwipe = useCallback[\s\S]*?setDisableParentSwipe\(true\)[\s\S]*?const releaseWeekPlannerParentSwipe = useCallback[\s\S]*?setDisableParentSwipe\(false\)[\s\S]*?onTouchStart: lockWeekPlannerParentSwipe[\s\S]*?onTouchEnd: releaseWeekPlannerParentSwipe[\s\S]*?onTouchCancel: releaseWeekPlannerParentSwipe/,
  'The native horizontal Agenda grid must temporarily own its gesture instead of swiping to an adjacent tab.',
);
if (
  (
    agendaSource.match(/onPressIn=\{markWeekVisibleDaysPickerDirectPress\}/g) ??
    []
  ).length < 3 ||
  (
    agendaSource.match(
      /onPress=\{openWeekVisibleDaysPicker\}[\s\S]{0,100}?immediatePress/g,
    ) ?? []
  ).length < 2
) {
  throw new Error(
    'Every visible-days entry point must identify a direct tap and the primary controls must open immediately.',
  );
}
if (
  /week-visible-days-picker-open|week-visible-days-picker-closed/.test(
    agendaSource,
  )
) {
  throw new Error(
    'The visible-days picker must not remount its complete modal tree on every open.',
  );
}
const nativeDensityPanelSource = agendaSource.slice(
  agendaSource.indexOf('style={styles.weekPlannerNativeDensityPanel}'),
  agendaSource.indexOf('ref={weekPlannerOverlayHostRef}'),
);
if (/agendaDensitySlider/.test(nativeDensityPanelSource)) {
  throw new Error(
    'Native Agenda density must not render the draggable bar or thumb.',
  );
}
if (/supportsIosNativeAgendaDayPicker/.test(agendaSource)) {
  requirePattern(
    agendaSource,
    /const selectedIndex = useMemo\([\s\S]*?findIndex\(\(day\) => day\.value === selectedDate\)[\s\S]*?<IosNativeAgendaDayPicker[\s\S]*?daysJson=\{nativeDaysJson\}[\s\S]*?selectedIndex=\{selectedIndex\}/,
    'The native iOS picker must receive the authoritative Agenda date on its first render.',
  );
  if (
    /confirmedNativeSelectedIndex|nativePickerSessionRevision|agenda-day-picker-session-/.test(
      agendaSource,
    )
  ) {
    throw new Error(
      'The native iOS picker must never flash index zero or remount before restoring the selected Agenda date.',
    );
  }
  requirePattern(
    nativeAgendaDayPickerSource,
    /pendingSelectedIndexBeforeDays: Int\?[\s\S]*?func setDays\([\s\S]*?if let pendingSelectedIndexBeforeDays[\s\S]*?selectedIndex = boundedIndex\(pendingSelectedIndexBeforeDays\)[\s\S]*?func setSelectedIndex\(_ nextIndex: Int\)[\s\S]*?guard !days\.isEmpty else \{[\s\S]*?pendingSelectedIndexBeforeDays = max\(0, nextIndex\)/,
    'The native iOS picker must preserve a selected index delivered before its day data.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /scrollViewWillEndDragging\([\s\S]*?targetContentOffset: UnsafeMutablePointer<CGPoint>[\s\S]*?Nessuna destinazione viene prevista o conservata al rilascio[\s\S]*?private func finalizeScrollInteraction\(_ scrollView: UIScrollView\)[\s\S]*?let nextIndex = nearestIndex\(for: scrollView\.contentOffset\.x\)[\s\S]*?let targetOffset = offset\(for: nextIndex\)/,
    'The native iOS picker must preserve UIKit inertia and settle from the final resting position.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /indexPathForItem\(at: point\)[\s\S]*?boundedIndex\(indexPath\.item\)/,
    'Native iOS day taps must select the actual UIKit cell instead of deriving a distant index from mixed coordinates.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /guard !decelerate else \{ return \}[\s\S]*?scrollViewDidEndDecelerating/,
    'The native iOS picker must keep ownership until real momentum ends.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /pendingBadgeShell\.addSubview\(pendingBadge\)[\s\S]*?pendingBadgeShell\.frame = CGRect\(x: 29, y: -2, width: 26, height: 24\)[\s\S]*?pendingBadge\.frame = pendingBadgeShell\.bounds/,
    'The iOS pending +1 must remain a clean circular badge at the raised day-card corner.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /collectionView\.layer\.masksToBounds = false[\s\S]*?glassView\.layer\.zPosition = 1_000[\s\S]*?glassInnerRim\.layer\.zPosition = 1_001/,
    'The iOS pending +1 must stay visible above day cards while the glass remains the top layer.',
  );
  requirePattern(
    nativeAgendaDayPickerSource,
    /topOverflowInset: CGFloat = 8[\s\S]*?viewportHeight: CGFloat = 136[\s\S]*?y: AgendaDayPickerMetrics\.topOverflowInset \+ 2/,
    'The iOS pending +1 must have native top overflow room without lowering the visible day card.',
  );
} else {
  requirePattern(
    agendaSource,
    /const IOS_DAY_PICKER_DECELERATION_RATE = 0\.94;[\s\S]*?const IOS_DAY_PICKER_IDLE_SETTLE_MS = 24;[\s\S]*?suppressSettleRef\.current = !IS_IOS;[\s\S]*?scheduleIdleSettle\(\s*IS_ANDROID \? 16 : IS_IOS \? IOS_DAY_PICKER_IDLE_SETTLE_MS : 32,?\s*\);/,
    'iOS day-picker settling must stay fast while preserving the Android and web branches.',
  );
  requirePattern(
    agendaSource,
    /snapToInterval=\{IS_IOS \? undefined : DAY_CARD_FULL_WIDTH\}[\s\S]*?snapToOffsets=\{IS_IOS \? undefined : snapOffsets\}[\s\S]*?onScrollEndDrag=\{\(event\) => \{[\s\S]*?scheduleIdleSettle\(/,
    'The iOS glass day picker must remain free under the finger and settle only after release.',
  );
}
requirePattern(
  agendaSource,
  /Reset[\s\S]*?quickCompositionPauseButton[\s\S]*?name="remove"[\s\S]*?quickCompositionPauseValue[\s\S]*?name="add"/,
  'Composition pose controls must expose Reset, minus, and plus actions.',
);
requirePattern(
  agendaSource,
  /if \(IS_IOS\) \{[\s\S]*?centerDayInPicker\(nextDate, false\);[\s\S]*?setVisualSelectedDate/,
  'iOS day taps must physically align the card under the glass before changing the selected date.',
);
requirePattern(
  ownerTabsLayoutSource,
  /IS_IOS &&[\s\S]*?targetRouteName === "agenda"[\s\S]*?immediateAgendaPendingRequestTarget\?\.data[\s\S]*?openDetails: "false"[\s\S]*?requestOpenToken/,
  'The iOS Agenda tab may focus a pending slot but must leave its popup closed until an explicit card or banner press.',
);
if (!/supportsIosNativeAgendaDayPicker/.test(agendaSource)) {
  requirePattern(
    agendaSource,
    /onTouchEnd=\{\(\) => \{[\s\S]*?if \(!IS_IOS\) \{\s*scheduleIdleSettle\(IS_ANDROID \? 35 : 28\);/,
    'iOS touch-end must not schedule a second competing day-picker settle.',
  );
}
requirePattern(
  agendaSource,
  /const QUICK_BOOKING_SUCCESS_CLOSE_DELAY_MS = 90;[\s\S]*?setTimeout\(resolve, QUICK_BOOKING_SUCCESS_CLOSE_DELAY_MS\)/,
  'Quick booking must close promptly after the authoritative server success.',
);
requirePattern(
  agendaSource,
  /weekPendingActionLockRef\.current = true;[\s\S]*?setWeekPendingAction\(status\);[\s\S]*?applyAcceptedRequestVisualSnapshot\(\);[\s\S]*?setRichiestePrenotazione\([\s\S]*?await updateBookingRequestStatusForSalon/,
  'Manual Agenda acceptance must preserve the accepted visual before waiting for the server.',
);
requirePattern(
  agendaSource,
  /const completeAcceptedRequestFeedback = async \(\) => \{[\s\S]*?setWeekPendingActionSucceeded\('Accettata'\);[\s\S]*?AGENDA_ACCEPTANCE_SUCCESS_FEEDBACK_MS[\s\S]*?closeWeekAppointmentDetails\(\);/,
  'Manual Agenda acceptance must show success and only then close.',
);
requirePattern(
  agendaSource,
  /item\.syntheticRequestStatus !== 'In attesa'[\s\S]*?nextMap\.set\(baseSyncKey, 1\)/,
  'Accepted unread requests must never be reclassified as a pending Agenda +1.',
);
requirePattern(
  contextSource,
  /item\.stato === 'Accettata'[\s\S]*?authoritativeItem\.stato === 'In attesa'[\s\S]*?options\?\.preserveAcceptedRequestIds\?\.has\(item\.id\) === true[\s\S]*?return item;/,
  'Only an in-flight or recently committed acceptance may resist a stale pending snapshot.',
);
requirePattern(
  contextSource,
  /const getProtectedAcceptedRequestIds = React\.useCallback[\s\S]*?acceptedRequestMutationInFlightIdsRef\.current\.keys\(\)[\s\S]*?getRecentlyAcceptedRequestCompositeKeys\(\)[\s\S]*?recentlyAcceptedCompositeKeys\.has\(buildRichiestaMergeKey\(item\)\)/,
  'Accepted request protection must be bounded to active mutations and the short post-success window.',
);
requirePattern(
  contextSource,
  /status === 'Accettata' && isCurrentSalonWorkspace[\s\S]*?acceptedRequestMutationInFlightIdsRef\.current\.set\([\s\S]*?finally \{[\s\S]*?acceptedRequestMutationInFlightIdsRef\.current\.delete\(/,
  'Every acceptance mutation must install and release its stale-pending guard on all exit paths.',
);
requirePattern(
  contextSource,
  /const clearRuntimeDataForAccount = React\.useCallback[\s\S]*?acceptedRequestMutationInFlightIdsRef\.current\.clear\(\);[\s\S]*?recentlyAcceptedRequestKeysRef\.current\.clear\(\);/,
  'Acceptance guards must be cleared when the owner account or salon runtime is reset.',
);
requirePattern(
  contextSource,
  /const commitFetchedRequestsToCurrentState = \([\s\S]*?getProtectedAcceptedRequestIds\(\)[\s\S]*?preserveAcceptedRequestIds: protectedAcceptedRequestIds[\s\S]*?commitFetchedRequestsToCurrentState\(restoredRichieste\);[\s\S]*?commitFetchedRequestsToCurrentState\(restoredRichieste\);[\s\S]*?commitFetchedRequestsToCurrentState\(mergedRichieste\);/,
  'Every authenticated full-sync commit must preserve only protected accepted requests.',
);
requirePattern(
  contextSource,
  /mergeRichiesteCollections\(current, \[nextRequest\]\)[\s\S]*?preserveAcceptedRequestIds: getProtectedAcceptedRequestIds\(\)[\s\S]*?mergeRichiesteCollections\(current, refreshedRequests\)[\s\S]*?preserveAcceptedRequestIds: getProtectedAcceptedRequestIds\(\)/,
  'Realtime and delayed group refreshes must share the bounded stale-pending guard.',
);
requirePattern(
  contextSource,
  /const authoritativeRequestStateForOwnerOverlay = \[[\s\S]*?authoritativeRemoteRequests\.filter[\s\S]*?privateItem\.id === remoteItem\.id[\s\S]*?\.\.\.privateAuthoritativeRequests[\s\S]*?overlayAuthoritativeRichiestaServerState\([\s\S]*?authoritativeRequestStateForOwnerOverlay/,
  'Owner refresh authority must cover every remote request while preferring private state for the same UUID.',
);
requirePattern(
  agendaSource,
  /weekPendingActionGenerationRef[\s\S]*?const actionGeneration = weekPendingActionGenerationRef\.current \+ 1[\s\S]*?optimisticTransitionItemById[\s\S]*?weekPendingActionGenerationRef\.current !== actionGeneration[\s\S]*?item !== optimisticTransitionItem[\s\S]*?restorePendingRequestVisualSnapshot\(\);/,
  'Agenda rollback must be generation-aware and must not overwrite a newer terminal request object.',
);
requirePattern(
  agendaSource,
  /const hasRealAppointment =[\s\S]*?realAppointmentBaseSyncKeysRef\.current\.has[\s\S]*?const hasNewerTerminalRequest =[\s\S]*?currentRequest\.stato !== 'In attesa'[\s\S]*?if \(hasRealAppointment \|\| hasNewerTerminalRequest\) \{[\s\S]*?const allRelevantRequestsArePending =[\s\S]*?restorePendingRequestVisualSnapshot\(\);/,
  'Rollback may restore the pending visual after an external pending sync, but never over a real appointment or newer terminal state.',
);
requirePattern(
  agendaSource,
  /\/richiesta non trovata\/\.test\(errorText\)[\s\S]*?weekPendingActionGenerationRef\.current !== actionGeneration[\s\S]*?item\.stato !== 'In attesa' &&[\s\S]*?item !== optimisticTransitionItem/,
  'A not-found cleanup must retain any newer terminal request received while acceptance was pending.',
);
requirePattern(
  agendaSource,
  /const openQuickSlotModal = useCallback\([\s\S]*?if \(!IS_WEB\) \{\s*haptic\.light\(\)\.catch\(\(\) => null\);[\s\S]*?setQuickBookingPackageOperatorMenuServiceId\(null\);\s*\}[\s\S]*?quickSlotModalVisibleRef\.current = true;/,
  'Every native free-slot opening path must emit one centralized light haptic.',
);
requirePattern(
  agendaSource,
  /quickCompositionActions:[\s\S]*?position: 'absolute'[\s\S]*?right: IS_WEB \? 40 : 42[\s\S]*?quickCompositionActionsNative:[\s\S]*?width: 34[\s\S]*?flexDirection: 'column'/,
  'iOS and Android composition edit and remove actions must stay in one vertical protected dock.',
);
requirePattern(
  agendaSource,
  /showExpandedPauseStrip \? \([\s\S]*?styles\.quickCompositionPauseRow[\s\S]*?quickCompositionItem:\s*\{[\s\S]*?paddingRight: IS_WEB \? 124 : 80[\s\S]*?quickCompositionPauseRow:\s*\{[\s\S]*?position: 'relative'[\s\S]*?minHeight: 36[\s\S]*?quickCompositionPauseRowNative:\s*\{[\s\S]*?minHeight: 36/,
  'Composition cards must reserve protected actions while adding a compact footer only for an active pause.',
);
requirePattern(
  agendaSource,
  /quickCompositionDragRail:[\s\S]*?bottom: 0[\s\S]*?width: IS_WEB \? 36 : 40[\s\S]*?borderBottomRightRadius: 17[\s\S]*?backgroundColor: '#EEF2F7'[\s\S]*?zIndex: 14[\s\S]*?quickCompositionDragRailGrip:[\s\S]*?width: '100%'[\s\S]*?height: '100%'[\s\S]*?backgroundColor: 'transparent'/,
  'The composition drag rail must reach the rounded bottom-right corner without a detached translucent grip.',
);
requirePattern(
  agendaSource,
  /const closeQuickSlotModal = useCallback\([\s\S]*?listRef\.current\?\.setNativeProps\?\.\(\{ scrollEnabled: true \}\)[\s\S]*?releaseQuickSlotInteractionLocks\(true\)[\s\S]*?recoverAgendaScrollAfterContextGesture\(\)/,
  'Closing the quick-slot modal must restore native vertical scrolling before deferred cleanup.',
);
requirePattern(
  clientsSource,
  /visible=\{!!durationConfigClient && !durationPickerTarget && !pricePickerServiceId\}[\s\S]*?presentationStyle="overFullScreen"[\s\S]*?statusBarTranslucent[\s\S]*?styles\.customerTimingBackdrop[\s\S]*?height:[\s\S]*?windowHeight - \(IS_ANDROID \? 38 : 76\)/,
  'The personalized timing sheet must use the full native viewport without entering the status-bar area.',
);
requirePattern(
  clientsSource,
  /customerTimingControlsLayout:[\s\S]*?flexDirection: 'row'[\s\S]*?customerTimingControlsLayoutPhased:[\s\S]*?flexDirection: 'column'[\s\S]*?customerTimingControlsLayoutCompact:[\s\S]*?flexDirection: 'column'[\s\S]*?customerTimingFooter:[\s\S]*?borderTopWidth: 1/,
  'Personalized time and price controls must compact safely and keep a protected footer.',
);
requirePattern(
  clientsSource,
  /persistCustomerServiceTiming\(service\.id, null\)[\s\S]*?setDurationPickerTarget\(\{ serviceId: service\.id, field: 'duration' \}\)[\s\S]*?setPricePickerServiceId\(service\.id\)[\s\S]*?persistCustomerServicePrice\(service\.id, null\)/,
  'The redesigned timing sheet must retain duration and price edit/reset behavior.',
);
requirePattern(
  agendaSource,
  /const WEEK_SLOT_PRESS_MOVE_CANCEL_PX = 8;[\s\S]*?const didTouchMove[\s\S]*?Math\.hypot\([\s\S]*?didTouchMove\(event\) \|\| shouldBlockPress\?\.\(\)/,
  'Agenda slot plus controls must cancel a press when the finger turns into a scroll gesture.',
);
requirePattern(
  agendaSource,
  /handleAgendaListScrollBeginDrag[\s\S]*?agendaSlotScrollGestureActiveRef\.current = true[\s\S]*?onScrollEndDrag=\{handleAgendaListScrollEndDrag\}[\s\S]*?onMomentumScrollBegin=\{handleAgendaListMomentumScrollBegin\}[\s\S]*?onMomentumScrollEnd=\{handleAgendaListMomentumScrollEnd\}/,
  'Agenda slot plus controls must remain blocked throughout drag and momentum scrolling.',
);
requirePattern(
  agendaSource,
  /<WeekPlannerSlotTouchable[\s\S]{0,700}shouldBlockPress=\{\s*shouldBlockAgendaSlotPress/,
  'Every tappable Agenda slot must use the shared scroll press guard.',
);
requirePattern(
  agendaSource,
  /styles\.weekPlannerDayColumn,[\s\S]{0,220}isSelectedDay && styles\.weekPlannerDayColumnSelected,[\s\S]{0,180}pendingOnDay > 0 &&[\s\S]{0,100}styles\.weekPlannerDayColumnWithBadge/,
  'A day carrying a notification badge must render above an adjacent selected column.',
);
requirePattern(
  agendaSource,
  /nativeDragOverlayActiveKey\.value =\s*nativeDragOverlayAppointmentKey/,
  'Native Agenda drag must activate the grid-level floating copy on the UI thread.',
);
requirePattern(
  agendaSource,
  /activeDragKey\.value === appointmentKey[\s\S]*?const isVisible = isDragged \|\| isResized;[\s\S]*?opacity: isVisible \? 1[\s\S]*?transform: \[\{ scale: 1 \}\]/,
  'The attached native Agenda copy must remain fully visible above grid siblings while the card itself stays 1:1.',
);
requirePattern(
  agendaSource,
  /nativeDragOverlayX\.value =[\s\S]{0,160}event\.absoluteX[\s\S]{0,100}grabOffsetX\.value[\s\S]{0,100}nativeDragOverlayOriginX\.value[\s\S]{0,160}nativeDragOverlayY\.value =[\s\S]{0,160}event\.absoluteY[\s\S]{0,100}grabOffsetY\.value[\s\S]{0,100}nativeDragOverlayOriginY\.value/,
  'Native Agenda drag must follow the absolute finger position independently from either scroll view.',
);
requirePattern(
  agendaSource,
  /const measuredCard = !IS_WEB \? measure\(appointmentViewRef\) : null;[\s\S]*?measuredCard\?\.pageX[\s\S]*?measuredCard\?\.pageY[\s\S]*?event\.absoluteX - measuredLeft[\s\S]*?event\.absoluteY - measuredTop/,
  'Native Agenda drag must derive its grab offset from fresh window measurements after scrolling.',
);
requirePattern(
  agendaSource,
  /startCardLeftPageX\.value = IS_WEB[\s\S]*?event\.absoluteX - grabOffsetX\.value;[\s\S]*?startCardTopPageY\.value = IS_WEB[\s\S]*?event\.absoluteY - grabOffsetY\.value;/,
  'Native Agenda drag must use the same absolute anchor on gesture start and update so the card cannot slip after attachment.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /\.onBegin\(\(event\) => \{[\s\S]*?if \(!IS_WEB\) return;[\s\S]*?webPointerDownAbsoluteX\.value = event\.absoluteX;[\s\S]*?webPointerDownAbsoluteY\.value = event\.absoluteY;[\s\S]*?webPointerDownLocalX\.value = event\.x;[\s\S]*?webPointerDownLocalY\.value = event\.y;/,
  'Web Agenda drag must capture the real mouse-down before minDistance activation can move the cursor.',
);
requirePattern(
  draggableWeekAppointmentSource,
  /hasWebPointerDown \? webAnchorAbsoluteX : event\.absoluteX[\s\S]*?hasWebPointerDown \? webAnchorAbsoluteY : event\.absoluteY[\s\S]*?const stableTranslationX =[\s\S]*?event\.absoluteX - webPointerDownAbsoluteX\.value[\s\S]*?const stableTranslationY =[\s\S]*?event\.absoluteY - webPointerDownAbsoluteY\.value/,
  'Web Agenda drag must preserve the same absolute mouse-down anchor through movement while native remains on its own branch.',
);
const webResizeAbsoluteDeltaMatches =
  draggableWeekAppointmentSource.match(
    /IS_WEB && webPointerDownReady\.value === 1\s*\? event\.absoluteY - webPointerDownAbsoluteY\.value/g,
  ) ?? [];
if (webResizeAbsoluteDeltaMatches.length < 2) {
  throw new Error(
    'Web Agenda resize must use the same absolute mouse-down delta during movement and release.',
  );
}
if (
  /resizeMode\.value && IS_WEB \? 1\.012/.test(draggableWeekAppointmentSource)
) {
  throw new Error(
    'Web Agenda resize must not scale the card away from the grabbed cursor point.',
  );
}
requirePattern(
  agendaSource,
  /setWebAgendaInteractionCursor[\s\S]*?data-salon-agenda-cursor[\s\S]*?resizeMode\.value \? 'resize-y' : 'grabbing'[\s\S]*?setWebAgendaInteractionCursor\)\(null\)/,
  'Web Agenda interactions must hold the correct cursor globally until release.',
);
requirePattern(
  globalCssSource,
  /:root\[data-salon-agenda-cursor='grabbing'\][\s\S]*?cursor: grabbing !important;[\s\S]*?:root\[data-salon-agenda-cursor='resize-y'\][\s\S]*?cursor: ns-resize !important;/,
  'Safari must retain grabbing and vertical-resize cursors across interaction reflow.',
);
requirePattern(
  agendaSource,
  /const syncWeekHorizontalScrollOnJs =[\s\S]*?if \(weekDragSourceRef\.current\)[\s\S]*?weekDragAutoScrollCompensationX\.value =\s*scrollX - weekDragStartHorizontalScrollXRef\.current;[\s\S]*?const localContentX =[\s\S]*?weekHorizontalScrollPosRef\.current -\s*WEEK_PLANNER_TIME_COL_TOTAL;/,
  'Web Agenda drag must keep the card under the cursor and resolve the current lane while horizontal content scrolls.',
);
requirePattern(
  agendaSource,
  /if \(nextX !== previousX\)[\s\S]*?weekHorizontalScrollPosRef\.current = nextX;[\s\S]*?weekDragAutoScrollCompensationX\.value =\s*nextX - weekDragStartHorizontalScrollXRef\.current;/,
  'Horizontal edge auto-scroll must compensate the dragged card on both web and native without cumulative drift.',
);
requirePattern(
  agendaSource,
  /function NativeWeekGridPreviewOverlay[\s\S]*?const previewAnimatedStyle = useAnimatedStyle[\s\S]*?function NativeWeekDragOverlay[\s\S]*?const dragAnimatedStyle = useAnimatedStyle/,
  'Native Agenda drag and swap previews must use independent components so the finger clone can live outside the grid scroll view.',
);
requirePattern(
  agendaSource,
  /<FlatList[\s\S]*?ListFooterComponent=[\s\S]*?\/\>[\s\S]*?styles\.agendaNativeDragOverlayRoot[\s\S]*?<NativeWeekDragOverlay/,
  'The native Agenda finger clone must render as a root sibling after the scrolling list.',
);
requirePattern(
  agendaSource,
  /agendaNativeDragOverlayRoot:\s*\{[\s\S]*?StyleSheet\.absoluteFillObject[\s\S]*?zIndex: 2147483000[\s\S]*?elevation: 10000/,
  'The native Agenda finger clone root must paint above every appointment and slot.',
);
const nativeWeekGridShellSource = agendaSource.slice(
  agendaSource.indexOf('styles.weekPlannerGridShellNativeOverlay'),
  agendaSource.indexOf('</WeekPlannerScrollContainer>'),
);
if (
  nativeWeekGridShellSource.indexOf('{weekVisibleDates.map') < 0 ||
  nativeWeekGridShellSource.lastIndexOf('<NativeWeekGridPreviewOverlay') <
    nativeWeekGridShellSource.indexOf('{weekVisibleDates.map')
) {
  throw new Error(
    'Native Agenda drag and overlap previews must render after the day columns so appointments cannot paint over them.',
  );
}
requirePattern(
  agendaSource,
  /nativeDragOverlayActiveKey\?\.value ===\s*nativeDragOverlayAppointmentKey[\s\S]*?\? 0[\s\S]*?: 0\.96/,
  'The in-grid native source must hide only while its floating copy owns the drag visual.',
);
requirePattern(
  agendaSource,
  /const isOriginalPlacement = !!\([\s\S]*?targetDate === originalPlacement\.date[\s\S]*?targetTime === originalPlacement\.time[\s\S]*?targetLaneKey === originalPlacement\.laneKey[\s\S]*?returnedToOriginalPosition \|\|[\s\S]*?setWeekSwapPreview\(null\);[\s\S]*?return;/,
  'Returning an Agenda appointment to its original slot must be a silent no-op even when pre-existing overlaps are present.',
);
requirePattern(
  agendaSource,
  /const hasWeekDragOperatorPlacementConflict =[\s\S]*?preview\.hasOverlap[\s\S]*?preview\.displacedTargetHasOverlap[\s\S]*?const hasWeekDragSchedulingConflict =[\s\S]*?hasWeekDragOperatorPlacementConflict\(preview\)/,
  'Agenda drag live feedback must classify only real geometric/operator placement conflicts.',
);
forbidPattern(
  agendaSource.slice(
    agendaSource.indexOf('const getWeekDragLiveConflictLabel'),
    agendaSource.indexOf('const buildWeekDragPreviewVisualKey'),
  ),
  /CLIENTE OCCUPATO/,
  'Owner Agenda drag must not add a customer-busy live badge: customer overlap stays owner-authorized and final validation remains separate.',
);
forbidPattern(
  agendaSource.slice(
    agendaSource.indexOf('const hasWeekDragOperatorPlacementConflict'),
    agendaSource.indexOf('const buildWeekDragPreviewVisualKey'),
  ),
  /poseCoverageWarning|POSA NON COPERTA/,
  'Agenda drag live feedback must leave pose validation to stabilization/save and report only real appointment overlaps.',
);
requirePattern(
  agendaSource,
  /function WeekDragLiveConflictOverlay[\s\S]*?!IS_WEB \|\| !hasWeekDragSchedulingConflict\(preview\)[\s\S]*?<View pointerEvents="none" style=\{styles\.weekDragLiveConflictOverlay\}>[\s\S]*?getWeekDragLiveConflictLabel\(preview\)/,
  'Web Agenda drag must paint a non-interactive live conflict overlay directly on its moving preview.',
);
requirePattern(
  agendaSource,
  /nativeWeekDropPreviewTone\.value = preview\.invalidReason[\s\S]*?hasWeekDragSchedulingConflict\(preview\)[\s\S]*?preview\.targetOperatorNotEnabledForService/,
  'Native Agenda drag must color its live target preview for the same complete scheduling-conflict set.',
);
requirePattern(
  agendaSource,
  /const laneLiveDragConflictPreview =[\s\S]*?weekAppointmentDragActive[\s\S]*?sourceAppointment\.id ===[\s\S]*?<WeekDragLiveConflictOverlay[\s\S]*?laneLiveDragConflictPreview/,
  'Operator-lane Agenda cards must attach the live conflict overlay to the actively dragged source.',
);
requirePattern(
  agendaSource,
  /const liveDragConflictPreview =[\s\S]*?weekAppointmentDragActive[\s\S]*?sourceAppointment\.id ===[\s\S]*?<WeekDragLiveConflictOverlay[\s\S]*?liveDragConflictPreview/,
  'Default Agenda cards must attach the live conflict overlay to the actively dragged source.',
);
requirePattern(
  agendaSource,
  /laneLiveSourcePreview[\s\S]*?renderWeekAppointmentContent\([\s\S]*?laneLiveSourcePreview[\s\S]*?<WeekDragLiveConflictOverlay\s*preview=\{laneDragPreview\}/,
  'Agenda swaps must preserve the live conflict overlay on the destination ghost while the source card is hidden.',
);
const weekDragPreviewVisualKeyUseCount = (
  agendaSource.match(/buildWeekDragPreviewVisualKey\(preview\)/g) ?? []
).length;
if (weekDragPreviewVisualKeyUseCount < 2) {
  throw new Error(
    'Agenda drag and auto-scroll must share the complete visual-preview dedupe key.',
  );
}
const safariSafeNestedExitCount = (
  agendaSource.match(
    /exiting=\{\s*IS_WEB\s*\? undefined\s*:\s*FadeOut\.duration\((?:120|130)\)/g,
  ) ?? []
).length;
if (safariSafeNestedExitCount < 2) {
  throw new Error(
    'Nested Agenda list exits must avoid Reanimated dummy-node removal on Safari web.',
  );
}
requirePattern(
  agendaSource,
  /const returnedToMeasuredOriginalPlacement = !!\([\s\S]*?!IS_WEB[\s\S]*?expectedOriginalLeft[\s\S]*?expectedOriginalTop[\s\S]*?returnedToOriginalPosition \|\|[\s\S]*?returnedToMeasuredOriginalPlacement[\s\S]*?setWeekSwapPreview\(null\);[\s\S]*?return;/,
  'Native Agenda must silently cancel a drop returned to its measured origin even after either scroll view moved.',
);
requirePattern(
  agendaSource,
  /IS_WEB &&[\s\S]{0,80}!useOperatorLaneMode &&[\s\S]{0,80}!!appointmentStart\)\) &&[\s\S]{0,80}styles\.weekPlannerCellWrapAppointmentWeb/,
  'Agenda rows may own the appointment layer only outside operator-lane mode.',
);
requirePattern(
  agendaSource,
  /key=\{`week-cell-\$\{day\.value\}-\$\{slotTime\}`\}[\s\S]{0,180}IS_WEB && useOperatorLaneMode[\s\S]{0,80}'box-none'/,
  'Web operator Agenda rows must be structural-only hit layers.',
);
requirePattern(
  agendaSource,
  /key=\{`week-lane-\$\{day\.value\}-\$\{slotTime\}-\$\{lane\.key\}`\}[\s\S]{0,180}IS_WEB && laneContinuation[\s\S]{0,80}'none'/,
  'Web continuation lanes must pass pointer hits through to the visible appointment card.',
);
requirePattern(
  agendaSource,
  /const nativeLaneRowHasAppointmentStart =\s*!IS_WEB &&\s*useOperatorLaneMode &&\s*operatorLaneDefinitions\.some/,
  'Native Agenda must retain its established row-wide appointment layer.',
);
requirePattern(
  agendaSource,
  /!IS_WEB &&\s*\(!!appointmentStart \|\|\s*nativeLaneRowHasAppointmentStart\)\)[\s\S]*?styles\.weekPlannerCellWrapAppointmentWeb/,
  'Native operator-lane rows with an appointment start must keep the row-wide stacking layer.',
);
forbidPattern(
  agendaSource,
  /zIndex:\s*1000 \+ weekTimeSlots\.length - rowIndex/,
  'Agenda must not place every earlier appointment row above later overlapped cards, otherwise the visible lower handle routes to the wrong drag surface.',
);
requirePattern(
  agendaSource,
  /getWeekAppointmentLeadingOverlapMinutes[\s\S]*?candidateStart < currentStartMinutes[\s\S]*?candidateEnd > currentStartMinutes[\s\S]*?weekAppointmentLeadingOverlap[\s\S]*?SOVRAPP\. \$\{laneAppointmentLeadingOverlapMinutes\} MIN/,
  'A persisted overlap hidden by the later interactive card must be repeated on that visible card without changing pointer ownership.',
);
requirePattern(
  agendaSource,
  /weekPlannerDayPendingBadge:\s*\{[\s\S]*?position: 'absolute',[\s\S]*?top: 3,[\s\S]*?right: 3,[\s\S]*?zIndex: 5000,[\s\S]*?elevation: 5000/,
  'Agenda notification badges must remain fully inside the native drawable viewport while overlaying the day header.',
);
const weekLaneLayoutSource = agendaSource.slice(
  agendaSource.indexOf('const buildWeekOperatorLaneLayoutForDates'),
  agendaSource.indexOf('const weekManualVisibleDays'),
);
if (
  /previousLaneOrderIndex|first\.firstTime\.localeCompare\(second\.firstTime\)/.test(
    weekLaneLayoutSource,
  )
) {
  throw new Error(
    'Agenda lane order must not depend on device-local history or appointment time.',
  );
}
requirePattern(
  weekLaneLayoutSource,
  /if \(firstIsSalonLane !== secondIsSalonLane\)[\s\S]*?firstCanonicalName[\s\S]*?localeCompare\([\s\S]*?secondCanonicalName[\s\S]*?'it'[\s\S]*?first\.key\.localeCompare\(second\.key, 'it'\)/,
  'Agenda lanes must use the same deterministic role, lane-type, operator-name and key order on app and web.',
);
requirePattern(
  contextSource,
  /const isCurrentOwnerSalonWorkspace =[\s\S]*?const resolved = isCurrentOwnerSalonWorkspace[\s\S]*?workspace: salonWorkspaceRef\.current[\s\S]*?: await resolveSalonByCode\(normalizedCode\);/,
  'Owner quick booking must use the already hydrated workspace instead of refetching it before insert.',
);
requirePattern(
  contextSource,
  /const ownerLogoutInFlightRef = React\.useRef<Promise<void> \| null>\(null\);[\s\S]*?const waitForOwnerLogoutCompletion = async \(\) => \{[\s\S]*?const pendingLogout = ownerLogoutInFlightRef\.current;[\s\S]*?await pendingLogout;[\s\S]*?throw error;[\s\S]*?const loginOwnerAccount = async[\s\S]*?await waitForOwnerLogoutCompletion\(\)/,
  'A new owner login must wait for the previous device logout to finish.',
);
requirePattern(
  contextSource,
  /const logoutOwnerAccount = async \(\) => \{[\s\S]*?const existingLogout = ownerLogoutInFlightRef\.current;[\s\S]*?await existingLogout;[\s\S]*?const pendingLogout = \(async \(\) => \{[\s\S]*?await awaitAndroidOwnerLogoutStep\(\s*servicesPersistenceQueueRef\.current,[\s\S]*?await awaitAndroidOwnerLogoutStep\(\s*releaseOwnerMobileAppSession\(\)[\s\S]*?await supabase\.auth\.signOut\(\)[\s\S]*?ownerLogoutInFlightRef\.current = pendingLogout;[\s\S]*?await pendingLogout;/,
  'Owner logout must not leave Supabase sign-out running in the background.',
);
requirePattern(
  contextSource,
  /if \(event === 'SIGNED_OUT'\) \{[\s\S]*?ownerAuthSignoutIntentRef\.current === 'account_switch'[\s\S]*?ownerAuthMobileSessionValidationRef\.current &&[\s\S]*?!ownerExplicitLogoutRef\.current[\s\S]*?return;/,
  'A late SIGNED_OUT event must not cancel a replacement owner login under validation.',
);
requirePattern(
  contextSource,
  /const unlockOwnerAccountWithBiometric = async \(\) => \{[\s\S]*?await waitForOwnerLogoutCompletion\(\);[\s\S]*?sessionEmailBeforeBiometric[\s\S]*?authenticateBiometricIdentity\(\)[\s\S]*?await waitForOwnerLogoutCompletion\(\);[\s\S]*?verifiedSessionEmail[\s\S]*?verifiedSessionEmail === normalizedEmail &&[\s\S]*?!ownerExplicitLogoutRef\.current/,
  'Biometric login must wait for logout and re-read the session after Face ID before using the fast path.',
);
requirePattern(
  contextSource,
  /const OWNER_LOGIN_CACHED_WORKSPACE_READY_TIMEOUT_MS = 250;[\s\S]*?const workspaceReadyTimeoutMs = canReleaseCachedWorkspace[\s\S]*?OWNER_LOGIN_CACHED_WORKSPACE_READY_TIMEOUT_MS[\s\S]*?: OWNER_LOGIN_WORKSPACE_READY_TIMEOUT_MS;[\s\S]*?waitMs\(workspaceReadyTimeoutMs\)/,
  'A returning owner with verified cache must not wait through the first-start workspace timeout.',
);
requirePattern(
  contextSource,
  /await Promise\.all\(\[\s*AsyncStorage\.setItem\(STORAGE_KEYS\.owner_session, authenticatedEmail\),\s*AsyncStorage\.removeItem\(STORAGE_KEYS\.owner_explicit_logout\),\s*\]\)/,
  'Owner re-login must persist the replacement session atomically before exposing it.',
);
requirePattern(
  ownerAccessSource,
  /const resetOwnerEntryVisualState = React\.useCallback\(\(\) => \{[\s\S]*?setPendingOwnerEntryCompletion\(false\);[\s\S]*?setBiometricLoading\(false\);[\s\S]*?setOwnerEntryLoadingSource\(null\);/,
  'Owner biometric failures must share one complete visual reset.',
);
requirePattern(
  ownerAccessSource,
  /const handleBiometricLogin = async \(\) => \{[\s\S]*?biometricAttemptInFlightRef\.current = true;[\s\S]*?try \{[\s\S]*?await unlockOwnerAccountWithBiometric\(\)[\s\S]*?if \(!result\.ok\) \{[\s\S]*?resetOwnerEntryVisualState\(\)[\s\S]*?\} catch \(error\) \{[\s\S]*?resetOwnerEntryVisualState\(\)/,
  'Face ID cancellation and thrown failures must both restore the owner form.',
);
requirePattern(
  ownerAccessSource,
  /ownerCredentialPlainInput:\s*\{[\s\S]*?lineHeight: Platform\.OS === 'ios' \? undefined : 22,[\s\S]*?fontWeight: '400',[\s\S]*?fontStyle: 'normal',[\s\S]*?letterSpacing: 0,/,
  'The plain owner credentials must explicitly reset the biometric mask typography.',
);
requirePattern(
  ownerAccessSource,
  /input:\s*\{[\s\S]*?paddingTop: Platform\.OS === 'ios' \? 0 : 15,[\s\S]*?paddingBottom: Platform\.OS === 'ios' \? 0 : 15,[\s\S]*?height: Platform\.OS === 'ios' \? 58 : undefined,[\s\S]*?lineHeight: Platform\.OS === 'ios' \? undefined : 22,/,
  'Every owner access input must let UIKit center single-line text without a forced iOS baseline.',
);
requirePattern(
  ownerAccessSource,
  /embeddedInput:\s*\{[\s\S]*?paddingTop: Platform\.OS === 'ios' \? 0 : 11,[\s\S]*?paddingBottom: Platform\.OS === 'ios' \? 0 : 11,[\s\S]*?height: Platform\.OS === 'ios' \? 52 : undefined,[\s\S]*?lineHeight: Platform\.OS === 'ios' \? undefined : 20,/,
  'Embedded owner access inputs must keep native iOS baseline centering.',
);
requirePattern(
  ownerAccessSource,
  /inputCompact:\s*\{[\s\S]*?paddingTop: Platform\.OS === 'ios' \? 0 : 13,[\s\S]*?paddingBottom: Platform\.OS === 'ios' \? 0 : 13,[\s\S]*?height: Platform\.OS === 'ios' \? 56 : undefined,[\s\S]*?lineHeight: Platform\.OS === 'ios' \? undefined : 21,/,
  'Compact owner access inputs must keep native iOS baseline centering.',
);
requirePattern(
  ownerAccessSource,
  /<TextInput[\s\S]*?styles\.biometricCredentialMaskInput[\s\S]*?: styles\.ownerCredentialPlainInput[\s\S]*?<PasswordTextInput[\s\S]*?styles\.biometricCredentialMaskInput[\s\S]*?: styles\.ownerCredentialPlainInput/,
  'Both owner credential fields must restore the plain style after Face ID.',
);
if (/owner-(?:email|password)-(?:mask|plain)/.test(ownerAccessSource)) {
  throw new Error(
    'Face ID must not remount owner credential fields and reset the landing scroll position.',
  );
}
requirePattern(
  landingSource,
  /const keepNativeOwnerReloginMounted =\s*Platform\.OS !== 'web' && forceLoggedOutLanding;[\s\S]*?const ownerLoggedOutMarkerBlocksRedirect =\s*Platform\.OS === 'web' && forceLoggedOutLanding;[\s\S]*?const ownerReadyForBackoffice =[\s\S]*?ownerServerSyncReady &&[\s\S]*?!suppressOwnerBackofficeRedirect &&\s*!ownerLoggedOutMarkerBlocksRedirect &&\s*!ownerExplicitLogout;[\s\S]*?if \(!isLoaded && !keepNativeOwnerReloginMounted\)/,
  'A native owner re-login must keep the landing mounted and leave once the authenticated workspace is ready.',
);
requirePattern(
  moduleHeroHeaderSource,
  /router\.push\(Platform\.OS === 'web' \? '\/impostazioni-open' : '\/impostazioni'\)[\s\S]*?function AndroidSettingsButton[\s\S]*?ownerTools\.openSettings\(moduleKey\)[\s\S]*?immediatePress/,
  'Android Settings must use the immediate prepared host; iOS and web retain route navigation.',
);
requirePattern(
  rootLayoutSource,
  /name="\(tabs\)"[\s\S]*?animation: Platform\.OS === 'web' \? 'default' : 'none',[\s\S]*?freezeOnBlur: Platform\.OS === 'android' \? true : undefined,[\s\S]*?name="impostazioni"[\s\S]*?animation: Platform\.OS === 'android' \? 'none' : 'default',/,
  'Opening Settings must freeze the heavy owner tabs and skip the delayed native transition.',
);
requirePattern(
  settingsSource,
  /const IT_SHORT_DATE_FORMATTER = new Intl\.DateTimeFormat[\s\S]*?React\.useMemo\([\s\S]*?getSubscriptionSummary[\s\S]*?InteractionManager\.runAfterInteractions\([\s\S]*?loadSubscriptionDetails[\s\S]*?\}, \[isWeb, salonWorkspace\.id\]\);/,
  'Settings must render before native permission and subscription refinement work starts.',
);
requirePattern(
  ownerLogicalStartNotificationMigrationSource,
  /with timeline_rows as \([\s\S]*?appointment_group_order[\s\S]*?jsonb_agg\([\s\S]*?'processingDurationMinutes'[\s\S]*?string_agg\([\s\S]*?posa '[\s\S]*?into v_booking_timeline, v_timeline_copy[\s\S]*?'bookingTimeline', v_timeline_copy[\s\S]*?'bookingTimelineItems', v_booking_timeline/,
  'Linked appointment updates must send one server-authoritative ordered timeline, including processing time.',
);
requirePattern(
  contextSource,
  /buildOwnerAppointmentNotificationTimeline[\s\S]*?processingDurationMinutes[\s\S]*?formatOwnerAppointmentNotificationTimeline[\s\S]*?posa \$\{item\.processingDurationMinutes\} min[\s\S]*?timeline: nextLinked[\s\S]*?timeline: linkedTimelineEntries/,
  'The rollout fallback must preserve the same complete customer timeline for linked updates.',
);
requirePattern(
  clientFrontendSource,
  /collapseFrontendLogicalBookings[\s\S]*?appointmentGroupId[\s\S]*?COMBO DI SERVIZI[\s\S]*?requestLogicalBookingPanel/,
  'App and web customer drawers must render one timeline card per logical booking group.',
);
requirePattern(
  clientFrontendSource,
  /requestLogicalBookingRootStem[\s\S]*?requestLogicalBookingBranch[\s\S]*?requestLogicalBookingNode[\s\S]*?requestLogicalBookingPhaseTree[\s\S]*?requestLogicalBookingPhaseBranch[\s\S]*?requestLogicalBookingPhaseNode/,
  'Logical customer booking cards must retain the connected branch presentation for services and phases.',
);
requirePattern(
  clientFrontendSource,
  /const syntheticAcceptedRequest = \{[\s\S]*?appointmentGroupId: item\.appointmentGroupId[\s\S]*?appointmentGroupOrder: item\.appointmentGroupOrder[\s\S]*?appointmentGroupSize: item\.appointmentGroupSize[\s\S]*?phaseConfig: item\.phaseConfig/,
  'Owner-created linked appointments must retain their logical group and phase metadata in the customer frontend.',
);
requirePattern(
  clientFrontendSource,
  /applyLiveAppointmentDetailsToAcceptedRequest[\s\S]*?appointmentGroupId:[\s\S]*?linkedAppointment\.appointmentGroupId[\s\S]*?phaseConfig: linkedAppointment\.phaseConfig/,
  'Accepted customer cards must recover live group and phase metadata before logical-booking collapse.',
);
requirePattern(
  clientFrontendSource,
  /logicalBookingOperatorNames[\s\S]*?member\.operatoreNome[\s\S]*?Con \{member\.operatoreNome\.trim\(\)\}[\s\S]*?logicalBookingOperatorSummary/,
  'Grouped customer booking cards must show the operator of every phase and a truthful multi-operator summary.',
);
requirePattern(
  unreadBadgeContextSource,
  /snapshotIdentityKey[\s\S]*?setSnapshotIdentityKey\(activeIdentityKey\)[\s\S]*?snapshotIdentityKey === activeIdentityKey[\s\S]*?getEmptyBadgeSnapshot/,
  'Customer badges must not render a stale count while the active identity is being reconciled.',
);
requirePattern(
  requestsSource,
  /groupedRequests[\s\S]*?appointmentGroupId[\s\S]*?logicalHasComposition[\s\S]*?SERVIZI COLLEGATI[\s\S]*?APPUNTAMENTO COMPLETO/,
  'The backoffice request drawer must render linked rows as one complete appointment with distinct type labels.',
);
requirePattern(
  linkedBookingPushMigrationSource,
  /guard_booking_group_push_batch_v1[\s\S]*?skip_booking_request_push[\s\S]*?queue_final_booking_group_status_v1[\s\S]*?queue_booking_group_status_push_v1/,
  'Linked booking status changes must suppress row pushes and enqueue one final group push.',
);
requirePattern(
  linkedBookingOwnerPushMigrationSource,
  /queue_booking_group_created_owner_push_v1[\s\S]*?booking_group_created[\s\S]*?appointmentGroupId/,
  'A linked booking must enqueue one group-level creation push for the owner.',
);
requirePattern(
  linkedBookingOwnerPushMigrationSource,
  /create_public_booking_dependency_v1[\s\S]*?skip_booking_request_push[\s\S]*?queue_booking_group_created_owner_push_v1/,
  'Dependency writers must suppress per-row owner pushes and enqueue one completed group push.',
);
requirePattern(
  linkedBookingOwnerPushMigrationSource,
  /Apply the same one-booking contract[\s\S]*?skip_booking_request_push[\s\S]*?queue_booking_group_created_owner_push_v1[\s\S]*?create_public_booking_composition_v1/,
  'Composition writers must suppress per-row owner pushes and enqueue one completed group push.',
);
requirePattern(
  groupedClientBadgeMigrationSource,
  /appointment_group_id uuid[\s\S]*?request\.appointment_group_id/,
  'Client unread rows must expose the logical appointment group identity.',
);
requirePattern(
  unreadBadgesSource,
  /appointment_group_id[\s\S]*?return `group:\$\{appointmentGroupId\}`[\s\S]*?id,appointment_group_id,origin,status/,
  'Owner unread badges must count one logical booking group instead of its request rows.',
);
requirePattern(
  ownerTabsLayoutSource,
  /collapseOwnerLogicalBookingEvents[\s\S]*?appointmentGroupId[\s\S]*?countOwnerLogicalBookingEvents[\s\S]*?localAgendaPendingRequestsCount[\s\S]*?countOwnerLogicalBookingEvents[\s\S]*?localOwnerUnreadRequestEventsCount/,
  'Owner tab badges must collapse linked request rows in their live local counts.',
);
requirePattern(
  agendaSource,
  /const appointmentGroupId = item\.appointmentGroupId\?\.trim\(\)[\s\S]*?`group:\$\{appointmentGroupId\}`/,
  'Agenda must count a linked pending booking once per logical group.',
);
requirePattern(
  agendaSource,
  /appointmentGroupDisplayPositionById[\s\S]*?displayPositionById\.set\(item\.id, `\$\{index \+ 1\}\/\$\{members\.length\}`\)/,
  'Agenda must derive its one-based phase number from real ordered group members.',
);
requirePattern(
  agendaSource,
  /const compositionPartNumber =\s*appointmentGroupDisplayPositionById\.get\(appointment\.id\) \|\|\s*persistedGroupPartNumber/,
  'Agenda must prefer the ordered group projection so zero-based linked rows render as 1/N then 2/N.',
);
requirePattern(
  agendaSource,
  /const standalonePhasePartNumber =[\s\S]*?isRenderedFinalPhase\s*\? '2\/2'\s*:\s*'1\/2'[\s\S]*?const phaseDisplayPosition =\s*compositionPartNumber \|\| standalonePhasePartNumber/,
  'Agenda must number the initial and reprise segments of a standalone phased appointment as 1/2 and 2/2.',
);
requirePattern(
  agendaSource,
  /agendaPhaseBadgeColorByAppointmentId[\s\S]*?`group:\$\{appointmentGroupId\}`[\s\S]*?members\.forEach\(\(member\) => \{[\s\S]*?colorByAppointmentId\.set\(member\.id, resolvedColor\)/,
  'Agenda must assign one stable phase badge color to every member of a linked appointment group.',
);
requirePattern(
  agendaSource,
  /const phaseSemanticColor = isOverlappedPhase\s*\? '#DC2626'\s*:\s*phaseBadgeIdentityColor[\s\S]*?const usesServiceIdentityPhaseBadge = !!phasePartLabel/,
  'Agenda pose, reprise, composition, and dependency badges must retain their linked group color unless they are truly overlapping.',
);
requirePattern(
  agendaSource,
  /`POSA \$\{processingDurationMinutes\} MIN`[\s\S]*?`POSA \$\{processingDurationMinutes\}M`/,
  'Agenda pose badges must expose the real processing duration with a compact native fallback.',
);
requirePattern(
  agendaSource,
  /!IS_WEB && styles\.quickBookingModalCardNativeWide[\s\S]*?quickBookingModalCardNativeWide: \{[\s\S]*?height: '100%'[\s\S]*?maxHeight: '100%'/,
  'The native quick-booking popup must use the full safe modal height without changing the web shell.',
);
requirePattern(
  agendaSource,
  /!IS_WEB &&\s*styles\.quickBookingSubmitRequirementNativeIntegrated[\s\S]*?quickBookingSubmitRequirementNativeIntegrated: \{[\s\S]*?borderWidth: 0[\s\S]*?backgroundColor: 'transparent'/,
  'The native quick-booking requirement guide must be compact and integrated without its own outer card.',
);
requirePattern(
  servicePhasesSource,
  /hasExplicitFinalDuration[\s\S]*?explicitFinalDuration > 0[\s\S]*?finalPhaseEnabled/,
  'A zero-minute optional final phase must normalize to disabled before persistence or rendering.',
);
requirePattern(
  servicesSource,
  /finalPhaseEnabled !== false &&[\s\S]*?finalDurationMinutes > 0[\s\S]*?Finale/,
  'Backoffice service cards must omit a disabled or zero-minute final phase.',
);
requirePattern(
  servicesSource,
  /serviceLinkConfig = normalizeServiceLinkConfig[\s\S]*?linkedServiceNames[\s\S]*?Collegato · \$\{linkedServiceNames\.join\('\s*\/\s*'\)\}[\s\S]*?serviceLinkedBadge/,
  'Backoffice service cards must expose the linked dependency and its service name.',
);
requirePattern(
  servicesSource,
  /publicCompositionSettingsExpanded[\s\S]*?renderCompositionsGuideDock[\s\S]*?infoOnRight[\s\S]*?Riduci Composizioni[\s\S]*?publicCompositionSettingsExpanded \? \(/,
  'The shared app and web composition panel must place a collapse control left of Info and hide only its body.',
);
requirePattern(
  servicesSource,
  /publicCompositionSettingsTopRowNative[\s\S]*?publicCompositionSettingsIcon[\s\S]*?publicCompositionApprovalBadgeNative[\s\S]*?numberOfLines=\{1\}[\s\S]*?Composizioni/,
  'The native compositions header must reserve the control cutout before rendering its full-width, single-line title.',
);
requirePattern(
  servicesSource,
  /publicCompositionSettings\.map[\s\S]*?publicCompositionSettingMetaRow[\s\S]*?publicCompositionTypeBadge[\s\S]*?publicCompositionStatusBadge[\s\S]*?publicCompositionSettingName/,
  'Saved composition cards must keep type and status above a dedicated full-width service name.',
);
requirePattern(
  servicesSource,
  /publicCompositionSettings\.map[\s\S]*?Archivia composizione\?[\s\S]*?setPublicCompositionActive\(composition, nextValue\)[\s\S]*?>AUTO<[\s\S]*?togglePublicCompositionSplitOperators/,
  'Saved compositions must use an explicit archive action while keeping automatic assignment as the only switch.',
);
if (/advancedCompositionServices\.map/.test(servicesSource)) {
  throw new Error(
    'Posa, dependency, and combo services must not be duplicated inside the saved compositions panel.',
  );
}
requirePattern(
  clientFrontendSource,
  /key: 'final'[\s\S]*?\.filter\(\(phase\) => phase\.value > 0\)[\s\S]*?frontendServicePhaseTimelineFragment/,
  'App and web customer cards must omit every zero-minute phase from their timeline.',
);
requirePattern(
  sendPushFunctionSource,
  /appointmentGroupId = String\(item\.appointment_group_id[\s\S]*?return `group:\$\{appointmentGroupId\}`/,
  'Client push badges must count one unread item per linked booking group.',
);
if (
  /\(!error && !data\.session\) \|\|[\s\S]{0,180}isSupabaseInvalidLoginError/.test(
    contextSource,
  )
) {
  throw new Error(
    'Invalid owner credentials must stay definitive and must not enqueue a late sign-out retry.',
  );
}

requirePattern(
  clientPortalSource,
  /isServiceAvailableOnline[\s\S]*?composition_only\) !== true/,
  'Composition-only services must remain excluded from every customer portal snapshot.',
);
requirePattern(
  clientPortalSource,
  /const normalizeAppointmentRecord[\s\S]*?appointmentGroupId:[\s\S]*?compositionId:[\s\S]*?dependencyServiceId:[\s\S]*?const normalizeCancellationSource/,
  'Customer appointment snapshots must preserve group, composition, and dependency identities.',
);
requirePattern(
  clientPortalSource,
  /const normalizeRequestRecord[\s\S]*?appointmentGroupId:[\s\S]*?compositionId:[\s\S]*?dependencyServiceId:[\s\S]*?const buildPortalRequestResolutionKey/,
  'Customer request snapshots must preserve group, composition, and dependency identities.',
);
requirePattern(
  compositionOnlyServicesMigrationSource,
  /composition_only boolean not null default false[\s\S]*?create_composition_only_service_v1[\s\S]*?'compositionOnly', true/,
  'Composition-only services must be server-owned and explicitly classified.',
);
requirePattern(
  servicesSource,
  /usageCountByServiceId\[right\.id\][\s\S]*?usageCountByServiceId\[left\.id\][\s\S]*?Solo composizione/,
  'The composition catalog must place real frequently used services first and label private building blocks.',
);
requirePattern(
  agendaSource,
  /quickBookingServiceUsageCountByName[\s\S]*?firstMostUsed = firstUsage > 0 && firstUsage === highestUsageByRole\.get\(firstRole\)[\s\S]*?secondMostUsed = secondUsage > 0 && secondUsage === highestUsageByRole\.get\(secondRole\)[\s\S]*?if \(firstMostUsed !== secondMostUsed\) return firstMostUsed \? -1 : 1;[\s\S]*?const savedOrder = \(first\.ordineCliente \?\? Number\.MAX_SAFE_INTEGER\) -\s*\(second\.ordineCliente \?\? Number\.MAX_SAFE_INTEGER\)/,
  'Agenda must keep most-used services first, then preserve the salon list order.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageMode \|\| item\.soloComposizione !== true/,
  'Agenda must expose private services only in composition mode.',
);
requirePattern(
  frequentCustomersSource,
  /sortCustomersByAppointmentFrequency[\s\S]*?countForCustomer\(right\) - countForCustomer\(left\)[\s\S]*?localeCompare/,
  'Appointment customer selectors must use frequency first with a deterministic fallback.',
);
requirePattern(
  agendaSource,
  /setWeekPhasedTimeEditor\([\s\S]*?pendingRequestId[\s\S]*?setWeekAppointmentDetails\(null\)/,
  'Opening the phased editor must close the generic appointment details layer on web and native.',
);
requirePattern(
  agendaSource,
  /authoritativeLinkedAppointments[\s\S]*?missingOriginalAppointments[\s\S]*?missingDraftAppointments[\s\S]*?completenessChanged/,
  'An active linked reorganization draft must absorb every authoritative phase without dropping its local plan.',
);
requirePattern(
  agendaSource,
  /canonicalTargetLane[\s\S]*?if \(!canonicalTargetLane\)[\s\S]*?return true;[\s\S]*?canonicalTargetOperatorId[\s\S]*?canonicalTargetOperatorName/,
  'A linked phase draft drop must resolve to a visible canonical lane and never fall through to a direct partial move.',
);
requirePattern(
  agendaSource,
  /hasDuplicateDraftIds[\s\S]*?missingExpectedAppointments[\s\S]*?removedPersistedDraftAppointments[\s\S]*?repairedDraft[\s\S]*?Bozza riallineata[\s\S]*?return;/,
  'Stabilizing a linked reorganization must repair and block every incomplete or inconsistent phase plan before persistence.',
);
requirePattern(
  cascadeLinkedDurationMigrationSource,
  /resize_owner_linked_appointment_duration_v1[\s\S]*?apply_owner_linked_reorganization_v1[\s\S]*?update_owner_linked_phased_appointment_times_v1[\s\S]*?apply_owner_linked_reorganization_v1/,
  'Linked duration changes must reuse the existing atomic final-layout validator instead of leaking intermediate positions.',
);
requirePattern(
  contextSource,
  /resize_owner_linked_appointment_duration_v1[\s\S]*?shiftedAppointments[\s\S]*?update_owner_linked_phased_appointment_times_v1/,
  'AppContext must immediately reconcile every linked row returned by atomic resize and phase edits.',
);
requirePattern(
  agendaSource,
  /quickBookingSubmitRequirementSteps:\s*\{[\s\S]*?flexDirection: 'row',[\s\S]*?flexWrap: 'wrap'/,
  'Prenota Slot guidance must stay horizontal and wrap safely on narrow screens.',
);
if (/webIndicatorLeftNudge/.test(ownerTabsLayoutSource)) {
  throw new Error(
    'The web custom bar selection indicator must remain mathematically centered without a manual nudge.',
  );
}
if (
  /compositionDefaultAssignmentCard|toggleCompositionAutoFitDefault/.test(
    servicesSource,
  )
) {
  throw new Error(
    'The obsolete global composition auto-assignment setting must not duplicate per-composition controls.',
  );
}
requirePattern(
  agendaSource,
  /service\.id\.startsWith\('composition:'\)[\s\S]*?return false;[\s\S]*?quickBookingCompositionShortcutGroups[\s\S]*?Composizioni salvate/,
  'Saved compositions must stay out of the atomic catalog and appear only as separate quick-add shortcuts.',
);
requirePattern(
  agendaSource,
  /quickBookingCompositionServiceIdsByLauncherId\.get\(serviceId\)[\s\S]*?explicitServiceIds[\s\S]*?explicitServiceIds\.forEach[\s\S]*?serviceIds: \[\.\.\.new Set\(explicitServiceIds\)\]/,
  'Agenda composition shortcuts must expand into their ordered atomic service IDs.',
);
if (/splitExplicitComboName|findComponentServiceByName/.test(agendaSource)) {
  throw new Error(
    'Composition selection must never infer component identities by splitting a display name.',
  );
}
requirePattern(
  agendaSource,
  /quickBookingSelectableServices[\s\S]*?'soloComposizione' in service[\s\S]*?service\.soloComposizione === true[\s\S]*?compositionSourceKind !== 'derived'[\s\S]*?!compositionSourceServiceId[\s\S]*?!normalizeServicePhaseConfig\(service\.phaseConfig\)[\s\S]*?!normalizeServiceLinkConfig\(service\.linkedServiceConfig\)/,
  'Composition choices must expose only independently authored atomic components, excluding derived, phased, or linked catalog services.',
);
requirePattern(
  agendaSource,
  /isDedicatedCompositionComponent[\s\S]*?item\.compositionSourceKind !== 'derived'[\s\S]*?!item\.compositionSourceServiceId\?\.trim\(\)[\s\S]*?belongsToActiveNamespace[\s\S]*?isCompositionOnlyComposer[\s\S]*?normalizeServiceName\(item\.nome\) === normalizedName/,
  'Duplicate-name validation must compare only independently authored components inside the private namespace and public services inside the catalogue namespace.',
);
requirePattern(
  separatedCompositionNamesMigrationSource,
  /new\.composition_only = true[\s\S]*?service\.composition_only = true[\s\S]*?new\.composition_source_kind, 'custom'\) = 'custom'[\s\S]*?service\.composition_source_kind, 'custom'\) = 'custom'[\s\S]*?create_composition_only_service_v2[\s\S]*?p_source_service_id is null and exists[\s\S]*?service\.composition_only = true[\s\S]*?service\.composition_source_kind, 'custom'\) = 'custom'[\s\S]*?duplicate_service_name_for_role/,
  'The database must allow a dedicated private component to reuse public or legacy-derived names while still rejecting duplicate dedicated components.',
);
if (/composition-component:\$\{/.test(agendaSource)) {
  throw new Error(
    'Composition splitting must never invent synthetic service identities from display names.',
  );
}
requirePattern(
  agendaSource,
  /serviceIds: \[\.\.\.new Set\(explicitServiceIds\)\]/,
  'Saved composition expansion must de-duplicate only explicit stable service IDs.',
);
requirePattern(
  agendaSource,
  /resolveCompositionPhaseConfigForCustomer[\s\S]*?initialDurationMinutes: Math\.max\(5, customerDurationMinutes\)[\s\S]*?processingDurationMinutes/,
  'An atomic work service must keep customer-specific work duration without losing its structural pose.',
);
requirePattern(
  agendaSource,
  /adjustQuickBookingPackageProcessingDuration[\s\S]*?processingDurationMinutes: nextProcessingDurationMinutes[\s\S]*?setQuickBookingPackagePhaseOverrides/,
  'Composition pose controls must update the real phased-service wait instead of an unrelated free pause.',
);
requirePattern(
  agendaSource,
  /initialLabel[\s\S]*?processingLabel[\s\S]*?finalServiceName[\s\S]*?finalDurationMinutes/,
  'A unified phased card must identify phase one, pose, and phase two with their real labels and durations.',
);
requirePattern(
  agendaSource,
  /resolveUnifiedSlashPhaseConfig[\s\S]*?serviceName[\s\S]*?split\('\/'\)[\s\S]*?initialLabel: internalPhaseLabels\[0\][\s\S]*?finalServiceName: internalPhaseLabels\[1\]/,
  'A slash-labelled treatment must use its two semantic labels as internal phases without becoming two service cards.',
);
requirePattern(
  agendaSource,
  /const buildQuickBookingServiceSelection = useCallback[\s\S]*?if \(compositionServiceIds\.length > 0\)[\s\S]*?const selectedPhaseConfig = normalizeServicePhaseConfig\([\s\S]*?const linkedServiceConfig = normalizeServiceLinkConfig[\s\S]*?dependencyId !== selectedPhaseConfig\?\.finalServiceId/,
  'A phased single service must ignore only its duplicated legacy final-service dependency while preserving real dependencies.',
);
requirePattern(
  agendaSource,
  /if \(agendaServiceSaveToCatalog \|\| isEditingCompositionComponent\) \{\s*setServizi\([\s\S]*?closeServicePicker\(\);[\s\S]*?if \(servicePickerTarget !== 'quick'\) \{\s*resetAgendaServiceComposer\(\);/,
  'A newly created private composition component must use the local pending bridge and Realtime instead of synchronously dirtying the whole service catalog or resetting hidden form state.',
);
if (
  /agendaServiceSaveToCatalog \|\| persistAsCompositionOnly/.test(agendaSource)
) {
  throw new Error(
    'RPC-persisted private composition components must not also enter the local catalog persistence queue.',
  );
}
requirePattern(
  agendaSource,
  /openQuickBookingPackageEditor\(serviceId\)[\s\S]*?renderQuickBookingPackageEditor\(\)[\s\S]*?SOLO QUESTA COMPOSIZIONE/,
  'Prenota Slot must expose the current-composition editor without changing the reusable component.',
);
requirePattern(
  agendaSource,
  /openQuickCompositionComponentEditor[\s\S]*?update_composition_only_service_v1[\s\S]*?Componente aggiornato in tutte le composizioni[\s\S]*?Modifica globale/,
  'Private component cards must expose one global edit path shared by native and web.',
);
requirePattern(
  contextSource,
  /const buildServiceMergeKey[\s\S]*?composition-derived[\s\S]*?composition-custom[\s\S]*?catalog/,
  'Service reconciliation must keep catalog, custom composition, and derived component identities separate.',
);
requirePattern(
  updateCompositionOnlyServiceMigrationSource,
  /update_composition_only_service_v1[\s\S]*?security definer[\s\S]*?current_workspace_id\(\)[\s\S]*?workspace_access_allowed\(\)[\s\S]*?composition_only = true[\s\S]*?composition_source_kind, 'custom'\) = 'custom'[\s\S]*?where id = p_service_id[\s\S]*?workspace_id = v_workspace_id/,
  'Global component edits must preserve the stable id and remain scoped to the authenticated workspace.',
);
requirePattern(
  agendaSource,
  /quickBookingTimeSlotOptions[\s\S]*?findQuickBookingCustomerOverlap\(\{[\s\S]*?totalDurationMinutes[\s\S]*?packageForceReason = 'Cliente occupato'/,
  'Composition time choices must recompute customer conflicts across the complete client commitment.',
);
requirePattern(
  agendaSource,
  /const timeValues = quickBookingTimePickerOpen\s*\? buildDisplayTimeSlots\(availabilitySettings, dateValue\)\s*: \[quickSlotDraft\.time\];[\s\S]*?return timeValues\.map/,
  'Prenota Slot must evaluate only the current time while the full time picker is closed.',
);
requirePattern(
  agendaSource,
  /blockedQuickBookingCustomerIdentityKeys[\s\S]*?quickBookingPackageMode[\s\S]*?quickBookingPackagePlan\.totalDurationMinutes[\s\S]*?appointments: appuntamentiNormalizzati/,
  'Composition customer lists must flag overlaps across the complete workspace and full composition duration.',
);
requirePattern(
  agendaSource,
  /blocked[\s\S]*?Occupato · forzabile/,
  'An occupied composition customer must remain selectable with a clear forceable warning.',
);
requirePattern(
  agendaSource,
  /selectedQuickService[\s\S]*?findQuickBookingCustomerOverlap\(\{[\s\S]*?customerOverlap[\s\S]*?'Cliente occupato'/,
  'Single-service time choices must expose a selected-customer overlap as forceable rather than free.',
);
requirePattern(
  agendaSource,
  /create_composition_only_service_v2[\s\S]*?p_phase_config: null[\s\S]*?soloComposizione: persistAsCompositionOnly/,
  'New composition components must persist with a real server ID and without phases.',
);
requirePattern(
  agendaSource,
  /priceValue:[\s\S]*?customerPrice\.customized && !editorApplied[\s\S]*?customerPrice\.price[\s\S]*?quickBookingPackagePriceOverrides\[serviceId\][\s\S]*?customerPrice\.price/,
  'Distinct combo services must keep their own prices while honoring customer overrides.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageMode\s*\? renderQuickBookingPackageSummary\(\)[\s\S]*?placeholder="Cerca in tutti i clienti"/,
  'Prenota Slot must keep the composition summary before customer selection.',
);
requirePattern(
  agendaSource,
  /placeholder="Cerca in tutti i clienti"[\s\S]*?quickBookingPackageMode\s*\? renderQuickBookingPackageScheduleSuggestions\(\)/,
  'Prenota Slot must show customer-specific best fits after customer selection.',
);
requirePattern(
  agendaSource,
  /!selectedQuickCustomer \|\|\s*quickBookingPackageScheduleSuggestions\.length === 0/,
  'Best-fit choices must only be actionable after customer-specific prices and timings are known.',
);
requirePattern(
  agendaSource,
  /primarySelection[\s\S]*?setQuickBookingPackagePhaseOverrides\([\s\S]*?primarySelection\?\.phaseOverrides/,
  'Switching from single booking to composition must preserve the selected service structure and any explicit overrides.',
);
requirePattern(
  agendaSource,
  /suggestionRankLabel[\s\S]*?quickCompositionScheduleSelectedBadge[\s\S]*?Scelto/,
  'Best-fit cards must keep their rank and show Scelto as a separate badge.',
);
requirePattern(
  agendaSource,
  /suggestion\.mode === 'split'[\s\S]*?'Più operatori'[\s\S]*?'Unico operatore'/,
  'Best-fit cards must label single and multi-operator proposals from their actual assignments.',
);
requirePattern(
  agendaSource,
  /stageQuickBookingPackageDraft[\s\S]*?dirty: true[\s\S]*?pendingComposition[\s\S]*?Appoggia in Agenda come bozza/,
  'A complete composition must be placeable as a local Agenda draft.',
);
requirePattern(
  agendaSource,
  /let planError = ''[\s\S]*?planError \|\|= `\$\{draft\.service\.nome\}: nessun incastro[\s\S]*?selectedOperator =[\s\S]*?draft\.eligibleOperators\[0\][\s\S]*?error: planError/,
  'An impossible automatic fit must still build every deterministic provisional card for the local Agenda draft.',
);
requirePattern(
  agendaSource,
  /const quickBookingPackageCanStageDraft = useMemo\([\s\S]*?quickBookingPackagePlan\.items\.length ===\s*quickBookingPackageServiceIds\.length,[\s\S]*?const quickBookingSubmitReady/,
  'Draft placement must depend on complete provisional cards, not on definitive operator-fit validity.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageScheduleSuggestions = useMemo[\s\S]*?!quickBookingPackageMode \|\|\s*!quickBookingPackageSuggestionDraft \|\|[\s\S]*?quickBookingPackageSuggestionPlan\.items\.length < 2[\s\S]*?L’orario scelto non entra:[\s\S]*?Nessuna combinazione disponibile:[\s\S]*?appoggia la composizione come bozza/,
  'A failed current-time fit must still search alternative sequential fits and recommend the always-available draft only when none exist.',
);
requirePattern(
  agendaSource,
  /const showExpandedPauseStrip = pauseControlMinutes > 0[\s\S]*?plannedItem \? \([\s\S]*?!showExpandedPauseStrip \? \([\s\S]*?\+ Posa[\s\S]*?showExpandedPauseStrip \? \([\s\S]*?quickCompositionPauseRow[\s\S]*?quickCompositionPauseEditor/,
  'Composition cards must stay single-row at zero pause and reveal the sequential pause strip only after minutes are added.',
);
requirePattern(
  agendaSource,
  /quickCompositionServiceHeader:\s*\{[\s\S]*?flexDirection: 'row'[\s\S]*?quickCompositionServiceHeaderNative:\s*\{[\s\S]*?flexWrap: 'wrap'[\s\S]*?quickCompositionServiceSummaryNative:\s*\{[\s\S]*?flexBasis: '100%'[\s\S]*?quickCompositionOperatorSelectorWrapNative:\s*\{[\s\S]*?flex: 1[\s\S]*?quickCompositionPauseEditorNative:\s*\{[\s\S]*?flexDirection: 'column'[\s\S]*?quickCompositionPauseCopyNative:\s*\{[\s\S]*?width: '100%'[\s\S]*?quickCompositionPauseControlsNative:\s*\{[\s\S]*?width: '100%'[\s\S]*?justifyContent: 'flex-end'/,
  'Web must keep its compact row while iOS and Android place readable pause copy above compact controls.',
);
requirePattern(
  agendaSource,
  /quickCompositionOperatorMenuPortal[\s\S]*?zIndex: 10000/,
  'The web per-component operator menu must use the global high-layer portal.',
);
requirePattern(
  agendaSource,
  /const quickBookingPackageRender =[\s\S]*?renderQuickBookingPackageSummary\(\)[\s\S]*?quickBookingPackageRender\?\.operatorPicker[\s\S]*?quickCompositionOperatorPickerOverlay:\s*\{[\s\S]*?\.\.\.StyleSheet\.absoluteFillObject,[\s\S]*?zIndex: 70/,
  'The native per-component operator picker must stay inside the existing booking Modal as a high absolute overlay.',
);
requirePattern(
  agendaSource,
  /onRequestClose=\{\(\) => \{\s*if \(quickBookingPackageRender\?\.operatorPicker\) \{\s*setQuickBookingPackageOperatorMenuServiceId\(null\);\s*return;[\s\S]*?closeQuickSlotModal\(\);/,
  'Android back must close the embedded operator picker before closing Prenota Slot.',
);
requirePattern(
  agendaSource,
  /const selectQuickBookingMode = useCallback\([\s\S]*?setQuickBookingPackageOperatorMenuServiceId\(null\);[\s\S]*?const resetQuickSlotModalDraftState = useCallback\(\(\) => \{[\s\S]*?setQuickBookingPackageOperatorMenuServiceId\(null\);/,
  'Changing mode or closing Prenota Slot must clear the embedded operator picker state.',
);
requirePattern(
  agendaSource,
  /const openQuickSlotModal = useCallback\([\s\S]*?if \(!IS_WEB\) \{[\s\S]*?setQuickBookingPackageOperatorMenuServiceId\(null\);[\s\S]*?const closeQuickSlotModal = useCallback\([\s\S]*?quickSlotModalVisibleRef\.current = false;\s*setQuickBookingPackageOperatorMenuServiceId\(null\);/,
  'Native Prenota Slot must clear a stale operator picker both before rapid reopen and during immediate close.',
);
requirePattern(
  agendaSource,
  /quickBookingPackageOperatorMenuServiceId &&[\s\S]*?!agendaServices\.some\([\s\S]*?!quickBookingPackagePlan\.items\.some\([\s\S]*?operatori\.length === 0[\s\S]*?setQuickBookingPackageOperatorMenuServiceId\(null\);/,
  'The embedded operator picker must clear itself when its service, plan item, or operator options disappear.',
);
requirePattern(
  agendaSource,
  /<\/KeyboardAvoidingView>\s*\{quickBookingPackageRender\?\.operatorPicker \?\? null\}\s*<NativeDatePickerModal/,
  'The native operator picker must cover the complete Prenota Slot overlay instead of only its inner card.',
);
requirePattern(
  agendaSource,
  /style=\{styles\.weekAppointmentDetailsBackdrop\}[\s\S]*?onPress=\{\(\) => \{\s*if \(quickBookingPackageRender\?\.operatorPicker\) \{\s*setQuickBookingPackageOperatorMenuServiceId\(null\);\s*return;\s*\}\s*closeQuickSlotModal\(\);/,
  'A tap outside the native operator picker must close only that picker, not the whole booking popup.',
);
if (
  /nativeOperatorPickerServiceId[\s\S]{0,6000}<Modal[\s\S]{0,400}quickCompositionOperatorPickerOverlay/.test(
    agendaSource,
  )
) {
  throw new Error(
    'The native operator picker must not mount a second native Modal inside Prenota Slot.',
  );
}
requirePattern(
  agendaSource,
  /weekAppointmentPremiumWebReducedStatusPill,[\s\S]*?usesServiceIdentityPhaseBadge[\s\S]*?backgroundColor: phaseBadgeTone\.backgroundColor,[\s\S]*?borderColor: phaseBadgeTone\.borderColor/,
  'Compact and tall cards from the same appointment group must use the same semantic phase badge tone.',
);
requirePattern(
  agendaSource,
  /showGlobalComponentEdit &&\s*styles\.quickServiceCardTitleWebWithEdit[\s\S]*?quickServiceCardTitleWebWithEdit:\s*\{[\s\S]*?paddingRight:\s*66/,
  'Web composition component titles must reserve a dedicated column for edit and delete controls.',
);
requirePattern(
  agendaSource,
  /quickServiceGlobalActions[\s\S]*?pencil-outline[\s\S]*?trash-outline[\s\S]*?requestDeleteQuickCompositionComponent[\s\S]*?quickServiceGlobalEditButton:\s*\{[\s\S]*?width:\s*27[\s\S]*?quickServiceGlobalDeleteButton:\s*\{[\s\S]*?width:\s*27/,
  'Composition components must expose compact round edit and delete controls without covering the name.',
);
requirePattern(
  agendaSource,
  /quickBookingComponentRoleGroups = useMemo[\s\S]*?quickBookingServiceSearchResults\.forEach[\s\S]*?current\.items\.push\(service\)[\s\S]*?return Array\.from\(groups\.values\(\)\)[\s\S]*?quickComponentRoleGroupTitle[\s\S]*?Più usati prima[\s\S]*?openQuickAgendaServiceComposer\(\s*group\.roleLabel/,
  'Composition components must be grouped by profession and keep the most-used services first inside each group.',
);
requirePattern(
  agendaSource,
  /const quickBookingComposerRequiredRole = agendaServiceForcedRoleInput[\s\S]*?Nuovo componente con mestiere selezionabile[\s\S]*?\+ Nuovo componente[\s\S]*?git-branch-outline[\s\S]*?Aggiungi qui/,
  'The global component action must keep profession editable while branch actions are visually distinct and role-locked.',
);
requirePattern(
  agendaSource,
  /requestDeleteQuickCompositionComponent[\s\S]*?saveServicesPersisted\(nextServices,\s*\{[\s\S]*?deletedService:[\s\S]*?compositionOnly:\s*true[\s\S]*?Eliminazione confermata dal server/,
  'Deleting a private component must use the exact server deletion contract and reconcile saved compositions.',
);
requirePattern(
  contextSource,
  /const writeRequested =\s*explicitlyChangedServiceIds !== null[\s\S]*?explicitlyCreatedServiceIds\.has\(item\.__requestedServiceId\)[\s\S]*?return true;[\s\S]*?return false;[\s\S]*?Eliminazione componente non confermata dal server[\s\S]*?recentlyDeletedServiceKeysRef\.current\.set/,
  'Background service synchronization must be read-only by default; only an explicitly scoped creation may insert, and deletion must verify server absence.',
);
requirePattern(
  deletedCompositionComponentGuardMigrationSource,
  /block_deleted_composition_component_resurrection_v1[\s\S]*?deleted_service_recovery_rows[\s\S]*?deleted_composition_component_tombstoned[\s\S]*?salonpro\.explicit_composition_component_create[\s\S]*?create_composition_only_service_v2/,
  'The server must tombstone deleted private components while still allowing an explicit authenticated recreation.',
);
requirePattern(
  agendaSource,
  /addCustomerFromQuickBooking = useCallback\(\s*async[\s\S]*?createClientePersisted\([\s\S]*?setQuickBookingCustomerId\(result\.customer\.id\)[\s\S]*?addCustomerFromAgenda = useCallback\(\s*async[\s\S]*?createClientePersisted\([\s\S]*?Cliente confermato dal server/,
  'Every inline Agenda customer creator must wait for authoritative server persistence before reporting success.',
);
requirePattern(
  contextSource,
  /const customerId = createOwnerCustomerId\(\)[\s\S]*?const rpcPayload = \{[\s\S]*?p_workspace_id: workspaceId[\s\S]*?p_customer_id: customerId[\s\S]*?p_birthday: normalizedCustomer\.birthday[\s\S]*?\.rpc\('create_owner_customer_v4', rpcPayload\)[\s\S]*?rpcResult\?\.ok[\s\S]*?rpcResult\.workspace_id[\s\S]*?!insertedCustomer \|\| !isUuid\(insertedCustomer\.id\)[\s\S]*?insertedCustomer\.id\.trim\(\)\.toLowerCase\(\) !== customerId[\s\S]*?const persistedCustomer: Cliente[\s\S]*?markRecentlyUpdatedCustomer\(\{[\s\S]*?snapshot: persistedCustomer[\s\S]*?clientiRef\.current = nextClienti;[\s\S]*?setClienti\(nextClienti\)[\s\S]*?await deletedAliasesPersistence;[\s\S]*?return \{ ok: true as const, customer: persistedCustomer \}/,
  'Customer creation must use one caller-generated canonical UUID, commit it to the refresh guard, and persist tombstone removal before reporting success.',
);
requirePattern(
  contextSource,
  /createClientePersistedInFlightRef[\s\S]*?current\.get\(operationKey\)[\s\S]*?createClientePersistedOnce\(customer\)\.finally[\s\S]*?current\.set\(operationKey, operation\)/,
  'Every +Cliente surface must share one single-flight authority against double taps.',
);
requirePattern(
  contextSource,
  /const rpcPayload = \{[\s\S]*?invokeCreateCustomerRpc[\s\S]*?retriedAmbiguousResponse = false[\s\S]*?shouldRetryAmbiguousOwnerCustomerCreate[\s\S]*?retriedAmbiguousResponse = true[\s\S]*?rpcResponse = await invokeCreateCustomerRpc\(\)[\s\S]*?const \{ data, error \} = rpcResponse/,
  'Customer creation must retry an ambiguous response at most once with the identical retry-safe RPC payload.',
);
requirePattern(
  agendaSource,
  /const \[clienteId, setClienteId\] = useState\(''\)[\s\S]*?clienteId[\s\S]*?clienti\.find\(\(item\) => item\.id === clienteId\)[\s\S]*?setClienteId\(result\.customer\.id\)[\s\S]*?const selectedCustomer = clienteSelezionatoRecord[\s\S]*?setClienteId\(''\)/,
  'The standalone Agenda +Cliente path must preserve the canonical UUID through appointment creation instead of resolving an omonym by name.',
);
requirePattern(
  ownerCustomerCreationMigrationSource,
  /add column if not exists birthday date[\s\S]*?create_owner_customer_v2[\s\S]*?p_workspace_id uuid[\s\S]*?auth\.uid\(\) is null[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?member\.user_id = auth\.uid\(\)[\s\S]*?for update[\s\S]*?duplicate_email_phone[\s\S]*?delete from public\.customer_deletion_tombstones[\s\S]*?insert into public\.customers[\s\S]*?birthday[\s\S]*?'ok', true[\s\S]*?'workspace_id', v_workspace_id/,
  'The owner customer RPC must authorize and lock the exact open workspace, reject duplicate identities, clear explicit recreation tombstones, persist birthday, and return the canonical workspace and row.',
);
requirePattern(
  idempotentOwnerCustomerCreationMigrationSource,
  /create_owner_customer_v4[\s\S]*?p_customer_id uuid[\s\S]*?auth\.uid\(\) is null[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?for update[\s\S]*?where customer\.id = p_customer_id[\s\S]*?v_existing_customer\.workspace_id = v_workspace_id[\s\S]*?'replayed', true[\s\S]*?'customer_id_conflict'[\s\S]*?'duplicate_email_phone'[\s\S]*?delete from public\.customer_deletion_tombstones[\s\S]*?insert into public\.customers \([\s\S]*?id,[\s\S]*?values \([\s\S]*?p_customer_id[\s\S]*?'replayed', false/,
  'Only the exact caller-generated customer UUID may replay; a later identical payload with a new UUID must remain an explicit identity conflict.',
);
requirePattern(
  contextSource,
  /const hydrationRevision =[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current !==[\s\S]*?hydrationRevision[\s\S]*?const addDeletedCustomerAliases[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current \+= 1[\s\S]*?const removeDeletedCustomerAliases[\s\S]*?recentlyDeletedCustomerMutationRevisionRef\.current \+= 1/,
  'A stale tombstone hydration must not overwrite a later customer create/delete mutation.',
);
requirePattern(
  clearableTextInputSource,
  /keepClearControlMounted[\s\S]*?reservesClearSpace = keepClearControlMounted \|\| clearControlEnabled[\s\S]*?rendersClearControl = keepClearControlMounted \|\| clearControlEnabled[\s\S]*?pointerEvents=\{clearControlEnabled \? 'box-none' : 'none'\}[\s\S]*?clearButtonSlotHidden/,
  'Customer inputs must reserve and mount the clear-control geometry from the first render.',
);
if (
  (agendaSource.match(/keepClearControlMounted/g) ?? []).length < 5 ||
  (agendaSource.match(/<QuickCustomerComposerForm\b/g) ?? []).length < 2
) {
  throw new Error(
    'Both Agenda customer composers must keep every clear-control slot mounted.',
  );
}
if ((clientsSource.match(/keepClearControlMounted/g) ?? []).length < 10) {
  throw new Error(
    'Client create and edit forms must keep every clear-control slot mounted.',
  );
}
if (
  /onPress=\{addCustomerFromQuickBooking\}[\s\S]{0,260}disabled=\{[^}]*canSubmitQuickCustomerRequired/.test(
    agendaSource,
  ) ||
  /onPress=\{addCustomerFromAgenda\}[\s\S]{0,260}disabled=\{[^}]*canSubmitAgendaCustomerRequired/.test(
    agendaSource,
  )
) {
  throw new Error(
    'Customer create buttons must stay tappable so their validated handlers can explain incomplete or conflicting data.',
  );
}
requirePattern(
  clientsSource,
  /const CustomerCreatorForm = React\.memo\([\s\S]*?styles\.primaryButtonInline[\s\S]{0,420}onPress=\{\(\) => void onSubmit\(draftRef\.current\)\}\s*disabled=\{saving \|\| loadingInit\}/,
  'The isolated Clienti create action must submit its current draft for validation and disable only during an active save.',
);
requirePattern(
  agendaSource,
  /const isAgendaForegroundOverlayOpen = Boolean\([\s\S]*?quickSlotModalShellDraft[\s\S]*?weekAppointmentDetails[\s\S]*?availabilityImpactAction[\s\S]*?webWeekDragConfirmation[\s\S]*?const weekStickyOperatorHeaderContent =\s*!isAgendaForegroundOverlayOpen &&/,
  'The sticky operator and profession row must yield globally to every Agenda popup and picker.',
);
{
  const stageStart = agendaSource.indexOf(
    'const stageQuickBookingPackageDraft = useCallback',
  );
  const stageEnd = agendaSource.indexOf(
    'const confirmQuickSlotBooking = useCallback',
    stageStart,
  );
  const stageSource = agendaSource.slice(stageStart, stageEnd);
  if (
    stageStart < 0 ||
    stageEnd < 0 ||
    stageSource.includes('createOwnerAppointmentGroupForSalon')
  ) {
    throw new Error(
      'Placing a composition draft must stay local and must not create or notify an appointment group.',
    );
  }
}
requirePattern(
  agendaSource,
  /if \(draft\.pendingComposition\)[\s\S]*?createOwnerAppointmentGroupForSalon[\s\S]*?Stabilizza comunque/,
  'Only draft stabilization may create the appointment group and trigger its client lifecycle.',
);
if (
  /quickBookingScrollRef\.current\?\.scrollTo\(\{\s*y:\s*0\b/.test(agendaSource)
) {
  throw new Error(
    'Prenota Slot must never schedule a programmatic scroll-to-top on its outer native scroll.',
  );
}
if (
  /quickCustomerComposerScrollRef\.current\?\.scrollTo\?\.\(\{\s*y:\s*0\b/.test(
    agendaSource,
  )
) {
  throw new Error(
    'The nested customer composer inside Prenota Slot must not restore an automatic scroll-to-top.',
  );
}
requirePattern(
  agendaSource,
  /cancelQuickBookingScrollRestore\(\);[\s\S]*?quickBookingDesiredScrollOffsetRef\.current = 0;[\s\S]*?quickBookingScrollMetricsRef\.current = \{[\s\S]*?offsetY: 0,[\s\S]*?\};/,
  'A new Prenota Slot session must reset only its scroll authority and metrics, without moving a mounted scroll.',
);
requirePattern(
  agendaSource,
  /const restoreQuickBookingUserScrollPosition = useCallback[\s\S]*?const targetOffset = Math\.min\(desiredOffset, maxOffset\);[\s\S]*?if \(targetOffset < 0\.5\) return;[\s\S]*?quickBookingScrollRef\.current\?\.scrollTo\(\{[\s\S]*?y: targetOffset,[\s\S]*?animated: false/,
  "Native Prenota Slot must restore only the user's positive scroll offset after transient layout clamps.",
);
requirePattern(
  agendaSource,
  /ref=\{quickBookingScrollRef\}[\s\S]*?keyboardDismissMode=\{IS_WEB \? 'interactive' : 'none'\}[\s\S]*?onScrollBeginDrag=\{[\s\S]*?quickBookingUserScrollActiveRef\.current = true;[\s\S]*?onScroll=\{[\s\S]*?if \(quickBookingUserScrollActiveRef\.current\)[\s\S]*?onScrollEndDrag=\{[\s\S]*?scheduleQuickBookingScrollRestore\(\);[\s\S]*?onContentSizeChange=\{[\s\S]*?scheduleQuickBookingScrollRestore\(\);[\s\S]*?onLayout=\{[\s\S]*?scheduleQuickBookingScrollRestore\(\);/,
  'Prenota Slot must preserve a user-authoritative offset while native content, viewport, and keyboard geometry change.',
);
requirePattern(
  agendaSource,
  /const maxOffset = Math\.max\([\s\S]*?quickBookingDesiredScrollOffsetRef\.current < 0\.5 \|\|\s*\(maxOffset > 0\.5 &&\s*Math\.abs\(metrics\.offsetY - expectedOffset\) < 1\.5\)/,
  'Prenota Slot must not adopt a synthetic zero offset while native content geometry is temporarily collapsed.',
);
for (const [startMarker, endMarker] of [
  [
    'const selectQuickBookingService = useCallback',
    'const selectQuickBookingMode = useCallback',
  ],
  [
    'const selectQuickBookingMode = useCallback',
    'const resetQuickBookingPackage = useCallback',
  ],
  ['const resetQuickBookingPackage = useCallback', 'useEffect(() => {'],
  [
    'const toggleQuickBookingPackageService = useCallback',
    'const moveQuickBookingPackageService = useCallback',
  ],
  [
    'const openQuickBookingPackageEditor = useCallback',
    'const resetQuickBookingPackageEditor = useCallback',
  ],
]) {
  const start = agendaSource.indexOf(startMarker);
  const end = agendaSource.indexOf(endMarker, start);
  const interactionSource = agendaSource.slice(start, end);
  const dismissCount = (interactionSource.match(/Keyboard\.dismiss\(\)/g) ?? [])
    .length;
  const webGuardCount = (interactionSource.match(/if \(IS_WEB\)/g) ?? [])
    .length;
  if (start < 0 || end < 0 || dismissCount !== webGuardCount) {
    throw new Error(
      `Native Prenota Slot interactions must not dismiss the keyboard and reflow the outer scroll: ${startMarker}`,
    );
  }
}
requirePattern(
  agendaSource,
  /const clampAgendaComposerScrolls = useCallback\(\(\) => \{[\s\S]*?if \(IS_WEB\) \{\s*clampComposerScroll\(quickBookingScrollRef, quickBookingScrollMetricsRef\);\s*\}[\s\S]*?clampComposerScroll\(\s*quickCustomerComposerScrollRef,[\s\S]*?clampComposerScroll\(\s*agendaCustomerComposerScrollRef/,
  'Native Prenota Slot must never clamp its outer scroll after a component selection while nested composer clamps remain active.',
);
if (/scrollQuickBooking(?:Field|Node)/.test(agendaSource)) {
  throw new Error(
    'Prenota Slot search focus must not schedule programmatic vertical jumps.',
  );
}
requirePattern(
  agendaSource,
  /quickBookingHighestUsageCountByRole = useMemo[\s\S]*?quickBookingHighestUsageCountByRole\.get\(serviceRoleKey\)[\s\S]*?<HapticTouchableFastRegion>[\s\S]*?ref=\{quickBookingScrollRef\}/,
  'Prenota Slot must reuse service-role usage totals and enable fast interaction delivery without changing its actions.',
);
requirePattern(
  agendaSource,
  /const findConflictingAppointment = useCallback\([\s\S]*?const appointmentPool = \[[\s\S]*?\.\.\.appuntamenti,[\s\S]*?\.\.\.activeAgendaRequestAppointments,[\s\S]*?\],[\s\S]*?\[\s*activeAgendaRequestAppointments,[\s\S]*?agendaServices,[\s\S]*?appuntamenti,[\s\S]*?availabilitySettings,/,
  'Conflict lookup must use real Agenda dependencies instead of changing identity on unrelated popup renders.',
);
if (/findConflictingAppointmentImplRef/.test(agendaSource)) {
  throw new Error(
    'Conflict lookup must not mutate an implementation ref during concurrent rendering.',
  );
}
requirePattern(
  agendaSource,
  /quickBookingPackageSuggestionsActive = !!\([\s\S]*?quickBookingPackageMode &&[\s\S]*?selectedQuickCustomer &&[\s\S]*?quickBookingPackagePlan\.items\.length >= 2[\s\S]*?quickBookingPackageSuggestionSourcePlan =[\s\S]*?quickBookingPackageSuggestionsActive[\s\S]*?: EMPTY_QUICK_BOOKING_PACKAGE_PLAN;[\s\S]*?useDeferredValue\(\s*quickBookingPackageSuggestionSourceCustomer/,
  'Single-service and pre-customer composition taps must not schedule suggestion-only deferred renders.',
);
requirePattern(
  agendaSource,
  /quickBookingSearchResults = useMemo[\s\S]*?\.map\(\(entry\) => entry\.item\)[\s\S]*?\.slice\(0, 40\)/,
  'Native customer search must rank the whole directory without mounting an unbounded result list.',
);
requirePattern(
  agendaSource,
  /const selectedQuickBookingOperator = useMemo\([\s\S]*?quickBookingCompatibleOperators\[0\][\s\S]*?const selectQuickBookingOperator = useCallback/,
  'The default quick-booking operator must remain derived without a second synchronization render.',
);
if (
  /const nextOperator =[\s\S]*?setQuickBookingOperatorId\(nextOperator\.id\)/.test(
    agendaSource,
  )
) {
  throw new Error(
    'Prenota Slot must not copy its already-derived default operator into state after the first render.',
  );
}
requirePattern(
  agendaSource,
  /quickBookingPackageMode[\s\S]*?seleziona almeno 2 servizi[\s\S]*?seleziona il servizio[\s\S]*?seleziona l’operatore[\s\S]*?seleziona il cliente/,
  'Single and composition booking must expose a stable ordered completion checklist.',
);
requirePattern(
  servicesSource,
  /service_composition_items[\s\S]*?setPublicCompositionSettings[\s\S]*?items: itemsByComposition\.get\(item\.id\) \?\? \[\]/,
  'Services must load saved composition items before exposing quick-add shortcuts.',
);
requirePattern(
  servicesSource,
  /toggleCompositionShortcut[\s\S]*?Array\.from\(new Set\(\[\.\.\.current, \.\.\.shortcutIds\]\)\)/,
  'A quick-add shortcut must append de-duplicated atomic services instead of creating a combo card.',
);
requirePattern(
  customerCommunicationsModalSource,
  /fetchCustomerCommunicationTemplates[\s\S]*?saveCustomerCommunicationTemplate[\s\S]*?deleteCustomerCommunicationTemplate[\s\S]*?savedTemplates\.map[\s\S]*?onLongPress[\s\S]*?webContextMenuAction[\s\S]*?Elimina il modello[\s\S]*?Icona del modello[\s\S]*?Salva come modello rapido/,
  'Customer communications must load, save, edit, and delete icon-aware salon templates through native long press and the web context menu.',
);
requirePattern(
  customerCommunicationsSource,
  /list_owner_customer_communication_templates[\s\S]*?save_owner_customer_communication_template[\s\S]*?delete_owner_customer_communication_template/,
  'Customer communication templates must use the authenticated server contract.',
);
requirePattern(
  clientFrontendSource,
  /salonCommunicationsCurrentMonth[\s\S]*?salonCommunicationsArchiveByYear[\s\S]*?Archivio comunicazioni[\s\S]*?yearGroup\.months\.map[\s\S]*?salonCommunicationArchiveMonthsExpanded/,
  'Client communications must keep the current month separate from a year-and-month archive.',
);
requirePattern(
  clientFrontendSource,
  /salonCommunicationsAlignmentContainer[\s\S]*?renderSalonCommunicationsSection\(\)[\s\S]*?requestSectionsContainer[\s\S]*?requestOverviewRow/,
  'The salon communications card must share the same frontend alignment container as the booking overview cards.',
);
requirePattern(
  clientFrontendSource,
  /targetMonthKey[\s\S]*?targetMonthKey < currentArchiveMonthKey[\s\S]*?setSalonCommunicationsArchiveExpanded\(true\)[\s\S]*?\[targetMonthKey\]: true/,
  'Opening an older communication from a notification must reveal its archived month.',
);
requirePattern(
  customerCommunicationTemplatesMigrationSource,
  /customer_communication_templates[\s\S]*?workspace_id uuid not null[\s\S]*?current_workspace_id\(\)[\s\S]*?workspace_access_allowed\(\)[\s\S]*?communication_template_limit_reached/,
  'Saved communication templates must be isolated, authorized, validated, and limited per salon.',
);
requirePattern(
  deleteCustomerCommunicationTemplatesMigrationSource,
  /customer_communication_templates_icon_allowed[\s\S]*?umbrella[\s\S]*?storefront[\s\S]*?save_owner_customer_communication_template[\s\S]*?p_template_id uuid[\s\S]*?delete_owner_customer_communication_template[\s\S]*?auth\.uid\(\)[\s\S]*?current_workspace_id\(\)[\s\S]*?workspace_access_allowed\(\)[\s\S]*?where id = p_template_id[\s\S]*?workspace_id = v_workspace_id/,
  'Communication template icons, exact edits, and deletions must be validated and scoped to the authenticated salon.',
);
requirePattern(
  servicesSource,
  /getAutomaticRoleAccentColor[\s\S]*?const pickAutomaticRoleColor = \(roleName\?: string\) =>[\s\S]*?getAutomaticRoleAccentColor\(roleName\)/,
  'Automatic profession colors must be derived deterministically from the normalized role identity.',
);
if (
  /pickRandomAutomaticRoleColor|Math\.random\(\) \* palette\.length/.test(
    servicesSource,
  )
) {
  throw new Error(
    'Profession colors must never be regenerated from a random palette choice.',
  );
}
requirePattern(
  contextSource,
  /const protectedSnapshot = \{[\s\S]*?snapshot\.serviceCardColorOverrides === undefined[\s\S]*?serviceCardColorOverridesRef\.current[\s\S]*?snapshot\.roleCardColorOverrides === undefined[\s\S]*?roleCardColorOverridesRef\.current[\s\S]*?publishClientPortalSnapshot\(protectedSnapshot\)/,
  'Partial portal publishes must preserve the saved service and profession colors.',
);
requirePattern(
  contextSource,
  /payload\.serviceCardColorOverrides === undefined[\s\S]*?serviceCardColorOverridesRef\.current[\s\S]*?payload\.roleCardColorOverrides === undefined[\s\S]*?roleCardColorOverridesRef\.current/,
  'Partial owner snapshot writes must preserve the saved service and profession colors.',
);
requirePattern(
  contextSource,
  /La RPC ha confermato l'eliminazione[\s\S]*?updateOwnerFinancialAppointmentsForWorkspace\([\s\S]*?current\.filter\(\(item\) => !isCancelledAppointment\(item\)\)/,
  'A confirmed owner cancellation must prune the authoritative financial mirror before it can rebuild the owner snapshot.',
);
requirePattern(
  contextSource,
  /Il portale pubblico è una proiezione[\s\S]*?ownerSnapshotRoleOverrides[\s\S]*?localOverrides: protectedOwnerRoleOverrides/,
  'Public portal refreshes must not override the owner profession-color authority.',
);
requirePattern(
  snapshotResurrectionAndColorMigrationSource,
  /overlay_canonical_appointment_timing_v1[\s\S]*?entries\.persisted_id is null[\s\S]*?or appointment\.id is not null/,
  'Derived snapshots must discard deleted persisted appointment IDs instead of resurrecting them.',
);
requirePattern(
  snapshotResurrectionAndColorMigrationSource,
  /protect_client_portal_owner_card_colors_v1[\s\S]*?owner_app_snapshots[\s\S]*?new\.role_card_color_overrides := v_role_colors[\s\S]*?sync_owner_card_colors_to_client_portal_v1/,
  'Owner card colors must remain authoritative across portal publishes from web, iOS, Android, and stale clients.',
);
requirePattern(
  clientPortalSource,
  /const appointmentGroupId =[\s\S]*?appointmentGroupOrder: appointmentGroupId[\s\S]*?appointmentGroupSize: appointmentGroupId/,
  'Portal appointments must discard group order and size when no group identity exists.',
);
requirePattern(
  clientPortalSource,
  /const canonicalizePortalAppointments =[\s\S]*?canonicalByIdentity[\s\S]*?\.sort\([\s\S]*?appuntamenti: Array\.isArray\(data\.appuntamenti\)[\s\S]*?canonicalizePortalAppointments[\s\S]*?const sanitizedAppointments = canonicalizePortalAppointments/,
  'Fetched and published portal appointments must share one deterministic dedupe and order contract.',
);
requirePattern(
  contextSource,
  /const appointmentGroupId =[\s\S]*?preferredItem\.appointmentGroupId \?\? fallbackItem\.appointmentGroupId[\s\S]*?appointmentGroupOrder: appointmentGroupId[\s\S]*?appointmentGroupSize: appointmentGroupId/,
  'Appointment merges must never preserve orphan group metadata from a stale snapshot.',
);
requirePattern(
  contextSource,
  /const projectionUnchanged =[\s\S]*?ownerFinancialAppointmentsWorkspaceIdRef\.current[\s\S]*?JSON\.stringify\(ownerFinancialAppointmentsRef\.current\)[\s\S]*?if \(projectionUnchanged\) \{[\s\S]*?return;/,
  'Equivalent authoritative appointment projections must not retrigger portal publishers.',
);
requirePattern(
  contextSource,
  /\.from\('appointments'\)[\s\S]{0,900}?\.order\('appointment_date'[\s\S]*?\.order\('appointment_time'[\s\S]*?\.order\('appointment_group_id'[\s\S]*?\.order\('appointment_group_order'[\s\S]*?\.order\('id'/,
  'The authoritative appointment query must return one deterministic schedule and group order.',
);
requirePattern(
  canonicalPortalAppointmentsMigrationSource,
  /overlay_canonical_appointment_timing_v1[\s\S]*?entries\.item - 'appointmentGroupOrder' - 'appointmentGroupSize'[\s\S]*?appointment\.appointment_group_id[\s\S]*?row_number\(\) over[\s\S]*?partition by projected\.identity_key[\s\S]*?jsonb_agg\([\s\S]*?order by[\s\S]*?appointmentGroupOrder/,
  'The server must canonicalize, deduplicate, and semantically order appointment arrays before conflict checks.',
);
requirePattern(
  canonicalPortalAppointmentsMigrationSource,
  /skip_unchanged_owner_snapshot_payload_v1\(\)[\s\S]*?new\.payload is not distinct from old\.payload[\s\S]*?return null[\s\S]*?create trigger zz_skip_unchanged_owner_snapshot_payload_v1[\s\S]*?before update of payload on public\.owner_app_snapshots/,
  'Owner snapshot upserts must become physical no-ops after every earlier canonicalization trigger has run.',
);
requirePattern(
  canonicalPortalAppointmentsMigrationSource,
  /update public\.owner_app_snapshots as snapshot[\s\S]*?'\{appuntamenti\}'[\s\S]*?overlay_canonical_appointment_timing_v1[\s\S]*?where coalesce\(snapshot\.payload -> 'appuntamenti'/,
  'Existing owner snapshots must receive the same one-time canonical appointment projection.',
);
requirePattern(
  canonicalPortalRequestRoleMigrationSource,
  /overlay_canonical_request_timing_v1[\s\S]*?entry\.item - 'mestiereRichiesto'[\s\S]*?'mestiereRichiesto', trim\(coalesce\(request\.required_role, ''\)\)[\s\S]*?left join public\.booking_requests/,
  'Persisted booking requests must take their required profession only from the authoritative booking_requests row.',
);
requirePattern(
  canonicalPortalRequestRoleMigrationSource,
  /update public\.client_portals as portal[\s\S]*?set richieste_prenotazione = public\.overlay_canonical_request_timing_v1[\s\S]*?update public\.owner_app_snapshots as snapshot[\s\S]*?'\{richiestePrenotazione\}'[\s\S]*?is distinct from public\.overlay_canonical_request_timing_v1/,
  'Existing portal and owner request projections must receive one bounded canonical-role repair.',
);
if (
  /\b(?:servizi|operatori)\s*=/.test(canonicalPortalAppointmentsMigrationSource)
) {
  throw new Error(
    'Appointment canonicalization must not rewrite the semantic order of services or operators.',
  );
}
if (
  /\b(?:servizi|operatori)\s*=/.test(canonicalPortalRequestRoleMigrationSource)
) {
  throw new Error(
    'Request-role canonicalization must not rewrite services or operators.',
  );
}
requirePattern(
  ownerAccessSource,
  /ref=\{loginPasswordRef\}[\s\S]*?returnKeyType="done"[\s\S]*?onSubmitEditing=\{\(\) => \{[\s\S]*?Keyboard\.dismiss\(\);[\s\S]*?Platform\.OS === 'web'[\s\S]*?canSubmitLogin[\s\S]*?loadingAction === null[\s\S]*?!isFinalizingOwnerEntry[\s\S]*?void handleLogin\(\);[\s\S]*?\}\}/,
  'Web owner password Enter must invoke the same guarded login action as the Accedi button.',
);

console.log('Stable owner UI contracts passed.');
