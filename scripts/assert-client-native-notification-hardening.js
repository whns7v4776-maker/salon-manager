/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const unreadBadges = read('src/lib/badges/unread-badges.ts');
const unreadBadgeContext = read('src/context/UnreadBadgeContext.tsx');

const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const tapBlock = sliceBetween(
  clientNotifications,
  'const handleNotificationTap = useCallback(',
  '  useEffect(() => {\n    if (\n      (Platform.OS',
);
const readinessIndex = tapBlock.indexOf('!currentIdentity?.isRegistered || !currentTapHandler');
const pendingIndex = tapBlock.indexOf('pendingNotificationTapsRef.current.set');
const claimIndex = tapBlock.indexOf('claimNotificationTap(normalized.eventId)');
const dispatchIndex = tapBlock.indexOf('currentTapHandler({');
const consumedClearIndex = tapBlock.lastIndexOf('Notifications.clearLastNotificationResponseAsync()');
assert.ok(readinessIndex >= 0 && pendingIndex > readinessIndex, 'Cold taps must queue until runtime readiness.');
assert.ok(claimIndex > pendingIndex, 'A cold tap must not be claimed before it can be consumed.');
assert.ok(dispatchIndex > claimIndex, 'Navigation dispatch must happen only after the one-shot claim.');
assert.ok(
  consumedClearIndex > dispatchIndex,
  'The native last response must be cleared only after successful navigation dispatch.',
);
assert.match(
  clientNotifications,
  /pendingNotificationTapsRef\.current\.size === 0[\s\S]*?pendingNotificationTapsRef\.current\.clear\(\)[\s\S]*?handleNotificationTap\(pendingTap\.notification,[\s\S]*?identity\?\.isRegistered, isTapHandlerReady/,
  'Queued taps must flush only when both the live client identity and tap handler are ready.',
);
assert.match(
  clientNotifications,
  /addNotificationResponseReceivedListener[\s\S]*?clearLastResponseAfterDispatch: true[\s\S]*?getLastNotificationResponseAsync\(\)[\s\S]*?clearLastResponseAfterDispatch: true/,
  'Both live and cold Expo responses must request one-shot native clearing.',
);

const customBarGate = sliceBetween(
  clientNotifications,
  'const enqueueForegroundCustomBarFromDBUnread = useCallback(',
  '  const clearCustomBarNotifications = useCallback(',
);
const authorityIndex = customBarGate.indexOf('refreshClientUnreadFromDBAuthoritative()');
const sectionUnreadIndex = customBarGate.indexOf('const shouldEnqueue = sectionUnread > 0');
const enqueueIndex = customBarGate.indexOf('enqueueForegroundCustomBar(notification)');
assert.ok(authorityIndex >= 0, 'The iOS custom bar must start from an authoritative refresh.');
assert.ok(
  sectionUnreadIndex > authorityIndex && enqueueIndex > sectionUnreadIndex,
  'The iOS custom bar must be enqueued only after the refreshed section is confirmed unread.',
);
assert.match(
  customBarGate,
  /catch \(error\)[\s\S]*?custom_bar_db_gate_failed_closed[\s\S]*?enqueue: false/,
  'An authority error must fail closed without a false iOS banner.',
);
assert.match(
  customBarGate,
  /FOREGROUND_CUSTOM_BAR_AUTHORITY_ATTEMPTS[\s\S]*?setTimeout\(resolve, FOREGROUND_CUSTOM_BAR_AUTHORITY_RETRY_MS[\s\S]*?refreshClientUnreadFromDBAuthoritative\(\)/,
  'A transient native authority race must recover automatically without exposing a retry button.',
);

const clientUnreadBlock = sliceBetween(
  unreadBadges,
  'const fetchClientUnreadCounts = async',
  'export const fetchUnreadBadgeSnapshot',
);
assert.doesNotMatch(
  clientUnreadBlock,
  /fetchPublicCustomerCommunications\([\s\S]*?\.catch\(\(\) => \[\]\)/,
  'A communications error must not be converted into an authoritative zero.',
);
assert.match(
  unreadBadges,
  /fetchClientWaitlistRows\(identity, \{ throwOnError: true \}\)/,
  'A failed waitlist authority and failed fallback must abort the client snapshot.',
);
assert.match(
  unreadBadgeContext,
  /refreshBadges = useCallback\(async \(options\?[\s\S]*?if \(options\?\.throwOnError\) \{[\s\S]*?throw error;/,
  'Strict native refreshes must surface authority errors and preserve the previous snapshot.',
);
assert.match(
  unreadBadgeContext,
  /if \(!activeIdentity\) \{[\s\S]*?if \(options\?\.throwOnError\) \{[\s\S]*?throw new Error\('badge_identity_not_ready'\);[\s\S]*?const emptySnapshot/,
  'A strict banner refresh must not clear internal counters while client identity is hydrating.',
);

assert.match(
  unreadBadgeContext,
  /const isNativeClientRuntimeRoute =[\s\S]*?pathname === '\/cliente'[\s\S]*?pathname\.startsWith\('\/cliente-'\)[\s\S]*?const nativeClientIdentity =[\s\S]*?lastNativeClientIdentity[\s\S]*?isNativeClientRuntimeRoute \? null : ownerIdentity/,
  'Native client bootstrap must retain the last client identity and never fall back to owner counts.',
);
assert.match(
  unreadBadgeContext,
  /const activeIdentity = Platform\.OS === 'web'[\s\S]*?isClientRoute[\s\S]*?identityOverride \?\? ownerIdentity[\s\S]*?: ownerIdentity/,
  'The existing web identity branch must remain unchanged.',
);

console.log('Client native notification hardening contract: OK');
