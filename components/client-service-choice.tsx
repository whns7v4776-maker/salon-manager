import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';

export type ClientServiceChoiceProps = {
  name: string; duration: string; price: number; selected: boolean; role?: string; roleColor?: string;
  badge?: string | null; processingMinutes?: number; linked?: boolean;
  packageAvailable?: number; promotion?: string; onSelect: () => void; onDetails: () => void;
};

/** Auto-height cards preserve long names, processing, pairings, packages and real prices. */
export function ClientServiceChoice(props: ClientServiceChoiceProps) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const price = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(props.price);
  return <View {...(Platform.OS === 'web' ? { dataSet: { premiumServiceChoice: 'true' } } : {})}
    style={{ width: '100%', minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: props.selected ? p.action : p.border, backgroundColor: p.surface }}>
    <Pressable {...(Platform.OS === 'web' ? { dataSet: { premiumServiceAction: 'true' } } : {})}
      accessibilityRole="radio" accessibilityState={{ checked: props.selected }} aria-checked={props.selected}
      accessibilityLabel={`${props.name}, ${props.duration}${props.role ? `, ${props.role}` : ''}, ${props.packageAvailable ? 'nel pacchetto' : price}${props.processingMinutes ? `, ${props.processingMinutes} minuti di posa` : ''}${props.linked ? ', con servizio collegato' : ''}`}
      onPress={props.onSelect} style={({ pressed }) => ({ minHeight: large ? 100 : 76, minWidth: 0, borderRadius: 18, paddingVertical: large ? 20 : 14, paddingLeft: large ? 24 : 18, paddingRight: large ? 61 : 48, gap: large ? 9 : 7, opacity: pressed ? .72 : 1 })}>
      {props.role && props.roleColor ? <View pointerEvents="none" {...(Platform.OS === 'web' ? { dataSet: { serviceRoleMarker: props.role } } : {})} style={{ position: 'absolute', left: 7, top: 15, bottom: 15, width: 3, borderRadius: 2, backgroundColor: props.roleColor }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text style={{ flex: 1, minWidth: 0, color: p.ink, fontSize: large ? 18 : 14, lineHeight: large ? 27 : 21, fontWeight: '600' }}>{props.name}</Text>
        <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
          <Text style={{ color: p.ink, fontSize: props.packageAvailable ? large ? 14 : 11 : large ? 18 : 14, lineHeight: large ? 27 : 21, fontWeight: '600' }}>{props.packageAvailable ? 'Nel pacchetto' : price}</Text>
          {props.packageAvailable ? <Text style={{ color: p.muted, fontSize: large ? 12 : 10, lineHeight: large ? 18 : 15 }}>{props.packageAvailable} {props.packageAvailable === 1 ? 'disponibile' : 'disponibili'}</Text> : null}
        </View>
      </View>
      <Text style={{ color: p.muted, fontSize: large ? 14 : 11.5, lineHeight: large ? 22 : 18 }}>{props.duration}{props.role ? ` · ${props.role}` : ''}{props.processingMinutes ? ` · ${props.processingMinutes} min di posa` : ''}</Text>
      {props.linked ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {props.linked ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="link-outline" size={large ? 16 : 12} color={p.muted} /><Text style={{ color: p.muted, fontSize: large ? 13 : 11, lineHeight: large ? 21 : 17 }}>Con abbinamento</Text></View> : null}
      </View> : null}
      {props.badge ? <Text style={{ color: p.muted, fontSize: large ? 13 : 11, lineHeight: large ? 21 : 17 }}>{props.badge}</Text> : null}
      {props.promotion ? <Text style={{ color: p.ink, fontSize: large ? 13 : 11, lineHeight: large ? 21 : 17 }}>{props.promotion}</Text> : null}
      <View pointerEvents="none" style={{ position: 'absolute', right: large ? 20 : 13, top: large ? 20 : 14, width: large ? 24 : 19, height: large ? 24 : 19, borderRadius: 13, borderWidth: 1, borderColor: props.selected ? p.action : p.muted, backgroundColor: props.selected ? p.action : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {props.selected ? <Ionicons name="checkmark" size={large ? 17 : 13} color={p.actionText} /> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Informazioni su ${props.name}`} onPress={props.onDetails}
      style={({ pressed }) => ({ position: 'absolute', right: 0, bottom: 0, width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .6 : 1 })}>
      <Ionicons name="information-circle-outline" size={large ? 21 : 16} color={p.muted} />
    </Pressable>
  </View>;
}

export function ClientTimeChoice({ label, selected, disabled, hint, width, onPress }: {
  label: string; selected: boolean; disabled: boolean; hint?: string; width: `${number}%`; onPress: () => void;
}) {
  const { palette: p } = useAccessAppearance();
  const { width: viewportWidth } = useWindowDimensions();
  const large = Platform.OS === 'web' && viewportWidth >= 1000;
  return <View style={{ width, minWidth: 0 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}${hint ? `, ${hint}` : ''}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: large ? 60 : 48, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 13, borderWidth: 1, borderColor: selected ? p.action : p.border, backgroundColor: selected ? p.action : p.surface, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? .42 : pressed ? .72 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Text style={{ color: selected ? p.actionText : p.ink, fontSize: large ? 18 : 14, lineHeight: large ? 27 : 22, fontWeight: selected ? '600' : '500' }}>{label}</Text>{selected ? <Ionicons name="checkmark" size={large ? 17 : 13} color={p.actionText} /> : null}</View>
      {hint ? <Text style={{ color: selected ? p.actionText : p.muted, fontSize: large ? 12 : 10, lineHeight: large ? 18 : 15, textAlign: 'center' }}>{hint}</Text> : null}
    </Pressable>
  </View>;
}
