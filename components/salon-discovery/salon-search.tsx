import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { accessPremiumStyles, useAccessAppearance } from '../access-premium';
import { DiscoveryPosition, formatSalonAddress, requestDiscoveryPosition, SalonSearchResult, searchPublicSalons } from '../../src/lib/salon-discovery';

export function SalonSearch({ onSelect, disabled, alternate = false, premiumAppearance = false }: { premiumAppearance?: boolean; alternate?: boolean; onSelect: (code: string) => Promise<void>; disabled: boolean }) {
  const { palette } = useAccessAppearance();
  const s = useMemo(() => premiumAppearance ? {
    ...accessPremiumStyles(baseStyles, palette),
    card: { ...baseStyles.card, backgroundColor: 'transparent', borderWidth: 0, padding: 0, marginVertical: 8, gap: 10 },
    title: { ...baseStyles.title, fontFamily: 'Georgia', fontWeight: '400' as const, color: palette.ink, fontSize: 21 },
    subtitle: { ...baseStyles.subtitle, color: palette.muted, fontSize: 12 },
    input: { ...baseStyles.input, color: palette.ink, backgroundColor: 'transparent' },
    headerIcon: { ...baseStyles.headerIcon, backgroundColor: palette.field, width: 38, height: 38, borderWidth: 1, borderColor: palette.line },
    location: { ...baseStyles.location, backgroundColor: palette.field, borderColor: palette.line },
    error: { ...baseStyles.error, color: palette.night ? '#F0AAA1' : baseStyles.error.color },
  } : baseStyles, [premiumAppearance, palette]);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<DiscoveryPosition | null>(null);
  const [results, setResults] = useState<SalonSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setResults([]); setError(''); setSearched(false);
    if (query.trim().length < 2 && !position) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => {
      searchPublicSalons(query, position).then(items => {
        if (generation.current === token) { setResults(items); setSearched(true); }
      }).catch(e => { if (generation.current === token) setError(e.message); })
        .finally(() => { if (generation.current === token) setBusy(false); });
    }, 350);
    return () => { clearTimeout(timer); generation.current++; };
  }, [query, position, retry]);
  const nearby = async () => {
    if (locating) return;
    setLocating(true); setError('');
    try { const nextPosition = await requestDiscoveryPosition(); setQuery(''); setPosition(nextPosition); }
    catch (e) { setError(e instanceof Error ? e.message : 'Posizione non disponibile. Cerca per città.'); }
    finally { setLocating(false); }
  };
  return <View style={s.card}>
    <View style={s.header}>
      <View style={s.headerIcon}><Ionicons name="storefront-outline" size={21} color={premiumAppearance ? palette.muted : "#334155"} /></View>
      <View style={s.headerCopy}>
        <Text accessibilityRole="header" style={s.title}>{alternate ? 'Cerca un altro salone' : 'Trova il tuo salone'}</Text>
        <Text style={s.subtitle}>Per nome, città o vicino a te.</Text>
      </View>
    </View>
    {premiumAppearance ? <>
          <View style={s.inputRow}><Ionicons name="search-outline" size={22} color={premiumAppearance ? palette.muted : "#64748b"} /><TextInput accessibilityLabel="Nome del salone o città" placeholder="Nome del salone o città" placeholderTextColor={premiumAppearance ? palette.muted : "#718096"} value={query} onChangeText={setQuery} maxLength={100} autoCorrect={false} style={s.input} />{query ? <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={s.clear}><Ionicons name="close-circle" size={22} color={premiumAppearance ? palette.muted : "#64748b"} /></Pressable> : null}</View>
      <View style={s.locationRow}><Pressable disabled={locating} accessibilityRole="button" onPress={() => void nearby()} style={({ pressed }) => [s.location, pressed && { opacity: 0.8 }, locating && { opacity: 0.65 }]}>{locating ? <ActivityIndicator color={premiumAppearance ? palette.muted : "#2459a8"} /> : <Ionicons name="locate-outline" size={19} color={premiumAppearance ? palette.muted : "#2459a8"} />}<Text style={s.locationText}>{locating ? 'Cerco la posizione…' : 'Saloni vicino a me'}</Text></Pressable>{position ? <Pressable onPress={() => setPosition(null)} style={s.clear}><Text style={s.muted}>Solo ricerca</Text></Pressable> : null}</View>
          {position ? <Text style={s.muted}>{query.trim().length >= 2 ? 'Ricerca per nome o città · distanza dove disponibile' : 'Ordinati per distanza · la tua posizione non viene salvata'}</Text> : null}
    </> : <>
    <View style={s.locationRow}><Pressable disabled={locating} accessibilityRole="button" onPress={() => void nearby()} style={({ pressed }) => [s.location, pressed && { opacity: 0.8 }, locating && { opacity: 0.65 }]}>{locating ? <ActivityIndicator color={premiumAppearance ? palette.muted : "#2459a8"} /> : <Ionicons name="locate-outline" size={19} color={premiumAppearance ? palette.muted : "#2459a8"} />}<Text style={s.locationText}>{locating ? 'Cerco la posizione…' : 'Saloni vicino a me'}</Text></Pressable>{position ? <Pressable onPress={() => setPosition(null)} style={s.clear}><Text style={s.muted}>Solo ricerca</Text></Pressable> : null}</View>
    {position ? <Text style={s.muted}>{query.trim().length >= 2 ? 'Ricerca per nome o città · distanza dove disponibile' : 'Ordinati per distanza · la tua posizione non viene salvata'}</Text> : null}
    <View style={s.inputRow}><Ionicons name="search-outline" size={22} color={premiumAppearance ? palette.muted : "#64748b"} /><TextInput accessibilityLabel="Nome del salone o città" placeholder="Nome del salone o città" placeholderTextColor={premiumAppearance ? palette.muted : "#718096"} value={query} onChangeText={setQuery} maxLength={100} autoCorrect={false} style={s.input} />{query ? <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={s.clear}><Ionicons name="close-circle" size={22} color={premiumAppearance ? palette.muted : "#64748b"} /></Pressable> : null}</View>
    </>}
    {busy ? <ActivityIndicator style={{ padding: 8 }} color={premiumAppearance ? palette.muted : "#0f172a"} /> : null}
    {error ? <View accessibilityLiveRegion="polite"><Text style={s.error}>{error}</Text><Pressable onPress={() => setRetry(n => n + 1)} style={s.clear}><Text style={s.locationText}>Riprova</Text></Pressable></View> : null}
    {!busy && searched && results.length === 0 ? <Text style={s.empty}>Nessun salone trovato. Prova un altro nome o una città. Il tuo salone potrebbe non essere ancora visibile: puoi sempre usare codice o QR.</Text> : null}
    {results.length > 0 ? <View style={s.results}>
    {results.map(item => <Pressable key={item.salon_code} accessibilityRole="button" accessibilityLabel={`Apri ${item.salon_name}, ${item.city}`} disabled={disabled} onPress={() => void onSelect(item.salon_code)} style={({ pressed }) => [s.result, pressed && { opacity: 0.7, transform: [{ scale: 0.99 }] }, disabled && { opacity: 0.5 }]}>
      {item.photo_url ? <Image source={{ uri: item.photo_url }} resizeMode={item.image_kind === 'logo' ? 'contain' : 'cover'} style={s.photo} /> : <View style={s.photo}><Ionicons name="storefront-outline" size={38} color={premiumAppearance ? palette.muted : "#64748b"} /></View>}
      <View style={s.resultBody}><Text style={s.name}>{item.salon_name}</Text><Text style={s.address} numberOfLines={2}>{formatSalonAddress(item.address, item.city)}</Text>{item.distance_km !== null ? <Text style={s.distance}>{item.distance_km < 1 ? 'A meno di 1 km' : `A ${item.distance_km.toFixed(1).replace('.', ',')} km`}</Text> : null}</View>
      <View style={s.open}><Text style={s.openText}>Scopri il salone</Text><Ionicons name="arrow-forward" size={18} color={premiumAppearance ? palette.muted : "#2459a8"} /></View>
    </Pressable>)}
    </View> : null}
  </View>;
}
const baseStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14, gap: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E1E7EF', marginVertical: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: '#0f172a' },
  subtitle: { fontSize: 13, lineHeight: 19, color: '#64748b' },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderWidth: 1, borderColor: '#DCE4EE', backgroundColor: '#F8FAFC', borderRadius: 14, paddingLeft: 12 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 14, fontSize: 16, color: '#0f172a' },
  clear: { padding: 12, minHeight: 44, justifyContent: 'center' },
  locationRow: { alignItems: 'stretch', gap: 6 },
  location: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, borderRadius: 14, backgroundColor: '#EDF3FC', borderWidth: 1, borderColor: '#DCE7F7' },
  locationText: { color: '#2459a8', fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  muted: { fontSize: 12, lineHeight: 18, color: '#64748b', textAlign: 'center' },
  error: { color: '#9f3535', fontSize: 14, lineHeight: 21 },
  empty: { color: '#64748b', fontSize: 14, lineHeight: 22, paddingVertical: 8 },
  results: { gap: 12, marginTop: 0 },
  result: { width: '100%', borderWidth: 1, borderColor: '#DCE4EE', borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  photo: { width: '100%', height: 160, backgroundColor: '#F0F4F9', alignItems: 'center', justifyContent: 'center' },
  resultBody: { minWidth: 0, gap: 5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  open: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, paddingHorizontal: 14, minHeight: 42, borderRadius: 13, backgroundColor: '#EDF3FC' },
  openText: { color: '#2459a8', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#0f172a' },
  address: { fontSize: 13, lineHeight: 19, color: '#64748b' },
  distance: { fontSize: 12, color: '#2459a8', fontWeight: '600' },
});
