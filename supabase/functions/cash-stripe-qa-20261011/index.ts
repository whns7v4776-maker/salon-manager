import { publicPackagePayment, reconcilePackage } from '../_shared/package-payment.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';
import { reconcileTerminal, terminalAction } from '../_shared/cash-terminal.ts';
import { BookingPaymentAuthenticationRequiredError, publicBookingPayment, saveBookingPaymentPolicy } from '../_shared/booking-payment.ts';
import { cashAccountStatus } from '../_shared/cash-account-status.ts';
import { bookingPaymentErrorMessage, bookingPaymentReturnPage, expireOrReconcileBookingHold, readBookingPaymentHold, reconcileBookingPaymentHold, sweepBookingPaymentHolds } from '../_shared/booking-payment-hold.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
const returnUrl = Deno.env.get('QA_CASH_STRIPE_RETURN_URL');
const page = (message: string) => {
 if (returnUrl?.startsWith('https://')) {
  const target = new URL(returnUrl); target.searchParams.set('result', message.startsWith('Stripe collegato.') ? 'connected' : message.startsWith('Verifica lo stato') ? 'check' : 'error');
  return Response.redirect(target.toString(), 303);
 }
 return new Response(`SalonPro\n\n${message}\n\nPuoi tornare alla Cassa.`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
};
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const base = `${url}/functions/v1/cash-stripe-qa-20261011`;
const secret = Deno.env.get('QA_CASH_STRIPE_SECRET_KEY');
const clientId = Deno.env.get('QA_CASH_STRIPE_CONNECT_CLIENT_ID');
const webhookSecret = Deno.env.get('QA_CASH_STRIPE_WEBHOOK_SECRET');
const stripe = secret ? new Stripe(secret, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0 }) : null;
const live = secret?.startsWith('sk_live_') ?? false;
const bookingPaymentsEnabled = Deno.env.get('QA_CASH_BOOKING_PAYMENTS_ENABLED') === 'true';
const qaWorkspace = 'de1adde2-115e-4792-848e-3e3ee947c971';
const bookingWorkspaceAllowed = (id: string) => !live && id === qaWorkspace;
const checked = <T,>(r: { data: T; error: unknown }): T => { if (r.error) throw new Error('database'); return r.data; };

async function reconcile(session: Stripe.Checkout.Session, account: string) {
 const id = session.metadata?.salonpro_cash_payment;
 if (!id) return;
 const p = checked(await admin.from('cash_stripe_payments').select('*').eq('id', id).maybeSingle());
 if (!p || p.account_id !== account || session.livemode !== live || (p.session_id && p.session_id !== session.id)) throw new Error('payment_mismatch');
 if (session.payment_status === 'paid') {
  if (session.amount_total !== p.amount_cents || session.currency !== p.currency) throw new Error('amount_mismatch');
  checked(await admin.rpc('settle_cash_stripe', { p_id: p.id, p_account: account, p_session: session.id, p_amount: session.amount_total, p_currency: session.currency, p_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null }));
 } else if (session.status === 'expired') {
  checked(await admin.from('cash_stripe_payments').update({ status: 'expired', checkout_url: null }).eq('id', p.id).neq('status', 'paid'));
 }
}

