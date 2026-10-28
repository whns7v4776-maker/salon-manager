/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', 'cliente-screen.tsx'),
  'utf8',
);

const requirePattern = (value, pattern, message) => {
  if (!pattern.test(value)) throw new Error(message);
};
const rejectPattern = (value, pattern, message) => {
  if (pattern.test(value)) throw new Error(message);
};

const engineStart = source.indexOf('const publicBookingWindowEndDate = useMemo(');
const engineEnd = source.indexOf(
  'const preferredFrontendBookingDay = useMemo(',
  engineStart,
);
if (engineStart < 0 || engineEnd <= engineStart) {
  throw new Error('Atomic booking-window summary engine could not be isolated.');
}
const engine = source.slice(engineStart, engineEnd);

const pickerStart = source.indexOf(
  'const FrontendBookingDayPicker = memo(function FrontendBookingDayPicker(',
);
const pickerEnd = source.indexOf(
  'export default function ClienteFrontendScreen(',
  pickerStart,
);
if (pickerStart < 0 || pickerEnd <= pickerStart) {
  throw new Error('Booking-day picker source could not be isolated.');
}
const picker = source.slice(pickerStart, pickerEnd);

requirePattern(
  source,
  /FRONTEND_DAY_SUMMARY_PAGE_SIZE = 7[\s\S]*?FRONTEND_DAY_SUMMARY_MAX_CONCURRENCY = 2[\s\S]*?FRONTEND_DAY_SUMMARY_BLOCK_SIZE = 3[\s\S]*?FRONTEND_DAY_SUMMARY_CACHE_MAX_AGE_MS = 90 \* 1000[\s\S]*?FRONTEND_DAY_SUMMARY_TOKEN_TIMEOUT_MS = 8 \* 1000[\s\S]*?FRONTEND_DAY_SUMMARY_PAGE_TIMEOUT_MS = 25 \* 1000/,
  'All platforms must use the same three-date presentation blocks and bounded background concurrency.',
);
requirePattern(
  engine,
  /customer-name:[\s\S]*?window:[\s\S]*?open-dates:/,
  'The snapshot plan must include customer name, booking window and exact open dates.',
);
requirePattern(
  engine,
  /!isRegistered \|\|[\s\S]*?!isBookingStarted \|\|[\s\S]*?!servizio\.trim\(\)[\s\S]*?!canChooseDay/,
  'The whole-window loader must abort before login and outside a valid booking flow.',
);
requirePattern(
  engine,
  /livePublicDaySummaryOpenDates\.length === 0[\s\S]*?const emptyState =[\s\S]*?statuses: \{\}[\s\S]*?blockSnapshots: \{\}[\s\S]*?setLivePublicDaySummaryState\(emptyState\)/,
  'A locally known all-closed window must become ready instead of showing a permanent skeleton.',
);
requirePattern(
  engine,
  /livePublicDaySummaryGenerationRef\.current = generation[\s\S]*?new AbortController\(\)[\s\S]*?const isActive = \(\)[\s\S]*?livePublicDaySummaryGenerationRef\.current === generation/,
  'A changed plan or logout must cancel stale snapshot generations.',
);
requirePattern(
  engine,
  /capturedDirtyEpoch[\s\S]*?capturedDirtyVersions[\s\S]*?hasBlockDirtyVersionChanged[\s\S]*?capturedDirtyVersions\[dateValue\][\s\S]*?livePublicDaySummaryDirtyVersionByDateRef\.current/,
  'Realtime dirtiness must be versioned per atomic block and date.',
);
requirePattern(
  engine,
  /scheduleSnapshotTtl[\s\S]*?FRONTEND_DAY_SUMMARY_CACHE_MAX_AGE_MS[\s\S]*?setLivePublicDaySummaryRefreshRevision/,
  'TTL must trigger an authoritative background refresh.',
);
const ttlBody = engine.slice(
  engine.indexOf('const scheduleSnapshotTtl'),
  engine.indexOf('setLivePublicDaySummaryState((current)', engine.indexOf('const scheduleSnapshotTtl')),
);
rejectPattern(
  ttlBody,
  /statuses:\s*null|setLivePublicDaySummaryState/,
  'TTL refresh must keep the previous snapshot visually stable.',
);
rejectPattern(
  ttlBody,
  /livePublicDaySummaryCacheRef\.current\.delete|livePublicDaySummaryDirtyVersionByDateRef\.current\.set/,
  'TTL refresh must not revoke visible day authority or turn confirmed cards into skeletons.',
);
requirePattern(
  engine,
  /const loadAtomicBlocks = async \(\) => \{[\s\S]*?livePublicDaySummaryBlocks\.forEach[\s\S]*?isBlockSnapshotLocallyCurrent\(snapshot, block\)[\s\S]*?scheduleSnapshotTtl\(snapshot!\)[\s\S]*?const dirtyBlockKeys/,
  'Every fresh block must regain its TTL timer after a refresh generation cancels prior timers.',
);
requirePattern(
  engine,
  /type DaySummaryResolutionContext = \{[\s\S]*?stagingStatuses: Record<string, PublicBookingDaySummaryStatus>[\s\S]*?stagingProofTokenByDate: Record<string, string>[\s\S]*?const runBoundedPages/,
  'Day results must accumulate in block-local staging rather than rendering progressively.',
);
requirePattern(
  engine,
  /distributeCandidateProbes[\s\S]*?items\.length - 1[\s\S]*?Math\.floor\(items\.length \/ 2\)[\s\S]*?Math\.floor\(items\.length \/ 4\)[\s\S]*?Math\.floor\(\(items\.length \* 3\) \/ 4\)/,
  'Early availability probes must span the entire day, not only the morning.',
);
requirePattern(
  engine,
  /coverageComplete: true[\s\S]*?candidateSlotCount: distributedCandidates\.length/,
  'Only complete candidate coverage may authorize a full day.',
);
const pageRpcMatches = source.match(/get_public_booking_day_summary_page_v1/g) ?? [];
if (pageRpcMatches.length !== 1) {
  throw new Error('There must be exactly one paged day-summary RPC call site.');
}
requirePattern(
  engine,
  /p_planner_kind: plannerKind[\s\S]*?p_day_requests: dayRequests[\s\S]*?p_customer_name:[\s\S]*?p_customer_duration_minutes/,
  'The page RPC must carry the complete planner and customer authority contract.',
);
requirePattern(
  engine,
  /publicSupabase[\s\S]*?get_public_booking_day_summary_page_v1[\s\S]*?publicSupabase[\s\S]*?get_public_booking_consistency_token_v1[\s\S]*?publicSupabase[\s\S]*?get_public_dependency_slot_availability_batch_v1[\s\S]*?publicSupabase[\s\S]*?get_public_composition_slot_availability_batch_v1[\s\S]*?publicSupabase[\s\S]*?get_public_phased_booking_slot_availability_batch_v4[\s\S]*?publicSupabase[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  'Every public day-summary and exact-fallback RPC must use the stateless public client.',
);
requirePattern(
  engine,
  /dateValues\.slice\([\s\S]*?nextDateIndex \+ FRONTEND_DAY_SUMMARY_PAGE_SIZE[\s\S]*?nextDateIndex \+= FRONTEND_DAY_SUMMARY_PAGE_SIZE/,
  'The full booking window must be divided into bounded seven-date pages.',
);
requirePattern(
  engine,
  /const pageCount = Math\.ceil[\s\S]*?length: Math\.min\([\s\S]*?FRONTEND_DAY_SUMMARY_MAX_CONCURRENCY,[\s\S]*?pageCount[\s\S]*?\(\) => worker\(\)/,
  'All pages must share one globally bounded worker pool.',
);
requirePattern(
  engine,
  /const runBoundedPages = async \([\s\S]*?dateValues: string\[\][\s\S]*?localProofConsistencyToken: \(\) => Promise<string \| null>[\s\S]*?await waitForRetry\(0\)[\s\S]*?for \(const dateValue of pageDateValues\)[\s\S]*?buildDaySummaryRequest\(dateValue\)/,
  'Slot and phase objects must be built lazily for one active page after yielding the JS thread.',
);
rejectPattern(
  engine,
  /const allDayRequests|livePublicDaySummaryOpenDates\.flatMap\(\(dateValue\) => \{[\s\S]*?buildDaySummaryRequest/,
  'A long booking window must never pre-materialize every day and slot in one JS frame.',
);
const resolvePageStart = engine.indexOf('const resolvePage = async');
const runPagesStart = engine.indexOf('const runBoundedPages = async', resolvePageStart);
const resolvePageBody = engine.slice(resolvePageStart, runPagesStart);
rejectPattern(
  resolvePageBody,
  /Promise\.all/,
  'Recursive page splitting must stay sequential inside each bounded worker.',
);
requirePattern(
  resolvePageBody,
  /const firstFailures = await resolvePage[\s\S]*?const secondFailures = await resolvePage/,
  'Failed pages must split automatically from seven dates down to one.',
);
requirePattern(
  engine,
  /get_public_phased_booking_slot_availability_batch_v4[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  'Simple and phased single-day errors must fall back to their exact planners.',
);
requirePattern(
  engine,
  /get_public_dependency_slot_availability_batch_v1[\s\S]*?get_public_composition_slot_availability_batch_v1/,
  'Dependency and composition single-day errors must fall back to their exact planners.',
);
requirePattern(
  engine,
  /const isComplexExactPlanner =[\s\S]*?plannerKind === 'dependency' \|\| plannerKind === 'composition'[\s\S]*?const chunkSize = isComplexExactPlanner[\s\S]*?\? 6[\s\S]*?: startIndex === 0[\s\S]*?\? 6[\s\S]*?: 24[\s\S]*?chunkHasAvailability[\s\S]*?finalConsistencyToken = await loadConsistencyToken\(\)[\s\S]*?finalConsistencyToken !== consistencyToken[\s\S]*?status: 'available' as const[\s\S]*?finalConsistencyToken = await loadConsistencyToken\(\)[\s\S]*?status: 'full' as const/,
  'Complex exact fallbacks must stay within six-slot server batches, while simple and phased follow-ups may use 24, all inside a stable per-date consistency boundary.',
);
requirePattern(
  engine,
  /exactFallbackProgressByDate: Map<string, number>[\s\S]*?const scanExactRange = async[\s\S]*?context\.exactFallbackProgressByDate\.set\([\s\S]*?request\.date,[\s\S]*?rangeEndIndex[\s\S]*?shouldSplitPublicAvailabilityBatchError\(error\)[\s\S]*?const midpoint = Math\.ceil[\s\S]*?firstHalfAvailable = await scanExactRange[\s\S]*?return scanExactRange\(midpoint, rangeEndIndex\)[\s\S]*?context\.exactFallbackProgressByDate\.get\(request\.date\) \?\?/,
  'A failed exact fallback must split sequentially down to one and resume from every complete false prefix without losing its consistency token.',
);
const retryWaitStart = engine.indexOf('const waitForRetry');
const retryWaitEnd = engine.indexOf('const runBoundedPages', retryWaitStart);
const retryWaitBody = engine.slice(retryWaitStart, retryWaitEnd);
requirePattern(
  retryWaitBody,
  /resolve\(\)/,
  'Automatic retry sleeps must have a completion path.',
);
requirePattern(
  retryWaitBody,
  /snapshotAbortController\.signal\.addEventListener\('abort', finish/,
  'Automatic retry sleeps must resolve cleanly when a plan is cancelled.',
);
requirePattern(
  engine,
  /const publishBlockSnapshot[\s\S]*?setLivePublicDaySummaryState\(\(current\) =>[\s\S]*?\[snapshot\.blockKey\]: snapshot[\s\S]*?const loadAtomicBlock/,
  'A completed block must publish all of its statuses through one state swap.',
);
requirePattern(
  engine,
  /get_public_booking_consistency_token_v1[\s\S]*?context\.exactFallbackConsistencyTokenByDate\.get\(request\.date\)[\s\S]*?consistencyToken = await loadConsistencyToken\(\)[\s\S]*?finalConsistencyToken = await loadConsistencyToken\(\)[\s\S]*?finalConsistencyToken !== consistencyToken[\s\S]*?context\.exactFallbackProgressByDate\.delete\(request\.date\)[\s\S]*?context\.exactFallbackConsistencyTokenByDate\.delete\(request\.date\)[\s\S]*?public_day_summary_exact_consistency_changed/,
  'Each resumable exact fallback must restart its own date when the monotonic workspace token changes.',
);
requirePattern(
  engine,
  /const envelope = response\.data as Record<string, unknown>[\s\S]*?envelope\.consistencyToken[\s\S]*?envelope\.statuses[\s\S]*?public_day_summary_page_envelope_invalid[\s\S]*?context\.stagingProofTokenByDate\[request\.date\] =[\s\S]*?result\.consistencyToken/,
  'Every page status must retain the consistency token fenced inside the same server RPC.',
);
requirePattern(
  engine,
  /const snapshot: PublicBookingDaySummarySnapshot =[\s\S]*?blockKey: block\.blockKey[\s\S]*?dateValues: \[\.\.\.block\.dateValues\][\s\S]*?consistencyToken: currentConsistencyToken[\s\S]*?publishBlockSnapshot\(snapshot, cacheKey\)/,
  'Each committed block cache entry must retain the consistency token that validated it.',
);
requirePattern(
  engine,
  /isBlockSnapshotLocallyCurrent\(cachedSnapshot, block\)[\s\S]*?cacheConsistencyToken =[\s\S]*?loadConsistencyTokenWithRetry\(\)[\s\S]*?cachedSnapshot!\.consistencyToken === cacheConsistencyToken[\s\S]*?publishBlockSnapshot\(cachedSnapshot!, cacheKey\)/,
  'A cached block must be token-validated before it becomes usable authority.',
);
requirePattern(
  engine,
  /type DaySummaryBlockResolutionState =[\s\S]*?unresolvedDateValues: string\[\][\s\S]*?blockResolutionStateByKey[\s\S]*?unresolvedDateValues: \[\.\.\.block\.dateValues\][\s\S]*?resolutionState\.unresolvedDateValues = await runBoundedPages\([\s\S]*?localProofConsistencyToken[\s\S]*?currentConsistencyToken =[\s\S]*?loadConsistencyTokenWithRetry\(\)[\s\S]*?staleProofDateValues = block\.dateValues\.filter[\s\S]*?resolutionState\.unresolvedDateValues = staleProofDateValues[\s\S]*?publishBlockSnapshot\(snapshot, cacheKey\)/,
  'Each block must converge only stale proof dates to one current token before its atomic commit.',
);
requirePattern(
  engine,
  /isPurelyTemporalFull =[\s\S]*?daySlots\.every[\s\S]*?return \{ kind: 'temporal-full' \}[\s\S]*?distributedCandidates\.length === 0[\s\S]*?return \{ kind: 'pending' \}[\s\S]*?buildResult\.kind === 'temporal-full'[\s\S]*?context\.stagingStatuses\[dateValue\] = 'full'[\s\S]*?failedDateValues\.push\(dateValue\)/,
  'Only minimum-notice time can prove a local full day; empty stale catalog/settings candidates must remain pending and requeue.',
);
requirePattern(
  engine,
  /loadConsistencyTokenWithRetry = async \(maximumAttempts = 2\)[\s\S]*?retryCount < maximumAttempts[\s\S]*?retryCount \+ 1 >= maximumAttempts\) return null/,
  'A single block invocation must use bounded consistency-token attempts.',
);
requirePattern(
  engine,
  /let consistencyTokenRequest: Promise<string> \| null = null[\s\S]*?consistencyTokenRetryReadyAt[\s\S]*?if \(consistencyTokenRequest\) return consistencyTokenRequest[\s\S]*?gateDelay[\s\S]*?FRONTEND_DAY_SUMMARY_TOKEN_TIMEOUT_MS[\s\S]*?public_day_summary_token_timeout[\s\S]*?consistencyTokenFailureCount \+= 1[\s\S]*?consistencyTokenRetryReadyAt = Math\.max[\s\S]*?consistencyTokenRequest = request[\s\S]*?consistencyTokenRequest === request[\s\S]*?consistencyTokenRequest = null/,
  'Token fences must use one generation-scoped request and a shared automatic circuit breaker instead of one hanging request per worker.',
);
requirePattern(
  engine,
  /livePublicDaySummaryConfirmedDateRef\.current[\s\S]*?snapshot\.statuses\[selectedDate\] === 'full'[\s\S]*?setHasConfirmedBookingDay\(false\)[\s\S]*?setOra\(''\)[\s\S]*?setLivePublicDaySummaryState/,
  'A refreshed full day must revoke the confirmed day and time in the same commit.',
);
requirePattern(
  engine,
  /const pendingBlockKeys = new Set\(dirtyBlockKeys\)[\s\S]*?blockRetryReadyAtByKey[\s\S]*?const pickNextBlockKey = \(\) =>[\s\S]*?livePublicDaySummaryPriorityBlockKeyRef\.current[\s\S]*?const requeueBlockWithBackoff[\s\S]*?pendingBlockKeys\.delete\(blockKey\)[\s\S]*?pendingBlockKeys\.add\(blockKey\)[\s\S]*?const blockWorker = async[\s\S]*?const blockKey = pickNextBlockKey\(\)[\s\S]*?pendingBlockKeys\.delete\(blockKey\)[\s\S]*?finalizeBlockAttempt\(blockKey, committed\)[\s\S]*?await Promise\.all[\s\S]*?FRONTEND_DAY_SUMMARY_MAX_CONCURRENCY[\s\S]*?The first worker synchronously claims the focused\/selected block[\s\S]*?\(\) => blockWorker\(\)/,
  'The selected block must be claimed by the first worker without a serial pre-pass; failures requeue at the FIFO tail while two independent lanes preserve Android network headroom.',
);
rejectPattern(
  engine,
  /initialPriorityCommitted = await attemptBlockOnce/,
  'Neighboring blocks must not wait for a serial first-block prepass.',
);
const atomicBlockStart = engine.indexOf('const loadAtomicBlock = async');
const atomicBlockEnd = engine.indexOf('const loadAtomicBlocks = async', atomicBlockStart);
const atomicBlockBody = engine.slice(atomicBlockStart, atomicBlockEnd);
rejectPattern(
  atomicBlockBody,
  /while \(isActive\(\)\)/,
  'One atomic block invocation must never own an unbounded retry loop.',
);
requirePattern(
  picker,
  /viewportDateChangeRef\.current = onViewportDateChange[\s\S]*?onViewableItemsChanged=\{nativeViewableItemsChangedRef\.current\}/,
  'Native viewport changes must feed the on-demand block priority queue.',
);
requirePattern(
  picker,
  /settleWebDayAtScrollLeft[\s\S]*?onViewportDateChange\(viewportDay\.value\)/,
  'Web horizontal scrolling must feed the same on-demand block priority queue.',
);
requirePattern(
  picker,
  /initialScrollIndex=\{resolvedSelectedIndex\}/,
  'The native picker must mount directly on the selected date without one frame at index zero.',
);
requirePattern(
  picker,
  /frontendBookingDayPickerNativeViewport[\s\S]*?pickerWidth <= 0[\s\S]*?frontendBookingDayPickerNativeMeasureRow[\s\S]*?initialScrollIndex=\{resolvedSelectedIndex\}[\s\S]*?initialNumToRender=\{Math\.min\(7, visibleDays\.length\)\}/,
  'Android must reserve the horizontal viewport and wait for a measured width before mounting the date list.',
);
requirePattern(
  source,
  /frontendBookingDayPickerShell:\s*\{[\s\S]*?width: 'auto'[\s\S]*?alignSelf: 'stretch'[\s\S]*?frontendBookingDayPickerHeader:\s*\{[\s\S]*?width: '100%'[\s\S]*?frontendBookingDayPickerNativeViewport:\s*\{[\s\S]*?height: 138[\s\S]*?frontendBookingDayPickerNativeMeasureRow:\s*\{[\s\S]*?flexDirection: 'row'[\s\S]*?frontendBookingDayPickerNativeMeasureCard:\s*\{[\s\S]*?height: 118/,
  'The Android picker shell must stretch before its fixed horizontal five-card measurement frame mounts.',
);
requirePattern(
  picker,
  /useLayoutEffect\(\(\) => \{[\s\S]*?if \(!viewport \|\| !host\) \{[\s\S]*?setWebInitialCenterReady\(true\)[\s\S]*?centerDay\(selectedDate, false\)[\s\S]*?setWebInitialCenterReady\(true\)[\s\S]*?visibleDays\.length,[\s\S]*?opacity: webInitialCenterReady \? 1 : 0/,
  'Safari must center stable day cards immediately without waiting for server authority.',
);
requirePattern(
  source,
  /const canSendRequest =[\s\S]*?isLivePublicSlotAvailabilityResolvedForCurrentQuery[\s\S]*?selectedSlotHasAuthoritativeAvailability/,
  'Submission requires the exact selected-slot proof.',
);
requirePattern(
  source,
  /const bookingSubmitBlockedReason = useMemo[\s\S]*?!isLivePublicSlotAvailabilityResolvedForCurrentQuery[\s\S]*?Sto verificando gli orari disponibili\./,
  'An unresolved exact slot must explain why submission is temporarily blocked.',
);
requirePattern(
  source,
  /const inviaRichiesta = async \(\) => \{[\s\S]*?livePublicSlotAvailabilityAuthoritativeKeyRef.current !== livePublicSlotAvailabilityQueryKey[\s\S]*?!selectedSlotHasAuthoritativeAvailability[\s\S]*?setBookingRequestSubmitting\(true\)/,
  'The submit handler must check the live proof key to reject realtime invalidation even before rerender.',
);
requirePattern(
  source,
  /isDayFullForService: \(dateValue: string\) => boolean \| null;[\s\S]*?isDayAuthorityCurrent:/,
  'The picker must receive visual day state separately from per-date freshness.',
);
rejectPattern(
  picker,
  /if \(!isAuthorityReady\)/,
  'Pending dates must not hide already loaded dates behind a whole-picker skeleton.',
);
requirePattern(
  picker,
  /const isDayDisabled[\s\S]*?fullState !== false[\s\S]*?!isDayAuthorityCurrent\(dayValue\)/,
  'Unknown, full and dirty cards must all fail closed.',
);
const presentationKeyStart = source.indexOf(
  'const livePublicDaySummaryPresentationKey = useMemo(',
);
const presentationKeyEnd = source.indexOf(
  'const livePublicDaySummaryBlocks = useMemo(',
  presentationKeyStart,
);
if (presentationKeyStart < 0 || presentationKeyEnd <= presentationKeyStart) {
  throw new Error('Operator-neutral day-summary presentation key could not be isolated.');
}
const presentationKeySource = source.slice(
  presentationKeyStart,
  presentationKeyEnd,
);
requirePattern(
  source,
  /livePublicDaySummaryPresentationRef[\s\S]*?livePublicDaySummaryPresentationKey[\s\S]*?previous\.key === livePublicDaySummaryPresentationKey[\s\S]*?previous\.statuses[\s\S]*?livePublicDaySummaryState\.statuses/,
  'A changed operator plan must preserve the last committed day presentation while new authority loads.',
);
requirePattern(
  presentationKeySource,
  /livePublicSlotAvailabilityInputSignature[\s\S]*?window:[\s\S]*?open-dates:/,
  'Preserved day presentation must remain scoped to the same service, customer, settings and booking window.',
);
rejectPattern(
  presentationKeySource,
  /livePublicPlanOperatorId|operatoreNome|livePublicOperatorSelectionMode/,
  'Choosing an operator must not discard the already rendered day presentation.',
);
requirePattern(
  source,
  /livePublicDaySummaryPresentationRef\.current\.key ===[\s\S]*?const presentationStatus =[\s\S]*?livePublicDaySummaryPresentationStatuses\?\.\[dateValue\][\s\S]*?presentationStatus === 'full'[\s\S]*?presentationStatus === 'available'/,
  'Dirty dates must retain their previous visual status instead of returning to card skeletons.',
);
requirePattern(
  picker,
  /if \(\(isPast && !pastDaysReady\) \|\| \(isAvailabilityPending && !isPast && !availability.closed\)\)[\s\S]*?SkeletonShimmer/,
  'Unknown open dates must show skeletons until their availability is verified.',
);
rejectPattern(
  picker,
  /Calcolo/,
  'The booking-day picker must never expose a per-card Calcolo state.',
);
rejectPattern(
  source,
  /onViewportDatesChange|livePublicDayAuthority|livePublicDayFullAuthority|FRONTEND_VISIBLE_DAY_AUTHORITY|FRONTEND_BACKGROUND_DAY_AUTHORITY/,
  'Viewport-triggered and legacy per-day network queues must be fully removed.',
);
requirePattern(
  source,
  /!hasConfirmedBookingDay \|\|[\s\S]*?displayTimeSlots\.length === 0[\s\S]*?get_public_(?:phased_)?booking_slot_availability_batch/,
  'The detailed selected-day planner must remain independent and start only after confirmation.',
);

const nativePickerStart = source.indexOf('<NativeDatePickerModal');
const nativePickerEnd = source.indexOf('<KeyboardNextToolbar', nativePickerStart);
const nativePicker = source.slice(nativePickerStart, nativePickerEnd);
requirePattern(
  nativePicker,
  /isDateDisabled=\{\(value\) => \{[\s\S]*?!isDateWithinPublicBookingWindow[\s\S]*?\.closed[\s\S]*?!isLivePublicDaySummaryDateCurrent\(value\)[\s\S]*?isFrontendDayFullForService\(value\) !== false/,
  'The native calendar must disable out-of-window, closed, dirty, unknown and full dates.',
);
requirePattern(
  nativePicker,
  /onConfirm=\{\(value\) => \{[\s\S]*?!isDateWithinPublicBookingWindow[\s\S]*?!isLivePublicDaySummaryDateCurrent\(value\)[\s\S]*?isFrontendDayFullForService\(value\) !== false/,
  'Native calendar confirmation must repeat the same fail-closed authority checks.',
);

console.log('Atomic client booking-window day-summary contracts verified.');
