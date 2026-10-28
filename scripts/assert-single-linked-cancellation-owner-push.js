const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260826183000_single_owner_push_for_linked_customer_cancellation.sql',
  ),
  'utf8',
);

assert.match(
  migration,
  /queue_linked_customer_cancellation_owner_push_v1[\s\S]*?appointment_group_id = p_appointment_group_id[\s\S]*?array_agg\([\s\S]*?string_agg\(/,
  'The cancellation finalizer must derive every request and phase from the persisted appointment group.',
);
assert.match(
  migration,
  /requested_service_name[\s\S]*?' alle '[\s\S]*?appointment_time[\s\S]*?' con '[\s\S]*?requested_operator_name[\s\S]*?processingDurationMinutes/,
  'The single push must retain service, time, operator and phased-pose details.',
);
assert.match(
  migration,
  /'bookingRequestIds', to_jsonb\(v_request_ids\)[\s\S]*?'appointmentGroupId', p_appointment_group_id[\s\S]*?'notificationScope', 'appointment_group'/,
  'The push payload must carry the complete logical booking identity.',
);
assert.match(
  migration,
  /'appointmentTime', null[\s\S]*?'serviceName', v_timeline[\s\S]*?'bookingTimeline', v_timeline/,
  'The native compact body must show the full timeline without repeating only the first phase time.',
);
assert.match(
  migration,
  /delete from public\.push_notifications[\s\S]*?status = 'queued'[\s\S]*?appointmentGroupId[\s\S]*?unnest\(v_request_ids\)/,
  'Only unsent legacy cancellation rows belonging to the same logical group may be replaced.',
);
assert.match(
  migration,
  /new\.appointment_group_id is not null[\s\S]*?sibling\.appointment_group_id = new\.appointment_group_id[\s\S]*?sibling\.status::text in \('pending', 'accepted'\)[\s\S]*?queue_linked_customer_cancellation_owner_push_v1/,
  'The row trigger must wait until all linked siblings are terminal before finalizing one notification.',
);
assert.match(
  migration,
  /salonpro\.defer_linked_customer_cancel_push[\s\S]*?push\.payload ->> 'bookingRequestId' = v_request\.id::text[\s\S]*?push\.payload ->> 'appointmentGroupId' = v_request\.appointment_group_id::text/,
  'The single-row fallback must defer inside the atomic wrapper and recognize the group notification.',
);
assert.match(
  migration,
  /v_start_replacement text := \$replacement\$[\s\S]*?if v_group_id is not null then[\s\S]*?salonpro\.skip_booking_request_push[\s\S]*?salonpro\.defer_linked_customer_cancel_push[\s\S]*?v_end_replacement text := \$replacement\$[\s\S]*?queue_linked_customer_cancellation_owner_push_v1[\s\S]*?cancel_public_booking_request_or_group_v2/,
  'The request-id atomic path must suppress per-row events only for a real persisted group.',
);
assert.match(
  migration,
  /explicit group-id RPC[\s\S]*?salonpro\.skip_booking_request_push[\s\S]*?salonpro\.defer_linked_customer_cancel_push[\s\S]*?queue_linked_customer_cancellation_owner_push_v1[\s\S]*?cancel_public_booking_group_v1/,
  'The explicit composition/group cancellation path must use the same single finalizer.',
);
assert.doesNotMatch(
  migration,
  /composition_id/,
  'Logical cancellation identity must remain appointment_group_id, including service dependencies.',
);

console.log('Single linked customer cancellation owner push contracts passed.');
