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

const getAndroidNotifee = async () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  return import('@notifee/react-native');
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
