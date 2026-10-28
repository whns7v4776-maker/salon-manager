import { useAccessAppearance } from '../access-premium';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Clipboard, Platform, StyleSheet, Text, View } from 'react-native';
import { HapticNativePressable as Pressable } from './haptic-native-controls';

export function SalonCodeBadge({ code, premium = false }: { code: string; premium?: boolean }) {
  const {palette:p}=useAccessAppearance();
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef({ x: 0, y: 0, moved: false });
  useEffect(() => {
    setStatus('idle');
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [code]);

  const copy = async () => {
    if (!code || touch.current.moved) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(code);
      } else {
        // Already included in the installed RN runtime: no new native module/build.
        Clipboard.setString(code);
      }
      setStatus('copied');
      AccessibilityInfo.announceForAccessibility('Codice salone copiato');
    } catch {
      setStatus('error');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2200);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Codice salone ${code}`}
      accessibilityHint="Tieni premuto per copiare il codice"
      accessibilityActions={[{ name: 'activate', label: 'Copia codice' }]}
      onAccessibilityAction={() => { touch.current.moved = false; void copy(); }}
      delayLongPress={500}
      onLongPress={() => void copy()}
      onTouchStart={({ nativeEvent }) => {
        touch.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, moved: false };
      }}
      onTouchMove={({ nativeEvent }) => {
        if (Math.hypot(nativeEvent.pageX - touch.current.x, nativeEvent.pageY - touch.current.y) > 10) {
          touch.current.moved = true;
        }
      }}
      onTouchCancel={() => { touch.current.moved = true; }}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed, status === 'copied' && styles.copied, premium && {backgroundColor:p.field,borderColor:p.border,shadowOpacity:0}]}
    >
      <Text style={[styles.code,premium && {color:p.ink}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{code}</Text>
      <View style={styles.caption}>
        <Ionicons name={status === 'copied' ? 'checkmark-circle-outline' : 'copy-outline'} size={13} color={premium?p.muted:"#627795"} />
        <Text style={[styles.hint,premium && {color:p.muted}]} accessibilityLiveRegion="polite">
          {status === 'copied' ? 'Codice copiato' : status === 'error' ? 'Copia non riuscita · riprova' : 'Tieni premuto per copiare'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { width: '100%', maxWidth: 300, alignSelf: 'center', marginVertical: 10,
    borderRadius: 22, borderWidth: 1, borderColor: '#D4DFED', backgroundColor: '#F1F5FB',
    paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#526886', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  pressed: { backgroundColor: '#E6EEF9', borderColor: '#A8BCD9' },
  copied: { backgroundColor: '#EDF7F2', borderColor: '#BDDACB' },
  code: { width: '100%', fontSize: 32, lineHeight: 42, fontWeight: '600', letterSpacing: 4,
    fontVariant: ['tabular-nums'], color: '#243957', textAlign: 'center' },
  caption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 5 },
  hint: { fontSize: 11, color: '#627795', flexShrink: 1, textAlign: 'center' },
});
