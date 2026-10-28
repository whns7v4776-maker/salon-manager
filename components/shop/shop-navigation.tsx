import {useAccessAppearance} from '../access-premium';
import { shopSectionTone } from './shop-section-tone';
import React, { useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '../ui/haptic-touchable';

type Item<T extends string> = readonly [T, string, React.ComponentProps<typeof Ionicons>['name']];
/** Compact navigation shared by the native and web shop consoles. */
export function ShopNavigation<T extends string>({ items, value, onChange, disabled = false, badges = {} }: {
  items: readonly Item<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  badges?: Partial<Record<T,number>>;
}) {
  const {palette:p}=useAccessAppearance();
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, (positions.current[value] ?? 0) - 16), animated: true });
  }, [value]);
  return (
    <View {...(Platform.OS === 'web' ? { dataSet: { premiumShopNav: 'true' } } : {})} style={[s.frame,{backgroundColor:p.field,borderColor:p.border}]}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" contentContainerStyle={s.track}>
        {items.map(([id, label, icon]) => (
          <HapticTouchable key={id} accessibilityRole="tab" accessibilityLabel={badges[id] ? `${label}, attività da gestire` : label}
            accessibilityState={{ selected: value === id, disabled }} {...(Platform.OS === 'web' ? { 'aria-selected': value === id } : {})} disabled={disabled}
            onLayout={(event) => {
              positions.current[id] = event.nativeEvent.layout.x;
              if (id === value) scroll.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 16), animated: false });
            }}
            onPress={() => {
              onChange(id);
              scroll.current?.scrollTo({ x: Math.max(0, (positions.current[id] ?? 0) - 16), animated: true });
            }} style={[s.tab, value === id && {backgroundColor:shopSectionTone(id,p.night).soft,borderWidth:1,borderColor:shopSectionTone(id,p.night).border}]}>
            <Ionicons name={icon} size={18} color={shopSectionTone(id,p.night).ink} />
            <Text style={[s.label,{color:p.muted}, value === id && {color:shopSectionTone(id,p.night).ink}]}>{label}</Text>
            {!!badges[id] && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:9,height:9,borderRadius:5,backgroundColor:'#D94855',borderWidth:1,borderColor:'#FFFFFF'}}/>}
          </HapticTouchable>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={[s.edge,{backgroundColor:p.field}]}><Ionicons name="chevron-forward" size={13} color="#8196A3" /></View>
    </View>
  );
}
const s = StyleSheet.create({
  frame: { backgroundColor: '#F1F5F8', borderRadius: 18, borderWidth: 1, borderColor: '#E5ECF1', overflow: 'hidden' },
  track: { padding: 5, paddingRight: 20, gap: 5, alignItems: 'center' },
  tab: { minHeight: 46, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  active: { backgroundColor: '#285B78' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#526D7F' },
  activeLabel: { color: '#FFFFFF' },
  edge: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F8' },
});
