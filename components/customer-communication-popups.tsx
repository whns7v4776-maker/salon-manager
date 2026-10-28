import { useCustomerPremiumColor } from './owner-premium-customers-style';
import { CommunicationPoster } from "./communication-poster";
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';

type Popup = { image_path?: string | null; reminder_cancelled_at: string | null; id: string; title: string; body: string; reminder_title: string | null; reminder_body: string | null; reminder_starts_at: string; reminder_ends_at: string };
const date = (value: string) => new Date(value).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric' });
export function CustomerCommunicationPopups({ revision = 0 }: { revision?: number }) {
 const premiumColor=useCustomerPremiumColor();

  const [items, setItems] = useState<Popup[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase.from('customer_communications')
        .select('image_path,id,title,body,reminder_title,reminder_body,reminder_starts_at,reminder_ends_at,reminder_cancelled_at')
        .not('reminder_starts_at', 'is', null).order('reminder_ends_at', { ascending: false }).limit(100);
      if (result.error) throw result.error;
      setItems(result.data as Popup[] ?? []);
      setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, revision]);
  const remove = (id: string) => {
    const commit = async () => {
      if (removing) return;
      setRemoving(id); setActionError('');
      try {
        const { error } = await supabase.rpc('cancel_owner_customer_popup_v1', { p_communication_id: id });
        if (error) throw error;
        await refresh();
      } catch { setActionError('Rimozione non confermata. Riprova.'); }
      finally { setRemoving(null); }
    };
    if (Platform.OS === 'web') { if (window.confirm('Rimuovere questo popup? Non comparirà più ai clienti.')) void commit(); }
    else Alert.alert('Rimuovi popup', 'Non comparirà più ai clienti.', [{ text: 'Indietro', style: 'cancel' }, { text: 'Rimuovi', style: 'destructive', onPress: () => void commit() }]);
  };
  return <View style={{ gap: 12 }}>
    <Text style={{ color: premiumColor("#253D61","color"), fontSize: 18, fontWeight: '700' }}>Popup nel periodo</Text>
    <Text style={{ color: premiumColor("#64748B","color"), lineHeight: 20 }}>Popup delle comunicazioni già create, mostrati al cliente una volta al giorno nel periodo indicato. Gli invii ancora in attesa si trovano in “Programmati”.</Text>
    <HapticTouchable accessibilityRole="button" onPress={() => void refresh()} style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: premiumColor("#E8EEF7","backgroundColor") }}><Text style={{ color: premiumColor("#253D61","color"), fontWeight: '600' }}>Aggiorna elenco</Text></HapticTouchable>
    {!!actionError && <Text style={{ color: premiumColor("#B44960","color") }}>{actionError}</Text>}
    {loading ? <Text>Caricamento…</Text> : error ? <Text>Non riesco a caricare i popup. Riprova.</Text> : !items.length ? <Text style={{ color: premiumColor("#64748B","color") }}>Nessun popup con periodo.</Text> : items.map(item => {
      const now = Date.now();
      const ended = !!item.reminder_cancelled_at || Date.parse(item.reminder_ends_at) <= now;
      const upcoming = Date.parse(item.reminder_starts_at) > now;
      return <View key={item.id} style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: premiumColor("#DCE5F1","borderColor"), backgroundColor: premiumColor("#F4F7FC","backgroundColor"), gap: 8 }}>
        <Text style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', backgroundColor: ended ? premiumColor("#E6EAF0","backgroundColor") : upcoming ? premiumColor("#E3EBFF","backgroundColor") : premiumColor("#DDF5E9","backgroundColor"), color: ended ? premiumColor("#64748B","color") : upcoming ? premiumColor("#3158A3","color") : premiumColor("#16734B","color"), fontWeight: '700', fontSize: 11 }}>{item.reminder_cancelled_at ? 'Rimosso' : ended ? 'Concluso' : upcoming ? 'In programma' : 'Attivo'}</Text>
        <Text style={{ color: premiumColor("#172033","color"), fontWeight: '700', fontSize: 16 }}>{item.reminder_title || item.title}</Text>
        <Text style={{ color: premiumColor("#475569","color"), lineHeight: 20 }}>{item.reminder_body || item.body}</Text><CommunicationPoster path={item.image_path} />
        <Text style={{ color: premiumColor("#526781","color"), fontSize: 12 }}>Dal {date(item.reminder_starts_at)} al {date(item.reminder_ends_at)}</Text>
        {!ended && <HapticTouchable disabled={!!removing} onPress={() => remove(item.id)} style={{ alignSelf: 'flex-start', minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: premiumColor("#FFF1F3","backgroundColor") }}><Text style={{ color: premiumColor("#B44960","color"), fontWeight: '700' }}>{removing === item.id ? 'Rimozione…' : 'Rimuovi popup'}</Text></HapticTouchable>}
      </View>;
    })}
  </View>;
}
