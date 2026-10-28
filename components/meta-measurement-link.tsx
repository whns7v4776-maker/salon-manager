import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { isMetaMeasurementAvailable } from '../src/lib/meta-app-events';

export function MetaMeasurementLink() {
  const router = useRouter();
  if (!isMetaMeasurementAvailable()) return null;
  return <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={{ padding: 16 }}>
    <Text style={{ textAlign: 'center', color: '#61513c', textDecorationLine: 'underline' }}>Preferenze misurazione pubblicitaria</Text>
  </Pressable>;
}
