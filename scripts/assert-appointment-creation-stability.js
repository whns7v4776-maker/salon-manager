/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contextSource = fs.readFileSync(
  path.join(root, "src/context/AppContext.tsx"),
  "utf8",
);
const agendaSource = fs.readFileSync(
  path.join(root, "app/(tabs)/agenda.tsx"),
  "utf8",
);
const iosAgendaDayPickerSource = fs.readFileSync(
  path.join(
    root,
    "modules/wheel-picker-haptics/ios/AgendaDayPickerView.swift",
  ),
  "utf8",
);
const clientNotificationsSource = fs.readFileSync(
  path.join(root, "src/context/ClientNotificationsContext.tsx"),
  "utf8",
);
const pushNotificationsSource = fs.readFileSync(
  path.join(root, "src/lib/push/push-notifications.ts"),
  "utf8",
);
const ownerCompositionPushMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820123000_single_client_push_for_owner_compositions.sql",
  ),
  "utf8",
);
const ownerCompositionPushFinalizerSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820131000_finalize_single_owner_composition_push.sql",
  ),
  "utf8",
);
const ownerCompositionPushHardeningSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820132500_harden_owner_composition_push_finalizer.sql",
  ),
  "utf8",
);
const poseResizeConfirmationMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820173500_confirm_pose_resize_choices.sql",
  ),
  "utf8",
);
const poseCoverageMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820184500_validate_pose_contains_crossed_service.sql",
  ),
  "utf8",
);
const stalePhaseTimingProtectionMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820191500_prevent_stale_phase_timing_snapshots.sql",
  ),
  "utf8",
);
const internalTesterCompositionMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260820230500_allow_internal_tester_composition_creation.sql",
  ),
  "utf8",
);
const internalTesterSingleAppointmentMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260821133000_allow_internal_tester_single_appointment_creation.sql",
  ),
  "utf8",
);
const ownerCreatedAppointmentPushMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260826013000_canonicalize_owner_created_appointment_push.sql",
  ),
  "utf8",
);

const applySnapshotForRevision = ({
  current,
  remote,
  revisionAtStart,
  currentRevision,
}) => (revisionAtStart === currentRevision ? remote : current);

const reconcileConfirmedCompositionGuard = ({
  guard,
  remoteIds,
  source,
  now,
  deletedIds = [],
}) => {
  const deleted = new Set(deletedIds);
  const expectedIds = guard.expectedIds.filter((id) => !deleted.has(id));
  if (expectedIds.length === 0 || now - guard.createdAt > 5 * 60 * 1000) {
    return { guard: null, preserveIds: [] };
  }

  const isFullyAcknowledged = expectedIds.every((id) => remoteIds.includes(id));
  const nextGuard = {
    ...guard,
    expectedIds,
    authoritativeAcknowledged:
      guard.authoritativeAcknowledged ||
      (isFullyAcknowledged && source === "authoritative"),
    portalAcknowledged:
      guard.portalAcknowledged || (isFullyAcknowledged && source === "portal"),
  };

  if (nextGuard.authoritativeAcknowledged && nextGuard.portalAcknowledged) {
    return { guard: null, preserveIds: [] };
  }

  return {
    guard: nextGuard,
    preserveIds: isFullyAcknowledged ? [] : expectedIds,
  };
};

assert.deepEqual(
  applySnapshotForRevision({
    current: ["composition-phase-1", "composition-phase-2"],
    remote: [],
    revisionAtStart: 0,
    currentRevision: 1,
  }),
  ["composition-phase-1", "composition-phase-2"],
  "A pre-commit snapshot must not remove a newly confirmed composition.",
);
assert.deepEqual(
  applySnapshotForRevision({
    current: ["deleted-appointment"],
    remote: [],
    revisionAtStart: 1,
    currentRevision: 1,
  }),
  [],
  "A fresh authoritative snapshot must still apply a real deletion.",
);

