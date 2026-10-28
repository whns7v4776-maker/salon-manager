/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const clientScreen = read('app/cliente-screen.tsx');
const pushNotifications = read('src/lib/push/push-notifications.ts');

const receivedBlock = sliceBetween(
  clientNotifications,
  'const receivedSubscription = Notifications.addNotificationReceivedListener',
  '    const responseSubscription = Notifications.addNotificationResponseReceivedListener',
);
const badgeOnlyIndex = receivedBlock.indexOf('if (isAndroidBadgeOnlyRefresh)');
const inactiveIndex = receivedBlock.indexOf(
  "Platform.OS === 'android' && AppState.currentState !== 'active'",
);
const normalizeIndex = receivedBlock.indexOf('const normalized = normalizeNotification(notification)');
const claimIndex = receivedBlock.indexOf('const isNew = markPresented(normalized.eventId)');
const enqueueIndex = receivedBlock.indexOf('enqueueForegroundCustomBarFromDBUnread(normalized)');

assert.ok(badgeOnlyIndex >= 0, 'Android badge-only refresh handling must remain intact.');
assert.ok(
  inactiveIndex > badgeOnlyIndex && normalizeIndex > inactiveIndex,
  'Inactive Android delivery must return to the system before consuming banner dedupe.',
);
assert.ok(
  claimIndex > normalizeIndex && enqueueIndex > claimIndex,
  'An active client event must be claimed once before any non-Android internal banner is enqueued.',
);
assert.match(
  receivedBlock,
  /if \(isNew && Platform\.OS !== 'android'\) \{[\s\S]*?enqueueForegroundCustomBarFromDBUnread\(normalized\)/,
  'Android foreground pushes must not create the client in-app banner.',
);
assert.doesNotMatch(
  receivedBlock,
  /displayAndroidClientForegroundNotification|scheduleNotificationAsync|notifee\.displayNotification/,
  'The active client listener must not create a duplicate Android system notification.',
);

assert.match(
  clientNotifications,
  /const enqueueForegroundCustomBarFromDBUnread = useCallback\([\s\S]*?refreshClientUnreadFromDBAuthoritative\(\)[\s\S]*?const shouldEnqueue = sectionUnread > 0[\s\S]*?enqueueForegroundCustomBar\(notification\)/,
  'The internal banner must remain gated by authoritative unread state.',
);
assert.match(
  clientScreen,
  /const renderClientForegroundCustomBar = \(\) => \{[\s\S]*?Platform\.OS !== 'ios' && Platform\.OS !== 'web'/,
  'The client in-app banner must remain available on web/iOS and excluded on Android.',
);

const handlerBlock = sliceBetween(
  pushNotifications,
  'handleNotification: async (notification) => {',
  '      },\n    });',
);
const androidSystemOwnerIndex = handlerBlock.indexOf(
  "Platform.OS === 'android' &&\n            (isClientForegroundPush(notificationData)",
);
const foregroundDelegatedIndex = handlerBlock.indexOf("handler_foreground_client_delegated");
assert.ok(
  androidSystemOwnerIndex >= 0 && foregroundDelegatedIndex > androidSystemOwnerIndex,
  'Android system presentation must be routed before the iOS/client-runtime delegation.',
);
const androidSystemOwnerBlock = handlerBlock.slice(
  androidSystemOwnerIndex,
  foregroundDelegatedIndex,
);
assert.match(androidSystemOwnerBlock, /shouldSuppressDuplicateForegroundPush/);
assert.match(androidSystemOwnerBlock, /shouldShowBanner: true/);
assert.match(androidSystemOwnerBlock, /shouldShowList: true/);
assert.match(androidSystemOwnerBlock, /shouldPlaySound: true/);
assert.match(androidSystemOwnerBlock, /shouldSetBadge: true/);

console.log('Android foreground system-push routing contract: OK');
