import { clientBiometricError } from '../src/lib/client-biometric-error';
import { OwnerSettingsBackGesture as AndroidSettingsSwipeBack } from '../components/android-owner-settings-back-gesture';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, AppState, Image, Keyboard, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchable } from '../components/ui/haptic-touchable';
import { MetaMeasurementLink } from '../components/meta-measurement-link';
import { getAppLanguageOptions, resolveStoredAppLanguage, tApp, type AppLanguage } from '../src/lib/i18n';
import { haptic } from '../src/lib/haptics';
import { setApplicationBadgeSuppressed } from '../src/lib/notification-badge-sync';
import { invalidateNativeCustomerSession } from '../src/lib/client-native-session';
import { invalidateCustomerPaymentToken } from '../src/lib/client-payment-session';
import { normalizeSalonCode } from '../src/lib/platform';
import { useResponsiveLayout } from '../src/lib/responsive';

const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const normalizeEmail = (value?: string | null) => (value ?? '').trim().toLowerCase();
const normalizePhone = (value?: string | null) => (value ?? '').replace(/\D+/g, '');
const buildFrontendProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized ? `${FRONTEND_PROFILE_KEY}:${normalized}` : FRONTEND_PROFILE_KEY;
};
const buildFrontendBiometricProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
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
  const normalizedSalonCode = normalizeSalonCode(salonCode ?? '');
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const identity = [normalizedSalonCode, normalizedEmail || normalizedPhone].filter(Boolean).join(':');
  return identity
    ? `${FRONTEND_BIOMETRIC_ENABLED_KEY}:${identity}`
    : FRONTEND_BIOMETRIC_ENABLED_KEY;
};

