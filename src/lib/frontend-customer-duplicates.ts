import { supabase } from './supabase';

const normalizeDuplicateEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizeDuplicatePhone = (value?: string | null) =>
  value?.replace(/\D+/g, '').slice(-10) ?? '';
const normalizeDuplicateSalonCode = (value?: string | null) => value?.trim().toLowerCase() ?? '';

export type FrontendCustomerDuplicateMatch = {
  emailTaken: boolean;
  phoneTaken: boolean;
};

export const findFrontendCustomerDuplicate = async ({
  salonCode,
  email,
  phone,
}: {
  salonCode: string;
  email?: string | null;
  phone?: string | null;
}): Promise<FrontendCustomerDuplicateMatch | null> => {
  const normalizedSalonCode = normalizeDuplicateSalonCode(salonCode);
  const normalizedEmail = normalizeDuplicateEmail(email);
  const normalizedPhone = normalizeDuplicatePhone(phone);

  if (!normalizedSalonCode || (!normalizedEmail && !normalizedPhone)) {
    return null;
  }

  const { data: duplicateData, error: duplicateError } = await supabase.rpc(
    'check_public_customer_registration_duplicate',
    {
      p_salon_code: normalizedSalonCode,
      p_customer_email: normalizedEmail || null,
      p_customer_phone: normalizedPhone || null,
    }
  );

  if (!duplicateError && duplicateData && typeof duplicateData === 'object' && !Array.isArray(duplicateData)) {
    const duplicateRecord = duplicateData as Record<string, unknown>;
    const emailTaken = duplicateRecord.emailTaken === true || duplicateRecord.email_taken === true;
    const phoneTaken = duplicateRecord.phoneTaken === true || duplicateRecord.phone_taken === true;
    return emailTaken || phoneTaken ? { emailTaken, phoneTaken } : null;
  }

  if (duplicateError) {
    const message = `${duplicateError.code ?? ''} ${duplicateError.message ?? ''}`.toLowerCase();
    if (!message.includes('check_public_customer_registration_duplicate')) {
      throw duplicateError;
    }
  }

  const { data, error } = await supabase.rpc('find_public_customer_by_credentials', {
    p_salon_code: normalizedSalonCode,
    p_customer_email: normalizedEmail || null,
    p_customer_phone: normalizedPhone || null,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const score = Number(record.score ?? 0);

  if (!Number.isFinite(score) || score <= 0) {
    return null;
  }

  const emailTaken =
    !!normalizedEmail && normalizeDuplicateEmail(String(record.email ?? '')) === normalizedEmail;
  const phoneTaken =
    !!normalizedPhone && normalizeDuplicatePhone(String(record.telefono ?? '')) === normalizedPhone;

  return emailTaken || phoneTaken ? { emailTaken, phoneTaken } : null;
};
