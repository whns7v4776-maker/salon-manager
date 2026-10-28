import { useAgendaPopupStyles } from './agenda-popup-theme';
import { useAccessAppearance } from './access-premium';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { HapticNativePressable as Pressable } from './ui/haptic-native-controls';

type EmailOtpModalProps = {
  visible: boolean;
  email: string;
  resetKey?: string | number;
  busy?: boolean;
  resendAvailableAt?: number;
  expired?: boolean;
  countdown?: string;
  message?: string;
  title?: string;
  nativeCompactLayout?: boolean;
  onVerify: (code: string) => void | Promise<unknown>;
  onResend: () => void;
  onBack: () => void;
};

export function EmailOtpModal({
  visible,
  email,
  resetKey,
  busy = false,
  resendAvailableAt = 0,
  expired = false,
  countdown,
  message,
  title = 'Conferma la tua email',
  nativeCompactLayout = false,
  onVerify,
  onResend,
  onBack,
}: EmailOtpModalProps) {
  const {palette:p}=useAccessAppearance();
  const themedBase=useAgendaPopupStyles(styles);
  const themedStyles={...themedBase,
    verifyButton:{...themedBase.verifyButton,backgroundColor:p.action,shadowOpacity:0},
    verifyButtonText:{...themedBase.verifyButtonText,color:p.actionText},
    iconWrap:{...themedBase.iconWrap,backgroundColor:p.field,borderColor:p.line},
  };
  const inputRef = useRef<TextInput | null>(null);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    if(!visible)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[visible,resendAvailableAt]);
  const resendSeconds=Math.max(0,Math.ceil((resendAvailableAt-now)/1000));
  const entrance = useRef(new Animated.Value(0)).current;
  const [code, setCode] = useState('');
  const [verificationAttempted, setVerificationAttempted] = useState(false);
  const useNativeCompactLayout = nativeCompactLayout && Platform.OS !== 'web';

  useEffect(() => {
    setCode('');
    setVerificationAttempted(false);
  }, [email, resetKey, visible]);

  useEffect(() => {
    if (expired) setCode('');
  }, [expired]);

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      return;
    }
    Animated.spring(entrance, {
      toValue: 1,
      damping: 17,
      stiffness: 190,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(focusTimer);
  }, [entrance, visible]);

  const cleanCode = code.replace(/\D+/g, '').slice(0, 6);
  const canVerify = cleanCode.length === 6 && !busy && !expired;
  const feedbackMessage = expired
    ? 'Codice OTP scaduto. Premi «Invia di nuovo» qui sotto per riceverne un altro.'
    : message;
  const submitCode = () => {
    if (!canVerify) return;
    setVerificationAttempted(true);
    return onVerify(cleanCode);
  };
  const handleCodeChange = (value: string) => {
    const numericValue = value.replace(/\D+/g, '').slice(0, 6);
    // Mail can occasionally offer a non-numeric label instead of the OTP.
    // Ignore that suggestion so it cannot erase digits already entered.
    if (value.length > 0 && numericValue.length === 0) return;
    setCode(numericValue);
  };

  const card = (
    <Animated.View
      style={[
        themedStyles.card,
        useNativeCompactLayout && themedStyles.cardNativeCompact,
        {
          opacity: entrance,
          transform: [
            {
              scale: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [22, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[themedStyles.iconWrap, useNativeCompactLayout && themedStyles.iconWrapNativeCompact]}>
        <Ionicons
          name="shield-checkmark"
          size={useNativeCompactLayout ? 24 : 32}
          color={p.ink}
        />
      </View>
      <Text style={[themedStyles.eyebrow, useNativeCompactLayout && themedStyles.eyebrowNativeCompact]}>
        VERIFICA EMAIL
      </Text>
      <Text
        style={[themedStyles.title, useNativeCompactLayout && themedStyles.titleNativeCompact]}
        numberOfLines={useNativeCompactLayout ? 1 : undefined}
        adjustsFontSizeToFit={useNativeCompactLayout}
        minimumFontScale={0.78}
      >
        {title}
      </Text>
      <Text style={[themedStyles.subtitle, useNativeCompactLayout && themedStyles.subtitleNativeCompact]}>
        Inserisci il codice a 6 cifre per
      </Text>
      <Text
        style={[themedStyles.email, useNativeCompactLayout && themedStyles.emailNativeCompact]}
        numberOfLines={Platform.OS==='web'?undefined:1}
      >
        {email}
      </Text>

      <TextInput
        ref={inputRef}
        value={cleanCode}
        onChangeText={handleCodeChange}
        onSubmitEditing={canVerify ? submitCode : undefined}
        editable={!busy}
        keyboardType="number-pad"
        textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
        autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'off'}
        importantForAutofill={Platform.OS === 'android' ? 'no' : undefined}
        maxLength={6}
        selectionColor="#2563eb"
        placeholder="000000"
        placeholderTextColor="#b5bfd0"
        style={[themedStyles.codeInput, useNativeCompactLayout && themedStyles.codeInputNativeCompact]}
      />

      <View style={[themedStyles.statusRow, useNativeCompactLayout && themedStyles.statusRowNativeCompact]}>
        <Ionicons
          name={expired ? 'alert-circle-outline' : 'time-outline'}
          size={useNativeCompactLayout ? 16 : 18}
          color={expired ? (p.night?'#E8ABA6':'#A14440') : p.muted}
        />
        <Text
          style={[
            themedStyles.statusText,
            useNativeCompactLayout && themedStyles.statusTextNativeCompact,
            expired && themedStyles.statusTextError,
          ]}
        >
          {expired
            ? 'Codice scaduto: richiedine uno nuovo'
            : countdown
              ? `Scade tra ${countdown}`
              : 'Il codice resta valido per pochi minuti'}
        </Text>
      </View>

      {feedbackMessage ? (
        <Text
          accessibilityRole={expired || verificationAttempted ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          style={[
            themedStyles.message,
            useNativeCompactLayout && themedStyles.messageNativeCompact,
            (expired || verificationAttempted) && themedStyles.messageError,
          ]}
        >
          {feedbackMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Verifica codice OTP"
        disabled={!canVerify}
        onPress={submitCode}
        style={({ pressed }) => [
          themedStyles.verifyButton,
          useNativeCompactLayout && themedStyles.verifyButtonNativeCompact,
          !canVerify && themedStyles.verifyButtonDisabled,
          pressed && canVerify && themedStyles.verifyButtonPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={p.actionText} />
        ) : (
          <>
            <Ionicons
              name="checkmark-circle"
              size={useNativeCompactLayout ? 21 : 24}
              color={p.actionText}
            />
            <Text
              style={[
                themedStyles.verifyButtonText,
                useNativeCompactLayout && themedStyles.verifyButtonTextNativeCompact,
              ]}
            >
              Verifica codice
            </Text>
          </>
        )}
      </Pressable>

      <View style={[themedStyles.secondaryRow, useNativeCompactLayout && themedStyles.secondaryRowNativeCompact]}>
        <Pressable
          disabled={busy}
          onPress={onBack}
          style={({ pressed }) => [
            themedStyles.secondaryButton,
            useNativeCompactLayout && themedStyles.secondaryButtonNativeCompact,
            pressed && !busy && themedStyles.secondaryButtonPressed,
          ]}
        >
          <Text style={[themedStyles.secondaryText, useNativeCompactLayout && themedStyles.secondaryTextNativeCompact]}>
            Torna ai dati
          </Text>
        </Pressable>
        <View style={themedStyles.divider} />
        <Pressable
          disabled={busy || resendSeconds>0}
          onPress={onResend}
          style={({ pressed }) => [
            themedStyles.secondaryButton,
            (busy||resendSeconds>0)&&{opacity:0.45},
            useNativeCompactLayout && themedStyles.secondaryButtonNativeCompact,
            pressed && !busy && themedStyles.secondaryButtonPressed,
          ]}
        >
          <Text style={[themedStyles.resendText, useNativeCompactLayout && themedStyles.secondaryTextNativeCompact]}>
            {resendSeconds>0?`Reinvia tra ${resendSeconds}s`:'Invia di nuovo'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onBack}
    >
      <KeyboardAvoidingView
        style={[themedStyles.overlay, useNativeCompactLayout && themedStyles.overlayNativeCompact]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined} />
        {useNativeCompactLayout ? (
          <ScrollView
            style={themedStyles.nativeCompactScroll}
            contentContainerStyle={themedStyles.nativeCompactScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {card}
          </ScrollView>
        ) : (
          card
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

type OtpVerifiedActionHaloProps = {
  active: boolean;
  children: React.ReactNode;
  premiumNative?: boolean;
  buttonOnly?: boolean;
};

export function OtpVerifiedActionHalo({
  active,
  children,
  premiumNative = false,
  buttonOnly = false,
}: OtpVerifiedActionHaloProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const usePremiumNative = premiumNative && Platform.OS !== 'web';

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const highlightedChildren =
    active && React.isValidElement<{ style?: unknown }>(children)
      ? React.cloneElement(children, {
          style: [children.props.style, styles.haloReadyButton],
        })
      : children;

  return (
    <Animated.View
      style={[
        styles.halo,
        buttonOnly && styles.haloButtonOnly,
        usePremiumNative && styles.haloPremiumNative,
        usePremiumNative && active && styles.haloPremiumNativeActive,
        active &&
          (buttonOnly
            ? {
                shadowOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.58] }),
                shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [8, 19] }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.008],
                    }),
                  },
                ],
              }
            : usePremiumNative
            ? {
                borderColor: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(16, 185, 129, 0.42)', 'rgba(34, 197, 94, 0.82)'],
                }),
                backgroundColor: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(236, 253, 245, 0.025)', 'rgba(220, 252, 231, 0.07)'],
                }),
                shadowOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.09, 0.26] }),
                shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [5, 11] }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.012],
                    }),
                  },
                ],
              }
            : {
                borderColor: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(45, 212, 191, 0.35)', 'rgba(34, 197, 94, 1)'],
                }),
                backgroundColor: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(34, 197, 94, 0.04)', 'rgba(34, 197, 94, 0.13)'],
                }),
                shadowOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.48] }),
                shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [7, 16] }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.012],
                    }),
                  },
                ],
              }),
      ]}
    >
      {highlightedChildren}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: 'rgba(7, 16, 31, 0.72)', paddingBottom: 0 },
  overlayNativeCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8, paddingBottom: 0 , justifyContent: 'flex-end' },
  nativeCompactScroll: {
    flex: 1,
    width: '100%',
  },
  nativeCompactScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 4, paddingBottom: 0 },
  card: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    borderRadius: 34,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 22,
  },
  cardNativeCompact: {
    borderRadius: 27,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 14,
  },
  iconWrapNativeCompact: {
    width: 44,
    height: 44,
    borderRadius: 15,
    marginBottom: 5,
  },
  eyebrow: { color: '#2563eb', fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.8 },
  eyebrowNativeCompact: { fontSize: 10, lineHeight: 13, letterSpacing: 1.45 },
  title: { color: '#0f172a', fontSize: 27, lineHeight: 33, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  titleNativeCompact: { fontSize: 23, lineHeight: 27, marginTop: 3 },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 21, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  subtitleNativeCompact: { fontSize: 13, lineHeight: 16, marginTop: 6 },
  email: { maxWidth: '100%', color: '#1e3a8a', fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 2 },
  emailNativeCompact: { fontSize: 14, lineHeight: 18, marginTop: 1 },
  codeInput: {
    width: '100%',
    height: 78,
    borderRadius: 22,
    marginTop: 24,
    paddingHorizontal: 14,
    textAlign: 'center',
    color: '#0f172a',
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  codeInputNativeCompact: {
    height: 58,
    borderRadius: 18,
    marginTop: 10,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 9,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13 },
  statusRowNativeCompact: { gap: 5, marginTop: 7 },
  statusText: { flexShrink: 1, color: '#64748b', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  statusTextNativeCompact: { fontSize: 12, lineHeight: 16 },
  statusTextError: { color: '#be123c' },
  message: { color: '#475569', fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  messageNativeCompact: { fontSize: 11.5, lineHeight: 15, marginTop: 5 },
  messageError: { color: '#be123c' },
  verifyButton: {
    width: '100%',
    minHeight: 62,
    borderRadius: 20,
    marginTop: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#0f172a',
    shadowColor: '#2563eb',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  verifyButtonNativeCompact: {
    minHeight: 48,
    borderRadius: 16,
    marginTop: 9,
    gap: 7,
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  verifyButtonDisabled: { opacity: 0.42, shadowOpacity: 0 },
  verifyButtonPressed: { transform: [{ scale: 0.985 }] },
  verifyButtonText: { color: '#ffffff', fontSize: 18, lineHeight: 24, fontWeight: '900' },
  verifyButtonTextNativeCompact: { fontSize: 16, lineHeight: 20 },
  secondaryRow: { width: '100%', flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  secondaryRowNativeCompact: { marginTop: 4 },
  secondaryButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  secondaryButtonNativeCompact: { minHeight: 36 },
  secondaryButtonPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  divider: { width: 1, height: 22, backgroundColor: '#e2e8f0' },
  secondaryText: { color: '#64748b', fontSize: 14, fontWeight: '800' },
  resendText: { color: '#1d4ed8', fontSize: 14, fontWeight: '900' },
  secondaryTextNativeCompact: { fontSize: 12.5 },
  halo: {
    position: 'relative',
    width: '100%',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 24,
    padding: 4,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
  },
  haloPremiumNative: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 3,
  },
  haloPremiumNativeActive: {
    marginTop: 4,
  },
  haloButtonOnly: {
    borderWidth: 0,
    borderRadius: 20,
    padding: 0,
    backgroundColor: 'transparent',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
  },
  haloReadyButton: {
    backgroundColor: '#078F68',
    borderColor: '#6EE7B7',
    borderWidth: 1,
    shadowColor: '#10b981',
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
});
