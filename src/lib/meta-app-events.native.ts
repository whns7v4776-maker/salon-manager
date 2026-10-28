import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const CONSENT_KEY = 'salonpro_meta_measurement_consent_v1';
let initialized = false;
let activationLogged = false;
let consentVeto = false;
let consentRevision = 0;
let consentSaveError: string | null = null;
export const getMetaMeasurementSaveError = () => consentSaveError;
const installBridge = () => requireOptionalNativeModule<{ activate(consented: boolean): Promise<boolean> }>('SalonProMetaInstallEvents');
// Serialize consent changes and events, including a withdrawal racing registration.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  const next = queue.then(action).catch(() => fallback);
  queue = next;
  return next;
}
export const isMetaMeasurementAvailable = () =>
  Constants.expoConfig?.extra?.metaAppEventsEnabled === true &&
  Constants.appOwnership !== 'expo' &&
  !!NativeModules.FBSettings && !!NativeModules.FBAppEventsLogger && !!installBridge();

// Require only after checking the binary: old builds and Expo Go must still start.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = () => require('react-native-fbsdk-next') as typeof import('react-native-fbsdk-next');
// Also lazy: importing this module eagerly would crash older installed binaries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracking = () => require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
export async function getMetaMeasurementConsent() {
  try {
    return !consentVeto && isMetaMeasurementAvailable() && await AsyncStorage.getItem(CONSENT_KEY) === 'granted';
  } catch { return false; }
}
async function canMeasure() {
  const revision = consentRevision;
  if (consentVeto || !await getMetaMeasurementConsent()) return false;
  const authorized = Platform.OS !== 'ios' || (await tracking().getTrackingPermissionsAsync()).status === 'granted';
  return authorized && !consentVeto && revision === consentRevision;
}
async function initialize() {
  const { Settings } = sdk();
  Settings.setAutoLogAppEventsEnabled(false); // No automatic purchases, trials or other events.
  Settings.setAdvertiserIDCollectionEnabled(true);
  if (Platform.OS === 'ios') await Settings.setAdvertiserTrackingEnabled(true);
  if (!initialized) {
    Settings.initializeSDK();
    initialized = true;
  }
}
async function disable() {
  if (!isMetaMeasurementAvailable()) return;
  const { Settings } = sdk();
  Settings.setAutoLogAppEventsEnabled(false);
  Settings.setAdvertiserIDCollectionEnabled(false);
  if (Platform.OS === 'ios') await Settings.setAdvertiserTrackingEnabled(false);
}
async function activate() {
  if (!await canMeasure()) { await disable(); return; }
  await initialize();
  if (!await canMeasure()) return;
  if (!activationLogged) {
    if (!await installBridge()?.activate(true)) return;
    // iOS activateApp logs its own activation; Android deliberately avoids lifecycle listeners.
    if (Platform.OS === 'android') sdk().AppEventsLogger.logEvent('fb_mobile_activate_app');
    sdk().AppEventsLogger.flush();
    activationLogged = true;
  }
}
export function setMetaMeasurementConsent(enabled: boolean) {
  consentVeto = true;
  const revision = ++consentRevision;
  return serial(async () => {
    if (!isMetaMeasurementAvailable()) return false;
    consentSaveError = null;
    // Store refusal first: ATT cancellation, exceptions and disk errors fail closed.
    try { await disable(); } catch { /* Persist refusal even if the native SDK is unavailable. */ }
    try {
      await AsyncStorage.setItem(CONSENT_KEY, 'denied');
    } catch {
      consentSaveError = 'La scelta non è stata salvata sul dispositivo. La misurazione è bloccata in questa sessione: riprova prima di chiudere l’app. Su iPhone puoi revocare anche il permesso di Tracciamento nelle impostazioni di sistema.';
      return false;
    }
    if (!enabled) return false;
    if (Platform.OS === 'ios' && (await tracking().requestTrackingPermissionsAsync()).status !== 'granted') return false;
    if (revision !== consentRevision) return false;
    await AsyncStorage.setItem(CONSENT_KEY, 'granted');
    if (revision !== consentRevision) return false;
    consentVeto = false;
    await activate();
    return true;
  }, false);
}
export function resumeMetaMeasurement() {
  return serial(async () => {
    if (isMetaMeasurementAvailable()) await activate();
  }, undefined);
}
export function logMetaOwnerRegistration() {
  return serial(async () => {
    if (!await canMeasure()) return;
    await initialize();
    if (!await canMeasure()) return;
    // Only a new successful owner signup calls this; no user data or historical backfill.
    sdk().AppEventsLogger.logEvent('fb_mobile_complete_registration');
    sdk().AppEventsLogger.flush();
  }, undefined);
}
