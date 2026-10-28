import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Inline checkmark on the dark selected filter card. */
export function FilterCheckmark() {
  return (
    <Svg width={14} height={18} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M7 11 L10.5 14.5 L17 7.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
