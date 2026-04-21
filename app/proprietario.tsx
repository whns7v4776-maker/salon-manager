import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppContext } from '../src/context/AppContext';
import { AppWordmark } from '../components/app-wordmark';
import { OwnerAccessScreen } from '../src/screens/OwnerAccessScreen';

export default function ProprietarioScreen() {
  const { isAuthenticated, ownerPasswordRecoveryActive } = useAppContext();
  const params = useLocalSearchParams<{ reset?: string; entry?: string }>();
  const router = useRouter();
  const redirectLockRef = React.useRef(false);
  const forceOwnerAccess = params.reset === '1';
  const showResetDoneMessage = params.reset === 'done';
  const showDesktopEntryHint = params.entry === 'desktop';

  const navigateToOwnerAgenda = React.useCallback(() => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.location?.assign === 'function'
    ) {
      window.location.assign('/agenda');
      return;
    }

    router.replace('/agenda');
  }, [router]);

  React.useEffect(() => {
    if (
      !isAuthenticated ||
      ownerPasswordRecoveryActive ||
      forceOwnerAccess ||
      redirectLockRef.current
    ) {
      return;
    }

    redirectLockRef.current = true;
    navigateToOwnerAgenda();
  }, [forceOwnerAccess, isAuthenticated, navigateToOwnerAgenda, ownerPasswordRecoveryActive]);

  if (isAuthenticated && !ownerPasswordRecoveryActive && !forceOwnerAccess) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f6f6f3',
        }}
      >
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (showResetDoneMessage) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SALON PRO</Text>
          <View style={styles.wordmarkWrap}>
            <AppWordmark />
          </View>
          <Text style={styles.title}>Password resettata con successo</Text>
          <Text style={styles.body}>
            Ora torna in Accedi e prova il login con la nuova password. Questo reset è già stato completato correttamente.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.replace('/proprietario?reset=1')}
          >
            <Text style={styles.buttonText}>Vai in accedi</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.ownerAccessWrap}>
      {showDesktopEntryHint ? (
        <View style={styles.desktopHintBanner}>
          <Text style={styles.desktopHintEyebrow}>Accesso salone da computer</Text>
          <Text style={styles.desktopHintTitle}>Back office salone da PC o Mac</Text>
          <Text style={styles.desktopHintBody}>
            Accedi con email e password del salone. Se lavori da computer, questo è l’ingresso giusto e non serve aprire l’app.
          </Text>
        </View>
      ) : null}
      <OwnerAccessScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  ownerAccessWrap: {
    flex: 1,
    backgroundColor: '#e6edf3',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#e6edf3',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: '#9a6b32',
    marginBottom: 12,
  },
  wordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 12,
  },
  body: {
    fontSize: 18,
    lineHeight: 28,
    color: '#475569',
    marginBottom: 22,
  },
  button: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  desktopHintBanner: {
    marginHorizontal: 18,
    marginTop: 18,
    marginBottom: 4,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#CFE0F2',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  desktopHintEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#315ea8',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  desktopHintTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  desktopHintBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
});
