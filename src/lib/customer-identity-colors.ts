const CUSTOMER_IDENTITY_PRIMARY_COLORS = [
  '#D81B60',
  '#2563EB',
  '#D5A021',
  '#F97316',
  '#A67C52',
  '#8B5CF6',
  '#0891B2',
  '#C026D3',
  '#4F46E5',
  '#DC2626',
  '#B45309',
  '#0E7490',
  '#A21CAF',
  '#E11D48',
  '#1D4ED8',
  '#7C2D12',
] as const;

// Verde e grigio restano disponibili solo come tonalità di emergenza. La
// selezione continua a dipendere esclusivamente dall'identità stabile del
// cliente: non viene salvato né ricalcolato alcun dato quando la lista cambia.
const CUSTOMER_IDENTITY_RESERVE_COLORS = [
  '#16A34A',
  '#0F766E',
  '#059669',
  '#64748B',
  '#475569',
] as const;

const CUSTOMER_RESERVE_COLOR_RATE = 257;

export const getCustomerIdentityTextColor = (color: string) => {
  const channels = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? '#172033' : '#FFFFFF';
};

const hashCustomerIdentity = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const normalizeCustomerIdentityKey = (identityKey: string) =>
  identityKey.trim().toLowerCase() || 'customer';

export const getCustomerIdentityColor = (
  identityKey: string,
  displayName?: string | null,
) => {
  const normalizedDisplayName = (displayName ?? '').trim().toLowerCase();
  const stableIdentityKey =
    identityKey.trim().toLowerCase() ||
    (normalizedDisplayName ? `name:${normalizedDisplayName}` : 'customer');
  const stableHash = hashCustomerIdentity(`customer:${stableIdentityKey}`);
  if (stableHash % CUSTOMER_RESERVE_COLOR_RATE === 0) {
    return CUSTOMER_IDENTITY_RESERVE_COLORS[
      Math.floor(stableHash / CUSTOMER_RESERVE_COLOR_RATE) %
        CUSTOMER_IDENTITY_RESERVE_COLORS.length
    ];
  }

  return CUSTOMER_IDENTITY_PRIMARY_COLORS[
    stableHash % CUSTOMER_IDENTITY_PRIMARY_COLORS.length
  ];
};

export const buildCustomerIdentityColorMap = (
  customers: readonly {
    identityKey: string;
    displayName?: string | null;
  }[],
) => {
  const uniqueCustomers = new Map<
    string,
    { identityKey: string; displayName?: string | null }
  >();

  customers.forEach((customer) => {
    const identityKey = normalizeCustomerIdentityKey(customer.identityKey);
    if (!uniqueCustomers.has(identityKey)) {
      uniqueCustomers.set(identityKey, { ...customer, identityKey });
    }
  });

  const assignedColors = new Map<string, string>();

  uniqueCustomers.forEach((customer) => {
    assignedColors.set(
      customer.identityKey,
      getCustomerIdentityColor(customer.identityKey, customer.displayName),
    );
  });

  return assignedColors;
};
