import Stripe from 'npm:stripe@18.5.0';
import { createAcubeSandboxClient } from './acube-receipts.ts';
import { fiscalTester } from './fiscal-sandbox-delivery.ts';
const checked = (r: any) => { if (r.error) throw Error('database'); return r.data; };
export function sandboxStripe(key = Deno.env.get('CASH_STRIPE_SANDBOX_KEY') || '') {
 if (!key.startsWith('sk_test_')) throw Error('Stripe sandbox non disponibile. Nessun pagamento reale consentito.');
 return new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0, timeout: 15000 });
}
export function verifySandboxPayment(intent: any, row: any) {
 if (intent.livemode !== false || intent.amount !== 2550 || intent.currency !== 'eur' || intent.metadata?.salonpro_fiscal_test !== row.id || intent.metadata?.workspace !== fiscalTester || (row.stripe_intent && intent.id !== row.stripe_intent)) throw Error('Pagamento di collaudo non corrispondente');
}
/** Stable Stripe idempotency + atomic fiscal claim. No real customer or cash ledger access. */
export async function advanceSandboxPayment(db: any, client: ReturnType<typeof createAcubeSandboxClient>, row: any, stripe: any = sandboxStripe()) {
 if (row.workspace_id !== fiscalTester || !['success','declined'].includes(row.payment_scenario) || !row.stripe_account?.startsWith('acct_')) throw Error('Collaudo non valido');
 if (row.status !== 'waiting_payment') return row;
 // Stripe retains idempotency keys for at least 24h. Never recreate an unknown payment after that window.
 if (!row.stripe_intent && Date.now() - Date.parse(row.created_at) > 20 * 3600000) throw Error('Pagamento da riconciliare manualmente');
 let intent;
 try {
  intent = row.stripe_intent
   ? await stripe.paymentIntents.retrieve(row.stripe_intent, {stripeAccount: row.stripe_account})
   : await stripe.paymentIntents.create({amount:2550,currency:'eur',payment_method_types:['card'],payment_method:row.payment_scenario==='declined'?'pm_card_visa_chargeDeclined':'pm_card_visa',confirm:true,description:'COLLAUDO SalonPro - nessun incasso reale',metadata:{salonpro_fiscal_test:row.id,workspace:fiscalTester}}, {stripeAccount:row.stripe_account,idempotencyKey:`salonpro-fiscal-test/${row.id}`});
 } catch (error: any) {
  // A card decline has a verifiable PaymentIntent. Network/unknown errors keep the attempt pending.
  if (!error.payment_intent) throw error;
  intent = await stripe.paymentIntents.retrieve(typeof error.payment_intent==='string'?error.payment_intent:error.payment_intent.id,{stripeAccount:row.stripe_account});
 }
 verifySandboxPayment(intent,row);
 if (intent.status !== 'succeeded') {
  if (['requires_payment_method','canceled'].includes(intent.status)) return checked(await db.from('cash_fiscal_sandbox').update({stripe_intent:intent.id,payment_status:'failed',status:'failed'}).eq('id',row.id).eq('status','waiting_payment').select().maybeSingle()) || row;
  return checked(await db.from('cash_fiscal_sandbox').update({stripe_intent:intent.id}).eq('id',row.id).eq('status','waiting_payment').select().maybeSingle()) || row;
 }
 const claimed = checked(await db.from('cash_fiscal_sandbox').update({stripe_intent:intent.id,payment_status:'succeeded',paid_at:new Date().toISOString(),status:'submitting'}).eq('id',row.id).eq('status','waiting_payment').select());
 if (!claimed.length) return checked(await db.from('cash_fiscal_sandbox').select('*').eq('id',row.id).single());
 try {
  const receipt=await client.submit({fiscalId:'99926092711',description:'COLLAUDO SalonPro - pagamento Stripe simulato',amountCents:2550,vatCode:'22',method:'electronic'});
  return checked(await db.from('cash_fiscal_sandbox').update({provider_id:receipt.uuid,status:receipt.status,document_number:receipt.document_number}).eq('id',row.id).select().single());
 } catch {
  // Do not resubmit fiscal documents after an unknown provider response, including a failed local save.
  return checked(await db.from('cash_fiscal_sandbox').update({status:'uncertain'}).eq('id',row.id).select().single());
 }
}

/** Full refund + separate void document, sandbox only; the original receipt is retained. */
export async function advanceSandboxRefund(db:any,client:ReturnType<typeof createAcubeSandboxClient>,row:any,stripe:any=sandboxStripe()) {
 if(row.workspace_id!==fiscalTester || row.payment_status!=='succeeded' || row.status!=='ready' || !row.stripe_intent || !row.stripe_account || !row.provider_id) throw Error('Rimborso di prova non disponibile');
 const intent=await stripe.paymentIntents.retrieve(row.stripe_intent,{stripeAccount:row.stripe_account});verifySandboxPayment(intent,row);
 if(intent.status!=='succeeded') throw Error('Pagamento non confermato');
 if(row.refund_status==='pending') {
  if(!row.refund_id && Date.now()-Date.parse(row.refund_requested_at)>20*3600000) throw Error('Rimborso da riconciliare');
  const refund=row.refund_id?await stripe.refunds.retrieve(row.refund_id,{stripeAccount:row.stripe_account}):await stripe.refunds.create({payment_intent:row.stripe_intent,amount:2550},{stripeAccount:row.stripe_account,idempotencyKey:`salonpro-fiscal-refund/${row.id}`});
  if(refund.payment_intent!==row.stripe_intent || refund.amount!==2550 || refund.currency!=='eur') throw Error('Rimborso non corrispondente');
  row=checked(await db.from('cash_fiscal_sandbox').update({refund_id:refund.id,refund_status:refund.status==='succeeded'?'succeeded':['failed','canceled'].includes(refund.status)?'failed':'pending'}).eq('id',row.id).select().single());
 }
 if(row.refund_status==='succeeded' && !row.void_status) {
  const claimed=checked(await db.from('cash_fiscal_sandbox').update({void_status:'submitting'}).eq('id',row.id).is('void_status',null).select());
  if(claimed.length) {
   try {const result=await client.void(row.provider_id);row=checked(await db.from('cash_fiscal_sandbox').update({void_id:result.uuid,void_status:result.status,void_number:result.document_number}).eq('id',row.id).select().single());}
   catch {row=checked(await db.from('cash_fiscal_sandbox').update({void_status:'uncertain'}).eq('id',row.id).select().single());}
   // The new void is asynchronous; read its details on the next worker/check run.
   return row;
  }
 }
 if(row.void_id && !['ready','failed'].includes(row.void_status)) {
  const result=await client.read(row.void_id);
  if(result.type!=='void'||(result.voided_receipt!=null && result.voided_receipt.uuid!==row.provider_id)||result.fiscal_id!=='99926092711'||Math.round(Number(result.total_amount)*100)!==2550)throw Error('Annullamento non corrispondente');
  row=checked(await db.from('cash_fiscal_sandbox').update({void_status:result.status,void_number:result.document_number}).eq('id',row.id).select().single());
 }
 return row;
}
