// A Checkout session is one payment for the complete, server-priced booking.
// Only a verified Stripe result can turn the temporary reservation into a booking.
const checked = (r: any) => { if (r.error) throw new Error(r.error.message || 'Verifica del pagamento non riuscita.'); return r.data; };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bookingPaymentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/booking_payment_hold_(expired|cancelled)/.test(message))
    return 'Il tempo per pagare è scaduto. Verifica lo stato e scegli un nuovo orario.';
  if (/booking_payment_hold_not_found|booking_payment_session_mismatch/.test(message))
    return 'Questa scelta non è più disponibile. Verifica le tue prenotazioni prima di riprovare.';
  if (/booking_(payment|amount)_mismatch|booking_payment_intent_missing/.test(message))
    return 'Non riusciamo a verificare questo pagamento. Contatta il salone prima di riprovare.';
  if (/customer_registration_pending/.test(message))
    return 'Il salone deve approvare la tua registrazione prima di prenotare.';
  // Only our deliberately written customer messages can leave the boundary.
  // Database and provider diagnostics must not appear in the booking interface.
  if (/^(Verifica la password per accedere ai pagamenti\.|Prenotazione non (valida|disponibile)\.|Operazione non valida\.|Questa prenotazione va gestita con il salone\.|Pagamento (online temporaneamente non disponibile\.|alla prenotazione non ancora disponibile\.|non disponibile\. Contatta il salone\.|da verificare con il salone prima di riprovare\.|ancora in verifica\.)|Il salone deve completare (il collegamento Stripe\.|l’attivazione Stripe\.)|Verifica del pagamento temporaneamente non disponibile\.)/.test(message))
    return message;
  return 'Non riusciamo a verificare il pagamento in questo momento. Riprova tra poco senza inviare un altro pagamento.';
}

export async function readBookingPaymentHold(admin: any, batchId: string) {
  if (!uuid.test(batchId)) throw new Error('Prenotazione non disponibile.');
  return checked(await admin.from('booking_payment_hold_batches').select('*').eq('id', batchId).maybeSingle());
}

export async function reconcileBookingPaymentHold({ admin, session, account, live }: any) {
  const id = session.metadata?.salonpro_booking_hold;
  if (!id) return;
  const batch = await readBookingPaymentHold(admin, id);
  if (!batch || batch.account_id !== account || batch.livemode !== live || session.livemode !== live
    || (batch.session_id && batch.session_id !== session.id)) throw new Error('booking_payment_mismatch');
  if (session.amount_total !== Number(batch.due_cents) || session.currency !== 'eur') throw new Error('booking_amount_mismatch');
  const args = { p_batch: batch.id, p_account: account, p_live: live, p_session: session.id };
  if (session.payment_status === 'paid') {
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!intent) throw new Error('booking_payment_intent_missing');
    checked(await admin.rpc('settle_booking_payment_hold_v1', {
      ...args, p_amount: session.amount_total, p_currency: session.currency, p_intent: intent,
    }));
  } else if (session.status === 'expired') {
    checked(await admin.rpc('expire_booking_payment_hold_v1', args));
  }
}

