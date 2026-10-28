/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const agendaSource = read('app/(tabs)/agenda.tsx');
const appContextSource = read('src/context/AppContext.tsx');
const clientFrontendSource = read('app/cliente-screen.tsx');
const delegatedPolicySource = read(
  'supabase/migrations/20260821224500_allow_delegated_customer_bookings.sql',
);
const publicCustomerNoOverlapSource = read(
  'supabase/migrations/20260823155500_forbid_public_customer_time_overlap.sql',
);
const autoAcceptSource = read(
  'supabase/migrations/20260822013000_harden_phased_auto_accept_materialization.sql',
);
const groupedOwnerPushSource = read(
  'supabase/migrations/20260818012500_single_owner_push_for_linked_booking_groups.sql',
);
const restoredAutoAcceptOwnerPushSource = read(
  'supabase/migrations/20260823143000_restore_pending_owner_push_for_autoaccepted_linked_booking.sql',
);
const groupedCustomerPushSource = read(
  'supabase/migrations/20260817235500_unify_linked_booking_customer_pushes.sql',
);
const salonPushSuppressionSource = read(
  'supabase/migrations/20260610214500_suppress_backoffice_created_customer_push.sql',
);
const complexBookingBoundarySource = read(
  'supabase/migrations/20260822070000_harden_complex_public_booking_boundaries.sql',
);
const historicalOperatorIdentitySource = read(
  'supabase/migrations/20260822072000_scope_historical_operator_identity_by_workspace.sql',
);
const testerBookingLookupSource = read(
  'supabase/migrations/20260822201500_allow_internal_tester_public_booking_lookup.sql',
);
const groupedAcceptanceSource = read(
  'supabase/migrations/20260822213000_atomic_grouped_public_booking_acceptance.sql',
);
const dependencyPlanValidationSource = read(
  'supabase/migrations/20260822221000_validate_dependency_plan_before_persist.sql',
);
const phaseAwareOperatorSelectionSource = read(
  'supabase/migrations/20260822223000_align_automatic_operator_selection_with_phased_reservations.sql',
);
const dependencyAcknowledgementRecoverySource = read(
  'supabase/migrations/20260822235500_recover_dependency_ack_and_remove_orphan_reservation.sql',
);

assert.match(
  delegatedPolicySource,
  /customer_allows_delegated_booking_v1[\s\S]*?allow_same_day_same_service/,
  'The family/friend policy must still allow a second same-day booking.',
);
assert.match(
  publicCustomerNoOverlapSource,
  /prevent_public_customer_time_overlap[\s\S]*?customer_time_conflict/,
  'Every public write must retain the hard customer-envelope overlap guard.',
);
assert.match(
  publicCustomerNoOverlapSource,
  /public_customer_booking_envelope_available_v1[\s\S]*?resolve_public_dependency_operator_plan_v1/,
  'Linked-service availability must reject a conflicting customer envelope before submission.',
);

