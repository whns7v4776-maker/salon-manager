/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const previousTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const root = path.resolve(__dirname, '..');
const {
  beginCustomerServicePriceAuthorityRefresh,
  buildCustomerServicePriceAuthorityIdentityKey,
  commitCustomerServicePriceAuthority,
  createPendingCustomerServicePriceAuthority,
  isCustomerServicePriceAuthorityResolved,
  parseCustomerServicePriceAuthority,
  reconcileCustomerServicePriceAuthority,
  resolveAuthoritativeCustomerServicePriceOverrides,
  serializeCustomerServicePriceAuthority,
} = require(path.join(
  root,
  'src/lib/customer-service-price-authority.ts',
));
const {
  getNextLocalServicePromotionDateBoundaryMs,
  resolveServiceClientBadge,
  SERVICE_EXPIRING_OFFER_BADGE,
} = require(path.join(root, 'src/lib/service-client-badge.ts'));

if (previousTsLoader) {
  require.extensions['.ts'] = previousTsLoader;
} else {
  delete require.extensions['.ts'];
}

const identityKey = buildCustomerServicePriceAuthorityIdentityKey({
  salonCode: ' SalonPro-LCOM ',
  email: ' MARZIO@example.com ',
  phone: '+39 333-123-4567',
});
assert.equal(
  identityKey,
  'salonpro-lcom|marzio@example.com|393331234567',
  'Customer price authority must be scoped to the exact normalized salon and customer.',
);

const pending = createPendingCustomerServicePriceAuthority(identityKey);
assert.equal(
  isCustomerServicePriceAuthorityResolved(pending, identityKey),
  false,
  'The empty initial map must not masquerade as an authoritative no-override response.',
);

const confirmed = commitCustomerServicePriceAuthority({
  identityKey,
  overrides: {
    'barba-uomo': { serviceId: 'barba-uomo', price: 12 },
  },
  confirmedAt: 123456,
});
const refreshing = beginCustomerServicePriceAuthorityRefresh({
  current: confirmed,
  identityKey,
});
assert.deepEqual(
  resolveAuthoritativeCustomerServicePriceOverrides(refreshing, identityKey),
  confirmed.overrides,
  'A same-identity refresh must retain the last authoritative override.',
);
const equivalentRefresh = commitCustomerServicePriceAuthority({
  identityKey,
  overrides: {
    'barba-uomo': { serviceId: 'barba-uomo', price: 12 },
  },
  confirmedAt: 234567,
});
assert.equal(
  reconcileCustomerServicePriceAuthority(confirmed, equivalentRefresh),
  confirmed,
  'An equivalent background response must retain object identity and avoid a catalog re-render.',
);

const otherIdentity = buildCustomerServicePriceAuthorityIdentityKey({
  salonCode: 'salonpro-lcom',
  email: 'altra@example.com',
  phone: '3331234567',
});
const switched = beginCustomerServicePriceAuthorityRefresh({
  current: confirmed,
  identityKey: otherIdentity,
});
assert.equal(
  isCustomerServicePriceAuthorityResolved(switched, otherIdentity),
  false,
  'An override confirmed for one customer must never leak to another identity.',
);
assert.deepEqual(
  resolveAuthoritativeCustomerServicePriceOverrides(switched, otherIdentity),
  {},
);

const restored = parseCustomerServicePriceAuthority(
  serializeCustomerServicePriceAuthority(confirmed),
  identityKey,
);
assert.deepEqual(
  restored,
  confirmed,
  'A hard refresh must be able to restore the last confirmed customer price authority.',
);
assert.equal(
  parseCustomerServicePriceAuthority(
    serializeCustomerServicePriceAuthority(confirmed),
    otherIdentity,
  ),
  null,
  'A persisted authority payload must still be rejected for a different identity.',
);

const datedPromotion = {
  prezzo: 15,
  prezzoOriginale: 35,
  scontoAttivo: true,
  scontoValidoDal: '2026-08-03',
  scontoValidoAl: '2026-08-31',
  badgeCliente: '',
};
assert.equal(
  resolveServiceClientBadge(datedPromotion, '2026-08-31'),
  SERVICE_EXPIRING_OFFER_BADGE,
  '`valid_to` is inclusive for the final promotion day.',
);
assert.equal(
  resolveServiceClientBadge(datedPromotion, '2026-09-01'),
  '',
  'The derived badge must disappear on the first local day after expiry.',
);
assert.equal(
  resolveServiceClientBadge(datedPromotion, '2026-08-26', {
    allowDerivedPromotionBadge: false,
  }),
  '',
  'A generic promotion badge must stay hidden while customer price authority is unresolved.',
);
assert.equal(
  resolveServiceClientBadge(
    { ...datedPromotion, badgeCliente: 'Scelto dai clienti' },
    '2026-08-26',
    { allowDerivedPromotionBadge: false },
  ),
  'Scelto dai clienti',
  'Pending price authority must suppress only the derived promotion badge, not a manual badge.',
);

const beforeMidnight = new Date(2026, 7, 31, 23, 59, 58, 500);
const boundary = new Date(
  getNextLocalServicePromotionDateBoundaryMs(beforeMidnight),
);
assert.equal(boundary.getFullYear(), 2026);
assert.equal(boundary.getMonth(), 8);
assert.equal(boundary.getDate(), 1);
assert.equal(boundary.getHours(), 0);
assert.equal(boundary.getMinutes(), 0);
assert.equal(boundary.getSeconds(), 0);
assert.equal(boundary.getMilliseconds(), 0);

console.log('Client promotion badge stability contracts passed.');
