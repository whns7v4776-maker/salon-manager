import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'expo-router';
import { AppState, Platform, Vibration } from 'react-native';
import { useUnreadBadges } from './UnreadBadgeContext';
import {
  registerPushNotifications,
  isClientPushRegistrationRuntimeRoute,
  setClientForegroundPushPresentationMode,
  setPushRegistrationRuntimeScope,
} from '../lib/push/push-notifications';
import { syncApplicationBadgeCountFromPushData } from '../lib/notification-badge-sync';
import {
  markClientBookingNotificationAsRead,
  type BadgeSnapshot,
  type ClientBadgeIdentity,
} from '../lib/badges/unread-badges';
import { fetchClientPortalSnapshot } from '../lib/client-portal';

const CUSTOM_BAR_TTL_MS = 10000;
const DEDUPE_TTL_MS = 60 * 60 * 1000;
const FOREGROUND_CUSTOM_BAR_AUTHORITY_ATTEMPTS = 3;
const FOREGROUND_CUSTOM_BAR_AUTHORITY_RETRY_MS = 220;
const LAST_CLIENT_PUSH_IDENTITY_KEY = '@salonpro:last-client-push-identity:v1';
const LEGACY_CLIENT_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const LEGACY_CLIENT_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const LEGACY_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';

type ClientNotificationSection = 'prenotazioni' | 'waitlist' | 'communications';

export type ClientNotificationNavigationTarget = {
  section: ClientNotificationSection;
  communicationId?: string | null;
  requestId?: string | null;
  appointmentGroupId?: string | null;
  status?: string | null;
  cancellationSource?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  serviceName?: string | null;
  updatedAt?: string | null;
  eventAt?: string | null;
};

export type ClientNotificationIdentity = {
  workspaceId: string;
  ownerEmail: string;
  salonCode?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  isRegistered: boolean;
};

export type ClientVisibleCustomBarNotification = {
  id: string;
  eventId: string;
  type?: string;
  section: ClientNotificationSection;
  title: string;
  body: string;
  createdAt: number;
  communicationId?: string | null;
  requestId?: string | null;
  appointmentGroupId?: string | null;
  status?: string | null;
  cancellationSource?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  serviceName?: string | null;
  updatedAt?: string | null;
  eventAt?: string | null;
};

type ClientNotificationsContextValue = {
  setClientIdentity: (identity: ClientNotificationIdentity | null) => void;
  setNotificationTapHandler: (
    handler: ((target: ClientNotificationNavigationTarget) => void) | null
  ) => void;
  setNotificationForegroundHandler: (handler: (() => void) | null) => void;
  refreshClientUnreadFromDB: (options?: {
    reconcileOptimisticClientBookingUnread?: boolean;
  }) => Promise<BadgeSnapshot>;
  optimisticallyDecrementClientBookingUnread: (
    logicalCount: number,
    logicalEventKeys: readonly string[]
  ) => Promise<BadgeSnapshot>;
  syncClientBadgeFromDB: () => Promise<void>;
  enqueueForegroundCustomBar: (notification: ClientVisibleCustomBarNotification) => void;
  dismissCustomBarNotification: (notificationId: string) => void;
  clearCustomBarNotifications: (section?: ClientNotificationSection) => void;
  markClientNotificationAsRead: (notificationId?: string) => Promise<void>;
  hasPresented: (eventId?: string | null) => boolean;
  visibleCustomBarNotifications: ClientVisibleCustomBarNotification[];
  bookingUnreadCount: number;
  waitlistUnreadCount: number;
  communicationUnreadCount: number;
  totalUnread: number;
};

const ClientNotificationsContext = createContext<ClientNotificationsContextValue | null>(null);

const normalizeText = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizePhone = (value?: string | null) => String(value ?? '').replace(/\D+/g, '');

const getNotificationDataText = (
  data: Record<string, unknown>,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = String(data[key] ?? '').trim();
    if (value) {
      return value;
    }
  }
  return null;
};

const getNotificationData = (
  notification: Notifications.Notification | null | undefined
): Record<string, unknown> =>
  ((notification?.request.content.data as Record<string, unknown> | undefined) ?? {});

const isClientNotificationPayload = (data: Record<string, unknown>) => {
  const target = normalizeText(data._pushTarget);
  const audience = normalizeText(data._pushAudience);
  const recipientRole = normalizeText(data.recipientRole ?? data.recipient_role);
  const type = normalizeText(
    data.event_type ?? data.eventType ?? data.notificationType ?? data._pushEventType ?? data.type
  );
  const isWaitlistEvent =
    type.includes('waitlist') ||
    type.includes('slot_waitlist') ||
    type.includes('slot_available') ||
    normalizeText(data.source).includes('waitlist') ||
    normalizeText(data.waitlistEntryId ?? data.waitlist_entry_id).length > 0;
  const status = normalizeText(data.statusCode ?? data.status ?? data.requestStatus);
  const hasClientIdentity =
    normalizeText(data.customerEmail).length > 0 ||
    normalizePhone(String(data.customerPhone ?? '')).length > 0 ||
    normalizeText(data.clientId ?? data.client_id).length > 0;

  if (target === 'owner' || audience === 'auth' || recipientRole === 'owner') {
    return false;
  }

  if (target === 'client' || recipientRole === 'cliente' || recipientRole === 'client') {
    return true;
  }

  if (audience === 'public' && hasClientIdentity) {
    return true;
  }

  if (isWaitlistEvent && target !== 'owner' && audience !== 'auth') {
    return true;
  }

  return (
    hasClientIdentity &&
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
      'auto_accepted',
      'rejected',
      'declined',
    ].includes(type)
  ) || ['cancelled', 'accepted', 'auto_accepted', 'rejected', 'declined'].includes(status);
};

