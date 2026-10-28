import { useSyncExternalStore } from "react";

const PREFIX = "salonpro:cash-device-privacy:v1:";
const listeners = new Set<() => void>();
const values = new Map<string, boolean>();
const emit = () => listeners.forEach((listener) => listener());
const key = (scope: string) => PREFIX + scope;
function read(scope: string): boolean | null {
  if (!scope || typeof window === "undefined") return null;
  try {
    const enabled = window.localStorage.getItem(key(scope)) === "enabled";
    values.set(scope, enabled);
    return enabled;
  } catch {
    return null;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(PREFIX)) {
      values.clear();
      emit();
    }
  };
  if (typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}
export function useCashDevicePrivacy(scope: string) {
  const enabled = useSyncExternalStore(
    subscribe,
    () => (values.has(scope) ? values.get(scope)! : read(scope)),
    () => null,
  );
  return {
    enabled,
    setEnabled: (next: boolean) => {
      if (!scope || typeof window === "undefined")
        throw new Error("Dispositivo non disponibile.");
      window.localStorage.setItem(key(scope), next ? "enabled" : "disabled");
      values.set(scope, next);
      emit();
    },
  };
}
