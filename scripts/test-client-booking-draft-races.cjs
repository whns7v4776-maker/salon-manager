const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'app/cliente-screen.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile('cliente-screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const effects = [];
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const name = node.name.text;
    if (!declarations.has(name)) declarations.set(name, node.initializer.getText(ast));
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) effects.push(callback.getText(ast));
  }
  ts.forEachChild(node, collect);
}
collect(ast);
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const compile = code => ts.transpileModule(code, { compilerOptions: options }).outputText;
const modules = new Map();
function loadModule(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  vm.runInNewContext(compile(fs.readFileSync(filename, 'utf8')), {
    exports, Date, Intl, URL,
    require(name) {
      assert.ok(name.startsWith('.'), `External runtime dependency denied: ${name}`);
      return loadModule(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
    },
  });
  return exports;
}
const booking = loadModule('src/lib/booking.ts');
const phases = loadModule('src/lib/service-phases.ts');
const constants = {};
for (const name of ['FRONTEND_LIVE_SLOT_CACHE_MAX_AGE_MS', 'FRONTEND_LIVE_SLOT_CACHE_MAX_ENTRIES',
  'FRONTEND_MULTI_PHASE_AVAILABILITY_CHUNK_SIZE', 'FRONTEND_COMPLEX_LIVE_SLOT_REQUEST_TIMEOUT_MS',
  'FRONTEND_LIVE_SLOT_REQUEST_TIMEOUT_MS']) {
  assert.ok(declarations.has(name), name);
  constants[name] = vm.runInNewContext(compile(`(${declarations.get(name)})`));
}
const availabilityEffectText = effects.find(text => text.includes('const loadLiveSlotAvailability ='));
assert.ok(availabilityEffectText, 'Actual selected-slot effect must exist');
const records = [];
const check = (name, run) => { run(); records.push({ name, passed: true }); };
const checkAsync = async (name, run) => { await run(); records.push({ name, passed: true }); };
const flush = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
const normalize = value => JSON.parse(JSON.stringify(value));
const service = { id: 'service-cut', nome: 'Taglio', prezzo: 20, durataMinuti: 30, mestiereRichiesto: 'Parrucchiere' };
const operator = { id: 'operator-marco', nome: 'Marco', mestiere: 'Parrucchiere' };
const phase = phases.normalizeServicePhaseConfig({ mode: 'phased', initialDurationMinutes: 20,
  processingDurationMinutes: 70, finalServiceName: 'Piega', finalDurationMinutes: 20,
  sameOperator: true, allowFrontendSplitOperators: false });
const defaultSettings = () => booking.normalizeAvailabilitySettings({
  weeklySchedule: Array.from({ length: 7 }, (_, weekday) => ({ weekday, isClosed: false, startTime: '09:00', endTime: '18:00' })),
  lunchBreakEnabled: true, lunchBreakStart: '13:00', lunchBreakEnd: '14:00',
});
function setup(changes = {}, sharedRefs) {
  const timers = new Map(), allTimers = [], calls = [];
  const references = sharedRefs || {};
  for (const [name, current] of Object.entries({
    livePublicSlotAvailabilityResolvedKeyRef: '', livePublicSlotAvailabilityAuthoritativeKeyRef: '',
    livePublicSlotAvailabilityInFlightKeyRef: '', livePublicSlotAvailabilityRequestRef: 0,
    livePublicSlotAvailabilityHandledRefreshRevisionRef: 0,
    livePublicSlotAvailabilityCacheRef: new Map(), livePublicSlotAvailabilityRetryCountRef: new Map(),
  })) if (!references[name]) references[name] = { current };
  const environment = {
    bookingPaymentQuoteIdentityKey: 'fixture', bookingPaymentIdentityKey: 'fixture',
    ...booking, ...phases, ...constants, ...references,
    Date, AbortController, Object, Set, Map, Error,
    console: { log() {} },
    useCallback: fn => fn, useMemo: fn => fn(),
    isRegistered: true, isBookingStarted: true, isCurrentWorkspaceSalon: false,
    effectiveWorkspace: { id: 'workspace-fixture', salonCode: 'isolated-test' },
    normalizedSelectedSalonCode: 'isolated-test',
    data: '2030-10-14', servizio: service.nome,
    hasConfirmedBookingDay: true,
    displayTimeSlots: ['10:00', '11:00'], effectiveServizi: [service], effectiveOperatori: [operator],
    selectedBookingService: service, selectedDependencyService: null, liveBookingPhaseConfig: null,
    operatoreId: operator.id, operatoreNome: operator.nome, livePublicPlanOperatorId: operator.id,
    effectiveAvailabilitySettings: defaultSettings(),
    profile: { nome: 'Cliente', cognome: 'Test', email: 'customer@isolated.test', telefono: '3331234567' },
    livePublicSlotAvailabilityQueryKey: 'query-A',
    livePublicSlotAvailabilityMap: null, livePublicSlotUnavailableReasonMap: null,
    isLivePublicSlotAvailabilityLoading: false, livePublicSlotAvailabilityError: '',
    livePublicSlotAvailabilityRefreshRevision: 0, livePublicSlotAvailabilityRetryRevision: 0,
    normalizeIdentityText: value => String(value ?? '').trim().toLowerCase(),
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.set(timer, timer); allTimers.push(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    setLivePublicSlotAvailabilityRetryRevision(update) {
      environment.livePublicSlotAvailabilityRetryRevision = update(environment.livePublicSlotAvailabilityRetryRevision);
    },
    publicSupabase: { rpc(name, args) {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const call = { name, args, resolve, signal: null };
      calls.push(call);
      if (environment.respond) Promise.resolve().then(() => resolve(environment.respond(name, args, calls.length)));
      return { abortSignal(signal) { call.signal = signal; return promise; } };
    } },
    ...changes,
  };
  for (const [setter, state] of Object.entries({
    setLivePublicSlotAvailabilityMap: 'livePublicSlotAvailabilityMap',
    setLivePublicSlotUnavailableReasonMap: 'livePublicSlotUnavailableReasonMap',
    setIsLivePublicSlotAvailabilityLoading: 'isLivePublicSlotAvailabilityLoading',
    setLivePublicSlotAvailabilityError: 'livePublicSlotAvailabilityError',
  })) environment[setter] = value => { environment[state] = typeof value === 'function' ? value(environment[state]) : value; };
  const context = vm.createContext(environment);
  // Evaluate the production identity-aware quote gate instead of using the retired ready flag directly.
  Object.defineProperty(environment, 'currentBookingPaymentQuoteReady', {
    get: () => actualValue('currentBookingPaymentQuoteReady', context),
  });
  environment.shouldSplitPublicAvailabilityBatchError = vm.runInContext(compile(`(${declarations.get('shouldSplitPublicAvailabilityBatchError')})`), context);
  const effect = vm.runInContext(compile(`(${availabilityEffectText})`), context);
  return { environment, context, effect, references, calls, timers, allTimers };
}
const available = (_name, args) => ({ data: Object.fromEntries(
  (args.p_slot_times || args.p_slot_requests.map(item => item.slotTime)).map(time => [time, true])), error: null });
function actualValue(name, context) {
  assert.ok(declarations.has(name), name);
  return vm.runInContext(compile(`(${declarations.get(name)})`), context);
}

function setupSubmit() {
  const s = setup();
  const e = s.environment;
  Object.assign(e, loadModule('src/lib/validators.ts'), loadModule('src/lib/customer-service-durations.ts'),
    loadModule('src/lib/customer-service-prices.ts'), loadModule('src/lib/service-compositions.ts'),
    loadModule('src/lib/customer-registration-access.ts'), loadModule('src/lib/platform.ts'));
  // Reuse the actual pure screen identity, chronology and booking helpers.
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isArrowFunction(declaration.initializer)) {
        e[declaration.name.text] = vm.runInContext(compile(`(${declaration.initializer.getText(ast)})`), s.context);
      }
    }
  }
  const date = new Date(); date.setDate(date.getDate() + 14);
  const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const identity = e.buildCustomerRegistrationIdentityKey({ salonCode: e.effectiveWorkspace.salonCode,
    email: e.profile.email, phone: e.profile.telefono });
  const snapshot = { workspace: e.effectiveWorkspace, servizi: [service], operatori: [operator],
    availabilitySettings: e.effectiveAvailabilitySettings, clienti: [], appuntamenti: [], richiestePrenotazione: [] };
  let resolvePolicy, resolveCatalog;
  const policyRead = new Promise(resolve => { resolvePolicy = resolve; });
  const catalogRead = new Promise(resolve => { resolveCatalog = resolve; });
  const events = [], alerts = [], submitted = [];
  const stop = new Error('isolated_stop_after_booking_write_attempt');
  Object.assign(e, {
    data: dateValue, today: booking.getTodayDateString(), ora: '10:00', selectedServiceId: service.id,
    selectedDependencyServiceId: '', selectedPackageId: undefined, servizioSelezionato: service,
    bookingRequestSubmitting: false, currentBookingPaymentHold: null, bookingPaymentQuoteReady: true,
    customerRegistrationCanBook: true, customerRegistrationIdentityKey: identity,
    customerRegistrationMountedRef: { current: true },
    customerRegistrationSessionGenerationRef: { current: 0 }, customerRegistrationIdentityRef: { current: identity },
    customerOnlineBookingPolicyConfirmedRef: { current: null },
    latestPublicSalonStateRef: { current: null }, latestPublicSalonStateUpdatedAtRef: { current: 0 },
    latestAuthoritativePublicSalonCatalogRef: { current: null },
    bookingRequestInFlightKeyRef: { current: '' },
    intelligentOnlySlots: false, guidedRecommendedTimeSlots: ['10:00'],
    selectedSlotHasAuthoritativeAvailability: true,
    clienteInibito: false, sameDayServiceRepeatBlocked: false, sameDayBookingComponentConflict: null,
    isSelectedTimeWithinMinimumNotice: false, selectedDateAvailability: { closed: false },
    overlapsLunchBreakSelection: false, exceedsClosingTimeSelection: false,
    effectiveAppuntamenti: [], effectiveRichieste: [], effectiveClienti: [],
    customerServiceDurationOverrides: {}, customerServicePriceOverrides: {},
    customerOnlineBookingPolicy: { allowSameDaySameService: true, blockedServiceIds: [], blockedCompositionIds: [] },
    useAutomaticPhaseOperatorAssignment: false, serviceUsesOperatorScheduling: true,
    currentCustomerIdentityNames: new Set(['cliente test']),
    richiestaInConflitto: false, exactSlotRequestAlreadyPresent: false, note: '',
    FRONTEND_CUSTOMER_POLICY_WARM_MAX_AGE_MS: 5000, FRONTEND_BOOKING_PREFLIGHT_WARM_MAX_AGE_MS: 5000,
    CUSTOMER_REGISTRATION_PENDING_MESSAGE: 'Registrazione in attesa',
    refreshCustomerOnlineBookingPolicy() { events.push('policy-read'); return policyRead; },
    verifyPublicSalonStateForBooking() { events.push('catalog-read'); return catalogRead; },
    applyMergedPublicSalonState(value) { events.push(['apply-snapshot', value]); },
    derivePublicBookingOccupancyFromSnapshot() { return []; },
    resolveServicePrice(value) { return value.prezzo; },
    addBookingRequestForSalon(_salon, request) { submitted.push(request); throw stop; },
    setBookingRequestSubmitting(value) { e.bookingRequestSubmitting = value; },
    setProfileFieldErrors(value) { events.push(['field-errors', value]); },
    showBookingFlowAlert(title, message) { alerts.push({ title, message }); },
    showBookingFlowConfirm() { return Promise.resolve(true); },
    refreshBackendDayOccupancy() { events.push('occupancy-read'); return Promise.resolve(); },
    profile: { ...e.profile, instagram: '' },
  });
  e.livePublicSlotAvailabilityAuthoritativeKeyRef.current = e.livePublicSlotAvailabilityQueryKey;
  for (const [setter, state] of Object.entries({ setServizio: 'servizio', setSelectedServiceId: 'selectedServiceId',
    setSelectedDependencyServiceId: 'selectedDependencyServiceId', setOperatoreId: 'operatoreId',
    setOperatoreNome: 'operatoreNome', setOra: 'ora', setIsLoadingSalon: 'isLoadingSalon' })) {
    e[setter] = value => { e[state] = value; };
  }
  for (const name of ['getConfiguredOperatorsForFrontendService', 'hasFrontendSlotSelectionConflict']) {
    e[name] = actualValue(name, s.context);
  }
  const submit = actualValue('inviaRichiesta', s.context);
  return { ...s, submit, events, alerts, submitted, stop, snapshot,
    release() { resolvePolicy(e.customerOnlineBookingPolicy); resolveCatalog(snapshot); } };
}