export async function expireOrReconcileBookingHold({ admin, stripe, batch, live }: any) {
  if (batch.state !== 'awaiting_payment') return batch;
  if (!batch.session_id) {
    // An uncertain create is not proof that no session exists. The database
    // keeps such attempts reserved until they have been recovered safely.
    if (!batch.account_id) {
      checked(await admin.rpc('expire_booking_payment_hold_v1', {
        p_batch: batch.id, p_account: null, p_live: null, p_session: null,
      }));
      return await readBookingPaymentHold(admin, batch.id);
    }
    if (!stripe || batch.livemode !== live) throw new Error('Verifica del pagamento temporaneamente non disponibile.');
    // Recover an uncertain create before releasing capacity. All result pages
    // must have been inspected: a truncated list is never evidence of absence.
    let startingAfter: string | undefined;
    let recovered: any;
    let complete = false;
    for (let page = 0; page < 5; page++) {
      const list = await stripe.checkout.sessions.list({ limit: 100,
        created: { gte: Math.floor(Date.parse(batch.created_at) / 1000) },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }, { stripeAccount: batch.account_id, timeout: 12000 });
      recovered = list.data.find((s: any) => s.metadata?.salonpro_booking_hold === batch.id);
      if (recovered) break;
      if (!list.has_more) { complete = true; break; }
      startingAfter = list.data.at(-1)?.id;
      if (!startingAfter) break;
    }
    if (recovered) {
      checked(await admin.rpc('attach_booking_payment_hold_checkout_v1', {
        p_batch: batch.id, p_account: batch.account_id, p_live: live, p_session: recovered.id,
        p_url: recovered.url || 'https://checkout.stripe.com/expired',
      }));
      batch = { ...batch, session_id: recovered.id };
    } else {
      if (!complete || Date.parse(batch.expires_at) + 60000 > Date.now())
        throw new Error('Pagamento ancora in verifica. Riprova tra poco; l’orario resta trattenuto.');
      checked(await admin.rpc('release_unattached_booking_payment_hold_v1', {
        p_batch: batch.id, p_account: batch.account_id, p_live: live,
      }));
      return await readBookingPaymentHold(admin, batch.id);
    }
  }
  if (!stripe || batch.livemode !== live) throw new Error('Verifica del pagamento temporaneamente non disponibile.');
  let session = await stripe.checkout.sessions.retrieve(batch.session_id, { stripeAccount: batch.account_id, timeout: 12000 });
  if (session.status === 'open' && session.payment_status !== 'paid') {
    try { session = await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: batch.account_id, timeout: 12000 }); }
    catch { session = await stripe.checkout.sessions.retrieve(session.id, { stripeAccount: batch.account_id, timeout: 12000 }); }
  }
  await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
  return await readBookingPaymentHold(admin, batch.id);
}

async function holdResult(admin: any, batch: any, requestId: string, session?: any, checkoutUrl?: string) {
  const request = checked(await admin.from('booking_requests').select('status').eq('id', requestId).eq('workspace_id', batch.workspace_id).maybeSingle());
  const received = batch.state === 'paid' || batch.state === 'paid_conflict' ? Number(batch.due_cents) : 0;
  const refunded = Number(batch.refunded_cents || 0);
  let status = 'payment_required';
  if (batch.state === 'expired') status = 'expired';
  else if (batch.state === 'paid_conflict') status = 'paid_conflict';
  else if (batch.state === 'paid') status = ['cancelled', 'rejected'].includes(request?.status)
    ? 'cancelled' : refunded > 0 ? 'refunded' : Number(batch.due_cents) >= Number(batch.total_cents) ? 'paid' : 'deposit_paid';
  else if (session?.status === 'complete') status = 'payment_processing';
  else if (session?.status === 'open') status = 'open';
  return {
    enabled: true, requiresPayment: true, policy: { mode: batch.mode, percent: batch.percent },
    status, bookingStatus: request?.status ?? 'pending', holdExpiresAt: batch.expires_at,
    groupRequestIds: batch.request_ids, batchId: batch.id,
    totalCents: Number(batch.total_cents), dueCents: Number(batch.due_cents),
    paidCents: Math.max(0, received - refunded), refundedCents: refunded,
    balanceCents: Math.max(0, Number(batch.total_cents) - received),
    ...(checkoutUrl ? { url: checkoutUrl } : {}),
  };
}

