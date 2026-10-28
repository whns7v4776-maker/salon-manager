import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildCustomerRegistrationIdentityKey,
  buildCustomerRegistrationRemovalNotice,
  getCustomerRegistrationStatusForIdentity,
  isCustomerRegistrationPendingError,
  normalizeCustomerRegistrationStatus,
  parseCustomerRegistrationAccess,
} from '../src/lib/customer-registration-access';

const first = buildCustomerRegistrationIdentityKey({ salonCode: ' First ', email: ' A@TEST.IT ', phone: '+39 333 123 4567' });
const second = buildCustomerRegistrationIdentityKey({ salonCode: 'Second', email: 'a@test.it', phone: '3331234567' });
assert.equal(first, 'first|a@test.it|3331234567');
assert.notEqual(first, second, 'Salon approval is isolated per salon.');
assert.equal(normalizeCustomerRegistrationStatus(undefined), 'approved', 'Legacy customers remain enabled.');
const pending = parseCustomerRegistrationAccess({ found: true, registrationStatus: 'pending' }, first);
assert.equal(getCustomerRegistrationStatusForIdentity({ identityKey: first, authority: pending }), 'pending');
assert.equal(getCustomerRegistrationStatusForIdentity({ identityKey: second, authority: pending }), 'approved', 'A stale response cannot block another salon.');
const approved = parseCustomerRegistrationAccess({ found: true, registration_status: 'approved' }, first);
assert.equal(getCustomerRegistrationStatusForIdentity({ identityKey: first, authority: approved, fallbackStatus: 'pending' }), 'approved', 'Fresh approval takes precedence over a cached pending profile.');
assert.equal(parseCustomerRegistrationAccess({ found: false }, first)?.status, 'removed');
assert.equal(parseCustomerRegistrationAccess(null, first), null);
assert.equal(parseCustomerRegistrationAccess({}, first), null);
assert.equal(parseCustomerRegistrationAccess({ found: true }, first), null, 'Incomplete responses cannot enable pending customers.');
assert.equal(isCustomerRegistrationPendingError({ error: 'save_failed', detail: 'customer_registration_pending' }), true);
assert.equal(isCustomerRegistrationPendingError({ message: 'customer_registration_pending' }), true);
assert.equal(isCustomerRegistrationPendingError({ message: 'slot_unavailable' }), false);
assert.equal(buildCustomerRegistrationRemovalNotice('pending').title, 'Registrazione non approvata');
assert.equal(buildCustomerRegistrationRemovalNotice('approved').title, 'Account non più attivo');
assert.doesNotMatch(buildCustomerRegistrationRemovalNotice('approved').message, /non ha approvato/);

// Exercise the real screen's submit eligibility expression with otherwise valid
// day, service, operator and authoritative slot proof. Approval must add a gate
// without weakening the existing availability and customer restriction checks.
const source = readFileSync('app/cliente-screen.tsx', 'utf8');
const expression = source.match(/const canSendRequest =\s*([\s\S]*?);\s*const bookingSubmitBlockedReason/);
assert.ok(expression, 'The booking eligibility expression must remain testable.');
const quoteReadyExpression = source.match(/const currentBookingPaymentQuoteReady =\s*([^;]+);/);
assert.ok(quoteReadyExpression, 'Payment quote eligibility must remain scoped to the current customer and salon.');
const validSelection = {
  currentBookingPaymentHold: null as { requestId: string } | null,
  bookingPaymentQuoteReady: true,
  bookingPaymentIdentityKey: first,
  bookingPaymentQuoteIdentityKey: first,
  hasConfirmedBookingDay: true,
  effectiveWorkspace: { salonCode: 'first' },
  isLoadingSalon: false,
  isLivePublicSlotAvailabilityResolvedForCurrentQuery: true,
  bookingRequestSubmitting: false,
  isRegistered: true,
  customerRegistrationCanBook: true,
  servizio: 'Taglio',
  dependencyChoiceSatisfied: true,
  operatorChoiceSatisfied: true,
  ora: '10:00',
  selectedSlotHasAuthoritativeAvailability: true,
  selectedDateAvailability: { closed: false },
  clienteInibito: false,
  isSelectedTimeWithinMinimumNotice: false,
  exceedsClosingTimeSelection: false,
  overlapsLunchBreakSelection: false,
  sameDayServiceRepeatBlocked: false,
  richiestaInConflitto: false,
  exactSlotRequestAlreadyPresent: false,
};
const canSubmit = (changes: Partial<typeof validSelection>) => {
  const bindings = { ...validSelection, ...changes };
  const currentBookingPaymentQuoteReady = runInNewContext(quoteReadyExpression[1], bindings);
  return runInNewContext(expression[1], { ...bindings, currentBookingPaymentQuoteReady });
};
assert.equal(canSubmit({}), true, 'Approved customers can continue booking.');
assert.equal(canSubmit({ customerRegistrationCanBook: false }), false, 'Pending or removed customers cannot submit, even with a green slot.');
for (const bookingPaymentQuoteReady of [false, true]) {
  for (const bookingPaymentQuoteIdentityKey of [first, second, '']) {
    assert.equal(canSubmit({ customerRegistrationCanBook: false, bookingPaymentQuoteReady, bookingPaymentQuoteIdentityKey }), false, 'Payment quote readiness cannot enable an unapproved customer.');
  }
}
assert.equal(canSubmit({ bookingPaymentQuoteIdentityKey: second }), false, 'Approved customers cannot use a payment quote belonging to another salon.');
assert.equal(canSubmit({ bookingPaymentIdentityKey: second }), false, 'A customer or salon change invalidates the previous ready quote.');
assert.equal(canSubmit({ bookingPaymentQuoteIdentityKey: '' }), false, 'A quote without identity proof cannot enable submission.');
assert.equal(canSubmit({ currentBookingPaymentHold: { requestId: 'existing-hold' } }), false, 'Approved admission cannot bypass an existing payment reservation.');
assert.equal(canSubmit({ bookingPaymentQuoteReady: false }), false, 'Approved admission cannot bypass unverified payment terms.');
assert.equal(canSubmit({ selectedSlotHasAuthoritativeAvailability: false }), false);
assert.equal(canSubmit({ clienteInibito: true }), false);
assert.equal(canSubmit({ overlapsLunchBreakSelection: true }), false);
assert.equal(canSubmit({ dependencyChoiceSatisfied: false }), false);
assert.equal(canSubmit({ isRegistered: false }), false);
console.log('Customer registration access assertions passed.');
