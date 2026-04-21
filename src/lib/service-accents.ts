const normalizeValue = (value?: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const normalizeServiceAccentKey = (value?: string) => normalizeValue(value);

export type ServiceAccent = {
  bg: string;
  border: string;
  text: string;
};

const ROLE_ACCENTS: Record<string, ServiceAccent> = {
  barber: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  'hair stylist': { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  colorista: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  nails: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  estetica: { bg: '#ffe4e6', border: '#fda4af', text: '#9f1239' },
  skincare: { bg: '#ccfbf1', border: '#5eead4', text: '#0f766e' },
  epilazione: { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  brows: { bg: '#f3e8ff', border: '#d8b4fe', text: '#7e22ce' },
  lashes: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  'make-up': { bg: '#fce7f3', border: '#f9a8d4', text: '#be185d' },
  massaggi: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  spa: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  tattoo: { bg: '#f3e8ff', border: '#d8b4fe', text: '#7e22ce' },
  piercing: { bg: '#fae8ff', border: '#e879f9', text: '#a21caf' },
  pmu: { bg: '#fee2e2', border: '#fca5a5', text: '#be123c' },
  tricologia: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  wellness: { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
};

export const getServiceAccentByMeta = ({
  serviceName,
  roleName,
}: {
  serviceName?: string;
  roleName?: string;
}): ServiceAccent => {
  const normalizedRole = normalizeValue(roleName);
  if (normalizedRole && ROLE_ACCENTS[normalizedRole]) {
    return ROLE_ACCENTS[normalizedRole];
  }

  const normalizedService = normalizeValue(serviceName);

  if (normalizedService.includes('colore') || normalizedService.includes('color')) {
    return { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' };
  }

  if (normalizedService.includes('taglio')) {
    return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }

  if (normalizedService.includes('piega')) {
    return { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' };
  }

  if (normalizedService.includes('trattamento')) {
    return { bg: '#f3e8ff', border: '#d8b4fe', text: '#7e22ce' };
  }

  if (normalizedService.includes('barba')) {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  }

  if (normalizedService.includes('capelli')) {
    return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }

  return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
};

const parseHexColor = (hex: string) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const adjustHexColor = (hex: string, delta: number) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#64748b';
  const r = clampByte(rgb.r + delta).toString(16).padStart(2, '0');
  const g = clampByte(rgb.g + delta).toString(16).padStart(2, '0');
  const b = clampByte(rgb.b + delta).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

const getReadableTextColor = (hex: string) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#0f172a';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.64 ? '#0f172a' : '#f8fafc';
};

export const getCustomAccent = (hex: string): ServiceAccent => ({
  bg: hex,
  border: adjustHexColor(hex, -24),
  text: getReadableTextColor(hex),
});

/** Risolve l'accento di un servizio tenendo conto degli override colore. */
export const resolveServiceAccent = ({
  serviceId,
  serviceName,
  roleName,
  serviceColorOverrides,
  roleColorOverrides,
}: {
  serviceId?: string;
  serviceName?: string;
  roleName?: string;
  serviceColorOverrides?: Record<string, string>;
  roleColorOverrides?: Record<string, string>;
}): ServiceAccent => {
  if (serviceId && serviceColorOverrides?.[serviceId]) {
    return getCustomAccent(serviceColorOverrides[serviceId]);
  }
  const normalizedServiceName = normalizeServiceAccentKey(serviceName);
  if (normalizedServiceName && serviceColorOverrides?.[normalizedServiceName]) {
    return getCustomAccent(serviceColorOverrides[normalizedServiceName]);
  }
  const normalizedRole = roleName?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  if (normalizedRole && serviceColorOverrides?.[normalizedRole]) {
    return getCustomAccent(serviceColorOverrides[normalizedRole]);
  }
  if (normalizedRole && roleColorOverrides?.[normalizedRole]) {
    return getCustomAccent(roleColorOverrides[normalizedRole]);
  }
  if (normalizedServiceName && roleColorOverrides?.[normalizedServiceName]) {
    return getCustomAccent(roleColorOverrides[normalizedServiceName]);
  }
  return getServiceAccentByMeta({ serviceName, roleName });
};