const resolveSection = (data: Record<string, unknown>): ClientNotificationSection => {
  const type = normalizeText(
    data.event_type ?? data.eventType ?? data.notificationType ?? data._pushEventType ?? data.type
  );
  const source = normalizeText(data.source);
  if (
    type === 'customer_communication' ||
    normalizeText(data.communicationId ?? data.communication_id).length > 0
  ) {
    return 'communications';
  }
  return type.includes('waitlist') || type.includes('slot') || source.includes('waitlist')
    ? 'waitlist'
    : 'prenotazioni';
};

const buildStableNotificationId = (
  notification: Notifications.Notification | null | undefined,
  data: Record<string, unknown>
) => {
  const appointmentId = normalizeText(data.appointmentId ?? data.appointment_id);
  const requestId = normalizeText(
    data.bookingRequestId ?? data.booking_request_id ?? data.requestId ?? data.request_id
  );
  const type = normalizeText(
    data.event_type ?? data.eventType ?? data.notificationType ?? data._pushEventType ?? data.type
  );
  const status = normalizeText(data.statusCode ?? data.status ?? data.requestStatus);
  const eventStamp = normalizeText(
    data.notificationCreatedAt ??
      data.notification_created_at ??
      data.eventAt ??
      data.event_at ??
      data.updatedAt ??
      data.updated_at ??
      data.createdAt ??
      data.created_at
  );
  const explicitId = String(
    data.notificationId ??
      data.notification_id ??
      data.eventId ??
      data.event_id ??
      data.communicationId ??
      data.communication_id ??
      data._dedupeKey ??
      data.dedupeKey ??
      ''
  ).trim();
  if (explicitId) {
    return Array.from(
      new Set(
        [
          normalizeText(explicitId),
          appointmentId || requestId,
          type,
          status,
          eventStamp,
        ].filter(Boolean)
      )
    ).join('|');
  }

  return [
    appointmentId,
    requestId,
    type,
    status,
    notification?.request.content.title ?? '',
    notification?.request.content.body ?? '',
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join('|') || String(notification?.request.identifier ?? Date.now());
};

const normalizeNotification = (
  notification: Notifications.Notification | null | undefined
): ClientVisibleCustomBarNotification | null => {
  if (!notification) {
    return null;
  }

  const data = getNotificationData(notification);
  if (!isClientNotificationPayload(data)) {
    return null;
  }

  const type = normalizeText(
    data.event_type ?? data.eventType ?? data.notificationType ?? data._pushEventType ?? data.type
  );
  const id = buildStableNotificationId(notification, data);
  const title = String(notification.request.content.title ?? '').trim() || 'Aggiornamento prenotazione';
  const body = String(notification.request.content.body ?? '').trim();
  const communicationId = String(
    data.communicationId ?? data.communication_id ?? ''
  ).trim();
  const requestId = getNotificationDataText(
    data,
    'bookingRequestId',
    'booking_request_id',
    'requestId',
    'request_id'
  );
  const appointmentGroupId = getNotificationDataText(
    data,
    'appointmentGroupId',
    'appointment_group_id'
  );
  const status = getNotificationDataText(data, 'statusCode', 'status', 'requestStatus');
  const cancellationSource = getNotificationDataText(
    data,
    'cancellationSource',
    'cancellation_source'
  );
  const appointmentDate = getNotificationDataText(
    data,
    'appointmentDate',
    'appointment_date'
  );
  const appointmentTime = getNotificationDataText(
    data,
    'appointmentTime',
    'appointment_time'
  );
  const serviceName = getNotificationDataText(
    data,
    'requestedServiceName',
    'requested_service_name',
    'serviceName',
    'service_name'
  );
  const updatedAt = getNotificationDataText(
    data,
    'requestUpdatedAt',
    'request_updated_at',
    'eventVersion',
    'event_version',
    'updatedAt',
    'updated_at'
  );
  const eventAt = getNotificationDataText(
    data,
    'eventAt',
    'event_at',
    'notificationCreatedAt',
    'notification_created_at',
    'createdAt',
    'created_at'
  );
  return {
    id,
    eventId: id,
    type,
    section: resolveSection(data),
    title,
    body,
    createdAt: Date.now(),
    communicationId: communicationId || null,
    requestId,
    appointmentGroupId,
    status: status ? normalizeText(status) : null,
    cancellationSource: cancellationSource ? normalizeText(cancellationSource) : null,
    appointmentDate,
    appointmentTime,
    serviceName,
    updatedAt,
    eventAt,
  };
};

type AndroidClientMirrorNotification = {
  id?: string | null;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
};

type PendingClientNotificationTap = {
  notification: Notifications.Notification;
  clearLastResponseAfterDispatch: boolean;
};

const buildExpoNotificationFromAndroidClientMirror = (
  notification: AndroidClientMirrorNotification
): Notifications.Notification => {
  const data = notification.data ?? {};
  const identifier = String(
    notification.id ??
      data.notificationId ??
      data.notification_id ??
      data.eventId ??
      data.event_id ??
      data.dedupeKey ??
      data._dedupeKey ??
      'client-foreground-notifee'
  ).trim();

  return {
    date: Date.now(),
    request: {
      identifier: identifier || 'client-foreground-notifee',
      content: {
        title: notification.title ?? null,
        subtitle: null,
        body: notification.body ?? null,
        data,
        categoryIdentifier: null,
        sound: null,
      },
      trigger: { type: 'unknown' },
    },
  };
};

const buildIdentityKey = (identity: ClientNotificationIdentity | null) => {
  if (!identity?.isRegistered || !identity.workspaceId.trim()) {
    return '';
  }

  return [
    identity.workspaceId.trim().toLowerCase(),
    normalizeText(identity.salonCode),
    normalizeText(identity.customerEmail),
    normalizePhone(identity.customerPhone),
  ].join('|');
};

const normalizePushIdentity = (value: unknown): ClientNotificationIdentity | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ClientNotificationIdentity>;
  const workspaceId = String(candidate.workspaceId ?? '').trim();
  const ownerEmail = String(candidate.ownerEmail ?? '').trim().toLowerCase();
  const salonCode = String(candidate.salonCode ?? '').trim().toLowerCase() || null;
  const customerEmail = String(candidate.customerEmail ?? '').trim().toLowerCase() || null;
  const customerPhone = String(candidate.customerPhone ?? '').trim() || null;

  if (
    candidate.isRegistered !== true ||
    !workspaceId ||
    !ownerEmail ||
    (!customerEmail && !normalizePhone(customerPhone))
  ) {
    return null;
  }

  return {
    workspaceId,
    ownerEmail,
    salonCode,
    customerEmail,
    customerPhone,
    isRegistered: true,
  };
};