export async function publicBookingPaymentHold({ admin, stripe, body, context, request, live, base }: any) {
  checked(await admin.rpc('prepare_booking_payment_hold_v1', { p_workspace: context.workspaceId, p_request: request.id }));
  let batch = await readBookingPaymentHold(admin, request.payment_hold_batch_id);
  if (!batch || batch.workspace_id !== context.workspaceId || batch.customer_id !== context.customerId) throw new Error('Prenotazione non disponibile.');
  if (batch.state !== 'awaiting_payment') return holdResult(admin, batch, request.id);
  if (body.operation === 'cancel') {
    if (!batch.account_id && !batch.session_id) {
      checked(await admin.rpc('cancel_unstarted_booking_payment_hold_v1', { p_workspace: context.workspaceId, p_request: request.id }));
      batch = await readBookingPaymentHold(admin, batch.id);
    } else batch = await expireOrReconcileBookingHold({ admin, stripe, batch, live });
    return holdResult(admin, batch, request.id);
  }
  let session = null;
  if (batch.session_id) {
    if (!stripe || batch.livemode !== live) throw new Error('Verifica del pagamento temporaneamente non disponibile.');
    session = await stripe.checkout.sessions.retrieve(batch.session_id, { stripeAccount: batch.account_id, timeout: 12000 });
    await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
    batch = await readBookingPaymentHold(admin, batch.id);
    if (batch.state !== 'awaiting_payment') return holdResult(admin, batch, request.id, session);
  }
  if (Date.parse(batch.expires_at) <= Date.now()) {
    batch = await expireOrReconcileBookingHold({ admin, stripe, batch, live });
    return holdResult(admin, batch, request.id);
  }
  if (body.operation !== 'checkout') return holdResult(admin, batch, request.id, session);
  if (!stripe) throw new Error('Pagamento online temporaneamente non disponibile.');
  const account = checked(await admin.from('cash_stripe_accounts').select('account_id').eq('workspace_id', context.workspaceId).eq('livemode', live).maybeSingle());
  if (!account) throw new Error('Il salone deve completare il collegamento Stripe.');
  const remote = await stripe.accounts.retrieve(account.account_id, { timeout: 12000 });
  if (!remote.charges_enabled || !remote.payouts_enabled) throw new Error('Il salone deve completare l’attivazione Stripe.');
  batch = checked(await admin.rpc('reserve_booking_payment_hold_v1', {
    p_workspace: context.workspaceId, p_request: request.id, p_account: account.account_id, p_live: live,
  }));
  if (batch.state !== 'awaiting_payment') return holdResult(admin, batch, request.id);
  if (!session) {
    // The timestamp, prices and identity come from the reserved database row.
    // Retries on any device use exactly the same key and parameters.
    // Stripe's hosted session minimum is 30 minutes. Capacity has its own five
    // minute deadline; the server explicitly expires Checkout before releasing it.
    const expiresAt = Math.floor(Date.parse(batch.checkout_expires_at) / 1000);
    const receiptEmail = batch.receipt_email;
    session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], expires_at: expiresAt,
      line_items: [{ price_data: { currency: 'eur', unit_amount: Number(batch.due_cents), product_data: {
        name: batch.mode === 'deposit' ? `Acconto ${batch.percent}% · Prenotazione salone` : 'Prenotazione salone',
      } }, quantity: 1 }],
      metadata: { salonpro_booking_hold: batch.id },
      ...(receiptEmail ? { customer_email: receiptEmail } : {}),
      payment_intent_data: { metadata: { salonpro_booking_hold: batch.id }, ...(receiptEmail ? { receipt_email: receiptEmail } : {}) },
      success_url: `${base}?action=booking-return&hold=${batch.id}&result=success`,
      cancel_url: `${base}?action=booking-return&hold=${batch.id}&result=cancel`,
    }, { stripeAccount: batch.account_id, idempotencyKey: `salonpro-booking-hold-${batch.id}`, timeout: 12000 });
    try {
      batch = checked(await admin.rpc('attach_booking_payment_hold_checkout_v1', {
        p_batch: batch.id, p_account: batch.account_id, p_live: live, p_session: session.id, p_url: session.url,
      }));
    } catch (error) {
      // A concurrent cancellation cannot leave a newly created payable session behind.
      if (session.status === 'open') {
        try { session = await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: batch.account_id, timeout: 12000 }); }
        catch { session = await stripe.checkout.sessions.retrieve(session.id, { stripeAccount: batch.account_id, timeout: 12000 }); }
      }
      await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
      throw error;
    }
  }
  await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
  batch = await readBookingPaymentHold(admin, batch.id);
  return holdResult(admin, batch, request.id, session,
    batch.state === 'awaiting_payment' && session.status === 'open' ? `${base}?action=booking-pay&hold=${batch.id}` : undefined);
}

