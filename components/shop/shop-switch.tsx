import React from 'react';
import { Switch, type SwitchProps } from 'react-native';
import { useAccessAppearance } from '../access-premium';

/** Bronze switch shared by the shop consoles: same tint as Richieste and Cassa, never the platform green/teal. */
export function ShopSwitch(props: SwitchProps) {
  const { palette: p } = useAccessAppearance();
  const on = p.night ? '#9C8461' : '#7A6446';
  const off = p.night ? '#3A3D3E' : '#D8CFC2';
  return <Switch trackColor={{ true: on, false: off }} thumbColor="#FFFDF8" ios_backgroundColor={off} {...({ activeThumbColor: '#FFFDF8', activeTrackColor: on } as object)} {...props} />;
}
