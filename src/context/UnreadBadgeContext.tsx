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
import { usePathname } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { useAppContext } from './AppContext';
import {
  fetchUnreadBadgeSnapshot,
  getEmptyBadgeSnapshot,
  markBadgeSectionAsRead,
  syncBadgeSnapshotToAppIcon,
  type BadgeIdentity,
  type BadgeSection,
  type BadgeSnapshot,
  type UnreadCountsBySection,
} from '../lib/badges/unread-badges';
import {
  bootstrapAndroidBadgeCountFloorFromLauncher,
  clearApplicationBadgeCountFloor,
  decrementApplicationBadgeCountFloor,
  setApplicationBadgeSuppressed,
  syncApplicationBadgeCount,
} from '../lib/notification-badge-sync';
import { supabase } from '../lib/supabase';

const WEB_BADGE_REFRESH_INTERVAL_MS = 4000;
const REALTIME_BADGE_REFRESH_DEBOUNCE_MS = 90;

type RefreshBadgesOptions = {
  throwOnError?: boolean;
  reconcileOptimisticClientBookingUnread?: boolean;
};

type NativeBadgeRefreshRequest = {
  identity: BadgeIdentity;
  identityKey: string;
  reconcileOptimisticClientBookingUnread: boolean;
};

type NativeBadgeRefreshResult = {
  snapshot: BadgeSnapshot;
  error: unknown | null;
};

type NativeBadgeRefreshDrain = {
  promise: Promise<NativeBadgeRefreshResult>;
  resolve: (result: NativeBadgeRefreshResult) => void;
};

type PendingOptimisticClientBookingDecrement = {
  identityKey: string;
  logicalKeys: Set<string>;
};

type UnreadBadgeContextValue = {
  unreadCountsBySection: UnreadCountsBySection;
  totalUnread: number;
  refreshBadges: (options?: RefreshBadgesOptions) => Promise<BadgeSnapshot>;
  optimisticallyDecrementClientBookingUnread: (
    logicalCount: number,
    logicalEventKeys: readonly string[]
  ) => Promise<BadgeSnapshot>;
  markSectionAsRead: (section: BadgeSection) => Promise<BadgeSnapshot>;
  syncAppIconBadge: () => Promise<void>;
  setBadgeIdentityOverride: (identity: BadgeIdentity | null) => void;
};

const UnreadBadgeContext = createContext<UnreadBadgeContextValue | null>(null);

const buildIdentityKey = (identity: BadgeIdentity | null) => {
  if (!identity) {
    return '';
  }

  if (identity.audience === 'owner') {
    return ['owner', identity.workspaceId].join('|');
  }

  return [
    'client',
    identity.workspaceId,
    identity.salonCode?.trim().toLowerCase() ?? '',
    identity.customerEmail?.trim().toLowerCase() ?? '',
    identity.customerPhone?.replace(/\D+/g, '') ?? '',
  ].join('|');
};

const normalizeClientBookingLogicalKey = (value: unknown) =>
  String(value ?? '').trim().toLowerCase();

const buildClientBookingUnreadSnapshot = (
  current: BadgeSnapshot,
  bookingUnreadCount: number,
  clientBookingUnreadLogicalKeys = current.clientBookingUnreadLogicalKeys
): BadgeSnapshot => {
  const unreadCountsBySection: UnreadCountsBySection = {
    ...current.unreadCountsBySection,
    prenotazioni: Math.max(0, Math.trunc(bookingUnreadCount)),
  };

  return {
    audience: 'client',
    unreadCountsBySection,
    totalUnread: Math.max(
      0,
      Math.trunc(unreadCountsBySection.prenotazioni ?? 0) +
        Math.trunc(unreadCountsBySection.waitlist ?? 0) +
        Math.trunc(unreadCountsBySection.communications ?? 0)
    ),
    clientBookingUnreadLogicalKeys,
  };
};

const shouldPreserveAndroidOwnerNotification = (identity: BadgeIdentity | null) =>
  Platform.OS === 'android' &&
  identity?.audience === 'owner' &&
  AppState.currentState === 'active';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Errore sconosciuto');
  }

  return String(error ?? 'Errore sconosciuto');
};

