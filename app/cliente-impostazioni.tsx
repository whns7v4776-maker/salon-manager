import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Keyboard, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getAppLanguageOptions, resolveStoredAppLanguage, tApp, type AppLanguage } from '../src/lib/i18n';
import { normalizeSalonCode } from '../src/lib/platform';
import { useResponsiveLayout } from '../src/lib/responsive';

const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const buildFrontendProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized ? `${FRONTEND_PROFILE_KEY}:${normalized}` : FRONTEND_PROFILE_KEY;
};
const buildFrontendBiometricProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized ? `${FRONTEND_BIOMETRIC_PROFILE_KEY}:${normalized}` : FRONTEND_BIOMETRIC_PROFILE_KEY;
};

export default function ClienteImpostazioniScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ salon?: string | string[] }>();
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
    (async () => {
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
      } catch {
        setFrontendBiometricAvailable(false);
        setFrontendBiometricType('none');
      }
    })();
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
        await AsyncStorage.multiRemove([
          FRONTEND_BIOMETRIC_ENABLED_KEY,
          FRONTEND_BIOMETRIC_PROFILE_KEY,
          FRONTEND_BIOMETRIC_SALON_CODE_KEY,
        ]);
        setFrontendBiometricEnabled(false);
      } finally {
        setFrontendBiometricBusy(false);
      }
      return;
    }

    if (!frontendBiometricAvailable) {
      Alert.alert(
        'Biometria non disponibile',
        'Configura Face ID o impronta nelle impostazioni del dispositivo e riprova.'
      );
      return;
    }

    setFrontendBiometricBusy(true);

    try {
      const [legacySavedProfile, savedSalonCode] = await Promise.all([
        AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
        AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
      ]);
      const normalizedSalonCode = normalizeSalonCode(activeSalonCode || (savedSalonCode ?? ''));
      const scopedSavedProfile = normalizedSalonCode
        ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(normalizedSalonCode))
        : null;
      const savedProfile = scopedSavedProfile ?? legacySavedProfile;

      if (!savedProfile || !normalizedSalonCode) {
        Alert.alert(
          'Accesso cliente richiesto',
          'Accedi prima nell’area cliente con email e cellulare, poi potrai attivare Face ID o biometria.'
        );
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage:
          frontendBiometricType === 'faceid'
            ? 'Attiva Face ID cliente'
            : 'Attiva biometria cliente',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        return;
      }

      await AsyncStorage.multiSet([
        [FRONTEND_BIOMETRIC_ENABLED_KEY, 'true'],
        [FRONTEND_BIOMETRIC_PROFILE_KEY, savedProfile],
        [buildFrontendBiometricProfileKeyForSalon(normalizedSalonCode), savedProfile],
        [FRONTEND_BIOMETRIC_SALON_CODE_KEY, normalizedSalonCode],
      ]);
      setFrontendBiometricEnabled(true);
    } finally {
      setFrontendBiometricBusy(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: '/cliente',
      params: {
        salon: salonParam || undefined,
      },
    });
  };

  const redirectToFrontendAccess = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }

    router.replace('/cliente-scanner');
  };

  const performFrontendLogout = async () => {
    const currentSalonCode = normalizeSalonCode(activeSalonCode || salonParam || '');
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

    const navigationRouter = router as typeof router & {
      dismissAll?: () => void;
    };

    navigationRouter.dismissAll?.();
    redirectToFrontendAccess();
  };

  const handleFrontendLogout = () => {
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
    frontendBiometricType === 'faceid' ? 'Face ID cliente' : 'Accesso biometrico cliente';
  const biometricDescription =
    !frontendBiometricAvailable
      ? 'Configura Face ID o impronta nelle impostazioni del dispositivo per attivarlo.'
      : frontendBiometricEnabled
      ? 'Accesso rapido attivo: puoi entrare nell’area cliente con biometria.'
      : 'Attiva l’accesso biometrico per entrare nell’area cliente senza reinserire i dati.';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: responsive.horizontalPadding },
      ]}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
        <View style={styles.heroCard}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.9}>
              <View style={styles.actionIconBadge}>
                <Ionicons name="chevron-back" size={18} color="#111111" />
              </View>
            </TouchableOpacity>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tApp(frontendLanguage, 'frontend_badge')}</Text>
            </View>
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleBadge}>
              <Image
                source={require('../assets/header-impostazioni-icon.png')}
                style={styles.titleBadgeImage}
                resizeMode="contain"
              />
            </View>
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
                <TouchableOpacity
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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.card,
            styles.biometricRow,
            frontendBiometricEnabled && styles.biometricRowActive,
            frontendBiometricBusy && styles.cardDisabled,
          ]}
          onPress={handleToggleFrontendBiometric}
          activeOpacity={0.9}
          disabled={frontendBiometricBusy}
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
          </View>
        </TouchableOpacity>

        <View style={[styles.card, styles.logoutCard]}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleFrontendLogout}
            activeOpacity={0.9}
          >
            <Text style={styles.logoutButtonText}>{tApp(frontendLanguage, 'common_logout')}</Text>
          </TouchableOpacity>
          <Text style={styles.logoutHint}>
            Esci dal profilo cliente salvato su questo dispositivo e torna all’accesso frontend.
          </Text>
        </View>
      </View>
    </ScrollView>
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
    padding: 22,
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
    marginBottom: 12,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
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
    gap: 10,
    marginBottom: 6,
    justifyContent: 'center',
    width: '100%',
  },
  titleBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  titleBadgeImage: {
    width: 28,
    height: 28,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricRowActive: {
    backgroundColor: '#eefbf4',
    borderColor: '#b7ebc6',
  },
  biometricContent: {
    flex: 1,
    marginRight: 14,
  },
  biometricToggle: {
    width: 76,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    padding: 4,
    justifyContent: 'center',
  },
  biometricToggleActive: {
    backgroundColor: '#16a34a',
  },
  biometricToggleKnob: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
  },
  biometricToggleKnobActive: {
    alignSelf: 'flex-end',
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
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    alignItems: 'center',
  },
  logoutButton: {
    minWidth: 160,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#f9a8b6',
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
    color: '#9f1239',
    textAlign: 'center',
    maxWidth: 560,
  },
});
