import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  assignFallbackOperatorsToAppointments,
  AvailabilitySettings,
  buildSalonCapacityOperatorId,
  doesServiceUseOperators,
  doesTimeRangeConflictWithAppointment,
  getEligibleOperatorsForService,
  getServiceDuration,
  normalizeAvailabilitySettings,
  normalizeRoleName,
  OperatorAvailability,
  OperatorAvailabilityRange,
  timeToMinutes,
} from '../lib/booking';
import {
  fetchClientPortalAvailabilitySettings,
  fetchClientPortalSnapshot,
  publishClientPortalSnapshot,
  updateClientPortalAvailabilitySettings,
} from '../lib/client-portal';
import { formatCustomerFullNameValue, formatCustomerNamePart } from '../lib/customer-name';
import { AppLanguage, resolveStoredAppLanguage } from '../lib/i18n';
import {
  buildSalonCode,
  createDefaultWorkspace,
  formatSalonAddress,
  isWorkspaceAccessible,
  normalizeSalonCode,
  normalizeWorkspace,
  resolveSalonDisplayName,
  SalonWorkspace,
} from '../lib/platform';
import {
  flushQueuedPushNotifications,
  queueWorkspacePushNotification,
} from '../lib/push/push-notifications';
import { normalizeServiceAccentKey } from '../lib/service-accents';
import { supabase } from '../lib/supabase';

const STORAGE_KEYS = {
  account_attivo: 'salon_manager_account_attivo',
  owner_accounts: 'salon_manager_owner_accounts',
  owner_session: 'salon_manager_owner_session',
  biometric_enabled: 'salon_manager_biometric_enabled',
  biometric_login_email: 'salon_manager_biometric_login_email',
  biometric_login_password: 'salon_manager_biometric_login_password',
  app_language: 'salon_manager_app_language',
  workspace: 'salon_manager_workspace',
  clienti: 'salon_manager_clienti',
  appuntamenti: 'salon_manager_appuntamenti',
  movimenti: 'salon_manager_movimenti',
  servizi: 'salon_manager_servizi',
  carte: 'salon_manager_carte',
  eventi: 'salon_manager_eventi',
  eventi_template: 'salon_manager_eventi_template',
  richieste_prenotazione: 'salon_manager_richieste_prenotazione',
  recently_deleted_appointments: 'salon_manager_recently_deleted_appointments',
  recently_deleted_customers: 'salon_manager_recently_deleted_customers',
  availability_settings: 'salon_manager_availability_settings',
  operatori: 'salon_manager_operatori',
  macchinari: 'salon_manager_macchinari',
  onboarding_completed: 'salon_manager_onboarding_completed',
  daily_auto_cashout: 'salon_manager_daily_auto_cashout',
  service_card_color_overrides: 'salon_manager_service_card_color_overrides',
  role_card_color_overrides: 'salon_manager_role_card_color_overrides',
};

let devFallbackClientiAfterRefreshCount = 0;
const RECENTLY_DELETED_APPOINTMENT_GUARD_MS = 600000;
const RECENTLY_CREATED_APPOINTMENT_GUARD_MS = 30000;
const RECENTLY_DELETED_CUSTOMER_GUARD_MS = 600000;
const EXPO_GO_OWNER_LIVE_REFRESH_INTERVAL_MS = 3000;
const PORTAL_REMOTE_OVERRIDE_GUARD_MS = 5000;
const DEADLOCK_ERROR_CODE = '40P01';
const DEADLOCK_RETRY_DELAYS_MS = [120, 300, 700];
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';

const normalizeAccountEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizeIdentityText = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const isUuidValue = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isLikelyNetworkRequestFailure = (error: unknown) => {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

  return message.trim().toLowerCase().includes('network request failed');
};
const normalizeTimeIdentity = (value?: string | null) => {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return '';

  try {
    return String(timeToMinutes(normalized));
  } catch {
    return normalized;
  }
};
const parseIsoTimestampToMs = (value?: string | null) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const buildNextMonotonicIsoTimestamp = (
  previousValue?: string | null,
  requestedValue?: string | null
) => {
  const previousMs = parseIsoTimestampToMs(previousValue);
  const requestedMs = parseIsoTimestampToMs(requestedValue);
  const nextMs = Math.max(Date.now(), requestedMs, previousMs + 1);
  return new Date(nextMs).toISOString();
};
const resolveLatestBooleanByTimestamp = ({
  localValue,
  localUpdatedAt,
  remoteValue,
  remoteUpdatedAt,
}: {
  localValue: boolean | undefined;
  localUpdatedAt?: string | null;
  remoteValue: boolean | undefined;
  remoteUpdatedAt?: string | null;
}) => {
  const localTs = parseIsoTimestampToMs(localUpdatedAt);
  const remoteTs = parseIsoTimestampToMs(remoteUpdatedAt);

  if (remoteTs > localTs) {
    return {
      value: remoteValue ?? localValue,
      updatedAt: remoteUpdatedAt ?? localUpdatedAt ?? undefined,
      remoteWins: true,
    };
  }

  return {
    value: localValue ?? remoteValue,
    updatedAt: localUpdatedAt ?? remoteUpdatedAt ?? undefined,
    remoteWins: false,
  };
};
const resolveLatestGuidedSettingsByTimestamp = ({
  localSettings,
  remoteSettings,
}: {
  localSettings: AvailabilitySettings;
  remoteSettings: AvailabilitySettings;
}) => {
  const localTs = parseIsoTimestampToMs(localSettings.guidedSlotsUpdatedAt);
  const remoteTs = parseIsoTimestampToMs(remoteSettings.guidedSlotsUpdatedAt);
  const remoteWins = remoteTs > localTs;

  return {
    guidedSlotsEnabled: remoteWins
      ? remoteSettings.guidedSlotsEnabled
      : localSettings.guidedSlotsEnabled,
    guidedSlotsStrategy: remoteWins
      ? remoteSettings.guidedSlotsStrategy
      : localSettings.guidedSlotsStrategy,
    guidedSlotsVisibility: remoteWins
      ? remoteSettings.guidedSlotsVisibility
      : localSettings.guidedSlotsVisibility,
    guidedSlotsUpdatedAt: remoteWins
      ? remoteSettings.guidedSlotsUpdatedAt ?? localSettings.guidedSlotsUpdatedAt
      : localSettings.guidedSlotsUpdatedAt ?? remoteSettings.guidedSlotsUpdatedAt,
  };
};
const mergeAvailabilitySettingsWithCriticalTimestamps = (
  localSettings: AvailabilitySettings,
  incomingSettings: Partial<AvailabilitySettings> | null | undefined
) => {
  const normalizedIncoming = normalizeAvailabilitySettings(incomingSettings);
  const guidedMerge = resolveLatestGuidedSettingsByTimestamp({
    localSettings,
    remoteSettings: normalizedIncoming,
  });

  return normalizeAvailabilitySettings({
    ...normalizedIncoming,
    guidedSlotsEnabled: guidedMerge.guidedSlotsEnabled,
    guidedSlotsStrategy: guidedMerge.guidedSlotsStrategy,
    guidedSlotsVisibility: guidedMerge.guidedSlotsVisibility,
    guidedSlotsUpdatedAt: guidedMerge.guidedSlotsUpdatedAt,
  });
};
const mergeWorkspaceWithCriticalTimestamps = (
  localWorkspace: SalonWorkspace,
  incomingWorkspace: Partial<SalonWorkspace> | null | undefined,
  ownerEmail: string
) => {
  const normalizedIncoming = normalizeWorkspace(incomingWorkspace, ownerEmail);
  const autoAcceptMerge = resolveLatestBooleanByTimestamp({
    localValue: localWorkspace.autoAcceptBookingRequests,
    localUpdatedAt: localWorkspace.autoAcceptBookingRequestsUpdatedAt,
    remoteValue: normalizedIncoming.autoAcceptBookingRequests,
    remoteUpdatedAt: normalizedIncoming.autoAcceptBookingRequestsUpdatedAt,
  });

  return normalizeWorkspace(
    {
      ...normalizedIncoming,
      autoAcceptBookingRequests:
        autoAcceptMerge.value ?? normalizedIncoming.autoAcceptBookingRequests,
      autoAcceptBookingRequestsUpdatedAt: autoAcceptMerge.updatedAt,
    },
    ownerEmail
  );
};
const areAvailabilitySettingsEquivalent = (
  first: AvailabilitySettings,
  second: AvailabilitySettings
) => JSON.stringify(first) === JSON.stringify(second);
const buildAvailabilitySettingsSyncSignature = (settings: AvailabilitySettings) =>
  JSON.stringify(normalizeAvailabilitySettings(settings));
const buildWorkspaceSyncSignature = (workspace: SalonWorkspace) =>
  JSON.stringify(normalizeWorkspace(workspace, workspace.ownerEmail));
const PORTAL_CRITICAL_OWNER_TOGGLE_GUARD_MS = PORTAL_REMOTE_OVERRIDE_GUARD_MS * 3;
const PORTAL_REMOTE_REHYDRATION_SUPPRESS_PUBLISH_MS = 2000;
const buildAppointmentIdentityKey = ({
  date,
  time,
  customerName,
  serviceName,
  operatorId,
  operatorName,
}: {
  date: string;
  time: string;
  customerName: string;
  serviceName: string;
  operatorId?: string | null;
  operatorName?: string | null;
}) =>
  [
    date,
    normalizeTimeIdentity(time),
    normalizeIdentityText(customerName),
    normalizeIdentityText(serviceName),
    normalizeIdentityText(operatorId),
    normalizeIdentityText(operatorName),
  ].join('::');

const normalizePhoneForIdentity = (value?: string | null) => {
  const digitsOnly = (value ?? '').replace(/\D+/g, '');
  return digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
};
const normalizeOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', '1', 'yes'].includes(normalized)) return true;
    if (['false', 'f', '0', 'no'].includes(normalized)) return false;
  }

  return undefined;
};
const formatPushCustomerName = (value?: string | null) =>
  (value ?? '').trim().toLocaleUpperCase('it-IT');
const scheduleDelayedPushFlush = (delayMs = 1200) => {
  setTimeout(() => {
    void flushQueuedPushNotifications();
  }, delayMs);
};

const OWNER_AUTH_ROUTE = 'proprietario';
const OWNER_PASSWORD_RESET_ROUTE = 'reset-password';
const resolvePublicClientBaseUrl = () => {
  const expoExtra =
    (Constants.expoConfig?.extra as { publicClientBaseUrl?: string } | undefined) ?? undefined;
  const manifestExtra =
    ((Constants as typeof Constants & {
      manifest?: { extra?: { publicClientBaseUrl?: string } };
    }).manifest?.extra as { publicClientBaseUrl?: string } | undefined) ?? undefined;
  const manifest2Extra =
    ((Constants as typeof Constants & {
      manifest2?: { extra?: { expoClient?: { extra?: { publicClientBaseUrl?: string } } } };
    }).manifest2?.extra?.expoClient?.extra as { publicClientBaseUrl?: string } | undefined) ??
    undefined;

  const configuredBaseUrl =
    expoExtra?.publicClientBaseUrl ??
    manifestExtra?.publicClientBaseUrl ??
    manifest2Extra?.publicClientBaseUrl ??
    DEFAULT_PUBLIC_CLIENT_BASE_URL;
  const normalizedValue = configuredBaseUrl?.trim().replace(/\/+$/, '');

  if (!normalizedValue) {
    return null;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');

    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

const buildOwnerAuthRedirectUrl = (mode: 'signup' | 'recovery') => {
  if (mode === 'recovery') {
    const publicClientBaseUrl = resolvePublicClientBaseUrl() ?? DEFAULT_PUBLIC_CLIENT_BASE_URL;
    return `${publicClientBaseUrl}/${OWNER_PASSWORD_RESET_ROUTE}?recovery=1`;
  }

  return ExpoLinking.createURL(OWNER_AUTH_ROUTE, {
    scheme: 'salonmanager',
    queryParams: { confirmed: '1' },
  });
};

const parseSupabaseAuthCallbackUrl = (incomingUrl?: string | null) => {
  const normalizedUrl = incomingUrl?.trim();
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const searchParams = parsedUrl.searchParams;
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

    const accessToken =
      hashParams.get('access_token') ?? searchParams.get('access_token') ?? undefined;
    const refreshToken =
      hashParams.get('refresh_token') ?? searchParams.get('refresh_token') ?? undefined;
    const code = searchParams.get('code') ?? hashParams.get('code') ?? undefined;
    const tokenHash =
      searchParams.get('token_hash') ?? hashParams.get('token_hash') ?? undefined;
    const eventType = hashParams.get('type') ?? searchParams.get('type') ?? undefined;
    const isRecovery =
      searchParams.get('recovery') === '1' ||
      hashParams.get('recovery') === '1' ||
      eventType === 'recovery';

    if ((!accessToken || !refreshToken) && !code && !tokenHash) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      code,
      tokenHash,
      eventType,
      isRecovery,
    };
  } catch (error) {
    console.log('Errore parsing callback auth Supabase:', error);
    return null;
  }
};

const buildCustomerIdentityKey = (item: {
  id?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
}) =>
  [
    normalizeIdentityText(item.id),
    normalizePhoneForIdentity(item.telefono),
    normalizeIdentityText(item.email),
    normalizeIdentityText(item.nome),
  ].join('::');

const buildScopedStorageKey = (baseKey: string, accountEmail: string) =>
  `${baseKey}__${normalizeAccountEmail(accountEmail)}`;

const isSupabaseAuthRateLimitError = (message?: string | null) => {
  const normalized = message?.trim().toLowerCase() ?? '';
  return (
    normalized.includes('rate limit') ||
    normalized.includes('for security purposes') ||
    normalized.includes('after 8 seconds')
  );
};

const isSupabaseAlreadyRegisteredError = (message?: string | null) => {
  const normalized = message?.trim().toLowerCase() ?? '';
  return (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already') ||
    normalized.includes('email address is already')
  );
};

const isSupabaseEmailNotConfirmedError = (message?: string | null) => {
  const normalized = message?.trim().toLowerCase() ?? '';
  return (
    normalized.includes('email not confirmed') ||
    normalized.includes('signup disabled') ||
    normalized.includes('confirmation')
  );
};

const formatOwnerAuthError = (message?: string | null, fallback = 'Operazione non riuscita.') => {
  const normalized = message?.trim();

  if (!normalized) {
    return fallback;
  }

  if (isSupabaseAuthRateLimitError(normalized)) {
    return 'Hai fatto troppi tentativi in poco tempo. Attendi qualche minuto e controlla anche la mail gia inviata.';
  }

  if (isSupabaseAlreadyRegisteredError(normalized)) {
    return 'Questa mail risulta gia registrata. Entra con la password corretta oppure usa Recupera password.';
  }

  if (isSupabaseEmailNotConfirmedError(normalized)) {
    return 'Account creato ma mail non ancora confermata. Apri la mail ricevuta e completa la conferma, poi accedi.';
  }

  return normalized;
};

const isDeadlockError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  if (maybeError.code === DEADLOCK_ERROR_CODE) {
    return true;
  }

  const mergedErrorText = [maybeError.message, maybeError.details, maybeError.hint]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ')
    .toLowerCase();

  return mergedErrorText.includes('deadlock');
};

const waitMs = (value: number) => new Promise<void>((resolve) => setTimeout(resolve, value));

const formatAppointmentDateTimeLabel = (dateValue?: string | null, timeValue?: string | null) => {
  const normalizedDate = dateValue?.trim() ?? '';
  const normalizedTime = timeValue?.trim() ?? '';

  if (normalizedDate && normalizedTime) {
    return `${normalizedDate} alle ${normalizedTime}`;
  }

  return normalizedDate || normalizedTime || '';
};

