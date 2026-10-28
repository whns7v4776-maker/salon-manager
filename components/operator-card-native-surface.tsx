import {useAccessAppearance} from './access-premium';
import {useNativePremium} from './owner-native-premium';
import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { withServiceAccentAlpha } from '../src/lib/service-accents';

/** Decorative paint only: never participates in card layout or touch handling. */
export function OperatorCardNativeSurface({ accent, footer = false }: { accent: string; footer?: boolean }) {
  const {palette:p}=useAccessAppearance();
  const premium=useNativePremium();
  const gradientId = `operatorSurface${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[styles.surface, { borderColor: withServiceAccentAlpha(accent, 0.46) }, footer && styles.footer]}
    >
      <Svg width="100%" height="100%" pointerEvents="none" accessible={false}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2={footer ? '0%' : '100%'} y2={footer ? '100%' : '85%'}>
            <Stop offset="0" stopColor={footer ? accent : premium&&p.night?'#2B3031':'#FFFFFF'} stopOpacity={footer ? 0 : premium?.18:1} />
            <Stop offset="0.38" stopColor={footer ? accent : premium&&p.night?'#222729':'#F8F9FB'} stopOpacity={footer ? 0.12 : premium?.12:1} />
            <Stop offset="1" stopColor={accent} stopOpacity={footer ? 0.42 : 0.27} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: {
    borderRadius: 0,
    borderWidth: 0,
  },
});
