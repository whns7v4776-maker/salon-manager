import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { bookingPaymentIsSettled, bookingPaymentNeedsCheckout, bookingPaymentNoticePresentation, bookingPaymentPresentation, bookingPaymentRemainingSeconds, bookingPaymentShouldPoll, isUnsubmittedBookingPaymentHold, normalizeBookingPaymentHoldState, isAllowedBookingPaymentCheckoutUrl } from '../src/lib/booking-payment-flow';

async function main() {
const now = Date.parse('2026-10-09T12:00:00Z');
const deposit = { enabled: true, status: 'payment_required', bookingStatus: 'pending', policy: { mode: 'deposit' as const, percent: 50 }, totalCents: 2000, dueCents: 1000, holdExpiresAt: '2026-10-09T12:05:00Z' };
const full = { ...deposit, policy: { mode: 'full' as const, percent: 100 }, dueCents: 2000 };
for (const result of [deposit, full]) {
  const view = bookingPaymentPresentation(result, now);
  assert.match(view.description, /temporaneamente/);
  assert.match(view.description, /solo dopo il pagamento/);
  assert.doesNotMatch(view.description, /è confermata/);
  assert.equal(bookingPaymentNeedsCheckout(result), true);
  assert.equal(bookingPaymentShouldPoll(result), true);
  assert.equal(bookingPaymentIsSettled(result), false);
}
assert.equal(bookingPaymentRemainingSeconds(deposit.holdExpiresAt, now), 5 * 60);
assert.equal(bookingPaymentRemainingSeconds(deposit.holdExpiresAt, now + 5 * 60000), 0);
assert.equal(bookingPaymentRemainingSeconds('invalid', now), null);
assert.equal(bookingPaymentRemainingSeconds(null, now), null);
assert.match(bookingPaymentPresentation(deposit, now + 6 * 60000).description, /verificando/);
assert.doesNotMatch(bookingPaymentPresentation(deposit, now + 6 * 60000).description, /tornato disponibile/);
assert.match(bookingPaymentPresentation({ ...deposit, status: 'expired' }, now).description, /tornato disponibile/);
assert.equal(bookingPaymentIsSettled({ ...deposit, status: 'expired' }), true);
assert.equal(bookingPaymentNeedsCheckout({ ...deposit, status: 'expired' }), false);
assert.match(bookingPaymentPresentation({ ...deposit, status: 'deposit_paid', paidCents: 1000, balanceCents: 1000 }, now).description, /in attesa dell’approvazione/);
assert.doesNotMatch(bookingPaymentPresentation({ ...full, status: 'paid' }, now).description, /confermata/);
assert.match(bookingPaymentPresentation({ ...full, status: 'paid', bookingStatus: 'accepted' }, now).description, /prenotazione confermata/);
assert.match(bookingPaymentPresentation({ ...full, status: 'paid_conflict' }, now).description, /Non pagare di nuovo/);
assert.equal(bookingPaymentNeedsCheckout({ ...full, status: 'paid_conflict' }), false);
assert.equal(bookingPaymentIsSettled({ ...full, status: 'paid_conflict' }), true);
assert.match(bookingPaymentPresentation({ ...full, status: 'payment_processing', holdExpiresAt: null }, now).description, /Non effettuare un secondo/);
assert.equal(normalizeBookingPaymentHoldState('awaiting_payment'), 'awaiting_payment');
assert.equal(normalizeBookingPaymentHoldState('paid'), 'paid');
assert.equal(normalizeBookingPaymentHoldState('expired'), 'expired');
assert.equal(normalizeBookingPaymentHoldState('accepted'), undefined);
assert.equal(isUnsubmittedBookingPaymentHold({ paymentHoldState: 'awaiting_payment' }), true);
assert.equal(isUnsubmittedBookingPaymentHold({ payment_hold_state: 'expired' }), true);
assert.equal(isUnsubmittedBookingPaymentHold({ paymentHoldState: 'paid' }), false);
assert.equal(isUnsubmittedBookingPaymentHold({}), false);

const noticeBase = { requestId: 'fixture', serviceName: 'Fixture', dueCents: 1000, totalCents: 2000, mode: 'deposit', percent: 50 };
const conflictNotice = { ...noticeBase, status: 'paid_conflict', paidCents: 800, refundedCents: 200, holdExpiresAt: deposit.holdExpiresAt };
const conflictView = bookingPaymentNoticePresentation([conflictNotice], now);
assert.equal(conflictView.title, 'Pagamento da verificare');
assert.equal(conflictView.actionLabel, 'Dettagli');
assert.equal(conflictView.canCheckoutSingle, false);
assert.match(conflictView.amountText, /8,00/);
assert.doesNotMatch(conflictView.amountText, /Da versare/);
assert.match(conflictView.description, /Non pagare di nuovo/);
const mixedView = bookingPaymentNoticePresentation([conflictNotice, { ...noticeBase, status: 'payment_required', holdExpiresAt: deposit.holdExpiresAt }], now);
assert.match(mixedView.amountText, /Da versare 10,00/);
assert.match(mixedView.amountText, /8,00/);
assert.equal(mixedView.actionLabel, 'Dettagli');
assert.equal(mixedView.canCheckoutSingle, false);
const legacyView = bookingPaymentNoticePresentation([{ ...noticeBase, status: 'due', bookingStatus: 'accepted' }], now);
assert.equal(legacyView.title, 'Da completare');
assert.equal(legacyView.actionLabel, 'Dettagli');
assert.equal(legacyView.canCheckoutSingle, true);
assert.doesNotMatch(legacyView.description, /confermata|riservato/);
assert.equal(bookingPaymentNoticePresentation([{ ...noticeBase, status: 'open', holdExpiresAt: deposit.holdExpiresAt }], now + 6 * 60000).canCheckoutSingle, false);
assert.equal(isAllowedBookingPaymentCheckoutUrl('https://checkout.stripe.com/c/pay/fixture', 'https://fixture.supabase.invalid'), true);
assert.equal(isAllowedBookingPaymentCheckoutUrl('https://fixture.supabase.invalid/functions/v1/cash-stripe?action=pay&id=fixture', 'https://fixture.supabase.invalid'), true);
assert.equal(isAllowedBookingPaymentCheckoutUrl('https://fixture.supabase.invalid/functions/v1/cash-stripe?action=booking-pay&hold=00000000-0000-4000-8000-000000000001', 'https://fixture.supabase.invalid'), true);
assert.equal(isAllowedBookingPaymentCheckoutUrl('https://fixture.supabase.invalid/functions/v1/cash-stripe?action=other', 'https://fixture.supabase.invalid'), false);

// Execute the production Checkout handoff with controlled network/platform dependencies.
const source = readFileSync('components/client-booking-payment.tsx', 'utf8');
const parsed = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'beginBookingPaymentCheckout');
assert.ok(node, 'production checkout controller missing');
const compiled = ts.transpileModule(node!.getText(parsed).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function controller(platform: 'web' | 'ios', response: unknown, calls: unknown[]) {
  return new Function('call', 'Platform', 'window', 'Linking', 'bookingPaymentIsSettled', 'isAllowedBookingPaymentCheckoutUrl', 'supabaseUrl', `${compiled};return beginBookingPaymentCheckout;`)(
    async (...args: unknown[]) => { calls.push(args); return response; },
    { OS: platform }, { location: { assign: (url: string) => calls.push(['web-open', url]) } },
    { openURL: async (url: string) => { calls.push(['native-open', url]); } }, bookingPaymentIsSettled, isAllowedBookingPaymentCheckoutUrl, 'https://fixture.supabase.invalid',
  ) as (identity: unknown, requestId: string, options?: { canOpen?: () => boolean }) => Promise<unknown>;
}
const identity = { salonCode: 'fixture', email: 'fixture@example.invalid', phone: '0000000000' };
for (const platform of ['web', 'ios'] as const) {
  const calls: unknown[] = [];
  const response = { ...deposit, status: 'open', url: 'https://fixture.supabase.invalid/functions/v1/cash-stripe?action=booking-pay&hold=00000000-0000-4000-8000-000000000001' };
  assert.deepEqual(await controller(platform, response, calls)(identity, 'request-fixture'), response);
  assert.deepEqual(calls[0], [identity, 'checkout', 'request-fixture']);
  assert.equal((calls[1] as string[])[0], platform === 'web' ? 'web-open' : 'native-open');
  const switched: unknown[] = [];
  await controller(platform, response, switched)(identity, 'request-fixture', { canOpen: () => false });
  assert.equal(switched.length, 1, 'stale identity must not navigate to old checkout');
  for (const url of ['http://payments.example.invalid/', 'javascript:alert(1)', 'https://user:pass@payments.example.invalid/', 'not-a-url', 'https://evil.example.invalid/', 'https://fixture.supabase.invalid/not-payment', 'https://checkout.stripe.com.evil.example.invalid/']) {
    const unsafe: unknown[] = [];
    await assert.rejects(controller(platform, { ...response, url }, unsafe)(identity, 'request-fixture'));
    assert.equal(unsafe.length, 1, 'unsafe checkout URL was opened');
  }
  await assert.rejects(controller(platform, deposit, [])(identity, 'request-fixture'), /Non riusciamo ad aprire/);
  for (const status of ['paid', 'deposit_paid', 'paid_conflict', 'awaiting_approval', 'payment_processing', 'expired', 'cancelled']) {
    const settled: unknown[] = [];
    await controller(platform, { ...deposit, status }, settled)(identity, 'request-fixture');
    assert.equal(settled.length, 1, `${status} must not reopen checkout`);
  }
}
assert.doesNotMatch(source, /La tua prenotazione è confermata\./);
assert.doesNotMatch(source, /dopo la conferma del salone/);
console.log('Upfront payment flow: deposit/full, verified status, expiry, cancellation-safe states, web/iOS checkout handoff and stale identity checks passed.');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
