import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'salon_manager_frontend_native_active_session_v1';
const INSTANCE_KEY = 'salon_manager_frontend_client_app_instance_id';
const REVISION_KEY = 'salon_manager_frontend_native_session_revision_v1';
type NativePlatform = 'ios' | 'android';

export type NativeCustomerSession = {
  version: 1;
  salonCode: string;
  email: string;
  phone: string;
  customerId: string;
  appInstanceId: string;
  passwordRequired: boolean;
  platform: NativePlatform;
};

type SessionIdentity = { salonCode?: string; email?: string; phone?: string };
type VerifiedSessionInput = Omit<NativeCustomerSession, 'version' | 'platform'>;
let generation = 0;
let writes: Promise<unknown> = Promise.resolve();
const native = () => Platform.OS === 'ios' || Platform.OS === 'android';
const normalizeSalon = (value: string) => value.trim().toLowerCase();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D+/g, '').slice(0, 10);

function validSession(value: unknown): value is NativeCustomerSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<NativeCustomerSession>;
  return session.version === 1 && session.platform === Platform.OS &&
    typeof session.salonCode === 'string' && !!session.salonCode && session.salonCode === normalizeSalon(session.salonCode) &&
    typeof session.email === 'string' && session.email === normalizeEmail(session.email) &&
    typeof session.phone === 'string' && /^\d{9,10}$/.test(session.phone) &&
    typeof session.customerId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.customerId) &&
    typeof session.appInstanceId === 'string' && !!session.appInstanceId.trim() && session.appInstanceId === session.appInstanceId.trim() &&
    typeof session.passwordRequired === 'boolean';
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.catch(() => undefined).then(operation);
  writes = result.catch(() => undefined);
  return result;
}

/** A resume hint only. Callers must still validate the current customer and password on the server. */
export async function readNativeCustomerSession(expected: SessionIdentity = {}): Promise<NativeCustomerSession | null> {
  if (!native()) return null;
  const currentGeneration = generation;
  try {
    await writes;
    if (generation !== currentGeneration) return null;
    const [raw, instanceId, activeRevision] = await Promise.all([
      SecureStore.getItemAsync(SESSION_KEY), AsyncStorage.getItem(INSTANCE_KEY), AsyncStorage.getItem(REVISION_KEY),
    ]);
    if (generation !== currentGeneration || !raw || !instanceId) return null;
    const session: unknown = JSON.parse(raw);
    if (!validSession(session) || session.appInstanceId !== instanceId.trim()) return null;
    const revision = (session as NativeCustomerSession & { revocationId?: unknown }).revocationId;
    if (typeof revision !== 'string' || !revision || revision !== activeRevision) return null;
    if (expected.salonCode?.trim() && session.salonCode !== normalizeSalon(expected.salonCode)) return null;
    if (expected.email !== undefined && session.email !== normalizeEmail(expected.email)) return null;
    if (expected.phone !== undefined && session.phone !== normalizePhone(expected.phone)) return null;
    const { revocationId: _revision, ...identity } = session as NativeCustomerSession & { revocationId: string };
    return identity;
  } catch {
    // A local read failure must not invent an authenticated customer.
    return null;
  }
}

/** Capture at the beginning of a validated login, before any asynchronous work. */
export const nativeCustomerSessionGeneration = () => generation;

/** Match the immutable server identity after the normal password RPC has succeeded. */
export function matchesNativeCustomerSession(
  session: NativeCustomerSession,
  customer: { salonCode: string; customerId: string; email: string; phone: string },
): boolean {
  return session.salonCode === normalizeSalon(customer.salonCode) &&
    session.customerId.toLowerCase() === customer.customerId.trim().toLowerCase() &&
    session.email === normalizeEmail(customer.email) &&
    session.phone === normalizePhone(customer.phone);
}

/** Persist only after a successful server login/registration; never from a saved profile alone. */
export function persistNativeCustomerSession(input: VerifiedSessionInput, expectedGeneration: number): Promise<boolean> {
  if (!native() || generation !== expectedGeneration) return Promise.resolve(false);
  const session: NativeCustomerSession = {
    version: 1,
    salonCode: normalizeSalon(input.salonCode),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    customerId: input.customerId.trim().toLowerCase(),
    appInstanceId: input.appInstanceId.trim(),
    passwordRequired: input.passwordRequired,
    platform: Platform.OS as NativePlatform,
  };
  if (!validSession(session)) return Promise.resolve(false);
  return enqueue(async () => {
    try {
      if (generation !== expectedGeneration) return false;
      const installationId = await AsyncStorage.getItem(INSTANCE_KEY);
      if (generation !== expectedGeneration || installationId?.trim() !== session.appInstanceId) return false;
      const revocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ ...session, revocationId }), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      if (generation !== expectedGeneration) return false;
      await AsyncStorage.setItem(REVISION_KEY, revocationId);
      return generation === expectedGeneration;
    } catch {
      // Local persistence is optional for the already validated current login.
      return false;
    }
  });
}

/** Revoke synchronously in memory before logout's first await, then remove the durable hint in order. */
export function invalidateNativeCustomerSession(): Promise<void> {
  ++generation;
  if (!native()) return Promise.resolve();
  void import('./client-gps-reminders').then(({ pauseClientGpsReminders }) => pauseClientGpsReminders()).catch(() => undefined);
  return enqueue(async () => {
    // Independent durable revocation also rejects a surviving Keychain item if
    // its deletion fails. Neither this revision nor the hint authorizes login.
    await AsyncStorage.setItem(REVISION_KEY, `revoked-${Date.now()}-${Math.random().toString(36).slice(2)}`).catch(() => undefined);
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  });
}
