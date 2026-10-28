import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { syncApplicationBadgeCountFromPushData } from '../notification-badge-sync';
import { getSupabaseSessionSafely, supabase } from '../supabase';

const PUSH_TOKEN_STORAGE_KEY = 'salon_manager_expo_push_token';
const PUSH_FLUSH_LIMIT = 50;
const logAndroidClientPush = (event: string, payload?: Record<string, unknown>) => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return;
  }
};
const runtimeLocalNotificationDedupeMap = new Map<string, number>();
const runtimeQueuedPushDedupeMap = new Map<string, number>();
const runtimeForegroundPushDedupeMap = new Map<string, number>();
const runtimeAndroidClientRichPushMap = new Map<string, number>();
const FOREGROUND_PUSH_DEDUPE_TTL_MS = 60 * 60 * 1000;
const ANDROID_CLIENT_RICH_PUSH_DEDUPE_TTL_MS = 2 * 60 * 1000;
const OWNER_BANNER_SOUND_DEDUPE_TTL_MS = 60 * 60 * 1000;
const ANDROID_VISIBLE_PUSH_CHANNEL_ID = 'salonpro-alerts';
export const ANDROID_CLIENT_BOOKING_CHANNEL_ID = 'client-booking';
const ANDROID_CLIENT_FOREGROUND_CHANNEL_ID = 'salonpro-client-foreground-v2';
export const ANDROID_CLIENT_FOREGROUND_PERSISTENT_CHANNEL_ID =
  'salonpro-client-foreground-persistent-v5';
const ANDROID_CLIENT_NOTIFEE_FOREGROUND_CHANNEL_ID =
  'salonpro-client-notifee-foreground-persistent-v4';
const ANDROID_OWNER_NOTIFEE_FOREGROUND_CHANNEL_ID =
  'salonpro-owner-notifee-foreground-persistent-v1';
let foregroundPushPresentationMode: 'system' | 'owner_auth_banner_only' = 'system';
let clientForegroundPushPresentationMode: 'system' | 'client_runtime' = 'system';

type RegisterPushParams = {
  workspaceId: string;
  ownerEmail: string;
  audience?: 'auto' | 'auth' | 'public';
  recipientKind?: 'owner' | 'client';
  customerEmail?: string;
  customerPhone?: string;
  requestPermissionsIfNeeded?: boolean;
  isRegistrationCurrent?: () => boolean;
};

type RegisterPushResult = {
  token: string | null;
  backendSynced: boolean;
  reason?: string;
  diagnostics?: {
    isDevice: boolean;
    isExpoGo: boolean;
    projectIdPresent: boolean;
    permissionStatus: string | null;
    usedStoredTokenFallback: boolean;
    storedTokenPresent: boolean;
  };
};

type QueuePushParams = {
  workspaceId: string;
  eventType:
    | 'booking_request_created'
    | 'booking_request_status_changed'
    | 'appointment_cancelled'
    | 'custom';
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  audience?: 'auto' | 'auth' | 'public' | 'all';
  customerEmail?: string;
  customerPhone?: string;
  requireTargetedClient?: boolean;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

const normalizePushEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizePushPhone = (value?: string | null) => (value ?? '').replace(/\D+/g, '');
type PushRegistrationClientIdentity = {
  workspaceId: string;
  ownerEmail: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

const buildPushRegistrationClientIdentityKey = (identity?: PushRegistrationClientIdentity | null) =>
  identity
    ? [
        identity.workspaceId.trim().toLowerCase(),
        normalizePushEmail(identity.ownerEmail),
        normalizePushEmail(identity.customerEmail),
        normalizePushPhone(identity.customerPhone),
      ].join('|')
    : '';

let pushRegistrationRuntimeScope: {
  recipientKind: 'owner' | 'client' | null;
  clientIdentityKey: string;
} = { recipientKind: null, clientIdentityKey: '' };
let pushRegistrationRuntimeRevision = 0;
let pushRegistrationBackendQueue: Promise<unknown> = Promise.resolve();

export const isClientPushRegistrationRuntimeRoute = (pathname: string) =>
  pathname === '/cliente' ||
  pathname.startsWith('/cliente-') ||
  pathname.startsWith('/join/');

export const setPushRegistrationRuntimeScope = ({
  recipientKind,
  clientIdentity,
}: {
  recipientKind: 'owner' | 'client' | null;
  clientIdentity?: PushRegistrationClientIdentity | null;
}) => {
  const clientIdentityKey =
    recipientKind === 'client' ? buildPushRegistrationClientIdentityKey(clientIdentity) : '';
  if (
    pushRegistrationRuntimeScope.recipientKind === recipientKind &&
    pushRegistrationRuntimeScope.clientIdentityKey === clientIdentityKey
  ) {
    return;
  }
  pushRegistrationRuntimeScope = { recipientKind, clientIdentityKey };
  pushRegistrationRuntimeRevision += 1;
};

const maskPushIdentity = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.includes('@')) {
    const [localPart = '', domain = ''] = normalized.split('@');
    return `${localPart.slice(0, 2)}***@${domain}`;
  }
  const digits = normalized.replace(/\D+/g, '');
  if (digits.length >= 6) return `***${digits.slice(-4)}`;
  return normalized.length <= 3 ? '***' : `${normalized.slice(0, 2)}***`;
};
const normalizePushText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const formatNotificationCopyDateText = (value: string) =>
  value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1');
