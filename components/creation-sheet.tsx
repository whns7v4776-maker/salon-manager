import { useNativePremium } from './owner-native-premium';
import { AccessGlassReflection, useAccessAppearance } from './access-premium';
import { OwnerPremiumSheetFrame } from './owner-premium-sheet';
import { NativeSheetHandle } from './ui/native-sheet-drag';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeMedal } from './owner-premium-native-home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CustomerSheetFrame, useCustomerSheetDockStyle } from './customer-sheet-frame';
import { HapticTouchable } from './ui/haptic-touchable';
import Animated, { SlideInDown } from 'react-native-reanimated';

const CreationSheetLayout = createContext<{ setOwnsScroll: (value: boolean) => void; setFooter: (value: React.ReactNode) => void } | null>(null);

/** A multi-step editor can own its viewport and keep its actions docked. */
export function useCreationSheetLayout(footer: React.ReactNode): boolean {
  const sheet = useContext(CreationSheetLayout);
  useLayoutEffect(() => { sheet?.setFooter(footer); }, [sheet, footer]);
  useLayoutEffect(() => {
    if (!sheet) return;
    sheet.setOwnsScroll(true);
    return () => { sheet.setOwnsScroll(false); sheet.setFooter(null); };
  }, [sheet]);
  return !!sheet;
}

