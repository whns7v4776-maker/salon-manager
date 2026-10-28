/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const homeSource = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'app/cliente-screen.tsx'), 'utf8');
const globalCss = fs.readFileSync(path.join(root, 'app/global.css'), 'utf8');
const clientAst = ts.createSourceFile('cliente-screen.tsx', clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const clientNodes = [];
const collectClientNode = node => { clientNodes.push(node); ts.forEachChild(node, collectClientNode); };
collectClientNode(clientAst);
const declarationInitializer = name => {
  const declaration = clientNodes.find(node => ts.isVariableDeclaration(node) && node.name.getText(clientAst) === name);
  assert.ok(declaration?.initializer, `Missing actual customer declaration: ${name}`);
  return declaration.initializer.getText(clientAst);
};
const evaluateCustomerGuard = (name, bindings) => vm.runInNewContext(ts.transpileModule(
  `globalThis.result = (${declarationInitializer(name)});`,
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } },
).outputText, bindings) ?? bindings.result;

const homeRestoreStart = homeSource.indexOf(
  'const activeSession = readFrontendWebActiveSession();',
);
const homeRestoreEnd = homeSource.indexOf(
  'window.location.replace(`/cliente?',
  homeRestoreStart,
);
assert.ok(homeRestoreStart >= 0 && homeRestoreEnd > homeRestoreStart);
const homeRestoreSource = homeSource.slice(homeRestoreStart, homeRestoreEnd + 160);

