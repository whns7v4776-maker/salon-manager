export type BookingPaymentMode = 'salon' | 'full' | 'deposit';
export type BookingPaymentPolicy = { mode: BookingPaymentMode; percent: number };
export type CustomerBookingPaymentMode = BookingPaymentMode | 'inherit';
export const DEFAULT_BOOKING_PAYMENT_POLICY: BookingPaymentPolicy = { mode: 'salon', percent: 0 };

export function validateBookingPaymentPolicy(mode: string, percent: number): BookingPaymentPolicy {
  if (mode === 'salon') return { mode, percent: 0 };
  if (mode === 'full') return { mode, percent: 100 };
  if (mode !== 'deposit' || !Number.isInteger(percent) || percent < 1 || percent > 99) {
    throw new Error('Scegli una percentuale intera tra 1 e 99.');
  }
  return { mode, percent };
}

export function bookingPaymentAmounts(totalCents: number, policy: BookingPaymentPolicy) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 99999999) {
    throw new Error('Importo della prenotazione non valido.');
  }
  const validated = validateBookingPaymentPolicy(policy.mode, policy.percent);
  const dueCents = Math.round(totalCents * validated.percent / 100);
  return { totalCents, dueCents, balanceCents: totalCents - dueCents };
}

export function bookingPaymentLabel(policy: BookingPaymentPolicy) {
  if (policy.mode === 'full') return 'Pagamento completo';
  if (policy.mode === 'deposit') return `Acconto del ${policy.percent}%`;
  return 'Paga in salone';
}
