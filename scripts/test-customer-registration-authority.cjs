const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { normalizeAvailabilitySettings } = require('../src/lib/booking.ts');

const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const ast = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actualFunction(name, dependencies) {
  let initializer;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) initializer = node.initializer;
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(initializer, `${name} must exist in the actual provider`);
  const code = ts.transpileModule(`(${initializer.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, dependencies);
}

const projectAdmission = actualFunction('applyAuthoritativeClientRegistrationState', {
  // Isolate admission reconciliation from the existing, separately tested
  // customer identity/field normalizer; unrelated fields must remain intact.
  normalizeClienti: items => items,
  matchesCustomerIdentity: (left, right) => left.id === right.id,
});
const local = [{ id: 'first', nome: 'Nome modificato', nota: 'Nota locale', registrationStatus: 'approved' },
  { id: 'other', nome: 'Altro cliente', registrationStatus: 'approved' }];
let projected = projectAdmission(local, [{ id: 'first', nome: 'Nome server', registrationStatus: 'pending' }]);
assert.equal(projected[0].registrationStatus, 'pending', 'A stale approved cache must not hide a pending portal registration.');
assert.equal(projected[0].nome, 'Nome modificato');
assert.equal(projected[0].nota, 'Nota locale', 'Admission reconciliation must preserve unrelated unsynced edits.');
assert.equal(projected[1], local[1], 'Other customers are unchanged.');
projected = projectAdmission(projected, [{ id: 'first', registrationStatus: 'approved' }]);
assert.equal(projected[0].registrationStatus, 'approved', 'Confirmed approval must replace cached pending state.');

assert.equal(normalizeAvailabilitySettings({}).customerRegistrationApprovalRequired, false);
assert.equal(normalizeAvailabilitySettings({ customerRegistrationApprovalRequired: 'true' }).customerRegistrationApprovalRequired, false);
assert.equal(normalizeAvailabilitySettings({ customerRegistrationApprovalRequired: true }).customerRegistrationApprovalRequired, true);

// Execute the actual admission part of the provider's settings reconciliation
// with competing server/snapshot/cache values after reload or device change.
const authorityBlock = source.match(/const registrationAuthority = [\s\S]*?\n};/);
assert.ok(authorityBlock, 'Admission authority block must remain testable.');
const resolve = inputs => vm.runInNewContext(`(() => { ${authorityBlock[0].replace(/\n};$/, '\n}')})()`, inputs);
const settings = (required, timestamp) => normalizeAvailabilitySettings({ customerRegistrationApprovalRequired: required, customerRegistrationApprovalUpdatedAt: timestamp });
const remote = settings(false, '2026-10-09T11:00:00Z');
const stale = settings(true, '2026-10-09T10:00:00Z');
const latest = settings(true, '2026-10-09T12:00:00Z');
const fixture = { normalizedRemote: remote, normalizedSnapshot: stale, normalizedLocal: stale,
  remoteIsAuthoritative: false, remoteSettings: remote,
  withCustomServiceContactAuthority: { customServiceContactTitle: 'Titolo conservato', publicSlotMinimumIntervalMinutes: 20 } };
assert.equal(resolve(fixture).customerRegistrationApprovalRequired, false, 'The last server decision survives stale device caches.');
assert.equal(resolve({ ...fixture, normalizedSnapshot: latest }).customerRegistrationApprovalRequired, true);
assert.equal(resolve({ ...fixture, normalizedLocal: latest }).customerRegistrationApprovalRequired, true);
assert.equal(resolve({ ...fixture, normalizedLocal: settings(true, remote.customerRegistrationApprovalUpdatedAt) }).customerRegistrationApprovalRequired, false,
  'The server wins an equal timestamp.');
assert.equal(resolve({ ...fixture, remoteIsAuthoritative: true, normalizedLocal: settings(true, '2099-01-01T00:00:00Z') }).customerRegistrationApprovalRequired, false,
  'A future device clock or unconfirmed optimistic cache cannot override an authoritative server read.');
assert.equal(resolve(fixture).publicSlotMinimumIntervalMinutes, 20, 'Admission must not change booking cadence.');
assert.equal(resolve(fixture).customServiceContactTitle, 'Titolo conservato');
console.log('Customer admission cache authority, default-off and unrelated-setting isolation passed.');