(async () => {
  await checkAsync('single service sends full customer duration and stable operator identity', async () => {
    const s = setup({ respond: available }); const cleanup = s.effect(); await flush();
    assert.equal(s.calls[0].name, 'get_public_booking_slot_availability_batch_v3');
    assert.equal(s.calls[0].args.p_requested_operator_id, operator.id);
    assert.equal(s.calls[0].args.p_requested_operator_name, operator.nome);
    assert.equal(s.calls[0].args.p_customer_duration_minutes, 30);
    assert.deepEqual(normalize(s.environment.livePublicSlotAvailabilityMap), { '10:00': true, '11:00': true });
    assert.equal(s.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, 'query-A'); cleanup();
  });
  await checkAsync('personalized duration reaches server and interval geometry', async () => {
    const longer = { ...service, durataMinuti: 45 };
    const s = setup({ selectedBookingService: longer, effectiveServizi: [longer], respond: available });
    const cleanup = s.effect(); await flush();
    assert.equal(s.calls[0].args.p_customer_duration_minutes, 45);
    assert.equal(s.calls[0].args.p_slot_requests[0].intervals[0].durationMinutes, 45); cleanup();
  });
  await checkAsync('phased work can straddle lunch while processing overlaps lunch', async () => {
    const phased = { ...service, nome: 'Colore', phaseConfig: phase };
    const s = setup({ servizio: phased.nome, selectedBookingService: phased, effectiveServizi: [phased],
      liveBookingPhaseConfig: phase, displayTimeSlots: ['12:30'], respond: available });
    const cleanup = s.effect(); await flush();
    assert.equal(s.calls[0].name, 'get_public_phased_booking_slot_availability_batch_v4');
    assert.equal(s.calls[0].args.p_allow_split_operators, false);
    assert.deepEqual(normalize(s.calls[0].args.p_slot_requests[0].intervals), [
      { time: '12:30', durationMinutes: 20 }, { time: '14:00', durationMinutes: 20 },
    ]);
    assert.equal(s.environment.livePublicSlotAvailabilityMap['12:30'], true); cleanup();
  });
  await checkAsync('working phase overlapping lunch is rejected without an RPC', async () => {
    const s = setup({ displayTimeSlots: ['12:45', '13:00'] }); const cleanup = s.effect(); await flush();
    assert.equal(s.calls.length, 0);
    assert.deepEqual(normalize(s.environment.livePublicSlotUnavailableReasonMap), { '12:45': 'lunch', '13:00': 'lunch' }); cleanup();
  });
  await checkAsync('closed and vacation dates produce closed proof without planners', async () => {
    for (const settings of [
      { dateOverrides: [{ date: '2030-10-14', closed: true }] },
      { vacationRanges: [{ id: 'vacation', startDate: '2030-10-14', endDate: '2030-10-14' }] },
    ]) {
      const s = setup({ effectiveAvailabilitySettings: booking.normalizeAvailabilitySettings({ ...defaultSettings(), ...settings }) });
      const cleanup = s.effect(); await flush(); assert.equal(s.calls.length, 0);
      assert.ok(Object.values(s.environment.livePublicSlotAvailabilityMap).every(value => value === false)); cleanup();
    }
  });
  await checkAsync('composition uses canonical batch planner without catalog lunch false negatives', async () => {
    const composition = { ...service, id: 'composition-service', nome: 'Colore + Piega', compositionId: 'composition-id',
      compositionItems: [{ serviceId: service.id, serviceName: service.nome, durationMinutes: 30, position: 0 }] };
    const s = setup({ servizio: composition.nome, selectedBookingService: composition, effectiveServizi: [service, composition],
      displayTimeSlots: ['13:00'], respond: available }); const cleanup = s.effect(); await flush();
    assert.equal(s.calls[0].name, 'get_public_composition_slot_availability_batch_v1');
    assert.equal(s.calls[0].args.p_composition_id, 'composition-id');
    assert.equal(s.environment.livePublicSlotAvailabilityMap['13:00'], true); cleanup();
  });
  await checkAsync('dependency uses whole linked plan and passes any-operator as null', async () => {
    const dependency = { ...service, id: 'service-extra', nome: 'Piega' };
    const s = setup({ selectedDependencyService: dependency, effectiveServizi: [service, dependency],
      operatoreId: '', operatoreNome: '', livePublicPlanOperatorId: '', respond: available });
    const cleanup = s.effect(); await flush();
    assert.equal(s.calls[0].name, 'get_public_dependency_slot_availability_batch_v1');
    assert.equal(s.calls[0].args.p_dependency_service_id, dependency.id);
    assert.equal(s.calls[0].args.p_requested_operator_id, null); cleanup();
  });
  await checkAsync('operator-specific manual override blocks only selected operator slot', async () => {
    const settings = booking.normalizeAvailabilitySettings({ ...defaultSettings(),
      slotOverrides: [{ date: '2030-10-14', time: '10:00', blocked: true, operatorId: operator.id }] });
    for (const id of [operator.id, 'operator-alex']) {
      const s = setup({ effectiveAvailabilitySettings: settings, operatoreId: id, livePublicPlanOperatorId: id,
        operatoreNome: id === operator.id ? 'Marco' : 'Alex', respond: available });
      const cleanup = s.effect(); await flush();
      assert.equal(s.environment.livePublicSlotAvailabilityMap['10:00'], id !== operator.id); cleanup();
    }
  });
  await checkAsync('late service/day/operator responses cannot overwrite a newer draft', async () => {
    const nextService = { ...service, id: 'service-piega', nome: 'Piega' };
    for (const [kind, change] of Object.entries({ service: { servizio: nextService.nome,
      selectedBookingService: nextService, effectiveServizi: [nextService] }, day: { data: '2030-10-15' },
      operator: { operatoreId: 'operator-alex', operatoreNome: 'Alex', livePublicPlanOperatorId: 'operator-alex' } })) {
      const old = setup(); const oldCleanup = old.effect(); await flush(); assert.equal(old.calls.length, 1);
      oldCleanup();
      const fresh = setup({ ...change, livePublicSlotAvailabilityQueryKey: `query-${kind}`, respond: available }, old.references);
      const cleanup = fresh.effect(); await flush();
      old.calls[0].resolve({ data: { '10:00': false, '11:00': false }, error: null }); await flush();
      assert.equal(old.environment.livePublicSlotAvailabilityMap, null);
      assert.equal(fresh.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, `query-${kind}`);
      assert.ok(Object.values(fresh.environment.livePublicSlotAvailabilityMap).every(Boolean)); cleanup();
    }
  });
  await checkAsync('A to B to A keeps the newest A proof when first A returns last', async () => {
    const first = setup(); const retireFirst = first.effect(); await flush(); retireFirst();
    const middle = setup({ livePublicSlotAvailabilityQueryKey: 'query-B' }, first.references);
    const retireMiddle = middle.effect(); await flush(); retireMiddle();
    const last = setup({ respond: available }, first.references); const cleanup = last.effect(); await flush();
    first.calls[0].resolve({ data: { '10:00': false, '11:00': false }, error: null });
    middle.calls[0].resolve({ data: { '10:00': false, '11:00': false }, error: null }); await flush();
    assert.equal(last.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, 'query-A');
    assert.ok(Object.values(last.environment.livePublicSlotAvailabilityMap).every(Boolean)); cleanup();
  });
  await checkAsync('timeout and old retry cannot clear the succeeding query proof', async () => {
    const old = setup(); const retire = old.effect(); await flush();
    old.allTimers[0].callback(); await flush();
    assert.equal(old.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, '');
    assert.ok(Object.values(old.environment.livePublicSlotAvailabilityMap).every(value => value === false));
    const oldRetry = old.allTimers.at(-1); retire();
    const fresh = setup({ livePublicSlotAvailabilityQueryKey: 'query-fresh', respond: available }, old.references);
    const cleanup = fresh.effect(); await flush(); oldRetry.callback(); await flush();
    assert.equal(fresh.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, 'query-fresh');
    assert.equal(old.environment.livePublicSlotAvailabilityRetryRevision, 0); cleanup();
  });
  await checkAsync('partial batch retries sequentially until complete authoritative map', async () => {
    const s = setup({ respond: (name, args, count) => count === 1
      ? { data: { '10:00': true }, error: null } : available(name, args) });
    const cleanup = s.effect(); await flush();
    assert.equal(s.calls.length, 3);
    assert.deepEqual(s.calls.slice(1).map(call => call.args.p_slot_requests.length), [1, 1]);
    assert.equal(s.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, 'query-A'); cleanup();
  });
  await checkAsync('unrecoverable planner error leaves slots non-authoritative while retrying', async () => {
    const s = setup({ respond: () => ({ error: { code: '42501', message: 'permission denied' }, data: null }) });
    const cleanup = s.effect(); await flush();
    assert.equal(s.calls.length, 1); assert.equal(s.references.livePublicSlotAvailabilityAuthoritativeKeyRef.current, '');
    assert.ok(Object.values(s.environment.livePublicSlotAvailabilityMap).every(value => value === false)); cleanup();
  });
  check('submission requires quote, current slot proof and all existing booking constraints', () => {
    const s = setup(); Object.assign(s.environment, {
      currentBookingPaymentHold: null, bookingPaymentQuoteReady: true, isLoadingSalon: false,
      isLivePublicSlotAvailabilityResolvedForCurrentQuery: true, bookingRequestSubmitting: false,
      customerRegistrationCanBook: true, dependencyChoiceSatisfied: true, operatorChoiceSatisfied: true,
      ora: '10:00', selectedSlotHasAuthoritativeAvailability: true,
      selectedDateAvailability: { closed: false }, clienteInibito: false,
      isSelectedTimeWithinMinimumNotice: false, exceedsClosingTimeSelection: false,
      overlapsLunchBreakSelection: false, sameDayServiceRepeatBlocked: false,
      richiestaInConflitto: false, exactSlotRequestAlreadyPresent: false,
    });
    assert.equal(actualValue('canSendRequest', s.context), true);
    for (const [key, value] of Object.entries({ bookingPaymentQuoteReady: false, bookingPaymentQuoteIdentityKey: 'different-customer',
      currentBookingPaymentHold: { requestId: 'unpaid' }, hasConfirmedBookingDay: false,
      isLivePublicSlotAvailabilityResolvedForCurrentQuery: false, selectedSlotHasAuthoritativeAvailability: false,
      customerRegistrationCanBook: false, dependencyChoiceSatisfied: false, operatorChoiceSatisfied: false,
      exceedsClosingTimeSelection: true, overlapsLunchBreakSelection: true, sameDayServiceRepeatBlocked: true,
      richiestaInConflitto: true, exactSlotRequestAlreadyPresent: true, selectedDateAvailability: { closed: true },
    })) {
      const original = s.environment[key]; s.environment[key] = value;
      assert.equal(actualValue('canSendRequest', s.context), false, key); s.environment[key] = original;
    }
  });
  await checkAsync('a deferred booking preflight cannot submit after same-identity logout and login', async () => {
    const s = setupSubmit();
    let caught;
    const attempt = s.submit().catch(error => { caught = error; });
    await flush();
    if (caught && caught !== s.stop) throw caught;
    assert.deepEqual(s.events, ['policy-read', 'catalog-read']);
    s.environment.customerRegistrationSessionGenerationRef.current += 1;
    s.release(); await attempt;
    if (caught && caught !== s.stop) throw caught;
    assert.equal(s.submitted.length, 0,
      'An operation started in the retired session must not acquire the new session generation and submit its old draft.');
    assert.equal(s.events.some(event => Array.isArray(event) && event[0] === 'apply-snapshot'), false,
      'A retired preflight must not reload its previous snapshot into the new session.');
  });
  await checkAsync('an unchanged session still reaches the ordinary booking authority exactly once', async () => {
    const s = setupSubmit();
    const attempt = s.submit().catch(error => { assert.equal(error, s.stop); });
    await flush(); s.release(); await attempt;
    assert.equal(s.submitted.length, 1);
    assert.equal(s.submitted[0].servizio, service.nome);
    assert.equal(s.submitted[0].durataMinuti, 30);
    assert.equal(s.submitted[0].prezzo, 20);
  });
  await checkAsync('late preflight after salon change or unmount cannot apply or submit old state', async () => {
    for (const retire of [e => { e.customerRegistrationIdentityRef.current = 'another-salon|another-customer'; },
      e => { e.customerRegistrationMountedRef.current = false; }]) {
      const s = setupSubmit(); const attempt = s.submit(); await flush(); retire(s.environment);
      s.release(); await attempt;
      assert.equal(s.submitted.length, 0);
      assert.equal(s.events.some(event => Array.isArray(event) && event[0] === 'apply-snapshot'), false);
    }
  });
  await checkAsync('duplicate taps share the existing draft submission while preflight is pending', async () => {
    const s = setupSubmit();
    const first = s.submit().catch(error => { assert.equal(error, s.stop); });
    await flush(); await s.submit();
    assert.deepEqual(s.events, ['policy-read', 'catalog-read']);
    s.release(); await first; assert.equal(s.submitted.length, 1);
    assert.equal(s.environment.bookingRequestSubmitting, false);
  });
  await checkAsync('quote-not-ready and pending admission stop before any booking preflight', async () => {
    for (const changes of [{ bookingPaymentQuoteReady: false }, { customerRegistrationCanBook: false },
      { currentBookingPaymentHold: { requestId: 'unpaid-reservation' } }]) {
      const s = setupSubmit(); Object.assign(s.environment, changes); await s.submit();
      assert.equal(s.events.length, 0); assert.equal(s.submitted.length, 0);
      if (changes.customerRegistrationCanBook === false) assert.equal(s.alerts[0].title, 'Registrazione in attesa');
    }
  });
  await checkAsync('same-day second booking asks for family/friend confirmation then rejects a retired session', async () => {
    const s = setupSubmit();
    s.snapshot.appuntamenti = [{ id: 'existing', cliente: 'Cliente Test', data: s.environment.data,
      ora: '09:00', servizio: service.nome, durataMinuti: 30, operatoreId: operator.id }];
    let confirm;
    s.environment.showBookingFlowConfirm = (title, message) => {
      s.events.push(['confirm', title, message]); return new Promise(resolve => { confirm = resolve; });
    };
    const attempt = s.submit(); await flush(); s.release(); await flush();
    assert.equal(typeof confirm, 'function');
    s.environment.customerRegistrationSessionGenerationRef.current += 1;
    confirm(true); await attempt; assert.equal(s.submitted.length, 0);
  });
  await checkAsync('same-day same-service policy blocks a second single booking before persistence', async () => {
    const s = setupSubmit(); s.environment.customerOnlineBookingPolicy.allowSameDaySameService = false;
    s.snapshot.appuntamenti = [{ id: 'existing', cliente: 'Cliente Test', data: s.environment.data,
      ora: '09:00', servizio: service.nome, durataMinuti: 30, operatoreId: operator.id }];
    const attempt = s.submit(); await flush(); s.release(); await attempt;
    assert.equal(s.submitted.length, 0); assert.equal(s.alerts[0].title, 'Parte del servizio gia presente');
  });
  await checkAsync('fresh catalog removal and incompatible operator clear the obsolete draft without submitting', async () => {
    for (const type of ['service', 'operator']) {
      const s = setupSubmit();
      if (type === 'service') s.snapshot.servizi = [{ ...service, id: 'replacement-service', nome: 'Piega' }];
      else s.snapshot.operatori = [{ ...operator, id: 'replacement-operator', nome: 'Alex' }];
      const attempt = s.submit(); await flush(); s.release(); await attempt;
      assert.equal(s.submitted.length, 0); assert.equal(s.environment.ora, '');
      assert.equal(s.alerts[0].title, type === 'service' ? 'Servizio non più disponibile' : 'Operatore non disponibile');
    }
  });
  const report = { platform: 'isolated actual frontend callbacks; planner RPCs stubbed; no browser/device proof',
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), cases: records,
    remoteApiCalls: 0, persistentBookings: 0, payments: 0, sourceModifiedByHarness: false,
    correctionsUnderTest: ['booking preflight remains tied to the initiating session generation'] };
  if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
  else console.log(`PASS ${records.length} actual booking draft scenarios: geometry, planner routing, stale response/timeout isolation, partial batches and submit safety gates. No remote calls or UI validation.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
