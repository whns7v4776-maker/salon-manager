const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const agendaPath = path.join(root, 'app', '(tabs)', 'agenda.tsx');
const agenda = fs.readFileSync(agendaPath, 'utf8');

const hiddenPastLabelPatterns = [
  /IS_ANDROID\s*&&\s*isPastFreeSlot\s*\?\s*null\s*:/,
  /IS_ANDROID\s*&&\s*\n\s*isPastFreeSlot\s*\?\s*null\s*:/,
];

for (const pattern of hiddenPastLabelPatterns) {
  if (pattern.test(agenda)) {
    throw new Error(
      'Android must render the Past label for free slots crossed by the live cursor.',
    );
  }
}

const pastLabelBranches = agenda.match(/isPastFreeSlot\s*\?\s*'Passato'/g) ?? [];
if (pastLabelBranches.length < 3) {
  throw new Error(
    'Expected the Past label in every Agenda lane rendering branch.',
  );
}

if (!/isCurrentSlotToday\s*\?\s*'In corso'/.test(agenda)) {
  throw new Error('The current live slot must keep the In progress label.');
}

if (
  !agenda.includes('weekPlannerLiveTimeButtonAndroidSalonLane') ||
  !agenda.includes('IS_ANDROID &&\n                        !weekPlannerHasLaneHeaders')
) {
  throw new Error(
    'The compact live-time control must remain scoped to Android salon-only lanes.',
  );
}

console.log('Android Agenda live slot label contracts passed.');
