import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeReadableText as Text } from './owner-native-premium';
import { useAccessAppearance } from './access-premium';
import { CustomerPremiumBadge } from './customer-premium-settings';
import type { CustomerPremiumStatus } from '../src/lib/use-customer-premium';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Avviso quando il cliente ha superato le soglie di annullamenti o assenze scelte nei badge. */
export function CustomerReliabilityAlert({ status }: { status?: CustomerPremiumStatus | null }) {
  const { palette: p } = useAccessAppearance();
  if (!status || (!status.noShowAlert && !status.cancellationAlert)) return null;
  const parts = [
    status.noShowAlert ? plural(status.noShows, 'assenza', 'assenze') : '',
    status.cancellationAlert ? plural(status.cancellations, 'annullamento', 'annullamenti') : '',
  ].filter(Boolean);
  const ink = p.night ? '#F0B8C0' : '#8E3B4A';
  return (
    <View
      accessible
      accessibilityLabel={`Attenzione: ${parts.join(' e ')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: p.night ? 'rgba(188,115,123,.18)' : 'rgba(245,214,219,.72)' }}
    >
      <Ionicons name="alert-circle-outline" size={13} color={ink} />
      <Text style={{ fontSize: 10, fontWeight: '600', color: ink }}>{parts.join(' · ')}</Text>
    </View>
  );
}

/** Badge del cliente più eventuale avviso affidabilità, in riga. */
export function CustomerBadgeAlerts({ status, hideStandard = false }: { status?: CustomerPremiumStatus | null; hideStandard?: boolean }) {
  if (!status?.tier) return null;
  const showBadge = !(hideStandard && status.tier === 'standard');
  const showAlert = status.noShowAlert || status.cancellationAlert;
  if (!showBadge && !showAlert) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {showBadge ? <CustomerPremiumBadge status={status} /> : null}
      <CustomerReliabilityAlert status={status} />
    </View>
  );
}

/** Piccolo segno sullo slot in agenda, solo per i clienti Premium e Top Premium. */
export function AgendaCustomerTierMark({ status }: { status?: CustomerPremiumStatus | null }) {
  const top = status?.tier === 'top_premium';
  if (!top && status?.tier !== 'premium') return null;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={`Cliente ${status?.label ?? ''}`}
      style={{ position: 'absolute', right: 5, bottom: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,250,240,.94)', borderWidth: 1, borderColor: top ? '#C79A4B' : '#B9A3D6', zIndex: 30 }}
    >
      <Ionicons name={top ? 'diamond' : 'ribbon'} size={10} color={top ? '#9A6F25' : '#6E5590'} />
    </View>
  );
}
