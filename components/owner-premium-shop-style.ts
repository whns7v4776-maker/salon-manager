import {nativeSectionStyles,nativeSerif} from './owner-native-premium';
import { premiumWebCardStyles } from './premium-web-surfaces';
import { Platform } from 'react-native';
import { useAccessAppearance } from './access-premium';
import { useMemo } from 'react';
import { shopUI } from '../src/lib/shop-pickup';
export function premiumShopStyles<T extends Record<string, any>>(base: T, p: ReturnType<typeof useAccessAppearance>['palette'], native = false): T {
  // All owner shop surfaces share the current theme, including nested native panels.
  void native;
  const result: Record<string, any> = {};
  for (const [key, original] of Object.entries(base)) {
    const value = { ...original };
    if (!/error|danger|warning|notice|success/i.test(key)) {
      if (value.color) value.color = /copy|meta|kicker/i.test(key) ? p.muted : p.ink;
      if (value.backgroundColor) value.backgroundColor = p.field;
      if (value.borderColor) value.borderColor = p.border;
    }
    if (value.shadowRadius) { value.shadowOpacity = 0; if (Platform.OS === 'web') value.boxShadow = 'none'; }
    result[key] = value;
  }
  result.hero = { ...result.hero, padding: 0, paddingBottom: 18, backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: 1, borderBottomColor: p.line, borderRadius: 0, gap: 10 };
  result.title = { ...result.title, fontFamily: 'Georgia', fontSize: 24, lineHeight: 30, fontWeight: '500', color: p.ink };
  if(result.wrap)result.wrap={...result.wrap,alignItems:'stretch',gap:12};
  result.quickCard = { ...result.quickCard, padding: 14, borderRadius: 15 };
  result.card = {...result.card, backgroundColor:p.surface, borderColor:p.border, borderRadius:18, padding:16, gap:14};
  result.quickIcon = { ...result.quickIcon, backgroundColor: p.field, borderRadius: 20 };
  result.primary = { ...result.primary, backgroundColor: p.action };
  result.stack = { ...result.stack, gap: 18 };
  const styled: Record<string, any> = Platform.OS==='web'?premiumWebCardStyles(result,p):nativeSectionStyles({...result,title:{...result.title,fontFamily:nativeSerif,fontSize:20,lineHeight:26}},p);
  // Applied last: the native adapter would otherwise turn *Selected keys back into a solid fill.
  const bronze = { borderWidth: 1, borderColor: p.night ? '#9C8461' : '#7A6446' };
  if (styled.chipSelected) styled.chipSelected = { ...styled.chipSelected, ...bronze, backgroundColor: p.night ? 'rgba(156,132,97,.16)' : 'rgba(122,100,70,.09)' };
  if (styled.selected) styled.selected = { ...styled.selected, ...bronze, backgroundColor: p.night ? 'rgba(156,132,97,.12)' : 'rgba(122,100,70,.07)' };
  return styled as T;
}

/** The owner shop panels (orders, purchases, stock, documents) in the current theme. */
export function useOwnerShopUI(): typeof shopUI {
  const { palette } = useAccessAppearance();
  return useMemo(() => premiumShopStyles(shopUI, palette), [palette]);
}