const buildQueuedPushDedupeKey = ({
  workspaceId,
  eventType,
  audience,
  customerEmail,
  customerPhone,
  payload,
}: {
  workspaceId: string;
  eventType: QueuePushParams['eventType'];
  audience: NonNullable<QueuePushParams['audience']>;
  customerEmail?: string;
  customerPhone?: string;
  payload?: Record<string, unknown>;
}) => {
  const payloadType = normalizePushText(payload?.type ?? payload?._pushEventType ?? '');
  const bookingRequestId = normalizePushText(payload?.bookingRequestId ?? payload?.requestId ?? '');
  const appointmentId = normalizePushText(payload?.appointmentId ?? '');
  const appointmentDate = normalizePushText(payload?.appointmentDate ?? '');
  const appointmentTime = normalizePushText(payload?.appointmentTime ?? '');
  const serviceName = normalizePushText(payload?.serviceName ?? '');
  const customerName = normalizePushText(payload?.customerName ?? '');
  const statusCode = normalizePushText(payload?.statusCode ?? payload?.status ?? '');
  const cancellationEventId = normalizePushText(
    payload?.cancellationEventId ?? payload?.cancellation_event_id ?? ''
  );

  return [
    normalizePushText(workspaceId),
    normalizePushText(eventType),
    normalizePushText(audience),
    normalizePushEmail(customerEmail),
    normalizePushPhone(customerPhone),
    payloadType,
    bookingRequestId,
    appointmentId,
    appointmentDate,
    appointmentTime,
    serviceName,
    customerName,
    statusCode,
    cancellationEventId,
  ].join('|');
};
const buildPushTokenStorageKey = ({
  workspaceId,
  ownerEmail,
  recipientKind,
  customerEmail,
  customerPhone,
}: {
  workspaceId: string;
  ownerEmail: string;
  recipientKind: 'owner' | 'client';
  customerEmail?: string;
  customerPhone?: string;
}) => {
  const normalizedWorkspaceId = workspaceId.trim().toLowerCase();
  const normalizedOwnerEmail = normalizePushEmail(ownerEmail);
  const normalizedCustomerEmail = normalizePushEmail(customerEmail);
  const normalizedCustomerPhone = normalizePushPhone(customerPhone);
  const identity =
    recipientKind === 'owner'
      ? normalizedOwnerEmail
      : normalizedCustomerEmail || normalizedCustomerPhone;

  return [PUSH_TOKEN_STORAGE_KEY, normalizedWorkspaceId, recipientKind, identity]
    .filter(Boolean)
    .join('__');
};

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

export const setForegroundPushPresentationMode = (
  mode: 'system' | 'owner_auth_banner_only'
) => {
  foregroundPushPresentationMode = mode;
};

export const setClientForegroundPushPresentationMode = (
  mode: 'system' | 'client_runtime'
) => {
  clientForegroundPushPresentationMode = mode;
};

const isOwnerAuthForegroundPush = (data: Record<string, unknown> | undefined) => {
  const normalizedAudience = String(data?._pushAudience ?? '')
    .trim()
    .toLowerCase();
  const normalizedTarget = String(data?._pushTarget ?? '')
    .trim()
    .toLowerCase();
  const normalizedType = String(data?.type ?? data?._pushEventType ?? '')
    .trim()
    .toLowerCase();

  if (normalizedTarget === 'client' || normalizedAudience === 'public') {
    return false;
  }

  return (
    normalizedAudience === 'auth' ||
    normalizedTarget === 'owner' ||
    normalizedType === 'booking_request_created' ||
    normalizedType === 'booking_request_status_changed' ||
    normalizedType === 'appointment_cancelled'
  );
};

const isClientForegroundPush = (data: Record<string, unknown> | undefined) => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return false;
  }

  const normalizedAudience = String(data?._pushAudience ?? '')
    .trim()
    .toLowerCase();
  const normalizedTarget = String(data?._pushTarget ?? '')
    .trim()
    .toLowerCase();
  const normalizedType = String(
    data?.event_type ?? data?.notificationType ?? data?._pushEventType ?? data?.type ?? data?.eventType ?? ''
  )
    .trim()
    .toLowerCase();
  const normalizedStatus = String(data?.statusCode ?? data?.status ?? data?.requestStatus ?? '')
    .trim()
    .toLowerCase();
  const normalizedSource = String(data?.source ?? '')
    .trim()
    .toLowerCase();
  const hasWaitlistEntryId =
    String(data?.waitlistEntryId ?? data?.waitlist_entry_id ?? '').trim().length > 0;
  const isClientWaitlistEvent =
    normalizedType.includes('waitlist') ||
    normalizedType.includes('slot_available') ||
    normalizedSource.includes('waitlist') ||
    hasWaitlistEntryId;
  if (normalizedTarget === 'owner' || normalizedAudience === 'auth') {
    return false;
  }

  const hasClientIdentity =
    String(data?.customerEmail ?? '').trim().length > 0 ||
    String(data?.customerPhone ?? '').trim().length > 0;
  const isClientBookingEvent =
    [
      'frontend_client_status',
      'booking_request_status_changed',
      'appointment_cancelled',
      'appointment_cancelled_by_salon',
      'appointment_created',
      'appointment_created_by_salon',
      'appointment_group_created_by_salon',
      'appointment_accepted',
      'appointment_updated',
      'appointment_rescheduled',
      'appointment_rescheduled_by_salon',
      'slot_waitlist_available',
      'waitlist_available',
      'slot_available',
      'cancelled',
      'accepted',
      'auto_accepted',
      'rejected',
      'declined',
    ].includes(normalizedType);
  const isClientBookingStatus =
    ['cancelled', 'accepted', 'auto_accepted', 'rejected', 'declined'].includes(
      normalizedStatus
    );

  return (
    normalizedTarget === 'client' ||
    normalizedAudience === 'public' ||
    isClientWaitlistEvent ||
    (hasClientIdentity && (isClientBookingEvent || isClientBookingStatus))
  );
};

const isAndroidSalonCancellationPush = (data: Record<string, unknown> | undefined) => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const normalizedTarget = String(data?._pushTarget ?? data?._pushAudience ?? '')
    .trim()
    .toLowerCase();
  const normalizedType = String(
    data?.event_type ?? data?.notificationType ?? data?._pushEventType ?? data?.type ?? data?.eventType ?? ''
  )
    .trim()
    .toLowerCase();
  const normalizedStatus = String(data?.statusCode ?? data?.status ?? data?.requestStatus ?? '')
    .trim()
    .toLowerCase();
  const cancellationSource = String(data?.cancellationSource ?? data?.cancellation_source ?? '')
    .trim()
    .toLowerCase();

  return (
    (normalizedTarget === 'client' || normalizedTarget === 'public') &&
    (normalizedType === 'appointment_cancelled_by_salon' ||
      (normalizedStatus === 'cancelled' && cancellationSource === 'salone'))
  );
};

