import assert from 'node:assert/strict';

import {
  buildDisplayTimeSlots,
  buildPublicDisplayTimeSlots,
  doesServiceBookingConflictWithAppointment,
  getPublicSlotIntervalForDate,
  getSlotIntervalForDate,
  normalizeAvailabilitySettings,
} from '../src/lib/booking';

const settingsWithAgendaStep = (
  agendaStep: number,
  overrides: Parameters<typeof normalizeAvailabilitySettings>[0] = {},
) =>
  normalizeAvailabilitySettings({
    slotIntervalMinutes: agendaStep,
    ...overrides,
  });

assert.equal(
  normalizeAvailabilitySettings().publicSlotIntervalMode,
  'custom',
  'An old salon snapshot must receive the new 15-minute customer default.',
);
assert.equal(
  normalizeAvailabilitySettings().publicSlotMinimumIntervalMinutes,
  15,
  'The customer cadence must default to 15 minutes.',
);

for (const [agendaStep, expectedPublicStep] of [
  [5, 15],
  [10, 20],
  [15, 15],
  [20, 20],
] as const) {
  assert.equal(
    getPublicSlotIntervalForDate(settingsWithAgendaStep(agendaStep)),
    expectedPublicStep,
    `Agenda ${agendaStep} must resolve to customer cadence ${expectedPublicStep}.`,
  );
}

assert.equal(
  getPublicSlotIntervalForDate(
    settingsWithAgendaStep(10, { publicSlotIntervalMode: 'follow_agenda' }),
  ),
  10,
  'The explicit follow-agenda mode must preserve the internal cadence.',
);
assert.equal(
  getPublicSlotIntervalForDate(
    settingsWithAgendaStep(20, {
      publicSlotIntervalMode: 'custom',
      publicSlotMinimumIntervalMinutes: 30,
    }),
  ),
  40,
  'A salon custom minimum must be promoted to the next safe agenda multiple.',
);
assert.equal(
  normalizeAvailabilitySettings({
    publicSlotMinimumIntervalMinutes: 17,
  }).publicSlotMinimumIntervalMinutes,
  15,
  'Invalid persisted values must fall back to the safe default.',
);

const scheduledSettings = settingsWithAgendaStep(5, {
  scheduledSlotIntervalMinutes: 10,
  scheduledSlotIntervalEffectiveFrom: '2026-09-10',
  dateSlotIntervals: [
    { date: '2026-09-11', slotIntervalMinutes: 20 },
    { date: '2026-09-12', slotIntervalMinutes: 5 },
  ],
});

assert.equal(getPublicSlotIntervalForDate(scheduledSettings, '2026-09-09'), 15);
assert.equal(getPublicSlotIntervalForDate(scheduledSettings, '2026-09-10'), 20);
assert.equal(getPublicSlotIntervalForDate(scheduledSettings, '2026-09-11'), 20);
assert.equal(getPublicSlotIntervalForDate(scheduledSettings, '2026-09-12'), 15);

const shortMonday = settingsWithAgendaStep(5, {
  weeklySchedule: [
    { weekday: 1, isClosed: false, startTime: '09:00', endTime: '09:40' },
  ],
});

assert.deepEqual(
  buildDisplayTimeSlots(shortMonday, '2026-09-07'),
  ['09:00', '09:05', '09:10', '09:15', '09:20', '09:25', '09:30', '09:35'],
  'The internal agenda grid must remain unchanged.',
);
assert.deepEqual(
  buildPublicDisplayTimeSlots(shortMonday, '2026-09-07'),
  ['09:00', '09:15', '09:30'],
  'The customer list must be a safe subset of the internal grid.',
);

const tenMinuteAgenda = settingsWithAgendaStep(10, {
  weeklySchedule: [
    { weekday: 1, isClosed: false, startTime: '09:00', endTime: '09:50' },
  ],
});
assert.deepEqual(
  buildPublicDisplayTimeSlots(tenMinuteAgenda, '2026-09-07'),
  ['09:00', '09:20', '09:40'],
  'A 15-minute minimum on a 10-minute agenda must expose aligned 20-minute starts.',
);

assert.equal(
  getSlotIntervalForDate(scheduledSettings, '2026-09-10'),
  10,
  'Resolving the public cadence must not alter the authoritative agenda interval.',
);

const waitlistServices = [
  {
    id: 'service-30',
    nome: 'Servizio 30 minuti',
    prezzo: 20,
    durataMinuti: 30,
  },
];
assert.equal(
  doesServiceBookingConflictWithAppointment({
    startTime: '09:00',
    serviceName: 'Servizio 30 minuti',
    appointment: {
      ora: '09:05',
      servizio: 'Blocco fuori cadenza',
      durataMinuti: 10,
    },
    services: waitlistServices,
  }),
  true,
  'A hidden 09:05 appointment must still block the public 09:00 plan and remain waitlist-aware.',
);
assert.equal(
  doesServiceBookingConflictWithAppointment({
    startTime: '09:15',
    serviceName: 'Servizio 30 minuti',
    appointment: {
      ora: '09:05',
      servizio: 'Blocco fuori cadenza',
      durataMinuti: 10,
    },
    services: waitlistServices,
  }),
  false,
  'A blocking interval that ends exactly on the next public start must not create a false overlap.',
);

console.log('Public customer slot cadence contracts verified.');
