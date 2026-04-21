import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { normalizeSalonCode } from '../src/lib/platform';

const extractSalonCodeFromScan = (value: string) => {
  const raw = value.trim();
  if (!raw) return '';

  const directCode = normalizeSalonCode(raw);
  if (/^[A-Z0-9]{4,}$/.test(directCode)) {
    return directCode;
  }

  try {
    const url = new URL(raw);
    const salonParam = normalizeSalonCode(url.searchParams.get('salon') ?? '');
    if (salonParam) return salonParam;

    const joinMatch = url.pathname.match(/\/join\/([^/?#]+)/i);
    if (joinMatch?.[1]) {
      return normalizeSalonCode(joinMatch[1]);
    }
  } catch {
    const joinMatch = raw.match(/\/join\/([^/?#]+)/i);
    if (joinMatch?.[1]) {
      return normalizeSalonCode(joinMatch[1]);
    }
  }

  return '';
};

export default function ClienteScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isLocked, setIsLocked] = useState(false);

  const hasPermission = permission?.granted ?? false;
  const canUseCamera = Platform.OS !== 'web';
  const canAskCameraPermissionAgain = permission?.canAskAgain ?? true;

  useEffect(() => {
    if (!canUseCamera) return;
    if (!permission) return;
    if (permission.granted) return;
    if (!permission.canAskAgain) return;

    void requestPermission();
  }, [canUseCamera, permission, requestPermission]);

  const handleOpenSalon = useCallback(
    (code: string) => {
      router.replace(`/join/${encodeURIComponent(code)}`);
    },
    [router]
  );

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      if (isLocked) return;
      const code = extractSalonCodeFromScan(data);
      if (!code) {
        setIsLocked(true);
        Alert.alert(
          'QR non valido',
          'Questo QR non contiene un salone valido. Prova con il QR generato da SalonPro.',
          [
            {
              text: 'Riprova',
              onPress: () => setIsLocked(false),
            },
          ]
        );
        return;
      }

      setIsLocked(true);
      handleOpenSalon(code);
    },
    [handleOpenSalon, isLocked]
  );

  const helperText = useMemo(() => {
    if (!canUseCamera) {
      return 'Su web apri il QR del salone direttamente con il link oppure continua dal codice salone.';
    }
    if (!permission) {
      return 'Sto preparando l’accesso alla fotocamera.';
    }
    if (!hasPermission) {
      if (!canAskCameraPermissionAgain) {
        return 'La fotocamera e bloccata nelle impostazioni del telefono. Apri le impostazioni e abilita il permesso camera per continuare.';
      }
      return 'Consenti la fotocamera per inquadrare il QR del salone e aprire subito la registrazione corretta.';
    }
    return 'Inquadra il QR del salone. Ti porto direttamente nella pagina giusta per registrarti o accedere.';
  }, [canAskCameraPermissionAgain, canUseCamera, hasPermission, permission]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/cliente')}
          activeOpacity={0.9}
        >
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerIcon}>
          <Ionicons name="scan-outline" size={24} color="#ffffff" />
        </View>
        <Text style={styles.eyebrow}>Area cliente</Text>
        <Text style={styles.title}>Inquadra il QR del salone</Text>
        <Text style={styles.subtitle}>{helperText}</Text>

        {!canUseCamera ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/cliente')}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>Continua senza fotocamera</Text>
          </TouchableOpacity>
        ) : !hasPermission ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (canAskCameraPermissionAgain) {
                void requestPermission();
                return;
              }

              void Linking.openSettings();
            }}
            activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>
              {canAskCameraPermissionAgain ? 'Consenti fotocamera' : 'Apri impostazioni fotocamera'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.cameraShell}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScanned}
            />
            <View pointerEvents="none" style={styles.scannerFrame}>
              <View style={styles.scannerFrameInner} />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/cliente')}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryButtonText}>Continua con codice salone</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#edf2f6',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  backButton: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  cameraShell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginBottom: 14,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scannerFrame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrameInner: {
    width: '64%',
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'transparent',
  },
  primaryButton: {
    width: '100%',
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DCE6F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
});
