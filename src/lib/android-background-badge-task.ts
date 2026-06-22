import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { syncAndroidLauncherBadgeCarrier } from './android-launcher-badge-carrier';

const ANDROID_BACKGROUND_BADGE_TASK = 'SALONPRO_ANDROID_BACKGROUND_BADGE_SYNC';

const logAndroidBadgeSync = (event: string, payload?: Record<string, unknown>) => {
  if (Platform.OS !== 'android') {
    return;
  }
};

const normalizeBadgeCount = (value: unknown) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue)) : null;
};

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const normalizeTaskPayloadData = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const data = typeof raw.data === 'object' && raw.data !== null
    ? (raw.data as Record<string, unknown>)
    : {};
  const notification = typeof raw.notification === 'object' && raw.notification !== null
    ? (raw.notification as Record<string, unknown>)
    : {};
  const request = typeof raw.request === 'object' && raw.request !== null
    ? (raw.request as Record<string, unknown>)
    : {};
  const content = typeof request.content === 'object' && request.content !== null
    ? (request.content as Record<string, unknown>)
    : {};
  const contentData = typeof content.data === 'object' && content.data !== null
    ? (content.data as Record<string, unknown>)
    : {};
  const parsedDataString = parseJsonObject(data.dataString);
  const parsedPayload = parseJsonObject(data.payload) ?? parseJsonObject(raw.payload);

  return {
    ...notification,
    ...data,
    ...contentData,
    ...(parsedDataString ?? {}),
    ...(parsedPayload ?? {}),
  };
};

if (Platform.OS === 'android' && !TaskManager.isTaskDefined(ANDROID_BACKGROUND_BADGE_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    ANDROID_BACKGROUND_BADGE_TASK,
    async ({ data, error, executionInfo }) => {
      if (error) {
        logAndroidBadgeSync('background_task_error', {
          message: error.message,
          code: error.code,
          taskName: executionInfo.taskName,
          eventId: executionInfo.eventId,
        });
        return;
      }

      const payload = normalizeTaskPayloadData(data);
      const unreadCount = normalizeBadgeCount(payload.unreadCount ?? payload.unread_count ?? payload.badge);

      if (unreadCount === null) {
        logAndroidBadgeSync('background_task_unreadCount_missing', {
          taskName: executionInfo.taskName,
          eventId: executionInfo.eventId,
          recipientRole: payload.recipientRole ?? payload._pushTarget ?? payload._pushAudience ?? null,
          notificationId: payload.notificationId ?? null,
          pushEventType: payload._pushEventType ?? payload.type ?? null,
          localIncrementUsed: false,
        });
        return;
      }

      const didSetBadge = await Notifications.setBadgeCountAsync(unreadCount).catch(() => false);
      await syncAndroidLauncherBadgeCarrier(unreadCount, {
        taskName: executionInfo.taskName,
        eventId: executionInfo.eventId,
        recipientRole: payload.recipientRole ?? payload._pushTarget ?? payload._pushAudience ?? null,
        userId: payload.userId ?? null,
        clientId: payload.clientId ?? payload.customerId ?? null,
        ownerId: payload.ownerId ?? null,
        pushNotificationId: payload.notificationId ?? null,
      });
      logAndroidBadgeSync('background_task_setBadgeCountAsync', {
        taskName: executionInfo.taskName,
        eventId: executionInfo.eventId,
        recipientRole: payload.recipientRole ?? payload._pushTarget ?? payload._pushAudience ?? null,
        userId: payload.userId ?? null,
        clientId: payload.clientId ?? payload.customerId ?? null,
        ownerId: payload.ownerId ?? null,
        notificationId: payload.notificationId ?? null,
        payloadBadge: payload.badge ?? unreadCount,
        payloadUnreadCount: payload.unreadCount ?? payload.unread_count ?? null,
        unreadCountDbCalculated: unreadCount,
        setBadgeCountAsyncValue: unreadCount,
        setBadgeCountAsyncResult: didSetBadge,
        appState: AppState.currentState,
        localIncrementUsed: false,
      });
    }
  );
}

export const registerAndroidBackgroundBadgeSyncTask = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(
      ANDROID_BACKGROUND_BADGE_TASK
    ).catch(() => false);
    if (!alreadyRegistered) {
      await Notifications.registerTaskAsync(ANDROID_BACKGROUND_BADGE_TASK);
    }

    logAndroidBadgeSync('background_task_registered', {
      alreadyRegistered,
      taskName: ANDROID_BACKGROUND_BADGE_TASK,
    });
  } catch (error) {
    logAndroidBadgeSync('background_task_register_failed', {
      message: error instanceof Error ? error.message : String(error),
      taskName: ANDROID_BACKGROUND_BADGE_TASK,
    });
  }
};
