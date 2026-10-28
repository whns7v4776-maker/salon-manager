import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

export const REVENUECAT_PRO_ENTITLEMENT_ID = 'pro';
const REVENUECAT_PRO_ENTITLEMENT_ALIASES = [
  REVENUECAT_PRO_ENTITLEMENT_ID,
  'salonpro Premium',
  'salonpro_premium',
  'salonpro-premium',
];
export const REVENUECAT_FOUNDER_OFFERING_ID = 'founder';
export const REVENUECAT_STANDARD_OFFERING_ID = 'default';
export const SALON_PRO_FULL_PRICE_LABEL = '29,99 €/mese';
export const SALON_PRO_FOUNDER_PRICE_LABEL = '24,99 €/mese';
export const SALON_PRO_FULL_YEARLY_PRICE_LABEL = '299,99 €/anno';
export const SALON_PRO_FOUNDER_YEARLY_PRICE_LABEL = '249,99 €/anno';
export const SALON_PRO_FOUNDER_LIMIT = 100;

type RevenueCatExtra = {
  revenueCatAppleApiKey?: string;
  revenueCatGoogleApiKey?: string;
  EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?: string;
};

let revenueCatConfigured = false;
let configuredForUserId = '';
let revenueCatLogHandlerConfigured = false;

const configureRevenueCatLogHandler = () => {
  if (revenueCatLogHandlerConfigured || typeof Purchases.setLogHandler !== 'function') {
    return;
  }

  Purchases.setLogHandler((level, message) => {
    const normalizedMessage = String(message ?? '').trim();
    if (/purchase was canc?elled|purchase_cancelled|user.?cancelled/i.test(normalizedMessage)) {
      return;
    }

    if (level === LOG_LEVEL.ERROR) {
      if (__DEV__) {
        console.warn(`[RevenueCat] ${normalizedMessage}`);
        return;
      }
      console.error(`[RevenueCat] ${normalizedMessage}`);
      return;
    }
    if (level === LOG_LEVEL.WARN) {
      console.warn(`[RevenueCat] ${normalizedMessage}`);
      return;
    }
    if (__DEV__) {
      console.log(`[RevenueCat] ${normalizedMessage}`);
    }
  });
  revenueCatLogHandlerConfigured = true;
};

const hasRevenueCatNativeModule = () => {
  const purchasesModule = Purchases as unknown as {
    configure?: unknown;
    getCustomerInfo?: unknown;
  };

  return (
    Purchases !== null &&
    typeof purchasesModule.configure === 'function' &&
    typeof purchasesModule.getCustomerInfo === 'function'
  );
};

const readExpoExtra = () => {
  const manifest2Extra = (Constants.manifest2 as { extra?: Record<string, unknown> } | null)
    ?.extra;
  const manifestExtra = (Constants.manifest as { extra?: Record<string, unknown> } | null)?.extra;

  return ((Constants.expoConfig?.extra ?? manifest2Extra ?? manifestExtra) as
    | RevenueCatExtra
    | undefined) ?? {};
};

const resolveRevenueCatApiKey = () => {
  const extra = readExpoExtra();

  if (Platform.OS === 'ios') {
    return (
      process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY?.trim() ||
      extra.revenueCatAppleApiKey?.trim() ||
      extra.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY?.trim() ||
      ''
    );
  }

  if (Platform.OS === 'android') {
    return (
      process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?.trim() ||
      extra.revenueCatGoogleApiKey?.trim() ||
      extra.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?.trim() ||
      ''
    );
  }

  return '';
};

export const isRevenueCatSupportedPlatform = () =>
  (Platform.OS === 'ios' || Platform.OS === 'android') && hasRevenueCatNativeModule();

export const getRevenueCatAppUserId = (workspaceId?: string | null, ownerEmail?: string | null) => {
  const normalizedWorkspaceId = String(workspaceId ?? '').trim();
  if (normalizedWorkspaceId && !normalizedWorkspaceId.startsWith('workspace-')) {
    return `workspace:${normalizedWorkspaceId}`;
  }

  // L'email non e' un'identita commerciale stabile: un proprietario puo'
  // eliminare il salone e ricrearlo con la stessa email. RevenueCat deve
  // quindi essere configurato solo dopo che il backend ha restituito l'UUID
  // del workspace corrente, evitando di riagganciare ricevute o sandbox del
  // salone precedente.
  void ownerEmail;
  return '';
};

