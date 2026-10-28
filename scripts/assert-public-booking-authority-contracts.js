/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portalSource = fs.readFileSync(
  path.join(root, "src/lib/client-portal.ts"),
  "utf8",
);
const clientsSource = fs.readFileSync(
  path.join(root, "app/(tabs)/clienti.tsx"),
  "utf8",
);
const pushNotificationsSource = fs.readFileSync(
  path.join(root, "src/lib/push/push-notifications.ts"),
  "utf8",
);
const clientNotificationsSource = fs.readFileSync(
  path.join(root, "src/context/ClientNotificationsContext.tsx"),
  "utf8",
);
const clientFrontendSource = fs.readFileSync(
  path.join(root, "app/cliente-screen.tsx"),
  "utf8",
);
const selectedPlannerStart = clientFrontendSource.indexOf(
  "const availabilityAbortController = new AbortController();",
);
const selectedPlannerEnd = clientFrontendSource.indexOf(
  "// The query key serializes every input used by this request.",
  selectedPlannerStart,
);
assert.ok(
  selectedPlannerStart >= 0 && selectedPlannerEnd > selectedPlannerStart,
  "Selected-day authoritative planner source must remain identifiable.",
);
const selectedPlannerSource = clientFrontendSource.slice(
  selectedPlannerStart,
  selectedPlannerEnd,
);
const dayOccupancyRefreshStart = clientFrontendSource.indexOf(
  "const refreshBackendDayOccupancy = useCallback(async () =>",
);
const dayOccupancyRefreshEnd = clientFrontendSource.indexOf(
  "const refreshPublicAvailabilitySettingsOnly = useCallback(async () =>",
  dayOccupancyRefreshStart,
);
assert.ok(
  dayOccupancyRefreshStart >= 0 && dayOccupancyRefreshEnd > dayOccupancyRefreshStart,
  "Selected-date occupancy refresh source must remain identifiable.",
);
const dayOccupancyRefreshSource = clientFrontendSource.slice(
  dayOccupancyRefreshStart,
  dayOccupancyRefreshEnd,
);
const servicesSource = fs.readFileSync(
  path.join(root, "app/(tabs)/servizi.tsx"),
  "utf8",
);
const serviceLinksSource = fs.readFileSync(
  path.join(root, "src/lib/service-compositions.ts"),
  "utf8",
);
const dependencyModesMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260817113000_service_dependency_modes.sql",
  ),
  "utf8",
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260815103000_authoritative_public_catalog_and_operator_availability.sql",
  ),
  "utf8",
);
const operatorSyncMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260815124500_sync_portal_operators_to_canonical.sql",
  ),
  "utf8",
);
const publicCustomerOverlapMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260728110000_owner_shorten_appointment_duration.sql",
  ),
  "utf8",
);
const ownerFreedomMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260811170000_owner_agenda_freedom_contract.sql",
  ),
  "utf8",
);
const publicCustomerNoOverlapMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260823155500_forbid_public_customer_time_overlap.sql",
  ),
  "utf8",
);
const atomicDependencyPlanMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260823114500_atomic_public_dependency_operator_plan.sql",
  ),
  "utf8",
);
const linkedClientViewedMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260818025000_mark_linked_client_booking_viewed_atomically.sql",
  ),
  "utf8",
);