const buildIncomingPushDedupeKey = (data: Record<string, unknown> | undefined) => {
  if (!data) {
    return '';
  }

  const explicitKey = String(data._dedupeKey ?? data.dedupeKey ?? '').trim();
  if (explicitKey) {
    return explicitKey;
  }

  return [
    data._pushTarget ?? data._pushAudience ?? '',
    data._pushEventType ?? data.type ?? '',
    data.bookingRequestId ?? data.requestId ?? '',
    data.appointmentId ?? '',
    data.appointmentDate ?? '',
    data.appointmentTime ?? '',
    data.customerName ?? '',
    data.serviceName ?? '',
    data.statusCode ?? data.status ?? '',
    data.cancellationEventId ?? data.cancellation_event_id ?? '',
  ]
    .map((value) => normalizePushText(value))
    .join('|');
};

const buildAndroidClientBookingSemanticKey = (data: Record<string, unknown> | undefined) => {
  if (!data) {
    return '';
  }

  const normalizedTarget = normalizePushText(data._pushTarget ?? data._pushAudience ?? '');
  const normalizedType = normalizePushText(
    data.event_type ?? data.notificationType ?? data._pushEventType ?? data.type ?? ''
  );
  const isClientBookingStatusPush =
    normalizedTarget === 'client' &&
    (normalizedType === 'booking_request_status_changed' ||
      normalizedType === 'appointment_cancelled' ||
      normalizedType === 'appointment_cancelled_by_salon' ||
      normalizedType === 'appointment_created' ||
      normalizedType === 'appointment_created_by_salon' ||
      normalizedType === 'appointment_group_created_by_salon' ||
      normalizedType === 'appointment_updated' ||
      normalizedType === 'appointment_rescheduled' ||
      normalizedType === 'appointment_rescheduled_by_salon');

  if (!isClientBookingStatusPush) {
    return '';
  }

  return [
    data._pushWorkspaceId ?? '',
    data.bookingRequestId ?? data.requestId ?? '',
    data.appointmentId ?? '',
    data.customerEmail ?? '',
    data.customerPhone ?? '',
    data.appointmentDate ?? '',
    data.appointmentTime ?? '',
    data.serviceName ?? '',
    data.statusCode ?? data.status ?? normalizedType,
    data.cancellationEventId ?? data.cancellation_event_id ?? '',
  ]
    .map((value) => normalizePushText(value))
    .join('|');
};

const isRichAndroidClientBookingPush = (data: Record<string, unknown> | undefined) => {
  if (!data) {
    return false;
  }

  const normalizedType = normalizePushText(data._pushEventType ?? data.type ?? '');
  const copy = `${data.title ?? ''} ${data.body ?? ''}`;
  return Boolean(
    normalizedType === 'appointment_created' ||
      normalizedType === 'appointment_created_by_salon' ||
      normalizedType === 'appointment_group_created_by_salon' ||
      normalizedType === 'appointment_rescheduled' ||
      normalizedType === 'appointment_rescheduled_by_salon' ||
      normalizePushText(data.previousDate).length > 0 ||
      normalizePushText(data.previousTime).length > 0 ||
      /\b(prima|nuova data|nuovo orario|spostato)\b/i.test(copy) ||
      normalizePushText(data.operatorName).length > 0 ||
      normalizePushText(data.operatorId).length > 0 ||
      normalizePushText(data.roleName).length > 0 ||
      normalizePushText(data.mestiereRichiesto).length > 0
  );
};

const shouldSuppressSparseAndroidClientBookingPush = (
  data: Record<string, unknown> | undefined
) => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const semanticKey = buildAndroidClientBookingSemanticKey(data);
  if (!semanticKey) {
    return false;
  }

  const now = Date.now();
  runtimeAndroidClientRichPushMap.forEach((timestamp, key) => {
    if (now - timestamp > ANDROID_CLIENT_RICH_PUSH_DEDUPE_TTL_MS) {
      runtimeAndroidClientRichPushMap.delete(key);
    }
  });

  if (isRichAndroidClientBookingPush(data)) {
    runtimeAndroidClientRichPushMap.set(semanticKey, now);
    return false;
  }

  const richSeenAt = runtimeAndroidClientRichPushMap.get(semanticKey) ?? 0;
  return richSeenAt > 0 && now - richSeenAt <= ANDROID_CLIENT_RICH_PUSH_DEDUPE_TTL_MS;
};

const shouldSuppressDuplicateForegroundPush = (
  data: Record<string, unknown> | undefined
) => {
  const dedupeKey = buildIncomingPushDedupeKey(data);
  if (!dedupeKey) {
    return false;
  }

  const now = Date.now();
  runtimeForegroundPushDedupeMap.forEach((timestamp, key) => {
    if (now - timestamp > FOREGROUND_PUSH_DEDUPE_TTL_MS) {
      runtimeForegroundPushDedupeMap.delete(key);
    }
  });

  const lastSeenAt = runtimeForegroundPushDedupeMap.get(dedupeKey) ?? 0;
  if (lastSeenAt > 0 && now - lastSeenAt <= FOREGROUND_PUSH_DEDUPE_TTL_MS) {
    return true;
  }

  runtimeForegroundPushDedupeMap.set(dedupeKey, now);
  return false;
};

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

  const { data: authSession } = await getSupabaseSessionSafely();
  return authSession.session ? authName : publicName;
};

const hasAuthenticatedSession = async () => {
  const { data: authSession } = await getSupabaseSessionSafely();
  return !!authSession.session;
};

