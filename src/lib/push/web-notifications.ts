const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';
const LIGHT_NOTIFICATION_ICON = '/notification-light-v3.png';
const DARK_NOTIFICATION_ICON = '/notification-dark-v3.png';

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

const getWebNotificationIcon = () => {
  if (!hasWindow || typeof window.matchMedia !== 'function') {
    return LIGHT_NOTIFICATION_ICON;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? DARK_NOTIFICATION_ICON
    : LIGHT_NOTIFICATION_ICON;
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

export const showWebNotification = ({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag?: string;
}) => {
  const BrowserNotification = getBrowserNotification();
  if (!BrowserNotification || BrowserNotification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new BrowserNotification(title, {
      body,
      tag,
      icon: getWebNotificationIcon(),
      badge: LIGHT_NOTIFICATION_ICON,
    });

    notification.onclick = () => {
      if (hasWindow) {
        window.focus();
      }
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
};
