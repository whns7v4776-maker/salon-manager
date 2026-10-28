import React, { createContext, useContext, useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import {useAccessAppearance} from '../access-premium';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

export function useNativeSheetDrag(onClose?: () => void, disabled = false) {
  const { height } = useWindowDimensions();
  const dismissDistance = height + 100;
  const offset = useSharedValue(0);
  const closing = useSharedValue(false);
  const finish = React.useCallback(() => {
    onClose?.();
    // Keep the dismissed surface below the viewport until React unmounts it.
    // Resetting here can flash the sheet back while its close handler commits.
  }, [onClose]);
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(Platform.OS !== 'web' && !!onClose && !disabled)
    .activeOffsetY(5).failOffsetX([-24, 24])
    .onUpdate((event) => { if (!closing.value) offset.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      if (closing.value) return;
      if (event.translationY > 110 || (event.translationY > 24 && event.velocityY > 700)) {
        closing.value = true;
        offset.value = withTiming(dismissDistance, { duration: 220 }, (finished) => { if (finished) runOnJS(finish)(); });
      } else offset.value = withSpring(0, { damping: 24, stiffness: 240 });
    })
    .onFinalize(() => { if (!closing.value) offset.value = withSpring(0, { damping: 24, stiffness: 240 }); }),
  [onClose, disabled, closing, offset, finish, dismissDistance]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  return { gesture, animatedStyle };
}
type Drag = ReturnType<typeof useNativeSheetDrag>;
export const NativeSheetDragContext = createContext<Drag | null>(null);
export function hasNativeSheetHandle(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(child => React.isValidElement<{children?:React.ReactNode}>(child) && (child.type === NativeSheetHandle || hasNativeSheetHandle(child.props.children)));
}
/** Add the grip inside the first painted card, never on the full-screen backdrop. */
export function withNativeSheetHandle(children: React.ReactNode): React.ReactNode {
  if (Platform.OS === 'web' || hasNativeSheetHandle(children)) return children;
  let attached = false;
  const visit = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, child => {
    if (attached || !React.isValidElement<{children?:React.ReactNode;style?:StyleProp<ViewStyle>}>(child)) return child;
    const style = StyleSheet.flatten(child.props.style);
    const radius = style?.borderRadius ?? style?.borderTopLeftRadius;
    if (style?.backgroundColor && style.backgroundColor !== 'transparent' && typeof radius === 'number' && radius >= 12) {
      attached = true;
      return React.cloneElement(child, {}, <><AutomaticNativeSheetHandle/>{child.props.children}</>);
    }
    return child.props.children ? React.cloneElement(child, {}, visit(child.props.children)) : child;
  });
  return visit(children);
}
export function AutomaticNativeSheetHandle() {
  const {palette:p}=useAccessAppearance();
  return <NativeSheetHandle style={{width:34,height:4,borderRadius:2,alignSelf:'center',backgroundColor:p.muted,opacity:.55}}/>;
}
export function NativeSheetHandle({ style }: { style?: StyleProp<ViewStyle> }) {
  const drag = useContext(NativeSheetDragContext);
  if (Platform.OS === 'web' || !drag) return <View style={style} />;
  return <GestureDetector gesture={drag.gesture}>
    <View collapsable={false} accessible={false} hitSlop={{top:8,bottom:8}} style={{ alignSelf: 'stretch', minHeight: 28, justifyContent: 'center' }}>
      <View style={style} />
    </View>
  </GestureDetector>;
}

/** Inline sheets use the same gesture without changing their content or close policy. */
export function NativeDraggableSheet({ onClose, dismissDisabled = false, ...props }: React.ComponentProps<typeof Animated.View> & { onClose: () => void; dismissDisabled?: boolean }) {
  const drag = useNativeSheetDrag(onClose, dismissDisabled);
  const children = props.children as React.ReactNode;
  if (Platform.OS === 'web') return <Animated.View {...props} />;
  return <GestureHandlerRootView style={{ width: '100%', maxHeight: '100%', flexShrink: 1 }}>
    <NativeSheetDragContext.Provider value={drag}>
      <Animated.View {...props} style={[props.style, drag.animatedStyle]}>{!hasNativeSheetHandle(children)?<AutomaticNativeSheetHandle/>:null}{children}</Animated.View>
    </NativeSheetDragContext.Provider>
  </GestureHandlerRootView>;
}