export const configurePushNotifications = () => {
  if (Platform.OS === 'android') {
    void import('../android-background-badge-task')
      .then(({ registerAndroidBackgroundBadgeSyncTask }) =>
        registerAndroidBackgroundBadgeSyncTask()
      )
      .catch(() => undefined);
  }

  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        try {
          const isForeground = AppState.currentState === 'active';
          const notificationData =
            (notification.request.content.data as Record<string, unknown> | undefined) ?? undefined;
          const isAndroidBadgeOnlyRefresh =
            Platform.OS === 'android' && notificationData?._badgeOnly === true;
          if (isAndroidBadgeOnlyRefresh) {
            await syncApplicationBadgeCountFromPushData(notificationData, {
              recipientRole: String(
                notificationData?.recipientRole ?? notificationData?._pushTarget ?? ''
              ),
              notificationId:
                String(
                  notificationData?.notificationId ?? notification.request.identifier ?? ''
                ) || null,
              eventId: String(notificationData?.eventId ?? '') || null,
              appState: AppState.currentState,
            });
            logAndroidClientPush('handler_badge_only_synced', {
              notificationId: notificationData?.notificationId ?? null,
              eventId: notificationData?.eventId ?? null,
              unreadCount:
                notificationData?.unreadCount ?? notificationData?.unread_count ?? null,
            });
            return {
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          }
          if (isClientForegroundPush(notificationData)) {
            logAndroidClientPush('handler_foreground_called', {
              appState: AppState.currentState,
              notificationId: notificationData?.notificationId ?? null,
              eventId: notificationData?.eventId ?? null,
              dedupeKey: notificationData?._dedupeKey ?? notificationData?.dedupeKey ?? null,
              type:
                notificationData?.event_type ??
                notificationData?.notificationType ??
                notificationData?._pushEventType ??
                notificationData?.type ??
                null,
              status: notificationData?.statusCode ?? notificationData?.status ?? null,
              pushTarget: notificationData?._pushTarget ?? null,
              pushAudience: notificationData?._pushAudience ?? null,
              title: notification.request.content.title ?? null,
              body: notification.request.content.body ?? null,
            });
          }
          if (notificationData?._localForegroundMirror === true) {
            if (Platform.OS === 'android') {
              logAndroidClientPush('handler_local_foreground_mirror_show');
            }
            return {
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          if (
            Platform.OS === 'android' &&
            (isClientForegroundPush(notificationData) ||
              isOwnerAuthForegroundPush(notificationData))
          ) {
            const shouldSuppressDuplicate =
              shouldSuppressDuplicateForegroundPush(notificationData);
            const shouldSuppressSparseClientCopy =
              isClientForegroundPush(notificationData) &&
              shouldSuppressSparseAndroidClientBookingPush(notificationData);

            if (shouldSuppressDuplicate || shouldSuppressSparseClientCopy) {
              return {
                shouldShowBanner: false,
                shouldShowList: false,
                shouldPlaySound: false,
                shouldSetBadge: false,
              };
            }

            // Android owns foreground presentation for both customer and
            // salon runtimes. This keeps the same remote push visible in the
            // heads-up surface and notification drawer without an additional
            // in-app banner or local Notifee mirror.
            return {
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          if (
            Platform.OS === 'android' &&
            !isForeground &&
            isClientForegroundPush(notificationData)
          ) {
            // Defensive lifecycle routing: notification handlers normally run
            // only in foreground, but if Android invokes this while inactive,
            // the remote system notification remains the sole presenter.
            return {
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          if (
            clientForegroundPushPresentationMode === 'system' &&
            isClientForegroundPush(notificationData)
          ) {
            // When the customer is logged out there is no authenticated
            // frontend runtime that can render its in-app notification. Keep
            // the last registered device reachable, but let the operating
            // system present the push directly and exactly once.
            return {
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          if (
            foregroundPushPresentationMode === 'system' &&
            isOwnerAuthForegroundPush(notificationData)
          ) {
            // Outside the authenticated owner runtime (including the logout
            // screen), there is no in-app backoffice banner to take ownership
            // of the notification. Server-side routing already guarantees a
            // single owner target, so always hand the visible push directly to
            // the operating system before applying foreground UI dedupe.
            return {
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          if (isClientForegroundPush(notificationData)) {
            const shouldSuppressDuplicate = shouldSuppressDuplicateForegroundPush(notificationData);
            if (shouldSuppressDuplicate || shouldSuppressSparseAndroidClientBookingPush(notificationData)) {
              logAndroidClientPush('handler_foreground_client_suppressed', {
                reason: shouldSuppressDuplicate ? 'duplicate' : 'sparse_after_rich',
                notificationId: notificationData?.notificationId ?? null,
                eventId: notificationData?.eventId ?? null,
                dedupeKey: notificationData?._dedupeKey ?? notificationData?.dedupeKey ?? null,
              });
              return {
                shouldShowBanner: false,
                shouldShowList: false,
                shouldPlaySound: false,
                shouldSetBadge: false,
              };
            }

            logAndroidClientPush('handler_foreground_client_delegated', {
              notificationId: notificationData?.notificationId ?? null,
              eventId: notificationData?.eventId ?? null,
              type:
                notificationData?.event_type ??
                notificationData?.notificationType ??
                notificationData?._pushEventType ??
                notificationData?.type ??
                null,
              title: notification.request.content.title ?? null,
              body: notification.request.content.body ?? null,
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: Platform.OS !== 'android',
              shouldSetBadge: true,
            });
            return {
              // The active client runtime owns one internal banner. Keep the
              // system surface silent here; background Android delivery is
              // routed above and remains owned by the operating system.
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: Platform.OS !== 'android',
              shouldSetBadge: true,
            };
          }

          if (shouldSuppressSparseAndroidClientBookingPush(notificationData)) {
            return {
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          }

          const shouldSuppressDuplicate = shouldSuppressDuplicateForegroundPush(notificationData);
          if (shouldSuppressDuplicate) {
            return {
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          }

          const shouldUseOwnerBannerOnly =
            isForeground &&
            isOwnerAuthForegroundPush(notificationData) &&
            foregroundPushPresentationMode === 'owner_auth_banner_only' &&
            // Only booking pushes have an internal owner banner. Other events
            // (e.g. a new customer) must keep their tappable system banner.
            (notificationData?._playInAppBannerSound === true ||
              !!String(notificationData?.bookingRequestId ?? notificationData?.requestId ?? '').trim());
          const shouldPlayInAppBannerSoundOnly =
            shouldUseOwnerBannerOnly && notificationData?._playInAppBannerSound === true;

          return {
            shouldShowBanner:
              shouldUseOwnerBannerOnly ? false : true,
            shouldShowList: shouldUseOwnerBannerOnly ? false : true,
            shouldPlaySound: shouldUseOwnerBannerOnly
              ? Platform.OS === 'ios' || shouldPlayInAppBannerSoundOnly
              : true,
            shouldSetBadge: shouldUseOwnerBannerOnly ? false : true,
          };
        } catch {
          return {
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          };
        }
      },
    });
  } catch (error) {
    console.log('Configurazione notifiche non disponibile:', error);
  }
};

const ensureNotificationPermissions = async (options?: { requestIfNeeded?: boolean }) => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted' && options?.requestIfNeeded) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus;
  } catch (error) {
    console.log('Permessi notifiche non disponibili:', error);
    return 'undetermined';
  }
};

export const getNotificationPermissionStatus = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'undetermined';
  }
};

export const requestNotificationPermissionsOnly = async () => {
  const status = await ensureNotificationPermissions({ requestIfNeeded: true });
  await ensureAndroidNotificationChannel().catch(() => undefined);
  return status;
};

const ensureAndroidNotificationChannel = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SalonPro',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
    });
    await Notifications.setNotificationChannelAsync(ANDROID_VISIBLE_PUSH_CHANNEL_ID, {
      name: 'SalonPro avvisi',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CLIENT_BOOKING_CHANNEL_ID, {
      name: 'Prenotazioni cliente',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CLIENT_FOREGROUND_CHANNEL_ID, {
      name: 'SalonPro cliente',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CLIENT_FOREGROUND_PERSISTENT_CHANNEL_ID, {
      name: 'SalonPro cliente aggiornamenti persistenti',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
      sound: 'default',
    });
  } catch (error) {
    console.log('Canale notifiche Android non disponibile:', error);
  }
};

const toNotifeeData = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value ?? ''),
    ])
  );

