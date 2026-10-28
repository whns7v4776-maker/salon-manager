import * as XLSX from 'xlsx-js-style';
import { FiscalReceipt, fiscalDocumentLabel, fiscalEmailLabel, fiscalSummary } from './fiscal-archive';
const C={ink:'20364D',muted:'526781',blue:'EAF1FB',mint:'EAF7F0',amber:'FFF4DD',rose:'FCECEE',line:'E2E8F0'};
const date=(value?:string)=>value?new Date(value):'Non disponibile';
/** A styled management workbook; sandbox amounts are never represented as real revenue. */
export function createFiscalWorkbook(rows:FiscalReceipt[],now=new Date(),scope='Archivio completo') {
 const wb=XLSX.utils.book_new(),stats=fiscalSummary(rows);
 wb.Props={Title:'SalonPro · Archivio ricevute di collaudo',Author:'SalonPro',CreatedDate:now};
 function sheet(name:string,data:unknown[][],widths:number[],sections:number[]=[],money:number[]=[]) {
  const ws=XLSX.utils.aoa_to_sheet(data as any[][],{cellDates:true});
  ws['!cols']=widths.map(wch=>({wch}));ws['!rows']=data.map((_,r)=>({hpt:r===0?38:r===1?32:30}));
  const last=widths.length-1;
  ws['!merges']=[0,1].map(r=>({s:{r,c:0},e:{r,c:last}}));
  for(let r=0;r<data.length;r++) for(let c=0;c<=last;c++) {
   const addr=XLSX.utils.encode_cell({r,c});const cell=ws[addr]||(ws[addr]={t:'s',v:''});
   const dark=r===0||sections.includes(r);
   cell.s={font:{name:'Calibri',sz:r===0?20:11,bold:dark,color:{rgb:dark?'FFFFFF':C.ink}},fill:{fgColor:{rgb:dark?C.ink:r===1?C.blue:r%2?'F7F9FC':'FFFFFF'}},alignment:{vertical:'center',wrapText:true},border:{bottom:{style:'hair',color:{rgb:C.line}}}};
   if(cell.t==='d')cell.z='dd/mm/yyyy hh:mm';
   if(cell.t==='n'&&money.includes(c))cell.z='#,##0.00 "€"';
  }
  XLSX.utils.book_append_sheet(wb,ws,name);return ws;
 }
 const summary=sheet('Panoramica',[
  ['SALONPRO · ARCHIVIO RICEVUTE'],
  ['COLLAUDO GRATUITO · documenti simulati, senza validità fiscale'],
  ['Esportato il',now,'Ambito',scope],[],
  ['DOCUMENTI EMESSI',stats.issued,'ANNULLATI',stats.cancelled],
  ['PDF CONSERVATI',stats.archived,'EMAIL CONSEGNATE',stats.delivered],
  ['DA VERIFICARE',stats.attention,'PAGAMENTI RIFIUTATI',stats.declined],[],
  ['LETTURA DEL REPORT','', '', ''],
  ['Documenti attivi',stats.issued-stats.cancelled,'Emessi e non annullati',''],
  ['Tentativi registrati',stats.total,'Inclusi i tentativi senza documento',''],
  ['Importi di prova','','25,50 € è il valore della richiesta simulata. Il PDF dimostrativo del fornitore può contenere dati di esempio.',''],
  ['Incassi reali','','Questo archivio di collaudo non certifica ricavi, IVA o corrispettivi.',''],[],
  ['GUIDA AI FOGLI','','',''],
  ['Documenti','','Elenco completo, stato e conservazione dei PDF.',''],
  ['Annullamenti','','Originale e annullamento restano separati e consultabili.',''],
  ['Invii email','','“Affidata” non significa “consegnata”. Le prove sono inviate solo alla casella del tester.',''],
  ['Conservazione','','Copie private sul server SalonPro; non è un servizio di conservazione fiscale a norma.',''],
 ],[30,20,40,20],[8,14]);
 for(const r of [4,5,6])for(let c=0;c<4;c++){
  const cell=summary[XLSX.utils.encode_cell({r,c})];cell.s={...cell.s,fill:{fgColor:{rgb:r===4?C.mint:r===5?C.blue:C.amber}},alignment:{vertical:'center',horizontal:c%2?'center':'left',wrapText:true},font:{name:'Calibri',sz:c%2?24:11,bold:true,color:{rgb:C.ink}}};summary['!rows']![r]={hpt:54};
 }
 for(const r of [9,10,11,12,15,16,17,18]){summary['!merges']!.push({s:{r,c:2},e:{r,c:3}});summary['!rows']![r]={hpt:48};}
 const sorted=[...rows].sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const docs=sheet('Documenti',[
  ['REGISTRO DOCUMENTI'],['COLLAUDO · nessun documento fiscale reale'],[],
  ['Creato il','Numero documento','Stato','Richiesta simulata EUR','Pagamento di prova','PDF archiviato il','Invio email','Identificativo'],
  ...sorted.map(r=>[date(r.created_at),r.document_number||'Non emesso',fiscalDocumentLabel(r),r.provider_id?25.5:null,r.payment_status==='succeeded'?'Confermato · TEST':r.payment_status==='failed'?'Rifiutato':r.payment_status?'In verifica':'Solo documento',date(r.archived_at),fiscalEmailLabel(r.email_status),r.id])
 ],[23,28,35,24,26,23,30,39],[3],[3]);
 docs['!autofilter']={ref:`A4:H${Math.max(4,sorted.length+4)}`};
 for(let i=0;i<sorted.length;i++){const cell=docs[`C${i+5}`];cell.s.fill={fgColor:{rgb:sorted[i].void_status==='ready'?C.rose:sorted[i].status==='ready'?C.mint:C.amber}};}
 const voids=sorted.filter(r=>r.void_status||r.refund_status);
 const cancels=sheet('Annullamenti',[
  ['ANNULLAMENTI E RIMBORSI'],['COLLAUDO · gli originali sono conservati'],[],
  ['Creato il','Documento originale','Numero annullamento','Stato annullamento','Rimborso di prova','PDF archiviato il','Email annullamento','Identificativo'],
  ...voids.map(r=>[date(r.created_at),r.document_number||'—',r.void_number||'Non disponibile',r.void_status==='ready'?'Pronto':r.void_status||'Non richiesto',r.refund_status==='succeeded'?'Confermato · TEST':r.refund_status||'Non richiesto',date(r.void_archived_at),fiscalEmailLabel(r.void_email_status),r.id])
 ],[23,28,28,25,25,23,30,39],[3]);cancels['!autofilter']={ref:`A4:H${Math.max(4,voids.length+4)}`};
 const emails=sheet('Invii email',[
  ['MONITORAGGIO INVII'],['Solo tester · consegna al server del destinatario, non conferma di lettura'],[],
  ['Creato il','Documento','Email documento','Annullamento','Email annullamento','Destinatario di prova','Identificativo invio'],
  ...sorted.filter(r=>r.provider_id).map(r=>[date(r.created_at),r.document_number||'In elaborazione',fiscalEmailLabel(r.email_status),r.void_number||'—',r.void_status?fiscalEmailLabel(r.void_email_status):'Non applicabile','salon.pro.app13@gmail.com',r.email_id||'Non disponibile'])
 ],[23,28,30,28,30,34,39],[3]);emails['!autofilter']={ref:`A4:G${Math.max(4,sorted.filter(r=>r.provider_id).length+4)}`};
 return wb;
}
export function writeFiscalWorkbook(rows:FiscalReceipt[],scope='Archivio completo') {return XLSX.write(createFiscalWorkbook(rows,new Date(),scope),{bookType:'xlsx',type:'base64',cellStyles:true});}
