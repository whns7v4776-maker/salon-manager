import {
  doRelativeBusyIntervalsOverlap,
  getServicePhaseOperator,
  getPhasedServiceTotalDuration,
  getServiceOperatorBusyIntervals,
  normalizeServicePhaseConfig,
  type ServicePhaseConfig,
  type ServicePhaseOperatorAssignments,
} from './service-phases';
import type { ServiceLinkConfig } from './service-compositions';
import { compareDefaultStrings } from './default-string-order';

export type SharedService = {
  id: string;
  nome: string;
  descrizione?: string;
  prezzo: number;
  prezzoOriginale?: number;
  scontoAttivo?: boolean;
  scontoValidoDal?: string;
  scontoValidoAl?: string;
  scontoOraDalle?: string;
  scontoOraAlle?: string;
  scontoGiorniSettimana?: number[];
  durataMinuti?: number;
  phaseConfig?: ServicePhaseConfig;
  linkedServiceConfig?: ServiceLinkConfig;
  phaseOperatorAssignments?: ServicePhaseOperatorAssignments;
  mestiereRichiesto?: string;
  badgeCliente?: string;
  ordineMestiereCliente?: number;
  ordineCliente?: number;
  disponibileOnline?: boolean;
  macchinarioIds?: string[];
  compositionId?: string;
  compositionAllowSplitOperators?: boolean;
  compositionItems?: {
    serviceId: string;
    serviceName: string;
    price: number;
    durationMinutes: number;
    durationOverrideMinutes?: number;
    requiredRole?: string;
    position: number;
  }[];
};

export type SharedOperator = {
  id: string;
  nome: string;
  mestiere: string;
  availability?: OperatorAvailability;
  publicServiceMode?: 'all_role' | 'selected';
  publicServiceIds?: string[];
  publicServiceKeys?: string[];
};

export type OperatorAvailabilityRange = {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
};

export type OperatorAvailability = {
  enabledWeekdays: number[];
  dateRanges: OperatorAvailabilityRange[];
};

export type SharedAppointment = {
  id: string;
  bookingRequestId?: string;
  bookingOrigin?: 'frontend' | 'backoffice';
  appointmentGroupId?: string;
  appointmentGroupOrder?: number;
  appointmentGroupSize?: number;
  compositionId?: string;
  dependencyServiceId?: string;
  data?: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  phaseConfig?: ServicePhaseConfig;
  mestiereRichiesto?: string;
  operatoreId?: string;
  operatoreNome?: string;
  macchinarioIds?: string[];
  macchinarioNomi?: string[];
  incassato?: boolean;
  completato?: boolean;
};

export type FutureDateItem = {
  value: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
};

export type WeeklyScheduleDay = {
  weekday: number;
  isClosed: boolean;
  startTime: string;
  endTime: string;
};

export type VacationRange = {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
};

export type CalendarExceptionKind =
  | 'break'
  | 'vacation'
  | 'closure'
  | 'training'
  | 'other';

export const OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE = '9999-12-31';

export type CalendarException = {
  id: string;
  kind: CalendarExceptionKind;
  startDate: string;
  endDate: string;
  openEnded?: boolean;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  scope: 'salon' | 'operators';
  operatorIds?: string[];
  operatorNames?: string[];
  label?: string;
  createdAt?: string;
};

export const isOpenEndedCalendarException = (
  item: Pick<
    CalendarException,
    'allDay' | 'endDate' | 'kind' | 'openEnded' | 'scope'
  >,
) =>
  item.kind === 'closure' &&
  item.allDay !== false &&
  item.scope === 'salon' &&
  (item.openEnded === true ||
    item.endDate === OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE);

export type DateOverride = {
  date: string;
  forceOpen?: boolean;
  closed?: boolean;
  startTime?: string;
  endTime?: string;
  isClosed?: boolean;
};

export type SlotOverride = {
  date: string;
  time: string;
  blocked: boolean;
  operatorId?: string;
  operatorName?: string;
};

export type PublicSlotIntervalMode = 'follow_agenda' | 'custom';

export const DEFAULT_PUBLIC_SLOT_MINIMUM_INTERVAL_MINUTES = 15;

export const normalizePublicSlotIntervalMode = (
  value: unknown,
): PublicSlotIntervalMode => (value === 'follow_agenda' ? 'follow_agenda' : 'custom');

export const normalizePublicSlotMinimumIntervalMinutes = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 5 &&
  value <= 300 &&
  value % 5 === 0
    ? value
    : DEFAULT_PUBLIC_SLOT_MINIMUM_INTERVAL_MINUTES;

export type AvailabilitySettings = {
  weeklySchedule: WeeklyScheduleDay[];
  weeklyScheduleUpdatedAt?: string;
  vacationRanges: VacationRange[];
  calendarExceptions: CalendarException[];
  calendarExceptionsUpdatedAt?: string;
  dateOverrides: DateOverride[];
  slotOverrides: SlotOverride[];
  dateSlotIntervals: { date: string; slotIntervalMinutes: number }[];
  slotIntervalMinutes: number;
  scheduledSlotIntervalMinutes?: number;
  scheduledSlotIntervalEffectiveFrom?: string;
  slotIntervalUpdatedAt?: string;
  publicSlotIntervalMode: PublicSlotIntervalMode;
  publicSlotMinimumIntervalMinutes: number;
  publicSlotIntervalUpdatedAt?: string;
  agendaTimeMarkerIntervalMinutes: 15 | 30 | 60;
  weekVisibleDays: number;
  weekVisibleDaysUpdatedAt?: string;
  publicBookingWindowValue: number;
  publicBookingWindowUnit: PublicBookingWindowUnit;
  publicBookingWindowUpdatedAt?: string;
  appointmentBufferEnabled: boolean;
  appointmentBufferMinutes: number;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
  guidedSlotsEnabled: boolean;
  guidedSlotsStrategy: 'balanced' | 'protect_long_services' | 'fill_gaps' | 'intelligent';
  guidedSlotsVisibility:
    | 'recommended_first'
    | 'recommended_only'
    | 'recommended_and_all';
  guidedSlotsUpdatedAt?: string;
  compositionAutoFitOperatorsDefault: boolean;
  compositionAutoFitOperatorsUpdatedAt?: string;
  customerRegistrationApprovalRequired?: boolean;
  customerRegistrationApprovalUpdatedAt?: string;
  customServiceContactEnabled: boolean;
  customServiceContactTitle: string;
  customServiceContactMessage: string;
  customServiceContactWhatsappMessage: string;
  customServiceContactUpdatedAt?: string;
};

export type PublicBookingWindowUnit = 'days' | 'weeks' | 'months' | 'years';

export const DEFAULT_PUBLIC_BOOKING_WINDOW_VALUE = 90;
export const DEFAULT_PUBLIC_BOOKING_WINDOW_UNIT: PublicBookingWindowUnit = 'days';
export const PUBLIC_BOOKING_WINDOW_MAX_VALUES: Record<PublicBookingWindowUnit, number> = {
  days: 730,
  weeks: 104,
  months: 24,
  years: 2,
};

export const normalizePublicBookingWindowUnit = (
  value: unknown
): PublicBookingWindowUnit =>
  value === 'weeks' || value === 'months' || value === 'years' ? value : 'days';

export const normalizePublicBookingWindowValue = (
  value: unknown,
  unit: PublicBookingWindowUnit
) => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  const fallback = unit === 'days' ? DEFAULT_PUBLIC_BOOKING_WINDOW_VALUE : 1;
  return Math.max(
    1,
    Math.min(
      PUBLIC_BOOKING_WINDOW_MAX_VALUES[unit],
      Number.isFinite(numericValue) ? Math.round(numericValue) : fallback
    )
  );
};

const PUBLIC_BOOKING_WINDOW_APPROXIMATE_DAYS: Record<PublicBookingWindowUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
  years: 365,
};

export const convertPublicBookingWindowValue = (
  value: number,
  fromUnit: PublicBookingWindowUnit,
  toUnit: PublicBookingWindowUnit
) =>
  normalizePublicBookingWindowValue(
    Math.round(
      (normalizePublicBookingWindowValue(value, fromUnit) *
        PUBLIC_BOOKING_WINDOW_APPROXIMATE_DAYS[fromUnit]) /
        PUBLIC_BOOKING_WINDOW_APPROXIMATE_DAYS[toUnit]
    ),
    toUnit
  );

export const formatPublicBookingWindow = (value: number, unit: PublicBookingWindowUnit) => {
  const normalizedValue = normalizePublicBookingWindowValue(value, unit);
  const labels: Record<PublicBookingWindowUnit, [string, string]> = {
    days: ['giorno', 'giorni'],
    weeks: ['settimana', 'settimane'],
    months: ['mese', 'mesi'],
    years: ['anno', 'anni'],
  };
  return `${normalizedValue} ${normalizedValue === 1 ? labels[unit][0] : labels[unit][1]}`;
};

export const DEFAULT_CUSTOM_SERVICE_CONTACT_TITLE = 'Un servizio pensato su misura per te';
export const DEFAULT_CUSTOM_SERVICE_CONTACT_MESSAGE =
  'Balayage, tattoo e trattamenti personalizzati possono richiedere una consulenza. Scrivici su WhatsApp: definiamo insieme il servizio e il salone inserirà l’appuntamento.';
export const DEFAULT_CUSTOM_SERVICE_CONTACT_WHATSAPP_MESSAGE =
  'Ciao {salone}, vorrei informazioni per un servizio personalizzato e fissare una consulenza.';

export const DEFAULT_MINIMUM_NOTICE_MINUTES = 30;

const GIORNI_SETTIMANA = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const SALON_CAPACITY_OPERATOR_ID_PREFIX = 'salon-capacity::';

const normalizeServiceName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+]/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

export const normalizeRoleName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');

export const isComboServiceName = (value?: string | null) => {
  const normalized = normalizeServiceLimitScopeText(value);
  if (!normalized) return false;

  return /(?:\s*\+\s*|\s*&\s*|\s*\/\s*|\b(?:e|ed|con|plus)\b)/i.test(normalized);
};

