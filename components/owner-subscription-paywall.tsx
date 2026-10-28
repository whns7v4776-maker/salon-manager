import { useOwnerPaywallPremiumStyles } from './owner-paywall-premium-styles';
import { useAccessAppearance } from './access-premium';
import { SkeletonShimmer } from './ui/skeleton-shimmer';
import { GutterScrollView } from './ui/gutter-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { withClientDeadline } from '../src/lib/client-request-deadline';
import { ActivityIndicator, Alert, AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "./ui/ios-simple-touchable";
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesPackage,
} from 'react-native-purchases';
import { useAppContext } from '../src/context/AppContext';
import {
  configureRevenueCat,
  getActiveProEntitlement,
  getRevenueCatAppUserId,
  getRevenueCatCustomerInfo,
  getRevenueCatTrialEligibility,
  getSalonProOfferings,
  getSalonProPackages,
  hasActiveProEntitlement,
  isRevenueCatSupportedPlatform,
  purchaseSalonProPackage,
  restoreSalonProPurchases,
  selectSalonProOfferingById,
  REVENUECAT_FOUNDER_OFFERING_ID,
  REVENUECAT_STANDARD_OFFERING_ID,
  SALON_PRO_FOUNDER_PRICE_LABEL,
  SALON_PRO_FOUNDER_LIMIT,
  SALON_PRO_FOUNDER_YEARLY_PRICE_LABEL,
  SALON_PRO_FULL_PRICE_LABEL,
  SALON_PRO_FULL_YEARLY_PRICE_LABEL,
} from '../src/lib/revenuecat';
import { supabase } from '../src/lib/supabase';

const salonProLogo = require('../assets/images/salon-pro-logo-ui.png');

const getFounderDisplayPrice = (
  _purchasePackage: PurchasesPackage | null,
  fallbackLabel: string
) => {
  // SalonPro comunica il listino italiano in euro. Il prezzo localizzato dello
  // storefront (per esempio un account TestFlight USA) non deve sostituire il
  // listino mostrato nel paywall italiano.
  return fallbackLabel;
};

const getPurchaseFeedbackMessage = (error: unknown) => {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  if (
    /invalid.?receipt|receipt is not valid|missing in the receipt|missing receipt|storekit/i.test(
      message
    )
  ) {
    return 'Apple non ha completato correttamente la ricevuta. Nessun piano è stato attivato: riprova tra poco oppure usa “Ripristina acquisto” se il pagamento risulta già completato.';
  }

  if (/network|offline|internet|connection|timeout/i.test(message)) {
    return 'Connessione allo store non disponibile. Controlla internet e riprova tra poco.';
  }

  return 'Acquisto non completato. Riprova tra poco.';
};

type LaunchOfferStatus = {
  founderLimit: number;
  founderUsed: number;
  founderRemaining: number;
  founderAvailable: boolean;
  offeringId: string;
};

const defaultLaunchOfferStatus: LaunchOfferStatus = {
  founderLimit: SALON_PRO_FOUNDER_LIMIT,
  founderUsed: 0,
  founderRemaining: SALON_PRO_FOUNDER_LIMIT,
  founderAvailable: true,
  offeringId: REVENUECAT_FOUNDER_OFFERING_ID,
};

const parseAccessDateMs = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const SAME_TRIAL_EXPIRATION_TOLERANCE_MS = 5 * 60 * 1000;

const normalizeLaunchOfferStatus = (value: unknown): LaunchOfferStatus => {
  const record = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined;
  if(!record || typeof record.founder_available!=='boolean' || !Number.isFinite(record.founder_used) || !Number.isFinite(record.founder_limit)){
    throw new Error('Stato offerta non valido');
  }
  const founderLimit = Number(record?.founder_limit ?? SALON_PRO_FOUNDER_LIMIT);
  const founderUsed = Number(record?.founder_used ?? 0);
  const founderRemaining = Number(record?.founder_remaining ?? Math.max(0, founderLimit - founderUsed));
  const founderAvailable =
    typeof record?.founder_available === 'boolean'
      ? record.founder_available && founderUsed < founderLimit
      : founderUsed < founderLimit;
  const offeringId = founderAvailable
        ? REVENUECAT_FOUNDER_OFFERING_ID
        : REVENUECAT_STANDARD_OFFERING_ID;

  return {
    founderLimit: Number.isFinite(founderLimit) ? founderLimit : SALON_PRO_FOUNDER_LIMIT,
    founderUsed: Number.isFinite(founderUsed) ? founderUsed : 0,
    founderRemaining: Number.isFinite(founderRemaining) ? Math.max(0, founderRemaining) : 0,
    founderAvailable,
    offeringId,
  };
};

