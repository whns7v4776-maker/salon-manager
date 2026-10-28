import React from 'react';
import { Text } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { useAccessAppearance } from './access-premium';

/** Low-emphasis form reset; keeps the caller's action and disabled rules. */
export function FormResetLink({ children, style: _style, ...props }: React.ComponentProps<typeof HapticTouchable>) {
  const { palette } = useAccessAppearance();
  return <HapticTouchable {...props} accessibilityRole="button" style={{ alignSelf: 'center', flexGrow: 0, flexShrink: 0, minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', opacity: props.disabled ? .45 : 1 }}>
    <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontWeight: '400', textAlign: 'center', textDecorationLine: 'underline' }}>{children}</Text>
  </HapticTouchable>;
}
