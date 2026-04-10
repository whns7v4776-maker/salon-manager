import React from 'react';
import {
  TouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { haptic, type HapticFeedbackType } from '../../src/lib/haptics';

type OptionalHapticFeedbackType = HapticFeedbackType | 'none';
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

type HapticTouchableProps = TouchableOpacityProps & {
  hapticType?: OptionalHapticFeedbackType;
  pressInHapticType?: OptionalHapticFeedbackType;
  longPressHapticType?: OptionalHapticFeedbackType;
  pressScale?: number;
  pressOpacity?: number;
  pressInDuration?: number;
  pressOutDuration?: number;
};

export function HapticTouchable({
  hapticType = 'light',
  pressInHapticType,
  longPressHapticType,
  pressScale = 0.98,
  pressOpacity = 0.98,
  pressInDuration = 110,
  pressOutDuration = 150,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled,
  style,
  ...props
}: HapticTouchableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedTouchableOpacity
      {...props}
      disabled={disabled}
      activeOpacity={1}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        if (!disabled && pressInHapticType && pressInHapticType !== 'none') {
          haptic[pressInHapticType]().catch(() => null);
        }
        scale.value = withTiming(pressScale, {
          duration: pressInDuration,
          easing: Easing.out(Easing.quad),
        });
        opacity.value = withTiming(pressOpacity, {
          duration: pressInDuration,
          easing: Easing.out(Easing.quad),
        });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, {
          duration: pressOutDuration,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(1, {
          duration: pressOutDuration,
          easing: Easing.out(Easing.cubic),
        });
        onPressOut?.(event);
      }}
      onLongPress={(event) => {
        if (!disabled && longPressHapticType && longPressHapticType !== 'none') {
          haptic[longPressHapticType]().catch(() => null);
        }
        onLongPress?.(event);
      }}
      onPress={(event) => {
        if (!disabled && hapticType && hapticType !== 'none') {
          haptic[hapticType]().catch(() => null);
        }
        onPress?.(event);
      }}
    />
  );
}
