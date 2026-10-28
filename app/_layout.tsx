import { AccessAppearanceProvider, AccessBackdrop, useAccessAppearance } from '../components/access-premium';
import { DirectoryReminder } from '../components/salon-discovery/directory-reminder';
import { CustomerPortalAccessGate } from '../components/customer-portal-access-gate';
import { Freeze } from 'react-freeze';
import '../src/lib/client-gps-reminders';
import { requestDiscoveryLocationPermissionOnce } from '../src/lib/discovery-location-permission';
import { resolveOwnerNotificationTarget } from '../src/lib/push/owner-notification-target';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat';
import { Cinzel_600SemiBold } from '@expo-google-fonts/cinzel';
import { CormorantGaramond_600SemiBold_Italic } from '@expo-google-fonts/cormorant-garamond';
import { Parisienne_400Regular } from '@expo-google-fonts/parisienne';
import { Italiana_400Regular } from '@expo-google-fonts/italiana';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import { Audiowide_400Regular } from '@expo-google-fonts/audiowide';
import { Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import {
  PlayfairDisplay_600SemiBold_Italic,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
  PlayfairDisplay_700Bold_Italic,
  PlayfairDisplay_900Black_Italic,
} from '@expo-google-fonts/playfair-display';
import { Rajdhani_500Medium, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, router, useSegments, type Href } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    type AppStateStatus,
    Easing,
    InteractionManager,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingModal } from '../components/onboarding-modal';
import { OwnerSubscriptionPaywall } from '../components/owner-subscription-paywall';
import { AndroidOwnerSettingsHost } from '../components/android-owner-settings-host';
import { IosTapToPayProvider } from '../components/ios-tap-to-pay-provider';
import { HapticTouchableFastRegion } from '../components/ui/haptic-touchable';
import { AppProvider, useAppContext } from '../src/context/AppContext';
import { ClientNotificationsProvider } from '../src/context/ClientNotificationsContext';
import { UnreadBadgeProvider, useUnreadBadges } from '../src/context/UnreadBadgeContext';
import { appFonts } from '../src/lib/fonts';
import { getWorkspaceAccessDecision } from '../src/lib/platform';
import { installSingleActiveAlertGuard } from '../src/lib/single-active-alert';
import { getSupabaseSessionSafely, supabase } from '../src/lib/supabase';
import {
    configurePushNotifications,
    getNotificationPermissionStatus,
    isExpoGoPushRuntime,
    registerPushNotifications,
    requestNotificationPermissionsOnly,
    setForegroundPushPresentationMode,
} from '../src/lib/push/push-notifications';
import { publishOwnerForegroundBannerPush } from '../src/lib/push/owner-foreground-banner-events';
import { syncApplicationBadgeCountFromPushData } from '../src/lib/notification-badge-sync';
import './global.css';
import { resumeMetaMeasurement } from '../src/lib/meta-app-events';

installSingleActiveAlertGuard();

const ENABLE_OWNER_PUSH_DEBUG_LOGS = false;
const OWNER_ACCESS_VERIFICATION_TTL_MS = 30_000;
const OWNER_ACCESS_ACTIVE_CLOCK_TICK_MS = 60_000;
const OWNER_ACCESS_BLOCKED_CLOCK_TICK_MS = 15_000;

const OWNER_PROTECTED_SEGMENTS = new Set([
  '(tabs)',
  'agenda',
  'prenotazioni',
  'clienti',
  'servizi',
  'cassa',
  'impostazioni',
  'vetrina-salone',
  'impostazioni-open',
  'cassa-open',
  'cassa-screen',
  'stampa-qr',
]);
const PUBLIC_SEGMENTS = new Set([
  '',
  'assistenza',
  'contatti',
  'cliente',
  'cliente-impostazioni',
  'cliente-password',
  'join',
  'salone',
  'welcome',
  'marketing',
  'privacy',
  'privacy-policy',
  'reset-password',
  'support',
]);
const NATIVE_LOGGED_OUT_ROUTE = {
  pathname: '/welcome',
  params: { ownerLoggedOut: '1' },
} as const satisfies Href;
const buildOwnerFirstAccessBiometricPromptedKey = (email: string) =>
  `salon_manager_owner_biometric_prompted__${email.trim().toLowerCase()}`;
const buildOwnerFirstAccessNotificationPromptedKey = (email: string) =>
  `salon_manager_owner_notification_prompted__${email.trim().toLowerCase()}`;
const buildOwnerPostOnboardingPromptsPendingKey = (email: string) =>
  `salon_manager_owner_post_onboarding_prompts_pending__${email.trim().toLowerCase()}`;
const buildOwnerAndroidInstallOnboardingSeenKey = (email: string) =>
  `salon_manager_owner_android_install_onboarding_seen__${email.trim().toLowerCase()}`;
const logAndroidBackofficeFirstAccess = (event: string, payload?: Record<string, unknown>) => {
  void event;
  void payload;
};
const isUuid = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const OWNER_PUSH_RECEIVED_DEDUPE_TTL_MS = 60 * 60 * 1000;
const ownerReceivedPushDedupeMap = new Map<string, number>();
const normalizeOwnerPushDedupePart = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const buildOwnerReceivedPushDedupeKey = (
  notification: Notifications.Notification | null | undefined
) => {
  const data =
    (notification?.request.content.data as Record<string, unknown> | undefined) ?? undefined;
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
  ]
    .map((value) => normalizeOwnerPushDedupePart(value))
    .join('|');
};
const shouldIgnoreDuplicateOwnerReceivedPush = (
  notification: Notifications.Notification | null | undefined
) => {
  const dedupeKey = buildOwnerReceivedPushDedupeKey(notification);
  if (!dedupeKey) {
    return false;
  }

  const now = Date.now();
  ownerReceivedPushDedupeMap.forEach((timestamp, key) => {
    if (now - timestamp > OWNER_PUSH_RECEIVED_DEDUPE_TTL_MS) {
      ownerReceivedPushDedupeMap.delete(key);
    }
  });

  const lastSeenAt = ownerReceivedPushDedupeMap.get(dedupeKey) ?? 0;
  if (lastSeenAt > 0 && now - lastSeenAt <= OWNER_PUSH_RECEIVED_DEDUPE_TTL_MS) {
    return true;
  }

  ownerReceivedPushDedupeMap.set(dedupeKey, now);
  return false;
};
const isInternalOwnerBannerSoundNotification = (
  notification: Notifications.Notification | null | undefined
) => {
  const data =
    (notification?.request.content.data as Record<string, unknown> | undefined) ?? undefined;
  return data?._playInAppBannerSound === true;
};
const getAppStartPerfNow = () => globalThis.performance?.now?.() ?? Date.now();
const logAppStartPerf = (event: string, payload: Record<string, unknown> = {}) => {
  void event;
  void payload;
};

function OwnerLogoutTransition({
  shouldRedirect,
}: {
  shouldRedirect: boolean;
}) {
  return (
    <>
      {shouldRedirect ? <Redirect href={NATIVE_LOGGED_OUT_ROUTE} /> : null}
      <View style={styles.ownerLogoutTransition}>
        <ActivityIndicator size="small" color="#0f172a" />
        <Text style={styles.ownerLogoutTransitionText}>Uscita in corso…</Text>
      </View>
    </>
  );
}

function OwnerBootstrapLoading(props: {isSalonEntry?:boolean;message?:string}) {
  return <AccessAppearanceProvider><OwnerBootstrapLoadingContent {...props}/></AccessAppearanceProvider>;
}

