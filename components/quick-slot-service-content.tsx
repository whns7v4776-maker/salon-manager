import React,{useMemo} from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isServicePromotionActiveForSlot, type ServicePromotion } from '../src/lib/service-promotions';
import { getServiceAccentByMeta } from '../src/lib/service-accents';
import { useAccessAppearance } from './access-premium';
import { createAgendaPremiumStyles } from './agenda-premium-style';

// Presentation only: selection, availability and the booking price stay owned
// by Agenda. This component never changes a service or a booking draft.
export function QuickSlotServiceContent({
  name, role, roleColor, duration, service, date, time, dependency, mostUsed, phaseLabel, customerPrice,
}: {
  name: string;
  role: string;
  roleColor?: string;
  duration: string;
  service: ServicePromotion;
  date?: string;
  time?: string;
  dependency?: string;
  mostUsed?: boolean;
  phaseLabel?: string;
  customerPrice?: number;
}) {
  const {palette}=useAccessAppearance();
  const s=useMemo(()=>{
    const themed=createAgendaPremiumStyles(baseStyles,palette);
    // Premium reading: serif name, one quiet meta line, a calm price.
    return {...themed,
      title:{...themed.title,height:undefined,minHeight:web?38:30,fontFamily:web?'Georgia, "Times New Roman", serif':'Georgia',fontSize:web?15.5:14,lineHeight:web?19:17,fontWeight:'500' as const,letterSpacing:.1},
      role:{...themed.role,backgroundColor:'transparent',paddingHorizontal:0},
      roleText:{...themed.roleText,color:palette.muted,fontWeight:'500' as const},
      priceRow:{...themed.priceRow,borderTopColor:palette.line,paddingTop:web?9:4},
      price:{...themed.price,fontSize:web?19:17,lineHeight:web?24:22,fontWeight:'600' as const,color:palette.ink,letterSpacing:-.2,fontVariant:['tabular-nums'] as any}};
  },[palette]);
  const original = Number(service.prezzoOriginale);
  const hasDiscount = customerPrice === undefined && Number.isFinite(original) && original > service.prezzo;
  const promotionActive = hasDiscount && isServicePromotionActiveForSlot(service, date, time);
  const discount = hasDiscount ? Math.max(1, Math.round((1 - service.prezzo / original) * 100)) : 0;
  const promotionState = service.scontoAttivo === false ? 'In pausa' : promotionActive ? `−${discount}%` : 'Fuori periodo';
  const phaseDuration = /^(\d+) \+ (\d+) posa(?: \+ (\d+) min)?$/.exec(duration);
  const phaseDetail = phaseLabel === 'Con posa' && phaseDuration ? `+ ${phaseDuration[2]}′ posa` : phaseLabel;
  const details = [mostUsed ? 'Più scelto' : '', phaseDetail, dependency ? `Con ${dependency}` : ''].filter((label): label is string => !!label);
  const compactDuration = phaseDuration ? `${phaseDuration[1]}′${phaseDuration[3] ? ` + ${phaseDuration[3]}′` : ''} lavoro` : duration;
  const color = roleColor || getServiceAccentByMeta({ roleName: role }).border;
  return <View style={s.content} pointerEvents="none">
    <Text style={s.title}>{name}</Text>
    <View style={[s.role,{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap',justifyContent:'center'}]}>
      <View style={{width:5,height:5,borderRadius:3,backgroundColor:color}}/>
      <Text style={s.roleText}>{role || 'Servizio'}</Text>
      <Text style={[s.roleText,{opacity:.6}]}>·</Text>
      <View style={{flexDirection:'row',alignItems:'center',gap:3}}>
        <Ionicons name="time-outline" size={11} color={palette.muted} />
        <Text style={s.roleText} accessibilityLabel={duration}>{compactDuration}</Text>
      </View>
    </View>
    <View style={[s.features, !details.length && { minHeight: 0 }]}>
      {details.map(label => {
        const popular = label === 'Più scelto';
        const phase = label === phaseDetail;
        return <View key={label} style={[s.featureBadge, popular ? s.featureBadgePopular : phase && s.featureBadgePhase]}>
          {!popular && !phase && <Ionicons name="link-outline" size={11} color={palette.ink} />}
          {phase && <Ionicons name={phaseLabel==='Con posa'?'hourglass-outline':'layers-outline'} size={12} color={palette.ink}/>}
          <Text style={[s.featureText, popular ? s.featureTextPopular : phase && s.featureTextPhase]} accessibilityLabel={label}>{label}</Text>
        </View>;
      })}
    </View>
    <View style={s.priceRow}>
      {hasDiscount && <Text style={s.original}>€ {original.toFixed(2)}</Text>}
      <Text style={s.price}>€ {(customerPrice ?? service.prezzo).toFixed(2)}</Text>
      {customerPrice !== undefined && <View style={s.customerPriceBadge}><Text style={s.customerPriceText}>Prezzo cliente</Text></View>}
      {hasDiscount && <View style={[s.discount, !promotionActive && s.discountInactive]}><Text style={[s.discountText, !promotionActive && s.discountTextInactive]}>{promotionState}</Text></View>}
    </View>
  </View>;
}

const web = Platform.OS === 'web';
const baseStyles = StyleSheet.create({
  content: { width: '100%', flex: 1, alignItems: 'center', gap: web ? 3 : 1, paddingTop: 0 },
  title: { width: '100%', height: web ? 34 : 28, fontSize: web ? 14 : 13, lineHeight: web ? 17 : 14, fontWeight: '700', color: '#182033', textAlign: 'center' },
  role: { maxWidth: '100%', borderRadius: 7, paddingHorizontal: 8, paddingVertical: web ? 3 : 2 },
  roleText: { fontSize: 11, lineHeight: web ? 16 : 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  durationRow: { minHeight: web ? 26 : 24, alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  durationBadge: { maxWidth: '100%', minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 7, backgroundColor: 'rgba(248,250,255,0.46)' },
  duration: { flexShrink: 1, fontSize: web ? 11.5 : 11, lineHeight: 16, fontWeight: '600', color: '#294B70', textAlign: 'center',flexWrap:'wrap' },
  features: { width: '100%', minHeight: web ? 40 : 0, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', alignItems: 'center', justifyContent: 'center', gap: web ? 3 : 1 },
  featureBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, borderWidth: 1, borderColor: '#ADBFDA', paddingHorizontal: 6, paddingVertical: web ? 2 : 1, backgroundColor: '#F8FAFF' },
  featureBadgePopular: { backgroundColor: '#294B70', borderColor: '#294B70' },
  featureBadgePhase: { backgroundColor: '#F0E9FC', borderColor: '#C7B3E7' },
  featureText: { flexShrink: 1, fontSize: 10, lineHeight: web ? 13 : 12, fontWeight: '600', color: '#294B70', textAlign: 'center' },
  featureTextPopular: { color: '#FFFFFF' },
  featureTextPhase: { color: '#6941A5' },
  priceRow: { width: '100%', marginTop: 'auto', paddingTop: web ? 8 : 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(51,65,85,0.2)', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: web ? 6 : 2 },
  price: { fontSize: web ? 17 : 16, lineHeight: web ? 23 : 21, fontWeight: '800', color: '#182033' },
  customerPriceBadge: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: '#B8CDE5', backgroundColor: '#EAF2FC' },
  customerPriceText: { fontSize: 10, lineHeight: 13, fontWeight: '600', color: '#294B70', textAlign: 'center' },
  original: { fontSize: 11.5, lineHeight: 16, color: '#64748B', textDecorationLine: 'line-through' },
  discount: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FFE4E6' },
  discountText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#BE123C' },
  discountInactive: { backgroundColor: '#F1F5F9' },
  discountTextInactive: { color: '#64748B' },
});