const normalizeServiceLimitScopeText = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const tokenizeServiceLimitScopeText = (value?: string | null) =>
  normalizeServiceLimitScopeText(value)
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const SERVICE_LIMIT_SCOPE_KEYWORDS: { scope: string; patterns: RegExp[] }[] = [
  { scope: 'barba', patterns: [/\bbarba\b/, /\bbeard\b/, /\brasatura\b/, /\bshave\b/] },
  {
    scope: 'capelli',
    patterns: [
      /\bcapelli\b/,
      /\btaglio\b/,
      /\bpiega\b/,
      /\bcolore\b/,
      /\bcolor\b/,
      /\bdecolor/,
      /\bmeches\b/,
      /\bschiar/,
      /\bstyling\b/,
      /\bhair\b/,
    ],
  },
  { scope: 'massaggi', patterns: [/\bmassagg/, /\bmassage\b/, /\bspa\b/, /\bwellness\b/] },
  {
    scope: 'nails',
    patterns: [/\bmanicure\b/, /\bpedicure\b/, /\bungh/, /\bnails?\b/, /\bsemipermanente\b/],
  },
  {
    scope: 'estetica',
    patterns: [/\bestetic/, /\bviso\b/, /\bfacial\b/, /\bceretta\b/, /\bepila/, /\btrucco\b/, /\bmake up\b/, /\bmake-up\b/],
  },
];

const ROLE_TO_SERVICE_LIMIT_SCOPES: Record<string, string[]> = {
  barber: ['barba', 'capelli'],
  'hair stylist': ['capelli'],
  colorista: ['capelli'],
  tricologia: ['capelli'],
  massaggi: ['massaggi'],
  spa: ['massaggi'],
  wellness: ['massaggi'],
  nails: ['nails'],
  estetica: ['estetica'],
  skincare: ['estetica'],
  epilazione: ['estetica'],
  brows: ['estetica'],
  lashes: ['estetica'],
  'make-up': ['estetica'],
};

const SALON_CAPACITY_ROLE_ALIASES: Record<string, string> = {
  barber: 'barber',
  barba: 'barber',
  capelli: 'hair stylist',
  hair: 'hair stylist',
  'hair style': 'hair stylist',
  'hair stylist': 'hair stylist',
  spa: 'spa',
  wellness: 'wellness',
  massaggi: 'massaggi',
  massage: 'massaggi',
  estetica: 'estetica',
  skincare: 'skincare',
  epilazione: 'epilazione',
  brows: 'brows',
  lashes: 'lashes',
  makeup: 'make up',
  'make up': 'make up',
  nails: 'nails',
  manicure: 'nails',
  pedicure: 'nails',
  semipermanente: 'nails',
  unghie: 'nails',
};

export const normalizeSalonCapacityRoleKey = (value?: string | null) => {
  const normalized = normalizeRoleName(value ?? '');
  if (!normalized) return '';
  return SALON_CAPACITY_ROLE_ALIASES[normalized] ?? normalized;
};

const ROLE_SCOPE_KEYWORDS: { scope: string; patterns: RegExp[] }[] = [
  { scope: 'barba', patterns: [/\bbarber\b/, /\bbarba\b/, /\bbeard\b/, /\brasatura\b/, /\bshave\b/] },
  {
    scope: 'capelli',
    patterns: [
      /\bbarber\b/,
      /\bhair\b/,
      /\bcapelli\b/,
      /\btaglio\b/,
      /\bpiega\b/,
      /\bcolor(?:e|ista)?\b/,
      /\btricolog/,
      /\bhairstyl/,
    ],
  },
  { scope: 'massaggi', patterns: [/\bmassagg/, /\bmassage\b/, /\bspa\b/, /\bwellness\b/] },
  { scope: 'nails', patterns: [/\bnails?\b/, /\bmanicure\b/, /\bpedicure\b/, /\bungh/] },
  {
    scope: 'estetica',
    patterns: [/\bestetic/, /\bskincare\b/, /\bepila/, /\bbrows?\b/, /\blashes?\b/, /\bmake[- ]?up\b/],
  },
];

const GENERIC_SCOPE_TOKENS: Record<string, string[]> = {
  barba: ['barba', 'beard', 'rasatura', 'shave'],
  capelli: [
    'capelli',
    'hair',
    'taglio',
    'piega',
    'styling',
    'colore',
    'color',
    'decolorazione',
    'decolorante',
    'schiaritura',
    'meches',
  ],
  massaggi: ['massaggio', 'massaggi', 'massage', 'spa', 'wellness'],
  nails: ['unghie', 'nails', 'manicure', 'pedicure', 'semipermanente'],
  estetica: ['estetica', 'ceretta', 'epilazione', 'viso', 'facial', 'trucco', 'make', 'up', 'makeup'],
};

const buildSpecificServiceTokens = ({
  serviceName,
  areaKeys,
}: {
  serviceName?: string | null;
  areaKeys: string[];
}) => {
  const tokens = tokenizeServiceLimitScopeText(serviceName);
  if (tokens.length === 0) return [];

  const genericTokens = new Set<string>();
  areaKeys.forEach((scope) => {
    (GENERIC_SCOPE_TOKENS[scope] ?? []).forEach((token) => {
      genericTokens.add(token);
    });
  });

  return tokens.filter((token) => !genericTokens.has(token));
};

export const buildServiceLimitScope = ({
  serviceName,
  explicitRole,
  services,
}: {
  serviceName?: string | null;
  explicitRole?: string | null;
  services: SharedService[];
}) => {
  const resolvedService = getServiceByName(serviceName ?? '', services);
  const resolvedServiceName = (resolvedService?.nome ?? serviceName ?? '').trim();
  const resolvedRole = normalizeRoleName(
    explicitRole?.trim() || resolvedService?.mestiereRichiesto || ''
  );
  const normalizedServiceName = normalizeServiceLimitScopeText(resolvedServiceName);
  const areaKeys = new Set<string>();

  SERVICE_LIMIT_SCOPE_KEYWORDS.forEach(({ scope, patterns }) => {
    if (patterns.some((pattern) => pattern.test(normalizedServiceName))) {
      areaKeys.add(scope);
    }
  });

  ROLE_SCOPE_KEYWORDS.forEach(({ scope, patterns }) => {
    if (resolvedRole && patterns.some((pattern) => pattern.test(resolvedRole))) {
      areaKeys.add(scope);
    }
  });

  if (resolvedRole) {
    (ROLE_TO_SERVICE_LIMIT_SCOPES[resolvedRole] ?? []).forEach((scope) => {
      if (scope.trim()) {
        areaKeys.add(scope.trim());
      }
    });
  }

  const serviceKey = normalizeServiceName(resolvedServiceName || (serviceName ?? ''));

  if (areaKeys.size === 0 && serviceKey) {
    areaKeys.add(serviceKey);
  }

  return {
    serviceName: resolvedServiceName,
    roleKey: resolvedRole,
    serviceKey,
    areaKeys: Array.from(areaKeys),
  };
};

const buildServiceBookingComponentKeys = ({
  serviceName,
  services,
}: {
  serviceName?: string | null;
  services: SharedService[];
}) => {
  const resolvedService = getServiceByName(serviceName ?? '', services);
  const resolvedServiceName = (resolvedService?.nome ?? serviceName ?? '').trim();
  const normalizedServiceName = normalizeServiceLimitScopeText(resolvedServiceName);
  const componentKeys = new Set<string>();

  SERVICE_LIMIT_SCOPE_KEYWORDS.forEach(({ scope, patterns }) => {
    if (patterns.some((pattern) => pattern.test(normalizedServiceName))) {
      componentKeys.add(scope);
    }
  });

  const serviceKey = normalizeServiceName(resolvedServiceName);
  if (componentKeys.size === 0 && serviceKey) {
    componentKeys.add(`service:${serviceKey}`);
  }

  return Array.from(componentKeys);
};

/**
 * Same-day duplicate rule for client bookings.
 *
 * Only the components explicitly present in the service name count here:
 * "Taglio Uomo" occupies capelli, "Barba Uomo" occupies barba, while a
 * "Taglio + Barba" combo occupies both. The operator role must not broaden
 * this rule (for example Barber must not make every haircut also occupy beard).
 */
export const doServiceBookingComponentsOverlap = ({
  firstServiceName,
  secondServiceName,
  services,
}: {
  firstServiceName?: string | null;
  secondServiceName?: string | null;
  services: SharedService[];
}) => {
  const firstComponents = buildServiceBookingComponentKeys({
    serviceName: firstServiceName,
    services,
  });
  const secondComponents = buildServiceBookingComponentKeys({
    serviceName: secondServiceName,
    services,
  });

  return firstComponents.some((component) => secondComponents.includes(component));
};

export const doServiceLimitScopesOverlap = ({
  firstServiceName,
  firstExplicitRole,
  secondServiceName,
  secondExplicitRole,
  services,
}: {
  firstServiceName?: string | null;
  firstExplicitRole?: string | null;
  secondServiceName?: string | null;
  secondExplicitRole?: string | null;
  services: SharedService[];
}) => {
  const firstScope = buildServiceLimitScope({
    serviceName: firstServiceName,
    explicitRole: firstExplicitRole,
    services,
  });
  const secondScope = buildServiceLimitScope({
    serviceName: secondServiceName,
    explicitRole: secondExplicitRole,
    services,
  });

  if (firstScope.serviceKey !== '' && firstScope.serviceKey === secondScope.serviceKey) {
    return true;
  }

  if (firstScope.areaKeys.length > 0 && secondScope.areaKeys.length > 0) {
    const sharedAreaKeys = firstScope.areaKeys.filter((scope) => secondScope.areaKeys.includes(scope));

    if (sharedAreaKeys.length === 0) {
      return false;
    }

    const firstSpecificTokens = buildSpecificServiceTokens({
      serviceName: firstScope.serviceName,
      areaKeys: sharedAreaKeys,
    });
    const secondSpecificTokens = buildSpecificServiceTokens({
      serviceName: secondScope.serviceName,
      areaKeys: sharedAreaKeys,
    });

    if (firstSpecificTokens.length > 0 && secondSpecificTokens.length > 0) {
      return firstSpecificTokens.some((token) => secondSpecificTokens.includes(token));
    }

    return false;
  }

  return false;
};

