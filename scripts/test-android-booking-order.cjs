const assert = require('node:assert/strict');
require('tsx/cjs');
const ordinaryPath = require.resolve('../src/lib/default-string-order.ts');
const ordinary = require(ordinaryPath);
const android = require('../src/lib/default-string-order.android.ts');
const values = ['2026-10-07', '2026-10-08', '09:15', '10:00', 'a-1', 'a_1', 'a.1', 'a1', 'a10', 'a2', 'Édoardo', 'edoardo', 'Alex', 'Ålex', 'Ànna', 'Luca', 'ΣΟΣ', '👨🏽', ''];
for (const left of values) for (const right of values)
  assert.equal(Math.sign(android.compareDefaultStrings(left, right)), Math.sign(ordinary.compareDefaultStrings(left, right)));
const bookingPath = require.resolve('../src/lib/booking.ts');
const normal = require(bookingPath);
require.cache[ordinaryPath].exports = android;
delete require.cache[bookingPath];
const optimized = require(bookingPath);
const services = [{ id: 'taglio', nome: 'Taglio', prezzo: 20, durataMinuti: 30, mestiereRichiesto: 'Barber' }];
const operators = [{ id: 'a-1', nome: 'Édoardo', mestiere: 'Barber' }, { id: 'a_1', nome: 'Alex', mestiere: 'Barber' }, { id: 'a2', nome: 'Luca', mestiere: 'Barber' }];
for (let seed = 0; seed < 40; seed++) {
  const appointments = Array.from({ length: 80 }, (_, i) => ({
    id: `id-${(i * 17 + seed) % 80}`, cliente: `Cliente ${i}`, servizio: 'Taglio',
    data: `2026-10-${8 + i % 3}`, ora: `${String(9 + i % 8).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
    durataMinuti: i % 5 ? 30 : 15,
    ...(i % 3 === 0 ? { operatoreId: operators[i % 2].id, operatoreNome: operators[i % 2].nome } : {}),
    ...(i % 13 === 0 ? { operatoreId: 'legacy-missing', operatoreNome: 'Archived' } : {}),
  }));
  for (const preserveExplicitOperatorAssignments of [false, true]) {
    const input = { appointments, services, operators, preserveExplicitOperatorAssignments };
    const before = JSON.stringify(input);
    assert.deepEqual(optimized.assignFallbackOperatorsToAppointments(input), normal.assignFallbackOperatorsToAppointments(input));
    assert.equal(JSON.stringify(input), before, 'Sorting and assignment must not mutate source data');
  }
}
console.log('Android booking order: locale parity and 80 full assignment comparisons passed; explicit operators and source data preserved.');
