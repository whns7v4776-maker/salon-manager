const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const ast = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actualFunction(name, dependencies) {
  let initializer;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert(initializer, `Actual provider helper not found: ${name}`);
  return vm.runInNewContext(ts.transpileModule(`(${initializer.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, dependencies);
}

const isUuidValue = actualFunction('isUuidValue', {});
const normalizePhoneForIdentity = actualFunction('normalizePhoneForIdentity', {});
const buildClienteMergeKeyFromIdentity = actualFunction('buildClienteMergeKeyFromIdentity', { normalizePhoneForIdentity });
const buildClienteMergeKeysFromIdentity = actualFunction('buildClienteMergeKeysFromIdentity', { normalizePhoneForIdentity, buildClienteMergeKeyFromIdentity });
const matchesCustomerIdentity = actualFunction('matchesCustomerIdentity', { isUuidValue, buildClienteMergeKeysFromIdentity });
const normalizeClienti = actualFunction('normalizeClienti', {
  // Unrelated booking-rule maps are opaque values for these identity tests.
  normalizeCustomerServiceDurationOverrides: value => value ?? {},
  normalizeCustomerServicePriceOverrides: value => value ?? {},
  normalizeCustomerBookingAcceptanceMode: value => value ?? 'inherit',
  normalizeCustomerOnlineServiceOverrides: value => value ?? {},
});
const buildClienteMergeKey = actualFunction('buildClienteMergeKey', { buildClienteMergeKeyFromIdentity });
const applyAuthoritativeClientServerState = actualFunction('applyAuthoritativeClientServerState', { normalizeClienti, matchesCustomerIdentity });
const applyAuthoritativeClientRegistrationState = actualFunction('applyAuthoritativeClientRegistrationState', { normalizeClienti, matchesCustomerIdentity });

const existing = {
  id: 'f3e0046c-d799-46f7-845b-5de24b9cf284', nome: 'Cliente Dimostrazione',
  telefono: '0000000000', email: '', fonte: 'salone', viewedBySalon: true,
  registrationStatus: 'approved', nota: 'Nota della scheda salone',
  maxFutureAppointments: 6, maxDailyAppointments: 2,
};
const pending = {
  id: '67056754-167d-44b3-b78a-875a1838a837', nome: existing.nome,
  telefono: '3330001000', email: 'client-test@example.invalid', fonte: 'frontend',
  viewedBySalon: false, registrationStatus: 'pending', nota: 'Nota della richiesta',
  maxFutureAppointments: 4, maxDailyAppointments: 3,
};
let cases = 0;
const check = (name, run) => { run(); cases++; };
check('Distinct server customers with the same name stay separate', () => {
  assert.equal(matchesCustomerIdentity(existing, pending), false);
  assert.equal(matchesCustomerIdentity(pending, existing), false);
});
check('Distinct server IDs prevail even when contacts are shared', () => {
  assert.equal(matchesCustomerIdentity(existing, { ...pending, telefono: existing.telefono, email: existing.email }), false);
});
check('The same server ID survives all contact/name edits', () => {
  assert.equal(matchesCustomerIdentity(existing, { ...pending, id: existing.id }), true);
});
check('UUID comparison is case insensitive', () => {
  assert.equal(matchesCustomerIdentity(existing, { ...existing, id: existing.id.toUpperCase() }), true);
});
check('Legacy phone-based cache reconciliation remains available', () => {
  assert.equal(matchesCustomerIdentity(existing, { ...existing, id: 'legacy-client' }), true);
});
check('Legacy email-based cache reconciliation remains available', () => {
  assert.equal(matchesCustomerIdentity(pending, { ...pending, id: 'email:client-test@example.invalid', telefono: '' }), true);
});

for (const platform of ['web', 'ios', 'android']) {
  const dedupeNativeClientiByStableId = actualFunction('dedupeNativeClientiByStableId', { Platform: { OS: platform }, isUuidValue });
  const mergeClientiCollections = actualFunction('mergeClientiCollections', { normalizeClienti, buildClienteMergeKey, dedupeNativeClientiByStableId });
  for (const canonical of [[existing, pending], [pending, existing]]) {
    check(`${platform}: canonical customers repair a snapshot containing the old ID twice`, () => {
      const staleSnapshot = [{ ...existing }, { ...existing }];
      const result = applyAuthoritativeClientServerState(mergeClientiCollections(staleSnapshot, canonical), canonical);
      assert.equal(new Set(result.map(item => item.id)).size, 2);
      const first = result.find(item => item.id === existing.id);
      const second = result.find(item => item.id === pending.id);
      assert(first && second, 'Both server identities must remain visible.');
      for (const field of ['nome', 'telefono', 'email', 'fonte', 'viewedBySalon', 'registrationStatus', 'nota', 'maxFutureAppointments', 'maxDailyAppointments']) {
        assert.equal(first[field], existing[field], `Existing customer ${field}`);
        assert.equal(second[field], pending[field], `Pending customer ${field}`);
      }
      assert.equal(result.filter(item => item.registrationStatus === 'pending').length, 1);
      assert.equal(result.filter(item => item.fonte === 'frontend' && item.viewedBySalon === false).length, 1);
      assert.equal(result.filter(item => matchesCustomerIdentity(item, pending)).length, 1, 'Reading/removing one customer must not select the homonym.');
    });
  }
  check(`${platform}: cached approved status cannot hide the other pending customer`, () => {
    const projected = applyAuthoritativeClientRegistrationState([{ ...existing }, { ...pending, registrationStatus: 'approved' }], [existing, pending]);
    assert.equal(projected[0].registrationStatus, 'approved');
    assert.equal(projected[1].registrationStatus, 'pending');
    assert.equal(projected[0].nota, existing.nota);
    assert.equal(projected[1].nota, pending.nota);
  });
  check(`${platform}: editing one customer cannot project its state onto the homonym`, () => {
    const changed = { ...pending, nome: 'Nome corretto', telefono: '3330002000', email: 'changed@example.invalid', viewedBySalon: true, registrationStatus: 'approved' };
    const projected = applyAuthoritativeClientServerState([existing, pending], [changed]);
    assert.equal(projected[0].id, existing.id);
    assert.equal(projected[0].nome, existing.nome);
    assert.equal(projected[0].telefono, existing.telefono);
    assert.equal(projected[1].id, pending.id);
    assert.equal(projected[1].nome, changed.nome);
  });
}
if (process.env.CUSTOMER_AUTHORITY_FIXTURE) {
  const canonical = JSON.parse(fs.readFileSync(process.env.CUSTOMER_AUTHORITY_FIXTURE, 'utf8'));
  check('Read-only production fixture: every canonical ID survives a stale approved snapshot', () => {
    const stale = canonical.filter(item => item.registrationStatus !== 'pending');
    const dedupeNativeClientiByStableId = actualFunction('dedupeNativeClientiByStableId', { Platform: { OS: 'ios' }, isUuidValue });
    const mergeClientiCollections = actualFunction('mergeClientiCollections', { normalizeClienti, buildClienteMergeKey, dedupeNativeClientiByStableId });
    const result = applyAuthoritativeClientServerState(mergeClientiCollections(stale, canonical), canonical);
    assert.equal(new Set(result.map(item => item.id)).size, canonical.length);
    for (const customer of canonical) {
      const projected = result.find(item => item.id === customer.id);
      assert(projected);
      for (const field of ['nome', 'telefono', 'email', 'fonte', 'viewedBySalon', 'registrationStatus']) {
        assert.equal(projected[field], customer[field] ?? (field === 'email' ? '' : undefined));
      }
    }
    assert.equal(result.filter(item => item.registrationStatus === 'pending').length, canonical.filter(item => item.registrationStatus === 'pending').length);
  });
}
console.log(`${cases} customer homonym authority cases passed (web, iOS, Android; actual provider functions).`);
