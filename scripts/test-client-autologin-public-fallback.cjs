const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = process.env.AUDIT_CLIENT_SOURCE || path.join(root, 'app/cliente-screen.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
function parse(filename, source) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map(), effects = [];
  function walk(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !declarations.has(node.name.text)) declarations.set(node.name.text, node.initializer.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]) effects.push(node.arguments[0].getText(ast));
    ts.forEachChild(node, walk);
  }
  walk(ast);
  return { declarations, effects };
}
const client = parse(sourcePath, source);
const failureEffect = client.effects.find(effect => effect.includes("showBookingFlowAlert('Accesso non riuscito', profileSaveError)"));
assert.ok(failureEffect, 'Execute the real customer autologin failure effect');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const platform = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/platform.ts'), 'utf8')), platform);
const clientNames = ['resolvedOrIncomingSalonCode', 'hasResolvedOrIncomingSalonCode', 'isHomeAutoLoginFlow'];
const effectCode = compile(clientNames.map(name => {
  assert.ok(client.declarations.has(name), `Actual client initializer ${name} must exist`);
  return `const ${name}=${client.declarations.get(name)};`;
}).join('\n') + `\nexports.run=${failureEffect};\nexports.salon=resolvedOrIncomingSalonCode;`);

const landingSource = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
const landing = parse('app/index.tsx', landingSource);
const landingNames = ['initialSalonParam', 'initialCodeParam', 'ownerLoggedOutParam', 'frontendLoggedOutParam', 'sideParam', 'entryParam', 'isExplicitWebClientEntry', 'forceLoggedOutLanding', 'suppressOwnerBackofficeRedirect', 'ownerLoggedOutMarkerBlocksRedirect', 'ownerReadyForBackoffice'];
const landingCode = compile(landingNames.map(name => `const ${name}=${landing.declarations.get(name)};`).join('\n') + '\nexports.ownerReady=ownerReadyForBackoffice;');
function returnedLandingCanRedirectOwner(href, authenticated) {
  const url = new URL(href, 'https://fixture.invalid');
  const context = { exports: {}, searchParams: Object.fromEntries(url.searchParams), Platform: { OS: 'web' }, normalizeSalonCodeInput: platform.exports.normalizeSalonCode,
    isAuthenticated: authenticated, hasInitializedAuth: true, isLoaded: true, ownerInitialDataHydrating: false, ownerServerSyncReady: true, ownerExplicitLogout: false };
  vm.runInNewContext(landingCode, context);
  return context.exports.ownerReady;
}
function setup(changes = {}) {
  const assigned = [], native = [], alerts = [];
  const context = { exports: {}, initialAutoLoginParam: '1', initialModeParam: 'booking', isFrontendRequestsRoute: false,
    selectedSalonCode: 'audit-fixture', salonCodeDraft: '', resolvedInitialSalonCodeParam: '', normalizedSelectedSalonCode: '',
    normalizeSalonCode: platform.exports.normalizeSalonCode,
    autoCredentialLoginAttemptedRef: { current: true }, frontendAccessConflictError: '', isSavingProfile: false,
    isRegistered: false, profileSaveError: 'Connessione instabile — fixture', Platform: { OS: 'web' },
    window: { location: { assign: href => assigned.push(href) } }, router: { replace: href => native.push(href) },
    showBookingFlowAlert: (...args) => alerts.push(args), URLSearchParams, ...changes };
  vm.runInNewContext(effectCode, context);
  context.exports.run();
  return { ...context.exports, assigned, native, alerts };
}
function publicFallback(result, expectedSalon = 'audit-fixture') {
  assert.equal(result.assigned.length, 1);
  const url = new URL(result.assigned[0], 'https://fixture.invalid');
  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('side'), 'client');
  assert.equal(url.searchParams.get('entry'), 'client');
  assert.equal(url.searchParams.get('salon'), expectedSalon);
  assert.equal(url.searchParams.has('autologin'), false, 'The fallback must not restart failed autologin');
  assert.equal(url.searchParams.has('passwordReset'), false, 'A network error must not force credential reset');
  assert.equal(result.native.length, 0);
  return url;
}
const records = [];
const check = (name, run) => { run(); records.push({ name, passed: true }); };
check('a generic autologin error returns to the chosen public customer salon', () => {
  publicFallback(setup());
});
check('the returned customer page cannot redirect an authenticated owner to Home', () => {
  const result = setup();
  publicFallback(result);
  assert.equal(returnedLandingCanRedirectOwner(result.assigned[0], true), false);
});
check('the returned customer page also works without an owner session', () => {
  const result = setup();
  publicFallback(result);
  assert.equal(returnedLandingCanRedirectOwner(result.assigned[0], false), false);
});
check('the actual salon initializer normalizes a human-readable selected salon', () => {
  publicFallback(setup({ selectedSalonCode: '  AUDIT Fixture  ' }));
});
check('the incoming salon is preserved when selection has not hydrated', () => {
  publicFallback(setup({ selectedSalonCode: '', resolvedInitialSalonCodeParam: 'AUDIT Fixture' }));
});
check('a missing salon does not qualify for linked-salon autologin failure navigation', () => {
  const result = setup({ selectedSalonCode: '' });
  assert.deepEqual(result.assigned, []);
  assert.deepEqual(result.native, []);
  assert.deepEqual(result.alerts, []);
});
check('iOS and Android keep their established native failure landing', () => {
  for (const OS of ['ios', 'android']) {
    const result = setup({ Platform: { OS } });
    assert.deepEqual(result.assigned, []);
    assert.deepEqual(result.native, ['/']);
    assert.equal(result.alerts.length, 1);
  }
});
check('in-flight retry, successful login, no error and session conflict do not fire the failure fallback', () => {
  for (const change of [{ isSavingProfile: true }, { isRegistered: true }, { profileSaveError: '' }, { frontendAccessConflictError: 'Fixture conflict' }, { autoCredentialLoginAttemptedRef: { current: false } }]) {
    const result = setup(change);
    assert.deepEqual(result.assigned, []);
    assert.deepEqual(result.native, []);
    assert.deepEqual(result.alerts, []);
  }
});
check('registration and request-list routes do not use the home autologin failure fallback', () => {
  assert.deepEqual(setup({ initialModeParam: 'register' }).assigned, []);
  assert.deepEqual(setup({ isFrontendRequestsRoute: true }).assigned, []);
});
check('a cancelled retry or a cleared error remains on its current page', () => {
  const result = setup({ autoCredentialLoginAttemptedRef: { current: false }, profileSaveError: '' });
  result.run();
  assert.deepEqual(result.assigned, []);
});
check('repeated failure-effect delivery keeps both destinations in public client context', () => {
  const result = setup();
  result.run();
  assert.equal(result.assigned.length, 2);
  for (const href of result.assigned) assert.equal(returnedLandingCanRedirectOwner(href, true), false);
});
const report = { platform: 'actual client failure effect and salon initializers followed through the actual landing owner guard; intercepted navigation; no UI proof',
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), landingSourceSha256: crypto.createHash('sha256').update(landingSource).digest('hex'),
  cases: records, remoteApiCalls: 0, navigationOnUserDevice: 0, payments: 0 };
if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
else console.log(`PASS ${records.length} actual customer autologin public fallback scenarios`);
