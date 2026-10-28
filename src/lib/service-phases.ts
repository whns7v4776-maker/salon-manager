export type ServicePhaseConfig = {
  version: 1;
  mode: 'phased';
  initialLabel: string;
  initialDurationMinutes: number;
  processingLabel: string;
  processingDurationMinutes: number;
  finalPhaseEnabled?: boolean;
  finalServiceId?: string;
  finalServiceName: string;
  finalDurationMinutes: number;
  sameOperator: boolean;
  allowFrontendSplitOperators: boolean;
};

export type ServicePhaseOperator = {
  id?: string;
  name: string;
};

export type ServicePhaseOperatorAssignments = {
  version: 1;
  initial: ServicePhaseOperator;
  final: ServicePhaseOperator;
};

export type ServicePhaseOverlapOverrides = {
  version: 1;
  initial?: boolean;
  final?: boolean;
};

export type ServiceWithPhaseConfig = {
  durataMinuti?: number | null;
  phaseConfig?: ServicePhaseConfig | null;
};

export type RelativeBusyInterval = {
  startOffsetMinutes: number;
  durationMinutes: number;
  phase: 'initial' | 'final';
};

const clampPhaseMinutes = (value: unknown, fallback: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(5, Math.min(480, Math.round(numericValue / 5) * 5));
};

const clampProcessingMinutes = (value: unknown, fallback: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  if (numericValue <= 0) return 0;
  return Math.max(5, Math.min(480, Math.round(numericValue / 5) * 5));
};

export const normalizeServicePhaseConfig = (
  value: unknown
): ServicePhaseConfig | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<ServicePhaseConfig> & Record<string, unknown>;
  if (candidate.mode !== 'phased') {
    return undefined;
  }

  const hasExplicitFinalDuration =
    candidate.finalDurationMinutes !== undefined &&
    candidate.finalDurationMinutes !== null &&
    String(candidate.finalDurationMinutes).trim() !== '';
  const explicitFinalDuration = Number(candidate.finalDurationMinutes);
  const finalPhaseEnabled =
    candidate.finalPhaseEnabled !== false &&
    (!hasExplicitFinalDuration ||
      (Number.isFinite(explicitFinalDuration) && explicitFinalDuration > 0));
  const finalServiceName = String(candidate.finalServiceName ?? '').trim();
  if (finalPhaseEnabled && !finalServiceName) {
    return undefined;
  }

  return {
    version: 1,
    mode: 'phased',
    initialLabel: String(candidate.initialLabel ?? 'Lavorazione iniziale').trim() ||
      'Lavorazione iniziale',
    initialDurationMinutes: clampPhaseMinutes(candidate.initialDurationMinutes, 30),
    processingLabel: String(candidate.processingLabel ?? 'Tempo di posa').trim() ||
      'Tempo di posa',
    processingDurationMinutes: clampProcessingMinutes(
      candidate.processingDurationMinutes,
      30
    ),
    finalPhaseEnabled,
    finalServiceId: finalPhaseEnabled
      ? String(candidate.finalServiceId ?? '').trim() || undefined
      : undefined,
    finalServiceName: finalPhaseEnabled ? finalServiceName : '',
    finalDurationMinutes: finalPhaseEnabled
      ? clampPhaseMinutes(candidate.finalDurationMinutes, 30)
      : 0,
    sameOperator: candidate.sameOperator !== false,
    allowFrontendSplitOperators: candidate.allowFrontendSplitOperators !== false,
  };
};

const normalizePhaseOperator = (value: unknown): ServicePhaseOperator | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.name ?? '').trim();
  const id = String(candidate.id ?? '').trim();
  if (!name && !id) return undefined;
  return { id: id || undefined, name: name || 'Operatore' };
};

export const normalizeServicePhaseOperatorAssignments = (
  value: unknown
): ServicePhaseOperatorAssignments | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const initial = normalizePhaseOperator(candidate.initial);
  const final = normalizePhaseOperator(candidate.final);
  if (!initial || !final) return undefined;
  return { version: 1, initial, final };
};

export const normalizeServicePhaseOverlapOverrides = (
  value: unknown
): ServicePhaseOverlapOverrides | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const initial = candidate.initial === true;
  const final = candidate.final === true;
  if (!initial && !final) return undefined;
  return { version: 1, initial: initial || undefined, final: final || undefined };
};

