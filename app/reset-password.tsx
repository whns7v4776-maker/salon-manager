import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { useAppContext } from '../src/context/AppContext';
import { isValidEmail } from '../src/lib/validators';

const resolveCurrentUrl = async () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }

  return ExpoLinking.getInitialURL();
};

const OWNER_RESET_SAFE_ROUTE = '/proprietario?reset=1';

export default function ResetPasswordScreen() {
  const {
    ownerPasswordRecoveryActive,
    activateOwnerPasswordRecoveryFromUrl,
    completeOwnerPasswordRecovery,
    requestOwnerPasswordReset,
  } = useAppContext();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [resetEmail, setResetEmail] = React.useState('');
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error' | 'success'>(
    ownerPasswordRecoveryActive ? 'ready' : 'loading'
  );
  const [message, setMessage] = React.useState(
    ownerPasswordRecoveryActive
      ? 'Inserisci la nuova password del tuo account proprietario.'
      : 'Sto verificando il link di recupero password.'
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRequestingNewLink, setIsRequestingNewLink] = React.useState(false);
  const [requestMessage, setRequestMessage] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    if (ownerPasswordRecoveryActive) {
      setStatus('ready');
      setMessage('Inserisci la nuova password del tuo account proprietario.');
      return () => {
        cancelled = true;
      };
    }

    void resolveCurrentUrl().then(async (url) => {
      if (cancelled) {
        return;
      }

      const result = await activateOwnerPasswordRecoveryFromUrl(url);
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setStatus('error');
        setMessage(result.error ?? 'Il link di recupero non e valido o e scaduto.');
        return;
      }

      setStatus('ready');
      setMessage('Inserisci la nuova password del tuo account proprietario.');
    });

    return () => {
      cancelled = true;
    };
  }, [activateOwnerPasswordRecoveryFromUrl, ownerPasswordRecoveryActive]);

  const canSubmit =
    password.trim().length >= 6 &&
    confirmPassword.trim().length >= 6 &&
    password === confirmPassword &&
    !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setStatus('error');
      setMessage(
        password !== confirmPassword
          ? 'Le due password non coincidono.'
          : 'La nuova password deve avere almeno 6 caratteri.'
      );
      return;
    }

    setIsSaving(true);
    const result = await completeOwnerPasswordRecovery(password);
    setIsSaving(false);

    if (!result.ok) {
      setStatus('error');
      setMessage(result.error ?? 'Aggiornamento password non riuscito.');
      return;
    }

    setStatus('success');
    setMessage('Password aggiornata correttamente. Ora puoi accedere al backoffice.');
    setPassword('');
    setConfirmPassword('');
  };

  const handleRequestNewLink = async () => {
    const normalizedEmail = resetEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setRequestMessage('Inserisci una mail valida per ricevere un nuovo link.');
      return;
    }

    setIsRequestingNewLink(true);
    setRequestMessage('');
    const result = await requestOwnerPasswordReset(normalizedEmail);
    setIsRequestingNewLink(false);

    if (!result.ok) {
      setRequestMessage(result.error ?? 'Invio nuovo link non riuscito.');
      return;
    }

    setRequestMessage('Nuovo link inviato. Apri l’ultima mail e riprova da lì.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.appEyebrow}>SALON PRO</Text>
          <View style={styles.appWordmarkWrap}>
            <AppWordmark />
          </View>
          <Text style={styles.appSubtitle}>
            Recupera l’accesso proprietario in modo sicuro senza rientrare nell’onboarding o nella demo.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Reset password proprietario</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {status === 'ready'
                  ? 'Link valido'
                  : status === 'success'
                  ? 'Completato'
                  : status === 'loading'
                  ? 'Verifica'
                  : 'Assistenza'}
              </Text>
            </View>
          </View>

          <Text style={styles.helperText}>{message}</Text>

          {status === 'loading' ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#0f766e" />
            </View>
          ) : null}

          {status === 'ready' ? (
            <View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Nuova password"
                placeholderTextColor="#9a9a9a"
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Conferma nuova password"
                placeholderTextColor="#9a9a9a"
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!canSubmit || pressed) && styles.primaryButtonPressed,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salva nuova password</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {status === 'error' ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorPanelTitle}>Richiedi un nuovo link</Text>
              <Text style={styles.errorPanelText}>
                Se il link è incompleto o scaduto, inserisci la mail proprietario e ti mando subito un nuovo link corretto.
              </Text>
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="Email account proprietario"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              {requestMessage ? (
                <Text
                  style={[
                    styles.requestMessage,
                    requestMessage.includes('Nuovo link inviato')
                      ? styles.requestMessageSuccess
                      : styles.requestMessageError,
                  ]}
                >
                  {requestMessage}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={isRequestingNewLink}
                onPress={handleRequestNewLink}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (isRequestingNewLink || pressed) && styles.primaryButtonPressed,
                ]}
              >
                {isRequestingNewLink ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Richiedi nuovo link</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace(OWNER_RESET_SAFE_ROUTE)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Apri accesso proprietario sicuro</Text>
              </Pressable>
            </View>
          ) : null}

          {status === 'success' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(OWNER_RESET_SAFE_ROUTE)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Vai al login proprietario</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6edf3',
  },
  content: {
    padding: 20,
    paddingTop: 44,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#fbfdff',
    borderRadius: 32,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  appEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: '#9a6b32',
    marginBottom: 10,
  },
  appWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
  },
  statusBadge: {
    backgroundColor: '#f8fbfe',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d8e4f3',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6d6257',
    marginBottom: 18,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#f8fbfe',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 10,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#d8e4f3',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonPressed: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonPressed: {
    opacity: 0.72,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  errorPanel: {
    backgroundColor: '#f8fbfe',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d8e4f3',
  },
  errorPanelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  errorPanelText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 12,
  },
  requestMessage: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  requestMessageSuccess: {
    color: '#0f766e',
  },
  requestMessageError: {
    color: '#b91c1c',
  },
});
