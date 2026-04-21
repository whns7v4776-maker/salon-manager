import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Image, Keyboard, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { HapticTouchable } from '../components/ui/haptic-touchable';
import { useAppContext } from '../src/context/AppContext';
import { getAppLanguageOptions, tApp } from '../src/lib/i18n';
import { getNotificationPermissionStatus, requestNotificationPermissionsOnly } from '../src/lib/push/push-notifications';
import { useResponsiveLayout } from '../src/lib/responsive';

export default function ImpostazioniScreen() {
  const responsive = useResponsiveLayout();
  const router = useRouter();
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
  const [notificationPermission, setNotificationPermission] = React.useState<
    'granted' | 'denied' | 'undetermined' | string
  >('undetermined');
  const [notificationBusy, setNotificationBusy] = React.useState(false);
  const languageOptions = getAppLanguageOptions(appLanguage);
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

  const biometricTitle =
    biometricType === 'faceid'
      ? 'Face ID'
      : biometricType === 'fingerprint'
      ? 'Impronta digitale'
      : 'Sblocco biometrico';

  const biometricDescription = !isMobile
    ? 'Disponibile solo su app iOS/Android.'
    : !biometricAvailable
    ? 'Configura Face ID o impronta nelle impostazioni del dispositivo per attivarlo.'
    : biometricEnabled
    ? 'Accesso rapido attivo: entrerai direttamente con biometria senza inserire il codice.'
    : 'Attiva l\'accesso biometrico per entrare senza codice.';

  React.useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const status = await getNotificationPermissionStatus();
        if (mounted) {
          setNotificationPermission(status);
        }
      } catch (error) {
        console.log('Errore lettura permessi notifiche:', error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleBack = React.useCallback(() => {
    Haptics.selectionAsync().catch(() => null);

    if (router.canGoBack()) {
      router.back();
      return;
    }

    const navigationRouter = router as typeof router & {
      dismissAll?: () => void;
    };

    navigationRouter.dismissAll?.();
    router.replace('/(tabs)/index');
  }, [router]);

  const handleLogout = () => {
    const title = tApp(appLanguage, 'settings_logout_confirm_title');
    const body = tApp(appLanguage, 'settings_logout_confirm_body');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(`${title}\n\n${body}`);
      if (!confirmed) return;
      void (async () => {
        await logoutOwnerAccount();
        router.replace('/cliente-scanner');
      })();
      return;
    }

    Alert.alert(title, body, [
      { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
      {
        text: tApp(appLanguage, 'common_logout'),
        style: 'destructive',
        onPress: async () => {
          await logoutOwnerAccount();
          router.replace('/cliente-scanner');
        },
      },
    ]);
  };

  const handleToggleBiometric = React.useCallback(async () => {
    if (biometricBusy) return;

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
    await toggleBiometricEnabled(true);
    setBiometricBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
  }, [
    biometricAvailable,
    biometricBusy,
    biometricEnabled,
    isMobile,
    toggleBiometricEnabled,
  ]);

  const notificationTitle = !isMobile
    ? 'Notifiche push'
    : notificationPermission === 'granted'
    ? 'Notifiche attive'
    : 'Attiva notifiche';

  const notificationDescription = !isMobile
    ? 'Disponibile solo su app iOS/Android.'
    : notificationPermission === 'granted'
    ? 'Il permesso notifiche del dispositivo è attivo per questa installazione.'
    : notificationPermission === 'denied'
    ? 'Le notifiche sono bloccate. Tocca qui per aprire le impostazioni del telefono.'
    : 'Tocca qui per far comparire il popup Consenti notifiche.';

  const handleNotificationsPermission = React.useCallback(async () => {
    if (!isMobile || notificationBusy) {
      return;
    }

    setNotificationBusy(true);
    try {
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
  }, [isMobile, notificationBusy, notificationPermission]);

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
          <View style={styles.topActionsRow}>
            <HapticTouchable
              style={styles.headerBackButton}
              onPress={handleBack}
              hapticType="none"
              pressInHapticType="light"
              activeOpacity={0.9}
            >
              <Ionicons name="chevron-back" size={24} color="#0F172A" />
            </HapticTouchable>

            <View style={styles.headerTitleWrap} pointerEvents="none">
              <AppWordmark />
            </View>

            <View style={styles.headerSettingsButton}>
              <Image
                source={require('../assets/header-impostazioni-icon.png')}
                style={styles.headerSettingsImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.screenHeaderRow}>
            <Text style={styles.title}>{tApp(appLanguage, 'settings_title')}</Text>
            <View style={styles.screenBrandChip}>
              <Text style={styles.screenBrandChipText}>
                  {salonWorkspace.salonName.trim() || 'Salon Pro'}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            {tApp(appLanguage, 'settings_subtitle')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_active_account')}</Text>
          <Text style={styles.cardText}>{salonWorkspace.ownerEmail || salonAccountEmail}</Text>
          <Text style={styles.cardHint}>
            Salone: {salonWorkspace.salonName.trim() || 'Salon Pro'}
          </Text>
          <Text style={styles.cardHint}>
            Codice salone: {salonWorkspace.salonCode.trim() || 'Non disponibile'}
          </Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_workspace')}: {salonWorkspace.id}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_language_title')}</Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_language_hint')}
          </Text>

          <View style={styles.languageRow}>
            {languageOptions.map((option) => {
              const selected = appLanguage === option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.languageChip, selected && styles.languageChipActive]}
                  onPress={() => setAppLanguage(option.value)}
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
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.biometricRow,
              biometricEnabled && styles.biometricRowActive,
              (!isMobile || biometricBusy) && styles.cardDisabled,
            ]}
            onPress={handleToggleBiometric}
            activeOpacity={0.9}
            disabled={biometricBusy || !isMobile}
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
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.biometricRow,
              notificationPermission === 'granted' && styles.biometricRowActive,
              (!isMobile || notificationBusy) && styles.cardDisabled,
            ]}
            onPress={handleNotificationsPermission}
            activeOpacity={0.9}
            disabled={notificationBusy || !isMobile}
          >
            <View style={styles.biometricContent}>
              <Text style={styles.biometricTitle}>{notificationTitle}</Text>
              <Text style={styles.biometricText}>{notificationDescription}</Text>
              {Constants.executionEnvironment === 'storeClient' ? (
                <Text style={styles.permissionHint}>
                  In Expo Go puoi autorizzare il permesso, ma le push backend complete restano limitate.
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.permissionBadge,
                notificationPermission === 'granted' && styles.permissionBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.permissionBadgeText,
                  notificationPermission === 'granted' && styles.permissionBadgeTextActive,
                ]}
              >
                {notificationPermission === 'granted' ? 'ON' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Onboarding</Text>
          <Text style={styles.cardHint}>
            Rivedi in qualsiasi momento la panoramica iniziale con QR, agenda e flusso operativo.
          </Text>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => {
              reopenOnboarding();
              handleBack();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryActionButtonText}>Riapri onboarding</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.logoutCard]}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.9}
          >
            <Text style={styles.logoutButtonText}>{tApp(appLanguage, 'common_logout')}</Text>
          </TouchableOpacity>
          <Text style={styles.logoutHint}>
            Esci completamente dal back office del salone e torna alla schermata principale.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    paddingTop: 54,
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
  headerSettingsButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  headerSettingsImage: {
    width: 28,
    height: 28,
  },
  screenHeaderRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 0,
    textAlign: 'center',
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
    width: 52,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 4,
  },
  biometricToggleActive: {
    backgroundColor: '#0F172A',
  },
  biometricToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  biometricToggleKnobActive: {
    alignSelf: 'flex-end',
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
