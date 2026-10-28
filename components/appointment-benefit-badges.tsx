import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppointmentBenefitKind } from '../hooks/use-appointment-benefits';
const appearance = {
  complimentary: { label: 'Omaggio', icon: 'gift-outline' as const, color: '#285BA1', background: '#EAF2FF', border: '#BDD2EF' },
  subscription: { label: 'Abbonamento', icon: 'layers-outline' as const, color: '#753452', background: '#F9EAF1', border: '#DFC0CF' },
  gift: { label: 'Gift card', icon: 'gift-outline' as const, color: '#75521D', background: '#FFF4DC', border: '#E8D1A7' },
  loyalty: { label: 'Premio fedeltà', icon: 'sparkles-outline' as const, color: '#176553', background: '#E8F5EF', border: '#B7DBCC' },
};
export function AppointmentBenefitBadges({ kinds, compact = false, dense = false }: { kinds: AppointmentBenefitKind[]; compact?: boolean; dense?: boolean }) {
  return <View pointerEvents="none" style={styles.row}>
    {kinds.map(kind => { const a = appearance[kind]; return <View key={kind} accessibilityLabel={a.label + ' applicato'} {...(Platform.OS==='web'?{title:a.label+' applicato'} as any:{})} style={[styles.badge, compact && styles.compact, dense && {paddingHorizontal:2,paddingVertical:0,borderWidth:0}, { backgroundColor: a.background, borderColor: a.border }]}>
      <Ionicons name={a.icon} size={dense ? 8 : compact ? 9 : 12} color={a.color} />
      {!compact && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} allowFontScaling={false} style={[styles.text, { color: a.color }]}>{a.label}</Text>}
    </View>; })}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3, overflow: 'hidden' },
  badge: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  compact: { paddingHorizontal: 3, paddingVertical: 1 },
  text: { flexShrink: 1, fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