const restoreLegacyClientPushIdentity = async (): Promise<ClientNotificationIdentity | null> => {
  const salonCode = normalizeText(await AsyncStorage.getItem(LEGACY_LAST_SALON_CODE_KEY));
  if (!salonCode) {
    return null;
  }

  const [scopedProfileValue, scopedBiometricValue, profileValue, biometricValue] =
    await AsyncStorage.multiGet([
      `${LEGACY_CLIENT_PROFILE_KEY}:${salonCode}`,
      `${LEGACY_CLIENT_BIOMETRIC_PROFILE_KEY}:${salonCode}`,
      LEGACY_CLIENT_PROFILE_KEY,
      LEGACY_CLIENT_BIOMETRIC_PROFILE_KEY,
    ]);
  const storedProfile = [
    scopedProfileValue[1],
    scopedBiometricValue[1],
    profileValue[1],
    biometricValue[1],
  ]
    .filter(Boolean)
    .map((value) => {
      try {
        return JSON.parse(String(value)) as { email?: string; telefono?: string };
      } catch {
        return null;
      }
    })
    .find((value) => value?.email?.trim() || normalizePhone(value?.telefono));

  if (!storedProfile) {
    return null;
  }

  const snapshot = await fetchClientPortalSnapshot(salonCode).catch(() => null);
  return normalizePushIdentity({
    workspaceId: snapshot?.workspace?.id,
    ownerEmail: snapshot?.workspace?.ownerEmail,
    salonCode: snapshot?.workspace?.salonCode || salonCode,
    customerEmail: storedProfile.email,
    customerPhone: storedProfile.telefono,
    isRegistered: true,
  });
};

