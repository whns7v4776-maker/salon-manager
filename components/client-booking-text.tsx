import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

/** The same Manrope faces used in the approved mockups; display headings keep Georgia. */
export function ClientBookingText(props: TextProps) {
  const style = StyleSheet.flatten(props.style);
  if (style?.fontFamily) return <Text {...props} />;
  const weight = style?.fontWeight === 'bold' ? 700 : Number(style?.fontWeight) || 400;
  const fontFamily = weight >= 700 ? 'Manrope_700Bold' : weight >= 600 ? 'Manrope_600SemiBold' : weight >= 500 ? 'Manrope_500Medium' : 'Manrope_400Regular';
  return <Text {...props} style={[props.style, { fontFamily, fontWeight: 'normal' }]} />;
}
