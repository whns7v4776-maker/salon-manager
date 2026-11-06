import type { Ionicons } from '@expo/vector-icons';
import type { SymbolViewProps } from 'expo-symbols';

type RoleIcon = { icon: React.ComponentProps<typeof Ionicons>['name']; symbol: SymbolViewProps['name'] };

// One recognisable sign per trade: SF Symbol on iOS, Ionicons on Android and web.
const ROLE_ICONS: { match: RegExp; value: RoleIcon }[] = [
  { match: /barb/i, value: { icon: 'man-outline', symbol: 'mustache' } },
  { match: /colou?r|tint|meches|balayage/i, value: { icon: 'color-palette-outline', symbol: 'paintbrush.pointed' } },
  { match: /unghi|nail|manicur|pedicur/i, value: { icon: 'hand-left-outline', symbol: 'hand.raised' } },
  { match: /make ?up|trucc/i, value: { icon: 'brush-outline', symbol: 'paintpalette' } },
  { match: /massag|spa|benessere/i, value: { icon: 'leaf-outline', symbol: 'leaf' } },
  { match: /estet|beauty|cigli|sopraccigli|lash|brow/i, value: { icon: 'sparkles-outline', symbol: 'sparkles' } },
  { match: /tatu|tattoo|piercing/i, value: { icon: 'pencil-outline', symbol: 'pencil.tip' } },
  { match: /styl|parrucch|hair|accondiz|piega/i, value: { icon: 'cut-outline', symbol: 'scissors' } },
];

const FALLBACK: RoleIcon = { icon: 'cut-outline', symbol: 'scissors' };

export function getRoleIcon(roleName?: string | null): RoleIcon {
  const name = String(roleName ?? '').trim();
  return ROLE_ICONS.find(entry => entry.match.test(name))?.value ?? FALLBACK;
}
