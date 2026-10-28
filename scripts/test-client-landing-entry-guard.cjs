const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = process.env.AUDIT_ENTRY_SOURCE || path.join(root, 'app/index.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const effects = [];
let declarativeOwnerGuard;
let ownerReadyRenderAssignment;
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !declarations.has(node.name.text)) {
    declarations.set(node.name.text, node.initializer.getText(ast));
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]) {
    effects.push(node.arguments[0].getText(ast));
  }
  if (ts.isIfStatement(node) && node.expression.getText(ast).includes("Platform.OS !== 'ios'") && node.thenStatement.getText(ast).includes('<Redirect href={BACKOFFICE_ROUTE}')) {
    declarativeOwnerGuard = node.expression.getText(ast);
  }
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&node.left.getText(ast)==='ownerReadyForBackofficeRef.current'&&node.right.getText(ast)==='ownerReadyForBackoffice')ownerReadyRenderAssignment=node.getText(ast);
  ts.forEachChild(node, collect);
}
collect(ast);
const ownerRedirectEffect = effects.find(effect => effect.includes('if (!ownerReadyForBackoffice)') && effect.includes('beginOwnerBackofficeReplace();'));
assert.ok(ownerRedirectEffect, 'Use the actual owner entry effect');
assert.ok(declarativeOwnerGuard, 'Use the actual declarative owner route guard');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const platform = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/platform.ts'), 'utf8')), platform);

const names = [
  'BACKOFFICE_ROUTE', 'normalizeSalonCodeInput', 'initialSalonParam', 'initialCodeParam',
  'normalizedIncomingSalonCode', 'ownerLoggedOutParam', 'frontendLoggedOutParam',
  'sideParam', 'entryParam', 'isExplicitWebClientEntry', 'isNativeClientAccessFallback', 'forceLoggedOutLanding',
  'suppressOwnerBackofficeRedirect', 'ownerLoggedOutMarkerBlocksRedirect',
  'shouldUseClientLanding', 'ownerReadyForBackoffice', 'beginOwnerBackofficeReplace',
];
const declarationsCode = names.map(name => {
  assert.ok(declarations.has(name), `Actual initializer ${name} must exist`);
  return `const ${name} = ${declarations.get(name)};`;
}).join('\n');
const actualHarness = compile(`${declarationsCode}\n${ownerReadyRenderAssignment};\nexports.effect = ${ownerRedirectEffect};\nexports.declarativeRedirect = (${declarativeOwnerGuard});\nexports.ownerReady = ownerReadyForBackoffice;\nexports.explicitClientEntry = isExplicitWebClientEntry;`);

const records = [];
const check = (name, run) => { run(); records.push({ name, passed: true }); };
function setup(searchParams = {}, overrides = {}) {
  const navigations = [];
  const context = {
    exports: {}, searchParams, Platform: { OS: 'web' },
    audiencePickerOpen:false,landingAudienceReady:true,selectedLandingAudience:'owner',ownerReadyForBackofficeRef:{current:false},
    normalizeSalonCode: platform.exports.normalizeSalonCode,
    useMemo: fn => fn(), useCallback: fn => fn,
    isAuthenticated: true, hasInitializedAuth: true, isLoaded: true,
    ownerInitialDataHydrating: false, ownerServerSyncReady: true, ownerExplicitLogout: false,
    ownerBackofficeRedirectStartedRef: { current: false },
    ownerBackofficeReplaceRef: { current: href => navigations.push(href) },
    ...overrides,
  };
  vm.runInNewContext(actualHarness, context);
  context.exports.effect();
  return { ...context.exports, navigations, context };
}
function staysClient(params, overrides) {
  const result = setup(params, overrides);
  assert.equal(result.ownerReady, false);
  assert.equal(result.declarativeRedirect, false);
  assert.deepEqual(result.navigations, []);
  return result;
}
function reachesOwner(params, overrides) {
  const result = setup(params, overrides);
  assert.equal(result.ownerReady, true);
  assert.deepEqual(result.navigations, ['/(tabs)']);
  return result;
}

