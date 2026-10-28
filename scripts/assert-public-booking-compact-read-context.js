/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260903114500_use_compact_public_booking_read_context.sql',
  ),
  'utf8',
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(migration)) throw new Error(message);
};

requirePattern(
  /get_public_booking_context_cached_read_v1[\s\S]*?'servizi'[\s\S]*?'operatori'[\s\S]*?'availabilitySettings'/,
  'The planner context must contain only services, operators and availability settings.',
);
requirePattern(
  /is_public_operator_available_on_date_cached_read_v1[\s\S]*?salonpro\.public_booking_operator_dates/,
  'Operator working-day decisions must be cached per request.',
);
requirePattern(
  /is_public_booking_slot_available_cached_read_v1[\s\S]*?get_public_booking_context_cached_read_v1[\s\S]*?is_public_operator_available_on_date_cached_read_v1/,
  'The cached exact reader must use the compact payload and operator-day helpers.',
);
requirePattern(
  /revoke all on function public\.get_public_booking_context_cached_read_v1[\s\S]*?from public, anon, authenticated/,
  'Compact helpers must remain internal.',
);

console.log('Public booking compact read-context contracts verified.');