export const normalizeOperatorNameKey = (value?: string | null) =>
  (value ?? '').trim().toLowerCase();

export const doOperatorsMatch = ({
  selectedOperatorId,
  selectedOperatorName,
  existingOperatorId,
  existingOperatorName,
}: {
  selectedOperatorId?: string | null;
  selectedOperatorName?: string | null;
  existingOperatorId?: string | null;
  existingOperatorName?: string | null;
}) => {
  const selectedId = selectedOperatorId?.trim() ?? '';
  const existingId = existingOperatorId?.trim() ?? '';
  const selectedNameKey = normalizeOperatorNameKey(selectedOperatorName);
  const existingNameKey = normalizeOperatorNameKey(existingOperatorName);

  if (selectedId && existingId) {
    return selectedId === existingId;
  }

  if (selectedNameKey && existingNameKey) {
    return selectedNameKey === existingNameKey;
  }

  return false;
};

export const isSalonCapacityOperatorId = (value?: string | null) =>
  (value ?? '').trim().toLowerCase().startsWith(SALON_CAPACITY_OPERATOR_ID_PREFIX);

export const buildSalonCapacityOperatorId = (
  serviceName: string,
  services: SharedService[],
  explicitRole?: string | null
) => {
  const service = getServiceByName(serviceName, services);
  const scope = buildServiceLimitScope({
    serviceName: service?.nome ?? serviceName,
    explicitRole,
    services,
  });
  const normalizedAreaKey = normalizeSalonCapacityRoleKey(
    scope.areaKeys.find((item) => item.trim())?.trim() ?? ''
  );
  const normalizedRole = normalizeSalonCapacityRoleKey(
    explicitRole?.trim() || service?.mestiereRichiesto || ''
  );
  const normalizedServiceName = normalizeServiceName(service?.nome ?? serviceName);
  const capacityKey = normalizedRole || normalizedAreaKey || normalizedServiceName || 'salon';
  return `${SALON_CAPACITY_OPERATOR_ID_PREFIX}${capacityKey}`;
};

export const resolveAppointmentSalonCapacityId = (
  appointment: Pick<SharedAppointment, 'servizio' | 'mestiereRichiesto' | 'operatoreId'>,
  services: SharedService[]
) => {
  const canonicalCapacityId = buildSalonCapacityOperatorId(
    appointment.servizio,
    services,
    appointment.mestiereRichiesto
  );

  if (canonicalCapacityId) {
    return canonicalCapacityId;
  }

  const storedOperatorId = appointment.operatoreId?.trim() ?? '';
  return isSalonCapacityOperatorId(storedOperatorId) ? storedOperatorId : '';
};

const normalizeOperatorIdentityKey = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const isHistoricalOrphanOperatorAssignment = ({
  appointment,
  services,
  operators,
}: {
  appointment: Pick<
    SharedAppointment,
    'servizio' | 'mestiereRichiesto' | 'operatoreId' | 'operatoreNome'
  >;
  services: SharedService[];
  operators: SharedOperator[];
}) => {
  const normalizedOperatorId = appointment.operatoreId?.trim() ?? '';
  const normalizedOperatorNameKey = normalizeOperatorIdentityKey(appointment.operatoreNome);
  const requiredRole = normalizeRoleName(
    appointment.mestiereRichiesto?.trim() ||
      getServiceByName(appointment.servizio, services)?.mestiereRichiesto ||
      ''
  );

  if (!normalizedOperatorId && !normalizedOperatorNameKey) {
    return false;
  }

  if (normalizedOperatorId && isSalonCapacityOperatorId(normalizedOperatorId)) {
    return false;
  }

  return !operators.some((item) => {
    const candidateId = item.id?.trim() ?? '';
    const candidateNameKey = normalizeOperatorIdentityKey(item.nome);

    if (normalizedOperatorId && candidateId === normalizedOperatorId) {
      if (!requiredRole) {
        return true;
      }
      return normalizeRoleName(item.mestiere ?? '') === requiredRole;
    }

    if (!normalizedOperatorNameKey || candidateNameKey !== normalizedOperatorNameKey) {
      return false;
    }

    if (!requiredRole) {
      return true;
    }

    return normalizeRoleName(item.mestiere ?? '') === requiredRole;
  });
};

export const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const formatIsoDateLocal = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;

const addCalendarMonthsClamped = (source: Date, months: number) => {
  const target = new Date(source.getFullYear(), source.getMonth(), 1);
  const sourceDay = source.getDate();
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(sourceDay, lastDay));
  return target;
};

export const getPublicBookingWindowEndDate = (
  settings?: Partial<AvailabilitySettings> | null,
  fromDate = getTodayDateString()
) => {
  const unit = normalizePublicBookingWindowUnit(settings?.publicBookingWindowUnit);
  const value = normalizePublicBookingWindowValue(settings?.publicBookingWindowValue, unit);
  const start = parseIsoDate(fromDate);
  let end: Date;

  if (unit === 'months' || unit === 'years') {
    end = addCalendarMonthsClamped(start, value * (unit === 'years' ? 12 : 1));
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + value * (unit === 'weeks' ? 7 : 1));
  }

  return formatIsoDateLocal(end);
};

export const getPublicBookingWindowDaysAhead = (
  settings?: Partial<AvailabilitySettings> | null,
  fromDate = getTodayDateString()
) => {
  const start = parseIsoDate(fromDate);
  const end = parseIsoDate(getPublicBookingWindowEndDate(settings, fromDate));
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
};

export const isDateWithinPublicBookingWindow = (
  settings: Partial<AvailabilitySettings> | null | undefined,
  dateValue: string,
  fromDate = getTodayDateString()
) => dateValue >= fromDate && dateValue <= getPublicBookingWindowEndDate(settings, fromDate);

export const isOperatorAvailableOnDate = (
  operator: Pick<SharedOperator, 'availability' | 'id' | 'nome'> | null | undefined,
  dateValue: string,
  settings?: AvailabilitySettings | null
) => {
  if (settings && getDateAvailabilityInfo(settings, dateValue).closed) {
    return false;
  }

  if (
    settings &&
    getMatchingCalendarExceptions(settings, dateValue, {
      selectedOperatorId: operator?.id,
      selectedOperatorName: operator?.nome,
    }).some((item) => item.allDay)
  ) {
    return false;
  }

  const availability = operator?.availability;
  if (!availability) return true;

  const weekday = parseIsoDate(dateValue).getDay();
  const isSalonForceOpenedForDate = !!(
    settings && getDateOverride(settings, dateValue)?.forceOpen
  );
  const enabledWeekdays = availability.enabledWeekdays?.length
    ? availability.enabledWeekdays
    : ALL_WEEKDAYS;

  // Lo sblocco esplicito di una singola giornata deve renderla davvero
  // prenotabile anche quando, per programmazione ordinaria, gli operatori non
  // lavorano in quel giorno della settimana. Le assenze personali e gli
  // intervalli data restano invece protetti dai controlli sopra e sotto.
  if (!isSalonForceOpenedForDate && !enabledWeekdays.includes(weekday)) {
    return false;
  }

  const ranges = availability.dateRanges ?? [];
  if (ranges.length === 0) {
    return true;
  }

  return ranges.some(
    (range) => range.startDate.trim() !== '' && range.startDate <= dateValue && range.endDate >= dateValue
  );
};

export const formatDateLong = (value: string) => {
  const date = parseIsoDate(value);
  return `${GIORNI_SETTIMANA[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    MESI[date.getMonth()]
  } ${date.getFullYear()}`;
};

export const formatDateCompact = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

export const buildFutureDates = (daysAhead: number): FutureDateItem[] => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: daysAhead }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;

    return {
      value,
      weekdayShort: GIORNI_SETTIMANA[current.getDay()],
      dayNumber: day,
      monthShort: MESI[current.getMonth()],
      fullLabel: formatDateLong(value),
    };
  });
};

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

