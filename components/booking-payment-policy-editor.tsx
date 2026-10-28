import { useAccessAppearance } from './access-premium';
import { PremiumFitLabel } from './ui/premium-fit-label';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import {useCashPanelStyles} from './cash-web-panel';
import { CustomerSelectionIndicator } from './customer-selection-indicator';
import { useCustomerPremiumStyles } from './owner-premium-customers-style';
import { NativeSettingsPopup } from './native-settings-popup';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';

import { supabase } from '../src/lib/supabase';
import { useCashRefresh } from '../src/lib/use-cash-refresh';
import { bookingPaymentLabel, validateBookingPaymentPolicy, type CustomerBookingPaymentMode } from '../src/lib/booking-payment-policy';
import { HapticTouchable } from './ui/haptic-touchable';
import { PremiumExpandButton } from './ui/premium-expand-button';

type Saved = { mode: CustomerBookingPaymentMode; percent: number; revision: number };
export function BookingPaymentPolicyEditor({ workspaceId, customerId, active = true, standalone = false }: { workspaceId: string; customerId?: string; active?: boolean; standalone?: boolean }) {
 const styles=useCashPanelStyles(useCustomerPremiumStyles(baseCustomerComponentStyles));
 const {palette:p}=useAccessAppearance();

  const [expanded, setExpanded] = useState(standalone);
  const [saved, setSaved] = useState<Saved | null>(null);
  const savedRef = useRef<Saved | null>(null);
  const savingRef = useRef(false);
  const [mode, setMode] = useState<CustomerBookingPaymentMode>(customerId ? 'inherit' : 'salon');
  const [percent, setPercent] = useState('30');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const editingRef = useRef(editing); editingRef.current = editing;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    setChecking(true);
    void supabase.functions.invoke('cash-stripe', {body:{action:'booking-policy-status'},timeout:15000}).then(({data}) => {
      if (!stopped) setEnabled(data?.enabled === true);
    }).catch(() => {}).finally(() => { if (!stopped) setChecking(false); });
    return () => {stopped = true; alive.current = false;};
  }, [workspaceId]);
  const refresh = useCallback(async (isCurrent: () => boolean) => {
    let query = supabase.from('booking_payment_policies').select('mode,percent,revision').eq('workspace_id', workspaceId);
    query = customerId ? query.eq('customer_id', customerId) : query.is('customer_id', null);
    const result = await query.maybeSingle();
    if (!isCurrent()) return;
    if (result.error) { setError('Impostazioni non disponibili. Riprova tra poco.'); return; }
    const next: Saved = result.data ?? { mode: customerId ? 'inherit' : 'salon', percent: 0, revision: 0 };
    if (!editingRef.current && next.revision >= (savedRef.current?.revision ?? 0)) { savedRef.current=next; setSaved(next); setMode(next.mode); setPercent(String(next.mode === 'deposit' ? next.percent : 30)); setError(''); }
  }, [workspaceId, customerId]);
  useCashRefresh(workspaceId, refresh, active && expanded && enabled);

  const save = async () => {
    if (savingRef.current || !saved) return;
    setError('');
    let value;
    try { value = mode === 'inherit' ? { mode, percent: 0 } : validateBookingPaymentPolicy(mode, Number(percent)); }
    catch (e) { setError((e as Error).message); return; }
    savingRef.current=true; setBusy(true);
    try {
      const { data, error: failure } = await supabase.functions.invoke('cash-stripe', {
        body: { action: 'booking-policy-save', customerId: customerId ?? null, ...value, expectedRevision: saved.revision }, timeout: 30000,
      });
      let message = data?.error;
      if (!message && failure && 'context' in failure) { try { message = (await failure.context.json()).error; } catch {} }
      if (failure || message || !data?.policy) throw new Error(message || 'Salvataggio non riuscito. Riprova.');
      if (alive.current) {savedRef.current=data.policy; setSaved(data.policy); editingRef.current=false; setEditing(false);}
    } catch (e) { if(alive.current) setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); }
    finally { savingRef.current=false; if(alive.current) setBusy(false); }
  };
  const label = saved?.mode === 'inherit' ? 'Segue la regola del salone' : saved ? bookingPaymentLabel(saved as any) : 'Scegli come ricevere il pagamento';
  const choices: { mode: CustomerBookingPaymentMode; title: string }[] = [
    ...(customerId ? [{ mode: 'inherit' as const, title: 'Segui la regola del salone' }] : []),
    { mode: 'salon', title: 'Paga in salone' }, { mode: 'full', title: 'Pagamento completo' }, { mode: 'deposit', title: 'Acconto in percentuale' },
  ];
  if (checking && standalone) return <View style={styles.card}><ActivityIndicator color={Platform.OS==='web'?styles.subtitle.color:undefined} /><Text style={styles.subtitle}>Caricamento condizioni di pagamento…</Text></View>;
  if (!enabled) return standalone ? <View style={styles.card}><Text style={styles.title}>Pagamento del cliente</Text><Text style={styles.subtitle}>Le condizioni personalizzate non sono ancora abilitate per questo salone. Le prenotazioni mantengono le condizioni attuali.</Text></View> : null;
  const toggleExpanded = () => setExpanded(value => !value);
  const nativePopup = Platform.OS !== 'web' && !standalone;
  const actions = saved ? <View style={{ gap: 12 }}>
        <HapticTouchable accessibilityRole="button" disabled={busy || !editing} onPress={save} style={[styles.save,{backgroundColor:p.action}, (busy || !editing) && { opacity: 0.5 }]}><Text style={[styles.saveText,{color:p.actionText}]}>{busy ? 'Salvataggio…' : editing ? 'Salva impostazione' : 'Impostazione salvata'}</Text></HapticTouchable>
        {editing && !busy ? <HapticTouchable accessibilityRole="button" onPress={() => { editingRef.current=false; setEditing(false); void refresh(() => alive.current); }}><Text style={styles.subtitle}>Annulla modifiche</Text></HapticTouchable> : null}
  </View> : null;
  return <View style={[styles.card, !standalone && styles.sectionCard]}>
    {!standalone ? <View style={styles.heading}>
    <HapticTouchable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? 'Riduci' : 'Espandi'} pagamento alla prenotazione`} onPress={toggleExpanded} webHoverLift={false} style={styles.headingMain}>
      <Ionicons name="wallet-outline" size={23} color={p.ink} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.title}>{customerId ? 'Pagamento del cliente' : 'Pagamento alla prenotazione'}</Text><Text style={styles.subtitle}>{label}</Text></View>
    </HapticTouchable>
    <PremiumExpandButton salon compact expanded={expanded} onPress={toggleExpanded} accessibilityLabel={expanded ? 'Chiudi condizioni di pagamento' : 'Apri condizioni di pagamento'} />
    </View> : <Text style={styles.subtitle}>{label}</Text>}
    {expanded ? <NativeSettingsPopup compact footer={nativePopup ? actions : undefined} animationType="fade" title="Pagamento alla prenotazione" icon="wallet-outline" onClose={() => setExpanded(false)} inline={standalone}><View style={styles.body}>
      {!saved && !error ? <ActivityIndicator color={Platform.OS==='web'?styles.subtitle.color:undefined} /> : null}
      {saved ? <>
        <Text style={styles.subtitle}>Per le richieste manuali, il pagamento viene richiesto dopo l’approvazione del salone. Le modifiche valgono per le nuove prenotazioni.</Text>
        {choices.map(choice => <HapticTouchable key={choice.mode} accessibilityRole="radio" accessibilityState={{ checked: mode === choice.mode, disabled: busy }} {...(Platform.OS==='web'?{'aria-checked':mode===choice.mode}:{})} disabled={busy} onPress={() => { setMode(choice.mode); setEditing(true); }} style={[styles.choice, mode === choice.mode && styles.selected]}>
          <CustomerSelectionIndicator selected={mode === choice.mode}/><PremiumFitLabel fontSize={14} minFontSize={11} style={[styles.choiceText,{color:p.ink}]}>{choice.title}</PremiumFitLabel>
        </HapticTouchable>)}
        {mode === 'deposit' ? <View style={styles.heading}><Text style={styles.choiceText}>Acconto</Text><TextInput accessibilityLabel="Percentuale di acconto" keyboardType="number-pad" maxLength={2} value={percent} editable={!busy} onChangeText={text => { setPercent(text.replace(/\D/g, '')); setEditing(true); }} style={styles.input} /><Text style={styles.choiceText}>%</Text></View> : null}
        <Text style={styles.subtitle}>Acconto e pagamento completo richiedono Stripe attivo. Il saldo dell’acconto resta da pagare in salone.</Text>
        {!nativePopup ? actions : null}
      </> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: '#B42332' }}>{error}</Text> : null}
    </View></NativeSettingsPopup> : null}
  </View>;
}
const baseCustomerComponentStyles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 18, gap: 12 },
  sectionCard: { marginBottom: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#152238', fontWeight: '600', fontSize: 17 },
  subtitle: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  body: { gap: 12 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 14, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#E4EAF1' },
  selected: { backgroundColor: '#EAF2FA', borderColor: '#9BB2C8' }, choiceText: { color: '#20364D', fontSize: 14, flexShrink: 1 },
  input: { width: 68, padding: 10, borderWidth: 1, borderColor: '#CCD8E5', borderRadius: 12, textAlign: 'center', color: '#152238' },
  save: { backgroundColor: '#20364D', borderRadius: 14, padding: 14, alignItems: 'center' }, saveText: { color: '#FFF', fontWeight: '600' },
});

