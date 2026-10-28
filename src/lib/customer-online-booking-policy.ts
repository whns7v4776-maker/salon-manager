import { isUnsubmittedBookingPaymentHold } from './booking-payment-flow';

export type CustomerBookingAcceptanceMode = 'inherit' | 'auto' | 'manual';

export type CustomerOnlineServiceOverrideMap = Record<string, boolean>;

export const CUSTOMER_COMPOSITION_OVERRIDE_PREFIX = 'composition:';

export const buildCustomerOnlineBookingOverrideKey = ({
  serviceId,
  compositionId,
}: {
  serviceId: string | null | undefined;
  compositionId?: string | null;
}) => {
  const normalizedCompositionId = compositionId?.trim() ?? '';
  if (normalizedCompositionId) {
    return `${CUSTOMER_COMPOSITION_OVERRIDE_PREFIX}${normalizedCompositionId}`;
  }
  return serviceId?.trim() ?? '';
};

export const isCustomerOnlineBookingOverrideKey = (value: string) => {
  const normalized = value.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized
    )
  ) {
    return true;
  }
  if (!normalized.startsWith(CUSTOMER_COMPOSITION_OVERRIDE_PREFIX)) return false;
  const compositionId = normalized.slice(CUSTOMER_COMPOSITION_OVERRIDE_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    compositionId
  );
};

export type PublicCustomerOnlineBookingPolicy = {
  customerFound: boolean;
  acceptanceMode: CustomerBookingAcceptanceMode;
  effectiveAutoAccept: boolean;
  allowSameDaySameService: boolean;
  serviceOverrides: CustomerOnlineServiceOverrideMap;
  blockedServiceIds: string[];
  blockedCompositionIds: string[];
};

export const normalizeCustomerBookingAcceptanceMode = (
  value: unknown
): CustomerBookingAcceptanceMode =>
  value === 'auto' || value === 'manual' ? value : 'inherit';

export const normalizeCustomerOnlineServiceOverrides = (
  value: unknown
): CustomerOnlineServiceOverrideMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<CustomerOnlineServiceOverrideMap>(
    (result, [serviceId, isAllowed]) => {
      const normalizedId = serviceId.trim();
      if (normalizedId && typeof isAllowed === 'boolean') {
        result[normalizedId] = isAllowed;
      }
      return result;
    },
    {}
  );
};

export const isCustomerServiceOnlineAllowed = (
  overrides: CustomerOnlineServiceOverrideMap | null | undefined,
  serviceId: string | null | undefined
) => {
  const normalizedId = serviceId?.trim() ?? '';
  return !normalizedId || overrides?.[normalizedId] !== false;
};

export const resolveCustomerAutoAccept = (
  salonAutoAccept: boolean,
  mode: CustomerBookingAcceptanceMode | null | undefined
) => {
  const normalizedMode = normalizeCustomerBookingAcceptanceMode(mode);
  if (normalizedMode === 'auto') return true;
  if (normalizedMode === 'manual') return false;
  return salonAutoAccept;
};

type CustomerOnlinePolicyIdentity = {
  id?: string | null;
  email?: string | null;
  telefono?: string | null;
  onlineBookingAcceptanceMode?: CustomerBookingAcceptanceMode | null;
};

type BookingRequestOnlinePolicyIdentity = {
  customerId?: string | null;
  email?: string | null;
  telefono?: string | null;
  appointmentGroupId?: string | null;
  compositionId?: string | null;
  dependencyServiceId?: string | null;
};

const normalizePolicyEmail = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? '';

const normalizePolicyPhone = (value: string | null | undefined) =>
  value?.replace(/\D/g, '') ?? '';

export const findCustomerOnlinePolicyForBookingRequest = <
  TCustomer extends CustomerOnlinePolicyIdentity,
