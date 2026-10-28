const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const start = source.indexOf("        let persistedRequest: PublicSalonState['richiestePrenotazione'][number] =");
const end = source.indexOf('        recentLocalBookingRequestsRef.current = [', start);
assert.ok(start > 0 && end > start, 'production submission gate must precede optimistic requests');
const gate = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const run = new Function('context', `return (async()=>{with(context){${gate};return 'ordinary-booking';}})();`);
const request = { id: 'request-fixture', data: '2026-10-13', ora: '12:20', servizio: 'Taglio', stato: 'In attesa' };
const hold = { ...request, paymentHoldState: 'awaiting_payment' };
const quote = { enabled: true, policy: { mode: 'deposit', percent: 50 }, dueCents: 1000 };
const quoteLinesStart = source.indexOf('lineTotals={[');
const quoteLinesEnd = source.indexOf(']} />', quoteLinesStart);
assert.ok(quoteLinesStart > 0 && quoteLinesEnd > quoteLinesStart, 'production quote must pass persisted component prices');
const quoteLines = new Function('context', `with(context){return ${source.slice(quoteLinesStart + 'lineTotals={'.length, quoteLinesEnd + 1)};}`);
const policyExports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/booking-payment-policy.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(policyExports);
const paymentComponentSource = fs.readFileSync('components/client-booking-payment.tsx', 'utf8');
const quoteAmountsStart = paymentComponentSource.indexOf('  const amounts = result?.enabled');
const quoteAmountsEnd = paymentComponentSource.indexOf('  const onQuoteChangeRef', quoteAmountsStart);
assert.ok(quoteAmountsStart > 0 && quoteAmountsEnd > quoteAmountsStart, 'production quote reducer must remain available');
const computeQuote = new Function('context', `with(context){${ts.transpileModule(paymentComponentSource.slice(quoteAmountsStart, quoteAmountsEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText};return amounts;}`);
const quoteContext = { selectedPackageId: undefined, selectedCompositionItems: [{ price: 5 }, { price: 5 }],
  selectedCompositionServices: [{ prezzo: 10 }, { prezzo: 10 }], servizioSelezionatoPrezzo: 10,
  selectedDependencyService: null, selectedDependencyServicePrice: 0,
  resolveServicePrice: service => service.prezzo, data: '2026-10-13', ora: '10:00' };
assert.deepEqual(quoteLines(quoteContext), [5, 5], 'Composition component overrides quote 10 EUR, not standalone 20 EUR');
for (const mode of ['full', 'deposit']) {
  const policy = { mode, percent: mode === 'full' ? 100 : 50 };
  const amounts = computeQuote({ result: { enabled: true, policy }, lineTotals: quoteLines(quoteContext), total: 10,
    bookingPaymentAmounts: policyExports.bookingPaymentAmounts });
  assert.equal(amounts.totalCents, 1000);
  assert.equal(amounts.dueCents, mode === 'full' ? 1000 : 500);
}
assert.deepEqual(quoteLines({ ...quoteContext, selectedCompositionItems: [{ price: 3 }, { price: 5 }] }), [3, 5], 'Customer component prices stay resolved');
assert.deepEqual(quoteLines({ ...quoteContext, selectedPackageId: 'package', selectedDependencyService: {}, selectedDependencyServicePrice: 6 }), [0, 6], 'Package coverage quotes only the linked extra');
assert.deepEqual(quoteLines({ ...quoteContext, selectedCompositionItems: [], servizioSelezionatoPrezzo: 7,
  selectedDependencyService: {}, selectedDependencyServicePrice: 6 }), [7, 6], 'Ordinary and linked prices stay separately rounded');
assert.equal(computeQuote({ result: { enabled: true, policy: { mode: 'full', percent: 100 } }, lineTotals: [0.25, 10], total: 10.25,
  bookingPaymentAmounts: policyExports.bookingPaymentAmounts }).dueCents, 1000, 'Under-50-cent rows remain payable at the salon');
