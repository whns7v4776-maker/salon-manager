import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Alert, Platform } from 'react-native';

const educationKey = 'salonpro:tap-to-pay:how-to-tap:after-terms:2';
const nativeEducation = Platform.OS === 'ios'
  ? requireOptionalNativeModule<{ showHowToTap: () => Promise<boolean> }>('ExpoTapToPayEducation')
  : null;

export async function showTapToPayEducation(force = false, identity = ''): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  const key=identity?`${educationKey}:${identity}`:educationKey;
  if (!force && await AsyncStorage.getItem(key).catch(() => null) === 'seen') return true;
  const shown = nativeEducation ? await nativeEducation.showHowToTap().catch(()=>false) : false;
  const accepted = shown || await new Promise<boolean>((resolve) => {
    Alert.alert('Come usare Tap to Pay su iPhone', 'Mostra l’importo al cliente, poi chiedigli di avvicinare la carta contactless, Apple Pay o un altro wallet alla parte superiore dell’iPhone. Mantieni la carta vicina fino alla lettura e attendi la conferma dell’incasso. Se richiesto, il cliente inserisce il PIN sullo schermo Apple, con le opzioni di accessibilità disponibili. Se la carta non è supportata o richiede l’inserimento in un POS, verifica e annulla il tentativo e usa QR / link o un altro metodo.', [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continua', onPress: () => resolve(true) },
    ], { cancelable: false });
  });
  if (accepted) await AsyncStorage.setItem(key, 'seen').catch(() => {});
  return accepted;
}
