import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useAccessAppearance } from '../../components/access-premium';
import { skeletonTheme } from '../../components/ui/skeleton-theme';
import { SkeletonShimmer } from '../../components/ui/skeleton-shimmer';

const OwnerStartupLoadingContext = React.createContext(false);

export function OwnerStartupLoadingProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <OwnerStartupLoadingContext.Provider value={active}>
      {children}
    </OwnerStartupLoadingContext.Provider>
  );
}

export function useOwnerStartupLoading() {
  return React.useContext(OwnerStartupLoadingContext);
}

export function OwnerStartupSkeletonPulse({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useAccessAppearance();
  const tone = skeletonTheme(palette);
  const original = StyleSheet.flatten(style);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[style, original?.backgroundColor && { backgroundColor: tone.surface, borderColor: tone.border, shadowOpacity: 0, elevation: 0 }]}
    >
      {children}
    </View>
  );
}

export function OwnerStartupSkeletonItem({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonShimmer style={style} />;
}
