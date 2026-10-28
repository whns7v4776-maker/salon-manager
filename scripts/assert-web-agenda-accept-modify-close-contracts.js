/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agendaSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);

assert.match(
  contextSource,
  /deferOperatorChangePostCommitWork = false/,
  'Native and existing callers must keep the blocking post-commit behavior by default.',
);
assert.match(
  contextSource,
  /const runOperatorChangePostCommitWork = async \(\) => \{[\s\S]*?enqueuePortalPublish\([\s\S]*?flushQueuedPushNotifications\(\)[\s\S]*?if \(deferOperatorChangePostCommitWork\) \{\s*void runOperatorChangePostCommitWork\(\);\s*\} else \{\s*await runOperatorChangePostCommitWork\(\);/,
  'Only an explicit caller may defer publication and push flush after the operator-change server commit.',
);
assert.match(
  agendaSource,
  /deferLocalStateUntilConfirmed: status === 'Rifiutata',\s*deferOperatorChangePostCommitWork: IS_WEB,/,
  'Agenda must defer operator-change post-commit work on web only.',
);
assert.match(
  agendaSource,
  /if \(result\.requiresCustomerConfirmation\) \{[\s\S]{0,100}?restorePendingRequestVisualSnapshot\(\);[\s\S]{0,100}?if \(!IS_WEB\) \{[\s\S]{0,1600}?\(!result\.requiresCustomerConfirmation \|\| IS_WEB\)[\s\S]{0,120}?await completeAcceptedRequestFeedback\(\);/,
  'Web operator-change proposals must show success and close without waiting for the native alert.',
);
assert.match(
  agendaSource,
  /IS_WEB\s*\? 'Accettato e salvato'\s*:\s*'Accettato'/,
  'The successful web action must clearly say Accettato e salvato.',
);
assert.match(
  agendaSource,
  /disabled=\{!IS_WEB && weekPendingAction !== null\}/,
  'The web popup must remain manually closable if an external post-commit task is slow.',
);
assert.match(
  agendaSource,
  /weekAppointmentAwaitingCustomerConfirmation\s*\? 'Proposta salvata e inviata al cliente'\s*:\s*'Appuntamento confermato'/,
  'The web success hint must not claim that a customer-confirmation proposal is already confirmed.',
);

console.log('Web Agenda accept-and-modify close contracts: OK');
