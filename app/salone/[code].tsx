import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import Head from 'expo-router/head';
import { getServiceCardTheme } from '../../src/lib/service-accents';
import { publicSupabase } from '../../src/lib/supabase';
import { resolveManualSalonCode } from '../../src/lib/salon-short-code';
import { plaqueUrl, useSalonPlaque } from '../../src/lib/salon-logo-plaque';
import { buildSalonPlayStoreUrl } from '../../src/lib/salon-install-link';
import { HapticTouchable } from '../../components/ui/haptic-touchable';

type PublicSalon = { id: string; salonName: string; salonAddress?: string; city?: string; businessPhone?: string; salonCode: string };
function RoleBadge({ role, color }: { role: string; color: string }) {
  const normalized = role.toLocaleLowerCase('it');
  let icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'diamond-stone';
  if (/nail|onicot|manicure|pedicure/.test(normalized)) icon = 'bottle-tonic-plus-outline';
  else if (/colorist/.test(normalized)) icon = 'palette-outline';
  else if (/make.?up|trucc/.test(normalized)) icon = 'lipstick';
  else if (/estet|beauty|viso|skin/.test(normalized)) icon = 'face-woman-shimmer-outline';
  else if (/massagg|wellness|benessere|spa/.test(normalized)) icon = 'spa-outline';
  else if (/tattoo|tatu|pmu/.test(normalized)) icon = 'draw-pen';
  else if (/brow|lash|ciglia|sopracciglia/.test(normalized)) icon = 'eye-outline';
  else if (/epil|cerett/.test(normalized)) icon = 'feather';
  else if (/piercing/.test(normalized)) icon = 'ear-hearing';
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.roleBadge}>
    {/barber|barbiere/.test(normalized) ? <Text style={{ fontSize: 26 }}>💈</Text> : /hair|parrucch|acconci|capell/.test(normalized) ? <>
      <MaterialCommunityIcons name="content-cut" size={25} color={color} />
    </> : <MaterialCommunityIcons name={icon} size={25} color={color} />}
  </View>;
}