const getAndroidNotifee = async () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  return import('@notifee/react-native');
};

export const displayAndroidClientForegroundNotification = async ({
  title,
  body,
  data = {},
  dedupeKey,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}) => {
  if (Platform.OS !== 'android') {
    return { ok: false as const, reason: 'not_android' as const };
  }

  try {
    const notifeeModule = await getAndroidNotifee();
    if (!notifeeModule) {
      return { ok: false as const, reason: 'not_android' as const };
    }
    const notifee = notifeeModule.default;
    const { AndroidImportance, AndroidVisibility } = notifeeModule;

    const permissionStatus = await ensureNotificationPermissions({ requestIfNeeded: true });
    if (permissionStatus !== 'granted') {
      return { ok: false as const, reason: 'permission_denied' as const };
    }

    if (dedupeKey) {
      const now = Date.now();
      const lastSentAt = runtimeLocalNotificationDedupeMap.get(dedupeKey) ?? 0;
      if (now - lastSentAt < 15000) {
        return { ok: true as const, deduped: true as const };
      }
      runtimeLocalNotificationDedupeMap.set(dedupeKey, now);
    }

    const channelId = await notifee.createChannel({
      id: ANDROID_CLIENT_NOTIFEE_FOREGROUND_CHANNEL_ID,
      name: 'SalonPro cliente',
      importance: AndroidImportance.HIGH,
      vibration: true,
      lights: true,
      sound: 'default',
      visibility: AndroidVisibility.PUBLIC,
      badge: true,
    });
    const rawAbsoluteBadgeCount = data.unreadCount ?? data.unread_count ?? data.badge;
    const parsedAbsoluteBadgeCount =
      typeof rawAbsoluteBadgeCount === 'number'
        ? rawAbsoluteBadgeCount
        : typeof rawAbsoluteBadgeCount === 'string' && rawAbsoluteBadgeCount.trim().length > 0
          ? Number(rawAbsoluteBadgeCount)
          : Number.NaN;
    const absoluteBadgeCount = Number.isFinite(parsedAbsoluteBadgeCount)
      ? Math.max(0, Math.trunc(parsedAbsoluteBadgeCount))
      : null;

    const notificationId = await notifee.displayNotification({
      id: dedupeKey,
      title: formatNotificationCopyDateText(title),
      body: formatNotificationCopyDateText(body),
      data: toNotifeeData({
        ...data,
        dedupeKey: dedupeKey ?? '',
        source: 'client_foreground_notifee',
      }),
      android: {
        channelId,
        smallIcon: 'notification_icon',
        color: '#181818',
        sound: 'default',
        ...(absoluteBadgeCount !== null ? { badgeCount: absoluteBadgeCount } : {}),
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: false,
        showTimestamp: true,
      },
    });

    return { ok: true as const, identifier: notificationId };
  } catch (error) {
    console.log('Notifica foreground Android cliente non disponibile:', error);
    return { ok: false as const, reason: 'notifee_unavailable' as const };
  }
};

export const displayAndroidOwnerForegroundNotification = async ({
  title,
  body,
  data = {},
  dedupeKey,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}) => {
  if (Platform.OS !== 'android') {
    return { ok: false as const, reason: 'not_android' as const };
  }

  try {
    const notifeeModule = await getAndroidNotifee();
    if (!notifeeModule) {
      return { ok: false as const, reason: 'not_android' as const };
    }
    const notifee = notifeeModule.default;
    const { AndroidImportance, AndroidVisibility } = notifeeModule;

    const permissionStatus = await ensureNotificationPermissions({ requestIfNeeded: true });
    if (permissionStatus !== 'granted') {
      return { ok: false as const, reason: 'permission_denied' as const };
    }

    const normalizedDedupeKey = dedupeKey?.trim();
    if (normalizedDedupeKey) {
      const now = Date.now();
      const lastSentAt = runtimeLocalNotificationDedupeMap.get(normalizedDedupeKey) ?? 0;
      if (now - lastSentAt < 15000) {
        return { ok: true as const, deduped: true as const };
      }
      runtimeLocalNotificationDedupeMap.set(normalizedDedupeKey, now);
    }

    const channelId = await notifee.createChannel({
      id: ANDROID_OWNER_NOTIFEE_FOREGROUND_CHANNEL_ID,
      name: 'SalonPro salone',
      importance: AndroidImportance.DEFAULT,
      vibration: false,
      lights: true,
      visibility: AndroidVisibility.PUBLIC,
      badge: false,
    });

    const notificationId = await notifee.displayNotification({
      id: normalizedDedupeKey || undefined,
      title: formatNotificationCopyDateText(title || 'SalonPro'),
      body: formatNotificationCopyDateText(body || 'Aggiornamento prenotazione'),
      data: toNotifeeData({
        ...data,
        dedupeKey: normalizedDedupeKey ?? '',
        source: 'owner_foreground_notifee',
      }),
      android: {
        channelId,
        smallIcon: 'notification_icon',
        color: '#181818',
        pressAction: { id: 'default' },
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: false,
        showTimestamp: true,
        onlyAlertOnce: true,
      },
    });

    return { ok: true as const, identifier: notificationId };
  } catch (error) {
    console.log('Notifica foreground Android salone non disponibile:', error);
    return { ok: false as const, reason: 'notifee_unavailable' as const };
  }
};

