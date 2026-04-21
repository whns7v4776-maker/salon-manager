import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { AppWordmark } from '../../components/app-wordmark';
import { useAppContext } from '../context/AppContext';
import { withAndroidStyleSafety } from '../lib/android-style-safety';
import { useKeyboardAwareScroll } from '../lib/form-navigation';
import { tApp } from '../lib/i18n';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../lib/validators';

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

export function OwnerAccessScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const {
    appLanguage,
    loginOwnerAccount,
    registerOwnerAccount,
    requestOwnerPasswordReset,
    ownerPasswordRecoveryActive,
    completeOwnerPasswordRecovery,
    biometricEnabled,
    biometricAvailable,
    biometricType,
    unlockOwnerAccountWithBiometric,
  } = useAppContext();

  const scrollRef = useRef<ScrollView | null>(null);
  const registerCardY = useRef(0);
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
  const [activeMode, setActiveMode] = useState<'login' | 'register'>('login');
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
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [loadingAction, setLoadingAction] = useState<'login' | 'register' | 'reset' | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState('');
  const biometricAutoTriggered = useRef(false);

  const [formErrors, setFormErrors] = useState<{
    loginEmail?: string;
    resetEmail?: string;
    registerEmail?: string;
    registerBusinessPhone?: string;
  }>({});
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 36,
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

  // Auto-trigger biometrica al mount se abilitata e disponibile
  useEffect(() => {
    if (biometricAutoTriggered.current) return;
    if (!biometricEnabled || !biometricAvailable || Platform.OS === 'web') return;
    biometricAutoTriggered.current = true;
    const timer = setTimeout(async () => {
      setBiometricLoading(true);
      const result = await unlockOwnerAccountWithBiometric();
      setBiometricLoading(false);
      if (!result.ok && result.error) {
        Alert.alert('Accesso biometrico', result.error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [biometricEnabled, biometricAvailable, unlockOwnerAccountWithBiometric]);

  useEffect(() => {
    if (!showReset) {
      return;
    }

    if (!resetEmail.trim() && loginEmail.trim()) {
      setResetEmail(loginEmail.trim());
    }
  }, [showReset, resetEmail, loginEmail]);

  const handleBiometricLogin = async () => {
    if (biometricLoading || loadingAction !== null) return;
    setBiometricLoading(true);
    const result = await unlockOwnerAccountWithBiometric();
    setBiometricLoading(false);
    if (!result.ok && result.error) {
      Alert.alert('Accesso biometrico', result.error);
    }
  };

  const canSubmitLogin = useMemo(
    () => loginEmail.trim() !== '' && loginPassword.trim() !== '',
    [loginEmail, loginPassword]
  );
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
      registerPassword.trim() !== '',
    [
      registerActivityCategory,
      registerBusinessPhone,
      registerCity,
      registerEmail,
      registerFirstName,
      registerLastName,
      registerPassword,
      registerPostalCode,
      registerSalonName,
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
      recoveryPassword.trim().length >= 6 &&
      recoveryPasswordConfirm.trim().length >= 6 &&
      recoveryPassword === recoveryPasswordConfirm,
    [recoveryPassword, recoveryPasswordConfirm]
  );
  const isCompactWidth = width < 390;
  const loginModeLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_mode_login');
  const registerModeLabel = isCompactWidth ? 'Crea' : 'Crea salone';
  const loginTitleLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_login_title');
  const loginButtonLabel = isCompactWidth ? 'Accedi' : tApp(appLanguage, 'auth_login_button');
  const registerTitleLabel = isCompactWidth ? 'Crea salone' : 'Crea il tuo salone';
  const registerOpenLabel = isCompactWidth
    ? showRegister
      ? 'Chiudi'
      : 'Apri'
    : showRegister
      ? 'Chiudi registrazione'
      : 'Apri registrazione';
  const registerButtonLabel = isCompactWidth ? 'Crea' : 'Crea salone';

  const navigateToOwnerAgenda = React.useCallback(() => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.location?.assign === 'function'
    ) {
      window.location.assign('/agenda');
      return;
    }

    router.replace('/agenda');
  }, [router]);

  const scrollToRegisterCard = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(registerCardY.current - 18, 0),
        animated: true,
      });
    });
  };

  const openRegisterCard = () => {
    setShowRegister(true);
    setShowReset(false);
    setActiveMode('register');
    scrollToRegisterCard();
  };

  const toggleRegistrationCategory = (option: string) => {
    setRegisterSelectedCategories((current) => {
      const normalizedOption = option.trim().toLowerCase();
      const exists = current.some((item) => item.trim().toLowerCase() === normalizedOption);
      if (exists) {
        return current.filter((item) => item.trim().toLowerCase() !== normalizedOption);
      }

      return [...current, option];
    });
  };

  const handleLogin = async () => {
    if (!canSubmitLogin) return;

    if (!isValidEmail(loginEmail)) {
      setFormErrors((current) => ({ ...current, loginEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, loginEmail: undefined }));
    setLoginFeedback('');
    setLoadingAction('login');

    try {
      const result = await loginOwnerAccount(loginEmail, loginPassword);

      if (!result.ok) {
        setLoginFeedback(result.error ?? tApp(appLanguage, 'auth_login_failed_body'));
        Alert.alert(
          tApp(appLanguage, 'auth_login_failed_title'),
          result.error ?? tApp(appLanguage, 'auth_login_failed_body')
        );
        return;
      }

      navigateToOwnerAgenda();
    } catch (error) {
      const fallbackError =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : tApp(appLanguage, 'auth_login_failed_body');
      setLoginFeedback(fallbackError);
      Alert.alert(tApp(appLanguage, 'auth_login_failed_title'), fallbackError);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRegister = async () => {
    if (!canSubmitRegister) return;

    const invalidFields: string[] = [];
    const nextErrors: {
      registerEmail?: string;
      registerBusinessPhone?: string;
    } = {};

    if (!isValidPhone10(registerBusinessPhone)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
      nextErrors.registerBusinessPhone = 'Numero di telefono errato (deve avere 10 cifre)';
    }

    if (!isValidEmail(registerEmail)) {
      invalidFields.push('Email non valida');
      nextErrors.registerEmail = 'Email non valida';
    }

    if (invalidFields.length > 0) {
      setFormErrors((current) => ({ ...current, ...nextErrors }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setFormErrors((current) => ({
      ...current,
      registerEmail: undefined,
      registerBusinessPhone: undefined,
    }));

    setLoadingAction('register');
    const result = await registerOwnerAccount({
      firstName: registerFirstName,
      lastName: registerLastName,
      salonName: registerSalonName,
      businessPhone: registerBusinessPhone,
      streetLine: registerStreetLine,
      city: registerCity,
      postalCode: registerPostalCode,
      activityCategory: registerActivityCategory,
      email: registerEmail,
      password: registerPassword,
    });
    setLoadingAction(null);

    if (!result.ok) {
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

    setLoginEmail(result.email ?? registerEmail.trim());
    setLoginPassword('');
    setRegisterPassword('');
    setRegisterSelectedCategories([]);
    setRegisterCustomCategoryInput('');
    setRegisterCustomCategoryOpen(false);
    setShowRegister(false);
    setShowReset(false);
    setActiveMode('login');
  };

  const handleResetPassword = async () => {
    if (!canSubmitReset) return;

    if (!isValidEmail(effectiveResetEmail)) {
      setFormErrors((current) => ({ ...current, resetEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, resetEmail: undefined }));

    setLoadingAction('reset');
    const result = await requestOwnerPasswordReset(effectiveResetEmail);
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert(
        tApp(appLanguage, 'auth_reset_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_register_failed_body')
      );
      return;
    }

    Alert.alert(
      tApp(appLanguage, 'auth_reset_ready_title'),
      result.backendRequired
        ? tApp(appLanguage, 'auth_reset_ready_backend')
        : tApp(appLanguage, 'auth_reset_ready_email')
    );
  };

  const handleCompletePasswordRecovery = async () => {
    if (!canSubmitRecovery) {
      Alert.alert(
        'Nuova password non valida',
        recoveryPassword !== recoveryPasswordConfirm
          ? 'Le due password non coincidono.'
          : 'La nuova password deve avere almeno 6 caratteri.'
      );
      return;
    }

    setLoadingAction('reset');
    const result = await completeOwnerPasswordRecovery(recoveryPassword);
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert('Recupero password', result.error ?? 'Aggiornamento password non riuscito.');
      return;
    }

    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setLoginPassword('');
    Alert.alert('Password aggiornata', 'La nuova password è stata salvata correttamente.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={() => router.replace('/cliente-scanner')}
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
                  <AppWordmark />
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

          {!ownerPasswordRecoveryActive ? (
            <View style={[styles.modeSwitch, isCompactWidth && styles.modeSwitchCompact]}>
              <TouchableOpacity
                style={[
                  styles.modeSwitchButton,
                  isCompactWidth && styles.modeSwitchButtonCompact,
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
                  isCompactWidth && styles.modeSwitchButtonCompact,
                  activeMode === 'register' && styles.modeSwitchButtonActive,
                ]}
                onPress={() => {
                  openRegisterCard();
                }}
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

          <View
            style={styles.card}
            onLayout={(event) => {
              registerCardY.current = event.nativeEvent.layout.y;
            }}
          >
            {ownerPasswordRecoveryActive ? (
              <>
                <View style={styles.sectionTopRow}>
                  <View style={styles.sectionTopText}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.cardTitle,
                        isCompactWidth && styles.cardTitleCompact,
                      ]}
                    >
                      Imposta nuova password
                    </Text>
                    <Text allowFontScaling={false} style={styles.cardSubtitle}>
                      Inserisci la nuova password per completare il recupero account.
                    </Text>
                  </View>
                </View>

                <TextInput
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={[styles.input, isCompactWidth && styles.inputCompact]}
                  placeholder="Nuova password"
                  placeholderTextColor="#98a2b3"
                  secureTextEntry
                  value={recoveryPassword}
                  onChangeText={setRecoveryPassword}
                  returnKeyType="next"
                />

                <TextInput
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={[styles.input, isCompactWidth && styles.inputCompact]}
                  placeholder="Conferma nuova password"
                  placeholderTextColor="#98a2b3"
                  secureTextEntry
                  value={recoveryPasswordConfirm}
                  onChangeText={setRecoveryPasswordConfirm}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, !canSubmitRecovery && styles.primaryButtonDisabled]}
                  onPress={handleCompletePasswordRecovery}
                  activeOpacity={0.9}
                  disabled={!canSubmitRecovery || loadingAction !== null}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.primaryButtonText,
                      isCompactWidth && styles.primaryButtonTextCompact,
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
            <View style={styles.sectionTopRow}>
              <View style={styles.sectionTopText}>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.cardTitle,
                    isCompactWidth && styles.cardTitleCompact,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {loginTitleLabel}
                </Text>
                <Text allowFontScaling={false} style={styles.cardSubtitle}>
                  Accedi con la mail del titolare e la password del salone.
                </Text>
              </View>
            </View>

            {isCompactWidth ? (
              <Text allowFontScaling={false} style={styles.inputLabel}>
                Mail
              </Text>
            ) : null}
            <TextInput
              ref={loginEmailRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[
                styles.input,
                isCompactWidth && styles.inputCompact,
                formErrors.loginEmail && styles.inputError,
              ]}
              placeholder={isCompactWidth ? '' : tApp(appLanguage, 'auth_email_placeholder')}
              placeholderTextColor="#98a2b3"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              keyboardType="email-address"
              value={loginEmail}
              onChangeText={(value) => {
                setLoginEmail(value);
                if (formErrors.loginEmail) {
                  setFormErrors((current) => ({ ...current, loginEmail: undefined }));
                }
              }}
              onFocus={() => scrollToField(loginEmailRef)}
              returnKeyType="next"
              onSubmitEditing={() => focusField(loginPasswordRef)}
              blurOnSubmit={false}
            />
            {formErrors.loginEmail ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {formErrors.loginEmail}
              </Text>
            ) : null}

            {isCompactWidth ? (
              <Text allowFontScaling={false} style={styles.inputLabel}>
                Password
              </Text>
            ) : null}
            <TextInput
              ref={loginPasswordRef}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={[styles.input, isCompactWidth && styles.inputCompact]}
              placeholder={isCompactWidth ? '' : tApp(appLanguage, 'auth_password_placeholder')}
              placeholderTextColor="#98a2b3"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={loginPassword}
              onChangeText={setLoginPassword}
              onFocus={() => scrollToField(loginPasswordRef)}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmitLogin && styles.primaryButtonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.9}
              disabled={!canSubmitLogin || loadingAction !== null}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.primaryButtonText,
                  isCompactWidth && styles.primaryButtonTextCompact,
                ]}
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.84}
              >
                {loadingAction === 'login'
                  ? tApp(appLanguage, 'auth_login_loading')
                  : loginButtonLabel}
              </Text>
            </TouchableOpacity>

            {loginFeedback ? (
              <Text allowFontScaling={false} style={styles.loginFeedbackText}>
                {loginFeedback}
              </Text>
            ) : null}

            {biometricAvailable && Platform.OS !== 'web' ? (
              <TouchableOpacity
                style={[styles.biometricButton, biometricLoading && styles.primaryButtonDisabled]}
                onPress={handleBiometricLogin}
                activeOpacity={0.9}
                disabled={biometricLoading || loadingAction !== null}
              >
                <Text
                  allowFontScaling={false}
                  style={styles.biometricButtonText}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {biometricLoading
                    ? 'Verifica in corso…'
                    : biometricType === 'faceid'
                    ? 'Entra con Face ID'
                    : 'Entra con impronta digitale'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.linkButton}
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
                style={styles.linkButtonText}
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tApp(appLanguage, 'auth_forgot_password')}
              </Text>
            </TouchableOpacity>

            <View style={styles.loginRegisterPrompt}>
              <Text allowFontScaling={false} style={styles.loginRegisterPromptLabel}>
                Non hai ancora creato il tuo spazio salone?
              </Text>
              <TouchableOpacity
                style={styles.loginRegisterPromptButton}
                onPress={openRegisterCard}
                activeOpacity={0.9}
              >
                <Text allowFontScaling={false} style={styles.loginRegisterPromptButtonText}>
                  Crea salone
                </Text>
                <Ionicons name="chevron-down" size={18} color="#0F766E" />
              </TouchableOpacity>
            </View>

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
                  style={[styles.input, formErrors.resetEmail && styles.inputError]}
                  placeholder={tApp(appLanguage, 'auth_reset_email_placeholder')}
                  placeholderTextColor="#98a2b3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={resetEmail}
                  onChangeText={(value) => {
                    setResetEmail(value);
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
              </>
            )}
          </View>

          {!ownerPasswordRecoveryActive ? (
          <View style={styles.card}>
            <View style={styles.registerHeader}>
              <View style={styles.registerHeaderText}>
                <Text
                  allowFontScaling={false}
                  style={[styles.cardTitle, isCompactWidth && styles.cardTitleCompact]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {registerTitleLabel}
                </Text>
                <Text allowFontScaling={false} style={styles.cardSubtitle}>
                  Crea il back office del tuo salone e poi potrai usarlo da app o da computer.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.outlineButton, isCompactWidth && styles.outlineButtonCompact]}
                onPress={() => {
                  const nextShowRegister = !showRegister;
                  setShowRegister(nextShowRegister);
                  setActiveMode(nextShowRegister ? 'register' : 'login');
                  if (nextShowRegister) {
                    scrollToRegisterCard();
                  }
                }}
                activeOpacity={0.9}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.outlineButtonText,
                    isCompactWidth && styles.outlineButtonTextCompact,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.84}
                >
                  {registerOpenLabel}
                </Text>
              </TouchableOpacity>
            </View>

            {showRegister ? (
              <View style={styles.registerForm}>
                <TextInput
                  ref={registerFirstNameRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_first_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerFirstName}
                  onChangeText={setRegisterFirstName}
                  onFocus={() => scrollToField(registerFirstNameRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerLastNameRef)}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerLastNameRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_last_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerLastName}
                  onChangeText={setRegisterLastName}
                  onFocus={() => scrollToField(registerLastNameRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerSalonNameRef)}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerSalonNameRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_salon_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerSalonName}
                  onChangeText={setRegisterSalonName}
                  onFocus={() => scrollToField(registerSalonNameRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerBusinessPhoneRef)}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerBusinessPhoneRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={[styles.input, formErrors.registerBusinessPhone && styles.inputError]}
                  placeholder={tApp(appLanguage, 'auth_business_phone_placeholder')}
                  placeholderTextColor="#98a2b3"
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
                  onFocus={() => scrollToField(registerBusinessPhoneRef)}
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
                  style={styles.input}
                  placeholder="Via e n. civico"
                  placeholderTextColor="#98a2b3"
                  value={registerStreetLine}
                  onChangeText={setRegisterStreetLine}
                  onFocus={() => scrollToField(registerStreetLineRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerCityRef)}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerCityRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder="Città"
                  placeholderTextColor="#98a2b3"
                  value={registerCity}
                  onChangeText={setRegisterCity}
                  autoCapitalize="words"
                  onFocus={() => scrollToField(registerCityRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerPostalCodeRef)}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerPostalCodeRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder="CAP"
                  placeholderTextColor="#98a2b3"
                  keyboardType="number-pad"
                  value={registerPostalCode}
                  onChangeText={setRegisterPostalCode}
                  onFocus={() => scrollToField(registerPostalCodeRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (registerActivityCategory.trim()) {
                      focusField(registerEmailRef);
                      return;
                    }

                    setRegisterCustomCategoryOpen(true);
                    requestAnimationFrame(() => {
                      scrollToField(registerActivityCategoryRef);
                      registerActivityCategoryRef.current?.focus();
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
                      Puoi selezionarne più di una. Serve solo come badge iniziale del salone: i servizi e i mestieri restano liberi anche dopo la registrazione.
                    </Text>
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
                        styles.registerCategoryChipGhost,
                        registerCustomCategoryOpen && styles.registerCategoryChipGhostActive,
                      ]}
                      activeOpacity={0.9}
                      onPress={() => {
                        setRegisterCustomCategoryOpen((current) => !current);
                        requestAnimationFrame(() => {
                          scrollToField(registerActivityCategoryRef);
                          registerActivityCategoryRef.current?.focus();
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
                      style={styles.input}
                      placeholder="Aggiungi una o più categorie personalizzate"
                      placeholderTextColor="#98a2b3"
                      value={registerCustomCategoryInput}
                      onChangeText={setRegisterCustomCategoryInput}
                      autoCapitalize="words"
                      onFocus={() => scrollToField(registerActivityCategoryRef)}
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(registerEmailRef)}
                      blurOnSubmit={false}
                    />
                  ) : null}
                </View>

                <TextInput
                  ref={registerEmailRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={[styles.input, formErrors.registerEmail && styles.inputError]}
                  placeholder={tApp(appLanguage, 'auth_email_placeholder')}
                  placeholderTextColor="#98a2b3"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  value={registerEmail}
                  onChangeText={(value) => {
                    setRegisterEmail(value);
                    if (formErrors.registerEmail) {
                      setFormErrors((current) => ({ ...current, registerEmail: undefined }));
                    }
                  }}
                  onFocus={() => scrollToField(registerEmailRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(registerPasswordRef)}
                  blurOnSubmit={false}
                />
                {formErrors.registerEmail ? (
                  <Text allowFontScaling={false} style={styles.fieldErrorText}>
                    {formErrors.registerEmail}
                  </Text>
                ) : null}

                <TextInput
                  ref={registerPasswordRef}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_password_placeholder')}
                  placeholderTextColor="#98a2b3"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={registerPassword}
                  onChangeText={setRegisterPassword}
                  onFocus={() => scrollToField(registerPasswordRef)}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text allowFontScaling={false} style={styles.helperText}>
                  {tApp(appLanguage, 'auth_register_helper')}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !canSubmitRegister && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleRegister}
                  activeOpacity={0.9}
                  disabled={!canSubmitRegister || loadingAction !== null}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.primaryButtonText, isCompactWidth && styles.primaryButtonTextCompact]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.84}
                  >
                    {loadingAction === 'register'
                      ? tApp(appLanguage, 'auth_register_loading')
                      : registerButtonLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create(withAndroidStyleSafety({
  container: {
    flex: 1,
    backgroundColor: '#e6edf3',
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Platform.OS === 'android' ? 28 : 22,
    paddingTop: 68,
    paddingBottom: 40,
    alignItems: 'center',
  },
  heroCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    padding: Platform.OS === 'android' ? 26 : 22,
    marginBottom: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
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
    marginBottom: 14,
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
    marginBottom: 18,
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
    marginBottom: 14,
  },
  heroBrandScaleWrap: {
    transform: [{ scale: Platform.OS === 'android' ? 1.6 : 1.9 }],
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
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
  },
  heroHighlightPill: {
    borderRadius: 999,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 14,
    paddingVertical: 9,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Platform.OS === 'android' ? 112 : 96,
    maxWidth: '100%',
  },
  heroHighlightPillBlue: {
    backgroundColor: '#e0f2fe',
    borderColor: 'transparent',
  },
  heroHighlightPillMint: {
    backgroundColor: '#dcfce7',
    borderColor: 'transparent',
  },
  heroHighlightPillRose: {
    backgroundColor: '#fce7f3',
    borderColor: 'transparent',
  },
  heroHighlightText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 4 : 0,
  },
  heroHighlightTextBlue: {
    color: '#075985',
  },
  heroHighlightTextMint: {
    color: '#166534',
  },
  heroHighlightTextRose: {
    color: '#9d174d',
  },
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: Platform.OS === 'android' ? 24 : 20,
    marginBottom: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    alignSelf: 'center',
  },
  modeSwitch: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: Platform.OS === 'android' ? 8 : 6,
    marginBottom: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modeSwitchCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  modeSwitchButton: {
    flex: 1,
    minWidth: Platform.OS === 'android' ? 132 : 120,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  modeSwitchButtonCompact: {
    flexBasis: '100%',
    width: '100%',
    minWidth: 0,
  },
  modeSwitchButtonActive: {
    backgroundColor: '#111827',
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
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  cardTitleCompact: {
    fontSize: 22,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#667085',
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
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
    paddingVertical: 15,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputCompact: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
    marginLeft: 4,
    textAlign: 'left',
    alignSelf: 'flex-start',
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
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: Platform.OS === 'android' ? 22 : 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderWidth: 0,
    borderColor: 'transparent',
    minHeight: 54,
  },
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
  primaryButtonTextCompact: {
    fontSize: 14,
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
    marginTop: 12,
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: Platform.OS === 'android' ? 22 : 16,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  biometricButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: Platform.OS === 'android' ? 6 : 0,
    width: '100%',
    alignSelf: 'stretch',
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
    color: '#0f766e',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: Platform.OS === 'android' ? 8 : 0,
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
    gap: 6,
    minWidth: 172,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: '#EEF6F5',
  },
  loginRegisterPromptButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F766E',
    textAlign: 'center',
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
    backgroundColor: '#eef6f5',
    borderRadius: 999,
    paddingHorizontal: Platform.OS === 'android' ? 20 : 14,
    paddingVertical: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 132,
  },
  outlineButtonCompact: {
    minWidth: 0,
    width: '100%',
    marginTop: 10,
    borderRadius: 18,
  },
  outlineButtonText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 6,
    width: '100%',
    alignSelf: 'stretch',
  },
  outlineButtonTextCompact: {
    fontSize: 13,
  },
  registerForm: {
    marginTop: 10,
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
