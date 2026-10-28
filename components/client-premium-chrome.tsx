import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, ScrollView, StatusBar, View, useWindowDimensions } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';
import { ClientSalonBrand, ClientSalonHeaderRow } from './client-salon-brand';
import { OWNER_RAIL_WIDTH } from './owner-premium-web';
import { nativeBarStyles } from './owner-premium-native-style';
import { AndroidTabBarSurface } from './ui/android-tab-bar-surface';
import { useClientBookingLayout, CLIENT_NAVIGATION_HEIGHT } from './client-booking-layout';
import { CLIENT_NOTIFICATION_RED, CLIENT_NOTIFICATION_ON_RED } from './client-notification-tone';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
export type ClientNavigationItem = { key: string; label: string; icon: Icon; badge?: number; selected: boolean; onPress: () => void };

export function ClientPremiumHeader({ workspaceId, salonName, title, centerTitle = false }: { workspaceId?: string; salonName: string; title: string; centerTitle?: boolean }) {
  const { palette: p, toggle } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1000;
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerPageHeader: 'true' } } : {})} style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 10, marginBottom: 8 }}>
    <StatusBar barStyle={p.night ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
    {!desktop ? <ClientSalonHeaderRow workspaceId={workspaceId} salonName={salonName} actions={<Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={p.night ? 'Attiva tema chiaro' : 'Attiva tema scuro'} style={{ width: 40, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={p.night ? 'sunny-outline' : 'moon-outline'} size={19} color={p.ink} /></Pressable>} /> : null}
    <Text accessibilityRole="header" style={{ fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: desktop ? 34 : 29, lineHeight: desktop ? 42 : 36, color: p.ink, textAlign: centerTitle ? 'center' : 'left' }}>{title}</Text>
  </View>;
}

const barBase = {
  tabBar: { overflow: 'hidden' as const },
  animatedIndicator: { borderRadius: 19 },
  animatedIndicatorGlow: {}, animatedIndicatorGlass: {}, animatedIndicatorHighlight: {}, animatedIndicatorLowlight: {}, animatedIndicatorInnerStroke: {},
  tabBarLabelStack: {}, tabBarLabel: {}, tabBarLabelActive: {}, tabBarLabelInactive: {}, tabBarFixedRow: {}, tabBarItem: {}, tabBarItemContent: {}, tabBarIconStack: {}, tabBarIconLayer: {}, tabBarLabelLayer: {},
};

/** Shares the owner's exact surface tokens, capsule geometry, icon scale and label sizing. */
export function ClientPremiumNavigation({ items, workspaceId, salonName }: { items: ClientNavigationItem[]; workspaceId?: string; salonName: string }) {
  const { palette: p, mode, setMode } = useAccessAppearance();
  const { width, insets, desktop, keyboardVisible, navigationBottom } = useClientBookingLayout();
  const bar = useMemo(() => nativeBarStyles(barBase, p, Platform.OS === 'web'), [p]);
  if (desktop) return <View style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: OWNER_RAIL_WIDTH, padding: 16, backgroundColor: p.night ? 'rgba(27,30,31,.36)' : 'rgba(255,253,249,.24)', borderRightWidth: 1, borderRightColor: p.border, backdropFilter: 'blur(16px)' } as any}>
    <View style={{ height: 128, justifyContent: 'center' }}><ClientSalonBrand compact={false} workspaceId={workspaceId} salonName={salonName} /></View>
    <View style={{ height: 1, backgroundColor: p.line, marginBottom: 22 }} />
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      {items.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: item.selected }} aria-selected={item.selected} accessibilityLabel={item.label} onPress={item.onPress}
        style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, marginBottom: 6, borderRadius: 15, borderWidth: 1,
          borderColor: item.selected ? p.night ? 'rgba(216,194,155,.36)' : 'rgba(52,55,53,.28)' : 'transparent', backgroundColor: item.selected ? p.night ? 'rgba(216,194,155,.22)' : 'rgba(52,55,53,.82)' : 'transparent', opacity: pressed ? .75 : 1 })}>
        {item.selected ? <View style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, backgroundColor: '#D7C299' }} /> : null}
        <Ionicons name={item.icon} size={23} color={item.selected ? p.night ? '#E9D9BB' : '#FFF' : p.muted} />
        <Text numberOfLines={1} style={{ flex: 1, color: item.selected ? p.night ? '#E9D9BB' : '#FFF' : p.ink, fontSize: item.selected ? 16 : 15, fontWeight: item.selected ? '600' : '500' }}>{item.label}</Text>
        {Boolean(item.badge) ? <Text style={{ color: CLIENT_NOTIFICATION_ON_RED, backgroundColor: CLIENT_NOTIFICATION_RED, fontSize: 11, fontWeight: '600', minWidth: 24, padding: 4, borderRadius: 12, textAlign: 'center' }}>{item.badge! > 99 ? '99+' : item.badge}</Text> : null}
      </Pressable>)}
    </ScrollView>
    <View style={{ borderTopWidth: 1, borderTopColor: p.line, paddingTop: 16 }}>
      <Text style={{ color: p.muted, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>ASPETTO</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>{([['day', 'Chiaro'], ['night', 'Scuro'], ['system', 'Auto']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Aspetto ${label.toLowerCase()}`} accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: mode === value ? p.line : 'transparent', backgroundColor: mode === value ? p.field : 'transparent' }}><Text style={{ color: p.ink, fontSize: 11 }}>{label}</Text></Pressable>)}</View>
    </View>
  </View>;
  if (keyboardVisible) return null;
  const barWidth = Math.min(width - 16 - insets.left - insets.right, 620);
  const barHeight = CLIENT_NAVIGATION_HEIGHT;
  const itemWidth = (barWidth - 8) / items.length;
  return <View pointerEvents="box-none" style={{ position: Platform.OS === 'web' ? 'fixed' : 'absolute', left: 0, right: 0, bottom: navigationBottom, alignItems: 'center', zIndex: 260 } as any}>
    <View {...(Platform.OS === 'web' ? { dataSet: { premiumBottomBar: 'true', premiumBarTheme: p.night ? 'dark' : 'light', clientBottomBar: 'true' } } : {})} style={[bar.tabBar, { width: barWidth, height: barHeight, borderRadius: barHeight / 2, borderWidth: 1, borderColor: p.border, flexDirection: 'row', paddingHorizontal: 4, alignItems: 'center', backgroundColor: Platform.OS === 'android' ? 'transparent' : p.night ? 'rgba(30,33,35,.94)' : 'rgba(250,247,241,.68)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(1.3)' } : {}) } as any]}>
      {Platform.OS === 'ios' ? <BlurView pointerEvents="none" intensity={35} tint={p.night ? 'dark' : 'light'} style={{ position: 'absolute', inset: 0 }} /> : null}
      {Platform.OS === 'android' ? <AndroidTabBarSurface premium={p} width={barWidth} height={barHeight} /> : null}
      {items.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: item.selected }} aria-selected={item.selected} onPress={item.onPress}
        style={{ width: itemWidth, minHeight: 50, justifyContent: 'center', alignItems: 'center', gap: 2, ...(Platform.OS === 'web' ? { '--salon-tab-hover-width': `${Math.max(44, itemWidth - 6)}px`, '--salon-tab-hover-height': '48px', '--salon-tab-hover-radius': '24px', isolation: 'isolate' } : {}) } as any}>
        {item.selected ? <View {...(Platform.OS === 'web' ? { dataSet: { clientTabIndicator: 'true' } } : {})} pointerEvents="none" style={[bar.animatedIndicator, { position: 'absolute', width: Math.max(44, itemWidth - 6), height: 48, borderRadius: 24 }]} /> : null}
        <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={item.icon} size={20} color={item.selected ? p.night ? '#FFF' : '#181A18' : p.muted} />
          {Boolean(item.badge) ? <View style={{ position: 'absolute', top: -2, right: -3, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: CLIENT_NOTIFICATION_RED }}><Text style={{ color: CLIENT_NOTIFICATION_ON_RED, fontSize: 9 }}>{item.badge! > 99 ? '99+' : item.badge}</Text></View> : null}
        </View>
        <Text maxFontSizeMultiplier={1} style={[item.selected ? bar.tabBarLabelActive : bar.tabBarLabelInactive, { fontSize: width < 350 ? 7.5 : 8, lineHeight: 11, fontWeight: item.selected ? '600' : '400' }]}>{item.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
