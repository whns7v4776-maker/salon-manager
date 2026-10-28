import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { DockedSheetSurface } from './ui/docked-sheet-surface';
import { CommunicationPoster } from "./communication-poster";
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useState } from 'react';
import { AppState, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { publicSupabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';

type Reminder = { image_path?: string | null; communication_id: string; title: string; body: string; ends_at: string };
// One mounted controller across the customer's tabs. The server owns the daily claim.
const pendingReminders = new Map<string, Reminder>();
const requests = new Map<string, Promise<Reminder | null>>();
export function CustomerDailyReminder({ salonCode, email, phone, salonName }: { salonCode: string; email: string; phone: string; salonName?: string }) {
  const identity = JSON.stringify([salonCode, email, phone]);
  const focused = useIsFocused();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState('');
  const [next, setNext] = useState(0);
  useEffect(() => {
    if (!focused || !salonCode || (!email && !phone)) return;
    let alive = true;
    let busy = false;
    let showing = false;
    const check = async () => {
      if (!alive || busy || showing || (Platform.OS !== 'web' && AppState.currentState !== 'active')) return;
      busy = true;
      try {
        let item = pendingReminders.get(identity) ?? null;
        if (!item) {
          let request = requests.get(identity);
          if (!request) {
            request = (async () => {
              const { data, error } = await publicSupabase.rpc('claim_public_customer_daily_reminder_v2', {
                p_salon_code: salonCode, p_customer_email: email || null, p_customer_phone: phone || null,
              });
              const result = error ? null : (data as Reminder[] | null)?.[0] ?? null;
              if (result) pendingReminders.set(identity, result);
              return result;
            })().catch(() => null).finally(() => requests.delete(identity));
            requests.set(identity, request);
          }
          item = await request;
        }
        // Keep a fetched claim across a tab change/background transition until it can be shown.
        if (!alive || (Platform.OS !== 'web' && AppState.currentState !== 'active')) return;
        if (item && Date.parse(item.ends_at) > Date.now()) { showing = true; setReminder(item); }
        else pendingReminders.delete(identity);
      } finally { busy = false; }
    };
    void check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    // No polling while the user stays in the app: first access/foreground only.
    return () => { alive = false; subscription.remove(); };
  }, [salonCode, email, phone, next, focused, identity]);
  useEffect(() => {
    if (!reminder) return;
    const delay = Math.min(2147483647, Math.max(0, Date.parse(reminder.ends_at) - Date.now()));
    const timer = setTimeout(() => { if (Date.parse(reminder.ends_at) <= Date.now()) { setReminder(null); setNext(n => n + 1); } }, delay);
    return () => clearTimeout(timer);
  }, [reminder]);
  const close = () => { pendingReminders.delete(identity); setReminder(null); setNext(n => n + 1); };
  const dismissForever = async () => {
    if (!reminder || dismissing) return;
    setDismissing(true); setDismissError('');
    try {
      const { data, error } = await publicSupabase.rpc('dismiss_public_customer_popup_v1', {
        p_communication_id: reminder.communication_id, p_salon_code: salonCode,
        p_customer_email: email || null, p_customer_phone: phone || null,
      });
      if (error || data !== true) throw error;
      close();
    } catch { setDismissError('Non riesco a salvare la preferenza. Riprova.'); }
    finally { setDismissing(false); }
  };
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={focused && !!reminder} transparent animationType="fade" onRequestClose={close}>
    <View style={s.overlay}><DockedSheetSurface webDocked={false} {...(Platform.OS !== 'web' ? {onClose: close} : {})} style={s.card}>
      <Text style={s.eyebrow}>AVVISO DEL SALONE</Text>
      {!!salonName && <Text style={s.salon}>{salonName}</Text>}
      <ScrollView style={s.scroll}><Text style={s.title}>{reminder?.title}</Text><Text style={s.body}>{reminder?.body}</Text><CommunicationPoster path={reminder?.image_path} /></ScrollView>
      <Text style={s.hint}>“Ho capito” chiude l’avviso per oggi. Scegli “Non mostrare più” per non rivederlo nei prossimi giorni.</Text>
      <HapticTouchable disabled={dismissing} style={s.button} onPress={close} accessibilityLabel="Chiudi avviso per oggi"><Text style={s.buttonText}>Ho capito</Text></HapticTouchable>
      <HapticTouchable disabled={dismissing} onPress={() => void dismissForever()} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#526781', fontWeight: '600' }}>{dismissing ? 'Salvataggio…' : 'Non mostrare più'}</Text></HapticTouchable>
      {!!dismissError && <Text accessibilityLiveRegion="polite" style={{ color: '#B44960' }}>{dismissError}</Text>}
    </DockedSheetSurface></View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 24, backgroundColor: 'rgba(15,23,42,.5)' , paddingBottom: 0 },
  card: { maxHeight: '80%', borderRadius: 24, backgroundColor: '#fff', padding: 24, gap: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: '#7055B9' },
  salon: { fontSize: 15, color: '#64748B', fontWeight: '600' },
  scroll: { flexShrink: 1 }, title: { fontSize: 23, lineHeight: 29, fontWeight: '700', color: '#172033', marginBottom: 16 },
  body: { fontSize: 17, lineHeight: 25, color: '#334155' }, hint: { fontSize: 12, lineHeight: 18, color: '#64748B' },
  button: { padding: 15, borderRadius: 14, backgroundColor: '#253D61', alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
