import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES,
  canCancelAcceptedAppointment,
  getAcceptedAppointmentCancellationCutoffMs,
} from '../src/lib/customer-cancellation-policy.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Agenda and client portal store the salon schedule as a local date + local
// time. Tests run in the same Europe/Rome wall-clock contract used by SalonPro.
process.env.TZ = 'Europe/Rome';

const localMs = (year, month, day, hour, minute, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second, 0).getTime();

assert.equal(ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES, 30);
assert.equal(
  getAcceptedAppointmentCancellationCutoffMs('2026-09-15', '10:00'),
  localMs(2026, 9, 15, 9, 30),
  'The accepted-booking deadline must be exactly T-30 minutes.',
);
assert.equal(
  canCancelAcceptedAppointment(
    '2026-09-15',
    '10:00',
    localMs(2026, 9, 15, 9, 29, 59),
  ),
  true,
  'The customer may cancel before T-30.',
);
assert.equal(
  canCancelAcceptedAppointment(
    '2026-09-15',
    '10:00',
    localMs(2026, 9, 15, 9, 30),
  ),
  false,
  'The deadline is closed at T-30, not after it.',
);
assert.equal(
  canCancelAcceptedAppointment(
    '2026-09-15',
    '10:00',
    localMs(2026, 9, 15, 10, 1),
  ),
  false,
  'Past appointments must remain non-cancellable.',
);
assert.equal(
  canCancelAcceptedAppointment(
    '2026-09-15',
    '10:00:30',
    localMs(2026, 9, 15, 9, 30, 29),
  ),
  true,
  'Database times with seconds must retain their exact cutoff.',
);
assert.equal(canCancelAcceptedAppointment('2026-02-31', '10:00', 0), false);
assert.equal(canCancelAcceptedAppointment('2026-09-15', '24:00', 0), false);
assert.equal(canCancelAcceptedAppointment('2026-09-15', '10:00', Number.NaN), false);

const clientScreen = read('app/cliente-screen.tsx');
const appContext = read('src/context/AppContext.tsx');
const translations = read('src/lib/i18n.ts');
const helperCallCount = (
  clientScreen.match(/canCancelAcceptedAppointment\s*\(/g) ?? []
).length;

assert.equal(
  helperCallCount,
  3,
  'The same policy must guard the tap and both accepted-booking card sections.',
);
assert.match(
  clientScreen,
  /isAccepted[\s\S]*?!canCancelAcceptedAppointment\(richiesta\.data, richiesta\.ora, Date\.now\(\), customerCancellationPolicy\.minutes\)/,
  'The final tap guard must always use a fresh clock reading.',
);
assert.match(
  clientScreen,
  /getAcceptedAppointmentCancellationCutoffMs\([\s\S]*?setTimeout\([\s\S]*?nextCutoffMs - nowMs/,
  'The UI must schedule one refresh at the next real deadline.',
);
assert.doesNotMatch(
  clientScreen,
  /setInterval\([^)]*acceptedCancellation/i,
  'Cancellation availability must not add a permanent polling interval.',
);
assert.match(
  clientScreen,
  /canCancel:\s*item\.stato === 'In attesa'/,
  'Pending requests must keep their existing cancellation path.',
);
assert.doesNotMatch(clientScreen, /canCancelUntilPreviousMidnight/);
assert.doesNotMatch(clientScreen, /mezzanotte del giorno prima/i);
assert.equal(
  (translations.match(/frontend_can_cancel_until:/g) ?? []).length,
  5,
  'Every supported language must keep the policy copy.',
);
assert.equal(
  (translations.match(/frontend_can_cancel_until:[\s\S]{0,100}?30 minut/gi) ?? [])
    .length,
  5,
  'Every supported language must describe the 30-minute deadline.',
);
assert.doesNotMatch(
  translations,
  /midnight of the previous day|medianoche del día anterior|minuit la veille|Mitternacht des Vortags|mezzanotte del giorno prima/i,
);

assert.match(
  appContext,
  /CUSTOMER_CANCELLATION_WINDOW_CLOSED_ERROR\s*=\s*['"]customer_cancellation_window_closed['"]/,
  'The client data layer must recognize the stable server cutoff error.',
);
assert.equal(
  (appContext.match(/errorCode:\s*'cancellation_window_closed' as const/g) ?? [])
    .length,
  3,
  'Snapshot fallback, grouped cancellation and the general RPC path must expose the same cutoff code.',
);
assert.ok(
  appContext.indexOf('if (cancellationWindowClosed)') <
    appContext.indexOf('const isLegacySnapshotOnlyRequest = !cancellationResponseData'),
  'The legacy composite RPC cutoff must be handled before snapshot-only fallback logic.',
);
assert.match(
  clientScreen,
  /result\.errorCode === 'cancellation_window_closed'[\s\S]*?cancellationWindowClosed \? 'Tempo scaduto'/,
  'A server-authoritative race at the cutoff must be shown as Tempo scaduto, not a generic failure.',
);

console.log('Client accepted cancellation cutoff contracts passed.');

for (const minutes of [0,15,30,60,1440,10080]) {
 const cutoff = localMs(2026,9,15,10,0) - minutes * 60000;
 assert.equal(getAcceptedAppointmentCancellationCutoffMs('2026-09-15','10:00',minutes), cutoff);
 assert.equal(canCancelAcceptedAppointment('2026-09-15','10:00',cutoff-1,minutes),true);
 assert.equal(canCancelAcceptedAppointment('2026-09-15','10:00',cutoff,minutes),false);
}
