import React from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { useAccessAppearance } from '../access-premium';
import { premiumSectionAccent } from '../premium-section-accent';

/** Internal section label, including nested dialogs. Keeps content and actions intact. */
export function PremiumSectionHeading({ children, style, tone, ...props }: TextProps & { tone?: number | string }) {
 const { palette: p } = useAccessAppearance();
 const title = typeof children === 'string' ? children : '';
 return <Text {...props} style={[style, premiumSectionAccent(p.night, tone ?? title), { color:p.ink, minWidth:0, flexShrink:1 }]}>{children}</Text>;
}

/** Header row with icons/actions; the controlled children stay untouched. */
export function PremiumSectionHeader({ children, style, tone, ...props }: ViewProps & { tone: number | string }) {
 const { palette: p } = useAccessAppearance();
 return <View {...props} style={[style, premiumSectionAccent(p.night,tone), { minWidth:0 }]}>{children}</View>;
}
