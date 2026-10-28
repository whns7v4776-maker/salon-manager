import React from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { AccessBackdrop, useAccessAppearance } from './access-premium';
import { ClientBookingHeader } from './client-booking-frame';
import { useClientBookingLayout } from './client-booking-layout';
import { SkeletonShimmer, SkeletonSurface } from './ui/skeleton-shimmer';

/** First paint and refresh use the same frame as the ready booking, on web and native. */
export function ClientBookingLoading({ workspaceId, salonName }: { workspaceId?: string; salonName: string }) {
  const { palette: p } = useAccessAppearance();
  const layout = useClientBookingLayout();
  return <View accessibilityRole="progressbar" accessibilityLabel="Caricamento della prenotazione" accessibilityState={{ busy: true }} style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: p.canvas, ...(Platform.OS === 'web' ? { height: layout.height, maxHeight: layout.height } : {}) }}>
    <AccessBackdrop />
    <View style={{ flex: 1, minHeight: 0, paddingLeft: layout.desktop ? 224 : 0 }}>
      <ClientBookingHeader workspaceId={workspaceId} salonName={salonName}>
        <View style={{ flexDirection: 'row', paddingVertical: 10 }}>{[0, 1, 2, 3, 4].map(index => <View key={index} style={{ flex: 1, alignItems: 'center', gap: 10 }}><SkeletonShimmer style={{ width: 24, height: 24, borderRadius: 12 }} /><SkeletonShimmer style={{ width: '70%', height: 10, borderRadius: 4 }} /></View>)}</View>
      </ClientBookingHeader>
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: layout.desktop ? 32 : 20, paddingTop: 15, paddingBottom: 24 }}>
        <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 18 }}>
          <SkeletonShimmer style={{ width: '70%', height: 31, borderRadius: 8 }} />
          <SkeletonShimmer style={{ width: '88%', height: 12, borderRadius: 5 }} />
          <SkeletonSurface style={{ padding: 5, flexDirection: 'row', gap: 7, borderRadius: 14 }}>{[0, 1, 2].map(index => <SkeletonShimmer key={index} style={{ flex: 1, height: 34, borderRadius: 10 }} />)}</SkeletonSurface>
          {[0, 1, 2, 3].map(index => <SkeletonSurface key={index} style={{ padding: 15, borderRadius: 18, minHeight: 80, gap: 10 }}><View style={{ flexDirection: 'row', gap: 15 }}><SkeletonShimmer style={{ flex: 1, height: 16, borderRadius: 5 }} /><SkeletonShimmer style={{ width: 60, height: 16, borderRadius: 5 }} /><SkeletonShimmer style={{ width: 18, height: 18, borderRadius: 9 }} /></View><SkeletonShimmer style={{ width: '43%', height: 11, borderRadius: 5 }} /></SkeletonSurface>)}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: layout.desktop ? 32 : 12, paddingTop: 8, paddingBottom: layout.navigationSpace }}><SkeletonSurface style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 21 }}><SkeletonShimmer style={{ width: 78, height: 35, borderRadius: 7 }} /><SkeletonShimmer style={{ width: 120, height: 46, borderRadius: 14 }} /></SkeletonSurface></View>
    </View>
  </View>;
}
