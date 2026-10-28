import {
  normalizeServicePhaseConfig,
  type ServicePhaseConfig,
} from './service-phases';

export type CustomerServiceDurationOverride = {
  serviceId: string;
  durationMinutes?: number;
  phaseConfig?: ServicePhaseConfig;
};

export type CustomerServiceDurationOverrideMap = Record<
  string,
  CustomerServiceDurationOverride
>;

const normalizeMinutes = (value: unknown) => {
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes >= 5 && minutes <= 480
    ? Math.round(minutes / 5) * 5
    : undefined;
};

export const normalizeCustomerServiceDurationOverride = (
  value: unknown,
  fallbackServiceId = ''
): CustomerServiceDurationOverride | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const serviceId = String(candidate.serviceId ?? fallbackServiceId).trim();
  if (!serviceId) return null;

  const durationMinutes = normalizeMinutes(candidate.durationMinutes);
  const phaseConfig = normalizeServicePhaseConfig(candidate.phaseConfig);
  if (!durationMinutes && !phaseConfig) return null;

  return {
    serviceId,
    ...(durationMinutes ? { durationMinutes } : {}),
    ...(phaseConfig ? { phaseConfig } : {}),
  };
};

export const normalizeCustomerServiceDurationOverrides = (
  value: unknown
): CustomerServiceDurationOverrideMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<
    CustomerServiceDurationOverrideMap
  >((result, [serviceId, rawOverride]) => {
    const normalized = normalizeCustomerServiceDurationOverride(rawOverride, serviceId);
    if (normalized) result[normalized.serviceId] = normalized;
    return result;
  }, {});
};

export const getCustomerServiceDurationOverride = (
  overrides: CustomerServiceDurationOverrideMap | null | undefined,
  serviceId: string | null | undefined
) => {
  const normalizedServiceId = serviceId?.trim() ?? '';
  if (!normalizedServiceId) return null;
  return normalizeCustomerServiceDurationOverride(
    overrides?.[normalizedServiceId],
    normalizedServiceId
  );
};

export const resolveCustomerServiceTiming = ({
  serviceId,
  defaultDurationMinutes,
  defaultPhaseConfig,
  overrides,
}: {
  serviceId: string;
  defaultDurationMinutes: number;
  defaultPhaseConfig?: ServicePhaseConfig | null;
  overrides?: CustomerServiceDurationOverrideMap | null;
}) => {
  const normalizedDefaultPhase = normalizeServicePhaseConfig(defaultPhaseConfig);
  const override = getCustomerServiceDurationOverride(overrides, serviceId);
  const phaseConfig = override?.phaseConfig ?? normalizedDefaultPhase;
  const durationMinutes = phaseConfig
    ? phaseConfig.initialDurationMinutes +
      phaseConfig.processingDurationMinutes +
      (phaseConfig.finalPhaseEnabled === false ? 0 : phaseConfig.finalDurationMinutes)
    : override?.durationMinutes ?? Math.max(5, Math.round(defaultDurationMinutes));

  return {
    durationMinutes,
    phaseConfig: phaseConfig ?? null,
    customized: !!override,
  };
};

