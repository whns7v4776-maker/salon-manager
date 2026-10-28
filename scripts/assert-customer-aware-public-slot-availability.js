/* global __dirname */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260826034500_customer_aware_public_slot_batches.sql',
  ),
  'utf8',
);
const hardeningMigration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260826040000_harden_customer_aware_public_slot_batches.sql',
  ),
  'utf8',
);
const client = fs.readFileSync(path.join(root, 'app/cliente-screen.tsx'), 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  /create or replace function public\.get_public_booking_slot_availability_batch_v3\([\s\S]*?p_customer_email text[\s\S]*?p_customer_phone text[\s\S]*?p_customer_duration_minutes integer/.test(
    migration,
  ),
  'The simple batch must expose customer identity and the complete envelope duration.',
);
assert(
  /create or replace function public\.get_public_phased_booking_slot_availability_batch_v4\([\s\S]*?p_customer_email text[\s\S]*?p_customer_phone text[\s\S]*?p_customer_duration_minutes integer/.test(
    migration,
  ),
  'The phased batch must expose customer identity and the complete envelope duration.',
);
assert(
  /get_public_customer_busy_envelopes_v1[\s\S]*?request\.status::text in \('pending', 'accepted'\)[\s\S]*?request\.customer_id = v_customer_id[\s\S]*?request\.customer_email = v_customer_email[\s\S]*?request\.customer_phone[\s\S]*?from public\.appointments[\s\S]*?appointment\.customer_id = v_customer_id[\s\S]*?customer\.email = v_customer_email[\s\S]*?customer\.phone/.test(
    migration,
  ),
  'Availability must use the same customer id/email/normalized-phone identity as the final write guard.',
);
assert(
  (migration.match(/busy_range && v_requested_range/g) ?? []).length === 2,
  'Both simple and phased batches must reject every overlapping customer envelope.',
);
assert(
  (migration.match(/resolve_customer_service_timing_v1/g) ?? []).length === 2 &&
    (migration.match(/make_interval\(mins => v_customer_duration\)/g) ?? []).length === 2,
  'Both simple and phased previews must use the server-resolved full customer duration.',
);
assert(
  /appointment_groups as appointment_group[\s\S]*?final_appointment\.appointment_date between p_appointment_date - 1 and p_appointment_date[\s\S]*?terminalPauseMinutes/.test(
    migration,
  ),
  'Customer busy envelopes must include terminal composition pauses, including midnight crossings.',
);
assert(
  /get_public_customer_busy_envelopes_v1\([\s\S]*?p_customer_name text[\s\S]*?lower\(trim\(final_appointment\.customer_name\)\) = v_customer_name/.test(
    migration,
  ),
  'Terminal-pause identity must retain the final write guard name match.',
);
assert(
  /get_public_booking_slot_availability_batch_v3[\s\S]*?p_customer_email:\s*profile\.email[\s\S]*?p_customer_phone:\s*profile\.telefono[\s\S]*?p_customer_duration_minutes:\s*customerDurationMinutes/.test(
    client,
  ),
  'Detailed simple slot loading must send the signed-in customer identity and personalized duration.',
);
assert(
  /get_public_phased_booking_slot_availability_batch_v4[\s\S]*?p_customer_email:\s*profile\.email[\s\S]*?p_customer_phone:\s*profile\.telefono[\s\S]*?p_customer_duration_minutes:\s*customerDurationMinutes/.test(
    client,
  ),
  'Detailed phased slot loading must send the signed-in customer identity and personalized duration.',
);
assert(
  /get_public_phased_booking_slot_availability_batch_v4[\s\S]*?p_customer_duration_minutes:\s*requestedDurationMinutes[\s\S]*?get_public_booking_slot_availability_batch_v3[\s\S]*?p_customer_duration_minutes:\s*requestedDurationMinutes/.test(
    client,
  ),
  'Whole-window day authority must use customer-aware simple and phased batches.',
);
assert(
  ((client.match(/p_customer_name:\s*`\$\{profile\.nome\.trim\(\)\} \$\{profile\.cognome\.trim\(\)\}`\.trim\(\) \|\| null/g) ?? []).length +
    (client.match(/p_customer_name:\s*[\s\S]{0,180}?profile\.nome\.trim\(\)[\s\S]{0,80}?profile\.cognome\.trim\(\)[\s\S]{0,80}?\.trim\(\) \|\|[\s\S]{0,20}?null/g) ?? []).length) >= 4,
  'Detailed and whole-window previews must send the canonical customer name used by terminal-pause guards.',
);
assert(
  !/isCustomerAwareAvailabilityRpcUnavailable|get_public_phased_booking_slot_availability_batch_v3[\s\S]{0,2200}?preferredResult|get_public_booking_slot_availability_batch_v2[\s\S]{0,2200}?preferredResult/.test(
    client,
  ),
  'Customer-aware preview must fail closed and retry automatically, never expose a legacy false-green fallback.',
);
assert(
  /drop function if exists public\.get_public_booking_slot_availability_batch_v3\([\s\S]*?drop function if exists public\.get_public_phased_booking_slot_availability_batch_v4\([\s\S]*?filter_public_customer_slot_availability_v1/.test(
    hardeningMigration,
  ),
  'The published intermediate overloads must be removed before the final server-timed contract is installed.',
);
assert(
  /filter_public_customer_slot_availability_v1[\s\S]*?resolve_customer_service_timing_v1[\s\S]*?get_public_customer_busy_envelopes_v1[\s\S]*?busy_range && v_requested_range/.test(
    hardeningMigration,
  ),
  'The final shared filter must combine server timing, customer envelopes and terminal pauses once per batch.',
);

console.log('Customer-aware public slot availability contracts: OK');
