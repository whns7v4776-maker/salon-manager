import { AccessWidePanel } from '../components/access-wide-panel';
import { DockedSheetSurface } from '../components/ui/docked-sheet-surface';
import { SalonSearch } from '../components/salon-discovery/salon-search';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, Animated as RNAnimated, Dimensions, findNodeHandle, Keyboard, KeyboardAvoidingView, Linking, LayoutChangeEvent, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable as NativePressable, ScrollView, StyleSheet, Text, TextInput, TextInputSubmitEditingEventData, UIManager, useWindowDimensions, View } from 'react-native';
import { HapticNativeTouchableOpacity, HapticNativePressable as Pressable } from '../components/ui/haptic-native-controls';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
} from 'react-native-reanimated';
import { AccessAppearanceProvider, AccessGlassReflection, AccessBackdrop, AccessWordmark, accessPremiumStyles, useAccessAppearance } from '../components/access-premium';
import { AccessNavigationBar } from '../components/access-navigation-bar';
import { AccessSalonBadge } from '../components/ui/access-salon-badge';
import { PublicSalonName, usePublicSalonAliases } from '../components/ui/public-salon-name';
import { MetaMeasurementLink } from '../components/meta-measurement-link';
import { EmailOtpModal, OtpVerifiedActionHalo } from '../components/email-otp-modal';
import {
  PasswordMatchRequirement,
  PasswordRequirements,
} from '../components/password-requirements';
import { AndroidStablePlaceholderInput } from '../components/ui/android-stable-placeholder-input';
import { PasswordTextInput } from '../components/ui/password-text-input';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { OwnerAccessScreen } from '../src/screens/OwnerAccessScreen';
import { useAppContext } from '../src/context/AppContext';
import { fetchClientPortalSnapshot } from '../src/lib/client-portal';
import {
  buildPersonNameValidationError,
  formatCustomerNamePart,
  formatLeadingCapitalizedValue,
  isValidPersonNamePart,
} from '../src/lib/customer-name';
import {
  buildEmailOtpRequestErrorMessage,
  buildEmailOtpVerificationErrorMessage,
  formatEmailOtpCountdown,
  parseEmailOtpExpiresAt,
  requestEmailOtp,
  verifyEmailOtp,
} from '../src/lib/email-verification';
import { findFrontendCustomerDuplicate } from '../src/lib/frontend-customer-duplicates';
import { useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { normalizeSalonCode } from '../src/lib/platform';
import { validateStrongPassword } from '../src/lib/password-policy';
import {
  readClientPasswordFromVault,
  saveClientPasswordToVault,
} from '../src/lib/client-password-vault';
import { lookupCustomerForPortal, ensureCustomerPortalSession } from '../src/lib/customer-portal-access';
import { readNativeCustomerSession, nativeCustomerSessionGeneration } from '../src/lib/client-native-session';
import {
  completeSalonCustomerEmail,
  isSalonCustomerEmailCompletionCandidate,
} from '../src/lib/client-email-completion';
import { useResponsiveLayout } from '../src/lib/responsive';
import { publicSupabase } from '../src/lib/supabase';
import { resolveManualSalonCode } from '../src/lib/salon-short-code';
import { SalonCodeInput } from '../components/ui/salon-code-input';
import { isValidEmail, isValidPhone10, limitPhoneToTenDigits } from '../src/lib/validators';

const SalonSelectorTouchable = Platform.OS === 'web' ? TouchableOpacity : HapticNativeTouchableOpacity;
const ClientBiometricTouchable = Platform.OS === 'ios' ? NativePressable : TouchableOpacity;
const ClientLoginTouchable = Platform.OS === 'ios' ? HapticNativeTouchableOpacity : TouchableOpacity;

const normalizeSalonCodeInput = (value: string) => normalizeSalonCode(value);
const buildSavedSalonCodeList = (codes: string[]) =>
  Array.from(new Set(codes.map((value) => normalizeSalonCodeInput(value)).filter(Boolean)));
const BACKOFFICE_ROUTE = '/(tabs)' as Href;
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_SAVED_SALON_CODES_KEY = 'salon_manager_frontend_saved_salon_codes';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const HOME_CLIENT_ACCESS_DRAFT_KEY = 'salon_manager_home_client_access_draft';
const HOME_CLIENT_REGISTER_DRAFT_KEY = 'salon_manager_home_client_register_draft';
const LANDING_LAST_AUDIENCE_KEY = 'salon_manager_landing_last_audience';
const FRONTEND_WEB_ACTIVE_SESSION_KEY = 'salon_manager_frontend_web_active_session_v1';
const FRONTEND_SIMPLE_WEB_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DELETED_CLIENT_PROFILE_MESSAGE =
  'Questo account non è più attivo per il salone collegato. Se vuoi continuare, procedi con una nuova registrazione cliente.';
const PUBLIC_SUPPORT_EMAIL = 'salon.pro.app13@gmail.com';
const PUBLIC_INSTAGRAM_HANDLE = '@salonpro13';
const PUBLIC_INSTAGRAM_DIRECT_URL = 'https://ig.me/m/salonpro13';
const PUBLIC_SITE_URL = 'https://salonpro.dev';
const PUBLIC_PRIVACY_URL = `${PUBLIC_SITE_URL}/privacy`;
const PUBLIC_SUPPORT_URL = `${PUBLIC_SITE_URL}/support`;
const PUBLIC_CONTACTS_URL = `${PUBLIC_SITE_URL}/contatti`;
type FooterDialogKey = 'privacy' | 'support' | 'contacts';

type FrontendWebActiveSession = {
  salonCode: string;
  email: string;
  phone: string;
};

const readFrontendWebActiveSession = (): FrontendWebActiveSession | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(FRONTEND_WEB_ACTIVE_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<FrontendWebActiveSession>;
    const salonCode = normalizeSalonCodeInput(parsed.salonCode ?? '');
    const email = normalizeEmail(parsed.email ?? '');
    const phone = limitPhoneToTenDigits(String(parsed.phone ?? ''));
    if (!salonCode || (!email && !phone)) {
      return null;
    }

    return { salonCode, email, phone };
  } catch {
    return null;
  }
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D+/g, '');
const buildFrontendProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCodeInput(salonCode ?? '');
  return normalized ? `${FRONTEND_PROFILE_KEY}:${normalized}` : FRONTEND_PROFILE_KEY;
};
const buildFrontendBiometricProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCodeInput(salonCode ?? '');
  return normalized ? `${FRONTEND_BIOMETRIC_PROFILE_KEY}:${normalized}` : FRONTEND_BIOMETRIC_PROFILE_KEY;
};
const buildFrontendBiometricEnabledKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const normalizedSalonCode = normalizeSalonCodeInput(salonCode ?? '');
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedPhone = limitPhoneToTenDigits((phone ?? '').trim());
  const identity = [normalizedSalonCode, normalizedEmail || normalizedPhone].filter(Boolean).join(':');
  return identity
    ? `${FRONTEND_BIOMETRIC_ENABLED_KEY}:${identity}`
    : FRONTEND_BIOMETRIC_ENABLED_KEY;
};
const EMPTY_REGISTER_PROFILE = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  instagram: '',
};
type HomeClientLookupItem = {
  nome?: string;
  email?: string;
  telefono?: string;
  instagram?: string;
};
type LandingAudience = 'owner' | 'client';
type ClientEntryMode = 'access' | 'register';
const CARD_TOGGLE_LAYOUT = LinearTransition.duration(220);
const CARD_TOGGLE_ENTER = FadeIn.duration(180);

function ClientAccessSpinner({ tone = 'light' }: { tone?: 'light' | 'blue' }) {
  const spin = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.timing(spin, {
        toValue: 1,
        duration: 860,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <RNAnimated.View
      style={[
        styles.clientAccessSpinner,
        tone === 'blue' && styles.clientAccessSpinnerBlue,
        { transform: [{ rotate }] },
      ]}
    />
  );
}

const buildDuplicateFrontendCustomerMessage = ({
  emailTaken,
  phoneTaken,
}: {
  emailTaken: boolean;
  phoneTaken: boolean;
}) => {
  if (emailTaken && phoneTaken) {
    return 'Questa email e questo numero di cellulare sono già registrati nel salone. Vai su Accedi.';
  }
  if (emailTaken) {
    return 'Questa email è già registrata nel salone. Vai su Accedi.';
  }
  if (phoneTaken) {
    return 'Questo numero di cellulare è già registrato nel salone. Vai su Accedi.';
  }
  return 'Questo account è già registrato nel salone. Vai su Accedi.';
};

const isSupabaseSchemaCacheLookupError = (error: unknown) => {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  const message =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return code === 'PGRST002' || /schema cache/i.test(message);
};

const isClientPortalNetworkLookupError = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return /network request failed|failed to fetch|networkerror|timeout|aborted/i.test(message);
};

