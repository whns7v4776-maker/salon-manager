import { supabase } from './supabase';
import { withClientDeadline } from './client-request-deadline';
import { rememberVerifiedCustomerEmail } from './customer-portal-access';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) =>
  value.replace(/\D+/g, '').slice(-10);
const normalizeSalonCode = (value: string) => value.trim().toLowerCase();

export const isSalonCustomerEmailCompletionCandidate = ({
  matchedEmail,
  matchedPhone,
  submittedPhone,
}: {
  matchedEmail: unknown;
  matchedPhone: unknown;
  submittedPhone: string;
}) =>
  normalizeEmail(String(matchedEmail ?? '')) === '' &&
  normalizePhone(String(matchedPhone ?? '')) !== '' &&
  normalizePhone(String(matchedPhone ?? '')) === normalizePhone(submittedPhone);

export async function completeSalonCustomerEmail({
  salonCode,
  email,
  phone,
  otpToken,
}: {
  salonCode: string;
  email: string;
  phone: string;
  otpToken: string;
}) {
  try {
  const { data, error } = await withClientDeadline(supabase.rpc('complete_public_customer_email_resumable', {
    p_salon_code: normalizeSalonCode(salonCode),
    p_customer_email: normalizeEmail(email),
    p_customer_phone: normalizePhone(phone),
    p_otp_token: otpToken.trim(),
  }));

  if (error) {
    const errorText = [
      error.code,
      error.message,
      error.details,
      error.hint,
    ]
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();

    if (errorText.includes('duplicate_email')) {
      return {
        ok: false as const,
        error: 'Questa email è già associata a un altro cliente del salone.',
      };
    }

    if (
      errorText.includes('customer_email_completion_otp_invalid') ||
      errorText.includes('customer_email_completion_not_available')
    ) {
      return {
        ok: false as const,
        error: 'Verifica scaduta o contatto già aggiornato. Riprova dall’accesso.',
      };
    }

    return {
      ok: false as const,
      error: 'Non riesco a salvare l’email sul contatto. Riprova tra poco.',
    };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      error: 'Non riesco a salvare l’email sul contatto. Riprova tra poco.',
    };
  }

  rememberVerifiedCustomerEmail({ salonCode, email, phone }, otpToken);
  return { ok: true as const };
  } catch {
    return {ok:false as const,error:'Conferma non ricevuta. Controlla la connessione e riprova: recupereremo il completamento senza chiederti un altro codice.'};
  }
}