export const minutesToTime = (minutesValue: number) => {
  const hours = Math.floor(minutesValue / 60);
  const minutes = minutesValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleDay[] = [
  { weekday: 0, isClosed: true, startTime: '09:00', endTime: '19:30' },
  { weekday: 1, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 2, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 3, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 4, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 5, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 6, isClosed: false, startTime: '09:00', endTime: '19:30' },
];

export const normalizeAvailabilitySettings = (
  settings?: Partial<AvailabilitySettings> | null
): AvailabilitySettings => {
  const weeklySchedule = DEFAULT_WEEKLY_SCHEDULE.map((defaultDay) => {
    const savedDay = settings?.weeklySchedule?.find((item) => item.weekday === defaultDay.weekday);
    return {
      ...defaultDay,
      ...savedDay,
    };
  });

  const normalizedSlotInterval =
    typeof settings?.slotIntervalMinutes === 'number' &&
    settings.slotIntervalMinutes >= 5 &&
    settings.slotIntervalMinutes <= 300 &&
    settings.slotIntervalMinutes % 5 === 0
      ? settings.slotIntervalMinutes
      : 5;

  const normalizedScheduledSlotInterval =
    typeof settings?.scheduledSlotIntervalMinutes === 'number' &&
    settings.scheduledSlotIntervalMinutes >= 5 &&
    settings.scheduledSlotIntervalMinutes <= 300 &&
    settings.scheduledSlotIntervalMinutes % 5 === 0 &&
    typeof settings?.scheduledSlotIntervalEffectiveFrom === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      settings.scheduledSlotIntervalEffectiveFrom.trim(),
    )
      ? {
          minutes: settings.scheduledSlotIntervalMinutes,
          effectiveFrom: settings.scheduledSlotIntervalEffectiveFrom.trim(),
        }
      : null;

  const normalizedAgendaTimeMarkerInterval =
    settings?.agendaTimeMarkerIntervalMinutes === 15 ||
    settings?.agendaTimeMarkerIntervalMinutes === 60
      ? settings.agendaTimeMarkerIntervalMinutes
      : 30;

  const normalizedWeekVisibleDays =
    typeof settings?.weekVisibleDays === 'number' &&
    settings.weekVisibleDays >= 1 &&
    settings.weekVisibleDays <= 7
      ? Math.round(settings.weekVisibleDays)
      : 7;

  const normalizedPublicBookingWindowUnit = normalizePublicBookingWindowUnit(
    settings?.publicBookingWindowUnit
  );
  const normalizedPublicBookingWindowValue = normalizePublicBookingWindowValue(
    settings?.publicBookingWindowValue ?? DEFAULT_PUBLIC_BOOKING_WINDOW_VALUE,
    normalizedPublicBookingWindowUnit
  );

  const normalizedAppointmentBufferMinutes =
    typeof settings?.appointmentBufferMinutes === 'number' &&
    settings.appointmentBufferMinutes >= 5 &&
    settings.appointmentBufferMinutes <= 30 &&
    settings.appointmentBufferMinutes % 5 === 0
      ? settings.appointmentBufferMinutes
      : 5;

  const normalizedCalendarExceptions = (settings?.calendarExceptions ?? [])
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const startDate = String(item.startDate ?? '').trim();
      const endDate = String(item.endDate ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
      const openEnded =
        item.openEnded === true ||
        endDate === OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE;
      if (
        openEnded && item.scope !== 'operators' &&
        (item.kind !== 'closure' || item.allDay === false)
      ) {
        return false;
      }
      if (
        !openEnded &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)
      ) {
        return false;
      }
      if (item.allDay !== false) return true;
      const startTime = String(item.startTime ?? '').trim().slice(0, 5);
      const endTime = String(item.endTime ?? '').trim().slice(0, 5);
      return /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) &&
        timeToMinutes(endTime) > timeToMinutes(startTime);
    })
    .map((item, index) => {
      const operatorIds = Array.from(
        new Set((item.operatorIds ?? []).map((value) => String(value).trim()).filter(Boolean))
      );
      const operatorNames = Array.from(
        new Set((item.operatorNames ?? []).map((value) => String(value).trim()).filter(Boolean))
      );
      const requestedScope = item.scope === 'operators' ? 'operators' : 'salon';
      const scope =
        requestedScope === 'operators' && (operatorIds.length > 0 || operatorNames.length > 0)
          ? 'operators'
          : 'salon';
      const kind: CalendarExceptionKind =
        item.kind === 'break' ||
        item.kind === 'vacation' ||
        item.kind === 'closure' ||
        item.kind === 'training'
          ? item.kind
          : 'other';
      const openEnded =
        item.openEnded === true ||
        String(item.endDate ?? '').trim() ===
          OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE;

      return {
        id:
          String(item.id ?? '').trim() ||
          `calendar-exception-${String(item.startDate).trim()}-${String(item.endDate).trim()}-${index}`,
        kind,
        startDate: String(item.startDate).trim(),
        endDate: openEnded
          ? OPEN_ENDED_CALENDAR_EXCEPTION_END_DATE
          : String(item.endDate).trim(),
        openEnded,
        allDay: item.allDay !== false,
        startTime: item.allDay === false ? String(item.startTime).trim().slice(0, 5) : undefined,
        endTime: item.allDay === false ? String(item.endTime).trim().slice(0, 5) : undefined,
        scope,
        operatorIds: scope === 'operators' ? operatorIds : [],
        operatorNames: scope === 'operators' ? operatorNames : [],
        label: String(item.label ?? '').trim().slice(0, 80),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt.trim() : undefined,
      } satisfies CalendarException;
    });

  return {
    weeklySchedule,
    weeklyScheduleUpdatedAt:
      typeof settings?.weeklyScheduleUpdatedAt === 'string' &&
      settings.weeklyScheduleUpdatedAt.trim()
        ? settings.weeklyScheduleUpdatedAt.trim()
        : undefined,
    vacationRanges: (settings?.vacationRanges ?? []).map((item) => ({
      ...item,
      label: item.label ?? '',
    })),
    calendarExceptions: normalizedCalendarExceptions,
    calendarExceptionsUpdatedAt:
      typeof settings?.calendarExceptionsUpdatedAt === 'string' &&
      settings.calendarExceptionsUpdatedAt.trim()
        ? settings.calendarExceptionsUpdatedAt.trim()
        : undefined,
    dateOverrides: settings?.dateOverrides ?? [],
    slotOverrides: (settings?.slotOverrides ?? [])
      .filter(
        (item) =>
          typeof item?.date === 'string' &&
          typeof item?.time === 'string' &&
          item.date.trim() !== '' &&
          item.time.trim() !== ''
      )
      .map((item) => ({
        date: item.date.trim(),
        time: item.time.trim().slice(0, 5),
        blocked: item.blocked !== false,
        operatorId: item.operatorId?.trim() ?? '',
        operatorName: item.operatorName?.trim() ?? '',
      })),
    dateSlotIntervals: (settings?.dateSlotIntervals ?? []).filter(
      (item) =>
        typeof item?.date === 'string' &&
        typeof item?.slotIntervalMinutes === 'number' &&
        item.slotIntervalMinutes >= 5 &&
        item.slotIntervalMinutes <= 300 &&
        item.slotIntervalMinutes % 5 === 0
    ),
    slotIntervalMinutes: normalizedSlotInterval,
    scheduledSlotIntervalMinutes:
      normalizedScheduledSlotInterval?.minutes,
    scheduledSlotIntervalEffectiveFrom:
      normalizedScheduledSlotInterval?.effectiveFrom,
    slotIntervalUpdatedAt:
      typeof settings?.slotIntervalUpdatedAt === 'string' &&
      settings.slotIntervalUpdatedAt.trim()
        ? settings.slotIntervalUpdatedAt.trim()
        : undefined,
    publicSlotIntervalMode: normalizePublicSlotIntervalMode(
      settings?.publicSlotIntervalMode,
    ),
    publicSlotMinimumIntervalMinutes:
      normalizePublicSlotMinimumIntervalMinutes(
        settings?.publicSlotMinimumIntervalMinutes,
      ),
    publicSlotIntervalUpdatedAt:
      typeof settings?.publicSlotIntervalUpdatedAt === 'string' &&
      settings.publicSlotIntervalUpdatedAt.trim()
        ? settings.publicSlotIntervalUpdatedAt.trim()
        : undefined,
    agendaTimeMarkerIntervalMinutes: normalizedAgendaTimeMarkerInterval,
    weekVisibleDays: normalizedWeekVisibleDays,
    weekVisibleDaysUpdatedAt:
      typeof settings?.weekVisibleDaysUpdatedAt === 'string' &&
      settings.weekVisibleDaysUpdatedAt.trim()
        ? settings.weekVisibleDaysUpdatedAt.trim()
        : undefined,
    publicBookingWindowValue: normalizedPublicBookingWindowValue,
    publicBookingWindowUnit: normalizedPublicBookingWindowUnit,
    publicBookingWindowUpdatedAt:
      typeof settings?.publicBookingWindowUpdatedAt === 'string' &&
      settings.publicBookingWindowUpdatedAt.trim()
        ? settings.publicBookingWindowUpdatedAt.trim()
        : undefined,
    appointmentBufferEnabled: settings?.appointmentBufferEnabled ?? false,
    appointmentBufferMinutes: normalizedAppointmentBufferMinutes,
    lunchBreakEnabled: settings?.lunchBreakEnabled ?? false,
    lunchBreakStart: settings?.lunchBreakStart ?? '13:00',
    lunchBreakEnd: settings?.lunchBreakEnd ?? '14:00',
    guidedSlotsEnabled: settings?.guidedSlotsEnabled ?? false,
    guidedSlotsStrategy:
      settings?.guidedSlotsStrategy === 'protect_long_services' ||
      settings?.guidedSlotsStrategy === 'fill_gaps' ||
      settings?.guidedSlotsStrategy === 'intelligent'
        ? settings.guidedSlotsStrategy
        : 'balanced',
    guidedSlotsVisibility:
      settings?.guidedSlotsVisibility === 'recommended_first' ||
      settings?.guidedSlotsVisibility === 'recommended_only' ||
      settings?.guidedSlotsVisibility === 'recommended_and_all'
        ? settings.guidedSlotsVisibility
        : settings?.guidedSlotsStrategy === 'intelligent'
          ? 'recommended_and_all'
          : 'recommended_first',
    guidedSlotsUpdatedAt:
      typeof settings?.guidedSlotsUpdatedAt === 'string' &&
      settings.guidedSlotsUpdatedAt.trim()
        ? settings.guidedSlotsUpdatedAt.trim()
        : undefined,
    compositionAutoFitOperatorsDefault:
      settings?.compositionAutoFitOperatorsDefault !== false,
    compositionAutoFitOperatorsUpdatedAt:
      typeof settings?.compositionAutoFitOperatorsUpdatedAt === 'string' &&
      settings.compositionAutoFitOperatorsUpdatedAt.trim()
        ? settings.compositionAutoFitOperatorsUpdatedAt.trim()
        : undefined,
    customerRegistrationApprovalRequired:
      settings?.customerRegistrationApprovalRequired === true,
    customerRegistrationApprovalUpdatedAt:
      typeof settings?.customerRegistrationApprovalUpdatedAt === 'string' &&
      settings.customerRegistrationApprovalUpdatedAt.trim()
        ? settings.customerRegistrationApprovalUpdatedAt.trim()
        : undefined,
    customServiceContactEnabled: settings?.customServiceContactEnabled === true,
    customServiceContactTitle:
      typeof settings?.customServiceContactTitle === 'string' &&
      settings.customServiceContactTitle.trim()
        ? settings.customServiceContactTitle.trim().slice(0, 80)
        : DEFAULT_CUSTOM_SERVICE_CONTACT_TITLE,
    customServiceContactMessage:
      typeof settings?.customServiceContactMessage === 'string' &&
      settings.customServiceContactMessage.trim()
        ? settings.customServiceContactMessage.trim().slice(0, 500)
        : DEFAULT_CUSTOM_SERVICE_CONTACT_MESSAGE,
    customServiceContactWhatsappMessage:
      typeof settings?.customServiceContactWhatsappMessage === 'string' &&
      settings.customServiceContactWhatsappMessage.trim()
        ? settings.customServiceContactWhatsappMessage.trim().slice(0, 500)
        : DEFAULT_CUSTOM_SERVICE_CONTACT_WHATSAPP_MESSAGE,
    customServiceContactUpdatedAt:
      typeof settings?.customServiceContactUpdatedAt === 'string' &&
      settings.customServiceContactUpdatedAt.trim()
        ? settings.customServiceContactUpdatedAt.trim()
        : undefined,
  };
};

