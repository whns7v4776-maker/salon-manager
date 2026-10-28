import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';

/** One readable date/time hierarchy across upcoming, pending and archived native appointments. */
export function ClientNotificationDate({ date, time, duration, compact = false }: { date: string; time: string; duration: string; compact?: boolean }) {
  const { palette: p } = useAccessAppearance();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3, marginBottom: 3 }}>
    <View style={{ width: compact ? 35 : 40, height: compact ? 40 : 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.night ? '#293237' : '#EDF0EC' }}><Ionicons name="calendar-outline" size={21} color={p.muted} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, fontWeight: '500' }}>{date}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 0 }}><Text style={{ color: p.ink, fontSize: 17, lineHeight: 24, fontWeight: '600' }}>{time}</Text><Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>circa {duration}</Text></View>
    </View>
  </View>;
}
