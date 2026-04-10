export type SharedService = {
  id: string;
  nome: string;
  prezzo: number;
  prezzoOriginale?: number;
  scontoValidoDal?: string;
  scontoValidoAl?: string;
  durataMinuti?: number;
  mestiereRichiesto?: string;
  macchinarioIds?: string[];
};

export type SharedOperator = {
  id: string;
  nome: string;
  mestiere: string;
  availability?: OperatorAvailability;
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
  data?: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
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

export type DateOverride = {
  date: string;
  forceOpen?: boolean;
  closed?: boolean;
};

export type SlotOverride = {
  date: string;
  time: string;
  blocked: boolean;
};

export type AvailabilitySettings = {
  weeklySchedule: WeeklyScheduleDay[];
  vacationRanges: VacationRange[];
  dateOverrides: DateOverride[];
  slotOverrides: SlotOverride[];
  dateSlotIntervals: { date: string; slotIntervalMinutes: number }[];
  slotIntervalMinutes: number;
  weekVisibleDays: number;
  appointmentBufferEnabled: boolean;
  appointmentBufferMinutes: number;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
  guidedSlotsEnabled: boolean;
  guidedSlotsStrategy: 'balanced' | 'protect_long_services' | 'fill_gaps';
  guidedSlotsVisibility: 'recommended_first' | 'recommended_only';
};

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

export const buildSalonCapacityOperatorId = (serviceName: string, services: SharedService[]) => {
  const service = getServiceByName(serviceName, services);
  const normalizedRole = normalizeRoleName(service?.mestiereRichiesto ?? '');
  const normalizedServiceName = normalizeServiceName(service?.nome ?? serviceName);
  const capacityKey = normalizedRole || normalizedServiceName || 'salon';
  return `${SALON_CAPACITY_OPERATOR_ID_PREFIX}${capacityKey}`;
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

export const isOperatorAvailableOnDate = (
  operator: Pick<SharedOperator, 'availability'> | null | undefined,
  dateValue: string,
  settings?: AvailabilitySettings | null
) => {
  if (settings && getDateAvailabilityInfo(settings, dateValue).closed) {
    return false;
  }

  const availability = operator?.availability;
  if (!availability) return true;

  const weekday = parseIsoDate(dateValue).getDay();
  const enabledWeekdays = availability.enabledWeekdays?.length
    ? availability.enabledWeekdays
    : ALL_WEEKDAYS;

  if (!enabledWeekdays.includes(weekday)) {
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
    settings.slotIntervalMinutes >= 15 &&
    settings.slotIntervalMinutes <= 300 &&
    settings.slotIntervalMinutes % 15 === 0
      ? settings.slotIntervalMinutes
      : 30;

  const normalizedWeekVisibleDays =
    typeof settings?.weekVisibleDays === 'number' &&
    settings.weekVisibleDays >= 1 &&
    settings.weekVisibleDays <= 7
      ? Math.round(settings.weekVisibleDays)
      : 7;

  const normalizedAppointmentBufferMinutes =
    typeof settings?.appointmentBufferMinutes === 'number' &&
    settings.appointmentBufferMinutes >= 5 &&
    settings.appointmentBufferMinutes <= 30 &&
    settings.appointmentBufferMinutes % 5 === 0
      ? settings.appointmentBufferMinutes
      : 5;

  return {
    weeklySchedule,
    vacationRanges: (settings?.vacationRanges ?? []).map((item) => ({
      ...item,
      label: item.label ?? '',
    })),
    dateOverrides: settings?.dateOverrides ?? [],
    slotOverrides: settings?.slotOverrides ?? [],
    dateSlotIntervals: (settings?.dateSlotIntervals ?? []).filter(
      (item) =>
        typeof item?.date === 'string' &&
        typeof item?.slotIntervalMinutes === 'number' &&
        item.slotIntervalMinutes >= 15 &&
        item.slotIntervalMinutes <= 300 &&
        item.slotIntervalMinutes % 15 === 0
    ),
    slotIntervalMinutes: normalizedSlotInterval,
    weekVisibleDays: normalizedWeekVisibleDays,
    appointmentBufferEnabled: settings?.appointmentBufferEnabled ?? false,
    appointmentBufferMinutes: normalizedAppointmentBufferMinutes,
    lunchBreakEnabled: settings?.lunchBreakEnabled ?? false,
    lunchBreakStart: settings?.lunchBreakStart ?? '13:00',
    lunchBreakEnd: settings?.lunchBreakEnd ?? '14:00',
    guidedSlotsEnabled: settings?.guidedSlotsEnabled ?? false,
    guidedSlotsStrategy:
      settings?.guidedSlotsStrategy === 'protect_long_services' ||
      settings?.guidedSlotsStrategy === 'fill_gaps'
        ? settings.guidedSlotsStrategy
        : 'balanced',
    guidedSlotsVisibility:
      settings?.guidedSlotsVisibility === 'recommended_only'
        ? 'recommended_only'
        : 'recommended_first',
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

  return (
    settings.dateSlotIntervals.find((item) => item.date === dateValue)?.slotIntervalMinutes ??
    settings.slotIntervalMinutes ??
    30
  );
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
  const openDays = settings.weeklySchedule.filter((item) => !item.isClosed);
  const interval = getSlotIntervalForDate(settings, dateValue);

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
  return (
    settings.weeklySchedule.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE[0]
  );
};

export const getDateOverride = (settings: AvailabilitySettings, dateValue: string) =>
  settings.dateOverrides.find((item) => item.date === dateValue) ?? null;

export const isDateInVacationRanges = (settings: AvailabilitySettings, dateValue: string) =>
  settings.vacationRanges.some(
    (item) => item.startDate <= dateValue && dateValue <= item.endDate
  );

export const getDateAvailabilityInfo = (settings: AvailabilitySettings, dateValue: string) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const override = getDateOverride(settings, dateValue);

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
  timeValue: string
) => {
  if (!settings.lunchBreakEnabled) return false;
  const time = timeToMinutes(timeValue);
  return (
    time >= timeToMinutes(settings.lunchBreakStart) &&
    time < timeToMinutes(settings.lunchBreakEnd)
  );
};

export const doesServiceOverlapLunchBreak = ({
  settings,
  startTime,
  durationMinutes,
}: {
  settings: AvailabilitySettings;
  startTime: string;
  durationMinutes: number;
}) => {
  if (!settings.lunchBreakEnabled) return false;

  const serviceStart = timeToMinutes(startTime);
  const serviceEnd = serviceStart + durationMinutes;
  const lunchStart = timeToMinutes(settings.lunchBreakStart);
  const lunchEnd = timeToMinutes(settings.lunchBreakEnd);

  return serviceStart < lunchEnd && serviceEnd > lunchStart;
};

export const isSlotBlockedByOverride = (
  settings: AvailabilitySettings,
  dateValue: string,
  timeValue: string
) =>
  settings.slotOverrides.some(
    (item) => item.date === dateValue && item.time === timeValue && item.blocked
  );

export const getServiceDuration = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  return (
    services.find((item) => normalizeServiceName(item.nome) === normalized)?.durataMinuti ?? 60
  );
};

export const getServiceByName = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  return services.find((item) => normalizeServiceName(item.nome) === normalized) ?? null;
};

const normalizeStringIdArray = (items?: string[] | null) =>
  Array.isArray(items)
    ? items
        .map((item) => item?.trim() ?? '')
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
    : [];

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
  services: SharedService[]
) => {
  const service = getServiceByName(serviceName, services);
  return normalizeRoleName(service?.mestiereRichiesto ?? '') !== '';
};

