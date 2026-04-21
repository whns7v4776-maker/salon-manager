import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
} from 'react-native-reanimated';
import { AppWordmark } from '../components/app-wordmark';
import { fetchClientPortalAvailabilitySettings } from '../src/lib/client-portal';
import { KeyboardNextToolbar } from '../components/ui/keyboard-next-toolbar';
import { NativeDatePickerModal } from '../components/ui/native-date-picker-modal';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { useAppContext } from '../src/context/AppContext';
import {
  assignFallbackOperatorsToAppointments,
  buildDisplayTimeSlots,
  buildSalonCapacityOperatorId,
  DEFAULT_MINIMUM_NOTICE_MINUTES,
  doesAppointmentBlockRequiredMachinery,
  doesAppointmentOccupySlot,
  doesServiceFitWithinDaySchedule,
  doesServiceOverlapLunchBreak,
  doesServiceUseOperators,
  doesTimeRangeConflictWithAppointment,
  findConflictingAppointment,
  formatDateCompact,
  formatDateLong,
  getDateAvailabilityInfo,
  getEligibleOperatorsForService,
  getServiceRequiredMachineryIds,
  getServiceByName,
  getServiceDuration,
  getSlotIntervalForDate,
  getTodayDateString,
  isSlotBlockedByOverride,
  isSlotWithinMinimumNotice,
  isSalonCapacityOperatorId,
  isTimeBlockedByLunchBreak,
  isTimeWithinDaySchedule,
  normalizeAvailabilitySettings,
  normalizeRoleName,
  parseIsoDate,
  timeToMinutes,
  type SharedService,
} from '../src/lib/booking';
import {
  derivePublicBookingOccupancyFromSnapshot,
  type PublicBookingOccupancyItem,
} from '../src/lib/client-portal';
import { appFonts } from '../src/lib/fonts';
import { focusNextInput, useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { haptic } from '../src/lib/haptics';
import { AppLanguage, resolveStoredAppLanguage, tApp } from '../src/lib/i18n';
import { formatCustomerNamePart } from '../src/lib/customer-name';
import { formatSalonAddress, normalizeSalonCode, SalonWorkspace } from '../src/lib/platform';
import { registerPushNotifications } from '../src/lib/push/push-notifications';
import { requestWebNotificationPermission, showWebNotification } from '../src/lib/push/web-notifications';
import { resolveServiceAccent } from '../src/lib/service-accents';
import { supabase } from '../src/lib/supabase';
import {
  buildInvalidFieldsMessage,
  isValidEmail,
  isValidPhone10,
  limitPhoneToTenDigits,
} from '../src/lib/validators';

/** RN-web: prefer horizontal pan on the strip so nested vertical page scroll still works. */
const webHorizontalScrollTouchStyle = { touchAction: 'pan-x' } as ViewStyle;
const WEB_TOP_ICON_BUTTON_STYLE = {
  border: 'none',
  padding: 0,
  margin: 0,
  background: 'transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  WebkitAppearance: 'none',
  appearance: 'none',
} as const;

const stopWebTopBarEvent = (event: {
  preventDefault?: () => void;
  stopPropagation?: () => void;
}) => {
  event.preventDefault?.();
  event.stopPropagation?.();
};

/** Map wheel to scrollLeft when the vertical page scroll would otherwise eat the gesture. */
function applyWebHorizontalStripWheelToHost(hostRef: RefObject<View | null>, event: unknown) {
  if (Platform.OS !== 'web') return;
  const el = hostRef.current as unknown as HTMLElement | null;
  if (!el || typeof el.scrollLeft !== 'number') return;
  const raw = event as { nativeEvent?: WheelEvent };
  const ne = (raw.nativeEvent ?? event) as WheelEvent;
  const deltaX = ne.deltaX ?? 0;
  const deltaY = ne.deltaY ?? 0;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  if (max <= 0) return;

  const atStart = el.scrollLeft <= 0.5;
  const atEnd = el.scrollLeft >= max - 0.5;

  if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX !== 0) {
    if ((deltaX < 0 && !atStart) || (deltaX > 0 && !atEnd)) {
      ne.preventDefault?.();
      (ne as unknown as Event).stopPropagation?.();
    }
    return;
  }

  if (deltaY !== 0) {
    const next = el.scrollLeft + deltaY;
    const clamped = Math.max(0, Math.min(max, next));
    if (Math.abs(clamped - el.scrollLeft) > 0.5) {
      el.scrollLeft = clamped;
      ne.preventDefault?.();
      (ne as unknown as Event).stopPropagation?.();
    }
  }
}

const escapeCalendarText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const formatCalendarUtcStamp = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_SAVED_SALON_CODES_KEY = 'salon_manager_frontend_saved_salon_codes';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const FRONTEND_WAITLIST_VIEWED_KEY = 'salon_manager_frontend_waitlist_viewed';
const FRONTEND_BIOMETRIC_PROMPTED_KEY = 'salon_manager_frontend_biometric_prompted';
const buildFrontendProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized
    ? `${FRONTEND_PROFILE_KEY}:${normalized}`
    : FRONTEND_PROFILE_KEY;
};
const buildFrontendBiometricProfileKeyForSalon = (salonCode?: string | null) => {
  const normalized = normalizeSalonCode(salonCode ?? '');
  return normalized
    ? `${FRONTEND_BIOMETRIC_PROFILE_KEY}:${normalized}`
    : FRONTEND_BIOMETRIC_PROFILE_KEY;
};
const buildFrontendWaitlistViewedKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const normalizedSalonCode = normalizeSalonCode(salonCode ?? '');
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedPhone = limitPhoneToTenDigits((phone ?? '').trim());
  const identity = [normalizedSalonCode, normalizedEmail || normalizedPhone].filter(Boolean).join(':');
  return identity ? `${FRONTEND_WAITLIST_VIEWED_KEY}:${identity}` : FRONTEND_WAITLIST_VIEWED_KEY;
};
const buildSavedSalonCodeList = (values: Array<string | null | undefined>) =>
  values
    .map((value) => normalizeSalonCode(value ?? ''))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
const buildFrontendBiometricPromptedKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const normalizedSalonCode = normalizeSalonCode(salonCode ?? '');
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedPhone = limitPhoneToTenDigits((phone ?? '').trim());
  const identity = [normalizedSalonCode, normalizedEmail || normalizedPhone].filter(Boolean).join(':');
  return identity ? `${FRONTEND_BIOMETRIC_PROMPTED_KEY}:${identity}` : FRONTEND_BIOMETRIC_PROMPTED_KEY;
};
const DAY_CARD_WIDTH = 58;
const DAY_CARD_GAP = 2;
const DAY_CARD_STRIDE = DAY_CARD_WIDTH + DAY_CARD_GAP;
const DAY_PICKER_DAYS_BEFORE = 14;
const DAY_PICKER_DAYS_AFTER = 90;
const CLIENT_BOOKING_REFRESH_INTERVAL_MS = 5000;
const CLIENT_BOOKING_SETTINGS_REFRESH_INTERVAL_MS = 1500;
const LOCAL_REQUEST_VISIBILITY_GRACE_MS = 30000;
const WAITLIST_MUTATION_SETTLE_MS = 1600;
const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GUIDED_SLOT_RECOMMENDATIONS = 4;

type GuidedSlotStrategy = 'balanced' | 'protect_long_services' | 'fill_gaps';

type GuidedSlotBlock = {
  slots: string[];
  blockStartMinutes: number;
  blockEndMinutes: number;
};

const buildGuidedSlotBlocks = (slots: string[], intervalMinutes: number): GuidedSlotBlock[] => {
  if (!slots.length) {
    return [];
  }

  const sortedSlots = [...slots].sort((first, second) => timeToMinutes(first) - timeToMinutes(second));
  const blocks: GuidedSlotBlock[] = [];
  let currentBlock: GuidedSlotBlock | null = null;

  sortedSlots.forEach((slotTime) => {
    const slotMinutes = timeToMinutes(slotTime);

    if (
      !currentBlock ||
      slotMinutes !== timeToMinutes(currentBlock.slots[currentBlock.slots.length - 1]) + intervalMinutes
    ) {
      currentBlock = {
        slots: [slotTime],
        blockStartMinutes: slotMinutes,
        blockEndMinutes: slotMinutes,
      };
      blocks.push(currentBlock);
      return;
    }

    currentBlock.slots.push(slotTime);
    currentBlock.blockEndMinutes = slotMinutes;
  });

  return blocks;
};

const scoreGuidedSlot = ({
  slotTime,
  block,
  serviceDurationMinutes,
  intervalMinutes,
  strategy,
}: {
  slotTime: string;
  block: GuidedSlotBlock;
  serviceDurationMinutes: number;
  intervalMinutes: number;
  strategy: GuidedSlotStrategy;
}) => {
  const serviceSlots = Math.max(1, Math.ceil(serviceDurationMinutes / Math.max(intervalMinutes, 15)));
  const slotIndex = block.slots.indexOf(slotTime);
  const remainingBefore = slotIndex;
  const remainingAfter = Math.max(0, block.slots.length - slotIndex - serviceSlots);
  const fillsGapExactly = remainingBefore === 0 && remainingAfter === 0;
  const touchesEdge = remainingBefore === 0 || remainingAfter === 0;
  const createsSplit = remainingBefore > 0 && remainingAfter > 0;
  const startsAtEdge = remainingBefore === 0;
  const shortService = serviceDurationMinutes <= 30;
  const longService = serviceDurationMinutes >= 60;
  const tinyFragments = [remainingBefore, remainingAfter].filter((value) => value > 0 && value <= 1).length;
  const smallFragments = [remainingBefore, remainingAfter].filter((value) => value > 0 && value <= 2).length;
  const preservedLargestChunk = Math.max(remainingBefore, remainingAfter);
  const blockSize = block.slots.length;

  let score = 0;

  switch (strategy) {
    case 'protect_long_services':
      score += startsAtEdge ? 320 : touchesEdge ? 180 : 0;
      score += preservedLargestChunk * (longService ? 70 : 48);
      score += blockSize * (longService ? 20 : 10);
      score += remainingAfter * (longService ? 22 : 10);
      score -= fillsGapExactly ? 160 : 0;
      score -= createsSplit ? 260 : 0;
      score -= remainingBefore * 26;
      score -= tinyFragments * 40;
      score -= smallFragments * 28;
      break;
    case 'fill_gaps':
      score += fillsGapExactly ? 360 : 0;
      score += touchesEdge ? 60 : 0;
      score -= blockSize * 36;
      score -= preservedLargestChunk * 20;
      score -= createsSplit ? 14 : 0;
      score -= tinyFragments * 4;
      score -= smallFragments * 2;
      break;
    case 'balanced':
    default:
      score += fillsGapExactly ? 170 : 0;
      score += touchesEdge ? 110 : 0;
      score += longService ? blockSize * 12 : 0;
      score += shortService ? preservedLargestChunk * 10 : 0;
      score += preservedLargestChunk * 8;
      score -= createsSplit ? 70 : 0;
      score -= tinyFragments * 12;
      score -= smallFragments * 8;
      break;
  }

  score -= timeToMinutes(slotTime) / 10000;

  return score;
};

const formatAppointmentDateTimeLabel = (dateValue?: string | null, timeValue?: string | null) => {
  const normalizedDate = dateValue?.trim() ?? '';
  const normalizedTime = timeValue?.trim() ?? '';

  if (normalizedDate && normalizedTime) {
    return `${normalizedDate} alle ${normalizedTime}`;
  }

  return normalizedDate || normalizedTime || '';
};

const isUuidValue = (value?: string | null) => UUID_PATTERN.test((value ?? '').trim());
const normalizeCustomerNameInput = (value: string) => formatCustomerNamePart(value);
const normalizeFrontendOperatorIdentity = ({
  operatorId,
  operatorName,
}: {
  operatorId?: string | null;
  operatorName?: string | null;
}) => {
  const normalizedOperatorId = operatorId?.trim() ?? '';
  const normalizedOperatorName = operatorName?.trim() ?? '';

  if (isSalonCapacityOperatorId(normalizedOperatorId)) {
    return {
      operatorId: '',
      operatorName: '',
    };
  }

  return {
    operatorId: normalizedOperatorId,
    operatorName: normalizedOperatorName,
  };
};

const buildFrontendOperatorIdentityKey = ({
  operatorId,
  operatorName,
}: {
  operatorId?: string | null;
  operatorName?: string | null;
}) => {
  const normalizedIdentity = normalizeFrontendOperatorIdentity({
    operatorId,
    operatorName,
  });

  if (normalizedIdentity.operatorId) {
    return `id:${normalizedIdentity.operatorId}`;
  }

  const normalizedOperatorName = normalizeIdentityText(normalizedIdentity.operatorName);
  if (normalizedOperatorName) {
    return `name:${normalizedOperatorName}`;
  }

  return '';
};

const doesAnonymousAppointmentBlockFrontendService = ({
  selectedServiceName,
  existingServiceName,
  services,
}: {
  selectedServiceName: string;
  existingServiceName: string;
  services: SharedService[];
}) => {
  const selectedServiceUsesOperators = doesServiceUseOperators(selectedServiceName, services);
  const existingServiceUsesOperators = doesServiceUseOperators(existingServiceName, services);

  if (!selectedServiceUsesOperators) {
    return true;
  }

  if (!existingServiceUsesOperators) {
    return false;
  }

  const selectedRole = normalizeRoleName(
    getServiceByName(selectedServiceName, services)?.mestiereRichiesto ?? ''
  );
  const existingRole = normalizeRoleName(
    getServiceByName(existingServiceName, services)?.mestiereRichiesto ?? ''
  );

  if (!selectedRole || !existingRole) {
    return false;
  }

  return selectedRole === existingRole;
};

const getConfiguredOperatorsForFrontendService = ({
  serviceName,
  services,
  operators,
}: {
  serviceName: string;
  services: SharedService[];
  operators: PublicSalonState['operatori'];
}) =>
  getEligibleOperatorsForService({
    serviceName,
    services,
    operators,
  });

const formatDisplayPersonName = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').trim().split(/\s+/).filter(Boolean))
    .map((segment) =>
      segment.charAt(0).toLocaleUpperCase('it-IT') + segment.slice(1).toLocaleLowerCase('it-IT')
    )
    .join(' ')
    .trim();

type FrontendProfile = {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  instagram: string;
};

type FrontendAccessMode = 'login' | 'register';

type SlotWaitlistEntry = {
  id: string;
  appointment_date?: string;
  appointment_time?: string;
  requested_service_name?: string;
  requested_operator_id?: string | null;
  requested_operator_name?: string | null;
  status?: string;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notified_at?: string | null;
};

const getDerivedWaitlistAlertStatus = (item: SlotWaitlistEntry) => {
  const normalizedStatus = String(item.status ?? '')
    .trim()
    .toLowerCase();

  if (normalizedStatus === 'cancelled' || normalizedStatus === 'expired') {
    return normalizedStatus;
  }

  const appointmentDate = String(item.appointment_date ?? '').trim();
  const appointmentTime = String(item.appointment_time ?? '').trim().slice(0, 5);
  const appointmentStamp =
    appointmentDate && appointmentTime ? new Date(`${appointmentDate}T${appointmentTime}:00`).getTime() : NaN;
  const expiresStamp = item.expires_at ? Date.parse(String(item.expires_at).trim()) : NaN;
  const now = Date.now();

  if (Number.isFinite(expiresStamp) && expiresStamp <= now) {
    return 'expired';
  }

  if (Number.isFinite(appointmentStamp) && appointmentStamp <= now) {
    return 'expired';
  }

  return normalizedStatus || 'waiting';
};

const buildWaitlistViewedSignature = (item: SlotWaitlistEntry) => {
  const notificationStamp = String(
    item.notified_at ?? item.updated_at ?? item.expires_at ?? item.created_at ?? ''
  ).trim();

  return [String(item.id ?? '').trim(), notificationStamp].filter(Boolean).join(':');
};

type WaitlistSlotBlock = {
  id: string;
  startTime: string;
  endTime: string;
  slotTimes: string[];
};

type PublicSalonState = {
  workspace: SalonWorkspace;
  clienti: {
    id: string;
    nome: string;
    telefono: string;
    email?: string;
    instagram?: string;
    nota: string;
    fonte?: 'salone' | 'frontend';
    viewedBySalon?: boolean;
    annullamentiCount?: number;
    inibito?: boolean;
    maxFutureAppointments?: number | null;
    maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
    maxDailyAppointments?: number | null;
  }[];
  appuntamenti: {
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
  }[];
  servizi: {
    id: string;
    nome: string;
    prezzo: number;
    prezzoOriginale?: number;
    durataMinuti?: number;
    mestiereRichiesto?: string;
    macchinarioIds?: string[];
  }[];
  operatori: {
    id: string;
    nome: string;
    mestiere: string;
    availability?: {
      enabledWeekdays: number[];
      dateRanges: {
        id: string;
        startDate: string;
        endDate: string;
        label?: string;
      }[];
    };
  }[];

  richiestePrenotazione: {
    id: string;
    data: string;
    ora: string;
    servizio: string;
    prezzo: number;
    durataMinuti?: number;
    mestiereRichiesto?: string;
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    instagram?: string;
    note?: string;
    operatoreId?: string;
    operatoreNome?: string;
    macchinarioIds?: string[];
    macchinarioNomi?: string[];
    origine?: 'frontend' | 'backoffice';
    cancellationSource?: 'cliente' | 'salone';
    stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
    createdAt: string;
    viewedByCliente?: boolean;
    viewedBySalon?: boolean;
  }[];
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
  serviceCardColorOverrides?: Record<string, string>;
  roleCardColorOverrides?: Record<string, string>;
};

const buildPublicSalonStateSignature = (state: PublicSalonState | null) =>
  state ? JSON.stringify(state) : '';

const mergeFrontendAvailabilitySettings = ({
  currentSettings,
  incomingSettings,
}: {
  currentSettings: ReturnType<typeof normalizeAvailabilitySettings>;
  incomingSettings?: Partial<ReturnType<typeof normalizeAvailabilitySettings>> | null;
}) => {
  const normalizedIncoming = normalizeAvailabilitySettings(incomingSettings);
  const currentTs = Date.parse(currentSettings.guidedSlotsUpdatedAt ?? '');
  const incomingTs = Date.parse(normalizedIncoming.guidedSlotsUpdatedAt ?? '');
  const incomingWins =
    Number.isFinite(incomingTs) &&
    (!Number.isFinite(currentTs) || incomingTs >= currentTs);

  if (!incomingWins) {
    return normalizeAvailabilitySettings({
      ...normalizedIncoming,
      guidedSlotsEnabled: currentSettings.guidedSlotsEnabled,
      guidedSlotsStrategy: currentSettings.guidedSlotsStrategy,
      guidedSlotsVisibility: currentSettings.guidedSlotsVisibility,
      guidedSlotsUpdatedAt: currentSettings.guidedSlotsUpdatedAt,
    });
  }

  return normalizedIncoming;
};

const matchesBlockedClientProfile = (
  item: { telefono: string; email?: string; inibito?: boolean },
  profile: FrontendProfile
) => {
  const samePhone =
    limitPhoneToTenDigits(item.telefono ?? '') === limitPhoneToTenDigits(profile.telefono ?? '');
  const sameEmail =
    (item.email ?? '').trim().toLowerCase() === profile.email.trim().toLowerCase();

  return (samePhone || sameEmail) && item.inibito === true;
};

const matchesLimitedClientProfile = (
  item: {
    telefono: string;
    email?: string;
    maxFutureAppointments?: number | null;
    maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
  },
  profile: FrontendProfile
) => {
  const samePhone =
    limitPhoneToTenDigits(item.telefono ?? '') === limitPhoneToTenDigits(profile.telefono ?? '');
  const sameEmail =
    (item.email ?? '').trim().toLowerCase() === profile.email.trim().toLowerCase();

  return samePhone || sameEmail;
};

const buildDuplicateFrontendCustomerMessage = ({
  emailTaken,
  phoneTaken,
}: {
  emailTaken: boolean;
  phoneTaken: boolean;
}) => {
  if (emailTaken && phoneTaken) {
    return 'Account gia registrato: mail e cellulare sono gia presenti. Usa Accedi.';
  }

  if (emailTaken) {
    return 'Account gia registrato: mail gia registrata. Usa Accedi oppure cambia mail.';
  }

  if (phoneTaken) {
    return 'Account gia registrato: cellulare gia registrato. Usa Accedi oppure cambia numero.';
  }

  return 'Esiste gia un cliente registrato per questo salone con gli stessi contatti. Usa Accedi.';
};

const countScheduledBookingsForClient = ({
  profile,
  clienti,
  appointments,
  requests,
  appointmentDate,
  services,
  requestedServiceName,
}: {
  profile: FrontendProfile;
  clienti: PublicSalonState['clienti'];
  appointments: PublicSalonState['appuntamenti'];
  requests: PublicSalonState['richiestePrenotazione'];
  appointmentDate: string;
  services: PublicSalonState['servizi'];
  requestedServiceName: string;
}) => {
  const matchingCustomer = clienti.find((item) => matchesLimitedClientProfile(item, profile));
  const futureLimit =
    matchingCustomer && typeof matchingCustomer.maxFutureAppointments === 'number'
      ? matchingCustomer.maxFutureAppointments
      : null;
  const dailyLimit =
    matchingCustomer && typeof matchingCustomer.maxDailyAppointments === 'number'
      ? matchingCustomer.maxDailyAppointments
      : null;
  const futureLimitMode =
    matchingCustomer?.maxFutureAppointmentsMode === 'monthly'
      ? 'monthly'
      : 'total_future';

  const normalizedEmail = profile.email.trim().toLowerCase();
  const normalizedPhone = limitPhoneToTenDigits(profile.telefono ?? '');
  const normalizedName = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim().toLowerCase();
  const knownNames = new Set<string>(normalizedName ? [normalizedName] : []);
  const normalizedCustomerName = (matchingCustomer?.nome ?? '').trim().toLowerCase();
  if (normalizedCustomerName) {
    knownNames.add(normalizedCustomerName);
  }
  const today = getTodayDateString();
  const targetMonthPrefix =
    futureLimitMode === 'monthly' && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
      ? appointmentDate.slice(0, 7)
      : null;
  const isFutureDateInScope = (value: string) =>
    value >= today && (targetMonthPrefix ? value.startsWith(targetMonthPrefix) : true);
  const isDailyDateInScope = (value: string) => value === appointmentDate;
  const normalizeRoleKey = (value?: string | null) =>
    normalizeRoleName(value ?? '').trim().toLowerCase();
  const normalizeServiceKey = (value?: string | null) => (value ?? '').trim().toLowerCase();
  const targetDailyRole = normalizeRoleKey(
    getServiceByName(requestedServiceName, services)?.mestiereRichiesto ?? ''
  );
  const targetDailyService = normalizeServiceKey(requestedServiceName);
  const matchesDailyScope = (serviceName?: string | null, explicitRole?: string | null) => {
    const resolvedRole =
      normalizeRoleKey(explicitRole) ||
      normalizeRoleKey(getServiceByName(serviceName ?? '', services)?.mestiereRichiesto ?? '');

    if (targetDailyRole) {
      return resolvedRole === targetDailyRole;
    }

    return normalizeServiceKey(serviceName) === targetDailyService;
  };

  const buildAppointmentKeys = (
    scopeCheck: (value: string) => boolean,
    scopeMatcher?: (serviceName?: string | null, explicitRole?: string | null) => boolean
  ) =>
    new Set(
      appointments
        .filter((item) => {
          const itemDate = item.data ?? getTodayDateString();
          const sameName = knownNames.has((item.cliente ?? '').trim().toLowerCase());
          const sameScope = scopeMatcher
            ? scopeMatcher(item.servizio, item.mestiereRichiesto)
            : true;
          return scopeCheck(itemDate) && sameName && sameScope;
        })
        .map((item) =>
          [
            item.data ?? getTodayDateString(),
            item.ora.trim(),
            (item.servizio ?? '').trim().toLowerCase(),
            (item.cliente ?? '').trim().toLowerCase(),
          ].join('|')
        )
    );

  const buildPendingRequestKeys = (
    scopeCheck: (value: string) => boolean,
    appointmentKeys: Set<string>,
    scopeMatcher?: (serviceName?: string | null, explicitRole?: string | null) => boolean
  ) => {
    const pendingRequestKeys = new Set<string>();

    requests.forEach((item) => {
      const itemDate = item.data ?? getTodayDateString();
      const sameEmail = (item.email ?? '').trim().toLowerCase() === normalizedEmail;
      const samePhone = limitPhoneToTenDigits(item.telefono ?? '') === normalizedPhone;
      const sameName = knownNames.has(`${item.nome ?? ''} ${item.cognome ?? ''}`.trim().toLowerCase());
      const normalizedStatus = (item.stato ?? '').trim().toLowerCase();
      const allowedStatus =
        normalizedStatus === 'in attesa' ||
        normalizedStatus === 'accettata' ||
        normalizedStatus === 'accepted';
      const sameScope = scopeMatcher ? scopeMatcher(item.servizio, item.mestiereRichiesto) : true;
      if (!(scopeCheck(itemDate) && allowedStatus && sameScope && (sameEmail || samePhone || sameName))) {
        return;
      }

      const requestKey = [
        item.data ?? getTodayDateString(),
        item.ora.trim(),
        (item.servizio ?? '').trim().toLowerCase(),
        `${item.nome ?? ''} ${item.cognome ?? ''}`.trim().toLowerCase(),
      ].join('|');

      if (!appointmentKeys.has(requestKey)) {
        pendingRequestKeys.add(requestKey);
      }
    });

    return pendingRequestKeys;
  };

  const futureAppointmentKeys =
    futureLimit !== null ? buildAppointmentKeys(isFutureDateInScope) : new Set<string>();
  const futurePendingRequestKeys =
    futureLimit !== null
      ? buildPendingRequestKeys(isFutureDateInScope, futureAppointmentKeys)
      : new Set<string>();
  const dailyAppointmentKeys =
    dailyLimit !== null ? buildAppointmentKeys(isDailyDateInScope, matchesDailyScope) : new Set<string>();
  const dailyPendingRequestKeys =
    dailyLimit !== null
      ? buildPendingRequestKeys(isDailyDateInScope, dailyAppointmentKeys, matchesDailyScope)
      : new Set<string>();

  return {
    future: {
      limit: futureLimit,
      total: futureAppointmentKeys.size + futurePendingRequestKeys.size,
      mode: futureLimit !== null ? futureLimitMode : (null as 'total_future' | 'monthly' | null),
    },
    daily: {
      limit: dailyLimit,
      total: dailyAppointmentKeys.size + dailyPendingRequestKeys.size,
    },
  };
};

const doesExistingFrontendBookingBlockSelectedService = ({
  selectedServiceName,
  existingServiceName,
  existingMachineryIds,
  services,
}: {
  selectedServiceName: string;
  existingServiceName: string;
  existingMachineryIds?: string[] | null;
  services: SharedService[];
}) => {
  if (
    doesAppointmentBlockRequiredMachinery({
      selectedServiceName,
      appointment: {
        servizio: existingServiceName,
        macchinarioIds: existingMachineryIds ?? [],
      },
      services,
    })
  ) {
    return true;
  }

  if (getServiceRequiredMachineryIds(selectedServiceName, services).length > 0) {
    return false;
  }

  return doesAnonymousAppointmentBlockFrontendService({
    selectedServiceName,
    existingServiceName,
    services,
  });
};

const buildBlockingAppointments = (
  appointments: PublicSalonState['appuntamenti'],
  requests: PublicSalonState['richiestePrenotazione'],
  services: SharedService[],
  operators: PublicSalonState['operatori'],
  settings: ReturnType<typeof normalizeAvailabilitySettings>
) => {
  const materializedAppointments = appointments.map((item) => ({
    key: [
      item.data ?? getTodayDateString(),
      item.ora.trim(),
      item.cliente.trim().toLowerCase(),
      item.servizio.trim().toLowerCase(),
    ].join('|'),
    item,
  }));
  const materializedKeys = new Set(materializedAppointments.map((entry) => entry.key));

  const blockingRequests = requests
    .filter((item) => item.stato === 'In attesa' || item.stato === 'Accettata')
    .filter((item) => {
      if (item.stato !== 'Accettata') return true;

      const requestKey = [
        item.data,
        item.ora.trim(),
        `${item.nome} ${item.cognome}`.trim().toLowerCase(),
        item.servizio.trim().toLowerCase(),
      ].join('|');

      return !materializedKeys.has(requestKey);
    })
    .map((item) => ({
      id: `${item.stato === 'Accettata' ? 'accepted' : 'pending'}-${item.id}`,
      data: item.data,
      ora: item.ora,
      cliente: `${item.nome} ${item.cognome}`.trim(),
      servizio: item.servizio,
      prezzo: item.prezzo,
      durataMinuti: item.durataMinuti,
      operatoreId: item.operatoreId,
      operatoreNome: item.operatoreNome,
      macchinarioIds: item.macchinarioIds,
      macchinarioNomi: item.macchinarioNomi,
    }));

  return assignFallbackOperatorsToAppointments({
    appointments: [...appointments, ...blockingRequests],
    services,
    operators,
    settings,
    preserveExplicitOperatorAssignments: true,
  });
};

const EMPTY_PROFILE: FrontendProfile = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  instagram: '',
};

const buildCenteredDates = (centerDate: string, daysBefore: number, daysAfter: number) => {
  const pivot = parseIsoDate(centerDate);
  pivot.setHours(0, 0, 0, 0);

  return Array.from({ length: daysBefore + daysAfter + 1 }, (_, index) => {
    const offset = index - daysBefore;
    const current = new Date(pivot);
    current.setDate(pivot.getDate() + offset);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;
    const fullLabel = formatDateLong(value);
    const [weekdayShort = '', , monthShort = ''] = fullLabel.split(' ');

    return {
      value,
      weekdayShort,
      dayNumber: day,
      monthShort,
      fullLabel,
    };
  });
};

type FrontendBookingDayPickerProps = {
  giorniDisponibili: Array<{
    value: string;
    weekdayShort: string;
    dayNumber: string;
    monthShort: string;
    fullLabel: string;
  }>;
  selectedDate: string;
  canChooseDay: boolean;
  today: string;
  tf: (key: Parameters<typeof tApp>[1], params?: Record<string, string | number>) => string;
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
  onSelectDate: (nextDate: string) => void;
  onJumpToday: () => void;
};

const FrontendBookingDayPicker = memo(function FrontendBookingDayPicker({
  giorniDisponibili,
  selectedDate,
  canChooseDay,
  today,
  tf,
  availabilitySettings,
  onSelectDate,
  onJumpToday,
}: FrontendBookingDayPickerProps) {
  const isWebPicker = Platform.OS === 'web';
  const pickerCardWidth = DAY_CARD_WIDTH;
  const pickerCardGap = DAY_CARD_GAP;
  const pickerCardStride = pickerCardWidth + pickerCardGap;
  const listRef = useRef<FlatList<(typeof giorniDisponibili)[number]> | null>(null);
  const webViewportRef = useRef<HTMLDivElement | null>(null);
  const webHostRef = useRef<View | null>(null);
  const webScrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webDidInitialCenterRef = useRef(false);
  const [pickerWidth, setPickerWidth] = useState(0);
  const sideInset = useMemo(
    () => Math.max(0, (pickerWidth - pickerCardWidth) / 2),
    [pickerCardWidth, pickerWidth]
  );
  const snapOffsets = useMemo(
    () => giorniDisponibili.map((_, index) => index * pickerCardStride),
    [giorniDisponibili, pickerCardStride]
  );

  const buildStatusLabel = useCallback(
    (dayValue: string) => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dayValue);
      if (availability.reason === 'holiday') return tf('agenda_holiday');
      if (availability.reason === 'vacation') return tf('agenda_vacation');
      if (availability.reason === 'weekly' || availability.reason === 'manual') {
        return tf('agenda_closed');
      }
      return null;
    },
    [availabilitySettings, tf]
  );

  const buildFooterLabel = useCallback(
    (dayValue: string) => {
      if (dayValue === selectedDate) return tf('agenda_selected_short');
      if (getDateAvailabilityInfo(availabilitySettings, dayValue).closed) {
        return tf('agenda_unavailable_short');
      }
      return tf('agenda_available_short');
    },
    [availabilitySettings, selectedDate, tf]
  );

  const centerDay = useCallback(
    (dateValue: string, animated = false) => {
      const selectedIndex = giorniDisponibili.findIndex((item) => item.value === dateValue);
      if (selectedIndex < 0) return;

      const offset = selectedIndex * pickerCardStride;

      if (isWebPicker) {
        const host = webHostRef.current as unknown as HTMLElement | null;
        if (host && typeof host.scrollTo === 'function') {
          host.scrollTo({ left: offset, behavior: animated ? 'smooth' : 'auto' });
        }
        return;
      }

      listRef.current?.scrollToOffset({
        offset,
        animated,
      });
    },
    [giorniDisponibili, isWebPicker, pickerCardStride]
  );

  const settleWebDayAtScrollLeft = useCallback(
    (scrollLeft?: number | null) => {
      const host = webHostRef.current as unknown as HTMLElement | null;
      const resolvedScrollLeft =
        typeof scrollLeft === 'number' && Number.isFinite(scrollLeft)
          ? scrollLeft
          : host?.scrollLeft ?? 0;
      const rawIndex = Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(resolvedScrollLeft / pickerCardStride))
      );
      const nextIndex = Math.max(
        rawIndex,
        giorniDisponibili.findIndex((item) => item.value >= today)
      );
      const nextDay = giorniDisponibili[nextIndex] ?? giorniDisponibili[rawIndex];
      if (!nextDay) return;
      if (nextDay.value < today) return;
      if (nextDay.value !== selectedDate) {
        onSelectDate(nextDay.value);
      }
    },
    [giorniDisponibili, onSelectDate, pickerCardStride, selectedDate, today]
  );

  const scheduleWebSettle = useCallback(
    (scrollLeft?: number | null, delayMs = 110) => {
      if (webScrollSettleTimeoutRef.current) {
        clearTimeout(webScrollSettleTimeoutRef.current);
      }
      webScrollSettleTimeoutRef.current = setTimeout(() => {
        settleWebDayAtScrollLeft(scrollLeft);
        webScrollSettleTimeoutRef.current = null;
      }, delayMs);
    },
    [settleWebDayAtScrollLeft]
  );

  useEffect(() => {
    if (!pickerWidth) return;
    if (isWebPicker && webDidInitialCenterRef.current) return;

    const frame = requestAnimationFrame(() => {
      centerDay(selectedDate, false);
      if (isWebPicker) {
        webDidInitialCenterRef.current = true;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [centerDay, isWebPicker, pickerWidth, selectedDate]);

  useEffect(() => {
    return () => {
      if (webScrollSettleTimeoutRef.current) {
        clearTimeout(webScrollSettleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isWebPicker) return;

    const viewport = webViewportRef.current;
    if (!viewport) return;

    const syncWidth = () => {
      const nextWidth = viewport.clientWidth;
      if (!nextWidth || Math.abs(nextWidth - pickerWidth) < 1) return;
      setPickerWidth(nextWidth);
    };

    syncWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncWidth);
      return () => window.removeEventListener('resize', syncWidth);
    }

    const observer = new ResizeObserver(syncWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isWebPicker, pickerWidth]);

  const renderGhostCard = useCallback(
    ({ item }: { item: (typeof giorniDisponibili)[number] }) => {
      const availability = getDateAvailabilityInfo(availabilitySettings, item.value);
      const isPast = item.value < today;
      const disabled = !canChooseDay || availability.closed || isPast;
      const statusLabel = buildStatusLabel(item.value);
      const isSelected = item.value === selectedDate;

      return (
        <TouchableOpacity
          style={[
            styles.frontendBookingDayGhostCard,
            {
              width: pickerCardWidth,
              marginRight: pickerCardGap,
            },
            isWebPicker && styles.frontendBookingDayGhostCardWeb,
            availability.closed
              ? styles.frontendBookingDayGhostCardClosed
              : styles.frontendBookingDayGhostCardAvailable,
            isSelected && styles.frontendBookingDayGhostCardSelected,
          ]}
          onPress={() => {
            if (disabled) return;
            onSelectDate(item.value);
            centerDay(item.value, true);
          }}
          activeOpacity={disabled ? 1 : 0.92}
          disabled={disabled}
        >
          <Text style={[styles.frontendBookingDayWeek, isSelected && styles.frontendBookingDayWeekSelected]}>
            {item.weekdayShort}
          </Text>
          <Text style={[styles.frontendBookingDayNumber, isSelected && styles.frontendBookingDayNumberSelected]}>
            {item.dayNumber}
          </Text>
          {statusLabel ? (
            <View
              style={[
                styles.frontendBookingDayMiniBadge,
                styles.frontendBookingDayMiniBadgeClosed,
                isSelected && styles.frontendBookingDayMiniBadgeSelected,
              ]}
            >
              <Text
                style={[
                  styles.frontendBookingDayMiniBadgeText,
                  isSelected && styles.frontendBookingDayMiniBadgeTextSelected,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          ) : (
            <View style={styles.frontendBookingDayMiniBadgeSpacer} />
          )}
          <Text style={[styles.frontendBookingDayMonth, isSelected && styles.frontendBookingDayMonthSelected]}>
            {item.monthShort}
          </Text>
          <View
            style={[
              styles.frontendBookingDayMiniFooter,
              isSelected
                ? styles.frontendBookingDayMiniFooterSelected
                : availability.closed
                  ? styles.frontendBookingDayMiniFooterClosed
                  : styles.frontendBookingDayMiniFooterAvailable,
            ]}
          >
            <Text
              style={[
                styles.frontendBookingDayMiniFooterText,
                isSelected
                  ? styles.frontendBookingDayMiniFooterTextSelected
                  : availability.closed
                    ? styles.frontendBookingDayMiniFooterTextClosed
                    : styles.frontendBookingDayMiniFooterTextAvailable,
              ]}
            >
              {isSelected
                ? 'Scelto'
                : availability.closed
                  ? tf('agenda_unavailable_short')
                  : tf('agenda_available_short')}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [
      availabilitySettings,
      buildStatusLabel,
      canChooseDay,
      centerDay,
      onSelectDate,
      selectedDate,
      tf,
      today,
      isWebPicker,
    ]
  );

  const selectedDay =
    giorniDisponibili.find((item) => item.value === selectedDate) ?? giorniDisponibili[0] ?? null;
  const selectedAvailability = selectedDay
    ? getDateAvailabilityInfo(availabilitySettings, selectedDay.value)
    : null;
  const selectedStatusLabel = selectedDay ? buildStatusLabel(selectedDay.value) : null;
  const selectedFocusCard = selectedDay ? (
    <>
      <Text style={styles.frontendBookingDayFocusWeek}>{selectedDay.weekdayShort}</Text>
      <Text style={styles.frontendBookingDayFocusNumber}>{selectedDay.dayNumber}</Text>
      {selectedStatusLabel ? (
        <View
          style={[
            styles.frontendBookingDayFocusBadge,
            styles.frontendBookingDayFocusBadgeClosed,
          ]}
        >
          <Text style={styles.frontendBookingDayFocusBadgeText}>{selectedStatusLabel}</Text>
        </View>
      ) : (
        <View style={styles.frontendBookingDayFocusBadgeSpacer} />
      )}
      <Text style={styles.frontendBookingDayFocusMonth}>{selectedDay.monthShort}</Text>
      <View
        style={[
          styles.frontendBookingDayFocusFooter,
          selectedAvailability?.closed
            ? styles.frontendBookingDayFocusFooterClosed
            : styles.frontendBookingDayFocusFooterOpen,
        ]}
      >
        <Text
          style={[
            styles.frontendBookingDayFocusFooterText,
            selectedAvailability?.closed
              ? styles.frontendBookingDayFocusFooterTextClosed
              : styles.frontendBookingDayFocusFooterTextOpen,
          ]}
        >
          {buildFooterLabel(selectedDay.value)}
        </Text>
      </View>
    </>
  ) : null;

  const renderWebDayCard = useCallback(
    (item: (typeof giorniDisponibili)[number]) => {
      const availability = getDateAvailabilityInfo(availabilitySettings, item.value);
      const isPast = item.value < today;
      const disabled = !canChooseDay || availability.closed || isPast;
      const statusLabel = buildStatusLabel(item.value);
      const isSelected = item.value === selectedDate;

      return (
        <button
          key={item.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onSelectDate(item.value);
            centerDay(item.value, true);
          }}
          style={
            {
              width: `${pickerCardWidth}px`,
              minWidth: `${pickerCardWidth}px`,
              maxWidth: `${pickerCardWidth}px`,
              height: '118px',
              flex: '0 0 auto',
              marginRight: `${pickerCardGap}px`,
              borderRadius: '20px',
              border: isSelected
                ? '2px solid rgba(101,124,178,0.55)'
                : `1px solid ${isPast ? '#D6DEE8' : availability.closed ? '#E8B7BC' : '#B7E3C8'}`,
              background: isSelected
                ? '#1A2238'
                : isPast
                  ? '#EEF3F7'
                  : availability.closed
                    ? '#F9E2E4'
                    : '#DDF5E8',
              padding: '7px 6px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              appearance: 'none',
              WebkitAppearance: 'none',
              cursor: disabled ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
              boxSizing: 'border-box',
              opacity: isPast ? 0.72 : 1,
              boxShadow: isSelected
                ? '0 10px 20px rgba(35,49,79,0.24)'
                : isPast
                  ? '0 4px 10px rgba(184,197,214,0.08)'
                  : '0 7px 14px rgba(184,197,214,0.16)',
              scrollSnapAlign: 'center',
            } as React.CSSProperties
          }
        >
          <span
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: '9px',
              fontWeight: 900,
              color: isSelected ? '#FFFFFF' : isPast ? '#64748B' : '#0F172A',
            }}
          >
            {item.weekdayShort}
          </span>
          <span
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: '20px',
              lineHeight: '22px',
              fontWeight: 900,
              color: isSelected ? '#FFFFFF' : isPast ? '#475569' : '#0B1220',
            }}
          >
            {item.dayNumber}
          </span>
          {statusLabel ? (
            <span
              style={{
                width: '100%',
                minHeight: '18px',
                borderRadius: '999px',
                padding: '2px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected
                  ? 'rgba(255,255,255,0.12)'
                  : isPast
                    ? '#E2E8F0'
                    : '#F7D5D9',
                border: isSelected
                  ? '1px solid rgba(255,255,255,0.18)'
                  : isPast
                    ? '1px solid #CBD5E1'
                    : '1px solid #E7AAB2',
                fontSize: '7px',
                fontWeight: 900,
                color: isSelected ? '#FFFFFF' : isPast ? '#64748B' : '#C64D57',
                lineHeight: 1.1,
                boxSizing: 'border-box',
              }}
            >
              {statusLabel}
            </span>
          ) : (
            <span style={{ height: '18px' }} />
          )}
          <span
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: '8.5px',
              fontWeight: 900,
              color: isSelected ? '#EAF1FF' : isPast ? '#64748B' : '#334155',
              textTransform: 'uppercase',
            }}
          >
            {item.monthShort}
          </span>
          <span
            style={{
              width: '100%',
              minHeight: '18px',
              borderRadius: '999px',
              padding: '2px 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isSelected
                ? '#243252'
                : isPast
                  ? '#E2E8F0'
                : availability.closed
                  ? '#F4D3D7'
                  : '#CFEEDB',
              fontSize: '6.8px',
              fontWeight: 800,
              color: isSelected
                ? '#EAF1FF'
                : isPast
                  ? '#64748B'
                  : availability.closed
                    ? '#C64D57'
                    : '#1D8F57',
              boxSizing: 'border-box',
            }}
          >
            {isSelected
              ? 'Scelto'
              : isPast
                ? 'Passato'
              : availability.closed
                ? tf('agenda_unavailable_short')
                : tf('agenda_available_short')}
          </span>
        </button>
      );
    },
    [
      availabilitySettings,
      buildStatusLabel,
      canChooseDay,
      centerDay,
      onSelectDate,
      pickerCardGap,
      pickerCardWidth,
      selectedDate,
      tf,
      today,
    ]
  );

  if (isWebPicker) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          alignSelf: 'stretch',
          marginTop: '12px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
            width: '100%',
            maxWidth: '520px',
            marginLeft: 'auto',
            marginRight: 'auto',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              color: '#0F172A',
              fontSize: '16px',
              fontWeight: 800,
              fontFamily: appFonts.displayCondensed,
              lineHeight: 1.35,
              minWidth: 0,
              boxSizing: 'border-box',
              letterSpacing: '-0.015em',
              textAlign: 'center',
              width: 'auto',
              maxWidth: '100%',
              margin: 0,
            }}
          >
            {selectedDay?.fullLabel ?? formatDateLong(selectedDate)}
          </div>
          <button
            type="button"
            onClick={() => {
              onJumpToday();
              centerDay(today, true);
            }}
            style={{
              minHeight: '42px',
              minWidth: '92px',
              padding: '0 18px',
              borderRadius: '16px',
              border: `1px solid ${selectedDate === today ? '#1F2A44' : '#D9E2EC'}`,
              background: selectedDate === today ? '#1F2A44' : '#F8FAFC',
              color: selectedDate === today ? '#FFFFFF' : '#334155',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <span>Oggi</span>
          </button>
        </div>

        <div
          ref={webViewportRef}
          style={{
            width: '100%',
            maxWidth: '100%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)',
            borderRadius: '24px',
            border: '1px solid rgba(15,23,42,0.05)',
            padding: '6px 0 16px',
            overflow: 'hidden',
            boxSizing: 'border-box',
            boxShadow: '0 10px 24px rgba(15,23,42,0.06), inset 0 0 0 1px rgba(255,255,255,0.28)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '10px',
              bottom: '12px',
              left: '50%',
              width: `${pickerCardWidth + 18}px`,
              transform: 'translateX(-50%)',
              borderRadius: '24px',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.74) 0%, rgba(226,232,240,0.46) 100%)',
              border: '1px solid rgba(255,255,255,0.84)',
              boxShadow:
                '0 22px 40px rgba(100,116,139,0.26), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1px rgba(191,219,254,0.26)',
              backdropFilter: 'blur(22px) saturate(1.16)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.16)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '8px',
              bottom: '10px',
              left: 0,
              width: '74px',
              background:
                'linear-gradient(90deg, rgba(203,213,225,0.82) 0%, rgba(226,232,240,0.6) 38%, rgba(248,250,252,0) 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '8px',
              bottom: '10px',
              right: 0,
              width: '74px',
              background:
                'linear-gradient(270deg, rgba(203,213,225,0.82) 0%, rgba(226,232,240,0.6) 38%, rgba(248,250,252,0) 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          <div
            ref={webHostRef as unknown as React.RefObject<HTMLDivElement>}
            onWheel={(event) => applyWebHorizontalStripWheelToHost(webHostRef, event)}
            onScroll={(event) => {
              const currentTarget = event.currentTarget;
              scheduleWebSettle(currentTarget.scrollLeft, 140);
            }}
            style={{
              width: '100%',
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              padding: '12px 0 8px',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
              scrollSnapType: 'x proximity',
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                width: 'max-content',
                minWidth: '100%',
                paddingLeft: `${sideInset}px`,
                paddingRight: `${sideInset}px`,
                boxSizing: 'border-box',
              }}
            >
              {giorniDisponibili.map((item) => renderWebDayCard(item))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <View style={styles.frontendBookingDayPickerShell}>
      <View style={styles.frontendBookingDayPickerHeader}>
        <TouchableOpacity
          style={[
            styles.frontendBookingTodayButton,
            selectedDate === today && styles.frontendBookingTodayButtonActive,
          ]}
          onPress={() => {
            onJumpToday();
            if (isWebPicker) centerDay(today, true);
          }}
          activeOpacity={0.9}
        >
          <Ionicons
            name="today-outline"
            size={15}
            color={selectedDate === today ? '#ffffff' : '#334155'}
          />
          <Text
            style={[
              styles.frontendBookingTodayButtonText,
              selectedDate === today && styles.frontendBookingTodayButtonTextActive,
            ]}
          >
            Oggi
          </Text>
        </TouchableOpacity>
        <View style={styles.frontendBookingCurrentDatePill}>
          <Ionicons name="calendar-outline" size={15} color="#475569" />
          <Text style={styles.frontendBookingCurrentDateText}>
            {selectedDay?.fullLabel ?? formatDateLong(selectedDate)}
          </Text>
        </View>
      </View>

      <View
        style={styles.frontendBookingDayPickerWrap}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (!nextWidth || Math.abs(nextWidth - pickerWidth) < 1) return;
          setPickerWidth(nextWidth);
        }}
      >
        {isWebPicker ? (
          <>
            <View
              style={{
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
                borderRadius: 26,
              }}
            >
              <View
                ref={webHostRef}
                style={[
                  styles.frontendBookingDayPickerListWeb,
                  webHorizontalScrollTouchStyle,
                  styles.webNativeHorizontalHost,
                ]}
                // @ts-expect-error web-only wheel forwarding
                onWheel={(event: unknown) => applyWebHorizontalStripWheelToHost(webHostRef, event)}
                onScroll={(event: unknown) => {
                  const rawTarget = (event as unknown as { currentTarget?: EventTarget | null }).currentTarget;
                  const host = rawTarget as HTMLElement | null;
                  scheduleWebSettle(host?.scrollLeft ?? 0, 140);
                }}
              >
                <View
                  style={[
                    styles.frontendBookingDayPickerRow,
                    styles.frontendBookingDayPickerRowWeb,
                    { paddingHorizontal: sideInset },
                  ]}
                >
                  {giorniDisponibili.map((item) => (
                    <View key={item.value}>
                      {renderGhostCard({ item })}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={giorniDisponibili}
              horizontal
              bounces={false}
              decelerationRate="fast"
              snapToInterval={pickerCardStride}
              snapToOffsets={snapOffsets}
              snapToAlignment="start"
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.value}
              contentContainerStyle={[
                styles.frontendBookingDayPickerRow,
                { paddingHorizontal: sideInset },
              ]}
              renderItem={renderGhostCard}
            />

            <View pointerEvents="box-none" style={styles.frontendBookingDayPickerCenterOverlay}>
              <View pointerEvents="none" style={styles.frontendBookingDayPickerCenterFrame} />
              <View pointerEvents="none" style={styles.frontendBookingDayPickerCenterHighlight} />
              <View pointerEvents="none" style={styles.frontendBookingDayPickerCenterInnerGlow} />
              {selectedDay ? (
                <TouchableOpacity
                  style={[
                    styles.frontendBookingDayFocusCard,
                    selectedAvailability?.closed
                      ? styles.frontendBookingDayFocusCardClosed
                      : styles.frontendBookingDayFocusCardOpen,
                  ]}
                  onPress={() => {
                    if (!canChooseDay || selectedDay.value < today) return;
                    onSelectDate(selectedDay.value);
                  }}
                  activeOpacity={0.92}
                >
                  {selectedFocusCard}
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
});

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const normalizeIdentityText = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const matchesOperatorIdentity = ({
  appointmentOperatorId,
  appointmentOperatorName,
  selectedOperatorId,
  selectedOperatorName,
}: {
  appointmentOperatorId?: string | null;
  appointmentOperatorName?: string | null;
  selectedOperatorId?: string | null;
  selectedOperatorName?: string | null;
}) => {
  const normalizedAppointmentOperatorId = appointmentOperatorId?.trim() ?? '';
  const normalizedSelectedOperatorId = selectedOperatorId?.trim() ?? '';

  if (normalizedAppointmentOperatorId && normalizedSelectedOperatorId) {
    return normalizedAppointmentOperatorId === normalizedSelectedOperatorId;
  }

  const normalizedAppointmentOperatorName = normalizeIdentityText(appointmentOperatorName);
  const normalizedSelectedOperatorName = normalizeIdentityText(selectedOperatorName);

  if (normalizedAppointmentOperatorName && normalizedSelectedOperatorName) {
    return normalizedAppointmentOperatorName === normalizedSelectedOperatorName;
  }

  return false;
};
const matchesCustomerDisplayName = (candidate?: string | null, expected?: string | null) => {
  const normalizedCandidate = normalizeIdentityText(candidate);
  const normalizedExpected = normalizeIdentityText(expected);

  if (!normalizedCandidate || !normalizedExpected) {
    return false;
  }

  if (normalizedCandidate === normalizedExpected) {
    return true;
  }

  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
  const expectedTokens = normalizedExpected.split(' ').filter(Boolean);

  if (
    candidateTokens.length > 1 &&
    expectedTokens.length > 1 &&
    expectedTokens.every((token) => candidateTokens.includes(token))
  ) {
    return true;
  }

  if (
    candidateTokens.length > 1 &&
    expectedTokens.length > 1 &&
    candidateTokens.every((token) => expectedTokens.includes(token))
  ) {
    return true;
  }

  return (
    normalizedCandidate.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedCandidate)
  );
};
const buildPublicRequestCompositeKey = (
  item: Pick<
    PublicSalonState['richiestePrenotazione'][number],
    'data' | 'ora' | 'servizio' | 'nome' | 'cognome' | 'email' | 'telefono'
  >
) =>
  [
    item.data.trim(),
    item.ora.trim().toLowerCase(),
    item.servizio.trim().toLowerCase(),
    `${item.nome} ${item.cognome}`.trim().toLowerCase(),
    item.email.trim().toLowerCase(),
    item.telefono.trim(),
  ].join('|');

const buildPublicRequestResolutionKey = (
  item: Pick<
    PublicSalonState['richiestePrenotazione'][number],
    'data' | 'ora' | 'servizio' | 'nome' | 'cognome' | 'operatoreId' | 'operatoreNome'
  >
) =>
  [
    item.data.trim(),
    item.ora.trim().toLowerCase(),
    item.servizio.trim().toLowerCase(),
    `${item.nome} ${item.cognome}`.trim().toLowerCase(),
    item.operatoreId?.trim().toLowerCase() ?? '',
    item.operatoreNome?.trim().toLowerCase() ?? '',
  ].join('|');

const buildAppointmentResolutionKey = (
  item: Pick<
    PublicSalonState['appuntamenti'][number],
    'data' | 'ora' | 'servizio' | 'cliente' | 'operatoreId' | 'operatoreNome'
  >
) =>
  [
    (item.data ?? '').trim(),
    item.ora.trim().toLowerCase(),
    item.servizio.trim().toLowerCase(),
    item.cliente.trim().toLowerCase(),
    item.operatoreId?.trim().toLowerCase() ?? '',
    item.operatoreNome?.trim().toLowerCase() ?? '',
  ].join('|');

const canCancelUntilPreviousMidnight = (appointmentDate: string) => {
  const normalizedAppointmentDate = appointmentDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedAppointmentDate)) {
    return false;
  }

  // L'annullo online resta disponibile fino alle 23:59 del giorno precedente.
  // Sul web e piu robusto confrontare direttamente le date locali YYYY-MM-DD:
  // se oggi e gia il giorno dell'appuntamento, il termine e scaduto.
  return getTodayDateString() < normalizedAppointmentDate;
};

const formatDurationLabel = (durationMinutes: number) => {
  if (durationMinutes === 30) return '30 min';
  if (durationMinutes === 60) return '1 ora';
  if (durationMinutes === 90) return '1 ora e 30';
  return `${durationMinutes} min`;
};

export default function ClienteFrontendScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    mode?: string | string[];
    biometric?: string | string[];
    email?: string | string[];
    phone?: string | string[];
    autologin?: string | string[];
    registrationOnly?: string | string[];
  }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const servicesWebStripRef = useRef<View | null>(null);
  const dayPickerRef = useRef<ScrollView | null>(null);
  const dayPickerWebStripRef = useRef<View | null>(null);
  const dayPickerScrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayPickerScrollRafRef = useRef<number | null>(null);
  const lastWebDayPickerScrollLeftRef = useRef(0);
  const webDayPickerProgrammaticSyncLockUntilRef = useRef(0);
  const selectionTapLockUntilRef = useRef(0);
  const lastHapticDayRef = useRef('');
  const autoBiometricAttemptedRef = useRef(false);
  const autoCredentialLoginAttemptedRef = useRef(false);
  const lastSnappedDayRef = useRef('');
  const nomeInputRef = useRef<TextInput | null>(null);
  const salonCodeInputRef = useRef<TextInput | null>(null);
  const lastUnreadCancelledSignatureRef = useRef('');
  const lastViewedSyncSignatureRef = useRef('');
  const pendingMarkFrontendNotificationsViewedRef = useRef(false);
  const hasCenteredCurrentDayRef = useRef(false);
  const webDayPickerSelectionReadyRef = useRef(false);
  const requestsToggleLockUntilRef = useRef(0);
  const pendingRequestsSectionJumpRef = useRef(false);
  const cognomeInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const telefonoInputRef = useRef<TextInput | null>(null);
  const instagramInputRef = useRef<TextInput | null>(null);
  const noteInputRef = useRef<TextInput | null>(null);
  const recentLocalBookingRequestsRef = useRef<
    Array<{
      request: PublicSalonState['richiestePrenotazione'][number];
      addedAt: number;
    }>
  >([]);
  const {
    isAuthenticated,
    richiestePrenotazione,
    setRichiestePrenotazione,
    appuntamenti,
    clienti,
    servizi,
    operatori,
    salonWorkspace,
    availabilitySettings,
    serviceCardColorOverrides,
    roleCardColorOverrides,
    resolveSalonByCode,
    upsertFrontendCustomerForSalon,
    addBookingRequestForSalon,
    markClientRequestsViewedForSalon,
    cancelClientAppointmentForSalon,
  } = useAppContext();

  const compactTopBar = width < 430;
  const ultraCompactTopBar = width < 360;
  const scrollFrontendToY = useCallback((targetY: number, animated = true) => {
    const clampedTargetY = Math.max(0, targetY);
    const runScrollReset = () => {
      scrollRef.current?.scrollTo({ y: clampedTargetY, animated });

      if (Platform.OS !== 'web') {
        return;
      }

      const scrollNode = (
        scrollRef.current as ScrollView & {
          getScrollableNode?: () => HTMLElement | null;
        }
      )?.getScrollableNode?.();

      if (scrollNode && typeof scrollNode.scrollTo === 'function') {
        scrollNode.scrollTo({ top: clampedTargetY, behavior: animated ? 'smooth' : 'auto' });
      }

      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: clampedTargetY, behavior: 'auto' });
      }
    };

    requestAnimationFrame(() => {
      runScrollReset();

      if (Platform.OS === 'web') {
        requestAnimationFrame(runScrollReset);
        setTimeout(runScrollReset, 0);
        setTimeout(runScrollReset, 80);
      }
    });
  }, []);
  const scrollFrontendToTop = useCallback((animated = true) => {
    scrollFrontendToY(0, animated);
  }, [scrollFrontendToY]);
  const compactFrontendCards = width < 520;
  const mediumFrontendCards = width < 860;
  const compactWebTopSpacing = false;
  const isWeb = Platform.OS === 'web';
  const webDayCardWidth = 52;
  const webDayCardGap = 1;
  const activeDayCardWidth = isWeb ? webDayCardWidth : DAY_CARD_WIDTH;
  const activeDayCardGap = isWeb ? webDayCardGap : DAY_CARD_GAP;
  const activeDayCardStride = activeDayCardWidth + activeDayCardGap;
  const [dayPickerViewportWidth, setDayPickerViewportWidth] = useState(0);

  const [profile, setProfile] = useState<FrontendProfile>(EMPTY_PROFILE);
  const [accessMode, setAccessMode] = useState<FrontendAccessMode | null>(null);
  const [hasSavedProfileForSelectedSalon, setHasSavedProfileForSelectedSalon] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isBookingStarted, setIsBookingStarted] = useState(false);
  const [showRequestsExpanded, setShowRequestsExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Forza sempre il giorno attuale come default all'avvio
  const today = getTodayDateString();
  const [data, setData] = useState(today);
  // Se il giorno selezionato non è più valido, resetta su oggi
  useEffect(() => {
    if (!data || typeof data !== 'string') setData(today);
  }, [data, today]);
  // Componente memoizzato per la card del giorno
  type DayCardProps = {
    day: any;
    selected: boolean;
    closed: boolean;
    past: boolean;
    canChooseDay: boolean;
    ora: string;
    servizio: string;
    effectiveBlockingAppointments: any[];
    effectiveServizi: any[];
    setOra: (o: string) => void;
    onSelectDay: (dateValue: string) => void;
    getDateAvailabilityInfo: (settings: any, dateValue: string) => any;
    effectiveAvailabilitySettings: any;
    tf: (key: Parameters<typeof tf>[0], params?: Parameters<typeof tf>[1]) => string;
  };
  const DayCard = memo(function DayCard({
    day,
    selected,
    closed,
    past,
    canChooseDay,
    ora,
    servizio,
    effectiveBlockingAppointments,
    effectiveServizi,
    setOra,
    onSelectDay,
    getDateAvailabilityInfo,
    effectiveAvailabilitySettings,
    tf,
  }: DayCardProps) {
    const availability = getDateAvailabilityInfo(effectiveAvailabilitySettings, day.value);
    const vacationLabel =
      availability.reason === 'vacation'
        ? effectiveAvailabilitySettings.vacationRanges.find(
            (item: { startDate: string; endDate: string; label?: string }) => item.startDate <= day.value && day.value <= item.endDate
          )?.label?.trim() || tf('agenda_vacation')
        : null;
    const statusLabel =
      availability.reason === 'holiday'
        ? tf('agenda_holiday')
        : availability.reason === 'vacation'
          ? vacationLabel
        : availability.reason === 'weekly'
          ? 'Salone\nchiuso'
          : availability.reason === 'manual'
            ? 'Salone\nchiuso'
            : null;
    const footerLabel = selected
      ? tf('agenda_selected_short')
      : closed
        ? tf('agenda_unavailable_short')
        : tf('agenda_available_short');
    const disabled = !canChooseDay || closed || past;
    const animatedCardStyle = useAnimatedStyle(() => {
      return {
        opacity: selected ? 1 : 0.96,
        zIndex: selected ? 50 : 12,
        shadowOpacity: selected ? 0.12 : 0,
        shadowRadius: selected ? 9 : 0,
        shadowOffset: { width: 0, height: selected ? 5 : 0 },
        elevation: selected ? 4 : 0,
        transform: [{ translateY: selected ? -3 : 0 }, { scale: selected ? 1.06 : 1 }],
      };
    }, [selected]);

    return (
      <Animated.View key={day.value} style={[styles.dayCardWrap, isWeb && styles.dayCardWrapWeb, animatedCardStyle]}>
        <TouchableOpacity
          webTouchAction={isWeb ? 'pan-x' : undefined}
          style={[
            styles.dayCard,
            isWeb && styles.dayCardWeb,
            !closed && !past && !selected && styles.dayCardAvailable,
            selected && styles.dayCardSelected,
            closed && styles.dayCardClosed,
            past && styles.dayCardPast,
          ]}
          onPress={() => {
            if (disabled) return;
            onSelectDay(day.value);
            if (
              ora &&
              servizio &&
              findConflictingAppointment({
                appointmentDate: day.value,
                startTime: ora,
                serviceName: servizio,
                appointments: effectiveBlockingAppointments,
                services: effectiveServizi,
              })
            ) {
              setOra('');
            }
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          delayPressIn={0}
          activeOpacity={1}
          disabled={disabled}
        >
          <View style={styles.dayCardHeader}>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                styles.dayWeek,
                isWeb && styles.dayWeekWeb,
                selected && styles.dayTextSelected,
                closed && styles.dayTextClosed,
                past && styles.dayTextPast,
              ]}
            >
              {day.weekdayShort}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[
              styles.dayNumber,
              isWeb && styles.dayNumberWeb,
              selected && styles.dayTextSelected,
              closed && styles.dayTextClosed,
              past && styles.dayTextPast,
            ]}
          >
            {day.dayNumber}
          </Text>
          {statusLabel ? (
            <View
              style={[
                styles.dayStatusBadge,
                isWeb && styles.dayStatusBadgeWeb,
                styles.dayStatusBadgeClosed,
                availability.reason === 'holiday' && styles.dayStatusBadgeHoliday,
              ]}
            >
              <Text style={styles.dayStatusBadgeText} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          ) : (
            <View style={styles.dayStatusBadgeSpacer} />
          )}
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[
              styles.dayMonth,
              isWeb && styles.dayMonthWeb,
              styles.requestOverviewLabel,
              { color: '#64748b' },
              selected && styles.dayTextSelected,
              closed && styles.dayTextClosed,
              past && styles.dayTextPast,
            ]}
          >
            {day.monthShort}
          </Text>
          <View
            style={[
              styles.dayCardFooter,
              isWeb && styles.dayCardFooterWeb,
              closed && styles.dayCardFooterClosed,
              past && styles.dayCardFooterPast,
              !closed && styles.dayCardFooterAvailable,
              selected && styles.dayCardFooterSelected,
            ]}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[
                styles.dayCardFooterText,
                isWeb && styles.dayCardFooterTextWeb,
                closed && styles.dayCardFooterTextClosed,
                past && styles.dayCardFooterTextPast,
                !closed && styles.dayCardFooterTextAvailable,
                selected && styles.dayCardFooterTextSelected,
              ]}
            >
              {footerLabel}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  });
  const [servizio, setServizio] = useState('');
  const [operatoreId, setOperatoreId] = useState('');
  const [operatoreNome, setOperatoreNome] = useState('');
  const [ora, setOra] = useState('');
  const [note, setNote] = useState('');
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [ultimaRichiesta, setUltimaRichiesta] = useState<{
    nomeCompleto: string;
    data: string;
    ora: string;
    servizio: string;
    operatoreNome?: string;
  } | null>(null);
  const initialSalonCodeParam = Array.isArray(searchParams.salon)
    ? searchParams.salon[0]
    : searchParams.salon;
  const initialModeParam = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
  const initialBiometricParam = Array.isArray(searchParams.biometric)
    ? searchParams.biometric[0]
    : searchParams.biometric;
  const initialEmailParam = Array.isArray(searchParams.email)
    ? searchParams.email[0]
    : searchParams.email;
  const initialPhoneParam = Array.isArray(searchParams.phone)
    ? searchParams.phone[0]
    : searchParams.phone;
  const initialAutoLoginParam = Array.isArray(searchParams.autologin)
    ? searchParams.autologin[0]
    : searchParams.autologin;
  const initialRegistrationOnlyParam = Array.isArray(searchParams.registrationOnly)
    ? searchParams.registrationOnly[0]
    : searchParams.registrationOnly;
  const initialFrontendAccessMode: FrontendAccessMode | null =
    initialModeParam === 'login' || initialModeParam === 'register' ? initialModeParam : null;
  const canUseWorkspaceFallback = !initialSalonCodeParam;
  const [selectedSalonCode, setSelectedSalonCode] = useState(
    initialSalonCodeParam || (canUseWorkspaceFallback ? salonWorkspace.salonCode : '')
  );
  const [salonCodeDraft, setSalonCodeDraft] = useState(
    initialSalonCodeParam || (canUseWorkspaceFallback ? salonWorkspace.salonCode : '')
  );
  const [publicSalonState, setPublicSalonState] = useState<PublicSalonState | null>(null);
  const [publicAvailabilitySettings, setPublicAvailabilitySettings] = useState<
    ReturnType<typeof normalizeAvailabilitySettings> | null
  >(null);
  const [backendDayOccupancy, setBackendDayOccupancy] = useState<PublicBookingOccupancyItem[]>([]);
  const [showAllGuidedSlots, setShowAllGuidedSlots] = useState(false);
  const [waitlistKeys, setWaitlistKeys] = useState<Set<string>>(new Set());
  const [savedWaitlistAlerts, setSavedWaitlistAlerts] = useState<SlotWaitlistEntry[]>([]);
  const [viewedWaitlistAlertKeys, setViewedWaitlistAlertKeys] = useState<Set<string>>(new Set());
  const [waitlistSubmittingKeys, setWaitlistSubmittingKeys] = useState<Set<string>>(new Set());
  const [showWaitlistAlertsExpanded, setShowWaitlistAlertsExpanded] = useState(false);
  const [requestsSectionY, setRequestsSectionY] = useState(0);
  const scrollToRequestsSection = useCallback(
    (animated = true) => {
      scrollFrontendToY(requestsSectionY - 18, animated);
    },
    [requestsSectionY, scrollFrontendToY]
  );
  const waitlistEntriesRequestRef = useRef(0);
  const savedWaitlistAlertsRequestRef = useRef(0);
  const waitlistRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitlistRefreshHoldUntilRef = useRef(0);
  const [bookingRequestSubmitting, setBookingRequestSubmitting] = useState(false);
  const bookingSubmitTapLockRef = useRef(0);
  const [isLoadingSalon, setIsLoadingSalon] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState<{
    email?: string;
    telefono?: string;
  }>({});
  const [salonLoadError, setSalonLoadError] = useState('');
  const [frontendLanguage, setFrontendLanguage] = useState<AppLanguage>('it');
  const [hasHydratedFrontendSession, setHasHydratedFrontendSession] = useState(false);
  const [frontendBiometricEnabled, setFrontendBiometricEnabled] = useState(false);
  const [frontendBiometricAvailable, setFrontendBiometricAvailable] = useState(false);
  const [frontendBiometricType, setFrontendBiometricType] = useState<'faceid' | 'fingerprint' | 'none'>('none');
  const [frontendBiometricBusy, setFrontendBiometricBusy] = useState(false);
  const [autoLoginStalled, setAutoLoginStalled] = useState(false);
  const [archivedMonthExpanded, setArchivedMonthExpanded] = useState<Record<string, boolean>>({});
  const publicSalonRefreshInFlightRef = useRef(false);
  const publicSalonRefreshPromiseRef = useRef<Promise<PublicSalonState | null> | null>(null);
  const refreshPublicSalonStateRef = useRef<() => Promise<PublicSalonState | null>>(async () => null);
  const publicSalonStateSignatureRef = useRef('');
  const bookingRequestInFlightKeyRef = useRef('');
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 32,
  });
  const shouldAutoAdvanceField = true;

  const applyMergedPublicSalonState = useCallback((nextState: PublicSalonState | null) => {
    if (!nextState) {
      publicSalonStateSignatureRef.current = '';
      setPublicSalonState(null);
      setPublicAvailabilitySettings(null);
      return;
    }
    const nextSignature = buildPublicSalonStateSignature(nextState);
    if (publicSalonStateSignatureRef.current !== nextSignature) {
      publicSalonStateSignatureRef.current = nextSignature;
      setPublicSalonState(nextState);
    }
  }, []);
  const applyPublicAvailabilitySettings = useCallback(
    (
      incomingSettings?: Partial<ReturnType<typeof normalizeAvailabilitySettings>> | null
    ) => {
      if (!incomingSettings) {
        return;
      }

      setPublicAvailabilitySettings((current) =>
        current
          ? mergeFrontendAvailabilitySettings({
              currentSettings: current,
              incomingSettings,
            })
          : normalizeAvailabilitySettings(incomingSettings)
      );
    },
    []
  );
  const handleFieldFocus = useCallback(
    (inputRef: React.RefObject<TextInput | null>) => {
      scrollToField(inputRef);
    },
    [scrollToField]
  );
  const handleKeyboardNext = useCallback(() => {
    focusNextInput(
      [
        nomeInputRef,
        cognomeInputRef,
        emailInputRef,
        telefonoInputRef,
        instagramInputRef,
        noteInputRef,
        salonCodeInputRef,
      ],
      focusField
    );
  }, [focusField]);
  const triggerLightHaptic = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }
    void haptic.light().catch(() => undefined);
  }, []);
  const toggleRequestsExpanded = useCallback(() => {
    if (Platform.OS === 'web' && Date.now() < requestsToggleLockUntilRef.current) {
      return;
    }
    requestsToggleLockUntilRef.current = Date.now() + 450;
    triggerLightHaptic();
    setShowRequestsExpanded((current) => {
      const next = !current;
      if (next) {
        pendingMarkFrontendNotificationsViewedRef.current = true;
      }
      if (!next) {
        pendingMarkFrontendNotificationsViewedRef.current = false;
        setShowWaitlistAlertsExpanded(false);
      }
      return next;
    });
  }, [triggerLightHaptic]);
  const toggleWaitlistAlertsExpanded = useCallback(() => {
    if (Platform.OS === 'web' && Date.now() < requestsToggleLockUntilRef.current) {
      return;
    }
    requestsToggleLockUntilRef.current = Date.now() + 450;
    triggerLightHaptic();
    setShowWaitlistAlertsExpanded((current) => !current);
  }, [triggerLightHaptic]);
  const shouldStartInBookingMode = initialModeParam === 'booking';

  const normalizedSelectedSalonCode = normalizeSalonCode(selectedSalonCode);
  const hasResolvedOrIncomingSalonCode = !!normalizedSelectedSalonCode;
  const isHomeAutoLoginFlow =
    initialAutoLoginParam === '1' &&
    shouldStartInBookingMode &&
    hasResolvedOrIncomingSalonCode;
  const showMissingSalonLinkWarning = !hasResolvedOrIncomingSalonCode;
  const isCurrentWorkspaceSalon =
    isAuthenticated &&
    canUseWorkspaceFallback &&
    (!normalizedSelectedSalonCode ||
      normalizedSelectedSalonCode === normalizeSalonCode(salonWorkspace.salonCode));
  const effectiveWorkspace = isCurrentWorkspaceSalon
    ? salonWorkspace
    : publicSalonState?.workspace ?? null;
  const effectiveServizi = useMemo(
    () => (isCurrentWorkspaceSalon ? servizi : publicSalonState?.servizi ?? []),
    [isCurrentWorkspaceSalon, publicSalonState?.servizi, servizi]
  );
  const sortedFrontendServizi = useMemo(
    () =>
      [...effectiveServizi].sort((first, second) => {
        const firstRole = (first.mestiereRichiesto ?? '').trim().toLowerCase();
        const secondRole = (second.mestiereRichiesto ?? '').trim().toLowerCase();
        const firstRoleEmpty = firstRole === '';
        const secondRoleEmpty = secondRole === '';

        if (firstRoleEmpty !== secondRoleEmpty) {
          return firstRoleEmpty ? 1 : -1;
        }

        const roleCompare = firstRole.localeCompare(secondRole);
        if (roleCompare !== 0) {
          return roleCompare;
        }

        const firstDuration = typeof first.durataMinuti === 'number' ? first.durataMinuti : 9999;
        const secondDuration = typeof second.durataMinuti === 'number' ? second.durataMinuti : 9999;
        if (firstDuration !== secondDuration) {
          return firstDuration - secondDuration;
        }

        const firstPrice = Number.isFinite(first.prezzo) ? first.prezzo : Number.MAX_SAFE_INTEGER;
        const secondPrice = Number.isFinite(second.prezzo) ? second.prezzo : Number.MAX_SAFE_INTEGER;
        if (firstPrice !== secondPrice) {
          return firstPrice - secondPrice;
        }

        return first.nome.localeCompare(second.nome, 'it', { sensitivity: 'base' });
      }),
    [effectiveServizi]
  );
  const effectiveServiceCardColorOverrides = useMemo(
    () =>
      isCurrentWorkspaceSalon
        ? serviceCardColorOverrides
        : publicSalonState?.serviceCardColorOverrides ?? {},
    [isCurrentWorkspaceSalon, publicSalonState?.serviceCardColorOverrides, serviceCardColorOverrides]
  );
  const publicRoleColorFallbackOverrides = useMemo<Record<string, string>>(() => {
    const emptyOverrides: Record<string, string> = {};

    if (isCurrentWorkspaceSalon) return emptyOverrides;

    const hasEsteticaServices = (publicSalonState?.servizi ?? []).some(
      (service) => normalizeRoleName(service?.mestiereRichiesto ?? '') === 'estetica'
    );

    if (!hasEsteticaServices) {
      return emptyOverrides;
    }

    return { estetica: '#e9d5ff' };
  }, [isCurrentWorkspaceSalon, publicSalonState?.servizi]);
  const effectiveRoleCardColorOverrides = useMemo(
    () =>
      isCurrentWorkspaceSalon
        ? roleCardColorOverrides
        : {
            ...publicRoleColorFallbackOverrides,
            ...(publicSalonState?.roleCardColorOverrides ?? {}),
          },
    [
      isCurrentWorkspaceSalon,
      publicRoleColorFallbackOverrides,
      publicSalonState?.roleCardColorOverrides,
      roleCardColorOverrides,
    ]
  );
  const effectiveClienti = useMemo(
    () => (isCurrentWorkspaceSalon ? clienti : publicSalonState?.clienti ?? []),
    [clienti, isCurrentWorkspaceSalon, publicSalonState?.clienti]
  );
  const effectiveOperatori = useMemo(
    () => (isCurrentWorkspaceSalon ? operatori : publicSalonState?.operatori ?? []),
    [isCurrentWorkspaceSalon, operatori, publicSalonState?.operatori]
  );
  const effectiveAvailabilitySettings = isCurrentWorkspaceSalon
    ? availabilitySettings
    : publicAvailabilitySettings ?? publicSalonState?.availabilitySettings ?? normalizeAvailabilitySettings();
  const effectiveAppuntamenti = useMemo(
    () =>
      assignFallbackOperatorsToAppointments({
        appointments: isCurrentWorkspaceSalon ? appuntamenti : publicSalonState?.appuntamenti ?? [],
        services: effectiveServizi,
        operators: effectiveOperatori,
        settings: effectiveAvailabilitySettings,
        preserveExplicitOperatorAssignments: true,
      }),
    [
      appuntamenti,
      effectiveAvailabilitySettings,
      effectiveOperatori,
      effectiveServizi,
      publicSalonState?.appuntamenti,
    ]
  );
  const effectiveRichieste = useMemo(
    () =>
      isCurrentWorkspaceSalon
        ? richiestePrenotazione
        : publicSalonState?.richiestePrenotazione ?? [],
    [isCurrentWorkspaceSalon, publicSalonState?.richiestePrenotazione, richiestePrenotazione]
  );
  const baseBlockingAppointments = useMemo(
    () =>
      buildBlockingAppointments(
        effectiveAppuntamenti,
        effectiveRichieste,
        effectiveServizi,
        effectiveOperatori,
        effectiveAvailabilitySettings
      ),
    [
      effectiveAppuntamenti,
      effectiveAvailabilitySettings,
      effectiveOperatori,
      effectiveRichieste,
      effectiveServizi,
    ]
  );
  const effectiveBlockingAppointments = useMemo(
    () =>
      !backendDayOccupancy.length
        ? baseBlockingAppointments
        : [
            ...baseBlockingAppointments.filter((item) => (item.data ?? getTodayDateString()) !== data),
            ...backendDayOccupancy,
          ],
    [backendDayOccupancy, baseBlockingAppointments, data]
  );
  const salonAddress = effectiveWorkspace ? formatSalonAddress(effectiveWorkspace) : '';
  const salonBusinessPhone = effectiveWorkspace?.businessPhone?.trim() ?? '';
  const salonActivityCategory = effectiveWorkspace?.activityCategory?.trim() ?? '';
  const displayTimeSlots = useMemo(
    () => buildDisplayTimeSlots(effectiveAvailabilitySettings, data),
    [effectiveAvailabilitySettings, data]
  );
  const tf = useCallback(
    (key: Parameters<typeof tApp>[1], params?: Record<string, string | number>) =>
      tApp(frontendLanguage, key, params),
    [frontendLanguage]
  );
  const frontendBiometricActionLabel =
    frontendBiometricType === 'faceid' ? 'Face ID' : 'biometria';
  const heroTitle = hasResolvedOrIncomingSalonCode ? 'Prenota' : tf('frontend_find_salon');

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const available = hasHardware && isEnrolled;
        setFrontendBiometricAvailable(available);

        if (!available) {
          setFrontendBiometricType('none');
          return;
        }

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        setFrontendBiometricType(hasFace ? 'faceid' : 'fingerprint');
      } catch {
        setFrontendBiometricAvailable(false);
        setFrontendBiometricType('none');
      }
    })();
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [legacySavedProfile, savedLanguage, savedSalonCode, biometricEnabledSaved] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY),
        ]);
        setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
        setFrontendBiometricEnabled(biometricEnabledSaved === 'true');
        const normalizedSavedSalonCode = normalizeSalonCode(savedSalonCode ?? '');
        const preferredSalonCode = normalizeSalonCode(initialSalonCodeParam ?? normalizedSavedSalonCode);
        const scopedSavedProfile = preferredSalonCode
          ? await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(preferredSalonCode))
          : null;
        const canUseLegacyProfile =
          !preferredSalonCode || preferredSalonCode === normalizedSavedSalonCode;
        const saved = scopedSavedProfile ?? (canUseLegacyProfile ? legacySavedProfile : null);
        setHasSavedProfileForSelectedSalon(!!saved);

        if (!initialSalonCodeParam && normalizedSavedSalonCode) {
          setSelectedSalonCode(normalizedSavedSalonCode);
          setSalonCodeDraft(normalizedSavedSalonCode);
        }

        if (!saved) {
          setAccessMode(
            initialFrontendAccessMode ??
              (biometricEnabledSaved === 'true'
              ? null
              : initialSalonCodeParam
                ? isHomeAutoLoginFlow
                  ? 'login'
                  : 'register'
                : 'login')
          );
          return;
        }

        const parsed = JSON.parse(saved) as FrontendProfile;
          setProfile({
            nome: parsed.nome ?? '',
            cognome: parsed.cognome ?? '',
            email: parsed.email ?? '',
            telefono: parsed.telefono ?? '',
            instagram: parsed.instagram ?? '',
          });
        if (parsed.email?.trim() && parsed.telefono?.trim()) {
          if (preferredSalonCode) {
            const shouldEnterBookingDirectly =
              shouldStartInBookingMode || Boolean(preferredSalonCode);
            setIsRegistered(true);
            setIsBookingStarted(shouldEnterBookingDirectly);
            setShowRequestsExpanded(!shouldEnterBookingDirectly);
            setAccessMode('login');
          } else {
            setAccessMode(initialFrontendAccessMode ?? 'login');
          }
        }
      } catch (error) {
        console.log('Errore caricamento profilo cliente:', error);
      } finally {
        setHasHydratedFrontendSession(true);
      }
    };

    loadProfile();
  }, [initialFrontendAccessMode, initialSalonCodeParam, isHomeAutoLoginFlow, shouldStartInBookingMode]);

  useEffect(() => {
    if (!hasHydratedFrontendSession) {
      return;
    }

    const normalized = normalizeSalonCode(selectedSalonCode);

    if (!normalized || (!hasSavedProfileForSelectedSalon && !isRegistered)) {
      return;
    }

    (async () => {
      try {
        const savedSalonCodesRaw = await AsyncStorage.getItem(FRONTEND_SAVED_SALON_CODES_KEY);
        const parsed = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
        const nextSavedSalons = Array.isArray(parsed)
          ? buildSavedSalonCodeList([normalized, ...(parsed as string[])])
          : buildSavedSalonCodeList([normalized]);

        await AsyncStorage.multiSet([
          [FRONTEND_LAST_SALON_CODE_KEY, normalized],
          [FRONTEND_SAVED_SALON_CODES_KEY, JSON.stringify(nextSavedSalons)],
        ]);
      } catch (error) {
        console.log('Errore salvataggio ultimo codice salone:', error);
      }
    })();
  }, [hasHydratedFrontendSession, hasSavedProfileForSelectedSalon, isRegistered, selectedSalonCode]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refreshFrontendPreferences = async () => {
        try {
          const savedLanguage = await AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY);
          if (active) {
            setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
          }
        } catch (error) {
          console.log('Errore aggiornamento lingua frontend:', error);
        }
      };

      void refreshFrontendPreferences();

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    AsyncStorage.setItem(FRONTEND_LANGUAGE_KEY, frontendLanguage);
  }, [frontendLanguage]);

  const persistFrontendBiometricSnapshot = useCallback(
    async (nextProfile: FrontendProfile, nextSalonCode: string) => {
      if (!frontendBiometricEnabled) return;

      try {
        await AsyncStorage.multiSet([
          [FRONTEND_BIOMETRIC_PROFILE_KEY, JSON.stringify(nextProfile)],
          [buildFrontendBiometricProfileKeyForSalon(nextSalonCode), JSON.stringify(nextProfile)],
          [FRONTEND_BIOMETRIC_SALON_CODE_KEY, nextSalonCode],
        ]);
      } catch (error) {
        console.log('Errore salvataggio snapshot biometrico cliente:', error);
      }
    },
    [frontendBiometricEnabled]
  );

  const enableFrontendBiometricDirectly = useCallback(
    async (nextProfile: FrontendProfile, nextSalonCode: string) => {
      if (Platform.OS === 'web') {
        return false;
      }

      if (!frontendBiometricAvailable) {
        Alert.alert(
          'Biometria non disponibile',
          'Configura Face ID, impronta o codice dispositivo e riprova.'
        );
        return false;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage:
          frontendBiometricType === 'faceid'
            ? 'Attiva Face ID cliente'
            : 'Attiva biometria cliente',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        return false;
      }

      const serializedProfile = JSON.stringify(nextProfile);
      await AsyncStorage.multiSet([
        [FRONTEND_BIOMETRIC_ENABLED_KEY, 'true'],
        [FRONTEND_BIOMETRIC_PROFILE_KEY, serializedProfile],
        [buildFrontendBiometricProfileKeyForSalon(nextSalonCode), serializedProfile],
        [FRONTEND_BIOMETRIC_SALON_CODE_KEY, nextSalonCode],
      ]);
      setFrontendBiometricEnabled(true);
      return true;
    },
    [frontendBiometricAvailable, frontendBiometricType]
  );

  const maybePromptFrontendBiometricSetup = useCallback(
    async (nextProfile: FrontendProfile, nextSalonCode: string) => {
      if (Platform.OS === 'web' || frontendBiometricEnabled || !frontendBiometricAvailable) {
        return;
      }

      const promptKey = buildFrontendBiometricPromptedKey({
        salonCode: nextSalonCode,
        email: nextProfile.email,
        phone: nextProfile.telefono,
      });

      try {
        const alreadyPrompted = await AsyncStorage.getItem(promptKey);
        if (alreadyPrompted === 'true') {
          return;
        }

        await AsyncStorage.setItem(promptKey, 'true');
      } catch (error) {
        console.log('Errore controllo prompt biometria frontend:', error);
      }

      requestAnimationFrame(() => {
        Alert.alert(
          frontendBiometricType === 'faceid'
            ? 'Attivare Face ID?'
            : 'Attivare accesso biometrico?',
          'Vuoi attivare l’accesso rapido su questo dispositivo? Potrai entrare con biometria oppure con il codice di sblocco del dispositivo.',
          [
            {
              text: 'Non ora',
              style: 'cancel',
            },
            {
              text: 'Si, attiva',
              onPress: () => {
                void enableFrontendBiometricDirectly(nextProfile, nextSalonCode);
              },
            },
          ]
        );
      });
    },
    [
      enableFrontendBiometricDirectly,
      frontendBiometricAvailable,
      frontendBiometricEnabled,
      frontendBiometricType,
    ]
  );

  const unlockFrontendClienteWithBiometric = useCallback(async () => {
    if (frontendBiometricBusy) {
      return;
    }

    if (!frontendBiometricEnabled) {
      Alert.alert(
        'Biometria non attiva',
        'Attiva prima Face ID o biometria dalle impostazioni cliente.'
      );
      return;
    }

    if (!frontendBiometricAvailable) {
      Alert.alert(
        'Biometria non disponibile',
        'Configura Face ID o impronta nelle impostazioni del dispositivo e riprova.'
      );
      return;
    }

    setFrontendBiometricBusy(true);

    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage:
          frontendBiometricType === 'faceid'
            ? 'Accedi con Face ID'
            : 'Accedi con biometria',
        cancelLabel: 'Annulla',
        disableDeviceFallback: false,
        fallbackLabel: 'Usa codice',
      });

      if (!authResult.success) {
        return;
      }

      const fallbackSalonCode = normalizeSalonCode(selectedSalonCode || initialSalonCodeParam || '');
      const [savedSalonCode] = await Promise.all([
        AsyncStorage.getItem(FRONTEND_BIOMETRIC_SALON_CODE_KEY),
      ]);
      const effectiveBiometricSalonCode = normalizeSalonCode(savedSalonCode ?? fallbackSalonCode);
      const savedProfile =
        (effectiveBiometricSalonCode
          ? await AsyncStorage.getItem(
              buildFrontendBiometricProfileKeyForSalon(effectiveBiometricSalonCode)
            )
          : null) ?? (await AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY));

      if (!savedProfile) {
        Alert.alert(
          'Profilo biometrico non trovato',
          'Non ho trovato un profilo cliente biometrico salvato su questo dispositivo.'
        );
        return;
      }

      const parsed = JSON.parse(savedProfile) as FrontendProfile;
      const normalizedSalon = normalizeSalonCode(savedSalonCode ?? '');

      if (
        !parsed.nome?.trim() ||
        !parsed.cognome?.trim() ||
        !parsed.email?.trim() ||
        !parsed.telefono?.trim()
      ) {
        Alert.alert(
          'Profilo biometrico non valido',
          'I dati salvati per l’accesso biometrico non sono completi. Rientra con accesso normale.'
        );
        return;
      }

      setProfile({
        nome: parsed.nome ?? '',
        cognome: parsed.cognome ?? '',
        email: parsed.email ?? '',
        telefono: parsed.telefono ?? '',
        instagram: parsed.instagram ?? '',
      });

      if (normalizedSalon) {
        setSelectedSalonCode(normalizedSalon);
        setSalonCodeDraft(normalizedSalon);
      }

      await AsyncStorage.multiSet([
        [FRONTEND_PROFILE_KEY, JSON.stringify(parsed)],
        [buildFrontendProfileKeyForSalon(normalizedSalon), JSON.stringify(parsed)],
        [FRONTEND_LAST_SALON_CODE_KEY, normalizedSalon],
      ]);

      setAccessMode('login');
      setIsRegistered(true);
      setHasSavedProfileForSelectedSalon(true);
      const shouldOpenBookingDirectly =
        shouldStartInBookingMode || Boolean(initialSalonCodeParam) || Boolean(normalizedSalon);
      setIsBookingStarted(shouldOpenBookingDirectly);
      setShowRequestsExpanded(!shouldOpenBookingDirectly);

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } catch (error) {
      console.log('Errore accesso biometrico cliente:', error);
      Alert.alert('Accesso biometrico', 'Non sono riuscito a completare l’accesso biometrico.');
    } finally {
      setFrontendBiometricBusy(false);
    }
  }, [
    frontendBiometricAvailable,
    frontendBiometricBusy,
    frontendBiometricEnabled,
    frontendBiometricType,
    initialSalonCodeParam,
    shouldStartInBookingMode,
  ]);

  useEffect(() => {
    if (!hasHydratedFrontendSession || !isRegistered) {
      return;
    }

    if (
      shouldStartInBookingMode &&
      (hasSavedProfileForSelectedSalon || Boolean(normalizedSelectedSalonCode)) &&
      !isBookingStarted
    ) {
      setIsBookingStarted(true);
      setShowRequestsExpanded(false);
    }
  }, [
    hasHydratedFrontendSession,
    hasSavedProfileForSelectedSalon,
    isBookingStarted,
    isRegistered,
    normalizedSelectedSalonCode,
    shouldStartInBookingMode,
  ]);

  useEffect(() => {
    const incomingSalonCode = Array.isArray(searchParams.salon)
      ? searchParams.salon[0]
      : searchParams.salon;

    if (incomingSalonCode) {
      setSelectedSalonCode(incomingSalonCode);
      setSalonCodeDraft(incomingSalonCode);
      if (!isRegistered) {
        setAccessMode(isHomeAutoLoginFlow ? 'login' : hasSavedProfileForSelectedSalon ? 'login' : 'register');
      }
    }
  }, [hasSavedProfileForSelectedSalon, isHomeAutoLoginFlow, isRegistered, searchParams.salon]);

  useEffect(() => {
    if (isRegistered || !hasResolvedOrIncomingSalonCode) {
      return;
    }

    setAccessMode(isHomeAutoLoginFlow ? 'login' : hasSavedProfileForSelectedSalon ? 'login' : 'register');
  }, [hasResolvedOrIncomingSalonCode, hasSavedProfileForSelectedSalon, isHomeAutoLoginFlow, isRegistered]);

  useEffect(() => {
    if (shouldStartInBookingMode && isRegistered) {
      setShowRequestsExpanded(false);
      setIsBookingStarted(true);
    }
  }, [isRegistered, shouldStartInBookingMode]);

  useEffect(() => {
    if (
      autoBiometricAttemptedRef.current ||
      initialBiometricParam !== '1' ||
      !hasHydratedFrontendSession ||
      isRegistered ||
      !frontendBiometricEnabled
    ) {
      return;
    }

    autoBiometricAttemptedRef.current = true;
    void unlockFrontendClienteWithBiometric();
  }, [
    frontendBiometricEnabled,
    hasHydratedFrontendSession,
    initialBiometricParam,
    isRegistered,
    unlockFrontendClienteWithBiometric,
  ]);

  const refreshPublicSalonState = useCallback(async () => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      return null;
    }

    if (publicSalonRefreshPromiseRef.current) {
      return publicSalonRefreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      publicSalonRefreshInFlightRef.current = true;

      try {
        const resolved = await resolveSalonByCode(normalizedSelectedSalonCode);
        if (resolved) {
          applyPublicAvailabilitySettings(resolved.availabilitySettings);
          const now = Date.now();
          const remoteKeys = new Set(
            resolved.richiestePrenotazione.map((item) => buildPublicRequestCompositeKey(item))
          );
          const remoteRequestResolutionKeys = new Set(
            resolved.richiestePrenotazione.map((item) => buildPublicRequestResolutionKey(item))
          );
          const remoteAppointmentResolutionKeys = new Set(
            resolved.appuntamenti.map((item) => buildAppointmentResolutionKey(item))
          );
          const freshLocalEntries = recentLocalBookingRequestsRef.current
            .filter((entry) => now - entry.addedAt <= LOCAL_REQUEST_VISIBILITY_GRACE_MS)
            .filter((entry) => !remoteKeys.has(buildPublicRequestCompositeKey(entry.request)));

          const syntheticAcceptedRequests = freshLocalEntries
            .filter(
              (entry) =>
                !remoteRequestResolutionKeys.has(buildPublicRequestResolutionKey(entry.request)) &&
                remoteAppointmentResolutionKeys.has(
                  buildPublicRequestResolutionKey(entry.request)
                )
            )
            .map((entry) => ({
              ...entry.request,
              stato: 'Accettata' as const,
              viewedByCliente: false,
              viewedBySalon: true,
            }));

          const preservedRequests = freshLocalEntries
            .filter(
              (entry) =>
                !remoteRequestResolutionKeys.has(buildPublicRequestResolutionKey(entry.request)) &&
                !remoteAppointmentResolutionKeys.has(
                  buildPublicRequestResolutionKey(entry.request)
                )
            );

          recentLocalBookingRequestsRef.current = [
            ...preservedRequests,
            ...recentLocalBookingRequestsRef.current.filter((entry) =>
              remoteKeys.has(buildPublicRequestCompositeKey(entry.request))
            ),
          ]
            .reduce<Array<{ request: PublicSalonState['richiestePrenotazione'][number]; addedAt: number }>>(
              (accumulator, entry) => {
                const compositeKey = buildPublicRequestCompositeKey(entry.request);
                if (accumulator.some((item) => buildPublicRequestCompositeKey(item.request) === compositeKey)) {
                  return accumulator;
                }

                accumulator.push(entry);
                return accumulator;
              },
              []
            );

          const mergedResolvedBase: PublicSalonState = preservedRequests.length
            ? {
                ...resolved,
                richiestePrenotazione: [
                  ...resolved.richiestePrenotazione,
                  ...preservedRequests.map((entry) => entry.request),
                  ...syntheticAcceptedRequests,
                ],
              }
              : syntheticAcceptedRequests.length
              ? {
                  ...resolved,
                  richiestePrenotazione: [
                    ...resolved.richiestePrenotazione,
                    ...syntheticAcceptedRequests,
                  ],
                }
              : resolved;
          const mergedResolved: PublicSalonState = mergedResolvedBase;
          const nextSignature = buildPublicSalonStateSignature(mergedResolved);
          if (publicSalonStateSignatureRef.current !== nextSignature) {
            publicSalonStateSignatureRef.current = nextSignature;
            applyMergedPublicSalonState(mergedResolved);
          }
          setSalonLoadError('');
          return mergedResolved;
        }

        const lightweightSettings = await fetchClientPortalAvailabilitySettings(
          normalizedSelectedSalonCode
        ).catch(() => null);

        if (lightweightSettings) {
          applyPublicAvailabilitySettings(lightweightSettings.availabilitySettings);
          setSalonLoadError('');
          return publicSalonState;
        }

        return resolved;
      } finally {
        publicSalonRefreshInFlightRef.current = false;
        publicSalonRefreshPromiseRef.current = null;
      }
    })();

    publicSalonRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [
    isCurrentWorkspaceSalon,
    normalizedSelectedSalonCode,
    publicSalonState,
    applyPublicAvailabilitySettings,
    resolveSalonByCode,
  ]);

  useEffect(() => {
    refreshPublicSalonStateRef.current = refreshPublicSalonState;
  }, [refreshPublicSalonState]);

  useEffect(() => {
    publicSalonStateSignatureRef.current = buildPublicSalonStateSignature(publicSalonState);
  }, [publicSalonState]);

  const refreshBackendDayOccupancy = useCallback(async () => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode || !data) {
      setBackendDayOccupancy([]);
      return [];
    }

    try {
      const resolved = (await refreshPublicSalonState()) ?? publicSalonState;
      const occupancy = derivePublicBookingOccupancyFromSnapshot(resolved, data);
      setBackendDayOccupancy(occupancy);
      return occupancy;
    } catch (error) {
      console.log('Errore caricamento occupazione backend giorno:', error);
      return [];
    }
  }, [
    data,
    derivePublicBookingOccupancyFromSnapshot,
    isCurrentWorkspaceSalon,
    normalizedSelectedSalonCode,
    publicSalonState,
    refreshPublicSalonState,
  ]);

  const refreshPublicAvailabilitySettingsOnly = useCallback(async () => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      return null;
    }

    const lightweightSettings = await fetchClientPortalAvailabilitySettings(
      normalizedSelectedSalonCode
    ).catch(() => null);

    if (lightweightSettings) {
      applyPublicAvailabilitySettings(lightweightSettings.availabilitySettings);
    }

    return lightweightSettings;
  }, [
    applyPublicAvailabilitySettings,
    isCurrentWorkspaceSalon,
    normalizedSelectedSalonCode,
  ]);

  const refreshPublicSalonAvailability = useCallback(async () => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      setBackendDayOccupancy([]);
      return { resolved: null, occupancy: [] as PublicBookingOccupancyItem[] };
    }

    const lightweightSettings = await fetchClientPortalAvailabilitySettings(
      normalizedSelectedSalonCode
    ).catch(() => null);

    if (lightweightSettings) {
      applyPublicAvailabilitySettings(lightweightSettings.availabilitySettings);
    }

    const resolved = await refreshPublicSalonState();
    const occupancy = derivePublicBookingOccupancyFromSnapshot(resolved, data);
    setBackendDayOccupancy(occupancy);

    return { resolved, occupancy };
  }, [
    data,
    derivePublicBookingOccupancyFromSnapshot,
    isCurrentWorkspaceSalon,
    normalizedSelectedSalonCode,
    publicSalonState,
    applyPublicAvailabilitySettings,
    refreshPublicSalonState,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
        return undefined;
      }

      void refreshPublicSalonAvailability();

      return undefined;
    }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, refreshPublicSalonAvailability])
  );

  const syncClientPushRegistration = useCallback(async () => {
    if (!isRegistered || !effectiveWorkspace?.salonCode) {
      return;
    }

    if (Platform.OS === 'web') {
      await requestWebNotificationPermission().catch(() => 'default');
      return;
    }

    const customerEmail = profile.email.trim().toLowerCase();
    const customerPhone = profile.telefono.trim();
    if (!customerEmail || !customerPhone) {
      return;
    }

    let workspaceId = isUuidValue(effectiveWorkspace.id) ? effectiveWorkspace.id : '';
    let ownerEmail = effectiveWorkspace.ownerEmail;

    if (!workspaceId) {
      const snapshot = await resolveSalonByCode(effectiveWorkspace.salonCode);
      if (snapshot?.workspace?.id && isUuidValue(snapshot.workspace.id)) {
        workspaceId = snapshot.workspace.id;
        ownerEmail = snapshot.workspace.ownerEmail;

        if (!isCurrentWorkspaceSalon) {
          applyMergedPublicSalonState(snapshot);
        }
      }
    }

    if (!workspaceId) {
      console.log('Client push registration skipped: workspace_uuid_unavailable');
      return;
    }

    const result = await registerPushNotifications({
      workspaceId,
      ownerEmail,
      audience: 'auto',
      recipientKind: 'client',
      customerEmail,
      customerPhone,
    });

    if (!result.token) {
      console.log('Client push registration skipped:', result.reason ?? 'token_unavailable');
      return;
    }

    if (!result.backendSynced) {
      console.log('Client push token registrato sul device ma non sincronizzato backend.');
    }
  }, [
    effectiveWorkspace?.id,
    effectiveWorkspace?.ownerEmail,
    effectiveWorkspace?.salonCode,
    isCurrentWorkspaceSalon,
    isRegistered,
    profile.email,
    profile.telefono,
    resolveSalonByCode,
  ]);

  useEffect(() => {
    const loadSalon = async () => {
      if (isCurrentWorkspaceSalon) {
        setPublicSalonState(null);
        setPublicAvailabilitySettings(null);
        setBackendDayOccupancy([]);
        setSalonLoadError('');
        return;
      }

      if (!normalizedSelectedSalonCode) {
        setPublicSalonState(null);
        setPublicAvailabilitySettings(null);
        setBackendDayOccupancy([]);
        setSalonLoadError('Nessun salone collegato. Vai su Inserisci codice salone, scrivi il codice e poi tocca Seleziona salone.');
        return;
      }

      setIsLoadingSalon(true);
      setAutoLoginStalled(false);
      let resolved: PublicSalonState | null = null;

      try {
        resolved = await Promise.race([
          refreshPublicSalonStateRef.current(),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 12000);
          }),
        ]);
      } catch (error) {
        console.log('Errore caricamento iniziale salone pubblico:', error);
      } finally {
        setIsLoadingSalon(false);
      }

      if (!resolved) {
        setPublicSalonState(null);
        setPublicAvailabilitySettings(null);
        setBackendDayOccupancy([]);
        if (isHomeAutoLoginFlow) {
          setAutoLoginStalled(true);
        }
        setSalonLoadError(
          'Questo codice salone non è stato trovato. Controlla il codice oppure usa il link del tuo salone.'
        );
        return;
      }

      applyMergedPublicSalonState(resolved);
      setSalonLoadError('');
    };

    loadSalon();
  }, [isCurrentWorkspaceSalon, isHomeAutoLoginFlow, normalizedSelectedSalonCode]);

  useEffect(() => {
    if (
      !isRegistered ||
      !isBookingStarted ||
      isCurrentWorkspaceSalon ||
      !normalizedSelectedSalonCode ||
      isLoadingSalon ||
      effectiveServizi.length > 0
    ) {
      return;
    }

    let cancelled = false;
    const retryTimeout = setTimeout(() => {
      void (async () => {
        setIsLoadingSalon(true);
        let resolved: PublicSalonState | null = null;

        try {
          resolved = await refreshPublicSalonState();
        } catch (error) {
          console.log('Errore retry caricamento servizi salone pubblico:', error);
        } finally {
          if (!cancelled) {
            setIsLoadingSalon(false);
          }
        }

        if (cancelled) return;

        if (!resolved) {
          setSalonLoadError(
            'Non riesco a caricare i servizi del salone in questo momento. Riprova tra un attimo.'
          );
          return;
        }

        applyMergedPublicSalonState(resolved);
        setSalonLoadError('');
      })();
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
    };
  }, [
    applyMergedPublicSalonState,
    effectiveServizi.length,
    isBookingStarted,
    isCurrentWorkspaceSalon,
    isLoadingSalon,
    isRegistered,
    normalizedSelectedSalonCode,
    refreshPublicSalonState,
  ]);

  useEffect(() => {
    void refreshBackendDayOccupancy();
  }, [refreshBackendDayOccupancy]);

  const giorniDisponibili = useMemo(
    () => buildCenteredDates(today, DAY_PICKER_DAYS_BEFORE, DAY_PICKER_DAYS_AFTER),
    [today]
  );
  const effectiveDayPickerViewportWidth = dayPickerViewportWidth || width;
  const dayPickerSideInset = Math.max(0, effectiveDayPickerViewportWidth / 2 - activeDayCardWidth / 2);
  const dayPickerSnapOffsets = useMemo(
    () => giorniDisponibili.map((_, index) => index * activeDayCardStride),
    [activeDayCardStride, giorniDisponibili]
  );

  const centerDayInPicker = useCallback(
    (dateValue: string, animated = false) => {
      if (Platform.OS !== 'web') return;
      const index = giorniDisponibili.findIndex((item) => item.value === dateValue);
      if (index < 0) return;

      const x = index * activeDayCardStride;
      if (Platform.OS === 'web') {
        const el = dayPickerWebStripRef.current as unknown as HTMLElement | null;
        if (el && typeof el.scrollTo === 'function') {
          el.scrollTo({ left: x, behavior: animated ? 'smooth' : 'auto' });
        }
        return;
      }
      dayPickerRef.current?.scrollTo({
        x,
        animated,
      });
    },
    [activeDayCardStride, giorniDisponibili]
  );

  const handleDayCardPress = useCallback(
    (dateValue: string) => {
      if (!dateValue) return;

      lastSnappedDayRef.current = dateValue;
      webDayPickerProgrammaticSyncLockUntilRef.current = Date.now() + 260;

      if (data !== dateValue) {
        setData(dateValue);
      }

      centerDayInPicker(dateValue, false);
    },
    [centerDayInPicker, data]
  );

  const settleDayPickerAtOffset = useCallback(
    (offsetX: number) => {
      const safeOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
      const rawIndex = Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(safeOffsetX / activeDayCardStride))
      );
      const firstSelectableIndex = giorniDisponibili.findIndex((day) => day.value >= today);
      const nextIndex = Math.max(rawIndex, firstSelectableIndex >= 0 ? firstSelectableIndex : 0);
      const nextDay = giorniDisponibili[nextIndex] ?? giorniDisponibili[rawIndex];
      if (!nextDay) return;
      if (nextDay.value < today) return;

      if (lastSnappedDayRef.current === nextDay.value && data === nextDay.value) {
        return;
      }

      lastSnappedDayRef.current = nextDay.value;

      if (data !== nextDay.value) {
        setData(nextDay.value);
      }

      centerDayInPicker(nextDay.value, false);
    },
    [activeDayCardStride, centerDayInPicker, data, giorniDisponibili, today]
  );

  const syncWebDayPickerSelection = useCallback(
    (offsetX: number) => {
      if (Platform.OS === 'web' && !webDayPickerSelectionReadyRef.current) {
        return;
      }
      if (
        Platform.OS === 'web' &&
        Date.now() < webDayPickerProgrammaticSyncLockUntilRef.current
      ) {
        return;
      }

      const safeOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
      const nextIndex = Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(safeOffsetX / activeDayCardStride))
      );
      const nextDay = giorniDisponibili[nextIndex];
      if (!nextDay) return;
      if (data === nextDay.value) return;

      lastSnappedDayRef.current = nextDay.value;
      startTransition(() => {
        setData(nextDay.value);
      });
    },
    [activeDayCardStride, data, giorniDisponibili]
  );

  const getWebHostScrollLeft = useCallback((event: unknown) => {
    const rawEvent = event as {
      nativeEvent?: { contentOffset?: { x?: number }; target?: EventTarget | null };
      currentTarget?: { scrollLeft?: number } | null;
      target?: { scrollLeft?: number } | null;
    };

    const nativeOffset = rawEvent.nativeEvent?.contentOffset?.x;
    if (typeof nativeOffset === 'number' && Number.isFinite(nativeOffset)) {
      return nativeOffset;
    }

    const currentTargetScrollLeft = rawEvent.currentTarget?.scrollLeft;
    if (typeof currentTargetScrollLeft === 'number' && Number.isFinite(currentTargetScrollLeft)) {
      return currentTargetScrollLeft;
    }

    const targetScrollLeft = rawEvent.target?.scrollLeft;
    if (typeof targetScrollLeft === 'number' && Number.isFinite(targetScrollLeft)) {
      return targetScrollLeft;
    }

    const host = dayPickerWebStripRef.current as unknown as HTMLElement | null;
    return typeof host?.scrollLeft === 'number' ? host.scrollLeft : 0;
  }, []);

  const scheduleWebDayPickerSettle = useCallback(
    (offsetX?: number | null, delayMs = 90) => {
      if (dayPickerScrollSettleTimeoutRef.current) {
        clearTimeout(dayPickerScrollSettleTimeoutRef.current);
      }

      dayPickerScrollSettleTimeoutRef.current = setTimeout(() => {
        const host = dayPickerWebStripRef.current as unknown as HTMLElement | null;
        const resolvedOffsetX =
          typeof offsetX === 'number' && Number.isFinite(offsetX)
            ? offsetX
            : typeof host?.scrollLeft === 'number'
              ? host.scrollLeft
              : 0;

        settleDayPickerAtOffset(resolvedOffsetX);
        dayPickerScrollSettleTimeoutRef.current = null;
      }, delayMs);
    },
    [settleDayPickerAtOffset]
  );

  useEffect(() => {
    if (hasCenteredCurrentDayRef.current) return;
    hasCenteredCurrentDayRef.current = true;

    startTransition(() => {
      setData(today);
    });

    const frame = requestAnimationFrame(() => {
      centerDayInPicker(today, false);
    });

    return () => cancelAnimationFrame(frame);
  }, [centerDayInPicker, today]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!dayPickerViewportWidth) return;
    if (!isBookingStarted) return;

    const targetDay = data || today;
    webDayPickerSelectionReadyRef.current = false;
    const timers = [
      requestAnimationFrame(() => {
        centerDayInPicker(targetDay, false);
      }),
      setTimeout(() => {
        centerDayInPicker(targetDay, false);
      }, 80),
      setTimeout(() => {
        centerDayInPicker(targetDay, false);
      }, 180),
      setTimeout(() => {
        webDayPickerSelectionReadyRef.current = true;
      }, 260),
    ];

    return () => {
      cancelAnimationFrame(timers[0] as number);
      clearTimeout(timers[1] as ReturnType<typeof setTimeout>);
      clearTimeout(timers[2] as ReturnType<typeof setTimeout>);
      clearTimeout(timers[3] as ReturnType<typeof setTimeout>);
    };
  }, [centerDayInPicker, data, dayPickerViewportWidth, isBookingStarted, today]);

  useEffect(() => {
    if (!isBookingStarted) return;

    const hasCurrentDay = giorniDisponibili.some((day) => day.value === data);
    const preferredDay = giorniDisponibili.find((day) => day.value >= today)?.value ?? today;

    if (!preferredDay) return;
    if (data && data >= today && hasCurrentDay) return;

    lastSnappedDayRef.current = preferredDay;
    startTransition(() => {
      setData(preferredDay);
    });

    requestAnimationFrame(() => {
      centerDayInPicker(preferredDay, false);
    });
  }, [centerDayInPicker, data, giorniDisponibili, isBookingStarted, today]);

  useEffect(() => {
    return () => {
      if (dayPickerScrollSettleTimeoutRef.current) {
        clearTimeout(dayPickerScrollSettleTimeoutRef.current);
        dayPickerScrollSettleTimeoutRef.current = null;
      }
      if (dayPickerScrollRafRef.current != null) {
        cancelAnimationFrame(dayPickerScrollRafRef.current);
        dayPickerScrollRafRef.current = null;
      }
    };
  }, []);

  const appuntamentiDelGiorno = useMemo(
    () =>
      effectiveBlockingAppointments
        .filter((item) => (item.data ?? getTodayDateString()) === data)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [data, effectiveBlockingAppointments]
  );

  const appuntamentiRealiDelGiorno = useMemo(
    () =>
      effectiveAppuntamenti
        .filter((item) => (item.data ?? getTodayDateString()) === data)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [data, effectiveAppuntamenti]
  );

  const operatoriCompatibili = useMemo(
    () =>
      servizio.trim()
        ? getEligibleOperatorsForService({
            serviceName: servizio,
            services: effectiveServizi,
            operators: effectiveOperatori,
            appointmentDate: data,
            settings: effectiveAvailabilitySettings,
          })
        : [],
    [data, effectiveAvailabilitySettings, effectiveOperatori, effectiveServizi, servizio]
  );
  const serviceHasConfiguredOperators = useMemo(
    () =>
      !!servizio.trim() &&
      getConfiguredOperatorsForFrontendService({
        serviceName: servizio,
        services: effectiveServizi,
        operators: effectiveOperatori,
      }).length > 0,
    [effectiveOperatori, effectiveServizi, servizio]
  );
  const serviceRequiresOperatorScheduling =
    !!servizio.trim() &&
    serviceHasConfiguredOperators;
  const serviceUsesOperatorScheduling = serviceRequiresOperatorScheduling;
  const operatorSelectionRequired =
    serviceUsesOperatorScheduling && operatoriCompatibili.length > 1;
  const clienteNomeCompleto = useMemo(
    () => `${profile.nome.trim()} ${profile.cognome.trim()}`.trim().toLowerCase(),
    [profile.cognome, profile.nome]
  );
  const currentCustomerIdentityNames = useMemo(() => {
    const names = new Set<string>();
    const normalizedFirstName = profile.nome.trim().toLowerCase();
    const normalizedLastName = profile.cognome.trim().toLowerCase();

    if (clienteNomeCompleto) {
      names.add(clienteNomeCompleto);
    }
    if (normalizedFirstName) {
      names.add(normalizedFirstName);
    }
    if (normalizedLastName) {
      names.add(normalizedLastName);
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(profile.telefono.trim());

    effectiveClienti.forEach((item) => {
      const sameEmail =
        !!normalizedEmail &&
        (item.email ?? '').trim().toLowerCase() === normalizedEmail;
      const samePhone =
        !!normalizedPhone &&
        limitPhoneToTenDigits(item.telefono ?? '') === normalizedPhone;

      if (!sameEmail && !samePhone) {
        return;
      }

      const normalizedName = item.nome.trim().toLowerCase();
      if (normalizedName) {
        names.add(normalizedName);
      }
    });

    return names;
  }, [clienteNomeCompleto, effectiveClienti, profile.cognome, profile.email, profile.nome, profile.telefono]);

  const hasFrontendSlotSelectionConflict = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
      selectedOperatorName,
      operators,
      appointments,
      services,
      settings,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      selectedOperatorName?: string | null;
      operators: typeof effectiveOperatori;
      appointments: typeof effectiveAppuntamenti;
      services: typeof effectiveServizi;
      settings: typeof effectiveAvailabilitySettings;
    }) => {
      if (!serviceName.trim()) return false;

      const appointmentsForDate = appointments.filter(
        (item) => (item.data ?? getTodayDateString()) === dateValue
      );
      const serviceDuration = getServiceDuration(serviceName, services);
      const overlappingAppointments = appointmentsForDate.filter((item) =>
        doesTimeRangeConflictWithAppointment({
          startTime,
          durationMinutes: serviceDuration,
          appointment: item,
          services,
          settings,
        })
      );

      if (overlappingAppointments.length === 0) {
        return false;
      }

      const currentCustomerHasOverlappingBooking = overlappingAppointments.some((item) =>
        Array.from(currentCustomerIdentityNames).some((candidateName) =>
          matchesCustomerDisplayName(item.cliente, candidateName)
        )
      );

      if (currentCustomerHasOverlappingBooking) {
        return true;
      }

      if (
        overlappingAppointments.some((item) =>
          doesAppointmentBlockRequiredMachinery({
            selectedServiceName: serviceName,
            appointment: item,
            services,
          })
        )
      ) {
        return true;
      }

      if (!serviceUsesOperatorScheduling) {
        return overlappingAppointments.some((item) =>
          doesExistingFrontendBookingBlockSelectedService({
            selectedServiceName: serviceName,
            existingServiceName: item.servizio,
            existingMachineryIds: item.macchinarioIds,
            services,
          })
        );
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName,
        services,
        operators,
        appointmentDate: dateValue,
        settings,
      });

      if (compatibleOperators.length === 0) {
        return true;
      }

      const selectedOperator = selectedOperatorId?.trim() ?? '';
      const resolvedSelectedOperatorName =
        selectedOperatorName?.trim() ||
        operators.find((item) => item.id.trim() === selectedOperator)?.nome?.trim() ||
        '';
      if (selectedOperator) {
        const isSelectedOperatorAvailable = compatibleOperators.some(
          (item) => item.id.trim() === selectedOperator
        );

        if (!isSelectedOperatorAvailable) {
          return true;
        }

        return overlappingAppointments.some((item) => {
          const { operatorId: existingOperatorId, operatorName: existingOperatorName } =
            normalizeFrontendOperatorIdentity({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            });

          if (!existingOperatorId && !existingOperatorName) {
            return false;
          }

          return matchesOperatorIdentity({
            appointmentOperatorId: existingOperatorId,
            appointmentOperatorName: existingOperatorName,
            selectedOperatorId: selectedOperator,
            selectedOperatorName: resolvedSelectedOperatorName,
          });
        });
      }

      const compatibleOperatorKeys = new Set(
        compatibleOperators
          .map((item) =>
            buildFrontendOperatorIdentityKey({
              operatorId: item.id,
              operatorName: item.nome,
            })
          )
          .filter(Boolean)
      );
      const busyCompatibleOperatorKeys = new Set(
        overlappingAppointments
          .map((item) =>
            buildFrontendOperatorIdentityKey({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            })
          )
          .filter((key) => compatibleOperatorKeys.has(key))
      );
      const hasAnonymousOverlaps = overlappingAppointments.some((item) => {
        if (
          buildFrontendOperatorIdentityKey({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          })
        ) {
          return false;
        }

        return false;
      });

      if (hasAnonymousOverlaps) {
        return true;
      }

      return busyCompatibleOperatorKeys.size >= compatibleOperatorKeys.size;
    },
    [currentCustomerIdentityNames, serviceUsesOperatorScheduling]
  );

  const richiestaInConflitto =
    data && ora && servizio
      ? hasFrontendSlotSelectionConflict({
          dateValue: data,
          startTime: ora,
          serviceName: servizio,
          selectedOperatorId: operatoreId || null,
          selectedOperatorName: operatoreNome || null,
          operators: effectiveOperatori,
          appointments: effectiveBlockingAppointments,
          services: effectiveServizi,
          settings: effectiveAvailabilitySettings,
        })
      : null;
  const exactSlotRequestAlreadyPresent = useMemo(
    () =>
      !!(
        data &&
        ora &&
        servizio.trim() &&
        profile.email.trim() &&
        profile.telefono.trim() &&
        effectiveRichieste.some(
          (item) => {
            if (
              item.data !== data ||
              item.ora !== ora ||
              !(item.stato === 'In attesa' || item.stato === 'Accettata') ||
              normalizeIdentityText(item.email) !== normalizeIdentityText(profile.email) ||
              item.telefono.trim() !== profile.telefono.trim()
            ) {
              return false;
            }

            return true;
          }
        )
      ),
    [
      data,
      effectiveRichieste,
      ora,
      profile.email,
      profile.telefono,
      servizio,
    ]
  );

  useEffect(() => {
    if (!serviceUsesOperatorScheduling || operatoriCompatibili.length === 0) {
      setOperatoreId('');
      setOperatoreNome('');
      return;
    }

    if (operatoriCompatibili.length === 1) {
      const [singleOperator] = operatoriCompatibili;

      if (singleOperator && singleOperator.id !== operatoreId) {
        setOperatoreId(singleOperator.id);
        setOperatoreNome(singleOperator.nome);
        setOra('');
      }

      return;
    }

    if (!operatoriCompatibili.some((item) => item.id === operatoreId)) {
      setOperatoreId('');
      setOperatoreNome('');
      setOra('');
    }
  }, [operatoreId, operatoriCompatibili, serviceUsesOperatorScheduling]);

  const clienteInibito = useMemo(() => {
    if (!isRegistered) return false;

    const sourceClienti = isCurrentWorkspaceSalon ? clienti : publicSalonState?.clienti ?? [];

    return sourceClienti.some((item: PublicSalonState['clienti'][number]) => {
      return matchesBlockedClientProfile(item, profile);
    });
  }, [
    clienti,
    isCurrentWorkspaceSalon,
    isRegistered,
    profile.email,
    profile.telefono,
    publicSalonState?.clienti,
  ]);

  const orariInConflitto = useMemo(
    () =>
      new Set(
        displayTimeSlots.filter((slotTime) => {
          if (!servizio) return false;
          if (getDateAvailabilityInfo(effectiveAvailabilitySettings, data).closed) {
            return false;
          }

          return hasFrontendSlotSelectionConflict({
            dateValue: data,
            startTime: slotTime,
            serviceName: servizio,
            selectedOperatorId: operatoreId || null,
            selectedOperatorName: operatoreNome || null,
            operators: effectiveOperatori,
            appointments: effectiveBlockingAppointments,
            services: effectiveServizi,
            settings: effectiveAvailabilitySettings,
          });
        })
      ),
    [
      data,
      displayTimeSlots,
      effectiveAvailabilitySettings,
      effectiveBlockingAppointments,
      effectiveOperatori,
      effectiveServizi,
      hasFrontendSlotSelectionConflict,
      operatoreId,
      servizio,
    ]
  );

  const getFrontendSlotAvailableCount = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
      selectedOperatorName,
      operators,
      appointments,
      services,
      settings,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      selectedOperatorName?: string | null;
      operators: typeof effectiveOperatori;
      appointments: typeof effectiveAppuntamenti;
      services: typeof effectiveServizi;
      settings: typeof effectiveAvailabilitySettings;
    }) => {
      if (!serviceName.trim()) return 0;
      if (!isTimeWithinDaySchedule(settings, dateValue, startTime)) return 0;
      if (
        !doesServiceFitWithinDaySchedule({
          settings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName, services),
        })
      ) {
        return 0;
      }
      if (isSlotBlockedByOverride(settings, dateValue, startTime)) return 0;
      if (
        doesServiceOverlapLunchBreak({
          settings,
          startTime,
          durationMinutes: getServiceDuration(serviceName, services),
        })
      ) {
        return 0;
      }

      const appointmentsForDate = appointments.filter(
        (item) => (item.data ?? getTodayDateString()) === dateValue
      );
      const serviceDuration = getServiceDuration(serviceName, services);
      const overlappingAppointments = appointmentsForDate.filter((item) => {
        return doesTimeRangeConflictWithAppointment({
          startTime,
          durationMinutes: serviceDuration,
          appointment: item,
          services,
          settings,
        });
      });

      const currentCustomerHasOverlappingBooking = overlappingAppointments.some((item) =>
        Array.from(currentCustomerIdentityNames).some((candidateName) =>
          matchesCustomerDisplayName(item.cliente, candidateName)
        )
      );

      if (currentCustomerHasOverlappingBooking) {
        return 0;
      }

      if (
        overlappingAppointments.some((item) =>
          doesAppointmentBlockRequiredMachinery({
            selectedServiceName: serviceName,
            appointment: item,
            services,
          })
        )
      ) {
        return 0;
      }

      if (!serviceUsesOperatorScheduling) {
        return overlappingAppointments.some((item) =>
          doesExistingFrontendBookingBlockSelectedService({
            selectedServiceName: serviceName,
            existingServiceName: item.servizio,
            existingMachineryIds: item.macchinarioIds,
            services,
          })
        )
          ? 0
          : 1;
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName,
        services,
        operators,
        appointmentDate: dateValue,
        settings,
      });

      if (compatibleOperators.length === 0) {
        return 0;
      }

      const selectedOperator = selectedOperatorId?.trim() ?? '';
      const resolvedSelectedOperatorName =
        selectedOperatorName?.trim() ||
        operators.find((item) => item.id.trim() === selectedOperator)?.nome?.trim() ||
        '';
      if (selectedOperator) {
        const isSelectedOperatorAvailable = compatibleOperators.some(
          (item) => item.id.trim() === selectedOperator
        );

        if (!isSelectedOperatorAvailable) {
          return 0;
        }

        return overlappingAppointments.some((item) => {
          const { operatorId: existingOperatorId, operatorName: existingOperatorName } =
            normalizeFrontendOperatorIdentity({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            });

          if (!existingOperatorId && !existingOperatorName) {
            return false;
          }

          return matchesOperatorIdentity({
            appointmentOperatorId: existingOperatorId,
            appointmentOperatorName: existingOperatorName,
            selectedOperatorId: selectedOperator,
            selectedOperatorName: resolvedSelectedOperatorName,
          });
        })
          ? 0
          : 1;
      }

      const compatibleOperatorKeys = new Set(
        compatibleOperators
          .map((item) =>
            buildFrontendOperatorIdentityKey({
              operatorId: item.id,
              operatorName: item.nome,
            })
          )
          .filter(Boolean)
      );
      const busyCompatibleOperatorKeys = new Set(
        overlappingAppointments
          .map((item) =>
            buildFrontendOperatorIdentityKey({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            })
          )
          .filter((key) => compatibleOperatorKeys.has(key))
      );
      const anonymousOverlaps = overlappingAppointments.filter((item) => {
        if (
          buildFrontendOperatorIdentityKey({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          })
        ) {
          return false;
        }

        return false;
      }).length;

      return Math.max(
        0,
        compatibleOperatorKeys.size - busyCompatibleOperatorKeys.size - anonymousOverlaps
      );
    },
    [currentCustomerIdentityNames, serviceUsesOperatorScheduling]
  );

  const orariNonDisponibili = useMemo(
    () =>
      new Set(
        displayTimeSlots.filter((slotTime) => {
          if (clienteInibito) {
            return true;
          }

          if (getDateAvailabilityInfo(effectiveAvailabilitySettings, data).closed) {
            return true;
          }

          if (
            isSlotWithinMinimumNotice({
              dateValue: data,
              timeValue: slotTime,
              minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES,
            })
          ) {
            return true;
          }

          if (!isTimeWithinDaySchedule(effectiveAvailabilitySettings, data, slotTime)) {
            return true;
          }

          if (
            servizio &&
            !doesServiceFitWithinDaySchedule({
              settings: effectiveAvailabilitySettings,
              dateValue: data,
              startTime: slotTime,
              durationMinutes: getServiceDuration(servizio, effectiveServizi),
            })
          ) {
            return true;
          }

          if (
            servizio &&
            doesServiceOverlapLunchBreak({
              settings: effectiveAvailabilitySettings,
              startTime: slotTime,
              durationMinutes: getServiceDuration(servizio, effectiveServizi),
            })
          ) {
            return true;
          }

          if (isSlotBlockedByOverride(effectiveAvailabilitySettings, data, slotTime)) {
            return true;
          }

          if (!servizio) {
            return appuntamentiDelGiorno.some((item) =>
              doesAppointmentOccupySlot(item, slotTime, effectiveServizi)
            );
          }

          return (
            getFrontendSlotAvailableCount({
              dateValue: data,
              startTime: slotTime,
              serviceName: servizio,
              selectedOperatorId: operatoreId || null,
              selectedOperatorName: operatoreNome || null,
              operators: effectiveOperatori,
              appointments: effectiveBlockingAppointments,
              services: effectiveServizi,
              settings: effectiveAvailabilitySettings,
            }) === 0
          );
        })
      ),
    [
      appuntamentiDelGiorno,
      clienteInibito,
      data,
      displayTimeSlots,
      effectiveAvailabilitySettings,
      effectiveBlockingAppointments,
      effectiveOperatori,
      effectiveServizi,
      getFrontendSlotAvailableCount,
      operatoreId,
      servizio,
    ]
  );

  useEffect(() => {
    if (!ora.trim() || !servizio.trim()) {
      return;
    }

    if (orariNonDisponibili.has(ora) || orariInConflitto.has(ora)) {
      setOra('');
    }
  }, [ora, orariInConflitto, orariNonDisponibili, servizio]);
  const servizioSelezionato = effectiveServizi.find((item) => item.nome === servizio) ?? null;
  const selectedDateAvailability = useMemo(
    () => getDateAvailabilityInfo(effectiveAvailabilitySettings, data),
    [effectiveAvailabilitySettings, data]
  );
  const isSelectedTimeWithinMinimumNotice =
    !!ora.trim() &&
    isSlotWithinMinimumNotice({
      dateValue: data,
      timeValue: ora,
      minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES,
    });
  const overlapsLunchBreakSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    doesServiceOverlapLunchBreak({
      settings: effectiveAvailabilitySettings,
      startTime: ora,
      durationMinutes: getServiceDuration(servizio, effectiveServizi),
    });
  const selectedServiceDuration = servizio.trim()
    ? getServiceDuration(servizio, effectiveServizi)
    : 0;
  const exceedsClosingTimeSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    !doesServiceFitWithinDaySchedule({
      settings: effectiveAvailabilitySettings,
      dateValue: data,
      startTime: ora,
      durationMinutes: selectedServiceDuration,
    });
  const selectedTimeRange = useMemo(() => {
    if (!servizio.trim() || !ora.trim()) return new Set<string>();

    const start = timeToMinutes(ora);
    const end = start + selectedServiceDuration;

    return new Set(
      displayTimeSlots.filter((slotTime) => {
        const slot = timeToMinutes(slotTime);
        return slot >= start && slot < end;
      })
    );
  }, [displayTimeSlots, ora, selectedServiceDuration, servizio]);

  const canSaveProfile =
    profile.nome.trim() !== '' &&
    profile.cognome.trim() !== '' &&
    profile.email.trim() !== '' &&
    profile.telefono.trim() !== '';
  const canRegisterClient = canSaveProfile && !!effectiveWorkspace && !isLoadingSalon;

  const canSendRequest =
    !!effectiveWorkspace &&
    !isLoadingSalon &&
    !bookingRequestSubmitting &&
    isRegistered &&
    servizio.trim() !== '' &&
    (!serviceUsesOperatorScheduling || !operatorSelectionRequired || operatoreId.trim() !== '') &&
    ora.trim() !== '' &&
    !selectedDateAvailability.closed &&
    !clienteInibito &&
    !isSelectedTimeWithinMinimumNotice &&
    !exceedsClosingTimeSelection &&
    !overlapsLunchBreakSelection &&
    !richiestaInConflitto &&
    !exactSlotRequestAlreadyPresent;
  const canChooseDay = !!effectiveWorkspace && servizio.trim() !== '';
  const canChooseOperator = canChooseDay && !selectedDateAvailability.closed;
  const canChooseTime =
    canChooseOperator &&
    (!serviceUsesOperatorScheduling || !operatorSelectionRequired || operatoreId.trim() !== '');
  const canWriteNote = canChooseTime && ora.trim() !== '';
  const frontendBookingNeedsSalonLoad =
    isRegistered &&
    isBookingStarted &&
    !isCurrentWorkspaceSalon &&
    (isLoadingSalon || !publicSalonState);
  const isOperatorStepHighlighted =
    serviceUsesOperatorScheduling && operatorSelectionRequired && canChooseOperator && !operatoreId.trim();
  const guidedSlotsActive =
    canChooseTime &&
    !!servizio.trim() &&
    !clienteInibito &&
    effectiveAvailabilitySettings.guidedSlotsEnabled;
  const guidedSlotsStrategy = effectiveAvailabilitySettings.guidedSlotsStrategy;
  const guidedSlotsVisibility = effectiveAvailabilitySettings.guidedSlotsVisibility;

  const orariOccupati = useMemo(
    () =>
      new Set(
        displayTimeSlots.filter((slotTime) => {
          if (!servizio.trim()) {
            return appuntamentiDelGiorno.some((item) =>
              doesAppointmentOccupySlot(item, slotTime, effectiveServizi)
            );
          }

          return hasFrontendSlotSelectionConflict({
            dateValue: data,
            startTime: slotTime,
            serviceName: servizio,
            selectedOperatorId: operatoreId || null,
            operators: effectiveOperatori,
            appointments: effectiveBlockingAppointments,
            services: effectiveServizi,
            settings: effectiveAvailabilitySettings,
          });
        })
      ),
    [
      appuntamentiDelGiorno,
      data,
      displayTimeSlots,
      effectiveAvailabilitySettings,
      effectiveBlockingAppointments,
      effectiveOperatori,
      effectiveServizi,
      hasFrontendSlotSelectionConflict,
      operatoreId,
      servizio,
    ]
  );

  const orariOccupatiDiretti = useMemo(
    () =>
      new Set(
        displayTimeSlots.filter((slotTime) => {
          if (!servizio.trim()) {
            return appuntamentiDelGiorno.some((item) =>
              doesAppointmentOccupySlot(item, slotTime, effectiveServizi)
            );
          }

          return effectiveBlockingAppointments.some((item) => {
            if ((item.data ?? getTodayDateString()) !== data) {
              return false;
            }

            if (!doesAppointmentOccupySlot(item, slotTime, effectiveServizi)) {
              return false;
            }

            if (!serviceUsesOperatorScheduling) {
              return doesExistingFrontendBookingBlockSelectedService({
                selectedServiceName: servizio,
                existingServiceName: item.servizio,
                existingMachineryIds: item.macchinarioIds,
                services: effectiveServizi,
              });
            }

            const { operatorId: existingOperatorId, operatorName: existingOperatorName } =
              normalizeFrontendOperatorIdentity({
                operatorId: item.operatoreId,
                operatorName: item.operatoreNome,
              });

            if (!existingOperatorId && !existingOperatorName) {
              return false;
            }

            return matchesOperatorIdentity({
              appointmentOperatorId: existingOperatorId,
              appointmentOperatorName: existingOperatorName,
              selectedOperatorId: operatoreId || null,
              selectedOperatorName: operatoreNome || null,
            });
          });
        })
      ),
    [
      appuntamentiDelGiorno,
      data,
      displayTimeSlots,
      doesAppointmentOccupySlot,
      effectiveBlockingAppointments,
      effectiveServizi,
      operatoreId,
      operatoreNome,
      serviceUsesOperatorScheduling,
      servizio,
    ]
  );
  const isFrontendSlotBookable = useCallback(
    (slotTime: string) =>
      canChooseTime &&
      !!servizio.trim() &&
      !orariNonDisponibili.has(slotTime) &&
      !orariInConflitto.has(slotTime) &&
      !orariOccupati.has(slotTime) &&
      !orariOccupatiDiretti.has(slotTime),
    [
      canChooseTime,
      orariInConflitto,
      orariNonDisponibili,
      orariOccupati,
      orariOccupatiDiretti,
      servizio,
    ]
  );
  const bookableFrontendTimeSlots = useMemo(
    () => displayTimeSlots.filter((slotTime) => isFrontendSlotBookable(slotTime)),
    [displayTimeSlots, isFrontendSlotBookable]
  );
  const guidedRecommendedTimeSlots = useMemo(() => {
    if (!guidedSlotsActive || !bookableFrontendTimeSlots.length || !servizio.trim()) {
      return [];
    }

    const slotIntervalMinutes = getSlotIntervalForDate(effectiveAvailabilitySettings, data);
    const availableBlocks = buildGuidedSlotBlocks(bookableFrontendTimeSlots, slotIntervalMinutes);
    const selectedDuration = getServiceDuration(servizio, effectiveServizi);

    const scoredSlots = bookableFrontendTimeSlots
      .map((slotTime) => {
        const block = availableBlocks.find((item) => item.slots.includes(slotTime));
        if (!block) {
          return {
            slotTime,
            score: Number.NEGATIVE_INFINITY,
            blockSize: 0,
            remainingBefore: 0,
            remainingAfter: 0,
            preservedLargestChunk: 0,
            fillsGapExactly: false,
            startsAtEdge: false,
            touchesEdge: false,
            createsSplit: false,
          };
        }

        const serviceSlots = Math.max(
          1,
          Math.ceil(selectedDuration / Math.max(slotIntervalMinutes, 15))
        );
        const slotIndex = block.slots.indexOf(slotTime);
        const remainingBefore = slotIndex;
        const remainingAfter = Math.max(0, block.slots.length - slotIndex - serviceSlots);
        const fillsGapExactly = remainingBefore === 0 && remainingAfter === 0;
        const startsAtEdge = remainingBefore === 0;
        const touchesEdge = startsAtEdge || remainingAfter === 0;
        const createsSplit = remainingBefore > 0 && remainingAfter > 0;
        const preservedLargestChunk = Math.max(remainingBefore, remainingAfter);

        return {
          slotTime,
          score: scoreGuidedSlot({
            slotTime,
            block,
            serviceDurationMinutes: selectedDuration,
            intervalMinutes: slotIntervalMinutes,
            strategy: guidedSlotsStrategy as GuidedSlotStrategy,
          }),
          blockSize: block.slots.length,
          remainingBefore,
          remainingAfter,
          preservedLargestChunk,
          fillsGapExactly,
          startsAtEdge,
          touchesEdge,
          createsSplit,
        };
      });

    const scoredSlotsSorted = [...scoredSlots].sort((first, second) => {
      if (guidedSlotsStrategy === 'protect_long_services') {
        if (Number(first.createsSplit) !== Number(second.createsSplit)) {
          return Number(first.createsSplit) - Number(second.createsSplit);
        }
        if (second.preservedLargestChunk !== first.preservedLargestChunk) {
          return second.preservedLargestChunk - first.preservedLargestChunk;
        }
        if (Number(second.startsAtEdge) !== Number(first.startsAtEdge)) {
          return Number(second.startsAtEdge) - Number(first.startsAtEdge);
        }
        if (Number(second.touchesEdge) !== Number(first.touchesEdge)) {
          return Number(second.touchesEdge) - Number(first.touchesEdge);
        }
        if (second.remainingAfter !== first.remainingAfter) {
          return second.remainingAfter - first.remainingAfter;
        }
      }

      if (guidedSlotsStrategy === 'fill_gaps') {
        if (Number(second.fillsGapExactly) !== Number(first.fillsGapExactly)) {
          return Number(second.fillsGapExactly) - Number(first.fillsGapExactly);
        }
        if (first.blockSize !== second.blockSize) {
          return first.blockSize - second.blockSize;
        }
        if (first.preservedLargestChunk !== second.preservedLargestChunk) {
          return first.preservedLargestChunk - second.preservedLargestChunk;
        }
        if (Number(first.createsSplit) !== Number(second.createsSplit)) {
          return Number(first.createsSplit) - Number(second.createsSplit);
        }
        if (Number(second.touchesEdge) !== Number(first.touchesEdge)) {
          return Number(second.touchesEdge) - Number(first.touchesEdge);
        }
      }

      if (guidedSlotsStrategy === 'balanced') {
        const balanceDelta =
          Math.abs(first.remainingBefore - first.remainingAfter) -
          Math.abs(second.remainingBefore - second.remainingAfter);
        if (balanceDelta !== 0) {
          return balanceDelta;
        }
        if (Number(second.touchesEdge) !== Number(first.touchesEdge)) {
          return Number(second.touchesEdge) - Number(first.touchesEdge);
        }
        if (Number(first.createsSplit) !== Number(second.createsSplit)) {
          return Number(first.createsSplit) - Number(second.createsSplit);
        }
      }

      const scoreDelta = second.score - first.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return timeToMinutes(first.slotTime) - timeToMinutes(second.slotTime);
    });

    const preferredSlots = scoredSlotsSorted.filter((item) => {
      if (guidedSlotsStrategy === 'protect_long_services') {
        return !item.createsSplit || item.touchesEdge;
      }

      if (guidedSlotsStrategy === 'fill_gaps') {
        return item.fillsGapExactly || item.blockSize <= 2 || !item.createsSplit;
      }

      return item.touchesEdge || !item.createsSplit;
    });

    const candidateSlots =
      preferredSlots.length >= MAX_GUIDED_SLOT_RECOMMENDATIONS
        ? preferredSlots
        : scoredSlotsSorted;

    if (candidateSlots.length <= MAX_GUIDED_SLOT_RECOMMENDATIONS) {
      return candidateSlots.map((item) => item.slotTime);
    }

    return candidateSlots
      .slice(0, MAX_GUIDED_SLOT_RECOMMENDATIONS)
      .map((item) => item.slotTime);
  }, [
    bookableFrontendTimeSlots,
    data,
    effectiveAvailabilitySettings,
    effectiveServizi,
    guidedSlotsActive,
    guidedSlotsStrategy,
    servizio,
  ]);
  const hasGuidedRecommendations = guidedRecommendedTimeSlots.length > 0;
  const shouldShowGuidedRecommendations = guidedSlotsActive && hasGuidedRecommendations;
  const shouldShowOnlyRecommendedSlots =
    shouldShowGuidedRecommendations && guidedSlotsVisibility === 'recommended_only';
  const shouldShowExpandedTimeGrid = !guidedSlotsActive
    ? true
    : guidedSlotsVisibility === 'recommended_only'
      ? !shouldShowOnlyRecommendedSlots
      : guidedSlotsVisibility === 'recommended_and_all'
        ? true
        : !shouldShowGuidedRecommendations || showAllGuidedSlots;
  const visibleExpandedFrontendTimeSlots = useMemo(() => {
    if (!shouldShowExpandedTimeGrid) {
      return [];
    }

    if (!shouldShowGuidedRecommendations) {
      return displayTimeSlots;
    }

    if (guidedSlotsVisibility === 'recommended_only') {
      return [];
    }

    const recommendedSlotSet = new Set(guidedRecommendedTimeSlots);
    const remainingSlots = displayTimeSlots.filter((slotTime) => !recommendedSlotSet.has(slotTime));

    return remainingSlots;
  }, [
    displayTimeSlots,
    guidedRecommendedTimeSlots,
    guidedSlotsVisibility,
    shouldShowExpandedTimeGrid,
    shouldShowGuidedRecommendations,
  ]);
  const shouldRenderExpandedTimeGrid = visibleExpandedFrontendTimeSlots.length > 0;
  const frontendTimeSlotUnavailableReasonMap = useMemo(() => {
    const map = new Map<
      string,
      {
        pill: string;
        meta: string;
      }
    >();

    displayTimeSlots.forEach((slotTime) => {
      if (clienteInibito) {
        map.set(slotTime, { pill: 'Occupato', meta: 'Gia prenotato' });
        return;
      }

      if (getDateAvailabilityInfo(effectiveAvailabilitySettings, data).closed) {
        map.set(slotTime, { pill: 'Chiuso', meta: 'Salone chiuso' });
        return;
      }

      if (
        isSlotWithinMinimumNotice({
          dateValue: data,
          timeValue: slotTime,
          minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES,
        })
      ) {
        map.set(slotTime, { pill: 'Preavviso', meta: 'Troppo vicino' });
        return;
      }

      if (!isTimeWithinDaySchedule(effectiveAvailabilitySettings, data, slotTime)) {
        map.set(slotTime, { pill: 'Chiuso', meta: 'Fuori orario' });
        return;
      }

      if (
        servizio &&
        !doesServiceFitWithinDaySchedule({
          settings: effectiveAvailabilitySettings,
          dateValue: data,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio, effectiveServizi),
        })
      ) {
        map.set(slotTime, { pill: 'Sfora', meta: 'Oltre chiusura' });
        return;
      }

      if (
        servizio &&
        doesServiceOverlapLunchBreak({
          settings: effectiveAvailabilitySettings,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio, effectiveServizi),
        })
      ) {
        map.set(slotTime, { pill: 'Pausa', meta: 'Pausa pranzo' });
        return;
      }

      if (isSlotBlockedByOverride(effectiveAvailabilitySettings, data, slotTime)) {
        map.set(slotTime, { pill: 'Bloccato', meta: 'Blocco manuale' });
        return;
      }

      if (!servizio) {
        if (
          appuntamentiDelGiorno.some((item) =>
            doesAppointmentOccupySlot(item, slotTime, effectiveServizi)
          )
        ) {
          map.set(slotTime, { pill: 'Occupato', meta: 'Gia prenotato' });
        }
        return;
      }

      if (orariOccupatiDiretti.has(slotTime)) {
        map.set(slotTime, { pill: 'Occupato', meta: 'Gia prenotato' });
        return;
      }

      if (orariInConflitto.has(slotTime) || orariOccupati.has(slotTime) || orariNonDisponibili.has(slotTime)) {
        map.set(slotTime, { pill: 'Sovrapp.', meta: 'Si sovrappone' });
      }
    });

    return map;
  }, [
    appuntamentiDelGiorno,
    clienteInibito,
    data,
    displayTimeSlots,
    effectiveAvailabilitySettings,
    effectiveServizi,
    orariInConflitto,
    orariNonDisponibili,
    orariOccupati,
    orariOccupatiDiretti,
    servizio,
  ]);

  const canAnySlotBeBooked = useMemo(
    () => displayTimeSlots.some((slotTime) => isFrontendSlotBookable(slotTime)),
    [displayTimeSlots, isFrontendSlotBookable]
  );

  useEffect(() => {
    setShowAllGuidedSlots(false);
  }, [data, operatoreId, servizio, guidedSlotsStrategy, guidedSlotsVisibility, guidedSlotsActive]);

  const waitlistOperatorKey = useMemo(
    () => (operatoreId.trim() || operatoreNome.trim().toLowerCase() || 'salone').trim(),
    [operatoreId, operatoreNome]
  );

  const buildWaitlistKey = useCallback(
    (slotTime: string, operatorKeyOverride?: string | null) =>
      `${data}|${slotTime}|${servizio.trim().toLowerCase()}|${(operatorKeyOverride ?? waitlistOperatorKey).trim() || 'salone'}`,
    [data, servizio, waitlistOperatorKey]
  );
  const buildWaitlistAlertIdentity = useCallback(
    ({
      appointmentDate,
      appointmentTime,
      serviceName,
      operatorId,
      operatorName,
    }: {
      appointmentDate?: string | null;
      appointmentTime?: string | null;
      serviceName?: string | null;
      operatorId?: string | null;
      operatorName?: string | null;
    }) =>
      [
        String(appointmentDate ?? '').trim(),
        String(appointmentTime ?? '').trim().slice(0, 5),
        String(serviceName ?? '').trim().toLowerCase(),
        String(operatorId ?? '').trim(),
        String(operatorName ?? '').trim().toLowerCase(),
      ].join('|'),
    []
  );

  const currentDayWaitlistSelectionKey = useMemo(
    () => `day:${data}|${servizio.trim().toLowerCase()}|${waitlistOperatorKey}`,
    [data, servizio, waitlistOperatorKey]
  );

  const loadWaitlistEntries = useCallback(async () => {
    const requestId = ++waitlistEntriesRequestRef.current;

    if (!effectiveWorkspace || !isRegistered || !profile.email.trim() || !profile.telefono.trim()) {
      if (requestId === waitlistEntriesRequestRef.current) {
        setWaitlistKeys(new Set());
      }
      return;
    }

    try {
      const { data: waitlistRows, error } = await supabase.rpc('get_public_slot_waitlist_entries', {
        p_salon_code: effectiveWorkspace.salonCode,
        p_customer_email: profile.email.trim().toLowerCase(),
        p_customer_phone: profile.telefono.trim(),
        p_appointment_date: data,
        p_requested_service_name: servizio.trim() || null,
        p_requested_operator_id: operatoreId.trim() || null,
        p_requested_operator_name: operatoreNome.trim() || null,
      });

      if (error) {
        console.log('Errore caricamento slot waitlist frontend:', error);
        return;
      }

      const nextKeys = new Set<string>();
      const byIdentity = new Map<string, SlotWaitlistEntry>();
      const getStatusPriority = (value?: string | null) => {
        const normalized = String(value ?? '')
          .trim()
          .toLowerCase();
        if (normalized === 'notified') return 4;
        if (normalized === 'expired') return 3;
        if (normalized === 'cancelled') return 2;
        if (normalized === 'waiting') return 1;
        return 0;
      };
      const getSortStamp = (item: SlotWaitlistEntry) =>
        Date.parse(
          String(item.updated_at ?? item.notified_at ?? item.expires_at ?? item.created_at ?? '').trim()
        ) || 0;

      (Array.isArray(waitlistRows) ? (waitlistRows as SlotWaitlistEntry[]) : []).forEach((item) => {
        const slotDate = String(item.appointment_date ?? '').trim();
        const slotTime = String(item.appointment_time ?? '').trim().slice(0, 5);
        const serviceName = String(item.requested_service_name ?? '').trim().toLowerCase();
        const operatorKey = (
          String(item.requested_operator_id ?? '').trim() ||
          String(item.requested_operator_name ?? '').trim().toLowerCase() ||
          'salone'
        ).trim();
        if (!slotDate || !slotTime || !serviceName) return;

        const identity = `${slotDate}|${slotTime}|${serviceName}|${operatorKey}`;
        const current = byIdentity.get(identity);
        if (!current) {
          byIdentity.set(identity, item);
          return;
        }

        const currentPriority = getStatusPriority(current.status);
        const nextPriority = getStatusPriority(item.status);
        const currentStamp = getSortStamp(current);
        const nextStamp = getSortStamp(item);

        if (
          nextPriority > currentPriority ||
          (nextPriority === currentPriority && nextStamp >= currentStamp)
        ) {
          byIdentity.set(identity, item);
        }
      });

      byIdentity.forEach((item, identity) => {
        const status = getDerivedWaitlistAlertStatus(item);
        if (status === 'waiting') {
          nextKeys.add(identity);
        }
      });
      if (requestId === waitlistEntriesRequestRef.current) {
        setWaitlistKeys(nextKeys);
      }
    } catch (error) {
      console.log('Errore fetch slot waitlist frontend:', error);
    }
  }, [
    data,
    effectiveWorkspace,
    isRegistered,
    operatoreId,
    operatoreNome,
    profile.email,
    profile.telefono,
    servizio,
  ]);

  const loadSavedWaitlistAlerts = useCallback(async () => {
    const requestId = ++savedWaitlistAlertsRequestRef.current;

    if (!effectiveWorkspace || !isRegistered || !profile.email.trim() || !profile.telefono.trim()) {
      if (requestId === savedWaitlistAlertsRequestRef.current) {
        setSavedWaitlistAlerts([]);
      }
      return;
    }

    try {
      const { data: waitlistRows, error } = await supabase.rpc('get_public_customer_waitlist_alerts', {
        p_salon_code: effectiveWorkspace.salonCode,
        p_customer_email: profile.email.trim().toLowerCase(),
        p_customer_phone: profile.telefono.trim(),
      });

      if (error) {
        console.log('Errore caricamento archivio avvisi frontend:', error);
        return;
      }

      if (requestId === savedWaitlistAlertsRequestRef.current) {
        setSavedWaitlistAlerts(
          Array.isArray(waitlistRows) ? (waitlistRows as SlotWaitlistEntry[]) : []
        );
      }
    } catch (error) {
      console.log('Errore fetch archivio avvisi frontend:', error);
    }
  }, [effectiveWorkspace, isRegistered, profile.email, profile.telefono]);

  useEffect(() => {
    void loadWaitlistEntries();
  }, [loadWaitlistEntries]);

  useEffect(() => {
    void loadSavedWaitlistAlerts();
  }, [loadSavedWaitlistAlerts]);

  const scheduleSettledWaitlistRefresh = useCallback(
    (delayMs = WAITLIST_MUTATION_SETTLE_MS) => {
      waitlistRefreshHoldUntilRef.current = Date.now() + delayMs;

      if (waitlistRefreshTimeoutRef.current) {
        clearTimeout(waitlistRefreshTimeoutRef.current);
      }

      waitlistRefreshTimeoutRef.current = setTimeout(() => {
        waitlistRefreshTimeoutRef.current = null;
        void loadWaitlistEntries();
        void loadSavedWaitlistAlerts();
      }, delayMs);
    },
    [loadSavedWaitlistAlerts, loadWaitlistEntries]
  );

  useEffect(() => {
    return () => {
      if (waitlistRefreshTimeoutRef.current) {
        clearTimeout(waitlistRefreshTimeoutRef.current);
      }
    };
  }, []);

  const activeWaitlistAlertKeys = useMemo(() => {
    const keys = new Set<string>();

    savedWaitlistAlerts.forEach((item) => {
      const status = getDerivedWaitlistAlertStatus(item);
      if (!(status === 'waiting' || status === 'notified')) {
        return;
      }

      const slotDate = String(item.appointment_date ?? '').trim();
      const slotTime = String(item.appointment_time ?? '').trim().slice(0, 5);
      const serviceName = String(item.requested_service_name ?? '').trim().toLowerCase();
      const operatorKey = (
        String(item.requested_operator_id ?? '').trim() ||
        String(item.requested_operator_name ?? '').trim().toLowerCase() ||
        'salone'
      ).trim();

      if (!slotDate || !slotTime || !serviceName) {
        return;
      }

      keys.add(`${slotDate}|${slotTime}|${serviceName}|${operatorKey}`);
    });

    return keys;
  }, [savedWaitlistAlerts]);

  const submitWaitlistForSlots = useCallback(
    async ({
      slotTimes,
      actionKey,
      successMessage,
    }: {
      slotTimes: string[];
      actionKey: string;
      successMessage: (slotCount: number, notifiedCount: number) => string;
    }): Promise<boolean> => {
      if (!effectiveWorkspace) {
        Alert.alert('Salone non trovato', 'Riapri la pagina del salone e riprova.');
        return false;
      }

      if (!isRegistered) {
        Alert.alert('Registrazione richiesta', 'Registrati o accedi prima di metterti in lista d’attesa.');
        return false;
      }

      if (!servizio.trim()) {
        Alert.alert('Seleziona un servizio', 'Prima scegli il servizio per cui vuoi essere avvisato.');
        return false;
      }

      const normalizedSlotTimes = Array.from(
        new Set(slotTimes.map((item) => item.trim()).filter(Boolean))
      );
      const pendingSlotTimes = normalizedSlotTimes.filter(
        (slotTime) => !activeWaitlistAlertKeys.has(buildWaitlistKey(slotTime))
      );

      if (pendingSlotTimes.length === 0) {
        Alert.alert('Avviso già attivo', 'Hai già attivato l’avviso per questa disponibilità.');
        return false;
      }

      waitlistEntriesRequestRef.current += 1;
      savedWaitlistAlertsRequestRef.current += 1;
      waitlistRefreshHoldUntilRef.current = Date.now() + WAITLIST_MUTATION_SETTLE_MS;
      setWaitlistSubmittingKeys((current) => {
        const next = new Set(current);
        next.add(actionKey);
        return next;
      });

      try {
        const savedKeys: string[] = [];
        const savedEntries: Array<{ slotTime: string; status: string }> = [];
        let notifiedCount = 0;

        for (const slotTime of pendingSlotTimes) {
          const waitlistKey = buildWaitlistKey(slotTime);
          const { data: waitlistResult, error } = await supabase.rpc('join_public_slot_waitlist', {
            p_salon_code: effectiveWorkspace.salonCode,
            p_requested_service_name: servizio,
            p_requested_duration_minutes: getServiceDuration(servizio, effectiveServizi),
            p_requested_operator_id: operatoreId.trim() || null,
            p_requested_operator_name: operatoreNome.trim() || null,
            p_appointment_date: data,
            p_appointment_time: slotTime,
            p_customer_name: profile.nome.trim(),
            p_customer_surname: profile.cognome.trim(),
            p_customer_email: profile.email.trim().toLowerCase(),
            p_customer_phone: profile.telefono.trim(),
            p_customer_instagram: profile.instagram.trim() || null,
            p_notes: note.trim() || null,
          });

          if (error) {
            console.log('Errore inserimento waitlist slot:', error);
            continue;
          }

          savedKeys.push(waitlistKey);

          const responseStatus =
            waitlistResult && typeof waitlistResult === 'object' && !Array.isArray(waitlistResult)
              ? String((waitlistResult as Record<string, unknown>).status ?? '').trim()
              : '';
          savedEntries.push({
            slotTime,
            status: responseStatus || 'waiting',
          });

          if (responseStatus === 'notified') {
            notifiedCount += 1;
          }
        }

        if (savedKeys.length === 0) {
          Alert.alert('Lista d’attesa non disponibile', 'Non sono riuscito a salvare la richiesta di avviso.');
          return false;
        }

        setWaitlistKeys((current) => {
          const next = new Set(current);
          savedKeys.forEach((item) => next.add(item));
          return next;
        });

        setSavedWaitlistAlerts((current) => {
          const byIdentity = new Map<string, SlotWaitlistEntry>();
          current.forEach((item) => {
            byIdentity.set(
              buildWaitlistAlertIdentity({
                appointmentDate: item.appointment_date,
                appointmentTime: item.appointment_time,
                serviceName: item.requested_service_name,
                operatorId: item.requested_operator_id,
                operatorName: item.requested_operator_name,
              }),
              item
            );
          });

          savedEntries.forEach(({ slotTime, status }) => {
            const identity = buildWaitlistAlertIdentity({
              appointmentDate: data,
              appointmentTime: slotTime,
              serviceName: servizio,
              operatorId: operatoreId.trim() || null,
              operatorName: operatoreNome.trim() || null,
            });
            const currentItem = byIdentity.get(identity);
            byIdentity.set(identity, {
              ...currentItem,
              id: currentItem?.id ?? identity,
              appointment_date: data,
              appointment_time: slotTime,
              requested_service_name: servizio,
              requested_operator_id: operatoreId.trim() || null,
              requested_operator_name: operatoreNome.trim() || null,
              status,
              created_at: currentItem?.created_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          });

          return Array.from(byIdentity.values()).sort((first, second) =>
            String(second.updated_at ?? second.notified_at ?? second.created_at ?? '').localeCompare(
              String(first.updated_at ?? first.notified_at ?? first.created_at ?? '')
            )
          );
        });

        Alert.alert(
          notifiedCount > 0 ? 'Slot disponibile' : 'Avviso attivato',
          successMessage(savedKeys.length, notifiedCount)
        );
        return true;
      } catch (error) {
        console.log('Errore waitlist slot frontend:', error);
        Alert.alert('Lista d’attesa non disponibile', 'Non sono riuscito a salvare la richiesta di avviso.');
        return false;
      } finally {
        scheduleSettledWaitlistRefresh();
        setWaitlistSubmittingKeys((current) => {
          const next = new Set(current);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [
      buildWaitlistKey,
      data,
      effectiveServizi,
      effectiveWorkspace,
      isRegistered,
      note,
      operatoreId,
      operatoreNome,
      profile.cognome,
      profile.email,
      profile.instagram,
      profile.nome,
      profile.telefono,
      buildWaitlistAlertIdentity,
      setSavedWaitlistAlerts,
      servizio,
      activeWaitlistAlertKeys,
    ]
  );

  const resolveFrontendWorkspaceId = useCallback(async () => {
    const workspace = effectiveWorkspace;
    let workspaceId = workspace?.id && isUuidValue(workspace.id) ? workspace.id : '';

    if (!workspaceId && workspace?.salonCode) {
      const snapshot = await resolveSalonByCode(workspace.salonCode);
      if (snapshot?.workspace?.id && isUuidValue(snapshot.workspace.id)) {
        workspaceId = snapshot.workspace.id;
        if (!isCurrentWorkspaceSalon) {
          applyMergedPublicSalonState(snapshot);
        }
      }
    }

    return workspaceId;
  }, [effectiveWorkspace?.id, effectiveWorkspace?.salonCode, isCurrentWorkspaceSalon, resolveSalonByCode]);

  const cancelWaitlistForSlots = useCallback(
    async ({
      slotTimes,
      actionKey,
      successMessage,
      suppressSuccessAlert,
    }: {
      slotTimes: string[];
      actionKey: string;
      successMessage: (cancelledCount: number) => string;
      suppressSuccessAlert?: boolean;
    }): Promise<boolean> => {
      if (!effectiveWorkspace) {
        Alert.alert('Salone non trovato', 'Riapri la pagina del salone e riprova.');
        return false;
      }

      if (!isRegistered) {
        Alert.alert('Registrazione richiesta', 'Registrati o accedi prima di gestire gli avvisi.');
        return false;
      }

      if (!servizio.trim()) {
        Alert.alert('Seleziona un servizio', 'Prima scegli il servizio relativo all’avviso.');
        return false;
      }

      const normalizedSlotTimes = Array.from(new Set(slotTimes.map((item) => item.trim().slice(0, 5)).filter(Boolean)));
      const normalizedService = servizio.trim().toLowerCase();
      const normalizedOperatorId = operatoreId.trim();
      const normalizedOperatorName = operatoreNome.trim().toLowerCase();

      const matchingAlerts = savedWaitlistAlerts.filter((item) => {
        const itemDate = String(item.appointment_date ?? '').trim();
        const itemTime = String(item.appointment_time ?? '').trim().slice(0, 5);
        const itemService = String(item.requested_service_name ?? '').trim().toLowerCase();
        const itemStatus = String(item.status ?? '').trim().toLowerCase();
        const itemOperatorId = String(item.requested_operator_id ?? '').trim();
        const itemOperatorName = String(item.requested_operator_name ?? '').trim().toLowerCase();

        if (itemDate !== data || !normalizedSlotTimes.includes(itemTime) || itemService !== normalizedService) {
          return false;
        }

        if (!(itemStatus === 'waiting' || itemStatus === 'notified')) {
          return false;
        }

        if (normalizedOperatorId) {
          return itemOperatorId === normalizedOperatorId;
        }

        if (normalizedOperatorName) {
          return itemOperatorName === normalizedOperatorName;
        }

        return !itemOperatorId && !itemOperatorName;
      });

      if (matchingAlerts.length === 0) {
        Alert.alert('Avviso non trovato', 'Non ho trovato un avviso attivo da annullare per questi orari.');
        return false;
      }

      waitlistEntriesRequestRef.current += 1;
      savedWaitlistAlertsRequestRef.current += 1;
      waitlistRefreshHoldUntilRef.current = Date.now() + WAITLIST_MUTATION_SETTLE_MS;
      setWaitlistSubmittingKeys((current) => {
        const next = new Set(current);
        next.add(actionKey);
        return next;
      });

      try {
        const alertIds = matchingAlerts.map((item) => item.id).filter(Boolean);
        const { data: cancelledCount, error } = await supabase.rpc('cancel_public_slot_waitlist_alerts', {
          p_salon_code: effectiveWorkspace.salonCode,
          p_waitlist_ids: alertIds,
          p_customer_email: profile.email.trim().toLowerCase(),
          p_customer_phone: profile.telefono.trim(),
        });

        if (error) {
          console.log('Errore annullamento waitlist slot:', error);
          Alert.alert('Annullamento non riuscito', 'Non sono riuscito ad annullare l’avviso. Riprova tra un attimo.');
          return false;
        }

        if (!cancelledCount || Number(cancelledCount) <= 0) {
          Alert.alert('Avviso non trovato', 'Non ho trovato un avviso attivo da annullare. Aggiorna e riprova.');
          return false;
        }

        const cancelledKeys = new Set(
          matchingAlerts.map((item) => {
            const itemTime = String(item.appointment_time ?? '').trim().slice(0, 5);
            const itemOperatorKey = (
              String(item.requested_operator_id ?? '').trim() ||
              String(item.requested_operator_name ?? '').trim().toLowerCase() ||
              'salone'
            ).trim();
            return `${data}|${itemTime}|${normalizedService}|${itemOperatorKey}`;
          })
        );

        setWaitlistKeys((current) => {
          const next = new Set(current);
          cancelledKeys.forEach((item) => next.delete(item));
          return next;
        });
        setSavedWaitlistAlerts((current) =>
          current.filter((item) => !alertIds.includes(item.id))
        );

        const { data: refreshedWaitlistRows, error: refreshedWaitlistError } = await supabase.rpc(
          'get_public_slot_waitlist_entries',
          {
            p_salon_code: effectiveWorkspace.salonCode,
            p_customer_email: profile.email.trim().toLowerCase(),
            p_customer_phone: profile.telefono.trim(),
            p_appointment_date: data,
            p_requested_service_name: servizio.trim() || null,
            p_requested_operator_id: operatoreId.trim() || null,
            p_requested_operator_name: operatoreNome.trim() || null,
          }
        );

        if (!refreshedWaitlistError) {
          const nextKeys = new Set<string>();
          (Array.isArray(refreshedWaitlistRows) ? (refreshedWaitlistRows as SlotWaitlistEntry[]) : []).forEach((item) => {
            const status = String(item.status ?? '').trim().toLowerCase();
            const slotDate = String(item.appointment_date ?? '').trim();
            const slotTime = String(item.appointment_time ?? '').trim().slice(0, 5);
            const serviceName = String(item.requested_service_name ?? '').trim().toLowerCase();
            const operatorKey = (
              String(item.requested_operator_id ?? '').trim() ||
              String(item.requested_operator_name ?? '').trim().toLowerCase() ||
              'salone'
            ).trim();
            if (!slotDate || !slotTime || !serviceName || status !== 'waiting') return;
            nextKeys.add(`${slotDate}|${slotTime}|${serviceName}|${operatorKey}`);
          });
          setWaitlistKeys(nextKeys);
        }

        if (!suppressSuccessAlert) {
          Alert.alert('Avviso annullato', successMessage(Number(cancelledCount)));
        }
        return true;
      } catch (error) {
        console.log('Errore annullamento waitlist frontend:', error);
        Alert.alert('Annullamento non riuscito', 'Non sono riuscito ad annullare l’avviso. Riprova tra un attimo.');
        return false;
      } finally {
        scheduleSettledWaitlistRefresh();
        setWaitlistSubmittingKeys((current) => {
          const next = new Set(current);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [
      data,
      effectiveWorkspace,
      isRegistered,
      operatoreId,
      operatoreNome,
      savedWaitlistAlerts,
      servizio,
      profile.email,
      profile.telefono,
    ]
  );

  const mieRichieste = useMemo(() => {
    if (!isRegistered) return [];

    const normalizedEmail = profile.email.trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(profile.telefono.trim());

    return effectiveRichieste
      .filter(
        (item) => {
          const sameEmail = item.email.trim().toLowerCase() === normalizedEmail;
          const samePhone = limitPhoneToTenDigits(item.telefono) === normalizedPhone;
          return sameEmail || samePhone;
        }
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [effectiveRichieste, isRegistered, profile.email, profile.telefono]);
  const clientOwnsOccupiedSlot = useCallback(
    (slotTime: string) => {
      const hasOwnRequestAtSlot = mieRichieste.some(
        (item) =>
          item.data === data &&
          doesAppointmentOccupySlot(
            {
              ora: item.ora,
              servizio: item.servizio,
              durataMinuti: item.durataMinuti,
            },
            slotTime,
            effectiveServizi
          ) &&
          (item.stato === 'In attesa' || item.stato === 'Accettata')
      );

      if (hasOwnRequestAtSlot) {
        return true;
      }

      return effectiveBlockingAppointments.some((item) => {
        const itemDate = item.data ?? '';
        return (
          itemDate === data &&
          doesAppointmentOccupySlot(item, slotTime, effectiveServizi) &&
          Array.from(currentCustomerIdentityNames).some((candidateName) =>
            matchesCustomerDisplayName(item.cliente, candidateName)
          )
        );
      });
    },
    [
      currentCustomerIdentityNames,
      data,
      doesAppointmentOccupySlot,
      effectiveBlockingAppointments,
      effectiveServizi,
      mieRichieste,
    ]
  );

  const isBlockingAppointmentOwnedByCurrentCustomer = useCallback(
    (item: PublicSalonState['appuntamenti'][number] | PublicBookingOccupancyItem) =>
      Array.from(currentCustomerIdentityNames).some((candidateName) =>
        matchesCustomerDisplayName(item.cliente, candidateName)
      ),
    [currentCustomerIdentityNames]
  );

  const slotHasVisibleAppointmentByOtherCustomer = useCallback(
    (slotTime: string) =>
      appuntamentiRealiDelGiorno.some((item) => {
        if (!doesAppointmentOccupySlot(item, slotTime, effectiveServizi)) {
          return false;
        }

        if (isBlockingAppointmentOwnedByCurrentCustomer(item)) {
          return false;
        }

        if (!serviceUsesOperatorScheduling) {
          return doesExistingFrontendBookingBlockSelectedService({
            selectedServiceName: servizio,
            existingServiceName: item.servizio,
            existingMachineryIds: item.macchinarioIds,
            services: effectiveServizi,
          });
        }

        const { operatorId: existingOperatorId, operatorName: existingOperatorName } =
          normalizeFrontendOperatorIdentity({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          });

        if (!existingOperatorId && !existingOperatorName) {
          return false;
        }

        return matchesOperatorIdentity({
          appointmentOperatorId: existingOperatorId,
          appointmentOperatorName: existingOperatorName,
          selectedOperatorId: operatoreId || null,
          selectedOperatorName: operatoreNome || null,
        });
      }),
    [
      appuntamentiRealiDelGiorno,
      doesAppointmentOccupySlot,
      doesExistingFrontendBookingBlockSelectedService,
      effectiveServizi,
      isBlockingAppointmentOwnedByCurrentCustomer,
      operatoreId,
      operatoreNome,
      serviceUsesOperatorScheduling,
      servizio,
    ]
  );

  const slotHasDirectBlockingAppointmentByOtherCustomer = useCallback(
    (slotTime: string) =>
      effectiveBlockingAppointments.some((item) => {
        if ((item.data ?? getTodayDateString()) !== data) {
          return false;
        }

        if (!doesAppointmentOccupySlot(item, slotTime, effectiveServizi)) {
          return false;
        }

        if (isBlockingAppointmentOwnedByCurrentCustomer(item)) {
          return false;
        }

        if (!serviceUsesOperatorScheduling) {
          return doesExistingFrontendBookingBlockSelectedService({
            selectedServiceName: servizio,
            existingServiceName: item.servizio,
            existingMachineryIds: item.macchinarioIds,
            services: effectiveServizi,
          });
        }

        const { operatorId: existingOperatorId, operatorName: existingOperatorName } =
          normalizeFrontendOperatorIdentity({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          });

        if (!existingOperatorId && !existingOperatorName) {
          return false;
        }

        return matchesOperatorIdentity({
          appointmentOperatorId: existingOperatorId,
          appointmentOperatorName: existingOperatorName,
          selectedOperatorId: operatoreId || null,
          selectedOperatorName: operatoreNome || null,
        });
      }),
    [
      data,
      doesAppointmentOccupySlot,
      doesExistingFrontendBookingBlockSelectedService,
      effectiveBlockingAppointments,
      effectiveServizi,
      isBlockingAppointmentOwnedByCurrentCustomer,
      operatoreId,
      operatoreNome,
      serviceUsesOperatorScheduling,
      servizio,
    ]
  );

  const waitlistableOccupiedSlots = useMemo(
    () =>
      displayTimeSlots.filter((slotTime) => {
        if (
          !canChooseTime ||
          !isRegistered ||
          !servizio.trim() ||
          clienteInibito ||
          !orariOccupatiDiretti.has(slotTime)
        ) {
          return false;
        }

        if (
          isSlotWithinMinimumNotice({
            dateValue: data,
            timeValue: slotTime,
            minimumNoticeMinutes: DEFAULT_MINIMUM_NOTICE_MINUTES,
          })
        ) {
          return false;
        }

        const alreadyRequestedByCustomer = mieRichieste.some(
          (request) =>
            request.data === data &&
            request.ora === slotTime &&
            (request.stato === 'In attesa' || request.stato === 'Accettata')
        );

        if (alreadyRequestedByCustomer) {
          return false;
        }

        if (clientOwnsOccupiedSlot(slotTime)) {
          return false;
        }

        return slotHasVisibleAppointmentByOtherCustomer(slotTime);
      }),
    [
      canChooseTime,
      clientOwnsOccupiedSlot,
      clienteInibito,
      data,
      isRegistered,
      mieRichieste,
      orariOccupatiDiretti,
      slotHasVisibleAppointmentByOtherCustomer,
      servizio,
      displayTimeSlots,
    ]
  );

  const currentDayActiveWaitlistAlerts = useMemo(() => {
    if (!servizio.trim()) {
      return [];
    }

    const normalizedService = servizio.trim().toLowerCase();
    const normalizedOperatorId = operatoreId.trim();
    const normalizedOperatorName = operatoreNome.trim().toLowerCase();

    return savedWaitlistAlerts.filter((item) => {
      const itemDate = String(item.appointment_date ?? '').trim();
      const itemService = String(item.requested_service_name ?? '').trim().toLowerCase();
      const itemStatus = getDerivedWaitlistAlertStatus(item);
      const itemOperatorId = String(item.requested_operator_id ?? '').trim();
      const itemOperatorName = String(item.requested_operator_name ?? '').trim().toLowerCase();

      if (itemDate !== data || itemService !== normalizedService) {
        return false;
      }

      if (!(itemStatus === 'waiting' || itemStatus === 'notified')) {
        return false;
      }

      if (normalizedOperatorId) {
        return itemOperatorId === normalizedOperatorId;
      }

      if (normalizedOperatorName) {
        return itemOperatorName === normalizedOperatorName;
      }

      return !itemOperatorId && !itemOperatorName;
    });
  }, [
    data,
    operatoreId,
    operatoreNome,
    savedWaitlistAlerts,
    servizio,
  ]);

  const currentDayActiveWaitlistSlotTimes = useMemo(
    () =>
      Array.from(
        new Set(
          currentDayActiveWaitlistAlerts
            .map((item) => String(item.appointment_time ?? '').trim().slice(0, 5))
            .filter(Boolean)
        )
      ),
    [currentDayActiveWaitlistAlerts]
  );

  const currentDayOptimisticWaitlistSlotTimes = useMemo(() => {
    const normalizedService = servizio.trim().toLowerCase();
    if (!data || !normalizedService) {
      return [];
    }

    return Array.from(
      new Set(
        Array.from(waitlistKeys)
          .map((key) => key.split('|'))
          .filter(
            (parts) =>
              parts.length >= 4 &&
              parts[0] === data &&
              parts[2] === normalizedService &&
              parts[3] === waitlistOperatorKey
          )
          .map((parts) => parts[1]?.trim().slice(0, 5))
          .filter(Boolean) as string[]
      )
    );
  }, [data, servizio, waitlistKeys, waitlistOperatorKey]);

  const currentDayEffectiveWaitlistSlotTimes = useMemo(
    () =>
      Array.from(
        new Set([...currentDayActiveWaitlistSlotTimes, ...currentDayOptimisticWaitlistSlotTimes])
      ),
    [currentDayActiveWaitlistSlotTimes, currentDayOptimisticWaitlistSlotTimes]
  );

  const currentDayActiveWaitlistSlotTimesSet = useMemo(
    () => new Set(currentDayEffectiveWaitlistSlotTimes),
    [currentDayEffectiveWaitlistSlotTimes]
  );

  const hasCurrentDayWaitlistCoverage = useMemo(() => {
    if (!waitlistableOccupiedSlots.length || !servizio.trim()) {
      return false;
    }

    return waitlistableOccupiedSlots.every((slotTime) =>
      currentDayActiveWaitlistSlotTimesSet.has(slotTime)
    );
  }, [
    currentDayActiveWaitlistSlotTimesSet,
    servizio,
    waitlistableOccupiedSlots,
  ]);

  const hasAnyCurrentDayWaitlistActive = currentDayEffectiveWaitlistSlotTimes.length > 0;

  const isCurrentDayWaitlistActive =
    hasAnyCurrentDayWaitlistActive;

  const waitlistSlotBlocks = useMemo(() => {
    const waitlistableSlotsSet = new Set(waitlistableOccupiedSlots);
    const blocks: WaitlistSlotBlock[] = [];
    let currentBlock: string[] = [];

    displayTimeSlots.forEach((slotTime) => {
      if (waitlistableSlotsSet.has(slotTime)) {
        currentBlock.push(slotTime);
        return;
      }

      if (currentBlock.length > 0) {
        blocks.push({
          id: `${data}:${currentBlock[0]}-${currentBlock[currentBlock.length - 1]}`,
          startTime: currentBlock[0],
          endTime: currentBlock[currentBlock.length - 1],
          slotTimes: currentBlock,
        });
        currentBlock = [];
      }
    });

    if (currentBlock.length > 0) {
      blocks.push({
        id: `${data}:${currentBlock[0]}-${currentBlock[currentBlock.length - 1]}`,
        startTime: currentBlock[0],
        endTime: currentBlock[currentBlock.length - 1],
        slotTimes: currentBlock,
      });
    }

    return blocks;
  }, [data, displayTimeSlots, waitlistableOccupiedSlots]);

  const handleJoinWaitlistBlock = useCallback(
    async (block: WaitlistSlotBlock) => {
      const saved = await submitWaitlistForSlots({
        slotTimes: block.slotTimes,
        actionKey: `block:${block.id}|${waitlistOperatorKey}`,
        successMessage: (slotCount, notifiedCount) =>
          notifiedCount > 0
            ? `Uno degli orari tra ${block.startTime} e ${block.endTime} si è appena liberato. Prova a prenotarlo subito.`
            : slotCount === 1
              ? `Ti avviseremo se ${servizio} il ${formatDateCompact(data)} alle ${block.startTime} si libera.`
              : `Ti avviseremo se si libera un orario tra ${block.startTime} e ${block.endTime} il ${formatDateCompact(data)}.`,
      });

      return saved;
    },
    [data, servizio, submitWaitlistForSlots, waitlistOperatorKey]
  );

  const handleJoinWaitlistDay = useCallback(async () => {
    const activeSingleSlotTimes = currentDayActiveWaitlistSlotTimes;

    if (activeSingleSlotTimes.length > 0) {
      const cancelled = await cancelWaitlistForSlots({
        slotTimes: activeSingleSlotTimes,
        actionKey: currentDayWaitlistSelectionKey,
        successMessage: () => '',
        suppressSuccessAlert: true,
      });

      if (!cancelled) {
        return;
      }
    }

    const saved = await submitWaitlistForSlots({
      slotTimes: waitlistableOccupiedSlots,
      actionKey: currentDayWaitlistSelectionKey,
      successMessage: (slotCount, notifiedCount) =>
        notifiedCount > 0
          ? 'Si è appena liberato almeno uno degli orari occupati di oggi. Prova a prenotarlo subito.'
          : slotCount === 1
            ? `Ti avviseremo se ${servizio} il ${formatDateCompact(data)} alle ${waitlistableOccupiedSlots[0]} si libera.`
            : `Ti avviseremo se si libera qualsiasi orario occupato il ${formatDateCompact(data)}.`,
    });

  }, [
    cancelWaitlistForSlots,
    currentDayActiveWaitlistSlotTimes,
    currentDayWaitlistSelectionKey,
    data,
    servizio,
    submitWaitlistForSlots,
    waitlistableOccupiedSlots,
  ]);

  const frontendAutoAcceptEnabled = !isCurrentWorkspaceSalon
    ? publicSalonState?.workspace.autoAcceptBookingRequests === true
    : false;

  const notificheRisposteCount = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
      ).length,
    [mieRichieste]
  );

  const richiestePendenti = useMemo(
    () => mieRichieste.filter((item) => item.stato === 'In attesa'),
    [mieRichieste]
  );
  const richiesteApprovate = useMemo(
    () => mieRichieste.filter((item) => item.stato === 'Accettata'),
    [mieRichieste]
  );
  const richiesteArchiviate = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato === 'Rifiutata' || item.stato === 'Annullata'
      ),
    [mieRichieste]
  );
  const richiesteArchiviatePerMese = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
    });
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        items: PublicSalonState['richiestePrenotazione'][number][];
      }
    >();

    richiesteArchiviate.forEach((item) => {
      const parsedDate = parseIsoDate(item.data);
      const monthDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
      const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        return;
      }

      groups.set(key, {
        key,
        label: monthFormatter.format(monthDate),
        items: [item],
      });
    });

    return Array.from(groups.values()).sort((first, second) => second.key.localeCompare(first.key));
  }, [richiesteArchiviate]);

  useEffect(() => {
    setArchivedMonthExpanded((current) => {
      const next: Record<string, boolean> = {};
      richiesteArchiviatePerMese.forEach((group, index) => {
        next[group.key] = current[group.key] ?? index === 0;
      });
      return next;
    });
  }, [richiesteArchiviatePerMese]);

  const frontendAvailabilityRefreshSignature = useMemo(() => {
    const appointmentSignature = effectiveAppuntamenti
      .map((item) =>
        [
          item.id,
          item.data ?? '',
          item.ora ?? '',
          item.servizio ?? '',
          item.cliente ?? '',
          item.operatoreId ?? '',
          item.operatoreNome ?? '',
        ].join(':')
      )
      .sort()
      .join('|');
    const requestSignature = effectiveRichieste
      .map((item) =>
        [
          item.id,
          item.stato,
          item.data,
          item.ora,
          item.viewedByCliente ? '1' : '0',
          item.viewedBySalon ? '1' : '0',
        ].join(':')
      )
      .sort()
      .join('|');

    return `${appointmentSignature}__${requestSignature}`;
  }, [effectiveAppuntamenti, effectiveRichieste]);

  useEffect(() => {
    if (!isRegistered || !effectiveWorkspace) {
      return;
    }

    const remainingHoldMs = Math.max(0, waitlistRefreshHoldUntilRef.current - Date.now());
    const timeoutId = setTimeout(() => {
      void loadWaitlistEntries();
      void loadSavedWaitlistAlerts();
    }, Math.max(180, remainingHoldMs));

    return () => clearTimeout(timeoutId);
  }, [
    effectiveWorkspace,
    frontendAvailabilityRefreshSignature,
    isRegistered,
    loadSavedWaitlistAlerts,
    loadWaitlistEntries,
  ]);

  const waitlistAlertsForDisplay = useMemo(() => {
    const byIdentity = new Map<string, SlotWaitlistEntry>();
    const getAlertStatusPriority = (value?: string | null) => {
      const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
      if (normalized === 'notified') return 4;
      if (normalized === 'expired') return 3;
      if (normalized === 'cancelled') return 2;
      if (normalized === 'waiting') return 1;
      return 0;
    };
    const getAlertSortStamp = (item: SlotWaitlistEntry) =>
      Date.parse(
        String(item.updated_at ?? item.notified_at ?? item.expires_at ?? item.created_at ?? '').trim()
      ) || 0;
    savedWaitlistAlerts.forEach((item) => {
      const identity = buildWaitlistAlertIdentity({
        appointmentDate: item.appointment_date,
        appointmentTime: item.appointment_time,
        serviceName: item.requested_service_name,
        operatorId: item.requested_operator_id,
        operatorName: item.requested_operator_name,
      });
      const current = byIdentity.get(identity);
      if (!current) {
        byIdentity.set(identity, item);
        return;
      }

      const currentPriority = getAlertStatusPriority(current.status);
      const nextPriority = getAlertStatusPriority(item.status);
      const currentStamp = getAlertSortStamp(current);
      const nextStamp = getAlertSortStamp(item);

      if (
        nextPriority > currentPriority ||
        (nextPriority === currentPriority && nextStamp >= currentStamp)
      ) {
        byIdentity.set(identity, item);
      }
    });
    return Array.from(byIdentity.values()).filter((item) => {
      const normalizedStatus = getDerivedWaitlistAlertStatus(item);
      return normalizedStatus !== 'cancelled';
    });
  }, [buildWaitlistAlertIdentity, savedWaitlistAlerts]);

  const unreadCancelledRequests = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato === 'Annullata' && item.viewedByCliente === false
      ),
    [mieRichieste]
  );
  const unreadStatusResponses = useMemo(
    () =>
      mieRichieste.filter(
        (item) =>
          item.stato !== 'In attesa' &&
          item.stato !== 'Annullata' &&
          item.viewedByCliente === false
      ),
    [mieRichieste]
  );
  const waitlistViewedStorageKey = useMemo(
    () =>
      buildFrontendWaitlistViewedKey({
        salonCode: effectiveWorkspace?.salonCode ?? salonWorkspace.salonCode,
        email: profile.email,
        phone: profile.telefono,
      }),
    [effectiveWorkspace?.salonCode, profile.email, profile.telefono, salonWorkspace.salonCode]
  );
  const unreadWaitlistSignatures = useMemo(
    () =>
      waitlistAlertsForDisplay
        .filter((item) => getDerivedWaitlistAlertStatus(item) === 'notified')
        .map((item) => buildWaitlistViewedSignature(item))
        .filter((signature) => signature && !viewedWaitlistAlertKeys.has(signature)),
    [viewedWaitlistAlertKeys, waitlistAlertsForDisplay]
  );
  const lastUnreadStatusSignatureRef = useRef('');
  const waitlistUnreadCount = useMemo(
    () => unreadWaitlistSignatures.length,
    [unreadWaitlistSignatures]
  );
  const notifiedWaitlistAlerts = useMemo(
    () => waitlistAlertsForDisplay.filter((item) => getDerivedWaitlistAlertStatus(item) === 'notified'),
    [waitlistAlertsForDisplay]
  );
  const waitlistAlertsCount = waitlistAlertsForDisplay.length;
  const totalFrontendNotificationsCount = notificheRisposteCount + waitlistUnreadCount;

  useEffect(() => {
    if (!isRegistered || unreadCancelledRequests.length === 0) {
      lastUnreadCancelledSignatureRef.current = '';
      return;
    }

    const signature = unreadCancelledRequests.map((item) => item.id).sort().join('|');
    if (signature === lastUnreadCancelledSignatureRef.current) return;

    lastUnreadCancelledSignatureRef.current = signature;
    if (Platform.OS === 'web') {
      const latest = unreadCancelledRequests[0];
      const serviceName = String(latest?.servizio ?? 'Appuntamento').trim();
      const dateLabel = String(latest?.data ?? '').trim();
      const timeLabel = String(latest?.ora ?? '').trim();

      void requestWebNotificationPermission()
        .then((permission) => {
          if (permission !== 'granted') return;
          showWebNotification({
            title: 'Prenotazione annullata',
            body: [serviceName, dateLabel, timeLabel].filter(Boolean).join(' · '),
            tag: `frontend-cancelled-${latest?.id ?? signature}`,
          });
        })
        .catch(() => undefined);
    }
  }, [isRegistered, unreadCancelledRequests]);

  useEffect(() => {
    if (!isRegistered || unreadStatusResponses.length === 0) {
      lastUnreadStatusSignatureRef.current = '';
      return;
    }

    const signature = unreadStatusResponses
      .map((item) => `${item.id}:${item.stato}:${item.data}:${item.ora}:${item.note ?? ''}`)
      .sort()
      .join('|');

    if (signature === lastUnreadStatusSignatureRef.current) return;

    lastUnreadStatusSignatureRef.current = signature;
    if (Platform.OS === 'web') {
      const latest = unreadStatusResponses[0];
      const statusLabel =
        latest?.stato === 'Accettata'
          ? 'Prenotazione confermata'
          : latest?.stato === 'Rifiutata'
            ? 'Prenotazione rifiutata'
            : 'Aggiornamento prenotazione';
      const serviceName = String(latest?.servizio ?? 'Appuntamento').trim();
      const dateLabel = String(latest?.data ?? '').trim();
      const timeLabel = String(latest?.ora ?? '').trim();

      void requestWebNotificationPermission()
        .then((permission) => {
          if (permission !== 'granted') return;
          showWebNotification({
            title: statusLabel,
            body: [serviceName, dateLabel, timeLabel].filter(Boolean).join(' · '),
            tag: `frontend-status-${latest?.id ?? signature}`,
          });
        })
        .catch(() => undefined);
    }
  }, [isRegistered, unreadStatusResponses]);

  useEffect(() => {
    if (!isRegistered) {
      setViewedWaitlistAlertKeys(new Set());
      return;
    }

    let cancelled = false;

    AsyncStorage.getItem(waitlistViewedStorageKey)
      .then((storedValue) => {
        if (cancelled) return;
        const parsed = storedValue ? (JSON.parse(storedValue) as unknown) : [];
        const nextKeys = Array.isArray(parsed)
          ? parsed
              .map((item) => String(item ?? '').trim())
              .filter(Boolean)
          : [];
        setViewedWaitlistAlertKeys(new Set(nextKeys));
      })
      .catch(() => {
        if (!cancelled) {
          setViewedWaitlistAlertKeys(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isRegistered, waitlistViewedStorageKey]);

  const markWaitlistAlertsAsViewed = useCallback(() => {
    if (!isRegistered) {
      return;
    }

    const nextSignatures = waitlistAlertsForDisplay
      .filter((item) => getDerivedWaitlistAlertStatus(item) === 'notified')
      .map((item) => buildWaitlistViewedSignature(item))
      .filter(Boolean);

    if (nextSignatures.length === 0) {
      return;
    }

    setViewedWaitlistAlertKeys((current) => {
      const merged = new Set(current);
      nextSignatures.forEach((signature) => merged.add(signature));
      void AsyncStorage.setItem(waitlistViewedStorageKey, JSON.stringify(Array.from(merged))).catch(
        () => undefined
      );
      return merged;
    });
  }, [isRegistered, waitlistAlertsForDisplay, waitlistViewedStorageKey]);

  const markFrontendNotificationsAsViewed = useCallback(() => {
    if (!isRegistered) {
      return;
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(profile.telefono.trim());
    const unreadViewSyncCandidates = mieRichieste.filter(
      (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
    );

    if (unreadViewSyncCandidates.length === 0) {
      return;
    }

    const syncSignature = unreadViewSyncCandidates
      .map((item) => `${item.id}:${item.stato}:${item.data}:${item.ora}`)
      .sort()
      .join('|');

    if (syncSignature === lastViewedSyncSignatureRef.current) {
      return;
    }

    lastViewedSyncSignatureRef.current = syncSignature;

    markClientRequestsViewedForSalon(
      effectiveWorkspace?.salonCode ?? salonWorkspace.salonCode,
      normalizedEmail,
      normalizedPhone
    );

    if (!isCurrentWorkspaceSalon) {
      setPublicSalonState((current) =>
        current
          ? {
              ...current,
              richiestePrenotazione: current.richiestePrenotazione.map((item) => {
                const sameEmail = item.email.trim().toLowerCase() === normalizedEmail;
                const samePhone =
                  limitPhoneToTenDigits(item.telefono.trim()) === normalizedPhone;
                return (sameEmail || samePhone) && item.stato !== 'In attesa'
                  ? { ...item, viewedByCliente: true }
                  : item;
              }),
            }
          : current
      );
    } else {
      setRichiestePrenotazione((current) =>
        current.map((item) => {
          const sameEmail = item.email.trim().toLowerCase() === normalizedEmail;
          const samePhone = limitPhoneToTenDigits(item.telefono.trim()) === normalizedPhone;
          return (sameEmail || samePhone) && item.stato !== 'In attesa'
            ? { ...item, viewedByCliente: true }
            : item;
        })
      );
    }
  }, [
    effectiveWorkspace?.salonCode,
    isRegistered,
    isCurrentWorkspaceSalon,
    mieRichieste,
    markClientRequestsViewedForSalon,
    profile.email,
    profile.telefono,
    salonWorkspace.salonCode,
    setRichiestePrenotazione,
  ]);

  useEffect(() => {
    if (!isRegistered || !showRequestsExpanded || !pendingMarkFrontendNotificationsViewedRef.current) {
      return;
    }

    pendingMarkFrontendNotificationsViewedRef.current = false;
    markFrontendNotificationsAsViewed();
  }, [isRegistered, markFrontendNotificationsAsViewed, showRequestsExpanded]);

  useEffect(() => {
    if (!isRegistered || !effectiveWorkspace?.salonCode) {
      return;
    }

    const refreshSalonState = async () => {
      if (isCurrentWorkspaceSalon) {
        return;
      }

      await refreshPublicSalonAvailability();
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void syncClientPushRegistration();
      void refreshSalonState();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      void syncClientPushRegistration();
      void refreshSalonState();
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncClientPushRegistration();
        void refreshSalonState();
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [
    effectiveWorkspace?.salonCode,
    isCurrentWorkspaceSalon,
    isRegistered,
    refreshPublicSalonAvailability,
    syncClientPushRegistration,
  ]);

  useEffect(() => {
    void syncClientPushRegistration();
  }, [syncClientPushRegistration]);

  useEffect(() => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      return;
    }

    const channel = supabase
      .channel(`client-portal-live:${normalizedSelectedSalonCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_portals',
          filter: `salon_code=eq.${normalizedSelectedSalonCode}`,
        },
        () => {
          void refreshPublicAvailabilitySettingsOnly();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, refreshPublicAvailabilitySettingsOnly]);

  useEffect(() => {
    const workspaceId = effectiveWorkspace?.id?.trim() ?? '';
    if (isCurrentWorkspaceSalon || !workspaceId || !isUuidValue(workspaceId)) {
      return;
    }

    const channel = supabase
      .channel(`client-bookings-live:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void refreshPublicSalonAvailability();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void refreshPublicSalonAvailability();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveWorkspace?.id, isCurrentWorkspaceSalon, refreshPublicSalonAvailability]);

  useEffect(() => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      return;
    }

    const refresh = () => {
      void refreshPublicSalonAvailability();
    };
    const refreshSettingsOnly = () => {
      void refreshPublicAvailabilitySettingsOnly();
    };

    const intervalId = setInterval(refresh, CLIENT_BOOKING_REFRESH_INTERVAL_MS);
    const settingsIntervalId = setInterval(
      refreshSettingsOnly,
      CLIENT_BOOKING_SETTINGS_REFRESH_INTERVAL_MS
    );

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refresh();
        refreshSettingsOnly();
      }
    });

    return () => {
      clearInterval(intervalId);
      clearInterval(settingsIntervalId);
      subscription.remove();
    };
  }, [
    isCurrentWorkspaceSalon,
    normalizedSelectedSalonCode,
    refreshPublicAvailabilitySettingsOnly,
    refreshPublicSalonAvailability,
  ]);

  useEffect(() => {
    if (!isRegistered || !showRequestsExpanded) {
      lastViewedSyncSignatureRef.current = '';
      return;
    }
  }, [isRegistered, showRequestsExpanded]);

  useEffect(() => {
    if (!isRegistered || !showWaitlistAlertsExpanded) {
      return;
    }
    markWaitlistAlertsAsViewed();
  }, [isRegistered, markWaitlistAlertsAsViewed, showWaitlistAlertsExpanded]);

  const saveProfile = async () => {
    if (!canSaveProfile) {
      setProfileSaveError('Compila nome, cognome, email e numero di cellulare per continuare.');
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }

    const invalidFields: string[] = [];

    if (!isValidEmail(profile.email)) {
      invalidFields.push('Email non valida');
    }

    if (!isValidPhone10(profile.telefono)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
    }

    if (invalidFields.length > 0) {
      setProfileFieldErrors({
        email: !isValidEmail(profile.email) ? 'Email non valida' : undefined,
        telefono: !isValidPhone10(profile.telefono)
          ? 'Numero di telefono errato (deve avere 10 cifre)'
          : undefined,
      });
      setProfileSaveError(buildInvalidFieldsMessage(invalidFields));
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }

    setProfileFieldErrors({});

    if (!effectiveWorkspace) {
        setProfileSaveError(
          salonLoadError ||
          'Nessun salone collegato. Vai su Inserisci codice salone, scrivi il codice e poi tocca Seleziona salone prima di registrarti.'
        );
      requestAnimationFrame(() => {
        scrollToField(salonCodeInputRef);
      });
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError('');

    try {
      const normalizedProfile = {
        nome: formatCustomerNamePart(profile.nome),
        cognome: formatCustomerNamePart(profile.cognome),
        email: profile.email.trim().toLowerCase(),
        telefono: limitPhoneToTenDigits(profile.telefono.trim()),
        instagram: profile.instagram.trim(),
      };

      const existingCustomer = effectiveClienti.find((item) => {
        const sameEmail = (item.email ?? '').trim().toLowerCase() === normalizedProfile.email;
        const samePhone =
          limitPhoneToTenDigits(item.telefono ?? '') === normalizedProfile.telefono;
        return sameEmail || samePhone;
      });

      if (existingCustomer) {
        setAccessMode('login');
        setProfileSaveError(
          buildDuplicateFrontendCustomerMessage({
            emailTaken:
              (existingCustomer.email ?? '').trim().toLowerCase() === normalizedProfile.email,
            phoneTaken:
              limitPhoneToTenDigits(existingCustomer.telefono ?? '') === normalizedProfile.telefono,
          })
        );
        return;
      }

      const saved = await upsertFrontendCustomerForSalon({
        salonCode: effectiveWorkspace.salonCode,
        profile: normalizedProfile,
      });

      if (!saved.ok) {
        if (saved.reason !== 'save_failed') {
          setAccessMode('login');
          setProfileSaveError(
            buildDuplicateFrontendCustomerMessage({
              emailTaken:
                saved.reason === 'duplicate_email' || saved.reason === 'duplicate_email_phone',
              phoneTaken:
                saved.reason === 'duplicate_phone' || saved.reason === 'duplicate_email_phone',
            })
          );
          return;
        }

        setProfileSaveError(
          'Registrazione non completata: il server non è riuscito a creare il cliente per questo salone. Riprova tra poco.'
        );
        return;
      }

      try {
        await AsyncStorage.setItem(
          FRONTEND_PROFILE_KEY,
          JSON.stringify({
            nome: normalizedProfile.nome,
            cognome: normalizedProfile.cognome,
            email: normalizedProfile.email,
            telefono: normalizedProfile.telefono,
            instagram: normalizedProfile.instagram,
          })
        );
        await AsyncStorage.setItem(
          buildFrontendProfileKeyForSalon(effectiveWorkspace.salonCode),
          JSON.stringify({
            nome: normalizedProfile.nome,
            cognome: normalizedProfile.cognome,
            email: normalizedProfile.email,
            telefono: normalizedProfile.telefono,
            instagram: normalizedProfile.instagram,
          })
        );
      } catch (error) {
        console.log('Errore salvataggio profilo cliente locale:', error);
      }

      setSelectedSalonCode(effectiveWorkspace.salonCode);
      setSalonCodeDraft(effectiveWorkspace.salonCode);
      void persistFrontendBiometricSnapshot(
        normalizedProfile,
        effectiveWorkspace.salonCode
      );
      setProfile(normalizedProfile);
      AsyncStorage.setItem(FRONTEND_LAST_SALON_CODE_KEY, effectiveWorkspace.salonCode).catch((error) => {
        console.log('Errore salvataggio ultimo salone dopo registrazione:', error);
      });

      const shouldOpenBookingDirectly =
        shouldStartInBookingMode || Boolean(normalizeSalonCode(effectiveWorkspace.salonCode));
      setHasSavedProfileForSelectedSalon(true);
      setIsRegistered(true);
      setIsBookingStarted(shouldOpenBookingDirectly);
      setShowRequestsExpanded(false);
      Alert.alert(
        'Registrazione completata',
        'Cliente registrato al salone correttamente.'
      );
      void maybePromptFrontendBiometricSetup(normalizedProfile, effectiveWorkspace.salonCode);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const loginFrontendCliente = async (overrides?: { email?: string; telefono?: string }) => {
    const normalizedEmail = String(overrides?.email ?? profile.email).trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(String(overrides?.telefono ?? profile.telefono).trim());
    const hasEmail = normalizedEmail !== '';
    const hasPhone = normalizedPhone !== '';
    const emailIsValid = hasEmail && isValidEmail(normalizedEmail);
    const phoneIsValid = hasPhone && isValidPhone10(normalizedPhone);

    if (!hasEmail || !hasPhone) {
      setProfileFieldErrors({
        email: !hasEmail ? 'Inserisci email' : undefined,
        telefono: !hasPhone ? 'Inserisci cellulare' : undefined,
      });
      setProfileSaveError('Per accedere inserisci sia email sia cellulare usati nella registrazione.');
      return;
    }

    if (!emailIsValid || !phoneIsValid) {
      setProfileFieldErrors({
        email: !emailIsValid ? 'Email non valida' : undefined,
        telefono: !phoneIsValid
          ? 'Numero di telefono errato (deve avere 10 cifre)'
          : undefined,
      });
      setProfileSaveError('Per accedere usa email e cellulare validi già registrati nel salone.');
      return;
    }

    setProfileFieldErrors({});
    setIsSavingProfile(true);
    setProfileSaveError('');

    try {
      const latestSalonState =
        !isCurrentWorkspaceSalon && effectiveWorkspace?.salonCode
          ? await refreshPublicSalonState()
          : null;
      const sourceWorkspace = latestSalonState?.workspace ?? effectiveWorkspace;
      const sourceClienti = latestSalonState?.clienti ?? effectiveClienti;

      if (latestSalonState) {
        applyMergedPublicSalonState(latestSalonState);
        setSalonLoadError('');
      }

      if (!sourceWorkspace) {
        setProfileSaveError(
          salonLoadError ||
            'Nessun salone collegato. Vai su Inserisci codice salone, scrivi il codice e poi tocca Seleziona salone.'
        );
        requestAnimationFrame(() => {
          scrollToField(salonCodeInputRef);
        });
        return;
      }

      const buildOtherSalonSuggestion = async () => {
        try {
          const savedSalonCodesRaw = await AsyncStorage.getItem(FRONTEND_SAVED_SALON_CODES_KEY);
          const parsed = savedSalonCodesRaw ? (JSON.parse(savedSalonCodesRaw) as unknown) : [];
          const savedSalonCodes = Array.isArray(parsed)
            ? buildSavedSalonCodeList(parsed as string[])
            : [];
          const otherSalonCodes = savedSalonCodes.filter(
            (code) => code && code !== sourceWorkspace.salonCode
          );

          if (!otherSalonCodes.length) {
            return '';
          }

          const scopedProfiles = await Promise.all(
            otherSalonCodes.map(async (code) => ({
              code,
              raw: await AsyncStorage.getItem(buildFrontendProfileKeyForSalon(code)),
            }))
          );

          const matchingOtherSalon = scopedProfiles.find(({ raw }) => {
            if (!raw) return false;

            try {
              const parsedProfile = JSON.parse(raw) as FrontendProfile;
              const sameEmail =
                (parsedProfile.email ?? '').trim().toLowerCase() === normalizedEmail;
              const samePhone =
                limitPhoneToTenDigits(parsedProfile.telefono ?? '') === normalizedPhone;
              return sameEmail && samePhone;
            } catch {
              return false;
            }
          });

          if (!matchingOtherSalon) {
            return otherSalonCodes.length > 0
              ? ' Se hai altri saloni salvati su questo dispositivo, seleziona un altro salone e riprova.'
              : '';
          }

          return ` Queste credenziali risultano gia salvate per un altro salone. Seleziona un altro salone e riprova.`;
        } catch {
          return '';
        }
      };

      const rankedMatches = sourceClienti
        .map((item) => {
          const sameEmail = hasEmail && (item.email ?? '').trim().toLowerCase() === normalizedEmail;
          const samePhone =
            hasPhone && limitPhoneToTenDigits(item.telefono ?? '') === normalizedPhone;
          const score = (sameEmail ? 2 : 0) + (samePhone ? 2 : 0);

          return {
            item,
            sameEmail,
            samePhone,
            score,
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((first, second) => second.score - first.score);

      const bestMatch = rankedMatches[0] ?? null;
      const secondBestMatch = rankedMatches[1] ?? null;

      if (!bestMatch) {
        const otherSalonSuggestion = await buildOtherSalonSuggestion();
        setProfileSaveError(
          `Credenziali errate per questo salone. Controlla email o cellulare oppure usa Registrati.${otherSalonSuggestion}`
        );
        return;
      }

      if (secondBestMatch && secondBestMatch.score === bestMatch.score) {
        setProfileSaveError(
          'Ho trovato piu profili simili. Usa i dati esatti con cui sei registrato nel salone oppure registrati di nuovo.'
        );
        return;
      }

      const matchedCustomer = bestMatch.item;

      const sameEmail = hasEmail && (matchedCustomer.email ?? '').trim().toLowerCase() === normalizedEmail;
      const samePhone =
        hasPhone && limitPhoneToTenDigits(matchedCustomer.telefono ?? '') === normalizedPhone;

      if (!sameEmail && !samePhone) {
        const otherSalonSuggestion = await buildOtherSalonSuggestion();
        setProfileSaveError(
          `Credenziali errate per questo salone. Controlla email o cellulare oppure usa Registrati.${otherSalonSuggestion}`
        );
        return;
      }

      const nameParts = matchedCustomer.nome.trim().split(/\s+/).filter(Boolean);
      const nome = formatCustomerNamePart(nameParts.shift() ?? '');
      const cognome = formatCustomerNamePart(nameParts.join(' '));
      const nextProfile = {
        nome,
        cognome,
        email: (matchedCustomer.email ?? '').trim() || normalizedEmail,
        telefono: limitPhoneToTenDigits(matchedCustomer.telefono ?? '') || normalizedPhone,
        instagram: matchedCustomer.instagram?.trim() ?? '',
      };

      setProfile(nextProfile);

      try {
        await AsyncStorage.setItem(FRONTEND_PROFILE_KEY, JSON.stringify(nextProfile));
        await AsyncStorage.setItem(
          buildFrontendProfileKeyForSalon(sourceWorkspace.salonCode),
          JSON.stringify(nextProfile)
        );
      } catch (error) {
        console.log('Errore salvataggio accesso cliente locale:', error);
      }

      setSelectedSalonCode(sourceWorkspace.salonCode);
      setSalonCodeDraft(sourceWorkspace.salonCode);
      void persistFrontendBiometricSnapshot(nextProfile, sourceWorkspace.salonCode);
      AsyncStorage.setItem(FRONTEND_LAST_SALON_CODE_KEY, sourceWorkspace.salonCode).catch((error) => {
        console.log('Errore salvataggio ultimo salone dopo accesso:', error);
      });

      const shouldOpenBookingDirectly =
        shouldStartInBookingMode || Boolean(normalizeSalonCode(sourceWorkspace.salonCode));
      setHasSavedProfileForSelectedSalon(true);
      setIsRegistered(true);
      setIsBookingStarted(shouldOpenBookingDirectly);
      setShowRequestsExpanded(false);
      void maybePromptFrontendBiometricSetup(nextProfile, sourceWorkspace.salonCode);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    if (
      autoCredentialLoginAttemptedRef.current ||
      initialAutoLoginParam !== '1' ||
      isRegistered ||
      !effectiveWorkspace ||
      !publicSalonState ||
      !hasHydratedFrontendSession
    ) {
      return;
    }

    const normalizedEmail = String(initialEmailParam ?? '').trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(String(initialPhoneParam ?? '').trim());

    if (!normalizedEmail || !normalizedPhone) {
      return;
    }

    autoCredentialLoginAttemptedRef.current = true;
    setAccessMode('login');
    setProfile((current) => ({
      ...current,
      email: normalizedEmail,
      telefono: normalizedPhone,
    }));

    requestAnimationFrame(() => {
      void loginFrontendCliente({
        email: normalizedEmail,
        telefono: normalizedPhone,
      });
    });
  }, [
    effectiveWorkspace,
    hasHydratedFrontendSession,
    initialAutoLoginParam,
    initialEmailParam,
    initialPhoneParam,
    isRegistered,
    loginFrontendCliente,
    publicSalonState,
  ]);

  useEffect(() => {
    if (
      autoCredentialLoginAttemptedRef.current ||
      isRegistered ||
      !hasHydratedFrontendSession ||
      !normalizedSelectedSalonCode ||
      !hasSavedProfileForSelectedSalon ||
      !effectiveWorkspace ||
      !publicSalonState
    ) {
      return;
    }

    const normalizedEmail = String(profile.email ?? '').trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(String(profile.telefono ?? '').trim());

    if (!normalizedEmail || !normalizedPhone) {
      return;
    }

    autoCredentialLoginAttemptedRef.current = true;
    setAccessMode('login');

    requestAnimationFrame(() => {
      void loginFrontendCliente({
        email: normalizedEmail,
        telefono: normalizedPhone,
      });
    });
  }, [
    effectiveWorkspace,
    hasHydratedFrontendSession,
    hasSavedProfileForSelectedSalon,
    normalizedSelectedSalonCode,
    isRegistered,
    loginFrontendCliente,
    profile.email,
    profile.telefono,
    publicSalonState,
  ]);

  const resetFrontendCliente = () => {
    setData(getTodayDateString());
    setServizio('');
    setOperatoreId('');
    setOperatoreNome('');
    setOra('');
    setNote('');
    setIsBookingStarted(false);
    setShowRequestsExpanded(false);
    setUltimaRichiesta(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const showBookingFlowAlert = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${title}\n\n${message}`);
      return;
    }

    Alert.alert(title, message);
  }, []);

  useEffect(() => {
    if (
      !isHomeAutoLoginFlow ||
      !autoCredentialLoginAttemptedRef.current ||
      isSavingProfile ||
      isRegistered ||
      !profileSaveError
    ) {
      return;
    }

    showBookingFlowAlert('Accesso non riuscito', profileSaveError);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }

    router.replace('/cliente-scanner');
  }, [
    isHomeAutoLoginFlow,
    isRegistered,
    isSavingProfile,
    profileSaveError,
    router,
    showBookingFlowAlert,
  ]);

  const inviaRichiesta = async () => {
    if (!isRegistered) {
      showBookingFlowAlert(
        'Registrazione richiesta',
        'Prima registra il tuo profilo cliente, poi invia la richiesta di prenotazione.'
      );
      return;
    }

    const invalidFields: string[] = [];

    if (!isValidEmail(profile.email)) {
      invalidFields.push('Email non valida');
    }

    if (!isValidPhone10(profile.telefono)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
    }

    if (invalidFields.length > 0) {
      setProfileFieldErrors({
        email: !isValidEmail(profile.email) ? 'Email non valida' : undefined,
        telefono: !isValidPhone10(profile.telefono)
          ? 'Numero di telefono errato (deve avere 10 cifre)'
          : undefined,
      });
      showBookingFlowAlert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    if (clienteInibito) {
      showBookingFlowAlert(
        'Orario non disponibile',
        'In questo momento non ci sono slot online disponibili. Prova un altro orario o contatta il salone.'
      );
      return;
    }

    if (!servizio.trim() || !ora.trim()) {
      showBookingFlowAlert(
        'Dati mancanti',
        'Scegli servizio, giorno e orario prima di inviare la richiesta.'
      );
      return;
    }

    if (isSelectedTimeWithinMinimumNotice) {
      showBookingFlowAlert(
        'Preavviso minimo richiesto',
        `Per le prenotazioni di oggi servono almeno ${DEFAULT_MINIMUM_NOTICE_MINUTES} minuti di preavviso.`
      );
      return;
    }

    if (selectedDateAvailability.closed) {
      showBookingFlowAlert(
        'Giorno non disponibile',
        'Il salone ha impostato questo giorno come chiuso o festivo. Scegline uno disponibile.'
      );
      return;
    }

    if (
      doesServiceOverlapLunchBreak({
        settings: effectiveAvailabilitySettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, effectiveServizi),
      })
    ) {
      showBookingFlowAlert(
        'Orario non disponibile',
        'Questo servizio si accavalla con la pausa pranzo del salone. Scegli un altro orario.'
      );
      return;
    }

    if (exceedsClosingTimeSelection) {
      const daySchedule = effectiveAvailabilitySettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      showBookingFlowAlert(
        'Orario oltre chiusura',
        `Questo servizio finirebbe oltre l'orario di chiusura del salone${daySchedule ? `, previsto alle ${daySchedule.endTime}` : ''}. Scegli un orario precedente.`
      );
      return;
    }

    if (!effectiveWorkspace) {
      showBookingFlowAlert(
        'Salone non disponibile',
        'Apri il link corretto del salone oppure inserisci un codice valido prima di inviare la richiesta.'
      );
      return;
    }

    const latestSalonState =
      !isCurrentWorkspaceSalon && effectiveWorkspace?.salonCode
        ? await resolveSalonByCode(effectiveWorkspace.salonCode)
        : null;

    const validationServices = latestSalonState?.servizi ?? effectiveServizi;
    const validationOperators = latestSalonState?.operatori ?? effectiveOperatori;
    const validationAppointments = latestSalonState?.appuntamenti ?? effectiveAppuntamenti;
    const validationRequests = latestSalonState?.richiestePrenotazione ?? effectiveRichieste;
    const validationSettings =
      latestSalonState?.availabilitySettings ?? effectiveAvailabilitySettings;
    const validationBaseBlockingAppointments = buildBlockingAppointments(
      validationAppointments,
      validationRequests,
      validationServices,
      validationOperators,
      validationSettings
    );
    const validationBackendDayOccupancy = latestSalonState
      ? derivePublicBookingOccupancyFromSnapshot(latestSalonState, data)
      : [];
    const validationBlockingAppointments =
      validationBackendDayOccupancy.length > 0
        ? [
            ...validationBaseBlockingAppointments.filter(
              (item) => (item.data ?? getTodayDateString()) !== data
            ),
            ...validationBackendDayOccupancy,
          ]
        : validationBaseBlockingAppointments;
    const validationOperatoriCompatibili = servizio.trim()
      ? getEligibleOperatorsForService({
          serviceName: servizio,
          services: validationServices,
          operators: validationOperators,
          appointmentDate: data,
          settings: validationSettings,
        })
      : [];
    const validationServiceHasConfiguredOperators =
      !!servizio.trim() &&
      getConfiguredOperatorsForFrontendService({
        serviceName: servizio,
        services: validationServices,
        operators: validationOperators,
      }).length > 0;
    const validationServiceUsesOperatorScheduling =
      !!servizio.trim() &&
      validationServiceHasConfiguredOperators;

    if (latestSalonState) {
      applyMergedPublicSalonState(latestSalonState);

      const isBlockedInLatestState = latestSalonState.clienti.some((item) =>
        matchesBlockedClientProfile(item, profile)
      );

      if (isBlockedInLatestState) {
        showBookingFlowAlert(
          'Orario non disponibile',
          'In questo momento non ci sono slot online disponibili. Prova un altro orario o contatta il salone.'
        );
        return;
      }

      const bookingLimitCheck = countScheduledBookingsForClient({
        profile,
        clienti: latestSalonState.clienti,
        appointments: latestSalonState.appuntamenti,
        requests: latestSalonState.richiestePrenotazione,
        appointmentDate: data,
        services: validationServices,
        requestedServiceName: servizio,
      });

      if (
        bookingLimitCheck.future.limit !== null &&
        bookingLimitCheck.future.total >= bookingLimitCheck.future.limit
      ) {
        showBookingFlowAlert(
          'Numero di prenotazioni max superato',
          bookingLimitCheck.future.mode === 'monthly'
            ? `Hai raggiunto il numero massimo di prenotazioni consentite per questo mese (${bookingLimitCheck.future.limit}).`
            : `Hai raggiunto il numero massimo di prenotazioni future consentite (${bookingLimitCheck.future.limit}).`
        );
        return;
      }

      if (
        bookingLimitCheck.daily.limit !== null &&
        bookingLimitCheck.daily.total >= bookingLimitCheck.daily.limit
      ) {
        showBookingFlowAlert(
          'Limite giornaliero raggiunto',
          `Hai raggiunto il numero massimo di prenotazioni consentite per il giorno selezionato (${bookingLimitCheck.daily.limit}).`
        );
        return;
      }
    }

    if (!latestSalonState) {
      const bookingLimitCheck = countScheduledBookingsForClient({
        profile,
        clienti: effectiveClienti,
        appointments: effectiveAppuntamenti,
        requests: effectiveRichieste,
        appointmentDate: data,
        services: validationServices,
        requestedServiceName: servizio,
      });

      if (
        bookingLimitCheck.future.limit !== null &&
        bookingLimitCheck.future.total >= bookingLimitCheck.future.limit
      ) {
        showBookingFlowAlert(
          'Numero di prenotazioni max superato',
          bookingLimitCheck.future.mode === 'monthly'
            ? `Hai raggiunto il numero massimo di prenotazioni consentite per questo mese (${bookingLimitCheck.future.limit}).`
            : `Hai raggiunto il numero massimo di prenotazioni future consentite (${bookingLimitCheck.future.limit}).`
        );
        return;
      }

      if (
        bookingLimitCheck.daily.limit !== null &&
        bookingLimitCheck.daily.total >= bookingLimitCheck.daily.limit
      ) {
        showBookingFlowAlert(
          'Limite giornaliero raggiunto',
          `Hai raggiunto il numero massimo di prenotazioni consentite per il giorno selezionato (${bookingLimitCheck.daily.limit}).`
        );
        return;
      }
    }

    const refreshedDateAvailability = getDateAvailabilityInfo(validationSettings, data);
    const refreshedConflict =
      data && ora && servizio
        ? hasFrontendSlotSelectionConflict({
            dateValue: data,
            startTime: ora,
            serviceName: servizio,
            selectedOperatorId: operatoreId || null,
            selectedOperatorName: operatoreNome || null,
            operators: validationOperators,
            appointments: validationBlockingAppointments,
            services: validationServices,
            settings: validationSettings,
          })
        : null;

    const refreshedLunchOverlap =
      !!servizio.trim() &&
      !!ora.trim() &&
      doesServiceOverlapLunchBreak({
        settings: validationSettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, validationServices),
      });

    if (refreshedDateAvailability.closed) {
      showBookingFlowAlert(
        'Giorno non disponibile',
        'Il salone ha appena aggiornato questo giorno come chiuso o festivo. Scegline uno disponibile.'
      );
      return;
    }

    if (refreshedLunchOverlap) {
      showBookingFlowAlert(
        'Orario non disponibile',
        'Questo servizio si accavalla con la pausa pranzo del salone. Scegli un altro orario.'
      );
      return;
    }

    if (
      !doesServiceFitWithinDaySchedule({
        settings: validationSettings,
        dateValue: data,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, validationServices),
      })
    ) {
      const daySchedule = validationSettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      showBookingFlowAlert(
        'Orario oltre chiusura',
        `Il salone chiude${daySchedule ? ` alle ${daySchedule.endTime}` : ' prima della fine di questo servizio'}. Scegli un orario precedente.`
      );
      return;
    }

    if (
      validationServiceUsesOperatorScheduling &&
      !validationOperatoriCompatibili.some((item) => item.id === operatoreId)
    ) {
      showBookingFlowAlert(
        'Operatore non disponibile',
        'Il salone ha appena aggiornato gli operatori disponibili per questo servizio. Scegli di nuovo il nome corretto.'
      );
      setOperatoreId('');
      setOperatoreNome('');
      setOra('');
      return;
    }

    const completeFrontendRequest = async () => {
      const nomeCompleto = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim();
      const inFlightRequestKey = [
        effectiveWorkspace.salonCode,
        data,
        ora,
        servizio.trim().toLowerCase(),
        profile.email.trim().toLowerCase(),
        profile.telefono.trim(),
      ].join('::');

      if (bookingRequestInFlightKeyRef.current === inFlightRequestKey || bookingRequestSubmitting) {
        return;
      }

      const nextRequest = {
        id: `req-${Date.now()}`,
        data,
        ora,
        servizio,
        prezzo:
          validationServices.find((item) => item.nome === servizio)?.prezzo ??
          servizioSelezionato?.prezzo ??
          0,
        durataMinuti: getServiceDuration(servizio, validationServices),
        mestiereRichiesto:
          validationServices.find((item) => item.nome === servizio)?.mestiereRichiesto?.trim() ||
          servizioSelezionato?.mestiereRichiesto?.trim() ||
          '',
        operatoreId:
          operatoreId ||
          (validationServiceUsesOperatorScheduling
            ? undefined
            : buildSalonCapacityOperatorId(servizio, validationServices)),
        operatoreNome: operatoreNome || undefined,
        macchinarioIds: getServiceRequiredMachineryIds(servizio, validationServices),
        nome: profile.nome.trim(),
        cognome: profile.cognome.trim(),
        email: profile.email.trim(),
        telefono: profile.telefono.trim(),
        instagram: profile.instagram.trim(),
        note: note.trim(),
        origine: 'frontend' as const,
        stato: 'In attesa' as const,
        createdAt: new Date().toISOString(),
        viewedByCliente: true,
        viewedBySalon: false,
      };

      bookingRequestInFlightKeyRef.current = inFlightRequestKey;
      setBookingRequestSubmitting(true);

      const nextRequestCompositeKey = buildPublicRequestCompositeKey(nextRequest);
      try {
        const saved = await Promise.race([
          addBookingRequestForSalon(effectiveWorkspace.salonCode, nextRequest),
          new Promise<Awaited<ReturnType<typeof addBookingRequestForSalon>>>((resolve) => {
            setTimeout(() => {
              resolve({
                ok: false,
                error: 'request_timeout',
                detail: 'booking_request_submit_timeout',
              } as Awaited<ReturnType<typeof addBookingRequestForSalon>>);
            }, 12000);
          }),
        ]);

        if (!saved.ok) {
          if (!isCurrentWorkspaceSalon) {
            const restored = await refreshPublicSalonState();
            if (restored) {
              applyMergedPublicSalonState(restored);
            }
            await refreshBackendDayOccupancy();
          }

          if (saved.error === 'slot_unavailable') {
            showBookingFlowAlert(
              'Orario non disponibile',
              `Lo slot del ${formatDateCompact(data)} alle ${ora} non e piu disponibile. Aggiorna e scegli un altro orario.`
            );
          } else if (saved.error === 'salon_not_found') {
            showBookingFlowAlert(
              'Salone non disponibile',
              'Non riesco piu a trovare il salone selezionato. Riapri il link corretto oppure reinserisci il codice salone.'
            );
          } else if (saved.error === 'invalid_customer_data') {
            showBookingFlowAlert(
              'Dati cliente incompleti',
              'Controlla nome, email e telefono prima di inviare la richiesta.'
            );
          } else if (saved.error === 'max_future_appointments_reached') {
            showBookingFlowAlert(
              'Numero di prenotazioni max superato',
              'Hai gia raggiunto il limite prenotazioni impostato dal salone.'
            );
          } else if (saved.error === 'max_daily_appointments_reached') {
            showBookingFlowAlert(
              'Limite giornaliero raggiunto',
              'Hai gia raggiunto il limite prenotazioni giornaliero impostato dal salone.'
            );
          } else if (saved.error === 'service_required') {
            showBookingFlowAlert(
              'Servizio non valido',
              'Seleziona di nuovo il servizio prima di inviare la richiesta.'
            );
          } else if (saved.error === 'appointment_datetime_required') {
            showBookingFlowAlert(
              'Orario non disponibile',
              'Seleziona di nuovo giorno e orario prima di inviare la richiesta.'
            );
          } else if ((saved.detail ?? '').toLowerCase().includes('max_daily_appointments_reached')) {
            showBookingFlowAlert(
              'Limite giornaliero raggiunto',
              'Per questo giorno hai gia raggiunto il numero massimo di prenotazioni consentite per questo mestiere o servizio. Scegli un altro giorno oppure un servizio di categoria diversa.'
            );
          } else if ((saved.detail ?? '').toLowerCase().includes('max_future_appointments_reached')) {
            showBookingFlowAlert(
              'Numero di prenotazioni max superato',
              'Hai gia raggiunto il limite prenotazioni impostato dal salone.'
            );
          } else if (saved.error === 'request_timeout' || (saved.detail ?? '').toLowerCase().includes('submit_timeout')) {
            showBookingFlowAlert(
              'Richiesta non inviata',
              'Il salone non ha risposto in tempo. Riprova tra un attimo.'
            );
          } else {
            showBookingFlowAlert(
              'Richiesta non inviata',
              saved.detail?.trim()
                ? `Non sono riuscito a salvare la prenotazione sul salone selezionato. Dettaglio: ${saved.detail}`
                : 'Non sono riuscito a salvare la prenotazione sul salone selezionato. Riprova tra un attimo.'
            );
          }
          return;
        }

        recentLocalBookingRequestsRef.current = [
          {
            request: nextRequest,
            addedAt: Date.now(),
          },
          ...recentLocalBookingRequestsRef.current.filter(
            (entry) => buildPublicRequestCompositeKey(entry.request) !== nextRequestCompositeKey
          ),
        ];

        if (!isCurrentWorkspaceSalon) {
          setPublicSalonState((current) =>
            current
              ? {
                  ...current,
                  richiestePrenotazione: [
                    nextRequest,
                    ...current.richiestePrenotazione.filter(
                      (item) =>
                        !(
                          item.data === nextRequest.data &&
                          item.ora === nextRequest.ora &&
                          item.email.trim().toLowerCase() === nextRequest.email.trim().toLowerCase() &&
                          item.telefono.trim() === nextRequest.telefono.trim() &&
                          (item.stato === 'In attesa' || item.stato === 'Accettata')
                        )
                    ),
                  ],
                }
              : current
          );
        }

        if (!isCurrentWorkspaceSalon) {
          const refreshed = await refreshPublicSalonState();
          if (refreshed) {
            applyMergedPublicSalonState(refreshed);
          }
          await refreshBackendDayOccupancy();
        }

        setUltimaRichiesta({
          nomeCompleto,
          data,
          ora,
          servizio,
          operatoreNome: operatoreNome || '',
        });
        setData(getTodayDateString());
        setServizio('');
        setOperatoreId('');
        setOperatoreNome('');
        setOra('');
        setNote('');
        setIsBookingStarted(false);
        scrollFrontendToTop();
      } finally {
        bookingRequestInFlightKeyRef.current = '';
        setBookingRequestSubmitting(false);
      }
    };

    if (refreshedConflict || richiestaInConflitto || exactSlotRequestAlreadyPresent) {
      showBookingFlowAlert(
        'Orario non disponibile',
        exactSlotRequestAlreadyPresent
          ? `Per il ${formatDateCompact(data)} alle ${ora} esiste gia una richiesta attiva. Scegli un altro orario.`
          : `Hai scelto un orario che si sovrappone a un altro appuntamento. ${servizio} alle ${ora} non e disponibile il ${formatDateCompact(
              data
            )}.`
      );
      return;
    }

    await completeFrontendRequest();
  };

  const triggerFrontendBookingSubmit = useCallback(() => {
    const now = Date.now();
    if (now - bookingSubmitTapLockRef.current < 450) {
      return;
    }
    bookingSubmitTapLockRef.current = now;
    void inviaRichiesta();
  }, [inviaRichiesta]);

  const aggiungiRichiestaAccettataAlCalendario = async (richiestaId: string) => {
    const richiesta = mieRichieste.find((item) => item.id === richiestaId);
    if (!richiesta || richiesta.stato !== 'Accettata') return;

    const eventDate = parseIsoDate(richiesta.data);
    const startDate = new Date(eventDate);
    const startMinutes = timeToMinutes(richiesta.ora);
    startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + (richiesta.durataMinuti ?? 60));

    const eventTitle = `${richiesta.servizio} - ${formatDisplayPersonName(
      richiesta.nome,
      richiesta.cognome
    )}`.trim();
    const eventLocation = salonAddress?.trim() || effectiveWorkspace?.salonAddress?.trim() || undefined;
    const eventNotes = [
      `Appuntamento confermato dal salone per ${richiesta.servizio}.`,
      eventLocation ? `Indirizzo salone: ${eventLocation}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (isWeb) {
      try {
        const calendarStart = formatCalendarUtcStamp(startDate);
        const calendarEnd = formatCalendarUtcStamp(endDate);
        const calendarUrl =
          'https://calendar.google.com/calendar/render?action=TEMPLATE' +
          `&text=${encodeURIComponent(eventTitle)}` +
          `&dates=${encodeURIComponent(`${calendarStart}/${calendarEnd}`)}` +
          `&details=${encodeURIComponent(eventNotes)}` +
          `&location=${encodeURIComponent(eventLocation ?? '')}`;

        const popup = globalThis.open?.(calendarUrl, '_blank', 'noopener,noreferrer');
        if (!popup) {
          globalThis.location.href = calendarUrl;
        }
        return;
      } catch {
        Alert.alert(
          'Calendario non disponibile',
          'Non sono riuscito ad aprire il calendario dal browser. Riprova tra un attimo.'
        );
        return;
      }
    }

    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Permesso necessario',
          'Per salvare l’appuntamento nel calendario devi autorizzare l’accesso al calendario del telefono.'
        );
        return;
      }

      await Calendar.createEventInCalendarAsync({
        title: eventLocation ? `${eventTitle} · ${eventLocation}` : eventTitle,
        startDate,
        endDate,
        location: eventLocation,
        notes: eventNotes,
      });
    } catch {
      Alert.alert(
        'Calendario non disponibile',
        'Non sono riuscito ad aprire il calendario del telefono. Riprova tra un attimo.'
      );
    }
  };

  const annullaPrenotazioneCliente = (requestId: string) => {
    if (cancellingRequestId === requestId) {
      return;
    }

    const richiesta = mieRichieste.find((item) => item.id === requestId);
    if (!richiesta) return;

    const isPending = richiesta.stato === 'In attesa';
    const isAccepted = richiesta.stato === 'Accettata';

    if (!isPending && !isAccepted) {
      Alert.alert(
        'Annullamento non disponibile',
        'Questa richiesta non può più essere annullata dal cliente.'
      );
      return;
    }

    if (isAccepted && !canCancelUntilPreviousMidnight(richiesta.data)) {
      Alert.alert(
        'Tempo scaduto',
        'Puoi annullare l’appuntamento solo fino alla mezzanotte del giorno prima. Contatta direttamente il salone.'
      );
      return;
    }

    if (!effectiveWorkspace) {
      Alert.alert('Salone non disponibile', 'Non riesco a contattare il salone in questo momento.');
      return;
    }

    const confirmCancellation = async () => {
      setCancellingRequestId(requestId);
      console.log('[frontend-cancel] start', {
        requestId,
        requestStatus: richiesta.stato,
        requestEmail: richiesta.email,
        requestPhone: richiesta.telefono,
        profileEmail: profile.email,
        profilePhone: profile.telefono,
        salonCode: effectiveWorkspace.salonCode,
        isWeb,
      });

      try {
        const result = await cancelClientAppointmentForSalon({
          salonCode: effectiveWorkspace.salonCode,
          requestId,
          email: profile.email,
          telefono: profile.telefono,
          requestSnapshot: richiesta,
        });
        console.log('[frontend-cancel] result', { requestId, result });

        if (!result.ok) {
          const message = result.error ?? 'Non sono riuscito ad annullare la prenotazione.';
          if (isWeb) {
            globalThis.alert?.(message);
          }
          Alert.alert('Annullamento non riuscito', message);
          return;
        }

        if (!isCurrentWorkspaceSalon) {
          setPublicSalonState((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              richiestePrenotazione: current.richiestePrenotazione.map((entry) =>
                entry.id === requestId
                  ? {
                      ...entry,
                      stato: 'Annullata',
                      viewedByCliente: true,
                      viewedBySalon: false,
                      cancellationSource: 'cliente',
                    }
                  : entry
              ),
              appuntamenti:
                richiesta.stato === 'Accettata'
                  ? current.appuntamenti.filter((entry) => {
                      const entryDate = entry.data ?? '';
                      return !(
                        entryDate === richiesta.data &&
                        entry.ora === richiesta.ora &&
                        String(entry.servizio ?? '').trim().toLowerCase() ===
                          String(richiesta.servizio ?? '').trim().toLowerCase() &&
                        String(entry.cliente ?? '').trim().toLowerCase() ===
                          `${richiesta.nome} ${richiesta.cognome}`.trim().toLowerCase()
                      );
                    })
                  : current.appuntamenti,
            };
          });

          void resolveSalonByCode(effectiveWorkspace.salonCode)
            .then((refreshed) => {
              if (refreshed) {
                applyMergedPublicSalonState(refreshed);
              }
            })
            .catch(() => undefined);
        }

        const successMessage = isPending
          ? 'La richiesta è stata annullata e il salone è stato avvisato.'
          : 'La prenotazione è stata annullata e il salone è stato avvisato.';

        Alert.alert(
          isPending ? 'Richiesta annullata' : 'Appuntamento annullato',
          successMessage
        );
        if (isWeb) {
          globalThis.alert?.(successMessage);
        }
        console.log('[frontend-cancel] success', { requestId, successMessage });
      } catch (error) {
        console.log('[frontend-cancel] thrown-error', {
          requestId,
          error,
        });
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Non sono riuscito ad annullare la prenotazione.';
        if (isWeb) {
          globalThis.alert?.(message);
        }
        Alert.alert('Annullamento non riuscito', message);
      } finally {
        console.log('[frontend-cancel] finally', { requestId });
        setCancellingRequestId((current) => (current === requestId ? null : current));
      }
    };

    const confirmationTitle = isPending ? 'Annulla richiesta' : 'Annulla appuntamento';
    const confirmationBody = `Vuoi davvero annullare ${richiesta.servizio} del ${formatDateLong(richiesta.data)} alle ${richiesta.ora}? Il salone verrà avvisato subito.`;

    if (isWeb) {
      const confirmed = globalThis.confirm?.(`${confirmationTitle}\n\n${confirmationBody}`) ?? false;
      if (confirmed) {
        void confirmCancellation();
      }
      return;
    }

    Alert.alert(confirmationTitle, confirmationBody, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Conferma',
        style: 'destructive',
        onPress: () => {
          void confirmCancellation();
        },
      },
    ]);
  };

  const renderRequestStateBadge = (status: PublicSalonState['richiestePrenotazione'][number]['stato']) => (
    <View
      style={[
        styles.requestStateBadge,
        isWeb && styles.requestStateBadgeWeb,
        status === 'In attesa'
          ? styles.requestStateBadgePending
          : status === 'Accettata'
            ? styles.requestStateBadgeAccepted
            : status === 'Annullata'
              ? styles.requestStateBadgeCancelled
              : styles.requestStateBadgeRejected,
      ]}
    >
      <Text
        style={[
          styles.requestStateBadgeText,
          status === 'In attesa'
            ? styles.requestStateBadgeTextPending
            : status === 'Accettata'
              ? styles.requestStateBadgeTextAccepted
              : status === 'Annullata'
                ? styles.requestStateBadgeTextCancelled
                : styles.requestStateBadgeTextRejected,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {status}
      </Text>
    </View>
  );

  const renderCustomerRequestCard = (
    item: PublicSalonState['richiestePrenotazione'][number],
    options?: {
      canCancel?: boolean;
      cancelLabel?: string;
      showCalendarButton?: boolean;
      showConfirmationHint?: boolean;
      showContactActions?: boolean;
      compactHistory?: boolean;
    }
  ) => {
    const canCancel = options?.canCancel === true;
    const isCancelled = item.stato === 'Annullata';
    const isAccepted = item.stato === 'Accettata';
    const cancellationSource = (item as { cancellationSource?: 'cliente' | 'salone' }).cancellationSource;
    const cancelledBySalon = isCancelled && cancellationSource === 'salone';
    const isCancelling = cancellingRequestId === item.id;
    const compactHistory = options?.compactHistory === true;
    const requestRoleLabel =
      item.mestiereRichiesto?.trim() ||
      getServiceByName(item.servizio, effectiveServizi)?.mestiereRichiesto?.trim() ||
      salonActivityCategory ||
      '';
    const handleCancelRequest = () => {
      annullaPrenotazioneCliente(item.id);
    };

    return (
      <View
        key={item.id}
        style={[
          styles.requestStatusCard,
          item.stato === 'In attesa'
            ? styles.requestStatusCardPending
            : item.stato === 'Accettata'
              ? styles.requestStatusCardAccepted
              : item.stato === 'Annullata'
                ? styles.requestStatusCardCancelled
                : styles.requestStatusCardRejected,
          isWeb && styles.requestStatusCardWeb,
          compactHistory && styles.requestStatusCardCompact,
          compactHistory && isWeb && styles.requestStatusCardCompactWeb,
          isWeb &&
            mediumFrontendCards && {
              paddingHorizontal: compactHistory ? 14 : 16,
              paddingTop: compactHistory ? 10 : 14,
              paddingBottom: compactHistory ? 10 : 14,
              marginBottom: compactHistory ? 8 : 10,
              borderRadius: compactHistory ? 18 : 20,
            },
          isWeb &&
            compactFrontendCards && {
              paddingHorizontal: 12,
              paddingTop: 12,
              paddingBottom: 12,
              borderRadius: 18,
            },
        ]}>
        <View
          style={[
            isWeb ? styles.requestStatusHeroBlockWeb : undefined,
            compactHistory && styles.requestStatusHeroBlockCompact,
            compactHistory && isWeb && styles.requestStatusHeroBlockCompactWeb,
          ]}>
          <View
            style={[
              styles.requestStatusHeaderStack,
              compactHistory && styles.requestStatusHeaderStackCompact,
            ]}>
            <View style={styles.requestStatusBadgeWrap}>{renderRequestStateBadge(item.stato)}</View>
            <View
              style={[
                styles.requestStatusHeaderCopy,
                isWeb && styles.requestStatusHeaderCopyWeb,
                compactHistory && styles.requestStatusHeaderCopyCompact,
                compactHistory && isWeb && styles.requestStatusHeaderCopyCompactWeb,
              ]}
            >
              <Text
                style={[
                  styles.requestStatusTitle,
                  isWeb && styles.requestStatusTitleWeb,
                  compactHistory && styles.requestStatusTitleCompact,
                  compactFrontendCards && styles.requestStatusTitleTight,
                ]}
                numberOfLines={compactFrontendCards ? 2 : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.servizio}
              </Text>
              <Text
                style={[
                  styles.requestStatusMeta,
                  isWeb && styles.requestStatusMetaWeb,
                  compactHistory && styles.requestStatusMetaCompact,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {formatDateLong(item.data)} · {item.ora}
              </Text>
            </View>
          </View>

          {requestRoleLabel || item.operatoreNome ? (
            <View
            style={[
              styles.requestMetaPillsRow,
              isWeb && styles.requestMetaPillsRowWeb,
              compactHistory && styles.requestMetaPillsRowCompact,
              isWeb &&
                compactFrontendCards && {
                  justifyContent: 'center',
                  gap: 6,
                },
            ]}>
              {requestRoleLabel ? (
                <View style={[styles.requestCategoryChip, isWeb && styles.requestCategoryChipWeb]}>
                  <Text style={styles.requestCategoryChipText}>{requestRoleLabel}</Text>
                </View>
              ) : null}
              {item.operatoreNome ? (
                <View style={[styles.requestOperatorChip, isWeb && styles.requestOperatorChipWeb]}>
                  <Ionicons name="person-outline" size={13} color="#315ea8" />
                  <Text style={styles.requestOperatorChipText}>{item.operatoreNome}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text
          style={[
            styles.requestStatusBody,
            isWeb && styles.requestStatusBodyWeb,
            compactHistory && styles.requestStatusBodyCompact,
          ]}
          numberOfLines={compactHistory ? (compactFrontendCards ? 3 : 2) : compactFrontendCards ? 4 : 3}
          adjustsFontSizeToFit
          minimumFontScale={0.84}
        >
          {isCancelled
            ? cancelledBySalon
              ? 'Il salone ha annullato questo appuntamento.'
              : tf('frontend_request_cancelled_text')
            : (item.origine ?? 'frontend') === 'backoffice'
              ? tf('frontend_request_from_salon')
              : item.stato === 'In attesa'
                ? tf('frontend_request_pending_text')
                : isAccepted
                  ? tf('frontend_request_accepted_text')
                  : tf('frontend_request_rejected_text')}
        </Text>

        {salonAddress && !compactHistory ? (
          <View style={[styles.requestAddressCard, isWeb && styles.requestAddressCardWeb]}>
            <Ionicons name="location-outline" size={15} color="#64748b" />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.requestStatusAddress, isWeb && styles.requestStatusAddressWeb]}
            >
              {salonAddress}
            </Text>
          </View>
        ) : null}

        {options?.showConfirmationHint ? (
          <Text style={styles.requestStatusHint}>
            {canCancel ? tf('frontend_can_cancel_until') : tf('frontend_cannot_cancel')}
          </Text>
        ) : null}

        {canCancel || options?.showCalendarButton ? (
          <View style={styles.requestActionsStack}>
            {canCancel ? (
              <TouchableOpacity
                style={[styles.cancelBookingButton, isWeb && styles.requestActionButtonWeb]}
                onPress={handleCancelRequest}
                activeOpacity={0.9}
                disabled={isCancelling}
              >
                <Text style={styles.cancelBookingButtonText}>
                  {isCancelling
                    ? 'Annullamento in corso...'
                    : options?.cancelLabel ?? tf('frontend_cancel_booking')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {options?.showCalendarButton ? (
              <TouchableOpacity
                style={[styles.calendarButton, isWeb && styles.requestActionButtonWeb]}
                onPress={() => aggiungiRichiestaAccettataAlCalendario(item.id)}
                activeOpacity={0.9}
              >
                <Text style={styles.calendarButtonText}>{tf('frontend_add_calendar')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {options?.showContactActions && salonBusinessPhone ? (
          <View style={[styles.confirmationActionsRow, isWeb && styles.confirmationActionsRowWeb]}>
            <TouchableOpacity
              style={[styles.inlineWhatsappButton, isWeb && styles.inlineContactButtonWeb]}
              onPress={scriviWhatsAppSalone}
              activeOpacity={0.9}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#166534" />
              <Text style={styles.inlineWhatsappButtonText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inlineCallButton, isWeb && styles.inlineContactButtonWeb]}
              onPress={chiamaSalone}
              activeOpacity={0.9}
            >
              <Ionicons name="call-outline" size={16} color="#0f766e" />
              <Text style={styles.inlineCallButtonText}>Chiama</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const blurOnSubmit = (_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    Keyboard.dismiss();
  };

  const chiamaSalone = async () => {
    if (!salonBusinessPhone) {
      Alert.alert('Numero non disponibile', 'Questo salone non ha ancora impostato un numero di contatto.');
      return;
    }

    const dialablePhone = buildDialablePhone(salonBusinessPhone);

    try {
      const supported = await Linking.canOpenURL(`tel:${dialablePhone}`);
      if (!supported) {
        Alert.alert('Chiamata non disponibile', 'Questo dispositivo non può aprire la chiamata telefonica.');
        return;
      }

      await Linking.openURL(`tel:${dialablePhone}`);
    } catch {
      Alert.alert('Chiamata non disponibile', 'Non sono riuscito ad aprire la chiamata verso il salone.');
    }
  };

  const scriviWhatsAppSalone = async () => {
    if (!salonBusinessPhone) {
      Alert.alert('Numero non disponibile', 'Questo salone non ha ancora impostato un numero di contatto.');
      return;
    }

    const dialablePhone = buildDialablePhone(salonBusinessPhone).replace(/^\+/, '');
    const brandLabel = effectiveWorkspace?.salonName?.trim() || 'il salone';
    const message = encodeURIComponent(`Ciao, ti contatto dall'app per avere informazioni su una prenotazione da ${brandLabel}.`);
    const appUrl = `whatsapp://send?phone=${dialablePhone}&text=${message}`;
    const webUrl = `https://wa.me/${dialablePhone}?text=${message}`;

    try {
      const supportedApp = await Linking.canOpenURL(appUrl);
      if (supportedApp) {
        await Linking.openURL(appUrl);
        return;
      }

      const supportedWeb = await Linking.canOpenURL(webUrl);
      if (supportedWeb) {
        await Linking.openURL(webUrl);
        return;
      }

      Alert.alert('WhatsApp non disponibile', 'Non sono riuscito ad aprire WhatsApp su questo dispositivo.');
    } catch {
      Alert.alert('WhatsApp non disponibile', 'Non sono riuscito ad aprire la chat WhatsApp del salone.');
    }
  };

  const handleFrontendBack = () => {
    if (isBookingStarted) {
      setIsBookingStarted(false);
      setShowRequestsExpanded(true);
      scrollFrontendToTop(!isWeb);
      return;
    }

    if (ultimaRichiesta) {
      setUltimaRichiesta(null);
      setShowRequestsExpanded(true);
      scrollFrontendToTop(!isWeb);
      return;
    }

    if (showRequestsExpanded) {
      setShowRequestsExpanded(false);
      scrollFrontendToTop(!isWeb);
      return;
    }

    if (isWeb && typeof window !== 'undefined') {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.assign('/');
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/cliente-scanner');
  };

  const openFrontendSettings = useCallback(() => {
    const salonCodeForSettings =
      effectiveWorkspace?.salonCode || normalizedSelectedSalonCode || undefined;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams();
      if (salonCodeForSettings) {
        params.set('salon', salonCodeForSettings);
      }
      const query = params.toString();
      window.location.assign(`/cliente-impostazioni${query ? `?${query}` : ''}`);
      return;
    }

    router.push({
      pathname: '/cliente-impostazioni',
      params: {
        salon: salonCodeForSettings,
      },
    });
  }, [effectiveWorkspace?.salonCode, normalizedSelectedSalonCode, router]);

  const redirectToFrontendAccess = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }

    router.replace('/cliente-scanner');
  }, [router]);

  const performFrontendLogout = async () => {
    const currentSalonCode = normalizeSalonCode(effectiveWorkspace?.salonCode || normalizedSelectedSalonCode);
    const scopedKeysToRemove = currentSalonCode
      ? [
          buildFrontendProfileKeyForSalon(currentSalonCode),
        ]
      : [];
    await AsyncStorage.multiRemove([
      FRONTEND_PROFILE_KEY,
      FRONTEND_LAST_SALON_CODE_KEY,
      ...scopedKeysToRemove,
    ]);

    setProfile(EMPTY_PROFILE);
    setAccessMode('login');
    setHasSavedProfileForSelectedSalon(false);
    setIsRegistered(false);
    setIsBookingStarted(false);
    setShowRequestsExpanded(false);
    setUltimaRichiesta(null);
    setNote('');
    setOra('');
    setOperatoreId('');
    setOperatoreNome('');
    setServizio('');
    setSelectedSalonCode('');
    setSalonCodeDraft('');
    setPublicSalonState(null);
    setPublicAvailabilitySettings(null);
    setSalonLoadError('');
    setProfileSaveError('');
    setFrontendBiometricEnabled(false);

    const navigationRouter = router as typeof router & {
      dismissAll?: () => void;
    };

    navigationRouter.dismissAll?.();
    redirectToFrontendAccess();
    requestAnimationFrame(() => {
      navigationRouter.dismissAll?.();
    });
  };

  const handleFrontendLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(tf('frontend_logout_confirm_body'));
      if (confirmed) {
        void performFrontendLogout();
      }
      return;
    }

    Alert.alert(
      tf('frontend_logout_confirm_title'),
      tf('frontend_logout_confirm_body'),
      [
        { text: tf('common_cancel'), style: 'cancel' },
        {
          text: tf('common_logout'),
          style: 'destructive',
          onPress: () => {
            void performFrontendLogout();
          },
        },
      ]
    );
  };

  const handleOpenNotifications = () => {
    if (!isRegistered) {
      Alert.alert(
        tf('frontend_first_registration'),
        'Registra prima il tuo profilo cliente per vedere le notifiche delle prenotazioni.'
      );
      return;
    }

    if (isBookingStarted) {
      setIsBookingStarted(false);
    }
    if (ultimaRichiesta) {
      setUltimaRichiesta(null);
    }
    pendingRequestsSectionJumpRef.current = true;
    setShowRequestsExpanded(true);
    setShowWaitlistAlertsExpanded(false);
    waitlistRefreshHoldUntilRef.current = Date.now() + 1200;
    requestAnimationFrame(() => {
      markFrontendNotificationsAsViewed();
    });

    if (isWeb) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (requestsSectionY > 0) {
            scrollFrontendToY(requestsSectionY - 18, false);
            return;
          }

          scrollFrontendToTop(false);
        }, 180);
      });
    }
  };

  useEffect(() => {
    if (!pendingRequestsSectionJumpRef.current) {
      return;
    }

    if (!isRegistered || isBookingStarted || !showRequestsExpanded || requestsSectionY <= 0) {
      return;
    }

    pendingRequestsSectionJumpRef.current = false;
    scrollToRequestsSection(!isWeb);
  }, [isRegistered, isBookingStarted, isWeb, requestsSectionY, scrollToRequestsSection, showRequestsExpanded]);

  const shouldForceSalonLogin =
    hasResolvedOrIncomingSalonCode && !isRegistered && hasSavedProfileForSelectedSalon;
  const shouldForceRegisterOnly =
    hasResolvedOrIncomingSalonCode &&
    !isRegistered &&
    !hasSavedProfileForSelectedSalon &&
    accessMode !== 'login' &&
    (initialFrontendAccessMode === 'register' || initialRegistrationOnlyParam === '1');
  const shouldShowAccessModeSwitcher = !shouldForceSalonLogin && !shouldForceRegisterOnly;
  const activeAccessMode: FrontendAccessMode = shouldForceSalonLogin
    ? 'login'
    : shouldForceRegisterOnly
      ? 'register'
    : accessMode ?? 'login';
  const isManualRegistrationFlow = shouldForceRegisterOnly;
  const heroPreAuthTitle = shouldForceSalonLogin
      ? 'Accedi'
      : shouldForceRegisterOnly
        ? 'Registrazione cliente'
      : heroTitle;
  const heroPreAuthSubtitle = shouldForceSalonLogin
      ? 'Hai già un profilo cliente in questo salone. Accedi con email e cellulare usati nella registrazione.'
      : shouldForceRegisterOnly
        ? 'Completa la registrazione del cliente per il salone collegato. Dopo il salvataggio potrai entrare e prenotare.'
      : tf('frontend_subtitle');

  const lockSelectionTap = useCallback((durationMs = 220) => {
    selectionTapLockUntilRef.current = Date.now() + durationMs;
  }, []);

  const shouldIgnoreSelectionTap = useCallback(
    () => isWeb && Date.now() < selectionTapLockUntilRef.current,
    []
  );

  const renderBookingServiceCards = () => {
    if (sortedFrontendServizi.length === 0) {
      return [
        <View
          key="service-empty-state"
          style={[
            styles.sectionCardLocked,
            {
              width: isWeb ? 420 : '100%',
              minHeight: 120,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: '#D8E3F3',
              backgroundColor: '#F8FBFF',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 20,
              paddingVertical: 18,
            },
          ]}
        >
          <Text style={[styles.lockedSectionText, { textAlign: 'center' }]}>
            {isLoadingSalon
              ? 'Caricamento servizi del salone...'
              : salonLoadError ||
                'I servizi del salone non sono ancora disponibili. Riprova tra un attimo.'}
          </Text>
        </View>,
      ];
    }

    return sortedFrontendServizi.map((item) => {
      const selected = item.nome === servizio;
      const serviceUsesOperators =
        getConfiguredOperatorsForFrontendService({
          serviceName: item.nome,
          services: effectiveServizi,
          operators: effectiveOperatori,
        }).length > 0;
      const accent = resolveServiceAccent({
        serviceId: item.id,
        serviceName: item.nome,
        roleName: item.mestiereRichiesto,
        serviceColorOverrides: effectiveServiceCardColorOverrides,
        roleColorOverrides: effectiveRoleCardColorOverrides,
      });
      const showOperatorBadge = serviceUsesOperators;
      const showSalonBadge = !showOperatorBadge;

      return (
        <TouchableOpacity
          webTouchAction={isWeb ? 'pan-x' : undefined}
          key={item.id}
          style={[
            styles.serviceCard,
            isWeb && styles.serviceCardWeb,
            selected ? styles.serviceCardSelectedWide : styles.serviceCardUnselectedNarrow,
            isWeb &&
              (selected
                ? styles.serviceCardSelectedWideWeb
                : styles.serviceCardUnselectedNarrowWeb),
            {
              backgroundColor: accent.bg,
              borderColor: selected ? '#1E293B' : accent.border,
            },
            selected && styles.serviceCardActive,
          ]}
          onPress={() => {
            if (shouldIgnoreSelectionTap()) return;
            setServizio(item.nome);
            if (
              ora &&
              hasFrontendSlotSelectionConflict({
                dateValue: data,
                startTime: ora,
                serviceName: item.nome,
                selectedOperatorId: operatoreId || null,
                selectedOperatorName: operatoreNome || null,
                operators: effectiveOperatori,
                appointments: effectiveBlockingAppointments,
                services: effectiveServizi,
                settings: effectiveAvailabilitySettings,
              })
            ) {
              setOra('');
            }
          }}
          activeOpacity={0.9}
        >
          <Text
            style={[
              styles.serviceCardTitle,
              isWeb && styles.serviceCardTitleWeb,
              { color: '#111111' },
            ]}
            numberOfLines={3}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.62}
          >
            {item.nome}
          </Text>
          <View style={[styles.serviceCardMetaRow, isWeb && styles.serviceCardMetaRowWeb]}>
            {item.mestiereRichiesto ? (
              <View
                style={[
                  styles.serviceRoleBadge,
                  isWeb && styles.serviceRoleBadgeWeb,
                  { borderColor: accent.border },
                ]}
              >
                <Text
                  style={[
                    styles.serviceRoleBadgeText,
                    isWeb && styles.serviceRoleBadgeTextWeb,
                    { color: accent.text },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.62}
                >
                  {item.mestiereRichiesto}
                </Text>
              </View>
            ) : null}
            {showOperatorBadge ? (
              <View
                style={[
                  styles.serviceOperatorInlineBadge,
                  isWeb && styles.serviceOperatorInlineBadgeWeb,
                  { borderColor: accent.border },
                ]}
              >
                <Ionicons name="person" size={12} color={accent.text} />
              </View>
            ) : null}
            {showSalonBadge ? (
              <View style={[styles.serviceSalonInlineBadge, isWeb && styles.serviceSalonInlineBadgeWeb]}>
                <Text style={styles.serviceSalonInlineBadgeText}>Salone</Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.serviceCardDuration,
              isWeb && styles.serviceCardDurationWeb,
              { color: '#111111' },
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.68}
          >
            {formatDurationLabel(item.durataMinuti ?? 60)}
          </Text>
          <Text
            style={[
              styles.serviceCardPrice,
              isWeb && styles.serviceCardPriceWeb,
              { color: '#111111' },
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            € {item.prezzo.toFixed(2)}
          </Text>
          {selected ? (
            <View style={styles.serviceSelectedBadge}>
              <Text style={styles.serviceSelectedBadgeText}>Scelto</Text>
            </View>
          ) : null}
          {item.prezzoOriginale && item.prezzoOriginale > item.prezzo ? (
            <View style={styles.discountRow}>
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>Sconto</Text>
              </View>
              <Text style={styles.servicePriceOriginal}>
                € {item.prezzoOriginale.toFixed(2)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    });
  };

  const renderDayPickerDayCards = () =>
    giorniDisponibili.map((day) => (
      <DayCard
        key={day.value}
        day={day}
        selected={day.value === data}
        closed={getDateAvailabilityInfo(effectiveAvailabilitySettings, day.value).closed}
        past={day.value < today}
        canChooseDay={canChooseDay}
        ora={ora}
        servizio={servizio}
        effectiveBlockingAppointments={effectiveBlockingAppointments}
        effectiveServizi={effectiveServizi}
        setOra={setOra}
        onSelectDay={handleDayCardPress}
        getDateAvailabilityInfo={getDateAvailabilityInfo}
        effectiveAvailabilitySettings={effectiveAvailabilitySettings}
        tf={tf}
      />
    ));

  const compactBookingSlotColumns = width >= 760 ? 4 : width >= 560 ? 3 : 2;
  const compactBookingSlotWidth = `${100 / compactBookingSlotColumns - 2.4}%`;
  const recommendedSlotCount = guidedRecommendedTimeSlots.length;
  const recommendedSlotWidth =
    recommendedSlotCount <= 1
      ? '100%'
      : recommendedSlotCount === 2
        ? '48%'
        : `${100 / Math.min(recommendedSlotCount, compactBookingSlotColumns) - 2.4}%`;

  const renderCompactBookingTimeSlot = (
    item: string,
    {
      recommended = false,
      section = 'all',
    }: {
      recommended?: boolean;
      section?: 'recommended' | 'all';
    } = {}
  ) => {
    const selected = selectedTimeRange.has(item);
    const disabled = !selected && !isFrontendSlotBookable(item);
    const occupied = servizio.trim() !== '' && orariOccupati.has(item);
    const directlyOccupied = servizio.trim() !== '' && orariOccupatiDiretti.has(item);
    const unavailableReason = frontendTimeSlotUnavailableReasonMap.get(item);
    const busyBlocked = servizio.trim() !== '' && occupied && !selected;
    const overlapBlocked =
      !busyBlocked &&
      servizio.trim() !== '' &&
      !directlyOccupied &&
      disabled &&
      !selected;
    const lunchOverlapCandidate =
      !!servizio &&
      doesServiceOverlapLunchBreak({
        settings: effectiveAvailabilitySettings,
        startTime: item,
        durationMinutes: selectedServiceDuration,
      });

    return (
      <View
        key={`${section}-${item}`}
        style={[
          styles.frontendBookingTimeCell,
          {
            width: section === 'recommended' ? recommendedSlotWidth : compactBookingSlotWidth,
            maxWidth: section === 'recommended' ? 260 : undefined,
          } as ViewStyle,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.frontendBookingTimeCard,
            recommended && styles.frontendBookingTimeCardRecommended,
            busyBlocked && styles.frontendBookingTimeCardBusy,
            overlapBlocked && styles.frontendBookingTimeCardOverlap,
            selected && styles.frontendBookingTimeCardSelected,
            disabled && !selected && !busyBlocked && !overlapBlocked && styles.frontendBookingTimeCardDisabled,
          ]}
          onPress={() => {
            if (lunchOverlapCandidate) {
              Alert.alert(tf('frontend_lunch_overlap_title'), tf('frontend_lunch_overlap_body'));
              return;
            }
            if (selected) {
              setOra('');
              return;
            }
            if (disabled) return;
            setOra(item);
          }}
          activeOpacity={disabled ? 1 : 0.92}
          disabled={!canChooseTime || !servizio}
        >
          {selected ? (
            <View
              style={[
                styles.frontendBookingTimeTopPill,
                styles.frontendBookingTimeTopPillSelected,
              ]}
            >
              <Text
                style={[
                  styles.frontendBookingTimeTopPillText,
                  styles.frontendBookingTimeTopPillTextSelected,
                ]}
              >
                Selezionato
              </Text>
            </View>
          ) : recommended ? (
            <View style={styles.frontendBookingTimeTopPill}>
              <Text style={styles.frontendBookingTimeTopPillText}>Consigliato</Text>
            </View>
          ) : busyBlocked ? (
            <View
              style={[
                styles.frontendBookingTimeTopPill,
                styles.frontendBookingTimeTopPillBusy,
              ]}
            >
              <Text
                style={[
                  styles.frontendBookingTimeTopPillText,
                  styles.frontendBookingTimeTopPillTextBusy,
                ]}
              >
                Occupato
              </Text>
            </View>
          ) : overlapBlocked ? (
            <View
              style={[
                styles.frontendBookingTimeTopPill,
                styles.frontendBookingTimeTopPillOverlap,
              ]}
            >
              <Text
                style={[
                  styles.frontendBookingTimeTopPillText,
                  styles.frontendBookingTimeTopPillTextOverlap,
                ]}
              >
                Sovrapp.
              </Text>
            </View>
          ) : unavailableReason ? (
            <View
              style={[
                styles.frontendBookingTimeTopPill,
                styles.frontendBookingTimeTopPillOverlap,
              ]}
            >
              <Text
                style={[
                  styles.frontendBookingTimeTopPillText,
                  styles.frontendBookingTimeTopPillTextOverlap,
                ]}
              >
                {unavailableReason.pill}
              </Text>
            </View>
          ) : (
            <View style={styles.frontendBookingTimeTopPillSpacer} />
          )}
          <Text
            style={[
              styles.frontendBookingTimeCardText,
              selected && styles.frontendBookingTimeCardTextSelected,
              busyBlocked && styles.frontendBookingTimeCardTextBusy,
              overlapBlocked && styles.frontendBookingTimeCardTextOverlap,
              disabled && !selected && !busyBlocked && !overlapBlocked && styles.frontendBookingTimeCardTextDisabled,
            ]}
          >
            {item}
          </Text>
          <Text
            style={[
              styles.frontendBookingTimeCardMeta,
              selected && styles.frontendBookingTimeCardMetaSelected,
            ]}
          >
            {selected
              ? 'Selezionato'
              : recommended
                ? 'Scelta rapida'
                : busyBlocked
                  ? 'Gia prenotato'
                  : overlapBlocked
                    ? 'Si sovrappone'
                    : unavailableReason?.meta ?? 'Disponibile'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGuidedBookingTimeSlot = (item: string) => {
    const selected = selectedTimeRange.has(item);
    const disabled = !selected && !isFrontendSlotBookable(item);
    const unavailableReason = frontendTimeSlotUnavailableReasonMap.get(item);
    const lunchOverlapCandidate =
      !!servizio &&
      doesServiceOverlapLunchBreak({
        settings: effectiveAvailabilitySettings,
        startTime: item,
        durationMinutes: selectedServiceDuration,
      });

    return (
      <View
        key={`guided-${item}`}
        style={[styles.guidedTimeSlotCard, isWeb && styles.guidedTimeSlotCardWeb]}
      >
        <TouchableOpacity
          style={[
            styles.guidedTimeChip,
            isWeb && styles.guidedTimeChipWeb,
            selected && styles.guidedTimeChipSelected,
          ]}
          onPress={() => {
            if (lunchOverlapCandidate) {
              Alert.alert(tf('frontend_lunch_overlap_title'), tf('frontend_lunch_overlap_body'));
              return;
            }
            if (selected) {
              setOra('');
              return;
            }
            if (disabled) return;
            setOra(item);
          }}
          activeOpacity={disabled ? 1 : 0.92}
          disabled={!selected && disabled}
        >
          <View
            style={[
              styles.guidedTimeBadge,
              isWeb && styles.guidedTimeBadgeWeb,
              selected && styles.guidedTimeBadgeSelected,
            ]}
          >
            <Text
              style={[
                styles.guidedTimeBadgeText,
                isWeb && styles.guidedTimeBadgeTextWeb,
                selected && styles.guidedTimeBadgeTextSelected,
              ]}
            >
              {selected ? 'Selezionato' : 'Consigliato'}
            </Text>
          </View>
          <Text
            style={[
              styles.guidedTimeChipText,
              isWeb && styles.guidedTimeChipTextWeb,
            ]}
          >
            {item}
          </Text>
          <Text
            style={[
              styles.guidedTimeMeta,
              isWeb && styles.guidedTimeMetaWeb,
              selected && styles.guidedTimeMetaSelected,
            ]}
          >
            {selected
              ? 'Orario pronto'
              : unavailableReason?.meta ?? 'Riduce buchi e sovrapposizioni'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFrontendBookingTimesContent = (): ReactNode => {
    if (!canChooseTime) {
      return null;
    }

    try {
      return (
        <View style={styles.frontendBookingTimesWrap}>
          {shouldShowGuidedRecommendations ? (
            isWeb ? (
              <View style={[styles.guidedTimePanel, styles.guidedTimePanelWeb]}>
                <View style={[styles.guidedTimeHeader, styles.guidedTimeHeaderWeb]}>
                  <View style={styles.guidedTimeEyebrowPill}>
                    <Text style={styles.guidedTimeEyebrowPillText}>Prima scelta</Text>
                  </View>
                  <Text style={[styles.guidedTimeTitle, styles.guidedTimeTitleWeb]}>
                    Orari consigliati
                  </Text>
                  <Text style={[styles.guidedTimeHint, styles.guidedTimeHintWeb]}>
                    Gli slot migliori da mostrare sul frontend web, costruiti solo sugli orari davvero prenotabili.
                  </Text>
                </View>
                <View style={[styles.guidedTimeGrid, styles.guidedTimeGridWeb]}>
                  {guidedRecommendedTimeSlots.map((item) => renderGuidedBookingTimeSlot(item))}
                </View>
                {guidedSlotsVisibility === 'recommended_first' ? (
                  <TouchableOpacity
                    style={[styles.guidedTimeToggleButton, styles.guidedTimeToggleButtonWeb]}
                    onPress={() => setShowAllGuidedSlots((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.guidedTimeToggleButtonText,
                        styles.guidedTimeToggleButtonTextWeb,
                      ]}
                    >
                      {showAllGuidedSlots ? 'Nascondi altri orari' : 'Mostra tutti gli orari'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.frontendBookingTimesSection}>
                <View style={styles.frontendBookingTimesSectionHeader}>
                  <View style={styles.frontendBookingTimesSectionPill}>
                    <Text style={styles.frontendBookingTimesSectionPillText}>Prima scelta</Text>
                  </View>
                  <Text style={styles.frontendBookingTimesSectionTitle}>Orari consigliati</Text>
                  <Text style={styles.frontendBookingTimesSectionHint}>
                    Gli slot migliori per partire subito con una scelta rapida.
                  </Text>
                </View>
                <View
                  style={[
                    styles.frontendBookingTimesGrid,
                    recommendedSlotCount <= 2 && styles.frontendBookingTimesGridRecommendedCompact,
                  ]}
                >
                  {guidedRecommendedTimeSlots.map((item) =>
                    renderCompactBookingTimeSlot(item, {
                      recommended: true,
                      section: 'recommended',
                    })
                  )}
                </View>
                {guidedSlotsVisibility === 'recommended_first' ? (
                  <TouchableOpacity
                    style={styles.frontendBookingTimesToggle}
                    onPress={() => setShowAllGuidedSlots((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.frontendBookingTimesToggleText}>
                      {showAllGuidedSlots ? 'Nascondi altri orari' : 'Mostra tutti gli orari'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          ) : null}

          {shouldRenderExpandedTimeGrid ? (
            <View style={styles.frontendBookingTimesSection}>
              <View style={styles.frontendBookingTimesSectionHeader}>
                <Text style={styles.frontendBookingTimesSectionTitle}>
                  {shouldShowGuidedRecommendations ? 'Altri orari' : 'Tutti gli orari'}
                </Text>
                <Text style={styles.frontendBookingTimesSectionHint}>
                  {shouldShowGuidedRecommendations
                    ? 'Orari disponibili aggiuntivi oltre ai consigliati.'
                    : isWeb
                      ? 'Vista completa degli slot disponibili, ottimizzata per web.'
                      : 'Vista completa degli slot disponibili, ottimizzata per app.'}
                </Text>
              </View>
              <View style={styles.frontendBookingTimesGrid}>
                {visibleExpandedFrontendTimeSlots.map((item) =>
                  renderCompactBookingTimeSlot(item, { section: 'all' })
                )}
              </View>
            </View>
          ) : null}
        </View>
      );
    } catch (error) {
      console.error('Failed to render frontend booking times', error);

      return (
        <View style={styles.frontendBookingTimesWrap}>
          {guidedRecommendedTimeSlots.length > 0 ? (
            <View style={styles.frontendBookingTimesSection}>
              <View style={styles.frontendBookingTimesSectionHeader}>
                <Text style={styles.frontendBookingTimesSectionTitle}>Orari consigliati</Text>
                <Text style={styles.frontendBookingTimesSectionHint}>
                  Fallback sicuro del frontend mentre ripristiniamo il layout guidato.
                </Text>
              </View>
              <View style={styles.frontendBookingTimesGrid}>
                {guidedRecommendedTimeSlots.map((item) =>
                  renderCompactBookingTimeSlot(item, {
                    recommended: true,
                    section: 'recommended',
                  })
                )}
              </View>
            </View>
          ) : null}
          <View style={styles.frontendBookingTimesSection}>
            <View style={styles.frontendBookingTimesSectionHeader}>
              <Text style={styles.frontendBookingTimesSectionTitle}>
                {guidedRecommendedTimeSlots.length > 0 ? 'Altri orari' : 'Tutti gli orari'}
              </Text>
              <Text style={styles.frontendBookingTimesSectionHint}>
                Vista di sicurezza del time picker cliente.
              </Text>
            </View>
            <View style={styles.frontendBookingTimesGrid}>
              {(visibleExpandedFrontendTimeSlots.length > 0
                ? visibleExpandedFrontendTimeSlots
                : displayTimeSlots
              ).map((item) => renderCompactBookingTimeSlot(item, { section: 'all' }))}
            </View>
          </View>
        </View>
      );
    }
  };

  const renderHeroTopBar = () => (
    <View
      pointerEvents={isWeb ? 'auto' : 'box-none'}
      style={[
        styles.heroTopRow,
        isWeb && styles.heroTopRowWebOverlay,
        compactTopBar && styles.heroTopRowCompact,
        Platform.OS === 'android' && width < 600 && { paddingTop: 48 },
      ]}
    >
      <View style={styles.heroTopLeftCluster}>
        {isWeb ? (
          <button
            type="button"
            aria-label="Torna indietro"
            onClick={(event) => {
              stopWebTopBarEvent(event);
              handleFrontendBack();
            }}
            style={WEB_TOP_ICON_BUTTON_STYLE}
          >
            <View
              style={[
                styles.actionIconBadge,
                styles.homeHouseSettingsButton,
                compactTopBar && styles.actionIconBadgeCompact,
                compactTopBar && styles.actionIconBadgePhone,
              ]}
            >
              <Ionicons name="chevron-back" size={compactTopBar ? 16 : 22} color="#0f172a" />
            </View>
          </button>
        ) : (
          <TouchableOpacity
            style={[
              styles.actionIconBadge,
              styles.homeHouseSettingsButton,
              compactTopBar && styles.actionIconBadgeCompact,
              compactTopBar && styles.actionIconBadgePhone,
            ]}
            onPress={handleFrontendBack}
            activeOpacity={0.9}
          >
            <Ionicons name="chevron-back" size={compactTopBar ? 16 : 22} color="#0f172a" />
          </TouchableOpacity>
        )}
      </View>
      {isRegistered ? (
        <View style={[styles.heroTopActions, compactTopBar && styles.heroTopActionsCompact]}>
          {isWeb ? (
            <button
              type="button"
              aria-label="Apri mie prenotazioni"
              onClick={(event) => {
                stopWebTopBarEvent(event);
                handleOpenNotifications();
              }}
              style={WEB_TOP_ICON_BUTTON_STYLE}
            >
              <View
                style={[
                  styles.actionIconBadge,
                  styles.homeHouseSettingsButton,
                  styles.notificationsTopBadge,
                  compactTopBar && styles.actionIconBadgeCompact,
                  compactTopBar && styles.actionIconBadgePhone,
                ]}
              >
                <Ionicons
                  name="notifications"
                  size={compactTopBar ? 16 : 22}
                  color="#0f172a"
                />
                {totalFrontendNotificationsCount > 0 ? (
                  <View
                    style={[
                      styles.notificationsTopCountBadge,
                      compactTopBar && styles.notificationsTopCountBadgeCompact,
                    ]}
                  >
                    <Text
                      style={[
                        styles.notificationsTopCountBadgeText,
                        compactTopBar && styles.notificationsTopCountBadgeTextCompact,
                      ]}
                    >
                      {totalFrontendNotificationsCount > 99 ? '99+' : totalFrontendNotificationsCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </button>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionIconBadge,
                styles.homeHouseSettingsButton,
                styles.notificationsTopBadge,
                compactTopBar && styles.actionIconBadgeCompact,
                compactTopBar && styles.actionIconBadgePhone,
              ]}
              onPress={handleOpenNotifications}
              activeOpacity={0.9}
            >
              <Ionicons
                name="notifications"
                size={compactTopBar ? 16 : 22}
                color="#0f172a"
              />
              {totalFrontendNotificationsCount > 0 ? (
                <View
                  style={[
                    styles.notificationsTopCountBadge,
                    compactTopBar && styles.notificationsTopCountBadgeCompact,
                  ]}
                >
                  <Text
                    style={[
                      styles.notificationsTopCountBadgeText,
                      compactTopBar && styles.notificationsTopCountBadgeTextCompact,
                    ]}
                  >
                    {totalFrontendNotificationsCount > 99 ? '99+' : totalFrontendNotificationsCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
          {isWeb ? (
            <button
              type="button"
              aria-label="Apri impostazioni"
              onClick={(event) => {
                stopWebTopBarEvent(event);
                openFrontendSettings();
              }}
              style={WEB_TOP_ICON_BUTTON_STYLE}
            >
              <View
                style={[
                  styles.actionIconBadge,
                  styles.homeHouseSettingsButton,
                  styles.settingsGearBadge,
                  compactTopBar && styles.actionIconBadgeCompact,
                  compactTopBar && styles.actionIconBadgePhone,
                ]}
              >
                <Ionicons name="settings" size={compactTopBar ? 16 : 22} color="#0f172a" />
              </View>
            </button>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionIconBadge,
                styles.homeHouseSettingsButton,
                styles.settingsGearBadge,
                compactTopBar && styles.actionIconBadgeCompact,
                compactTopBar && styles.actionIconBadgePhone,
              ]}
              onPress={openFrontendSettings}
              activeOpacity={0.9}
            >
              <Ionicons name="settings" size={compactTopBar ? 16 : 22} color="#0f172a" />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.heroTopActionsSpacer} />
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
      enabled={Platform.OS !== 'web'}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          compactWebTopSpacing && styles.contentCompactWeb,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          lockSelectionTap(260);
        }}
        onMomentumScrollBegin={isWeb ? () => lockSelectionTap(260) : undefined}
        onScroll={isWeb ? () => lockSelectionTap(180) : undefined}
      >
        <View style={styles.heroCard}>
          {!isWeb ? renderHeroTopBar() : null}

          <View style={styles.frontendBrandBand}>
            <AppWordmark />
          </View>

          <View style={styles.frontendTitleBand}>
            <Text style={styles.title}>
              {!isRegistered ? heroPreAuthTitle : heroTitle}
            </Text>
          </View>

          {effectiveWorkspace?.salonName?.trim() ? (
            <View style={styles.connectedSalonBadge}>
              <Text style={styles.connectedSalonBadgeEyebrow}>
                {isManualRegistrationFlow ? 'Salone collegato per la registrazione' : 'Salone collegato'}
              </Text>
              <Text style={styles.connectedSalonBadgeName}>
                {effectiveWorkspace.salonName.trim()}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.subtitle, styles.subtitleCentered]}>
            {!isRegistered ? heroPreAuthSubtitle : tf('frontend_subtitle')}
          </Text>
          {isRegistered && isBookingStarted && notifiedWaitlistAlerts.length > 0 ? (
            <View style={styles.waitlistLiveBanner}>
              <View style={styles.waitlistLiveBannerHeader}>
                <View style={styles.waitlistLiveBannerIconWrap}>
                  <Ionicons name="sparkles-outline" size={18} color="#1d4ed8" />
                </View>
                <View style={styles.waitlistLiveBannerTextWrap}>
                  <Text style={styles.waitlistLiveBannerTitle}>
                    {notifiedWaitlistAlerts.length === 1 ? 'Uno slot si e liberato' : 'Ci sono slot liberati'}
                  </Text>
                  <Text style={styles.waitlistLiveBannerText}>
                    {(() => {
                      const latestAlert = notifiedWaitlistAlerts[0];
                      const serviceName = String(latestAlert?.requested_service_name ?? 'Servizio').trim();
                      const appointmentDate = String(latestAlert?.appointment_date ?? '').trim();
                      const appointmentTime = String(latestAlert?.appointment_time ?? '').trim().slice(0, 5);
                      const operatorName = String(latestAlert?.requested_operator_name ?? '').trim();
                      return [serviceName, appointmentDate ? formatDateCompact(appointmentDate) : '', appointmentTime, operatorName]
                        .filter(Boolean)
                        .join(' · ');
                    })()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.waitlistLiveBannerButton}
                onPress={() => {
                  setShowWaitlistAlertsExpanded(true);
                  requestAnimationFrame(() => {
                    markWaitlistAlertsAsViewed();
                    scrollRef.current?.scrollTo({ y: 0, animated: true });
                  });
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.waitlistLiveBannerButtonText}>Apri avvisi slot liberati</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        {!isRegistered && !hasResolvedOrIncomingSalonCode ? (
          <>
            <View style={styles.heroHighlightsRow}>
              <View style={styles.heroHighlightCard}>
                <Text style={styles.heroHighlightNumber}>{effectiveServizi.length}</Text>
                <Text style={styles.heroHighlightLabel}>{tf('frontend_bookable_services')}</Text>
              </View>

              <View style={styles.heroHighlightCardAccent}>
                <Text style={styles.heroHighlightNumber}>{giorniDisponibili.length}</Text>
                <Text style={styles.heroHighlightLabel}>{tf('frontend_available_days')}</Text>
              </View>
            </View>
          </>
        ) : isRegistered && !isBookingStarted ? (
          <>
            <View style={styles.heroInfoCard}>
              <Text style={styles.heroInfoEyebrow}>Profilo</Text>
              <Text style={styles.heroInfoTitle}>{tf('frontend_profile_active')}</Text>
              <Text style={styles.heroInfoName}>
                {formatDisplayPersonName(profile.nome, profile.cognome)}
              </Text>
              <Text style={styles.heroInfoEmail}>{profile.email}</Text>
              {salonAddress ? (
                <View style={styles.heroInfoAddressCard}>
                  <Ionicons name="location-outline" size={15} color="#64748b" />
                  <Text style={styles.heroInfoAddress}>{salonAddress}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.heroPrimaryButton}
                onPress={() => {
                  setShowRequestsExpanded(false);
                  setData(today);
                  setOra('');
                  setIsBookingStarted(true);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.heroPrimaryButtonText}>{tf('frontend_book')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>

      {showMissingSalonLinkWarning ? (
        <View style={styles.frontendSalonWarningCard}>
          <Text style={styles.frontendSalonWarningTitle}>Nessun salone collegato</Text>
          <Text style={styles.frontendSalonWarningText}>
            Vai su Inserisci codice salone, scrivi il codice del salone e poi tocca Seleziona salone.
          </Text>
          <TouchableOpacity
            style={styles.frontendSalonWarningButton}
            onPress={() => router.replace('/cliente-scanner')}
            activeOpacity={0.9}
          >
            <Text style={styles.frontendSalonWarningButtonText}>Vai a Inserisci codice salone</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isRegistered && !isBookingStarted ? (
        <View
          style={styles.sectionCard}
          onLayout={(event) => {
            const nextY = event.nativeEvent.layout.y;
            setRequestsSectionY(nextY);
            if (pendingRequestsSectionJumpRef.current) {
              requestAnimationFrame(() => {
                if (!pendingRequestsSectionJumpRef.current) {
                  return;
                }
                pendingRequestsSectionJumpRef.current = false;
                scrollFrontendToY(nextY - 18, !isWeb);
              });
            }
          }}
        >
          <View style={styles.requestsSectionHeader}>
            <Text style={styles.requestsSectionTitle}>{tf('frontend_my_bookings')}</Text>
            <Text style={styles.requestsSectionSubtitle}>
              {tf('frontend_my_bookings_hint')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.requestsToggleButton, styles.requestsToggleButtonInline]}
            onPress={toggleRequestsExpanded}
            activeOpacity={0.9}
            webTouchAction="manipulation"
          >
            <View style={styles.requestsToggleLead}>
              <View style={styles.requestsToggleLeadIcon}>
                <Ionicons
                  name={showRequestsExpanded ? 'folder-open-outline' : 'albums-outline'}
                  size={18}
                  color="#0f766e"
                />
              </View>
              <View style={styles.requestsToggleTextWrap}>
                <Text style={styles.requestsToggleTitle}>
                  {showRequestsExpanded ? 'Chiudi storico e notifiche' : 'Apri storico e notifiche'}
                </Text>
                <Text style={styles.requestsToggleSubtitle}>
                  Richieste, conferme e aggiornamenti del salone
                </Text>
              </View>
            </View>
            <View style={styles.requestsToggleActions}>
              {notificheRisposteCount > 0 ? (
                <View style={styles.requestsToggleBadge}>
                  <Text style={styles.requestsToggleBadgeText}>
                    {notificheRisposteCount > 99 ? '99+' : notificheRisposteCount}
                  </Text>
                </View>
              ) : null}
              <View style={styles.requestsToggleIconWrap}>
                <Ionicons
                  name={showRequestsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={26}
                  color="#0f766e"
                />
              </View>
            </View>
          </TouchableOpacity>

              {showRequestsExpanded ? (
            <>
              {!frontendAutoAcceptEnabled ? (
                <View style={styles.inlineNotificationsCard}>
                  <View style={styles.inlineNotificationsHeader}>
                    <Ionicons name="notifications-outline" size={16} color="#0f172a" />
                    <Text style={styles.inlineNotificationsTitle}>Notifiche</Text>
                  </View>
                  {notificheRisposteCount > 0 ? (
                    <Text style={styles.inlineNotificationsText}>
                      Hai {notificheRisposteCount > 99 ? '99+' : notificheRisposteCount} aggiornamenti sulle prenotazioni.
                    </Text>
                  ) : (
                    <Text style={styles.inlineNotificationsText}>Nessuna nuova notifica al momento.</Text>
                  )}
                </View>
              ) : null}
              {mieRichieste.length === 0 ? (
                <Text style={styles.sectionHint}>{tf('frontend_no_requests')}</Text>
              ) : (
                <View style={styles.requestSectionsContainer}>
                  <View style={styles.requestOverviewRow}>
                    <View style={[styles.requestOverviewCard, styles.requestOverviewCardPending]}>
                      <Text style={styles.requestOverviewValue}>{richiestePendenti.length}</Text>
                      <Text style={styles.requestOverviewLabel}>In attesa</Text>
                    </View>
                    <View style={[styles.requestOverviewCard, styles.requestOverviewCardAccepted]}>
                      <Text style={styles.requestOverviewValue}>{richiesteApprovate.length}</Text>
                      <Text style={styles.requestOverviewLabel}>Confermate</Text>
                    </View>
                    <View style={[styles.requestOverviewCard, styles.requestOverviewCardArchived]}>
                      <Text style={styles.requestOverviewValue}>{richiesteArchiviate.length}</Text>
                      <Text style={styles.requestOverviewLabel}>Storico</Text>
                    </View>
                  </View>

                  <View style={styles.requestSection}>
                    <Text style={styles.requestSectionTitle}>In attesa</Text>
                    <Text style={styles.requestSectionHint}>
                      Richieste inviate al salone e non ancora gestite.
                    </Text>
                    {richiestePendenti.length === 0 ? (
                      <Text style={styles.requestSectionEmpty}>Nessuna richiesta pendente al momento.</Text>
                    ) : null}
                    {richiestePendenti.map((item) =>
                      renderCustomerRequestCard(item, {
                        canCancel: item.stato === 'In attesa',
                        cancelLabel: 'Annulla richiesta',
                      })
                    )}
                  </View>

                  <View style={styles.requestSection}>
                    <Text style={styles.requestSectionTitle}>Confermate</Text>
                    <Text style={styles.requestSectionHint}>
                      Appuntamenti accettati dal salone e gia confermati.
                    </Text>
                    {richiesteApprovate.length === 0 ? (
                      <Text style={styles.requestSectionEmpty}>Nessuna richiesta approvata per ora.</Text>
                    ) : null}
                    {richiesteApprovate.map((item) =>
                      renderCustomerRequestCard(item, {
                        canCancel:
                          item.stato === 'Accettata' && canCancelUntilPreviousMidnight(item.data),
                        showCalendarButton: true,
                        showConfirmationHint: true,
                        showContactActions: true,
                      })
                    )}
                  </View>

                  {richiesteArchiviate.length > 0 ? (
                    <View style={[styles.requestSection, styles.requestSectionLast]}>
                      <Text style={styles.requestSectionTitle}>Storico</Text>
                      <Text style={styles.requestSectionHint}>
                        Richieste rifiutate o annullate, separate da quelle ancora attive.
                      </Text>
                      {richiesteArchiviatePerMese.map((group) => {
                        const expanded = archivedMonthExpanded[group.key] ?? false;
                        return (
                          <View key={group.key} style={styles.archivedMonthSection}>
                            <TouchableOpacity
                              style={styles.archivedMonthToggle}
                              onPress={() =>
                                setArchivedMonthExpanded((current) => ({
                                  ...current,
                                  [group.key]: !expanded,
                                }))
                              }
                              activeOpacity={0.9}
                            >
                              <View style={styles.archivedMonthToggleTextWrap}>
                                <Text style={styles.archivedMonthToggleTitle}>{group.label}</Text>
                                <Text style={styles.archivedMonthToggleCount}>
                                  {group.items.length} appuntamenti
                                </Text>
                              </View>
                              <View style={styles.archivedMonthToggleIconWrap}>
                                <Ionicons
                                  name={expanded ? 'chevron-up' : 'chevron-down'}
                                  size={18}
                                  color="#0f766e"
                                />
                              </View>
                            </TouchableOpacity>
                            {expanded
                              ? group.items.map((item) =>
                                  renderCustomerRequestCard(item, { compactHistory: true })
                                )
                              : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              )}
            </>
          ) : null}
        </View>
      ) : null}

      {isRegistered && waitlistAlertsForDisplay.length > 0 ? (
        <View style={styles.sectionCard}>
          <View style={styles.requestsSectionHeader}>
            <Text style={styles.requestsSectionTitle}>Avvisi slot liberati</Text>
            <Text style={styles.requestsSectionSubtitle}>
              Monitoraggio degli slot che hai scelto di seguire.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.requestsToggleButton, styles.requestsToggleButtonInline]}
            onPress={toggleWaitlistAlertsExpanded}
            activeOpacity={0.9}
            webTouchAction="manipulation"
          >
            <View style={styles.requestsToggleLead}>
              <View style={styles.requestsToggleLeadIcon}>
                <Ionicons
                  name={showWaitlistAlertsExpanded ? 'timer-outline' : 'time-outline'}
                  size={18}
                  color="#0f766e"
                />
              </View>
              <View style={styles.requestsToggleTextWrap}>
                <Text style={styles.requestsToggleTitle}>Avvisi slot liberati</Text>
                <Text style={styles.requestsToggleSubtitle}>
                  Slot monitorati, liberazioni e stato degli avvisi
                </Text>
              </View>
            </View>
            <View style={styles.requestsToggleActions}>
              {waitlistUnreadCount > 0 ? (
                <View style={styles.requestsToggleBadge}>
                  <Text style={styles.requestsToggleBadgeText}>
                    {waitlistUnreadCount > 99 ? '99+' : waitlistUnreadCount}
                  </Text>
                </View>
              ) : null}
              <View style={styles.requestsToggleIconWrap}>
                <Ionicons
                  name={showWaitlistAlertsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={26}
                  color="#0f766e"
                />
              </View>
            </View>
          </TouchableOpacity>

          {showWaitlistAlertsExpanded ? (
            <View style={styles.inlineNotificationsCard}>
              <View style={styles.inlineNotificationsHeader}>
                <Ionicons name="timer-outline" size={16} color="#0f172a" />
                <Text style={styles.inlineNotificationsTitle}>Avvisi Slot Liberati</Text>
              </View>
              <Text style={styles.inlineNotificationsText}>
                Qui trovi gli avvisi salvati sugli slot che volevi monitorare.
              </Text>
                <View style={styles.waitlistAlertsList}>
                {waitlistAlertsForDisplay.map((item) => {
                  const status = getDerivedWaitlistAlertStatus(item);
                  const statusLabel =
                    status === 'notified'
                      ? 'Slot libero'
                      : status === 'expired'
                        ? 'Scaduto'
                        : 'Attivo';
                  const statusStyle =
                    status === 'notified'
                      ? styles.waitlistAlertStatusNotified
                      : status === 'expired'
                        ? styles.waitlistAlertStatusExpired
                        : styles.waitlistAlertStatusWaiting;
                  const serviceName = String(item.requested_service_name ?? 'Servizio').trim();
                  const appointmentDate = String(item.appointment_date ?? '').trim();
                  const appointmentTime = String(item.appointment_time ?? '').trim().slice(0, 5);
                  const operatorName = String(item.requested_operator_name ?? '').trim();
                  const detailLine = [serviceName, appointmentDate ? formatDateCompact(appointmentDate) : '', appointmentTime]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.waitlistAlertCard,
                        isWeb &&
                          mediumFrontendCards && {
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                          },
                        isWeb &&
                          compactFrontendCards && {
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                            gap: 5,
                          },
                      ]}>
                      <View
                        style={[
                          styles.waitlistAlertTopRow,
                          isWeb &&
                            compactFrontendCards && {
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                            },
                        ]}>
                        <Text
                          style={[
                            styles.waitlistAlertTitle,
                            isWeb &&
                              compactFrontendCards && {
                                textAlign: 'center',
                              },
                          ]}
                          numberOfLines={compactFrontendCards ? 2 : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.82}
                        >
                          {detailLine}
                        </Text>
                        <View style={[styles.waitlistAlertStatusChip, statusStyle]}>
                          <Text style={styles.waitlistAlertStatusText}>{statusLabel}</Text>
                        </View>
                      </View>
                      {operatorName ? (
                        <Text
                          style={[
                            styles.waitlistAlertMeta,
                            isWeb &&
                              compactFrontendCards && {
                                textAlign: 'center',
                              },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          Operatore: {operatorName}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.waitlistAlertMeta,
                            isWeb &&
                              compactFrontendCards && {
                                textAlign: 'center',
                              },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          Operatore: Salone
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.waitlistAlertMeta,
                          isWeb &&
                            compactFrontendCards && {
                              textAlign: 'center',
                            },
                        ]}
                        numberOfLines={compactFrontendCards ? 3 : 2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        {status === 'notified'
                          ? 'Uno slot compatibile si è liberato. Apri Prenota e confermalo subito.'
                          : status === 'expired'
                            ? 'L’avviso è scaduto senza una nuova prenotazione.'
                            : 'L’avviso è attivo. Ti avviseremo appena si libera uno slot compatibile.'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {ultimaRichiesta && !isBookingStarted ? (
        <View style={[styles.confirmationCard, isWeb && styles.confirmationCardWeb]}>
          <View style={[styles.confirmationTopRow, isWeb && styles.confirmationTopRowWeb]}>
            <View style={styles.confirmationIconWrap}>
              <Ionicons name="paper-plane-outline" size={22} color="#0f766e" />
            </View>
            <View style={[styles.confirmationTextWrap, isWeb && styles.confirmationTextWrapWeb]}>
              <Text style={styles.confirmationEyebrow}>{tf('frontend_request_sent')}</Text>
              <Text style={styles.confirmationTitle}>
                {ultimaRichiesta.servizio} per {ultimaRichiesta.nomeCompleto}
              </Text>
              {ultimaRichiesta.operatoreNome ? (
                <Text style={styles.confirmationOperator}>
                  Operatore: {ultimaRichiesta.operatoreNome}
                </Text>
              ) : null}
              {salonActivityCategory ? (
                <View style={styles.requestCategoryChip}>
                  <Text style={styles.requestCategoryChipText}>{salonActivityCategory}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.confirmationSummaryGrid, isWeb && styles.confirmationSummaryGridWeb]}>
            <View style={styles.confirmationSummaryBox}>
              <Text style={styles.confirmationSummaryLabel}>Data</Text>
              <Text style={styles.confirmationSummaryValue}>
                {formatDateCompact(ultimaRichiesta.data)}
              </Text>
            </View>

            <View style={styles.confirmationSummaryBox}>
              <Text style={styles.confirmationSummaryLabel}>Ora</Text>
              <Text style={styles.confirmationSummaryValue}>{ultimaRichiesta.ora}</Text>
            </View>
          </View>

          <View style={styles.confirmationDetailsCard}>
            <Text style={styles.confirmationDetailsText}>
              {formatDateLong(ultimaRichiesta.data)}
            </Text>
            <Text style={styles.confirmationDetailsText}>
              Il salone deve ancora accettare questa prenotazione.
            </Text>
            {salonAddress ? (
              <Text style={styles.confirmationDetailsText}>
                Indirizzo salone: {salonAddress}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.clientHomeButton}
            onPress={resetFrontendCliente}
            activeOpacity={0.9}
          >
            <Text style={styles.clientHomeButtonText}>{tf('frontend_return_home')}</Text>
          </TouchableOpacity>
          {salonBusinessPhone ? (
            <View style={[styles.confirmationActionsRow, isWeb && styles.confirmationActionsRowWeb]}>
              <TouchableOpacity
                style={[styles.inlineWhatsappButton, isWeb && styles.inlineContactButtonWeb]}
                onPress={scriviWhatsAppSalone}
                activeOpacity={0.9}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                <Text style={styles.inlineWhatsappButtonText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineCallButton, isWeb && styles.inlineContactButtonWeb]}
                onPress={chiamaSalone}
                activeOpacity={0.9}
              >
                <Ionicons name="call-outline" size={16} color="#0f766e" />
                <Text style={styles.inlineCallButtonText}>Chiama</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          </View>
        ) : null}

      {!isRegistered ? (
        <>
          <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  {shouldForceSalonLogin
                    ? 'Accedi al salone collegato'
                    : isManualRegistrationFlow
                      ? 'Completa registrazione cliente'
                      : 'Entra nel salone collegato'}
                </Text>
                <Text style={styles.authIntroText}>
                  {shouldForceSalonLogin
                      ? 'Per questo salone esiste già un profilo salvato sul dispositivo. Accedi e poi entri direttamente nell’area cliente.'
                      : isManualRegistrationFlow
                        ? 'Stai creando un nuovo profilo cliente collegato a questo salone. Dopo il salvataggio potrai accedere e aprire Prenota.'
                      : 'Prima scegli se accedere con un profilo già esistente oppure creare un nuovo profilo cliente per questo salone.'}
                </Text>
                {hasResolvedOrIncomingSalonCode ? (
                  <Text style={styles.authQrHint}>
                    Il salone è già stato rilevato: il profilo verrà collegato automaticamente al salone corretto.
                  </Text>
                ) : null}
                {shouldShowAccessModeSwitcher ? (
                <View style={styles.accessModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.accessModeButton,
                      activeAccessMode === 'login' && styles.accessModeButtonActive,
                    ]}
                    onPress={() => setAccessMode('login')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.accessModeButtonText,
                        activeAccessMode === 'login' && styles.accessModeButtonTextActive,
                      ]}
                    >
                      Accedi
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.accessModeButton,
                      activeAccessMode === 'register' && styles.accessModeButtonActive,
                    ]}
                    onPress={() => setAccessMode('register')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.accessModeButtonText,
                        activeAccessMode === 'register' && styles.accessModeButtonTextActive,
                      ]}
                    >
                      Registrati
                    </Text>
                  </TouchableOpacity>
                </View>
                ) : null}
              </View>

              {activeAccessMode === 'login' ? (
            <View style={[styles.sectionCard, styles.authSectionCard]}>
              <Text style={styles.sectionEyebrow}>Accesso</Text>
              <Text style={styles.authSectionTitle}>Accedi</Text>
              <Text style={styles.authSectionDescription}>
                {hasResolvedOrIncomingSalonCode
                  ? 'Inserisci email e cellulare già usati in questo salone per entrare direttamente nell’area cliente.'
                  : 'Accedi con email e cellulare già registrati nello stesso salone.'}
              </Text>
              <TextInput
                ref={emailInputRef}
                style={[styles.input, styles.authInput, profileFieldErrors.email && styles.inputError]}
                placeholder={`${tf('common_email')} (obbligatoria)`}
                placeholderTextColor="#8f8f8f"
                keyboardType="email-address"
                autoCapitalize="none"
                value={profile.email}
                onChangeText={(value) => {
                  setProfile((current) => ({ ...current, email: value }));
                  if (profileFieldErrors.email) {
                    setProfileFieldErrors((current) => ({ ...current, email: undefined }));
                  }
                }}
                onFocus={() => handleFieldFocus(emailInputRef)}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!shouldAutoAdvanceField) return;
                  focusField(telefonoInputRef);
                }}
                blurOnSubmit={!shouldAutoAdvanceField}
              />
              {profileFieldErrors.email ? (
                <Text style={styles.fieldErrorText}>{profileFieldErrors.email}</Text>
              ) : null}
              <TextInput
                ref={telefonoInputRef}
                style={[styles.input, styles.authInput, profileFieldErrors.telefono && styles.inputError]}
                placeholder="Cellulare (obbligatorio)"
                placeholderTextColor="#8f8f8f"
                keyboardType="phone-pad"
                value={profile.telefono}
                onChangeText={(value) => {
                  setProfile((current) => ({
                    ...current,
                    telefono: limitPhoneToTenDigits(value),
                  }));
                  if (profileFieldErrors.telefono) {
                    setProfileFieldErrors((current) => ({
                      ...current,
                      telefono: undefined,
                    }));
                  }
                }}
                onFocus={() => handleFieldFocus(telefonoInputRef)}
                returnKeyType="done"
                onSubmitEditing={blurOnSubmit}
                blurOnSubmit={!shouldAutoAdvanceField}
              />
              {profileFieldErrors.telefono ? (
                <Text style={styles.fieldErrorText}>{profileFieldErrors.telefono}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryButton, styles.authActionButton, isSavingProfile && styles.primaryButtonDisabled]}
                onPress={() => {
                  Keyboard.dismiss();
                  setProfileSaveError('');
                  void loginFrontendCliente();
                }}
                activeOpacity={0.9}
                disabled={isSavingProfile}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoadingSalon
                    ? 'Caricamento salone...'
                  : isSavingProfile
                      ? 'Accesso in corso...'
                      : tf('auth_login_button')}
                </Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && frontendBiometricEnabled ? (
                <TouchableOpacity
                  style={[
                    styles.authBiometricBackendButton,
                    frontendBiometricBusy && styles.primaryButtonDisabled,
                  ]}
                  onPress={() => {
                    void unlockFrontendClienteWithBiometric();
                  }}
                  activeOpacity={0.9}
                  disabled={frontendBiometricBusy}
                >
                  <View style={styles.authBiometricBackendContent}>
                    <View style={styles.authBiometricBackendIcon}>
                      <Ionicons
                        name={frontendBiometricType === 'faceid' ? 'scan-outline' : 'finger-print-outline'}
                        size={18}
                        color="#0F172A"
                      />
                    </View>
                    <View style={styles.authBiometricBackendTextWrap}>
                      <Text style={styles.authBiometricBackendTitle}>
                        {frontendBiometricBusy
                          ? 'Verifica biometrica...'
                          : frontendBiometricType === 'faceid'
                            ? 'Accedi con Face ID'
                            : 'Accedi con impronta / biometria'}
                      </Text>
                      <Text style={styles.authBiometricBackendHint}>
                        Accesso rapido con il profilo cliente già salvato su questo dispositivo.
                      </Text>
                    </View>
                    <View style={styles.authBiometricBackendArrow}>
                      <Ionicons name="chevron-forward" size={18} color="#64748B" />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
              ) : (
            <View style={[styles.sectionCard, styles.authSectionCard, styles.authRegisterSectionCard]}>
              <Text style={styles.sectionEyebrow}>Registrazione</Text>
              <Text style={styles.authSectionTitle}>Registrati</Text>
              <Text style={styles.authSectionDescription}>
                {hasResolvedOrIncomingSalonCode
                  ? 'Compila i dati del cliente e crea il primo profilo collegato a questo salone.'
                  : 'Compila i tuoi dati e registra il profilo cliente sul salone selezionato.'}
              </Text>
              <TextInput
                ref={nomeInputRef}
                style={[styles.input, styles.authInput]}
                placeholder={`${tf('auth_first_name_placeholder')} (obbligatorio)`}
                placeholderTextColor="#8f8f8f"
                autoCapitalize="characters"
                value={profile.nome}
                onChangeText={(value) =>
                  setProfile((current) => ({
                    ...current,
                    nome: normalizeCustomerNameInput(value),
                  }))
                }
                onFocus={() => handleFieldFocus(nomeInputRef)}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!shouldAutoAdvanceField) return;
                  focusField(cognomeInputRef);
                }}
                blurOnSubmit={!shouldAutoAdvanceField}
              />
              <TextInput
                ref={cognomeInputRef}
                style={[styles.input, styles.authInput]}
                placeholder={`${tf('auth_last_name_placeholder')} (obbligatorio)`}
                placeholderTextColor="#8f8f8f"
                autoCapitalize="characters"
                value={profile.cognome}
                onChangeText={(value) =>
                  setProfile((current) => ({
                    ...current,
                    cognome: normalizeCustomerNameInput(value),
                  }))
                }
                onFocus={() => handleFieldFocus(cognomeInputRef)}
                returnKeyType="done"
                onSubmitEditing={blurOnSubmit}
                blurOnSubmit
              />
              <TextInput
                style={[styles.input, styles.authInput, profileFieldErrors.email && styles.inputError]}
                placeholder={`${tf('common_email')} (obbligatorio)`}
                placeholderTextColor="#8f8f8f"
                keyboardType="email-address"
                autoCapitalize="none"
                value={profile.email}
                onChangeText={(value) => {
                  setProfile((current) => ({ ...current, email: value }));
                  if (profileFieldErrors.email) {
                    setProfileFieldErrors((current) => ({ ...current, email: undefined }));
                  }
                }}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!shouldAutoAdvanceField) return;
                  focusField(telefonoInputRef);
                }}
                blurOnSubmit={!shouldAutoAdvanceField}
              />
              <TextInput
                style={[styles.input, styles.authInput, profileFieldErrors.telefono && styles.inputError]}
                placeholder="Cellulare (obbligatorio)"
                placeholderTextColor="#8f8f8f"
                keyboardType="phone-pad"
                value={profile.telefono}
                onChangeText={(value) => {
                  setProfile((current) => ({
                    ...current,
                    telefono: limitPhoneToTenDigits(value),
                  }));
                  if (profileFieldErrors.telefono) {
                    setProfileFieldErrors((current) => ({
                      ...current,
                      telefono: undefined,
                    }));
                  }
                }}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!shouldAutoAdvanceField) return;
                  focusField(instagramInputRef);
                }}
                blurOnSubmit={!shouldAutoAdvanceField}
              />
              <TextInput
                ref={instagramInputRef}
                style={[styles.input, styles.authInput]}
                placeholder="Instagram (facoltativo)"
                placeholderTextColor="#8f8f8f"
                autoCapitalize="none"
                value={profile.instagram}
                onChangeText={(value) => setProfile((current) => ({ ...current, instagram: value }))}
                onFocus={() => handleFieldFocus(instagramInputRef)}
                returnKeyType="done"
                onSubmitEditing={blurOnSubmit}
              />
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.authActionButton,
                  (!canRegisterClient || isSavingProfile) && styles.primaryButtonDisabled,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setProfileSaveError('');
                  void saveProfile();
                }}
                activeOpacity={0.9}
                disabled={isSavingProfile || !canRegisterClient}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoadingSalon
                    ? 'Caricamento salone...'
                    : isSavingProfile
                      ? 'Creazione profilo...'
                      : tf('auth_register_button')}
                </Text>
              </TouchableOpacity>
              {profileSaveError ? <Text style={styles.sectionHint}>{profileSaveError}</Text> : null}
            </View>
              )}
          </>
        </>
      ) : null}

      {isRegistered && isBookingStarted ? (
        <>
          <View style={styles.stepsRow}>
            <View style={[styles.stepItem, !servizio.trim() && styles.stepItemActive]}>
              <Text style={[styles.stepBadge, !servizio.trim() && styles.stepBadgeActive]}>1</Text>
              <Text style={[styles.stepText, !servizio.trim() && styles.stepTextActive]}>
                {tf('frontend_step_service')}
              </Text>
            </View>
            <View style={[styles.stepItem, !!servizio.trim() && !data && styles.stepItemActive]}>
              <Text style={[styles.stepBadge, !!servizio.trim() && !data && styles.stepBadgeActive]}>
                2
              </Text>
              <Text style={[styles.stepText, !!servizio.trim() && !data && styles.stepTextActive]}>
                {tf('frontend_step_day')}
              </Text>
            </View>
            <View style={[styles.stepItem, isOperatorStepHighlighted && styles.stepItemActive]}>
              <Text style={[styles.stepBadge, isOperatorStepHighlighted && styles.stepBadgeActive]}>
                3
              </Text>
              <Text style={[styles.stepText, isOperatorStepHighlighted && styles.stepTextActive]}>
                {operatorSelectionRequired ? 'Operatore' : tf('frontend_step_time')}
              </Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>4</Text>
              <Text style={styles.stepText}>
                {operatorSelectionRequired ? tf('frontend_step_time') : tf('frontend_step_note')}
              </Text>
            </View>
            {operatorSelectionRequired ? (
              <View style={styles.stepItem}>
                <Text style={styles.stepBadge}>5</Text>
                <Text style={styles.stepText}>{tf('frontend_step_note')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Step 1</Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_service')}</Text>
            {isWeb ? (
              <View
                ref={servicesWebStripRef}
                style={[
                  styles.servicesScrollViewWeb,
                  webHorizontalScrollTouchStyle,
                  styles.webNativeHorizontalHost,
                ]}
                // @ts-expect-error web-only wheel forwarding
                onWheel={(e: unknown) => applyWebHorizontalStripWheelToHost(servicesWebStripRef, e)}
              >
                <View style={[styles.servicesScrollContent, styles.webNativeHorizontalRow]}>
                  {renderBookingServiceCards()}
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.servicesScrollContent}
              >
                {renderBookingServiceCards()}
              </ScrollView>
            )}
          </View>

          <View style={[styles.sectionCard, !canChooseDay && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>Step 2</Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_day')}</Text>
            {!canChooseDay ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
            ) : null}
            {canChooseDay ? (
              <FrontendBookingDayPicker
                giorniDisponibili={giorniDisponibili}
                selectedDate={data}
                canChooseDay={canChooseDay}
                today={today}
                tf={tf}
                availabilitySettings={effectiveAvailabilitySettings}
                onSelectDate={(nextDate) => {
                  handleDayCardPress(nextDate);
                  if (showDatePicker) {
                    setShowDatePicker(false);
                  }
                }}
                onJumpToday={() => {
                  handleDayCardPress(today);
                }}
              />
            ) : null}
            <TouchableOpacity
              style={styles.frontendBookingCalendarButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="grid-outline" size={16} color="#334155" />
              <Text style={styles.frontendBookingCalendarButtonText}>Apri calendario completo</Text>
            </TouchableOpacity>
            <Text style={styles.frontendBookingDayHint}>
              Un tap seleziona il giorno disponibile. Se preferisci, puoi aprire anche il calendario
              completo.
            </Text>
          </View>

          {serviceUsesOperatorScheduling ? (
            <View
              style={[
                styles.sectionCard,
                !canChooseOperator && styles.sectionCardLocked,
                isOperatorStepHighlighted && styles.sectionCardActiveFocus,
              ]}
            >
              <Text style={styles.sectionEyebrow}>Step 3</Text>
              <Text style={styles.sectionTitle}>Scegli operatore</Text>
              {!canChooseOperator ? (
                <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
              ) : null}
              {isOperatorStepHighlighted ? (
                <View style={styles.operatorStepCallout}>
                  <Ionicons name="hand-left-outline" size={18} color="#1d4ed8" />
                  <Text style={styles.operatorStepCalloutText}>
                    Ultimo passaggio prima degli orari: scegli uno dei due operatori.
                  </Text>
                </View>
              ) : null}
              {canChooseOperator && operatoriCompatibili.length === 0 ? (
                <Text style={styles.lockedSectionText}>
                  Nessun operatore disponibile per questo servizio nella data scelta.
                </Text>
              ) : null}
              {operatorSelectionRequired ? (
                <View style={styles.operatorSelectionGrid}>
                  {operatoriCompatibili.map((item) => {
                    const selected = item.id === operatoreId;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.operatorSelectionCard,
                          isOperatorStepHighlighted && styles.operatorSelectionCardPrompt,
                          selected && styles.operatorSelectionCardActive,
                        ]}
                        onPress={() => {
                          if (shouldIgnoreSelectionTap()) return;
                          if (!canChooseOperator) return;
                          setOperatoreId(item.id);
                          setOperatoreNome(item.nome);
                          setOra('');
                        }}
                        activeOpacity={canChooseOperator ? 0.9 : 1}
                        disabled={!canChooseOperator}
                      >
                        <View
                          style={[
                            styles.operatorSelectionPill,
                            selected && styles.operatorSelectionPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.operatorSelectionPillText,
                              selected && styles.operatorSelectionPillTextActive,
                            ]}
                          >
                            {selected ? 'Selezionato' : 'Seleziona'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.operatorSelectionName,
                            selected && styles.operatorSelectionNameActive,
                          ]}
                        >
                          {item.nome}
                        </Text>
                        <Text
                          style={[
                            styles.operatorSelectionRole,
                            selected && styles.operatorSelectionRoleActive,
                          ]}
                        >
                          {item.mestiere}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : operatoriCompatibili.length === 1 ? (
                <Text style={styles.lockedSectionText}>
                  Operatore assegnato automaticamente: {operatoriCompatibili[0]?.nome}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.sectionCard, !canChooseTime && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>
              {operatorSelectionRequired ? 'Step 4' : 'Step 3'}
            </Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_time')}</Text>
            {!canChooseTime ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_times')}</Text>
            ) : null}
            {guidedSlotsActive ? (
              <Text style={styles.guidedTimeInlineNotice}>
                Modalita slot guidati attiva per questo servizio.
              </Text>
            ) : null}
            {canChooseTime && servizio.trim() && !canAnySlotBeBooked ? (
              <Text style={styles.lockedSectionText}>
                Nessuno slot libero per questo servizio nel giorno selezionato.
              </Text>
            ) : null}
            {renderFrontendBookingTimesContent()}
            {waitlistSlotBlocks.length > 0 ? (
              <View style={styles.waitlistSection}>
                <Text style={styles.waitlistSectionTitle}>Avvisi disponibilità</Text>
                <Text style={styles.waitlistSectionHint}>
                  Attiva un avviso solo per gli orari occupati da altri clienti.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.waitlistButton,
                    styles.waitlistDayButton,
                    isCurrentDayWaitlistActive && styles.waitlistButtonActive,
                  ]}
                  onPress={() => {
                    if (waitlistSubmittingKeys.has(currentDayWaitlistSelectionKey)) {
                      return;
                    }
                    if (isCurrentDayWaitlistActive) {
                      void cancelWaitlistForSlots({
                        slotTimes: currentDayActiveWaitlistSlotTimes,
                        actionKey: currentDayWaitlistSelectionKey,
                        successMessage: (cancelledCount) =>
                          cancelledCount === 1
                            ? 'Ho annullato l’avviso attivo per la giornata.'
                            : `Ho annullato ${cancelledCount} avvisi attivi per la giornata.`,
                      });
                      return;
                    }
                    void handleJoinWaitlistDay();
                  }}
                  activeOpacity={waitlistSubmittingKeys.has(currentDayWaitlistSelectionKey) ? 1 : 0.9}
                  disabled={waitlistSubmittingKeys.has(currentDayWaitlistSelectionKey)}
                >
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.58}
                    style={[
                      styles.waitlistButtonText,
                      isCurrentDayWaitlistActive && styles.waitlistButtonTextActive,
                    ]}
                  >
                    {waitlistSubmittingKeys.has(currentDayWaitlistSelectionKey)
                      ? 'Salvataggio...'
                      : isCurrentDayWaitlistActive
                        ? 'Annulla avviso giornata'
                        : 'Avvisami se si libera qualsiasi orario in giornata'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.waitlistBlockList}>
                  {waitlistSlotBlocks.map((block) => {
                    const blockActionKey = `block:${block.id}|${waitlistOperatorKey}`;
                    const blockAlreadyActive =
                      !isCurrentDayWaitlistActive &&
                      block.slotTimes.some((slotTime) =>
                        currentDayActiveWaitlistSlotTimesSet.has(slotTime)
                      );
                    const blockLabel =
                      block.startTime === block.endTime
                        ? `Orario occupato: ${block.startTime}`
                        : `Blocco occupato: ${block.startTime} - ${block.endTime}`;

                    return (
                      <View key={block.id} style={styles.waitlistBlockCard}>
                        <Text style={styles.waitlistBlockTitle}>{blockLabel}</Text>
                        <TouchableOpacity
                          style={[
                            styles.waitlistButton,
                            blockAlreadyActive && styles.waitlistButtonActive,
                          ]}
                          onPress={() => {
                            if (waitlistSubmittingKeys.has(blockActionKey)) {
                              return;
                            }
                            if (isCurrentDayWaitlistActive) {
                              void (async () => {
                                const cancelled = await cancelWaitlistForSlots({
                                  slotTimes: currentDayActiveWaitlistSlotTimes,
                                  actionKey: currentDayWaitlistSelectionKey,
                                  successMessage: () => '',
                                  suppressSuccessAlert: true,
                                });
                                if (!cancelled) {
                                  return;
                                }
                                await handleJoinWaitlistBlock(block);
                              })();
                              return;
                            }
                            if (blockAlreadyActive) {
                              void cancelWaitlistForSlots({
                                slotTimes: block.slotTimes,
                                actionKey: blockActionKey,
                                successMessage: (cancelledCount) =>
                                  cancelledCount === 1
                                    ? 'Ho annullato l’avviso per questo orario.'
                                    : `Ho annullato ${cancelledCount} avvisi per questo blocco.`,
                              });
                              return;
                            }
                            void handleJoinWaitlistBlock(block);
                          }}
                          activeOpacity={waitlistSubmittingKeys.has(blockActionKey) ? 1 : 0.9}
                          disabled={waitlistSubmittingKeys.has(blockActionKey)}
                        >
                          <Text
                            numberOfLines={2}
                            ellipsizeMode="clip"
                            adjustsFontSizeToFit
                            minimumFontScale={0.58}
                            style={[
                              styles.waitlistButtonText,
                              blockAlreadyActive && styles.waitlistButtonTextActive,
                            ]}
                          >
                            {waitlistSubmittingKeys.has(blockActionKey)
                              ? 'Salvataggio...'
                              : blockAlreadyActive
                                ? 'Annulla avviso'
                                : 'Avvisami se si libera'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {overlapsLunchBreakSelection ? (
              <Text style={styles.errorText}>{tf('frontend_lunch_overlap_text')}</Text>
            ) : null}
            {!servizio ? (
              <Text style={styles.sectionHint}>{tf('frontend_select_service_for_times')}</Text>
            ) : null}
          </View>

          <View style={[styles.sectionCard, !canWriteNote && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>
              {operatorSelectionRequired ? 'Step 5' : 'Step 4'}
            </Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_note')}</Text>
            {!canWriteNote ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_note')}</Text>
            ) : null}
            <TextInput
              ref={noteInputRef}
              style={[styles.input, styles.noteInput]}
              placeholder={tf('frontend_note_placeholder')}
              placeholderTextColor="#8f8f8f"
              multiline
              value={note}
              onChangeText={setNote}
              onFocus={() => handleFieldFocus(noteInputRef)}
              returnKeyType="done"
              onSubmitEditing={blurOnSubmit}
              editable={canWriteNote}
            />
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionEyebrow}>Conferma</Text>
            <Text style={styles.summaryTitle}>{tf('frontend_request_summary')}</Text>
            <Text style={styles.summaryText}>
              Cliente: {formatDisplayPersonName(profile.nome, profile.cognome)}
            </Text>
            <Text style={styles.summaryText}>Data: {formatDateCompact(data)}</Text>
            <Text style={styles.summaryText}>Ora: {ora || '—'}</Text>
            <Text style={styles.summaryText}>Servizio: {servizio || '—'}</Text>
            {operatorSelectionRequired ? (
              <Text style={styles.summaryText}>Operatore: {operatoreNome || '—'}</Text>
            ) : null}
            <Text style={styles.summaryText}>
              Prezzo: {servizioSelezionato ? `€ ${servizioSelezionato.prezzo.toFixed(2)}` : '—'}
            </Text>
            {Platform.OS === 'web' ? (
              <button
                type="button"
                onPointerUp={(event) => {
                  event.preventDefault();
                  triggerFrontendBookingSubmit();
                }}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  triggerFrontendBookingSubmit();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  triggerFrontendBookingSubmit();
                }}
                disabled={bookingRequestSubmitting}
                style={{
                  width: '100%',
                  minHeight: '54px',
                  borderRadius: '18px',
                  border: 'none',
                  background: bookingRequestSubmitting ? '#CBD5E1' : '#1F2A44',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 900,
                  cursor: bookingRequestSubmitting ? 'not-allowed' : 'pointer',
                  opacity: canSendRequest ? 1 : 0.62,
                  boxShadow: bookingRequestSubmitting ? 'none' : '0 12px 24px rgba(31,42,68,0.24)',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  touchAction: 'manipulation',
                }}
              >
                {bookingRequestSubmitting ? 'Invio in corso...' : tf('frontend_send_booking')}
              </button>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, !canSendRequest && styles.primaryButtonDisabled]}
                onPress={inviaRichiesta}
                activeOpacity={0.9}
                disabled={bookingRequestSubmitting}
              >
                <Text style={styles.primaryButtonText}>
                  {bookingRequestSubmitting ? 'Invio in corso...' : tf('frontend_send_booking')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          </>
        ) : null}
      </ScrollView>
      {isWeb ? (
        <View pointerEvents="box-none" style={styles.webTopBarOverlay}>
          {renderHeroTopBar()}
        </View>
      ) : null}
      <NativeDatePickerModal
        visible={showDatePicker}
        title={tf('frontend_choose_day')}
        initialValue={data}
        minimumDate={getTodayDateString()}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(value) => {
          const availability = getDateAvailabilityInfo(effectiveAvailabilitySettings, value);
          if (availability.closed || !canChooseDay) {
            setShowDatePicker(false);
            return;
          }

          startTransition(() => {
            setData(value);
          });
          if (
            ora &&
            servizio &&
            hasFrontendSlotSelectionConflict({
              dateValue: value,
              startTime: ora,
              serviceName: servizio,
              selectedOperatorId: operatoreId || null,
              selectedOperatorName: operatoreNome || null,
              operators: effectiveOperatori,
              appointments: effectiveBlockingAppointments,
              services: effectiveServizi,
              settings: effectiveAvailabilitySettings,
            })
          ) {
            setOra('');
          }
          setShowDatePicker(false);
        }}
      />
      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 61,
    paddingBottom: 132,
  },
  contentCompactWeb: {
    paddingTop: 56,
    paddingHorizontal: 14,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  webTopBarOverlay: {
    position: 'fixed',
    top: 61,
    left: 28,
    right: 28,
    zIndex: 220,
    elevation: 220,
  } as unknown as ViewStyle,
  heroTopRow: {
    position: 'absolute',
    top: 14,
    right: 14,
    left: 14,
    zIndex: 80,
    elevation: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  heroTopRowWebOverlay: {
    position: 'relative',
    top: 14,
    right: 0,
    left: 0,
    alignItems: 'center',
  },
  heroTopRowCompact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroTopLeftCluster: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 10,
    flexShrink: 0,
    zIndex: 120,
    elevation: 120,
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    gap: 10,
    paddingRight: 0,
    zIndex: 120,
    elevation: 120,
  },
  heroTopActionsCompact: {
    justifyContent: 'flex-end',
    alignSelf: 'auto',
    flexWrap: 'nowrap',
    gap: 3,
    paddingRight: 0,
  },
  heroTopActionsSpacer: {
    minWidth: 1,
    minHeight: 1,
    flexShrink: 1,
  },
  actionIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 0,
    borderColor: 'transparent',
    zIndex: 140,
    elevation: 140,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  actionIconBadgeCompact: {
    width: 42,
    height: 42,
    borderRadius: 15,
  },
  actionIconBadgePhone: {
    width: 38,
    height: 38,
    borderRadius: 13,
  },
  homeHouseSettingsButton: {
    backgroundColor: '#E8F0FB',
    borderColor: 'transparent',
    shadowColor: '#8EA9D1',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginTop: 0,
  },
  settingsGearBadge: {
    backgroundColor: '#DCEAFE',
    borderColor: 'transparent',
    shadowColor: '#7DA2D6',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  notificationsTopBadge: {
    backgroundColor: '#ECFEFF',
    borderColor: 'transparent',
    shadowColor: '#14b8a6',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  notificationsTopCountBadge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  notificationsTopCountBadgeCompact: {
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
  },
  notificationsTopCountBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  notificationsTopCountBadgeTextCompact: {
    fontSize: 9,
    lineHeight: 10,
  },
  logoutTopBadge: {
    backgroundColor: '#fff1f2',
    borderColor: 'transparent',
    shadowColor: '#fda4af',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  publicBadge: {
    backgroundColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  publicBadgeCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  publicBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  publicBadgeTextCompact: {
    fontSize: 10,
  },
  frontendBrandBand: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: -2,
  },
  frontendTitleBand: {
    width: '100%',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 80,
    marginBottom: -2,
  },
  frontendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0 : -0.5,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  connectedSalonBadge: {
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#d9e6fb',
    shadowColor: '#8A7358',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  connectedSalonBadgeEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  connectedSalonBadgeName: {
    flexShrink: 1,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#1b2a42',
    textAlign: 'center',
    fontFamily: appFonts.displayScript,
    textShadowColor: 'rgba(15, 23, 42, 0.16)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  subtitle: {
    maxWidth: 520,
    fontSize: 16,
    lineHeight: 24,
    color: '#64748B',
    textAlign: 'center',
    marginTop: -2,
  },
  subtitleCentered: {
    alignSelf: 'center',
  },
  salonCategoryChip: {
    alignSelf: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  salonCategoryChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#315ea8',
  },
  heroHighlightsRow: {
    flexDirection: 'row',
    marginTop: 18,
    marginBottom: 14,
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
  },
  heroHighlightCard: {
    flex: 1,
    backgroundColor: '#F8FBFF',
    borderRadius: 24,
    padding: 18,
    marginRight: 10,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroHighlightCardAccent: {
    flex: 1,
    backgroundColor: '#F2FBF6',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroHighlightNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  heroHighlightLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  heroInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 30,
    padding: 22,
    marginTop: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    alignItems: 'center',
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  heroInfoEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: IS_ANDROID ? 0.2 : 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
    includeFontPadding: true,
  },
  heroInfoTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroInfoText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },
  heroInfoName: {
    fontSize: 16,
    lineHeight: 22,
    color: '#0f172a',
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroInfoEmail: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    fontWeight: '700',
    textAlign: 'center',
  },
  heroInfoCategoryChip: {
    alignSelf: 'center',
    backgroundColor: '#EAF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  heroInfoCategoryChipText: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
  },
  heroInfoAddressCard: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 650,
  },
  heroInfoAddress: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#111111',
    fontWeight: '700',
    marginLeft: 8,
    textAlign: 'center',
  },
  salonAccessCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 30,
    padding: 20,
    marginTop: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    alignItems: 'center',
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  salonAccessTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  salonCodeInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111111',
    width: '100%',
    maxWidth: 1120,
    textAlign: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    alignSelf: 'center',
    textAlignVertical: IS_ANDROID ? 'center' : 'auto',
    includeFontPadding: true,
  },
  salonCodeButton: {
    marginTop: 10,
    width: '100%',
    maxWidth: 1120,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  salonCodeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: appFonts.displayCondensed,
    letterSpacing: IS_ANDROID ? 0.4 : 1.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  salonAccessFooter: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salonAccessHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  salonAccessLoading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f837b',
    marginTop: 4,
    textAlign: 'center',
  },
  salonAccessError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
  salonContactRow: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    borderWidth: 0,
    borderColor: 'transparent',
    width: '100%',
  },
  salonContactInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  salonContactActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  salonContactLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  salonContactValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  salonWhatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dff6ed',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  salonWhatsappButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  salonCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcecff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  salonCallButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#315ea8',
  },
  waitlistLiveBanner: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    shadowColor: '#60a5fa',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  waitlistLiveBannerHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  waitlistLiveBannerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  waitlistLiveBannerTextWrap: {
    flexShrink: 1,
    gap: 4,
    alignItems: 'center',
  },
  waitlistLiveBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1e3a8a',
    textAlign: 'center',
  },
  waitlistLiveBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#1d4ed8',
    fontWeight: '700',
    textAlign: 'center',
  },
  waitlistLiveBannerButton: {
    alignSelf: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  waitlistLiveBannerButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  heroPrimaryButton: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: appFonts.displayCondensed,
    letterSpacing: IS_ANDROID ? 0.4 : 1.6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  blockedInfoCard: {
    width: '100%',
    marginTop: 16,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  blockedInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  blockedInfoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  blockedInfoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9a3412',
    textAlign: 'center',
    marginBottom: 8,
  },
  blockedInfoText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7c2d12',
    fontWeight: '600',
    textAlign: 'center',
  },
  requestsToggleButton: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 28,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    minHeight: 88,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    width: '100%',
  },
  requestsToggleButtonInline: {
    marginBottom: 0,
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
    minHeight: Platform.OS === 'web' ? 64 : 88,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 14,
    borderWidth: 1,
    borderColor: '#e6edf7',
    backgroundColor: '#fbfdff',
    shadowColor: '#dbeafe',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  requestsSectionHeader: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  requestsSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  requestsSectionSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#111111',
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 380,
  },
  requestsToggleTextWrap: {
    flex: 1,
    marginRight: Platform.OS === 'web' ? 0 : 8,
    alignItems: Platform.OS === 'web' ? 'center' : 'flex-start',
    justifyContent: 'center',
  },
  requestsToggleLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-start',
    gap: 12,
  },
  requestsToggleLeadIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#edf8f4',
    borderWidth: 1,
    borderColor: '#d7efe7',
  },
  requestsToggleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexShrink: 0,
    marginLeft: 12,
  },
  requestsToggleTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
  },
  requestsToggleSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    maxWidth: 280,
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
    marginTop: 2,
  },
  requestsToggleBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#ff3b30',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  requestsToggleBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  requestsToggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#e5f6f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfe8df',
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 30,
    padding: 20,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    alignItems: 'center',
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  sectionCardLocked: {
    opacity: 0.62,
  },
  sectionCardActiveFocus: {
    borderWidth: 2,
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fbff',
    shadowColor: '#60a5fa',
    shadowOpacity: 0.18,
    shadowRadius: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
    alignSelf: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleNoMargin: {
    marginBottom: 0,
  },
  sectionCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#e5f6f1',
    borderWidth: 1,
    borderColor: '#bfe8df',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineNotificationsCard: {
    marginTop: 2,
    marginBottom: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e7eef7',
    backgroundColor: '#fcfdff',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#dbeafe',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 820 : undefined,
    alignSelf: 'center',
  },
  alertsToggleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inlineNotificationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  inlineNotificationsTitle: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    color: '#0f172a',
    textAlign: 'center',
  },
  inlineNotificationsText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    color: '#111111',
    letterSpacing: Platform.OS === 'web' ? 0.35 : 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  lockedSectionText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 620,
  },
  frontendSalonWarningCard: {
    marginBottom: 18,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
  },
  frontendSalonWarningTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#B91C1C',
    textAlign: 'center',
    marginBottom: 8,
  },
  frontendSalonWarningText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#991B1B',
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 760,
  },
  frontendSalonWarningButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontendSalonWarningButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  authIntroText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 860,
    alignSelf: 'center',
  },
  authQrHint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    color: '#315ea8',
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 760,
    alignSelf: 'center',
  },
  authSectionCard: {
    alignItems: 'center',
  },
  authRegisterSectionCard: {
    marginTop: -2,
  },
  authSectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  authSectionDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 760,
    marginBottom: 14,
  },
  blockedSectionCard: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    alignItems: 'center',
  },
  blockedSectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fdba74',
    marginBottom: 10,
  },
  blockedSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9a3412',
    textAlign: 'center',
    marginBottom: 8,
  },
  blockedSectionText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7c2d12',
    fontWeight: '600',
    textAlign: 'center',
  },
  blockedSectionActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 14,
  },
  requestSection: {
    marginTop: 6,
    marginBottom: 22,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  requestSectionsContainer: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    maxWidth: Platform.OS === 'web' ? 1120 : undefined,
    alignItems: 'center',
  },
  requestOverviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 920 : undefined,
    alignSelf: 'center',
  },
  requestOverviewCard: {
    flex: 1,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  requestOverviewCardPending: {
    backgroundColor: '#fff7e6',
    borderColor: '#f4d7a1',
  },
  requestOverviewCardAccepted: {
    backgroundColor: '#ecfdf3',
    borderColor: '#b7ebc6',
  },
  requestOverviewCardArchived: {
    backgroundColor: '#eef2f7',
    borderColor: '#d7dee8',
  },
  requestOverviewValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  requestOverviewLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0.1 : 0.4,
    includeFontPadding: true,
  },
  requestSectionLast: {
    marginBottom: 0,
  },
  requestSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
  },
  requestSectionHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6f83',
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
  },
  requestSectionEmpty: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
  },
  calendarToggleButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
  },
  calendarToggleButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
  },
  frontendCalendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
    marginTop: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#b9cadd',
    shadowColor: '#0f172a',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarNavButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#f3f1ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavButtonDisabled: {
    opacity: 0.45,
  },
  calendarNavButtonText: {
    fontSize: 24,
    color: '#111111',
    fontWeight: '700',
    marginTop: -2,
  },
  calendarNavButtonTextDisabled: {
    color: '#8f8f8f',
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 0,
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginBottom: 0,
  },
  calendarDayCellActive: {
    backgroundColor: '#111111',
  },
  calendarDayCellDisabled: {
    opacity: 0.35,
  },
  calendarDayCellClosed: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  calendarDayCellGhost: {
    backgroundColor: 'transparent',
  },
  calendarDayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  calendarDayTextActive: {
    color: '#ffffff',
  },
  calendarDayTextDisabled: {
    color: '#9ca3af',
  },
  calendarDayTextClosed: {
    color: '#be123c',
  },
  calendarFooterText: {
    fontSize: 13,
    color: '#111111',
    lineHeight: 17,
    marginBottom: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarCloseButton: {
    alignSelf: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  calendarCloseButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    color: '#b42318',
    fontWeight: '700',
    lineHeight: 19,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbe6f1',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 980,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 132,
    borderRadius: 18,
    paddingVertical: 6,
  },
  stepItemActive: {
    backgroundColor: '#eef6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  servicesScrollViewWeb: {
    // RN-web ScrollView defaults include flexGrow/flexShrink; with sectionCard's
    // alignItems:center the strip can size to content width and lose horizontal overflow.
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 0,
  },
  servicesScrollInnerWeb: {
    width: '100%',
  },
  /** Web: real browser overflow-x on a div (RN ScrollView nested in vertical scroll is unreliable). */
  webNativeHorizontalHost: {
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'auto',
  } as ViewStyle,
  webNativeHorizontalRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  servicesScrollContent: {
    paddingHorizontal: 0,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingBottom: 2,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    color: '#ffffff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    paddingTop: Platform.OS === 'web' ? 3 : 4,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    marginBottom: 6,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    letterSpacing: Platform.OS === 'web' ? 0.2 : 0,
    color: '#111111',
    textAlign: 'center',
  },
  stepBadgeActive: {
    backgroundColor: '#2563eb',
  },
  stepTextActive: {
    color: '#1d4ed8',
  },
  serviceCard: {
    width: 118,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 14,
    marginRight: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    position: 'relative',
    minHeight: 196,
    overflow: 'visible',
  },
  serviceCardWeb: {
    width: 172,
    minHeight: 224,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 14,
    marginRight: 12,
    flexShrink: 0,
  },
  serviceCardSelectedWide: {
    width: 156,
  },
  serviceCardUnselectedNarrow: {
    width: 104,
  },
  serviceCardSelectedWideWeb: {
    width: 188,
  },
  serviceCardUnselectedNarrowWeb: {
    width: 146,
  },
  serviceCardActive: {
    borderWidth: 4,
    borderColor: '#1E293B',
    shadowColor: '#1E293B',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  serviceCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 20,
    width: '100%',
  },
  serviceCardTitleWeb: {
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 8,
  },
  serviceCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  },
  serviceCardMetaRowWeb: {
    marginBottom: 10,
  },
  serviceRoleBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    marginBottom: 8,
    maxWidth: '100%',
    flexShrink: 1,
  },
  serviceRoleBadgeWeb: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 0,
  },
  serviceRoleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  serviceRoleBadgeTextWeb: {
    fontSize: 12,
  },
  serviceOperatorInlineBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceOperatorInlineBadgeWeb: {
    width: 26,
    height: 26,
  },
  serviceSalonInlineBadge: {
    minWidth: 68,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D5DEE9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexShrink: 0,
  },
  serviceSalonInlineBadgeWeb: {
    minWidth: 76,
    height: 26,
    paddingHorizontal: 12,
  },
  serviceSalonInlineBadgeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
  },
  serviceCardPrice: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 0,
    width: '100%',
  },
  serviceCardPriceWeb: {
    fontSize: 15,
    marginTop: 6,
  },
  serviceCardDuration: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
    width: '100%',
    color: '#64748B',
  },
  serviceCardDurationWeb: {
    fontSize: 13,
    lineHeight: 18,
  },
  serviceSelectedBadge: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  serviceSelectedBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  discountRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  discountBadge: {
    backgroundColor: '#fff1f2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fecdd3',
    marginBottom: 4,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#be123c',
  },
  servicePriceOriginal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c2d12',
    textDecorationLine: 'line-through',
  },
  frontendBookingDayPickerShell: {
    marginTop: 12,
  },
  frontendBookingDayPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  frontendBookingTodayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  frontendBookingTodayButtonActive: {
    backgroundColor: '#1F2A44',
    borderColor: '#1F2A44',
  },
  frontendBookingTodayButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  frontendBookingTodayButtonTextActive: {
    color: '#FFFFFF',
  },
  frontendBookingCurrentDatePill: {
    flex: 1,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  frontendBookingCurrentDateText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? appFonts.displayCondensed : undefined,
    color: '#475569',
    textAlign: 'center',
  },
  frontendBookingDayPickerWrap: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.04)',
    paddingTop: 4,
    paddingBottom: 18,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  frontendBookingDayPickerRow: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  frontendBookingDayPickerListWeb: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 0,
    touchAction: 'pan-x',
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  } as ViewStyle,
  frontendBookingDayPickerRowWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    width: 'max-content',
    minWidth: '100%',
  } as unknown as ViewStyle,
  frontendBookingDayGhostCard: {
    width: DAY_CARD_WIDTH,
    height: 118,
    borderRadius: 20,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: DAY_CARD_GAP,
    borderWidth: 1.1,
    shadowColor: '#b8c5d6',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  frontendBookingDayGhostCardWeb: {
    flexShrink: 0,
  } as ViewStyle,
  frontendBookingDayGhostCardAvailable: {
    backgroundColor: '#DDF5E8',
    borderColor: '#B7E3C8',
  },
  frontendBookingDayGhostCardClosed: {
    backgroundColor: '#F9E2E4',
    borderColor: '#E8B7BC',
  },
  frontendBookingDayGhostCardSelected: {
    backgroundColor: '#1A2238',
    borderColor: 'rgba(101,124,178,0.55)',
    borderWidth: 2.2,
    shadowColor: '#23314F',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  frontendBookingDayWeek: {
    width: '100%',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '900',
    color: '#0F172A',
  },
  frontendBookingDayWeekSelected: {
    color: '#FFFFFF',
  },
  frontendBookingDayNumber: {
    width: '100%',
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
    color: '#0B1220',
  },
  frontendBookingDayNumberSelected: {
    color: '#FFFFFF',
  },
  frontendBookingDayMonth: {
    width: '100%',
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
  },
  frontendBookingDayMonthSelected: {
    color: '#EAF1FF',
  },
  frontendBookingDayMiniBadge: {
    minHeight: 18,
    borderRadius: 999,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  frontendBookingDayMiniBadgeClosed: {
    backgroundColor: '#F7D5D9',
    borderWidth: 1,
    borderColor: '#E7AAB2',
  },
  frontendBookingDayMiniBadgeSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  frontendBookingDayMiniBadgeText: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
    color: '#C64D57',
    textAlign: 'center',
  },
  frontendBookingDayMiniBadgeTextSelected: {
    color: '#FFFFFF',
  },
  frontendBookingDayMiniBadgeSpacer: {
    height: 18,
  },
  frontendBookingDayMiniFooter: {
    width: '100%',
    minHeight: 18,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  frontendBookingDayMiniFooterAvailable: {
    backgroundColor: '#CFEEDB',
  },
  frontendBookingDayMiniFooterClosed: {
    backgroundColor: '#F4D3D7',
  },
  frontendBookingDayMiniFooterSelected: {
    backgroundColor: '#243252',
  },
  frontendBookingDayMiniFooterText: {
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '800',
    textAlign: 'center',
  },
  frontendBookingDayMiniFooterTextSelected: {
    color: '#EAF1FF',
  },
  frontendBookingDayMiniFooterTextAvailable: {
    color: '#1D8F57',
  },
  frontendBookingDayMiniFooterTextClosed: {
    color: '#C64D57',
  },
  frontendBookingDayPickerCenterOverlay: {
    position: 'absolute',
    top: -12,
    bottom: -8,
    left: '50%',
    marginLeft: -(DAY_CARD_WIDTH / 2 + 10),
    width: DAY_CARD_WIDTH + 20,
    borderRadius: 28,
    overflow: 'visible',
    zIndex: 20,
  },
  frontendBookingDayPickerCenterFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: 'rgba(103,116,137,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.16)',
    shadowColor: '#334155',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  frontendBookingDayPickerCenterHighlight: {
    position: 'absolute',
    top: 4,
    left: 12,
    right: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  frontendBookingDayPickerCenterInnerGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  frontendBookingDayFocusCard: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -(DAY_CARD_WIDTH / 2),
    marginTop: -61,
    width: DAY_CARD_WIDTH,
    height: 122,
    borderRadius: 20,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2.4,
    shadowColor: '#23314F',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  frontendBookingDayFocusCardOpen: {
    backgroundColor: '#1A2238',
    borderColor: 'rgba(101,124,178,0.55)',
  },
  frontendBookingDayFocusCardClosed: {
    backgroundColor: '#1A2238',
    borderColor: 'rgba(101,124,178,0.55)',
  },
  frontendBookingDayFocusWeek: {
    width: '100%',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  frontendBookingDayFocusNumber: {
    width: '100%',
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  frontendBookingDayFocusMonth: {
    width: '100%',
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: '900',
    color: '#EAF1FF',
    textTransform: 'uppercase',
  },
  frontendBookingDayFocusBadge: {
    width: '100%',
    minHeight: 19,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  frontendBookingDayFocusBadgeClosed: {
    backgroundColor: '#F4D3D7',
    borderWidth: 1,
    borderColor: 'rgba(226,143,150,0.9)',
  },
  frontendBookingDayFocusBadgeText: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
    color: '#C64D57',
    textAlign: 'center',
  },
  frontendBookingDayFocusBadgeSpacer: {
    height: 19,
  },
  frontendBookingDayFocusFooter: {
    width: '100%',
    minHeight: 18,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  frontendBookingDayFocusFooterOpen: {
    backgroundColor: '#243252',
  },
  frontendBookingDayFocusFooterClosed: {
    backgroundColor: '#F4D3D7',
  },
  frontendBookingDayFocusFooterText: {
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '800',
    textAlign: 'center',
  },
  frontendBookingDayFocusFooterTextOpen: {
    color: '#EAF1FF',
  },
  frontendBookingDayFocusFooterTextClosed: {
    color: '#C64D57',
  },
  frontendBookingCalendarButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DCE6F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  frontendBookingCalendarButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  frontendBookingDayHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  dayPickerViewport: {
    marginTop: 10,
    marginHorizontal: -14,
    paddingTop: 28,
    paddingBottom: 14,
    overflow: 'visible',
  },
  dayPickerViewportWeb: {
    marginHorizontal: -10,
    paddingTop: 12,
    paddingBottom: 10,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 0,
  },
  dayPickerScrollWeb: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
  } as ViewStyle,
  dayPickerScrollInnerWeb: {
    width: '100%',
  },
  dayPickerCenterHalo: {
    position: 'absolute',
    top: 6,
    bottom: 8,
    left: '50%',
    marginLeft: -(DAY_CARD_WIDTH / 2 + 24),
    width: DAY_CARD_WIDTH + 48,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  dayPickerCenterHaloWeb: {
    top: 4,
    bottom: 8,
    marginLeft: -50,
    width: 100,
    borderRadius: 30,
    backgroundColor: 'rgba(250, 246, 238, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(167, 124, 56, 0.18)',
    shadowColor: '#8A7358',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  dayPickerRow: {
    paddingRight: 6,
    paddingVertical: 8,
  },
  dayPickerRowWeb: {
    paddingRight: 0,
    paddingVertical: 10,
  },
  dayCardWrap: {
    marginRight: DAY_CARD_GAP,
    overflow: 'visible',
  },
  dayCardWrapWeb: {
    marginRight: 1,
    flexShrink: 0,
  } as ViewStyle,
  dayCard: {
    width: DAY_CARD_WIDTH,
    minHeight: 96,
    height: 96,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#d6f0de',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  dayCardWeb: {
    width: 52,
    minHeight: 116,
    height: 116,
    borderRadius: 22,
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 3,
    borderColor: '#cfe9d8',
  },
  dayCardAvailable: {
    backgroundColor: '#eafbf1',
    shadowColor: '#7DD3A7',
    shadowOpacity: 0.16,
  },
  dayCardSelected: {
    backgroundColor: '#1f2a44',
    borderColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  dayCardClosed: {
    backgroundColor: '#fff1f2',
    borderColor: '#fda4af',
    shadowColor: '#fb7185',
    shadowOpacity: 0.12,
  },
  dayCardPast: {
    backgroundColor: '#eef2f7',
    borderColor: '#d8e0ea',
    opacity: 0.82,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 12,
    marginBottom: 1,
  },
  dayWeek: {
    fontSize: 9,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  dayWeekWeb: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  dayStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 6 : 5,
    paddingVertical: 2,
    minWidth: IS_ANDROID ? 44 : 40,
    maxWidth: IS_ANDROID ? 52 : 46,
    minHeight: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 1,
  },
  dayStatusBadgeWeb: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  dayStatusBadgeClosed: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.22)',
  },
  dayStatusBadgeHoliday: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
    borderColor: 'rgba(225, 29, 72, 0.3)',
  },
  dayStatusBadgeText: {
    fontSize: 5.6,
    fontWeight: '800',
    color: '#be123c',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 6.4,
    paddingHorizontal: 0,
  },
  dayStatusBadgeSpacer: {
    height: 18,
    marginBottom: 1,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  dayNumberWeb: {
    fontSize: 26,
    lineHeight: 28,
  },
  dayMonth: {
    fontSize: 7.2,
    fontWeight: '700',
    color: '#111111',
    textTransform: 'capitalize',
    marginBottom: 1,
    textAlign: 'center',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  dayMonthWeb: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.35,
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  dayTextClosed: {
    color: '#9f1239',
  },
  dayTextPast: {
    color: '#64748b',
  },
  dayCardFooter: {
    alignSelf: 'center',
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    minWidth: IS_ANDROID ? 46 : 42,
    maxWidth: IS_ANDROID ? 52 : 48,
    minHeight: 18,
    height: 18,
    paddingHorizontal: IS_ANDROID ? 6 : 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCardFooterWeb: {
    minWidth: 44,
    maxWidth: 44,
    minHeight: 26,
    height: 26,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCardFooterActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dayCardFooterClosed: {
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
    borderColor: 'rgba(225, 29, 72, 0.16)',
  },
  dayCardFooterAvailable: {
    backgroundColor: '#d9f7e4',
    borderColor: '#a7e1bc',
  },
  dayCardFooterSelected: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(140, 164, 213, 0.9)',
  },
  dayCardFooterPast: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e1',
  },
  dayCardFooterText: {
    fontSize: 5.6,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    lineHeight: 6.4,
    paddingHorizontal: 0,
  },
  dayCardFooterTextWeb: {
    fontSize: 6.8,
    lineHeight: 8,
    letterSpacing: 0.1,
  },
  dayCardFooterTextSelected: {
    color: '#ffffff',
  },
  dayCardFooterTextClosed: {
    color: '#be123c',
  },
  dayCardFooterTextAvailable: {
    color: '#0F8B4C',
  },
  dayCardFooterTextPast: {
    color: '#475569',
  },
  frontendBookingTimesWrap: {
    marginTop: 10,
    gap: 16,
  },
  frontendBookingTimesSection: {
    borderRadius: 24,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  frontendBookingTimesSectionHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  frontendBookingTimesSectionPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#CFE9D8',
    marginBottom: 10,
  },
  frontendBookingTimesSectionPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F8B4C',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  frontendBookingTimesSectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  frontendBookingTimesSectionHint: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  frontendBookingTimesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  frontendBookingTimesGridRecommendedCompact: {
    justifyContent: 'center',
    columnGap: 14,
  },
  frontendBookingTimeCell: {
    marginBottom: 0,
  },
  frontendBookingTimeCard: {
    minHeight: 90,
    borderRadius: 20,
    backgroundColor: '#F5FBF7',
    borderWidth: 1,
    borderColor: '#DDEADE',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#8A7358',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  frontendBookingTimeCardRecommended: {
    backgroundColor: '#EFF8F2',
    borderColor: '#CFE9D8',
  },
  frontendBookingTimeCardBusy: {
    backgroundColor: '#FFF3F5',
    borderColor: '#F2D3DA',
  },
  frontendBookingTimeCardOverlap: {
    backgroundColor: '#FFF8EE',
    borderColor: '#F3DEC2',
  },
  frontendBookingTimeCardSelected: {
    backgroundColor: '#E7F0FF',
    borderColor: '#2B5FD9',
    borderWidth: 2,
    shadowColor: '#2B5FD9',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    transform: [{ translateY: -1 }],
  },
  frontendBookingTimeCardDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  frontendBookingTimeTopPill: {
    minHeight: 20,
    borderRadius: 999,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#CFE9D8',
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frontendBookingTimeTopPillBusy: {
    backgroundColor: '#FDEBEC',
    borderColor: '#F3C7CE',
  },
  frontendBookingTimeTopPillSelected: {
    backgroundColor: '#D8E7FF',
    borderColor: '#A9C5FF',
  },
  frontendBookingTimeTopPillOverlap: {
    backgroundColor: '#FFF1DA',
    borderColor: '#F1D19F',
  },
  frontendBookingTimeTopPillText: {
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '900',
    color: '#0F8B4C',
    textAlign: 'center',
  },
  frontendBookingTimeTopPillTextBusy: {
    color: '#B42332',
  },
  frontendBookingTimeTopPillTextSelected: {
    color: '#163D8F',
  },
  frontendBookingTimeTopPillTextOverlap: {
    color: '#A35B00',
  },
  frontendBookingTimeTopPillSpacer: {
    height: 20,
  },
  frontendBookingTimeCardText: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    color: '#245A37',
    textAlign: 'center',
  },
  frontendBookingTimeCardTextSelected: {
    color: '#163D8F',
  },
  frontendBookingTimeCardTextBusy: {
    color: '#C03844',
  },
  frontendBookingTimeCardTextOverlap: {
    color: '#A35B00',
  },
  frontendBookingTimeCardTextDisabled: {
    color: '#94A3B8',
  },
  frontendBookingTimeCardMeta: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  frontendBookingTimeCardMetaSelected: {
    color: '#2450AE',
    fontWeight: '900',
  },
  frontendBookingTimesToggle: {
    marginTop: 14,
    alignSelf: 'center',
    minWidth: 220,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  frontendBookingTimesToggleText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 2,
  },
  timeSlotCard: {
    width: IS_ANDROID ? '23.5%' : '22%',
    marginHorizontal: IS_ANDROID ? '0.75%' : '1.5%',
    marginBottom: 12,
  },
  timeChip: {
    backgroundColor: '#F5FBF7',
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: IS_ANDROID ? 10 : 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 66 : undefined,
    borderWidth: 1,
    borderColor: '#DDEADE',
    shadowColor: '#8A7358',
    shadowOpacity: Platform.OS === 'web' ? 0.06 : 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  timeChipOccupied: {
    backgroundColor: '#FFF3F5',
    borderColor: '#F2D3DA',
  },
  timeChipOverlapBlocked: {
    backgroundColor: '#FFF8EE',
    borderColor: '#F3DEC2',
  },
  timeChipActive: {
    backgroundColor: '#E8F1FF',
    borderWidth: 1.5,
    borderColor: '#1D4ED8',
    shadowOpacity: Platform.OS === 'web' ? 0.12 : 0,
  },
  timeChipDisabled: {
    backgroundColor: '#FFF3F5',
    borderColor: '#F2D3DA',
  },
  timeChipSelectedBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: '#1E3A8A',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '72%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipSelectedBadgeText: {
    fontSize: 8.5,
    lineHeight: 9.5,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  expandedTimePanel: {
    marginTop: 10,
  },
  expandedTimePanelWeb: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
  },
  expandedTimeHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  expandedTimeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  expandedTimeTitleWeb: {
    fontSize: 17,
    lineHeight: 22,
  },
  expandedTimeHint: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  expandedTimeHintWeb: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  guidedTimePanel: {
    marginTop: 8,
    marginBottom: 14,
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  guidedTimePanelWeb: {
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  guidedTimeHeader: {
    alignItems: 'center',
  },
  guidedTimeHeaderWeb: {
    maxWidth: 520,
    alignSelf: 'center',
  },
  guidedTimeEyebrowPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#CFE9D8',
    marginBottom: 12,
  },
  guidedTimeEyebrowPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#0F8B4C',
    textTransform: 'uppercase',
  },
  guidedTimeTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  guidedTimeTitleWeb: {
    fontSize: 19,
    lineHeight: 25,
  },
  guidedTimeHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  guidedTimeHintWeb: {
    marginTop: 7,
    marginBottom: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  guidedTimeInlineNotice: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#335C9E',
    textAlign: 'center',
  },
  guidedTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 16,
  },
  guidedTimeGridWeb: {
    justifyContent: 'center',
    marginHorizontal: -6,
    marginTop: 18,
  },
  guidedTimeSlotCard: {
    marginBottom: 10,
  },
  guidedTimeSlotCardWeb: {
    width: 132,
    marginHorizontal: 6,
    marginBottom: 14,
  },
  guidedTimeChip: {
    backgroundColor: '#F5FBF7',
    borderWidth: 1,
    borderColor: '#DDEADE',
    borderRadius: 22,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    minHeight: 84,
    justifyContent: 'center',
    gap: 6,
  },
  guidedTimeChipWeb: {
    minHeight: 100,
    borderRadius: 24,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
    shadowColor: '#8A7358',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  guidedTimeChipSelected: {
    backgroundColor: '#E8F1FF',
    borderColor: '#1D4ED8',
  },
  guidedTimeChipText: {
    color: '#245A37',
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
  },
  guidedTimeChipTextWeb: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  guidedTimeBadge: {
    alignSelf: 'center',
    backgroundColor: '#EAFBF1',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#CFE9D8',
  },
  guidedTimeBadgeWeb: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  guidedTimeBadgeSelected: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  guidedTimeBadgeText: {
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '900',
    color: '#0F8B4C',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  guidedTimeBadgeTextWeb: {
    fontSize: 9.5,
    lineHeight: 11,
  },
  guidedTimeBadgeTextSelected: {
    color: '#FFFFFF',
  },
  guidedTimeMeta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#3F7C56',
    textAlign: 'center',
  },
  guidedTimeMetaWeb: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  guidedTimeMetaSelected: {
    color: '#1D4ED8',
  },
  guidedTimeToggleButton: {
    marginTop: 14,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 220,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  guidedTimeToggleButtonWeb: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minWidth: 260,
  },
  guidedTimeToggleButtonText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  guidedTimeToggleButtonTextWeb: {
    fontSize: 13.5,
  },
  guidedTimeSubHint: {
    marginTop: 14,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  waitlistButton: {
    marginTop: 6,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 60 : 50,
  },
  waitlistButtonActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  waitlistButtonText: {
    fontSize: Platform.OS === 'web' ? 16 : 11.5,
    fontWeight: '800',
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 19 : 13.5,
    paddingHorizontal: Platform.OS === 'web' ? 8 : 2,
    width: '100%',
  },
  waitlistButtonTextActive: {
    color: '#92400E',
  },
  waitlistSection: {
    marginTop: 16,
    gap: 10,
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  waitlistSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
  },
  waitlistSectionHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
    maxWidth: Platform.OS === 'web' ? 720 : undefined,
  },
  waitlistDayButton: {
    paddingHorizontal: 14,
    width: Platform.OS === 'web' ? '100%' : undefined,
    maxWidth: Platform.OS === 'web' ? 1120 : undefined,
    alignSelf: 'center',
  },
  waitlistBlockList: {
    gap: 10,
    width: Platform.OS === 'web' ? '100%' : undefined,
    maxWidth: Platform.OS === 'web' ? 1120 : undefined,
    alignSelf: 'center',
  },
  waitlistBlockCard: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  waitlistBlockTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
    width: '100%',
  },
  waitlistAlertsList: {
    marginTop: 10,
    gap: 10,
    width: '100%',
  },
  waitlistAlertCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 11,
    gap: 5,
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  waitlistAlertTopRow: {
    flexDirection: Platform.OS === 'web' ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'web' ? 6 : 10,
    width: '100%',
  },
  waitlistAlertTitle: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
  },
  waitlistAlertMeta: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#475569',
    textAlign: Platform.OS === 'web' ? 'center' : 'left',
    width: '100%',
  },
  waitlistAlertStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  waitlistAlertStatusWaiting: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  waitlistAlertStatusNotified: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  waitlistAlertStatusExpired: {
    backgroundColor: '#E2E8F0',
    borderColor: '#94A3B8',
  },
  waitlistAlertStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  slotMiniBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: '#EEF4EA',
    borderWidth: 1,
    borderColor: '#D5E4D0',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 8 : 7,
    paddingVertical: 3,
  },
  slotMiniBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#607455',
    letterSpacing: 0.1,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  slotMiniBadgeOccupied: {
    backgroundColor: '#FDEBEC',
    borderColor: '#F3C7CE',
  },
  slotMiniBadgeTextOccupied: {
    color: '#B42332',
  },
  slotMiniBadgeOverlap: {
    backgroundColor: '#FFF1DA',
    borderColor: '#F1D19F',
  },
  slotMiniBadgeTextOverlap: {
    color: '#A35B00',
  },
  timeChipText: {
    fontSize: Platform.OS === 'web' ? 15 : 14,
    fontWeight: '900',
    color: '#245A37',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  timeChipTextOccupied: {
    color: '#C03844',
  },
  timeChipTextOverlapBlocked: {
    color: '#A35B00',
  },
  timeChipTextActive: {
    color: '#1D4ED8',
  },
  timeChipTextDisabled: {
    color: '#C03844',
  },
  operatorSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  operatorStepCallout: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  operatorStepCalloutText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    color: '#1d4ed8',
    textAlign: 'center',
    maxWidth: 520,
  },
  operatorSelectionCard: {
    width: '47%',
    marginHorizontal: '1.5%',
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  operatorSelectionCardPrompt: {
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    backgroundColor: '#fcfdff',
    transform: [{ translateY: -2 }],
  },
  operatorSelectionCardActive: {
    backgroundColor: '#EAF2FF',
    borderWidth: 2,
    borderColor: '#60a5fa',
  },
  operatorSelectionPill: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  operatorSelectionPillActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  operatorSelectionPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4338ca',
    textAlign: 'center',
  },
  operatorSelectionPillTextActive: {
    color: '#ffffff',
  },
  operatorSelectionName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  operatorSelectionNameActive: {
    color: '#1d4ed8',
  },
  operatorSelectionRole: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  operatorSelectionRoleActive: {
    color: '#315ea8',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1040,
  },
  authInput: {
    maxWidth: 720,
  },
  noteInput: {
    minHeight: 90,
    textAlignVertical: 'top',
    textAlign: 'center',
    paddingTop: 18,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 2,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
    maxWidth: 720,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  authActionButton: {
    marginTop: 14,
    alignSelf: 'center',
  },
  authBiometricButton: {
    marginTop: 12,
    alignSelf: 'center',
    maxWidth: 520,
  },
  authBiometricInlineButton: {
    marginTop: 10,
    maxWidth: 520,
    alignSelf: 'center',
  },
  authBiometricBackendButton: {
    width: '100%',
    maxWidth: 720,
    marginTop: 12,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DCE6F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  authBiometricBackendContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  authBiometricBackendIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
    marginRight: 12,
  },
  authBiometricBackendTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  authBiometricBackendTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  authBiometricBackendHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#64748B',
  },
  authBiometricBackendArrow: {
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryActionButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
    maxWidth: 720,
    borderWidth: 1,
    borderColor: '#DCE6F0',
  },
  secondaryActionButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  confirmationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  confirmationCardWeb: {
    alignItems: 'center',
    paddingTop: 28,
  },
  requestStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    marginBottom: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#d9e4f0',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  requestStatusCardPending: {
    borderColor: '#f4dfb0',
    backgroundColor: '#fffdfa',
  },
  requestStatusCardAccepted: {
    borderColor: '#cdecd7',
    backgroundColor: '#fbfffc',
  },
  requestStatusCardRejected: {
    borderColor: '#efd1da',
    backgroundColor: '#fffafb',
  },
  requestStatusCardCancelled: {
    borderColor: '#dce4ee',
    backgroundColor: '#fbfcfe',
  },
  requestStatusCardWeb: {
    alignItems: 'stretch',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 920,
    minHeight: 430,
    justifyContent: 'flex-start',
  },
  requestStatusCardCompact: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 10,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  requestStatusCardCompactWeb: {
    alignItems: 'stretch',
    minHeight: 0,
  },
  requestStatusHeroBlockWeb: {
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    marginBottom: 2,
  },
  requestStatusHeroBlockCompact: {
    minHeight: 0,
    marginBottom: 0,
  },
  requestStatusHeroBlockCompactWeb: {
    minHeight: 0,
    paddingTop: 0,
    marginBottom: 0,
    alignItems: 'stretch',
  },
  requestStatusHeaderStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  requestStatusHeaderStackCompact: {
    marginBottom: 8,
  },
  requestStatusBadgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  requestStatusTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  requestStatusTopRowWeb: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 0,
    marginBottom: 6,
  },
  requestStatusTopRowCompact: {
    marginBottom: 8,
  },
  requestStatusTopRowCompactWeb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  requestStatusHeaderCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestStatusHeaderCopyWeb: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 0,
    maxWidth: '100%',
    width: '100%',
    minHeight: 82,
    justifyContent: 'center',
  },
  requestStatusHeaderCopyCompact: {
    gap: 2,
  },
  requestStatusHeaderCopyCompactWeb: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 0,
    maxWidth: '100%',
  },
  requestStatusTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  requestStatusTitleWeb: {
    textAlign: 'center',
  },
  requestStatusTitleCompact: {
    fontSize: 17,
    marginBottom: 2,
  },
  requestStatusTitleTight: {
    fontSize: 16,
    lineHeight: 20,
  },
  requestStatusMeta: {
    fontSize: 14,
    color: '#5f6f83',
    fontWeight: '800',
    textAlign: 'center',
  },
  requestStatusMetaWeb: {
    textAlign: 'center',
    fontFamily: appFonts.displayCondensed,
  },
  requestStatusMetaCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  requestStatusOperatorLine: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'left',
  },
  requestStatusOperatorLineWeb: {
    textAlign: 'left',
  },
  requestStatusOperatorLineCompact: {
    marginTop: 3,
    fontSize: 12,
  },
  confirmationOperator: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
    marginTop: 8,
  },
  requestMetaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  requestMetaPillsRowWeb: {
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 10,
    minHeight: 42,
    alignSelf: 'center',
  },
  requestMetaPillsRowCompact: {
    justifyContent: 'center',
    marginBottom: 8,
  },
  requestCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  requestCategoryChipWeb: {
    minWidth: 86,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
    textAlign: 'center',
  },
  requestOperatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  requestOperatorChipWeb: {
    minWidth: 96,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestOperatorChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
    textAlign: 'center',
  },
  requestStatusBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    marginBottom: 12,
    textAlign: 'center',
  },
  requestStatusBodyWeb: {
    textAlign: 'center',
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    minHeight: 64,
  },
  requestStatusBodyCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 0,
  },
  requestAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  requestAddressCardWeb: {
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  requestStatusAddress: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#5f6f83',
    fontWeight: '700',
    textAlign: 'center',
  },
  requestStatusAddressWeb: {
    flex: 1,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 13,
  },
  requestStateBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 108,
    alignItems: 'center',
  },
  requestStateBadgeWeb: {
    minWidth: 112,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 2,
  },
  requestStateBadgePending: {
    backgroundColor: '#f5e7c8',
  },
  requestStateBadgeAccepted: {
    backgroundColor: '#d9f2e7',
  },
  requestStateBadgeRejected: {
    backgroundColor: '#f6d7de',
  },
  requestStateBadgeCancelled: {
    backgroundColor: '#dbe3ec',
  },
  requestStateBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  requestStateBadgeTextPending: {
    color: '#92400e',
  },
  requestStateBadgeTextAccepted: {
    color: '#166534',
  },
  requestStateBadgeTextRejected: {
    color: '#991b1b',
  },
  requestStateBadgeTextCancelled: {
    color: '#374151',
  },
  requestStatusHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5f6f83',
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
  },
  requestActionsStack: {
    width: '100%',
    gap: 10,
    alignItems: 'stretch',
    marginTop: 2,
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
  },
  archivedMonthSection: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DCEBE7',
    backgroundColor: '#F9FCFB',
    overflow: 'hidden',
  },
  archivedMonthToggle: {
    minHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  archivedMonthToggleTextWrap: {
    flex: 1,
    gap: 3,
  },
  archivedMonthToggleTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  archivedMonthToggleCount: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#5F6F83',
  },
  archivedMonthToggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECF8F4',
    borderWidth: 1,
    borderColor: '#C8E7DD',
  },
  cancelBookingButton: {
    backgroundColor: '#fff1f2',
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fde2e8',
  },
  requestActionButtonWeb: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  cancelBookingButtonText: {
    color: '#be123c',
    fontSize: 16,
    fontWeight: '900',
  },
  calendarButton: {
    backgroundColor: '#EAF2FF',
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  calendarButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '900',
  },
  confirmationActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  confirmationActionsRowWeb: {
    width: '100%',
    maxWidth: 760,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
    alignSelf: 'center',
  },
  inlineWhatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 18,
    paddingVertical: 13,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#c7f0d5',
  },
  inlineContactButtonWeb: {
    flex: 1,
    minWidth: 220,
    maxWidth: '100%',
    marginRight: 0,
    width: 'auto',
  },
  inlineWhatsappButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  inlineCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcecff',
    borderRadius: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#cfe0fb',
  },
  inlineCallButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#315ea8',
  },
  confirmationTopRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    width: '100%',
  },
  confirmationTopRowWeb: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 136,
    paddingBottom: 12,
    marginBottom: 10,
  },
  confirmationIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#dcecff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
    marginBottom: 14,
  },
  confirmationTextWrap: {
    width: '100%',
    alignItems: 'center',
  },
  confirmationTextWrapWeb: {
    flex: 0,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 760,
    paddingTop: 10,
  },
  confirmationEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
    marginBottom: 4,
    textAlign: 'center',
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginTop: 2,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: -8,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
    alignSelf: 'center',
  },
  confirmationSummaryGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  confirmationSummaryGridWeb: {
    width: '100%',
    maxWidth: 760,
    marginTop: 6,
  },
  confirmationSummaryBox: {
    flex: 1,
    backgroundColor: '#FFF7E8',
    borderRadius: 18,
    padding: 14,
    marginRight: 8,
  },
  confirmationSummaryLabel: {
    fontSize: 12,
    color: '#7a6f65',
    fontWeight: '700',
    marginBottom: 4,
  },
  confirmationSummaryValue: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '800',
  },
  confirmationDetailsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  confirmationDetailsText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  clientHomeButton: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 26,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    minWidth: Platform.OS === 'web' ? 320 : undefined,
    alignSelf: 'center',
  },
  clientHomeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  frontendLanguageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 8,
  },
  frontendLanguageChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  frontendLanguageChipActive: {
    backgroundColor: '#111827',
  },
  frontendLanguageChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  frontendLanguageChipTextActive: {
    color: '#ffffff',
  },
  frontendLogoutButton: {
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  frontendLogoutButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  accessModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  accessModeButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessModeButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  accessModeButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  accessModeButtonTextActive: {
    color: '#ffffff',
  },
});
