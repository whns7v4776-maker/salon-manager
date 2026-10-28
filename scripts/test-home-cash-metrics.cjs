const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const cash = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cash-summary.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: cash, Intl });

const homeSource = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
const homeAst = ts.createSourceFile('home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluateHomeMetric(name, values) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(homeAst) === name) expression = node.initializer?.getText(homeAst);
    ts.forEachChild(node, visit);
  }
  visit(homeAst);
  assert.ok(expression, `Home metric ${name} must exist`);
  const result = {};
  vm.runInNewContext(ts.transpileModule(`exports.value = ${expression};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: result, useMemo: callback => callback(), ...cash, ...values });
  return result.value;
}

const movements = [
  { id: 'cash', descrizione: 'Taglio', importo: 50, metodo: 'Contanti' },
  { id: 'card', descrizione: 'Acconto verificato', importo: 11, metodo: 'Carta' },
  { id: 'transfer', descrizione: 'Saldo verificato', importo: 25, metodo: 'Bonifico' },
  { id: 'pending', descrizione: 'Saldo in attesa', importo: 85, metodo: null },
  { id: 'auto-cashout-old', descrizione: 'Storico', importo: 9141, metodo: 'Contanti' },
];
const before = JSON.stringify(movements);
const cashActivity = evaluateHomeMetric('cashActivity', { movimenti: movements });
assert.equal(evaluateHomeMetric('dashboardTotalIncomeLabel', { cashActivity }), cash.formatCash(86));
assert.equal(evaluateHomeMetric('dashboardPendingCashLabel', { cashActivity }), cash.formatCash(85));
assert.equal(evaluateHomeMetric('dashboardLegacyCashLabel', { cashActivity }), cash.formatCash(9141));
assert.equal(evaluateHomeMetric('mediaScontrino', { cashActivity }), 86 / 3);
assert.equal(JSON.stringify(movements), before, 'Home must never rewrite movements');

const appointments = [
  { prezzo: 30, incassato: false, nonEffettuato: false },
  { prezzo: 100, incassato: false, nonEffettuato: false }, // An acconto does not establish the outstanding balance here.
  { prezzo: 50, incassato: true, nonEffettuato: false },
  { prezzo: 20, incassato: false, nonEffettuato: true },
];
assert.equal(evaluateHomeMetric('dashboardToCollectLabel', { appuntamentiOggi: appointments }), '2');
appointments[1].prezzo = 10000;
assert.equal(evaluateHomeMetric('dashboardToCollectLabel', { appuntamentiOggi: appointments }), '2', 'A service price must not be presented as an outstanding balance');
assert.equal(evaluateHomeMetric('dashboardToCollectLabel', { appuntamentiOggi: [] }), '0');
const emptyActivity = evaluateHomeMetric('cashActivity', { movimenti: [] });
assert.equal(evaluateHomeMetric('dashboardTotalIncomeLabel', { cashActivity: emptyActivity }), cash.formatCash(0));
assert.equal(evaluateHomeMetric('mediaScontrino', { cashActivity: emptyActivity }), 0);
console.log('PASS Home metrics: confirmed/pending/history, confirmed average, unpaid appointment count, empty ledger and movement preservation.');
