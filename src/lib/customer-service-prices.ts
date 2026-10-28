export type CustomerServicePriceOverride = {
  serviceId: string;
  price: number;
};

export type CustomerServicePriceOverrideMap = Record<
  string,
  CustomerServicePriceOverride
>;

const normalizePrice = (value: unknown) => {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 9999) return undefined;
  return Math.round(price * 100) / 100;
};

export const normalizeCustomerServicePriceOverride = (
  value: unknown,
  fallbackServiceId = ''
): CustomerServicePriceOverride | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const serviceId = String(candidate.serviceId ?? fallbackServiceId).trim();
  const price = normalizePrice(candidate.price);
  if (!serviceId || price === undefined) return null;

  return { serviceId, price };
};

export const normalizeCustomerServicePriceOverrides = (
  value: unknown
): CustomerServicePriceOverrideMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<
    CustomerServicePriceOverrideMap
  >((result, [serviceId, rawOverride]) => {
    const normalized = normalizeCustomerServicePriceOverride(rawOverride, serviceId);
    if (normalized) result[normalized.serviceId] = normalized;
    return result;
  }, {});
};

export const getCustomerServicePriceOverride = (
  overrides: CustomerServicePriceOverrideMap | null | undefined,
  serviceId: string | null | undefined
) => {
  const normalizedServiceId = serviceId?.trim() ?? '';
  if (!normalizedServiceId) return null;
  return normalizeCustomerServicePriceOverride(
    overrides?.[normalizedServiceId],
    normalizedServiceId
  );
};

export const resolveCustomerServicePrice = ({
  serviceId,
  defaultPrice,
  overrides,
}: {
  serviceId: string;
  defaultPrice: number;
  overrides?: CustomerServicePriceOverrideMap | null;
}) => {
  const override = getCustomerServicePriceOverride(overrides, serviceId);
  return {
    price: override?.price ?? Math.max(0, Math.round(Number(defaultPrice || 0) * 100) / 100),
    customized: !!override,
  };
};
