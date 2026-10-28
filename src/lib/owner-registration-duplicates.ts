import { supabase } from './supabase';

const normalizeOwnerEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizeOwnerPhone = (value?: string | null) => value?.replace(/\D+/g, '').slice(-10) ?? '';

export type OwnerRegistrationDuplicateMatch = {
  emailTaken: boolean;
  phoneTaken: boolean;
  subscriptionStatus?: string;
};

export const buildOwnerRegistrationDuplicateMessage = ({
  emailTaken,
  phoneTaken,
  subscriptionStatus,
}: OwnerRegistrationDuplicateMatch) => {
  const suffix =
    subscriptionStatus === 'expired' || subscriptionStatus === 'suspended'
      ? ' Accedi per riattivare o sistemare l’abbonamento.'
      : ' Usa Accedi o Recupera password.';

  if (emailTaken && phoneTaken) {
    return `Account salone gia registrato con questa mail e questo cellulare aziendale.${suffix}`;
  }

  if (emailTaken) {
    return `Account salone gia registrato con questa mail.${suffix}`;
  }

  if (phoneTaken) {
    return `Account salone gia registrato con questo cellulare aziendale.${suffix}`;
  }

  return `Account salone gia registrato.${suffix}`;
};

export const findOwnerRegistrationDuplicate = async ({
  email,
  businessPhone,
}: {
  email?: string | null;
  businessPhone?: string | null;
}): Promise<OwnerRegistrationDuplicateMatch | null> => {
  const normalizedEmail = normalizeOwnerEmail(email);
  const normalizedPhone = normalizeOwnerPhone(businessPhone);

  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  const { data, error } = await supabase.rpc('check_owner_registration_duplicate', {
    p_owner_email: normalizedEmail || null,
    p_business_phone: normalizedPhone || null,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const emailTaken = record.emailTaken === true || record.email_taken === true;
  const phoneTaken = record.phoneTaken === true || record.phone_taken === true;
  const subscriptionStatus =
    typeof record.subscriptionStatus === 'string'
      ? record.subscriptionStatus
      : typeof record.subscription_status === 'string'
        ? record.subscription_status
        : undefined;

  return emailTaken || phoneTaken ? { emailTaken, phoneTaken, subscriptionStatus } : null;
};
