import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { HapticNativePressable } from './haptic-native-controls';
import { useAccessAppearance } from '../access-premium';

/** Opens the existing audience chooser without owning navigation or saved access. */
export function AccessAudienceButton({
  audience,
  onPress,
  disabled = false,
  style,
}: {
  audience: 'owner' | 'client';
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useAccessAppearance();
  return (
    <HapticNativePressable
      accessibilityRole="button"
      accessibilityLabel={`Lato ${audience === 'client' ? 'cliente' : 'salone'}. Cambia modalità di accesso.`}
      accessibilityHint="Apre la scelta tra cliente e salone."
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.control, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <View style={[styles.circle, { backgroundColor: palette.surface, borderColor: palette.border, width: 40, height: 40, borderRadius: 20 }]}>
        <Ionicons name="chevron-back" size={20} color={palette.ink} />
      </View>
    </HapticNativePressable>
  );
}

const styles = StyleSheet.create({
  control: {
    width: 58,
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  salonCircle: { backgroundColor: '#FFF6E7', borderColor: '#E8D3B5' },
  clientCircle: { backgroundColor: '#F4EFFB', borderColor: '#DCCFE9' },
  caption: { fontSize: 9, lineHeight: 11, fontWeight: '600', textAlign: 'center' },
  salonCaption: { color: '#795525' },
  clientCaption: { color: '#66527F' },
  androidClientCaption: { transform: [{ translateX: 3 }] },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
