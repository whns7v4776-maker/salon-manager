import type { Palette } from '../access-appearance-context';

export function skeletonTheme(p: Palette) {
  return {
    fill: p.night ? 'rgba(215,204,184,0.12)' : 'rgba(112,104,89,0.12)',
    surface: p.night ? 'rgba(30,34,36,0.76)' : 'rgba(255,253,249,0.64)',
    border: p.border,
    sheen: p.night ? '#D8C29B' : '#FFFFFF',
    sheenOpacity: p.night ? 0.13 : 0.48,
  };
}
