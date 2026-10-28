import type { LoyaltyEarningRule } from './loyalty-earning';
import {
  withCustomerPaymentToken,
  customerPaymentAccessError,
  type PaymentIdentity,
} from "./client-payment-session";
import { publicSupabase } from "./supabase";
import type { CustomerPackage } from "./service-packages";
export type GiftCard = {
  id: string;
  code: string;
  amount_cents: number;
  available_cents: number;
  expires_on: string | null;
  message: string;
  sender_name?: string;
  salon_name?: string;
  customer_name?: string;
};
export type BenefitsWallet = {
  notifications?: {id:string;title:string;body:string;created_at:string}[];
  points: number;
  settings: Partial<LoyaltyEarningRule> & {
    packages_enabled?: boolean;
    loyalty_enabled?: boolean;
    gift_cards_enabled?: boolean;
    points_per_service?: number;
  };
  rewards: { id: string; name: string; points_cost: number; description?: string; reward_type?: string; value?: number; expires_on?: string | null }[];
  giftCards: GiftCard[];
  packages: CustomerPackage[];
};
export const benefitToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function benefitStatus(
  available: number,
  expires: string | null,
  date = benefitToday(),
  starts?: string,
) {
  if (expires && expires < date) return "Scaduto";
  if (starts && starts > date) return "Non ancora valido";
  return available > 0 ? "Disponibile" : "Esaurito o già prenotato";
}
export async function loadCustomerBenefits(
  identity: PaymentIdentity,
): Promise<BenefitsWallet> {
  return withCustomerPaymentToken(identity, async token => {
  const { data, error } = await publicSupabase.rpc("customer_benefits_wallet", {
    p_salon_code: identity.salonCode,
    p_email: identity.email,
    p_phone: identity.phone,
    p_token: token,
  });
  if (error) throw customerPaymentAccessError(error);
  return data;
  });
}
