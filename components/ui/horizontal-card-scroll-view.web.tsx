import React, { forwardRef, useCallback, useRef } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { WebHorizontalScrollRail } from './web-horizontal-scroll-rail';

export const HorizontalCardScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function HorizontalCardScrollView({ children, style, ...props }, forwardedRef) {
    const host = useRef<ScrollView | null>(null);
    const setRef = useCallback((node: ScrollView | null) => {
      host.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);
    return <View style={{ width: '100%', minWidth: 0, flexShrink: 0 }}>
      <ScrollView {...props} ref={setRef} style={[style, { flexGrow: 0, flexShrink: 0 }]} showsHorizontalScrollIndicator={false}>{children}</ScrollView>
      <WebHorizontalScrollRail hostRef={host} />
    </View>;
  },
);
