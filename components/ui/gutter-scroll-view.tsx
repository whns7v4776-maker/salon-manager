import React, { forwardRef, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import {useAccessAppearance} from '../access-premium';
import { QuickSlotTimeScroll } from '../quick-slot-time-scroll';

/** A separate white rail keeps the indicator outside form fields on every platform. */
export const GutterScrollView = forwardRef<ScrollView, ScrollViewProps & { thin?: boolean; wideWebRail?: boolean; themed?: boolean }>(
  function GutterScrollView({
    style,
    themed = false,
    thin = false,
    wideWebRail = false,
    children,
    onLayout,
    onContentSizeChange,
    onScroll,
    scrollEventThrottle = 16,
    ...props
  }, ref) {
    const {palette} = useAccessAppearance();
    const [viewportHeight, setViewportHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const offset = useRef(new Animated.Value(0)).current;
    const railHeight = Math.max(0, viewportHeight - 12);
    const scrollable = contentHeight > viewportHeight + 1 && railHeight > 0;
    const thumbHeight = Math.min(railHeight, Math.max(36, railHeight * viewportHeight / Math.max(1, contentHeight)));
    const translateY = offset.interpolate({
      inputRange: [0, Math.max(1, contentHeight - viewportHeight)],
      outputRange: [0, Math.max(0, railHeight - thumbHeight)],
      extrapolate: 'clamp',
    });

    if (Platform.OS === 'web' && wideWebRail) {
      return <QuickSlotTimeScroll {...props} ref={ref}
        style={[style, { marginRight: 0 }]}
        integrated railWidth={14} railLabel="Scorri Prenota slot"
        onLayout={onLayout} onContentSizeChange={onContentSizeChange}
        onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>{children}</QuickSlotTimeScroll>;
    }

    return (
      <View style={[styles.container, style, themed && {backgroundColor:'transparent'}]}>
        <ScrollView
          {...props}
          ref={ref}
          style={[styles.scroll, thin && styles.scrollThin]}
          showsVerticalScrollIndicator={false}
          persistentScrollbar={false}
          scrollEventThrottle={scrollEventThrottle}
          onLayout={(event) => {
            setViewportHeight(event.nativeEvent.layout.height);
            onLayout?.(event);
          }}
          onContentSizeChange={(width, height) => {
            setContentHeight(height);
            onContentSizeChange?.(width, height);
          }}
          onScroll={(event) => {
            offset.setValue(event.nativeEvent.contentOffset.y);
            onScroll?.(event);
          }}
        >
          {children}
        </ScrollView>
        {scrollable && (
          <View pointerEvents="none" accessible={false} style={[styles.rail, themed && {backgroundColor:palette.line}, thin && styles.railThin, { height: railHeight }]}>
            <Animated.View style={[styles.thumb, themed && {backgroundColor:palette.muted}, thin && styles.thumbThin, { height: thumbHeight, transform: [{ translateY }] }]} />
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, position: 'relative', backgroundColor: '#FFFFFF' },
  scroll: { flex: 1, minHeight: 0, marginRight: 16 },
  scrollThin: { marginRight: 10 },
  railThin: { width: 3, right: 2 },
  thumbThin: { width: 3 },
  rail: { position: 'absolute', right: 3, top: 6, width: 6, borderRadius: 3, backgroundColor: '#EEF1F4' },
  thumb: { width: 6, borderRadius: 3, backgroundColor: '#7B8591' },
});