>(
  customers: readonly TCustomer[],
  request: BookingRequestOnlinePolicyIdentity | null | undefined
) => {
  if (!request) return null;

  const customerId = request.customerId?.trim() ?? '';
  if (customerId) {
    const matchedById = customers.find((customer) => customer.id?.trim() === customerId);
    if (matchedById) return matchedById;
  }

  // Stesso contratto autorevole usato dal server pubblico: la rubrica viene
  // riconosciuta soltanto con la coppia esatta email + telefono.
  const email = normalizePolicyEmail(request.email);
  const phone = normalizePolicyPhone(request.telefono);
  if (!email || !phone) return null;

  return (
    customers.find(
      (customer) =>
        normalizePolicyEmail(customer.email) === email &&
        normalizePolicyPhone(customer.telefono) === phone
    ) ?? null
  );
};

export const resolveBookingRequestAutoAccept = <
  TCustomer extends CustomerOnlinePolicyIdentity,
>({
  salonAutoAccept,
  customers,
  request,
}: {
  salonAutoAccept: boolean;
  customers: readonly TCustomer[];
  request: BookingRequestOnlinePolicyIdentity | null | undefined;
}) => {
  // Composizioni, dipendenze e gruppi collegati restano sempre sotto conferma
  // esplicita del salone: una sola fase non deve mai accettarsi da sola.
  if (
    request?.appointmentGroupId?.trim() ||
    request?.compositionId?.trim() ||
    request?.dependencyServiceId?.trim()
  ) {
    return false;
  }

  const customer = findCustomerOnlinePolicyForBookingRequest(customers, request);
  return resolveCustomerAutoAccept(
    salonAutoAccept,
    customer?.onlineBookingAcceptanceMode
  );
};

export const isUnworkedManualBookingRequest = <
  TCustomer extends CustomerOnlinePolicyIdentity,
>({
  salonAutoAccept,
  customers,
  request,
}: {
  salonAutoAccept: boolean;
  customers: readonly TCustomer[];
  request: BookingRequestOnlinePolicyIdentity & {
    origine?: string | null;
    stato?: string | null;
    operatorChangeStatus?: string | null;
    paymentHoldState?: unknown;
  };
}) => {
  if (
    request.stato !== 'In attesa' ||
    request.operatorChangeStatus === 'pending' ||
    isUnsubmittedBookingPaymentHold(request)
  ) {
    return false;
  }

  // Match the server unread guard: online customer approval overrides apply to
  // public requests; salon-created requests keep the salon's general rule.
  const customer = request.origine === 'backoffice'
    ? null
    : findCustomerOnlinePolicyForBookingRequest(customers, request);
  return !resolveCustomerAutoAccept(
    salonAutoAccept,
    customer?.onlineBookingAcceptanceMode
  );
};

export const normalizePublicCustomerOnlineBookingPolicy = (
  value: unknown,
  fallbackAutoAccept = false
): PublicCustomerOnlineBookingPolicy => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const serviceOverrides = normalizeCustomerOnlineServiceOverrides(source.serviceOverrides);
  const blockedServiceIds = Array.isArray(source.blockedServiceIds)
    ? source.blockedServiceIds.map(String).map((item) => item.trim()).filter(Boolean)
    : Object.entries(serviceOverrides)
        .filter(([, isAllowed]) => isAllowed === false)
        .map(([serviceId]) => serviceId);

  return {
    customerFound: source.customerFound === true,
    acceptanceMode: normalizeCustomerBookingAcceptanceMode(source.acceptanceMode),
    effectiveAutoAccept:
      typeof source.effectiveAutoAccept === 'boolean'
        ? source.effectiveAutoAccept
        : fallbackAutoAccept,
    allowSameDaySameService: source.allowSameDaySameService !== false,
    serviceOverrides,
    blockedServiceIds: [...new Set(blockedServiceIds)],
    blockedCompositionIds: Array.isArray(source.blockedCompositionIds)
      ? [
          ...new Set(
            source.blockedCompositionIds.map(String).map((item) => item.trim()).filter(Boolean)
          ),
        ]
      : [],
  };
};
