import { useAccessAppearance } from './access-premium';
import { useCustomerPremiumAppearance } from './owner-premium-customers-style';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NativeSheetDragContext, useNativeSheetDrag, withNativeSheetHandle } from './ui/native-sheet-drag';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useKeyboardSheetCorners } from './ui/use-keyboard-sheet-corners';

// iOS sheet geometry follows the keyboard animation on the UI thread.
// Avoid a delayed second layout pass after KeyboardAvoidingView updates.
function IOSSheetKeyboardFrame({ children, style }: React.PropsWithChildren<{style: StyleProp<ViewStyle>}>) {
  const bottom = useSharedValue(Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0);
  const keyboardStyle = useAnimatedStyle(() => ({ paddingBottom: bottom.value }));
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', event => {
      const overlap = Math.max(0, Dimensions.get('window').height - event.endCoordinates.screenY);
      bottom.value = withTiming(overlap, {duration: event.duration || 250, easing: Easing.out(Easing.cubic)});
    });
    const hide = Keyboard.addListener('keyboardWillHide', event => {
      bottom.value = withTiming(0, {duration: event.duration || 250, easing: Easing.out(Easing.cubic)});
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { bottom.value = 0; });
    return () => { show.remove(); hide.remove(); hidden.remove(); };
  }, [bottom]);
  return <Animated.View style={[style, keyboardStyle]}>{children}</Animated.View>;
}
const SheetKeyboardFrame = Platform.OS === 'ios' ? IOSSheetKeyboardFrame : KeyboardAvoidingView;

/** Customer dialogs only: the available sheet area follows the keyboard/visual viewport. */
export function CustomerSheetFrame({ children, style, animateBackdrop = false, onClose, dismissDisabled = false }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; animateBackdrop?: boolean; onClose?: () => void; dismissDisabled?: boolean }>) {
  const premium=useCustomerPremiumAppearance();
  const {palette:nativePalette}=useAccessAppearance();
  const drag = useNativeSheetDrag(onClose, dismissDisabled);
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop });
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => { visual.removeEventListener('resize', update); visual.removeEventListener('scroll', update); };
  }, []);
  return (
    <SheetKeyboardFrame {...(Platform.OS === 'android' ? {behavior: 'height' as const} : {})}
      style={[styles.frame, Platform.OS==='web' && ({backdropFilter:'blur(12px)'} as any), Platform.OS !== 'web' && {backgroundColor:nativePalette.night?'rgba(0,0,0,.48)':'rgba(40,36,30,.28)'}, premium && {backgroundColor:premium.night?'rgba(0,0,0,.54)':'rgba(40,35,29,.28)'}, animateBackdrop && { backgroundColor: 'transparent' }, viewport && { position: 'absolute', top: viewport.top, height: viewport.height, left: 0, right: 0 }]}>
      {animateBackdrop ? <Animated.View pointerEvents="none" entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,23,42,0.48)' }]} /> : null}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <NativeSheetDragContext.Provider value={drag}>
      <Animated.View style={[styles.content, style, Platform.OS !== 'web' && drag.animatedStyle, { paddingTop: Math.max(insets.top, 12), paddingBottom: 0, justifyContent: Platform.OS==='web' ? 'center' : 'flex-end' }]}>
        {Platform.OS !== 'web' && onClose ? withNativeSheetHandle(children) : children}
      </Animated.View>
      </NativeSheetDragContext.Provider>
      </GestureHandlerRootView>
    </SheetKeyboardFrame>
  );
}
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: 'rgba(15,23,42,0.48)' },
  content: { flex: 1, minHeight: 0, paddingHorizontal: Platform.OS === 'web' ? 12 : 0, alignItems: 'center' },
});

export function useCustomerSheetDockStyle(bottomPadding = 16, premiumOverride = false): ViewStyle {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const corners = useKeyboardSheetCorners();
  const scopedPremium=useCustomerPremiumAppearance();
  const {palette}=useAccessAppearance();
  const premium=premiumOverride?palette:scopedPremium;
  return useMemo(() => ({ ...(Platform.OS !== 'web' ? { width, maxWidth: width, alignSelf: 'center' as const, marginHorizontal: 0 } : {}), borderBottomLeftRadius: 0, borderBottomRightRadius: 0, ...corners, paddingBottom: Math.max(bottomPadding, insets.bottom), maxHeight: '100%', ...(Platform.OS === 'web' ? { maxHeight: Math.max(120, height - 32), minHeight: 0, flexShrink: 1, overflowY: 'auto', overscrollBehaviorY: 'contain', borderRadius:24,borderBottomLeftRadius:24,borderBottomRightRadius:24 } : {}) } as ViewStyle), [bottomPadding, insets.bottom, width, height, corners,premium]);
}
