const ITALIAN_LOCALE = 'it-IT';

const formatCustomerNameToken = (value: string) => {
  if (!value) return '';

  return value
    .split(/(['-])/)
    .map((segment) => {
      if (segment === "'" || segment === '-') {
        return segment;
      }

      const normalized = segment.toLocaleLowerCase(ITALIAN_LOCALE);
      if (!normalized) return '';

      return `${normalized.charAt(0).toLocaleUpperCase(ITALIAN_LOCALE)}${normalized.slice(1)}`;
    })
    .join('');
};

export const formatCustomerNamePart = (value?: string | null) =>
  (value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCustomerNameToken)
    .join(' ');

export const formatCustomerFullNameValue = (value?: string | null) =>
  (value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCustomerNameToken)
    .join(' ');

