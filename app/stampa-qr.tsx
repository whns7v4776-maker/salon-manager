import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "../components/ui/ios-simple-touchable";
import QRCode from 'react-native-qrcode-svg';
import { AppWordmark } from '../components/app-wordmark';
import { resolveBundledAssetUri } from '../src/lib/bundled-asset-uri';
import { buildSalonQrPrintHtml } from '../src/lib/salon-qr-print';

export default function StampaQrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ salon?: string | string[]; name?: string | string[]; link?: string | string[] }>();
  const salonCode = Array.isArray(params.salon) ? params.salon[0] ?? '' : params.salon ?? '';
  const salonName = Array.isArray(params.name) ? params.name[0] ?? '' : params.name ?? '';
  const qrLink = Array.isArray(params.link) ? params.link[0] ?? '' : params.link ?? '';
  const qrCodeRef = useRef<{ toDataURL: (callback: (data: string) => void) => void } | null>(null);

  const resolvedName = useMemo(() => salonName.trim() || salonCode.trim() || 'Salon Pro', [salonCode, salonName]);
  const hasDistinctSalonName = !['salonpro', 'salon pro'].includes(resolvedName.trim().toLowerCase());
  const wordmarkUri = useMemo(
    () => resolveBundledAssetUri(require('../assets/images/salon-pro-logo-ui.png')),
    []
  );

  const handlePrint = useCallback(() => {
    if (!qrLink) {
      Alert.alert('QR non pronto', 'Il collegamento del QR non è disponibile.');
      return;
    }

    if (Platform.OS === 'web') {
      window.print();
      return;
    }

    qrCodeRef.current?.toDataURL((qrImageBase64) => {
      const html = buildSalonQrPrintHtml({
        qrImageBase64,
        salonCode,
        salonName: resolvedName,
        wordmarkUri,
      });

      Print.printAsync({ html }).catch(() => {
        Alert.alert('Stampa non riuscita', 'Non sono riuscito ad aprire la stampa. Riprova tra qualche secondo.');
      });
    });
  }, [qrLink, resolvedName, salonCode, wordmarkUri]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !qrLink) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.print();
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [qrLink]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.sheet}>
        <Text style={styles.eyebrow}>QR code salone</Text>
        <View style={styles.wordmarkWrap}>
          <AppWordmark maxWidth={360} />
        </View>
        {hasDistinctSalonName ? <Text style={styles.salonName}>{resolvedName}</Text> : null}
        <Text style={styles.subtitle}>
          Scansiona questo codice per aprire il frontend web cliente già collegato al salone.
        </Text>

        <View style={styles.qrWrap}>
          <QRCode
            getRef={(ref) => {
              qrCodeRef.current = ref;
            }}
            value={qrLink || 'https://configura-public-client-base-url.invalid'}
            size={240}
            color="#111111"
            backgroundColor="#ffffff"
          />
        </View>

        {salonCode ? <Text style={styles.code}>Codice salone: {salonCode}</Text> : null}
        {qrLink ? <Text style={styles.link}>{qrLink}</Text> : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.printButton} onPress={handlePrint} activeOpacity={0.9}>
            <Ionicons name="print-outline" size={20} color="#0f172a" />
            <Text style={styles.printButtonText}>Stampa QR code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f6',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 30,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  wordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: -14,
    marginBottom: 2,
  },
  salonName: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '900',
    color: '#475569',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 560,
    marginBottom: 22,
  },
  qrWrap: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    marginBottom: 18,
  },
  code: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  link: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  printButton: {
    minWidth: 220,
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#ffffff',
  },
  printButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    minWidth: 220,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
