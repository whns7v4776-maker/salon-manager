import React, { useState } from 'react';
import { Platform } from 'react-native';
import { HapticTouchable } from './haptic-touchable';

/** Keep press illumination local so touching an arrow does not rebuild the agenda. */
export function AgendaArrowButton(props: React.ComponentProps<typeof HapticTouchable>) {
  const [pressed, setPressed] = useState(false);
  if (Platform.OS === 'web') return <HapticTouchable {...props} />;
  return <HapticTouchable {...props} pressScale={1} pressOpacity={1} activeOpacity={1}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    style={[props.style, pressed && { backgroundColor: '#E1EEFF', borderRadius: 16 }]} />;
}