export const getAppointmentBufferMinutes = (
  settings?: Partial<AvailabilitySettings> | null
) => {
  if (!settings?.appointmentBufferEnabled) return 0;

  const minutes = settings.appointmentBufferMinutes;

  return typeof minutes === 'number' && minutes >= 5 && minutes <= 30 && minutes % 5 === 0
    ? minutes
    : 5;
};

export const isSlotWithinMinimumNotice = ({
  dateValue,
  timeValue,
  now = new Date(),
  minimumNoticeMinutes = DEFAULT_MINIMUM_NOTICE_MINUTES,
}: {
  dateValue: string;
  timeValue: string;
  now?: Date;
  minimumNoticeMinutes?: number;
}) => {
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  if (dateValue !== todayIso) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return timeToMinutes(timeValue) < currentMinutes + minimumNoticeMinutes;
};

export const getSlotIntervalForDate = (
  settings: AvailabilitySettings,
  dateValue?: string | null
) => {
  if (!dateValue) {
    return settings.slotIntervalMinutes || 30;
  }

  const dateOverride = settings.dateSlotIntervals.find(
    (item) => item.date === dateValue,
  )?.slotIntervalMinutes;
  if (dateOverride) return dateOverride;

  if (
    settings.scheduledSlotIntervalMinutes &&
    settings.scheduledSlotIntervalEffectiveFrom &&
    dateValue >= settings.scheduledSlotIntervalEffectiveFrom
  ) {
    return settings.scheduledSlotIntervalMinutes;
  }

  return settings.slotIntervalMinutes ?? 30;
};

/**
 * Resolves the cadence offered to customers without changing the salon agenda
 * grid. A custom cadence is always promoted to a multiple of the effective
 * agenda interval, so every public start remains valid for the selected date.
 */
export const getPublicSlotIntervalForDate = (
  settings: AvailabilitySettings,
  dateValue?: string | null,
) => {
  const agendaInterval = getSlotIntervalForDate(settings, dateValue);

  if (settings.publicSlotIntervalMode === 'follow_agenda') {
    return agendaInterval;
  }

  const minimumInterval = normalizePublicSlotMinimumIntervalMinutes(
    settings.publicSlotMinimumIntervalMinutes,
  );

  return Math.ceil(minimumInterval / agendaInterval) * agendaInterval;
};

export const buildTimeSlots = (startTime = '06:00', endTime = '22:00', interval = 30) => {
  const items: string[] = [];
  let current = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  while (current <= end) {
    items.push(minutesToTime(current));
    current += interval;
  }

  return items;
};

export const buildDisplayTimeSlots = (
  settings: AvailabilitySettings,
  dateValue?: string | null
) => {
  const interval = getSlotIntervalForDate(settings, dateValue);

  if (dateValue) {
    const daySchedule = getWeeklyDaySchedule(settings, dateValue);

    if (!daySchedule.isClosed) {
      const start = timeToMinutes(daySchedule.startTime);
      const end = Math.max(start, timeToMinutes(daySchedule.endTime) - interval);

      return buildTimeSlots(minutesToTime(start), minutesToTime(end), interval);
    }
  }

  const openDays = settings.weeklySchedule.filter((item) => !item.isClosed);

  if (openDays.length === 0) {
    return buildTimeSlots('09:00', '19:00', interval);
  }

  const minStart = Math.min(...openDays.map((item) => timeToMinutes(item.startTime)));
  const maxEnd = Math.max(...openDays.map((item) => timeToMinutes(item.endTime) - interval));

  return buildTimeSlots(
    minutesToTime(minStart),
    minutesToTime(Math.max(maxEnd, minStart)),
    interval
  );
};

/**
 * Preserves the public grid and optionally adds appointment-end candidates.
 * Every candidate still requires the normal availability and server checks.
 * Filtering the full agenda grid preserves the final valid start of the day
 * and keeps date overrides and scheduled agenda interval changes authoritative.
 */
export const buildPublicDisplayTimeSlots = (
  settings: AvailabilitySettings,
  dateValue?: string | null,
  adjacentStarts: readonly string[] = [],
) => {
  const includeAdjacentStarts = (slots: string[]) => {
    if (!dateValue || !adjacentStarts.length) return slots;
    const day = getWeeklyDaySchedule(settings, dateValue);
    if (getDateAvailabilityInfo(settings, dateValue).closed) return slots;
    const start = timeToMinutes(day.startTime), end = timeToMinutes(day.endTime);
    return [...new Set([...slots, ...adjacentStarts.filter(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && timeToMinutes(time) >= start && timeToMinutes(time) < end)])]
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  };
  const agendaSlots = buildDisplayTimeSlots(settings, dateValue);
  const firstAgendaSlot = agendaSlots[0];

  if (!firstAgendaSlot || settings.publicSlotIntervalMode === 'follow_agenda') {
    return includeAdjacentStarts(agendaSlots);
  }

  const publicInterval = getPublicSlotIntervalForDate(settings, dateValue);
  const agendaInterval = getSlotIntervalForDate(settings, dateValue);

  if (publicInterval <= agendaInterval) {
    return includeAdjacentStarts(agendaSlots);
  }

  const anchorMinutes = timeToMinutes(firstAgendaSlot);
  return includeAdjacentStarts(agendaSlots.filter(
    (slotTime) =>
      (timeToMinutes(slotTime) - anchorMinutes) % publicInterval === 0,
  ));
};

/** Candidate starts only: existing availability planners still approve the full service. */
export const getPublicAdjacentAppointmentStarts = (
  appointments: (SharedAppointment & { phaseOperatorAssignments?: ServicePhaseOperatorAssignments })[],
  services: SharedService[],
  date: string,
  operatorId?: string | null,
  operatorName?: string | null,
  settings?: Partial<AvailabilitySettings> | null,
): string[] => {
  const name = (value?: string | null) => value?.trim().toLocaleLowerCase('it') || '';
  return [...new Set(appointments.flatMap(item => {
    if (item.data !== date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.ora)) return [];
    const service = services.find(service => name(service.nome) === name(item.servizio));
    // A saved duration belongs to the appointment, even if the catalogue changed.
    const savedDuration = Number(item.durataMinuti);
    const phaseConfig = normalizeServicePhaseConfig(item.phaseConfig) ??
      (savedDuration > 0 ? undefined : normalizeServicePhaseConfig(service?.phaseConfig));
    const duration = phaseConfig
      ? getPhasedServiceTotalDuration({ phaseConfig })
      : savedDuration > 0 ? savedDuration : Number(service?.durataMinuti);
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const intervals = phaseConfig
      ? getServiceOperatorBusyIntervals({ phaseConfig })
      : [{ startOffsetMinutes: 0, durationMinutes: duration, phase: 'initial' as const }];
    return intervals.flatMap(interval => {
      const boundaryOperator = getServicePhaseOperator({
        assignments: item.phaseOperatorAssignments,
        phase: interval.phase,
        fallbackId: item.operatoreId,
        fallbackName: item.operatoreNome,
      });
      // IDs are authoritative: two operators may share the same display name.
      if (operatorId && boundaryOperator.id) {
        if (operatorId !== boundaryOperator.id) return [];
      } else if (operatorId || operatorName) {
        if (!name(operatorName) || name(operatorName) !== name(boundaryOperator.name)) return [];
      }
      const end = timeToMinutes(item.ora) + interval.startOffsetMinutes +
        interval.durationMinutes + getAppointmentBufferMinutes(settings);
      return Number.isInteger(end) && end < 1440 ? [minutesToTime(end)] : [];
    });
  }))].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
};

export const isItalianHoliday = (dateValue: string) => {
  const date = parseIsoDate(dateValue);
  const year = date.getFullYear();
  const mmdd = dateValue.slice(5);
  const fixedHolidays = new Set([
    '01-01',
    '01-06',
    '04-25',
    '05-01',
    '06-02',
    '08-15',
    '11-01',
    '12-08',
    '12-25',
    '12-26',
  ]);

  if (fixedHolidays.has(mmdd)) return true;

  const easter = getEasterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  };
  const easterIso = toLocalIso(easter);
  const easterMondayIso = toLocalIso(easterMonday);

  return dateValue === easterIso || dateValue === easterMondayIso;
};

export const getWeeklyDaySchedule = (settings: AvailabilitySettings, dateValue: string) => {
  const weekday = parseIsoDate(dateValue).getDay();
  const baseSchedule =
    settings.weeklySchedule.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE[0];
  const dateOverride = getDateOverride(settings, dateValue);
  const overrideStart = dateOverride?.startTime?.trim().slice(0, 5);
  const overrideEnd = dateOverride?.endTime?.trim().slice(0, 5);

  if (overrideStart && overrideEnd) {
    return {
      ...baseSchedule,
      startTime: overrideStart,
      endTime: overrideEnd,
      isClosed: dateOverride?.isClosed ?? baseSchedule.isClosed,
    };
  }

  return baseSchedule;
};

