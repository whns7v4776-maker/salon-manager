export const AGENDA_DENSITY_IDS = [
  'massima',
  'panorama',
  'compatta',
  'comoda',
  'normale',
] as const;

export type AgendaDensityId = (typeof AGENDA_DENSITY_IDS)[number];

export const AGENDA_DENSITY_SURFACES = ['app', 'web'] as const;

export type AgendaDensitySurface =
  (typeof AGENDA_DENSITY_SURFACES)[number];

export const DEFAULT_AGENDA_DENSITY_ID_BY_SURFACE: Readonly<
  Record<AgendaDensitySurface, AgendaDensityId>
> = {
  app: 'massima',
  web: 'normale',
};

export const getDefaultAgendaDensityId = (
  surface: AgendaDensitySurface,
): AgendaDensityId => DEFAULT_AGENDA_DENSITY_ID_BY_SURFACE[surface];

export const normalizeAgendaDensityId = (
  value: unknown,
): AgendaDensityId | null => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return AGENDA_DENSITY_IDS.includes(normalized as AgendaDensityId)
    ? (normalized as AgendaDensityId)
    : null;
};

export type AgendaDensityPreferenceSource = 'default' | 'local' | 'remote';

export type AgendaDensityPreference = {
  workspaceId: string;
  surface: AgendaDensitySurface;
  densityId: AgendaDensityId;
  source: AgendaDensityPreferenceSource;
  hasExplicitSelection: boolean;
  pendingRemoteSync: boolean;
  updatedAt?: string;
};

export type AgendaDensityPreferenceResult = {
  ok: boolean;
  surface: AgendaDensitySurface;
  densityId: AgendaDensityId;
  source: AgendaDensityPreferenceSource;
  pendingRemoteSync: boolean;
  updatedAt?: string;
  error?: string;
};
