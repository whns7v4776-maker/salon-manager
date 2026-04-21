import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import Constants from 'expo-constants';
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
import { AppProvider, useAppContext } from '../src/context/AppContext';
import { appFonts } from '../src/lib/fonts';
import { tApp } from '../src/lib/i18n';
import {
    configurePushNotifications,
    registerPushNotifications,
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
const NATIVE_LOGGED_OUT_ROUTE = '/cliente-scanner' as Href;
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

type OwnerRichiestaItem = {
  id: string;
  nome: string;
  cognome: string;
  email?: string;
  telefono: string;
  stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
  origine?: 'frontend' | 'backoffice';
  viewedBySalon?: boolean;
  cancellationSource?: 'cliente' | 'salone';
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
            fonte:
              item.fonte === 'frontend' || existing.fonte === 'frontend' ? 'frontend' : 'salone',
            viewedBySalon:
              existing.viewedBySalon === false || item.viewedBySalon === false ? false : true,
            annullamentiCount: Math.max(
              existing.annullamentiCount ?? 0,
              item.annullamentiCount ?? 0
            ),
          }
        : item
    );
  });

  return Array.from(merged.values());
};

const normalizeOwnerPhoneIdentity = (value?: string | null) => {
  const digitsOnly = (value ?? '').replace(/\D+/g, '');
  return digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
};

const normalizeOwnerTextIdentity = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const matchesOwnerClientRequestIdentity = (
  cliente: OwnerClienteItem,
  richiesta: OwnerRichiestaItem
) => {
  const clientEmail = normalizeOwnerTextIdentity(cliente.email);
  const requestEmail = normalizeOwnerTextIdentity(richiesta.email);
  if (clientEmail && requestEmail && clientEmail === requestEmail) {
    return true;
  }

  const clientPhone = normalizeOwnerPhoneIdentity(cliente.telefono);
  const requestPhone = normalizeOwnerPhoneIdentity(richiesta.telefono);
  if (clientPhone && requestPhone && clientPhone === requestPhone) {
    return true;
  }

  const requestFullName = `${richiesta.nome} ${richiesta.cognome}`.trim();
  return normalizeOwnerTextIdentity(cliente.nome) === normalizeOwnerTextIdentity(requestFullName);
};

const enrichOwnerClientiWithRequestSignals = (
  clientiItems: OwnerClienteItem[],
  richiesteItems: OwnerRichiestaItem[]
) =>
  clientiItems.map((cliente) => {
    const matchedRequests = richiesteItems.filter(
      (item) =>
        (item.origine ?? 'frontend') === 'frontend' &&
        matchesOwnerClientRequestIdentity(cliente, item)
    );

    if (matchedRequests.length === 0) {
      return cliente;
    }

    const cancelledByClienteCount = matchedRequests.filter(
      (item) => item.stato === 'Annullata' && item.cancellationSource === 'cliente'
    ).length;
    const hasUnreadFrontendSignal = matchedRequests.some(
      (item) =>
        item.viewedBySalon !== true &&
        (item.stato === 'In attesa' ||
          (item.stato === 'Annullata' && item.cancellationSource === 'cliente'))
    );

    return {
      ...cliente,
      fonte: 'frontend' as const,
      viewedBySalon: hasUnreadFrontendSignal ? false : cliente.viewedBySalon,
      annullamentiCount: Math.max(cliente.annullamentiCount ?? 0, cancelledByClienteCount),
    };
  });

