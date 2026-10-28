import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Native badge marquee; fitting labels remain ordinary, stationary text. */
export function NativeOverflowBadgeText({ text, textStyle }: { text: string; textStyle: StyleProp<TextStyle> }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ text: '', width: 0 });
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const textWidth = measurement.text === text ? measurement.width : 0;
  const overflowing = viewportWidth > 0 && textWidth > viewportWidth + 2;
  const moving = overflowing && !reduceMotion && active;
  const gap = 24;
  const measuredWidth = Math.ceil(textWidth) + 2;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const appState = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { mounted = false; motion.remove(); appState.remove(); };
  }, []);

  useFocusEffect(useCallback(() => {
    translateX.setValue(0);
    if (!moving) return;
    const distance = measuredWidth + gap;
    const travelMs = Math.max(5500, distance * 32);
    const pauseMs = 1200;
    const pauseFraction = pauseMs / (pauseMs + travelMs);
    const animation = Animated.loop(Animated.timing(translateX, {
      toValue: -distance,
      duration: pauseMs + travelMs,
      easing: progress => progress <= pauseFraction ? 0 : (progress - pauseFraction) / (1 - pauseFraction),
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); translateX.setValue(0); };
  }, [moving, measuredWidth, translateX]));

  return (
    <View accessible accessibilityLabel={text} pointerEvents="none" style={styles.viewport}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}>
      <Text key={text} accessible={false} importantForAccessibility="no-hide-descendants"
        allowFontScaling={false} numberOfLines={1} style={[textStyle, styles.measure]}
        onTextLayout={event => {
          const width = event.nativeEvent.lines[0]?.width ?? 0;
          if (width > 0) setMeasurement(previous => previous.text === text && Math.abs(previous.width - width) < 0.5 ? previous : { text, width });
        }}>{text}</Text>
      <Text accessible={false} importantForAccessibility="no-hide-descendants" allowFontScaling={false}
        numberOfLines={1} style={[textStyle, moving && styles.invisible]}>{text}</Text>
      {moving ? (
        <Animated.View accessible={false} importantForAccessibility="no-hide-descendants"
          style={[styles.track, { width: measuredWidth * 2 + gap, transform: [{ translateX }] }]}>
          <Text accessible={false} allowFontScaling={false} numberOfLines={1} style={[textStyle, { width: measuredWidth }]}>{text}</Text>
          <Text accessible={false} allowFontScaling={false} numberOfLines={1} style={[textStyle, { width: measuredWidth, marginLeft: gap }]}>{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, top: 0, width: 10000, opacity: 0 },
  invisible: { opacity: 0 },
  track: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center' },
});
