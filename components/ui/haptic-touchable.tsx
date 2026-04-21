import React from 'react';
import {
  Platform,
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
  const longPressTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const longPressDelay = typeof props.delayLongPress === 'number' ? props.delayLongPress : 500;

  const clearWebLongPressTimer = React.useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  React.useEffect(() => clearWebLongPressTimer, [clearWebLongPressTimer]);

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
        if (Platform.OS === 'web' && !disabled && onLongPress) {
          longPressTriggeredRef.current = false;
          clearWebLongPressTimer();
          longPressTimeoutRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            if (longPressHapticType && longPressHapticType !== 'none') {
              haptic[longPressHapticType]().catch(() => null);
            }
            onLongPress(event);
          }, longPressDelay);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        clearWebLongPressTimer();
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
        if (Platform.OS === 'web') {
          return;
        }
        if (!disabled && longPressHapticType && longPressHapticType !== 'none') {
          haptic[longPressHapticType]().catch(() => null);
        }
        onLongPress?.(event);
      }}
      onPress={(event) => {
        clearWebLongPressTimer();
        if (Platform.OS === 'web' && longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
        if (!disabled && hapticType && hapticType !== 'none') {
          haptic[hapticType]().catch(() => null);
        }
        onPress?.(event);
      }}
      {...(Platform.OS === 'web' && onLongPress
        ? ({
            onMouseLeave: () => {
              clearWebLongPressTimer();
            },
            onContextMenu: (event: Event) => {
              event.preventDefault?.();
            },
          } as unknown as TouchableOpacityProps)
        : null)}
    />
  );
}
