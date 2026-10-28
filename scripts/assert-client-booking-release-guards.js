const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const journey = fs.readFileSync('components/client-booking-journey.tsx', 'utf8');
const expression = source.match(/const canSendRequest =([\s\S]*?);/)[1];
const valid = {
  currentBookingPaymentHold: null, currentBookingPaymentQuoteReady: true,
  customerRegistrationCanBook: true,
  hasConfirmedBookingDay: true, effectiveWorkspace: {}, isLoadingSalon: false,
  isLivePublicSlotAvailabilityResolvedForCurrentQuery: true,
  bookingRequestSubmitting: false, isRegistered: true, servizio: 'Colore',
  dependencyChoiceSatisfied: true, operatorChoiceSatisfied: true, ora: '10:00',
  selectedSlotHasAuthoritativeAvailability: true, selectedDateAvailability: { closed: false },
  clienteInibito: false, isSelectedTimeWithinMinimumNotice: false,
  exceedsClosingTimeSelection: false, overlapsLunchBreakSelection: false,
  sameDayServiceRepeatBlocked: false, richiestaInConflitto: false,
  exactSlotRequestAlreadyPresent: false,
};
const evaluate = (state) => new Function(...Object.keys(state), `return (${expression});`)(...Object.values(state));
assert.equal(evaluate(valid), true);
for (const key of Object.keys(valid)) {
  const value = valid[key];
  const invalid = typeof value === 'boolean' ? !value : typeof value === 'string' ? '' : key === 'effectiveWorkspace' ? null : { closed: true };
  assert.equal(Boolean(evaluate({ ...valid, [key]: invalid })), false, key);
}
assert.ok(source.includes('canSubmit: canSendRequest'));
assert.ok(source.includes('onSubmit: () => { if (canSendRequest) triggerFrontendBookingSubmit(); }'));
assert.ok(journey.includes('disabled={last ? !props.canSubmit : !current.complete}'));
assert.ok(!source.includes('isPast && !pastDaysReady'));
assert.ok(!source.includes('FRONTEND_SERVICE_ROLE_FILTER_MIN_SERVICES'));
assert.ok(source.includes('onPressIn={Platform.OS === \'android\''));
console.log('Client booking release guards: OK (complete flow + every blocking condition, native/web submit, past days, filters)');
