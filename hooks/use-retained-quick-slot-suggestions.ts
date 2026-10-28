import { useLayoutEffect, useRef } from 'react';

const EMPTY_SUGGESTIONS: never[] = [];

/** null means recalculating; an empty array is a completed, empty result. */
export function useRetainedQuickSlotSuggestions<T>(
  result: T[] | null,
  scopeKey: string | null,
  enabled: boolean,
): T[] {
  const committed = useRef<{ scopeKey: string; items: T[] } | null>(null);

  useLayoutEffect(() => {
    if (!enabled || scopeKey === null) {
      committed.current = null;
    } else if (result !== null) {
      committed.current = { scopeKey, items: result };
    } else if (committed.current?.scopeKey !== scopeKey) {
      committed.current = null;
    }
  }, [enabled, result, scopeKey]);

  // Retain only committed results for this customer/day. The caller disables
  // their actions while pending; they are presentation, never booking input.
  return result ?? (
    enabled && scopeKey !== null && committed.current?.scopeKey === scopeKey
      ? committed.current.items
      : EMPTY_SUGGESTIONS
  );
}
