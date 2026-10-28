/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const agendaSource = fs.readFileSync(
  path.join(root, "app/(tabs)/agenda.tsx"),
  "utf8",
);
const contextSource = fs.readFileSync(
  path.join(root, "src/context/AppContext.tsx"),
  "utf8",
);

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

const suppressionGuardSource = sliceBetween(
  agendaSource,
  "const isAgendaAppointmentRecentlySuppressedDeleted",
  "const markAgendaRequestSyncKeyAsLocallyDeleted",
);
const cancellationSource = sliceBetween(
  agendaSource,
  "async function runAgendaAppointmentCancellation",
  "async function cancelAgendaAppointmentItem",
);
const cancellationLockSource = sliceBetween(
  agendaSource,
  "async function cancelAgendaAppointmentItem",
  "const closeAvailabilityImpactModal",
);
const confirmationControllerSource = sliceBetween(
  agendaSource,
  "const [webWeekDragConfirmation, setWebWeekDragConfirmation]",
  "const weekDragSourceRef",
);
const draftOverlaySource = sliceBetween(
  agendaSource,
  "const appointmentsWithReorganizationDraft",
  "const appointmentsWithResizeVisualPreview",
);
const draftAuthoritySyncSource = sliceBetween(
  agendaSource,
  "useEffect(() => {\n    if (!weekReorganizationDraftRef.current) return;",
  "const weekReorganizationDraftAppointmentIds",
);
const draftApplySource = sliceBetween(
  agendaSource,
  "const applyWeekReorganizationDraft",
  "const endWeekAppointmentDrag",
);
const detailsDeletionSource = sliceBetween(
  agendaSource,
  "const deleteWeekAppointmentFromDetails",
  "const weekAppointmentPendingRequestId",
);
const orphanLaneCleanupSource = sliceBetween(
  agendaSource,
  "const promptHistoricalLaneCleanup",
  "const promptHistoricalLaneCleanupRef",
);
const pendingCancellationSource = sliceBetween(
  cancellationSource,
  "if (pendingRequestId && item.syntheticRequestStatus === 'In attesa')",
  "const matchingAcceptedRequest",
);
const acceptedCancellationSource = sliceBetween(
  cancellationSource,
  "if (matchingAcceptedRequest)",
  "const cancellationContacts = resolveCancellationCustomerContacts();",
);
const genericCancellationSource = sliceBetween(
  cancellationSource,
  "const cancellationContacts = resolveCancellationCustomerContacts();",
  "completeSuccess();\n    return { ok: true };",
);
const phaseCancellationSource = sliceBetween(
  contextSource,
  "if (linkedCancellationScope === 'phase')",
  "const isImmediateCancelledAppointment",
);
const ownerCancellationSource = sliceBetween(
  contextSource,
  "const cancelOwnerAppointmentForSalon = async",
  "const moveOwnerAppointmentForSalon = async",
);
const linkedReorganizationSource = sliceBetween(
  contextSource,
  "const reorganizeOwnerLinkedAppointmentsForSalon = async",
  "const swapOwnerAppointmentCompositionsForSalon = async",
);
const requestStatusSource = sliceBetween(
  contextSource,
  "const updateBookingRequestStatusForSalon = async",
  "const refreshOwnerSubscriptionFromServer",
);

const assertServerFirstBranch = ({
  source,
  awaitMarker,
  mutationMarkers,
  label,
}) => {
  const awaitIndex = source.indexOf(awaitMarker);
  const errorGuardIndex = source.indexOf("if (!result?.ok)", awaitIndex);
  assert.notEqual(awaitIndex, -1, `${label}: missing server await.`);
  assert.notEqual(errorGuardIndex, -1, `${label}: missing failure guard.`);

  mutationMarkers.forEach((marker) => {
    const mutationIndexes = [];
    let cursor = source.indexOf(marker);
    while (cursor !== -1) {
      mutationIndexes.push(cursor);
      cursor = source.indexOf(marker, cursor + marker.length);
    }
    assert.equal(
      mutationIndexes.length,
      1,
      `${label}: expected exactly one ${marker} mutation.`,
    );
    assert.ok(
      mutationIndexes[0] > errorGuardIndex,
      `${label}: ${marker} must run only after the server success guard.`,
    );
  });
};

