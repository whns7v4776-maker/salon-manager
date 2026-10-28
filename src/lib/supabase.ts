import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigatorLock, processLock, type LockFunc } from '@supabase/auth-js';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';
import { withCustomerPortalProof, renewRejectedCustomerPortalProof } from './customer-portal-transport';

const resolveRequiredEnv = (key: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_ANON_KEY') => {
  const value = process.env[key]?.trim();

  if (value) {
    return value;
  }

  const manifest2Extra = (Constants.manifest2 as { extra?: Record<string, unknown> } | null)
    ?.extra;
  const manifestExtra = (Constants.manifest as { extra?: Record<string, unknown> } | null)?.extra;

  const expoExtra =
    ((Constants.expoConfig?.extra ??
      manifest2Extra ??
      manifestExtra) as
      | {
          supabaseUrl?: string;
          supabaseAnonKey?: string;
          EXPO_PUBLIC_SUPABASE_URL?: string;
          EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
        }
      | undefined) ?? undefined;

  const fallbackValue =
    key === 'EXPO_PUBLIC_SUPABASE_URL'
      ? expoExtra?.supabaseUrl?.trim() || expoExtra?.EXPO_PUBLIC_SUPABASE_URL?.trim()
      : expoExtra?.supabaseAnonKey?.trim() || expoExtra?.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!fallbackValue) {
    throw new Error(`Missing required Supabase env: ${key}`);
  }

  return fallbackValue;
};

export const supabaseUrl = resolveRequiredEnv('EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = resolveRequiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const isReactNative =
  typeof navigator !== 'undefined' &&
  typeof navigator.product === 'string' &&
  navigator.product === 'ReactNative';
const isServer = !isBrowser && !isReactNative;
const isExpoGoRuntime = Constants.executionEnvironment === 'storeClient';
const shouldPersistAuthSession = !isServer && !isExpoGoRuntime;

const memoryStorageStore = new Map<string, string>();

const memoryStorage: SupabaseStorage = {
  getItem: async (key) => memoryStorageStore.get(key) ?? null,
  setItem: async (key, value) => {
    memoryStorageStore.set(key, value);
  },
  removeItem: async (key) => {
    memoryStorageStore.delete(key);
  },
};

const browserStorage: SupabaseStorage = {
  getItem: async (key) => window.localStorage.getItem(key),
  setItem: async (key, value) => {
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    window.localStorage.removeItem(key);
  },
};

const createNativeStorage = (): SupabaseStorage => {
  return AsyncStorage;
};

const resolveSupabaseStorage = (): SupabaseStorage => {
  if (isBrowser && window.localStorage) {
    return browserStorage;
  }

  if (isServer) {
    return memoryStorage;
  }

  return createNativeStorage();
};

const SUPABASE_NETWORK_RETRY_DELAYS_MS = [350, 900];

const waitMs = (value: number) => new Promise<void>((resolve) => setTimeout(resolve, value));

const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }

  return '';
};

export const isInvalidSupabaseRefreshTokenError = (error: unknown) => {
  const normalized = normalizeErrorMessage(error).toLowerCase();

  return (
    normalized.includes('invalid refresh token') ||
    normalized.includes('refresh token not found') ||
    normalized.includes('refresh token has expired')
  );
};

const resolveSupabaseAuthStorageKey = () => {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]?.trim();
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
};

const SUPABASE_AUTH_STORAGE_KEY = resolveSupabaseAuthStorageKey();

const isSupabaseAuthStorageKey = (key: string) =>
  key === SUPABASE_AUTH_STORAGE_KEY || /^sb-[^-]+-auth-token$/.test(key);

export const clearInvalidSupabaseAuthSession = async () => {
  const storage = shouldPersistAuthSession ? resolveSupabaseStorage() : memoryStorage;
  const keys = new Set<string>();

  if (SUPABASE_AUTH_STORAGE_KEY) {
    keys.add(SUPABASE_AUTH_STORAGE_KEY);
  }

  try {
    if (isBrowser && window.localStorage) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && isSupabaseAuthStorageKey(key)) {
          keys.add(key);
        }
      }
    } else if (!isServer && typeof AsyncStorage.getAllKeys === 'function') {
      const storedKeys = await AsyncStorage.getAllKeys();
      storedKeys.forEach((key) => {
        if (isSupabaseAuthStorageKey(key)) {
          keys.add(key);
        }
      });
    }
  } catch {
    // Best effort: removing the default key below is enough for the common stale-token case.
  }

  await Promise.all(Array.from(keys).map((key) => storage.removeItem(key).catch(() => undefined)));
};

