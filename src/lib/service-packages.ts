import { publicSupabase } from "./supabase";
import {
  withCustomerPaymentToken,
  customerPaymentAccessError,
  type PaymentIdentity,
} from "./client-payment-session";
const packageListeners = new Set<() => void>();
export function subscribePackageChanges(listener: () => void) {
  packageListeners.add(listener);
  return () => {
    packageListeners.delete(listener);
  };
}
export function refreshServicePackages() {
  packageListeners.forEach((listener) => listener());
}

export type PackageEntitlement = {
  kind: "service" | "composition";
  id: string;
  name: string;
  componentIds: string[];
};
export type PackageCatalog = {
  id: string;
  name: string;
  entitlements: PackageEntitlement[];
  uses: number;
  months: number;
  price_cents: number;
  product_discount: number;
  revision: number;
  archived: boolean;
  online_visible?: boolean;
};
export type CustomerPackage = {
  id: string;
  name: string;
  entitlements: PackageEntitlement[];
  uses: number;
  starts_on: string;
  expires_on: string;
  price_cents: number;
  product_discount: number;
  reserved: number;
  consumed: number;
  available: number;
  bookings?: { requestId: string; state: string }[];
};
export const packageMoney = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
// Idempotency identifier, never an authentication token.
export const benefitOperationId = () =>
  globalThis.crypto?.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
export function eligiblePackages(
  packages: CustomerPackage[],
  kind: PackageEntitlement["kind"],
  id: string,
  date: string,
) {
  return packages.filter(
    (p) =>
      p.available > 0 &&
      p.starts_on <= date &&
      date <= p.expires_on &&
      p.entitlements.some((s) => s.kind === kind && s.id === id),
  );
}
export async function loadCustomerPackages(
  identity: PaymentIdentity,
): Promise<CustomerPackage[]> {
  return withCustomerPaymentToken(identity, async token => {
  const { data, error } = await publicSupabase.rpc("customer_package_wallet", {
    p_salon_code: identity.salonCode,
    p_email: identity.email,
    p_phone: identity.phone,
    p_token: token,
  });
  if (error) throw customerPaymentAccessError(error);
  return data ?? [];
  });
}
export async function createPackageBooking(
  identity: PaymentIdentity,
  packageId: string,
  key: string,
  rpc: string,
  payload: Record<string, unknown>,
) {
  return withCustomerPaymentToken(identity, async token => {
  // Retrying the same purchase/use is safe: the server owns the idempotency key.
  const args = {
    p_package_id: packageId,
    p_token: token,
    p_key: key,
    p_rpc: rpc,
    p_payload: payload,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await publicSupabase.rpc(
      "create_package_booking",
      args,
    );
    if (!error) {
      refreshServicePackages();
      return data as Record<string, any>;
    }
    if (
      attempt === 1 ||
      !/network|fetch|timeout|timed out|502|503|504|aborted|canceling statement/i.test(
        error.message,
      )
    )
      throw customerPaymentAccessError(error);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error("Conferma del pacchetto non disponibile. Riprova.");
  });
}
