const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appContextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260831230500_dedupe_terminal_salon_cancellation_push.sql',
  ),
  'utf8',
);

assert.match(
  appContextSource,
  /serverReturnedCancelledRequestId =[\s\S]*?cancelResponsePayload\?\.bookingRequestId[\s\S]*?serverConfirmedCanonicalCancellationRequest = isUuid\([\s\S]*?serverReturnedCancelledRequestId[\s\S]*?shouldQueueClientCancellationPushFromApp =\s*!serverHandledWholeGroup\s*&&\s*!serverConfirmedCanonicalCancellationRequest/,
  'A modern single cancellation must leave its canonical customer push to the DB trigger.',
);

assert.match(
  migrationSource,
  /v_booking_request_id is null[\s\S]*?v_status_code <> 'cancelled'[\s\S]*?v_cancellation_source <> 'salone'/,
  'The server guard must be limited to identified terminal salon cancellations.',
);
assert.match(
  migrationSource,
  /pg_advisory_xact_lock\([\s\S]*?push-terminal-salon-cancel:[\s\S]*?notification\.device_id is not distinct from new\.device_id[\s\S]*?bookingRequestId[\s\S]*?= v_booking_request_id[\s\S]*?return null/,
  'Different producer keys for the same request and device must serialize to one push row.',
);
assert.match(
  migrationSource,
  /create trigger b_prevent_duplicate_terminal_salon_cancellation_push[\s\S]*?prevent_duplicate_terminal_salon_cancellation_push_v1/,
  'The cancellation barrier must remain independent from the generic explicit-key guard.',
);
assert.doesNotMatch(
  migrationSource,
  /create or replace function public\.queue_public_customer_push|prevent_duplicate_explicit_push_event_v1/,
  'The surgical hotfix must not replace the general customer queue or its key semantics.',
);

const shouldQueueLegacyAppFallback = ({ groupHandled, requestId }) =>
  !groupHandled &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestId ?? '',
  );

assert.equal(
  shouldQueueLegacyAppFallback({
    groupHandled: false,
    requestId: '783d268f-022b-48d1-89c0-24b900dd72b9',
  }),
  false,
  'The reproduced ungrouped modern cancellation must not enqueue the app fallback.',
);
assert.equal(
  shouldQueueLegacyAppFallback({ groupHandled: false, requestId: null }),
  true,
  'A genuinely legacy response without a request identity keeps the compatibility fallback.',
);

console.log('Single salon cancellation push contracts passed.');
