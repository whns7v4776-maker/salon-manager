import { useAccessAppearance } from './access-premium';
import { Ionicons } from '@expo/vector-icons';
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/** Only groups the existing choices: eligibility, order within each period and selection stay with the caller. */
export function BookingTimePeriods({ times, gridStyle, renderSlot, premium = false }: {
  times: string[];
  premium?: boolean;
  gridStyle: StyleProp<ViewStyle>;
  renderSlot: (time: string) => ReactNode;
}) {
  const { palette: p } = useAccessAppearance();
  const morning = times.filter((time) => Number(time.split(':')[0]) < 12);
  const afternoon = times.filter((time) => Number(time.split(':')[0]) >= 12);
  return <View style={styles.periods}>
    {[{ key: 'morning', title: 'Mattina', icon: 'sunny-outline' as const, times: morning }, { key: 'afternoon', title: 'Pomeriggio', icon: 'partly-sunny-outline' as const, times: afternoon }].filter((period) => period.times.length > 0).map((period) => (
      <View key={period.key} style={styles.period}>
        <View style={styles.heading}>
          <Ionicons name={period.icon} size={14} color={premium ? p.muted : "#64748B"} />
          <Text accessibilityRole="header" style={[styles.label, premium && { color: p.muted }]}>{period.title}</Text>
          <View style={[styles.line, premium && { backgroundColor: p.line }]} />
        </View>
        <View style={gridStyle}>{period.times.map(renderSlot)}</View>
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  periods: { gap: 12 },
  period: { gap: 7 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  line: { flex: 1, height: 1, marginLeft: 4, backgroundColor: '#E2E8F0' },
});
