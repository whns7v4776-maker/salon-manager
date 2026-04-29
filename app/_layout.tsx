import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useSegments, type Href } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    AppState,
    Platform,
    StatusBar,
    Text,
    TextInput,
    View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingModal } from '../components/onboarding-modal';
import { AppProvider, useAppContext } from '../src/context/AppContext';
import { appFonts } from '../src/lib/fonts';
import { tApp } from '../src/lib/i18n';
import {
    configurePushNotifications,
    isExpoGoPushRuntime,
    registerPushNotifications,
    requestNotificationPermissionsOnly,
} from '../src/lib/push/push-notifications';

const OWNER_PROTECTED_SEGMENTS = new Set(['(tabs)', 'impostazioni']);
const PUBLIC_SEGMENTS = new Set([
  '',
  'cliente',
  'cliente-impostazioni',
  'join',
  'proprietario',
  'reset-password',
]);
const OWNER_ROUTE = '/proprietario' as Href;
const NATIVE_LOGGED_OUT_ROUTE = '/' as Href;
const isUuid = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type OwnerClienteItem = {
  id: string;
  nome: string;
  telefono: string;
  email?: string;
  instagram?: string;
  birthday?: string;
  nota: string;
  fonte?: 'salone' | 'frontend';
  viewedBySalon?: boolean;
  annullamentiCount?: number;
  inibito?: boolean;
};

type OwnerAppuntamentoItem = {
  id: string;
  data: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  operatoreId?: string;
  operatoreNome?: string;
  incassato?: boolean;
  completato?: boolean;
  nonEffettuato?: boolean;
};

const buildAppuntamentoSyncKey = (item: OwnerAppuntamentoItem): string =>
  [
    item.data ?? '',
    item.ora ?? '',
    item.cliente?.trim().toLowerCase() ?? '',
    item.servizio?.trim().toLowerCase() ?? '',
  ].join('|');

const mergeOwnerAppuntamenti = (
  localItems: OwnerAppuntamentoItem[],
  remoteItems: OwnerAppuntamentoItem[]
): OwnerAppuntamentoItem[] => {
  const remoteKeys = new Set(remoteItems.map(buildAppuntamentoSyncKey));
  // Preserve locally-created appointments not yet synced to the remote snapshot
  const localOnlyItems = localItems.filter(
    (item) =>
      !isUuid(item.id) &&
      !remoteKeys.has(buildAppuntamentoSyncKey(item))
  );
  return [...localOnlyItems, ...remoteItems];
};

const buildClienteSyncKey = (item: OwnerClienteItem) => {
  const phone = item.telefono.trim();
  if (phone) return `phone:${phone}`;

  const email = item.email?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = item.nome.trim().toLowerCase();
  if (name) return `name:${name}`;

  return `id:${item.id}`;
};

const mergeOwnerClienti = (
  localItems: OwnerClienteItem[],
  remoteItems: OwnerClienteItem[]
) => {
  const merged = new Map<string, OwnerClienteItem>();

  remoteItems.forEach((item) => {
    merged.set(buildClienteSyncKey(item), item);
  });

  localItems.forEach((item) => {
    const key = buildClienteSyncKey(item);
    const existing = merged.get(key);

    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...item,
            email: item.email?.trim() ? item.email : existing.email,
            instagram: item.instagram?.trim() ? item.instagram : existing.instagram,
            birthday: item.birthday?.trim() ? item.birthday : existing.birthday,
            nota: item.nota?.trim() ? item.nota : existing.nota,
          }
        : item
    );
  });

  return Array.from(merged.values());
};

