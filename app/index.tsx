import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputSubmitEditingEventData,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { AppWordmark } from '../components/app-wordmark';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { useAppContext } from '../src/context/AppContext';
import { fetchClientPortalSnapshot } from '../src/lib/client-portal';
import { formatCustomerNamePart } from '../src/lib/customer-name';
import { useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { normalizeSalonCode } from '../src/lib/platform';
import { useResponsiveLayout } from '../src/lib/responsive';
import { isValidEmail, isValidPhone10, limitPhoneToTenDigits } from '../src/lib/validators';

const normalizeSalonCodeInput = (value: string) => normalizeSalonCode(value);
const buildSavedSalonCodeList = (codes: string[]) =>
  Array.from(new Set(codes.map((value) => normalizeSalonCodeInput(value)).filter(Boolean)));
const OWNER_ROUTE = '/proprietario' as Href;
const BACKOFFICE_ROUTE = '/(tabs)' as Href;
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_SAVED_SALON_CODES_KEY = 'salon_manager_frontend_saved_salon_codes';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const HOME_CLIENT_ACCESS_DRAFT_KEY = 'salon_manager_home_client_access_draft';
const HOME_CLIENT_REGISTER_DRAFT_KEY = 'salon_manager_home_client_register_draft';
const FRONTEND_SIMPLE_WEB_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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
const EMPTY_REGISTER_PROFILE = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  instagram: '',
};
const CARD_TOGGLE_LAYOUT = LinearTransition.duration(220);
const CARD_TOGGLE_ENTER = FadeIn.duration(180);
const CARD_TOGGLE_EXIT = FadeOut.duration(140);
const buildDuplicateFrontendCustomerMessage = ({
  emailTaken,
  phoneTaken,
}: {
  emailTaken: boolean;
  phoneTaken: boolean;
}) => {
  if (emailTaken && phoneTaken) {
    return 'Account gia registrato: mail e cellulare sono gia presenti. Usa Accedi.';
  }

  if (emailTaken) {
    return 'Account gia registrato: mail gia registrata. Usa Accedi oppure cambia mail.';
  }

  if (phoneTaken) {
    return 'Account gia registrato: cellulare gia registrato. Usa Accedi oppure cambia numero.';
  }

  return 'Esiste gia un cliente registrato per questo salone con gli stessi contatti. Usa Accedi.';
};

const isSupabaseSchemaCacheLookupError = (error: unknown) => {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  const message =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return code === 'PGRST002' || /schema cache/i.test(message);
};

