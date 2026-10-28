const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260901123000_enforce_accepted_customer_cancellation_cutoff.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(
  /alter function public\.cancel_public_booking_request\(text, uuid, citext, text\)[\s\S]*?rename to cancel_public_booking_request_without_cutoff_v1/i.test(
    migration
  ),
  'The current single-request cancellation implementation must be preserved behind a private core name.'
);

assert(
  /revoke all on function public\.cancel_public_booking_request_without_cutoff_v1\([\s\S]*?from public, anon, authenticated/i.test(
    migration
  ),
  'The unguarded single-request core must not remain callable by clients.'
);

const acceptedGuard = migration.match(
  /create function public\.cancel_public_booking_request\([\s\S]*?return public\.cancel_public_booking_request_without_cutoff_v1\([\s\S]*?end;\s*\$\$;/i
)?.[0];
assert(acceptedGuard, 'The guarded single-request cancellation RPC must be recreated.');
assert(
  /select request\.\*[\s\S]*?for update;/i.test(acceptedGuard),
  'The booking-request row must be locked before evaluating the cancellation cutoff.'
);
assert(
  /if v_request\.status = 'accepted'::public\.request_status then/i.test(acceptedGuard),
  'Only accepted requests must be subject to the T-30 cutoff.'
);
assert(
  /if v_request\.status = 'accepted'::public\.request_status then[\s\S]*?from public\.appointments as appointment[\s\S]*?appointment\.booking_request_id = v_request\.id[\s\S]*?for update;/i.test(
    acceptedGuard
  ),
  'An accepted request must lock and prefer its linked live appointment before evaluating the cutoff.'
);
assert(
  /v_authoritative_appointment_date := case[\s\S]*?v_linked_appointment\.appointment_date[\s\S]*?else v_request\.appointment_date[\s\S]*?v_authoritative_appointment_time := case[\s\S]*?v_linked_appointment\.appointment_time[\s\S]*?else v_request\.appointment_time/i.test(
    acceptedGuard
  ),
  'The live appointment schedule must be authoritative with an explicit request-row fallback.'
);
assert(
  /if v_authoritative_appointment_date is null or v_authoritative_appointment_time is null then[\s\S]*?raise exception 'customer_cancellation_window_closed'/i.test(
    acceptedGuard
  ),
  'Accepted requests with an incomplete authoritative start must fail closed.'
);
assert(
  /\(v_authoritative_appointment_date \+ v_authoritative_appointment_time\)[\s\S]*?at time zone 'Europe\/Rome'/i.test(
    acceptedGuard
  ),
  'The accepted appointment start must be interpreted in Europe/Rome.'
);
assert(
  /v_appointment_start_at is null[\s\S]*?or v_appointment_start_at <= clock_timestamp\(\) \+ interval '30 minutes'[\s\S]*?raise exception 'customer_cancellation_window_closed'/i.test(
    acceptedGuard
  ),
  'A null start, the exact T-30 boundary and everything later must be rejected with the stable server error.'
);

assert(
  /alter function public\.cancel_public_appointment_by_composite\([\s\S]*?rename to cancel_public_appointment_by_composite_without_cutoff_v1/i.test(
    migration
  ),
  'The legacy composite cancellation implementation must be preserved behind a private core name.'
);
assert(
  /revoke all on function public\.cancel_public_appointment_by_composite_without_cutoff_v1\([\s\S]*?from public, anon, authenticated/i.test(
    migration
  ),
  'The unguarded legacy composite core must not remain callable by clients.'
);

const legacyGuard = migration.match(
  /create function public\.cancel_public_appointment_by_composite\([\s\S]*?return public\.cancel_public_appointment_by_composite_without_cutoff_v1\([\s\S]*?end;\s*\$\$;/i
)?.[0];
assert(legacyGuard, 'The guarded legacy composite cancellation RPC must be recreated.');
assert(
  /select appointment\.\*[\s\S]*?for update of appointment;/i.test(legacyGuard),
  'The legacy live appointment must be locked before evaluating the cutoff.'
);
assert(
  /\(v_appointment\.appointment_date \+ v_appointment\.appointment_time\)[\s\S]*?at time zone 'Europe\/Rome'/i.test(
    legacyGuard
  ),
  'The legacy appointment start must be interpreted in Europe/Rome.'
);
assert(
  /v_appointment_start_at <= clock_timestamp\(\) \+ interval '30 minutes'[\s\S]*?raise exception 'customer_cancellation_window_closed'/i.test(
    legacyGuard
  ),
  'The legacy path must enforce the same closed T-30 boundary and stable error.'
);

assert(
  !/create (?:or replace )?function public\.cancel_public_booking_request_or_group_v2/i.test(migration) &&
    !/create (?:or replace )?function public\.cancel_public_booking_group_v1/i.test(migration),
  'Linked-group orchestration must stay untouched and inherit the guard through the single-request RPC.'
);

assert(
  /grant execute on function public\.cancel_public_booking_request\(text, uuid, citext, text\)[\s\S]*?to anon, authenticated/i.test(
    migration
  ) &&
    /grant execute on function public\.cancel_public_appointment_by_composite\([\s\S]*?to anon, authenticated/i.test(
      migration
    ),
  'Only the guarded public entry points must remain callable by customer clients.'
);

console.log('Accepted customer cancellation cutoff contracts OK');
