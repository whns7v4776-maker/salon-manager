import { publicBookingPaymentHold, refreshCustomerBookingPaymentHolds } from './booking-payment-hold.ts';
// Booking prices and policy snapshots come exclusively from the database.
const checked = (result: any) => { if (result.error) throw new Error(result.error.message || 'Verifica non riuscita'); return result.data; };
export class BookingPaymentAuthenticationRequiredError extends Error {
  readonly code = 'auth_required';
  constructor() {
    super('Verifica la password per accedere ai pagamenti.');
    this.name = 'BookingPaymentAuthenticationRequiredError';
  }
}
export async function saveBookingPaymentPolicy({ admin, stripe, workspaceId, account, body, enabled }: any) {
  if (!enabled) throw new Error('Pagamento alla prenotazione non ancora disponibile.');
  if (!['salon', 'full', 'deposit', 'inherit'].includes(body.mode)) throw new Error('Regola non valida.');
  if (body.mode === 'full' || body.mode === 'deposit') {
    if (!stripe || !account) throw new Error('Collega Stripe prima di richiedere pagamenti online.');
    const remote = await stripe.accounts.retrieve(account.account_id);
    if (!remote.charges_enabled || !remote.payouts_enabled) throw new Error('Completa l’attivazione di Stripe prima di richiedere pagamenti online.');
  }
  if (!Number.isSafeInteger(body.percent) || !Number.isSafeInteger(body.expectedRevision)) throw new Error('Impostazione non valida.');
  return { policy: checked(await admin.rpc('save_booking_payment_policy', {
    p_workspace: workspaceId, p_customer: body.customerId ?? null,
    p_mode: body.mode, p_percent: body.percent, p_expected_revision: body.expectedRevision,
  })) };
}

