/* global __dirname */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const agendaPath = path.join(root, 'app', '(tabs)', 'agenda.tsx');
const agendaSource = fs.readFileSync(agendaPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(
  /showPendingRequestVisual \|\|\s*appointment\.syntheticRequestStatus === 'In attesa'[\s\S]{0,420}?bg: '#FFF4DD',[\s\S]{0,120}?border: '#DDB879',[\s\S]{0,120}?text: '#8A5A18',[\s\S]{0,120}?shadow: '#D6B06A'/.test(
    agendaSource,
  ),
  'Le sole richieste Agenda in attesa devono usare la palette gialla condivisa.',
);

assert(
  /const customerColor = getAgendaCustomerIdentityColor\(appointment\);\s*return \{\s*bg: blendServiceAccentWithWhite\(customerColor, 0\.7\),\s*border: blendServiceAccentWithWhite\(customerColor, 0\.18\),\s*text: '#172033',\s*shadow: customerColor/.test(
    agendaSource,
  ),
  'Gli appuntamenti non pending devono conservare il colore cliente esistente.',
);

assert(
  /weekPendingRequestBadge: \{[\s\S]{0,260}?backgroundColor: '#FF4D57'/.test(
    agendaSource,
  ),
  'Il badge +N delle richieste deve restare rosso e separato dalla card gialla.',
);

const toneCallCount = (
  agendaSource.match(/getWeekAppointmentTone\(/g) ?? []
).length;
assert(
  toneCallCount >= 9,
  'Tutte le rese Agenda e le anteprime devono continuare a usare il tono centralizzato.',
);

assert(
  /const AGENDA_DENSITY_OPTIONS:[\s\S]{0,220}?scale: 0\.58/.test(
    agendaSource,
  ),
  'La densita 58% deve restare coperta dalla stessa resa Agenda.',
);

console.log('Agenda pending tone contracts: OK');
