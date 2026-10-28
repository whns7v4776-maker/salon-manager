import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

type Props = { children: React.ReactElement; onBack: () => void; busy?: boolean };

function AndroidOwnerSettingsBackGesture({ children, onBack, busy = false }: Props) {
  const { width } = useWindowDimensions();
  const translation = useSharedValue(0);
  const leaving = useSharedValue(false);
  const committed = React.useRef(false);
  const finishBack = React.useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    onBack();
  }, [onBack]);

  const pan = Gesture.Pan()
    .enabled(!busy)
    .activeOffsetX([-40, 40])
    .failOffsetY([-16, 16])
    .onUpdate(event => {
      if (!leaving.value) translation.value = event.translationX;
    })
    .onEnd(event => {
      if (leaving.value) return;
      const distance = Math.abs(event.translationX);
      const forwardVelocity = event.velocityX * Math.sign(event.translationX);
      if (distance >= Math.max(120, width * 0.35) || (distance >= 90 && forwardVelocity > 1100)) {
        leaving.value = true;
        translation.value = withTiming(Math.sign(event.translationX) * width, { duration: 160 }, finished => {
          if (finished) runOnJS(finishBack)();
        });
      } else {
        translation.value = withSpring(0, { damping: 25, stiffness: 280 });
      }
    })
    .onFinalize(() => {
      if (!leaving.value) translation.value = withSpring(0, { damping: 25, stiffness: 280 });
    });

  // The native ScrollView must participate in the same gesture arbitration:
  // vertical scrolling remains available, without swallowing horizontal pans.
  const scroll = Gesture.Native().simultaneousWithExternalGesture(pan);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translation.value }] }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
        <Animated.View collapsable={false} style={[{ flex: 1 }, animatedStyle]}>
          <GestureDetector gesture={scroll}>{children}</GestureDetector>
        </Animated.View>
      </GestureDetector>
      {busy ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel="Uscita dal salone in corso"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}>
          <ActivityIndicator color="#2563EB" />
          <Text style={{ marginTop: 12, fontSize: 20, fontWeight: '800', color: '#0F172A' }}>Uscita in corso</Text>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

export function OwnerSettingsBackGesture(props: Props) {
  return Platform.OS === 'android' ? <AndroidOwnerSettingsBackGesture {...props} /> : props.children;
}
