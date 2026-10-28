const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),XLSX=require('xlsx-js-style');
function load(path,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>deps[n],Date,Intl});return exports;}
const summary=load('src/lib/cash-summary.ts');
const {buildCashWorkbook,writeCashWorkbook}=load('src/lib/cash-workbook.ts',{'./cash-summary':summary,'xlsx-js-style':XLSX});
const entries=[{id:'1',descrizione:'=SUM(A1)',importo:12.5,metodo:'Contanti'},{id:'2',descrizione:'POS',importo:20,metodo:'Carta'},{id:'3',descrizione:'Stripe',importo:30,metodo:'Carta',cartaLabel:'Stripe'},{id:'4',descrizione:'Bonifico',importo:40,metodo:'Bonifico'},{id:'auto-cashout-5',descrizione:'Storico',importo:100,metodo:'Contanti'},{id:'6',descrizione:'Da saldare',importo:15}];
const wb=buildCashWorkbook(entries,'Tutto lo storico','Salone test',()=>new Date(2026,8,26));
assert.equal(wb.Sheets.Riepilogo.B6.v,102.5);assert.equal(wb.Sheets.Riepilogo.B17.v,100);
assert.equal(wb.Sheets.Movimenti.B5.t,'s');assert.equal(wb.Sheets.Movimenti.B5.f,undefined);
const parsed=XLSX.read(writeCashWorkbook(wb),{type:'base64',cellStyles:true});
assert.equal(parsed.SheetNames.length,3);assert.equal(parsed.Sheets.Riepilogo.B6.v,102.5);assert.equal(parsed.Sheets.Movimenti.C5.t,'n');
assert.ok(parsed.Sheets.Movimenti['!autofilter']);assert.ok(parsed.Sheets.Riepilogo.A1.s);
assert.equal(buildCashWorkbook([],'Oggi','Test',()=>null).Sheets.Riepilogo.B6.v,0);
console.log('PASS: styled XLSX round trip, totals, payment methods, history, numeric amounts, formula safety, empty report.');