const activePanelStart = source.indexOf('  const renderActiveBookingPaymentPanel =');
const settledHandlerStart = source.indexOf('onStateChange={(result) => {', activePanelStart);
const settledHandlerEnd = source.indexOf('\n      }}\n      onSettled=', settledHandlerStart);
assert.ok(activePanelStart > 0 && settledHandlerEnd > settledHandlerStart);
const settleActivePanel = new Function('result', 'context', `with(context){${source.slice(settledHandlerStart + 'onStateChange={(result) => {'.length, settledHandlerEnd)}}`);
const settledEvents = [];
const settledContext = { currentBookingPaymentHold: { identityKey: 'fixture', requestId: request.id },
  settledBookingPaymentIdsRef: { current: new Set() },
  refreshBookingPaymentNotices: () => settledEvents.push('notices'),
  refreshPublicSalonState: async () => settledEvents.push('canonical-bookings'),
  refreshBackendDayOccupancy: async () => settledEvents.push('capacity'),
  setActiveBookingPaymentHold: value => { assert.equal(value, null); settledEvents.push('unmount'); },
  resetBookingAutoScrollRefs() {}, setServizio() {}, setSelectedServiceId() {}, setSelectedDependencyServiceId() {},
  setOperatoreId() {}, setOperatoreNome() {}, setOra() {}, setNote() {}, setHasConfirmedBookingDay() {}, setIsBookingStarted() {},
  showBookingFlowAlert() {},
};
settleActivePanel({ status: 'deposit_paid', bookingStatus: 'pending' }, settledContext);
assert.deepEqual(settledEvents, ['notices', 'canonical-bookings', 'capacity', 'unmount'], 'Canonical state refresh happens before the payment panel unmounts');
settleActivePanel({ status: 'deposit_paid', bookingStatus: 'pending' }, settledContext);
assert.equal(settledEvents.length, 4, 'A duplicate settlement callback does not repeat success or reloads');
async function test({ initial = request, policy = quote, response, error = false, stale = false }) {
  const events = [];
  let active;
  let identityCurrent = true;
  const result = await run({
    saved: { ok: true, request: initial }, recoveredAfterAmbiguousSubmit: null, nextRequest: initial,
    bookingPaymentQuote: policy, checkoutIdentity: {}, checkoutIdentityKey: 'fixture',
    canOpenCheckout: () => identityCurrent,
    isUnsubmittedBookingPaymentHold: item => ['awaiting_payment', 'expired'].includes(item.paymentHoldState),
    checkBookingPayment: async () => { events.push('check'); identityCurrent = !stale; if (error) throw new Error('offline'); return response; },
    beginBookingPaymentCheckout: async (_identity, id, options) => { events.push(['checkout', id]); assert.equal(options.canOpen(), true); return { ...response, status: 'open' }; },
    servizio: 'Taglio', data: request.data, ora: request.ora, validationDependencyService: undefined,
    setOra: () => events.push('clear-time'), refreshBookingPaymentNotices: () => events.push('refresh-notice'),
    showBookingFlowAlert: title => events.push(['alert', title]), refreshBackendDayOccupancy: async () => events.push('refresh-busy'),
    setUltimaRichiesta: value => { assert.equal(value, null, 'hold cannot mark a submitted booking'); events.push('clear-success'); },
    setActiveBookingPaymentHold: value => { active = typeof value === 'function' ? value(active) : value; events.push('hold-panel'); },
    scrollFrontendToY: () => events.push('scroll-payment'),
    requestAnimationFrame: callback => callback(),
    scrollFrontendBookingSubmitIntoView: () => events.push('scroll-payment'),
  });
  return { events, result, active };
}
async function main() {
  for (const mode of ['deposit', 'full']) {
    for (const initial of [request, hold]) {
      const result = await test({ initial, policy: { ...quote, policy: { mode, percent: mode === 'full' ? 100 : 50 } }, response: { enabled: true, status: 'payment_required', holdExpiresAt: '2026-10-09T12:05:00Z' } });
      assert.equal(result.result, undefined, 'unpaid request cannot reach ordinary success/list/calendar');
      assert.ok(result.events.some(event => Array.isArray(event) && event[0] === 'checkout'));
      assert.equal(result.active.requestId, request.id, 'whole group uses the same authoritative entrypoint');
    }
  }
  const processing = await test({ response: { enabled: true, status: 'payment_processing', holdExpiresAt: null } });
  assert.equal(processing.result, undefined, 'processing payment without a countdown is still unconfirmed');
  for (const changed of [{ dueCents: 2000 }, { totalCents: 4000 }, { policy: { mode: 'full', percent: 100 } }, { policy: { mode: 'deposit', percent: 60 } }]) {
    const result = await test({ policy: { ...quote, totalCents: 2000 },
      response: { enabled: true, status: 'payment_required', dueCents: 1000, totalCents: 2000, policy: quote.policy, ...changed } });
    assert.equal(result.result, undefined, 'changed payment conditions cannot submit an ordinary booking');
    assert.equal(result.events.some(event => Array.isArray(event) && event[0] === 'checkout'), false, 'Changed terms require explicit payment from the canonical panel');
    assert.ok(result.events.some(event => Array.isArray(event) && event[0] === 'alert' && event[1] === 'Importo aggiornato'));
    assert.equal(result.active.initialResult.dueCents, changed.dueCents ?? 1000, 'Canonical amount remains visible for review');
  }
  const invalidAmount = await test({ initial: hold, response: { enabled: true, status: 'payment_required', dueCents: Number.NaN } });
  assert.ok(invalidAmount.events.some(event => Array.isArray(event) && event[0] === 'checkout'), 'Missing or invalid hints do not invent a price-change proof; the server checkout remains authoritative');
  for (const status of ['expired', 'cancelled', 'paid_conflict']) {
    const result = await test({ initial: hold, response: { enabled: true, status } });
    assert.equal(result.result, undefined);
    assert.equal(result.events.some(event => Array.isArray(event) && event[0] === 'checkout'), false, `${status} cannot charge again`);
  }
  for (const status of ['paid', 'deposit_paid']) {
    const result = await test({ initial: hold, response: { enabled: true, status, bookingStatus: 'pending' } });
    assert.equal(result.result, 'ordinary-booking', 'paid manual approval returns to the established request flow');
  }
  assert.equal((await test({ policy: { enabled: false }, response: null })).result, 'ordinary-booking', 'salon payment remains unchanged');
  const removedDeposit = await test({ policy: quote, response: { enabled: true, status: 'salon', policy: { mode: 'salon', percent: 0 }, dueCents: 0 } });
  assert.equal(removedDeposit.result, 'ordinary-booking', 'An old deposit quote cannot impose an advance after the server removed it.');
  assert.deepEqual(removedDeposit.events, ['check'], 'A booking now paid in the salon never opens a checkout or an unpaid hold panel.');
  assert.equal((await test({ policy: { ...quote, dueCents: 0 }, response: null })).result, 'ordinary-booking', 'covered package requires no checkout');
  const offline = await test({ error: true });
  assert.equal(offline.result, undefined);
  assert.equal(offline.active.requestId, request.id, 'ambiguous verification stays recoverable without a second request');
  const stale = await test({ initial: hold, stale: true, response: { enabled: true, status: 'payment_required' } });
  assert.equal(stale.result, undefined);
  assert.deepEqual(stale.events, ['check'], 'logout/salon switch cannot open checkout or revive an old success');
  console.log('PASS: actual submission gate blocks unpaid/processing/expired/cancelled/conflicted requests, preserves salon/package and manual approval, and rejects stale sessions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
