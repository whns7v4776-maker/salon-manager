import assert from 'node:assert/strict';
import { bookingPaymentErrorMessage, bookingPaymentReturnPage, expireOrReconcileBookingHold, publicBookingPaymentHold, reconcileBookingPaymentHold, sweepBookingPaymentHolds } from '../supabase/functions/_shared/booking-payment-hold';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
function fixture(mode = 'deposit') {
  const batch: any = { id, workspace_id: 'workspace', customer_id: 'customer', state: 'awaiting_payment',
    request_ids: [requestId, '33333333-3333-4333-8333-333333333333'], total_cents: 4000, due_cents: mode === 'full' ? 4000 : 2000,
    mode, percent: mode === 'full' ? 100 : 50, expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
    checkout_expires_at: new Date(Date.now() + 36 * 60000).toISOString(), account_id: 'acct_fixture',
    created_at: new Date().toISOString(), livemode: false, currency: 'eur', session_id: null, checkout_url: null, receipt_email: 'test@example.invalid' };
  const calls: any[] = [];
  let requestStatus = 'pending';
  const admin: any = {
    from(table: string) {
      const q: any = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ error: null,
        data: table === 'booking_payment_hold_batches' ? { ...batch } : table === 'cash_stripe_accounts' ? { account_id: 'acct_fixture' } : { status: requestStatus } }) };
      return q;
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === 'settle_booking_payment_hold_v1') { batch.state = 'paid'; requestStatus = 'accepted'; }
      if (name === 'expire_booking_payment_hold_v1') batch.state = 'expired';
      if (name === 'cancel_unstarted_booking_payment_hold_v1' || name === 'release_unattached_booking_payment_hold_v1') batch.state = 'expired';
      if (name === 'attach_booking_payment_hold_checkout_v1') { batch.session_id = args.p_session; batch.checkout_url = args.p_url; }
      return { data: { ...batch }, error: null };
    },
  };
  const sessions = new Map<string, any>();
  const stripe: any = { accounts: { retrieve: async () => ({ charges_enabled: true, payouts_enabled: true }) }, checkout: { sessions: {
    async create(params: any, options: any) {
      calls.push({ name: 'stripe.create', params, options });
      const key = options.idempotencyKey;
      if (!sessions.has(key)) sessions.set(key, { id: 'cs_fixture', url: 'https://checkout.stripe.com/c/pay/fixture',
        status: 'open', payment_status: 'unpaid', payment_intent: 'pi_fixture', amount_total: params.line_items[0].price_data.unit_amount,
        currency: 'eur', livemode: false, metadata: params.metadata });
      return { ...sessions.get(key) };
    },
    async retrieve() { return { ...sessions.values().next().value }; },
    async list() { return { data: [...sessions.values()], has_more: false }; },
    async expire() { const session = sessions.values().next().value; session.status = 'expired'; return { ...session }; },
  } } };
  const invoke = (operation = 'checkout') => publicBookingPaymentHold({ admin, stripe, body: { operation },
    context: { workspaceId: 'workspace', customerId: 'customer' }, request: { id: requestId, payment_hold_batch_id: id }, live: false, base: 'https://fixture.invalid/cash-stripe' });
  const session = () => sessions.values().next().value;
  return { batch, calls, admin, stripe, invoke, session, sessions, setRequestStatus(value: string) { requestStatus = value; } };
}

