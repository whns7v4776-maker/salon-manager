export type ServiceLinkConfig = {
  version: 1;
  requiredServiceIds: string[];
  suggestedServiceIds: string[];
  clientChoiceRequired?: boolean;
  dependencyMode?: 'automatic' | 'choice';
};

export type ServiceDependencyMode = 'automatic' | 'choice';

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))
  );
};

export const normalizeServiceLinkConfig = (
  value: unknown
): ServiceLinkConfig | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const requiredServiceIds = normalizeIds(candidate.requiredServiceIds);
  const requiredSet = new Set(requiredServiceIds);
  const suggestedServiceIds = normalizeIds(candidate.suggestedServiceIds).filter(
    (item) => !requiredSet.has(item)
  );
  if (requiredServiceIds.length === 0 && suggestedServiceIds.length === 0) {
    return undefined;
  }

  const explicitMode =
    candidate.dependencyMode === 'automatic' || candidate.dependencyMode === 'choice'
      ? candidate.dependencyMode
      : null;
  const configuredDependencyMode: ServiceDependencyMode =
    explicitMode ??
    (candidate.clientChoiceRequired === true && suggestedServiceIds.length > 0
      ? 'choice'
      : 'automatic');
  const choiceServiceIds =
    suggestedServiceIds.length > 0 ? suggestedServiceIds : requiredServiceIds;
  const dependencyMode: ServiceDependencyMode =
    configuredDependencyMode === 'choice' && choiceServiceIds.length === 1
      ? 'automatic'
      : configuredDependencyMode;
  const automaticServiceId = requiredServiceIds[0] ?? choiceServiceIds[0];

  if (dependencyMode === 'automatic' && !automaticServiceId) return undefined;
  if (dependencyMode === 'choice' && choiceServiceIds.length === 0) return undefined;

  return {
    version: 1,
    requiredServiceIds: dependencyMode === 'automatic' ? [automaticServiceId] : [],
    suggestedServiceIds: dependencyMode === 'choice' ? choiceServiceIds : [],
    clientChoiceRequired: dependencyMode === 'choice',
    dependencyMode,
  };
};

export const resolveServiceDependencyMode = (
  value: unknown
): ServiceDependencyMode | null =>
  normalizeServiceLinkConfig(value)?.dependencyMode ?? null;