export const clearAndroidClientForegroundNotifications = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    const notifeeModule = await getAndroidNotifee();
    if (!notifeeModule) {
      return;
    }
    const notifee = notifeeModule.default;

    const displayed = await notifee.getDisplayedNotifications();
    const clientForegroundIds = displayed
      .filter((item) => {
        const data = item.notification.data as Record<string, unknown> | undefined;
        const channelId = String(item.notification.android?.channelId ?? '');
        return (
          data?.source === 'client_foreground_notifee' ||
          channelId === ANDROID_CLIENT_NOTIFEE_FOREGROUND_CHANNEL_ID
        );
      })
      .map((item) => item.id)
      .filter((item): item is string => !!item);

    await Promise.all(
      clientForegroundIds.map((notificationId) =>
        notifee.cancelNotification(notificationId).catch(() => undefined)
      )
    );
  } catch (error) {
    console.log('Pulizia notifiche foreground Android cliente non disponibile:', error);
  }
};

export const scheduleLocalTestNotification = async ({
  title = 'SalonPro',
  body = 'Notifica locale di test inviata correttamente.',
}: {
  title?: string;
  body?: string;
} = {}) => {
  try {
    const permissionStatus = await ensureNotificationPermissions({ requestIfNeeded: true });
    if (permissionStatus !== 'granted') {
      return { ok: false as const, reason: 'permission_denied' };
    }

    await ensureAndroidNotificationChannel();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: formatNotificationCopyDateText(title),
        body: formatNotificationCopyDateText(body),
        sound: true,
        data: {
          source: 'local_test',
          sentAt: new Date().toISOString(),
        },
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: ANDROID_VISIBLE_PUSH_CHANNEL_ID, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 }
          : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
    });

    return { ok: true as const };
  } catch (error) {
    console.log('Notifica locale di test non disponibile:', error);
    return { ok: false as const, reason: 'notification_unavailable' as const };
  }
};

export const scheduleLocalRuntimeNotification = async ({
  title,
  body,
  data = {},
  delaySeconds = 1,
  dedupeKey,
  badgeCount,
  presentImmediately = false,
  sticky = false,
  channelId,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  delaySeconds?: number;
  dedupeKey?: string;
  badgeCount?: number;
  presentImmediately?: boolean;
  sticky?: boolean;
  channelId?: string;
}) => {
  try {
    const permissionStatus = await ensureNotificationPermissions({ requestIfNeeded: true });
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

      const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
      const duplicates = scheduled.filter((item) => {
        const payload = item.content.data as Record<string, unknown> | undefined;
        return payload?.dedupeKey === dedupeKey;
      });

      await Promise.all(
        duplicates.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined))
      );
      runtimeLocalNotificationDedupeMap.set(dedupeKey, now);
    }

    const nextBadge =
      typeof badgeCount === 'number' && Number.isFinite(badgeCount)
        ? Math.max(0, Math.trunc(badgeCount))
        : null;
    const androidChannelId =
      channelId ??
      (data?._localForegroundMirror === true
        ? ANDROID_CLIENT_FOREGROUND_CHANNEL_ID
        : ANDROID_VISIBLE_PUSH_CHANNEL_ID);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: androidChannelId } : {}),
        priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.MAX : undefined,
        autoDismiss: Platform.OS === 'android' ? false : undefined,
        sticky: Platform.OS === 'android' ? sticky : undefined,
        ...(nextBadge !== null ? { badge: nextBadge } : {}),
        data: {
          ...data,
          dedupeKey: dedupeKey ?? null,
        },
      },
      trigger: presentImmediately
        ? null
        : Platform.OS === 'android'
          ? {
              channelId: androidChannelId,
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.max(1, delaySeconds),
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.max(1, delaySeconds),
            },
    });

    return { ok: true as const };
  } catch (error) {
    console.log('Notifica locale runtime non disponibile:', error);
    return { ok: false as const, reason: 'notification_unavailable' as const };
  }
};

export const playOwnerForegroundBannerSound = async ({
  dedupeKey,
}: {
  dedupeKey?: string;
} = {}) => {
  try {
    if (Platform.OS === 'web') {
      return { ok: false as const, reason: 'unsupported_platform' as const };
    }

    // Su iOS il suono appartiene alla push originale. Su Android anche banner,
    // tendina e suono sono ora proprieta della push remota di sistema. Una
    // notifica locale vuota produrrebbe solo un secondo suono.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return { ok: true as const, delegatedToIncomingPush: true as const };
    }

    const permissionStatus = await ensureNotificationPermissions({ requestIfNeeded: false });
    if (permissionStatus !== 'granted') {
      return { ok: false as const, reason: 'permission_denied' as const };
    }

    await ensureAndroidNotificationChannel();

    if (dedupeKey) {
      const now = Date.now();
      const lastSentAt = runtimeLocalNotificationDedupeMap.get(`banner-sound:${dedupeKey}`) ?? 0;
      if (now - lastSentAt < OWNER_BANNER_SOUND_DEDUPE_TTL_MS) {
        return { ok: true as const, deduped: true as const };
      }
      runtimeLocalNotificationDedupeMap.set(`banner-sound:${dedupeKey}`, now);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '',
        body: '',
        sound: true,
        data: {
          _pushAudience: 'auth',
          _pushTarget: 'owner',
          _playInAppBannerSound: true,
          dedupeKey: dedupeKey ?? null,
        },
      },
      trigger: null,
    });

    return { ok: true as const };
  } catch (error) {
    console.log('Suono banner owner non disponibile:', error);
    return { ok: false as const, reason: 'notification_unavailable' as const };
  }
};

