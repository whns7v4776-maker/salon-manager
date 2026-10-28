/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', 'cliente-screen.tsx'),
  'utf8',
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const automaticRetryStart = source.indexOf(
  'const scheduleAutomaticSlotAvailabilityRetry = () =>',
);
const automaticRetryEnd = source.indexOf(
  'setIsLivePublicSlotAvailabilityLoading((current) =>',
  automaticRetryStart,
);
if (automaticRetryStart < 0 || automaticRetryEnd <= automaticRetryStart) {
  throw new Error('Automatic availability recovery source could not be isolated.');
}
const automaticRetrySource = source.slice(automaticRetryStart, automaticRetryEnd);
const dayFullAuthorityStart = source.indexOf(
  'const isFrontendDayFullForService = useCallback(',
);
const dayFullAuthorityEnd = source.indexOf(
  'useEffect(() => {',
  dayFullAuthorityStart,
);
if (dayFullAuthorityStart < 0 || dayFullAuthorityEnd <= dayFullAuthorityStart) {
  throw new Error('Frontend day-full authority source could not be isolated.');
}
const dayFullAuthoritySource = source.slice(
  dayFullAuthorityStart,
  dayFullAuthorityEnd,
);
const selectedPlannerStart = source.indexOf(
  'const availabilityAbortController = new AbortController();',
);
const selectedPlannerEnd = source.indexOf(
  '// The query key serializes every input used by this request.',
  selectedPlannerStart,
);
if (selectedPlannerStart < 0 || selectedPlannerEnd <= selectedPlannerStart) {
  throw new Error('Selected-day authoritative planner source could not be isolated.');
}
const selectedPlannerSource = source.slice(selectedPlannerStart, selectedPlannerEnd);
const servicePartStart = selectedPlannerSource.indexOf(
  'const loadServicePartAvailability = async (',
);
const servicePartEnd = selectedPlannerSource.indexOf(
  'const dependencyPlanAvailabilityMap =',
  servicePartStart,
);
if (servicePartStart < 0 || servicePartEnd <= servicePartStart) {
  throw new Error('Service full-plan availability source could not be isolated.');
}
const servicePartSource = selectedPlannerSource.slice(servicePartStart, servicePartEnd);

