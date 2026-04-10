const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

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
