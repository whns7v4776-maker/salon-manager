import { Platform } from 'react-native';

const IS_ANDROID = Platform.OS === 'android';

const TEXT_KEY_PATTERN =
  /(text|title|subtitle|label|value|name|meta|hint|eyebrow|caption|heading|description|status|error|helper|code|number|amount|cta)/i;

const CONTAINER_KEY_PATTERN =
  /(card|chip|badge|pill|button|input|field|plate|slot|cell|footer|wrap|section|panel|block)/i;

const NUMERIC_KEYS_TO_WIDEN = ['paddingHorizontal', 'paddingLeft', 'paddingRight', 'minWidth', 'maxWidth', 'width'] as const;

export function withAndroidStyleSafety(styles: Record<string, any>): Record<string, any> {
  if (!IS_ANDROID) return styles;

  const nextStyles: Record<string, any> = {};

  Object.entries(styles).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      nextStyles[key] = value;
      return;
    }

    const nextValue: Record<string, unknown> = { ...value };

    if (TEXT_KEY_PATTERN.test(key)) {
      const fontSize = typeof nextValue.fontSize === 'number' ? nextValue.fontSize : null;
      const lineHeight = typeof nextValue.lineHeight === 'number' ? nextValue.lineHeight : null;
      const letterSpacing =
        typeof nextValue.letterSpacing === 'number' ? nextValue.letterSpacing : null;
      const paddingHorizontal =
        typeof nextValue.paddingHorizontal === 'number' ? nextValue.paddingHorizontal : 0;

      nextValue.includeFontPadding = true;
      nextValue.paddingHorizontal = Math.max(paddingHorizontal, 2);

      if (fontSize && (!lineHeight || lineHeight < fontSize * 1.12)) {
        nextValue.lineHeight = Math.ceil(fontSize * 1.18);
      }

      if (letterSpacing !== null) {
        nextValue.letterSpacing = letterSpacing < 0 ? 0 : Math.min(letterSpacing, 1);
      }
    }

    if (CONTAINER_KEY_PATTERN.test(key)) {
      NUMERIC_KEYS_TO_WIDEN.forEach((styleKey) => {
        const current = nextValue[styleKey];
        if (typeof current !== 'number') return;

        if (styleKey === 'paddingHorizontal') {
          nextValue[styleKey] = current + 4;
          return;
        }

        if (styleKey === 'paddingLeft' || styleKey === 'paddingRight') {
          nextValue[styleKey] = current + 2;
          return;
        }

        nextValue[styleKey] = current + 8;
      });

      if (nextValue.overflow === 'hidden') {
        nextValue.overflow = 'visible';
      }
    }

    nextStyles[key] = nextValue;
  });

  return nextStyles;
}