requirePattern(
  /FRONTEND_MULTI_PHASE_AVAILABILITY_CHUNK_SIZE = 24/,
  'Multi-phase availability must use bounded request chunks.',
);
requirePattern(
  /const batchResult = phaseConfig[\s\S]*?await publicSupabase[\s\S]*?get_public_phased_booking_slot_availability_batch_v4[\s\S]*?: await publicSupabase[\s\S]*?get_public_booking_slot_availability_batch_v3[\s\S]*?dependencyPlanResult = await publicSupabase[\s\S]*?get_public_dependency_slot_availability_batch_v1[\s\S]*?compositionResult = await publicSupabase[\s\S]*?get_public_composition_slot_availability_batch_v1/,
  'Selected-day public planners must bypass shared authenticated-session state.',
);
requirePattern(
  /One authoritative batch is normally the fastest path on Android[\s\S]*?return loadServiceAvailabilityChunk\(serviceSlotRequests\)/,
  'Automatic phased services must start from one authoritative batch.',
);
requirePattern(
  /loadServiceAvailabilityChunk[\s\S]*?const firstHalf = await loadServiceAvailabilityChunk[\s\S]*?const secondHalf = await loadServiceAvailabilityChunk/,
  'A failed phased batch must split sequentially without parallel planner floods.',
);
requirePattern(
  /shouldSplitPublicAvailabilityBatchError\(batchResult\.error\)[\s\S]*?const firstHalf = await loadServiceAvailabilityChunk/,
  'Phased batches may split only for timeout, transient or request-size failures.',
);
requirePattern(
  /loadDependencyAvailabilityChunk[\s\S]*?assertAvailabilityRequestActive\(\)[\s\S]*?shouldSplitPublicAvailabilityBatchError\(dependencyPlanResult\.error\)[\s\S]*?const firstHalf = await loadDependencyAvailabilityChunk[\s\S]*?assertAvailabilityRequestActive\(\)[\s\S]*?const secondHalf = await loadDependencyAvailabilityChunk/,
  'Linked-service retries must stop when stale and split only eligible failures, sequentially.',
);
requirePattern(
  /loadCompositionAvailabilityChunk[\s\S]*?assertAvailabilityRequestActive\(\)[\s\S]*?shouldSplitPublicAvailabilityBatchError\(compositionResult\.error\)[\s\S]*?const firstHalf = await loadCompositionAvailabilityChunk[\s\S]*?assertAvailabilityRequestActive\(\)[\s\S]*?const secondHalf = await loadCompositionAvailabilityChunk[\s\S]*?FRONTEND_MULTI_PHASE_AVAILABILITY_CHUNK_SIZE/,
  'Compositions must use bounded authoritative chunks and stop stale recursive retries.',
);
requirePattern(
  /throw batchResult\.error \?\? new Error\(['"]service_plan_availability_incomplete['"]\)/,
  'An incomplete service plan must fail closed and enter guarded automatic recovery.',
);
if (/is_public_booking_slot_available/.test(servicePartSource)) {
  throw new Error(
    'No service plan may fall back to independent per-interval availability checks.',
  );
}
requirePattern(
  /const normalizeBatchAvailability = \([\s\S]*?expectedSlotTimes\.every\([\s\S]*?Object\.prototype\.hasOwnProperty\.call\(source, slotTime\)[\s\S]*?typeof source\[slotTime\] === ['"]boolean['"][\s\S]*?expectedSlotTimes\.map/,
  'Selected-day planners must accept only a complete boolean map for every requested slot.',
);
requirePattern(
  /normalizeBatchAvailability\([\s\S]*?batchResult\.data,[\s\S]*?requestChunk\.map\(\(item\) => item\.slotTime\)[\s\S]*?normalizeBatchAvailability\(dependencyPlanResult\.data, slotTimeChunk\)[\s\S]*?normalizeBatchAvailability\(compositionResult\.data, slotTimeChunk\)/,
  'Simple, phased, dependency and composition planners must validate the exact requested slot keys.',
);
requirePattern(
  /requestChunk\.length > 1[\s\S]*?\(!batchResult\.error \|\| shouldSplitPublicAvailabilityBatchError\(batchResult\.error\)\)[\s\S]*?slotTimeChunk\.length > 1[\s\S]*?\(!dependencyPlanResult\.error \|\|[\s\S]*?shouldSplitPublicAvailabilityBatchError\(dependencyPlanResult\.error\)\)[\s\S]*?slotTimeChunk\.length > 1[\s\S]*?\(!compositionResult\.error \|\|[\s\S]*?shouldSplitPublicAvailabilityBatchError\(compositionResult\.error\)\)/,
  'A partial map without an RPC error must be bisected just like an eligible transient failure.',
);
requirePattern(
  /const availabilityAbortController = new AbortController\(\)[\s\S]*?requestTimedOut = true;[\s\S]*?availabilityAbortController\.abort\(\)[\s\S]*?return \(\) => \{[\s\S]*?cancelled = true;[\s\S]*?availabilityAbortController\.abort\(\)/,
  'Timeouts and effect cleanup must abort obsolete selected-day network work.',
);
for (const rpcName of [
  'get_public_phased_booking_slot_availability_batch_v4',
  'get_public_booking_slot_availability_batch_v3',
  'get_public_dependency_slot_availability_batch_v1',
  'get_public_composition_slot_availability_batch_v1',
]) {
  const rpcPattern = new RegExp(
    `\\.rpc\\('${rpcName}'[\\s\\S]{0,1400}?\\.abortSignal\\(availabilityAbortController\\.signal\\)`,
  );
  if (!rpcPattern.test(selectedPlannerSource)) {
    throw new Error(`${rpcName} must share the selected-day AbortController signal.`);
  }
}
requirePattern(
  /const scheduleAutomaticSlotAvailabilityRetry = \(\) =>[\s\S]*?setLivePublicSlotAvailabilityRetryRevision\(\(current\) => current \+ 1\)/,
  'Automatic selected-slot recovery must use its own retry revision.',
);
if (/setLivePublicSlotAvailabilityRefreshRevision/.test(automaticRetrySource)) {
  throw new Error(
    'A selected-slot retry must not masquerade as a global realtime invalidation.',
  );
}
requirePattern(
  /const rawLivePublicOperatorId = operatoreId\.trim\(\);[\s\S]*?const livePublicPlanOperatorId =[\s\S]*?isSalonCapacityOperatorId\(rawLivePublicOperatorId\)[\s\S]*?\? ''[\s\S]*?const requestedOperatorId = livePublicPlanOperatorId;/,
  'Every automatic public plan, including a simple service, must send null instead of a salon-capacity pseudo id.',
);
if (
  /get_public_booking_slot_availability_batch_v3[\s\S]*?p_requested_operator_id:\s*(?:requestedOperatorIdCandidate|operatoreId)/.test(
    source,
  )
) {
  throw new Error(
    'The simple-service planner must not receive a pseudo or raw automatic operator id.',
  );
}
requirePattern(
  /livePublicOperatorSelectionMode =[\s\S]*?'explicit'[\s\S]*?'any-eligible'[\s\S]*?'salon-capacity'/,
  'Selecting any eligible operator must reuse the identical preview planner proof while explicit and simple-capacity queries remain isolated.',
);
requirePattern(
  /parentAvailabilityMap\[slotTime\] === true/,
  'Only an explicitly available full plan may expose a bookable slot.',
);
requirePattern(
  /setLivePublicSlotAvailabilityMap\(unavailableMap\)[\s\S]*?livePublicSlotAvailabilityAuthoritativeKeyRef\.current = ''[\s\S]*?setIsLivePublicSlotAvailabilityLoading\(false\)/,
  'Complex availability recovery must keep every slot disabled until the planner is authoritative.',
);
requirePattern(
  /isLivePublicSlotAvailabilityPendingForCurrentQuery =[\s\S]*?!isLivePublicSlotAvailabilityResolvedForCurrentQuery \|\|[\s\S]*?!isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery[\s\S]*?shouldShowLiveSlotLoadingState =[\s\S]*?isLivePublicSlotAvailabilityPendingForCurrentQuery/,
  'Unresolved and non-authoritative recovery states must render neutral loading instead of false red slots.',
);
requirePattern(
  /const shouldRenderExpandedTimeGrid =\s*!shouldShowLiveSlotLoadingState &&\s*visibleExpandedFrontendTimeSlots\.length > 0/,
  'The provisional expanded slot grid must stay hidden while neutral loading is visible.',
);
if (/commitLivePublicDayFullAuthority/.test(automaticRetrySource)) {
  throw new Error(
    'Timeout recovery must not overwrite a day label with a non-authoritative all-red map.',
  );
}
requirePattern(
  /setLivePublicSlotAvailabilityMap\(nextAvailabilityMap\)[\s\S]*?livePublicSlotAvailabilityAuthoritativeKeyRef\.current = livePublicSlotAvailabilityQueryKey/,
  'Only a successful complete planner response may mark live availability authoritative.',
);
requirePattern(
  /currentLivePublicSlotAvailabilityMap =[\s\S]*?livePublicSlotAvailabilityResolvedKeyRef\.current === livePublicSlotAvailabilityQueryKey[\s\S]*?isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery/,
  'Availability from a previous day or service query must be namespaced away from the current UI.',
);
requirePattern(
  /const loadAtomicBlock = async[\s\S]*?hasBlockDirtyVersionChanged[\s\S]*?staleProofDateValues = block\.dateValues\.filter[\s\S]*?publishBlockSnapshot\(snapshot, cacheKey\)/,
  'Only one active, complete and non-dirty booking block may update day full-state proof.',
);
requirePattern(
  /livePublicCompositionPlanSignature[\s\S]*?compositionAllowSplitOperators[\s\S]*?compositionItems[\s\S]*?position[\s\S]*?durationOverrideMinutes[\s\S]*?requiredRole[\s\S]*?buildFrontendAvailabilityServicesSignature\(compositionServices\)[\s\S]*?macchinarioIds[\s\S]*?compositionPlanSignature: livePublicCompositionPlanSignature/,
  'Composition availability proofs must include ordered children, timing, roles, phases and machinery.',
);
requirePattern(
  /if \(!isCurrentWorkspaceSalon\) \{[\s\S]*?livePublicDaySummaryState\.planKey !== livePublicDaySummaryPlanKey[\s\S]*?livePublicDaySummaryPresentationStatuses\?\.\[dateValue\][\s\S]*?summaryStatus === 'full'[\s\S]*?summaryStatus === 'available'[\s\S]*?: null/,
  'Every public day may preserve its visual state while exact atomic authority refreshes.',
);
if (/isAuthorityReady: boolean|if \(!isAuthorityReady\)|Disponibilità del segmento in aggiornamento/.test(source)) {
  throw new Error(
    'Pending dates must not replace the whole picker with a skeleton.',
  );
}
requirePattern(
  /if \(\(isPast && !pastDaysReady\) \|\| \(isAvailabilityPending && !isPast && !availability.closed\)\)[\s\S]*?SkeletonShimmer/,
  'Unknown open dates must show skeletons without affecting already loaded dates.',
);
if (/['"]Calcolo['"]/.test(source)) {
  throw new Error('The customer must never see a per-card Calcolo state.');
}
requirePattern(
  /const slotRequests = displayTimeSlots\.flatMap[\s\S]*?isSlotWithinMinimumNotice\([\s\S]*?minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES[\s\S]*?locallyUnavailableSlots\.add\(slotTime\)[\s\S]*?return \[\];[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  'The authoritative public map must exclude today slots inside the minimum-notice window before deriving the day status.',
);
requirePattern(
  /const slotRequests = displayTimeSlots\.flatMap[\s\S]*?isSlotBlockedByOverride\(resolvedAvailabilitySettings, data, slotTime,[\s\S]*?selectedOperatorId: requestedOperatorId \|\| null[\s\S]*?locallyUnavailableSlots\.add\(slotTime\)[\s\S]*?return \[\];[\s\S]*?get_public_booking_slot_availability_batch_v3/,
  'The authoritative public map must include global or selected-operator manual slot blocks.',
);
requirePattern(
  /const orariInConflitto =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  'A complete public server result must not be turned all-red by a stale bootstrap operator or appointment snapshot.',
);
requirePattern(
  /const orariNonDisponibili =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  'A complete public result must not be rejected by an incomplete local availability count.',
);
requirePattern(
  /const orariOccupati =[\s\S]*?liveAvailability === true[\s\S]*?if \(!isCurrentWorkspaceSalon\)[\s\S]*?return false;/,
  'A complete public result must not be rejected by stale local occupancy.',
);
if (/cachedAuthority[\s\S]{0,500}?\?\? false/.test(dayFullAuthoritySource)) {
  throw new Error('An unknown public day must not be presented as available.');
}
if (/requiresAuthoritativePlanAvailability/.test(dayFullAuthoritySource)) {
  throw new Error(
    'Simple-service day labels must not bypass server authority and derive a false full state from bootstrap data.',
  );
}
if (
  dayFullAuthoritySource.indexOf('if (!isCurrentWorkspaceSalon)') < 0 ||
  dayFullAuthoritySource.indexOf('if (!isCurrentWorkspaceSalon)') >
    dayFullAuthoritySource.indexOf('return !daySlots.some')
) {
  throw new Error(
    'Initial day 26 must stay unknown/selectable until authority, and tapping day 27 must not change how day 26 is evaluated.',
  );
}
requirePattern(
  /servizio\.trim\(\) &&[\s\S]{0,400}?isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery\)[\s\S]{0,200}?!canAnySlotBeBooked \? \([\s\S]{0,300}?Nessuno slot libero/,
  'The empty-day message must never be inferred from a fail-closed recovery map.',
);
requirePattern(
  /FRONTEND_COMPLEX_LIVE_SLOT_REQUEST_TIMEOUT_MS = 35 \* 1000[\s\S]*?isComplexAvailabilityRequest[\s\S]*?FRONTEND_COMPLEX_LIVE_SLOT_REQUEST_TIMEOUT_MS/,
  'Multi-phase and linked planners must have enough time for sequential recovery.',
);
requirePattern(
  /scheduleNativeBookingTimeStepAutoScroll[\s\S]*?bookingTimeSectionLayoutRef\.current[\s\S]*?scrollFrontendToY\(Math\.max\(0, latestSectionY - 18\), true\)[\s\S]*?setTimeout\(scrollTimeStepToTop, 420\)/,
  'Native operator selection must anchor the latest time-step layout at the top.',
);
requirePattern(
  /scheduleWebBookingTimeStepTopScroll[\s\S]*?scrollBookingStepDomIntoView\(BOOKING_TIME_SECTION_DOM_ID, true, 0\)/,
  'Web operator selection must anchor step 4 at the top without an extra offset.',
);
requirePattern(
  /setUseAutomaticPhaseOperatorAssignment\(true\)[\s\S]*?scheduleWebBookingTimeStepTopScroll\(\)[\s\S]*?scheduleNativeBookingTimeStepAutoScroll\(\)[\s\S]*?setUseAutomaticPhaseOperatorAssignment\(false\)[\s\S]*?scheduleWebBookingTimeStepTopScroll\(\)[\s\S]*?scheduleNativeBookingTimeStepAutoScroll\(\)/,
  'Both automatic and explicit operator choices must advance from step 3 to step 4.',
);

console.log('Client multi-phase slot loading contracts passed.');