function AppContent() {
  const {
    appLanguage,
    isAuthenticated,
    isLoaded,
    hasInitializedAuth,
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
  const ownerSnapshotRefreshSeqRef = React.useRef(0);
  const isExpoGoRuntime = Constants.executionEnvironment === 'storeClient';
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

  const syncOwnerPushRegistration = React.useCallback(async () => {
    if (!isAuthenticated || !workspaceAccessAllowed || isExpoGoRuntime) return;

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

    if (!workspaceId) {
      console.log('Push registration skipped: workspace_uuid_unavailable');
      return;
    }

    const result = await registerPushNotifications({
      workspaceId,
      ownerEmail: salonWorkspace.ownerEmail,
      audience: 'auto',
      recipientKind: 'owner',
    });

    if (!result.token) {
      console.log('Push registration skipped:', result.reason ?? 'token_unavailable');
      return;
    }

    if (!result.backendSynced) {
      console.log('Push token registrato sul device ma non sincronizzato backend.');
    }
  }, [
    isAuthenticated,
    resolveSalonByCode,
    salonWorkspace.id,
    salonWorkspace.ownerEmail,
    salonWorkspace.salonCode,
    setSalonWorkspace,
    workspaceAccessAllowed,
    isExpoGoRuntime,
  ]);

  React.useEffect(() => {
    syncOwnerPushRegistration();
  }, [syncOwnerPushRegistration]);

  const refreshOwnerWorkspaceSnapshot = React.useCallback(async () => {
    if (
      !isAuthenticated ||
      !workspaceAccessAllowed ||
      !salonWorkspace.salonCode ||
      isExpoGoRuntime
    ) {
      return;
    }

    const requestSeq = ownerSnapshotRefreshSeqRef.current + 1;
    ownerSnapshotRefreshSeqRef.current = requestSeq;
    const snapshot = await resolveSalonByCode(salonWorkspace.salonCode);
    if (!snapshot || ownerSnapshotRefreshSeqRef.current !== requestSeq) {
      return;
    }

    const enrichedSnapshotClienti = enrichOwnerClientiWithRequestSignals(
      snapshot.clienti as OwnerClienteItem[],
      snapshot.richiestePrenotazione as OwnerRichiestaItem[]
    );

    setRichiestePrenotazione(snapshot.richiestePrenotazione);
    setClienti((current) =>
      mergeOwnerClienti(
        current as OwnerClienteItem[],
        enrichedSnapshotClienti
      )
    );
    setAppuntamenti((current) =>
      mergeOwnerAppuntamenti(
        current as OwnerAppuntamentoItem[],
        snapshot.appuntamenti as OwnerAppuntamentoItem[]
      )
    );
  }, [
    isAuthenticated,
    resolveSalonByCode,
    salonWorkspace.salonCode,
    setAppuntamenti,
    setClienti,
    setRichiestePrenotazione,
    workspaceAccessAllowed,
    isExpoGoRuntime,
  ]);

  React.useEffect(() => {
    if (!isAuthenticated || !workspaceAccessAllowed || isExpoGoRuntime) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      syncOwnerPushRegistration();
      void refreshOwnerWorkspaceSnapshot();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      syncOwnerPushRegistration();
      void refreshOwnerWorkspaceSnapshot();
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncOwnerPushRegistration();
        void refreshOwnerWorkspaceSnapshot();
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [
    isAuthenticated,
    refreshOwnerWorkspaceSnapshot,
    syncOwnerPushRegistration,
    workspaceAccessAllowed,
    isExpoGoRuntime,
  ]);

  React.useEffect(() => {
    if (
      !isAuthenticated ||
      !workspaceAccessAllowed ||
      !salonWorkspace.salonCode ||
      isExpoGoRuntime
    ) {
      return;
    }

    void refreshOwnerWorkspaceSnapshot();
  }, [
    isAuthenticated,
    refreshOwnerWorkspaceSnapshot,
    salonWorkspace.salonCode,
    workspaceAccessAllowed,
    isExpoGoRuntime,
  ]);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (!isAuthenticated || !workspaceAccessAllowed) {
      Notifications.setBadgeCountAsync(0).catch(() => null);
    }
  }, [isAuthenticated, workspaceAccessAllowed]);

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

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [appFonts.displayNeon]: Orbitron_700Bold,
    [appFonts.displayCondensed]: Rajdhani_700Bold,
    [appFonts.displayPoster]: BebasNeue_400Regular,
    [appFonts.displayEditorial]: PlayfairDisplay_700Bold,
    [appFonts.displayScript]: GreatVibes_400Regular,
  });

  React.useEffect(() => {
    configurePushNotifications();
  }, []);

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
