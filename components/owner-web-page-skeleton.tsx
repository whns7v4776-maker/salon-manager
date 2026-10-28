import React from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { AccessBackdrop } from './access-premium';
import { SkeletonShimmer, SkeletonSurface } from './ui/skeleton-shimmer';

/** Page geometry stays stable while the existing authoritative-data gate is pending. */
export function OwnerWebPageSkeleton({ active }: { active: boolean }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || !active) return null;
  const desktop = width >= 1000;
  return <View accessibilityRole="progressbar" accessibilityLabel="Caricamento della pagina" accessibilityState={{ busy: true }} style={{ position: 'absolute', left: desktop ? 224 : 0, right: 0, top: 0, bottom: 0, zIndex: 8, overflow: 'hidden' }}>
    <AccessBackdrop />
    <ScrollView contentContainerStyle={{ padding: width < 700 ? 22 : 38, gap: 20, minHeight: height }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}><SkeletonShimmer style={{ width: '40%', height: 30, borderRadius: 8 }} /><SkeletonShimmer style={{ width: 36, height: 36, borderRadius: 12 }} /></View>
      <SkeletonShimmer style={{ width: '56%', height: 12, borderRadius: 5 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>{[0, 1, 2].map(index => <SkeletonSurface key={index} style={{ flex: 1, padding: 14, gap: 10 }}><SkeletonShimmer style={{ width: '46%', height: 25, borderRadius: 7 }} /><SkeletonShimmer style={{ width: '76%', height: 11, borderRadius: 5 }} /></SkeletonSurface>)}</View>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 16 }}>
        <SkeletonSurface style={{ flex: desktop ? 1.6 : undefined, padding: 18, gap: 20 }}>
          <SkeletonShimmer style={{ width: '48%', height: 21, borderRadius: 7 }} />
          {[0, 1, 2, 3].map(index => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}><SkeletonShimmer style={{ width: 40, height: 40, borderRadius: 14 }} /><View style={{ flex: 1, gap: 8 }}><SkeletonShimmer style={{ width: index % 2 ? '64%' : '80%', height: 14, borderRadius: 6 }} /><SkeletonShimmer style={{ width: '43%', height: 10, borderRadius: 4 }} /></View></View>)}
        </SkeletonSurface>
        <SkeletonSurface style={{ flex: desktop ? 1 : undefined, padding: 18, gap: 16 }}><SkeletonShimmer style={{ width: '62%', height: 20, borderRadius: 7 }} />{[0, 1, 2].map(index => <View key={index} style={{ gap: 8, paddingVertical: 10 }}><SkeletonShimmer style={{ width: '85%', height: 13, borderRadius: 5 }} /><SkeletonShimmer style={{ width: '58%', height: 11, borderRadius: 4 }} /></View>)}</SkeletonSurface>
      </View>
    </ScrollView>
  </View>;
}
