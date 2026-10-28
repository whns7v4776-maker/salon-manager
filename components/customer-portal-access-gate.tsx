import { useAgendaPopupStyles } from './agenda-popup-theme';
import { useAccessAppearance } from './access-premium';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppWordmark } from './app-wordmark';
import { EmailOtpModal } from './email-otp-modal';
import { PasswordRequirements, PasswordMatchRequirement } from './password-requirements';
import { PasswordTextInput } from './ui/password-text-input';
import { currentPortalAccessChallenge, subscribePortalAccessChallenges, completePortalAccessChallenge, cancelPortalAccessChallenge, authenticateCustomerPortal, type PortalAccessChallenge } from '../src/lib/customer-portal-access';
import { publicSupabase } from '../src/lib/supabase';
import { withClientDeadline } from '../src/lib/client-request-deadline';
import { requestEmailOtp, verifyEmailOtp, buildEmailOtpRequestErrorMessage, buildEmailOtpVerificationErrorMessage, parseEmailOtpExpiresAt, formatEmailOtpCountdown } from '../src/lib/email-verification';
import { validateStrongPassword } from '../src/lib/password-policy';

export function CustomerPortalAccessGate() {
  const [challenge, setChallenge] = useState(currentPortalAccessChallenge);
  useEffect(() => {
    const update = () => setChallenge(currentPortalAccessChallenge());
    const off = subscribePortalAccessChallenges(update); update(); return off;
  }, []);
  return challenge ? <AccessChallenge key={challenge.id} challenge={challenge} /> : null;
}