const buildOptimisticReadSnapshot = (
  current: BadgeSnapshot,
  identity: BadgeIdentity | null,
  section: BadgeSection
): BadgeSnapshot => {
  if (!identity || current.audience !== identity.audience) {
    return current;
  }

  const unreadCountsBySection = { ...current.unreadCountsBySection };

  if (identity.audience === 'owner') {
    if (section === 'prenotazioni' || section === 'agenda') {
      unreadCountsBySection.prenotazioni = 0;
      unreadCountsBySection.agenda = 0;
      unreadCountsBySection.cancellazioni = 0;
      unreadCountsBySection.risposteCambioOperatore = 0;
    } else if (section === 'clienti') {
      unreadCountsBySection.clienti = 0;
    }

    return {
      audience: 'owner',
      unreadCountsBySection,
      totalUnread: Math.max(
        0,
        Math.trunc(unreadCountsBySection.prenotazioni ?? 0) +
          Math.trunc(unreadCountsBySection.clienti ?? 0)
      ),
    };
  }

  unreadCountsBySection[section] = 0;
  return {
    audience: 'client',
    unreadCountsBySection,
    totalUnread: Math.max(
      0,
      Math.trunc(unreadCountsBySection.prenotazioni ?? 0) +
        Math.trunc(unreadCountsBySection.waitlist ?? 0) +
        Math.trunc(unreadCountsBySection.communications ?? 0)
    ),
  };
};