const getExpoPushToken = async (options?: { requestPermissionsIfNeeded?: boolean }): Promise<string | null> => {
  if (!Device.isDevice) {
    if (Platform.OS === 'android') {
      logAndroidClientPush('getExpoPushToken skipped: not physical device');
    }
    return null;
  }

  if (isExpoGoRuntime()) {
    if (Platform.OS === 'android') {
      logAndroidClientPush('getExpoPushToken skipped: Expo Go unsupported');
    }
    throw new Error('expo_go_push_unsupported');
  }

  const finalStatus = await ensureNotificationPermissions({
    requestIfNeeded: options?.requestPermissionsIfNeeded,
  });
  if (Platform.OS === 'android') {
    logAndroidClientPush('permission_status', {
      permissionStatus: finalStatus,
      requestPermissionsIfNeeded: options?.requestPermissionsIfNeeded === true,
    });
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  await ensureAndroidNotificationChannel();

  const projectId = getProjectId();
  if (Platform.OS === 'android') {
    logAndroidClientPush('project_id', {
      projectId: projectId ?? null,
    });
  }
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (Platform.OS === 'android') {
    logAndroidClientPush('expo_push_token_generated', {
      token: token.data,
      platform: 'android',
      projectId,
    });
  }
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
  isRegistrationCurrent,
}: {
  workspaceId: string;
  ownerEmail: string;
  token: string;
  audience?: 'auto' | 'auth' | 'public';
  recipientKind?: 'owner' | 'client';
  customerEmail?: string;
  customerPhone?: string;
  isRegistrationCurrent?: () => boolean;
}) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  if (recipientKind === 'owner' && audience !== 'auth') {
    audience = 'auth';
  }

  const resolvedRpcName = await resolveRpcName({
    authName: 'upsert_push_device',
    publicName: 'upsert_public_push_device',
    audience,
  });
  const rpcName =
    recipientKind === 'owner' && resolvedRpcName === 'upsert_push_device'
      ? 'claim_owner_push_device_v2'
      : resolvedRpcName;

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

  if (isRegistrationCurrent && !isRegistrationCurrent()) {
    return false;
  }
  const { error } = await supabase.rpc(rpcName, rpcPayload);
  if (Platform.OS === 'android' && recipientKind === 'client') {
    logAndroidClientPush('token_db_upsert_result', {
      workspaceId,
      ownerEmail,
      rpcName,
      recipientKind,
      audience,
      platform: 'android',
      token,
      customerEmail: normalizePushEmail(customerEmail) || null,
      customerPhone: normalizePushPhone(customerPhone) || null,
      saved: !error,
      error: error
        ? {
            code: error.code ?? null,
            message: error.message ?? null,
            details: error.details ?? null,
            hint: error.hint ?? null,
          }
        : null,
    });
  }

  if (
    error &&
    !(
      String(error.code ?? '').trim().toLowerCase() === 'pgrst002' ||
      String(error.message ?? '').toLowerCase().includes('schema cache')
    )
  ) {
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
  requestPermissionsIfNeeded = false,
  isRegistrationCurrent,
}: RegisterPushParams): Promise<RegisterPushResult> => {
  const runtimeRevision = pushRegistrationRuntimeRevision;
  const clientIdentityKey = buildPushRegistrationClientIdentityKey({
    workspaceId,
    ownerEmail,
    customerEmail,
    customerPhone,
  });
  const registrationIsCurrent = () =>
    (Platform.OS === 'web' ||
      (runtimeRevision === pushRegistrationRuntimeRevision &&
        pushRegistrationRuntimeScope.recipientKind === recipientKind &&
        (recipientKind !== 'client' ||
          (!!pushRegistrationRuntimeScope.clientIdentityKey &&
            pushRegistrationRuntimeScope.clientIdentityKey === clientIdentityKey)))) &&
    (!isRegistrationCurrent || isRegistrationCurrent());
  const supersededResult = (): RegisterPushResult => ({
    token: null,
    backendSynced: false,
    reason: 'registration_superseded',
  });
  if (!registrationIsCurrent()) {
    return supersededResult();
  }
  const scopedStorageKey = buildPushTokenStorageKey({
    workspaceId,
    ownerEmail,
    recipientKind,
    customerEmail,
    customerPhone,
  });
  const [storedScopedToken, storedLegacyToken] = await Promise.all([
    AsyncStorage.getItem(scopedStorageKey).catch(() => null),
    AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY).catch(() => null),
  ]);
  if (!registrationIsCurrent()) {
    return supersededResult();
  }
  const storedToken = storedScopedToken || storedLegacyToken;
  if (Platform.OS === 'android' && recipientKind === 'client') {
    logAndroidClientPush('registration_start', {
      workspaceId,
      ownerEmail,
      audience,
      recipientKind,
      platform: 'android',
      customerEmail: normalizePushEmail(customerEmail) || null,
      customerPhone: normalizePushPhone(customerPhone) || null,
      storedScopedTokenPresent: !!storedScopedToken,
      storedLegacyTokenPresent: !!storedLegacyToken,
      requestPermissionsIfNeeded,
    });
  }
  const diagnosticsBase = {
    isDevice: Device.isDevice,
    isExpoGo: isExpoGoRuntime(),
    projectIdPresent: !!getProjectId(),
    permissionStatus: null as string | null,
    usedStoredTokenFallback: false,
    storedTokenPresent: !!storedToken,
  };

  try {
    diagnosticsBase.permissionStatus = await getNotificationPermissionStatus().catch(() => null);
    if (!registrationIsCurrent()) {
      return supersededResult();
    }

    const token = await getExpoPushToken({ requestPermissionsIfNeeded }).catch((error) => {
      console.log('Push token refresh fallback:', error);
      diagnosticsBase.usedStoredTokenFallback = !!storedToken;
      return storedToken;
    });

    if (!registrationIsCurrent()) {
      return supersededResult();
    }
    if (!token) {
      return {
        token: null,
        backendSynced: false,
        reason: storedToken ? 'backend_sync_fallback_failed' : 'permission_or_project_id_missing',
        diagnostics: diagnosticsBase,
      };
    }

    if (token !== storedToken) {
      await AsyncStorage.multiSet([
        [scopedStorageKey, token],
        [PUSH_TOKEN_STORAGE_KEY, token],
      ]);
    }

    // A registration already sent for the previous runtime must finish before
    // a new owner/client claim, so network response order cannot restore it last.
    const backendRegistration = pushRegistrationBackendQueue.then(async () => {
      if (!registrationIsCurrent()) {
        return false;
      }
      return upsertPushTokenBackend({
        workspaceId,
        ownerEmail,
        token,
        audience,
        recipientKind,
        customerEmail,
        customerPhone,
        isRegistrationCurrent: registrationIsCurrent,
      });
    });
    pushRegistrationBackendQueue = backendRegistration.catch(() => false);
    const backendSynced = await backendRegistration;
    if (!registrationIsCurrent()) {
      return supersededResult();
    }

    if (Platform.OS === 'android' && recipientKind === 'client') {
      logAndroidClientPush('registration_result', {
        workspaceId,
        ownerEmail,
        audience,
        recipientKind,
        platform: 'android',
        customerEmail: normalizePushEmail(customerEmail) || null,
        customerPhone: normalizePushPhone(customerPhone) || null,
        token,
        backendSynced,
        diagnostics: diagnosticsBase,
      });
    }

    return { token, backendSynced, diagnostics: diagnosticsBase };
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim() ? error.message.trim() : 'register_failed';

    if (Platform.OS === 'android' && recipientKind === 'client') {
      logAndroidClientPush('registration_error', {
        workspaceId,
        ownerEmail,
        audience,
        recipientKind,
        platform: 'android',
        customerEmail: normalizePushEmail(customerEmail) || null,
        customerPhone: normalizePushPhone(customerPhone) || null,
        reason,
        diagnostics: diagnosticsBase,
      });
    }

    return {
      token: null,
      backendSynced: false,
      reason,
      diagnostics: diagnosticsBase,
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
  requireTargetedClient = false,
}: QueuePushParams) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  const explicitDedupeKey = normalizePushText(payload?._dedupeKey ?? '');
  const dedupeKey =
    explicitDedupeKey ||
    buildQueuedPushDedupeKey({
      workspaceId,
      eventType,
      audience,
      customerEmail,
      customerPhone,
      payload,
    });
  const now = Date.now();
  const lastQueuedAt = runtimeQueuedPushDedupeMap.get(dedupeKey) ?? 0;
  if (now - lastQueuedAt < 15000) {
    return true;
  }

  runtimeQueuedPushDedupeMap.forEach((timestamp, key) => {
    if (now - timestamp >= 60000) {
      runtimeQueuedPushDedupeMap.delete(key);
    }
  });

  runtimeQueuedPushDedupeMap.set(dedupeKey, now);

  const normalizedCustomerEmail = normalizePushEmail(customerEmail);
  const normalizedCustomerPhone = normalizePushPhone(customerPhone);
  const hasTargetedClient =
    audience !== 'auth' && (!!normalizedCustomerEmail || !!normalizedCustomerPhone);
  if (requireTargetedClient && !hasTargetedClient) {
    console.log('Push cliente non accodata: identita cliente mancante.', {
      workspaceId,
      eventType,
      audience,
    });
    return false;
  }
  const hasAuthSession = await hasAuthenticatedSession();
  const enrichedPayload: Record<string, unknown> = {
    ...payload,
    ...(normalizedCustomerEmail ? { customerEmail: normalizedCustomerEmail } : {}),
    ...(normalizedCustomerPhone ? { customerPhone: normalizedCustomerPhone } : {}),
    _pushAudience: audience,
    _pushTarget:
      audience === 'auth'
        ? 'owner'
        : hasTargetedClient
          ? 'client'
          : audience === 'all'
            ? 'all'
            : 'workspace',
    _pushEventType: eventType,
    _pushWorkspaceId: workspaceId,
    _dedupeKey: dedupeKey,
  };
  const pushTitle = formatNotificationCopyDateText(title);
  const pushBody = formatNotificationCopyDateText(body);

  if (audience === 'auth' && !hasAuthSession) {
    console.log('Push owner auth richiesta senza sessione auth locale: provo comunque ad accodarla sul workspace.', {
      workspaceId,
      eventType,
    });
  }

  const ownerRpcName =
    audience === 'auth' && !hasAuthSession
      ? 'queue_public_owner_push'
      : 'queue_workspace_push';

  const rpcCalls =
    audience === 'all'
      ? [
          supabase.rpc(ownerRpcName, {
            p_workspace_id: workspaceId,
            p_event_type: eventType,
            p_title: pushTitle,
            p_body: pushBody,
            p_payload: enrichedPayload,
          }),
          supabase.rpc(
            hasTargetedClient ? 'queue_public_customer_push' : 'queue_public_workspace_push',
            {
              p_workspace_id: workspaceId,
              p_event_type: eventType,
              p_title: pushTitle,
              p_body: pushBody,
              p_payload: enrichedPayload,
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
              p_title: pushTitle,
              p_body: pushBody,
              p_payload: enrichedPayload,
              p_customer_email: normalizedCustomerEmail || null,
              p_customer_phone: normalizedCustomerPhone || null,
            }),
          ]
        : [
            supabase.rpc(
              audience === 'auth'
                ? ownerRpcName
                : await resolveRpcName({
                    authName: 'queue_workspace_push',
                    publicName: 'queue_public_workspace_push',
                    audience,
                  }),
              {
                p_workspace_id: workspaceId,
                p_event_type: eventType,
                p_title: pushTitle,
                p_body: pushBody,
                p_payload: enrichedPayload,
              }
            ),
          ];

  const results = await Promise.all(rpcCalls);

  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    console.log('Errore accodamento push notification:', failedResult.error);
    return false;
  }

  const queuedCount = results.reduce((count, result) => count + Number(result.data ?? 0), 0);
  if (queuedCount <= 0) {
    console.log('Push notification non accodata: nessun device destinatario attivo.', {
      workspaceId,
      eventType,
      audience,
      hasTargetedClient,
      normalizedCustomerEmail,
      normalizedCustomerPhone,
      hasAuthSession,
    });
    return false;
  }

  await flushQueuedPushNotifications().catch((error) => {
    console.log('Flush push notification non riuscito:', error);
  });
  return true;
};
