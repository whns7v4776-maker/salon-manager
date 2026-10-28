const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cash-summary.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:exportsObject, Intl});
const {summarizeCash, summarizeCashActivity, isLegacyAutoCashout, formatCash} = exportsObject;
const entries = [
 {id:'1',descrizione:'Contanti',importo:10,metodo:'Contanti'},
 {id:'2',descrizione:'Stripe',importo:20,metodo:'Carta'},
 {id:'3',descrizione:'Da saldare',importo:30},
 {id:'4',descrizione:'Incasso automatico fine giornata · Taglio',importo:40,metodo:'Contanti'},
 {id:'auto-cashout-x-2026-09-25',descrizione:'Storico',importo:50,metodo:'Contanti'},
 {id:'5',descrizione:'Bonifico',importo:15,metodo:'Bonifico'}
];
const before = JSON.stringify(entries);
assert.deepEqual(JSON.parse(JSON.stringify(summarizeCash(entries))), {confirmed:45,card:20,cash:10,pending:30,legacy:90});
assert.equal(JSON.stringify(entries),before,'Historical records must not be rewritten');
assert.equal(isLegacyAutoCashout(entries[3]),true);
assert.equal(isLegacyAutoCashout(entries[1]),false);
assert.match(formatCash(6562.5),/6\.562,50/);
assert.equal(summarizeCash([]).confirmed,0);
const activity = summarizeCashActivity(entries);
assert.equal(activity.confirmedCount,3,'Only confirmed movements count as collections, including bank transfers');
assert.equal(activity.averageConfirmed,15,'Pending and automatic historical entries must not dilute the average');
const observedLedger = [
 {id:'confirmed-1',descrizione:'Contanti',importo:50,metodo:'Contanti'},
 {id:'confirmed-2',descrizione:'Contanti',importo:11,metodo:'Contanti'},
 {id:'confirmed-3',descrizione:'Contanti',importo:25,metodo:'Contanti'},
 {id:'pending-1',descrizione:'Saldo',importo:85,metodo:null},
 {id:'history',descrizione:'Incasso automatico fine giornata · Storico',importo:9141,metodo:'Contanti'},
];
const observedBefore = JSON.stringify(observedLedger);
const observed = summarizeCashActivity(observedLedger);
assert.equal(observed.confirmed,86);
assert.equal(observed.pending,85);
assert.equal(observed.legacy,9141);
assert.equal(observed.confirmedCount,3);
assert.equal(observed.averageConfirmed,86/3);
assert.equal(observed.confirmed+observed.pending+observed.legacy,9312,'All retained ledger amounts remain represented in separate categories');
assert.equal(JSON.stringify(observedLedger),observedBefore,'Dashboard summaries must preserve every movement');
assert.equal(summarizeCashActivity([]).averageConfirmed,0);
assert.equal(summarizeCashActivity(entries.slice(2,5)).confirmedCount,0);
assert.equal(summarizeCashActivity(entries.slice(2,5)).averageConfirmed,0);
assert.ok(!fs.readFileSync('src/context/AppContext.tsx','utf8').includes('const processEndOfDayCashout ='));
console.log('PASS: confirmed, pending, legacy separation, confirmed average, transfers, currency and historical preservation.');