assert.doesNotMatch(
  cancellationSource,
  /restoreAppointmentInLocalState|suppressedVisualKeysForRollback|unmarkAppointmentAsLocallyDeleted/,
  "Agenda deletion must not use optimistic removal followed by visual rollback.",
);
assertServerFirstBranch({
  source: pendingCancellationSource,
  awaitMarker: "await updateBookingRequestStatusForSalon",
  mutationMarkers: ["markAgendaRequestSyncKeyAsLocallyDeleted({"],
  label: "Pending request cancellation",
});
assertServerFirstBranch({
  source: acceptedCancellationSource,
  awaitMarker: "await deletionPromise",
  mutationMarkers: [
    "markAgendaRequestSyncKeyAsLocallyDeleted({",
    ").forEach(markAppointmentAsLocallyDeleted);",
    "removeAppointmentFromLocalState();",
  ],
  label: "Accepted request cancellation",
});
assertServerFirstBranch({
  source: genericCancellationSource,
  awaitMarker: "await deletionPromise",
  mutationMarkers: [
    "markAgendaRequestSyncKeyAsLocallyDeleted({",
    ").forEach(markAppointmentAsLocallyDeleted);",
    "removeAppointmentFromLocalState();",
  ],
  label: "Generic appointment cancellation",
});
assert.doesNotMatch(
  pendingCancellationSource,
  /removeAppointmentFromLocalState\(\)/,
  "A pending request cancellation must not remove a real appointment card.",
);
assert.equal(
  (cancellationSource.match(/deferLocalStateUntilConfirmed: true/g) ?? [])
    .length,
  3,
  "Every Agenda cancellation path must require server-confirmed local state.",
);
assert.match(
  cancellationLockSource,
  /agendaCancellationInFlightRef\.current\.get\(resourceKey\)[\s\S]*?if \(inFlight\.scope === scope\) \{[\s\S]*?return inFlight\.promise;[\s\S]*?agendaCancellationInFlightRef\.current\.set\(resourceKey,[\s\S]*?finally \{[\s\S]*?agendaCancellationInFlightRef\.current\.delete\(resourceKey\)/,
  "Agenda cancellation must reuse an identical in-flight mutation and release its resource lock.",
);
assert.match(
  confirmationControllerSource,
  /kind\?: 'move' \| 'resize' \| 'reminder' \| 'delete'/,
  "Phase deletion must use an explicit confirmation presentation kind.",
);
assert.match(
  confirmationControllerSource,
  /if \(!button\.awaitCompletion\)[\s\S]*?webWeekDragConfirmationActionInFlightRef\.current = true;[\s\S]*?busyButtonIndex:[\s\S]*?Promise\.resolve\(\)[\s\S]*?\.then\(\(\) => action\(\)\)[\s\S]*?\.finally/,
  "Server-first destructive confirmations must remain mounted and locked until their async action settles.",
);
assert.match(
  detailsDeletionSource,
  /awaitCompletion: true[\s\S]*?busyText: 'Elimino la fase…'[\s\S]*?await executeDeletion\('phase'\)[\s\S]*?awaitCompletion: true[\s\S]*?await executeDeletion\('group'\)[\s\S]*?'delete'/,
  "Phase and whole-composition deletion buttons must await completion in the delete confirmation.",
);
assert.match(
  draftOverlaySource,
  /persistedDraftIds[\s\S]*?!baseIds\.has\(item\.id\)[\s\S]*?pendingComposition[\s\S]*?!persistedDraftIds\.has\(item\.id\)/,
  "The draft overlay must intersect persisted rows with Agenda authority while preserving pending-only rows.",
);
assert.match(
  draftAuthoritySyncSource,
  /reconcilePersistedMembership = !currentDraft\.pendingComposition[\s\S]*?authoritativeById\.has\(item\.id\)[\s\S]*?membershipRemoved/,
  "An active persisted draft must remove rows that disappear from Agenda authority.",
);
assert.doesNotMatch(
  draftApplySource,
  /Sono state ripristinate senza salvare nulla/,
  "Draft stabilization must never describe or perform restoration of an authority-deleted phase.",
);
assert.match(
  draftApplySource,
  /persistedOriginalIds\.has\(item\.id\)[\s\S]*?expectedById\.set\(item\.id,[\s\S]*?removedPersistedDraftAppointments[\s\S]*?Le fasi eliminate sono state rimosse anche dalla bozza/,
  "The final stabilization preflight must reconcile membership from current Agenda authority.",
);
assert.match(
  draftApplySource,
  /agendaLinkedMutationInFlightRef\.current\.has\(groupKey\)[\s\S]*?agendaLinkedMutationInFlightRef\.current\.add\(groupKey\)[\s\S]*?reorganizationPromise\.finally[\s\S]*?agendaLinkedMutationInFlightRef\.current\.delete\(groupKey\)/,
  "Draft stabilization must hold and release the same linked-group mutation lock used by deletion.",
);
assert.match(
  draftApplySource,
  /result\.errorCode === 'group_plan_changed'[\s\S]*?weekReorganizationDraftRef\.current = null;[\s\S]*?setWeekReorganizationDraft\(null\)[\s\S]*?Composizione aggiornata[\s\S]*?riaprila dall’Agenda/,
  "A server membership revision conflict must invalidate the stale draft instead of offering an endless retry.",
);
assert.match(
  cancellationLockSource,
  /agendaLinkedMutationInFlightRef\.current\.has\(linkedGroupKey\)[\s\S]*?agendaLinkedMutationInFlightRef\.current\.add\(linkedGroupKey\)[\s\S]*?finally \{[\s\S]*?agendaLinkedMutationInFlightRef\.current\.delete\(linkedGroupKey\)/,
  "Cancellation must not race a stabilization on the same appointment group.",
);
assert.match(
  detailsDeletionSource,
  /if \(result\.ok && groupId\)[\s\S]*?draftTouchesDeletedGroup[\s\S]*?weekReorganizationDraftRef\.current = null;[\s\S]*?setWeekReorganizationDraft\(null\)/,
  "A successful phase deletion must invalidate any draft built from the old group membership.",
);
assert.match(
  orphanLaneCleanupSource,
  /const laneFutureDeletionTargets = dedupeImpactAppointments\([\s\S]*?for \(const appointment of laneFutureDeletionTargets\)/,
  "Whole-lane cleanup must cancel each appointment group only once.",
);
assert.match(
  ownerCancellationSource,
  /if \(!deferLocalStateUntilConfirmed\) \{[\s\S]*?if \(cancelError && !isConfirmedAlreadyAbsent\)[\s\S]*?if \(deferLocalStateUntilConfirmed\) \{[\s\S]*?confirmedNextAppointments/,
  "Owner cancellation must keep optimistic behavior gated off and commit the Agenda projection only after confirmation.",
);
assert.match(
  requestStatusSource,
  /!deferLocalStateUntilConfirmed &&[\s\S]*?\(status === 'Annullata' \|\| status === 'Rifiutata'\)[\s\S]*?if \(updateError && !isLegacySnapshotOnlyRequest\)[\s\S]*?if \(status === 'Annullata'\)/,
  "Terminal request state must be projected after persistence when Agenda requests confirmation.",
);
assert.match(
  cancellationSource,
  /if \(options\?\.linkedCancellationScope !== 'phase'\) \{[\s\S]*?stato: 'Annullata'[\s\S]*?cancellationSource: 'salone'/,
  "Only whole-appointment cancellation may synthesize a cancelled request in Agenda local state.",
);
assert.match(
  suppressionGuardSource,
  /const now = Date\.now\(\);[\s\S]*?pruneRecentlySuppressedDeletedAppointments\(now\);[\s\S]*?pruneRecentlySuppressedDeletedRequestBaseSyncKeys\(now\);[\s\S]*?pruneRecentlySuppressedDeletedWeekSlotVisualKeys\(now\);/,
  "Every suppression guard evaluation must discard expired appointment, request, and visual keys first.",
);
assert.match(
  suppressionGuardSource,
  /recentlySuppressedDeletedAppointmentSlotSyncKeysRef\.current\.has\([\s\S]*?const stableAppointmentId = item\.id\?\.trim\(\) \?\? '';[\s\S]*?!isSyntheticWeekAppointmentId\(stableAppointmentId\)[\s\S]*?return false;[\s\S]*?const visualLaneKeys/,
  "A stable appointment moved into a deleted phase slot must not inherit the slot-wide visual tombstone.",
);
const usesSlotWideVisualFallback = (appointmentId) => {
  const normalizedId = String(appointmentId ?? "").trim();
  return !normalizedId || normalizedId.startsWith("request-");
};
assert.equal(
  usesSlotWideVisualFallback("9c259d67-b74c-4aa7-88d8-e9e93c833ee9"),
  false,
  "A different persisted phase must stay visible in the slot of a deleted phase.",
);
assert.equal(
  usesSlotWideVisualFallback("request-pending-phase"),
  true,
  "Synthetic request cards must retain slot-wide fallback protection.",
);
assert.equal(
  usesSlotWideVisualFallback(""),
  true,
  "Identity-less cards must retain slot-wide fallback protection.",
);
assert.match(
  phaseCancellationSource,
  /remainingGroupAppointments\.map\(\(item, index\) => \[item\.id, index \+ 1\]\)/,
  "Remaining appointments must be reindexed from 1 through N.",
);
assert.match(
  phaseCancellationSource,
  /remainingGroupRequests\.map\(\(request, index\) => \[[\s\S]*?request\.id,[\s\S]*?index \+ 1,[\s\S]*?\]\)/,
  "Remaining technical requests must be reindexed from 1 through N.",
);
assert.match(
  phaseCancellationSource,
  /phaseCancellationPayload\?\.removedBookingRequestId \?\?[\s\S]*?phaseCancellationPayload\?\.cancelledRequestId \?\?[\s\S]*?phaseCancellationPayload\?\.bookingRequestId \?\?[\s\S]*?immediateCancelledAppointment\.bookingRequestId/,
  "The frontend must accept current, previous, and fallback names for the removed technical request id.",
);
assert.match(
  phaseCancellationSource,
  /currentRichieste[\s\S]*?\.filter\([\s\S]*?!removedBookingRequestId \|\|[\s\S]*?request\.id !== removedBookingRequestId[\s\S]*?\.map\(\(request\)/,
  "The removed technical request must leave local state instead of becoming a false client cancellation.",
);
assert.doesNotMatch(
  phaseCancellationSource,
  /request\.id === removedBookingRequestId[\s\S]*?stato: 'Annullata'/,
  "Single-phase deletion must not synthesize a cancelled technical request card.",
);
assert.match(
  phaseCancellationSource,
  /updateOwnerFinancialAppointmentsForWorkspace\([\s\S]*?\.filter\([\s\S]*?item\.id !== immediateCancelledAppointment\.id[\s\S]*?appointmentGroupOrder:[\s\S]*?remainingOrderById\.get\(item\.id\)[\s\S]*?appointmentGroupSize:\s*remainingGroupAppointments\.length/,
  "The financial appointment mirror must use the same surviving 1..N order and group size.",
);
assert.doesNotMatch(
  phaseCancellationSource,
  /enqueuePortalPublish\(/,
  "Phase deletion must not republish a pre-RPC workspace after the server has atomically pruned its projections.",
);
assert.match(
  phaseCancellationSource,
  /ownerAppointmentMutationRevisionRef\.current \+= 1;[\s\S]*?cancel_owner_composition_phase_v1/,
  "Phase deletion must invalidate refreshes that started before its server commit.",
);
assert.match(
  linkedReorganizationSource,
  /apply_owner_linked_reorganization_v5[\s\S]*?isNamedRpcUnavailableError\([\s\S]*?apply_owner_linked_reorganization_v5[\s\S]*?apply_owner_linked_reorganization_v4/,
  "Current clients must prefer the strict group-membership RPC while retaining rollout compatibility.",
);
assert.match(
  linkedReorganizationSource,
  /ownerAppointmentMutationRevisionRef\.current \+= 1;[\s\S]*?let persisted = await invokePlan\(\)/,
  "Draft stabilization must invalidate refreshes that started before its atomic commit.",
);
assert.match(
  linkedReorganizationSource,
  /errorText\.includes\('group_plan_changed'\)[\s\S]*?errorCode: 'group_plan_changed'/,
  "A stale server membership plan must return a dedicated conflict to the Agenda UI.",
);

console.log("Single-phase cancellation frontend contracts: OK");
