/* global __dirname */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const platformSource = read('src', 'lib', 'platform.ts');
const rootLayoutSource = read('app', '_layout.tsx');
const appContextSource = read('src', 'context', 'AppContext.tsx');
const paywallSource = read('components', 'owner-subscription-paywall.tsx');
const revenueCatSource = read('src', 'lib', 'revenuecat.ts');
const webhookSource = read('supabase', 'functions', 'revenuecat-webhook', 'index.ts');
const reconciliationSource = read('supabase', 'functions', '_shared', 'store-reconciliation.ts');
const reconciliationMigration = read('supabase', 'migrations', '20260911170000_reconcile_store_receipt_ownership.sql');
require('assert').match(reconciliationSource, /rpc\('reconcile_verified_store_snapshot'/);
require('assert').match(reconciliationMigration, /perform public.sync_revenuecat_subscription_event\(/);
const migrationSource = read(
  'supabase',
  'migrations',
  '20260827120000_harden_subscription_expiry_access.sql',
);

const compiledPlatform = ts.transpileModule(platformSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const platformModule = { exports: {} };
new Function('module', 'exports', compiledPlatform)(platformModule, platformModule.exports);
const { createDefaultWorkspace, getWorkspaceAccessDecision } = platformModule.exports;

const baseWorkspace = createDefaultWorkspace('owner@example.com');
const futureEnd = new Date(Date.now() + 86_400_000).toISOString();
const pastEnd = new Date(Date.now() - 86_400_000).toISOString();

assert.equal(
  getWorkspaceAccessDecision({ ...baseWorkspace, isInternalTester: true }).allowed,
  true,
  'The internal tester must remain accessible without a subscription.',
);
assert.equal(
  getWorkspaceAccessDecision(baseWorkspace).reason,
  'subscription_required',
  'A new demo workspace must see the mandatory subscription page.',
);
assert.equal(
  getWorkspaceAccessDecision({
    ...baseWorkspace,
    subscriptionStatus: 'active',
    subscriptionEndsAt: undefined,
  }).reason,
  'missing_expiration',
  'An active non-tester without an end date must not receive permanent access.',
);
assert.equal(
  getWorkspaceAccessDecision({
    ...baseWorkspace,
    subscriptionStatus: 'active',
    subscriptionEndsAt: futureEnd,
  }).allowed,
  true,
  'A future trial or paid period must remain fully accessible.',
);
assert.equal(
  getWorkspaceAccessDecision({
    ...baseWorkspace,
    subscriptionStatus: 'active',
    subscriptionEndsAt: pastEnd,
  }).reason,
  'expired',
  'A period that has actually ended must be blocked.',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  platformSource,
  /if \(workspace\.isInternalTester\) \{[\s\S]*?allowed: true,[\s\S]*?reason: 'internal_tester'/,
  'The explicit internal tester bypass must remain available.',
);
requirePattern(
  platformSource,
  /if \(workspace\.subscriptionStatus === 'demo'\) \{[\s\S]*?allowed: false,[\s\S]*?reason: 'subscription_required'/,
  'A new owner must remain behind the mandatory subscription page.',
);
requirePattern(
  platformSource,
  /if \(endsAtMs === null\) \{[\s\S]*?allowed: false,[\s\S]*?reason: 'missing_expiration'/,
  'A non-tester active workspace without an expiration must fail closed.',
);
requirePattern(
  platformSource,
  /if \(endsAtMs <= nowMs\) \{[\s\S]*?allowed: false,[\s\S]*?reason: 'expired'/,
  'An expired trial or subscription must fail closed locally.',
);
requirePattern(
  platformSource,
  /reason: 'active_subscription',[\s\S]*?endsAtMs/,
  'A future active trial or subscription must remain accessible.',
);

for (const segment of ['cassa-screen', 'stampa-qr']) {
  requirePattern(
    rootLayoutSource,
    new RegExp(`'${segment.replace('-', '\\-')}'`),
    `The owner route ${segment} must be protected.`,
  );
}
requirePattern(
  rootLayoutSource,
  /firstSegment === 'cliente' && segments\.length > 1/,
  'Direct owner customer detail routes must be protected without blocking the public client route.',
);
for (const segment of ['impostazioni-open', 'cassa-open', 'cassa-screen', 'stampa-qr']) {
  requirePattern(
    appContextSource,
    new RegExp(`'${segment.replace('-', '\\-')}'`),
    `The owner runtime must stay aligned on ${segment}.`,
  );
}
requirePattern(
  appContextSource,
  /firstSegment === 'cliente' && segments\.length > 1/,
  'The owner runtime must load for direct customer detail routes.',
);
requirePattern(
  rootLayoutSource,
  /timeoutId = setTimeout\(scheduleAccessCheck, nextTickMs\)/,
  'The expiration timer must reschedule until the exact access transition.',
);
requirePattern(
  rootLayoutSource,
  /AppState\.addEventListener\('change',[\s\S]*?refreshOwnerSubscriptionFromServer\(\)/,
  'Returning to the app must refresh the authoritative subscription state.',
);

requirePattern(
  paywallSource,
  /Il mese gratuito è terminato/,
  'Expired trials must have a specific non-generic message.',
);
requirePattern(
  paywallSource,
  /Abbonamento scaduto/,
  'Expired paid subscriptions must have a specific message.',
);
requirePattern(
  paywallSource,
  /Accesso web bloccato/,
  'Web access must show a fixed blocking message.',
);
requirePattern(
  paywallSource,
  /canStartFreeTrial[\s\S]*?Inizia il mese gratuito[\s\S]*?Continua con il piano \$\{selectedPeriodLabel\}/,
  'The paywall must promise the free month only when the store confirms eligibility.',
);
requirePattern(
  paywallSource,
  /return fallbackLabel;/,
  'The Italian paywall must not replace its EUR list price with a foreign TestFlight storefront price.',
);
for (const priceLabel of [
  '24,99 €/mese',
  '29,99 €/mese',
  '249,99 €/anno',
  '299,99 €/anno',
]) {
  if (!revenueCatSource.includes(priceLabel)) {
    throw new Error(`Missing Italian EUR subscription label: ${priceLabel}`);
  }
}
if (/localizedPrice/.test(paywallSource)) {
  throw new Error('The Italian paywall must not render foreign storefront localized prices.');
}
requirePattern(
  paywallSource,
  /const canStartFreeTrial =[\s\S]*?trialEligibleForSelectedPlan[\s\S]*?trialEligibleForSelectedPlan\s*\? 'Un mese gratuito'\s*: 'Condizioni store'[\s\S]*?canStartFreeTrial\s*\? 'Inizia il mese gratuito'\s*: `Continua con il piano/ ,
  'Only an eligible plan can promise a free trial; other plans must defer to store terms and show a paid-plan action.',
);
if (/onClose\s*=|closeButton|close-outline/.test(paywallSource)) {
  throw new Error('The owner paywall must not gain a dismiss or close action.');
}

requirePattern(
  revenueCatSource,
  /if \(!revenueCatConfigured\)[\s\S]*?Purchases\.configure[\s\S]*?else \{[\s\S]*?await Purchases\.logIn\(appUserId\)/,
  'RevenueCat must configure once and use logIn when the owner account changes.',
);

requirePattern(
  webhookSource,
  /const eventId = String\(event\.id[\s\S]*?event_timestamp_ms/,
  'RevenueCat webhook identity and generation time must be required.',
);
requirePattern(
  webhookSource,
  /await reconcileStoreWorkspace\(supabase, workspace.id, event\)/,
  'RevenueCat webhooks must use the ordered idempotent synchronization RPC.',
);
requirePattern(
  webhookSource,
  /if \(type === 'EXPIRATION'\) return 'expired'/,
  'EXPIRATION must revoke access.',
);
requirePattern(
  webhookSource,
  /type === 'CANCELLATION'[\s\S]*?expirationAt[\s\S]*?> Date\.now\(\) \? 'active' : 'expired'/,
  'Cancellation must preserve access until the recorded period end.',
);

requirePattern(
  migrationSource,
  /subscription_ends_at is not null[\s\S]*?subscription_ends_at > timezone\('utc', now\(\)\)/,
  'Server owner access must require a future authoritative end date.',
);
requirePattern(
  migrationSource,
  /v_event_at < v_previous_event_at/,
  'Older or duplicate RevenueCat events must not overwrite newer state.',
);
requirePattern(
  migrationSource,
  /workspace\.is_internal_tester = true/,
  'The intentional internal tester bypass must remain aligned on the server.',
);

console.log('Subscription access contracts verified.');
