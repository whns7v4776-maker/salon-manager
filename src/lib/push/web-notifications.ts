import { ICON_ASSET_VERSION } from '../icon-asset-version';

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';
const LIGHT_NOTIFICATION_ICON = `/notification-light.png?v=${ICON_ASSET_VERSION}`;

type BrowserNotificationConstructor = {
  new (title: string, options?: NotificationOptions): Notification;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

const getBrowserNotification = () => {
  if (!hasWindow) return null;

  const maybeNotification = (window as unknown as { Notification?: BrowserNotificationConstructor })
    .Notification;
  return maybeNotification ?? null;
};

export const canUseWebNotifications = () => hasWindow && hasDocument && !!getBrowserNotification();

export const getWebNotificationPermissionStatus = () => {
  const BrowserNotification = getBrowserNotification();
  if (!BrowserNotification) {
    return 'unsupported';
  }

  return BrowserNotification.permission;
};

const getWebNotificationIcon = () => {
  return LIGHT_NOTIFICATION_ICON;
};

export const requestWebNotificationPermission = async () => {
  const BrowserNotification = getBrowserNotification();
  if (!BrowserNotification) {
    return 'unsupported';
  }

  if (BrowserNotification.permission === 'granted') {
    return 'granted';
  }

  if (BrowserNotification.permission === 'denied') {
    return 'denied';
  }

  try {
    return await BrowserNotification.requestPermission();
  } catch {
    return 'default';
  }
};

export const showWebNotification = async ({
  title,
  body,
  tag,
  onPress,
}: {
  title: string;
  body: string;
  tag?: string;
  onPress: () => void;
}) => {
  const BrowserNotification = getBrowserNotification();
  if (!BrowserNotification || BrowserNotification.permission !== 'granted') {
    return false;
  }

  if (
    hasDocument &&
    document.visibilityState === 'visible' &&
    hasWindow &&
    typeof window.focus === 'function' &&
    typeof document.hasFocus === 'function' &&
    document.hasFocus()
  ) {
    return false;
  }

  const historyKey = 'salonpro:web-notification-history:v1';
  const runtime = globalThis as typeof globalThis & { __salonWebNotificationHistory?: Map<string, number> };
  const history = runtime.__salonWebNotificationHistory ??= new Map<string, number>();
  const displayOnce = () => {
    const now = Date.now();
    // Keep memory too: restricted storage must not duplicate alerts in a tab.
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(historyKey) || '[]');
      if (Array.isArray(stored)) {
        for (const entry of stored) {
          if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
            history.set(entry[0], Math.max(history.get(entry[0]) || 0, entry[1]));
          }
        }
      }
    } catch { /* Keep the in-memory history when storage is restricted. */ }
    for (const [key, timestamp] of history) {
      if (now - timestamp >= 5 * 60 * 1000) history.delete(key);
    }
    if (tag && history.has(tag)) return false;
    const notification = new BrowserNotification(title, {
      body,
      tag,
      icon: getWebNotificationIcon(),
      badge: getWebNotificationIcon(),
    });

    notification.onclick = () => {
      if (hasWindow) {
        window.focus();
      }
      notification.close();
      onPress();
    };

    if (tag) {
      history.set(tag, now);
      while (history.size > 256) history.delete(history.keys().next().value!);
      try { window.localStorage.setItem(historyKey, JSON.stringify([...history])); } catch { /* Best effort. */ }
    }
    return true;
  };

  try {
    // Serialize the check and display across tabs of the same origin.
    if (tag && window.navigator.locks?.request) {
      return await window.navigator.locks.request('salonpro:web-notification', displayOnce);
    }
    return displayOnce();
  } catch {
    return false;
  }
};
