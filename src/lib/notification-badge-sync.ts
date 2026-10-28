import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import {
  getAndroidLauncherBadgeCount,
  syncAndroidLauncherBadgeCarrier,
} from './android-launcher-badge-carrier';

const logClientPushAlignment = (_event: string, _payload?: Record<string, unknown>) => {};

type OwnerViewedPayload = {
  ownerEmail: string;
  requestSignatures?: string[];
  clientIds?: string[];
  clientKeys?: string[];
};

type OwnerViewedListener = (payload: OwnerViewedPayload) => void;

const ownerViewedListeners = new Set<OwnerViewedListener>();

const normalizeBadgeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

let badgeCountFloor = 0;
let badgeCountFloorExpiresAt = 0;
let applicationBadgeSuppressed = false;
let applicationBadgeSyncQueue: Promise<void> = Promise.resolve();

type ApplicationBadgeSyncOptions = {
  ignoreFloor?: boolean;
  preserveAndroidNotificationOnZero?: boolean;
  clearAndroidCarrierImmediately?: boolean;
};

export const setApplicationBadgeCountFloor = (count: number, ttlMs = Number.POSITIVE_INFINITY) => {
  if (Platform.OS === 'web') {
    return;
  }

  const normalizedCount = normalizeBadgeCount(count);
  if (normalizedCount <= 0) {
    clearApplicationBadgeCountFloor();
    return;
  }

  badgeCountFloor = normalizedCount;
  badgeCountFloorExpiresAt = Date.now() + Math.max(0, ttlMs);
};

export const raiseApplicationBadgeCountFloor = (
  count: number,
  ttlMs = Number.POSITIVE_INFINITY
) => {
  if (Platform.OS === 'web') {
    return;
  }

  const normalizedCount = normalizeBadgeCount(count);
  const hasActiveFloor = Date.now() <= badgeCountFloorExpiresAt;
  setApplicationBadgeCountFloor(
    Math.max(normalizedCount, hasActiveFloor ? badgeCountFloor : 0),
    ttlMs
  );
};

export const bootstrapAndroidBadgeCountFloorFromLauncher = async () => {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const launcherCount = await getAndroidLauncherBadgeCount();
  if (launcherCount > 0) {
    raiseApplicationBadgeCountFloor(launcherCount);
  }
  return launcherCount;
};

export const clearApplicationBadgeCountFloor = () => {
  badgeCountFloor = 0;
  badgeCountFloorExpiresAt = 0;
};

export const decrementApplicationBadgeCountFloor = (count: number) => {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const normalizedCount = normalizeBadgeCount(count);
  const hasActiveFloor = Date.now() <= badgeCountFloorExpiresAt;
  if (!hasActiveFloor || normalizedCount <= 0) {
    if (!hasActiveFloor) {
      clearApplicationBadgeCountFloor();
    }
    return hasActiveFloor ? badgeCountFloor : 0;
  }

  badgeCountFloor = Math.max(0, badgeCountFloor - normalizedCount);
  if (badgeCountFloor <= 0) {
    badgeCountFloorExpiresAt = 0;
  }
  return badgeCountFloor;
};

const performApplicationBadgeCountSync = async (
  count: number,
  options?: ApplicationBadgeSyncOptions
) => {
  const requestedCount = normalizeBadgeCount(count);
  const hasActiveFloor = Date.now() <= badgeCountFloorExpiresAt;
  if (!hasActiveFloor) {
    badgeCountFloor = 0;
    badgeCountFloorExpiresAt = 0;
  }
  const shouldIgnoreFloor = options?.ignoreFloor === true;
  if (applicationBadgeSuppressed) {
    badgeCountFloor = 0;
    badgeCountFloorExpiresAt = 0;
  }
  const normalizedCount = applicationBadgeSuppressed
    ? 0
    : shouldIgnoreFloor
    ? requestedCount
    : Math.max(requestedCount, hasActiveFloor ? badgeCountFloor : 0);
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined') {
      const webNavigator = navigator as Navigator & {
        setAppBadge?: (contents?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };

      try {
        if (normalizedCount > 0 && typeof webNavigator.setAppBadge === 'function') {
          await webNavigator.setAppBadge(normalizedCount);
        } else if (typeof webNavigator.clearAppBadge === 'function') {
          await webNavigator.clearAppBadge();
        }
      } catch {
        // Web app badge API is optional and browser-dependent.
      }
    }

    return;
  }

  const syncAndroidCarrier = () => syncAndroidLauncherBadgeCarrier(normalizedCount, {
    requestedCount,
    source: shouldIgnoreFloor ? 'db_absolute_client' : 'db_absolute_or_owner_floor',
    preserveNotificationOnZero:
      Platform.OS === 'android' &&
      normalizedCount <= 0 &&
      options?.preserveAndroidNotificationOnZero === true,
  });

  if (Platform.OS === 'android' && normalizedCount <= 0) {
    // On Android Expo implements setBadgeCountAsync(0) with cancelAll() on
    // supported launchers. That removes real FCM notifications from the
    // system drawer. Notifee clears only the launcher count and our private
    // carrier, leaving delivered pushes intact.
    await syncAndroidCarrier();
    return;
  }

  try {
    await Notifications.setBadgeCountAsync(normalizedCount);
  } catch {
    // Badge support depends on platform permissions/settings.
  }

  await syncAndroidCarrier();
};