check('failed customer password autologin keeps the public recovery page while owner is signed in', () => {
  staysClient({ side: 'client', salon: 'audit-fixture', passwordReset: '1' });
});
check('a public client salon entry does not require the additional entry flag', () => {
  staysClient({ side: 'client', salon: 'audit-fixture' });
});
check('public client code alias also preserves the customer route', () => {
  staysClient({ side: 'client', code: 'audit-fixture' });
});
check('first array search parameters preserve a linked client entry', () => {
  staysClient({ side: ['client', 'owner'], salon: ['audit-fixture', 'ignored'], passwordReset: ['1'] });
});
check('normalized salon selection keeps the existing customer entry', () => {
  staysClient({ side: 'client', salon: '  AUDIT Fixture  ' });
});
check('an empty salon value can use its code alias', () => {
  staysClient({ side: 'client', salon: '', code: 'audit-fixture' });
});
check('the established explicit client entry remains public', () => {
  staysClient({ side: 'client', entry: 'client', salon: 'audit-fixture' });
});
check('an explicit client chooser without a selected salon remains public', () => {
  staysClient({ side: 'client', entry: 'client' });
});
check('customer registration and login mode keep the selected public salon', () => {
  staysClient({ side: 'client', salon: 'audit-fixture', mode: 'register', registrationOnly: '1' });
  staysClient({ side: 'client', salon: 'audit-fixture', mode: 'login' });
});
check('normal owner entry still reaches the backoffice exactly once', () => {
  const result = reachesOwner({});
  assert.equal(result.declarativeRedirect, true);
  result.effect();
  assert.deepEqual(result.navigations, ['/(tabs)']);
});
check('explicit owner entry and owner recovery completion retain owner navigation', () => {
  reachesOwner({ side: 'owner', salon: 'audit-fixture' });
  reachesOwner({ side: 'owner', ownerReset: 'done' });
});
check('owner logout and recovery landing markers prevent owner reentry', () => {
  staysClient({ ownerLoggedOut: '1', ownerReset: '1' });
  staysClient({}, { ownerExplicitLogout: true });
});
check('customer logout marker remains on the public landing', () => {
  staysClient({ side: 'client', salon: 'audit-fixture', frontendLoggedOut: '1' });
});
check('an unauthenticated owner cannot steal customer access', () => {
  staysClient({ side: 'client', salon: 'audit-fixture' }, { isAuthenticated: false });
});
check('unfinished owner authentication or data loading does not run the owner redirect effect', () => {
  for (const state of [{ hasInitializedAuth: false }, { isLoaded: false }, { ownerInitialDataHydrating: true }, { ownerServerSyncReady: false }]) {
    const result = setup({}, state);
    assert.equal(result.ownerReady, false);
    assert.deepEqual(result.navigations, []);
  }
});
check('native explicit client entry stays public and owner entry preserves platform navigation', () => {
  for (const OS of ['ios', 'android']) {
    const client = staysClient({ side: 'client', salon: 'audit-fixture' }, { Platform: { OS } });
    assert.equal(client.explicitClientEntry, false);
    const owner = reachesOwner({ side: 'owner' }, { Platform: { OS } });
    assert.equal(owner.declarativeRedirect, OS !== 'ios');
  }
});
check('invalid salon queries keep explicit client access public without impersonating a salon', () => {
  for(const salon of ['   ','!!!']){const result=staysClient({side:'client',salon});assert.equal(result.explicitClientEntry,false);}
});
check('a stale owner ready flag is reset when the actual public-client effect runs', () => {
  const result = staysClient({ side: 'client', salon: 'audit-fixture' }, { ownerBackofficeRedirectStartedRef: { current: true } });
  assert.equal(result.context.ownerBackofficeRedirectStartedRef.current, false);
});

const report = {
  platform: 'actual landing initializers, navigation effect and declarative guard executed in isolation; router intercepted; no browser proof',
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  cases: records, remoteApiCalls: 0, navigationOnUserDevice: 0,
};
if (process.env.AUDIT_REPORT_JSON === '1') console.log(JSON.stringify(report, null, 2));
else console.log(`PASS ${records.length} actual customer/owner landing entry guard scenarios`);
