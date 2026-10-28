import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const buildVaultKey = (salonCode: string, email: string, phone: string) => {
  const identity = `${salonCode.trim().toLowerCase()}|${email.trim().toLowerCase()}|${phone.replace(/\D+/g, '')}`;
  let hash = 2166136261;

  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `salon_manager_client_password_${(hash >>> 0).toString(16)}`;
};

const WEB_PASSWORD_HANDOFF_TTL_MS = 30_000;

type WebPasswordHandoff = {
  password: string;
  expiresAt: number;
};

const saveWebPasswordHandoff = (key: string, password: string) => {
  if (typeof window === 'undefined') return;

  const payload: WebPasswordHandoff = {
    password,
    expiresAt: Date.now() + WEB_PASSWORD_HANDOFF_TTL_MS,
  };

  window.sessionStorage.setItem(key, JSON.stringify(payload));
};

const consumeWebPasswordHandoff = (key: string) => {
  if (typeof window === 'undefined') return '';

  const raw = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);
  if (!raw) return '';

  try {
    const payload = JSON.parse(raw) as Partial<WebPasswordHandoff>;
    if (
      typeof payload.password !== 'string' ||
      !payload.password ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt < Date.now()
    ) {
      return '';
    }

    return payload.password;
  } catch {
    return '';
  }
};

export const saveClientPasswordToVault = async ({
  salonCode,
  email,
  phone,
  password,
}: {
  salonCode: string;
  email: string;
  phone: string;
  password: string;
}) => {
  if (!salonCode.trim() || !email.trim() || !phone.trim() || !password) return;

  const key = buildVaultKey(salonCode, email, phone);
  if (Platform.OS === 'web') {
    try {
      saveWebPasswordHandoff(key, password);
    } catch {
      // The validated access still falls back to the clean login screen if
      // sessionStorage is unavailable (for example in strict private modes).
    }
    return;
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  await SecureStore.setItemAsync(key, password, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
};

export const readClientPasswordFromVault = async ({
  salonCode,
  email,
  phone,
}: {
  salonCode: string;
  email: string;
  phone: string;
}) => {
  if (!salonCode.trim() || !email.trim() || !phone.trim()) return '';

  const key = buildVaultKey(salonCode, email, phone);
  if (Platform.OS === 'web') {
    try {
      return consumeWebPasswordHandoff(key);
    } catch {
      return '';
    }
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return '';

  return (
    (await SecureStore.getItemAsync(key).catch(() => null)) ?? ''
  );
};
