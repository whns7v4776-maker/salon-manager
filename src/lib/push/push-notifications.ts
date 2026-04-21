import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const PUSH_TOKEN_STORAGE_KEY = 'salon_manager_expo_push_token';
const PUSH_FLUSH_LIMIT = 50;
const runtimeLocalNotificationDedupeMap = new Map<string, number>();

type RegisterPushParams = {
  workspaceId: string;
  ownerEmail: string;
  audience?: 'auto' | 'auth' | 'public';
  recipientKind?: 'owner' | 'client';
  customerEmail?: string;
  customerPhone?: string;
};

type RegisterPushResult = {
  token: string | null;
  backendSynced: boolean;
  reason?: string;
};

type QueuePushParams = {
  workspaceId: string;
  eventType: 'booking_request_created' | 'booking_request_status_changed' | 'appointment_cancelled' | 'custom';
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  audience?: 'auto' | 'auth' | 'public' | 'all';
  customerEmail?: string;
  customerPhone?: string;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

const normalizePushEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizePushPhone = (value?: string | null) => (value ?? '').replace(/\D+/g, '');

const getProjectId = () => {
  const projectIdFromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  if (projectIdFromEasConfig) return projectIdFromEasConfig;

  const expoConfig = Constants.expoConfig as
    | {
        extra?: {
          eas?: {
            projectId?: string;
          };
        };
      }
    | undefined;

  return expoConfig?.extra?.eas?.projectId;
};

const isExpoGoRuntime = () => Constants.executionEnvironment === 'storeClient';

export const isExpoGoPushRuntime = () => isExpoGoRuntime();

const resolveRpcName = async ({
  authName,
  publicName,
  audience = 'auto',
}: {
  authName: string;
  publicName: string;
  audience?: 'auto' | 'auth' | 'public';
}) => {
  if (audience === 'auth') {
    return authName;
  }

  if (audience === 'public') {
    return publicName;
  }

  const { data: authSession } = await supabase.auth.getSession();
  return authSession.session ? authName : publicName;
};

export const configurePushNotifications = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

const ensureNotificationPermissions = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus;
};

export const getNotificationPermissionStatus = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
};

export const requestNotificationPermissionsOnly = async () => {
  const status = await ensureNotificationPermissions();
  await ensureAndroidNotificationChannel();
  return status;
};

const ensureAndroidNotificationChannel = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#d4af37',
  });
};

export const scheduleLocalTestNotification = async ({
  title = 'SalonPro',
  body = 'Notifica locale di test inviata correttamente.',
}: {
  title?: string;
  body?: string;
} = {}) => {
  const permissionStatus = await ensureNotificationPermissions();
  if (permissionStatus !== 'granted') {
    return { ok: false as const, reason: 'permission_denied' };
  }

  await ensureAndroidNotificationChannel();

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: {
        source: 'local_test',
        sentAt: new Date().toISOString(),
      },
    },
    trigger:
      Platform.OS === 'android'
        ? { channelId: 'default', type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 }
        : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
  });

  return { ok: true as const };
};

export const scheduleLocalRuntimeNotification = async ({
  title,
  body,
  data = {},
  delaySeconds = 1,
  dedupeKey,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  delaySeconds?: number;
  dedupeKey?: string;
}) => {
  const permissionStatus = await ensureNotificationPermissions();
  if (permissionStatus !== 'granted') {
    return { ok: false as const, reason: 'permission_denied' };
  }

  await ensureAndroidNotificationChannel();

  if (dedupeKey) {
    const now = Date.now();
    const lastSentAt = runtimeLocalNotificationDedupeMap.get(dedupeKey) ?? 0;
    if (now - lastSentAt < 15000) {
      return { ok: true as const, deduped: true as const };
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const duplicates = scheduled.filter((item) => {
      const payload = item.content.data as Record<string, unknown> | undefined;
      return payload?.dedupeKey === dedupeKey;
    });

    await Promise.all(
      duplicates.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
    );
    runtimeLocalNotificationDedupeMap.set(dedupeKey, now);
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: {
        ...data,
        dedupeKey: dedupeKey ?? null,
      },
    },
    trigger:
      Platform.OS === 'android'
        ? {
            channelId: 'default',
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(1, delaySeconds),
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(1, delaySeconds),
          },
  });

  return { ok: true as const };
};

const getExpoPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    return null;
  }

  if (isExpoGoRuntime()) {
    throw new Error('expo_go_push_unsupported');
  }

  const finalStatus = await ensureNotificationPermissions();
  if (finalStatus !== 'granted') {
    return null;
  }

  await ensureAndroidNotificationChannel();

  const projectId = getProjectId();
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
};

