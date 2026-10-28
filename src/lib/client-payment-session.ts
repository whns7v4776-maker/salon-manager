import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { publicSupabase } from './supabase';
import { readClientPasswordFromVault, saveClientPasswordToVault } from './client-password-vault';
export type PaymentIdentity = { salonCode: string; email: string; phone: string };
type Session = { token: string; expiresAt: string };
const AUTH_MESSAGE = 'Conferma la password del tuo account per continuare.';
const UNAVAILABLE_MESSAGE = 'Verifica dell’accesso temporaneamente non disponibile. Riprova.';
export class CustomerPaymentAccessError extends Error {
  constructor(readonly code: 'auth_required' | 'unavailable', message = code === 'auth_required' ? AUTH_MESSAGE : UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'CustomerPaymentAccessError';
  }
}
const messageOf = (error: unknown) => typeof error === 'string' ? error : String((error as { message?: unknown } | null)?.message ?? '');
export function isCustomerPaymentAuthenticationError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'unavailable') return false;
  return code === 'auth_required' || /^(?:Verifica la password(?: per (?:accedere|usare|ordinare))?|Conferma la password del tuo account|customer_payment_auth_required|invalid_customer_password|customer_password_required)/i.test(messageOf(error));
}
export function customerPaymentAccessError(error: unknown, fallback = UNAVAILABLE_MESSAGE): Error {
  if (isCustomerPaymentAuthenticationError(error)) return new CustomerPaymentAccessError('auth_required');
  if (error instanceof CustomerPaymentAccessError) return error;
  const message = messageOf(error);
  if (!message || /network|fetch|timeout|timed out|502|503|504|aborted|canceling statement|failed to send|read-only transaction|SELECT FOR|PGRST|SQLSTATE|permission denied|relation .+ does not exist|TypeError/i.test(message)) {
    return new CustomerPaymentAccessError('unavailable', fallback);
  }
  return error instanceof Error ? error : new Error(message);
}
const pending = new Map<string, Promise<string>>();
const sessions = new Map<string, Session>();
const generations = new Map<string, number>();
const silentAuthBlocked = new Set<string>();
const rejectedTokens = new Map<string, string>();
const storageWrites = new Map<string, Promise<void>>();
type SessionEvent = 'authenticated' | 'invalidated';
const listeners = new Map<string, Set<(event: SessionEvent) => void>>();
const identityKey = (i: PaymentIdentity) => JSON.stringify([i.salonCode.trim().toLowerCase(), i.email.trim().toLowerCase(), i.phone.replace(/\D/g, '')]);
const storageKey = async (i: PaymentIdentity) => 'customer_payment_' + Array.from(identityKey(i)).map(char => char.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
const generation = (key: string) => generations.get(key) ?? 0;
const sessionUsable = (value: unknown): value is Session => {
  const session = value as Session | null;
  return typeof session?.token === 'string' && /^[a-f0-9]{64}$/i.test(session.token)
    && typeof session.expiresAt === 'string' && Date.parse(session.expiresAt) > Date.now() + 60000;
};
const notify = (key: string, event: SessionEvent) => listeners.get(key)?.forEach(listener => { try { listener(event); } catch { /* An observer cannot break validated access. */ } });
export function subscribeCustomerPaymentSession(identity: PaymentIdentity, listener: (event: SessionEvent) => void) {
  const key = identityKey(identity);
  const group = listeners.get(key) ?? new Set();
  group.add(listener); listeners.set(key, group);
  return () => { group.delete(listener); if (!group.size) listeners.delete(key); };
}
const writeInOrder = (key: string, operation: () => Promise<void>) => {
  const task = (storageWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  storageWrites.set(key, task);
  void task.finally(() => { if (storageWrites.get(key) === task) storageWrites.delete(key); }).catch(() => {});
  return task;
};
async function readSession(identity: PaymentIdentity): Promise<Session | null> {
  const name = await storageKey(identity);
  let raw: string | null;
  try { raw = Platform.OS === 'web' ? window.sessionStorage.getItem(name) : await SecureStore.getItemAsync(name); }
  catch { throw new CustomerPaymentAccessError('unavailable'); }
  if (!raw) return null;
  try { const value = JSON.parse(raw); return sessionUsable(value) ? value : null; }
  catch { return null; }
}
async function issueSession(identity: PaymentIdentity, password: string, expectedGeneration: number): Promise<string> {
  const key = identityKey(identity);
  let result;
  try {
    result = await publicSupabase.rpc('create_customer_payment_session', {
      p_salon_code: identity.salonCode, p_email: identity.email, p_phone: identity.phone, p_password: password,
    });
  } catch { throw new CustomerPaymentAccessError('unavailable'); }
  if (result.error) {
    if (isCustomerPaymentAuthenticationError(result.error)) throw new CustomerPaymentAccessError('auth_required');
    throw new CustomerPaymentAccessError('unavailable');
  }
  if (!sessionUsable(result.data)) throw new CustomerPaymentAccessError('unavailable');
  if (generation(key) !== expectedGeneration) throw new CustomerPaymentAccessError('auth_required');
  const session: Session = { token: result.data.token, expiresAt: result.data.expiresAt };
  await writeInOrder(key, async () => {
    if (generation(key) !== expectedGeneration) return;
    const name = await storageKey(identity);
    if (Platform.OS === 'web') window.sessionStorage.setItem(name, JSON.stringify(session));
    else await SecureStore.setItemAsync(name, JSON.stringify(session));
  }).catch(() => { /* A verified session remains usable in memory when persistence is unavailable. */ });
  if (generation(key) !== expectedGeneration) throw new CustomerPaymentAccessError('auth_required');
  sessions.set(key, session); silentAuthBlocked.delete(key); rejectedTokens.delete(key);
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    await writeInOrder(key, async () => {
      if (generation(key) === expectedGeneration) await saveClientPasswordToVault({ ...identity, password });
    }).catch(() => {});
  }
  if (generation(key) !== expectedGeneration) throw new CustomerPaymentAccessError('auth_required');
  notify(key, 'authenticated');
  return session.token;
}
export async function authenticateCustomerPayment(identity: PaymentIdentity, password: string): Promise<string> {
  const key = identityKey(identity);
  const nextGeneration = generation(key) + 1;
  generations.set(key, nextGeneration);
  const task = issueSession(identity, password, nextGeneration);
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
export async function customerPaymentToken(identity: PaymentIdentity): Promise<string> {
  const key = identityKey(identity);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const expectedGeneration = generation(key);
  const task = (async () => {
    if (silentAuthBlocked.has(key)) throw new CustomerPaymentAccessError('auth_required');
    await storageWrites.get(key)?.catch(() => {});
    const stored = sessions.get(key) ?? await readSession(identity);
    if (generation(key) !== expectedGeneration) throw new CustomerPaymentAccessError('auth_required');
    if (sessionUsable(stored) && rejectedTokens.get(key) !== stored.token) { sessions.set(key, stored); return stored.token; }
    if (silentAuthBlocked.has(key)) throw new CustomerPaymentAccessError('auth_required');
    // Native credentials come from the existing secure vault. Web passwords
    // remain short-lived handoffs; a payment check never consumes that handoff.
    if (Platform.OS !== 'web') {
      const password = await readClientPasswordFromVault(identity);
      if (generation(key) !== expectedGeneration) throw new CustomerPaymentAccessError('auth_required');
      if (password) {
        try { return await issueSession(identity, password, expectedGeneration); }
        catch (error) { if (generation(key) === expectedGeneration && isCustomerPaymentAuthenticationError(error)) silentAuthBlocked.add(key); throw error; }
      }
    }
    silentAuthBlocked.add(key);
    throw new CustomerPaymentAccessError('auth_required');
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
export async function invalidateCustomerPaymentToken(identity: PaymentIdentity, rejectedToken?: string): Promise<void> {
  const key = identityKey(identity);
  if (rejectedToken) {
    if (rejectedTokens.get(key) === rejectedToken) {
      await storageWrites.get(key)?.catch(() => {});
      return;
    }
    const beforeRead = generation(key);
    const stored = sessions.get(key) ?? await readSession(identity);
    // A late response must not cancel a newer explicit verification or logout.
    if (generation(key) !== beforeRead) {
      await storageWrites.get(key)?.catch(() => {});
      return;
    }
    const current = sessions.get(key) ?? stored;
    if (current && current.token !== rejectedToken) return;
    rejectedTokens.set(key, rejectedToken);
  } else {
    silentAuthBlocked.add(key); rejectedTokens.delete(key);
  }
  generations.set(key, generation(key) + 1);
  sessions.delete(key); pending.delete(key);
  await writeInOrder(key, async () => {
    const name = await storageKey(identity);
    if (Platform.OS === 'web') window.sessionStorage.removeItem(name);
    else await SecureStore.deleteItemAsync(name);
  }).catch(() => {});
  notify(key, 'invalidated');
}
export async function withCustomerPaymentToken<T>(identity: PaymentIdentity, operation: (token: string) => Promise<T>, options?: { allowUnauthenticated?: boolean }): Promise<T> {
  const readPublicPolicy = async (accessError: unknown) => {
    try { return await operation(''); }
    catch (error) {
      // A public salon policy can survive local storage/session outages. A
      // protected policy still reports the original outage, never a wrong password.
      throw customerPaymentAccessError(isCustomerPaymentAuthenticationError(error) && !isCustomerPaymentAuthenticationError(accessError) ? accessError : error);
    }
  };
  let token: string;
  try { token = await customerPaymentToken(identity); }
  catch (error) {
    if (!options?.allowUnauthenticated) throw customerPaymentAccessError(error);
    return readPublicPolicy(error);
  }
  try { return await operation(token); }
  catch (error) {
    if (!isCustomerPaymentAuthenticationError(error)) throw customerPaymentAccessError(error);
    await invalidateCustomerPaymentToken(identity, token);
    let renewed: string;
    try { renewed = await customerPaymentToken(identity); }
    catch (renewalError) {
      if (options?.allowUnauthenticated) return readPublicPolicy(renewalError);
      throw customerPaymentAccessError(renewalError);
    }
    try { return await operation(renewed); }
    catch (retryError) {
      if (isCustomerPaymentAuthenticationError(retryError)) {
        await invalidateCustomerPaymentToken(identity, renewed);
        const key = identityKey(identity);
        if (!pending.has(key) && !sessions.has(key)) silentAuthBlocked.add(key);
      }
      throw customerPaymentAccessError(retryError);
    }
  }
}
