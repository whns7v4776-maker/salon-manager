const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agenda = fs.readFileSync(path.join(root, 'app/(tabs)/agenda.tsx'), 'utf8');
const context = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const modal = fs.readFileSync(
  path.join(root, 'components/appointment-impact-modal.tsx'),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

requirePattern(
  agenda,
  /availabilityImpactOperationRef\.current = true;[\s\S]*?setAvailabilityImpactAction\(null\);[\s\S]*?Promise\.allSettled/,
  'Impact actions must close immediately and settle every selected cancellation.',
);
requirePattern(
  agenda,
  /waitForServerPersistence: true/g,
  'Impact actions must wait only for authoritative availability persistence.',
);
requirePattern(
  context,
  /waitForServerPersistence[\s\S]*?await remotePersistTask;/,
  'Server persistence must be separable from portal and snapshot publication.',
);
requirePattern(
  context,
  /Accodamento push annullamento appuntamento non riuscito/,
  'Cancellation push queueing must run through the protected background path.',
);
requirePattern(
  modal,
  /onKeepAppointments\(\)[\s\S]*?onCancelAppointments\(selectedKeys\)[\s\S]*?onCancelAppointments\(allKeys\)/,
  'Keep, cancel selected, and cancel all must stay wired to the shared guarded action.',
);

console.log('Availability impact action contracts passed.');