/** Native creation forms share the customer sheets' keyboard and safe-area frame. */
export function CreationSheet({ title, icon, onClose, children, scrollRef, onRevealFocusedField, animatePresentation = false, keepFocusedFieldVisible = true, fillAvailableHeight = true, dismissDisabled = false, iconTone, footer, stableKeyboardScroll = false, premiumWeb = false, iconAccent, premiumKind = 'shop' }: React.PropsWithChildren<{
  footer?: React.ReactNode;
  premiumWeb?: boolean;
  premiumKind?: 'shop' | 'customer';
  /** Hex accent: renders the header icon as an enamel medallion. */
  iconAccent?: string;
  stableKeyboardScroll?: boolean;
  dismissDisabled?: boolean;
  iconTone?: {ink:string;soft:string};
  fillAvailableHeight?: boolean;
  animatePresentation?: boolean;
  keepFocusedFieldVisible?: boolean;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onClose: () => void;
  scrollRef?: React.MutableRefObject<ScrollView | null>;
  onRevealFocusedField?: () => void;
}>) {
  const {palette:premiumPalette}=useAccessAppearance();
  const nativeScope=useNativePremium();
  const [ownsScroll, setOwnsScroll] = useState(false);
  const [managedFooter, setManagedFooter] = useState<React.ReactNode>(null);
  const sheetLayout = useMemo(() => ({ setOwnsScroll, setFooter: setManagedFooter }), []);
  const effectiveFooter = managedFooter ?? footer;
  const premiumNative=(premiumWeb||nativeScope) && Platform.OS !== 'web';
  const [keyboardOpen, setKeyboardOpen] = useState(() => Platform.OS !== 'web' && Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const localRef = useRef<ScrollView | null>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>();
  const offset = useRef(0);
  const ownedFocus = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const frame = useRef<number | null>(null);
  const dockStyle = useCustomerSheetDockStyle(0);
  const insets = useSafeAreaInsets();
  // Let the viewport reach the lower edge. Only the final content or the
  // action footer needs clearance from the home gesture, not the whole sheet.
  const bottomInset = Platform.OS !== 'web' && !keyboardOpen ? insets.bottom : 0;
  const revealFocusedField = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (ownsScroll) return;
    if (onRevealFocusedField) { onRevealFocusedField(); return; }
    const input = TextInput.State.currentlyFocusedInput();
    if (!input) return;
    if (!keepFocusedFieldVisible) {
      localRef.current?.scrollResponderScrollNativeHandleToKeyboard(input, 24, true);
      return;
    }
    // Measure the sheet's actual viewport after keyboard avoidance, not the
    // full screen: a modal can use a different origin from the keyboard.
    if (input !== ownedFocus.current) return;
    const scroll = localRef.current;
    scroll?.getNativeScrollRef()?.measureInWindow((_x, top, width, height) => {
      if (!width || !height) return;
      input.measureInWindow((_ix, inputTop, inputWidth, inputHeight) => {
        if (!inputWidth || !inputHeight || TextInput.State.currentlyFocusedInput() !== input) return;
        const gap = 16;
        const visibleHeight = Math.max(0, height - gap * 2);
        const bottom = inputTop + Math.min(inputHeight, visibleHeight);
        const delta = inputTop < top + gap
          ? inputTop - top - gap
          : Math.max(0, bottom - (top + height - gap));
        if (Math.abs(delta) > 1) {
          scroll.scrollTo({ y: Math.max(0, offset.current + delta), animated: false });
        }
      });
    });
  }, [keepFocusedFieldVisible, onRevealFocusedField, ownsScroll]);
  const scheduleReveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      revealFocusedField();
    });
  }, [revealFocusedField]);
  useEffect(() => {
    const events = keepFocusedFieldVisible && !stableKeyboardScroll ? ['keyboardDidShow', 'keyboardDidChangeFrame'] : ['keyboardDidShow'];
    const subscriptions = events.map((event) =>
      Keyboard.addListener(event as 'keyboardDidShow', scheduleReveal));
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [keepFocusedFieldVisible, scheduleReveal, stableKeyboardScroll]);
  if (Platform.OS === 'web' && premiumWeb) return <OwnerPremiumSheetFrame title={title} icon={icon} onClose={onClose} dismissDisabled={dismissDisabled} scrollRef={scrollRef} footer={footer} kind={premiumKind}>{children}</OwnerPremiumSheetFrame>;
  return <CreationSheetLayout.Provider value={sheetLayout}><CustomerSheetFrame animateBackdrop={animatePresentation} onClose={onClose} dismissDisabled={dismissDisabled}>
    <Animated.View entering={animatePresentation && !stableKeyboardScroll ? SlideInDown.duration(280) : undefined} style={[styles.sheet, premiumNative && {backgroundColor:premiumPalette.night?'#202325':'#F5F1EB',borderColor:premiumPalette.border,borderWidth:1}, dockStyle, Platform.OS !== 'web' && { paddingBottom: 0 }, fillAvailableHeight && Platform.OS !== 'web' && styles.expandedSheet, keyboardOpen && { paddingBottom: 0 }]}>
      {premiumNative?<AccessGlassReflection subtle/>:null}
      <NativeSheetHandle style={[styles.handle,premiumNative && {backgroundColor:premiumPalette.line}]} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.header,premiumNative && {borderBottomColor:premiumPalette.line}]}>
        {iconAccent ? <NativeMedal icon={icon} size={44} iconSize={20} accent={iconAccent} /> : <View style={[styles.icon,premiumNative && {backgroundColor:premiumPalette.field},iconTone && {backgroundColor:iconTone.soft}]}><Ionicons name={icon} size={22} color={premiumNative?premiumPalette.ink:iconTone?.ink ?? "#29465B"} /></View>}
        <Text accessibilityRole="header" style={[styles.title,premiumNative && {color:premiumPalette.ink,fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:23,fontWeight:'400'}]}>{title}</Text>
        <HapticTouchable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi senza svuotare i campi" style={[styles.close,premiumNative && {width:40,height:40,borderRadius:13,backgroundColor:premiumPalette.field,borderWidth:1,borderColor:premiumPalette.border,flexDirection:'row',gap:5}]}>
          
          <Ionicons name="close" size={premiumNative?17:24} color={premiumNative?premiumPalette.ink:"#DC2626"} />
        </HapticTouchable>
      </View>
      </TouchableWithoutFeedback>
      <ScrollView ref={(node) => { localRef.current = node; if (scrollRef) scrollRef.current = node; }}
        style={[styles.scroll, fillAvailableHeight && Platform.OS !== 'web' && { flex: 1 }, stableKeyboardScroll && !fillAvailableHeight && { height: contentHeight, flexGrow: 0 }]} contentContainerStyle={[styles.body, Platform.OS !== 'web' && { paddingBottom: 32 + (effectiveFooter ? 0 : bottomInset) }, ownsScroll && {flex:1,minHeight:0,paddingBottom:0}]}
        scrollEnabled={!ownsScroll}
        scrollIndicatorInsets={Platform.OS !== 'web' ? { bottom: effectiveFooter ? 0 : bottomInset } : undefined}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'web' ? 'on-drag' : 'none'}
        bounces={stableKeyboardScroll ? false : undefined}
        automaticallyAdjustKeyboardInsets={stableKeyboardScroll ? false : undefined}
        onScroll={keepFocusedFieldVisible ? (event) => { offset.current = event.nativeEvent.contentOffset.y; } : undefined}
        scrollEventThrottle={keepFocusedFieldVisible ? 16 : undefined}
        onFocus={() => {
          if (Platform.OS !== 'web') ownedFocus.current = TextInput.State.currentlyFocusedInput();
          scheduleReveal();
        }}
        onContentSizeChange={stableKeyboardScroll && !fillAvailableHeight ? (_width, height) => setContentHeight(previous => previous !== undefined && Math.abs(previous - height) < 1 ? previous : height) : keepFocusedFieldVisible && !stableKeyboardScroll ? scheduleReveal : undefined}
        onLayout={stableKeyboardScroll ? undefined : scheduleReveal}>
        {children}
      </ScrollView>
      {effectiveFooter ? <View style={[styles.footer,Platform.OS !== 'web' && {paddingBottom:(ownsScroll?4:12)+bottomInset},premiumNative&&{backgroundColor:premiumPalette.field,borderTopColor:premiumPalette.line}]}>{effectiveFooter}</View> : null}
    </Animated.View>
  </CustomerSheetFrame></CreationSheetLayout.Provider>;
}
const styles = StyleSheet.create({
  expandedSheet: { flex: 1, minHeight: 0 },
  sheet: { width: '100%', maxWidth: 720, flexShrink: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D6DFE9', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EDF3F8', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#0F172A', fontSize: 20, fontWeight: '700' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1, minHeight: 0 },
  body: { padding: 16, paddingBottom: 32 },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
});
