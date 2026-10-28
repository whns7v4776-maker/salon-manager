import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as TaskManager from 'expo-task-manager';
import { publicSupabase } from './supabase';
import { readNativeCustomerSession } from './client-native-session';
import { createClientGpsReminderController, type ReminderConsent, type ReminderWindow } from './client-gps-reminder-controller';
import type { LocationObject } from 'expo-location';

// Keep the old task name to stop an already running service after this OTA.
const TASK = 'salonpro-client-gps-reminders-v1';
const KEY = 'salonpro-client-gps-reminders-v1';
const PENDING_DISABLE_KEY = KEY + '-pending-disable';
const INSTANCE_KEY = 'salon_manager_frontend_client_app_instance_id';
let resumeGeneration = 0;
let preferences = Promise.resolve();
function changePreference<T>(operation: () => Promise<T>): Promise<T> {
  const result = preferences.catch(() => undefined).then(operation);
  preferences = result.then(() => undefined, () => undefined);
  return result;
}
export async function getClientGpsConsent(): Promise<ReminderConsent | null> {
  const raw = await AsyncStorage.getItem(KEY);
  try {
    const value = raw ? JSON.parse(raw) : null;
    return typeof value?.salonCode === 'string' && !!value.salonCode &&
      typeof value?.instanceId === 'string' && !!value.instanceId ? value : null;
  } catch { return null; }
}
async function reminderRpc(name: string, args: Record<string, unknown>) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12_000);
  try { return await publicSupabase.rpc(name, args).abortSignal(abort.signal); }
  finally { clearTimeout(timer); }
}
async function report(consent: ReminderConsent, enabled: boolean, point?: LocationObject) {
  const { data, error } = await reminderRpc('update_client_gps_reminder_v1', {
    p_salon_code: consent.salonCode, p_instance_id: consent.instanceId, p_enabled: enabled,
    p_latitude: point?.coords.latitude ?? null, p_longitude: point?.coords.longitude ?? null,
    p_accuracy: point?.coords.accuracy ?? null, p_speed: point?.coords.speed ?? null,
    p_observed_at: point ? new Date(point.timestamp).toISOString() : null,
  });
  if (error || data !== true) throw new Error('Non è stato possibile aggiornare il promemoria online. Riprova.');
}
async function stopLegacyBackgroundTracking() {
  if (!requireOptionalNativeModule('ExpoLocation')) return;
  const location = await import('expo-location');
  if (await location.hasStartedLocationUpdatesAsync(TASK)) await location.stopLocationUpdatesAsync(TASK);
}
async function pendingDisables(): Promise<ReminderConsent[]> {
  const raw = await AsyncStorage.getItem(PENDING_DISABLE_KEY);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(c => typeof c?.salonCode !== 'string' || typeof c?.instanceId !== 'string'))
    throw new Error('Stato del promemoria non disponibile.');
  return value;
}
async function flushPendingDisables() {
  const pending = await pendingDisables();
  for (const consent of pending) {
    const { data, error } = await reminderRpc('update_client_gps_reminder_v1', {
      p_salon_code: consent.salonCode, p_instance_id: consent.instanceId, p_enabled: false,
    });
    // false means the old installation is no longer authoritative. Never try to
    // revoke another customer's session. A network failure remains pending.
    if (error || typeof data !== 'boolean') throw new Error('Disattivazione salvata sul telefono. Riapri l’app con una connessione per aggiornare il promemoria online.');
  }
  if (pending.length) await AsyncStorage.removeItem(PENDING_DISABLE_KEY);
}
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) {
  // Old background callbacks only stop their service; never collect another sample.
  TaskManager.defineTask(TASK, async () => { await stopLegacyBackgroundTracking().catch(() => undefined); });
}
const controller = createClientGpsReminderController<LocationObject>({
  now: Date.now,
  async consent() {
    const [consent, session] = await Promise.all([getClientGpsConsent(), readNativeCustomerSession()]);
    if ((await pendingDisables()).some(c => c.salonCode === consent?.salonCode && c.instanceId === consent?.instanceId)) return null;
    return consent && session?.appInstanceId === consent.instanceId && session.salonCode === consent.salonCode
      ? consent : null;
  },
  async window(consent) {
    const { data, error } = await reminderRpc('get_client_gps_reminder_window_v1', {
      p_salon_code: consent.salonCode, p_instance_id: consent.instanceId,
    });
    if (error || !data || typeof data.enabled !== 'boolean') throw new Error('Finestra posizione non disponibile.');
    return data as ReminderWindow;
  },
  async watch(onPoint) {
    if (!requireOptionalNativeModule('ExpoLocation')) return null;
    const location = await import('expo-location');
    // Optional enhancement: only an already granted foreground permission.
    if (!(await location.getForegroundPermissionsAsync()).granted || !await location.hasServicesEnabledAsync() || AppState.currentState !== 'active') return null;
    return location.watchPositionAsync({ accuracy: location.Accuracy.Balanced, timeInterval: 60_000, distanceInterval: 0 }, onPoint);
  },
  async report(consent, point) {
    if (Date.now() - point.timestamp > 120_000 || point.timestamp > Date.now() + 10_000) return;
    await report(consent, true, point);
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
});
export function pauseClientGpsReminders() { ++resumeGeneration; controller.pause(); }
async function resumeTracking() {
  pauseClientGpsReminders();
  const epoch = resumeGeneration;
  await stopLegacyBackgroundTracking();
  await changePreference(flushPendingDisables);
  if (epoch === resumeGeneration && AppState.currentState === 'active') controller.refresh();
}
async function disablePreference() {
  const consent = await getClientGpsConsent();
  if (consent) {
    const pending = await pendingDisables();
    if (!pending.some(c => c.salonCode === consent.salonCode && c.instanceId === consent.instanceId)) pending.push(consent);
    await AsyncStorage.setItem(PENDING_DISABLE_KEY, JSON.stringify(pending));
  }
  await AsyncStorage.removeItem(KEY);
  await stopLegacyBackgroundTracking();
  await controller.drainReports();
  await flushPendingDisables();
}
export function disableClientGpsReminders() {
  pauseClientGpsReminders();
  return changePreference(disablePreference);
}
export async function enableClientGpsReminders(salonCode: string) {
  if (Platform.OS === 'web') throw new Error('Attiva questo promemoria dall’app.');
  pauseClientGpsReminders();
  await changePreference(async () => {
    const instanceId = await AsyncStorage.getItem(INSTANCE_KEY);
    const session = await readNativeCustomerSession();
    if (!instanceId || !salonCode || session?.appInstanceId !== instanceId || session.salonCode !== salonCode)
      throw new Error('Accedi al tuo salone prima di attivare questo promemoria.');
    if (await getClientGpsConsent()) await disablePreference();
    else await flushPendingDisables();
    const consent = { salonCode, instanceId };
    await report(consent, true);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(consent)); }
    catch (error) { await report(consent, false).catch(() => undefined); throw error; }
  });
  // Missing location permission does not disable the server-side reminder.
  await resumeTracking().catch(() => undefined);
}
if (Platform.OS !== 'web') {
  void resumeTracking().catch(() => undefined);
  AppState.addEventListener('change', state => {
    pauseClientGpsReminders();
    if (state === 'active') void resumeTracking().catch(() => undefined);
    else void stopLegacyBackgroundTracking().catch(() => undefined);
  });
}