export const getDateOverride = (settings: AvailabilitySettings, dateValue: string) =>
  settings.dateOverrides.find((item) => item.date === dateValue) ?? null;

export const isDateInVacationRanges = (settings: AvailabilitySettings, dateValue: string) =>
  settings.vacationRanges.some(
    (item) => item.startDate <= dateValue && dateValue <= item.endDate
  );

const calendarExceptionMatchesOperator = (
  item: CalendarException,
  options?: {
    selectedOperatorId?: string | null;
    selectedOperatorName?: string | null;
  }
) => {
  if (item.scope === 'salon') return true;

  const selectedOperatorId = String(options?.selectedOperatorId ?? '').trim();
  const selectedOperatorName = String(options?.selectedOperatorName ?? '').trim();
  if (!selectedOperatorId && !selectedOperatorName) return false;

  return (item.operatorIds ?? []).some((operatorId) =>
    doOperatorsMatch({
      selectedOperatorId,
      selectedOperatorName,
      existingOperatorId: operatorId,
      existingOperatorName: '',
    })
  ) || (item.operatorNames ?? []).some((operatorName) =>
    doOperatorsMatch({
      selectedOperatorId,
      selectedOperatorName,
      existingOperatorId: '',
      existingOperatorName: operatorName,
    })
  );
};

export const getMatchingCalendarExceptions = (
  settings: AvailabilitySettings,
  dateValue: string,
  options?: {
    selectedOperatorId?: string | null;
    selectedOperatorName?: string | null;
    includeOperatorScopedWithoutSelection?: boolean;
  }
) =>
  settings.calendarExceptions.filter((item) => {
    if (
      dateValue < item.startDate ||
      (!isOpenEndedCalendarException(item) && dateValue > item.endDate)
    ) {
      return false;
    }
    // Reopening a day removes whole-day closures, not its blocked time ranges.
    // Operator-specific absences remain protected in either case.
    if (
      getDateOverride(settings, dateValue)?.forceOpen &&
      item.scope === 'salon' &&
      item.allDay !== false
    ) {
      return false;
    }
    if (item.scope === 'operators' && options?.includeOperatorScopedWithoutSelection) return true;
    return calendarExceptionMatchesOperator(item, options);
  });

export const doesIntervalOverlapCalendarExceptions = ({
  settings,
  dateValue,
  startTime,
  durationMinutes,
  selectedOperatorId,
  selectedOperatorName,
}: {
  settings: AvailabilitySettings;
  dateValue?: string | null;
  startTime: string;
  durationMinutes: number;
  selectedOperatorId?: string | null;
  selectedOperatorName?: string | null;
}) => {
  if (!dateValue) return false;
  const intervalStart = timeToMinutes(startTime);
  const intervalEnd = intervalStart + Math.max(1, durationMinutes);

  return getMatchingCalendarExceptions(settings, dateValue, {
    selectedOperatorId,
    selectedOperatorName,
  }).some((item) => {
    if (item.allDay) return true;
    const exceptionStart = timeToMinutes(item.startTime ?? '00:00');
    const exceptionEnd = timeToMinutes(item.endTime ?? '00:00');
    return intervalStart < exceptionEnd && intervalEnd > exceptionStart;
  });
};

export const getDateAvailabilityInfo = (settings: AvailabilitySettings, dateValue: string) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const override = getDateOverride(settings, dateValue);

  if (
    getMatchingCalendarExceptions(settings, dateValue).some(
      (item) => item.scope === 'salon' && item.allDay
    )
  ) {
    return { closed: true, reason: 'exception' };
  }

  if (override?.forceOpen) {
    return { closed: false, reason: null as string | null };
  }

  if (override?.closed) {
    return { closed: true, reason: 'manual' };
  }

  if (isDateInVacationRanges(settings, dateValue)) {
    return { closed: true, reason: 'vacation' };
  }

  if (isItalianHoliday(dateValue)) {
    return { closed: true, reason: 'holiday' };
  }

  if (daySchedule.isClosed) {
    return { closed: true, reason: 'weekly' };
  }

  return { closed: false, reason: null as string | null };
};

export const isTimeWithinDaySchedule = (
  settings: AvailabilitySettings,
  dateValue: string,
  timeValue: string
) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const time = timeToMinutes(timeValue);
  return time >= timeToMinutes(daySchedule.startTime) && time < timeToMinutes(daySchedule.endTime);
};

export const doesServiceFitWithinDaySchedule = ({
  settings,
  dateValue,
  startTime,
  durationMinutes,
}: {
  settings: AvailabilitySettings;
  dateValue: string;
  startTime: string;
  durationMinutes: number;
}) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const start = timeToMinutes(startTime);
  const end = start + durationMinutes;

  return (
    start >= timeToMinutes(daySchedule.startTime) &&
    end <= timeToMinutes(daySchedule.endTime)
  );
};

export const isTimeBlockedByLunchBreak = (
  settings: AvailabilitySettings,
  timeValue: string,
  options?: {
    dateValue?: string | null;
    selectedOperatorId?: string | null;
    selectedOperatorName?: string | null;
  }
) => {
  const time = timeToMinutes(timeValue);
  const blockedByLunch = settings.lunchBreakEnabled && (
    time >= timeToMinutes(settings.lunchBreakStart) &&
    time < timeToMinutes(settings.lunchBreakEnd)
  );
  if (blockedByLunch) return true;

  return doesIntervalOverlapCalendarExceptions({
    settings,
    dateValue: options?.dateValue,
    startTime: timeValue,
    durationMinutes: 1,
    selectedOperatorId: options?.selectedOperatorId,
    selectedOperatorName: options?.selectedOperatorName,
  });
};

export const doesServiceOverlapLunchBreak = ({
  settings,
  startTime,
  durationMinutes,
  dateValue,
  selectedOperatorId,
  selectedOperatorName,
}: {
  settings: AvailabilitySettings;
  startTime: string;
  durationMinutes: number;
  dateValue?: string | null;
  selectedOperatorId?: string | null;
  selectedOperatorName?: string | null;
}) => {
  const serviceStart = timeToMinutes(startTime);
  const serviceEnd = serviceStart + durationMinutes;
  const lunchStart = timeToMinutes(settings.lunchBreakStart);
  const lunchEnd = timeToMinutes(settings.lunchBreakEnd);
  const overlapsLunch =
    settings.lunchBreakEnabled && serviceStart < lunchEnd && serviceEnd > lunchStart;

  return overlapsLunch || doesIntervalOverlapCalendarExceptions({
    settings,
    dateValue,
    startTime,
    durationMinutes,
    selectedOperatorId,
    selectedOperatorName,
  });
};

export const doesServiceOperatorWorkOverlapLunchBreak = ({
  settings,
  startTime,
  serviceName,
  services,
  dateValue,
  selectedOperatorId,
  selectedOperatorName,
}: {
  settings: AvailabilitySettings;
  startTime: string;
  serviceName: string;
  services: SharedService[];
  dateValue?: string | null;
  selectedOperatorId?: string | null;
  selectedOperatorName?: string | null;
}) => {
  const service =
    getServiceByName(serviceName, services) ??
    ({
      id: `fallback-${normalizeServiceName(serviceName)}`,
      nome: serviceName,
      prezzo: 0,
      durataMinuti: getServiceDuration(serviceName, services),
    } satisfies SharedService);
  const bookingStart = timeToMinutes(startTime);
  const lunchStart = timeToMinutes(settings.lunchBreakStart);
  const lunchEnd = timeToMinutes(settings.lunchBreakEnd);

  return getServiceOperatorBusyIntervals(service).some((interval) => {
    const phaseStart = bookingStart + interval.startOffsetMinutes;
    const phaseEnd = phaseStart + interval.durationMinutes;
    const phaseOperator = getServicePhaseOperator({
      assignments: service.phaseOperatorAssignments,
      phase: interval.phase,
      fallbackId: selectedOperatorId,
      fallbackName: selectedOperatorName,
    });
    const overlapsLunch =
      settings.lunchBreakEnabled && phaseStart < lunchEnd && phaseEnd > lunchStart;
    return overlapsLunch || doesIntervalOverlapCalendarExceptions({
      settings,
      dateValue,
      startTime: minutesToTime(phaseStart),
      durationMinutes: interval.durationMinutes,
      selectedOperatorId: phaseOperator.id,
      selectedOperatorName: phaseOperator.name,
    });
  });
};

export const isSlotBlockedByOverride = (
  settings: AvailabilitySettings,
  dateValue: string,
  timeValue: string,
  options?: {
    selectedOperatorId?: string | null;
    selectedOperatorName?: string | null;
  }
) =>
  settings.slotOverrides.some(
    (item) => {
      if (item.date !== dateValue || item.time !== timeValue || !item.blocked) {
        return false;
      }

      const overrideOperatorId = item.operatorId?.trim() ?? '';
      const overrideOperatorName = item.operatorName?.trim() ?? '';

      if (!overrideOperatorId && !overrideOperatorName) {
        return true;
      }

      return doOperatorsMatch({
        selectedOperatorId: options?.selectedOperatorId ?? '',
        selectedOperatorName: options?.selectedOperatorName ?? '',
        existingOperatorId: overrideOperatorId,
        existingOperatorName: overrideOperatorName,
      });
    }
  );

export const getServiceDuration = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  const service = services.find((item) => normalizeServiceName(item.nome) === normalized);
  return getPhasedServiceTotalDuration(service, 60);
};

export const getServiceByName = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  return services.find((item) => normalizeServiceName(item.nome) === normalized) ?? null;
};

// Saved appointment timing is authoritative even after the catalogue changes.
const getAppointmentBusyService = (
  appointment: Pick<SharedAppointment, 'servizio' | 'durataMinuti' | 'phaseConfig'>,
  services: SharedService[]
) => {
  if (appointment.phaseConfig) {
    return { durataMinuti: appointment.durataMinuti, phaseConfig: appointment.phaseConfig };
  }
  if (
    typeof appointment.durataMinuti === 'number' &&
    Number.isFinite(appointment.durataMinuti) &&
    appointment.durataMinuti > 0
  ) {
    return { durataMinuti: appointment.durataMinuti };
  }
  return getServiceByName(appointment.servizio, services) ?? { durataMinuti: 60 };
};

