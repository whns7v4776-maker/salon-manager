export type ServicePromotion = {
  prezzo: number;
  prezzoOriginale?: number | null;
  scontoAttivo?: boolean | null;
  scontoValidoDal?: string | null;
  scontoValidoAl?: string | null;
  scontoOraDalle?: string | null;
  scontoOraAlle?: string | null;
  scontoGiorniSettimana?: number[] | null;
};

export const SERVICE_PROMOTION_WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Gio' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Dom' },
] as const;

export const ALL_SERVICE_PROMOTION_WEEKDAYS = SERVICE_PROMOTION_WEEKDAYS.map(
  (item) => item.value
);

export const normalizeServicePromotionWeekdays = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
    )
  ).sort((first, second) => first - second);
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeDate = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  return ISO_DATE_PATTERN.test(normalized) ? normalized : '';
};

const normalizeTime = (value?: string | null) => {
  const normalized = String(value ?? '').trim().slice(0, 5);
  return TIME_PATTERN.test(normalized) ? normalized : '';
};

const getIsoWeekday = (value?: string | null) => {
  const normalized = normalizeDate(value);
  if (!normalized) return null;

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

export const hasServicePromotion = (service?: ServicePromotion | null) =>
  !!service &&
  service.scontoAttivo !== false &&
  Number.isFinite(service.prezzo) &&
  Number.isFinite(Number(service.prezzoOriginale)) &&
  Number(service.prezzoOriginale) > service.prezzo;

export const hasServicePromotionTimeWindow = (service?: ServicePromotion | null) =>
  !!normalizeTime(service?.scontoOraDalle) && !!normalizeTime(service?.scontoOraAlle);

export const isServicePromotionAvailableOnDate = (
  service: ServicePromotion | null | undefined,
  dateValue?: string | null
) => {
  if (!hasServicePromotion(service)) return false;

  const startDate = normalizeDate(service?.scontoValidoDal);
  const endDate = normalizeDate(service?.scontoValidoAl);
  const selectedDate = normalizeDate(dateValue);
  const configuredWeekdays = normalizeServicePromotionWeekdays(
    service?.scontoGiorniSettimana
  );
  if (!startDate && !endDate && configuredWeekdays.length === 0) return true;
  if (!selectedDate) return false;
  if (startDate && selectedDate < startDate) return false;
  if (endDate && selectedDate > endDate) return false;
  if (configuredWeekdays.length > 0) {
    const selectedWeekday = getIsoWeekday(selectedDate);
    if (!selectedWeekday || !configuredWeekdays.includes(selectedWeekday)) {
      return false;
    }
  }

  return true;
};

export const isServicePromotionActiveForSlot = (
  service: ServicePromotion | null | undefined,
  dateValue?: string | null,
  timeValue?: string | null
) => {
  if (!isServicePromotionAvailableOnDate(service, dateValue)) return false;

  const startTime = normalizeTime(service?.scontoOraDalle);
  const endTime = normalizeTime(service?.scontoOraAlle);
  if (!startTime && !endTime) return true;

  const selectedTime = normalizeTime(timeValue);
  if (!selectedTime || !startTime || !endTime) return false;
  return selectedTime >= startTime && selectedTime < endTime;
};

export const resolveServicePrice = (
  service: ServicePromotion | null | undefined,
  dateValue?: string | null,
  timeValue?: string | null
) => {
  if (!service) return 0;
  if (isServicePromotionActiveForSlot(service, dateValue, timeValue)) {
    return service.prezzo;
  }

  const originalPrice = Number(service.prezzoOriginale);
  return Number.isFinite(originalPrice) && originalPrice > service.prezzo
    ? originalPrice
    : service.prezzo;
};

export const formatServicePromotionTimeWindow = (
  service?: ServicePromotion | null
) => {
  const startTime = normalizeTime(service?.scontoOraDalle);
  const endTime = normalizeTime(service?.scontoOraAlle);
  return startTime && endTime ? `${startTime}–${endTime}` : '';
};