const confirmedGroup = {
  createdAt: 0,
  expectedIds: ["phase-1", "phase-2", "phase-3"],
  authoritativeAcknowledged: false,
  portalAcknowledged: false,
};
const staleAfterLegacyGuard = reconcileConfirmedCompositionGuard({
  guard: confirmedGroup,
  remoteIds: [],
  source: "authoritative",
  now: 31_000,
});
assert.deepEqual(
  staleAfterLegacyGuard.preserveIds,
  ["phase-1", "phase-2", "phase-3"],
  "A confirmed composition must survive a stale snapshot after the old 30 second guard.",
);
const partialAuthoritative = reconcileConfirmedCompositionGuard({
  guard: staleAfterLegacyGuard.guard,
  remoteIds: ["phase-1", "phase-2"],
  source: "authoritative",
  now: 32_000,
});
assert.deepEqual(
  partialAuthoritative.preserveIds,
  ["phase-1", "phase-2", "phase-3"],
  "A partial multi-row snapshot must preserve the whole confirmed composition.",
);
const acknowledgedAuthoritative = reconcileConfirmedCompositionGuard({
  guard: partialAuthoritative.guard,
  remoteIds: ["phase-1", "phase-2", "phase-3"],
  source: "authoritative",
  now: 33_000,
});
assert.ok(
  acknowledgedAuthoritative.guard?.authoritativeAcknowledged,
  "The private snapshot acknowledgement must be recorded.",
);
const stalePortal = reconcileConfirmedCompositionGuard({
  guard: acknowledgedAuthoritative.guard,
  remoteIds: [],
  source: "portal",
  now: 34_000,
});
assert.deepEqual(
  stalePortal.preserveIds,
  ["phase-1", "phase-2", "phase-3"],
  "A stale portal snapshot must not undo a private acknowledgement.",
);
const acknowledgedPortal = reconcileConfirmedCompositionGuard({
  guard: stalePortal.guard,
  remoteIds: ["phase-1", "phase-2", "phase-3"],
  source: "portal",
  now: 35_000,
});
assert.equal(
  acknowledgedPortal.guard,
  null,
  "Protection ends only after both private and portal snapshots contain every phase.",
);
const realDeletion = reconcileConfirmedCompositionGuard({
  guard: confirmedGroup,
  remoteIds: [],
  source: "authoritative",
  now: 31_000,
  deletedIds: ["phase-2"],
});
assert.deepEqual(
  realDeletion.guard?.expectedIds,
  ["phase-1", "phase-3"],
  "A real deletion must be removed from the protected composition immediately.",
);

