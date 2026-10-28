export type CustomerRegistrationStatus = 'approved' | 'pending';

export type CustomerRegistrationAccess = {
  identityKey: string;
  status: CustomerRegistrationStatus | 'removed';
};

export const CUSTOMER_REGISTRATION_PENDING_MESSAGE =
  'Registrazione completata. Il salone deve ancora abilitarti alle prenotazioni.';

export const buildCustomerRegistrationRemovalNotice = (previousStatus: CustomerRegistrationAccess['status']) =>
  previousStatus === 'pending'
    ? {
        title: 'Registrazione non approvata',
        message: 'Il salone non ha approvato la tua registrazione. Il tuo account resta disponibile negli altri saloni.',
      }
    : {
        title: 'Account non più attivo',
        message: 'Questo account non è più attivo per questo salone. Gli accessi agli altri saloni restano disponibili.',
      };

export const buildCustomerRegistrationIdentityKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}): string => {
  const normalizedSalonCode = String(salonCode ?? '').trim().toLowerCase();
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedPhone = String(phone ?? '').replace(/\D/g, '').slice(-10);
  return normalizedSalonCode && normalizedEmail && normalizedPhone
    ? `${normalizedSalonCode}|${normalizedEmail}|${normalizedPhone}`
    : '';
};

export const normalizeCustomerRegistrationStatus = (value: unknown): CustomerRegistrationStatus =>
  value === 'pending' ? 'pending' : 'approved';

// Only an explicit, successful identity response can remove a session. A
// timeout, missing RPC, or incomplete response must never be treated as refusal.
export const parseCustomerRegistrationAccess = (
  value: unknown,
  identityKey: string,
): CustomerRegistrationAccess | null => {
  if (!identityKey || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.found === false) return { identityKey, status: 'removed' };
  if (row.found !== true) return null;
  const status = row.registrationStatus ?? row.registration_status;
  if (status !== 'approved' && status !== 'pending') return null;
  return { identityKey, status };
};

export const getCustomerRegistrationStatusForIdentity = ({
  identityKey,
  authority,
  fallbackStatus,
}: {
  identityKey: string;
  authority: CustomerRegistrationAccess | null;
  fallbackStatus?: unknown;
}): CustomerRegistrationAccess['status'] =>
  identityKey && authority?.identityKey === identityKey
    ? authority.status
    : normalizeCustomerRegistrationStatus(fallbackStatus);

export const isCustomerRegistrationPendingError = (error: unknown): boolean => {
  if (!error) return false;
  const row = typeof error === 'object' ? error as Record<string, unknown> : null;
  return [row?.error, row?.message, row?.detail, row?.details, typeof error === 'string' ? error : '']
    .some(value => String(value ?? '').toLowerCase().includes('customer_registration_pending'));
};
