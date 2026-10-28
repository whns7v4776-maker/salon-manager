import { lowerItalian, upperItalian } from './italian-case';
const EMAIL_LIKE_PATTERN = /(?:[^\s@]+@[^\s@]+|@|\.com\b|\.it\b|\.net\b|\.org\b|mailto:)/i;
const URL_LIKE_PATTERN = /(?:https?:\/\/|www\.|\.co\b|\.io\b)/i;
const INVALID_NAME_TOKEN_PATTERN =
  /\S*(?:[^\s@]+@[^\s@]+|@|mailto:|https?:\/\/|www\.|\.com\b|\.it\b|\.net\b|\.org\b|\.co\b|\.io\b)\S*/gi;
const DIGIT_PATTERN = /\d/g;
const DISALLOWED_NAME_CHARS_PATTERN = /[^A-Za-zÀ-ÖØ-öø-ÿ'’ -]/g;

const formatCustomerNameToken = (value: string) => {
  if (!value) return '';

  return value
    .split(/(['’-])/)
    .map((segment) => {
      if (segment === "'" || segment === '’' || segment === '-') {
        return segment;
      }

      const normalized = lowerItalian(segment);
      if (!normalized) return '';

      return `${upperItalian(normalized.charAt(0))}${normalized.slice(1)}`;
    })
    .join('');
};

export const sanitizePersonNamePartInput = (value?: string | null) =>
  (value ?? '')
    .replace(INVALID_NAME_TOKEN_PATTERN, ' ')
    .replace(DIGIT_PATTERN, ' ')
    .replace(DISALLOWED_NAME_CHARS_PATTERN, ' ');

export const formatCustomerNamePart = (value?: string | null) =>
  sanitizePersonNamePartInput(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCustomerNameToken)
    .join(' ');

export const formatCustomerFullNameValue = (value?: string | null) =>
  sanitizePersonNamePartInput(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCustomerNameToken)
    .join(' ');

export const isValidPersonNamePart = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  if (EMAIL_LIKE_PATTERN.test(raw) || URL_LIKE_PATTERN.test(raw) || DIGIT_PATTERN.test(raw)) {
    return false;
  }
  return formatCustomerNamePart(raw).length > 0;
};

export const buildPersonNameValidationError = (label: string) =>
  `${label} può contenere solo lettere, spazi, apostrofi o trattini. Non inserire email o numeri.`;

export const splitCustomerFullNameValue = (value?: string | null) => {
  const normalized = formatCustomerFullNameValue(value);
  if (!normalized) {
    return { nome: '', cognome: '' };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return { nome: tokens[0], cognome: '' };
  }

  return {
    nome: tokens[0] ?? '',
    cognome: tokens.slice(1).join(' '),
  };
};

export const formatLeadingCapitalizedValue = (value?: string | null) => {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trimStart();
  if (!normalized) return '';

  return normalized
    .split(/(\s+|['-])/)
    .map((segment) => {
      if (!segment || /^\s+$/.test(segment) || segment === "'" || segment === '’' || segment === '-') {
        return segment;
      }

      return `${upperItalian(segment.charAt(0))}${segment.slice(1)}`;
    })
    .join('');
};