export default function ClienteImpostazioniScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    source?: string | string[];
    email?: string | string[];
    phone?: string | string[];
  }>();
  const responsive = useResponsiveLayout();
  const [frontendLanguage, setFrontendLanguage] = useState<AppLanguage>('it');
  const [frontendBiometricEnabled, setFrontendBiometricEnabled] = useState(false);
  const [frontendBiometricAvailable, setFrontendBiometricAvailable] = useState(false);
  const [frontendBiometricBusy, setFrontendBiometricBusy] = useState(false);
  const [frontendBiometricType, setFrontendBiometricType] = useState<'faceid' | 'fingerprint' | 'none'>('none');
  const [activeProfile, setActiveProfile] = useState<{
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
  } | null>(null);
  const [activeSalonCode, setActiveSalonCode] = useState('');
  const salonParam = Array.isArray(searchParams.salon) ? searchParams.salon[0] : searchParams.salon;
  const sourceParam = Array.isArray(searchParams.source) ? searchParams.source[0] : searchParams.source;
  const emailParam = Array.isArray(searchParams.email) ? searchParams.email[0] : searchParams.email;
  const phoneParam = Array.isArray(searchParams.phone) ? searchParams.phone[0] : searchParams.phone;
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [savedLanguage, savedBiometricEnabled, savedProfileRaw, savedSalonCode] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY),
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
        ]);
        setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
        setFrontendBiometricEnabled(savedBiometricEnabled === 'true');

        const resolvedSalonCode = normalizeSalonCode(salonParam ?? savedSalonCode ?? '');
        const scopedProfileRaw = resolvedSalonCode
          ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(resolvedSalonCode))
          : null;
        const effectiveProfileRaw = scopedProfileRaw ?? savedProfileRaw;

        const parsedProfile = effectiveProfileRaw
          ? (JSON.parse(effectiveProfileRaw) as {
              nome?: string;
              cognome?: string;
              email?: string;
              telefono?: string;
            })
          : null;
        const normalizedProfile =
          parsedProfile &&
          parsedProfile.nome?.trim() &&
          parsedProfile.cognome?.trim() &&
          parsedProfile.email?.trim() &&
          parsedProfile.telefono?.trim()
            ? {
                nome: parsedProfile.nome.trim(),
                cognome: parsedProfile.cognome.trim(),
                email: parsedProfile.email.trim(),
                telefono: parsedProfile.telefono.trim(),
              }
            : null;
        const scopedBiometricEnabledRaw =
          normalizedProfile && resolvedSalonCode
            ? await AsyncStorage.getItem(
                buildFrontendBiometricEnabledKey({
                  salonCode: resolvedSalonCode,
                  email: normalizedProfile.email,
                  phone: normalizedProfile.telefono,
                })
              )
            : null;

        setFrontendBiometricEnabled(
          scopedBiometricEnabledRaw === 'true' || scopedBiometricEnabledRaw === 'false'
            ? scopedBiometricEnabledRaw === 'true'
            : savedBiometricEnabled === 'true'
        );

        setActiveProfile(normalizedProfile);
        setActiveSalonCode(resolvedSalonCode || normalizeSalonCode(savedSalonCode ?? ''));
      } catch (error) {
        console.log('Errore caricamento impostazioni frontend:', error);
        setActiveProfile(null);
        setActiveSalonCode(normalizeSalonCode(salonParam ?? ''));
      }
    };

    void loadSettings();
  }, [salonParam]);

  useEffect(() => {
    let alive = true;
    const refreshBiometrics = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!alive) return;
        const available = hasHardware && isEnrolled;
        setFrontendBiometricAvailable(available);

        if (!available) {
          setFrontendBiometricType('none');
          return;
        }

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        if (alive) setFrontendBiometricType(hasFace ? 'faceid' : 'fingerprint');
      } catch {
        if (!alive) return;
        setFrontendBiometricAvailable(false);
        setFrontendBiometricType('none');
      }
    };
    void refreshBiometrics();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshBiometrics(); });
    return () => { alive = false; subscription.remove(); };
  }, []);

  const handleChangeLanguage = async (value: AppLanguage) => {
    setFrontendLanguage(value);
    await AsyncStorage.setItem(FRONTEND_LANGUAGE_KEY, value);
  };

  const handleToggleFrontendBiometric = async () => {
    if (frontendBiometricBusy) return;

    if (frontendBiometricEnabled) {
      setFrontendBiometricBusy(true);
      try {
        const normalizedSalonCode = normalizeSalonCode(activeSalonCode || salonParam || '');
        const scopedBiometricEnabledKey =
          activeProfile && normalizedSalonCode
            ? buildFrontendBiometricEnabledKey({
                salonCode: normalizedSalonCode,
                email: activeProfile.email,
                phone: activeProfile.telefono,
              })
            : null;
        await AsyncStorage.multiRemove([
          FRONTEND_BIOMETRIC_ENABLED_KEY,
          FRONTEND_BIOMETRIC_PROFILE_KEY,
          FRONTEND_BIOMETRIC_SALON_CODE_KEY,
          ...(scopedBiometricEnabledKey ? [scopedBiometricEnabledKey] : []),
          ...(normalizedSalonCode
            ? [buildFrontendBiometricProfileKeyForSalon(normalizedSalonCode)]
            : []),
        ]);
        setFrontendBiometricEnabled(false);
      } finally {
        setFrontendBiometricBusy(false);
      }
      return;
    }

    setFrontendBiometricBusy(true);

    try {
      if (Platform.OS === 'web') { Alert.alert('Accesso biometrico', 'Per usare Face ID o impronta, apri l’app SalonPro sul telefono.'); return; }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setFrontendBiometricAvailable(hasHardware && enrolled);
      if (!hasHardware || !enrolled) { Alert.alert('Accesso biometrico non attivo', clientBiometricError(!hasHardware ? 'not_available' : 'not_enrolled')); return; }
      const [legacySavedProfile, savedSalonCode] = await Promise.all([
        AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
        AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
      ]);
      const normalizedSalonCode = normalizeSalonCode(activeSalonCode || (savedSalonCode ?? ''));
      const scopedSavedProfile = normalizedSalonCode
        ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(normalizedSalonCode))
        : null;
      const savedProfile = scopedSavedProfile ?? legacySavedProfile;
      const parsedSavedProfile = savedProfile
        ? (JSON.parse(savedProfile) as {
            nome?: string;
            cognome?: string;
            email?: string;
            telefono?: string;
          })
        : null;
      const savedProfileEmail = normalizeEmail(parsedSavedProfile?.email);
      const savedProfilePhone = normalizePhone(parsedSavedProfile?.telefono);

      if (!savedProfile || !normalizedSalonCode) {
        Alert.alert(
          'Accesso cliente richiesto',
          'Accedi prima nell’area cliente con email e cellulare, poi potrai attivare Face ID o l’accesso con impronta.'
        );
        return;
      }

      if (!savedProfileEmail || !savedProfilePhone) {
        Alert.alert(
          'Accesso cliente richiesto',
          'Il profilo salvato su questo dispositivo non è valido. Accedi di nuovo nell’area cliente e riprova.'
        );
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage:
          frontendBiometricType === 'faceid'
            ? 'Attiva Face ID cliente'
            : 'Attiva accesso con impronta',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        Alert.alert('Accesso biometrico non attivato', clientBiometricError(authResult.error));
        return;
      }

      await AsyncStorage.multiSet([
        [FRONTEND_BIOMETRIC_ENABLED_KEY, 'true'],
        [
          buildFrontendBiometricEnabledKey({
            salonCode: normalizedSalonCode,
            email: savedProfileEmail,
            phone: savedProfilePhone,
          }),
          'true',
        ],
        [FRONTEND_BIOMETRIC_PROFILE_KEY, savedProfile],
        [buildFrontendBiometricProfileKeyForSalon(normalizedSalonCode), savedProfile],
        [FRONTEND_BIOMETRIC_SALON_CODE_KEY, normalizedSalonCode],
      ]);
      setFrontendBiometricEnabled(true);
    } catch {
      Alert.alert('Attivazione non completata', 'Non è stato possibile completare e salvare l’attivazione su questo telefono. Riprova.');
    } finally {
      setFrontendBiometricBusy(false);
    }
  };

  const handleBack = () => {
    if (Platform.OS === 'android' && router.canGoBack()) {
      router.back();
      return;
    }
    const fallbackEmail = String(emailParam ?? '').trim().toLowerCase();
    const fallbackPhone = String(phoneParam ?? '').trim();
    const targetEmail = activeProfile?.email?.trim()?.toLowerCase() || fallbackEmail;
    const targetPhone = activeProfile?.telefono?.trim() || fallbackPhone;
    const targetSalon = salonParam || activeSalonCode || undefined;

    if (sourceParam === 'requests') {
      router.replace({
        pathname: '/cliente-prenotazioni',
        params: {
          salon: targetSalon,
          session: '1',
          trusted: '1',
          autologin: targetEmail && targetPhone ? '1' : undefined,
          email: targetEmail || undefined,
          phone: targetPhone || undefined,
        },
      });
      return;
    }

    router.replace({
      pathname: '/cliente',
      params: {
        salon: targetSalon,
        session: '1',
        trusted: '1',
        mode: 'booking',
        autologin: targetEmail && targetPhone ? '1' : undefined,
        email: targetEmail || undefined,
        phone: targetPhone || undefined,
      },
    });
  };

  const redirectToFrontendAccess = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace('/?side=client&frontendLoggedOut=1');
      return;
    }

    router.replace({
      pathname: '/',
      params: { side: 'client', frontendLoggedOut: '1' },
    });
  };

  const performFrontendLogout = async () => {
    // Revoke before any asynchronous cleanup so a pending login cannot persist
    // an active session after the customer's explicit logout.
    const sessionCleanup = invalidateNativeCustomerSession();
    const currentSalonCode = normalizeSalonCode(activeSalonCode || salonParam || '');
    const customerEmail = normalizeEmail(emailParam || activeProfile?.email);
    const customerPhone = normalizePhone(phoneParam || activeProfile?.telefono).slice(0, 10);
    if (currentSalonCode && (customerEmail || customerPhone)) {
      void invalidateCustomerPaymentToken({ salonCode: currentSalonCode, email: customerEmail, phone: customerPhone })
        .catch(() => undefined);
    }
    await sessionCleanup.catch(() => undefined);
    await setApplicationBadgeSuppressed(true).catch(() => undefined);
    const scopedKeysToRemove = currentSalonCode
      ? [buildFrontendProfileKeyForSalon(currentSalonCode)]
      : [];

    await AsyncStorage.multiRemove([
      FRONTEND_PROFILE_KEY,
      FRONTEND_LAST_SALON_CODE_KEY,
      ...scopedKeysToRemove,
    ]);
    setActiveProfile(null);
    setActiveSalonCode('');

    redirectToFrontendAccess();
  };

  const handleFrontendLogout = () => {
    void haptic.medium().catch(() => null);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(tApp(frontendLanguage, 'frontend_logout_confirm_body'));
      if (confirmed) {
        void performFrontendLogout();
      }
      return;
    }

    Alert.alert(
      tApp(frontendLanguage, 'frontend_logout_confirm_title'),
      tApp(frontendLanguage, 'frontend_logout_confirm_body'),
      [
        { text: tApp(frontendLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(frontendLanguage, 'common_logout'),
          style: 'destructive',
          onPress: () => {
            void performFrontendLogout();
          },
        },
      ]
    );
  };

  const languageOptions = getAppLanguageOptions(frontendLanguage);
  const biometricTitle =
    frontendBiometricType === 'faceid' ? 'Face ID cliente' : 'Accesso con impronta';
  const biometricDescription =
    !frontendBiometricAvailable
      ? 'Configura Face ID o impronta nelle impostazioni del dispositivo per attivarlo.'
      : frontendBiometricEnabled
      ? frontendBiometricType === 'faceid'
        ? 'Accesso rapido attivo: puoi entrare nell’area cliente con Face ID.'
        : 'Accesso rapido attivo: puoi entrare nell’area cliente con impronta.'
      : frontendBiometricType === 'faceid'
        ? 'Attiva Face ID per entrare nell’area cliente senza reinserire i dati.'
        : 'Attiva l’accesso con impronta per entrare nell’area cliente senza reinserire i dati.';

  return (
    <AndroidSettingsSwipeBack onBack={handleBack}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: responsive.horizontalPadding },
      ]}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      indicatorStyle="black"
      scrollIndicatorInsets={{ right: 2 }}
    >
      <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
        <View style={styles.heroCard}>
          <View style={styles.headerRow}>
            <HapticTouchable style={styles.backButton} onPress={handleBack} activeOpacity={0.9}>
              <View style={styles.actionIconBadge}>
                <Ionicons name="chevron-back" size={18} color="#111111" />
              </View>
            </HapticTouchable>
            <View style={styles.headerSettingsButton}>
              <View style={[styles.actionIconBadge, styles.headerSettingsIconBadge]}>
                <Image
                  source={require('../assets/header-impostazioni-icon.png')}
                  style={styles.headerSettingsIconImage}
                  resizeMode="contain"
                />
              </View>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tApp(frontendLanguage, 'frontend_badge')}</Text>
            </View>
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{tApp(frontendLanguage, 'settings_title')}</Text>
          </View>
          <Text style={styles.subtitle}>{tApp(frontendLanguage, 'frontend_settings_subtitle')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profilo cliente attivo</Text>
          <Text style={styles.cardText}>
            {activeProfile ? `${activeProfile.nome} ${activeProfile.cognome}` : 'Nessun profilo attivo'}
          </Text>
          {activeProfile ? (
            <>
              <Text style={styles.cardHint}>{activeProfile.email}</Text>
              <Text style={styles.cardHint}>{activeProfile.telefono}</Text>
              <Text style={styles.cardHint}>
                Salone: {(activeSalonCode || salonParam || '').trim() || 'Non disponibile'}
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(frontendLanguage, 'settings_language_title')}</Text>
          <Text style={styles.cardHint}>{tApp(frontendLanguage, 'settings_language_hint')}</Text>
          <View style={styles.languageRow}>
            {languageOptions.map((option) => {
              const selected = frontendLanguage === option.value;

              return (
                <HapticTouchable
                  key={option.value}
                  style={[styles.languageChip, selected && styles.languageChipActive]}
                  onPress={() => handleChangeLanguage(option.value)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.languageChipText, selected && styles.languageChipTextActive]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.languageChipNote, selected && styles.languageChipNoteActive]}>
                    {option.note}
                  </Text>
                </HapticTouchable>
              );
            })}
          </View>
        </View>

        <HapticTouchable
          style={[
            styles.card,
            styles.biometricRow,
            frontendBiometricEnabled && styles.biometricRowActive,
            frontendBiometricBusy && styles.cardDisabled,
          ]}
          onPress={handleToggleFrontendBiometric}
          activeOpacity={0.9}
          disabled={frontendBiometricBusy}
          hapticType="medium"
        >
          <View style={styles.biometricContent}>
            <Text style={styles.cardTitle}>{biometricTitle}</Text>
            <Text style={styles.cardHint}>{biometricDescription}</Text>
          </View>
          <View style={[styles.biometricToggle, frontendBiometricEnabled && styles.biometricToggleActive]}>
            <View
              style={[
                styles.biometricToggleKnob,
                frontendBiometricEnabled && styles.biometricToggleKnobActive,
              ]}
            />
            <Text
              style={[
                styles.biometricToggleText,
                frontendBiometricEnabled && styles.biometricToggleTextActive,
              ]}
            >
              {frontendBiometricEnabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </HapticTouchable>

        <MetaMeasurementLink />
        <View style={[styles.card, styles.logoutCard]}>
          <HapticTouchable
            style={styles.logoutButton}
            onPress={handleFrontendLogout}
            activeOpacity={0.9}
            hapticType="medium"
          >
            <Text style={styles.logoutButtonText}>{tApp(frontendLanguage, 'common_logout')}</Text>
          </HapticTouchable>
          <Text style={styles.logoutHint}>
            Esci dal profilo cliente salvato su questo dispositivo e torna all’accesso frontend.
          </Text>
        </View>
      </View>
    </ScrollView>
    </AndroidSettingsSwipeBack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  content: {
    paddingTop: 47,
    paddingBottom: 140,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 28,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 18,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  headerSettingsButton: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  actionIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  headerSettingsIconBadge: {
    backgroundColor: '#f8fafc',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerSettingsIconImage: {
    width: 28,
    height: 28,
  },
  badge: {
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'center',
    width: '100%',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 560,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 22,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    alignItems: 'center',
  },
  cardDisabled: {
    opacity: 0.68,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6b7a',
    marginBottom: 16,
    textAlign: 'center',
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  biometricRow: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: '#F8FAFC',
    padding: 16,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  biometricRowActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  biometricContent: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricToggle: {
    width: 78,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    paddingHorizontal: 6,
    alignSelf: 'center',
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
  languageChip: {
    minWidth: 118,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d8e4f3',
  },
  languageChipActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  languageChipText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  languageChipTextActive: {
    color: '#ffffff',
  },
  languageChipNote: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  languageChipNoteActive: {
    color: '#d7dde7',
  },
  actionButton: {
    minWidth: 220,
    backgroundColor: '#0f172a',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
  },
  logoutCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15,23,42,0.08)',
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
