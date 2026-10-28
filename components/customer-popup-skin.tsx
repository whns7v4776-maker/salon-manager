import React, { useContext, useMemo } from 'react';
import { Appearance } from './access-appearance-context';

/**
 * Richer palette for the customer communication popups. The base light palette uses white
 * borders and translucent white fields, which vanish on the cream sheet; here edges, fields
 * and the selection accent are defined so the popup has depth. Dark mode only gains a warmer
 * field and a clearer edge.
 */
export function customerPopupPalette<P extends { night: boolean }>(p: P): P & Record<string, any> {
  return p.night
    ? { ...p, field: 'rgba(255,255,255,0.06)', border: 'rgba(216,194,155,0.26)', line: '#4A4740' }
    : { ...p, canvas: '#EDE5D8', surface: '#FBF7F0', field: '#FFFDF9', border: 'rgba(122,100,70,0.24)', line: '#E3D8C7', muted: '#6A6257', action: '#5E4A30', actionText: '#FFF8EC' };
}

export function CustomerPopupSkin({ children }: { children: React.ReactNode }) {
  const appearance = useContext(Appearance);
  const value = useMemo(() => ({ ...appearance, palette: customerPopupPalette(appearance.palette) }), [appearance]);
  return <Appearance.Provider value={value}>{children}</Appearance.Provider>;
}
