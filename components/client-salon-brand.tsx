import React, { type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';
import { SalonBrandMark } from './salon-brand-mark';
import { SalonLogoPlaque } from './ui/salon-logo-plaque';

/** One plaque and signature geometry across every customer page. */
export function ClientSalonBrand({ workspaceId, salonName, compact = true, powered = true, overlaySignature = false }: { workspaceId?: string; salonName: string; compact?: boolean; powered?: boolean; overlaySignature?: boolean }) {
  const { palette: p } = useAccessAppearance();
  const size = { width: compact ? 164 : 192, height: compact ? 68 : 90 };
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerSalonBrand: 'true' } } : {})} style={{ maxWidth: size.width, minWidth: 0, alignSelf: 'flex-start', gap: 3 }}>
    <SalonBrandMark compact powered={false} size={size} flush workspaceId={workspaceId} name={salonName} surface="frontend">
      <SalonLogoPlaque compact customer size={size} flush workspaceId={workspaceId} name={salonName}>
        <View style={{ width: size.width, minHeight: size.height, justifyContent: 'center' }}><Text style={{ fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', color: p.ink, fontSize: compact ? 24 : 26, lineHeight: compact ? 30 : 33 }}>{salonName}</Text></View>
      </SalonLogoPlaque>
    </SalonBrandMark>
    {powered ? <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ alignSelf: 'center', color: p.muted, fontSize: compact ? 8.5 : 9, lineHeight: 12, ...(overlaySignature ? { position: 'absolute', left: 0, right: 0, top: size.height + 1, textAlign: 'center' } : {}) }}>Powered by SalonPro</Text> : null}
  </View>;
}

/** The signature uses the existing space below the plaque; the fixed header height stays unchanged. */
export function ClientSalonHeaderRow({ workspaceId, salonName, actions }: { workspaceId?: string; salonName: string; actions: ReactNode }) {
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerSalonHeaderRow: 'true' } } : {})} style={{ minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
    <ClientSalonBrand workspaceId={workspaceId} salonName={salonName} overlaySignature />
    <View style={{ paddingTop: 4, flexShrink: 0 }}>{actions}</View>
  </View>;
}
