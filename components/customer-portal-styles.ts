import { StyleSheet } from 'react-native';
import type { Palette } from './access-appearance-context';

/** Shared customer account, benefits and payment surfaces. No business state belongs here. */
export function customerPortalStyles<T extends Record<string, object>>(base: T, p: Palette): T {
  const result: Record<string, any> = {};
  for (const [key, original] of Object.entries(base)) {
    const value: any = { ...StyleSheet.flatten(original) };
    if (value.color) value.color = /copy|text|note|description|eyebrow|meta|hint/i.test(key) ? p.muted : p.ink;
    if (value.backgroundColor && value.backgroundColor !== 'transparent') value.backgroundColor = p.field;
    for (const edge of ['borderColor', 'borderTopColor', 'borderBottomColor']) if (value[edge]) value[edge] = p.border;
    if (value.shadowOpacity) value.shadowOpacity = 0;
    if (value.elevation) value.elevation = 0;
    if (value.fontWeight === '800' || value.fontWeight === '900') value.fontWeight = '600';
    if (/error|danger/i.test(key) && value.color) value.color = p.night ? '#E4B5B9' : '#963F4A';
    if (/^(button|payButton|compactPayButton|saveButton|primary)$/.test(key)) { value.backgroundColor = p.action; value.borderColor = p.action; }
    if (/^(buttonText|compactPayButtonText|primaryText|saveText|white)$/.test(key)) value.color = p.actionText;
    result[key] = value;
  }
  return result as T;
}