const formatPushDateLabel = (dateValue?: string | null) => {
  const normalizedDate = dateValue?.trim() ?? '';
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return normalizedDate;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatPushDateTimeLabel = (dateValue?: string | null, timeValue?: string | null) => {
  const normalizedDate = formatPushDateLabel(dateValue);
  const normalizedTime = timeValue?.trim() ?? '';

  if (normalizedDate && normalizedTime) {
    return `${normalizedDate} alle ${normalizedTime}`;
  }

  return normalizedDate || normalizedTime || '';
};

const getBookingRequestPushStatusLabel = (
  status: 'Accettata' | 'Rifiutata' | 'Annullata' | 'accepted' | 'rejected' | 'cancelled'
) =>
  status === 'Accettata' || status === 'accepted'
    ? 'Accettata'
    : status === 'Rifiutata' || status === 'rejected'
      ? 'Rifiutata'
      : 'Annullata';

const normalizeBookingRequestDbStatus = (
  status:
    | 'Accettata'
    | 'Rifiutata'
    | 'Annullata'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | string
    | null
    | undefined
): 'accepted' | 'rejected' | 'cancelled' | null => {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();

  switch (normalized) {
    case 'accettata':
    case 'accepted':
      return 'accepted';
    case 'rifiutata':
    case 'rejected':
      return 'rejected';
    case 'annullata':
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
};

const buildBookingRequestStatusPushCopy = ({
  status,
  serviceName,
  roleName,
  appointmentDate,
  appointmentTime,
  operatorName,
  customerName,
}: {
  status: 'Accettata' | 'Rifiutata' | 'Annullata' | 'accepted' | 'rejected' | 'cancelled';
  serviceName?: string | null;
  roleName?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  operatorName?: string | null;
  customerName?: string | null;
}) => {
  const statusLabel = getBookingRequestPushStatusLabel(status);
  const title =
    statusLabel === 'Accettata'
      ? 'Prenotazione Accettata'
      : statusLabel === 'Rifiutata'
        ? 'Prenotazione Rifiutata'
        : 'Prenotazione Annullata';
  const details = [
    customerName?.trim() ? `Cliente: ${formatPushCustomerName(customerName)}` : null,
    serviceName?.trim() ? `Servizio: ${serviceName.trim()}` : null,
    roleName?.trim() ? `Mestiere: ${roleName.trim()}` : null,
    formatPushDateTimeLabel(appointmentDate, appointmentTime)
      ? `Appuntamento: ${formatPushDateTimeLabel(appointmentDate, appointmentTime)}`
      : null,
    operatorName?.trim() ? `Operatore: ${operatorName.trim()}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return {
    title,
    body: details ? `${statusLabel}. ${details}.` : statusLabel,
    statusLabel,
  };
};

const isAppointmentRescheduleNote = (value?: string | null) =>
  normalizeIdentityText(value).includes('il salone ha spostato il tuo appuntamento da');

const normalizeFullNameIdentity = (value?: string | null) =>
  normalizeIdentityText(value).replace(/\s+/g, ' ').trim();

const matchesCustomerDisplayName = (candidate?: string | null, expected?: string | null) => {
  const normalizedCandidate = normalizeFullNameIdentity(candidate);
  const normalizedExpected = normalizeFullNameIdentity(expected);

  if (!normalizedCandidate || !normalizedExpected) {
    return false;
  }

  if (normalizedCandidate === normalizedExpected) {
    return true;
  }

  const candidateParts = normalizedCandidate.split(' ').filter(Boolean);
  const expectedParts = normalizedExpected.split(' ').filter(Boolean);

  if (candidateParts.length > 1 && expectedParts.length > 1) {
    return (
      candidateParts[0] === expectedParts[0] &&
      candidateParts[candidateParts.length - 1] === expectedParts[expectedParts.length - 1]
    );
  }

  return (
    normalizedCandidate.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedCandidate)
  );
};

type OwnerAccount = {
  firstName: string;
  lastName: string;
  salonName: string;
  businessPhone: string;
  streetLine: string;
  city: string;
  postalCode: string;
  activityCategory: string;
  email: string;
  password?: string;
  createdAt: string;
};

const buildWorkspaceProfileFromOwnerAccount = (
  account?: OwnerAccount | null
): Partial<SalonWorkspace> => {
  if (!account) {
    return {};
  }

  const formattedAddress = formatSalonAddress({
    streetType: '',
    streetName: account.streetLine.trim().toUpperCase(),
    streetNumber: '',
    city: account.city.trim().toUpperCase(),
    postalCode: account.postalCode.trim(),
    salonAddress: '',
  });

  return {
    salonName: account.salonName.trim(),
    businessPhone: account.businessPhone.trim(),
    activityCategory: account.activityCategory.trim().toUpperCase(),
    streetType: '',
    streetName: account.streetLine.trim().toUpperCase(),
    streetNumber: '',
    city: account.city.trim().toUpperCase(),
    postalCode: account.postalCode.trim(),
    salonAddress: formattedAddress,
  };
};

type RemoteWorkspaceRow = {
  id: string;
  slug: string;
  salon_name: string;
  owner_email: string;
  customer_reminder_hours_before: number | null;
  subscription_plan: SalonWorkspace['subscriptionPlan'];
  subscription_status: SalonWorkspace['subscriptionStatus'];
  created_at: string;
  updated_at: string;
};

type Cliente = {
  id: string;
  nome: string;
  telefono: string;
  email?: string;
  instagram?: string;
  birthday?: string;
  nota: string;
  fonte?: 'salone' | 'frontend';
  viewedBySalon?: boolean;
  annullamentiCount?: number;
  inibito?: boolean;
  maxFutureAppointments?: number | null;
  maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
  maxDailyAppointments?: number | null;
};

const normalizeClienti = (items: Cliente[]) =>
  items.map((item) => ({
    ...item,
    email: item.email ?? '',
    instagram: item.instagram ?? '',
    birthday: item.birthday ?? '',
    fonte: item.fonte ?? 'salone',
    viewedBySalon: item.viewedBySalon ?? true,
    annullamentiCount: item.annullamentiCount ?? 0,
    inibito: item.inibito ?? false,
    maxFutureAppointments:
      typeof item.maxFutureAppointments === 'number' && item.maxFutureAppointments >= 0
        ? item.maxFutureAppointments
        : null,
    maxFutureAppointmentsMode:
      item.maxFutureAppointmentsMode === 'monthly' || item.maxFutureAppointmentsMode === 'total_future'
        ? item.maxFutureAppointmentsMode
        : null,
    maxDailyAppointments:
      typeof item.maxDailyAppointments === 'number' && item.maxDailyAppointments >= 0
        ? item.maxDailyAppointments
        : null,
  }));

const buildSensitiveStorageSuffix = (email: string) =>
  normalizeAccountEmail(email).replace(/[^a-z0-9._-]/gi, '_');
const secureOwnerPasswordKey = (email: string) =>
  `salon_manager_owner_password__${buildSensitiveStorageSuffix(email)}`;
const legacyOwnerPasswordKey = (email: string) =>
  `salon_manager_owner_password_legacy__${buildSensitiveStorageSuffix(email)}`;
const secureBiometricPasswordKey = (email: string) =>
  `salon_manager_biometric_password__${buildSensitiveStorageSuffix(email)}`;
const canUseSecureStore = Platform.OS === 'ios' || Platform.OS === 'android';
let secureStoreModule:
  | {
      getItemAsync: (key: string) => Promise<string | null>;
      setItemAsync: (key: string, value: string) => Promise<void>;
      deleteItemAsync: (key: string) => Promise<void>;
    }
  | null
  | undefined;
let localAuthenticationModule:
  | {
      AuthenticationType: { FACIAL_RECOGNITION: number };
      hasHardwareAsync: () => Promise<boolean>;
      isEnrolledAsync: () => Promise<boolean>;
      supportedAuthenticationTypesAsync: () => Promise<number[]>;
      authenticateAsync: (options: {
        promptMessage: string;
        cancelLabel?: string;
        disableDeviceFallback?: boolean;
        fallbackLabel?: string;
      }) => Promise<{ success: boolean; error?: string }>;
    }
  | null
  | undefined;

const resolveSecureStoreModule = () => {
  if (!canUseSecureStore) {
    return null;
  }

  if (secureStoreModule !== undefined) {
    return secureStoreModule;
  }

  try {
    secureStoreModule = require('expo-secure-store') as typeof secureStoreModule;
  } catch (error) {
    console.log('SecureStore non disponibile in questo runtime:', error);
    secureStoreModule = null;
  }

  return secureStoreModule;
};

const resolveLocalAuthenticationModule = () => {
  if (localAuthenticationModule !== undefined) {
    return localAuthenticationModule;
  }

  try {
    localAuthenticationModule = require('expo-local-authentication') as typeof localAuthenticationModule;
  } catch (error) {
    console.log('LocalAuthentication non disponibile in questo runtime:', error);
    localAuthenticationModule = null;
  }

  return localAuthenticationModule;
};

const getSensitiveValue = async (secureKey: string, legacyAsyncKey?: string) => {
  const secureStore = resolveSecureStoreModule();
  const secureValue = secureStore ? await secureStore.getItemAsync(secureKey) : null;
  if (secureValue?.trim()) {
    return secureValue;
  }

  if (!legacyAsyncKey) {
    return null;
  }

  const legacyValue = await AsyncStorage.getItem(legacyAsyncKey);
  if (!legacyValue?.trim()) {
    return null;
  }

  if (secureStore) {
    await secureStore.setItemAsync(secureKey, legacyValue);
    await AsyncStorage.removeItem(legacyAsyncKey);
  }

  return legacyValue;
};

const setSensitiveValue = async (secureKey: string, value: string, legacyAsyncKey?: string) => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return;
  }

  const secureStore = resolveSecureStoreModule();
  if (secureStore) {
    await secureStore.setItemAsync(secureKey, normalizedValue);
    if (legacyAsyncKey) {
      await AsyncStorage.removeItem(legacyAsyncKey);
    }
    return;
  }

  if (legacyAsyncKey) {
    await AsyncStorage.setItem(legacyAsyncKey, normalizedValue);
  }
};

const deleteSensitiveValue = async (secureKey: string, legacyAsyncKey?: string) => {
  const secureStore = resolveSecureStoreModule();
  if (secureStore) {
    await secureStore.deleteItemAsync(secureKey);
  }

  if (legacyAsyncKey) {
    await AsyncStorage.removeItem(legacyAsyncKey);
  }
};

const buildClienteMergeKeyFromIdentity = (item: {
  id?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
}) => {
  const phone = item.telefono?.trim() ?? '';
  if (phone) return `phone:${phone}`;

  const email = item.email?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = item.nome?.trim().toLowerCase() ?? '';
  if (name) return `name:${name}`;

  return `id:${item.id?.trim() ?? ''}`;
};

const buildClienteMergeKey = (item: Cliente) => buildClienteMergeKeyFromIdentity(item);

const matchesCustomerIdentity = (
  candidate: Cliente,
  target: {
    id?: string | null;
    nome?: string | null;
    telefono?: string | null;
    email?: string | null;
  }
) =>
  candidate.id.trim() === (target.id?.trim() ?? '') ||
  buildClienteMergeKey(candidate) === buildClienteMergeKeyFromIdentity(target);

const mergeClientiCollections = (localItems: Cliente[], remoteItems: Cliente[]) => {
  const merged = new Map<string, Cliente>();

  normalizeClienti(remoteItems).forEach((item) => {
    merged.set(buildClienteMergeKey(item), item);
  });

  normalizeClienti(localItems).forEach((item) => {
    const key = buildClienteMergeKey(item);
    const existing = merged.get(key);

    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...item,
            email: item.email?.trim() ? item.email : existing.email,
            instagram: item.instagram?.trim() ? item.instagram : existing.instagram,
            birthday: item.birthday?.trim() ? item.birthday : existing.birthday,
            nota: item.nota?.trim() ? item.nota : existing.nota,
          }
        : item
    );
  });

  return Array.from(merged.values());
};

const doesFrontendRequestMatchCliente = (
  richiesta: Pick<RichiestaPrenotazione, 'nome' | 'cognome' | 'email' | 'telefono'>,
  cliente: Pick<Cliente, 'nome' | 'email' | 'telefono'>
) => {
  const requestEmail = normalizeAccountEmail(richiesta.email);
  const customerEmail = normalizeAccountEmail(cliente.email);
  if (requestEmail && customerEmail && requestEmail === customerEmail) {
    return true;
  }

  const requestPhone = normalizePhoneForIdentity(richiesta.telefono);
  const customerPhone = normalizePhoneForIdentity(cliente.telefono);
  if (requestPhone && customerPhone && requestPhone === customerPhone) {
    return true;
  }

  const requestFullName = `${richiesta.nome} ${richiesta.cognome}`.trim();
  return matchesCustomerDisplayName(cliente.nome, requestFullName);
};

const enrichClientiWithFrontendRequestSignals = (
  clientiItems: Cliente[],
  richiesteItems: RichiestaPrenotazione[]
) => {
  const normalizedRichieste = normalizeRichiestePrenotazione(richiesteItems).filter(
    (item) => (item.origine ?? 'frontend') === 'frontend'
  );

  return normalizeClienti(clientiItems).map((cliente) => {
    const matchedRequests = normalizedRichieste.filter((item) =>
      doesFrontendRequestMatchCliente(item, cliente)
    );

    if (matchedRequests.length === 0) {
      return cliente;
    }

    const cancelledByClienteCount = matchedRequests.filter(
      (item) => item.stato === 'Annullata' && item.cancellationSource === 'cliente'
    ).length;
    const hasUnreadFrontendSignal = matchedRequests.some(
      (item) =>
        item.viewedBySalon !== true &&
        (item.stato === 'In attesa' ||
          (item.stato === 'Annullata' && item.cancellationSource === 'cliente'))
    );

    return {
      ...cliente,
      fonte: 'frontend' as const,
      viewedBySalon: hasUnreadFrontendSignal ? false : cliente.viewedBySalon,
      annullamentiCount: Math.max(cliente.annullamentiCount ?? 0, cancelledByClienteCount),
    };
  });
};

type Appuntamento = {
  id: string;
  data?: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  mestiereRichiesto?: string;
  operatoreId?: string;
  operatoreNome?: string;
  macchinarioIds?: string[];
  macchinarioNomi?: string[];
  incassato?: boolean;
  completato?: boolean;
  nonEffettuato?: boolean;
};

const normalizeStringIdArray = (items?: string[] | null) =>
  Array.isArray(items)
    ? items
        .map((item) => item?.trim() ?? '')
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
    : [];

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const buildAutoCashoutMovementId = (appointmentId: string, dateValue: string) =>
  `auto-cashout-${appointmentId}-${dateValue}`;

const normalizeAppuntamenti = (items: Appuntamento[]) =>
  items.map((item) => ({
    ...item,
    data: item.data ?? getTodayDateString(),
    mestiereRichiesto: item.mestiereRichiesto?.trim() ?? '',
    operatoreId: item.operatoreId ?? '',
    operatoreNome: item.operatoreNome ?? '',
    macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
    macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    incassato: item.incassato ?? false,
    completato: item.completato ?? false,
    nonEffettuato: item.nonEffettuato ?? false,
  }));

// Merge locale + remoto per gli appuntamenti, simile a mergeClientiCollections.
// Il remoto è la fonte di verità per gli appuntamenti che esistono nel DB;
// gli appuntamenti locali non ancora sincronizzati (legacy/offline) vengono mantenuti.
const buildAppuntamentoMergeKey = (item: Appuntamento) => {
  const date = (item.data ?? '').trim();
  const time = item.ora.trim().toLowerCase();
  const cliente = item.cliente.trim().toLowerCase();
  const servizio = item.servizio.trim().toLowerCase();
  return `${date}|${time}|${cliente}|${servizio}`;
};

const isSyncedAppointmentRecord = (item: Pick<Appuntamento, 'id'>) => isUuidValue(item.id);

const mergeAppuntamentiCollections = (
  localItems: Appuntamento[],
  remoteItems: Appuntamento[],
  options?: {
    preserveLocalCompositeKeys?: Set<string>;
    preserveLocalIds?: Set<string>;
  }
) => {
  // Inizia con tutti gli appuntamenti remoti (fonte di verità dal DB)
  const merged = new Map<string, Appuntamento>();
  const remoteKeysByComposite = new Set<string>();

  normalizeAppuntamenti(remoteItems).forEach((item) => {
    merged.set(item.id, item);
    remoteKeysByComposite.add(buildAppuntamentoMergeKey(item));
  });

  // Aggiunge gli appuntamenti locali non presenti nel remoto (non ancora sincronizzati)
  normalizeAppuntamenti(localItems).forEach((item) => {
    const compositeKey = buildAppuntamentoMergeKey(item);
    const preserveLocalById = options?.preserveLocalIds?.has(item.id) === true;
    const shouldPreserveLocalOnly =
      options?.preserveLocalCompositeKeys?.has(compositeKey) === true ||
      preserveLocalById;

    if (preserveLocalById && merged.has(item.id)) {
      merged.set(item.id, item);
      return;
    }

    if (
      shouldPreserveLocalOnly &&
      !merged.has(item.id) &&
      !remoteKeysByComposite.has(compositeKey)
    ) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
};

type Movimento = {
  id: string;
  descrizione: string;
  importo: number;
  metodo?: 'Contanti' | 'Carta' | 'Bonifico';
  cartaLabel?: string;
  createdAt?: string;
};

const deriveMovementCreatedAt = (item: Movimento) => {
  if (item.createdAt?.trim()) return item.createdAt;

  const numericId = Number(item.id);
  if (!Number.isNaN(numericId)) {
    return new Date(numericId).toISOString();
  }

  const autoCashoutMatch = item.id.match(/^auto-cashout-.+-(\d{4}-\d{2}-\d{2})$/);
  if (autoCashoutMatch) {
    return `${autoCashoutMatch[1]}T23:59:00.000Z`;
  }

  return new Date().toISOString();
};

const normalizeMovimenti = (items: Movimento[]) =>
  items.map((item) => ({
    ...item,
    createdAt: deriveMovementCreatedAt(item),
  }));

type CartaCollegata = {
  id: string;
  nome: string;
  circuito: string;
  ultime4: string;
  predefinita?: boolean;
};

const normalizeCarte = (items: CartaCollegata[]) =>
  items.map((item, index) => ({
    ...item,
    predefinita: item.predefinita ?? index === 0,
  }));

type Evento = {
  id: string;
  titolo: string;
  data: string;
  ora: string;
  note?: string;
};

type RichiestaPrenotazione = {
  id: string;
  data: string;
  ora: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  mestiereRichiesto?: string;
  operatoreId?: string;
  operatoreNome?: string;
  macchinarioIds?: string[];
  macchinarioNomi?: string[];
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  instagram?: string;
  note?: string;
  origine?: 'frontend' | 'backoffice';
  stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
  createdAt: string;
  viewedByCliente?: boolean;
  viewedBySalon?: boolean;
  cancellationSource?: 'cliente' | 'salone';
};

const normalizeRichiestePrenotazione = (items: RichiestaPrenotazione[]) =>
  items.map((item) => ({
    ...item,
    mestiereRichiesto: item.mestiereRichiesto?.trim() ?? '',
    operatoreId: item.operatoreId ?? '',
    operatoreNome: item.operatoreNome ?? '',
    macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
    macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    origine: item.origine ?? 'frontend',
    viewedByCliente: normalizeOptionalBoolean(item.viewedByCliente) ?? item.stato === 'In attesa',
    viewedBySalon:
      normalizeOptionalBoolean(item.viewedBySalon) ??
      !(item.stato === 'In attesa' || item.stato === 'Annullata'),
    cancellationSource:
      item.stato === 'Annullata'
        ? item.cancellationSource ??
          (item.origine === 'backoffice' ? 'salone' : item.viewedBySalon === false ? 'cliente' : 'salone')
        : undefined,
  }));

const buildRichiestaMergeKey = (item: RichiestaPrenotazione) => {
  const date = item.data.trim();
  const time = item.ora.trim().toLowerCase();
  const service = item.servizio.trim().toLowerCase();
  const fullName = `${item.nome} ${item.cognome}`.trim().toLowerCase();
  return `${date}|${time}|${service}|${fullName}`;
};

const mergeRichiesteCollections = (
  localItems: RichiestaPrenotazione[],
  remoteItems: RichiestaPrenotazione[]
) => {
  const merged = new Map<string, RichiestaPrenotazione>();
  const remoteCompositeKeys = new Set<string>();

  normalizeRichiestePrenotazione(remoteItems).forEach((item) => {
    merged.set(item.id, item);
    remoteCompositeKeys.add(buildRichiestaMergeKey(item));
  });

  normalizeRichiestePrenotazione(localItems).forEach((item) => {
    const compositeKey = buildRichiestaMergeKey(item);
    if (!merged.has(item.id) && !remoteCompositeKeys.has(compositeKey)) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
};

type Servizio = {
  id: string;
  nome: string;
  prezzo: number;
  prezzoOriginale?: number;
  scontoValidoDal?: string;
  scontoValidoAl?: string;
  durataMinuti?: number;
  mestiereRichiesto?: string;
  macchinarioIds?: string[];
};

const buildSafeEntityId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeServiceIdFragment = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

const buildUniqueServiceId = (
  item: Servizio,
  seenIds: Set<string>,
  duplicateIndex: number
) => {
  const rawId = item.id?.trim() || buildSafeEntityId('servizio');

  if (!seenIds.has(rawId)) {
    seenIds.add(rawId);
    return rawId;
  }

  const nameFragment = normalizeServiceIdFragment(item.nome) || 'dup';
  let candidate = `${rawId}-${nameFragment}`;

  if (duplicateIndex > 0) {
    candidate = `${candidate}-${duplicateIndex + 1}`;
  }

  let attempt = 1;
  while (seenIds.has(candidate)) {
    attempt += 1;
    candidate = `${rawId}-${nameFragment}-${duplicateIndex + attempt}`;
  }

  seenIds.add(candidate);
  return candidate;
};

const normalizeServizi = (items: Servizio[]) => {
  const seenIds = new Set<string>();

  return items
    .filter((item) => item.nome.trim() !== '' && (item.mestiereRichiesto?.trim() ?? '') !== '')
    .map((item, index) => ({
      ...item,
      id: buildUniqueServiceId(item, seenIds, index),
      prezzoOriginale:
        typeof item.prezzoOriginale === 'number' && item.prezzoOriginale > item.prezzo
          ? item.prezzoOriginale
          : undefined,
      durataMinuti: item.durataMinuti ?? 60,
      scontoValidoDal:
        typeof item.scontoValidoDal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.scontoValidoDal)
          ? item.scontoValidoDal
          : undefined,
      scontoValidoAl:
        typeof item.scontoValidoAl === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.scontoValidoAl)
          ? item.scontoValidoAl
          : undefined,
      mestiereRichiesto: item.mestiereRichiesto?.trim() ?? '',
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
    }));
};

const mergeServiziCollections = (localItems: Servizio[], remoteItems: Servizio[]) => {
  const merged = new Map<string, Servizio>();

  normalizeServizi(remoteItems).forEach((item) => {
    merged.set(item.nome.trim().toLowerCase() || item.id, item);
  });

  normalizeServizi(localItems).forEach((item) => {
    const key = item.nome.trim().toLowerCase() || item.id;
    const existing = merged.get(key);

    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...item,
            mestiereRichiesto: item.mestiereRichiesto?.trim() || existing.mestiereRichiesto,
            macchinarioIds:
              normalizeStringIdArray(item.macchinarioIds).length > 0
                ? normalizeStringIdArray(item.macchinarioIds)
                : existing.macchinarioIds,
          }
        : item
    );
  });

  return Array.from(merged.values());
};

const normalizeServiceColorOverrideMap = (
  overrides: Record<string, string>,
  services: Servizio[]
) => {
  const next: Record<string, string> = {};

  Object.entries(overrides).forEach(([key, value]) => {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) return;
    next[normalizedKey] = normalizedValue;
  });

  services.forEach((service) => {
    const stableKey = normalizeServiceAccentKey(service.nome);
    if (!stableKey) return;

    const existingColor =
      next[stableKey] ||
      next[service.id?.trim() ?? ''];

    if (existingColor) {
      next[stableKey] = existingColor;
    }
  });

  return next;
};

const normalizeRoleColorOverrideMap = (overrides: Record<string, string>) => {
  const next: Record<string, string> = {};

  Object.entries(overrides).forEach(([key, value]) => {
    const normalizedKey = normalizeRoleName(key);
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) return;
    next[normalizedKey] = normalizedValue;
  });

  return next;
};

const mergeServiceColorOverrideMaps = ({
  remoteOverrides,
  localOverrides,
  services,
}: {
  remoteOverrides?: Record<string, string>;
  localOverrides?: Record<string, string>;
  services: Servizio[];
}) =>
  normalizeServiceColorOverrideMap(
    {
      ...(remoteOverrides ?? {}),
      ...(localOverrides ?? {}),
    },
    services
  );

const mergeRoleColorOverrideMaps = ({
  remoteOverrides,
  localOverrides,
}: {
  remoteOverrides?: Record<string, string>;
  localOverrides?: Record<string, string>;
}) =>
  normalizeRoleColorOverrideMap({
    ...(remoteOverrides ?? {}),
    ...(localOverrides ?? {}),
  });

type Operatore = {
  id: string;
  nome: string;
  mestiere: string;
  fotoUri?: string;
  availability?: OperatorAvailability;
};

const ALL_OPERATOR_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const normalizeOperatorAvailabilityRanges = (items?: OperatorAvailabilityRange[]) =>
  (items ?? [])
    .map((item, index) => ({
      id: item.id?.trim() || `operator-range-${index}`,
      startDate: item.startDate?.trim() ?? '',
      endDate: item.endDate?.trim() ?? '',
      label: item.label?.trim() ?? '',
    }))
    .filter((item) => item.startDate !== '' && item.endDate !== '' && item.startDate <= item.endDate);

const normalizeOperatorAvailability = (availability?: OperatorAvailability): OperatorAvailability => {
  const enabledWeekdays = Array.isArray(availability?.enabledWeekdays)
    ? availability?.enabledWeekdays
        .filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 6)
        .filter((item, index, array) => array.indexOf(item) === index)
        .sort((first, second) => first - second)
    : [];

  return {
    enabledWeekdays: enabledWeekdays.length > 0 ? enabledWeekdays : ALL_OPERATOR_WEEKDAYS,
    dateRanges: normalizeOperatorAvailabilityRanges(availability?.dateRanges),
  };
};

const normalizeOperatori = (items: Operatore[]) =>
  items.map((item) => ({
    ...item,
    nome: item.nome.trim(),
    mestiere: item.mestiere.trim(),
    fotoUri: item.fotoUri?.trim() || undefined,
    availability: normalizeOperatorAvailability(item.availability),
  }));

const preferNonEmptyOperatoriSnapshot = (
  localItems: Operatore[],
  remoteItems: Operatore[]
) => {
  const normalizedLocal = normalizeOperatori(localItems);
  const normalizedRemote = normalizeOperatori(remoteItems);

  // Surgical guard: when the owner has just edited operators, the portal snapshot
  // can briefly lag behind and return an empty array. In that case we keep the
  // local operator list instead of wiping it from memory.
  if (normalizedRemote.length === 0 && normalizedLocal.length > 0) {
    return normalizedLocal;
  }

  return normalizedRemote;
};

type Macchinario = {
  id: string;
  nome: string;
  mestiereRichiesto?: string;
  categoria: string;
  note?: string;
  attivo?: boolean;
};

const normalizeMacchinari = (items: Macchinario[]) =>
  items.map((item) => ({
    ...item,
    nome: item.nome.trim(),
    mestiereRichiesto: item.mestiereRichiesto?.trim() ?? '',
    categoria: item.categoria.trim(),
    note: item.note?.trim() ?? '',
    attivo: item.attivo ?? true,
  }));

type AppContextType = {
  appLanguage: AppLanguage;
  setAppLanguage: React.Dispatch<React.SetStateAction<AppLanguage>>;
  isAuthenticated: boolean;
  ownerPasswordRecoveryActive: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  biometricAvailable: boolean;
  biometricType: 'faceid' | 'fingerprint' | 'none';
  toggleBiometricEnabled: (enabled: boolean) => Promise<void>;
  authenticateBiometricIdentity: () => Promise<{ ok: boolean; error?: string }>;
  hasCompletedOnboarding: boolean;
  showOnboarding: boolean;
  completeOnboarding: () => void;
  reopenOnboarding: () => void;
  unlockOwnerAccountWithBiometric: () => Promise<{ ok: boolean; error?: string }>;
  loginOwnerAccount: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  registerOwnerAccount: (params: {
    firstName: string;
    lastName: string;
    salonName: string;
    businessPhone: string;
    streetLine: string;
    city: string;
    postalCode: string;
    activityCategory: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; email?: string }>;
  requestOwnerPasswordReset: (
    email: string
  ) => Promise<{ ok: boolean; error?: string; backendRequired?: boolean }>;
  activateOwnerPasswordRecoveryFromUrl: (
    incomingUrl?: string | null
  ) => Promise<{ ok: boolean; recoveryReady?: boolean; error?: string }>;
  completeOwnerPasswordRecovery: (
    nextPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logoutOwnerAccount: () => Promise<void>;
  consumePendingBiometricUnlock: () => boolean;
  salonAccountEmail: string;
  switchSalonAccount: (email: string) => Promise<boolean>;
  salonWorkspace: SalonWorkspace;
  setSalonWorkspace: React.Dispatch<React.SetStateAction<SalonWorkspace>>;
  updateSalonWorkspacePersisted: (
    updater: SalonWorkspace | ((current: SalonWorkspace) => SalonWorkspace)
  ) => Promise<void>;
  updateAvailabilitySettingsPersisted: (
    updater:
      | AvailabilitySettings
      | ((current: AvailabilitySettings) => AvailabilitySettings)
  ) => Promise<void>;
  updateGuidedSlotsSettingsPersisted: (
    updater:
      | AvailabilitySettings
      | ((current: AvailabilitySettings) => AvailabilitySettings)
  ) => Promise<void>;
  workspaceAccessAllowed: boolean;
  clienti: Cliente[];
  setClienti: React.Dispatch<React.SetStateAction<Cliente[]>>;
  updateClientePersisted: (
    currentCustomer: {
      id: string;
      nome?: string;
      telefono?: string;
      email?: string;
    },
    updates: {
      nome: string;
      telefono: string;
      email?: string;
      instagram?: string;
      birthday?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteClientePersisted: (customer: {
    id: string;
    nome?: string;
    telefono?: string;
    email?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appuntamenti: Appuntamento[];
  setAppuntamenti: React.Dispatch<React.SetStateAction<Appuntamento[]>>;
  movimenti: Movimento[];
  setMovimenti: React.Dispatch<React.SetStateAction<Movimento[]>>;
  servizi: Servizio[];
  setServizi: React.Dispatch<React.SetStateAction<Servizio[]>>;
  operatori: Operatore[];
  setOperatori: React.Dispatch<React.SetStateAction<Operatore[]>>;
  macchinari: Macchinario[];
  setMacchinari: React.Dispatch<React.SetStateAction<Macchinario[]>>;
  carteCollegate: CartaCollegata[];
  setCarteCollegate: React.Dispatch<React.SetStateAction<CartaCollegata[]>>;
  eventi: Evento[];
  setEventi: React.Dispatch<React.SetStateAction<Evento[]>>;
  richiestePrenotazione: RichiestaPrenotazione[];
  setRichiestePrenotazione: React.Dispatch<React.SetStateAction<RichiestaPrenotazione[]>>;
  availabilitySettings: AvailabilitySettings;
  setAvailabilitySettings: React.Dispatch<React.SetStateAction<AvailabilitySettings>>;
  messaggioEventoTemplate: string;
  setMessaggioEventoTemplate: React.Dispatch<React.SetStateAction<string>>;
  serviceCardColorOverrides: Record<string, string>;
  setServiceCardColorOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  roleCardColorOverrides: Record<string, string>;
  setRoleCardColorOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  resolveSalonByCode: (code: string) => Promise<{
    workspace: SalonWorkspace;
    clienti: Cliente[];
    appuntamenti: Appuntamento[];
    servizi: Servizio[];
    operatori: Operatore[];
    richiestePrenotazione: RichiestaPrenotazione[];
    availabilitySettings: AvailabilitySettings;
    serviceCardColorOverrides?: Record<string, string>;
    roleCardColorOverrides?: Record<string, string>;
  } | null>;
  upsertFrontendCustomerForSalon: (params: {
    salonCode: string;
    profile: {
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
      instagram?: string;
    };
  }) => Promise<
    | { ok: true }
    | {
        ok: false;
        reason: 'duplicate_email' | 'duplicate_phone' | 'duplicate_email_phone' | 'save_failed';
      }
  >;
  addBookingRequestForSalon: (
    salonCode: string,
    request: RichiestaPrenotazione
  ) => Promise<{ ok: boolean; error?: string; detail?: string }>;
  createOwnerAppointmentForSalon: (params: {
    salonCode: string;
    dateValue: string;
    timeValue: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    customerInstagram?: string;
    customerNote?: string;
    customerSource?: 'salone' | 'frontend';
    createCustomerRecord?: boolean;
    createBookingRequest?: boolean;
    serviceName: string;
    priceValue: number;
    durationMinutes?: number;
    operatorId?: string;
    operatorName?: string;
    machineryIds?: string[];
    machineryNames?: string[];
  }) => Promise<{ ok: boolean; error?: string }>;
  markClientRequestsViewedForSalon: (
    salonCode: string,
    email: string,
    telefono: string
  ) => Promise<void>;
  cancelClientAppointmentForSalon: (params: {
    salonCode: string;
    requestId: string;
    email: string;
    telefono: string;
    requestSnapshot?: RichiestaPrenotazione;
  }) => Promise<{ ok: boolean; error?: string }>;
  cancelOwnerAppointmentForSalon: (params: {
    salonCode: string;
    appointmentId?: string;
    appointmentDate: string;
    appointmentTime: string;
    customerName: string;
    serviceName: string;
    operatorId?: string;
    operatorName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  moveOwnerAppointmentForSalon: (params: {
    salonCode: string;
    appointmentId?: string;
    replacedAppointmentId?: string;
    currentDate: string;
    currentTime: string;
    nextDate: string;
    nextTime: string;
    customerName: string;
    serviceName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  updateBookingRequestStatusForSalon: (params: {
    salonCode: string;
    requestId: string;
    status: 'Accettata' | 'Rifiutata' | 'Annullata';
    ignoreConflicts?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  isLoaded: boolean;
  hasInitializedAuth: boolean;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const isExpoGoRuntime = Constants.executionEnvironment === 'storeClient';
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('it');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ownerPasswordRecoveryActive, setOwnerPasswordRecoveryActive] = useState(false);
  const [ownerLocalRecoveryEmail, setOwnerLocalRecoveryEmail] = useState('');
  const ownerRecoveryUrlInFlightRef = React.useRef<string | null>(null);
  const ownerRecoveryPromiseRef = React.useRef<
    Promise<{ ok: boolean; recoveryReady?: boolean; error?: string }> | null
  >(null);
  const ownerRecoveryProcessedUrlRef = React.useRef<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'faceid' | 'fingerprint' | 'none'>('none');
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [salonAccountEmail, setSalonAccountEmail] = useState('');
  const [salonWorkspace, setSalonWorkspace] = useState<SalonWorkspace>(
    createDefaultWorkspace('')
  );
  const [clienti, setClienti] = useState<Cliente[]>(normalizeClienti([]));
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>(normalizeAppuntamenti([]));
  const [movimenti, setMovimenti] = useState<Movimento[]>(normalizeMovimenti([]));
  const [servizi, setServizi] = useState<Servizio[]>(normalizeServizi([]));
  const [operatori, setOperatori] = useState<Operatore[]>(normalizeOperatori([]));
  const [macchinari, setMacchinari] = useState<Macchinario[]>(normalizeMacchinari([]));
  const [carteCollegate, setCarteCollegate] = useState<CartaCollegata[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [richiestePrenotazione, setRichiestePrenotazione] = useState<
    RichiestaPrenotazione[]
  >([]);
  const [availabilitySettings, setAvailabilitySettings] = useState<AvailabilitySettings>(
    normalizeAvailabilitySettings()
  );
  const [messaggioEventoTemplate, setMessaggioEventoTemplate] = useState(
    'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
  );
  const [serviceCardColorOverrides, setServiceCardColorOverrides] = useState<Record<string, string>>({});
  const [roleCardColorOverrides, setRoleCardColorOverrides] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasInitializedAuth, setHasInitializedAuth] = useState(false);
  const [pendingBiometricUnlock, setPendingBiometricUnlock] = useState(false);
  const pendingBiometricUnlockRef = React.useRef(false);
  const pendingRegistrationOnboardingRef = React.useRef(false);
  const recentlyDeletedAppointmentKeysRef = React.useRef<Map<string, number>>(new Map());
  const recentlyCreatedAppointmentKeysRef = React.useRef<Map<string, number>>(new Map());
  const recentlyMovedAppointmentIdsRef = React.useRef<Map<string, number>>(new Map());
  const recentlyDeletedCustomerKeysRef = React.useRef<Map<string, number>>(new Map());
  const previousCustomerIdentityKeysRef = React.useRef<Set<string>>(new Set());
  const portalPublishQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const portalPublishDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressAutoPortalPublishUntilRef = React.useRef(0);
  const ownerPortalBootstrapReadyRef = React.useRef(false);
  const legacyOperatorBackfillSignatureRef = React.useRef('');
  const salonCapacityBackfillSignatureRef = React.useRef('');
  const latestSalonWorkspaceRef = React.useRef<SalonWorkspace>(createDefaultWorkspace(''));
  const latestAvailabilitySettingsRef = React.useRef<AvailabilitySettings>(
    normalizeAvailabilitySettings()
  );
  const latestGuidedSlotsUpdatedAtRef = React.useRef<string | undefined>(undefined);
  const lastLocalWorkspaceMutationAtRef = React.useRef(0);
  const lastLocalAvailabilityMutationAtRef = React.useRef(0);
  const pendingWorkspaceSyncRef = React.useRef<{ signature: string; at: number } | null>(null);
  const pendingAvailabilitySyncRef = React.useRef<{ signature: string; at: number } | null>(null);
  const guidedSettingsPersistQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestSalonWorkspaceRef.current = salonWorkspace;
  }, [salonWorkspace]);

  useEffect(() => {
    latestAvailabilitySettingsRef.current = availabilitySettings;
    latestGuidedSlotsUpdatedAtRef.current = availabilitySettings.guidedSlotsUpdatedAt;
  }, [availabilitySettings]);

  // Ripristina il guard delle cancellazioni dal disco (sopravvive al Fast Refresh di Expo Go)
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.recently_deleted_appointments)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as [string, number][];
        const now = Date.now();
        const threshold = now - RECENTLY_DELETED_APPOINTMENT_GUARD_MS;
        const map = recentlyDeletedAppointmentKeysRef.current;
        parsed.forEach(([key, ts]) => {
          if (ts > threshold) map.set(key, ts);
        });
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.recently_deleted_customers)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as [string, number][];
        const now = Date.now();
        const threshold = now - RECENTLY_DELETED_CUSTOMER_GUARD_MS;
        const map = recentlyDeletedCustomerKeysRef.current;
        parsed.forEach(([key, ts]) => {
          if (ts > threshold) map.set(key, ts);
        });
      })
      .catch(() => null);
  }, []);

  const runWithDeadlockRetry = React.useCallback(
    async <T,>(operation: () => Promise<T>, contextLabel: string): Promise<T> => {
      let attemptIndex = 0;

      while (true) {
        try {
          return await operation();
        } catch (error) {
          if (!isDeadlockError(error) || attemptIndex >= DEADLOCK_RETRY_DELAYS_MS.length) {
            throw error;
          }

          const delayMs = DEADLOCK_RETRY_DELAYS_MS[attemptIndex];
          const retryAttempt = attemptIndex + 2;
          console.log(
            `${contextLabel}: deadlock rilevato, ritento tra ${delayMs}ms (tentativo ${retryAttempt}).`
          );
          attemptIndex += 1;
          await waitMs(delayMs);
        }
      }
    },
    []
  );

  const fetchPortalSnapshotWithRetry = React.useCallback(
    async (salonCode: string) => {
      try {
        return await runWithDeadlockRetry(
          () => fetchClientPortalSnapshot(salonCode),
          'Caricamento snapshot portale cliente'
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message.trim().toLowerCase() : String(error).trim().toLowerCase();

        if (errorMessage.includes('client_portal_snapshot_timeout')) {
          console.log('Snapshot portale cliente in timeout, continuo con fallback locale.');
          return null;
        }

        throw error;
      }
    },
    [runWithDeadlockRetry]
  );

  const fetchPortalAvailabilitySettingsWithRetry = React.useCallback(
    async (salonCode: string) => {
      try {
        return await runWithDeadlockRetry(
          () => fetchClientPortalAvailabilitySettings(salonCode),
          'Caricamento availability portale cliente'
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message.trim().toLowerCase() : String(error).trim().toLowerCase();

        if (errorMessage.includes('client_portal_availability_timeout')) {
          console.log('Availability portale cliente in timeout, continuo con fallback locale.');
          return null;
        }

        throw error;
      }
    },
    [runWithDeadlockRetry]
  );

  const applyRemoteAvailabilitySettings = React.useCallback(
    (incomingSettings: Partial<AvailabilitySettings> | null | undefined) => {
      const normalizedRemoteAvailabilitySettings =
        mergeAvailabilitySettingsWithCriticalTimestamps(
          latestAvailabilitySettingsRef.current,
          incomingSettings
        );

      if (
        areAvailabilitySettingsEquivalent(
          latestAvailabilitySettingsRef.current,
          normalizedRemoteAvailabilitySettings
        )
      ) {
        pendingAvailabilitySyncRef.current = null;
        return normalizedRemoteAvailabilitySettings;
      }

      suppressAutoPortalPublishUntilRef.current =
        Date.now() + PORTAL_REMOTE_REHYDRATION_SUPPRESS_PUBLISH_MS;
      pendingAvailabilitySyncRef.current = null;
      latestAvailabilitySettingsRef.current = normalizedRemoteAvailabilitySettings;
      setAvailabilitySettings(normalizedRemoteAvailabilitySettings);
      return normalizedRemoteAvailabilitySettings;
    },
    []
  );

  const enqueuePortalPublish = React.useCallback(
    async (snapshot: Parameters<typeof publishClientPortalSnapshot>[0]) => {
      const runTask = async () => {
        let effectiveSnapshot = snapshot;
        const normalizedSalonCode = normalizeSalonCode(snapshot.workspace.salonCode);
        const shouldPreserveRemoteWorkspaceToggles =
          Date.now() - lastLocalWorkspaceMutationAtRef.current >=
          PORTAL_CRITICAL_OWNER_TOGGLE_GUARD_MS;
        const shouldPreserveRemoteGuidedSettings =
          Date.now() - lastLocalAvailabilityMutationAtRef.current >=
          PORTAL_CRITICAL_OWNER_TOGGLE_GUARD_MS;

        if (
          normalizedSalonCode &&
          (shouldPreserveRemoteWorkspaceToggles || shouldPreserveRemoteGuidedSettings)
        ) {
          try {
            const [remoteSnapshot, remoteAvailabilitySnapshot] = await Promise.all([
              fetchClientPortalSnapshot(normalizedSalonCode).catch(() => null),
              fetchClientPortalAvailabilitySettings(normalizedSalonCode).catch(() => null),
            ]);

            if (
              remoteSnapshot &&
              normalizeAccountEmail(remoteSnapshot.workspace.ownerEmail) ===
                normalizeAccountEmail(snapshot.workspace.ownerEmail)
            ) {
              const remoteWorkspaceNewer =
                parseIsoTimestampToMs(remoteSnapshot.workspace.autoAcceptBookingRequestsUpdatedAt) >
                parseIsoTimestampToMs(snapshot.workspace.autoAcceptBookingRequestsUpdatedAt);

              effectiveSnapshot = {
                ...snapshot,
                workspace: shouldPreserveRemoteWorkspaceToggles || remoteWorkspaceNewer
                  ? normalizeWorkspace(
                      remoteSnapshot.workspace,
                      snapshot.workspace.ownerEmail
                    )
                  : snapshot.workspace,
                availabilitySettings: mergeAvailabilitySettingsWithCriticalTimestamps(
                  snapshot.availabilitySettings,
                  remoteAvailabilitySnapshot?.availabilitySettings ??
                    remoteSnapshot.availabilitySettings
                ),
              };
            } else if (remoteAvailabilitySnapshot) {
              effectiveSnapshot = {
                ...snapshot,
                availabilitySettings: mergeAvailabilitySettingsWithCriticalTimestamps(
                  snapshot.availabilitySettings,
                  remoteAvailabilitySnapshot.availabilitySettings
                ),
              };
            }
          } catch (error) {
            console.log('Errore merge toggle critici prima della pubblicazione portale:', error);
          }
        }

        return runWithDeadlockRetry(
          () => publishClientPortalSnapshot(effectiveSnapshot),
          'Pubblicazione portale cliente'
        );
      };

      const queuedTask = portalPublishQueueRef.current.then(runTask, runTask);
      portalPublishQueueRef.current = queuedTask.then(
        () => undefined,
        () => undefined
      );

      return queuedTask;
    },
    [runWithDeadlockRetry]
  );

  const processPublicSlotWaitlistAndFlush = React.useCallback(
    async ({
      workspaceId,
      appointmentDate,
      appointmentTime,
    }: {
      workspaceId: string;
      appointmentDate?: string | null;
      appointmentTime?: string | null;
    }) => {
      if (!isUuidValue(workspaceId)) {
        return false;
      }

      const { error } = await supabase.rpc('process_public_slot_waitlist', {
        p_workspace_id: workspaceId,
        p_appointment_date: appointmentDate ?? null,
        p_appointment_time: appointmentTime ?? null,
      });

      if (error) {
        console.log('Errore processazione waitlist pubblica:', error);
        return false;
      }

      await flushQueuedPushNotifications();
      return true;
    },
    []
  );

  const markRecentlyDeletedAppointment = React.useCallback(
    ({
      date,
      time,
      customerName,
      serviceName,
      operatorId,
      operatorName,
    }: {
      date: string;
      time: string;
      customerName: string;
      serviceName: string;
      operatorId?: string | null;
      operatorName?: string | null;
    }) => {
      const now = Date.now();
      const threshold = now - RECENTLY_DELETED_APPOINTMENT_GUARD_MS;
      const current = recentlyDeletedAppointmentKeysRef.current;

      current.forEach((timestamp, key) => {
        if (timestamp < threshold) {
          current.delete(key);
        }
      });

      current.set(
        buildAppointmentIdentityKey({
          date,
          time,
          customerName,
          serviceName,
          operatorId,
          operatorName,
        }),
        now
      );

      void AsyncStorage.setItem(
        STORAGE_KEYS.recently_deleted_appointments,
        JSON.stringify(Array.from(current.entries()))
      ).catch(() => null);
    },
    []
  );

  const unmarkRecentlyDeletedAppointment = React.useCallback(
    ({
      date,
      time,
      customerName,
      serviceName,
      operatorId,
      operatorName,
    }: {
      date: string;
      time: string;
      customerName: string;
      serviceName: string;
      operatorId?: string | null;
      operatorName?: string | null;
    }) => {
      const current = recentlyDeletedAppointmentKeysRef.current;
      current.delete(
        buildAppointmentIdentityKey({
          date,
          time,
          customerName,
          serviceName,
          operatorId,
          operatorName,
        })
      );

      void AsyncStorage.setItem(
        STORAGE_KEYS.recently_deleted_appointments,
        JSON.stringify(Array.from(current.entries()))
      ).catch(() => null);
    },
    []
  );

  const markRecentlyDeletedCustomer = React.useCallback(
    (customer: { id?: string | null; nome?: string | null; telefono?: string | null; email?: string | null }) => {
      const current = recentlyDeletedCustomerKeysRef.current;
      current.set(
        buildCustomerIdentityKey({
          id: customer.id?.trim() ?? '',
          nome: customer.nome?.trim() ?? '',
          telefono: customer.telefono?.trim() ?? '',
          email: customer.email?.trim().toLowerCase() ?? '',
        }),
        Date.now()
      );

      void AsyncStorage.setItem(
        STORAGE_KEYS.recently_deleted_customers,
        JSON.stringify(Array.from(current.entries()))
      ).catch(() => null);
    },
    []
  );

  const unmarkRecentlyDeletedCustomer = React.useCallback(
    (customer: { id?: string | null; nome?: string | null; telefono?: string | null; email?: string | null }) => {
      const current = recentlyDeletedCustomerKeysRef.current;
      current.delete(
        buildCustomerIdentityKey({
          id: customer.id?.trim() ?? '',
          nome: customer.nome?.trim() ?? '',
          telefono: customer.telefono?.trim() ?? '',
          email: customer.email?.trim().toLowerCase() ?? '',
        })
      );

      void AsyncStorage.setItem(
        STORAGE_KEYS.recently_deleted_customers,
        JSON.stringify(Array.from(current.entries()))
      ).catch(() => null);
    },
    []
  );

  const getRecentlyCreatedAppointmentCompositeKeys = React.useCallback(() => {
    const now = Date.now();
    const threshold = now - RECENTLY_CREATED_APPOINTMENT_GUARD_MS;
    const current = recentlyCreatedAppointmentKeysRef.current;

    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    return new Set(current.keys());
  }, []);

  const markRecentlyCreatedAppointment = React.useCallback((item: Appuntamento) => {
    const now = Date.now();
    const threshold = now - RECENTLY_CREATED_APPOINTMENT_GUARD_MS;
    const current = recentlyCreatedAppointmentKeysRef.current;

    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    current.set(buildAppuntamentoMergeKey(item), now);
  }, []);

  const getRecentlyMovedAppointmentIds = React.useCallback(() => {
    const now = Date.now();
    const threshold = now - RECENTLY_CREATED_APPOINTMENT_GUARD_MS;
    const current = recentlyMovedAppointmentIdsRef.current;

    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    return new Set(current.keys());
  }, []);

  const markRecentlyMovedAppointmentId = React.useCallback((appointmentId?: string | null) => {
    const normalizedId = appointmentId?.trim() ?? '';
    if (!normalizedId) {
      return;
    }

    const now = Date.now();
    const threshold = now - RECENTLY_CREATED_APPOINTMENT_GUARD_MS;
    const current = recentlyMovedAppointmentIdsRef.current;

    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    current.set(normalizedId, now);
  }, []);

  const filterRecentlyDeletedAppointments = React.useCallback((items: Appuntamento[]) => {
    const current = recentlyDeletedAppointmentKeysRef.current;
    if (current.size === 0) {
      return items;
    }

    const now = Date.now();
    const threshold = now - RECENTLY_DELETED_APPOINTMENT_GUARD_MS;
    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    if (current.size === 0) {
      return items;
    }

    return items.filter((item) => {
      const itemDate = item.data ?? getTodayDateString();
      const key = buildAppointmentIdentityKey({
        date: itemDate,
        time: item.ora,
        customerName: item.cliente,
        serviceName: item.servizio,
        operatorId: item.operatoreId,
        operatorName: item.operatoreNome,
      });

      return !current.has(key);
    });
  }, []);

  const filterRecentlyDeletedCustomers = React.useCallback((items: Cliente[]) => {
    const current = recentlyDeletedCustomerKeysRef.current;
    if (current.size === 0) {
      return items;
    }

    const now = Date.now();
    const threshold = now - RECENTLY_DELETED_CUSTOMER_GUARD_MS;
    current.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        current.delete(key);
      }
    });

    if (current.size === 0) {
      return items;
    }

    return items.filter((item) => !current.has(buildCustomerIdentityKey(item)));
  }, []);

  useEffect(() => {
    const now = Date.now();
    const threshold = now - RECENTLY_DELETED_CUSTOMER_GUARD_MS;
    const deletedKeys = recentlyDeletedCustomerKeysRef.current;

    deletedKeys.forEach((timestamp, key) => {
      if (timestamp < threshold) {
        deletedKeys.delete(key);
      }
    });

    const normalizedCurrentCustomers = normalizeClienti(clienti);
    const currentKeys = new Set(
      normalizedCurrentCustomers.map((item) => buildCustomerIdentityKey(item))
    );
    const previousKeys = previousCustomerIdentityKeysRef.current;

    previousKeys.forEach((key) => {
      if (!currentKeys.has(key)) {
        deletedKeys.set(key, now);
      }
    });

    currentKeys.forEach((key) => {
      if (deletedKeys.has(key)) {
        deletedKeys.delete(key);
      }
    });

    void AsyncStorage.setItem(
      STORAGE_KEYS.recently_deleted_customers,
      JSON.stringify(Array.from(deletedKeys.entries()))
    ).catch(() => null);

    previousCustomerIdentityKeysRef.current = currentKeys;
  }, [clienti]);

  const isUuid = React.useCallback(
    (value?: string | null) =>
      !!value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    []
  );

  const clearRuntimeDataForAccount = React.useCallback((email: string) => {
    setSalonWorkspace(createDefaultWorkspace(email));
    setClienti(normalizeClienti([]));
    setAppuntamenti(normalizeAppuntamenti([]));
    setMovimenti(normalizeMovimenti([]));
    setServizi(normalizeServizi([]));
    setOperatori(normalizeOperatori([]));
    setMacchinari(normalizeMacchinari([]));
    setCarteCollegate([]);
    setEventi([]);
    setRichiestePrenotazione([]);
    setAvailabilitySettings(normalizeAvailabilitySettings());
    setBiometricEnabled(false);
    setHasCompletedOnboarding(false);
    setShowOnboarding(false);
    setMessaggioEventoTemplate(
      'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
    );
    setServiceCardColorOverrides({});
    setRoleCardColorOverrides({});
  }, []);

  const syncAuthenticatedWorkspace = React.useCallback(
    async (email: string, applyToState = true) => {
      const normalizedEmail = normalizeAccountEmail(email);

      if (!normalizedEmail) {
        return createDefaultWorkspace('');
      }

      const workspaceStorageKey = buildScopedStorageKey(STORAGE_KEYS.workspace, normalizedEmail);
      let storedWorkspace: Partial<SalonWorkspace> | null = null;

      try {
        const rawStoredWorkspace = await AsyncStorage.getItem(workspaceStorageKey);
        storedWorkspace = rawStoredWorkspace
          ? (JSON.parse(rawStoredWorkspace) as Partial<SalonWorkspace>)
          : null;
      } catch (error) {
        console.log('Errore lettura workspace salvato:', error);
      }

      const ownerAccounts = await loadOwnerAccounts();
      const matchingOwnerAccount =
        ownerAccounts.find((item) => normalizeAccountEmail(item.email) === normalizedEmail) ?? null;
      const ownerAccountWorkspaceFallback = buildWorkspaceProfileFromOwnerAccount(
        matchingOwnerAccount
      );
      const fallbackWorkspace = normalizeWorkspace(
        {
          ...ownerAccountWorkspaceFallback,
          ...storedWorkspace,
        },
        normalizedEmail
      );

      try {
        const { data, error } = await supabase
          .from('workspaces')
          .select(
            'id, slug, salon_name, owner_email, customer_reminder_hours_before, subscription_plan, subscription_status, created_at, updated_at'
          )
          .eq('owner_email', normalizedEmail)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const remoteWorkspace = (data ?? null) as RemoteWorkspaceRow | null;

        const nextWorkspace = remoteWorkspace
          ? normalizeWorkspace(
              {
                ...ownerAccountWorkspaceFallback,
                ...storedWorkspace,
                id: remoteWorkspace.id,
                salonCode: remoteWorkspace.slug,
                salonName: remoteWorkspace.salon_name,
                ownerEmail: remoteWorkspace.owner_email,
                customerReminderHoursBefore:
                  remoteWorkspace.customer_reminder_hours_before ?? undefined,
                subscriptionPlan: remoteWorkspace.subscription_plan,
                subscriptionStatus: remoteWorkspace.subscription_status,
                createdAt: remoteWorkspace.created_at,
                updatedAt: remoteWorkspace.updated_at,
              },
              normalizedEmail
            )
          : fallbackWorkspace;

        await AsyncStorage.setItem(workspaceStorageKey, JSON.stringify(nextWorkspace));

        if (applyToState) {
          setSalonWorkspace(nextWorkspace);
        }

        return nextWorkspace;
      } catch (error) {
        console.log('Errore sincronizzazione workspace autenticato:', error);

        if (applyToState) {
          setSalonWorkspace(fallbackWorkspace);
        }

        return fallbackWorkspace;
      }
    },
    []
  );

  const completeOnboarding = React.useCallback(() => {
    pendingRegistrationOnboardingRef.current = false;
    setHasCompletedOnboarding(true);
    setShowOnboarding(false);

    if (!salonAccountEmail) {
      return;
    }

    void AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, salonAccountEmail),
      'true'
    ).catch(() => undefined);
  }, [salonAccountEmail]);

  const reopenOnboarding = React.useCallback(() => {
    pendingRegistrationOnboardingRef.current = false;
    setShowOnboarding(true);
  }, []);

  React.useEffect(() => {
    pendingBiometricUnlockRef.current = pendingBiometricUnlock;
  }, [pendingBiometricUnlock]);

  React.useEffect(() => {
    if (
      !pendingRegistrationOnboardingRef.current ||
      !isAuthenticated ||
      !hasInitializedAuth ||
      !salonAccountEmail ||
      hasCompletedOnboarding ||
      showOnboarding
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (
        !pendingRegistrationOnboardingRef.current ||
        hasCompletedOnboarding ||
        showOnboarding
      ) {
        return;
      }

      setIsLoaded(true);
      setShowOnboarding(true);
    }, 650);

    return () => clearTimeout(timer);
  }, [
    hasCompletedOnboarding,
    hasInitializedAuth,
    isAuthenticated,
    salonAccountEmail,
    showOnboarding,
  ]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;

    const processEndOfDayCashout = async () => {
      const today = getTodayDateString();
      const storageKey = buildScopedStorageKey(
        STORAGE_KEYS.daily_auto_cashout,
        salonAccountEmail
      );

      try {
        const lastProcessedDate = await AsyncStorage.getItem(storageKey);
        if (lastProcessedDate === today) {
          return;
        }

        let appointmentsChanged = false;
        let movementsChanged = false;

        setAppuntamenti((current) => {
          const nextAppointments = current.map((item) => {
            const appointmentDate = item.data ?? today;
            const shouldAutoCashout =
              appointmentDate < today &&
              !item.incassato &&
              !item.nonEffettuato;

            if (!shouldAutoCashout) {
              return item;
            }

            appointmentsChanged = true;
            return {
              ...item,
              completato: true,
              incassato: true,
            };
          });

          return appointmentsChanged ? nextAppointments : current;
        });

        setMovimenti((current) => {
          const nextMovements = [...current];

          appuntamenti.forEach((item) => {
            const appointmentDate = item.data ?? today;
            const shouldAutoCashout =
              appointmentDate < today &&
              !item.incassato &&
              !item.nonEffettuato;

            if (!shouldAutoCashout) {
              return;
            }

            const movementId = buildAutoCashoutMovementId(item.id, appointmentDate);
            const alreadyPresent = nextMovements.some((movement) => movement.id === movementId);
            if (alreadyPresent) {
              return;
            }

            movementsChanged = true;
            nextMovements.unshift({
              id: movementId,
              descrizione: `Incasso automatico fine giornata · ${item.servizio} · ${item.cliente}`,
              importo: item.prezzo,
              metodo: 'Contanti',
              createdAt: `${appointmentDate}T23:59:00.000Z`,
            });
          });

          return movementsChanged ? nextMovements : current;
        });

        await AsyncStorage.setItem(storageKey, today);
      } catch (error) {
        console.log('Errore chiusura automatica fine giornata:', error);
      }
    };

    processEndOfDayCashout();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        processEndOfDayCashout();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appuntamenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    const caricaAccountAttivo = async () => {
      try {
        const [accountSalvato, sessioneSalvata, linguaSalvata, authSessionResult] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.account_attivo),
          AsyncStorage.getItem(STORAGE_KEYS.owner_session),
          AsyncStorage.getItem(STORAGE_KEYS.app_language),
          supabase.auth.getSession(),
        ]);
        const authSessionEmail = normalizeAccountEmail(authSessionResult.data.session?.user.email);
        const persistedAccount = normalizeAccountEmail(accountSalvato);
        const normalizedAccount = authSessionEmail || persistedAccount;

        if (!accountSalvato && normalizedAccount) {
          await AsyncStorage.setItem(STORAGE_KEYS.account_attivo, normalizedAccount);
        }

        if (authSessionEmail) {
          await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authSessionEmail);
        } else if (sessioneSalvata) {
          await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
        }

        setIsAuthenticated(!!authSessionEmail);
        setSalonAccountEmail(normalizedAccount);
        setAppLanguage(resolveStoredAppLanguage(linguaSalvata));

        if (authSessionEmail) {
          void syncAuthenticatedWorkspace(
            authSessionEmail,
            normalizedAccount === authSessionEmail
          );
        }
      } catch (error) {
        console.log('Errore caricamento account:', error);
      } finally {
        setHasInitializedAuth(true);
      }
    };

    caricaAccountAttivo();
  }, [syncAuthenticatedWorkspace]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const authEmail = normalizeAccountEmail(session?.user?.email);

      if (event === 'PASSWORD_RECOVERY') {
        setOwnerPasswordRecoveryActive(true);
      }

      if (event === 'SIGNED_OUT' || !authEmail) {
        AsyncStorage.removeItem(STORAGE_KEYS.owner_session).catch(() => undefined);
        setOwnerPasswordRecoveryActive(false);
        setIsAuthenticated(false);
        return;
      }

      AsyncStorage.setItem(STORAGE_KEYS.owner_session, authEmail).catch(() => undefined);
      AsyncStorage.setItem(STORAGE_KEYS.account_attivo, authEmail).catch(() => undefined);
      setSalonAccountEmail(authEmail);
      setIsAuthenticated(true);
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        setOwnerPasswordRecoveryActive(false);
      }
      void syncAuthenticatedWorkspace(authEmail, true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncAuthenticatedWorkspace]);

  const activateOwnerPasswordRecoveryFromUrl = React.useCallback(
    async (incomingUrl?: string | null) => {
      const normalizedUrl = incomingUrl?.trim() ?? '';
      if (!normalizedUrl) {
        return {
          ok: false as const,
          error: 'Link di recupero non valido.',
        };
      }

      if (
        ownerRecoveryProcessedUrlRef.current === normalizedUrl &&
        ownerPasswordRecoveryActive
      ) {
        return { ok: true as const, recoveryReady: true };
      }

      if (
        ownerRecoveryUrlInFlightRef.current === normalizedUrl &&
        ownerRecoveryPromiseRef.current
      ) {
        return ownerRecoveryPromiseRef.current;
      }

      ownerRecoveryUrlInFlightRef.current = normalizedUrl;
      const task = (async () => {
        const parsedCallback = parseSupabaseAuthCallbackUrl(normalizedUrl);
        const recoveryIntent =
          normalizedUrl.includes('recovery=1') ||
          normalizedUrl.includes('type=recovery') ||
          normalizedUrl.includes('/reset-password');
        if (!parsedCallback) {
          if (recoveryIntent) {
            const { data: sessionResult } = await supabase.auth.getSession();
            if (sessionResult.session?.user?.id) {
              ownerRecoveryProcessedUrlRef.current = normalizedUrl;
              setOwnerPasswordRecoveryActive(true);
              return { ok: true as const, recoveryReady: true };
            }
          }

          return {
            ok: false as const,
            error: 'Link di recupero non valido o incompleto.',
          };
        }

        try {
          if (parsedCallback.code) {
            const { error } = await supabase.auth.exchangeCodeForSession(parsedCallback.code);
            if (error) {
              console.log('Errore exchange code recovery Supabase:', error);
              return {
                ok: false as const,
                error: error.message?.trim() || 'Sessione di recupero non valida.',
              };
            }
          } else if (parsedCallback.tokenHash && parsedCallback.eventType) {
            const { error } = await supabase.auth.verifyOtp({
              type: parsedCallback.eventType as 'recovery',
              token_hash: parsedCallback.tokenHash,
            });
            if (error) {
              console.log('Errore verifyOtp recovery Supabase:', error);
              return {
                ok: false as const,
                error: error.message?.trim() || 'Sessione di recupero non valida.',
              };
            }
          } else if (parsedCallback.accessToken && parsedCallback.refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: parsedCallback.accessToken,
              refresh_token: parsedCallback.refreshToken,
            });
            if (error) {
              console.log('Errore sessione recovery Supabase:', error);
              return {
                ok: false as const,
                error: error.message?.trim() || 'Sessione di recupero non valida.',
              };
            }
          }

          if (!parsedCallback.isRecovery) {
            return {
              ok: false as const,
              error: 'Il link ricevuto non corrisponde a un recupero password.',
            };
          }

          ownerRecoveryProcessedUrlRef.current = normalizedUrl;
          setOwnerPasswordRecoveryActive(true);
          return { ok: true as const, recoveryReady: true };
        } catch (error) {
          console.log('Errore gestione deep link auth Supabase:', error);
          return {
            ok: false as const,
            error: 'Non sono riuscito ad attivare il recupero password.',
          };
        }
      })();

      ownerRecoveryPromiseRef.current = task;
      const result = await task;

      if (ownerRecoveryUrlInFlightRef.current === normalizedUrl) {
        ownerRecoveryUrlInFlightRef.current = null;
      }
      if (ownerRecoveryPromiseRef.current === task) {
        ownerRecoveryPromiseRef.current = null;
      }

      return result;
    },
    [ownerPasswordRecoveryActive]
  );

  useEffect(() => {
    let isActive = true;

    void ExpoLinking.getInitialURL().then((initialUrl) => {
      if (!isActive || !initialUrl) {
        return;
      }

      void activateOwnerPasswordRecoveryFromUrl(initialUrl);
    });

    const subscription = ExpoLinking.addEventListener('url', ({ url }) => {
      if (!isActive || !url) {
        return;
      }

      void activateOwnerPasswordRecoveryFromUrl(url);
    });

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [activateOwnerPasswordRecoveryFromUrl]);

  useEffect(() => {
    let cancelled = false;

    const caricaDatiAccount = async () => {
      if (!hasInitializedAuth) {
        return;
      }

      if (!salonAccountEmail) {
        ownerPortalBootstrapReadyRef.current = false;
        clearRuntimeDataForAccount('');
        setIsLoaded(true);
        return;
      }

      ownerPortalBootstrapReadyRef.current = false;
      setIsLoaded(false);

      try {
        const clientiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail)
        );
        const workspaceSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail)
        );
        const appuntamentiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.appuntamenti, salonAccountEmail)
        );
        const movimentiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.movimenti, salonAccountEmail)
        );
        const serviziSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.servizi, salonAccountEmail)
        );
        const carteSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.carte, salonAccountEmail)
        );
        const operatoriSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.operatori, salonAccountEmail)
        );
        const macchinariSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.macchinari, salonAccountEmail)
        );
        const eventiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.eventi, salonAccountEmail)
        );
        const richiesteSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, salonAccountEmail)
        );
        const availabilitySettingsSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail)
        );
        const onboardingCompletedSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, salonAccountEmail)
        );
        const templateEventiSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.eventi_template, salonAccountEmail)
        );
        const biometricEnabledSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, salonAccountEmail)
        );
        const serviceCardColorsSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.service_card_color_overrides, salonAccountEmail)
        );
        const roleCardColorsSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.role_card_color_overrides, salonAccountEmail)
        );
        const storedWorkspace = workspaceSalvato
          ? normalizeWorkspace(JSON.parse(workspaceSalvato), salonAccountEmail)
          : createDefaultWorkspace(salonAccountEmail);
        let nextWorkspace = storedWorkspace;
        let nextClienti: Cliente[] = clientiSalvati
          ? normalizeClienti(JSON.parse(clientiSalvati))
          : normalizeClienti([]);
        let nextAppuntamenti = appuntamentiSalvati
          ? normalizeAppuntamenti(JSON.parse(appuntamentiSalvati))
          : normalizeAppuntamenti([]);
        let nextServizi = serviziSalvati
          ? normalizeServizi(JSON.parse(serviziSalvati))
          : normalizeServizi([]);
        let nextOperatori = operatoriSalvati ? normalizeOperatori(JSON.parse(operatoriSalvati)) : [];
        let nextRichieste = richiesteSalvate
          ? normalizeRichiestePrenotazione(JSON.parse(richiesteSalvate))
          : [];
        let nextAvailabilitySettings = availabilitySettingsSalvate
          ? normalizeAvailabilitySettings(JSON.parse(availabilitySettingsSalvate))
          : normalizeAvailabilitySettings();
        const nextMovimenti = movimentiSalvati
          ? normalizeMovimenti(JSON.parse(movimentiSalvati))
          : normalizeMovimenti([]);
        const nextMacchinari = macchinariSalvati ? normalizeMacchinari(JSON.parse(macchinariSalvati)) : [];
        const nextCarte = carteSalvate ? normalizeCarte(JSON.parse(carteSalvate)) : [];
        const nextEventi = eventiSalvati ? JSON.parse(eventiSalvati) : [];
        const nextTemplateEventi =
          templateEventiSalvato ??
          'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.';
        const nextServiceCardOverrides = serviceCardColorsSalvate ? JSON.parse(serviceCardColorsSalvate) : {};
        const nextRoleCardOverrides = roleCardColorsSalvate ? JSON.parse(roleCardColorsSalvate) : {};

        const hasMeaningfulExistingData =
          nextClienti.length > 0 ||
          nextAppuntamenti.length > 0 ||
          nextServizi.length > 0 ||
          nextOperatori.length > 0 ||
          nextRichieste.length > 0 ||
          nextMovimenti.length > 0 ||
          !!storedWorkspace.salonCode?.trim() ||
          !!storedWorkspace.salonName?.trim();

        const shouldForceOnboardingCompletedForExistingAccount =
          onboardingCompletedSalvato == null && hasMeaningfulExistingData;

        const onboardingCompleted =
          onboardingCompletedSalvato === 'true' || shouldForceOnboardingCompletedForExistingAccount;

        const applyLoadedState = ({
          workspace,
          clientiState,
          appuntamentiState,
          serviziState,
          operatoriState,
          richiesteState,
          availabilityState,
        }: {
          workspace: SalonWorkspace;
          clientiState: Cliente[];
          appuntamentiState: Appuntamento[];
          serviziState: Servizio[];
          operatoriState: Operatore[];
          richiesteState: RichiestaPrenotazione[];
          availabilityState: AvailabilitySettings;
        }) => {
          if (cancelled) {
            return;
          }

          suppressAutoPortalPublishUntilRef.current =
            Date.now() + PORTAL_REMOTE_REHYDRATION_SUPPRESS_PUBLISH_MS;

          setSalonWorkspace(workspace);
          setClienti(clientiState);
          setAppuntamenti(appuntamentiState);
          setMovimenti(nextMovimenti);
          setServizi(serviziState);
          setOperatori(operatoriState);
          setMacchinari(nextMacchinari);
          setCarteCollegate(nextCarte);
          setEventi(nextEventi);
          setRichiestePrenotazione(richiesteState);
          setAvailabilitySettings(availabilityState);
          setBiometricEnabled(biometricEnabledSalvato === 'true');
          setHasCompletedOnboarding(onboardingCompleted);
          setShowOnboarding(!onboardingCompleted);
          setMessaggioEventoTemplate(nextTemplateEventi);
          setServiceCardColorOverrides(nextServiceCardOverrides);
          setRoleCardColorOverrides(nextRoleCardOverrides);
        };

        applyLoadedState({
          workspace: nextWorkspace,
          clientiState: nextClienti,
          appuntamentiState: nextAppuntamenti,
          serviziState: nextServizi,
          operatoriState: nextOperatori,
          richiesteState: nextRichieste,
          availabilityState: nextAvailabilitySettings,
        });

        if (shouldForceOnboardingCompletedForExistingAccount) {
          void AsyncStorage.setItem(
            buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, salonAccountEmail),
            'true'
          ).catch(() => undefined);
        }
        setIsLoaded(true);

        if (storedWorkspace.salonCode) {
          try {
            const lightweightSettings = await fetchPortalAvailabilitySettingsWithRetry(
              storedWorkspace.salonCode
            );

            if (lightweightSettings) {
              nextAvailabilitySettings = mergeAvailabilitySettingsWithCriticalTimestamps(
                nextAvailabilitySettings,
                lightweightSettings.availabilitySettings
              );
              applyLoadedState({
                workspace: nextWorkspace,
                clientiState: nextClienti,
                appuntamentiState: nextAppuntamenti,
                serviziState: nextServizi,
                operatoriState: nextOperatori,
                richiesteState: nextRichieste,
                availabilityState: nextAvailabilitySettings,
              });
            }

            const remoteSnapshot = await fetchPortalSnapshotWithRetry(storedWorkspace.salonCode);

            if (
              remoteSnapshot &&
              normalizeAccountEmail(remoteSnapshot.workspace.ownerEmail) ===
                normalizeAccountEmail(salonAccountEmail)
            ) {
              nextWorkspace = mergeWorkspaceWithCriticalTimestamps(
                {
                  ...nextWorkspace,
                  cashSectionDisabled: nextWorkspace.cashSectionDisabled,
                },
                {
                  ...remoteSnapshot.workspace,
                  cashSectionDisabled:
                    remoteSnapshot.workspace.cashSectionDisabled ?? nextWorkspace.cashSectionDisabled,
                },
                salonAccountEmail
              );
              nextRichieste = normalizeRichiestePrenotazione(
                remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
              );
              nextClienti = filterRecentlyDeletedCustomers(
                enrichClientiWithFrontendRequestSignals(
                  mergeClientiCollections(nextClienti, remoteSnapshot.clienti as Cliente[]),
                  nextRichieste
                )
              );
              nextAppuntamenti = normalizeAppuntamenti(
                filterRecentlyDeletedAppointments(
                  mergeAppuntamentiCollections(nextAppuntamenti, remoteSnapshot.appuntamenti as Appuntamento[])
                )
              );
              nextServizi = normalizeServizi(
                mergeServiziCollections(nextServizi, remoteSnapshot.servizi as Servizio[])
              );
              nextOperatori = preferNonEmptyOperatoriSnapshot(
                nextOperatori,
                remoteSnapshot.operatori as Operatore[]
              );
              nextAvailabilitySettings = mergeAvailabilitySettingsWithCriticalTimestamps(
                nextAvailabilitySettings,
                lightweightSettings?.availabilitySettings ?? remoteSnapshot.availabilitySettings
              );
              const mergedServiceCardOverrides = mergeServiceColorOverrideMaps({
                remoteOverrides: remoteSnapshot.serviceCardColorOverrides ?? {},
                localOverrides: nextServiceCardOverrides,
                services: nextServizi,
              });
              const mergedRoleCardOverrides = mergeRoleColorOverrideMaps({
                remoteOverrides: remoteSnapshot.roleCardColorOverrides ?? {},
                localOverrides: nextRoleCardOverrides,
              });
              Object.assign(nextServiceCardOverrides, mergedServiceCardOverrides);
              Object.assign(nextRoleCardOverrides, mergedRoleCardOverrides);

              applyLoadedState({
                workspace: nextWorkspace,
                clientiState: nextClienti,
                appuntamentiState: nextAppuntamenti,
                serviziState: nextServizi,
                operatoriState: nextOperatori,
                richiesteState: nextRichieste,
                availabilityState: nextAvailabilitySettings,
              });
            }
          } catch (error) {
            console.log('Errore reidratazione snapshot remoto owner:', error);
          }
        }
      } catch (error) {
        console.log('Errore caricamento dati account:', error);
        setSalonWorkspace(createDefaultWorkspace(salonAccountEmail));
        setClienti(normalizeClienti([]));
        setAppuntamenti(normalizeAppuntamenti([]));
        setMovimenti(normalizeMovimenti([]));
        setServizi(normalizeServizi([]));
        setOperatori(normalizeOperatori([]));
        setMacchinari(normalizeMacchinari([]));
        setCarteCollegate([]);
        setEventi([]);
        setRichiestePrenotazione([]);
        setAvailabilitySettings(normalizeAvailabilitySettings());
        setBiometricEnabled(false);
        setHasCompletedOnboarding(false);
        setShowOnboarding(false);
        setMessaggioEventoTemplate(
          'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
        );
        setServiceCardColorOverrides({});
        setRoleCardColorOverrides({});
        setIsLoaded(true);
      }
    };

    caricaDatiAccount();

    return () => {
      cancelled = true;
    };
  }, [
    clearRuntimeDataForAccount,
    fetchPortalAvailabilitySettingsWithRetry,
    fetchPortalSnapshotWithRetry,
    filterRecentlyDeletedCustomers,
    hasInitializedAuth,
    isExpoGoRuntime,
    salonAccountEmail,
  ]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.app_language, appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    if (
      !isLoaded ||
      !isAuthenticated ||
      !hasInitializedAuth ||
      !salonAccountEmail
    )
      return;

    if (!ownerPortalBootstrapReadyRef.current) {
      return;
    }

    const normalizedOwnerEmail = normalizeAccountEmail(
      salonWorkspace.ownerEmail || salonAccountEmail
    );
    const normalizedSalonCode = normalizeSalonCode(salonWorkspace.salonCode);
    const resolvedSalonName = resolveSalonDisplayName({
      salonName: salonWorkspace.salonName,
      activityCategory: salonWorkspace.activityCategory,
      salonCode: normalizedSalonCode,
      ownerEmail: normalizedOwnerEmail,
    });

    if (!normalizedOwnerEmail || !normalizedSalonCode || !resolvedSalonName) {
      return;
    }

    let cancelled = false;

    const publishPortalSnapshot = async () => {
      if (Date.now() < suppressAutoPortalPublishUntilRef.current) {
        return;
      }

      try {
        const workspaceId = await enqueuePortalPublish({
          workspace: {
            ...salonWorkspace,
            ownerEmail: normalizedOwnerEmail,
            salonCode: normalizedSalonCode,
            salonName: resolvedSalonName,
          },
          clienti: clienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: appuntamenti as unknown as Array<Record<string, unknown>>,
          servizi: servizi as unknown as Array<Record<string, unknown>>,
          operatori: operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione:
            richiestePrenotazione as unknown as Array<Record<string, unknown>>,
          availabilitySettings,
          serviceCardColorOverrides,
          roleCardColorOverrides,
        });

        if (!cancelled && workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({
            ...current,
            id: workspaceId,
            ownerEmail: normalizedOwnerEmail,
            salonCode: normalizedSalonCode,
            salonName: resolvedSalonName,
          }));
        }
      } catch (error) {
        console.log('Errore pubblicazione portale cliente:', error);
      }
    };

    if (portalPublishDebounceRef.current) {
      clearTimeout(portalPublishDebounceRef.current);
    }

    portalPublishDebounceRef.current = setTimeout(() => {
      void publishPortalSnapshot();
    }, 300);

    return () => {
      cancelled = true;

      if (portalPublishDebounceRef.current) {
        clearTimeout(portalPublishDebounceRef.current);
        portalPublishDebounceRef.current = null;
      }
    };
  }, [
    appuntamenti,
    availabilitySettings,
    clienti,
    enqueuePortalPublish,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    operatori,
    richiestePrenotazione,
    roleCardColorOverrides,
    salonAccountEmail,
    salonWorkspace,
    serviceCardColorOverrides,
    servizi,
    isExpoGoRuntime,
  ]);

  useEffect(() => {
    // Gli appuntamenti legacy restano non assegnati nel database.
    // L'assegnazione fallback viene usata solo in lettura/UI per evitare
    // side-effect su conflitti e accettazione richieste.
    legacyOperatorBackfillSignatureRef.current = '';
  }, [
    appuntamenti,
    availabilitySettings,
    isAuthenticated,
    isLoaded,
    operatori,
    salonWorkspace.id,
    servizi,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !isLoaded || !isUuidValue(salonWorkspace.id) || servizi.length === 0) {
      salonCapacityBackfillSignatureRef.current = '';
      return;
    }

    const appointmentsToBackfill = appuntamenti
      .filter((item) => {
        const operatorId = item.operatoreId?.trim() ?? '';
        const operatorName = item.operatoreNome?.trim() ?? '';
        const desiredOperatorId = buildSalonCapacityOperatorId(item.servizio, servizi);
        return (
          isUuidValue(item.id) &&
          !operatorName &&
          !doesServiceUseOperators(item.servizio, servizi) &&
          desiredOperatorId !== '' &&
          operatorId !== desiredOperatorId
        );
      })
      .map((item) => ({
        id: item.id,
        operatorId: buildSalonCapacityOperatorId(item.servizio, servizi),
      }));

    const requestsToBackfill = richiestePrenotazione
      .filter((item) => {
        const operatorId = item.operatoreId?.trim() ?? '';
        const operatorName = item.operatoreNome?.trim() ?? '';
        const desiredOperatorId = buildSalonCapacityOperatorId(item.servizio, servizi);
        return (
          isUuidValue(item.id) &&
          (item.stato === 'In attesa' || item.stato === 'Accettata') &&
          !operatorName &&
          !doesServiceUseOperators(item.servizio, servizi) &&
          desiredOperatorId !== '' &&
          operatorId !== desiredOperatorId
        );
      })
      .map((item) => ({
        id: item.id,
        operatorId: buildSalonCapacityOperatorId(item.servizio, servizi),
      }));

    if (appointmentsToBackfill.length === 0 && requestsToBackfill.length === 0) {
      salonCapacityBackfillSignatureRef.current = '';
      return;
    }

    const nextSignature = JSON.stringify({
      appointments: appointmentsToBackfill,
      requests: requestsToBackfill,
      workspaceId: salonWorkspace.id,
    });

    if (salonCapacityBackfillSignatureRef.current === nextSignature) {
      return;
    }

    salonCapacityBackfillSignatureRef.current = nextSignature;

    void (async () => {
      try {
        const appointmentResults = await Promise.all(
          appointmentsToBackfill.map(async (item) => {
            const { error } = await supabase
              .from('appointments')
              .update({
                operator_id: item.operatorId,
                operator_name: null,
              })
              .eq('id', item.id)
              .eq('workspace_id', salonWorkspace.id);

            if (error) {
              console.log('Errore backfill corsia salone appuntamento:', error);
            }

            return { id: item.id, ok: !error, operatorId: item.operatorId };
          })
        );

        const requestResults = await Promise.all(
          requestsToBackfill.map(async (item) => {
            const { error } = await supabase
              .from('booking_requests')
              .update({
                requested_operator_id: item.operatorId,
                requested_operator_name: null,
              })
              .eq('id', item.id)
              .eq('workspace_id', salonWorkspace.id);

            if (error) {
              console.log('Errore backfill corsia salone richiesta:', error);
            }

            return { id: item.id, ok: !error, operatorId: item.operatorId };
          })
        );

        const successfulAppointmentMap = new Map(
          appointmentResults
            .filter((item) => item.ok)
            .map((item) => [item.id, item.operatorId] as const)
        );
        const successfulRequestMap = new Map(
          requestResults
            .filter((item) => item.ok)
            .map((item) => [item.id, item.operatorId] as const)
        );

        if (successfulAppointmentMap.size > 0) {
          setAppuntamenti((current) =>
            normalizeAppuntamenti(
              current.map((item) =>
                successfulAppointmentMap.has(item.id)
                  ? {
                      ...item,
                      operatoreId: successfulAppointmentMap.get(item.id) ?? '',
                      operatoreNome: '',
                    }
                  : item
              )
            )
          );
        }

        if (successfulRequestMap.size > 0) {
          setRichiestePrenotazione((current) =>
            normalizeRichiestePrenotazione(
              current.map((item) =>
                successfulRequestMap.has(item.id)
                  ? {
                      ...item,
                      operatoreId: successfulRequestMap.get(item.id) ?? '',
                      operatoreNome: '',
                    }
                  : item
              )
            )
          );
        }

        if (
          successfulAppointmentMap.size !== appointmentsToBackfill.length ||
          successfulRequestMap.size !== requestsToBackfill.length
        ) {
          salonCapacityBackfillSignatureRef.current = '';
        }
      } catch (error) {
        salonCapacityBackfillSignatureRef.current = '';
        console.log('Errore backfill corsia salone servizi senza operatore:', error);
      }
    })();
  }, [
    appuntamenti,
    isAuthenticated,
    isLoaded,
    richiestePrenotazione,
    salonWorkspace.id,
    servizi,
  ]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
      JSON.stringify({
        ...salonWorkspace,
        ownerEmail: salonAccountEmail,
        salonCode:
          normalizeSalonCode(salonWorkspace.salonCode) ||
          buildSalonCode(salonWorkspace.salonName, salonAccountEmail),
        updatedAt: new Date().toISOString(),
      })
    );
  }, [salonWorkspace, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail),
      JSON.stringify(clienti)
    );
  }, [clienti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.appuntamenti, salonAccountEmail),
      JSON.stringify(appuntamenti)
    );
  }, [appuntamenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.movimenti, salonAccountEmail),
      JSON.stringify(movimenti)
    );
  }, [movimenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.servizi, salonAccountEmail),
      JSON.stringify(servizi)
    );
  }, [servizi, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.operatori, salonAccountEmail),
      JSON.stringify(operatori)
    );
  }, [operatori, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.macchinari, salonAccountEmail),
      JSON.stringify(macchinari)
    );
  }, [isLoaded, macchinari, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.carte, salonAccountEmail),
      JSON.stringify(carteCollegate)
    );
  }, [carteCollegate, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi, salonAccountEmail),
      JSON.stringify(eventi)
    );
  }, [eventi, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, salonAccountEmail),
      JSON.stringify(richiestePrenotazione)
    );
  }, [richiestePrenotazione, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail),
      JSON.stringify(availabilitySettings)
    );
  }, [availabilitySettings, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.getItem(
      buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, salonAccountEmail)
    ).then((stored) => {
      setBiometricEnabled(stored === 'true');
    }).catch(() => undefined);
  }, [isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, salonAccountEmail),
      hasCompletedOnboarding ? 'true' : 'false'
    );
  }, [hasCompletedOnboarding, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi_template, salonAccountEmail),
      messaggioEventoTemplate
    );
  }, [messaggioEventoTemplate, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.service_card_color_overrides, salonAccountEmail),
      JSON.stringify(serviceCardColorOverrides)
    );
  }, [serviceCardColorOverrides, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.role_card_color_overrides, salonAccountEmail),
      JSON.stringify(normalizeRoleColorOverrideMap(roleCardColorOverrides))
    );
  }, [roleCardColorOverrides, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded) return;

    const normalizedOverrides = normalizeRoleColorOverrideMap(roleCardColorOverrides);

    if (JSON.stringify(normalizedOverrides) === JSON.stringify(roleCardColorOverrides)) {
      return;
    }

    setRoleCardColorOverrides(normalizedOverrides);
  }, [isLoaded, roleCardColorOverrides]);

  useEffect(() => {
    if (!isLoaded) return;

    const normalizedOverrides = normalizeServiceColorOverrideMap(
      serviceCardColorOverrides,
      servizi
    );

    if (JSON.stringify(normalizedOverrides) === JSON.stringify(serviceCardColorOverrides)) {
      return;
    }

    setServiceCardColorOverrides(normalizedOverrides);
  }, [isLoaded, serviceCardColorOverrides, servizi]);

  const updateSalonWorkspacePersisted = React.useCallback(
    async (updater: SalonWorkspace | ((current: SalonWorkspace) => SalonWorkspace)) => {
      const mutationTimestamp = Date.now();
      const mutationUpdatedAt = new Date(mutationTimestamp).toISOString();
      let nextWorkspaceSnapshot: SalonWorkspace | null = null;

      setSalonWorkspace((current) => {
        const resolved = typeof updater === 'function'
          ? (updater as (current: SalonWorkspace) => SalonWorkspace)(current)
          : updater;
        const normalized = normalizeWorkspace(
          {
            ...resolved,
            ownerEmail: salonAccountEmail || resolved.ownerEmail,
            updatedAt: mutationUpdatedAt,
          },
          salonAccountEmail || resolved.ownerEmail
        );
        lastLocalWorkspaceMutationAtRef.current = mutationTimestamp;
        latestSalonWorkspaceRef.current = normalized;
        pendingWorkspaceSyncRef.current = {
          signature: buildWorkspaceSyncSignature(normalized),
          at: mutationTimestamp,
        };
        nextWorkspaceSnapshot = normalized;
        return normalized;
      });

      if (!isLoaded || !salonAccountEmail || !nextWorkspaceSnapshot) return;

      try {
        await AsyncStorage.setItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
          JSON.stringify(nextWorkspaceSnapshot)
        );
      } catch (error) {
        console.log('Errore persistenza workspace immediata:', error);
      }

      if (!nextWorkspaceSnapshot) return;
      const workspaceSnapshot: SalonWorkspace = nextWorkspaceSnapshot;

      try {
        const workspaceId = await enqueuePortalPublish({
          workspace: workspaceSnapshot,
          clienti: filterRecentlyDeletedCustomers(clienti),
          appuntamenti,
          servizi,
          operatori,
          richiestePrenotazione,
          availabilitySettings,
          serviceCardColorOverrides,
          roleCardColorOverrides,
        });

        if (workspaceId && workspaceSnapshot.id !== workspaceId) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
          await AsyncStorage.setItem(
            buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
            JSON.stringify({ ...workspaceSnapshot, id: workspaceId })
          );
        }
      } catch (error) {
        console.log('Errore pubblicazione workspace aggiornata:', error);
      }
    },
    [
      appuntamenti,
      availabilitySettings,
      clienti,
      enqueuePortalPublish,
      filterRecentlyDeletedCustomers,
      isLoaded,
      operatori,
      richiestePrenotazione,
      roleCardColorOverrides,
      salonAccountEmail,
      serviceCardColorOverrides,
      servizi,
    ]
  );

  const updateAvailabilitySettingsPersisted = React.useCallback(
    async (
      updater:
        | AvailabilitySettings
        | ((current: AvailabilitySettings) => AvailabilitySettings)
    ) => {
      const mutationTimestamp = Date.now();
      const mutationUpdatedAt = new Date(mutationTimestamp).toISOString();
      let nextAvailabilitySnapshot: AvailabilitySettings | null = null;
      lastLocalAvailabilityMutationAtRef.current = mutationTimestamp;

      setAvailabilitySettings((current) => {
        const resolved =
          typeof updater === 'function'
            ? (updater as (current: AvailabilitySettings) => AvailabilitySettings)(current)
            : updater;
        const normalized = normalizeAvailabilitySettings(resolved);
        latestAvailabilitySettingsRef.current = normalized;
        pendingAvailabilitySyncRef.current = {
          signature: buildAvailabilitySettingsSyncSignature(normalized),
          at: mutationTimestamp,
        };
        nextAvailabilitySnapshot = normalized;
        return normalized;
      });

      if (!isLoaded || !salonAccountEmail || !nextAvailabilitySnapshot) return;
      const availabilitySnapshot: AvailabilitySettings = nextAvailabilitySnapshot;
      const workspaceSnapshot = normalizeWorkspace(
        {
          ...latestSalonWorkspaceRef.current,
          ownerEmail:
            salonAccountEmail || latestSalonWorkspaceRef.current.ownerEmail,
          updatedAt: mutationUpdatedAt,
        },
        salonAccountEmail || latestSalonWorkspaceRef.current.ownerEmail
      );

      latestSalonWorkspaceRef.current = workspaceSnapshot;
      setSalonWorkspace((current) =>
        current.updatedAt === workspaceSnapshot.updatedAt &&
        current.id === workspaceSnapshot.id
          ? current
          : workspaceSnapshot
      );

      try {
        await AsyncStorage.setItem(
          buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail),
          JSON.stringify(availabilitySnapshot)
        );
      } catch (error) {
        console.log('Errore persistenza availability immediata:', error);
      }

      try {
        await AsyncStorage.setItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
          JSON.stringify(workspaceSnapshot)
        );
      } catch (error) {
        console.log('Errore persistenza workspace con availability aggiornata:', error);
      }

      try {
        const normalizedSalonCode = normalizeSalonCode(
          workspaceSnapshot.salonCode || latestSalonWorkspaceRef.current.salonCode
        );

        if (normalizedSalonCode) {
          try {
            const updatedAvailabilitySnapshot = await runWithDeadlockRetry(
              () =>
                updateClientPortalAvailabilitySettings({
                  ownerEmail: salonAccountEmail,
                  salonCode: normalizedSalonCode,
                  availabilitySettings: availabilitySnapshot,
                }),
              'Aggiornamento availability portale cliente'
            );

            if (updatedAvailabilitySnapshot?.availabilitySettings) {
              applyRemoteAvailabilitySettings(updatedAvailabilitySnapshot.availabilitySettings);
            }
          } catch (error) {
            console.log('Errore aggiornamento availability dedicata:', error);
          }
        }

        const workspaceId = await enqueuePortalPublish({
          workspace: workspaceSnapshot,
          clienti: filterRecentlyDeletedCustomers(clienti),
          appuntamenti,
          servizi,
          operatori,
          richiestePrenotazione,
          availabilitySettings: availabilitySnapshot,
          serviceCardColorOverrides,
          roleCardColorOverrides,
        });

        if (workspaceId && workspaceSnapshot.id !== workspaceId) {
          setSalonWorkspace((current) => {
            const nextWorkspace = { ...current, id: workspaceId };
            latestSalonWorkspaceRef.current = nextWorkspace;
            return nextWorkspace;
          });
        }
      } catch (error) {
        console.log('Errore pubblicazione availability aggiornata:', error);
      }
    },
    [
      applyRemoteAvailabilitySettings,
      appuntamenti,
      clienti,
      enqueuePortalPublish,
      filterRecentlyDeletedCustomers,
      isLoaded,
      operatori,
      richiestePrenotazione,
      roleCardColorOverrides,
      runWithDeadlockRetry,
      salonAccountEmail,
      salonWorkspace,
      serviceCardColorOverrides,
      updateClientPortalAvailabilitySettings,
      servizi,
    ]
  );

  const updateGuidedSlotsSettingsPersisted = React.useCallback(
    async (
      updater:
        | AvailabilitySettings
        | ((current: AvailabilitySettings) => AvailabilitySettings)
    ) => {
      const mutationTimestamp = Date.now();
      const mutationUpdatedAt = new Date(mutationTimestamp).toISOString();
      lastLocalAvailabilityMutationAtRef.current = mutationTimestamp;
      const currentAvailabilitySnapshot = latestAvailabilitySettingsRef.current;
      const resolved =
        typeof updater === 'function'
          ? (updater as (current: AvailabilitySettings) => AvailabilitySettings)(
              currentAvailabilitySnapshot
            )
          : updater;
      const guidedSlotsUpdatedAt = buildNextMonotonicIsoTimestamp(
        latestGuidedSlotsUpdatedAtRef.current,
        resolved.guidedSlotsUpdatedAt ?? mutationUpdatedAt
      );
      const availabilitySnapshot = normalizeAvailabilitySettings({
        ...resolved,
        guidedSlotsUpdatedAt,
      });

      latestAvailabilitySettingsRef.current = availabilitySnapshot;
      latestGuidedSlotsUpdatedAtRef.current = guidedSlotsUpdatedAt;
      await updateAvailabilitySettingsPersisted(availabilitySnapshot);
    },
    [
      updateAvailabilitySettingsPersisted,
    ]
  );

  const switchSalonAccount = async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.account_attivo, normalizedEmail);

    if (normalizedEmail === salonAccountEmail) {
      setIsLoaded(true);
      return true;
    }

    setIsLoaded(false);
    clearRuntimeDataForAccount(normalizedEmail);
    setSalonAccountEmail(normalizedEmail);
    return true;
  };

  const loadOwnerAccounts = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.owner_accounts);
      const parsed = raw ? (JSON.parse(raw) as OwnerAccount[]) : [];
      const sanitizedAccounts = parsed.map((item) => ({
        ...item,
        email: normalizeAccountEmail(item.email),
        password: undefined,
      }));

      const needsMigration = parsed.some((item) => typeof item.password === 'string' && item.password.trim());

      if (needsMigration) {
        for (const item of parsed) {
          const normalizedEmail = normalizeAccountEmail(item.email);
          const legacyPassword = item.password?.trim() ?? '';
          if (!normalizedEmail || !legacyPassword) {
            continue;
          }

          await setSensitiveValue(
            secureOwnerPasswordKey(normalizedEmail),
            legacyPassword,
            legacyOwnerPasswordKey(normalizedEmail)
          );
        }

        await AsyncStorage.setItem(STORAGE_KEYS.owner_accounts, JSON.stringify(sanitizedAccounts));
      }

      return sanitizedAccounts;
    } catch (error) {
      console.log('Errore caricamento account proprietari:', error);
      return [] as OwnerAccount[];
    }
  };

  const saveOwnerAccounts = async (accounts: OwnerAccount[]) => {
    const sanitizedAccounts = accounts.map(({ password: _password, ...account }) => ({
      ...account,
      email: normalizeAccountEmail(account.email),
    }));

    await AsyncStorage.setItem(STORAGE_KEYS.owner_accounts, JSON.stringify(sanitizedAccounts));
  };

  const getOwnerPassword = async (email: string) =>
    getSensitiveValue(secureOwnerPasswordKey(email), legacyOwnerPasswordKey(email));

  const setOwnerPassword = async (email: string, password: string) =>
    setSensitiveValue(secureOwnerPasswordKey(email), password, legacyOwnerPasswordKey(email));

  const deleteOwnerPassword = async (email: string) =>
    deleteSensitiveValue(secureOwnerPasswordKey(email), legacyOwnerPasswordKey(email));

  const getBiometricPassword = async (email: string) =>
    getSensitiveValue(
      secureBiometricPasswordKey(email),
      buildScopedStorageKey(STORAGE_KEYS.biometric_login_password, email)
    );

  const setBiometricPassword = async (email: string, password: string) =>
    setSensitiveValue(
      secureBiometricPasswordKey(email),
      password,
      buildScopedStorageKey(STORAGE_KEYS.biometric_login_password, email)
    );

  const deleteBiometricPassword = async (email: string) =>
    deleteSensitiveValue(
      secureBiometricPasswordKey(email),
      buildScopedStorageKey(STORAGE_KEYS.biometric_login_password, email)
    );

  const loadStoredWorkspaceForOwner = async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    try {
      const raw = await AsyncStorage.getItem(
        buildScopedStorageKey(STORAGE_KEYS.workspace, normalizedEmail)
      );
      if (!raw) {
        return null;
      }

      return normalizeWorkspace(JSON.parse(raw), normalizedEmail);
    } catch (error) {
      console.log('Errore caricamento workspace proprietario salvato:', error);
      return null;
    }
  };

  const ensureOwnerBackendBootstrap = async (
    email: string,
    providedAccounts?: OwnerAccount[]
  ) => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
      return { ok: false as const, error: 'owner_email_required' };
    }

    const { data: sessionResult } = await supabase.auth.getSession();
    if (!sessionResult.session?.user?.id) {
      return { ok: false as const, error: 'auth_required' };
    }

    const accounts = providedAccounts ?? (await loadOwnerAccounts());
    const localAccount =
      accounts.find((item) => normalizeAccountEmail(item.email) === normalizedEmail) ?? null;
    const storedWorkspace = await loadStoredWorkspaceForOwner(normalizedEmail);
    let remoteWorkspaceFallback: RemoteWorkspaceRow | null = null;

    if (!storedWorkspace?.salonName?.trim()) {
      try {
        const { data, error } = await supabase
          .from('workspaces')
          .select(
            'id, slug, salon_name, owner_email, customer_reminder_hours_before, subscription_plan, subscription_status, created_at, updated_at'
          )
          .eq('owner_email', normalizedEmail)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        remoteWorkspaceFallback = (data ?? null) as RemoteWorkspaceRow | null;
      } catch (error) {
        console.log('Errore recupero workspace remoto per bootstrap owner:', error);
      }
    }

    const salonName =
      localAccount?.salonName.trim() ||
      remoteWorkspaceFallback?.salon_name?.trim() ||
      storedWorkspace?.salonName.trim() ||
      resolveSalonDisplayName({
        salonName: remoteWorkspaceFallback?.salon_name ?? storedWorkspace?.salonName,
        activityCategory: storedWorkspace?.activityCategory,
        salonCode: remoteWorkspaceFallback?.slug ?? storedWorkspace?.salonCode,
        ownerEmail: normalizedEmail,
      }).trim();

    if (!salonName) {
      return { ok: false as const, error: 'salon_name_required' };
    }

    const firstName =
      localAccount?.firstName.trim() ||
      normalizeIdentityText(normalizedEmail.split('@')[0]).replace(/\b\w/g, (char) => char.toUpperCase()) ||
      'Titolare';
    const lastName = localAccount?.lastName.trim() || 'Salon';
    const businessPhone =
      localAccount?.businessPhone.trim() ||
      storedWorkspace?.businessPhone.trim() ||
      null;
    const ownerPhone = businessPhone;
    const salonCode = normalizeSalonCode(
      remoteWorkspaceFallback?.slug ||
      storedWorkspace?.salonCode ||
      buildSalonCode(salonName, normalizedEmail)
    );

    const { error } = await supabase.rpc('bootstrap_owner_account', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_salon_name: salonName,
      p_business_phone: businessPhone,
      p_owner_phone: ownerPhone,
      p_owner_email: normalizedEmail,
      p_salon_code: salonCode,
    });

    if (error) {
      console.log('Errore bootstrap backend owner:', error);
      return {
        ok: false as const,
        error:
          error.message?.trim() || 'Account collegato ma workspace backend non allineato.',
      };
    }

    return { ok: true as const };
  };

  const ensureRealtimeOwnerSession = async () => {
    try {
      const { data: currentSessionResult } = await supabase.auth.getSession();
      if (currentSessionResult.session?.user?.id) {
        return { ok: true as const, email: normalizeAccountEmail(currentSessionResult.session.user.email) };
      }

      const [savedOwnerSession, savedActiveAccount, accounts] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.owner_session),
        AsyncStorage.getItem(STORAGE_KEYS.account_attivo),
        loadOwnerAccounts(),
      ]);

      const candidateEmail =
        normalizeAccountEmail(salonAccountEmail) ||
        normalizeAccountEmail(savedOwnerSession) ||
        normalizeAccountEmail(savedActiveAccount);

      if (!candidateEmail) {
        return { ok: false as const, error: 'auth_required' };
      }

      const [storedOwnerPassword, savedPassword] = await Promise.all([
        getOwnerPassword(candidateEmail),
        getBiometricPassword(candidateEmail),
      ]);
      const candidatePassword = storedOwnerPassword?.trim() || savedPassword?.trim() || '';

      if (!candidatePassword) {
        return { ok: false as const, error: 'auth_required' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: candidateEmail,
        password: candidatePassword,
      });

      if (error || !data.session?.user?.id) {
        console.log('Ripristino sessione owner non riuscito:', error);
        return { ok: false as const, error: 'auth_required' };
      }

      const authenticatedEmail = normalizeAccountEmail(
        data.user?.email ?? data.session.user.email ?? candidateEmail
      );

      const bootstrapResult = await ensureOwnerBackendBootstrap(authenticatedEmail, accounts);
      if (!bootstrapResult.ok) {
        return { ok: false as const, error: bootstrapResult.error };
      }

      await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
      await switchSalonAccount(authenticatedEmail);
      await syncAuthenticatedWorkspace(authenticatedEmail);
      setPendingBiometricUnlock(false);
      setIsAuthenticated(true);

      return { ok: true as const, email: authenticatedEmail };
    } catch (error) {
      console.log('Errore ripristino sessione owner:', error);
      return { ok: false as const, error: 'auth_required' };
    }
  };

  // Rileva hardware biometrico al mount dell'app
  useEffect(() => {
    (async () => {
      try {
        const localAuthentication = resolveLocalAuthenticationModule();
        if (!localAuthentication) {
          setBiometricAvailable(false);
          setBiometricType('none');
          return;
        }

        const hasHardware = await localAuthentication.hasHardwareAsync();
        const isEnrolled = await localAuthentication.isEnrolledAsync();
        const available = hasHardware && isEnrolled;
        setBiometricAvailable(available);
        if (available) {
          const types = await localAuthentication.supportedAuthenticationTypesAsync();
          const hasFace = types.includes(localAuthentication.AuthenticationType.FACIAL_RECOGNITION);
          setBiometricType(hasFace ? 'faceid' : 'fingerprint');
        } else {
          setBiometricType('none');
        }
      } catch {
        setBiometricAvailable(false);
        setBiometricType('none');
      }
    })();
  }, []);

  const toggleBiometricEnabled = async (enabled: boolean) => {
    setBiometricEnabled(enabled);
    if (!salonAccountEmail) return;
    try {
      const scopedEnabledKey = buildScopedStorageKey(
        STORAGE_KEYS.biometric_enabled,
        salonAccountEmail
      );
      await AsyncStorage.setItem(scopedEnabledKey, enabled ? 'true' : 'false');

      if (!enabled) {
        const savedBiometricEmail = normalizeAccountEmail(
          await AsyncStorage.getItem(STORAGE_KEYS.biometric_login_email)
        );
        await deleteBiometricPassword(salonAccountEmail);
        if (savedBiometricEmail === normalizeAccountEmail(salonAccountEmail)) {
          await AsyncStorage.removeItem(STORAGE_KEYS.biometric_login_email);
        }
      }
    } catch {
      // non bloccante
    }
  };

  const authenticateBiometricIdentity = async () => {
    if (!biometricAvailable) {
      return {
        ok: false,
        error: 'Face ID/impronta non configurati su questo dispositivo.',
      };
    }

    try {
      const localAuthentication = resolveLocalAuthenticationModule();
      if (!localAuthentication) {
        return {
          ok: false,
          error: 'Face ID/impronta non disponibili su questo dispositivo.',
        };
      }

      const authResult = await localAuthentication.authenticateAsync({
        promptMessage: 'Conferma la tua identità',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (authResult.success) {
        return { ok: true };
      }

      const errorCode = (authResult as { error?: string }).error;

      // Errori che il sistema già mostra nativamente → nessun Alert aggiuntivo
      if (
        errorCode === 'user_cancel' ||
        errorCode === 'system_cancel' ||
        errorCode === 'app_cancel' ||
        errorCode === 'authentication_failed'
      ) {
        return { ok: false };
      }

      if (errorCode === 'lockout' || errorCode === 'lockout_permanent') {
        return {
          ok: false,
          error:
            'Troppi tentativi falliti. Usa il codice del dispositivo o accedi con email e password.',
        };
      }

      return { ok: false };
    } catch {
      return { ok: false };
    }
  };

  const storeBiometricCredentials = React.useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = normalizeAccountEmail(email);
      const normalizedPassword = password.trim();

      if (!normalizedEmail || !normalizedPassword) {
        return;
      }

      try {
        await AsyncStorage.setItem(STORAGE_KEYS.biometric_login_email, normalizedEmail);
        await setBiometricPassword(normalizedEmail, normalizedPassword);
      } catch (error) {
        console.log('Errore salvataggio credenziali biometriche:', error);
      }
    },
    []
  );

  const clearBiometricCredentials = React.useCallback(
    async (email?: string | null) => {
      const normalizedEmail = normalizeAccountEmail(email);

      try {
        const savedBiometricEmail = normalizeAccountEmail(
          await AsyncStorage.getItem(STORAGE_KEYS.biometric_login_email)
        );

        if (normalizedEmail) {
          const scopedEnabledKey = buildScopedStorageKey(
            STORAGE_KEYS.biometric_enabled,
            normalizedEmail
          );
          await AsyncStorage.setItem(scopedEnabledKey, 'false');
          await deleteBiometricPassword(normalizedEmail);

          if (savedBiometricEmail === normalizedEmail) {
            await AsyncStorage.removeItem(STORAGE_KEYS.biometric_login_email);
          }
        } else if (savedBiometricEmail) {
          const scopedEnabledKey = buildScopedStorageKey(
            STORAGE_KEYS.biometric_enabled,
            savedBiometricEmail
          );
          await AsyncStorage.setItem(scopedEnabledKey, 'false');
          await deleteBiometricPassword(savedBiometricEmail);
          await AsyncStorage.removeItem(STORAGE_KEYS.biometric_login_email);
        }
      } catch (error) {
        console.log('Errore pulizia credenziali biometriche:', error);
      }
    },
    []
  );

  const connectLocalOwnerAccountToBackend = async (
    account: OwnerAccount,
    preferredEmail?: string,
    explicitPassword?: string
  ) => {
    const normalizedEmail = normalizeAccountEmail(preferredEmail ?? account.email);
    const normalizedPassword = (explicitPassword?.trim() || (await getOwnerPassword(normalizedEmail))?.trim() || '');

    if (!normalizedEmail || !normalizedPassword) {
      return { ok: false as const, error: 'owner_credentials_required' };
    }

    let authenticatedEmail = normalizedEmail;

    try {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      let resolvedSession = loginData.session ?? null;
      let resolvedUser = loginData.user ?? null;

      if (loginError || !loginData.session) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: {
            emailRedirectTo: buildOwnerAuthRedirectUrl('signup'),
          },
        });

        if (signUpError) {
          if (
            isSupabaseAlreadyRegisteredError(signUpError.message) ||
            isSupabaseAuthRateLimitError(signUpError.message)
          ) {
            const { data: retryLoginData, error: retryLoginError } =
              await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password: normalizedPassword,
              });

            if (!retryLoginError && retryLoginData.session) {
              resolvedSession = retryLoginData.session;
              resolvedUser = retryLoginData.user ?? retryLoginData.session.user;
            } else {
              return {
                ok: false as const,
                error:
                  isSupabaseAlreadyRegisteredError(signUpError.message)
                    ? 'Questo account esiste gia nel backend, ma la password non coincide. Rientra con la password corretta oppure reimpostala.'
                    : formatOwnerAuthError(
                        signUpError.message,
                        'Collegamento backend non riuscito. Riprova tra poco.'
                      ),
              };
            }
          } else {
            return {
              ok: false as const,
              error: formatOwnerAuthError(
                signUpError.message,
                'Non sono riuscito a collegare questo account proprietario al backend.'
              ),
            };
          }
        }

        if (!resolvedSession && signUpData.session) {
          resolvedSession = signUpData.session;
          resolvedUser = signUpData.user ?? signUpData.session.user;
        }

        if (!resolvedSession) {
          return {
            ok: false as const,
            error:
              'Account trovato ma sessione backend non attiva. Controlla la mail di conferma e poi accedi.',
          };
        }
      } else {
        authenticatedEmail = normalizeAccountEmail(
          loginData.user?.email ?? loginData.session.user.email ?? normalizedEmail
        );
      }

      if (resolvedSession) {
        authenticatedEmail = normalizeAccountEmail(
          resolvedUser?.email ?? resolvedSession.user.email ?? normalizedEmail
        );
      }

      const { error: bootstrapError } = await supabase.rpc('bootstrap_owner_account', {
        p_first_name: account.firstName.trim(),
        p_last_name: account.lastName.trim(),
        p_salon_name: account.salonName.trim(),
        p_business_phone: account.businessPhone.trim(),
        p_owner_phone: account.businessPhone.trim(),
        p_owner_email: authenticatedEmail,
        p_salon_code: buildSalonCode(account.salonName.trim(), authenticatedEmail),
      });

      if (bootstrapError) {
        return {
          ok: false as const,
          error:
            bootstrapError.message?.trim() ||
            'Account locale trovato ma collegamento backend non riuscito.',
        };
      }

      return { ok: true as const, email: authenticatedEmail };
    } catch (error) {
      console.log('Errore collegamento account locale al backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a collegare questo account proprietario al backend.',
      };
    }
  };

  const loginOwnerAccount = async (email: string, password: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      return { ok: false, error: 'Inserisci email e password.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (!error && data.session) {
        const accounts = await loadOwnerAccounts();
        const authenticatedEmail = normalizeAccountEmail(
          data.user?.email ?? data.session.user.email ?? normalizedEmail
        );

        const bootstrapResult = await ensureOwnerBackendBootstrap(authenticatedEmail, accounts);
        if (!bootstrapResult.ok) {
          return { ok: false, error: bootstrapResult.error };
        }

        await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
        await switchSalonAccount(authenticatedEmail);
        await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
        setPendingBiometricUnlock(false);
        setIsAuthenticated(true);
        void syncAuthenticatedWorkspace(authenticatedEmail);
        return { ok: true };
      }

      if (error) {
        if (isSupabaseEmailNotConfirmedError(error.message)) {
          return {
            ok: false,
            error:
              'Mail non ancora confermata. Apri il link ricevuto via email oppure usa Recupera password.',
          };
        }

        if (isSupabaseAuthRateLimitError(error.message)) {
          return {
            ok: false,
            error:
              'Troppi tentativi in poco tempo. Attendi qualche minuto e poi riprova.',
          };
        }
      }
    } catch (error) {
      console.log('Errore login Supabase:', error);
    }

    const accounts = await loadOwnerAccounts();
    const account =
      (await Promise.all(
        accounts.map(async (item) => ({
          item,
          password: normalizeAccountEmail(item.email) === normalizedEmail ? await getOwnerPassword(item.email) : null,
        }))
      )).find(
        ({ item, password: storedPassword }) =>
          item.email === normalizedEmail && (storedPassword?.trim() ?? '') === normalizedPassword
      )?.item ?? null;

    if (account) {
      const backendConnectionResult = await connectLocalOwnerAccountToBackend(account, normalizedEmail);
      if (!backendConnectionResult.ok) {
        console.log('Accesso owner bloccato senza backend valido:', backendConnectionResult.error);
        return {
          ok: false,
          error:
            backendConnectionResult.error ||
            'Sessione backend non disponibile. Rientra online e riprova.',
        };
      }

      const authenticatedEmail = normalizeAccountEmail(
        backendConnectionResult.email ?? normalizedEmail
      );

      await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
      await switchSalonAccount(authenticatedEmail);
      await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
      setPendingBiometricUnlock(false);
      setIsAuthenticated(true);
      void syncAuthenticatedWorkspace(authenticatedEmail);
      return { ok: true };
    }

    if (!account) {
      return { ok: false, error: 'Email o password non corretti.' };
    }

    return {
      ok: false,
      error:
        'Questo account e solo locale. Devi collegarlo al backend accedendo con un account proprietario Supabase valido.',
    };
  };

  const unlockOwnerAccountWithBiometric = async () => {
    // Step 1: verifica biometrica OS (Face ID / impronta)
    const biometricAuth = await authenticateBiometricIdentity();
    if (!biometricAuth.ok) {
      return biometricAuth;
    }

    // Step 2: auto-login con credenziali salvate
    const { data: sessionResult } = await supabase.auth.getSession();
    const sessionEmail = normalizeAccountEmail(sessionResult.session?.user.email);

    const [savedOwnerSession, savedActiveAccount, savedBiometricEmail] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.owner_session),
      AsyncStorage.getItem(STORAGE_KEYS.account_attivo),
      AsyncStorage.getItem(STORAGE_KEYS.biometric_login_email),
    ]);

    const normalizedEmail =
      sessionEmail ||
      normalizeAccountEmail(salonAccountEmail) ||
      normalizeAccountEmail(savedOwnerSession) ||
      normalizeAccountEmail(savedActiveAccount) ||
      normalizeAccountEmail(savedBiometricEmail);

    if (!normalizedEmail) {
      return { ok: false, error: 'Non ho trovato un account biometrico salvato su questo dispositivo.' };
    }

    if (sessionEmail && sessionEmail === normalizedEmail) {
      await AsyncStorage.setItem(STORAGE_KEYS.owner_session, normalizedEmail);
      await switchSalonAccount(normalizedEmail);
      setPendingBiometricUnlock(true);
      setIsAuthenticated(true);
      void syncAuthenticatedWorkspace(normalizedEmail);
      return { ok: true };
    }

    const savedPassword = await getBiometricPassword(normalizedEmail);

    if (!savedPassword?.trim()) {
      return {
        ok: false,
        error:
          'Per usare Face ID serve almeno un login completo già salvato su questo dispositivo.',
      };
    }

    const result = await loginOwnerAccount(normalizedEmail, savedPassword);
    if (!result.ok) {
      const normalizedError = (result.error ?? '').trim().toLowerCase();
      const shouldResetBiometricCredentials =
        normalizedError.includes('password non coincide') ||
        normalizedError.includes('email o password non corretti') ||
        normalizedError.includes('owner_credentials_required');

      if (shouldResetBiometricCredentials) {
        await clearBiometricCredentials(normalizedEmail);
        return {
          ok: false,
          error:
            'Le credenziali biometriche salvate non sono piu valide. Accedi una volta con mail e password corretta per riattivare Face ID.',
        };
      }

      return result;
    }

    setPendingBiometricUnlock(true);
    return { ok: true };
  };

  const consumePendingBiometricUnlock = React.useCallback(() => {
    if (!pendingBiometricUnlockRef.current) {
      return false;
    }

    pendingBiometricUnlockRef.current = false;
    setPendingBiometricUnlock(false);
    return true;
  }, []);

  const registerOwnerAccount = async ({
    firstName,
    lastName,
    salonName,
    businessPhone,
    streetLine,
    city,
    postalCode,
    activityCategory,
    email,
    password,
  }: {
    firstName: string;
    lastName: string;
    salonName: string;
    businessPhone: string;
    streetLine: string;
    city: string;
    postalCode: string;
    activityCategory: string;
    email: string;
    password: string;
  }) => {
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedPassword = password.trim();
    const normalizedActivityCategory = activityCategory.trim().toUpperCase();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !salonName.trim() ||
      !businessPhone.trim() ||
      !streetLine.trim() ||
      !city.trim() ||
      !postalCode.trim() ||
      !normalizedActivityCategory ||
      !normalizedEmail ||
      !normalizedPassword
    ) {
      return { ok: false, error: 'Compila tutti i campi obbligatori.' };
    }

    const now = new Date().toISOString();
    const accounts = await loadOwnerAccounts();
    const existingAccount =
      accounts.find((item) => item.email === normalizedEmail) ?? null;

    if (existingAccount) {
      return {
        ok: false,
        error: 'Account mail gia registrato. Inserire una nuova mail.',
      };
    }

    const nextAccount: OwnerAccount = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      salonName: salonName.trim(),
      businessPhone: businessPhone.trim(),
      streetLine: streetLine.trim().toUpperCase(),
      city: city.trim().toUpperCase(),
      postalCode: postalCode.trim(),
      activityCategory: normalizedActivityCategory,
      email: normalizedEmail,
      createdAt: now,
    };

    const formattedAddress = formatSalonAddress({
      streetType: '',
      streetName: streetLine.trim().toUpperCase(),
      streetNumber: '',
      city: city.trim().toUpperCase(),
      postalCode: postalCode.trim(),
      salonAddress: '',
    });

    const nextAccounts = [nextAccount, ...accounts];

    const workspace = normalizeWorkspace(
      {
        salonName: salonName.trim(),
        ownerEmail: normalizedEmail,
        businessPhone: businessPhone.trim(),
        activityCategory: normalizedActivityCategory,
        streetType: '',
        streetName: streetLine.trim().toUpperCase(),
        streetNumber: '',
        city: city.trim().toUpperCase(),
        postalCode: postalCode.trim(),
        salonAddress: formattedAddress,
        salonCode: buildSalonCode(salonName.trim(), normalizedEmail),
        createdAt: now,
        updatedAt: now,
      },
      normalizedEmail
    );

    let authenticatedEmail = normalizedEmail;

    const persistLocalOwnerRegistrationState = async (targetEmail: string) => {
      await saveOwnerAccounts(nextAccounts);
      await setOwnerPassword(targetEmail, normalizedPassword);
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.workspace, targetEmail),
        JSON.stringify(workspace)
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.clienti, targetEmail),
        JSON.stringify(normalizeClienti([]))
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.appuntamenti, targetEmail),
        JSON.stringify(normalizeAppuntamenti([]))
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.movimenti, targetEmail),
        JSON.stringify([])
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.servizi, targetEmail),
        JSON.stringify(normalizeServizi([]))
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.operatori, targetEmail),
        JSON.stringify(normalizeOperatori([]))
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.carte, targetEmail),
        JSON.stringify([])
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.eventi, targetEmail),
        JSON.stringify([])
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, targetEmail),
        JSON.stringify([])
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.availability_settings, targetEmail),
        JSON.stringify(normalizeAvailabilitySettings())
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.eventi_template, targetEmail),
        'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
      );
    };

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: normalizedPassword,
        options: {
          emailRedirectTo: buildOwnerAuthRedirectUrl('signup'),
        },
      });

      let resolvedSession = signUpData.session ?? null;
      let resolvedUser = signUpData.user ?? null;

      if (signUpError) {
        if (isSupabaseAlreadyRegisteredError(signUpError.message)) {
          return {
            ok: false,
            error: 'Account mail gia registrato. Inserire una nuova mail.',
          };
        }

        if (isSupabaseAuthRateLimitError(signUpError.message)) {
          const { data: retryLoginData, error: retryLoginError } =
            await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password: normalizedPassword,
            });

          if (!retryLoginError && retryLoginData.session) {
            resolvedSession = retryLoginData.session;
            resolvedUser = retryLoginData.user ?? retryLoginData.session.user;
          } else {
            return {
              ok: false,
              error: formatOwnerAuthError(
                signUpError.message,
                'Registrazione non riuscita. Riprova tra poco.'
              ),
            };
          }
        } else {
          return {
            ok: false,
            error: formatOwnerAuthError(
              signUpError.message,
              'Registrazione non riuscita.'
            ),
          };
        }
      }

      const authEmail = normalizeAccountEmail(
        resolvedUser?.email ?? resolvedSession?.user.email ?? normalizedEmail
      );
      authenticatedEmail = authEmail || normalizedEmail;

      await persistLocalOwnerRegistrationState(authenticatedEmail);

      if (!resolvedSession) {
        return {
          ok: false,
          error:
            'Registrazione completata ma sessione non attiva. Controlla la mail di conferma e poi accedi.',
        };
      }

      const { error: bootstrapError } = await supabase.rpc('bootstrap_owner_account', {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_salon_name: salonName.trim(),
        p_business_phone: businessPhone.trim(),
        p_owner_phone: businessPhone.trim(),
        p_owner_email: authenticatedEmail,
        p_salon_code: buildSalonCode(salonName.trim(), authenticatedEmail),
      });

      if (bootstrapError) {
        return {
          ok: false,
          error:
            bootstrapError.message?.trim() ||
            'Registrazione completata ma bootstrap backend non riuscito.',
        };
      }
    } catch (error) {
      console.log('Errore registrazione Supabase:', error);
      return {
        ok: false,
        error: 'Registrazione non riuscita. Riprova tra poco.',
      };
    }

    await persistLocalOwnerRegistrationState(authenticatedEmail);
    await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
    await switchSalonAccount(authenticatedEmail);
    pendingRegistrationOnboardingRef.current = true;
    setHasCompletedOnboarding(false);
    setShowOnboarding(true);
    setIsLoaded(true);
    await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
    setPendingBiometricUnlock(false);
    setIsAuthenticated(true);
    return { ok: true, email: authenticatedEmail };
  };

  const requestOwnerPasswordReset = async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);

    if (!normalizedEmail) {
      return { ok: false, error: 'Inserisci una mail valida.' };
    }

    const primaryRedirectUrl = buildOwnerAuthRedirectUrl('recovery');
    const primaryAttempt = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: primaryRedirectUrl,
    });

    if (!primaryAttempt.error) {
      return { ok: true, backendRequired: false };
    }

    console.log('Reset password owner retry con redirect web sicuro:', primaryAttempt.error);

    const fallbackAttempt = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${DEFAULT_PUBLIC_CLIENT_BASE_URL}/${OWNER_PASSWORD_RESET_ROUTE}?recovery=1`,
    });
    if (fallbackAttempt.error) {
      return {
        ok: false,
        error: formatOwnerAuthError(
          fallbackAttempt.error.message || primaryAttempt.error.message,
          'Invio link di recupero non riuscito. Riprova tra poco: il link deve aprire direttamente la pagina web di reset password.'
        ),
      };
    }

    return { ok: true, backendRequired: false };
  };

  const completeOwnerPasswordRecovery = async (nextPassword: string) => {
    const normalizedPassword = nextPassword.trim();
    if (normalizedPassword.length < 6) {
      return {
        ok: false as const,
        error: 'La nuova password deve avere almeno 6 caratteri.',
      };
    }

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const authenticatedEmail =
        normalizeAccountEmail(sessionResult.session?.user?.email) ||
        normalizeAccountEmail(ownerLocalRecoveryEmail);
      const hasBackendRecoverySession = !!sessionResult.session?.user?.id;

      let updateUserError: string | null = null;
      if (hasBackendRecoverySession) {
        const { error } = await supabase.auth.updateUser({ password: normalizedPassword });
        if (error) {
          updateUserError = error.message?.trim() || 'Aggiornamento password non riuscito.';
        }
      }

      if (!hasBackendRecoverySession) {
        return {
          ok: false as const,
          error:
            'Per reimpostare la password apri il link ricevuto via email e riprova da quella schermata.',
        };
      }

      if (authenticatedEmail) {
        const accounts = await loadOwnerAccounts();
        const nextAccounts = accounts.map((item) =>
          normalizeAccountEmail(item.email) === authenticatedEmail
            ? {
                ...item,
              }
            : item
        );

        await saveOwnerAccounts(nextAccounts);
        await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
        await setOwnerPassword(authenticatedEmail, normalizedPassword);
        await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
      } else if (updateUserError) {
        return {
          ok: false as const,
          error: updateUserError,
        };
      }
    } catch (storageError) {
      console.log('Errore riallineamento password proprietario locale:', storageError);
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('Errore chiusura sessione recovery proprietario:', error);
    }

    setOwnerLocalRecoveryEmail('');
    setOwnerPasswordRecoveryActive(false);
    return { ok: true as const };
  };

  const logoutOwnerAccount = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('Errore logout Supabase:', error);
    }

    await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
    setOwnerLocalRecoveryEmail('');
    setPendingBiometricUnlock(false);
    setIsAuthenticated(false);
  };

  const updateClientePersisted = async (
    currentCustomer: {
      id: string;
      nome?: string;
      telefono?: string;
      email?: string;
    },
    updates: {
      nome: string;
      telefono: string;
      email?: string;
      instagram?: string;
      birthday?: string;
    }
  ) => {
    const targetIdentity = {
      id: currentCustomer.id.trim(),
      nome: currentCustomer.nome?.trim() ?? '',
      telefono: currentCustomer.telefono?.trim() ?? '',
      email: currentCustomer.email?.trim().toLowerCase() ?? '',
    };

    if (!targetIdentity.id) {
      return { ok: false as const, error: 'Cliente non valido.' };
    }

    const normalizedUpdates = {
      nome: updates.nome.trim(),
      telefono: updates.telefono.trim(),
      email: updates.email?.trim().toLowerCase() ?? '',
      instagram: updates.instagram?.trim() ?? '',
      birthday: updates.birthday?.trim() ?? '',
    };

    const matchingCurrentCustomers = normalizeClienti(clienti).filter((item) =>
      matchesCustomerIdentity(item, targetIdentity)
    );

    setClienti((current) =>
      current.map((item) =>
        matchesCustomerIdentity(item, targetIdentity)
          ? {
              ...item,
              nome: normalizedUpdates.nome,
              telefono: normalizedUpdates.telefono,
              email: normalizedUpdates.email,
              instagram: normalizedUpdates.instagram,
              birthday: normalizedUpdates.birthday,
            }
          : item
      )
    );

    const backendCustomerIds = Array.from(
      new Set(
        matchingCurrentCustomers
          .map((item) => item.id.trim())
          .filter((item) => isUuid(item))
          .concat(isUuid(targetIdentity.id) ? [targetIdentity.id] : [])
      )
    );

    if (backendCustomerIds.length === 0) {
      return { ok: true as const };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          full_name: normalizedUpdates.nome,
          phone: normalizedUpdates.telefono || null,
          email: normalizedUpdates.email || null,
          instagram: normalizedUpdates.instagram || null,
        })
        .in('id', backendCustomerIds);

      if (error) {
        console.log('Errore aggiornamento cliente backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito ad aggiornare il cliente.',
        };
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore aggiornamento cliente backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito ad aggiornare il cliente.',
      };
    }
  };

  const deleteClientePersisted = async (customer: {
    id: string;
    nome?: string;
    telefono?: string;
    email?: string;
  }) => {
    const normalizedCustomerId = customer.id.trim();
    if (!normalizedCustomerId) {
      return { ok: false as const, error: 'Cliente non valido.' };
    }

    const targetIdentity = {
      id: normalizedCustomerId,
      nome: customer.nome?.trim() ?? '',
      telefono: customer.telefono?.trim() ?? '',
      email: customer.email?.trim().toLowerCase() ?? '',
    };
    const matchingCurrentCustomers = normalizeClienti(clienti).filter((item) =>
      matchesCustomerIdentity(item, targetIdentity)
    );

    matchingCurrentCustomers.forEach((item) => {
      markRecentlyDeletedCustomer(item);
    });
    markRecentlyDeletedCustomer(targetIdentity);

    setClienti((current) =>
      current.filter((item) => !matchesCustomerIdentity(item, targetIdentity))
    );

    const backendCustomerIds = Array.from(
      new Set(
        matchingCurrentCustomers
          .map((item) => item.id.trim())
          .filter((item) => isUuid(item))
          .concat(isUuid(normalizedCustomerId) ? [normalizedCustomerId] : [])
      )
    );

    if (backendCustomerIds.length === 0) {
      return { ok: true as const };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      matchingCurrentCustomers.forEach((item) => {
        unmarkRecentlyDeletedCustomer(item);
      });
      unmarkRecentlyDeletedCustomer(targetIdentity);
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .in('id', backendCustomerIds);

      if (error) {
        console.log('Errore eliminazione cliente backend:', error);
        if (isLikelyNetworkRequestFailure(error)) {
          return { ok: true as const };
        }
        matchingCurrentCustomers.forEach((item) => {
          unmarkRecentlyDeletedCustomer(item);
        });
        unmarkRecentlyDeletedCustomer(targetIdentity);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a eliminare il cliente.',
        };
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore eliminazione cliente backend:', error);
      if (isLikelyNetworkRequestFailure(error)) {
        return { ok: true as const };
      }
      matchingCurrentCustomers.forEach((item) => {
        unmarkRecentlyDeletedCustomer(item);
      });
      unmarkRecentlyDeletedCustomer(targetIdentity);
      return {
        ok: false as const,
        error: 'Non sono riuscito a eliminare il cliente.',
      };
    }
  };

  const resolveSalonByCode = async (code: string) => {
    const normalizedCode = normalizeSalonCode(code);

    if (!normalizedCode) return null;

    try {
      const remoteSnapshot = await fetchPortalSnapshotWithRetry(normalizedCode);

      if (remoteSnapshot) {
        const isCurrentWorkspaceSalon =
          normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);
        const normalizedRemoteRequests = normalizeRichiestePrenotazione(
          remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
        );
        const normalizedRemoteClienti = enrichClientiWithFrontendRequestSignals(
          remoteSnapshot.clienti as Cliente[],
          normalizedRemoteRequests
        );
        const normalizedRemoteAppointments = normalizeAppuntamenti(
          remoteSnapshot.appuntamenti as Appuntamento[]
        );

        const hasFreshLocalAvailabilityMutation =
          Date.now() - lastLocalAvailabilityMutationAtRef.current <
          PORTAL_REMOTE_OVERRIDE_GUARD_MS;

        return {
          workspace: isCurrentWorkspaceSalon
            ? normalizeWorkspace(
                {
                  ...salonWorkspace,
                  ...remoteSnapshot.workspace,
                  cashSectionDisabled:
                    remoteSnapshot.workspace.cashSectionDisabled ?? salonWorkspace.cashSectionDisabled,
                  autoAcceptBookingRequests:
                    remoteSnapshot.workspace.autoAcceptBookingRequests ??
                    salonWorkspace.autoAcceptBookingRequests,
                },
                salonWorkspace.ownerEmail
              )
            : remoteSnapshot.workspace,
          clienti: isCurrentWorkspaceSalon
            ? filterRecentlyDeletedCustomers(normalizedRemoteClienti)
            : normalizedRemoteClienti,
          appuntamenti: isCurrentWorkspaceSalon
            ? filterRecentlyDeletedAppointments(
                normalizeAppuntamenti(
                  mergeAppuntamentiCollections(
                    normalizedRemoteAppointments,
                    appuntamenti,
                    {
                      preserveLocalCompositeKeys: getRecentlyCreatedAppointmentCompositeKeys(),
                      preserveLocalIds: getRecentlyMovedAppointmentIds(),
                    }
                  )
                )
              )
            : normalizedRemoteAppointments,
          servizi: normalizeServizi(remoteSnapshot.servizi as Servizio[]),
          operatori: normalizeOperatori(remoteSnapshot.operatori as Operatore[]),
          richiestePrenotazione: normalizedRemoteRequests,
          availabilitySettings: hasFreshLocalAvailabilityMutation
            ? mergeAvailabilitySettingsWithCriticalTimestamps(
                availabilitySettings,
                remoteSnapshot.availabilitySettings
              )
            : normalizeAvailabilitySettings(remoteSnapshot.availabilitySettings),
          serviceCardColorOverrides: remoteSnapshot.serviceCardColorOverrides ?? {},
          roleCardColorOverrides: remoteSnapshot.roleCardColorOverrides ?? {},
        };
      }

      if (
        isAuthenticated &&
        normalizedCode === normalizeSalonCode(salonWorkspace.salonCode) &&
        salonWorkspace.salonName.trim()
      ) {
        return {
          workspace: salonWorkspace,
          clienti: filterRecentlyDeletedCustomers(clienti),
          appuntamenti,
          servizi,
          operatori,
          richiestePrenotazione,
          availabilitySettings,
          serviceCardColorOverrides,
          roleCardColorOverrides,
        };
      }

      return null;
    } catch (error) {
      console.log('Errore caricamento salone pubblico:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const normalizedSalonCode = normalizeSalonCode(salonWorkspace.salonCode);
    const ownerWorkspaceId = salonWorkspace.id?.trim() ?? '';
    if (!normalizedSalonCode) {
      return;
    }

    let cancelled = false;

    const refreshOwnerFromPortal = async () => {
      const lightweightSettings =
        await fetchPortalAvailabilitySettingsWithRetry(normalizedSalonCode);

      if (cancelled) {
        return;
      }

      if (lightweightSettings) {
        applyRemoteAvailabilitySettings(lightweightSettings.availabilitySettings);
      }

      const remoteSnapshot = await fetchPortalSnapshotWithRetry(normalizedSalonCode);
      if (cancelled) {
        return;
      }

      if (!remoteSnapshot) {
        ownerPortalBootstrapReadyRef.current = true;
        if (!lightweightSettings || cancelled) {
          return;
        }
        return;
      }

      const currentWorkspace = latestSalonWorkspaceRef.current;
      const currentAvailabilitySettings = latestAvailabilitySettingsRef.current;

      const normalizedRemoteAppointments = normalizeAppuntamenti(
        remoteSnapshot.appuntamenti as Appuntamento[]
      );
      const normalizedRemoteRequests = normalizeRichiestePrenotazione(
        remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
      );
      const refreshedWorkspace = mergeWorkspaceWithCriticalTimestamps(
        {
          ...currentWorkspace,
          cashSectionDisabled: currentWorkspace.cashSectionDisabled,
        },
        {
          ...remoteSnapshot.workspace,
          cashSectionDisabled:
            remoteSnapshot.workspace.cashSectionDisabled ?? currentWorkspace.cashSectionDisabled,
        },
        currentWorkspace.ownerEmail
      );
      const remoteWorkspaceUpdatedAtMs = parseIsoTimestampToMs(refreshedWorkspace.updatedAt);
      const localWorkspaceUpdatedAtMs = parseIsoTimestampToMs(currentWorkspace.updatedAt);
      const hasRecentLocalWorkspaceMutation =
        Date.now() - lastLocalWorkspaceMutationAtRef.current < PORTAL_REMOTE_OVERRIDE_GUARD_MS;
      const hasRecentLocalAvailabilityMutation =
        Date.now() - lastLocalAvailabilityMutationAtRef.current < PORTAL_REMOTE_OVERRIDE_GUARD_MS;
      const remoteWorkspaceSignature = buildWorkspaceSyncSignature(refreshedWorkspace);
      const normalizedRemoteAvailabilitySettings = mergeAvailabilitySettingsWithCriticalTimestamps(
        currentAvailabilitySettings,
        lightweightSettings?.availabilitySettings ?? remoteSnapshot.availabilitySettings
      );
      const remoteAvailabilitySignature = buildAvailabilitySettingsSyncSignature(
        normalizedRemoteAvailabilitySettings
      );
      const pendingWorkspaceSync = pendingWorkspaceSyncRef.current;
      const pendingAvailabilitySync = pendingAvailabilitySyncRef.current;
      const pendingWorkspaceStillFresh =
        !!pendingWorkspaceSync &&
        Date.now() - pendingWorkspaceSync.at < PORTAL_REMOTE_OVERRIDE_GUARD_MS * 3;
      const pendingAvailabilityStillFresh =
        !!pendingAvailabilitySync &&
        Date.now() - pendingAvailabilitySync.at < PORTAL_REMOTE_OVERRIDE_GUARD_MS * 3;
      const shouldRespectPendingWorkspace =
        hasRecentLocalWorkspaceMutation && pendingWorkspaceStillFresh;
      const shouldRespectPendingAvailability =
        hasRecentLocalAvailabilityMutation && pendingAvailabilityStillFresh;
      const remoteWorkspaceMatchesPending =
        !!pendingWorkspaceSync && pendingWorkspaceSync.signature === remoteWorkspaceSignature;
      const remoteAvailabilityMatchesPending =
        !!pendingAvailabilitySync &&
        pendingAvailabilitySync.signature === remoteAvailabilitySignature;
      const remoteAutoAcceptTimestampWins =
        parseIsoTimestampToMs(refreshedWorkspace.autoAcceptBookingRequestsUpdatedAt) >
        parseIsoTimestampToMs(currentWorkspace.autoAcceptBookingRequestsUpdatedAt);
      const remoteGuidedTimestampWins =
        parseIsoTimestampToMs(normalizedRemoteAvailabilitySettings.guidedSlotsUpdatedAt) >
        parseIsoTimestampToMs(currentAvailabilitySettings.guidedSlotsUpdatedAt);
      const shouldApplyRemoteWorkspace =
        (!shouldRespectPendingWorkspace ||
          remoteWorkspaceMatchesPending ||
          remoteAutoAcceptTimestampWins) &&
        (!hasRecentLocalWorkspaceMutation ||
          remoteAutoAcceptTimestampWins ||
          !localWorkspaceUpdatedAtMs ||
          !remoteWorkspaceUpdatedAtMs ||
          remoteWorkspaceUpdatedAtMs >= localWorkspaceUpdatedAtMs);
      const shouldApplyRemoteAvailability = !!lightweightSettings || (
        (!shouldRespectPendingAvailability ||
          remoteAvailabilityMatchesPending ||
          remoteGuidedTimestampWins) &&
        (shouldApplyRemoteWorkspace ||
          remoteGuidedTimestampWins ||
          !hasRecentLocalAvailabilityMutation ||
          (remoteWorkspaceUpdatedAtMs > 0 && remoteWorkspaceUpdatedAtMs >= localWorkspaceUpdatedAtMs))
      );

      if (remoteWorkspaceMatchesPending || !pendingWorkspaceStillFresh) {
        pendingWorkspaceSyncRef.current = null;
      }
      if (remoteAvailabilityMatchesPending || !pendingAvailabilityStillFresh) {
        pendingAvailabilitySyncRef.current = null;
      }

      if (shouldApplyRemoteWorkspace) {
        suppressAutoPortalPublishUntilRef.current =
          Date.now() + PORTAL_REMOTE_REHYDRATION_SUPPRESS_PUBLISH_MS;
        latestSalonWorkspaceRef.current = refreshedWorkspace;
        setSalonWorkspace((current) =>
          JSON.stringify(current) === JSON.stringify(refreshedWorkspace)
            ? current
            : refreshedWorkspace
        );
      }
      setClienti((current) =>
        filterRecentlyDeletedCustomers(
          enrichClientiWithFrontendRequestSignals(
            mergeClientiCollections(current, remoteSnapshot.clienti as Cliente[]),
            normalizedRemoteRequests
          )
        )
      );
      setAppuntamenti((current) =>
        filterRecentlyDeletedAppointments(
          normalizeAppuntamenti(
            mergeAppuntamentiCollections(current, normalizedRemoteAppointments, {
              preserveLocalCompositeKeys: getRecentlyCreatedAppointmentCompositeKeys(),
              preserveLocalIds: getRecentlyMovedAppointmentIds(),
            })
          )
        )
      );
      setServizi((current) =>
        normalizeServizi(
          mergeServiziCollections(current, remoteSnapshot.servizi as Servizio[])
        )
      );
      setOperatori((current) =>
        preferNonEmptyOperatoriSnapshot(
          current,
          remoteSnapshot.operatori as Operatore[]
        )
      );
      setRichiestePrenotazione(normalizedRemoteRequests);
      if (shouldApplyRemoteAvailability) {
        applyRemoteAvailabilitySettings(normalizedRemoteAvailabilitySettings);
      }
      setServiceCardColorOverrides((current) =>
        mergeServiceColorOverrideMaps({
          remoteOverrides: remoteSnapshot.serviceCardColorOverrides ?? {},
          localOverrides: current,
          services: normalizeServizi(
            mergeServiziCollections(servizi, remoteSnapshot.servizi as Servizio[])
          ),
        })
      );
      setRoleCardColorOverrides((current) =>
        mergeRoleColorOverrideMaps({
          remoteOverrides: remoteSnapshot.roleCardColorOverrides ?? {},
          localOverrides: current,
        })
      );
      ownerPortalBootstrapReadyRef.current = true;
    };

    void refreshOwnerFromPortal();

    const channel = supabase
      .channel(`owner-portal-live:${normalizedSalonCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_portals',
          filter: `salon_code=eq.${normalizedSalonCode}`,
        },
        () => {
          void refreshOwnerFromPortal();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          filter: isUuidValue(ownerWorkspaceId) ? `workspace_id=eq.${ownerWorkspaceId}` : 'workspace_id=is.null',
        },
        () => {
          void refreshOwnerFromPortal();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refreshOwnerFromPortal();
          return;
        }

        if (
          isExpoGoRuntime &&
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
        ) {
          void refreshOwnerFromPortal();
        }
      });

    const expoGoFallbackInterval = isExpoGoRuntime
      ? setInterval(() => {
          if (AppState.currentState === 'active') {
            void refreshOwnerFromPortal();
          }
        }, EXPO_GO_OWNER_LIVE_REFRESH_INTERVAL_MS)
      : null;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshOwnerFromPortal();
      }
    });

    return () => {
      cancelled = true;
      if (expoGoFallbackInterval) {
        clearInterval(expoGoFallbackInterval);
      }
      subscription.remove();
      void supabase.removeChannel(channel);
    };
    }, [
    applyRemoteAvailabilitySettings,
    fetchPortalSnapshotWithRetry,
    fetchPortalAvailabilitySettingsWithRetry,
    filterRecentlyDeletedAppointments,
    filterRecentlyDeletedCustomers,
    hasInitializedAuth,
    isAuthenticated,
    isExpoGoRuntime,
    salonAccountEmail,
    salonWorkspace.ownerEmail,
    salonWorkspace.salonCode,
    salonWorkspace.id,
  ]);

  const upsertFrontendCustomerForSalon = async ({
    salonCode,
    profile,
  }: {
    salonCode: string;
    profile: {
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
      instagram?: string;
    };
  }): Promise<
    | { ok: true }
    | {
        ok: false;
        reason: 'duplicate_email' | 'duplicate_phone' | 'duplicate_email_phone' | 'save_failed';
      }
  > => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        return { ok: false, reason: 'save_failed' };
      }

      const normalizedProfile = {
        nome: formatCustomerNamePart(profile.nome),
        cognome: formatCustomerNamePart(profile.cognome),
        email: profile.email.trim().toLowerCase(),
        telefono: profile.telefono.replace(/\D+/g, ''),
        instagram: profile.instagram?.trim() ?? '',
      };
      const customerName = formatCustomerFullNameValue(
        `${normalizedProfile.nome} ${normalizedProfile.cognome}`
      );
      const existingCustomer = resolved.clienti.find((item) => {
        const samePhone = item.telefono.trim() === normalizedProfile.telefono;
        const sameEmail = item.email?.trim().toLowerCase() === normalizedProfile.email;
        return samePhone || sameEmail;
      });

      if (existingCustomer) {
        const duplicatePhone = existingCustomer.telefono.trim() === normalizedProfile.telefono;
        const duplicateEmail =
          existingCustomer.email?.trim().toLowerCase() === normalizedProfile.email;

        return {
          ok: false,
          reason:
            duplicateEmail && duplicatePhone
              ? 'duplicate_email_phone'
              : duplicateEmail
                ? 'duplicate_email'
                : 'duplicate_phone',
        };
      }

      const { data: registeredCustomer, error: registerCustomerError } = await supabase.rpc(
        'register_public_customer',
        {
          p_salon_code: normalizedCode,
          p_customer_name: customerName,
          p_customer_phone: normalizedProfile.telefono,
          p_customer_email: normalizedProfile.email || null,
          p_customer_instagram: normalizedProfile.instagram || null,
        }
      );

      if (registerCustomerError) {
        const errorText = String(registerCustomerError.message ?? '').trim().toLowerCase();
        if (errorText.includes('duplicate_email_phone')) {
          return { ok: false, reason: 'duplicate_email_phone' };
        }
        if (errorText.includes('duplicate_email')) {
          return { ok: false, reason: 'duplicate_email' };
        }
        if (errorText.includes('duplicate_phone')) {
          return { ok: false, reason: 'duplicate_phone' };
        }

        console.log('Errore registrazione cliente pubblico persistente:', registerCustomerError);
        return { ok: false, reason: 'save_failed' };
      }

      const persistedCustomerId =
        typeof registeredCustomer === 'object' &&
        registeredCustomer !== null &&
        'customerId' in registeredCustomer &&
        typeof registeredCustomer.customerId === 'string' &&
        registeredCustomer.customerId.trim()
          ? registeredCustomer.customerId.trim()
          : `cliente-front-${Date.now()}`;

      void flushQueuedPushNotifications();
      scheduleDelayedPushFlush();

      const nextCustomers = [
        {
          id: persistedCustomerId,
          nome: customerName,
          telefono: normalizedProfile.telefono,
          email: normalizedProfile.email,
          instagram: normalizedProfile.instagram,
          nota: '',
          fonte: 'frontend' as const,
          viewedBySalon: false,
          annullamentiCount: 0,
          inibito: false,
          maxFutureAppointments: 4,
          maxFutureAppointmentsMode: 'monthly' as const,
          maxDailyAppointments: 1,
        },
        ...resolved.clienti,
      ];

      let workspaceId: string | null = null;
      try {
        workspaceId = await enqueuePortalPublish({
          workspace: resolved.workspace,
          clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
          appuntamenti: resolved.appuntamenti as unknown as Array<Record<string, unknown>>,
          servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
          operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione:
            resolved.richiestePrenotazione as unknown as Array<Record<string, unknown>>,
          availabilitySettings: resolved.availabilitySettings,
        });
      } catch (portalPublishError) {
        console.log(
          'Pubblicazione portale cliente non riuscita dopo registrazione frontend, ma cliente creato correttamente:',
          portalPublishError
        );
      }

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setClienti(nextCustomers);
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore salvataggio cliente frontend:', error);
      return { ok: false, reason: 'save_failed' };
    }
  };

  const addBookingRequestForSalon = async (
    salonCode: string,
    request: RichiestaPrenotazione
  ) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const toErrorText = (value: unknown) => {
      if (!value || typeof value !== 'object') return '';

      const maybeError = value as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      return [
        maybeError.code,
        maybeError.message,
        maybeError.details,
        maybeError.hint,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    };

    try {
      const { data: createdBookingRequest, error: createBookingRequestError } = await supabase.rpc(
        'create_public_booking_request',
        {
          p_salon_code: normalizedCode,
          p_requested_service_name: request.servizio,
          p_requested_price: request.prezzo,
          p_requested_duration_minutes: request.durataMinuti ?? 60,
          p_appointment_date: request.data,
          p_appointment_time: request.ora,
          p_customer_name: request.nome,
          p_customer_surname: request.cognome,
          p_customer_email: request.email,
          p_customer_phone: request.telefono,
          p_customer_instagram: request.instagram ?? null,
          p_notes: request.note ?? null,
          p_operator_id: request.operatoreId ?? null,
          p_operator_name: request.operatoreNome ?? null,
        }
      );

      if (createBookingRequestError) {
        console.log('Errore creazione booking_request reale:', createBookingRequestError);
        const errorText = toErrorText(createBookingRequestError);
        const detail = errorText || 'save_failed';
        if (errorText.includes('slot_unavailable') || errorText.includes('slot_already_requested')) {
          return { ok: false, error: 'slot_unavailable', detail };
        }
        if (errorText.includes('workspace_not_found')) {
          return { ok: false, error: 'salon_not_found', detail };
        }
        if (
          errorText.includes('customer_name_required') ||
          errorText.includes('customer_email_required') ||
          errorText.includes('customer_phone_required')
        ) {
          return { ok: false, error: 'invalid_customer_data', detail };
        }
        if (errorText.includes('max_future_appointments_reached')) {
          return { ok: false, error: 'max_future_appointments_reached', detail };
        }
        if (errorText.includes('max_daily_appointments_reached')) {
          return { ok: false, error: 'max_daily_appointments_reached', detail };
        }
        if (errorText.includes('service_name_required')) {
          return { ok: false, error: 'service_required', detail };
        }
        if (errorText.includes('appointment_datetime_required')) {
          return { ok: false, error: 'appointment_datetime_required', detail };
        }
        return { ok: false, error: 'save_failed', detail };
      }

      const createdRow = Array.isArray(createdBookingRequest)
        ? createdBookingRequest[0]
        : createdBookingRequest;
      const workspaceId =
        typeof createdRow?.workspace_id === 'string' ? createdRow.workspace_id : null;

      if (
        normalizedCode === salonWorkspace.salonCode &&
        salonWorkspace.ownerEmail === salonAccountEmail
      ) {
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }

        setRichiestePrenotazione((current) =>
          normalizeRichiestePrenotazione([
            {
              ...request,
              id:
                typeof createdRow?.id === 'string' && createdRow.id.trim()
                  ? createdRow.id
                  : request.id,
              createdAt:
                typeof createdRow?.created_at === 'string' && createdRow.created_at.trim()
                  ? createdRow.created_at
                  : request.createdAt,
            },
            ...current.filter(
              (item) =>
                !(
                  item.data === request.data &&
                  normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(request.ora) &&
                  normalizeIdentityText(item.email) === normalizeIdentityText(request.email) &&
                  normalizePhoneForIdentity(item.telefono) ===
                    normalizePhoneForIdentity(request.telefono) &&
                  ['In attesa', 'Accettata'].includes(item.stato)
                )
            ),
          ])
        );
      }

      void flushQueuedPushNotifications();
      scheduleDelayedPushFlush();

      return { ok: true };
    } catch (error) {
      console.log('Errore salvataggio richiesta frontend:', error);
      const detail =
        error instanceof Error ? error.message.trim().toLowerCase() : 'save_failed';
      return { ok: false, error: 'save_failed', detail };
    }
  };

  const createOwnerAppointmentForSalon = async ({
    salonCode,
    dateValue,
    timeValue,
    customerName,
    customerPhone,
    customerEmail,
    customerInstagram,
    customerNote,
    customerSource = 'salone',
    createCustomerRecord = false,
    createBookingRequest = false,
    serviceName,
    priceValue,
    durationMinutes = 60,
    operatorId,
    operatorName,
    machineryIds,
    machineryNames,
  }: {
    salonCode: string;
    dateValue: string;
    timeValue: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    customerInstagram?: string;
    customerNote?: string;
    customerSource?: 'salone' | 'frontend';
    createCustomerRecord?: boolean;
    createBookingRequest?: boolean;
    serviceName: string;
    priceValue: number;
    durationMinutes?: number;
    operatorId?: string;
    operatorName?: string;
    machineryIds?: string[];
    machineryNames?: string[];
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const toErrorText = (value: unknown) => {
      if (!value || typeof value !== 'object') return '';

      const maybeError = value as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join(' ')
        .toLowerCase();
    };

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        return { ok: false, error: 'Salone non trovato.' };
      }

      const isCurrentSalonWorkspace =
        normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);
      const isCurrentOwnerWorkspace =
        normalizeAccountEmail(resolved.workspace.ownerEmail) ===
        normalizeAccountEmail(salonAccountEmail);

      const persistCreatedAppointment = async ({
        createdRow,
        allowAcceptedRequestMirror,
      }: {
        createdRow: {
          appointmentId?: string;
          bookingRequestId?: string;
          customerId?: string;
          workspaceId?: string;
        } | null;
        allowAcceptedRequestMirror: boolean;
      }) => {
        const appointmentId =
          createdRow?.appointmentId?.trim() || `owner-${Date.now().toString(36)}`;
        const backendWorkspaceId = createdRow?.workspaceId?.trim() || '';

        if (backendWorkspaceId && backendWorkspaceId !== resolved.workspace.id) {
          return {
            ok: false as const,
            error: 'Il backend ha salvato l’appuntamento su un workspace diverso da quello aperto.',
          };
        }

        const normalizedCustomerName = customerName.trim();
        const normalizedServiceName = serviceName.trim();
        const persistedServiceRole =
          resolved.servizi.find(
            (item) => item.nome.trim().toLowerCase() === normalizedServiceName.toLowerCase()
          )?.mestiereRichiesto?.trim() ?? '';
        const normalizedOperatorName = operatorName?.trim() ?? '';
        unmarkRecentlyDeletedAppointment({
          date: dateValue,
          time: timeValue,
          customerName: normalizedCustomerName,
          serviceName: normalizedServiceName,
          operatorId,
          operatorName: normalizedOperatorName,
        });
        const nextAppointments = normalizeAppuntamenti([
          {
            id: appointmentId,
            data: dateValue,
            ora: timeValue,
            cliente: normalizedCustomerName,
            servizio: normalizedServiceName,
            prezzo: priceValue,
            durataMinuti: durationMinutes,
            mestiereRichiesto: persistedServiceRole,
            operatoreId: operatorId?.trim() ?? '',
            operatoreNome: normalizedOperatorName,
            macchinarioIds: machineryIds ?? [],
            macchinarioNomi: machineryNames ?? [],
            incassato: false,
            completato: false,
            nonEffettuato: false,
          },
          ...resolved.appuntamenti,
        ]);
        markRecentlyCreatedAppointment(nextAppointments[0]);

        const nextCustomers = createCustomerRecord
          ? normalizeClienti([
              {
                id: createdRow?.customerId?.trim() || `owner-customer-${Date.now().toString(36)}`,
                nome: normalizedCustomerName,
                telefono: customerPhone?.trim() ?? '',
                email: customerEmail?.trim().toLowerCase() ?? '',
                instagram: customerInstagram?.trim() ?? '',
                birthday: '',
                nota: customerNote?.trim() ?? '',
                fonte: customerSource === 'frontend' ? 'frontend' : 'salone',
                viewedBySalon: true,
                annullamentiCount: 0,
                inibito: false,
              },
              ...resolved.clienti,
            ])
          : resolved.clienti;

        const nextRequests =
          createBookingRequest && allowAcceptedRequestMirror
            ? normalizeRichiestePrenotazione([
                {
                  id: createdRow?.bookingRequestId?.trim() || `owner-booking-${Date.now().toString(36)}`,
                  data: dateValue,
                  ora: timeValue,
                  servizio: normalizedServiceName,
                  prezzo: priceValue,
                  durataMinuti: durationMinutes,
                  mestiereRichiesto: persistedServiceRole,
                  operatoreId: operatorId?.trim() ?? '',
                  operatoreNome: normalizedOperatorName,
                  nome: normalizedCustomerName.split(' ')[0] || normalizedCustomerName,
                  cognome: normalizedCustomerName.split(' ').slice(1).join(' ') || '',
                  email: customerEmail?.trim().toLowerCase() ?? '',
                  telefono: customerPhone?.trim() ?? '',
                  instagram: customerInstagram?.trim() ?? '',
                  note: customerNote?.trim() ?? '',
                  stato: 'Accettata',
                  createdAt: new Date().toISOString(),
                  origine: customerSource === 'frontend' ? 'frontend' : 'backoffice',
                  viewedBySalon: true,
                  viewedByCliente: customerSource === 'frontend' ? false : true,
                },
                ...resolved.richiestePrenotazione,
              ])
            : resolved.richiestePrenotazione;

        let workspaceId: string | null = resolved.workspace.id;

        try {
          workspaceId = await enqueuePortalPublish({
            workspace: resolved.workspace,
            clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
            appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
            servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
            operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
            availabilitySettings: resolved.availabilitySettings,
          });

          if (isCurrentSalonWorkspace && isCurrentOwnerWorkspace) {
            setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
            if (nextCustomers !== resolved.clienti) {
              setClienti(nextCustomers);
            }
            if (nextRequests !== resolved.richiestePrenotazione) {
              setRichiestePrenotazione(nextRequests);
            }
            if (workspaceId && workspaceId !== salonWorkspace.id) {
              const nextWorkspaceId = workspaceId;
              setSalonWorkspace((current) => ({ ...current, id: nextWorkspaceId }));
            }
          }

          await queueWorkspacePushNotification({
            workspaceId: workspaceId ?? resolved.workspace.id,
            eventType: 'custom',
            title: 'Nuovo appuntamento confermato',
            body: `${formatPushCustomerName(normalizedCustomerName)} - ${normalizedServiceName} il ${dateValue} alle ${timeValue}`,
            audience: 'public',
            payload: {
              type: 'appointment_created',
              appointmentId,
              appointmentDate: dateValue,
              appointmentTime: timeValue,
              serviceName: normalizedServiceName,
              customerName: normalizedCustomerName,
              customerEmail: customerEmail?.trim().toLowerCase() ?? '',
              customerPhone: customerPhone?.trim() ?? '',
              source: 'backoffice',
            },
          });

          return { ok: true as const };
        } catch (error) {
          console.log('Errore creazione appuntamento owner publish:', error);
          return { ok: false as const, error: 'Non sono riuscito a creare l’appuntamento.' };
        }
      };

      const ownerSessionResult = await ensureRealtimeOwnerSession();
      if (!ownerSessionResult.ok) {
        return {
          ok: false,
          error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
        };
      }

      const { data: createdAppointment, error: createAppointmentError } = await supabase.rpc(
        'create_owner_appointment',
        {
          p_salon_code: normalizedCode,
          p_customer_name: customerName.trim(),
          p_customer_phone: customerPhone?.trim() || null,
          p_customer_email: customerEmail?.trim().toLowerCase() || null,
          p_customer_instagram: customerInstagram?.trim() || null,
          p_customer_note: customerNote?.trim() || null,
          p_customer_source: customerSource === 'frontend' ? 'frontend' : 'salon',
          p_create_customer_record: createCustomerRecord,
          p_create_booking_request: createBookingRequest,
          p_service_name: serviceName.trim(),
          p_price: priceValue,
          p_duration_minutes: durationMinutes,
          p_appointment_date: dateValue,
          p_appointment_time: timeValue,
          p_operator_id: operatorId?.trim() || null,
          p_operator_name: operatorName?.trim() || null,
        }
      );

      const creationErrorText = toErrorText(createAppointmentError);
      if (createAppointmentError && creationErrorText.includes('workspace_access_denied')) {
        const bootstrapResult = await ensureOwnerBackendBootstrap(ownerSessionResult.email);
        if (!bootstrapResult.ok) {
          return {
            ok: false,
            error: 'Workspace backend non allineato. Rientra nel salone e riprova.',
          };
        }

        const { data: retriedAppointment, error: retriedAppointmentError } = await supabase.rpc(
          'create_owner_appointment',
          {
            p_salon_code: normalizedCode,
            p_customer_name: customerName.trim(),
            p_customer_phone: customerPhone?.trim() || null,
            p_customer_email: customerEmail?.trim().toLowerCase() || null,
            p_customer_instagram: customerInstagram?.trim() || null,
            p_customer_note: customerNote?.trim() || null,
            p_customer_source: customerSource === 'frontend' ? 'frontend' : 'salon',
            p_create_customer_record: createCustomerRecord,
            p_create_booking_request: createBookingRequest,
            p_service_name: serviceName.trim(),
            p_price: priceValue,
            p_duration_minutes: durationMinutes,
            p_appointment_date: dateValue,
            p_appointment_time: timeValue,
            p_operator_id: operatorId?.trim() || null,
            p_operator_name: operatorName?.trim() || null,
          }
        );

        if (!retriedAppointmentError) {
          const retriedRow =
            retriedAppointment &&
            typeof retriedAppointment === 'object' &&
            !Array.isArray(retriedAppointment)
              ? (retriedAppointment as {
                  appointmentId?: string;
                  bookingRequestId?: string;
                  customerId?: string;
                  workspaceId?: string;
                })
              : null;
          return await persistCreatedAppointment({
            createdRow: retriedRow,
            allowAcceptedRequestMirror: true,
          });
        }

        console.log('Errore creazione appointment reale owner dopo bootstrap retry:', retriedAppointmentError);
        return {
          ok: false,
          error:
            retriedAppointmentError.message?.trim() ||
            'Non sono riuscito a salvare l’appuntamento.',
        };
      }

      if (createAppointmentError) {
        console.log('Errore creazione appointment reale owner:', createAppointmentError);
        const createAppointmentErrorText = toErrorText(createAppointmentError);
        return {
          ok: false,
          error:
            createAppointmentErrorText.includes('customer_time_overlap')
              ? 'Questo cliente ha gia un altro appuntamento che si accavalla nello stesso giorno.'
              : createAppointmentError.message?.trim() ||
            'Non sono riuscito a salvare l’appuntamento.',
        };
      }

      const createdRow =
        createdAppointment && typeof createdAppointment === 'object' && !Array.isArray(createdAppointment)
          ? (createdAppointment as Record<string, unknown>)
          : Array.isArray(createdAppointment) && createdAppointment[0] && typeof createdAppointment[0] === 'object'
            ? (createdAppointment[0] as Record<string, unknown>)
            : null;
      const appointmentId =
        typeof createdRow?.appointmentId === 'string' && createdRow.appointmentId.trim()
          ? createdRow.appointmentId
          : '';
      const bookingRequestId =
        typeof createdRow?.bookingRequestId === 'string' && createdRow.bookingRequestId.trim()
          ? createdRow.bookingRequestId
          : null;
      const customerId =
        typeof createdRow?.customerId === 'string' && createdRow.customerId.trim()
          ? createdRow.customerId
          : null;
      const createdWorkspaceId =
        typeof createdRow?.workspaceId === 'string' && createdRow.workspaceId.trim()
          ? createdRow.workspaceId
          : null;

      if (!appointmentId) {
        return {
          ok: false,
          error: 'Il backend non ha confermato il salvataggio dell’appuntamento.',
        };
      }

      if (createdWorkspaceId && createdWorkspaceId !== resolved.workspace.id) {
        return {
          ok: false,
          error:
            'Il backend ha salvato l’appuntamento su un workspace diverso da quello aperto. Ricarica il salone e riprova.',
        };
      }

      const normalizedCustomerName = customerName.trim();
      const normalizedServiceName = serviceName.trim();
      const persistedServiceRole =
        resolved.servizi.find(
          (item) => item.nome.trim().toLowerCase() === normalizedServiceName.toLowerCase()
        )?.mestiereRichiesto?.trim() ?? '';
      const normalizedOperatorName = operatorName?.trim() ?? '';
      const shouldUseLocalStateAsBase = isCurrentSalonWorkspace && isCurrentOwnerWorkspace;
      unmarkRecentlyDeletedAppointment({
        date: dateValue,
        time: timeValue,
        customerName: normalizedCustomerName,
        serviceName: normalizedServiceName,
        operatorId,
        operatorName: normalizedOperatorName,
      });

      // When the owner creates bookings back-to-back, the remote snapshot can lag by a few ms.
      // Use local in-memory state as base for the current workspace to avoid dropping prior inserts.
      const baseAppointments = shouldUseLocalStateAsBase ? appuntamenti : resolved.appuntamenti;
      const baseCustomers = shouldUseLocalStateAsBase ? clienti : resolved.clienti;
      const baseRequests = shouldUseLocalStateAsBase
        ? richiestePrenotazione
        : resolved.richiestePrenotazione;

      const nextAppointments = normalizeAppuntamenti([
        {
          id: appointmentId,
          data: dateValue,
          ora: timeValue,
          cliente: normalizedCustomerName,
          servizio: normalizedServiceName,
          prezzo: priceValue,
          durataMinuti: durationMinutes,
          mestiereRichiesto: persistedServiceRole,
          operatoreId: operatorId ?? '',
          operatoreNome: operatorName ?? '',
          macchinarioIds: normalizeStringIdArray(machineryIds),
          macchinarioNomi: normalizeStringIdArray(machineryNames),
          incassato: false,
          completato: false,
          nonEffettuato: false,
        },
        ...baseAppointments.filter((item) => {
          const itemDate = item.data ?? getTodayDateString();
          return !(
            itemDate === dateValue &&
            item.ora === timeValue &&
            item.servizio.trim().toLowerCase() === normalizedServiceName.toLowerCase() &&
            item.cliente.trim().toLowerCase() === normalizedCustomerName.toLowerCase()
          );
        }),
      ]);
      markRecentlyCreatedAppointment(nextAppointments[0]);

      const nextCustomers =
        createCustomerRecord || !!customerId
          ? normalizeClienti(
              (() => {
                const normalizedPhone = customerPhone?.trim() ?? '';
                const normalizedEmail = customerEmail?.trim().toLowerCase() ?? '';
                const existingCustomer = baseCustomers.find(
                  (item) =>
                    (!!normalizedPhone && item.telefono.trim() === normalizedPhone) ||
                    (!!normalizedEmail &&
                      (item.email ?? '').trim().toLowerCase() === normalizedEmail) ||
                    matchesCustomerDisplayName(item.nome, normalizedCustomerName)
                );

                if (existingCustomer) {
                  return baseCustomers.map((item) =>
                    item.id === existingCustomer.id
                      ? {
                          ...item,
                          id: customerId ?? item.id,
                          nome: normalizedCustomerName,
                          telefono: normalizedPhone || item.telefono,
                          email: customerEmail?.trim() || item.email,
                          instagram: customerInstagram?.trim() || item.instagram,
                          nota: customerNote?.trim() || item.nota,
                          fonte: customerSource,
                          viewedBySalon: true,
                        }
                      : item
                  );
                }

                return [
                  {
                    id: customerId ?? `cliente-${Date.now()}`,
                    nome: normalizedCustomerName,
                    telefono: customerPhone?.trim() ?? '',
                    email: customerEmail?.trim() ?? '',
                    instagram: customerInstagram?.trim() ?? '',
                    nota: customerNote?.trim() ?? '',
                    fonte: customerSource,
                    viewedBySalon: true,
                    annullamentiCount: 0,
                    inibito: false,
                    maxFutureAppointments: 4,
                    maxFutureAppointmentsMode: 'monthly' as const,
                    maxDailyAppointments: 1,
                  },
                  ...baseCustomers,
                ];
              })()
            )
          : baseCustomers;

      const nextRequests =
        createBookingRequest && bookingRequestId
          ? normalizeRichiestePrenotazione([
              {
                id: bookingRequestId,
                data: dateValue,
                ora: timeValue,
                servizio: normalizedServiceName,
                prezzo: priceValue,
                durataMinuti: durationMinutes,
                mestiereRichiesto: persistedServiceRole,
                operatoreId: operatorId ?? '',
                operatoreNome: operatorName ?? '',
                nome: normalizedCustomerName.split(' ')[0] ?? normalizedCustomerName,
                cognome: normalizedCustomerName.split(' ').slice(1).join(' '),
                email: customerEmail?.trim() ?? '',
                telefono: customerPhone?.trim() ?? '',
                instagram: customerInstagram?.trim() ?? '',
                note: customerNote?.trim() ?? '',
                origine: 'backoffice',
                stato: 'Accettata',
                createdAt: new Date().toISOString(),
                viewedByCliente: false,
                viewedBySalon: true,
              },
              ...baseRequests.filter((item) => item.id !== bookingRequestId),
            ])
          : baseRequests;

      const workspaceId = await enqueuePortalPublish({
        workspace: resolved.workspace,
        clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
        appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (isCurrentSalonWorkspace && isCurrentOwnerWorkspace) {
        setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        if (nextCustomers !== resolved.clienti) {
          setClienti(nextCustomers);
        }
        if (nextRequests !== resolved.richiestePrenotazione) {
          setRichiestePrenotazione(nextRequests);
        }
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      await queueWorkspacePushNotification({
        workspaceId: workspaceId ?? resolved.workspace.id,
        eventType: 'custom',
        title: 'Nuovo appuntamento confermato',
        body: `Cliente: ${formatPushCustomerName(normalizedCustomerName)}. Servizio: ${normalizedServiceName}.${
          persistedServiceRole?.trim()
            ? ` Mestiere: ${persistedServiceRole.trim()}.`
            : ''
        } Data: ${formatPushDateLabel(
          dateValue
        )}. Ora: ${timeValue}.${
          normalizedOperatorName ? ` Operatore: ${normalizedOperatorName}.` : ''
        }`,
        audience: 'public',
        customerEmail: customerEmail?.trim().toLowerCase() ?? '',
        customerPhone: customerPhone?.trim() ?? '',
        payload: {
          type: 'appointment_created',
          appointmentId,
          appointmentDate: dateValue,
          appointmentTime: timeValue,
          serviceName: normalizedServiceName,
          customerName: normalizedCustomerName,
          customerEmail: customerEmail?.trim().toLowerCase() ?? '',
          customerPhone: customerPhone?.trim() ?? '',
          source: 'backoffice',
        },
      });

      return { ok: true };
    } catch (error) {
      console.log('Errore creazione appuntamento owner:', error);
      return { ok: false, error: 'Non sono riuscito a creare l’appuntamento.' };
    }
  };

  const markClientRequestsViewedForSalon = async (
    salonCode: string,
    email: string,
    telefono: string
  ) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneForIdentity(telefono);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) return;

      const { error: markViewedError } = await supabase.rpc('mark_public_booking_requests_viewed', {
        p_salon_code: normalizedCode,
        p_customer_email: normalizedEmail || null,
        p_customer_phone: normalizedPhone || null,
      });

      if (markViewedError) {
        console.log('Errore aggiornamento booking_requests lette cliente:', markViewedError);
      }

      const nextRequests = resolved.richiestePrenotazione.map((item: RichiestaPrenotazione) =>
        ((item.email.trim().toLowerCase() === normalizedEmail && normalizedEmail.length > 0) ||
          (normalizePhoneForIdentity(item.telefono) === normalizedPhone && normalizedPhone.length > 0)) &&
        item.stato !== 'In attesa'
          ? { ...item, viewedByCliente: true }
          : item
      );

      const workspaceId = await enqueuePortalPublish({
        workspace: resolved.workspace,
        clienti: resolved.clienti as unknown as Array<Record<string, unknown>>,
        appuntamenti: resolved.appuntamenti as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione:
          normalizeRichiestePrenotazione(nextRequests) as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setRichiestePrenotazione(normalizeRichiestePrenotazione(nextRequests));
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }
    } catch (error) {
      console.log('Errore aggiornamento richieste cliente lette:', error);
    }
  };

  const cancelClientAppointmentForSalon = async ({
    salonCode,
    requestId,
    email,
    telefono,
    requestSnapshot,
  }: {
    salonCode: string;
    requestId: string;
    email: string;
    telefono: string;
    requestSnapshot?: RichiestaPrenotazione;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const requestToCancel =
        requestSnapshot ??
        (await resolveSalonByCode(normalizedCode))?.richiestePrenotazione.find((item) => item.id === requestId);
      if (!requestToCancel) {
        return { ok: false, error: 'Prenotazione non trovata.' };
      }

      if (requestToCancel.stato === 'Rifiutata' || requestToCancel.stato === 'Annullata') {
        return { ok: false, error: 'Questa prenotazione risulta gia chiusa.' };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPhone = normalizePhoneForIdentity(telefono);
      const requestEmail = requestToCancel.email.trim().toLowerCase();
      const requestPhone = normalizePhoneForIdentity(requestToCancel.telefono);
      const matchesEmail =
        normalizedEmail.length > 0 &&
        requestEmail.length > 0 &&
        requestEmail === normalizedEmail;
      const matchesPhone =
        normalizedPhone.length > 0 &&
        requestPhone.length > 0 &&
        requestPhone === normalizedPhone;

      if (!matchesEmail && !matchesPhone) {
        return { ok: false, error: 'Questa prenotazione non appartiene al profilo cliente attivo.' };
      }

      const normalizedFullName = `${requestToCancel.nome} ${requestToCancel.cognome}`.trim().toLowerCase();
      const shouldPersistRealStatus = isUuid(requestId);
      const cancelRpcTask = shouldPersistRealStatus
        ? Promise.resolve(
            supabase.rpc('cancel_public_booking_request', {
              p_salon_code: normalizedCode,
              p_request_id: requestId,
              p_customer_email: normalizedEmail,
              p_customer_phone: normalizedPhone,
            })
          )
        : Promise.resolve({ error: null });
      const cancelTimeoutTask = new Promise<{
        data: null;
        error: { message: string; details?: string | null; hint?: string | null; code?: string | null };
      }>((resolve) => {
        const timer = setTimeout(() => {
          resolve({
            data: null,
            error: {
              message: 'cancel_public_booking_request_timeout',
              details: 'timeout',
              hint: 'optimistic-fallback',
              code: 'TIMEOUT',
            },
          });
        }, 8000);

        cancelRpcTask.finally(() => clearTimeout(timer)).catch(() => undefined);
      });
      const { error: cancelError } = shouldPersistRealStatus
        ? await Promise.race([cancelRpcTask, cancelTimeoutTask])
        : { error: null };
      const cancelErrorText = [cancelError?.message, cancelError?.details, cancelError?.hint, cancelError?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const isDefinitelyLocalOnlyRequest =
        !shouldPersistRealStatus ||
        /booking_request_not_found/i.test(cancelErrorText);
      const canContinueOptimistically =
        isDefinitelyLocalOnlyRequest ||
        /timeout|timed out|failed to fetch|network|fetch|deadlock|40p01/i.test(cancelErrorText) ||
        isDeadlockError(cancelError);

      if (cancelError && !canContinueOptimistically) {
        console.log('Errore annullamento booking_request reale cliente:', cancelError);
        return {
          ok: false,
          error:
            cancelErrorText.trim() ||
            cancelError?.message ||
            'Non sono riuscito ad annullare la prenotazione.',
        };
      }

      const optimisticCancelledRequest: RichiestaPrenotazione = {
        ...requestToCancel,
        stato: 'Annullata',
        viewedByCliente: true,
        viewedBySalon: false,
        cancellationSource: 'cliente',
      };

      let resolved: Awaited<ReturnType<typeof resolveSalonByCode>> | null = null;
      try {
        resolved = await resolveSalonByCode(normalizedCode);
      } catch (resolveError) {
        console.log('Errore risoluzione salone per annullamento cliente, continuo in modalita ottimistica:', resolveError);
      }
      const sourceRequests = resolved?.richiestePrenotazione ?? [requestToCancel];
      const sourceAppointments = resolved?.appuntamenti ?? [];
      const sourceCustomers = resolved?.clienti ?? [];
      const sourceWorkspace =
        resolved?.workspace ??
        ({
          ...salonWorkspace,
          salonCode: normalizedCode,
        } as SalonWorkspace);
      const sourceServices = resolved?.servizi ?? servizi;
      const sourceOperators = resolved?.operatori ?? operatori;
      const sourceAvailabilitySettings =
        resolved?.availabilitySettings ?? availabilitySettings;

      const legacyNextRequests = normalizeRichiestePrenotazione(
        sourceRequests.map((item) => (item.id === requestId ? optimisticCancelledRequest : item))
      );

      const shouldRemoveAcceptedAppointment = requestToCancel.stato === 'Accettata';
      const matchesCancelledClientAppointment = (item: Appuntamento) => {
        const itemDate = item.data ?? getTodayDateString();
        return (
          shouldRemoveAcceptedAppointment &&
          itemDate === requestToCancel.data &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToCancel.ora) &&
          normalizeIdentityText(item.servizio) ===
            normalizeIdentityText(requestToCancel.servizio) &&
          matchesCustomerDisplayName(item.cliente, normalizedFullName) &&
          !item.completato &&
          !item.incassato &&
          !item.nonEffettuato
        );
      };
      const acceptedAppointmentsToRemove = shouldRemoveAcceptedAppointment
        ? sourceAppointments.filter((item) => matchesCancelledClientAppointment(item))
        : [];
      if (shouldRemoveAcceptedAppointment) {
        if (acceptedAppointmentsToRemove.length > 0) {
          acceptedAppointmentsToRemove.forEach((item) => {
            markRecentlyDeletedAppointment({
              date: item.data ?? requestToCancel.data,
              time: item.ora,
              customerName: item.cliente,
              serviceName: item.servizio,
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            });
          });
        } else {
          markRecentlyDeletedAppointment({
            date: requestToCancel.data,
            time: requestToCancel.ora,
            customerName: `${requestToCancel.nome} ${requestToCancel.cognome}`.trim(),
            serviceName: requestToCancel.servizio,
            operatorId: requestToCancel.operatoreId,
            operatorName: requestToCancel.operatoreNome,
          });
        }
      }
      const legacyNextAppointments = sourceAppointments.filter(
        (item) => !matchesCancelledClientAppointment(item)
      );

      const nextCustomers = normalizeClienti(
        sourceCustomers.map((item) => {
          const matchesByPhone = normalizePhoneForIdentity(item.telefono) === normalizedPhone;
          const matchesByEmail = (item.email ?? '').trim().toLowerCase() === normalizedEmail;
          if (!matchesByPhone && !matchesByEmail) return item;

          return {
            ...item,
            annullamentiCount: (item.annullamentiCount ?? 0) + 1,
            viewedBySalon: false,
          };
        })
      );

      const finalNextRequests: RichiestaPrenotazione[] = legacyNextRequests;
      const finalNextAppointments: Appuntamento[] = legacyNextAppointments;
      let workspaceId: string | null = sourceWorkspace.id;

      if (normalizedCode === salonWorkspace.salonCode && sourceWorkspace.ownerEmail === salonAccountEmail) {
        setRichiestePrenotazione(finalNextRequests);
        setAppuntamenti(filterRecentlyDeletedAppointments(finalNextAppointments));
        setClienti(nextCustomers);
      }

      void (async () => {
        try {
          const latestResolved = cancelError ? null : await resolveSalonByCode(normalizedCode);
          const latestNextRequests = latestResolved
            ? normalizeRichiestePrenotazione(
                latestResolved.richiestePrenotazione.map((item) =>
                  item.id === requestId
                    ? {
                        ...item,
                        stato: 'Annullata',
                        viewedByCliente: true,
                        viewedBySalon: false,
                        cancellationSource: 'cliente',
                      }
                    : item
                )
              )
            : null;
          const resolvedCancelledRequest =
            latestNextRequests?.find((item) => item.id === requestId) ?? null;
          const syncedNextRequests: RichiestaPrenotazione[] =
            resolvedCancelledRequest &&
            resolvedCancelledRequest.stato === 'Annullata' &&
            resolvedCancelledRequest.cancellationSource === 'cliente'
              ? latestNextRequests ?? finalNextRequests
              : finalNextRequests;
          const latestNextAppointments = latestResolved
            ? normalizeAppuntamenti(
                latestResolved.appuntamenti.filter((item) => !matchesCancelledClientAppointment(item))
              )
            : null;
          const syncedNextAppointments: Appuntamento[] = latestNextAppointments ?? finalNextAppointments;

          workspaceId = await enqueuePortalPublish({
            workspace: sourceWorkspace,
            clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
            appuntamenti:
              syncedNextAppointments as unknown as Array<Record<string, unknown>>,
            servizi: (latestResolved?.servizi ?? sourceServices) as unknown as Array<Record<string, unknown>>,
            operatori:
              (latestResolved?.operatori ?? sourceOperators) as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione:
              syncedNextRequests as unknown as Array<Record<string, unknown>>,
            availabilitySettings: latestResolved?.availabilitySettings ?? sourceAvailabilitySettings,
          });

          if (normalizedCode === salonWorkspace.salonCode && sourceWorkspace.ownerEmail === salonAccountEmail) {
            setRichiestePrenotazione(syncedNextRequests);
            setAppuntamenti(filterRecentlyDeletedAppointments(syncedNextAppointments));
            setClienti(nextCustomers);
            const resolvedWorkspaceId = workspaceId;
            if (resolvedWorkspaceId && resolvedWorkspaceId !== salonWorkspace.id) {
              setSalonWorkspace((current) => ({ ...current, id: resolvedWorkspaceId }));
            }
          }
        } catch (error) {
          console.log('Errore sync post annullamento cliente:', error);
        }
      })();

      if (cancelError && canContinueOptimistically) {
        void (async () => {
          try {
            await queueWorkspacePushNotification({
              workspaceId: workspaceId ?? sourceWorkspace.id,
              eventType: 'appointment_cancelled',
              title:
                requestToCancel.stato === 'In attesa'
                  ? 'Richiesta annullata dal cliente'
                  : 'Prenotazione annullata dal cliente',
            body: `${formatPushCustomerName(
              `${requestToCancel.nome} ${requestToCancel.cognome}`
            )}. Servizio: ${requestToCancel.servizio}.${
              requestToCancel.mestiereRichiesto?.trim()
                ? ` Mestiere: ${requestToCancel.mestiereRichiesto.trim()}.`
                : ''
            } Data: ${formatPushDateTimeLabel(requestToCancel.data, requestToCancel.ora)}.`,
              audience: 'auth',
              payload: {
                type: 'appointment_cancelled',
                bookingRequestId: requestToCancel.id,
                appointmentDate: requestToCancel.data,
                appointmentTime: requestToCancel.ora,
                customerName: `${requestToCancel.nome} ${requestToCancel.cognome}`.trim(),
                serviceName: requestToCancel.servizio,
                previousStatus: requestToCancel.stato,
              },
            });
          } catch (error) {
            console.log('Errore push annullamento cliente:', error);
          }
        })();
      }
      // On successful server-side cancellations, the RPC already queues the owner push
      // and processes related waitlist side effects atomically. Triggering extra flushes
      // here can race the first sender and duplicate the owner's cancellation push.

      return { ok: true };
    } catch (error) {
      console.log('Errore annullamento prenotazione cliente:', error);
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Non sono riuscito ad annullare la prenotazione.';
      return { ok: false, error: message };
    }
  };

  const cancelOwnerAppointmentForSalon = async ({
    salonCode,
    appointmentId,
    appointmentDate,
    appointmentTime,
    customerName,
    serviceName,
    operatorId,
    operatorName,
  }: {
    salonCode: string;
    appointmentId?: string;
    appointmentDate: string;
    appointmentTime: string;
    customerName: string;
    serviceName: string;
    operatorId?: string;
    operatorName?: string;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const isCurrentSalonWorkspace =
      normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);

    try {
      const matchesAppointment = (item: Appuntamento) => {
        const sameId = appointmentId && item.id === appointmentId;
        const normalizedAppointmentOperatorId = normalizeIdentityText(item.operatoreId);
        const normalizedAppointmentOperatorName = normalizeIdentityText(item.operatoreNome);
        const normalizedTargetOperatorId = normalizeIdentityText(operatorId);
        const normalizedTargetOperatorName = normalizeIdentityText(operatorName);
        const operatorMatches =
          (!normalizedTargetOperatorId && !normalizedTargetOperatorName) ||
          normalizedAppointmentOperatorId === normalizedTargetOperatorId ||
          normalizedAppointmentOperatorName === normalizedTargetOperatorName;
        const sameComposite =
          normalizeIdentityText(item.data ?? getTodayDateString()) === normalizeIdentityText(appointmentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(appointmentTime) &&
          normalizeIdentityText(item.cliente) === normalizeIdentityText(customerName) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName) &&
          operatorMatches;
        return !!(sameId || sameComposite);
      };

      const shouldPersistRealAppointment = isUuid(appointmentId);
      const cancelRequestPromise = shouldPersistRealAppointment
        ? supabase.rpc('cancel_owner_appointment', {
            p_appointment_id: appointmentId,
            p_appointment_date: appointmentDate,
            p_appointment_time: appointmentTime,
            p_customer_name: customerName,
            p_service_name: serviceName,
          })
        : Promise.resolve({ data: null, error: null });

      markRecentlyDeletedAppointment({
        date: appointmentDate,
        time: appointmentTime,
        customerName,
        serviceName,
        operatorId,
        operatorName,
      });

      // Usa sempre lo stato React in memoria come sorgente di verità.
      // NON fare resolveSalonByCode: restituisce uno snapshot stale dal server
      // che non include appuntamenti appena aggiunti localmente, causando
      // la sovrascrittura con una lista vuota al publish.
      const currentAppuntamenti = appuntamenti;
      const currentRichieste = richiestePrenotazione;
      const currentClienti = clienti;

      const nextAppointments = normalizeAppuntamenti(
        currentAppuntamenti.filter((item) => !matchesAppointment(item))
      );

      const linkedRequest = currentRichieste.find(
        (item) =>
          (item.stato === 'Accettata' || item.stato === 'In attesa') &&
          normalizeIdentityText(item.data) === normalizeIdentityText(appointmentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(appointmentTime) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName) &&
          matchesCustomerDisplayName(`${item.nome} ${item.cognome}`, customerName)
      );

      const customerNameLower = customerName.trim().toLowerCase();
      const matchedCustomer = currentClienti.find(
        (item) => matchesCustomerDisplayName(item.nome, customerName)
      );
      const linkedPhone = linkedRequest?.telefono?.trim() ?? matchedCustomer?.telefono?.trim() ?? '';

      const cancelledAppointment = currentAppuntamenti.find((item) => matchesAppointment(item));
      const nameParts = customerName.trim().split(' ');
      const syntheticNome = nameParts.slice(0, -1).join(' ') || nameParts[0] || customerName.trim();
      const syntheticCognome = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

      const nextRequests = linkedRequest
        ? normalizeRichiestePrenotazione(
            currentRichieste.map((item) =>
              item.id === linkedRequest.id
                ? {
                    ...item,
                    stato: 'Annullata',
                    viewedByCliente: false,
                    viewedBySalon: true,
                    cancellationSource: 'salone',
                  }
                : item
            )
          )
        : normalizeRichiestePrenotazione([
            {
              id: `cancelled-owner-${Date.now()}`,
              data: appointmentDate,
              ora: appointmentTime,
              servizio: serviceName,
              prezzo: cancelledAppointment?.prezzo ?? 0,
              durataMinuti: cancelledAppointment?.durataMinuti,
              mestiereRichiesto: cancelledAppointment?.mestiereRichiesto ?? '',
              operatoreId: cancelledAppointment?.operatoreId ?? '',
              operatoreNome: cancelledAppointment?.operatoreNome ?? '',
              nome: syntheticNome,
              cognome: syntheticCognome,
              email: matchedCustomer?.email ?? '',
              telefono: matchedCustomer?.telefono ?? linkedPhone,
              stato: 'Annullata',
              createdAt: new Date().toISOString(),
              origine: 'backoffice',
              cancellationSource: 'salone',
              viewedBySalon: true,
              viewedByCliente: false,
            },
            ...currentRichieste,
          ]);

      const nextClienti = normalizeClienti(
        currentClienti.map((item) => {
          const sameName = matchesCustomerDisplayName(item.nome, customerNameLower);
          const samePhone = linkedPhone && item.telefono.trim() === linkedPhone;
          if (!sameName && !samePhone) return item;
          return {
            ...item,
            viewedBySalon: false,
          };
        })
      );

      // Aggiorna lo stato locale immediatamente
      if (isCurrentSalonWorkspace) {
        setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        setRichiestePrenotazione(nextRequests);
        setClienti(nextClienti);
      }

      const { error: cancelError } = await cancelRequestPromise;
      const cancelErrorText = [cancelError?.message, cancelError?.details, cancelError?.hint, cancelError?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const isLegacySnapshotOnlyAppointment =
        !shouldPersistRealAppointment ||
        /appointment_not_found|auth_required|workspace_access_denied|jwt|permission|failed to fetch|network|timeout|fetch/i.test(
          cancelErrorText
        );

      if (cancelError && !isLegacySnapshotOnlyAppointment) {
        unmarkRecentlyDeletedAppointment({
          date: appointmentDate,
          time: appointmentTime,
          customerName,
          serviceName,
          operatorId: cancelledAppointment?.operatoreId ?? operatorId,
          operatorName: cancelledAppointment?.operatoreNome ?? operatorName,
        });

        if (isCurrentSalonWorkspace) {
          setAppuntamenti(currentAppuntamenti);
          setRichiestePrenotazione(currentRichieste);
          setClienti(currentClienti);
        }

        console.log('Errore annullamento appointment reale owner:', cancelError);
        return { ok: false, error: 'Non sono riuscito ad annullare l’appuntamento.' };
      }

      // Pubblica lo snapshot aggiornato in background (non-blocking)
      let workspaceId: string | null = salonWorkspace.id;
      try {
        workspaceId = await enqueuePortalPublish({
          workspace: salonWorkspace,
          clienti: nextClienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
          servizi: servizi as unknown as Array<Record<string, unknown>>,
          operatori: operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
          availabilitySettings: availabilitySettings,
        });
      } catch (publishError) {
        console.log('Pubblicazione snapshot annullamento owner non riuscita:', publishError);
      }

      if (isCurrentSalonWorkspace && workspaceId && workspaceId !== salonWorkspace.id) {
        setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
      }

      await processPublicSlotWaitlistAndFlush({
        workspaceId: workspaceId ?? salonWorkspace.id,
        appointmentDate,
        appointmentTime,
      });

      return { ok: true };
    } catch (error) {
      console.log('Errore annullamento appuntamento owner:', error);
      return { ok: false, error: 'Non sono riuscito ad annullare l’appuntamento.' };
    }
  };


  const moveOwnerAppointmentForSalon = async ({
    salonCode,
    appointmentId,
    replacedAppointmentId,
    currentDate,
    currentTime,
    nextDate,
    nextTime,
    customerName,
    serviceName,
  }: {
    salonCode: string;
    appointmentId?: string;
    replacedAppointmentId?: string;
    currentDate: string;
    currentTime: string;
    nextDate: string;
    nextTime: string;
    customerName: string;
    serviceName: string;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const isCurrentSalonWorkspace =
      normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);
    const toErrorText = (value: unknown) => {
      if (!value || typeof value !== 'object') return '';

      const maybeError = value as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join(' ')
        .toLowerCase();
    };

    try {
      const matchesAppointment = (item: Appuntamento) => {
        const sameId = appointmentId && item.id === appointmentId;
        const sameComposite =
          normalizeIdentityText(item.data ?? getTodayDateString()) === normalizeIdentityText(currentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(currentTime) &&
          normalizeIdentityText(item.cliente) === normalizeIdentityText(customerName) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName);
        return !!(sameId || sameComposite);
      };

      const currentWorkspaceData = {
        workspace: salonWorkspace,
        clienti,
        appuntamenti,
        servizi,
        operatori,
        richiestePrenotazione,
        availabilitySettings,
      };

      const resolved = isCurrentSalonWorkspace
        ? currentWorkspaceData
        : await resolveSalonByCode(normalizedCode);

      if (!resolved) {
        return { ok: false, error: 'Salone non trovato.' };
      }

      const appointmentToMove = resolved.appuntamenti.find((item) => matchesAppointment(item));
      if (!appointmentToMove) {
        return { ok: false, error: 'Appuntamento non trovato.' };
      }

      const replacedAppointment = replacedAppointmentId
        ? resolved.appuntamenti.find((item) => item.id === replacedAppointmentId)
        : null;

      const persistMoveWithSession = async () => {
        if (replacedAppointment?.id) {
          return await supabase.rpc('swap_owner_appointments', {
            p_source_appointment_id: appointmentToMove.id,
            p_target_appointment_id: replacedAppointment.id,
          });
        }

        return await supabase.rpc('move_owner_appointment', {
          p_appointment_id: appointmentToMove.id,
          p_next_appointment_date: nextDate,
          p_next_appointment_time: nextTime,
        });
      };

      const ownerSessionResult = await ensureRealtimeOwnerSession();
      if (!ownerSessionResult.ok) {
        return {
          ok: false,
          error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
        };
      }

      let persistMoveResult = await persistMoveWithSession();
      let { error: persistMoveError } = persistMoveResult;
      const persistMoveErrorText = toErrorText(persistMoveError);
      if (persistMoveError && persistMoveErrorText.includes('workspace_access_denied')) {
        const bootstrapResult = await ensureOwnerBackendBootstrap(ownerSessionResult.email);
        if (!bootstrapResult.ok) {
          return {
            ok: false,
            error: 'Workspace backend non allineato. Rientra nel salone e riprova.',
          };
        } else {
          const retryResult = await persistMoveWithSession();
          persistMoveError = retryResult.error;
        }
      }

      if (persistMoveError) {
        const persistedMoveErrorText = toErrorText(persistMoveError);
        if (persistedMoveErrorText.includes('target_slot_occupied')) {
          return { ok: false, error: 'Questo orario non e disponibile.' };
        }
        if (persistedMoveErrorText.includes('appointment_not_found')) {
          return { ok: false, error: 'Appuntamento non trovato.' };
        }
        if (persistedMoveErrorText.includes('workspace_not_found')) {
          return { ok: false, error: 'Workspace salone non trovato.' };
        }
        return { ok: false, error: 'Non sono riuscito a salvare lo spostamento.' };
      }

      const movedAppointment: Appuntamento = {
        ...appointmentToMove,
        data: nextDate,
        ora: nextTime,
      };

      const swappedAppointment = replacedAppointment
        ? {
            ...replacedAppointment,
            data: currentDate,
            ora: currentTime,
          }
        : null;

      const nextAppointments = normalizeAppuntamenti([
        movedAppointment,
        ...(swappedAppointment ? [swappedAppointment] : []),
        ...resolved.appuntamenti
          .filter((item) => !matchesAppointment(item))
          .filter((item) => !(replacedAppointmentId && item.id === replacedAppointmentId))
          .filter((item) => {
            const sameMovedTargetComposite =
              normalizeIdentityText(item.data ?? getTodayDateString()) === normalizeIdentityText(nextDate) &&
              normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(nextTime) &&
              normalizeIdentityText(item.cliente) === normalizeIdentityText(customerName) &&
              normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName);
            const sameSwappedTargetComposite =
              !!swappedAppointment &&
              normalizeIdentityText(item.data ?? getTodayDateString()) === normalizeIdentityText(currentDate) &&
              normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(currentTime) &&
              normalizeIdentityText(item.cliente) === normalizeIdentityText(swappedAppointment.cliente) &&
              normalizeIdentityText(item.servizio) === normalizeIdentityText(swappedAppointment.servizio);
            return !sameMovedTargetComposite && !sameSwappedTargetComposite;
          }),
      ]);

      const buildMoveNote = (
        appointment: Appuntamento,
        fromDate: string,
        fromTime: string,
        toDate: string,
        toTime: string
      ) => {
        const operatorLabel = appointment.operatoreNome?.trim()
          ? ` Operatore: ${appointment.operatoreNome.trim()}.`
          : '';

        return `Il salone ha spostato il tuo appuntamento di ${appointment.servizio} da ${fromDate} alle ${fromTime} a ${toDate} alle ${toTime}.${operatorLabel}`;
      };

      const resolveFrontendMoveTarget = (
        appointment: Appuntamento,
        fromDate: string,
        fromTime: string,
        currentRequests: RichiestaPrenotazione[]
      ) => {
        const syntheticRequestId = `owner-booking-${appointment.id}`;
        const existingSyntheticRequest =
          currentRequests.find((item) => item.id === syntheticRequestId) ?? null;

        const linkedRequest = currentRequests.find((item) => {
          if (existingSyntheticRequest && item.id === existingSyntheticRequest.id) {
            return true;
          }

          const sameCustomerName = matchesCustomerDisplayName(
            `${item.nome} ${item.cognome}`,
            appointment.cliente
          );
          const sameService =
            normalizeIdentityText(item.servizio) === normalizeIdentityText(appointment.servizio);
          const sameDate = normalizeIdentityText(item.data) === normalizeIdentityText(fromDate);
          const sameTime = normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(fromTime);
          return (
            sameCustomerName &&
            sameService &&
            sameDate &&
            sameTime &&
            item.stato !== 'Rifiutata' &&
            item.stato !== 'Annullata'
          );
        });

        const matchedCustomer = resolved.clienti.find((item) => {
          const sameName = matchesCustomerDisplayName(item.nome, appointment.cliente);
          const linkedByRequest =
            !!linkedRequest &&
            ((linkedRequest.email?.trim() &&
              normalizeIdentityText(item.email) === normalizeIdentityText(linkedRequest.email)) ||
              (linkedRequest.telefono?.trim() &&
                normalizePhoneForIdentity(item.telefono) ===
                  normalizePhoneForIdentity(linkedRequest.telefono)));
          return sameName || linkedByRequest;
        });

        return {
          linkedRequest: existingSyntheticRequest ?? linkedRequest,
          matchedCustomer,
          customerEmail:
            existingSyntheticRequest?.email?.trim().toLowerCase() ||
            linkedRequest?.email?.trim().toLowerCase() ||
            matchedCustomer?.email?.trim().toLowerCase() ||
            '',
          customerPhone:
            existingSyntheticRequest?.telefono?.trim() ||
            linkedRequest?.telefono?.trim() ||
            matchedCustomer?.telefono?.trim() ||
            '',
        };
      };

      const upsertMovedClientNotification = (
        currentRequests: RichiestaPrenotazione[],
        appointment: Appuntamento,
        fromDate: string,
        fromTime: string,
        toDate: string,
        toTime: string
      ) : RichiestaPrenotazione[] => {
        const { linkedRequest, matchedCustomer, customerEmail, customerPhone } =
          resolveFrontendMoveTarget(appointment, fromDate, fromTime, currentRequests);

        const syntheticRequestId = `owner-booking-${appointment.id}`;
        const existingSyntheticRequest = currentRequests.find((item) => item.id === syntheticRequestId);
        const customerNameParts = appointment.cliente.trim().split(/\s+/).filter(Boolean);
        const customerFirstName = customerNameParts[0] ?? appointment.cliente.trim();
        const customerLastName = customerNameParts.slice(1).join(' ');
        const shouldNotifyFrontendClient = !!(
          linkedRequest ||
          (matchedCustomer && (matchedCustomer.fonte === 'frontend' || customerEmail || customerPhone))
        );

        if (linkedRequest) {
          return currentRequests.map((item) =>
            item.id !== linkedRequest.id
                ? item
              : {
                  ...item,
                  data: toDate,
                  ora: toTime,
                  servizio: appointment.servizio,
                  prezzo: appointment.prezzo,
                  durataMinuti: appointment.durataMinuti,
                  mestiereRichiesto: appointment.mestiereRichiesto ?? item.mestiereRichiesto,
                  operatoreId: appointment.operatoreId ?? item.operatoreId,
                  operatoreNome: appointment.operatoreNome ?? item.operatoreNome,
                  viewedByCliente: false,
                  viewedBySalon: true,
                  note: buildMoveNote(appointment, fromDate, fromTime, toDate, toTime),
                }
          );
        }

        if (!shouldNotifyFrontendClient) {
          return currentRequests;
        }

        return [
          {
            id: syntheticRequestId,
            data: toDate,
            ora: toTime,
            servizio: appointment.servizio,
            prezzo: appointment.prezzo,
            durataMinuti: appointment.durataMinuti,
            mestiereRichiesto: appointment.mestiereRichiesto ?? '',
            operatoreId: appointment.operatoreId ?? '',
            operatoreNome: appointment.operatoreNome ?? '',
            nome: customerFirstName,
            cognome: customerLastName,
            email: customerEmail,
            telefono: customerPhone,
            instagram: matchedCustomer?.instagram?.trim() ?? '',
            note: buildMoveNote(appointment, fromDate, fromTime, toDate, toTime),
            origine: 'backoffice',
            stato: 'Accettata',
            createdAt: existingSyntheticRequest?.createdAt ?? new Date().toISOString(),
            viewedByCliente: false,
            viewedBySalon: true,
          },
          ...currentRequests.filter((item) => item.id !== syntheticRequestId),
        ];
      };

      const notificationMoves: Array<{
        appointment: Appuntamento;
        fromDate: string;
        fromTime: string;
        toDate: string;
        toTime: string;
      }> = [
        {
          appointment: appointmentToMove,
          fromDate: currentDate,
          fromTime: currentTime,
          toDate: nextDate,
          toTime: nextTime,
        },
        ...(swappedAppointment && replacedAppointment
          ? [
              {
                appointment: replacedAppointment,
                fromDate: nextDate,
                fromTime: nextTime,
                toDate: currentDate,
                toTime: currentTime,
              },
            ]
          : []),
      ];

      const baseMoveRequests = mergeRichiesteCollections(
        isCurrentSalonWorkspace ? richiestePrenotazione : [],
        resolved.richiestePrenotazione
      );

      let requestsWithMoveNotifications: RichiestaPrenotazione[] = baseMoveRequests;
      for (const entry of notificationMoves) {
        requestsWithMoveNotifications = upsertMovedClientNotification(
          requestsWithMoveNotifications,
          entry.appointment,
          entry.fromDate,
          entry.fromTime,
          entry.toDate,
          entry.toTime
        );
      }

      const nextRequests = normalizeRichiestePrenotazione(
        mergeRichiesteCollections(baseMoveRequests, requestsWithMoveNotifications)
      );
      const moveNotificationTargets = notificationMoves.map((entry) => ({
        entry,
        ...resolveFrontendMoveTarget(
          entry.appointment,
          entry.fromDate,
          entry.fromTime,
          nextRequests
        ),
      }));

      markRecentlyMovedAppointmentId(appointmentToMove.id);
      if (replacedAppointment?.id) {
        markRecentlyMovedAppointmentId(replacedAppointment.id);
      }

      if (isCurrentSalonWorkspace) {
        setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        setRichiestePrenotazione(nextRequests);
      }

      let workspaceId: string | null = resolved.workspace.id;
      try {
        workspaceId = await enqueuePortalPublish({
          workspace: resolved.workspace,
          clienti: resolved.clienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
          servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
          operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
          availabilitySettings: resolved.availabilitySettings,
        });
      } catch (publishError) {
        console.log('Pubblicazione snapshot spostamento owner non riuscita:', publishError);
      }

      if (isCurrentSalonWorkspace && workspaceId && workspaceId !== salonWorkspace.id) {
        setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
      }

      const movePushQueue = moveNotificationTargets
        .map(({ entry, customerEmail, customerPhone }) => {
          const linkedRequest = nextRequests.find((item) => {
            const sameCustomerName = matchesCustomerDisplayName(
              `${item.nome} ${item.cognome}`,
              entry.appointment.cliente
            );
            const sameService =
              normalizeIdentityText(item.servizio) === normalizeIdentityText(entry.appointment.servizio);
            const sameDate = normalizeIdentityText(item.data) === normalizeIdentityText(entry.toDate);
            const sameTime = normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(entry.toTime);
            return (
              sameCustomerName &&
              sameService &&
              sameDate &&
              sameTime &&
              item.stato !== 'Rifiutata' &&
              item.stato !== 'Annullata'
            );
          });

          if (!linkedRequest || (!customerEmail && !customerPhone)) {
            return null;
          }

          return queueWorkspacePushNotification({
            workspaceId: workspaceId ?? resolved.workspace.id,
            eventType: 'custom',
            title: 'Appuntamento spostato dal salone',
            body: `Cliente: ${formatPushCustomerName(entry.appointment.cliente)}. Servizio: ${entry.appointment.servizio}. Prima: ${formatPushDateTimeLabel(
              entry.fromDate,
              entry.fromTime
            )}.${
              entry.appointment.mestiereRichiesto?.trim()
                ? ` Mestiere: ${entry.appointment.mestiereRichiesto.trim()}.`
                : ''
            } Nuova data: ${formatPushDateLabel(entry.toDate)}. Nuovo orario: ${entry.toTime}.${
              entry.appointment.operatoreNome?.trim()
                ? ` Operatore: ${entry.appointment.operatoreNome.trim()}.`
                : ''
            }`,
            audience: 'public',
            customerEmail,
            customerPhone,
            payload: {
              type: 'appointment_rescheduled',
              bookingRequestId: linkedRequest.id,
              appointmentId: entry.appointment.id,
              previousDate: entry.fromDate,
              previousTime: entry.fromTime,
              appointmentDate: entry.toDate,
              appointmentTime: entry.toTime,
              customerName: entry.appointment.cliente,
              serviceName: entry.appointment.servizio,
              source: 'owner',
            },
          });
        })
        .filter((item): item is Promise<boolean> => !!item);

      if (movePushQueue.length > 0) {
        await Promise.all(movePushQueue);
        await flushQueuedPushNotifications();
      }

      if (!replacedAppointmentId) {
        await processPublicSlotWaitlistAndFlush({
          workspaceId: workspaceId ?? resolved.workspace.id,
          appointmentDate: currentDate,
          appointmentTime: null,
        });
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore spostamento appointment owner:', error);
      return { ok: false, error: 'Non sono riuscito a spostare l’appuntamento.' };
    }
  };

  const updateBookingRequestStatusForSalon = async ({
    salonCode,
    requestId,
    status,
    ignoreConflicts = false,
  }: {
    salonCode: string;
    requestId: string;
    status: 'Accettata' | 'Rifiutata' | 'Annullata';
    ignoreConflicts?: boolean;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const isCurrentSalonWorkspace =
      normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);

    try {
      const currentWorkspaceData = {
        workspace: salonWorkspace,
        clienti,
        appuntamenti,
        servizi,
        operatori,
        richiestePrenotazione,
        availabilitySettings,
      };

      const resolved = isCurrentSalonWorkspace
        ? currentWorkspaceData
        : await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        return { ok: false, error: 'Salone non trovato.' };
      }

      const requestToUpdate = resolved.richiestePrenotazione.find((item) => item.id === requestId);
      if (!requestToUpdate) {
        return { ok: false, error: 'Richiesta non trovata.' };
      }

      const requestCustomerName = `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim();
      const requestCustomerNameLower = requestCustomerName.toLowerCase();
      const requestedDurationMinutes =
        typeof requestToUpdate.durataMinuti === 'number'
          ? requestToUpdate.durataMinuti
          : getServiceDuration(requestToUpdate.servizio, resolved.servizi);
      const requestedOperatorId = requestToUpdate.operatoreId?.trim() ?? '';
      const requestedOperatorNameKey = requestToUpdate.operatoreNome?.trim().toLowerCase() ?? '';
      const requestedSalonCapacityId = buildSalonCapacityOperatorId(
        requestToUpdate.servizio,
        resolved.servizi
      );
      const useOperatorSchedulingForRequest =
        resolved.operatori.length > 0 &&
        !!(requestedOperatorId || requestedOperatorNameKey) &&
        doesServiceUseOperators(requestToUpdate.servizio, resolved.servizi) &&
        getEligibleOperatorsForService({
          serviceName: requestToUpdate.servizio,
          services: resolved.servizi,
          operators: resolved.operatori,
          appointmentDate: requestToUpdate.data,
          settings: resolved.availabilitySettings,
        }).length > 0;

      if (status === 'Accettata' && !ignoreConflicts) {
        const conflictingAppointment = resolved.appuntamenti.find((item) => {
          const itemDate = item.data ?? getTodayDateString();

          if (itemDate !== requestToUpdate.data) return false;

          const isSameMaterializedRequest =
            normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
            item.servizio.trim().toLowerCase() === requestToUpdate.servizio.trim().toLowerCase() &&
            item.cliente.trim().toLowerCase() === requestCustomerNameLower;

          if (isSameMaterializedRequest) {
            return false;
          }

	          if (useOperatorSchedulingForRequest) {
	            const existingOperatorId = item.operatoreId?.trim() ?? '';
	            const existingOperatorNameKey = item.operatoreNome?.trim().toLowerCase() ?? '';
	            const existingHasExplicitOperator = !!(existingOperatorId || existingOperatorNameKey);
	            const existingUsesOperatorScheduling =
	              resolved.operatori.length > 0 &&
	              doesServiceUseOperators(item.servizio, resolved.servizi);
	            const matchesRequestedOperator =
	              (existingOperatorId && requestedOperatorId && existingOperatorId === requestedOperatorId) ||
	              (existingOperatorNameKey &&
	                requestedOperatorNameKey &&
	                existingOperatorNameKey === requestedOperatorNameKey);

	            if (existingHasExplicitOperator && !matchesRequestedOperator) {
	              return false;
	            }

	            if (!existingHasExplicitOperator) {
	              if (existingUsesOperatorScheduling) {
	                return false;
	              }

	              const existingSalonCapacityId =
	                item.operatoreId?.trim() || buildSalonCapacityOperatorId(item.servizio, resolved.servizi);

	              if (
	                requestedSalonCapacityId &&
	                existingSalonCapacityId &&
	                requestedSalonCapacityId !== existingSalonCapacityId
	              ) {
	                return false;
	              }
	            }
	          } else {
            const existingUsesOperatorScheduling =
              resolved.operatori.length > 0 &&
              doesServiceUseOperators(item.servizio, resolved.servizi) &&
              !!((item.operatoreId?.trim() ?? '') || (item.operatoreNome?.trim() ?? ''));

            if (existingUsesOperatorScheduling) {
              return false;
            }

            if (!existingUsesOperatorScheduling) {
              const existingSalonCapacityId =
                item.operatoreId?.trim() || buildSalonCapacityOperatorId(item.servizio, resolved.servizi);

              if (
                requestedSalonCapacityId &&
                existingSalonCapacityId &&
                requestedSalonCapacityId !== existingSalonCapacityId
              ) {
                return false;
              }
            }
          }

          return doesTimeRangeConflictWithAppointment({
            startTime: requestToUpdate.ora,
            durationMinutes: requestedDurationMinutes,
            appointment: item,
            services: resolved.servizi,
            settings: resolved.availabilitySettings,
          });
        });

        if (conflictingAppointment) {
          return {
            ok: false,
            error: `Questa richiesta si accavalla con ${conflictingAppointment.cliente} alle ${conflictingAppointment.ora}.`,
          };
        }
      }

      if (
        status === 'Accettata' &&
        useOperatorSchedulingForRequest &&
        isUuid(requestId) &&
        isUuidValue(resolved.workspace.id)
      ) {
        const resolvedLegacyAssignments = assignFallbackOperatorsToAppointments({
          appointments: resolved.appuntamenti,
          services: resolved.servizi,
          operators: resolved.operatori,
          settings: resolved.availabilitySettings,
          preserveExplicitOperatorAssignments: true,
        });

        const legacyAnonymousConflicts = resolved.appuntamenti.filter((item) => {
          const existingOperatorId = item.operatoreId?.trim() ?? '';
          const existingOperatorName = item.operatoreNome?.trim().toLowerCase() ?? '';
          if (existingOperatorId || existingOperatorName) {
            return false;
          }
          if (!isUuidValue(item.id)) {
            return false;
          }
          const itemDate = item.data ?? getTodayDateString();
          if (itemDate !== requestToUpdate.data) {
            return false;
          }
          if (!doesServiceUseOperators(item.servizio, resolved.servizi)) {
            return false;
          }

          return doesTimeRangeConflictWithAppointment({
            startTime: requestToUpdate.ora,
            durationMinutes: requestedDurationMinutes,
            appointment: item,
            services: resolved.servizi,
            settings: resolved.availabilitySettings,
          });
        });

        const targetedLegacyAssignments = legacyAnonymousConflicts
          .map((item) => {
            const resolvedItem = resolvedLegacyAssignments.find(
              (candidate) => candidate.id === item.id
            );
            const resolvedOperatorId = resolvedItem?.operatoreId?.trim() ?? '';
            const resolvedOperatorName = resolvedItem?.operatoreNome?.trim() ?? '';
            const resolvedOperatorNameKey = resolvedOperatorName.toLowerCase();
            const matchesRequestedOperator =
              (resolvedOperatorId && requestedOperatorId && resolvedOperatorId === requestedOperatorId) ||
              (resolvedOperatorNameKey &&
                requestedOperatorNameKey &&
                resolvedOperatorNameKey === requestedOperatorNameKey);

            if (!resolvedOperatorId && !resolvedOperatorName) {
              return null;
            }

            if (matchesRequestedOperator) {
              return null;
            }

            return {
              appointmentId: item.id,
              operatorId: resolvedOperatorId || null,
              operatorName: resolvedOperatorName || null,
            };
          })
          .filter(
            (
              item
            ): item is { appointmentId: string; operatorId: string | null; operatorName: string | null } =>
              !!item
          );

        if (targetedLegacyAssignments.length > 0) {
          const assignmentResults = await Promise.all(
            targetedLegacyAssignments.map(async (item) => {
              const { error } = await supabase
                .from('appointments')
                .update({
                  operator_id: item.operatorId,
                  operator_name: item.operatorName,
                })
                .eq('id', item.appointmentId)
                .eq('workspace_id', resolved.workspace.id);

              if (error) {
                console.log('Errore assegnazione legacy puntuale prima di accettare richiesta:', error);
              }

              return { appointmentId: item.appointmentId, ok: !error };
            })
          );

          const successfulIds = new Set(
            assignmentResults.filter((item) => item.ok).map((item) => item.appointmentId)
          );

          if (successfulIds.size > 0 && isCurrentSalonWorkspace) {
            setAppuntamenti((current) =>
              normalizeAppuntamenti(
                current.map((item) => {
                  if (!successfulIds.has(item.id)) {
                    return item;
                  }

                  const assignment = targetedLegacyAssignments.find(
                    (candidate) => candidate.appointmentId === item.id
                  );
                  if (!assignment) {
                    return item;
                  }

                  return {
                    ...item,
                    operatoreId: assignment.operatorId ?? '',
                    operatoreNome: assignment.operatorName ?? '',
                  };
                })
              )
            );
          }
        }
      }

      const dbStatus = normalizeBookingRequestDbStatus(status);
      if (!dbStatus) {
        return {
          ok: false,
          error: 'Stato richiesta non valido. Riapri la richiesta e riprova.',
        };
      }
      const shouldPersistRealStatus = isUuid(requestId);
      let updateData: Record<string, unknown> | null = null;
      let updateError: { message?: string; details?: string; hint?: string } | null = null;
      let updateErrorText = '';
      let updateErrorContext = '';
      let ownerSessionEmailForRequestStatus = '';

      if (shouldPersistRealStatus) {
        const ownerSessionResult = await ensureRealtimeOwnerSession();
        if (!ownerSessionResult.ok) {
          return {
            ok: false,
            error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
          };
        }

        ownerSessionEmailForRequestStatus = ownerSessionResult.email;
        let persistedCustomerIdFromAccept: string | null = null;
        let persistedAppointmentIdFromAccept: string | null = null;

        if (status === 'Accettata') {
          type ExistingAppointmentLinkRow = {
            id?: string | null;
            customer_id?: string | null;
            operator_id?: string | null;
            operator_name?: string | null;
            booking_request_id?: string | null;
          };
          let existingAppointments: ExistingAppointmentLinkRow[] = [];

          const { data: requestLinkedAppointments, error: requestLinkedAppointmentsError } = await supabase
            .from('appointments')
            .select('id, customer_id, operator_id, operator_name, booking_request_id')
            .eq('workspace_id', resolved.workspace.id)
            .eq('booking_request_id', requestId)
            .limit(1);

          if (requestLinkedAppointmentsError) {
            updateErrorContext = 'find_existing_request_link';
            updateError = requestLinkedAppointmentsError;
          } else {
            const alreadyLinkedAppointment =
              (requestLinkedAppointments ?? []).find((item) => String(item.id ?? '').trim()) ?? null;

            if (alreadyLinkedAppointment) {
              persistedAppointmentIdFromAccept =
                String(alreadyLinkedAppointment.id ?? '').trim() || null;
              persistedCustomerIdFromAccept =
                String(alreadyLinkedAppointment.customer_id ?? '').trim() || null;
            }
          }

          if (!updateError && !persistedAppointmentIdFromAccept) {
            const { data: existingAppointmentsData, error: existingAppointmentsError } = await supabase
              .from('appointments')
              .select('id, customer_id, operator_id, operator_name, booking_request_id')
              .eq('workspace_id', resolved.workspace.id)
              .eq('appointment_date', requestToUpdate.data)
              .eq('appointment_time', requestToUpdate.ora);

            if (existingAppointmentsError) {
              updateErrorContext = 'find_existing_same_slot_appointments';
              updateError = existingAppointmentsError;
            } else {
              existingAppointments = (existingAppointmentsData ?? []) as ExistingAppointmentLinkRow[];

              const matchingExistingAppointment =
                existingAppointments.find((item) => {
                  const appointmentId = String(item.id ?? '').trim();
                  const bookingRequestId = String(item.booking_request_id ?? '').trim();
                  return !!appointmentId && bookingRequestId === requestId;
                }) ?? null;

              if (matchingExistingAppointment) {
                persistedAppointmentIdFromAccept =
                  String(matchingExistingAppointment.id ?? '').trim() || null;
                persistedCustomerIdFromAccept =
                  String(matchingExistingAppointment.customer_id ?? '').trim() || null;
              } else {
                const { data: createdAppointment, error: createAppointmentError } = await supabase.rpc(
                  'create_owner_appointment',
                  {
                    p_salon_code: normalizedCode,
                    p_customer_name: requestCustomerName,
                    p_customer_phone: requestToUpdate.telefono?.trim() || null,
                    p_customer_email: requestToUpdate.email?.trim().toLowerCase() || null,
                    p_customer_instagram: requestToUpdate.instagram?.trim() || null,
                    p_customer_note: requestToUpdate.note?.trim() || null,
                    p_customer_source: requestToUpdate.origine === 'frontend' ? 'frontend' : 'salon',
                    p_create_customer_record: true,
                    p_service_name: requestToUpdate.servizio.trim(),
                    p_price: requestToUpdate.prezzo,
                    p_duration_minutes: requestedDurationMinutes,
                    p_appointment_date: requestToUpdate.data,
                    p_appointment_time: requestToUpdate.ora,
                    p_operator_id: requestToUpdate.operatoreId?.trim() || null,
                    p_operator_name: requestToUpdate.operatoreNome?.trim() || null,
                  }
                );

                if (createAppointmentError) {
                  updateErrorContext = 'create_owner_appointment';
                  updateError = createAppointmentError;
                } else {
                  const createdPayload =
                    createdAppointment && typeof createdAppointment === 'object' && !Array.isArray(createdAppointment)
                      ? (createdAppointment as Record<string, unknown>)
                      : Array.isArray(createdAppointment) &&
                          createdAppointment[0] &&
                          typeof createdAppointment[0] === 'object'
                        ? (createdAppointment[0] as Record<string, unknown>)
                        : null;

                  persistedAppointmentIdFromAccept =
                    typeof createdPayload?.appointmentId === 'string' && createdPayload.appointmentId.trim()
                      ? createdPayload.appointmentId
                      : null;
                  persistedCustomerIdFromAccept =
                    typeof createdPayload?.customerId === 'string' && createdPayload.customerId.trim()
                      ? createdPayload.customerId
                      : null;
                }
              }
            }
          }

          if (!updateError && persistedAppointmentIdFromAccept) {
            const alreadyLinkedElsewhere =
              existingAppointments.find((item) => {
                const appointmentId = String(item.id ?? '').trim();
                const bookingRequestId = String(item.booking_request_id ?? '').trim();
                return (
                  bookingRequestId === requestId &&
                  appointmentId &&
                  appointmentId !== persistedAppointmentIdFromAccept
                );
              }) ?? null;

            if (alreadyLinkedElsewhere) {
              persistedAppointmentIdFromAccept =
                String(alreadyLinkedElsewhere.id ?? '').trim() || persistedAppointmentIdFromAccept;
              persistedCustomerIdFromAccept =
                String(alreadyLinkedElsewhere.customer_id ?? '').trim() || persistedCustomerIdFromAccept;
            } else {
              const { error: linkAppointmentError } = await supabase
                .from('appointments')
                .update({
                  booking_request_id: requestId,
                  operator_id: requestToUpdate.operatoreId?.trim() || null,
                  operator_name: requestToUpdate.operatoreNome?.trim() || null,
                })
                .eq('id', persistedAppointmentIdFromAccept)
                .eq('workspace_id', resolved.workspace.id);

              if (linkAppointmentError) {
                updateErrorContext = 'link_appointment_to_request';
                updateError = linkAppointmentError;
              }
            }
          }
        }

        if (!updateError) {
          const actionRpcName =
            status === 'Accettata'
              ? 'accept_owner_booking_request_atomic_v2'
              : 'update_owner_booking_request_status_v2';
          const actionRpcPayload =
            status === 'Accettata'
              ? {
                  p_owner_email: resolved.workspace.ownerEmail || ownerSessionEmailForRequestStatus,
                  p_salon_code: normalizedCode,
                  p_request_id: requestId,
                  p_customer_id: persistedCustomerIdFromAccept,
                  p_appointment_id: persistedAppointmentIdFromAccept,
                }
              : {
                  p_request_id: requestId,
                  p_status: dbStatus,
                };

          const { data: persistedStatusUpdate, error: persistedStatusUpdateError } = await supabase.rpc(
            actionRpcName,
            actionRpcPayload
          );

          if (persistedStatusUpdateError) {
            updateErrorContext = actionRpcName;
            updateError = persistedStatusUpdateError;
          } else {
            const persistedPayload =
              persistedStatusUpdate &&
              typeof persistedStatusUpdate === 'object' &&
              !Array.isArray(persistedStatusUpdate)
                ? (persistedStatusUpdate as Record<string, unknown>)
                : Array.isArray(persistedStatusUpdate) &&
                    persistedStatusUpdate[0] &&
                    typeof persistedStatusUpdate[0] === 'object'
                  ? (persistedStatusUpdate[0] as Record<string, unknown>)
                  : null;

            updateData = {
              appointmentId:
                typeof persistedPayload?.appointmentId === 'string' &&
                persistedPayload.appointmentId.trim()
                  ? persistedPayload.appointmentId
                  : persistedAppointmentIdFromAccept,
              customerId:
                typeof persistedPayload?.customerId === 'string' &&
                persistedPayload.customerId.trim()
                  ? persistedPayload.customerId
                  : persistedCustomerIdFromAccept,
              workspaceId: resolved.workspace.id,
            };
          }
        }

        updateErrorText = [updateError?.message, updateError?.details, updateError?.hint]
          .filter(Boolean)
          .join(' ');
      }
      const isLegacySnapshotOnlyRequest =
        !shouldPersistRealStatus ||
        /booking_request_not_found/i.test(updateErrorText);

      if (updateError && !isLegacySnapshotOnlyRequest) {
        console.log('Errore aggiornamento booking_request reale:', updateError);
        if (/booking_request_conflict/i.test(updateErrorText)) {
          return {
            ok: false,
            error:
              'Questa richiesta si accavalla con un appuntamento gia presente in quello stesso orario. Se il blocco esistente non ha operatore assegnato, viene considerato occupazione globale.',
          };
        }
        if (/workspace_not_found/i.test(updateErrorText)) {
          return { ok: false, error: 'Workspace del salone non trovato. Ricarica il salone e riprova.' };
        }
        return {
          ok: false,
          error:
            `${updateErrorContext ? `[${updateErrorContext}] ` : ''}${updateErrorText.trim() || 'Non sono riuscito ad aggiornare lo stato della richiesta.'}`,
        };
      }

      if (status === 'Annullata') {
        markRecentlyDeletedAppointment({
          date: requestToUpdate.data,
          time: requestToUpdate.ora,
          customerName: requestCustomerName,
          serviceName: requestToUpdate.servizio,
          operatorId: requestToUpdate.operatoreId,
          operatorName: requestToUpdate.operatoreNome,
        });
      } else if (status === 'Accettata') {
        unmarkRecentlyDeletedAppointment({
          date: requestToUpdate.data,
          time: requestToUpdate.ora,
          customerName: requestCustomerName,
          serviceName: requestToUpdate.servizio,
          operatorId: requestToUpdate.operatoreId,
          operatorName: requestToUpdate.operatoreNome,
        });
      }

      const updatePayload =
        updateData && typeof updateData === 'object' && !Array.isArray(updateData)
          ? (updateData as Record<string, unknown>)
          : Array.isArray(updateData) && updateData[0] && typeof updateData[0] === 'object'
            ? (updateData[0] as Record<string, unknown>)
            : null;
      const persistedCustomerId =
        typeof updatePayload?.customerId === 'string' && updatePayload.customerId.trim()
          ? updatePayload.customerId
          : null;
      const persistedAppointmentId =
        typeof updatePayload?.appointmentId === 'string' && updatePayload.appointmentId.trim()
          ? updatePayload.appointmentId
          : null;

      const nextRequests = normalizeRichiestePrenotazione(
        resolved.richiestePrenotazione.map((item) =>
          item.id === requestId
            ? {
                ...item,
                stato: status,
                viewedByCliente: false,
                viewedBySalon: true,
                cancellationSource:
                  status === 'Annullata'
                    ? 'salone'
                    : status === 'Rifiutata'
                      ? undefined
                      : item.cancellationSource,
              }
            : item
        )
      );

      const nextCustomers =
        status === 'Accettata'
          ? normalizeClienti(
              (() => {
                const nomeCompleto = `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim();
                const clienteEsistente = resolved.clienti.find(
                  (item) =>
                    item.telefono.trim() === requestToUpdate.telefono.trim() ||
                    matchesCustomerDisplayName(item.nome, nomeCompleto)
                );

                if (clienteEsistente) {
                  return resolved.clienti.map((item) =>
                    item.id === clienteEsistente.id
                      ? {
                          ...item,
                          id: persistedCustomerId ?? item.id,
                          nome: nomeCompleto,
                          telefono: requestToUpdate.telefono,
                          email: requestToUpdate.email || item.email,
                          instagram: requestToUpdate.instagram || item.instagram,
                          nota: requestToUpdate.note?.trim() || item.nota,
                        }
                      : item
                  );
                }

                return [
                  {
                    id: persistedCustomerId ?? `cliente-${Date.now()}`,
                    nome: nomeCompleto,
                    telefono: requestToUpdate.telefono,
                    email: requestToUpdate.email,
                    instagram: requestToUpdate.instagram ?? '',
                    nota: requestToUpdate.note ?? '',
                  },
                  ...resolved.clienti,
                ];
              })()
            )
          : status === 'Annullata'
            ? normalizeClienti(
                resolved.clienti.map((item) => {
                  const nomeCompleto = `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim();
                  const samePhone =
                    requestToUpdate.telefono?.trim() &&
                    item.telefono.trim() === requestToUpdate.telefono.trim();
                  const sameName = matchesCustomerDisplayName(item.nome, nomeCompleto);
                  if (!samePhone && !sameName) return item;
                  return item;
                })
              )
            : resolved.clienti;

      const nextAppointments =
        status === 'Accettata'
          ? normalizeAppuntamenti(
              resolved.appuntamenti.some((item) => {
                const itemDate = normalizeIdentityText(item.data ?? getTodayDateString());
                return (
                  itemDate === normalizeIdentityText(requestToUpdate.data) &&
                  normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
                  normalizeIdentityText(item.servizio) === normalizeIdentityText(requestToUpdate.servizio) &&
                  normalizeIdentityText(item.cliente) === requestCustomerNameLower
                );
              })
                ? resolved.appuntamenti
                : [
                    {
                      id:
                        persistedAppointmentId ??
                        (shouldPersistRealStatus ? requestId : `app-${Date.now()}`),
                      data: requestToUpdate.data,
                      ora: requestToUpdate.ora,
                      cliente: requestCustomerName,
                      servizio: requestToUpdate.servizio,
                      prezzo: requestToUpdate.prezzo,
                      durataMinuti: requestToUpdate.durataMinuti,
                      operatoreId: requestToUpdate.operatoreId,
                      operatoreNome: requestToUpdate.operatoreNome,
                      incassato: false,
                      completato: false,
                    },
                    ...resolved.appuntamenti,
                  ]
            )
          : status === 'Annullata'
            ? normalizeAppuntamenti(
                resolved.appuntamenti.filter((item) => {
                  const itemDate = normalizeIdentityText(item.data ?? getTodayDateString());

                  return !(
                    itemDate === normalizeIdentityText(requestToUpdate.data) &&
                    normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
                    normalizeIdentityText(item.servizio) ===
                      normalizeIdentityText(requestToUpdate.servizio) &&
                    normalizeIdentityText(item.cliente) === requestCustomerNameLower
                  );
                })
              )
          : resolved.appuntamenti;

      // Aggiorna React state IMMEDIATAMENTE (ottimistico), prima del publish
      if (isCurrentSalonWorkspace) {
        setRichiestePrenotazione(nextRequests);
        if (status === 'Accettata' || status === 'Annullata') {
          setClienti(nextCustomers);
          setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        }
      }

      let workspaceId: string | null = resolved.workspace.id;

      try {
        workspaceId = await enqueuePortalPublish({
          workspace: resolved.workspace,
          clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
          appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
          servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
          operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
          availabilitySettings: resolved.availabilitySettings,
        });
      } catch (publishError) {
        console.log('Pubblicazione snapshot update booking_request non riuscita, continuo in modalita ottimistica:', publishError);
      }

      if (isCurrentSalonWorkspace && workspaceId && workspaceId !== salonWorkspace.id) {
        setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
      }

      const notificationCustomer =
        nextCustomers.find((item) => {
          const samePhone =
            requestToUpdate.telefono?.trim() &&
            item.telefono.trim() === requestToUpdate.telefono.trim();
          const sameName = matchesCustomerDisplayName(
            item.nome,
            `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim()
          );
          return !!samePhone || sameName;
        }) ?? null;
      const notificationCustomerEmail =
        requestToUpdate.email?.trim().toLowerCase() ??
        notificationCustomer?.email?.trim().toLowerCase() ??
        '';
      const notificationCustomerPhone =
        requestToUpdate.telefono?.trim() ?? notificationCustomer?.telefono?.trim() ?? '';

      const pushPromise =
        status === 'Rifiutata'
          ? (() => {
            const notificationCopy = buildBookingRequestStatusPushCopy({
              status,
              serviceName: requestToUpdate.servizio,
              roleName: requestToUpdate.mestiereRichiesto,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              operatorName: requestToUpdate.operatoreNome,
              customerName: requestCustomerName,
            });
            return queueWorkspacePushNotification({
            workspaceId: workspaceId ?? resolved.workspace.id,
            eventType: 'booking_request_status_changed',
            title: notificationCopy.title,
            body: notificationCopy.body,
            audience: 'public',
            customerEmail: notificationCustomerEmail,
            customerPhone: notificationCustomerPhone,
            payload: {
              type: 'booking_request_status_changed',
              bookingRequestId: requestId,
              status: notificationCopy.statusLabel,
              statusCode: dbStatus,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              customerName: requestCustomerName,
              serviceName: requestToUpdate.servizio,
              operatorName: requestToUpdate.operatoreNome?.trim() ?? '',
            },
            });
          })()
          : status === 'Accettata'
          ? (() => {
            const notificationCopy = buildBookingRequestStatusPushCopy({
              status,
              serviceName: requestToUpdate.servizio,
              roleName: requestToUpdate.mestiereRichiesto,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              operatorName: requestToUpdate.operatoreNome,
              customerName: requestCustomerName,
            });
            return queueWorkspacePushNotification({
              workspaceId: workspaceId ?? resolved.workspace.id,
              eventType: 'booking_request_status_changed',
              title: notificationCopy.title,
              body: notificationCopy.body,
              audience: 'public',
              customerEmail: notificationCustomerEmail,
              customerPhone: notificationCustomerPhone,
              payload: {
                type: 'booking_request_status_changed',
                bookingRequestId: requestId,
                status: notificationCopy.statusLabel,
                statusCode: dbStatus,
                appointmentDate: requestToUpdate.data,
                appointmentTime: requestToUpdate.ora,
                customerName: requestCustomerName,
                serviceName: requestToUpdate.servizio,
                operatorName: requestToUpdate.operatoreNome?.trim() ?? '',
              },
            });
          })()
          : status === 'Annullata'
          ? (() => {
            const notificationCopy = buildBookingRequestStatusPushCopy({
              status,
              serviceName: requestToUpdate.servizio,
              roleName: requestToUpdate.mestiereRichiesto,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              operatorName: requestToUpdate.operatoreNome,
              customerName: requestCustomerName,
            });
            return queueWorkspacePushNotification({
              workspaceId: workspaceId ?? resolved.workspace.id,
              eventType: 'booking_request_status_changed',
              title: notificationCopy.title,
              body: notificationCopy.body,
              audience: 'public',
              customerEmail: notificationCustomerEmail,
              customerPhone: notificationCustomerPhone,
              payload: {
                type: 'booking_request_status_changed',
                bookingRequestId: requestId,
                status: notificationCopy.statusLabel,
                statusCode: dbStatus,
                appointmentDate: requestToUpdate.data,
                appointmentTime: requestToUpdate.ora,
                customerName: requestCustomerName,
                serviceName: requestToUpdate.servizio,
                operatorName: requestToUpdate.operatoreNome?.trim() ?? '',
              },
            });
          })()
          : Promise.resolve(false);

      if (status === 'Rifiutata' || status === 'Accettata' || status === 'Annullata') {
        void pushPromise.then(() => flushQueuedPushNotifications());
      }

      if (status === 'Annullata' || status === 'Rifiutata') {
        await processPublicSlotWaitlistAndFlush({
          workspaceId: workspaceId ?? resolved.workspace.id,
          appointmentDate: requestToUpdate.data,
          appointmentTime: requestToUpdate.ora,
        });
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore persistenza stato richiesta:', error);
      return { ok: false, error: 'Non sono riuscito a salvare lo stato della richiesta.' };
    }
  };

  const workspaceAccessAllowed = isWorkspaceAccessible(salonWorkspace);

  return (
    <AppContext.Provider
      value={{
        appLanguage,
        setAppLanguage,
        isAuthenticated,
        ownerPasswordRecoveryActive,
        biometricEnabled,
        setBiometricEnabled,
        biometricAvailable,
        biometricType,
        toggleBiometricEnabled,
        authenticateBiometricIdentity,
        hasCompletedOnboarding,
        showOnboarding,
        completeOnboarding,
        reopenOnboarding,
        unlockOwnerAccountWithBiometric,
        loginOwnerAccount,
        registerOwnerAccount,
        requestOwnerPasswordReset,
        activateOwnerPasswordRecoveryFromUrl,
        completeOwnerPasswordRecovery,
        logoutOwnerAccount,
        consumePendingBiometricUnlock,
        salonAccountEmail,
        switchSalonAccount,
        salonWorkspace,
        setSalonWorkspace,
        updateSalonWorkspacePersisted,
        updateAvailabilitySettingsPersisted,
        updateGuidedSlotsSettingsPersisted,
        workspaceAccessAllowed,
        clienti,
        setClienti,
        updateClientePersisted,
        deleteClientePersisted,
        appuntamenti,
        setAppuntamenti,
        movimenti,
        setMovimenti,
        servizi,
        setServizi,
        operatori,
        setOperatori,
        macchinari,
        setMacchinari,
        carteCollegate,
        setCarteCollegate,
        eventi,
        setEventi,
        richiestePrenotazione,
        setRichiestePrenotazione,
        availabilitySettings,
        setAvailabilitySettings,
        messaggioEventoTemplate,
        setMessaggioEventoTemplate,
        serviceCardColorOverrides,
        setServiceCardColorOverrides,
        roleCardColorOverrides,
        setRoleCardColorOverrides,
        resolveSalonByCode,
        upsertFrontendCustomerForSalon,
        addBookingRequestForSalon,
        createOwnerAppointmentForSalon,
        markClientRequestsViewedForSalon,
        cancelClientAppointmentForSalon,
        cancelOwnerAppointmentForSalon,
        moveOwnerAppointmentForSalon,
        updateBookingRequestStatusForSalon,
        isLoaded,
        hasInitializedAuth,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext deve essere usato dentro AppProvider');
  }

  return context;
}