function OwnerBootstrapLoadingContent({
  isSalonEntry = true,
  message = Platform.OS === 'ios'
    ? 'Preparazione del salone'
    : 'Stiamo preparando il salone',
}: {
  isSalonEntry?: boolean;
  message?: string;
}) {
  const {palette:p}=useAccessAppearance();
  const [showProgress, setShowProgress] = React.useState(
    Platform.OS === 'ios',
  );

  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      return;
    }
    const timeoutId = setTimeout(() => {
      setShowProgress(true);
    }, 80);
    return () => clearTimeout(timeoutId);
  }, []);

  if (Platform.OS === 'web') {
    return <View style={styles.ownerBootstrapFallback} />;
  }

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.ownerBootstrapFallback,{backgroundColor:p.canvas}]}
    >
      <AccessBackdrop />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject,{backgroundColor:p.night?'rgba(0,0,0,.46)':'rgba(241,236,225,.16)'}]} />
      {showProgress ? (
        <View style={[styles.ownerBootstrapLoadingCard,{backgroundColor:p.night?'rgba(38,41,43,.88)':'rgba(255,253,250,.74)',borderColor:p.border,shadowOpacity:0,elevation:0}]}>
          <View style={[styles.ownerBootstrapSpinnerHalo,{backgroundColor:p.field,borderColor:p.border,shadowOpacity:0,elevation:0}]}>
            <OwnerBootstrapPremiumSpinner />
          </View>
          <View style={styles.ownerBootstrapLoadingCopy}>
            <Text style={[styles.ownerBootstrapLoadingTitle,{color:p.ink,fontWeight:'600'}]}>
              {isSalonEntry ? message : 'Sto caricando SalonPro'}
            </Text>
            <Text style={[styles.ownerBootstrapLoadingSubtitle,{color:p.muted,fontWeight:'400'}]}>
              {isSalonEntry
                ? 'Agenda e appuntamenti saranno pronti tra un istante'
                : 'Tra un istante sarà tutto pronto'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function OwnerBootstrapPremiumSpinner() {
  const {palette:p}=useAccessAppearance();
  const rotation = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 820,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );

    animation.start();
    return () => {
      animation.stop();
      rotation.stopAnimation();
    };
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.ownerBootstrapSpinnerStage}>
      <View style={[styles.ownerBootstrapSpinnerTrack,{borderColor:p.line}]} />
      <Animated.View
        style={[
          styles.ownerBootstrapSpinnerRing,
          {borderTopColor:p.night?'#D8C29B':'#6B7568',borderRightColor:p.night?'rgba(216,194,155,.65)':'rgba(107,117,104,.65)',borderBottomColor:p.night?'rgba(216,194,155,.22)':'rgba(107,117,104,.22)',shadowOpacity:0,elevation:0},
          { transform: [{ rotate }] },
        ]}
      />
    </View>
  );
}

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
  const OWNER_PROMPT_SETTLE_DELAY_MS = Platform.OS === 'android' ? 350 : 1500;
  const appContentMountedAtRef = React.useRef(getAppStartPerfNow());
  const appStartMilestonesRef = React.useRef({
    authReady: false,
    workspaceReady: false,
    stackRendered: false,
    skeletonFinished: false,
  });
  const completedNativeOwnerBootstrapAccountRef = React.useRef('');
  const {
    isAuthenticated,
    isLoaded,
    hasInitializedAuth,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerAppointmentsAuthoritative,
    ownerHomeReady,
    setOwnerHomeReady,
    ownerLogoutInProgress,
    ownerEntryTransitionPending,
    consumeOwnerEntryTransition,
    ownerMobileSessionAccessReady,
    ownerExplicitLogout,
    pendingBiometricUnlock,
    consumePendingBiometricUnlock,
    salonAccountEmail,
    ownerAuthRecoveryPending,
    onboardingPending,
    showOnboarding,
    setOnboardingReady,
    completeOnboarding,
    reopenOnboarding,
    biometricEnabled,
    biometricAvailable,
    biometricType,
    toggleBiometricEnabled,
    resolveSalonByCode,
    salonWorkspace,
    setSalonWorkspace,
    refreshOwnerSubscriptionFromServer,
    setAppuntamenti,
    setClienti,
    setRichiestePrenotazione,
  } = useAppContext();
  const { refreshBadges } = useUnreadBadges();
  const segments = useSegments();
  const firstSegment = segments[0] ?? '';
  const isOwnerClientDetailRoute = firstSegment === 'cliente' && segments.length > 1;
  const isOwnerProtectedRoute =
    OWNER_PROTECTED_SEGMENTS.has(firstSegment) || isOwnerClientDetailRoute;
  const isPublicRoute = PUBLIC_SEGMENTS.has(firstSegment) || !isOwnerProtectedRoute;
  const [subscriptionAccessClock, setSubscriptionAccessClock] = React.useState(() => Date.now());
  const localWorkspaceAccessDecision = getWorkspaceAccessDecision(
    salonWorkspace,
    subscriptionAccessClock
  );
  const localWorkspaceAccessAllowed = localWorkspaceAccessDecision.allowed;
  const ownerAccessVerificationKey = [
    salonAccountEmail.trim().toLowerCase(),
    salonWorkspace.id.trim(),
    salonWorkspace.subscriptionStatus,
    salonWorkspace.subscriptionEndsAt ?? '',
    localWorkspaceAccessDecision.reason,
  ].join('|');
  // Only a presentation hold: access still comes exclusively from server verification.
  const activationIdentity = `${salonAccountEmail.trim().toLowerCase()}|${salonWorkspace.id.trim()}`;
  const [activationTransitionIdentity, setActivationTransitionIdentity] = React.useState<string | null>(null);
  const onActivationTransition = React.useCallback((active: boolean) => {
    setActivationTransitionIdentity(current => active ? activationIdentity : current === activationIdentity ? null : current);
  }, [activationIdentity]);
  const holdNativeActivationPaywall = Platform.OS !== 'web' && isAuthenticated && !ownerExplicitLogout && isOwnerProtectedRoute && activationTransitionIdentity === activationIdentity;
  const [verifiedServerWorkspaceAccess, setVerifiedServerWorkspaceAccess] =
    React.useState<{ key: string; allowed: boolean; verifiedAt: number } | null>(null);
  const hasCurrentServerWorkspaceAccessVerification =
    verifiedServerWorkspaceAccess?.key === ownerAccessVerificationKey &&
    subscriptionAccessClock - verifiedServerWorkspaceAccess.verifiedAt <=
      OWNER_ACCESS_VERIFICATION_TTL_MS;
  const serverWorkspaceAccessVerificationPending =
    isOwnerProtectedRoute &&
    isAuthenticated &&
    !ownerExplicitLogout &&
    !localWorkspaceAccessAllowed &&
    !hasCurrentServerWorkspaceAccessVerification;
  // Keep an already verified native paywall mounted while its access check
  // refreshes in the background. Never reuse another account's decision.
  const showInitialWorkspaceAccessVerification =
    serverWorkspaceAccessVerificationPending &&
    (Platform.OS === 'web' ||
      verifiedServerWorkspaceAccess?.key !== ownerAccessVerificationKey);
  const devAccessKey = __DEV__ && Platform.OS !== 'web' && salonAccountEmail && salonWorkspace.id
    ? `salonpro_dev_access_v1:${salonAccountEmail.trim().toLowerCase()}:${salonWorkspace.id}` : null;
  const [devOnboardingAccount, setDevOnboardingAccount] = React.useState<string | null>(null);
  const [devAccessLoadedKey, setDevAccessLoadedKey] = React.useState<string | null>(null);
  const devOnboardingAccess = __DEV__ && Platform.OS !== 'web' &&
    isAuthenticated && !ownerExplicitLogout && !!devAccessKey && devOnboardingAccount === devAccessKey;
  const devAccessRestoring = !!devAccessKey && isAuthenticated && !ownerExplicitLogout && devAccessLoadedKey !== devAccessKey;
  React.useEffect(() => {
    if (!devAccessKey || !isAuthenticated || ownerExplicitLogout) {
      setDevOnboardingAccount(null);
      setDevAccessLoadedKey(null);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(devAccessKey).then(value => {
      if (!cancelled) setDevOnboardingAccount(value === 'true' ? devAccessKey : null);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setDevAccessLoadedKey(devAccessKey);
    });
    return () => { cancelled = true; };
  }, [devAccessKey, isAuthenticated, ownerExplicitLogout]);
  const continueDevOnboarding = React.useCallback(async () => {
    if (!__DEV__ || Platform.OS === 'web' || !devAccessKey) return;
    await AsyncStorage.setItem(devAccessKey, 'true');
    setDevAccessLoadedKey(devAccessKey);
    setDevOnboardingAccount(devAccessKey);
  }, [devAccessKey]);
  const effectiveWorkspaceAccessAllowed =
    devOnboardingAccess || localWorkspaceAccessAllowed ||
    (hasCurrentServerWorkspaceAccessVerification &&
      verifiedServerWorkspaceAccess?.allowed === true);

  React.useEffect(() => {
    if (!serverWorkspaceAccessVerificationPending) {
      return;
    }

    let cancelled = false;

    const verifyWorkspaceAccess = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await refreshOwnerSubscriptionFromServer();
        if (cancelled) return;

        if (result.ok) {
          setVerifiedServerWorkspaceAccess({
            key: ownerAccessVerificationKey,
            allowed: result.active,
            verifiedAt: Date.now(),
          });
          return;
        }

        if (attempt === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 350));
        }
      }

      if (!cancelled) {
        setVerifiedServerWorkspaceAccess({
          key: ownerAccessVerificationKey,
          allowed: false,
          verifiedAt: Date.now(),
        });
      }
    };

    void verifyWorkspaceAccess();

    return () => {
      cancelled = true;
    };
  }, [
    ownerAccessVerificationKey,
    refreshOwnerSubscriptionFromServer,
    serverWorkspaceAccessVerificationPending,
  ]);
  const shouldPauseOwnerStartupWork = onboardingPending || showOnboarding;
  const shouldRunOwnerPostLoginExperience =
    isAuthenticated &&
    hasInitializedAuth &&
    isLoaded &&
    isOwnerProtectedRoute &&
    effectiveWorkspaceAccessAllowed &&
    (Platform.OS === 'web' || ownerMobileSessionAccessReady) &&
    !ownerAuthRecoveryPending;
  const shouldRegisterOwnerPush =
    Platform.OS !== 'web' &&
    isAuthenticated &&
    hasInitializedAuth &&
    isLoaded &&
    isOwnerProtectedRoute &&
    effectiveWorkspaceAccessAllowed &&
    ownerMobileSessionAccessReady &&
    !ownerAuthRecoveryPending;
  const ownerPushRegistrationContextRef = React.useRef({
    allowed: shouldRegisterOwnerPush,
    workspaceId: salonWorkspace.id,
    ownerEmail: (salonWorkspace.ownerEmail || salonAccountEmail).trim().toLowerCase(),
  });
  ownerPushRegistrationContextRef.current = {
    allowed: shouldRegisterOwnerPush,
    workspaceId: salonWorkspace.id,
    ownerEmail: (salonWorkspace.ownerEmail || salonAccountEmail).trim().toLowerCase(),
  };
  const shouldRunOwnerRuntime =
    isAuthenticated &&
    isOwnerProtectedRoute &&
    effectiveWorkspaceAccessAllowed &&
    (Platform.OS === 'web' || ownerMobileSessionAccessReady) &&
    !shouldPauseOwnerStartupWork;
  const shouldSuppressIosLoggedOutRedirectDuringBiometricEntry =
    Platform.OS === 'ios' && pendingBiometricUnlock;
  const shouldRedirectToLoggedOutLanding =
    !shouldSuppressIosLoggedOutRedirectDuringBiometricEntry &&
    !ownerAuthRecoveryPending &&
    (isOwnerProtectedRoute || !isPublicRoute) &&
    (ownerExplicitLogout || (!isAuthenticated && hasInitializedAuth && isLoaded));
  const shouldShowImmediateOwnerPaywall =
    isOwnerProtectedRoute &&
    isAuthenticated &&
    !ownerExplicitLogout &&
    !showInitialWorkspaceAccessVerification &&
    !effectiveWorkspaceAccessAllowed &&
    (onboardingPending || ownerServerSyncReady);
  const ownerSnapshotRefreshSeqRef = React.useRef(0);
  const onboardingStartedRef = React.useRef(false);
  const notificationsPromptStartedRef = React.useRef(false);
  const biometricPromptStartedRef = React.useRef(false);
  const postLoginFlowStartedRef = React.useRef(false);
  const ownerPostLoginModalActiveRef = React.useRef(false);
  const onboardingCompletionResolverRef = React.useRef<(() => void) | null>(null);
  const onboardingFinishInFlightRef = React.useRef(false);
  const ownerSnapshotRefreshInFlightRef = React.useRef(false);
  const ownerSnapshotRefreshFailureCountRef = React.useRef(0);
  const ownerSnapshotRefreshBlockedUntilRef = React.useRef(0);
  const ownerSnapshotRefreshLastAtRef = React.useRef(0);
  const syncOwnerPushRegistrationRef = React.useRef<(() => Promise<void>) | null>(null);
  const refreshOwnerWorkspaceSnapshotRef = React.useRef<(() => Promise<void>) | null>(null);
  const lastOwnerPushRegistrationSignatureRef = React.useRef('');
  const pendingOwnerPostOnboardingPromptFlowRef = React.useRef(false);
  const ownerPromptRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidInstallOnboardingStartedForRef = React.useRef('');
  const onboardingPendingRef = React.useRef(onboardingPending);
  const biometricAvailableRef = React.useRef(biometricAvailable);
  const biometricEnabledRef = React.useRef(biometricEnabled);
  const [ownerPostOnboardingPromptPending, setOwnerPostOnboardingPromptPending] = React.useState(false);
  const [ownerPromptRetryNonce, setOwnerPromptRetryNonce] = React.useState(0);
  const [onboardingModalVisible, setOnboardingModalVisible] = React.useState(false);

  React.useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleAccessCheck = () => {
      const now = Date.now();
      setSubscriptionAccessClock(now);

      const endsAtMs = Date.parse(salonWorkspace.subscriptionEndsAt ?? '');
      const hasFutureActiveExpiration =
        salonWorkspace.subscriptionStatus === 'active' &&
        Number.isFinite(endsAtMs) &&
        endsAtMs > now;
      const nextTickMs = hasFutureActiveExpiration
        ? Math.min(
            Math.max(endsAtMs - now + 1000, 1000),
            OWNER_ACCESS_ACTIVE_CLOCK_TICK_MS
          )
        : OWNER_ACCESS_BLOCKED_CLOCK_TICK_MS;

      timeoutId = setTimeout(scheduleAccessCheck, nextTickMs);
    };

    scheduleAccessCheck();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [salonWorkspace.subscriptionEndsAt, salonWorkspace.subscriptionStatus]);

  React.useEffect(() => {
    if (!isAuthenticated || !isOwnerProtectedRoute || ownerExplicitLogout) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      setSubscriptionAccessClock(Date.now());
      setVerifiedServerWorkspaceAccess(null);
      void refreshOwnerSubscriptionFromServer();
    });

    return () => subscription.remove();
  }, [
    isAuthenticated,
    isOwnerProtectedRoute,
    ownerExplicitLogout,
    refreshOwnerSubscriptionFromServer,
  ]);

  React.useEffect(() => {
    logAppStartPerf('app_content_mount', {
      route: firstSegment,
      isOwnerProtectedRoute,
    });
  }, []);

  React.useEffect(() => {
    const now = getAppStartPerfNow();
    const milestones = appStartMilestonesRef.current;

    if (!milestones.authReady && hasInitializedAuth && isLoaded) {
      milestones.authReady = true;
      logAppStartPerf('auth_ready', {
        elapsedMs: Math.round(now - appContentMountedAtRef.current),
        isAuthenticated,
        isOwnerProtectedRoute,
      });
    }

    if (
      !milestones.workspaceReady &&
      isAuthenticated &&
      effectiveWorkspaceAccessAllowed &&
      salonWorkspace.id
    ) {
      milestones.workspaceReady = true;
      logAppStartPerf('workspace_profile_ready', {
        elapsedMs: Math.round(now - appContentMountedAtRef.current),
        ownerInitialDataHydrating,
        ownerServerSyncReady,
        workspaceId: salonWorkspace.id,
      });
    }
  }, [
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    isOwnerProtectedRoute,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    salonWorkspace.id,
    effectiveWorkspaceAccessAllowed,
  ]);
  React.useEffect(() => {
    configurePushNotifications();
  }, []);

  React.useEffect(() => {
    // Keep the onboarding modal driven by the onboarding state itself.
    // Tying it to owner runtime readiness makes it blink when auth/runtime
    // gates briefly flap during bootstrap.
    setOnboardingModalVisible(showOnboarding);
    logAndroidBackofficeFirstAccess('onboarding_visibility_sync', {
      showOnboarding,
      onboardingPending,
      isOwnerProtectedRoute,
    });
  }, [showOnboarding]);

  React.useEffect(() => {
    onboardingPendingRef.current = onboardingPending;
  }, [onboardingPending]);

  React.useEffect(() => {
    if (
      !isAuthenticated ||
      !isOwnerProtectedRoute ||
      ownerAuthRecoveryPending ||
      !onboardingPending ||
      onboardingFinishInFlightRef.current
    ) {
      return;
    }

    setOnboardingReady(true);
    logAndroidBackofficeFirstAccess('onboarding_ready_from_pending', {
      salonAccountEmail,
      onboardingPending,
    });
  }, [
    isAuthenticated,
    isOwnerProtectedRoute,
    onboardingPending,
    ownerAuthRecoveryPending,
    setOnboardingReady,
  ]);

  React.useEffect(() => {
    biometricAvailableRef.current = biometricAvailable;
    biometricEnabledRef.current = biometricEnabled;
  }, [biometricAvailable, biometricEnabled]);

  React.useEffect(() => {
    const syncOwnerForegroundPushPresentation = (nextState: AppStateStatus) => {
      setForegroundPushPresentationMode(
        shouldRunOwnerRuntime && nextState === 'active'
          ? 'owner_auth_banner_only'
          : 'system'
      );
    };

    syncOwnerForegroundPushPresentation(AppState.currentState);
    const subscription = AppState.addEventListener(
      'change',
      syncOwnerForegroundPushPresentation
    );

    return () => {
      subscription.remove();
      setForegroundPushPresentationMode('system');
    };
  }, [shouldRunOwnerRuntime]);
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

    if (!workspaceId && Platform.OS === 'web' && salonWorkspace.salonCode) {
      const snapshot = await resolveSalonByCode(salonWorkspace.salonCode);
      if (snapshot?.workspace?.id && isUuid(snapshot.workspace.id)) {
        workspaceId = snapshot.workspace.id;
        if (workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) =>
            current.id === workspaceId ? current : { ...current, id: workspaceId }
          );
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
    if (!shouldRegisterOwnerPush) return;

    const workspaceId = await resolveOwnerWorkspaceId();
    const resolvedOwnerEmail = (salonWorkspace.ownerEmail || salonAccountEmail).trim().toLowerCase();

    if (!workspaceId || !resolvedOwnerEmail) {
      return;
    }

    const result = await registerPushNotifications({
      workspaceId,
      ownerEmail: resolvedOwnerEmail,
      audience: 'auth',
      recipientKind: 'owner',
      requestPermissionsIfNeeded: false,
      isRegistrationCurrent: () => {
        const current = ownerPushRegistrationContextRef.current;
        return current.allowed && current.workspaceId === workspaceId &&
          current.ownerEmail === resolvedOwnerEmail;
      },
    });

    if (!result.token) {
      return;
    }

    if (!result.backendSynced) {
      console.log('Owner push token ottenuto ma non sincronizzato backend.');
    }

  }, [
    salonAccountEmail,
    salonWorkspace.ownerEmail,
    resolveOwnerWorkspaceId,
    shouldRegisterOwnerPush,
  ]);

  React.useEffect(() => {
    syncOwnerPushRegistrationRef.current = syncOwnerPushRegistration;
  }, [syncOwnerPushRegistration]);

  const waitForOwnerPromptFlowToSettle = React.useCallback(async (extraDelayMs = 0) => {
    if (Platform.OS === 'web') {
      return;
    }

    await new Promise<void>((resolve) => {
      const baseDelayMs = Platform.OS === 'android' ? 220 : 600;
      const finish = () => {
        setTimeout(resolve, baseDelayMs + extraDelayMs);
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

  const armOwnerPostOnboardingPrompts = React.useCallback(
    async (ownerEmail?: string | null) => {
      if (Platform.OS === 'web') {
        return;
      }

      const normalizedOwnerEmail = (ownerEmail || salonAccountEmail).trim().toLowerCase();
      if (!normalizedOwnerEmail) {
        return;
      }

      pendingOwnerPostOnboardingPromptFlowRef.current = true;
      postLoginFlowStartedRef.current = false;
      notificationsPromptStartedRef.current = false;
      biometricPromptStartedRef.current = false;
      setOwnerPostOnboardingPromptPending(true);

      await AsyncStorage.setItem(
        buildOwnerPostOnboardingPromptsPendingKey(normalizedOwnerEmail),
        'true'
      ).catch(() => undefined);

      setOwnerPromptRetryNonce((current) => current + 1);
    },
    [salonAccountEmail]
  );

  const maybePromptOwnerBiometricSetup = React.useCallback(async (options?: { force?: boolean }) => {
    if (Platform.OS === 'web' || biometricEnabled || !biometricAvailable || !salonAccountEmail) {
      return false;
    }

    const promptKey = buildOwnerFirstAccessBiometricPromptedKey(salonAccountEmail);

    try {
      const alreadyPrompted = await AsyncStorage.getItem(promptKey);
      if (!options?.force && alreadyPrompted === 'true') {
        return false;
      }

      if (!options?.force) {
        await AsyncStorage.setItem(promptKey, 'true');
      }
    } catch (error) {
      console.log('Errore controllo prompt biometria owner:', error);
    }

    if (options?.force) {
      const result = await toggleBiometricEnabled(true);
      if (!result.ok && result.error) {
        Alert.alert('Sblocco biometrico', result.error);
      }
      if (result.ok) {
        await AsyncStorage.setItem(promptKey, 'true').catch(() => undefined);
      } else {
        await AsyncStorage.removeItem(promptKey).catch(() => undefined);
      }
      return result.ok;
    }

    Alert.alert(
      biometricType === 'faceid' ? 'Attiva Face ID' : 'Attiva accesso con impronta',
      biometricType === 'faceid'
        ? 'Puoi sbloccare il back office più velocemente con Face ID su questo dispositivo.'
        : 'Puoi sbloccare il back office più velocemente con l’impronta su questo dispositivo.',
      [
        {
          text: 'Non ora',
          style: 'cancel',
        },
        {
          text: 'Attiva',
          onPress: () => {
            void toggleBiometricEnabled(true).then((result) => {
              if (!result.ok && result.error) {
                Alert.alert('Sblocco biometrico', result.error);
              }
            });
          },
        },
      ]
    );
    return true;
  }, [
    biometricAvailable,
    biometricEnabled,
    biometricType,
    salonAccountEmail,
    toggleBiometricEnabled,
  ]);

  const canShowDirectoryReminder = React.useCallback(() => !ownerPostLoginModalActiveRef.current && !postLoginFlowStartedRef.current && !pendingOwnerPostOnboardingPromptFlowRef.current && !onboardingPendingRef.current, []);

  const runOwnerPostOnboardingPromptsNow = React.useCallback(
    async (ownerEmail?: string | null) => {
      if (Platform.OS === 'web') {
        return false;
      }

      const normalizedOwnerEmail = (ownerEmail || salonAccountEmail).trim().toLowerCase();
      if (!normalizedOwnerEmail || ownerPostLoginModalActiveRef.current) {
        return false;
      }

      ownerPostLoginModalActiveRef.current = true;
      let didPrompt = false;

      try {
        const notificationPromptKey =
          buildOwnerFirstAccessNotificationPromptedKey(normalizedOwnerEmail);
        const notificationPermissionStatus =
          await getNotificationPermissionStatus().catch(() => 'undetermined');
        logAndroidBackofficeFirstAccess('post_onboarding_prompt_status', {
          notificationPermissionStatus,
          biometricAvailable: biometricAvailableRef.current,
          biometricEnabled: biometricEnabledRef.current,
        });

        if (
          Platform.OS === 'android' &&
          !biometricEnabledRef.current &&
          biometricAvailableRef.current
        ) {
          didPrompt = true;
          await maybePromptOwnerBiometricSetup({ force: true });
          await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
        }

        if (notificationPermissionStatus !== 'granted') {
          didPrompt = true;
          await requestNotificationPermissionsOnly().catch(() => null);
          const resolvedPermissionStatus =
            await getNotificationPermissionStatus().catch(() => 'undetermined');
          if (resolvedPermissionStatus === 'granted') {
            await AsyncStorage.setItem(notificationPromptKey, 'true').catch(() => undefined);
          } else {
            await AsyncStorage.removeItem(notificationPromptKey).catch(() => undefined);
          }
          await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
        } else {
          await AsyncStorage.setItem(notificationPromptKey, 'true').catch(() => undefined);
        }

        if (
          Platform.OS !== 'android' &&
          !biometricEnabledRef.current &&
          biometricAvailableRef.current
        ) {
          didPrompt = true;
          await maybePromptOwnerBiometricSetup({ force: true });
          await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
        }

        if (await requestDiscoveryLocationPermissionOnce()) {
          didPrompt = true;
          await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
        }

        await AsyncStorage.removeItem(
          buildOwnerPostOnboardingPromptsPendingKey(normalizedOwnerEmail)
        ).catch(() => undefined);
        setOwnerPostOnboardingPromptPending(false);
        pendingOwnerPostOnboardingPromptFlowRef.current = false;
      } catch (error) {
        console.log('Prompt immediati post onboarding owner falliti:', error);
        await AsyncStorage.setItem(
          buildOwnerPostOnboardingPromptsPendingKey(normalizedOwnerEmail),
          'true'
        ).catch(() => undefined);
        setOwnerPostOnboardingPromptPending(true);
        pendingOwnerPostOnboardingPromptFlowRef.current = true;
      } finally {
        ownerPostLoginModalActiveRef.current = false;
        logAndroidBackofficeFirstAccess('post_onboarding_prompt_done', { didPrompt });
      }

      return didPrompt;
    },
    [
      maybePromptOwnerBiometricSetup,
      salonAccountEmail,
      waitForOwnerPromptFlowToSettle,
    ]
  );

  const handleOnboardingFinish = React.useCallback(async () => {
    if (onboardingFinishInFlightRef.current) {
      return;
    }

    onboardingFinishInFlightRef.current = true;
    setOnboardingModalVisible(false);
    let shouldRunPromptsAfterClose = false;
    const promptOwnerEmail = salonAccountEmail;

    try {
      await completeOnboarding();
      if (Platform.OS !== 'web' && salonAccountEmail) {
        await AsyncStorage.setItem(
          buildOwnerAndroidInstallOnboardingSeenKey(salonAccountEmail),
          'true'
        ).catch(() => undefined);
      }
      shouldRunPromptsAfterClose = Boolean(promptOwnerEmail);
    } catch (error) {
      console.log('Owner onboarding completion task failed:', error);
    } finally {
      const resolveOnboarding = onboardingCompletionResolverRef.current;
      onboardingCompletionResolverRef.current = null;
      ownerPostLoginModalActiveRef.current = false;
      onboardingFinishInFlightRef.current = false;
      resolveOnboarding?.();
      setOwnerPromptRetryNonce((current) => current + 1);

      if (shouldRunPromptsAfterClose && promptOwnerEmail) {
        setTimeout(() => {
          void (async () => {
            try {
              await armOwnerPostOnboardingPrompts(promptOwnerEmail);
              await waitForOwnerPromptFlowToSettle(350);
              const didPrompt = await runOwnerPostOnboardingPromptsNow(promptOwnerEmail);
              if (!didPrompt) {
                setOwnerPromptRetryNonce((current) => current + 1);
              }
            } catch (error) {
              // This callback runs after the onboarding modal has unmounted.
              // Never let an unexpected native permission/storage failure
              // escape as an unhandled JS exception on iOS.
              console.log('Avvio prompt post onboarding owner non riuscito:', error);
              pendingOwnerPostOnboardingPromptFlowRef.current = true;
              setOwnerPostOnboardingPromptPending(true);
            }
          })();
        }, Platform.OS === 'ios' ? 450 : 180);
      }
    }
  }, [
    armOwnerPostOnboardingPrompts,
    completeOnboarding,
    runOwnerPostOnboardingPromptsNow,
    salonAccountEmail,
    waitForOwnerPromptFlowToSettle,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    if (!shouldRunOwnerPostLoginExperience || !salonAccountEmail) {
      if (!onboardingPendingRef.current) {
        pendingOwnerPostOnboardingPromptFlowRef.current = false;
        setOwnerPostOnboardingPromptPending(false);
      }
      return () => {
        cancelled = true;
      };
    }

    if (onboardingPendingRef.current) {
      pendingOwnerPostOnboardingPromptFlowRef.current = true;
      setOwnerPostOnboardingPromptPending(true);
      void AsyncStorage.setItem(
        buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
        'true'
      ).catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail))
      .then(async (value) => {
        if (cancelled) return;
        let pending = value === 'true';

        if (!pending && Platform.OS !== 'web') {
          try {
            const notificationPromptKey =
              buildOwnerFirstAccessNotificationPromptedKey(salonAccountEmail);
            const alreadyPromptedNotification = await AsyncStorage.getItem(
              notificationPromptKey
            );
            const notificationPermissionStatus =
              await getNotificationPermissionStatus().catch(() => 'undetermined');

            if (
              !cancelled &&
              (alreadyPromptedNotification !== 'true' ||
                notificationPermissionStatus !== 'granted')
            ) {
              pending = true;
              await AsyncStorage.setItem(
                buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
                'true'
              ).catch(() => undefined);
            }

            if (!pending && biometricAvailable && !biometricEnabled) {
              const biometricPromptKey =
                buildOwnerFirstAccessBiometricPromptedKey(salonAccountEmail);
              const alreadyPromptedBiometric = await AsyncStorage.getItem(
                biometricPromptKey
              );

              if (!cancelled && alreadyPromptedBiometric !== 'true') {
                pending = true;
                await AsyncStorage.setItem(
                  buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
                  'true'
                ).catch(() => undefined);
              }
            }
          } catch (error) {
            console.log('Errore bootstrap prompt notifiche owner:', error);
          }
        }

        if (cancelled) return;
        if (!pending && onboardingPendingRef.current) {
          pending = true;
          await AsyncStorage.setItem(
            buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
            'true'
          ).catch(() => undefined);
        }
        pendingOwnerPostOnboardingPromptFlowRef.current = pending;
        setOwnerPostOnboardingPromptPending(pending);
      })
      .catch(() => {
        if (!cancelled) {
          pendingOwnerPostOnboardingPromptFlowRef.current = false;
          setOwnerPostOnboardingPromptPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    biometricAvailable,
    biometricEnabled,
    salonAccountEmail,
    shouldRunOwnerPostLoginExperience,
  ]);

  React.useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !shouldRunOwnerPostLoginExperience ||
      !salonAccountEmail ||
      onboardingPending ||
      showOnboarding ||
      ownerPostOnboardingPromptPending ||
      ownerPostLoginModalActiveRef.current
    ) {
      return;
    }

    const normalizedOwnerEmail = salonAccountEmail.trim().toLowerCase();
    if (!normalizedOwnerEmail || androidInstallOnboardingStartedForRef.current === normalizedOwnerEmail) {
      return;
    }

    let cancelled = false;
    void AsyncStorage.getItem(buildOwnerAndroidInstallOnboardingSeenKey(normalizedOwnerEmail))
      .then(async (value) => {
        if (cancelled || value === 'true') {
          logAndroidBackofficeFirstAccess('install_onboarding_skip', {
            reason: cancelled ? 'cancelled' : 'already_seen_this_install',
            ownerEmail: normalizedOwnerEmail,
          });
          return;
        }

        androidInstallOnboardingStartedForRef.current = normalizedOwnerEmail;
        pendingOwnerPostOnboardingPromptFlowRef.current = true;
        setOwnerPostOnboardingPromptPending(true);
        await AsyncStorage.setItem(
          buildOwnerPostOnboardingPromptsPendingKey(normalizedOwnerEmail),
          'true'
        ).catch(() => undefined);
        logAndroidBackofficeFirstAccess('install_onboarding_open', {
          ownerEmail: normalizedOwnerEmail,
        });
        reopenOnboarding();
      })
      .catch((error) => {
        logAndroidBackofficeFirstAccess('install_onboarding_check_error', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    onboardingPending,
    ownerPostOnboardingPromptPending,
    reopenOnboarding,
    salonAccountEmail,
    shouldRunOwnerPostLoginExperience,
    showOnboarding,
  ]);

  React.useEffect(() => {
    if (!shouldRunOwnerPostLoginExperience) {
      if (onboardingPending || showOnboarding) {
        return;
      }
      onboardingStartedRef.current = false;
      notificationsPromptStartedRef.current = false;
      biometricPromptStartedRef.current = false;
      postLoginFlowStartedRef.current = false;
      ownerPostLoginModalActiveRef.current = false;
      pendingOwnerPostOnboardingPromptFlowRef.current = false;
      setOwnerPostOnboardingPromptPending(false);
      setOnboardingReady(false);
      return;
    }

    if (!onboardingPending || !salonAccountEmail) {
      return;
    }

    pendingOwnerPostOnboardingPromptFlowRef.current = true;
    setOwnerPostOnboardingPromptPending(true);
    void AsyncStorage.setItem(
      buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
      'true'
    ).catch(() => undefined);
  }, [
    isAuthenticated,
    onboardingPending,
    salonAccountEmail,
    setOnboardingReady,
    showOnboarding,
    shouldRunOwnerPostLoginExperience,
  ]);

  React.useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !shouldRunOwnerPostLoginExperience ||
      !salonAccountEmail ||
      onboardingPending ||
      showOnboarding ||
      ownerPostOnboardingPromptPending
    ) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const notificationPermissionStatus =
            await getNotificationPermissionStatus().catch(() => 'undetermined');
          const shouldPromptNotifications = notificationPermissionStatus === 'undetermined';
          const shouldPromptBiometric = biometricAvailable && !biometricEnabled;

          if (!cancelled && (shouldPromptNotifications || shouldPromptBiometric)) {
            await armOwnerPostOnboardingPrompts(salonAccountEmail);
          }
        } catch (error) {
          console.log('Retry prompt primo accesso owner non riuscito:', error);
        }
      })();
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    armOwnerPostOnboardingPrompts,
    biometricAvailable,
    biometricEnabled,
    onboardingPending,
    ownerPostOnboardingPromptPending,
    salonAccountEmail,
    shouldRunOwnerPostLoginExperience,
    showOnboarding,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    if (
      !shouldRunOwnerPostLoginExperience ||
      !ownerPostOnboardingPromptPending ||
      ownerPostLoginModalActiveRef.current
    ) {
      return () => {
        cancelled = true;
      };
    }

    if (postLoginFlowStartedRef.current) {
      return () => {
        cancelled = true;
      };
    }

    postLoginFlowStartedRef.current = true;
    pendingOwnerPostOnboardingPromptFlowRef.current = false;

    const waitForInteractions = () =>
      new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, Platform.OS === 'android' ? 50 : 250);
        });
      });

    const waitForPostLoginStateToSettle = async (predicate: () => boolean, timeoutMs = 2200) => {
      const startedAt = Date.now();
      while (!predicate() && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      return predicate();
    };

    const showOnboardingAndWaitUntilClosed = async () => {
      const hasPendingOnboarding = await waitForPostLoginStateToSettle(
        () => onboardingPendingRef.current,
        2400
      );

      if (!hasPendingOnboarding || onboardingStartedRef.current) {
        return;
      }

      onboardingStartedRef.current = true;
      ownerPostLoginModalActiveRef.current = true;
      setOnboardingReady(true);
      setOnboardingModalVisible(true);

      await new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          onboardingCompletionResolverRef.current = null;
          ownerPostLoginModalActiveRef.current = false;
          resolve();
        };
        const timeout = setTimeout(() => {
          finish();
        }, 120000);
        onboardingCompletionResolverRef.current = finish;
      });

      await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
    };

    const requestNotificationsAndWait = async (workspaceId: string, ownerEmail: string) => {
      if (Platform.OS === 'web' || notificationsPromptStartedRef.current || !ownerEmail) {
        return true;
      }

      notificationsPromptStartedRef.current = true;
      ownerPostLoginModalActiveRef.current = true;
      let completed = true;

      try {
        const notificationPromptKey = buildOwnerFirstAccessNotificationPromptedKey(ownerEmail);
        const alreadyPromptedNotification = await AsyncStorage.getItem(notificationPromptKey);
        const notificationPermissionStatus =
          await getNotificationPermissionStatus().catch(() => 'undetermined');
        logAndroidBackofficeFirstAccess('notification_prompt_gate', {
          alreadyPromptedNotification,
          notificationPermissionStatus,
          hasWorkspaceId: Boolean(workspaceId),
        });
        let resolvedPermissionStatus = notificationPermissionStatus;
        if (
          alreadyPromptedNotification !== 'true' ||
          notificationPermissionStatus !== 'granted'
        ) {
          await requestNotificationPermissionsOnly().catch(() => null);
          resolvedPermissionStatus =
            await getNotificationPermissionStatus().catch(() => 'undetermined');
          if (resolvedPermissionStatus === 'granted') {
            await AsyncStorage.setItem(notificationPromptKey, 'true').catch(() => undefined);
          } else {
            completed = false;
            await AsyncStorage.removeItem(notificationPromptKey).catch(() => undefined);
          }
          await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
        } else if (notificationPermissionStatus === 'granted') {
          await AsyncStorage.setItem(notificationPromptKey, 'true').catch(() => undefined);
        }

        if (workspaceId && resolvedPermissionStatus === 'granted') {
          const result = await registerPushNotifications({
            workspaceId,
            ownerEmail,
            audience: 'auth',
            recipientKind: 'owner',
            requestPermissionsIfNeeded: true,
            isRegistrationCurrent: () => {
              const current = ownerPushRegistrationContextRef.current;
              return current.allowed && current.workspaceId === workspaceId &&
                current.ownerEmail === ownerEmail.trim().toLowerCase();
            },
          });

          if (!result.token) {
            console.log('Owner first access push registration skipped:', result.reason ?? 'token_unavailable');
            completed = false;
          }
        } else if (resolvedPermissionStatus === 'granted') {
          completed = false;
        }
      } catch (error) {
        console.log('Owner notification prompt flow failed:', error);
        completed = false;
      } finally {
        ownerPostLoginModalActiveRef.current = false;
        await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
      }

      return completed;
    };

    const requestBiometricSetupAndWait = async () => {
      const canPromptBiometric = await waitForPostLoginStateToSettle(
        () => biometricAvailableRef.current || biometricEnabledRef.current,
        2600
      );

      if (
        Platform.OS === 'web' ||
        biometricPromptStartedRef.current ||
        biometricEnabledRef.current ||
        !canPromptBiometric ||
        !biometricAvailableRef.current
      ) {
        logAndroidBackofficeFirstAccess('biometric_prompt_skip', {
          biometricPromptStarted: biometricPromptStartedRef.current,
          biometricEnabled: biometricEnabledRef.current,
          canPromptBiometric,
          biometricAvailable: biometricAvailableRef.current,
        });
        return true;
      }

      biometricPromptStartedRef.current = true;
      ownerPostLoginModalActiveRef.current = true;
      let completed = true;

      try {
        completed = await maybePromptOwnerBiometricSetup({ force: true });
      } finally {
        ownerPostLoginModalActiveRef.current = false;
        await waitForOwnerPromptFlowToSettle(OWNER_PROMPT_SETTLE_DELAY_MS);
      }

      return completed;
    };

    void (async () => {
      let shouldKeepPromptPending = false;
      try {
        const { data: sessionResult } = await getSupabaseSessionSafely();
        const sessionEmail = sessionResult.session?.user?.email?.trim().toLowerCase() ?? '';
        if (!sessionResult.session || !sessionEmail) {
          throw new Error('owner_session_missing_before_post_login_flow');
        }

        if (cancelled) return;

        await waitForInteractions();

        if (cancelled) return;

        const workspaceId = await resolveOwnerWorkspaceId();
        const resolvedOwnerEmail = (salonWorkspace.ownerEmail || salonAccountEmail)
          .trim()
          .toLowerCase();

        if (cancelled || !resolvedOwnerEmail) return;

        await showOnboardingAndWaitUntilClosed();

        if (cancelled) return;

        if (Platform.OS === 'android') {
          const biometricPromptCompleted = await requestBiometricSetupAndWait();
          shouldKeepPromptPending = shouldKeepPromptPending || !biometricPromptCompleted;

          if (cancelled) return;

          const notificationPromptCompleted = await requestNotificationsAndWait(
            workspaceId,
            resolvedOwnerEmail
          );
          shouldKeepPromptPending = shouldKeepPromptPending || !notificationPromptCompleted;
        } else {
          const notificationPromptCompleted = await requestNotificationsAndWait(
            workspaceId,
            resolvedOwnerEmail
          );
          shouldKeepPromptPending = shouldKeepPromptPending || !notificationPromptCompleted;

          if (cancelled) return;

          const biometricPromptCompleted = await requestBiometricSetupAndWait();
          shouldKeepPromptPending = shouldKeepPromptPending || !biometricPromptCompleted;
        }
      } catch (error) {
        console.log('Owner first access prompt flow failed:', error);
        shouldKeepPromptPending = true;
      } finally {
        if (!cancelled) {
          postLoginFlowStartedRef.current = false;
          notificationsPromptStartedRef.current = false;
          biometricPromptStartedRef.current = false;

          if (shouldKeepPromptPending) {
            pendingOwnerPostOnboardingPromptFlowRef.current = true;
            setOwnerPostOnboardingPromptPending(true);
            if (salonAccountEmail) {
              await AsyncStorage.setItem(
                buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail),
                'true'
              ).catch(() => undefined);
            }
            if (ownerPromptRetryTimerRef.current) {
              clearTimeout(ownerPromptRetryTimerRef.current);
            }
            ownerPromptRetryTimerRef.current = setTimeout(() => {
              ownerPromptRetryTimerRef.current = null;
              setOwnerPromptRetryNonce((current) => current + 1);
            }, 4000);
          } else {
            if (ownerPromptRetryTimerRef.current) {
              clearTimeout(ownerPromptRetryTimerRef.current);
              ownerPromptRetryTimerRef.current = null;
            }
            setOwnerPostOnboardingPromptPending(false);
            if (salonAccountEmail) {
              await AsyncStorage.removeItem(
                buildOwnerPostOnboardingPromptsPendingKey(salonAccountEmail)
              ).catch(() => undefined);
            }
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    onboardingPending,
    ownerPostOnboardingPromptPending,
    ownerPromptRetryNonce,
    resolveOwnerWorkspaceId,
    salonAccountEmail,
    salonWorkspace.ownerEmail,
    maybePromptOwnerBiometricSetup,
    setOnboardingReady,
    shouldRunOwnerPostLoginExperience,
    biometricAvailable,
    biometricEnabled,
    biometricType,
    waitForOwnerPromptFlowToSettle,
  ]);

  React.useEffect(() => {
    if (!shouldRegisterOwnerPush) {
      lastOwnerPushRegistrationSignatureRef.current = '';
      return;
    }

    const normalizedOwnerEmail = (salonWorkspace.ownerEmail || salonAccountEmail)
      .trim()
      .toLowerCase();
    const signature = [
      salonWorkspace.id?.trim() ?? '',
      salonWorkspace.salonCode?.trim().toLowerCase() ?? '',
      normalizedOwnerEmail,
    ].join('|');

    if (!normalizedOwnerEmail || !signature.replace(/\|/g, '')) {
      return;
    }

    if (lastOwnerPushRegistrationSignatureRef.current === signature) {
      return;
    }

    lastOwnerPushRegistrationSignatureRef.current = signature;
    void syncOwnerPushRegistrationRef.current?.();
  }, [
    salonAccountEmail,
    salonWorkspace.id,
    salonWorkspace.ownerEmail,
    salonWorkspace.salonCode,
    shouldRegisterOwnerPush,
  ]);

  React.useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !shouldRegisterOwnerPush
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      void syncOwnerPushRegistrationRef.current?.();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [shouldRegisterOwnerPush]);

  const refreshOwnerWorkspaceSnapshot = React.useCallback(async () => {
    if (Platform.OS !== 'web' || !shouldRunOwnerRuntime || !salonWorkspace.salonCode) {
      return;
    }

    if (ownerSnapshotRefreshInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if (now < ownerSnapshotRefreshBlockedUntilRef.current) {
      return;
    }

    if (now - ownerSnapshotRefreshLastAtRef.current < 20000) {
      return;
    }

    ownerSnapshotRefreshInFlightRef.current = true;
    ownerSnapshotRefreshLastAtRef.current = now;
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
    resolveSalonByCode,
    salonWorkspace.salonCode,
    setAppuntamenti,
    setClienti,
    setRichiestePrenotazione,
    shouldRunOwnerRuntime,
  ]);

  React.useEffect(() => {
    refreshOwnerWorkspaceSnapshotRef.current = refreshOwnerWorkspaceSnapshot;
  }, [refreshOwnerWorkspaceSnapshot]);

  const logOwnerNotificationEvent = React.useCallback(
    (
      phase: 'received' | 'response',
      notification:
        | Notifications.Notification
        | Notifications.NotificationResponse['notification']
        | null
        | undefined
    ) => {
      if (!ENABLE_OWNER_PUSH_DEBUG_LOGS) {
        return;
      }

      if (!notification) {
        console.log(`Owner push ${phase}: notification_missing`);
        return;
      }

      console.log('[BACKOFFICE_FOREGROUND_PARITY]', `owner_push_${phase}`, {
        platform: Platform.OS,
        role: 'owner',
        title: notification.request.content.title ?? null,
        body: notification.request.content.body ?? null,
        badge: notification.request.content.badge ?? null,
        sound: notification.request.content.sound ?? null,
        data: notification.request.content.data ?? null,
      });
    },
    []
  );

  const applyOwnerOperatorChangeResponseFromPush = React.useCallback(
    (notificationData: Record<string, unknown>) => {
      const eventType = String(
        notificationData._pushEventType ??
          notificationData.eventType ??
          notificationData.type ??
          ''
      )
        .trim()
        .toLowerCase();
      if (eventType !== 'booking_operator_change_response') {
        return;
      }

      const requestId = String(
        notificationData.bookingRequestId ?? notificationData.requestId ?? ''
      ).trim();
      const response = String(notificationData.response ?? '').trim().toLowerCase();
      if (!requestId || (response !== 'accepted' && response !== 'rejected')) {
        return;
      }

      const respondedAt = new Date().toISOString();
      setRichiestePrenotazione((current) =>
        current.map((item) =>
          item.id !== requestId
            ? item
            : {
                ...item,
                stato: response === 'accepted' ? 'Accettata' : 'Annullata',
                operatorChangeStatus: response,
                operatorChangeRespondedAt: respondedAt,
                viewedByCliente: true,
                viewedBySalon: false,
              }
        )
      );
    },
    [setRichiestePrenotazione]
  );

  const ownerHandledTapRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    if (!shouldRunOwnerRuntime) {
      return;
    }

    let receivedSubscription: { remove: () => void } | null = null;
    let responseSubscription: { remove: () => void } | null = null;

    let disposed = false;
    let removeMirrorPress: (() => void) | undefined;
    const openOwnerNotification = (data: Record<string, unknown>, identifier: string) => {
      if (disposed) return false;
      const target = resolveOwnerNotificationTarget(data, salonWorkspace.salonCode, salonWorkspace.id);
      if (!target) return false;
      const key = String(data.notificationId ?? data.eventId ?? identifier);
      const now = Date.now();
      if (now - (ownerHandledTapRef.current.get(key) ?? 0) < 1500) return true;
      router.push(target);
      ownerHandledTapRef.current.set(key, now);
      ownerHandledTapRef.current.forEach((at, id) => {
        if (now - at > 60000) ownerHandledTapRef.current.delete(id);
      });
      return true;
    };
    // Replay after authentication/navigation is ready, including a cold launch.
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response && openOwnerNotification(response.notification.request.content.data ?? {}, response.notification.request.identifier)) {
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    }).catch(() => undefined);
    if (Platform.OS === 'android') {
      void import('@notifee/react-native').then(({ default: notifee, EventType }) => {
        if (disposed) return;
        const openMirror = (notification: { id?: string; data?: Record<string, unknown> } | undefined) => {
          if (notification?.data?.source === 'owner_foreground_notifee') {
            openOwnerNotification(notification.data, notification.id ?? 'owner-mirror');
          }
        };
        removeMirrorPress = notifee.onForegroundEvent(event => {
          if (event.type === EventType.PRESS) openMirror(event.detail.notification);
        });
        void notifee.getInitialNotification().then(initial => {
          if (initial) openMirror(initial.notification);
        }).catch(() => undefined);
      }).catch(() => undefined);
    }

    try {
      receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        if (isInternalOwnerBannerSoundNotification(notification)) {
          return;
        }

        const notificationData =
          (notification.request.content.data as Record<string, unknown> | undefined) ?? {};
        const isAndroidBadgeOnlyRefresh =
          Platform.OS === 'android' && notificationData._badgeOnly === true;
        void syncApplicationBadgeCountFromPushData(notificationData, {
          recipientRole: 'owner',
          notificationId:
            String(notificationData.notificationId ?? notification.request.identifier ?? '') || null,
          eventId: String(notificationData.eventId ?? '') || null,
          appState: AppState.currentState,
        });
        if (isAndroidBadgeOnlyRefresh) {
          return;
        }

        applyOwnerOperatorChangeResponseFromPush(notificationData);

        if (shouldIgnoreDuplicateOwnerReceivedPush(notification)) {
          return;
        }

        if (Platform.OS === 'ios' && AppState.currentState === 'active') {
          const normalizedTarget = String(
            notificationData._pushTarget ?? notificationData._pushAudience ?? ''
          ).trim().toLowerCase();
          const normalizedType = String(
            notificationData._pushEventType ?? notificationData.type ?? ''
          ).trim().toLowerCase();
          const requestId = String(
            notificationData.bookingRequestId ?? notificationData.requestId ?? ''
          ).trim();
          const isOwnerBookingPush =
            normalizedTarget === 'owner' ||
            normalizedTarget === 'auth' ||
            normalizedType === 'booking_request_created' ||
            normalizedType === 'booking_request_status_changed' ||
            normalizedType === 'appointment_cancelled';

          if (isOwnerBookingPush && requestId) {
            publishOwnerForegroundBannerPush({
              eventKey:
                buildOwnerReceivedPushDedupeKey(notification) ||
                String(notification.request.identifier ?? requestId),
              title: String(
                notification.request.content.title ?? 'Nuova richiesta prenotazione'
              ),
              body: String(
                notification.request.content.body ?? 'Tocca per aprire la richiesta.'
              ),
              requestId,
              appointmentDate:
                String(notificationData.appointmentDate ?? '').trim() || null,
              appointmentTime:
                String(notificationData.appointmentTime ?? '').trim() || null,
              status:
                String(notificationData.statusCode ?? notificationData.status ?? '').trim() ||
                null,
              cancellationSource:
                String(
                  notificationData.cancellationSource ??
                    notificationData.cancellation_source ??
                    ''
                ).trim() || null,
              receivedAt: Date.now(),
            });
          }
        }

        logOwnerNotificationEvent('received', notification);
        void syncOwnerPushRegistrationRef.current?.();
        void refreshOwnerWorkspaceSnapshotRef.current?.();
        void refreshBadges();
      });
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        logOwnerNotificationEvent('response', response.notification);
        const notificationData =
          (response.notification.request.content.data as Record<string, unknown> | undefined) ??
          {};
        if (openOwnerNotification(notificationData, response.notification.request.identifier)) {
          void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        }
        applyOwnerOperatorChangeResponseFromPush(notificationData);
        void syncApplicationBadgeCountFromPushData(
          notificationData,
          {
            recipientRole: 'owner',
            notificationId:
              String(notificationData.notificationId ?? response.notification.request.identifier ?? '') ||
              null,
            eventId: String(notificationData.eventId ?? '') || null,
            appState: AppState.currentState,
          }
        );
        void syncOwnerPushRegistrationRef.current?.();
        void refreshOwnerWorkspaceSnapshotRef.current?.();
        void refreshBadges();
      });
    } catch (error) {
      console.log('Listener notifiche owner non disponibile:', error);
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncOwnerPushRegistrationRef.current?.();
        void refreshOwnerWorkspaceSnapshotRef.current?.();
        void refreshBadges();
      }
    });

    return () => {
      receivedSubscription?.remove();
      responseSubscription?.remove();
      disposed = true;
      removeMirrorPress?.();
      appStateSubscription.remove();
    };
  }, [
    applyOwnerOperatorChangeResponseFromPush,
    logOwnerNotificationEvent,
    salonWorkspace.id,
    salonWorkspace.salonCode,
    refreshBadges,
    shouldRunOwnerRuntime,
  ]);

  React.useEffect(() => {
    if (!shouldRunOwnerRuntime) {
      return;
    }

    void refreshBadges();
  }, [
    refreshBadges,
    salonWorkspace.id,
    salonWorkspace.salonCode,
    shouldRunOwnerRuntime,
    salonAccountEmail,
  ]);

  React.useEffect(() => {
    if (
      !shouldRunOwnerRuntime ||
      !salonWorkspace.salonCode
    ) {
      return;
    }

    if (Platform.OS === 'web') {
      void refreshOwnerWorkspaceSnapshotRef.current?.();
    }
  }, [salonWorkspace.salonCode, shouldRunOwnerRuntime]);

  React.useEffect(() => {
    if (!shouldRunOwnerRuntime || Platform.OS !== 'web') {
      return;
    }

    const intervalId = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshOwnerWorkspaceSnapshot();
      }
    }, isExpoGoPushRuntime() ? 45000 : 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    refreshOwnerWorkspaceSnapshot,
    shouldRunOwnerRuntime,
  ]);

  const normalizedOwnerBootstrapAccount = salonAccountEmail.trim().toLowerCase();
  // Native readiness belongs to one authenticated workspace, never to a
  // layout event or to a previous login of the same account.
  const nativeOwnerSessionKey = `${normalizedOwnerBootstrapAccount}|${salonWorkspace.id}`;
  const completedNativeOwnerSessionRef = React.useRef('');
  if (!isAuthenticated || ownerExplicitLogout || ownerLogoutInProgress) {
    completedNativeOwnerSessionRef.current = '';
    if (Platform.OS !== 'web') completedNativeOwnerBootstrapAccountRef.current = '';
  }
  const nativeOwnerDataReady =
    isLoaded && !ownerInitialDataHydrating && ownerServerSyncReady &&
    ownerAppointmentsAuthoritative && ownerMobileSessionAccessReady;
  const nativeOwnerSessionCompleted =
    completedNativeOwnerSessionRef.current === nativeOwnerSessionKey;
  const hasCompletedNativeOwnerBootstrap =
    Platform.OS !== 'web' &&
    !!normalizedOwnerBootstrapAccount &&
    completedNativeOwnerBootstrapAccountRef.current === normalizedOwnerBootstrapAccount;
  const shouldShowInitialOwnerBootstrap =
    Platform.OS !== 'web' &&
    isOwnerProtectedRoute &&
      !(isAuthenticated && hasCompletedNativeOwnerBootstrap) &&
      (!hasInitializedAuth ||
      ownerAuthRecoveryPending ||
      (!isAuthenticated && !ownerExplicitLogout && !isLoaded) ||
      (!isAuthenticated && !ownerExplicitLogout && ownerInitialDataHydrating));
  const shouldShowNativeLandingBootstrap =
    Platform.OS !== 'web' &&
    firstSegment === '' &&
    (!hasInitializedAuth ||
      (!isAuthenticated && !isLoaded));
  const shouldShowWebOwnerBootstrap =
    Platform.OS === 'web' &&
    isOwnerProtectedRoute &&
    (!hasInitializedAuth ||
      ownerAuthRecoveryPending ||
      (!isAuthenticated && !ownerExplicitLogout && !isLoaded));
  const shouldShowConfirmedOwnerPaywall =
    isOwnerProtectedRoute &&
    !effectiveWorkspaceAccessAllowed &&
    !showInitialWorkspaceAccessVerification &&
    !ownerInitialDataHydrating &&
    ownerServerSyncReady;
  const shouldHoldIosOwnerEntryBridge =
    Platform.OS === 'ios' &&
    (pendingBiometricUnlock || ownerEntryTransitionPending);
  const shouldShowNativeContentBridge =
    Platform.OS !== 'web' &&
    (!ownerExplicitLogout || shouldHoldIosOwnerEntryBridge) &&
    !nativeOwnerSessionCompleted &&
    (shouldHoldIosOwnerEntryBridge ||
      ((!nativeOwnerDataReady || (isOwnerProtectedRoute && !ownerHomeReady)) &&
        (firstSegment === '' || isOwnerProtectedRoute) &&
        (!hasInitializedAuth || isAuthenticated)));

  React.useEffect(() => {
    if (
      Platform.OS !== 'ios' ||
      (!pendingBiometricUnlock && !ownerEntryTransitionPending) ||
      !isOwnerProtectedRoute ||
      !isAuthenticated ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !ownerAppointmentsAuthoritative ||
      !isLoaded ||
      !ownerMobileSessionAccessReady
    ) {
      return;
    }

    // Dopo il logout le tab iOS restano montate sotto la landing, quindi il
    // loro onLayout non viene emesso di nuovo. La rotta protetta attiva, con
    // sessione e snapshot pronti, e il punto autorevole in cui togliere il
    // bridge senza lasciare intravedere la landing pubblica.
    setOwnerHomeReady(true);
    consumePendingBiometricUnlock();
    consumeOwnerEntryTransition();
  }, [
    consumePendingBiometricUnlock,
    consumeOwnerEntryTransition,
    isAuthenticated,
    isLoaded,
    ownerAppointmentsAuthoritative,
    isOwnerProtectedRoute,
    ownerInitialDataHydrating,
    ownerMobileSessionAccessReady,
    ownerServerSyncReady,
    pendingBiometricUnlock,
    ownerEntryTransitionPending,
    setOwnerHomeReady,
  ]);
  let ownerOverlay: 'logout' | 'bootstrap' | 'paywall' | null = null;

  if (
    Platform.OS !== 'web' &&
    ownerLogoutInProgress &&
    isOwnerProtectedRoute
  ) {
    ownerOverlay = 'logout';
  } else if (shouldRedirectToLoggedOutLanding) {
    ownerOverlay = 'logout';
  } else if (holdNativeActivationPaywall) {
    ownerOverlay = 'paywall';
  } else if (
    shouldShowWebOwnerBootstrap ||
    shouldShowNativeLandingBootstrap ||
    shouldShowInitialOwnerBootstrap
  ) {
    ownerOverlay = 'bootstrap';
  } else if (
    showInitialWorkspaceAccessVerification &&
    (Platform.OS === 'web' || !nativeOwnerSessionCompleted)
  ) {
    // Revalidating access in an already opened native session is background
    // work. A confirmed denial still reaches the paywall branches below.
    ownerOverlay = 'bootstrap';
  } else if (devAccessRestoring && isOwnerProtectedRoute) {
    ownerOverlay = 'bootstrap';
  } else if (shouldShowImmediateOwnerPaywall) {
    ownerOverlay = 'paywall';
  } else if (shouldShowConfirmedOwnerPaywall) {
    ownerOverlay = 'paywall';
  }

  if (
    ownerOverlay === null &&
    isOwnerProtectedRoute &&
    !appStartMilestonesRef.current.stackRendered
  ) {
    appStartMilestonesRef.current.stackRendered = true;
    appStartMilestonesRef.current.skeletonFinished = true;
    logAppStartPerf('first_backoffice_render', {
      elapsedMs: Math.round(getAppStartPerfNow() - appContentMountedAtRef.current),
      ownerInitialDataHydrating,
      ownerServerSyncReady,
      workspaceAccessAllowed: effectiveWorkspaceAccessAllowed,
    });
    logAppStartPerf('skeleton_finished', {
      elapsedMs: Math.round(getAppStartPerfNow() - appContentMountedAtRef.current),
    });
  }

  if (
    Platform.OS !== 'web' &&
    ownerOverlay === null &&
    isOwnerProtectedRoute &&
    isAuthenticated &&
    normalizedOwnerBootstrapAccount
  ) {
    completedNativeOwnerBootstrapAccountRef.current = normalizedOwnerBootstrapAccount;
    if (nativeOwnerDataReady && ownerHomeReady && !shouldHoldIosOwnerEntryBridge) {
      completedNativeOwnerSessionRef.current = nativeOwnerSessionKey;
    }
  }

  return (
    <IosTapToPayProvider identity={shouldRunOwnerPostLoginExperience && !ownerLogoutInProgress && !ownerExplicitLogout && isUuid(salonWorkspace.id) ? `${salonWorkspace.id}:${normalizedOwnerBootstrapAccount}` : ''}>
    <AndroidOwnerSettingsHost
      prepare={Platform.OS === 'android' && isOwnerProtectedRoute && ownerHomeReady}
    >
      <HapticTouchableFastRegion
        enabled={Platform.OS === 'android' && isOwnerProtectedRoute}
      >
        <Freeze freeze={Platform.OS === 'android' && isOwnerProtectedRoute && ownerOverlay === null && onboardingModalVisible}>
        <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="welcome" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen
          name="(tabs)"
          options={{
            // Il replace dalla landing owner non deve animare la vecchia Home
            // sotto al bridge di caricamento. Android era gia immediato; iOS
            // ora usa lo stesso passaggio pulito, mentre il web resta invariato.
            animation: Platform.OS === 'web' ? 'default' : 'none',
            // Android keeps five heavy owner pages mounted; freeze them only on
            // that platform when Settings gains focus.
            freezeOnBlur: Platform.OS === 'android' ? true : undefined,
          }}
        />
        <Stack.Screen
          name="impostazioni"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'default',
            // Keep the native owner screen attached beneath Settings while
            // the horizontal gesture reveals it, preserving its tab and scroll.
            ...(Platform.OS === 'android' ? {
              presentation: 'transparentModal',
              contentStyle: { backgroundColor: 'transparent' },
            } : {}),
          }}
        />
        <Stack.Screen
          name="cliente-impostazioni"
          options={Platform.OS === 'android' ? {
            animation: 'none',
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          } : {}}
        />
        </Stack>
        </Freeze>
        {ownerOverlay || shouldShowNativeContentBridge ? (
          <View style={styles.ownerFullscreenOverlay}>
          {ownerOverlay === 'logout' ? (
            <OwnerLogoutTransition
              shouldRedirect={Platform.OS === 'web' || !ownerLogoutInProgress}
            />
          ) : null}
          {ownerOverlay === 'bootstrap' ||
          (ownerOverlay === null && shouldShowNativeContentBridge) ? (
            <OwnerBootstrapLoading
              isSalonEntry={isOwnerProtectedRoute || isAuthenticated || shouldHoldIosOwnerEntryBridge}
            />
          ) : null}
          {ownerOverlay === 'paywall' ? <OwnerSubscriptionPaywall onActivationTransition={onActivationTransition} onDevContinue={__DEV__ && Platform.OS !== 'web' ? continueDevOnboarding : undefined} /> : null}
          </View>
        ) : null}
        <DirectoryReminder
          workspaceId={salonWorkspace.id}
          popup
          canShow={canShowDirectoryReminder}
          active={shouldRunOwnerPostLoginExperience && ['(tabs)', '(tabs)/index'].includes(segments.join('/')) && ownerOverlay === null && !shouldShowNativeContentBridge && !onboardingPending && !showOnboarding && !onboardingModalVisible && !ownerPostOnboardingPromptPending}
        />
        <OnboardingModal
          visible={ownerOverlay === null && onboardingModalVisible}
          allowSkip
          onClose={handleOnboardingFinish}
          onComplete={handleOnboardingFinish}
        />
      </HapticTouchableFastRegion>
    </AndroidOwnerSettingsHost>
    </IosTapToPayProvider>
  );
}

