import { publicSupabase } from './supabase';
import { customerPaymentToken, type PaymentIdentity } from './client-payment-session';
import { readClientPasswordFromVault, saveClientPasswordToVault } from './client-password-vault';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { withClientDeadline } from './client-request-deadline';
import { setCustomerPortalProofResolver, setCustomerPortalProofRejectionHandler } from './customer-portal-transport';

export type PortalAccessChallenge = { id: number; identity: PaymentIdentity; kind: 'activate' | 'password'; emailCompletionToken?: string };
type Pending = PortalAccessChallenge & { resolve: (token: string) => void; reject: (error: Error) => void };
const normalize = (i: PaymentIdentity): PaymentIdentity => ({ salonCode: i.salonCode.trim().toLowerCase(), email: i.email.trim().toLowerCase(), phone: i.phone.replace(/\D/g, '').slice(-10) });
const keyOf = (i: PaymentIdentity) => JSON.stringify(normalize(i));
const active = new Map<string, PaymentIdentity>();
const listeners = new Set<() => void>();
const pending = new Map<string, Pending>();
const opening = new Map<string, Promise<string>>();
const emailCompletions = new Map<string, { token: string; expiresAt: number }>();
let nextId = 0;
type ReadSession = { token: string; expiresAt: string };
const readSessions = new Map<string, ReadSession>();
const rejected = new Set<string>();
const generations = new Map<string, number>();
const storageWrites = new Map<string, Promise<unknown>>();
const generation = (i: PaymentIdentity) => generations.get(keyOf(i)) ?? 0;
const currentGeneration = (i: PaymentIdentity, expected: number) => { if (generation(i) !== expected) throw new Error('Accesso annullato. Puoi riprovare.'); };
const writeInOrder = async (i: PaymentIdentity, action: () => Promise<void>) => {
  const key = keyOf(i), task = (storageWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  storageWrites.set(key, task); try { await task; } finally { if (storageWrites.get(key) === task) storageWrites.delete(key); }
};
const sessionKey = (i: PaymentIdentity) => 'customer_portal_' + Array.from(keyOf(i)).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
const usable = (s: ReadSession | null): s is ReadSession => Boolean(s && /^[a-f0-9]{64}$/.test(s.token) && !rejected.has(s.token) && Date.parse(s.expiresAt) > Date.now() + 60000);
async function savedReadSession(identity: PaymentIdentity) {
  const expected = generation(identity);
  const key = keyOf(identity), memory = readSessions.get(key) ?? null;
  if (usable(memory)) return memory.token;
  try {
    const raw = Platform.OS === 'web' ? window.sessionStorage.getItem(sessionKey(identity)) : await SecureStore.getItemAsync(sessionKey(identity));
    currentGeneration(identity, expected);
    const stored = raw ? JSON.parse(raw) as ReadSession : null;
    if (usable(stored)) { readSessions.set(key, stored); return stored.token; }
  } catch { /* A storage failure does not invent a proof. */ }
  return null;
}
export async function authenticateCustomerPortal(identity: PaymentIdentity, password: string): Promise<string> {
  const i = normalize(identity), expected = generation(i);
  const { data, error } = await withClientDeadline(publicSupabase.rpc('create_customer_portal_session_v1', {
    p_salon_code: i.salonCode, p_customer_email: i.email, p_customer_phone: i.phone, p_customer_password: password,
  }));
  currentGeneration(i, expected);
  if (error || !usable(data)) throw new Error(error?.message?.includes('password') ? 'Password non corretta. Controllala e riprova.' : 'Non riesco a confermare l’accesso. Controlla la connessione e riprova.');
  const session: ReadSession = { token: data.token, expiresAt: data.expiresAt };
  readSessions.set(keyOf(i), session);
  try {
    await writeInOrder(i, async () => {
      currentGeneration(i, expected);
      const raw = JSON.stringify(session);
      if (Platform.OS === 'web') window.sessionStorage.setItem(sessionKey(i), raw);
      else await SecureStore.setItemAsync(sessionKey(i), raw, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    });
    currentGeneration(i, expected);
    await saveClientPasswordToVault({ ...i, password });
  } catch { /* The current verified session remains usable in memory. */ }
  currentGeneration(i, expected);
  return session.token;
}
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* A view observer cannot interrupt verified access. */ } });
export const currentPortalAccessChallenge = (): PortalAccessChallenge | null => {
  const item = pending.values().next().value as Pending | undefined;
  return item ? { id: item.id, identity: item.identity, kind: item.kind, emailCompletionToken: item.emailCompletionToken } : null;
};
export function rememberVerifiedCustomerEmail(identity: PaymentIdentity, token: string) {
  emailCompletions.set(keyOf(identity), { token, expiresAt: Date.now() + 15 * 60_000 });
}
export function subscribePortalAccessChallenges(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function completePortalAccessChallenge(id: number, token: string) {
  const entry = [...pending.entries()].find(([, p]) => p.id === id);
  if (!entry) return;
  pending.delete(entry[0]); entry[1].resolve(token); emit();
}
export function cancelPortalAccessChallenge(id: number) {
  const entry = [...pending.entries()].find(([, p]) => p.id === id);
  if (!entry) return;
  pending.delete(entry[0]); entry[1].reject(new Error('Accesso annullato. Puoi riprovare senza perdere il profilo.')); emit();
}
export function clearCustomerPortalIdentity(identity: PaymentIdentity) {
  const i = normalize(identity);
  generations.set(keyOf(i), generation(i) + 1); opening.delete(keyOf(i));
  if (active.has(i.salonCode) && keyOf(active.get(i.salonCode)!) === keyOf(i)) active.delete(i.salonCode);
  const p = pending.get(keyOf(i)); if (p) cancelPortalAccessChallenge(p.id);
  const cached = readSessions.get(keyOf(i)); if (cached) rejected.add(cached.token);
  readSessions.delete(keyOf(i));
  emailCompletions.delete(keyOf(i));
  void writeInOrder(i, async () => {
    if (Platform.OS === 'web') { try { window.sessionStorage.removeItem(sessionKey(i)); } catch { /* optional */ } }
    else await SecureStore.deleteItemAsync(sessionKey(i));
  }).catch(() => {});
}
async function challenge(identity: PaymentIdentity, kind: PortalAccessChallenge['kind']): Promise<string> {
  return new Promise((resolve, reject) => {
    const completion = emailCompletions.get(keyOf(identity));
    const value: Pending = { id: ++nextId, identity, kind, resolve, reject,
      emailCompletionToken: kind === 'activate' && completion && completion.expiresAt > Date.now() ? completion.token : undefined };
    pending.set(keyOf(identity), value); emit();
  });
}

/** A verified proof must precede session claims and private hydration. No logout or account reset. */
export async function ensureCustomerPortalSession(identity: PaymentIdentity, password = '', passwordRequired?: boolean): Promise<string> {
  const i = normalize(identity), key = keyOf(i);
  const expected = generation(i);
  if (!i.salonCode || !i.email || i.phone.length < 9) throw new Error('Controlla email, cellulare e salone collegato.');
  if (opening.has(key)) return opening.get(key)!;
  const task = (async () => {
    let token: string;
    if (password && passwordRequired !== false) token = await authenticateCustomerPortal(i, password);
    else {
      const saved = await savedReadSession(i);
      currentGeneration(i, expected);
      if (saved) token = saved;
      else {
        let existing: string | null = null;
        if (passwordRequired !== false) {
          try { const candidate = await customerPaymentToken(i); if (!rejected.has(candidate)) existing = candidate; } catch { /* Read access also supports pending registrations. */ }
          if (!existing) {
            const vaulted = await readClientPasswordFromVault(i).catch(() => '');
            if (vaulted) { try { existing = await authenticateCustomerPortal(i, vaulted); } catch { /* Use normal password confirmation below. */ } }
          }
        }
        if (existing) token = existing;
        else {
          let needsPassword = passwordRequired;
          currentGeneration(i, expected);
          if (needsPassword === undefined) {
            const { data, error: statusError } = await withClientDeadline(publicSupabase.rpc('get_customer_portal_access_requirement_v1', {
              p_salon_code: i.salonCode, p_customer_email: i.email, p_customer_phone: i.phone,
            }));
            if (statusError || !data?.found) throw new Error('Non riesco a verificare il profilo. Controlla i dati e riprova.');
            currentGeneration(i, expected);
            needsPassword = data.passwordRequired === true;
          }
          currentGeneration(i, expected);
          token = await challenge(i, needsPassword ? 'password' : 'activate');
        }
      }
    }
    currentGeneration(i, expected);
    if (!active.has(i.salonCode) || keyOf(active.get(i.salonCode)!) !== key) active.set(i.salonCode, i);
    return token;
  })();
  opening.set(key, task);
  try { return await task; } finally { if (opening.get(key) === task) opening.delete(key); }
}

type LookupArgs = { p_salon_code: string; p_customer_email: string | null; p_customer_phone: string | null; p_customer_password?: string };
export async function lookupCustomerForPortal(args: LookupArgs) {
  let result = await withClientDeadline(publicSupabase.rpc('find_public_customer_by_password', args));
  if (result.error && !args.p_customer_password && /customer_password_required|customer_portal_access_required/.test(String(result.error.message)) && args.p_customer_email && args.p_customer_phone) {
    await ensureCustomerPortalSession({ salonCode: args.p_salon_code, email: args.p_customer_email, phone: args.p_customer_phone }, '', true);
    result = await withClientDeadline(publicSupabase.rpc('find_public_customer_by_password', args));
  }
  const data = result.data;
  if (result.error || !data || !args.p_customer_email || !args.p_customer_phone) return result;
  const i = normalize({ salonCode: String(data.salonCode || args.p_salon_code), email: args.p_customer_email, phone: args.p_customer_phone });
  // Missing-email completion and mismatches retain their established path.
  if (String(data.email ?? '').trim().toLowerCase() !== i.email || String(data.telefono ?? '').replace(/\D/g, '').slice(-10) !== i.phone || Number(data.sameScoreCount ?? 0) !== 1) return result;
  await ensureCustomerPortalSession(i, args.p_customer_password || '', data.passwordRequired === true);
  // The server now returns only this proven customer's profile. This also
  // refreshes passwordRequired after a successful first password activation.
  result = await withClientDeadline(publicSupabase.rpc('find_public_customer_by_password', { ...args, p_customer_password: '' }));
  return result;
}

setCustomerPortalProofResolver(async (name, args, interactive) => {
  const salon = String(args.p_salon_code ?? '').trim().toLowerCase();
  const identity = active.get(salon);
  if (!identity) return null;
  const email = args.p_customer_email ?? args.p_email;
  const phone = args.p_customer_phone ?? args.p_phone;
  if (email != null && String(email).trim().toLowerCase() !== identity.email) return null;
  if (phone != null && String(phone).replace(/\D/g, '').slice(-10) !== identity.phone) return null;
  // Lookup itself must never open a challenge; the explicit login flow does.
  if (name === 'find_public_customer_by_password' || !interactive) {
    const saved = await savedReadSession(identity);
    if (saved) return saved;
    const candidate = await customerPaymentToken(identity).catch(() => null);
    return candidate && !rejected.has(candidate) ? candidate : null;
  }
  const proof = await ensureCustomerPortalSession(identity);
  if (active.get(salon) !== identity) throw new Error('La sessione cliente è cambiata. Riprova.');
  return proof;
});

setCustomerPortalProofRejectionHandler(async (_name, args, token) => {
  const salon = String(args.p_salon_code ?? '').trim().toLowerCase();
  const identity = active.get(salon);
  if (!identity) return;
  const email = args.p_customer_email ?? args.p_email;
  const phone = args.p_customer_phone ?? args.p_phone;
  if (email != null && String(email).trim().toLowerCase() !== identity.email) return;
  if (phone != null && String(phone).replace(/\D/g, '').slice(-10) !== identity.phone) return;
  rejected.add(token);
  if (readSessions.get(keyOf(identity))?.token === token) readSessions.delete(keyOf(identity));
  // The resolver renews from the existing vault, or asks for the current
  // password. It never resets a credential or runs activation for an account
  // which the server already reports as password-protected.
});