function AppContent() {
  const {
    appLanguage,
    isAuthenticated,
    isLoaded,
    hasInitializedAuth,
    onboardingPending,
    showOnboarding,
    setOnboardingReady,
    completeOnboarding,
    resolveSalonByCode,
    salonWorkspace,
    setSalonWorkspace,
    appuntamenti,
    setAppuntamenti,
    clienti,
    setClienti,
    setRichiestePrenotazione,
    workspaceAccessAllowed,
  } = useAppContext();
  const segments = useSegments();
  const firstSegment = segments[0] ?? '';
  const isOwnerProtectedRoute = OWNER_PROTECTED_SEGMENTS.has(firstSegment);
  const isPublicRoute = PUBLIC_SEGMENTS.has(firstSegment) || !isOwnerProtectedRoute;
  const shouldPauseOwnerStartupWork = onboardingPending || showOnboarding;
  const ownerSnapshotRefreshSeqRef = React.useRef(0);
  const ownerFirstAccessPromptFlowStartedRef = React.useRef(false);
  const ownerSnapshotRefreshInFlightRef = React.useRef(false);
  const ownerSnapshotRefreshFailureCountRef = React.useRef(0);
  const ownerSnapshotRefreshBlockedUntilRef = React.useRef(0);
  const syncOwnerPushRegistrationRef = React.useRef<(() => Promise<void>) | null>(null);
  const refreshOwnerWorkspaceSnapshotRef = React.useRef<(() => Promise<void>) | null>(null);
  React.useEffect(() => {
    configurePushNotifications();
  }, []);
  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const AndroidText = Text as typeof Text & {
      defaultProps?: Record<string, unknown>;
    };
    const AndroidTextInput = TextInput as typeof TextInput & {
      defaultProps?: Record<string, unknown>;
    };

    AndroidText.defaultProps = {
      ...(AndroidText.defaultProps ?? {}),
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
    };

    AndroidTextInput.defaultProps = {
      ...(AndroidTextInput.defaultProps ?? {}),
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
    };
  }, []);

  const resolveOwnerWorkspaceId = React.useCallback(async () => {
    let workspaceId = isUuid(salonWorkspace.id) ? salonWorkspace.id : '';

    if (!workspaceId && salonWorkspace.salonCode) {
      const snapshot = await resolveSalonByCode(salonWorkspace.salonCode);
      if (snapshot?.workspace?.id && isUuid(snapshot.workspace.id)) {
        workspaceId = snapshot.workspace.id;
        if (workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }
    }

    return workspaceId;
  }, [
    resolveSalonByCode,
    salonWorkspace.id,
    salonWorkspace.salonCode,
    setSalonWorkspace,
  ]);

  const syncOwnerPushRegistration = React.useCallback(async () => {
    if (!isAuthenticated || !workspaceAccessAllowed || shouldPauseOwnerStartupWork) return;

    const workspaceId = await resolveOwnerWorkspaceId();

    if (!workspaceId) {
      console.log('Push registration skipped: workspace_uuid_unavailable');
      return;
    }

    const result = await registerPushNotifications({
      workspaceId,
      ownerEmail: salonWorkspace.ownerEmail,
      audience: 'auth',
      recipientKind: 'owner',
    });

    if (!result.token) {
      console.log('Push registration skipped:', result.reason ?? 'token_unavailable');
      return;
    }

  }, [
    isAuthenticated,
    salonWorkspace.ownerEmail,
    workspaceAccessAllowed,
    shouldPauseOwnerStartupWork,
    resolveOwnerWorkspaceId,
  ]);

  React.useEffect(() => {
    syncOwnerPushRegistrationRef.current = syncOwnerPushRegistration;
  }, [syncOwnerPushRegistration]);

  const waitForOwnerPromptFlowToSettle = React.useCallback(async () => {
    if (Platform.OS === 'web') {
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        setTimeout(resolve, 600);
      };

      if (AppState.currentState === 'active') {
        finish();
        return;
      }

      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          subscription.remove();
          finish();
        }
      });
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || !onboardingPending) {
      ownerFirstAccessPromptFlowStartedRef.current = false;
      setOnboardingReady(false);
      return () => {
        cancelled = true;
      };
    }

    if (ownerFirstAccessPromptFlowStartedRef.current) {
      return () => {
        cancelled = true;
      };
    }

    ownerFirstAccessPromptFlowStartedRef.current = true;
    setOnboardingReady(false);

    void (async () => {
      try {
        const workspaceId = await resolveOwnerWorkspaceId();

        if (workspaceId) {
          const result = await registerPushNotifications({
            workspaceId,
            ownerEmail: salonWorkspace.ownerEmail,
            audience: 'auth',
            recipientKind: 'owner',
          });

          if (!result.token) {
            console.log('Owner first access push registration skipped:', result.reason ?? 'token_unavailable');
          }
        } else {
          console.log('Owner first access prompt flow: workspace_uuid_unavailable');
        }
      } catch (error) {
        console.log('Owner first access prompt flow failed:', error);
      } finally {
        await waitForOwnerPromptFlowToSettle();

        if (!cancelled) {
          setOnboardingReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    onboardingPending,
    resolveOwnerWorkspaceId,
    salonWorkspace.ownerEmail,
    setOnboardingReady,
    waitForOwnerPromptFlowToSettle,
  ]);

  React.useEffect(() => {
    void syncOwnerPushRegistrationRef.current?.();
  }, []);

  React.useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !isAuthenticated ||
      !workspaceAccessAllowed ||
      shouldPauseOwnerStartupWork
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      void syncOwnerPushRegistrationRef.current?.();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, shouldPauseOwnerStartupWork, workspaceAccessAllowed]);

  React.useEffect(() => {
    if (
      !isAuthenticated ||
      !workspaceAccessAllowed ||
      shouldPauseOwnerStartupWork ||
      !isExpoGoPushRuntime()
    ) {
      return;
    }

    void requestNotificationPermissionsOnly().catch((error) => {
      console.log('Expo Go owner notification permission request failed:', error);
    });
  }, [isAuthenticated, shouldPauseOwnerStartupWork, workspaceAccessAllowed]);

  const refreshOwnerWorkspaceSnapshot = React.useCallback(async () => {
    if (!isAuthenticated || !workspaceAccessAllowed || !salonWorkspace.salonCode) {
      return;
    }

    if (ownerSnapshotRefreshInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if (now < ownerSnapshotRefreshBlockedUntilRef.current) {
      return;
    }

    ownerSnapshotRefreshInFlightRef.current = true;
    const requestSeq = ownerSnapshotRefreshSeqRef.current + 1;
    ownerSnapshotRefreshSeqRef.current = requestSeq;
    try {
      const snapshot = await resolveSalonByCode(salonWorkspace.salonCode);
      if (!snapshot || ownerSnapshotRefreshSeqRef.current !== requestSeq) {
        ownerSnapshotRefreshFailureCountRef.current += 1;
        const retryDelayMs = Math.min(
          30000,
          2000 * Math.max(1, ownerSnapshotRefreshFailureCountRef.current)
        );
        ownerSnapshotRefreshBlockedUntilRef.current = Date.now() + retryDelayMs;
        return;
      }

      ownerSnapshotRefreshFailureCountRef.current = 0;
      ownerSnapshotRefreshBlockedUntilRef.current = 0;
      setRichiestePrenotazione(snapshot.richiestePrenotazione);
      setClienti((current) =>
        mergeOwnerClienti(
          current as OwnerClienteItem[],
          snapshot.clienti as OwnerClienteItem[]
        )
      );
      setAppuntamenti((current) =>
        mergeOwnerAppuntamenti(
          current as OwnerAppuntamentoItem[],
          snapshot.appuntamenti as OwnerAppuntamentoItem[]
        )
      );
    } catch (error) {
      ownerSnapshotRefreshFailureCountRef.current += 1;
      const retryDelayMs = Math.min(
        30000,
        3000 * Math.max(1, ownerSnapshotRefreshFailureCountRef.current)
      );
      ownerSnapshotRefreshBlockedUntilRef.current = Date.now() + retryDelayMs;
      console.log('Errore refresh snapshot owner root:', error);
    } finally {
      ownerSnapshotRefreshInFlightRef.current = false;
    }
  }, [
    isAuthenticated,
    resolveSalonByCode,
    salonWorkspace.salonCode,
    setAppuntamenti,
    setClienti,
    setRichiestePrenotazione,
    workspaceAccessAllowed,
  ]);

  React.useEffect(() => {
    refreshOwnerWorkspaceSnapshotRef.current = refreshOwnerWorkspaceSnapshot;
  }, [refreshOwnerWorkspaceSnapshot]);

  React.useEffect(() => {
    if (!isAuthenticated || !workspaceAccessAllowed || shouldPauseOwnerStartupWork) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void syncOwnerPushRegistrationRef.current?.();
      void refreshOwnerWorkspaceSnapshotRef.current?.();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      void syncOwnerPushRegistrationRef.current?.();
      void refreshOwnerWorkspaceSnapshotRef.current?.();
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncOwnerPushRegistrationRef.current?.();
        void refreshOwnerWorkspaceSnapshotRef.current?.();
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [isAuthenticated, workspaceAccessAllowed, shouldPauseOwnerStartupWork]);

  React.useEffect(() => {
    if (
      !isAuthenticated ||
      !workspaceAccessAllowed ||
      shouldPauseOwnerStartupWork ||
      !salonWorkspace.salonCode
    ) {
      return;
    }

    void refreshOwnerWorkspaceSnapshotRef.current?.();
  }, [isAuthenticated, salonWorkspace.salonCode, workspaceAccessAllowed, shouldPauseOwnerStartupWork]);

  React.useEffect(() => {
    if (!isAuthenticated || !workspaceAccessAllowed || !isExpoGoPushRuntime()) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshOwnerWorkspaceSnapshot();
    }, 12000);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    isAuthenticated,
    refreshOwnerWorkspaceSnapshot,
    workspaceAccessAllowed,
  ]);

  if (isOwnerProtectedRoute && (!hasInitializedAuth || !isLoaded)) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f6f6f3',
        }}
      >
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (isOwnerProtectedRoute && !isAuthenticated) {
    return <Redirect href={NATIVE_LOGGED_OUT_ROUTE} />;
  }

  if (!isAuthenticated && !isPublicRoute) {
    return <Redirect href={NATIVE_LOGGED_OUT_ROUTE} />;
  }

  if (isOwnerProtectedRoute && !workspaceAccessAllowed) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f6f6f3',
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#ffffff',
            borderRadius: 28,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.6,
              color: '#9a6b32',
              marginBottom: 8,
            }}
          >
            SALON PRO
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: '#1a1816',
              marginBottom: 10,
            }}
          >
            {tApp(appLanguage, 'root_inactive_title')}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: '#6d6257',
              marginBottom: 16,
            }}
          >
            {tApp(appLanguage, 'root_inactive_description', {
              status: salonWorkspace.subscriptionStatus,
            })}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: '#1a1816',
            }}
          >
            {tApp(appLanguage, 'root_inactive_account')}: {salonWorkspace.ownerEmail}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'none' }}>
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'none' }} />
        <Stack.Screen name="cliente" options={{ gestureEnabled: false }} />
        <Stack.Screen name="cliente-prenotazioni" options={{ gestureEnabled: false }} />
        <Stack.Screen name="cliente-impostazioni" options={{ gestureEnabled: false }} />
      </Stack>

      <OnboardingModal
        visible={showOnboarding}
        onClose={completeOnboarding}
        onComplete={completeOnboarding}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [appFonts.displayNeon]: Orbitron_700Bold,
    [appFonts.displayCondensed]: Rajdhani_700Bold,
    [appFonts.displayPoster]: BebasNeue_400Regular,
    [appFonts.displayEditorial]: PlayfairDisplay_700Bold,
    [appFonts.displayScript]: GreatVibes_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f6f6f3',
          }}
        >
          <ActivityIndicator size="large" color="#111111" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />
      <AppProvider>
        <AppContent />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
