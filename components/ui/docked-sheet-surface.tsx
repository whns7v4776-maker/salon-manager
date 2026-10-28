import {useNativePremium} from '../owner-native-premium';
import {useAccessAppearance} from '../access-premium';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NativeSheetDragContext, useNativeSheetDrag, hasNativeSheetHandle, AutomaticNativeSheetHandle } from './native-sheet-drag';
import React, { forwardRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useKeyboardSheetCorners } from './use-keyboard-sheet-corners';
import { useWebSheetDrag, WebSheetGrabber } from './web-sheet-grabber';

/** Presentation only: keep the existing form, scroll, keyboard and gesture handlers. */
export const DockedSheetSurface = forwardRef<View, ViewProps & { animateEntrance?: boolean; onClose?: () => void; dismissDisabled?: boolean; bottomSafeAreaSpacing?: number; includeBottomSafeArea?: boolean; webDocked?: boolean }>(function DockedSheetSurface({ style, animateEntrance = false, onClose, dismissDisabled = false, bottomSafeAreaSpacing = 12, includeBottomSafeArea = true, webDocked = true, ...props }, ref) {
  const premium=useNativePremium();
  const {palette:p}=useAccessAppearance();
  const drag = useNativeSheetDrag(onClose, dismissDisabled);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const corners = useKeyboardSheetCorners();
  const webDrag = useWebSheetDrag(onClose, dismissDisabled);
  // Web sheets follow the app: full width, docked to the bottom edge, grabber on top.
  const docked = Platform.OS === 'web' && webDocked;
  const current = StyleSheet.flatten(style) ?? {};
  const padding = current.paddingBottom ?? current.paddingVertical ?? current.padding;
  // A maxHeight alone clips long dialogs: the web surface also needs a scroll fallback.
  // Preserve stricter per-dialog limits and existing inner scroll areas.
  const webLimit = Math.max(120, height - 32);
  const existingLimit = typeof current.maxHeight === 'number' ? `${current.maxHeight}px` : current.maxHeight;
  const webStyle = Platform.OS === 'web' ? {
    maxHeight: existingLimit ? `min(${existingLimit}, ${webLimit}px)` : webLimit,
    minHeight: 0, flexShrink: 1, overflowY: 'auto', overscrollBehaviorY: 'contain',
    ...(docked ? {
      position: 'fixed', left: 0, right: 0, bottom: 0, top: 'auto', zIndex: 20,
      width: '100%', maxWidth: '100%', marginHorizontal: 0, marginBottom: 0, alignSelf: 'stretch',
      maxHeight: existingLimit ? `min(${existingLimit}, calc(100dvh - 24px))` : 'calc(100dvh - 24px)',
      borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0,
      paddingTop: 4,
    } : {}),
  } as unknown as ViewProps['style'] : undefined;
  const surface = <Animated.View {...props} entering={animateEntrance && Platform.OS !== 'web' ? SlideInDown.duration(280) : undefined} ref={ref} style={[style, (premium || Platform.OS !== 'web')&&{backgroundColor:p.night?'#202426':'#F5F2EC',borderColor:p.border}, Platform.OS !== 'web' && drag.animatedStyle, Platform.OS !== 'web' && {
    width, maxWidth: width, alignSelf: 'center', marginHorizontal: 0,
  }, {
    ...(Platform.OS !== 'web' ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
    paddingBottom: Math.max(typeof padding === 'number' ? padding : 16, (includeBottomSafeArea ? insets.bottom : 0) + bottomSafeAreaSpacing),
  }, corners, webStyle, docked && webDrag.sheetStyle]}>{Platform.OS === 'web' ? <>{docked ? <WebSheetGrabber handlers={webDrag.handlers} /> : null}{props.children}</> : <>{onClose && !hasNativeSheetHandle(props.children) ? <AutomaticNativeSheetHandle/> : null}{props.children}</>}</Animated.View>;
  if (Platform.OS === 'web' || !onClose) return surface;
  return <GestureHandlerRootView style={{ width, maxWidth: width, alignSelf: 'center', flexShrink: 1, justifyContent: 'flex-end', ...((current.flex === 1 || (typeof current.height === 'string' && current.height.endsWith('%'))) ? {flex: 1, minHeight: 0} : {}) }}><NativeSheetDragContext.Provider value={drag}>{surface}</NativeSheetDragContext.Provider></GestureHandlerRootView>;
});