export default function PublicClientLandingScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ salon?: string | string[]; code?: string | string[] }>();
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoaded, hasInitializedAuth, upsertFrontendCustomerForSalon } = useAppContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const accessEmailRef = useRef<TextInput | null>(null);
  const accessPhoneRef = useRef<TextInput | null>(null);
  const salonCodeRef = useRef<TextInput | null>(null);
  const registerNomeRef = useRef<TextInput | null>(null);
  const registerCognomeRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerPhoneRef = useRef<TextInput | null>(null);
  const registerInstagramRef = useRef<TextInput | null>(null);
  const [salonCode, setSalonCode] = useState('');
  const [salonAssociationError, setSalonAssociationError] = useState('');
  const [isAssociatingSalon, setIsAssociatingSalon] = useState(false);
  const [codeSectionY, setCodeSectionY] = useState(0);
  const [registerSectionY, setRegisterSectionY] = useState(0);
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [savedProfileEmail, setSavedProfileEmail] = useState('');
  const [savedProfilePhone, setSavedProfilePhone] = useState('');
  const [savedSalonCode, setSavedSalonCode] = useState('');
  const [savedSalonCodes, setSavedSalonCodes] = useState<string[]>([]);
  const [selectedAssociatedSalonCode, setSelectedAssociatedSalonCode] = useState('');
  const [isSalonSelectorOpen, setIsSalonSelectorOpen] = useState(false);
  const [isSalonAssociationCardExpanded, setIsSalonAssociationCardExpanded] = useState(
    false
  );
  const [hasSavedClientProfile, setHasSavedClientProfile] = useState(false);
  const [hasSavedBiometricProfile, setHasSavedBiometricProfile] = useState(false);
  const [frontendBiometricEnabled, setFrontendBiometricEnabled] = useState(false);
  const contentTopPadding = Math.max(insets.top + 16, 56);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPhone, setAccessPhone] = useState('');
  const [accessError, setAccessError] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registeringClient, setRegisteringClient] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerProfile, setRegisterProfile] = useState(EMPTY_REGISTER_PROFILE);
  const { scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: Platform.OS === 'ios' ? 208 : 180,
    shouldScrollNode: (node) =>
      node !== registerEmailRef.current &&
      node !== registerPhoneRef.current &&
      node !== registerInstagramRef.current,
  });

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);
  const initialSalonParam = Array.isArray(searchParams.salon) ? searchParams.salon[0] : searchParams.salon;
  const initialCodeParam = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
  const normalizedIncomingSalonCode = useMemo(
    () => normalizeSalonCodeInput(initialSalonParam || initialCodeParam || ''),
    [initialCodeParam, initialSalonParam]
  );
  const normalizedAssociatedSalonCode = useMemo(
    () => normalizeSalonCodeInput(selectedAssociatedSalonCode || savedSalonCode),
    [savedSalonCode, selectedAssociatedSalonCode]
  );
  const hasAssociatedSalon = normalizedAssociatedSalonCode !== '';
  const hasMultipleAssociatedSalons = savedSalonCodes.length > 1;
  const canUseBiometricAccess =
    Platform.OS !== 'web' && frontendBiometricEnabled && hasAssociatedSalon && hasSavedBiometricProfile;
  const biometricButtonLabel = Platform.OS === 'ios' ? 'Accedi con Face ID' : 'Accedi con impronta';
  const showCodeError = codeTouched && normalizedSalonCode === '';

  useEffect(() => {
    setIsSalonAssociationCardExpanded(!hasAssociatedSalon);
  }, [hasAssociatedSalon]);

  const loadSavedClientSession = useCallback(
    async (preferredSalonCode?: string) => {
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
        const normalizedPreferredSalon = normalizeSalonCodeInput(preferredSalonCode ?? '');
        const parsedSalonCodes = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
        const nextSavedSalonCodes = Array.isArray(parsedSalonCodes)
          ? buildSavedSalonCodeList([normalizedPreferredSalon, normalizedStoredSalon, ...(parsedSalonCodes as string[])])
          : buildSavedSalonCodeList([normalizedPreferredSalon, normalizedStoredSalon]);
        const effectiveSalonCode =
          normalizedPreferredSalon || normalizedStoredSalon || nextSavedSalonCodes[0] || '';

        setSavedSalonCode(normalizedStoredSalon);
        setSavedSalonCodes(nextSavedSalonCodes);
        setSelectedAssociatedSalonCode(effectiveSalonCode);
        setFrontendBiometricEnabled(biometricEnabledRaw === 'true');

        if (savedAccessDraftRaw) {
          const accessDraft = JSON.parse(savedAccessDraftRaw) as { email?: string; phone?: string };
          setAccessEmail(String(accessDraft.email ?? '').trim());
          setAccessPhone(limitPhoneToTenDigits(String(accessDraft.phone ?? '').trim()));
        }

        if (savedRegisterDraftRaw) {
          const registerDraft = JSON.parse(savedRegisterDraftRaw) as typeof EMPTY_REGISTER_PROFILE;
          setRegisterProfile({
            nome: String(registerDraft.nome ?? ''),
            cognome: String(registerDraft.cognome ?? ''),
            email: String(registerDraft.email ?? ''),
            telefono: limitPhoneToTenDigits(String(registerDraft.telefono ?? '')),
            instagram: String(registerDraft.instagram ?? ''),
          });
        }

        const scopedProfileRaw = effectiveSalonCode
          ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(effectiveSalonCode))
          : null;
        const effectiveProfileRaw = scopedProfileRaw ?? savedProfileRaw;

        setHasSavedClientProfile(false);
        setSavedProfileEmail('');
        setSavedProfilePhone('');

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
            setHasSavedClientProfile(true);
            setSavedProfileEmail(email);
            setSavedProfilePhone(phone);
          }
        }

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
          biometricEnabledRaw === 'true' &&
          Boolean(effectiveBiometricSalonCode) &&
          effectiveBiometricSalonCode === effectiveSalonCode &&
          Boolean(effectiveBiometricProfileRaw);

        setHasSavedBiometricProfile(hasMatchingBiometricProfile);
      } catch (error) {
        console.log('Errore caricamento accesso rapido cliente:', error);
      }
    },
    []
  );

  useEffect(() => {
    void loadSavedClientSession(normalizedIncomingSalonCode);
  }, [loadSavedClientSession, normalizedIncomingSalonCode]);

  useFocusEffect(
    useCallback(() => {
      void loadSavedClientSession(normalizedAssociatedSalonCode || normalizedIncomingSalonCode);
    }, [loadSavedClientSession, normalizedAssociatedSalonCode, normalizedIncomingSalonCode])
  );

  useEffect(() => {
    if (!normalizedAssociatedSalonCode) {
      return;
    }

    void loadSavedClientSession(normalizedAssociatedSalonCode);
  }, [loadSavedClientSession, normalizedAssociatedSalonCode]);

  useEffect(() => {
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
  }, [normalizedIncomingSalonCode]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));
    const hasRecoveryPayload =
      searchParams.get('recovery') === '1' ||
      hashParams.get('recovery') === '1' ||
      searchParams.has('code') ||
      hashParams.has('access_token') ||
      hashParams.has('refresh_token') ||
      searchParams.has('token_hash') ||
      hashParams.has('token_hash') ||
      searchParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'recovery';

    if (!hasRecoveryPayload || currentUrl.pathname === '/reset-password') {
      return;
    }

    const nextPath = `/reset-password${currentUrl.search}${currentUrl.hash}`;
    router.replace(nextPath as Href);
  }, [router]);

  if (!hasInitializedAuth || !isLoaded) {
    return (
      <View style={styles.nativeRedirectFallback}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={BACKOFFICE_ROUTE} />;
  }

  const scrollToCodeSection = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(codeSectionY - 18, 0), animated: true });
    });
  };

  const handleCodeSectionLayout = (event: LayoutChangeEvent) => {
    setCodeSectionY(event.nativeEvent.layout.y);
  };

  const navigateToHref = (href: Href) => {
    const pathname = typeof href === 'string' ? href : href.pathname;
    const shouldReplaceHistory = pathname === '/cliente';

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
  };

  const associateSalonWithCode = async () => {
    if (isAssociatingSalon) {
      return;
    }

    if (!normalizedSalonCode) {
      setCodeTouched(true);
      setSalonAssociationError('');
      scrollToCodeSection();
      return;
    }

    setSalonAssociationError('');
    setIsAssociatingSalon(true);

    let resolvedPortal = null;

    try {
      resolvedPortal = await fetchClientPortalSnapshot(normalizedSalonCode);
    } catch (error) {
      console.log('Errore verifica salone dalla home:', error);
      if (isSupabaseSchemaCacheLookupError(error)) {
        setCodeTouched(true);
        setSalonAssociationError(
          'Il collegamento al salone e momentaneamente in aggiornamento. Riprova tra pochi secondi.'
        );
        scrollToCodeSection();
        return;
      }
    } finally {
      setIsAssociatingSalon(false);
    }

    const validatedSalonCode = normalizeSalonCodeInput(
      resolvedPortal?.workspace?.salonCode ?? normalizedSalonCode
    );

    if (!validatedSalonCode || !resolvedPortal?.workspace?.id) {
      setCodeTouched(true);
      setSalonAssociationError(
        'Questo salone non esiste o non è ancora attivo. Controlla il codice oppure usa il QR corretto.'
      );
      scrollToCodeSection();
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
  };

  const handleCodeSubmit = (_event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    setCodeTouched(true);
    void associateSalonWithCode();
  };

  const handleCodePress = () => {
    void associateSalonWithCode();
  };

  const openSalonAssociation = () => {
    setCodeTouched(true);
    scrollToCodeSection();
  };

  const openOwnerArea = () => {
    navigateToHref(OWNER_ROUTE);
  };

  const openSavedClientAccess = () => {
    if (!hasAssociatedSalon) {
      setAccessError('Associa prima un salone per poter accedere con il profilo salvato.');
      return;
    }

    const emailDraft = normalizeEmail(accessEmail);
    const phoneDraft = normalizePhone(accessPhone);

    const hasManualCredentials = Boolean(emailDraft && phoneDraft);

    if (hasManualCredentials) {
      setAccessError('');
      navigateToHref({
        pathname: '/cliente',
        params: {
          salon: normalizedAssociatedSalonCode,
          mode: 'booking',
          autologin: '1',
          email: emailDraft,
          phone: phoneDraft,
        },
      });
      return;
    }

    if (!hasSavedClientProfile) {
      setAccessError('Non ho trovato un profilo cliente salvato su questo dispositivo.');
      return;
    }

    if (
      (emailDraft && emailDraft !== savedProfileEmail) ||
      (phoneDraft && phoneDraft !== savedProfilePhone)
    ) {
      setAccessError('I dati inseriti non corrispondono al profilo salvato su questo dispositivo.');
      return;
    }

    setAccessError('');
    navigateToHref({
      pathname: '/cliente',
      params: {
        salon: normalizedAssociatedSalonCode,
        mode: 'booking',
        autologin: '1',
        email: savedProfileEmail,
        phone: savedProfilePhone,
      },
    });
  };

  const openSavedClientBiometricAccess = async () => {
    if (!hasAssociatedSalon) {
      setAccessError('Associa prima un salone per poter usare Face ID.');
      return;
    }

    if (!frontendBiometricEnabled) {
      setAccessError('Attiva prima Face ID dalle impostazioni cliente su questo dispositivo.');
      return;
    }

    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: Platform.OS === 'ios' ? 'Accedi con Face ID' : 'Accedi con impronta',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        return;
      }

      setAccessError('');
      navigateToHref({
        pathname: '/cliente',
        params: {
          salon: normalizedAssociatedSalonCode,
          mode: 'booking',
          autologin: '1',
          biometric: '1',
          email: savedProfileEmail,
          phone: savedProfilePhone,
        },
      });
    } catch (error) {
      console.log('Errore accesso biometrico home cliente:', error);
      setAccessError(
        Platform.OS === 'ios'
          ? 'Non sono riuscito a completare l’accesso con Face ID.'
          : 'Non sono riuscito a completare l’accesso con impronta.'
      );
    }
  };

  const openSalonScanner = () => {
    navigateToHref('/cliente-scanner');
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

  const handleRegisterClient = async () => {
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
      setRegisterError('Inserisci un cellulare valido di 10 cifre.');
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

    setRegisteringClient(true);
    setRegisterError('');

    try {
      const saved = await upsertFrontendCustomerForSalon({
        salonCode: effectiveSalonCode,
        profile: normalizedProfile,
      });

      if (!saved.ok) {
        setRegisterError(
          saved.reason === 'save_failed'
            ? saved.detail?.includes('salon_not_found')
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
      setShowRegisterForm(false);
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
    } finally {
      setRegisteringClient(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTopPadding },
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: Math.min(responsive.contentMaxWidth, 980) }]}> 
          <View style={styles.heroCard}>
            <View style={styles.brandWrap}>
              <View style={styles.heroWordmarkWrap}>
                <AppWordmark />
              </View>
              <View style={styles.heroSalonInlineSection}>
                <Text style={[styles.eyebrow, styles.eyebrowSalon]}>Area salone</Text>
                <Text style={styles.heroSalonInlineText}>
                  Gestisci agenda, clienti, cassa e servizi del tuo salone in un unico back office.
                </Text>
                <TouchableOpacity
                  style={[styles.secondaryButton, styles.heroSecondaryButton, styles.heroSalonButton]}
                  onPress={openOwnerArea}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.secondaryButtonText, styles.heroSalonButtonText]}>
                    Back office salone
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.clientSectionCard}>
            <View style={styles.heroIconRow}>
              <View style={styles.heroIconBadge}>
                <Ionicons name="sparkles" size={18} color="#f8fafc" />
              </View>
              <View style={styles.heroIconBadge}>
                <Ionicons name="calendar-clear" size={18} color="#f8fafc" />
              </View>
              <View style={styles.heroIconBadge}>
                <Ionicons name="phone-portrait" size={17} color="#f8fafc" />
              </View>
            </View>
            <Text style={styles.eyebrow}>Area prenotazioni cliente</Text>
            <Text style={styles.title}>Prenota il tuo appuntamento in pochi secondi</Text>
            <Text style={styles.subtitle}>
              Scegli il tuo salone, prenota il servizio e gestisci facilmente i tuoi appuntamenti.
            </Text>

            <View style={styles.accessCard} onLayout={handleCodeSectionLayout}>
              <Text style={[styles.heroActionLabel, styles.accessEyebrow]}>Area cliente</Text>
              <Text style={styles.accessTitle}>Entra nel tuo salone</Text>
              <Text style={styles.accessSubtitle}>
                Inserisci il codice che ti ha dato il salone per aprire la pagina corretta.
              </Text>

              <Animated.View style={styles.quickAccessCard} layout={CARD_TOGGLE_LAYOUT}>
                <View style={styles.quickAccessHeader}>
                  <View style={styles.quickAccessIconBadge}>
                    <Ionicons name="storefront" size={17} color="#f8fafc" />
                  </View>
                  <View style={styles.quickAccessHeaderTextWrap}>
                    <Text style={styles.quickAccessTitle}>Associa un Salone</Text>
                    <Text style={styles.quickAccessSubtitle}>
                      Collega questa area cliente al salone corretto prima di accedere o prenotare.
                    </Text>
                  </View>
                  {hasAssociatedSalon ? (
                    <TouchableOpacity
                      style={styles.quickAccessCollapseButton}
                      onPress={() => setIsSalonAssociationCardExpanded((current) => !current)}
                      activeOpacity={0.9}
                    >
                      <Ionicons
                        name={isSalonAssociationCardExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#334155"
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.salonAssociationStatusCard,
                    hasAssociatedSalon
                      ? styles.salonAssociationStatusCardActive
                      : styles.salonAssociationStatusCardEmpty,
                  ]}
                >
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

                  {hasAssociatedSalon ? (
                    hasMultipleAssociatedSalons ? (
                      <View style={styles.salonAssociationSelectorWrap}>
                        <Text style={styles.salonAssociationSelectorHint}>
                          Scegli qui il salone cliente da aprire.
                        </Text>
                        <TouchableOpacity
                          style={styles.salonAssociationSelector}
                          onPress={() => setIsSalonSelectorOpen((current) => !current)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={styles.salonAssociationSelectorText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {normalizedAssociatedSalonCode}
                          </Text>
                          <Ionicons
                            name={isSalonSelectorOpen ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#1d4ed8"
                            style={styles.salonAssociationSelectorChevron}
                          />
                        </TouchableOpacity>

                        {isSalonSelectorOpen ? (
                          <View style={styles.salonAssociationSelectorMenu}>
                            {savedSalonCodes.map((code) => {
                              const selected = code === normalizedAssociatedSalonCode;
                              return (
                                <TouchableOpacity
                                  key={code}
                                  style={[
                                    styles.salonAssociationSelectorOption,
                                    selected && styles.salonAssociationSelectorOptionActive,
                                  ]}
                                  onPress={() => {
                                    setSelectedAssociatedSalonCode(code);
                                    setIsSalonSelectorOpen(false);
                                  }}
                                  activeOpacity={0.9}
                                >
                                  <View style={styles.salonAssociationSelectorOptionInner}>
                                    <View style={styles.salonAssociationSelectorOptionSide} />
                                    <Text
                                      style={[
                                        styles.salonAssociationSelectorOptionText,
                                        selected && styles.salonAssociationSelectorOptionTextActive,
                                      ]}
                                      numberOfLines={1}
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.82}
                                    >
                                      {code}
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
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.salonAssociationStatusValue}>
                        {normalizedAssociatedSalonCode}
                      </Text>
                    )
                  ) : (
                    <Text style={styles.salonAssociationStatusHint}>
                      Associa prima il salone tramite codice o QR.
                    </Text>
                  )}
                </View>

                {!hasAssociatedSalon || isSalonAssociationCardExpanded ? (
                  <Animated.View
                    layout={CARD_TOGGLE_LAYOUT}
                    entering={CARD_TOGGLE_ENTER}
                    exiting={CARD_TOGGLE_EXIT}
                  >
                    <TextInput
                      ref={salonCodeRef}
                      style={[styles.codeInput, codeFocused && styles.codeInputFocused, showCodeError && styles.codeInputError]}
                      placeholder="Inserisci codice salone (es. ABC123)"
                      placeholderTextColor="#94a3b8"
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
                    />

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
                        (!normalizedSalonCode || isAssociatingSalon) && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleCodePress}
                      activeOpacity={0.9}
                      disabled={!normalizedSalonCode || isAssociatingSalon}
                    >
                      <View style={styles.codeActionRow}>
                        {isAssociatingSalon ? (
                          <ActivityIndicator size="small" color="#f8fafc" />
                        ) : null}
                        <Text style={styles.primaryButtonText}>
                          {isAssociatingSalon ? 'Verifica salone...' : 'Associa un Salone'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickAccessButton, styles.qrQuickAccessButton]}
                      onPress={openSalonScanner}
                      activeOpacity={0.9}
                    >
                      <View style={styles.quickAccessButtonRow}>
                        <Ionicons name="qr-code-outline" size={18} color="#334155" />
                        <Text style={[styles.quickAccessButtonText, styles.qrQuickAccessButtonText]}>
                          Associa il salone tramite QR-code
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ) : null}
              </Animated.View>

              <View style={styles.quickAccessCard}>
                <View style={styles.quickAccessHeader}>
                  <View style={styles.quickAccessIconBadge}>
                    <Ionicons name="person" size={17} color="#f8fafc" />
                  </View>
                  <View style={styles.quickAccessHeaderTextWrap}>
                    <Text style={styles.quickAccessTitle}>Area Accedi</Text>
                    <Text style={styles.quickAccessSubtitle}>
                      Se hai già fatto la registrazione, puoi entrare senza link o QR.
                    </Text>
                  </View>
                </View>

                <TextInput
                  ref={accessEmailRef}
                  style={[
                    styles.quickAccessInput,
                    !hasAssociatedSalon && styles.quickAccessInputDisabled,
                  ]}
                  placeholder="Email (opzionale)"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={accessEmail}
                  onChangeText={(value) => {
                    setAccessEmail(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="email-address"
                  onFocus={() => scrollToField(accessEmailRef)}
                  editable={hasAssociatedSalon}
                />

                <TextInput
                  ref={accessPhoneRef}
                  style={[
                    styles.quickAccessInput,
                    !hasAssociatedSalon && styles.quickAccessInputDisabled,
                  ]}
                  placeholder="Telefono (opzionale)"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={accessPhone}
                  onChangeText={(value) => {
                    setAccessPhone(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="phone-pad"
                  onFocus={() => scrollToField(accessPhoneRef)}
                  editable={hasAssociatedSalon}
                />

                {!hasAssociatedSalon ? (
                  <Text style={styles.quickAccessWarning}>
                    Per poter accedere, associa prima un salone tramite codice o QR.
                  </Text>
                ) : null}

                {accessError ? <Text style={styles.quickAccessError}>{accessError}</Text> : null}

                <TouchableOpacity
                  style={[
                    styles.quickAccessButton,
                    !hasAssociatedSalon && styles.quickAccessButtonDisabled,
                  ]}
                  onPress={openSavedClientAccess}
                  activeOpacity={0.9}
                  disabled={!hasAssociatedSalon}
                >
                  <Text style={styles.quickAccessButtonText}>Accedi con profilo salvato</Text>
                </TouchableOpacity>

                {Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      styles.quickAccessBiometricButton,
                      !canUseBiometricAccess && styles.quickAccessButtonDisabled,
                    ]}
                    onPress={openSavedClientBiometricAccess}
                    activeOpacity={0.9}
                    disabled={!canUseBiometricAccess}
                  >
                    <View style={styles.quickAccessButtonRow}>
                      {Platform.OS === 'ios' ? (
                        <MaterialCommunityIcons name="face-recognition" size={24} color="#166534" />
                      ) : (
                        <Ionicons name="finger-print-outline" size={22} color="#166534" />
                      )}
                      <Text style={[styles.secondaryButtonText, styles.quickAccessBiometricButtonText]}>
                        {biometricButtonLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.quickAccessButton, styles.quickAccessRegisterToggleButton]}
                  onPress={() => {
                    setShowRegisterForm((current) => {
                      const next = !current;

                      if (next) {
                        requestAnimationFrame(() => {
                          scrollRef.current?.scrollTo({
                            y: Math.max((registerSectionY || codeSectionY + 80) + 180, 0),
                            animated: true,
                          });
                        });
                      } else {
                        requestAnimationFrame(() => {
                          scrollRef.current?.scrollTo({
                            y: Math.max((registerSectionY || codeSectionY + 80) - 110, 0),
                            animated: true,
                          });
                        });
                      }

                      return next;
                    });
                    setRegisterError('');
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.quickAccessButtonText}>
                    {showRegisterForm ? 'Chiudi registrazione' : 'Non hai un profilo? Registrati'}
                  </Text>
                </TouchableOpacity>
                {!hasAssociatedSalon ? (
                  <Text style={styles.quickAccessHint}>
                    Quando associ un salone, da qui puoi accedere oppure registrare subito il cliente nello stesso blocco.
                  </Text>
                ) : null}

                {showRegisterForm ? (
                  <View
                    style={styles.quickAccessRegisterInline}
                    onLayout={(event) => {
                      setRegisterSectionY(event.nativeEvent.layout.y);
                    }}
                  >
                    <View style={styles.quickAccessInlineDivider} />
                    <View style={styles.quickAccessHeader}>
                      <View style={styles.quickAccessIconBadge}>
                        <Ionicons name="person-add" size={17} color="#f8fafc" />
                      </View>
                      <View style={styles.quickAccessHeaderTextWrap}>
                        <Text style={styles.quickAccessTitle}>Registrati nel salone</Text>
                        <Text style={styles.quickAccessSubtitle}>
                          Compila i dati qui sotto e crea subito il profilo cliente per il salone associato.
                        </Text>
                      </View>
                    </View>

                    <TextInput
                      ref={registerNomeRef}
                      style={[
                        styles.quickAccessInput,
                        !hasAssociatedSalon && styles.quickAccessInputDisabled,
                      ]}
                      placeholder="Nome (obbligatorio)"
                      placeholderTextColor="#94a3b8"
                      value={registerProfile.nome}
                      onChangeText={(value) => {
                        setRegisterProfile((current) => ({
                          ...current,
                          nome: formatCustomerNamePart(value),
                        }));
                        if (registerError) setRegisterError('');
                      }}
                      onFocus={() => scrollToField(registerNomeRef)}
                      editable={hasAssociatedSalon}
                      returnKeyType="next"
                      onSubmitEditing={() => registerCognomeRef.current?.focus()}
                    />
                    <TextInput
                      ref={registerCognomeRef}
                      style={[
                        styles.quickAccessInput,
                        !hasAssociatedSalon && styles.quickAccessInputDisabled,
                      ]}
                      placeholder="Cognome (obbligatorio)"
                      placeholderTextColor="#94a3b8"
                      value={registerProfile.cognome}
                      onChangeText={(value) => {
                        setRegisterProfile((current) => ({
                          ...current,
                          cognome: formatCustomerNamePart(value),
                        }));
                        if (registerError) setRegisterError('');
                      }}
                      onFocus={() => scrollToField(registerCognomeRef)}
                      editable={hasAssociatedSalon}
                      returnKeyType="next"
                      onSubmitEditing={() => registerEmailRef.current?.focus()}
                    />
                    <TextInput
                      ref={registerEmailRef}
                      style={[
                        styles.quickAccessInput,
                        !hasAssociatedSalon && styles.quickAccessInputDisabled,
                      ]}
                      placeholder="Mail (obbligatoria)"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={registerProfile.email}
                      onChangeText={(value) => {
                        setRegisterProfile((current) => ({ ...current, email: value }));
                        if (registerError) setRegisterError('');
                      }}
                      editable={hasAssociatedSalon}
                      returnKeyType="next"
                      onSubmitEditing={() => registerPhoneRef.current?.focus()}
                    />
                    <TextInput
                      ref={registerPhoneRef}
                      style={[
                        styles.quickAccessInput,
                        !hasAssociatedSalon && styles.quickAccessInputDisabled,
                      ]}
                      placeholder="Cellulare (obbligatorio)"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      value={registerProfile.telefono}
                      onChangeText={(value) => {
                        setRegisterProfile((current) => ({
                          ...current,
                          telefono: limitPhoneToTenDigits(value),
                        }));
                        if (registerError) setRegisterError('');
                      }}
                      editable={hasAssociatedSalon}
                      returnKeyType="next"
                      onSubmitEditing={() => registerInstagramRef.current?.focus()}
                    />
                    <TextInput
                      ref={registerInstagramRef}
                      style={[
                        styles.quickAccessInput,
                        !hasAssociatedSalon && styles.quickAccessInputDisabled,
                      ]}
                      placeholder="Instagram (facoltativo)"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={registerProfile.instagram}
                      onChangeText={(value) => {
                        setRegisterProfile((current) => ({ ...current, instagram: value }));
                        if (registerError) setRegisterError('');
                      }}
                      editable={hasAssociatedSalon}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />

                    {!hasAssociatedSalon ? (
                      <Text style={styles.quickAccessWarning}>
                        Associa prima un salone per poter registrare il cliente.
                      </Text>
                    ) : null}
                    {registerError ? <Text style={styles.quickAccessError}>{registerError}</Text> : null}

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
                        {registeringClient ? 'Registrazione in corso...' : 'Registrati nel salone'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.benefitsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tutto quello che ti serve, lato cliente</Text>
              <Text style={styles.sectionSubtitle}>Un ingresso semplice per prenotare e tenere tutto sotto controllo.</Text>
            </View>

            <View style={styles.benefitsGrid}>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="sparkles" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Prenota facilmente</Text>
                <Text style={styles.benefitText}>Apri il salone giusto, scegli il servizio e invia la richiesta in pochi passaggi.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="calendar-clear" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Gestisci gli appuntamenti</Text>
                <Text style={styles.benefitText}>Controlla le tue richieste, lo stato delle conferme e le eventuali modifiche.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Resta collegato al tuo salone</Text>
                <Text style={styles.benefitText}>Tieni a portata di mano i riferimenti del salone e torna nella tua area cliente quando vuoi.</Text>
              </View>
            </View>
          </View>

          <View style={styles.reassuranceCard}>
            <Text style={styles.reassuranceTitle}>Una pagina semplice, pensata per i clienti</Text>
            <Text style={styles.reassuranceText}>
              Nessun gestionale complicato, nessuna configurazione tecnica. Qui puoi solo prenotare e gestire i tuoi appuntamenti nel tuo salone di fiducia.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLink}>Privacy</Text>
            <Text style={styles.footerLink}>Supporto</Text>
            <Text style={styles.footerLink}>Contatti</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    flexGrow: 1,
    paddingBottom: 96,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -100,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(14, 116, 144, 0.10)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 20,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  clientSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  brandWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1.12 }],
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  heroSalonInlineSection: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 0,
  },
  heroSalonInlineText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 760,
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
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
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
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 12,
    maxWidth: 760,
    textAlign: 'center',
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
  heroSecondaryButton: {
    minWidth: 188,
    width: '100%',
  },
  heroSalonButton: {
    backgroundColor: '#FFF6D8',
    borderColor: 'rgba(196, 154, 20, 0.24)',
  },
  heroSalonButtonText: {
    color: '#5F4700',
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
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
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
  quickAccessCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 28,
  },
  salonAssociationSelectorChevron: {
    position: 'absolute',
    right: 14,
  },
  salonAssociationSelectorMenu: {
    width: '100%',
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.12)',
  },
  salonAssociationSelectorOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  salonAssociationSelectorOptionInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
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
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginBottom: 8,
    width: '100%',
    textAlign: 'center',
  },
  quickAccessInputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94a3b8',
  },
  quickAccessError: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
  },
  quickAccessWarning: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
    fontWeight: '700',
  },
  quickAccessButton: {
    backgroundColor: '#0F172A',
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
    marginTop: 10,
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
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
    color: '#166534',
  },
  quickAccessHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    borderColor: '#dc2626',
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
    marginBottom: 24,
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
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 250,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    minHeight: 188,
    alignItems: 'center',
  },
  benefitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
    shadowColor: '#020617',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  benefitText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
  },
  reassuranceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 30,
    marginBottom: 24,
    alignItems: 'center',
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
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 10,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  nativeRedirectFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f6f3',
  },
});
