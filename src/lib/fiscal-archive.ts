export type FiscalReceipt = {
 id:string; created_at:string; status:string; document_number?:string; provider_id?:string;
 payment_status?:string; email_status?:string; email_id?:string; refund_status?:string;
 void_status?:string; void_number?:string; void_email_status?:string;
 archived_at?:string; void_archived_at?:string;
};
export const fiscalEmailLabel = (state?:string) => ({not_sent:'Non inviata',sending:'Invio in corso',accepted:'Affidata al servizio email',delivered:'Consegnata',failed:'Non consegnata',uncertain:'Esito da verificare'}[state || ''] || 'Non inviata');
export const fiscalDocumentLabel = (r:FiscalReceipt) => r.payment_status==='failed'?'Pagamento rifiutato · nessun documento':r.void_status==='ready'?'Annullata':r.status==='ready'?'Emessa · collaudo':['failed','uncertain'].includes(r.status)?'Da verificare':'In elaborazione';
export function fiscalSummary(rows:FiscalReceipt[]) {
 const issued=rows.filter(r=>r.status==='ready');
 return {total:rows.length,issued:issued.length,cancelled:issued.filter(r=>r.void_status==='ready').length,
  delivered:issued.filter(r=>r.email_status==='delivered').length,
  archived:issued.filter(r=>r.archived_at).length,
  attention:rows.filter(r=>(r.payment_status!=='failed'&&['uncertain','failed'].includes(r.status))||['uncertain','failed'].includes(r.email_status||'')||['uncertain','failed'].includes(r.void_status||'')||['uncertain','failed'].includes(r.void_email_status||'')).length,
  declined:rows.filter(r=>r.payment_status==='failed').length};
}
