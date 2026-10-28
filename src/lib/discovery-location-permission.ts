import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

let pendingPrompt: Promise<boolean> | null = null;

// Called only from the serialized post-login permission flows. The OS remembers
// acceptance/refusal; older binaries skip this without consuming their first ask.
export function requestDiscoveryLocationPermissionOnce(): Promise<boolean> {
  if (Platform.OS === 'web' || AppState.currentState !== 'active' || !requireOptionalNativeModule('ExpoLocation')) {
    return Promise.resolve(false);
  }
  if (pendingPrompt) return pendingPrompt;
  pendingPrompt = (async () => {
    try {
      const location = await import('expo-location');
      const permission = await location.getForegroundPermissionsAsync();
      if (permission.status !== 'undetermined' || !permission.canAskAgain || AppState.currentState !== 'active') return false;
      const explanationKey = 'salonpro-location-purpose-shown-v1';
      if (await AsyncStorage.getItem(explanationKey)) return false;
      const proceed = await new Promise<boolean>(resolve => Alert.alert(
        'La posizione, solo quando serve',
        'SalonPro usa la posizione per trovare saloni vicini o impostare la sede del salone. Per i promemoria degli appuntamenti potrai scegliere separatamente se attivarla anche in background, dalle impostazioni. Il consenso è facoltativo: puoi continuare a usare l’app senza.',
        [{ text: 'Non ora', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continua', onPress: () => resolve(true) }],
        { cancelable: false }
      ));
      await AsyncStorage.setItem(explanationKey, '1');
      if (!proceed || AppState.currentState !== 'active') return false;
      await location.requestForegroundPermissionsAsync();
      return true;
    } catch {
      return false;
    } finally {
      pendingPrompt = null;
    }
  })();
  return pendingPrompt;
}
