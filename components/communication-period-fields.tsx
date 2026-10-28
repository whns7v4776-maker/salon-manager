import { PremiumSectionHeading } from './ui/premium-section-heading';
import { useCustomerPremiumColor } from './owner-premium-customers-style';
import React from 'react';
import { View, Text, Switch, StyleSheet, TextInput, Platform } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';

export type CommunicationPeriod = {
  reuseText: boolean; title: string; body: string;
  enabled: boolean; allDay: boolean; from: string; to: string; fromTime: string; toTime: string;
};
export const initialCommunicationPeriod = (): CommunicationPeriod => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { reuseText: true, title: "", body: "", enabled: false, allDay: true, from: today, to: today, fromTime: '09:00', toTime: '19:00' };
};
export function communicationPeriodPayload(p: CommunicationPeriod) {
  if (!p.enabled) return { startsLocal: null, endsLocal: null };
  // Whole-day end is exclusive at midnight after the selected last day.
  const end = new Date(`${p.to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    title: p.reuseText ? null : p.title.trim(),
    body: p.reuseText ? null : p.body.trim(),
    startsLocal: `${p.from}T${p.allDay ? '00:00' : p.fromTime}:00`,
    endsLocal: p.allDay ? `${end.toISOString().slice(0, 10)}T00:00:00` : `${p.to}T${p.toTime}:00`,
  };
}
export function CommunicationPeriodFields({ value, onChange, onPick, popupOnly = false }: { popupOnly?: boolean; value: CommunicationPeriod; onChange: (v: CommunicationPeriod) => void; onPick: (kind: "date" | "time", initial: string, confirm: (v: string) => void) => void }) {
 const premiumColor=useCustomerPremiumColor();

  const patch = (next: Partial<CommunicationPeriod>) => onChange({ ...value, ...next });
  const formatDate = (date: string) => date.split('-').reverse().join('/');
  return <View style={s.card}>
    <View style={s.row}><PremiumSectionHeading tone={3} style={s.title}>Periodo del popup</PremiumSectionHeading>{!popupOnly && <Switch accessibilityLabel="Attiva periodo del promemoria" value={value.enabled} onValueChange={enabled => patch({ enabled })} trackColor={Platform.OS === 'web' ? { false: premiumColor("#939393","false"), true: premiumColor("#6246c7","true") } : { true: premiumColor("#6246c7","true") }} />}</View>
    <Text style={s.help}>Mostra un avviso al primo accesso di ogni giorno nel periodo scelto. Visibile su web e app, senza inviare push.</Text>
    {value.enabled && <>
      {!popupOnly && <View style={s.row}><Text style={[s.label, { flex: 1 }]}>Usa il testo della comunicazione</Text><Switch accessibilityLabel="Usa il testo della comunicazione" value={value.reuseText} onValueChange={reuseText => patch({ reuseText })} /></View>}
      {!popupOnly && !value.reuseText && <>
        <Text style={s.label}>Titolo del popup</Text>
        <TextInput accessibilityLabel="Titolo del popup" style={s.input} value={value.title} onChangeText={title => patch({ title })} placeholder="Es. Il nuovo listino è attivo" placeholderTextColor={premiumColor("#7B8292","placeholderTextColor")} maxLength={80} />
        <Text style={s.label}>Messaggio del popup</Text>
        <TextInput accessibilityLabel="Messaggio del popup" style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]} multiline value={value.body} onChangeText={body => patch({ body })} placeholder="Scrivi l’avviso da mostrare durante il periodo…" placeholderTextColor={premiumColor("#7B8292","placeholderTextColor")} maxLength={500} />
        <Text style={s.help}>{value.body.length}/500 · Questo testo compare solo nel popup. La push e la comunicazione originale restano invariate.</Text>
      </>}
      <View style={s.row}><Text style={s.label}>Tutto il giorno</Text><Switch accessibilityLabel="Tutto il giorno" value={value.allDay} onValueChange={allDay => patch({ allDay })} /></View>
      <View style={s.row}>{(['from', 'to'] as const).map(key => <HapticTouchable key={key} style={s.field} onPress={() => onPick("date", value[key], date => patch(key === "from" ? { from: date, to: date > value.to ? date : value.to } : { to: date }))}><Text style={s.help}>{key === 'from' ? 'Dal' : 'Al, incluso'}</Text><Text style={s.label}>{formatDate(value[key])}</Text></HapticTouchable>)}</View>
      {!value.allDay && <View style={s.row}>{(['fromTime', 'toTime'] as const).map(key => <HapticTouchable key={key} style={s.field} onPress={() => onPick("time", value[key], time => patch({ [key]: time }))}><Text style={s.help}>{key === 'fromTime' ? 'Ora di inizio' : 'Ora di fine'}</Text><Text style={s.label}>{value[key]}</Text></HapticTouchable>)}</View>}
      <Text style={s.help}>Orario italiano. Gli orari delimitano l’intero periodo. Nessuna push aggiuntiva ogni giorno.</Text>
    </>}
  </View>;
}
const s = StyleSheet.create({
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 16, color: "#172033", borderWidth: 1, borderColor: "#DFD8F0" },
  card: { backgroundColor: '#F6F3FD', borderRadius: 18, padding: 16, gap: 12, marginVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: '#352568', flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: '#172033' },
  help: { fontSize: 13, lineHeight: 19, color: '#626A80' },
  field: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 5 },
});
