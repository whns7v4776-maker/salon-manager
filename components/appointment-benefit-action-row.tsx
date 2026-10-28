import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';

/** Compact secondary action; the entire row is the touch target. */
export function AppointmentBenefitActionRow({ title, caption, icon, tone, actionLabel, disabled, accessibilityLabel, onPress }: {
  title: string;
  caption?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'blue' | 'rose';
  actionLabel?: string;
  disabled: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const {palette:p}=useAccessAppearance();
  const accent = tone === 'rose' ? (p.night?'#D6B9CB':'#875F75') : (p.night?'#B2D4BB':'#426B54');
  const wash = tone === 'rose' ? (p.night?'rgba(177,135,160,.13)':'#F1E9ED') : (p.night?'rgba(124,166,134,.14)':'#E8EFE8');
  return (
    <HapticTouchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.field, opacity: disabled ? 0.55 : 1 }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: wash }}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {caption ? <Text style={{ color: p.muted, fontSize: 11, lineHeight: 15, fontWeight: '500' }}>{caption}</Text> : null}
        <Text style={{ color: p.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 }}>{title}</Text>
      </View>
      {actionLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 9, backgroundColor: wash }}>
          <Text style={{ color: accent, fontSize: 12, lineHeight: 18, fontWeight: '700' }}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={accent} />
        </View>
      ) : <Ionicons name="chevron-forward" size={16} color={p.muted} />}
    </HapticTouchable>
  );
}