export default function SalonBookingPage() {
  const scrollRef = useRef<ScrollView>(null);
  const appSectionPosition = useRef({ card: 0, section: 0 });
  const openAppSection = () => scrollRef.current?.scrollTo({ y: Math.max(0, appSectionPosition.current.card + appSectionPosition.current.section - 16), animated: true });
  const params = useLocalSearchParams<{ code: string }>();
  const code = String(params.code || '').trim();
  const [salon, setSalon] = useState<PublicSalon | null>(null);
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const [roleColors, setRoleColors] = useState<Record<string, string>>({});
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [services, setServices] = useState<{ name: string; role: string }[]>([]);
  const serviceGroups = useMemo(() => {
    const groups = new Map<string, { role: string; names: string[] }>();
    services.forEach(({ name, role }) => {
      const key = role.toLocaleLowerCase('it');
      if (!groups.has(key)) groups.set(key, { role, names: [] });
      groups.get(key)!.names.push(name);
    });
    return Array.from(groups.values());
  }, [services]);
  const [codeCopyFeedback, setCodeCopyFeedback] = useState('');
  const manualSalonCode = /^[1-9][0-9]{5}$/.test(code) ? code : null;
  const copySalonCode = async () => {
    if (!manualSalonCode) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(manualSalonCode);
        setCodeCopyFeedback('Codice copiato');
      } else {
        setCodeCopyFeedback('Tieni premuto sul codice per copiarlo.');
      }
    } catch { setCodeCopyFeedback('Seleziona il codice e copialo manualmente.'); }
  };
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const plaque = useSalonPlaque(salon?.id);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setStatus('loading'); setSalon(null); setExpandedRoles({}); setCodeCopyFeedback('');
    void (async () => {
      try {
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(code)) { if (active) setStatus('missing'); return; }
        const resolved = await resolveManualSalonCode(code);
        const { data, error } = await publicSupabase.rpc('get_client_portal_catalog', { p_salon_code: resolved }).abortSignal(controller.signal);
        if (!active) return;
        if (error) throw error;
        if (!data?.workspace?.id) { setStatus('missing'); return; }
        setSalon(data.workspace);
        setRoleColors(data.roleCardColorOverrides ?? {});
        setServices((Array.isArray(data.servizi) ? data.servizi : []).filter((service: any) => (service.disponibileOnline ?? service.is_online) !== false && (service.soloComposizione ?? service.compositionOnly ?? service.composition_only) !== true).map((service: any) => ({ name: String(service.nome || service.name || '').trim(), role: String(service.mestiereRichiesto || service.required_role || '').trim() || 'Altri servizi' })).filter((service: { name: string }) => !!service.name));
        setStatus('ready');
      } catch { if (active) setStatus('error'); }
      finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [code, attempt]);
  const address = salon ? [salon.salonAddress, salon.city && !salon.salonAddress?.toLocaleLowerCase('it').includes(salon.city.toLocaleLowerCase('it')) ? salon.city : null].filter(Boolean).join(' · ') : '';
  const useAppleMaps = Platform.OS === 'ios' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)));
  const phone = salon?.businessPhone?.trim() || '';
  const dialPhone = phone.replace(/[^+0-9]/g, '');
  const mapsHref = `${useAppleMaps ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(address)}`;
  const bookingHref = { pathname: '/', params: { side: 'client', salon: salon?.salonCode || code, entry: 'client' } } as Href;
  return <ScrollView ref={scrollRef} contentContainerStyle={[styles.page, compact && { padding: 12 }]}>
    <Head><title>{salon ? `${salon.salonName} — Prenota un appuntamento` : 'Prenota il tuo salone — SalonPro'}</title><meta name="description" content="Prenota il tuo appuntamento online oppure scarica SalonPro per gestire le tue prenotazioni." /></Head>
    <View onLayout={event => { appSectionPosition.current.card = event.nativeEvent.layout.y; }} style={[styles.card, compact && { padding: 20, borderRadius: 24 }]}>
      <Text style={styles.eyebrow}>PRENOTAZIONI ONLINE · SALONPRO</Text>
      {status === 'loading' ? <><ActivityIndicator color="#182033" /><Text style={styles.body}>Caricamento del salone…</Text></> : status !== 'ready' ? <>
        <Text style={styles.title}>{status === 'missing' ? 'Salone non disponibile' : 'Connessione non disponibile'}</Text>
        <Text style={styles.body}>{status === 'missing' ? 'Verifica il link con il salone. Le prenotazioni online potrebbero non essere attive.' : 'Non siamo riusciti a caricare il salone. Riprova tra poco.'}</Text>
        {status === 'error' && <HapticTouchable onPress={() => setAttempt(v => v + 1)} style={styles.button}><Text style={styles.buttonText}>Riprova</Text></HapticTouchable>}
      </> : <>
        {plaque?.path ? <Image source={{ uri: plaqueUrl(plaque.path) }} resizeMode="contain" style={styles.logo} accessibilityLabel={`Logo ${salon!.salonName}`} /> : null}
        <Text accessibilityRole="header" style={styles.title}>{salon!.salonName}</Text>
        {!!address && <Link href={mapsHref as Href} target="_blank" rel="noopener noreferrer" accessibilityLabel={`Apri ${address} in ${useAppleMaps ? 'Mappe' : 'Google Maps'}`} style={styles.addressLink}>{address} ↗</Link>}
        {!!phone && /[0-9]{5,}/.test(dialPhone) && <Link href={`tel:${dialPhone}` as Href} accessibilityLabel={`Chiama il salone al ${phone}`} style={styles.contactLink}>
          <MaterialCommunityIcons name="phone-outline" size={17} color="#475569" />{`  ${phone}`}
        </Link>}
        <Text style={styles.body}>Il tuo prossimo appuntamento, come preferisci. Prenota dal browser oppure usa l’app SalonPro.</Text>
        <Link href={bookingHref} style={styles.primaryLink}>Prenota dal web</Link>
        <HapticTouchable accessibilityRole="button" accessibilityLabel="Apri o scarica l’app, vai alla sezione app" onPress={openAppSection} style={styles.appShortcut}>
          <MaterialCommunityIcons name="cellphone" size={21} color="#334155" />
          <Text style={styles.buttonText}>Apri o scarica l’app</Text>
          <MaterialCommunityIcons name="arrow-down" size={18} color="#64748b" />
        </HapticTouchable>
        <Text style={styles.hint}>Dal web non serve installare nulla. Nell’app ritrovi il tuo salone e gestisci le prenotazioni.</Text>
        {serviceGroups.length > 0 && <View style={styles.catalog}>
          <View style={styles.catalogHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>I nostri servizi</Text>
            <Text style={styles.catalogHint}>Trova il trattamento che fa per te</Text>
          </View>
          <View style={styles.columns}>
            {serviceGroups.map(({ role, names }) => {
              const theme = getServiceCardTheme({ roleName: role, roleColorOverrides: roleColors });
              return <View key={role.toLocaleLowerCase('it')} style={[styles.roleCard, { flexBasis: compact ? '100%' : serviceGroups.length === 1 ? '100%' : '46%', borderColor: '#e5e9f0' }]}>
              <View style={[styles.roleHeader, { backgroundColor: '#fff', borderBottomColor: '#edf0f5' }]}>
                <View style={[styles.roleAccent, { backgroundColor: theme.baseColor }]} />
                <RoleBadge role={role} color="#475569" />
                <Text accessibilityRole="header" style={[styles.roleTitle, { color: '#182033' }]}>{role}</Text>
                <Text style={styles.count}>{names.length}</Text>
              </View>
              {(expandedRoles[role] ? names : names.slice(0, 4)).map((name, index) => <View key={`${name}-${index}`} style={styles.serviceRow}>
                <View style={styles.serviceBullet}><View style={styles.serviceBulletDot} /></View>
                <Text style={styles.serviceName}>{name}</Text>
              </View>)}
              {names.length > 4 && <HapticTouchable
                accessibilityRole="button"
                accessibilityLabel={`${expandedRoles[role] ? 'Mostra meno servizi' : 'Mostra tutti i servizi'} ${role}`}
                accessibilityState={{ expanded: !!expandedRoles[role] }}
                onPress={() => setExpandedRoles(current => ({ ...current, [role]: !current[role] }))}
                style={[styles.expandButton, { backgroundColor: '#f8fafc' }]}>
                <Text style={[styles.expandText, { color: '#182033' }]}>{expandedRoles[role] ? 'Mostra meno ↑' : `Mostra tutti (${names.length}) ↓`}</Text>
              </HapticTouchable>}
            </View>; })}
          </View>
        </View>}
        <View style={styles.divider} />
        <View onLayout={event => { appSectionPosition.current.section = event.nativeEvent.layout.y; }} style={styles.appSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Porta il salone con te</Text>
        <Text style={styles.body}>Con SalonPro gestisci appuntamenti e richieste anche dall’app.</Text>
        <HapticTouchable style={styles.button} onPress={() => Linking.openURL(`salonmanager://join/${encodeURIComponent(salon!.salonCode)}?entry=client`).catch(() => setStatus('ready'))}><Text style={styles.buttonText}>Apri il mio salone nell’app</Text></HapticTouchable>
        <View style={styles.downloadSection}>
          <Text style={styles.downloadTitle}>Non hai ancora scaricato l’app?</Text>
          <Text style={styles.hint}>Prima di scaricare: dopo l’installazione torna su questa pagina per collegare il tuo salone.</Text>
          <View style={styles.stores}>
            <Link href="https://apps.apple.com/app/id6760840153" target="_blank" rel="noopener noreferrer" style={styles.store} accessibilityLabel="Scarica SalonPro per iPhone dall’App Store">
              <MaterialCommunityIcons name="apple" size={25} color="#182033" />{'  Scarica per iPhone'}
            </Link>
            <Link href={buildSalonPlayStoreUrl(salon!.salonCode) as Href} style={styles.store} accessibilityLabel="Scarica SalonPro per Android da Google Play">
              <MaterialCommunityIcons name="android" size={25} color="#182033" />{'  Scarica per Android'}
            </Link>
          </View>
        </View>
        <View style={styles.salonCodePanel}>
          <Text style={styles.downloadTitle}>Hai installato l’app? Torna qui</Text>
          <Text style={styles.hint}>1. Scarica SalonPro dallo store.
2. Torna a questa pagina nel browser.
3. Premi “Apri il mio salone nell’app”.</Text>
          <Text style={styles.hint}>Su iPhone, aprire l’app direttamente dall’App Store può non collegare il salone. Puoi sempre usare il codice qui sotto.</Text>
        </View>
        {manualSalonCode && <View style={styles.salonCodePanel}>
          <Text style={styles.downloadTitle}>Il salone non si è associato automaticamente?</Text>
          <Text style={styles.hint}>Puoi associarlo tu: inserisci il codice qui sotto nell’area cliente e premi “Associa salone”.</Text>
          <Text style={styles.eyebrow}>IL CODICE DEL TUO SALONE</Text>
          <Text selectable accessibilityLabel={`Codice salone ${manualSalonCode.split('').join(' ')}`} style={styles.salonCode}>{manualSalonCode}</Text>
          <HapticTouchable accessibilityRole="button" accessibilityLabel="Copia codice salone" style={styles.codeCopyButton} onPress={copySalonCode}>
            <Text style={styles.buttonText}>Copia codice</Text>
          </HapticTouchable>
          {!!codeCopyFeedback && <Text accessibilityLiveRegion="polite" style={styles.hint}>{codeCopyFeedback}</Text>}
        </View>}
        </View>
      </>}
      <Link href="https://salonpro.dev/privacy" style={styles.privacy}>Privacy</Link>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#f3f5f9', padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 880, backgroundColor: '#fff', borderRadius: 28, padding: 36, gap: 22, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, color: '#64748b', textAlign: 'center', fontWeight: '700' },
  title: { fontSize: 32, fontWeight: '800', color: '#182033', textAlign: 'center' },
  contactLink: { color: '#334155', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#e8edf3', overflow: 'hidden', marginTop: -12 },
  addressLink: { color: '#526783', textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 10, lineHeight: 22 },
  address: { color: '#64748b', textAlign: 'center' },
  body: { color: '#475569', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  logo: { width: 200, height: 110 },
  appSection: { width: '100%', alignItems: 'center', gap: 22 },
  appShortcut: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: '#dfe5ed', borderRadius: 16, backgroundColor: '#fff', marginTop: -10 },
  primaryLink: { backgroundColor: '#182033', color: '#fff', padding: 18, borderRadius: 16, textAlign: 'center', fontWeight: '700', fontSize: 18, width: '100%', overflow: 'hidden' },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#e2e8f0', width: '100%', marginVertical: 4 },
  sectionTitle: { fontSize: 21, fontWeight: '700', color: '#182033' },
  button: { backgroundColor: '#eef2f7', padding: 16, borderRadius: 14, width: '100%', alignItems: 'center' },
  buttonText: { color: '#182033', fontWeight: '700', textAlign: 'center' },
  catalog: { width: '100%', gap: 18, marginTop: 12, marginBottom: 4 },
  catalogHeading: { gap: 6 },
  catalogHint: { fontSize: 14, color: '#64748b' },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  roleCard: { flexGrow: 1, minWidth: 0, borderWidth: 1, borderColor: '#e2e7ee', borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#182033', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  roleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, backgroundColor: '#edf1f7', borderBottomWidth: 1, borderBottomColor: '#e2e7ee' },
  roleAccent: { width: 3, height: 26, borderRadius: 3, flexShrink: 0 },
  roleBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f5f7fa', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  roleTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#182033' },
  count: { fontSize: 12, fontWeight: '700', color: '#64748b', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, marginHorizontal: 10, marginVertical: 5, borderWidth: 1, borderColor: '#edf0f5', borderRadius: 12, backgroundColor: '#fafbfd' },
  serviceBullet: { width: 18, height: 18, borderRadius: 6, backgroundColor: '#eef1f6', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serviceBulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#8995a7' },
  expandButton: { minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f7' },
  expandText: { color: '#334155', fontWeight: '700', fontSize: 13 },
  serviceName: { flex: 1, minWidth: 0, color: '#334155', fontSize: 14, lineHeight: 21, fontWeight: '500' },
  salonCodePanel: { width: '100%', alignItems: 'center', gap: 12, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#e5e9f0', backgroundColor: '#fafbfd' },
  salonCode: { fontSize: 32, letterSpacing: 6, fontWeight: '800', color: '#182033', textAlign: 'center' },
  codeCopyButton: { minHeight: 44, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, backgroundColor: '#edf1f7' },
  stores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  downloadSection: { width: '100%', gap: 12, alignItems: 'center', paddingVertical: 8 },
  downloadTitle: { color: '#334155', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  store: { color: '#182033', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#fafbfd', overflow: 'hidden' },
  privacy: { color: '#64748b', fontSize: 12, marginTop: 12 },
});