export function UnreadBadgeProvider({ children }: { children: ReactNode }) {
  const {
    isAuthenticated,
    salonWorkspace,
    workspaceAccessAllowed,
  } = useAppContext();
  const [snapshot, setSnapshot] = useState<BadgeSnapshot>(() => getEmptyBadgeSnapshot());
  const [snapshotIdentityKey, setSnapshotIdentityKey] = useState('');
  const [identityOverride, setIdentityOverride] = useState<BadgeIdentity | null>(null);
  const [lastNativeClientIdentity, setLastNativeClientIdentity] =
    useState<BadgeIdentity | null>(null);
  const pathname = usePathname();
  const refreshSeqRef = useRef(0);
  const snapshotRef = useRef(snapshot);
  const snapshotIdentityKeyRef = useRef(snapshotIdentityKey);
  const bootstrappedAndroidClientFloorKeyRef = useRef('');
  const nativeRefreshInFlightRef = useRef<NativeBadgeRefreshDrain | null>(null);
  const nativeRefreshRerunRequestedRef = useRef(false);
  const latestNativeRefreshRequestRef = useRef<NativeBadgeRefreshRequest | null>(null);
  const pendingOptimisticClientBookingDecrementRef =
    useRef<PendingOptimisticClientBookingDecrement | null>(null);

  const ownerIdentity = useMemo<BadgeIdentity | null>(() => {
    const workspaceId = salonWorkspace.id?.trim() ?? '';
    if (!isAuthenticated || !workspaceAccessAllowed || !workspaceId) {
      return null;
    }

    return {
      audience: 'owner',
      workspaceId,
    };
  }, [isAuthenticated, salonWorkspace.id, workspaceAccessAllowed]);

  const isClientRoute =
    pathname === '/cliente' ||
    pathname.startsWith('/cliente-') ||
    pathname.startsWith('/cliente/') ||
    pathname.startsWith('/join/');
  const isNativeClientRuntimeRoute =
    pathname === '/cliente' ||
    pathname.startsWith('/cliente-') ||
    pathname.startsWith('/join/');
  const nativeClientIdentity =
    identityOverride?.audience === 'client'
      ? identityOverride
      : isNativeClientRuntimeRoute
        ? lastNativeClientIdentity
        : null;
  // Web keeps its existing route isolation unchanged. On native, a client
  // route never falls through to an authenticated owner while the public
  // profile is hydrating: retain the last valid client identity instead.
  const activeIdentity = Platform.OS === 'web'
    ? isClientRoute
      ? identityOverride ?? ownerIdentity
      : ownerIdentity
    : nativeClientIdentity ?? (isNativeClientRuntimeRoute ? null : ownerIdentity);
  const activeIdentityKey = buildIdentityKey(activeIdentity);
  const activeIdentityKeyRef = useRef(activeIdentityKey);
  activeIdentityKeyRef.current = activeIdentityKey;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (identityOverride?.audience === 'client') {
      setLastNativeClientIdentity(identityOverride);
      return;
    }
    if (!isNativeClientRuntimeRoute) {
      setLastNativeClientIdentity(null);
    }
  }, [identityOverride, isNativeClientRuntimeRoute]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    snapshotIdentityKeyRef.current = snapshotIdentityKey;
  }, [snapshotIdentityKey]);

  useEffect(() => {
    const pendingDecrement = pendingOptimisticClientBookingDecrementRef.current;
    if (pendingDecrement && pendingDecrement.identityKey !== activeIdentityKey) {
      pendingOptimisticClientBookingDecrementRef.current = null;
    }
  }, [activeIdentityKey]);

  const refreshBadges = useCallback(async (options?: RefreshBadgesOptions) => {
    if (!activeIdentity) {
      if (options?.throwOnError) {
        throw new Error('badge_identity_not_ready');
      }
      const emptySnapshot = getEmptyBadgeSnapshot();
      refreshSeqRef.current += 1;
      if (Platform.OS !== 'web') {
        latestNativeRefreshRequestRef.current = null;
        nativeRefreshRerunRequestedRef.current = false;
        pendingOptimisticClientBookingDecrementRef.current = null;
        snapshotRef.current = emptySnapshot;
        snapshotIdentityKeyRef.current = '';
      }
      setSnapshot(emptySnapshot);
      setSnapshotIdentityKey('');
      // A missing identity while native auth/workspace state is hydrating is
      // not a logout. Explicit logout flows suppress the badge themselves.
      // Writing zero here used to erase a freshly delivered Android push and
      // could also make the iOS icon flash to zero.
      return emptySnapshot;
    }

    if (Platform.OS === 'web') {
      await setApplicationBadgeSuppressed(false).catch((error) => {
        console.warn('[UNREAD_BADGE_UNSUPPRESS_ERROR]', getErrorMessage(error));
      });
      const requestSeq = refreshSeqRef.current + 1;
      refreshSeqRef.current = requestSeq;

      try {
        const nextSnapshot = await fetchUnreadBadgeSnapshot(activeIdentity);
        if (refreshSeqRef.current === requestSeq) {
          setSnapshot(nextSnapshot);
          setSnapshotIdentityKey(activeIdentityKey);
          await syncBadgeSnapshotToAppIcon(nextSnapshot, {
            preserveAndroidNotificationOnZero: shouldPreserveAndroidOwnerNotification(activeIdentity),
          });
        }

        return nextSnapshot;
      } catch (error) {
        console.warn('[UNREAD_BADGE_REFRESH_ERROR]', getErrorMessage(error));
        if (options?.throwOnError) {
          throw error;
        }
        return snapshotRef.current;
      }
    }

    const pendingNativeRefreshRequest = latestNativeRefreshRequestRef.current;
    latestNativeRefreshRequestRef.current = {
      identity: activeIdentity,
      identityKey: activeIdentityKey,
      reconcileOptimisticClientBookingUnread:
        options?.reconcileOptimisticClientBookingUnread === true ||
        (pendingNativeRefreshRequest?.identityKey === activeIdentityKey &&
          pendingNativeRefreshRequest.reconcileOptimisticClientBookingUnread),
    };

    if (nativeRefreshInFlightRef.current) {
      nativeRefreshRerunRequestedRef.current = true;
      const result = await nativeRefreshInFlightRef.current.promise;
      if (options?.throwOnError && result.error) {
        throw result.error;
      }
      return result.snapshot;
    }

    let resolveNativeRefresh!: (result: NativeBadgeRefreshResult) => void;
    const nativeRefreshPromise = new Promise<NativeBadgeRefreshResult>((resolve) => {
      resolveNativeRefresh = resolve;
    });
    const nativeRefreshDrain: NativeBadgeRefreshDrain = {
      promise: nativeRefreshPromise,
      resolve: resolveNativeRefresh,
    };
    nativeRefreshInFlightRef.current = nativeRefreshDrain;

    void (async () => {
      let finalResult: NativeBadgeRefreshResult = {
        snapshot: snapshotRef.current,
        error: null,
      };

      try {
        do {
          const request = latestNativeRefreshRequestRef.current;
          latestNativeRefreshRequestRef.current = null;
          nativeRefreshRerunRequestedRef.current = false;

          if (!request) {
            break;
          }

          try {
            await setApplicationBadgeSuppressed(false).catch((error) => {
              console.warn('[UNREAD_BADGE_UNSUPPRESS_ERROR]', getErrorMessage(error));
            });

            if (
              Platform.OS === 'android' &&
              request.identity.audience === 'client' &&
              bootstrappedAndroidClientFloorKeyRef.current !== request.identityKey
            ) {
              bootstrappedAndroidClientFloorKeyRef.current = request.identityKey;
              await bootstrapAndroidBadgeCountFloorFromLauncher();
            }

            const nextSnapshot = await fetchUnreadBadgeSnapshot(request.identity);

            // A native refresh is single-flight. Therefore every successful
            // authoritative result for the current identity is committed before
            // the optional trailing refresh starts; no valid 6 -> 8 update can be
            // discarded merely because realtime/poll/AppState requested another pass.
            if (activeIdentityKeyRef.current === request.identityKey) {
              const pendingOptimisticDecrement =
                pendingOptimisticClientBookingDecrementRef.current;
              const hasPendingOptimisticDecrement =
                request.identity.audience === 'client' &&
                pendingOptimisticDecrement?.identityKey === request.identityKey;
              let snapshotToCommit = nextSnapshot;
              let shouldCommitSnapshot = true;
              let shouldReconcileOptimisticFloor = false;

              if (hasPendingOptimisticDecrement && pendingOptimisticDecrement) {
                if (request.reconcileOptimisticClientBookingUnread) {
                  // The caller confirms that its exact-id persistence RPC has
                  // completed. The database snapshot now wins in full.
                  pendingOptimisticClientBookingDecrementRef.current = null;
                  shouldReconcileOptimisticFloor = true;
                } else if (nextSnapshot.clientBookingUnreadLogicalKeys) {
                  const authoritativeLogicalKeys = new Set(
                    nextSnapshot.clientBookingUnreadLogicalKeys
                      .map(normalizeClientBookingLogicalKey)
                      .filter(Boolean)
                  );
                  const unresolvedLogicalKeys = new Set(
                    Array.from(pendingOptimisticDecrement.logicalKeys).filter((logicalKey) =>
                      authoritativeLogicalKeys.has(logicalKey)
                    )
                  );

                  if (unresolvedLogicalKeys.size === 0) {
                    // The server already stopped returning every exact logical
                    // item: persistence is reflected, even if realtime won the
                    // race against the caller's RPC continuation.
                    pendingOptimisticClientBookingDecrementRef.current = null;
                    shouldReconcileOptimisticFloor = true;
                  } else {
                    // Exclude only the exact still-pending logical keys. New
                    // server unread keys remain counted, so no incoming event is
                    // hidden and already-persisted keys are never subtracted twice.
                    const authoritativeBookingUnread = Math.max(
                      0,
                      Math.trunc(
                        Number(nextSnapshot.unreadCountsBySection.prenotazioni ?? 0) || 0
                      )
                    );
                    snapshotToCommit = buildClientBookingUnreadSnapshot(
                      nextSnapshot,
                      authoritativeBookingUnread - unresolvedLogicalKeys.size,
                      nextSnapshot.clientBookingUnreadLogicalKeys.filter(
                        (logicalKey) =>
                          !unresolvedLogicalKeys.has(
                            normalizeClientBookingLogicalKey(logicalKey)
                          )
                      )
                    );
                    pendingOptimisticClientBookingDecrementRef.current = {
                      ...pendingOptimisticDecrement,
                      logicalKeys: unresolvedLogicalKeys,
                    };
                  }
                } else {
                  shouldCommitSnapshot = false;
                }
              }

              if (shouldCommitSnapshot) {
                if (shouldReconcileOptimisticFloor) {
                  clearApplicationBadgeCountFloor();
                }

                snapshotRef.current = snapshotToCommit;
                snapshotIdentityKeyRef.current = request.identityKey;
                setSnapshot(snapshotToCommit);
                setSnapshotIdentityKey(request.identityKey);
                await syncBadgeSnapshotToAppIcon(snapshotToCommit, {
                  preserveAndroidNotificationOnZero: shouldPreserveAndroidOwnerNotification(
                    request.identity
                  ),
                  ignoreApplicationBadgeFloor: shouldReconcileOptimisticFloor,
                });
                finalResult = { snapshot: snapshotToCommit, error: null };
              } else {
                finalResult = { snapshot: snapshotRef.current, error: null };
              }
            }
          } catch (error) {
            console.warn('[UNREAD_BADGE_REFRESH_ERROR]', getErrorMessage(error));
            finalResult = { snapshot: snapshotRef.current, error };
          }
        } while (
          nativeRefreshRerunRequestedRef.current || latestNativeRefreshRequestRef.current !== null
        );
      } catch (error) {
        console.warn('[UNREAD_BADGE_REFRESH_ERROR]', getErrorMessage(error));
        finalResult = { snapshot: snapshotRef.current, error };
      } finally {
        // Clear the drain before resolving it. A refresh arriving after this
        // exact point starts a new drain instead of joining an already-settled
        // promise and losing its requested trailing pass.
        if (nativeRefreshInFlightRef.current === nativeRefreshDrain) {
          nativeRefreshInFlightRef.current = null;
        }
        nativeRefreshDrain.resolve(finalResult);
      }
    })();

    const result = await nativeRefreshPromise;
    if (options?.throwOnError && result.error) {
      throw result.error;
    }
    return result.snapshot;
  }, [activeIdentity, activeIdentityKey]);

  const optimisticallyDecrementClientBookingUnread = useCallback(
    async (logicalCount: number, logicalEventKeys: readonly string[]) => {
      const requestedLogicalCount = Math.max(0, Math.trunc(Number(logicalCount) || 0));
      const currentSnapshot = snapshotRef.current;

      // The public web flow keeps its existing counters and read timing. This
      // API exists only for the native client custom bar and launcher icon.
      if (
        Platform.OS === 'web' ||
        requestedLogicalCount <= 0 ||
        activeIdentity?.audience !== 'client' ||
        activeIdentityKeyRef.current !== activeIdentityKey ||
        snapshotIdentityKeyRef.current !== activeIdentityKey ||
        currentSnapshot.audience !== 'client' ||
        !Array.isArray(currentSnapshot.clientBookingUnreadLogicalKeys)
      ) {
        return currentSnapshot;
      }

      const currentBookingUnread = Math.max(
        0,
        Math.trunc(Number(currentSnapshot.unreadCountsBySection.prenotazioni ?? 0) || 0)
      );
      const currentLogicalKeys = new Set(
        currentSnapshot.clientBookingUnreadLogicalKeys
          .map(normalizeClientBookingLogicalKey)
          .filter(Boolean)
      );
      const pendingDecrement = pendingOptimisticClientBookingDecrementRef.current;
      const pendingLogicalKeys =
        pendingDecrement?.identityKey === activeIdentityKey
          ? pendingDecrement.logicalKeys
          : new Set<string>();
      const requestedLogicalKeys = Array.from(
        new Set(logicalEventKeys.map(normalizeClientBookingLogicalKey).filter(Boolean))
      ).filter(
        (logicalKey) =>
          currentLogicalKeys.has(logicalKey) && !pendingLogicalKeys.has(logicalKey)
      );
      const appliedLogicalKeys = requestedLogicalKeys.slice(
        0,
        Math.min(currentBookingUnread, requestedLogicalCount)
      );
      const appliedLogicalCount = appliedLogicalKeys.length;
      if (appliedLogicalCount <= 0) {
        return currentSnapshot;
      }

      const appliedLogicalKeySet = new Set(appliedLogicalKeys);
      const nextSnapshot = buildClientBookingUnreadSnapshot(
        currentSnapshot,
        currentBookingUnread - appliedLogicalCount,
        currentSnapshot.clientBookingUnreadLogicalKeys.filter(
          (logicalKey) => !appliedLogicalKeySet.has(normalizeClientBookingLogicalKey(logicalKey))
        )
      );
      const nextPendingLogicalKeys = new Set(pendingLogicalKeys);
      appliedLogicalKeys.forEach((logicalKey) => nextPendingLogicalKeys.add(logicalKey));
      pendingOptimisticClientBookingDecrementRef.current = {
        identityKey: activeIdentityKey,
        logicalKeys: nextPendingLogicalKeys,
      };

      snapshotRef.current = nextSnapshot;
      snapshotIdentityKeyRef.current = activeIdentityKey;
      setSnapshot(nextSnapshot);
      setSnapshotIdentityKey(activeIdentityKey);

      // Reduce only the viewed logical items from Android's monotonic push
      // floor. A concurrently delivered absolute push can still raise the floor
      // again and therefore cannot be overwritten by this optimistic write.
      decrementApplicationBadgeCountFloor(appliedLogicalCount);
      await syncApplicationBadgeCount(nextSnapshot.totalUnread, {
        ignoreFloor: Platform.OS !== 'android',
        preserveAndroidNotificationOnZero: false,
      }).catch((error) => {
        console.warn('[UNREAD_BADGE_OPTIMISTIC_ICON_SYNC_ERROR]', getErrorMessage(error));
      });

      return nextSnapshot;
    },
    [activeIdentity, activeIdentityKey]
  );

  const markSectionAsRead = useCallback(
    async (section: BadgeSection) => {
      const optimisticSnapshot = buildOptimisticReadSnapshot(
        snapshotRef.current,
        activeIdentity,
        section
      );
      snapshotRef.current = optimisticSnapshot;
      setSnapshot(optimisticSnapshot);

      // Explicit reads must reach the launcher before iOS/Android can suspend the app.
      // Ignore the owner floor here and remove Android's badge carrier instead of preserving it.
      clearApplicationBadgeCountFloor();
      const immediateIconSync = syncApplicationBadgeCount(optimisticSnapshot.totalUnread, {
        ignoreFloor: true,
        preserveAndroidNotificationOnZero: false,
        clearAndroidCarrierImmediately: true,
      }).catch((error) => {
        console.warn('[UNREAD_BADGE_IMMEDIATE_ICON_SYNC_ERROR]', getErrorMessage(error));
      });
      const persistRead = markBadgeSectionAsRead(activeIdentity, section);

      try {
        await Promise.all([immediateIconSync, persistRead]);
        return refreshBadges();
      } catch (error) {
        await immediateIconSync;
        await refreshBadges();
        throw error;
      }
    },
    [activeIdentity, refreshBadges]
  );

  const syncAppIconBadge = useCallback(async () => {
    if (!activeIdentity) {
      return;
    }

    await setApplicationBadgeSuppressed(false);
    await syncBadgeSnapshotToAppIcon(snapshot, {
      preserveAndroidNotificationOnZero: shouldPreserveAndroidOwnerNotification(activeIdentity),
    });
  }, [activeIdentity, snapshot]);

  useEffect(() => {
    if (!activeIdentity) {
      const emptySnapshot = getEmptyBadgeSnapshot();
      refreshSeqRef.current += 1;
      setSnapshot(emptySnapshot);
      setSnapshotIdentityKey('');
      return;
    }

    void setApplicationBadgeSuppressed(false);
    void refreshBadges();
  }, [activeIdentity, activeIdentityKey, refreshBadges]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshBadges();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshBadges]);

  useEffect(() => {
    if (!activeIdentity?.workspaceId) {
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshBadges();
      }, REALTIME_BADGE_REFRESH_DEBOUNCE_MS);
    };

    let channel = supabase
      .channel(`unread-badges-live:${activeIdentity.audience}:${activeIdentity.workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          filter: `workspace_id=eq.${activeIdentity.workspaceId}`,
        },
        scheduleRefresh
      );

    if (activeIdentity.audience === 'owner') {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          filter: `workspace_id=eq.${activeIdentity.workspaceId}`,
        },
        scheduleRefresh
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [activeIdentity, activeIdentityKey, refreshBadges]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !activeIdentity) {
      return;
    }

    const refreshWhenVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshBadges();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshBadges();
      }
    };

    const intervalId = setInterval(refreshWhenVisible, WEB_BADGE_REFRESH_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshWhenVisible);
      window.addEventListener('online', refreshWhenVisible);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshWhenVisible);
        window.removeEventListener('online', refreshWhenVisible);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [activeIdentity, activeIdentityKey, refreshBadges]);

  const visibleSnapshot = useMemo(
    () =>
      activeIdentityKey && snapshotIdentityKey === activeIdentityKey
        ? snapshot
        : getEmptyBadgeSnapshot(),
    [activeIdentityKey, snapshot, snapshotIdentityKey]
  );

  const value = useMemo<UnreadBadgeContextValue>(
    () => ({
      unreadCountsBySection: visibleSnapshot.unreadCountsBySection,
      totalUnread: visibleSnapshot.totalUnread,
      refreshBadges,
      optimisticallyDecrementClientBookingUnread,
      markSectionAsRead,
      syncAppIconBadge,
      setBadgeIdentityOverride: setIdentityOverride,
    }),
    [
      markSectionAsRead,
      optimisticallyDecrementClientBookingUnread,
      refreshBadges,
      syncAppIconBadge,
      visibleSnapshot,
    ]
  );

  return <UnreadBadgeContext.Provider value={value}>{children}</UnreadBadgeContext.Provider>;
}

export function useUnreadBadges() {
  const context = useContext(UnreadBadgeContext);

  if (!context) {
    throw new Error('useUnreadBadges deve essere usato dentro UnreadBadgeProvider');
  }

  return context;
}
