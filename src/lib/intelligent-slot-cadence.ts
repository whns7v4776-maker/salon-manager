import { getAppointmentBufferMinutes, type AvailabilitySettings, type SharedService } from './booking';
import { getPhasedServiceTotalDuration, normalizeServicePhaseConfig } from './service-phases';
import { normalizeServiceLinkConfig } from './service-compositions';

type CatalogService = SharedService & { soloComposizione?: boolean };

/** Initial customer cadence only; the agenda grid and manual choices stay independent. */
export function getIntelligentPublicSlotMinimum(
  services: CatalogService[],
  settings: AvailabilitySettings,
): number | null {
  const byId = new Map(services.map(service => [service.id, service]));
  const timings: number[] = [];
  const partsOf = (service: CatalogService, ancestors = new Set<string>()): number[] | null => {
    if (ancestors.has(service.id)) return null;
    const nextAncestors = new Set(ancestors).add(service.id);
    if (service.compositionId && service.compositionItems?.length) {
      const parts: number[] = [];
      for (const item of service.compositionItems) {
        const child = byId.get(item.serviceId);
        if (!child) return null;
        const override = item.durationOverrideMinutes;
        const childParts = typeof override === 'number' && Number.isFinite(override) && override > 0
          ? [override] : partsOf(child, nextAncestors);
        if (!childParts) return null;
        parts.push(...childParts);
      }
      return parts;
    }
    const duration = getPhasedServiceTotalDuration(service, 60);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const phases = normalizeServicePhaseConfig(service.phaseConfig);
    // Phase boundaries also matter when different operators can reuse the pause.
    return phases ? [duration, phases.initialDurationMinutes, phases.processingDurationMinutes,
      phases.finalDurationMinutes].filter(value => value > 0) : [duration];
  };
  for (const service of services) {
    if (service.disponibileOnline === false || service.soloComposizione || !service.nome.trim()) continue;
    const parts = partsOf(service);
    if (!parts) continue;
    const link = normalizeServiceLinkConfig(service.linkedServiceConfig);
    if (link) {
      const ids = link.dependencyMode === 'automatic' ? link.requiredServiceIds : link.suggestedServiceIds;
      const dependencies = ids.filter(id => id !== service.id).map(id => byId.get(id))
        .filter((item): item is CatalogService => !!item && item.disponibileOnline !== false)
        .map(item => partsOf(item)).filter((item): item is number[] => !!item);
      if (!dependencies.length) continue;
      timings.push(...dependencies.flat());
    }
    timings.push(...parts);
  }
  if (!timings.length) return null;
  const buffer = getAppointmentBufferMinutes(settings);
  if (buffer > 0) timings.push(buffer);
  // Legacy non-multiples cannot be represented by the existing five-minute setting.
  if (timings.some(value => !Number.isInteger(value) || value % 5 !== 0)) return 5;
  const gcd = (a: number, b: number): number => { while (b) [a, b] = [b, a % b]; return a; };
  const common = timings.reduce(gcd);
  for (let step = Math.min(300, common); step >= 5; step -= 5) {
    if (step % 5 === 0 && common % step === 0) return step;
  }
  return 5;
}

export function activateIntelligentGuidedSlots(current: AvailabilitySettings, services: CatalogService[]) {
  const minimum = getIntelligentPublicSlotMinimum(services, current);
  return {
    ...current,
    guidedSlotsEnabled: true,
    guidedSlotsStrategy: 'intelligent' as const,
    guidedSlotsVisibility: 'recommended_and_all' as const,
    ...(minimum === null ? {} : {
      publicSlotIntervalMode: 'custom' as const,
      publicSlotMinimumIntervalMinutes: minimum,
      publicSlotIntervalUpdatedAt: new Date().toISOString(),
    }),
  };
}
