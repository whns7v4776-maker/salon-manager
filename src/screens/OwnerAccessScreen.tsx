import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { AccessBackdrop, AccessGlassReflection, AccessWordmark, accessPremiumStyles, useAccessAppearance } from '../../components/access-premium';
import { EmailOtpModal, OtpVerifiedActionHalo } from '../../components/email-otp-modal';
import {
  PasswordMatchRequirement,
  PasswordRequirements,
} from '../../components/password-requirements';
import {
  BIOMETRIC_CREDENTIAL_MASK,
  PasswordTextInput,
} from '../../components/ui/password-text-input';
import { useAppContext } from '../context/AppContext';
import { withAndroidStyleSafety } from '../lib/android-style-safety';
import {
  buildPersonNameValidationError,
  formatCustomerNamePart,
  formatLeadingCapitalizedValue,
  isValidPersonNamePart,
} from '../lib/customer-name';
import {
  buildEmailOtpRequestErrorMessage,
  formatEmailOtpCountdown,
  parseEmailOtpExpiresAt,
  requestEmailOtp,
  verifyEmailOtp,
} from '../lib/email-verification';
import { useKeyboardAwareScroll } from '../lib/form-navigation';
import { tApp } from '../lib/i18n';
import {
  buildOwnerRegistrationDuplicateMessage,
  findOwnerRegistrationDuplicate,
} from '../lib/owner-registration-duplicates';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../lib/validators';
import { validateStrongPassword } from '../lib/password-policy';

const sanitizeOwnerLoginUiMessage = (
  rawError: unknown,
  fallback: string
) => {
  const rawMessage =
    typeof rawError === 'string'
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : rawError && typeof rawError === 'object'
          ? ((rawError as { message?: string | null }).message ?? JSON.stringify(rawError))
          : '';
  const normalized = rawMessage.trim();
  const lowered = normalized.toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (
    lowered.includes('invalid login credentials') ||
    lowered.includes('invalid email or password') ||
    lowered.includes('email or password') ||
    lowered.includes('invalid credentials') ||
    lowered === 'invalid login'
  ) {
    return 'Credenziali errate. Controlla mail e password e riprova.';
  }

  if (
    lowered.includes('"status":504') ||
    lowered.includes('"status": 504') ||
    lowered.includes('gateway timeout') ||
    (lowered.includes('/auth/v1/token') && lowered.includes('504'))
  ) {
    return 'Server di accesso momentaneamente lento. Riprova subito tra qualche secondo.';
  }

  if (
    lowered.includes('network request failed') ||
    lowered.includes('failed to fetch') ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed')
  ) {
    return 'Connessione instabile durante l’accesso. Riprova subito.';
  }

  return normalized;
};

const REGISTRATION_CATEGORY_PRESETS = [
  'Barber',
  'Hair Stylist',
  'Colorista',
  'Nails',
  'Estetica',
  'Skincare',
  'Epilazione',
  'Brows',
  'Lashes',
  'Make-up',
  'Massaggi',
  'Spa',
  'Tattoo',
  'Piercing',
  'PMU',
  'Tricologia',
  'Wellness',
];

const OWNER_BIOMETRIC_ENABLED_STORAGE_KEY = 'salon_manager_biometric_enabled';
const OWNER_BIOMETRIC_LOGIN_EMAIL_STORAGE_KEY = 'salon_manager_biometric_login_email';
const normalizeOwnerAccountEmail = (value?: string | null) =>
  String(value ?? '').trim().toLowerCase();
const buildOwnerScopedStorageKey = (baseKey: string, accountEmail: string) =>
  `${baseKey}__${normalizeOwnerAccountEmail(accountEmail)}`;
const forceLeadingUppercase = (value: string) => {
  return formatLeadingCapitalizedValue(value);
};

function PremiumLoginLoader({ tone = 'light' }: { tone?: 'light' | 'blue' }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
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
    <Animated.View
      style={[
        styles.premiumLoginLoaderRing,
        tone === 'blue' && styles.premiumLoginLoaderRingBlue,
        { transform: [{ rotate }] },
      ]}
    />
  );
}

