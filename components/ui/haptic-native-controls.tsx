import React from 'react';
import { Pressable, TouchableOpacity, type PressableProps, type TouchableOpacityProps } from 'react-native';
import { haptic } from '../../src/lib/haptics';

// Keep native responder/scroll cancellation and refs unchanged. Feedback only
// follows a recognized action, never touch-down or movement.
export const HapticNativePressable = React.forwardRef<React.ElementRef<typeof Pressable>, PressableProps>(
  ({ onPress, disabled, ...props }, ref) => <Pressable {...props} ref={ref} disabled={disabled}
    onPress={onPress ? event => {
      if (disabled) return;
      void haptic.light();
      onPress(event);
    } : undefined} />,
);
export const HapticNativeTouchableOpacity = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, TouchableOpacityProps>(
  ({ onPress, disabled, ...props }, ref) => <TouchableOpacity {...props} ref={ref} disabled={disabled}
    onPress={onPress ? event => {
      if (disabled) return;
      void haptic.light();
      onPress(event);
    } : undefined} />,
);