export function OwnerSubscriptionPaywall({ onDevContinue, onActivationTransition }: { onDevContinue?: () => void | Promise<void>; onActivationTransition?: (active: boolean) => void }) {
  const {palette:paywallInk}=useAccessAppearance();
  const styles=useOwnerPaywallPremiumStyles(basePaywallStyles);
  const {
    salonWorkspace,
    setSalonWorkspace,
    salonAccountEmail,
    refreshOwnerSubscriptionFromServer,
    logoutOwnerAccount,
  } = useAppContext();
  const [configured, setConfigured] = React.useState(false);
  const purchaseInFlight=React.useRef(false);
  React.useEffect(() => () => onActivationTransition?.(false), [onActivationTransition]);
  const confirmActivation = async (message: string) => {
    if (Platform.OS === 'web') { Alert.alert('SalonPro attivo', message); return; }
    await new Promise<void>(resolve => {
      Alert.alert('SalonPro attivo', message, [{ text: 'Continua', onPress: () => resolve() }], { cancelable: false });
    });
  };
  const [configurationIssue, setConfigurationIssue] = React.useState('');
  const [monthlyPackage, setMonthlyPackage] = React.useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = React.useState<PurchasesPackage | null>(null);
  const [standardMonthlyPackage, setStandardMonthlyPackage] =
    React.useState<PurchasesPackage | null>(null);
  const [standardAnnualPackage, setStandardAnnualPackage] =
    React.useState<PurchasesPackage | null>(null);
  const [selectedBillingPeriod, setSelectedBillingPeriod] = React.useState<'annual' | 'monthly'>(
    'monthly'
  );
  const [launchOfferStatus, setLaunchOfferStatus] =
    React.useState<LaunchOfferStatus>(defaultLaunchOfferStatus);
  const [loading, setLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<'purchase' | 'restore' | 'logout' | null>(null);
  const [feedback, setFeedback] = React.useState('');
  const [trialEligibility, setTrialEligibility] = React.useState<Record<string, boolean>>({});
  const logoutNavigationStartedRef = React.useRef(false);

  const appUserId = React.useMemo(
    () => getRevenueCatAppUserId(salonWorkspace.id, salonAccountEmail || salonWorkspace.ownerEmail),
    [salonAccountEmail, salonWorkspace.id, salonWorkspace.ownerEmail]
  );
  const founderOfferAvailable = launchOfferStatus.founderAvailable;
  const now = Date.now();
  const subscriptionEndsAtMs = parseAccessDateMs(salonWorkspace.subscriptionEndsAt);
  const trialEndsAtMs = parseAccessDateMs(salonWorkspace.trialEndsAt);
  const expiredByDate =
    salonWorkspace.subscriptionStatus === 'active' &&
    subscriptionEndsAtMs !== null &&
    subscriptionEndsAtMs <= now;
  const accessExpired = salonWorkspace.subscriptionStatus === 'expired' || expiredByDate;
  const trialJustExpired =
    accessExpired &&
    trialEndsAtMs !== null &&
    subscriptionEndsAtMs !== null &&
    Math.abs(trialEndsAtMs - subscriptionEndsAtMs) <= SAME_TRIAL_EXPIRATION_TOLERANCE_MS;
  const activationRequired =
    salonWorkspace.subscriptionStatus === 'demo' ||
    (salonWorkspace.subscriptionStatus === 'active' && subscriptionEndsAtMs === null);
  const paywallMode = trialJustExpired
    ? 'trial_expired'
    : accessExpired || salonWorkspace.subscriptionStatus === 'suspended'
      ? 'subscription_expired'
      : activationRequired
        ? 'activation_required'
        : 'subscription_expired';
  const isWeb = Platform.OS === 'web';

  const waitForServerActivation = React.useCallback(async () => {
    const maxAttempts = 15;
    // Recover a verified store purchase even if its webhook was delayed or the account was recreated.
    await withClientDeadline(supabase.functions.invoke('reconcile-owner-subscription', {
      body: { workspaceId: salonWorkspace.id },
    }), 15_000).catch(() => null);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await refreshOwnerSubscriptionFromServer();
      if (result.active) {
        return true;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      }
    }

    setFeedback(
      'Pagamento riconosciuto dallo store. Attendo la conferma sicura del server: riprova tra pochi secondi.'
    );
    return false;
  }, [refreshOwnerSubscriptionFromServer, salonWorkspace.id]);

  const syncActiveCustomerInfo = React.useCallback(
    async (customerInfo: CustomerInfo) => {
      const entitlement = getActiveProEntitlement(customerInfo) as
        | PurchasesEntitlementInfo
        | undefined;

      if (!entitlement) {
        return false;
      }

      setFeedback('Pagamento confermato dallo store. Verifico l’attivazione sicura…');
      return waitForServerActivation();
    },
    [waitForServerActivation]
  );

  const loadPaywall = React.useCallback(async () => {
    setLoading(true);
    setConfigured(false);
    setConfigurationIssue('');
    setFeedback('');

    try {
      if (!isRevenueCatSupportedPlatform()) {
        setConfigurationIssue(
          Platform.OS === 'web'
            ? paywallMode === 'activation_required'
              ? 'Per avviare il mese gratuito, accedi dall’app SalonPro su iPhone o Android con questo stesso account.'
              : 'Per riattivare SalonPro, accedi dall’app su iPhone o Android con questo stesso account.'
            : 'Gli acquisti automatici sono disponibili nelle app iOS e Android.'
        );
        return;
      }

      if (!appUserId) {
        const workspaceRefresh = await refreshOwnerSubscriptionFromServer();
        if (!workspaceRefresh.ok) {
          setConfigurationIssue(
            'Sto riallineando il nuovo salone con il pagamento. Controlla la connessione e riprova.'
          );
        }
        return;
      }

      const configurationResult = await configureRevenueCat({ appUserId });
      if (!configurationResult.ok) {
        setConfigurationIssue(
          configurationResult.reason === 'missing_api_key'
            ? 'Mancano le chiavi RevenueCat per questa build.'
            : configurationResult.reason === 'missing_native_module'
              ? 'Serve una nuova build dell’app con RevenueCat incluso.'
              : 'RevenueCat non e ancora configurato per questo account.'
        );
        return;
      }

      setConfigured(true);

      const [customerInfo, launchOfferResult, offerings] = await Promise.all([
        getRevenueCatCustomerInfo(),
        withClientDeadline(supabase.rpc('get_salonpro_launch_offer_status')),
        getSalonProOfferings(),
      ]);
      if (hasActiveProEntitlement(customerInfo)) {
        await syncActiveCustomerInfo(customerInfo);
        return;
      }

      const { data: launchOfferData, error: launchOfferError } = launchOfferResult;
      if (launchOfferError || !launchOfferData) throw new Error('Offerta non verificabile');
      const nextLaunchOfferStatus = normalizeLaunchOfferStatus(launchOfferData);

      setLaunchOfferStatus(nextLaunchOfferStatus);

      const offering = selectSalonProOfferingById(offerings, nextLaunchOfferStatus.offeringId);
      if(!offering)throw new Error('Offerta dello store non disponibile');
      const standardOffering = selectSalonProOfferingById(
        offerings,
        REVENUECAT_STANDARD_OFFERING_ID
      );
      const salonProPackages = getSalonProPackages(offering);
      const standardSalonProPackages = getSalonProPackages(standardOffering);
      setMonthlyPackage(salonProPackages.monthly);
      setAnnualPackage(salonProPackages.annual);
      setStandardMonthlyPackage(standardSalonProPackages.monthly);
      setStandardAnnualPackage(standardSalonProPackages.annual);
      setSelectedBillingPeriod(salonProPackages.monthly ? 'monthly' : 'annual');

      if (Platform.OS === 'ios') {
        const packages = [salonProPackages.monthly, salonProPackages.annual].filter(
          (item): item is PurchasesPackage => item !== null
        );
        try {
          setTrialEligibility(
            await getRevenueCatTrialEligibility(
              packages.map((item) => item.product.identifier)
            )
          );
        } catch (eligibilityError) {
          console.log('Verifica idoneita prova Apple non riuscita:', eligibilityError);
          setTrialEligibility({});
        }
      }
    } catch (error) {
      console.log('Errore caricamento paywall RevenueCat:', error);
      setConfigured(false);
      const rawMessage = error instanceof Error ? error.message : String(error ?? '');
      const isStoreProductConfigurationIssue =
        /none of the products|could not be fetched|configuration/i.test(rawMessage);
      setConfigurationIssue(
        isStoreProductConfigurationIssue && __DEV__
          ? 'La versione SalonPro DEV non può usare i prodotti reali dello store. Il salone resta bloccato finché non viene scelto un piano dalla versione SalonPro collegata allo store.'
          : ''
      );
      setFeedback(
        isStoreProductConfigurationIssue
          ? 'Pagamento non disponibile in questa versione DEV. Nessun abbonamento è stato attivato.'
          : 'Non riesco a caricare il pagamento in questo momento. Riprova tra poco.'
      );
    } finally {
      setLoading(false);
    }
  }, [appUserId, paywallMode, refreshOwnerSubscriptionFromServer, syncActiveCustomerInfo]);

  React.useEffect(() => {
    if (!purchaseInFlight.current) void loadPaywall();
  }, [loadPaywall]);

  React.useEffect(() => {
    const refreshSubscription = () => {
      if (purchaseInFlight.current) return;
      void refreshOwnerSubscriptionFromServer();
    };
    const intervalId = setInterval(refreshSubscription, 15_000);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSubscription();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [refreshOwnerSubscriptionFromServer]);

  const handlePurchase = async () => {
    const packageToBuy =
      selectedBillingPeriod === 'annual'
        ? annualPackage
        : monthlyPackage;

    if (!configured || loading || !packageToBuy || busyAction || purchaseInFlight.current) return;
    purchaseInFlight.current=true;
    if (Platform.OS !== 'web') onActivationTransition?.(true);

    setBusyAction('purchase');
    setFeedback('');

    try {
      const {data:offerStatus,error:offerError}=await withClientDeadline(supabase.rpc('get_salonpro_launch_offer_status'));
      if(offerError||!offerStatus){
        setFeedback('Non riesco a verificare il prezzo. Controlla la connessione e riprova. Nessun acquisto avviato.');
        return;
      }
      const currentOffer=normalizeLaunchOfferStatus(offerStatus);
      if(currentOffer.offeringId!==launchOfferStatus.offeringId){
        await loadPaywall();
        setFeedback('L’offerta è cambiata. Controlla i prezzi aggiornati e conferma nuovamente il piano.');
        return;
      }
      const result = await purchaseSalonProPackage(packageToBuy);
      const active = await syncActiveCustomerInfo(result.customerInfo);
      if (active) {
        await confirmActivation(
          paywallMode === 'activation_required'
            ? 'Attivazione confermata. Prezzo, eventuale prova e rinnovo sono indicati nello store.'
            : 'L’abbonamento è stato riattivato.'
        );
      }
    } catch (error) {
      const maybeCancelled = error as { userCancelled?: boolean; message?: string };
      if (!maybeCancelled.userCancelled) {
        console.log('Acquisto RevenueCat non riuscito:', error);
        try {
          const refreshedCustomerInfo = await getRevenueCatCustomerInfo();
          if (hasActiveProEntitlement(refreshedCustomerInfo)) {
            const active = await syncActiveCustomerInfo(refreshedCustomerInfo);
            if (active) {
              await confirmActivation(
                paywallMode === 'activation_required'
                  ? 'Attivazione confermata. Prezzo, eventuale prova e rinnovo sono indicati nello store.'
                  : 'L’abbonamento è stato riattivato.'
              );
              return;
            }
          }
        } catch (refreshError) {
          console.log('Verifica acquisto dopo errore non riuscita:', refreshError);
        }

        setFeedback(getPurchaseFeedbackMessage(error));
      }
    } finally {
      purchaseInFlight.current=false;
      onActivationTransition?.(false);
      setBusyAction(null);
    }
  };

  const handleRestore = async () => {
    if (busyAction) return;
    if (!configured) {
      setFeedback('Collegamento allo store non disponibile. Ricarica i piani e riprova.');
      return;
    }

    if (purchaseInFlight.current) return;
    purchaseInFlight.current = true;
    if (Platform.OS !== 'web') onActivationTransition?.(true);
    setBusyAction('restore');
    setFeedback('');

    try {
      const customerInfo = await restoreSalonProPurchases();
      const active = await syncActiveCustomerInfo(customerInfo);
      if (active) await confirmActivation('Acquisto ripristinato. Puoi entrare nel salone.');
      setFeedback(
        active
          ? 'Acquisto ripristinato.'
          : 'Non ho trovato un abbonamento SalonPro attivo su questo account store.'
      );
    } catch (error) {
      console.log('Ripristino RevenueCat non riuscito:', error);
      setFeedback('Ripristino non completato. Controlla lo store e riprova.');
    } finally {
      purchaseInFlight.current = false;
      onActivationTransition?.(false);
      setBusyAction(null);
    }
  };

  const handleLogout = async () => {
    if (busyAction || logoutNavigationStartedRef.current) return;

    logoutNavigationStartedRef.current = true;
    setBusyAction('logout');
    setFeedback('');

    try {
      await logoutOwnerAccount();
    } catch (error) {
      console.log('Logout dalla pagina offerta non riuscito:', error);
      setFeedback('Uscita non completata. Riprova.');
      logoutNavigationStartedRef.current = false;
      setBusyAction(null);
    }
  };

  const handleLocalActivation = async () => {
    if (!__DEV__ || Platform.OS === 'web' || busyAction || !onDevContinue) return;
    setBusyAction('purchase');
    try {
      await onDevContinue();
    } catch {
      Alert.alert('Test DEV', 'Non riesco a salvare la scelta sul dispositivo. Riprova.');
    } finally {
      setBusyAction(null);
    }
  };

  const selectedPackage =
    selectedBillingPeriod === 'annual'
      ? annualPackage
      : monthlyPackage;
  const selectedProductId = selectedPackage?.product.identifier ?? '';
  const trialEligibleForSelectedPlan =
    Platform.OS === 'ios'
      ? trialEligibility[selectedProductId] === true && selectedPackage?.product.introPrice?.price === 0 && selectedPackage.product.introPrice.period === 'P1M'
      : selectedPackage?.product.defaultOption?.freePhase?.billingPeriod?.iso8601 === 'P1M';
  const canStartFreeTrial =
    paywallMode === 'activation_required' && trialEligibleForSelectedPlan;
  const monthlyPrice = loading && (isWeb || !monthlyPackage)
    ? '…'
    : getFounderDisplayPrice(
        monthlyPackage,
        founderOfferAvailable ? SALON_PRO_FOUNDER_PRICE_LABEL : SALON_PRO_FULL_PRICE_LABEL
      );
  const annualPrice = loading && (isWeb || !annualPackage)
    ? '…'
    : getFounderDisplayPrice(
        annualPackage,
        founderOfferAvailable
          ? SALON_PRO_FOUNDER_YEARLY_PRICE_LABEL
          : SALON_PRO_FULL_YEARLY_PRICE_LABEL
      );
  const standardMonthlyPrice = loading && (isWeb || !standardMonthlyPackage)
    ? null
    : getFounderDisplayPrice(standardMonthlyPackage, SALON_PRO_FULL_PRICE_LABEL);
  const standardAnnualPrice = loading && (isWeb || !standardAnnualPackage)
    ? null
    : getFounderDisplayPrice(standardAnnualPackage, SALON_PRO_FULL_YEARLY_PRICE_LABEL);
  const selectedPeriodLabel = selectedBillingPeriod === 'annual' ? 'annuale' : 'mensile';
  const canUseLocalActivation = __DEV__ && !isWeb && !!onDevContinue;
  const shouldShowConfigurationIssue = configurationIssue && !canUseLocalActivation && !isWeb;
  const titleText =
    paywallMode === 'trial_expired'
      ? 'Il mese gratuito è terminato'
      : paywallMode === 'subscription_expired'
        ? 'Abbonamento scaduto'
        : 'Il tuo salone, organizzato.';
  const subtitleText =
    paywallMode === 'trial_expired'
      ? 'Per continuare a usare SalonPro, riattiva il piano scelto. I dati del salone restano al sicuro.'
      : paywallMode === 'subscription_expired'
        ? 'L’accesso al gestionale è sospeso. Riattiva l’abbonamento per continuare senza perdere i dati.'
        : !trialEligibleForSelectedPlan
          ? 'Scegli il piano più adatto a te. Condizioni confermate nello store.'
          : 'Un mese gratuito per scoprire SalonPro.';
  const trialPillText =
    paywallMode === 'activation_required'
      ? trialEligibleForSelectedPlan
        ? 'Un mese gratuito'
        : 'Condizioni store'
      : paywallMode === 'trial_expired'
        ? 'Prova terminata'
        : 'Accesso sospeso';
  const primaryActionLabel =
    paywallMode === 'activation_required'
      ? canStartFreeTrial
        ? 'Inizia il mese gratuito'
        : `Continua con il piano ${selectedPeriodLabel}`
      : `Riattiva SalonPro ${selectedPeriodLabel}`;
  const priceNote = founderOfferAvailable ? 'Prezzo lancio primi 100' : 'Prezzo standard';

  return (
    <SafeAreaView style={styles.screen}>
      <GutterScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image
                source={salonProLogo}
                style={styles.logoImage}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
              />
            </View>
            <View style={styles.brandMetaRow}>
              <View style={styles.founderPill}>
                <Text style={styles.founderPillText}>
                  {founderOfferAvailable ? 'Offerta lancio' : 'Prezzo standard'}
                </Text>
              </View>
              <View style={styles.trialPill}>
                <Text style={styles.trialPillText}>{trialPillText}</Text>
              </View>
            </View>

            <Text style={styles.title}>{titleText}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>

          </View>

          <View style={styles.actionSection}>
          {isWeb ? null : canUseLocalActivation ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.primaryButton, !!busyAction && styles.buttonDisabled]}
              activeOpacity={0.92}
              disabled={!!busyAction}
              onPress={handleLocalActivation}
            >
              {busyAction === 'purchase' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="flask-outline" size={18} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>
                    Continua al tour · Test DEV
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.primaryButton,
                (!configured || loading || !selectedPackage || !!busyAction) && styles.buttonDisabled,
              ]}
              activeOpacity={0.92}
              disabled={!configured || loading || !selectedPackage || !!busyAction}
              onPress={handlePurchase}
            >
              {busyAction === 'purchase' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>
          )}

          {!isWeb && !canUseLocalActivation && <Text style={styles.paymentDisclosure}>
            {canStartFreeTrial ? `Poi ${selectedBillingPeriod==='monthly'?monthlyPrice:annualPrice}. ` : ''}Rinnovo automatico.
            {canStartFreeTrial ? ' Prova soggetta a idoneità nello store.' : ' Prezzi e condizioni confermati nello store.'}
          </Text>}
          </View>

          <View style={styles.planGrid}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setSelectedBillingPeriod('monthly')}
              disabled={loading || !!busyAction || (!__DEV__ && !monthlyPackage)}
              accessibilityRole="radio"
              accessibilityState={{selected:selectedBillingPeriod==='monthly',disabled:loading||!!busyAction||(!__DEV__&&!monthlyPackage)}}
              style={[
                styles.planCard,
                selectedBillingPeriod === 'monthly' && styles.planCardSelected,
              ]}
            >
              <View style={styles.planTopRow}>
                <Text style={[styles.planName, selectedBillingPeriod === 'monthly' && styles.planNameSelected]}>Mensile</Text>
                {selectedBillingPeriod === 'monthly' ? (
                  <Ionicons name="checkmark-circle" size={22} color={paywallInk.action} />
                ) : <Ionicons name="ellipse-outline" size={22} color={paywallInk.muted} />}
              </View>
              {!isWeb && loading && !monthlyPackage ? <SkeletonShimmer accessibilityLabel="Caricamento piano mensile" style={{ height: 40, width: '82%', borderRadius: 10, marginVertical: 8 }} /> : <Text style={[styles.planPrice, selectedBillingPeriod === 'monthly' && styles.planPriceSelected]}>{monthlyPrice}</Text>}
              <Text style={[styles.planNote, selectedBillingPeriod === 'monthly' && styles.planNoteSelected]}>{priceNote}</Text>
              {founderOfferAvailable && standardMonthlyPrice ? (
                <Text style={[styles.planSubNote, selectedBillingPeriod === 'monthly' && styles.planNoteSelected]}>Fuori promo {standardMonthlyPrice}</Text>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setSelectedBillingPeriod('annual')}
              disabled={loading || !!busyAction || (!__DEV__ && !annualPackage)}
              accessibilityRole="radio"
              accessibilityState={{selected:selectedBillingPeriod==='annual',disabled:loading||!!busyAction||(!__DEV__&&!annualPackage)}}
              style={[
                styles.planCard,
                styles.planCardFeatured,
                selectedBillingPeriod === 'annual' && styles.planCardFeaturedSelected,
              ]}
            >
              <View style={styles.planTopRow}>
                <View style={styles.planHeading}>
                <Text style={[styles.planName, selectedBillingPeriod === 'annual' && styles.planNameSelected]}>Annuale</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Risparmio annuale</Text>
                </View>
                </View>
                {selectedBillingPeriod === 'annual' ? (
                  <Ionicons name="checkmark-circle" size={22} color={paywallInk.action} />
                ) : <Ionicons name="ellipse-outline" size={22} color={paywallInk.muted} />}
              </View>
              {!isWeb && loading && !annualPackage ? <SkeletonShimmer accessibilityLabel="Caricamento piano annuale" style={{ height: 40, width: '82%', borderRadius: 10, marginVertical: 8 }} /> : (              <Text
                style={[
                  styles.planPrice,
                  selectedBillingPeriod === 'annual' && styles.planPriceSelected,
                ]}
              >
                {annualPrice}
              </Text>)}

              <Text
                style={[
                  styles.planNote,
                  selectedBillingPeriod === 'annual' && styles.planNoteSelected,
                ]}
              >
                Addebito unico annuale
              </Text>
              {founderOfferAvailable && standardAnnualPrice ? (
                <Text
                  style={[
                    styles.planSubNote,
                    selectedBillingPeriod === 'annual' && styles.planNoteSelected,
                  ]}
                >
                  Fuori promo {standardAnnualPrice}
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name="calendar-clear-outline" size={17} color="#19365B" />
              </View>
              <Text style={styles.bulletText}>Agenda, clienti, cassa e prenotazioni.</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name="card-outline" size={17} color="#19365B" />
              </View>
              <Text style={styles.bulletText}>Non devi inserire carte di credito in SalonPro.</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name="refresh-outline" size={17} color="#19365B" />
              </View>
              <Text style={styles.bulletText}>Puoi disdire quando vuoi dallo store ufficiale.</Text>
            </View>
          </View>

          {isWeb && loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#111827" />
              <Text style={styles.loadingText}>Carico il piano...</Text>
            </View>
          ) : null}

          {shouldShowConfigurationIssue ? (
            <Text style={styles.issueText}>{configurationIssue}</Text>
          ) : null}
          {isWeb ? (
            <View style={styles.webBlockedNotice}>
              <Ionicons name="lock-closed-outline" size={20} color="#7c2d12" />
              <View style={styles.webBlockedNoticeCopy}>
                <Text style={styles.webBlockedNoticeTitle}>Accesso web bloccato</Text>
                <Text style={styles.webBlockedNoticeText}>{configurationIssue}</Text>
                <Text style={styles.webBlockedNoticeHint}>
                  Questa pagina si sblocca automaticamente appena l’attivazione viene confermata.
                </Text>
              </View>
            </View>
          ) : null}
          {canUseLocalActivation ? (
            <View style={styles.localNotice}>
              <Ionicons name="construct-outline" size={16} color="#475569" />
              <Text style={styles.localNoticeText}>Modalita test locale: nessun pagamento reale.</Text>
            </View>
          ) : null}
          {feedback && !canUseLocalActivation ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          {!isWeb && !canUseLocalActivation && !loading && (!configured || !monthlyPackage || !annualPackage) && (
            <TouchableOpacity accessibilityRole="button" disabled={!!busyAction} onPress={() => { void loadPaywall(); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Ricarica piani dello store</Text>
            </TouchableOpacity>
          )}
          {!canUseLocalActivation && <Text style={styles.paymentDisclosure}>Il pagamento è gestito da App Store o Google Play.</Text>}

          {!isWeb && !canUseLocalActivation ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.8}
              disabled={!!busyAction}
              onPress={handleRestore}
            >
              <Text style={styles.secondaryButtonText}>
                {busyAction === 'restore' ? 'Ripristino...' : 'Ripristina acquisto'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.logoutButton, !!busyAction && styles.buttonDisabled]}
            activeOpacity={0.75}
            disabled={!!busyAction}
            onPress={handleLogout}
          >
            {busyAction === 'logout' ? (
              <ActivityIndicator size="small" color="#475569" />
            ) : (
              <Text style={styles.logoutButtonText}>Esci</Text>
            )}
          </TouchableOpacity>
        </View>
      </GutterScrollView>
    </SafeAreaView>
  );
}

const basePaywallStyles = StyleSheet.create({
  paymentDisclosure:{color:'#64748B',fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  actionSection: { marginBottom: 20 },
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
  },
  panel: {
    width: '100%',
    flexGrow: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    maxWidth:520,
    alignSelf:'center',
  },
  hero: {
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  logoWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 6,
    overflow: 'hidden',
  },
  logoImage: {
    width: 230,
    height: 104,
  },
  brandMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7eef8',
  },
  brand: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  founderPill: {
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  founderPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  trialPill: {
    borderRadius: 999,
    backgroundColor: '#E8EFF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trialPillText: {
    color: '#19365B',
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: '#111827',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  savingStrip: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5FA',
    borderWidth: 1,
    borderColor: '#DCE5F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  savingStripText: {
    flexShrink: 1,
    color: '#19365B',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  planGrid: {
    gap: 14,
    marginBottom: 18,
  },
  planCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#dbe4ee',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  planCardFeatured: {
    backgroundColor: '#FFFFFF',
    borderColor: '#dbe4ee',
  },
  planCardFeaturedSelected: {
    backgroundColor: '#F1F5FB',
    borderColor: '#19365B',
  },
  planCardSelected: {
    backgroundColor: '#F1F5FB',
    borderColor: '#19365B',
  },
  planHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'wrap' },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  planName: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  planNameSelected: {
    color: '#19365B',
  },
  planPrice: {
    color: '#111827',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
  },
  planPriceSelected: {
    color: '#111827',
  },
  planNote: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  planSubNote: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  planNoteSelected: {
    color: '#475569',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  bullets: {
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 10,
    backgroundColor: '#EAF1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    minWidth: 0,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    color: '#475569',
    fontWeight: '700',
  },
  issueText: {
    color: '#b45309',
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    padding: 10,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  webBlockedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  webBlockedNoticeCopy: {
    flex: 1,
    gap: 3,
  },
  webBlockedNoticeTitle: {
    color: '#7c2d12',
    fontSize: 14,
    fontWeight: '900',
  },
  webBlockedNoticeText: {
    color: '#9a3412',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  webBlockedNoticeHint: {
    color: '#7c2d12',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  feedbackText: {
    color: '#334155',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    padding: 10,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#19365B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#102D50',
    shadowColor: '#19365B',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  localTestButton: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#e7eef8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  localTestButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  localNotice: {
    minHeight: 38,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#dbe4ee',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  localNoticeText: {
    flexShrink: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  logoutButton: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  logoutButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '800',
  },
});
