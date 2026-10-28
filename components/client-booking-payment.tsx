import { useAccessAppearance } from './access-premium';
import { customerPortalStyles } from './customer-portal-styles';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { authenticateCustomerPayment, customerPaymentAccessError, isCustomerPaymentAuthenticationError, subscribeCustomerPaymentSession, withCustomerPaymentToken } from '../src/lib/client-payment-session';
import { Ionicons } from '@expo/vector-icons';
import { publicSupabase, supabaseUrl } from '../src/lib/supabase';
import { bookingPaymentAmounts, bookingPaymentLabel, type BookingPaymentPolicy } from '../src/lib/booking-payment-policy';
import { bookingPaymentIsSettled, bookingPaymentNeedsCheckout, bookingPaymentNoticePresentation, bookingPaymentPresentation, bookingPaymentRemainingSeconds, bookingPaymentShouldPoll, formatBookingPaymentMoney, isAllowedBookingPaymentCheckoutUrl, type BookingPaymentNoticeSummary, type BookingPaymentQuote, type BookingPaymentResult } from '../src/lib/booking-payment-flow';
import { HapticTouchable } from './ui/haptic-touchable';
export type { BookingPaymentQuote, BookingPaymentResult } from '../src/lib/booking-payment-flow';
const paymentRefreshListeners = new Set<() => void>();
export function refreshBookingPaymentNotices() { paymentRefreshListeners.forEach(listener => listener()); }
type Identity = { salonCode: string; email: string; phone: string };
type PaymentNotice = BookingPaymentNoticeSummary;
type Result = BookingPaymentResult & { items?: PaymentNotice[] };
const money = formatBookingPaymentMoney;
async function call(identity: Identity, operation: string, requestId?: string): Promise<Result> {
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error('La verifica del pagamento non ha risposto. Riprova per controllare lo stato prima di pagare di nuovo.'), { code: 'unavailable' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ensureActive = () => { if (controller.signal.aborted) throw timeoutError; };
  try {
    return await Promise.race([
      new Promise<never>((_resolve, reject) => {
        // Cover token/storage waits as well as the network request. A late token
        // must not start a checkout after the caller has already timed out.
        timer = setTimeout(() => { controller.abort(); reject(timeoutError); }, 30000);
      }),
      withCustomerPaymentToken(identity, async paymentToken => {
        ensureActive();
        // This endpoint authenticates the customer payment token itself. It must
        // not wait for the independent salon session or inherit its bearer token.
        const { data, error } = await publicSupabase.functions.invoke('cash-stripe?action=booking', { body: { ...identity, operation, requestId, paymentToken }, signal: controller.signal, timeout: 30000 });
        ensureActive();
        let failure = data;
        if (error && 'context' in error) { try { failure = await error.context.json(); } catch {} }
        ensureActive();
        if (error || failure?.error) {
          const paymentError = Object.assign(new Error(failure?.error || 'Verifica del pagamento non disponibile. Riprova.'), {
            code: failure?.code ?? failure?.errorCode,
            status: error && 'context' in error ? error.context?.status : undefined,
          });
          throw customerPaymentAccessError(paymentError, 'Verifica del pagamento non disponibile. Riprova.');
        }
        return data;
      }, { allowUnauthenticated: operation === 'quote' && !requestId }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export async function checkBookingPayment(identity: Identity, requestId: string): Promise<BookingPaymentResult> {
  return call(identity, 'check', requestId);
}

/** A returned browser URL does not confirm either the payment or the booking. */
export async function beginBookingPaymentCheckout(identity: Identity, requestId: string, options?: { canOpen?: () => boolean }): Promise<BookingPaymentResult> {
  const result = await call(identity, 'checkout', requestId);
  if (options?.canOpen && !options.canOpen()) return result;
  if (result.url) {
    let checkoutUrl: URL;
    try { checkoutUrl = new URL(result.url); }
    catch { throw new Error('Il collegamento di pagamento non è disponibile. Riprova.'); }
    if (!isAllowedBookingPaymentCheckoutUrl(checkoutUrl.toString(), supabaseUrl)) {
      throw new Error('Il collegamento di pagamento non è disponibile. Riprova.');
    }
    if (Platform.OS === 'web') window.location.assign(checkoutUrl.toString());
    else await Linking.openURL(checkoutUrl.toString());
    return result;
  }
  if (!bookingPaymentIsSettled(result) && !['preparing', 'payment_processing', 'awaiting_approval', 'processing_in_salon'].includes(result.status ?? '')) {
    throw new Error('Non riusciamo ad aprire il pagamento. L’orario resta riservato solo fino alla scadenza indicata: riprova.');
  }
  return result;
}

function PaymentVerification({ identity, onVerified, onAccessRecovery, onVerificationStarted, onVerificationFinished }: { identity: Identity; onVerified: () => void; onAccessRecovery?: () => void; onVerificationStarted?: () => void; onVerificationFinished?: () => void }) {
  const { palette: p } = useAccessAppearance();
  const styles = React.useMemo(() => customerPortalStyles(customerBaseStyles, p), [p]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const verifying = useRef(false);
  useEffect(() => {
    generation.current++; verifying.current = false; setPassword(''); setError(''); setBusy(false);
    return () => {
      generation.current++;
      if (verifying.current) onVerificationFinished?.();
      verifying.current = false;
    };
  }, [identity.salonCode, identity.email, identity.phone]);
  return <View style={{ gap: 8 }}>
    <Text style={styles.text}>Per proteggere il pagamento, conferma l’accesso al tuo account. La prenotazione riprenderà da qui.</Text>
    <TextInput accessibilityLabel="Password per verificare i pagamenti" placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} style={{ backgroundColor: p.field, borderRadius: 12, padding: 12 }} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <HapticTouchable accessibilityRole="button" disabled={busy || !password} style={styles.button} onPress={async () => {
      if (verifying.current || !password) return;
      const current = generation.current;
      verifying.current = true;
      onVerificationStarted?.();
      setBusy(true); setError('');
      try {
        await authenticateCustomerPayment(identity, password);
        if (current !== generation.current) return;
        setPassword(''); onVerified(); refreshBookingPaymentNotices();
      }
      catch (e) {
        if (current !== generation.current) return;
        const failure = customerPaymentAccessError(e);
        setError(isCustomerPaymentAuthenticationError(failure)
          ? 'Password non verificata. Riprova oppure imposta o recupera la password.'
          : 'Non riusciamo a verificare l’accesso. Controlla la connessione e riprova.');
      }
      finally { if (current === generation.current) { verifying.current = false; setBusy(false); onVerificationFinished?.(); } }
    }}><Text style={styles.buttonText}>{busy ? 'Verifica…' : 'Conferma accesso'}</Text></HapticTouchable>
    {onAccessRecovery ? <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.verifyButton} onPress={onAccessRecovery}>
      <Text style={styles.verifyButtonText}>Imposta o recupera la password</Text>
    </HapticTouchable> : <Text style={styles.note}>Se non hai una password, puoi impostarla dal recupero nella schermata di accesso.</Text>}
  </View>;
}

function SalonPaymentSummary({ description, title = "Paga in salone", included = false, compactEntry = false }: { description: string; title?: string; included?: boolean; compactEntry?: boolean }) {
  const { palette: p } = useAccessAppearance();
  const styles = React.useMemo(() => customerPortalStyles(customerBaseStyles, p), [p]);
  const color = p.ink;
  const compactIncluded = Platform.OS === 'web' && included;
  if (compactEntry) return <View style={{minHeight:51,paddingVertical:13,flexDirection:'row',alignItems:'center',gap:11}}><Ionicons name={included ? 'checkmark-circle-outline' : 'card-outline'} size={19} color={p.muted}/><View style={{flex:1,gap:4}}><Text style={{color:p.ink,fontSize:12,lineHeight:19}}>{title === 'Paga in salone' ? 'Pagamento in salone' : title}</Text>{description !== 'Pagherai direttamente al salone.' ? <Text style={{color:p.muted,fontSize:11,lineHeight:17}}>{description}</Text> : null}</View></View>;
  return <View style={[styles.salonSummary, compactIncluded && styles.salonSummaryCompact, !included && { backgroundColor: p.field, borderColor: p.border }]}>
    <View style={[styles.salonHeading, compactIncluded && { gap: 8 }]}>
      <View style={[styles.salonIcon, compactIncluded && styles.salonIconCompact, { flexShrink: 0, backgroundColor: included ? p.field : p.field }]}><Ionicons name={included ? "checkmark-circle-outline" : "storefront-outline"} size={compactIncluded ? 18 : 22} color={color} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: compactIncluded ? 1 : 3 }}>
        <Text accessibilityRole="header" style={[styles.salonTitle, compactIncluded && { fontSize: 14, lineHeight: 18 }, { color }]}>{title}</Text>
        {description !== "Pagherai direttamente al salone." ? <Text style={[styles.salonDescription, compactIncluded && { fontSize: 12, lineHeight: 16 }, !included && { color: p.ink }]}>{description}</Text> : null}
      </View>
    </View>
  </View>;
}

export function BookingPaymentNotice({ salonCode, email, phone, total, lineTotals, packageApplied = false, compactEntry = false, onQuoteChange, onQuoteReadyChange, onAccessRecovery }: Identity & { total: number; lineTotals?: number[]; packageApplied?: boolean; compactEntry?: boolean; onQuoteChange?: (quote: BookingPaymentQuote | null) => void; onQuoteReadyChange?: (ready: boolean) => void; onAccessRecovery?: () => void }) {
  const { palette: p } = useAccessAppearance();
  const styles = React.useMemo(() => customerPortalStyles(customerBaseStyles, p), [p]);
  const quoteIdentityKey = JSON.stringify([salonCode, email, phone]);
  const [quoteSnapshot, setQuoteSnapshot] = useState<{ key: string; result: Result | null; error: Error | null }>({ key: '', result: null, error: null });
  const result = quoteSnapshot.key === quoteIdentityKey ? quoteSnapshot.result : null;
  const error = quoteSnapshot.key === quoteIdentityKey ? quoteSnapshot.error : null;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false; setQuoteSnapshot({ key: quoteIdentityKey, result: null, error: null });
    if (salonCode && email && phone) void call({ salonCode, email, phone }, 'quote')
      .then(value => { if (!stopped) setQuoteSnapshot({ key: quoteIdentityKey, result: value, error: null }); })
      .catch(e => { if (!stopped) setQuoteSnapshot({ key: quoteIdentityKey, result: null, error: customerPaymentAccessError(e, 'Condizioni di pagamento non disponibili. Riprova.') }); });
    return () => { stopped = true; };
  }, [salonCode, email, phone, revision, quoteIdentityKey]);
  useEffect(() => subscribeCustomerPaymentSession({ salonCode, email, phone }, event => {
    if (event === 'authenticated') setRevision(value => value + 1);
  }), [salonCode, email, phone]);
  const amounts = result?.enabled && result.policy ? (lineTotals?.length ? lineTotals : [total]).reduce((sum, amount) => {
    const line = bookingPaymentAmounts(Math.round(amount * 100), result.policy!);
    const due = line.dueCents < 50 ? 0 : line.dueCents;
    return { totalCents: sum.totalCents + line.totalCents, dueCents: sum.dueCents + due, balanceCents: sum.balanceCents + line.totalCents - due };
  }, { totalCents: 0, dueCents: 0, balanceCents: 0 }) : null;
  const onQuoteChangeRef = useRef(onQuoteChange);
  onQuoteChangeRef.current = onQuoteChange;
  const onQuoteReadyChangeRef = useRef(onQuoteReadyChange);
  onQuoteReadyChangeRef.current = onQuoteReadyChange;
  const policyMode = result?.policy?.mode;
  const policyPercent = result?.policy?.percent;
  const amountTotal = amounts?.totalCents;
  const amountDue = amounts?.dueCents;
  const amountBalance = amounts?.balanceCents;
  const policyResolved = result !== null && (!result.enabled || (policyMode !== undefined && ['salon', 'deposit', 'full'].includes(policyMode) && Number.isFinite(policyPercent)));
  useEffect(() => {
    onQuoteReadyChangeRef.current?.((packageApplied && total === 0) || (policyResolved && !error));
  }, [policyResolved, error, packageApplied, total]);
  useEffect(() => {
    onQuoteChangeRef.current?.(policyMode && policyPercent !== undefined && amountTotal !== undefined && amountDue !== undefined && amountBalance !== undefined && !error
      ? { enabled: true, policy: { mode: policyMode, percent: policyPercent }, totalCents: amountTotal, dueCents: amountDue, balanceCents: amountBalance } : null);
  }, [salonCode, email, phone, policyMode, policyPercent, amountTotal, amountDue, amountBalance, error]);
  if (packageApplied && total === 0) return <SalonPaymentSummary compactEntry={compactEntry} included title="Incluso nel pacchetto" description="Nulla da pagare per questo appuntamento." />;
  if (error) return <View style={styles.panel}><Text style={styles.title}>{isCustomerPaymentAuthenticationError(error) ? 'Conferma l’accesso per prenotare' : 'Condizioni di pagamento'}</Text><Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>
    {isCustomerPaymentAuthenticationError(error) ? <PaymentVerification identity={{ salonCode, email, phone }} onAccessRecovery={onAccessRecovery} onVerified={() => setRevision(v => v + 1)} /> : <HapticTouchable accessibilityRole="button" style={styles.verifyButton} onPress={() => setRevision(v => v + 1)}><Text style={styles.verifyButtonText}>Riprova</Text></HapticTouchable>}
  </View>;
  if (!result) return <View accessibilityRole="progressbar" accessibilityLabel="Verifica delle condizioni di pagamento" accessibilityState={{ busy: true }} style={styles.panel}><Text style={styles.note}>Verifica delle condizioni di pagamento…</Text></View>;
  if (!result.enabled || !result.policy) return compactEntry ? <SalonPaymentSummary compactEntry description="Pagherai direttamente al salone." /> : null;
  if (!amounts) return null;
  if (result.policy.mode !== 'salon' && amounts.dueCents < 50) return <SalonPaymentSummary compactEntry={compactEntry} description="L’importo da anticipare è inferiore al minimo online di 0,50 €." />;
  if (result.policy.mode === 'salon') return <SalonPaymentSummary compactEntry={compactEntry} title={packageApplied ? "Paga solo gli extra in salone" : "Paga in salone"} description={packageApplied ? `Servizio incluso nel pacchetto. Extra da pagare: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}.` : "Pagherai direttamente al salone."} />;
  if (compactEntry) return <View style={{paddingVertical:14,flexDirection:'row',alignItems:'flex-start',gap:11}}><Ionicons name="card-outline" size={19} color={p.muted}/><View style={{flex:1,gap:5}}><Text style={{color:p.ink,fontSize:12,lineHeight:19}}>{bookingPaymentLabel(result.policy)}</Text><Text style={{color:p.muted,fontSize:11,lineHeight:18}}>{`${money(amounts.dueCents)} per inviare la prenotazione${amounts.balanceCents ? ` · saldo in salone ${money(amounts.balanceCents)}` : ''}.`}</Text><Text style={{color:p.muted,fontSize:11,lineHeight:18}}>Prima completi il pagamento, poi la richiesta viene inviata al salone.</Text></View></View>;
  return <View style={styles.panel}>
    <Text style={styles.title}>{bookingPaymentLabel(result.policy)}</Text>
    <Text style={styles.text}>{`${money(amounts.dueCents)} per inviare la prenotazione${amounts.balanceCents ? ` · saldo in salone ${money(amounts.balanceCents)}` : ''}.`}</Text>
    <Text style={styles.note}>Prima completi il pagamento, poi la richiesta viene inviata al salone.</Text>
  </View>;
}

type BookingPaymentPanelProps = Identity & {
  requestId: string;
  status?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  title?: string;
  initialResult?: BookingPaymentResult | null;
  onSettled?: (result: BookingPaymentResult) => void;
  onStateChange?: (result: BookingPaymentResult) => void;
  onChooseAnotherTime?: () => void;
  onAccessRecovery?: () => void;
};

export function BookingPaymentHoldPanel(props: BookingPaymentPanelProps) {
  const { palette: p } = useAccessAppearance();
  return <ClientBookingPayment {...props} status={props.status ?? 'In attesa'} />;
}

export function ClientBookingPayment({ salonCode, email, phone, requestId, status, serviceName, appointmentDate, appointmentTime, title, initialResult, onSettled, onStateChange, onChooseAnotherTime, onAccessRecovery }: BookingPaymentPanelProps) {
  const { palette: p } = useAccessAppearance();
  const styles = React.useMemo(() => customerPortalStyles(customerBaseStyles, p), [p]);
  const [result, setResult] = useState<Result | null>(initialResult ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyOperation, setBusyOperation] = useState('check');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const accessPaused = useRef(false);
  const recoveryOperation = useRef('check');
  const inlineVerificationActive = useRef(false);
  const version = useRef(0);
  const settledStatusRef = useRef('');
  const expiryCheckedRef = useRef('');
  const callbacksRef = useRef({ onSettled, onStateChange });
  callbacksRef.current = { onSettled, onStateChange };
  const resultStatus = result?.status;
  const holdExpiresAt = result?.holdExpiresAt;
  const shouldPoll = bookingPaymentShouldPoll(result);
  const isSettled = bookingPaymentIsSettled(result);
  const refresh = useCallback(async (operation = 'check') => {
    if (lock.current || (operation === 'check' && accessPaused.current)) return;
    lock.current = true; setBusyOperation(operation); setBusy(true);
    if (operation !== 'check') setError(null);
    const current = version.current;
    try {
      const next = operation === 'checkout'
        ? await beginBookingPaymentCheckout({ salonCode, email, phone }, requestId, { canOpen: () => current === version.current })
        : await call({ salonCode, email, phone }, operation, requestId);
      if (current !== version.current) return;
      setResult(next);
      accessPaused.current = false; setError(null); setVerificationRequested(false);
      if (operation === 'cancel' || bookingPaymentIsSettled(next)) setConfirmCancel(false);
      callbacksRef.current.onStateChange?.(next);
    } catch (e) {
      if (current === version.current) {
        const failure = customerPaymentAccessError(e, 'Verifica non riuscita. Riprova.');
        accessPaused.current = isCustomerPaymentAuthenticationError(failure);
        if (accessPaused.current) recoveryOperation.current = operation;
        if (accessPaused.current && operation !== 'check') setVerificationRequested(true);
        setError(failure);
      }
    }
    finally { if (current === version.current) { lock.current = false; setBusy(false); } }
  }, [salonCode, email, phone, requestId]);
  useEffect(() => {
    version.current++; lock.current = false; setBusy(false); accessPaused.current = false; recoveryOperation.current = 'check'; inlineVerificationActive.current = false; setResult(initialResult ?? null); setError(null); setConfirmCancel(false); setVerificationRequested(false);
    settledStatusRef.current = ''; expiryCheckedRef.current = '';
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('focus', resume);
    }
    return () => {
      // This is a request generation, not a native view ref; cleanup must invalidate in-flight reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      version.current++; subscription.remove();
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('focus', resume);
      }
    };
    // initialResult is only the submit handoff; changing it must not restart an active checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, status]);
  const resumeAccess = useCallback(() => {
    accessPaused.current = false;
    const operation = recoveryOperation.current; recoveryOperation.current = 'check';
    void refresh(operation);
  }, [refresh]);
  useEffect(() => subscribeCustomerPaymentSession({ salonCode, email, phone }, event => {
    if (event !== 'authenticated' || inlineVerificationActive.current) return;
    accessPaused.current = false;
    if (recoveryOperation.current === 'check') resumeAccess();
    else {
      // Returning from external recovery never starts a checkout or cancellation.
      // Inline verification retains its explicit intent through onVerified instead.
      recoveryOperation.current = 'check'; setError(null); setVerificationRequested(false);
    }
  }), [salonCode, email, phone, resumeAccess]);
  const verificationLifecycle = {
    onVerificationStarted: () => { inlineVerificationActive.current = true; },
    onVerificationFinished: () => { inlineVerificationActive.current = false; },
  };
  useEffect(() => {
    if (!shouldPoll || error) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background' && (Platform.OS !== 'web' || document.visibilityState !== 'hidden')) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [shouldPoll, error, refresh]);
  useEffect(() => {
    if (!holdExpiresAt || !shouldPoll) return;
    const tick = () => {
      const tickNow = Date.now();
      setNow(tickNow);
      if (bookingPaymentRemainingSeconds(holdExpiresAt, tickNow) === 0 && expiryCheckedRef.current !== holdExpiresAt) {
        expiryCheckedRef.current = holdExpiresAt;
        void refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt, shouldPoll, refresh]);
  useEffect(() => {
    if (!isSettled || !resultStatus || settledStatusRef.current === resultStatus) return;
    settledStatusRef.current = resultStatus;
    if (result) callbacksRef.current.onSettled?.(result);
    refreshBookingPaymentNotices();
  }, [isSettled, resultStatus, result]);
  if (!result && error) return <View style={styles.panel}>
    {isCustomerPaymentAuthenticationError(error) ? (verificationRequested
      ? <PaymentVerification {...verificationLifecycle} identity={{ salonCode, email, phone }} onAccessRecovery={onAccessRecovery} onVerified={resumeAccess} />
      : <HapticTouchable accessibilityRole="button" style={styles.verifyButton} onPress={() => setVerificationRequested(true)}><Ionicons name="wallet-outline" size={16} color={p.muted} /><Text style={styles.verifyButtonText}>Dettagli pagamento</Text></HapticTouchable>) : <>
      <Text style={styles.title}>Verifica pagamento</Text>
      <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>
    </>}
    {!isCustomerPaymentAuthenticationError(error) ? <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void refresh()}>
      <Text style={styles.buttonText}>{busy ? 'Verifica…' : 'Riprova'}</Text>
    </HapticTouchable> : null}
  </View>;
  if (!result?.enabled || result.policy?.mode === 'salon') return null;
  const paid = result.status === 'paid' || result.status === 'deposit_paid';
  const refunded = result.status === 'refunded';
  const refundDue = result.status === 'refund_due';
  const salonBalance = result.status === 'salon_balance';
  const remaining = bookingPaymentRemainingSeconds(result.holdExpiresAt, now);
  const payable = bookingPaymentNeedsCheckout(result) && remaining !== 0;
  const presentation = bookingPaymentPresentation(result, now);
  const financialHistory = refunded || refundDue || salonBalance;
  const appointmentDay = appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
    ? `${appointmentDate.slice(8, 10)}/${appointmentDate.slice(5, 7)}/${appointmentDate.slice(0, 4)}` : appointmentDate;
  const appointmentSummary = [appointmentDay, appointmentTime?.slice(0, 5)].filter(Boolean).join(' · ');
  return <View style={[styles.panel, !financialHistory && presentation.tone === 'payment' && styles.holdPanel]}>
    <View style={styles.row}>
      <View style={[styles.paymentIcon, paid && styles.paymentIconSuccess]}><Ionicons name={paid ? 'checkmark-circle-outline' : 'wallet-outline'} size={22} color={paid ? p.night ? '#B5D4BB' : '#3F654B' : p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text accessibilityRole="header" style={styles.title}>{refundDue ? 'Rimborso da concordare' : salonBalance ? 'Saldo in salone' : refunded ? 'Rimborso registrato' : payable && title ? title : presentation.title}</Text>
        {serviceName ? <Text style={styles.note}>{serviceName}</Text> : null}
        {appointmentSummary ? <Text style={styles.note}>{appointmentSummary}</Text> : null}
      </View>
      {remaining !== null && remaining > 0 && shouldPoll && !paid && !financialHistory ? <View accessibilityLabel={`Orario riservato per ${Math.floor(remaining / 60)} minuti e ${remaining % 60} secondi`} style={styles.countdown}><Ionicons name="time-outline" size={13} color={p.muted} /><Text style={styles.countdownText}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text></View> : null}
    </View>
    {refunded ? <Text style={styles.text}>Rimborso registrato: {money(result.refundedCents ?? 0)}. Per eventuali accordi sul saldo, contatta il salone.</Text> : null}
    {refundDue ? <Text style={styles.text}>Importo da rimborsare: {money(result.refundDueCents ?? 0)}. Il rimborso viene gestito dal salone.</Text> : salonBalance ? <Text style={styles.text}>Da saldare in salone: {money(result.balanceCents ?? 0)}.</Text> : null}
    {!financialHistory ? <>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{presentation.description}</Text>
      {presentation.detail ? <Text style={styles.amountText}>{presentation.detail}</Text> : null}
    </> : null}
    {payable ? <HapticTouchable accessibilityRole="button" disabled={busy} style={[styles.button, styles.payButton, busy && { opacity: 0.6 }]} onPress={() => void refresh('checkout')}>
      <Ionicons name="lock-closed-outline" size={16} color={p.actionText} /><Text style={styles.buttonText}>{busy ? busyOperation === 'checkout' ? 'Apertura pagamento…' : 'Verifica pagamento…' : `Paga ${money(result.dueCents ?? 0)}`}</Text><Ionicons name="arrow-forward" size={17} color={p.actionText} />
    </HapticTouchable> : null}
    {error && (!isCustomerPaymentAuthenticationError(error) || verificationRequested) ? <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text> : null}
    {verificationRequested && isCustomerPaymentAuthenticationError(error) ? <PaymentVerification {...verificationLifecycle} identity={{ salonCode, email, phone }} onAccessRecovery={onAccessRecovery} onVerified={resumeAccess} /> : null}
    {result.status === 'expired' && onChooseAnotherTime ? <HapticTouchable accessibilityRole="button" style={styles.button} onPress={onChooseAnotherTime}><Text style={styles.buttonText}>Scegli un altro orario</Text></HapticTouchable> : null}
    {!paid && !['cancelled', 'expired'].includes(result.status ?? '') ? <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.verifyButton} onPress={() => {
      if (isCustomerPaymentAuthenticationError(error)) setVerificationRequested(true);
      else void refresh();
    }}>
      <Ionicons name="refresh-outline" size={15} color={p.muted} /><Text style={styles.verifyButtonText}>{busy ? 'Verifica in corso…' : result.status === 'paid_conflict' ? 'Verifica stato' : 'Ho già pagato · verifica'}</Text>
    </HapticTouchable> : null}
    {!financialHistory && !paid && result.status !== 'paid_conflict' && result.holdExpiresAt && !['cancelled', 'expired'].includes(result.status ?? '') ? (confirmCancel ? <View style={styles.cancelConfirmation}>
      <Text style={styles.text}>Vuoi liberare questo orario? La prenotazione non verrà inviata.</Text>
      <View style={styles.cancelActions}>
        <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={() => setConfirmCancel(false)}><Text style={styles.verifyButtonText}>Tieni l’orario</Text></HapticTouchable>
        <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={() => void refresh('cancel')}><Text style={styles.cancelButtonText}>{busy ? 'Verifica…' : 'Libera orario'}</Text></HapticTouchable>
      </View>
    </View> : <HapticTouchable accessibilityRole="button" disabled={busy} style={styles.verifyButton} onPress={() => setConfirmCancel(true)}><Text style={styles.cancelButtonText}>Annulla e libera orario</Text></HapticTouchable>) : null}
  </View>;
}
/** Independent of push permission and notification read state. Only the active page polls. */
export function BookingPaymentBanner({ salonCode, email, phone, active, onAccessRecovery }: Identity & { active: boolean; onAccessRecovery?: () => void }) {
  const { palette: p } = useAccessAppearance();
  const styles = React.useMemo(() => customerPortalStyles(customerBaseStyles, p), [p]);
  const identityKey = JSON.stringify([salonCode, email, phone]);
  const [snapshot, setSnapshot] = useState<{ key: string; items: PaymentNotice[]; error: Error | null }>({ key: '', items: [], error: null });
  const items = snapshot.key === identityKey ? snapshot.items : [];
  const error = snapshot.key === identityKey ? snapshot.error : null;
  const authenticationRequired = isCustomerPaymentAuthenticationError(error);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const refreshNow = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    setSnapshot({ key: '', items: [], error: null }); setExpanded(false);
  }, [salonCode, email, phone]);
  useEffect(() => {
    if (!active || !salonCode || !email || !phone) return;
    let stopped = false;
    let fetching = false;
    let authenticationPaused = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      if (stopped || fetching || authenticationPaused || AppState.currentState === 'background' ||
        (Platform.OS === 'web' && document.visibilityState === 'hidden')) return;
      fetching = true;
      try {
        const response = await call({ salonCode, email, phone }, 'summary');
        if (!stopped) setSnapshot({ key: identityKey, items: response.enabled ? response.items ?? [] : [], error: null });
      } catch (e) {
        if (!stopped) {
          const failure = customerPaymentAccessError(e, 'Non riusciamo a verificare i pagamenti. Riprova.');
          authenticationPaused = isCustomerPaymentAuthenticationError(failure);
          if (authenticationPaused && timer !== undefined) { clearInterval(timer); timer = undefined; }
          setSnapshot(previous => ({ key: identityKey, items: previous.key === identityKey ? previous.items : [], error: failure }));
        }
      }
      finally { fetching = false; }
    };
    const refreshListener = () => { void refresh(); };
    paymentRefreshListeners.add(refreshListener);
    void refresh();
    timer = setInterval(() => void refresh(), 15000);
    const unsubscribeSession = subscribeCustomerPaymentSession({ salonCode, email, phone }, event => {
      if (stopped || event !== 'authenticated') return;
      authenticationPaused = false;
      if (timer === undefined) timer = setInterval(() => void refresh(), 15000);
      void refresh();
    });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', resume);
    return () => { stopped = true; paymentRefreshListeners.delete(refreshListener); if (timer !== undefined) clearInterval(timer); unsubscribeSession(); subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', resume); };
  }, [salonCode, email, phone, active, revision, identityKey]);
  if (!active || (!items.length && (!error || authenticationRequired))) return null;
  const notice = bookingPaymentNoticePresentation(items);
  return <View style={[styles.panel, styles.bannerPanel]}>
    <View style={styles.row}>
      <View style={styles.paymentIcon}><Ionicons name="wallet-outline" size={22} color={p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text accessibilityRole="header" style={styles.title}>{items.length ? notice.title : 'Verifica pagamenti'}</Text>
        {items.length ? <Text style={styles.note}>{items.length === 1 ? items[0].serviceName : 'Pagamenti previsti dal salone'} · {notice.amountText}</Text> : null}
      </View>
      {items.length ? <HapticTouchable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.compactPayButton} onPress={() => setExpanded(value => !value)}>
        <Text style={styles.compactPayButtonText}>{expanded ? 'Chiudi' : notice.actionLabel}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={p.muted} />
      </HapticTouchable> : null}
    </View>
    {error && !authenticationRequired ? <><Text accessibilityRole="alert" style={styles.error}>{error.message}</Text><HapticTouchable accessibilityRole="button" style={styles.verifyButton} onPress={refreshNow}><Text style={styles.verifyButtonText}>Riprova la verifica</Text></HapticTouchable></> : null}
    {expanded && authenticationRequired ? <PaymentVerification identity={{ salonCode, email, phone }} onAccessRecovery={onAccessRecovery} onVerified={refreshNow} /> : null}
    {expanded && !authenticationRequired ? items.map(item => <BookingPaymentHoldPanel key={item.requestId}
      salonCode={salonCode} email={email} phone={phone} requestId={item.requestId}
      title="Pagamento da completare" serviceName={item.serviceName} appointmentDate={item.appointmentDate} appointmentTime={item.appointmentTime} onSettled={refreshNow}
      onAccessRecovery={onAccessRecovery}
      initialResult={{ enabled: true, status: item.status ?? (item.holdExpiresAt ? 'payment_required' : 'due'), bookingStatus: item.bookingStatus,
        holdExpiresAt: item.holdExpiresAt, groupRequestIds: item.groupRequestIds,
        policy: { mode: item.mode as BookingPaymentPolicy['mode'], percent: item.percent }, totalCents: item.totalCents, dueCents: item.dueCents,
        paidCents: item.paidCents, refundedCents: item.refundedCents, refundDueCents: item.refundDueCents }} />) : null}
  </View>;
}

const styles = StyleSheet.create({
  salonSummary: { width: '100%', alignSelf: 'stretch', backgroundColor: '#EAF1FA', borderWidth: 1, borderColor: '#CEDCEE', borderRadius: 16, padding: 14, gap: 8, marginVertical: 8 },
  salonSummaryCompact: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginVertical: 4 },
  salonHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  salonIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#F8FBFF', borderWidth: 1, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  salonIconCompact: { width: 28, height: 28, borderRadius: 9 },
  salonEyebrow: { color: '#627D98', fontSize: 10, lineHeight: 14, letterSpacing: 0.8, fontWeight: '700' },
  salonTitle: { color: '#203A54', fontSize: 15, lineHeight: 21, fontWeight: '700' },
  salonDescription: { color: '#526781', fontSize: 13, lineHeight: 19 },
  panel: { backgroundColor: '#F0F5FA', borderRadius: 16, padding: 14, gap: 8, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { color: '#20364D', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  text: { color: '#526781', fontSize: 13, lineHeight: 19 }, error: { color: '#B42332', fontSize: 13 },
  note: { color: '#62748B', fontSize: 12, lineHeight: 17 },
  amountText: { color: '#20364D', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  holdPanel: { backgroundColor: '#F4F8FE', borderWidth: 1, borderColor: '#D7E5FA', gap: 10 },
  bannerPanel: { width: '100%', alignSelf: 'stretch', backgroundColor: '#F4F8FE', borderWidth: 1, borderColor: '#D7E5FA', padding: 12 },
  paymentIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E7F0FF', alignItems: 'center', justifyContent: 'center' },
  paymentIconSuccess: { backgroundColor: '#E7F6EE' },
  countdown: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#EAF0F8', paddingVertical: 5, paddingHorizontal: 7, borderRadius: 9 },
  countdownText: { color: '#526781', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  button: { backgroundColor: '#20364D', minHeight: 44, padding: 13, borderRadius: 12, alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  payButton: { backgroundColor: '#245BDB', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  compactPayButton: { minHeight: 44, backgroundColor: '#245BDB', paddingHorizontal: 11, borderRadius: 11, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  compactPayButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  verifyButton: { minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  verifyButtonText: { color: '#245D9B', fontSize: 13, fontWeight: '600' },
  cancelConfirmation: { gap: 8, borderTopWidth: 1, borderColor: '#DAE4F0', paddingTop: 10 },
  cancelActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: '#EAF0F8', paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: '#80636A', fontSize: 12, fontWeight: '600' },
});

const customerBaseStyles = styles;