export const getServicePhaseOperator = ({
  assignments,
  phase,
  fallbackId,
  fallbackName,
}: {
  assignments?: ServicePhaseOperatorAssignments | null;
  phase: 'initial' | 'final';
  fallbackId?: string | null;
  fallbackName?: string | null;
}): ServicePhaseOperator => {
  const normalized = normalizeServicePhaseOperatorAssignments(assignments);
  const selected = normalized?.[phase];
  const fallbackOperatorId = String(fallbackId ?? '').trim();
  const fallbackOperatorName = String(fallbackName ?? '').trim();
  return {
    id: selected?.id ?? (fallbackOperatorId || undefined),
    name: selected?.name ?? (fallbackOperatorName || 'Salone'),
  };
};

export const isPhasedService = (service?: ServiceWithPhaseConfig | null) =>
  normalizeServicePhaseConfig(service?.phaseConfig) !== undefined;

export const getPhasedServiceTotalDuration = (
  service?: ServiceWithPhaseConfig | null,
  fallback = 60
) => {
  const phaseConfig = normalizeServicePhaseConfig(service?.phaseConfig);
  if (!phaseConfig) {
    return Math.max(5, Number(service?.durataMinuti) || fallback);
  }

  return (
    phaseConfig.initialDurationMinutes +
    phaseConfig.processingDurationMinutes +
    phaseConfig.finalDurationMinutes
  );
};

export const getServiceOperatorBusyIntervals = (
  service?: ServiceWithPhaseConfig | null
): RelativeBusyInterval[] => {
  const phaseConfig = normalizeServicePhaseConfig(service?.phaseConfig);
  if (!phaseConfig) {
    return [
      {
        startOffsetMinutes: 0,
        durationMinutes: Math.max(5, Number(service?.durataMinuti) || 60),
        phase: 'initial',
      },
    ];
  }

  const intervals: RelativeBusyInterval[] = [
    {
      startOffsetMinutes: 0,
      durationMinutes: phaseConfig.initialDurationMinutes,
      phase: 'initial',
    },
  ];

  if (phaseConfig.finalPhaseEnabled !== false) {
    intervals.push({
      startOffsetMinutes:
        phaseConfig.initialDurationMinutes + phaseConfig.processingDurationMinutes,
      durationMinutes: phaseConfig.finalDurationMinutes,
      phase: 'final',
    });
  }

  return intervals;
};

/**
 * Builds the operator-work intervals for services that must run one after the
 * other (dependencies and composed services). Processing/pose time advances
 * the customer timeline but never becomes operator work by itself.
 */
export const getSequentialServicesOperatorBusyIntervals = (
  services: readonly (ServiceWithPhaseConfig | null | undefined)[]
): RelativeBusyInterval[] => {
  let serviceStartOffsetMinutes = 0;
  const intervals: RelativeBusyInterval[] = [];

  services.forEach((service) => {
    if (!service) return;

    getServiceOperatorBusyIntervals(service).forEach((interval) => {
      intervals.push({
        ...interval,
        startOffsetMinutes: serviceStartOffsetMinutes + interval.startOffsetMinutes,
      });
    });
    serviceStartOffsetMinutes += getPhasedServiceTotalDuration(service, 60);
  });

  return intervals;
};

export const getServiceProcessingInterval = (service?: ServiceWithPhaseConfig | null) => {
  const phaseConfig = normalizeServicePhaseConfig(service?.phaseConfig);
  if (!phaseConfig || phaseConfig.processingDurationMinutes <= 0) return null;

  return {
    startOffsetMinutes: phaseConfig.initialDurationMinutes,
    durationMinutes: phaseConfig.processingDurationMinutes,
  };
};

export const doRelativeBusyIntervalsOverlap = ({
  firstStartMinutes,
  firstIntervals,
  secondStartMinutes,
  secondIntervals,
  bufferMinutes = 0,
}: {
  firstStartMinutes: number;
  firstIntervals: RelativeBusyInterval[];
  secondStartMinutes: number;
  secondIntervals: RelativeBusyInterval[];
  bufferMinutes?: number;
}) =>
  firstIntervals.some((first) => {
    const firstStart = firstStartMinutes + first.startOffsetMinutes;
    const firstEnd = firstStart + first.durationMinutes;

    return secondIntervals.some((second) => {
      const secondStart = secondStartMinutes + second.startOffsetMinutes - bufferMinutes;
      const secondEnd =
        secondStartMinutes + second.startOffsetMinutes + second.durationMinutes + bufferMinutes;
      return firstStart < secondEnd && firstEnd > secondStart;
    });
  });
