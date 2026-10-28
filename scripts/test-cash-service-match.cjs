const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('tsx/cjs');
const { lowerItalian } = require('../src/lib/italian-case.ts');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/cash-service-match.ts'), 'utf8');
const sandbox = { exports: {}, normalizations: 0, require: moduleName => {
  assert.equal(moduleName, './italian-case');
  return { lowerItalian: value => { sandbox.normalizations++; return lowerItalian(value); } };
} };
vm.createContext(sandbox);
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { createCashServiceMatcher } = sandbox.exports;
const legacy = (services, title) => {
  const normalize = value => value.trim().toLocaleLowerCase('it').replace(/\s+/g, ' ');
  const matches = services.filter(s => normalize(title) === normalize(s.nome) || normalize(title).startsWith(`${normalize(s.nome)} · `));
  return matches.length === 1 ? matches[0] : undefined;
};

const catalogues = [
  [],
  [{ nome: 'Taglio', id: 'a' }, { nome: 'Barba', id: 'b' }],
  [{ nome: 'Barba', id: 'a' }, { nome: ' BARBA ', id: 'b' }],
  [{ nome: 'Taglio', id: 'a' }, { nome: 'Taglio · shampoo', id: 'b' }],
  [{ nome: '  PÌEGA   Èlite  ', id: 'a' }, { nome: 'İ', id: 'b' }, { nome: '', id: 'c' }],
];
const titles = ['Taglio', ' taglio  ', 'Taglio · Mario', 'Taglio corto', 'Taglio · shampoo', 'Taglio · shampoo · Ada', 'BARBA', 'Barba · Ada', ' Pìega\n ÈLITE · Ada ', 'İ · Ada', '', ' · Ada', 'Sconosciuto'];
let checks = 0;
for (const services of catalogues) {
  const resolve = createCashServiceMatcher(services);
  for (const title of titles) {
    assert.equal(resolve(title), legacy(services, title));
    assert.equal(resolve(title), legacy(services, title), 'Cached results preserve ambiguity');
    checks += 2;
  }
}

const services = Array.from({ length: 100 }, (_, i) => ({ nome: `Servizio ${i}`, id: String(i) }));
sandbox.normalizations = 0;
const resolve = createCashServiceMatcher(services);
assert.equal(sandbox.normalizations, services.length, 'Normalize each catalogue name once');
for (let render = 0; render < 20; render++) {
  for (let row = 0; row < 20; row++) resolve(`Servizio ${row} · Cliente`);
}
assert.equal(sandbox.normalizations, 120, 'Repeated renders do not repeat locale normalization');
const changed = [{ nome: 'Altro', id: '0' }];
assert.equal(createCashServiceMatcher(changed)('Servizio 0 · Cliente'), undefined, 'Rebuilding on catalogue changes invalidates matches');
for (let i = 0; i < 600; i++) resolve(`Storico ${i}`);
assert.equal(resolve('Servizio 1 · Cliente'), services[1], 'Cache eviction preserves matching');
const screen = fs.readFileSync(path.join(__dirname, '../app/cassa-screen.tsx'), 'utf8');
assert.match(screen, /useMemo\(\(\) => createCashServiceMatcher\(servizi\), \[servizi\]\)/);
assert.match(screen, /const service = matchMovementService\(title\)/);
console.log(`Cash matching: ${checks} legacy parity checks, cache invalidation and bounded normalization passed.`);