assert.match(portalSource, /get_public_operator_catalog_v1/);
assert.match(
  portalSource,
  /!String\(item\.compositionId \?\? item\.composition_id \?\? ''\)\.trim\(\)/,
);
assert.match(
  clientsSource,
  /service\.disponibileOnline !== false && !service\.compositionId\?\.trim\(\)/,
);
assert.match(migrationSource, /is_public_operator_available_on_date_v1/);
assert.match(
  migrationSource,
  /is_public_booking_slot_available\(uuid,date,time,integer,text,text,text\)/,
);
assert.match(
  operatorSyncMigrationSource,
  /sync_workspace_operators_from_portal_v1/,
);
assert.match(
  operatorSyncMigrationSource,
  /after insert or update of operatori on public\.client_portals/,
);
assert.match(operatorSyncMigrationSource, /operator_public_booking_policies/);
assert.match(
  clientNotificationsSource,
  /Platform\.OS === 'android' && AppState\.currentState !== 'active'[\s\S]*?background_received_system_owned[\s\S]*?const isNew = markPresented\(normalized\.eventId\)[\s\S]*?if \(isNew && Platform\.OS !== 'android'\) \{[\s\S]*?enqueueForegroundCustomBarFromDBUnread\(normalized\)/,
  'Android must keep remote push presentation system-owned while web/iOS retain their in-app banner path.',
);
assert.match(
  clientNotificationsSource,
  /handleNotificationTap[\s\S]*?markClientBookingNotificationAsRead\(badgeIdentity, \{[\s\S]*?requestId: normalized\.requestId[\s\S]*?\}\)[\s\S]*?\.then\(\(\) => refreshClientUnreadFromDB\(\)\)/,
  "Tapping a client booking push must persist the read before refreshing its badges.",
);
assert.doesNotMatch(clientNotificationsSource, /client_db_foreground_fallback/);
assert.match(
  pushNotificationsSource,
  /Platform\.OS === 'android'[\s\S]*?isClientForegroundPush\(notificationData\)[\s\S]*?shouldSuppressDuplicateForegroundPush[\s\S]*?shouldShowBanner: true,[\s\S]*?shouldShowList: true,[\s\S]*?shouldPlaySound: true,[\s\S]*?shouldSetBadge: true,/,
);
assert.match(
  pushNotificationsSource,
  /salonpro-client-notifee-foreground-persistent-v\d+/,
);
assert.match(
  clientFrontendSource,
  /const renderClientForegroundCustomBar = \(\) => \{[\s\S]*?Platform\.OS !== 'ios' && Platform\.OS !== 'web'/,
);
assert.match(
  clientFrontendSource,
  /const currentLivePublicSlotAvailabilityMap =[\s\S]*?livePublicSlotAvailabilityResolvedKeyRef\.current === livePublicSlotAvailabilityQueryKey[\s\S]*?const isLivePublicSlotAvailabilityResolvedForCurrentQuery =[\s\S]*?currentLivePublicSlotAvailabilityMap !== null[\s\S]*?currentLivePublicSlotUnavailableReasonMap !== null/,
);
assert.match(
  clientFrontendSource,
  /livePublicSlotAvailabilityInputSignature = JSON\.stringify\(\{[\s\S]*?serviceMachineryIds:[\s\S]*?dependencyMachineryIds:[\s\S]*?availabilitySettings:/,
  'A machinery assignment change must invalidate the exact public slot proof.',
);
assert.match(
  clientFrontendSource,
  /const isLivePublicSlotAvailabilityPendingForCurrentQuery =[\s\S]*?!isLivePublicSlotAvailabilityResolvedForCurrentQuery \|\|[\s\S]*?!isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery[\s\S]*?const shouldShowLiveSlotLoadingState =[\s\S]*?isLivePublicSlotAvailabilityPendingForCurrentQuery/,
  'Unresolved and fail-closed availability must stay neutral until the current planner result is authoritative.',
);
assert.match(
  clientFrontendSource,
  /shouldShowLiveSlotLoadingState \? \([\s\S]*?frontendBookingTimeSkeletonCard[\s\S]*?accessibilityRole="progressbar"/,
);
assert.match(
  clientFrontendSource,
  /FRONTEND_LIVE_SLOT_REQUEST_TIMEOUT_MS[\s\S]*?scheduleAutomaticSlotAvailabilityRetry[\s\S]*?setLivePublicSlotAvailabilityRetryRevision/,
  'A failed or stalled authoritative slot request must recover automatically.',
);
assert.doesNotMatch(
  clientFrontendSource.slice(
    clientFrontendSource.indexOf('const scheduleAutomaticSlotAvailabilityRetry = () =>'),
    clientFrontendSource.indexOf(
      'setIsLivePublicSlotAvailabilityLoading((current) =>',
      clientFrontendSource.indexOf('const scheduleAutomaticSlotAvailabilityRetry = () =>'),
    ),
  ),
  /setLivePublicSlotAvailabilityRefreshRevision/,
  'Selected-slot retry must be isolated from realtime/day invalidation.',
);
assert.doesNotMatch(
  clientFrontendSource,
  /shouldShowLiveSlotErrorState|La verifica degli orari sta impiegando troppo tempo\. Riprova/,
  'Availability failures must not ask the customer to retry or appear as an occupied day.',
);
assert.match(
  clientFrontendSource,
  /key: 'recommended',[\s\S]*?title: 'Orari consigliati'[\s\S]*?key: 'other',[\s\S]*?title: 'Altri orari'/,
);
assert.match(
  clientFrontendSource,
  /const requestSilentLivePublicSlotAvailabilityRefresh =[\s\S]*?setLivePublicSlotAvailabilityRefreshRevision[\s\S]*?const commitBackendDayOccupancy/,
);
assert.match(
  clientFrontendSource,
  /const requestSilentLivePublicSlotAvailabilityRefresh = useCallback\(\(affectedDates\?: string \| string\[\]\)[\s\S]*?normalizedAffectedDates[\s\S]*?livePublicSlotAvailabilityCacheRef\.current\.delete\(cacheKey\)[\s\S]*?livePublicDaySummaryDirtyVersionByDateRef\.current\.set\([\s\S]*?snapshot\.dateValues\.some[\s\S]*?livePublicDaySummaryCacheRef\.current\.delete\(cacheKey\)[\s\S]*?setLivePublicDaySummaryRefreshRevision/,
  'An occupancy event batch must version every exact date and evict only affected atomic blocks.',
);
assert.match(
  clientFrontendSource,
  /scheduleLivePublicDaySummaryRealtimeRefresh = useCallback[\s\S]*?normalizedAffectedDates\.length === 0[\s\S]*?livePublicDaySummaryRealtimeGlobalDirtyRef\.current = true[\s\S]*?livePublicDaySummaryRealtimeDirtyDatesRef\.current\.clear\(\)[\s\S]*?livePublicDaySummaryRealtimeDirtyDatesRef\.current\.add\(dateValue\)[\s\S]*?livePublicDaySummaryRealtimeFlushTimerRef\.current = setTimeout[\s\S]*?requestSilentLivePublicSlotAvailabilityRefresh[\s\S]*?isGlobalInvalidation \? undefined : dirtyDates[\s\S]*?, 100\)/,
  'Realtime authority revisions and exact booking dates must coalesce into one 100ms refresh batch.',
);
assert.match(
  clientFrontendSource,
  /refreshHardGlobalAvailabilityWithSettlingRetries[\s\S]*?scheduleLivePublicDaySummaryRealtimeRefresh\(\)[\s\S]*?table: 'public_availability_revisions'[\s\S]*?refreshHardGlobalAvailabilityWithSettlingRetries[\s\S]*?table: 'client_portals'[\s\S]*?refreshClientNotificationStateWithSettlingRetries/,
  'Only authority revisions may globally invalidate day summaries; portal events refresh snapshots and let the resulting plan key decide.',
);
assert.doesNotMatch(
  clientFrontendSource,
  /soft-global|SoftGlobal/,
  'Client portal events must not retain a timing-dependent soft-global day-summary path.',
);
assert.match(
  clientFrontendSource,
  /invalidateDaySummaryFromBookingPayload[\s\S]*?readPayloadDate\(payload\.old\)[\s\S]*?readPayloadDate\(payload\.new\)[\s\S]*?requiresGlobalInvalidation[\s\S]*?eventType === 'UPDATE'[\s\S]*?eventType === 'DELETE'[\s\S]*?!oldDate[\s\S]*?scheduleLivePublicDaySummaryRealtimeRefresh[\s\S]*?table: 'appointments'[\s\S]*?invalidateDaySummaryFromBookingPayload\(payload\)[\s\S]*?table: 'booking_requests'[\s\S]*?invalidateDaySummaryFromBookingPayload\(payload\)/,
  'Appointment and request realtime payloads must invalidate old and new dates, including moves.',
);
assert.match(
  clientFrontendSource,
  /const shouldInvalidateSelectedDay =[\s\S]*?normalizedAffectedDates\.includes\(latestBookingDateRef\.current\)[\s\S]*?if \(shouldInvalidateSelectedDay\)[\s\S]*?setLivePublicSlotAvailabilityRefreshRevision/,
  'An unrelated date update must not bounce the detailed selected-day slot grid.',
);
assert.match(
  clientFrontendSource,
  /const requestSilentLivePublicSlotAvailabilityRefresh =[\s\S]*?livePublicSlotAvailabilityAuthoritativeKeyRef\.current = ''[\s\S]*?Object\.keys\(current\)\.map\(\(slotTime\) => \[slotTime, false\]\)[\s\S]*?setLivePublicSlotAvailabilityRefreshRevision/,
  'A silent invalidation must revoke old true slots immediately while automatic recovery continues.',
);
assert.doesNotMatch(
  clientFrontendSource,
  /const requestSilentLivePublicSlotAvailabilityRefresh =[\s\S]{0,500}?livePublicSlotAvailabilityResolvedKeyRef\.current = ''/,
);
assert.match(
  clientFrontendSource,
  /const needsSilentRefresh =[\s\S]*?const shouldShowFullSlotLoading = !hasResolvedCurrentQuery/,
);
assert.match(
  clientFrontendSource,
  /const commitBackendDayOccupancy =[\s\S]*?normalizedExpectedDate !== latestBookingDateRef\.current[\s\S]*?requestGeneration !== backendDayOccupancyRequestGenerationRef\.current[\s\S]*?backendDayOccupancyDateRef\.current = normalizedExpectedDate/,
  'A late occupancy response must not be committed after the selected date or request generation changes.',
);
assert.match(
  dayOccupancyRefreshSource,
  /const selectedDate = latestBookingDateRef\.current[\s\S]*?fetchPublicBookingOccupancy\([\s\S]*?normalizedSelectedSalonCode,[\s\S]*?selectedDate,[\s\S]*?commitBackendDayOccupancy\(occupancy, selectedDate, requestGeneration\)/,
  'Changing day must fetch and commit only that exact date occupancy.',
);
assert.doesNotMatch(
  dayOccupancyRefreshSource,
  /refreshPublicSalonStateRef\.current|fetchPortalSnapshotWithRetry|refreshFrontendSalonPortalData/,
  'Changing day must not reload the complete portal snapshot and restart unrelated booking work.',
);
assert.match(
  clientFrontendSource,
  /const effectiveBlockingAppointments = useMemo\(\(\) => \{[\s\S]*?backendDayOccupancyDateRef\.current !== data[\s\S]*?return baseBlockingAppointments/,
  'Occupancy from another selected date must never enter local slot conflict calculations.',
);
assert.match(
  clientFrontendSource,
  /const loadAtomicBlock = async[\s\S]*?hasBlockDirtyVersionChanged[\s\S]*?staleProofDateValues = block\.dateValues\.filter[\s\S]*?publishBlockSnapshot\(snapshot, cacheKey\)/,
  'Only a current complete segment may update public day authority.',
);
assert.doesNotMatch(
  clientFrontendSource,
  /key=\{`loading-\$\{item\}`\}[\s\S]{0,900}Verifica disponibilita\.\.\./,
);
assert.match(
  clientFrontendSource,
  /const selectedSlotHasAuthoritativeAvailability =[\s\S]*?isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery[\s\S]*?currentLivePublicSlotAvailabilityMap\?\.\[ora\] === true[\s\S]*?const canSendRequest =[\s\S]*?selectedSlotHasAuthoritativeAvailability/,
  'A previously true slot must stay unbookable until the complete planner is authoritative again.',
);
assert.match(
  clientFrontendSource,
  /servizio\.trim\(\) &&[\s\S]{0,400}?isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery\)[\s\S]{0,200}?!canAnySlotBeBooked \? \([\s\S]{0,300}?Nessuno slot libero/,
  'The no-slot message must only be rendered from an authoritative result.',
);
assert.match(
  clientFrontendSource,
  /const shouldSplitPublicAvailabilityBatchError =[\s\S]*?isTransientDatabaseCode[\s\S]*?isTransientHttpStatus[\s\S]*?describesTimeoutTransientOrSizeFailure[\s\S]*?shouldSplitPublicAvailabilityBatchError\(dependencyPlanResult\.error\)[\s\S]*?shouldSplitPublicAvailabilityBatchError\(compositionResult\.error\)/,
  'Recursive dependency and composition batches may split only timeout, transient or size failures.',
);
assert.match(
  clientFrontendSource,
  /const isAvailabilityRequestInactive = \(\) =>[\s\S]*?cancelled[\s\S]*?requestTimedOut[\s\S]*?livePublicSlotAvailabilityRequestRef\.current !== requestId[\s\S]*?const assertAvailabilityRequestActive =[\s\S]*?const loadDependencyAvailabilityChunk =[\s\S]*?assertAvailabilityRequestActive\(\)[\s\S]*?const loadCompositionAvailabilityChunk =[\s\S]*?assertAvailabilityRequestActive\(\)/,
  'Recursive planners must stop after cancellation, timeout or request supersession.',
);
assert.match(
  selectedPlannerSource,
  /const normalizeBatchAvailability = \([\s\S]*?expectedSlotTimes\.every\([\s\S]*?Object\.prototype\.hasOwnProperty\.call\(source, slotTime\)[\s\S]*?typeof source\[slotTime\] === ['"]boolean['"]/,
  'Partial slot maps must never be committed as authoritative.',
);
assert.match(
  selectedPlannerSource,
  /requestChunk\.length > 1[\s\S]*?\(!batchResult\.error \|\| shouldSplitPublicAvailabilityBatchError\(batchResult\.error\)\)[\s\S]*?\(!dependencyPlanResult\.error \|\|[\s\S]*?shouldSplitPublicAvailabilityBatchError\(dependencyPlanResult\.error\)\)[\s\S]*?\(!compositionResult\.error \|\|[\s\S]*?shouldSplitPublicAvailabilityBatchError\(compositionResult\.error\)\)/,
  'Incomplete maps without an RPC error must still be split and recovered sequentially.',
);
assert.match(
  selectedPlannerSource,
  /requestTimedOut = true;[\s\S]*?availabilityAbortController\.abort\(\)[\s\S]*?return \(\) => \{[\s\S]*?cancelled = true;[\s\S]*?availabilityAbortController\.abort\(\)/,
  'Timeout and cleanup must abort obsolete selected-day requests.',
);
for (const rpcName of [
  'get_public_phased_booking_slot_availability_batch_v4',
  'get_public_booking_slot_availability_batch_v3',
  'get_public_dependency_slot_availability_batch_v1',
  'get_public_composition_slot_availability_batch_v1',
]) {
  assert.match(
    selectedPlannerSource,
    new RegExp(
      `\\.rpc\\('${rpcName}'[\\s\\S]{0,1400}?\\.abortSignal\\(availabilityAbortController\\.signal\\)`,
    ),
    `${rpcName} must share the selected-day AbortController signal.`,
  );
}
assert.doesNotMatch(
  selectedPlannerSource.slice(
    selectedPlannerSource.indexOf('const loadServicePartAvailability = async ('),
    selectedPlannerSource.indexOf('const dependencyPlanAvailabilityMap ='),
  ),
  /is_public_booking_slot_available/,
  'A full service plan must never fall back to independent phase checks.',
);
assert.match(serviceLinksSource, /dependencyMode\?: 'automatic' \| 'choice'/);
assert.match(
  servicesSource,
  /Automatico[\s\S]*?Scelta obbligatoria[\s\S]*?requiredServiceIds: serviceDependencyIds\.slice\(0, 1\)[\s\S]*?suggestedServiceIds: serviceDependencyIds/,
);
assert.match(
  clientFrontendSource,
  /automaticDependencyRequired[\s\S]*?AGGIUNTO AUTOMATICAMENTE[\s\S]*?Slot separato subito dopo[\s\S]*?selectedBookingTotalPrice/,
);
assert.match(
  clientFrontendSource,
  /validationAutomaticDependencyRequired[\s\S]*?validationDependencyAllowed/,
);
assert.match(
  clientFrontendSource,
  /selectedDependencyService && requestedService[\s\S]*?get_public_dependency_slot_availability_batch_v1[\s\S]*?p_parent_service_name: requestedService\.nome[\s\S]*?p_dependency_service_id: selectedDependencyService\.id[\s\S]*?dependencyPlanAvailabilityMap[\s\S]*?parentAvailabilityMap\[slotTime\] === true/,
  "A service dependency must use one authoritative parent + pose + dependency plan for the slot selector.",
);
assert.match(
  atomicDependencyPlanMigrationSource,
  /get_public_dependency_slot_availability_batch_v1[\s\S]*?v_plan := public\.resolve_public_dependency_operator_plan_v1/,
  "Dependency availability and persistence must share the same atomic operator planner.",
);
assert.match(
  atomicDependencyPlanMigrationSource,
  /dependencyMode[\s\S]*?automatic[\s\S]*?requiredServiceIds[\s\S]*?clientChoiceRequired[\s\S]*?suggestedServiceIds/,
  "Dependency planning must support both automatic required services and customer-selected dependencies.",
);
assert.match(
  atomicDependencyPlanMigrationSource,
  /v_operator_plan := public\.resolve_public_dependency_operator_plan_v1[\s\S]*?v_planned_parent_operator_id := nullif\(v_operator_plan ->> 'parentOperatorId'[\s\S]*?v_planned_dependency_operator_id := nullif\(v_operator_plan ->> 'dependencyOperatorId'/,
  "The dependency writer must persist the exact operator plan validated before the write.",
);
assert.match(
  clientFrontendSource,
  /selectedBookingService\?\.compositionId \|\| selectedDependencyService[\s\S]*?return liveAvailability !== true/,
  "Composition and dependency slots must trust the resolved authoritative plan instead of a parent-only local capacity estimate.",
);
assert.match(
  clientFrontendSource,
  /livePublicDaySummaryPlanKey = useMemo[\s\S]*?livePublicSlotAvailabilityPlanKey[\s\S]*?customer-name:[\s\S]*?window:[\s\S]*?open-dates:/,
  "Complex-service day labels must be namespaced by the complete plan, customer and booking window.",
);
assert.match(
  clientFrontendSource,
  /type DaySummaryBlockResolutionState =[\s\S]*?unresolvedDateValues: string\[\][\s\S]*?blockResolutionStateByKey[\s\S]*?unresolvedDateValues: \[\.\.\.block\.dateValues\][\s\S]*?resolutionState\.unresolvedDateValues = await runBoundedPages\([\s\S]*?resolutionState\.unresolvedDateValues,[\s\S]*?localProofConsistencyToken[\s\S]*?staleProofDateValues = block\.dateValues\.filter[\s\S]*?resolutionState\.unresolvedDateValues = staleProofDateValues[\s\S]*?publishBlockSnapshot\(snapshot, cacheKey\)/,
  'Each block refresh must preserve staged successes and repeat only unresolved or stale-proof dates.',
);
assert.match(
  clientFrontendSource,
  /livePublicDaySummaryRefreshRevision,[\s\S]*?normalizedSelectedSalonCode,[\s\S]*?\]\);/,
  'Day-summary invalidation must use its own effect revision.',
);
assert.match(
  clientFrontendSource,
  /livePublicCompositionPlanSignature[\s\S]*?compositionAllowSplitOperators[\s\S]*?compositionItems[\s\S]*?position[\s\S]*?durationOverrideMinutes[\s\S]*?requiredRole[\s\S]*?buildFrontendAvailabilityServicesSignature\(compositionServices\)[\s\S]*?macchinarioIds[\s\S]*?compositionPlanSignature: livePublicCompositionPlanSignature/,
  "Composition day proofs must change when ordered children, timing, roles, phases or machinery change under the same composition id.",
);
assert.match(
  clientFrontendSource,
  /if \(!isCurrentWorkspaceSalon\) \{[\s\S]*?livePublicDaySummaryState\.planKey !== livePublicDaySummaryPlanKey \|\|[\s\S]*?!isLivePublicDaySummaryDateCurrent\(dateValue\)[\s\S]*?livePublicDaySummaryPresentationStatuses\?\.\[dateValue\][\s\S]*?summaryStatus === 'full'[\s\S]*?summaryStatus === 'available'[\s\S]*?: null/,
  "Changing operator may retain the prior visual day status while current authority is recomputed.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /isAuthorityReady: boolean|if \(!isAuthorityReady\)|Disponibilità del segmento in aggiornamento/,
  "Pending day authority must never replace the premium day cards with skeletons.",
);
assert.match(
  clientFrontendSource,
  /const isDayDisabled[\s\S]*?fullState !== false[\s\S]*?!isDayAuthorityCurrent\(dayValue\)/,
  'A retained visual day status must remain disabled until the new atomic proof is current.',
);
assert.match(
  clientFrontendSource,
  /initialScrollIndex=\{resolvedSelectedIndex\}/,
  'The native day picker must mount at the selected date without bouncing through index zero.',
);
assert.doesNotMatch(clientFrontendSource, /['"]Calcolo['"]/);
assert.match(
  clientFrontendSource,
  /const slotRequests = displayTimeSlots\.flatMap[\s\S]*?isSlotWithinMinimumNotice\([\s\S]*?minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES[\s\S]*?locallyUnavailableSlots\.add\(slotTime\)[\s\S]*?return \[\];[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  "Today must be marked available only when at least one authoritative slot also respects the minimum-notice rule.",
);
assert.match(
  clientFrontendSource,
  /const slotRequests = displayTimeSlots\.flatMap[\s\S]*?isSlotBlockedByOverride\(resolvedAvailabilitySettings, data, slotTime,[\s\S]*?selectedOperatorId: requestedOperatorId \|\| null[\s\S]*?locallyUnavailableSlots\.add\(slotTime\)[\s\S]*?return \[\];[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  "The saved public day result must include global and explicitly selected operator slot overrides.",
);
assert.match(
  clientFrontendSource,
  /const orariInConflitto =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  "A stale local bootstrap must not override a complete public server slot result.",
);
assert.match(
  clientFrontendSource,
  /const orariNonDisponibili =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  "A stale local availability count must not override a complete public result.",
);
assert.match(
  clientFrontendSource,
  /const orariOccupati =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  "Stale local occupancy must not override a complete public result.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /const isFrontendDayFullForService =[\s\S]{0,1200}?requiresAuthoritativePlanAvailability/,
  "A simple public service must not derive Pieno from partial local bootstrap data.",
);
assert.match(
  clientFrontendSource,
  /const rawLivePublicOperatorId = operatoreId\.trim\(\);[\s\S]*?const livePublicPlanOperatorId =[\s\S]*?isSalonCapacityOperatorId\(rawLivePublicOperatorId\)[\s\S]*?\? ''[\s\S]*?const requestedOperatorId = livePublicPlanOperatorId;[\s\S]*?get_public_booking_slot_availability_batch_v3[\s\S]*?p_requested_operator_id: requestedOperatorId \|\| null/,
  "Every public planner must receive null for any eligible operator, never a salon-capacity pseudo id.",
);
assert.match(
  clientFrontendSource,
  /livePublicOperatorSelectionMode =[\s\S]*?'explicit'[\s\S]*?'any-eligible'[\s\S]*?'salon-capacity'/,
  "The pre-operator preview and the selected any-eligible path must reuse their identical planner proof while explicit operators remain isolated.",
);
assert.match(
  clientFrontendSource,
  /selectedBookingPlanBusyIntervals[\s\S]*?getSequentialServicesOperatorBusyIntervals\(planServices\)[\s\S]*?doesSelectedBookingPlanOverlapLunchBreak[\s\S]*?selectedBookingPlanBusyIntervals\.some/,
  "Lunch checks must use the complete sequential plan, including poses, dependencies and compositions.",
);
assert.match(
  clientFrontendSource,
  /allowsAutomaticMultiServiceOperatorAssignment[\s\S]*?selectedCompositionServices\.length > 0 \|\| !!selectedDependencyService/,
  "Multi-service bookings must support automatic operator fitting across their distinct parts.",
);
assert.match(
  clientFrontendSource,
  /explicitOperatorIsNoLongerCompatible[\s\S]*?!!operatoreId[\s\S]*?if \(ora\) setOra\(''\)/,
  "Automatic operator fitting must not erase a selected time merely because no explicit operator id is present.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /if \(orariNonDisponibili\.has\(ora\) \|\| orariInConflitto\.has\(ora\)\) \{\s*setOra\(''\);\s*\}/,
  "A background availability refresh must not silently erase the selected time and collapse booking progress.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /if \(validationDependencyRequired && !validationDependencyAllowed\) \{[\s\S]{0,300}?setData\(getTodayDateString\(\)\)/,
  "A refreshed dependency catalog must not throw the customer back to today.",
);
assert.match(
  clientFrontendSource,
  /findSameDayBookingComponentConflictForClient[\s\S]*?requestedServiceKey[\s\S]*?isSameExactService/,
  "Same-day duplicate protection must compare exact booked services instead of broad categories such as every hair service.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /findSameDayBookingComponentConflictForClient[\s\S]{0,5000}?doServiceBookingComponentsOverlap/,
  "Colore must not be blocked merely because the client already has a different hair service on that day.",
);
assert.match(
  clientFrontendSource,
  /requestedServiceNames: \[[\s\S]*?selectedCompositionServices\.map\(\(service\) => service\.nome\)[\s\S]*?selectedDependencyService\?\.nome/,
  "Same-day duplicate checks must include the real composition and linked-service parts.",
);
assert.match(
  clientFrontendSource,
  /doesCustomerBookingPlanOverlap[\s\S]*?requestedStart < appointmentEnd && requestedEnd > appointmentStart/,
  "The full customer envelope must remain authoritative for every frontend booking.",
);
assert.doesNotMatch(
  clientFrontendSource,
  /hasCurrentCustomerBookingPlanConflict = useCallback\([\s\S]{0,500}?customerOnlineBookingPolicy\.allowSameDaySameService[\s\S]{0,200}?return false/,
  "A second-booking policy must never bypass overlapping customer times.",
);
assert.match(
  clientFrontendSource,
  /latestResolvedCustomerConflict = doesCustomerBookingPlanOverlap\([\s\S]*?appointments: latestResolvedBlockingBase/,
  "Final revalidation must retain customer identity instead of replacing it with anonymous occupancy.",
);
assert.match(
  clientFrontendSource,
  /if \(refreshedCustomerConflict\) \{[\s\S]*?Hai già un appuntamento in questo orario[\s\S]*?return;/,
  "A freshly detected overlap must stop before the family-or-friend confirmation.",
);
assert.match(
  clientFrontendSource,
  /Prenotazione per un’altra persona\?[\s\S]*?familiare o un amico/,
  "Delegated customer bookings must require an explicit confirmation before submission.",
);
assert.match(
  publicCustomerNoOverlapMigrationSource,
  /create or replace function public\.prevent_public_customer_time_overlap\(\)[\s\S]*?raise exception 'customer_time_conflict'/,
  "The database must reject overlapping public customer envelopes.",
);
assert.match(
  publicCustomerNoOverlapMigrationSource,
  /create_public_phased_booking_request_with_assignments_v1_with_final[\s\S]*?create_public_phased_booking_request_with_assignments_v1/,
  "Both phased booking implementations must preserve full customer-envelope conflicts.",
);
assert.match(
  ownerFreedomMigrationSource,
  /salonpro\.allow_owner_customer_overlap[\s\S]*?return new/,
  "The owner-only transaction override must remain separate from public customer booking.",
);
assert.match(
  dependencyModesMigrationSource,
  /requiredServiceIds[\s\S]*?suggestedServiceIds[\s\S]*?dependency_configuration_changed/,
);
assert.match(
  linkedClientViewedMigrationSource,
  /request\.appointment_group_id in \(select appointment_group_id from requested_groups\)/,
  "Reading one linked booking notification must mark every phase in its appointment group.",
);
assert.match(
  clientFrontendSource,
  /appointmentGroupId:\s*String\(row\.appointment_group_id \?\? ''\)\.trim\(\) \|\| undefined/,
  "Unread rows hydrated into the client drawer must preserve their logical booking group.",
);

console.log("Public booking authority contracts passed.");