export const configureRevenueCat = async ({
  appUserId,
}: {
  appUserId: string;
}) => {
  const apiKey = resolveRevenueCatApiKey();

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ok: false as const, reason: 'unsupported_platform' as const };
  }

  if (!hasRevenueCatNativeModule()) {
    return { ok: false as const, reason: 'missing_native_module' as const };
  }

  if (!apiKey) {
    return { ok: false as const, reason: 'missing_api_key' as const };
  }

  if (!__DEV__ && apiKey.startsWith('test_')) {
    return { ok: false as const, reason: 'test_api_key_in_production' as const };
  }

  if (!appUserId.trim()) {
    return { ok: false as const, reason: 'missing_user_id' as const };
  }

  if (revenueCatConfigured && configuredForUserId === appUserId) {
    return { ok: true as const };
  }

  if (__DEV__ && typeof Purchases.setLogLevel === 'function') {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
  }

  if (!revenueCatConfigured) {
    configureRevenueCatLogHandler();
    Purchases.configure({ apiKey, appUserID: appUserId });
    revenueCatConfigured = true;
  } else {
    await Purchases.logIn(appUserId);
  }

  configuredForUserId = appUserId;
  return { ok: true as const };
};

export const getActiveProEntitlement = (customerInfo?: CustomerInfo | null) => {
  const activeEntitlements = customerInfo?.entitlements.active;
  if (!activeEntitlements) return undefined;
  return REVENUECAT_PRO_ENTITLEMENT_ALIASES.map((id) => activeEntitlements[id]).find(Boolean);
};

export const hasActiveProEntitlement = (customerInfo?: CustomerInfo | null) =>
  typeof getActiveProEntitlement(customerInfo) !== 'undefined';

export const getSalonProOfferings = () => Purchases.getOfferings();

export const selectSalonProOffering = (
  offerings: PurchasesOfferings,
  preferredOfferingId = REVENUECAT_FOUNDER_OFFERING_ID
) =>
  offerings.all[preferredOfferingId] ??
  offerings.all[REVENUECAT_FOUNDER_OFFERING_ID] ??
  offerings.current ??
  Object.values(offerings.all)[0] ??
  null;

export const selectSalonProOfferingById = (
  offerings: PurchasesOfferings,
  offeringId: string
) => offerings.all[offeringId] ?? null;

export const getSalonProOffering = async (preferredOfferingId = REVENUECAT_FOUNDER_OFFERING_ID) => {
  const offerings = await Purchases.getOfferings();
  return selectSalonProOffering(offerings, preferredOfferingId);
};

export const getSalonProOfferingById = async (offeringId: string) => {
  const offerings = await Purchases.getOfferings();
  return selectSalonProOfferingById(offerings, offeringId);
};

export const getPreferredSalonProPackage = (offering: PurchasesOffering | null) => {
  if (!offering) return null;
  return (
    offering.monthly ??
    offering.availablePackages.find((item) =>
      item.product.identifier.toLowerCase().includes('monthly')
    ) ??
    offering.availablePackages[0] ??
    null
  );
};

export const getSalonProPackages = (offering: PurchasesOffering | null) => {
  if (!offering) {
    return { monthly: null, annual: null };
  }

  const monthly =
    offering.monthly ??
    offering.availablePackages.find((item) =>
      item.product.identifier.toLowerCase().includes('monthly')
    ) ??
    null;
  const annual =
    offering.annual ??
    offering.availablePackages.find((item) => {
      const identifier = item.product.identifier.toLowerCase();
      return identifier.includes('annual') || identifier.includes('yearly');
    }) ??
    null;

  return { monthly, annual };
};

export const purchaseSalonProPackage = async (purchasePackage: PurchasesPackage) =>
  Purchases.purchasePackage(purchasePackage);

export const restoreSalonProPurchases = async () => Purchases.restorePurchases();

export const getRevenueCatCustomerInfo = async () => Purchases.getCustomerInfo();

export const getRevenueCatTrialEligibility = async (productIds: string[]) => {
  const normalizedIds = Array.from(
    new Set(productIds.map((item) => item.trim()).filter(Boolean))
  );
  if (normalizedIds.length === 0 || Platform.OS !== 'ios') {
    return {} as Record<string, boolean>;
  }

  const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(normalizedIds);
  return Object.fromEntries(
    normalizedIds.map((productId) => [
      productId,
      result[productId]?.status ===
        Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
    ])
  );
};
