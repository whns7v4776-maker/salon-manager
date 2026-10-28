import { useAccessAppearance } from './access-premium';
import { nativeRequestsStyles } from './owner-premium-requests-style';
import { PremiumGuideDock } from './ui/premium-guide-dock';
import { SectionHowItWorksPanel } from './section-how-it-works';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from './ui/haptic-touchable';
import { useCustomerCancellationPolicy } from '../src/lib/use-customer-cancellation-policy';
import { cancellationNoticeLabel } from '../src/lib/customer-cancellation-policy';
const NATIVE = Platform.OS !== 'web';
const OPTIONS = [0, 15, 30, 60, 120, 240, 720, 1440, 2880, 4320, 10080];
const durationLabel = (m: number) => m === 0 ? 'Fino all’inizio' : m < 60 ? `${m} min` : m < 1440 ? `${m / 60} ${m === 60 ? 'ora' : 'ore'}` : `${m / 1440} ${m === 1440 ? 'giorno' : 'giorni'}`;
export function CustomerCancellationSettings({ salonCode, premiumNative=false }: { salonCode: string; premiumNative?:boolean }) {
  const {palette:p}=useAccessAppearance();
  const styles=React.useMemo(()=>premiumNative?nativeRequestsStyles(baseCancellationStyles,p):baseCancellationStyles,[premiumNative,p]);
  const [guideOpen, setGuideOpen] = useState(false);
  const policy = useCustomerCancellationPolicy(salonCode);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const selected = draft ?? policy.minutes;
  const save = async () => {
    setSaving(true); setMessage(''); setSaveSucceeded(false);
    try { await policy.save(selected); setDraft(null); setSaveSucceeded(true); setMessage('Regola salvata e disponibile sui dispositivi dei clienti.'); }
    catch { setMessage('Salvataggio non confermato. Riprova: il valore visualizzato come attivo resta quello del server.'); }
    finally { setSaving(false); }
  };
  const controls = <>
    <View style={[styles.summary, !NATIVE && styles.summaryWeb]}>
      <View style={NATIVE ? styles.summaryHeadingNative : styles.summaryHeadingWeb}>
      <Text style={[styles.eyebrow, !NATIVE && styles.centeredWeb, policy.ready && (draft === null || draft === policy.minutes) && styles.successText]}>{draft !== null && draft !== policy.minutes ? (NATIVE ? 'Nuovo anticipo da salvare' : 'NUOVO ANTICIPO DA SALVARE') : policy.ready ? (NATIVE ? 'Anticipo minimo attivo' : 'ANTICIPO MINIMO ATTIVO') : (NATIVE ? 'Anticipo predefinito' : 'ANTICIPO PREDEFINITO')}</Text>
      <Text style={[styles.duration, !NATIVE && styles.centeredWeb]}>{durationLabel(selected)}</Text>
      </View>
      <Text style={[styles.body, !NATIVE && styles.centeredWeb, policy.ready && styles.successText]}>{policy.ready ? `Il cliente può annullare ${cancellationNoticeLabel(policy.minutes)}.` : policy.error ? 'Regola attiva non disponibile. Riprova il caricamento.' : 'Caricamento della regola del salone…'}</Text>
    </View>
    <View style={[styles.options, !NATIVE && styles.optionsWeb]}>{OPTIONS.map(minutes => <HapticTouchable webHoverLift key={minutes} accessibilityRole="radio" accessibilityState={{ checked: selected === minutes, disabled: saving || !policy.ready }} disabled={saving || !policy.ready} onPress={() => { setDraft(minutes); setMessage(''); }} style={[styles.option, !NATIVE && styles.optionWeb, selected === minutes && styles.selected]}>
        <Text style={[styles.optionText, selected === minutes && { color: premiumNative?p.actionText:'#fff' }]}>{durationLabel(minutes)}</Text>
      </HapticTouchable>)}</View>
  </>;
  return <View style={styles.card}>
    <PremiumGuideDock tone={premiumNative?{ink:p.ink,fill:p.field,border:p.border}:undefined} guideOpen={guideOpen} onGuidePress={() => setGuideOpen(value => !value)} guideAccessibilityLabel="Come funziona Annullamento clienti" cutoutColor={premiumNative?(p.night?"#26292B":"#F7F4EF"):"#F3F6FA"} />

    <View style={styles.header}><View style={styles.icon}><Ionicons name="time-outline" size={24} color={premiumNative?p.ink:"#334155"} /></View><Text style={styles.title}>Annullamento clienti</Text></View>
    {guideOpen && <SectionHowItWorksPanel onClose={() => setGuideOpen(false)} premiumNative={premiumNative} title="Annullamento clienti" description="Decidi fino a quando i clienti possono annullare un appuntamento confermato." steps={[
      { title: 'Scegli l’anticipo', description: 'Il valore predefinito è 30 minuti. Seleziona un tempo diverso oppure Fino all’inizio.' },
      { title: 'Salva la regola', description: 'Premi Salva regola e attendi la conferma. La regola attiva viene conservata per il salone e condivisa tra app e web.' },
      { title: 'Applicazione agli appuntamenti', description: 'Il limite vale anche per gli appuntamenti già confermati. Scaduto il termine, il cliente deve contattare il salone.' },
    ]} note="Le richieste in attesa restano annullabili. Il salone può sempre annullare senza questo limite." />}
    <Text style={[styles.body, !NATIVE && styles.descriptionWeb]}>Scegli quanto anticipo devono rispettare i clienti per annullare un appuntamento confermato.</Text>
    {NATIVE ? controls : <View style={styles.controlsWeb}>{controls}</View>}
    <View style={[styles.note, !NATIVE && { justifyContent: 'flex-start', alignItems: 'flex-start' }]}><Ionicons name="information-circle-outline" size={19} color={premiumNative?p.muted:"#64748B"} /><Text style={[styles.body, { flex: 1 }, !NATIVE && styles.centeredWeb]}>Il valore predefinito è 30 minuti. La regola vale anche per gli appuntamenti già confermati. Le richieste in attesa restano annullabili. Il salone può sempre annullare.</Text></View>
    {draft !== null && draft !== policy.minutes && <HapticTouchable accessibilityRole="button" disabled={saving || !policy.ready} onPress={save} style={styles.save}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva regola</Text>}</HapticTouchable>}
    {!!policy.error && <HapticTouchable accessibilityRole="button" onPress={() => { void policy.refresh(); }} style={styles.error}><Ionicons name="refresh-outline" size={18} color="#9A3412" /><Text style={styles.errorText}>Caricamento non riuscito · Riprova</Text></HapticTouchable>}
    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.body, saveSucceeded && styles.successText]}>{message}</Text>}
  </View>;
}
const baseCancellationStyles = StyleSheet.create({
 controlsWeb: { gap: 16, alignItems: 'stretch' },
 summaryWeb: { width: '100%', minWidth: 0, alignItems: 'center', justifyContent: 'center' },
 optionsWeb: { width: '100%', minWidth: 0, justifyContent: 'center', alignItems: 'stretch' },
 optionWeb: { flexBasis: 60, flexGrow: 1, flexShrink: 0, minWidth: 60, paddingHorizontal: 6 },
 summaryHeadingWeb: { gap: 8, alignItems: 'center' },
 centeredWeb: { textAlign: 'left', maxWidth: '100%' },
 descriptionWeb: { textAlign: 'left', alignSelf: 'stretch', width: '100%', maxWidth: 760, marginTop: -6 },
 summaryHeadingNative: { alignItems: 'flex-start', gap: 3 },
 successText: { color: '#166534' },
 card: { marginBottom: NATIVE ? 16 : 22, padding: NATIVE ? 16 : 22, gap: NATIVE ? 12 : 16, borderRadius: 26, borderWidth: 1, borderColor: '#E5EAF1', backgroundColor: '#fff' },
 header: { paddingRight: NATIVE ? 24 : 0, flexDirection: 'row', alignItems: 'center', gap: NATIVE ? 10 : 12, ...(!NATIVE ? { width: '100%', justifyContent: 'flex-start', paddingRight: 52 } : {}) },
 icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', ...(NATIVE ? { width: 34, height: 34, borderRadius: 12 } : {}) },
 title: { fontSize: NATIVE ? 17 : 20, fontWeight: NATIVE ? '700' : '800', color: '#182033', ...(NATIVE ? { flex: 1 } : { flexGrow: 0, flexShrink: 1, flexBasis: 'auto' as const, width: 'auto' as const, textAlign: 'left' as const }) },
 body: { fontSize: 13, lineHeight: 20, color: '#64748b', ...(NATIVE ? { fontSize: 12, lineHeight: 17, fontWeight: '500' as const } : {}) },
 summary: { backgroundColor: '#F6F8FB', borderRadius: 20, padding: 20, gap: 8, borderWidth: 1, borderColor: '#EDF1F6', ...(NATIVE ? { padding: 12, gap: 6, borderRadius: 14 } : {}) },
 eyebrow: { fontSize: 10, letterSpacing: 1.1, fontWeight: '800', color: '#64748B', ...(NATIVE ? { fontSize: 10, letterSpacing: 0, fontWeight: '600' as const } : {}) },
 duration: { fontSize: 30, fontWeight: '800', color: '#182033', ...(NATIVE ? { fontSize: 23, lineHeight: 28, fontWeight: '700' as const } : {}) },
 groups: { gap: 18 }, group: { gap: 9 }, groupLabel: { color: '#475569', fontSize: 12, fontWeight: '700' },
 options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, ...(NATIVE ? { gap: 6 } : {}) },
 option: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', minHeight: 44, alignItems: 'center', justifyContent: 'center', ...(NATIVE ? { width: '31.8%' as const, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 11 } : {}) },
 selected: { backgroundColor: '#182033', borderColor: '#182033' }, optionText: { color: '#475569', fontSize: 13, fontWeight: '700', ...(NATIVE ? { fontSize: 12, fontWeight: '700' as const } : {}) },
 note: { flexDirection: 'row', gap: 9, borderTopWidth: 1, borderTopColor: '#EDF1F6', paddingTop: 18, ...(NATIVE ? { paddingTop: 10, gap: 7 } : {}) },
 error: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, backgroundColor: '#FFF7ED', borderRadius: 12 }, errorText: { flex: 1, color: '#9A3412', fontSize: 12, fontWeight: '600' },
 save: { padding: 15, borderRadius: 14, backgroundColor: '#182033', alignItems: 'center' }, saveText: { color: '#fff', fontWeight: '700' },
});
