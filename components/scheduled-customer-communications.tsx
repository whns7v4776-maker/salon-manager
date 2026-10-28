import { useCustomerPremiumColor } from './owner-premium-customers-style';
import { CommunicationPoster } from "./communication-poster";
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';
type Scheduled = { image_path?: string | null; id: string; title: string; body: string; scheduled_at: string; status: string };
export function ScheduledCustomerCommunications({ revision = 0 }: { revision?: number }) {
 const premiumColor=useCustomerPremiumColor();

  const [items, setItems] = useState<Scheduled[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('scheduled_customer_communications').select('image_path,id,title,body,scheduled_at,status').in('status', ['pending', 'failed']).order('scheduled_at').limit(100);
    setError(!!error);
    if (!error) setItems(data ?? []);
  }, []);
  useEffect(() => { void refresh(); }, [refresh, revision]);
  const cancel = (item: Scheduled) => {
    const performCancel = async () => {
    if (busy) return; setBusy(item.id);
    try {
      const { data, error } = await supabase.rpc('cancel_scheduled_customer_communication', { p_id: item.id });
      if (error) throw error;
      if (!data) (Platform.OS === 'web' ? window.alert('Invio già elaborato. Aggiorno l’elenco: potrebbe essere già partito.') : Alert.alert('Invio già elaborato', 'Aggiorno l’elenco: potrebbe essere già partito.'));
      await refresh();
    } catch { (Platform.OS === 'web' ? window.alert('Annullamento non confermato. Riprova tra poco.') : Alert.alert('Annullamento non confermato', 'Riprova tra poco.')); } finally { setBusy(null); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Annullare l’invio?\n\n${item.title}`)) void performCancel();
    } else Alert.alert('Annullare l’invio?', item.title, [{ text: 'Mantieni', style: 'cancel' }, { text: 'Annulla invio', style: 'destructive', onPress: performCancel }]);
  };
  return <View style={{ gap: 12, marginVertical: 16 }}>
    <Text style={{ fontSize: 18, fontWeight: '700', color: premiumColor("#253D61","color") }}>Programmati da inviare</Text>
    <HapticTouchable onPress={() => void refresh()}><Text style={{ color: premiumColor("#6246c7","color") }}>Aggiorna elenco</Text></HapticTouchable>
    {error ? <Text>Non riesco a caricare gli invii programmati. Riprova.</Text> : !items.length ? <Text style={{ color: premiumColor("#64748B","color") }}>Nessun invio programmato.</Text> : items.map(item => <View key={item.id} style={{ backgroundColor: premiumColor("#F0F4F9","backgroundColor"), borderRadius: 14, padding: 14, gap: 8 }}>
      <Text style={{ fontWeight: '700', color: premiumColor("#172033","color") }}>{item.title}</Text>
      <Text style={{ color: premiumColor("#334155","color") }}>{item.body}</Text><CommunicationPoster path={item.image_path} />
      <Text style={{ color: item.status === 'failed' ? premiumColor("#B42318","color") : premiumColor("#64748B","color") }}>{item.status === 'failed' ? 'Invio non riuscito · annulla e ricrea la comunicazione' : new Date(item.scheduled_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) + ' · ora italiana'}</Text>
      <HapticTouchable disabled={!!busy} onPress={() => cancel(item)}><Text style={{ color: premiumColor("#B42318","color"), fontWeight: '600' }}>{busy === item.id ? 'Annullo…' : 'Annulla invio'}</Text></HapticTouchable>
    </View>)}
  </View>;
}