const upsertPushTokenBackend = async ({
  workspaceId,
  ownerEmail,
  token,
  audience = 'auto',
  recipientKind = 'client',
  customerEmail,
  customerPhone,
}: {
  workspaceId: string;
  ownerEmail: string;
  token: string;
  audience?: 'auto' | 'auth' | 'public';
  recipientKind?: 'owner' | 'client';
  customerEmail?: string;
  customerPhone?: string;
}) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  const rpcName = await resolveRpcName({
    authName: 'upsert_push_device',
    publicName: 'upsert_public_push_device',
    audience,
  });

  const rpcPayload: Record<string, unknown> = {
    p_workspace_id: workspaceId,
    p_owner_email: ownerEmail,
    p_expo_push_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'manual',
    p_device_model: Device.modelName ?? null,
    p_app_version: Constants.expoConfig?.version ?? null,
  };

  if (rpcName === 'upsert_public_push_device') {
    rpcPayload.p_recipient_kind = recipientKind;
    rpcPayload.p_customer_email = normalizePushEmail(customerEmail) || null;
    rpcPayload.p_customer_phone = normalizePushPhone(customerPhone) || null;
  }

  const { error } = await supabase.rpc(rpcName, rpcPayload);

  if (error) {
    console.log('Errore sincronizzazione push device:', error);
  }

  return !error;
};

export const registerPushNotifications = async ({
  workspaceId,
  ownerEmail,
  audience = 'auto',
  recipientKind = 'client',
  customerEmail,
  customerPhone,
}: RegisterPushParams): Promise<RegisterPushResult> => {
  try {
    const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    const token = await getExpoPushToken().catch((error) => {
      console.log('Push token refresh fallback:', error);
      return storedToken;
    });

    if (!token) {
      return {
        token: null,
        backendSynced: false,
        reason: storedToken ? 'backend_sync_fallback_failed' : 'permission_or_project_id_missing',
      };
    }

    if (token !== storedToken) {
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    }

    const backendSynced = await upsertPushTokenBackend({
      workspaceId,
      ownerEmail,
      token,
      audience,
      recipientKind,
      customerEmail,
      customerPhone,
    });

    return { token, backendSynced };
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim() ? error.message.trim() : 'register_failed';

    return {
      token: null,
      backendSynced: false,
      reason,
    };
  }
};

export const getStoredPushToken = async () => AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

export const flushQueuedPushNotifications = async (limit = PUSH_FLUSH_LIMIT) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { limit: Math.min(Math.max(limit, 1), 200) },
    });

    if (error) {
      console.log('Errore invocazione send-push:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.log('Errore flush coda push:', error);
    return false;
  }
};

export const queueWorkspacePushNotification = async ({
  workspaceId,
  eventType,
  title,
  body,
  payload = {},
  audience = 'auto',
  customerEmail,
  customerPhone,
}: QueuePushParams) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  const normalizedCustomerEmail = normalizePushEmail(customerEmail);
  const normalizedCustomerPhone = normalizePushPhone(customerPhone);
  const hasTargetedClient =
    audience !== 'auth' && (!!normalizedCustomerEmail || !!normalizedCustomerPhone);

  const rpcCalls =
    audience === 'all'
      ? [
          supabase.rpc('queue_workspace_push', {
            p_workspace_id: workspaceId,
            p_event_type: eventType,
            p_title: title,
            p_body: body,
            p_payload: payload,
          }),
          supabase.rpc(
            hasTargetedClient ? 'queue_public_customer_push' : 'queue_public_workspace_push',
            {
              p_workspace_id: workspaceId,
              p_event_type: eventType,
              p_title: title,
              p_body: body,
              p_payload: payload,
              ...(hasTargetedClient
                ? {
                    p_customer_email: normalizedCustomerEmail || null,
                    p_customer_phone: normalizedCustomerPhone || null,
                  }
                : {}),
            }
          ),
        ]
      : hasTargetedClient
        ? [
            supabase.rpc('queue_public_customer_push', {
              p_workspace_id: workspaceId,
              p_event_type: eventType,
              p_title: title,
              p_body: body,
              p_payload: payload,
              p_customer_email: normalizedCustomerEmail || null,
              p_customer_phone: normalizedCustomerPhone || null,
            }),
          ]
        : [
            supabase.rpc(
              await resolveRpcName({
                authName: 'queue_workspace_push',
                publicName: 'queue_public_workspace_push',
                audience,
              }),
              {
                p_workspace_id: workspaceId,
                p_event_type: eventType,
                p_title: title,
                p_body: body,
                p_payload: payload,
              }
            ),
          ];

  const results = await Promise.all(rpcCalls);

  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    console.log('Errore accodamento push notification:', failedResult.error);
    return false;
  }

  await flushQueuedPushNotifications();
  return true;
};
