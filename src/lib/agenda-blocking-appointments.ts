type SelectAgendaBlockingItemsOptions<T> = {
  items: readonly T[];
  getBaseSyncKey: (item: T) => string;
  isSynthetic: (item: T) => boolean;
  getSyntheticPriority: (item: T) => number;
};

/**
 * Keeps every authoritative appointment row, even when two real rows share
 * the same visible slot identity. Only request projections are deduplicated by
 * that identity, and they disappear once the authoritative row is available.
 */
export const selectAgendaBlockingItems = <T>({
  items,
  getBaseSyncKey,
  isSynthetic,
  getSyntheticPriority,
}: SelectAgendaBlockingItemsOptions<T>): T[] => {
  const authoritativeItems: T[] = [];
  const authoritativeBaseSyncKeys = new Set<string>();
  const syntheticItemsByBaseSyncKey = new Map<string, T>();
  const itemsWithoutBaseKey: T[] = [];

  items.forEach((item) => {
    const baseSyncKey = getBaseSyncKey(item);
    if (!baseSyncKey) {
      itemsWithoutBaseKey.push(item);
      return;
    }

    if (!isSynthetic(item)) {
      authoritativeItems.push(item);
      authoritativeBaseSyncKeys.add(baseSyncKey);
      syntheticItemsByBaseSyncKey.delete(baseSyncKey);
      return;
    }

    if (authoritativeBaseSyncKeys.has(baseSyncKey)) {
      return;
    }

    const existingItem = syntheticItemsByBaseSyncKey.get(baseSyncKey);
    if (
      !existingItem ||
      getSyntheticPriority(item) > getSyntheticPriority(existingItem)
    ) {
      syntheticItemsByBaseSyncKey.set(baseSyncKey, item);
    }
  });

  return [
    ...itemsWithoutBaseKey,
    ...authoritativeItems,
    ...Array.from(syntheticItemsByBaseSyncKey.entries())
      .filter(([baseSyncKey]) => !authoritativeBaseSyncKeys.has(baseSyncKey))
      .map(([, item]) => item),
  ];
};

type ResolveAgendaStableLaneOptions = {
  currentLaneKey?: string | null;
  previousLaneKey?: string | null;
  availableLaneKeys: ReadonlySet<string>;
  hasExplicitOperator: boolean;
};

export const resolveAgendaStableLaneKey = ({
  currentLaneKey,
  previousLaneKey,
  availableLaneKeys,
  hasExplicitOperator,
}: ResolveAgendaStableLaneOptions): string => {
  const current = currentLaneKey?.trim() ?? '';
  const previous = previousLaneKey?.trim() ?? '';

  // A persisted operator assignment is authoritative. A visual-stability
  // cache must never pin that appointment to a previous operator lane.
  if (hasExplicitOperator && current) {
    return current;
  }

  if (previous && availableLaneKeys.has(previous)) {
    return previous;
  }

  return current;
};

// A moved persisted appointment supersedes its accepted request mirror even
// when that mirror still carries the previous date/time during reconciliation.
export const excludePersistedAgendaRequestMirrors = <T extends {
  id: string;
  bookingRequestId?: string;
  syntheticRequestId?: string;
  syntheticRequestStatus?: string;
}>(items: readonly T[]): T[] => {
  const persisted = items.filter(item => !item.syntheticRequestId);
  const requestIds = new Set(persisted.map(item => item.bookingRequestId?.trim()).filter(Boolean));
  const localMirrorIds = new Set(persisted.map(item => `owner-booking-${item.id}`));
  return items.filter(item => {
    const requestId = item.syntheticRequestId?.trim();
    return !requestId || item.syntheticRequestStatus !== 'Accettata' ||
      (!requestIds.has(requestId) && !localMirrorIds.has(requestId));
  });
};
