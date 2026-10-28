const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const appContextSource = read('src/context/AppContext.tsx');
const sendPushSource = read('supabase/functions/send-push/index.ts');
const migrationSource = read(
  'supabase/migrations/20260821234500_cancel_linked_public_booking_atomically.sql',
);
const terminalActionsMigrationSource = read(
  'supabase/migrations/20260821235500_harden_linked_booking_terminal_actions.sql',
);
const cancellationIdentityMigrationSource = read(
  'supabase/migrations/20260825170000_harden_public_customer_cancellation_identity.sql',
);
const clientScreenSource = read('app/cliente-screen.tsx');
const ownerTabsLayoutSource = read('app/(tabs)/_layout.tsx');

assert.match(
  migrationSource,
  /cancel_public_booking_request_or_group_v2[\s\S]*?appointment_group_id = v_group_id[\s\S]*?status::text in \('pending', 'accepted'\)/,
  'Any visible phase must resolve and cancel every active linked request.',
);
assert.match(
  migrationSource,
  /not exists \([\s\S]*?status::text in \('pending', 'accepted'\)[\s\S]*?status = 'cancelled'/,
  'A group may become cancelled only after no active phase remains.',
);
assert.match(
  appContextSource,
  /cancel_public_booking_request_or_group_v2[\s\S]*?cancelledRequestIds[\s\S]*?matchesPersistedCancellation/,
  'The client must reconcile all request ids returned by atomic cancellation.',
);
assert.match(
  appContextSource,
  /const cancelledCustomerGroupId =[\s\S]*?nextRequest\.cancellationSource === 'cliente'[\s\S]*?item\.appointmentGroupId\?\.trim\(\) === cancelledCustomerGroupId[\s\S]*?shouldRemoveCancelledAppointment[\s\S]*?current\.filter\([\s\S]*?!shouldRemoveCancelledAppointment\(item\)/,
  'Owner Agenda must remove every local member of a customer-cancelled logical group on the first authoritative realtime event.',
);
assert.match(
  appContextSource,
  /if \(shouldRemoveAcceptedAppointment && isLegacySnapshotOnlyRequest\) \{[\s\S]*?cancel_owner_appointment/,
  'A modern public cancellation must not repeat the appointment cancellation after the atomic RPC.',
);
assert.match(
  appContextSource,
  /stato: toFrontendRequestStatus\(createdRow\?\.status, request\.stato\)/,
  'The optimistic request must start with the status returned by the server.',
);
assert.match(
  sendPushSource,
  /isStaleCreatedOrAcceptedClientBookingPush[\s\S]*?select\('status,origin,viewed_by_customer'\)[\s\S]*?origin\) !== 'backoffice'[\s\S]*?from\('appointments'\)[\s\S]*?eq\('booking_request_id', bookingRequestId\)/,
  'Salon-created customer pushes require an accepted backoffice request and its live appointment.',
);
assert.match(
  terminalActionsMigrationSource,
  /cascade_legacy_linked_customer_cancellation_v1[\s\S]*?cancel_public_booking_request_or_group_v2/,
  'An older client cancellation must delegate the whole persisted group to the atomic RPC.',
);
assert.match(
  terminalActionsMigrationSource,
  /update_owner_booking_request_status_v2[\s\S]*?appointment_group_id[\s\S]*?update_owner_booking_request_status_core/,
  'Owner rejection and cancellation must resolve every phase from the persisted group.',
);
assert.match(
  cancellationIdentityMigrationSource,
  /cancel_public_booking_request[\s\S]*?subscription_status in \('demo', 'active'\)[\s\S]*?is_internal_tester/,
  'Customer cancellation must remain available for explicitly enabled internal tester workspaces.',
);
assert.match(
  cancellationIdentityMigrationSource,
  /cancel_public_booking_request_or_group_v2[\s\S]*?right\(regexp_replace[\s\S]*?, 10\) = v_customer_phone/,
  'Linked customer cancellation must compare the same last ten phone digits used by the base RPC.',
);
assert.match(
  cancellationIdentityMigrationSource,
  /cancel_public_booking_group_v1[\s\S]*?v_customer_email is not null[\s\S]*?\bor\b[\s\S]*?v_customer_phone is not null/,
  'Composition cancellation must accept either verified email or normalized phone identity.',
);
assert.doesNotMatch(
  clientScreenSource,
  /shouldForceOptimisticCancellation/,
  'The customer UI must never convert a failed server cancellation into a false success.',
);
assert.match(
  clientScreenSource,
  /isAuthoritativelyCancelled[\s\S]*?matchingAppointment[\s\S]*?showCancellationSuccess/,
  'A failed cancellation may be reconciled as success only from authoritative request and appointment state.',
);
assert.match(
  clientScreenSource,
  /guardRecentlyCancelledFrontendBookings[\s\S]*?stato: 'Annullata'[\s\S]*?cancelledRequestSlotKeys\.has\(buildAppointmentSlotKey\(item\)\)/,
  'A stale public snapshot must not restore a booking card or appointment immediately after customer cancellation.',
);
assert.match(
  clientScreenSource,
  /cancellationLogicalMembers[\s\S]*?appointmentGroupId[\s\S]*?matchesLogicalCancellationRequest[\s\S]*?cancellationLogicalMembers\.forEach[\s\S]*?markRecentlyCancelledFrontendBooking/,
  'Client cancellation must optimistically stabilize the whole logical booking, including compositions and dependencies.',
);
assert.match(
  ownerTabsLayoutSource,
  /ownerForegroundPushBannerLogicalEventsRef[\s\S]*?previousLogicalForegroundEventAt[\s\S]*?OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS/,
  'The owner in-app banner must collapse repeated foreground deliveries of the same logical event.',
);
assert.match(
  ownerTabsLayoutSource,
  /OWNER_CANCELLATION_PUSH_COALESCE_MS[\s\S]*?ownerPendingCancellationPushesRef[\s\S]*?ownerCustomerCancellationBannerClaimsRef[\s\S]*?claimOwnerCustomerCancellationBanner/,
  'Foreground cancellation push and realtime must converge on one claimed logical banner without changing notification delivery.',
);
assert.match(
  appContextSource,
  /if \(createBookingRequest\) \{[\s\S]*?flushQueuedPushNotifications\(\)[\s\S]*?return;/,
  'A salon-created appointment for a frontend customer must flush the canonical queued push immediately.',
);
const immediateCreatedPushCalls = [
  ...appContextSource.matchAll(
    /await queueCreatedAppointmentClientPush\(\{[\s\S]{0,500}?\}\)\.catch\([\s\S]{0,500}?void \(async \(\) => \{/g,
  ),
];
assert.equal(
  immediateCreatedPushCalls.length,
  2,
  'Both owner appointment persistence paths must send or flush the client push before background portal publication.',
);

console.log('Linked public cancellation and push contracts passed.');
