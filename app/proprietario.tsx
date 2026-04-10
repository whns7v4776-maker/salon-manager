import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useAppContext } from '../src/context/AppContext';
import { OwnerAccessScreen } from '../src/screens/OwnerAccessScreen';

export default function ProprietarioScreen() {
  const { isAuthenticated, ownerPasswordRecoveryActive } = useAppContext();
  const params = useLocalSearchParams<{ reset?: string }>();
  const forceOwnerAccess = params.reset === '1';

  if (isAuthenticated && !ownerPasswordRecoveryActive && !forceOwnerAccess) {
    return <Redirect href="/(tabs)" />;
  }

  return <OwnerAccessScreen />;
}
