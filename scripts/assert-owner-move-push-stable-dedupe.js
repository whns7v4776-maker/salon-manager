/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const agendaSource = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
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
const serializedDedupeSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260830120000_serialize_explicit_push_dedupe.sql',
  ),
  'utf8',
);

assert.match(
  migrationSource,
  /queue_customer_appointment_rescheduled_push_v3\([\s\S]*?p_move_revision text default null/,
  'The delayed move safety-net must accept the original persisted move revision.',
);
assert.match(
  migrationSource,
  /v_revision_input ~ '\^\[0-9\]\{20\}\$'[\s\S]*?v_revision_input::timestamptz[\s\S]*?'YYYYMMDDHH24MISSUS'/,
  'Canonical and ISO move revisions must resolve to the same server dedupe revision.',
);
assert.match(
  migrationSource,
  /v_dedupe_key := lower[\s\S]*?coalesce\([\s\S]*?v_appointment_group_id::text[\s\S]*?p_appointment_id::text[\s\S]*?p_booking_request_id::text[\s\S]*?v_dedupe_action[\s\S]*?v_revision/,
  'The safety-net must rebuild one group-first atomic event key for moves and reorganizations.',
);
assert.match(
  migrationSource,
  /notification\.status::text in \('queued', 'processing', 'sent'\)[\s\S]*?notification\.payload ->> '_dedupeKey'[\s\S]*?return 0/,
  'An already queued, processing or sent atomic move must suppress the delayed duplicate.',
);
assert.match(
  migrationSource,
  /queue_customer_appointment_rescheduled_push_v3[\s\S]*?return public\.queue_customer_appointment_rescheduled_push_core_20260830\([\s\S]*?p_move_revision/,
  'The v3 safety-net must carry the original revision into the actual enqueue core.',
);

const safetyNetSource = contextSource.slice(
  contextSource.indexOf('const reschedulePushParams = {'),
  contextSource.indexOf('const { data: queuedCount, error: reschedulePushError }'),
);
assert.ok(safetyNetSource.length > 0, 'Owner move safety-net source is present.');
assert.match(
  safetyNetSource,
  /queue_customer_appointment_rescheduled_push_v3[\s\S]*?p_move_revision: persistedMoveMutationRevision/,
  'The client safety-net must pass the revision returned by the original move RPC.',
);
assert.match(
  contextSource,
  /normalizeOwnerAppointmentNotificationRevision[\s\S]*?\^\\d\{20\}\$[\s\S]*?getUTCFullYear[\s\S]*?microseconds[\s\S]*?const persistedMoveMutationRevision =[\s\S]*?normalizeOwnerAppointmentNotificationRevision/,
  'The client must canonicalize the persisted revision exactly once before RPC and fallback dedupe.',
);
assert.match(
  safetyNetSource,
  /isNamedRpcUnavailableError\([\s\S]*?queue_customer_appointment_rescheduled_push_v3[\s\S]*?queue_customer_appointment_rescheduled_push_v2/,
  'Older servers must retain a schema-compatible v2 fallback during rollout.',
);
assert.match(
  contextSource,
  /const notificationDedupeAnchor =[\s\S]*?resolveOwnerAppointmentNotificationDedupeAnchor\([\s\S]*?bookingRequestId: linkedRequest\.id[\s\S]*?_dedupeKey: \[[\s\S]*?notificationDedupeAnchor/,
  'The client fallback must share the server group-first dedupe anchor.',
);
assert.match(
  contextSource,
  /isOwnerAppointmentNotificationTerminalRpcError[\s\S]*?appointment_request_mismatch[\s\S]*?shouldUseOwnerAppointmentNotificationTransportFallback[\s\S]*?reschedulePushError[\s\S]*?return false;[\s\S]*?enqueueFallbackReschedulePush/,
  'Domain and authorization errors must stop before the unguarded transport fallback.',
);
assert.match(
  pushQueueSource,
  /explicitDedupeKey = normalizePushText\(payload\?\._dedupeKey[\s\S]*?const dedupeKey =[\s\S]*?explicitDedupeKey \|\|[\s\S]*?_dedupeKey: dedupeKey/,
  'The generic queue must retain the explicit move key through the RPC payload.',
);
assert.match(
  serializedDedupeSource,
  /pg_advisory_xact_lock[\s\S]*?notification\.status::text in \('queued', 'processing', 'sent'\)[\s\S]*?return null/,
  'The database must serialize explicit push identities before checking for an active duplicate.',
);
assert.doesNotMatch(
  migrationSource,
  /delete from public\.(appointments|booking_requests|push_notifications)/,
  'The dedupe guard must not delete appointment, request or notification history.',
);

const resizeSaveSource = agendaSource.slice(
  agendaSource.indexOf('const saveWeekAppointmentResizeDuration = useCallback('),
  agendaSource.indexOf('const saveWeekPhasedResizeTimes = useCallback('),
);
assert.ok(resizeSaveSource.length > 0, 'Agenda resize save source is present.');
assert.match(
  resizeSaveSource,
  /shortenOwnerAppointmentDurationForSalon\(/,
  'The resize handle must persist through the duration-only contract.',
);
assert.doesNotMatch(
  resizeSaveSource,
  /moveOwnerAppointmentForSalon|queue_customer_appointment_rescheduled_push/,
  'A duration resize must never call the move/operator notification path.',
);

console.log('Owner move push stable dedupe contracts: OK');
