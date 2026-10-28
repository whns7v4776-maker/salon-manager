const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'app/cliente-screen.tsx');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) { let found; function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); } visit(ast); assert.ok(found, 'Missing source function'); return found; }
const login = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loginFrontendCliente').getText(ast);
const resume = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'resumeNativeCustomerAccess').getText(ast);
const claim = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'claimFrontendClientAppSession').getText(ast);
const release = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'releaseFrontendClientAppSession').getText(ast);
const logout = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'performFrontendLogout').getText(ast);
const register = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'saveProfile').getText(ast);
const nativeCandidateExpression = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'isNativeCustomerSessionResume').initializer.getText(ast);
const pendingExpression = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'isFrontendAutoLoginPresentationPending').initializer.getText(ast);
const compile = value => ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true }).outputText;
const moduleSource = fs.readFileSync(path.join(root, 'src/lib/client-native-session.ts'), 'utf8');
const moduleCode = compile(moduleSource);
const extractedSource = `${login}\n${resume}\nconst ${claim};\nconst ${release};\nconst ${logout};\nconst ${register};`;
const code = compile(`${extractedSource}\nexports.login = loginFrontendCliente; exports.resume = resumeNativeCustomerAccess; exports.logout = performFrontendLogout; exports.register = saveProfile;`);
const base = { salonCode: 'fixture-salon', email: 'customer@example.test', phone: '3003003000', customerId: '12345678-1234-4234-8234-123456789abc', appInstanceId: 'fixture-installation', passwordRequired: true };
const row = { salonCode: base.salonCode, email: base.email, telefono: base.phone, customerId: base.customerId, passwordRequired: true, nome: 'Fixture Customer', instagram: '', score: 4, sameScoreCount: 1, registrationStatus: 'approved' };
const catalog = { workspace: { salonCode: base.salonCode, id: '87654321-4321-4321-8321-cba987654321' }, servizi: [{ id: 'fixture-service' }], operatori: [], clienti: [{ id: base.customerId, nome: row.nome, email: base.email, telefono: base.phone }] };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(platform = 'ios', config = {}) {
  const storage = new Map([['salon_manager_frontend_client_app_instance_id', base.appInstanceId]]);
  const secure = new Map(); const calls = []; const values = {}; const timers = new Map(); let timerSequence = 0; let time = 0;
  const setTimer = (callback, delay) => { const key = ++timerSequence; timers.set(key, { callback, at: time + delay }); return key; };
  const clearTimer = key => timers.delete(key);
  const asyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { calls.push(['storage', key]); storage.set(key, value); }, removeItem: async key => storage.delete(key), multiSet: async items => { for (const [key, value] of items) storage.set(key, value); }, multiRemove: async items => { for (const key of items) storage.delete(key); } };
  const secureStorage = { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async key => secure.get(key) ?? null, setItemAsync: async (key, value) => secure.set(key, value), deleteItemAsync: async key => secure.delete(key) };
  const sessionExports = {};
  vm.runInNewContext(moduleCode, { exports: sessionExports, require: name => ({ 'react-native': { Platform: { OS: platform } }, 'expo-secure-store': secureStorage, '@react-native-async-storage/async-storage': { default: asyncStorage } })[name], Date, Math, Promise });
  const deadlineExports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/client-request-deadline.ts'), 'utf8')), { exports: deadlineExports, setTimeout: setTimer, clearTimeout: clearTimer, Promise, Error });
  const context = {
    exports: {}, Platform: { OS: platform }, Promise, Date, Math, Number, String, console: { log() {} }, requestAnimationFrame: callback => callback(),
    ...sessionExports, AsyncStorage: asyncStorage, withClientDeadline: deadlineExports.withClientDeadline,
    useCallback: value => value, customerRegistrationMountedRef: { current: true }, customerRegistrationSessionGenerationRef: { current: 0 },
    nativeCustomerAccessGenerationRef: { current: 0 }, restoredNativeCustomerSessionRef: { current: null },
    frontendLoginDraft: { email: base.email, telefono: base.phone }, frontendLoginPassword: 'fixture-password',
    selectedSalonCode: base.salonCode, resolvedInitialSalonCodeParam: base.salonCode, normalizedSelectedSalonCode: base.salonCode,
    normalizedInitialAutoLoginEmail: base.email, normalizedInitialAutoLoginPhone: base.phone,
    isNativeCustomerSessionResume: true, isSavingProfile: false,
    normalizeSalonCode: value => String(value ?? '').trim().toLowerCase(), normalizeEmail: value => String(value ?? '').trim().toLowerCase(),
    limitPhoneToTenDigits: value => String(value ?? '').replace(/\D+/g, '').slice(0, 10), formatCustomerNamePart: value => value,
    buildStoredProfileFallback: () => null, latestPublicSalonStateRef: { current: null }, latestPublicSalonStateUpdatedAtRef: { current: 0 },
    FRONTEND_PUBLIC_SALON_CACHE_MAX_AGE_MS: 30000, publicSalonState: null, effectiveClienti: catalog.clienti,
    hasResolvedSalonCatalog: value => Boolean(value?.servizi?.length), hasSavedProfileForSelectedSalon: false,
    frontendLoginCredentialsFromBiometricProfile: false, frontendBiometricEnabled: false, rememberFrontendLogin: false,
    EMPTY_PROFILE: {}, profile: { nome: 'Fixture', cognome: 'Customer', email: base.email, telefono: base.phone, instagram: '' }, clearCustomBarNotifications() {}, clearFrontendClientSessionHeartbeat() {},
    isSchemaCacheTransientError: () => false, formatFrontendAccessError: error => error?.message ?? String(error), logClientFrontendStartup() {},
    publicSupabase: { rpc: async (name, args) => { calls.push(['rpc', name, args]); if (name === 'find_public_customer_by_password') return config.lookup ? config.lookup(args) : { data: { ...row, ...config.row }, error: null }; if (name === 'claim_public_customer_app_session') return config.claim ? config.claim(args) : { data: [{ ok: true }], error: null }; if (name === 'release_public_customer_app_session') return config.release ? config.release(args) : { data: true, error: null }; throw Error(`Unexpected RPC ${name}`); } },
    hydrateFrontendSalonStateAfterLogin: async () => { calls.push(['hydrate']); return config.hydrate ? config.hydrate() : catalog; },
    applyMergedPublicSalonState: value => calls.push(['catalog', value]),
    buildCustomerRegistrationIdentityKey: ({ salonCode, email, phone }) => `${salonCode}|${email}|${phone}`, normalizeCustomerRegistrationStatus: value => value,
    customerRegistrationRemovedIdentityRef: { current: '' }, FRONTEND_PROFILE_KEY: 'profile', FRONTEND_LAST_SALON_CODE_KEY: 'last-salon',
    buildFrontendProfileKeyForSalon: value => `profile-${value}`, persistFrontendBiometricSnapshot: async () => {}, persistRememberedFrontendLogin: async () => {}, clearRememberedFrontendLogin: async () => {},
    isFrontendRequestsRoute: false, shouldStartInBookingMode: true, readFrontendBiometricEnabledSetting: async () => 'true',
    writeFrontendWebActiveSession: value => calls.push(['web-session', value]),
    saveClientPasswordToVault: async value => { calls.push(['vault-save']); if (config.vaultWriteFailure) throw Error('secure-unavailable'); values.vaultPassword = value.password; },
    readClientPasswordFromVault: async () => { calls.push(['vault-read']); return config.vaultPassword ?? values.vaultPassword ?? 'fixture-password'; },
    ensureFrontendClientAppInstanceId: async () => base.appInstanceId, resolveFrontendClientPlatform: () => platform,
    FRONTEND_CLIENT_SESSION_STALE_SECONDS: 180, FRONTEND_CLIENT_SESSION_CONFLICT_MESSAGE: 'existing-device-conflict',
    isUuidValue: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    setFrontendPostLoginPromptPending: async () => calls.push(['new-prompts']), authenticateCustomerPayment: async () => calls.push(['financial-auth']),
    scrollRef: { current: { scrollTo() {} } }, frontendClientSessionIdentityRef: { current: null }, frontendClientSessionConflictAlertShownRef: { current: false },
    isSalonCustomerEmailCompletionCandidate: () => false, initialAutoLoginParam: '1', effectiveWorkspace: catalog.workspace,
    invalidateCustomerPaymentToken: async () => calls.push(['invalidate-financial']), clearFrontendWebActiveSession() {}, setApplicationBadgeSuppressed: async () => {},
    canSaveProfile: true, clientRegisterPassword: 'fixture-password', clientRegisterPasswordConfirm: 'fixture-password', isValidPersonNamePart: () => true, isValidEmail: () => true, isValidPhone10: () => true, validateStrongPassword: () => ({ valid: true }),
    normalizedSelectedSalonCode: base.salonCode, clientEmailOtpVerifiedFor: base.email, clientEmailOtpSalonCode: base.salonCode, clientEmailOtpVerifiedAt: Date.now(), clientEmailOtpSentTo: '', clientEmailOtpExpiresAt: 0,
    findFrontendCustomerDuplicate: async () => config.duplicate ? config.duplicate() : null, upsertFrontendCustomerForSalon: async value => { calls.push(['upsert', value]); return config.upsert ? config.upsert(value) : { ok: true, registrationStatus: 'approved' }; }, effectiveAvailabilitySettings: { customerRegistrationApprovalRequired: false },
    buildFrontendRegistrationWelcomePendingKey: () => 'welcome-pending',
    isRegistered: false, FRONTEND_SAVED_SALON_CODES_KEY: 'saved-salons', buildSavedSalonCodeList: value => value, initialJoinCodeParam: '', isFrontendJoinRoute: false, redirectToFrontendAccess: value => calls.push(['redirect', value]),
    scheduleFrontendSalonCatalogRetry() {}, buildOtherSalonSuggestion: async () => '', requestLoginEmailCompletionOtp: async () => calls.push(['otp']),
  };
  const extractedAst = ts.createSourceFile('extracted.ts', extractedSource, ts.ScriptTarget.Latest, true);
  function walk(node) {
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (/^set[A-Z]/.test(name) && !Object.hasOwn(context, name)) context[name] = value => { values[name] = typeof value === 'function' ? value(values[name]) : value; calls.push([name, values[name]]); };
      if (/Ref$/.test(name) && !Object.hasOwn(context, name)) context[name] = { current: false };
    }
    ts.forEachChild(node, walk);
  }
  walk(extractedAst);
  vm.createContext(context); vm.runInContext(code, context, { filename: file });
  const identity = { ...base, version: 1, platform };
  const seed = async () => { assert.equal(await sessionExports.persistNativeCustomerSession(base, 0), true); calls.length = 0; };
  const read = () => sessionExports.readNativeCustomerSession();
  const resetCalls = () => { calls.length = 0; };
  const advance = async duration => { time += duration; for (const [key, timer] of [...timers]) if (timer.at <= time) { timers.delete(key); timer.callback(); } await flush(); };
  return { context, api: context.exports, session: sessionExports, calls, values, identity, seed, read, resetCalls, config, advance, storage };
}
const tests = []; const test = (name, run) => tests.push({ name, run });
const wasRegistered = f => f.calls.some(call => call[0] === 'setIsRegistered' && call[1] === true);
const claims = f => f.calls.filter(call => call[0] === 'rpc' && call[1] === 'claim_public_customer_app_session');
for (const platform of ['ios', 'android']) {
  test(`${platform}: manual server-validated login creates durable session`, async () => {
    const f = fixture(platform); await f.api.login(); assert.equal(wasRegistered(f), true); const saved = await f.read(); assert.equal(saved.customerId, base.customerId); assert.equal(f.storage.get('salon_manager_landing_last_audience'), 'client'); assert.equal(f.values.vaultPassword, 'fixture-password'); assert.equal(claims(f)[0][2].p_stale_after_seconds, 180); assert.equal(f.calls.filter(call => call[0] === 'new-prompts').length, 1);
  });
  test(`${platform}: reopen freshly validates password and exact immutable identity without Face ID or new prompts`, async () => {
    const f = fixture(platform); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), true); assert.equal(claims(f).length, 1); assert.equal(f.calls.filter(call => call[0] === 'new-prompts').length, 0); const lookup = f.calls.find(call => call[0] === 'rpc'); assert.equal(lookup[1], 'find_public_customer_by_password'); assert.equal(lookup[2].p_customer_password, 'fixture-password');
  });
  test(`${platform}: no marker cannot resume from saved contacts alone`, async () => {
    const f = fixture(platform); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.equal(f.calls.some(call => call[0] === 'rpc'), false); assert.equal(f.values.setNativeCustomerResumeRetryable, false);
  });
}
for (const [name, changed] of [['deleted and recreated customer', { customerId: '87654321-4321-4321-8321-cba987654321' }], ['changed email', { email: 'other@example.test' }], ['changed phone', { telefono: '4004004000' }], ['another salon', { salonCode: 'another-salon' }], ['ambiguous match', { sameScoreCount: 2 }], ['missing UUID', { customerId: '' }]]) {
  test(`resume rejects ${name} before claiming and revokes marker`, async () => {
    const f = fixture('ios', { row: changed }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.equal(claims(f).length, 0); assert.equal(await f.read(), null); assert.equal(f.values.setIsSavingProfile, false);
  });
}
for (const message of ['customer_password_required', 'invalid_customer_password']) {
  test(`authoritative ${message} requires manual credentials`, async () => {
    const f = fixture('ios', { lookup: async () => ({ data: null, error: { message } }) }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.equal(claims(f).length, 0); assert.equal(await f.read(), null); assert.equal(f.values.setIsSavingProfile, false);
  });
}
test('removed customer cannot fall back to public catalog cached profile', async () => {
  const f = fixture('ios', { lookup: async () => ({ data: null, error: null }) }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.equal(claims(f).length, 0); assert.equal(await f.read(), null); assert.ok(!f.calls.some(call => call[0] === 'hydrate'));
});
test('network outage keeps durable session and exposes retry without authenticating', async () => {
  const f = fixture('ios', { lookup: async () => { throw Error('offline'); } }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setNativeCustomerResumeRetryable, true); assert.equal(f.values.setIsSavingProfile, false); assert.equal(f.values.setAccessMode, 'login');
  f.config.lookup = undefined; f.resetCalls(); await f.api.resume(); assert.equal(wasRegistered(f), true);
});
test('secure password read failure retains marker but never bypasses required password', async () => {
  const f = fixture('ios', { vaultPassword: '' }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setNativeCustomerResumeRetryable, true); assert.equal(claims(f).length, 0); assert.ok(!f.calls.some(call => call[0] === 'rpc'));
});
test('legacy password-free server account can resume but still requires current server identity', async () => {
  const f = fixture('android', { row: { passwordRequired: false }, vaultPassword: '' }); assert.equal(await f.session.persistNativeCustomerSession({ ...base, passwordRequired: false }, 0), true); f.resetCalls(); await f.api.resume(); assert.equal(wasRegistered(f), true); assert.equal(claims(f).length, 1);
});
test('single-device claim conflict retains safeguards and does not authorize', async () => {
  const f = fixture('ios', { claim: async () => ({ data: [{ ok: false }], error: null }) }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setFrontendAccessConflictError, 'existing-device-conflict');
});
test('claim transport error retains session and makes retry possible', async () => {
  const f = fixture('ios', { claim: async () => ({ data: null, error: { message: 'offline' } }) }); await f.seed(); await f.api.resume(); assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setIsSavingProfile, false);
});
for (const operation of ['lookup', 'claim', 'hydrate']) {
  test(`hung ${operation} is bounded and retains marker`, async () => {
    const pending = deferred(); const config = { [operation]: () => pending.promise }; const f = fixture('ios', config); await f.seed(); const running = f.api.resume(); await flush(); await f.advance(22001); await running; assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setIsSavingProfile, false);
  });
  test(`logout during ${operation} rejects late completion and marker resurrection`, async () => {
    const pending = deferred(); const config = { [operation]: () => pending.promise }; const f = fixture('ios', config); await f.seed(); const running = f.api.resume(); await flush(); const cleanup = f.api.logout(); pending.resolve(operation === 'hydrate' ? catalog : operation === 'claim' ? { data: [{ ok: true }], error: null } : { data: row, error: null }); await running; await cleanup; assert.equal(wasRegistered(f), false); assert.equal(await f.read(), null); assert.equal(f.context.frontendClientSessionIdentityRef.current, null);
  });
}
test('new login supersedes older in-flight lookup', async () => {
  const pending = deferred(); let attempts = 0; const f = fixture('ios', { lookup: async () => ++attempts === 1 ? pending.promise : { data: row, error: null } }); await f.seed(); const old = f.api.resume(); await flush(); await f.api.login(); pending.resolve({ data: row, error: null }); await old; assert.equal(f.calls.filter(call => call[0] === 'setIsRegistered' && call[1]).length, 1); assert.equal(claims(f).length, 1);
});
test('unmount during server validation rejects late response', async () => {
  const pending = deferred(); const f = fixture('ios', { lookup: () => pending.promise }); await f.seed(); const running = f.api.resume(); await flush(); f.context.customerRegistrationMountedRef.current = false; pending.resolve({ data: row, error: null }); await running; assert.equal(wasRegistered(f), false); assert.equal(claims(f).length, 0);
});
test('secure vault write failure keeps validated live access but creates no durable session', async () => {
  const f = fixture('ios', { vaultWriteFailure: true }); await f.api.login(); assert.equal(wasRegistered(f), true); assert.equal(await f.read(), null);
});
test('web fresh login preserves web session flow and creates no native marker', async () => {
  const f = fixture('web'); await f.api.login(); assert.equal(wasRegistered(f), true); assert.equal(await f.read(), null); assert.equal(f.calls.filter(call => call[0] === 'new-prompts').length, 1); assert.equal(f.calls.filter(call => call[0] === 'web-session').length, 1);
});

for (const operation of ['lookup', 'claim', 'hydrate']) {
  test(`changing salon during ${operation} rejects the old screen response`, async () => {
    const pending = deferred(); const f = fixture('ios', { [operation]: () => pending.promise }); await f.seed(); const running = f.api.resume(); await flush(); f.context.customerRegistrationSalonRef.current = 'different-salon'; pending.resolve(operation === 'hydrate' ? catalog : operation === 'claim' ? { data: [{ ok: true }], error: null } : { data: row, error: null }); await running; assert.equal(wasRegistered(f), false);
  });
}
test('changing route credentials during lookup rejects the old screen response', async () => {
  const pending = deferred(); const f = fixture('ios', { lookup: () => pending.promise }); await f.seed(); const running = f.api.resume(); await flush(); f.context.nativeCustomerAccessRouteRef.current = 'different-route'; pending.resolve({ data: row, error: null }); await running; assert.equal(wasRegistered(f), false); assert.equal(claims(f).length, 0);
});
test('catalog unavailable plus hung release is bounded without deleting resumable marker', async () => {
  const pending = deferred(); const f = fixture('ios', { hydrate: async () => null, release: () => pending.promise }); await f.seed(); const running = f.api.resume(); await flush(); await f.advance(22001); await running; assert.equal(wasRegistered(f), false); assert.ok(await f.read()); assert.equal(f.values.setIsSavingProfile, false);
});
for (const platform of ['ios', 'android']) {
  test(`${platform}: verified registration stores immutable fresh server identity without delaying entry`, async () => {
    const pending = deferred(); const f = fixture(platform, { lookup: () => pending.promise }); await f.api.register(); assert.equal(wasRegistered(f), true); assert.equal(await f.read(), null); pending.resolve({ data: row, error: null }); await flush(); assert.equal((await f.read()).customerId, base.customerId); assert.equal(f.storage.get('salon_manager_landing_last_audience'), 'client');
  });
  test(`${platform}: logout during registration's ID lookup cannot recreate marker`, async () => {
    const pending = deferred(); const f = fixture(platform, { lookup: () => pending.promise }); await f.api.register(); const cleanup = f.api.logout(); pending.resolve({ data: row, error: null }); await flush(); await cleanup; assert.equal(await f.read(), null);
  });
}
test('wrong registration server contacts cannot create persistent marker', async () => {
  const f = fixture('ios', { row: { email: 'other@example.test' } }); await f.api.register(); await flush(); assert.equal(wasRegistered(f), true); assert.equal(await f.read(), null);
});
test('logout during registration upsert rejects late UI and session', async () => {
  const pending = deferred(); const f = fixture('ios', { upsert: () => pending.promise }); const running = f.api.register(); await flush(); const cleanup = f.api.logout(); pending.resolve({ ok: true }); await running; await cleanup; assert.equal(wasRegistered(f), false); assert.equal(await f.read(), null);
});
test('logout during duplicate lookup cannot subsequently submit a registration', async () => {
  const pending = deferred(); const f = fixture('ios', { duplicate: () => pending.promise }); const running = f.api.register(); await flush(); const cleanup = f.api.logout(); pending.resolve(null); await running; await cleanup; assert.equal(wasRegistered(f), false); assert.ok(!f.calls.some(call => call[0] === 'upsert'));
});


for (const platform of ['ios', 'android']) {
  test(`${platform}: cold booking route without autologin params resumes only the real durable marker`, async () => {
    const f = fixture(platform); await f.seed(); f.context.normalizedInitialAutoLoginEmail = ''; f.context.normalizedInitialAutoLoginPhone = ''; await f.api.resume(); assert.equal(wasRegistered(f), true); assert.equal(claims(f).length, 1);
  });
}
function candidate(overrides = {}) {
  return vm.runInNewContext(nativeCandidateExpression, { Platform: { OS: 'ios' }, isBiometricRouteAutoLogin: false, initialBiometricParam: undefined, initialRegistrationOnlyParam: undefined, initialNativeSessionParam: undefined, initialAutoLoginParam: undefined, initialModeParam: 'booking', ...overrides });
}
for (const [name, changed, expected] of [
  ['cold native booking', {}, true], ['index persisted native route', { initialNativeSessionParam: '1', initialAutoLoginParam: '1' }, true],
  ['explicit manual login', { initialModeParam: 'login', initialNativeSessionParam: '1', initialAutoLoginParam: '1' }, false],
  ['explicit registration', { initialModeParam: 'register' }, false], ['registration-only route', { initialRegistrationOnlyParam: '1' }, false],
  ['biometric access route', { initialBiometricParam: '1' }, false], ['web booking route', { Platform: { OS: 'web' } }, false],
]) test(`actual native resume eligibility: ${name}`, async () => assert.equal(candidate(changed), expected));
function pending(overrides = {}) {
  return vm.runInNewContext(pendingExpression, { isRegistered: false, isNativeCustomerSessionResume: true, profileSaveError: '', frontendAccessConflictError: '', manualClientLoginBlockedRef: { current: false }, isHomeAutoLoginFlow: true, isRestoringFrontendWebSession: false, ...overrides });
}
for (const [name, changed, expected] of [
  ['healthy resume shows loading', {}, true], ['network error exposes actual recovery UI', { profileSaveError: 'offline' }, false],
  ['cold native route shows loading', { isHomeAutoLoginFlow: false }, true], ['completed resume hides loading', { isRegistered: true }, false],
  ['existing web presentation rule preserved', { isNativeCustomerSessionResume: false, profileSaveError: 'offline' }, true],
]) test(`actual presentation selector: ${name}`, async () => assert.equal(pending(changed), expected));

(async () => { for (const item of tests) { await item.run(); process.stdout.write(`PASS ${item.name}\n`); } process.stdout.write(`${tests.length}/${tests.length} actual customer-screen login runtime tests passed; source SHA256 ${crypto.createHash('sha256').update(source).digest('hex')}\n`); })().catch(error => { console.error(error); process.exitCode = 1; });
