import React from 'react';
import { StyleSheet } from 'react-native';
import { useAccessAppearance } from '../access-premium';
import { shopUI } from '../../src/lib/shop-pickup';

export const CustomerShopThemeContext = React.createContext(false);
export function useCustomerShopStyles(force = false) {
  const active = React.useContext(CustomerShopThemeContext) || force;
  const { palette: p } = useAccessAppearance();
  return React.useMemo(() => {
    if (!active) return shopUI;
    const result: Record<string, any> = {};
    for (const [key, original] of Object.entries(shopUI)) {
      const value: any = { ...StyleSheet.flatten(original) };
      if (value.color) value.color = key === 'copy' ? p.muted : p.ink;
      if (value.backgroundColor) value.backgroundColor = p.field;
      if (value.borderColor) value.borderColor = p.border;
      if (value.fontWeight === '700') value.fontWeight = '600';
      result[key] = value;
    }
    result.card = { ...result.card, padding: 14, gap: 10, borderRadius: 17, backgroundColor: p.field, borderColor: p.border };
    result.title = { ...result.title, fontSize: 17, lineHeight: 23 };
    result.copy = { ...result.copy, fontSize: 12, lineHeight: 18 };
    result.grow = { flex: 1, minWidth: 0 };
    result.button = { ...result.button, minHeight: 40, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12 };
    result.primary = { backgroundColor: p.action, borderColor: p.action };
    result.white = { color: p.actionText };
    result.buttonText = { ...result.buttonText, fontSize: 13, lineHeight: 19 };
    result.input = { ...result.input, backgroundColor: p.field, color: p.ink, borderColor: p.border, borderRadius: 13, minHeight: 46 };
    result.disabled = { opacity: .45 };
    result.error = { ...result.error, color: p.night ? '#F0B5BA' : '#963F4A' };
    result.selected = { borderColor: p.night ? '#CDB78F' : '#526B59', backgroundColor: p.field, borderWidth: 1 };
    return result as typeof shopUI;
  }, [active, p]);
}
