import { archivedFiscalPdf } from '../_shared/fiscal-archive.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAcubeSandboxClient } from '../_shared/acube-receipts.ts';
import { advanceSandboxPayment, advanceSandboxRefund, sandboxStripe } from '../_shared/fiscal-sandbox-payment.ts';
import { advanceSandboxReceipt } from '../_shared/fiscal-sandbox-delivery.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const tester = 'd84f3211-d20f-45a3-9d7f-f551400690fd';
const checked = (r: any) => { if (r.error) throw Error('database'); return r.data; };
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response('ok', { headers });
 if (req.method !== 'POST') return reply({ error: 'Operazione non consentita.' }, 405);
 const url = Deno.env.get('SUPABASE_URL')!;
 const owner = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } }, auth: { persistSession: false } });
 const { data: { user }, error } = await owner.auth.getUser();
 if (error || !user) return reply({ error: 'Accedi di nuovo.' }, 401);
 const workspace = await owner.rpc('current_workspace_id');
 const access = await owner.rpc('workspace_access_allowed');
 if (workspace.error || workspace.data !== tester || access.error || !access.data) return reply({ available: false }, 403);
 const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
 try {
  const body = await req.json();
  let client;
  try { client = createAcubeSandboxClient(Deno.env.get('ACUBE_SANDBOX_TOKEN') || ''); } catch { /* expired temporary login */ }
  let accessExpiresAt: string | null = null;
  if (client) { const claims=JSON.parse(atob((Deno.env.get('ACUBE_SANDBOX_TOKEN') || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); accessExpiresAt=new Date(claims.exp*1000).toISOString(); }
  if (body.action === 'status') return reply({ accessExpiresAt, available: true, connected: !!client, paymentTestAvailable: (Deno.env.get('CASH_STRIPE_SANDBOX_KEY') || '').startsWith('sk_test_'), settings: checked(await db.from('cash_fiscal_settings').select('settings').eq('workspace_id', tester).maybeSingle())?.settings || {}, receipts: checked(await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id', tester).order('created_at', { ascending: false }).limit(20)) });
  if (body.action === 'archive') {
   const offset = Number(body.offset ?? 0);
   if (!Number.isSafeInteger(offset) || offset < 0) return reply({error:'Pagina non valida.'},400);
   const result = await db.from('cash_fiscal_sandbox').select('*',{count:'exact'}).eq('workspace_id',tester).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+199);
   return reply({receipts:checked(result),total:result.count});
  }
  if (body.action === 'pdf' || body.action === 'void-pdf') {
   if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id || '')) return reply({error:'Documento non valido.'},400);
   const row = checked(await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id',tester).eq('id',body.id).maybeSingle());
   if (!row) return reply({error:'Documento non trovato.'},404);
   try {
    const bytes=await archivedFiscalPdf(db,client,row,body.action==='void-pdf');
    let binary='';for(const b of bytes) binary+=String.fromCharCode(b);
    return reply({pdf:btoa(binary)});
   } catch { return reply({error:'PDF non ancora archiviato o disponibile. Aggiorna il collegamento di prova e riprova.'},409); }
  }
  if (body.action === 'request-id') return reply({ id: crypto.randomUUID() });
  if (body.action === 'save') {
   const v = body.settings;
   if (!v || !['online','register'].includes(v.method) || typeof v.name !== 'string' || v.name.trim().length < 2 || v.name.length > 120 || !/^\d{11}$/.test(v.vat || '') || typeof v.model !== 'string' || v.model.length > 160) return reply({error:'Controlla ragione sociale, partita IVA (11 cifre) e modello.'},400);
   const settings = {method:v.method,name:v.name.trim(),vat:v.vat,model:v.model.trim(),autoEmail:v.autoEmail===true};
   checked(await db.from('cash_fiscal_settings').upsert({workspace_id:tester,settings,updated_at:new Date().toISOString()}));
   return reply({settings});
  }
  if (!client) return reply({ error: 'Accesso di prova scaduto. Il collegamento A-Cube deve essere rinnovato.' }, 400);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id || '')) return reply({ error: 'Richiesta non valida.' }, 400);
  if (!['create', 'payment-test', 'refund-test', 'void-pdf', 'check', 'pdf', 'email'].includes(body.action)) return reply({ error: 'Operazione non valida.' }, 400);
  let row = checked(await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id', tester).eq('id', body.id).maybeSingle());
  if (body.action === 'payment-test') {
   sandboxStripe();
   if (!row) {
    const account = checked(await db.from('cash_stripe_accounts').select('account_id').eq('workspace_id',tester).eq('livemode',false).maybeSingle());
    if (!account) return reply({error:'Collegamento Stripe di prova non disponibile.'},409);
    const inserted = await db.from('cash_fiscal_sandbox').insert({id:body.id,workspace_id:tester,status:'waiting_payment',payment_status:'pending',payment_scenario:body.scenario==='declined'?'declined':'success',stripe_account:account.account_id}).select().single();
    if (inserted.error) {
     if (inserted.error.code !== '23505') throw Error('database');
     row = checked(await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id',tester).eq('id',body.id).maybeSingle());
     if (!row) return reply({error:'Un collaudo precedente è ancora in corso o da verificare.'},409);
    } else row=inserted.data;
   }
   if (!row.payment_scenario) return reply({error:'Tentativo non valido.'},400);
   row=await advanceSandboxPayment(db,client,row);
   // A-Cube is asynchronous: the worker checks readiness and sends the email.
   // Do not turn a successful payment into an error while details are not ready yet.
   return reply({receipt:row});
  }
  if (body.action === 'create' && !row) {
   // Only the request that wins the unique insert may contact A-Cube.
   const inserted = await db.from('cash_fiscal_sandbox').insert({ id: body.id, workspace_id: tester }).select().single();
   if (inserted.error) {
    if (inserted.error.code !== '23505') throw Error('database');
    const existing = checked(await db.from('cash_fiscal_sandbox').select('*').eq('workspace_id', tester).eq('id', body.id).maybeSingle());
    return existing ? reply({ receipt: existing }) : reply({error:'Un invio precedente è da verificare. Non creare una seconda ricevuta.'},409);
   }
   try {
    const result = await client.submit({ fiscalId: '99926092711', description: 'COLLAUDO SalonPro - servizio simulato', amountCents: 2550, vatCode: '22', method: 'electronic' });
    row = checked(await db.from('cash_fiscal_sandbox').update({ provider_id: result.uuid, status: result.status, document_number: result.document_number }).eq('id', body.id).select().single());
   } catch {
    // Unknown outcomes are retained and never automatically resubmitted.
    checked(await db.from('cash_fiscal_sandbox').update({ status: 'uncertain' }).eq('id', body.id));
    return reply({ error: 'Esito da verificare. Non ripetere la prova: il tentativo è conservato.' }, 409);
   }
  }
  if (!row) return reply({ error: 'Documento non trovato.' }, 404);
  if (body.action === 'refund-test') {
   if(row.payment_status!=='succeeded'||row.status!=='ready')return reply({error:'Attendi la conferma del pagamento e della ricevuta di prova.'},409);
   const claimed=checked(await db.from('cash_fiscal_sandbox').update({refund_status:'pending',refund_requested_at:new Date().toISOString()}).eq('id',row.id).is('refund_status',null).select());
   row=claimed[0]||row;
   row=await advanceSandboxRefund(db,client,row);
   return reply({receipt:row});
  }
  if (body.action === 'check' || body.action === 'email') {
   const config = checked(await db.from('cash_fiscal_settings').select('settings').eq('workspace_id',tester).maybeSingle());
   if (row.refund_status) row=await advanceSandboxRefund(db,client,row);
   if (row.status === 'waiting_payment') row=await advanceSandboxPayment(db,client,row);
   row = await advanceSandboxReceipt(db, client, row, body.action === 'email' || config?.settings?.autoEmail === true);
  }
  return reply({ receipt: row });
 } catch { return reply({ error: 'Servizio di prova non disponibile. Aggiorna lo stato prima di riprovare.' }, 500); }
});
