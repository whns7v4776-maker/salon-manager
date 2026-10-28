import {
  isServicePromotionAvailableOnDate,
  type ServicePromotion,
} from './service-promotions';

export const SERVICE_CLIENT_BADGE_MAX_LENGTH = 26;
export const SERVICE_EXPIRING_OFFER_BADGE = 'Sconto a scadenza';

export const normalizeServiceClientBadge = (
  value?: string | null
) =>
  (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, SERVICE_CLIENT_BADGE_MAX_LENGTH);

type ServiceClientBadgeSource = ServicePromotion & {
  badgeCliente?: string | null;
};

/**
 * During a dated promotion the customer sees a temporary, derived badge.
 * Nothing is persisted over the salon's manual badge, which becomes visible
 * again automatically before the promotion starts or after it expires.
 */
export const resolveServiceClientBadge = (
  service: ServiceClientBadgeSource | null | undefined,
  dateValue?: string | null,
  options?: { allowDerivedPromotionBadge?: boolean },
) => {
  const promotionEndDate = String(service?.scontoValidoAl ?? '').trim();
  const hasDatedExpiry = /^\d{4}-\d{2}-\d{2}$/.test(promotionEndDate);

  if (
    options?.allowDerivedPromotionBadge !== false &&
    service &&
    hasDatedExpiry &&
    isServicePromotionAvailableOnDate(service, dateValue)
  ) {
    return SERVICE_EXPIRING_OFFER_BADGE;
  }

  return normalizeServiceClientBadge(service?.badgeCliente);
};

export const getNextLocalServicePromotionDateBoundaryMs = (
  nowValue: number | Date = Date.now(),
) => {
  const now =
    nowValue instanceof Date
      ? new Date(nowValue.getTime())
      : new Date(nowValue);
  if (Number.isNaN(now.getTime())) {
    return Date.now();
  }

  const nextLocalDay = new Date(now.getTime());
  nextLocalDay.setHours(24, 0, 0, 0);
  return nextLocalDay.getTime();
};
