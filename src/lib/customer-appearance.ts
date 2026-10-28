import type { AppearanceMode } from '../../components/access-appearance-context';
import type { PaymentIdentity } from './client-payment-session';
import { publicSupabase } from './supabase';
import { withClientDeadline } from './client-request-deadline';

export const isAppearanceMode = (value: unknown): value is AppearanceMode => value === 'system' || value === 'day' || value === 'night';
const args = (identity: PaymentIdentity) => ({ p_salon_code: identity.salonCode.trim().toLowerCase(), p_customer_email: identity.email.trim().toLowerCase(), p_customer_phone: identity.phone.replace(/\D/g, '').slice(-10) });
export async function readCustomerAppearance(identity: PaymentIdentity): Promise<AppearanceMode> {
  const { data, error } = await withClientDeadline(publicSupabase.rpc('get_customer_appearance_preference_v1', args(identity)));
  if (error || !isAppearanceMode(data)) throw new Error('Impossibile caricare l’aspetto salvato. Riprova.');
  return data;
}
export async function saveCustomerAppearance(identity: PaymentIdentity, mode: AppearanceMode): Promise<void> {
  const { data, error } = await withClientDeadline(publicSupabase.rpc('set_customer_appearance_preference_v1', { ...args(identity), p_mode: mode }));
  if (error || data !== mode) throw new Error('Aspetto applicato su questo dispositivo, ma non salvato sul server. Riprova.');
}