export const doesServiceBookingConflictWithAppointment = ({
  startTime,
  serviceName,
  appointment,
  services,
  settings,
  phaseConfig,
}: {
  startTime: string;
  serviceName: string;
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'> & {
    phaseConfig?: ServicePhaseConfig;
  };
  services: SharedService[];
  settings?: AvailabilitySettings | null;
  phaseConfig?: ServicePhaseConfig;
}) => {
  const requestedService = phaseConfig
    ? { durataMinuti: getPhasedServiceTotalDuration({ phaseConfig }), phaseConfig }
    : getServiceByName(serviceName, services);
  const existingService = getAppointmentBusyService(appointment, services);

  return doRelativeBusyIntervalsOverlap({
    firstStartMinutes: timeToMinutes(startTime),
    firstIntervals: getServiceOperatorBusyIntervals(
      requestedService ?? { durataMinuti: getServiceDuration(serviceName, services) }
    ),
    secondStartMinutes: timeToMinutes(appointment.ora),
    secondIntervals: getServiceOperatorBusyIntervals(existingService),
    bufferMinutes: getAppointmentBufferMinutes(settings),
  });
};

export const getServiceRequiredMachineryIds = (
  serviceName: string,
  services: SharedService[]
) => {
  void serviceName;
  void services;
  return [];
};

export const getAppointmentMachineryIds = (
  appointment: Pick<SharedAppointment, 'servizio' | 'macchinarioIds'>,
  services: SharedService[]
) => {
  void appointment;
  void services;
  return [];
};

export const doesAppointmentBlockRequiredMachinery = ({
  selectedServiceName,
  appointment,
  services,
}: {
  selectedServiceName: string;
  appointment: Pick<SharedAppointment, 'servizio' | 'macchinarioIds'>;
  services: SharedService[];
}) => {
  void selectedServiceName;
  void appointment;
  void services;
  return false;
};

export const doesServiceUseOperators = (
  serviceName: string,
  services: SharedService[],
  explicitRole?: string | null
) => {
  const service = getServiceByName(serviceName, services);
  const requestedRole = explicitRole?.trim() || service?.mestiereRichiesto || '';
  return normalizeRoleName(requestedRole) !== '';
};

const buildPublicServiceOperatorKey = (
  service: Pick<SharedService, 'id' | 'nome' | 'mestiereRichiesto'>
) => {
  const normalizedName = service.nome.trim().toLowerCase();
  const normalizedRole = normalizeRoleName(service.mestiereRichiesto ?? '');
  return normalizedName ? `${normalizedName}::${normalizedRole}` : service.id.trim();
};

export const isOperatorEnabledForPublicService = (
  operator: SharedOperator,
  service: SharedService
) => {
  if (operator.publicServiceMode !== 'selected') {
    return true;
  }

  const selectedIds = new Set(
    (operator.publicServiceIds ?? []).map((item) => item.trim()).filter(Boolean)
  );
  const selectedKeys = new Set(
    (operator.publicServiceKeys ?? []).map((item) => item.trim()).filter(Boolean)
  );

  return (
    selectedIds.has(service.id.trim()) || selectedKeys.has(buildPublicServiceOperatorKey(service))
  );
};

/**
 * A selected-service policy is an explicit capability grant. This is more
 * precise than the operator's primary role and intentionally allows a salon
 * to certify a cross-role service or a combo without changing that primary
 * role. In all-role mode the primary role remains the capability boundary.
 */
export const doesOperatorHaveServiceCapability = (
  operator: SharedOperator,
  service: SharedService,
  explicitRole?: string | null
) => {
  if (operator.publicServiceMode === 'selected') {
    return isOperatorEnabledForPublicService(operator, service);
  }

  const requiredRole = normalizeRoleName(
    explicitRole?.trim() || service.mestiereRichiesto || ''
  );
  return !!requiredRole && normalizeRoleName(operator.mestiere) === requiredRole;
};

export const getEligibleOperatorsForService = ({
  serviceName,
  explicitRole,
  services,
  operators,
  appointmentDate,
  settings,
}: {
  serviceName: string;
  explicitRole?: string | null;
  services: SharedService[];
  operators: SharedOperator[];
  appointmentDate?: string;
  settings?: AvailabilitySettings | null;
}) => {
  if (operators.length === 0) return [];

  const service = getServiceByName(serviceName, services);
  const requiredRole = normalizeRoleName(explicitRole?.trim() || service?.mestiereRichiesto || '');

  if (!requiredRole) return [];

  return operators.filter((item) => {
    if (!service || !doesOperatorHaveServiceCapability(item, service, explicitRole)) {
      return false;
    }

    if (appointmentDate) {
      return isOperatorAvailableOnDate(item, appointmentDate, settings);
    }

    return true;
  });
};

/**
 * Customer-facing alias. The hard capability filter already lives in the
 * shared resolver so Agenda, drag, compositions and public booking agree.
 */
export const getPublicEligibleOperatorsForService = ({
  serviceName,
  explicitRole,
  services,
  operators,
  appointmentDate,
  settings,
}: {
  serviceName: string;
  explicitRole?: string | null;
  services: SharedService[];
  operators: SharedOperator[];
  appointmentDate?: string;
  settings?: AvailabilitySettings | null;
}) => {
  const service = getServiceByName(serviceName, services);
  if (!service) return [];

  return getEligibleOperatorsForService({
    serviceName,
    explicitRole,
    services,
    operators,
    appointmentDate,
    settings,
  }).filter((operator) => isOperatorEnabledForPublicService(operator, service));
};

export const assignFallbackOperatorsToAppointments = ({
  appointments,
  services,
  operators,
  settings,
  preserveExplicitOperatorAssignments = false,
}: {
  appointments: SharedAppointment[];
  services: SharedService[];
  operators: SharedOperator[];
  settings?: AvailabilitySettings | null;
  preserveExplicitOperatorAssignments?: boolean;
}) => {
  if (appointments.length === 0 || operators.length === 0) {
    return appointments;
  }

  const assignedByDateAndOperator = new Map<string, Map<string, SharedAppointment[]>>();
  const normalizedAppointments = appointments
    .slice()
    .sort((first, second) => {
      const firstDate = first.data ?? getTodayDateString();
      const secondDate = second.data ?? getTodayDateString();
      const dateCompare = compareDefaultStrings(firstDate, secondDate);
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = compareDefaultStrings(first.ora, second.ora);
      if (timeCompare !== 0) return timeCompare;
      return compareDefaultStrings(first.id, second.id);
    });

  const getAssignedPool = (dateValue: string, operatorId: string) => {
    let perDate = assignedByDateAndOperator.get(dateValue);
    if (!perDate) {
      perDate = new Map<string, SharedAppointment[]>();
      assignedByDateAndOperator.set(dateValue, perDate);
    }

    const existing = perDate.get(operatorId) ?? [];
    if (!perDate.has(operatorId)) {
      perDate.set(operatorId, existing);
    }

    return existing;
  };

  const registerAssignedAppointment = (
    dateValue: string,
    operatorId: string,
    appointment: SharedAppointment
  ) => {
    const pool = getAssignedPool(dateValue, operatorId);
    pool.push(appointment);
  };

  const getAssignedLoadForOperator = (dateValue: string, operatorId: string) =>
    getAssignedPool(dateValue, operatorId).reduce((total, item) => {
      const duration =
        typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(item.servizio, services);
      return total + Math.max(duration, 0);
    }, 0);

  return normalizedAppointments.map((appointment) => {
    const dateValue = appointment.data ?? getTodayDateString();
    const existingOperatorId = appointment.operatoreId?.trim() ?? '';
    const existingOperatorName = appointment.operatoreNome?.trim() ?? '';
    const hasExplicitNonSalonOperator =
      (!!existingOperatorId && !isSalonCapacityOperatorId(existingOperatorId)) ||
      !!existingOperatorName;
    const usesOperatorsForAppointment = doesServiceUseOperators(
      appointment.servizio,
      services,
      appointment.mestiereRichiesto
    );

    if (!usesOperatorsForAppointment) {
      if (existingOperatorId) {
        registerAssignedAppointment(dateValue, existingOperatorId, appointment);
      }
      return appointment;
    }

    const compatibleOperators = getEligibleOperatorsForService({
      serviceName: appointment.servizio,
      explicitRole: appointment.mestiereRichiesto,
      services,
      operators,
      appointmentDate: dateValue,
      settings,
    }).slice();

    if (compatibleOperators.length === 0) {
      return appointment;
    }

    const existingCompatibleOperator = compatibleOperators.find((operator) => {
      const operatorId = operator.id.trim();
      const operatorName = operator.nome.trim().toLowerCase();

      if (existingOperatorId && !isSalonCapacityOperatorId(existingOperatorId)) {
        return operatorId === existingOperatorId;
      }

      if (existingOperatorName) {
        return operatorName === existingOperatorName.toLowerCase();
      }

      return false;
    });

    if (existingCompatibleOperator) {
      const resolvedAppointment = {
        ...appointment,
        operatoreId: existingCompatibleOperator.id.trim(),
        operatoreNome: existingCompatibleOperator.nome.trim(),
      };

      registerAssignedAppointment(dateValue, existingCompatibleOperator.id.trim(), resolvedAppointment);
      return resolvedAppointment;
    }

    if (preserveExplicitOperatorAssignments && hasExplicitNonSalonOperator) {
      if (existingOperatorId) {
        registerAssignedAppointment(dateValue, existingOperatorId, appointment);
      }

      return appointment;
    }

    const normalizedExistingOperatorName = existingOperatorName.toLowerCase();
    compatibleOperators.sort((first, second) => {
      const firstMatchesName =
        normalizedExistingOperatorName !== '' &&
        first.nome.trim().toLowerCase() === normalizedExistingOperatorName;
      const secondMatchesName =
        normalizedExistingOperatorName !== '' &&
        second.nome.trim().toLowerCase() === normalizedExistingOperatorName;

      if (firstMatchesName !== secondMatchesName) {
        return firstMatchesName ? -1 : 1;
      }

      const firstName = first.nome.trim().toLowerCase();
      const secondName = second.nome.trim().toLowerCase();
      const nameCompare = compareDefaultStrings(firstName, secondName);
      if (nameCompare !== 0) return nameCompare;
      return compareDefaultStrings(first.id.trim(), second.id.trim());
    });

    const appointmentDuration =
      typeof appointment.durataMinuti === 'number'
        ? appointment.durataMinuti
        : getServiceDuration(appointment.servizio, services);

    const selectedOperator = compatibleOperators
      .filter((operator) => {
        const operatorId = operator.id.trim();
        if (!operatorId) return false;

        return !getAssignedPool(dateValue, operatorId).some((existingAppointment) =>
          doesTimeRangeConflictWithAppointment({
            startTime: appointment.ora,
            durationMinutes: appointmentDuration,
            appointment: existingAppointment,
            services,
            settings,
          })
        );
      })
      .sort((first, second) => {
        const firstId = first.id.trim();
        const secondId = second.id.trim();
        const firstLoad = getAssignedLoadForOperator(dateValue, firstId);
        const secondLoad = getAssignedLoadForOperator(dateValue, secondId);

        if (firstLoad !== secondLoad) {
          return firstLoad - secondLoad;
        }

        const firstCount = getAssignedPool(dateValue, firstId).length;
        const secondCount = getAssignedPool(dateValue, secondId).length;
        if (firstCount !== secondCount) {
          return firstCount - secondCount;
        }

        const firstName = first.nome.trim().toLowerCase();
        const secondName = second.nome.trim().toLowerCase();
        const nameCompare = compareDefaultStrings(firstName, secondName);
        if (nameCompare !== 0) return nameCompare;
        return compareDefaultStrings(firstId, secondId);
      })[0];

    if (!selectedOperator) {
      return appointment;
    }

    const resolvedAppointment = {
      ...appointment,
      operatoreId: selectedOperator.id.trim(),
      operatoreNome: selectedOperator.nome.trim(),
    };

    registerAssignedAppointment(dateValue, selectedOperator.id.trim(), resolvedAppointment);
    return resolvedAppointment;
  });
};

