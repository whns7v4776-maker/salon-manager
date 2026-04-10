import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
} from 'react-native-reanimated';
import { AppWordmark } from '../components/app-wordmark';
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
import { resolveServiceAccent } from '../src/lib/service-accents';
import { supabase } from '../src/lib/supabase';
import {
  buildInvalidFieldsMessage,
  isValidEmail,
  isValidPhone10,
  limitPhoneToTenDigits,
} from '../src/lib/validators';

const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';
const FRONTEND_BIOMETRIC_ENABLED_KEY = 'salon_manager_frontend_biometric_enabled';
const FRONTEND_BIOMETRIC_PROFILE_KEY = 'salon_manager_frontend_biometric_profile';
const FRONTEND_BIOMETRIC_SALON_CODE_KEY = 'salon_manager_frontend_biometric_salon_code';
const DAY_CARD_WIDTH = 58;
const DAY_CARD_GAP = 2;
const DAY_CARD_STRIDE = DAY_CARD_WIDTH + DAY_CARD_GAP;
const DAY_PICKER_DAYS_BEFORE = 14;
const DAY_PICKER_DAYS_AFTER = 90;
const CLIENT_BOOKING_REFRESH_INTERVAL_MS = 1500;
const LOCAL_REQUEST_VISIBILITY_GRACE_MS = 30000;
const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GUIDED_SLOT_RECOMMENDATIONS = 6;

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
  const shortService = serviceDurationMinutes <= 30;
  const longService = serviceDurationMinutes >= 60;
  const tinyFragments = [remainingBefore, remainingAfter].filter((value) => value > 0 && value <= 1).length;
  const smallFragments = [remainingBefore, remainingAfter].filter((value) => value > 0 && value <= 2).length;
  const preservedLargestChunk = Math.max(remainingBefore, remainingAfter);
  const blockSize = block.slots.length;

  let score = 0;

  switch (strategy) {
    case 'protect_long_services':
      score += fillsGapExactly ? 150 : 0;
      score += touchesEdge ? 95 : 0;
      score += shortService ? preservedLargestChunk * 16 : 0;
      score += longService ? blockSize * 14 : 0;
      score -= createsSplit ? 90 : 0;
      score -= tinyFragments * 16;
      score -= smallFragments * 10;
      break;
    case 'fill_gaps':
      score += fillsGapExactly ? 180 : 0;
      score += touchesEdge ? 80 : 0;
      score -= blockSize * 10;
      score -= tinyFragments * 8;
      score -= smallFragments * 6;
      score -= createsSplit ? 30 : 0;
      break;
    case 'balanced':
    default:
      score += fillsGapExactly ? 140 : 0;
      score += touchesEdge ? 70 : 0;
      score += longService ? blockSize * 8 : 0;
      score += shortService ? preservedLargestChunk * 8 : 0;
      score -= createsSplit ? 48 : 0;
      score -= tinyFragments * 10;
      score -= smallFragments * 6;
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
  status?: string;
  expires_at?: string | null;
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
  }[];
  appuntamenti: {
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
    stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
    createdAt: string;
    viewedByCliente?: boolean;
    viewedBySalon?: boolean;
  }[];
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
  serviceCardColorOverrides?: Record<string, string>;
  roleCardColorOverrides?: Record<string, string>;
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
  item: { telefono: string; email?: string; maxFutureAppointments?: number | null },
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

