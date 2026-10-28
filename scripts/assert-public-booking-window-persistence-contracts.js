const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appContext = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const agenda = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);

const sliceBetween = (source, startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const availabilityPersistence = sliceBetween(
  appContext,
  'const updateAvailabilitySettingsPersisted = React.useCallback(',
  'const updateGuidedSlotsSettingsPersisted = React.useCallback(',
  'availability settings persistence',
);

const firstAwaitIndex = availabilityPersistence.indexOf('await ');
const pendingGuardIndex = availabilityPersistence.indexOf(
  'availabilitySettingsRemoteWritePendingRef.current += 1',
);
const revisionRefIndex = availabilityPersistence.indexOf(
  'availabilitySettingsMutationRevisionRef.current',
);

assert.notEqual(
  firstAwaitIndex,
  -1,
  'Availability persistence must await durable storage.',
);
assert.ok(
  pendingGuardIndex >= 0 && pendingGuardIndex < firstAwaitIndex,
  'The remote-write guard must start before the first cache await so an in-flight refresh cannot bounce the first selection.',
);
assert.ok(
  revisionRefIndex >= 0 && revisionRefIndex < firstAwaitIndex,
  'Each availability mutation must receive a revision before the first asynchronous boundary.',
);
assert.match(
  availabilityPersistence,
  /availabilitySettingsRemoteWritePendingRef\.current\s*=\s*Math\.max\(\s*0,\s*availabilitySettingsRemoteWritePendingRef\.current\s*-\s*1,?\s*\)/,
  'Every completed or failed server write must release the pending guard.',
);

assert.match(
  availabilityPersistence,
  /supabase\.rpc\(\s*['"]set_public_booking_window_v1['"][\s\S]*?p_value:[\s\S]*?p_unit:/,
  'The public booking window must use its server-authoritative atomic RPC.',
);
assert.match(
  availabilityPersistence,
  /isMissingPublicBookingWindowRpcError\(atomicWindowResult\.error\)[\s\S]*?supabase\.rpc\(\s*['"]update_client_portal_availability_settings['"]/, 
  'The previous availability writer may be used only as a rollout fallback while the atomic RPC is missing.',
);
assert.match(
  availabilityPersistence,
  /normalizeAvailabilitySettingsRpcPayload\([\s\S]*?atomicWindowResult\.data[\s\S]*?normalizeAvailabilitySettingsRpcPayload\(fallbackResult\.data\)/,
  'Both atomic and rollout-fallback confirmations must be normalized before entering owner state.',
);
assert.match(
  availabilityPersistence,
  /(?:confirmed|persisted|remote)[A-Za-z]*Availability(?:Settings|Snapshot)?[\s\S]*?(?:doesAvailability|matchesAvailability|confirmedChanged|requestedChanged|changedAvailability|publicBookingWindowChanged)[\s\S]*?throw new Error/,
  'A syntactically valid RPC response must still be checked against the requested mutation.',
);

assert.match(
  availabilityPersistence,
  /availabilitySettingsMutationRevisionRef\.current\s*===\s*[A-Za-z]*mutationRevision/,
  'A server response may be applied only while it is still the latest availability mutation.',
);

assert.match(
  availabilityPersistence,
  /const hasAtomicAvailabilitySettingChange\s*=\s*publicBookingWindowChanged \|\| publicSlotIntervalChanged[\s\S]*?const portalPublishTask = hasAtomicAvailabilitySettingChange\s*\? Promise\.resolve\(\)/,
  'The atomic booking-window mutation must not race a second full portal publisher.',
);
assert.match(
  availabilityPersistence,
  /if \(!hasAtomicAvailabilitySettingChange && isUuidValue\(workspaceId\)\)/,
  'The atomic booking-window mutation must not race a second owner-snapshot writer.',
);

const authoritativeApplyPattern =
  /if\s*\(\s*availabilitySettingsMutationRevisionRef\.current\s*===\s*[A-Za-z]*mutationRevision\s*\)\s*\{[\s\S]*?availabilitySettingsRef\.current\s*=[\s\S]*?setAvailabilitySettings\([\s\S]*?AsyncStorage\.setItem\(/;
assert.match(
  availabilityPersistence,
  authoritativeApplyPattern,
  'Only the latest confirmed revision may update the owner UI and its account-scoped cache.',
);

const bookingCard = sliceBetween(
  agenda,
  '<View style={styles.publicBookingWindowCard}>',
  '{isSelectedDateHoursCustomizationLocked ?',
  'shared app/web public booking-window card',
);
assert.match(
  bookingCard,
  /publicBookingWindowUnit:\s*option\.value[\s\S]*?\{\s*waitForServerPersistence:\s*true\s*\}/,
  'Changing the booking-window unit in the shared app/web card must wait for server persistence.',
);

const bookingWindowPicker = sliceBetween(
  agenda,
  '<NumberPickerModal\n        visible={showPublicBookingWindowPicker}',
  '<Modal\n        visible={',
  'shared app/web public booking-window picker',
);
assert.match(
  bookingWindowPicker,
  /publicBookingWindowValue:\s*nextValue[\s\S]*?\{\s*waitForServerPersistence:\s*true\s*\}/,
  'Confirming booking-window days in the shared app/web picker must wait for server persistence.',
);

console.log(
  'Contratti persistenza Finestra prenotazioni online verificati (app + web).',
);