assert.match(
  contextSource,
  /const ownerAppointmentMutationRevisionRef = React\.useRef\(0\)/,
  "Appointment mutation revisions must be shared by web and native context syncs.",
);
assert.match(
  contextSource,
  /const syncAuthenticatedWorkspace[\s\S]*?const appointmentMutationRevisionAtStart =[\s\S]*?canApplyFetchedAppointments[\s\S]*?setAppuntamenti\(restoredAppuntamenti\)/,
  "Authenticated workspace hydration must reject appointment snapshots started before a confirmed mutation.",
);
assert.match(
  contextSource,
  /const hadAuthoritativeAppointmentsAtStart =[\s\S]*?ownerAuthoritativeDataAccountRef\.current === normalizedEmail[\s\S]*?if \(applyToState && !hadAuthoritativeAppointmentsAtStart\)[\s\S]*?setOwnerAppointmentsAuthoritative\(false\)/,
  "A routine stale refresh must not hide an already-authoritative Agenda while its appointment snapshot is rejected.",
);
assert.match(
  contextSource,
  /const runRefreshOwnerFromPortal[\s\S]*?const appointmentMutationRevisionAtStart =[\s\S]*?setAppuntamenti\(\(current\) => \{[\s\S]*?ownerAppointmentMutationRevisionRef\.current !==[\s\S]*?return current;/,
  "Portal refresh must not replace newer appointments with an older request result.",
);
assert.match(
  contextSource,
  /ownerAppointmentMutationRevisionRef\.current \+= 1;[\s\S]*?optimisticGroupAppointments\.forEach/,
  "A confirmed multi-row composition must invalidate every pre-commit appointment snapshot.",
);
assert.match(
  contextSource,
  /const updateOwnerPhasedAppointmentTimesForSalon[\s\S]*?confirmedAppointmentSnapshot[\s\S]*?markRecentlyMovedAppointmentSnapshot\(confirmedAppointmentSnapshot\)[\s\S]*?ownerAppointmentMutationRevisionRef\.current \+= 1;[\s\S]*?applyConfirmedPhasedTiming[\s\S]*?updateOwnerFinancialAppointmentsForWorkspace\([\s\S]*?applyConfirmedPhasedTiming/,
  "A confirmed phased resize must update both Agenda and the financial projection used by portal publishers.",
);
assert.match(
  stalePhaseTimingProtectionMigrationSource,
  /protect_client_portal_canonical_timing_v1[\s\S]*?before insert or update of appuntamenti, richieste_prenotazione[\s\S]*?protect_owner_snapshot_canonical_timing_v1[\s\S]*?before insert or update of payload/,
  "Derived portal and owner snapshots must reject stale timing from older open clients.",
);
assert.match(
  contextSource,
  /registerPendingConfirmedCompositionGroup\([\s\S]*?groupId \|\| idempotencyKey[\s\S]*?optimisticGroupAppointments/,
  "A confirmed composition must register every optimistic phase for acknowledgement-based reconciliation.",
);
assert.match(
  contextSource,
  /authoritativeAcknowledged[\s\S]*?portalAcknowledged[\s\S]*?pendingAppointments/,
  "Composition protection must wait for both private and portal acknowledgements and carry missing rows forward.",
);
assert.match(
  contextSource,
  /markRecentlyDeletedAppointment[\s\S]*?pendingConfirmedCompositionGroupsRef\.current\.forEach[\s\S]*?remainingAppointments/,
  "Realtime or explicit deletions must remove rows from the confirmed-composition guard.",
);
assert.match(
  agendaSource,
  /const hasAgendaFrontendCustomerIdentity =[\s\S]*?request\.origine === 'frontend'[\s\S]*?hasMatchingContact\(request\)/,
  "Composition creation must recognize a real frontend identity from matching request history.",
);
assert.match(
  agendaSource,
  /const hasFrontendIdentity = hasAgendaFrontendCustomerIdentity[\s\S]*?createBookingRequests =[\s\S]*?hasFrontendIdentity[\s\S]*?customerSource: hasFrontendIdentity \? 'frontend' : 'salone'/,
  "Composition requests and customer source must use the same canonical frontend identity decision.",
);
assert.match(
  agendaSource,
  /balancedServiceLabel[\s\S]*?bestSplit[\s\S]*?slice\(bestSplit\)[\s\S]*?whiteSpace: 'pre-line'[\s\S]*?wordBreak: 'keep-all'/,
  "Agenda service badges must split only between words and remain complete on at most two balanced lines.",
);
assert.match(
  agendaSource,
  /premiumServiceLongestLineLength[\s\S]*?fittedPremiumServiceFontSize/,
  "Narrow Agenda service badges must fit type against their longest complete line.",
);
assert.match(
  agendaSource,
  /appointmentGroupDisplayPositionById[\s\S]*?displayPositionById\.set\(item\.id, `\$\{index \+ 1\}\/\$\{members\.length\}`\)/,
  "Agenda phase badges must derive one-based numbering from the real ordered group instead of incrementing persisted order twice.",
);
assert.match(
  agendaSource,
  /nextProcessingDuration !== phaseConfig\.processingDurationMinutes[\s\S]*?La posa verrebbe eliminata[\s\S]*?Elimina posa[\s\S]*?Mantieni e slitta/,
  "Every drag resize that changes a transparent pose must stop for an explicit salon choice.",
);
assert.match(
  agendaSource,
  /processingDurationMinutes !== originalProcessingMinutes[\s\S]*?Conferma modifica posa[\s\S]*?savePhasedTimes/,
  "The phased-time editor must also confirm every pose change before saving.",
);
assert.match(
  agendaSource,
  /phaseStatusLabel[\s\S]*?hasActualProcessingPause[\s\S]*?`POSA \$\{processingDurationMinutes\} MIN`/,
  "A phase badge must advertise POSA only while a real processing pause still exists.",
);
assert.match(
  agendaSource,
  /compositionPartNumber[\s\S]*?standalonePhasePartNumber[\s\S]*?isRenderedFinalPhase[\s\S]*?'2\/2'[\s\S]*?phaseDisplayPosition[\s\S]*?phaseStatusLabel[\s\S]*?isRenderedFinalPhase[\s\S]*?'RIPRESA'/,
  "A post-pose working card must say RIPRESA together with its logical group or internal phase position.",
);
assert.match(
  agendaSource,
  /hasActualProcessingPause[\s\S]*?`POSA \$\{processingDurationMinutes\} MIN`[\s\S]*?phaseStatusSeparator =[\s\S]*?hasActualProcessingPause && !isOverlappedPhase \? ' \+ ' : ' · '/,
  "A pose badge must show its real duration and join it to the logical phase position.",
);
assert.match(
  agendaSource,
  /agendaPhaseBadgeColorByAppointmentId[\s\S]*?appointmentGroupId[\s\S]*?`group:\$\{appointmentGroupId\}`[\s\S]*?colorByAppointmentId\.set\(member\.id, resolvedColor\)/,
  "Every dependency or composition member must inherit one stable phase-badge color from its linked group.",
);
assert.match(
  agendaSource,
  /phaseBadgeIdentityColor[\s\S]*?phaseSemanticColor[\s\S]*?phaseBadgeTone = \{[\s\S]*?borderColor: phaseSemanticColor[\s\S]*?backgroundColor: serviceIdentityColor/,
  "Agenda phase badges must use the linked-group color while service bars retain their own service identity color.",
);
assert.match(
  poseResizeConfirmationMigrationSource,
  /p_processing_duration_minutes[\s\S]*?< 0[\s\S]*?p_shift_following[\s\S]*?apply_owner_linked_reorganization_v1/,
  "The server must support a confirmed zero-minute pose and an optional atomic shift of later composition phases.",
);
assert.match(
  agendaSource,
  /poseStartMinutes[\s\S]*?fullyInsidePose[\s\S]*?poseCoverageWarning/,
  "Agenda drag preview must require the crossed service envelope to fit completely inside the transparent pose.",
);
assert.match(
  poseCoverageMigrationSource,
  /candidate_envelopes[\s\S]*?candidate\.starts_at >= v_pose_start[\s\S]*?candidate\.ends_at <= v_pose_end[\s\S]*?pose_does_not_cover_service/,
  "The server must enforce complete pose containment before persisting the crossed-service move.",
);
assert.match(
  fs.readFileSync(path.join(root, "app/cliente-screen.tsx"), "utf8"),
  /logicalBookingLastMember[\s\S]*?logicalBookingEndMinute[\s\S]*?logicalBookingApproxDurationMinutes[\s\S]*?circa[\s\S]*?formatDurationLabel/,
  "A client composition card must show an approximate duration through its final logical member.",
);
assert.match(
  contextSource,
  /title: 'Nuovo appuntamento'[\s\S]*?type: 'appointment_created_by_salon'[\s\S]*?notificationScope: 'appointment_group'/,
  "The no-mirror fallback must use the canonical client appointment event.",
);
assert.match(
  contextSource,
  /Prenota Slot e sempre backoffice[\s\S]*?origine: 'backoffice'/,
  "A salon-created appointment mirror must not inherit the customer's registry source as its booking origin.",
);
assert.match(
  ownerCreatedAppointmentPushMigrationSource,
  /owner_created_client_push[\s\S]*?custom''::public\.push_event_type[\s\S]*?Appuntamento aggiunto dal salone[\s\S]*?appointment_created_by_salon/,
  "The mirrored single appointment must queue the canonical salon-created push instead of an accepted-request push.",
);
assert.match(
  ownerCreatedAppointmentPushMigrationSource,
  /owner_created_backoffice_origin[\s\S]*?update public\.booking_requests as owner_created_backoffice_origin[\s\S]*?set origin = ''backoffice''::public\.request_origin[\s\S]*?where owner_created_backoffice_origin\.id = v_booking_request_id[\s\S]*?origin is distinct from ''backoffice''::public\.request_origin/,
  "The owner RPC must correct only its newly-created request mirror to backoffice origin.",
);
assert.match(
  ownerCreatedAppointmentPushMigrationSource,
  /position\('owner_created_backoffice_origin' in v_next_definition\) = 0[\s\S]*?position\('set origin = ''backoffice''::public\.request_origin' in v_next_definition\) = 0[\s\S]*?position\('where owner_created_backoffice_origin\.id = v_booking_request_id' in v_next_definition\) = 0[\s\S]*?position\('origin is distinct from ''backoffice''::public\.request_origin' in v_next_definition\) = 0/,
  "The dynamic owner-origin patch must be marker-idempotent and assert the exact request-id update.",
);
assert.doesNotMatch(
  ownerCreatedAppointmentPushMigrationSource,
  /create_owner_appointment_group_v\d|create_public_booking/,
  "The origin correction migration must remain scoped to the single owner appointment RPC.",
);
assert.match(
  contextSource,
  /if \([\s\S]*?!createBookingRequests[\s\S]*?isUuidValue\(createdWorkspaceId\)[\s\S]*?queueWorkspacePushNotification[\s\S]*?void \(async \(\) => \{[\s\S]*?resolveSalonByCode/,
  "Fallback push queuing must happen before and independently from portal realignment.",
);
assert.match(
  clientNotificationsSource,
  /'appointment_group_created_by_salon'/,
  "Previously queued group events must remain visible in the in-app notification pipeline.",
);
assert.match(
  pushNotificationsSource,
  /'appointment_group_created_by_salon'/,
  "Previously queued group events must remain eligible for native push presentation.",
);
assert.match(
  ownerCompositionPushMigrationSource,
  /create_owner_appointment_group_v1/,
  "The push guard must patch the canonical owner composition writer.",
);
assert.match(
  ownerCompositionPushMigrationSource,
  /salonpro\.skip_booking_request_push[\s\S]*?for v_item in select value from jsonb_array_elements\(p_items\)/,
  "Owner compositions must suppress partial per-phase pushes while the group is assembled.",
);
assert.doesNotMatch(
  ownerCompositionPushMigrationSource,
  /create table|alter table|drop table/i,
  "The notification fix must not change the appointment data model.",
);
assert.match(
  ownerCompositionPushFinalizerSource,
  /delete from public\.push_notifications[\s\S]*?notification\.status = 'queued'[\s\S]*?bookingRequestId/,
  "The composition finalizer must remove only unsent partial phase pushes.",
);
assert.match(
  ownerCompositionPushFinalizerSource,
  /'type', 'appointment_created_by_salon'[\s\S]*?'notificationScope', 'appointment_group'[\s\S]*?'bookingTimeline', v_timeline/,
  "The replacement push must describe one logical composition with its timeline.",
);
assert.match(
  ownerCompositionPushFinalizerSource,
  /old\.customer_id is null[\s\S]*?new\.customer_id is not null[\s\S]*?queue_owner_composition_created_push_v1/,
  "The replacement push must run only while the new group is finalized.",
);
assert.match(
  ownerCompositionPushFinalizerSource,
  /v_request_count < v_expected_count[\s\S]*?return;/,
  "A partially assembled group must never produce a customer push.",
);
assert.doesNotMatch(
  ownerCompositionPushFinalizerSource,
  /delete from public\.booking_requests|delete from public\.appointments/,
  "Push batching must not modify the in-app notification or Agenda data.",
);
assert.match(
  ownerCompositionPushHardeningSource,
  /metadata ->> 'itemCount'[\s\S]*?~ '\^\[0-9\]\+\$'[\s\S]*?else 0/,
  "The published finalizer must tolerate malformed legacy item counts.",
);
assert.match(
  ownerCompositionPushHardeningSource,
  /from unnest\(v_request_ids\)[\s\S]*?request_id::text = notification\.payload ->> 'bookingRequestId'/,
  "The published finalizer must compare request identifiers without unsafe payload UUID casts.",
);
assert.match(
  contextSource,
  /markRecentlyMovedAppointmentSnapshot\(movedAppointment\);[\s\S]*?ownerAppointmentMutationRevisionRef\.current \+= 1;[\s\S]*?replaceOwnerFinancialAppointmentsForWorkspace\([\s\S]*?stableNextAppointments[\s\S]*?appuntamentiRef\.current = stableNextAppointments;/,
  "A confirmed move must advance the appointment revision and update the authoritative owner projection before derived snapshots can publish.",
);
assert.match(
  agendaSource,
  /snapToInterval=\{DAY_CARD_FULL_WIDTH\}[\s\S]*?snapToAlignment="start"/,
  "The iOS day wheel must snap immediately to one centered day.",
);
assert.match(
  iosAgendaDayPickerSource,
  /crossedItems = abs\(nextIndex - lastHapticIndex\)[\s\S]*?emitSelectionHaptics\(crossedItems\)[\s\S]*?generator\.selectionChanged\(\)/,
  "Every crossed iOS day must emit wheel-style selection feedback.",
);
assert.match(
  internalTesterCompositionMigrationSource,
  /create_owner_appointment_group_v1[\s\S]*?create_owner_appointment_group_flexible_v1[\s\S]*?workspace\.is_internal_tester = true/,
  "Internal tester access must reach both atomic composition writers.",
);
assert.match(
  internalTesterSingleAppointmentMigrationSource,
  /create_owner_appointment_flexible_v1[\s\S]*?workspace\.is_internal_tester = true/,
  "Internal tester access must also reach the single-service appointment writer.",
);
assert.match(
  internalTesterSingleAppointmentMigrationSource,
  /left join public\.workspace_members[\s\S]*?workspace\.owner_email[\s\S]*?auth\.jwt\(\) ->> 'email'/,
  "Single-service creation must resolve a recreated owner identity by canonical email.",
);

console.log("Appointment creation stability contracts: OK");