Deno.serve(async request => {
 if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
 const action = new URL(request.url).searchParams.get('action');
 if (live || !['booking','webhook','booking-return','booking-pay','pay','return'].includes(action || '')) return reply({error:'qa_scope_only'},403);
 if (action === 'booking') { const input=await request.clone().json(); if(input.salonCode !== 'qa-payment-9be0444ee9') return reply({enabled:false}); }
 if (request.method === 'POST' && action === 'package') {
  try { return reply(await publicPackagePayment({admin,stripe,body:await request.json(),live,enabled:!!webhookSecret,allowed:bookingWorkspaceAllowed,base})); }
  catch(e) { return reply({error:e instanceof Error?e.message:'Acquisto non disponibile'},400); }
 }
 if (request.method === 'POST' && action === 'booking') {
  try {
   return reply(await publicBookingPayment({ admin, stripe, body: await request.json(), live,
    enabled: bookingPaymentsEnabled && !!webhookSecret, allowed: bookingWorkspaceAllowed, base, reconcile }));
  } catch (e) { return reply({ error: bookingPaymentErrorMessage(e), ...(e instanceof BookingPaymentAuthenticationRequiredError ? { code: e.code } : {}) }, 400); }
 }
 if (request.method === 'POST' && action === 'booking-sweep') {
  try { return reply(await sweepBookingPaymentHolds({ admin, stripe, live })); }
  catch { return reply({ error: 'retry_later' }, 503); }
 }
 if (request.method === 'GET' && (action === 'booking-return' || action === 'booking-pay')) {
  const params = new URL(request.url).searchParams;
  let batch = null;
  try {
   const hold = params.get('hold');
   if (hold) {
    batch = await readBookingPaymentHold(admin, hold);
    if(batch?.workspace_id!==qaWorkspace) return new Response('QA scope only',{status:404});
    // QA success returns read the ledger only: settlement must be delivered by
    // Stripe's webhook, never repaired by this browser redirect during the test.
    if (action === 'booking-pay' && batch?.session_id && stripe && batch.livemode === live) {
     const session = await stripe.checkout.sessions.retrieve(batch.session_id, { stripeAccount: batch.account_id, timeout: 12000 });
     await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
     batch = await readBookingPaymentHold(admin, hold);
     if (batch?.state === 'awaiting_payment' && Date.parse(batch.expires_at) <= Date.now())
      batch = await expireOrReconcileBookingHold({ admin, stripe, batch, live });
     if (action === 'booking-pay' && batch?.state === 'awaiting_payment' && session.status === 'open' && batch.checkout_url?.startsWith('https://checkout.stripe.com/'))
      return new Response(null, { status: 303, headers: { Location: batch.checkout_url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
   }
  } catch { /* The return URL never supplies payment proof. Show a recoverable verification state. */ }
  let salonCode = '';
  if (batch) {
   const salon = await admin.from('workspaces').select('slug').eq('id', batch.workspace_id).maybeSingle();
   salonCode = salon.data?.slug || '';
  }
  return bookingPaymentReturnPage({ state: batch?.state, salonCode, cancelled: params.get('result') === 'cancel' });
 }
 if (request.method === 'GET' && action === 'pay') {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return new Response('Link non valido.', {status:404});
  const result = await admin.from('cash_stripe_payments').select('status,checkout_url,booking_request_id,account_id,session_id,workspace_id').eq('id',id).maybeSingle();
  const payment = result.data;
  if(payment?.workspace_id!==qaWorkspace) return new Response('QA scope only',{status:404});
  if(payment?.booking_request_id) {
   const booking = await admin.from('booking_requests').select('status').eq('id',payment.booking_request_id).maybeSingle();
   if(booking.error || booking.data?.status!=='accepted') {
    if(stripe && payment.status==='open' && payment.session_id) {
     try { const session=await stripe.checkout.sessions.expire(payment.session_id,{}, {stripeAccount:payment.account_id});await reconcile(session,payment.account_id); } catch { /* A concurrent successful payment remains reconciled by its webhook. */ }
    }
    return new Response('Prenotazione non confermata o annullata. Contatta il salone per gli importi già versati.',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
   }
  }
  if (!result.error && payment?.status === 'open' && payment.checkout_url?.startsWith('https://checkout.stripe.com/')) return new Response(null,{status:303,headers:{Location:payment.checkout_url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  return new Response(payment?.status === 'paid' ? 'Pagamento già ricevuto. Grazie!' : 'Questo link non è più disponibile. Chiedi al salone un nuovo link.', {status:payment?.status === 'paid'?200:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 }
 if (request.method === 'GET' && action === 'return') return page('Verifica lo stato del pagamento nella Cassa. La chiusura di questa pagina non conferma né annulla il pagamento.');
 if (request.method === 'POST' && action === 'webhook') {
  if (!stripe || !webhookSecret) return reply({ error: 'not_configured' }, 503);
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get('stripe-signature') || '', webhookSecret, undefined, Stripe.createSubtleCryptoProvider()); }
  catch { return reply({ error: 'invalid_signature' }, 400); }
  if (event.livemode !== false || event.account !== 'acct_1UPQic0bCLTPQBfe') return reply({ received: true });
  try {
   const object = event.data.object as any;
   const holdId=object.metadata?.salonpro_booking_hold;
   const paymentId=object.metadata?.salonpro_cash_payment;
   if(holdId) { const target=await readBookingPaymentHold(admin,holdId); if(target?.workspace_id!==qaWorkspace) return reply({received:true}); }
   else if(paymentId) { const target=checked(await admin.from('cash_stripe_payments').select('workspace_id').eq('id',paymentId).maybeSingle()); if(target?.workspace_id!==qaWorkspace) return reply({received:true}); }
   else return reply({received:true});
   if (['payment_intent.succeeded','payment_intent.canceled','payment_intent.payment_failed'].includes(event.type)) {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.salonpro_cash_payment && intent.payment_method_types.includes('card_present'))
     await reconcileTerminal(admin, await stripe.paymentIntents.retrieve(intent.id, {stripeAccount:event.account}), event.account, live, event.type==='payment_intent.payment_failed'?event.id:undefined);
   }
   if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) {
    const obj = event.data.object as Stripe.Checkout.Session;
    if (obj.metadata?.salonpro_package_order) await reconcilePackage({admin,session:await stripe.checkout.sessions.retrieve(obj.id,{stripeAccount:event.account}),account:event.account,live});
    if (obj.metadata?.salonpro_cash_payment) await reconcile(await stripe.checkout.sessions.retrieve(obj.id, { stripeAccount: event.account }), event.account);
    if (obj.metadata?.salonpro_booking_hold) await reconcileBookingPaymentHold({admin,session:await stripe.checkout.sessions.retrieve(obj.id,{stripeAccount:event.account,timeout:12000}),account:event.account,live});
   }
   if (event.type === 'charge.refunded') {
    const charge = await stripe.charges.retrieve((event.data.object as Stripe.Charge).id, { stripeAccount: event.account });
    if (typeof charge.payment_intent === 'string') {
    const intent=await stripe.paymentIntents.retrieve(charge.payment_intent,{stripeAccount:event.account});
    if (intent.metadata?.salonpro_booking_hold) {
     checked(await admin.rpc('refund_booking_payment_hold_v1', { p_batch: intent.metadata.salonpro_booking_hold, p_account: event.account,
      p_live: live, p_intent: charge.payment_intent, p_refunded: charge.amount_refunded }));
    }
     if(intent.metadata?.salonpro_package_order) {
      const order=checked(await admin.from('service_package_orders').select('provider_session_id,account_id').eq('id',intent.metadata.salonpro_package_order).single());
      if(!order || order.account_id!==event.account || !order.provider_session_id) throw Error('package_refund_mismatch');
      await reconcilePackage({admin,session:await stripe.checkout.sessions.retrieve(order.provider_session_id,{stripeAccount:event.account}),account:event.account,live});
     }
     checked(await admin.from('cash_stripe_payments').update({ refunded_cents: charge.amount_refunded }).eq('account_id', event.account).eq('payment_intent', charge.payment_intent));
    }
   }
   return reply({ received: true });
  } catch { return reply({ error: 'retry_later' }, 500); }
 }
 if (request.method === 'GET' && action === 'callback') {
  if (!stripe) return page('Collegamento non disponibile.');
  const params = new URL(request.url).searchParams;
  try {
   // Atomic consumption prevents parallel callbacks from reusing the OAuth code.
   const states = checked(await admin.from('cash_stripe_oauth').delete().eq('state', params.get('state') || '').gt('expires_at', new Date().toISOString()).select());
   if (!states?.length || !params.get('code')) return page('Collegamento annullato o scaduto. Riprova dalla Cassa.');
   const token = await stripe.oauth.token({ grant_type: 'authorization_code', code: params.get('code')! });
   if (!token.stripe_user_id || token.livemode !== live) throw new Error('mode');
   // Never overwrite an existing account: historical charges belong to that account.
   checked(await admin.from('cash_stripe_accounts').insert({ workspace_id: states[0].workspace_id, account_id: token.stripe_user_id, livemode: token.livemode }));
   return page('Stripe collegato. Torna alla Cassa e premi “Verifica collegamento”.');
  } catch { return page('Collegamento non completato. Torna alla Cassa per verificare lo stato prima di riprovare.'); }
 }
 if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
 const authorization = request.headers.get('authorization') || '';
 const owner = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
 const { data: { user }, error } = await owner.auth.getUser();
 if (error || !user) return reply({ error: 'Accedi di nuovo al salone.' }, 401);
 const workspace = await owner.rpc('current_workspace_id');
 const access = await owner.rpc('workspace_access_allowed');
 if (workspace.error || !workspace.data || access.error || !access.data) return reply({ error: 'Accesso al salone non disponibile.' }, 403);
 const workspaceId = workspace.data;
 try {
  const body = await request.json();
  // Temporary rollout gate. Remove only after live payment acceptance checks.
  const rolloutWorkspaces = (Deno.env.get('QA_CASH_STRIPE_ROLLOUT_WORKSPACE_IDS') || 'd84f3211-d20f-45a3-9d7f-f551400690fd').split(',').map(id => id.trim());
  const publicEnabled = Deno.env.get('QA_CASH_STRIPE_PUBLIC_ENABLED') === 'true';
  if (!publicEnabled && !rolloutWorkspaces.includes(workspaceId)) return reply({ configured: false, error: body.action === 'status' ? undefined : 'Pagamenti non disponibili per questo salone.' });
  const testWorkspaces = (Deno.env.get('QA_CASH_STRIPE_TEST_WORKSPACE_IDS') || '').split(',').map(id => id.trim());
  if (!live && !testWorkspaces.includes(workspaceId)) return reply({ configured: false, error: body.action === 'status' ? undefined : 'I pagamenti di prova sono disponibili solo nel salone di collaudo.' });
  if (!stripe || !clientId || !webhookSecret || !returnUrl?.startsWith('https://')) return reply({ configured: false, error: body.action === 'status' ? undefined : 'Stripe non è ancora configurato per SalonPro.' });
  const account = checked(await admin.from('cash_stripe_accounts').select('*').eq('workspace_id', workspaceId).eq('livemode', live).maybeSingle());
  if (body.action === 'booking-policy-status') return reply({enabled:bookingPaymentsEnabled});
  if (body.action === 'booking-policy-save') {
   try { return reply(await saveBookingPaymentPolicy({admin,stripe,workspaceId,account,body,enabled:bookingPaymentsEnabled})); }
   catch(e) { return reply({error:e instanceof Error?e.message:'Salvataggio non riuscito.'},400); }
  }
  if (body.action === 'appointment') {
   if (!account) return reply({error:'Collega prima Stripe nella Cassa.'},400);
   if (!/^[a-f0-9-]{36}$/i.test(body.movementId || '')) return reply({error:'Attendi il salvataggio dell’appuntamento.'},400);
   const result = await admin.rpc('prepare_cash_appointment',{p_workspace:workspaceId,p_appointment:body.movementId});
   if(result.error) return reply({error:result.error.message},400);
   return reply({movement:result.data});
  }
  if (body.action === 'report') {
   if (!account || account.livemode !== live) return reply({ error: 'Collega Stripe per questo salone.' }, 400);
   const from = body.from, until = body.until;
   if (!Number.isSafeInteger(from) || !Number.isSafeInteger(until) || from < 0 || until <= from) return reply({error:'Periodo non valido.'},400);
   const created = {gte:from,lt:until};
   const transactions = []; const payouts = [];
   for await (const t of stripe.balanceTransactions.list({created,limit:100},{stripeAccount:account.account_id})) {
    if(transactions.length>=10000) return reply({error:'Troppi movimenti Stripe: seleziona un periodo più breve.'},400);
    transactions.push({id:t.id,created:t.created,type:t.type,currency:t.currency,amount:t.amount,fee:t.fee,net:t.net,source:typeof t.source==='string'?t.source:null});
   }
   for await (const p of stripe.payouts.list({created,limit:100},{stripeAccount:account.account_id})) {
    if(payouts.length>=10000) return reply({error:'Troppi accrediti: seleziona un periodo più breve.'},400);
    payouts.push({id:p.id,created:p.created,arrival:p.arrival_date,currency:p.currency,amount:p.amount,status:p.status});
   }
   return reply({live,transactions,payouts});
  }
  if (body.action === 'connect') {
   if (account) return reply({ error: 'Stripe è già collegato. Verifica il collegamento.' });
   const state = crypto.randomUUID() + crypto.randomUUID();
   checked(await admin.from('cash_stripe_oauth').insert({ state, workspace_id: workspaceId }));
   const target = new URL('https://connect.stripe.com/oauth/authorize');
   target.search = new URLSearchParams({ response_type: 'code', client_id: clientId, scope: 'read_write', redirect_uri: `${base}?action=callback`, state }).toString();
   return reply({ url: target.toString() });
  }
  if (body.action === 'onboard') {
   if (!account || account.livemode !== live) return reply({ error: 'Collega Stripe per questo salone.' });
   const link = await stripe.accountLinks.create({ account: account.account_id, type: 'account_onboarding', refresh_url: returnUrl!, return_url: returnUrl! });
   return reply({ url: link.url });
  }
  if (body.action === 'status') {
   return reply(await cashAccountStatus(admin, stripe, workspaceId, account, live));
  }
  if (!account || account.livemode !== live) return reply({ error: 'Collega Stripe per questo salone.' });
  if (['terminal-status','terminal-token','terminal-intent','terminal-check','terminal-cancel'].includes(body.action)) {
   try { return reply(await terminalAction({admin,stripe,account,workspaceId,body,live,enabled:Deno.env.get('QA_CASH_STRIPE_TERMINAL_ENABLED')==='true'})); }
   catch(e) { return reply({error:e instanceof Error && !('type' in e) ? e.message : 'Contactless non disponibile. Verifica lo stato prima di riprovare.'},400); }
  }
  if (body.action !== 'checkout' && body.action !== 'cancel' && body.action !== 'check') return reply({ error: 'Operazione non valida.' }, 400);
  if (!/^[a-f0-9-]{36}$/i.test(body.movementId || '')) return reply({ error: 'Attendi il salvataggio del movimento prima di incassare.' });
  let p;
  if (body.action === 'checkout') p = checked(await admin.rpc('reserve_cash_stripe', { p_workspace: workspaceId, p_movement: body.movementId, p_live: live }));
  else p = checked(await admin.from('cash_stripe_payments').select('*').eq('workspace_id', workspaceId).eq('movement_id', body.movementId).neq('status', 'expired').maybeSingle());
  if (!p) return reply({ status: 'expired' });
  if (p.account_id !== account.account_id) return reply({ error: 'Questo movimento appartiene a un altro collegamento Stripe. Usa un nuovo movimento.' }, 400);
  if (p.channel === 'terminal') {
   if (body.action === 'checkout') return reply({error:'Contactless già aperto: verificalo o annullalo prima di creare un QR.'},400);
   return reply(await terminalAction({admin,stripe,account,workspaceId,body:{...body,action:body.action==='cancel'?'terminal-cancel':'terminal-check'},live,enabled:false}));
  }
  if (p.status === 'paid') return reply({ status: 'paid', receiptEmailConfigured: !!p.receipt_email });
  let session;
  if (p.session_id) session = await stripe.checkout.sessions.retrieve(p.session_id, { stripeAccount: p.account_id });
  else {
   // An uncertain create is retried with the SAME parameters/key, never a new payment.
   if (Date.now() - Date.parse(p.created_at) > 20 * 3600000) return reply({ error: 'Pagamento da verificare: contatta l’assistenza prima di creare un altro link.' });
   session = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'], line_items: [{ price_data: { currency: 'eur', unit_amount: p.amount_cents, product_data: { name: 'Servizi del salone' } }, quantity: 1 }], metadata: { salonpro_cash_payment: p.id }, ...(p.receipt_email ? {customer_email:p.receipt_email} : {}), payment_intent_data: { metadata: { salonpro_cash_payment: p.id }, ...(p.receipt_email ? {receipt_email:p.receipt_email} : {}) }, success_url: `${base}?action=${p.booking_request_id ? 'booking-return' : 'return'}`, cancel_url: `${base}?action=${p.booking_request_id ? 'booking-return' : 'return'}` }, { stripeAccount: p.account_id, idempotencyKey: `salonpro-cash-${p.id}` });
   checked(await admin.from('cash_stripe_payments').update({ session_id: session.id, checkout_url: session.url, status: 'open' }).eq('id', p.id).eq('status', 'creating'));
  }
  if (body.action === 'cancel' && session.status === 'open') {
   try { session = await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: p.account_id }); }
   catch { session = await stripe.checkout.sessions.retrieve(session.id, { stripeAccount: p.account_id }); }
  }
  await reconcile(session, p.account_id);
  return reply({ receiptEmailConfigured: !!p.receipt_email, amountCents: session.amount_total, status: session.payment_status === 'paid' ? 'paid' : session.status, url: session.status === 'open' ? `${base}?action=pay&id=${p.id}` : null });
 } catch { return reply({ error: 'Verifica non riuscita. Riprova: il pagamento non verrà duplicato.' }, 503); }
});
