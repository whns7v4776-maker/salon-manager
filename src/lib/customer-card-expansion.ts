/** Page-scoped presentation state. Only the toggled card is notified. */
export function createCustomerCardExpansionStore() {
  const expandedIds = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    isExpanded: (id: string) => expandedIds.has(id),
    toggle(id: string) {
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      listeners.get(id)?.forEach(notify => notify());
    },
    subscribe(id: string, notify: () => void) {
      const subscriptions = listeners.get(id) ?? new Set<() => void>();
      subscriptions.add(notify);
      listeners.set(id, subscriptions);
      return () => {
        subscriptions.delete(notify);
        if (!subscriptions.size) listeners.delete(id);
      };
    },
  };
}
export type CustomerCardExpansionStore = ReturnType<typeof createCustomerCardExpansionStore>;
