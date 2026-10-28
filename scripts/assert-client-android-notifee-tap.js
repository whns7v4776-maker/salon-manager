/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const clientNotifications = read('src/context/ClientNotificationsContext.tsx');
const pushNotifications = read('src/lib/push/push-notifications.ts');

assert.match(
  pushNotifications,
  /displayAndroidClientForegroundNotification[\s\S]*?source: 'client_foreground_notifee'[\s\S]*?pressAction: \{ id: 'default' \}/,
  'The Android client foreground mirror must retain an actionable Notifee press target.',
);

assert.match(
  clientNotifications,
  /if \(Platform\.OS === 'android'\) \{[\s\S]*?import\('@notifee\/react-native'\)[\s\S]*?notifee\.onForegroundEvent\(\(event\) => \{[\s\S]*?event\.type !== EventType\.PRESS/,
  'The client runtime must subscribe to Android Notifee press events only on Android.',
);

assert.match(
  clientNotifications,
  /normalizeText\(mirrorData\.source\) !== 'client_foreground_notifee'[\s\S]*?handleNotificationTap\([\s\S]*?buildExpoNotificationFromAndroidClientMirror/,
  'Only the client foreground mirror may enter the canonical client tap handler.',
);

assert.match(
  clientNotifications,
  /addNotificationResponseReceivedListener\(\(response\) => \{[\s\S]*?handleNotificationTap\(response\.notification,[\s\S]*?clearLastResponseAfterDispatch: true[\s\S]*?getLastNotificationResponseAsync\(\)[\s\S]*?handleNotificationTap\(response\.notification,[\s\S]*?clearLastResponseAfterDispatch: true/,
  'Live and cold Expo responses must keep using the same canonical tap handler.',
);

assert.match(
  clientNotifications,
  /const claimNotificationTap = useCallback[\s\S]*?handledTapRef\.current\.has\(eventId\)[\s\S]*?handledTapRef\.current\.set\(eventId, now\)[\s\S]*?if \(!currentIdentity\?\.isRegistered \|\| !currentTapHandler\)[\s\S]*?pendingNotificationTapsRef\.current\.set[\s\S]*?if \(!claimNotificationTap\(normalized\.eventId\)\)[\s\S]*?currentTapHandler\([\s\S]*?markClientBookingNotificationAsRead/,
  'A logical client notification tap must be claimed once before read, badge, or navigation side effects.',
);

const notifeePressBlock =
  clientNotifications.match(
    /removeAndroidMirrorPressListener = notifee\.onForegroundEvent\(\(event\) => \{([\s\S]*?)\n          \}\);/,
  )?.[1] ?? '';
assert.doesNotMatch(
  notifeePressBlock,
  /setBadgeIdentityOverride|markSectionAsRead|setVisibleCustomBarNotifications|setApplicationBadgeSuppressed/,
  'The Notifee adapter must not fork or mutate the established client counter path.',
);

console.log('Client Android Notifee tap contract: OK');
