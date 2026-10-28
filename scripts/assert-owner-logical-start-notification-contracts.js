/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260830114500_classify_owner_logical_start_notifications.sql',
  ),
  'utf8',
);
const pushQueueSource = fs.readFileSync(
  path.join(root, 'src/lib/push/push-notifications.ts'),
  'utf8',
);
const explicitPushDedupeMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260830120000_serialize_explicit_push_dedupe.sql',
  ),
  'utf8',
);

const logicalStart = (items) =>
  [...items].sort((left, right) => {
    const leftOrder = Number.isFinite(left.order)
      ? left.order
      : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.order)
      ? right.order
      : Number.MAX_SAFE_INTEGER;
    return (
      leftOrder - rightOrder ||
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`) ||
      left.id.localeCompare(right.id)
    );
  })[0];

const logicalStartMoved = (before, after) => {
  const previous = logicalStart(before);
  const next = logicalStart(after);
  return previous.date !== next.date || previous.time !== next.time;
};

assert.equal(
  logicalStartMoved(
    [{ id: 'single', date: '2026-08-31', time: '09:00' }],
    [{ id: 'single', date: '2026-08-31', time: '09:15' }],
  ),
  true,
  'A single appointment (including one row with pose) must be a move when its start changes.',
);
assert.equal(
  logicalStartMoved(
    [
      { id: 'first', order: 1, date: '2026-08-31', time: '09:00' },
      { id: 'second', order: 2, date: '2026-08-31', time: '10:00' },
    ],
    [
      { id: 'first', order: 1, date: '2026-08-31', time: '09:00' },
      { id: 'second', order: 2, date: '2026-08-31', time: '10:15' },
    ],
  ),
  false,
  'Moving only an internal composition/dependency phase must remain a reorganization.',
);
assert.equal(
  logicalStartMoved(
    [
      { id: 'first', order: 1, date: '2026-08-31', time: '09:00' },
      { id: 'second', order: 2, date: '2026-08-31', time: '10:00' },
    ],
    [
      { id: 'first', order: 1, date: '2026-08-31', time: '09:15' },
      { id: 'second', order: 2, date: '2026-08-31', time: '10:15' },
    ],
  ),
  true,
  'Moving the first phase of a composition/dependency group must be a reschedule.',
);

assert.match(
  contextSource,
  /compareOwnerAppointmentLogicalOrder[\s\S]*?appointmentGroupOrder[\s\S]*?resolveOwnerAppointmentLogicalStart[\s\S]*?hasOwnerAppointmentLogicalStartMoved/,
  'The client must resolve one stable logical start for singles, pose rows and linked groups.',
);
assert.match(
  contextSource,
  /logicalStartMoved: \(\(\) => \{[\s\S]*?previousTimeline[\s\S]*?nextTimeline[\s\S]*?hasOwnerAppointmentLogicalStartMoved/,
  'Direct drag/edit notifications must classify the whole group start, not the edited technical row.',
);
assert.match(
  contextSource,
  /preferredRequestId[\s\S]*?resolveFrontendMoveTarget\([\s\S]*?preferredRequestId[\s\S]*?appointment_rescheduled_by_salon/,
  'The persisted booking request id and canonical marker must survive into the portal request record.',
);
assert.match(
  contextSource,
  /queueOwnerLogicalStartNotification[\s\S]*?queue_customer_appointment_rescheduled_push_v3[\s\S]*?queue_customer_appointment_rescheduled_push_v2/,
  'Linked moves must use the server request-note/push contract with a rollout-safe fallback.',
);
assert.match(
  contextSource,
  /buildOwnerAppointmentNotificationTimeline[\s\S]*?processingDurationMinutes[\s\S]*?formatOwnerAppointmentNotificationTimeline[\s\S]*?posa \$\{item\.processingDurationMinutes\} min/,
  'The client fallback must preserve the complete ordered service timeline, including pose.',
);
assert.match(
  contextSource,
  /normalizeOwnerAppointmentNotificationRevision[\s\S]*?\^\\d\{20\}\$[\s\S]*?getUTCFullYear[\s\S]*?microseconds[\s\S]*?p_move_revision: revision[\s\S]*?moveRevision: revision[\s\S]*?_dedupeKey/,
  'The RPC and client fallback must share one canonical UTC mutation revision.',
);
assert.match(
  contextSource,
  /isOwnerAppointmentNotificationTerminalRpcError[\s\S]*?workspace_access_denied[\s\S]*?appointment_request_mismatch[\s\S]*?shouldUseOwnerAppointmentNotificationTransportFallback[\s\S]*?if \(!isUuid\(workspaceId\) \|\| !isUuid\(bookingRequestId\)\) return false;[\s\S]*?!shouldUseOwnerAppointmentNotificationTransportFallback\(result\.error\)[\s\S]*?return false;[\s\S]*?queueWorkspacePushNotification/,
  'Authorization or relationship failures must never bypass the guarded notification RPC through the generic queue.',
);
assert.match(
  contextSource,
  /reschedulePushError[\s\S]*?!shouldUseOwnerAppointmentNotificationTransportFallback\([\s\S]*?reschedulePushError[\s\S]*?return false;[\s\S]*?enqueueFallbackReschedulePush\(\)[\s\S]*?return false;/,
  'The direct-move fallback must run only for an ambiguous transport failure and never for invalid identifiers.',
);
const transportFallbackClassifier = contextSource.slice(
  contextSource.indexOf(
    'const shouldUseOwnerAppointmentNotificationTransportFallback =',
  ),
  contextSource.indexOf('const shouldRetryAmbiguousOwnerCustomerCreate ='),
);
assert.doesNotMatch(
  transportFallbackClassifier,
  /shouldSilenceTransientSyncError|isSupabaseSchemaCacheLookupError|isCorruptedToastIndexError/,
  'Database, schema-cache, and corruption errors must never bypass the guarded notification RPC.',
);
assert.match(
  contextSource,
  /timeline: nextLinked[\s\S]*?timeline: linkedTimelineEntries/,
  'Linked reorganizations and composition swaps must pass their complete timeline to the single notifier.',
);

const reorganizeNotificationSource = contextSource.slice(
  contextSource.indexOf('const previousLogicalStart =', contextSource.indexOf('const reorganizeOwnerLinkedAppointmentsForSalon')),
  contextSource.indexOf('const terminalPauseMinutes =', contextSource.indexOf('const reorganizeOwnerLinkedAppointmentsForSalon')),
);
assert.match(
  reorganizeNotificationSource,
  /queueOwnerLogicalStartNotification\(/,
  'A linked reorganization must emit exactly one notification from its logical start.',
);
assert.doesNotMatch(
  reorganizeNotificationSource,
  /queueWorkspacePushNotification\(/,
  'The linked reorganization branch must not enqueue a second generic push.',
);

const swapNotificationSource = contextSource.slice(
  contextSource.indexOf('for (const changedEntries of changedByComposition.values())'),
  contextSource.indexOf('if (changedByComposition.size > 0)'),
);
assert.match(
  swapNotificationSource,
  /previousLogicalStart[\s\S]*?nextLogicalStart[\s\S]*?queueOwnerLogicalStartNotification\(/,
  'Composition swaps must compare and notify from the logical start once per group.',
);
assert.doesNotMatch(
  swapNotificationSource,
  /queueWorkspacePushNotification\(/,
  'Composition swaps must not retain the previous duplicate generic enqueue.',
);

assert.match(
  migrationSource,
  /appointment_group_order asc nulls last[\s\S]*?v_is_logical_start_member[\s\S]*?v_is_reorganization/,
  'The atomic server classifier must identify the first logical group member.',
);
assert.match(
  migrationSource,
  /when v_is_reorganization then 'appointment_reorganized_by_salon'[\s\S]*?else 'appointment_rescheduled_by_salon'/,
  'Only a changed logical start may receive the rescheduled marker.',
);
assert.match(
  migrationSource,
  /set viewed_by_customer = false,[\s\S]*?notes = v_note[\s\S]*?sync_client_portal_booking_requests\(p_workspace_id\)/,
  'The canonical marker must persist to the booking request and customer portal snapshot.',
);
assert.match(
  migrationSource,
  /with timeline_rows as \([\s\S]*?appointment_group_order[\s\S]*?jsonb_agg\([\s\S]*?'processingDurationMinutes'[\s\S]*?string_agg\([\s\S]*?posa '[\s\S]*?order by[\s\S]*?into v_booking_timeline, v_timeline_copy/,
  'The server-authoritative push must derive one complete ordered timeline, including pose.',
);
assert.match(
  migrationSource,
  /'bookingTimeline', v_timeline_copy,[\s\S]*?'bookingTimelineItems', v_booking_timeline/,
  'The visible timeline and its structured items must travel in the canonical push payload.',
);
assert.match(
  migrationSource,
  /v_auth_role[\s\S]*?'service_role'[\s\S]*?'authenticated'[\s\S]*?current_workspace_id\(\)[\s\S]*?workspace_access_allowed\(\)[\s\S]*?workspace_access_denied/,
  'The security-definer queue must authorize only service role or the exact active owner workspace.',
);
assert.match(
  migrationSource,
  /appointment\.booking_request_id[\s\S]*?v_appointment_booking_request_id[\s\S]*?is distinct from v_request\.id[\s\S]*?appointment_request_mismatch/,
  'The notification request must belong to the appointment or its canonical group.',
);
assert.match(
  migrationSource,
  /v_revision_input[\s\S]*?p_move_revision[\s\S]*?v_revision := coalesce[\s\S]*?v_dedupe_key := lower[\s\S]*?coalesce\([\s\S]*?v_appointment_group_id::text[\s\S]*?p_appointment_id::text[\s\S]*?p_booking_request_id::text[\s\S]*?return 0/,
  'The safety-net must preserve the original revision and one group-first dedupe identity through the real enqueue.',
);
assert.match(
  migrationSource,
  /queue_customer_appointment_rescheduled_push_v3[\s\S]*?queue_customer_appointment_rescheduled_push_core_20260830\([\s\S]*?p_move_revision/,
  'The v3 wrapper must propagate the original mutation revision into the enqueue core.',
);
assert.match(
  contextSource,
  /resolveOwnerAppointmentNotificationDedupeAnchor[\s\S]*?!isUuidValue\(normalizedAppointmentId\)[\s\S]*?bookingRequestId\.trim\(\)[\s\S]*?isUuidValue\(normalizedGroupId\)[\s\S]*?const dedupeAnchor =[\s\S]*?_dedupeKey: \[[\s\S]*?dedupeAnchor[\s\S]*?const notificationDedupeAnchor =[\s\S]*?_dedupeKey: \[[\s\S]*?notificationDedupeAnchor/,
  'Both client safety nets must use the same group-first anchor as the server.',
);
assert.match(
  migrationSource,
  /p_appointment_id is null then[\s\S]*?v_appointment_group_id := v_request\.appointment_group_id[\s\S]*?timeline_rows[\s\S]*?when p_appointment_id is null then p_booking_request_id::text/,
  'The request-only compatibility path must keep a full group timeline while sharing the request anchor with the client.',
);
assert.match(
  pushQueueSource,
  /explicitDedupeKey = normalizePushText\(payload\?\._dedupeKey[\s\S]*?explicitDedupeKey \|\|[\s\S]*?buildQueuedPushDedupeKey[\s\S]*?_dedupeKey: dedupeKey/,
  'The central client queue must preserve a canonical explicit event key instead of overwriting it.',
);
assert.match(
  explicitPushDedupeMigrationSource,
  /pg_advisory_xact_lock[\s\S]*?workspace_id = new\.workspace_id[\s\S]*?device_id is not distinct from new\.device_id[\s\S]*?_dedupeKey[\s\S]*?return null[\s\S]*?before insert on public\.push_notifications/,
  'Concurrent explicit-key push inserts must serialize and suppress the later duplicate per device.',
);
assert.match(
  migrationSource,
  /create or replace function public\.queue_customer_appointment_rescheduled_push\([\s\S]*?return public\.queue_customer_appointment_rescheduled_push_v2\(/,
  'Legacy atomic move/swap RPCs must route through the same canonical classifier.',
);
assert.doesNotMatch(
  migrationSource,
  /appointment_created_by_salon|Nuovo appuntamento/,
  'Move/reorganization generation must never reuse the creation category.',
);

console.log('Owner logical-start notification contracts: OK');
