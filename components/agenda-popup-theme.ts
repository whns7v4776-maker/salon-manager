import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useAccessAppearance } from './access-premium';

/** Shared day/night presentation for standalone editors opened from the Agenda. */
export function useAgendaPopupStyles<T extends Record<string, any>>(base: T): T {
  const { palette: p } = useAccessAppearance();
  return useMemo(() => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(base)) {
      const style = { ...StyleSheet.flatten(value) } as Record<string, any>;
      if (style.color) style.color = /error/i.test(key) ? (p.night ? '#E8ABA6' : '#A14440') : /success/i.test(key) ? (p.night ? '#B2D4BB' : '#426B54') : /note|meta|subtitle|message|empty|count/i.test(key) ? p.muted : p.ink;
      if (style.backgroundColor && style.backgroundColor !== 'transparent') style.backgroundColor = p.field;
      for (const edge of ['borderColor', 'borderTopColor', 'borderBottomColor']) if (style[edge]) style[edge] = p.line;
      if (style.shadowOpacity) style.shadowOpacity = 0;
      if (/^(sheet|card)$/.test(key)) Object.assign(style, { backgroundColor: p.night ? '#202526' : '#F8F5EF', borderRadius: 22, borderWidth: 1, borderColor: p.line });
      if (/^(title)$/.test(key)) Object.assign(style, { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontWeight: '400', fontSize: 25, lineHeight: 31 });
      if (/^(selected|save|confirm|darkButton)$/.test(key)) Object.assign(style, { backgroundColor: p.action, borderColor: p.action });
      if (/^(white|confirmText|darkButtonText)$/.test(key)) style.color = p.actionText;
      if (/^(backdrop|overlay)$/.test(key)) Object.assign(style, { backgroundColor: p.night ? 'rgba(0,0,0,.48)' : 'rgba(40,36,30,.28)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(9px)' } : {}) });
      if (key === 'catalogSelected') Object.assign(style, { backgroundColor: p.night ? 'rgba(124,166,134,.16)' : '#E7EEE6', borderWidth: 1, borderColor: p.night ? '#76967F' : '#A9C0AC' });
      if (key === 'notice') Object.assign(style, { backgroundColor: p.night ? 'rgba(124,166,134,.11)' : '#EAF0E8' });
      result[key] = style;
    }
    return result as T;
  }, [base, p]);
}
