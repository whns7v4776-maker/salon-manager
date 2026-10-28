export const PHONE_DIGITS_MIN = 9;
export const PHONE_DIGITS_MAX = 10;
export const PHONE_DIGITS_REQUIRED = PHONE_DIGITS_MAX;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const normalizePhoneDigits = (value: string) => value.replace(/\D/g, '');

export const limitPhoneToTenDigits = (value: string) =>
  normalizePhoneDigits(value).slice(0, PHONE_DIGITS_MAX);

export const isValidPhone10 = (value: string) =>
  normalizePhoneDigits(value).length >= PHONE_DIGITS_MIN &&
  normalizePhoneDigits(value).length <= PHONE_DIGITS_MAX;

export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value.trim());

export const buildInvalidFieldsMessage = (invalidFields: string[]) =>
  `Prima di andare avanti correggi i seguenti campi:\n• ${invalidFields.join('\n• ')}`;