function LandingAccessHeader({ audience, ownerMode = 'login' }: {
  audience: LandingAudience;
  ownerMode?: 'login' | 'register';
}) {
  const { palette } = useAccessAppearance();
  const styles = useMemo(() => accessPremiumStyles(baseStyles, palette), [palette]);
  return (
    <View style={[styles.accessAreaHeader, Platform.OS === 'web' && {marginBottom:16}]}>
      <View style={[styles.accessBrandRow, Platform.OS === 'web' && {height:116,marginBottom:4}]}>
        <View style={styles.accessBrandMark}>
          <AccessWordmark />
        </View>
      </View>
      <>
      <Text accessibilityRole="header" style={styles.accessAreaTitle}>
        {audience === 'client' ? 'Area cliente' : 'Area salone'}
      </Text>
      <Text style={styles.accessAreaSubtitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
        {audience === 'client' ? 'Il tuo prossimo appuntamento' : ownerMode === 'register' ? 'Crea il tuo salone' : 'Bentornato'}
      </Text>
      {audience === 'owner' ? <Text style={{ color: palette.muted, fontSize: 14, marginTop: 6 }}>{ownerMode === 'register' ? 'Inizia con i dati del tuo salone' : 'Accedi al tuo salone'}</Text> : null}
      </>
    </View>
  );
}

export default function PublicClientLandingScreen() {
  return <AccessAppearanceProvider><PremiumClientLandingScreen /></AccessAppearanceProvider>;
}

function PremiumClientLandingScreen() {
  const { palette } = useAccessAppearance();
  const [showAccessInformation, setShowAccessInformation] = useState(false);
  const [ownerAccessMode, setOwnerAccessMode] = useState<'login' | 'register'>('login');
  const styles = useMemo(() => accessPremiumStyles(baseStyles, palette), [palette]);
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    code?: string | string[];
    associateSalon?: string | string[];
    mode?: string | string[];
    entry?: string | string[];
    registrationOnly?: string | string[];
    ownerLoggedOut?: string | string[];
    ownerReset?: string | string[];
    passwordReset?: string | string[];
    frontendLoggedOut?: string | string[];
    nativeAccessFallback?: string | string[];
    side?: string | string[];
  }>();
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const {
    isAuthenticated,
    isLoaded,
    hasInitializedAuth,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerExplicitLogout,
    logoutOwnerAccount,
    resolveSalonByCode,
    upsertFrontendCustomerForSalon,
  } = useAppContext();
  const { fontScale: landingFontScale } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const accessEmailRef = useRef<TextInput | null>(null);
  const accessPhoneRef = useRef<TextInput | null>(null);
  const accessPasswordRef = useRef<TextInput | null>(null);
  const salonCodeRef = useRef<TextInput | null>(null);
  const registerNomeRef = useRef<TextInput | null>(null);
  const registerCognomeRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerPhoneRef = useRef<TextInput | null>(null);
  const registerInstagramRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const registerPasswordConfirmRef = useRef<TextInput | null>(null);
  const registerSectionRef = useRef<View | null>(null);
  const registerScrollRequestRef = useRef<{ navigationGeneration: number } | null>(null);
  const registerScrollFrameRef = useRef<number | null>(null);
  const lastLoadedClientSessionKeyRef = useRef('');
  const loadingClientSessionKeyRef = useRef('');
  const appliedIncomingSalonCodeRef = useRef('');
  const keyboardDismissDragUntilRef = useRef(0);
  const clientKeyboardHeightRef = useRef(0);
  const clientFocusedInputRef = useRef<TextInput | null>(null);
  const clientKeyboardScrollTargetRef = useRef(0);
  const landingScrollYRef = useRef(0);
  const [selectedLandingAudience, setSelectedLandingAudience] =
    useState<LandingAudience | null>(null);
  const [landingAudienceReady, setLandingAudienceReady] = useState(false);
  const landingAudienceChosenRef = useRef(false);
  const [audiencePickerOpen, setAudiencePickerOpen] = useState(false);
  const landingNavigationGenerationRef = useRef(0);
  const clientLandingActiveRef = useRef(false);
  const ownerReadyForBackofficeRef = useRef(false);
  const nativeLandingResumeStartedRef = useRef('');
  const nativeLandingResumeScopeRef = useRef('');
  const [salonCode, setSalonCode] = useState('');
  const [useLegacySalonCode, setUseLegacySalonCode] = useState(false);
  const [salonAssociationError, setSalonAssociationError] = useState('');
  const [isAssociatingSalon, setIsAssociatingSalon] = useState(false);
  const [codeSectionY, setCodeSectionY] = useState(0);
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [savedProfileEmail, setSavedProfileEmail] = useState('');
  const [savedProfilePhone, setSavedProfilePhone] = useState('');
  const [savedSalonCode, setSavedSalonCode] = useState('');
  const [savedSalonCodes, setSavedSalonCodes] = useState<string[]>([]);
  const removingSavedSalonRef = useRef(false);
  const [savedSalonActionsCode, setSavedSalonActionsCode] = useState<string | null>(null);
  const pendingSavedSalonRemovalRef = useRef<string | null>(null);
  const [selectedAssociatedSalonCode, setSelectedAssociatedSalonCode] = useState('');
  const [isSalonSelectorOpen, setIsSalonSelectorOpen] = useState(false);
  const closeSalonSelector = useCallback(() => setIsSalonSelectorOpen(false), []);
  // Observe outside taps without claiming the responder or interrupting scrolling.
  const salonOutsideTapRef = useRef<{ x: number; y: number } | null>(null);
  const beginSalonOutsideTap = (x: number, y: number) => {
    salonOutsideTapRef.current = isSalonSelectorOpen ? { x, y } : null;
  };
  const moveSalonOutsideTap = (x: number, y: number) => {
    const start = salonOutsideTapRef.current;
    if (start && Math.hypot(x - start.x, y - start.y) > 8) {
      salonOutsideTapRef.current = null;
    }
  };
  const finishSalonOutsideTap = (x: number, y: number) => {
    moveSalonOutsideTap(x, y);
    const isTap = salonOutsideTapRef.current !== null;
    salonOutsideTapRef.current = null;
    if (isTap) closeSalonSelector();
  };
  useFocusEffect(useCallback(() => closeSalonSelector, [closeSalonSelector]));
  const [isSalonAssociationCardExpanded, setIsSalonAssociationCardExpanded] = useState(
    false
  );
  const [hasSavedClientProfile, setHasSavedClientProfile] = useState(false);
  const [loadedClientSessionKey, setLoadedClientSessionKey] = useState('');
  const [hasSavedBiometricProfile, setHasSavedBiometricProfile] = useState(false);
  const [savedBiometricIdentity, setSavedBiometricIdentity] = useState<{ salonCode: string; email: string } | null>(null);
  const [frontendBiometricEnabled, setFrontendBiometricEnabled] = useState(false);
  const isWideLandingViewport = responsive.width >= 768;
  const wideAccessPanels = Platform.OS === 'web' && responsive.width >= 1000;
  const expandLandingWideContent = responsive.isTablet || responsive.isDesktop;
  const isCompactPhoneViewport =
    !expandLandingWideContent && (responsive.width <= 390 || responsive.height <= 780);
  const isVeryCompactPhoneViewport =
    !expandLandingWideContent && (responsive.width <= 375 || responsive.height <= 720);
  const isTightAndroidLandingViewport =
    Platform.OS === 'android' &&
    !expandLandingWideContent &&
    (responsive.width <= 390 || responsive.height <= 780 || landingFontScale > 1.05);
  const landingHorizontalPadding = isCompactPhoneViewport
    ? Math.max(12, (responsive.horizontalPadding ?? 20) - 6)
    : (responsive.horizontalPadding ?? 20);
  const androidLandingBottomPadding =
    Platform.OS === 'android' ? Math.max(164, insets.bottom + 132) : 0;
  const androidFooterBottomPadding =
    Platform.OS === 'android' ? Math.max(92, insets.bottom + 72) : 0;
  const landingShellMaxWidth = isWideLandingViewport ? 1120 : (responsive.contentMaxWidth ?? responsive.width);
  const [landingPagerWidth, setLandingPagerWidth] = useState(
    Math.max(
      320,
      Math.min(landingShellMaxWidth, responsive.width - landingHorizontalPadding * 2)
    )
  );
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPhone, setAccessPhone] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessPasswordError, setAccessPasswordError] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [accessEmailCompletionSentTo, setAccessEmailCompletionSentTo] = useState('');
  const [accessEmailCompletionChallengeVersion, setAccessEmailCompletionChallengeVersion] = useState(0);
  const [accessEmailCompletionExpiresAt, setAccessEmailCompletionExpiresAt] = useState(0);
  const [accessEmailCompletionNow, setAccessEmailCompletionNow] = useState(Date.now());
  const [accessEmailCompletionBusy, setAccessEmailCompletionBusy] = useState(false);
  const [accessEmailCompletionMessage, setAccessEmailCompletionMessage] = useState('');
  const [isAccessingClient, setIsAccessingClient] = useState(false);
  const [clientAccessLoadingSource, setClientAccessLoadingSource] = useState<
    'login' | 'biometric' | null
  >(null);
  const isClientBiometricVisualAccess =
    isAccessingClient && clientAccessLoadingSource === 'biometric';
  const clientBiometricCredentialMask = '••••••••';
  const clientAccessEmailPlaceholder =
    isClientBiometricVisualAccess ? clientBiometricCredentialMask : 'Email (obbligatoria)';
  const clientAccessPhonePlaceholder =
    isClientBiometricVisualAccess ? clientBiometricCredentialMask : 'Telefono (obbligatorio)';
  const clientAccessPasswordPlaceholder =
    isClientBiometricVisualAccess ? clientBiometricCredentialMask : 'Password (obbligatoria)';
  const clientAccessPlaceholderColor = isClientBiometricVisualAccess ? '#475569' : '#94a3b8';
  const clientAccessEmailDisplayValue = isClientBiometricVisualAccess ? '' : accessEmail;
  const clientAccessPhoneDisplayValue = isClientBiometricVisualAccess ? '' : accessPhone;
  const clientAccessPasswordDisplayValue = isClientBiometricVisualAccess ? '' : accessPassword;
  const clientRegisterPlaceholderColor = Platform.OS === 'android' ? '#64748b' : '#94a3b8';
  const [clientEntryMode, setClientEntryMode] = useState<ClientEntryMode>('access');
  const [registeringClient, setRegisteringClient] = useState(false);
  const clientRegistrationInFlightRef = useRef(false);
  const [registerError, setRegisterError] = useState('');
  const [registerProfile, setRegisterProfile] = useState(EMPTY_REGISTER_PROFILE);
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerPasswordError, setRegisterPasswordError] = useState('');
  const [registerEmailOtpSentTo, setRegisterEmailOtpSentTo] = useState('');
  const [registerEmailOtpChallengeVersion, setRegisterEmailOtpChallengeVersion] = useState(0);
  const [registerEmailOtpVerifiedFor, setRegisterEmailOtpVerifiedFor] = useState('');
  const [registerEmailOtpVerifiedAt, setRegisterEmailOtpVerifiedAt] = useState(0);
  const [registerEmailOtpSalonCode, setRegisterEmailOtpSalonCode] = useState('');
  const [registerEmailOtpExpiresAt, setRegisterEmailOtpExpiresAt] = useState(0);
  const [registerEmailOtpNow, setRegisterEmailOtpNow] = useState(Date.now());
  const [registerEmailOtpBusy, setRegisterEmailOtpBusy] = useState(false);
  const [registerEmailOtpMessage, setRegisterEmailOtpMessage] = useState('');
  const [registerEmailOtpModalVisible, setRegisterEmailOtpModalVisible] = useState(false);
  const [accessEmailOtpModalVisible, setAccessEmailOtpModalVisible] = useState(false);
  const [activeFooterDialog, setActiveFooterDialog] = useState<FooterDialogKey | null>(null);
  const ownerBackofficeRedirectStartedRef = useRef(false);
  const ownerBackofficeReplaceRef = useRef(router.replace);
  const ownerLoggedOutParam = Array.isArray(searchParams.ownerLoggedOut)
    ? searchParams.ownerLoggedOut[0]
    : searchParams.ownerLoggedOut;
  const ownerResetParam = Array.isArray(searchParams.ownerReset)
    ? searchParams.ownerReset[0]
    : searchParams.ownerReset;
  const passwordResetParam = Array.isArray(searchParams.passwordReset)
    ? searchParams.passwordReset[0]
    : searchParams.passwordReset;
  const isClientPasswordResetReturn = passwordResetParam === '1';
  const normalizedRegisterEmailForOtp = normalizeEmail(registerProfile.email);
  const registerEmailOtpIsVerified =
    normalizedRegisterEmailForOtp.length > 0 &&
    registerEmailOtpSalonCode.trim().length > 0 &&
    registerEmailOtpVerifiedFor === normalizedRegisterEmailForOtp;
  const registerEmailOtpExpired =
    !registerEmailOtpIsVerified &&
    registerEmailOtpExpiresAt > 0 &&
    registerEmailOtpNow >= registerEmailOtpExpiresAt;
  const registerEmailOtpCountdown = registerEmailOtpExpiresAt
    ? formatEmailOtpCountdown(registerEmailOtpExpiresAt, registerEmailOtpNow)
    : '';
  const resetClientRegistrationEmailVerification = useCallback(() => {
    setRegisterEmailOtpSentTo('');
    setRegisterEmailOtpVerifiedFor('');
    setRegisterEmailOtpVerifiedAt(0);
    setRegisterEmailOtpSalonCode('');
    setRegisterEmailOtpExpiresAt(0);
    setRegisterEmailOtpMessage('');
    setRegisterEmailOtpModalVisible(false);
  }, []);
  const accessEmailCompletionExpired =
    accessEmailCompletionExpiresAt > 0 &&
    accessEmailCompletionNow >= accessEmailCompletionExpiresAt;
  const accessEmailCompletionCountdown = accessEmailCompletionExpiresAt
    ? formatEmailOtpCountdown(accessEmailCompletionExpiresAt, accessEmailCompletionNow)
    : '';
  const footerDialogContent = useMemo(() => {
    switch (activeFooterDialog) {
      case 'privacy':
        return {
          title: 'Privacy',
          body:
            'SalonPro usa i dati inseriti solo per collegare clienti e saloni, gestire prenotazioni, notifiche e accesso agli appuntamenti. I dati restano legati al salone selezionato e non vengono usati per pubblicità esterna.',
          siteLabel: 'Leggi la Privacy Policy',
          siteUrl: PUBLIC_PRIVACY_URL,
        };
      case 'support':
        return {
          title: 'Supporto',
          body:
            'Per assistenza indica codice salone, email cliente e cosa stavi facendo: così possiamo controllare più velocemente.',
          email: PUBLIC_SUPPORT_EMAIL,
          instagramHandle: PUBLIC_INSTAGRAM_HANDLE,
          instagramUrl: PUBLIC_INSTAGRAM_DIRECT_URL,
          siteLabel: 'Apri la pagina supporto',
          siteUrl: PUBLIC_SUPPORT_URL,
        };
      case 'contacts':
        return {
          title: 'Contatti',
          body:
            'Per richieste sul tuo appuntamento, usa anche i contatti del salone collegato.',
          email: PUBLIC_SUPPORT_EMAIL,
          instagramHandle: PUBLIC_INSTAGRAM_HANDLE,
          instagramUrl: PUBLIC_INSTAGRAM_DIRECT_URL,
          siteLabel: 'Apri la pagina contatti',
          siteUrl: PUBLIC_CONTACTS_URL,
        };
      default:
        return null;
    }
  }, [activeFooterDialog]);
  const frontendLoggedOutParam = Array.isArray(searchParams.frontendLoggedOut)
    ? searchParams.frontendLoggedOut[0]
    : searchParams.frontendLoggedOut;
  const sideParam = Array.isArray(searchParams.side) ? searchParams.side[0] : searchParams.side;
  const modeParam = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
  const entryParam = Array.isArray(searchParams.entry) ? searchParams.entry[0] : searchParams.entry;
  const initialSalonParam = Array.isArray(searchParams.salon) ? searchParams.salon[0] : searchParams.salon;
  const initialCodeParam = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
  const isExplicitWebClientEntry =
    Platform.OS === 'web' &&
    sideParam === 'client' &&
    (entryParam === 'client' || Boolean(normalizeSalonCodeInput(initialSalonParam || initialCodeParam || '')));
  // A failed native resume returns to the current access screen once. The
  // audience chooser remains usable and does not resume the same stale route.
  const isNativeClientAccessFallback = Platform.OS !== 'web' &&
    (Array.isArray(searchParams.nativeAccessFallback)
      ? searchParams.nativeAccessFallback[0] : searchParams.nativeAccessFallback) === '1';
  const shouldUseClientLanding = isExplicitWebClientEntry ||
    (sideParam === 'client' && (!isNativeClientAccessFallback || !landingAudienceReady)) ||
    (landingAudienceReady && selectedLandingAudience === 'client');
  const registrationOnlyParam = Array.isArray(searchParams.registrationOnly)
    ? searchParams.registrationOnly[0]
    : searchParams.registrationOnly;
  const isRegistrationOnlyClientWebFlow = Platform.OS === 'web' && registrationOnlyParam === '1';
  const forceLoggedOutLanding = ownerLoggedOutParam === '1';
  const suppressOwnerBackofficeRedirect = frontendLoggedOutParam === '1';
  const keepNativeOwnerReloginMounted =
    Platform.OS !== 'web' && forceLoggedOutLanding;
  const ownerLoggedOutMarkerBlocksRedirect =
    Platform.OS === 'web' && forceLoggedOutLanding;
  const showOwnerResetReadyMessage = ownerResetParam === '1';
  const showOwnerResetDoneMessage = ownerResetParam === 'done';
  const ownerReadyForBackoffice =
    !audiencePickerOpen &&
    (sideParam === 'owner' || landingAudienceReady) &&
    isAuthenticated &&
    hasInitializedAuth &&
    isLoaded &&
    !ownerInitialDataHydrating &&
    ownerServerSyncReady &&
    !shouldUseClientLanding &&
    !suppressOwnerBackofficeRedirect &&
    !ownerLoggedOutMarkerBlocksRedirect &&
    !ownerExplicitLogout;
  ownerReadyForBackofficeRef.current = ownerReadyForBackoffice;

  useEffect(() => {
    ownerBackofficeReplaceRef.current = router.replace;
  }, [router.replace]);

  const beginOwnerBackofficeReplace = useCallback(() => {
    if (!ownerReadyForBackofficeRef.current || ownerBackofficeRedirectStartedRef.current) {
      return;
    }

    ownerBackofficeRedirectStartedRef.current = true;
    ownerBackofficeReplaceRef.current(BACKOFFICE_ROUTE);
  }, []);

  useEffect(() => {
    if (!ownerExplicitLogout && !forceLoggedOutLanding) {
      return;
    }

    ownerBackofficeRedirectStartedRef.current = false;
  }, [forceLoggedOutLanding, ownerExplicitLogout]);

  useEffect(() => {
    if (!registerEmailOtpExpiresAt || registerEmailOtpIsVerified) {
      return;
    }

    setRegisterEmailOtpNow(Date.now());
    const interval = setInterval(() => setRegisterEmailOtpNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [registerEmailOtpExpiresAt, registerEmailOtpIsVerified]);

  useEffect(() => {
    if (!accessEmailCompletionExpiresAt) {
      return;
    }

    setAccessEmailCompletionNow(Date.now());
    const interval = setInterval(() => setAccessEmailCompletionNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [accessEmailCompletionExpiresAt]);

  useEffect(() => {
    if (!ownerReadyForBackoffice) {
      ownerBackofficeRedirectStartedRef.current = false;
      return;
    }

    beginOwnerBackofficeReplace();
  }, [beginOwnerBackofficeReplace, ownerReadyForBackoffice]);

  const ensureClientInputVisible = useCallback((input: TextInput | null, delay = 80) => {
    if (Platform.OS === 'web' || !input) {
      return;
    }

    const run = () => {
      if (Date.now() < keyboardDismissDragUntilRef.current) {
        return;
      }

      const keyboardHeight = clientKeyboardHeightRef.current;
      if (keyboardHeight <= 0 || clientFocusedInputRef.current !== input) {
        return;
      }

      const inputHandle = findNodeHandle(input);
      if (!inputHandle || !scrollRef.current) {
        return;
      }

      try {
        const windowHeight = Dimensions.get('window').height;
        const screenHeight = Dimensions.get('screen').height;
        const resizedByKeyboard = Math.max(0, screenHeight - windowHeight);
        const overlayKeyboardHeight = Math.max(0, keyboardHeight - resizedByKeyboard);
        const keyboardGap = Platform.OS === 'ios' ? 20 : 132;
        const visibleBottom = windowHeight - overlayKeyboardHeight - keyboardGap;

        UIManager.measureInWindow(inputHandle, (_x, y, _width, height) => {
          if (Date.now() < keyboardDismissDragUntilRef.current || clientFocusedInputRef.current !== input) {
            return;
          }

          const overlap = y + height - visibleBottom;
          if (overlap <= 0) {
            return;
          }

          const targetY = Math.max(0, landingScrollYRef.current + overlap + 12);
          if (Math.abs(targetY - clientKeyboardScrollTargetRef.current) < 8) {
            return;
          }

          clientKeyboardScrollTargetRef.current = targetY;
          if (Platform.OS !== 'ios') landingScrollYRef.current = targetY;
          scrollRef.current?.scrollTo({
            y: targetY,
            // iOS only reveals a covered field; switching inputs must not
            // start another animated scroll while the keyboard is open.
            animated: Platform.OS !== 'ios',
          });
        });
      } catch {
        return;
      }
    };

    setTimeout(() => {
      requestAnimationFrame(run);
    }, delay);
  }, []);

  const ensureClientInputVisibleAfterKeyboardSettles = useCallback(
    (input: TextInput | null) => {
      (Platform.OS === 'ios' ? [40] : [24, 96, 180, 280]).forEach((delay) => {
        ensureClientInputVisible(input, delay);
      });
    },
    [ensureClientInputVisible]
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const showEvents = Platform.OS === 'ios'
      ? ['keyboardDidShow']
      : ['keyboardDidShow'];
    const subscriptions = showEvents.map((eventName) =>
      Keyboard.addListener(eventName as 'keyboardWillShow', (event) => {
        clientKeyboardHeightRef.current = event.endCoordinates?.height ?? 0;
        ensureClientInputVisibleAfterKeyboardSettles(clientFocusedInputRef.current);
      })
    );

    subscriptions.push(
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
        clientKeyboardHeightRef.current = 0;
        clientFocusedInputRef.current = null;
        clientKeyboardScrollTargetRef.current = 0;
      })
    );

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [ensureClientInputVisibleAfterKeyboardSettles]);

  const { scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: Platform.OS === 'web' ? 168 : Platform.OS === 'ios' ? 72 : 64,
    scrollDelay: Platform.OS === 'web' ? 120 : 48,
    allowWebScroll: true,
    shouldScrollNode: (node) =>
      node === salonCodeRef.current ||
      node === accessEmailRef.current ||
      node === accessPhoneRef.current ||
      node === registerNomeRef.current ||
      node === registerCognomeRef.current ||
      node === registerEmailRef.current ||
      node === registerPhoneRef.current ||
      node === registerInstagramRef.current,
  });

  const handleClientInputFocus = useCallback(
    (inputRef: React.RefObject<TextInput | null>) => {
      clientFocusedInputRef.current = inputRef.current;
      if (Platform.OS === 'web') {
        [80, 180, 360, 620].forEach((delay) => {
          scrollToField(inputRef, {
            topOffset: 168,
            scrollDelay: delay,
            animated: true,
          });
        });
        return;
      }
      ensureClientInputVisibleAfterKeyboardSettles(inputRef.current);
    },
    [ensureClientInputVisibleAfterKeyboardSettles, scrollToField]
  );

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);
  const normalizedIncomingSalonCode = useMemo(
    () => normalizeSalonCodeInput(initialSalonParam || initialCodeParam || ''),
    [initialCodeParam, initialSalonParam]
  );
  const isExplicitClientRegistrationEntry =
    modeParam === 'register' || entryParam === 'register' || registrationOnlyParam === '1';
  const shouldLockClientLandingFromExplicitEntry =
    !isNativeClientAccessFallback && !suppressOwnerBackofficeRedirect &&
    (!!normalizedIncomingSalonCode || sideParam === 'client' || isExplicitClientRegistrationEntry || isClientPasswordResetReturn);
  const forcedLandingAudience = useMemo<LandingAudience>(() => {
    if (suppressOwnerBackofficeRedirect) {
      return Platform.OS === 'web' && sideParam === 'client' ? 'client' : 'owner';
    }

    if (normalizedIncomingSalonCode) {
      return 'client';
    }

    if (sideParam === 'client' || isExplicitClientRegistrationEntry || isClientPasswordResetReturn) {
      return 'client';
    }

    if (sideParam === 'owner' || forceLoggedOutLanding) {
      return 'owner';
    }

    return 'owner';
  }, [
    forceLoggedOutLanding,
    isExplicitClientRegistrationEntry,
    isClientPasswordResetReturn,
    normalizedIncomingSalonCode,
    sideParam,
    suppressOwnerBackofficeRedirect,
  ]);
  const hasExplicitLandingAudienceContext =
    suppressOwnerBackofficeRedirect ||
    !!normalizedIncomingSalonCode ||
    isExplicitClientRegistrationEntry ||
    isClientPasswordResetReturn ||
    showOwnerResetReadyMessage ||
    showOwnerResetDoneMessage ||
    sideParam === 'client' ||
    sideParam === 'owner' ||
    forceLoggedOutLanding;
  const cancelInstallRecovery = useSalonInstallRecovery(
    hasInitializedAuth && isLoaded && !isAuthenticated && !audiencePickerOpen &&
      !hasExplicitLandingAudienceContext && !ownerExplicitLogout,
    (code) => router.replace({
      pathname: '/', params: { side: 'client', salon: code, entry: 'client' },
    } as Href)
  );
  useEffect(() => {
    if (hasExplicitLandingAudienceContext) {
      setSelectedLandingAudience((current) =>
        current === forcedLandingAudience ? current : forcedLandingAudience
      );
      setLandingAudienceReady(true);
      return;
    }

    let cancelled = false;

    AsyncStorage.getItem(LANDING_LAST_AUDIENCE_KEY)
      .then((storedValue) => {
        if (cancelled || landingAudienceChosenRef.current) {
          return;
        }

        if (storedValue === 'owner' || storedValue === 'client') {
          setSelectedLandingAudience((current) =>
            current === storedValue ? current : storedValue
          );
          return;
        }

        setSelectedLandingAudience(null);
      })
      .catch(() => {
        if (cancelled || landingAudienceChosenRef.current) {
          return;
        }

        setSelectedLandingAudience(null);
      })
      .finally(() => {
        if (!cancelled) setLandingAudienceReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [forcedLandingAudience, hasExplicitLandingAudienceContext]);

  useEffect(() => {
    if (!hasExplicitLandingAudienceContext) {
      return;
    }

    setSelectedLandingAudience((current) =>
      current === forcedLandingAudience ? current : forcedLandingAudience
    );
  }, [forcedLandingAudience, hasExplicitLandingAudienceContext]);
  const openAudiencePicker = () => {
    ++landingNavigationGenerationRef.current;
    clientLandingActiveRef.current = false;
    ownerReadyForBackofficeRef.current = false;
    cancelInstallRecovery();
    Keyboard.dismiss();
    setIsSalonSelectorOpen(false);
    setAudiencePickerOpen(true);
  };
  const setLandingAudience = useCallback((nextAudience: LandingAudience) => {
    ++landingNavigationGenerationRef.current;
    clientLandingActiveRef.current = false;
    ownerReadyForBackofficeRef.current = false;
    setIsSalonSelectorOpen(false);
    landingAudienceChosenRef.current = true;
    setLandingAudienceReady(true);
    void AsyncStorage.setItem(LANDING_LAST_AUDIENCE_KEY, nextAudience).catch(() => undefined);
    setSelectedLandingAudience((current) => {
      if (current === nextAudience) {
        return current;
      }

      return nextAudience;
    });
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);
  const normalizedAssociatedSalonCode = useMemo(
    () => normalizeSalonCodeInput(selectedAssociatedSalonCode || savedSalonCode),
    [savedSalonCode, selectedAssociatedSalonCode]
  );
  const publicSalonAliases = usePublicSalonAliases(Platform.OS === 'web' ? savedSalonCodes : []);
  const visibleSavedSalonCodes = useMemo(() => {
    if (Platform.OS !== 'web') return savedSalonCodes;
    const unique = new Map<string, string>();
    for (const code of savedSalonCodes) {
      const identity = publicSalonAliases[code] || code;
      if (!unique.has(identity) || code === normalizedAssociatedSalonCode) unique.set(identity, code);
    }
    return [...unique.values()];
  }, [savedSalonCodes, publicSalonAliases, normalizedAssociatedSalonCode]);
  const nativeLandingResumeScope = JSON.stringify([
    normalizedIncomingSalonCode, normalizedAssociatedSalonCode, sideParam, shouldUseClientLanding,
    landingAudienceReady, audiencePickerOpen, suppressOwnerBackofficeRedirect, forceLoggedOutLanding,
    isExplicitClientRegistrationEntry, isClientPasswordResetReturn, showOwnerResetReadyMessage,
    showOwnerResetDoneMessage, loadedClientSessionKey, hasInitializedAuth, isLoaded,
  ]);
  nativeLandingResumeScopeRef.current = nativeLandingResumeScope;
  const shouldForceClientRegistrationEntry =
    isExplicitClientRegistrationEntry &&
    !hasSavedClientProfile &&
    (normalizedIncomingSalonCode !== '' || normalizedAssociatedSalonCode !== '' || sideParam === 'client');
  const hasAssociatedSalon = normalizedAssociatedSalonCode !== '';
  const splitClientAccessPanels = wideAccessPanels && !hasAssociatedSalon && responsive.height < 960;
  const requestRemoveSavedSalon = (code: string) => {
    const remove = async () => {
      if (removingSavedSalonRef.current) return;
      removingSavedSalonRef.current = true;
      try {
        const remaining = savedSalonCodes.filter(item => item !== code);
        const nextCode = normalizedAssociatedSalonCode === code
          ? remaining[0] || '' : normalizedAssociatedSalonCode;
        await AsyncStorage.multiSet([
          [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(remaining)],
          [FRONTEND_LAST_SALON_CODE_KEY, nextCode],
        ]);
        setSavedSalonCodes(remaining);
        setSavedSalonCode(nextCode);
        setSelectedAssociatedSalonCode(nextCode);
        if (!remaining.length) setIsSalonSelectorOpen(false);
      } catch {
        if (Platform.OS === 'web') window.alert('Rimozione non riuscita. Riprova.');
        else Alert.alert('Rimozione non riuscita', 'Riprova.');
      } finally { removingSavedSalonRef.current = false; }
    };
    const message = `Rimuovere ${code} dai saloni salvati su questo dispositivo? Il profilo e le prenotazioni restano invariati. Potrai aggiungerlo di nuovo con codice o QR.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void remove();
    } else Alert.alert('Rimuovi salone salvato?', message, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Rimuovi', style: 'destructive', onPress: () => void remove() },
    ]);
  };
  const hasMultipleAssociatedSalons = visibleSavedSalonCodes.length > 1;
  const isClientAccessMissingRequiredFields =
    !normalizePhone(accessPhone);
  const isClientAccessButtonDisabled =
    !hasAssociatedSalon ||
    isAccessingClient ||
    isClientAccessMissingRequiredFields ||
    Boolean(accessEmailCompletionSentTo);
  const canUseBiometricAccess =
    Platform.OS !== 'web' && frontendBiometricEnabled && hasAssociatedSalon && hasSavedBiometricProfile;
  const biometricButtonLabel = Platform.OS === 'ios' ? 'Accedi con Face ID' : 'Impronta';
  const compactBiometricButtonLabel = Platform.OS === 'ios' ? 'Accedi con Face ID' : 'Impronta';
  const biometricButtonCaption =
    canUseBiometricAccess && savedBiometricIdentity?.salonCode === normalizedAssociatedSalonCode
      ? savedBiometricIdentity.email
      : Platform.OS === 'ios' ? 'Accesso rapido sicuro' : 'Accesso rapido e sicuro';
  const showCodeError = codeTouched && normalizedSalonCode === '';
  const showSalonCodeValidationError = showCodeError || salonAssociationError.trim().length > 0;
  const revealClientRegistration = useCallback(() => {
    if (registerScrollFrameRef.current !== null) cancelAnimationFrame(registerScrollFrameRef.current);
    registerScrollFrameRef.current = requestAnimationFrame(() => {
      registerScrollFrameRef.current = null;
      const request = registerScrollRequestRef.current;
      const viewport = scrollRef.current;
      const viewportView = viewport?.getNativeScrollRef();
      const section = registerSectionRef.current;
      const isCurrent = () => request !== null && registerScrollRequestRef.current === request &&
        clientLandingActiveRef.current && request.navigationGeneration === landingNavigationGenerationRef.current &&
        scrollRef.current === viewport && registerSectionRef.current === section;
      if (!viewport || !viewportView || !section || !isCurrent()) return;
      viewportView.measureInWindow((_x, viewportY, _width, viewportHeight) => {
        if (!isCurrent() || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
        section.measureInWindow((_sectionX, sectionY, _sectionWidth, sectionHeight) => {
          if (!isCurrent() || !Number.isFinite(sectionHeight) || sectionHeight <= 0 ||
            !Number.isFinite(sectionY) || !Number.isFinite(viewportY) || !Number.isFinite(landingScrollYRef.current)) return;
          // Measure the mounted card in the same coordinate space as the scroll
          // viewport. Leave its heading above the first fields, not off screen.
          const topGap = Math.min(96, Math.round(viewportHeight * 0.15));
          const y = Math.max(0, landingScrollYRef.current + sectionY - viewportY - topGap);
          registerScrollRequestRef.current = null;
          viewport.scrollTo({ y, animated: true });
        });
      });
    });
  }, []);

  useEffect(() => () => {
    registerScrollRequestRef.current = null;
    if (registerScrollFrameRef.current !== null) cancelAnimationFrame(registerScrollFrameRef.current);
  }, []);

  useEffect(() => {
    setIsSalonAssociationCardExpanded((current) => {
      const wantsSalonCode = searchParams.associateSalon === '1';
      const nextExpanded = wantsSalonCode;
      return current === nextExpanded ? current : nextExpanded;
    });
  }, [hasAssociatedSalon, searchParams.associateSalon]);

  useEffect(() => {
    if (hasAssociatedSalon) {
      setClientEntryMode(
        isClientPasswordResetReturn
          ? 'access'
          : shouldForceClientRegistrationEntry ||
              (Boolean(normalizedIncomingSalonCode) && !hasSavedClientProfile)
          ? 'register'
          : 'access'
      );
    }
  }, [
    hasAssociatedSalon,
    hasSavedClientProfile,
    isClientPasswordResetReturn,
    normalizedIncomingSalonCode,
    shouldForceClientRegistrationEntry,
  ]);

  const loadSavedClientSession = useCallback(
    async (preferredSalonCode?: string, options?: { force?: boolean }) => {
      const normalizedPreferredSalon = normalizeSalonCodeInput(preferredSalonCode ?? '');
      const loadKey = normalizedPreferredSalon || '__default__';
      const shouldForceReload = options?.force === true;

      if (
        (!shouldForceReload && lastLoadedClientSessionKeyRef.current === loadKey) ||
        loadingClientSessionKeyRef.current === loadKey
      ) {
        return;
      }

      loadingClientSessionKeyRef.current = loadKey;
      lastLoadedClientSessionKeyRef.current = loadKey;
      setSavedBiometricIdentity(null);

      try {
        const [
          savedProfileRaw,
          savedSalonRaw,
          savedSalonCodesRaw,
          biometricEnabledRaw,
          savedBiometricSalonCodeRaw,
          savedBiometricProfileRaw,
          savedAccessDraftRaw,
          savedRegisterDraftRaw,
        ] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_SAVED_SALON_CODES_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY),
          AsyncStorage.getItem(HOME_CLIENT_ACCESS_DRAFT_KEY),
          AsyncStorage.getItem(HOME_CLIENT_REGISTER_DRAFT_KEY),
        ]);

        const normalizedStoredSalon = normalizeSalonCodeInput(savedSalonRaw ?? '');
        const parsedSalonCodes = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
        const nextSavedSalonCodes = Array.isArray(parsedSalonCodes)
          ? buildSavedSalonCodeList([normalizedPreferredSalon, normalizedStoredSalon, ...(parsedSalonCodes as string[])])
          : buildSavedSalonCodeList([normalizedPreferredSalon, normalizedStoredSalon]);
        const effectiveSalonCode =
          normalizedPreferredSalon || normalizedStoredSalon || nextSavedSalonCodes[0] || '';

        setSavedSalonCode((current) => (current === normalizedStoredSalon ? current : normalizedStoredSalon));
        setSavedSalonCodes((current) =>
          JSON.stringify(current) === JSON.stringify(nextSavedSalonCodes) ? current : nextSavedSalonCodes
        );
        setSelectedAssociatedSalonCode((current) =>
          current === effectiveSalonCode ? current : effectiveSalonCode
        );
        if (savedAccessDraftRaw) {
          const accessDraft = JSON.parse(savedAccessDraftRaw) as { email?: string; phone?: string };
          const nextAccessEmail = String(accessDraft.email ?? '').trim();
          const nextAccessPhone = limitPhoneToTenDigits(String(accessDraft.phone ?? '').trim());
          setAccessEmail((current) => (current === nextAccessEmail ? current : nextAccessEmail));
          setAccessPhone((current) => (current === nextAccessPhone ? current : nextAccessPhone));
        }

        if (savedRegisterDraftRaw) {
          const registerDraft = JSON.parse(savedRegisterDraftRaw) as typeof EMPTY_REGISTER_PROFILE;
          const nextRegisterProfile = {
            nome: String(registerDraft.nome ?? ''),
            cognome: String(registerDraft.cognome ?? ''),
            email: String(registerDraft.email ?? ''),
            telefono: limitPhoneToTenDigits(String(registerDraft.telefono ?? '')),
            instagram: String(registerDraft.instagram ?? ''),
          };
          setRegisterProfile((current) =>
            JSON.stringify(current) === JSON.stringify(nextRegisterProfile)
              ? current
              : nextRegisterProfile
          );
        }

        const scopedProfileRaw = effectiveSalonCode
          ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(effectiveSalonCode))
          : null;
        const effectiveProfileRaw = scopedProfileRaw ?? savedProfileRaw;

        setHasSavedClientProfile(false);
        setSavedProfileEmail('');
        setSavedProfilePhone('');
        let effectiveBiometricEnabled = biometricEnabledRaw === 'true';

        if (effectiveProfileRaw) {
          const parsed = JSON.parse(effectiveProfileRaw) as {
            email?: string;
            telefono?: string;
            nome?: string;
            cognome?: string;
          };

          const email = normalizeEmail(parsed.email ?? '');
          const phone = normalizePhone(parsed.telefono ?? '');
          const hasValidProfile =
            Boolean((parsed.nome ?? '').trim()) &&
            Boolean((parsed.cognome ?? '').trim()) &&
            Boolean(email) &&
            Boolean(phone);

          if (hasValidProfile) {
            const scopedBiometricEnabledRaw = await AsyncStorage.getItem(
              buildFrontendBiometricEnabledKey({
                salonCode: effectiveSalonCode,
                email,
                phone,
              })
            );
            effectiveBiometricEnabled =
              scopedBiometricEnabledRaw === 'true' || scopedBiometricEnabledRaw === 'false'
                ? scopedBiometricEnabledRaw === 'true'
                : biometricEnabledRaw === 'true';
            setHasSavedClientProfile(true);
            setSavedProfileEmail(email);
            setSavedProfilePhone(phone);
          }
        }

        setFrontendBiometricEnabled((current) =>
          current === effectiveBiometricEnabled ? current : effectiveBiometricEnabled
        );

        const effectiveBiometricSalonCode = normalizeSalonCodeInput(
          savedBiometricSalonCodeRaw ?? effectiveSalonCode
        );
        const scopedBiometricProfileRaw =
          effectiveBiometricSalonCode
            ? await AsyncStorage.getItem(
                buildFrontendBiometricProfileKeyForSalon(effectiveBiometricSalonCode)
              )
            : null;
        const effectiveBiometricProfileRaw = scopedBiometricProfileRaw ?? savedBiometricProfileRaw;
        const hasMatchingBiometricProfile =
          effectiveBiometricEnabled &&
          Boolean(effectiveBiometricSalonCode) &&
          effectiveBiometricSalonCode === effectiveSalonCode &&
          Boolean(effectiveBiometricProfileRaw);

        if (hasMatchingBiometricProfile && effectiveBiometricProfileRaw) {
          try {
            const biometricProfile = JSON.parse(effectiveBiometricProfileRaw) as { email?: string; telefono?: string };
            const biometricEmail = normalizeEmail(String(biometricProfile.email ?? ''));
            const biometricPhone = normalizePhone(String(biometricProfile.telefono ?? ''));
            if (biometricEmail && biometricPhone) {
              setSavedBiometricIdentity({ salonCode: effectiveBiometricSalonCode, email: biometricEmail });
            }
          } catch {
            // A malformed saved label must not change the existing access gates.
          }
        }

        setHasSavedBiometricProfile((current) =>
          current === hasMatchingBiometricProfile ? current : hasMatchingBiometricProfile
        );
      } catch (error) {
        lastLoadedClientSessionKeyRef.current = '';
        console.log('Errore caricamento accesso rapido cliente:', error);
      } finally {
        setLoadedClientSessionKey(loadKey);
        if (loadingClientSessionKeyRef.current === loadKey) {
          loadingClientSessionKeyRef.current = '';
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!hasInitializedAuth || !isLoaded || (isAuthenticated && !shouldUseClientLanding)) {
      return;
    }

    void loadSavedClientSession(normalizedIncomingSalonCode);
  }, [
    hasInitializedAuth,
    isAuthenticated,
    shouldUseClientLanding,
    isLoaded,
    loadSavedClientSession,
    normalizedIncomingSalonCode,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!hasInitializedAuth || !isLoaded || (isAuthenticated && !shouldUseClientLanding)) {
        return undefined;
      }

      void loadSavedClientSession(normalizedIncomingSalonCode, { force: true });
      return undefined;
    }, [
      hasInitializedAuth,
      isAuthenticated,
      shouldUseClientLanding,
      isLoaded,
      loadSavedClientSession,
      normalizedIncomingSalonCode,
    ])
  );

  useEffect(() => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') ||
      !hasInitializedAuth || !isLoaded || !landingAudienceReady || !shouldUseClientLanding ||
      audiencePickerOpen || suppressOwnerBackofficeRedirect || forceLoggedOutLanding ||
      isNativeClientAccessFallback || isExplicitClientRegistrationEntry || isClientPasswordResetReturn ||
      showOwnerResetReadyMessage || showOwnerResetDoneMessage || sideParam === 'owner' ||
      loadedClientSessionKey !== (normalizedIncomingSalonCode || '__default__')) return;

    let cancelled = false;
    const sessionGeneration = nativeCustomerSessionGeneration();
    const navigationGeneration = landingNavigationGenerationRef.current;
    const preferredSalon = normalizedIncomingSalonCode || normalizedAssociatedSalonCode;
    const resumeScope = nativeLandingResumeScope;
    void readNativeCustomerSession({ salonCode: preferredSalon || undefined }).then(session => {
      if (cancelled || !session || !clientLandingActiveRef.current ||
        nativeLandingResumeScopeRef.current !== resumeScope ||
        nativeCustomerSessionGeneration() !== sessionGeneration ||
        landingNavigationGenerationRef.current !== navigationGeneration) return;
      const resumeKey = `${session.salonCode}:${session.customerId}:${sessionGeneration}:${navigationGeneration}`;
      if (nativeLandingResumeStartedRef.current === resumeKey) return;
      nativeLandingResumeStartedRef.current = resumeKey;
      router.replace({ pathname: '/cliente', params: {
        salon: session.salonCode, mode: 'booking', autologin: '1', nativeSession: '1',
        email: session.email, phone: session.phone,
      } } as Href);
    });
    return () => { cancelled = true; };
  }, [
    hasInitializedAuth, isLoaded, landingAudienceReady, shouldUseClientLanding, audiencePickerOpen,
    suppressOwnerBackofficeRedirect, forceLoggedOutLanding, isNativeClientAccessFallback, isExplicitClientRegistrationEntry,
    isClientPasswordResetReturn, showOwnerResetReadyMessage, showOwnerResetDoneMessage, sideParam,
    loadedClientSessionKey, normalizedIncomingSalonCode, normalizedAssociatedSalonCode, nativeLandingResumeScope, router,
  ]);

  useEffect(() => {
    if (
      audiencePickerOpen ||
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      suppressOwnerBackofficeRedirect ||
      forceLoggedOutLanding ||
      isExplicitClientRegistrationEntry ||
      sideParam === 'owner'
    ) {
      return;
    }

    const activeSession = readFrontendWebActiveSession();
    if (!activeSession) {
      return;
    }

    const expectedLoadKey = activeSession.salonCode || '__default__';
    const hasLoadedRelevantSession =
      loadedClientSessionKey === expectedLoadKey ||
      (loadedClientSessionKey === '__default__' && !normalizedIncomingSalonCode);
    if (!hasLoadedRelevantSession) {
      return;
    }

    if (
      normalizedIncomingSalonCode &&
      normalizedIncomingSalonCode !== activeSession.salonCode
    ) {
      return;
    }

    const nextParams = new URLSearchParams({
      salon: activeSession.salonCode,
      mode: 'booking',
    });
    window.location.replace(`/cliente?${nextParams.toString()}`);
  }, [
    audiencePickerOpen,
    forceLoggedOutLanding,
    isExplicitClientRegistrationEntry,
    loadedClientSessionKey,
    normalizedIncomingSalonCode,
    sideParam,
    suppressOwnerBackofficeRedirect,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    AsyncStorage.setItem(
      HOME_CLIENT_ACCESS_DRAFT_KEY,
      JSON.stringify({
        email: accessEmail,
        phone: accessPhone,
      })
    ).catch((error) => {
      console.log('Errore salvataggio draft accesso cliente home:', error);
    });
  }, [accessEmail, accessPhone]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    AsyncStorage.setItem(HOME_CLIENT_REGISTER_DRAFT_KEY, JSON.stringify(registerProfile)).catch(
      (error) => {
        console.log('Errore salvataggio draft registrazione cliente home:', error);
      }
    );
  }, [registerProfile]);

  useEffect(() => {
    if (!normalizedIncomingSalonCode) {
      return;
    }

    if (
      appliedIncomingSalonCodeRef.current === normalizedIncomingSalonCode ||
      !hasInitializedAuth ||
      !isLoaded ||
      (isAuthenticated && !shouldUseClientLanding)
    ) {
      return;
    }

    appliedIncomingSalonCodeRef.current = normalizedIncomingSalonCode;

    setSavedSalonCode((current) =>
      current === normalizedIncomingSalonCode ? current : normalizedIncomingSalonCode
    );
    setSelectedAssociatedSalonCode((current) =>
      current === normalizedIncomingSalonCode ? current : normalizedIncomingSalonCode
    );
    setSavedSalonCodes((current) => {
      const nextSavedSalonCodes = buildSavedSalonCodeList([
        normalizedIncomingSalonCode,
        ...current,
      ]);

      return JSON.stringify(nextSavedSalonCodes) === JSON.stringify(current)
        ? current
        : nextSavedSalonCodes;
    });

    (async () => {
      try {
        const [savedSalonRaw, savedSalonCodesRaw] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_SAVED_SALON_CODES_KEY),
        ]);
        const normalizedStoredSalon = normalizeSalonCodeInput(savedSalonRaw ?? '');
        const parsedSalonCodes = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
        const nextSavedSalonCodes = Array.isArray(parsedSalonCodes)
          ? buildSavedSalonCodeList([
              normalizedIncomingSalonCode,
              normalizedStoredSalon,
              ...(parsedSalonCodes as string[]),
            ])
          : buildSavedSalonCodeList([normalizedIncomingSalonCode, normalizedStoredSalon]);

        await AsyncStorage.multiSet([
          [FRONTEND_LAST_SALON_CODE_KEY, normalizedIncomingSalonCode],
          [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalonCodes)],
        ]);
      } catch (error) {
        console.log('Errore salvataggio salone associato dalla home:', error);
      }
    })();
  }, [
    hasInitializedAuth,
    isAuthenticated,
    shouldUseClientLanding,
    isLoaded,
    normalizedIncomingSalonCode,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));
    const hasRecoveryPayload =
      searchParams.get('recovery') === '1' ||
      searchParams.get('type') === 'recovery' ||
      hashParams.get('recovery') === '1' ||
      hashParams.get('type') === 'recovery';

    if (!hasRecoveryPayload || currentUrl.pathname === '/reset-password') {
      return;
    }

    const nextPath = `/reset-password${currentUrl.search}${currentUrl.hash}`;
    router.replace(nextPath as Href);
  }, [router]);

  const handleCodeSectionLayout = (event: LayoutChangeEvent) => {
    setCodeSectionY(event.nativeEvent.layout.y);
  };

  const navigateToHref = useCallback((href: Href) => {
    const pathname = typeof href === 'string' ? href : href.pathname;
    const shouldReplaceHistory = pathname === '/cliente' || pathname === '/cliente-scanner';
    if (shouldReplaceHistory && !clientLandingActiveRef.current) return;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (typeof href === 'string') {
        if (shouldReplaceHistory) {
          window.location.replace(href);
        } else {
          window.location.assign(href);
        }
        return;
      }

      let nextPath = href.pathname;
      const params = new URLSearchParams();
      Object.entries(href.params ?? {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        const token = `[${key}]`;
        if (nextPath.includes(token)) {
          nextPath = nextPath.replace(token, encodeURIComponent(String(value)));
          return;
        }
        params.set(key, String(value));
      });

      const nextUrl = params.size > 0 && !nextPath.includes('?') ? `${nextPath}?${params.toString()}` : nextPath;
      if (shouldReplaceHistory) {
        window.location.replace(nextUrl);
      } else {
        window.location.assign(nextUrl);
      }
      return;
    }

    if (shouldReplaceHistory) {
      router.replace(href);
      return;
    }

    router.push(href);
  }, [router]);

  const associateSalonWithCode = async (discoveredCode?: string) => {
    if (isAssociatingSalon) {
      return;
    }
    if (!discoveredCode && !useLegacySalonCode && !/^[1-9][0-9]{5}$/.test(salonCode)) {
      setSalonAssociationError('Inserisci tutte le 6 cifre del codice salone.');
      return;
    }

    if (!discoveredCode && !normalizedSalonCode) {
      setCodeTouched(true);
      setSalonAssociationError('');
      return;
    }

    setSalonAssociationError('');
    setIsAssociatingSalon(true);

    let resolvedPortal: {
      workspace?: { id?: string | null; salonCode?: string | null } | null;
      servizi?: unknown[];
      operatori?: unknown[];
    } | null = null;

    try {
      const canonicalSalonCode = await resolveManualSalonCode(discoveredCode || normalizedSalonCode);
      resolvedPortal = await resolveSalonByCode(canonicalSalonCode, {
        forceFresh: true,
        publicSnapshotOnly: true,
      });

      if (!resolvedPortal?.workspace?.id) {
        resolvedPortal = await fetchClientPortalSnapshot(canonicalSalonCode);
      }
    } catch (error) {
      console.log('Errore verifica salone dalla home:', error);
      if (isSupabaseSchemaCacheLookupError(error)) {
        setCodeTouched(true);
        setSalonAssociationError(
          'Il collegamento al salone e momentaneamente in aggiornamento. Riprova tra pochi secondi.'
        );
        return;
      }
      if (isClientPortalNetworkLookupError(error)) {
        setCodeTouched(true);
        setSalonAssociationError(
          'Non riesco a verificare il salone adesso. Controlla la connessione e riprova tra un attimo.'
        );
        return;
      }

      setCodeTouched(true);
      setSalonAssociationError(
        'Non riesco a verificare il salone adesso. Riprova tra un attimo.'
      );
      return;
    } finally {
      setIsAssociatingSalon(false);
    }

    const validatedSalonCode = normalizeSalonCodeInput(
      resolvedPortal?.workspace?.salonCode ?? discoveredCode ?? normalizedSalonCode
    );

    if (!validatedSalonCode || !resolvedPortal?.workspace?.id) {
      setCodeTouched(true);
      setSalonAssociationError(
        'Questo salone non esiste o non è ancora attivo. Controlla il codice oppure usa il QR corretto.'
      );
      return;
    }
    const nextSavedSalonCodes = buildSavedSalonCodeList([
      validatedSalonCode,
      ...savedSalonCodes,
      savedSalonCode,
    ]);

    setSavedSalonCode(validatedSalonCode);
    setSelectedAssociatedSalonCode(validatedSalonCode);
    setSavedSalonCodes(nextSavedSalonCodes);
    setIsSalonAssociationCardExpanded(false);
    setSalonCode('');
    setCodeTouched(false);
    setAccessError('');
    setRegisterError('');
    setIsSalonSelectorOpen(false);

    try {
      await AsyncStorage.multiSet([
        [FRONTEND_LAST_SALON_CODE_KEY, validatedSalonCode],
        [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalonCodes)],
      ]);
    } catch (error) {
      console.log('Errore associazione salone dalla home:', error);
    }
    if (discoveredCode) navigateToHref({ pathname: '/', params: { salon: validatedSalonCode, side: 'client' } });
  };

  const handleCodeSubmit = (_event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    setCodeTouched(true);
    void associateSalonWithCode();
  };

  const handleCodePress = () => {
    void associateSalonWithCode();
  };

  const shouldLockClientLanding = shouldLockClientLandingFromExplicitEntry;
  const shouldShowSalonDiscovery = !normalizedIncomingSalonCode && !isExplicitClientRegistrationEntry && !isClientPasswordResetReturn;
  const shouldShowLandingAudienceSwitcher = !shouldLockClientLanding;
  const showOwnerLanding = !shouldLockClientLanding && selectedLandingAudience === 'owner';
  const showClientLanding = shouldLockClientLanding || selectedLandingAudience === 'client';
  clientLandingActiveRef.current = showClientLanding && !audiencePickerOpen;
  useEffect(() => {
    // Restore the guard on effect replay (Strict Mode / Fast Refresh in dev).
    clientLandingActiveRef.current = showClientLanding && !audiencePickerOpen;
    return () => { clientLandingActiveRef.current = false; };
  }, [showClientLanding, audiencePickerOpen]);

  const validateClientAccess = useCallback(
    async (params: { email: string; phone: string; password?: string }) => {
      const navigationGeneration = landingNavigationGenerationRef.current;
      if (!clientLandingActiveRef.current) {
        return { ok: false as const, error: 'Accesso cliente annullato.' };
      }
      const normalizedEmail = normalizeEmail(params.email);
      const normalizedPhone = limitPhoneToTenDigits(normalizePhone(params.phone));
      const isSavedProfileAttempt =
        hasSavedClientProfile &&
        normalizedEmail === savedProfileEmail &&
        normalizedPhone === savedProfilePhone;

      if (!normalizedAssociatedSalonCode) {
        return { ok: false as const, error: 'Associa prima un salone per poter accedere.' };
      }

      if (!normalizedPhone) {
        return { ok: false as const, error: 'Inserisci il cellulare usato nella registrazione.' };
      }

      try {
        let matchedCustomer:
          | {
              nome: string;
              email?: string | null;
              telefono?: string | null;
              instagram?: string | null;
              salonCode?: string | null;
            }
          | null = null;

        try {
          const { data, error } = await lookupCustomerForPortal({
            p_salon_code: normalizedAssociatedSalonCode,
            p_customer_email: normalizedEmail || null,
            p_customer_phone: normalizedPhone || null,
            p_customer_password: params.password ?? '',
          });

          if (error) {
            throw error;
          }

          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const directMatchedCustomer = data as Record<string, unknown>;
            const directMatchedScore = Number(directMatchedCustomer.score ?? 0);
            const directMatchedSameScoreCount = Number(directMatchedCustomer.sameScoreCount ?? 0);
            const directCustomerEmail = String(directMatchedCustomer.email ?? '').trim().toLowerCase();
            const directCustomerPhone = limitPhoneToTenDigits(
              String(directMatchedCustomer.telefono ?? '').trim()
            );
            const directSameEmail =
              Boolean(directMatchedCustomer.sameEmail) && directCustomerEmail === normalizedEmail;
            const directSamePhone =
              Boolean(directMatchedCustomer.samePhone) && directCustomerPhone === normalizedPhone;

            if (directMatchedScore > 0) {
              if (
                isSalonCustomerEmailCompletionCandidate({
                  matchedEmail: directCustomerEmail,
                  matchedPhone: directCustomerPhone,
                  submittedPhone: normalizedPhone,
                })
              ) {
                return {
                  ok: false as const,
                  emailCompletionRequired: true as const,
                  email: normalizedEmail,
                  phone: normalizedPhone,
                };
              }

              if (!directSameEmail || !directSamePhone) {
                return {
                  ok: false as const,
                  error:
                    directSamePhone && !directSameEmail
                      ? 'Email non associata a questo cliente.'
                      : directSameEmail && !directSamePhone
                        ? 'Numero non associato a questo cliente.'
                        : 'Email e numero non risultano associati.',
                };
              }

              if (directMatchedSameScoreCount > 1) {
                return {
                  ok: false as const,
                  error:
                    'Ho trovato più profili simili. Usa i dati esatti con cui sei registrato nel salone oppure registrati di nuovo.',
                };
              }

              matchedCustomer = {
                nome: String(directMatchedCustomer.nome ?? '').trim(),
                email: directCustomerEmail,
                telefono: directCustomerPhone,
                instagram: String(directMatchedCustomer.instagram ?? '').trim(),
                salonCode: String(directMatchedCustomer.salonCode ?? '').trim() || normalizedAssociatedSalonCode,
              };
            }
          }
        } catch (directCustomerLookupError) {
          const lookupErrorText =
            directCustomerLookupError instanceof Error
              ? directCustomerLookupError.message
              : directCustomerLookupError && typeof directCustomerLookupError === 'object'
                ? String(
                    (directCustomerLookupError as { message?: unknown }).message ??
                      directCustomerLookupError
                  )
                : String(directCustomerLookupError);
          const normalizedLookupError = lookupErrorText.toLowerCase();
          if (normalizedLookupError.includes('customer_password_required')) {
            return {
              ok: false as const,
              error: 'Inserisci la password scelta durante la registrazione.',
              passwordError: true as const,
            };
          }
          if (normalizedLookupError.includes('invalid_customer_password')) {
            return {
              ok: false as const,
              error: 'Password non corretta.',
              passwordError: true as const,
            };
          }
          console.log('Errore lookup cliente pubblico diretto dalla home:', directCustomerLookupError);
        }

        if (!matchedCustomer) {
          const latestSalonState = await fetchClientPortalSnapshot(normalizedAssociatedSalonCode);
          const sourceClienti = (latestSalonState?.clienti ?? []) as HomeClientLookupItem[];
          const rankedMatches = sourceClienti
            .map((item) => {
              const sameEmail = (item.email ?? '').trim().toLowerCase() === normalizedEmail;
              const samePhone = limitPhoneToTenDigits(item.telefono ?? '') === normalizedPhone;
              const score = (sameEmail ? 2 : 0) + (samePhone ? 2 : 0);

              return {
                item,
                score,
              };
            })
            .filter((entry) => entry.score > 0)
            .sort((first, second) => second.score - first.score);

          const bestMatch = rankedMatches[0] ?? null;
          const secondBestMatch = rankedMatches[1] ?? null;

          if (!bestMatch || !bestMatch.item) {
            return {
              ok: false as const,
              error: isSavedProfileAttempt
                ? DELETED_CLIENT_PROFILE_MESSAGE
                : 'Credenziali errate per questo salone. Controlla email o cellulare oppure usa Registrati.',
            };
          }

          if (secondBestMatch && secondBestMatch.score === bestMatch.score) {
            return {
              ok: false as const,
              error:
                'Ho trovato più profili simili. Usa i dati esatti con cui sei registrato nel salone oppure registrati di nuovo.',
            };
          }

          const bestSameEmail = (bestMatch.item.email ?? '').trim().toLowerCase() === normalizedEmail;
          const bestSamePhone = limitPhoneToTenDigits(bestMatch.item.telefono ?? '') === normalizedPhone;

          if (
            isSalonCustomerEmailCompletionCandidate({
              matchedEmail: bestMatch.item.email,
              matchedPhone: bestMatch.item.telefono,
              submittedPhone: normalizedPhone,
            })
          ) {
            return {
              ok: false as const,
              emailCompletionRequired: true as const,
              email: normalizedEmail,
              phone: normalizedPhone,
            };
          }

          if (!bestSameEmail || !bestSamePhone) {
            const emailExistsInSalon = sourceClienti.some(
              (item) => (item.email ?? '').trim().toLowerCase() === normalizedEmail
            );
            const phoneExistsInSalon = sourceClienti.some(
              (item) => limitPhoneToTenDigits(item.telefono ?? '') === normalizedPhone
            );

            return {
              ok: false as const,
              error:
                emailExistsInSalon && phoneExistsInSalon
                  ? 'Email e numero non appartengono allo stesso cliente.'
                  : !emailExistsInSalon && phoneExistsInSalon
                    ? 'Email non associata a questo cliente.'
                    : emailExistsInSalon && !phoneExistsInSalon
                      ? 'Numero non associato a questo cliente.'
                      : 'Email e numero non risultano associati.',
            };
          }

          matchedCustomer = {
            nome: String(bestMatch.item.nome ?? '').trim(),
            email: String(bestMatch.item.email ?? '').trim().toLowerCase(),
            telefono: limitPhoneToTenDigits(String(bestMatch.item.telefono ?? '')),
            instagram: String(bestMatch.item.instagram ?? '').trim(),
            salonCode: normalizedAssociatedSalonCode,
          };
        }

        const matchedEmail = normalizeEmail(String(matchedCustomer.email ?? ''));
        const matchedPhone = limitPhoneToTenDigits(String(matchedCustomer.telefono ?? ''));

        if (matchedEmail !== normalizedEmail || matchedPhone !== normalizedPhone) {
          return {
            ok: false as const,
            error:
              matchedPhone === normalizedPhone && matchedEmail !== normalizedEmail
                ? 'Email non associata a questo cliente.'
                : matchedEmail === normalizedEmail && matchedPhone !== normalizedPhone
                  ? 'Numero non associato a questo cliente.'
                  : 'Email e numero non appartengono allo stesso cliente.',
          };
        }

        const nameParts = matchedCustomer.nome.split(/\s+/).filter(Boolean);
        const nextProfile = {
          nome: formatCustomerNamePart(nameParts.shift() ?? ''),
          cognome: formatCustomerNamePart(nameParts.join(' ')),
          email: matchedEmail,
          telefono: matchedPhone,
          instagram: String(matchedCustomer.instagram ?? '').trim(),
        };
        const resolvedSalonCode =
          normalizeSalonCodeInput(String(matchedCustomer.salonCode ?? '').trim()) ||
          normalizedAssociatedSalonCode;

        if (!clientLandingActiveRef.current || navigationGeneration !== landingNavigationGenerationRef.current) {
          return { ok: false as const, error: 'Accesso cliente annullato.' };
        }
        setSavedProfileEmail(nextProfile.email);
        setSavedProfilePhone(nextProfile.telefono);
        setSavedSalonCode(resolvedSalonCode);
        setSelectedAssociatedSalonCode(resolvedSalonCode);
        setHasSavedClientProfile(true);

        try {
          await AsyncStorage.multiSet([
            [FRONTEND_PROFILE_KEY, JSON.stringify(nextProfile)],
            [buildFrontendProfileKeyForSalon(resolvedSalonCode), JSON.stringify(nextProfile)],
            [FRONTEND_LAST_SALON_CODE_KEY, resolvedSalonCode],
          ]);
        } catch (storageError) {
          // A customer already validated by the server must not be locked out
          // because Android local storage is temporarily unavailable/corrupt.
          // The profile stays usable for the current session and can be
          // persisted again on the next successful access.
          console.log('Accesso cliente valido, salvataggio locale non riuscito:', storageError);
        }

        if (params.password) {
          try {
            await saveClientPasswordToVault({
              salonCode: resolvedSalonCode,
              email: nextProfile.email,
              phone: nextProfile.telefono,
              password: params.password,
            });
          } catch (vaultError) {
            console.log('Accesso cliente valido, password locale non salvata:', vaultError);
          }
        }

        if (!clientLandingActiveRef.current || navigationGeneration !== landingNavigationGenerationRef.current) {
          return { ok: false as const, error: 'Accesso cliente annullato.' };
        }
        return {
          ok: true as const,
          profile: nextProfile,
          salonCode: resolvedSalonCode,
        };
      } catch (error) {
        console.log('Errore accesso cliente dalla home:', error);
        return {
          ok: false as const,
          error: 'Non riesco a completare l’accesso in questo momento. Riprova tra un attimo.',
        };
      }
    },
    [hasSavedClientProfile, normalizedAssociatedSalonCode, savedProfileEmail, savedProfilePhone]
  );

  const clearAccessEmailCompletion = useCallback(() => {
    setAccessEmailCompletionSentTo('');
    setAccessEmailCompletionExpiresAt(0);
    setAccessEmailCompletionMessage('');
  }, []);

  const requestAccessEmailCompletionOtp = useCallback(
    async ({ email, phone }: { email: string; phone: string }) => {
      const normalizedEmailValue = normalizeEmail(email);
      const normalizedPhoneValue = limitPhoneToTenDigits(phone);

      if (
        !normalizedAssociatedSalonCode ||
        !isValidEmail(normalizedEmailValue) ||
        !isValidPhone10(normalizedPhoneValue)
      ) {
        setAccessError('Controlla email, cellulare e salone collegato.');
        return false;
      }

      setAccessEmailCompletionBusy(true);
      setAccessEmailCompletionMessage(
        'Codice inviato via email. Se non lo trovi, controlla anche Spam o Posta indesiderata.'
      );
      const result = await requestEmailOtp({
        email: normalizedEmailValue,
        purpose: 'client_email_completion',
        salonCode: normalizedAssociatedSalonCode,
        customerPhone: normalizedPhoneValue,
      });
      setAccessEmailCompletionBusy(false);

      if (!result.ok) {
        if (result.error === 'rate_limited') {
          setAccessEmailCompletionSentTo(normalizedEmailValue);
          setAccessEmailCompletionExpiresAt((current) =>
            current > Date.now() ? current : Date.now() + 15 * 60_000
          );
        }
        setAccessEmailCompletionMessage(
          buildEmailOtpRequestErrorMessage({
            error: result.error,
            providerReason: result.providerReason,
            retryAfterSeconds: result.retryAfterSeconds,
          })
        );
        return false;
      }

      setAccessEmailCompletionSentTo(normalizedEmailValue);
      setAccessEmailCompletionExpiresAt(parseEmailOtpExpiresAt(result.expiresAt));
      setAccessEmailCompletionNow(Date.now());
      setAccessEmailCompletionChallengeVersion((current) => current + 1);
      setAccessEmailCompletionMessage('');
      setAccessError('');
      setAccessEmailOtpModalVisible(true);
      return true;
    },
    [normalizedAssociatedSalonCode]
  );

  const openValidatedClientAccess = useCallback(
    (validationResult: {
      salonCode: string;
      profile: {
        nome: string;
        cognome: string;
        email: string;
        telefono: string;
        instagram: string;
      };
    }) => {
      navigateToHref({
        pathname: '/cliente',
        params: {
          salon: validationResult.salonCode,
          mode: 'booking',
          autologin: '1',
          email: validationResult.profile.email,
          phone: validationResult.profile.telefono,
        },
      });
    },
    [navigateToHref]
  );

  const verifyAccessEmailCompletion = useCallback(async (submittedCode: string) => {
    const normalizedEmailValue = normalizeEmail(accessEmailCompletionSentTo || accessEmail);
    const normalizedPhoneValue = limitPhoneToTenDigits(accessPhone);
    const code = submittedCode.replace(/\D+/g, '');

    if (code.length !== 6) {
      setAccessEmailCompletionMessage('Inserisci il codice a 6 cifre ricevuto via email.');
      return;
    }

    if (accessEmailCompletionExpired) {
      setAccessEmailCompletionMessage('Codice scaduto. Richiedine uno nuovo.');
      return;
    }

    setAccessEmailCompletionBusy(true);
    setAccessEmailCompletionMessage('');
    const verification = await verifyEmailOtp({
      email: normalizedEmailValue,
      purpose: 'client_email_completion',
      code,
      salonCode: normalizedAssociatedSalonCode,
    });

    if (!verification.ok) {
      setAccessEmailCompletionBusy(false);
      setAccessEmailCompletionMessage(
        buildEmailOtpVerificationErrorMessage(verification.error)
      );
      return;
    }

    const completion = await completeSalonCustomerEmail({
      salonCode: normalizedAssociatedSalonCode,
      email: normalizedEmailValue,
      phone: normalizedPhoneValue,
      otpToken: verification.token,
    });

    if (!completion.ok) {
      setAccessEmailCompletionBusy(false);
      setAccessEmailCompletionMessage(completion.error);
      return;
    }

    // Dismiss the completed email modal before the shared password step.
    // iOS cannot reliably present another modal over a still-visible OTP sheet.
    setAccessEmailOtpModalVisible(false);
    const validationResult = await validateClientAccess({
      email: normalizedEmailValue,
      phone: normalizedPhoneValue,
      password: accessPassword,
    });
    setAccessEmailCompletionBusy(false);

    if (!validationResult.ok) {
      setAccessError(
        'Email salvata. Tocca Accedi per completare la password e riprovare sullo stesso profilo.'
      );
      return;
    }

    setAccessEmailOtpModalVisible(false);
    clearAccessEmailCompletion();
    openValidatedClientAccess(validationResult);
  }, [
    accessEmail,
    accessEmailCompletionExpired,
    accessEmailCompletionSentTo,
    accessPassword,
    accessPhone,
    clearAccessEmailCompletion,
    normalizedAssociatedSalonCode,
    openValidatedClientAccess,
    validateClientAccess,
  ]);

  const openSavedClientAccess = () => {
    if (!clientLandingActiveRef.current) return;
    if (!hasAssociatedSalon) {
      setAccessError('Associa prima un salone per poter accedere con il profilo salvato.');
      return;
    }

    const emailDraft = normalizeEmail(accessEmail);
    const phoneDraft = normalizePhone(accessPhone);

    if (!phoneDraft) {
      setAccessError('Inserisci il cellulare usato nella registrazione.');
      return;
    }

    setAccessError('');
    setClientAccessLoadingSource('login');
    setIsAccessingClient(true);
    void (async () => {
      const validationResult = await validateClientAccess({
        email: emailDraft,
        phone: phoneDraft,
        password: accessPassword,
      });

      if (!validationResult.ok) {
        if (
          'emailCompletionRequired' in validationResult &&
          validationResult.emailCompletionRequired
        ) {
          if (!validationResult.email) {
            setAccessError(
              'Contatto riconosciuto. Inserisci ora la tua email: potrai entrare solo dopo averla verificata con il codice OTP.'
            );
            setClientAccessLoadingSource(null);
            setIsAccessingClient(false);
            requestAnimationFrame(() => accessEmailRef.current?.focus());
            return;
          }
          await requestAccessEmailCompletionOtp({
            email: validationResult.email,
            phone: validationResult.phone,
          });
          setClientAccessLoadingSource(null);
          setIsAccessingClient(false);
          return;
        }
        const validationError =
          'error' in validationResult
            ? validationResult.error
            : 'Non riesco a completare l’accesso.';
        const isPasswordError =
          'passwordError' in validationResult && validationResult.passwordError;
        setAccessError(isPasswordError ? '' : validationError);
        setAccessPasswordError(isPasswordError ? validationError : '');
        setClientAccessLoadingSource(null);
        setIsAccessingClient(false);
        return;
      }

      clearAccessEmailCompletion();
      openValidatedClientAccess(validationResult);
      setClientAccessLoadingSource(null);
      setIsAccessingClient(false);
    })();
  };

  const clientBiometricAttemptRef = useRef(false);
  const openSavedClientBiometricAccess = async () => {
    if (!clientLandingActiveRef.current || isAccessingClient || clientBiometricAttemptRef.current) return;
    const navigationGeneration = landingNavigationGenerationRef.current;
    if (!hasAssociatedSalon) {
      setAccessError('Associa prima un salone per poter usare Face ID.');
      return;
    }

    clientBiometricAttemptRef.current = true;
    Keyboard.dismiss();
    setAccessError('');
    setClientAccessLoadingSource('biometric');
    setIsAccessingClient(true);

    try {
      const scopedBiometricEnabledRaw = await AsyncStorage.getItem(
        buildFrontendBiometricEnabledKey({
          salonCode: normalizedAssociatedSalonCode,
          email: savedProfileEmail,
          phone: savedProfilePhone,
        })
      );
      const biometricEnabledRaw =
        scopedBiometricEnabledRaw === 'true' || scopedBiometricEnabledRaw === 'false'
          ? scopedBiometricEnabledRaw
          : await AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY);
      const biometricEnabledNow = biometricEnabledRaw === 'true';
      if (frontendBiometricEnabled !== biometricEnabledNow) {
        setFrontendBiometricEnabled(biometricEnabledNow);
      }

      if (!biometricEnabledNow) {
        setHasSavedBiometricProfile(false);
        setAccessError('Attiva prima Face ID dalle impostazioni cliente su questo dispositivo.');
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: Platform.OS === 'ios' ? 'Accedi con Face ID' : 'Accedi con impronta',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        if (!['user_cancel', 'app_cancel', 'system_cancel'].includes(authResult.error)) {
          setAccessError(
            authResult.error === 'not_enrolled' || authResult.error === 'not_available'
              ? 'Accesso biometrico non disponibile. Verifica Face ID o impronta nelle impostazioni del dispositivo, oppure accedi con i tuoi dati.'
              : 'Verifica biometrica non completata. Riprova oppure accedi con i tuoi dati.'
          );
        }
        setClientAccessLoadingSource(null);
        setIsAccessingClient(false);
        return;
      }

      const savedBiometricSalonCode = await AsyncStorage.getItem(FRONTEND_BIOMETRIC_SALON_CODE_KEY);
      const effectiveBiometricSalonCode = normalizeSalonCodeInput(
        savedBiometricSalonCode ?? normalizedAssociatedSalonCode
      );
      const savedBiometricProfileRaw =
        (effectiveBiometricSalonCode
          ? await AsyncStorage.getItem(
              buildFrontendBiometricProfileKeyForSalon(effectiveBiometricSalonCode)
            )
          : null) ?? (await AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY));

      if (!savedBiometricProfileRaw) {
        setAccessError('Non ho trovato un profilo Face ID salvato su questo dispositivo.');
        setClientAccessLoadingSource(null);
        setIsAccessingClient(false);
        return;
      }

      const parsedBiometricProfile = JSON.parse(savedBiometricProfileRaw) as {
        email?: string;
        telefono?: string;
      };
      const biometricEmail = normalizeEmail(String(parsedBiometricProfile.email ?? ''));
      const biometricPhone = normalizePhone(String(parsedBiometricProfile.telefono ?? ''));

      if (!biometricEmail || !biometricPhone) {
        setAccessError('Il profilo Face ID salvato su questo dispositivo non e valido.');
        setClientAccessLoadingSource(null);
        setIsAccessingClient(false);
        return;
      }

      setAccessError('');
      const biometricPassword = await readClientPasswordFromVault({
        salonCode: effectiveBiometricSalonCode,
        email: biometricEmail,
        phone: biometricPhone,
      });
      if (!clientLandingActiveRef.current || navigationGeneration !== landingNavigationGenerationRef.current) return;
      const validationResult = await validateClientAccess({
        email: biometricEmail,
        phone: biometricPhone,
        password: biometricPassword,
      });

      if (!clientLandingActiveRef.current || navigationGeneration !== landingNavigationGenerationRef.current) return;

      if (!validationResult.ok) {
        const validationError =
          'error' in validationResult
            ? validationResult.error || 'Non riesco a completare l’accesso.'
            : 'Completa prima l’email con accesso manuale.';
        setAccessError(validationError);
        setClientAccessLoadingSource(null);
        setIsAccessingClient(false);
        return;
      }

      navigateToHref({
        pathname: '/cliente',
        params: {
          salon: validationResult.salonCode,
          mode: 'booking',
          autologin: '1',
          biometric: '1',
          email: validationResult.profile.email,
          phone: validationResult.profile.telefono,
        },
      });
    } catch (error) {
      console.log('Errore accesso biometrico home cliente:', error);
      setAccessError(
        Platform.OS === 'ios'
          ? 'Non sono riuscito a completare l’accesso con Face ID.'
          : 'Non sono riuscito a completare l’accesso con impronta.'
      );
    } finally {
      clientBiometricAttemptRef.current = false;
      setClientAccessLoadingSource(null);
      setIsAccessingClient(false);
    }
  };

  const openSalonScanner = () => {
    void (async () => {
      Keyboard.dismiss();
      if (isAuthenticated) {
        try {
          await logoutOwnerAccount();
        } catch {
          Alert.alert('Fotocamera non aperta', 'Non è stato possibile completare l’uscita dal salone. Riprova.');
          return;
        }
      }
      navigateToHref('/cliente-scanner');
    })();
  };

  const openDirectClientBooking = (params: { email: string; phone: string }) => {
    navigateToHref({
      pathname: '/cliente',
      params: {
        salon: normalizedAssociatedSalonCode,
        mode: 'booking',
        autologin: '1',
        email: params.email,
        phone: params.phone,
      },
    });
  };

  const requestClientRegisterEmailOtp = useCallback(
    async (email: string, salonCode: string) => {
      const normalizedEmailValue = normalizeEmail(email);
      const normalizedSalonCodeValue = normalizeSalonCodeInput(salonCode);
      if (!isValidEmail(normalizedEmailValue) || !normalizedSalonCodeValue) {
        setRegisterEmailOtpMessage('Associa il salone e inserisci una mail valida.');
        return false;
      }

      setRegisterEmailOtpBusy(true);
      setRegisterEmailOtpMessage('');
      const result = await requestEmailOtp({
        email: normalizedEmailValue,
        purpose: 'client_registration',
        salonCode: normalizedSalonCodeValue,
      });
      setRegisterEmailOtpBusy(false);

      if (!result.ok) {
        if (result.error !== 'rate_limited') {
          setRegisterEmailOtpSentTo('');
          setRegisterEmailOtpSalonCode('');
          setRegisterEmailOtpExpiresAt(0);
        }
        setRegisterEmailOtpMessage(
          buildEmailOtpRequestErrorMessage({
            error: result.error,
            providerReason: result.providerReason,
            retryAfterSeconds: result.retryAfterSeconds,
          })
        );
        return false;
      }

      setRegisterEmailOtpSentTo(normalizedEmailValue);
      setRegisterEmailOtpSalonCode(normalizedSalonCodeValue);
      setRegisterEmailOtpExpiresAt(parseEmailOtpExpiresAt(result.expiresAt));
      setRegisterEmailOtpNow(Date.now());
      setRegisterEmailOtpChallengeVersion((current) => current + 1);
      setRegisterEmailOtpMessage(
        'Codice inviato via email. Inseriscilo qui per continuare. Se non lo trovi, controlla anche Spam o Posta indesiderata.'
      );
      setRegisterEmailOtpModalVisible(true);
      return true;
    },
    []
  );

  const verifyClientRegisterEmailOtp = useCallback(async (submittedCode: string) => {
    const email = normalizeEmail(registerEmailOtpSentTo || registerProfile.email);
    const salonCodeValue = normalizeSalonCodeInput(registerEmailOtpSalonCode || normalizedAssociatedSalonCode);
    const code = submittedCode.replace(/\D+/g, '');
    if (!isValidEmail(email) || !salonCodeValue || code.length !== 6) {
      setRegisterEmailOtpMessage('Inserisci il codice a 6 cifre ricevuto via email.');
      return false;
    }
    if (registerEmailOtpExpired) {
      setRegisterEmailOtpMessage('Codice scaduto. Richiedine uno nuovo.');
      return false;
    }

    setRegisterEmailOtpBusy(true);
    setRegisterEmailOtpMessage('');
    const result = await verifyEmailOtp({
      email,
      purpose: 'client_registration',
      salonCode: salonCodeValue,
      code,
    });
    setRegisterEmailOtpBusy(false);

    if (!result.ok) {
      setRegisterEmailOtpMessage(
        buildEmailOtpVerificationErrorMessage(result.error)
      );
      return false;
    }

    setRegisterEmailOtpVerifiedFor(email);
    setRegisterEmailOtpVerifiedAt(Date.now());
    setRegisterEmailOtpExpiresAt(0);
    setRegisterError('');
    setRegisterEmailOtpMessage('Email verificata. Clicca su Registrati per completare.');
    setRegisterEmailOtpModalVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    return true;
  }, [
    normalizedAssociatedSalonCode,
    registerEmailOtpExpired,
    registerEmailOtpSalonCode,
    registerEmailOtpSentTo,
    registerProfile.email,
  ]);

  const handleRegisterClient = async () => {
    if (clientRegistrationInFlightRef.current) return;
    clientRegistrationInFlightRef.current = true;
    setRegisteringClient(true);
    try {
      await performClientRegistration();
    } finally {
      clientRegistrationInFlightRef.current = false;
      setRegisteringClient(false);
    }
  };

  const performClientRegistration = async () => {
    if (!hasAssociatedSalon) {
      setRegisterError('Associa prima un salone per poter registrare il cliente.');
      return;
    }

    const normalizedProfile = {
      nome: formatCustomerNamePart(registerProfile.nome),
      cognome: formatCustomerNamePart(registerProfile.cognome),
      email: normalizeEmail(registerProfile.email),
      telefono: limitPhoneToTenDigits(registerProfile.telefono),
      instagram: registerProfile.instagram.trim(),
    };

    if (!isValidPersonNamePart(registerProfile.nome)) {
      setRegisterError(buildPersonNameValidationError('Nome'));
      return;
    }

    if (!isValidPersonNamePart(registerProfile.cognome)) {
      setRegisterError(buildPersonNameValidationError('Cognome'));
      return;
    }

    if (
      !normalizedProfile.nome ||
      !normalizedProfile.cognome ||
      !normalizedProfile.email ||
      !normalizedProfile.telefono
    ) {
      setRegisterError('Compila nome, cognome, email e cellulare per continuare.');
      return;
    }

    if (!isValidEmail(normalizedProfile.email)) {
      setRegisterError('Inserisci un indirizzo email valido.');
      return;
    }

    if (!isValidPhone10(normalizedProfile.telefono)) {
      setRegisterError('Inserisci un cellulare valido di 9 o 10 cifre.');
      return;
    }

    const passwordPolicy = validateStrongPassword(registerPassword);
    if (!passwordPolicy.valid) {
      setRegisterPasswordError(passwordPolicy.message);
      setRegisterError(passwordPolicy.message);
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setRegisterPasswordError('Le password non coincidono.');
      setRegisterError('Le password non coincidono.');
      return;
    }

    const resolvedPortal = await fetchClientPortalSnapshot(normalizedAssociatedSalonCode).catch((error) => {
      console.log('Errore verifica salone prima della registrazione cliente:', error);
      return null;
    });

    const effectiveSalonCode = normalizeSalonCodeInput(
      resolvedPortal?.workspace?.salonCode ?? normalizedAssociatedSalonCode
    );

    if (!effectiveSalonCode || !resolvedPortal?.workspace?.id) {
      setRegisterError(
        'Il salone associato non è disponibile lato server. Riassocialo con il codice corretto e riprova.'
      );
      return;
    }

    try {
      const duplicateMatch = await findFrontendCustomerDuplicate({
        salonCode: effectiveSalonCode,
        email: normalizedProfile.email,
        phone: normalizedProfile.telefono,
      });

      if (duplicateMatch) {
        setRegisterError(buildDuplicateFrontendCustomerMessage(duplicateMatch));
        return;
      }
    } catch (duplicateLookupError) {
      console.log('Errore controllo duplicato cliente prima della registrazione:', duplicateLookupError);
    }

    if (
      registerEmailOtpVerifiedFor === normalizedProfile.email &&
      registerEmailOtpSalonCode === effectiveSalonCode &&
      registerEmailOtpVerifiedAt > 0 &&
      Date.now() - registerEmailOtpVerifiedAt > 15 * 60_000
    ) {
      setRegisterEmailOtpVerifiedFor('');
      setRegisterEmailOtpVerifiedAt(0);
      setRegisterEmailOtpMessage('Verifica email scaduta. Richiedi un nuovo codice OTP.');
      setRegisterError('Verifica email scaduta. Richiedi un nuovo codice OTP.');
      return;
    }

    if (
      registerEmailOtpVerifiedFor !== normalizedProfile.email ||
      registerEmailOtpSalonCode !== effectiveSalonCode
    ) {
      await requestClientRegisterEmailOtp(normalizedProfile.email, effectiveSalonCode);
      setRegisterError('');
      return;
    }

    setRegisterError('');

    try {
      const saved = await upsertFrontendCustomerForSalon({
        salonCode: effectiveSalonCode,
        password: registerPassword,
        profile: normalizedProfile,
      });

      if (!saved.ok) {
        setRegisterError(
          saved.reason === 'save_failed'
            ? saved.detail?.includes('customer_email_not_verified')
              ? 'Verifica email scaduta o non completata. Richiedi un nuovo codice OTP e riprova.'
              : saved.detail?.includes('salon_not_found')
              ? 'Il salone associato non risulta disponibile lato server. Riassocialo e riprova.'
              : 'Registrazione non completata: il server non è riuscito a creare il cliente per questo salone.'
            : buildDuplicateFrontendCustomerMessage({
                emailTaken:
                  saved.reason === 'duplicate_email' || saved.reason === 'duplicate_email_phone',
                phoneTaken:
                  saved.reason === 'duplicate_phone' || saved.reason === 'duplicate_email_phone',
              })
        );
        return;
      }

      const nextSavedSalonCodes = buildSavedSalonCodeList([
        effectiveSalonCode,
        ...savedSalonCodes,
      ]);

      await AsyncStorage.multiSet([
        [
          FRONTEND_PROFILE_KEY,
          JSON.stringify({
            nome: normalizedProfile.nome,
            cognome: normalizedProfile.cognome,
            email: normalizedProfile.email,
            telefono: normalizedProfile.telefono,
            instagram: normalizedProfile.instagram,
          }),
        ],
        [
          buildFrontendProfileKeyForSalon(effectiveSalonCode),
          JSON.stringify({
            nome: normalizedProfile.nome,
            cognome: normalizedProfile.cognome,
            email: normalizedProfile.email,
            telefono: normalizedProfile.telefono,
            instagram: normalizedProfile.instagram,
          }),
        ],
        [FRONTEND_LAST_SALON_CODE_KEY, effectiveSalonCode],
        [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalonCodes)],
      ]);

      setHasSavedClientProfile(true);
      setSavedProfileEmail(normalizedProfile.email);
      setSavedProfilePhone(normalizedProfile.telefono);
      setSavedSalonCode(effectiveSalonCode);
      setSavedSalonCodes(nextSavedSalonCodes);
      setSelectedAssociatedSalonCode(effectiveSalonCode);
      setAccessEmail(normalizedProfile.email);
      setAccessPhone(normalizedProfile.telefono);
      setRegisterProfile(EMPTY_REGISTER_PROFILE);
      setRegisterEmailOtpSentTo('');
      setRegisterEmailOtpVerifiedFor('');
      setRegisterEmailOtpVerifiedAt(0);
      setRegisterEmailOtpSalonCode('');
      setRegisterEmailOtpExpiresAt(0);
      setRegisterEmailOtpMessage('');
      setRegisterEmailOtpModalVisible(false);
      await saveClientPasswordToVault({
        salonCode: effectiveSalonCode,
        email: normalizedProfile.email,
        phone: normalizedProfile.telefono,
        password: registerPassword,
      });
      await ensureCustomerPortalSession({ salonCode: effectiveSalonCode, email: normalizedProfile.email, phone: normalizedProfile.telefono }, registerPassword, true);
      setRegisterPassword('');
      setRegisterPasswordConfirm('');
      setRegisterPasswordError('');
      setClientEntryMode('access');
      setAccessError('');
      setRegisterError('');
      await AsyncStorage.multiRemove([
        HOME_CLIENT_ACCESS_DRAFT_KEY,
        HOME_CLIENT_REGISTER_DRAFT_KEY,
      ]);

      await loadSavedClientSession(effectiveSalonCode);

      openDirectClientBooking({
        email: normalizedProfile.email,
        phone: normalizedProfile.telefono,
      });
    } catch (error) {
      console.log('Errore registrazione cliente dalla home:', error);
      setRegisterError('Non riesco a completare la registrazione in questo momento. Riprova tra un attimo.');
    }
  };

  if (!hasInitializedAuth) {
    return null;
  }

  if (
    !audiencePickerOpen &&
    landingAudienceReady &&
    isAuthenticated &&
    Platform.OS !== 'ios' &&
    !shouldUseClientLanding &&
    !suppressOwnerBackofficeRedirect &&
    !forceLoggedOutLanding &&
    !ownerExplicitLogout
  ) {
    return <Redirect href={BACKOFFICE_ROUTE} />;
  }

  // Su iOS il Face ID autentica prima che cache e workspace abbiano terminato
  // il riallineamento. Un Redirect dichiarativo in questo punto smontava la
  // landing in anticipo e la rendeva nuovamente visibile per un fotogramma tra
  // il loader e il back office. L'ingresso iOS passa soltanto da
  // beginOwnerBackofficeReplace, che viene sbloccato quando il salone è pronto.

  // Dopo un logout il primo login riporta temporaneamente isLoaded a false
  // mentre cambia account e riallinea il workspace. La landing nativa deve
  // restare montata: smontarla perde lo stato del tentativo Face ID e ricrea
  // la ScrollView in cima. Il redirect pronto sopra rimuove poi anche il
  // marker ownerLoggedOut dalla cronologia.
  if (!isLoaded && !keepNativeOwnerReloginMounted) {
    return null;
  }

  if (!landingAudienceReady && !hasExplicitLandingAudienceContext) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator accessibilityLabel="Preparazione accesso" /></View>;
  }

  // Choose the first-access/associated-salon layout only after local session
  // hydration. Otherwise the full introduction flashes before the compact card.
  if (
    showClientLanding &&
    (!isAuthenticated || shouldUseClientLanding) &&
    loadedClientSessionKey !== (normalizedIncomingSalonCode || '__default__')
  ) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator accessibilityLabel="Preparazione del tuo salone" /></View>;
  }

  if (audiencePickerOpen || (!selectedLandingAudience && !hasExplicitLandingAudienceContext && !isAuthenticated)) {
    return (
      <View style={styles.container}>
      <AccessBackdrop />
      <AccessNavigationBar onBack={audiencePickerOpen ? () => setAudiencePickerOpen(false) : undefined} backLabel="Torna all’accesso" maxWidth={landingShellMaxWidth} />
      <ScrollView
        style={[styles.container, { backgroundColor: 'transparent' }]}
        contentContainerStyle={{ flexGrow: 1, justifyContent: Platform.OS === 'web' ? 'flex-start' : 'center', paddingHorizontal: 18, paddingTop: Platform.OS === 'web' ? 96 : 16, paddingBottom: Math.max(insets.bottom + 20, 32) }}
      >
        <View style={styles.audienceChoicePanel}>
          <View style={styles.audienceChoiceBrandRow}>
            <View style={styles.audienceChoiceWordmark}><AccessWordmark /></View>
          </View>
          <Text accessibilityRole="header" style={styles.audienceChoiceTitle}>Benvenuto in SalonPro</Text>
          <Text style={styles.audienceChoiceSubtitle}>Scegli come accedere.</Text>
          {([
            { audience: 'client', icon: 'person-outline', title: 'Sono un cliente', description: 'Voglio prenotare nel mio salone.' },
            { audience: 'owner', icon: 'storefront-outline', title: 'Gestisco un salone', description: 'Voglio gestire appuntamenti, clienti e collaboratori.' },
          ] as const).map((choice) => (
            <Pressable
              key={choice.audience}
              accessibilityRole="button"
              accessibilityLabel={`${choice.title}. ${choice.description}`}
              onPress={() => {
                cancelInstallRecovery();
                setLandingAudience(choice.audience);
                if (audiencePickerOpen) {
                  setAudiencePickerOpen(false);
                  router.replace({ pathname: '/', params: {
                    side: choice.audience,
                    entry: choice.audience === 'client' ? 'client' : undefined,
                    salon: choice.audience === 'client' ? normalizedIncomingSalonCode || normalizedAssociatedSalonCode || undefined : undefined,
                  } } as Href);
                }
              }}
              style={({ pressed }) => [styles.audienceChoiceCard, choice.audience === 'client' ? styles.audienceChoiceClient : styles.audienceChoiceOwner, pressed && styles.audienceChoicePressed]}
            >
              <AccessGlassReflection />
              <View style={[styles.audienceChoiceIcon, choice.audience === 'client' ? styles.audienceChoiceClientIcon : styles.audienceChoiceOwnerIcon]}><Ionicons name={choice.icon} size={30} color={choice.audience === 'client' ? (palette.night ? '#DCD8CD' : '#42494D') : (palette.night ? '#D8C29B' : '#95703E')} /></View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.audienceChoiceCardTitle}>{choice.title}</Text>
                <Text style={styles.audienceChoiceCardDescription}>{choice.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={palette.muted} />
            </Pressable>
          ))}
          <Text style={styles.audienceChoiceFootnote}>Ricorderemo la scelta su questo dispositivo. Puoi cambiarla dalla schermata di accesso.</Text>
        </View>
      </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      onTouchStart={(event) => {
        cancelInstallRecovery();
        if (Platform.OS !== 'web') beginSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY);
      }}
      onTouchMove={Platform.OS !== 'web' ? (event) => moveSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined}
      onTouchEnd={Platform.OS !== 'web' ? (event) => finishSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined}
      onTouchCancel={() => { salonOutsideTapRef.current = null; }}
      onPointerDown={Platform.OS === 'web' ? (event) => beginSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined}
      onPointerMove={Platform.OS === 'web' ? (event) => moveSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined}
      onPointerUp={Platform.OS === 'web' ? (event) => finishSalonOutsideTap(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined}
      onPointerCancel={() => { salonOutsideTapRef.current = null; }}
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      <AccessBackdrop />
      <AccessNavigationBar onBack={openAudiencePicker} backLabel={`Lato ${showOwnerLanding ? 'salone' : 'cliente'}. Cambia modalità di accesso.`} maxWidth={landingShellMaxWidth} />

      <ScrollView
        ref={scrollRef}
        style={[styles.container, { backgroundColor: 'transparent' }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 8 },
          Platform.OS === 'web' && {justifyContent:'flex-start',paddingTop:76},
          { paddingHorizontal: landingHorizontalPadding },
          Platform.OS === 'android' && { paddingBottom: androidLandingBottomPadding },
          isRegistrationOnlyClientWebFlow && styles.registrationOnlyWebContent,
        ]}
        keyboardDismissMode="on-drag"
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          salonOutsideTapRef.current = null;
          landingScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollBeginDrag={() => {
          registerScrollRequestRef.current = null;
          salonOutsideTapRef.current = null;
          keyboardDismissDragUntilRef.current = Date.now() + 900;
          clientFocusedInputRef.current = null;
          // Owner inputs can live inside an embedded scroll view. Explicitly
          // blur them too: iOS interactive dismissal alone misses that case.
          Keyboard.dismiss();
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps={Platform.OS !== 'web' ? 'always' : 'handled'}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: wideAccessPanels ? landingShellMaxWidth : Math.min(landingShellMaxWidth, 760) }]}>



          <Animated.View
            style={styles.landingPagerViewport}
            layout={
              Platform.OS === 'android'
                ? undefined
                : LinearTransition.duration(320).easing(Easing.out(Easing.cubic))
            }
            onLayout={(event) => {
              const measuredWidth = Math.max(320, Math.round(event.nativeEvent.layout.width));
              if (Math.abs(measuredWidth - landingPagerWidth) > 1) {
                setLandingPagerWidth(measuredWidth);
              }
            }}
          >
            <View style={styles.landingPagerTrack}>
              {shouldShowLandingAudienceSwitcher ? (
                <View
                  pointerEvents={showOwnerLanding ? 'auto' : 'none'}
                  accessibilityElementsHidden={!showOwnerLanding}
                  style={[
                    styles.landingPagerPage,
                    { width: landingPagerWidth },
                    !showOwnerLanding && styles.hiddenLandingPage,
                  ]}
                >
                  <View
                    style={styles.landingPagerPageInner}
                  >
                  <View style={[styles.heroCard, isCompactPhoneViewport && styles.heroCardCompact]}>
                    <View style={styles.brandWrap}>
                      <View
                        style={[
                          styles.heroSalonInlineSection,
                          isCompactPhoneViewport && styles.heroSalonInlineSectionCompact,
                          expandLandingWideContent && styles.heroSalonInlineSectionWide,
                          Platform.OS === 'web' && {flexDirection:'column',alignItems:'stretch',gap:0,width:'100%',maxWidth:560,alignSelf:'center'},
                        ]}
                      >
                        <LandingAccessHeader ownerMode={ownerAccessMode} audience="owner" />

                        <View
                          style={[
                            styles.ownerInlineAccessWrap,
                            isCompactPhoneViewport && styles.ownerInlineAccessWrapCompact,
                            expandLandingWideContent && styles.ownerInlineAccessWrapWide,
                            Platform.OS === 'web' && {width:'100%',minWidth:0,maxWidth:560,paddingHorizontal:0,alignSelf:'stretch'},
                          ]}
                        >
                          {showOwnerResetReadyMessage || showOwnerResetDoneMessage ? (
                            <View
                              style={[
                                styles.ownerResetNotice,
                                showOwnerResetDoneMessage
                                  ? styles.ownerResetNoticeSuccess
                                  : styles.ownerResetNoticeInfo,
                              ]}
                            >
                              <Text style={styles.ownerResetNoticeTitle}>
                                {showOwnerResetDoneMessage
                                  ? 'Password aggiornata'
                                  : 'Accesso proprietario'}
                              </Text>
                              <Text style={styles.ownerResetNoticeBody}>
                                {showOwnerResetDoneMessage
                                  ? 'La password del salone e stata aggiornata. Ora puoi accedere dalla home nuova.'
                                  : 'Continua da questa home per accedere al salone o completare il rientro dopo il recupero password.'}
                              </Text>
                            </View>
                          ) : null}
                          <OwnerAccessScreen
                            onPresentationModeChange={setOwnerAccessMode}
                            onChooseClient={() => {
                              cancelInstallRecovery();
                              setLandingAudience('client');
                              setAudiencePickerOpen(false);
                              router.replace({ pathname: '/', params: { side: 'client', entry: 'client', salon: normalizedIncomingSalonCode || normalizedAssociatedSalonCode || undefined } } as Href);
                            }}
                            embedded
                            externalScrollRef={scrollRef}
                            onAuthenticated={beginOwnerBackofficeReplace}
                          />
                        </View>
                      </View>
                    </View>
                  </View>

                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAccessInformation }} onPress={() => setShowAccessInformation(value => !value)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...(Platform.OS === 'web' ? { alignSelf: 'center' as const, paddingHorizontal: 12 } : {}) }}>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>{showAccessInformation ? 'Chiudi informazioni' : 'Scopri cosa puoi fare con SalonPro'} {showAccessInformation ? '−' : '+'}</Text>
                  </Pressable>
                  <View style={{ display: showAccessInformation ? 'flex' : 'none' }}>
                  <View style={styles.benefitsSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Tutto quello che ti serve, lato salone</Text>
                      <Text style={styles.sectionSubtitle}>Un unico accesso per organizzare il lavoro e seguire il salone ogni giorno.</Text>
                      <Text style={styles.sectionHelperText}>Riquadri informativi: servono solo a spiegarti cosa puoi fare nel back office salone.</Text>
                    </View>

                    <View style={styles.benefitsGrid}>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="calendar-clear" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Organizza l’agenda</Text>
                          <Text style={styles.benefitText}>Gestisci giorni, slot, richieste e appuntamenti da un unico calendario operativo.</Text>
                        </View>
                      </View>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="people" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Segui clienti e team</Text>
                          <Text style={styles.benefitText}>Controlla clienti, operatori e mestieri attivi mantenendo tutto allineato.</Text>
                        </View>
                      </View>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="card" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Cura servizi e cassa</Text>
                          <Text style={styles.benefitText}>Aggiorna listino, colori card e movimenti della cassa senza uscire dal salone.</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                    <View style={styles.reassuranceCard}>
                      <View style={styles.reassuranceColumn}>
                        <Text style={styles.reassuranceTitle}>Un back office chiaro, pensato per il salone</Text>
                        <Text style={styles.reassuranceText}>
                          Tutto in un unico spazio: agenda, clienti, servizi, operatori e cassa, senza passaggi inutili e senza strumenti separati.
                        </Text>
                      </View>
                    </View>
                  </View>
                  </View>
                </View>
              ) : null}

              <View
                pointerEvents={showClientLanding ? 'auto' : 'none'}
                accessibilityElementsHidden={!showClientLanding}
                style={[
                  styles.landingPagerPage,
                  { width: landingPagerWidth },
                  !showClientLanding && styles.hiddenLandingPage,
                ]}
              >
                <View
                  style={styles.landingPagerPageInner}
                >
                  <View
                    style={[
                      styles.clientSectionCard,
                      isCompactPhoneViewport && styles.clientSectionCardCompact,
                      isTightAndroidLandingViewport && styles.clientSectionCardTightAndroid,
                      expandLandingWideContent && styles.clientSectionCardWide,
                    ]}
                  >
                    <LandingAccessHeader audience="client" />

                    <View
                      style={[
                        styles.accessCard,
                        isCompactPhoneViewport && styles.accessCardCompact,
                        expandLandingWideContent && styles.accessCardWide,
                        {maxWidth:splitClientAccessPanels?1120:Platform.OS==='web'?560:440,flexDirection:splitClientAccessPanels?'row':'column',alignItems:'stretch',gap:splitClientAccessPanels?24:16,padding:0,paddingHorizontal:0,paddingVertical:0,borderWidth:0,borderRadius:0,backgroundColor:'transparent',...(Platform.OS==='web'?{boxShadow:'none',backdropFilter:'none',backgroundImage:'none'} as any:{})},
                        hasAssociatedSalon && { marginTop: 0 },
                      ]}
                      onLayout={handleCodeSectionLayout}
                    >
                      <AccessWidePanel enabled stacked={!splitClientAccessPanels} compact={isCompactPhoneViewport} testID="client-salon-association">
                      {!hasAssociatedSalon ? <>
                      <Text
                        style={[styles.heroActionLabel, styles.accessEyebrow]}
                        maxFontSizeMultiplier={isTightAndroidLandingViewport ? 1 : undefined}
                      >
                        Sei un cliente?
                      </Text>
                      <Text
                        style={[
                          styles.accessTitle,
                          isCompactPhoneViewport && styles.accessTitleCompact,
                          isTightAndroidLandingViewport && styles.accessTitleTightAndroid,
                        ]}
                        maxFontSizeMultiplier={isTightAndroidLandingViewport ? 1 : undefined}
                      >
                        {shouldShowSalonDiscovery ? 'Il tuo salone, a portata di mano' : 'Sei nel salone giusto'}
                      </Text>
                      <Text
                        style={[
                          styles.accessSubtitle,
                          isCompactPhoneViewport && styles.accessSubtitleCompact,
                          expandLandingWideContent && styles.accessSubtitleWide,
                        ]}
                        maxFontSizeMultiplier={isTightAndroidLandingViewport ? 1 : undefined}
                      >
                        {!shouldShowSalonDiscovery
                          ? 'Abbiamo gia aperto la pagina corretta del salone: ora puoi accedere o prenotare senza reinserire il codice.'
                          : 'Trova il tuo salone, scegli uno di quelli salvati oppure usa codice e QR.'}
                      </Text>

                      </> : null}



                      {shouldShowSalonDiscovery && !hasAssociatedSalon && savedSalonCodes.length === 0 ? <SalonSearch premiumAppearance disabled={isAssociatingSalon} onSelect={associateSalonWithCode} /> : null}

                      <Animated.View
                        style={[
                          styles.quickAccessCard,
                          isCompactPhoneViewport && styles.quickAccessCardCompact,
                          expandLandingWideContent && styles.quickAccessCardWide,
                          hasAssociatedSalon && styles.associatedSalonCompactCard,
                        ]}
                        layout={CARD_TOGGLE_LAYOUT}
                      >
                        <View style={[styles.quickAccessHeader, hasAssociatedSalon && styles.associatedSalonCompactHeader]}>
                          {!hasAssociatedSalon ? <View style={styles.quickAccessIconBadge}>
                            <Ionicons name="storefront" size={17} color="#294D79" />
                          </View> : null}
                          <View style={[styles.quickAccessHeaderTextWrap, hasAssociatedSalon && { width: 'auto', flex: 1, alignItems: 'flex-start' }]}>
                            <Text style={[styles.quickAccessTitle, hasAssociatedSalon && styles.associatedSalonCompactTitle]}>
                              {hasAssociatedSalon ? 'Il tuo salone' : savedSalonCodes.length > 0 ? 'Scegli il tuo salone' : 'Hai un codice o un QR?'}
                            </Text>
                            {!hasAssociatedSalon ? (
                            <Text style={styles.quickAccessSubtitle}>
                              {hasAssociatedSalon || savedSalonCodes.length > 0
                                ? 'Apri uno dei tuoi saloni oppure cercane uno nuovo.'
                                : 'Inserisci codice o QR per continuare.'}
                            </Text>
                            ) : null}
                          </View>
                          <NativePressable
                              style={[styles.quickAccessCollapseButton, styles.associatedSalonManageButton]}
                              accessibilityRole="button"
                              accessibilityLabel={isSalonAssociationCardExpanded ? 'Chiudi aggiunta salone' : hasAssociatedSalon ? 'Associa un altro salone' : 'Apri codice o QR del salone'}
                              accessibilityState={{ expanded: isSalonAssociationCardExpanded }}
                              onPress={() => {
                                Keyboard.dismiss();
                                setIsSalonAssociationCardExpanded(!isSalonAssociationCardExpanded);
                                setIsSalonSelectorOpen(false);
                              }}
                              hitSlop={8}
                            >
                              <Ionicons
                                name={isSalonAssociationCardExpanded ? 'close' : 'add'}
                                size={16}
                                color={palette.muted}
                              />
                              <Text style={styles.associatedSalonManageText}>{isSalonAssociationCardExpanded ? 'Chiudi' : hasAssociatedSalon ? 'Aggiungi' : 'Apri'}</Text>
                            </NativePressable>
                        </View>

                        <View
                          style={[
                            styles.salonAssociationStatusCard,
                            hasAssociatedSalon
                              ? styles.salonAssociationStatusCardActive
                              : styles.salonAssociationStatusCardEmpty,
                            hasAssociatedSalon && styles.associatedSalonCompactStatus,
                          ]}
                        >
                          {!hasAssociatedSalon ? (
                          <Text
                            style={[
                              styles.salonAssociationStatusLabel,
                              hasAssociatedSalon
                                ? styles.salonAssociationStatusLabelActive
                                : styles.salonAssociationStatusLabelEmpty,
                            ]}
                          >
                            {hasAssociatedSalon ? 'Salone associato' : 'Nessun salone associato'}
                          </Text>
                          ) : null}

                          {hasAssociatedSalon ? (
                            savedSalonCodes.length > 0 ? (
                              <View
                                style={styles.salonAssociationSelectorWrap}
                                onTouchStart={(event) => { salonOutsideTapRef.current = null; event.stopPropagation(); }}
                                onPointerDown={Platform.OS === 'web' ? (event) => { salonOutsideTapRef.current = null; event.stopPropagation(); } : undefined}
                              >
                                <SalonSelectorTouchable
                                  style={styles.salonAssociationSelector}
                                  accessibilityRole="button"
                                  accessibilityLabel="Scegli il tuo salone"
                                  accessibilityState={{ expanded: isSalonSelectorOpen }}
                                  onPress={() => { Keyboard.dismiss(); setIsSalonSelectorOpen((current) => !current); }}
                                  activeOpacity={0.9}
                                >
                                  <AccessSalonBadge salonCode={normalizedAssociatedSalonCode} name={normalizedAssociatedSalonCode} selected size={44} maxImageWidth={120} />
                                  <Text
                                    style={styles.salonAssociationSelectorText}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.82}
                                  >
                                    {Platform.OS === 'web' ? <PublicSalonName salonCode={normalizedAssociatedSalonCode} /> : normalizedAssociatedSalonCode}
                                  </Text>
                                  <Ionicons
                                    name={isSalonSelectorOpen ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color="#1d4ed8"
                                    style={styles.salonAssociationSelectorChevron}
                                  />
                                </SalonSelectorTouchable>

                                {isSalonSelectorOpen ? (
                                  <View style={styles.salonAssociationSelectorMenu}>
                                    {visibleSavedSalonCodes.map((code) => {
                                      const selected = code === normalizedAssociatedSalonCode;
                                      return (
                                        <View key={code} style={[styles.savedSalonRow, selected && styles.savedSalonRowSelected]}>
                                        <SalonSelectorTouchable
                                          style={[
                                            styles.salonAssociationSelectorOption,
                                            { flex: 1 },

                                          ]}
                                          accessibilityRole="button"
                                          accessibilityLabel={`Scegli ${code}`}
                                          accessibilityState={{ selected }}
                                          onPress={() => {
                                            setSavedSalonActionsCode(null);
                                            setSelectedAssociatedSalonCode(code);
                                            setIsSalonSelectorOpen(false);
                                          }}
                                          activeOpacity={0.9}
                                        >
                                          <View style={styles.salonAssociationSelectorOptionInner}>
                                            <AccessSalonBadge salonCode={code} name={code} selected={selected} size={36} />
                                            <Text
                                              style={[
                                                styles.salonAssociationSelectorOptionText,
                                                selected && styles.salonAssociationSelectorOptionTextActive,
                                              ]}
                                              numberOfLines={1}
                                              adjustsFontSizeToFit
                                              minimumFontScale={0.82}
                                            >
                                              {Platform.OS === 'web' ? <PublicSalonName salonCode={code} /> : code}
                                            </Text>
                                            <View style={styles.salonAssociationSelectorOptionSide}>
                                              {selected ? (
                                                <Ionicons
                                                  name="checkmark-circle"
                                                  size={16}
                                                  color="#1d4ed8"
                                                />
                                              ) : null}
                                            </View>
                                          </View>
                                        </SalonSelectorTouchable>
                                        <SalonSelectorTouchable
                                          accessibilityRole="button"
                                          accessibilityLabel={`Opzioni per ${code}`}
                                          accessibilityState={{ expanded: savedSalonActionsCode === code }}
                                          onPress={() => setSavedSalonActionsCode(current => current === code ? null : code)}
                                          style={[styles.savedSalonMore, savedSalonActionsCode === code && { backgroundColor: '#DCE7F8' }]}
                                        ><Ionicons name="ellipsis-horizontal" size={21} color="#526781" /></SalonSelectorTouchable>

                                        </View>
                                      );
                                    })}
                                  </View>
                                ) : null}
                              </View>
                            ) : (
                              <View style={styles.salonAssociationSelector}>
                              <AccessSalonBadge salonCode={normalizedAssociatedSalonCode} name={normalizedAssociatedSalonCode} selected size={44} maxImageWidth={120} />
                              <Text style={styles.salonAssociationSelectorText}>
                                {Platform.OS === 'web' ? <PublicSalonName salonCode={normalizedAssociatedSalonCode} /> : normalizedAssociatedSalonCode}
                              </Text>
                              </View>
                            )
                          ) : (
                            <Text style={styles.salonAssociationStatusHint}>
                              Inserisci codice o QR del salone.
                            </Text>
                          )}
                        </View>

                        {isSalonAssociationCardExpanded ? (
                          <Animated.View
                            style={styles.salonAssociationFormWrap}
                            layout={CARD_TOGGLE_LAYOUT}
                            entering={CARD_TOGGLE_ENTER}
                          >
                            {(hasAssociatedSalon || savedSalonCodes.length > 0) && !isClientPasswordResetReturn ? (
                              <View style={styles.alternateSalonSearch}>
                                <SalonSearch premiumAppearance alternate disabled={isAssociatingSalon} onSelect={associateSalonWithCode} />
                              </View>
                            ) : null}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 8 }}>
                              <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
                              <Text style={{ color: palette.muted, fontSize: 12 }}>oppure usa il codice</Text>
                              <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
                            </View>
                            {!useLegacySalonCode ? <SalonCodeInput
                              premiumAppearance
                              ref={salonCodeRef}
                              value={salonCode}
                              editable={!isAssociatingSalon}
                              onChangeText={(value) => { setSalonCode(value); setCodeTouched(false); setSalonAssociationError(''); }}
                              onFocus={() => scrollToField(salonCodeRef)}
                              onSubmitEditing={handleCodeSubmit}
                            /> : <TextInput
                              ref={salonCodeRef}
                              style={[
                                styles.codeInput,
                                codeFocused && styles.codeInputFocused,
                                showSalonCodeValidationError && styles.codeInputError,
                              ]}
                              placeholder="Inserisci codice salone (es. ABC123)"
                              placeholderTextColor={palette.muted}
                              autoCapitalize="none"
                              autoCorrect={false}
                              value={salonCode}
                              onChangeText={(value) => {
                                setSalonCode(value);
                                if (!codeTouched) {
                                  return;
                                }

                                setCodeTouched(false);
                              }}
                              onFocus={() => {
                                setCodeFocused(true);
                                scrollToField(salonCodeRef);
                              }}
                              onBlur={() => setCodeFocused(false)}
                              returnKeyType="go"
                              onSubmitEditing={handleCodeSubmit}
                            />}
                            <TouchableOpacity disabled={isAssociatingSalon}
                              onPress={() => { setUseLegacySalonCode((current) => !current); setSalonCode(''); setCodeTouched(false); setSalonAssociationError(''); }}
                              accessibilityRole="button" style={{ paddingVertical: 12, alignItems: 'center' }}>
                              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' }}>
                                {useLegacySalonCode ? 'Usa il codice di 6 cifre' : 'Hai un vecchio codice? Inseriscilo qui'}
                              </Text>
                            </TouchableOpacity>

                            {showCodeError ? (
                              <Text style={styles.codeErrorText}>Inserisci un codice salone per continuare.</Text>
                            ) : null}
                            {salonAssociationError ? (
                              <Text style={styles.codeErrorText}>{salonAssociationError}</Text>
                            ) : null}

                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                styles.heroPrimaryButton,
                                (!normalizedSalonCode || (!useLegacySalonCode && salonCode.length !== 6) || isAssociatingSalon) && styles.primaryButtonDisabled,
                              ]}
                              onPress={handleCodePress}
                              activeOpacity={0.9}
                              disabled={!normalizedSalonCode || (!useLegacySalonCode && salonCode.length !== 6) || isAssociatingSalon}
                            >
                              <View style={styles.codeActionRow}>
                                {isAssociatingSalon ? (
                                  <ActivityIndicator size="small" color="#f8fafc" />
                                ) : null}
                                <Text style={styles.primaryButtonText}>
                                  {isAssociatingSalon ? 'Verifica salone...' : 'Associa salone'}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            <NativePressable
                              style={[styles.quickAccessButton, styles.qrQuickAccessButton]}
                              onPress={openSalonScanner}
                              accessibilityRole="button"
                            >
                              <View style={styles.quickAccessButtonRow}>
                                <Ionicons name="qr-code-outline" size={18} color={palette.ink} />
                                <Text style={[styles.quickAccessButtonText, styles.qrQuickAccessButtonText]}>
                                  Usa QR del salone
                                </Text>
                              </View>
                            </NativePressable>
                          </Animated.View>
                        ) : null}
                      </Animated.View>



                      </AccessWidePanel>
                      <AccessWidePanel enabled stacked={!splitClientAccessPanels} compact={isCompactPhoneViewport} disabled={!hasAssociatedSalon} testID="client-authentication">
                          <View
                            style={[
                              styles.clientModeSwitch,
                              isCompactPhoneViewport && styles.clientModeSwitchCompact,
                              expandLandingWideContent && styles.quickAccessCardWide,
                            ]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              style={({ pressed }) => [
                                styles.clientModeSwitchButton,
                                clientEntryMode === 'access' && styles.clientModeSwitchButtonActive,
                                pressed && styles.clientModeSwitchButtonPressed,
                              ]}
                              onPress={() => {
                                registerScrollRequestRef.current = null;
                                setClientEntryMode('access');
                                setIsSalonSelectorOpen(false);
                                setRegisterError('');
                              }}
                            >
                              <Text
                                style={[
                                  styles.clientModeSwitchButtonText,
                                  clientEntryMode === 'access' && styles.clientModeSwitchButtonTextActive,
                                ]}
                              >
                                Accedi
                              </Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              style={({ pressed }) => [
                                styles.clientModeSwitchButton,
                                clientEntryMode === 'register' && styles.clientModeSwitchButtonActive,
                                pressed && styles.clientModeSwitchButtonPressed,
                              ]}
                              onPress={() => {
                                if (clientEntryMode !== 'register') {
                                  resetClientRegistrationEmailVerification();
                                }
                                setClientEntryMode('register');
                                setIsSalonSelectorOpen(false);
                                setAccessError('');
                                Keyboard.dismiss();
                                registerScrollRequestRef.current = { navigationGeneration: landingNavigationGenerationRef.current };
                                if (clientEntryMode === 'register') revealClientRegistration();
                              }}
                            >
                              <Text
                                style={[
                                  styles.clientModeSwitchButtonText,
                                  clientEntryMode === 'register' && styles.clientModeSwitchButtonTextActive,
                                ]}
                              >
                                Registrati
                              </Text>
                            </Pressable>
                          </View>

                          {clientEntryMode === 'access' ? (
                            <View
                              style={[
                                styles.quickAccessCard,
                                isCompactPhoneViewport && styles.quickAccessCardCompact,
                                expandLandingWideContent && styles.quickAccessCardWide,
                              ]}
                            >
                              <View style={[styles.quickAccessHeader, styles.compactIdentityHeader]}>
                                <View style={styles.quickAccessIconBadge}>
                                  <Ionicons name="person" size={17} color="#294D79" />
                                </View>
                                <View style={styles.compactIdentityHeaderText}>
                                  <Text style={[styles.quickAccessTitle, styles.compactIdentityTitle]}>Accedi</Text>
                                  <Text style={[styles.quickAccessSubtitle, styles.compactIdentitySubtitle]}>
                                    Hai già un profilo? Entra qui.
                                  </Text>
                                </View>
                              </View>

                              {Platform.OS !== 'web' ? (
                                <ClientBiometricTouchable
                                  style={[
                                    styles.quickAccessBiometricButton,
                                    (!canUseBiometricAccess || isAccessingClient) && styles.quickAccessButtonDisabled,
                                    !canUseBiometricAccess && styles.quickAccessBiometricButtonDisabled,
                                  ]}
                                  onPress={openSavedClientBiometricAccess}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${biometricButtonLabel}. ${biometricButtonCaption}`}
                                  accessibilityState={{ disabled: !canUseBiometricAccess || isAccessingClient, busy: isAccessingClient }}
                                  disabled={!canUseBiometricAccess || isAccessingClient}
                                >
                                  <View style={styles.quickAccessBiometricButtonRow}>
                                    <View
                                      style={[
                                        styles.quickAccessBiometricIconBadge,
                                        !canUseBiometricAccess && styles.quickAccessBiometricIconBadgeDisabled,
                                      ]}
                                    >
                                      {isAccessingClient && clientAccessLoadingSource === 'biometric' ? (
                                        <ClientAccessSpinner tone="blue" />
                                      ) : Platform.OS === 'ios' ? (
                                        <MaterialCommunityIcons
                                          name="face-recognition"
                                          size={21}
                                          color={canUseBiometricAccess ? palette.ink : palette.muted}
                                        />
                                      ) : (
                                        <Ionicons
                                          name="finger-print-outline"
                                          size={18}
                                          color={canUseBiometricAccess ? palette.ink : palette.muted}
                                        />
                                      )}
                                    </View>
                                    <View style={styles.quickAccessBiometricTextWrap}>
                                      <Text
                                        style={[
                                          styles.quickAccessBiometricButtonText,
                                          !canUseBiometricAccess && styles.quickAccessBiometricButtonTextDisabled,
                                        ]}
                                      >
                                        {isAccessingClient && clientAccessLoadingSource === 'biometric'
                                          ? 'Verifica in corso...'
                                          : responsive.isTablet
                                            ? biometricButtonLabel
                                            : compactBiometricButtonLabel}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.quickAccessBiometricButtonCaption,
                                          !canUseBiometricAccess && styles.quickAccessBiometricButtonCaptionDisabled,
                                        ]}
                                        numberOfLines={2}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.92}
                                      >
                                        {frontendBiometricEnabled
                                          ? biometricButtonCaption
                                          : 'Attivalo dalle impostazioni cliente'}
                                      </Text>
                                    </View>
                                  </View>
                                </ClientBiometricTouchable>
                              ) : null}

                              <AndroidStablePlaceholderInput
                                ref={accessEmailRef}
                                style={[
                                  styles.quickAccessInput,
                                  Platform.OS === 'android' && styles.androidVisibleQuickAccessInput,
                                  isClientBiometricVisualAccess && styles.biometricCredentialMaskInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder={clientAccessEmailPlaceholder}
                                placeholderTextColor={
                                  Platform.OS === 'android' && !isClientBiometricVisualAccess
                                    ? '#475569'
                                    : clientAccessPlaceholderColor
                                }
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="username"
                                textContentType="username"
                                importantForAutofill="yes"
                                underlineColorAndroid="transparent"
                                selectionColor="#2563eb"
                                value={clientAccessEmailDisplayValue}
                                onChangeText={(value) => {
                                  if (isClientBiometricVisualAccess) return;
                                  setAccessEmail(value);
                                  clearAccessEmailCompletion();
                                  if (accessError) setAccessError('');
                                }}
                                keyboardType="email-address"
                                onFocus={() => handleClientInputFocus(accessEmailRef)}
                                editable={hasAssociatedSalon && !isClientBiometricVisualAccess}
                              />

                              <TextInput
                                ref={accessPhoneRef}
                                style={[
                                  styles.quickAccessInput,
                                  Platform.OS === 'android' && styles.androidVisibleQuickAccessInput,
                                  isClientBiometricVisualAccess && styles.biometricCredentialMaskInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder={clientAccessPhonePlaceholder}
                                placeholderTextColor={
                                  Platform.OS === 'android' && !isClientBiometricVisualAccess
                                    ? '#475569'
                                    : clientAccessPlaceholderColor
                                }
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="off"
                                textContentType="none"
                                importantForAutofill="no"
                                underlineColorAndroid="transparent"
                                selectionColor="#2563eb"
                                value={clientAccessPhoneDisplayValue}
                                onChangeText={(value) => {
                                  if (isClientBiometricVisualAccess) return;
                                  setAccessPhone(value);
                                  clearAccessEmailCompletion();
                                  if (accessError) setAccessError('');
                                }}
                                keyboardType="phone-pad"
                                onFocus={() => handleClientInputFocus(accessPhoneRef)}
                                editable={hasAssociatedSalon && !isClientBiometricVisualAccess}
                                returnKeyType="next"
                                onSubmitEditing={() => accessPasswordRef.current?.focus()}
                              />

                              <PasswordTextInput
                                      visibilityToggleColor={palette.muted}
                                ref={accessPasswordRef}
                                useNativeIosToggle
                                style={[
                                  styles.quickAccessInput,
                                  isClientBiometricVisualAccess && styles.biometricCredentialMaskInput,
                                  accessPasswordError && styles.quickAccessInputError,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                secureValueStyle={styles.quickAccessSecureValue}
                                placeholder={clientAccessPasswordPlaceholder}
                                placeholderTextColor={clientAccessPlaceholderColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="current-password"
                                textContentType="password"
                                importantForAutofill="yes"
                                value={clientAccessPasswordDisplayValue}
                                onChangeText={(value) => {
                                  setAccessPassword(value);
                                  setAccessPasswordError('');
                                  if (accessError) setAccessError('');
                                }}
                                onFocus={() => handleClientInputFocus(accessPasswordRef)}
                                editable={hasAssociatedSalon && !isClientBiometricVisualAccess}
                                returnKeyType="done"
                                onSubmitEditing={() => {
                                  Keyboard.dismiss();
                                  if (Platform.OS === 'web' && !isClientAccessButtonDisabled) {
                                    void openSavedClientAccess();
                                  }
                                }}
                              />
                              {accessPasswordError ? (
                                <Text style={styles.quickAccessError}>{accessPasswordError}</Text>
                              ) : null}
                              <ClientLoginTouchable
                                accessibilityRole="button"
                                {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true' } } : {})}
                                style={styles.quickAccessPasswordLink}
                                onPress={() => {
                                  navigateToHref({
                                    pathname: '/cliente-password',
                                    params: {
                                      mode: 'reset',
                                      salon: normalizedAssociatedSalonCode || undefined,
                                      email: normalizeEmail(accessEmail) || undefined,
                                      phone: normalizePhone(accessPhone) || undefined,
                                    },
                                  });
                                }}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.quickAccessPasswordLinkText}>
                                  Password dimenticata?
                                </Text>
                              </ClientLoginTouchable>

                              {!hasAssociatedSalon ? (
                                <Text style={styles.quickAccessWarning}>
                                  Associa prima un salone per poter accedere.
                                </Text>
                              ) : null}
                              {accessError ? <Text style={styles.quickAccessError}>{accessError}</Text> : null}

                              <ClientLoginTouchable
                                style={[
                                  styles.quickAccessButton,
                                  isClientAccessButtonDisabled && styles.clientAccessPrimaryDisabled,
                                ]}
                                onPress={openSavedClientAccess}
                                activeOpacity={0.9}
                                disabled={isClientAccessButtonDisabled}
                              >
                                {isAccessingClient && clientAccessLoadingSource !== 'biometric' ? (
                                  <View style={styles.quickAccessButtonLoadingRow}>
                                    <Text style={styles.quickAccessButtonText}>Accesso in corso...</Text>
                                    <ClientAccessSpinner />
                                  </View>
                                ) : (
                                  <Text style={[styles.quickAccessButtonText, isClientAccessButtonDisabled && styles.clientAccessPrimaryTextDisabled]}>Accedi</Text>
                                )}
                              </ClientLoginTouchable>


                            </View>
                          ) : (
                            <View
                              ref={registerSectionRef}
                              style={[
                                styles.quickAccessCard,
                                isCompactPhoneViewport && styles.quickAccessCardCompact,
                                expandLandingWideContent && styles.quickAccessCardWide,
                              ]}
                              onLayout={revealClientRegistration}
                            >
                              <View style={[styles.quickAccessHeader, styles.compactIdentityHeader]}>
                                <View style={styles.quickAccessIconBadge}>
                                  <Ionicons name="person-add" size={17} color="#294D79" />
                                </View>
                                <View style={styles.compactIdentityHeaderText}>
                                  <Text style={[styles.quickAccessTitle, styles.compactIdentityTitle]}>Registrati</Text>
                                  <Text style={[styles.quickAccessSubtitle, styles.compactIdentitySubtitle]}>
                                    Crea il profilo per questo salone.
                                  </Text>
                                </View>
                              </View>

                              <AndroidStablePlaceholderInput
                                ref={registerNomeRef}
                                style={[
                                  styles.quickAccessInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder="Nome (obbligatorio)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="words"
                                autoCorrect={false}
                                autoComplete="given-name"
                                textContentType="givenName"
                                importantForAutofill="yes"
                                value={registerProfile.nome}
                                onChangeText={(value) => {
                                  setRegisterProfile((current) => ({
                                    ...current,
                                    nome: value,
                                  }));
                                  if (registerError) setRegisterError('');
                                }}
                                onEndEditing={() => {
                                  setRegisterProfile((current) => ({
                                    ...current,
                                    nome: formatLeadingCapitalizedValue(current.nome),
                                  }));
                                }}
                                onFocus={() => handleClientInputFocus(registerNomeRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerCognomeRef.current?.focus()}
                              />
                              <AndroidStablePlaceholderInput
                                ref={registerCognomeRef}
                                style={[
                                  styles.quickAccessInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder="Cognome (obbligatorio)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="words"
                                autoCorrect={false}
                                autoComplete="family-name"
                                textContentType="familyName"
                                importantForAutofill="yes"
                                value={registerProfile.cognome}
                                onChangeText={(value) => {
                                  setRegisterProfile((current) => ({
                                    ...current,
                                    cognome: value,
                                  }));
                                  if (registerError) setRegisterError('');
                                }}
                                onEndEditing={() => {
                                  setRegisterProfile((current) => ({
                                    ...current,
                                    cognome: formatLeadingCapitalizedValue(current.cognome),
                                  }));
                                }}
                                onFocus={() => handleClientInputFocus(registerCognomeRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerEmailRef.current?.focus()}
                              />
                              <AndroidStablePlaceholderInput
                                ref={registerEmailRef}
                                style={[
                                  styles.quickAccessInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder="Mail (obbligatoria)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="username"
                                textContentType="username"
                                importantForAutofill="yes"
                                keyboardType="email-address"
                                value={registerProfile.email}
                                onChangeText={(value) => {
                                  setRegisterProfile((current) => ({ ...current, email: value }));
                                  setRegisterEmailOtpSentTo('');
                                  setRegisterEmailOtpVerifiedFor('');
                                  setRegisterEmailOtpVerifiedAt(0);
                                  setRegisterEmailOtpSalonCode('');
                                  setRegisterEmailOtpExpiresAt(0);
                                  setRegisterEmailOtpMessage('');
                                  if (registerError) setRegisterError('');
                                }}
                                onFocus={() => handleClientInputFocus(registerEmailRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerPhoneRef.current?.focus()}
                              />
                              <AndroidStablePlaceholderInput
                                ref={registerPhoneRef}
                                style={[
                                  styles.quickAccessInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder="Cellulare (obbligatorio)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                keyboardType="phone-pad"
                                autoComplete="off"
                                textContentType="none"
                                importantForAutofill="no"
                                value={registerProfile.telefono}
                                onChangeText={(value) => {
                                  setRegisterProfile((current) => ({
                                    ...current,
                                    telefono: limitPhoneToTenDigits(value),
                                  }));
                                  if (registerError) setRegisterError('');
                                }}
                                onFocus={() => handleClientInputFocus(registerPhoneRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerInstagramRef.current?.focus()}
                              />
                              <AndroidStablePlaceholderInput
                                ref={registerInstagramRef}
                                style={[
                                  styles.quickAccessInput,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                placeholder="Instagram (facoltativo)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={registerProfile.instagram}
                                onChangeText={(value) => {
                                  setRegisterProfile((current) => ({ ...current, instagram: value }));
                                  if (registerError) setRegisterError('');
                                }}
                                onFocus={() => handleClientInputFocus(registerInstagramRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerPasswordRef.current?.focus()}
                              />

                              <PasswordTextInput
                                      visibilityToggleColor={palette.muted}
                                stableAndroidPlaceholder
                                manualIosEntry
                                ref={registerPasswordRef}
                                style={[
                                  styles.quickAccessInput,
                                  registerPasswordError && styles.quickAccessInputError,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                secureValueStyle={styles.quickAccessSecureValue}
                                placeholder="Password (obbligatoria)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="newPassword"
                                importantForAutofill="yes"
                                value={registerPassword}
                                onChangeText={(value) => {
                                  setRegisterPassword(value);
                                  setRegisterPasswordError('');
                                  if (registerError) setRegisterError('');
                                }}
                                onFocus={() => handleClientInputFocus(registerPasswordRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="next"
                                onSubmitEditing={() => registerPasswordConfirmRef.current?.focus()}
                              />
                              {registerPasswordError ? (
                                <Text style={styles.quickAccessError}>{registerPasswordError}</Text>
                              ) : null}
                              <PasswordTextInput
                                      visibilityToggleColor={palette.muted}
                                stableAndroidPlaceholder
                                manualIosEntry
                                ref={registerPasswordConfirmRef}
                                style={[
                                  styles.quickAccessInput,
                                  registerPasswordError && styles.quickAccessInputError,
                                  !hasAssociatedSalon && styles.quickAccessInputDisabled,
                                ]}
                                secureValueStyle={styles.quickAccessSecureValue}
                                placeholder="Conferma password (obbligatoria)"
                                placeholderTextColor={clientRegisterPlaceholderColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="newPassword"
                                importantForAutofill="yes"
                                value={registerPasswordConfirm}
                                onChangeText={(value) => {
                                  setRegisterPasswordConfirm(value);
                                  setRegisterPasswordError('');
                                  if (registerError) setRegisterError('');
                                }}
                                onFocus={() => handleClientInputFocus(registerPasswordConfirmRef)}
                                editable={hasAssociatedSalon}
                                returnKeyType="done"
                                onSubmitEditing={() => Keyboard.dismiss()}
                              />
                              <PasswordRequirements
                                password={registerPassword}
                                alignLeft={Platform.OS !== 'web'}
                              />
                              {Platform.OS !== 'web' ? (
                                <PasswordMatchRequirement
                                  password={registerPassword}
                                  confirmPassword={registerPasswordConfirm}
                                  alignLeft
                                />
                              ) : null}

                              {!hasAssociatedSalon ? (
                                <Text style={styles.quickAccessWarning}>
                                  Associa prima un salone per poter registrarti.
                                </Text>
                              ) : null}
                              {registerError &&
                              !registerEmailOtpIsVerified &&
                              !registerError.toLowerCase().includes('codice') &&
                              !registerError.toLowerCase().includes('otp') &&
                              !registerError.toLowerCase().includes('email') ? (
                                <Text style={styles.quickAccessError}>{registerError}</Text>
                              ) : null}

                              <OtpVerifiedActionHalo
                                active={registerEmailOtpIsVerified}
                                premiumNative
                              >
                                <TouchableOpacity
                                  style={[
                                    styles.quickAccessButton,
                                    (!hasAssociatedSalon || registeringClient) && styles.quickAccessButtonDisabled,
                                  ]}
                                  onPress={() => {
                                    void handleRegisterClient();
                                  }}
                                  activeOpacity={0.9}
                                  disabled={!hasAssociatedSalon || registeringClient}
                                >
                                  <Text style={styles.quickAccessButtonText}>
                                    {registeringClient ? 'Registrazione in corso...' : 'Registrati'}
                                  </Text>
                                </TouchableOpacity>
                              </OtpVerifiedActionHalo>
                            </View>
                          )}
                      </AccessWidePanel>
                    </View>
                  </View>

                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAccessInformation }} onPress={() => setShowAccessInformation(value => !value)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...(Platform.OS === 'web' ? { alignSelf: 'center' as const, paddingHorizontal: 12 } : {}) }}>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>{showAccessInformation ? 'Chiudi informazioni' : 'Scopri cosa puoi fare con SalonPro'} {showAccessInformation ? '−' : '+'}</Text>
                  </Pressable>
                  <View style={{ display: showAccessInformation ? 'flex' : 'none' }}>
                  {!isRegistrationOnlyClientWebFlow ? (
                  <View style={styles.benefitsSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Tutto quello che ti serve, lato cliente</Text>
                      <Text
                        style={[
                          styles.sectionSubtitle,
                          expandLandingWideContent && styles.sectionSubtitleWide,
                        ]}
                      >
                        Un ingresso semplice per prenotare e tenere tutto sotto controllo.
                      </Text>
                      <Text
                        style={[
                          styles.sectionHelperText,
                          expandLandingWideContent && styles.sectionHelperTextWide,
                        ]}
                      >
                        Riquadri informativi: servono solo a spiegarti cosa puoi fare nell’area cliente.
                      </Text>
                    </View>

                    <View style={styles.benefitsGrid}>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="sparkles" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Prenota facilmente</Text>
                          <Text style={styles.benefitText}>Apri il salone giusto, scegli il servizio e invia la richiesta in pochi passaggi.</Text>
                        </View>
                      </View>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="calendar-clear" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Gestisci gli appuntamenti</Text>
                          <Text style={styles.benefitText}>Controlla le tue richieste, lo stato delle conferme e le eventuali modifiche.</Text>
                        </View>
                      </View>
                      <View style={styles.benefitCard}>
                        <View style={styles.benefitIconWrap}>
                          <Ionicons name="chatbubble-ellipses" size={18} color={palette.night ? '#D8C29B' : '#776143'} />
                        </View>
                        <View style={styles.benefitCopy}>
                          <Text style={styles.benefitTitle}>Resta collegato al tuo salone</Text>
                          <Text style={styles.benefitText}>Tieni a portata di mano i riferimenti del salone e torna nella tua area cliente quando vuoi.</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  ) : null}

                  <View style={styles.reassuranceCard}>
                    <View style={styles.reassuranceColumn}>
                      <Text style={styles.reassuranceTitle}>Una pagina semplice, pensata per i clienti</Text>
                      <Text
                        style={[
                          styles.reassuranceText,
                          expandLandingWideContent && styles.reassuranceTextWide,
                        ]}
                      >
                        Nessun gestionale complicato, nessuna configurazione tecnica. Qui puoi solo prenotare e gestire i tuoi appuntamenti nel tuo salone di fiducia.
                      </Text>
                    </View>
                  </View>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>

          <MetaMeasurementLink />
          <View
            style={[
              styles.footer,
              Platform.OS === 'android' && {
                marginTop: 10,
                paddingBottom: androidFooterBottomPadding,
              },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="link"
              {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true', premiumStaticAction: 'true' } } : {})}
              style={Platform.OS === 'web' ? { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 } : undefined}
              activeOpacity={Platform.OS === 'web' ? 1 : 0.75}
              onPress={() => {
                if (Platform.OS === 'web') {
                  router.push('/privacy');
                  return;
                }

                router.push('/privacy');
              }}
              webTouchAction="manipulation"
            >
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="link"
              {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true', premiumStaticAction: 'true' } } : {})}
              style={Platform.OS === 'web' ? { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 } : undefined}
              activeOpacity={Platform.OS === 'web' ? 1 : 0.75}
              onPress={() => {
                if (Platform.OS === 'web') {
                  router.push('/support');
                  return;
                }

                setActiveFooterDialog('support');
              }}
              webTouchAction="manipulation"
            >
              <Text style={styles.footerLink}>Supporto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="link"
              {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true', premiumStaticAction: 'true' } } : {})}
              style={Platform.OS === 'web' ? { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 } : undefined}
              activeOpacity={Platform.OS === 'web' ? 1 : 0.75}
              onPress={() => {
                if (Platform.OS === 'web') {
                  router.push('/contatti');
                  return;
                }

                setActiveFooterDialog('contacts');
              }}
              webTouchAction="manipulation"
            >
              <Text style={styles.footerLink}>Contatti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <EmailOtpModal
        visible={accessEmailOtpModalVisible && !!accessEmailCompletionSentTo}
        email={accessEmailCompletionSentTo || normalizeEmail(accessEmail)}
        resetKey={accessEmailCompletionChallengeVersion}
        busy={accessEmailCompletionBusy}
        expired={accessEmailCompletionExpired}
        countdown={accessEmailCompletionCountdown}
        message={accessEmailCompletionMessage}
        title="Completa il primo accesso"
        nativeCompactLayout
        onVerify={verifyAccessEmailCompletion}
        onResend={() => void requestAccessEmailCompletionOtp({ email: accessEmail, phone: accessPhone })}
        onBack={() => setAccessEmailOtpModalVisible(false)}
      />
      <EmailOtpModal
        visible={registerEmailOtpModalVisible && !registerEmailOtpIsVerified}
        email={registerEmailOtpSentTo || normalizeEmail(registerProfile.email)}
        resetKey={registerEmailOtpChallengeVersion}
        busy={registerEmailOtpBusy}
        expired={registerEmailOtpExpired}
        countdown={registerEmailOtpCountdown}
        message={registerEmailOtpMessage}
        title="Conferma il tuo account"
        nativeCompactLayout
        onVerify={verifyClientRegisterEmailOtp}
        onResend={() => void requestClientRegisterEmailOtp(registerProfile.email, normalizedAssociatedSalonCode)}
        onBack={() => setRegisterEmailOtpModalVisible(false)}
      />
      <Modal transparent visible={savedSalonActionsCode !== null} animationType="fade" onRequestClose={() => setSavedSalonActionsCode(null)} onDismiss={() => {
        const code = pendingSavedSalonRemovalRef.current;
        pendingSavedSalonRemovalRef.current = null;
        if (code) requestRemoveSavedSalon(code);
      }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 28, paddingBottom: 0 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chiudi opzioni salone" activeOpacity={1} onPress={() => setSavedSalonActionsCode(null)} style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,23,42,0.25)' }]} />
          <DockedSheetSurface accessibilityViewIsModal style={{ width: '100%', maxWidth: 320, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E5EAF1', shadowColor: '#172B46', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AccessSalonBadge salonCode={savedSalonActionsCode ?? ''} name={savedSalonActionsCode ?? ''} size={38} />
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#7B899C', marginBottom: 3 }}>SALONE SALVATO</Text><Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: '#23364F' }}>{savedSalonActionsCode}</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chiudi opzioni" onPress={() => setSavedSalonActionsCode(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F5F8', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={18} color="#64748B" /></TouchableOpacity>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              const code = savedSalonActionsCode;
              if (!code) return;
              setSavedSalonActionsCode(null);
              if (Platform.OS === 'ios') pendingSavedSalonRemovalRef.current = code;
              else requestAnimationFrame(() => requestRemoveSavedSalon(code));
            }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#EDF0F5', paddingTop: 15, paddingBottom: 3 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="trash-outline" size={17} color="#B14B59" /></View>
              <Text style={{ color: '#A43C49', fontSize: 14, fontWeight: '600', flex: 1 }}>Rimuovi dai salvati</Text>
              <Ionicons name="chevron-forward" size={14} color="#AC8A90" />
            </TouchableOpacity>
          </DockedSheetSurface>
        </View>
      </Modal>
      <Modal
        visible={!!footerDialogContent}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveFooterDialog(null)}
      >
        <Pressable
          style={styles.footerDialogBackdrop}
          onPress={() => setActiveFooterDialog(null)}
        >
          <Pressable style={styles.footerDialogCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.footerDialogTitle}>{footerDialogContent?.title}</Text>
            <Text style={styles.footerDialogBody}>{footerDialogContent?.body}</Text>
            {!!footerDialogContent?.email && (
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.footerDialogTextLink}
                onPress={() => Linking.openURL(`mailto:${footerDialogContent.email}`)}
                webTouchAction="manipulation"
              >
                <Text style={styles.footerDialogTextLinkLabel}>{footerDialogContent.email}</Text>
              </TouchableOpacity>
            )}
            {!!footerDialogContent?.instagramUrl && (
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.footerDialogTextLink}
                onPress={() => Linking.openURL(footerDialogContent.instagramUrl)}
                webTouchAction="manipulation"
              >
                <Text style={styles.footerDialogTextLinkLabel}>
                  Instagram {footerDialogContent.instagramHandle}
                </Text>
              </TouchableOpacity>
            )}
            {!!footerDialogContent?.siteUrl && (
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.footerDialogTextLink}
                onPress={() => Linking.openURL(footerDialogContent.siteUrl)}
                webTouchAction="manipulation"
              >
                <Text style={styles.footerDialogTextLinkLabel}>
                  {footerDialogContent.siteLabel}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.footerDialogButton}
              onPress={() => setActiveFooterDialog(null)}
              webTouchAction="manipulation"
            >
              <Text style={styles.footerDialogButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    paddingBottom: 28,
  },
  registrationOnlyWebContent: {
    paddingBottom: 360,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
  },
  landingPagerViewport: {
    width: '100%',
    overflow: 'hidden',
  },
  landingPagerTrack: {
    alignItems: 'flex-start',
    backgroundColor: '#F3F6FA',
  },
  landingPagerPage: {
    flexShrink: 0,
    backgroundColor: '#F3F6FA',
  },
  hiddenLandingPage: {
    display: 'none',
  },
  landingPagerPageInner: {
    width: '100%',
    backgroundColor: '#F3F6FA',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -100,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(219, 234, 254, 0.48)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: 'rgba(226, 232, 240, 0.42)',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
    marginBottom: 18,
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
  },
  heroCardCompact: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    marginBottom: 14,
    borderRadius: 24,
  },
  accessAreaHeader: { width: '100%', alignItems: 'center', marginBottom: 18 },
  accessBrandRow: { width: '100%', height: 102, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  accessBrandMark: { width: '100%', alignItems: 'center' },
  accessAudienceControl: { position: 'absolute', left: -22, top: -8, width: 58 },
  ownerAudienceControlWeb: { position: 'absolute', zIndex: 1, width: 58 },
  accessAreaTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: '#152235', textAlign: 'center', marginBottom: 5 },
  accessAreaSubtitle: { width: '100%', fontSize: 17, lineHeight: 23, fontWeight: '500', color: '#5B697D', textAlign: 'center' },
  audienceChoicePanel: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, borderRadius: 28, borderWidth: 1, borderColor: '#E4EAF2', backgroundColor: '#FFFFFF', gap: 14, shadowColor: '#24394F', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  audienceChoiceBrandRow: { width: '100%', height: 102, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  audienceChoiceWordmark: { width: '100%', alignItems: 'center' },
  compactIdentityHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 12 },
  compactIdentityHeaderText: { alignItems: 'flex-start', flexShrink: 1 },
  compactIdentityTitle: { fontSize: 19, lineHeight: 24, textAlign: 'left', marginBottom: 2 },
  compactIdentitySubtitle: { textAlign: 'left', fontSize: 12, lineHeight: 18 },
  audienceChoiceBack: { position: 'absolute', left: -4, top: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F6F9', borderWidth: 1, borderColor: '#E2E8F0' },
  audienceChoiceTitle: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: '#152235', textAlign: 'center' },
  audienceChoiceSubtitle: { fontSize: 15, lineHeight: 22, color: '#66758A', textAlign: 'center', marginBottom: 6 },
  audienceChoiceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 18, borderRadius: 20, borderWidth: 1, minHeight: 102 },
  audienceChoiceClient: { backgroundColor: '#FBF9FE', borderColor: '#E1D7EE' },
  audienceChoiceOwner: { backgroundColor: '#FFFCF6', borderColor: '#EADFCA' },
  audienceChoicePressed: { opacity: 0.72 },
  audienceChoiceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  audienceChoiceClientIcon: { backgroundColor: '#F0EAF8' },
  audienceChoiceOwnerIcon: { backgroundColor: '#F9EFDD' },
  audienceChoiceCardTitle: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: '#1D2A3E' },
  audienceChoiceCardDescription: { fontSize: 14, lineHeight: 20, color: '#627086' },
  audienceChoiceFootnote: { fontSize: 12, lineHeight: 18, color: '#778395', textAlign: 'center', marginTop: 4 },
  landingWordmarkBand: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    marginBottom: -2,
  },
  landingWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landingSwitchCard: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  landingSwitchCardWide: {
    maxWidth: '100%',
  },
  landingSwitchEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#64748B',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
  },
  landingSwitchRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  landingSwitchChip: {
    flex: 1,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    shadowColor: '#d8e2f0',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  landingSwitchChipTightAndroid: {
    minHeight: 62,
    gap: 6,
    paddingHorizontal: 10,
  },
  landingSwitchChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  landingSwitchChipOwnerActive: {
    backgroundColor: '#B56A1E',
    borderColor: '#B56A1E',
    shadowColor: '#D97706',
    shadowOpacity: 0.32,
  },
  landingSwitchChipClientActive: {
    backgroundColor: '#18284A',
    borderColor: '#18284A',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.32,
  },
  landingSwitchChipPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  landingSwitchChipText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    flexShrink: 1,
  },
  landingSwitchChipTextTightAndroid: {
    fontSize: 13,
    lineHeight: 17,
  },
  landingSwitchChipTextActive: {
    color: '#F8FAFC',
  },
  landingSwitchHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
  },
  landingSwitchHintTightAndroid: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  clientSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    marginBottom: 20,
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
  },
  clientSectionCardWide: {
    paddingHorizontal: 32,
  },
  clientSectionCardCompact: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    marginBottom: 16,
    borderRadius: 24,
  },
  clientSectionCardTightAndroid: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  brandWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  heroIconRowCompact: {
    gap: 10,
    marginBottom: 12,
  },
  heroSalonInlineSection: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 0,
  },
  heroSalonInlineSectionCompact: {
    maxWidth: '100%',
    marginTop: -4,
  },
  heroSalonInlineSectionWide: {
    maxWidth: 860,
  },
  heroSalonInlineText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 2,
    maxWidth: 760,
  },
  heroSalonInlineTextCompact: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 2,
    maxWidth: 620,
  },
  landingWideTitle: {
    maxWidth: 920,
  },
  landingWideSubtitle: {
    maxWidth: 920,
  },
  heroSalonIconRow: {
    marginTop: 0,
    marginBottom: 14,
  },
  heroClientIconRow: {
    marginTop: 0,
    marginBottom: 14,
  },
  eyebrowSalon: {
    color: '#64748B',
    marginBottom: 6,
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DCE6F5',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  heroIconBadgeCompact: {
    width: 46,
    height: 46,
    borderRadius: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
    maxWidth: 760,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 27,
    lineHeight: 30,
    marginBottom: 8,
    maxWidth: '100%',
  },
  ownerTitleCompact: {
    fontSize: 24,
    lineHeight: 27,
    marginBottom: 6,
    maxWidth: '100%',
  },
  titleVeryCompact: {
    fontSize: 23,
    lineHeight: 26,
  },
  titleTightAndroid: {
    fontSize: 25,
    lineHeight: 29,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 12,
    maxWidth: 760,
    textAlign: 'center',
  },
  subtitleCompact: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
    maxWidth: 620,
  },
  subtitleTightAndroid: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroActionGroup: {
    width: '100%',
    maxWidth: 520,
    gap: 12,
    marginTop: 2,
  },
  heroActionSection: {
    width: '100%',
    alignItems: 'center',
  },
  heroActionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroActionLabelSalon: {
    color: '#8A6A08',
  },
  heroPrimaryButton: {
    minWidth: 188,
    width: '100%',
  },
  codeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroSecondaryButton: {
    minWidth: 188,
    width: '100%',
  },
  heroSalonButton: {
    backgroundColor: '#FFF6D8',
    borderColor: 'rgba(196, 154, 20, 0.24)',
    borderWidth: 1.5,
    borderRadius: 999,
    shadowColor: '#E8D39A',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroSalonButtonPressed: {
    opacity: 0.86,
  },
  heroSalonButtonDisabled: {
    opacity: 0.7,
  },
  heroSalonButtonText: {
    color: '#5F4700',
    fontWeight: '900',
  },
  ownerInlineAccessWrap: {
    width: '100%',
    marginTop: 0,
    paddingHorizontal: 6,
  },
  ownerInlineAccessWrapCompact: {
    marginTop: 0,
    paddingHorizontal: 0,
  },
  ownerResetNotice: {
    width: '100%',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  ownerResetNoticeInfo: {
    backgroundColor: '#F8FBFF',
    borderColor: '#CFE0F2',
  },
  ownerResetNoticeSuccess: {
    backgroundColor: '#F3FBF5',
    borderColor: '#B9E3C3',
  },
  ownerResetNoticeTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  ownerResetNoticeBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  ownerInlineAccessWrapWide: {
    paddingHorizontal: 8,
    maxWidth: 760,
    alignSelf: 'center',
  },
  accessCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 18,
    marginBottom: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
  },
  accessCardWide: {
    maxWidth: '100%',
  },
  accessCardCompact: {
    marginTop: 14,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  accessTitleCompact: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 4,
  },
  accessTitleTightAndroid: {
    fontSize: 17,
    lineHeight: 22,
  },
  accessEyebrow: {
    marginBottom: 4,
  },
  accessSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: 520,
  },
  accessSubtitleCompact: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    maxWidth: 460,
  },
  accessSubtitleWide: {
    maxWidth: 760,
  },
  alternateSalonSearch: { width: '100%', marginBottom: 16, gap: 12 },
  ownerEntryIconTint: { backgroundColor: '#FFF4E5', borderColor: '#F0DFC6', shadowOpacity: 0, elevation: 0 },
  clientEntryIconTint: { backgroundColor: '#E8F1FC', borderColor: '#D6E5F7', shadowOpacity: 0, elevation: 0 },
  associatedSalonEntryHeader: { width: '100%', alignItems: 'center', marginBottom: 12 },
  associatedSalonEntryIcons: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  associatedSalonEntryIcon: { width: 36, height: 36, borderRadius: 12 },
  associatedSalonEntryTitle: {
    width: '100%',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 0,
  },
  associatedSalonCompactCard: { padding: 10, marginBottom: 10, borderColor: '#D7E5F5', backgroundColor: '#F0F6FD' },
  associatedSalonCompactHeader: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8, marginBottom: 8 },
  associatedSalonCompactTitle: { fontSize: 14, lineHeight: 19 },
  associatedSalonCompactStatus: { paddingHorizontal: 0, paddingVertical: 0, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' },
  associatedSalonManageButton: { position: 'relative', top: undefined, right: undefined, width: 'auto', height: 30, minHeight: 30, paddingHorizontal: 8, flexDirection: 'row', gap: 3, borderRadius: 10 },
  associatedSalonManageText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  quickAccessCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E9F4',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickAccessCardWide: {
    maxWidth: 760,
  },
  quickAccessCardCompact: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 16,
  },
  clientModeSwitch: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    columnGap: 10,
    marginBottom: 14,
    backgroundColor: '#EFF4FB',
    borderRadius: 26,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.78)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  clientModeSwitchCompact: {
    columnGap: 10,
    marginBottom: 12,
  },
  clientModeSwitchButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  clientModeSwitchButtonActive: {
    backgroundColor: '#1B3155',
    borderColor: '#1B3155',
    shadowColor: '#1B3155',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  clientModeSwitchButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  clientModeSwitchButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  clientModeSwitchButtonTextActive: {
    color: '#F8FAFC',
  },
  salonAssociationStatusCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  salonAssociationStatusCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: 'rgba(37, 99, 235, 0.16)',
  },
  salonAssociationStatusCardEmpty: {
    backgroundColor: '#FEF2F2',
    borderColor: 'rgba(220, 38, 38, 0.16)',
  },
  salonAssociationStatusLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  salonAssociationStatusLabelActive: {
    color: '#1d4ed8',
  },
  salonAssociationStatusLabelEmpty: {
    color: '#b91c1c',
  },
  salonAssociationStatusValue: {
    fontSize: Platform.OS === 'web' ? 28 : 20,
    lineHeight: Platform.OS === 'web' ? 32 : undefined,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? FRONTEND_SIMPLE_WEB_FONT : undefined,
  },
  salonAssociationStatusHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
  salonAssociationSelectorWrap: {
    width: '100%',
    gap: 8,
  },
  salonAssociationSelectorHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
    fontWeight: '700',
    textAlign: 'center',
  },
  salonAssociationSelector: {
    width: '100%',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.16)',
    minHeight: 50,
    position: 'relative',
  },
  salonAssociationSelectorText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'left',
    flex: 1,
    paddingRight: 24,
  },
  salonAssociationSelectorChevron: {
    position: 'absolute',
    right: 14,
  },
  savedSalonRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#E4EAF2', backgroundColor: '#FFFFFF', paddingRight: 5 },
  savedSalonRowSelected: { backgroundColor: '#EDF3FD', borderColor: '#BFD2EF' },
  savedSalonIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' },
  savedSalonMore: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F4FA', alignItems: 'center', justifyContent: 'center' },
  salonAssociationSelectorMenu: {
    width: '100%',
    marginTop: 6,
    padding: 6, gap: 6,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F5F7FB',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.12)',
  },
  salonAssociationSelectorOption: {
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderBottomWidth: 0,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  salonAssociationSelectorOptionInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center', gap: 9,
  },
  salonAssociationSelectorOptionSide: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salonAssociationSelectorOptionActive: {
    backgroundColor: '#EFF6FF',
  },
  salonAssociationSelectorOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'left',
  },
  salonAssociationSelectorOptionTextActive: {
    color: '#1d4ed8',
  },
  quickAccessHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    width: '100%',
    position: 'relative',
  },
  quickAccessCollapseButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D7E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#E8F1FC',
    borderWidth: 1,
    borderColor: '#D6E5F7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DCE6F5',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  quickAccessHeaderTextWrap: {
    width: '100%',
    alignItems: 'center',
  },
  quickAccessTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 3,
    textAlign: 'center',
  },
  quickAccessSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
  },
  quickAccessInput: {
    // Android can remeasure a single-line input shorter after replacing its
    // placeholder with text. Keep the editable area stable during typing.
    ...(Platform.OS === 'android' ? { minHeight: 48, flexShrink: 0, textAlignVertical: 'center' as const } : {}),
    borderWidth: 1,
    borderColor: '#DEE7F2',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    // Restore plain credentials after OTP/biometric input typography.
    // Explicit values also reset attributes on recycled native text inputs.
    fontWeight: '400',
    fontStyle: 'normal',
    letterSpacing: 0,
    color: '#0f172a',
    backgroundColor: '#F7FAFE',
    marginBottom: 8,
    width: '100%',
    textAlign: 'center',
  },
  biometricCredentialMaskInput: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  quickAccessSecureValue: {
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.2,
  },
  androidVisibleQuickAccessInput: {
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    borderColor: 'rgba(100,116,139,0.30)',
    includeFontPadding: false,
  },
  quickAccessInputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94a3b8',
  },
  quickAccessInputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fff7f7',
  },
  quickAccessPasswordLink: {
    minHeight: 34,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: -3,
    marginBottom: 5,
  },
  quickAccessPasswordLinkText: {
    color: '#315ea8',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  quickAccessError: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
  },
  quickAccessSuccess: {
    color: '#15803d',
    fontWeight: '800',
  },
  quickAccessWarning: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
    fontWeight: '700',
  },
  quickAccessOtpBox: {
    width: '100%',
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DCE6F0',
  },
  quickAccessOtpTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  quickAccessOtpText: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  quickAccessOtpActions: {
    gap: 2,
    width: '100%',
    alignItems: 'center',
  },
  quickAccessOtpButton: {
    width: '100%',
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessOtpButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  quickAccessOtpGhostButton: {
    minHeight: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessOtpGhostButtonText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '800',
  },
  quickAccessButton: {
    backgroundColor: '#1B3155',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    width: '100%',
  },
  quickAccessButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  quickAccessButtonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  clientAccessSpinner: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    borderTopColor: '#FFFFFF',
    borderRightColor: 'rgba(255,255,255,0.72)',
    borderBottomColor: 'rgba(255,255,255,0.36)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
  },
  clientAccessSpinnerBlue: {
    borderColor: 'rgba(95,143,246,0.18)',
    borderTopColor: '#2563EB',
    borderRightColor: 'rgba(37,99,235,0.68)',
    borderBottomColor: 'rgba(95,143,246,0.30)',
    borderLeftColor: 'rgba(95,143,246,0.08)',
  },
  clientAccessPrimaryDisabled: { backgroundColor: '#E8EEF6', borderWidth: 1, borderColor: '#DDE6F0' },
  clientAccessPrimaryTextDisabled: { color: '#718198' },
  quickAccessButtonDisabled: {
    opacity: 0.45,
  },
  quickAccessButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  qrQuickAccessButton: {
    marginTop: 12,
    minHeight: 56,
    backgroundColor: '#EEF3FA',
    borderWidth: 1,
    borderColor: '#D9E4F1',
  },
  qrQuickAccessButtonText: {
    color: '#334155',
  },
  quickAccessBiometricButton: {
    width: '100%',
    marginTop: 6,
    marginBottom: 18,
    backgroundColor: '#DCEBFF',
    borderColor: '#B9D4FF',
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 54,
    height: 54,
    paddingVertical: 0,
    paddingHorizontal: 14,
    alignItems: 'stretch',
    justifyContent: 'center',
    shadowColor: '#8DB6FF',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  quickAccessBiometricButtonDisabled: {
    opacity: 1,
    backgroundColor: '#F7FAFE',
    borderColor: '#DFE7F1',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickAccessBiometricButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  quickAccessBiometricIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(95,143,246,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#A9C8FF',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    marginLeft: -10,
  },
  quickAccessBiometricIconBadgeDisabled: {
    backgroundColor: '#E8EDF3',
    borderColor: '#D5DCE6',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickAccessBiometricTextWrap: {
    flexShrink: 1,
    justifyContent: 'center',
    gap: 0,
    alignItems: 'center',
  },
  quickAccessRegisterToggleButton: {
    width: '100%',
    marginTop: 10,
  },
  quickAccessRegisterInline: {
    width: '100%',
    marginTop: 14,
    alignItems: 'center',
  },
  quickAccessInlineDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginBottom: 14,
  },
  quickAccessBiometricButtonText: {
    color: '#163E8F',
    fontSize: 13.5,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  quickAccessBiometricButtonTextDisabled: {
    color: '#7B8798',
  },
  quickAccessBiometricButtonCaption: {
    marginTop: 0,
    color: '#5B7099',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  quickAccessBiometricButtonCaptionDisabled: {
    color: '#98A2B3',
  },
  quickAccessHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
  },
  salonAssociationFormWrap: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    overflow: 'hidden',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 58,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#0f172a',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    textAlign: 'center',
  },
  codeInputFocused: {
    borderColor: '#0F172A',
    backgroundColor: '#ffffff',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  codeInputError: {
    borderWidth: 2,
    borderColor: '#dc2626',
    backgroundColor: '#fff6f6',
    shadowColor: '#dc2626',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  codeErrorText: {
    width: '100%',
    maxWidth: 520,
    marginTop: -4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#b91c1c',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    alignSelf: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonDisabled: {
    opacity: 0.92,
  },
  secondaryButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLinkButton: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 12,
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#2563eb',
    fontWeight: '700',
    textAlign: 'center',
  },
  benefitsSection: {
    marginBottom: 14,
  },
  benefitsColumns: {
    width: '100%',
    flexDirection: 'column',
    gap: 18,
  },
  benefitsColumnsSplit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  benefitsColumn: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 620,
  },
  sectionSubtitleWide: {
    maxWidth: 860,
  },
  sectionHelperText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 620,
  },
  sectionHelperTextWide: {
    maxWidth: 860,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 250,
    backgroundColor: 'rgba(248, 250, 252, 0.82)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.62)',
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  benefitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
    shadowColor: '#020617',
    shadowOpacity: Platform.OS === 'ios' ? 0.18 : 0.12,
    shadowRadius: Platform.OS === 'ios' ? 10 : 6,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  benefitCopy: { flex: 1, minWidth: 0 },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'left',
  },
  benefitText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'left',
  },
  reassuranceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 30,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  reassuranceColumns: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 18,
  },
  reassuranceColumnsSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 20,
  },
  reassuranceColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reassuranceDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  reassuranceTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  reassuranceText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#cbd5e1',
    textAlign: 'center',
    maxWidth: 720,
  },
  reassuranceTextWide: {
    maxWidth: 920,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 0,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  footerDialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 22, paddingBottom: 0 },
  footerDialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  footerDialogTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  footerDialogBody: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  footerDialogTextLink: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  footerDialogTextLinkLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: '#2563eb',
    textAlign: 'center',
  },
  footerDialogButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDialogButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
});
import { useSalonInstallRecovery } from '../src/lib/use-salon-install-recovery';

const styles = baseStyles;
