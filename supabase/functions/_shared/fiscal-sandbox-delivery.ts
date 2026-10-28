import { archivedFiscalPdf } from './fiscal-archive.ts';
import { createAcubeSandboxClient } from './acube-receipts.ts';
const checked = (r: any) => { if (r.error) throw Error('database'); return r.data; };
export const fiscalTester = 'd84f3211-d20f-45a3-9d7f-f551400690fd';

/** Only simulated documents and the tester mailbox are permitted by this adapter. */
export async function advanceSandboxReceipt(db: any, client: ReturnType<typeof createAcubeSandboxClient>, row: any, sendEmail: boolean) {
 if (row.workspace_id !== fiscalTester) throw Error('workspace');
 if (row.provider_id && !['ready', 'failed'].includes(row.status)) {
  const result = await client.read(row.provider_id);
  if (result.fiscal_id !== '99926092711' || Math.round(Number(result.total_amount) * 100) !== 2550) throw Error('mismatch');
  row = checked(await db.from('cash_fiscal_sandbox').update({ status: result.status, document_number: result.document_number }).eq('id', row.id).select().single());
 }
 if (row.status === 'ready' && !row.archived_at) await archivedFiscalPdf(db,client,row);
 if (row.void_status === 'ready' && !row.void_archived_at) await archivedFiscalPdf(db,client,row,true);
 row=await deliverPdf(db,client,row,sendEmail,false);
 if(row.void_status==='ready') row=await deliverPdf(db,client,row,sendEmail,true);
 return row;
}
async function deliverPdf(db:any, client:ReturnType<typeof createAcubeSandboxClient>, row:any, sendEmail:boolean, isVoid:boolean) {
 const stateField=isVoid?'void_email_status':'email_status',idField=isVoid?'void_email_id':'email_id';
 const ready=isVoid?row.void_status==='ready':row.status==='ready';
 const key = Deno.env.get('RESEND_API_KEY');
 const from = Deno.env.get('EMAIL_FROM') || Deno.env.get('RESEND_FROM');
 if (ready && sendEmail && row[stateField] === 'not_sent') {
  if (!key || !from) throw Error('email_not_configured');
  // Download before claiming: read failures are safe to retry, transmission failures are not.
  const pdf = await archivedFiscalPdf(db,client,row,isVoid);
  let binary = ''; for (const b of pdf) binary += String.fromCharCode(b);
  const claimed = checked(await db.from('cash_fiscal_sandbox').update({ [stateField]: 'sending' }).eq('id', row.id).eq(stateField, 'not_sent').select());
  if (claimed.length) {
   try {
    const response = await fetch('https://api.resend.com/emails', {
     method: 'POST', signal: AbortSignal.timeout(15000),
     headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `fiscal-sandbox/${row.id}${isVoid?'/void':''}` },
     body: JSON.stringify({ from, to: ['salon.pro.app13@gmail.com'], subject: isVoid?'SalonPro · annullamento di COLLAUDO, non fiscale':'SalonPro · ricevuta di COLLAUDO, non fiscale', text: 'Prova del flusso ricevute SalonPro. Questo documento è simulato, non attesta un pagamento e non ha valore fiscale.', attachments: [{ filename: isVoid?'annullamento-collaudo.pdf':'ricevuta-collaudo.pdf', content: btoa(binary) }] }),
    });
    if (!response.ok) throw Error('email');
    const result = await response.json();
    if (!result.id) throw Error('email');
    row = checked(await db.from('cash_fiscal_sandbox').update({ [stateField]: 'accepted', [idField]: result.id }).eq('id', row.id).select().single());
   } catch {
    row = checked(await db.from('cash_fiscal_sandbox').update({ [stateField]: 'uncertain' }).eq('id', row.id).select().single());
   }
  }
 }
 if (key && row[idField] && row[stateField] === 'accepted') {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row[idField])}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  if (response.ok) {
   const result = await response.json();
   const state = ['delivered', 'opened', 'clicked'].includes(result.last_event) ? 'delivered' : ['bounced', 'failed', 'suppressed'].includes(result.last_event) ? 'failed' : null;
   if (state) row = checked(await db.from('cash_fiscal_sandbox').update({ [stateField]: state }).eq('id', row.id).select().single());
  }
 }
 return row;
}
