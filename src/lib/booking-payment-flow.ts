import type { BookingPaymentPolicy } from './booking-payment-policy';

export type BookingPaymentResult = {
  enabled: boolean;
  policy?: BookingPaymentPolicy;
  status?: string;
  bookingStatus?: string;
  totalCents?: number;
  dueCents?: number;
  paidCents?: number;
  refundedCents?: number;
  refundDueCents?: number;
  balanceCents?: number;
  url?: string;
  holdExpiresAt?: string | null;
  groupRequestIds?: string[];
};

export type BookingPaymentQuote = Required<Pick<BookingPaymentResult,
  'enabled' | 'policy' | 'totalCents' | 'dueCents' | 'balanceCents'>>;

export type BookingPaymentNoticeSummary = {
  requestId: string;
  serviceName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  dueCents: number;
  totalCents: number;
  mode: string;
  percent: number;
  status?: string;
  bookingStatus?: string;
  holdExpiresAt?: string | null;
  groupRequestIds?: string[];
  paidCents?: number;
  refundedCents?: number;
  refundDueCents?: number;
};

export function isAllowedBookingPaymentCheckoutUrl(value: string, supabaseBase: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.hostname === 'checkout.stripe.com' && !url.port) return true;
    const expected = new URL(supabaseBase);
    return url.origin === expected.origin && url.pathname === '/functions/v1/cash-stripe' && ['pay', 'booking-pay'].includes(url.searchParams.get('action') ?? '');
  } catch { return false; }
}

export function normalizeBookingPaymentHoldState(value: unknown): 'awaiting_payment' | 'paid' | 'expired' | undefined {
  return value === 'awaiting_payment' || value === 'paid' || value === 'expired' ? value : undefined;
}

export function isUnsubmittedBookingPaymentHold(item: { paymentHoldState?: unknown; payment_hold_state?: unknown }) {
  const state = normalizeBookingPaymentHoldState(item.paymentHoldState ?? item.payment_hold_state);
  return state === 'awaiting_payment' || state === 'expired';
}

export const formatBookingPaymentMoney = (cents: number) =>
  (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export function bookingPaymentNeedsCheckout(result: BookingPaymentResult | null | undefined) {
  return result?.enabled === true && ['payment_required', 'due', 'open'].includes(result.status ?? '');
}

export function bookingPaymentIsSettled(result: BookingPaymentResult | null | undefined) {
  return ['paid', 'deposit_paid', 'refunded', 'cancelled', 'expired', 'paid_conflict'].includes(result?.status ?? '');
}

export function bookingPaymentShouldPoll(result: BookingPaymentResult | null | undefined) {
  // An old unpaid amount without a held slot or open checkout is not an
  // ongoing payment. It is rechecked on focus or an explicit verification.
  if (result?.status === 'due') return !!result.holdExpiresAt;
  return ['payment_required', 'open', 'preparing', 'processing_in_salon', 'payment_processing'].includes(result?.status ?? '');
}

export function bookingPaymentRemainingSeconds(expiresAt?: string | null, now = Date.now()) {
  const expiry = Date.parse(expiresAt ?? '');
  return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 1000)) : null;
}

export function bookingPaymentNoticePresentation(items: BookingPaymentNoticeSummary[], now = Date.now()) {
  const payableItems = items.filter(item => ['payment_required', 'open', 'due'].includes(item.status ?? 'due'));
  const conflicts = items.filter(item => item.status === 'paid_conflict');
  const awaitingPayment = payableItems.some(item => item.status === 'payment_required' || !!item.holdExpiresAt);
  const dueCents = payableItems.reduce((sum, item) => sum + item.dueCents, 0);
  const receivedCents = conflicts.reduce((sum, item) => sum + Math.max(0, item.paidCents ?? item.dueCents - (item.refundedCents ?? 0)), 0);
  const singlePayable = items.length === 1 && payableItems.length === 1 && bookingPaymentRemainingSeconds(items[0].holdExpiresAt, now) !== 0;
  return {
    title: conflicts.length ? 'Pagamento da verificare' : payableItems.length ? 'Da completare' : 'Pagamento in verifica',
    amountText: conflicts.length
      ? dueCents > 0 ? `Da versare ${formatBookingPaymentMoney(dueCents)} · ricevuti da verificare ${formatBookingPaymentMoney(receivedCents)}` : `Ricevuti ${formatBookingPaymentMoney(receivedCents)}`
      : dueCents > 0 ? formatBookingPaymentMoney(dueCents) : 'Verifica in corso',
    description: conflicts.length
      ? payableItems.length ? 'Ci sono pagamenti ricevuti da verificare con il salone. Apri i dettagli prima di procedere.' : 'Pagamento ricevuto, ma l’orario va verificato con il salone. Non pagare di nuovo.'
      : awaitingPayment ? 'Orario riservato temporaneamente. Completa il pagamento per inviare la prenotazione.' : '',
    canCheckoutSingle: singlePayable,
    actionLabel: 'Dettagli',
  };
}

