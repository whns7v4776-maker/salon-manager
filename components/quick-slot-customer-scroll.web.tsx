import React, { Children, useState } from 'react';
import { View, type ScrollViewProps } from 'react-native';
import { HorizontalCardScrollView } from './ui/horizontal-card-scroll-view';

// Small web windows use one horizontal row; wider windows use at most three.
// Both keep the ranked order and the separate, persistent scroll rail.
export function QuickSlotCustomerScroll({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  const [width, setWidth] = useState(0);
  const count = Children.count(children);
  const visibleColumns = Math.max(1, Math.floor(((width || 760) + 8) / 152));
  const columns = width > 0 && width < 600
    ? Math.max(1, count)
    : Math.max(1, Math.min(count, visibleColumns), Math.ceil(count / 3));
  return <View style={{ width: '100%', minWidth: 0 }} onLayout={event => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth(previous => previous === next ? previous : next);
  }}>
    <HorizontalCardScrollView {...props} horizontal
      testID="quick-slot-customers-scroll"
      contentContainerStyle={[contentContainerStyle, {
        display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(144px, 1fr))`,
        gridAutoFlow: 'row', gridAutoRows: '1fr',
        width: '100%', minWidth: columns * 152 - 8,
        gap: 8, paddingHorizontal: 0, paddingVertical: 4, alignItems: 'stretch',
      } as any]}>{children}</HorizontalCardScrollView>
  </View>;
}
