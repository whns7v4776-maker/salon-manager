import {nativeSectionStyles,nativeSerif} from './owner-native-premium';
import { premiumWebCardStyles } from './premium-web-surfaces';
import { Platform } from 'react-native';
import type { useAccessAppearance } from './access-premium';
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
  if(result.chipSelected)result.chipSelected={...result.chipSelected,backgroundColor:p.action,borderColor:p.action};
  result.primary = { ...result.primary, backgroundColor: p.action };
  result.stack = { ...result.stack, gap: 18 };
  return (Platform.OS==='web'?premiumWebCardStyles(result,p):nativeSectionStyles({...result,title:{...result.title,fontFamily:nativeSerif}},p)) as T;
}
