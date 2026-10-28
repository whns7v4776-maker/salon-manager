import React, { memo, useCallback, useSyncExternalStore } from 'react';
import type { CustomerCardExpansionStore } from '../src/lib/customer-card-expansion';

type Props<T extends { id: string }> = {
  item: T;
  expansion: CustomerCardExpansionStore;
  renderCard: (item: T, expanded: boolean, toggleExpanded: () => void) => React.ReactNode;
};

/** No native view or gesture wrapper: preserves the existing card tree. */
function CustomerCardRenderBoundary<T extends { id: string }>({ item, expansion, renderCard }: Props<T>) {
  const subscribe = useCallback((notify: () => void) => expansion.subscribe(item.id, notify), [expansion, item.id]);
  const getSnapshot = useCallback(() => expansion.isExpanded(item.id), [expansion, item.id]);
  const toggleExpanded = useCallback(() => expansion.toggle(item.id), [expansion, item.id]);
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return renderCard(item, expanded, toggleExpanded);
}
export const CustomerCardBoundary = memo(CustomerCardRenderBoundary) as typeof CustomerCardRenderBoundary;