const installSupabaseInvalidRefreshTokenLogGuard = () => {
  if (!isReactNative || typeof console === 'undefined') {
    return;
  }

  const guardedConsole = console as typeof console & {
    __salonProInvalidRefreshTokenGuard?: true;
  };

  if (guardedConsole.__salonProInvalidRefreshTokenGuard) {
    return;
  }

  const originalError = console.error.bind(console);

  console.error = (...args: Parameters<typeof console.error>) => {
    const hasInvalidRefreshTokenError = args.some(isInvalidSupabaseRefreshTokenError);
    const joinedMessage = args.map(normalizeErrorMessage).join(' ');

    if (
      hasInvalidRefreshTokenError ||
      joinedMessage.toLowerCase().includes('invalid refresh token') ||
      joinedMessage.toLowerCase().includes('refresh token not found')
    ) {
      void clearInvalidSupabaseAuthSession();
      console.warn('[SUPABASE_STALE_REFRESH_TOKEN_CLEARED]', joinedMessage);
      return;
    }

    originalError(...args);
  };

  guardedConsole.__salonProInvalidRefreshTokenGuard = true;
};

installSupabaseInvalidRefreshTokenLogGuard();

const isTransientNetworkFetchError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed')
  );
};

const baseFetch: typeof fetch = (...args) => fetch(...args);

const supabaseFetch: typeof fetch = async (input, init) => {
  let requestInit = await withCustomerPortalProof(input, init);
  let proofRetried = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SUPABASE_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await baseFetch(input, requestInit);
      if (!proofRetried) {
        proofRetried = true;
        const renewed = await renewRejectedCustomerPortalProof(input, requestInit, response);
        if (renewed) { requestInit = renewed; return await baseFetch(input, requestInit); }
      }
      return response;
    } catch (error) {
      lastError = error;

      if (!isTransientNetworkFetchError(error) || attempt === SUPABASE_NETWORK_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await waitMs(SUPABASE_NETWORK_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
};

// Supabase already serializza le operazioni dentro una singola istanza, ma in
// sviluppo web Fast Refresh puo lasciare per pochi istanti due istanze vive
// nello stesso tab. Se entrambe arrivano direttamente al Web Lock, il timeout
// di recupero puo farle rubare il lock a vicenda e Expo mostra l'overlay rosso.
// La coda di processo elimina quella gara nello stesso tab; il Navigator Lock
// continua a proteggere correttamente sessione e storage tra tab differenti.
// Non imponiamo un timeout al Web Lock: quando una pagina viene ricaricata il
// browser rilascia automaticamente il lock del vecchio contesto, senza steal.
const browserSupabaseAuthLock: LockFunc = (name, _acquireTimeout, fn) =>
  processLock(`salonpro-web:${name}`, -1, () => navigatorLock(name, -1, fn));

const createSalonProSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: supabaseFetch,
    },
    auth: {
      storage: shouldPersistAuthSession ? resolveSupabaseStorage() : memoryStorage,
      autoRefreshToken: shouldPersistAuthSession,
      persistSession: shouldPersistAuthSession,
      detectSessionInUrl: isBrowser,
      // Browser soltanto. Native continua a usare esattamente il lock Supabase
      // predefinito e non passa da questa serializzazione web.
      ...(isBrowser
        ? {
            lock: browserSupabaseAuthLock,
            lockAcquireTimeout: -1,
          }
        : {}),
    },
  });

type SalonProSupabaseClient = ReturnType<typeof createSalonProSupabaseClient>;
const browserSupabaseSingleton = globalThis as typeof globalThis & {
  __salonProSupabaseClient?: SalonProSupabaseClient;
};

// Un solo client persistente per tab: il modulo puo essere ricaricato da Metro,
// ma non deve avviare una seconda inizializzazione auth contro lo stesso lock.
export const supabase = isBrowser
  ? (browserSupabaseSingleton.__salonProSupabaseClient ??=
      createSalonProSupabaseClient())
  : createSalonProSupabaseClient();

/**
 * Client stateless reserved for anonymous customer-facing RPCs.
 *
 * The shared application client can legitimately contain an owner session. A
 * stale or expired owner token must never prevent a customer from opening a
 * salon, validating credentials or loading the public catalogue. Keeping this
 * client session-free guarantees that public endpoints always use the anon key
 * and cannot inherit authentication state from another app area.
 */
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: supabaseFetch,
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    // On web this stateless client lives beside the authenticated singleton.
    // Give it a distinct key so GoTrue does not initialize two clients against
    // the same browser storage namespace. Native behavior remains unchanged.
    ...(isBrowser && SUPABASE_AUTH_STORAGE_KEY
      ? { storageKey: `${SUPABASE_AUTH_STORAGE_KEY}-public` }
      : {}),
  },
});

export const getSupabaseSessionSafely = async (): Promise<
  Awaited<ReturnType<typeof supabase.auth.getSession>>
> => {
  try {
    return await supabase.auth.getSession();
  } catch (error) {
    if (isInvalidSupabaseRefreshTokenError(error)) {
      await clearInvalidSupabaseAuthSession();
      return {
        data: { session: null },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>;
    }

    throw error;
  }
};
