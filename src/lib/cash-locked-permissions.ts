import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the Cassa still allows while protection is on and the owner has not unlocked it.
 * Chosen by the owner, stored on this device next to the protection setting.
 */
export type CashLockedPermissions = {
  newPayment: boolean;
  completePending: boolean;
  payments: boolean;
  movements: boolean;
  totals: boolean;
  reports: boolean;
};
export const DEFAULT_CASH_LOCKED_PERMISSIONS: CashLockedPermissions = {
  newPayment: true,
  completePending: true,
  payments: true,
  movements: false,
  totals: false,
  reports: false,
};
export const CASH_LOCKED_PERMISSION_LABELS: { key: keyof CashLockedPermissions; title: string; hint: string }[] = [
  { key: 'newPayment', title: 'Registrare nuovi incassi', hint: 'Nuovo incasso, scelta del servizio e del prezzo.' },
  { key: 'completePending', title: 'Completare gli incassi in attesa', hint: 'Movimenti ancora da incassare.' },
  { key: 'payments', title: 'Pagamenti e QR', hint: 'Link e QR per far pagare il cliente.' },
  { key: 'movements', title: 'Vedere i movimenti incassati', hint: 'Elenco degli incassi già registrati.' },
  { key: 'totals', title: 'Vedere i totali', hint: 'Incassato, contanti, carta e da incassare.' },
  { key: 'reports', title: 'Report ed export', hint: 'PDF, Excel e confronto con il periodo precedente.' },
];

const keyFor = (scope: string) => `salonpro:cash-locked-permissions:v1:${scope}`;
const values = new Map<string, CashLockedPermissions>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const loading = new Set<string>();

function load(scope: string) {
  if (!scope || values.has(scope) || loading.has(scope)) return;
  loading.add(scope);
  void AsyncStorage.getItem(keyFor(scope))
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as Partial<CashLockedPermissions>) : {};
      values.set(scope, { ...DEFAULT_CASH_LOCKED_PERMISSIONS, ...parsed });
    })
    .catch(() => values.set(scope, DEFAULT_CASH_LOCKED_PERMISSIONS))
    .finally(() => { loading.delete(scope); emit(); });
}

export function useCashLockedPermissions(scope: string) {
  const permissions = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => values.get(scope) ?? DEFAULT_CASH_LOCKED_PERMISSIONS,
    () => DEFAULT_CASH_LOCKED_PERMISSIONS,
  );
  useEffect(() => { load(scope); }, [scope]);
  const setPermission = (key: keyof CashLockedPermissions, value: boolean) => {
    if (!scope) return;
    const next = { ...(values.get(scope) ?? DEFAULT_CASH_LOCKED_PERMISSIONS), [key]: value };
    values.set(scope, next);
    emit();
    void AsyncStorage.setItem(keyFor(scope), JSON.stringify(next)).catch(() => undefined);
  };
  return { permissions, setPermission };
}
