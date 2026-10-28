import React from 'react';
import { Platform, type TouchableOpacityProps } from 'react-native';
import { HapticNativeTouchableOpacity as TouchableOpacity } from './haptic-native-controls';
import { HapticTouchable } from './haptic-touchable';

/** Preserve native responders; add Android tap feedback and share iPhone taps. */
export function IosSimpleTouchable(props: TouchableOpacityProps) {
  return Platform.OS === 'ios'
    ? <HapticTouchable {...props} />
    : <TouchableOpacity {...props} />;
}
