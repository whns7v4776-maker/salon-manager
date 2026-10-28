import React from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type AccessibilityRole, type LayoutChangeEvent, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { useAccessAppearance } from '../access-premium';
import { skeletonTheme } from './skeleton-theme';

const SHIMMER_WIDTH = 84;
const sharedProgress = new Animated.Value(0);
let sharedAnimation: Animated.CompositeAnimation | null = null;
let activeSkeletonCount = 0;
const retainSharedAnimation = () => {
  activeSkeletonCount += 1;
  if (sharedAnimation) return;
  sharedProgress.setValue(0);
  sharedAnimation = Animated.loop(Animated.timing(sharedProgress, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
  sharedAnimation.start();
};
const releaseSharedAnimation = () => {
  activeSkeletonCount = Math.max(0, activeSkeletonCount - 1);
  if (activeSkeletonCount > 0) return;
  sharedAnimation?.stop(); sharedAnimation = null; sharedProgress.stopAnimation();
};

/** Neutral satin placeholders share one animation and preserve the final content's geometry. */
export function SkeletonShimmer({ accessibilityLabel, accessibilityRole, children, style }: {
  accessibilityLabel?: string; accessibilityRole?: AccessibilityRole; children?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useAccessAppearance();
  const tone = skeletonTheme(palette);
  const reducedMotion = useReducedMotion();
  const gradientId = `skeleton-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [measuredWidth, setMeasuredWidth] = React.useState(184);
  const accessible = Boolean(accessibilityLabel || accessibilityRole);
  React.useEffect(() => { if (reducedMotion) return; retainSharedAnimation(); return releaseSharedAnimation; }, [reducedMotion]);
  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0) setMeasuredWidth(current => current === nextWidth ? current : nextWidth);
  }, []);
  return <View pointerEvents="none" accessible={accessible} accessibilityElementsHidden={!accessible}
    accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole} accessibilityState={accessible ? { busy: true } : undefined}
    importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'} onLayout={handleLayout}
    {...(Platform.OS === 'web' ? { dataSet: { premiumSkeleton: 'true' } } : {})}
    style={[{ overflow: 'hidden', borderRadius: 10 }, style, { backgroundColor: tone.fill, borderColor: tone.border, borderWidth: 0, shadowOpacity: 0, elevation: 0, opacity: 1 }]}>
    {children}
    {!reducedMotion ? <Animated.View pointerEvents="none" {...(Platform.OS === 'web' ? { dataSet: { premiumSkeletonSheen: 'true' } } : {})}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SHIMMER_WIDTH, transform: [{ translateX: sharedProgress.interpolate({ inputRange: [0, 1], outputRange: [-SHIMMER_WIDTH, measuredWidth + SHIMMER_WIDTH] }) }] }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs><LinearGradient id={gradientId} x1="0%" x2="100%"><Stop stopColor={tone.sheen} stopOpacity={0} /><Stop offset="0.5" stopColor={tone.sheen} stopOpacity={tone.sheenOpacity} /><Stop offset="1" stopColor={tone.sheen} stopOpacity={0} /></LinearGradient></Defs>
        <Rect width="100" height="100" fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View> : null}
  </View>;
}

export function SkeletonSurface({ style, ...props }: ViewProps) {
  const { palette } = useAccessAppearance();
  const tone = skeletonTheme(palette);
  return <View {...props} style={[style, { backgroundColor: tone.surface, borderColor: tone.border, borderWidth: 1, borderRadius: 20, shadowOpacity: 0, elevation: 0 }]} />;
}
