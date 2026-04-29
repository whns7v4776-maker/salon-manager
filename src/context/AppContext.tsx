import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import type { PostgrestError } from '@supabase/supabase-js';
import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
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
import { fetchClientPortalSnapshot, publishClientPortalSnapshot } from '../lib/client-portal';
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
  workspace_cash_section_disabled: 'salon_manager_workspace_cash_section_disabled',
  workspace_auto_accept_booking_requests: 'salon_manager_workspace_auto_accept_booking_requests',
  workspace_auto_accept_booking_requests_updated_at:
    'salon_manager_workspace_auto_accept_booking_requests_updated_at',
  workspace_customer_reminder_hours_before:
    'salon_manager_workspace_customer_reminder_hours_before',
  onboarding_first_access_pending: 'salon_manager_onboarding_first_access_pending',
  clienti: 'salon_manager_clienti',
  appuntamenti: 'salon_manager_appuntamenti',
  movimenti: 'salon_manager_movimenti',
  servizi: 'salon_manager_servizi',
  carte: 'salon_manager_carte',
  eventi: 'salon_manager_eventi',
  eventi_template: 'salon_manager_eventi_template',
  richieste_prenotazione: 'salon_manager_richieste_prenotazione',
  recently_deleted_appointments: 'salon_manager_recently_deleted_appointments',
  availability_settings: 'salon_manager_availability_settings',
  operatori: 'salon_manager_operatori',
  macchinari: 'salon_manager_macchinari',
  onboarding_completed: 'salon_manager_onboarding_completed',
  daily_auto_cashout: 'salon_manager_daily_auto_cashout',
  service_card_color_overrides: 'salon_manager_service_card_color_overrides',
  role_card_color_overrides: 'salon_manager_role_card_color_overrides',
};

const ONE_OFF_OWNER_ACCOUNT_CLEANUP_EMAIL = 'marziomus@gmail.com';
const ONE_OFF_OWNER_ACCOUNT_CLEANUP_DONE_KEY =
  'salon_manager_owner_cleanup_done__marziomus_gmail_20260429_v1';

let devFallbackClientiAfterRefreshCount = 0;
const RECENTLY_DELETED_APPOINTMENT_GUARD_MS = 600000;
const RECENTLY_CREATED_APPOINTMENT_GUARD_MS = 30000;
const RECENTLY_DELETED_CUSTOMER_GUARD_MS = 600000;
const DEADLOCK_ERROR_CODE = '40P01';
const DEADLOCK_RETRY_DELAYS_MS = [120, 300, 700];
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';

const normalizeAccountEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizeIdentityText = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const pickNonEmptyWorkspaceValue = (preferred?: string | null, fallback?: string | null) =>
  preferred?.trim() ? preferred : fallback?.trim() ?? '';
const parseWorkspaceTimestamp = (value?: string | null) => {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const preferLocalWorkspaceValue = ({
  localHasExplicitValue,
  remoteHasExplicitValue,
  localTimestamp,
  remoteTimestamp,
}: {
  localHasExplicitValue: boolean;
  remoteHasExplicitValue: boolean;
  localTimestamp: number;
  remoteTimestamp: number;
}) => {
  if (localHasExplicitValue && !remoteHasExplicitValue) return true;
  if (!localHasExplicitValue && remoteHasExplicitValue) return false;
  if (!localHasExplicitValue && !remoteHasExplicitValue) return true;

  if (Number.isFinite(localTimestamp) && Number.isFinite(remoteTimestamp)) {
    return localTimestamp >= remoteTimestamp;
  }

  if (Number.isFinite(localTimestamp)) return true;
  if (Number.isFinite(remoteTimestamp)) return false;

  return true;
};

const mergeWorkspacePreservingLocalProfile = ({
  localWorkspace,
  remoteWorkspace,
  email,
}: {
  localWorkspace: Partial<SalonWorkspace> | null | undefined;
  remoteWorkspace: Partial<SalonWorkspace> | null | undefined;
  email: string;
}) => {
  const normalizedEmail = normalizeAccountEmail(email);
  const local = normalizeWorkspace(localWorkspace, normalizedEmail);
  const remote = normalizeWorkspace(
    remoteWorkspace,
    normalizeAccountEmail(remoteWorkspace?.ownerEmail ?? normalizedEmail) || normalizedEmail
  );
  const localWorkspaceUpdatedAt = parseWorkspaceTimestamp(localWorkspace?.updatedAt ?? local.updatedAt);
  const remoteWorkspaceUpdatedAt = parseWorkspaceTimestamp(
    remoteWorkspace?.updatedAt ?? remote.updatedAt
  );
  const localAutoAcceptUpdatedAt = parseWorkspaceTimestamp(
    localWorkspace?.autoAcceptBookingRequestsUpdatedAt ?? local.autoAcceptBookingRequestsUpdatedAt
  );
  const remoteAutoAcceptUpdatedAt = parseWorkspaceTimestamp(
    remoteWorkspace?.autoAcceptBookingRequestsUpdatedAt ?? remote.autoAcceptBookingRequestsUpdatedAt
  );
  const preferLocalCashSectionDisabled = preferLocalWorkspaceValue({
    localHasExplicitValue: typeof localWorkspace?.cashSectionDisabled === 'boolean',
    remoteHasExplicitValue: typeof remoteWorkspace?.cashSectionDisabled === 'boolean',
    localTimestamp: localWorkspaceUpdatedAt,
    remoteTimestamp: remoteWorkspaceUpdatedAt,
  });
  const shouldForceLocalCashSectionDisabled =
    typeof localWorkspace?.cashSectionDisabled === 'boolean';
  const preferLocalAutoAccept = preferLocalWorkspaceValue({
    localHasExplicitValue: typeof localWorkspace?.autoAcceptBookingRequests === 'boolean',
    remoteHasExplicitValue: typeof remoteWorkspace?.autoAcceptBookingRequests === 'boolean',
    localTimestamp: Number.isFinite(localAutoAcceptUpdatedAt)
      ? localAutoAcceptUpdatedAt
      : localWorkspaceUpdatedAt,
    remoteTimestamp: Number.isFinite(remoteAutoAcceptUpdatedAt)
      ? remoteAutoAcceptUpdatedAt
      : remoteWorkspaceUpdatedAt,
  });
  const preferLocalCustomerReminder = preferLocalWorkspaceValue({
    localHasExplicitValue:
      typeof localWorkspace?.customerReminderHoursBefore === 'number' ||
      (typeof localWorkspace?.customerReminderHoursBefore === 'string' &&
        String(localWorkspace.customerReminderHoursBefore).trim() !== ''),
    remoteHasExplicitValue:
      typeof remoteWorkspace?.customerReminderHoursBefore === 'number' ||
      (typeof remoteWorkspace?.customerReminderHoursBefore === 'string' &&
        String(remoteWorkspace.customerReminderHoursBefore).trim() !== ''),
    localTimestamp: localWorkspaceUpdatedAt,
    remoteTimestamp: remoteWorkspaceUpdatedAt,
  });

  return normalizeWorkspace(
    {
      ...local,
      id: remote.id || local.id,
      ownerEmail: normalizeAccountEmail(remote.ownerEmail || local.ownerEmail || normalizedEmail),
      salonCode: normalizeSalonCode(remote.salonCode || local.salonCode),
      salonName: pickNonEmptyWorkspaceValue(remote.salonName, local.salonName),
      salonNameDisplayStyle:
        local.salonNameDisplayStyle !== 'corsivo' && remote.salonNameDisplayStyle === 'corsivo'
          ? local.salonNameDisplayStyle
          : remote.salonNameDisplayStyle,
      salonNameFontVariant:
        local.salonNameFontVariant !== 'neon' && remote.salonNameFontVariant === 'neon'
          ? local.salonNameFontVariant
          : remote.salonNameFontVariant,
      businessPhone: pickNonEmptyWorkspaceValue(remote.businessPhone, local.businessPhone),
      activityCategory: pickNonEmptyWorkspaceValue(
        remote.activityCategory,
        local.activityCategory
      ),
      streetType: pickNonEmptyWorkspaceValue(remote.streetType, local.streetType),
      streetName: pickNonEmptyWorkspaceValue(remote.streetName, local.streetName),
      streetNumber: pickNonEmptyWorkspaceValue(remote.streetNumber, local.streetNumber),
      city: pickNonEmptyWorkspaceValue(remote.city, local.city),
      postalCode: pickNonEmptyWorkspaceValue(remote.postalCode, local.postalCode),
      salonAddress: pickNonEmptyWorkspaceValue(remote.salonAddress, local.salonAddress),
      subscriptionPlan: remote.subscriptionPlan ?? local.subscriptionPlan,
      subscriptionStatus: remote.subscriptionStatus ?? local.subscriptionStatus,
      createdAt: remote.createdAt || local.createdAt,
      updatedAt: remote.updatedAt || local.updatedAt,
      cashSectionDisabled: shouldForceLocalCashSectionDisabled
        ? local.cashSectionDisabled
        : preferLocalCashSectionDisabled
        ? local.cashSectionDisabled
        : remote.cashSectionDisabled,
      autoAcceptBookingRequests: preferLocalAutoAccept
        ? local.autoAcceptBookingRequests
        : remote.autoAcceptBookingRequests,
      autoAcceptBookingRequestsUpdatedAt: preferLocalAutoAccept
        ? pickNonEmptyWorkspaceValue(
            local.autoAcceptBookingRequestsUpdatedAt,
            remote.autoAcceptBookingRequestsUpdatedAt
          )
        : pickNonEmptyWorkspaceValue(
            remote.autoAcceptBookingRequestsUpdatedAt,
            local.autoAcceptBookingRequestsUpdatedAt
          ),
      customerReminderHoursBefore: preferLocalCustomerReminder
        ? local.customerReminderHoursBefore
        : remote.customerReminderHoursBefore,
      trialEndsAt: pickNonEmptyWorkspaceValue(remote.trialEndsAt, local.trialEndsAt) || undefined,
      subscriptionEndsAt:
        pickNonEmptyWorkspaceValue(remote.subscriptionEndsAt, local.subscriptionEndsAt) ||
        undefined,
      lastBackupAt:
        pickNonEmptyWorkspaceValue(remote.lastBackupAt, local.lastBackupAt) || undefined,
    },
    normalizedEmail
  );
};

const isUuidValue = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeTimeIdentity = (value?: string | null) => {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return '';

  try {
    return String(timeToMinutes(normalized));
  } catch {
    return normalized;
  }
};
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

const normalizePhoneForIdentity = (value?: string | null) =>
  (value ?? '').replace(/\D+/g, '');
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

const mergeWorkspacePreferenceOverrides = ({
  workspace,
  cashSectionDisabled,
  autoAcceptBookingRequests,
  autoAcceptBookingRequestsUpdatedAt,
  customerReminderHoursBefore,
  email,
}: {
  workspace: Partial<SalonWorkspace> | null | undefined;
  cashSectionDisabled?: boolean;
  autoAcceptBookingRequests?: boolean;
  autoAcceptBookingRequestsUpdatedAt?: string;
  customerReminderHoursBefore?: number;
  email: string;
}) =>
  normalizeWorkspace(
    {
      ...workspace,
      cashSectionDisabled:
        typeof cashSectionDisabled === 'boolean'
          ? cashSectionDisabled
          : workspace?.cashSectionDisabled,
      autoAcceptBookingRequests:
        typeof autoAcceptBookingRequests === 'boolean'
          ? autoAcceptBookingRequests
          : workspace?.autoAcceptBookingRequests,
      autoAcceptBookingRequestsUpdatedAt:
        autoAcceptBookingRequestsUpdatedAt?.trim() ||
        workspace?.autoAcceptBookingRequestsUpdatedAt,
      customerReminderHoursBefore:
        typeof customerReminderHoursBefore === 'number'
          ? customerReminderHoursBefore
          : workspace?.customerReminderHoursBefore,
    },
    email
  );

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

const formatOwnerBootstrapError = (
  error: unknown,
  fallback = 'Account collegato ma workspace backend non allineato.'
) => {
  if (isDeadlockError(error)) {
    return 'Sto riallineando il salone. Riprova subito tra un attimo.';
  }

  if (isWorkspaceSlugConflictError(error)) {
    return 'Sto riallineando automaticamente il codice salone. Riprova subito tra un attimo.';
  }

  const maybeError =
    error && typeof error === 'object'
      ? (error as { message?: string | null })
      : null;

  return maybeError?.message?.trim() || fallback;
};

const getOwnerBootstrapErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const maybeError = error as { message?: string | null };
  return maybeError.message?.trim() ?? '';
};

const isOwnerBootstrapProfileRequirementError = (error: unknown) => {
  const message = getOwnerBootstrapErrorMessage(error);

  return (
    message === 'activity_category_required' ||
    message === 'street_line_required' ||
    message === 'city_required' ||
    message === 'postal_code_required'
  );
};

const isMissingOwnerOnboardingColumnError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  const normalizedCode = String(maybeError.code ?? '').trim();
  const normalizedMessage = String(maybeError.message ?? '').trim().toLowerCase();

  return (
    normalizedCode === '42703' &&
    normalizedMessage.includes('owner_profiles.onboarding_completed_at') &&
    normalizedMessage.includes('does not exist')
  );
};

const isWorkspaceSlugConflictError = (error: unknown) => {
  const message = getOwnerBootstrapErrorMessage(error).toLowerCase();

  return (
    message.includes('workspaces_slug_key') ||
    (message.includes('duplicate key value') && message.includes('slug'))
  );
};

const isStatementTimeoutError = (error: unknown) => {
  const message = getOwnerBootstrapErrorMessage(error).toLowerCase();

  return (
    message.includes('statement timeout') ||
    message.includes('cancelling statement due to statement timeout')
  );
};

const isSupabaseSchemaCacheLookupError = (error: unknown) => {
  const message = getOwnerBootstrapErrorMessage(error).toLowerCase();

  return (
    message.includes('schema cache') ||
    message.includes('could not query the database for the schema cache')
  );
};

const shouldSilenceTransientSyncError = (error: unknown) =>
  isSupabaseSchemaCacheLookupError(error) || isStatementTimeoutError(error);

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const invokeBookingRequestStatusRpcWithSchemaRetry = async (
  rpcName: 'accept_owner_booking_request_atomic_v2' | 'update_owner_booking_request_status_v2',
  payload: Record<string, unknown>
) => {
  const firstResponse = await supabase.rpc(rpcName, payload);

  if (!firstResponse.error || !isSupabaseSchemaCacheLookupError(firstResponse.error)) {
    return firstResponse;
  }

  console.log(`Retry RPC ${rpcName} dopo schema cache Supabase:`, firstResponse.error);
  await wait(450);

  const secondResponse = await supabase.rpc(rpcName, payload);
  if (!secondResponse.error || !isSupabaseSchemaCacheLookupError(secondResponse.error)) {
    return secondResponse;
  }

  console.log(`Secondo retry RPC ${rpcName} dopo schema cache Supabase:`, secondResponse.error);
  await wait(900);

  return supabase.rpc(rpcName, payload);
};

const invokeRpcWithSchemaRetry = async <TResponse = unknown>(
  rpcName: string,
  payload: Record<string, unknown>
) => {
  const invokeRpc = () =>
    Promise.resolve(
      supabase.rpc(rpcName, payload)
    ) as Promise<{ data: TResponse; error: PostgrestError | null }>;

  const firstResponse = await invokeRpc();

  if (!firstResponse.error || !isSupabaseSchemaCacheLookupError(firstResponse.error)) {
    return firstResponse;
  }

  await wait(450);
  const secondResponse = await invokeRpc();
  if (!secondResponse.error || !isSupabaseSchemaCacheLookupError(secondResponse.error)) {
    return secondResponse;
  }

  await wait(900);
  return invokeRpc();
};

const isPublicBookingRequestRpcSignatureMismatch = (error: unknown) => {
  const message = getOwnerBootstrapErrorMessage(error).toLowerCase();

  return (
    message.includes('public.create_public_booking_request') &&
    (message.includes('could not find the function') ||
      (message.includes('function') && message.includes('does not exist')) ||
      message.includes('schema cache') ||
      message.includes('p_required_role') ||
      message.includes('p_operator_id') ||
      message.includes('p_operator_name'))
  );
};

const invokeCreatePublicBookingRequestRpcCompat = async (payload: {
  p_salon_code: string;
  p_requested_service_name: string;
  p_requested_price: number;
  p_requested_duration_minutes: number;
  p_appointment_date: string;
  p_appointment_time: string;
  p_customer_name: string;
  p_customer_surname: string;
  p_customer_email: string;
  p_customer_phone: string;
  p_customer_instagram: string | null;
  p_notes: string | null;
  p_required_role: string | null;
  p_operator_id: string | null;
  p_operator_name: string | null;
}) => {
  const attemptPrimary = async () =>
    supabase.rpc('create_public_booking_request', payload);

  const firstResponse = await attemptPrimary();
  if (!firstResponse.error) {
    return firstResponse;
  }

  if (isSupabaseSchemaCacheLookupError(firstResponse.error)) {
    await wait(450);
    const secondResponse = await attemptPrimary();
    if (!secondResponse.error) {
      return secondResponse;
    }

    if (isSupabaseSchemaCacheLookupError(secondResponse.error)) {
      await wait(900);
      const thirdResponse = await attemptPrimary();
      if (!thirdResponse.error) {
        return thirdResponse;
      }

      if (!isPublicBookingRequestRpcSignatureMismatch(thirdResponse.error)) {
        return thirdResponse;
      }
    } else if (!isPublicBookingRequestRpcSignatureMismatch(secondResponse.error)) {
      return secondResponse;
    }
  } else if (!isPublicBookingRequestRpcSignatureMismatch(firstResponse.error)) {
    return firstResponse;
  }

  const legacyWithoutRequiredRole = await supabase.rpc('create_public_booking_request', {
    p_salon_code: payload.p_salon_code,
    p_requested_service_name: payload.p_requested_service_name,
    p_requested_price: payload.p_requested_price,
    p_requested_duration_minutes: payload.p_requested_duration_minutes,
    p_appointment_date: payload.p_appointment_date,
    p_appointment_time: payload.p_appointment_time,
    p_customer_name: payload.p_customer_name,
    p_customer_surname: payload.p_customer_surname,
    p_customer_email: payload.p_customer_email,
    p_customer_phone: payload.p_customer_phone,
    p_customer_instagram: payload.p_customer_instagram,
    p_notes: payload.p_notes,
    p_operator_id: payload.p_operator_id,
    p_operator_name: payload.p_operator_name,
  });

  if (
    !legacyWithoutRequiredRole.error ||
    !isPublicBookingRequestRpcSignatureMismatch(legacyWithoutRequiredRole.error)
  ) {
    return legacyWithoutRequiredRole;
  }

  return supabase.rpc('create_public_booking_request', {
    p_salon_code: payload.p_salon_code,
    p_requested_service_name: payload.p_requested_service_name,
    p_requested_price: payload.p_requested_price,
    p_requested_duration_minutes: payload.p_requested_duration_minutes,
    p_appointment_date: payload.p_appointment_date,
    p_appointment_time: payload.p_appointment_time,
    p_customer_name: payload.p_customer_name,
    p_customer_surname: payload.p_customer_surname,
    p_customer_email: payload.p_customer_email,
    p_customer_phone: payload.p_customer_phone,
    p_customer_instagram: payload.p_customer_instagram,
    p_notes: payload.p_notes,
  });
};

const buildOwnerBootstrapSlugCandidates = (salonName: string, email: string) => {
  const normalizedEmail = normalizeAccountEmail(email);
  const emailBase = normalizedEmail.split('@')[0] || 'salone';
  const compactEmailBase = emailBase.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'owner';
  const nameBase = normalizeSalonCode(salonName) || normalizeSalonCode(emailBase) || 'salone';
  const defaultCode = buildSalonCode(salonName, normalizedEmail);

  return Array.from(
    new Set(
      [
        defaultCode,
        normalizeSalonCode(`${nameBase}-${compactEmailBase.slice(0, 10)}`),
        normalizeSalonCode(`${nameBase}-${compactEmailBase.slice(-10)}`),
        normalizeSalonCode(`${nameBase}-${compactEmailBase}`),
      ].filter(Boolean)
    )
  );
};

const hasCompleteOwnerBootstrapProfile = ({
  activityCategory,
  streetLine,
  city,
  postalCode,
}: {
  activityCategory?: string | null;
  streetLine?: string | null;
  city?: string | null;
  postalCode?: string | null;
}) =>
  !!activityCategory?.trim() &&
  !!streetLine?.trim() &&
  !!city?.trim() &&
  !!postalCode?.trim();

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

