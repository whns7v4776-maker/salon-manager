import {
  normalizeCustomerServicePriceOverrides,
  type CustomerServicePriceOverrideMap,
} from './customer-service-prices';

export type CustomerServicePriceAuthoritySnapshot = {
  identityKey: string;
  overrides: CustomerServicePriceOverrideMap;
  resolved: boolean;
  confirmedAt: number;
};

type PersistedCustomerServicePriceAuthority = {
  version: 1;
  identityKey: string;
  overrides: CustomerServicePriceOverrideMap;
  confirmedAt: number;
};

const CUSTOMER_SERVICE_PRICE_AUTHORITY_CACHE_VERSION = 1;
const CUSTOMER_SERVICE_PRICE_AUTHORITY_CACHE_PREFIX =
  'salon_manager_customer_service_price_authority_v1__';

const runtimeAuthorityCache = new Map<
  string,
  CustomerServicePriceAuthoritySnapshot
>();

const cloneOverrides = (
  overrides: CustomerServicePriceOverrideMap,
): CustomerServicePriceOverrideMap =>
  Object.fromEntries(
    Object.entries(overrides).map(([serviceId, item]) => [serviceId, { ...item }]),
  );

const cloneSnapshot = (
  snapshot: CustomerServicePriceAuthoritySnapshot,
): CustomerServicePriceAuthoritySnapshot => ({
  ...snapshot,
  overrides: cloneOverrides(snapshot.overrides),
});

