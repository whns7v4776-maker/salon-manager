import {normalizeServicePhaseConfig} from './service-phases';

type CompositionService = {disponibileOnline?: boolean; phaseConfig?: unknown};
export type CompositionOnlineEligibility = {online: boolean; reasons: string[]};

/** Mirrors the current composition editor and save_service_composition_v2 restrictions. */
export function getCompositionOnlineEligibility(
  services: readonly CompositionService[],
  pauses: readonly number[] = [],
): CompositionOnlineEligibility {
  const reasons: string[] = [];
  if (services.some(service => service.disponibileOnline === false)) {
    reasons.push('Servizio non disponibile online.');
  }
  if (services.some(service => !!normalizeServicePhaseConfig(service.phaseConfig))) {
    reasons.push('Servizio con tempo di posa.');
  }
  if (pauses.some(minutes => minutes > 0)) {
    reasons.push('Posa presente tra le fasi.');
  }
  return {online: reasons.length === 0, reasons};
}
