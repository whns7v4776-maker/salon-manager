import React, { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAccessAppearance } from './access-premium';
import { ClientSalonHeaderRow } from './client-salon-brand';
import { ClientBookingJourney, ClientBookingJourneyDock, ClientBookingProgress, type ClientBookingJourneyProps } from './client-booking-journey';
import { useClientBookingLayout } from './client-booking-layout';

export function ClientBookingHeader({ workspaceId, salonName, shop, children }: { workspaceId?: string; salonName: string; shop?: ReactNode; children?: ReactNode }) {
  const { palette: p, toggle } = useAccessAppearance();
  const { desktop, insets } = useClientBookingLayout();
  const actions = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 }}>{shop}<Pressable accessibilityRole="button" accessibilityLabel={p.night ? 'Attiva tema chiaro' : 'Attiva tema scuro'} onPress={toggle} style={({ pressed }) => ({ width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, opacity: pressed ? .72 : 1 })}><Ionicons name={p.night ? 'sunny-outline' : 'moon-outline'} size={19} color={p.ink} /></Pressable></View>;
  return <><StatusBar barStyle={p.night ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent /><View {...(Platform.OS === 'web' ? { dataSet: { bookingHeader: 'true' } } : {})} style={{ paddingTop: Math.max(insets.top, 8), paddingHorizontal: desktop ? 32 : Math.max(20, insets.left, insets.right), paddingBottom: 4 }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 200"><Defs><LinearGradient id="customer-header-fade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.night ? '#191D20' : '#FFFFFF'} stopOpacity="0" /><Stop offset="0.12" stopColor={p.night ? '#191D20' : '#FFFFFF'} stopOpacity={p.night ? .72 : .66} /><Stop offset="0.44" stopColor={p.night ? '#191D20' : '#FFFFFF'} stopOpacity={p.night ? .72 : .66} /><Stop offset="0.78" stopColor={p.night ? '#191D20' : '#FFFFFF'} stopOpacity="0" /><Stop offset="1" stopColor={p.night ? '#191D20' : '#FFFFFF'} stopOpacity="0" /></LinearGradient></Defs><Rect width="400" height="200" fill="url(#customer-header-fade)" /></Svg>
    </View>
    <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 4 }}>
      {desktop ? <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: p.muted, fontSize: 14 }}>Prenota nel tuo salone</Text>{actions}</View> : <ClientSalonHeaderRow workspaceId={workspaceId} salonName={salonName} actions={actions} />}
      {children}
    </View>
  </View></>;
}

/** Native content continues behind the fixed dock, and stops before the clear navigation area. */
export function ClientBookingFrame({ journey, workspaceId, salonName, shop, scrollRef, scrollNativeID, onScrollY, noteEditing = false, noteClearance = 0, onNoteLayout }: {
  journey: ClientBookingJourneyProps; workspaceId?: string; salonName: string; shop?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>; scrollNativeID?: string; onScrollY?: (y: number) => void;
  noteEditing?: boolean; noteClearance?: number; onNoteLayout?: () => void;
}) {
  const layout = useClientBookingLayout();
  const native = Platform.OS !== 'web';
  const editingNote = native && noteEditing;
  // Stop inside the opaque dock before its rounded lower corners, so no card leaks underneath.
  const nativeDockCornerClearance = 21;
  const [nativeDockHeight, setNativeDockHeight] = useState(84);
  const nativeDockHeightRef = useRef(84);
  const localScrollRef = useRef<ScrollView>(null);
  const activeScrollRef = scrollRef ?? localScrollRef;
  const scrollPosition = useRef(0);
  const viewportHeight = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const includedKey = journey.automaticDependency ? `${journey.serviceSelectionKey ?? journey.serviceName}|${journey.automaticDependency}` : '';
  const pageKey = journey.pages[journey.page].key;
  const previousIncludedKey = useRef(includedKey);
  const pendingReveal = useRef('');
  const includedLayout = useRef({ key: '', y: 0, height: 0 });
  const revealIncluded = useCallback((key: string) => {
    const target = includedLayout.current;
    if (!key || pendingReveal.current !== key || target.key !== key || !viewportHeight.current) return;
    pendingReveal.current = '';
    const visibleHeight = viewportHeight.current - (native ? Math.max(0, nativeDockHeightRef.current - nativeDockCornerClearance) : 0);
    if (target.y >= scrollPosition.current && target.y + target.height <= scrollPosition.current + visibleHeight) return;
    activeScrollRef.current?.scrollTo({ y: Math.max(0, target.y - 12), animated: !reducedMotion });
  }, [activeScrollRef, native, reducedMotion]);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const changed = previousIncludedKey.current !== includedKey;
    previousIncludedKey.current = includedKey;
    pendingReveal.current = changed && pageKey === 'service' ? includedKey : '';
    const frame = requestAnimationFrame(() => revealIncluded(includedKey));
    return () => cancelAnimationFrame(frame);
  }, [includedKey, pageKey, revealIncluded]);
  return <View {...(Platform.OS === 'web' ? { dataSet: { bookingFrame: 'true' } } : {})} style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', paddingLeft: layout.desktop ? 224 : 0, ...(Platform.OS === 'web' ? { height: layout.height, maxHeight: layout.height } : {}) }}>
    <ClientBookingHeader workspaceId={workspaceId} salonName={salonName} shop={shop}><ClientBookingProgress {...journey} /></ClientBookingHeader>
    <ScrollView key={journey.pages[journey.page].key} ref={activeScrollRef} nativeID={scrollNativeID} {...(Platform.OS === 'web' ? { dataSet: { bookingScroll: 'true' } } : {})}
      style={{ flex: 1, minHeight: 0, ...(native ? { marginBottom: editingNote ? 0 : layout.navigationSpace + nativeDockCornerClearance, overflow: 'hidden' } : {}) }} contentContainerStyle={{ paddingHorizontal: layout.desktop ? 32 : Math.max(20, layout.insets.left, layout.insets.right), paddingTop: 0, paddingBottom: 24 + (editingNote ? noteClearance : native ? nativeDockHeight : 0) }}
      showsVerticalScrollIndicator indicatorStyle="default" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets={false} scrollEventThrottle={16}
      onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; revealIncluded(includedKey); if (editingNote) onNoteLayout?.(); }}
      onContentSizeChange={() => { if (editingNote) onNoteLayout?.(); }}
      onScroll={event => { scrollPosition.current = event.nativeEvent.contentOffset.y; onScrollY?.(scrollPosition.current); }}>
      <ClientBookingJourney {...journey} hideProgress onIncludedServicesLayout={(y, height) => { includedLayout.current = { key: includedKey, y, height }; revealIncluded(includedKey); }} />
    </ScrollView>
    {!editingNote ? <View onLayout={native ? event => { const height = event.nativeEvent.layout.height; nativeDockHeightRef.current = height; setNativeDockHeight(height); revealIncluded(includedKey); } : undefined}
      style={{ paddingHorizontal: layout.desktop ? 32 : Math.max(12, layout.insets.left, layout.insets.right), paddingTop: 8, paddingBottom: native ? 0 : layout.navigationSpace, ...(native ? { position: 'absolute', left: 0, right: 0, bottom: layout.navigationSpace } : {}) }}><ClientBookingJourneyDock {...journey} inline /></View> : null}
  </View>;
}
