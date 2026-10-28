/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260903111500_cache_public_booking_day_conflicts_per_request.sql',
  ),
  'utf8',
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(migration)) throw new Error(message);
};

requirePattern(
  /get_public_booking_busy_records_cached_read_v1[\s\S]*?salonpro\.public_booking_busy_key[\s\S]*?salonpro\.public_booking_busy_json/,
  'The exact-slot read path must cache one workspace/day busy snapshot.',
);
requirePattern(
  /get_public_phased_busy_intervals_cached_read_v1[\s\S]*?salonpro\.public_booking_phased_busy_key[\s\S]*?salonpro\.public_booking_phased_busy_json/,
  'The phase-aware read path must cache one workspace/day interval snapshot.',
);
requirePattern(
  /install_cached_exact_read_validator[\s\S]*?get_public_booking_busy_records_cached_read_v1[\s\S]*?pg_get_functiondef[\s\S]*?is_public_booking_slot_available_cached_read_v1/,
  'The cached exact reader must preserve the deployed validator and replace only its busy source.',
);
requirePattern(
  /get_public_booking_slot_availability_batch[\s\S]*?get_public_booking_slot_availability_batch_v2[\s\S]*?get_public_phased_booking_slot_availability_batch_v2[\s\S]*?get_public_phased_booking_slot_availability_batch_v3[\s\S]*?resolve_public_composition_operator_plan_v1/,
  'Every public read planner must use the cached interval validator.',
);
requirePattern(
  /Only availability readers are redirected[\s\S]*?Atomic booking writers retain the[\s\S]*?uncached exact validator/,
  'The migration must explicitly preserve live writer validation.',
);
requirePattern(
  /revoke all on function public\.is_public_operator_interval_available_cached_read_v1[\s\S]*?from public, anon, authenticated/,
  'Internal cache helpers must not become public RPCs.',
);

console.log('Public booking day-conflict cache contracts verified.');