const buildBookingRequestStatusPushCopy = ({
  status,
  serviceName,
  appointmentDate,
  appointmentTime,
  operatorName,
}: {
  status: 'Accettata' | 'Rifiutata' | 'Annullata' | 'accepted' | 'rejected' | 'cancelled';
  serviceName?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  operatorName?: string | null;
}) => {
  const statusLabel = getBookingRequestPushStatusLabel(status);
  const title =
    statusLabel === 'Accettata'
      ? 'Prenotazione Accettata'
      : statusLabel === 'Rifiutata'
        ? 'Prenotazione Rifiutata'
        : 'Prenotazione Annullata';
  const details = [
    serviceName?.trim() ? `Servizio: ${serviceName.trim()}` : null,
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

const buildWorkspaceSeedFromOwnerAccount = (account?: OwnerAccount | null) => {
  if (!account) {
    return null;
  }

  const streetLine = account.streetLine.trim().toUpperCase();
  const city = account.city.trim().toUpperCase();
  const postalCode = account.postalCode.trim();
  const activityCategory = account.activityCategory.trim().toUpperCase();

  return {
    ownerEmail: normalizeAccountEmail(account.email),
    salonName: account.salonName.trim(),
    businessPhone: account.businessPhone.trim(),
    activityCategory,
    streetType: '',
    streetName: streetLine,
    streetNumber: '',
    city,
    postalCode,
    salonAddress: formatSalonAddress({
      streetType: '',
      streetName: streetLine,
      streetNumber: '',
      city,
      postalCode,
      salonAddress: '',
    }),
  } satisfies Partial<SalonWorkspace>;
};

type RemoteWorkspaceRow = {
  id: string;
  slug: string;
  salon_name: string;
  owner_email: string;
  owner_phone: string | null;
  activity_category: string | null;
  street_name: string | null;
  city: string | null;
  postal_code: string | null;
  cash_section_disabled: boolean | null;
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
      item.maxFutureAppointmentsMode === 'monthly' ||
      item.maxFutureAppointmentsMode === 'total_future'
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

type Appuntamento = {
  id: string;
  data?: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
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

const normalizeEventi = (items: Evento[]) =>
  items.map((item, index) => ({
    id: item.id?.trim() || `evento-${index}`,
    titolo: item.titolo?.trim() ?? '',
    data: item.data?.trim() ?? '',
    ora: item.ora?.trim() ?? '',
    note: item.note?.trim() ?? '',
  }));

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
    viewedByCliente: item.viewedByCliente ?? item.stato === 'In attesa',
    viewedBySalon:
      item.viewedBySalon ??
      !(item.stato === 'In attesa' || item.stato === 'Annullata'),
    cancellationSource:
      item.stato === 'Annullata'
        ? item.cancellationSource ?? (item.viewedByCliente === true ? 'cliente' : 'salone')
        : undefined,
  }));

const buildRichiestaMergeKey = (item: RichiestaPrenotazione) => {
  const date = item.data.trim();
  const time = item.ora.trim().toLowerCase();
  const service = item.servizio.trim().toLowerCase();
  const fullName = `${item.nome} ${item.cognome}`.trim().toLowerCase();
  return `${date}|${time}|${service}|${fullName}`;
};

const buildRichiestaMergeKeyFromValues = ({
  data,
  ora,
  servizio,
  fullName,
}: {
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  fullName?: string | null;
}) =>
  `${(data ?? '').trim()}|${normalizeIdentityText(ora)}|${normalizeIdentityText(
    servizio
  )}|${normalizeIdentityText(fullName)}`;

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

const normalizeServizi = (items: Servizio[]) =>
  items.map((item) => ({
    ...item,
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

type OwnerAppSnapshotPayload = {
  workspace?: Partial<SalonWorkspace>;
  clienti?: Cliente[];
  appuntamenti?: Appuntamento[];
  movimenti?: Movimento[];
  servizi?: Servizio[];
  operatori?: Operatore[];
  macchinari?: Macchinario[];
  carteCollegate?: CartaCollegata[];
  eventi?: Evento[];
  richiestePrenotazione?: RichiestaPrenotazione[];
  availabilitySettings?: AvailabilitySettings;
  messaggioEventoTemplate?: string;
  serviceCardColorOverrides?: Record<string, string>;
  roleCardColorOverrides?: Record<string, string>;
};

const normalizeOwnerAppSnapshotPayload = (
  payload: Record<string, unknown> | null | undefined
): OwnerAppSnapshotPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  return {
    workspace:
      payload.workspace && typeof payload.workspace === 'object' && !Array.isArray(payload.workspace)
        ? (payload.workspace as Partial<SalonWorkspace>)
        : undefined,
    clienti: Array.isArray(payload.clienti) ? normalizeClienti(payload.clienti as Cliente[]) : undefined,
    appuntamenti: Array.isArray(payload.appuntamenti)
      ? normalizeAppuntamenti(payload.appuntamenti as Appuntamento[])
      : undefined,
    movimenti: Array.isArray(payload.movimenti)
      ? normalizeMovimenti(payload.movimenti as Movimento[])
      : undefined,
    servizi: Array.isArray(payload.servizi) ? normalizeServizi(payload.servizi as Servizio[]) : undefined,
    operatori: Array.isArray(payload.operatori)
      ? normalizeOperatori(payload.operatori as Operatore[])
      : undefined,
    macchinari: Array.isArray(payload.macchinari)
      ? normalizeMacchinari(payload.macchinari as Macchinario[])
      : undefined,
    carteCollegate: Array.isArray(payload.carteCollegate)
      ? normalizeCarte(payload.carteCollegate as CartaCollegata[])
      : undefined,
    eventi: Array.isArray(payload.eventi) ? normalizeEventi(payload.eventi as Evento[]) : undefined,
    richiestePrenotazione: Array.isArray(payload.richiestePrenotazione)
      ? normalizeRichiestePrenotazione(payload.richiestePrenotazione as RichiestaPrenotazione[])
      : undefined,
    availabilitySettings:
      payload.availabilitySettings && typeof payload.availabilitySettings === 'object'
        ? normalizeAvailabilitySettings(payload.availabilitySettings as AvailabilitySettings)
        : undefined,
    messaggioEventoTemplate:
      typeof payload.messaggioEventoTemplate === 'string'
        ? payload.messaggioEventoTemplate
        : undefined,
    serviceCardColorOverrides:
      payload.serviceCardColorOverrides && typeof payload.serviceCardColorOverrides === 'object'
        ? normalizeServiceColorOverrideMap(
            payload.serviceCardColorOverrides as Record<string, string>,
            Array.isArray(payload.servizi) ? normalizeServizi(payload.servizi as Servizio[]) : []
          )
        : undefined,
    roleCardColorOverrides:
      payload.roleCardColorOverrides && typeof payload.roleCardColorOverrides === 'object'
        ? normalizeRoleColorOverrideMap(payload.roleCardColorOverrides as Record<string, string>)
        : undefined,
  };
};

const movementMethodToRemote = (
  value?: Movimento['metodo']
): 'cash' | 'card' | 'bank_transfer' | null => {
  if (value === 'Contanti') return 'cash';
  if (value === 'Carta') return 'card';
  if (value === 'Bonifico') return 'bank_transfer';
  return null;
};

const movementMethodFromRemote = (value?: string | null): Movimento['metodo'] | undefined => {
  if (value === 'cash') return 'Contanti';
  if (value === 'card') return 'Carta';
  if (value === 'bank_transfer') return 'Bonifico';
  return undefined;
};

const buildMovementSemanticKey = (item: Pick<Movimento, 'descrizione' | 'importo' | 'createdAt'>) =>
  [
    item.descrizione.trim().toLowerCase(),
    item.importo.toFixed(2),
    deriveMovementCreatedAt(item as Movimento),
  ].join('|');

const buildCardSemanticKey = (item: Pick<CartaCollegata, 'nome' | 'circuito' | 'ultime4'>) =>
  [item.nome.trim().toLowerCase(), item.circuito.trim().toLowerCase(), item.ultime4.trim()].join('|');

const buildEventSemanticKey = (item: Pick<Evento, 'titolo' | 'data' | 'ora'>) =>
  [item.titolo.trim().toLowerCase(), item.data.trim(), item.ora.trim()].join('|');

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
  onboardingPending: boolean;
  showOnboarding: boolean;
  setOnboardingReady: (ready: boolean) => void;
  completeOnboarding: () => Promise<void>;
  reopenOnboarding: () => void;
  ownerProfileNeedsCompletion: boolean;
  consumeOwnerProfileNeedsCompletion: () => boolean;
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
  createClientePersisted: (customer: {
    nome: string;
    telefono: string;
    email?: string;
    instagram?: string;
    birthday?: string;
    maxFutureAppointments?: number | null;
    maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
    maxDailyAppointments?: number | null;
  }) => Promise<{ ok: boolean; error?: string }>;
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
  createMovimentoPersisted: (movement: {
    descrizione: string;
    importo: number;
    metodo?: Movimento['metodo'];
    cartaLabel?: string;
    createdAt?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  updateMovimentoPersisted: (
    movementId: string,
    updates: {
      metodo?: Movimento['metodo'];
      cartaLabel?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
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
  createCartaPersisted: (card: {
    nome: string;
    circuito: string;
    ultime4: string;
    predefinita?: boolean;
  }) => Promise<{ ok: boolean; cardId?: string; error?: string }>;
  setDefaultCartaPersisted: (cardId: string) => Promise<{ ok: boolean; error?: string }>;
  deleteCartaPersisted: (cardId: string) => Promise<{ ok: boolean; error?: string }>;
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
        detail?: string;
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
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [manualOnboardingVisible, setManualOnboardingVisible] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const onboardingSessionLockedEmailRef = useRef('');
  const [ownerProfileNeedsCompletion, setOwnerProfileNeedsCompletion] = useState(false);
  const [salonAccountEmail, setSalonAccountEmail] = useState('');
  const [salonWorkspace, setSalonWorkspace] = useState<SalonWorkspace>(
    createDefaultWorkspace('')
  );
  const salonWorkspaceRef = useRef<SalonWorkspace>(createDefaultWorkspace(''));
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
  const onboardingServerSyncInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const recentlyDeletedAppointmentKeysRef = React.useRef<Map<string, number>>(new Map());
  const recentlyCreatedAppointmentKeysRef = React.useRef<Map<string, number>>(new Map());
  const recentlyMovedAppointmentIdsRef = React.useRef<Map<string, number>>(new Map());
  const recentlyDeletedCustomerKeysRef = React.useRef<Map<string, number>>(new Map());
  const previousCustomerIdentityKeysRef = React.useRef<Set<string>>(new Set());
  const portalPublishQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const portalPublishDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const servicesBackendSyncDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastServicesBackendSyncSignatureRef = React.useRef('');
  const cashBackendSyncDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsBackendSyncDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerSnapshotSyncDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingSyncRequestSeqRef = React.useRef(0);
  const lastCashBackendSyncSignatureRef = React.useRef('');
  const lastCardsBackendSyncSignatureRef = React.useRef('');
  const lastEventsBackendSyncSignatureRef = React.useRef('');
  const lastTemplateBackendSyncValueRef = React.useRef('');
  const lastOwnerSnapshotSyncSignatureRef = React.useRef('');
  const legacyOperatorBackfillSignatureRef = React.useRef('');
  const salonCapacityBackfillSignatureRef = React.useRef('');

  useEffect(() => {
    salonWorkspaceRef.current = salonWorkspace;
  }, [salonWorkspace]);

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
    (salonCode: string) =>
      runWithDeadlockRetry(
        () => fetchClientPortalSnapshot(salonCode),
        'Caricamento snapshot portale cliente'
      ),
    [runWithDeadlockRetry]
  );

  const syncServicesTableForWorkspace = React.useCallback(
    async (workspaceId: string, serviceItems: Servizio[]) => {
      if (
        !isAuthenticated ||
        !hasInitializedAuth ||
        !salonAccountEmail ||
        !isWorkspaceAccessible(salonWorkspace) ||
        !isUuidValue(workspaceId)
      ) {
        return;
      }

      const normalizedServices = normalizeServizi(serviceItems);
      const syncSignature = JSON.stringify({
        workspaceId,
        services: normalizedServices
          .map((item) => ({
            id: isUuidValue(item.id) ? item.id : '',
            nome: item.nome.trim(),
            prezzo: Number(item.prezzo ?? 0),
            durataMinuti: item.durataMinuti ?? 60,
          }))
          .sort((first, second) => first.nome.localeCompare(second.nome, 'it')),
      });

      if (lastServicesBackendSyncSignatureRef.current === syncSignature) {
        return;
      }

      type BackendServiceRow = {
        id: string;
        workspace_id: string;
        name: string;
        price: number;
        duration_minutes: number;
      };

      const { data: existingRows, error: existingRowsError } = await supabase
        .from('services')
        .select('id, workspace_id, name, price, duration_minutes')
        .eq('workspace_id', workspaceId);

      if (existingRowsError) {
        throw existingRowsError;
      }

      const currentRows = (existingRows ?? []) as BackendServiceRow[];
      const existingById = new Map(currentRows.map((item) => [item.id, item]));
      const existingByName = new Map(
        currentRows.map((item) => [normalizeIdentityText(item.name), item])
      );
      const matchedExistingIds = new Set<string>();
      const rowsToUpsert = normalizedServices.map((item) => {
        const trimmedName = item.nome.trim();
        const matchedRow =
          (isUuidValue(item.id) ? existingById.get(item.id) : null) ??
          existingByName.get(normalizeIdentityText(trimmedName)) ??
          null;

        if (matchedRow?.id) {
          matchedExistingIds.add(matchedRow.id);
        }

        return {
          id: matchedRow?.id,
          workspace_id: workspaceId,
          name: trimmedName,
          price: Number(item.prezzo ?? 0),
          duration_minutes: item.durataMinuti ?? 60,
        };
      });

      const rowsToInsert = rowsToUpsert.filter((item) => !item.id).map(({ id: _id, ...item }) => item);
      const rowsToUpdate = rowsToUpsert.filter(
        (item): item is BackendServiceRow => typeof item.id === 'string' && item.id.trim().length > 0
      );
      const rowsToDelete = currentRows
        .filter((item) => !matchedExistingIds.has(item.id))
        .map((item) => item.id);

      if (rowsToUpdate.length > 0) {
        const { error } = await supabase.from('services').upsert(rowsToUpdate, {
          onConflict: 'id',
        });

        if (error) {
          throw error;
        }
      }

      if (rowsToInsert.length > 0) {
        const { error } = await supabase.from('services').insert(rowsToInsert);

        if (error) {
          throw error;
        }
      }

      if (rowsToDelete.length > 0) {
        const { error } = await supabase.from('services').delete().in('id', rowsToDelete);

        if (error) {
          throw error;
        }
      }

      lastServicesBackendSyncSignatureRef.current = syncSignature;
    },
    [hasInitializedAuth, isAuthenticated, salonAccountEmail, salonWorkspace]
  );

  const loadOwnerPrivateServerState = React.useCallback(
    async (workspaceId: string) => {
      if (!isUuidValue(workspaceId)) {
        return null;
      }

      type CashMovementRow = {
        id: string;
        description: string;
        amount: number | string;
        payment_method: string | null;
        card_label: string | null;
        created_at: string;
      };

      type ConnectedCardRow = {
        id: string;
        label: string;
        circuit: string;
        last4: string;
        is_default: boolean;
      };

      type EventRow = {
        id: string;
        title: string;
        event_date: string;
        event_time: string;
        notes: string | null;
      };

      type MessageTemplateRow = {
        event_template: string | null;
      };

      type OwnerSnapshotRow = {
        payload: Record<string, unknown> | null;
      };

      const [cashResult, cardsResult, eventsResult, templateResult, snapshotResult] =
        await Promise.allSettled([
          supabase
            .from('cash_movements')
            .select('id, description, amount, payment_method, card_label, created_at')
            .eq('workspace_id', workspaceId),
          supabase
            .from('connected_cards')
            .select('id, label, circuit, last4, is_default')
            .eq('workspace_id', workspaceId),
          supabase
            .from('events')
            .select('id, title, event_date, event_time, notes')
            .eq('workspace_id', workspaceId),
          supabase
            .from('message_templates')
            .select('event_template')
            .eq('workspace_id', workspaceId)
            .maybeSingle(),
          supabase
            .from('owner_app_snapshots')
            .select('payload')
            .eq('workspace_id', workspaceId)
            .maybeSingle(),
        ]);

      const ownerSnapshot =
        snapshotResult.status === 'fulfilled' && !snapshotResult.value.error
          ? normalizeOwnerAppSnapshotPayload(
              (snapshotResult.value.data as OwnerSnapshotRow | null)?.payload ?? null
            )
          : null;

      const remoteMovimenti =
        cashResult.status === 'fulfilled' && !cashResult.value.error
          ? normalizeMovimenti(
              ((cashResult.value.data ?? []) as CashMovementRow[]).map((item) => ({
                id: item.id,
                descrizione: item.description,
                importo: Number(item.amount ?? 0),
                metodo: movementMethodFromRemote(item.payment_method),
                cartaLabel: item.card_label ?? undefined,
                createdAt: item.created_at,
              }))
            )
          : [];

      const remoteCarte =
        cardsResult.status === 'fulfilled' && !cardsResult.value.error
          ? normalizeCarte(
              ((cardsResult.value.data ?? []) as ConnectedCardRow[]).map((item) => ({
                id: item.id,
                nome: item.label,
                circuito: item.circuit,
                ultime4: item.last4,
                predefinita: item.is_default,
              }))
            )
          : [];

      const remoteEventi =
        eventsResult.status === 'fulfilled' && !eventsResult.value.error
          ? normalizeEventi(
              ((eventsResult.value.data ?? []) as EventRow[]).map((item) => ({
                id: item.id,
                titolo: item.title,
                data: item.event_date,
                ora: item.event_time,
                note: item.notes ?? '',
              }))
            )
          : [];

      const remoteTemplate =
        templateResult.status === 'fulfilled' && !templateResult.value.error
          ? ((templateResult.value.data as MessageTemplateRow | null)?.event_template ?? '').trim()
          : '';

      return {
        ownerSnapshot,
        movimenti:
          remoteMovimenti.length > 0
            ? remoteMovimenti
            : ownerSnapshot?.movimenti ?? normalizeMovimenti([]),
        carteCollegate:
          remoteCarte.length > 0 ? remoteCarte : ownerSnapshot?.carteCollegate ?? normalizeCarte([]),
        eventi: remoteEventi.length > 0 ? remoteEventi : ownerSnapshot?.eventi ?? normalizeEventi([]),
        messaggioEventoTemplate:
          remoteTemplate || ownerSnapshot?.messaggioEventoTemplate || '',
      };
    },
    []
  );

  const syncCashTablesForWorkspace = React.useCallback(
    async (workspaceId: string, movementItems: Movimento[], connectedCardItems: CartaCollegata[]) => {
      if (
        !isAuthenticated ||
        !hasInitializedAuth ||
        !salonAccountEmail ||
        !isWorkspaceAccessible(salonWorkspace) ||
        !isUuidValue(workspaceId)
      ) {
        return;
      }

      type CashMovementRow = {
        id: string;
        workspace_id: string;
        description: string;
        amount: number;
        payment_method: 'cash' | 'card' | 'bank_transfer' | null;
        card_label: string | null;
        created_at: string;
      };

      type ConnectedCardRow = {
        id: string;
        workspace_id: string;
        label: string;
        circuit: string;
        last4: string;
        is_default: boolean;
      };

      const normalizedMovements = normalizeMovimenti(movementItems);
      const normalizedCards = normalizeCarte(connectedCardItems);
      const movementSignature = JSON.stringify(
        normalizedMovements
          .map((item) => ({
            key: buildMovementSemanticKey(item),
            metodo: item.metodo ?? '',
            cartaLabel: item.cartaLabel ?? '',
          }))
          .sort((first, second) => first.key.localeCompare(second.key, 'it'))
      );
      const cardSignature = JSON.stringify(
        normalizedCards
          .map((item) => ({
            key: buildCardSemanticKey(item),
            predefinita: !!item.predefinita,
          }))
          .sort((first, second) => first.key.localeCompare(second.key, 'it'))
      );

      if (
        lastCashBackendSyncSignatureRef.current === movementSignature &&
        lastCardsBackendSyncSignatureRef.current === cardSignature
      ) {
        return;
      }

      const [{ data: existingMovements, error: movementsError }, { data: existingCards, error: cardsError }] =
        await Promise.all([
          supabase
            .from('cash_movements')
            .select('id, workspace_id, description, amount, payment_method, card_label, created_at')
            .eq('workspace_id', workspaceId),
          supabase
            .from('connected_cards')
            .select('id, workspace_id, label, circuit, last4, is_default')
            .eq('workspace_id', workspaceId),
        ]);

      if (movementsError) {
        throw movementsError;
      }
      if (cardsError) {
        throw cardsError;
      }

      const currentMovements = (existingMovements ?? []) as CashMovementRow[];
      const currentCards = (existingCards ?? []) as ConnectedCardRow[];
      const movementsById = new Map(currentMovements.map((item) => [item.id, item]));
      const movementCandidatesByKey = new Map<string, CashMovementRow[]>();
      currentMovements.forEach((item) => {
        const key = buildMovementSemanticKey({
          descrizione: item.description,
          importo: Number(item.amount ?? 0),
          createdAt: item.created_at,
        });
        const current = movementCandidatesByKey.get(key) ?? [];
        current.push(item);
        movementCandidatesByKey.set(key, current);
      });

      const matchedMovementIds = new Set<string>();
      const movementRowsToUpsert = normalizedMovements.map((item) => {
        const key = buildMovementSemanticKey(item);
        const matchedById = isUuidValue(item.id) ? movementsById.get(item.id) ?? null : null;
        const matchedByKey = (movementCandidatesByKey.get(key) ?? []).find(
          (entry) => !matchedMovementIds.has(entry.id)
        ) ?? null;
        const matchedRow = matchedById ?? matchedByKey;

        if (matchedRow?.id) {
          matchedMovementIds.add(matchedRow.id);
        }

        return {
          id: matchedRow?.id,
          workspace_id: workspaceId,
          description: item.descrizione.trim(),
          amount: Number(item.importo ?? 0),
          payment_method: movementMethodToRemote(item.metodo),
          card_label: item.cartaLabel?.trim() || null,
          created_at: deriveMovementCreatedAt(item),
        };
      });

      const movementRowsToInsert = movementRowsToUpsert
        .filter((item) => !item.id)
        .map(({ id: _id, ...item }) => item);
      const movementRowsToUpdate = movementRowsToUpsert.filter(
        (item): item is CashMovementRow => typeof item.id === 'string' && item.id.trim().length > 0
      );
      const movementRowsToDelete = currentMovements
        .filter((item) => !matchedMovementIds.has(item.id))
        .map((item) => item.id);

      if (movementRowsToUpdate.length > 0) {
        const { error } = await supabase.from('cash_movements').upsert(movementRowsToUpdate, {
          onConflict: 'id',
        });
        if (error) {
          throw error;
        }
      }

      if (movementRowsToInsert.length > 0) {
        const { error } = await supabase.from('cash_movements').insert(movementRowsToInsert);
        if (error) {
          throw error;
        }
      }

      if (movementRowsToDelete.length > 0) {
        const { error } = await supabase.from('cash_movements').delete().in('id', movementRowsToDelete);
        if (error) {
          throw error;
        }
      }

      const cardsById = new Map(currentCards.map((item) => [item.id, item]));
      const cardCandidatesByKey = new Map<string, ConnectedCardRow[]>();
      currentCards.forEach((item) => {
        const key = buildCardSemanticKey({
          nome: item.label,
          circuito: item.circuit,
          ultime4: item.last4,
        });
        const current = cardCandidatesByKey.get(key) ?? [];
        current.push(item);
        cardCandidatesByKey.set(key, current);
      });

      const matchedCardIds = new Set<string>();
      const cardRowsToUpsert = normalizedCards.map((item, index) => {
        const key = buildCardSemanticKey(item);
        const matchedById = isUuidValue(item.id) ? cardsById.get(item.id) ?? null : null;
        const matchedByKey = (cardCandidatesByKey.get(key) ?? []).find(
          (entry) => !matchedCardIds.has(entry.id)
        ) ?? null;
        const matchedRow = matchedById ?? matchedByKey;

        if (matchedRow?.id) {
          matchedCardIds.add(matchedRow.id);
        }

        return {
          id: matchedRow?.id,
          workspace_id: workspaceId,
          label: item.nome.trim(),
          circuit: item.circuito.trim(),
          last4: item.ultime4.trim(),
          is_default: item.predefinita ?? index === 0,
        };
      });

      const cardRowsToInsert = cardRowsToUpsert
        .filter((item) => !item.id)
        .map(({ id: _id, ...item }) => item);
      const cardRowsToUpdate = cardRowsToUpsert.filter(
        (item): item is ConnectedCardRow => typeof item.id === 'string' && item.id.trim().length > 0
      );
      const cardRowsToDelete = currentCards
        .filter((item) => !matchedCardIds.has(item.id))
        .map((item) => item.id);

      if (cardRowsToUpdate.length > 0) {
        const { error } = await supabase.from('connected_cards').upsert(cardRowsToUpdate, {
          onConflict: 'id',
        });
        if (error) {
          throw error;
        }
      }

      if (cardRowsToInsert.length > 0) {
        const { error } = await supabase.from('connected_cards').insert(cardRowsToInsert);
        if (error) {
          throw error;
        }
      }

      if (cardRowsToDelete.length > 0) {
        const { error } = await supabase.from('connected_cards').delete().in('id', cardRowsToDelete);
        if (error) {
          throw error;
        }
      }

      const [{ data: refreshedMovements }, { data: refreshedCards }] = await Promise.all([
        supabase
          .from('cash_movements')
          .select('id, description, amount, payment_method, card_label, created_at')
          .eq('workspace_id', workspaceId),
        supabase
          .from('connected_cards')
          .select('id, label, circuit, last4, is_default')
          .eq('workspace_id', workspaceId),
      ]);

      setMovimenti(
        normalizeMovimenti(
          ((refreshedMovements ?? []) as CashMovementRow[]).map((item) => ({
            id: item.id,
            descrizione: item.description,
            importo: Number(item.amount ?? 0),
            metodo: movementMethodFromRemote(item.payment_method),
            cartaLabel: item.card_label ?? undefined,
            createdAt: item.created_at,
          }))
        )
      );
      setCarteCollegate(
        normalizeCarte(
          ((refreshedCards ?? []) as ConnectedCardRow[]).map((item) => ({
            id: item.id,
            nome: item.label,
            circuito: item.circuit,
            ultime4: item.last4,
            predefinita: item.is_default,
          }))
        )
      );

      lastCashBackendSyncSignatureRef.current = movementSignature;
      lastCardsBackendSyncSignatureRef.current = cardSignature;
    },
    [hasInitializedAuth, isAuthenticated, salonAccountEmail, salonWorkspace]
  );

  const syncEventsAndTemplateForWorkspace = React.useCallback(
    async (workspaceId: string, eventItems: Evento[], eventTemplate: string) => {
      if (
        !isAuthenticated ||
        !hasInitializedAuth ||
        !salonAccountEmail ||
        !isWorkspaceAccessible(salonWorkspace) ||
        !isUuidValue(workspaceId)
      ) {
        return;
      }

      type EventRow = {
        id: string;
        workspace_id: string;
        title: string;
        event_date: string;
        event_time: string;
        notes: string | null;
      };

      const normalizedEvents = normalizeEventi(eventItems);
      const eventSignature = JSON.stringify(
        normalizedEvents
          .map((item) => ({
            key: buildEventSemanticKey(item),
            note: item.note ?? '',
          }))
          .sort((first, second) => first.key.localeCompare(second.key, 'it'))
      );
      const normalizedTemplate = eventTemplate.trim();

      if (
        lastEventsBackendSyncSignatureRef.current === eventSignature &&
        lastTemplateBackendSyncValueRef.current === normalizedTemplate
      ) {
        return;
      }

      const { data: existingEvents, error: existingEventsError } = await supabase
        .from('events')
        .select('id, workspace_id, title, event_date, event_time, notes')
        .eq('workspace_id', workspaceId);

      if (existingEventsError) {
        throw existingEventsError;
      }

      const currentEvents = (existingEvents ?? []) as EventRow[];
      const eventsById = new Map(currentEvents.map((item) => [item.id, item]));
      const eventCandidatesByKey = new Map<string, EventRow[]>();
      currentEvents.forEach((item) => {
        const key = buildEventSemanticKey({
          titolo: item.title,
          data: item.event_date,
          ora: item.event_time,
        });
        const current = eventCandidatesByKey.get(key) ?? [];
        current.push(item);
        eventCandidatesByKey.set(key, current);
      });

      const matchedEventIds = new Set<string>();
      const eventRowsToUpsert = normalizedEvents.map((item) => {
        const key = buildEventSemanticKey(item);
        const matchedById = isUuidValue(item.id) ? eventsById.get(item.id) ?? null : null;
        const matchedByKey = (eventCandidatesByKey.get(key) ?? []).find(
          (entry) => !matchedEventIds.has(entry.id)
        ) ?? null;
        const matchedRow = matchedById ?? matchedByKey;

        if (matchedRow?.id) {
          matchedEventIds.add(matchedRow.id);
        }

        return {
          id: matchedRow?.id,
          workspace_id: workspaceId,
          title: item.titolo.trim(),
          event_date: item.data.trim(),
          event_time: item.ora.trim(),
          notes: item.note?.trim() || null,
        };
      });

      const eventRowsToInsert = eventRowsToUpsert
        .filter((item) => !item.id)
        .map(({ id: _id, ...item }) => item);
      const eventRowsToUpdate = eventRowsToUpsert.filter(
        (item): item is EventRow => typeof item.id === 'string' && item.id.trim().length > 0
      );
      const eventRowsToDelete = currentEvents
        .filter((item) => !matchedEventIds.has(item.id))
        .map((item) => item.id);

      if (eventRowsToUpdate.length > 0) {
        const { error } = await supabase.from('events').upsert(eventRowsToUpdate, {
          onConflict: 'id',
        });
        if (error) {
          throw error;
        }
      }

      if (eventRowsToInsert.length > 0) {
        const { error } = await supabase.from('events').insert(eventRowsToInsert);
        if (error) {
          throw error;
        }
      }

      if (eventRowsToDelete.length > 0) {
        const { error } = await supabase.from('events').delete().in('id', eventRowsToDelete);
        if (error) {
          throw error;
        }
      }

      const { error: templateError } = await supabase.from('message_templates').upsert(
        {
          workspace_id: workspaceId,
          event_template: normalizedTemplate || 'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.',
        },
        { onConflict: 'workspace_id' }
      );

      if (templateError) {
        throw templateError;
      }

      const { data: refreshedEvents } = await supabase
        .from('events')
        .select('id, title, event_date, event_time, notes')
        .eq('workspace_id', workspaceId);

      setEventi(
        normalizeEventi(
          ((refreshedEvents ?? []) as EventRow[]).map((item) => ({
            id: item.id,
            titolo: item.title,
            data: item.event_date,
            ora: item.event_time,
            note: item.notes ?? '',
          }))
        )
      );
      if (normalizedTemplate) {
        setMessaggioEventoTemplate(normalizedTemplate);
      }

      lastEventsBackendSyncSignatureRef.current = eventSignature;
      lastTemplateBackendSyncValueRef.current = normalizedTemplate;
    },
    [hasInitializedAuth, isAuthenticated, salonAccountEmail, salonWorkspace]
  );

  const syncOwnerSnapshotForWorkspace = React.useCallback(
    async (workspaceId: string, payload: OwnerAppSnapshotPayload) => {
      if (
        !isAuthenticated ||
        !hasInitializedAuth ||
        !salonAccountEmail ||
        !isWorkspaceAccessible(salonWorkspace) ||
        !isUuidValue(workspaceId)
      ) {
        return;
      }

      const normalizedPayload: OwnerAppSnapshotPayload = {
        workspace: payload.workspace,
        clienti: normalizeClienti(payload.clienti ?? []),
        appuntamenti: normalizeAppuntamenti(payload.appuntamenti ?? []),
        movimenti: normalizeMovimenti(payload.movimenti ?? []),
        servizi: normalizeServizi(payload.servizi ?? []),
        operatori: normalizeOperatori(payload.operatori ?? []),
        macchinari: normalizeMacchinari(payload.macchinari ?? []),
        carteCollegate: normalizeCarte(payload.carteCollegate ?? []),
        eventi: normalizeEventi(payload.eventi ?? []),
        richiestePrenotazione: normalizeRichiestePrenotazione(payload.richiestePrenotazione ?? []),
        availabilitySettings: normalizeAvailabilitySettings(payload.availabilitySettings ?? {}),
        messaggioEventoTemplate:
          payload.messaggioEventoTemplate?.trim() ||
          'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.',
        serviceCardColorOverrides: normalizeServiceColorOverrideMap(
          payload.serviceCardColorOverrides ?? {},
          normalizeServizi(payload.servizi ?? [])
        ),
        roleCardColorOverrides: normalizeRoleColorOverrideMap(payload.roleCardColorOverrides ?? {}),
      };

      const syncSignature = JSON.stringify(normalizedPayload);
      if (lastOwnerSnapshotSyncSignatureRef.current === syncSignature) {
        return;
      }

      const { error } = await supabase.from('owner_app_snapshots').upsert(
        {
          workspace_id: workspaceId,
          payload: normalizedPayload,
        },
        { onConflict: 'workspace_id' }
      );

      if (error) {
        const errorCode = typeof error === 'object' && error && 'code' in error ? String(error.code ?? '') : '';
        const errorMessage =
          typeof error === 'object' && error && 'message' in error ? String(error.message ?? '') : '';
        if (errorCode === '42P01' || errorMessage.toLowerCase().includes('owner_app_snapshots')) {
          return;
        }
        throw error;
      }

      lastOwnerSnapshotSyncSignatureRef.current = syncSignature;
    },
    [hasInitializedAuth, isAuthenticated, salonAccountEmail, salonWorkspace]
  );

  const enqueuePortalPublish = React.useCallback(
    async (snapshot: Parameters<typeof publishClientPortalSnapshot>[0]) => {
      const runTask = () =>
        runWithDeadlockRetry(
          () => publishClientPortalSnapshot(snapshot),
          'Pubblicazione portale cliente'
        );

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

    previousCustomerIdentityKeysRef.current = currentKeys;
  }, [clienti]);

  const isUuid = React.useCallback(
    (value?: string | null) =>
      !!value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    []
  );

  const applyOnboardingCompletionState = React.useCallback(
    (completed: boolean) => {
      setHasCompletedOnboarding(completed);
      setOnboardingPending(!completed);
      if (completed) {
        onboardingSessionLockedEmailRef.current = '';
        setManualOnboardingVisible(false);
        setOnboardingReady(false);
      }
    },
    []
  );

  const resetOnboardingState = React.useCallback(() => {
    onboardingSessionLockedEmailRef.current = '';
    setHasCompletedOnboarding(false);
    setOnboardingPending(false);
    setManualOnboardingVisible(false);
    setOnboardingReady(false);
  }, []);

  const runOneOffOwnerAccountCleanup = React.useCallback(async () => {
    try {
      const cleanupAlreadyDone = await AsyncStorage.getItem(ONE_OFF_OWNER_ACCOUNT_CLEANUP_DONE_KEY);
      if (cleanupAlreadyDone === 'true') {
        return;
      }

      const targetEmail = normalizeAccountEmail(ONE_OFF_OWNER_ACCOUNT_CLEANUP_EMAIL);
      if (!targetEmail) {
        await AsyncStorage.setItem(ONE_OFF_OWNER_ACCOUNT_CLEANUP_DONE_KEY, 'true');
        return;
      }

      const scopedKeysToRemove = [
        STORAGE_KEYS.workspace,
        STORAGE_KEYS.workspace_cash_section_disabled,
        STORAGE_KEYS.workspace_auto_accept_booking_requests,
        STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
        STORAGE_KEYS.workspace_customer_reminder_hours_before,
        STORAGE_KEYS.clienti,
        STORAGE_KEYS.appuntamenti,
        STORAGE_KEYS.movimenti,
        STORAGE_KEYS.servizi,
        STORAGE_KEYS.operatori,
        STORAGE_KEYS.macchinari,
        STORAGE_KEYS.carte,
        STORAGE_KEYS.eventi,
        STORAGE_KEYS.richieste_prenotazione,
        STORAGE_KEYS.availability_settings,
        STORAGE_KEYS.eventi_template,
        STORAGE_KEYS.biometric_enabled,
        STORAGE_KEYS.onboarding_completed,
        STORAGE_KEYS.onboarding_first_access_pending,
        STORAGE_KEYS.service_card_color_overrides,
        STORAGE_KEYS.role_card_color_overrides,
      ].map((key) => buildScopedStorageKey(key, targetEmail));

      const extraKeysToRemove = [
        `salon_manager_viewed_client_ids__${targetEmail}`,
        `salon_manager_viewed_client_keys__${targetEmail}`,
        `salon_manager_viewed_request_ids__${targetEmail}`,
      ];

      const [rawOwnerAccounts, activeAccountEmail, ownerSessionEmail, biometricLoginEmail] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.owner_accounts),
          AsyncStorage.getItem(STORAGE_KEYS.account_attivo),
          AsyncStorage.getItem(STORAGE_KEYS.owner_session),
          AsyncStorage.getItem(STORAGE_KEYS.biometric_login_email),
        ]);

      const parsedOwnerAccounts = rawOwnerAccounts
        ? ((JSON.parse(rawOwnerAccounts) as OwnerAccount[]) ?? [])
        : [];
      const nextOwnerAccounts = parsedOwnerAccounts
        .map(({ password: _password, ...account }) => ({
          ...account,
          email: normalizeAccountEmail(account.email),
        }))
        .filter((item) => normalizeAccountEmail(item.email) !== targetEmail);

      if (nextOwnerAccounts.length !== parsedOwnerAccounts.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.owner_accounts, JSON.stringify(nextOwnerAccounts));
      }

      if (normalizeAccountEmail(activeAccountEmail) === targetEmail) {
        await AsyncStorage.removeItem(STORAGE_KEYS.account_attivo);
      }

      if (normalizeAccountEmail(ownerSessionEmail) === targetEmail) {
        await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
      }

      if (normalizeAccountEmail(biometricLoginEmail) === targetEmail) {
        await AsyncStorage.removeItem(STORAGE_KEYS.biometric_login_email);
      }

      await AsyncStorage.multiRemove([...scopedKeysToRemove, ...extraKeysToRemove]).catch(
        () => undefined
      );
      await deleteSensitiveValue(
        secureOwnerPasswordKey(targetEmail),
        legacyOwnerPasswordKey(targetEmail)
      ).catch(() => undefined);
      await deleteSensitiveValue(
        secureBiometricPasswordKey(targetEmail),
        buildScopedStorageKey(STORAGE_KEYS.biometric_login_password, targetEmail)
      ).catch(() => undefined);

      const { data: sessionResult } = await supabase.auth.getSession();
      const sessionEmail = normalizeAccountEmail(sessionResult.session?.user?.email);
      if (sessionEmail === targetEmail) {
        await supabase.auth.signOut().catch(() => undefined);
        resetOnboardingState();
      }

      await AsyncStorage.setItem(ONE_OFF_OWNER_ACCOUNT_CLEANUP_DONE_KEY, 'true');
    } catch (error) {
      console.log('Errore pulizia one-shot account owner:', error);
    }
  }, [resetOnboardingState]);

  const beginOnboardingResolution = React.useCallback(() => {
    setOnboardingPending(true);
    setManualOnboardingVisible(false);
    setOnboardingReady(false);
  }, []);

  const readCachedOnboardingCompletion = React.useCallback(async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    const cachedValue = await AsyncStorage.getItem(
      buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, normalizedEmail)
    ).catch(() => null);

    if (cachedValue === 'true') return true;
    if (cachedValue === 'false') return false;
    return null;
  }, []);

  const persistCachedOnboardingCompletion = React.useCallback(
    async (email: string, completed: boolean) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        return;
      }

      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, normalizedEmail),
        completed ? 'true' : 'false'
      ).catch(() => undefined);
    },
    []
  );

  const readPendingFirstOnboardingFlag = React.useCallback(async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
      return false;
    }

    const rawValue = await AsyncStorage.getItem(
      buildScopedStorageKey(STORAGE_KEYS.onboarding_first_access_pending, normalizedEmail)
    ).catch(() => null);

    return rawValue === 'true';
  }, []);

  const persistPendingFirstOnboardingFlag = React.useCallback(
    async (email: string, pending: boolean) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        return;
      }

      const storageKey = buildScopedStorageKey(
        STORAGE_KEYS.onboarding_first_access_pending,
        normalizedEmail
      );

      if (pending) {
        await AsyncStorage.setItem(storageKey, 'true').catch(() => undefined);
        return;
      }

      await AsyncStorage.removeItem(storageKey).catch(() => undefined);
    },
    []
  );

  const prepareOnboardingStateForAuthenticatedAccount = React.useCallback(
    async (email: string, options?: { forceFirstAccess?: boolean }) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        resetOnboardingState();
        return false;
      }

      const shouldStartFirstAccessFlow =
        options?.forceFirstAccess === true ||
        (await readPendingFirstOnboardingFlag(normalizedEmail));

      if (shouldStartFirstAccessFlow) {
        onboardingSessionLockedEmailRef.current = normalizedEmail;
        beginOnboardingResolution();
        return true;
      }

      applyOnboardingCompletionState(true);
      await persistCachedOnboardingCompletion(normalizedEmail, true);
      await persistPendingFirstOnboardingFlag(normalizedEmail, false);
      return false;
    },
    [
      applyOnboardingCompletionState,
      beginOnboardingResolution,
      persistCachedOnboardingCompletion,
      persistPendingFirstOnboardingFlag,
      readPendingFirstOnboardingFlag,
      resetOnboardingState,
    ]
  );

  const persistOwnerOnboardingCompletionToServer = React.useCallback(
    async ({
      email,
      userId,
      completedAt,
    }: {
      email: string;
      userId?: string | null;
      completedAt?: string;
    }) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        return false;
      }

      const targetCompletedAt = completedAt ?? new Date().toISOString();
      const normalizedUserId = userId?.trim() ?? '';

      if (onboardingServerSyncInFlightRef.current) {
        return onboardingServerSyncInFlightRef.current;
      }

      const task = (async () => {
        try {
          if (normalizedUserId) {
            const { data, error } = await supabase
              .from('owner_profiles')
              .update({ onboarding_completed_at: targetCompletedAt })
              .eq('user_id', normalizedUserId)
              .select('id')
              .maybeSingle();

            if (!error && data?.id) {
              return true;
            }

          if (error) {
            if (!isMissingOwnerOnboardingColumnError(error)) {
              console.log('Errore update onboarding owner profile per user_id:', error);
            }
          }
          }

          const { data, error } = await supabase
            .from('owner_profiles')
            .update({ onboarding_completed_at: targetCompletedAt })
            .eq('email', normalizedEmail)
            .select('id')
            .maybeSingle();

          if (!error && data?.id) {
            return true;
          }

          if (error) {
            if (!isMissingOwnerOnboardingColumnError(error)) {
              console.log('Errore update onboarding owner profile per email:', error);
            }
          }
        } catch (error) {
          console.log('Errore persistenza onboarding owner profile:', error);
        }

        return false;
      })();

      onboardingServerSyncInFlightRef.current = task;

      try {
        return await task;
      } finally {
        if (onboardingServerSyncInFlightRef.current === task) {
          onboardingServerSyncInFlightRef.current = null;
        }
      }
    },
    []
  );

  const syncLegacyCompletedOnboardingToServer = React.useCallback(
    async (email: string, userId?: string | null) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        return false;
      }

      const cachedCompleted = await readCachedOnboardingCompletion(normalizedEmail);
      if (cachedCompleted !== true) {
        return false;
      }

      const persisted = await persistOwnerOnboardingCompletionToServer({
        email: normalizedEmail,
        userId,
      });

      if (persisted) {
        await persistCachedOnboardingCompletion(normalizedEmail, true);
      }

      return cachedCompleted === true;
    },
    [
      persistCachedOnboardingCompletion,
      persistOwnerOnboardingCompletionToServer,
      readCachedOnboardingCompletion,
    ]
  );

  const syncOwnerOnboardingState = React.useCallback(
    async (email: string, applyToState = true) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        if (applyToState) {
          resetOnboardingState();
        }
        return false;
      }

      const requestSeq = onboardingSyncRequestSeqRef.current + 1;
      onboardingSyncRequestSeqRef.current = requestSeq;

      let resolvedCompleted: boolean | null = null;
      let resolvedUserId: string | null = null;
      let hasReadableServerRow = false;
      const cachedCompleted = await readCachedOnboardingCompletion(normalizedEmail);
      const pendingFirstOnboarding = await readPendingFirstOnboardingFlag(normalizedEmail);

      if (
        onboardingSessionLockedEmailRef.current === normalizedEmail &&
        (pendingFirstOnboarding || cachedCompleted === false)
      ) {
        if (applyToState && onboardingSyncRequestSeqRef.current === requestSeq) {
          beginOnboardingResolution();
        }
        return false;
      }

      try {
        const { data: sessionResult } = await supabase.auth.getSession();
        const sessionUserId = sessionResult.session?.user?.id ?? null;
        resolvedUserId = sessionUserId;

        if (sessionUserId) {
          const { data, error } = await supabase
            .from('owner_profiles')
            .select('id, onboarding_completed_at')
            .eq('user_id', sessionUserId)
            .maybeSingle();

          if (!error && data?.id) {
            hasReadableServerRow = true;
            resolvedCompleted = !!data?.onboarding_completed_at;
          } else {
            if (error) {
              if (isMissingOwnerOnboardingColumnError(error)) {
                resolvedCompleted = cachedCompleted ?? true;
              } else {
                console.log('Errore lettura onboarding owner profile per user_id:', error);
              }
            }
          }
        }

        if (resolvedCompleted === null) {
          const { data, error } = await supabase
            .from('owner_profiles')
            .select('id, onboarding_completed_at')
            .eq('email', normalizedEmail)
            .maybeSingle();

          if (!error && data?.id) {
            hasReadableServerRow = true;
            resolvedCompleted = !!data?.onboarding_completed_at;
          } else {
            if (error) {
              if (isMissingOwnerOnboardingColumnError(error)) {
                resolvedCompleted = cachedCompleted ?? true;
              } else {
                if (!shouldSilenceTransientSyncError(error)) {
                  console.log('Errore lettura onboarding owner profile per email:', error);
                }
              }
            }
          }
        }
      } catch (error) {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione stato onboarding owner:', error);
        }
      }

      if (resolvedCompleted === true) {
        await persistCachedOnboardingCompletion(normalizedEmail, true);
        await persistPendingFirstOnboardingFlag(normalizedEmail, false);
      } else if (cachedCompleted === true) {
        const migrated = await syncLegacyCompletedOnboardingToServer(
          normalizedEmail,
          resolvedUserId
        );
        if (migrated) {
          resolvedCompleted = true;
          await persistPendingFirstOnboardingFlag(normalizedEmail, false);
        }
      } else if (resolvedCompleted === false) {
        if (pendingFirstOnboarding) {
          await persistCachedOnboardingCompletion(normalizedEmail, false);
        } else {
          resolvedCompleted = true;
          await persistCachedOnboardingCompletion(normalizedEmail, true);
          await persistPendingFirstOnboardingFlag(normalizedEmail, false);
        }
      } else if (resolvedCompleted === null && pendingFirstOnboarding) {
        resolvedCompleted = false;
        await persistCachedOnboardingCompletion(normalizedEmail, false);
      } else if (!hasReadableServerRow) {
        // If no readable backend row exists yet, avoid forcing onboarding again on a returning account.
        resolvedCompleted = true;
        await persistCachedOnboardingCompletion(normalizedEmail, true);
        await persistPendingFirstOnboardingFlag(normalizedEmail, false);
      }

      if (applyToState && onboardingSyncRequestSeqRef.current === requestSeq) {
        applyOnboardingCompletionState(resolvedCompleted ?? true);
      }

      return resolvedCompleted ?? true;
    },
    [
      applyOnboardingCompletionState,
      persistCachedOnboardingCompletion,
      persistPendingFirstOnboardingFlag,
      readPendingFirstOnboardingFlag,
      readCachedOnboardingCompletion,
      resetOnboardingState,
      syncLegacyCompletedOnboardingToServer,
    ]
  );

  const loadExistingOwnerWorkspaceRecord = React.useCallback(async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select(
          'id, slug, salon_name, owner_email, owner_phone, cash_section_disabled, customer_reminder_hours_before, subscription_plan, subscription_status, created_at, updated_at'
        )
        .eq('owner_email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data ?? null) as RemoteWorkspaceRow | null;
    } catch (error) {
      console.log('Errore lettura workspace owner esistente:', error);
      return null;
    }
  }, []);

  const clearRuntimeDataForAccount = React.useCallback((email: string) => {
    lastServicesBackendSyncSignatureRef.current = '';
    lastCashBackendSyncSignatureRef.current = '';
    lastCardsBackendSyncSignatureRef.current = '';
    lastEventsBackendSyncSignatureRef.current = '';
    lastTemplateBackendSyncValueRef.current = '';
    lastOwnerSnapshotSyncSignatureRef.current = '';
    if (servicesBackendSyncDebounceRef.current) {
      clearTimeout(servicesBackendSyncDebounceRef.current);
      servicesBackendSyncDebounceRef.current = null;
    }
    if (cashBackendSyncDebounceRef.current) {
      clearTimeout(cashBackendSyncDebounceRef.current);
      cashBackendSyncDebounceRef.current = null;
    }
    if (eventsBackendSyncDebounceRef.current) {
      clearTimeout(eventsBackendSyncDebounceRef.current);
      eventsBackendSyncDebounceRef.current = null;
    }
    if (ownerSnapshotSyncDebounceRef.current) {
      clearTimeout(ownerSnapshotSyncDebounceRef.current);
      ownerSnapshotSyncDebounceRef.current = null;
    }
    setSalonWorkspace(createDefaultWorkspace(email));
    setClienti(normalizeClienti([]));
    setAppuntamenti(normalizeAppuntamenti([]));
    setMovimenti(normalizeMovimenti([]));
    setServizi(normalizeServizi([]));
    setOperatori(normalizeOperatori([]));
    setMacchinari(normalizeMacchinari([]));
    setCarteCollegate(normalizeCarte([]));
    setEventi(normalizeEventi([]));
    setRichiestePrenotazione([]);
    setAvailabilitySettings(normalizeAvailabilitySettings());
    setBiometricEnabled(false);
    resetOnboardingState();
    setMessaggioEventoTemplate(
      'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
    );
    setServiceCardColorOverrides({});
    setRoleCardColorOverrides({});
  }, [resetOnboardingState]);

  const syncAuthenticatedWorkspace = React.useCallback(
    async (email: string, applyToState = true) => {
      const normalizedEmail = normalizeAccountEmail(email);

      if (!normalizedEmail) {
        return createDefaultWorkspace('');
      }

      const workspaceStorageKey = buildScopedStorageKey(STORAGE_KEYS.workspace, normalizedEmail);
      let storedWorkspace: Partial<SalonWorkspace> | null = null;
      let storedCashSectionDisabled: boolean | undefined;
      let storedAutoAcceptBookingRequests: boolean | undefined;
      let storedAutoAcceptBookingRequestsUpdatedAt: string | undefined;
      let storedCustomerReminderHoursBefore: number | undefined;

      try {
        const [
          rawStoredWorkspace,
          rawStoredCashSectionDisabled,
          rawStoredAutoAcceptBookingRequests,
          rawStoredAutoAcceptBookingRequestsUpdatedAt,
          rawStoredCustomerReminderHoursBefore,
        ] = await Promise.all([
          AsyncStorage.getItem(workspaceStorageKey),
          AsyncStorage.getItem(
            buildScopedStorageKey(STORAGE_KEYS.workspace_cash_section_disabled, normalizedEmail)
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_customer_reminder_hours_before,
              normalizedEmail
            )
          ),
        ]);
        storedWorkspace = rawStoredWorkspace
          ? (JSON.parse(rawStoredWorkspace) as Partial<SalonWorkspace>)
          : null;
        storedCashSectionDisabled =
          rawStoredCashSectionDisabled === 'true'
            ? true
            : rawStoredCashSectionDisabled === 'false'
              ? false
              : undefined;
        storedAutoAcceptBookingRequests =
          rawStoredAutoAcceptBookingRequests === 'true'
            ? true
            : rawStoredAutoAcceptBookingRequests === 'false'
              ? false
              : undefined;
        storedAutoAcceptBookingRequestsUpdatedAt =
          rawStoredAutoAcceptBookingRequestsUpdatedAt?.trim() || undefined;
        if (rawStoredCustomerReminderHoursBefore?.trim()) {
          const parsedReminder = Number(rawStoredCustomerReminderHoursBefore);
          if (Number.isFinite(parsedReminder)) {
            storedCustomerReminderHoursBefore = Math.max(
              0,
              Math.min(168, Math.round(parsedReminder))
            );
          }
        }
      } catch (error) {
        console.log('Errore lettura workspace salvato:', error);
      }

      storedWorkspace = mergeWorkspacePreferenceOverrides({
        workspace: storedWorkspace,
        cashSectionDisabled: storedCashSectionDisabled,
        autoAcceptBookingRequests: storedAutoAcceptBookingRequests,
        autoAcceptBookingRequestsUpdatedAt: storedAutoAcceptBookingRequestsUpdatedAt,
        customerReminderHoursBefore: storedCustomerReminderHoursBefore,
        email: normalizedEmail,
      });

      const matchingOwnerAccount = (await loadOwnerAccounts()).find(
        (item) => normalizeAccountEmail(item.email) === normalizedEmail
      );
      const ownerAccountWorkspaceSeed = buildWorkspaceSeedFromOwnerAccount(matchingOwnerAccount);

      if (ownerAccountWorkspaceSeed) {
        storedWorkspace = mergeWorkspacePreservingLocalProfile({
          localWorkspace: ownerAccountWorkspaceSeed,
          remoteWorkspace: storedWorkspace,
          email: normalizedEmail,
        });
      }

      const fallbackWorkspace = normalizeWorkspace(storedWorkspace, normalizedEmail);

      try {
        const { data, error } = await supabase
          .from('workspaces')
          .select(
            'id, slug, salon_name, owner_email, owner_phone, cash_section_disabled, customer_reminder_hours_before, subscription_plan, subscription_status, created_at, updated_at'
          )
          .eq('owner_email', normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const remoteWorkspace = (data ?? null) as RemoteWorkspaceRow | null;

        let nextWorkspace = remoteWorkspace
          ? mergeWorkspacePreservingLocalProfile({
              localWorkspace: storedWorkspace,
              remoteWorkspace: {
                ...storedWorkspace,
                id: remoteWorkspace.id,
                salonCode: remoteWorkspace.slug,
                salonName: remoteWorkspace.salon_name,
                ownerEmail: remoteWorkspace.owner_email,
                businessPhone: remoteWorkspace.owner_phone ?? undefined,
                cashSectionDisabled:
                  typeof storedCashSectionDisabled === 'boolean'
                    ? storedCashSectionDisabled
                    : remoteWorkspace.cash_section_disabled ?? undefined,
                customerReminderHoursBefore:
                  remoteWorkspace.customer_reminder_hours_before ?? undefined,
                subscriptionPlan: remoteWorkspace.subscription_plan,
                subscriptionStatus: remoteWorkspace.subscription_status,
                createdAt: remoteWorkspace.created_at,
                updatedAt: remoteWorkspace.updated_at,
              },
              email: normalizedEmail,
            })
          : fallbackWorkspace;

        if (remoteWorkspace?.id) {
          setOwnerProfileNeedsCompletion(false);
        }

        await AsyncStorage.setItem(workspaceStorageKey, JSON.stringify(nextWorkspace));
        const privateServerState = isUuidValue(nextWorkspace.id)
          ? await loadOwnerPrivateServerState(nextWorkspace.id)
          : null;

        if (privateServerState) {
          await Promise.all([
            AsyncStorage.setItem(
              buildScopedStorageKey(STORAGE_KEYS.movimenti, normalizedEmail),
              JSON.stringify(privateServerState.movimenti ?? normalizeMovimenti([]))
            ),
            AsyncStorage.setItem(
              buildScopedStorageKey(STORAGE_KEYS.carte, normalizedEmail),
              JSON.stringify(privateServerState.carteCollegate ?? normalizeCarte([]))
            ),
            AsyncStorage.setItem(
              buildScopedStorageKey(STORAGE_KEYS.eventi, normalizedEmail),
              JSON.stringify(privateServerState.eventi ?? normalizeEventi([]))
            ),
            AsyncStorage.setItem(
              buildScopedStorageKey(STORAGE_KEYS.eventi_template, normalizedEmail),
              privateServerState.messaggioEventoTemplate ||
                'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
            ),
          ]);

          if (applyToState) {
            setMovimenti(privateServerState.movimenti ?? normalizeMovimenti([]));
            setCarteCollegate(privateServerState.carteCollegate ?? normalizeCarte([]));
            setEventi(privateServerState.eventi ?? normalizeEventi([]));
            setMessaggioEventoTemplate(
              privateServerState.messaggioEventoTemplate ||
                'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
            );
          }
        }

        if (nextWorkspace.salonCode) {
          try {
            const remotePortalSnapshot = await fetchPortalSnapshotWithRetry(nextWorkspace.salonCode);

            if (
              remotePortalSnapshot &&
              normalizeAccountEmail(remotePortalSnapshot.workspace.ownerEmail) === normalizedEmail
            ) {
              nextWorkspace = mergeWorkspacePreservingLocalProfile({
                localWorkspace: nextWorkspace,
                remoteWorkspace: {
                  ...remotePortalSnapshot.workspace,
                  // Keep these workspace-only preferences sourced from the authenticated workspace,
                  // not from the public portal snapshot refresh path.
                  cashSectionDisabled: nextWorkspace.cashSectionDisabled,
                  autoAcceptBookingRequests: nextWorkspace.autoAcceptBookingRequests,
                  autoAcceptBookingRequestsUpdatedAt:
                    nextWorkspace.autoAcceptBookingRequestsUpdatedAt,
                  customerReminderHoursBefore: nextWorkspace.customerReminderHoursBefore,
                  updatedAt: nextWorkspace.updatedAt,
                },
                email: normalizedEmail,
              });
              const nextClienti = normalizeClienti(remotePortalSnapshot.clienti as Cliente[]);
              const nextAppuntamenti = normalizeAppuntamenti(
                remotePortalSnapshot.appuntamenti as Appuntamento[]
              );
              const nextServizi = normalizeServizi(remotePortalSnapshot.servizi as Servizio[]);
              const nextOperatori = normalizeOperatori(remotePortalSnapshot.operatori as Operatore[]);
              const nextRichieste = normalizeRichiestePrenotazione(
                remotePortalSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
              );
              const nextAvailability = normalizeAvailabilitySettings(
                remotePortalSnapshot.availabilitySettings
              );
              const privateServerState = isUuidValue(nextWorkspace.id)
                ? await loadOwnerPrivateServerState(nextWorkspace.id)
                : null;
              const snapshotServices = privateServerState?.ownerSnapshot?.servizi ?? [];
              const snapshotOperatori = privateServerState?.ownerSnapshot?.operatori ?? [];
              const snapshotMacchinari = privateServerState?.ownerSnapshot?.macchinari ?? [];
              const snapshotRichieste = privateServerState?.ownerSnapshot?.richiestePrenotazione ?? [];
              const snapshotAvailability = privateServerState?.ownerSnapshot?.availabilitySettings;
              const snapshotServiceOverrides =
                privateServerState?.ownerSnapshot?.serviceCardColorOverrides ?? {};
              const snapshotRoleOverrides =
                privateServerState?.ownerSnapshot?.roleCardColorOverrides ?? {};
              const mergedServizi = normalizeServizi(
                mergeServiziCollections(nextServizi, snapshotServices)
              );
              const mergedOperatori =
                snapshotOperatori.length > 0 ? normalizeOperatori(snapshotOperatori) : nextOperatori;
              const mergedMacchinari =
                snapshotMacchinari.length > 0 ? normalizeMacchinari(snapshotMacchinari) : normalizeMacchinari([]);
              const mergedRichieste = normalizeRichiestePrenotazione(
                mergeRichiesteCollections(nextRichieste, snapshotRichieste)
              );
              const mergedAvailability = snapshotAvailability
                ? normalizeAvailabilitySettings(snapshotAvailability)
                : nextAvailability;
              const mergedServiceOverrides = mergeServiceColorOverrideMaps({
                remoteOverrides: remotePortalSnapshot.serviceCardColorOverrides ?? {},
                localOverrides: snapshotServiceOverrides,
                services: mergedServizi,
              });
              const mergedRoleOverrides = mergeRoleColorOverrideMaps({
                remoteOverrides: remotePortalSnapshot.roleCardColorOverrides ?? {},
                localOverrides: snapshotRoleOverrides,
              });

              await Promise.all([
                AsyncStorage.setItem(workspaceStorageKey, JSON.stringify(nextWorkspace)),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.clienti, normalizedEmail),
                  JSON.stringify(nextClienti)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.appuntamenti, normalizedEmail),
                  JSON.stringify(nextAppuntamenti)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.servizi, normalizedEmail),
                  JSON.stringify(mergedServizi)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.operatori, normalizedEmail),
                  JSON.stringify(mergedOperatori)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.macchinari, normalizedEmail),
                  JSON.stringify(mergedMacchinari)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.movimenti, normalizedEmail),
                  JSON.stringify(privateServerState?.movimenti ?? normalizeMovimenti([]))
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.carte, normalizedEmail),
                  JSON.stringify(privateServerState?.carteCollegate ?? normalizeCarte([]))
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.eventi, normalizedEmail),
                  JSON.stringify(privateServerState?.eventi ?? normalizeEventi([]))
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, normalizedEmail),
                  JSON.stringify(mergedRichieste)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.availability_settings, normalizedEmail),
                  JSON.stringify(mergedAvailability)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.eventi_template, normalizedEmail),
                  privateServerState?.messaggioEventoTemplate ||
                    'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.service_card_color_overrides, normalizedEmail),
                  JSON.stringify(mergedServiceOverrides)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.role_card_color_overrides, normalizedEmail),
                  JSON.stringify(mergedRoleOverrides)
                ),
              ]);

              if (applyToState) {
                setSalonWorkspace(nextWorkspace);
                setClienti(nextClienti);
                setAppuntamenti(nextAppuntamenti);
                setMovimenti(privateServerState?.movimenti ?? normalizeMovimenti([]));
                setServizi(mergedServizi);
                setOperatori(mergedOperatori);
                setMacchinari(mergedMacchinari);
                setCarteCollegate(privateServerState?.carteCollegate ?? normalizeCarte([]));
                setEventi(privateServerState?.eventi ?? normalizeEventi([]));
                setRichiestePrenotazione(mergedRichieste);
                setAvailabilitySettings(mergedAvailability);
                setMessaggioEventoTemplate(
                  privateServerState?.messaggioEventoTemplate ||
                    'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
                );
                setServiceCardColorOverrides(mergedServiceOverrides);
                setRoleCardColorOverrides(mergedRoleOverrides);
              }
            }
          } catch (portalSyncError) {
            console.log('Errore idratazione snapshot servizi/account autenticato:', portalSyncError);
          }
        }

        if (applyToState) {
          setSalonWorkspace(nextWorkspace);
        }

        return nextWorkspace;
      } catch (error) {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione workspace autenticato:', error);
        }

        if (applyToState) {
          setSalonWorkspace(fallbackWorkspace);
        }

        return fallbackWorkspace;
      }
    },
    [fetchPortalSnapshotWithRetry, loadOwnerPrivateServerState]
  );

  const completeOnboarding = React.useCallback(async () => {
    setManualOnboardingVisible(false);

    if (!onboardingPending || hasCompletedOnboarding || !salonAccountEmail) {
      return;
    }

    const completedAt = new Date().toISOString();
    applyOnboardingCompletionState(true);
    await persistCachedOnboardingCompletion(salonAccountEmail, true);
    await persistPendingFirstOnboardingFlag(salonAccountEmail, false);

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const sessionUserId = sessionResult.session?.user?.id ?? null;

      if (!sessionUserId) {
        throw new Error('owner_session_missing_for_onboarding_completion');
      }

      const persisted = await persistOwnerOnboardingCompletionToServer({
        email: salonAccountEmail,
        userId: sessionUserId,
        completedAt,
      });

      if (!persisted) {
        throw new Error('owner_onboarding_completion_not_persisted');
      }
    } catch (error) {
      console.log('Errore persistenza completamento onboarding owner:', error);
      await syncOwnerOnboardingState(salonAccountEmail);
    }
  }, [
    applyOnboardingCompletionState,
    hasCompletedOnboarding,
    onboardingPending,
    persistCachedOnboardingCompletion,
    persistPendingFirstOnboardingFlag,
    persistOwnerOnboardingCompletionToServer,
    salonAccountEmail,
    syncOwnerOnboardingState,
  ]);

  const reopenOnboarding = React.useCallback(() => {
    setManualOnboardingVisible(true);
    setOnboardingReady(true);
  }, []);

  const showOnboarding = manualOnboardingVisible || (onboardingPending && onboardingReady);

  const consumeOwnerProfileNeedsCompletion = React.useCallback(() => {
    if (!ownerProfileNeedsCompletion) {
      return false;
    }

    setOwnerProfileNeedsCompletion(false);
    return true;
  }, [ownerProfileNeedsCompletion]);

  React.useEffect(() => {
    pendingBiometricUnlockRef.current = pendingBiometricUnlock;
  }, [pendingBiometricUnlock]);

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
        await runOneOffOwnerAccountCleanup();

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

        setHasInitializedAuth(true);

        if (authSessionEmail) {
          void prepareOnboardingStateForAuthenticatedAccount(authSessionEmail);
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
  }, [
    prepareOnboardingStateForAuthenticatedAccount,
    runOneOffOwnerAccountCleanup,
    syncAuthenticatedWorkspace,
  ]);

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
        setSalonAccountEmail('');
        clearRuntimeDataForAccount('');
        setIsLoaded(true);
        resetOnboardingState();
        return;
      }

      AsyncStorage.setItem(STORAGE_KEYS.owner_session, authEmail).catch(() => undefined);
      AsyncStorage.setItem(STORAGE_KEYS.account_attivo, authEmail).catch(() => undefined);
      setSalonAccountEmail(authEmail);
      setIsAuthenticated(true);
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        setOwnerPasswordRecoveryActive(false);
      }
      void (async () => {
        await prepareOnboardingStateForAuthenticatedAccount(authEmail);
        await syncAuthenticatedWorkspace(authEmail, true);
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    clearRuntimeDataForAccount,
    prepareOnboardingStateForAuthenticatedAccount,
    resetOnboardingState,
    syncAuthenticatedWorkspace,
  ]);

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
        clearRuntimeDataForAccount('');
        setIsLoaded(true);
        return;
      }

      setIsLoaded(false);

      try {
        const clientiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail)
        );
        const workspaceSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail)
        );
        const cashSectionDisabledSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace_cash_section_disabled, salonAccountEmail)
        );
        const autoAcceptBookingRequestsSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(
            STORAGE_KEYS.workspace_auto_accept_booking_requests,
            salonAccountEmail
          )
        );
        const autoAcceptBookingRequestsUpdatedAtSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(
            STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
            salonAccountEmail
          )
        );
        const customerReminderHoursBeforeSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(
            STORAGE_KEYS.workspace_customer_reminder_hours_before,
            salonAccountEmail
          )
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
        const storedWorkspace = mergeWorkspacePreferenceOverrides({
          workspace: workspaceSalvato
            ? (JSON.parse(workspaceSalvato) as Partial<SalonWorkspace>)
            : createDefaultWorkspace(salonAccountEmail),
          cashSectionDisabled:
            cashSectionDisabledSalvato === 'true'
              ? true
              : cashSectionDisabledSalvato === 'false'
                ? false
                : undefined,
          autoAcceptBookingRequests:
            autoAcceptBookingRequestsSalvato === 'true'
              ? true
              : autoAcceptBookingRequestsSalvato === 'false'
                ? false
                : undefined,
          autoAcceptBookingRequestsUpdatedAt:
            autoAcceptBookingRequestsUpdatedAtSalvato?.trim() || undefined,
          customerReminderHoursBefore:
            customerReminderHoursBeforeSalvato?.trim() &&
            Number.isFinite(Number(customerReminderHoursBeforeSalvato))
              ? Math.max(
                  0,
                  Math.min(168, Math.round(Number(customerReminderHoursBeforeSalvato)))
                )
              : undefined,
          email: salonAccountEmail,
        });
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
        let nextMovimenti: Movimento[] = movimentiSalvati
          ? normalizeMovimenti(JSON.parse(movimentiSalvati))
          : normalizeMovimenti([]);
        let nextMacchinari: Macchinario[] = macchinariSalvati ? normalizeMacchinari(JSON.parse(macchinariSalvati)) : [];
        let nextCarte: CartaCollegata[] = carteSalvate ? normalizeCarte(JSON.parse(carteSalvate)) : [];
        let nextEventi: Evento[] = eventiSalvati ? normalizeEventi(JSON.parse(eventiSalvati)) : [];
        let nextTemplateEventi =
          templateEventiSalvato ??
          'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.';
        const nextServiceCardOverrides = serviceCardColorsSalvate ? JSON.parse(serviceCardColorsSalvate) : {};
        const nextRoleCardOverrides = roleCardColorsSalvate ? JSON.parse(roleCardColorsSalvate) : {};
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
        setIsLoaded(true);
        void syncOwnerOnboardingState(salonAccountEmail);

        if (storedWorkspace.salonCode) {
          try {
            const remoteSnapshot = await fetchPortalSnapshotWithRetry(storedWorkspace.salonCode);

            if (
              remoteSnapshot &&
              normalizeAccountEmail(remoteSnapshot.workspace.ownerEmail) ===
                normalizeAccountEmail(salonAccountEmail)
            ) {
              const privateServerState = isUuidValue(nextWorkspace.id)
                ? await loadOwnerPrivateServerState(nextWorkspace.id)
                : null;
              nextWorkspace = mergeWorkspacePreservingLocalProfile({
                localWorkspace: nextWorkspace,
                remoteWorkspace: {
                  ...remoteSnapshot.workspace,
                  cashSectionDisabled: nextWorkspace.cashSectionDisabled,
                  autoAcceptBookingRequests: nextWorkspace.autoAcceptBookingRequests,
                  autoAcceptBookingRequestsUpdatedAt:
                    nextWorkspace.autoAcceptBookingRequestsUpdatedAt,
                  customerReminderHoursBefore: nextWorkspace.customerReminderHoursBefore,
                  updatedAt: nextWorkspace.updatedAt,
                },
                email: salonAccountEmail,
              });
              nextClienti = filterRecentlyDeletedCustomers(
                normalizeClienti(remoteSnapshot.clienti as Cliente[])
              );
              nextAppuntamenti = normalizeAppuntamenti(
                filterRecentlyDeletedAppointments(
                  normalizeAppuntamenti(remoteSnapshot.appuntamenti as Appuntamento[])
                )
              );
              nextServizi = normalizeServizi(
                mergeServiziCollections(
                  normalizeServizi(remoteSnapshot.servizi as Servizio[]),
                  privateServerState?.ownerSnapshot?.servizi ?? []
                )
              );
              nextOperatori =
                privateServerState?.ownerSnapshot?.operatori?.length
                  ? normalizeOperatori(privateServerState.ownerSnapshot.operatori)
                  : normalizeOperatori(remoteSnapshot.operatori as Operatore[]);
              nextMacchinari =
                privateServerState?.ownerSnapshot?.macchinari?.length
                  ? normalizeMacchinari(privateServerState.ownerSnapshot.macchinari)
                  : nextMacchinari;
              nextMovimenti = privateServerState?.movimenti ?? nextMovimenti;
              nextCarte = privateServerState?.carteCollegate ?? nextCarte;
              nextEventi = privateServerState?.eventi ?? nextEventi;
              nextTemplateEventi =
                privateServerState?.messaggioEventoTemplate || nextTemplateEventi;
              nextRichieste = normalizeRichiestePrenotazione(
                mergeRichiesteCollections(
                  normalizeRichiestePrenotazione(
                    remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
                  ),
                  privateServerState?.ownerSnapshot?.richiestePrenotazione ?? []
                )
              );
              nextAvailabilitySettings =
                privateServerState?.ownerSnapshot?.availabilitySettings
                  ? normalizeAvailabilitySettings(privateServerState.ownerSnapshot.availabilitySettings)
                  : normalizeAvailabilitySettings(remoteSnapshot.availabilitySettings);
              const mergedServiceCardOverrides = mergeServiceColorOverrideMaps({
                remoteOverrides: remoteSnapshot.serviceCardColorOverrides ?? {},
                localOverrides:
                  privateServerState?.ownerSnapshot?.serviceCardColorOverrides ??
                  nextServiceCardOverrides,
                services: nextServizi,
              });
              const mergedRoleCardOverrides = mergeRoleColorOverrideMaps({
                remoteOverrides: remoteSnapshot.roleCardColorOverrides ?? {},
                localOverrides:
                  privateServerState?.ownerSnapshot?.roleCardColorOverrides ??
                  nextRoleCardOverrides,
              });
              Object.assign(nextServiceCardOverrides, mergedServiceCardOverrides);
              Object.assign(nextRoleCardOverrides, mergedRoleCardOverrides);

              await AsyncStorage.setItem(
                buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
                JSON.stringify(nextWorkspace)
              );
              await Promise.all([
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail),
                  JSON.stringify(nextClienti)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.appuntamenti, salonAccountEmail),
                  JSON.stringify(nextAppuntamenti)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.movimenti, salonAccountEmail),
                  JSON.stringify(nextMovimenti)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.servizi, salonAccountEmail),
                  JSON.stringify(nextServizi)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.operatori, salonAccountEmail),
                  JSON.stringify(nextOperatori)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.macchinari, salonAccountEmail),
                  JSON.stringify(nextMacchinari)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.carte, salonAccountEmail),
                  JSON.stringify(nextCarte)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.eventi, salonAccountEmail),
                  JSON.stringify(nextEventi)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, salonAccountEmail),
                  JSON.stringify(nextRichieste)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail),
                  JSON.stringify(nextAvailabilitySettings)
                ),
                AsyncStorage.setItem(
                  buildScopedStorageKey(STORAGE_KEYS.eventi_template, salonAccountEmail),
                  nextTemplateEventi
                ),
              ]);

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
            if (!shouldSilenceTransientSyncError(error)) {
              console.log('Errore reidratazione snapshot remoto owner:', error);
            }
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
        setCarteCollegate(normalizeCarte([]));
        setEventi(normalizeEventi([]));
        setRichiestePrenotazione([]);
        setAvailabilitySettings(normalizeAvailabilitySettings());
        setBiometricEnabled(false);
        resetOnboardingState();
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
    filterRecentlyDeletedAppointments,
    fetchPortalSnapshotWithRetry,
    filterRecentlyDeletedCustomers,
    hasInitializedAuth,
    loadOwnerPrivateServerState,
    resetOnboardingState,
    salonAccountEmail,
    syncOwnerOnboardingState,
  ]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.app_language, appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !hasInitializedAuth || !salonAccountEmail) return;

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
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore pubblicazione portale cliente:', error);
        }
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
  ]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const workspaceId = salonWorkspace.id?.trim() ?? '';
    if (!isUuidValue(workspaceId)) {
      return;
    }

    if (servicesBackendSyncDebounceRef.current) {
      clearTimeout(servicesBackendSyncDebounceRef.current);
    }

    servicesBackendSyncDebounceRef.current = setTimeout(() => {
      void syncServicesTableForWorkspace(workspaceId, servizi).catch((error) => {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione backend servizi:', error);
        }
      });
    }, 420);

    return () => {
      if (servicesBackendSyncDebounceRef.current) {
        clearTimeout(servicesBackendSyncDebounceRef.current);
        servicesBackendSyncDebounceRef.current = null;
      }
    };
  }, [
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    salonAccountEmail,
    salonWorkspace.id,
    servizi,
    syncServicesTableForWorkspace,
  ]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const workspaceId = salonWorkspace.id?.trim() ?? '';
    if (!isUuidValue(workspaceId)) {
      return;
    }

    if (cashBackendSyncDebounceRef.current) {
      clearTimeout(cashBackendSyncDebounceRef.current);
    }

    cashBackendSyncDebounceRef.current = setTimeout(() => {
      void syncCashTablesForWorkspace(workspaceId, movimenti, carteCollegate).catch((error) => {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione backend cassa:', error);
        }
      });
    }, 420);

    return () => {
      if (cashBackendSyncDebounceRef.current) {
        clearTimeout(cashBackendSyncDebounceRef.current);
        cashBackendSyncDebounceRef.current = null;
      }
    };
  }, [
    carteCollegate,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    movimenti,
    salonAccountEmail,
    salonWorkspace.id,
    syncCashTablesForWorkspace,
  ]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const workspaceId = salonWorkspace.id?.trim() ?? '';
    if (!isUuidValue(workspaceId)) {
      return;
    }

    if (eventsBackendSyncDebounceRef.current) {
      clearTimeout(eventsBackendSyncDebounceRef.current);
    }

    eventsBackendSyncDebounceRef.current = setTimeout(() => {
      void syncEventsAndTemplateForWorkspace(
        workspaceId,
        eventi,
        messaggioEventoTemplate
      ).catch((error) => {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione backend eventi/template:', error);
        }
      });
    }, 420);

    return () => {
      if (eventsBackendSyncDebounceRef.current) {
        clearTimeout(eventsBackendSyncDebounceRef.current);
        eventsBackendSyncDebounceRef.current = null;
      }
    };
  }, [
    eventi,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    messaggioEventoTemplate,
    salonAccountEmail,
    salonWorkspace.id,
    syncEventsAndTemplateForWorkspace,
  ]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const workspaceId = salonWorkspace.id?.trim() ?? '';
    if (!isUuidValue(workspaceId)) {
      return;
    }

    if (ownerSnapshotSyncDebounceRef.current) {
      clearTimeout(ownerSnapshotSyncDebounceRef.current);
    }

    ownerSnapshotSyncDebounceRef.current = setTimeout(() => {
      void syncOwnerSnapshotForWorkspace(workspaceId, {
        workspace: salonWorkspace,
        clienti,
        appuntamenti,
        movimenti,
        servizi,
        operatori,
        macchinari,
        carteCollegate,
        eventi,
        richiestePrenotazione,
        availabilitySettings,
        messaggioEventoTemplate,
        serviceCardColorOverrides,
        roleCardColorOverrides,
      }).catch((error) => {
        if (!shouldSilenceTransientSyncError(error)) {
          console.log('Errore sincronizzazione snapshot owner privata:', error);
        }
      });
    }, 650);

    return () => {
      if (ownerSnapshotSyncDebounceRef.current) {
        clearTimeout(ownerSnapshotSyncDebounceRef.current);
        ownerSnapshotSyncDebounceRef.current = null;
      }
    };
  }, [
    appuntamenti,
    availabilitySettings,
    carteCollegate,
    clienti,
    eventi,
    hasInitializedAuth,
    isAuthenticated,
    isLoaded,
    macchinari,
    messaggioEventoTemplate,
    movimenti,
    operatori,
    richiestePrenotazione,
    roleCardColorOverrides,
    salonAccountEmail,
    salonWorkspace,
    serviceCardColorOverrides,
    servizi,
    syncOwnerSnapshotForWorkspace,
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
    AsyncStorage.multiSet([
      [
        buildScopedStorageKey(STORAGE_KEYS.workspace_cash_section_disabled, salonAccountEmail),
        salonWorkspace.cashSectionDisabled ? 'true' : 'false',
      ],
      [
        buildScopedStorageKey(
          STORAGE_KEYS.workspace_auto_accept_booking_requests,
          salonAccountEmail
        ),
        salonWorkspace.autoAcceptBookingRequests ? 'true' : 'false',
      ],
      [
        buildScopedStorageKey(
          STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
          salonAccountEmail
        ),
        salonWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim() || '',
      ],
      [
        buildScopedStorageKey(
          STORAGE_KEYS.workspace_customer_reminder_hours_before,
          salonAccountEmail
        ),
        String(
          Math.max(0, Math.min(168, Math.round(salonWorkspace.customerReminderHoursBefore ?? 24)))
        ),
      ],
    ]).catch((error) => {
      console.log('Errore persistenza preferenze workspace scoped:', error);
    });
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
    ).catch(() => undefined);
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
      const currentWorkspace = salonWorkspaceRef.current;
      const resolved = typeof updater === 'function'
        ? (updater as (current: SalonWorkspace) => SalonWorkspace)(currentWorkspace)
        : updater;
      const workspaceSnapshot = normalizeWorkspace(
        {
          ...resolved,
          ownerEmail: salonAccountEmail || resolved.ownerEmail || currentWorkspace.ownerEmail,
          updatedAt: new Date().toISOString(),
        },
        salonAccountEmail || resolved.ownerEmail || currentWorkspace.ownerEmail
      );

      salonWorkspaceRef.current = workspaceSnapshot;
      setSalonWorkspace(workspaceSnapshot);

      if (!isLoaded || !salonAccountEmail) return;

      try {
        await AsyncStorage.setItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
          JSON.stringify(workspaceSnapshot)
        );
        await AsyncStorage.multiSet([
          [
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_cash_section_disabled,
              salonAccountEmail
            ),
            workspaceSnapshot.cashSectionDisabled ? 'true' : 'false',
          ],
          [
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests,
              salonAccountEmail
            ),
            workspaceSnapshot.autoAcceptBookingRequests ? 'true' : 'false',
          ],
          [
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
              salonAccountEmail
            ),
            workspaceSnapshot.autoAcceptBookingRequestsUpdatedAt?.trim() || '',
          ],
          [
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_customer_reminder_hours_before,
              salonAccountEmail
            ),
            String(
              Math.max(
                0,
                Math.min(
                  168,
                  Math.round(workspaceSnapshot.customerReminderHoursBefore ?? 24)
                )
              )
            ),
          ],
        ]);
      } catch (error) {
        console.log('Errore persistenza workspace immediata:', error);
      }

      try {
        const ownerAccounts = await loadOwnerAccounts();
        const updatedOwnerAccounts = ownerAccounts.map((account) =>
          normalizeAccountEmail(account.email) === normalizeAccountEmail(salonAccountEmail)
            ? {
                ...account,
                salonName: workspaceSnapshot.salonName.trim() || account.salonName,
                businessPhone: workspaceSnapshot.businessPhone.trim() || account.businessPhone,
                streetLine: workspaceSnapshot.streetName.trim() || account.streetLine,
                city: workspaceSnapshot.city.trim() || account.city,
                postalCode: workspaceSnapshot.postalCode.trim() || account.postalCode,
                activityCategory:
                  workspaceSnapshot.activityCategory.trim() || account.activityCategory,
              }
            : account
        );

        await saveOwnerAccounts(updatedOwnerAccounts);
      } catch (error) {
        console.log('Errore sincronizzazione account owner locale:', error);
      }

      const normalizedOwnerEmail = normalizeAccountEmail(
        workspaceSnapshot.ownerEmail || salonAccountEmail
      );
      const normalizedSalonCode = normalizeSalonCode(workspaceSnapshot.salonCode);
      const resolvedSalonName = resolveSalonDisplayName({
        salonName: workspaceSnapshot.salonName,
        activityCategory: workspaceSnapshot.activityCategory,
        salonCode: normalizedSalonCode,
        ownerEmail: normalizedOwnerEmail,
      });

      if (!normalizedOwnerEmail || !normalizedSalonCode || !resolvedSalonName) {
        return;
      }

      try {
        let remoteUpdateQuery = supabase
          .from('workspaces')
          .update({
            slug: normalizedSalonCode,
            salon_name: resolvedSalonName,
            owner_phone: workspaceSnapshot.businessPhone.trim() || null,
            cash_section_disabled: workspaceSnapshot.cashSectionDisabled ?? false,
            customer_reminder_hours_before: Math.max(
              0,
              Math.min(
                168,
                Math.round(workspaceSnapshot.customerReminderHoursBefore ?? 24)
              )
            ),
            updated_at: workspaceSnapshot.updatedAt,
          })
          .select(
            'id, slug, salon_name, owner_email, owner_phone, cash_section_disabled, customer_reminder_hours_before, subscription_plan, subscription_status, created_at, updated_at'
          )
          .limit(1);

        remoteUpdateQuery = isUuidValue(workspaceSnapshot.id)
          ? remoteUpdateQuery.eq('id', workspaceSnapshot.id)
          : remoteUpdateQuery.eq('owner_email', normalizedOwnerEmail);

        const { data: updatedWorkspace, error: updateWorkspaceError } =
          await remoteUpdateQuery.maybeSingle();

        if (updateWorkspaceError) {
          throw updateWorkspaceError;
        }

        const normalizedRemoteWorkspace = updatedWorkspace
          ? normalizeWorkspace(
              {
                ...workspaceSnapshot,
                id: updatedWorkspace.id,
                salonCode: updatedWorkspace.slug,
                salonName: updatedWorkspace.salon_name,
                ownerEmail: updatedWorkspace.owner_email,
                businessPhone: updatedWorkspace.owner_phone ?? undefined,
                cashSectionDisabled: updatedWorkspace.cash_section_disabled ?? undefined,
                customerReminderHoursBefore:
                  updatedWorkspace.customer_reminder_hours_before ?? undefined,
                subscriptionPlan: updatedWorkspace.subscription_plan,
                subscriptionStatus: updatedWorkspace.subscription_status,
                createdAt: updatedWorkspace.created_at,
                updatedAt: updatedWorkspace.updated_at,
              },
              normalizedOwnerEmail
            )
          : null;

        if (normalizedRemoteWorkspace) {
          setSalonWorkspace(normalizedRemoteWorkspace);
          await AsyncStorage.setItem(
            buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
            JSON.stringify(normalizedRemoteWorkspace)
          );
          await AsyncStorage.multiSet([
            [
              buildScopedStorageKey(
                STORAGE_KEYS.workspace_cash_section_disabled,
                salonAccountEmail
              ),
              normalizedRemoteWorkspace.cashSectionDisabled ? 'true' : 'false',
            ],
            [
              buildScopedStorageKey(
                STORAGE_KEYS.workspace_auto_accept_booking_requests,
                salonAccountEmail
              ),
              normalizedRemoteWorkspace.autoAcceptBookingRequests ? 'true' : 'false',
            ],
            [
              buildScopedStorageKey(
                STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
                salonAccountEmail
              ),
              normalizedRemoteWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim() || '',
            ],
            [
              buildScopedStorageKey(
                STORAGE_KEYS.workspace_customer_reminder_hours_before,
                salonAccountEmail
              ),
              String(
                Math.max(
                  0,
                  Math.min(
                    168,
                    Math.round(normalizedRemoteWorkspace.customerReminderHoursBefore ?? 24)
                  )
                )
              ),
            ],
          ]);

          await enqueuePortalPublish({
            workspace: normalizedRemoteWorkspace,
            clienti: clienti as unknown as Array<Record<string, unknown>>,
            appuntamenti: appuntamenti as unknown as Array<Record<string, unknown>>,
            servizi: servizi as unknown as Array<Record<string, unknown>>,
            operatori: operatori as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione:
              richiestePrenotazione as unknown as Array<Record<string, unknown>>,
            availabilitySettings,
            serviceCardColorOverrides,
            roleCardColorOverrides,
          }).catch((publishError) => {
            console.log('Errore publish portale dopo update workspace:', publishError);
          });

          if (isUuidValue(normalizedRemoteWorkspace.id)) {
            await syncOwnerSnapshotForWorkspace(normalizedRemoteWorkspace.id, {
              workspace: normalizedRemoteWorkspace,
              clienti,
              appuntamenti,
              movimenti,
              servizi,
              operatori,
              macchinari,
              carteCollegate,
              eventi,
              richiestePrenotazione,
              availabilitySettings,
              messaggioEventoTemplate,
              serviceCardColorOverrides,
              roleCardColorOverrides,
            }).catch((snapshotError) => {
              console.log('Errore sync snapshot owner dopo update workspace:', snapshotError);
            });
          }
        }

        const ownerAccounts = await loadOwnerAccounts();
        const matchingOwnerAccount = ownerAccounts.find(
          (account) => normalizeAccountEmail(account.email) === normalizedOwnerEmail
        );

        if (matchingOwnerAccount) {
          const bootstrapResult = await runWithDeadlockRetry(
            () =>
              Promise.resolve(
                supabase.rpc('bootstrap_owner_account', {
                  p_first_name: matchingOwnerAccount.firstName.trim(),
                  p_last_name: matchingOwnerAccount.lastName.trim(),
                  p_salon_name: resolvedSalonName,
                  p_business_phone: workspaceSnapshot.businessPhone.trim(),
                  p_owner_phone: workspaceSnapshot.businessPhone.trim(),
                  p_owner_email: normalizedOwnerEmail,
                  p_salon_code: normalizedSalonCode,
                  p_activity_category: workspaceSnapshot.activityCategory.trim().toUpperCase(),
                  p_street_line: workspaceSnapshot.streetName.trim().toUpperCase(),
                  p_city: workspaceSnapshot.city.trim().toUpperCase(),
                  p_postal_code: workspaceSnapshot.postalCode.trim(),
                })
              ),
            'Sincronizzazione profilo owner backend'
          );

          if (bootstrapResult.error) {
            console.log('Errore bootstrap backend profilo owner:', bootstrapResult.error);
          }
        }
      } catch (error) {
        console.log('Errore persistenza workspace remota:', error);
      }
    },
    [
      appuntamenti,
      availabilitySettings,
      carteCollegate,
      clienti,
      enqueuePortalPublish,
      eventi,
      isLoaded,
      macchinari,
      messaggioEventoTemplate,
      movimenti,
      operatori,
      richiestePrenotazione,
      roleCardColorOverrides,
      salonAccountEmail,
      serviceCardColorOverrides,
      serviceCardColorOverrides,
      servizi,
      syncOwnerSnapshotForWorkspace,
    ]
  );

  const updateAvailabilitySettingsPersisted = React.useCallback(
    async (
      updater:
        | AvailabilitySettings
        | ((current: AvailabilitySettings) => AvailabilitySettings)
    ) => {
      let nextAvailabilitySnapshot: AvailabilitySettings | null = null;

      setAvailabilitySettings((current) => {
        const resolved =
          typeof updater === 'function'
            ? (updater as (current: AvailabilitySettings) => AvailabilitySettings)(current)
            : updater;
        const normalized = normalizeAvailabilitySettings(resolved);
        nextAvailabilitySnapshot = normalized;
        return normalized;
      });

      if (!isLoaded || !salonAccountEmail || !nextAvailabilitySnapshot) {
        return;
      }

      try {
        await AsyncStorage.setItem(
          buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail),
          JSON.stringify(nextAvailabilitySnapshot)
        );
      } catch (error) {
        console.log('Errore persistenza availability immediata:', error);
      }

      const normalizedOwnerEmail = normalizeAccountEmail(
        salonWorkspace.ownerEmail || salonAccountEmail
      );
      const normalizedSalonCode = normalizeSalonCode(salonWorkspace.salonCode);

      if (!normalizedOwnerEmail || !normalizedSalonCode) {
        return;
      }

      try {
        const { error } = await supabase.rpc('update_client_portal_availability_settings', {
          p_owner_email: normalizedOwnerEmail,
          p_salon_code: normalizedSalonCode,
          p_availability_settings: nextAvailabilitySnapshot,
        });

        if (error) {
          throw error;
        }

        await enqueuePortalPublish({
          workspace: {
            ...salonWorkspace,
            ownerEmail: normalizedOwnerEmail,
            salonCode: normalizedSalonCode,
          },
          clienti: clienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: appuntamenti as unknown as Array<Record<string, unknown>>,
          servizi: servizi as unknown as Array<Record<string, unknown>>,
          operatori: operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione:
            richiestePrenotazione as unknown as Array<Record<string, unknown>>,
          availabilitySettings: nextAvailabilitySnapshot,
          serviceCardColorOverrides,
          roleCardColorOverrides,
        }).catch((publishError) => {
          console.log('Errore publish live availability settings:', publishError);
        });

        const workspaceId = salonWorkspace.id?.trim() ?? '';
        if (isUuidValue(workspaceId)) {
          await syncOwnerSnapshotForWorkspace(workspaceId, {
            workspace: {
              ...salonWorkspace,
              ownerEmail: normalizedOwnerEmail,
              salonCode: normalizedSalonCode,
            },
            clienti,
            appuntamenti,
            movimenti,
            servizi,
            operatori,
            macchinari,
            carteCollegate,
            eventi,
            richiestePrenotazione,
            availabilitySettings: nextAvailabilitySnapshot,
            messaggioEventoTemplate,
            serviceCardColorOverrides,
            roleCardColorOverrides,
          }).catch((snapshotError) => {
            if (!shouldSilenceTransientSyncError(snapshotError)) {
              console.log('Errore sync snapshot owner dopo availability settings:', snapshotError);
            }
          });
        }
      } catch (error) {
        console.log('Errore persistenza remota availability settings:', error);
      }
    },
    [
      appuntamenti,
      clienti,
      enqueuePortalPublish,
      isLoaded,
      macchinari,
      messaggioEventoTemplate,
      movimenti,
      operatori,
      richiestePrenotazione,
      roleCardColorOverrides,
      salonAccountEmail,
      salonWorkspace,
      serviceCardColorOverrides,
      syncOwnerSnapshotForWorkspace,
      servizi,
    ]
  );

  const updateGuidedSlotsSettingsPersisted = React.useCallback(
    async (
      updater:
        | AvailabilitySettings
        | ((current: AvailabilitySettings) => AvailabilitySettings)
    ) => {
      await updateAvailabilitySettingsPersisted((current) => {
        const resolved =
          typeof updater === 'function'
            ? (updater as (current: AvailabilitySettings) => AvailabilitySettings)(current)
            : updater;

        return normalizeAvailabilitySettings({
          ...current,
          ...resolved,
        });
      });
    },
    [updateAvailabilitySettingsPersisted]
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

  const primeScopedOwnerAccountState = React.useCallback(
    async (email: string) => {
      const normalizedEmail = normalizeAccountEmail(email);
      if (!normalizedEmail) {
        return;
      }

      try {
        const [
          clientiSalvati,
          workspaceSalvato,
          cashSectionDisabledSalvato,
          autoAcceptBookingRequestsSalvato,
          autoAcceptBookingRequestsUpdatedAtSalvato,
          customerReminderHoursBeforeSalvato,
          appuntamentiSalvati,
          movimentiSalvati,
          serviziSalvati,
          carteSalvate,
          operatoriSalvati,
          macchinariSalvati,
          eventiSalvati,
          richiesteSalvate,
          availabilitySettingsSalvate,
          templateEventiSalvato,
          biometricEnabledSalvato,
          serviceCardColorsSalvate,
          roleCardColorsSalvate,
        ] = await Promise.all([
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.clienti, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.workspace, normalizedEmail)),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_cash_section_disabled,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_auto_accept_booking_requests_updated_at,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(
              STORAGE_KEYS.workspace_customer_reminder_hours_before,
              normalizedEmail
            )
          ),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.appuntamenti, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.movimenti, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.servizi, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.carte, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.operatori, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.macchinari, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.eventi, normalizedEmail)),
          AsyncStorage.getItem(
            buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, normalizedEmail)
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(STORAGE_KEYS.availability_settings, normalizedEmail)
          ),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.eventi_template, normalizedEmail)),
          AsyncStorage.getItem(buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, normalizedEmail)),
          AsyncStorage.getItem(
            buildScopedStorageKey(STORAGE_KEYS.service_card_color_overrides, normalizedEmail)
          ),
          AsyncStorage.getItem(
            buildScopedStorageKey(STORAGE_KEYS.role_card_color_overrides, normalizedEmail)
          ),
        ]);

        setSalonWorkspace(
          mergeWorkspacePreferenceOverrides({
            workspace: workspaceSalvato
              ? (JSON.parse(workspaceSalvato) as Partial<SalonWorkspace>)
              : createDefaultWorkspace(normalizedEmail),
            cashSectionDisabled:
              cashSectionDisabledSalvato === 'true'
                ? true
                : cashSectionDisabledSalvato === 'false'
                  ? false
                  : undefined,
            autoAcceptBookingRequests:
              autoAcceptBookingRequestsSalvato === 'true'
                ? true
                : autoAcceptBookingRequestsSalvato === 'false'
                  ? false
                  : undefined,
            autoAcceptBookingRequestsUpdatedAt:
              autoAcceptBookingRequestsUpdatedAtSalvato?.trim() || undefined,
            customerReminderHoursBefore:
              customerReminderHoursBeforeSalvato?.trim() &&
              Number.isFinite(Number(customerReminderHoursBeforeSalvato))
                ? Math.max(
                    0,
                    Math.min(168, Math.round(Number(customerReminderHoursBeforeSalvato)))
                  )
                : undefined,
            email: normalizedEmail,
          })
        );
        setClienti(clientiSalvati ? normalizeClienti(JSON.parse(clientiSalvati)) : normalizeClienti([]));
        setAppuntamenti(
          appuntamentiSalvati ? normalizeAppuntamenti(JSON.parse(appuntamentiSalvati)) : normalizeAppuntamenti([])
        );
        setMovimenti(movimentiSalvati ? normalizeMovimenti(JSON.parse(movimentiSalvati)) : normalizeMovimenti([]));
        setServizi(serviziSalvati ? normalizeServizi(JSON.parse(serviziSalvati)) : normalizeServizi([]));
        setOperatori(operatoriSalvati ? normalizeOperatori(JSON.parse(operatoriSalvati)) : normalizeOperatori([]));
        setMacchinari(macchinariSalvati ? normalizeMacchinari(JSON.parse(macchinariSalvati)) : normalizeMacchinari([]));
        setCarteCollegate(carteSalvate ? normalizeCarte(JSON.parse(carteSalvate)) : normalizeCarte([]));
        setEventi(eventiSalvati ? normalizeEventi(JSON.parse(eventiSalvati)) : normalizeEventi([]));
        setRichiestePrenotazione(
          richiesteSalvate ? normalizeRichiestePrenotazione(JSON.parse(richiesteSalvate)) : []
        );
        setAvailabilitySettings(
          availabilitySettingsSalvate
            ? normalizeAvailabilitySettings(JSON.parse(availabilitySettingsSalvate))
            : normalizeAvailabilitySettings()
        );
        setBiometricEnabled(biometricEnabledSalvato === 'true');
        setMessaggioEventoTemplate(
          templateEventiSalvato ??
            'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
        );
        setServiceCardColorOverrides(serviceCardColorsSalvate ? JSON.parse(serviceCardColorsSalvate) : {});
        setRoleCardColorOverrides(roleCardColorsSalvate ? JSON.parse(roleCardColorsSalvate) : {});
        await syncOwnerOnboardingState(normalizedEmail);
      } catch (error) {
        console.log('Errore prime stato account owner:', error);
        clearRuntimeDataForAccount(normalizedEmail);
      } finally {
        setIsLoaded(true);
      }
    },
    [clearRuntimeDataForAccount, syncOwnerOnboardingState]
  );

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

  const ensureFreshOwnerAuthSession = async (targetEmail: string) => {
    const normalizedTargetEmail = normalizeAccountEmail(targetEmail);
    if (!normalizedTargetEmail) {
      return;
    }

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const currentSessionEmail = normalizeAccountEmail(sessionResult.session?.user?.email);

      if (!currentSessionEmail || currentSessionEmail === normalizedTargetEmail) {
        return;
      }

      await supabase.auth.signOut();
      await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
    } catch (error) {
      console.log('Errore riallineamento sessione owner prima del bootstrap:', error);
    }
  };

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
    const existingRemoteWorkspace = await loadExistingOwnerWorkspaceRecord(normalizedEmail);

    if (existingRemoteWorkspace?.id) {
      setOwnerProfileNeedsCompletion(false);
      setSalonWorkspace((current) =>
        mergeWorkspacePreservingLocalProfile({
          localWorkspace: current,
          remoteWorkspace: {
            ...current,
            id: existingRemoteWorkspace.id,
            salonCode: existingRemoteWorkspace.slug,
            salonName: existingRemoteWorkspace.salon_name,
            ownerEmail: existingRemoteWorkspace.owner_email,
            businessPhone: existingRemoteWorkspace.owner_phone ?? undefined,
            cashSectionDisabled: existingRemoteWorkspace.cash_section_disabled ?? undefined,
            customerReminderHoursBefore:
              existingRemoteWorkspace.customer_reminder_hours_before ?? undefined,
            subscriptionPlan: existingRemoteWorkspace.subscription_plan,
            subscriptionStatus: existingRemoteWorkspace.subscription_status,
            createdAt: existingRemoteWorkspace.created_at,
            updatedAt: existingRemoteWorkspace.updated_at,
          },
          email: normalizedEmail,
        })
      );
      return { ok: true as const, skipped: 'workspace_already_linked' as const };
    }

    const salonName =
      localAccount?.salonName.trim() ||
      storedWorkspace?.salonName.trim() ||
      resolveSalonDisplayName({
        salonName: storedWorkspace?.salonName,
        activityCategory: storedWorkspace?.activityCategory,
        salonCode: storedWorkspace?.salonCode,
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
      localAccount?.businessPhone.trim() || storedWorkspace?.businessPhone.trim() || null;
    const ownerPhone = businessPhone;
    const activityCategory =
      localAccount?.activityCategory.trim() || storedWorkspace?.activityCategory.trim() || null;
    const streetLine =
      localAccount?.streetLine.trim() || storedWorkspace?.streetName.trim() || null;
    const city =
      localAccount?.city.trim() || storedWorkspace?.city.trim() || null;
    const postalCode =
      localAccount?.postalCode.trim() || storedWorkspace?.postalCode.trim() || null;
    const preferredSalonCode = normalizeSalonCode(
      storedWorkspace?.salonCode || buildSalonCode(salonName, normalizedEmail)
    );
    const salonCodeCandidates = Array.from(
      new Set([
        preferredSalonCode,
        ...buildOwnerBootstrapSlugCandidates(salonName, normalizedEmail),
      ])
    );

    if (
      !hasCompleteOwnerBootstrapProfile({
        activityCategory,
        streetLine,
        city,
        postalCode,
      })
    ) {
      console.log('Bootstrap backend owner skipped: owner profile incomplete', {
        email: normalizedEmail,
        hasActivityCategory: !!activityCategory?.trim(),
        hasStreetLine: !!streetLine?.trim(),
        hasCity: !!city?.trim(),
        hasPostalCode: !!postalCode?.trim(),
      });
      setOwnerProfileNeedsCompletion(true);
      return { ok: true as const, skipped: 'owner_profile_incomplete' as const };
    }

    let bootstrapError: unknown = null;

    for (const candidateSalonCode of salonCodeCandidates) {
      try {
        const bootstrapResult = await runWithDeadlockRetry(
          () =>
            Promise.resolve(
              supabase.rpc('bootstrap_owner_account', {
                p_first_name: firstName,
                p_last_name: lastName,
                p_salon_name: salonName,
                p_business_phone: businessPhone,
                p_owner_phone: ownerPhone,
                p_owner_email: normalizedEmail,
                p_salon_code: candidateSalonCode,
                p_activity_category: activityCategory,
                p_street_line: streetLine,
                p_city: city,
                p_postal_code: postalCode,
              })
            ),
          'Bootstrap backend owner'
        );

        bootstrapError = bootstrapResult.error;
      } catch (error) {
        bootstrapError = error;
      }

      if (!bootstrapError) {
        setOwnerProfileNeedsCompletion(false);
        if (candidateSalonCode !== preferredSalonCode) {
          setSalonWorkspace((current) =>
            normalizeWorkspace(
              {
                ...(current ?? createDefaultWorkspace(normalizedEmail)),
                salonCode: candidateSalonCode,
                ownerEmail: normalizedEmail,
              },
              normalizedEmail
            )
          );
        }
        break;
      }

      if (!isWorkspaceSlugConflictError(bootstrapError)) {
        break;
      }
    }

    if (bootstrapError) {
      if (isDeadlockError(bootstrapError)) {
        console.log(
          'Bootstrap backend owner in deadlock persistente: continuo l’accesso e ritento in background.',
          bootstrapError
        );
        setTimeout(() => {
          void ensureOwnerBackendBootstrap(normalizedEmail, accounts).catch((error) => {
            console.log('Retry bootstrap backend owner post-login fallito:', error);
          });
        }, 1400);

        return { ok: true as const, skipped: 'bootstrap_retry_pending' as const };
      }

      if (isStatementTimeoutError(bootstrapError)) {
        console.log(
          'Bootstrap backend owner in timeout: continuo l’accesso e ritento in background.',
          bootstrapError
        );
        setTimeout(() => {
          void ensureOwnerBackendBootstrap(normalizedEmail, accounts).catch((error) => {
            console.log('Retry bootstrap backend owner post-timeout fallito:', error);
          });
        }, 1800);

        return { ok: true as const, skipped: 'bootstrap_retry_pending' as const };
      }

      if (isSupabaseSchemaCacheLookupError(bootstrapError)) {
        console.log(
          'Bootstrap backend owner in schema cache transient error: continuo l’accesso e ritento in background.',
          bootstrapError
        );
        setTimeout(() => {
          void ensureOwnerBackendBootstrap(normalizedEmail, accounts).catch((error) => {
            console.log('Retry bootstrap backend owner post-schema-cache fallito:', error);
          });
        }, 1800);

        return { ok: true as const, skipped: 'bootstrap_retry_pending' as const };
      }

      if (isOwnerBootstrapProfileRequirementError(bootstrapError)) {
        console.log('Bootstrap backend owner skipped after backend validation:', bootstrapError);
        setOwnerProfileNeedsCompletion(true);
        return { ok: true as const, skipped: 'owner_profile_incomplete' as const };
      }

      console.log('Errore bootstrap backend owner:', bootstrapError);
      return {
        ok: false as const,
        error: formatOwnerBootstrapError(
          bootstrapError,
          'Account collegato ma workspace backend non allineato.'
        ),
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
      await primeScopedOwnerAccountState(authenticatedEmail);
      setPendingBiometricUnlock(false);
      await prepareOnboardingStateForAuthenticatedAccount(authenticatedEmail);
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
      await ensureFreshOwnerAuthSession(normalizedEmail);

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

      const existingRemoteWorkspace = await loadExistingOwnerWorkspaceRecord(authenticatedEmail);
      if (existingRemoteWorkspace?.id) {
        setOwnerProfileNeedsCompletion(false);
        return { ok: true as const, email: authenticatedEmail };
      }

      let bootstrapError: unknown = null;
      const salonCodeCandidates = buildOwnerBootstrapSlugCandidates(
        account.salonName.trim(),
        authenticatedEmail
      );

      for (const candidateSalonCode of salonCodeCandidates) {
        try {
          const bootstrapResult = await runWithDeadlockRetry(
            () =>
              Promise.resolve(
                supabase.rpc('bootstrap_owner_account', {
                  p_first_name: account.firstName.trim(),
                  p_last_name: account.lastName.trim(),
                  p_salon_name: account.salonName.trim(),
                  p_business_phone: account.businessPhone.trim(),
                  p_owner_phone: account.businessPhone.trim(),
                  p_owner_email: authenticatedEmail,
                  p_salon_code: candidateSalonCode,
                  p_activity_category: account.activityCategory.trim().toUpperCase(),
                  p_street_line: account.streetLine.trim().toUpperCase(),
                  p_city: account.city.trim().toUpperCase(),
                  p_postal_code: account.postalCode.trim(),
                })
              ),
            'Collegamento account owner locale al backend'
          );

          bootstrapError = bootstrapResult.error;
        } catch (error) {
          bootstrapError = error;
        }

        if (!bootstrapError || !isWorkspaceSlugConflictError(bootstrapError)) {
          if (!bootstrapError) {
            setOwnerProfileNeedsCompletion(false);
          }
          break;
        }
      }

      if (bootstrapError) {
        if (isOwnerBootstrapProfileRequirementError(bootstrapError)) {
          console.log(
            'Collegamento account owner locale al backend: bootstrap saltato, profilo incompleto',
            bootstrapError
          );
          setOwnerProfileNeedsCompletion(true);
          return { ok: true as const, email: authenticatedEmail };
        }

        if (isStatementTimeoutError(bootstrapError)) {
          console.log(
            'Collegamento account owner locale al backend in timeout: continuo l’accesso e ritento in background.',
            bootstrapError
          );
          setTimeout(() => {
            void connectLocalOwnerAccountToBackend(
              account,
              authenticatedEmail,
              normalizedPassword
            ).catch((error) => {
              console.log('Retry collegamento backend owner locale post-timeout fallito:', error);
            });
          }, 1800);
          return { ok: true as const, email: authenticatedEmail };
        }

        return {
          ok: false as const,
          error: formatOwnerBootstrapError(
            bootstrapError,
            'Account locale trovato ma collegamento backend non riuscito.'
          ),
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
      await ensureFreshOwnerAuthSession(normalizedEmail);

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
        await primeScopedOwnerAccountState(authenticatedEmail);
        setPendingBiometricUnlock(false);
        setIsAuthenticated(true);
        void storeBiometricCredentials(authenticatedEmail, normalizedPassword);
        void prepareOnboardingStateForAuthenticatedAccount(authenticatedEmail);
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
      await primeScopedOwnerAccountState(authenticatedEmail);
      setPendingBiometricUnlock(false);
      setIsAuthenticated(true);
      void storeBiometricCredentials(authenticatedEmail, normalizedPassword);
      void prepareOnboardingStateForAuthenticatedAccount(authenticatedEmail);
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
      await syncAuthenticatedWorkspace(normalizedEmail);
      await primeScopedOwnerAccountState(normalizedEmail);
      setPendingBiometricUnlock(true);
      await prepareOnboardingStateForAuthenticatedAccount(normalizedEmail);
      setIsAuthenticated(true);
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
      const existingPassword = (await getOwnerPassword(normalizedEmail))?.trim() ?? '';
      if (existingPassword !== normalizedPassword) {
        return {
          ok: false,
          error:
            'Questo account esiste gia su questo dispositivo. Usa la password gia registrata oppure entra da Accedi.',
        };
      }

      const backendConnectionResult = await connectLocalOwnerAccountToBackend(
        existingAccount,
        normalizedEmail
      );
      if (!backendConnectionResult.ok) {
        return { ok: false, error: backendConnectionResult.error };
      }

      const authenticatedEmail = normalizeAccountEmail(
        backendConnectionResult.email ?? normalizedEmail
      );

      await AsyncStorage.setItem(STORAGE_KEYS.owner_session, authenticatedEmail);
      await switchSalonAccount(authenticatedEmail);
      await syncAuthenticatedWorkspace(authenticatedEmail);
      await primeScopedOwnerAccountState(authenticatedEmail);
      await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
      setPendingBiometricUnlock(false);
      await prepareOnboardingStateForAuthenticatedAccount(authenticatedEmail);
      setIsAuthenticated(true);
      return { ok: true, email: authenticatedEmail };
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
        buildScopedStorageKey(STORAGE_KEYS.onboarding_completed, targetEmail),
        'false'
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.onboarding_first_access_pending, targetEmail),
        'true'
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, targetEmail),
        'false'
      );
      await AsyncStorage.setItem(
        buildScopedStorageKey(STORAGE_KEYS.eventi_template, targetEmail),
        'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
      );
    };

    try {
      await ensureFreshOwnerAuthSession(normalizedEmail);

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

      let bootstrapError: unknown = null;
      const salonCodeCandidates = buildOwnerBootstrapSlugCandidates(
        salonName.trim(),
        authenticatedEmail
      );

      for (const candidateSalonCode of salonCodeCandidates) {
        try {
          const bootstrapResult = await runWithDeadlockRetry(
            () =>
              Promise.resolve(
                supabase.rpc('bootstrap_owner_account', {
                  p_first_name: firstName.trim(),
                  p_last_name: lastName.trim(),
                  p_salon_name: salonName.trim(),
                  p_business_phone: businessPhone.trim(),
                  p_owner_phone: businessPhone.trim(),
                  p_owner_email: authenticatedEmail,
                  p_salon_code: candidateSalonCode,
                  p_activity_category: normalizedActivityCategory,
                  p_street_line: streetLine.trim().toUpperCase(),
                  p_city: city.trim().toUpperCase(),
                  p_postal_code: postalCode.trim(),
                })
              ),
            'Registrazione account owner sul backend'
          );

          bootstrapError = bootstrapResult.error;
        } catch (error) {
          bootstrapError = error;
        }

        if (!bootstrapError || !isWorkspaceSlugConflictError(bootstrapError)) {
          break;
        }
      }

      if (bootstrapError) {
        return {
          ok: false,
          error: formatOwnerBootstrapError(
            bootstrapError,
            'Registrazione completata ma bootstrap backend non riuscito.'
          ),
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
    await syncAuthenticatedWorkspace(authenticatedEmail);
    await primeScopedOwnerAccountState(authenticatedEmail);
    await storeBiometricCredentials(authenticatedEmail, normalizedPassword);
    setPendingBiometricUnlock(false);
    await prepareOnboardingStateForAuthenticatedAccount(authenticatedEmail, {
      forceFirstAccess: true,
    });
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

    setOwnerLocalRecoveryEmail('');
    setOwnerPasswordRecoveryActive(false);
    return { ok: true as const };
  };

  const logoutOwnerAccount = async () => {
    setOwnerLocalRecoveryEmail('');
    setPendingBiometricUnlock(false);
    setIsAuthenticated(false);
    setSalonAccountEmail('');
    clearRuntimeDataForAccount('');
    setIsLoaded(true);
    resetOnboardingState();

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('Errore logout Supabase:', error);
    }

    await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
  };

  const createClientePersisted = async (customer: {
    nome: string;
    telefono: string;
    email?: string;
    instagram?: string;
    birthday?: string;
    maxFutureAppointments?: number | null;
    maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
    maxDailyAppointments?: number | null;
  }) => {
    const workspaceId = salonWorkspace.id.trim();
    if (!isUuid(workspaceId)) {
      return {
        ok: false as const,
        error: 'Workspace non valido. Completa il profilo salone e riprova.',
      };
    }

    const normalizedCustomer = {
      nome: customer.nome.trim(),
      telefono: customer.telefono.trim(),
      email: customer.email?.trim().toLowerCase() ?? '',
      instagram: customer.instagram?.trim() ?? '',
      birthday: customer.birthday?.trim() ?? '',
      maxFutureAppointments:
        typeof customer.maxFutureAppointments === 'number' &&
        customer.maxFutureAppointments >= 0
          ? customer.maxFutureAppointments
          : null,
      maxFutureAppointmentsMode:
        customer.maxFutureAppointmentsMode === 'monthly' ||
        customer.maxFutureAppointmentsMode === 'total_future'
          ? customer.maxFutureAppointmentsMode
          : null,
      maxDailyAppointments:
        typeof customer.maxDailyAppointments === 'number' && customer.maxDailyAppointments >= 0
          ? customer.maxDailyAppointments
          : null,
    };

    if (
      !normalizedCustomer.nome ||
      !normalizedCustomer.telefono ||
      !normalizedCustomer.email
    ) {
      return { ok: false as const, error: 'Compila i campi obbligatori del cliente.' };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          workspace_id: workspaceId,
          full_name: normalizedCustomer.nome,
          phone: normalizedCustomer.telefono || null,
          email: normalizedCustomer.email || null,
          instagram: normalizedCustomer.instagram || null,
          note: '',
          source: 'salon',
          viewed_by_salon: true,
          max_future_appointments: normalizedCustomer.maxFutureAppointments,
          max_future_appointments_mode: normalizedCustomer.maxFutureAppointmentsMode,
          max_daily_appointments: normalizedCustomer.maxDailyAppointments,
        })
        .select(
          'id, full_name, phone, email, instagram, note, source, viewed_by_salon, max_future_appointments, max_future_appointments_mode, max_daily_appointments'
        )
        .single();

      if (error) {
        console.log('Errore creazione cliente backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a creare il cliente.',
        };
      }

      const insertedCustomer = data as
        | {
            id: string;
            full_name: string;
            phone: string | null;
            email: string | null;
            instagram: string | null;
            viewed_by_salon: boolean | null;
            max_future_appointments: number | null;
            max_future_appointments_mode: 'total_future' | 'monthly' | null;
            max_daily_appointments: number | null;
          }
        | null;

      setClienti((current) =>
        normalizeClienti([
          {
            id: insertedCustomer?.id?.trim() || `cliente-${Date.now()}`,
            nome: insertedCustomer?.full_name?.trim() || normalizedCustomer.nome,
            telefono: insertedCustomer?.phone?.trim() || normalizedCustomer.telefono,
            email: insertedCustomer?.email?.trim().toLowerCase() || normalizedCustomer.email,
            instagram: insertedCustomer?.instagram?.trim() || normalizedCustomer.instagram,
            birthday: normalizedCustomer.birthday,
            nota: '',
            fonte: 'salone',
            viewedBySalon: insertedCustomer?.viewed_by_salon ?? true,
            annullamentiCount: 0,
            inibito: false,
            maxFutureAppointments:
              insertedCustomer?.max_future_appointments ?? normalizedCustomer.maxFutureAppointments,
            maxFutureAppointmentsMode:
              insertedCustomer?.max_future_appointments_mode ??
              normalizedCustomer.maxFutureAppointmentsMode,
            maxDailyAppointments:
              insertedCustomer?.max_daily_appointments ?? normalizedCustomer.maxDailyAppointments,
          },
          ...current,
        ])
      );

      return { ok: true as const };
    } catch (error) {
      console.log('Errore creazione cliente backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a creare il cliente.',
      };
    }
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
    const deletedCustomerKeys = recentlyDeletedCustomerKeysRef.current;

    matchingCurrentCustomers.forEach((item) => {
      deletedCustomerKeys.set(buildCustomerIdentityKey(item), Date.now());
    });
    deletedCustomerKeys.set(buildCustomerIdentityKey(targetIdentity), Date.now());

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
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a eliminare il cliente.',
        };
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore eliminazione cliente backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a eliminare il cliente.',
      };
    }
  };

  const createMovimentoPersisted = async (movement: {
    descrizione: string;
    importo: number;
    metodo?: Movimento['metodo'];
    cartaLabel?: string;
    createdAt?: string;
  }) => {
    const workspaceId = salonWorkspace.id.trim();
    if (!isUuidValue(workspaceId)) {
      return {
        ok: false as const,
        error: 'Workspace non valido. Completa il profilo salone e riprova.',
      };
    }

    const normalizedMovement = {
      descrizione: movement.descrizione.trim(),
      importo: Number(movement.importo ?? 0),
      metodo: movement.metodo,
      cartaLabel: movement.cartaLabel?.trim() || undefined,
      createdAt: movement.createdAt?.trim() || new Date().toISOString(),
    };

    if (!normalizedMovement.descrizione || !Number.isFinite(normalizedMovement.importo)) {
      return { ok: false as const, error: 'Compila descrizione e importo del movimento.' };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    try {
      const { data, error } = await supabase
        .from('cash_movements')
        .insert({
          workspace_id: workspaceId,
          description: normalizedMovement.descrizione,
          amount: normalizedMovement.importo,
          payment_method: movementMethodToRemote(normalizedMovement.metodo),
          card_label: normalizedMovement.cartaLabel ?? null,
          created_at: normalizedMovement.createdAt,
        })
        .select('id, description, amount, payment_method, card_label, created_at')
        .single();

      if (error) {
        console.log('Errore creazione movimento backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a registrare il movimento.',
        };
      }

      const insertedMovement = data as {
        id: string;
        description: string;
        amount: number | string;
        payment_method: string | null;
        card_label: string | null;
        created_at: string;
      };

      setMovimenti((current) =>
        normalizeMovimenti([
          {
            id: insertedMovement.id,
            descrizione: insertedMovement.description,
            importo: Number(insertedMovement.amount ?? 0),
            metodo: movementMethodFromRemote(insertedMovement.payment_method),
            cartaLabel: insertedMovement.card_label ?? undefined,
            createdAt: insertedMovement.created_at,
          },
          ...current.filter(
            (item) => buildMovementSemanticKey(item) !== buildMovementSemanticKey(normalizedMovement)
          ),
        ])
      );

      return { ok: true as const };
    } catch (error) {
      console.log('Errore creazione movimento backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a registrare il movimento.',
      };
    }
  };

  const updateMovimentoPersisted = async (
    movementId: string,
    updates: {
      metodo?: Movimento['metodo'];
      cartaLabel?: string;
    }
  ) => {
    const normalizedMovementId = movementId.trim();
    if (!normalizedMovementId) {
      return { ok: false as const, error: 'Movimento non valido.' };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    setMovimenti((current) =>
      current.map((item) =>
        item.id === normalizedMovementId
          ? {
              ...item,
              metodo: updates.metodo,
              cartaLabel: updates.cartaLabel?.trim() || undefined,
            }
          : item
      )
    );

    if (!isUuidValue(normalizedMovementId)) {
      return { ok: true as const };
    }

    try {
      const { error } = await supabase
        .from('cash_movements')
        .update({
          payment_method: movementMethodToRemote(updates.metodo),
          card_label: updates.cartaLabel?.trim() || null,
        })
        .eq('id', normalizedMovementId);

      if (error) {
        console.log('Errore aggiornamento movimento backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito ad aggiornare il movimento.',
        };
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore aggiornamento movimento backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito ad aggiornare il movimento.',
      };
    }
  };

  const createCartaPersisted = async (card: {
    nome: string;
    circuito: string;
    ultime4: string;
    predefinita?: boolean;
  }) => {
    const workspaceId = salonWorkspace.id.trim();
    if (!isUuidValue(workspaceId)) {
      return {
        ok: false as const,
        error: 'Workspace non valido. Completa il profilo salone e riprova.',
      };
    }

    const normalizedCard = {
      nome: card.nome.trim(),
      circuito: card.circuito.trim(),
      ultime4: card.ultime4.trim(),
      predefinita: card.predefinita ?? carteCollegate.length === 0,
    };

    if (!normalizedCard.nome || !normalizedCard.circuito || normalizedCard.ultime4.length !== 4) {
      return { ok: false as const, error: 'Compila correttamente i dati della carta.' };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    try {
      if (normalizedCard.predefinita) {
        const { error: clearDefaultError } = await supabase
          .from('connected_cards')
          .update({ is_default: false })
          .eq('workspace_id', workspaceId);
        if (clearDefaultError) {
          throw clearDefaultError;
        }
      }

      const { data, error } = await supabase
        .from('connected_cards')
        .insert({
          workspace_id: workspaceId,
          label: normalizedCard.nome,
          circuit: normalizedCard.circuito,
          last4: normalizedCard.ultime4,
          is_default: normalizedCard.predefinita,
        })
        .select('id, label, circuit, last4, is_default')
        .single();

      if (error) {
        console.log('Errore creazione carta backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a collegare la carta.',
        };
      }

      const insertedCard = data as {
        id: string;
        label: string;
        circuit: string;
        last4: string;
        is_default: boolean;
      };

      setCarteCollegate((current) =>
        normalizeCarte([
          {
            id: insertedCard.id,
            nome: insertedCard.label,
            circuito: insertedCard.circuit,
            ultime4: insertedCard.last4,
            predefinita: insertedCard.is_default,
          },
          ...current
            .filter((item) => buildCardSemanticKey(item) !== buildCardSemanticKey(normalizedCard))
            .map((item) => ({
              ...item,
              predefinita: insertedCard.is_default ? false : item.predefinita,
            })),
        ])
      );

      return { ok: true as const, cardId: insertedCard.id };
    } catch (error) {
      console.log('Errore creazione carta backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a collegare la carta.',
      };
    }
  };

  const setDefaultCartaPersisted = async (cardId: string) => {
    const normalizedCardId = cardId.trim();
    const workspaceId = salonWorkspace.id.trim();
    if (!normalizedCardId || !isUuidValue(workspaceId)) {
      return { ok: false as const, error: 'Carta non valida.' };
    }

    const ownerSessionResult = await ensureRealtimeOwnerSession();
    if (!ownerSessionResult.ok) {
      return {
        ok: false as const,
        error: 'Sessione proprietario scaduta. Rientra nel salone e riprova.',
      };
    }

    setCarteCollegate((current) =>
      normalizeCarte(
        current.map((item) => ({
          ...item,
          predefinita: item.id === normalizedCardId,
        }))
      )
    );

    try {
      await supabase
        .from('connected_cards')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId);

      const { error } = await supabase
        .from('connected_cards')
        .update({ is_default: true })
        .eq('id', normalizedCardId);

      if (error) {
        console.log('Errore aggiornamento carta predefinita backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito ad aggiornare la carta predefinita.',
        };
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore aggiornamento carta predefinita backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito ad aggiornare la carta predefinita.',
      };
    }
  };

  const deleteCartaPersisted = async (cardId: string) => {
    const normalizedCardId = cardId.trim();
    if (!normalizedCardId) {
      return { ok: false as const, error: 'Carta non valida.' };
    }

    const nextCards = normalizeCarte(carteCollegate.filter((item) => item.id !== normalizedCardId));
    setCarteCollegate(nextCards);

    if (!isUuidValue(normalizedCardId)) {
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
        .from('connected_cards')
        .delete()
        .eq('id', normalizedCardId);

      if (error) {
        console.log('Errore eliminazione carta backend:', error);
        return {
          ok: false as const,
          error: error.message?.trim() || 'Non sono riuscito a eliminare la carta.',
        };
      }

      if (nextCards.length > 0 && !nextCards.some((item) => item.predefinita)) {
        await setDefaultCartaPersisted(nextCards[0].id);
      }

      return { ok: true as const };
    } catch (error) {
      console.log('Errore eliminazione carta backend:', error);
      return {
        ok: false as const,
        error: 'Non sono riuscito a eliminare la carta.',
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
        const normalizedRemoteAppointments = normalizeAppuntamenti(
          remoteSnapshot.appuntamenti as Appuntamento[]
        );

        return {
          workspace: isCurrentWorkspaceSalon
            ? mergeWorkspacePreservingLocalProfile({
                localWorkspace: salonWorkspace,
                remoteWorkspace: remoteSnapshot.workspace,
                email: salonWorkspace.ownerEmail,
              })
            : remoteSnapshot.workspace,
          clienti: isCurrentWorkspaceSalon
            ? filterRecentlyDeletedCustomers(normalizeClienti(remoteSnapshot.clienti as Cliente[]))
            : normalizeClienti(remoteSnapshot.clienti as Cliente[]),
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
          richiestePrenotazione: normalizeRichiestePrenotazione(
            remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
          ),
          availabilitySettings: normalizeAvailabilitySettings(remoteSnapshot.availabilitySettings),
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
      if (!shouldSilenceTransientSyncError(error)) {
        console.log('Errore caricamento salone pubblico:', error);
      }
      return null;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !hasInitializedAuth || !salonAccountEmail) {
      return;
    }

    const normalizedSalonCode = normalizeSalonCode(salonWorkspace.salonCode);
    if (!normalizedSalonCode) {
      return;
    }

    let cancelled = false;

    const refreshOwnerFromPortal = async () => {
      try {
        const remoteSnapshot = await fetchPortalSnapshotWithRetry(normalizedSalonCode);
        if (!remoteSnapshot || cancelled) {
          return;
        }

        const privateServerState = isUuidValue(salonWorkspace.id)
          ? await loadOwnerPrivateServerState(salonWorkspace.id)
          : null;

        const normalizedRemoteAppointments = normalizeAppuntamenti(
          remoteSnapshot.appuntamenti as Appuntamento[]
        );
        const refreshedWorkspace = mergeWorkspacePreservingLocalProfile({
          localWorkspace: salonWorkspace,
          remoteWorkspace: remoteSnapshot.workspace,
          email: salonWorkspace.ownerEmail,
        });
        setSalonWorkspace(refreshedWorkspace);
        setClienti((current) =>
          filterRecentlyDeletedCustomers(
            mergeClientiCollections(current, remoteSnapshot.clienti as Cliente[])
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
            mergeServiziCollections(
              mergeServiziCollections(current, remoteSnapshot.servizi as Servizio[]),
              privateServerState?.ownerSnapshot?.servizi ?? []
            )
          )
        );
        setOperatori(
          privateServerState?.ownerSnapshot?.operatori?.length
            ? normalizeOperatori(privateServerState.ownerSnapshot.operatori)
            : normalizeOperatori(remoteSnapshot.operatori as Operatore[])
        );
        if (privateServerState?.ownerSnapshot?.macchinari) {
          setMacchinari(normalizeMacchinari(privateServerState.ownerSnapshot.macchinari));
        }
        if (privateServerState?.movimenti) {
          setMovimenti(privateServerState.movimenti);
        }
        if (privateServerState?.carteCollegate) {
          setCarteCollegate(privateServerState.carteCollegate);
        }
        if (privateServerState?.eventi) {
          setEventi(privateServerState.eventi);
        }
        setRichiestePrenotazione(
          normalizeRichiestePrenotazione(
            mergeRichiesteCollections(
              remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[],
              privateServerState?.ownerSnapshot?.richiestePrenotazione ?? []
            )
          )
        );
        setAvailabilitySettings(
          privateServerState?.ownerSnapshot?.availabilitySettings
            ? normalizeAvailabilitySettings(privateServerState.ownerSnapshot.availabilitySettings)
            : normalizeAvailabilitySettings(remoteSnapshot.availabilitySettings)
        );
        if (privateServerState?.messaggioEventoTemplate) {
          setMessaggioEventoTemplate(privateServerState.messaggioEventoTemplate);
        }
        setServiceCardColorOverrides((current) =>
          mergeServiceColorOverrideMaps({
            remoteOverrides: remoteSnapshot.serviceCardColorOverrides ?? {},
            localOverrides:
              privateServerState?.ownerSnapshot?.serviceCardColorOverrides ?? current,
            services: normalizeServizi(
              mergeServiziCollections(
                mergeServiziCollections(servizi, remoteSnapshot.servizi as Servizio[]),
                privateServerState?.ownerSnapshot?.servizi ?? []
              )
            ),
          })
        );
        setRoleCardColorOverrides((current) =>
          mergeRoleColorOverrideMaps({
            remoteOverrides: remoteSnapshot.roleCardColorOverrides ?? {},
            localOverrides: privateServerState?.ownerSnapshot?.roleCardColorOverrides ?? current,
          })
        );
      } catch (error) {
        if (isSupabaseSchemaCacheLookupError(error)) {
          console.log('Refresh owner da portale saltato per schema cache Supabase:', error);
          return;
        }

        console.log('Errore refresh owner da portale live:', error);
      }
    };

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
      .subscribe();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshOwnerFromPortal();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [
    fetchPortalSnapshotWithRetry,
    filterRecentlyDeletedAppointments,
    filterRecentlyDeletedCustomers,
    hasInitializedAuth,
    isAuthenticated,
    loadOwnerPrivateServerState,
    salonAccountEmail,
    salonWorkspace.id,
    salonWorkspace.ownerEmail,
    salonWorkspace.salonCode,
    salonWorkspace.cashSectionDisabled,
    salonWorkspace.autoAcceptBookingRequests,
    servizi,
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
        detail?: string;
      }
  > => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
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

      const { data: registeredCustomer, error: registerCustomerError } = await invokeRpcWithSchemaRetry(
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
        const errorText = [
          registerCustomerError.code,
          registerCustomerError.message,
          registerCustomerError.details,
          registerCustomerError.hint,
        ]
          .filter(Boolean)
          .join(' | ')
          .trim()
          .toLowerCase();
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
        return { ok: false, reason: 'save_failed', detail: errorText || 'save_failed' };
      }

      const persistedCustomerId =
        typeof registeredCustomer === 'object' &&
        registeredCustomer !== null &&
        'customerId' in registeredCustomer &&
        typeof registeredCustomer.customerId === 'string' &&
        registeredCustomer.customerId.trim()
          ? registeredCustomer.customerId.trim()
          : `cliente-front-${Date.now()}`;

      await flushQueuedPushNotifications().catch((error) => {
        console.log('Flush push nuova richiesta frontend non riuscito:', error);
      });
      scheduleDelayedPushFlush();

      try {
        const resolvedAfterRegister = await resolveSalonByCode(normalizedCode);

        if (resolvedAfterRegister) {
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
            },
            ...resolvedAfterRegister.clienti,
          ];

          const workspaceId = await enqueuePortalPublish({
            workspace: resolvedAfterRegister.workspace,
            clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
            appuntamenti: resolvedAfterRegister.appuntamenti as unknown as Array<Record<string, unknown>>,
            servizi: resolvedAfterRegister.servizi as unknown as Array<Record<string, unknown>>,
            operatori: resolvedAfterRegister.operatori as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione:
              resolvedAfterRegister.richiestePrenotazione as unknown as Array<Record<string, unknown>>,
            availabilitySettings: resolvedAfterRegister.availabilitySettings,
          });

          if (
            normalizedCode === salonWorkspace.salonCode &&
            resolvedAfterRegister.workspace.ownerEmail === salonAccountEmail
          ) {
            setClienti(nextCustomers);
            if (workspaceId && workspaceId !== salonWorkspace.id) {
              setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
            }
          }
        }
      } catch (postRegisterError) {
        console.log('Post-registrazione cliente frontend non riuscita, ma cliente creato:', postRegisterError);
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore salvataggio cliente frontend:', error);
      return {
        ok: false,
        reason: 'save_failed',
        detail: error instanceof Error ? error.message.trim().toLowerCase() : 'save_failed',
      };
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
      const { data: createdBookingRequest, error: createBookingRequestError } =
        await invokeCreatePublicBookingRequestRpcCompat({
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
          p_required_role: request.mestiereRichiesto?.trim() || null,
          p_operator_id: request.operatoreId ?? null,
          p_operator_name: request.operatoreNome ?? null,
        });

      if (createBookingRequestError) {
        if (!shouldSilenceTransientSyncError(createBookingRequestError)) {
          console.log('Errore creazione booking_request reale:', createBookingRequestError);
        }
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
      const createdRequestId =
        typeof createdRow?.id === 'string' && createdRow.id.trim()
          ? createdRow.id
          : request.id;
      const createdRequestCreatedAt =
        typeof createdRow?.created_at === 'string' && createdRow.created_at.trim()
          ? createdRow.created_at
          : request.createdAt;
      const workspaceId =
        typeof createdRow?.workspace_id === 'string' ? createdRow.workspace_id : null;
      const nextFrontendRequest = {
        ...request,
        id: createdRequestId,
        createdAt: createdRequestCreatedAt,
        origine: 'frontend' as const,
        viewedBySalon: false,
      };

      if (
        normalizedCode === salonWorkspace.salonCode &&
        salonWorkspace.ownerEmail === salonAccountEmail
      ) {
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }

        setRichiestePrenotazione((current) =>
          normalizeRichiestePrenotazione([
            nextFrontendRequest,
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

      try {
        const resolvedAfterCreate = await resolveSalonByCode(normalizedCode);

        if (resolvedAfterCreate) {
          const nextRequests = normalizeRichiestePrenotazione([
            nextFrontendRequest,
            ...resolvedAfterCreate.richiestePrenotazione.filter((item) => item.id !== createdRequestId),
          ]);

          const nextCustomers = normalizeClienti(
            resolvedAfterCreate.clienti.map((item) => {
              const samePhone =
                normalizePhoneForIdentity(item.telefono) ===
                normalizePhoneForIdentity(request.telefono);
              const sameEmail =
                normalizeIdentityText(item.email) === normalizeIdentityText(request.email);

              return samePhone || sameEmail
                ? {
                    ...item,
                    viewedBySalon: false,
                  }
                : item;
            })
          );

          const publishedWorkspaceId = await enqueuePortalPublish({
            workspace: resolvedAfterCreate.workspace,
            clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
            appuntamenti: resolvedAfterCreate.appuntamenti as unknown as Array<Record<string, unknown>>,
            servizi: resolvedAfterCreate.servizi as unknown as Array<Record<string, unknown>>,
            operatori: resolvedAfterCreate.operatori as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
            availabilitySettings: resolvedAfterCreate.availabilitySettings,
            serviceCardColorOverrides: resolvedAfterCreate.serviceCardColorOverrides,
            roleCardColorOverrides: resolvedAfterCreate.roleCardColorOverrides,
          });

          if (
            normalizedCode === salonWorkspace.salonCode &&
            resolvedAfterCreate.workspace.ownerEmail === salonAccountEmail
          ) {
            setRichiestePrenotazione(nextRequests);
            setClienti(nextCustomers);
            if (publishedWorkspaceId && publishedWorkspaceId !== salonWorkspace.id) {
              setSalonWorkspace((current) => ({ ...current, id: publishedWorkspaceId }));
            }
          }
        }
      } catch (publishError) {
        console.log('Pubblicazione snapshot nuova richiesta frontend non riuscita:', publishError);
      }

      // Owner push for new frontend booking requests is already queued by backend triggers.
      // Avoid sending a second app-side notification with older/shorter copy.
      await flushQueuedPushNotifications().catch((error) => {
        console.log('Flush push nuova richiesta frontend non riuscito:', error);
      });
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
            body: `${normalizedServiceName} il ${dateValue} alle ${timeValue}`,
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
        return {
          ok: false,
          error:
            createAppointmentError.message?.trim() ||
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
                  },
                  ...baseCustomers,
                ];
              })()
            )
          : baseCustomers;

      const nextRequests =
        createBookingRequest && bookingRequestId
          ? (() => {
              const acceptedMirror = {
                id: bookingRequestId,
                data: dateValue,
                ora: timeValue,
                servizio: normalizedServiceName,
                prezzo: priceValue,
                durataMinuti: durationMinutes,
                operatoreId: operatorId ?? '',
                operatoreNome: operatorName ?? '',
                nome: normalizedCustomerName.split(' ')[0] ?? normalizedCustomerName,
                cognome: normalizedCustomerName.split(' ').slice(1).join(' '),
                email: customerEmail?.trim() ?? '',
                telefono: customerPhone?.trim() ?? '',
                instagram: customerInstagram?.trim() ?? '',
                note: customerNote?.trim() ?? '',
                origine: 'backoffice' as const,
                stato: 'Accettata' as const,
                createdAt: new Date().toISOString(),
                viewedByCliente: false,
                viewedBySalon: true,
              };
              const acceptedMirrorKey = buildRichiestaMergeKey(acceptedMirror);

              return normalizeRichiestePrenotazione([
                acceptedMirror,
                ...baseRequests.filter(
                  (item) =>
                    item.id !== bookingRequestId && buildRichiestaMergeKey(item) !== acceptedMirrorKey
                ),
              ]);
            })()
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
        body: `Servizio: ${normalizedServiceName}. Data: ${formatPushDateLabel(
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

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) return;

      const nextRequests = resolved.richiestePrenotazione.map((item: RichiestaPrenotazione) =>
        item.email.trim().toLowerCase() === email.trim().toLowerCase() &&
        item.telefono.trim() === telefono.trim() &&
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
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneForIdentity(telefono);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        const fallbackPersistRequestId = isUuid(requestId) ? requestId : null;
        const fallbackSnapshotRequestId =
          requestSnapshot && isUuid(requestSnapshot.id) ? requestSnapshot.id : null;
        const fallbackRequestId = fallbackPersistRequestId ?? fallbackSnapshotRequestId;

        if (!fallbackRequestId) {
          return { ok: false, error: 'Salone non trovato.' };
        }

        const { error: fallbackCancelError } = await supabase.rpc('cancel_public_booking_request', {
          p_salon_code: normalizedCode,
          p_request_id: fallbackRequestId,
          p_customer_email: normalizedEmail,
          p_customer_phone: normalizedPhone,
        });
        const fallbackCancelErrorText = [
          fallbackCancelError?.message,
          fallbackCancelError?.details,
          fallbackCancelError?.hint,
        ]
          .filter(Boolean)
          .join(' ');

        if (
          fallbackCancelError &&
          !/booking_request_not_found/i.test(fallbackCancelErrorText)
        ) {
          console.log(
            'Errore annullamento booking_request cliente in fallback senza snapshot:',
            fallbackCancelError
          );
          return { ok: false, error: 'Non sono riuscito ad annullare la prenotazione.' };
        }

        return { ok: true };
      }

      const normalizedSnapshotEmail = requestSnapshot?.email?.trim().toLowerCase() ?? '';
      const normalizedSnapshotPhone = normalizePhoneForIdentity(requestSnapshot?.telefono);
      const requestSnapshotMergeKey = requestSnapshot ? buildRichiestaMergeKey(requestSnapshot) : '';
      const requestSnapshotResolutionKey = requestSnapshot
        ? [
            requestSnapshot.data.trim(),
            normalizeTimeIdentity(requestSnapshot.ora),
            normalizeIdentityText(requestSnapshot.servizio),
            normalizeIdentityText(`${requestSnapshot.nome} ${requestSnapshot.cognome}`),
            normalizeIdentityText(requestSnapshot.operatoreId),
            normalizeIdentityText(requestSnapshot.operatoreNome),
          ].join('|')
        : '';
      const requestToCancel =
        resolved.richiestePrenotazione.find((item) => item.id === requestId) ??
        (requestSnapshot
          ? resolved.richiestePrenotazione.find((item) => {
              const sameMergeKey = buildRichiestaMergeKey(item) === requestSnapshotMergeKey;
              const sameResolutionKey =
                [
                  item.data.trim(),
                  normalizeTimeIdentity(item.ora),
                  normalizeIdentityText(item.servizio),
                  normalizeIdentityText(`${item.nome} ${item.cognome}`),
                  normalizeIdentityText(item.operatoreId),
                  normalizeIdentityText(item.operatoreNome),
                ].join('|') === requestSnapshotResolutionKey;
              const sameEmail = item.email.trim().toLowerCase() === normalizedSnapshotEmail;
              const samePhone =
                normalizePhoneForIdentity(item.telefono) === normalizedSnapshotPhone;
              return sameMergeKey || sameResolutionKey || (sameEmail && samePhone);
            })
          : undefined);
      const effectiveRequestToCancel = requestToCancel ?? requestSnapshot ?? null;
      if (!effectiveRequestToCancel) {
        return { ok: false, error: 'Prenotazione non trovata.' };
      }

      if (effectiveRequestToCancel.stato === 'Rifiutata' || effectiveRequestToCancel.stato === 'Annullata') {
        return { ok: false, error: 'Questa prenotazione risulta gia chiusa.' };
      }

      if (
        effectiveRequestToCancel.email.trim().toLowerCase() !== normalizedEmail ||
        normalizePhoneForIdentity(effectiveRequestToCancel.telefono) !== normalizedPhone
      ) {
        return { ok: false, error: 'Questa prenotazione non appartiene al profilo cliente attivo.' };
      }

      const normalizedFullName = `${effectiveRequestToCancel.nome} ${effectiveRequestToCancel.cognome}`.trim().toLowerCase();
      const cancelledRequestCompositeKey = buildRichiestaMergeKeyFromValues({
        data: effectiveRequestToCancel.data,
        ora: effectiveRequestToCancel.ora,
        servizio: effectiveRequestToCancel.servizio,
        fullName: `${effectiveRequestToCancel.nome} ${effectiveRequestToCancel.cognome}`.trim(),
      });
      const isSameCancelledRequestComposite = (item: RichiestaPrenotazione) =>
        buildRichiestaMergeKey(item) === cancelledRequestCompositeKey;
      const persistRequestId = isUuid(effectiveRequestToCancel.id) ? effectiveRequestToCancel.id : requestId;
      const shouldPersistRealStatus = isUuid(persistRequestId);
      const { error: cancelError } = shouldPersistRealStatus
        ? await supabase.rpc('cancel_public_booking_request', {
            p_salon_code: normalizedCode,
            p_request_id: persistRequestId,
            p_customer_email: normalizedEmail,
            p_customer_phone: normalizedPhone,
          })
        : { error: null };
      const cancelErrorText = [cancelError?.message, cancelError?.details, cancelError?.hint]
        .filter(Boolean)
        .join(' ');
      const isLegacySnapshotOnlyRequest =
        !shouldPersistRealStatus ||
        /booking_request_not_found/i.test(cancelErrorText);

      if (cancelError && !isLegacySnapshotOnlyRequest) {
        console.log('Errore annullamento booking_request reale cliente:', cancelError);
        return { ok: false, error: 'Non sono riuscito ad annullare la prenotazione.' };
      }

      try {
        const legacyNextRequests = normalizeRichiestePrenotazione(
          resolved.richiestePrenotazione.map((item) =>
            item.id === effectiveRequestToCancel.id || isSameCancelledRequestComposite(item)
              ? {
                  ...item,
                  stato: 'Annullata',
                  viewedByCliente: true,
                  viewedBySalon: false,
                  cancellationSource: 'cliente',
                }
              : item
          )
        );

        const shouldRemoveAcceptedAppointment = effectiveRequestToCancel.stato === 'Accettata';
        const matchesCancelledClientAppointment = (item: Appuntamento) => {
          const itemDate = item.data ?? getTodayDateString();
          return (
            shouldRemoveAcceptedAppointment &&
            itemDate === effectiveRequestToCancel.data &&
            normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(effectiveRequestToCancel.ora) &&
            normalizeIdentityText(item.servizio) ===
              normalizeIdentityText(effectiveRequestToCancel.servizio) &&
            matchesCustomerDisplayName(item.cliente, normalizedFullName) &&
            !item.completato &&
            !item.incassato &&
            !item.nonEffettuato
          );
        };
        const acceptedAppointmentsToRemove = shouldRemoveAcceptedAppointment
          ? resolved.appuntamenti.filter((item) => matchesCancelledClientAppointment(item))
          : [];
        if (shouldRemoveAcceptedAppointment) {
          if (acceptedAppointmentsToRemove.length > 0) {
            acceptedAppointmentsToRemove.forEach((item) => {
              markRecentlyDeletedAppointment({
                date: item.data ?? effectiveRequestToCancel.data,
                time: item.ora,
                customerName: item.cliente,
                serviceName: item.servizio,
                operatorId: item.operatoreId,
                operatorName: item.operatoreNome,
              });
            });
          } else {
            markRecentlyDeletedAppointment({
              date: effectiveRequestToCancel.data,
              time: effectiveRequestToCancel.ora,
              customerName: `${effectiveRequestToCancel.nome} ${effectiveRequestToCancel.cognome}`.trim(),
              serviceName: effectiveRequestToCancel.servizio,
              operatorId: effectiveRequestToCancel.operatoreId,
              operatorName: effectiveRequestToCancel.operatoreNome,
            });
          }
        }
        const legacyNextAppointments = resolved.appuntamenti.filter(
          (item) => !matchesCancelledClientAppointment(item)
        );

        const nextCustomers = normalizeClienti(
          resolved.clienti.map((item) => {
            const matchesByPhone = item.telefono.trim() === normalizedPhone;
            const matchesByEmail = (item.email ?? '').trim().toLowerCase() === normalizedEmail;
            if (!matchesByPhone && !matchesByEmail) return item;

            return {
              ...item,
              annullamentiCount: (item.annullamentiCount ?? 0) + 1,
              viewedBySalon: false,
            };
          })
        );

        let latestResolved = null;
        if (!isLegacySnapshotOnlyRequest) {
          try {
            latestResolved = await resolveSalonByCode(normalizedCode);
          } catch (refreshError) {
            console.log('Refresh salone dopo annullamento cliente non riuscito, continuo in modalita ottimistica:', refreshError);
          }
        }
        const latestNextRequests = latestResolved
          ? normalizeRichiestePrenotazione(
              latestResolved.richiestePrenotazione.map((item) =>
                item.id === effectiveRequestToCancel.id || isSameCancelledRequestComposite(item)
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
        const latestNextAppointments = latestResolved
          ? normalizeAppuntamenti(
              latestResolved.appuntamenti.filter((item) => !matchesCancelledClientAppointment(item))
            )
          : null;

        let workspaceId: string | null = null;
        try {
          workspaceId = await enqueuePortalPublish({
            workspace: resolved.workspace,
            clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
            appuntamenti:
              (latestNextAppointments ?? legacyNextAppointments) as unknown as Array<Record<string, unknown>>,
            servizi: (latestResolved?.servizi ?? resolved.servizi) as unknown as Array<Record<string, unknown>>,
            operatori:
              (latestResolved?.operatori ?? resolved.operatori) as unknown as Array<Record<string, unknown>>,
            richiestePrenotazione:
              (latestNextRequests ?? legacyNextRequests) as unknown as Array<Record<string, unknown>>,
            availabilitySettings: latestResolved?.availabilitySettings ?? resolved.availabilitySettings,
          });
        } catch (publishError) {
          console.log('Pubblicazione snapshot annullamento cliente non riuscita, continuo in modalita ottimistica:', publishError);
        }

        if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
          setRichiestePrenotazione(latestNextRequests ?? legacyNextRequests);
          setAppuntamenti(filterRecentlyDeletedAppointments(latestNextAppointments ?? legacyNextAppointments));
          setClienti(nextCustomers);
          if (workspaceId && workspaceId !== salonWorkspace.id) {
            setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
          }
        }

        const finalWorkspaceId = workspaceId ?? resolved.workspace.id;

        const postCancelResults = await Promise.allSettled([
          queueWorkspacePushNotification({
            workspaceId: finalWorkspaceId,
            eventType: 'appointment_cancelled',
            title:
              effectiveRequestToCancel.stato === 'In attesa'
                ? 'Richiesta annullata dal cliente'
                : 'Prenotazione annullata dal cliente',
            body: `${formatPushCustomerName(
              `${effectiveRequestToCancel.nome} ${effectiveRequestToCancel.cognome}`
            )} - ${effectiveRequestToCancel.servizio} il ${formatAppointmentDateTimeLabel(
              effectiveRequestToCancel.data,
              effectiveRequestToCancel.ora
            )}`,
            audience: 'auth',
            payload: {
              type: 'appointment_cancelled',
              bookingRequestId: effectiveRequestToCancel.id,
              appointmentDate: effectiveRequestToCancel.data,
              appointmentTime: effectiveRequestToCancel.ora,
              customerName: `${effectiveRequestToCancel.nome} ${effectiveRequestToCancel.cognome}`.trim(),
              serviceName: effectiveRequestToCancel.servizio,
              previousStatus: effectiveRequestToCancel.stato,
            },
          }),
          processPublicSlotWaitlistAndFlush({
            workspaceId: finalWorkspaceId,
            appointmentDate: effectiveRequestToCancel.data,
            appointmentTime: effectiveRequestToCancel.ora,
          }),
        ]);

        postCancelResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.log('Post-annullamento cliente non completato:', result.reason);
            return;
          }

          if (result.value === false) {
            console.log(
              index === 0
                ? 'Push annullamento cliente non accodata correttamente.'
                : 'Processazione waitlist pubblica non completata dopo annullamento cliente.'
            );
          }
        });

        await flushQueuedPushNotifications().catch((error) => {
          console.log('Flush push annullamento cliente non riuscito:', error);
        });
      } catch (postCancelError) {
        console.log('Post-annullamento cliente non allineato perfettamente, ma annullamento persistito:', postCancelError);
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore annullamento prenotazione cliente:', error);
      return { ok: false, error: 'Non sono riuscito ad annullare la prenotazione.' };
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
      const linkedRequestCompositeKey = buildRichiestaMergeKeyFromValues({
        data: appointmentDate,
        ora: appointmentTime,
        servizio: serviceName,
        fullName: customerName,
      });
      const isSameLinkedRequestComposite = (item: RichiestaPrenotazione) =>
        buildRichiestaMergeKey(item) === linkedRequestCompositeKey;

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
              item.id === linkedRequest.id || isSameLinkedRequestComposite(item)
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
            ...currentRichieste.filter((item) => !isSameLinkedRequestComposite(item)),
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

      const requestForNotification = nextRequests.find(
        (item) =>
          item.stato === 'Annullata' &&
          normalizeIdentityText(item.data) === normalizeIdentityText(appointmentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(appointmentTime) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName) &&
          matchesCustomerDisplayName(`${item.nome} ${item.cognome}`, customerName)
      );

      if (requestForNotification) {
        const linkedCustomerName = `${requestForNotification.nome} ${requestForNotification.cognome}`.trim();
        const notificationCopy = buildBookingRequestStatusPushCopy({
          status: 'Annullata',
          serviceName: requestForNotification.servizio,
          appointmentDate: requestForNotification.data,
          appointmentTime: requestForNotification.ora,
          operatorName: requestForNotification.operatoreNome,
        });
        void queueWorkspacePushNotification({
          workspaceId: workspaceId ?? salonWorkspace.id,
          eventType: 'booking_request_status_changed',
          title: notificationCopy.title,
          body: notificationCopy.body,
          audience: 'public',
          customerEmail: requestForNotification.email?.trim().toLowerCase() ?? '',
          customerPhone: requestForNotification.telefono?.trim() ?? '',
          payload: {
            type: 'booking_request_status_changed',
            bookingRequestId: requestForNotification.id,
            status: notificationCopy.statusLabel,
            statusCode: 'cancelled',
            appointmentDate: requestForNotification.data,
            appointmentTime: requestForNotification.ora,
            customerName: linkedCustomerName,
            serviceName: requestForNotification.servizio,
            operatorName: requestForNotification.operatoreNome?.trim() ?? '',
            source: 'owner',
          },
        });
        void flushQueuedPushNotifications();
      } else {
        const fallbackCustomerEmail =
          matchedCustomer?.email?.trim().toLowerCase() ??
          '';
        const fallbackCustomerPhone =
          matchedCustomer?.telefono?.trim() ??
          linkedPhone;

        if (fallbackCustomerEmail || fallbackCustomerPhone) {
          void queueWorkspacePushNotification({
            workspaceId: workspaceId ?? salonWorkspace.id,
            eventType: 'appointment_cancelled',
            title: 'Appuntamento annullato dal salone',
            body: `Servizio: ${serviceName}. Data: ${formatPushDateLabel(
              appointmentDate
            )}. Ora: ${appointmentTime}.${
              (cancelledAppointment?.operatoreNome ?? operatorName)?.trim()
                ? ` Operatore: ${(cancelledAppointment?.operatoreNome ?? operatorName)?.trim()}.`
                : ''
            }`,
            audience: 'public',
            customerEmail: fallbackCustomerEmail,
            customerPhone: fallbackCustomerPhone,
            payload: {
              type: 'appointment_cancelled',
              appointmentDate,
              appointmentTime,
              appointmentId: cancelledAppointment?.id ?? appointmentId ?? '',
              customerName,
              serviceName,
              operatorName: (cancelledAppointment?.operatoreNome ?? operatorName)?.trim() ?? '',
              source: 'owner',
            },
          });
          void flushQueuedPushNotifications();
        }
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
          resolved.richiestePrenotazione
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
            body: `Servizio: ${entry.appointment.servizio}. Prima: ${formatPushDateTimeLabel(
              entry.fromDate,
              entry.fromTime
            )}. Nuova data: ${formatPushDateLabel(entry.toDate)}. Nuovo orario: ${entry.toTime}.${
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
          appointmentTime: currentTime,
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
            const matchesRequestedOperator =
              (existingOperatorId && requestedOperatorId && existingOperatorId === requestedOperatorId) ||
              (existingOperatorNameKey &&
                requestedOperatorNameKey &&
                existingOperatorNameKey === requestedOperatorNameKey);

            if (existingHasExplicitOperator && !matchesRequestedOperator) {
              return false;
            }
          } else {
            const existingUsesOperatorScheduling =
              resolved.operatori.length > 0 &&
              doesServiceUseOperators(item.servizio, resolved.servizi) &&
              !!((item.operatoreId?.trim() ?? '') || (item.operatoreNome?.trim() ?? ''));

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

      const dbStatus =
        status === 'Accettata'
          ? 'accepted'
          : status === 'Rifiutata'
            ? 'rejected'
            : 'cancelled';
      const shouldPersistRealStatus = isUuid(requestId);
      let updateData: Record<string, unknown> | null = null;
      let updateError: { message?: string; details?: string; hint?: string } | null = null;
      let updateErrorText = '';
      let updateErrorContext = '';
      let ownerSessionEmailForRequestStatus = '';
      let usedDirectAcceptStatusFallback = false;
      let deferredAcceptStatusRetryScheduled = false;

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
            if (isSupabaseSchemaCacheLookupError(requestLinkedAppointmentsError)) {
              console.log(
                'Lookup collegamento richiesta esistente saltato per schema cache Supabase:',
                requestLinkedAppointmentsError
              );
            } else {
              updateErrorContext = 'find_existing_request_link';
              updateError = requestLinkedAppointmentsError;
            }
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
              if (isSupabaseSchemaCacheLookupError(existingAppointmentsError)) {
                console.log(
                  'Lookup appuntamenti stesso slot saltato per schema cache Supabase:',
                  existingAppointmentsError
                );
              } else {
                updateErrorContext = 'find_existing_same_slot_appointments';
                updateError = existingAppointmentsError;
              }
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

          const { data: persistedStatusUpdate, error: persistedStatusUpdateError } =
            await invokeBookingRequestStatusRpcWithSchemaRetry(
              actionRpcName,
              actionRpcPayload
            );

          if (persistedStatusUpdateError) {
            if (
              status === 'Accettata' &&
              isSupabaseSchemaCacheLookupError(persistedStatusUpdateError)
            ) {
              console.log(
                'Fallback diretto booking_requests dopo schema cache sulla RPC di accettazione:',
                persistedStatusUpdateError
              );

              const directAcceptPayload: Record<string, unknown> = {
                status: 'accepted',
                cancellation_source: null,
                viewed_by_customer: false,
                viewed_by_salon: true,
                updated_at: new Date().toISOString(),
              };

              if (persistedCustomerIdFromAccept) {
                directAcceptPayload.customer_id = persistedCustomerIdFromAccept;
              }

              const {
                data: directAcceptStatusUpdate,
                error: directAcceptStatusUpdateError,
              } = await supabase
                .from('booking_requests')
                .update(directAcceptPayload)
                .eq('id', requestId)
                .eq('workspace_id', resolved.workspace.id)
                .select('id, customer_id')
                .maybeSingle();

              if (directAcceptStatusUpdateError) {
                if (isSupabaseSchemaCacheLookupError(directAcceptStatusUpdateError)) {
                  console.log(
                    'Fallback diretto booking_requests ancora in schema cache: continuo in ottimistico e ritento in background.',
                    directAcceptStatusUpdateError
                  );

                  deferredAcceptStatusRetryScheduled = true;
                  updateData = {
                    appointmentId: persistedAppointmentIdFromAccept,
                    customerId: persistedCustomerIdFromAccept,
                    workspaceId: resolved.workspace.id,
                  };

                  setTimeout(() => {
                    void supabase
                      .from('booking_requests')
                      .update(directAcceptPayload)
                      .eq('id', requestId)
                      .eq('workspace_id', resolved.workspace.id)
                      .select('id')
                      .maybeSingle()
                      .then(({ error }) => {
                        if (error) {
                          console.log(
                            'Retry background update booking_requests dopo schema cache ancora fallito:',
                            error
                          );
                        }
                      }, (error: unknown) => {
                        console.log(
                          'Retry background update booking_requests dopo schema cache errore inatteso:',
                          error
                        );
                      })
                      ;
                  }, 1800);
                } else {
                  updateErrorContext = `${actionRpcName}_fallback`;
                  updateError = directAcceptStatusUpdateError;
                }
              } else if (!directAcceptStatusUpdate) {
                updateErrorContext = `${actionRpcName}_fallback`;
                updateError = { message: 'booking_request_not_found' };
              } else {
                usedDirectAcceptStatusFallback = true;
                updateData = {
                  appointmentId: persistedAppointmentIdFromAccept,
                  customerId:
                    typeof directAcceptStatusUpdate.customer_id === 'string' &&
                    directAcceptStatusUpdate.customer_id.trim()
                      ? directAcceptStatusUpdate.customer_id
                      : persistedCustomerIdFromAccept,
                  workspaceId: resolved.workspace.id,
                };
              }
            } else {
              updateErrorContext = actionRpcName;
              updateError = persistedStatusUpdateError;
            }
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

        if (
          status === 'Accettata' &&
          updateError &&
          isSupabaseSchemaCacheLookupError(updateError)
        ) {
          console.log(
            'Accettazione richiesta: errore schema cache residuo convertito in successo ottimistico.',
            updateError
          );
          updateError = null;
          updateErrorContext = '';
          updateErrorText = '';
          updateData = {
            appointmentId: persistedAppointmentIdFromAccept,
            customerId: persistedCustomerIdFromAccept,
            workspaceId: resolved.workspace.id,
          };
        }
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

      const requestCompositeKey = buildRichiestaMergeKeyFromValues({
        data: requestToUpdate.data,
        ora: requestToUpdate.ora,
        servizio: requestToUpdate.servizio,
        fullName: requestCustomerName,
      });
      const nextRequests = normalizeRichiestePrenotazione(
        resolved.richiestePrenotazione
          .map((item) =>
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
          .filter((item) => {
            if (item.id === requestId) {
              return true;
            }

            if (status !== 'Accettata') {
              return true;
            }

            return buildRichiestaMergeKey(item) !== requestCompositeKey;
          })
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

      const pushPromise =
        usedDirectAcceptStatusFallback || deferredAcceptStatusRetryScheduled
          ? Promise.resolve(false)
          : status === 'Annullata' || status === 'Rifiutata'
          ? (() => {
            const notificationCopy = buildBookingRequestStatusPushCopy({
              status,
              serviceName: requestToUpdate.servizio,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              operatorName: requestToUpdate.operatoreNome,
            });
            return queueWorkspacePushNotification({
            workspaceId: workspaceId ?? resolved.workspace.id,
            eventType: 'booking_request_status_changed',
            title: notificationCopy.title,
            body: notificationCopy.body,
            audience: 'public',
            customerEmail: requestToUpdate.email?.trim().toLowerCase() ?? '',
            customerPhone: requestToUpdate.telefono?.trim() ?? '',
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
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              operatorName: requestToUpdate.operatoreNome,
            });
            return queueWorkspacePushNotification({
              workspaceId: workspaceId ?? resolved.workspace.id,
              eventType: 'booking_request_status_changed',
              title: notificationCopy.title,
              body: notificationCopy.body,
              audience: 'public',
              customerEmail: requestToUpdate.email?.trim().toLowerCase() ?? '',
              customerPhone: requestToUpdate.telefono?.trim() ?? '',
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

      if (status === 'Annullata' || status === 'Rifiutata' || status === 'Accettata') {
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
        onboardingPending,
        showOnboarding,
        setOnboardingReady,
        completeOnboarding,
        reopenOnboarding,
        ownerProfileNeedsCompletion,
        consumeOwnerProfileNeedsCompletion,
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
        createClientePersisted,
        updateClientePersisted,
        deleteClientePersisted,
        createMovimentoPersisted,
        updateMovimentoPersisted,
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
        createCartaPersisted,
        setDefaultCartaPersisted,
        deleteCartaPersisted,
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
