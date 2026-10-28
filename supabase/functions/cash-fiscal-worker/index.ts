import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { advanceSandboxPayment, advanceSandboxRefund } from '../_shared/fiscal-sandbox-payment.ts';
import { createAcubeSandboxClient } from '../_shared/acube-receipts.ts';
import { advanceSandboxReceipt, fiscalTester } from '../_shared/fiscal-sandbox-delivery.ts';
Deno.serve(async request => {
 const secret = Deno.env.get('CASH_FISCAL_WORKER_SECRET');
 if (request.method !== 'POST' || !secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
 try {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const client = createAcubeSandboxClient(Deno.env.get('ACUBE_SANDBOX_TOKEN') || '');
  const config = await db.from('cash_fiscal_settings').select('settings').eq('workspace_id', fiscalTester).maybeSingle();
  if (config.error) throw Error('database');
  const rows = await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id', fiscalTester).or(config.data?.settings?.autoEmail === true ? 'and(status.eq.ready,archived_at.is.null),and(void_status.eq.ready,void_archived_at.is.null),refund_status.eq.pending,and(void_status.eq.ready,void_email_status.in.(not_sent,accepted)),void_status.in.(new,submitted,retry),status.in.(waiting_payment,new,submitted,retry),and(status.eq.ready,email_status.in.(not_sent,accepted))' : 'and(status.eq.ready,archived_at.is.null),and(void_status.eq.ready,void_archived_at.is.null),refund_status.eq.pending,and(void_status.eq.ready,void_email_status.eq.accepted),void_status.in.(new,submitted,retry),status.in.(waiting_payment,new,submitted,retry),and(status.eq.ready,email_status.eq.accepted)').order('created_at', { ascending: true }).limit(10);
  if (rows.error) throw Error('database');
  let processed = 0, failed = 0;
  for (const row of rows.data || []) {
   try { const current=row.refund_status?await advanceSandboxRefund(db,client,row):row.status==='waiting_payment'?await advanceSandboxPayment(db,client,row):row; await advanceSandboxReceipt(db, client, current, config.data?.settings?.autoEmail === true); processed++; }
   catch { failed++; }
  }
  return Response.json({ processed, failed });
 } catch { return Response.json({ error: 'Collaudo da verificare o accesso A-Cube scaduto.' }, { status: 503 }); }
});