export const syncApplicationBadgeCount = (
  count: number,
  options?: ApplicationBadgeSyncOptions
) => {
  // Identity hydration, realtime refresh and foreground recovery can request
  // icon writes at almost the same instant. Native badge APIs are async: an
  // older zero used to be able to finish after a newer authoritative count.
  // Serial execution preserves request order, so the last internal count is
  // always the last value written to the launcher icon.
  const queuedSync = applicationBadgeSyncQueue.then(
    () => performApplicationBadgeCountSync(count, options),
    () => performApplicationBadgeCountSync(count, options)
  );
  applicationBadgeSyncQueue = queuedSync.catch(() => undefined);
  return queuedSync;
};

export const setApplicationBadgeSuppressed = async (suppressed: boolean) => {
  applicationBadgeSuppressed = suppressed;
  if (!suppressed) {
    return;
  }

  clearApplicationBadgeCountFloor();
  await syncApplicationBadgeCount(0, { ignoreFloor: true });
};

const readAbsoluteUnreadCount = (data: Record<string, unknown> | null | undefined) => {
  const rawValue = data?.unreadCount ?? data?.unread_count;
  const numericValue =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string' && rawValue.trim().length > 0
        ? Number(rawValue)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return normalizeBadgeCount(numericValue);
};

export const syncApplicationBadgeCountFromPushData = async (
  data: Record<string, unknown> | null | undefined,
  options?: {
    recipientRole?: string | null;
    appState?: string | null;
    notificationId?: string | null;
    eventId?: string | null;
  }
) => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return false;
  }

  const unreadCount = readAbsoluteUnreadCount(data);
  if (unreadCount === null) {
    logClientPushAlignment('push_payload_unreadCount_missing', {
      recipientRole: options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget ?? null,
      notificationId: options?.notificationId ?? data?.notificationId ?? null,
      eventId: options?.eventId ?? data?.eventId ?? null,
      appState: options?.appState ?? AppState.currentState,
      localIncrementUsed: false,
    });
    return false;
  }

  if (applicationBadgeSuppressed) {
    logClientPushAlignment('push_payload_badge_suppressed', {
      recipientRole: options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget ?? null,
      notificationId: options?.notificationId ?? data?.notificationId ?? null,
      eventId: options?.eventId ?? data?.eventId ?? null,
      unreadCountDbCalculated: unreadCount,
      appState: options?.appState ?? AppState.currentState,
      localIncrementUsed: false,
    });
    await syncApplicationBadgeCount(0, {
      ignoreFloor: true,
      preserveAndroidNotificationOnZero:
        Platform.OS === 'android' &&
        (options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget) === 'owner' &&
        (options?.appState ?? AppState.currentState) === 'active',
    });
    return true;
  }

  const recipientRole = String(
    options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget ?? ''
  )
    .trim()
    .toLowerCase();
  if (Platform.OS === 'android' && recipientRole === 'client') {
    raiseApplicationBadgeCountFloor(unreadCount);
  }

  logClientPushAlignment('push_payload_absolute_unreadCount', {
    recipientRole: options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget ?? null,
    userId: data?.userId ?? null,
    clientId: data?.clientId ?? data?.customerId ?? null,
    ownerId: data?.ownerId ?? null,
    notificationId: options?.notificationId ?? data?.notificationId ?? null,
    eventId: options?.eventId ?? data?.eventId ?? null,
    unreadCountDbCalculated: unreadCount,
    payloadBadge: data?.badge ?? unreadCount,
    payloadUnreadCount: data?.unreadCount ?? data?.unread_count ?? null,
    setBadgeCountAsyncValue: unreadCount,
    appState: options?.appState ?? AppState.currentState,
    localIncrementUsed: false,
  });

  await syncApplicationBadgeCount(unreadCount, {
    ignoreFloor: Platform.OS !== 'android' || recipientRole !== 'client',
    preserveAndroidNotificationOnZero:
      Platform.OS === 'android' &&
      unreadCount <= 0 &&
      (options?.recipientRole ?? data?.recipientRole ?? data?._pushTarget) === 'owner' &&
      (options?.appState ?? AppState.currentState) === 'active',
  });
  return true;
};

export const emitOwnerViewedNotificationChange = (payload: OwnerViewedPayload) => {
  const ownerEmail = payload.ownerEmail.trim().toLowerCase();
  if (!ownerEmail) {
    return;
  }

  const normalizedPayload: OwnerViewedPayload = {
    ownerEmail,
    requestSignatures: Array.from(new Set(payload.requestSignatures ?? [])),
    clientIds: Array.from(new Set(payload.clientIds ?? [])),
    clientKeys: Array.from(new Set(payload.clientKeys ?? [])),
  };

  ownerViewedListeners.forEach((listener) => listener(normalizedPayload));
};

export const subscribeOwnerViewedNotificationChanges = (listener: OwnerViewedListener) => {
  ownerViewedListeners.add(listener);
  return () => {
    ownerViewedListeners.delete(listener);
  };
};