export async function sweepBookingPaymentHolds({ admin, stripe, live }: any) {
  if (!stripe) return { checked: 0 };
  const batches = checked(await admin.rpc('claim_due_booking_payment_holds_v1', { p_limit: 20 })) ?? [];
  let processed = 0;
  // The database caps each leased batch at twenty. Concurrent I/O lets one
  // unreachable account retry without delaying expiry for the other salons.
  await Promise.allSettled(batches.map(async (batch: any) => {
    try { await expireOrReconcileBookingHold({ admin, stripe, batch, live }); processed++; }
    catch { /* Keep the reservation while Stripe is unreachable; the next lease retries. */ }
  }));
  return { checked: processed };
}

export async function refreshCustomerBookingPaymentHolds({ admin, stripe, context, live }: any) {
  if (!stripe) return;
  const batches = checked(await admin.from('booking_payment_hold_batches').select('*')
    .eq('workspace_id', context.workspaceId).eq('customer_id', context.customerId).eq('state', 'awaiting_payment').limit(8)) ?? [];
  // Webhook delivery and a browser redirect are independent. Reconcile on app
  // resume too, without failing the whole list during a temporary Stripe outage.
  await Promise.allSettled(batches.map(async (batch: any) => {
    if (!batch.session_id || batch.livemode !== live) return;
    let session = await stripe.checkout.sessions.retrieve(batch.session_id, { stripeAccount: batch.account_id, timeout: 6000 });
    if (Date.parse(batch.expires_at) <= Date.now() && session.status === 'open' && session.payment_status !== 'paid') {
      try { session = await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: batch.account_id, timeout: 6000 }); }
      catch { session = await stripe.checkout.sessions.retrieve(session.id, { stripeAccount: batch.account_id, timeout: 6000 }); }
    }
    await reconcileBookingPaymentHold({ admin, session, account: batch.account_id, live });
  }));
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function bookingPaymentReturnPage({ state = 'checking', salonCode = '', cancelled = false }: { state?: string; salonCode?: string; cancelled?: boolean }) {
  const paid = state === 'paid';
  const expired = state === 'expired';
  const conflict = state === 'paid_conflict';
  const title = paid ? 'Pagamento ricevuto' : expired ? 'Tempo scaduto' : conflict ? 'Pagamento da verificare' : cancelled ? 'Pagamento non completato' : 'Verifichiamo il pagamento';
  const message = paid ? 'Il pagamento è stato ricevuto. Torna nell’app per vedere la conferma o lo stato di approvazione del salone.'
    : expired ? 'L’orario non è più trattenuto. Torna in SalonPro per scegliere una nuova disponibilità.'
      : conflict ? 'Il salone deve verificare la prenotazione e l’importo ricevuto. Non inviare un altro pagamento.'
        : cancelled ? 'Puoi riprendere il pagamento oppure annullare la scelta in SalonPro. La prenotazione non è ancora confermata.'
          : 'La prenotazione sarà confermata soltanto dopo la verifica del pagamento. Ritrovi lo stato aggiornato in SalonPro.';
  const params = new URLSearchParams({ autologin: '1', ...(salonCode ? { salon: salonCode } : {}), paymentReturn: '1' });
  const appUrl = `salonmanager://cliente?${params}`;
  const webUrl = `https://salonpro.dev/cliente?${params}`;
  return new Response(`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · SalonPro</title><style>body{margin:0;background:#f3f6fb;color:#172339;font-family:system-ui,-apple-system,sans-serif;display:grid;min-height:100svh;place-items:center}main{box-sizing:border-box;max-width:440px;margin:24px;padding:32px;background:white;border:1px solid #e0e7f2;border-radius:28px;box-shadow:0 16px 48px #1d35571a}small{font-weight:700;color:#45689b;letter-spacing:.15em}h1{font-size:26px;line-height:1.2;margin:24px 0 16px}p{line-height:1.6;color:#536780}a{display:block;text-decoration:none;text-align:center;border-radius:16px;padding:16px;font-weight:700;margin-top:14px;background:#2459eb;color:white}a.secondary{background:#edf3ff;color:#2459eb}</style><main><small>SALONPRO</small><h1>${title}</h1><p>${message}</p><a href="${escapeHtml(appUrl)}">Torna nell’app</a><a class="secondary" href="${escapeHtml(webUrl)}">Continua sul web</a></main></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  } });
}
