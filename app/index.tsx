import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    Keyboard,
    KeyboardEvent,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { useAppContext } from '../src/context/AppContext';
import { formatCustomerNamePart } from '../src/lib/customer-name';
import { appFonts } from '../src/lib/fonts';
import { useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { normalizeSalonCode } from '../src/lib/platform';
import { useResponsiveLayout } from '../src/lib/responsive';
import ClienteFrontendScreen from './cliente-screen';

const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';

const normalizeSalonCodeInput = (value: string) =>
  value
    .trimStart()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 36);
const BACKOFFICE_ROUTE = '/agenda' as Href;
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_SAVED_SALON_CODES_KEY = 'salon_manager_frontend_saved_salon_codes';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const buildFrontendBiometricProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized
    ? `${FRONTEND_BIOMETRIC_PROFILE_KEY}:${normalized}`
    : FRONTEND_BIOMETRIC_PROFILE_KEY;
};
const buildFrontendProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized
    ? `${FRONTEND_PROFILE_KEY}:${normalized}`
    : FRONTEND_PROFILE_KEY;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D+/g, '');
const resolvePublicClientBaseUrl = () => {
  const expoExtra =
    (Constants.expoConfig?.extra as { publicClientBaseUrl?: string } | undefined) ?? undefined;
  const manifestExtra =
    ((Constants as typeof Constants & {
      manifest?: { extra?: { publicClientBaseUrl?: string } };
    }).manifest?.extra as { publicClientBaseUrl?: string } | undefined) ?? undefined;
  const manifest2Extra =
    ((Constants as typeof Constants & {
      manifest2?: { extra?: { expoClient?: { extra?: { publicClientBaseUrl?: string } } } };
    }).manifest2?.extra?.expoClient?.extra as { publicClientBaseUrl?: string } | undefined) ??
    undefined;

  const configuredBaseUrl =
    expoExtra?.publicClientBaseUrl ??
    manifestExtra?.publicClientBaseUrl ??
    manifest2Extra?.publicClientBaseUrl ??
    DEFAULT_PUBLIC_CLIENT_BASE_URL;
  const normalizedValue = configuredBaseUrl?.trim().replace(/\/+$/, '');

  if (!normalizedValue) {
    return DEFAULT_PUBLIC_CLIENT_BASE_URL;
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`
    );
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_PUBLIC_CLIENT_BASE_URL;
  }
};

const buildPublicClientUrl = (
  pathname = '',
  params?: Record<string, string | null | undefined>
) => {
  const baseUrl = resolvePublicClientBaseUrl();
  const url = new URL(
    pathname ? `${baseUrl}/${pathname.replace(/^\/+/, '')}` : `${baseUrl}/`
  );

  Object.entries(params ?? {}).forEach(([key, value]) => {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) return;
    url.searchParams.set(key, normalizedValue);
  });

  return url.toString();
};

const buildNativeClientHref = (
  pathname = '/cliente-screen',
  params?: Record<string, string | null | undefined>
): Href => {
  const normalizedParams = Object.entries(params ?? {}).reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      const normalizedValue = String(value ?? '').trim();
      if (!normalizedValue) {
        return accumulator;
      }

      accumulator[key] = normalizedValue;
      return accumulator;
    },
    {}
  );

  return {
    pathname: pathname as Href,
    params: normalizedParams,
  } as Href;
};

const openPublicClientInApp = async (url: string, errorMessage: string) => {
  try {
    if (Platform.OS === 'web') {
      window.location.assign(url);
      return;
    }

    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: '#0F172A',
      showTitle: true,
      enableBarCollapsing: true,
    });
  } catch {
    Alert.alert('Link non disponibile', errorMessage);
  }
};
const buildSavedSalonCodeList = (values: Array<string | null | undefined>) =>
  values
    .map((value) => normalizeSalonCode(value ?? ''))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
const areStringListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export default function PublicClientLandingScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    mode?: string | string[];
    email?: string | string[];
    phone?: string | string[];
    autologin?: string | string[];
    biometric?: string | string[];
  }>();
  const responsive = useResponsiveLayout();
  const { isAuthenticated, isLoaded, hasInitializedAuth, resolveSalonByCode } = useAppContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const accessEmailRef = useRef<TextInput | null>(null);
  const accessPhoneRef = useRef<TextInput | null>(null);
  const salonCodeRef = useRef<TextInput | null>(null);
  const [salonCode, setSalonCode] = useState('');
  const [codeSectionY, setCodeSectionY] = useState(0);
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [salonCodeActionMessage, setSalonCodeActionMessage] = useState('');
  const [salonCodeActionIsError, setSalonCodeActionIsError] = useState(false);
  const [savedProfileEmail, setSavedProfileEmail] = useState('');
  const [savedProfilePhone, setSavedProfilePhone] = useState('');
  const [savedSalonCode, setSavedSalonCode] = useState('');
  const [savedSalonCodes, setSavedSalonCodes] = useState<string[]>([]);
  const [savedSalonMenuOpen, setSavedSalonMenuOpen] = useState(false);
  const [hasSavedClientProfile, setHasSavedClientProfile] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPhone, setAccessPhone] = useState('');
  const [accessError, setAccessError] = useState('');
  const [frontendBiometricEnabled, setFrontendBiometricEnabled] = useState(false);
  const [frontendBiometricAvailable, setFrontendBiometricAvailable] = useState(false);
  const [frontendBiometricBusy, setFrontendBiometricBusy] = useState(false);
  const [frontendBiometricType, setFrontendBiometricType] = useState<'faceid' | 'fingerprint' | 'none'>('none');
  const [hasSavedBiometricProfile, setHasSavedBiometricProfile] = useState(false);
  const [footerSalonInfo, setFooterSalonInfo] = useState<{
    salonName: string;
    businessPhone: string;
    salonAddress: string;
  } | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const authRedirectLockRef = useRef(false);
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 28,
  });

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);
  const showCodeError = codeTouched && normalizedSalonCode === '';
  const isTypedSalonAlreadySaved = useMemo(
    () => Boolean(normalizedSalonCode) && savedSalonCodes.includes(normalizedSalonCode),
    [normalizedSalonCode, savedSalonCodes]
  );
  const showMissingSalonWarning = !savedSalonCode;
  const hasEmbeddedClientFlow = useMemo(() => {
    const mode = Array.isArray(searchParams.mode) ? searchParams.mode[0] ?? '' : searchParams.mode ?? '';
    const hasEmail = Boolean(Array.isArray(searchParams.email) ? searchParams.email[0] : searchParams.email);
    const hasPhone = Boolean(Array.isArray(searchParams.phone) ? searchParams.phone[0] : searchParams.phone);
    const hasAutoLogin = (Array.isArray(searchParams.autologin) ? searchParams.autologin[0] : searchParams.autologin) === '1';
    const hasBiometric = (Array.isArray(searchParams.biometric) ? searchParams.biometric[0] : searchParams.biometric) === '1';

    return mode === 'login' || mode === 'register' || mode === 'booking' || hasEmail || hasPhone || hasAutoLogin || hasBiometric;
  }, [searchParams.autologin, searchParams.biometric, searchParams.email, searchParams.mode, searchParams.phone]);
  const hasIncomingSalonParam = useMemo(
    () =>
      Boolean(
        normalizeSalonCode(
          Array.isArray(searchParams.salon) ? searchParams.salon[0] ?? '' : searchParams.salon ?? ''
        )
      ),
    [searchParams.salon]
  );
  const isClientDirectedWebEntry = Platform.OS === 'web' && (hasIncomingSalonParam || hasEmbeddedClientFlow);

  useEffect(() => {
    const salonFromParams = normalizeSalonCode(
      Array.isArray(searchParams.salon) ? searchParams.salon[0] ?? '' : searchParams.salon ?? ''
    );

    if (!salonFromParams) {
      return;
    }

    setSalonCode((currentValue) => (currentValue.trim() ? currentValue : salonFromParams));
  }, [searchParams.salon]);

  useEffect(() => {
    const salonFromParams = normalizeSalonCode(
      Array.isArray(searchParams.salon) ? searchParams.salon[0] ?? '' : searchParams.salon ?? ''
    );

    if (!salonFromParams) {
      return;
    }

    const nextSavedSalons = buildSavedSalonCodeList([salonFromParams, ...savedSalonCodes]);
    const needsSavedSalonUpdate = savedSalonCode !== salonFromParams;
    const needsSavedSalonListUpdate = !areStringListsEqual(nextSavedSalons, savedSalonCodes);

    if (!needsSavedSalonUpdate && !needsSavedSalonListUpdate) {
      return;
    }

    if (needsSavedSalonUpdate) {
      setSavedSalonCode(salonFromParams);
    }

    if (needsSavedSalonListUpdate) {
      setSavedSalonCodes(nextSavedSalons);
    }

    AsyncStorage.multiSet([
      [FRONTEND_LAST_SALON_CODE_KEY, salonFromParams],
      [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalons)],
    ]).catch((error) => {
      console.log('Errore salvataggio salone diretto da link:', error);
    });
  }, [savedSalonCode, savedSalonCodes, searchParams.salon]);

  useEffect(() => {
    const salonFromParams = normalizeSalonCode(
      Array.isArray(searchParams.salon) ? searchParams.salon[0] ?? '' : searchParams.salon ?? ''
    );

    if (!salonFromParams || hasEmbeddedClientFlow) {
      return;
    }

    router.replace(`/join/${encodeURIComponent(salonFromParams)}`);
  }, [hasEmbeddedClientFlow, router, searchParams.salon]);

  useEffect(() => {
    const loadSavedClientSession = async () => {
      try {
        const [legacySavedProfileRaw, savedSalonRaw, savedSalonCodesRaw, biometricEnabledRaw] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_SAVED_SALON_CODES_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY),
        ]);

        const normalizedSalon = normalizeSalonCode(savedSalonRaw ?? '');
        const parsedSavedSalonCodes = (() => {
          try {
            const parsed = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
            return Array.isArray(parsed)
              ? buildSavedSalonCodeList([normalizedSalon, ...(parsed as string[])])
              : buildSavedSalonCodeList([normalizedSalon]);
          } catch {
            return buildSavedSalonCodeList([normalizedSalon]);
          }
        })();
        const activeSavedSalon = normalizedSalon || parsedSavedSalonCodes[0] || '';

        setSavedSalonCodes(parsedSavedSalonCodes);
        setSavedSalonCode(activeSavedSalon);
        setSalonCode((currentValue) => (currentValue.trim() ? currentValue : activeSavedSalon));
        const scopedSavedProfileRaw = activeSavedSalon
          ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(activeSavedSalon))
          : null;
        const scopedBiometricProfileRaw = activeSavedSalon
          ? await AsyncStorage.getItem(buildFrontendBiometricProfileKeyForSalon(activeSavedSalon))
          : null;
        const fallbackBiometricProfileRaw = await AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY);
        setHasSavedBiometricProfile(Boolean(scopedBiometricProfileRaw ?? fallbackBiometricProfileRaw));
        const biometricProfileRaw = scopedBiometricProfileRaw ?? fallbackBiometricProfileRaw;
        const savedProfileRaw = scopedSavedProfileRaw ?? legacySavedProfileRaw ?? biometricProfileRaw;
        setFrontendBiometricEnabled(biometricEnabledRaw === 'true');

        if (!savedProfileRaw) {
          return;
        }

        const parsed = JSON.parse(savedProfileRaw) as {
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

        if (!hasValidProfile) {
          return;
        }

        setHasSavedClientProfile(true);
        setSavedProfileEmail(email);
        setSavedProfilePhone(phone);
      } catch (error) {
        console.log('Errore caricamento accesso rapido cliente:', error);
      }
    };

    void loadSavedClientSession();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const loadBiometricAvailability = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const available = hasHardware && isEnrolled;
        setFrontendBiometricAvailable(available);

        if (!available) {
          setFrontendBiometricType('none');
          return;
        }

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        setFrontendBiometricType(hasFace ? 'faceid' : 'fingerprint');
      } catch (error) {
        console.log('Errore disponibilita biometria landing cliente:', error);
        setFrontendBiometricAvailable(false);
        setFrontendBiometricType('none');
      }
    };

    void loadBiometricAvailability();
  }, []);

  useEffect(() => {
    if (savedSalonCodes.length <= 1 && savedSalonMenuOpen) {
      setSavedSalonMenuOpen(false);
    }
  }, [savedSalonCodes.length, savedSalonMenuOpen]);

  useEffect(() => {
    if (!isAuthenticated || !isLoaded || !hasInitializedAuth || authRedirectLockRef.current) {
      return;
    }

    authRedirectLockRef.current = true;
    router.replace(BACKOFFICE_ROUTE);
  }, [hasInitializedAuth, isAuthenticated, isLoaded, router]);

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

  useEffect(() => {
    if (!savedSalonCode) {
      setFooterSalonInfo(null);
      return;
    }

    let active = true;

    const loadFooterSalonInfo = async () => {
      try {
        const resolved = await resolveSalonByCode(savedSalonCode);
        if (!active || !resolved?.workspace) {
          return;
        }

        setFooterSalonInfo({
          salonName: resolved.workspace.salonName?.trim() || 'Salone attivo',
          businessPhone: resolved.workspace.businessPhone?.trim() || '',
          salonAddress: resolved.workspace.salonAddress?.trim() || '',
        });
      } catch {
        if (active) {
          setFooterSalonInfo(null);
        }
      }
    };

    void loadFooterSalonInfo();

    return () => {
      active = false;
    };
  }, [resolveSalonByCode, savedSalonCode]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleShow = (event: KeyboardEvent) => {
      setKeyboardInset(event.endCoordinates?.height ?? 0);
    };
    const handleHide = () => {
      setKeyboardInset(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (!hasInitializedAuth || !isLoaded) {
    return (
      <View style={styles.nativeRedirectFallback}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <View style={styles.nativeRedirectFallback}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (typeof href === 'string') {
        window.location.assign(href);
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
      window.location.assign(nextUrl);
      return;
    }

    router.push(href);
  };

  const persistSelectedSalonCode = (nextSalonCode: string) => {
    const nextSavedSalons = buildSavedSalonCodeList([nextSalonCode, ...savedSalonCodes]);
    setSavedSalonCodes(nextSavedSalons);
    setSavedSalonCode(nextSalonCode);
    AsyncStorage.multiSet([
      [FRONTEND_LAST_SALON_CODE_KEY, nextSalonCode],
      [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalons)],
    ]).catch((error) => {
      console.log('Errore salvataggio nuovo salone cliente:', error);
    });
  };

  const validateSalonCodeOnServer = async (nextSalonCode: string) => {
    try {
      const resolved = await resolveSalonByCode(nextSalonCode);
      return Boolean(resolved?.workspace?.salonCode);
    } catch {
      return false;
    }
  };

  const openSalonJoinEntry = (nextSalonCode: string) => {
    navigateToHref({
      pathname: '/cliente-screen',
      params: {
        salon: nextSalonCode,
        mode: 'booking',
      },
    });
  };

  const addSalonFromCode = async () => {
    setCodeTouched(true);
    if (!normalizedSalonCode) {
      scrollToCodeSection();
      return;
    }

    if (isTypedSalonAlreadySaved) {
      setSavedSalonCode(normalizedSalonCode);
      setSalonCodeActionIsError(false);
      setSalonCodeActionMessage('');
      openSalonJoinEntry(normalizedSalonCode);
      return;
    }

    const salonExists = await validateSalonCodeOnServer(normalizedSalonCode);
    if (!salonExists) {
      setSalonCodeActionIsError(true);
      setSalonCodeActionMessage(
        'Questo codice salone non esiste sul server. Controlla il codice oppure chiedi di nuovo il QR o il codice corretto al salone.'
      );
      return;
    }

    persistSelectedSalonCode(normalizedSalonCode);
    setSalonCodeActionIsError(false);
    setSalonCodeActionMessage('');
    openSalonJoinEntry(normalizedSalonCode);
  };

  const handleCodePress = () => {
    void addSalonFromCode();
  };

  const openManualRegistrationWithCode = async () => {
    setCodeTouched(true);
    if (!normalizedSalonCode) {
      scrollToCodeSection();
      return;
    }

    if (isTypedSalonAlreadySaved) {
      setSavedSalonCode(normalizedSalonCode);
      setSalonCodeActionIsError(true);
      setSalonCodeActionMessage(
        'Questo salone è già presente in Salone attivo su questo dispositivo. Non apro la registrazione manuale: usa Accedi oppure inserisci un codice diverso.'
      );
      return;
    }

    const salonExists = await validateSalonCodeOnServer(normalizedSalonCode);
    if (!salonExists) {
      setSalonCodeActionIsError(true);
      setSalonCodeActionMessage(
        'Questo codice salone non esiste sul server. Non apro la registrazione: controlla il codice oppure chiedi al salone quello corretto.'
      );
      return;
    }

    setSalonCodeActionIsError(false);
    setSalonCodeActionMessage('');
    openSalonJoinEntry(normalizedSalonCode);
  };

  const openClientArea = () => {
    setSalonCodeActionMessage('');
    setSalonCodeActionIsError(false);
    if (Platform.OS !== 'web') {
      navigateToHref('/cliente-scanner');
      return;
    }

    navigateToHref('/cliente-scanner');
  };

  const openOwnerArea = () => {
    if (Platform.OS === 'web') {
      navigateToHref('/proprietario?entry=desktop');
      return;
    }

    navigateToHref('/proprietario');
  };

  const openSavedClientAccess = async () => {
    const emailDraft = normalizeEmail(accessEmail);
    const phoneDraft = normalizePhone(accessPhone);

    if (!emailDraft || !phoneDraft) {
      setAccessError('Per accedere inserisci sia email sia numero di telefono.');
      return;
    }

    if (hasSavedClientProfile && (emailDraft !== savedProfileEmail || phoneDraft !== savedProfilePhone)) {
      setAccessError(
        savedSalonCodes.length > 1
          ? 'Credenziali errate per questo salone. Seleziona un altro salone salvato su questo dispositivo e prova a riaccedere.'
          : 'Credenziali errate per questo salone. Controlla i dati del profilo gia registrato.'
      );
      return;
    }

    if (!savedSalonCode) {
      setAccessError('Nessun salone collegato. Vai su Inserisci codice salone, scrivi il codice e poi tocca Seleziona salone.');
      return;
    }

    setAccessError('');

    try {
      const resolved = await resolveSalonByCode(savedSalonCode);
      const workspace = resolved?.workspace;
      const clienti = resolved?.clienti ?? [];

      if (!workspace?.salonCode) {
        setAccessError('Non riesco a trovare il salone selezionato. Riprova tra un attimo.');
        return;
      }

      const matchedCustomer = clienti.find((item) => {
        const sameEmail = normalizeEmail(item.email ?? '') === emailDraft;
        const samePhone = normalizePhone(item.telefono ?? '') === phoneDraft;
        return sameEmail && samePhone;
      });

      if (!matchedCustomer) {
        setAccessError(
          savedSalonCodes.length > 1
            ? 'Credenziali errate per questo salone. Seleziona un altro salone salvato su questo dispositivo e prova a riaccedere.'
            : 'Credenziali errate per questo salone. Controlla i dati del profilo gia registrato.'
        );
        return;
      }

      const nameParts = matchedCustomer.nome.trim().split(/\s+/).filter(Boolean);
      const nextProfile = {
        nome: formatCustomerNamePart(nameParts.shift() ?? ''),
        cognome: formatCustomerNamePart(nameParts.join(' ')),
        email: normalizeEmail(matchedCustomer.email ?? '') || emailDraft,
        telefono: normalizePhone(matchedCustomer.telefono ?? '') || phoneDraft,
        instagram: matchedCustomer.instagram?.trim() ?? '',
      };

      const nextSavedSalons = buildSavedSalonCodeList([workspace.salonCode, ...savedSalonCodes]);

      await AsyncStorage.multiSet([
        [FRONTEND_PROFILE_KEY, JSON.stringify(nextProfile)],
        [buildFrontendProfileKeyForSalon(workspace.salonCode), JSON.stringify(nextProfile)],
        [FRONTEND_LAST_SALON_CODE_KEY, workspace.salonCode],
        [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalons)],
      ]);

      setHasSavedClientProfile(true);
      setSavedProfileEmail(nextProfile.email);
      setSavedProfilePhone(nextProfile.telefono);
      setSavedSalonCode(workspace.salonCode);
      setSavedSalonCodes(nextSavedSalons);
      setSalonCode(workspace.salonCode);

      if (Platform.OS !== 'web') {
        navigateToHref(
          buildNativeClientHref('/cliente-screen', {
            salon: workspace.salonCode,
            mode: 'booking',
            email: nextProfile.email,
            phone: nextProfile.telefono,
            autologin: '1',
          })
        );
        return;
      }

      navigateToHref({
        pathname: '/cliente-screen',
        params: {
          salon: workspace.salonCode,
          mode: 'booking',
          email: nextProfile.email,
          phone: nextProfile.telefono,
          autologin: '1',
        },
      });
    } catch (error) {
      console.log('Errore accesso cliente rapido:', error);
      setAccessError('Non sono riuscito ad aprire il profilo cliente di questo salone. Riprova.');
    }
  };

  const openBiometricSavedAccess = async () => {
    if (Platform.OS === 'web') {
      return;
    }

    if (!hasSavedBiometricProfile) {
      setAccessError('Non ho trovato un profilo biometrico cliente salvato su questo dispositivo.');
      return;
    }

    if (!frontendBiometricAvailable) {
      setAccessError('Face ID o biometria non disponibili su questo dispositivo.');
      return;
    }

    setFrontendBiometricBusy(true);
    setAccessError('');

    try {
      const [savedBiometricProfile, savedBiometricSalonCode] = await Promise.all([
        AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY),
        AsyncStorage.getItem(FRONTEND_BIOMETRIC_SALON_CODE_KEY),
      ]);

      if (!savedBiometricProfile) {
        setAccessError('Non ho trovato un profilo biometrico cliente salvato su questo dispositivo.');
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage:
          frontendBiometricType === 'faceid'
            ? 'Accedi con Face ID'
            : 'Accedi con biometria',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        return;
      }

      const biometricSalonCode = normalizeSalonCode(savedBiometricSalonCode || savedSalonCode) || undefined;

      navigateToHref(
        buildNativeClientHref('/cliente-screen', {
          salon: biometricSalonCode,
          biometric: '1',
          mode: 'booking',
        })
      );

      return;
    } catch (error) {
      console.log('Errore accesso biometrico landing cliente:', error);
      setAccessError('Non sono riuscito a completare l’accesso biometrico.');
    } finally {
      setFrontendBiometricBusy(false);
    }
  };

  const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
  const showFooterError = (message: string) => {
    if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
      globalThis.alert(message);
      return;
    }

    Alert.alert('Contatti', message);
  };

  const handleFooterPrivacy = () => {
    const salonName = footerSalonInfo?.salonName || 'salone attivo';
    const phone = footerSalonInfo?.businessPhone || 'non disponibile';
    const address = footerSalonInfo?.salonAddress || 'non disponibile';
    const message =
      `Privacy e trattamento dati del ${salonName}.\n\n` +
      `Contatto: ${phone}\n` +
      `Indirizzo: ${address}\n\n` +
      `Per richieste privacy usa i contatti del salone attivo.`;

    if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
      globalThis.alert(message);
      return;
    }

    Alert.alert('Privacy', message);
  };

  const handleFooterSupport = async () => {
    const dialablePhone = buildDialablePhone(footerSalonInfo?.businessPhone || '').replace(/^\+/, '');
    if (!dialablePhone) {
      showFooterError('Apri prima un salone con codice o QR per usare supporto e contatti.');
      return;
    }

    const text = encodeURIComponent('Ciao, ho bisogno di supporto dall’app SalonPro.');
    const appUrl = `whatsapp://send?phone=${dialablePhone}&text=${text}`;
    const webUrl = `https://wa.me/${dialablePhone}?text=${text}`;

    try {
      if (await Linking.canOpenURL(appUrl)) {
        await Linking.openURL(appUrl);
        return;
      }

      await Linking.openURL(webUrl);
    } catch {
      showFooterError('Non sono riuscito ad aprire WhatsApp del salone attivo.');
    }
  };

  const handleFooterContacts = async () => {
    const dialablePhone = buildDialablePhone(footerSalonInfo?.businessPhone || '');
    if (!dialablePhone) {
      showFooterError('Apri prima un salone con codice o QR per usare supporto e contatti.');
      return;
    }

    try {
      if (!(await Linking.canOpenURL(`tel:${dialablePhone}`))) {
        showFooterError('Questo dispositivo non può aprire la chiamata del salone attivo.');
        return;
      }

      await Linking.openURL(`tel:${dialablePhone}`);
    } catch {
      showFooterError('Non sono riuscito ad aprire il contatto telefonico del salone attivo.');
    }
  };

  if (Platform.OS === 'web' && hasEmbeddedClientFlow) {
    return <ClienteFrontendScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: responsive.horizontalPadding,
            paddingBottom: 96 + Math.max(0, keyboardInset - 32),
          },
        ]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: Math.min(responsive.contentMaxWidth, 980) }]}> 
          {!isClientDirectedWebEntry ? (
            <View style={styles.heroCard}>
              <View style={styles.brandWrap}>
                <View style={styles.heroWordmarkWrap}>
                  <AppWordmark />
                </View>
                <View style={styles.heroSalonIconRow}>
                  <View style={styles.heroSalonIconBadge}>
                    <Ionicons name="storefront-outline" size={18} color="#f8fafc" />
                  </View>
                  <View style={styles.heroSalonIconBadge}>
                    <Ionicons name="calendar-clear-outline" size={18} color="#f8fafc" />
                  </View>
                  <View style={styles.heroSalonIconBadge}>
                    <Ionicons name="people-outline" size={18} color="#f8fafc" />
                  </View>
                </View>
                <View style={styles.heroSalonInlineSection}>
                  <Text style={[styles.eyebrow, styles.eyebrowSalon]}>Area salone</Text>
                  <Text style={styles.heroSalonInlineTitle}>Gestisci il tuo salone in un unico back office</Text>
                  <Text style={styles.heroSalonInlineText}>
                    Gestisci agenda, clienti, cassa e servizi del tuo salone in un unico back office.
                  </Text>
                  <View style={styles.heroSalonButtonsWrap}>
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.heroDesktopPrimaryButton]}
                      onPress={openOwnerArea}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.primaryButtonText}>Entra nel BackOffice Salone</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

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
                  style={styles.quickAccessInput}
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  value={accessEmail}
                  onChangeText={(value) => {
                    setAccessEmail(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="email-address"
                  onFocus={() => scrollToField(accessEmailRef)}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => focusField(accessPhoneRef)}
                />

                <TextInput
                  ref={accessPhoneRef}
                  style={styles.quickAccessInput}
                  placeholder="Telefono"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  value={accessPhone}
                  onChangeText={(value) => {
                    setAccessPhone(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="phone-pad"
                  onFocus={() => scrollToField(accessPhoneRef)}
                  returnKeyType="done"
                  onSubmitEditing={openSavedClientAccess}
                />

                {accessError ? <Text style={styles.quickAccessError}>{accessError}</Text> : null}

                <TouchableOpacity style={styles.quickAccessButton} onPress={openSavedClientAccess} activeOpacity={0.9}>
                  <Text style={styles.quickAccessButtonText}>Accedi con profilo salvato</Text>
                </TouchableOpacity>

                {Platform.OS !== 'web' &&
                frontendBiometricEnabled &&
                frontendBiometricAvailable &&
                hasSavedBiometricProfile ? (
                  <TouchableOpacity
                    style={[
                      styles.quickAccessBiometricButton,
                      frontendBiometricBusy && styles.quickAccessBiometricButtonDisabled,
                    ]}
                    onPress={() => {
                      void openBiometricSavedAccess();
                    }}
                    activeOpacity={0.9}
                    disabled={frontendBiometricBusy}
                  >
                    <View style={styles.quickAccessBiometricContent}>
                      <View style={styles.quickAccessBiometricIconWrap}>
                        {frontendBiometricType === 'faceid' ? (
                          <MaterialCommunityIcons
                            name="face-recognition"
                            size={24}
                            color="#2563EB"
                            style={styles.quickAccessBiometricFaceIcon}
                          />
                        ) : (
                          <Ionicons name="finger-print-outline" size={18} color="#0F172A" />
                        )}
                      </View>
                      <View style={styles.quickAccessBiometricTextWrap}>
                        <Text style={styles.quickAccessBiometricTitle}>
                          {frontendBiometricBusy
                            ? 'Verifica biometrica...'
                            : frontendBiometricType === 'faceid'
                              ? 'Accedi con Face ID / codice dispositivo'
                              : 'Accedi con biometria / codice dispositivo'}
                        </Text>
                        <Text style={styles.quickAccessBiometricHint}>
                          Accesso rapido con profilo gia salvato su questo dispositivo.
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.quickAccessHint}>
                  Se hai già un profilo cliente registrato, inserisci email e telefono e rientra nel salone corretto.
                </Text>
              </View>

              <TextInput
                ref={salonCodeRef}
                style={[styles.codeInput, codeFocused && styles.codeInputFocused, showCodeError && styles.codeInputError]}
                placeholder="Inserisci codice salone (es. barberia-roma)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                value={salonCode}
                onChangeText={(value) => {
                  setSalonCode(normalizeSalonCodeInput(value));
                  setSalonCodeActionMessage('');
                  setSalonCodeActionIsError(false);
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
                onSubmitEditing={handleCodePress}
              />

              {showCodeError ? (
                <Text style={styles.codeErrorText}>Inserisci un codice salone per continuare.</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, styles.clientEnterSalonButton, !normalizedSalonCode && styles.primaryButtonDisabled]}
                onPress={handleCodePress}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>Entra nel salone</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.clientQrInfoButton, styles.clientQrSecondaryButton]} onPress={openClientArea} activeOpacity={0.88}>
                <View style={styles.clientQrInfoIconWrap}>
                  <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.clientQrInfoTextWrap}>
                  <Text style={styles.clientQrInfoButtonText}>Inquadra il QR del salone</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

        <View style={styles.footer}>
            <TouchableOpacity onPress={handleFooterPrivacy} activeOpacity={0.8}>
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleFooterSupport()} activeOpacity={0.8}>
              <Text style={styles.footerLink}>Supporto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleFooterContacts()} activeOpacity={0.8}>
              <Text style={styles.footerLink}>Contatti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {Platform.OS !== 'web' ? (
        <Modal
          visible={hasEmbeddedClientFlow}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            router.replace('/cliente-scanner');
          }}
        >
          <ClienteFrontendScreen />
        </Modal>
      ) : null}
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
    paddingTop: 56,
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
  heroSalonIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  heroSalonIconBadge: {
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
    marginTop: 2,
    marginBottom: 0,
  },
  heroSalonButtonsWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  heroSalonInlineTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 760,
  },
  heroSalonInlineText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 760,
  },
  heroDesktopPrimaryButton: {
    minHeight: 62,
    maxWidth: 520,
    width: '100%',
  },
  heroAppSecondaryButton: {
    minHeight: 58,
    maxWidth: 520,
    width: '100%',
    borderColor: '#C8D8EA',
    backgroundColor: '#FFF7E8',
  },
  heroAppSecondaryButtonText: {
    color: '#7C5A12',
    fontWeight: '900',
  },
  heroDesktopHintCard: {
    width: '100%',
    marginTop: 12,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#D9E7F6',
  },
  heroDesktopHintTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroDesktopHintText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  manualSalonAttachButton: {
    width: '100%',
    marginBottom: 12,
    backgroundColor: '#EEF6FF',
    borderColor: '#BFD8F6',
  },
  manualSalonAttachButtonText: {
    color: '#1D4ED8',
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
  clientEnterSalonButton: {
    marginBottom: 18,
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
  clientUnifiedAccessCard: {
    width: '100%',
    maxWidth: 720,
    marginTop: 18,
    borderRadius: 32,
    backgroundColor: 'rgba(252, 253, 255, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(189, 203, 220, 0.34)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
    overflow: 'visible',
  },
  clientUnifiedAccessBlock: {
    width: '100%',
    alignItems: 'center',
  },
  clientUnifiedAccessPrimaryBlock: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  clientUnifiedAccessBlockPopup: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(189, 199, 214, 0.32)',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#A8B6C8',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  clientUnifiedAccessBlockPopupSoft: {
    backgroundColor: '#FCFDFE',
  },
  clientUnifiedAccessDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(226, 232, 240, 0.92)',
    marginTop: 12,
    marginBottom: 10,
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
    marginBottom: 14,
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
  clientQrInfoButton: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  clientQrSecondaryButton: {
    marginTop: 4,
  },
  clientQrInfoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clientQrInfoTextWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientQrInfoButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
  },
  quickAccessFloatingWrap: {
    width: '100%',
    marginTop: 0,
    marginBottom: 0,
    alignItems: 'stretch',
    position: 'relative',
  },
  quickAccessFloatingCard: {
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickAccessHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
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
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
  },
  quickAccessInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginBottom: 12,
    width: '100%',
    textAlign: 'center',
  },
  quickAccessError: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
  },
  quickAccessButton: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    minHeight: 56,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  quickAccessButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  quickAccessBiometricButton: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: '#FAFCFF',
    borderWidth: 1,
    borderColor: '#D9E5F2',
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickAccessBiometricButtonDisabled: {
    opacity: 0.56,
  },
  quickAccessBiometricIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#F3F7FF',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
    flexShrink: 0,
  },
  quickAccessBiometricFaceIcon: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  quickAccessBiometricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  quickAccessBiometricTextWrap: {
    flex: 1,
    maxWidth: 300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  quickAccessBiometricTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  quickAccessBiometricHint: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  quickAccessBiometricStatus: {
    marginTop: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessBiometricStatusText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#0F766E',
    textAlign: 'center',
  },
  quickAccessHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
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
  savedSalonSuggestionCard: {
    width: '100%',
    maxWidth: 520,
    marginTop: 14,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  savedSalonSuggestionEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#1D4ED8',
    marginBottom: 4,
    textAlign: 'center',
  },
  savedSalonSuggestionCode: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  savedSalonSuggestionName: {
    marginTop: 4,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    color: '#1b2a42',
    textAlign: 'center',
    fontFamily: appFonts.displayScript,
    textShadowColor: 'rgba(15, 23, 42, 0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  savedSalonSuggestionHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  savedSalonSelectorButton: {
    width: '100%',
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  savedSalonSelectorButtonStatic: {
    paddingRight: 16,
  },
  savedSalonSelectorButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#1E40AF',
    textAlign: 'center',
  },
  savedSalonsSelectorWrap: {
    width: '100%',
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  savedSalonChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  savedSalonChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
  },
  savedSalonChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  savedSalonChipTextActive: {
    color: '#1D4ED8',
  },
  savedSalonSuggestionButton: {
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  savedSalonSuggestionButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#1E40AF',
    textAlign: 'center',
  },
  missingSalonCard: {
    width: '100%',
    maxWidth: 520,
    marginTop: 14,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  missingSalonEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#DC2626',
    marginBottom: 6,
    textAlign: 'center',
  },
  missingSalonTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#991B1B',
    textAlign: 'center',
  },
  missingSalonHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#7F1D1D',
    textAlign: 'center',
  },
  inlineSalonWarningCard: {
    width: '100%',
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  inlineSalonWarningTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#B91C1C',
    textAlign: 'center',
    marginBottom: 6,
  },
  inlineSalonWarningText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    minHeight: 92,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 520,
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
    textAlign: 'center',
    lineHeight: 22,
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
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
