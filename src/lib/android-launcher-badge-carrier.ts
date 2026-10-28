import { AppState, Platform } from 'react-native';

const ANDROID_LAUNCHER_BADGE_CHANNEL_ID = 'salonpro-launcher-badge-sync-v5';
const ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID = 'salonpro-launcher-badge-carrier-v5';
const LEGACY_ANDROID_LAUNCHER_BADGE_NOTIFICATION_IDS = [
  'salonpro-launcher-badge-carrier',
  'salonpro-launcher-badge-carrier-v2',
  'salonpro-launcher-badge-carrier-v3',
  'salonpro-launcher-badge-carrier-v4',
];

const logAndroidBadgeSync = (event: string, payload?: Record<string, unknown>) => {
  if (Platform.OS !== 'android') {
    return;
  }
};

const normalizeBadgeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const parseBadgeCount = (value: unknown) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? normalizeBadgeCount(numericValue) : null;
};

const getDisplayedNotificationTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const getAndroidNotifee = async () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  return import('@notifee/react-native');
};

export const getAndroidLauncherBadgeCount = async () => {
  if (Platform.OS !== 'android') {
    return 0;
  }

  try {
    const notifeeModule = await getAndroidNotifee();
    if (!notifeeModule) {
      return 0;
    }

    const displayedNotifications = await notifeeModule.default.getDisplayedNotifications();
    const carrierNotifications = displayedNotifications
      .filter((displayedNotification) => {
        const notificationId = String(
          displayedNotification.id ?? displayedNotification.notification.id ?? ''
        ).trim();
        const source = String(displayedNotification.notification.data?.source ?? '').trim();

        return (
          notificationId === ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID ||
          LEGACY_ANDROID_LAUNCHER_BADGE_NOTIFICATION_IDS.includes(notificationId) ||
          source === 'launcher_badge_carrier'
        );
      })
      .sort((first, second) => {
        const firstId = String(first.id ?? first.notification.id ?? '').trim();
        const secondId = String(second.id ?? second.notification.id ?? '').trim();
        const firstIsCurrent = firstId === ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID;
        const secondIsCurrent = secondId === ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID;

        if (firstIsCurrent !== secondIsCurrent) {
          return firstIsCurrent ? -1 : 1;
        }

        return (
          getDisplayedNotificationTimestamp(second.date) -
          getDisplayedNotificationTimestamp(first.date)
        );
      });

    for (const displayedNotification of carrierNotifications) {
      const carrierCount = parseBadgeCount(
        displayedNotification.notification.data?.unreadCount ??
          displayedNotification.notification.android?.badgeCount
      );
      if (carrierCount !== null) {
        return carrierCount;
      }
    }

    // Notifee getBadgeCount/setBadgeCount are iOS-only APIs. Android restores
    // the exact launcher floor from SalonPro's own displayed carrier instead;
    // when no valid carrier exists, zero is the only safe fallback.
    return 0;
  } catch {
    return 0;
  }
};

export const syncAndroidLauncherBadgeCarrier = async (
  count: number,
  metadata: Record<string, unknown> = {}
) => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const normalizedCount = normalizeBadgeCount(count);

  try {
    const notifeeModule = await getAndroidNotifee();
    if (!notifeeModule) {
      return false;
    }
    const notifee = notifeeModule.default;
    const { AndroidBadgeIconType, AndroidImportance, AndroidVisibility } = notifeeModule;

    if (normalizedCount <= 0) {
      // Always clear the launcher number explicitly. Cancelling the SalonPro
      // carrier alone is not enough on every launcher, while Notifee's badge
      // API does not cancel unrelated delivered FCM notifications.
      await notifee.setBadgeCount(0).catch(() => undefined);

      if (metadata.preserveNotificationOnZero === true) {
        logAndroidBadgeSync('launcher_badge_carrier_badge_cleared_notification_preserved', {
          ...metadata,
          payloadBadge: 0,
          payloadUnreadCount: 0,
          unreadCountDbCalculated: 0,
          setBadgeCountAsyncValue: 0,
          notificationId: ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID,
          appState: AppState.currentState,
          localIncrementUsed: false,
        });
        return true;
      }

      await Promise.all(
        [
          ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID,
          ...LEGACY_ANDROID_LAUNCHER_BADGE_NOTIFICATION_IDS,
        ].map((notificationId) => notifee.cancelNotification(notificationId).catch(() => undefined))
      );

      logAndroidBadgeSync('launcher_badge_carrier_cleared', {
        ...metadata,
        payloadBadge: 0,
        payloadUnreadCount: 0,
        unreadCountDbCalculated: 0,
        setBadgeCountAsyncValue: 0,
        notificationId: null,
        appState: AppState.currentState,
        localIncrementUsed: false,
      });
      return true;
    }

    const channelId = await notifee.createChannel({
      id: ANDROID_LAUNCHER_BADGE_CHANNEL_ID,
      name: 'SalonPro badge',
      importance: AndroidImportance.LOW,
      lights: false,
      vibration: false,
      sound: undefined,
      badge: true,
    });

    await notifee.setBadgeCount(normalizedCount).catch(() => undefined);
    await notifee.displayNotification({
      id: ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID,
      title: 'SalonPro',
      body: normalizedCount === 1 ? '1 notifica' : `${normalizedCount} notifiche`,
      data: {
        source: 'launcher_badge_carrier',
        unreadCount: String(normalizedCount),
      },
      android: {
        channelId,
        smallIcon: 'notification_icon',
        color: '#181818',
        badgeCount: normalizedCount,
        badgeIconType: AndroidBadgeIconType.LARGE,
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PRIVATE,
        autoCancel: false,
        onlyAlertOnce: true,
        pressAction: { id: 'default' },
      },
    });

    logAndroidBadgeSync('launcher_badge_carrier_synced', {
      ...metadata,
      payloadBadge: normalizedCount,
      payloadUnreadCount: normalizedCount,
      unreadCountDbCalculated: normalizedCount,
      setBadgeCountAsyncValue: normalizedCount,
      notificationId: ANDROID_LAUNCHER_BADGE_NOTIFICATION_ID,
      appState: AppState.currentState,
      localIncrementUsed: false,
    });
    return true;
  } catch (error) {
    logAndroidBadgeSync('launcher_badge_carrier_failed', {
      ...metadata,
      message: error instanceof Error ? error.message : String(error),
      setBadgeCountAsyncValue: normalizedCount,
      appState: AppState.currentState,
      localIncrementUsed: false,
    });
    return false;
  }
};
