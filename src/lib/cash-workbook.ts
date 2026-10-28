import type { CashComparison, StripeReport } from './cash-pdf';
import * as XLSX from 'xlsx-js-style';
import { isLegacyAutoCashout, summarizeCash } from './cash-summary';
type Entry = { id: string; descrizione: string; importo: number; metodo?: string | null; cartaLabel?: string };
const ink = '20364D', muted = '526781', mint = 'EAF7F0', blue = 'EAF1FB';
const currency = '#,##0.00 "€"';
export function buildCashWorkbook(entries: Entry[], period: string, salon: string, dateOf: (entry: Entry) => Date | null | undefined, comparison?: CashComparison, stripe?: StripeReport) {
 const wb = XLSX.utils.book_new();
 const sum = summarizeCash(entries);
 const confirmed = entries.filter(e => e.metodo && !isLegacyAutoCashout(e));
 const transfer = confirmed.filter(e => e.metodo === 'Bonifico').reduce((s,e) => s+e.importo,0);
 const method = (e: Entry) => e.metodo === 'Carta' ? e.cartaLabel === 'Stripe · Contactless' ? 'Carta · Contactless Stripe' : e.cartaLabel === 'Stripe' ? 'Carta · Stripe' : 'POS esterno' : e.metodo || 'Non assegnato';
 function sheet(name: string, rows: (string | number | Date | null)[][], widths: number[], headerRows: number[], moneyCols: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(wch => ({wch}));
  ws['!rows'] = rows.map((_,r) => ({hpt: r === 0 ? 34 : headerRows.includes(r) ? 27 : 30}));
  rows.forEach((row,r) => row.forEach((value,c) => {
   const key = XLSX.utils.encode_cell({r,c}); const cell = ws[key]; if (!cell) return;
   cell.s = {font:{name:'Calibri',sz:11,color:{rgb:ink}},fill:{fgColor:{rgb:r%2?'F7F9FC':'FFFFFF'}},alignment:{vertical:'center',wrapText:true},border:{bottom:{style:'hair',color:{rgb:'E4EAF1'}}}};
   if (typeof value === 'number' && moneyCols.includes(c)) cell.z = currency;
   if (value instanceof Date) cell.z = 'dd/mm/yyyy';
   if (headerRows.includes(r) || r === 0) cell.s = {font:{name:'Calibri',sz:r===0?20:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:ink}},alignment:{vertical:'center',wrapText:true}};
  }));
  XLSX.utils.book_append_sheet(wb, ws, name); return ws;
 }
 const summaryRows = [
  ['SALONPRO · REPORT CASSA',null,null,null], [salon,period,null,null], ['Esportato il',new Date().toLocaleString('it-IT'),null,null], [],
  ['INCASSI CONFERMATI','IMPORTO EUR','NUMERO','INCASSO MEDIO EUR'],
  ['Pagamenti registrati',sum.confirmed,confirmed.length,confirmed.length?sum.confirmed/confirmed.length:0], [],
  ['METODO DI PAGAMENTO','IMPORTO EUR','OPERAZIONI','QUOTA'],
  ...['Contanti','POS esterno','Carta · Stripe','Bonifico'].map(label => {const es=confirmed.filter(e=>method(e)===label);const n=es.reduce((a,e)=>a+e.importo,0);return [label,n,es.length,sum.confirmed?n/sum.confirmed:0];}),
  ['Totale confermato',sum.confirmed,confirmed.length, sum.confirmed?1:0], [],
  ['DA GESTIRE','IMPORTO EUR','MOVIMENTI',null],
  ['Da saldare',sum.pending,entries.filter(e=>!e.metodo&&!isLegacyAutoCashout(e)).length,null],
  ['Storico da verificare',sum.legacy,entries.filter(isLegacyAutoCashout).length,null], [],
  ['NOTE PER LA CONTABILITÀ',null,null,null],
  ['Lo storico da verificare e le somme da saldare sono esclusi dagli incassi confermati.',null,null,null],
  ['I valori riportano gli importi registrati in Cassa. Commissioni Stripe, rimborsi, accrediti bancari e IVA non sono riconciliati in questo report.',null,null,null],
  ['Report gestionale: non sostituisce fatture, corrispettivi o documenti fiscali. Verificare gli importi con i documenti originali.',null,null,null],
 ];
 const summary=sheet('Riepilogo',summaryRows,[43,27,20,26],[4,7,14,18],[1,3]);
 summary['!merges']=[0,1,18,19,20,21].filter(r=>r!==1).map(r=>({s:{r,c:0},e:{r,c:3}}));
 for(let r=8;r<=12;r++){const c=summary[`D${r+1}`];if(c)c.z='0.0%';}
 for(const r of [5,15,16]) for(let c=0;c<4;c++){const cell=summary[XLSX.utils.encode_cell({r,c})];if(cell)cell.s={...cell.s,fill:{fgColor:{rgb:r===5?mint:blue}},font:{name:'Calibri',sz:r===5?16:12,bold:true,color:{rgb:ink}}};}
 summary['!rows']![19]={hpt:32};summary['!rows']![20]={hpt:44};summary['!rows']![21]={hpt:44};
 const daily = new Map<string,{date:Date|null;count:number;cash:number;pos:number;stripe:number;transfer:number;total:number}>();
 confirmed.forEach(e=>{const date=dateOf(e);const key=date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:'Senza data';const row=daily.get(key)||{date:date??null,count:0,cash:0,pos:0,stripe:0,transfer:0,total:0};row.count++;row.total+=e.importo;if(e.metodo==='Contanti')row.cash+=e.importo;else if(e.metodo==='Bonifico')row.transfer+=e.importo;else if(e.cartaLabel==='Stripe'||e.cartaLabel==='Stripe · Contactless')row.stripe+=e.importo;else row.pos+=e.importo;daily.set(key,row);});
 const stats=sheet('Statistiche',[
 ['INCASSI GIORNALIERI',null,null,null,null,null,null], [salon,period],[],
 ['Giorno','Incassi','Contanti','POS esterno','Stripe','Bonifici','Totale EUR'],
 ...[...daily.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([,r])=>[r.date??'Data non disponibile',r.count,r.cash,r.pos,r.stripe,r.transfer,r.total]),
 ['Totale',confirmed.length,sum.cash,confirmed.filter(e=>method(e)==='POS esterno').reduce((a,e)=>a+e.importo,0),confirmed.filter(e=>method(e)==='Carta · Stripe').reduce((a,e)=>a+e.importo,0),transfer,sum.confirmed]
 ],[25,13,20,20,20,20,23],[3],[2,3,4,5,6]);
 stats['!merges']=[{s:{r:0,c:0},e:{r:0,c:6}}];
 const sorted=[...entries].sort((a,b)=>(dateOf(b)?.getTime()??0)-(dateOf(a)?.getTime()??0));
 const details=sheet('Movimenti',[
 ['DETTAGLIO MOVIMENTI',null,null,null,null,null], [salon,period], [],
 ['Data','Descrizione / cliente','Importo EUR','Metodo','Stato','Identificativo'],
 ...sorted.map(e=>[dateOf(e)??'Data non disponibile',e.descrizione,e.importo,method(e),isLegacyAutoCashout(e)?'Da verificare':e.metodo?'Confermato':'Da saldare',e.id])
 ],[20,75,20,22,22,40],[3],[2]);
 details['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}}];
 details['!autofilter']={ref:`A4:F${Math.max(4,sorted.length+4)}`};
 for(let r=4;r<sorted.length+4;r++){details['!rows']![r]={hpt:42};const cell=details[`E${r+1}`];cell.s={...cell.s,fill:{fgColor:{rgb:cell.v==='Confermato'?mint:cell.v==='Da verificare'?'FFF3DD':blue}},font:{name:'Calibri',sz:11,color:{rgb:muted},bold:true}};}
 if(comparison) sheet('Confronto',[
  ['CONFRONTO PERIODI',null],['Periodo attuale',period],['Periodo precedente',comparison.label],[],
  ['Indicatore','Importo EUR'],['Incassi attuali',sum.confirmed],['Incassi precedenti',comparison.previousTotal],['Variazione assoluta',sum.confirmed-comparison.previousTotal],['Variazione percentuale',comparison.previousTotal?(sum.confirmed-comparison.previousTotal)/comparison.previousTotal:'Non disponibile (base zero)']
 ],[45,38],[4],[1]);
 if(comparison && wb.Sheets.Confronto.B9?.t==='n') wb.Sheets.Confronto.B9.z='0.0%';
 if(stripe){
  sheet('Stripe operazioni',[
   ['ESTRATTO STRIPE',stripe.live?'LIVE':'TEST — nessun incasso reale'],
   ['Intero conto collegato; data di creazione. Le operazioni non si sommano agli incassi Cassa.'],[],
   ['Data','Tipo','Valuta','Lordo','Commissioni','Netto','ID operazione','ID origine'],
   ...stripe.transactions.map(t=>[new Date(t.created*1000),t.type,t.currency.toUpperCase(),t.amount/100,t.fee/100,t.net/100,t.id,t.source])
  ],[20,25,12,20,20,20,38,38],[3],[]);
  sheet('Stripe accrediti',[
   ['ACCREDITI STRIPE',stripe.live?'LIVE':'TEST — nessun incasso reale'],
   ['Arrivo previsto da Stripe. Verificare con la banca; non sono ricavi aggiuntivi.'],[],
   ['Creato il','Arrivo previsto','Valuta','Importo','Stato','ID'],
   ...stripe.payouts.map(p=>[new Date(p.created*1000),new Date(p.arrival*1000),p.currency.toUpperCase(),p.amount/100,p.status,p.id])
  ],[20,20,12,20,20,40],[3],[]);
  for(const name of ['Stripe operazioni','Stripe accrediti']){const ws=wb.Sheets[name];ws['!merges']=[{s:{r:1,c:0},e:{r:1,c:5}}];ws['!rows']![1]={hpt:40};for(const address of Object.keys(ws)){if(!address.startsWith('!')&&ws[address].t==='n'&&!ws[address].z)ws[address].z='#,##0.00';}}
 }
 return wb;
}
export function writeCashWorkbook(workbook: XLSX.WorkBook): string { return XLSX.write(workbook,{bookType:'xlsx',type:'base64',cellStyles:true}); }