assert.match(
  agendaSource,
  /const phaseAppointment: AppuntamentoItem = \{[\s\S]*?renderedPhase: interval\.phase[\s\S]*?startByTime\[segmentStartTime\] = phaseAppointment[\s\S]*?occupyingByTime\[slotTime\] = phaseAppointment/,
  'Single-lane Agenda rendering must preserve initial/final phase identity.',
);
assert.match(
  agendaSource,
  /activeAgendaDisplayGroupStatuses[\s\S]*?item\.stato === 'In attesa'[\s\S]*?effectiveStatus/,
  'Every linked phase must keep one pending status until its whole request group is accepted.',
);
assert.match(
  appContextSource,
  /preserveRichiestaStructuralMetadata[\s\S]*?appointmentGroupId[\s\S]*?phaseConfig[\s\S]*?phaseOperatorAssignments/,
  'Thin realtime rows must not erase linked-group and phased-service metadata.',
);
assert.match(
  appContextSource,
  /buildOwnerRequestFromRealtimeRow[\s\S]*?appointment_group_id[\s\S]*?appointment_group_order[\s\S]*?appointment_group_size/,
  'Realtime request hydration must retain the complete linked booking identity.',
);
assert.match(
  clientFrontendSource,
  /validationCustomerIdentityAppointments\s*=\s*validationBaseBlockingAppointments[\s\S]*?refreshedCustomerOverlapForConfirmation[\s\S]*?appointments: validationCustomerIdentityAppointments/,
  'The final customer overlap guard must use identity-complete bookings rather than anonymous public occupancy.',
);
assert.match(
  clientFrontendSource,
  /findAnySameDayBookingForClient[\s\S]*?isFrontendRequestStillBlockingConstraints[\s\S]*?sameDayExistingBookingForConfirmation[\s\S]*?showBookingFlowConfirm\([\s\S]*?Prenotazione per un’altra persona\?/,
  'Every second and subsequent same-day delegated submission must require confirmation, including linked groups.',
);
assert.match(
  clientFrontendSource,
  /requiresComplexFailureReconciliation[\s\S]*?findActiveBookingRequestForSalon\([\s\S]*?recoveredAfterAmbiguousSubmit = authoritativeRequest/,
  'Every ambiguous dependency, composition, or phased submit must reconcile the authoritative request instead of reporting a false failure.',
);
assert.match(
  clientFrontendSource,
  /isPhasedSubmit = !!normalizeServicePhaseConfig[\s\S]*?requiresComplexFailureReconciliation =[\s\S]*?isDependencySubmit \|\| isCompositionSubmit \|\| isPhasedSubmit[\s\S]*?earlySubmitReconciliationPromise[\s\S]*?findActiveBookingRequestForSalon\([\s\S]*?resolve\(\{ ok: true, request: authoritativeRequest \}\)[\s\S]*?\}, 20000\)/,
  'Single, linked and phased submissions must reconcile before the common acknowledgement timeout expires.',
);
const earlySubmitReconciliationSource = clientFrontendSource.match(
  /const earlySubmitReconciliationPromise =[\s\S]*?const saved = await Promise\.race/,
)?.[0];
assert.ok(
  earlySubmitReconciliationSource,
  'The frontend must keep an early authoritative acknowledgement recovery path.',
);
assert.doesNotMatch(
  earlySubmitReconciliationSource,
  /if \(!requiresComplexFailureReconciliation\)/,
  'Early acknowledgement recovery must also run for ordinary single services.',
);
assert.match(
  clientFrontendSource,
  /refreshPublicSalonState\(\)[\s\S]*?restored\.richiestePrenotazione\.find\([\s\S]*?item\.stato === 'In attesa'[\s\S]*?item\.stato === 'Accettata'[\s\S]*?recoveredAfterAmbiguousSubmit/,
  'A fresh public snapshot containing the submitted request must recover success instead of showing a false timeout.',
);
assert.match(
  clientFrontendSource,
  /Invio da verificare[\s\S]*?Non inviare di nuovo subito/,
  'An unresolved acknowledgement must never invite a duplicate retry.',
);
assert.match(
  appContextSource,
  /find_public_booking_dependency_by_idempotency_v1[\s\S]*?invokeFindPublicBookingRequestByCompositeRpcCompat[\s\S]*?\['pending', 'accepted', 'in attesa', 'accettata'\]/,
  'Dependency reconciliation must prefer the exact idempotency key and still recognize pending or accepted fallback requests.',
);
assert.match(
  appContextSource,
  /Flush push nuova dipendenza frontend non riuscito:[\s\S]*?scheduleResilientPushFlushes\(\[[\s\S]*?16000[\s\S]*?22000/,
  'Linked booking push flushes must continue beyond the 15 second automatic acceptance boundary.',
);
const recentOwnerBookingRefreshSource = appContextSource.match(
  /const refreshRecentOwnerBookingEntities = async \(\) => \{[\s\S]*?let ownerCustomerPersonalizationsRefreshTimer/,
)?.[0];
assert.ok(
  recentOwnerBookingRefreshSource,
  'Owner booking-only fallback must exist independently from the broad workspace sync.',
);
assert.doesNotMatch(
  recentOwnerBookingRefreshSource,
  /servicesPersistenceDirtyRef/,
  'Unsaved service edits must not block request and appointment refreshes.',
);
assert.match(
  appContextSource,
  /recentOwnerBookingEntitiesFallbackInterval[\s\S]*?Platform\.OS === 'web'[\s\S]*?refreshRecentOwnerBookingEntities\(\)[\s\S]*?1600/,
  'Web and native owner booking state must recover promptly when realtime delivery is missed.',
);
assert.match(
  testerBookingLookupSource,
  /find_public_booking_request_by_composite[\s\S]*?workspace\.is_internal_tester is true[\s\S]*?booking_request\.status in \('pending', 'accepted'\)/,
  'Internal tester bookings must remain discoverable after a lost acknowledgement.',
);
assert.match(
  dependencyAcknowledgementRecoverySource,
  /find_public_booking_request_by_composite[\s\S]*?appointment_groups as appointment_group[\s\S]*?appointment_group_order, 0\) = 0[\s\S]*?appointment_group\.title[\s\S]*?v_requested_service_name/,
  'Lost acknowledgements for dependency cards must recover the grouped root by the public combined title.',
);
assert.match(
  dependencyAcknowledgementRecoverySource,
  /b6717394-c269-4658-abe0-2b0f08cef124[\s\S]*?from public\.appointments[\s\S]*?v_appointment_count <> 0[\s\S]*?delete from public\.booking_requests/,
  'The targeted stale reservation cleanup must require proof that no Agenda appointment exists.',
);
assert.match(
  clientFrontendSource,
  /const intervals = selectedBookingService\?\.compositionId[\s\S]*?\? \[\][\s\S]*?const phaseOverlapsLunch =[\s\S]*?!selectedBookingService\?\.compositionId/,
  'Composition timing overrides must be left to the specialized server planner instead of stale local geometry.',
);
assert.match(
  clientFrontendSource,
  /loadDependencyAvailabilityChunk[\s\S]*?get_public_dependency_slot_availability_batch_v1[\s\S]*?slotTimeChunk\.length > 1[\s\S]*?splitDepth < 6[\s\S]*?const firstHalf = await loadDependencyAvailabilityChunk[\s\S]*?const secondHalf = await loadDependencyAvailabilityChunk[\s\S]*?FRONTEND_MULTI_PHASE_AVAILABILITY_CHUNK_SIZE[\s\S]*?await loadDependencyAvailabilityChunk/,
  'A full 5-minute dependency day must use bounded sequential planner calls and recursively split only a rejected chunk.',
);
assert.match(
  clientFrontendSource,
  /scheduleAutomaticSlotAvailabilityRetry[\s\S]*?setLivePublicSlotAvailabilityRetryRevision\(\(current\) => current \+ 1\)/,
  'Transient availability failures must recover automatically without asking the customer to retry.',
);
assert.doesNotMatch(
  clientFrontendSource,
  /shouldShowLiveSlotErrorState|La verifica degli orari sta impiegando troppo tempo\. Riprova/,
  'A technical availability timeout must never be presented as an occupied day with a retry action.',
);
assert.match(
  clientFrontendSource,
  /validationPlanServices[\s\S]*?getSequentialServicesOperatorBusyIntervals\(validationPlanServices\)[\s\S]*?refreshedLunchOverlap/,
  'Submission must revalidate the complete busy-phase plan after the latest public snapshot refresh.',
);
assert.match(
  agendaSource,
  /const phaseServiceLabel = phaseConfig[\s\S]*?phaseConfig\.finalServiceName[\s\S]*?phaseConfig\.initialLabel/,
  'Agenda cards must show the real initial and final service labels.',
);
assert.match(
  agendaSource,
  /appointment\.syntheticRequestStatus === 'In attesa'[\s\S]*?'NUOVA\\nRICHIESTA'/,
  'The 15 second pending window must remain visibly marked in Agenda.',
);

assert.match(
  autoAcceptSource,
  /validate_booking_request_auto_accept_v1[\s\S]*?phased_operator_interval_conflicts_v1[\s\S]*?v_final_time[\s\S]*?phased_operator_interval_conflicts_v1/,
  'Auto-accept must revalidate both operator-busy phases around the free processing interval.',
);
assert.match(
  autoAcceptSource,
  /materialize_booking_request_phases_v1[\s\S]*?phase_snapshot = request\.phase_snapshot[\s\S]*?phase_operator_assignments = request\.phase_operator_assignments/,
  'Accepted appointments must explicitly retain their phased structure and assignments.',
);
assert.match(
  groupedAcceptanceSource,
  /accept_booking_request_or_group_core_v3[\s\S]*?validate_booking_request_auto_accept_v1[\s\S]*?update_owner_booking_request_status_core[\s\S]*?materialize_booking_request_phases_v1/,
  'Linked bookings must validate, accept and materialize the whole group atomically.',
);
assert.match(
  groupedAcceptanceSource,
  /process_due_auto_accept_booking_requests[\s\S]*?candidate\.appointment_group_id[\s\S]*?accept_booking_request_or_group_core_v3/,
  'The 15 second processor must auto-accept one complete logical booking at a time.',
);
assert.match(
  dependencyPlanValidationSource,
  /public_dependency_plan[\s\S]*?validate_booking_request_auto_accept_v1[\s\S]*?resolve_customer_online_auto_accept_v1/,
  'A dependent public booking must lock and validate its complete plan before persistence.',
);
assert.match(
  dependencyPlanValidationSource,
  /'requiresSalonApproval', not v_auto_accept[\s\S]*?'acceptanceMode', case when v_auto_accept then 'automatic' else 'manual' end/,
  'Dependent booking metadata must follow the effective salon and customer acceptance policy.',
);
assert.match(
  phaseAwareOperatorSelectionSource,
  /is_public_operator_interval_available_v1[\s\S]*?is_public_booking_slot_available[\s\S]*?not public\.phased_operator_interval_conflicts_v1/,
  'Automatic operator selection must include accepted phased reservations even before appointment materialization.',
);
assert.match(
  phaseAwareOperatorSelectionSource,
  /create_public_booking_request_ultralight_v3[\s\S]*?create_public_phased_booking_request_v4[\s\S]*?public\.is_public_operator_interval_available_v1/,
  'Single, dependent and phased automatic writers must share the phase-aware operator guard.',
);
assert.match(
  complexBookingBoundarySource,
  /validate_booking_request_auto_accept_v1[\s\S]*?is_public_booking_time_allowed_by_availability[\s\S]*?v_request\.appointment_time[\s\S]*?v_final_time/,
  'Auto-accept must revalidate opening, lunch and exception boundaries for every operator-busy phase.',
);
assert.match(
  historicalOperatorIdentitySource,
  /same_public_booking_operator_identity[\s\S]*?v_left_workspace_id <> v_right_workspace_id/,
  'A foreign historical operator UUID with the current display name must still occupy the current salon lane.',
);

assert.match(
  groupedOwnerPushSource,
  /queue_booking_group_created_owner_push_v1[\s\S]*?'Nuova richiesta di prenotazione'/,
  'A linked customer booking must queue one owner request notification.',
);
assert.match(
  restoredAutoAcceptOwnerPushSource,
  /automatic acceptance keeps every new request[\s\S]*?v_suppression_block[\s\S]*?replace\(v_definition, v_suppression_block, ''\)/,
  'Auto-accepted linked bookings must still emit one owner group event during their visible pending window.',
);
assert.match(
  groupedCustomerPushSource,
  /guard_booking_group_push_batch_v1[\s\S]*?skip_booking_request_push[\s\S]*?queue_final_booking_group_status_v1/,
  'Linked bookings must suppress per-row customer pushes and emit one final group status.',
);
assert.match(
  salonPushSuppressionSource,
  /tg_op = 'INSERT'[\s\S]*?new\.status = 'accepted'::public\.request_status[\s\S]*?new\.origin = 'backoffice'/,
  'Salon-created appointments must remain excluded from customer creation pushes.',
);

console.log('Delegated booking lifecycle contracts: OK');
