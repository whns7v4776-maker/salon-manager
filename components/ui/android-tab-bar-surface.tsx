import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Translucent glass and reflections share one rounded shape on Android. */
export function AndroidTabBarSurface({
  width,
  height,
  selected = false,
  customer = false,
  premium,
}: {
  width: number;
  height: number;
  selected?: boolean;
  customer?: boolean;
  premium?: {night:boolean};
}) {
  const gradientId = `androidTabSurface${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const radius = selected ? Math.min(customer ? 26 : 22, width / 2, height / 2) : height / 2;
  const tint = premium ? (selected ? '#FFFFFF' : premium.night ? '#25282A' : '#FAF7F1') : selected ? '#FFFFFF' : customer ? '#0C0F16' : '#12161E';
  return (
    <Svg
      pointerEvents="none"
      accessible={false}
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={tint} stopOpacity={selected ? 0.20 : premium ? 0.30 : customer ? 0.80 : 0.74} />
          <Stop offset="0.45" stopColor={tint} stopOpacity={selected ? 0.10 : premium ? 0.25 : customer ? 0.84 : 0.78} />
          <Stop offset="1" stopColor={tint} stopOpacity={selected ? 0.06 : premium ? 0.20 : customer ? 0.87 : 0.82} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0.5}
        y={0.5}
        width={Math.max(0, width - 1)}
        height={Math.max(0, height - 1)}
        rx={radius}
        fill={`url(#${gradientId})`}
        stroke={selected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'}
        strokeWidth={1}
      />
    </Svg>
  );
}
