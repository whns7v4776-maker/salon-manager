import React from 'react';
import { Text, type TextProps } from 'react-native';

/** Preserve full names at a readable size, wrapping at word boundaries. */
export function CustomerCardName({ style, ...props }: TextProps) {
  return <Text {...props} numberOfLines={undefined} style={[style,
    { whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' } as any,
  ]} />;
}
