import React, { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// Native counterpart of QuickSlotWebFitContent: presentation only.
export function QuickSlotNativeFitContent({ rank, startTime, endTime, operatorLabel, professionLabel, split, selected }: {
  rank: string; startTime: string; endTime: string; operatorLabel: string;
  professionLabel: string; split: boolean; selected: boolean;
}) {
  const gradientId = `fit${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cross = rank === 'Altro mestiere';
  const ink = selected ? '#FFFFFF' : cross ? '#715029' : '#203B5D';
  const muted = selected ? '#D0DFF1' : cross ? '#876D4E' : '#62768E';
  const colors = selected ? ['#345777', '#1C3555'] : cross ? ['#FBF4E8', '#F3E8D5'] : ['#EDF3FC', '#E1EAF7'];
  const badge = rank === 'Migliore' ? { backgroundColor: '#D9F3E6', borderColor: '#ACDCC4', color: '#176746' }
    : rank === 'Ottimo' ? { backgroundColor: '#DCECFF', borderColor: '#B9D3F3', color: '#245C94' }
    : cross ? { backgroundColor: '#FFF0D2', borderColor: '#E8CD94', color: '#8A5B17' }
    : { backgroundColor: '#EBE5FA', borderColor: '#DACEEF', color: '#65458C' };
  const names = operatorLabel.split(' + ').filter(Boolean);
  return <>
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%"><Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colors[0]} /><Stop offset="1" stopColor={colors[1]} /></LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${gradientId})`} /></Svg>
    </View>
    <View style={styles.content}>
      <View style={styles.heading}>
        <View style={[styles.badge, { backgroundColor: badge.backgroundColor, borderColor: badge.borderColor }]}><Text style={[styles.rank, { color: badge.color }]}>{rank}</Text></View>
        {selected && <View style={styles.check}><Ionicons name="checkmark" size={12} color="#FFFFFF" /><Text style={styles.checkText}>Scelto</Text></View>}
      </View>
      <Text style={[styles.time, { color: ink }]} numberOfLines={1}>{startTime}<Text style={{ color: muted, fontSize: 15 }}> – </Text>{endTime}</Text>
      <View style={[styles.footer, { backgroundColor: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.8)', borderColor: selected ? 'rgba(255,255,255,0.22)' : '#FFFFFF' }]}>
      <View style={styles.person}>
        <View style={{ flexDirection: 'row' }}>{names.slice(0, 2).map((name, index) => <View key={index} style={[styles.avatar, { marginLeft: index ? -7 : 0, borderColor: selected ? '#6C85A0' : '#F3F7FC', backgroundColor: selected ? '#DCE9F8' : cross ? '#806340' : '#385C83' }]}><Text style={[styles.initials, { color: selected ? '#274866' : '#FFFFFF' }]}>{name.trim().charAt(0).toUpperCase()}</Text></View>)}</View>
        <View style={styles.copy}><Text style={[styles.name, { color: ink }]} numberOfLines={1}>{operatorLabel}</Text><Text style={[styles.detail, { color: muted }]} numberOfLines={1}>{professionLabel}</Text></View>
      </View>
      <View style={[styles.teamBadge, { backgroundColor: selected ? 'rgba(255,255,255,0.15)' : '#E2ECF8', borderLeftColor: selected ? '#ADCBEF' : '#789FC7' }]}><Text style={{ color: ink, fontSize: 9, lineHeight: 12, fontWeight: '600' }}>{split ? 'Più operatori' : 'Unico operatore'}</Text></View>
      </View>
    </View>
  </>;
}
export const nativeFitCardStyles = StyleSheet.create({
  card: { width: 188, height: 146, minHeight: 146, padding: 12, paddingTop: 12, paddingBottom: 12, borderRadius: 15, borderWidth: 1, borderColor: '#CAD8EB', overflow: 'hidden' },
  selected: { borderColor: '#254565' },
  cross: { borderColor: '#E1CFB1' },
});
const styles = StyleSheet.create({
  content: { flex: 1, alignSelf: 'stretch', justifyContent: 'space-between', gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, minHeight: 22 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderRadius: 6 },
  rank: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  checkText: { fontSize: 10, lineHeight: 16, fontWeight: '600', color: '#FFFFFF' },
  time: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.45, fontVariant: ['tabular-nums'] },
  footer: { alignSelf: 'stretch', marginHorizontal: -3, paddingHorizontal: 7, paddingVertical: 4, gap: 3, borderWidth: 1, borderRadius: 10, shadowColor: '#1E395B', shadowOpacity: 0.07, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  person: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 11, fontWeight: '700' },
  teamBadge: { alignSelf: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderLeftWidth: 2 },
  copy: { flexShrink: 1, gap: 2 },
  name: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  detail: { fontSize: 10, lineHeight: 14 },
});
