import type Stripe from 'npm:stripe@18.5.0';

export function terminalOutcome(intent: Stripe.PaymentIntent) {
 if(intent.status==='succeeded')return 'paid';
 if(intent.status==='canceled')return 'cancelled';
 if(intent.status==='requires_payment_method' && intent.last_payment_error)return 'declined';
 return 'pending';
}
export function terminalReceipt(payment: any,outcome: string,intent?: Stripe.PaymentIntent) {
 if(!['paid','declined','cancelled'].includes(outcome))return undefined;
 const label=outcome==='paid'?'Pagamento approvato':outcome==='declined'?'Pagamento rifiutato · nessun incasso':'Tentativo annullato · nessun incasso';
 const charge=intent?.latest_charge && typeof intent.latest_charge==='object'?intent.latest_charge:null;
 const card=charge?.payment_method_details?.card_present;
 const emv=card?.receipt;
 const timestamp=charge?.created??intent?.created;
 // Prefer Stripe's network-compliant receipt for approval. When a decline has
 // no hosted receipt, share only the masked card and available EMV receipt data.
 const details=[
  timestamp?`Data: ${new Date(timestamp*1000).toLocaleString('it-IT',{timeZone:'Europe/Rome'})}`:undefined,
  card?`Carta: ${card.brand??''} •••• ${card.last4??''}`:undefined,
  emv?.account_type?`Tipo conto: ${emv.account_type}`:undefined,
  emv?.application_preferred_name?`Applicazione: ${emv.application_preferred_name}`:undefined,
  emv?.dedicated_file_name?`AID: ${emv.dedicated_file_name}`:undefined,
  charge?.receipt_url?`Ricevuta Stripe: ${charge.receipt_url}`:undefined,
 ].filter(Boolean).join('\n');
 return `SalonPro · ricevuta di pagamento\n${label}\nImporto: ${(payment.amount_cents/100).toFixed(2).replace('.',',')} ${String(payment.currency).toUpperCase()}\n${details?`${details}\n`:''}Riferimento: ${payment.payment_intent??payment.id}\nRicevuta dell’esito del pagamento. Non è un documento fiscale.`;
}

export function validateTerminalIntent(intent: Stripe.PaymentIntent, payment: any, live: boolean) {
 if (payment.channel !== 'terminal' || intent.livemode !== live || intent.amount !== payment.amount_cents || intent.currency !== payment.currency
  || intent.metadata.salonpro_cash_payment !== payment.id || !intent.payment_method_types.includes('card_present')
  || (payment.payment_intent && payment.payment_intent !== intent.id)) throw Error('Pagamento contactless non corrispondente.');
 if (intent.status === 'succeeded' && intent.amount_received !== payment.amount_cents) throw Error('Importo ricevuto non corrispondente.');
}

export async function reconcileTerminal(admin: any, intent: Stripe.PaymentIntent, account: string, live: boolean, eventId?: string) {
 const id = intent.metadata.salonpro_cash_payment;
 if (!id) return;
 const result = await admin.from('cash_stripe_payments').select('*').eq('id', id).maybeSingle();
 if (result.error || !result.data || result.data.account_id !== account) throw Error('Pagamento non trovato.');
 validateTerminalIntent(intent, result.data, live);
 if (intent.status === 'succeeded') {
  const settled = await admin.rpc('settle_cash_terminal', { p_id:id,p_account:account,p_amount:intent.amount_received,p_currency:intent.currency,p_intent:intent.id });
  if (settled.error) throw Error('Conferma incasso non riuscita. Verifica prima di riprovare.');
 } else if (intent.status === 'canceled') {
  const expired = await admin.from('cash_stripe_payments').update({status:'expired'}).eq('id',id).neq('status','paid');
  if (expired.error) throw Error('Verifica annullamento non riuscita.');
 } else if(eventId && terminalOutcome(intent)==='declined') {
  const queued=await admin.rpc('record_cash_terminal_decline',{p_payment:id,p_intent:intent.id,p_event:eventId});
  if(queued.error)throw Error('Registrazione esito contactless non riuscita.');
 }
}