const countScheduledFutureBookingsForClient = ({
  profile,
  clienti,
  appointments,
  requests,
}: {
  profile: FrontendProfile;
  clienti: PublicSalonState['clienti'];
  appointments: PublicSalonState['appuntamenti'];
  requests: PublicSalonState['richiestePrenotazione'];
}) => {
  const matchingCustomer = clienti.find((item) => matchesLimitedClientProfile(item, profile));
  const limit =
    matchingCustomer && typeof matchingCustomer.maxFutureAppointments === 'number'
      ? matchingCustomer.maxFutureAppointments
      : null;

  if (limit === null) {
    return { limit: null, total: 0 };
  }

  const normalizedEmail = profile.email.trim().toLowerCase();
  const normalizedPhone = limitPhoneToTenDigits(profile.telefono ?? '');
  const normalizedName = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim().toLowerCase();
  const knownNames = new Set<string>(normalizedName ? [normalizedName] : []);
  const normalizedCustomerName = (matchingCustomer?.nome ?? '').trim().toLowerCase();
  if (normalizedCustomerName) {
    knownNames.add(normalizedCustomerName);
  }
  const today = getTodayDateString();

  const appointmentKeys = new Set(
    appointments
      .filter((item) => {
        const itemDate = item.data ?? getTodayDateString();
        const sameName = knownNames.has((item.cliente ?? '').trim().toLowerCase());
        return itemDate >= today && sameName;
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
    if (!(itemDate >= today && allowedStatus && (sameEmail || samePhone || sameName))) {
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

  return {
    limit,
    total: appointmentKeys.size + pendingRequestKeys.size,
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
  requests: PublicSalonState['richiestePrenotazione']
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

  return [...appointments, ...blockingRequests];
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

const canCancelUntilPreviousMidnight = (appointmentDate: string) => {
  const cutoff = parseIsoDate(appointmentDate);
  cutoff.setHours(0, 0, 0, 0);
  return Date.now() < cutoff.getTime();
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
  }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const dayPickerRef = useRef<ScrollView | null>(null);
  const dayPickerScrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionTapLockUntilRef = useRef(0);
  const lastHapticDayRef = useRef('');
  const lastSnappedDayRef = useRef('');
  const nomeInputRef = useRef<TextInput | null>(null);
  const salonCodeInputRef = useRef<TextInput | null>(null);
  const lastUnreadCancelledSignatureRef = useRef('');
  const lastViewedSyncSignatureRef = useRef('');
  const hasCenteredCurrentDayRef = useRef(false);
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
    richiestePrenotazione,
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
            if (shouldIgnoreSelectionTap()) return;
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
  const initialFrontendAccessMode: FrontendAccessMode | null =
    initialModeParam === 'login' || initialModeParam === 'register' ? initialModeParam : null;
  const canUseWorkspaceFallback = true;
  const [selectedSalonCode, setSelectedSalonCode] = useState(
    initialSalonCodeParam || (canUseWorkspaceFallback ? salonWorkspace.salonCode : '')
  );
  const [salonCodeDraft, setSalonCodeDraft] = useState(
    initialSalonCodeParam || (canUseWorkspaceFallback ? salonWorkspace.salonCode : '')
  );
  const [publicSalonState, setPublicSalonState] = useState<PublicSalonState | null>(null);
  const [backendDayOccupancy, setBackendDayOccupancy] = useState<PublicBookingOccupancyItem[]>([]);
  const [showAllGuidedSlots, setShowAllGuidedSlots] = useState(false);
  const [waitlistKeys, setWaitlistKeys] = useState<Set<string>>(new Set());
  const [waitlistSubmittingKeys, setWaitlistSubmittingKeys] = useState<Set<string>>(new Set());
  const [bookingRequestSubmitting, setBookingRequestSubmitting] = useState(false);
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
  const publicSalonRefreshInFlightRef = useRef(false);
  const publicSalonRefreshPromiseRef = useRef<Promise<PublicSalonState | null> | null>(null);
  const bookingRequestInFlightKeyRef = useRef('');
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 32,
  });
  const shouldAutoAdvanceField = true;
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
  const shouldStartInBookingMode = initialModeParam === 'booking';

  const normalizedSelectedSalonCode = normalizeSalonCode(selectedSalonCode);
  const hasResolvedOrIncomingSalonCode = !!normalizedSelectedSalonCode;
  const isCurrentWorkspaceSalon =
    canUseWorkspaceFallback &&
    (!normalizedSelectedSalonCode || normalizedSelectedSalonCode === salonWorkspace.salonCode);
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
  const effectiveRoleCardColorOverrides = useMemo(
    () =>
      isCurrentWorkspaceSalon
        ? roleCardColorOverrides
        : publicSalonState?.roleCardColorOverrides ?? {},
    [isCurrentWorkspaceSalon, publicSalonState?.roleCardColorOverrides, roleCardColorOverrides]
  );
  const effectiveClienti = useMemo(
    () => (isCurrentWorkspaceSalon ? clienti : publicSalonState?.clienti ?? []),
    [clienti, isCurrentWorkspaceSalon, publicSalonState?.clienti]
  );
  const effectiveOperatori = useMemo(
    () => (isCurrentWorkspaceSalon ? operatori : publicSalonState?.operatori ?? []),
    [isCurrentWorkspaceSalon, operatori, publicSalonState?.operatori]
  );
  const effectiveAppuntamenti = useMemo(
    () =>
      assignFallbackOperatorsToAppointments({
        appointments: isCurrentWorkspaceSalon ? appuntamenti : publicSalonState?.appuntamenti ?? [],
        services: effectiveServizi,
        operators: effectiveOperatori,
        settings: isCurrentWorkspaceSalon
          ? availabilitySettings
          : publicSalonState?.availabilitySettings ?? normalizeAvailabilitySettings(),
      }),
    [
      appuntamenti,
      effectiveOperatori,
      effectiveServizi,
      availabilitySettings,
      isCurrentWorkspaceSalon,
      publicSalonState?.availabilitySettings,
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
    () => buildBlockingAppointments(effectiveAppuntamenti, effectiveRichieste),
    [effectiveAppuntamenti, effectiveRichieste]
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
  const effectiveAvailabilitySettings = isCurrentWorkspaceSalon
    ? availabilitySettings
    : publicSalonState?.availabilitySettings ?? normalizeAvailabilitySettings();
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
        const [saved, savedLanguage, savedSalonCode, biometricEnabledSaved] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
          AsyncStorage.getItem(FRONTEND_BIOMETRIC_ENABLED_KEY),
        ]);
        setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
        setFrontendBiometricEnabled(biometricEnabledSaved === 'true');
        const normalizedSavedSalonCode = normalizeSalonCode(savedSalonCode ?? '');

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
                ? 'register'
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
        if (
          parsed.nome?.trim() &&
          parsed.cognome?.trim() &&
          parsed.email?.trim() &&
          parsed.telefono?.trim()
        ) {
          setAccessMode('login');
          setIsRegistered(true);
        }
      } catch (error) {
        console.log('Errore caricamento profilo cliente:', error);
      } finally {
        setHasHydratedFrontendSession(true);
      }
    };

    loadProfile();
  }, [initialFrontendAccessMode, initialSalonCodeParam]);

  useEffect(() => {
    if (!hasHydratedFrontendSession) {
      return;
    }

    const normalized = normalizeSalonCode(selectedSalonCode);

    if (!normalized) {
      return;
    }

    AsyncStorage.setItem(FRONTEND_LAST_SALON_CODE_KEY, normalized).catch((error) => {
      console.log('Errore salvataggio ultimo codice salone:', error);
    });
  }, [hasHydratedFrontendSession, selectedSalonCode]);

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
          [FRONTEND_BIOMETRIC_SALON_CODE_KEY, nextSalonCode],
        ]);
      } catch (error) {
        console.log('Errore salvataggio snapshot biometrico cliente:', error);
      }
    },
    [frontendBiometricEnabled]
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

      const [savedProfile, savedSalonCode] = await Promise.all([
        AsyncStorage.getItem(FRONTEND_BIOMETRIC_PROFILE_KEY),
        AsyncStorage.getItem(FRONTEND_BIOMETRIC_SALON_CODE_KEY),
      ]);

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
        [FRONTEND_LAST_SALON_CODE_KEY, normalizedSalon],
      ]);

      setAccessMode('login');
      setIsRegistered(true);
      setIsBookingStarted(shouldStartInBookingMode);
      setShowRequestsExpanded(false);

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
        setAccessMode('register');
      }
    }
  }, [isRegistered, searchParams.salon]);

  useEffect(() => {
    if (shouldStartInBookingMode && isRegistered) {
      setShowRequestsExpanded(false);
      setIsBookingStarted(true);
    }
  }, [isRegistered, shouldStartInBookingMode]);

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
          const now = Date.now();
          const remoteKeys = new Set(
            resolved.richiestePrenotazione.map((item) => buildPublicRequestCompositeKey(item))
          );
          const preservedRequests = recentLocalBookingRequestsRef.current
            .filter((entry) => now - entry.addedAt <= LOCAL_REQUEST_VISIBILITY_GRACE_MS)
            .filter((entry) => !remoteKeys.has(buildPublicRequestCompositeKey(entry.request)));

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

          const mergedResolved: PublicSalonState = preservedRequests.length
            ? {
                ...resolved,
                richiestePrenotazione: [
                  ...resolved.richiestePrenotazione,
                  ...preservedRequests.map((entry) => entry.request),
                ],
              }
            : resolved;

          setPublicSalonState(mergedResolved);
          setSalonLoadError('');
          return mergedResolved;
        }

        return resolved;
      } finally {
        publicSalonRefreshInFlightRef.current = false;
        publicSalonRefreshPromiseRef.current = null;
      }
    })();

    publicSalonRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, resolveSalonByCode]);

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

  const refreshPublicSalonAvailability = useCallback(async () => {
    if (isCurrentWorkspaceSalon || !normalizedSelectedSalonCode) {
      setBackendDayOccupancy([]);
      return { resolved: null, occupancy: [] as PublicBookingOccupancyItem[] };
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
          setPublicSalonState(snapshot);
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
        setBackendDayOccupancy([]);
        setSalonLoadError('');
        return;
      }

      if (!normalizedSelectedSalonCode) {
        setPublicSalonState(null);
        setBackendDayOccupancy([]);
        setSalonLoadError('Inserisci un codice salone valido per continuare.');
        return;
      }

      setIsLoadingSalon(true);
      const resolved = await refreshPublicSalonState();
      setIsLoadingSalon(false);

      if (!resolved) {
        setPublicSalonState(null);
        setBackendDayOccupancy([]);
        setSalonLoadError(
          'Questo codice salone non è stato trovato. Controlla il codice oppure usa il link del tuo parrucchiere.'
        );
        return;
      }

      setPublicSalonState(resolved);
      setSalonLoadError('');
    };

    loadSalon();
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, refreshPublicSalonState]);

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

  useEffect(() => {
    if (!data) return;

    if (!lastHapticDayRef.current) {
      lastHapticDayRef.current = data;
      return;
    }

    if (Platform.OS === 'ios' && lastHapticDayRef.current !== data) {
      void haptic.light();
    }

    lastHapticDayRef.current = data;
  }, [data]);

  const centerDayInPicker = useCallback(
    (dateValue: string, animated = false) => {
      const index = giorniDisponibili.findIndex((item) => item.value === dateValue);
      if (index < 0) return;

      dayPickerRef.current?.scrollTo({
        x: index * activeDayCardStride,
        animated,
      });
    },
    [activeDayCardStride, giorniDisponibili]
  );

  const handleDayCardPress = useCallback(
    (dateValue: string) => {
      if (!dateValue) return;

      lastSnappedDayRef.current = dateValue;

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
      const nextIndex = Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(safeOffsetX / activeDayCardStride))
      );
      const nextDay = giorniDisponibili[nextIndex];
      if (!nextDay) return;

      if (lastSnappedDayRef.current === nextDay.value && data === nextDay.value) {
        return;
      }

      lastSnappedDayRef.current = nextDay.value;

      if (data !== nextDay.value) {
        setData(nextDay.value);
      }

      centerDayInPicker(nextDay.value, false);
    },
    [activeDayCardStride, centerDayInPicker, data, giorniDisponibili]
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
    return () => {
      if (dayPickerScrollSettleTimeoutRef.current) {
        clearTimeout(dayPickerScrollSettleTimeoutRef.current);
        dayPickerScrollSettleTimeoutRef.current = null;
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
            return doesExistingFrontendBookingBlockSelectedService({
              selectedServiceName: serviceName,
              existingServiceName: item.servizio,
              existingMachineryIds: item.macchinarioIds,
              services,
            });
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

        return doesExistingFrontendBookingBlockSelectedService({
          selectedServiceName: serviceName,
          existingServiceName: item.servizio,
          existingMachineryIds: item.macchinarioIds,
          services,
        });
      });

      if (hasAnonymousOverlaps) {
        return true;
      }

      return busyCompatibleOperatorKeys.size >= compatibleOperatorKeys.size;
    },
    [serviceUsesOperatorScheduling]
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
              item.telefono.trim() !== profile.telefono.trim() ||
              normalizeIdentityText(item.servizio) !== normalizeIdentityText(servizio)
            ) {
              return false;
            }

            if (!serviceUsesOperatorScheduling) {
              return true;
            }

            const existingOperatorId = item.operatoreId?.trim() ?? '';
            const existingOperatorName = item.operatoreNome?.trim() ?? '';

            if (!existingOperatorId && !existingOperatorName) {
              return !operatoreId.trim() && !operatoreNome.trim();
            }

            return matchesOperatorIdentity({
              appointmentOperatorId: existingOperatorId,
              appointmentOperatorName: existingOperatorName,
              selectedOperatorId: operatoreId || null,
              selectedOperatorName: operatoreNome || null,
            });
          }
        )
      ),
    [
      data,
      effectiveRichieste,
      operatoreId,
      operatoreNome,
      ora,
      profile.email,
      profile.telefono,
      servizio,
      serviceUsesOperatorScheduling,
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

  useEffect(() => {
    if (!clienteInibito || !isBookingStarted) {
      return;
    }

    setIsBookingStarted(false);
    setServizio('');
    setOperatoreId('');
    setOperatoreNome('');
    setOra('');
    setNote('');
  }, [clienteInibito, isBookingStarted]);

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
            return doesExistingFrontendBookingBlockSelectedService({
              selectedServiceName: serviceName,
              existingServiceName: item.servizio,
              existingMachineryIds: item.macchinarioIds,
              services,
            });
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

        return doesExistingFrontendBookingBlockSelectedService({
          selectedServiceName: serviceName,
          existingServiceName: item.servizio,
          existingMachineryIds: item.macchinarioIds,
          services,
        });
      }).length;

      return Math.max(
        0,
        compatibleOperatorKeys.size - busyCompatibleOperatorKeys.size - anonymousOverlaps
      );
    },
    [serviceUsesOperatorScheduling]
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
  const guidedSlotsActive =
    canChooseTime &&
    !!servizio.trim() &&
    effectiveAvailabilitySettings.guidedSlotsEnabled;
  const guidedSlotsStrategy = effectiveAvailabilitySettings.guidedSlotsStrategy;
  const guidedSlotsVisibility = effectiveAvailabilitySettings.guidedSlotsVisibility;
  const bookableFrontendTimeSlots = useMemo(
    () =>
      displayTimeSlots.filter(
        (slotTime) => !orariNonDisponibili.has(slotTime) && !orariInConflitto.has(slotTime)
      ),
    [displayTimeSlots, orariInConflitto, orariNonDisponibili]
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
          return { slotTime, score: Number.NEGATIVE_INFINITY };
        }

        return {
          slotTime,
          score: scoreGuidedSlot({
            slotTime,
            block,
            serviceDurationMinutes: selectedDuration,
            intervalMinutes: slotIntervalMinutes,
            strategy: guidedSlotsStrategy as GuidedSlotStrategy,
          }),
        };
      })
      .sort((first, second) => second.score - first.score);

    if (scoredSlots.length <= MAX_GUIDED_SLOT_RECOMMENDATIONS) {
      return scoredSlots.map((item) => item.slotTime);
    }

    const bestScore = scoredSlots[0]?.score ?? Number.NEGATIVE_INFINITY;
    const thresholdSlots = scoredSlots.filter((item) => item.score >= bestScore - 24);
    const limitedSlots = thresholdSlots.slice(0, MAX_GUIDED_SLOT_RECOMMENDATIONS);

    return (limitedSlots.length ? limitedSlots : scoredSlots.slice(0, MAX_GUIDED_SLOT_RECOMMENDATIONS))
      .map((item) => item.slotTime)
      .sort((first, second) => timeToMinutes(first) - timeToMinutes(second));
  }, [
    bookableFrontendTimeSlots,
    data,
    effectiveAvailabilitySettings,
    effectiveServizi,
    guidedSlotsActive,
    guidedSlotsStrategy,
    servizio,
  ]);
  const shouldShowOnlyRecommendedSlots =
    guidedSlotsActive &&
    guidedRecommendedTimeSlots.length > 0 &&
    guidedSlotsVisibility === 'recommended_only';
  const shouldShowGuidedRecommendations =
    guidedSlotsActive && guidedRecommendedTimeSlots.length > 0;
  const shouldShowExpandedTimeGrid =
    !shouldShowGuidedRecommendations ||
    guidedSlotsVisibility === 'recommended_only'
      ? !shouldShowOnlyRecommendedSlots
      : showAllGuidedSlots;
  const visibleFrontendTimeSlots = shouldShowOnlyRecommendedSlots
    ? guidedRecommendedTimeSlots
    : displayTimeSlots;

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

  const canAnySlotBeBooked = useMemo(
    () =>
      displayTimeSlots.some(
        (slotTime) => !orariNonDisponibili.has(slotTime) && !orariInConflitto.has(slotTime)
      ),
    [displayTimeSlots, orariInConflitto, orariNonDisponibili]
  );

  useEffect(() => {
    setShowAllGuidedSlots(false);
  }, [data, operatoreId, servizio, guidedSlotsStrategy, guidedSlotsVisibility, guidedSlotsActive]);

  const buildWaitlistKey = useCallback(
    (slotTime: string) => `${data}|${slotTime}|${servizio.trim().toLowerCase()}`,
    [data, servizio]
  );

  useEffect(() => {
    let isMounted = true;

    const loadWaitlistEntries = async () => {
      if (!effectiveWorkspace || !isRegistered || !profile.email.trim() || !profile.telefono.trim()) {
        if (isMounted) {
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
        });

        if (error) {
          console.log('Errore caricamento slot waitlist frontend:', error);
          return;
        }

        if (!isMounted) return;

        const nextKeys = new Set<string>();
        (Array.isArray(waitlistRows) ? (waitlistRows as SlotWaitlistEntry[]) : []).forEach((item) => {
          const slotDate = String(item.appointment_date ?? '').trim();
          const slotTime = String(item.appointment_time ?? '').trim().slice(0, 5);
          const serviceName = String(item.requested_service_name ?? '').trim().toLowerCase();
          if (!slotDate || !slotTime || !serviceName) return;
          nextKeys.add(`${slotDate}|${slotTime}|${serviceName}`);
        });
        setWaitlistKeys(nextKeys);
      } catch (error) {
        console.log('Errore fetch slot waitlist frontend:', error);
      }
    };

    void loadWaitlistEntries();

    return () => {
      isMounted = false;
    };
  }, [data, effectiveWorkspace, isRegistered, profile.email, profile.telefono, servizio]);

  const submitWaitlistForSlots = useCallback(
    async ({
      slotTimes,
      actionKey,
      successMessage,
    }: {
      slotTimes: string[];
      actionKey: string;
      successMessage: (slotCount: number, notifiedCount: number) => string;
    }) => {
      if (!effectiveWorkspace) {
        Alert.alert('Salone non trovato', 'Riapri la pagina del salone e riprova.');
        return;
      }

      if (!isRegistered) {
        Alert.alert('Registrazione richiesta', 'Registrati o accedi prima di metterti in lista d’attesa.');
        return;
      }

      if (!servizio.trim()) {
        Alert.alert('Seleziona un servizio', 'Prima scegli il servizio per cui vuoi essere avvisato.');
        return;
      }

      const normalizedSlotTimes = Array.from(
        new Set(slotTimes.map((item) => item.trim()).filter(Boolean))
      );
      const pendingSlotTimes = normalizedSlotTimes.filter(
        (slotTime) => !waitlistKeys.has(buildWaitlistKey(slotTime))
      );

      if (pendingSlotTimes.length === 0) {
        Alert.alert('Avviso già attivo', 'Hai già attivato l’avviso per questa disponibilità.');
        return;
      }

      setWaitlistSubmittingKeys((current) => {
        const next = new Set(current);
        next.add(actionKey);
        return next;
      });

      try {
        const savedKeys: string[] = [];
        let notifiedCount = 0;

        for (const slotTime of pendingSlotTimes) {
          const waitlistKey = buildWaitlistKey(slotTime);
          const { data: waitlistResult, error } = await supabase.rpc('join_public_slot_waitlist', {
            p_salon_code: effectiveWorkspace.salonCode,
            p_requested_service_name: servizio,
            p_requested_duration_minutes: getServiceDuration(servizio, effectiveServizi),
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

          if (responseStatus === 'notified') {
            notifiedCount += 1;
          }
        }

        if (savedKeys.length === 0) {
          Alert.alert('Lista d’attesa non disponibile', 'Non sono riuscito a salvare la richiesta di avviso.');
          return;
        }

        setWaitlistKeys((current) => {
          const next = new Set(current);
          savedKeys.forEach((item) => next.add(item));
          return next;
        });

        Alert.alert(
          notifiedCount > 0 ? 'Slot disponibile' : 'Avviso attivato',
          successMessage(savedKeys.length, notifiedCount)
        );
      } catch (error) {
        console.log('Errore waitlist slot frontend:', error);
        Alert.alert('Lista d’attesa non disponibile', 'Non sono riuscito a salvare la richiesta di avviso.');
      } finally {
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
      profile.cognome,
      profile.email,
      profile.instagram,
      profile.nome,
      profile.telefono,
      servizio,
      waitlistKeys,
    ]
  );

  const mieRichieste = useMemo(() => {
    if (!isRegistered) return [];

    return effectiveRichieste
      .filter(
        (item) =>
          item.email.trim().toLowerCase() === profile.email.trim().toLowerCase() &&
          item.telefono.trim() === profile.telefono.trim()
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [effectiveRichieste, isRegistered, profile.email, profile.telefono]);
  const clienteNomeCompleto = useMemo(
    () => `${profile.nome.trim()} ${profile.cognome.trim()}`.trim().toLowerCase(),
    [profile.cognome, profile.nome]
  );
  const currentCustomerIdentityNames = useMemo(() => {
    const names = new Set<string>();
    if (clienteNomeCompleto) {
      names.add(clienteNomeCompleto);
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    const normalizedPhone = profile.telefono.trim();

    effectiveClienti.forEach((item) => {
      const sameEmail =
        !!normalizedEmail &&
        (item.email ?? '').trim().toLowerCase() === normalizedEmail;
      const samePhone = !!normalizedPhone && item.telefono.trim() === normalizedPhone;

      if (!sameEmail && !samePhone) {
        return;
      }

      const normalizedName = item.nome.trim().toLowerCase();
      if (normalizedName) {
        names.add(normalizedName);
      }
    });

    return names;
  }, [clienteNomeCompleto, effectiveClienti, profile.email, profile.telefono]);
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

  const waitlistableOccupiedSlots = useMemo(
    () =>
      displayTimeSlots.filter((slotTime) => {
        if (
          !canChooseTime ||
          !isRegistered ||
          !servizio.trim() ||
          clienteInibito ||
          !orariOccupati.has(slotTime)
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

        return !clientOwnsOccupiedSlot(slotTime);
      }),
    [
      canChooseTime,
      clientOwnsOccupiedSlot,
      clienteInibito,
      data,
      isRegistered,
      mieRichieste,
      orariOccupati,
      servizio,
      displayTimeSlots,
    ]
  );

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
      await submitWaitlistForSlots({
        slotTimes: block.slotTimes,
        actionKey: `block:${block.id}`,
        successMessage: (slotCount, notifiedCount) =>
          notifiedCount > 0
            ? `Uno degli orari tra ${block.startTime} e ${block.endTime} si è appena liberato. Prova a prenotarlo subito.`
            : slotCount === 1
              ? `Ti avviseremo se ${servizio} il ${formatDateCompact(data)} alle ${block.startTime} si libera.`
              : `Ti avviseremo se si libera un orario tra ${block.startTime} e ${block.endTime} il ${formatDateCompact(data)}.`,
      });
    },
    [data, servizio, submitWaitlistForSlots]
  );

  const handleJoinWaitlistDay = useCallback(async () => {
    await submitWaitlistForSlots({
      slotTimes: waitlistableOccupiedSlots,
      actionKey: `day:${data}|${servizio.trim().toLowerCase()}`,
      successMessage: (slotCount, notifiedCount) =>
        notifiedCount > 0
          ? 'Si è appena liberato almeno uno degli orari occupati di oggi. Prova a prenotarlo subito.'
          : slotCount === 1
            ? `Ti avviseremo se ${servizio} il ${formatDateCompact(data)} alle ${waitlistableOccupiedSlots[0]} si libera.`
            : `Ti avviseremo se si libera qualsiasi orario occupato il ${formatDateCompact(data)}.`,
    });
  }, [data, servizio, submitWaitlistForSlots, waitlistableOccupiedSlots]);

  const frontendAutoAcceptEnabled = !isCurrentWorkspaceSalon
    ? publicSalonState?.workspace.autoAcceptBookingRequests === true
    : false;

  const notificheRisposteCount = useMemo(
    () =>
      frontendAutoAcceptEnabled
        ? 0
        : mieRichieste.filter(
            (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
          ).length,
    [frontendAutoAcceptEnabled, mieRichieste]
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

  const unreadCancelledRequests = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato === 'Annullata' && item.viewedByCliente === false
      ),
    [mieRichieste]
  );
  const unreadStatusResponses = useMemo(
    () =>
      frontendAutoAcceptEnabled
        ? []
        : mieRichieste.filter(
            (item) =>
              item.stato !== 'In attesa' &&
              item.stato !== 'Annullata' &&
              item.viewedByCliente === false
          ),
    [frontendAutoAcceptEnabled, mieRichieste]
  );
  const lastUnreadStatusSignatureRef = useRef('');

  useEffect(() => {
    if (!isRegistered || unreadCancelledRequests.length === 0) {
      lastUnreadCancelledSignatureRef.current = '';
      return;
    }

    const signature = unreadCancelledRequests.map((item) => item.id).sort().join('|');
    if (signature === lastUnreadCancelledSignatureRef.current) return;

    lastUnreadCancelledSignatureRef.current = signature;
  }, [isRegistered, unreadCancelledRequests]);

  useEffect(() => {
    if (!isRegistered || frontendAutoAcceptEnabled || unreadStatusResponses.length === 0) {
      lastUnreadStatusSignatureRef.current = '';
      return;
    }

    const signature = unreadStatusResponses
      .map((item) => `${item.id}:${item.stato}:${item.data}:${item.ora}:${item.note ?? ''}`)
      .sort()
      .join('|');

    if (signature === lastUnreadStatusSignatureRef.current) return;

    lastUnreadStatusSignatureRef.current = signature;
  }, [frontendAutoAcceptEnabled, isRegistered, unreadStatusResponses]);

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
          void refreshPublicSalonAvailability();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, refreshPublicSalonAvailability]);

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

    const intervalId = setInterval(refresh, CLIENT_BOOKING_REFRESH_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refresh();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, refreshPublicSalonAvailability]);

  useEffect(() => {
    if (!isRegistered || !showRequestsExpanded) {
      lastViewedSyncSignatureRef.current = '';
      return;
    }

    const unreadViewSyncCandidates = mieRichieste.filter(
      (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
    );
    const hasUnread = unreadViewSyncCandidates.length > 0;

    if (!hasUnread) return;

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
      profile.email,
      profile.telefono
    );

    if (!isCurrentWorkspaceSalon) {
      setPublicSalonState((current) =>
        current
          ? {
              ...current,
              richiestePrenotazione: current.richiestePrenotazione.map((item) =>
                item.email.trim().toLowerCase() === profile.email.trim().toLowerCase() &&
                item.telefono.trim() === profile.telefono.trim() &&
                item.stato !== 'In attesa'
                  ? { ...item, viewedByCliente: true }
                  : item
              ),
            }
          : current
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
    showRequestsExpanded,
    salonWorkspace.salonCode,
  ]);

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
          'Salone non disponibile. Apri il link corretto del salone oppure inserisci un codice valido prima di registrarti.'
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
      } catch (error) {
        console.log('Errore salvataggio profilo cliente locale:', error);
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
          'Profilo creato, ma il collegamento automatico al salone non e riuscito al primo tentativo. Puoi comunque continuare con la prenotazione.'
        );
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

      setIsRegistered(true);
      setIsBookingStarted(shouldStartInBookingMode);
      setShowRequestsExpanded(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const loginFrontendCliente = async () => {
    const normalizedEmail = profile.email.trim().toLowerCase();
    const normalizedPhone = limitPhoneToTenDigits(profile.telefono.trim());
    const hasEmail = normalizedEmail !== '';
    const hasPhone = normalizedPhone !== '';
    const emailIsValid = !hasEmail || isValidEmail(normalizedEmail);
    const phoneIsValid = !hasPhone || isValidPhone10(normalizedPhone);

    if (!effectiveWorkspace) {
      setProfileSaveError(
        salonLoadError ||
          'Apri prima il salone corretto dal link o inserisci un codice salone valido.'
      );
      requestAnimationFrame(() => {
        scrollToField(salonCodeInputRef);
      });
      return;
    }

    if (!hasEmail && !hasPhone) {
      setProfileFieldErrors({
        email: 'Inserisci email o cellulare',
        telefono: 'Inserisci email o cellulare',
      });
      setProfileSaveError('Per accedere inserisci almeno email oppure cellulare usati nel salone.');
      return;
    }

    if (!emailIsValid || !phoneIsValid) {
      setProfileFieldErrors({
        email: !emailIsValid ? 'Email non valida' : undefined,
        telefono: !phoneIsValid
          ? 'Numero di telefono errato (deve avere 10 cifre)'
          : undefined,
      });
      setProfileSaveError('Per accedere usa email o cellulare validi gia registrati nel salone.');
      return;
    }

    setProfileFieldErrors({});
    setIsSavingProfile(true);
    setProfileSaveError('');

    try {
      const rankedMatches = effectiveClienti
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
        setProfileSaveError(
          'Cliente non trovato per questo salone. Controlla email o cellulare oppure usa Registrati.'
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
        setProfileSaveError(
          'Cliente non trovato per questo salone. Controlla email o cellulare oppure usa Registrati.'
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
      } catch (error) {
        console.log('Errore salvataggio accesso cliente locale:', error);
      }

      setSelectedSalonCode(effectiveWorkspace.salonCode);
      setSalonCodeDraft(effectiveWorkspace.salonCode);
      void persistFrontendBiometricSnapshot(nextProfile, effectiveWorkspace.salonCode);
      AsyncStorage.setItem(FRONTEND_LAST_SALON_CODE_KEY, effectiveWorkspace.salonCode).catch((error) => {
        console.log('Errore salvataggio ultimo salone dopo accesso:', error);
      });

      setIsRegistered(true);
      setIsBookingStarted(shouldStartInBookingMode);
      setShowRequestsExpanded(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

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

  const inviaRichiesta = async () => {
    if (!isRegistered) {
      Alert.alert(
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
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    if (clienteInibito) {
      Alert.alert(
        'Prenotazioni online non disponibili',
        'Questo profilo cliente è stato inibito dal salone e non può inviare nuove richieste online.'
      );
      return;
    }

    if (!servizio.trim() || !ora.trim()) {
      Alert.alert(
        'Dati mancanti',
        'Scegli servizio, giorno e orario prima di inviare la richiesta.'
      );
      return;
    }

    if (isSelectedTimeWithinMinimumNotice) {
      Alert.alert(
        'Preavviso minimo richiesto',
        `Per le prenotazioni di oggi servono almeno ${DEFAULT_MINIMUM_NOTICE_MINUTES} minuti di preavviso.`
      );
      return;
    }

    if (selectedDateAvailability.closed) {
      Alert.alert(
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
      Alert.alert(
        'Orario non disponibile',
        'Questo servizio si accavalla con la pausa pranzo del salone. Scegli un altro orario.'
      );
      return;
    }

    if (exceedsClosingTimeSelection) {
      const daySchedule = effectiveAvailabilitySettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      Alert.alert(
        'Orario oltre chiusura',
        `Questo servizio finirebbe oltre l'orario di chiusura del salone${daySchedule ? `, previsto alle ${daySchedule.endTime}` : ''}. Scegli un orario precedente.`
      );
      return;
    }

    if (!effectiveWorkspace) {
      Alert.alert(
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
    const validationBaseBlockingAppointments = buildBlockingAppointments(
      validationAppointments,
      validationRequests
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
    const validationSettings =
      latestSalonState?.availabilitySettings ?? effectiveAvailabilitySettings;
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
      setPublicSalonState(latestSalonState);

      const isBlockedInLatestState = latestSalonState.clienti.some((item) =>
        matchesBlockedClientProfile(item, profile)
      );

      if (isBlockedInLatestState) {
        Alert.alert(
          'Prenotazioni online non disponibili',
          'Il salone ha appena inibito questo cliente. Non puoi inviare nuove richieste online.'
        );
        return;
      }

      const futureBookingLimitCheck = countScheduledFutureBookingsForClient({
        profile,
        clienti: latestSalonState.clienti,
        appointments: latestSalonState.appuntamenti,
        requests: latestSalonState.richiestePrenotazione,
      });

      if (
        futureBookingLimitCheck.limit !== null &&
        futureBookingLimitCheck.total >= futureBookingLimitCheck.limit
      ) {
        Alert.alert(
          'Limite appuntamenti raggiunto',
          `Questo cliente puo avere al massimo ${futureBookingLimitCheck.limit} appuntamenti futuri programmati.`
        );
        return;
      }
    }

    if (!latestSalonState) {
      const futureBookingLimitCheck = countScheduledFutureBookingsForClient({
        profile,
        clienti: effectiveClienti,
        appointments: effectiveAppuntamenti,
        requests: effectiveRichieste,
      });

      if (
        futureBookingLimitCheck.limit !== null &&
        futureBookingLimitCheck.total >= futureBookingLimitCheck.limit
      ) {
        Alert.alert(
          'Limite appuntamenti raggiunto',
          `Questo cliente puo avere al massimo ${futureBookingLimitCheck.limit} appuntamenti futuri programmati.`
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
      Alert.alert(
        'Giorno non disponibile',
        'Il salone ha appena aggiornato questo giorno come chiuso o festivo. Scegline uno disponibile.'
      );
      return;
    }

    if (refreshedLunchOverlap) {
      Alert.alert(
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

      Alert.alert(
        'Orario oltre chiusura',
        `Il salone chiude${daySchedule ? ` alle ${daySchedule.endTime}` : ' prima della fine di questo servizio'}. Scegli un orario precedente.`
      );
      return;
    }

    if (
      validationServiceUsesOperatorScheduling &&
      !validationOperatoriCompatibili.some((item) => item.id === operatoreId)
    ) {
      Alert.alert(
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
        const saved = await addBookingRequestForSalon(effectiveWorkspace.salonCode, nextRequest);

        if (!saved.ok) {
          if (!isCurrentWorkspaceSalon) {
            const restored = await refreshPublicSalonState();
            if (restored) {
              setPublicSalonState(restored);
            }
            await refreshBackendDayOccupancy();
          }

          if (saved.error === 'slot_unavailable') {
            Alert.alert(
              'Orario non disponibile',
              `Lo slot del ${formatDateCompact(data)} alle ${ora} non e piu disponibile. Aggiorna e scegli un altro orario.`
            );
          } else if (saved.error === 'salon_not_found') {
            Alert.alert(
              'Salone non disponibile',
              'Non riesco piu a trovare il salone selezionato. Riapri il link corretto oppure reinserisci il codice salone.'
            );
          } else if (saved.error === 'invalid_customer_data') {
            Alert.alert(
              'Dati cliente incompleti',
              'Controlla nome, email e telefono prima di inviare la richiesta.'
            );
          } else if (saved.error === 'max_future_appointments_reached') {
            Alert.alert(
              'Limite appuntamenti raggiunto',
              'Questo cliente ha gia raggiunto il numero massimo di appuntamenti futuri programmabili.'
            );
          } else if (saved.error === 'service_required') {
            Alert.alert(
              'Servizio non valido',
              'Seleziona di nuovo il servizio prima di inviare la richiesta.'
            );
          } else if (saved.error === 'appointment_datetime_required') {
            Alert.alert(
              'Orario non disponibile',
              'Seleziona di nuovo giorno e orario prima di inviare la richiesta.'
            );
          } else {
            Alert.alert(
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
            setPublicSalonState(refreshed);
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
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
      } finally {
        bookingRequestInFlightKeyRef.current = '';
        setBookingRequestSubmitting(false);
      }
    };

    if (refreshedConflict || richiestaInConflitto || exactSlotRequestAlreadyPresent) {
      Alert.alert(
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

      try {
        const result = await cancelClientAppointmentForSalon({
          salonCode: effectiveWorkspace.salonCode,
          requestId,
          email: profile.email,
          telefono: profile.telefono,
        });

        if (!result.ok) {
          const message = result.error ?? 'Non sono riuscito ad annullare la prenotazione.';
          Alert.alert('Annullamento non riuscito', message);
          return;
        }

        if (!isCurrentWorkspaceSalon) {
          const refreshed = await resolveSalonByCode(effectiveWorkspace.salonCode);
          if (refreshed) {
            setPublicSalonState(refreshed);
          }
        }

        const successMessage = isPending
          ? 'La richiesta è stata annullata e il salone è stato avvisato.'
          : 'La prenotazione è stata annullata e il salone è stato avvisato.';

        Alert.alert(
          isPending ? 'Richiesta annullata' : 'Appuntamento annullato',
          successMessage
        );
      } finally {
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
    }
  ) => {
    const canCancel = options?.canCancel === true;
    const isCancelled = item.stato === 'Annullata';
    const isAccepted = item.stato === 'Accettata';
    const isCancelling = cancellingRequestId === item.id;
    const handleCancelRequest = () => {
      annullaPrenotazioneCliente(item.id);
    };

    return (
      <View key={item.id} style={[styles.requestStatusCard, isWeb && styles.requestStatusCardWeb]}>
        <View style={isWeb ? styles.requestStatusHeroBlockWeb : undefined}>
          <View style={[styles.requestStatusTopRow, isWeb && styles.requestStatusTopRowWeb]}>
            {isWeb ? renderRequestStateBadge(item.stato) : null}
            <View
              style={[
                styles.requestStatusHeaderCopy,
                isWeb && styles.requestStatusHeaderCopyWeb,
              ]}
            >
              <Text style={[styles.requestStatusTitle, isWeb && styles.requestStatusTitleWeb]}>
                {item.servizio}
              </Text>
              <Text style={[styles.requestStatusMeta, isWeb && styles.requestStatusMetaWeb]}>
                {formatDateLong(item.data)} · {item.ora}
              </Text>
              {item.operatoreNome ? (
                <Text
                  style={[
                    styles.requestStatusOperatorLine,
                    isWeb && styles.requestStatusOperatorLineWeb,
                  ]}
                >
                  Operatore: {item.operatoreNome}
                </Text>
              ) : null}
            </View>

            {!isWeb ? renderRequestStateBadge(item.stato) : null}
          </View>

          {salonActivityCategory || item.operatoreNome ? (
            <View style={[styles.requestMetaPillsRow, isWeb && styles.requestMetaPillsRowWeb]}>
              {salonActivityCategory ? (
                <View style={[styles.requestCategoryChip, isWeb && styles.requestCategoryChipWeb]}>
                  <Text style={styles.requestCategoryChipText}>{salonActivityCategory}</Text>
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

        <Text style={[styles.requestStatusBody, isWeb && styles.requestStatusBodyWeb]}>
          {(item.origine ?? 'frontend') === 'backoffice'
            ? tf('frontend_request_from_salon')
            : item.stato === 'In attesa'
              ? tf('frontend_request_pending_text')
              : isAccepted
                ? tf('frontend_request_accepted_text')
                : isCancelled
                  ? tf('frontend_request_cancelled_text')
                  : tf('frontend_request_rejected_text')}
        </Text>

        {salonAddress ? (
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
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
      return;
    }

    if (ultimaRichiesta) {
      setUltimaRichiesta(null);
      setShowRequestsExpanded(true);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
      return;
    }

    if (showRequestsExpanded) {
      setShowRequestsExpanded(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/cliente');
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
      window.location.assign('/cliente?mode=login');
      return;
    }

    router.replace({
      pathname: '/cliente',
      params: { mode: 'login' },
    });
  }, [router]);

  const performFrontendLogout = async () => {
    await AsyncStorage.multiRemove([
      FRONTEND_PROFILE_KEY,
      FRONTEND_LAST_SALON_CODE_KEY,
      FRONTEND_BIOMETRIC_ENABLED_KEY,
      FRONTEND_BIOMETRIC_PROFILE_KEY,
      FRONTEND_BIOMETRIC_SALON_CODE_KEY,
    ]);

    setProfile(EMPTY_PROFILE);
    setAccessMode('login');
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

    setIsBookingStarted(false);
    setShowRequestsExpanded(true);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const activeAccessMode: FrontendAccessMode = accessMode ?? 'register';

  const lockSelectionTap = useCallback((durationMs = 220) => {
    selectionTapLockUntilRef.current = Date.now() + durationMs;
  }, []);

  const shouldIgnoreSelectionTap = useCallback(
    () => isWeb && Date.now() < selectionTapLockUntilRef.current,
    []
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
      enabled
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
          <View
            style={[
              styles.heroTopRow,
              compactTopBar && styles.heroTopRowCompact,
              Platform.OS === 'android' && width < 600 && { paddingTop: 48 }, // padding extra solo su Android smartphone
            ]}
          >
            <View style={styles.heroTopLeftCluster}>
              {isRegistered && (isBookingStarted || showRequestsExpanded || !!ultimaRichiesta) ? (
                <TouchableOpacity
                  style={[
                    styles.actionIconBadge,
                    styles.homeHouseSettingsButton,
                    compactTopBar && styles.actionIconBadgeCompact,
                  ]}
                  onPress={handleFrontendBack}
                  activeOpacity={0.9}
                >
                  <Ionicons name="chevron-back" size={compactTopBar ? 20 : 24} color="#0f172a" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={[styles.heroTopActions, compactTopBar && styles.heroTopActionsCompact]}>
              <TouchableOpacity
                style={[
                  styles.actionIconBadge,
                  styles.homeHouseSettingsButton,
                  styles.settingsGearBadge,
                  compactTopBar && styles.actionIconBadgeCompact,
                ]}
                onPress={openFrontendSettings}
                activeOpacity={0.9}
              >
                <Ionicons name="settings" size={compactTopBar ? 20 : 24} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.frontendBrandBand}>
            <AppWordmark />
          </View>

          <View style={styles.frontendTitleBand}>
            <Text style={styles.title}>
              {heroTitle}
            </Text>
          </View>

          {effectiveWorkspace?.salonName?.trim() ? (
            <View style={styles.connectedSalonBadge}>
              <Text style={styles.connectedSalonBadgeEyebrow}>Da</Text>
              <Text style={styles.connectedSalonBadgeName}>
                {effectiveWorkspace.salonName.trim()}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.subtitle, styles.subtitleCentered]}>{tf('frontend_subtitle')}</Text>
        {!isRegistered ? (
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
        ) : !isBookingStarted ? (
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

              {clienteInibito ? (
                <View style={styles.blockedInfoCard}>
                  <View style={styles.blockedInfoHeader}>
                    <View style={styles.blockedInfoIconWrap}>
                      <Ionicons name="ban-outline" size={18} color="#b91c1c" />
                    </View>
                    <Text style={styles.blockedInfoTitle}>Profilo bloccato dal salone</Text>
                  </View>
                  <Text style={styles.blockedInfoText}>
                    Il salone ha disattivato le prenotazioni online per questo cliente. Per
                    sbloccare l’accesso devi contattare direttamente il salone.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.heroPrimaryButton}
                  onPress={() => {
                    setShowRequestsExpanded(false);
                    setIsBookingStarted(true);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.heroPrimaryButtonText}>{tf('frontend_book')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}
      </View>

      {isRegistered && !isBookingStarted ? (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={[styles.requestsToggleButton, styles.requestsToggleButtonInline]}
            onPress={() => {
              haptic.light();
              setShowRequestsExpanded((current) => !current);
            }}
            activeOpacity={0.9}
          >
            <View style={styles.requestsToggleTextWrap}>
              <Text style={styles.requestsToggleTitle}>{tf('frontend_my_bookings')}</Text>
              <Text style={styles.requestsToggleSubtitle}>
                {tf('frontend_my_bookings_hint')}
              </Text>
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
                      {richiesteArchiviate.map((item) => renderCustomerRequestCard(item))}
                    </View>
                  ) : null}
                </View>
              )}
            </>
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
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Accedi o registrati</Text>
            <Text style={styles.authIntroText}>
              Un solo passaggio: entra con il tuo profilo oppure crea il nuovo profilo cliente.
            </Text>
            {initialSalonCodeParam ? (
              <Text style={styles.authQrHint}>
                QR salone rilevato: il profilo verra collegato automaticamente.
              </Text>
            ) : null}
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
            {Platform.OS !== 'web' && frontendBiometricEnabled && activeAccessMode === 'login' ? (
              <TouchableOpacity
                style={[styles.primaryButton, styles.authBiometricButton]}
                onPress={() => {
                  void unlockFrontendClienteWithBiometric();
                }}
                activeOpacity={0.9}
                disabled={frontendBiometricBusy}
              >
                <Text style={styles.primaryButtonText}>
                  {frontendBiometricBusy
                    ? 'Verifica biometrica...'
                    : `Accedi con ${frontendBiometricActionLabel}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {activeAccessMode === 'login' ? (
            <View style={[styles.sectionCard, styles.authSectionCard]}>
              <Text style={styles.sectionEyebrow}>Accesso</Text>
              <Text style={styles.authSectionTitle}>Accedi</Text>
              <Text style={styles.authSectionDescription}>
                Accedi con email oppure cellulare gia registrati nello stesso salone.
              </Text>
              <TextInput
                ref={emailInputRef}
                style={[styles.input, styles.authInput, profileFieldErrors.email && styles.inputError]}
                placeholder={`${tf('common_email')} (oppure cellulare)`}
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
                placeholder="Cellulare (oppure email)"
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
            </View>
          ) : (
            <View style={[styles.sectionCard, styles.authSectionCard, styles.authRegisterSectionCard]}>
              <Text style={styles.sectionEyebrow}>Registrazione</Text>
              <Text style={styles.authSectionTitle}>Registrati</Text>
              <Text style={styles.authSectionDescription}>
                Compila i tuoi dati e registra il profilo cliente sul salone selezionato.
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
      ) : null}

      {(!effectiveWorkspace || isRegistered) && !isBookingStarted ? (
        <View style={styles.salonAccessCard}>
          <Text style={styles.salonAccessTitle}>{tf('frontend_salon_code_title')}</Text>
          <TextInput
            ref={salonCodeInputRef}
            style={styles.salonCodeInput}
            placeholder={tf('frontend_salon_code_placeholder')}
            placeholderTextColor="#8f8f8f"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            value={salonCodeDraft}
            onChangeText={(value) => setSalonCodeDraft(normalizeSalonCode(value))}
            onFocus={() => handleFieldFocus(salonCodeInputRef)}
            returnKeyType="go"
            onSubmitEditing={() => setSelectedSalonCode(salonCodeDraft)}
          />
          <TouchableOpacity
            style={styles.salonCodeButton}
            onPress={() => setSelectedSalonCode(salonCodeDraft)}
            activeOpacity={0.9}
          >
            <Text style={styles.salonCodeButtonText}>{tf('frontend_open_salon')}</Text>
          </TouchableOpacity>
          <View style={styles.salonAccessFooter}>
            <Text style={styles.salonAccessHint}>
              {effectiveWorkspace
                ? tf('frontend_active_salon', { salonName: effectiveWorkspace.salonName })
                : tf('frontend_open_hint')}
            </Text>
            {isLoadingSalon ? (
              <Text style={styles.salonAccessLoading}>{tf('frontend_loading')}</Text>
            ) : null}
          </View>
          {effectiveWorkspace && salonBusinessPhone ? (
            <View style={styles.salonContactRow}>
              <View style={styles.salonContactInfo}>
                <Text style={styles.salonContactLabel}>{tf('frontend_business_phone')}</Text>
                <Text style={styles.salonContactValue}>{salonBusinessPhone}</Text>
              </View>
              <View style={styles.salonContactActions}>
                <TouchableOpacity
                  style={styles.salonWhatsappButton}
                  onPress={scriviWhatsAppSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                  <Text style={styles.salonWhatsappButtonText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.salonCallButton}
                  onPress={chiamaSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="call-outline" size={16} color="#0f766e" />
                  <Text style={styles.salonCallButtonText}>Chiama</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {salonLoadError ? <Text style={styles.salonAccessError}>{salonLoadError}</Text> : null}
        </View>
      ) : null}

      {isRegistered && !isBookingStarted && clienteInibito ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>Accesso online</Text>
          <Text style={styles.sectionTitle}>Prenotazioni sospese</Text>
          <View style={styles.blockedSectionCard}>
            <View style={styles.blockedSectionIconWrap}>
              <Ionicons name="lock-closed-outline" size={20} color="#991b1b" />
            </View>
            <Text style={styles.blockedSectionTitle}>Nuove richieste disabilitate</Text>
            <Text style={styles.blockedSectionText}>
              Questo profilo cliente è inibito. Gli slot online restano nascosti e non puoi
              inviare nuove prenotazioni finché il salone non ti sblocca.
            </Text>
            {salonBusinessPhone ? (
              <View style={styles.blockedSectionActions}>
                <TouchableOpacity
                  style={styles.inlineWhatsappButton}
                  onPress={scriviWhatsAppSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                  <Text style={styles.inlineWhatsappButtonText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inlineCallButton}
                  onPress={chiamaSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="call-outline" size={16} color="#0f766e" />
                  <Text style={styles.inlineCallButtonText}>Chiama</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {isRegistered && isBookingStarted && !clienteInibito ? (
        <>
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>1</Text>
              <Text style={styles.stepText}>{tf('frontend_step_service')}</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>2</Text>
              <Text style={styles.stepText}>{tf('frontend_step_day')}</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>3</Text>
              <Text style={styles.stepText}>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={isWeb ? styles.servicesScrollViewWeb : undefined}
              contentContainerStyle={styles.servicesScrollContent}
              onScrollBeginDrag={isWeb ? () => lockSelectionTap(220) : undefined}
              onMomentumScrollBegin={isWeb ? () => lockSelectionTap(220) : undefined}
            >
              {sortedFrontendServizi.map((item) => {
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
                    key={item.id}
                    style={[
                      styles.serviceCard,
                      isWeb && styles.serviceCardWeb,
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
                        { color: accent.text },
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
                        { color: accent.text },
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
                        { color: accent.text },
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
              })}
            </ScrollView>
          </View>

          <View style={[styles.sectionCard, !canChooseDay && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>Step 2</Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_day')}</Text>
            {!canChooseDay ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.calendarToggleButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="calendar-outline" size={16} color="#111111" />
              <Text style={styles.calendarToggleButtonText}>{formatDateLong(data)}</Text>
            </TouchableOpacity>
            <View
              style={[styles.dayPickerViewport, isWeb && styles.dayPickerViewportWeb]}
              onLayout={(event) => {
                const nextWidth = event.nativeEvent.layout.width;
                if (!nextWidth || Math.abs(nextWidth - dayPickerViewportWidth) < 1) return;
                setDayPickerViewportWidth(nextWidth);
                requestAnimationFrame(() => {
                  centerDayInPicker(data, false);
                });
              }}
            >
              <View
                pointerEvents="none"
                style={[styles.dayPickerCenterHalo, isWeb && styles.dayPickerCenterHaloWeb]}
              />
              <Animated.ScrollView
                ref={dayPickerRef as never}
                horizontal
                bounces={false}
                alwaysBounceHorizontal={false}
                decelerationRate={Platform.OS === 'android' ? 0.92 : 'fast'}
                snapToInterval={activeDayCardStride}
                snapToOffsets={dayPickerSnapOffsets}
                snapToAlignment="start"
                disableIntervalMomentum
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                overScrollMode="never"
                style={isWeb ? styles.dayPickerScrollWeb : undefined}
                contentContainerStyle={[
                  styles.dayPickerRow,
                  isWeb && styles.dayPickerRowWeb,
                  { paddingHorizontal: dayPickerSideInset },
                ]}
                onContentSizeChange={() => {
                  centerDayInPicker(data || today, false);
                }}
                onScroll={(event) => {
                  lockSelectionTap(220);
                  if (!isWeb) return;
                  const offsetX = event.nativeEvent.contentOffset.x;
                  if (dayPickerScrollSettleTimeoutRef.current) {
                    clearTimeout(dayPickerScrollSettleTimeoutRef.current);
                  }
                  dayPickerScrollSettleTimeoutRef.current = setTimeout(() => {
                    settleDayPickerAtOffset(offsetX);
                    dayPickerScrollSettleTimeoutRef.current = null;
                  }, 90);
                }}
                onMomentumScrollEnd={(event) => {
                  lockSelectionTap(160);
                  settleDayPickerAtOffset(event.nativeEvent.contentOffset.x);
                }}
                onScrollEndDrag={
                  isWeb
                    ? (event) => {
                        lockSelectionTap(160);
                        settleDayPickerAtOffset(event.nativeEvent.contentOffset.x);
                      }
                    : undefined
                }
                removeClippedSubviews={false}
              >
                {giorniDisponibili.map((day) => (
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
                ))}
              </Animated.ScrollView>
            </View>
            <Text style={styles.sectionHint}>{formatDateLong(data)}</Text>
          </View>

          {serviceUsesOperatorScheduling ? (
            <View style={[styles.sectionCard, !canChooseOperator && styles.sectionCardLocked]}>
              <Text style={styles.sectionEyebrow}>Step 3</Text>
              <Text style={styles.sectionTitle}>Scegli operatore</Text>
              {!canChooseOperator ? (
                <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
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
            {canChooseTime && servizio.trim() && !canAnySlotBeBooked ? (
              <Text style={styles.lockedSectionText}>
                Nessuno slot libero per questo servizio nel giorno selezionato.
              </Text>
            ) : null}
            {shouldShowGuidedRecommendations ? (
              <View style={styles.guidedTimePanel}>
                <Text style={styles.guidedTimeTitle}>Orari consigliati</Text>
                <Text style={styles.guidedTimeHint}>
                  Ti mostriamo prima gli slot migliori per questo servizio.
                </Text>
                <View style={styles.guidedTimeGrid}>
                  {guidedRecommendedTimeSlots.map((item) => {
                    const selected = selectedTimeRange.has(item);
                    const lunchOverlapCandidate =
                      !!servizio &&
                      doesServiceOverlapLunchBreak({
                        settings: effectiveAvailabilitySettings,
                        startTime: item,
                        durationMinutes: selectedServiceDuration,
                      });

                    return (
                      <View key={`guided-${item}`} style={styles.timeSlotCard}>
                        <TouchableOpacity
                          style={[
                            styles.timeChip,
                            styles.guidedTimeChip,
                            selected && styles.timeChipActive,
                          ]}
                          onPress={() => {
                            if (shouldIgnoreSelectionTap()) return;
                            if (lunchOverlapCandidate) {
                              Alert.alert(
                                tf('frontend_lunch_overlap_title'),
                                tf('frontend_lunch_overlap_body')
                              );
                              return;
                            }
                            setOra(item);
                          }}
                          activeOpacity={0.9}
                        >
                          <View style={styles.guidedTimeBadge}>
                            <Text style={styles.guidedTimeBadgeText}>Consigliato</Text>
                          </View>
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="clip"
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                            style={[styles.timeChipText, selected && styles.timeChipTextActive]}
                          >
                            {item}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                {guidedSlotsVisibility === 'recommended_first' ? (
                  <TouchableOpacity
                    style={styles.guidedTimeToggleButton}
                    onPress={() => setShowAllGuidedSlots((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.guidedTimeToggleButtonText}>
                      {showAllGuidedSlots ? 'Nascondi altri orari' : 'Mostra tutti gli orari'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.guidedTimeSubHint}>
                    Il salone mostra solo gli orari consigliati per questo servizio.
                  </Text>
                )}
              </View>
            ) : null}
            {shouldShowExpandedTimeGrid ? (
            <View style={styles.timeGrid}>
              {visibleFrontendTimeSlots.map((item) => {
                const selected = selectedTimeRange.has(item);
                const disabled = !canChooseTime || !servizio || orariNonDisponibili.has(item);
                const occupied = servizio.trim() !== '' && orariOccupati.has(item);
                const lunchBadge = isTimeBlockedByLunchBreak(effectiveAvailabilitySettings, item);
                const lunchOverlapCandidate =
                  !!servizio &&
                  doesServiceOverlapLunchBreak({
                    settings: effectiveAvailabilitySettings,
                    startTime: item,
                    durationMinutes: selectedServiceDuration,
                  });

                return (
                  <View key={item} style={styles.timeSlotCard}>
                  <TouchableOpacity
                    style={[
                      styles.timeChip,
                      occupied && !selected && styles.timeChipOccupied,
                      selected && styles.timeChipActive,
                      disabled && !selected && styles.timeChipDisabled,
                    ]}
                    onPress={() => {
                      if (shouldIgnoreSelectionTap()) return;
                      if (lunchOverlapCandidate) {
                        Alert.alert(
                          tf('frontend_lunch_overlap_title'),
                          tf('frontend_lunch_overlap_body')
                        );
                        return;
                      }
                      if (disabled) return;
                      setOra(item);
                    }}
                    activeOpacity={disabled ? 1 : 0.9}
                    disabled={!canChooseTime || !servizio}
                  >
                    {selected ? (
                      <View style={styles.timeChipSelectedBadge}>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="clip"
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                          style={styles.timeChipSelectedBadgeText}
                        >
                          Selezionato
                        </Text>
                      </View>
                    ) : null}
                    {lunchBadge ? (
                      <View style={styles.slotMiniBadge}>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="clip"
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                          style={styles.slotMiniBadgeText}
                        >
                          Pausa
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={[
                        styles.timeChipText,
                        occupied && !selected && styles.timeChipTextOccupied,
                        selected && styles.timeChipTextActive,
                        disabled && !selected && styles.timeChipTextDisabled,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </View>
            ) : null}
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
                    waitlistableOccupiedSlots.every((slotTime) =>
                      waitlistKeys.has(buildWaitlistKey(slotTime))
                    ) && styles.waitlistButtonActive,
                  ]}
                  onPress={() => {
                    if (waitlistSubmittingKeys.has(`day:${data}|${servizio.trim().toLowerCase()}`)) {
                      return;
                    }
                    void handleJoinWaitlistDay();
                  }}
                  activeOpacity={
                    waitlistSubmittingKeys.has(`day:${data}|${servizio.trim().toLowerCase()}`) ? 1 : 0.9
                  }
                  disabled={waitlistSubmittingKeys.has(`day:${data}|${servizio.trim().toLowerCase()}`)}
                >
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.58}
                    style={[
                      styles.waitlistButtonText,
                      waitlistableOccupiedSlots.every((slotTime) =>
                        waitlistKeys.has(buildWaitlistKey(slotTime))
                      ) && styles.waitlistButtonTextActive,
                    ]}
                  >
                    {waitlistSubmittingKeys.has(`day:${data}|${servizio.trim().toLowerCase()}`)
                      ? 'Salvataggio...'
                      : waitlistableOccupiedSlots.every((slotTime) =>
                            waitlistKeys.has(buildWaitlistKey(slotTime))
                          )
                        ? 'Avviso giornata già attivo'
                        : 'Avvisami se si libera qualsiasi orario in giornata'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.waitlistBlockList}>
                  {waitlistSlotBlocks.map((block) => {
                    const blockActionKey = `block:${block.id}`;
                    const blockAlreadyActive = block.slotTimes.every((slotTime) =>
                      waitlistKeys.has(buildWaitlistKey(slotTime))
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
                            if (blockAlreadyActive || waitlistSubmittingKeys.has(blockActionKey)) {
                              return;
                            }
                            void handleJoinWaitlistBlock(block);
                          }}
                          activeOpacity={
                            blockAlreadyActive || waitlistSubmittingKeys.has(blockActionKey) ? 1 : 0.9
                          }
                          disabled={blockAlreadyActive || waitlistSubmittingKeys.has(blockActionKey)}
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
                                ? 'Avviso già attivo'
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
            {clienteInibito ? (
              <Text style={styles.sectionHint}>{tf('frontend_no_online_slots')}</Text>
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
            <TouchableOpacity
              style={[styles.primaryButton, !canSendRequest && styles.primaryButtonDisabled]}
              onPress={inviaRichiesta}
              activeOpacity={0.9}
              disabled={!canSendRequest}
            >
              <Text style={styles.primaryButtonText}>
                {bookingRequestSubmitting ? 'Invio in corso...' : tf('frontend_send_booking')}
              </Text>
            </TouchableOpacity>
          </View>
          </>
        ) : null}
      </ScrollView>
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
  heroTopRow: {
    position: 'absolute',
    top: 16,
    right: 18,
    left: 18,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
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
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    gap: 10,
    paddingRight: 0,
  },
  heroTopActionsCompact: {
    justifyContent: 'flex-end',
    alignSelf: 'auto',
    flexWrap: 'nowrap',
    gap: 6,
    paddingRight: 4,
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
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  actionIconBadgeCompact: {
    width: 46,
    height: 46,
    borderRadius: 16,
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
    marginTop: -26,
    marginBottom: -12,
  },
  frontendTitleBand: {
    width: '100%',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 48,
    marginBottom: -2,
  },
  frontendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0 : -0.5,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  connectedSalonBadge: {
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#c7dbff',
    shadowColor: '#60a5fa',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  connectedSalonBadgeEyebrow: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  connectedSalonBadgeName: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#1d4ed8',
    textAlign: 'center',
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
    maxWidth: 1100,
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
    maxWidth: 1040,
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
    maxWidth: 1040,
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
    fontFamily: appFonts.displayNeon,
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
    fontFamily: appFonts.displayNeon,
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
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  requestsToggleTextWrap: {
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
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
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  requestsToggleSubtitle: {
    color: '#111111',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    maxWidth: 250,
    textAlign: 'center',
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
  },
  sectionCardLocked: {
    opacity: 0.62,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
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
    marginTop: -2,
    marginBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fbff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#dbeafe',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  inlineNotificationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  inlineNotificationsTitle: {
    fontSize: 14,
    fontWeight: '900',
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
    color: '#111111',
    letterSpacing: 0.8,
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
    marginTop: 4,
    marginBottom: 18,
    width: '100%',
  },
  requestSectionsContainer: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: IS_ANDROID ? 'visible' : 'hidden',
  },
  requestOverviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  requestOverviewCard: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
  },
  requestSectionHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6f83',
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  requestSectionEmpty: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
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
  },
  servicesScrollViewWeb: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
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
    paddingTop: 4,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    marginBottom: 6,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
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
    overflow: 'hidden',
  },
  serviceCardWeb: {
    width: 172,
    minHeight: 224,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 14,
    marginRight: 12,
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
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  serviceSalonInlineBadgeWeb: {
    minWidth: 76,
    height: 26,
    paddingHorizontal: 12,
  },
  serviceSalonInlineBadgeText: {
    color: '#ffffff',
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
  dayPickerViewport: {
    marginTop: 10,
    marginHorizontal: -14,
    paddingTop: 28,
    paddingBottom: 14,
    overflow: 'visible',
  },
  dayPickerViewportWeb: {
    marginHorizontal: -10,
    paddingTop: 22,
    paddingBottom: 18,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  dayPickerScrollWeb: {
    width: '100%',
    maxWidth: '100%',
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
    top: 2,
    bottom: 8,
    marginLeft: -46,
    width: 92,
    borderRadius: 28,
    backgroundColor: 'rgba(30, 41, 59, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(30, 41, 59, 0.12)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
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
  },
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
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  timeSlotCard: {
    width: IS_ANDROID ? '23.5%' : '22%',
    marginHorizontal: IS_ANDROID ? '0.75%' : '1.5%',
    marginBottom: 10,
  },
  timeChip: {
    backgroundColor: '#E9F9EF',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  timeChipOccupied: {
    backgroundColor: '#FDE2E7',
    borderColor: 'transparent',
  },
  timeChipActive: {
    backgroundColor: '#E8F1FF',
    borderWidth: 1.5,
    borderColor: '#1D4ED8',
  },
  timeChipDisabled: {
    backgroundColor: '#FDE2E7',
    borderColor: 'transparent',
  },
  timeChipSelectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#1E3A8A',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '72%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipSelectedBadgeText: {
    fontSize: 7.2,
    lineHeight: 8,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  guidedTimePanel: {
    marginTop: 4,
    marginBottom: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#DCE7F8',
  },
  guidedTimeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  guidedTimeHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  guidedTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 12,
  },
  guidedTimeChip: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#BFD2FF',
  },
  guidedTimeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#1D4ED8',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '74%',
  },
  guidedTimeBadgeText: {
    fontSize: 7.2,
    lineHeight: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  guidedTimeToggleButton: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  guidedTimeToggleButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  guidedTimeSubHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
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
  slotMiniBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 8 : 5,
    paddingVertical: 2,
  },
  slotMiniBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.1,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  timeChipTextOccupied: {
    color: '#B42318',
  },
  timeChipTextActive: {
    color: '#1D4ED8',
  },
  timeChipTextDisabled: {
    color: '#B42318',
  },
  operatorSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
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
  operatorSelectionCardActive: {
    backgroundColor: '#EAF2FF',
    borderColor: 'transparent',
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
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
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
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#d9e4f0',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  requestStatusCardWeb: {
    alignItems: 'center',
  },
  requestStatusHeroBlockWeb: {
    minHeight: 192,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
    marginBottom: 2,
  },
  requestStatusTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  requestStatusTopRowWeb: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 0,
    marginBottom: 28,
  },
  requestStatusHeaderCopy: {
    flex: 1,
    alignItems: 'flex-start',
  },
  requestStatusHeaderCopyWeb: {
    flex: 0,
    alignItems: 'center',
    marginBottom: 14,
    maxWidth: 760,
  },
  requestStatusTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 5,
    textAlign: 'left',
  },
  requestStatusTitleWeb: {
    textAlign: 'center',
  },
  requestStatusMeta: {
    fontSize: 15,
    color: '#5f6f83',
    fontWeight: '800',
    textAlign: 'left',
  },
  requestStatusMetaWeb: {
    textAlign: 'center',
  },
  requestStatusOperatorLine: {
    fontSize: 13,
    color: '#315ea8',
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'left',
  },
  requestStatusOperatorLineWeb: {
    textAlign: 'center',
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
    gap: 8,
    marginBottom: 12,
  },
  requestMetaPillsRowWeb: {
    flexWrap: 'nowrap',
    gap: 0,
    width: 'auto',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  requestCategoryChip: {
    alignSelf: 'center',
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
    marginRight: 10,
    minWidth: 86,
    justifyContent: 'center',
  },
  requestCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
  },
  requestOperatorChip: {
    alignSelf: 'center',
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
  },
  requestOperatorChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
  },
  requestStatusBody: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 14,
    textAlign: 'left',
  },
  requestStatusBodyWeb: {
    textAlign: 'center',
    maxWidth: 760,
  },
  requestAddressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  requestAddressCardWeb: {
    width: '100%',
    maxWidth: 900,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  requestStatusAddress: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#5f6f83',
    fontWeight: '700',
    textAlign: 'left',
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
    paddingVertical: 9,
    minWidth: 108,
    alignItems: 'center',
  },
  requestStateBadgeWeb: {
    minWidth: 124,
    paddingHorizontal: 18,
    paddingVertical: 8,
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
  },
  cancelBookingButton: {
    backgroundColor: '#fff1f2',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde2e8',
  },
  requestActionButtonWeb: {
    width: '100%',
    maxWidth: 760,
    minWidth: 320,
    alignSelf: 'center',
  },
  cancelBookingButtonText: {
    color: '#be123c',
    fontSize: 16,
    fontWeight: '900',
  },
  calendarButton: {
    backgroundColor: '#EAF2FF',
    borderRadius: 18,
    paddingVertical: 16,
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
    flex: 0,
    minWidth: 280,
    maxWidth: 340,
    marginRight: 0,
    width: 280,
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
    minHeight: 120,
    paddingBottom: 18,
    marginBottom: 16,
  },
  confirmationIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#dcecff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
    marginBottom: 10,
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
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
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
