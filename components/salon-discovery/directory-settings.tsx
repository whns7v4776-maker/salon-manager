import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from '../owner-native-premium';
import { useAccessAppearance } from '../access-premium';
import { useSettingsWebStyles } from '../settings-web-styles';
import * as ImagePicker from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { plaqueUrl, useSalonPlaque } from '../../src/lib/salon-logo-plaque';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { DiscoveryPosition, formatSalonAddress, requestDiscoveryPosition } from '../../src/lib/salon-discovery';

type Props = { workspace: { id: string; salonName: string; salonAddress?: string; city?: string } };
export function DirectorySettings({ workspace }: Props) {
 const {palette:p}=useAccessAppearance();
 const s=useSettingsWebStyles(baseDirectorySettingsStyles);
  const [name, setName] = useState(workspace.salonName);
  const [address, setAddress] = useState(workspace.salonAddress ?? '');
  const [city, setCity] = useState(workspace.city ?? '');
  const [photo, setPhoto] = useState('');
  const [imageKind, setImageKind] = useState<'photo' | 'logo'>('photo');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageType, setPendingImageType] = useState<'png' | 'jpg'>('jpg');
  const plaque = useSalonPlaque(workspace.id);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [position, setPosition] = useState<DiscoveryPosition | null>(null);
  const geocodeLock = useRef(false);
  const [candidates, setCandidates] = useState<Array<DiscoveryPosition & { label: string; approximate: boolean }>>([]);
  const [mapChecked, setMapChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setReady(false);
    supabase.from('salon_directory_profiles').select('*').eq('workspace_id', workspace.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage('Impossibile caricare la visibilità. Riapri le impostazioni per riprovare.');
      else {
        setReady(true);
        if (data) { setName(data.display_name); setAddress(data.address); setCity(data.city); setPhoto(data.photo_url ?? ''); setImageKind(data.image_kind); setSavedEnabled(data.enabled); setEnabled(data.enabled); setConfirmed(data.address_confirmed); setMapChecked(data.address_confirmed); setPosition(data.latitude === null ? null : { latitude: data.latitude, longitude: data.longitude, accuracy: data.location_accuracy }); }
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [workspace.id]);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoLocation')) return;
    let alive = true;
    setGpsAvailable(true);
    const refresh = async () => {
      try {
        const location = await import('expo-location');
        const [permission, services] = await Promise.all([location.getForegroundPermissionsAsync(), location.hasServicesEnabledAsync()]);
        if (alive) setGpsReady(permission.granted && services);
      } catch { if (alive) setGpsReady(false); }
    };
    void refresh();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  const enableGps = async () => {
    try {
      const location = await import('expo-location');
      const permission = await location.requestForegroundPermissionsAsync();
      const services = await location.hasServicesEnabledAsync();
      setGpsReady(permission.granted && services);
      if (!permission.granted || !services) {
        setMessage('Abilita la posizione e la localizzazione precisa nelle impostazioni del dispositivo, poi torna qui.');
        await Linking.openSettings();
      }
    } catch { setMessage('Non riesco ad attivare la posizione. Controlla le impostazioni del dispositivo.'); }
  };
  const locate = async () => {
    if (!gpsReady) return;
    setBusy(true); setMessage('');
    try {
      const next = await requestDiscoveryPosition(true);
      if (next.accuracy === undefined || next.accuracy > 100) throw new Error('Posizione troppo approssimativa. Attiva la posizione precisa e riprova dalla sede del salone.');
      setPosition(next); setConfirmed(false); setMapChecked(false);
      setMessage(`Posizione acquisita, accuratezza circa ${Math.ceil(next.accuracy)} metri. Controllala sulla mappa e conferma la sede.`);
    }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Posizione non disponibile.'); }
    finally { setBusy(false); }
  };
  const findAddress = async () => {
    if (busy || geocodeLock.current) return;
    if (address.trim().length < 3 || city.trim().length < 2) { setMessage('Inserisci via, numero civico e città.'); return; }
    geocodeLock.current = true; setBusy(true); setMessage(''); setCandidates([]);
    try {
      const { data, error } = await supabase.functions.invoke('salon-geocode', { body: { address: address.trim(), city: city.trim() } });
      if (error || data?.error) throw new Error(data?.error || 'Ricerca indirizzo non disponibile. Riprova oppure usa il GPS dalla sede.');
      setCandidates(data?.results ?? []);
      setMessage(data?.results?.length ? 'Seleziona la sede, controlla il punto sulla mappa e conferma prima di salvare.' : 'Indirizzo non trovato con sufficiente dettaglio. Controlla via, civico e città oppure usa il GPS quando sei nel salone.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ricerca non disponibile.'); }
    finally { geocodeLock.current = false; setBusy(false); }
  };
  const chooseImage = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      let image: { uri: string; base64?: string | null } = { uri: asset.uri, base64: asset.base64 };
      if (Platform.OS === 'web' || requireOptionalNativeModule('ExpoImageManipulator')) {
        const ImageManipulator = await import('expo-image-manipulator');
        image = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: asset.width > asset.height ? { width: Math.min(1200, asset.width) } : { height: Math.min(1200, asset.height) } }], { compress: 0.85, format: imageKind === 'logo' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG, base64: true });
      }
      if (!image.base64 || image.base64.length > 6500000) throw new Error('Immagine troppo grande. Scegli una foto più piccola.');
      // Detect the actual encoded format, including the picker fallback on older builds.
      const format = image.base64.startsWith('iVBORw0KGgo') ? 'png' : image.base64.startsWith('/9j/') ? 'jpg' : null;
      if (!format) throw new Error('Scegli un’immagine in formato JPEG o PNG.');
      setPendingImageType(format); setPendingImage(image.base64); setPhoto(image.uri);
    } catch (error) { setMessage(error instanceof Error && (error.message.startsWith('Immagine troppo grande') || error.message.startsWith('Scegli un’immagine')) ? error.message : 'Non riesco a caricare questa immagine. Prova un’altra foto.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy) return;
    if (name.trim().length < 2 || address.trim().length < 3 || city.trim().length < 2) { setMessage('Compila nome, indirizzo completo e città.'); return; }
    setBusy(true); setMessage('');
    try {
      let finalPhoto = photo;
      if (pendingImage) {
        const bytes = Uint8Array.from(atob(pendingImage), c => c.charCodeAt(0));
        const path = `${workspace.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${pendingImageType}`;
        const upload = await supabase.storage.from('salon-directory').upload(path, bytes.buffer, { contentType: pendingImageType === 'png' ? 'image/png' : 'image/jpeg', upsert: false });
        if (upload.error) throw upload.error;
        finalPhoto = supabase.storage.from('salon-directory').getPublicUrl(path).data.publicUrl;
        setPhoto(finalPhoto); setPendingImage(null);
      }
      const { data, error } = await supabase.from('salon_directory_profiles').upsert({ workspace_id: workspace.id, display_name: name.trim(), address: address.trim(), city: city.trim(), photo_url: finalPhoto || null, image_kind: imageKind, latitude: position?.latitude ?? null, longitude: position?.longitude ?? null, location_accuracy: position?.accuracy ?? null, address_confirmed: confirmed, enabled }).select('enabled').single();
      if (error || !data) throw error;
      setSavedEnabled(data.enabled);
      setMessage(data.enabled ? (position && confirmed ? 'Scheda salvata. Il salone è visibile anche nella ricerca GPS.' : 'Scheda salvata. Il salone è visibile per nome e città. Conferma la posizione per comparire anche nella ricerca GPS.') : 'Scheda salvata sul server. Il salone è nascosto dalla ricerca; codice, QR e link restano disponibili.');
    } catch { setMessage('Salvataggio non confermato. Controlla la connessione e riprova.'); }
    finally { setBusy(false); }
  };
  return <View style={s.card}>
    <View style={s.statusRow}><Text style={s.eyebrow}>LA TUA VETRINA SALONPRO</Text><Text style={[s.status, savedEnabled && s.statusOn]}>{savedEnabled ? '● Visibile' : '○ Nascosto'}</Text></View>
    <Text style={s.title}>Il tuo salone, da scoprire</Text><Text style={s.body}>Il salone è visibile di default nella ricerca per nome e città. Puoi nasconderlo qui. Aggiungi e conferma la posizione per comparire anche tra i saloni più vicini.</Text>
    {loading ? <ActivityIndicator /> : <>
      <View style={s.preview}>
        {photo ? <Image accessibilityLabel="Anteprima immagine del salone" source={{ uri: photo }} resizeMode={imageKind === 'logo' ? 'contain' : 'cover'} style={s.previewImage} /> : <View style={[s.previewImage, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="storefront-outline" size={48} color="#64748b" /><Text style={s.body}>La tua foto o insegna</Text></View>}
        <View style={{ padding: 18, gap: 6 }}><Text style={s.title}>{name || 'Il tuo salone'}</Text><Text style={s.body}>{formatSalonAddress(address, city) || 'Indirizzo della sede'}</Text><Text style={s.eyebrow}>ANTEPRIMA DELLA SCHEDA CLIENTE</Text></View>
      </View>
      <Text style={s.section}>01 · Immagine del salone</Text>
      <View style={s.row}>{(['photo', 'logo'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: imageKind === kind }} disabled={busy} onPress={() => setImageKind(kind)} style={[s.choice, imageKind === kind && s.choiceActive]}><Text style={{ color: Platform.OS==='web'?(imageKind===kind?p.actionText:p.ink):(imageKind === kind ? 'white' : '#334155'), fontWeight: '500' }}>{kind === 'photo' ? 'Foto del salone' : 'Insegna / logo'}</Text></Pressable>)}</View>
      <Pressable disabled={busy || !ready} onPress={() => void chooseImage()} style={s.secondary}><Text style={s.secondaryText}>{photo ? 'Scegli un’altra immagine' : 'Scegli dalla galleria'}</Text></Pressable>
      {plaque?.path ? <Pressable disabled={busy} onPress={() => { setImageKind('logo'); setPhoto(plaqueUrl(plaque.path)); setPendingImage(null); }} style={s.secondary}><Text style={s.secondaryText}>Usa il logo già salvato su SalonPro</Text></Pressable> : null}
      {photo ? <Pressable disabled={busy} onPress={() => { setPhoto(''); setPendingImage(null); }} style={{ padding: 12 }}><Text style={s.body}>Rimuovi immagine dalla scheda</Text></Pressable> : null}
      <Text style={s.section}>02 · Nome e sede</Text>
      <Text style={s.label}>Nome del salone</Text><TextInput editable={!busy} accessibilityLabel="Nome pubblico del salone" value={name} onChangeText={setName} maxLength={100} style={s.input} />
      <Text style={s.label}>Indirizzo della sede</Text><TextInput editable={!busy} accessibilityLabel="Indirizzo pubblico del salone" placeholder="Via e numero civico" value={address} onChangeText={value => { setAddress(value); setCandidates([]); setConfirmed(false); setMapChecked(false); setPosition(null); }} maxLength={180} style={s.input} />
      <Text style={s.label}>Città</Text><TextInput editable={!busy} accessibilityLabel="Città del salone" value={city} onChangeText={value => { setCity(value); setCandidates([]); setConfirmed(false); setMapChecked(false); setPosition(null); }} maxLength={100} style={s.input} />
      <Pressable accessibilityRole="button" disabled={busy || !ready} onPress={() => void findAddress()} style={s.secondary}><Text style={s.secondaryText}>{busy && geocodeLock.current ? 'Ricerca indirizzo…' : 'Trova la sede dall’indirizzo'}</Text></Pressable>
      <Text style={s.body}>Puoi farlo anche da casa: controlla il punto sulla mappa e conferma la sede una sola volta.</Text>
      {candidates.map((candidate, index) => <Pressable key={index} disabled={busy} style={s.secondary} onPress={() => { setPosition({ latitude: candidate.latitude, longitude: candidate.longitude }); setConfirmed(false); setMapChecked(false); setCandidates([]); setMessage('Controlla il punto sulla mappa, conferma la sede e premi Salva modifiche.'); }}><Text style={s.label}>{candidate.label}</Text>{candidate.approximate ? <Text style={s.body}>Numero civico non individuato: verifica con attenzione il punto sulla mappa.</Text> : null}</Pressable>)}
      <Text onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')} style={s.body}>Ricerca indirizzi: © OpenStreetMap contributors</Text>
      {Platform.OS !== 'web' ? <>
        <Pressable disabled={busy || !ready || !gpsReady} onPress={() => void locate()} style={[s.secondary, !gpsReady && { opacity: 0.45 }]}><Text style={s.secondaryText}>{position ? 'Aggiorna posizione della sede' : 'Sono nel salone: usa questa posizione'}</Text></Pressable>
        {!gpsReady && (gpsAvailable ? <Pressable onPress={() => void enableGps()} style={s.secondary}><Text style={s.secondaryText}>Abilita la posizione</Text></Pressable> : <Text style={s.body}>Aggiorna l’app per acquisire la posizione precisa della sede.</Text>)}
      </> : <Text style={s.body}>In alternativa puoi acquisire il GPS dall’app quando sei nel salone.</Text>}
      {position ? <View><Pressable onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`).then(() => setMapChecked(true)).catch(() => setMessage('Non riesco ad aprire la mappa. Riprova.')); }} style={s.secondary}><Text style={s.secondaryText}>Controlla la sede sulla mappa</Text></Pressable><Text style={s.body}>{position.accuracy != null ? `Precisione rilevata: circa ${Math.ceil(position.accuracy)} metri` : 'Posizione ricavata dall’indirizzo: verifica che il punto corrisponda all’ingresso del salone.'}</Text><Pressable onPress={() => { setPosition(null); setConfirmed(false); setMapChecked(false); }} style={s.secondary}><Text style={s.secondaryText}>Rimuovi posizione</Text></Pressable></View> : null}
      <Text style={s.section}>03 · Visibilità nella ricerca</Text>
      <View style={s.row}><Text style={[s.body, { flex: 1 }]}>Confermo che indirizzo e posizione indicano la sede del salone, per comparire tra i saloni vicini.</Text><Switch disabled={busy || !position || !mapChecked} accessibilityLabel="Conferma la posizione della sede" value={confirmed} onValueChange={value => { setConfirmed(value);  }} /></View>
      <View style={s.row}><Text style={[s.label, { flex: 1 }]}>Mostra il salone nella ricerca</Text><Switch accessibilityLabel="Visibile nella ricerca saloni" value={enabled} disabled={busy} onValueChange={setEnabled} /></View>
      {enabled !== savedEnabled ? <Text style={s.body}>La modifica della visibilità sarà applicata quando premi Salva.</Text> : null}
      <Pressable disabled={busy || !ready} onPress={() => void save()} style={[s.save, (busy || !ready) && { opacity: 0.5 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.saveText}>{enabled ? (savedEnabled ? 'Salva modifiche' : 'Salva e rendi visibile') : (savedEnabled ? 'Salva e nascondi salone' : 'Salva scheda')}</Text>}</Pressable>
    </>}
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
  </View>;
}
const baseDirectorySettingsStyles = StyleSheet.create({
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 10, color: '#64748b', fontWeight: '700', letterSpacing: 1.3 }, status: { color: '#64748b', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontSize: 12, fontWeight: '700' }, statusOn: { color: '#166534', backgroundColor: '#ecfdf3' },
  preview: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, overflow: 'hidden', marginVertical: 8 }, previewImage: { width: '100%', height: 210, backgroundColor: '#f1f5f9' },
  section: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 18, marginBottom: 4 }, choice: { flex: 1, alignItems: 'center', padding: 15, borderWidth: 1, borderColor: '#dce3ec', borderRadius: 14 }, choiceActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
 card: { backgroundColor: '#fff', padding: 22, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', gap: 12, marginBottom: 18 }, title: { fontSize: 21, color: '#0f172a', fontWeight: '800' }, body: { fontSize: 14, lineHeight: 21, color: '#64748b' }, label: { fontSize: 14, fontWeight: '700', color: '#334155' }, input: { fontSize: 16, color: '#0f172a', borderWidth: 1, borderColor: '#dce3ec', backgroundColor: '#f8fafc', borderRadius: 13, padding: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, secondary: { padding: 13, minHeight: 46, backgroundColor: '#eef4fd', borderRadius: 13 }, secondaryText: { color: '#2459a8', fontWeight: '600', textAlign: 'center' }, save: { backgroundColor: '#0f172a', padding: 16, minHeight: 50, borderRadius: 14, alignItems: 'center' }, saveText: { color: 'white', fontWeight: '700', fontSize: 15 } });
