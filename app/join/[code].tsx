import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppWordmark } from '../../components/app-wordmark';

const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6760840153';
const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.marzix91.salonmanager';

const isMobileBrowserUserAgent = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

const isAndroidBrowserUserAgent = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
};

const attemptOpenSalonProAppFromWeb = (url: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(url);
};

export default function JoinSalonRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    salon?: string | string[];
  }>();

  const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
  const salonParam = Array.isArray(params.salon) ? params.salon[0] : params.salon;
  const salonCode = (codeParam || salonParam || '').trim();
  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && isMobileBrowserUserAgent();
  const [webJoinGate, setWebJoinGate] = useState<'probing' | 'chooser'>('probing');

  const nativeClientHref = useMemo(
    () =>
      ({
        pathname: '/cliente',
        params: { salon: salonCode, mode: 'booking' },
      }) as Href,
    [salonCode]
  );

  useEffect(() => {
    if (!isWeb || !isMobileWeb || !salonCode || typeof window === 'undefined') {
      return;
    }

    setWebJoinGate('probing');

    let didHidePage = false;
    const markHidden = () => {
      didHidePage = true;
    };

    const appDeepLinkUrl = `salonmanager://join/${salonCode}?mode=booking`;
    const fallbackTimer = window.setTimeout(() => {
      if (!didHidePage) {
        setWebJoinGate('chooser');
      }
    }, 1600);
    const launchTimer = window.setTimeout(() => {
      attemptOpenSalonProAppFromWeb(appDeepLinkUrl);
    }, 120);

    document.addEventListener('visibilitychange', markHidden);
    window.addEventListener('pagehide', markHidden);
    window.addEventListener('blur', markHidden);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(launchTimer);
      document.removeEventListener('visibilitychange', markHidden);
      window.removeEventListener('pagehide', markHidden);
      window.removeEventListener('blur', markHidden);
    };
  }, [isMobileWeb, isWeb, salonCode]);

  if (!salonCode) {
    return <Redirect href={'/' as Href} />;
  }

  if (!isWeb) {
    return <Redirect href={nativeClientHref} />;
  }

  if (!isMobileWeb) {
    return <Redirect href={nativeClientHref} />;
  }

  const handleDownloadApp = () => {
    const storeUrl = isAndroidBrowserUserAgent() ? ANDROID_PLAY_STORE_URL : IOS_APP_STORE_URL;

    if (typeof window !== 'undefined') {
      window.location.assign(storeUrl);
      return;
    }

    Linking.openURL(storeUrl).catch(() => null);
  };

  const handleContinueOnWeb = () => {
    router.replace(nativeClientHref);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <AppWordmark />
        <Text style={styles.eyebrow}>ACCESSO DA LINK O QR</Text>
        <Text style={styles.title}>
          {webJoinGate === 'probing' ? 'Sto aprendo SalonPro' : 'Apri SalonPro o continua sul Web'}
        </Text>
        <Text style={styles.subtitle}>
          {webJoinGate === 'probing'
            ? 'Se l’app e installata sul dispositivo, la apro direttamente.'
            : 'Se non trovi l’app installata, puoi scaricarla oppure continuare nel browser.'}
        </Text>

        {webJoinGate === 'probing' ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.loaderText}>Controllo app in corso...</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.85} onPress={handleDownloadApp} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Scarica APP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleContinueOnWeb}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Continua sul Web</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  eyebrow: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#6b7280',
    textAlign: 'center',
  },
  title: {
    marginTop: 14,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 25,
    color: '#475569',
    textAlign: 'center',
  },
  loaderRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  actions: {
    width: '100%',
    marginTop: 28,
    gap: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#101828',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  secondaryButtonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    color: '#1e3a8a',
  },
});
