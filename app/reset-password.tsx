import { DockedSheetSurface } from '../components/ui/docked-sheet-surface';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { HapticNativePressable as Pressable } from '../components/ui/haptic-native-controls';
import { AppWordmark } from '../components/app-wordmark';
import {
  PasswordMatchRequirement,
  PasswordRequirements,
} from '../components/password-requirements';
import { PasswordTextInput } from '../components/ui/password-text-input';
import { useAppContext } from '../src/context/AppContext';
import { validateStrongPassword } from '../src/lib/password-policy';
import { isValidEmail } from '../src/lib/validators';

const resolveCurrentUrl = async () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }

  return ExpoLinking.getInitialURL();
};

const OWNER_RESET_SAFE_ROUTE = '/?side=owner&ownerReset=1';
const OWNER_RESET_SUCCESS_ROUTE = '/?side=owner&ownerReset=done';
type ResetPasswordStatus = 'loading' | 'ready' | 'linkError' | 'success';
type ResetFeedbackDialog = {
  tone: 'success' | 'error';
  title: string;
  message: string;
};

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
  const [status, setStatus] = React.useState<ResetPasswordStatus>(
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
  const [requestMessageType, setRequestMessageType] = React.useState<'success' | 'error' | null>(
    null
  );
  const [feedbackDialog, setFeedbackDialog] = React.useState<ResetFeedbackDialog | null>(null);
  const resetCompletedRef = React.useRef(false);

  const handleCloseAfterReset = React.useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace(OWNER_RESET_SUCCESS_ROUTE);
      return;
    }

    router.replace(OWNER_RESET_SUCCESS_ROUTE);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    if (resetCompletedRef.current) {
      return () => {
        cancelled = true;
      };
    }

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
        setStatus('linkError');
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

  const passwordPolicy = validateStrongPassword(password.trim());
  const canSubmit = passwordPolicy.valid && password === confirmPassword && !isSaving;
  const canAttemptSubmit =
    password.trim().length > 0 && confirmPassword.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) {
      const validationMessage =
        !passwordPolicy.valid
          ? passwordPolicy.message
          : 'Le due password non coincidono.';
      setStatus('ready');
      setMessage(validationMessage);
      setFeedbackDialog({
        tone: 'error',
        title: 'Controlla la nuova password',
        message: validationMessage,
      });
      return;
    }

    setIsSaving(true);
    resetCompletedRef.current = true;
    const result = await completeOwnerPasswordRecovery(password).catch(() => ({
      ok: false as const,
      error: 'Aggiornamento password non riuscito. Controlla la connessione e riprova.',
    }));
    setIsSaving(false);

    if (!result.ok) {
      const errorMessage = result.error ?? 'Aggiornamento password non riuscito.';
      resetCompletedRef.current = false;
      setStatus('ready');
      setMessage(errorMessage);
      setFeedbackDialog({
        tone: 'error',
        title: 'Password non aggiornata',
        message: errorMessage,
      });
      return;
    }

    setPassword('');
    setConfirmPassword('');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/reset-password');
      setStatus('success');
      setMessage('Password resettata correttamente. Puoi chiudere questa pagina.');
      setFeedbackDialog({
        tone: 'success',
        title: 'Password aggiornata',
        message:
          'La nuova password è stata salvata e verificata correttamente. Ora puoi usarla per accedere al salone.',
      });
      return;
    }

    setStatus('success');
    setMessage('Password resettata correttamente.');
    setFeedbackDialog({
      tone: 'success',
      title: 'Password aggiornata',
      message:
        'La nuova password è stata salvata e verificata correttamente. Ora puoi usarla per accedere al salone.',
    });
  };

  const handleRequestNewLink = async () => {
    const normalizedEmail = resetEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setRequestMessage('Inserisci una mail valida per ricevere un nuovo link.');
      setRequestMessageType('error');
      Alert.alert('Email non valida', 'Inserisci una mail valida per ricevere il link di reset.');
      return;
    }

    setIsRequestingNewLink(true);
    setRequestMessage('');
    setRequestMessageType(null);
    const result = await requestOwnerPasswordReset(normalizedEmail);
    setIsRequestingNewLink(false);

    if (!result.ok) {
      const errorMessage = result.error ?? 'Invio nuovo link non riuscito.';
      setRequestMessage(errorMessage);
      setRequestMessageType('error');
      Alert.alert('Link non inviato', errorMessage);
      return;
    }

    const successMessage = 'Link inviato con successo. Apri l’ultima mail e riprova da lì.';
    setRequestMessage(successMessage);
    setRequestMessageType('success');
    Alert.alert('Link inviato', successMessage);
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
              <PasswordTextInput
                value={password}
                onChangeText={setPassword}
                compactHorizontalPadding={Platform.OS === 'android'}
                placeholder="Nuova password"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.input}
              />
              <PasswordRequirements
                password={password.trim()}
                compact={Platform.OS === 'android'}
                alignLeft
              />
              <PasswordTextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                compactHorizontalPadding={Platform.OS === 'android'}
                placeholder="Conferma nuova password"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.input}
              />
              <PasswordMatchRequirement
                password={password}
                confirmPassword={confirmPassword}
                compact={Platform.OS === 'android'}
                alignLeft
              />
              <Pressable
                accessibilityRole="button"
                disabled={!canAttemptSubmit}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!canAttemptSubmit || pressed) && styles.primaryButtonPressed,
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

          {status === 'linkError' ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorPanelTitle}>Richiedi un nuovo link</Text>
              <Text style={styles.errorPanelText}>
                Se il link è incompleto o scaduto, inserisci la mail proprietario e ti mando subito un nuovo link corretto.
              </Text>
              <TextInput
                value={resetEmail}
                onChangeText={(value) => {
                  setResetEmail(value);
                  if (requestMessage) {
                    setRequestMessage('');
                    setRequestMessageType(null);
                  }
                }}
                placeholder="Email account proprietario"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              {requestMessage ? (
                <View
                  style={[
                    styles.requestMessageBox,
                    requestMessageType === 'success'
                      ? styles.requestMessageBoxSuccess
                      : styles.requestMessageBoxError,
                  ]}
                >
                  <Text
                    style={[
                      styles.requestMessage,
                      requestMessageType === 'success'
                        ? styles.requestMessageSuccess
                        : styles.requestMessageError,
                    ]}
                  >
                    {requestMessage}
                  </Text>
                </View>
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
            <View style={styles.successPanel}>
              <Text style={styles.successPanelTitle}>Password resettata con successo</Text>
              <Text style={styles.successPanelText}>
                La nuova password è stata salvata. Puoi chiudere questa pagina: questo link non va più riusato dopo il reset riuscito.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleCloseAfterReset}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {Platform.OS === 'web' ? 'Chiudi pagina' : 'Torna all’accesso'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={feedbackDialog !== null}
        onRequestClose={() => {
          if (feedbackDialog?.tone === 'success') {
            handleCloseAfterReset();
            return;
          }
          setFeedbackDialog(null);
        }}
      >
        <View style={styles.feedbackModalBackdrop}>
          <DockedSheetSurface
            accessibilityRole="alert"
            style={[
              styles.feedbackModalCard,
              feedbackDialog?.tone === 'success'
                ? styles.feedbackModalCardSuccess
                : styles.feedbackModalCardError,
            ]}
          >
            <View
              style={[
                styles.feedbackModalIcon,
                feedbackDialog?.tone === 'success'
                  ? styles.feedbackModalIconSuccess
                  : styles.feedbackModalIconError,
              ]}
            >
              <Text style={styles.feedbackModalIconText}>
                {feedbackDialog?.tone === 'success' ? '✓' : '!'}
              </Text>
            </View>
            <Text style={styles.feedbackModalTitle}>{feedbackDialog?.title ?? ''}</Text>
            <Text style={styles.feedbackModalText}>{feedbackDialog?.message ?? ''}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (feedbackDialog?.tone === 'success') {
                  setFeedbackDialog(null);
                  handleCloseAfterReset();
                  return;
                }
                setFeedbackDialog(null);
              }}
              style={({ pressed }) => [
                styles.feedbackModalButton,
                feedbackDialog?.tone === 'success'
                  ? styles.feedbackModalButtonSuccess
                  : styles.feedbackModalButtonError,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.feedbackModalButtonText}>
                {feedbackDialog?.tone === 'success' ? 'OK' : 'Riprova'}
              </Text>
            </Pressable>
          </DockedSheetSurface>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 58 : 42,
    paddingBottom: 42,
  },
  heroCard: {
    paddingHorizontal: 4,
    paddingBottom: 18,
    marginBottom: 4,
  },
  appEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#8A6A18',
    marginBottom: 8,
    textAlign: 'center',
  },
  appWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  appSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#667085',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    shadowColor: '#0F172A',
    shadowOpacity: Platform.OS === 'ios' ? 0.08 : 0.10,
    shadowRadius: Platform.OS === 'ios' ? 18 : 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
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
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: '#0F172A',
  },
  statusBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#667085',
    marginBottom: 18,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    minHeight: 54,
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: '#EEF2F7',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 54,
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '900',
  },
  errorPanel: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  errorPanelTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  errorPanelText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#667085',
    marginBottom: 12,
  },
  requestMessageBox: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 8,
  },
  requestMessageBoxSuccess: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A6F4C5',
  },
  requestMessageBoxError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  requestMessage: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  requestMessageSuccess: {
    color: '#027A48',
  },
  requestMessageError: {
    color: '#B42318',
  },
  successPanel: {
    marginTop: 6,
  },
  successPanelTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  successPanelText: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  feedbackModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'flex-end', paddingBottom: 0 },
  feedbackModalCard: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  feedbackModalCardSuccess: {
    borderColor: '#A6F4C5',
  },
  feedbackModalCardError: {
    borderColor: '#FECACA',
  },
  feedbackModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  feedbackModalIconSuccess: {
    backgroundColor: '#059669',
  },
  feedbackModalIconError: {
    backgroundColor: '#DC2626',
  },
  feedbackModalIconText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
  },
  feedbackModalTitle: {
    color: '#0F172A',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  feedbackModalText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  feedbackModalButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  feedbackModalButtonSuccess: {
    backgroundColor: '#047857',
  },
  feedbackModalButtonError: {
    backgroundColor: '#B91C1C',
  },
  feedbackModalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
