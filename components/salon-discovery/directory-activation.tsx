import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';

type Candidate = { latitude: number; longitude: number; label: string; approximate?: boolean };
export function DirectoryActivation({ workspaceId, onComplete, onLater }: { workspaceId: string; onComplete: () => void; onLater: () => void }) {
  const { salonWorkspace } = useAppContext();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [name, setName] = useState('');
  const [exists, setExists] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.from('salon_directory_profiles').select('display_name,address,city,latitude,longitude,enabled').eq('workspace_id', workspaceId).maybeSingle();
      if (!alive) return;
      if (error) { setMessage('Impossibile caricare la sede. Chiudi e riprova.'); return; }
      if (data?.enabled === false) { setMessage('La vetrina è stata nascosta nelle impostazioni.'); return; }
      setExists(!!data); setName(data?.display_name || salonWorkspace.salonName);
      setAddress(data?.address || salonWorkspace.salonAddress || ''); setCity(data?.city || salonWorkspace.city || '');
      if (data?.latitude != null && data.longitude != null) setSelected({ latitude: data.latitude, longitude: data.longitude, label: data.address });
      setReady(true);
    })();
    return () => { alive = false; };
  }, [workspaceId]);
  const reset = () => { setSelected(null); setChecked(false); setResults([]); setMessage(''); };
  const search = async () => {
    if (lock.current || !ready) return;
    if (address.trim().length < 3 || city.trim().length < 2) { setMessage('Inserisci via, numero civico e città.'); return; }
    lock.current = true; setBusy(true); reset();
    try {
      const { data, error } = await supabase.functions.invoke('salon-geocode', { body: { address: address.trim(), city: city.trim() } });
      if (error || data?.error) throw new Error('Ricerca non disponibile. Riprova tra poco.');
      setResults(data?.results || []);
      if (!data?.results?.length) setMessage('Indirizzo non trovato. Controlla il nome del comune, la via e il numero civico.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ricerca non disponibile.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !ready || !selected || !checked) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const values = { address: address.trim(), city: city.trim(), latitude: selected.latitude, longitude: selected.longitude, location_accuracy: null, address_confirmed: true };
      // Update only location fields: preserve photos, branding and visibility preferences.
      const response = exists
        ? await supabase.from('salon_directory_profiles').update(values).eq('workspace_id', workspaceId).eq('enabled', true).select('workspace_id').single()
        : await supabase.from('salon_directory_profiles').insert({ ...values, workspace_id: workspaceId, display_name: name, enabled: true }).select('workspace_id').single();
      if (response.error || !response.data) throw new Error('save');
      onComplete();
    } catch { setMessage('Attivazione non confermata. Controlla la connessione e riprova.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <Text style={s.title}>Conferma la sede del salone</Text>
    <Text style={s.body}>Controlla l’indirizzo e il punto sulla mappa. La posizione resterà salvata per le prossime ricerche.</Text>
    <Text style={s.label}>Via e numero civico</Text>
    <TextInput accessibilityLabel="Via e numero civico" style={s.input} value={address} editable={ready && !busy} maxLength={180} onChangeText={value => { setAddress(value); reset(); }} />
    <Text style={s.label}>Comune</Text>
    <TextInput accessibilityLabel="Comune" style={s.input} value={city} editable={ready && !busy} maxLength={100} onChangeText={value => { setCity(value); reset(); }} />
    <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => void search()} style={s.mapButton}><Ionicons name="search-outline" size={21} color="#fff" /><Text style={s.buttonText}>Cerca la sede sulla mappa</Text><Ionicons name="chevron-forward" size={19} color="#fff" /></Pressable>
    {results.map((result, index) => <Pressable accessibilityRole="button" key={index} disabled={busy} onPress={() => { setSelected(result); setChecked(false); setResults([]); }} style={s.secondary}><Text style={s.label}>{result.label}</Text>{result.approximate ? <Text style={s.body}>Civico non individuato: verifica il punto prima di confermare.</Text> : null}</Pressable>)}
    {selected ? <View style={{ gap: 10 }}><Text style={s.body}>{selected.label}</Text><Pressable accessibilityRole="button" disabled={busy} style={s.mapButton} onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`).then(() => setChecked(true)).catch(() => setMessage('Impossibile aprire la mappa. Riprova.')); }}><Ionicons name="map-outline" size={23} color="#fff" /><Text style={[s.buttonText, { flex: 1 }]}>Apri la mappa e verifica la sede</Text><Ionicons name="open-outline" size={20} color="#fff" /></Pressable><Text style={s.body}>Dopo aver controllato la mappa, torna qui e conferma che il punto indica la sede corretta.</Text></View> : null}
    <Text style={s.body} onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}>© OpenStreetMap contributors</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
    <Pressable accessibilityRole="button" disabled={!checked || !selected || busy} onPress={() => void save()} style={[s.button, (!checked || !selected || busy) && { opacity: 0.45 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Conferma e attiva la ricerca GPS</Text>}</Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onLater} style={s.secondary}><Text style={s.label}>Più tardi</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({ mapButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, minHeight: 54, borderRadius: 16, backgroundColor: '#2459A8', borderWidth: 1, borderColor: '#1E4B90' }, title: { fontSize: 21, fontWeight: '700', color: '#14243A' }, body: { fontSize: 14, lineHeight: 21, color: '#526882' }, label: { fontSize: 15, fontWeight: '600', color: '#34516C' }, input: { borderWidth: 1, borderColor: '#DCE3EC', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 13, fontSize: 16, color: '#14243A' }, secondary: { padding: 14, minHeight: 46, borderRadius: 14, backgroundColor: '#EEF3F8' }, button: { padding: 15, minHeight: 48, borderRadius: 16, backgroundColor: '#20384F', alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' } });
