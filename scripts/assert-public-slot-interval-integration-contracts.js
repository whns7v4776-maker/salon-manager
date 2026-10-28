/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const booking = read('src/lib/booking.ts');
const client = read('app/cliente-screen.tsx');
const context = read('src/context/AppContext.tsx');
const agenda = read('app/(tabs)/agenda.tsx');
const migration = read(
  'supabase/migrations/20260901133000_set_public_slot_interval_atomically.sql',
);

assert.match(
  booking,
  /publicSlotIntervalMode: PublicSlotIntervalMode;[\s\S]*?publicSlotMinimumIntervalMinutes: number;[\s\S]*?publicSlotIntervalUpdatedAt\?: string;/,
  'The shared settings contract must keep the customer cadence in its own timestamped group.',
);
assert.match(
  booking,
  /DEFAULT_PUBLIC_SLOT_MINIMUM_INTERVAL_MINUTES = 15/,
  'The customer cadence must default to 15 minutes.',
);
assert.match(
  booking,
  /getPublicSlotIntervalForDate[\s\S]*?Math\.ceil\(minimumInterval \/ agendaInterval\) \* agendaInterval/,
  'The customer cadence must remain aligned to the effective agenda grid.',
);

const clientImportBlock = client.slice(0, client.indexOf('type PremiumTabTransitionProps'));
assert.doesNotMatch(
  clientImportBlock,
  /\bbuildDisplayTimeSlots\b|\bgetSlotIntervalForDate\b/,
  'The customer frontend must not accidentally return to the internal agenda cadence.',
);
assert.ok(
  (client.match(/buildPublicDisplayTimeSlots\(/g) ?? []).length >= 4,
  'Selected-day availability, summaries, full-day state and submit validation must share the public cadence.',
);
assert.ok(
  (client.match(/getPublicSlotIntervalForDate\(/g) ?? []).length >= 3,
  'Guided slots and waitlist grouping must use the public cadence.',
);
assert.match(
  client,
  /const validationSettings = latestSalonState\?\.availabilitySettings[\s\S]*?mergeFrontendAvailabilitySettings\(\{[\s\S]*?currentSettings: effectiveAvailabilitySettings,[\s\S]*?incomingSettings: latestSalonState\.availabilitySettings/,
  'Submit preflight must not let a warm salon snapshot overwrite a newer timestamped customer cadence.',
);
assert.match(
  client,
  /buildPublicDisplayTimeSlots\(validationSettings, data\)\.includes\(ora\)[\s\S]*?setOra\(''\)/,
  'A stale selected time must be revoked before submit when the salon changes customer cadence.',
);
assert.match(
  client,
  /doesBlockingAppointmentOverlapSelectedPlanAtSlot[\s\S]*?doRelativeBusyIntervalsOverlap[\s\S]*?slotHasBlockingAppointmentByOtherCustomer/,
  'Waitlist eligibility must detect off-cadence appointments overlapping the selected service plan.',
);

assert.match(
  context,
  /getPublicSlotIntervalUpdatedAtMs[\s\S]*?publicSlotIntervalAuthority[\s\S]*?withPublicSlotIntervalAuthority/,
  'Local, snapshot and remote owner state must resolve customer cadence by its own timestamp.',
);
assert.match(
  context,
  /set_public_slot_interval_v1[\s\S]*?p_mode:[\s\S]*?p_minimum_interval_minutes:/,
  'Owner persistence must use the atomic customer-cadence RPC.',
);
assert.match(
  context,
  /hasAtomicAvailabilitySettingChange[\s\S]*?const portalPublishTask = hasAtomicAvailabilitySettingChange[\s\S]*?!hasAtomicAvailabilitySettingChange && isUuidValue\(workspaceId\)/,
  'Atomic customer-cadence saves must not race full portal or snapshot publishers.',
);

assert.match(
  agenda,
  /testID="owner-public-slot-interval-card"[\s\S]*?15 min consigliato[\s\S]*?Come Agenda[\s\S]*?PUBLIC_SLOT_INTERVAL_PRESETS/,
  'The salon must be able to keep the default 15 minutes, follow Agenda or choose a custom cadence.',
);
assert.match(
  agenda,
  /publicSlotIntervalUpdatedAt: new Date\(\)\.toISOString\(\)[\s\S]*?waitForServerPersistence: true/,
  'A salon selection must wait for server confirmation and carry a conflict timestamp.',
);

const publicSlotStyleStart = agenda.indexOf('  publicSlotIntervalCard: {');
const publicSlotStyleEnd = agenda.indexOf('  lunchBreakHeaderRow: {', publicSlotStyleStart);
assert.notEqual(publicSlotStyleStart, -1, 'Missing public-slot premium style block.');
assert.notEqual(publicSlotStyleEnd, -1, 'Missing public-slot premium style block end.');
const publicSlotStyles = agenda.slice(publicSlotStyleStart, publicSlotStyleEnd);
assert.match(
  publicSlotStyles,
  /backgroundColor: '#10233f'[\s\S]*?backgroundColor: '#e5f5ff'[\s\S]*?borderColor: '#38bdf8'/,
  'The section must use the project navy/glass palette with a restrained cyan selected state.',
);
assert.doesNotMatch(
  publicSlotStyles,
  /#5b21b6|#6d28d9|#faf7ff|#ddd6fe/,
  'The rejected purple palette must not return inside this section.',
);

const appStateSubscriptionStart = agenda.indexOf(
  "const subscription = AppState.addEventListener('change'",
);
const appStateSubscriptionEnd = agenda.indexOf(
  'return () => subscription.remove();',
  appStateSubscriptionStart,
);
assert.notEqual(appStateSubscriptionStart, -1, 'Missing Agenda AppState subscription.');
assert.notEqual(appStateSubscriptionEnd, -1, 'Missing Agenda AppState cleanup.');
assert.doesNotMatch(
  agenda.slice(appStateSubscriptionStart, appStateSubscriptionEnd),
  /closeCustomizeHours\(/,
  'Temporary inactive/background transitions must not collapse Personalizza orari.',
);
assert.match(
  agenda,
  /useFocusEffect\([\s\S]*?return \(\) => \{[\s\S]*?closeCustomizeHours\(\);[\s\S]*?toggleCustomizeHours/,
  'Personalizza orari must still close on tab blur and through its manual toggle.',
);

assert.match(
  migration,
  /merge_client_portal_public_slot_interval_v1[\s\S]*?protect_client_portal_public_slot_interval_v1[\s\S]*?protect_owner_snapshot_public_slot_interval_v1/,
  'Portal and owner snapshot writes must preserve a newer customer cadence.',
);
assert.match(
  migration,
  /set_public_slot_interval_v1\([\s\S]*?p_mode text default 'custom'[\s\S]*?p_minimum_interval_minutes integer default 15/,
  'The authenticated atomic RPC must expose the agreed default.',
);

console.log(
  'Public customer slot cadence integration contracts verified (owner, client, waitlist and server).',
);