const hashIdentityKey = (identityKey: string) => {
  let hash = 2166136261;
  for (let index = 0; index < identityKey.length; index += 1) {
    hash ^= identityKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const createPendingCustomerServicePriceAuthority = (
  identityKey = '',
): CustomerServicePriceAuthoritySnapshot => ({
  identityKey: identityKey.trim(),
  overrides: {},
  resolved: false,
  confirmedAt: 0,
});

export const buildCustomerServicePriceAuthorityIdentityKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const normalizedSalonCode = String(salonCode ?? '').trim().toLowerCase();
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedPhone = String(phone ?? '').replace(/\D/g, '');

  if (!normalizedSalonCode || (!normalizedEmail && !normalizedPhone)) {
    return '';
  }

  return [normalizedSalonCode, normalizedEmail, normalizedPhone].join('|');
};

export const buildCustomerServicePriceAuthorityCacheKey = (
  identityKey: string,
) => {
  const normalizedIdentityKey = identityKey.trim();
  return normalizedIdentityKey
    ? `${CUSTOMER_SERVICE_PRICE_AUTHORITY_CACHE_PREFIX}${hashIdentityKey(
        normalizedIdentityKey,
      )}`
    : '';
};

export const commitCustomerServicePriceAuthority = ({
  identityKey,
  overrides,
  confirmedAt = Date.now(),
}: {
  identityKey: string;
  overrides: unknown;
  confirmedAt?: number;
}): CustomerServicePriceAuthoritySnapshot => {
  const normalizedIdentityKey = identityKey.trim();
  const snapshot: CustomerServicePriceAuthoritySnapshot = {
    identityKey: normalizedIdentityKey,
    overrides: normalizeCustomerServicePriceOverrides(overrides),
    resolved: Boolean(normalizedIdentityKey),
    confirmedAt:
      normalizedIdentityKey && Number.isFinite(confirmedAt) && confirmedAt > 0
        ? confirmedAt
        : 0,
  };

  if (snapshot.resolved) {
    runtimeAuthorityCache.set(normalizedIdentityKey, cloneSnapshot(snapshot));
  }

  return snapshot;
};

export const readRuntimeCustomerServicePriceAuthority = (
  identityKey: string,
) => {
  const normalizedIdentityKey = identityKey.trim();
  const snapshot = normalizedIdentityKey
    ? runtimeAuthorityCache.get(normalizedIdentityKey)
    : undefined;
  return snapshot ? cloneSnapshot(snapshot) : null;
};

export const beginCustomerServicePriceAuthorityRefresh = ({
  current,
  identityKey,
  cached,
}: {
  current: CustomerServicePriceAuthoritySnapshot;
  identityKey: string;
  cached?: CustomerServicePriceAuthoritySnapshot | null;
}): CustomerServicePriceAuthoritySnapshot => {
  const normalizedIdentityKey = identityKey.trim();

  if (!normalizedIdentityKey) {
    return createPendingCustomerServicePriceAuthority();
  }

  if (
    current.resolved &&
    current.identityKey === normalizedIdentityKey
  ) {
    return current;
  }

  if (
    cached?.resolved &&
    cached.identityKey === normalizedIdentityKey
  ) {
    return cloneSnapshot(cached);
  }

  if (current.identityKey === normalizedIdentityKey) {
    // A background revalidation must never replace the last confirmed value
    // with the ambiguous initial `{}` state.
    return current;
  }

  return createPendingCustomerServicePriceAuthority(normalizedIdentityKey);
};

const haveEqualOverrides = (
  first: CustomerServicePriceOverrideMap,
  second: CustomerServicePriceOverrideMap,
) => {
  const firstIds = Object.keys(first).sort();
  const secondIds = Object.keys(second).sort();
  return (
    firstIds.length === secondIds.length &&
    firstIds.every((serviceId, index) => {
      const firstItem = first[serviceId];
      const secondItem = second[secondIds[index] ?? ''];
      return (
        serviceId === secondIds[index] &&
        firstItem?.serviceId === secondItem?.serviceId &&
        firstItem?.price === secondItem?.price
      );
    })
  );
};

export const reconcileCustomerServicePriceAuthority = (
  current: CustomerServicePriceAuthoritySnapshot,
  incoming: CustomerServicePriceAuthoritySnapshot,
) =>
  current.identityKey === incoming.identityKey &&
  current.resolved === incoming.resolved &&
  haveEqualOverrides(current.overrides, incoming.overrides)
    ? current
    : cloneSnapshot(incoming);

export const isCustomerServicePriceAuthorityResolved = (
  snapshot: CustomerServicePriceAuthoritySnapshot,
  identityKey: string,
) => {
  const normalizedIdentityKey = identityKey.trim();
  return (
    Boolean(normalizedIdentityKey) &&
    snapshot.resolved &&
    snapshot.identityKey === normalizedIdentityKey
  );
};

export const resolveAuthoritativeCustomerServicePriceOverrides = (
  snapshot: CustomerServicePriceAuthoritySnapshot,
  identityKey: string,
): CustomerServicePriceOverrideMap =>
  isCustomerServicePriceAuthorityResolved(snapshot, identityKey)
    ? snapshot.overrides
    : {};

export const serializeCustomerServicePriceAuthority = (
  snapshot: CustomerServicePriceAuthoritySnapshot,
) => {
  if (!snapshot.resolved || !snapshot.identityKey) {
    return '';
  }

  const persisted: PersistedCustomerServicePriceAuthority = {
    version: CUSTOMER_SERVICE_PRICE_AUTHORITY_CACHE_VERSION,
    identityKey: snapshot.identityKey,
    overrides: normalizeCustomerServicePriceOverrides(snapshot.overrides),
    confirmedAt: snapshot.confirmedAt,
  };
  return JSON.stringify(persisted);
};

export const parseCustomerServicePriceAuthority = (
  rawValue: string | null | undefined,
  expectedIdentityKey: string,
) => {
  const normalizedIdentityKey = expectedIdentityKey.trim();
  if (!rawValue || !normalizedIdentityKey) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedCustomerServicePriceAuthority>;
    if (
      parsed.version !== CUSTOMER_SERVICE_PRICE_AUTHORITY_CACHE_VERSION ||
      parsed.identityKey !== normalizedIdentityKey ||
      !Number.isFinite(parsed.confirmedAt) ||
      Number(parsed.confirmedAt) <= 0
    ) {
      return null;
    }

    return commitCustomerServicePriceAuthority({
      identityKey: normalizedIdentityKey,
      overrides: parsed.overrides,
      confirmedAt: Number(parsed.confirmedAt),
    });
  } catch {
    return null;
  }
};
