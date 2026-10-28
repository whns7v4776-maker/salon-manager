const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(p,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>deps[n],Date,Intl});return exports;}
const {cashPeriodRange}=load('src/lib/cash-period.ts');
const r=cashPeriodRange('custom','2026-03-28','2026-03-30');assert.equal(r.days,3);assert.equal(r.previousFrom.getDate(),25);assert.equal(r.until.getDate(),31);assert.equal(cashPeriodRange('all','',''),null);
const summary=load('src/lib/cash-summary.ts');const {buildCashPdf}=load('src/lib/cash-pdf.ts',{'./cash-summary':summary});
const html=buildCashPdf([{id:'a',descrizione:'<script>alert(1)</script>',importo:12,metodo:'Contanti'}],'Oggi','Test',()=>new Date(),{previousTotal:0,label:'Ieri'});
assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Confronto'));assert.ok(html.includes('12,00'));
console.log('PASS: inclusive dates, previous interval, DST, PDF escaping and totals.');

for(const [date,first,days] of [['2026-10-19T12:00:00',19,1],['2026-10-25T12:00:00',19,7],['2026-03-29T12:00:00',23,7]]) {const week=cashPeriodRange('week','','',new Date(date));assert.equal(week.from.getDate(),first);assert.equal(week.days,days);assert.equal(week.until.getDate(),new Date(new Date(date).setDate(new Date(date).getDate()+1)).getDate());assert.equal(week.previousUntil.getTime(),week.from.getTime());}
console.log('PASS: week begins on Monday, inclusive Sunday, DST and previous period.');