export async function publicBookingPayment({ admin, stripe, body, live, enabled, allowed, base, reconcile }: any) {
  if (!enabled) return { enabled: false };
  if (String(body.salonCode ?? '').length > 150 || String(body.email ?? '').length > 254 || String(body.phone ?? '').length > 40 || (body.requestId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.requestId))) throw new Error('Prenotazione non valida.');
  if (!['quote', 'check', 'checkout', 'summary', 'cancel'].includes(body.operation)) throw new Error('Operazione non valida.');
  const scope = checked(await admin.rpc('booking_payment_customer_context', {
    p_salon_code: String(body.salonCode ?? ''), p_email: String(body.email ?? ''), p_phone: String(body.phone ?? ''),
  }));
  if (!scope || !allowed(scope.workspaceId)) return { enabled: false };
  // A legacy customer may book a service paid entirely in the salon. This is
  // only the effective policy flag; payment history and request data stay private.
  if (body.operation === 'quote' && body.requestId == null && scope.policy?.mode === 'salon' && scope.policy.percent === 0) {
    return { enabled: true, policy: { mode: 'salon', percent: 0 } };
  }
  const context = checked(await admin.rpc('verified_booking_payment_context', {
    p_salon_code: String(body.salonCode ?? ''), p_email: String(body.email ?? ''), p_phone: String(body.phone ?? ''),
    p_token: String(body.paymentToken ?? ''),
  }));
  if (!context) throw new BookingPaymentAuthenticationRequiredError();
  if (!allowed(context.workspaceId)) return { enabled: false };
  if (body.operation === 'summary') {
    await refreshCustomerBookingPaymentHolds({ admin, stripe, context, live });
    return { enabled: true, items: checked(await admin.rpc('customer_booking_payment_notices', {
      p_workspace: context.workspaceId, p_customer: context.customerId,
    })) };
  }
  if (!body.requestId) return { enabled: true, policy: context.policy };
  const request = checked(await admin.from('booking_requests').select('id,status,workspace_id,customer_id,customer_email,customer_phone,payment_hold_state,payment_hold_batch_id')
    .eq('id', body.requestId).eq('workspace_id', context.workspaceId).maybeSingle());
  const legacyIdentityMatches = request && !request.customer_id && String(request.customer_email ?? '').trim().toLowerCase() === String(body.email).trim().toLowerCase()
    && String(request.customer_phone ?? '').replace(/\D/g,'') === String(body.phone).replace(/\D/g,'');
  if (!request || (request.customer_id !== context.customerId && !legacyIdentityMatches)) throw new Error('Prenotazione non disponibile.');
  if (request.payment_hold_batch_id) return publicBookingPaymentHold({ admin, stripe, body, context, request, live, base });
  if (body.operation === 'cancel') throw new Error('Questa prenotazione va gestita con il salone.');
  let terms = checked(await admin.from('booking_payment_terms').select('mode,percent,total_cents,due_cents').eq('request_id', request.id).maybeSingle());
  const revisedRow = checked(await admin.from('appointment_payment_revisions').select('appointment_id').eq('request_id', request.id).eq('workspace_id', context.workspaceId).maybeSingle());
  const revision = revisedRow ? checked(await admin.rpc('appointment_revision_payment_state', {p_appointment: revisedRow.appointment_id})) : null;
  const revisionOnline = !!terms;
  if (revision && request.status === 'accepted') {
    if (revision.refundDueCents > 0 || revision.balanceCents === 0) return {enabled:true,policy:{mode:'full',percent:100},status:revision.refundDueCents>0?'refund_due':'paid',...revision};
    if (!revisionOnline || revision.dueCents < 50) return {enabled:true,policy:{mode:'full',percent:100},status:'salon_balance',...revision};
    terms = {...terms,total_cents:revision.totalCents,due_cents:revision.dueCents};
  }

  if (!terms) return { enabled: true, policy: { mode: 'salon', percent: 0 }, status: 'salon' };
  const result = { enabled: true, policy: { mode: terms.mode, percent: terms.percent }, totalCents: Number(terms.total_cents), dueCents: Number(terms.due_cents) };
  if (request.status !== 'accepted') return { ...result, status: request.status === 'pending' ? 'awaiting_approval' : 'cancelled' };
  if (!terms.due_cents) return { ...result, status: 'paid', paidCents: 0, balanceCents: 0 };
  const appointment = checked(await admin.from('appointments').select('id').eq('booking_request_id', request.id).eq('workspace_id', context.workspaceId).maybeSingle());
  if (!appointment) return { ...result, status: 'preparing' };
  const order = revision ? {upfront_movement_id:revision.onlineMovementId} : checked(await admin.rpc('prepare_booking_payment_ledger', { p_workspace: context.workspaceId, p_appointment: appointment.id }));
  if (!order?.upfront_movement_id) throw new Error('Pagamento non disponibile. Contatta il salone.');
  const movement = checked(await admin.from('cash_movements').select('payment_method').eq('id', order.upfront_movement_id).single());
  const paid = Number(checked(await admin.rpc('booking_payment_paid_cents', { p_request: request.id })));
  const received = Number(checked(await admin.rpc('booking_payment_received_cents', { p_request: request.id })));
  if (movement.payment_method) return { ...result, status: paid < received ? 'refunded' : received >= terms.total_cents ? 'paid' : 'deposit_paid', paidCents: paid, refundedCents: Math.max(0,received-paid), balanceCents: Math.max(0, terms.total_cents - received) };
  let payment = checked(await admin.from('cash_stripe_payments').select('*').eq('movement_id', order.upfront_movement_id).neq('status', 'expired').maybeSingle());
  if (!stripe) throw new Error('Pagamento online temporaneamente non disponibile.');
  if (body.operation === 'checkout') {
    const account = checked(await admin.from('cash_stripe_accounts').select('account_id').eq('workspace_id', context.workspaceId).eq('livemode', live).maybeSingle());
    if (!account) throw new Error('Il salone deve completare il collegamento Stripe.');
    const remote = await stripe.accounts.retrieve(account.account_id);
    if (!remote.charges_enabled || !remote.payouts_enabled) throw new Error('Il salone deve completare l’attivazione Stripe.');
    payment = checked(await admin.rpc('reserve_cash_stripe', { p_workspace: context.workspaceId, p_movement: order.upfront_movement_id, p_live: live }));
  }
  if (payment?.channel === 'terminal') return { ...result, status: 'processing_in_salon', paidCents: paid, balanceCents: terms.total_cents - paid };
  if (payment) {
    let session = payment.session_id ? await stripe.checkout.sessions.retrieve(payment.session_id, { stripeAccount: payment.account_id }) : null;
    if (!session && body.operation === 'checkout') {
      if (Date.now() - Date.parse(payment.created_at) > 20 * 3600000) throw new Error('Pagamento da verificare con il salone prima di riprovare.');
      // Identical parameters and key to the owner cash checkout, including retry from either surface.
      session = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'], line_items: [{ price_data: { currency: 'eur', unit_amount: payment.amount_cents, product_data: { name: 'Servizi del salone' } }, quantity: 1 }], metadata: { salonpro_cash_payment: payment.id }, ...(payment.receipt_email ? { customer_email: payment.receipt_email } : {}), payment_intent_data: { metadata: { salonpro_cash_payment: payment.id }, ...(payment.receipt_email ? { receipt_email: payment.receipt_email } : {}) }, success_url: `${base}?action=booking-return`, cancel_url: `${base}?action=booking-return` }, { stripeAccount: payment.account_id, idempotencyKey: `salonpro-cash-${payment.id}` });
      checked(await admin.from('cash_stripe_payments').update({ session_id: session.id, checkout_url: session.url, status: 'open' }).eq('id', payment.id).eq('status', 'creating'));
    }
    if (session) {
      await reconcile(session, payment.account_id);
      if (session.payment_status === 'paid') {
        const latestPaid = Number(checked(await admin.rpc('booking_payment_paid_cents', { p_request: request.id })));
        const latestReceived = Number(checked(await admin.rpc('booking_payment_received_cents', { p_request: request.id })));
        return { ...result, status: latestPaid < latestReceived ? 'refunded' : latestReceived >= terms.total_cents ? 'paid' : 'deposit_paid', paidCents: latestPaid, refundedCents: Math.max(0,latestReceived-latestPaid), balanceCents: Math.max(0, terms.total_cents - latestReceived) };
      }
      if (session.status === 'open') return { ...result, status: 'open', ...(body.operation === 'checkout' ? {url: `${base}?action=pay&id=${payment.id}`} : {}), paidCents: paid, balanceCents: terms.total_cents - paid };
    }
  }
  return { ...result, status: 'due', paidCents: paid, balanceCents: terms.total_cents - paid };
}