function AccessChallenge({ challenge }: { challenge: PortalAccessChallenge }) {
  const {palette:p}=useAccessAppearance();
  const themedBase=useAgendaPopupStyles(basePortalStyles);
  const styles={...themedBase,action:{...themedBase.action,backgroundColor:p.action},actionText:{...themedBase.actionText,color:p.actionText}};
  const activate = challenge.kind === 'activate';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpToken, setOtpToken] = useState(challenge.emailCompletionToken || '');
  const [emailAlreadyVerified, setEmailAlreadyVerified] = useState(Boolean(challenge.emailCompletionToken));
  const [expires, setExpires] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  const working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!expires) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [expires]);
  const current = () => mounted.current && currentPortalAccessChallenge()?.id === challenge.id;
  const fail = (error: unknown) => {
    if (current()) setMessage(error instanceof Error ? error.message : 'Non riesco a completare l’accesso. Controlla la connessione e riprova.');
  };
  const finish = async () => {
    const token = await authenticateCustomerPortal(challenge.identity, password);
    if (current()) completePortalAccessChallenge(challenge.id, token);
  };
  const send = async () => {
    if (working.current) return;
    if (activate) {
      const policy = validateStrongPassword(password);
      if (!policy.valid) { setMessage(policy.message); return; }
      if (password !== confirmation) { setMessage('Le due password non coincidono.'); return; }
    }
    if (activate && emailAlreadyVerified && otpToken) { await verify(''); return; }
    working.current = true; setBusy(true); setMessage('');
    try {
      if (!activate) { await finish(); return; }
      const result = await requestEmailOtp({ ...challenge.identity, email: challenge.identity.email, salonCode: challenge.identity.salonCode, customerPhone: challenge.identity.phone, purpose: 'client_password_activation' });
      if (!current()) return;
      if (!result.ok && result.error !== 'rate_limited' && result.error !== 'request_timeout') {
        setMessage(buildEmailOtpRequestErrorMessage(result)); return;
      }
      if (!result.ok) setMessage(buildEmailOtpRequestErrorMessage(result));
      setOtpToken('');
      setExpires(result.ok ? parseEmailOtpExpiresAt(result.expiresAt) : Date.now() + 15 * 60_000);
      setResendAt(Date.now() + (!result.ok && result.retryAfterSeconds ? result.retryAfterSeconds : 45) * 1000);
      setNow(Date.now()); setVersion(v => v + 1); setOtpOpen(true);
    } catch (error) { fail(error); }
    finally { working.current = false; if (current()) setBusy(false); }
  };
  const verify = async (code: string) => {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage('');
    try {
      let verified = otpToken;
      if (!verified) {
        const result = await verifyEmailOtp({ email: challenge.identity.email, salonCode: challenge.identity.salonCode, purpose: 'client_password_activation', code });
        if (!current()) return;
        if (!result.ok) { setMessage(buildEmailOtpVerificationErrorMessage(result.error)); return; }
        verified = result.token; setOtpToken(verified);
      }
      const { data, error } = await withClientDeadline(publicSupabase.rpc('activate_public_customer_password_resumable_v1', {
        p_salon_code: challenge.identity.salonCode, p_customer_email: challenge.identity.email,
        p_customer_phone: challenge.identity.phone, p_customer_password: password, p_otp_token: verified,
      }));
      if (!current()) return;
      if (error || !data?.ok) {
        const detail = String(error?.message ?? '');
        if (detail.includes('otp_invalid')) { setEmailAlreadyVerified(false); setOtpToken(''); }
        setMessage(detail.includes('already_enabled') ? 'La password risulta già attivata. Torna indietro e accedi con la password scelta.'
          : detail.includes('otp_invalid') ? 'La verifica è scaduta. Richiedi un nuovo codice.'
          : 'Non ho ricevuto conferma del salvataggio. Riprova: il profilo resta lo stesso.'); return;
      }
      // Retry uses the same verified operation if the activation response was
      // lost. Never reset the credential or ask for a second registration.
      await finish();
    } catch (error) { fail(error); }
    finally { working.current = false; if (current()) setBusy(false); }
  };
  const cancel = () => { if (!working.current) cancelPortalAccessChallenge(challenge.id); };
  return <>
    <Modal transparent visible={!otpOpen} animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <AppWordmark maxWidth={270} compact showAtmosphere={false} />
            <Text style={styles.title}>{activate ? 'Proteggi il tuo account' : 'Conferma il tuo accesso'}</Text>
            <Text style={styles.body}>{activate ? 'Verifica la tua email e scegli una password per continuare con il profilo che usi già. Appuntamenti e vantaggi restano al loro posto.' : 'Inserisci la password che usi già per riaprire in sicurezza i tuoi dati.'}</Text>
            <Text style={styles.email}>{challenge.identity.email}</Text>
            <PasswordTextInput style={styles.input} accessibilityLabel={activate ? 'Nuova password' : 'Password'} placeholder={activate ? 'Scegli una password' : 'Password'} value={password} onChangeText={setPassword} editable={!busy} autoCapitalize="none" autoCorrect={false} textContentType={activate ? 'newPassword' : 'password'} />
            {activate ? <>
              <PasswordRequirements password={password} compact alignLeft />
              <PasswordTextInput style={styles.input} accessibilityLabel="Conferma password" placeholder="Ripeti la password" value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" />
              <PasswordMatchRequirement password={password} confirmPassword={confirmation} compact />
            </> : null}
            {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !password} onPress={() => void send()} style={[styles.action, (busy || !password) && styles.disabled]}>
              {busy ? <ActivityIndicator color={p.actionText} /> : <Text style={styles.actionText}>{activate ? emailAlreadyVerified ? 'Salva password e continua' : 'Invia codice email' : 'Continua'}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={styles.back}><Text style={styles.body}>Torna indietro</Text></Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <EmailOtpModal visible={otpOpen} email={challenge.identity.email} title="Conferma la tua email" resetKey={version} busy={busy} resendAvailableAt={resendAt} expired={!!expires && now >= expires} countdown={expires ? formatEmailOtpCountdown(expires, now) : ''} message={message} onVerify={verify} onResend={() => void send()} onBack={() => { if (!busy) { setOtpOpen(false); setMessage(''); } }} />
  </>;
}

const basePortalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.48)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, maxHeight: '90%', borderRadius: 28, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  content: { padding: 24, gap: 14 }, title: { fontSize: 24, fontWeight: '800', color: '#142338', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: '#526277', textAlign: 'center' }, email: { fontSize: 15, fontWeight: '600', color: '#223C56', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#D4DFEA', borderRadius: 18, backgroundColor: '#F6F8FB', padding: 16, fontSize: 16, color: '#142338' },
  action: { minHeight: 52, borderRadius: 18, backgroundColor: '#1D354D', alignItems: 'center', justifyContent: 'center', padding: 14 },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, disabled: { opacity: 0.5 }, back: { padding: 8 }, error: { color: '#A32929', fontSize: 14, lineHeight: 20 },
});