export default function RootLayout() {
  React.useEffect(() => {
    void resumeMetaMeasurement();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void resumeMetaMeasurement();
    });
    return () => subscription.remove();
  }, []);
  const [fontsLoaded] = useFonts({
    [appFonts.displayNeon]: Orbitron_700Bold,
    [appFonts.displayFuture]: Orbitron_900Black,
    [appFonts.displayCondensed]: Rajdhani_700Bold,
    [appFonts.displayMinimal]: Rajdhani_500Medium,
    [appFonts.displayPoster]: BebasNeue_400Regular,
    [appFonts.displayEditorial]: PlayfairDisplay_700Bold,
    [appFonts.displayClassic]: PlayfairDisplay_600SemiBold_Italic,
    [appFonts.displayLuxury]: PlayfairDisplay_900Black_Italic,
    [appFonts.displayScript]: GreatVibes_400Regular,
    [appFonts.displayVogue]: PlayfairDisplay_900Black,
    [appFonts.displayAtelier]: PlayfairDisplay_700Bold_Italic,
    [appFonts.displayManrope]: Manrope_700Bold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
    [appFonts.displayMontserrat]: Montserrat_600SemiBold,
    [appFonts.displayCinzel]: Cinzel_600SemiBold,
    [appFonts.displayCormorant]: CormorantGaramond_600SemiBold_Italic,
    [appFonts.displayParisienne]: Parisienne_400Regular,
    [appFonts.displayItaliana]: Italiana_400Regular,
    [appFonts.displayRighteous]: Righteous_400Regular,
    [appFonts.displayAudiowide]: Audiowide_400Regular,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded && Platform.OS !== 'web') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <OwnerBootstrapLoading isSalonEntry={false} />
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
        <UnreadBadgeProvider>
          <ClientNotificationsProvider>
            <AppContent />
            <CustomerPortalAccessGate />
          </ClientNotificationsProvider>
        </UnreadBadgeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  ownerFullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: '#f6f6f3',
  },
  ownerBootstrapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#f6f6f3',
  },
  ownerBootstrapLoadingCard: {
    width: '100%',
    maxWidth: 330,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  ownerBootstrapSpinnerHalo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.09)',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ownerBootstrapSpinnerStage: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerBootstrapSpinnerTrack: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  ownerBootstrapSpinnerRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomColor: 'rgba(10, 10, 11, 0.28)',
    borderRightColor: 'rgba(10, 10, 11, 0.7)',
    borderTopColor: '#0A0A0B',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ownerBootstrapLoadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  ownerBootstrapLoadingTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  ownerBootstrapLoadingSubtitle: {
    color: '#64748b',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
  },
  ownerLogoutTransition: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f6f6f3',
  },
  ownerLogoutTransitionText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});