assert.match(
  homeRestoreSource,
  /loadedClientSessionKey[\s\S]*?normalizedIncomingSalonCode !== activeSession\.salonCode[\s\S]*?window\.location\.replace\(`\/cliente\?/,
  'The public landing must reopen the verified client route after its local session has hydrated.',
);
assert.doesNotMatch(
  homeRestoreSource,
  /hasSavedClientProfile|sameEmail|samePhone/,
  'Landing restoration must not log the customer out because a duplicated profile snapshot has a different format.',
);
assert.match(
  clientSource,
  /pendingWebSessionRestore[\s\S]*?heartbeatFrontendClientAppSession\(\)[\s\S]*?claimFrontendClientAppSession[\s\S]*?verifiedSession\.ok[\s\S]*?setIsRegistered\(true\)/,
  'The client page must revalidate a restored web session against the server before opening the account.',
);
assert.equal(
  declarationInitializer('isRestoringFrontendWebSession').replace(/\s+/g, ' '),
  "Platform.OS === 'web' && !isRegistered && pendingWebSessionRestore !== null",
  'Only a pending, unregistered web session can enter web restoration.',
);
assert.equal(
  declarationInitializer('isFrontendAutoLoginPresentationPending').replace(/\s+/g, ' '),
  '!isRegistered && (!isNativeCustomerSessionResume || !profileSaveError) && !frontendAccessConflictError && !manualClientLoginBlockedRef.current && (isHomeAutoLoginFlow || isRestoringFrontendWebSession || isNativeCustomerSessionResume)',
  'Pending web and native resumption must retain conflict/manual guards and expose native retry errors.',
);
assert.equal(evaluateCustomerGuard('shouldShowFrontendAccessForm', {
  hasHydratedFrontendSession: true, isRegistered: false, isRestoringFrontendWebSession: true,
  isFrontendAutoLoginPresentationPending: false, shouldAutoCompleteSavedProfileAccess: false,
  shouldBootstrapFrontendRequestsPage: false, shouldBootstrapLinkedSalonAccess: false,
  shouldHoldBiometricAutoLoginScreen: false,
}), false, 'A pending web restore must never expose an access form.');
assert.match(
  clientSource,
  /if \(\s*isRegistered \|\|\s*pendingWebSessionRestore \|\|[\s\S]*?router\.replace\(\{\s*pathname: '\/'/,
  'The client page must not redirect to landing while a verified web session is being restored.',
);
assert.match(
  clientSource,
  /writeFrontendWebActiveSession\([\s\S]*?setIsRegistered\(true\)/,
  'A web session marker must only be written on a completed customer access flow.',
);
assert.match(
  clientSource,
  /performFrontendLogout[\s\S]*?clearFrontendWebActiveSession\(\)/,
  'Explicit customer logout must clear the active web session marker.',
);
assert.match(
  clientSource,
  /const showFrontendSessionConflictAlert[\s\S]*?window\.alert[\s\S]*?onConfirm\(\)[\s\S]*?Alert\.alert\('Accesso gia attivo',[\s\S]*?text: 'OK', onPress: onConfirm[\s\S]*?cancelable: false/,
  'Web and native conflict dialogs must make OK complete the same mandatory action.',
);
assert.match(
  clientSource,
  /if \(!frontendAccessConflictError\)[\s\S]*?showFrontendSessionConflictAlert\(frontendAccessConflictError,[\s\S]*?performFrontendLogoutRef\.current[\s\S]*?logout\(\{ sessionConflict: true \}\)\.finally/,
  'Every multi-device conflict must route its single dialog confirmation through the full customer logout.',
);
assert.match(
  clientSource,
  /const performFrontendLogout = async \(options\?: \{ sessionConflict\?: boolean; customerRemoved\?: boolean \}\) => \{[\s\S]*?manualClientLoginBlockedRef\.current = true;[\s\S]*?autoCredentialLoginAttemptedRef\.current = true;[\s\S]*?setPendingWebSessionRestore\(null\);[\s\S]*?setIsSavingProfile\(false\);[\s\S]*?setFrontendBiometricBusy\(false\);[\s\S]*?setFrontendAccessConflictError\(''\);[\s\S]*?options\?\.sessionConflict !== true[\s\S]*?redirectToFrontendAccess\(/,
  'Conflict logout must clear pending and busy state, block automatic retry, and return to customer access.',
);
assert.match(
  clientSource,
  /const shouldHoldBiometricAutoLoginScreen =\s*!isRegistered &&\s*!manualClientLoginBlockedRef\.current &&/,
  'A confirmed conflict logout must not fall back into the biometric bootstrap while cleanup redirects.',
);
const manualConflictStart = clientSource.indexOf('if (!sessionClaim.ok)');
const manualConflictEnd = clientSource.indexOf('let hydratedSalonState', manualConflictStart);
assert.ok(manualConflictStart >= 0 && manualConflictEnd > manualConflictStart);
assert.doesNotMatch(
  clientSource.slice(manualConflictStart, manualConflictEnd),
  /window\.alert|Alert\.alert/,
  'Manual login conflicts must not create a second platform-specific dialog.',
);
const heartbeatConflictStart = clientSource.indexOf('const forceFrontendClientSessionLogout = () =>');
const heartbeatConflictEnd = clientSource.indexOf('const verifyFrontendClientSession = async', heartbeatConflictStart);
assert.ok(heartbeatConflictStart >= 0 && heartbeatConflictEnd > heartbeatConflictStart);
assert.doesNotMatch(
  clientSource.slice(heartbeatConflictStart, heartbeatConflictEnd),
  /window\.alert|Alert\.alert|setIsRegistered\(false\)|frontendClientSessionIdentityRef\.current = null/,
  'Heartbeat conflicts must preserve the local identity until OK runs the authoritative logout once.',
);
assert.match(
  clientSource,
  /lastSyncedSalonCommunicationUnreadCountRef[\s\S]*?clientNotificationCommunicationUnreadCount[\s\S]*?void refreshSalonCommunications\(\{ silent: true \}\)/,
  'A live communication badge change must refresh the open customer communication list without reloading the page.',
);
assert.match(
  globalCss,
  /\[role='button'\]:not\(\[aria-disabled='true'\]\)[\s\S]*?cursor: pointer !important/,
  'Every enabled web control exposed as a button must use the hand cursor.',
);
const homeAst = ts.createSourceFile('index.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const homeNodes = [];
const collectHomeNode = node => { homeNodes.push(node); ts.forEachChild(node, collectHomeNode); };
collectHomeNode(homeAst);
const choiceButton = homeNodes.find(node => ts.isJsxElement(node) &&
  node.openingElement.getText(homeAst).includes('key={choice.audience}') &&
  node.openingElement.getText(homeAst).includes('setLandingAudience(choice.audience)'));
assert.ok(choiceButton, 'Missing actual audience choice control.');
const choiceRole = choiceButton.openingElement.attributes.properties.find(attribute =>
  ts.isJsxAttribute(attribute) && attribute.name.getText(homeAst) === 'accessibilityRole');
assert.equal(choiceRole?.initializer?.text, 'button', 'Each mapped audience selector must expose its clickable role.');
const choicePress = choiceButton.openingElement.attributes.properties.find(attribute =>
  ts.isJsxAttribute(attribute) && attribute.name.getText(homeAst) === 'onPress');
assert.ok(choicePress?.initializer && ts.isJsxExpression(choicePress.initializer));
for (const audience of ['client', 'owner']) {
  const calls = [];
  const bindings = { choice: { audience }, audiencePickerOpen: true,
    normalizedIncomingSalonCode: '', normalizedAssociatedSalonCode: 'first',
    cancelInstallRecovery() { calls.push('cancel'); },
    setLandingAudience(value) { calls.push(value); },
    setAudiencePickerOpen(value) { calls.push(value); },
    router: { replace(value) { calls.push(value); } } };
  vm.runInNewContext(ts.transpileModule(`globalThis.pressChoice = (${choicePress.initializer.expression.getText(homeAst)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText, bindings);
  bindings.pressChoice();
  assert.deepEqual(calls.slice(0, 3), ['cancel', audience, false], 'The mapped control must select its audience and close the chooser.');
  assert.equal(calls[3].params.side, audience);
  assert.equal(calls[3].params.salon, audience === 'client' ? 'first' : undefined);
}
assert.match(
  homeSource,
  /accessibilityRole="button"[\s\S]*?setClientEntryMode\('access'\)[\s\S]*?accessibilityRole="button"[\s\S]*?setClientEntryMode\('register'\)/,
  'The web login and registration selectors must expose their clickable role.',
);

const logoutStart = clientSource.indexOf('const performFrontendLogout = async (');
const logoutEnd = clientSource.indexOf('performFrontendLogoutRef.current = performFrontendLogout;', logoutStart);
assert.ok(logoutStart >= 0 && logoutEnd > logoutStart);
const logoutSource = clientSource.slice(logoutStart, logoutEnd);
const executableLogout = ts.transpileModule(`${logoutSource}\nglobalThis.invokeLogout = performFrontendLogout;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const loginStart = clientSource.indexOf('async function loginFrontendCliente(');
const loginSetupEnd = clientSource.indexOf('const manualLoginEmail =', loginStart);
assert.ok(loginStart >= 0 && loginSetupEnd > loginStart);
const executableLoginSetup = ts.transpileModule(`${clientSource.slice(loginStart, loginSetupEnd)}\n}\nglobalThis.invokeLoginSetup = loginFrontendCliente;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;

// Exercise the actual logout function for every platform. Registration refusal
// adds a scoped cleanup path; it must preserve the established conflict flow.
async function verifyLogoutBehavior(platform, options, race) {
  const events = [];
  const state = {};
  let resumeSlowOperation;
  let announceSlowOperation;
  const slowOperation = new Promise(resolve => { resumeSlowOperation = resolve; });
  const slowOperationStarted = new Promise(resolve => { announceSlowOperation = resolve; });
  const waitIfSlow = async stage => {
    if (race?.stage !== stage) return;
    announceSlowOperation();
    await slowOperation;
  };
  const scopedKeys = salon => [`profile:${salon}`, `biometric:${salon}`, `remember:${salon}`, `biometric-enabled:${salon}`];
  const storage = new Map([...scopedKeys('first'), ...scopedKeys('second')].map(key => [key, 'saved-access']));
  storage.set('saved-salons', JSON.stringify(['first', 'second']));
  const paymentIdentityKey = ({ salonCode, email, phone }) => [salonCode, email, phone].join('|');
  const currentPaymentIdentity = { salonCode: 'first', email: 'customer@test.it', phone: '3331234567' };
  const currentPaymentKey = paymentIdentityKey(currentPaymentIdentity);
  const otherPaymentKeys = [
    paymentIdentityKey({ ...currentPaymentIdentity, salonCode: 'second' }),
    paymentIdentityKey({ ...currentPaymentIdentity, email: 'other-customer@test.it' }),
  ];
  const paymentAccess = new Map([currentPaymentKey, ...otherPaymentKeys].map(key => [key, 'validated-token']));
  const paymentGenerations = new Map([[currentPaymentKey, 0]]);
  const paymentInvalidations = [];
  let finishPaymentPersistence;
  let finishOldVerification;
  let paymentPersistenceFinished = false;
  const paymentPersistence = new Promise(resolve => { finishPaymentPersistence = resolve; });
  const oldVerification = new Promise(resolve => { finishOldVerification = resolve; });
  const verificationGeneration = paymentGenerations.get(currentPaymentKey);
  const lateVerification = oldVerification.then(token => {
    if (paymentGenerations.get(currentPaymentKey) === verificationGeneration) paymentAccess.set(currentPaymentKey, token);
  });
  const bindings = {
    Platform: { OS: platform },
    effectiveWorkspace: { salonCode: 'first', id: '00000000-0000-0000-0000-000000000001', ownerEmail: 'owner@test.it' },
    normalizedSelectedSalonCode: 'first',
    profile: { email: 'customer@test.it', telefono: '3331234567' },
    isRegistered: true,
    initialAutoLoginParam: '1',
    initialJoinCodeParam: '',
    isFrontendJoinRoute: false,
    EMPTY_PROFILE: {},
    clearCustomerPortalIdentity: identity => events.push({ clearedPortalIdentity: identity }),
    FRONTEND_SAVED_SALON_CODES_KEY: 'saved-salons',
    FRONTEND_LAST_SALON_CODE_KEY: 'last-salon',
    normalizeSalonCode: value => value.trim().toLowerCase(),
    isUuidValue: () => true,
    buildSavedSalonCodeList: values => [...new Set(values)],
    buildFrontendProfileKeyForSalon: salon => `profile:${salon}`,
    buildFrontendBiometricProfileKeyForSalon: salon => `biometric:${salon}`,
    buildFrontendRememberLoginKey: salon => `remember:${salon}`,
    buildFrontendBiometricEnabledKey: ({ salonCode }) => `biometric-enabled:${salonCode}`,
    invalidateCustomerPaymentToken: async identity => {
      const actualIdentity = JSON.parse(JSON.stringify(identity));
      paymentInvalidations.push(actualIdentity);
      events.push('invalidate-payment-access');
      const key = paymentIdentityKey(actualIdentity);
      paymentGenerations.set(key, (paymentGenerations.get(key) ?? 0) + 1);
      paymentAccess.delete(key);
      await paymentPersistence;
      paymentPersistenceFinished = true;
    },
    setBookingPaymentQuote: value => { state.setBookingPaymentQuote = value; },
    setBookingPaymentQuoteReady: value => { state.setBookingPaymentQuoteReady = value; },
    setBookingPaymentQuoteIdentityKey: value => { state.setBookingPaymentQuoteIdentityKey = value; },
    invalidateNativeCustomerSession: async () => { events.push('invalidate-native-session'); },
    nativeCustomerSessionGeneration: () => 1,
    clearFrontendWebActiveSession: () => events.push('clear-web-session'),
    setApplicationBadgeSuppressed: async () => {
      events.push('suppress-badge');
      await waitIfSlow('badge');
    },
    registerPushNotifications: async () => events.push('preserve-push'),
    releaseFrontendClientAppSession: async () => {
      events.push('release-server-session');
      await waitIfSlow('release');
    },
    clearCustomBarNotifications: () => events.push('clear-custom-bar'),
    redirectToFrontendAccess: value => events.push({ redirect: value }),
    AsyncStorage: {
      getItem: async key => {
        await waitIfSlow('storage');
        return storage.get(key) ?? null;
      },
      multiRemove: async keys => keys.forEach(key => storage.delete(key)),
      multiSet: async entries => entries.forEach(([key, value]) => storage.set(key, value)),
    },
    console,
  };
  for (const [, setter] of `${logoutSource}\n${executableLoginSetup}`.matchAll(/\b(set[A-Z]\w*)\(/g)) {
    if (!(setter in bindings)) bindings[setter] = value => { state[setter] = value; };
  }
  for (const [, ref] of `${logoutSource}\n${executableLoginSetup}`.matchAll(/\b(\w+Ref)\.current/g)) {
    bindings[ref] = { current: 'previous-session' };
  }
  bindings.nativeCustomerAccessGenerationRef.current = 1;
  bindings.nativeCustomerAccessRouteRef.current = 'first';
  bindings.customerRegistrationMountedRef.current = true;
  bindings.customerRegistrationSessionGenerationRef.current = 1;
  bindings.customerRegistrationSalonRef.current = 'first';
  vm.runInNewContext(executableLogout, bindings);
  vm.runInNewContext(executableLoginSetup, bindings);
  const logoutPromise = bindings.invokeLogout(options);
  assert.deepEqual(paymentInvalidations, [currentPaymentIdentity], 'Logout must invalidate exactly the salon/customer payment identity being left.');
  assert.equal(state.setFrontendLogoutPending,true,'Logout must hide the old presentation before asynchronous cleanup.');
  assert.deepEqual(JSON.parse(JSON.stringify(events.find(event=>event?.clearedPortalIdentity)?.clearedPortalIdentity)),currentPaymentIdentity,'Only the exiting portal identity is cleared.');
  assert.equal(paymentAccess.has(currentPaymentKey), false, 'Payment access must be invalidated before the first logout await.');
  assert.equal(state.setBookingPaymentQuote, null, 'The previous payment quote must be cleared immediately.');
  assert.equal(state.setBookingPaymentQuoteReady, false, 'The previous quote cannot leave booking enabled during logout.');
  assert.equal(state.setBookingPaymentQuoteIdentityKey, '', 'The previous quote identity must be cleared with its readiness.');
  assert.ok(events.includes('invalidate-payment-access'), 'Payment invalidation must start before the first logout await.');
  assert.equal(events[0], 'invalidate-native-session', 'Native session invalidation must start synchronously on every explicit logout.');
  if (race) {
    await slowOperationStarted;
    // A new manual login/salon navigation may start while the old refusal is
    // awaiting its server release or storage operation. Execute that interleave.
    if (race.kind === 'unmount') bindings.customerRegistrationMountedRef.current = false;
    else {
      bindings.customerRegistrationSalonRef.current = ['same-salon-session', 'login-start'].includes(race.kind) ? 'first' : 'second';
      state.setSelectedSalonCode = bindings.customerRegistrationSalonRef.current;
      state.setProfile = { email: 'new-customer@test.it' };
      if (race.kind === 'login-start') {
        await bindings.invokeLoginSetup();
        state.setIsSavingProfile = true;
      } else if (race.kind !== 'salon-switch') {
        bindings.customerRegistrationSessionGenerationRef.current += 1;
        bindings.customerRegistrationIdentityRef.current = `${bindings.customerRegistrationSalonRef.current}|new-customer@test.it|3330000000`;
        state.setIsRegistered = true;
      }
    }
    resumeSlowOperation();
  }
  await logoutPromise;
  assert.ok(events.indexOf('invalidate-payment-access') < events.indexOf('suppress-badge'), 'Payment invalidation must precede asynchronous badge cleanup.');
  assert.equal(paymentPersistenceFinished, false, 'Slow financial-token persistence must not hold ordinary logout or registration cleanup open.');
  finishOldVerification('late-old-token');
  await lateVerification;
  assert.equal(paymentAccess.has(currentPaymentKey), false, 'A verification started before logout cannot restore the old scoped access.');
  finishPaymentPersistence();
  await paymentPersistence;
  for (const key of otherPaymentKeys) assert.equal(paymentAccess.get(key), 'validated-token', 'Other salons and other customer payment access must remain untouched.');
  assert.equal(events.filter(event => event === 'clear-web-session').length, 1);
  assert.equal(events.filter(event => event === 'release-server-session').length, race?.stage === 'badge' ? 0 : 1);
  assert.equal(bindings.manualClientLoginBlockedRef.current, true);
  assert.equal(bindings.autoCredentialLoginAttemptedRef.current, true);
  assert.equal(bindings.autoBiometricAttemptedRef.current, true);
  assert.equal(state.setPendingWebSessionRestore, null);
  assert.equal(state.setIsSavingProfile, race?.kind === 'login-start');
  assert.equal(state.setFrontendBiometricBusy, false);
  assert.equal(state.setFrontendAccessConflictError, '');
  const redirect = events.find(event => event?.redirect)?.redirect;
  if (race) {
    assert.equal(redirect, undefined, 'An old refusal must never redirect a new session or an unmounted screen.');
    assert.equal(events.includes('clear-custom-bar'), false, 'An old refusal must not clear the new session custom bar.');
    if (race.kind !== 'unmount') {
      assert.equal(state.setProfile.email, 'new-customer@test.it', 'The new customer profile must survive late refusal completion.');
      assert.equal(state.setSelectedSalonCode, ['same-salon-session', 'login-start'].includes(race.kind) ? 'first' : 'second');
      if (!['salon-switch', 'login-start'].includes(race.kind)) assert.equal(state.setIsRegistered, true);
    }
    assert.equal(storage.has('last-salon'), false, 'The late refusal must not overwrite the selected salon in storage.');
  } else {
    assert.equal(state.setIsRegistered, false);
    assert.ok(redirect, 'All current logout modes must return to customer access.');
    assert.equal(redirect.salonCode, 'first');
    assert.equal(redirect.preserveClientLock, options?.sessionConflict !== true);
    assert.equal(redirect.lockToClientSide, options?.sessionConflict !== true);
  }
  assert.equal(events.filter(event => event === 'preserve-push').length,
    platform !== 'web' && options?.customerRemoved !== true ? 1 : 0);
  for (const key of scopedKeys('second')) assert.equal(storage.get(key), 'saved-access', 'Other salon access must survive every logout mode.');
  for (const key of scopedKeys('first')) {
    assert.equal(storage.has(key), options?.customerRemoved !== true,
      'Only explicit registration refusal must remove the current salon saved access.');
  }
}

function verifyPendingPresentationGuards() {
  const defaults = { isRegistered: false, isNativeCustomerSessionResume: false,
    profileSaveError: '', frontendAccessConflictError: '', manualClientLoginBlockedRef: { current: false },
    isHomeAutoLoginFlow: false, isRestoringFrontendWebSession: false };
  assert.equal(evaluateCustomerGuard('isFrontendAutoLoginPresentationPending', {
    ...defaults, isRestoringFrontendWebSession: true,
  }), true, 'A web session still being verified must keep the neutral loader visible.');
  for (const platform of ['ios', 'android']) {
    const native = { ...defaults, Platform: { OS: platform }, isNativeCustomerSessionResume: true };
    assert.equal(evaluateCustomerGuard('isFrontendAutoLoginPresentationPending', native), true,
      `${platform} resumption must keep the loader while verification is pending.`);
    assert.equal(evaluateCustomerGuard('isFrontendAutoLoginPresentationPending', {
      ...native, profileSaveError: 'Verification could not complete',
    }), false, `${platform} failure must expose recovery rather than an indefinite loader.`);
  }
  for (const override of [{ isRegistered: true }, { frontendAccessConflictError: 'Conflict' },
    { manualClientLoginBlockedRef: { current: true } }]) {
    assert.equal(evaluateCustomerGuard('isFrontendAutoLoginPresentationPending', {
      ...defaults, isRestoringFrontendWebSession: true, isNativeCustomerSessionResume: true, ...override,
    }), false, 'Registration, a conflict, or explicit logout must prevent automatic presentation.');
  }
}

async function verifyFailedWebRestoreRecovery() {
  const effect = clientNodes.find(node => ts.isCallExpression(node) && node.expression.getText(clientAst) === 'useEffect' &&
    node.arguments[0]?.getText(clientAst).includes('const restoreWebSession = async () =>'));
  assert.ok(effect, 'Missing actual web restore effect.');
  let complete;
  const finished = new Promise(resolve => { complete = resolve; });
  const state = { pendingWebSessionRestore: { salonCode: 'first', email: 'customer@example.test', phone: '3331234567' },
    profileSaveError: '', isSavingProfile: false, registered: false, accessMode: '' };
  const bindings = {
    Platform: { OS: 'web' }, pendingWebSessionRestore: state.pendingWebSessionRestore,
    hasHydratedFrontendSession: true, isRegistered: false, isFrontendRequestsRoute: false,
    frontendClientSessionIdentityRef: { current: null },
    setIsSavingProfile(value) { state.isSavingProfile = value; if (!value) complete(); },
    setProfileSaveError(value) { state.profileSaveError = value; },
    setPendingWebSessionRestore(value) { state.pendingWebSessionRestore = value; },
    setAccessMode(value) { state.accessMode = value; },
    setIsRegistered(value) { state.registered = value; },
    heartbeatFrontendClientAppSession: async () => ({ ok: false, conflict: false }),
    claimFrontendClientAppSession: async () => ({ ok: false, conflict: false }),
    hydrateFrontendSalonStateAfterLoginRef: { current: () => { throw new Error('No hydration before verification'); } },
    console: { log() {} },
  };
  const runtime = ts.transpileModule(`globalThis.restoreEffect = (${effect.arguments[0].getText(clientAst)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  vm.runInNewContext(runtime, bindings);
  const cleanup = bindings.restoreEffect();
  await finished;
  assert.equal(state.registered, false, 'A failed restore must never open the account.');
  assert.equal(state.pendingWebSessionRestore, null, 'Failure must clear pending restoration.');
  assert.ok(state.profileSaveError, 'Recovery must show an actionable verification error.');
  assert.equal(state.accessMode, 'login');
  const isRestoringFrontendWebSession = evaluateCustomerGuard('isRestoringFrontendWebSession', {
    Platform: { OS: 'web' }, isRegistered: state.registered, pendingWebSessionRestore: state.pendingWebSessionRestore,
  });
  assert.equal(evaluateCustomerGuard('isFrontendAutoLoginPresentationPending', {
    isRegistered: state.registered, isNativeCustomerSessionResume: false, profileSaveError: state.profileSaveError,
    frontendAccessConflictError: '', manualClientLoginBlockedRef: { current: false },
    isHomeAutoLoginFlow: false, isRestoringFrontendWebSession,
  }), false, 'A failed web restore must release the loader for login recovery.');
  cleanup();
}

(async () => {
  verifyPendingPresentationGuards();
  await verifyFailedWebRestoreRecovery();
  for (const platform of ['web', 'ios', 'android']) {
    await verifyLogoutBehavior(platform, { sessionConflict: true });
    await verifyLogoutBehavior(platform, { customerRemoved: true });
    await verifyLogoutBehavior(platform);
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'badge', kind: 'new-session' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'release', kind: 'new-session' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'release', kind: 'same-salon-session' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'release', kind: 'login-start' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'release', kind: 'salon-switch' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'release', kind: 'unmount' });
    await verifyLogoutBehavior(platform, { customerRemoved: true }, { stage: 'storage', kind: 'new-session' });
  }
  console.log('Client web session, scoped registration refusal, conflict logout, payment-access invalidation and pointer contracts passed on web/iOS/Android.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
