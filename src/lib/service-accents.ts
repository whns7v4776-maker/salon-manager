const normalizeValue = (value?: string) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeServiceAccentKey = (value?: string) =>
  normalizeValue(value);

export type ServiceAccent = {
  bg: string;
  border: string;
  text: string;
};

export type ServiceCardTheme = ServiceAccent & {
  baseColor: string;
  glassColor: string;
  borderColor: string;
  shadowColor: string;
  textColor: string;
};

const ROLE_ACCENTS: Record<string, ServiceAccent> = {
  barber: { bg: '#F8EDC8', border: '#E5CD83', text: '#0F172A' },
  'hair stylist': { bg: '#E2EFFB', border: '#9FC4E8', text: '#0F172A' },
  colorista: { bg: '#ECE5F6', border: '#BBA7D8', text: '#0F172A' },
  nails: { bg: '#F0EAF8', border: '#C8B8DE', text: '#0F172A' },
  estetica: { bg: '#F8E2EB', border: '#DDA8BE', text: '#0F172A' },
  skincare: { bg: '#E0F4F1', border: '#9BCDC6', text: '#0F172A' },
  epilazione: { bg: '#F7E4EF', border: '#D9ADCA', text: '#0F172A' },
  brows: { bg: '#F6E5DF', border: '#DBAD9F', text: '#0F172A' },
  lashes: { bg: '#E0F2F6', border: '#99CAD6', text: '#0F172A' },
  'make-up': { bg: '#F3E3EF', border: '#CFABC5', text: '#0F172A' },
  massaggi: { bg: '#EBE6F4', border: '#B7ADD0', text: '#0F172A' },
  spa: { bg: '#DFF2EB', border: '#9BCBB9', text: '#0F172A' },
  tattoo: { bg: '#E7EAF5', border: '#A9B2D4', text: '#0F172A' },
  piercing: { bg: '#F6E9D8', border: '#DDBA8E', text: '#0F172A' },
  pmu: { bg: '#F5E2E2', border: '#D9A5A8', text: '#0F172A' },
  tricologia: { bg: '#EAF1DE', border: '#B8C998', text: '#0F172A' },
  wellness: { bg: '#E1EBF6', border: '#9DB9D7', text: '#0F172A' },
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

  if (
    normalizedService.includes('colore') ||
    normalizedService.includes('color')
  ) {
    return ROLE_ACCENTS.colorista;
  }

  if (normalizedService.includes('taglio')) {
    return ROLE_ACCENTS.barber;
  }

  if (normalizedService.includes('piega')) {
    return ROLE_ACCENTS['hair stylist'];
  }

  if (normalizedService.includes('trattamento')) {
    return ROLE_ACCENTS.nails;
  }

  if (normalizedService.includes('barba')) {
    return ROLE_ACCENTS.barber;
  }

  if (normalizedService.includes('capelli')) {
    return ROLE_ACCENTS['hair stylist'];
  }

  return ROLE_ACCENTS['hair stylist'];
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

const clampByte = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${clampByte(r).toString(16).padStart(2, '0')}${clampByte(g)
    .toString(16)
    .padStart(2, '0')}${clampByte(b).toString(16).padStart(2, '0')}`;

const mixHexColor = (hex: string, targetHex: string, amount: number) => {
  const source = parseHexColor(hex);
  const target = parseHexColor(targetHex);
  if (!source || !target) return hex;
  const safeAmount = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: source.r + (target.r - source.r) * safeAmount,
    g: source.g + (target.g - source.g) * safeAmount,
    b: source.b + (target.b - source.b) * safeAmount,
  });
};

const CANONICAL_ACCENT_COLORS: Record<string, string> = {
  '#2f80ff': '#69B3FF',
  '#ff3d9a': '#F784B8',
  '#ff9f1c': '#FFC36F',
  '#7c3aed': '#B08CFF',
  '#00a6d6': '#55D7F0',
  '#f5c400': '#FFE15C',
  '#ff6a4a': '#FF987C',
  '#c241a1': '#D584C8',
  '#2563eb': '#6A9BFF',
  '#ef4444': '#FF8585',
  '#8b5cf6': '#BCA0FF',
  '#d97706': '#FFC36F',
  '#19b88a': '#63E0BE',
  '#14b8a6': '#59DAD0',
  '#4fbf3f': '#8AD982',
  '#84cc16': '#B8E66A',
  '#72a7f2': '#69B3FF',
  '#ec7fb2': '#F784B8',
  '#f0c66a': '#FFD15F',
  '#a987ea': '#B08CFF',
  '#52c7de': '#55D7F0',
  '#f7d866': '#FFE15C',
  '#f08f82': '#FF987C',
  '#c77bb4': '#D584C8',
  '#6794e6': '#6A9BFF',
  '#ef8585': '#FF8585',
  '#b39af0': '#BCA0FF',
  '#f3af62': '#FFC36F',
  '#5fcfae': '#63E0BE',
  '#55c7bd': '#59DAD0',
  '#82c878': '#8AD982',
  '#a8d75e': '#B8E66A',
  '#6193e1': '#69B3FF',
  '#e36da6': '#F784B8',
  '#dea351': '#FFD15F',
  '#8f67d5': '#B08CFF',
  '#26a1c5': '#55D7F0',
  '#d8b732': '#FFE15C',
  '#e58b78': '#FF987C',
  '#b4639f': '#D584C8',
  '#557bd0': '#6A9BFF',
  '#d86f6f': '#FF8585',
  '#a185e1': '#BCA0FF',
  '#c87f2b': '#FFC36F',
  '#37ae8c': '#63E0BE',
  '#33aea0': '#59DAD0',
  '#6bb261': '#8AD982',
  '#89bf38': '#B8E66A',
  '#c98245': '#FFD15F',
  '#6f96d8': '#69B3FF',
  '#c75d9c': '#F784B8',
  '#8f6bd8': '#B08CFF',
  '#d45e74': '#FF8585',
  '#41a993': '#63E0BE',
  '#d98235': '#FFC36F',
  '#8f623a': '#FFC36F',
  '#4f8fcb': '#6A9BFF',
  '#d8654d': '#FF987C',
  '#74a84a': '#8AD982',
  '#b9992e': '#FFE15C',
  '#a55482': '#D584C8',
  '#77738a': '#B08CFF',
  '#5c9b70': '#63E0BE',
  '#5a9cb4': '#55D7F0',
  '#f7d7b8': '#FFD15F',
  '#f9caca': '#FF8585',
  '#f5e2a8': '#FFE15C',
  '#cdeccf': '#8AD982',
  '#bfe9d7': '#63E0BE',
  '#dde6b8': '#B8E66A',
  '#c9cbf8': '#BCA0FF',
};

export const normalizeServiceAccentColor = (hex: string) => {
  const normalized = hex.trim().toLowerCase();
  return CANONICAL_ACCENT_COLORS[normalized] ?? hex.trim();
};

export const AUTOMATIC_SERVICE_ACCENT_SEQUENCE = [
  '#69B3FF',
  '#FFD15F',
  '#B08CFF',
  '#F784B8',
  '#55D7F0',
  '#FF987C',
  '#BCA0FF',
  '#6A9BFF',
  '#D584C8',
  '#FF8585',
  '#FFC36F',
  '#FFE15C',
  '#63E0BE',
  '#59DAD0',
  '#8AD982',
  '#B8E66A',
] as const;

const AUTOMATIC_ROLE_ACCENT_COLORS: Record<string, string> = {
  barber: '#F4C542',
  'hair stylist': '#3D8BFF',
  colorista: '#8A5CF6',
  nails: '#E94B6F',
  estetica: '#FF6F61',
  skincare: '#20BFC7',
  epilazione: '#C65BCF',
  brows: '#C86C3D',
  lashes: '#259CC0',
  'make-up': '#9C4F8E',
  massaggi: '#48A96C',
  spa: '#22B88A',
  tattoo: '#4F67E8',
  piercing: '#F39A32',
  pmu: '#D64B42',
  tricologia: '#7FAE35',
  wellness: '#2E70C9',
};

export const SERVICE_IDENTITY_COLORS = [
  '#E11D48',
  '#16A34A',
  '#7C3AED',
  '#EA580C',
  '#0F766E',
  '#C026D3',
  '#CA8A04',
  '#4F46E5',
  '#65A30D',
  '#0891B2',
  '#DC2626',
  '#059669',
  '#9333EA',
  '#D97706',
  '#DB2777',
  '#2563EB',
  '#0D9488',
  '#7C2D12',
  '#475569',
  '#BE185D',
] as const;

const hashStableColorIdentity = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getAutomaticRoleAccentColor = (roleName?: string | null) => {
  const normalizedRole = normalizeValue(roleName ?? '');
  const preferredColor = AUTOMATIC_ROLE_ACCENT_COLORS[normalizedRole];
  if (preferredColor) return preferredColor;
  return AUTOMATIC_SERVICE_ACCENT_SEQUENCE[
    hashStableColorIdentity(`role:${normalizedRole || 'servizio'}`) %
      AUTOMATIC_SERVICE_ACCENT_SEQUENCE.length
  ];
};

export const getStableServiceIdentityColor = (identityKey: string) =>
  mixHexColor(
    SERVICE_IDENTITY_COLORS[
      hashStableColorIdentity(`service:${identityKey.trim().toLowerCase()}`) %
        SERVICE_IDENTITY_COLORS.length
    ],
    '#FFFFFF',
    0.24,
  );

export type ServiceColorIdentityItem = {
  id?: string | null;
  nome: string;
  mestiereRichiesto?: string | null;
  compositionSourceServiceId?: string | null;
};

/** Segue i componenti derivati fino al servizio radice, proteggendo dai cicli. */
export const resolveServiceColorSource = <T extends ServiceColorIdentityItem>({
  service,
  services,
}: {
  service: T;
  services: readonly T[];
}) => {
  let current = service;
  const visitedIds = new Set<string>();

  for (let depth = 0; depth < services.length + 1; depth += 1) {
    const currentId = current.id?.trim() ?? '';
    if (currentId) visitedIds.add(currentId);
    const sourceServiceId = current.compositionSourceServiceId?.trim() ?? '';
    if (!sourceServiceId || visitedIds.has(sourceServiceId)) break;
    const sourceService = services.find(
      (candidate) => candidate.id?.trim() === sourceServiceId,
    );
    if (!sourceService) break;
    current = sourceService;
  }

  return current;
};

export const getServiceColorIdentityKey = <T extends ServiceColorIdentityItem>({
  service,
  services,
}: {
  service: T;
  services: readonly T[];
}) => {
  const colorSource = resolveServiceColorSource({ service, services });
  const unresolvedSourceId = service.compositionSourceServiceId?.trim() ?? '';
  const resolvedToCatalogSource = colorSource !== service;
  return (
    (resolvedToCatalogSource ? colorSource.id?.trim() : unresolvedSourceId) ||
    colorSource.id?.trim() ||
    `${normalizeValue(colorSource.mestiereRichiesto ?? '')}:${normalizeServiceAccentKey(
      colorSource.nome,
    )}`
  );
};

type AutomaticServiceColorItem = {
  id?: string | null;
  nome: string;
  mestiereRichiesto?: string | null;
  disponibileOnline?: boolean;
  soloComposizione?: boolean;
};

const hslChannelToHex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

const buildAutomaticOverflowColor = (index: number) => {
  const hue = (index * 137.508) % 360;
  const saturation = 0.68;
  const lightness = 0.7;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = lightness - chroma / 2;
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return `#${hslChannelToHex((red + offset) * 255)}${hslChannelToHex(
    (green + offset) * 255,
  )}${hslChannelToHex((blue + offset) * 255)}`;
};

const pickUnusedAutomaticServiceColor = (
  usedColors: Set<string>,
  reservedColors: Set<string>,
  identityKey: string,
) => {
  const stableHash = hashStableColorIdentity(identityKey);
  const paletteColor = AUTOMATIC_SERVICE_ACCENT_SEQUENCE.map(
    (_, offset) =>
      AUTOMATIC_SERVICE_ACCENT_SEQUENCE[
        (stableHash + offset) % AUTOMATIC_SERVICE_ACCENT_SEQUENCE.length
      ],
  ).find((color) => {
    const normalized = color.toLowerCase();
    return !usedColors.has(normalized) && !reservedColors.has(normalized);
  });
  if (paletteColor) return paletteColor;

  for (let index = 0; index < 720; index += 1) {
    const candidate = buildAutomaticOverflowColor(stableHash + index);
    const normalized = candidate.toLowerCase();
    if (!usedColors.has(normalized) && !reservedColors.has(normalized)) {
      return candidate;
    }
  }

  return AUTOMATIC_SERVICE_ACCENT_SEQUENCE[0];
};

/**
 * Ogni servizio online mantiene un accento distinto e persistente. In modalita
 * multi-mestiere questo accento resta secondario (badge/trattino), mentre il
 * fondo della card segue il mestiere. I colori gia unici non vengono mai
 * ricalcolati: vengono riparati soltanto valori mancanti o collisioni.
 */
export const reconcileAutomaticServiceColorOverrides = ({
  services,
  overrides,
}: {
  services: AutomaticServiceColorItem[];
  overrides: Record<string, string>;
}) => {
  const normalizedActiveServices = services
    .filter(
      (service) =>
        service.disponibileOnline !== false &&
        service.soloComposizione !== true,
    )
    .map((service) => ({
      ...service,
      id: service.id?.trim() ?? '',
      nome: service.nome.trim(),
      roleKey: normalizeValue(service.mestiereRichiesto ?? undefined),
    }))
    .filter((service) => service.nome)
    .map((service) => ({
      ...service,
      stableKey: normalizeServiceAccentKey(service.nome),
      identityKey:
        service.id ||
        `${service.roleKey || 'servizio'}:${normalizeServiceAccentKey(service.nome)}`,
    }))
    .sort((first, second) =>
      first.identityKey.localeCompare(second.identityKey),
    );
  const activeServices = Array.from(
    new Map(
      normalizedActiveServices.map((service) => [service.stableKey, service]),
    ).values(),
  );
  if (activeServices.length === 0) {
    return overrides;
  }

  const existingColorByService = activeServices.map((service) => {
    const stableKey = service.stableKey;
    const color = normalizeServiceAccentColor(
      overrides[stableKey] ?? (service.id ? (overrides[service.id] ?? '') : ''),
    ).trim();
    return { service, stableKey, color };
  });
  const colorCounts = new Map<string, number>();
  existingColorByService.forEach(({ color }) => {
    if (!color) return;
    const normalized = color.toLowerCase();
    colorCounts.set(normalized, (colorCounts.get(normalized) ?? 0) + 1);
  });
  const reservedUniqueColors = new Set(
    Array.from(colorCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([color]) => color),
  );
  const usedColors = new Set<string>();
  let next = overrides;

  existingColorByService.forEach(({ service, stableKey, color }) => {
    const normalizedExistingColor = color.toLowerCase();
    const canKeepExistingColor =
      !!color && !usedColors.has(normalizedExistingColor);
    const resolvedColor = canKeepExistingColor
      ? color
      : pickUnusedAutomaticServiceColor(
          usedColors,
          reservedUniqueColors,
          service.identityKey,
        );
    const normalizedResolvedColor = resolvedColor.toLowerCase();
    usedColors.add(normalizedResolvedColor);
    reservedUniqueColors.delete(normalizedResolvedColor);

    if (next[stableKey] === resolvedColor) {
      return;
    }
    next = {
      ...next,
      [stableKey]: resolvedColor,
    };
  });

  return next;
};

export const reconcileAutomaticRoleColorOverrides = ({
  services,
  overrides,
}: {
  services: AutomaticServiceColorItem[];
  overrides: Record<string, string>;
}) => {
  const activeRoles = Array.from(
    new Set(
      services
        .filter(
          (service) =>
            service.disponibileOnline !== false &&
            service.soloComposizione !== true,
        )
        .map((service) => normalizeValue(service.mestiereRichiesto ?? ''))
        .filter(Boolean),
    ),
  ).sort();
  if (activeRoles.length === 0) return overrides;

  const colorCounts = new Map<string, number>();
  activeRoles.forEach((roleName) => {
    const color = normalizeServiceAccentColor(overrides[roleName] ?? '').trim();
    if (!color) return;
    const normalized = color.toLowerCase();
    colorCounts.set(normalized, (colorCounts.get(normalized) ?? 0) + 1);
  });
  const reservedUniqueColors = new Set(
    Array.from(colorCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([color]) => color),
  );
  const usedColors = new Set<string>();
  let next = overrides;

  activeRoles.forEach((roleName) => {
    const existingColor = normalizeServiceAccentColor(
      overrides[roleName] ?? '',
    ).trim();
    const normalizedExistingColor = existingColor.toLowerCase();
    const canKeepExistingColor =
      !!existingColor && !usedColors.has(normalizedExistingColor);
    let resolvedColor = existingColor;

    if (!canKeepExistingColor) {
      resolvedColor = getAutomaticRoleAccentColor(roleName);
      if (
        usedColors.has(resolvedColor.toLowerCase()) ||
        reservedUniqueColors.has(resolvedColor.toLowerCase())
      ) {
        resolvedColor = pickUnusedAutomaticServiceColor(
          usedColors,
          reservedUniqueColors,
          `role:${roleName}`,
        );
      }
    }

    const normalizedResolvedColor = resolvedColor.toLowerCase();
    usedColors.add(normalizedResolvedColor);
    reservedUniqueColors.delete(normalizedResolvedColor);
    if (next[roleName] !== resolvedColor) {
      next = { ...next, [roleName]: resolvedColor };
    }
  });

  return next;
};

const getReadableTextColor = (hex: string) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#0f172a';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.64 ? '#0f172a' : '#f8fafc';
};

// Aggiornamento esclusivamente visivo della palette storica. Le chiavi colore
// salvate restano intatte: cambiano soltanto le tonalità con cui vengono rese
// card, badge e trattini, in modo uniforme su native e web.
const SERVICE_ACCENT_PRESENTATION_COLORS: Record<string, string> = {
  '#69b3ff': '#2F80ED',
  '#ffd15f': '#D6A400',
  '#b08cff': '#8B4FD6',
  '#f784b8': '#D23C8E',
  '#55d7f0': '#0F9FA8',
  '#ff987c': '#F06449',
  '#bca0ff': '#4353B8',
  '#6a9bff': '#1E9B61',
  '#d584c8': '#8E467A',
  '#ff8585': '#C5363F',
  '#ffc36f': '#E57A19',
  '#ffe15c': '#7D9F2D',
  '#63e0be': '#49B8A8',
  '#59dad0': '#58A6E7',
  '#8ad982': '#B85ACD',
  '#b8e66a': '#A9653E',
};

const getServiceAccentPresentationColor = (hex: string) =>
  SERVICE_ACCENT_PRESENTATION_COLORS[hex.trim().toLowerCase()] ?? hex;

export const getCustomAccent = (hex: string): ServiceAccent => {
  const normalizedHex = getServiceAccentPresentationColor(
    normalizeServiceAccentColor(hex),
  );
  const softenedColor = mixHexColor(normalizedHex, '#FFFFFF', 0.48);

  return {
    bg: softenedColor,
    border: mixHexColor(normalizedHex, '#FFFFFF', 0.3),
    text: getReadableTextColor(softenedColor),
  };
};

export const withServiceAccentAlpha = (hex: string, alpha: number) => {
  const rgb = parseHexColor(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  if (!rgb) return `rgba(100, 116, 139, ${safeAlpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
};

/** Colore pieno equivalente a un accento trasparente sopra il bianco. */
export const blendServiceAccentWithWhite = (hex: string, whiteAmount: number) =>
  mixHexColor(hex, '#FFFFFF', whiteAmount);

/** Muted customer-colour pastels keep night cards opaque without an ochre cast. */
export const getAgendaNightAppointmentFill = (hex: string) => {
  return mixHexColor(hex, '#D4CEC0', 0.72);
};

/** Agenda cards: the salon surface with a light wash of the service colour, opaque in both themes. */
export const getAgendaAppointmentSurface = (hex: string, night: boolean) =>
  mixHexColor(hex, night ? '#2A2E2F' : '#FBF8F3', night ? 0.8 : 0.84);

/** Inverse badges stay distinct from both pastel and dark status cards. */
export const getAgendaAppointmentBadgeTone = (cardTextColor: string) => {
  const rgb = parseHexColor(cardTextColor);
  const lightText = !!rgb && (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.64;
  return lightText
    ? { backgroundColor: '#F2EADB', color: '#2C2E2A' }
    : { backgroundColor: '#343735', color: '#FAF7F0' };
};

export const buildServiceCardThemeFromAccent = (
  accent: ServiceAccent,
): ServiceCardTheme => {
  const baseColor = mixHexColor(accent.bg, accent.border, 0.2);
  const glassColor = mixHexColor(baseColor, '#FFFFFF', 0.14);
  const borderColor = mixHexColor(accent.border, '#FFFFFF', 0.12);
  const shadowColor = mixHexColor(borderColor, '#0F172A', 0.16);
  const textColor = '#0F172A';

  return {
    ...accent,
    bg: glassColor,
    border: borderColor,
    text: textColor,
    baseColor,
    glassColor,
    borderColor,
    shadowColor,
    textColor,
  };
};

/** Risolve l'accento di un servizio tenendo conto degli override colore. */
export const resolveServiceAccent = ({
  serviceId,
  serviceName,
  roleName,
  serviceColorOverrides,
  roleColorOverrides,
  preferRoleColor = false,
}: {
  serviceId?: string;
  serviceName?: string;
  roleName?: string;
  serviceColorOverrides?: Record<string, string>;
  roleColorOverrides?: Record<string, string>;
  preferRoleColor?: boolean;
}): ServiceAccent => {
  const resolveRoleAccent = () => {
    const normalizedRole =
      roleName?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
    return normalizedRole && roleColorOverrides?.[normalizedRole]
      ? getCustomAccent(roleColorOverrides[normalizedRole])
      : null;
  };

  if (preferRoleColor) {
    const roleAccent = resolveRoleAccent();
    if (roleAccent) {
      return roleAccent;
    }

    // In modalità colore-per-mestiere non usare mai come fallback il colore
    // specifico del primo servizio: provocherebbe cambi tinta tra filtri/refresh.
    if (normalizeValue(roleName)) {
      return getServiceAccentByMeta({ roleName });
    }
  }

  if (serviceId && serviceColorOverrides?.[serviceId]) {
    return getCustomAccent(serviceColorOverrides[serviceId]);
  }
  const normalizedServiceName = normalizeServiceAccentKey(serviceName);
  if (normalizedServiceName && serviceColorOverrides?.[normalizedServiceName]) {
    return getCustomAccent(serviceColorOverrides[normalizedServiceName]);
  }

  const roleAccent = resolveRoleAccent();
  if (roleAccent) {
    return roleAccent;
  }

  return getServiceAccentByMeta({ serviceName, roleName });
};

export const getServiceCardTheme = (params: {
  serviceId?: string;
  serviceName?: string;
  roleName?: string;
  serviceColorOverrides?: Record<string, string>;
  roleColorOverrides?: Record<string, string>;
  preferRoleColor?: boolean;
}) => buildServiceCardThemeFromAccent(resolveServiceAccent(params));