export function OwnerAccessScreen({
  onAuthenticated,
  onBack,
  embedded = false,
  externalScrollRef,
  onPresentationModeChange,
  onChooseClient,
}: {
  onAuthenticated?: () => void;
  onBack?: () => void;
  embedded?: boolean;
  externalScrollRef?: React.RefObject<ScrollView | null>;
  onPresentationModeChange?: (mode: 'login' | 'register') => void;
  onChooseClient?: () => void;
} = {}) {
  const { palette } = useAccessAppearance();
  const styles = useMemo(() => accessPremiumStyles(baseStyles, palette), [palette]);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const {
    appLanguage,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    loginOwnerAccount,
    registerOwnerAccount,
    requestOwnerPasswordReset,
    ownerPasswordRecoveryActive,
    completeOwnerPasswordRecovery,
    biometricEnabled,
    biometricAvailable,
    unlockOwnerAccountWithBiometric,
    beginOwnerEntryTransition,
    ownerMobileSessionConflictMessage,
    clearOwnerMobileSessionConflictMessage,
  } = useAppContext();

  const scrollRef = useRef<ScrollView | null>(null);
  const registerSectionY = useRef(0);
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
  const resetEmailRef = useRef<TextInput | null>(null);
  const registerFirstNameRef = useRef<TextInput | null>(null);
  const registerLastNameRef = useRef<TextInput | null>(null);
  const registerSalonNameRef = useRef<TextInput | null>(null);
  const registerBusinessPhoneRef = useRef<TextInput | null>(null);
  const registerStreetLineRef = useRef<TextInput | null>(null);
  const registerCityRef = useRef<TextInput | null>(null);
  const registerPostalCodeRef = useRef<TextInput | null>(null);
  const registerActivityCategoryRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const registerPasswordConfirmRef = useRef<TextInput | null>(null);
  const [activeMode, setActiveMode] = useState<'login' | 'register'>('login');
  useEffect(() => { onPresentationModeChange?.(activeMode); }, [activeMode, onPresentationModeChange]);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [registerFirstName, setRegisterFirstName] = useState('');
  const [registerLastName, setRegisterLastName] = useState('');
  const [registerSalonName, setRegisterSalonName] = useState('');
  const [registerBusinessPhone, setRegisterBusinessPhone] = useState('');
  const [registerStreetLine, setRegisterStreetLine] = useState('');
  const [registerCity, setRegisterCity] = useState('');
  const [registerPostalCode, setRegisterPostalCode] = useState('');
  const [registerSelectedCategories, setRegisterSelectedCategories] = useState<string[]>([]);
  const [registerCustomCategoryInput, setRegisterCustomCategoryInput] = useState('');
  const [registerCustomCategoryOpen, setRegisterCustomCategoryOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerPasswordFocused, setRegisterPasswordFocused] = useState(false);
  const [registerEmailOtpSentTo, setRegisterEmailOtpSentTo] = useState('');
  const [registerEmailOtpChallengeVersion, setRegisterEmailOtpChallengeVersion] = useState(0);
  const [registerEmailOtpVerifiedFor, setRegisterEmailOtpVerifiedFor] = useState('');
  const [registerEmailOtpVerifiedAt, setRegisterEmailOtpVerifiedAt] = useState(0);
  const [registerEmailOtpExpiresAt, setRegisterEmailOtpExpiresAt] = useState(0);
  const [registerEmailOtpNow, setRegisterEmailOtpNow] = useState(Date.now());
  const [registerEmailOtpBusy, setRegisterEmailOtpBusy] = useState(false);
  const [registerEmailOtpError, setRegisterEmailOtpError] = useState('');
  const [registerEmailOtpModalVisible, setRegisterEmailOtpModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [loadingAction, setLoadingAction] = useState<'login' | 'register' | 'reset' | null>(null);
  const [ownerEntryLoadingSource, setOwnerEntryLoadingSource] = useState<
    'login' | 'biometric' | null
  >(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [savedOwnerBiometricEnabled, setSavedOwnerBiometricEnabled] = useState(false);
  const [savedOwnerBiometricEmail, setSavedOwnerBiometricEmail] = useState('');
  const [loginFeedback, setLoginFeedback] = useState('');
  const [recoveryFeedback, setRecoveryFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pendingOwnerEntryCompletion, setPendingOwnerEntryCompletion] = useState(false);
  const registerEmailOtpIsVerified =
    registerEmailOtpVerifiedFor === normalizeOwnerAccountEmail(registerEmail);
  const registerEmailOtpExpired =
    !registerEmailOtpIsVerified &&
    registerEmailOtpExpiresAt > 0 &&
    registerEmailOtpNow >= registerEmailOtpExpiresAt;
  const registerEmailOtpCountdown = registerEmailOtpExpiresAt
    ? formatEmailOtpCountdown(registerEmailOtpExpiresAt, registerEmailOtpNow)
    : '';
  const ownerBackofficeNavigationStartedRef = useRef(false);
  const biometricAttemptInFlightRef = useRef(false);
  const ownerEntryObservedAuthenticatedRef = useRef(false);
  const registerEmailOtpRequestInFlightRef = useRef(false);

  const resetOwnerEntryVisualState = React.useCallback(() => {
    biometricAttemptInFlightRef.current = false;
    ownerEntryObservedAuthenticatedRef.current = false;
    setPendingOwnerEntryCompletion(false);
    setBiometricLoading(false);
    setOwnerEntryLoadingSource(null);
  }, []);

  const [formErrors, setFormErrors] = useState<{
    loginEmail?: string;
    resetEmail?: string;
    registerFirstName?: string;
    registerLastName?: string;
    registerEmail?: string;
    registerBusinessPhone?: string;
    registerPassword?: string;
    registerPasswordConfirm?: string;
  }>({});
  const activeScrollRef = embedded && externalScrollRef ? externalScrollRef : scrollRef;
  const { focusField, scrollToField } = useKeyboardAwareScroll(activeScrollRef, {
    topOffset: embedded
      ? Platform.OS === 'ios'
        ? 208
        : 180
      : Platform.OS === 'ios'
      ? 220
      : 184,
    focusScrollDelay: Platform.OS === 'ios' ? 64 : 56,
  });
  const registerActivityCategory = useMemo(() => {
    const seen = new Set<string>();
    const combined = [
      ...registerSelectedCategories,
      ...registerCustomCategoryInput
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ].filter((item) => {
      const normalized = item.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    return combined.join(', ');
  }, [registerCustomCategoryInput, registerSelectedCategories]);

  useEffect(() => {
    let cancelled = false;

    if (Platform.OS === 'web') {
      setSavedOwnerBiometricEnabled(false);
      setSavedOwnerBiometricEmail('');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const savedBiometricEmail = normalizeOwnerAccountEmail(
          await AsyncStorage.getItem(OWNER_BIOMETRIC_LOGIN_EMAIL_STORAGE_KEY)
        );

        if (!savedBiometricEmail) {
          if (!cancelled) {
            setSavedOwnerBiometricEnabled(false);
            setSavedOwnerBiometricEmail('');
          }
          return;
        }

        const savedEnabled = await AsyncStorage.getItem(
          buildOwnerScopedStorageKey(
            OWNER_BIOMETRIC_ENABLED_STORAGE_KEY,
            savedBiometricEmail
          )
        );

        if (!cancelled) {
          setSavedOwnerBiometricEnabled(savedEnabled === 'true');
          setSavedOwnerBiometricEmail(savedBiometricEmail);
        }
      } catch (error) {
        if (!cancelled) {
          setSavedOwnerBiometricEnabled(false);
          setSavedOwnerBiometricEmail('');
        }
        console.log('Errore lettura biometria owner salvata:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [biometricEnabled, isAuthenticated]);

  useEffect(() => {
    if (!ownerMobileSessionConflictMessage) {
      return;
    }

    resetOwnerEntryVisualState();
    setLoginFeedback(ownerMobileSessionConflictMessage);
    const isOtherDeviceConflict = /già (?:aperto|attivo).*altr[ao] app mobile/i.test(
      ownerMobileSessionConflictMessage
    );
    Alert.alert(
      isOtherDeviceConflict
        ? 'Accesso mobile già attivo'
        : 'Verifica accesso non riuscita',
      ownerMobileSessionConflictMessage,
      [
        {
          text: 'OK',
          onPress: clearOwnerMobileSessionConflictMessage,
        },
      ]
    );
  }, [
    clearOwnerMobileSessionConflictMessage,
    ownerMobileSessionConflictMessage,
    resetOwnerEntryVisualState,
  ]);

  useEffect(() => {
    if (!registerEmailOtpExpiresAt || registerEmailOtpIsVerified) {
      return;
    }

    setRegisterEmailOtpNow(Date.now());
    const interval = setInterval(() => setRegisterEmailOtpNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [registerEmailOtpExpiresAt, registerEmailOtpIsVerified]);

  useEffect(() => {
    if (!showReset) {
      return;
    }

    if (!resetEmail.trim() && loginEmail.trim()) {
      setResetEmail(loginEmail.trim());
    }
  }, [showReset, resetEmail, loginEmail]);

  const handleOwnerBack = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.replace('/');
  }, [onBack, router]);

  const swipeBackResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          gestureState.dx > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx > 78 && gestureState.vx >= 0) {
            handleOwnerBack();
          }
        },
      }),
    [handleOwnerBack]
  );

  const handleBiometricLogin = async () => {
    if (
      biometricAttemptInFlightRef.current ||
      biometricLoading ||
      loadingAction !== null ||
      pendingOwnerEntryCompletion ||
      (isAuthenticated && (ownerInitialDataHydrating || !ownerServerSyncReady))
    ) {
      return;
    }
    biometricAttemptInFlightRef.current = true;
    setOwnerEntryLoadingSource('biometric');
    setBiometricLoading(true);
    if (Platform.OS === 'ios') {
      setPendingOwnerEntryCompletion(true);
    }
    try {
      const result = await unlockOwnerAccountWithBiometric();
      if (!result.ok) {
        resetOwnerEntryVisualState();
        if (result.error) {
          Alert.alert('Accesso biometrico', result.error);
        }
        return;
      }

      setPendingOwnerEntryCompletion(true);
    } catch (error) {
      resetOwnerEntryVisualState();
      Alert.alert(
        'Accesso biometrico',
        sanitizeOwnerLoginUiMessage(
          error,
          'Non sono riuscito a completare l’accesso con Face ID. Riprova.',
        ),
      );
    }
  };

  const canSubmitLogin = useMemo(
    () => loginEmail.trim() !== '' && loginPassword.trim() !== '',
    [loginEmail, loginPassword]
  );
  const effectiveOwnerBiometricEnabled = biometricEnabled || savedOwnerBiometricEnabled;
  // Su iOS la verifica hardware parte in modo asincrono al mount. Se Face ID
  // era gia stato abilitato per l'account, il primo tap deve poter completare
  // quella verifica al volo invece di cadere su un bottone temporaneamente
  // disabilitato.
  const canAttemptOwnerBiometric =
    effectiveOwnerBiometricEnabled &&
    (biometricAvailable || Platform.OS === 'ios');
  const isOwnerBiometricUnavailable = !canAttemptOwnerBiometric;
  const canClearLogin = useMemo(
    () => loginEmail.trim() !== '' || loginPassword.trim() !== '',
    [loginEmail, loginPassword]
  );
  const isFinalizingOwnerEntry =
    pendingOwnerEntryCompletion ||
    (isAuthenticated && (ownerInitialDataHydrating || !ownerServerSyncReady));
  const isLoginButtonLoading =
    loadingAction === 'login' ||
    (isFinalizingOwnerEntry && ownerEntryLoadingSource !== 'biometric');
  const isBiometricButtonLoading =
    biometricLoading ||
    (isFinalizingOwnerEntry && ownerEntryLoadingSource === 'biometric');
  const canSubmitRegister = useMemo(
    () =>
      registerFirstName.trim() !== '' &&
      registerLastName.trim() !== '' &&
      registerSalonName.trim() !== '' &&
      registerBusinessPhone.trim() !== '' &&
      registerStreetLine.trim() !== '' &&
      registerCity.trim() !== '' &&
      registerPostalCode.trim() !== '' &&
      registerActivityCategory.trim() !== '' &&
      registerEmail.trim() !== '' &&
      registerPassword.trim() !== '' &&
      registerPasswordConfirm.trim() !== '' &&
      registerPassword === registerPasswordConfirm &&
      validateStrongPassword(registerPassword).valid,
    [
      registerActivityCategory,
      registerBusinessPhone,
      registerCity,
      registerEmail,
      registerFirstName,
      registerLastName,
      registerPassword,
      registerPasswordConfirm,
      registerPostalCode,
      registerSalonName,
      registerStreetLine,
    ]
  );
  const registerCtaReady = registerEmailOtpIsVerified && canSubmitRegister;
  const canClearRegister = useMemo(
    () =>
      registerFirstName.trim() !== '' ||
      registerLastName.trim() !== '' ||
      registerSalonName.trim() !== '' ||
      registerBusinessPhone.trim() !== '' ||
      registerStreetLine.trim() !== '' ||
      registerCity.trim() !== '' ||
      registerPostalCode.trim() !== '' ||
      registerSelectedCategories.length > 0 ||
      registerCustomCategoryInput.trim() !== '' ||
      registerEmail.trim() !== '' ||
      registerPassword.trim() !== '',
    [
      registerBusinessPhone,
      registerCity,
      registerCustomCategoryInput,
      registerEmail,
      registerFirstName,
      registerLastName,
      registerPassword,
      registerPostalCode,
      registerSalonName,
      registerSelectedCategories.length,
      registerStreetLine,
    ]
  );
  const effectiveResetEmail = useMemo(
    () => resetEmail.trim() || loginEmail.trim(),
    [loginEmail, resetEmail]
  );
  const canSubmitReset = useMemo(() => effectiveResetEmail !== '', [effectiveResetEmail]);
  const canSubmitRecovery = useMemo(
    () =>
      validateStrongPassword(recoveryPassword.trim()).valid &&
      recoveryPassword === recoveryPasswordConfirm,
    [recoveryPassword, recoveryPasswordConfirm]
  );
  const isCompactWidth = width < 390;
  const ownerRegistrationAllowed = true;
  const loginModeLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_mode_login');
  const registerModeLabel = 'Crea salone';
  const loginTitleLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_login_title');
  const loginButtonLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_login_button');
  const registerTitleLabel = isCompactWidth ? 'Crea salone' : 'Crea il tuo salone';
  const registerButtonLabel = 'Crea salone';
  const biometricCtaTitle =
    Platform.OS === 'ios'
      ? isCompactWidth
        ? 'Face ID'
        : 'Accedi con Face ID'
      : 'Entra con impronta';
  const biometricCtaCaption =
    savedOwnerBiometricEmail ||
    (Platform.OS === 'ios' && isCompactWidth
      ? 'Accesso rapido sicuro'
      : 'Accesso rapido e sicuro');
  const isOwnerBiometricVisualLogin = isBiometricButtonLoading && activeMode === 'login';
  const ownerFieldLabels = appLanguage === 'it'
    ? {
        email: 'Email (obbligatoria)',
        password: 'Password (obbligatoria)',
        firstName: 'Nome (obbligatorio)',
        lastName: 'Cognome (obbligatorio)',
        salonName: 'Nome salone (obbligatorio)',
        businessPhone: 'Cellulare aziendale (obbligatorio)',
        streetLine: 'Via e civico (obbligatori)',
        city: 'Città (obbligatoria)',
        postalCode: 'CAP (obbligatorio)',
        passwordConfirm: 'Conferma password (obbligatoria)',
        customCategory: 'Nuova categoria (facoltativa)',
      }
    : {
        email: tApp(appLanguage, 'auth_email_placeholder'),
        password: tApp(appLanguage, 'auth_password_placeholder'),
        firstName: tApp(appLanguage, 'auth_first_name_placeholder'),
        lastName: tApp(appLanguage, 'auth_last_name_placeholder'),
        salonName: tApp(appLanguage, 'auth_salon_name_placeholder'),
        businessPhone: tApp(appLanguage, 'auth_business_phone_placeholder'),
        streetLine: 'Via e n. civico',
        city: 'Città',
        postalCode: 'CAP',
        passwordConfirm: 'Conferma password',
        customCategory: 'Aggiungi una o più categorie personalizzate',
      };
  const ownerLoginEmailPlaceholder =
    isOwnerBiometricVisualLogin
      ? BIOMETRIC_CREDENTIAL_MASK
      : ownerFieldLabels.email;
  const ownerLoginPasswordPlaceholder =
    isOwnerBiometricVisualLogin
      ? BIOMETRIC_CREDENTIAL_MASK
      : ownerFieldLabels.password;
  const ownerLoginPlaceholderColor = isOwnerBiometricVisualLogin ? '#475569' : '#98a2b3';
  const ownerLoginEmailDisplayValue = isOwnerBiometricVisualLogin ? '' : loginEmail;
  const ownerLoginPasswordDisplayValue = isOwnerBiometricVisualLogin ? '' : loginPassword;
  const registerSectionTopOffset = Math.max(
    Platform.OS === 'ios' ? Math.round(height * 0.18) : Math.round(height * 0.14),
    Platform.OS === 'ios' ? 132 : 104
  );
  const registerEmailTopOffset = Platform.OS === 'ios' ? 188 : 156;
  const registerPasswordTopOffset = Platform.OS === 'ios' ? 212 : 176;

  const navigateToOwnerBackoffice = React.useCallback(() => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.location?.replace === 'function'
    ) {
      // Rimuove anche eventuali marker come ownerLoggedOut=1: dopo un login
      // confermato non devono continuare a forzare la landing disconnessa.
      window.location.replace('/');
      return;
    }

    if (ownerBackofficeNavigationStartedRef.current) {
      return;
    }

    ownerBackofficeNavigationStartedRef.current = true;
    router.replace('/(tabs)');
  }, [
    router,
  ]);

  const completeOwnerEntry = React.useCallback(() => {
    if (onAuthenticated) {
      onAuthenticated();
      return;
    }

    navigateToOwnerBackoffice();
  }, [
    navigateToOwnerBackoffice,
    onAuthenticated,
  ]);

  useEffect(() => {
    if (
      !pendingOwnerEntryCompletion ||
      ownerEntryLoadingSource !== 'biometric'
    ) {
      ownerEntryObservedAuthenticatedRef.current = false;
      return;
    }

    if (isAuthenticated) {
      ownerEntryObservedAuthenticatedRef.current = true;
      return;
    }

    if (
      hasInitializedAuth &&
      ownerEntryObservedAuthenticatedRef.current
    ) {
      resetOwnerEntryVisualState();
    }
  }, [
    hasInitializedAuth,
    isAuthenticated,
    ownerEntryLoadingSource,
    pendingOwnerEntryCompletion,
    resetOwnerEntryVisualState,
  ]);

  useEffect(() => {
    const canCompleteOwnerEntry =
      Platform.OS === 'ios'
        ? pendingOwnerEntryCompletion && hasInitializedAuth && isAuthenticated
        : Platform.OS === 'android'
        ? pendingOwnerEntryCompletion && hasInitializedAuth && isAuthenticated && isLoaded
        : pendingOwnerEntryCompletion &&
          hasInitializedAuth &&
          isAuthenticated &&
          isLoaded &&
          !ownerInitialDataHydrating &&
          ownerServerSyncReady;

    if (!canCompleteOwnerEntry) {
      return;
    }

    let cancelled = false;
    const completionDelayMs = embedded ? 120 : 0;

    const finalizeEntry = () => {
      if (cancelled) {
        return;
      }

      // Nell'ingresso owner iOS questa schermata viene smontata dal replace.
      // Azzerare prima il caricamento rendeva visibile la Home pubblica per un
      // frame tra il bridge "Stiamo preparando il salone" e il back office.
      if (Platform.OS === 'ios') {
        beginOwnerEntryTransition();
        completeOwnerEntry();
        return;
      }

      resetOwnerEntryVisualState();
      completeOwnerEntry();
    };

    const timeoutId = setTimeout(finalizeEntry, completionDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    embedded,
    beginOwnerEntryTransition,
    completeOwnerEntry,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    onAuthenticated,
    pendingOwnerEntryCompletion,
    resetOwnerEntryVisualState,
  ]);

  const scrollToRegisterSection = React.useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(registerSectionY.current - registerSectionTopOffset, 0),
        animated: true,
      });
    });
  }, [registerSectionTopOffset]);

  const openRegisterCard = () => {
    if (!ownerRegistrationAllowed) {
      return;
    }

    setShowRegister(true);
    setShowReset(false);
    setActiveMode('register');
  };

  useEffect(() => {
    if (ownerRegistrationAllowed || activeMode !== 'register') {
      return;
    }

    setActiveMode('login');
    setShowRegister(false);
  }, [activeMode, ownerRegistrationAllowed]);

  useEffect(() => {
    if (!showRegister || ownerPasswordRecoveryActive) {
      return;
    }

    scrollToRegisterSection();
  }, [ownerPasswordRecoveryActive, scrollToRegisterSection, showRegister]);

  const scrollToRegisterCredentials = React.useCallback(() => {
    Keyboard.dismiss();
    requestAnimationFrame(() => {
      scrollToField(registerEmailRef, {
        topOffset: registerEmailTopOffset,
        scrollDelay: 0,
      });
    });
  }, [registerEmailTopOffset, scrollToField]);

  const keepRegisterFieldVisible = React.useCallback(
    (
      inputRef: React.RefObject<TextInput | null>,
      topOffset = embedded ? 116 : 128
    ) => {
      if (Platform.OS !== 'android') {
        scrollToField(inputRef);
        return;
      }

      [56, 160, 300].forEach((scrollDelay) => {
        scrollToField(inputRef, {
          topOffset,
          scrollDelay,
          animated: true,
        });
      });
    },
    [embedded, scrollToField]
  );

  const keepRegisterCredentialVisible = React.useCallback(
    (target: 'email' | 'password') => {
      const targetRef = target === 'password' ? registerPasswordRef : registerEmailRef;
      const targetTopOffset =
        target === 'password' ? registerPasswordTopOffset : registerEmailTopOffset;

      scrollToField(targetRef, {
        topOffset: targetTopOffset,
        scrollDelay: Platform.OS === 'ios' ? 72 : 56,
      });
    },
    [registerEmailTopOffset, registerPasswordTopOffset, scrollToField]
  );

  const revealRegisterCredentials = React.useCallback(
    (target: 'email' | 'password' = 'email') => {
      requestAnimationFrame(() => {
        keepRegisterCredentialVisible(target);
      });
    },
    [keepRegisterCredentialVisible]
  );

  const toggleRegistrationCategory = (option: string) => {
    setRegisterSelectedCategories((current) => {
      const normalizedOption = option.trim().toLowerCase();
      const exists = current.some((item) => item.trim().toLowerCase() === normalizedOption);
      const next = exists
        ? current.filter((item) => item.trim().toLowerCase() !== normalizedOption)
        : [...current, option];

      if (next.length > 0 && !registerCustomCategoryOpen) {
        scrollToRegisterCredentials();
      }

      return next;
    });
  };

  const handleLogin = async () => {
    if (!canSubmitLogin || isFinalizingOwnerEntry) return;

    const submittedEmail = loginEmail;
    const submittedPassword = loginPassword;

    loginEmailRef.current?.blur();
    loginPasswordRef.current?.blur();
    Keyboard.dismiss();

    if (!isValidEmail(submittedEmail)) {
      setFormErrors((current) => ({ ...current, loginEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, loginEmail: undefined }));
    setLoginFeedback('');
    setOwnerEntryLoadingSource('login');
    setLoadingAction('login');
    if (Platform.OS === 'ios') {
      setPendingOwnerEntryCompletion(true);
    }

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const result = await loginOwnerAccount(submittedEmail, submittedPassword);

      if (!result.ok) {
        resetOwnerEntryVisualState();
        setLoginPassword(submittedPassword);
        const nextError = sanitizeOwnerLoginUiMessage(
          result.error,
          tApp(appLanguage, 'auth_login_failed_body')
        );
        setLoginFeedback(nextError);
        Alert.alert(
          tApp(appLanguage, 'auth_login_failed_title'),
          nextError
        );
        return;
      }

      if (Platform.OS === 'web') {
        // loginOwnerAccount ritorna ok solo dopo aver verificato sessione e
        // workspace. Sul web possiamo quindi uscire subito dalla landing,
        // senza dipendere da un ulteriore render dello stato di sincronismo.
        completeOwnerEntry();
        return;
      }

      setPendingOwnerEntryCompletion(true);
    } catch (error) {
      resetOwnerEntryVisualState();
      setLoginPassword(submittedPassword);
      const fallbackError = sanitizeOwnerLoginUiMessage(
        error,
        tApp(appLanguage, 'auth_login_failed_body')
      );
      setLoginFeedback(fallbackError);
      Alert.alert(tApp(appLanguage, 'auth_login_failed_title'), fallbackError);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClearLoginFields = React.useCallback(() => {
    setLoginEmail('');
    setLoginPassword('');
    setLoginFeedback('');
    setFormErrors((current) => ({
      ...current,
      loginEmail: undefined,
    }));
  }, []);

  const handleClearRegisterFields = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setRegisterFirstName('');
    setRegisterLastName('');
    setRegisterSalonName('');
    setRegisterBusinessPhone('');
    setRegisterStreetLine('');
    setRegisterCity('');
    setRegisterPostalCode('');
    setRegisterSelectedCategories([]);
    setRegisterCustomCategoryInput('');
    setRegisterCustomCategoryOpen(false);
    setRegisterEmail('');
    setRegisterEmailOtpSentTo('');
    setRegisterEmailOtpVerifiedFor('');
    setRegisterEmailOtpVerifiedAt(0);
    setRegisterEmailOtpExpiresAt(0);
    setRegisterEmailOtpError('');
    setRegisterPassword('');
    setRegisterPasswordConfirm('');
    setFormErrors((current) => ({
      ...current,
      registerEmail: undefined,
      registerBusinessPhone: undefined,
      registerPassword: undefined,
      registerPasswordConfirm: undefined,
    }));
  }, []);

  const requestRegisterEmailOtp = React.useCallback(
    async (
      targetEmail?: string,
      options?: { announceResult?: boolean },
    ) => {
      const email = normalizeOwnerAccountEmail(targetEmail ?? registerEmail);
      if (!isValidEmail(email)) {
        const message = 'Inserisci una mail valida prima di richiedere il codice.';
        setRegisterEmailOtpError(message);
        if (options?.announceResult) {
          Alert.alert('Email non valida', message);
        }
        return false;
      }

      if (registerEmailOtpRequestInFlightRef.current) {
        return false;
      }

      registerEmailOtpRequestInFlightRef.current = true;
      setRegisterEmailOtpBusy(true);
      setRegisterEmailOtpError('');
      let result: Awaited<ReturnType<typeof requestEmailOtp>>;
      try {
        result = await requestEmailOtp({ email, purpose: 'owner_registration' });
      } finally {
        registerEmailOtpRequestInFlightRef.current = false;
        setRegisterEmailOtpBusy(false);
      }

      if (!result.ok) {
        const message = buildEmailOtpRequestErrorMessage({
          error: result.error,
          providerReason: result.providerReason,
          retryAfterSeconds: result.retryAfterSeconds,
        });
        setRegisterEmailOtpError(message);

        const existingChallengeIsUsable =
          result.error === 'rate_limited' &&
          registerEmailOtpSentTo === email &&
          registerEmailOtpExpiresAt > Date.now();
        if (existingChallengeIsUsable) {
          setRegisterEmailOtpNow(Date.now());
          setRegisterEmailOtpModalVisible(true);
        }
        if (options?.announceResult || !existingChallengeIsUsable) {
          Alert.alert(
            existingChallengeIsUsable ? 'Codice già inviato' : 'Invio OTP non riuscito',
            message,
          );
        }
        return false;
      }

      setRegisterEmailOtpSentTo(email);
      setRegisterEmailOtpExpiresAt(parseEmailOtpExpiresAt(result.expiresAt));
      setRegisterEmailOtpNow(Date.now());
      setRegisterEmailOtpChallengeVersion((current) => current + 1);
      setRegisterEmailOtpError('Codice inviato via email. Inseriscilo qui per continuare.');
      setRegisterEmailOtpModalVisible(true);
      if (options?.announceResult) {
        Alert.alert(
          'Nuovo codice inviato',
          `Abbiamo inviato un nuovo OTP a ${email}. Controlla anche Spam o Posta indesiderata.`,
        );
      }
      return true;
    },
    [registerEmail, registerEmailOtpExpiresAt, registerEmailOtpSentTo]
  );

  const verifyRegisterEmailOtp = React.useCallback(async (submittedCode: string) => {
    const email = normalizeOwnerAccountEmail(registerEmailOtpSentTo || registerEmail);
    const code = submittedCode.replace(/\D+/g, '');
    if (!isValidEmail(email) || code.length !== 6) {
      setRegisterEmailOtpError('Inserisci il codice a 6 cifre ricevuto via email.');
      return false;
    }
    if (registerEmailOtpExpired) {
      setRegisterEmailOtpError('Codice scaduto. Richiedine uno nuovo.');
      return false;
    }

    setRegisterEmailOtpBusy(true);
    setRegisterEmailOtpError('');
    let result: Awaited<ReturnType<typeof verifyEmailOtp>>;
    try {
      result = await verifyEmailOtp({
        email,
        purpose: 'owner_registration',
        code,
      });
    } finally {
      setRegisterEmailOtpBusy(false);
    }

    if (!result.ok) {
      setRegisterEmailOtpError(
        result.error === 'code_expired'
          ? 'Codice scaduto. Richiedine uno nuovo.'
          : result.error === 'too_many_attempts'
            ? 'Troppi tentativi. Richiedi un nuovo codice.'
            : result.error === 'request_timeout'
              ? 'Verifica troppo lenta. Controlla la rete e riprova: il codice resta valido.'
              : result.error === 'network_error'
                ? 'Connessione interrotta. Controlla la rete e riprova.'
            : 'Codice non corretto.'
      );
      return false;
    }

    setRegisterEmailOtpVerifiedFor(email);
    setRegisterEmailOtpVerifiedAt(Date.now());
    setRegisterEmailOtpExpiresAt(0);
    setRegisterEmailOtpError('Email verificata. Completa ora la registrazione.');
    setRegisterEmailOtpModalVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    return true;
  }, [registerEmail, registerEmailOtpExpired, registerEmailOtpSentTo]);

  const handleRegister = async () => {
    if (!canSubmitRegister) return;

    const submittedRegisterPassword = registerPassword;
    const submittedRegisterPasswordConfirm = registerPasswordConfirm;

    registerEmailRef.current?.blur();
    registerPasswordRef.current?.blur();
    registerPasswordConfirmRef.current?.blur();
    Keyboard.dismiss();

    const createdEmail = normalizeOwnerAccountEmail(registerEmail);

    const invalidFields: string[] = [];
    const nextErrors: {
      registerFirstName?: string;
      registerLastName?: string;
      registerEmail?: string;
      registerBusinessPhone?: string;
      registerPassword?: string;
      registerPasswordConfirm?: string;
    } = {};

    const normalizedRegisterFirstName = formatCustomerNamePart(registerFirstName);
    const normalizedRegisterLastName = formatCustomerNamePart(registerLastName);

    if (!isValidPersonNamePart(registerFirstName)) {
      const error = buildPersonNameValidationError('Nome');
      invalidFields.push(error);
      nextErrors.registerFirstName = error;
    }

    if (!isValidPersonNamePart(registerLastName)) {
      const error = buildPersonNameValidationError('Cognome');
      invalidFields.push(error);
      nextErrors.registerLastName = error;
    }

    if (!isValidPhone10(registerBusinessPhone)) {
      invalidFields.push('Numero di telefono errato (deve avere 9 o 10 cifre)');
      nextErrors.registerBusinessPhone = 'Numero di telefono errato (deve avere 9 o 10 cifre)';
    }

    if (!isValidEmail(registerEmail)) {
      invalidFields.push('Email non valida');
      nextErrors.registerEmail = 'Email non valida';
    }

    const passwordPolicy = validateStrongPassword(submittedRegisterPassword);
    if (!passwordPolicy.valid) {
      invalidFields.push(passwordPolicy.message);
      nextErrors.registerPassword = passwordPolicy.message;
    }

    if (submittedRegisterPassword !== submittedRegisterPasswordConfirm) {
      invalidFields.push('Le password non coincidono');
      nextErrors.registerPasswordConfirm = 'Le password non coincidono';
    }

    if (invalidFields.length > 0) {
      setFormErrors((current) => ({ ...current, ...nextErrors }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    try {
      const ownerDuplicate = await findOwnerRegistrationDuplicate({
        email: createdEmail,
        businessPhone: registerBusinessPhone,
      });

      if (ownerDuplicate?.emailTaken) {
        const duplicateMessage = buildOwnerRegistrationDuplicateMessage(ownerDuplicate);
        setFormErrors((current) => ({
          ...current,
          registerEmail: ownerDuplicate.emailTaken ? 'Mail gia collegata a un account salone.' : undefined,
          registerBusinessPhone: ownerDuplicate.phoneTaken
            ? 'Cellulare aziendale gia collegato a un account salone.'
            : undefined,
        }));
        setRegisterEmailOtpError(duplicateMessage);
        Alert.alert('Account salone gia registrato', duplicateMessage);
        return;
      }
    } catch (duplicateCheckError) {
      console.log('Errore controllo duplicato registrazione salone:', duplicateCheckError);
    }

    const otpVerificationExpired =
      registerEmailOtpVerifiedFor === createdEmail &&
      registerEmailOtpVerifiedAt > 0 &&
      Date.now() - registerEmailOtpVerifiedAt > 15 * 60_000;

    if (otpVerificationExpired) {
      setRegisterEmailOtpVerifiedFor('');
      setRegisterEmailOtpVerifiedAt(0);
      setRegisterEmailOtpError('Verifica email scaduta. Richiedi un nuovo codice OTP.');
      return;
    }

    if (registerEmailOtpVerifiedFor !== createdEmail) {
      const sent = await requestRegisterEmailOtp(createdEmail);
      if (sent) {
        Alert.alert(
          'Verifica email',
          `Ti ho inviato un codice a 6 cifre su ${createdEmail}. Inseriscilo per completare la registrazione.`
        );
      }
      return;
    }

    setFormErrors((current) => ({
      ...current,
      registerFirstName: undefined,
      registerLastName: undefined,
      registerEmail: undefined,
      registerBusinessPhone: undefined,
    }));

    setLoadingAction('register');
    setRegisterPassword('');
    setRegisterPasswordConfirm('');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const result = await registerOwnerAccount({
      firstName: normalizedRegisterFirstName,
      lastName: normalizedRegisterLastName,
      salonName: registerSalonName,
      businessPhone: registerBusinessPhone,
      streetLine: registerStreetLine,
      city: registerCity,
      postalCode: registerPostalCode,
      activityCategory: registerActivityCategory,
      email: createdEmail,
      password: submittedRegisterPassword,
    });
    setLoadingAction(null);

    if (!result.ok) {
      setRegisterPassword(submittedRegisterPassword);
      setRegisterPasswordConfirm(submittedRegisterPasswordConfirm);
      if ((result.error ?? '').toLowerCase().includes('mail gia registrato')) {
        setFormErrors((current) => ({
          ...current,
          registerEmail: 'Account mail gia registrato. Inserire una nuova mail.',
        }));
      }
      Alert.alert(
        tApp(appLanguage, 'auth_register_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_register_failed_body')
      );
      return;
    }

    setLoginEmail(result.email ?? createdEmail);
    setLoginPassword('');
    setRegisterPassword('');
    setRegisterPasswordConfirm('');
    setRegisterFirstName('');
    setRegisterLastName('');
    setRegisterSalonName('');
    setRegisterBusinessPhone('');
    setRegisterStreetLine('');
    setRegisterCity('');
    setRegisterPostalCode('');
    setRegisterSelectedCategories([]);
    setRegisterCustomCategoryInput('');
    setRegisterCustomCategoryOpen(false);
    // La sessione è già autenticata: usa lo stesso ingresso del login,
    // preservando i gate esistenti di abbonamento, onboarding e permessi.
    setActiveMode('login');
    setShowRegister(false);
    setOwnerEntryLoadingSource('login');
    setPendingOwnerEntryCompletion(true);
  };

  const handleResetPassword = async () => {
    if (!canSubmitReset) return;

    if (!isValidEmail(effectiveResetEmail)) {
      setFormErrors((current) => ({ ...current, resetEmail: 'Email non valida' }));
      setResetFeedback({
        type: 'error',
        message: 'Inserisci una mail valida per ricevere il link di reset.',
      });
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, resetEmail: undefined }));
    setResetFeedback(null);

    setLoadingAction('reset');
    const result = await requestOwnerPasswordReset(effectiveResetEmail);
    setLoadingAction(null);

    if (!result.ok) {
      const errorMessage =
        result.error ?? 'Non sono riuscito a inviare il link di reset. Riprova tra poco.';
      setResetFeedback({
        type: 'error',
        message: errorMessage,
      });
      Alert.alert(
        tApp(appLanguage, 'auth_reset_failed_title'),
        errorMessage
      );
      return;
    }

    const successMessage = result.backendRequired
      ? tApp(appLanguage, 'auth_reset_ready_backend')
      : tApp(appLanguage, 'auth_reset_ready_email');
    setResetFeedback({
      type: 'success',
      message: successMessage,
    });
    Alert.alert(
      tApp(appLanguage, 'auth_reset_ready_title'),
      successMessage
    );
  };

  const handleCompletePasswordRecovery = async () => {
    if (!canSubmitRecovery) {
      const passwordPolicy = validateStrongPassword(recoveryPassword.trim());
      Alert.alert(
        'Nuova password non valida',
        recoveryPassword !== recoveryPasswordConfirm
          ? 'Le due password non coincidono.'
          : passwordPolicy.message
      );
      return;
    }

    setLoadingAction('reset');
    const result = await completeOwnerPasswordRecovery(recoveryPassword);
    setLoadingAction(null);

    if (!result.ok) {
      const errorMessage = result.error ?? 'Aggiornamento password non riuscito.';
      setRecoveryFeedback({
        type: 'error',
        message: errorMessage,
      });
      Alert.alert('Recupero password', errorMessage);
      return;
    }

    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setLoginPassword('');
    const successMessage =
      'La nuova password è stata salvata correttamente. Ora puoi accedere con la nuova password.';
    setRecoveryFeedback({
      type: 'success',
      message: successMessage,
    });
    requestAnimationFrame(() => {
      Alert.alert('Password cambiata con successo', successMessage);
    });
  };

  const useEmbeddedStaticLayout = embedded && Platform.OS === 'web';
  const content = (
    <>
      {!embedded ? (
        <View style={styles.heroCard}>
          <TouchableOpacity
            style={styles.heroBackButton}
            onPress={handleOwnerBack}
            activeOpacity={0.88}
          >
            <Ionicons name="chevron-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroChip}>
              <Text allowFontScaling={false} style={styles.heroChipText}>
                {tApp(appLanguage, 'auth_badge')}
              </Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroBrandWrap}>
              <View style={styles.heroBrandScaleWrap}>
                <AccessWordmark />
              </View>
            </View>
            <Text allowFontScaling={false} style={styles.heroSubtitle}>
              Accedi al back office per gestire agenda, prenotazioni, clienti, cassa e servizi.
            </Text>
          </View>

          <View style={styles.heroHighlights}>
            <View style={[styles.heroHighlightPill, styles.heroHighlightPillBlue]}>
              <Text
                allowFontScaling={false}
                style={[styles.heroHighlightText, styles.heroHighlightTextBlue]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {tApp(appLanguage, 'auth_highlight_agenda')}
              </Text>
            </View>
            <View style={[styles.heroHighlightPill, styles.heroHighlightPillMint]}>
              <Text
                allowFontScaling={false}
                style={[styles.heroHighlightText, styles.heroHighlightTextMint]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {tApp(appLanguage, 'auth_highlight_clients')}
              </Text>
            </View>
            <View style={[styles.heroHighlightPill, styles.heroHighlightPillRose]}>
              <Text
                allowFontScaling={false}
                style={[styles.heroHighlightText, styles.heroHighlightTextRose]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {tApp(appLanguage, 'auth_highlight_owner')}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {!ownerPasswordRecoveryActive && ownerRegistrationAllowed && (!embedded || activeMode === 'register') ? (
        <View
          style={[
            styles.modeSwitch,
            embedded && styles.embeddedModeSwitch,
            isCompactWidth && !embedded && styles.modeSwitchCompact,
          ]}
        >
          <TouchableOpacity
            style={[
              styles.modeSwitchButton,
              embedded && styles.embeddedModeSwitchButton,
              isCompactWidth && !embedded && styles.modeSwitchButtonCompact,
              activeMode === 'login' && styles.modeSwitchButtonActive,
            ]}
            onPress={() => {
              setActiveMode('login');
              setShowRegister(false);
            }}
            activeOpacity={0.9}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.modeSwitchButtonText,
                isCompactWidth && styles.modeSwitchButtonTextCompact,
                activeMode === 'login' && styles.modeSwitchButtonTextActive,
              ]}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {loginModeLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeSwitchButton,
              embedded && styles.embeddedModeSwitchButton,
              isCompactWidth && !embedded && styles.modeSwitchButtonCompact,
              activeMode === 'register' && styles.modeSwitchButtonActive,
            ]}
            onPress={openRegisterCard}
            activeOpacity={0.9}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.modeSwitchButtonText,
                isCompactWidth && styles.modeSwitchButtonTextCompact,
                activeMode === 'register' && styles.modeSwitchButtonTextActive,
              ]}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {registerModeLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {activeMode === 'login' ? (
        <View style={[styles.card, embedded && styles.embeddedCard, embedded && isCompactWidth && styles.embeddedCardCompact]}>
          <AccessGlassReflection />
          {embedded && width >= 768 && !ownerPasswordRecoveryActive ? (
            <>
              <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.field, marginBottom: 18 }}>
                <View accessibilityRole="tab" accessibilityState={{ selected: true }} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.action }}>
                  <Text style={{ color: palette.actionText, fontSize: 13 }}>Salone</Text>
                </View>
                <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={onChooseClient} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: palette.ink, fontSize: 13 }}>Cliente</Text>
                </TouchableOpacity>
              </View>
              <Text accessibilityRole="header" style={{ color: palette.ink, fontFamily: 'Georgia', fontSize: 24, lineHeight: 30, textAlign: 'center', marginBottom: 22 }}>Accedi al tuo salone</Text>
            </>
          ) : null}
          {ownerPasswordRecoveryActive ? (
            <>
              <View style={styles.sectionTopRow}>
                <View style={styles.sectionTopText}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.cardTitle, isCompactWidth && styles.cardTitleCompact, embedded && styles.embeddedCardTitle]}
                  >
                    Imposta nuova password
                  </Text>
                  <Text allowFontScaling={false} style={[styles.cardSubtitle, embedded && styles.embeddedCardSubtitle]}>
                    Inserisci la nuova password per completare il recupero account.
                  </Text>
                </View>
              </View>

              <PasswordTextInput
                    visibilityToggleColor={palette.muted}
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                compactHorizontalPadding={Platform.OS === 'android'}
                style={[
                  styles.input,
                  isCompactWidth && styles.inputCompact,
                  embedded && styles.embeddedInput,
                ]}
                placeholder="Nuova password"
                placeholderTextColor={palette.muted}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                value={recoveryPassword}
                onChangeText={(value) => {
                  setRecoveryPassword(value);
                  if (recoveryFeedback) {
                    setRecoveryFeedback(null);
                  }
                }}
                returnKeyType="next"
              />
              <PasswordRequirements
                password={recoveryPassword.trim()}
                compact={Platform.OS === 'android'}
              />

              <PasswordTextInput
                    visibilityToggleColor={palette.muted}
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                compactHorizontalPadding={Platform.OS === 'android'}
                style={[
                  styles.input,
                  isCompactWidth && styles.inputCompact,
                  embedded && styles.embeddedInput,
                ]}
                placeholder="Conferma nuova password"
                placeholderTextColor={palette.muted}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                value={recoveryPasswordConfirm}
                onChangeText={(value) => {
                  setRecoveryPasswordConfirm(value);
                  if (recoveryFeedback) {
                    setRecoveryFeedback(null);
                  }
                }}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <PasswordMatchRequirement
                password={recoveryPassword}
                confirmPassword={recoveryPasswordConfirm}
                compact={Platform.OS === 'android'}
              />
              {recoveryFeedback ? (
                <View
                  style={[
                    styles.resetFeedback,
                    recoveryFeedback.type === 'success'
                      ? styles.resetFeedbackSuccess
                      : styles.resetFeedbackError,
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.resetFeedbackText,
                      recoveryFeedback.type === 'success'
                        ? styles.resetFeedbackTextSuccess
                        : styles.resetFeedbackTextError,
                    ]}
                  >
                    {recoveryFeedback.message}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, embedded && styles.embeddedPrimaryButton, !canSubmitRecovery && styles.primaryButtonDisabled]}
                onPress={handleCompletePasswordRecovery}
                activeOpacity={0.9}
                disabled={!canSubmitRecovery || loadingAction !== null}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.primaryButtonText,
                    isCompactWidth && styles.primaryButtonTextCompact,
                    embedded && styles.embeddedPrimaryButtonText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.84}
                >
                  {loadingAction === 'reset' ? 'Salvataggio…' : 'Salva nuova password'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.sectionTopRow, embedded && ownerRegistrationAllowed && { display: 'none' }]}>
                <View style={styles.sectionTopText}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.cardTitle, isCompactWidth && styles.cardTitleCompact, embedded && styles.embeddedCardTitle]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {loginTitleLabel}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.cardSubtitle, embedded && styles.embeddedCardSubtitle]}>
                    {ownerRegistrationAllowed
                      ? 'Accedi con la mail del titolare e la password del salone.'
                      : 'Accedi con le credenziali del salone. Per creare un nuovo salone, registrati prima dall’app iOS o Android.'}
                  </Text>
                </View>
              </View>

              {Platform.OS !== 'web' ? (
                <TouchableOpacity
                  style={[
                    styles.biometricButton,
                    embedded && styles.embeddedBiometricButton,
                    (!canAttemptOwnerBiometric ||
                      isBiometricButtonLoading ||
                      isFinalizingOwnerEntry) &&
                      styles.primaryButtonDisabled,
                    isOwnerBiometricUnavailable && styles.biometricButtonDisabled,
                  ]}
                  onPress={handleBiometricLogin}
                  activeOpacity={0.9}
                  delayPressIn={0}
                  hitSlop={
                    Platform.OS === 'ios'
                      ? { top: 8, bottom: 8, left: 4, right: 4 }
                      : undefined
                  }
                  disabled={
                    !canAttemptOwnerBiometric ||
                    isBiometricButtonLoading ||
                    loadingAction !== null ||
                    (isFinalizingOwnerEntry && ownerEntryLoadingSource !== 'biometric')
                  }
                >
                  <View
                    style={[
                      styles.biometricIconBadge,
                      isOwnerBiometricUnavailable && styles.biometricIconBadgeDisabled,
                    ]}
                  >
                    {isBiometricButtonLoading ? (
                      <PremiumLoginLoader tone="blue" />
                    ) : Platform.OS === 'ios' ? (
                      <MaterialCommunityIcons
                        name="face-recognition"
                        size={22}
                        color={isOwnerBiometricUnavailable ? palette.muted : palette.ink}
                      />
                    ) : (
                      <Ionicons
                        name="finger-print-outline"
                        size={20}
                        color={isOwnerBiometricUnavailable ? palette.muted : palette.ink}
                      />
                    )}
                  </View>
                  <View style={styles.biometricTextWrap}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.biometricButtonText,
                        isCompactWidth && styles.biometricButtonTextCompact,
                        embedded && styles.embeddedBiometricButtonText,
                        isOwnerBiometricUnavailable && styles.biometricButtonTextDisabled,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      {isBiometricButtonLoading ? 'Verifica in corso…' : biometricCtaTitle}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.biometricButtonCaption,
                        isOwnerBiometricUnavailable && styles.biometricButtonCaptionDisabled,
                      ]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.92}
                    >
                      {!canAttemptOwnerBiometric
                        ? Platform.OS === 'ios'
                          ? 'Configura Face ID nelle impostazioni del dispositivo'
                          : 'Configura l’impronta nelle impostazioni del dispositivo'
                        : effectiveOwnerBiometricEnabled
                          ? biometricCtaCaption
                          : 'Attivalo dalle impostazioni del back office'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {isCompactWidth || embedded ? (
                <Text allowFontScaling={false} style={[styles.inputLabel, embedded && styles.embeddedInputLabel]}>
                  Email
                </Text>
              ) : null}
              <TextInput
                ref={loginEmailRef}
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                style={[
                  styles.input,
                  isCompactWidth && styles.inputCompact,
                  embedded && styles.embeddedInput,
                  formErrors.loginEmail && styles.inputError,
                  isOwnerBiometricVisualLogin
                    ? styles.biometricCredentialMaskInput
                    : styles.ownerCredentialPlainInput,
                  Platform.OS === 'android' &&
                    !isOwnerBiometricVisualLogin &&
                    styles.ownerCredentialPlainInputAndroid,
                  embedded && Platform.OS === 'android' &&
                    !isOwnerBiometricVisualLogin &&
                    styles.embeddedCredentialPlainInputAndroid,
                ]}
                placeholder={ownerLoginEmailPlaceholder}
                accessibilityLabel={ownerFieldLabels.email}
                placeholderTextColor={ownerLoginPlaceholderColor}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                importantForAutofill="yes"
                keyboardType="email-address"
                value={ownerLoginEmailDisplayValue}
                onChangeText={(value) => {
                  if (isOwnerBiometricVisualLogin) return;
                  setLoginEmail(value);
                  if (formErrors.loginEmail) {
                    setFormErrors((current) => ({ ...current, loginEmail: undefined }));
                  }
                }}
                onFocus={() => scrollToField(loginEmailRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(loginPasswordRef)}
                blurOnSubmit={false}
                editable={!isOwnerBiometricVisualLogin && !isLoginButtonLoading}
              />
              {formErrors.loginEmail ? (
                <Text allowFontScaling={false} style={styles.fieldErrorText}>
                  {formErrors.loginEmail}
                </Text>
              ) : null}

              {isCompactWidth || embedded ? (
                <Text allowFontScaling={false} style={[styles.inputLabel, embedded && styles.embeddedInputLabel]}>
                  Password
                </Text>
              ) : null}
              <PasswordTextInput
                    visibilityToggleColor={palette.muted}
                ref={loginPasswordRef}
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                style={[
                  styles.input,
                  isCompactWidth && styles.inputCompact,
                  embedded && styles.embeddedInput,
                  isOwnerBiometricVisualLogin
                    ? styles.biometricCredentialMaskInput
                    : styles.ownerCredentialPlainInput,
                  Platform.OS === 'android' &&
                    !isOwnerBiometricVisualLogin &&
                    styles.ownerCredentialPlainInputAndroid,
                  embedded && Platform.OS === 'android' &&
                    !isOwnerBiometricVisualLogin &&
                    styles.embeddedCredentialPlainInputAndroid,
                ]}
                placeholder={ownerLoginPasswordPlaceholder}
                accessibilityLabel={ownerFieldLabels.password}
                placeholderTextColor={ownerLoginPlaceholderColor}
                autoComplete="current-password"
                textContentType="password"
                importantForAutofill="yes"
                value={ownerLoginPasswordDisplayValue}
                onChangeText={(value) => {
                  if (isOwnerBiometricVisualLogin) return;
                  setLoginPassword(value);
                }}
                onFocus={() => scrollToField(loginPasswordRef)}
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (
                    Platform.OS === 'web' &&
                    canSubmitLogin &&
                    loadingAction === null &&
                    !isFinalizingOwnerEntry
                  ) {
                    void handleLogin();
                  }
                }}
                editable={!isOwnerBiometricVisualLogin && !isLoginButtonLoading}
              />

              {canClearLogin ? (
                <TouchableOpacity
                  style={styles.clearFieldsButton}
                  onPress={handleClearLoginFields}
                  activeOpacity={0.7}
                  disabled={loadingAction !== null}
                >
                  <Text allowFontScaling={false} style={styles.clearFieldsButtonText}>
                    Svuota campi
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  embedded && styles.embeddedPrimaryButton,
                  (!canSubmitLogin || isFinalizingOwnerEntry) && styles.loginPrimaryDisabled,
                ]}
                onPress={handleLogin}
                activeOpacity={0.9}
                disabled={!canSubmitLogin || loadingAction !== null || isFinalizingOwnerEntry}
              >
                {isLoginButtonLoading ? (
                  <View style={styles.primaryButtonLoadingRow}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.primaryButtonText,
                        styles.primaryButtonTextLoading,
                        isCompactWidth && styles.primaryButtonTextCompact,
                        embedded && styles.embeddedPrimaryButtonText,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.84}
                    >
                      {tApp(appLanguage, 'auth_login_loading')}
                    </Text>
                    <View style={styles.primaryButtonSpinnerShell}>
                      <PremiumLoginLoader />
                    </View>
                  </View>
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.primaryButtonText,
                      (!canSubmitLogin || isFinalizingOwnerEntry) && styles.loginPrimaryTextDisabled,
                      isCompactWidth && styles.primaryButtonTextCompact,
                      embedded && styles.embeddedPrimaryButtonText,
                      (!canSubmitLogin || isFinalizingOwnerEntry) && styles.loginPrimaryTextDisabled,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.84}
                  >
                    {loginButtonLabel}
                  </Text>
                )}
              </TouchableOpacity>

              {loginFeedback ? (
                <Text allowFontScaling={false} style={styles.loginFeedbackText}>
                  {loginFeedback}
                </Text>
              ) : null}


              <TouchableOpacity
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true' } } : {})}
                style={[styles.linkButton, embedded && styles.embeddedLinkButton, Platform.OS === 'web' && { width: 'auto', maxWidth: '100%', minHeight: 40, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => {
                  setShowReset((current) => {
                    const next = !current;
                    if (next && !resetEmail.trim() && loginEmail.trim()) {
                      setResetEmail(loginEmail.trim());
                    }
                    return next;
                  });
                }}
                activeOpacity={0.8}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.linkButtonText, embedded && styles.embeddedLinkButtonText, Platform.OS === 'web' && { width: 'auto' }]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {tApp(appLanguage, 'auth_forgot_password')}
                </Text>
              </TouchableOpacity>

              {showReset ? (
                <View style={styles.inlinePanel}>
                  <Text allowFontScaling={false} style={styles.inlinePanelTitle}>
                    {tApp(appLanguage, 'auth_reset_title')}
                  </Text>
                  <Text allowFontScaling={false} style={styles.inlinePanelText}>
                    {tApp(appLanguage, 'auth_reset_subtitle')}
                  </Text>

                  <TextInput
                    ref={resetEmailRef}
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1}
                    style={[
                      styles.input,
                      embedded && styles.embeddedInput,
                      formErrors.resetEmail && styles.inputError,
                    ]}
                    placeholder={tApp(appLanguage, 'auth_reset_email_placeholder')}
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={resetEmail}
                    onChangeText={(value) => {
                      setResetEmail(value);
                      if (resetFeedback) {
                        setResetFeedback(null);
                      }
                      if (formErrors.resetEmail) {
                        setFormErrors((current) => ({ ...current, resetEmail: undefined }));
                      }
                    }}
                    onFocus={() => scrollToField(resetEmailRef)}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {formErrors.resetEmail ? (
                    <Text allowFontScaling={false} style={styles.fieldErrorText}>
                      {formErrors.resetEmail}
                    </Text>
                  ) : null}
                  {resetFeedback ? (
                    <View
                      style={[
                        styles.resetFeedback,
                        resetFeedback.type === 'success'
                          ? styles.resetFeedbackSuccess
                          : styles.resetFeedbackError,
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.resetFeedbackText,
                          resetFeedback.type === 'success'
                            ? styles.resetFeedbackTextSuccess
                            : styles.resetFeedbackTextError,
                        ]}
                      >
                        {resetFeedback.message}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      !canSubmitReset && styles.secondaryButtonDisabled,
                    ]}
                    onPress={handleResetPassword}
                    activeOpacity={0.9}
                    disabled={!canSubmitReset || loadingAction !== null}
                  >
                    <Text
                      allowFontScaling={false}
                      style={styles.secondaryButtonText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.84}
                    >
                      {loadingAction === 'reset'
                        ? tApp(appLanguage, 'auth_reset_loading')
                        : tApp(appLanguage, 'auth_reset_button')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {embedded && ownerRegistrationAllowed ? (
                <View style={{ borderTopWidth: 1, borderTopColor: palette.line, marginTop: 20, paddingTop: 16, alignItems: 'center' }}>
                  <TouchableOpacity accessibilityRole="button" {...(Platform.OS === 'web' ? { dataSet: { premiumTextAction: 'true' } } : {})} onPress={openRegisterCard} activeOpacity={0.8} style={{ minHeight: 44, justifyContent: 'center', ...(Platform.OS === 'web' ? { alignSelf: 'center' as const, paddingHorizontal: 12, borderRadius: 12 } : {}) }}>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>Non hai un account? <Text style={{ color: palette.ink, textDecorationLine: 'underline' }}>Registrati</Text></Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {ownerRegistrationAllowed &&
      !ownerPasswordRecoveryActive &&
      activeMode === 'register' ? (
        <View
          style={[styles.card, embedded && styles.embeddedCard, embedded && isCompactWidth && styles.embeddedCardCompact]}
          onLayout={(event) => {
            registerSectionY.current = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.registerHeader}>
            <View style={styles.registerHeaderText}>
              <Text
                allowFontScaling={false}
                style={[styles.cardTitle, isCompactWidth && styles.cardTitleCompact, embedded && styles.embeddedCardTitle]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {registerTitleLabel}
              </Text>
              <Text allowFontScaling={false} style={[styles.cardSubtitle, embedded && styles.embeddedCardSubtitle]}>
                Crea il back office del tuo salone e poi potrai usarlo da app o da computer.
              </Text>
            </View>
          </View>

          <View style={[styles.registerForm, embedded && styles.embeddedRegisterForm]}>
            <TextInput
              ref={registerFirstNameRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerFirstName && styles.inputError,
              ]}
              placeholder={ownerFieldLabels.firstName}
              accessibilityLabel={ownerFieldLabels.firstName}
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              value={registerFirstName}
              onChangeText={(value) => {
                setRegisterFirstName(formatCustomerNamePart(value));
                if (formErrors.registerFirstName) {
                  setFormErrors((current) => ({ ...current, registerFirstName: undefined }));
                }
              }}
              onFocus={() =>
                Platform.OS === 'android'
                  ? keepRegisterFieldVisible(registerFirstNameRef)
                  : scrollToField(registerFirstNameRef, { scrollDelay: 220 })
              }
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerLastNameRef)}
              blurOnSubmit={false}
            />
            {formErrors.registerFirstName ? (
              <Text style={styles.fieldErrorText}>{formErrors.registerFirstName}</Text>
            ) : null}

            <TextInput
              ref={registerLastNameRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerLastName && styles.inputError,
              ]}
              placeholder={ownerFieldLabels.lastName}
              accessibilityLabel={ownerFieldLabels.lastName}
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              value={registerLastName}
              onChangeText={(value) => {
                setRegisterLastName(formatCustomerNamePart(value));
                if (formErrors.registerLastName) {
                  setFormErrors((current) => ({ ...current, registerLastName: undefined }));
                }
              }}
              onFocus={() => keepRegisterFieldVisible(registerLastNameRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerSalonNameRef)}
              blurOnSubmit={false}
            />
            {formErrors.registerLastName ? (
              <Text style={styles.fieldErrorText}>{formErrors.registerLastName}</Text>
            ) : null}

            <TextInput
              ref={registerSalonNameRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerPassword && styles.inputError,
              ]}
              placeholder={ownerFieldLabels.salonName}
              accessibilityLabel={ownerFieldLabels.salonName}
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              value={registerSalonName}
              onChangeText={(value) => setRegisterSalonName(forceLeadingUppercase(value))}
              onFocus={() => keepRegisterFieldVisible(registerSalonNameRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerBusinessPhoneRef)}
              blurOnSubmit={false}
            />

            <TextInput
              ref={registerBusinessPhoneRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerBusinessPhone && styles.inputError,
              ]}
              placeholder={appLanguage === 'it' ? 'Cellulare (obbligatorio)' : ownerFieldLabels.businessPhone}
              accessibilityLabel={ownerFieldLabels.businessPhone}
              placeholderTextColor={palette.muted}
              keyboardType="phone-pad"
              value={registerBusinessPhone}
              onChangeText={(value) => {
                setRegisterBusinessPhone(limitPhoneToTenDigits(value));
                if (formErrors.registerBusinessPhone) {
                  setFormErrors((current) => ({
                    ...current,
                    registerBusinessPhone: undefined,
                  }));
                }
              }}
              onFocus={() => keepRegisterFieldVisible(registerBusinessPhoneRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerStreetLineRef)}
              blurOnSubmit={false}
            />
            {formErrors.registerBusinessPhone ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {formErrors.registerBusinessPhone}
              </Text>
            ) : null}

            <TextInput
              ref={registerStreetLineRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[styles.input, embedded && styles.embeddedInput]}
              placeholder={ownerFieldLabels.streetLine}
              accessibilityLabel={ownerFieldLabels.streetLine}
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              value={registerStreetLine}
              onChangeText={(value) => setRegisterStreetLine(forceLeadingUppercase(value))}
              onFocus={() => keepRegisterFieldVisible(registerStreetLineRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerCityRef)}
              blurOnSubmit={false}
            />

            <TextInput
              ref={registerCityRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[styles.input, embedded && styles.embeddedInput]}
              placeholder={ownerFieldLabels.city}
              accessibilityLabel={ownerFieldLabels.city}
              placeholderTextColor={palette.muted}
              value={registerCity}
              onChangeText={(value) => setRegisterCity(forceLeadingUppercase(value))}
              autoCapitalize="words"
              onFocus={() => keepRegisterFieldVisible(registerCityRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerPostalCodeRef)}
              blurOnSubmit={false}
            />

            <TextInput
              ref={registerPostalCodeRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[styles.input, embedded && styles.embeddedInput]}
              placeholder={ownerFieldLabels.postalCode}
              accessibilityLabel={ownerFieldLabels.postalCode}
              placeholderTextColor={palette.muted}
              keyboardType="number-pad"
              value={registerPostalCode}
              onChangeText={setRegisterPostalCode}
              onFocus={() => keepRegisterFieldVisible(registerPostalCodeRef)}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (registerActivityCategory.trim()) {
                  if (Platform.OS === 'android') {
                    focusField(registerEmailRef);
                    return;
                  }
                  scrollToRegisterCredentials();
                  return;
                }

                setRegisterCustomCategoryOpen(true);
                requestAnimationFrame(() => {
                  scrollToField(registerActivityCategoryRef);
                });
              }}
              blurOnSubmit={false}
            />

            <View style={styles.registerCategorySection}>
              <View style={styles.registerCategorySectionHeader}>
                <Text allowFontScaling={false} style={styles.registerCategorySectionTitle}>
                  Scegli tipologia attività
                </Text>
                <Text allowFontScaling={false} style={styles.registerCategorySectionSubtitle}>
                  Puoi selezionarne più di una. Serve solo come badge iniziale del salone: i
                  servizi e i mestieri restano liberi anche dopo la registrazione.
                </Text>
                {canClearRegister ? (
                  <TouchableOpacity
                    style={styles.clearRegisterFieldsButton}
                    onPress={handleClearRegisterFields}
                    activeOpacity={0.9}
                    disabled={loadingAction !== null}
                  >
                    <Text allowFontScaling={false} style={styles.clearRegisterFieldsButtonText}>
                      Svuota tutto
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.registerCategoryChipWrap}>
                {REGISTRATION_CATEGORY_PRESETS.map((option) => {
                  const selected = registerSelectedCategories.some(
                    (item) => item.trim().toLowerCase() === option.trim().toLowerCase()
                  );

                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.registerCategoryChip,
                        embedded && styles.embeddedRegisterCategoryChip,
                        selected && styles.registerCategoryChipActive,
                      ]}
                      activeOpacity={0.9}
                      onPress={() => toggleRegistrationCategory(option)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.registerCategoryChipText,
                          selected && styles.registerCategoryChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[
                    styles.registerCategoryChip,
                    embedded && styles.embeddedRegisterCategoryChip,
                    styles.registerCategoryChipGhost,
                    registerCustomCategoryOpen && styles.registerCategoryChipGhostActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => {
                    setRegisterCustomCategoryOpen((current) => !current);
                    requestAnimationFrame(() => {
                      scrollToField(registerActivityCategoryRef);
                    });
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.registerCategoryChipText,
                      registerCustomCategoryOpen && styles.registerCategoryChipGhostTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {registerCustomCategoryOpen ? 'Chiudi nuova categoria' : '+ Nuova categoria'}
                  </Text>
                </TouchableOpacity>
              </View>

              {registerActivityCategory.trim() ? (
                <View style={styles.registerCategorySummary}>
                  <Text allowFontScaling={false} style={styles.registerCategorySummaryLabel}>
                    Badge salone iniziale
                  </Text>
                  <Text allowFontScaling={false} style={styles.registerCategorySummaryValue}>
                    {registerActivityCategory}
                  </Text>
                </View>
              ) : null}

              {registerCustomCategoryOpen ? (
                <TextInput
                  ref={registerActivityCategoryRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={[styles.input, embedded && styles.embeddedInput]}
                  placeholder={ownerFieldLabels.customCategory}
                  accessibilityLabel={ownerFieldLabels.customCategory}
                  placeholderTextColor={palette.muted}
                  value={registerCustomCategoryInput}
                  onChangeText={(value) => setRegisterCustomCategoryInput(forceLeadingUppercase(value))}
                  autoCapitalize="words"
                  onFocus={() => keepRegisterFieldVisible(registerActivityCategoryRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (Platform.OS === 'android') {
                      focusField(registerEmailRef);
                      return;
                    }
                    scrollToRegisterCredentials();
                  }}
                  blurOnSubmit={false}
                />
              ) : null}
            </View>

            <TextInput
              ref={registerEmailRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerEmail && styles.inputError,
              ]}
              placeholder={ownerFieldLabels.email}
              accessibilityLabel={ownerFieldLabels.email}
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              keyboardType="email-address"
              value={registerEmail}
              onChangeText={(value) => {
                setRegisterEmail(value);
                setRegisterEmailOtpSentTo('');
                setRegisterEmailOtpVerifiedFor('');
                setRegisterEmailOtpVerifiedAt(0);
                setRegisterEmailOtpExpiresAt(0);
                setRegisterEmailOtpError('');
                if (formErrors.registerEmail) {
                  setFormErrors((current) => ({ ...current, registerEmail: undefined }));
                }
              }}
              onFocus={() => {
                setRegisterPasswordFocused(false);
                if (Platform.OS === 'android') {
                  keepRegisterFieldVisible(registerEmailRef);
                  return;
                }
                keepRegisterCredentialVisible('email');
              }}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (Platform.OS === 'android') {
                  focusField(registerPasswordRef);
                  return;
                }
                revealRegisterCredentials('password');
              }}
              blurOnSubmit={false}
            />
            {formErrors.registerEmail ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {formErrors.registerEmail}
              </Text>
            ) : null}
            <PasswordTextInput
                    visibilityToggleColor={palette.muted}
              manualIosEntry
              ref={registerPasswordRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[styles.input, embedded && styles.embeddedInput]}
              placeholder={ownerFieldLabels.password}
              accessibilityLabel={ownerFieldLabels.password}
              placeholderTextColor={palette.muted}
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              value={registerPassword}
              onChangeText={(value) => {
                setRegisterPassword(value);
                if (formErrors.registerPassword) {
                  setFormErrors((current) => ({ ...current, registerPassword: undefined }));
                }
              }}
              onFocus={() => {
                setRegisterPasswordFocused(true);
                if (Platform.OS === 'android') {
                  keepRegisterFieldVisible(registerPasswordRef);
                  return;
                }
                keepRegisterCredentialVisible('password');
              }}
              onBlur={() => setRegisterPasswordFocused(false)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(registerPasswordConfirmRef)}
              blurOnSubmit={false}
            />
            {formErrors.registerPassword ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {formErrors.registerPassword}
              </Text>
            ) : null}

            <PasswordTextInput
                    visibilityToggleColor={palette.muted}
              manualIosEntry
              ref={registerPasswordConfirmRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                embedded && styles.embeddedInput,
                formErrors.registerPasswordConfirm && styles.inputError,
              ]}
              placeholder={ownerFieldLabels.passwordConfirm}
              accessibilityLabel={ownerFieldLabels.passwordConfirm}
              placeholderTextColor={palette.muted}
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              value={registerPasswordConfirm}
              onChangeText={(value) => {
                setRegisterPasswordConfirm(value);
                if (formErrors.registerPasswordConfirm) {
                  setFormErrors((current) => ({ ...current, registerPasswordConfirm: undefined }));
                }
              }}
              onFocus={() => {
                setRegisterPasswordFocused(true);
                if (Platform.OS === 'android') {
                  keepRegisterFieldVisible(registerPasswordConfirmRef);
                  return;
                }
                keepRegisterCredentialVisible('password');
              }}
              onBlur={() => setRegisterPasswordFocused(false)}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <PasswordRequirements password={registerPassword} />
            {registerPasswordConfirm.length > 0 && (
              <PasswordMatchRequirement
                password={registerPassword}
                confirmPassword={registerPasswordConfirm}
                alignLeft
              />
            )}
            {formErrors.registerPasswordConfirm ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {formErrors.registerPasswordConfirm}
              </Text>
            ) : null}

            <Text allowFontScaling={false} style={styles.helperText}>
              {tApp(appLanguage, 'auth_register_helper')}
            </Text>

            <OtpVerifiedActionHalo active={registerCtaReady} buttonOnly>
              <TouchableOpacity
                style={[styles.primaryButton, embedded && styles.embeddedPrimaryButton, !canSubmitRegister && styles.primaryButtonDisabled]}
                onPress={handleRegister}
                activeOpacity={0.9}
                disabled={!canSubmitRegister || loadingAction !== null}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.primaryButtonText,
                    isCompactWidth && styles.primaryButtonTextCompact,
                    embedded && styles.embeddedPrimaryButtonText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.84}
                >
                  {loadingAction === 'register'
                    ? tApp(appLanguage, 'auth_register_loading')
                    : registerButtonLabel}
                </Text>
              </TouchableOpacity>
            </OtpVerifiedActionHalo>
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <View
      style={[styles.container, embedded && styles.embeddedContainer]}
      {...(embedded ? {} : swipeBackResponder.panHandlers)}
    >
      <EmailOtpModal
        visible={registerEmailOtpModalVisible && !registerEmailOtpIsVerified}
        email={registerEmailOtpSentTo || normalizeOwnerAccountEmail(registerEmail)}
        resetKey={registerEmailOtpChallengeVersion}
        busy={registerEmailOtpBusy}
        expired={registerEmailOtpExpired}
        countdown={registerEmailOtpCountdown}
        message={registerEmailOtpError}
        title="Conferma il salone"
        onVerify={verifyRegisterEmailOtp}
        onResend={() =>
          void requestRegisterEmailOtp(registerEmail, { announceResult: true })
        }
        onBack={() => setRegisterEmailOtpModalVisible(false)}
      />
      {!embedded ? <AccessBackdrop /> : null}
      <KeyboardAvoidingView
        style={[styles.flex, embedded && styles.embeddedFlex]}
        behavior={!embedded && Platform.OS === 'android' ? 'height' : undefined}
      >
        {useEmbeddedStaticLayout ? (
          <View style={styles.embeddedStaticContent}>{content}</View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={embedded ? styles.embeddedScrollView : undefined}
            contentContainerStyle={[
              styles.scrollContent,
              embedded && styles.embeddedScrollContent,
              registerPasswordFocused && styles.scrollContentPasswordFocused,
            ]}
            keyboardShouldPersistTaps={Platform.OS === 'android' ? 'always' : 'handled'}
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={Keyboard.dismiss}
            showsVerticalScrollIndicator={embedded && Platform.OS === 'web'}
            scrollEnabled={embedded ? Platform.OS === 'web' || Platform.OS === 'android' : true}
            nestedScrollEnabled={embedded && Platform.OS === 'android'}
          >
            {content}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const baseStyles = StyleSheet.create(withAndroidStyleSafety({
  container: {
    flex: 1,
    backgroundColor: '#e6edf3',
  },
  embeddedContainer: {
    width: '100%',
    flex: 0,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -80,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    opacity: 0.65,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: '#d1fae5',
    opacity: 0.45,
  },
  registerSuccessOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(8, 15, 29, 0.72)',
  },
  registerSuccessCard: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    borderRadius: 32,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    shadowColor: '#020617',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 24,
  },
  registerSuccessIconHalo: {
    width: 82,
    height: 82,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    backgroundColor: '#D1FAE5',
  },
  registerSuccessIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#078F68',
    shadowColor: '#10B981',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  registerSuccessEyebrow: {
    color: '#078F68',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  registerSuccessTitle: {
    color: '#0F172A',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  registerSuccessBody: {
    color: '#64748B',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  registerSuccessButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  registerSuccessButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  flex: {
    flex: 1,
  },
  embeddedFlex: {
    width: '100%',
    flex: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Platform.OS === 'android' ? 28 : 22,
    paddingTop: 56,
    paddingBottom: Platform.OS === 'ios' ? 260 : 220,
    alignItems: 'center',
  },
  embeddedScrollContent: {
    flexGrow: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  embeddedScrollView: {
    width: '100%',
    flex: 0,
    overflow: 'visible',
    alignSelf: 'stretch',
  },
  embeddedStaticContent: {
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 0,
  },
  scrollContentPasswordFocused: {
    paddingBottom: Platform.OS === 'ios' ? 360 : 280,
  },
  heroCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingTop: Platform.OS === 'android' ? 22 : 18,
    paddingBottom: Platform.OS === 'android' ? 18 : 16,
    paddingHorizontal: Platform.OS === 'android' ? 24 : 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#10203F',
    shadowOpacity: Platform.OS === 'ios' ? 0.10 : 0.13,
    shadowRadius: Platform.OS === 'ios' ? 28 : 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
    alignSelf: 'center',
  },
  heroBackButton: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
    zIndex: 2,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroChip: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 12,
    paddingVertical: 8,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    width: '100%',
    textAlign: 'center',
  },
  hero: {
    marginBottom: 12,
    alignItems: 'center',
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: Platform.OS === 'android' ? 0.8 : 2,
    color: '#6b7280',
    marginBottom: 10,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 10 : 0,
  },
  heroBrandWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginBottom: 6,
  },
  heroBrandScaleWrap: {
    transform: [{ scale: Platform.OS === 'android' ? 1.14 : 1.18 }],
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#667085',
    maxWidth: 460,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 10 : 0,
  },
  heroHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 2,
  },
  heroHighlightPill: {
    borderRadius: 999,
    paddingHorizontal: Platform.OS === 'android' ? 20 : 16,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Platform.OS === 'android' ? 112 : 96,
    maxWidth: '100%',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroHighlightPillBlue: {
    backgroundColor: '#E1F1FF',
    borderColor: '#C8E3FB',
    shadowColor: '#8CC7F5',
  },
  heroHighlightPillMint: {
    backgroundColor: '#DDF9E7',
    borderColor: '#C8F0D5',
    shadowColor: '#8ED9AA',
  },
  heroHighlightPillRose: {
    backgroundColor: '#FCE5F2',
    borderColor: '#F3CFE3',
    shadowColor: '#E5A8C8',
  },
  heroHighlightText: {
    fontSize: 12.5,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 4 : 0,
    letterSpacing: -0.1,
  },
  heroHighlightTextBlue: {
    color: '#0B5E93',
  },
  heroHighlightTextMint: {
    color: '#17693E',
  },
  heroHighlightTextRose: {
    color: '#A61B5B',
  },
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: Platform.OS === 'android' ? 24 : 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#10203F',
    shadowOpacity: Platform.OS === 'ios' ? 0.10 : 0.13,
    shadowRadius: Platform.OS === 'ios' ? 28 : 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
    alignSelf: 'center',
  },
  embeddedCard: {
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginTop: 0,
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E9F4',
    shadowColor: '#E7EEF8',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  embeddedCardCompact: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 16,
  },
  modeSwitch: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#EFF4FB',
    borderRadius: 26,
    padding: Platform.OS === 'android' ? 8 : 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.78)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  embeddedModeSwitch: {
    maxWidth: 520,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
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
  modeSwitchCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  modeSwitchButton: {
    flex: 1,
    minWidth: Platform.OS === 'android' ? 132 : 120,
    borderRadius: 22,
    paddingVertical: 10,
    minHeight: 44,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  modeSwitchButtonCompact: {
    flexBasis: '100%',
    width: '100%',
    minWidth: 0,
  },
  embeddedModeSwitchButton: {
    minWidth: 0,
    paddingHorizontal: 8,
  },
  modeSwitchButtonActive: {
    backgroundColor: '#1B3155',
    borderColor: '#1B3155',
    shadowColor: '#1B3155',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeSwitchButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6b7280',
    textAlign: 'center',
    flexShrink: 1,
    paddingHorizontal: 6,
    width: '100%',
    alignSelf: 'stretch',
  },
  modeSwitchButtonTextCompact: {
    fontSize: 13,
  },
  modeSwitchButtonTextActive: {
    color: '#ffffff',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  cardTitleCompact: {
    fontSize: 20,
  },
  embeddedCardTitle: {
    fontSize: 19,
    lineHeight: 24,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#667085',
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
  },
  embeddedCardSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 0,
  },
  sectionTopRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sectionTopText: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
  },
  sectionMiniChip: {
    alignSelf: 'center',
    backgroundColor: '#eef6f5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  sectionMiniChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f766e',
  },
  input: {
    backgroundColor: '#f7f7f8',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
    paddingBottom: Platform.OS === 'ios' ? 0 : 12,
    height: Platform.OS === 'ios' ? 50 : undefined,
    minHeight: 50,
    fontSize: 15,
    lineHeight: Platform.OS === 'ios' ? undefined : 22,
    color: '#111827',
    marginBottom: 12,
    width: '100%',
    textAlign: 'center',
  },
  embeddedInput: {
    backgroundColor: '#F7FAFE',
    borderWidth: 1,
    borderColor: '#DEE7F2',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 0 : 11,
    paddingBottom: Platform.OS === 'ios' ? 0 : 11,
    height: Platform.OS === 'ios' ? 44 : undefined,
    minHeight: Platform.OS === 'android' ? 48 : 44,
    fontSize: 14,
    lineHeight: Platform.OS === 'ios' ? undefined : 20,
    marginBottom: 8,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  inputCompact: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
    paddingBottom: Platform.OS === 'ios' ? 0 : 12,
    height: Platform.OS === 'ios' ? 50 : undefined,
    minHeight: 50,
    lineHeight: Platform.OS === 'ios' ? undefined : 21,
  },
  biometricCredentialMaskInput: {
    fontSize: 13,
    lineHeight: Platform.OS === 'ios' ? undefined : 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  ownerCredentialPlainInput: {
    lineHeight: Platform.OS === 'ios' ? undefined : 22,
    fontWeight: '400',
    fontStyle: 'normal',
    letterSpacing: 0,
  },
  ownerCredentialPlainInputAndroid: {
    minHeight: 50,
    lineHeight: 22,
    paddingTop: 11,
    paddingBottom: 12,
    textAlignVertical: 'center',
    includeFontPadding: true,
  },
  embeddedCredentialPlainInputAndroid: {
    minHeight: 48,
    lineHeight: 20,
    paddingTop: 11,
    paddingBottom: 11,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
    marginLeft: 0,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  embeddedInputLabel: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 5,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  registerCategorySection: {
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  registerCategorySectionHeader: {
    alignItems: 'center',
    gap: 5,
  },
  registerCategorySectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  registerCategorySectionSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    color: '#667085',
    textAlign: 'center',
  },
  clearRegisterFieldsButton: {
    marginTop: 6,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearRegisterFieldsButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#B91C1C',
    textAlign: 'center',
  },
  registerCategoryChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  registerCategoryChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedRegisterCategoryChip: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(148, 163, 184, 0.24)',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  registerCategoryChipGhost: {
    backgroundColor: '#FFF4C7',
    borderColor: '#E7C96A',
  },
  registerCategoryChipGhostActive: {
    backgroundColor: '#F9E38C',
    borderColor: '#D7AF2B',
  },
  registerCategoryChipActive: {
    backgroundColor: '#1e293b',
    borderColor: '#1e293b',
  },
  registerCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  registerCategoryChipTextActive: {
    color: '#ffffff',
  },
  registerCategoryChipGhostTextActive: {
    color: '#7A5800',
  },
  registerCategorySummary: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFBEA',
    borderWidth: 1,
    borderColor: '#F3E4AA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  registerCategorySummaryLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#9A6B00',
    marginBottom: 4,
  },
  registerCategorySummaryValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#5F4700',
    textAlign: 'center',
  },
  fieldErrorText: {
    marginTop: -8,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  fieldSuccessText: {
    color: '#047857',
  },
  resetFeedback: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },
  resetFeedbackSuccess: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A6F4C5',
  },
  resetFeedbackError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  resetFeedbackText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  resetFeedbackTextSuccess: {
    color: '#027A48',
  },
  resetFeedbackTextError: {
    color: '#B42318',
  },
  clearFieldsButton: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  clearFieldsButtonText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#1B3155',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: Platform.OS === 'android' ? 22 : 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderWidth: 0,
    borderColor: 'transparent',
    minHeight: 48,
  },
  primaryButtonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  primaryButtonSpinnerShell: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  premiumLoginLoaderShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumLoginLoaderRing: {
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
  premiumLoginLoaderRingBlue: {
    borderColor: 'rgba(95,143,246,0.18)',
    borderTopColor: '#2563EB',
    borderRightColor: 'rgba(37,99,235,0.68)',
    borderBottomColor: 'rgba(95,143,246,0.30)',
    borderLeftColor: 'rgba(95,143,246,0.08)',
  },
  loginPrimaryDisabled: { backgroundColor: '#E8EEF6', borderWidth: 1, borderColor: '#DDE6F0' },
  loginPrimaryTextDisabled: { color: '#718198' },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 6,
    width: '100%',
    alignSelf: 'stretch',
  },
  primaryButtonTextLoading: {
    width: 'auto',
    alignSelf: 'auto',
    flexShrink: 1,
    textAlign: 'left',
  },
  primaryButtonTextCompact: {
    fontSize: 14,
  },
  embeddedPrimaryButton: {
    borderRadius: 14,
    marginTop: 2,
    minHeight: 44,
  },
  embeddedPrimaryButtonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  loginFeedbackText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  biometricButton: {
    marginTop: 4,
    marginBottom: 18,
    backgroundColor: '#DCEBFF',
    borderRadius: 999,
    paddingVertical: 0,
    paddingHorizontal: Platform.OS === 'android' ? 14 : 14,
    minHeight: 50,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#B9D4FF',
    shadowColor: '#8DB6FF',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    width: '100%',
  },
  embeddedBiometricButton: {
    marginTop: 6,
    minHeight: 54,
    height: 54,
    backgroundColor: '#DCEBFF',
    borderColor: '#B9D4FF',
    shadowColor: '#8DB6FF',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  biometricButtonDisabled: {
    opacity: 1,
    backgroundColor: '#F7FAFE',
    borderColor: '#DFE7F1',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  biometricIconBadge: {
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
  biometricIconBadgeDisabled: {
    backgroundColor: '#E8EDF3',
    borderColor: '#D5DCE6',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  biometricTextWrap: {
    flexShrink: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  biometricButtonText: {
    color: '#163E8F',
    fontSize: 13.5,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  biometricButtonTextDisabled: {
    color: '#7B8798',
  },
  biometricButtonTextCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  embeddedBiometricButtonText: {
    fontSize: 14,
    lineHeight: 18,
  },
  biometricButtonCaption: {
    marginTop: 0,
    color: '#5B7099',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  biometricButtonCaptionDisabled: {
    color: '#98A2B3',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 12 : 0,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#315EA8',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
  },
  embeddedLinkButton: {
    minHeight: 34,
    marginTop: 2,
    marginBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedLinkButtonText: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 0,
  },
  loginRegisterPrompt: {
    marginTop: 14,
    alignItems: 'center',
    gap: 8,
  },
  loginRegisterPromptLabel: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    color: '#667085',
    textAlign: 'center',
  },
  loginRegisterPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 164,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 13,
    backgroundColor: 'rgba(236, 250, 243, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#79C89F',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  loginRegisterPromptButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#155A41',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  inlinePanel: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
  },
  inlinePanelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
    width: '100%',
  },
  inlinePanelText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#667085',
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
  },
  secondaryButton: {
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: Platform.OS === 'android' ? 22 : 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonDisabled: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 6,
    width: '100%',
    alignSelf: 'stretch',
  },
  registerHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerHeaderText: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
  },
  outlineButton: {
    backgroundColor: 'rgba(236, 250, 243, 0.88)',
    borderRadius: 999,
    paddingHorizontal: Platform.OS === 'android' ? 26 : 20,
    paddingVertical: 13,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 156,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#79C89F',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  outlineButtonCompact: {
    minWidth: 0,
    width: '100%',
    marginTop: 10,
    borderRadius: 18,
  },
  outlineButtonText: {
    color: '#155A41',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 6,
    width: '100%',
    alignSelf: 'stretch',
    letterSpacing: -0.15,
  },
  outlineButtonTextCompact: {
    fontSize: 13,
  },
  registerForm: {
    marginTop: 10,
  },
  embeddedRegisterForm: {
    marginTop: 0,
  },
  otpVerificationBox: {
    width: '100%',
    marginTop: 6,
    marginBottom: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DCE6F0',
    gap: 8,
  },
  otpVerificationTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  otpVerificationText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  otpActionsRow: {
    gap: 2,
    width: '100%',
    alignItems: 'center',
  },
  otpActionButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  otpActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  otpGhostButton: {
    minHeight: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpGhostButtonText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '800',
  },
  otpFeedbackText: {
    width: '100%',
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 8,
    textAlign: 'center',
    alignSelf: 'center',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#667085',
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
  },
}) as any);

const styles = baseStyles;
