/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appContextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const realtimeMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260815194500_enable_customer_personalization_realtime.sql',
  ),
  'utf8',
);
const publicReaderMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260826031500_keep_customer_duration_and_price_public_for_testers.sql',
  ),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  assert.match(source, pattern, message);
};

requirePattern(
  appContextSource,
  /const snapshotCustomerById = new Map[\s\S]*?customerDurationOverridesAuthoritative[\s\S]*?customerPriceOverridesAuthoritative[\s\S]*?customerOnlinePoliciesAuthoritative[\s\S]*?customerOnlineServiceOverridesAuthoritative[\s\S]*?customerOnlineCompositionOverridesAuthoritative/,
  'Every customer-personalization table must have its own authority flag.',
);
requirePattern(
  appContextSource,
  /serviceDurationOverrides:[\s\S]{0,500}?customerDurationOverridesAuthoritative[\s\S]{0,300}?snapshotCustomer\?\.serviceDurationOverrides/,
  'A failed duration query must preserve the last complete owner snapshot.',
);
requirePattern(
  appContextSource,
  /servicePriceOverrides:[\s\S]{0,500}?customerPriceOverridesAuthoritative[\s\S]{0,300}?snapshotCustomer\?\.servicePriceOverrides/,
  'A failed price query must preserve the last complete owner snapshot.',
);
requirePattern(
  appContextSource,
  /onlineBookingAcceptanceMode:[\s\S]{0,500}?customerOnlinePoliciesAuthoritative[\s\S]{0,300}?snapshotCustomer\?\.onlineBookingAcceptanceMode[\s\S]{0,500}?allowSameDaySameService:[\s\S]{0,500}?customerOnlinePoliciesAuthoritative/,
  'A failed policy query must preserve acceptance and same-day settings together.',
);
requirePattern(
  appContextSource,
  /birthday:\s*item\.birthday\?\.trim\(\) \|\|\s*snapshotCustomer\?\.birthday\?\.trim\(\) \|\|\s*''/,
  'Authoritative customer reloads must prefer the canonical birthday and preserve the snapshot-backed value as fallback.',
);
requirePattern(
  appContextSource,
  /customerOnlineServiceOverridesAuthoritative[\s\S]*?!overrideKey\.startsWith\([\s\S]*?CUSTOMER_COMPOSITION_OVERRIDE_PREFIX[\s\S]*?customerOnlineCompositionOverridesAuthoritative[\s\S]*?overrideKey\.startsWith\([\s\S]*?CUSTOMER_COMPOSITION_OVERRIDE_PREFIX/,
  'Service and composition exceptions must fall back independently.',
);

requirePattern(
  appContextSource,
  /const saveCustomerServiceDurationOverride[\s\S]*?ensureRealtimeOwnerSession\(\)[\s\S]*?customer_service_duration_overrides[\s\S]*?select\([\s\S]*?duration_minutes, phase_config[\s\S]*?customer_duration_override_not_confirmed[\s\S]*?clientiRef\.current\.map/,
  'Duration changes must commit only the exact row returned by the backend and merge into latest realtime state.',
);
requirePattern(
  appContextSource,
  /const saveCustomerServicePriceOverride[\s\S]*?ensureRealtimeOwnerSession\(\)[\s\S]*?customer_service_price_overrides[\s\S]*?select\('customer_id, service_id, price'\)[\s\S]*?customer_price_override_not_confirmed[\s\S]*?clientiRef\.current\.map/,
  'Price changes must commit only the exact row returned by the backend and merge into latest realtime state.',
);
requirePattern(
  appContextSource,
  /const saveCustomerOnlineBookingPolicy[\s\S]*?ensureRealtimeOwnerSession\(\)[\s\S]*?update_customer_online_booking_policy_v2[\s\S]*?customer_online_booking_policy_not_confirmed[\s\S]*?confirmedPayload\?\.serviceOverrides[\s\S]*?clientiRef\.current\.map/,
  'Online policy changes must use the canonical RPC response before updating UI/cache.',
);

requirePattern(
  realtimeMigrationSource,
  /customer_duration_override_touch_personalization_revision[\s\S]*?customer_price_override_touch_personalization_revision[\s\S]*?customer_online_policy_touch_personalization_revision/,
  'Duration, price and policy writes must all emit a durable personalization revision.',
);
requirePattern(
  realtimeMigrationSource,
  /supabase_realtime[\s\S]*?customer_service_duration_overrides[\s\S]*?customer_service_price_overrides[\s\S]*?customer_online_booking_policies[\s\S]*?customer_personalization_revisions/,
  'Every personalization source and its delete signal must be published for realtime.',
);
requirePattern(
  publicReaderMigrationSource,
  /get_public_customer_service_duration_overrides_v1\(text,text,text\)[\s\S]*?get_public_customer_service_price_overrides_v1\(text,text,text\)[\s\S]*?workspace\.is_internal_tester is true[\s\S]*?subscription_status in \(''demo'', ''active''\)/,
  'Internal-tester clients must receive their confirmed duration and price overrides.',
);

console.log('Customer personalization persistence contracts passed.');
