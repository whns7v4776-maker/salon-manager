import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Brief pulsing ring over an agenda block, so the slot a notification points to is spotted at once. */
export function AgendaSlotFlash({ active, color, radius = 14 }: { active: boolean; color: string; radius?: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
        withTiming(0.25, { duration: 420, easing: Easing.in(Easing.quad) }),
      ),
      4,
      false,
    );
  }, [active, pulse]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.03 }],
  }));
  if (!active) return null;
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, borderWidth: 3, borderColor: color, backgroundColor: `${color}22`, zIndex: 20 },
        animatedStyle,
      ]}
    />
  );
}
