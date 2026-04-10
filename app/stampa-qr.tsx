import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export default function StampaQrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ salon?: string | string[]; name?: string | string[]; link?: string | string[] }>();
  const salonCode = Array.isArray(params.salon) ? params.salon[0] ?? '' : params.salon ?? '';
  const salonName = Array.isArray(params.name) ? params.name[0] ?? '' : params.name ?? '';
  const qrLink = Array.isArray(params.link) ? params.link[0] ?? '' : params.link ?? '';

  const resolvedName = useMemo(() => salonName.trim() || salonCode.trim() || 'Salon Pro', [salonCode, salonName]);

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
        <Text style={styles.title}>{resolvedName}</Text>
        <Text style={styles.subtitle}>
          Scansiona questo codice per aprire il frontend web cliente già collegato al salone.
        </Text>

        <View style={styles.qrWrap}>
          <QRCode
            value={qrLink || 'https://configura-public-client-base-url.invalid'}
            size={240}
            color="#111111"
            backgroundColor="#ffffff"
          />
        </View>

        {salonCode ? <Text style={styles.code}>Codice salone: {salonCode}</Text> : null}
        {qrLink ? <Text style={styles.link}>{qrLink}</Text> : null}

        <View style={styles.actions}>
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
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
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
