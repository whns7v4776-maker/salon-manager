import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccessThemeControl, useAccessAppearance } from './access-premium';
import { HapticNativePressable } from './ui/haptic-native-controls';

/** Shared fixed row for owner/client access, outside each page's scroll area. */
export function AccessNavigationBar({ onBack, backLabel = 'Indietro', maxWidth = 1120 }: {
  onBack?: () => void; backLabel?: string; maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  const { palette: p } = useAccessAppearance();
  return <View {...(Platform.OS === 'web' ? { dataSet: { accessNavigation: 'true' } } : {})}
    style={{ paddingTop: Math.max(insets.top + 10, 18), paddingHorizontal: Math.max(20, insets.left, insets.right), paddingBottom: 8 }}>
    <View style={{ width: '100%', maxWidth, alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {onBack ? <HapticNativePressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}
        {...(Platform.OS === 'web' ? { dataSet: { accessBack: 'true' } } : {})}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, opacity: pressed ? .72 : 1 })}>
        <Ionicons name="chevron-back" size={20} color={p.ink} />
      </HapticNativePressable> : <View style={{ width: 44 }} />}
      <AccessThemeControl inline />
    </View>
  </View>;
}
