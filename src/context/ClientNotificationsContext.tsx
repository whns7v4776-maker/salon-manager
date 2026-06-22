import * as Notifications from 'expo-notifications';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useUnreadBadges } from './UnreadBadgeContext';
import { registerPushNotifications } from '../lib/push/push-notifications';
import { syncApplicationBadgeCountFromPushData } from '../lib/notification-badge-sync';
import type { BadgeSnapshot, ClientBadgeIdentity } from '../lib/badges/unread-badges';

const CUSTOM_BAR_TTL_MS = 10000;
const DEDUPE_TTL_MS = 60 * 60 * 1000;

type ClientNotificationSection = 'prenotazioni' | 'waitlist';

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
};

type ClientNotificationsContextValue = {
  setClientIdentity: (identity: ClientNotificationIdentity | null) => void;
  setNotificationTapHandler: (handler: (() => void) | null) => void;
  setNotificationForegroundHandler: (handler: (() => void) | null) => void;
  refreshClientUnreadFromDB: () => Promise<BadgeSnapshot>;
  syncClientBadgeFromDB: () => Promise<void>;
  enqueueForegroundCustomBar: (notification: ClientVisibleCustomBarNotification) => void;
  dismissCustomBarNotification: (notificationId: string) => void;
  clearCustomBarNotifications: () => void;
  markClientNotificationAsRead: (notificationId?: string) => Promise<void>;
  hasPresented: (eventId?: string | null) => boolean;
  visibleCustomBarNotifications: ClientVisibleCustomBarNotification[];
  bookingUnreadCount: number;
  waitlistUnreadCount: number;
  totalUnread: number;
};

const ClientNotificationsContext = createContext<ClientNotificationsContextValue | null>(null);

