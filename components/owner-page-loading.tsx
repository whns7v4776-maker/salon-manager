import React from 'react';
import { View } from 'react-native';
import { useAppContext } from '../src/context/AppContext';
import { SkeletonShimmer } from './ui/skeleton-shimmer';

export function useOwnerDataLoading() {
  const { ownerInitialDataHydrating } = useAppContext();
  return ownerInitialDataHydrating;
}

/** Replace only data, keeping the surrounding heading and controls mounted. */
export function OwnerDataLoading({ loading, children, lines = 1 }: {
  loading: boolean; children: React.ReactNode; lines?: number;
}) {
  if (!loading) return <>{children}</>;
  return <View accessibilityLabel="Caricamento dati" accessibilityState={{ busy: true }} style={{ gap: 12, paddingVertical: 8, minWidth: 90, alignSelf: 'stretch' }}>
    {Array.from({ length: lines }, (_, index) => <SkeletonShimmer key={index} style={{ width: index % 2 ? '60%' : '80%', height: 22, borderRadius: 8 }} />)}
  </View>;
}
