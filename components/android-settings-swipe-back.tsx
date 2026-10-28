import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

type Props = React.PropsWithChildren<{ onBack: () => void; enabled?: boolean }>;
function AndroidSettingsSwipe({ children, onBack, enabled = true }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const closing = useSharedValue(false);
  React.useEffect(() => { x.value = 0; closing.value = false; }, [enabled, x, closing]);
  const gesture = Gesture.Pan().enabled(enabled).activeOffsetX(-28).failOffsetX(20).failOffsetY([-14,14])
    .onUpdate(event => { if (!closing.value) x.value = Math.max(-width, Math.min(0,event.translationX)); })
    .onEnd(event => {
      if (closing.value) return;
      if (event.translationX < -Math.max(72,width * 0.22) || (event.translationX < -40 && event.velocityX < -700)) {
        closing.value = true;
        x.value = withTiming(-width,{duration:160},finished => { if (finished) runOnJS(onBack)(); });
      } else x.value = withSpring(0,{damping:25,stiffness:280});
    }).onFinalize(() => { if (!closing.value) x.value = withSpring(0,{damping:25,stiffness:280}); });
  const style = useAnimatedStyle(() => ({ transform:[{translateX:x.value}] }));
  return <GestureDetector gesture={gesture}><Animated.View style={[{flex:1},style]}>{children}</Animated.View></GestureDetector>;
}
export function AndroidSettingsSwipeBack(props: Props) {
  return Platform.OS === 'android' ? <AndroidSettingsSwipe {...props} /> : <>{props.children}</>;
}
