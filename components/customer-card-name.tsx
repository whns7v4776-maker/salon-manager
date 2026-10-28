import React from 'react';
import { Platform, Text, type TextProps } from 'react-native';

/** Full names wrap naturally; never truncate a customer's identity. */
export function CustomerCardName(props: TextProps) {
  return <Text {...props} numberOfLines={undefined} android_hyphenationFrequency="none"
    textBreakStrategy="simple" style={[props.style, Platform.OS === 'web' && { wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' } as any]} />;
}
