import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

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

const supabaseUrl = resolveRequiredEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = resolveRequiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

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
  const { default: AsyncStorage } = require('@react-native-async-storage/async-storage') as {
    default: SupabaseStorage;
  };

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: resolveSupabaseStorage(),
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: isBrowser,
  },
});