const normalizeText = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizePhone = (value?: string | null) => String(value ?? '').replace(/\D+/g, '');

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

  return (
    hasClientIdentity &&
    [
      'frontend_client_status',
      'booking_request_status_changed',
      'appointment_cancelled',
      'appointment_cancelled_by_salon',
      'appointment_created',
      'appointment_created_by_salon',
      'appointment_accepted',
      'appointment_updated',
      'appointment_rescheduled',
      'appointment_rescheduled_by_salon',
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
  return {
    id,
    eventId: id,
    type,
    section: resolveSection(data),
    title,
    body,
    createdAt: Date.now(),
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

export function ClientNotificationsProvider({ children }: { children: ReactNode }) {
  const {
    unreadCountsBySection,
    totalUnread,
    refreshBadges,
    markSectionAsRead,
    syncAppIconBadge,
    setBadgeIdentityOverride,
  } = useUnreadBadges();
  const [identity, setIdentityState] = useState<ClientNotificationIdentity | null>(null);
  const [visibleCustomBarNotifications, setVisibleCustomBarNotifications] = useState<
    ClientVisibleCustomBarNotification[]
  >([]);
  const identityRef = useRef<ClientNotificationIdentity | null>(null);
  const tapHandlerRef = useRef<(() => void) | null>(null);
  const foregroundHandlerRef = useRef<(() => void) | null>(null);
  const presentedRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const identityKey = buildIdentityKey(identity);

  const bookingUnreadCount = Math.max(
    0,
    Math.trunc(Number(unreadCountsBySection.prenotazioni ?? 0) || 0)
  );
  const waitlistUnreadCount = Math.max(
    0,
    Math.trunc(Number(unreadCountsBySection.waitlist ?? 0) || 0)
  );
  const normalizedTotalUnread = Math.max(0, Math.trunc(Number(totalUnread) || 0));

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

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

  const refreshClientUnreadFromDB = useCallback(async () => {
    const snapshot = await refreshBadges();
    logAndroid('refresh_db_count', {
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
      const snapshot = await refreshClientUnreadFromDB();
      const sectionUnread = Math.max(
        0,
        Math.trunc(Number(snapshot.unreadCountsBySection[notification.section] ?? 0) || 0)
      );

      logAndroid('custom_bar_db_gate', {
        notificationId: notification.id,
        eventId: notification.eventId,
        section: notification.section,
        sectionUnread,
        totalUnread: snapshot.totalUnread,
        enqueue: sectionUnread > 0,
      });

      if (sectionUnread > 0) {
        enqueueForegroundCustomBar(notification);
      } else {
        dismissCustomBarNotification(notification.id);
      }
    },
    [
      dismissCustomBarNotification,
      enqueueForegroundCustomBar,
      logAndroid,
      refreshClientUnreadFromDB,
    ]
  );

  const clearCustomBarNotifications = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setVisibleCustomBarNotifications([]);
    logAndroid('clear_custom_bar');
  }, [logAndroid]);

  useEffect(() => {
    if (normalizedTotalUnread > 0 || visibleCustomBarNotifications.length === 0) {
      return;
    }

    clearCustomBarNotifications();
  }, [clearCustomBarNotifications, normalizedTotalUnread, visibleCustomBarNotifications.length]);

  useEffect(() => {
    if (visibleCustomBarNotifications.length === 0) {
      return;
    }

    setVisibleCustomBarNotifications((current) =>
      current.filter((notification) => {
        const sectionUnread =
          notification.section === 'waitlist' ? waitlistUnreadCount : bookingUnreadCount;
        const keep = sectionUnread > 0;
        if (!keep) {
          const timer = timersRef.current.get(notification.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(notification.id);
          }
        }
        return keep;
      })
    );
  }, [bookingUnreadCount, visibleCustomBarNotifications.length, waitlistUnreadCount]);

  const markClientNotificationAsRead = useCallback(
    async (notificationId?: string) => {
      const visible = notificationId
        ? visibleCustomBarNotifications.find((item) => item.id === notificationId)
        : null;
      const section = visible?.section ?? 'prenotazioni';
      logAndroid('mark_as_read', { notificationId: notificationId ?? null, section });
      await markSectionAsRead(section);
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
      logAndroid,
      markSectionAsRead,
      refreshClientUnreadFromDB,
      visibleCustomBarNotifications,
    ]
  );

  const setClientIdentity = useCallback(
    (nextIdentity: ClientNotificationIdentity | null) => {
      setIdentityState(nextIdentity);
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

  const setNotificationTapHandler = useCallback((handler: (() => void) | null) => {
    tapHandlerRef.current = handler;
  }, []);

  const setNotificationForegroundHandler = useCallback((handler: (() => void) | null) => {
    foregroundHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    if (!identity?.isRegistered || !identity.workspaceId.trim()) {
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
  }, [clearCustomBarNotifications, identity, logAndroid, setBadgeIdentityOverride]);

  const registerClientToken = useCallback(async () => {
    const currentIdentity = identityRef.current;
    if (Platform.OS === 'web' || !currentIdentity?.isRegistered) {
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
    if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !identityKey) {
      return;
    }

    void registerClientToken();
    void refreshClientUnreadFromDB();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        logAndroid('app_active_refresh');
        void registerClientToken();
        void refreshClientUnreadFromDB();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [identityKey, logAndroid, refreshClientUnreadFromDB, registerClientToken]);

  const handleNotificationTap = useCallback(
    (response: Notifications.NotificationResponse | null | undefined) => {
      const normalized = normalizeNotification(response?.notification);
      if (!normalized) {
        return;
      }
      const notificationData = getNotificationData(response?.notification);

      markPresented(normalized.eventId);
      logAndroid('tap_or_response', {
        notificationId: normalized.id,
        eventId: normalized.eventId,
        section: normalized.section,
      });
      void syncApplicationBadgeCountFromPushData(notificationData, {
        recipientRole: 'client',
        notificationId: normalized.id,
        eventId: normalized.eventId,
        appState: AppState.currentState,
      });
      void refreshClientUnreadFromDB();
      tapHandlerRef.current?.();
    },
    [logAndroid, markPresented, refreshClientUnreadFromDB]
  );

  useEffect(() => {
    if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !identityKey) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const normalized = normalizeNotification(notification);
      if (!normalized) {
        return;
      }
      const notificationData = getNotificationData(notification);

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
      if (isNew) {
        void enqueueForegroundCustomBarFromDBUnread(normalized);
      } else {
        void refreshClientUnreadFromDB();
      }
      foregroundHandlerRef.current?.();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationTap(response);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          logAndroid('last_notification_response_found');
          handleNotificationTap(response);
        }
      })
      .catch((error) => {
        logAndroid('last_notification_response_error', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [
    enqueueForegroundCustomBarFromDBUnread,
    handleNotificationTap,
    identityKey,
    logAndroid,
    markPresented,
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
      syncClientBadgeFromDB,
      enqueueForegroundCustomBar,
      dismissCustomBarNotification,
      clearCustomBarNotifications,
      markClientNotificationAsRead,
      hasPresented,
      visibleCustomBarNotifications,
      bookingUnreadCount,
      waitlistUnreadCount,
      totalUnread: normalizedTotalUnread,
    }),
    [
      bookingUnreadCount,
      clearCustomBarNotifications,
      dismissCustomBarNotification,
      enqueueForegroundCustomBar,
      hasPresented,
      markClientNotificationAsRead,
      normalizedTotalUnread,
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