export const getEligibleOperatorsForService = ({
  serviceName,
  services,
  operators,
  appointmentDate,
  settings,
}: {
  serviceName: string;
  services: SharedService[];
  operators: SharedOperator[];
  appointmentDate?: string;
  settings?: AvailabilitySettings | null;
}) => {
  if (operators.length === 0) return [];

  const service = getServiceByName(serviceName, services);
  const requiredRole = normalizeRoleName(service?.mestiereRichiesto ?? '');

  if (!requiredRole) return [];

  return operators.filter((item) => {
    if (normalizeRoleName(item.mestiere) !== requiredRole) {
      return false;
    }

    if (appointmentDate) {
      return isOperatorAvailableOnDate(item, appointmentDate, settings);
    }

    return true;
  });
};

export const assignFallbackOperatorsToAppointments = ({
  appointments,
  services,
  operators,
  settings,
}: {
  appointments: SharedAppointment[];
  services: SharedService[];
  operators: SharedOperator[];
  settings?: AvailabilitySettings | null;
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
      const dateCompare = firstDate.localeCompare(secondDate);
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = first.ora.localeCompare(second.ora);
      if (timeCompare !== 0) return timeCompare;
      return first.id.localeCompare(second.id);
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

  return normalizedAppointments.map((appointment) => {
    const dateValue = appointment.data ?? getTodayDateString();
    const existingOperatorId = appointment.operatoreId?.trim() ?? '';
    const existingOperatorName = appointment.operatoreNome?.trim() ?? '';
    const usesOperatorsForAppointment = doesServiceUseOperators(appointment.servizio, services);

    if (!usesOperatorsForAppointment) {
      if (existingOperatorId) {
        registerAssignedAppointment(dateValue, existingOperatorId, appointment);
      }
      return appointment;
    }

    const compatibleOperators = getEligibleOperatorsForService({
      serviceName: appointment.servizio,
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
      const nameCompare = firstName.localeCompare(secondName);
      if (nameCompare !== 0) return nameCompare;
      return first.id.trim().localeCompare(second.id.trim());
    });

    const appointmentDuration =
      typeof appointment.durataMinuti === 'number'
        ? appointment.durataMinuti
        : getServiceDuration(appointment.servizio, services);

    const selectedOperator = compatibleOperators.find((operator) => {
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
    });

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
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'>;
  services: SharedService[];
  settings?: AvailabilitySettings | null;
}) => {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  const bufferMinutes = getAppointmentBufferMinutes(settings);
  const existingStart = timeToMinutes(appointment.ora) - bufferMinutes;
  const existingEnd =
    timeToMinutes(appointment.ora) +
    (typeof appointment.durataMinuti === 'number'
      ? appointment.durataMinuti
      : getServiceDuration(appointment.servizio, services)) +
    bufferMinutes;

  return newStart < existingEnd && newEnd > existingStart;
};

export const doesAppointmentOccupySlot = (
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'>,
  slotTime: string,
  services: SharedService[]
) => {
  const start = timeToMinutes(appointment.ora);
  const end =
    start +
    (typeof appointment.durataMinuti === 'number'
      ? appointment.durataMinuti
      : getServiceDuration(appointment.servizio, services));
  const slot = timeToMinutes(slotTime);

  return slot >= start && slot < end;
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
  const durationMinutes = getServiceDuration(serviceName, services);
  const nextUsesOperatorCapacity = useOperators;

  return (
    appointments.find((item) => {
      if ((item.data ?? getTodayDateString()) !== appointmentDate) return false;

      const existingOperatorId = item.operatoreId?.trim() ?? '';
      const existingOperatorName = item.operatoreNome?.trim() ?? '';
      const existingUsesOperatorCapacity =
        !isSalonCapacityOperatorId(existingOperatorId) &&
        !!(existingOperatorId || existingOperatorName) &&
        doesServiceUseOperators(item.servizio, services);

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

      return doesTimeRangeConflictWithAppointment({
        startTime,
        durationMinutes,
        appointment: item,
        services,
        settings,
      });
    }) ?? null
  );
};