export const getAppointmentEndTime = (
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'>,
  services: SharedService[]
) => {
  const duration =
    typeof appointment.durataMinuti === 'number'
      ? appointment.durataMinuti
      : getServiceDuration(appointment.servizio, services);

  return minutesToTime(timeToMinutes(appointment.ora) + duration);
};

export const doesTimeRangeConflictWithAppointment = ({
  startTime,
  durationMinutes,
  appointment,
  services,
  settings,
}: {
  startTime: string;
  durationMinutes: number;
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti' | 'phaseConfig'>;
  services: SharedService[];
  settings?: AvailabilitySettings | null;
}) => {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  const bufferMinutes = getAppointmentBufferMinutes(settings);
  const appointmentStart = timeToMinutes(appointment.ora);
  const appointmentService = getAppointmentBusyService(appointment, services);

  return getServiceOperatorBusyIntervals(appointmentService).some((interval) => {
    const existingStart = appointmentStart + interval.startOffsetMinutes - bufferMinutes;
    const existingEnd =
      appointmentStart + interval.startOffsetMinutes + interval.durationMinutes + bufferMinutes;
    return newStart < existingEnd && newEnd > existingStart;
  });
};

export type ManualAcceptanceOperatorOption = {
  operator: SharedOperator;
  available: boolean;
};

export const getManualAcceptanceOperatorOptions = ({
  request,
  durationMinutes,
  services,
  operators,
  appointments,
  bookingRequests,
  settings,
}: {
  request: {
    id: string;
    data: string;
    ora: string;
    servizio: string;
    mestiereRichiesto?: string;
    operatoreId?: string;
    operatoreNome?: string;
    phaseConfig?: ServicePhaseConfig;
    phaseOperatorAssignments?: ServicePhaseOperatorAssignments;
    nome?: string;
    cognome?: string;
  };
  durationMinutes: number;
  services: SharedService[];
  operators: SharedOperator[];
  appointments: SharedAppointment[];
  bookingRequests: {
    id: string;
    data: string;
    ora: string;
    servizio: string;
    durataMinuti?: number;
    operatoreId?: string;
    operatoreNome?: string;
    phaseConfig?: ServicePhaseConfig;
    phaseOperatorAssignments?: ServicePhaseOperatorAssignments;
    stato?: string;
  }[];
  settings?: AvailabilitySettings | null;
}): ManualAcceptanceOperatorOption[] => {
  const compatibleOperators = getEligibleOperatorsForService({
    serviceName: request.servizio,
    explicitRole: request.mestiereRichiesto,
    services,
    operators,
    appointmentDate: request.data,
    settings,
  });

  return compatibleOperators.map((operator) => {
    const doesOperatorConflictWithItem = (item: {
      ora: string;
      servizio: string;
      durataMinuti?: number;
      operatoreId?: string;
      operatoreNome?: string;
      phaseConfig?: ServicePhaseConfig;
      phaseOperatorAssignments?: ServicePhaseOperatorAssignments;
    }) => {
      const targetStart = timeToMinutes(request.ora);
      const targetEnd = targetStart + durationMinutes;
      const bufferMinutes = getAppointmentBufferMinutes(settings);
      const itemStart = timeToMinutes(item.ora);
      const itemService = getAppointmentBusyService(item, services);

      return getServiceOperatorBusyIntervals(itemService).some((interval) => {
        const existingStart = itemStart + interval.startOffsetMinutes - bufferMinutes;
        const existingEnd =
          itemStart + interval.startOffsetMinutes + interval.durationMinutes + bufferMinutes;
        if (targetStart >= existingEnd || targetEnd <= existingStart) {
          return false;
        }

        const rawPhaseOperator = item.phaseOperatorAssignments?.[interval.phase];
        const hasExplicitPhaseOperator = !!(
          rawPhaseOperator?.id?.trim() ||
          rawPhaseOperator?.name?.trim() ||
          item.operatoreId?.trim() ||
          item.operatoreNome?.trim()
        );
        if (!hasExplicitPhaseOperator) {
          return true;
        }

        const phaseOperator = getServicePhaseOperator({
          assignments: item.phaseOperatorAssignments,
          phase: interval.phase,
          fallbackId: item.operatoreId,
          fallbackName: item.operatoreNome,
        });
        return doOperatorsMatch({
          selectedOperatorId: operator.id,
          selectedOperatorName: operator.nome,
          existingOperatorId: phaseOperator.id,
          existingOperatorName: phaseOperator.name,
        });
      });
    };

    const operatorHasAppointmentConflict = appointments.some((appointment) => {
      if ((appointment.data ?? request.data) !== request.data) {
        return false;
      }
      return doesOperatorConflictWithItem(appointment);
    });

    const operatorHasRequestConflict = bookingRequests.some((otherRequest) => {
      if (
        otherRequest.id === request.id ||
        otherRequest.data !== request.data ||
        !['In attesa', 'Accettata', 'pending', 'accepted'].includes(
          otherRequest.stato ?? ''
        )
      ) {
        return false;
      }
      return doesOperatorConflictWithItem(otherRequest);
    });

    return {
      operator,
      available: !operatorHasAppointmentConflict && !operatorHasRequestConflict,
    };
  });
};

export const doesAppointmentOccupySlot = (
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti' | 'phaseConfig'>,
  slotTime: string,
  services: SharedService[]
) => {
  const appointmentStartMinutes = timeToMinutes(appointment.ora);
  const slotMinutes = timeToMinutes(slotTime);
  const appointmentService = getAppointmentBusyService(appointment, services);

  return getServiceOperatorBusyIntervals(appointmentService).some((interval) => {
    const intervalStart = appointmentStartMinutes + interval.startOffsetMinutes;
    const intervalEnd = intervalStart + interval.durationMinutes;
    return slotMinutes >= intervalStart && slotMinutes < intervalEnd;
  });
};

export const findConflictingAppointment = ({
  appointmentDate,
  startTime,
  serviceName,
  appointments,
  services,
  settings,
  operatorId,
  operatorName,
  useOperators = false,
}: {
  appointmentDate: string;
  startTime: string;
  serviceName: string;
  appointments: SharedAppointment[];
  services: SharedService[];
  settings?: AvailabilitySettings | null;
  operatorId?: string | null;
  operatorName?: string | null;
  useOperators?: boolean;
}) => {
  const nextUsesOperatorCapacity = useOperators;

  return (
    appointments.find((item) => {
      if ((item.data ?? getTodayDateString()) !== appointmentDate) return false;

      const existingOperatorId = item.operatoreId?.trim() ?? '';
      const existingOperatorName = item.operatoreNome?.trim() ?? '';
      const existingUsesOperatorCapacity =
        !isSalonCapacityOperatorId(existingOperatorId) &&
        !!(existingOperatorId || existingOperatorName) &&
        doesServiceUseOperators(item.servizio, services, item.mestiereRichiesto);

      if (nextUsesOperatorCapacity) {
        if (!existingUsesOperatorCapacity) {
          return false;
        }

        const existingHasExplicitOperator =
          !!(item.operatoreId?.trim() ?? '') || !!(item.operatoreNome?.trim() ?? '');

        if (
          existingHasExplicitOperator &&
          !doOperatorsMatch({
            selectedOperatorId: operatorId,
            selectedOperatorName: operatorName,
            existingOperatorId: item.operatoreId,
            existingOperatorName: item.operatoreNome,
          })
        ) {
          return false;
        }
      } else if (existingUsesOperatorCapacity) {
        return false;
      }

      return doesServiceBookingConflictWithAppointment({
        startTime,
        serviceName,
        appointment: item,
        services,
        settings,
      });
    }) ?? null
  );
};
