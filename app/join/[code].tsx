import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "../../components/ui/ios-simple-touchable";
import { AppWordmark } from '../../components/app-wordmark';
import { buildSalonPlayStoreUrl } from '../../src/lib/salon-install-link';

const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6760840153';
const SALONPRO_APP_SCHEME = 'salonmanager';

const isAndroidBrowserUserAgent = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
};

const isIosBrowserUserAgent = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const isMobileBrowserUserAgent = () => isAndroidBrowserUserAgent() || isIosBrowserUserAgent();

const attemptOpenSalonProAppFromWeb = (url: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(url);
};

const appendJoinCacheBustParam = (href: Href): Href => {
  const value = href as {
    pathname?: string;
    params?: Record<string, string>;
  };

  if (!value || typeof value !== 'object') {
    return href;
  }

  return {
    ...value,
    params: {
      ...(value.params ?? {}),
      t: String(Date.now()),
    },
  } as Href;
};

export default function JoinSalonRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    salon?: string | string[];
  }>();

  const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
  const salonParam = Array.isArray(params.salon) ? params.salon[0] : params.salon;
  const salonCode = String(codeParam || salonParam || '').trim();
  const [webJoinGate, setWebJoinGate] = useState<'probing' | 'chooser'>('probing');
  const appDeepLinkUrl = useMemo(
    () =>
      `${SALONPRO_APP_SCHEME}://join/${encodeURIComponent(salonCode)}?entry=client`,
    [salonCode]
  );

  const clientRegistrationHref = useMemo(
    () =>
      ({
        pathname: '/',
        params: {
          side: 'client',
          salon: salonCode,
          entry: 'client',
        },
      }) as Href,
    [salonCode]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !salonCode || typeof window === 'undefined') {
      return;
    }

    setWebJoinGate('probing');

    let didHidePage = false;
    const markHidden = () => {
      didHidePage = true;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markHidden();
      else setWebJoinGate('chooser');
    };

    const shouldSkipAutomaticAppOpen = !isMobileBrowserUserAgent() || isIosBrowserUserAgent();
    const fallbackTimer = window.setTimeout(() => {
      if (!didHidePage) {
        setWebJoinGate('chooser');
      }
    }, shouldSkipAutomaticAppOpen ? 450 : 1600);
    const launchTimer = shouldSkipAutomaticAppOpen
      ? undefined
      : window.setTimeout(() => {
          attemptOpenSalonProAppFromWeb(appDeepLinkUrl);
        }, 120);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', markHidden);
    window.addEventListener('blur', markHidden);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (launchTimer) {
        window.clearTimeout(launchTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', markHidden);
      window.removeEventListener('blur', markHidden);
    };
  }, [appDeepLinkUrl, salonCode]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setWebJoinGate('chooser');
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  if (!salonCode) {
    return <Redirect href={'/' as Href} />;
  }

  if (Platform.OS !== 'web') {
    return <Redirect href={clientRegistrationHref} />;
  }

  const handleDownloadApp = () => {
    const storeUrl = isAndroidBrowserUserAgent() ? buildSalonPlayStoreUrl(salonCode) : IOS_APP_STORE_URL;

    if (typeof window !== 'undefined') {
      window.location.assign(storeUrl);
      return;
    }

    Linking.openURL(storeUrl).catch(() => null);
  };

  const handleOpenApp = () => {
    attemptOpenSalonProAppFromWeb(appDeepLinkUrl);
  };

  const handleContinueOnWeb = () => {
    router.replace(appendJoinCacheBustParam(clientRegistrationHref));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.brandBand}>
          <AppWordmark />
        </View>
        <Text style={styles.eyebrow}>ACCESSO DA LINK O QR</Text>
        <Text style={styles.title}>
          {webJoinGate === 'probing' ? 'Sto cercando SalonPro' : 'Apri SalonPro o continua sul Web'}
        </Text>
        <Text style={styles.subtitle}>
          {webJoinGate === 'probing'
            ? 'Controllo se l app installata puo aprirsi direttamente da questo dispositivo.'
            : 'Se SalonPro e gia installata, aprila direttamente. In alternativa puoi continuare subito nel browser.'}
        </Text>

        {webJoinGate === 'probing' ? (
          <View style={styles.loaderPanel}>
            <View style={styles.loaderSpinnerShell}>
              <View style={styles.loaderSpinnerGlow} />
              <ActivityIndicator size="large" color="#182033" />
            </View>
            <Text style={styles.loaderEyebrow}>RICERCA APP INSTALLATA</Text>
            <Text style={styles.loaderTitle}>Controllo app in corso...</Text>
            <Text style={styles.loaderHint}>
              Se il browser non riesce ad agganciarla entro pochi istanti, ti lascio continuare dal web.
            </Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.fallbackHint}>
              Devi installare l’app? Dopo il download torna qui e premi “Apri il mio salone”. Se hai chiuso questa pagina, inquadra di nuovo lo stesso QR: non serve inserire il codice a mano.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleOpenApp}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Apri il mio salone nell’app</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleContinueOnWeb}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Continua sul Web</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleDownloadApp}
              style={styles.storeButton}
            >
              <Text style={styles.storeButtonText}>Scarica APP</Text>
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
    backgroundColor: '#eef4fb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  card: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#ffffff',
    borderRadius: 38,
    paddingHorizontal: 28,
    paddingVertical: 34,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.11,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  brandBand: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eyebrow: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#6b7280',
    textAlign: 'center',
  },
  title: {
    marginTop: 14,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    maxWidth: 520,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 25,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 520,
  },
  loaderPanel: {
    width: '100%',
    marginTop: 30,
    paddingHorizontal: 24,
    paddingVertical: 26,
    borderRadius: 28,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#d9e5fb',
    alignItems: 'center',
    shadowColor: '#c7d2fe',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  loaderSpinnerShell: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe5f4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#bfdbfe',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  loaderSpinnerGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(191, 219, 254, 0.28)',
  },
  loaderEyebrow: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: '#7c8aa5',
    textAlign: 'center',
  },
  loaderTitle: {
    marginTop: 10,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  loaderHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: 28,
    gap: 12,
  },
  fallbackHint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryButton: {
    minHeight: 56,
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
    minHeight: 56,
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
  storeButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#dbe3ee',
  },
  storeButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: '#475569',
  },
});