export function bookingPaymentPresentation(result: BookingPaymentResult, now = Date.now()) {
  const money = formatBookingPaymentMoney;
  const pendingApproval = ['pending', 'in attesa'].includes((result.bookingStatus ?? '').toLowerCase());
  const paid = result.status === 'paid' || result.status === 'deposit_paid';
  if (result.status === 'paid_conflict') return {
    title: 'Pagamento ricevuto · orario da verificare',
    description: 'Il pagamento è stato ricevuto, ma l’orario non può essere confermato. Il salone deve verificare la prenotazione o concordare il rimborso. Non pagare di nuovo.',
    detail: `Ricevuti ${money(result.paidCents ?? result.dueCents ?? 0)}.`,
    tone: 'neutral' as const,
  };
  if (paid) return {
    title: result.status === 'deposit_paid' ? 'Acconto ricevuto' : 'Pagamento ricevuto',
    description: pendingApproval
      ? 'Pagamento ricevuto. La richiesta è in attesa dell’approvazione del salone.'
      : result.bookingStatus === 'accepted'
        ? 'Pagamento ricevuto e prenotazione confermata.'
        : 'Pagamento ricevuto. Lo stato della prenotazione viene aggiornato dal salone.',
    detail: result.status === 'deposit_paid'
      ? `Versati ${money(result.paidCents ?? 0)} · saldo in salone ${money(result.balanceCents ?? 0)}.`
      : `Ricevuti ${money(result.paidCents ?? 0)}.`,
    tone: 'success' as const,
  };
  if (result.status === 'expired') return {
    title: 'Tempo per il pagamento scaduto',
    description: 'Il pagamento non è stato completato. L’orario è tornato disponibile: scegli di nuovo un appuntamento.',
    detail: '', tone: 'neutral' as const,
  };
  if (result.status === 'cancelled') return {
    title: result.holdExpiresAt && !((result.paidCents ?? 0) > 0) ? 'Orario liberato' : 'Prenotazione annullata',
    description: result.holdExpiresAt && !((result.paidCents ?? 0) > 0)
      ? 'Il pagamento non è stato completato e la prenotazione non è stata inviata.'
      : 'Questa prenotazione non è attiva. Per eventuali importi già versati, contatta il salone.',
    detail: '', tone: 'neutral' as const,
  };
  if (result.status === 'awaiting_approval') return {
    title: 'In attesa del salone',
    description: 'La richiesta è in attesa dell’approvazione del salone.',
    detail: '', tone: 'neutral' as const,
  };
  if (['payment_processing', 'preparing', 'processing_in_salon'].includes(result.status ?? '')) return {
    title: result.status === 'preparing' ? 'Preparazione del pagamento' : 'Pagamento in verifica',
    description: result.status === 'preparing'
      ? 'Prepariamo il collegamento di pagamento. La prenotazione non è ancora inviata.'
      : result.status === 'processing_in_salon'
        ? 'Il pagamento è in corso al salone.'
        : 'Attendi la conferma del pagamento. Non effettuare un secondo versamento.',
    detail: `Importo: ${money(result.dueCents ?? 0)}.`, tone: 'payment' as const,
  };
  const remaining = bookingPaymentRemainingSeconds(result.holdExpiresAt, now);
  if (result.status === 'payment_required' || result.holdExpiresAt) return {
    title: remaining === 0 ? 'Verifica del pagamento' : 'Completa il pagamento',
    description: remaining === 0
      ? 'Stiamo verificando il pagamento e la disponibilità dell’orario.'
      : 'L’orario è riservato temporaneamente. La prenotazione viene inviata solo dopo il pagamento.',
    detail: `Da versare ${money(result.dueCents ?? 0)}${result.policy?.mode === 'deposit' ? ` · saldo in salone ${money(Math.max(0, (result.totalCents ?? 0) - (result.dueCents ?? 0)))}` : ''}.`,
    tone: 'payment' as const,
  };
  return {
    title: result.status === 'processing_in_salon' || result.status === 'payment_processing'
      ? 'Pagamento in verifica' : 'Pagamento da completare',
    description: result.status === 'preparing'
      ? 'Preparazione del pagamento in corso.'
      : result.status === 'processing_in_salon'
        ? 'Il pagamento è in corso al salone.'
        : result.status === 'payment_processing'
          ? 'Attendi la conferma del pagamento. Non effettuare un secondo versamento.'
          : 'Completa il pagamento previsto dal salone.',
    detail: `Da versare ${money(result.dueCents ?? 0)}${result.policy?.mode === 'deposit' ? ` · saldo in salone ${money(Math.max(0, (result.totalCents ?? 0) - (result.dueCents ?? 0)))}` : ''}.`,
    tone: 'payment' as const,
  };
}
