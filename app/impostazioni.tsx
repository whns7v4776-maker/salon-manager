import { SettingsWebWorkspace } from '../components/settings-web-workspace';
import { AvailabilitySettingsEntry } from '../components/availability-settings-entry';
import { AppState } from 'react-native';
import { NativeSettingsPopup } from '../components/native-settings-popup';
import { CashTapToPaySetup } from '../components/cash-tap-to-pay-setup';
import { CustomerRegistrationSettingsCard } from '../components/customer-registration-settings-card';
import { OwnerDataLoading, useOwnerDataLoading } from '../components/owner-page-loading';
import { OwnerSettingsBackGesture } from '../components/android-owner-settings-back-gesture';
import { DirectorySettings } from '../components/salon-discovery/directory-settings';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { ModuleHeroHeader } from '../components/module-hero-header';
import { MetaMeasurementLink } from '../components/meta-measurement-link';
import { HapticTouchable } from '../components/ui/haptic-touchable';
import { useAppContext } from '../src/context/AppContext';
import { getAppLanguageOptions, tApp } from '../src/lib/i18n';
import { getNotificationPermissionStatus, requestNotificationPermissionsOnly } from '../src/lib/push/push-notifications';
import {
  getWebNotificationPermissionStatus,
  requestWebNotificationPermission,
} from '../src/lib/push/web-notifications';
import { useResponsiveLayout } from '../src/lib/responsive';
import { supabase } from '../src/lib/supabase';
import { useSalonShortCode } from '../src/lib/salon-short-code';

type SubscriptionDetails = {
  externalSubscriptionId?: string | null;
  founderOfferLocked?: boolean;
  trialUsed?: boolean;
  cancelAtPeriodEnd?: boolean;
};

