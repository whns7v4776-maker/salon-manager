/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/owner-request-alert.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(os) {
  const nativeCalls = [];
  const dialogs = [];
  const context = {
    exports: {},
    require: () => ({ Platform: { OS: os }, Alert: { alert: (...args) => nativeCalls.push(args) } }),
    // The page must remain responsive; browser dialogs must never be invoked.
    window: {
      confirm() { throw new Error('Blocking browser confirmation used'); },
      alert() { throw new Error('Blocking browser alert used'); },
    },
  };
  vm.runInNewContext(compiled, context);
  const show = context.exports.createOwnerRequestAlert((dialog) => dialogs.push(dialog));
  return { show, nativeCalls, dialogs, context };
}

for (const action of ['cancel', 'confirm', 'dismiss']) {
  const h = harness('web');
  let mutations = 0;
  let cancellations = 0;
  let dismissals = 0;
  h.show('Rifiuta richiesta', 'Vuoi davvero rifiutare?', [
    { text: 'Annulla', style: 'cancel', onPress: () => cancellations++ },
    { text: 'Rifiuta', style: 'destructive', onPress: () => mutations++ },
  ], { onDismiss: () => dismissals++ });
  assert.equal(mutations, 0, 'Opening a confirmation must never mutate the booking.');
  const dialog = h.dialogs[0];
  assert.equal(dialog.title, 'Rifiuta richiesta');
  assert.equal(dialog.message, 'Vuoi davvero rifiutare?');
  assert.equal(dialog.buttons[1].text, 'Rifiuta');
  if (action === 'cancel') dialog.buttons[0].onPress();
  if (action === 'confirm') dialog.buttons[1].onPress();
  if (action === 'dismiss') dialog.onDismiss();
  // Repeated clicks or a late backdrop event cannot execute a second action.
  dialog.buttons[1].onPress();
  dialog.onDismiss();
  assert.equal(mutations, action === 'confirm' ? 1 : 0);
  assert.equal(cancellations, action === 'cancel' ? 1 : 0);
  assert.equal(dismissals, action === 'dismiss' ? 1 : 0);
  assert.equal(h.nativeCalls.length, 0);
}

const conflict = harness('web');
let forcedAcceptances = 0;
conflict.show('Conflitto orario', 'Operatore occupato.', [
  { text: 'Annulla', style: 'cancel' },
  { text: 'Accetta comunque', style: 'destructive', onPress: () => forcedAcceptances++ },
]);
assert.equal(forcedAcceptances, 0);
conflict.dialogs[0].buttons[1].onPress();
assert.equal(forcedAcceptances, 1);

const notice = harness('web');
notice.show('Aggiornamento non riuscito', 'Riprova.');
assert.equal(notice.dialogs[0].buttons[0].text, 'OK');
notice.dialogs[0].buttons[0].onPress();

for (const os of ['ios', 'android']) {
  const h = harness(os);
  const buttons = [{ text: 'Rifiuta', style: 'destructive', onPress() {} }];
  const options = { cancelable: true };
  h.show('Titolo', 'Messaggio', buttons, options);
  assert.equal(h.nativeCalls.length, 1);
  assert.equal(h.nativeCalls[0][2], buttons);
  assert.equal(h.nativeCalls[0][3], options);
  assert.equal(h.dialogs.length, 0);
}

const server = harness('web');
delete server.context.window;
server.show('Titolo', 'Messaggio');
assert.equal(server.nativeCalls.length, 1);
console.log('Owner request dialogs: nonblocking web actions, cancellation, single execution, conflicts, and native forwarding passed.');
