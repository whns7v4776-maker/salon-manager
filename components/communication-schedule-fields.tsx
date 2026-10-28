import { PremiumSectionHeading } from './ui/premium-section-heading';
import { useCustomerPremiumColor } from './owner-premium-customers-style';
import React from 'react';
import { Text, View, Switch } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
export type CommunicationSchedule = { enabled: boolean; date: string; time: string };
export function CommunicationScheduleFields({ value, onChange, onPick }: { value: CommunicationSchedule; onChange: (v: CommunicationSchedule) => void; onPick: (kind: "date" | "time", initial: string, confirm: (v: string) => void) => void }) {
 const premiumColor=useCustomerPremiumColor();

  return <View style={{ padding: 16, borderRadius: 18, backgroundColor: premiumColor("#F0F4F9","backgroundColor"), gap: 12, marginTop: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><PremiumSectionHeading tone={2} style={{ fontSize: 16, fontWeight: '700', color: premiumColor("#253D61","color") }}>Programma l’invio</PremiumSectionHeading><Switch value={value.enabled} accessibilityLabel="Programma invio della push" onValueChange={enabled => onChange({ ...value, enabled })} /></View>
    <Text style={{ fontSize: 13, lineHeight: 19, color: premiumColor("#626A80","color") }}>{value.enabled ? 'La comunicazione e la push partiranno alla data scelta, anche con l’app chiusa. Orario italiano.' : 'La comunicazione e la push vengono inviate subito.'}</Text>
    {value.enabled && <View style={{ flexDirection: 'row', gap: 12 }}>{(['date', 'time'] as const).map(key => <HapticTouchable key={key} onPress={() => onPick(key, value[key], v => onChange({ ...value, [key]: v }))} style={{ flex: 1, backgroundColor: premiumColor("#fff","backgroundColor"), borderRadius: 12, padding: 14 }}><Text style={{ fontWeight: '600', color: premiumColor("#253D61","color") }}>{key === 'date' ? value.date.split('-').reverse().join('/') : value.time}</Text></HapticTouchable>)}</View>}
  </View>;
}