async function main() {
let cases = 0;
assert.equal(bookingPaymentErrorMessage(new Error('Verifica la password per accedere ai pagamenti.')), 'Verifica la password per accedere ai pagamenti.');
assert(!bookingPaymentErrorMessage(new Error('cannot execute SELECT FOR KEY SHARE in a read-only transaction')).includes('SELECT'));
assert(!bookingPaymentErrorMessage(new Error('booking_payment_session_mismatch')).includes('booking_payment'));
assert(bookingPaymentErrorMessage(new Error('booking_payment_hold_expired')).includes('scaduto'));
cases += 4;
for (const mode of ['deposit', 'full']) {
  const f = fixture(mode);
  const result = await f.invoke();
  assert.equal(result.status, 'open');
  assert.equal(result.bookingStatus, 'pending');
  assert.equal(f.calls.filter(c => c.name.startsWith('settle')).length, 0, 'Opening Checkout never confirms the booking');
  assert.equal(f.calls.find(c => c.name === 'stripe.create').params.line_items.length, 1);
  assert.equal(result.dueCents, mode === 'full' ? 4000 : 2000, 'One payment covers the complete batch');
  assert.deepEqual(result.groupRequestIds, f.batch.request_ids);
  assert(Date.parse(result.holdExpiresAt) <= Date.now() + 5 * 60000);
  assert(f.calls.find(c => c.name === 'stripe.create').params.expires_at > Date.now() / 1000 + 30 * 60,
    'Five-minute capacity deadline is independent of Stripe minimum session expiry');
  f.session().payment_status = 'paid';
  const settled = await f.invoke('check');
  assert.equal(settled.status, mode === 'full' ? 'paid' : 'deposit_paid');
  assert.equal(settled.bookingStatus, 'accepted');
  assert.equal(settled.balanceCents, mode === 'full' ? 0 : 2000);
  const settle = f.calls.find(c => c.name === 'settle_booking_payment_hold_v1');
  assert.equal(settle.args.p_amount, result.dueCents);
  assert.equal(settle.args.p_intent, 'pi_fixture');
  cases += 2;
}
{
  const f = fixture();
  const [a, b] = await Promise.all([f.invoke(), f.invoke()]);
  assert.equal(a.url, b.url);
  assert.equal(f.sessions.size, 1, 'Concurrent retry retains one Checkout attempt');
  const creates = f.calls.filter(c => c.name === 'stripe.create');
  if (creates.length === 2) assert.deepEqual(creates[0], creates[1], 'The timestamp, amounts and idempotency key are identical');
  cases++;
}
for (const mismatch of ['account', 'livemode', 'amount', 'currency', 'session']) {
  const f = fixture(); await f.invoke();
  const session = { ...f.session(), payment_status: 'paid' };
  const account = mismatch === 'account' ? 'acct_other' : 'acct_fixture';
  if (mismatch === 'livemode') session.livemode = true;
  if (mismatch === 'amount') session.amount_total = 1;
  if (mismatch === 'currency') session.currency = 'usd';
  if (mismatch === 'session') session.id = 'cs_other';
  await assert.rejects(reconcileBookingPaymentHold({ admin: f.admin, session, account, live: false }), /mismatch/);
  assert.equal(f.batch.state, 'awaiting_payment'); cases++;
}
{
  const f = fixture(); await f.invoke();
  f.session().status = 'complete';
  const result = await f.invoke('check');
  assert.equal(result.status, 'payment_processing');
  assert.equal(f.batch.state, 'awaiting_payment', 'Unpaid completion is not payment proof'); cases++;
}
{
  const f = fixture(); await f.invoke();
  f.stripe.checkout.sessions.expire = async () => { f.session().payment_status = 'paid'; f.session().status = 'complete'; throw Error('already_complete'); };
  const result = await f.invoke('cancel');
  assert.equal(result.status, 'deposit_paid', 'Completion that wins the cancellation race is reconciled as paid');
  assert.equal(f.calls.filter(c => c.name === 'expire_booking_payment_hold_v1').length, 0); cases++;
}
{
  const f = fixture(); await f.invoke();
  const result = await f.invoke('cancel');
  assert.equal(result.status, 'expired');
  assert.equal(f.calls.filter(c => c.name === 'settle_booking_payment_hold_v1').length, 0);
  const repeated = await f.invoke(); assert.equal(repeated.status, 'expired');
  assert.equal(f.calls.filter(c => c.name === 'stripe.create').length, 1, 'An expired hold never creates another payment'); cases++;
}
{
  const f = fixture(); await f.invoke();
  f.stripe.checkout.sessions.retrieve = async () => { throw Error('network'); };
  await assert.rejects(expireOrReconcileBookingHold({ admin: f.admin, stripe: f.stripe, batch: f.batch, live: false }), /network/);
  assert.equal(f.batch.state, 'awaiting_payment', 'Unknown remote state keeps capacity reserved'); cases++;
}
{
  const f = fixture(); f.batch.state = 'paid'; f.setRequestStatus('pending');
  const result = await f.invoke('check');
  assert.equal(result.status, 'deposit_paid'); assert.equal(result.bookingStatus, 'pending'); assert.equal(result.paidCents, 2000); cases++;
}
for (const bookingStatus of ['rejected', 'cancelled']) {
  const f = fixture(); f.batch.state = 'paid'; f.setRequestStatus(bookingStatus);
  const result = await f.invoke('checkout');
  assert.equal(result.status, 'cancelled'); assert.equal(result.paidCents, 2000);
  assert.equal(result.url, undefined, 'A paid, cancelled booking must not ask for another payment'); cases++;
}
{
  const f = fixture(); await f.invoke();
  f.batch.expires_at = new Date(Date.now() - 1000).toISOString();
  const result = await f.invoke('check');
  assert.equal(result.status, 'expired', 'Five-minute deadline expires open Checkout before releasing capacity');
  assert.equal(f.session().status, 'expired'); cases++;
}
{
  const f = fixture(); f.batch.account_id = null; f.batch.livemode = null;
  f.batch.expires_at = new Date(Date.now() - 1000).toISOString();
  await f.invoke('check');
  const expiration = f.calls.find(c => c.name === 'expire_booking_payment_hold_v1');
  assert.equal(expiration.args.p_account, null); assert.equal(expiration.args.p_live, null); cases++;
}
{
  const f = fixture(); await f.invoke(); f.batch.session_id = null;
  const result = await f.invoke('cancel');
  assert.equal(result.status, 'expired', 'Recover a remotely-created, unattached session before cancellation');
  assert.equal(f.session().status, 'expired'); cases++;
}
{
  const f = fixture(); f.batch.expires_at = new Date(Date.now() - 120000).toISOString();
  const result = await f.invoke('check');
  assert.equal(result.status, 'expired');
  assert(f.calls.some(c => c.name === 'release_unattached_booking_payment_hold_v1')); cases++;
}
{
  const f = fixture(); f.batch.expires_at = new Date(Date.now() - 120000).toISOString();
  f.stripe.checkout.sessions.list = async () => ({ data: [{ id: 'cs_other', metadata: {} }], has_more: true });
  await assert.rejects(f.invoke('check'), /ancora in verifica/);
  assert.equal(f.batch.state, 'awaiting_payment', 'A truncated Stripe list never releases uncertain capacity'); cases++;
}
{
  const f = fixture();
  f.admin.rpc = async (name: string) => name === 'attach_booking_payment_hold_checkout_v1' ? { data: null, error: { message: 'cancelled concurrently' } } : { data: { ...f.batch }, error: null };
  await assert.rejects(f.invoke(), /cancelled concurrently/);
  assert.equal(f.session().status, 'expired', 'Failure to attach cannot leave a payable orphan'); cases++;
}
{
  const f = fixture();
  await assert.rejects(publicBookingPaymentHold({ admin: f.admin, stripe: f.stripe, body: { operation: 'checkout' },
    context: { workspaceId: 'workspace', customerId: 'another customer' }, request: { id: requestId, payment_hold_batch_id: id }, live: false, base: 'https://fixture.invalid' }), /non disponibile/); cases++;
}
{
  const slow = { ...fixture().batch, session_id: 'cs_slow' };
  const fast = { ...fixture().batch, id: '44444444-4444-4444-8444-444444444444', session_id: 'cs_fast' };
  const batches = [slow, fast];
  let unblock!: () => void;
  const blocked = new Promise<void>(resolve => { unblock = resolve; });
  const admin: any = {
    from() { let selected = ''; const q: any = { select() { return q; }, eq(_: string, value: string) { selected = value; return q; },
      maybeSingle: async () => ({ data: { ...batches.find(b => b.id === selected) }, error: null }) }; return q; },
    async rpc(name: string, args: any) {
      if (name === 'claim_due_booking_payment_holds_v1') { assert.equal(args.p_limit, 20); return { data: batches, error: null }; }
      const batch = batches.find(b => b.id === args.p_batch)!; batch.state = 'expired';
      return { data: { ...batch }, error: null };
    },
  };
  const stripe: any = { checkout: { sessions: {
    async retrieve(sessionId: string) {
      if (sessionId === 'cs_slow') { await blocked; throw new Error('Provider unreachable'); }
      return { id: 'cs_fast', status: 'open', payment_status: 'unpaid', amount_total: fast.due_cents,
        currency: 'eur', livemode: false, metadata: { salonpro_booking_hold: fast.id } };
    },
    async expire() { return { id: 'cs_fast', status: 'expired', payment_status: 'unpaid', amount_total: fast.due_cents,
      currency: 'eur', livemode: false, metadata: { salonpro_booking_hold: fast.id } }; },
  } } };
  const run = sweepBookingPaymentHolds({ admin, stripe, live: false });
  for (let turn = 0; turn < 30 && fast.state !== 'expired'; turn++) await Promise.resolve();
  assert.equal(fast.state, 'expired', 'One unreachable account cannot delay another salon’s expiry');
  assert.equal(slow.state, 'awaiting_payment', 'Unverified capacity stays reserved');
  unblock(); assert.equal((await run).checked, 1); cases++;
}
for (const state of ['checking', 'expired', 'paid_conflict', 'paid']) {
  const page = bookingPaymentReturnPage({ state, salonCode: '\"><script>attack</script>', cancelled: false });
  const body = await page.text(); assert(!body.includes('<script>attack</script>'));
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert(body.includes('Torna nell’app')); assert(body.includes('Continua sul web'));
  if (state !== 'paid') assert(!body.includes('La tua prenotazione è confermata')); cases++;
}
console.log(`Booking payment Edge: ${cases} scenarios passed; Stripe transport is simulated, no money moved.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
