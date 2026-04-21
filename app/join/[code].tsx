import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../../components/ui/web-immediate-touchable-opacity';
import { normalizeSalonCode } from '../../src/lib/platform';

const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6760840153';
const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.marzix91.salonmanager';
const ANDROID_MARKET_URL = 'market://details?id=com.marzix91.salonmanager';

export default function JoinSalonScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const rawCode = Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? '';
  const normalizedCode = useMemo(() => normalizeSalonCode(rawCode), [rawCode]);
  const [openingApp, setOpeningApp] = useState(false);

  const openWebBooking = () => {
    router.replace({
      pathname: '/cliente-screen',
      params: { salon: normalizedCode },
    });
  };

  const openNativeApp = async () => {
    if (!normalizedCode) {
      return;
    }

    const deepLink = `salonmanager://cliente?salon=${encodeURIComponent(normalizedCode)}&mode=booking`;
    const isWeb = Platform.OS === 'web';

    try {
      setOpeningApp(true);
      if (!isWeb) {
        await Linking.openURL(deepLink);
        return;
      }

      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
      const isAndroid = /android/.test(userAgent);
      const isIos = /iphone|ipad|ipod/.test(userAgent);
      const fallbackUrl = isAndroid
        ? ANDROID_PLAY_STORE_URL
        : isIos
          ? IOS_APP_STORE_URL
          : IOS_APP_STORE_URL;

      let fallbackTriggered = false;
      let visibilityHandler: (() => void) | null = null;
      let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

      if (typeof document !== 'undefined') {
        visibilityHandler = () => {
          if (document.hidden && fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = null;
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
      }

      fallbackTimeout = setTimeout(() => {
        fallbackTriggered = true;
        if (isAndroid && typeof window !== 'undefined') {
          window.location.href = ANDROID_MARKET_URL;
          setTimeout(() => {
            if (typeof document === 'undefined' || !document.hidden) {
              window.location.href = ANDROID_PLAY_STORE_URL;
            }
          }, 900);
          return;
        }

        if (typeof window !== 'undefined') {
          window.location.href = fallbackUrl;
        }
      }, 1200);

      if (typeof window !== 'undefined') {
        window.location.href = deepLink;
      } else {
        await Linking.openURL(deepLink);
      }

      setTimeout(() => {
        if (visibilityHandler && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', visibilityHandler);
        }
        if (!fallbackTriggered && fallbackTimeout) {
          clearTimeout(fallbackTimeout);
        }
      }, 2500);
    } catch (error) {
      console.log('Errore apertura deep link cliente:', error);
    } finally {
      setOpeningApp(false);
    }
  };

  if (normalizedCode) {
    return (
      <View style={styles.screen}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.card}>
          <View style={styles.inlineBadge}>
            <Text style={styles.inlineBadgeText}>Area cliente</Text>
          </View>
          <Text style={styles.loadingTitle}>Scegli come aprire il salone</Text>
          <Text style={styles.subtitle}>
            Se hai gia installato l'app puoi aprirla direttamente. In alternativa puoi
            continuare subito dal web senza scaricare nulla.
          </Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={openNativeApp} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>
                {openingApp ? 'Sto aprendo APP SalonPro...' : 'Apri in APP SalonPro'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={openWebBooking} activeOpacity={0.9}>
              <Text style={styles.secondaryButtonText}>Continua sul web</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.note}>
            Se l'app non e installata, usa il web. Se preferisci l'app, puoi scaricarla e poi
            tornare qui per aprirla dal pulsante sopra.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.card}>
        <View style={styles.inlineBadge}>
          <Text style={styles.inlineBadgeText}>Area cliente</Text>
        </View>
        <Text style={styles.error}>Codice salone non valido o mancante</Text>
        <Text style={styles.note}>
          Controlla il link ricevuto dal salone oppure torna all&apos;area cliente per inserire un codice valido.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/cliente-screen')}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>Torna all&apos;area cliente</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#e6edf3',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -70,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  card: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 28,
    paddingVertical: 34,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    borderWidth: 1,
    borderColor: '#b9cadd',
  },
  loadingTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 620,
  },
  success: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    maxWidth: 680,
  },
  error: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
    maxWidth: 620,
  },
  note: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 640,
  },
  inlineBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
  },
  inlineBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 22,
  },
  primaryButton: {
    minWidth: 210,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 210,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d7e2ea',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  saloonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  saloonChipText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
});