export function ClientNotificationsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // /cliente/:id is an owner customer detail. Only the public client runtime
  // may refresh a saved client identity and claim this device's push token.
  const isClientPushRuntimeRoute = isClientPushRegistrationRuntimeRoute(pathname);
  const isClientNotificationRuntimeActive =
    Platform.OS === 'web' || isClientPushRuntimeRoute;
  const clientPushRuntimeAllowedRef = useRef(isClientPushRuntimeRoute);
  clientPushRuntimeAllowedRef.current = isClientPushRuntimeRoute;
  const {
    unreadCountsBySection,
    totalUnread,
    refreshBadges,
    optimisticallyDecrementClientBookingUnread,
    markSectionAsRead,
    syncAppIconBadge,
    setBadgeIdentityOverride,
  } = useUnreadBadges();
  const [identity, setIdentityState] = useState<ClientNotificationIdentity | null>(null);
  const [persistedPushIdentity, setPersistedPushIdentity] =
    useState<ClientNotificationIdentity | null>(null);
  const [pushIdentityHydrated, setPushIdentityHydrated] = useState(Platform.OS === 'web');
  const [visibleCustomBarNotifications, setVisibleCustomBarNotifications] = useState<
    ClientVisibleCustomBarNotification[]
  >([]);
  const [isTapHandlerReady, setIsTapHandlerReady] = useState(false);
  const identityRef = useRef<ClientNotificationIdentity | null>(null);
  const pushIdentityRef = useRef<ClientNotificationIdentity | null>(null);
  const lastActivePushIdentityRef = useRef<ClientNotificationIdentity | null>(null);
  const tapHandlerRef = useRef<
    ((target: ClientNotificationNavigationTarget) => void) | null
  >(null);
  const foregroundHandlerRef = useRef<(() => void) | null>(null);
  const presentedRef = useRef<Map<string, number>>(new Map());
  const handledTapRef = useRef<Map<string, number>>(new Map());
  const pendingNotificationTapsRef = useRef<Map<string, PendingClientNotificationTap>>(
    new Map()
  );
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pushIdentity = normalizePushIdentity(identity) ?? persistedPushIdentity;
  const pushIdentityKey = buildIdentityKey(pushIdentity);
  identityRef.current = isClientNotificationRuntimeActive ? identity : null;
  pushIdentityRef.current = pushIdentity;
  const pushWorkspaceId = pushIdentity?.workspaceId ?? '';
  const pushOwnerEmail = pushIdentity?.ownerEmail ?? '';
  const pushCustomerEmail = pushIdentity?.customerEmail ?? null;
  const pushCustomerPhone = pushIdentity?.customerPhone ?? null;

  useLayoutEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    setPushRegistrationRuntimeScope({
      recipientKind: isClientPushRuntimeRoute ? 'client' : 'owner',
      clientIdentity: pushWorkspaceId && pushOwnerEmail
        ? {
            workspaceId: pushWorkspaceId,
            ownerEmail: pushOwnerEmail,
            customerEmail: pushCustomerEmail,
            customerPhone: pushCustomerPhone,
          }
        : null,
    });
  }, [
    isClientPushRuntimeRoute,
    pushWorkspaceId,
    pushOwnerEmail,
    pushCustomerEmail,
    pushCustomerPhone,
  ]);
  useLayoutEffect(
    () => () => {
      if (Platform.OS !== 'web') {
        setPushRegistrationRuntimeScope({ recipientKind: null });
      }
    },
    []
  );

  const bookingUnreadCount = Math.max(
    0,
    Math.trunc(Number(unreadCountsBySection.prenotazioni ?? 0) || 0)
  );
  const waitlistUnreadCount = Math.max(
    0,
    Math.trunc(Number(unreadCountsBySection.waitlist ?? 0) || 0)
  );
  const communicationUnreadCount = Math.max(
    0,
    Math.trunc(Number(unreadCountsBySection.communications ?? 0) || 0)
  );
  const normalizedTotalUnread = Math.max(0, Math.trunc(Number(totalUnread) || 0));

  useEffect(() => {
    setClientForegroundPushPresentationMode(
      isClientNotificationRuntimeActive && identity?.isRegistered ? 'client_runtime' : 'system'
    );
  }, [identity?.isRegistered, isClientNotificationRuntimeActive]);

  useEffect(
    () => () => {
      setClientForegroundPushPresentationMode('system');
    },
    []
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let cancelled = false;
    void AsyncStorage.getItem(LAST_CLIENT_PUSH_IDENTITY_KEY)
      .then(async (storedValue) => {
        if (cancelled || lastActivePushIdentityRef.current) {
          return;
        }
        let restoredIdentity: ClientNotificationIdentity | null = null;
        if (storedValue) {
          try {
            restoredIdentity = normalizePushIdentity(JSON.parse(storedValue));
          } catch {
            restoredIdentity = null;
          }
        }
        restoredIdentity ??= await restoreLegacyClientPushIdentity();
        if (restoredIdentity && !cancelled && !lastActivePushIdentityRef.current) {
          setPersistedPushIdentity(restoredIdentity);
          await AsyncStorage.setItem(
            LAST_CLIENT_PUSH_IDENTITY_KEY,
            JSON.stringify(restoredIdentity)
          ).catch(() => undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setPushIdentityHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logAndroid = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return;
    }
  }, []);

  const pruneDedupe = useCallback(() => {
    const now = Date.now();
    presentedRef.current.forEach((timestamp, key) => {
      if (now - timestamp > DEDUPE_TTL_MS) {
        presentedRef.current.delete(key);
      }
    });
  }, []);

  const hasPresented = useCallback(
    (eventId?: string | null) => {
      const key = String(eventId ?? '').trim();
      if (!key) {
        return false;
      }
      pruneDedupe();
      return presentedRef.current.has(key);
    },
    [pruneDedupe]
  );

  const markPresented = useCallback(
    (eventId: string) => {
      pruneDedupe();
      if (presentedRef.current.has(eventId)) {
        return false;
      }
      presentedRef.current.set(eventId, Date.now());
      return true;
    },
    [pruneDedupe]
  );

  const claimNotificationTap = useCallback((eventId: string) => {
    const now = Date.now();
    handledTapRef.current.forEach((timestamp, key) => {
      if (now - timestamp > DEDUPE_TTL_MS) {
        handledTapRef.current.delete(key);
      }
    });
    if (handledTapRef.current.has(eventId)) {
      return false;
    }
    handledTapRef.current.set(eventId, now);
    return true;
  }, []);

  const refreshClientUnreadFromDB = useCallback(async (options?: {
    reconcileOptimisticClientBookingUnread?: boolean;
  }) => {
    const snapshot = await refreshBadges({
      reconcileOptimisticClientBookingUnread:
        options?.reconcileOptimisticClientBookingUnread === true,
    });
    logAndroid('refresh_db_count', {
      totalUnread: snapshot.totalUnread,
      bookingUnread: snapshot.unreadCountsBySection.prenotazioni ?? 0,
      waitlistUnread: snapshot.unreadCountsBySection.waitlist ?? 0,
    });
    return snapshot;
  }, [logAndroid, refreshBadges]);

  const refreshClientUnreadFromDBAuthoritative = useCallback(async () => {
    const snapshot = await refreshBadges({ throwOnError: true });
    logAndroid('refresh_db_count_authoritative', {
      totalUnread: snapshot.totalUnread,
      bookingUnread: snapshot.unreadCountsBySection.prenotazioni ?? 0,
      waitlistUnread: snapshot.unreadCountsBySection.waitlist ?? 0,
    });
    return snapshot;
  }, [logAndroid, refreshBadges]);

  const syncClientBadgeFromDB = useCallback(async () => {
    await syncAppIconBadge();
    logAndroid('sync_badge_from_db', {
      totalUnread: normalizedTotalUnread,
    });
  }, [logAndroid, normalizedTotalUnread, syncAppIconBadge]);

  const dismissCustomBarNotification = useCallback((notificationId: string) => {
    const timer = timersRef.current.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(notificationId);
    }
    setVisibleCustomBarNotifications((current) =>
      current.filter((item) => item.id !== notificationId)
    );
  }, []);

  const enqueueForegroundCustomBar = useCallback(
    (notification: ClientVisibleCustomBarNotification) => {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 22, 36, 28]);
      } else if (Platform.OS === 'ios') {
        Vibration.vibrate(18);
      }

      setVisibleCustomBarNotifications((current) => {
        if (current.some((item) => item.id === notification.id)) {
          return current;
        }
        return [notification, ...current].slice(0, 4);
      });

      const currentTimer = timersRef.current.get(notification.id);
      if (currentTimer) {
        clearTimeout(currentTimer);
      }
      const nextTimer = setTimeout(() => {
        dismissCustomBarNotification(notification.id);
      }, CUSTOM_BAR_TTL_MS);
      timersRef.current.set(notification.id, nextTimer);
      logAndroid('enqueue_custom_bar', {
        notificationId: notification.id,
        eventId: notification.eventId,
        section: notification.section,
        title: notification.title,
      });
    },
    [dismissCustomBarNotification, logAndroid]
  );

  const enqueueForegroundCustomBarFromDBUnread = useCallback(
    async (notification: ClientVisibleCustomBarNotification) => {
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= FOREGROUND_CUSTOM_BAR_AUTHORITY_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, FOREGROUND_CUSTOM_BAR_AUTHORITY_RETRY_MS * (attempt - 1));
          });
        }

        try {
          const snapshot = await refreshClientUnreadFromDBAuthoritative();
          const sectionUnread = Math.max(
            0,
            Math.trunc(Number(snapshot.unreadCountsBySection[notification.section] ?? 0) || 0)
          );
          const shouldEnqueue = sectionUnread > 0;

          logAndroid('custom_bar_db_gate', {
            notificationId: notification.id,
            eventId: notification.eventId,
            section: notification.section,
            sectionUnread,
            totalUnread: snapshot.totalUnread,
            attempt,
            enqueue: shouldEnqueue,
          });
          if (shouldEnqueue) {
            enqueueForegroundCustomBar(notification);
            return;
          }
          lastError = null;
        } catch (error) {
          lastError = error;
        }
      }

      logAndroid('custom_bar_db_gate_failed_closed', {
        notificationId: notification.id,
        eventId: notification.eventId,
        section: notification.section,
        attempts: FOREGROUND_CUSTOM_BAR_AUTHORITY_ATTEMPTS,
        enqueue: false,
        reason: lastError ? 'authority_unavailable' : 'section_already_read',
        message: lastError instanceof Error ? lastError.message : String(lastError ?? ''),
      });
    },
    [
      enqueueForegroundCustomBar,
      logAndroid,
      refreshClientUnreadFromDBAuthoritative,
    ]
  );

  const clearCustomBarNotifications = useCallback((section?: ClientNotificationSection) => {
    if (!section) {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      setVisibleCustomBarNotifications([]);
      logAndroid('clear_custom_bar', { section: 'all' });
      return;
    }

    setVisibleCustomBarNotifications((current) =>
      current.filter((notification) => {
        if (notification.section !== section) {
          return true;
        }
        const timer = timersRef.current.get(notification.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(notification.id);
        }
        return false;
      })
    );
    logAndroid('clear_custom_bar', { section });
  }, [logAndroid]);

  const markClientNotificationAsRead = useCallback(
    async (notificationId?: string) => {
      const visible = notificationId
        ? visibleCustomBarNotifications.find((item) => item.id === notificationId)
        : null;
      const section = visible?.section ?? 'prenotazioni';
      logAndroid('mark_as_read', { notificationId: notificationId ?? null, section });
      if (
        section === 'prenotazioni' &&
        identity?.isRegistered &&
        visible?.requestId
      ) {
        await markClientBookingNotificationAsRead(
          {
            audience: 'client',
            workspaceId: identity.workspaceId,
            salonCode: identity.salonCode ?? null,
            customerEmail: identity.customerEmail?.trim().toLowerCase() || null,
            customerPhone: identity.customerPhone?.trim() || null,
          },
          {
            requestId: visible.requestId,
            appointmentGroupId: visible.appointmentGroupId,
            expectedStatus: visible.status,
            expectedCancellationSource: visible.cancellationSource,
            expectedAppointmentDate: visible.appointmentDate,
            expectedAppointmentTime: visible.appointmentTime,
            expectedServiceName: visible.serviceName,
            expectedUpdatedAt: visible.updatedAt ?? visible.eventAt,
          }
        );
      } else if (section !== 'prenotazioni') {
        await markSectionAsRead(section);
      }
      if (notificationId) {
        dismissCustomBarNotification(notificationId);
      } else {
        clearCustomBarNotifications();
      }
      await refreshClientUnreadFromDB();
    },
    [
      clearCustomBarNotifications,
      dismissCustomBarNotification,
      identity,
      logAndroid,
      markSectionAsRead,
      refreshClientUnreadFromDB,
      visibleCustomBarNotifications,
    ]
  );

  const setClientIdentity = useCallback(
    (nextIdentity: ClientNotificationIdentity | null) => {
      setIdentityState(nextIdentity);
      const nextPushIdentity = normalizePushIdentity(nextIdentity);
      if (nextPushIdentity && Platform.OS !== 'web') {
        pushIdentityRef.current = nextPushIdentity;
        lastActivePushIdentityRef.current = nextPushIdentity;
        setPersistedPushIdentity(nextPushIdentity);
        void AsyncStorage.setItem(
          LAST_CLIENT_PUSH_IDENTITY_KEY,
          JSON.stringify(nextPushIdentity)
        ).catch(() => undefined);
      }
      logAndroid('set_identity', {
        hasIdentity: !!nextIdentity,
        workspaceId: nextIdentity?.workspaceId ?? null,
        salonCode: nextIdentity?.salonCode ?? null,
        hasCustomerEmail: !!nextIdentity?.customerEmail,
        hasCustomerPhone: !!nextIdentity?.customerPhone,
        isRegistered: nextIdentity?.isRegistered ?? false,
      });
    },
    [logAndroid]
  );

  const setNotificationTapHandler = useCallback(
    (handler: ((target: ClientNotificationNavigationTarget) => void) | null) => {
      tapHandlerRef.current = handler;
      setIsTapHandlerReady(handler !== null);
    },
    []
  );

  const setNotificationForegroundHandler = useCallback((handler: (() => void) | null) => {
    foregroundHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    if (
      !isClientNotificationRuntimeActive ||
      !identity?.isRegistered ||
      !identity.workspaceId.trim()
    ) {
      setBadgeIdentityOverride(null);
      clearCustomBarNotifications();
      return;
    }

    const badgeIdentity: ClientBadgeIdentity = {
      audience: 'client',
      workspaceId: identity.workspaceId,
      salonCode: identity.salonCode ?? null,
      customerEmail: identity.customerEmail?.trim().toLowerCase() || null,
      customerPhone: identity.customerPhone?.trim() || null,
    };

    setBadgeIdentityOverride(badgeIdentity);
    logAndroid('init_provider', {
      workspaceId: identity.workspaceId,
      salonCode: identity.salonCode ?? null,
      customerEmail: identity.customerEmail?.trim().toLowerCase() || null,
      customerPhone: normalizePhone(identity.customerPhone) || null,
    });

    return () => {
      setBadgeIdentityOverride(null);
    };
  }, [
    clearCustomBarNotifications,
    identity,
    isClientNotificationRuntimeActive,
    logAndroid,
    setBadgeIdentityOverride,
  ]);

  const registerClientToken = useCallback(async () => {
    const currentIdentity = pushIdentityRef.current;
    if (
      Platform.OS === 'web' ||
      !clientPushRuntimeAllowedRef.current ||
      !currentIdentity?.isRegistered
    ) {
      return;
    }

    if (!currentIdentity.workspaceId.trim() || !currentIdentity.ownerEmail.trim()) {
      logAndroid('token_registration_skipped', {
        reason: 'missing_workspace_or_owner',
      });
      return;
    }

    const result = await registerPushNotifications({
      workspaceId: currentIdentity.workspaceId,
      ownerEmail: currentIdentity.ownerEmail,
      audience: 'public',
      recipientKind: 'client',
      customerEmail: currentIdentity.customerEmail ?? undefined,
      customerPhone: currentIdentity.customerPhone ?? undefined,
      requestPermissionsIfNeeded: false,
      isRegistrationCurrent: () =>
        clientPushRuntimeAllowedRef.current &&
        buildIdentityKey(pushIdentityRef.current) === buildIdentityKey(currentIdentity) &&
        pushIdentityRef.current?.ownerEmail === currentIdentity.ownerEmail,
    }).catch((error) => {
      logAndroid('token_registration_error', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    logAndroid('token_registration_result', {
      token: result?.token ?? null,
      backendSynced: result?.backendSynced ?? false,
      reason: result?.reason ?? null,
      diagnostics: result?.diagnostics ?? null,
    });
  }, [logAndroid]);

  useEffect(() => {
    if (
      (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
      !isClientPushRuntimeRoute ||
      !pushIdentityHydrated ||
      !pushIdentityKey
    ) {
      return;
    }

    void registerClientToken();
    if (identityRef.current) {
      void refreshClientUnreadFromDB();
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        logAndroid('app_active_refresh');
        void registerClientToken();
        if (identityRef.current) {
          void refreshClientUnreadFromDB();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    logAndroid,
    isClientPushRuntimeRoute,
    pushIdentityHydrated,
    pushIdentityKey,
    refreshClientUnreadFromDB,
    registerClientToken,
  ]);

  const handleNotificationTap = useCallback(
    (
      notification: Notifications.Notification | null | undefined,
      options?: { clearLastResponseAfterDispatch?: boolean }
    ) => {
      if (!notification) {
        return;
      }
      const normalized = normalizeNotification(notification);
      if (!normalized) {
        return;
      }
      const clearLastResponseAfterDispatch =
        options?.clearLastResponseAfterDispatch === true;
      const currentIdentity = identityRef.current;
      const currentTapHandler = tapHandlerRef.current;
      if (!currentIdentity?.isRegistered || !currentTapHandler) {
        const previousPending = pendingNotificationTapsRef.current.get(normalized.eventId);
        pendingNotificationTapsRef.current.set(normalized.eventId, {
          notification,
          clearLastResponseAfterDispatch:
            clearLastResponseAfterDispatch ||
            previousPending?.clearLastResponseAfterDispatch === true,
        });
        while (pendingNotificationTapsRef.current.size > 8) {
          const oldestEventId = pendingNotificationTapsRef.current.keys().next().value;
          if (!oldestEventId) {
            break;
          }
          pendingNotificationTapsRef.current.delete(oldestEventId);
        }
        logAndroid('tap_or_response_queued_until_runtime_ready', {
          notificationId: normalized.id,
          eventId: normalized.eventId,
          section: normalized.section,
          hasLiveIdentity: !!currentIdentity?.isRegistered,
          hasTapHandler: !!currentTapHandler,
        });
        return;
      }
      if (!claimNotificationTap(normalized.eventId)) {
        logAndroid('tap_or_response_duplicate', {
          notificationId: normalized.id,
          eventId: normalized.eventId,
          section: normalized.section,
        });
        if (clearLastResponseAfterDispatch) {
          void Notifications.clearLastNotificationResponseAsync().catch((error) => {
            logAndroid('last_notification_response_clear_error', {
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }
        return;
      }
      const notificationData = getNotificationData(notification);

      markPresented(normalized.eventId);
      logAndroid('tap_or_response', {
        notificationId: normalized.id,
        eventId: normalized.eventId,
        section: normalized.section,
      });
      try {
        currentTapHandler({
          section: normalized.section,
          communicationId: normalized.communicationId ?? null,
          requestId: normalized.requestId ?? null,
          appointmentGroupId: normalized.appointmentGroupId ?? null,
          status: normalized.status ?? null,
          cancellationSource: normalized.cancellationSource ?? null,
          appointmentDate: normalized.appointmentDate ?? null,
          appointmentTime: normalized.appointmentTime ?? null,
          serviceName: normalized.serviceName ?? null,
          updatedAt: normalized.updatedAt ?? null,
          eventAt: normalized.eventAt ?? null,
        });
      } catch (error) {
        handledTapRef.current.delete(normalized.eventId);
        pendingNotificationTapsRef.current.set(normalized.eventId, {
          notification,
          clearLastResponseAfterDispatch,
        });
        logAndroid('tap_or_response_dispatch_error', {
          notificationId: normalized.id,
          eventId: normalized.eventId,
          section: normalized.section,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      void syncApplicationBadgeCountFromPushData(notificationData, {
        recipientRole: 'client',
        notificationId: normalized.id,
        eventId: normalized.eventId,
        appState: AppState.currentState,
      });
      if (currentIdentity && normalized.section === 'prenotazioni' && normalized.requestId) {
        const badgeIdentity: ClientBadgeIdentity = {
          audience: 'client',
          workspaceId: currentIdentity.workspaceId,
          salonCode: currentIdentity.salonCode ?? null,
          customerEmail: currentIdentity.customerEmail?.trim().toLowerCase() || null,
          customerPhone: currentIdentity.customerPhone?.trim() || null,
        };
        void markClientBookingNotificationAsRead(badgeIdentity, {
          requestId: normalized.requestId,
          appointmentGroupId: normalized.appointmentGroupId,
          expectedStatus: normalized.status,
          expectedCancellationSource: normalized.cancellationSource,
          expectedAppointmentDate: normalized.appointmentDate,
          expectedAppointmentTime: normalized.appointmentTime,
          expectedServiceName: normalized.serviceName,
          expectedUpdatedAt: normalized.updatedAt ?? normalized.eventAt,
        })
          .then(() => refreshClientUnreadFromDB())
          .catch(() => refreshClientUnreadFromDB());
      } else if (currentIdentity) {
        void refreshClientUnreadFromDB();
      }
      if (clearLastResponseAfterDispatch) {
        void Notifications.clearLastNotificationResponseAsync().catch((error) => {
          logAndroid('last_notification_response_clear_error', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    },
    [claimNotificationTap, logAndroid, markPresented, refreshClientUnreadFromDB]
  );

  useEffect(() => {
    if (
      (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
      !identity?.isRegistered ||
      !isTapHandlerReady ||
      pendingNotificationTapsRef.current.size === 0
    ) {
      return;
    }

    const pendingTaps = Array.from(pendingNotificationTapsRef.current.values());
    pendingNotificationTapsRef.current.clear();
    pendingTaps.forEach((pendingTap) => {
      handleNotificationTap(pendingTap.notification, {
        clearLastResponseAfterDispatch: pendingTap.clearLastResponseAfterDispatch,
      });
    });
  }, [handleNotificationTap, identity?.isRegistered, isTapHandlerReady]);

  useEffect(() => {
    if (
      (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
      !pushIdentityHydrated ||
      !pushIdentityKey
    ) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const notificationData = getNotificationData(notification);
      const isAndroidBadgeOnlyRefresh =
        Platform.OS === 'android' && notificationData._badgeOnly === true;
      if (isAndroidBadgeOnlyRefresh) {
        logAndroid('foreground_badge_only_synced', {
          notificationId: notificationData.notificationId ?? null,
          eventId: notificationData.eventId ?? null,
          unreadCount: notificationData.unreadCount ?? notificationData.unread_count ?? null,
        });
        void syncApplicationBadgeCountFromPushData(notificationData, {
          recipientRole: 'client',
          notificationId:
            String(notificationData.notificationId ?? notification.request.identifier ?? '') || null,
          eventId: String(notificationData.eventId ?? '') || null,
          appState: AppState.currentState,
        });
        return;
      }

      if (Platform.OS === 'android' && AppState.currentState !== 'active') {
        // A remote push received while Android is backgrounded or suspended is
        // already owned by the operating system. Never add a JS banner or a
        // second local notification for that same logical event.
        logAndroid('background_received_system_owned', {
          notificationId: notificationData.notificationId ?? null,
          eventId: notificationData.eventId ?? null,
          appState: AppState.currentState,
        });
        return;
      }

      if (!identityRef.current?.isRegistered) {
        // The persisted identity is intentionally kept only so the device can
        // still receive this customer's pushes after logout. Without an active
        // frontend session, the operating system is the sole presenter: do not
        // mirror the push, refresh/read its sections, or enqueue an in-app bar.
        logAndroid('foreground_received_system_only_logged_out');
        return;
      }

      const normalized = normalizeNotification(notification);
      if (!normalized) {
        return;
      }

      const isNew = markPresented(normalized.eventId);
      logAndroid('foreground_received', {
        platform: Platform.OS,
        notificationId: normalized.id,
        eventId: normalized.eventId,
        dedupe: !isNew,
        section: normalized.section,
        title: normalized.title,
        cardNotificationCreated: isNew,
      });

      void syncApplicationBadgeCountFromPushData(notificationData, {
        recipientRole: 'client',
        notificationId: normalized.id,
        eventId: normalized.eventId,
        appState: AppState.currentState,
      });
      if (isNew && Platform.OS !== 'android') {
        void enqueueForegroundCustomBarFromDBUnread(normalized);
      } else {
        if (identityRef.current) {
          void refreshClientUnreadFromDB();
        }
      }
      foregroundHandlerRef.current?.();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationTap(response.notification, {
        clearLastResponseAfterDispatch: true,
      });
    });

    let removeAndroidMirrorPressListener: (() => void) | null = null;
    let androidMirrorPressListenerCancelled = false;
    if (Platform.OS === 'android') {
      void import('@notifee/react-native')
        .then((notifeeModule) => {
          if (androidMirrorPressListenerCancelled) {
            return;
          }
          const notifee = notifeeModule.default;
          const { EventType } = notifeeModule;
          removeAndroidMirrorPressListener = notifee.onForegroundEvent((event) => {
            if (event.type !== EventType.PRESS) {
              return;
            }
            const mirrorNotification = event.detail.notification;
            const mirrorData =
              (mirrorNotification?.data as Record<string, unknown> | undefined) ?? {};
            if (normalizeText(mirrorData.source) !== 'client_foreground_notifee') {
              return;
            }
            handleNotificationTap(
              buildExpoNotificationFromAndroidClientMirror({
                id: mirrorNotification?.id ?? null,
                title: mirrorNotification?.title ?? null,
                body: mirrorNotification?.body ?? null,
                data: mirrorData,
              })
            );
          });
        })
        .catch((error) => {
          logAndroid('notifee_client_press_listener_error', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          logAndroid('last_notification_response_found');
          handleNotificationTap(response.notification, {
            clearLastResponseAfterDispatch: true,
          });
        }
      })
      .catch((error) => {
        logAndroid('last_notification_response_error', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      androidMirrorPressListenerCancelled = true;
      removeAndroidMirrorPressListener?.();
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [
    enqueueForegroundCustomBarFromDBUnread,
    handleNotificationTap,
    logAndroid,
    markPresented,
    pushIdentityHydrated,
    pushIdentityKey,
    refreshClientUnreadFromDB,
  ]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    },
    []
  );

  const value = useMemo<ClientNotificationsContextValue>(
    () => ({
      setClientIdentity,
      setNotificationTapHandler,
      setNotificationForegroundHandler,
      refreshClientUnreadFromDB,
      optimisticallyDecrementClientBookingUnread,
      syncClientBadgeFromDB,
      enqueueForegroundCustomBar,
      dismissCustomBarNotification,
      clearCustomBarNotifications,
      markClientNotificationAsRead,
      hasPresented,
      visibleCustomBarNotifications,
      bookingUnreadCount,
      waitlistUnreadCount,
      communicationUnreadCount,
      totalUnread: normalizedTotalUnread,
    }),
    [
      bookingUnreadCount,
      communicationUnreadCount,
      clearCustomBarNotifications,
      dismissCustomBarNotification,
      enqueueForegroundCustomBar,
      hasPresented,
      markClientNotificationAsRead,
      normalizedTotalUnread,
      optimisticallyDecrementClientBookingUnread,
      refreshClientUnreadFromDB,
      setClientIdentity,
      setNotificationForegroundHandler,
      setNotificationTapHandler,
      syncClientBadgeFromDB,
      visibleCustomBarNotifications,
      waitlistUnreadCount,
    ]
  );

  return (
    <ClientNotificationsContext.Provider value={value}>
      {children}
    </ClientNotificationsContext.Provider>
  );
}

export function useClientNotifications() {
  const context = useContext(ClientNotificationsContext);
  if (!context) {
    throw new Error('useClientNotifications deve essere usato dentro ClientNotificationsProvider');
  }
  return context;
}
