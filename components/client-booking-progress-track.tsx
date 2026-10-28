import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAccessAppearance } from './access-premium';

/** A directional cue only appears after the current choice is complete; it never navigates. */
export function ClientBookingProgressTrack({ page, count, canContinue, large }: { page: number; count: number; canContinue: boolean; large: boolean }) {
  const { palette: p } = useAccessAppearance();
  const [width, setWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReducedMotion(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { alive = false; listener.remove(); };
  }, []);
  const animate = canContinue && page < count - 1 && !reducedMotion && width > 0;
  useEffect(() => {
    progress.setValue(0);
    if (!animate) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(500),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animate, page, progress]);
  const segment = width / Math.max(1, count - 1);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={{ position: 'absolute', left: `${50 / count}%`, right: `${50 / count}%`, top: large ? 25 : 21, height: large ? 5 : 4, borderRadius: 3, backgroundColor: p.line, borderWidth: 1, borderColor: p.border, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${page * 100 / Math.max(1, count - 1)}%`, backgroundColor: p.action, opacity: .7 }} />
    {animate ? <View style={{ position: 'absolute', left: `${page * 100 / Math.max(1, count - 1)}%`, width: segment, top: 0, bottom: 0, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: -1, bottom: -1, width: Math.max(32, segment * .45), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-segment * .5, segment] }) }] }}>
        <Svg width="100%" height="100%"><Defs><LinearGradient id="booking-neon-cue" x1="0%" y1="0%" x2="100%" y2="0%"><Stop offset="0" stopColor={p.action} stopOpacity="0" /><Stop offset="0.35" stopColor={p.action} stopOpacity=".75" /><Stop offset="0.58" stopColor={p.night ? '#FFF3DA' : '#B69A68'} stopOpacity="1" /><Stop offset="0.7" stopColor={p.action} stopOpacity=".9" /><Stop offset="1" stopColor={p.action} stopOpacity="0" /></LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#booking-neon-cue)" /></Svg>
      </Animated.View>
    </View> : null}
  </View>;
}
