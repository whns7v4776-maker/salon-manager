import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { benefitOperationId, type CustomerPackage } from '../src/lib/service-packages';
import { eligibleOwnerPackages, type OwnerPackageSelection } from '../src/lib/owner-package-selection';
import { HapticTouchable } from './ui/haptic-touchable';
import { useAccessAppearance } from './access-premium';
export function OwnerBookingPackagePicker({ customerId, customerName, workspaceId, serviceIds, dates, value, onChange, disabled, compact = false }: {
  customerId: string; customerName: string; workspaceId: string; serviceIds: string[]; dates: string[];
  value: OwnerPackageSelection | null; onChange: (value: OwnerPackageSelection | null) => void; disabled?: boolean; compact?: boolean;
}) {
  const {palette}=useAccessAppearance();
  const success=palette.night?'#A9D4BE':'#176B53';
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void Promise.resolve(supabase.rpc('owner_customer_benefits', { p_customer: customerId })).then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) { setError('Non riesco a verificare gli abbonamenti. Riprova.'); return; }
      setPackages(data?.packages ?? []);
    }).catch(() => { if (active) { setLoading(false); setError('Non riesco a verificare gli abbonamenti. Riprova.'); } });
    return () => { active = false; };
  }, [customerId, workspaceId, revision]);
  const options = eligibleOwnerPackages(packages, serviceIds, dates);
  const unavailable = eligibleOwnerPackages(packages.map(p => ({...p, available: 1})), serviceIds, dates).filter(p => packages.find(original => original.id === p.id)?.available === 0);
  const emptyCopy = unavailable.length
    ? unavailable.map(p => `${p.name}: nessun utilizzo disponibile (${p.reserved} già riservati, ${p.consumed} utilizzati).`).join(' ')
    : 'Nessun abbonamento utilizzabile per questi servizi e questa data. Il prezzo resta quello del servizio.';
  return <View style={compact ? {paddingVertical:8, borderTopWidth:1, borderColor:palette.line, gap:5} : { padding: 14, borderRadius: 16, backgroundColor: palette.night?'rgba(83,126,104,.12)':'rgba(230,239,232,.7)', borderWidth: 1, borderColor: palette.border, gap: 9 }}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>{compact ? <Ionicons name="layers-outline" size={16} color="#526477"/> : null}<Text style={{ fontWeight: '600', color: compact ? palette.ink : success, fontSize: compact ? 12 : 15, flexShrink:1 }}>{compact ? 'Abbonamento · ' : 'Abbonamento di '}{customerName}</Text></View>
    {loading ? <Text style={{ color: palette.muted }}>Verifico i pacchetti del cliente…</Text> : error ? <>
      <Text accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>
      <HapticTouchable onPress={() => setRevision(v => v + 1)} disabled={disabled}><Text style={{ color: success, fontWeight: '700' }}>Riprova</Text></HapticTouchable>
    </> : !options.length ? <Text style={{ color: palette.muted, fontSize:compact ? 12 : 14, lineHeight:compact ? 16 : 20 }}>{compact && !unavailable.length ? 'Non disponibile per il servizio e la data scelti · prezzo del servizio.' : emptyCopy}</Text> : <>
      {options.map(p => { const selected = value?.packageId === p.id; return <HapticTouchable key={p.id} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { if (!selected) onChange({ packageId: p.id, customerId, operationId: benefitOperationId() }); }} style={{ padding: compact ? 8 : 12, borderRadius: compact ? 10 : 12, borderWidth: selected ? 2 : 1, borderColor: selected ? success : palette.border, backgroundColor: selected ? (palette.night?'rgba(111,166,135,.18)':'#DAF1E6') : palette.field, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={success} />
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: palette.ink }}>{p.name}</Text><Text style={{ color: palette.muted, fontSize: 12 }}>{p.available} disponibili · scade il {p.expires_on.split('-').reverse().join('/')}</Text></View>
      </HapticTouchable>; })}
      <HapticTouchable disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: !value }} onPress={() => onChange(null)} style={{ paddingVertical: compact ? 4 : 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name={!value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={palette.muted} /><Text style={{ color: palette.ink, fontWeight: '600' }}>Pagamento normale · conserva gli utilizzi</Text></HapticTouchable>
      {value ? <Text style={{ color: success, fontSize: 12 }}>Incluso nell’abbonamento: alla conferma viene riservato 1 utilizzo. Nessun nuovo incasso.</Text> : null}
    </>}
  </View>;
}