const IT_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const SERVER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseDateMs = (value?: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const formatShortDate = (value?: string | null) => {
  const time = parseDateMs(value);
  if (!time) return 'Non disponibile';
  return IT_SHORT_DATE_FORMATTER.format(new Date(time));
};

const formatRemainingDays = (value?: string | null) => {
  const time = parseDateMs(value);
  if (!time) return 'Scadenza non disponibile';
  const remainingMs = time - Date.now();
  if (remainingMs <= 0) return 'Scaduto';
  const days = Math.ceil(remainingMs / 86_400_000);
  if (days === 1) return '1 giorno restante';
  return `${days} giorni restanti`;
};

const getSubscriptionSummary = (workspace: {
  subscriptionPlan: string;
  subscriptionStatus: string;
  isInternalTester?: boolean;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
}, details?: SubscriptionDetails | null) => {
  if (workspace.isInternalTester === true) {
    return {
      title: 'Tester interno SalonPro',
      price: 'Accesso gratuito',
      remaining: 'Nessuna scadenza',
      renewal: 'Non è richiesto alcun abbonamento.',
    };
  }

  const now = Date.now();
  const trialEndsAtMs = parseDateMs(workspace.trialEndsAt);
  const subscriptionEndsAtMs = parseDateMs(workspace.subscriptionEndsAt);
  const productId = details?.externalSubscriptionId?.toLowerCase() ?? '';
  const isActive = workspace.subscriptionStatus === 'active';
  const annualLike =
    productId.includes('annual') ||
    productId.includes('yearly') ||
    (subscriptionEndsAtMs !== null && subscriptionEndsAtMs - now > 45 * 86_400_000);
  const founderPrice = details?.founderOfferLocked === true;
  const trialFallbackForExistingAnnualTest =
    annualLike &&
    details?.trialUsed === true &&
    trialEndsAtMs === null &&
    subscriptionEndsAtMs !== null &&
    subscriptionEndsAtMs > now &&
    subscriptionEndsAtMs - now <= 35 * 86_400_000;
  const currentTrialEndsAt =
    trialEndsAtMs !== null
      ? workspace.trialEndsAt
      : trialFallbackForExistingAnnualTest
        ? workspace.subscriptionEndsAt
        : undefined;
  const currentTrialEndsAtMs = parseDateMs(currentTrialEndsAt);
  const trialActive = isActive && currentTrialEndsAtMs !== null && currentTrialEndsAtMs > now;

  if (!isActive) {
    return {
      title:
        workspace.subscriptionStatus === 'expired'
          ? 'Abbonamento scaduto'
          : 'Abbonamento non attivo',
      price: 'Da riattivare',
      remaining: 'Accesso proprietario bloccato finche non viene riattivato.',
      renewal: subscriptionEndsAtMs
        ? `Ultima scadenza: ${formatShortDate(workspace.subscriptionEndsAt)}`
        : '',
    };
  }

  if (trialActive) {
    const nextPrice = annualLike
      ? founderPrice
        ? 'poi 249,99 €/anno'
        : 'poi 299,99 €/anno'
      : founderPrice
        ? 'poi 24,99 €/mese'
        : 'poi 29,99 €/mese';

    return {
      title: annualLike ? 'Mese di prova annuale attivo' : 'Mese di prova mensile attivo',
      price: `30 giorni gratis, ${nextPrice}`,
      remaining: formatRemainingDays(currentTrialEndsAt),
      renewal: details?.cancelAtPeriodEnd
        ? `Rinnovo annullato: accesso fino al ${formatShortDate(currentTrialEndsAt)}`
        : `Fine prova e primo rinnovo: ${formatShortDate(currentTrialEndsAt)}`,
    };
  }

  const planLabel = workspace.subscriptionPlan === 'pro' ? 'SalonPro' : 'Piano attivo';

  return {
    title: annualLike ? `${planLabel} annuale attivo` : `${planLabel} mensile attivo`,
    price: annualLike
      ? founderPrice
        ? '249,99 €/anno'
        : '299,99 €/anno'
      : founderPrice
        ? '24,99 €/mese'
        : '29,99 €/mese',
    remaining: formatRemainingDays(workspace.subscriptionEndsAt),
    renewal: details?.cancelAtPeriodEnd
      ? `Rinnovo annullato: accesso fino al ${formatShortDate(workspace.subscriptionEndsAt)}`
      : `Prossimo rinnovo: ${formatShortDate(workspace.subscriptionEndsAt)}`,
  };
};

export function ImpostazioniScreen({
  onClose,
  embeddedInTabs = false,
  active = true,
}: {
  embeddedInTabs?: boolean;
  onClose?: () => void;
  active?: boolean;
} = {}) {
  const responsive = useResponsiveLayout();
  const accountDataLoading = useOwnerDataLoading();
  const router = useRouter();
  const pathname = usePathname();
  const {
    appLanguage,
    setAppLanguage,
    reopenOnboarding,
    logoutOwnerAccount,
    salonWorkspace,
    salonAccountEmail,
    biometricEnabled,
    biometricAvailable,
    biometricType,
    toggleBiometricEnabled,
  } = useAppContext();
  const [biometricBusy, setBiometricBusy] = React.useState(false);
  const [directoryEnabled, setDirectoryEnabled] = React.useState<boolean | null>(null);
  useFocusEffect(React.useCallback(() => {
    let alive = true;
    setDirectoryEnabled(null);
    void supabase.from('salon_directory_profiles').select('enabled').eq('workspace_id', salonWorkspace.id).maybeSingle().then(({ data, error }) => {
      if (alive && !error) setDirectoryEnabled(data?.enabled ?? true);
    });
    return () => { alive = false; };
  }, [salonWorkspace.id, active]));
  const displaySalonCode = useSalonShortCode(salonWorkspace.salonCode);
  const [googleBookingExpanded, setGoogleBookingExpanded] = React.useState(false);
  const [directoryPopupOpen, setDirectoryPopupOpen] = React.useState(false);
  const publicBookingUrl = `https://salonpro.dev/salone/${encodeURIComponent(displaySalonCode)}`;
  const bookingPreviewUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/salone/${encodeURIComponent(displaySalonCode)}`
    : publicBookingUrl;
  const [bookingLinkFeedback, setBookingLinkFeedback] = React.useState('');
  const copyGoogleBookingLink = async () => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(publicBookingUrl);
        setBookingLinkFeedback('Link copiato. Incollalo nella sezione Prenotazione della scheda Google.');
      } else {
        await Share.share({ message: publicBookingUrl });
      }
    } catch { setBookingLinkFeedback('Copia il link mostrato qui sotto oppure riprova.'); }
  };
  const [notificationPermission, setNotificationPermission] = React.useState<
    'granted' | 'denied' | 'undetermined' | string
  >('undetermined');
  const [subscriptionDetails, setSubscriptionDetails] =
    React.useState<SubscriptionDetails | null>(null);
  const [notificationBusy, setNotificationBusy] = React.useState(false);
  const [logoutTransitioning, setLogoutTransitioning] = React.useState(false);
  const [androidLogoutAwaitingLanding, setAndroidLogoutAwaitingLanding] =
    React.useState(false);

  React.useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !androidLogoutAwaitingLanding ||
      (pathname !== '/welcome' && pathname !== '/')
    ) {
      return;
    }

    setAndroidLogoutAwaitingLanding(false);
    onClose?.();
    setLogoutTransitioning(false);
  }, [androidLogoutAwaitingLanding, onClose, pathname]);

  React.useEffect(() => {
    if (!active && logoutTransitioning) {
      setLogoutTransitioning(false);
    }
  }, [active, logoutTransitioning]);
  const languageOptions = React.useMemo(
    () => getAppLanguageOptions(appLanguage),
    [appLanguage],
  );
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
  const isWeb = Platform.OS === 'web';
  const loggedOutLandingTarget = '/?ownerLoggedOut=1';
  const androidLoggedOutLandingTarget = {
    pathname: '/welcome',
    params: { ownerLoggedOut: '1' },
  } as const;
  const logoutLabel =
    Platform.OS === 'android' && appLanguage === 'it'
      ? 'Esci'
      : tApp(appLanguage, 'common_logout');
  const subscriptionSummary = React.useMemo(
    () =>
      getSubscriptionSummary(
        {
          subscriptionPlan: salonWorkspace.subscriptionPlan,
          subscriptionStatus: salonWorkspace.subscriptionStatus,
          isInternalTester: salonWorkspace.isInternalTester,
          trialEndsAt: salonWorkspace.trialEndsAt,
          subscriptionEndsAt: salonWorkspace.subscriptionEndsAt,
        },
        subscriptionDetails,
      ),
    [
      salonWorkspace.isInternalTester,
      salonWorkspace.subscriptionEndsAt,
      salonWorkspace.subscriptionPlan,
      salonWorkspace.subscriptionStatus,
      salonWorkspace.trialEndsAt,
      subscriptionDetails,
    ],
  );

  const biometricTitle =
    biometricType === 'faceid'
      ? 'Face ID'
      : biometricType === 'fingerprint'
      ? 'Impronta digitale'
      : 'Sblocco biometrico';

  const biometricDescription = isWeb
    ? biometricEnabled
      ? 'L’accesso biometrico risulta attivo sul dispositivo salvato. Sul web puoi solo verificarne lo stato o gestirlo dall’app.'
      : 'Sul web puoi controllare lo stato, ma l’attivazione biometrica vera si completa dall’app iOS/Android del dispositivo.'
    : !isMobile
    ? 'Disponibile solo su app iOS/Android.'
    : !biometricAvailable
    ? 'Configura Face ID o impronta nelle impostazioni del dispositivo per attivarlo.'
    : biometricEnabled
    ? 'Accesso rapido attivo: entrerai direttamente con biometria senza inserire il codice.'
    : 'Attiva l\'accesso biometrico per entrare senza codice.';

  useFocusEffect(React.useCallback(() => {
    let current = true;
    if (active) {
      void (isWeb ? Promise.resolve(getWebNotificationPermissionStatus()) : getNotificationPermissionStatus())
        .then(status => { if (current) setNotificationPermission(status); })
        .catch(() => undefined);
    }
    return () => { current = false; };
  }, [active, isWeb]));

  React.useEffect(() => {
    let mounted = true;
    let interactionTask: ReturnType<
      typeof InteractionManager.runAfterInteractions
    > | null = null;

    const loadNotificationPermission = () => void (async () => {
      try {
        const status = isWeb
          ? getWebNotificationPermissionStatus()
          : await getNotificationPermissionStatus();
        if (mounted) {
          setNotificationPermission(status);
        }
      } catch (error) {
        console.log('Errore lettura permessi notifiche:', error);
      }
    })();

    if (isWeb) {
      loadNotificationPermission();
    } else {
      interactionTask = InteractionManager.runAfterInteractions(
        loadNotificationPermission,
      );
    }

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadNotificationPermission();
    });
    return () => {
      mounted = false;
      interactionTask?.cancel();
      subscription.remove();
    };
  }, [isWeb, active]);

  React.useEffect(() => {
    let mounted = true;
    let interactionTask: ReturnType<
      typeof InteractionManager.runAfterInteractions
    > | null = null;
    const workspaceId = salonWorkspace.id?.trim();

    if (
      !workspaceId ||
      (Platform.OS === 'android' && !SERVER_UUID_PATTERN.test(workspaceId))
    ) {
      setSubscriptionDetails(null);
      return () => {
        mounted = false;
      };
    }

    const loadSubscriptionDetails = () => void (async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('external_subscription_id, founder_offer_locked, trial_used, cancel_at_period_end')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.log('Dettagli abbonamento non disponibili:', error);
        setSubscriptionDetails(null);
        return;
      }

      setSubscriptionDetails({
        externalSubscriptionId:
          typeof data?.external_subscription_id === 'string'
            ? data.external_subscription_id
            : null,
        founderOfferLocked: data?.founder_offer_locked === true,
        trialUsed: data?.trial_used === true,
        cancelAtPeriodEnd: data?.cancel_at_period_end === true,
      });
    })();

    if (isWeb) {
      loadSubscriptionDetails();
    } else {
      interactionTask = InteractionManager.runAfterInteractions(
        loadSubscriptionDetails,
      );
    }

    return () => {
      mounted = false;
      interactionTask?.cancel();
    };
  }, [isWeb, salonWorkspace.id]);

  const handleBack = React.useCallback(() => {
    Haptics.selectionAsync().catch(() => null);

    if (onClose) {
      onClose();
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)');
  }, [onClose, router]);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    const title =
      Platform.OS === 'android' && appLanguage === 'it'
        ? 'Esci dal salone'
        : tApp(appLanguage, 'settings_logout_confirm_title');
    const body = tApp(appLanguage, 'settings_logout_confirm_body');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(`${title}\n\n${body}`);
      if (!confirmed) return;
      void (async () => {
        try {
          await logoutOwnerAccount();
          if (typeof window.location?.replace === 'function') {
            window.location.replace('/?ownerLoggedOut=1');
          }
        } catch (error) {
          console.log('Logout sospeso per salvataggio dati non riuscito:', error);
          window.alert(
            'Non posso uscire finché i dati del salone non sono salvati sul server. Controlla la connessione e riprova.'
          );
        }
      })();
      return;
    }

    Alert.alert(title, body, [
      { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
      {
        text: logoutLabel,
        style: 'destructive',
        onPress: () => {
          setLogoutTransitioning(true);
          void (async () => {
            try {
              await logoutOwnerAccount();
              if (Platform.OS === 'android') {
                // Root auth navigation owns the redirect after logout. A second
                // replace here races with native screen removal in Fabric.
                return;
              }
              onClose?.();
              router.replace(loggedOutLandingTarget);
            } catch (error) {
              setAndroidLogoutAwaitingLanding(false);
              console.log('Logout sospeso per salvataggio dati non riuscito:', error);
              setLogoutTransitioning(false);
              Alert.alert(
                'Dati non ancora salvati',
                'Non posso uscire finché i dati del salone non sono confermati dal server. Controlla la connessione e riprova.'
              );
            }
          })();
        },
      },
    ]);
  };

  const handleToggleBiometric = React.useCallback(async () => {
    if (biometricBusy) return;

    if (isWeb) {
      Alert.alert(
        'Sblocco biometrico',
        biometricEnabled
          ? 'Sul web non posso gestire direttamente Face ID o impronta. L’accesso biometrico va modificato dall’app installata sul dispositivo.'
          : 'Per attivare Face ID o impronta devi usare l’app installata su iPhone o Android. Qui sul web puoi solo controllare lo stato.'
      );
      return;
    }

    if (!isMobile) {
      Alert.alert('Sblocco biometrico', 'Disponibile solo su iOS e Android.');
      return;
    }

    if (biometricEnabled) {
      setBiometricBusy(true);
      await toggleBiometricEnabled(false);
      setBiometricBusy(false);
      Haptics.selectionAsync().catch(() => null);
      return;
    }

    if (!biometricAvailable) {
      Alert.alert(
        'Sblocco biometrico',
        'Configura Face ID o impronta nelle impostazioni del dispositivo e riprova.'
      );
      return;
    }

    setBiometricBusy(true);
    const result = await toggleBiometricEnabled(true);
    setBiometricBusy(false);
    if (!result.ok) {
      if (result.error) {
        Alert.alert('Sblocco biometrico', result.error);
      }
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
  }, [
    biometricAvailable,
    biometricBusy,
    biometricEnabled,
    isWeb,
    isMobile,
    toggleBiometricEnabled,
  ]);

  const notificationTitle = !isMobile && !isWeb
    ? 'Notifiche push'
    : isWeb && notificationPermission === 'granted'
    ? 'Notifiche browser attive'
    : isWeb
    ? 'Attiva notifiche browser'
    : notificationPermission === 'granted'
    ? 'Notifiche attive'
    : 'Attiva notifiche';

  const notificationDescription = !isMobile && !isWeb
    ? 'Disponibile solo su app iOS/Android.'
    : isWeb && notificationPermission === 'granted'
    ? 'Il browser può mostrarti notifiche live per prenotazioni, annullamenti e slot liberati.'
    : isWeb && notificationPermission === 'denied'
    ? 'Il browser ha bloccato le notifiche. Riattivale dalle impostazioni del sito o del browser.'
    : isWeb
    ? 'Tocca qui per far comparire il popup del browser e attivare gli avvisi live sul web.'
    : notificationPermission === 'granted'
    ? 'Il permesso notifiche del dispositivo è attivo per questa installazione.'
    : notificationPermission === 'denied'
    ? 'Le notifiche sono bloccate. Tocca qui per aprire le impostazioni del telefono.'
    : 'Tocca qui per far comparire il popup Consenti notifiche.';

  const handleNotificationsPermission = React.useCallback(async () => {
    if ((!isMobile && !isWeb) || notificationBusy) {
      return;
    }

    setNotificationBusy(true);
    try {
      if (isWeb) {
        const status = await requestWebNotificationPermission();
        setNotificationPermission(status);

        if (status === 'granted') {
          Alert.alert(
            'Notifiche browser attive',
            'Le notifiche web sono attive. Se il browser era aperto da tempo, ricarica una volta la pagina per riallineare il service state.'
          );
          return;
        }

        if (status === 'denied') {
          Alert.alert(
            'Notifiche bloccate',
            'Il browser ha bloccato il permesso. Riattivalo dalle impostazioni del sito.'
          );
        }
        return;
      }

      if (notificationPermission === 'denied') {
        await Linking.openSettings();
        return;
      }

      const status = await requestNotificationPermissionsOnly();
      setNotificationPermission(status);

      if (status === 'granted') {
        Alert.alert(
          'Notifiche attive',
          Constants.executionEnvironment === 'storeClient'
            ? 'Il permesso notifiche di Expo Go è attivo. Le notifiche locali ora possono comparire.'
            : 'Il permesso notifiche è attivo su questa app.'
        );
        return;
      }

      if (status === 'denied') {
        Alert.alert(
          'Notifiche bloccate',
          'Hai negato il permesso. Puoi riattivarlo dalle impostazioni del telefono.'
        );
      }
    } catch (error) {
      console.log('Errore richiesta permessi notifiche:', error);
      Alert.alert('Notifiche', 'Non sono riuscito ad aprire la richiesta notifiche.');
    } finally {
      setNotificationBusy(false);
    }
  }, [isMobile, isWeb, notificationBusy, notificationPermission]);

  if (isWeb) return <OwnerDataLoading loading={accountDataLoading} lines={6}><SettingsWebWorkspace active={active}
    language={appLanguage} languageOptions={languageOptions} onLanguage={setAppLanguage}
    biometric={{title:biometricTitle,description:biometricDescription,enabled:biometricEnabled,busy:biometricBusy,onPress:()=>{void handleToggleBiometric();}}}
    notifications={{title:notificationTitle,description:notificationDescription,enabled:notificationPermission==='granted',busy:notificationBusy,onPress:()=>{void handleNotificationsPermission();}}}
    subscription={subscriptionSummary} salonCode={displaySalonCode}
    google={{url:publicBookingUrl,previewUrl:bookingPreviewUrl,feedback:bookingLinkFeedback,onCopy:()=>{void copyGoogleBookingLink();}}}
    onGuide={()=>{reopenOnboarding();onClose?.();}}
    onLogout={async()=>{await logoutOwnerAccount();window.location.replace('/?ownerLoggedOut=1');}}
  /></OwnerDataLoading>;

  if (!isWeb) return <OwnerDataLoading loading={accountDataLoading} lines={6}><SettingsWebWorkspace active={active}
    language={appLanguage} languageOptions={languageOptions} onLanguage={setAppLanguage}
    biometric={{title:biometricTitle,description:biometricDescription,enabled:biometricEnabled,busy:biometricBusy,onPress:()=>{void handleToggleBiometric();}}}
    notifications={{title:notificationTitle,description:notificationDescription,enabled:notificationPermission==='granted',busy:notificationBusy,onPress:()=>{void handleNotificationsPermission();}}}
    subscription={subscriptionSummary} salonCode={displaySalonCode}
    google={{url:publicBookingUrl,previewUrl:bookingPreviewUrl,feedback:bookingLinkFeedback,onCopy:()=>{void copyGoogleBookingLink();}}}
    onGuide={()=>{reopenOnboarding();onClose?.();}}
    onLogout={async()=>{handleLogout();}}
  /></OwnerDataLoading>;

  if (logoutTransitioning && Platform.OS !== 'android') {
    return <View style={styles.container} />;
  }

  const SettingsShell = embeddedInTabs ? React.Fragment : OwnerSettingsBackGesture;
  return (
    <SettingsShell {...(embeddedInTabs ? {} : {onBack: handleBack, busy: logoutTransitioning}) as any}>
    <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          embeddedInTabs && { paddingBottom: 120 },
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
          {Platform.OS !== 'web' ? <AvailabilitySettingsEntry description onPress={()=>router.navigate({pathname:'/(tabs)/agenda',params:{availabilityToken:String(Date.now()),availabilityFrom:'settings'}})}/>:null}
          <View style={[styles.heroCard, embeddedInTabs && { paddingTop: 0 }]}>
            {embeddedInTabs ? <ModuleHeroHeader moduleKey="settings" title="Impostazioni" salonName={salonWorkspace.salonName} /> : <View style={styles.topActionsRow}>
              {!embeddedInTabs ? <HapticTouchable
                style={styles.headerBackButton}
                onPress={handleBack}
                hapticType="none"
                pressInHapticType="light"
                activeOpacity={0.9}
              >
                <Ionicons name="chevron-back" size={24} color="#0F172A" />
              </HapticTouchable> : <View style={styles.headerRightSpacer} />}

              <View style={styles.headerTitleWrap} pointerEvents="none">
                <AppWordmark compact={embeddedInTabs} />
              </View>

              <View style={styles.headerRightSpacer} />
            </View>}

          <View style={styles.heroAccountContent}>
            <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_active_account')}</Text>
            <OwnerDataLoading loading={accountDataLoading} lines={5}>
            <Text style={styles.cardText}>{salonWorkspace.ownerEmail || salonAccountEmail}</Text>
            <Text style={styles.cardHint}>
              Salone: {salonWorkspace.salonName.trim() || 'Salon Pro'}
            </Text>
            <Text style={styles.cardHint}>
              Codice salone: {displaySalonCode.trim() || 'Non disponibile'}
            </Text>
            <Text style={styles.cardHint}>
              {tApp(appLanguage, 'settings_workspace')}: {salonWorkspace.id}
            </Text>
            <View style={styles.subscriptionPanel}>
              <View
                style={[
                  styles.subscriptionHeaderRow,
                  isWeb && styles.subscriptionHeaderRowWeb,
                ]}
              >
                <View style={styles.subscriptionIcon}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#0F766E" />
                </View>
                <View
                  style={[
                    styles.subscriptionTextWrap,
                    isWeb && styles.subscriptionTextWrapWeb,
                  ]}
                >
                  <Text style={styles.subscriptionTitle}>{subscriptionSummary.title}</Text>
                  <Text style={styles.subscriptionPrice}>{subscriptionSummary.price}</Text>
                </View>
              </View>
              <View style={styles.subscriptionDivider} />
              <View style={[styles.subscriptionMetaRow, isWeb && styles.subscriptionMetaRowWeb]}>
                <Text style={[styles.subscriptionMetaLabel, isWeb && styles.subscriptionMetaTextWeb]}>Tempo residuo</Text>
                <Text style={[styles.subscriptionMetaValue, isWeb && styles.subscriptionMetaValueWeb]}>{subscriptionSummary.remaining}</Text>
              </View>
              {subscriptionSummary.renewal ? (
                <View style={[styles.subscriptionMetaRow, isWeb && styles.subscriptionMetaRowWeb]}>
                  <Text style={[styles.subscriptionMetaLabel, isWeb && styles.subscriptionMetaTextWeb]}>Scadenza</Text>
                  <Text style={[styles.subscriptionMetaValue, isWeb && styles.subscriptionMetaValueWeb]}>{subscriptionSummary.renewal}</Text>
                </View>
              ) : null}
            </View>
            </OwnerDataLoading>
          </View>
          </View>

          <CashTapToPaySetup />
          <CustomerRegistrationSettingsCard />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_language_title')}</Text>
            <Text style={styles.cardHint}>
              {tApp(appLanguage, 'settings_language_hint')}
            </Text>

            <View style={styles.languageRow}>
              {languageOptions.map((option) => {
                const selected = appLanguage === option.value;

                return (
                  <HapticTouchable
                    key={option.value}
                    style={[styles.languageChip, selected && styles.languageChipActive]}
                    onPress={() => setAppLanguage(option.value)}
                    hapticType="none"
                    pressInHapticType="light"
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.languageChipText,
                        selected && styles.languageChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.languageChipNote,
                        selected && styles.languageChipNoteActive,
                      ]}
                    >
                      {option.note}
                    </Text>
                  </HapticTouchable>
                );
              })}
            </View>

            <HapticTouchable
              style={[
                styles.biometricRow,
                biometricEnabled && styles.biometricRowActive,
                biometricBusy && styles.cardDisabled,
              ]}
              onPress={handleToggleBiometric}
              hapticType="none"
              pressInHapticType="light"
              activeOpacity={0.9}
              disabled={biometricBusy}
            >
              <View style={styles.biometricContent}>
                <Text style={styles.biometricTitle}>{biometricTitle}</Text>
                <Text style={styles.biometricText}>{biometricDescription}</Text>
              </View>

              <View style={[styles.biometricToggle, biometricEnabled && styles.biometricToggleActive]}>
                <View
                  style={[
                    styles.biometricToggleKnob,
                    biometricEnabled && styles.biometricToggleKnobActive,
                  ]}
                />
                <Text
                  style={[
                    styles.biometricToggleText,
                    biometricEnabled && styles.biometricToggleTextActive,
                  ]}
                >
                  {biometricEnabled ? 'ON' : 'OFF'}
                </Text>
              </View>
            </HapticTouchable>

            <HapticTouchable
              style={[
                styles.biometricRow,
                notificationPermission === 'granted' && styles.biometricRowActive,
                ((!isMobile && !isWeb) || notificationBusy) && styles.cardDisabled,
              ]}
              onPress={handleNotificationsPermission}
              hapticType="none"
              pressInHapticType="light"
              activeOpacity={0.9}
              disabled={notificationBusy || (!isMobile && !isWeb)}
            >
              <View style={styles.biometricContent}>
                <Text style={styles.biometricTitle}>{notificationTitle}</Text>
                <Text style={styles.biometricText}>{notificationDescription}</Text>
              </View>

              <View
                style={[
                  styles.biometricToggle,
                  notificationPermission === 'granted' && styles.biometricToggleActive,
                ]}
              >
                <View
                  style={[
                    styles.biometricToggleKnob,
                    notificationPermission === 'granted' && styles.biometricToggleKnobActive,
                  ]}
                />
                <Text
                  style={[
                    styles.biometricToggleText,
                    notificationPermission === 'granted' && styles.biometricToggleTextActive,
                  ]}
                >
                  {notificationPermission === 'granted' ? 'ON' : 'OFF'}
                </Text>
              </View>
            </HapticTouchable>
          </View>

          {Platform.OS !== 'web' ? (
          <View style={[styles.card, styles.googleBookingCard]}>
          <HapticTouchable accessibilityRole="button" accessibilityLabel="Gestisci la tua vetrina su SalonPro" accessibilityState={{ expanded: directoryPopupOpen }} immediatePress onPress={() => setDirectoryPopupOpen(current => !current)}>
            <View style={styles.discoveryHeader}>
              <View style={styles.discoveryTitleRow}><Ionicons name="storefront-outline" size={25} color="#334155" /><Text style={styles.googleBookingTitle}>La tua vetrina su SalonPro</Text></View>
              <Text style={styles.googleBookingBody}>Entra nel mondo dei saloni SalonPro: mostra foto, insegna e posizione e fatti trovare dai clienti.</Text>
              {directoryEnabled !== null && <Text style={{ alignSelf: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, fontWeight: '700', backgroundColor: directoryEnabled ? '#EAF6EF' : '#F1F3F6', color: directoryEnabled ? '#26734D' : '#64748B' }}>{directoryEnabled ? 'Attivata' : 'Disattivata'}</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
                <Text style={[styles.discoveryActionText, { flex: 1, textAlign: 'left' }]}>Gestisci la tua presenza su SalonPro</Text>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={directoryPopupOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#334B65" />
                </View>
              </View>
            </View>
          </HapticTouchable>
          {directoryPopupOpen ? <NativeSettingsPopup title="La tua vetrina SalonPro" icon="storefront-outline" onClose={() => setDirectoryPopupOpen(false)}><DirectorySettings key={salonWorkspace.id} workspace={salonWorkspace} /></NativeSettingsPopup> : null}
          </View>
          ) : (
          <HapticTouchable accessibilityRole="button" onPress={() => router.push('/vetrina-salone' as never)} style={[styles.card, styles.googleBookingCard]}>
            <View style={styles.discoveryHeader}>
              <View style={styles.discoveryTitleRow}><Ionicons name="storefront-outline" size={25} color="#334155" /><Text style={styles.googleBookingTitle}>La tua vetrina su SalonPro</Text></View>
              <Text style={styles.googleBookingBody}>Entra nel mondo dei saloni SalonPro: mostra foto, insegna e posizione e fatti trovare dai clienti.</Text>
              <Text style={styles.discoveryActionText}>Gestisci la tua presenza su SalonPro</Text>
              {directoryEnabled !== null && <Text style={{ alignSelf: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, fontWeight: '700', backgroundColor: directoryEnabled ? '#EAF6EF' : '#F1F3F6', color: directoryEnabled ? '#26734D' : '#64748B' }}>{directoryEnabled ? 'Attivata' : 'Disattivata'}</Text>}
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </View>
          </HapticTouchable>
          )}

          <View style={[styles.card, styles.googleBookingCard]}>
            <HapticTouchable accessibilityRole="button" accessibilityLabel="Il tuo salone su Google" accessibilityState={{ expanded: googleBookingExpanded }} onPress={() => setGoogleBookingExpanded(current => !current)} style={styles.discoveryHeader}>
              <View style={styles.discoveryTitleRow}><Ionicons name="calendar-outline" size={25} color="#334155" /><Text style={styles.googleBookingTitle}>Il tuo salone su Google</Text></View>
              <Text style={styles.googleBookingBody}>Aggiungi il link di prenotazione SalonPro alla scheda Google del tuo salone.</Text>
              {Platform.OS !== 'web' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
                  <Text style={[styles.discoveryActionText, { flex: 1, textAlign: 'left' }]}>Scopri come collegare la scheda Google</Text>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={googleBookingExpanded ? 'chevron-up' : 'chevron-down'} size={22} color="#334B65" />
                  </View>
                </View>
              ) : <>
                <Text style={styles.discoveryActionText}>{googleBookingExpanded ? 'Nascondi la guida per Google' : 'Scopri come collegare la scheda Google'}</Text>
                <Ionicons name={googleBookingExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
              </>}
            </HapticTouchable>
            {googleBookingExpanded ? <NativeSettingsPopup title="Il tuo salone su Google" icon="calendar-outline" onClose={() => setGoogleBookingExpanded(false)}><View style={{ gap: 18, width: '100%' }}>
            <View style={styles.googleBookingLinkPanel}>
              <View style={styles.googleBookingLinkHeading}>
                <Ionicons name="link-outline" size={17} color="#64748b" />
                <Text style={styles.googleBookingLinkLabel}>LINK DEL TUO SALONE</Text>
              </View>
              <Text selectable style={styles.googleBookingUrl}>{salonWorkspace.salonCode ? publicBookingUrl : 'Disponibile dopo la configurazione del salone'}</Text>
            </View>
            <View style={styles.googleBookingActions}>
              <HapticTouchable accessibilityRole="button" disabled={!salonWorkspace.salonCode} style={[styles.googleBookingAction, styles.googleBookingPrimary, !salonWorkspace.salonCode && { opacity: 0.4 }]} onPress={copyGoogleBookingLink}>
                <Ionicons name={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={18} color="#fff" />
                <Text style={styles.googleBookingPrimaryText}>{Platform.OS === 'web' ? 'Copia link per Google' : 'Condividi link'}</Text>
              </HapticTouchable>
              <HapticTouchable accessibilityRole="button" accessibilityLabel="Apri anteprima della pagina del salone" disabled={!salonWorkspace.salonCode} style={[styles.googleBookingAction, styles.googleBookingSecondary, !salonWorkspace.salonCode && { opacity: 0.4 }]} onPress={() => Linking.openURL(bookingPreviewUrl)}>
                <Ionicons name="open-outline" size={18} color="#334155" />
                <Text style={styles.googleBookingSecondaryText}>Anteprima</Text>
              </HapticTouchable>
            </View>
            <View style={styles.googleBookingInstructions}>
              <Text style={styles.googleBookingInstructionsTitle}>Collegalo in tre passaggi</Text>
              {[
                ['Apri la scheda Google', 'Accedi con l’account che gestisce il salone.'],
                ['Vai su Prenotazione', 'Seleziona “Aggiungi link”.'],
                ['Incolla il link e salva', 'Google lo verifica prima di mostrarlo.'],
              ].map(([title, detail], index) => <View key={title} style={styles.googleBookingStep}>
                <View style={styles.googleBookingStepNumber}><Text style={styles.googleBookingStepNumberText}>{index + 1}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={styles.googleBookingStepTitle}>{title}</Text>
                  <Text style={styles.googleBookingStepDetail}>{detail}</Text>
                </View>
              </View>)}
            </View>
            {!!bookingLinkFeedback && <Text accessibilityLiveRegion="polite" style={styles.googleBookingFeedback}>{bookingLinkFeedback}</Text>}
            </View></NativeSettingsPopup> : null}
          </View>

          <View style={[styles.card, styles.guideShowcaseCard]}>
            <View style={styles.guideHeroCard}>
              <Text style={styles.guideHeroEyebrow}>SALONPRO</Text>
              <Text style={styles.guideHeroTitle}>Guida SalonPro</Text>
              <Text style={styles.guideHeroText}>
                Rivedi la guida completa: servizi, mestieri, operatori, clienti, personalizzazioni, QR e codice salone, Agenda, orari e richieste online. Puoi saltarla in qualsiasi momento.
              </Text>

              <View style={styles.guideHeroActions}>
                <HapticTouchable
                  style={styles.guidePrimaryButton}
                  onPress={() => {
                    reopenOnboarding();
                    if (onClose) {
                      onClose();
                    } else {
                      router.replace('/(tabs)');
                    }
                  }}
                  hapticType="none"
                  pressInHapticType="light"
                  activeOpacity={0.9}
                >
                  <Ionicons name="play-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.guidePrimaryButtonText}>Riapri la guida</Text>
                </HapticTouchable>

                <View style={styles.guideStatusPill}>
                  <Ionicons name="sparkles" size={14} color="#0F172A" />
                  <Text style={styles.guideStatusPillText}>Passo dopo passo</Text>
                </View>
              </View>
            </View>

          </View>

          <MetaMeasurementLink />
          <View style={[styles.card, styles.logoutCard]}>
            <HapticTouchable
              style={styles.logoutButton}
              onPress={handleLogout}
              hapticType="none"
              pressInHapticType="medium"
              activeOpacity={0.9}
            >
              <Text style={styles.logoutButtonText}>{logoutLabel}</Text>
            </HapticTouchable>
            <Text style={styles.logoutHint}>
              Esci completamente dal back office del salone e torna alla schermata principale.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SettingsShell>
  );
}

export default ImpostazioniScreen;

const styles = StyleSheet.create({
  googleBookingCard: { padding: 22, gap: 18, borderWidth: 1, borderColor: '#e6eaf0', alignItems: 'stretch' },
  discoveryHeader: { alignItems: 'center', gap: 9, width: '100%' },
  discoveryTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, maxWidth: '100%' },
  discoveryActionText: { color: '#2459a8', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  googleBookingHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  googleBookingIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  googleBookingEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.3, color: '#748196' },
  googleBookingTitle: { textAlign: 'center', flexShrink: 1, fontSize: 23, lineHeight: 29, fontWeight: '800', color: '#182033' },
  googleBookingBody: { textAlign: 'center', fontSize: 14, lineHeight: 22, color: '#64748b' },
  googleBookingLinkPanel: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e8edf3', padding: 16, borderRadius: 16, gap: 8 },
  googleBookingLinkHeading: { justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 },
  googleBookingLinkLabel: { color: '#748196', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  googleBookingUrl: { textAlign: 'center', color: '#334155', fontSize: 14, lineHeight: 22, flexShrink: 1 },
  googleBookingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  googleBookingAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, minHeight: 48, paddingVertical: 13, paddingHorizontal: 16, flexGrow: 1 },
  googleBookingPrimary: { backgroundColor: '#182033' },
  googleBookingSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e6ee' },
  googleBookingPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  googleBookingSecondaryText: { textAlign: 'center', flexShrink: 1, color: '#334155', fontSize: 13, fontWeight: '700' },
  googleBookingInstructions: { borderTopWidth: 1, borderTopColor: '#edf0f5', paddingTop: 18, gap: 16 },
  googleBookingInstructionsTitle: { textAlign: 'center', color: '#334155', fontSize: 14, fontWeight: '700' },
  googleBookingStep: { flexDirection: 'column', alignItems: 'center', gap: 12 },
  googleBookingStepNumber: { width: 27, height: 27, borderRadius: 9, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  googleBookingStepNumberText: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  googleBookingStepTitle: { textAlign: 'center', color: '#334155', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  googleBookingStepDetail: { textAlign: 'center', color: '#748196', fontSize: 12, lineHeight: 18 },
  googleBookingFeedback: { textAlign: 'center', color: '#475569', fontSize: 13, lineHeight: 20, backgroundColor: '#f1f5f9', padding: 12, borderRadius: 12 },

  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  androidLogoutScreen: {
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidLogoutCard: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 28,
    paddingVertical: 30,
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 5,
  },
  androidLogoutIcon: {
    width: 52,
    height: 52,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
  },
  androidLogoutTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  androidLogoutHint: {
    marginTop: 7,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  content: {
    paddingTop: Platform.OS === 'web' ? 8 : 54,
    paddingBottom: 128,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  topActionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerBackButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 9,
  },
  headerRightSpacer: {
    width: 52,
    height: 52,
    zIndex: 1,
  },
  heroAccountContent: {
    alignItems: 'center',
    paddingTop: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  screenBrandChip: {
    maxWidth: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  screenBrandChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  cardDisabled: {
    opacity: 0.55,
  },
  subscriptionPanel: {
    width: '100%',
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 14,
  },
  subscriptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscriptionHeaderRowWeb: {
    justifyContent: 'center',
  },
  subscriptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionTextWrap: {
    flex: 1,
  },
  subscriptionTextWrapWeb: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    width: 'auto',
  },
  subscriptionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  subscriptionPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
  },
  subscriptionDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginVertical: 12,
  },
  subscriptionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 6,
  },
  subscriptionMetaLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  subscriptionMetaValue: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  subscriptionMetaRowWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
  },
  subscriptionMetaTextWeb: {
    textAlign: 'center',
  },
  subscriptionMetaValueWeb: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    width: 'auto',
    textAlign: 'center',
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
      } as any,
    }),
  },
  languageRow: {
    marginTop: 14,
  },
  biometricRow: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: '#F8FAFC',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  biometricContent: {
    flex: 1,
    maxWidth: 220,
    alignItems: 'center',
  },
  biometricRowActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  biometricTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  biometricText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    maxWidth: 210,
    textAlign: 'center',
  },
  biometricToggle: {
    width: 78,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  biometricToggleActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  biometricToggleKnob: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  biometricToggleKnobActive: {
    alignSelf: 'flex-end',
  },
  biometricToggleText: {
    position: 'absolute',
    left: 36,
    right: 7,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0,
  },
  biometricToggleTextActive: {
    left: 7,
    right: 36,
    color: '#FFFFFF',
  },
  permissionBadge: {
    minWidth: 56,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  permissionBadgeActive: {
    backgroundColor: '#0F172A',
  },
  permissionBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.8,
  },
  permissionBadgeTextActive: {
    color: '#FFFFFF',
  },
  permissionHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
    textAlign: 'center',
  },
  languageChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 14,
    marginBottom: 10,
  },
  languageChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  languageChipText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  languageChipTextActive: {
    color: '#ffffff',
  },
  languageChipNote: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  languageChipNoteActive: {
    color: '#cbd5e1',
  },
  secondaryActionButton: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    minWidth: 260,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
  },
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  guideShowcaseCard: {
    overflow: 'hidden',
  },
  guideHeroCard: {
    width: '100%',
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#EAF6FF',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.22)',
    marginBottom: 14,
    shadowColor: '#60A5FA',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  guideHeroEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#2563EB',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  guideHeroTitle: {
    fontSize: 29,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  guideHeroText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
  },
  guideHeroActions: {
    marginTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  guidePrimaryButton: {
    minWidth: 230,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  guidePrimaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  guideStatusPill: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guideStatusPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  logoutCard: {
    alignItems: 'center',
  },
  logoutButton: {
    minWidth: 160,
    backgroundColor: '#fff1f2',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fecdd3',
  },
  logoutButtonText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#be123c',
  },
  logoutHint: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 560,
  },

});
