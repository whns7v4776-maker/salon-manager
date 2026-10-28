import React, { useId } from 'react';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

export function BarberPoleIcon({ size = 20 }: { size?: number }) {
  const clipId = `barber-pole-${useId().replace(/:/g, '')}`;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Defs><ClipPath id={clipId}><Rect x="7" y="5" width="10" height="14" rx="2" /></ClipPath></Defs>
    <Rect x="7" y="5" width="10" height="14" rx="2" fill="#FFFFFF" />
    <Path d="M5 10 19 2M5 19 19 11" stroke="#C94348" strokeWidth="3" clipPath={`url(#${clipId})`} />
    <Path d="M5 14.5 19 6.5M5 23.5 19 15.5" stroke="#376CA0" strokeWidth="3" clipPath={`url(#${clipId})`} />
    <Rect x="7" y="5" width="10" height="14" rx="2" fill="none" stroke="#40516B" strokeWidth="1.2" />
    <Rect x="6" y="2.5" width="12" height="3" rx="1.5" fill="#40516B" />
    <Rect x="6" y="18.5" width="12" height="3" rx="1.5" fill="#40516B" />
  </Svg>;
}
