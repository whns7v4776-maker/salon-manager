const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rootLayoutSource = fs.readFileSync(
  path.join(root, 'app', '_layout.tsx'),
  'utf8',
);
const ownerTabsLayoutSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', '_layout.tsx'),
  'utf8',
);
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  ownerTabsLayoutSource,
  /ownerMobileSessionAccessReady[\s\S]*?ownerInitialDataHydrating[\s\S]*?ownerServerSyncReady[\s\S]*?!ownerAppointmentsAuthoritative[\s\S]*?agendaDensityPreferenceHydrated/,
  'The iOS Agenda skeleton must keep waiting for authoritative appointments and hydrated density.',
);

const pendingSyncHydrationMatches = contextSource.match(
  /const pendingSyncResult = await syncPendingAgendaDensityPreference\([\s\S]*?setAgendaDensityPreferenceHydrated\(true\);[\s\S]*?return pendingSyncResult;/g,
) ?? [];
if (pendingSyncHydrationMatches.length !== 2) {
  throw new Error(
    'Every pending Agenda density replay must settle hydration even when the server write remains pending.',
  );
}

requirePattern(
  ownerTabsLayoutSource,
  /!ownerAppointmentsAuthoritative\s*\|\|\s*!agendaDensityPreferenceHydrated\s*\)\s*\{\s*return;/,
  'The iOS Agenda must still wait for its local or remote density preference to hydrate.',
);

requirePattern(
  ownerTabsLayoutSource,
  /\[ios-agenda-startup\] skeleton_released[\s\S]*?ownerAppointmentsAuthoritative[\s\S]*?ownerServerSyncReady[\s\S]*?agendaDensityPreferenceHydrated/,
  'Development logs must confirm which safe conditions released the iOS Agenda skeleton.',
);

if (/setOwnerAppointmentsAuthoritative\(true\)/.test(ownerTabsLayoutSource)) {
  throw new Error(
    'The UI-only startup release must not promote cached appointments to authoritative server data.',
  );
}

console.log('iOS Agenda startup release contracts: OK');
