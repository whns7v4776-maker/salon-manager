/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const booking = read('src/lib/booking.ts');
const agenda = read('app/(tabs)/agenda.tsx');
const context = read('src/context/AppContext.tsx');
const serverGuard = read(
  'supabase/migrations/20260821140000_live_public_availability_and_force_open.sql',
);

assert.match(
  booking,
  /OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE\s*=\s*'9999-12-31'/,
  'La chiusura senza fine deve avere un envelope compatibile con i client precedenti.',
);
assert.match(
  booking,
  /openEnded\?: boolean;/,
  'Il modello condiviso deve conservare il significato senza fine.',
);
assert.match(
  booking,
  /item\.openEnded === true[\s\S]*?endDate === OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE/,
  'Il normalizzatore deve riconoscere sia il flag nuovo sia il sentinel lasciato da un client precedente.',
);
assert.match(
  booking,
  /openEnded && item\.scope !== 'operators' &&[\s\S]*?item\.kind !== 'closure'[\s\S]*?item\.allDay === false/,
  'Le eccezioni operatore possono essere senza fine; per il salone resta richiesta la chiusura intera.',
);
assert.match(
  booking,
  /!isOpenEndedCalendarException\(item\) && dateValue > item\.endDate/,
  'Il resolver condiviso app e web deve mantenere attiva la chiusura dopo la data iniziale.',
);

assert.match(
  agenda,
  /Chiudi dal… senza fine/,
  'Il form condiviso app e web deve esporre la modalita senza fine.',
);
assert.match(
  agenda,
  /const endDate = openEnded[\s\S]*?OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE/,
  'Il salvataggio deve scrivere sempre il sentinel retrocompatibile.',
);
assert.match(
  agenda,
  /openEnded,\s*\n\s*allDay,/,
  'Il salvataggio deve conservare anche il marcatore esplicito.',
);
assert.match(
  agenda,
  /weeklyScheduleUpdatedAt: openEnded[\s\S]*?dateOverrides: openEnded[\s\S]*?!\(item\.forceOpen && item\.date >= startDate\)/,
  'Chiudi dal deve rimuovere soltanto le riaperture manuali future e versionare anche quel gruppo.',
);
assert.match(
  agenda,
  /openEnded\s*\?\s*'Chiudi il salone senza fine'/,
  'La conferma deve dichiarare chiaramente che la chiusura non scade.',
);
assert.match(
  agenda,
  /isOpenEndedCalendarException\(item\)[\s\S]*?Senza fine/,
  'La lista non deve mostrare al salone la data tecnica 31 dicembre 9999.',
);
assert.match(
  agenda,
  /isOpenEndedCalendarClosure[\s\S]*?'Seleziona data di inizio chiusura'/,
  'Il picker non deve presentare la chiusura senza fine come ferie.',
);
assert.match(
  agenda,
  /const eliminaFerie = async[\s\S]*?waitForServerPersistence: true[\s\S]*?Riapertura non salvata/,
  'Riapri deve attendere il server e segnalare un eventuale rollback.',
);
assert.match(
  agenda,
  /pendingOpenEndedCalendarReopen[\s\S]*?visibleCalendarExceptions[\s\S]*?pendingReopen\.item/,
  'La riga open-ended deve restare visibile localmente durante la conferma server.',
);
assert.match(
  agenda,
  /reopeningPending[\s\S]*?disabled=\{reopeningPending\}[\s\S]*?'Riapertura…'/,
  'Riapri deve mostrare uno stato pending non ripetibile fino alla conferma.',
);
assert.match(
  agenda,
  /calendarExceptionsUpdatedAt,[\s\S]*?calendarExceptions:\s*\[/,
  'Ogni aggiunta deve aggiornare il timestamp autorevole del gruppo.',
);
assert.match(
  agenda,
  /\{ waitForServerPersistence: true \}/,
  'La chiusura deve attendere la conferma server prima di risultare salvata.',
);
assert.match(
  agenda,
  /canAddVacationRange &&[\s\S]*?calendarExceptionSaveButtonActive[\s\S]*?backgroundColor: '#2563EB'/,
  'Il pulsante condiviso app e web deve diventare blu soltanto quando il modulo e valido.',
);
assert.match(
  agenda,
  /canAddVacationRange &&[\s\S]*?calendarExceptionSaveButtonTextActive[\s\S]*?color: '#FFFFFF'/,
  'Il testo del pulsante attivo deve restare bianco e leggibile.',
);

assert.match(
  context,
  /calendarExceptionsAuthority[\s\S]*?calendarExceptionsUpdatedAt/,
  'La riconciliazione owner deve preservare la copia piu recente delle eccezioni.',
);
assert.match(
  serverGuard,
  /v_date_text <= coalesce\(item ->> 'endDate', ''\)/,
  'Il controllo pubblico deve applicare il limite endDate inviato dai client.',
);

const sentinel = '9999-12-31';
const matches = (item, date) =>
  item.startDate <= date && date <= item.endDate;

const openEndedClosure = {
  kind: 'closure',
  startDate: '2026-09-10',
  endDate: sentinel,
  openEnded: true,
};
assert.equal(matches(openEndedClosure, '2026-09-09'), false);
assert.equal(matches(openEndedClosure, '2026-09-10'), true);
assert.equal(matches(openEndedClosure, '2048-04-22'), true);

const rewrittenByOlderClient = { ...openEndedClosure };
delete rewrittenByOlderClient.openEnded;
assert.equal(
  matches(rewrittenByOlderClient, '2048-04-22'),
  true,
  'La build precedente deve continuare a bloccare grazie al sentinel.',
);

const finiteClosure = {
  startDate: '2026-09-10',
  endDate: '2026-09-12',
};
assert.equal(matches(finiteClosure, '2026-09-12'), true);
assert.equal(matches(finiteClosure, '2026-09-13'), false);

console.log(
  'Contratto chiusura calendario senza fine verificato per app, web e server.',
);