export async function terminalAction({admin,stripe,account,workspaceId,body,live,enabled}:any) {
 const options = {stripeAccount:account.account_id};
 if (body.action === 'terminal-status') {
  if (!enabled || !live) return {enabled:false,reason:'Contactless in preparazione: manca il collaudo della nuova app.'};
  const a = await stripe.accounts.retrieve(account.account_id);
  if (!a.charges_enabled || a.country !== 'IT') return {enabled:false,reason:'Completa l’attivazione Stripe del salone in Italia.'};
  const locations = await stripe.terminal.locations.list({limit:100},options);
  return {enabled:true,locations:locations.data.filter((l:any)=>l.address?.country==='IT').map((l:any)=>({id:l.id,name:l.display_name}))};
 }
 // The gate blocks new collection, never recovery/cancellation of an existing payment.
 if (!['terminal-check','terminal-cancel'].includes(body.action) && (!enabled || !live)) throw Error('Contactless non ancora abilitato: usa QR / link o POS esterno.');
 if (body.action === 'terminal-token') {
  const location = await stripe.terminal.locations.retrieve(body.locationId,options);
  if (location.deleted || location.address?.country !== 'IT') throw Error('Sede Stripe non valida.');
  return {secret:(await stripe.terminal.connectionTokens.create({location:location.id},options)).secret};
 }
 if (!/^[a-f0-9-]{36}$/i.test(body.movementId || '')) throw Error('Movimento non valido.');
 let payment;
 if (body.action === 'terminal-intent') {
  const r = await admin.rpc('reserve_cash_stripe',{p_workspace:workspaceId,p_movement:body.movementId,p_live:live,p_channel:'terminal'});
  if (r.error) throw Error(r.error.message); payment=r.data;
 } else {
  const r = await admin.from('cash_stripe_payments').select('*').eq('workspace_id',workspaceId).eq('movement_id',body.movementId).neq('status','expired').maybeSingle();
  if (r.error) throw Error('Verifica pagamento non disponibile.'); payment=r.data;
 }
 if (!payment) return {status:'expired',channel:'terminal'};
 if (payment.account_id !== account.account_id) throw Error('Collegamento Stripe diverso da quello del pagamento.');
 if (payment.status === 'paid') {
  let paidIntent;
  if(payment.channel==='terminal' && payment.payment_intent) {
   paidIntent=await stripe.paymentIntents.retrieve(payment.payment_intent,{expand:['latest_charge']},options);
   validateTerminalIntent(paidIntent,payment,live);
  }
  return {status:'paid',outcome:'paid',channel:payment.channel,amountCents:payment.amount_cents,receipt:terminalReceipt(payment,'paid',paidIntent),receiptEmailConfigured:!!payment.receipt_email};
 }
 if (payment.channel !== 'terminal') throw Error('Un QR / link è già aperto: annullalo prima del contactless.');
 let intent;
 if (payment.payment_intent) intent=await stripe.paymentIntents.retrieve(payment.payment_intent,{expand:['latest_charge']},options);
 else {
  // Stable parameters and key also recover a lost create response, never a second charge.
  if (Date.now()-Date.parse(payment.created_at)>20*3600000) throw Error('Pagamento da verificare con l’assistenza. Non creare un secondo incasso.');
  intent=await stripe.paymentIntents.create({amount:payment.amount_cents,currency:payment.currency,payment_method_types:['card_present'],capture_method:'automatic',metadata:{salonpro_cash_payment:payment.id},...(payment.receipt_email?{receipt_email:payment.receipt_email}:{})},{...options,idempotencyKey:`salonpro-terminal-${payment.id}`});
  const r=await admin.from('cash_stripe_payments').update({payment_intent:intent.id,status:'open'}).eq('id',payment.id).eq('status','creating');
  if(r.error) throw Error('Verifica il pagamento prima di proseguire.');
 }
 validateTerminalIntent(intent,payment,live);
 if(body.action==='terminal-cancel' && !['canceled','succeeded'].includes(intent.status)) {
  try { intent=await stripe.paymentIntents.cancel(intent.id,{},options); }
  catch { intent=await stripe.paymentIntents.retrieve(intent.id,{expand:['latest_charge']},options); }
 }
 await reconcileTerminal(admin,intent,account.account_id,live);
 const outcome=terminalOutcome(intent);
 return {channel:'terminal',status:intent.status==='succeeded'?'paid':intent.status==='canceled'?'expired':'open',outcome,receipt:terminalReceipt({...payment,payment_intent:intent.id},outcome,intent),intentStatus:intent.status,amountCents:intent.amount,receiptEmailConfigured:!!payment.receipt_email,
  ...(body.action==='terminal-intent' && ['requires_payment_method','requires_confirmation'].includes(intent.status)?{clientSecret:intent.client_secret}:{}),};
}
