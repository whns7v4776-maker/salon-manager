const assert = require('node:assert/strict');
require('tsx/cjs');
const ordinaryPath = require.resolve('../src/lib/italian-case.ts');
const ordinary = require(ordinaryPath);
const android = require('../src/lib/italian-case.android.ts');
const samples = [
  ...Array.from({ length: 0x530 }, (_, i) => String.fromCodePoint(i)),
  'MÀRZIO D’ANGELO', 'Anna Maria De Luca', 'ANNA-MARIA', 'GIULIO CRISTALDI',
  'ÉMILIE', 'Iİıi', 'ΣΟΣ Σίσυφος', 'straße', 'BARBER / HAIR STYLIST',
  'Taglio SENZA SHAMPOO', 'CLIENTE@EXAMPLE.INVALID', '👩🏽‍🦱 À É Ì Ò Ù',
];
for (const value of samples) {
  assert.equal(android.lowerItalian(value), ordinary.lowerItalian(value));
  assert.equal(android.upperItalian(value), ordinary.upperItalian(value));
}
const modules = ['customer-name', 'frequent-customers', 'home-operator-identity', 'cash-service-match', 'service-client-highlight-tone'];
const load = () => Object.fromEntries(modules.map(name => {
  const modulePath = require.resolve(`../src/lib/${name}.ts`);
  delete require.cache[modulePath];
  return [name, require(modulePath)];
}));
const normal = load();
require.cache[ordinaryPath].exports = android;
const optimized = load();
for (const value of samples) {
  for (const method of ['formatCustomerFullNameValue', 'formatCustomerNamePart', 'formatLeadingCapitalizedValue', 'splitCustomerFullNameValue'])
    assert.deepEqual(optimized['customer-name'][method](value), normal['customer-name'][method](value));
}
const customers = [{ id: 'a', nome: 'Ànna De Luca' }, { id: 'b', nome: 'Giulio', email: 'B@EXAMPLE.INVALID' }];
const appointments = [{ cliente: ' ÀNNA  DE LUCA ' }, { customerEmail: 'b@example.invalid' }, { customerEmail: 'B@example.invalid' }];
assert.deepEqual(optimized['frequent-customers'].sortCustomersByAppointmentFrequency(customers, appointments),
  normal['frequent-customers'].sortCustomersByAppointmentFrequency(customers, appointments));
for (const appointment of [{ operatoreNome: ' ÉDOARDO ' }, { operatoreId: 'different', operatoreNome: 'Édoardo' }]) {
  const operator = { id: 'edo', nome: 'Édoardo' };
  assert.equal(optimized['home-operator-identity'].isSameOperatorIdentity(appointment, operator),
    normal['home-operator-identity'].isSameOperatorIdentity(appointment, operator));
}
const catalogue = [{ nome: 'Piega' }, { nome: 'Colore · Piega' }, { nome: 'PIEGA' }, { nome: 'Taglio À' }];
const matchNormal = normal['cash-service-match'].createCashServiceMatcher(catalogue);
const matchAndroid = optimized['cash-service-match'].createCashServiceMatcher(catalogue);
for (const title of ['PIEGA', 'Colore · Piega · Cliente', ' Taglio à ', 'Nessun servizio'])
  assert.deepEqual(matchAndroid(title), matchNormal(title));
for (const title of ['NOVITÀ', 'PIÙ SCELTO', 'Consigliato', 'Sconto speciale', 'SOLO OGGI'])
  assert.deepEqual(optimized['service-client-highlight-tone'].resolveServiceClientHighlightTone(title),
    normal['service-client-highlight-tone'].resolveServiceClientHighlightTone(title));
console.log('Android Italian casing: Unicode/name formatting, customer ordering and operator identity parity passed.');
