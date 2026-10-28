/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const assertIncludes = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`Contratto passo slot mancante: ${label}`);
  }
};

const booking = read('src/lib/booking.ts');
const agenda = read('app/(tabs)/agenda.tsx');
const services = read('app/(tabs)/servizi.tsx');
const client = read('app/cliente-screen.tsx');
const context = read('src/context/AppContext.tsx');
const migration = read(
  'supabase/migrations/20260821153000_schedule_slot_interval_changes.sql',
);

assertIncludes(
  booking,
  'scheduledSlotIntervalEffectiveFrom?: string;',
  'tipo condiviso',
);
assertIncludes(
  booking,
  'dateValue >= settings.scheduledSlotIntervalEffectiveFrom',
  'attivazione per data',
);
assertIncludes(
  agenda,
  'findFirstSafeSlotIntervalDate',
  'prima giornata utile',
);
assertIncludes(
  agenda,
  'onPress={() => setShowSlotIntervalPicker(true)}',
  'programmazione disponibile anche se il giorno visualizzato e occupato',
);
assertIncludes(
  agenda,
  'protectedSlotIntervalDates.has(dateValue)',
  'protezione giornate occupate',
);
assertIncludes(
  agenda,
  'scheduledSlotIntervalEffectiveFrom: effectiveFrom',
  'salvataggio programmazione',
);
assertIncludes(
  services,
  'availabilitySettings.scheduledSlotIntervalMinutes',
  'validazione servizi futuri',
);
assertIncludes(
  client,
  'scheduledSlotIntervalEffectiveFrom:',
  'riconciliazione live cliente',
);
assertIncludes(
  context,
  'scheduledSlotIntervalEffectiveFrom:',
  'riconciliazione live proprietario',
);
assertIncludes(
  migration,
  'availability_slot_interval_for_date',
  'regola server per data',
);
assertIncludes(
  migration,
  'merge_client_portal_slot_interval_schedule_v1',
  'merge server anti-stato-obsoleto',
);

const resolveInterval = ({ base, scheduled, effectiveFrom, overrides }, date) => {
  const explicit = overrides.find((item) => item.date === date);
  if (explicit) return explicit.minutes;
  if (scheduled && effectiveFrom && date >= effectiveFrom) return scheduled;
  return base;
};

const settings = {
  base: 30,
  scheduled: 15,
  effectiveFrom: '2026-09-10',
  overrides: [{ date: '2026-09-12', minutes: 30 }],
};

if (resolveInterval(settings, '2026-09-09') !== 30) {
  throw new Error('Il passo futuro non deve modificare le date precedenti.');
}
if (resolveInterval(settings, '2026-09-10') !== 15) {
  throw new Error('Il passo futuro deve attivarsi nella data programmata.');
}
if (resolveInterval(settings, '2026-09-12') !== 30) {
  throw new Error('La protezione esplicita di una giornata occupata deve vincere.');
}

console.log('Contratto programmazione passo slot verificato.');
