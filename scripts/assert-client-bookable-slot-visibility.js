/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', 'cliente-screen.tsx'),
  'utf8',
);

const requirePattern = (value, pattern, message) => {
  if (!pattern.test(value)) throw new Error(message);
};
const rejectPattern = (value, pattern, message) => {
  if (pattern.test(value)) throw new Error(message);
};

const visibleSlotsStart = source.indexOf(
  'const visibleExpandedFrontendTimeSlots = useMemo(() =>',
);
const visibleSlotsEnd = source.indexOf(
  'const shouldRenderExpandedTimeGrid =',
  visibleSlotsStart,
);
if (visibleSlotsStart < 0 || visibleSlotsEnd <= visibleSlotsStart) {
  throw new Error('The customer-facing time-slot visibility boundary could not be isolated.');
}
const visibleSlotsSource = source.slice(visibleSlotsStart, visibleSlotsEnd);

const guidedSlotsStart = source.indexOf(
  'const selectedUnavailableFrontendSlot = useMemo(() =>',
);
const guidedSlotsEnd = source.indexOf(
  'const shouldShowOnlyRecommendedSlots =',
  guidedSlotsStart,
);
if (guidedSlotsStart < 0 || guidedSlotsEnd <= guidedSlotsStart) {
  throw new Error('The guided-slot stale-selection boundary could not be isolated.');
}
const guidedSlotsSource = source.slice(guidedSlotsStart, guidedSlotsEnd);

const waitlistEligibilityStart = source.indexOf(
  'const waitlistableOccupiedSlots = useMemo(',
);
const waitlistEligibilityEnd = source.indexOf(
  'const currentDayActiveWaitlistAlerts = useMemo(',
  waitlistEligibilityStart,
);
if (waitlistEligibilityStart < 0 || waitlistEligibilityEnd <= waitlistEligibilityStart) {
  throw new Error('The waitlist eligibility boundary could not be isolated.');
}
const waitlistEligibilitySource = source.slice(
  waitlistEligibilityStart,
  waitlistEligibilityEnd,
);

const passiveRefreshStart = source.indexOf(
  'const intervalId = setInterval(() => {\n      void refreshBadges();',
);
const passiveRefreshEnd = source.indexOf(
  'const requestClientEmailOtpForRegistration = useCallback(',
  passiveRefreshStart,
);
if (passiveRefreshStart < 0 || passiveRefreshEnd <= passiveRefreshStart) {
  throw new Error('The passive live-refresh boundary could not be isolated.');
}
const passiveRefreshSource = source.slice(passiveRefreshStart, passiveRefreshEnd);

requirePattern(
  visibleSlotsSource,
  /customerVisibleTimeSlots = displayTimeSlots\.filter\([\s\S]*?isFrontendSlotBookable\(slotTime\)[\s\S]*?slotTime === selectedUnavailableFrontendSlot/,
  'The client grid must show only live-bookable slots, while preserving only a selected start that becomes stale.',
);
rejectPattern(
  visibleSlotsSource,
  /return displayTimeSlots;/,
  'The client grid must not expose the complete list of unavailable slots.',
);
requirePattern(
  visibleSlotsSource,
  /if \(!shouldShowGuidedRecommendations\) \{[\s\S]*?return customerVisibleTimeSlots;[\s\S]*?guidedSlotsVisibility === 'recommended_only'/,
  'Guided-only configuration must still expose green slots when no recommendation exists.',
);
requirePattern(
  guidedSlotsSource,
  /selectedSlotAuthorityReady[\s\S]*?isLivePublicSlotAvailabilityResolvedForCurrentQuery[\s\S]*?isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery[\s\S]*?isFrontendSlotBookable\(selectedStartTime\)[\s\S]*?visibleGuidedRecommendedTimeSlots[\s\S]*?selectedUnavailableFrontendSlot/,
  'A stale selected start must be retained only after current authoritative availability resolves, including guided mode.',
);
requirePattern(
  waitlistEligibilitySource,
  /displayTimeSlots\.filter/,
  'Waitlist eligibility must continue to inspect the complete slot model instead of the visible grid.',
);
requirePattern(
  source,
  /waitlistSlotBlocks\.length > 0[\s\S]*?Avvisi disponibilità[\s\S]*?Ricevi un avviso quando uno slot occupato torna libero/,
  'The separate availability-alert entry point must remain visible and independent from hidden red cards.',
);
requirePattern(
  source,
  /!canAnySlotBeBooked[\s\S]*?Nessuno slot libero per questo servizio nel giorno selezionato\./,
  'A day with no green slots must retain an explicit unavailable state.',
);
requirePattern(
  passiveRefreshSource,
  /const intervalId = setInterval\(\(\) => \{[\s\S]*?refreshPublicSalonAvailability\(\);[\s\S]*?refreshFrontendWaitlistState\(\);[\s\S]*?FRONTEND_PASSIVE_REFRESH_MS/,
  'Passive live refresh must continue to update both visible availability and waitlist state.',
);

console.log('Client bookable-slot visibility contracts passed.');
