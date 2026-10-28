import React, { forwardRef, useState } from 'react';
import { useAccessAppearance } from '../access-premium';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

// One real input keeps paste, deletion and screen readers reliable on all platforms.
export const SalonCodeInput = forwardRef<TextInput, TextInputProps & { premiumAppearance?: boolean }>(function SalonCodeInput(
  { value = '', onChangeText, onFocus, onBlur, premiumAppearance = false, ...props }, ref
) {
  const { palette } = useAccessAppearance();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <View style={styles.row} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.cell, !!value[index] && styles.filled,
            focused && index === Math.min(value.length, 5) && styles.active,
            premiumAppearance && { height: 52, borderRadius: 13, backgroundColor: palette.field, borderColor: focused && index === Math.min(value.length, 5) ? palette.action : palette.line, shadowOpacity: 0, ...(!!value[index] ? { backgroundColor: palette.night ? 'rgba(216,194,155,0.12)' : '#F1ECE1' } : {}) }]}>
            <Text style={[styles.digit, premiumAppearance && { color: palette.ink }]}>{value[index] || ''}</Text>
          </View>
        ))}
      </View>
      <TextInput {...props} ref={ref} value={value} style={styles.input}
        accessibilityLabel="Codice salone di sei cifre" keyboardType="number-pad"
        autoComplete="off" autoCorrect={false} caretHidden
        onChangeText={(text) => onChangeText?.(text.replace(/\D/g, '').slice(0, 6))}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }} />
    </View>
  );
});
const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 360, alignSelf: 'center', marginVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, minWidth: 0, height: 58, borderRadius: 17, borderWidth: 1,
    borderColor: '#DCE5F0', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#243C60', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045, shadowRadius: 5 },
  filled: { backgroundColor: '#F0F5FF', borderColor: '#C4D5F3' },
  active: { borderColor: '#3970DB', borderWidth: 2, backgroundColor: '#F7FAFF',
    shadowColor: '#3970DB', shadowOpacity: 0.12, shadowRadius: 7 },
  digit: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: '#1E3557',
    fontVariant: ['tabular-nums'], includeFontPadding: false },
  input: { ...StyleSheet.absoluteFillObject, opacity: 0.02, fontSize: 23, color: 'transparent' },
});
