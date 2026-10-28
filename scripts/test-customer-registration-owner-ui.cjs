const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('app/(tabs)/clienti.tsx', 'utf8');
const ast = ts.createSourceFile('clienti.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map();
function walk(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
    const first = node.initializer.arguments[0];
    if (first && ts.isArrowFunction(first)) callbacks.set(node.name.text, first.getText(ast));
  }
  ts.forEachChild(node, walk);
}
walk(ast);
const environment = {
  registrationDecisionsRef: { current: new Set() }, decisions: {}, calls: [], feedback: [],
  setRegistrationDecisions(update) { this.decisions = update(this.decisions); },
  openCustomerFeedbackDialog(value) { this.feedback.push(value); },
  decideCustomerRegistration: undefined,
  Keyboard: { dismiss() {} }, confirmation: null,
  showSwipeConfirmation(title, message, buttons) { this.confirmation = { title, message, buttons }; },
  normalizeCustomerBookingAcceptanceMode: value => value || 'inherit',
  normalizeCustomerOnlineServiceOverrides: value => value || {},
  clienti: [], registrationFilter: 'all', ricerca: '', clientiFiltrati: [],
  Error,
};
for (const name of ['setRegistrationDecisions','openCustomerFeedbackDialog','showSwipeConfirmation']) environment[name] = environment[name].bind(environment);
const context = vm.createContext(environment);
function actualCallback(name) {
  assert.ok(callbacks.has(name), `${name} callback exists in actual owner screen`);
  const code = ts.transpileModule(`(${callbacks.get(name)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInContext(code, context);
}
const mapClients = actualCallback('mapLocalClientsToScreen');
const rawClients = [
  { id: 'pending-read', nome: 'Zeta Prova', telefono: '3331234567', registrationStatus: 'pending', viewedBySalon: true },
  { id: 'pending-unread', nome: 'Beta Prova', telefono: '3331234568', registrationStatus: 'pending', viewedBySalon: false },
  { id: 'approved-read', nome: 'Alfa Prova', telefono: '3331234569', registrationStatus: 'approved', viewedBySalon: true },
  { id: 'approved-unread', nome: 'Gamma Prova', telefono: '3331234570', registrationStatus: 'approved', viewedBySalon: false },
];
environment.clienti = mapClients(rawClients, 'salon-test');
assert.equal(environment.clienti[0].registrationStatus, 'pending', 'registration status survives owner mapping');
assert.equal(actualCallback('pendingRegistrationCount')(), 2, 'pending count independent of read state');
environment.clientiFiltrati = actualCallback('clientiFiltrati')();
const sections = actualCallback('clientiSections')();
assert.equal(sections[0].key, 'pending', 'pending section first');
assert.deepEqual(Array.from(sections[0].items, item => item.id), ['pending-unread', 'pending-read']);
assert.equal(sections.flatMap(section => section.items).length, 4, 'no duplicated customer cards across sections');
environment.registrationFilter = 'pending';
environment.ricerca = 'zeta';
assert.deepEqual(Array.from(actualCallback('clientiFiltrati')(), item => item.id), ['pending-read'], 'search and pending filter combine');
environment.ricerca = 'alfa';
assert.equal(actualCallback('clientiFiltrati')().length, 0, 'approved customer excluded from pending search');

(async () => {
  let complete;
  environment.decideCustomerRegistration = (id, decision) => {
    environment.calls.push({ id, decision });
    return new Promise(resolve => { complete = resolve; });
  };
  const decide = actualCallback('performRegistrationDecision');
  environment.performRegistrationDecision = decide;
  const item = environment.clienti[0];
  const pendingCall = decide(item, 'approved');
  await decide(item, 'approved');
  await decide(item, 'rejected');
  assert.equal(environment.calls.length, 1, 'duplicate and conflicting taps blocked while request running');
  assert.equal(environment.decisions[item.id], 'approved', 'progress follows actual operation');
  complete({ ok: false, detail: 'Server non disponibile' });
  await pendingCall;
  assert.equal(environment.feedback[0].message, 'Server non disponibile', 'server failure shown honestly');
  assert.equal(environment.registrationDecisionsRef.current.size, 0, 'retry unlocked after failure');
  assert.equal(Object.keys(environment.decisions).length, 0, 'spinner cleared after failure');
  const beforeRejection = environment.calls.length;
  let rejectionCall;
  environment.performRegistrationDecision = (...args) => {
    rejectionCall = decide(...args);
    return rejectionCall;
  };
  actualCallback('requestRegistrationRejection')(item);
  assert.equal(environment.calls.length, beforeRejection, 'opening rejection confirmation causes no mutation');
  assert.equal(environment.confirmation.buttons[0].style, 'cancel');
  const reject = environment.confirmation.buttons.find(button => button.text === 'Rifiuta');
  reject.onPress();
  assert.equal(environment.calls.length, beforeRejection + 1, 'only confirmation sends rejection');
  assert.equal(environment.calls.at(-1).decision, 'rejected');
  complete({ ok: true });
  await rejectionCall;
  assert.equal(environment.registrationDecisionsRef.current.size, 0, 'busy cleared after confirmed rejection');
  console.log('Owner registration UI runtime checks passed: status mapping, pending/read independence, ordering, search/filter, duplicate suppression, error handling and rejection confirmation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
