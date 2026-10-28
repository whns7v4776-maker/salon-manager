const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
require('tsx/cjs');
const { formatCustomerFullNameValue } = require('../src/lib/customer-name.ts');
const durations = require('../src/lib/customer-service-durations.ts');
const prices = require('../src/lib/customer-service-prices.ts');
const policy = require('../src/lib/customer-online-booking-policy.ts');
const source = fs.readFileSync(path.join(__dirname, '../src/context/AppContext.tsx'), 'utf8');
const ast = ts.createSourceFile('context.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['normalizeClienti', 'normalizePhoneForIdentity', 'buildClienteMergeKeyFromIdentity',
  'buildClienteMergeKey', 'customerRequestKeepsCustomerAlive', 'shouldDeriveFrontendCustomerFromRequest',
  'deriveFrontendCustomersFromRequests'];
const declarations = new Map();
for (const statement of ast.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text))
      declarations.set(declaration.name.text, `const ${declaration.getText(ast)};`);
  }
}
for (const name of names) assert.ok(declarations.has(name), `Missing ${name}`);
function load(legacy) {
  const metrics = { formats: 0 };
  const dependencies = { ...durations, ...prices, ...policy,
    // Fixtures are already normalized. Request normalization is not changed
    // by this optimization; customer normalization is executed from production.
    normalizeRichiestePrenotazione: items => items,
    formatCustomerFullNameValue: value => { metrics.formats++; return formatCustomerFullNameValue(value); },
  };
  let body = names.map(name => declarations.get(name)).join('\n');
  if (legacy) {
    const begin = body.indexOf('    // Existing phone/email identities');
    const end = body.indexOf('    const derivedCustomer =', begin);
    assert.ok(begin >= 0 && end > begin);
    body = body.slice(0, begin) + '    const fullName = formatCustomerFullNameValue(`${request.nome} ${request.cognome}`);\n' + body.slice(end);
  }
  const context = vm.createContext(dependencies);
  vm.runInContext(ts.transpileModule(`${body}\nglobalThis.derive = deriveFrontendCustomersFromRequests;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return { derive: context.derive, metrics };
}
const next = load(false), previous = load(true);
const samples = [
  ['MÀRZIO', "D’ANGELO", '3330000000', 'A@EXAMPLE.INVALID'],
  ['MARZIO', 'VERDI', '3330000000', 'different@example.invalid'],
  ['ANNA-MARIA', 'ROSSI', '', 'a@example.invalid'],
  ['  ÉMILIE ', ' DE LUCA ', '', ''],
  ['', '', '', ''],
  ['nome99', 'nome@example.invalid', '', ''],
  ['Luca', 'Rossi', ' ', ' B@EXAMPLE.INVALID '],
];
const clone = value => JSON.parse(JSON.stringify(value));
let comparisons = 0;
for (let seed = 0; seed < 100; seed++) {
  const requests = Array.from({ length: 90 }, (_, i) => {
    const [nome, cognome, telefono, email] = samples[(seed + i) % samples.length];
    return { id: `r${i}`, nome, cognome, telefono, email, instagram: '',
      stato: ['In attesa', 'Accettata', 'Annullata', 'Rifiutata'][i % 4],
      origine: i % 9 ? 'frontend' : 'salone', viewedBySalon: i % 2 === 0 };
  });
  const customers = seed % 2 ? [{ id: 'c1', nome: 'Salvato', telefono: '333 000 0000', email: 'a@example.invalid', nota: 'Non cambiare', inibito: true }] : [];
  assert.deepEqual(clone(next.derive(customers, requests)), clone(previous.derive(customers, requests)));
  assert.equal(customers[0]?.nota, seed % 2 ? 'Non cambiare' : undefined);
  comparisons++;
}
const requests = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, nome: 'Cliente', cognome: 'Test', telefono: '3330000000', email: 'test@example.invalid', stato: 'Accettata' }));
previous.metrics.formats = 0; next.metrics.formats = 0;
assert.deepEqual(clone(next.derive([], requests)), clone(previous.derive([], requests)));
assert.equal(next.metrics.formats, 1);
assert.equal(previous.metrics.formats, 1000);
console.log(JSON.stringify({ comparisons, parity: 'PASS', formatsFor1000Requests: { before: previous.metrics.formats, after: next.metrics.formats } }));
