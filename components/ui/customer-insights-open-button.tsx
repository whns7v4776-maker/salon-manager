import React, { useMemo, useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HapticTouchable } from './haptic-touchable';
import { haptic } from '../../src/lib/haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export function CustomerInsightsOpenButton({ onPress, style, children, accessibilityLabel }: React.PropsWithChildren<{
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Recognize a light tap natively, independently of ScrollView's JS responder.
  // A real drag cancels: never open the panel on touch-down or on a long press.
  const tap = useMemo(() => Gesture.Tap()
    .maxDistance(12)
    .maxDuration(500)
    .shouldCancelWhenOutside(true)
    .cancelsTouchesInView(false)
    .runOnJS(true)
    .onBegin(() => { setPressed(true); scale.value = withTiming(0.97, { duration: 42 }); })
    .onEnd((_event, success) => {
      if (success) { void haptic.light().catch(() => null); onPress(); }
    })
    .onFinalize(() => { setPressed(false); scale.value = withTiming(1, { duration: 85 }); }), [onPress, scale]);

  if (Platform.OS !== 'ios') {
    return <HapticTouchable {...(Platform.OS==='web'?{accessibilityRole:'button' as const,accessibilityLabel:accessibilityLabel??'Apri appuntamenti per cliente'}:{})} style={style} immediatePress recoverStationaryTap onPress={onPress}>
      {children}
    </HapticTouchable>;
  }
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        collapsable={false}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Apri appuntamenti per cliente"
        onAccessibilityTap={onPress}
        style={[style, { minWidth: 76, minHeight: 48, justifyContent: 'center' }, animatedStyle, pressed && { opacity: 0.82 }]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
