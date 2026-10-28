const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(path, dependencies = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports, require: name => dependencies[name], Intl, Date});
 return exports;
}
const summary = load('src/lib/cash-summary.ts');
const {buildCashReport} = load('src/lib/cash-report.ts', {'./cash-summary':summary});
const entries = [{id:'a',descrizione:'=SUM(A1)',importo:12.5,metodo:'Bonifico'}, {id:'auto-cashout-b',descrizione:'Storico',importo:90,metodo:'Contanti'}, {id:'c',descrizione:'Taglio; "speciale"',importo:20}];
const before = JSON.stringify(entries);
const csv = buildCashReport(entries, 'Tutto lo storico', () => '26/09/2026');
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"Incassi confermati";"12,50"'));
assert.ok(csv.includes('"Bonifici";"12,50"'));
assert.ok(csv.includes('"\'=SUM(A1)"'));
assert.ok(csv.includes('"Taglio; ""speciale"""'));
assert.ok(csv.includes('"Da verificare"'));
assert.equal(JSON.stringify(entries), before);
assert.ok(buildCashReport([], 'Oggi', () => '').includes('"Incasso medio";"0,00"'));
console.log('PASS: CSV totals, historical separation, escaping, formula protection, empty report.');
