import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  InteractionManager,
  type InteractionManagerStatic,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Gesture, GestureDetector, NativeViewGestureHandler } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { NativeTimePickerModal } from '../../components/ui/native-time-picker-modal';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { useTabSwipeLock } from '../../src/context/TabSwipeLockContext';
import {
  assignFallbackOperatorsToAppointments,
  buildSalonCapacityOperatorId,
  buildDisplayTimeSlots,
  buildTimeSlots,
  doesServiceFitWithinDaySchedule,
  doesServiceOverlapLunchBreak,
  doesServiceUseOperators,
  doOperatorsMatch,
  findConflictingAppointment as findConflictingAppointmentShared,
  getDateAvailabilityInfo,
  getEligibleOperatorsForService,
  getSlotIntervalForDate,
  isOperatorAvailableOnDate,
  isSalonCapacityOperatorId,
  isSlotBlockedByOverride,
  isTimeBlockedByLunchBreak,
  isTimeWithinDaySchedule,
  normalizeOperatorNameKey,
  normalizeRoleName,
} from '../../src/lib/booking';
import { useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { haptic } from '../../src/lib/haptics';
import { AppLanguage, tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { getServiceAccentByMeta, resolveServiceAccent } from '../../src/lib/service-accents';
import { wheelPickerHaptics } from '../../src/lib/wheel-picker-haptics';
import {
  buildInvalidFieldsMessage,
  isValidEmail,
  isValidPhone10,
  limitPhoneToTenDigits,
} from '../../src/lib/validators';

const GIORNI_SETTIMANA_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;
const normalizeCustomerNameInput = (value: string) => value.toLocaleUpperCase('it-IT');
const DAY_CARD_WIDTH = IS_ANDROID ? 66 : 56;
const DAY_CARD_GAP = IS_ANDROID ? -16 : -8;
const DAY_CARD_FULL_WIDTH = DAY_CARD_WIDTH + DAY_CARD_GAP;
const WEEK_PLANNER_ROW_HEIGHT = 40;
const WEEK_PLANNER_DAY_WIDTH = 44;
const WEEK_PLANNER_ROW_GAP = 1;
const WEEK_PLANNER_COLUMN_GAP = 0;
const WEEK_PLANNER_MIN_OPERATOR_LANE_WIDTH = 52;
const SALON_LANE_ROLE_PRIORITY = [
  'barber',
  'hair stylist',
  'colorista',
  'nails',
  'estetica',
  'skincare',
  'epilazione',
  'brows',
  'lashes',
  'make up',
  'massaggi',
  'spa',
  'tattoo',
  'piercing',
  'pmu',
  'tricologia',
  'wellness',
];

const extractSalonLaneCapacityKey = (laneKey: string) => {
  if (!laneKey.startsWith('salon-lane:')) return '';
  return laneKey.replace(/^salon-lane:/, '').replace(/:\d+$/, '');
};
const WEEK_PLANNER_MIN_OPERATOR_LANE_GAP = 2;
const WEEK_PLANNER_DAY_HEADER_TOTAL_HEIGHT = 39;
const WEEK_PLANNER_EDGE_BLEED_LEFT = 8;
const WEEK_PLANNER_EDGE_BLEED_RIGHT = 18;
const WEEK_PLANNER_RIGHT_CLIP_GUARD = 8;
const WEEK_PLANNER_TIME_COL_TOTAL = 36;
const WEEK_DRAG_JITTER_THRESHOLD = 1;

const PALETTE = {
  BACKGROUND_APP: '#F3F6FA',
  BACKGROUND_SECTION: '#EDF2F7',
  CARD: '#FFFFFF',
  CARD_SECONDARY: '#F8FAFC',
  TEXT_PRIMARY: '#0F172A',
  TEXT_SECONDARY: '#64748B',
  TEXT_MUTED: '#94A3B8',
  BORDER_LIGHT: 'rgba(15, 23, 42, 0.08)',
  BORDER_SOFT: 'rgba(15, 23, 42, 0.04)',
  PRIMARY: '#1E293B',
  PRIMARY_LIGHT: '#334155',
  PRIMARY_SOFT: '#E2E8F0',
  SUCCESS: '#22C55E',
  SUCCESS_BG: '#ECFDF5',
  WARNING: '#F59E0B',
  WARNING_BG: '#FFFBEB',
  DANGER: '#EF4444',
  DANGER_BG: '#FEF2F2',
  ACCENT_BLUE: '#3B82F6',
  ACCENT_PURPLE: '#8B5CF6',
  ACCENT_TEAL: '#14B8A6',
  ACCENT_ORANGE: '#F97316',
  ACCENT_PINK: '#EC4899',
  ACCENT_INDIGO: '#6366F1',
  ACCENT_BLUE_BG: '#EFF6FF',
  ACCENT_PURPLE_BG: '#F5F3FF',
  ACCENT_TEAL_BG: '#F0FDFA',
  ACCENT_ORANGE_BG: '#FFF7ED',
  ACCENT_PINK_BG: '#FDF2F8',
  ACCENT_INDIGO_BG: '#EEF2FF',
} as const;

const buildAgendaOperatorIdentityKey = ({
  operatorId,
  operatorName,
}: {
  operatorId?: string | null;
  operatorName?: string | null;
}) => {
  const normalizedOperatorId = operatorId?.trim() ?? '';
  if (normalizedOperatorId && !isSalonCapacityOperatorId(normalizedOperatorId)) {
    return `id:${normalizedOperatorId}`;
  }

  const normalizedOperatorName = normalizeOperatorNameKey(operatorName);
  if (normalizedOperatorName) {
    return `name:${normalizedOperatorName}`;
  }

  return '';
};

const AGENDA_VIEW_TONES = {
  today: {
    bg: PALETTE.ACCENT_BLUE_BG,
    accent: PALETTE.ACCENT_BLUE,
  },
  upcoming: {
    bg: PALETTE.ACCENT_TEAL_BG,
    accent: PALETTE.ACCENT_TEAL,
  },
  recent: {
    bg: PALETTE.ACCENT_ORANGE_BG,
    accent: PALETTE.ACCENT_ORANGE,
  },
  week: {
    bg: PALETTE.ACCENT_INDIGO_BG,
    accent: PALETTE.ACCENT_INDIGO,
  },
} as const;

const SLOT_INTERVAL_OPTIONS = Array.from({ length: 20 }, (_, index) => (index + 1) * 15);
const WEEK_VISIBLE_DAYS_OPTIONS = Array.from({ length: 7 }, (_, index) => index + 1);
const PRESET_ROLE_OPTIONS = [
  'Barber',
  'Hair Stylist',
  'Colorista',
  'Nails',
  'Estetica',
  'Skincare',
  'Epilazione',
  'Brows',
  'Lashes',
  'Make-up',
  'Massaggi',
  'Spa',
  'Tattoo',
  'Piercing',
  'PMU',
  'Tricologia',
  'Wellness',
];

const formatPickerButtonLabel = (value: string) => {
  const [year, month, day] = value.split('-');
  const monthLabels = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${day} ${monthLabels[(Number(month) || 1) - 1] ?? month} ${year}`;
};

const hasConfiguredAgendaOperatorsForRole = (
  roleName: string,
  operators: Array<{ mestiere?: string | null }>
) => {
  const normalizedRole = normalizeRoleName(roleName);
  if (!normalizedRole) return false;

  return operators.some((item) => normalizeRoleName(item.mestiere ?? '') === normalizedRole);
};

const shouldWarnAgendaAboutMissingOperatorsForRole = ({
  roleName,
  services,
  operators,
}: {
  roleName: string;
  services: Array<{ mestiereRichiesto?: string | null }>;
  operators: Array<{ mestiere?: string | null }>;
}) => {
  const normalizedRole = normalizeRoleName(roleName);
  if (!normalizedRole) return false;
  if (hasConfiguredAgendaOperatorsForRole(roleName, operators)) return false;

  const distinctRoles = new Set(
    [...services.map((item) => item.mestiereRichiesto ?? ''), roleName]
      .map((item) => normalizeRoleName(item))
      .filter(Boolean)
  );

  return distinctRoles.size > 1;
};

type AppuntamentoItem = {
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
  sourceBadge?: 'salon' | 'operator';
};

type GiornoPicker = {
  value: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
};

type CalendarDay = {
  key: string;
  value: string | null;
  label: string;
  isCurrentMonth: boolean;
  isDisabled: boolean;
};

type AgendaDaySection = {
  date: string;
  items: AppuntamentoItem[];
};

type AgendaView = 'today' | 'upcoming' | 'recent' | 'week';

type QuickSlotDraft = {
  date: string;
  time: string;
  preferredOperatorId?: string | null;
};

type ServicePickerTarget = 'agenda' | 'quick';

type WeekDragState = {
  appointmentId: string;
  sourceDate: string;
  sourceTime: string;
  targetDate: string | null;
  targetTime: string | null;
  invalidTarget: boolean;
};

type WeekSwapPreview = {
  sourceAppointment: AppuntamentoItem;
  targetAppointment: AppuntamentoItem | null;
  targetDate: string;
  targetTime: string;
};

const isSyntheticWeekAppointmentId = (value?: string | null) =>
  !!value && (value.startsWith('pending-') || value.startsWith('accepted-'));

type WeekPlannerCellState = 'available' | 'occupied' | 'blocked' | 'outside';

type WeekDragOverlayState = {
  appointmentId: string;
  width: number;
  height: number;
  usesDenseOperatorDragUi?: boolean;
};

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToIso = (value: string, days: number) => {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const getStartOfWeekIso = (value: string) => {
  const date = parseIsoDate(value);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return toIsoDate(date);
};

const formatDateCompact = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

function AnimatedChevron({
  expanded,
  color,
  size = 18,
  collapsedDeg = 0,
  expandedDeg = 180,
}: {
  expanded: boolean;
  color: string;
  size?: number;
  collapsedDeg?: number;
  expandedDeg?: number;
}) {
  const rotation = useSharedValue(expanded ? expandedDeg : collapsedDeg);

  useEffect(() => {
    rotation.value = withTiming(expanded ? expandedDeg : collapsedDeg, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [collapsedDeg, expanded, expandedDeg, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Reanimated.View style={animatedStyle}>
      <Ionicons name="chevron-down" size={size} color={color} />
    </Reanimated.View>
  );
}

const formatDateLong = (value: string) => {
  const date = parseIsoDate(value);
  return `${GIORNI_SETTIMANA_IT[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    MESI_IT[date.getMonth()]
  } ${date.getFullYear()}`;
};

const buildFutureDates = (daysAhead: number): GiornoPicker[] => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: daysAhead }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;

    return {
      value,
      weekdayShort: GIORNI_SETTIMANA_IT[current.getDay()],
      dayNumber: day,
      monthShort: MESI_IT[current.getMonth()],
      fullLabel: formatDateLong(value),
    };
  });
};

const buildCenteredDates = (daysBefore: number, daysAfter: number): GiornoPicker[] => {
  const pivot = new Date();
  pivot.setHours(0, 0, 0, 0);

  return Array.from({ length: daysBefore + daysAfter + 1 }, (_, index) => {
    const current = new Date(pivot);
    current.setDate(pivot.getDate() + index - daysBefore);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;

    return {
      value,
      weekdayShort: GIORNI_SETTIMANA_IT[current.getDay()],
      dayNumber: day,
      monthShort: MESI_IT[current.getMonth()],
      fullLabel: formatDateLong(value),
    };
  });
};

type AgendaDayPickerProps = {
  giorniDisponibili: GiornoPicker[];
  selectedDate: string;
  availabilitySettings: any;
  pendingRequestsCountByDate: Record<string, number>;
  appLanguage: AppLanguage;
  onSelectDateFinal: (nextDate: string) => void;
  onSelectDateDeep: (nextDate: string) => void;
  onDayLongPress: (dateValue: string) => void;
  onCloseActiveSuggestions: () => void;
};

const AgendaDayPicker = React.memo(function AgendaDayPicker({
  giorniDisponibili,
  selectedDate,
  availabilitySettings,
  pendingRequestsCountByDate,
  appLanguage,
  onSelectDateFinal,
  onSelectDateDeep,
  onDayLongPress,
  onCloseActiveSuggestions,
}: AgendaDayPickerProps) {
  const { setDisableParentSwipe } = useTabSwipeLock();
  const shouldCaptureDayPickerSwipe = true;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [pickerWidth, setPickerWidth] = useState(0);
  const listRef = useRef<FlatList<GiornoPicker> | null>(null);
  const lastTapRef = useRef<{ date: string; timestamp: number } | null>(null);
  const lastHapticDateRef = useRef<string | null>(null);
  const lastHapticIndexRef = useRef<number | null>(null);
  const liveIndexRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const isMomentumRef = useRef(false);
  const latestOffsetXRef = useRef(0);
  const suppressSettleRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentumTargetIndexRef = useRef<number | null>(null);
  const lastPreviewSelectionRef = useRef<string>(selectedDate);
  const scrollX = useRef(new Animated.Value(0)).current;
  const previewIndexRef = useRef<number | null>(null);

  const sideInset = useMemo(
    () => Math.max(0, (pickerWidth - DAY_CARD_WIDTH) / 2 - (IS_ANDROID ? 8 : 0)),
    [pickerWidth]
  );
  const snapOffsets = useMemo(
    () => giorniDisponibili.map((_, index) => index * DAY_CARD_FULL_WIDTH),
    [giorniDisponibili]
  );

  const getNearestIndex = useCallback(
    (offsetX: number) => {
      if (snapOffsets.length > 0) {
        let closestIndex = 0;
        let closestDistance = Math.abs(snapOffsets[0] - offsetX);

        for (let index = 1; index < snapOffsets.length; index += 1) {
          const distance = Math.abs(snapOffsets[index] - offsetX);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        }

        return closestIndex;
      }

      return Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(offsetX / DAY_CARD_FULL_WIDTH))
      );
    },
    [giorniDisponibili.length, snapOffsets]
  );

  const getPreviewIndex = useCallback(
    (offsetX: number) => {
      if (snapOffsets.length > 0) {
        let closestIndex = 0;
        let closestDistance = Math.abs(snapOffsets[0] - offsetX);

        for (let index = 1; index < snapOffsets.length; index += 1) {
          const distance = Math.abs(snapOffsets[index] - offsetX);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        }

        return closestIndex;
      }

      return Math.max(
        0,
        Math.min(
          giorniDisponibili.length - 1,
          Math.round(offsetX / DAY_CARD_FULL_WIDTH)
        )
      );
    },
    [giorniDisponibili.length, snapOffsets]
  );

  const centerDayInPicker = useCallback(
    (dateValue: string, animated = false) => {
      const selectedIndex = giorniDisponibili.findIndex((item) => item.value === dateValue);
      if (selectedIndex < 0) return;

      const targetOffset = Math.max(0, selectedIndex * DAY_CARD_FULL_WIDTH);
      suppressSettleRef.current = true;
      latestOffsetXRef.current = targetOffset;
      listRef.current?.scrollToOffset({
        offset: targetOffset,
        animated,
      });
    },
    [giorniDisponibili]
  );

  const updatePreviewIndex = useCallback((nextIndex: number) => {
    if (previewIndexRef.current === nextIndex && liveIndexRef.current === nextIndex) {
      return;
    }

    previewIndexRef.current = nextIndex;
    liveIndexRef.current = nextIndex;
    setPreviewIndex((current) => (current === nextIndex ? current : nextIndex));
  }, []);

  const wrapWithAndroidDayLongPress = useCallback(
    (dateValue: string, child: React.ReactElement) => {
      if (!IS_ANDROID) return child;

      const gesture = Gesture.LongPress()
        .enabled(true)
        .minDuration(220)
        .maxDistance(24)
        .onStart(() => {
          runOnJS(onDayLongPress)(dateValue);
        });

      return <GestureDetector gesture={gesture}>{child}</GestureDetector>;
    },
    [onDayLongPress]
  );

  useEffect(() => {
    lastPreviewSelectionRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    const selectedIndex = giorniDisponibili.findIndex((item) => item.value === selectedDate);
    if (selectedIndex < 0 || pickerWidth <= 0) return;

    const targetOffset = Math.max(0, selectedIndex * DAY_CARD_FULL_WIDTH);
    const previousOffset = latestOffsetXRef.current;

    if (isDraggingRef.current || isMomentumRef.current) {
      return;
    }

    liveIndexRef.current = selectedIndex;
    lastHapticIndexRef.current = selectedIndex;
    lastHapticDateRef.current = selectedDate;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    latestOffsetXRef.current = targetOffset;
    previewIndexRef.current = selectedIndex;
    setPreviewIndex((current) => (current === selectedIndex ? current : selectedIndex));

    if (Math.abs(targetOffset - previousOffset) < 1) {
      return;
    }

    suppressSettleRef.current = true;
    listRef.current?.scrollToOffset({
      offset: targetOffset,
      animated: false,
    });
  }, [giorniDisponibili, pickerWidth, selectedDate]);

  useEffect(() => {
    return () => {
      setDisableParentSwipe(false);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      wheelPickerHaptics.endSelection().catch(() => null);
    };
  }, [setDisableParentSwipe]);

  const syncScrollHaptic = useCallback(
    (offsetX: number) => {
      if (Platform.OS !== 'ios') return;

      const nextIndex = getNearestIndex(offsetX);
      const previousIndex = lastHapticIndexRef.current ?? nextIndex;
      if (previousIndex === nextIndex) return;

      const direction = nextIndex > previousIndex ? 1 : -1;
      for (
        let current = previousIndex + direction;
        direction > 0 ? current <= nextIndex : current >= nextIndex;
        current += direction
      ) {
        const nextDay = giorniDisponibili[current];
        if (!nextDay) continue;
        lastHapticDateRef.current = nextDay.value;
        lastHapticIndexRef.current = current;
        wheelPickerHaptics.selectionChanged().catch(() => {
          haptic.light().catch(() => null);
        });
      }
    },
    [getNearestIndex, giorniDisponibili]
  );

  const settlePicker = useCallback(
    (offsetX?: number, forcedIndex?: number) => {
      const resolvedOffsetX = offsetX ?? latestOffsetXRef.current;

      if (suppressSettleRef.current) {
        suppressSettleRef.current = false;
        return;
      }

      const nextIndex =
        forcedIndex ??
        (IS_ANDROID && previewIndexRef.current !== null
          ? previewIndexRef.current
          : getNearestIndex(resolvedOffsetX));
      const nextDay = giorniDisponibili[nextIndex];
      if (!nextDay) return;

      isDraggingRef.current = false;
      isMomentumRef.current = false;
      momentumTargetIndexRef.current = null;
      liveIndexRef.current = nextIndex;
      previewIndexRef.current = nextIndex;
      wheelPickerHaptics.endSelection().catch(() => null);

      setPreviewIndex((current) => (current === nextIndex ? current : nextIndex));

      if (nextDay.value !== selectedDate) {
        onSelectDateFinal(nextDay.value);
        return;
      }

      centerDayInPicker(nextDay.value, false);
    },
    [centerDayInPicker, getNearestIndex, giorniDisponibili, onSelectDateFinal, selectedDate]
  );

  const handleDayCardPress = useCallback(
    (nextDate: string) => {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      const isDoubleTap =
        lastTap?.date === nextDate && now - lastTap.timestamp <= 420;

      lastTapRef.current = { date: nextDate, timestamp: now };

      const nextIndex = giorniDisponibili.findIndex((item) => item.value === nextDate);
      if (nextIndex >= 0) {
        liveIndexRef.current = nextIndex;
        previewIndexRef.current = nextIndex;
        setPreviewIndex((current) => (current === nextIndex ? current : nextIndex));
      }

      if (isDoubleTap) {
        lastTapRef.current = null;
        Keyboard.dismiss();
        onSelectDateDeep(nextDate);
        requestAnimationFrame(() => {
          centerDayInPicker(nextDate, true);
        });
        return;
      }

      Keyboard.dismiss();
      onSelectDateFinal(nextDate);
      requestAnimationFrame(() => {
        centerDayInPicker(nextDate, true);
      });
    },
    [centerDayInPicker, giorniDisponibili, onSelectDateDeep, onSelectDateFinal]
  );

  const actualSelectedIndex = giorniDisponibili.findIndex((item) => item.value === selectedDate);
  const selectedIndex = previewIndex ?? Math.max(actualSelectedIndex, 0);
  const selectedDay = giorniDisponibili[selectedIndex] ?? null;
  const selectedAvailability = selectedDay
    ? getDateAvailabilityInfo(availabilitySettings, selectedDay.value)
    : null;
  const selectedDayPendingCount =
    selectedDay ? pendingRequestsCountByDate[selectedDay.value] ?? 0 : 0;
  const selectedDayStatusLabel = selectedAvailability
    ? selectedAvailability.reason === 'holiday'
      ? tApp(appLanguage, 'agenda_holiday')
      : selectedAvailability.reason === 'vacation'
        ? tApp(appLanguage, 'agenda_vacation')
        : selectedAvailability.reason === 'weekly'
          ? tApp(appLanguage, 'agenda_closed')
          : selectedAvailability.reason === 'manual'
            ? tApp(appLanguage, 'agenda_blocked')
            : null
    : null;

  const renderDayItem = useCallback(
    ({ item: day, index }: { item: GiornoPicker; index: number }) => {
          const availability = getDateAvailabilityInfo(availabilitySettings, day.value);
          const disabled = availability.closed;
          const pendingOnDay = pendingRequestsCountByDate[day.value] ?? 0;
          const cardCenter = index * DAY_CARD_FULL_WIDTH;
          const footerLabel = disabled
            ? tApp(appLanguage, 'agenda_unavailable_short')
            : tApp(appLanguage, 'agenda_available_short');
          const statusLabel =
            availability.reason === 'holiday'
              ? tApp(appLanguage, 'agenda_holiday')
              : availability.reason === 'vacation'
                ? tApp(appLanguage, 'agenda_vacation')
                : availability.reason === 'weekly'
                  ? tApp(appLanguage, 'agenda_closed')
                  : availability.reason === 'manual'
                    ? tApp(appLanguage, 'agenda_blocked')
                    : null;
          const inputRange = [
            cardCenter - DAY_CARD_FULL_WIDTH * 3,
            cardCenter - DAY_CARD_FULL_WIDTH * 2,
            cardCenter - DAY_CARD_FULL_WIDTH,
            cardCenter,
            cardCenter + DAY_CARD_FULL_WIDTH,
            cardCenter + DAY_CARD_FULL_WIDTH * 2,
            cardCenter + DAY_CARD_FULL_WIDTH * 3,
          ];
          const animatedScale = scrollX.interpolate({
            inputRange,
            outputRange: IS_ANDROID ? [0.84, 0.91, 0.98, 1.08, 0.98, 0.91, 0.84] : [0.8, 0.87, 0.95, 1.08, 0.95, 0.87, 0.8],
            extrapolate: 'clamp',
          });
          const animatedTranslateY = scrollX.interpolate({
            inputRange,
            outputRange: IS_ANDROID ? [26, 16, 8, 0, 8, 16, 26] : [22, 14, 7, 0, 7, 14, 22],
            extrapolate: 'clamp',
          });
          const animatedTranslateX = scrollX.interpolate({
            inputRange,
            outputRange: IS_ANDROID ? [66, 44, 24, 0, -24, -44, -66] : [0, 0, 0, 0, 0, 0, 0],
            extrapolate: 'clamp',
          });
          const animatedOpacity = scrollX.interpolate({
            inputRange: [
              cardCenter - DAY_CARD_FULL_WIDTH * 0.82,
              cardCenter - DAY_CARD_FULL_WIDTH * 0.34,
              cardCenter,
              cardCenter + DAY_CARD_FULL_WIDTH * 0.34,
              cardCenter + DAY_CARD_FULL_WIDTH * 0.82,
            ],
            outputRange: IS_ANDROID ? [1, 0.72, 0, 0.72, 1] : [1, 0.1, 0, 0.1, 1],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={day.value}
              style={[
                styles.dayCardWrap,
                {
                  zIndex: 8,
                  opacity: animatedOpacity,
                  transform: [
                    { perspective: 1000 },
                    { translateX: animatedTranslateX },
                    { scale: animatedScale },
                    { translateY: animatedTranslateY },
                    { rotateZ: '0deg' },
                  ],
                },
              ]}
            >
              {wrapWithAndroidDayLongPress(day.value, (
              <HapticTouchable
                style={[
                  styles.dayCard,
                  !disabled && styles.dayCardAvailable,
                  disabled && styles.dayCardClosed,
                ]}
                onPress={() => {
                  handleDayCardPress(day.value);
                }}
                onLongPress={() => onDayLongPress(day.value)}
                delayLongPress={IS_ANDROID ? 220 : 320}
                pressRetentionOffset={{ top: 28, left: 28, right: 28, bottom: 28 }}
                hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                longPressHapticType="medium"
                activeOpacity={0.9}
              >
                {pendingOnDay > 0 ? (
                  <View style={styles.dayCardPendingBadge}>
                    <Text style={styles.dayCardPendingBadgeText}>
                      {pendingOnDay > 9 ? '9+' : `+${pendingOnDay}`}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.dayCardHeader}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[
                      styles.dayWeek,
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
                  ]}
                >
                  {day.dayNumber}
                </Text>
                {statusLabel ? (
                  <View
                    style={[
                      styles.dayStatusBadge,
                      styles.dayStatusBadgeClosed,
                      availability.reason === 'holiday' && styles.dayStatusBadgeHoliday,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      style={[
                        styles.dayStatusBadgeText,
                      ]}
                    >
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
                  ]}
                >
                  {day.monthShort}
                </Text>

                <View
                  style={[
                    styles.dayCardFooter,
                    disabled && styles.dayCardFooterClosed,
                    !disabled && styles.dayCardFooterAvailable,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    style={[
                      styles.dayCardFooterText,
                      disabled && styles.dayCardFooterTextClosed,
                      !disabled && styles.dayCardFooterTextAvailable,
                    ]}
                >
                  {footerLabel}
                </Text>
              </View>
              </HapticTouchable>
              ))}
            </Animated.View>
          );
        },
    [
      appLanguage,
      availabilitySettings,
      giorniDisponibili,
      onDayLongPress,
      pendingRequestsCountByDate,
      scrollX,
      handleDayCardPress,
    ]
  );

  const dayPickerList = useMemo(
    () => (
      <Animated.FlatList
        ref={listRef}
        data={giorniDisponibili}
        horizontal
        bounces={false}
        removeClippedSubviews={false}
        disableIntervalMomentum={!IS_ANDROID}
        decelerationRate={IS_ANDROID ? 'fast' : 'fast'}
        snapToInterval={DAY_CARD_FULL_WIDTH}
        snapToOffsets={snapOffsets}
        snapToAlignment="start"
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        nestedScrollEnabled={IS_ANDROID}
        overScrollMode={IS_ANDROID ? 'never' : 'auto'}
        renderToHardwareTextureAndroid={IS_ANDROID}
        contentContainerStyle={styles.dayPickerRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onStartShouldSetResponderCapture={() => false}
        onMoveShouldSetResponderCapture={() => shouldCaptureDayPickerSwipe}
        onResponderTerminationRequest={() => !shouldCaptureDayPickerSwipe}
        onResponderGrant={() => {
          if (shouldCaptureDayPickerSwipe) {
            setDisableParentSwipe(true);
          }
        }}
        onTouchStart={() => {
          if (shouldCaptureDayPickerSwipe) {
            setDisableParentSwipe(true);
          }
        }}
        onTouchMove={() => {
          if (shouldCaptureDayPickerSwipe) {
            setDisableParentSwipe(true);
          }
        }}
        initialNumToRender={9}
        maxToRenderPerBatch={16}
        windowSize={9}
        updateCellsBatchingPeriod={1}
        keyExtractor={(item) => item.value}
        getItemLayout={(_, index) => ({
          length: DAY_CARD_FULL_WIDTH,
          offset: DAY_CARD_FULL_WIDTH * index,
          index,
        })}
        ListHeaderComponent={<View style={[styles.dayPickerEdgeSpacer, { width: sideInset }]} />}
        ListFooterComponent={<View style={[styles.dayPickerEdgeSpacer, { width: sideInset }]} />}
        renderItem={renderDayItem}
        onScrollBeginDrag={(event) => {
          if (shouldCaptureDayPickerSwipe) {
            setDisableParentSwipe(true);
          }
          isDraggingRef.current = true;
          isMomentumRef.current = false;
          suppressSettleRef.current = false;
          const offsetX = event.nativeEvent.contentOffset.x;
          const nextIndex = getPreviewIndex(offsetX);
          const hapticIndex = getNearestIndex(offsetX);
          latestOffsetXRef.current = offsetX;
          momentumTargetIndexRef.current = null;
          updatePreviewIndex(nextIndex);
          lastHapticIndexRef.current = hapticIndex;
          lastHapticDateRef.current = giorniDisponibili[hapticIndex]?.value ?? selectedDate;
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = null;
          }
          wheelPickerHaptics.prepareSelection().catch(() => null);
          onCloseActiveSuggestions();
        }}
        onMomentumScrollBegin={() => {
          isMomentumRef.current = true;
          wheelPickerHaptics.prepareSelection().catch(() => null);
        }}
        onMomentumScrollEnd={(event) => {
          isMomentumRef.current = false;
          if (shouldCaptureDayPickerSwipe) {
            setDisableParentSwipe(false);
          }
          const finalOffsetX = event.nativeEvent.contentOffset.x;
          latestOffsetXRef.current = finalOffsetX;
          const resolvedOffsetX =
            IS_ANDROID && momentumTargetIndexRef.current !== null
              ? snapOffsets[momentumTargetIndexRef.current] ?? finalOffsetX
              : finalOffsetX;
          settlePicker(
            resolvedOffsetX,
            IS_ANDROID
              ? previewIndexRef.current ?? momentumTargetIndexRef.current ?? undefined
              : undefined
          );
        }}
        onScrollEndDrag={(event) => {
          const releasedOffsetX = event.nativeEvent.contentOffset.x;
          const predictedFinalOffsetX =
            event.nativeEvent.targetContentOffset?.x ?? releasedOffsetX;
          latestOffsetXRef.current = releasedOffsetX;
          const predictedIndex = getPreviewIndex(predictedFinalOffsetX);
          const currentHapticIndex = lastHapticIndexRef.current ?? getNearestIndex(releasedOffsetX);
          momentumTargetIndexRef.current = predictedIndex;
          updatePreviewIndex(predictedIndex);
          if (currentHapticIndex !== predictedIndex) {
            const direction = predictedIndex > currentHapticIndex ? 1 : -1;
            for (
              let current = currentHapticIndex + direction;
              direction > 0 ? current <= predictedIndex : current >= predictedIndex;
              current += direction
            ) {
              const nextDay = giorniDisponibili[current];
              if (!nextDay) continue;
              lastHapticDateRef.current = nextDay.value;
              lastHapticIndexRef.current = current;
              wheelPickerHaptics.selectionChanged().catch(() => {
                haptic.light().catch(() => null);
              });
            }
          }
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            if (isMomentumRef.current) return;
            if (shouldCaptureDayPickerSwipe) {
              setDisableParentSwipe(false);
            }
            settlePicker(
              IS_ANDROID ? predictedFinalOffsetX : releasedOffsetX,
              IS_ANDROID ? previewIndexRef.current ?? predictedIndex : undefined
            );
            scrollTimeoutRef.current = null;
          }, 10);
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: true,
            listener: (event: any) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              latestOffsetXRef.current = offsetX;
              const nextIndex =
                !IS_ANDROID && isMomentumRef.current && momentumTargetIndexRef.current !== null
                  ? momentumTargetIndexRef.current
                  : getPreviewIndex(offsetX);
              if (previewIndexRef.current !== nextIndex) {
                updatePreviewIndex(nextIndex);
              }
              if (isDraggingRef.current || isMomentumRef.current) {
                syncScrollHaptic(offsetX);
              }
            },
          }
        )}
      />
    ),
    [
      giorniDisponibili,
      snapOffsets,
      sideInset,
      renderDayItem,
      selectedDate,
      onCloseActiveSuggestions,
      settlePicker,
      getPreviewIndex,
      getNearestIndex,
      onSelectDateFinal,
      scrollX,
      syncScrollHaptic,
      updatePreviewIndex,
    ]
  );

  return (
    <View
      style={styles.dayPickerWrap}
      renderToHardwareTextureAndroid={IS_ANDROID}
      onStartShouldSetResponderCapture={() => false}
      onStartShouldSetResponder={() => false}
      onMoveShouldSetResponderCapture={() => shouldCaptureDayPickerSwipe}
      onMoveShouldSetResponder={() => shouldCaptureDayPickerSwipe}
      onResponderTerminationRequest={() => !shouldCaptureDayPickerSwipe}
      onResponderGrant={() => {
        if (shouldCaptureDayPickerSwipe) {
          setDisableParentSwipe(true);
        }
      }}
      onTouchStart={() => {
        if (shouldCaptureDayPickerSwipe) {
          setDisableParentSwipe(true);
        }
      }}
      onTouchMove={() => {
        if (shouldCaptureDayPickerSwipe) {
          setDisableParentSwipe(true);
        }
      }}
      onTouchEnd={() => {
        if (shouldCaptureDayPickerSwipe && !isDraggingRef.current && !isMomentumRef.current) {
          setDisableParentSwipe(false);
        }
      }}
      onTouchCancel={() => {
        if (shouldCaptureDayPickerSwipe) {
          setDisableParentSwipe(false);
        }
      }}
      onLayout={(event) => setPickerWidth(event.nativeEvent.layout.width)}
    >
      <NativeViewGestureHandler disallowInterruption shouldActivateOnStart>
        <View>{dayPickerList}</View>
      </NativeViewGestureHandler>
      <View pointerEvents="box-none" style={styles.dayPickerCenterOverlay}>
        <View pointerEvents="none" style={styles.dayPickerCenterFrame} />
        <View pointerEvents="none" style={styles.dayPickerCenterHighlight} />
        <View pointerEvents="none" style={styles.dayPickerCenterInnerGlow} />
        {selectedDay ? (
          <HapticTouchable
            style={[
              styles.dayPickerCenterCard,
              styles.dayCard,
              styles.dayCardActive,
              styles.dayCardActiveShadow,
              selectedAvailability?.closed && styles.dayCardClosedSelected,
            ]}
            onPress={() => handleDayCardPress(selectedDay.value)}
            onLongPress={() => onDayLongPress(selectedDay.value)}
            delayLongPress={IS_ANDROID ? 220 : 320}
            pressRetentionOffset={{ top: 28, left: 28, right: 28, bottom: 28 }}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            longPressHapticType="medium"
            activeOpacity={0.9}
          >
            {selectedDayPendingCount > 0 ? (
              <View style={styles.dayCardPendingBadge}>
                <Text style={styles.dayCardPendingBadgeText}>
                  {selectedDayPendingCount > 9 ? '9+' : `+${selectedDayPendingCount}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.dayCardHeader}>
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.dayWeek, styles.dayCardTextActive]}
              >
                {selectedDay.weekdayShort}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.dayNumber, styles.dayCardTextActive]}
            >
              {selectedDay.dayNumber}
            </Text>
            {selectedDayStatusLabel ? (
              <View
                style={[
                  styles.dayStatusBadge,
                  styles.dayStatusBadgeClosedSelected,
                  selectedAvailability?.reason === 'holiday' && styles.dayStatusBadgeHoliday,
                ]}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  style={[
                    styles.dayStatusBadgeText,
                    styles.dayStatusBadgeTextClosedSelected,
                  ]}
                >
                  {selectedDayStatusLabel}
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
              style={[styles.dayMonth, styles.dayCardTextActive]}
            >
              {selectedDay.monthShort}
            </Text>
            <View style={[styles.dayCardFooter, styles.dayCardFooterActive]}>
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={[styles.dayCardFooterText, styles.dayCardFooterTextActive]}
              >
                {tApp(appLanguage, 'agenda_selected_short')}
              </Text>
            </View>
          </HapticTouchable>
        ) : null}
      </View>
    </View>
  );
});

const buildGiornoPicker = (value: string, appLanguage: AppLanguage): GiornoPicker => {
  const date = parseIsoDate(value);

  return {
    value,
    weekdayShort: getLocalizedShortWeekdays(appLanguage)[date.getDay()],
    dayNumber: String(date.getDate()).padStart(2, '0'),
    monthShort: getLocalizedShortMonths(appLanguage)[date.getMonth()],
    fullLabel: formatDateLongLocalized(value, appLanguage),
  };
};

const buildWeekDates = (weekStart: string, appLanguage: AppLanguage): GiornoPicker[] =>
  Array.from({ length: 7 }, (_, index) => buildGiornoPicker(addDaysToIso(weekStart, index), appLanguage));

const getLocalizedShortWeekdays = (_appLanguage: AppLanguage) => GIORNI_SETTIMANA_IT;

const getLocalizedShortMonths = (_appLanguage: AppLanguage) => MESI_IT;

const formatDateLongLocalized = (value: string, appLanguage: AppLanguage) => {
  const date = parseIsoDate(value);
  const weekdays = getLocalizedShortWeekdays(appLanguage);
  const months = getLocalizedShortMonths(appLanguage);
  return `${weekdays[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    months[date.getMonth()]
  } ${date.getFullYear()}`;
};

const formatMonthYearLabelLocalized = (value: string, appLanguage: AppLanguage) => {
  const date = parseIsoDate(value);
  const months = getLocalizedShortMonths(appLanguage);
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

const getMonthStart = (value: string) => {
  const date = parseIsoDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const addMonthsToIso = (value: string, months: number) => {
  const date = parseIsoDate(value);
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const buildMonthCalendar = (monthValue: string, minDate: string): CalendarDay[] => {
  const monthStart = getMonthStart(monthValue);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarDay[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `empty-${index}`,
      value: null,
      label: '',
      isCurrentMonth: false,
      isDisabled: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(
      2,
      '0'
    )}`;

    cells.push({
      key: value,
      value,
      label: String(day),
      isCurrentMonth: true,
      isDisabled: value < minDate,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `tail-${cells.length}`,
      value: null,
      label: '',
      isCurrentMonth: false,
      isDisabled: true,
    });
  }

  return cells;
};

const normalizeServiceName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+]/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const getAppointmentDateTime = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);

  return new Date(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hours ?? 0,
    minutes ?? 0,
    0,
    0
  );
};

const isAppointmentInFuture = (item: Pick<AppuntamentoItem, 'data' | 'ora'>, fallbackDate: string) =>
  getAppointmentDateTime(item.data ?? fallbackDate, item.ora).getTime() > Date.now();

const minutesToTime = (minutesValue: number) => {
  const hours = Math.floor(minutesValue / 60);
  const minutes = minutesValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatSlotInterval = (value: number) => {
  if (value < 60) return `${value} min`;
  if (value === 30) return '30 min';
  if (value === 60) return '1 ora';
  if (value % 60 === 0) {
    const hours = value / 60;
    return hours === 1 ? '1 ora' : `${hours} ore`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours === 1 && minutes === 30) return '1 ora e 30 min';
  if (hours === 1) return `1 ora e ${minutes} min`;

  return `${hours} ore e ${minutes} min`;
};

const isDateInRange = (dateValue: string, startDate: string, endDate: string) =>
  dateValue >= startDate && dateValue <= endDate;

const getAppointmentUniquenessKey = (
  item: Pick<AppuntamentoItem, 'data' | 'ora' | 'cliente' | 'servizio' | 'operatoreId' | 'durataMinuti' | 'prezzo'>,
  fallbackDate: string
) => {
  const dateValue = item.data ?? fallbackDate;
  const customerKey = item.cliente.trim().toLowerCase();
  const serviceKey = item.servizio.trim().toLowerCase();
  const operatorKey = item.operatoreId ?? '';
  const durationKey = String(item.durataMinuti ?? '');
  const priceKey = String(item.prezzo ?? '');
  return [dateValue, item.ora, customerKey, serviceKey, operatorKey, durationKey, priceKey].join('|');
};

const dedupeAppointments = (items: AppuntamentoItem[], fallbackDate: string) => {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const normalizedItems: AppuntamentoItem[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const uniquenessKey = getAppointmentUniquenessKey(item, fallbackDate);

    if (seenIds.has(item.id) || seenKeys.has(uniquenessKey)) {
      continue;
    }

    seenIds.add(item.id);
    seenKeys.add(uniquenessKey);
    normalizedItems.push(item);
  }

  return normalizedItems.reverse();
};

export default function AgendaScreen() {
  const navigation = useNavigation();
  const searchParams = useLocalSearchParams<{ start?: string | string[] }>();
  const hasRedirectedToHomeRef = useRef(false);
  const responsive = useResponsiveLayout();
  const {
    appuntamenti,
    setAppuntamenti,
    clienti,
    setClienti,
    servizi,
    setServizi,
    operatori,
    macchinari,
    movimenti,
    setMovimenti,
    richiestePrenotazione,
    setRichiestePrenotazione,
    availabilitySettings,
    setAvailabilitySettings,
    salonWorkspace,
    appLanguage,
    serviceCardColorOverrides,
    roleCardColorOverrides,
    createOwnerAppointmentForSalon,
    cancelOwnerAppointmentForSalon,
    moveOwnerAppointmentForSalon,
    updateBookingRequestStatusForSalon,
  } = useAppContext();

  const giorniDisponibili = useMemo(
    () =>
      buildCenteredDates(21, 180).map((day) => ({
        ...day,
        weekdayShort: getLocalizedShortWeekdays(appLanguage)[parseIsoDate(day.value).getDay()],
        monthShort: getLocalizedShortMonths(appLanguage)[parseIsoDate(day.value).getMonth()],
        fullLabel: formatDateLongLocalized(day.value, appLanguage),
      })),
    [appLanguage]
  );
  const [data, setData] = useState(getTodayDateString());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarSelectionMode, setCalendarSelectionMode] = useState<'agenda' | 'weekAppointmentEdit'>('agenda');
  const [calendarMonth, setCalendarMonth] = useState(getTodayDateString());
  const [ora, setOra] = useState('');
  const [cliente, setCliente] = useState('');
  const [servizio, setServizio] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [operatoreId, setOperatoreId] = useState('');
  const [operatoreNome, setOperatoreNome] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [campoAttivo, setCampoAttivo] = useState<'cliente' | 'ricerca' | null>(null);
  const [giornoEspanso, setGiornoEspanso] = useState('');
  const [showCustomizeHoursExpanded, setShowCustomizeHoursExpanded] = useState(false);
  const [agendaView, setAgendaView] = useState<AgendaView>('today');
  const [showWeekListExpanded, setShowWeekListExpanded] = useState(true);
  const [dayPickerPreviewIndex, setDayPickerPreviewIndex] = useState<number | null>(null);
  const [slotPreviewTime, setSlotPreviewTime] = useState<string | null>(null);
  const [quickSlotDraft, setQuickSlotDraft] = useState<QuickSlotDraft | null>(null);
  const [quickBookingServiceId, setQuickBookingServiceId] = useState('');
  const [quickBookingCustomerId, setQuickBookingCustomerId] = useState('');
  const [quickBookingOperatorId, setQuickBookingOperatorId] = useState('');
  const [showQuickCustomerComposer, setShowQuickCustomerComposer] = useState(false);
  const [showQuickCustomerSearchModal, setShowQuickCustomerSearchModal] = useState(false);
  const [quickCustomerSearchQuery, setQuickCustomerSearchQuery] = useState('');
  const [quickServiceSearchQuery, setQuickServiceSearchQuery] = useState('');
  const [servicePickerTarget, setServicePickerTarget] = useState<ServicePickerTarget | null>(null);
  const [showServiceComposerInPicker, setShowServiceComposerInPicker] = useState(false);
  const [quickCustomerNameInput, setQuickCustomerNameInput] = useState('');
  const [quickCustomerPhoneInput, setQuickCustomerPhoneInput] = useState('');
  const [quickCustomerEmailInput, setQuickCustomerEmailInput] = useState('');
  const [quickCustomerErrors, setQuickCustomerErrors] = useState<{
    nome?: string;
    telefono?: string;
    email?: string;
  }>({});
  const [showAgendaCustomerComposer, setShowAgendaCustomerComposer] = useState(false);
  const [agendaCustomerNameInput, setAgendaCustomerNameInput] = useState('');
  const [agendaCustomerPhoneInput, setAgendaCustomerPhoneInput] = useState('');
  const [agendaCustomerEmailInput, setAgendaCustomerEmailInput] = useState('');
  const [agendaCustomerErrors, setAgendaCustomerErrors] = useState<{
    nome?: string;
    telefono?: string;
    email?: string;
  }>({});
  const [showAgendaServiceComposer, setShowAgendaServiceComposer] = useState(false);
  const [agendaServiceNameInput, setAgendaServiceNameInput] = useState('');
  const [agendaServicePriceInput, setAgendaServicePriceInput] = useState('');
  const [agendaServiceOriginalPriceInput, setAgendaServiceOriginalPriceInput] = useState('');
  const [agendaServiceDurationInput, setAgendaServiceDurationInput] = useState('60');
  const [agendaServiceRoleInput, setAgendaServiceRoleInput] = useState('');
  const [agendaServiceRolePickerOpen, setAgendaServiceRolePickerOpen] = useState(false);
  const [agendaServiceCustomRoleOpen, setAgendaServiceCustomRoleOpen] = useState(false);
  const weekdayLabels = [
    tApp(appLanguage, 'agenda_weekday_sunday'),
    tApp(appLanguage, 'agenda_weekday_monday'),
    tApp(appLanguage, 'agenda_weekday_tuesday'),
    tApp(appLanguage, 'agenda_weekday_wednesday'),
    tApp(appLanguage, 'agenda_weekday_thursday'),
    tApp(appLanguage, 'agenda_weekday_friday'),
    tApp(appLanguage, 'agenda_weekday_saturday'),
  ];
  const [vacationStartInput, setVacationStartInput] = useState('');
  const [vacationEndInput, setVacationEndInput] = useState('');
  const [vacationLabelInput, setVacationLabelInput] = useState('');
  const [vacationPickerTarget, setVacationPickerTarget] = useState<'start' | 'end' | null>(null);
  const [showSlotIntervalPicker, setShowSlotIntervalPicker] = useState(false);
  const [showWeekVisibleDaysPicker, setShowWeekVisibleDaysPicker] = useState(false);
  const [timeConfigTarget, setTimeConfigTarget] = useState<{
    scope: 'weekly' | 'lunch';
    weekday?: number;
    field: 'startTime' | 'endTime';
  } | null>(null);
  const [weekDragState, setWeekDragState] = useState<WeekDragState | null>(null);
  const [weekDragOverlayState, setWeekDragOverlayState] = useState<WeekDragOverlayState | null>(null);
  const [weekSwapPreview, setWeekSwapPreview] = useState<WeekSwapPreview | null>(null);
  const [weekInteractionEpoch, setWeekInteractionEpoch] = useState(0);
  const [isWeekPlannerHorizontalScrolling, setIsWeekPlannerHorizontalScrolling] = useState(false);
  const [isWeekPlannerDragging, setIsWeekPlannerDragging] = useState(false);
  const [weekDragDeleteZoneActive, setWeekDragDeleteZoneActive] = useState(false);
  const [weekAppointmentDetails, setWeekAppointmentDetails] = useState<AppuntamentoItem | null>(null);
  const [weekPendingAction, setWeekPendingAction] = useState<'Accettata' | 'Rifiutata' | null>(null);
  const [weekAppointmentEditDraft, setWeekAppointmentEditDraft] = useState<AppuntamentoItem | null>(null);
  const [weekAppointmentEditDate, setWeekAppointmentEditDate] = useState('');
  const [weekAppointmentEditTime, setWeekAppointmentEditTime] = useState('');
  const [plannerContainerWidth, setPlannerContainerWidth] = useState(0);
  const listRef = useRef<FlatList<AgendaDaySection> | null>(null);
  const startParam = Array.isArray(searchParams.start) ? searchParams.start[0] : searchParams.start;
  const shouldOpenHome = startParam === 'home';

  useFocusEffect(
    useCallback(() => {
      if (!shouldOpenHome || hasRedirectedToHomeRef.current) {
        return undefined;
      }

      hasRedirectedToHomeRef.current = true;
      const interaction = InteractionManager.runAfterInteractions(() => {
        const tabNavigation = navigation as typeof navigation & {
          jumpTo?: (name: string) => void;
        };

        if (typeof tabNavigation.jumpTo === 'function') {
          tabNavigation.jumpTo('index');
          return;
        }

        navigation.navigate('index' as never);
      });

      return () => {
        interaction.cancel();
      };
    }, [navigation, shouldOpenHome])
  );
  const agendaClientSectionOffsetRef = useRef(0);
  const agendaWeekPlannerSectionOffsetRef = useRef(0);
  const agendaServiceSectionOffsetRef = useRef(0);
  const agendaTimeSectionOffsetRef = useRef(0);
  const agendaSummarySectionOffsetRef = useRef(0);
  const agendaClientInputRef = useRef<TextInput | null>(null);
  const vacationLabelInputRef = useRef<TextInput | null>(null);
  const agendaSearchInputRef = useRef<TextInput | null>(null);
  const agendaCustomerNameRef = useRef<TextInput | null>(null);
  const agendaCustomerPhoneRef = useRef<TextInput | null>(null);
  const agendaCustomerEmailRef = useRef<TextInput | null>(null);
  const agendaServiceNameRef = useRef<TextInput | null>(null);
  const agendaServicePriceRef = useRef<TextInput | null>(null);
  const agendaServiceOriginalPriceRef = useRef<TextInput | null>(null);
  const agendaServiceDurationRef = useRef<TextInput | null>(null);
  const quickCustomerNameRef = useRef<TextInput | null>(null);
  const quickCustomerPhoneRef = useRef<TextInput | null>(null);
  const quickCustomerEmailRef = useRef<TextInput | null>(null);
  const quickCustomerSearchRef = useRef<TextInput | null>(null);
  const quickServiceSearchRef = useRef<TextInput | null>(null);
  const quickBookingScrollRef = useRef<ScrollView | null>(null);
  const servicePickerScrollRef = useRef<ScrollView | null>(null);
  const dayPickerRef = useRef<ScrollView | null>(null);
  const weekPlannerHorizontalRef = useRef<ScrollView | null>(null);
  const lastDayTapRef = useRef<{ date: string; timestamp: number } | null>(null);
  const lastDayPickerHapticDateRef = useRef<string | null>(null);
  const lastDayPickerHapticIndexRef = useRef<number | null>(null);
  const dayPickerLiveIndexRef = useRef<number>(0);
  const dayPickerPreviewIndexRef = useRef<number | null>(null);
  const pendingAndroidDateSelectionRef =
    useRef<ReturnType<InteractionManagerStatic['runAfterInteractions']> | null>(null);
  const isDayPickerUserDraggingRef = useRef(false);
  const isDayPickerMomentumRef = useRef(false);
  const dayPickerLatestOffsetXRef = useRef(0);
  const suppressDayPickerSettleRef = useRef(false);
  const [dayPickerWidth, setDayPickerWidth] = useState(0);
  const dayPickerScrollX = useRef(new Animated.Value(0)).current;
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const weekDragOverlayLeft = useSharedValue(0);
  const weekDragOverlayTop = useSharedValue(0);
  const weekDragScaleValue = useSharedValue(1);
  const weekDragOpacityValue = useSharedValue(0);
  const weekDragTouchOffsetX = useSharedValue(0);
  const weekDragTouchOffsetY = useSharedValue(0);
  const weekPlannerOverlayOriginX = useSharedValue(0);
  const weekPlannerOverlayOriginY = useSharedValue(0);
  const weekDragStateRef = useRef<WeekDragState | null>(null);
  const isWeekPlannerDraggingRef = useRef(false);
  const weekDragSourceIndexesRef = useRef<{ dayIndex: number; rowIndex: number } | null>(null);
  const weekDragSourceOverlayPositionRef = useRef<{ left: number; top: number } | null>(null);
  const weekDragLastTargetRef = useRef<{
    date: string | null;
    time: string | null;
    invalidTarget: boolean;
  } | null>(null);
  const weekDragLastCellKeyRef = useRef<string | null>(null);
  const weekDragPanActiveRef = useRef(false);
  const weekDragLatestPointerRef = useRef<{ absoluteX: number; absoluteY: number } | null>(null);
  const weekDragQueuedTargetUpdateRef = useRef<{
    overlayLeft: number;
    overlayTop: number;
    absoluteX: number;
    absoluteY: number;
  } | null>(null);
  const weekDragTargetUpdateRafRef = useRef<number | null>(null);
  const weekDragFinalizeHandledRef = useRef(false);
  const weekDragMovedRef = useRef(false);
  const weekDragDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const weekDragOutOfBoundsRef = useRef(false);
  const weekLastLongPressAtRef = useRef(0);
  const weekDragDeleteZoneAnim = useRef(new Animated.Value(0)).current;
  const weekAppointmentGestureMetaRef = useRef<Record<string, {
    appointment: AppuntamentoItem;
    dayIndex: number;
    rowIndex: number;
    isPendingRequestBlock: boolean;
    canDrag: boolean;
  }>>({});
  const agendaVerticalScrollPosRef = useRef(0);
  const agendaVerticalScrollLockYRef = useRef(0);
  const agendaVerticalLockRafRef = useRef<number | null>(null);
  const weekHorizontalScrollPosRef = useRef(0);
  const weekHorizontalScrollLockXRef = useRef(0);
  const weekHorizontalLockRafRef = useRef<number | null>(null);
  const weekVisibleColWidthRef = useRef(WEEK_PLANNER_DAY_WIDTH);
  const weekPlannerOverlayHostRef = useRef<View | null>(null);
  const weekPlannerTableShellRef = useRef<View | null>(null);
  const weekPlannerOverlayOriginRef = useRef({ x: 0, y: 0 });
  const weekPlannerBoundsRef = useRef({ left: 0, top: 0, right: 0, bottom: 0 });
  const dayPickerScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daySelectionScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { focusField, scrollToField } = useKeyboardAwareScroll(listRef, {
    topOffset: responsive.isDesktop ? 88 : 148,
  });

  const { focusField: focusQuickBookingField, scrollToField: scrollQuickBookingField } =
    useKeyboardAwareScroll(quickBookingScrollRef, {
      topOffset: responsive.isDesktop ? 108 : 188,
      scrollDelay: 72,
      focusScrollDelay: 124,
    });
  const { focusField: focusServicePickerField, scrollToField: scrollServicePickerField } =
    useKeyboardAwareScroll(servicePickerScrollRef, {
      topOffset: responsive.isDesktop ? 108 : 188,
      scrollDelay: 72,
      focusScrollDelay: 124,
    });
  const focusQuickBookingNextField = useCallback(
    (inputRef: React.RefObject<TextInput | null>) => {
      InteractionManager.runAfterInteractions(() => {
        focusQuickBookingField(inputRef);
        setTimeout(() => scrollQuickBookingField(inputRef), 120);
      });
    },
    [focusQuickBookingField, scrollQuickBookingField]
  );
  const focusServicePickerNextField = useCallback(
    (inputRef: React.RefObject<TextInput | null>) => {
      InteractionManager.runAfterInteractions(() => {
        focusServicePickerField(inputRef);
        setTimeout(() => scrollServicePickerField(inputRef), 120);
      });
    },
    [focusServicePickerField, scrollServicePickerField]
  );
  const todayDate = useMemo(() => getTodayDateString(), []);
  const displayTimeSlots = useMemo(
    () => buildDisplayTimeSlots(availabilitySettings, data),
    [availabilitySettings, data]
  );

  useEffect(() => {
    setData(todayDate);
    setCalendarMonth(todayDate);
  }, [todayDate]);

  const closeAllSwipeables = useCallback(() => {
    Object.values(swipeableRefs.current).forEach((ref) => ref?.close());
  }, []);

  useEffect(() => {
    weekDragStateRef.current = weekDragState;
  }, [weekDragState]);

  useEffect(() => {
    const maybeNavigation = navigation as {
      setOptions?: (options: Record<string, unknown>) => void;
    };
    maybeNavigation.setOptions?.({
      gestureEnabled: true,
    });
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const doc = globalThis.document;
    const body = doc?.body;
    const root = doc?.documentElement;
    if (!doc || !body || !root || !isWeekPlannerDragging) return;

    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevRootOverflow = root.style.overflow;
    const prevRootTouchAction = root.style.touchAction;
    const prevRootOverscroll = root.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.style.touchAction = 'none';
    root.style.overscrollBehavior = 'none';

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };

    doc.addEventListener('touchmove', preventScroll, { passive: false });
    doc.addEventListener('wheel', preventScroll, { passive: false });

    return () => {
      doc.removeEventListener('touchmove', preventScroll);
      doc.removeEventListener('wheel', preventScroll);
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
      body.style.overscrollBehavior = prevBodyOverscroll;
      root.style.overflow = prevRootOverflow;
      root.style.touchAction = prevRootTouchAction;
      root.style.overscrollBehavior = prevRootOverscroll;
    };
  }, [isWeekPlannerDragging]);

  const stopWeekHorizontalLockLoop = useCallback(() => {
    if (weekHorizontalLockRafRef.current !== null) {
      cancelAnimationFrame(weekHorizontalLockRafRef.current);
      weekHorizontalLockRafRef.current = null;
    }
  }, []);

  const stopAgendaVerticalLockLoop = useCallback(() => {
    if (agendaVerticalLockRafRef.current !== null) {
      cancelAnimationFrame(agendaVerticalLockRafRef.current);
      agendaVerticalLockRafRef.current = null;
    }
  }, []);

  const startWeekHorizontalLockLoop = useCallback(() => {
    stopWeekHorizontalLockLoop();

    const tick = () => {
      if (!isWeekPlannerDraggingRef.current) {
        weekHorizontalLockRafRef.current = null;
        return;
      }

      weekPlannerHorizontalRef.current?.setNativeProps?.({ scrollEnabled: false });
      weekPlannerHorizontalRef.current?.scrollTo?.({
        x: weekHorizontalScrollLockXRef.current,
        animated: false,
      });

      weekHorizontalLockRafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [stopWeekHorizontalLockLoop]);

  const startAgendaVerticalLockLoop = useCallback(() => {
    stopAgendaVerticalLockLoop();

    const tick = () => {
      if (!isWeekPlannerDraggingRef.current) {
        agendaVerticalLockRafRef.current = null;
        return;
      }

      listRef.current?.setNativeProps?.({ scrollEnabled: false });
      listRef.current?.scrollToOffset?.({
        offset: agendaVerticalScrollLockYRef.current,
        animated: false,
      });

      agendaVerticalLockRafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [stopAgendaVerticalLockLoop]);

  const lockPageScrollForDrag = useCallback(() => {
    listRef.current?.setNativeProps?.({ scrollEnabled: false });
    weekPlannerHorizontalRef.current?.setNativeProps?.({ scrollEnabled: false });
    listRef.current?.scrollToOffset?.({
      offset: agendaVerticalScrollLockYRef.current,
      animated: false,
    });
    weekPlannerHorizontalRef.current?.scrollTo?.({
      x: weekHorizontalScrollLockXRef.current,
      animated: false,
    });
  }, []);

const resetWeekDrag = useCallback(() => {
  weekDragMovedRef.current = false;
  isWeekPlannerDraggingRef.current = false;
  weekLastLongPressAtRef.current = 0;
  weekDragSourceIndexesRef.current = null;
  weekDragSourceOverlayPositionRef.current = null;
  weekDragLastTargetRef.current = null;
  weekDragLastCellKeyRef.current = null;
  weekDragPanActiveRef.current = false;
  weekDragLatestPointerRef.current = null;
  weekDragQueuedTargetUpdateRef.current = null;
  weekAppointmentGestureMetaRef.current = {};
  if (weekDragTargetUpdateRafRef.current !== null) {
    cancelAnimationFrame(weekDragTargetUpdateRafRef.current);
    weekDragTargetUpdateRafRef.current = null;
  }
  weekDragFinalizeHandledRef.current = false;
  weekDragDirectionRef.current = null;
  weekDragOutOfBoundsRef.current = false;
  weekDragStateRef.current = null;

  setIsWeekPlannerDragging(false);
  setIsWeekPlannerHorizontalScrolling(false);
  setWeekDragDeleteZoneActive(false);
  setWeekDragOverlayState(null);
  setWeekDragState(null);

  stopAgendaVerticalLockLoop();
  stopWeekHorizontalLockLoop();

  agendaVerticalScrollLockYRef.current = agendaVerticalScrollPosRef.current;
  weekHorizontalScrollLockXRef.current = weekHorizontalScrollPosRef.current;

  listRef.current?.setNativeProps?.({ scrollEnabled: true });
  weekPlannerHorizontalRef.current?.setNativeProps?.({ scrollEnabled: true });

  weekDragOpacityValue.value = 0;
  weekDragScaleValue.value = withTiming(1, { duration: 45 });
  weekDragTouchOffsetX.value = 0;
  weekDragTouchOffsetY.value = 0;

  Animated.timing(weekDragDeleteZoneAnim, {
    toValue: 0,
    useNativeDriver: false,
    duration: 120,
  }).start();
}, [
  stopAgendaVerticalLockLoop,
  stopWeekHorizontalLockLoop,
  weekDragDeleteZoneAnim,
  weekDragOverlayLeft,
  weekDragOverlayTop,
  weekDragOpacityValue,
  weekDragScaleValue,
  weekDragTouchOffsetX,
  weekDragTouchOffsetY,
]);

  const closeServicePicker = useCallback(() => {
    setServicePickerTarget(null);
    setShowServiceComposerInPicker(false);
    setQuickServiceSearchQuery('');
  }, []);

  const scrollAgendaToOffset = useCallback(
    (offset: number) => {
      const nextOffset = Math.max(0, offset - (responsive.isDesktop ? 148 : 118));
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset: nextOffset, animated: true });
        });
      });
    },
    [responsive.isDesktop]
  );

  const scrollAgendaToWeekPlanner = useCallback((extraOffset = 0) => {
    scrollAgendaToOffset(agendaWeekPlannerSectionOffsetRef.current + extraOffset);
    weekPlannerHorizontalRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [scrollAgendaToOffset]);

  const scrollAgendaToService = useCallback(() => {
    scrollAgendaToOffset(agendaServiceSectionOffsetRef.current);
  }, [scrollAgendaToOffset]);

  const scrollAgendaToTime = useCallback(() => {
    scrollAgendaToOffset(agendaTimeSectionOffsetRef.current);
  }, [scrollAgendaToOffset]);

  const scrollAgendaToSummary = useCallback(() => {
    scrollAgendaToOffset(agendaSummarySectionOffsetRef.current);
  }, [scrollAgendaToOffset]);

  const closeActiveSuggestions = useCallback(() => {
    Keyboard.dismiss();
    setCampoAttivo(null);
  }, []);

  const updateWeekPlannerTableOrigin = useCallback(() => {
    weekPlannerOverlayHostRef.current?.measureInWindow?.((x, y, width, height) => {
      weekPlannerOverlayOriginRef.current = { x, y };
      weekPlannerBoundsRef.current = {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
      };
      weekPlannerOverlayOriginX.value = x;
      weekPlannerOverlayOriginY.value = y;
    });
  }, [weekPlannerOverlayOriginX, weekPlannerOverlayOriginY]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        closeActiveSuggestions();
        setShowCalendarModal(false);
        setVacationPickerTarget(null);
        setShowSlotIntervalPicker(false);
        setShowCustomizeHoursExpanded(false);
        setQuickSlotDraft(null);
        setShowQuickCustomerComposer(false);
        setServicePickerTarget(null);
        setShowServiceComposerInPicker(false);
        setShowAgendaCustomerComposer(false);
        setShowAgendaServiceComposer(false);
        setAgendaView('today');
        setShowWeekListExpanded(true);
        setWeekSwapPreview(null);
        resetWeekDrag();
        setSlotPreviewTime(null);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        dayPickerRef.current?.scrollTo({ x: 0, animated: false });
        closeAllSwipeables();
      };
    }, [closeActiveSuggestions, closeAllSwipeables, resetWeekDrag])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setShowCustomizeHoursExpanded(false);
        setAgendaView('today');
      }
    });

    return () => subscription.remove();
  }, []);

  const getTipoAppuntamento = useCallback(
    (serviceName: string) => {
      const normalized = normalizeServiceName(serviceName);

      return (
        servizi.find((item) => normalizeServiceName(item.nome) === normalized) ?? {
          id: 'custom',
          nome: serviceName,
          prezzo: 0,
          durataMinuti: 60,
        }
      );
    },
    [servizi]
  );

  const getAppointmentEndTime = (
    item: Pick<AppuntamentoItem, 'ora' | 'servizio' | 'durataMinuti'>
  ) => {
    const durataMinuti =
      'durataMinuti' in item && typeof item.durataMinuti === 'number'
        ? item.durataMinuti
        : getTipoAppuntamento(item.servizio).durataMinuti ?? 60;

    return minutesToTime(timeToMinutes(item.ora) + durataMinuti);
  };
  
  const getServiceDuration = useCallback(
    (serviceName: string) => getTipoAppuntamento(serviceName).durataMinuti ?? 60,
    [getTipoAppuntamento]
  );

  const getServiceRequiredRole = useCallback(
    (serviceName: string) => normalizeRoleName(getTipoAppuntamento(serviceName).mestiereRichiesto ?? ''),
    [getTipoAppuntamento]
  );

  const getServiceRequiredRoleLabel = useCallback(
    (serviceName: string) => (getTipoAppuntamento(serviceName).mestiereRichiesto ?? '').trim(),
    [getTipoAppuntamento]
  );

  const getServiceRequiredMachineryIds = useCallback(
    (serviceName: string) => {
      void serviceName;
      return [];
    },
    []
  );

  const activeMachineryMap = useMemo(
    () =>
      new Map(
        macchinari
          .filter((item) => item.attivo !== false)
          .map((item) => [item.id, item] as const)
      ),
    [macchinari]
  );

  const weekStart = useMemo(() => getStartOfWeekIso(data), [data]);
  const weekDates = useMemo(() => buildWeekDates(weekStart, appLanguage), [appLanguage, weekStart]);
  const weekBaseSlotInterval = Math.max(15, availabilitySettings.slotIntervalMinutes || 30);
  const weekOpenDays = useMemo(
    () => availabilitySettings.weeklySchedule.filter((item) => !item.isClosed),
    [availabilitySettings.weeklySchedule]
  );
  const weekStartMinutes = useMemo(() => {
    if (weekOpenDays.length === 0) return timeToMinutes('09:00');
    return Math.min(...weekOpenDays.map((item) => timeToMinutes(item.startTime)));
  }, [weekOpenDays]);
  const weekEndMinutes = useMemo(() => {
    if (weekOpenDays.length === 0) return timeToMinutes('19:00');
    return Math.max(...weekOpenDays.map((item) => timeToMinutes(item.endTime)));
  }, [weekOpenDays]);
  const weekTimeSlots = useMemo(
    () => buildTimeSlots(minutesToTime(weekStartMinutes), minutesToTime(weekEndMinutes - weekBaseSlotInterval), weekBaseSlotInterval),
    [weekBaseSlotInterval, weekEndMinutes, weekStartMinutes]
  );
  const weekStartBoundaryLabel = useMemo(() => minutesToTime(weekStartMinutes), [weekStartMinutes]);

  const operatoriCompatibili = useMemo(
    () =>
      servizio.trim()
        ? getEligibleOperatorsForService({
            serviceName: servizio,
            services: servizi,
            operators: operatori,
            appointmentDate: data,
            settings: availabilitySettings,
          })
        : [],
    [availabilitySettings, data, operatori, servizio, servizi]
  );
  const useOperatorScheduling = operatori.length > 0;
  const serviceRequiresOperatorScheduling =
    !!servizio.trim() && useOperatorScheduling && doesServiceUseOperators(servizio, servizi);
  const serviceUsesOperatorScheduling =
    serviceRequiresOperatorScheduling && operatoriCompatibili.length > 0;
  const showOperatorAvailabilityCounters =
    serviceUsesOperatorScheduling && operatoriCompatibili.length > 0;

  useEffect(() => {
    if (!serviceUsesOperatorScheduling || operatoriCompatibili.length === 0) {
      setOperatoreId('');
      setOperatoreNome('');
      return;
    }

    const nextOperator =
      operatoriCompatibili.find((item) => item.id === operatoreId) ?? operatoriCompatibili[0];

    if (!nextOperator) {
      setOperatoreId('');
      setOperatoreNome('');
      return;
    }

    if (nextOperator.id !== operatoreId) {
      setOperatoreId(nextOperator.id);
      setOperatoreNome(nextOperator.nome);
      setOra('');
    }
  }, [operatoreId, operatoriCompatibili, serviceUsesOperatorScheduling, servizio]);

  const doesAppointmentOccupySlot = useCallback(
    (item: Pick<AppuntamentoItem, 'ora' | 'servizio' | 'durataMinuti'>, slotTime: string) => {
      const start = timeToMinutes(item.ora);
      const end =
        start +
        (typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(item.servizio));
      const slot = timeToMinutes(slotTime);

      return slot >= start && slot < end;
    },
    [getServiceDuration]
  );

  const findConflictingAppointment = ({
    appointmentDate,
    startTime,
    serviceName,
    selectedOperatorId,
    selectedOperatorName,
    useOperatorsOverride,
  }: {
    appointmentDate: string;
    startTime: string;
    serviceName: string;
    selectedOperatorId?: string | null;
    selectedOperatorName?: string | null;
    useOperatorsOverride?: boolean;
  }) => {
    const usesOperatorsForAppointment =
      useOperatorsOverride ??
      (operatori.length > 0 && doesServiceUseOperators(serviceName, servizi));

    if (!usesOperatorsForAppointment) {
      return null;
    }

    return findConflictingAppointmentShared({
      appointmentDate,
      startTime,
      serviceName,
      appointments: [
        ...appuntamenti,
        ...richiestePrenotazione
          .filter((item) => item.stato === 'In attesa')
          .map((item) => ({
            id: `pending-${item.id}`,
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
          })),
      ],
      services: servizi,
      operatorId: selectedOperatorId,
      operatorName: selectedOperatorName,
      useOperators: usesOperatorsForAppointment,
    });
  };

  const appuntamentiNormalizzati = useMemo(
    () => {
      const resolvedAppointments = assignFallbackOperatorsToAppointments({
        appointments: appuntamenti,
        services: servizi,
        operators: operatori,
        settings: availabilitySettings,
      }).map((item) => {
        const resolvedOperatorId = item.operatoreId?.trim() ?? '';
        const resolvedOperatorName = item.operatoreNome?.trim() ?? '';
        const hasSalonCapacityMarker = isSalonCapacityOperatorId(resolvedOperatorId);

        return {
          ...item,
          sourceBadge:
            (!resolvedOperatorId && !resolvedOperatorName) || hasSalonCapacityMarker
              ? ('salon' as const)
              : ('operator' as const),
        };
      });

      return dedupeAppointments(resolvedAppointments, todayDate);
    },
    [appuntamenti, availabilitySettings, operatori, servizi, todayDate]
  );

  const appuntamentiDelGiorno = useMemo(() => {
    return appuntamentiNormalizzati
      .filter((item) => (item.data ?? getTodayDateString()) === data)
      .sort((first, second) => first.ora.localeCompare(second.ora));
  }, [appuntamentiNormalizzati, data]);

  const appuntamentiOrdinati = useMemo(() => {
    return [...appuntamentiNormalizzati].sort((first, second) => {
      const firstDate = first.data ?? getTodayDateString();
      const secondDate = second.data ?? getTodayDateString();

      if (firstDate !== secondDate) {
        return firstDate.localeCompare(secondDate);
      }

      return first.ora.localeCompare(second.ora);
    });
  }, [appuntamentiNormalizzati]);

  const appuntamentiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) {
      return appuntamentiOrdinati;
    }

    return appuntamentiOrdinati.filter((item) => {
      return (
        (item.data ?? getTodayDateString()).includes(testo) ||
        item.ora.toLowerCase().includes(testo) ||
        item.cliente.toLowerCase().includes(testo) ||
        item.servizio.toLowerCase().includes(testo)
      );
    });
  }, [appuntamentiOrdinati, ricerca]);

  const appuntamentiFuturiFiltrati = useMemo(
    () => appuntamentiFiltrati.filter((item) => isAppointmentInFuture(item, todayDate)),
    [appuntamentiFiltrati, todayDate]
  );

  const appuntamentiOggiFiltrati = useMemo(
    () =>
      appuntamentiFiltrati.filter((item) => (item.data ?? getTodayDateString()) === todayDate),
    [appuntamentiFiltrati, todayDate]
  );

  const appuntamentiProssimiFiltrati = useMemo(
    () =>
      appuntamentiFuturiFiltrati.filter((item) => (item.data ?? getTodayDateString()) > todayDate),
    [appuntamentiFuturiFiltrati, todayDate]
  );

  const appuntamentiPassatiFiltrati = useMemo(() => {
    return appuntamentiFiltrati
      .filter((item) => !isAppointmentInFuture(item, todayDate))
      .sort((first, second) => {
        const firstDate = first.data ?? getTodayDateString();
        const secondDate = second.data ?? getTodayDateString();

        if (firstDate !== secondDate) {
          return secondDate.localeCompare(firstDate);
        }

        return second.ora.localeCompare(first.ora);
      });
  }, [appuntamentiFiltrati, todayDate]);

  const suggerimentiCliente = useMemo(() => {
    const testo = cliente.trim().toLowerCase();

    return clienti
      .filter((item) => (testo ? item.nome.toLowerCase().includes(testo) : true))
      .slice(0, 6);
  }, [clienti, cliente]);

  const clienteSelezionatoRecord = useMemo(
    () =>
      clienti.find(
        (item) => item.nome.trim().toLowerCase() === cliente.trim().toLowerCase()
      ) ?? null,
    [clienti, cliente]
  );
  const clienteOnlineDisattivato = clienteSelezionatoRecord?.inibito === true;

  const suggerimentiRicerca = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    return appuntamentiOrdinati
      .filter((item) =>
        testo
          ? (item.data ?? getTodayDateString()).includes(testo) ||
            item.cliente.toLowerCase().includes(testo) ||
            item.servizio.toLowerCase().includes(testo) ||
            item.ora.toLowerCase().includes(testo)
          : true
      )
      .slice(0, 6);
  }, [appuntamentiOrdinati, ricerca]);

  const appointmentsByDate = useMemo(() => {
    return appuntamentiNormalizzati.reduce<Record<string, AppuntamentoItem[]>>((accumulator, item) => {
      const dateValue = item.data ?? todayDate;
      if (!accumulator[dateValue]) {
        accumulator[dateValue] = [];
      }
      accumulator[dateValue].push(item);
      return accumulator;
    }, {});
  }, [appuntamentiNormalizzati, todayDate]);

  const hasAcceptedAppointmentsOnDate = useCallback(
    (dateValue: string) => {
      const acceptedAppointments = (appointmentsByDate[dateValue] ?? []).some(
        (item) => item.nonEffettuato !== true
      );
      const acceptedRequests = richiestePrenotazione.some(
        (item) => item.stato === 'Accettata' && item.data === dateValue
      );

      return acceptedAppointments || acceptedRequests;
    },
    [appointmentsByDate, richiestePrenotazione]
  );

  const showAcceptedAppointmentsCustomizationAlert = useCallback(() => {
    Alert.alert('Giornata bloccata', 'Ci sono gia appuntamenti accettati.');
  }, []);

  const canCustomizeSelectedDateHours = useCallback(() => {
    if (!hasAcceptedAppointmentsOnDate(data)) return true;
    showAcceptedAppointmentsCustomizationAlert();
    return false;
  }, [data, hasAcceptedAppointmentsOnDate, showAcceptedAppointmentsCustomizationAlert]);

  const isSelectedDateHoursCustomizationLocked = hasAcceptedAppointmentsOnDate(data);

  const blockingAppointmentsByDate = useMemo(() => {
    const realAppointmentKeys = new Set(
      appuntamentiNormalizzati.map((item) =>
        getAppointmentUniquenessKey(
          {
            data: item.data,
            ora: item.ora,
            cliente: item.cliente,
            servizio: item.servizio,
            operatoreId: item.operatoreId,
            durataMinuti: item.durataMinuti,
            prezzo: item.prezzo,
          },
          todayDate
        )
      )
    );

    const requestBlocksAsAppointments = richiestePrenotazione
      .filter((item) => item.stato === 'In attesa' || item.stato === 'Accettata')
      .map((item) => {
        const materializedAppointment = {
          id: `${item.stato === 'Accettata' ? 'accepted' : 'pending'}-${item.id}`,
          data: item.data,
          ora: item.ora,
          cliente: `${item.nome} ${item.cognome}`.trim(),
          servizio: item.servizio,
          prezzo: item.prezzo,
          durataMinuti:
            typeof item.durataMinuti === 'number'
              ? item.durataMinuti
              : getServiceDuration(item.servizio),
          operatoreId: item.operatoreId,
          operatoreNome: item.operatoreNome,
          macchinarioIds: item.macchinarioIds,
          macchinarioNomi: item.macchinarioNomi,
          sourceBadge:
            (item.operatoreId?.trim() && !isSalonCapacityOperatorId(item.operatoreId)) ||
            item.operatoreNome?.trim()
              ? ('operator' as const)
              : ('salon' as const),
        };

        return {
          item,
          materializedAppointment,
          uniquenessKey: getAppointmentUniquenessKey(
            {
              data: materializedAppointment.data,
              ora: materializedAppointment.ora,
              cliente: materializedAppointment.cliente,
              servizio: materializedAppointment.servizio,
              operatoreId: materializedAppointment.operatoreId,
              durataMinuti: materializedAppointment.durataMinuti,
              prezzo: materializedAppointment.prezzo,
            },
            todayDate
          ),
        };
      })
      .filter(({ item, uniquenessKey }) => {
        if (item.stato === 'In attesa') {
          return true;
        }

        return !realAppointmentKeys.has(uniquenessKey);
      });

    const resolvedRequestBlocks = assignFallbackOperatorsToAppointments({
      appointments: [
        ...appuntamentiNormalizzati,
        ...requestBlocksAsAppointments.map(({ materializedAppointment }) => materializedAppointment),
      ],
      services: servizi,
      operators: operatori,
      settings: availabilitySettings,
    });

    const resolvedRequestBlockMap = new Map(
      resolvedRequestBlocks
        .filter((item) => item.id.startsWith('pending-') || item.id.startsWith('accepted-'))
        .map((item) => [item.id, item])
    );

    const requestBlocksWithResolvedLanes = requestBlocksAsAppointments.map(({ materializedAppointment }) => {
      const resolvedBlock =
        resolvedRequestBlockMap.get(materializedAppointment.id) ?? materializedAppointment;
      const resolvedOperatorId = resolvedBlock.operatoreId?.trim() ?? '';
      const resolvedOperatorName = resolvedBlock.operatoreNome?.trim() ?? '';
      const hasSalonCapacityMarker = isSalonCapacityOperatorId(resolvedOperatorId);

      return {
        ...resolvedBlock,
        sourceBadge:
          (!resolvedOperatorId && !resolvedOperatorName) || hasSalonCapacityMarker
            ? ('salon' as const)
            : ('operator' as const),
      };
    });

    return [...appuntamentiNormalizzati, ...requestBlocksWithResolvedLanes].reduce<
      Record<string, AppuntamentoItem[]>
    >((accumulator, item) => {
      const dateValue = item.data ?? todayDate;
      if (!accumulator[dateValue]) {
        accumulator[dateValue] = [];
      }
      accumulator[dateValue].push(item);
      return accumulator;
    }, {});
  }, [
    appuntamentiNormalizzati,
    availabilitySettings,
    operatori,
    richiestePrenotazione,
    servizi,
    todayDate,
  ]);

  const pendingRequestsCountByDate = useMemo(
    () =>
      richiestePrenotazione
        .filter((item) => item.stato === 'In attesa')
        .reduce<Record<string, number>>((accumulator, item) => {
          const dateValue = item.data || todayDate;
          accumulator[dateValue] = (accumulator[dateValue] ?? 0) + 1;
          return accumulator;
        }, {}),
    [richiestePrenotazione, todayDate]
  );

  const getWeekAppointmentStartingAt = useCallback(
    (dateValue: string, slotTime: string) =>
      (blockingAppointmentsByDate[dateValue] ?? [])
        .slice()
        .sort((first, second) => first.ora.localeCompare(second.ora))
        .find((item) => item.ora === slotTime) ?? null,
    [blockingAppointmentsByDate]
  );

  const getWeekAppointmentOccupyingSlot = useCallback(
    (dateValue: string, slotTime: string) =>
      (blockingAppointmentsByDate[dateValue] ?? [])
        .slice()
        .sort((first, second) => first.ora.localeCompare(second.ora))
        .find((item) => doesAppointmentOccupySlot(item, slotTime)) ?? null,
    [blockingAppointmentsByDate, doesAppointmentOccupySlot]
  );

  const getWeekRenderAppointmentsForDate = useCallback(
    (dateValue: string) => {
      const draggedAppointmentId = weekDragStateRef.current?.appointmentId;
      const appointmentsForDate = blockingAppointmentsByDate[dateValue] ?? [];

      if (!draggedAppointmentId) {
        return appointmentsForDate;
      }

      return appointmentsForDate.filter((item) => item.id !== draggedAppointmentId);
    },
    [blockingAppointmentsByDate]
  );

  const getWeekRenderSlotBookedCount = useCallback(
    (dateValue: string, slotTime: string) =>
      getWeekRenderAppointmentsForDate(dateValue).filter((item) =>
        doesAppointmentOccupySlot(item, slotTime)
      ).length,
    [doesAppointmentOccupySlot, getWeekRenderAppointmentsForDate]
  );

  const getWeekRenderAppointmentStartingAt = useCallback(
    (dateValue: string, slotTime: string) =>
      getWeekRenderAppointmentsForDate(dateValue)
        .slice()
        .sort((first, second) => first.ora.localeCompare(second.ora))
        .find((item) => item.ora === slotTime) ?? null,
    [getWeekRenderAppointmentsForDate]
  );

  const getWeekOperatorLaneKey = useCallback((item: AppuntamentoItem) => {
    if (item.sourceBadge === 'salon') {
      return item.operatoreId?.trim() || buildSalonCapacityOperatorId(item.servizio, servizi);
    }
    const operatorIdKey = item.operatoreId?.trim();
    if (operatorIdKey) {
      return `operator-id:${operatorIdKey}`;
    }
    const operatorNameKey = item.operatoreNome?.trim().toLowerCase();
    if (operatorNameKey) {
      return `operator-name:${operatorNameKey}`;
    }
    return '__default__';
  }, [servizi]);

  const doesAppointmentUseOperatorCapacity = useCallback(
    (item: AppuntamentoItem) => {
      if (item.sourceBadge === 'salon') {
        return false;
      }

      if (item.sourceBadge === 'operator') {
        return true;
      }

      return (
        (!!item.operatoreId?.trim() || !!item.operatoreNome?.trim()) &&
        doesServiceUseOperators(item.servizio, servizi)
      );
    },
    [doesServiceUseOperators, servizi]
  );

  const weekOperatorLaneLayoutByDate = useMemo(() => {
    const orderedSalonCapacityKeys = Array.from(
      new Set(
        servizi
          .map((item) => {
            const normalizedRole = normalizeRoleName(item.mestiereRichiesto ?? '');
            if (normalizedRole && hasConfiguredAgendaOperatorsForRole(normalizedRole, operatori)) {
              return '';
            }
            return normalizedRole || buildSalonCapacityOperatorId(item.nome, servizi);
          })
          .filter(Boolean)
      )
    );
    const salonCapacityOrder = new Map(
      orderedSalonCapacityKeys.map((key, index) => [key, index] as const)
    );
    const salonRolePriority = new Map(
      SALON_LANE_ROLE_PRIORITY.map((role, index) => [role, index] as const)
    );

    return weekDates.reduce<
      Record<
        string,
        {
          lanes: Array<{ key: string; label: string; operatorId?: string | null }>;
          appointmentLaneKeys: Record<string, string>;
        }
      >
    >((accumulator, day) => {
      const laneSource = (blockingAppointmentsByDate[day.value] ?? []).filter((item) => {
        return item.sourceBadge === 'operator' || item.sourceBadge === 'salon';
      });

      const appointmentLaneKeys: Record<string, string> = {};
      const operatorLaneMap = new Map<
        string,
        {
          key: string;
          label: string;
          operatorId?: string | null;
          firstTime: string;
        }
      >();

      laneSource
        .filter((item) => item.sourceBadge !== 'salon')
        .forEach((item) => {
          const laneKey = getWeekOperatorLaneKey(item);
          const operatorLabel =
            item.operatoreNome?.trim() ||
            item.operatoreId?.trim() ||
            item.cliente.trim().split(/\s+/)[0] ||
            'Salone';
          const firstOperatorWord = operatorLabel.split(/\s+/).filter(Boolean)[0] || operatorLabel;
          const current = operatorLaneMap.get(laneKey);

          appointmentLaneKeys[item.id] = laneKey;

          if (!current || item.ora.localeCompare(current.firstTime) < 0) {
            operatorLaneMap.set(laneKey, {
              key: laneKey,
              label: firstOperatorWord.toUpperCase(),
              operatorId: item.operatoreId?.trim() || null,
              firstTime: item.ora,
            });
          }
        });

      operatori
        .filter((item) => isOperatorAvailableOnDate(item, day.value, availabilitySettings))
        .forEach((item) => {
          const laneKey = `operator-id:${item.id}`;
          if (operatorLaneMap.has(laneKey)) {
            return;
          }

          const firstOperatorWord = item.nome.trim().split(/\s+/).filter(Boolean)[0] || item.nome.trim();
          operatorLaneMap.set(laneKey, {
            key: laneKey,
            label: firstOperatorWord.toUpperCase(),
            operatorId: item.id,
            firstTime: '99:99',
          });
        });

      const salonAppointments = laneSource
        .filter((item) => item.sourceBadge === 'salon')
        .slice()
        .sort((first, second) => {
          const timeCompare = first.ora.localeCompare(second.ora);
          if (timeCompare !== 0) return timeCompare;
          return first.id.localeCompare(second.id);
        });
      const salonLaneMap = new Map<
        string,
        {
          key: string;
          label: string;
          operatorId: null;
          capacityKey: string;
          capacityLabel: string;
          firstTime: string;
          lastEndMinutes: number;
        }
      >();

      salonAppointments.forEach((item) => {
        const appointmentStartMinutes = timeToMinutes(item.ora);
        const appointmentEndMinutes = timeToMinutes(getAppointmentEndTime(item));
        const capacityKey = item.operatoreId?.trim() || buildSalonCapacityOperatorId(item.servizio, servizi);
        const capacityLabel =
          getServiceRequiredRole(item.servizio) ||
          item.servizio.trim().toLowerCase() ||
          capacityKey;
        const reusableLane = Array.from(salonLaneMap.values())
          .sort((first, second) => first.key.localeCompare(second.key))
          .find(
            (lane) =>
              lane.capacityKey === capacityKey && appointmentStartMinutes >= lane.lastEndMinutes
          );

        if (reusableLane) {
          appointmentLaneKeys[item.id] = reusableLane.key;
          reusableLane.lastEndMinutes = appointmentEndMinutes;
          if (item.ora.localeCompare(reusableLane.firstTime) < 0) {
            reusableLane.firstTime = item.ora;
          }
          return;
        }

        const laneIndex = salonLaneMap.size;
        const laneKey = `salon-lane:${capacityKey}:${laneIndex}`;
        appointmentLaneKeys[item.id] = laneKey;
        salonLaneMap.set(laneKey, {
          key: laneKey,
          label: 'SAL.',
          operatorId: null,
          capacityKey,
          capacityLabel,
          firstTime: item.ora,
          lastEndMinutes: appointmentEndMinutes,
        });
      });

      const lanes = [
        ...Array.from(operatorLaneMap.values()),
        ...Array.from(salonLaneMap.values()).map(
          ({ key, label, operatorId, firstTime, capacityLabel }) => ({
          key,
          label,
          operatorId,
          firstTime,
          capacityLabel,
        })
        ),
        
      ]
        .sort((first, second) => {
          const firstIsSalonLane = first.key.startsWith('salon-lane:');
          const secondIsSalonLane = second.key.startsWith('salon-lane:');

          if (firstIsSalonLane && secondIsSalonLane) {
            const firstCapacityKey = extractSalonLaneCapacityKey(first.key) || first.key;
            const secondCapacityKey = extractSalonLaneCapacityKey(second.key) || second.key;
            const firstConfiguredOrder = salonCapacityOrder.get(firstCapacityKey);
            const secondConfiguredOrder = salonCapacityOrder.get(secondCapacityKey);

            if (
              typeof firstConfiguredOrder === 'number' &&
              typeof secondConfiguredOrder === 'number' &&
              firstConfiguredOrder !== secondConfiguredOrder
            ) {
              return firstConfiguredOrder - secondConfiguredOrder;
            }

            const firstCapacityLabel =
              'capacityLabel' in first && typeof first.capacityLabel === 'string'
                ? first.capacityLabel
                : '';
            const secondCapacityLabel =
              'capacityLabel' in second && typeof second.capacityLabel === 'string'
                ? second.capacityLabel
                : '';
            const firstRolePriority =
              salonRolePriority.get(normalizeRoleName(firstCapacityLabel)) ?? Number.MAX_SAFE_INTEGER;
            const secondRolePriority =
              salonRolePriority.get(normalizeRoleName(secondCapacityLabel)) ?? Number.MAX_SAFE_INTEGER;

            if (firstRolePriority !== secondRolePriority) {
              return firstRolePriority - secondRolePriority;
            }

            const capacityCompare = firstCapacityLabel.localeCompare(secondCapacityLabel);
            if (capacityCompare !== 0) return capacityCompare;
          }

          const timeCompare = first.firstTime.localeCompare(second.firstTime);
          if (timeCompare !== 0) return timeCompare;
          return first.label.localeCompare(second.label);
        })
        .map(({ key, label, operatorId }) => ({ key, label, operatorId }));

      const lanesWithAppointments = new Set(Object.values(appointmentLaneKeys));
      const shouldAppendExtraOpenLane =
        lanes.length >= 1 &&
        lanes.every((lane) => lanesWithAppointments.has(lane.key)) &&
        (operatorLaneMap.size > 1 || orderedSalonCapacityKeys.length > 1 || lanes.length > 1);

      if (shouldAppendExtraOpenLane) {
        lanes.push({
          key: `salon-lane:auto-${lanes.length}`,
          label: 'SAL.',
          operatorId: null,
        });
      }

      accumulator[day.value] = {
        lanes: lanes.length >= 2 ? lanes : [],
        appointmentLaneKeys,
      };
      return accumulator;
    }, {});
  }, [
    availabilitySettings,
    blockingAppointmentsByDate,
    getAppointmentEndTime,
    getWeekOperatorLaneKey,
    operatori,
    servizi,
    weekDates,
  ]);

  const weekDenseOperatorModeByDate = useMemo(
    () =>
      Object.fromEntries(
        weekDates.map((day) => [
          day.value,
          (weekOperatorLaneLayoutByDate[day.value]?.lanes.length ?? 0) >= 2,
        ])
      ) as Record<string, boolean>,
    [weekDates, weekOperatorLaneLayoutByDate]
  );

  const getWeekRenderCellState = useCallback(
    (dateValue: string, slotTime: string): WeekPlannerCellState => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return 'outside';
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return 'outside';
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return 'blocked';
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return 'blocked';
      if (getWeekRenderSlotBookedCount(dateValue, slotTime) > 0) return 'occupied';
      return 'available';
    },
    [availabilitySettings, getWeekRenderSlotBookedCount]
  );

  const getWeekAppointmentBlockHeight = useCallback(
    (item: AppuntamentoItem) => {
      const durationMinutes =
        typeof item.durataMinuti === 'number' ? item.durataMinuti : getServiceDuration(item.servizio);
      const span = Math.max(1, Math.ceil(durationMinutes / weekBaseSlotInterval));

      return WEEK_PLANNER_ROW_HEIGHT * span + WEEK_PLANNER_ROW_GAP * Math.max(0, span - 1);
    },
    [getServiceDuration, weekBaseSlotInterval]
  );

  const buildAgendaSections = useCallback(
    (items: AppuntamentoItem[], order: 'asc' | 'desc' = 'asc') => {
      const dateSet = new Set<string>();

      items.forEach((item) => {
        dateSet.add(item.data ?? getTodayDateString());
      });

      return Array.from(dateSet)
        .sort((first, second) =>
          order === 'asc' ? first.localeCompare(second) : second.localeCompare(first)
        )
        .map((dateValue) => ({
          date: dateValue,
          items: items.filter((item) => (item.data ?? getTodayDateString()) === dateValue),
        }));
    },
    []
  );

  const sezioniAgendaOggi = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiOggiFiltrati),
    [appuntamentiOggiFiltrati, buildAgendaSections]
  );

  const sezioniAgendaProssime = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiProssimiFiltrati),
    [appuntamentiProssimiFiltrati, buildAgendaSections]
  );

  const sezioniAgendaRecenti = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiPassatiFiltrati, 'desc'),
    [appuntamentiPassatiFiltrati, buildAgendaSections]
  );

  const sezioniAgendaSettimana = useMemo<AgendaDaySection[]>(
    () =>
      weekDates.map((day) => ({
        date: day.value,
        items: [...(blockingAppointmentsByDate[day.value] ?? [])].sort((first, second) =>
          first.ora.localeCompare(second.ora)
        ),
      })),
    [blockingAppointmentsByDate, weekDates]
  );

  useEffect(() => {
    if (agendaView !== 'today') return;

    const defaultTodaySection =
      sezioniAgendaOggi.find((item) => item.date === todayDate) ?? sezioniAgendaOggi[0] ?? null;

    if (!defaultTodaySection) {
      if (giornoEspanso) {
        setGiornoEspanso('');
      }
      return;
    }

    const isExpandedDateStillVisible = sezioniAgendaOggi.some((item) => item.date === giornoEspanso);
    if (!giornoEspanso || !isExpandedDateStillVisible) {
      setGiornoEspanso(defaultTodaySection.date);
    }
  }, [agendaView, giornoEspanso, sezioniAgendaOggi, todayDate]);

  const prossimoAppuntamentoOggi = useMemo(
    () =>
      appuntamentiOggiFiltrati.find(
        (item) => getAppointmentDateTime(item.data ?? todayDate, item.ora).getTime() > Date.now()
      ) ?? null,
    [appuntamentiOggiFiltrati, todayDate]
  );

  const ultimoAppuntamentoArchiviato = useMemo(
    () => appuntamentiPassatiFiltrati[0] ?? null,
    [appuntamentiPassatiFiltrati]
  );

  const weekAppointmentsCount = useMemo(
    () => weekDates.reduce((total, day) => total + (blockingAppointmentsByDate[day.value] ?? []).length, 0),
    [blockingAppointmentsByDate, weekDates]
  );

  const isWeekSlotBookable = useCallback(
    (dateValue: string, slotTime: string) => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return false;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return false;
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return false;
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return false;

      if (!servizio.trim()) {
        return !(blockingAppointmentsByDate[dateValue] ?? []).some((item) =>
          doesAppointmentOccupySlot(item, slotTime)
        );
      }

      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio),
        })
      ) {
        return false;
      }

      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio),
        })
      ) {
        return false;
      }

      const appointmentsForDate = blockingAppointmentsByDate[dateValue] ?? [];
      const serviceStart = timeToMinutes(slotTime);
      const serviceEnd = serviceStart + getServiceDuration(servizio);
      const overlappingAppointments = appointmentsForDate.filter((item) => {
        const existingStart = timeToMinutes(item.ora);
        const existingEnd =
          existingStart +
          (typeof item.durataMinuti === 'number'
            ? item.durataMinuti
            : getServiceDuration(item.servizio));

        return serviceStart < existingEnd && serviceEnd > existingStart;
      });

      const declaredRequiredMachineryIds = getServiceRequiredMachineryIds(servizio);
      const requiredMachineryIds = declaredRequiredMachineryIds.filter((item) =>
        activeMachineryMap.has(item)
      );

      if (declaredRequiredMachineryIds.length > requiredMachineryIds.length) {
        return false;
      }

      if (requiredMachineryIds.length > 0) {
        const hasBusyRequiredMachinery = overlappingAppointments.some((item) => {
          const appointmentMachineryIds =
            (item.macchinarioIds ?? []).length > 0
              ? item.macchinarioIds ?? []
              : getServiceRequiredMachineryIds(item.servizio);

          return requiredMachineryIds.some((machineryId) =>
            appointmentMachineryIds.includes(machineryId)
          );
        });

        if (hasBusyRequiredMachinery) {
          return false;
        }
      }

      const usesOperatorsForService =
        operatori.length > 0 && doesServiceUseOperators(servizio, servizi);
      const relevantOverlappingAppointments = overlappingAppointments.filter((item) =>
        usesOperatorsForService
          ? doesAppointmentUseOperatorCapacity(item)
          : !doesAppointmentUseOperatorCapacity(item)
      );

      if (!usesOperatorsForService) {
        return true;
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName: servizio,
        services: servizi,
        operators: operatori,
        appointmentDate: dateValue,
        settings: availabilitySettings,
      });

      if (compatibleOperators.length === 0) {
        return false;
      }

      const selectedOperator = serviceUsesOperatorScheduling ? operatoreId.trim() : '';
      const selectedOperatorName = serviceUsesOperatorScheduling ? operatoreNome.trim() : '';
      if (selectedOperator) {
        const isSelectedOperatorAvailable = compatibleOperators.some(
          (item) => item.id.trim() === selectedOperator
        );

        if (!isSelectedOperatorAvailable) {
          return false;
        }

        return !relevantOverlappingAppointments.some(
          (item) =>
            doOperatorsMatch({
              selectedOperatorId: selectedOperator,
              selectedOperatorName,
              existingOperatorId: item.operatoreId,
              existingOperatorName: item.operatoreNome,
            })
        );
      }

      if (selectedOperatorName) {
        return !relevantOverlappingAppointments.some((item) =>
          doOperatorsMatch({
            selectedOperatorName,
            existingOperatorId: item.operatoreId,
            existingOperatorName: item.operatoreNome,
          })
        );
      }

      const compatibleOperatorKeys = new Set(
        compatibleOperators
          .map((item) =>
            buildAgendaOperatorIdentityKey({
              operatorId: item.id,
              operatorName: item.nome,
            })
          )
          .filter(Boolean)
      );
      const busyCompatibleOperatorKeys = new Set(
        relevantOverlappingAppointments
          .map((item) =>
            buildAgendaOperatorIdentityKey({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            })
          )
          .filter((key) => compatibleOperatorKeys.has(key))
      );
      const anonymousOverlaps = relevantOverlappingAppointments.filter((item) => {
        return (
          !buildAgendaOperatorIdentityKey({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          })
        );
      }).length;

      return compatibleOperatorKeys.size - busyCompatibleOperatorKeys.size - anonymousOverlaps > 0;
    },
    [
      activeMachineryMap,
      availabilitySettings,
      blockingAppointmentsByDate,
      doesAppointmentUseOperatorCapacity,
      doesAppointmentOccupySlot,
      doOperatorsMatch,
      getServiceDuration,
      getServiceRequiredMachineryIds,
      operatoreId,
      operatoreNome,
      operatori,
      serviceUsesOperatorScheduling,
      servizi,
      servizio,
    ]
  );

  const weekAvailableSlotsCount = useMemo(
    () =>
      weekDates.reduce((total, day) => {
        const availableSlotsForDay = weekTimeSlots.filter((slotTime) =>
          getWeekRenderCellState(day.value, slotTime) === 'available'
        ).length;

        return total + availableSlotsForDay;
      }, 0),
    [
      getWeekRenderCellState,
      weekDates,
      weekTimeSlots,
      updateWeekPlannerTableOrigin,
    ]
  );

  const weekMaxLaneCount = useMemo(
    () =>
      weekDates.reduce((maxCount, day) => {
        const laneCount = weekOperatorLaneLayoutByDate[day.value]?.lanes.length ?? 0;
        return Math.max(maxCount, laneCount);
      }, 0),
    [weekDates, weekOperatorLaneLayoutByDate]
  );

  const weekAutoPlannerDays = useMemo(() => {
    if (weekMaxLaneCount >= 4) {
      return 1;
    }

    if (weekMaxLaneCount === 3) {
      return 2;
    }

    if (weekMaxLaneCount === 2) {
      return 3;
    }

    return null;
  }, [weekMaxLaneCount]);

  const weekMinimumSafeColumnWidth = useMemo(() => {
    if (weekMaxLaneCount >= 4) return 128;
    if (weekMaxLaneCount === 3) return 116;
    if (weekMaxLaneCount === 2) return 102;
    return 84;
  }, [weekMaxLaneCount]);

  const weekEffectiveVisibleDays = useMemo(() => {
    const manualDays = Math.max(1, Math.min(7, availabilitySettings.weekVisibleDays || 7));
    const autoDays =
      weekAutoPlannerDays != null ? Math.max(1, Math.min(manualDays, weekAutoPlannerDays)) : manualDays;

    if (autoDays <= 1 || plannerContainerWidth <= 0) {
      return autoDays;
    }

    const projectColumnWidth = (visibleDays: number) => {
      const gapTotal = Math.max(0, visibleDays - 1) * WEEK_PLANNER_COLUMN_GAP;
      const effectivePlannerWidth =
        plannerContainerWidth + WEEK_PLANNER_EDGE_BLEED_LEFT + WEEK_PLANNER_EDGE_BLEED_RIGHT;
      const availableWidth = Math.max(
        0,
        effectivePlannerWidth - WEEK_PLANNER_TIME_COL_TOTAL - gapTotal - WEEK_PLANNER_RIGHT_CLIP_GUARD
      );
      return availableWidth / visibleDays;
    };

    let guardedDays = autoDays;
    while (guardedDays > 1 && projectColumnWidth(guardedDays) < weekMinimumSafeColumnWidth) {
      guardedDays -= 1;
    }

    return guardedDays;
  }, [
    availabilitySettings.weekVisibleDays,
    plannerContainerWidth,
    weekAutoPlannerDays,
    weekMinimumSafeColumnWidth,
  ]);

  const weekPlannerDaysBadgeLabel = useMemo(() => {
    if (weekAutoPlannerDays != null) {
      return `${weekEffectiveVisibleDays}g auto`;
    }

    return `${weekEffectiveVisibleDays}g`;
  }, [
    weekAutoPlannerDays,
    weekEffectiveVisibleDays,
  ]);

  const weekVisibleDates = useMemo(
    () => {
      const desiredDays = weekEffectiveVisibleDays;
      const windowStartDate = desiredDays === 7 ? weekStart : data;
      return Array.from({ length: desiredDays }, (_, offset) =>
        buildGiornoPicker(addDaysToIso(windowStartDate, offset), appLanguage)
      );
    },
    [
      appLanguage,
      data,
      weekEffectiveVisibleDays,
      weekStart,
    ]
  );

  const weekRangeLabel = useMemo(() => {
    const rangeDates = weekVisibleDates.length > 0 ? weekVisibleDates : weekDates;
    const firstDate = rangeDates[0];
    const lastDate = rangeDates[rangeDates.length - 1];

    if (!firstDate || !lastDate) return '';

    return `${firstDate.weekdayShort} ${firstDate.dayNumber} ${firstDate.monthShort} - ${lastDate.weekdayShort} ${lastDate.dayNumber} ${lastDate.monthShort}`;
  }, [weekDates, weekVisibleDates]);

  const weekVisibleColWidth = useMemo(() => {
    if (plannerContainerWidth <= 0 || weekVisibleDates.length === 0) return WEEK_PLANNER_DAY_WIDTH;
    const gapTotal = (weekVisibleDates.length - 1) * WEEK_PLANNER_COLUMN_GAP;
    const effectivePlannerWidth =
      plannerContainerWidth + WEEK_PLANNER_EDGE_BLEED_LEFT + WEEK_PLANNER_EDGE_BLEED_RIGHT;
    const availableWidth = Math.max(
      0,
      effectivePlannerWidth - WEEK_PLANNER_TIME_COL_TOTAL - gapTotal - WEEK_PLANNER_RIGHT_CLIP_GUARD
    );
    const dynamicWidth = availableWidth / weekVisibleDates.length;
    return Math.max(1, dynamicWidth);
  }, [plannerContainerWidth, weekVisibleDates.length]);

  React.useEffect(() => {
    weekVisibleColWidthRef.current = weekVisibleColWidth;
  }, [weekVisibleColWidth]);

  const agendaViewCards = useMemo(
    () => [
      {
        key: 'today' as const,
        eyebrow: 'In corso',
        title: 'Oggi',
        count: appuntamentiOggiFiltrati.length,
        note: prossimoAppuntamentoOggi
          ? `${prossimoAppuntamentoOggi.ora} · ${prossimoAppuntamentoOggi.cliente}`
          : appuntamentiOggiFiltrati.length > 0
            ? 'Giornata gia avviata'
            : 'Nessun appuntamento per oggi',
      },
      {
        key: 'upcoming' as const,
        eyebrow: 'Da preparare',
        title: 'Prossimi',
        count: appuntamentiProssimiFiltrati.length,
        note:
          sezioniAgendaProssime[0]?.date
            ? formatDateLongLocalized(sezioniAgendaProssime[0].date, appLanguage)
            : 'Nessun appuntamento in arrivo',
      },
      {
        key: 'recent' as const,
        eyebrow: 'Gia conclusi',
        title: 'Archivio recente',
        count: appuntamentiPassatiFiltrati.length,
        note: ultimoAppuntamentoArchiviato
          ? `${formatDateCompact(ultimoAppuntamentoArchiviato.data ?? todayDate)} · ${ultimoAppuntamentoArchiviato.cliente}`
          : 'Ancora nessuno storico',
      },
      {
        key: 'week' as const,
        eyebrow: 'Planner',
        title: 'Settimana',
        count: weekAppointmentsCount,
        note:
          weekVisibleDates.length > 0
            ? `${weekVisibleDates[0]?.dayNumber} ${weekVisibleDates[0]?.monthShort} - ${weekVisibleDates[weekVisibleDates.length - 1]?.dayNumber} ${weekVisibleDates[weekVisibleDates.length - 1]?.monthShort} · ${weekAvailableSlotsCount} slot liberi`
            : 'Vista settimanale',
      },
    ],
    [
      appuntamentiOggiFiltrati.length,
      prossimoAppuntamentoOggi,
      appuntamentiProssimiFiltrati.length,
      sezioniAgendaProssime,
      appLanguage,
      appuntamentiPassatiFiltrati.length,
      ultimoAppuntamentoArchiviato,
      todayDate,
      weekAppointmentsCount,
      weekAvailableSlotsCount,
      weekVisibleDates,
    ]
  );

  const agendaNavigatorCards = useMemo(
    () => agendaViewCards.filter((card) => card.key !== 'week'),
    [agendaViewCards]
  );

  const selectedAgendaSections = useMemo(() => {
    if (agendaView === 'today') return sezioniAgendaOggi;
    if (agendaView === 'upcoming') return sezioniAgendaProssime;
    if (agendaView === 'week') return sezioniAgendaSettimana;
    return sezioniAgendaRecenti;
  }, [agendaView, sezioniAgendaOggi, sezioniAgendaProssime, sezioniAgendaRecenti, sezioniAgendaSettimana]);

  const handleAgendaViewSelect = useCallback((nextView: Exclude<AgendaView, 'week'>) => {
    setAgendaView(nextView);
    setGiornoEspanso('');
  }, []);

  const protectedSlotIntervalDates = useMemo(() => {
    const nextDates = new Set<string>();

    appuntamenti.forEach((item) => {
      const appointmentDate = item.data ?? todayDate;
      if (appointmentDate >= todayDate) {
        nextDates.add(appointmentDate);
      }
    });

    richiestePrenotazione.forEach((item) => {
      if (item.stato === 'Accettata' && item.data >= todayDate) {
        nextDates.add(item.data);
      }
    });

    return nextDates;
  }, [appuntamenti, richiestePrenotazione, todayDate]);

  const getSlotBookedCount = useCallback(
    (dateValue: string, slotTime: string) =>
      (blockingAppointmentsByDate[dateValue] ?? []).filter((item) =>
        doesAppointmentOccupySlot(item, slotTime)
      ).length,
    [blockingAppointmentsByDate, doesAppointmentOccupySlot]
  );

  const getSlotAvailableCount = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
      selectedOperatorName,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      selectedOperatorName?: string | null;
    }) => {
      if (!serviceName.trim()) return 0;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) return 0;
      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 0;
      }
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) return 0;
      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 0;
      }

      const appointmentsForDate = blockingAppointmentsByDate[dateValue] ?? [];
      const serviceStart = timeToMinutes(startTime);
      const serviceEnd = serviceStart + getServiceDuration(serviceName);
      const overlappingAppointments = appointmentsForDate.filter((item) => {
        const existingStart = timeToMinutes(item.ora);
        const existingEnd =
          existingStart +
          (typeof item.durataMinuti === 'number'
            ? item.durataMinuti
            : getServiceDuration(item.servizio));

        return serviceStart < existingEnd && serviceEnd > existingStart;
      });

      const declaredRequiredMachineryIds = getServiceRequiredMachineryIds(serviceName);
      const requiredMachineryIds = declaredRequiredMachineryIds.filter((item) =>
        activeMachineryMap.has(item)
      );

      if (declaredRequiredMachineryIds.length > requiredMachineryIds.length) {
        return 0;
      }

      if (requiredMachineryIds.length > 0) {
        const hasBusyRequiredMachinery = overlappingAppointments.some((item) => {
          const appointmentMachineryIds =
            (item.macchinarioIds ?? []).length > 0
              ? item.macchinarioIds ?? []
              : getServiceRequiredMachineryIds(item.servizio);

          return requiredMachineryIds.some((machineryId) =>
            appointmentMachineryIds.includes(machineryId)
          );
        });

        if (hasBusyRequiredMachinery) {
          return 0;
        }
      }

      const usesOperatorsForService =
        operatori.length > 0 && doesServiceUseOperators(serviceName, servizi);
      const relevantOverlappingAppointments = overlappingAppointments.filter((item) =>
        usesOperatorsForService
          ? doesAppointmentUseOperatorCapacity(item)
          : !doesAppointmentUseOperatorCapacity(item)
      );

      if (!usesOperatorsForService) {
        return 1;
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName,
        services: servizi,
        operators: operatori,
        appointmentDate: dateValue,
        settings: availabilitySettings,
      });

      if (compatibleOperators.length === 0) {
        return 0;
      }

      const selectedOperator = selectedOperatorId?.trim() ?? '';
      const selectedOperatorNameKey = normalizeOperatorNameKey(selectedOperatorName);
      if (selectedOperator) {
        const isSelectedOperatorAvailable = compatibleOperators.some(
          (item) => item.id.trim() === selectedOperator
        );

        if (!isSelectedOperatorAvailable) {
          return 0;
        }

        return relevantOverlappingAppointments.some(
          (item) =>
            doOperatorsMatch({
              selectedOperatorId: selectedOperator,
              selectedOperatorName,
              existingOperatorId: item.operatoreId,
              existingOperatorName: item.operatoreNome,
            })
        )
          ? 0
          : 1;
      }

      if (selectedOperatorNameKey) {
        return relevantOverlappingAppointments.some((item) =>
          doOperatorsMatch({
            selectedOperatorName,
            existingOperatorId: item.operatoreId,
            existingOperatorName: item.operatoreNome,
          })
        )
          ? 0
          : 1;
      }

      const compatibleOperatorKeys = new Set(
        compatibleOperators
          .map((item) =>
            buildAgendaOperatorIdentityKey({
              operatorId: item.id,
              operatorName: item.nome,
            })
          )
          .filter(Boolean)
      );
      const busyCompatibleOperatorKeys = new Set(
        relevantOverlappingAppointments
          .map((item) =>
            buildAgendaOperatorIdentityKey({
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            })
          )
          .filter((key) => compatibleOperatorKeys.has(key))
      );
      const anonymousOverlaps = relevantOverlappingAppointments.filter((item) => {
        return (
          !buildAgendaOperatorIdentityKey({
            operatorId: item.operatoreId,
            operatorName: item.operatoreNome,
          })
        );
      }).length;

      return Math.max(
        0,
        compatibleOperatorKeys.size - busyCompatibleOperatorKeys.size - anonymousOverlaps
      );
    },
    [
      blockingAppointmentsByDate,
      doesAppointmentUseOperatorCapacity,
      doOperatorsMatch,
      activeMachineryMap,
      availabilitySettings,
      getServiceDuration,
      getServiceRequiredMachineryIds,
      normalizeOperatorNameKey,
      operatori,
      servizi,
      doesServiceUseOperators,
    ]
  );

  const orariOccupati = new Set(
    displayTimeSlots.filter((slotTime) => getSlotBookedCount(data, slotTime) > 0)
  );

  const orariBloccatiManuali = new Set(
    displayTimeSlots.filter((slotTime) =>
      isSlotBlockedByOverride(availabilitySettings, data, slotTime)
    )
  );

  const getWeekCellState = useCallback(
    (dateValue: string, slotTime: string): WeekPlannerCellState => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return 'outside';
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return 'outside';
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return 'blocked';
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return 'blocked';
      if (getSlotBookedCount(dateValue, slotTime) > 0) return 'occupied';
      if (servizio.trim() && !isWeekSlotBookable(dateValue, slotTime)) return 'blocked';
      return 'available';
    },
    [availabilitySettings, getSlotBookedCount, isWeekSlotBookable, servizio]
  );

  const canScheduleServiceAtSlot = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
      selectedOperatorName,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      selectedOperatorName?: string | null;
    }) => {
      if (!serviceName.trim()) return false;
      if (!buildDisplayTimeSlots(availabilitySettings, dateValue).includes(startTime)) return false;
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return false;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) return false;
      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return false;
      }
      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return false;
      }
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) return false;

      const now = new Date();
      const todayIso = getTodayDateString();
      if (dateValue === todayIso && timeToMinutes(startTime) < now.getHours() * 60 + now.getMinutes()) {
        return false;
      }

      return (
        getSlotAvailableCount({
          dateValue,
          startTime,
          serviceName,
          selectedOperatorId: selectedOperatorId ?? null,
          selectedOperatorName: selectedOperatorName ?? null,
        }) > 0
      );
    },
    [availabilitySettings, getServiceDuration, getSlotAvailableCount]
  );

  const getAvailableStartTimesForService = useCallback(
    ({
      dateValue,
      serviceName,
      selectedOperatorId,
      selectedOperatorName,
    }: {
      dateValue: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      selectedOperatorName?: string | null;
    }) => {
      if (!serviceName.trim()) return [] as string[];

      return buildDisplayTimeSlots(availabilitySettings, dateValue).filter((startTime) =>
        canScheduleServiceAtSlot({
          dateValue,
          startTime,
          serviceName,
          selectedOperatorId: selectedOperatorId ?? null,
          selectedOperatorName: selectedOperatorName ?? null,
        })
      );
    },
    [availabilitySettings, canScheduleServiceAtSlot]
  );

  const canQuickBookAtSlot = useCallback(
    (dateValue: string, slotTime: string) => {
      if (getWeekCellState(dateValue, slotTime) !== 'available') return false;
      if (servizi.length === 0) return true;

      return servizi.some((item) =>
        canScheduleServiceAtSlot({
          dateValue,
          startTime: slotTime,
          serviceName: item.nome,
          selectedOperatorId: null,
        })
      );
    },
    [canScheduleServiceAtSlot, getWeekCellState, servizi]
  );

  const getContiguousFreeWindowMinutes = useCallback(
    (dateValue: string, startTime: string) => {
      const daySlots = buildDisplayTimeSlots(availabilitySettings, dateValue);
      const startIndex = daySlots.indexOf(startTime);

      if (startIndex < 0) {
        return 0;
      }

      const slotInterval = getSlotIntervalForDate(availabilitySettings, dateValue);
      let totalMinutes = 0;

      for (let index = startIndex; index < daySlots.length; index += 1) {
        const slotTime = daySlots[index];

        if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) break;
        if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) break;
        if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) break;

        const hasBlockingAppointment = (blockingAppointmentsByDate[dateValue] ?? []).some((item) =>
          doesAppointmentOccupySlot(item, slotTime)
        );

        if (hasBlockingAppointment) break;

        totalMinutes += slotInterval;
      }

      return totalMinutes;
    },
    [availabilitySettings, blockingAppointmentsByDate, doesAppointmentOccupySlot]
  );

  const selectedQuickService = useMemo(
    () => servizi.find((item) => item.id === quickBookingServiceId) ?? null,
    [quickBookingServiceId, servizi]
  );

  const selectedAgendaService = useMemo(
    () => servizi.find((item) => normalizeServiceName(item.nome) === normalizeServiceName(servizio)) ?? null,
    [servizi, servizio]
  );

  const quickBookingCustomerOptions = useMemo(() => clienti.slice(0, 40), [clienti]);

  const quickBookingSearchResults = useMemo(() => {
    const query = quickCustomerSearchQuery.trim().toLowerCase();

    if (!query) {
      return clienti.slice(0, 20);
    }

    return clienti
      .map((item) => {
        const name = item.nome.trim().toLowerCase();
        const phone = item.telefono.trim().toLowerCase();
        const email = (item.email ?? '').trim().toLowerCase();
        const instagram = (item.instagram ?? '').trim().toLowerCase();

        let score = -1;

        if (name.startsWith(query)) score = Math.max(score, 5);
        if (phone.startsWith(query)) score = Math.max(score, 4);
        if (email.startsWith(query)) score = Math.max(score, 3);
        if (instagram.startsWith(query)) score = Math.max(score, 3);
        if (name.includes(query)) score = Math.max(score, 2);
        if (phone.includes(query) || email.includes(query) || instagram.includes(query)) {
          score = Math.max(score, 1);
        }

        return { item, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return first.item.nome.localeCompare(second.item.nome, 'it', { sensitivity: 'base' });
      })
      .map((entry) => entry.item);
  }, [clienti, quickCustomerSearchQuery]);

  const selectedQuickCustomer = useMemo(
    () => clienti.find((item) => item.id === quickBookingCustomerId) ?? null,
    [clienti, quickBookingCustomerId]
  );

  const sortServicesForQuickBooking = useCallback(
    (items: typeof servizi) =>
      [...items].sort((first, second) => {
        const firstRole = (first.mestiereRichiesto ?? '').trim().toLowerCase();
        const secondRole = (second.mestiereRichiesto ?? '').trim().toLowerCase();

        if (firstRole !== secondRole) {
          if (!firstRole) return 1;
          if (!secondRole) return -1;
          return firstRole.localeCompare(secondRole, 'it', { sensitivity: 'base' });
        }

        return first.nome.localeCompare(second.nome, 'it', { sensitivity: 'base' });
      }),
    [servizi]
  );

  const quickBookingSelectableServices = useMemo(() => {
    if (!quickSlotDraft) {
      return sortServicesForQuickBooking(servizi);
    }

    return sortServicesForQuickBooking(servizi);
  }, [quickSlotDraft, servizi, sortServicesForQuickBooking]);

  const quickBookingAvailableServiceIds = useMemo(() => {
    if (!quickSlotDraft) {
      return new Set(servizi.map((item) => item.id));
    }

    return new Set(
      servizi
        .filter((item) =>
          canScheduleServiceAtSlot({
            dateValue: quickSlotDraft.date,
            startTime: quickSlotDraft.time,
            serviceName: item.nome,
            selectedOperatorId: null,
          })
        )
        .map((item) => item.id)
    );
  }, [canScheduleServiceAtSlot, quickSlotDraft, servizi]);

  const getQuickBookingServiceUnavailableReason = useCallback(
    (serviceItem: (typeof servizi)[number]) => {
      if (!quickSlotDraft) {
        return '';
      }

      const { date: dateValue, time: startTime } = quickSlotDraft;
      const serviceName = serviceItem.nome;

      if (!serviceName.trim()) {
        return 'Servizio KO';
      }

      if (!buildDisplayTimeSlots(availabilitySettings, dateValue).includes(startTime)) {
        return 'Fuori fascia';
      }

      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) {
        return 'Chiuso';
      }

      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) {
        return 'Fuori orario';
      }

      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 'Oltre chiusura';
      }

      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 'In pausa';
      }

      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) {
        return 'Bloccato';
      }

      const now = new Date();
      const todayIso = getTodayDateString();
      if (dateValue === todayIso && timeToMinutes(startTime) < now.getHours() * 60 + now.getMinutes()) {
        return 'Gia passato';
      }

      const declaredRequiredMachineryIds = getServiceRequiredMachineryIds(serviceName);
      const availableRequiredMachineryIds = declaredRequiredMachineryIds.filter((item) =>
        activeMachineryMap.has(item)
      );
      if (declaredRequiredMachineryIds.length > availableRequiredMachineryIds.length) {
        return 'Macchinario';
      }

      const usesOperatorsForService =
        operatori.length > 0 && doesServiceUseOperators(serviceName, servizi);

      if (usesOperatorsForService) {
        const compatibleOperators = getEligibleOperatorsForService({
          serviceName,
          services: servizi,
          operators: operatori,
          appointmentDate: dateValue,
          settings: availabilitySettings,
        });

        if (compatibleOperators.length === 0) {
          return 'No operatore';
        }
      }

      if (
        getSlotAvailableCount({
          dateValue,
          startTime,
          serviceName,
          selectedOperatorId: null,
          selectedOperatorName: null,
        }) <= 0
      ) {
        return usesOperatorsForService ? 'Operatori pieni' : 'Slot pieno';
      }

      return 'Non disponibile';
    },
    [
      activeMachineryMap,
      availabilitySettings,
      getServiceDuration,
      getServiceRequiredMachineryIds,
      getSlotAvailableCount,
      operatori,
      quickSlotDraft,
      servizi,
    ]
  );

  const quickBookingServiceSearchResults = useMemo(() => {
    const query = quickServiceSearchQuery.trim().toLowerCase();

    if (!query) {
      return quickBookingSelectableServices;
    }

    return quickBookingSelectableServices
      .map((item) => {
        const name = item.nome.trim().toLowerCase();
        const role = (item.mestiereRichiesto ?? '').trim().toLowerCase();
        const price = item.prezzo.toFixed(2).replace('.', ',');
        const duration = String(item.durataMinuti ?? 60);

        let score = -1;

        if (name.startsWith(query)) score = Math.max(score, 5);
        if (role.startsWith(query)) score = Math.max(score, 4);
        if (name.includes(query)) score = Math.max(score, 3);
        if (role.includes(query)) score = Math.max(score, 2);
        if (price.includes(query) || duration.includes(query)) score = Math.max(score, 1);

        return { item, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        const firstRole = (first.item.mestiereRichiesto ?? '').trim().toLowerCase();
        const secondRole = (second.item.mestiereRichiesto ?? '').trim().toLowerCase();

        if (firstRole !== secondRole) {
          if (!firstRole) return 1;
          if (!secondRole) return -1;
          return firstRole.localeCompare(secondRole, 'it', { sensitivity: 'base' });
        }

        return first.item.nome.localeCompare(second.item.nome, 'it', { sensitivity: 'base' });
      })
      .map((entry) => entry.item);
  }, [quickBookingSelectableServices, quickServiceSearchQuery]);

  const servicePickerSearchResults = useMemo(() => {
    const query = quickServiceSearchQuery.trim().toLowerCase();
    const candidateServices =
      servicePickerTarget === 'quick' ? quickBookingSelectableServices : servizi;

    if (!query) {
      return candidateServices;
    }

    return candidateServices
      .map((item) => {
        const name = item.nome.trim().toLowerCase();
        const role = (item.mestiereRichiesto ?? '').trim().toLowerCase();
        const price = item.prezzo.toFixed(2).replace('.', ',');
        const duration = String(item.durataMinuti ?? 60);

        let score = -1;

        if (name.startsWith(query)) score = Math.max(score, 5);
        if (role.startsWith(query)) score = Math.max(score, 4);
        if (name.includes(query)) score = Math.max(score, 3);
        if (role.includes(query)) score = Math.max(score, 2);
        if (price.includes(query) || duration.includes(query)) score = Math.max(score, 1);

        return { item, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        const firstRole = (first.item.mestiereRichiesto ?? '').trim().toLowerCase();
        const secondRole = (second.item.mestiereRichiesto ?? '').trim().toLowerCase();

        if (firstRole !== secondRole) {
          if (!firstRole) return 1;
          if (!secondRole) return -1;
          return firstRole.localeCompare(secondRole, 'it', { sensitivity: 'base' });
        }

        return first.item.nome.localeCompare(second.item.nome, 'it', { sensitivity: 'base' });
      })
      .map((entry) => entry.item);
  }, [quickBookingSelectableServices, quickServiceSearchQuery, servicePickerTarget, servizi]);

  const quickServiceCardWidth = useMemo(() => {
    const longestServiceNameLength = servizi.reduce(
      (maxLength, item) => Math.max(maxLength, item.nome.trim().length),
      0
    );

    return Math.max(98, Math.min(118, 76 + longestServiceNameLength * 2.3));
  }, [servizi]);

  const quickServiceColumnWidth = useMemo(
    () => Math.max(122, Math.min(154, quickServiceCardWidth + 14)),
    [quickServiceCardWidth]
  );

  const quickBookingServiceColumns = useMemo(() => {
    const columnSize = 3;
    const columns: typeof quickBookingServiceSearchResults[] = [];

    for (let index = 0; index < quickBookingServiceSearchResults.length; index += columnSize) {
      columns.push(quickBookingServiceSearchResults.slice(index, index + columnSize));
    }

    return columns;
  }, [quickBookingServiceSearchResults]);

  const servicePickerServiceColumns = useMemo(() => {
    const columnSize = 3;
    const columns: typeof servicePickerSearchResults[] = [];

    for (let index = 0; index < servicePickerSearchResults.length; index += columnSize) {
      columns.push(servicePickerSearchResults.slice(index, index + columnSize));
    }

    return columns;
  }, [servicePickerSearchResults]);

  const quickCustomerColumnWidth = useMemo(() => {
    const longestCustomerNameLength = quickBookingCustomerOptions.reduce(
      (maxLength, item) => Math.max(maxLength, item.nome.trim().length),
      0
    );

    return Math.max(144, Math.min(188, 74 + longestCustomerNameLength * 4.2));
  }, [quickBookingCustomerOptions]);

  const quickBookingCustomerColumns = useMemo(() => {
    const columnSize = 5;
    const columns: typeof quickBookingCustomerOptions[] = [];

    for (let index = 0; index < quickBookingCustomerOptions.length; index += columnSize) {
      columns.push(quickBookingCustomerOptions.slice(index, index + columnSize));
    }

    return columns;
  }, [quickBookingCustomerOptions]);

  useEffect(() => {
    if (!quickBookingServiceId) return;
    if (quickBookingSelectableServices.some((item) => item.id === quickBookingServiceId)) {
      return;
    }

    setQuickBookingServiceId('');
    setQuickBookingOperatorId('');
  }, [quickBookingSelectableServices, quickBookingServiceId]);

  const appointmentsById = useMemo(
    () =>
      appuntamentiNormalizzati.reduce<Record<string, AppuntamentoItem>>((accumulator, item) => {
        accumulator[item.id] = item;
        return accumulator;
      }, {}),
    [appuntamentiNormalizzati]
  );

  const getAppointmentDurationMinutes = useCallback(
    (appointment: AppuntamentoItem) =>
      typeof appointment.durataMinuti === 'number'
        ? appointment.durataMinuti
        : getServiceDuration(appointment.servizio),
    [getServiceDuration]
  );

  const getAgendaServiceAccent = useCallback(
    (serviceName: string) => {
      const matchedService = servizi.find(
        (item) => item.nome.trim().toLowerCase() === serviceName.trim().toLowerCase()
      );

      return resolveServiceAccent({
        serviceId: matchedService?.id,
        serviceName,
        roleName: matchedService?.mestiereRichiesto,
        serviceColorOverrides: serviceCardColorOverrides,
        roleColorOverrides: roleCardColorOverrides,
      });
    },
    [roleCardColorOverrides, serviceCardColorOverrides, servizi]
  );

  const canPlaceAppointmentAtSlot = useCallback(
    ({
      appointment,
      dateValue,
      startTime,
      appointmentsPool,
    }: {
      appointment: AppuntamentoItem;
      dateValue: string;
      startTime: string;
      appointmentsPool: AppuntamentoItem[];
    }) => {
      if (!appointment.servizio.trim()) return false;

      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return false;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) return false;

      const durationMinutes = getAppointmentDurationMinutes(appointment);

      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes,
        })
      ) {
        return false;
      }

      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes,
        })
      ) {
        return false;
      }

      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) return false;

      const now = new Date();
      const todayIso = getTodayDateString();
      if (dateValue === todayIso && timeToMinutes(startTime) < now.getHours() * 60 + now.getMinutes()) {
        return false;
      }

      const requiresOperators =
        operatori.length > 0 && doesServiceUseOperators(appointment.servizio, servizi);
      const assignedOperatorId = appointment.operatoreId?.trim() ?? '';

      if (requiresOperators && assignedOperatorId) {
        const compatibleOperators = getEligibleOperatorsForService({
          serviceName: appointment.servizio,
          services: servizi,
          operators: operatori,
          appointmentDate: dateValue,
          settings: availabilitySettings,
        });

        if (!compatibleOperators.some((item) => item.id.trim() === assignedOperatorId)) {
          return false;
        }
      }

      const conflict = requiresOperators
        ? findConflictingAppointmentShared({
            appointmentDate: dateValue,
            startTime,
            serviceName: appointment.servizio,
            appointments: appointmentsPool,
            services: servizi,
            operatorId: assignedOperatorId || undefined,
            operatorName: appointment.operatoreNome?.trim() || undefined,
            useOperators: requiresOperators,
          })
        : null;

      if (conflict) {
        return false;
      }

      const declaredRequiredMachineryIds = getServiceRequiredMachineryIds(appointment.servizio);
      const appointmentMachineryIds =
        (appointment.macchinarioIds ?? []).length > 0
          ? (appointment.macchinarioIds ?? []).filter((item) => activeMachineryMap.has(item))
          : declaredRequiredMachineryIds.filter((item) => activeMachineryMap.has(item));

      if (declaredRequiredMachineryIds.length > appointmentMachineryIds.length) {
        return false;
      }

      if (appointmentMachineryIds.length === 0) {
        return true;
      }

      const appointmentStart = timeToMinutes(startTime);
      const appointmentEnd = appointmentStart + durationMinutes;

      return !appointmentsPool.some((item) => {
        if ((item.data ?? todayDate) !== dateValue) return false;

        const existingStart = timeToMinutes(item.ora);
        const existingEnd =
          existingStart +
          (typeof item.durataMinuti === 'number'
            ? item.durataMinuti
            : getServiceDuration(item.servizio));

        if (!(appointmentStart < existingEnd && appointmentEnd > existingStart)) {
          return false;
        }

        const occupiedMachineryIds =
          (item.macchinarioIds ?? []).length > 0
            ? item.macchinarioIds ?? []
            : getServiceRequiredMachineryIds(item.servizio);

        return appointmentMachineryIds.some((machineryId) =>
          occupiedMachineryIds.includes(machineryId)
        );
      });
    },
    [
      activeMachineryMap,
      availabilitySettings,
      getAppointmentDurationMinutes,
      getServiceDuration,
      getServiceRequiredMachineryIds,
      operatori,
      servizi,
      todayDate,
    ]
  );

  const validateWeekSwapTarget = useCallback(
    ({
      sourceAppointment,
      targetDate,
      targetTime,
    }: {
      sourceAppointment: AppuntamentoItem;
      targetDate: string;
      targetTime: string;
    }) => {
      const resolveCandidateTimes = () => {
        const targetSlotMinutes = timeToMinutes(targetTime);
        const durationMinutes = getAppointmentDurationMinutes(sourceAppointment);
        const targetSlotIndex = weekTimeSlots.indexOf(targetTime);
        const candidateTimes = new Set<string>();

        weekTimeSlots.forEach((candidateTime) => {
          const candidateStartMinutes = timeToMinutes(candidateTime);
          const candidateEndMinutes = candidateStartMinutes + durationMinutes;
          if (candidateStartMinutes <= targetSlotMinutes && targetSlotMinutes < candidateEndMinutes) {
            candidateTimes.add(candidateTime);
          }
        });

        if (targetSlotIndex > 0) {
          candidateTimes.add(weekTimeSlots[targetSlotIndex - 1]);
        }

        if (targetSlotIndex > 1) {
          candidateTimes.add(weekTimeSlots[targetSlotIndex - 2]);
        }

        return Array.from(candidateTimes).sort(
          (first, second) => timeToMinutes(second) - timeToMinutes(first)
        );
      };

      const validateAtTime = (candidateTime: string) => {
        const targetCellState = getWeekCellState(targetDate, candidateTime);
        const occupyingAppointment = getWeekAppointmentOccupyingSlot(targetDate, candidateTime);
        const rawTargetAppointment =
          getWeekAppointmentStartingAt(targetDate, candidateTime) ?? occupyingAppointment;
        const targetAppointment = isSyntheticWeekAppointmentId(rawTargetAppointment?.id)
          ? null
          : rawTargetAppointment;
        const resolvedTargetTime = targetAppointment?.ora ?? candidateTime;

        if (targetCellState === 'outside' || targetCellState === 'blocked') {
          return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
        }

        if (
          (sourceAppointment.data ?? todayDate) === targetDate &&
          sourceAppointment.ora === resolvedTargetTime
        ) {
          return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
        }

        if (targetCellState === 'occupied' && isSyntheticWeekAppointmentId(rawTargetAppointment?.id)) {
          return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
        }

        if (targetAppointment) {
          const sourceUsesOperatorCapacity = doesAppointmentUseOperatorCapacity(sourceAppointment);
          const targetUsesOperatorCapacity = doesAppointmentUseOperatorCapacity(targetAppointment);
          const sourceLaneKey = getWeekOperatorLaneKey(sourceAppointment);
          const targetLaneKey = getWeekOperatorLaneKey(targetAppointment);
          const isSalonToSalonSwap = !sourceUsesOperatorCapacity && !targetUsesOperatorCapacity;
          const isSameOperatorLaneSwap =
            sourceUsesOperatorCapacity && targetUsesOperatorCapacity && sourceLaneKey === targetLaneKey;

          if (!isSalonToSalonSwap && !isSameOperatorLaneSwap) {
            return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
          }

          const swapAppointmentsPool = appuntamenti.filter(
            (item) => item.id !== sourceAppointment.id && item.id !== targetAppointment.id
          );
          const canPlaceSourceIntoTarget = canPlaceAppointmentAtSlot({
            appointment: sourceAppointment,
            dateValue: targetDate,
            startTime: resolvedTargetTime,
            appointmentsPool: swapAppointmentsPool,
          });
          const canPlaceTargetIntoSource = canPlaceAppointmentAtSlot({
            appointment: targetAppointment,
            dateValue: sourceAppointment.data ?? todayDate,
            startTime: sourceAppointment.ora,
            appointmentsPool: swapAppointmentsPool,
          });

          if (!canPlaceSourceIntoTarget || !canPlaceTargetIntoSource) {
            return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
          }

          return { valid: true, targetAppointment, resolvedTargetTime };
        }

        const excludedIds = new Set([sourceAppointment.id]);
        const appointmentsPool = appuntamenti.filter((item) => !excludedIds.has(item.id));

        const canPlaceSource = canPlaceAppointmentAtSlot({
          appointment: sourceAppointment,
          dateValue: targetDate,
          startTime: resolvedTargetTime,
          appointmentsPool,
        });

        if (targetCellState === 'occupied' && !canPlaceSource) {
          return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
        }

        if (!canPlaceSource) {
          return { valid: false, targetAppointment: null as AppuntamentoItem | null, resolvedTargetTime };
        }

        return { valid: true, targetAppointment, resolvedTargetTime };
      };

      const directValidation = validateAtTime(targetTime);
      if (directValidation.valid || directValidation.targetAppointment) {
        return directValidation;
      }

      const fallbackValidation = resolveCandidateTimes()
        .map((candidateTime) => validateAtTime(candidateTime))
        .find((candidate) => candidate.valid);

      return fallbackValidation ?? directValidation;
    },
    [
      appuntamenti,
      canPlaceAppointmentAtSlot,
      doesAppointmentUseOperatorCapacity,
      getAppointmentDurationMinutes,
      getWeekAppointmentOccupyingSlot,
      getWeekOperatorLaneKey,
      getWeekAppointmentStartingAt,
      getWeekCellState,
      todayDate,
      weekTimeSlots,
    ]
  );

  const updateWeekDragTarget = useCallback(
  (
    overlayLeft: number,
    overlayTop: number,
    absoluteX: number,
    absoluteY: number
  ) => {
    const sourceIndexes = weekDragSourceIndexesRef.current;
    const sourceOverlayPosition = weekDragSourceOverlayPositionRef.current;
    const activeDrag = weekDragStateRef.current;

    if (!sourceIndexes || !sourceOverlayPosition || !activeDrag) return;

    const plannerBounds = weekPlannerBoundsRef.current;

    const isOutOfBounds =
      absoluteX < plannerBounds.left ||
      absoluteX > plannerBounds.right ||
      absoluteY < plannerBounds.top ||
      absoluteY > plannerBounds.bottom;

    if (weekDragOutOfBoundsRef.current !== isOutOfBounds) {
      weekDragOutOfBoundsRef.current = isOutOfBounds;
      setWeekDragDeleteZoneActive(isOutOfBounds);

      Animated.timing(weekDragDeleteZoneAnim, {
        toValue: isOutOfBounds ? 1 : 0,
        useNativeDriver: false,
        duration: 120,
      }).start();
    }

    if (isOutOfBounds) {
      const outState: WeekDragState = {
        ...activeDrag,
        targetDate: null,
        targetTime: null,
        invalidTarget: true,
      };

      weekDragStateRef.current = outState;
      weekDragLastTargetRef.current = {
        date: null,
        time: null,
        invalidTarget: true,
      };
      weekDragLastCellKeyRef.current = null;
      return;
    }

    const relativeX =
      absoluteX - plannerBounds.left - 36 + weekHorizontalScrollLockXRef.current;
    const relativeY =
      absoluteY - plannerBounds.top - WEEK_PLANNER_DAY_HEADER_TOTAL_HEIGHT;

    const colStep = weekVisibleColWidthRef.current + WEEK_PLANNER_COLUMN_GAP;
    const rowStep = WEEK_PLANNER_ROW_HEIGHT + WEEK_PLANNER_ROW_GAP;

    const dayIndex = Math.floor(relativeX / colStep);
    const rowIndex = Math.floor(relativeY / rowStep);

    const targetDate = weekVisibleDates[dayIndex]?.value ?? null;
    const targetTime = weekTimeSlots[rowIndex] ?? null;

    const localX = relativeX - dayIndex * colStep;
    const localY = relativeY - rowIndex * rowStep;
    const usesDenseOperatorMode = !!(targetDate && weekDenseOperatorModeByDate[targetDate]);
    const horizontalSoftInset = usesDenseOperatorMode ? Math.min(18, colStep * 0.18) : 0;
    const verticalSoftInset = usesDenseOperatorMode ? Math.min(12, rowStep * 0.2) : 0;
    const pointerIsNearBoundary =
      usesDenseOperatorMode &&
      (
        localX < horizontalSoftInset ||
        localX > colStep - horizontalSoftInset ||
        localY < verticalSoftInset ||
        localY > rowStep - verticalSoftInset
      );

    if (!targetDate || !targetTime) {
      const invalidState: WeekDragState = {
        ...activeDrag,
        targetDate: null,
        targetTime: null,
        invalidTarget: true,
      };

      weekDragStateRef.current = invalidState;
      weekDragLastTargetRef.current = {
        date: null,
        time: null,
        invalidTarget: true,
      };
      weekDragLastCellKeyRef.current = null;
      return;
    }

    if (pointerIsNearBoundary) {
      const lastTarget = weekDragLastTargetRef.current;
      if (lastTarget?.date && lastTarget?.time) {
        return;
      }
    }

    const nextCellKey = `${targetDate}__${targetTime}`;
    if (weekDragLastCellKeyRef.current === nextCellKey) {
      return;
    }

    weekDragLastCellKeyRef.current = nextCellKey;

    const sourceAppointment = appointmentsById[activeDrag.appointmentId];
    if (!sourceAppointment) {
      return;
    }

    const validation = validateWeekSwapTarget({
      sourceAppointment,
      targetDate,
      targetTime,
    });

    const resolvedTargetTime = validation.resolvedTargetTime ?? targetTime;
    const nextState: WeekDragState = {
      ...activeDrag,
      targetDate,
      targetTime: resolvedTargetTime,
      invalidTarget: !validation.valid,
    };

    weekDragStateRef.current = nextState;

    weekDragLastTargetRef.current = {
      date: targetDate,
      time: resolvedTargetTime,
      invalidTarget: !validation.valid,
    };
  },
  [
    setWeekDragState,
    validateWeekSwapTarget,
    weekTimeSlots,
    weekVisibleDates,
    weekDragDeleteZoneAnim,
  ]
);

  const flushQueuedWeekDragTargetUpdate = useCallback(() => {
    weekDragTargetUpdateRafRef.current = null;

    const queuedUpdate = weekDragQueuedTargetUpdateRef.current;
    if (!queuedUpdate) {
      return;
    }

    weekDragQueuedTargetUpdateRef.current = null;
    updateWeekDragTarget(
      queuedUpdate.overlayLeft,
      queuedUpdate.overlayTop,
      queuedUpdate.absoluteX,
      queuedUpdate.absoluteY
    );
  }, [updateWeekDragTarget]);

  const queueWeekDragTargetUpdate = useCallback((
    overlayLeft: number,
    overlayTop: number,
    absoluteX: number,
    absoluteY: number
  ) => {
    weekDragQueuedTargetUpdateRef.current = {
      overlayLeft,
      overlayTop,
      absoluteX,
      absoluteY,
    };

    if (weekDragTargetUpdateRafRef.current !== null) {
      return;
    }

    weekDragTargetUpdateRafRef.current = requestAnimationFrame(() => {
      flushQueuedWeekDragTargetUpdate();
    });
  }, [flushQueuedWeekDragTargetUpdate]);

  const runWeekSwap = useCallback(
    async (preview: WeekSwapPreview) => {
      const result = await moveOwnerAppointmentForSalon({
        salonCode: salonWorkspace.salonCode,
        appointmentId: preview.sourceAppointment.id,
        replacedAppointmentId: preview.targetAppointment?.id,
        currentDate: preview.sourceAppointment.data ?? todayDate,
        currentTime: preview.sourceAppointment.ora,
        nextDate: preview.targetDate,
        nextTime: preview.targetTime,
        customerName: preview.sourceAppointment.cliente,
        serviceName: preview.sourceAppointment.servizio,
      });

      if (!result.ok) {
        setWeekSwapPreview(null);
        Alert.alert('Spostamento non riuscito', result.error ?? "Non sono riuscito a spostare l'appuntamento.");
        return;
      }

      haptic.success().catch(() => null);
      setWeekSwapPreview(null);
      setWeekInteractionEpoch((current) => current + 1);
      resetWeekDrag();
    },
    [moveOwnerAppointmentForSalon, resetWeekDrag, salonWorkspace.salonCode, todayDate]
  );

  const finalizeWeekDrag = useCallback(() => {
    const activeDrag = weekDragStateRef.current;
    if (!activeDrag) {
      resetWeekDrag();
      return;
    }

    const sourceAppointment = appointmentsById[activeDrag.appointmentId];
    if (!sourceAppointment) {
      resetWeekDrag();
      return;
    }

    const queuedTargetUpdate = weekDragQueuedTargetUpdateRef.current;
    const latestPointer = weekDragLatestPointerRef.current;

    if (weekDragTargetUpdateRafRef.current !== null) {
      cancelAnimationFrame(weekDragTargetUpdateRafRef.current);
      weekDragTargetUpdateRafRef.current = null;
    }

    if (queuedTargetUpdate) {
      weekDragQueuedTargetUpdateRef.current = null;
      updateWeekDragTarget(
        queuedTargetUpdate.overlayLeft,
        queuedTargetUpdate.overlayTop,
        queuedTargetUpdate.absoluteX,
        queuedTargetUpdate.absoluteY
      );
    } else if (latestPointer) {
      updateWeekDragTarget(
        latestPointer.absoluteX - weekDragTouchOffsetX.value,
        latestPointer.absoluteY - weekDragTouchOffsetY.value,
        latestPointer.absoluteX,
        latestPointer.absoluteY
      );
    }

    if (weekDragOutOfBoundsRef.current) {
      resetWeekDrag();

      Alert.alert(
        'Elimina appuntamento',
        `Sei sicuro di voler eliminare l'appuntamento con ${sourceAppointment.cliente}?`,
        [
          { text: 'Annulla', onPress: () => resetWeekDrag(), style: 'cancel' },
          {
            text: 'Elimina',
            onPress: () => {
              const appointmentDate = sourceAppointment.data ?? todayDate;
              const pendingRequestId = sourceAppointment.id.startsWith('pending-')
                ? sourceAppointment.id.replace(/^pending-/, '')
                : null;

              if (pendingRequestId) {
                void updateBookingRequestStatusForSalon({
                  salonCode: salonWorkspace.salonCode,
                  requestId: pendingRequestId,
                  status: 'Annullata',
                }).then((result) => {
                  if (!result?.ok) {
                    Alert.alert(
                      'Aggiornamento non riuscito',
                      result?.error ?? 'Non sono riuscito ad annullare la richiesta.'
                    );
                  }
                  haptic.success().catch(() => null);
                }).finally(() => {
                  resetWeekDrag();
                });
                return;
              }

              const matchingAcceptedRequest = richiestePrenotazione.find((entry) => {
                const nomeCompleto = `${entry.nome} ${entry.cognome}`.trim().toLowerCase();
                const clienteCorrente = sourceAppointment.cliente.trim().toLowerCase();

                return (
                  entry.stato === 'Accettata' &&
                  entry.data === appointmentDate &&
                  entry.ora === sourceAppointment.ora &&
                  entry.servizio.trim().toLowerCase() === sourceAppointment.servizio.trim().toLowerCase() &&
                  nomeCompleto === clienteCorrente
                );
              });

              if (matchingAcceptedRequest) {
                void updateBookingRequestStatusForSalon({
                  salonCode: salonWorkspace.salonCode,
                  requestId: matchingAcceptedRequest.id,
                  status: 'Annullata',
                }).then((result) => {
                  if (!result?.ok) {
                    Alert.alert(
                      'Aggiornamento non riuscito',
                      result?.error ?? 'Non sono riuscito ad annullare la prenotazione.'
                    );
                    return;
                  }

                  setRichiestePrenotazione((current) =>
                    current.map((entry) =>
                      entry.id === matchingAcceptedRequest.id
                        ? {
                            ...entry,
                            stato: 'Annullata',
                            viewedByCliente: false,
                            viewedBySalon: true,
                            cancellationSource: 'salone',
                          }
                        : entry
                    )
                  );
                  setAppuntamenti((current) =>
                    current.filter((appointment) => {
                      const currentDate = appointment.data ?? todayDate;
                      const sameComposite =
                        currentDate === appointmentDate &&
                        appointment.ora === sourceAppointment.ora &&
                        appointment.servizio.trim().toLowerCase() ===
                          sourceAppointment.servizio.trim().toLowerCase() &&
                        appointment.cliente.trim().toLowerCase() ===
                          sourceAppointment.cliente.trim().toLowerCase();

                      return !sameComposite;
                    })
                  );
                  haptic.success().catch(() => null);
                }).finally(() => {
                  resetWeekDrag();
                });
                return;
              }

              void cancelOwnerAppointmentForSalon({
                salonCode: salonWorkspace.salonCode,
                appointmentId: sourceAppointment.id,
                appointmentDate,
                appointmentTime: sourceAppointment.ora,
                customerName: sourceAppointment.cliente,
                serviceName: sourceAppointment.servizio,
                operatorId: sourceAppointment.operatoreId,
                operatorName: sourceAppointment.operatoreNome,
              }).then((result) => {
                if (!result?.ok) {
                  Alert.alert(
                    'Aggiornamento non riuscito',
                    result?.error ?? 'Non sono riuscito ad annullare l’appuntamento.'
                  );
                }
                haptic.success().catch(() => null);
              }).finally(() => {
                resetWeekDrag();
              });
            },
            style: 'destructive',
          },
        ]
      );
      return;
    }

    if (!activeDrag.targetDate || !activeDrag.targetTime) {
      resetWeekDrag();
      return;
    }

    if (
      activeDrag.targetDate === activeDrag.sourceDate &&
      activeDrag.targetTime === activeDrag.sourceTime
    ) {
      resetWeekDrag();
      return;
    }

    const validation = validateWeekSwapTarget({
      sourceAppointment,
      targetDate: activeDrag.targetDate,
      targetTime: activeDrag.targetTime,
    });

    if (!validation.valid) {
      haptic.error().catch(() => null);
      resetWeekDrag();
      return;
    }

    resetWeekDrag();

    // Esegui subito lo swap/spostamento dopo conferma
    const preview: WeekSwapPreview = {
      sourceAppointment,
      targetAppointment: validation.targetAppointment,
      targetDate: activeDrag.targetDate,
      targetTime: validation.resolvedTargetTime ?? activeDrag.targetTime,
    };

    setWeekSwapPreview(preview);

    Alert.alert(
      validation.targetAppointment
        ? 'Vuoi sostituire l’appuntamento?'
        : 'Vuoi spostare l’appuntamento?',
      validation.targetAppointment
        ? `${sourceAppointment.cliente} · ${sourceAppointment.ora} sostituisce ${validation.targetAppointment.cliente} · ${validation.targetAppointment.ora}`
        : `${sourceAppointment.cliente} · ${sourceAppointment.ora} → ${activeDrag.targetDate} · ${validation.resolvedTargetTime ?? activeDrag.targetTime}`,
      [
        {
          text: tApp(appLanguage, 'common_cancel'),
          style: 'cancel',
          onPress: () => {
            setWeekSwapPreview(null);
            resetWeekDrag();
          },
        },
        {
          text: 'Conferma',
          onPress: () => {
            runWeekSwap(preview);
          },
        },
      ]
    );
  }, [
    appointmentsById,
    appLanguage,
    cancelOwnerAppointmentForSalon,
    resetWeekDrag,
    runWeekSwap,
    salonWorkspace.salonCode,
    todayDate,
    updateBookingRequestStatusForSalon,
    updateWeekDragTarget,
    validateWeekSwapTarget,
    weekDragTouchOffsetX,
    weekDragTouchOffsetY,
  ]);

const completeWeekDrag = useCallback(() => {
  if (weekDragFinalizeHandledRef.current) {
    return;
  }

  weekDragFinalizeHandledRef.current = true;
  weekDragPanActiveRef.current = false;

  finalizeWeekDrag();
}, [finalizeWeekDrag]);

  const startWeekAppointmentDrag = useCallback(
  (
    appointment: AppuntamentoItem,
    sourceIndexes?: { dayIndex: number; rowIndex: number },
    touchPoint?: { absoluteX: number; absoluteY: number }
  ) => {
    const appointmentDate = appointment.data ?? todayDate;
    const dayIndex =
      sourceIndexes?.dayIndex ??
      weekVisibleDates.findIndex((item) => item.value === appointmentDate);
    const rowIndex =
      sourceIndexes?.rowIndex ??
      weekTimeSlots.findIndex((item) => item === appointment.ora);

    if (dayIndex < 0 || rowIndex < 0 || !touchPoint) return;

    updateWeekPlannerTableOrigin();

    const overlayHost = weekPlannerOverlayHostRef.current;
    if (!overlayHost) return;

    overlayHost.measureInWindow?.((hostX, hostY) => {
      weekPlannerOverlayOriginRef.current = { x: hostX, y: hostY };

      const resolvedTouchPoint = weekDragLatestPointerRef.current ?? touchPoint;
      const baseCardWidth = weekVisibleColWidthRef.current;
      const cardHeight = getWeekAppointmentBlockHeight(appointment);
      const usesDenseOperatorDragUi = !!weekDenseOperatorModeByDate[appointmentDate];
      const cardWidth = usesDenseOperatorDragUi
        ? Math.max(baseCardWidth, Math.min(132, baseCardWidth + 30))
        : baseCardWidth;
      const overlayHeight = usesDenseOperatorDragUi ? Math.max(cardHeight, 58) : cardHeight;

      const cardLeftRelative =
        36 +
        dayIndex * (weekVisibleColWidthRef.current + WEEK_PLANNER_COLUMN_GAP) -
        weekHorizontalScrollPosRef.current;

      const cardTopRelative =
        WEEK_PLANNER_DAY_HEADER_TOTAL_HEIGHT +
        rowIndex * (WEEK_PLANNER_ROW_HEIGHT + WEEK_PLANNER_ROW_GAP);

      const cardAbsoluteX = hostX + cardLeftRelative;
      const cardAbsoluteY = hostY + cardTopRelative;

      haptic.medium().catch(() => null);

      weekDragFinalizeHandledRef.current = false;
      weekDragMovedRef.current = false;
      weekDragPanActiveRef.current = true;
      weekDragDirectionRef.current = null;
      weekDragOutOfBoundsRef.current = false;
      weekLastLongPressAtRef.current = Date.now();
      isWeekPlannerDraggingRef.current = true;

      weekDragSourceIndexesRef.current = { dayIndex, rowIndex };
      weekDragSourceOverlayPositionRef.current = {
        left: cardLeftRelative,
        top: cardTopRelative,
      };

      const dragAnchorX = cardWidth / 2;
      const dragAnchorY = Math.max(14, Math.min(28, overlayHeight * 0.24));

      weekDragTouchOffsetX.value = dragAnchorX;
      weekDragTouchOffsetY.value = dragAnchorY;

      agendaVerticalScrollLockYRef.current = agendaVerticalScrollPosRef.current;
      weekHorizontalScrollLockXRef.current = weekHorizontalScrollPosRef.current;

      setWeekDragOverlayState({
        appointmentId: appointment.id,
        width: cardWidth,
        height: overlayHeight,
        usesDenseOperatorDragUi,
      });

      setWeekDragDeleteZoneActive(false);
      Animated.timing(weekDragDeleteZoneAnim, {
        toValue: 0,
        useNativeDriver: false,
        duration: 80,
      }).start();

      setIsWeekPlannerDragging(true);
      setIsWeekPlannerHorizontalScrolling(false);

      lockPageScrollForDrag();

      setTimeout(() => {
        lockPageScrollForDrag();
      }, 0);

      const initialOverlayLeft = resolvedTouchPoint.absoluteX - weekDragTouchOffsetX.value;
      const initialOverlayTop = resolvedTouchPoint.absoluteY - weekDragTouchOffsetY.value;

      weekDragOverlayLeft.value = initialOverlayLeft;
      weekDragOverlayTop.value = initialOverlayTop;
      weekDragOpacityValue.value = 1;
      weekDragScaleValue.value = withTiming(usesDenseOperatorDragUi ? 1.03 : 1, { duration: 40 });

      const nextDragState: WeekDragState = {
        appointmentId: appointment.id,
        sourceDate: appointmentDate,
        sourceTime: appointment.ora,
        targetDate: appointmentDate,
        targetTime: appointment.ora,
        invalidTarget: false,
      };

      weekDragStateRef.current = nextDragState;
      setWeekDragState(nextDragState);

      weekDragLastTargetRef.current = {
        date: appointmentDate,
        time: appointment.ora,
        invalidTarget: false,
      };

      weekDragLastCellKeyRef.current = null;

      queueWeekDragTargetUpdate(
        initialOverlayLeft,
        initialOverlayTop,
        resolvedTouchPoint.absoluteX,
        resolvedTouchPoint.absoluteY
      );
    });
  },
  [
    getWeekAppointmentBlockHeight,
    lockPageScrollForDrag,
    todayDate,
    updateWeekPlannerTableOrigin,
    weekDenseOperatorModeByDate,
    weekDragDeleteZoneAnim,
    weekDragOverlayLeft,
    weekDragOverlayTop,
    weekDragOpacityValue,
    weekDragScaleValue,
    weekDragTouchOffsetX,
    weekDragTouchOffsetY,
    weekTimeSlots,
    weekVisibleDates,
  ]
);

  const weekFloatingDragAnimatedStyle = useAnimatedStyle(() => ({
    left: weekDragOverlayLeft.value - weekPlannerOverlayOriginX.value,
    top: weekDragOverlayTop.value - weekPlannerOverlayOriginY.value,
    opacity: weekDragOpacityValue.value,
    transform: [{ scale: weekDragScaleValue.value }],
  }));

  const openWeekAppointmentDetails = useCallback((appointment: AppuntamentoItem) => {
    if (isWeekPlannerDraggingRef.current || weekDragStateRef.current !== null) {
      return;
    }
    setWeekAppointmentDetails(appointment);
  }, []);

  const triggerWeekAppointmentTapFeedback = useCallback(() => {
    haptic.light().catch(() => null);
  }, []);

  const getWeekAppointmentTone = useCallback((appointment: AppuntamentoItem) => {
    const accent = getAgendaServiceAccent(appointment.servizio);
    return {
      bg: accent.bg,
      border: accent.border,
      text: accent.text,
    };
  }, [getAgendaServiceAccent]);

  const operatorPhotoIndex = useMemo(() => {
    const nextIndex = new Map<string, string>();

    operatori.forEach((item) => {
      const normalizedPhotoUri = item.fotoUri?.trim();
      if (!normalizedPhotoUri) {
        return;
      }

      nextIndex.set(`id:${item.id}`, normalizedPhotoUri);
      const normalizedNameKey = normalizeOperatorNameKey(item.nome);
      if (normalizedNameKey) {
        nextIndex.set(`name:${normalizedNameKey}`, normalizedPhotoUri);
      }
    });

    return nextIndex;
  }, [operatori]);

  const getAppointmentOperatorPhotoUri = useCallback(
    (appointment: AppuntamentoItem) => {
      if (appointment.operatoreId) {
        const byId = operatorPhotoIndex.get(`id:${appointment.operatoreId}`);
        if (byId) {
          return byId;
        }
      }

      const normalizedOperatorKey = normalizeOperatorNameKey(appointment.operatoreNome);
      if (normalizedOperatorKey) {
        return operatorPhotoIndex.get(`name:${normalizedOperatorKey}`) ?? null;
      }

      return null;
    },
    [operatorPhotoIndex]
  );

  const renderWeekAppointmentSourceBadge = useCallback((appointment: AppuntamentoItem) => {
    if (appointment.sourceBadge === 'salon') {
      return (
        <View style={styles.weekAppointmentSourceBadgeWrap}>
          <View style={[styles.weekAppointmentSourceBadge, styles.weekAppointmentSourceBadgeSalon]}>
            <Text style={styles.weekAppointmentSourceBadgeSalonText}>Sal.</Text>
          </View>
        </View>
      );
    }

    if (appointment.sourceBadge === 'operator') {
      const operatorPhotoUri = getAppointmentOperatorPhotoUri(appointment);
      return (
        <View style={styles.weekAppointmentSourceBadgeWrap}>
          <View
            style={[
              styles.weekAppointmentSourceBadge,
              styles.weekAppointmentSourceBadgeOperator,
              operatorPhotoUri && styles.weekAppointmentSourceBadgeOperatorPhoto,
            ]}
          >
            {operatorPhotoUri ? (
              <Image source={{ uri: operatorPhotoUri }} style={styles.weekAppointmentSourceBadgeImage} />
            ) : (
              <Ionicons name="person" size={10} color="#0f172a" />
            )}
          </View>
        </View>
      );
    }

    return null;
  }, [getAppointmentOperatorPhotoUri]);

  const renderWeekAppointmentContent = useCallback(
    (
      appointment: AppuntamentoItem,
      blockHeight: number,
      blockWidthOverride?: number,
      contentMode: 'default' | 'lane' = 'default'
    ) => {
      const appointmentEndTime = getAppointmentEndTime(appointment);
      const appointmentTone = getWeekAppointmentTone(appointment);
      const effectiveBlockWidth = blockWidthOverride ?? weekVisibleColWidth;
      const safeWidth = Math.max(effectiveBlockWidth, 36);
      const safeHeight = Math.max(blockHeight, 28);
      const isLaneMode = contentMode === 'lane';
      const hasSourceBadge = !!appointment.sourceBadge;
      const topInset = hasSourceBadge ? (safeHeight <= 44 ? 18 : 24) : 0;
      const contentHeight = Math.max(safeHeight - topInset - (isLaneMode ? 3 : 6), 18);
      const contentWidth = Math.max(safeWidth - (isLaneMode ? 4 : 8), 24);
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const compactSlot = safeHeight <= 46 || safeWidth <= 54;
      const veryCompactSlot = safeHeight <= 34 || safeWidth <= 42;
      const clientLabel = appointment.cliente.trim().toUpperCase();
      const roleLabel = getServiceRequiredRole(appointment.servizio).trim().toUpperCase();
      const serviceLabel = appointment.servizio.trim().toUpperCase();
      const timeLabel = `${appointment.ora} ${appointmentEndTime}`;
      const roleTone = getServiceAccentByMeta({
        serviceName: appointment.servizio,
        roleName: roleLabel,
      });
      const detailLines = [
        { key: 'time', text: timeLabel, kind: 'time' as const },
        { key: 'client', text: clientLabel, kind: 'client' as const },
        { key: 'service', text: serviceLabel, kind: 'service' as const },
        {
          key: 'role',
          text: roleLabel && roleLabel !== serviceLabel ? roleLabel : '',
          kind: 'meta' as const,
        },
      ].filter((item) => item.text);

      const visibleLines = detailLines;
      const visibleCount = visibleLines.length;
      const verticalGap = clamp(contentHeight * 0.022, 0.5, isLaneMode ? 3 : 7);
      const usableHeight = Math.max(contentHeight - verticalGap * Math.max(0, visibleCount - 1), 12);
      const baseFontSize = clamp(
        Math.min(
          (usableHeight / visibleCount) * 0.78,
          contentWidth * (isLaneMode ? 0.125 : 0.145)
        ),
        isLaneMode ? 4.4 : 5,
        22
      );

      const estimateSingleLineFont = (
        text: string,
        width: number,
        kind: 'time' | 'operator' | 'client' | 'meta' | 'service'
      ) => {
        const effectiveChars = Math.max(text.trim().length, 1);
        const widthFactor =
          kind === 'client'
            ? 0.76
            : kind === 'time'
              ? 0.56
              : kind === 'service'
                ? 0.67
                : 0.62;

        return clamp((width - 4) / (effectiveChars * widthFactor), 5, 24);
      };

      const lineStyleForKind = (
        kind: 'time' | 'operator' | 'client' | 'meta' | 'service',
        text: string
      ) => {
        const multiplier =
          kind === 'client'
            ? 1.18
            : kind === 'time'
              ? 0.98
              : kind === 'operator'
                ? 0.94
                : kind === 'service'
                  ? 0.9
                  : 0.86;

        const fontSize = clamp(
          Math.min(baseFontSize * multiplier, estimateSingleLineFont(text, contentWidth, kind)),
          isLaneMode ? 4.2 : veryCompactSlot ? 5.8 : 6.4,
          kind === 'client' ? 24 : kind === 'time' ? 18 : 17
        );

        return {
          fontSize,
          lineHeight: clamp(fontSize * 1.04, fontSize + 0.2, fontSize + 4),
        };
      };

      const renderLine = (
        item: (typeof visibleLines)[number],
        index: number,
        extraStyle?: Record<string, unknown>
      ) => {
        const dynamic = lineStyleForKind(item.kind, item.text);

        return (
          <Text
            key={`${appointment.id}-${item.key}-${index}`}
            style={[
              styles.weekAppointmentUniversalLine,
              item.kind === 'time' && styles.weekAppointmentUniversalTime,
              item.kind === 'client' && styles.weekAppointmentUniversalClient,
              item.kind === 'meta' && styles.weekAppointmentUniversalMeta,
              item.kind === 'service' && styles.weekAppointmentUniversalService,
              dynamic,
              item.kind === 'service' && { color: appointmentTone.text },
              item.kind === 'meta' && { color: roleTone.text },
              extraStyle,
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.08}
          >
            {item.text}
          </Text>
        );
      };

      return (
        <View
          style={[
            styles.weekAppointmentUniversalPressable,
            hasSourceBadge && styles.weekAppointmentUniversalPressableWithBadge,
            styles.weekAppointmentUniversalVertical,
            isLaneMode && styles.weekAppointmentUniversalPressableLane,
          ]}
        >
          {hasSourceBadge ? renderWeekAppointmentSourceBadge(appointment) : null}
          <View style={styles.weekAppointmentUniversalStack}>
            {visibleLines.map((item, index) =>
              renderLine(item, index, {
                marginTop: index === 0 ? 0 : verticalGap,
              })
            )}
          </View>
        </View>
      );
    },
    [
      getAppointmentEndTime,
      getServiceRequiredRole,
      getWeekAppointmentTone,
      getServiceAccentByMeta,
      renderWeekAppointmentSourceBadge,
      weekVisibleColWidth,
    ]
  );

  const buildWeekAppointmentGesture = useCallback(
    (appointment: AppuntamentoItem, dayIndex: number, rowIndex: number, isPendingRequestBlock: boolean) => {
      const appointmentDate = appointment.data ?? todayDate;
      const canDrag =
        isAppointmentInFuture(appointment, todayDate) &&
        !weekDenseOperatorModeByDate[appointmentDate];
      const sourceIndexes = { dayIndex, rowIndex };

      const panGesture = Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart((event) => {
          'worklet';
          if (isPendingRequestBlock || !canDrag) {
            return;
          }

          runOnJS(startWeekAppointmentDrag)(appointment, sourceIndexes, {
            absoluteX: event.absoluteX,
            absoluteY: event.absoluteY,
          });
        })
        .onUpdate((event) => {
          'worklet';
          const nextLeft = event.absoluteX - weekDragTouchOffsetX.value;
          const nextTop = event.absoluteY - weekDragTouchOffsetY.value;

          weekDragOverlayLeft.value = nextLeft;
          weekDragOverlayTop.value = nextTop;

          runOnJS(queueWeekDragTargetUpdate)(
            nextLeft,
            nextTop,
            event.absoluteX,
            event.absoluteY
          );
        })
        .onEnd(() => {
          'worklet';
          runOnJS(completeWeekDrag)();
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(completeWeekDrag)();
        });

      const tapGesture = Gesture.Tap()
        .maxDuration(220)
        .maxDeltaX(10)
        .maxDeltaY(10)
        .onBegin(() => {
          'worklet';
          runOnJS(triggerWeekAppointmentTapFeedback)();
        })
        .onEnd((_event, success) => {
          'worklet';
          if (!success) {
            return;
          }

          runOnJS(openWeekAppointmentDetails)(appointment);
        });

      return Gesture.Exclusive(panGesture, tapGesture);
    },
    [
      completeWeekDrag,
      startWeekAppointmentDrag,
      queueWeekDragTargetUpdate,
      triggerWeekAppointmentTapFeedback,
      weekDenseOperatorModeByDate,
      weekDragOverlayLeft,
      weekDragOverlayTop,
      todayDate,
    ]
  );

  const quickBookingCompatibleOperators = useMemo(() => {
    if (!quickSlotDraft || !selectedQuickService) return [];

    return getEligibleOperatorsForService({
      serviceName: selectedQuickService.nome,
      services: servizi,
      operators: operatori,
      appointmentDate: quickSlotDraft.date,
      settings: availabilitySettings,
    }).filter((operator) =>
      canScheduleServiceAtSlot({
        dateValue: quickSlotDraft.date,
        startTime: quickSlotDraft.time,
        serviceName: selectedQuickService.nome,
        selectedOperatorId: operator.id,
      })
    );
  }, [
    availabilitySettings,
    canScheduleServiceAtSlot,
    operatori,
    quickSlotDraft,
    selectedQuickService,
    servizi,
  ]);

  const quickBookingUsesOperators =
    !!selectedQuickService &&
    operatori.length > 0 &&
    doesServiceUseOperators(selectedQuickService.nome, servizi) &&
    quickBookingCompatibleOperators.length > 0;

  const selectedQuickBookingOperator = useMemo(
    () =>
      quickBookingCompatibleOperators.find((item) => item.id === quickBookingOperatorId) ??
      (quickBookingCompatibleOperators.length === 1 ? quickBookingCompatibleOperators[0] : undefined),
    [quickBookingCompatibleOperators, quickBookingOperatorId]
  );

  const quickBookingCanConfirm = useMemo(() => {
    if (!quickSlotDraft || !selectedQuickService || !selectedQuickCustomer) return false;

    return canScheduleServiceAtSlot({
      dateValue: quickSlotDraft.date,
      startTime: quickSlotDraft.time,
      serviceName: selectedQuickService.nome,
      selectedOperatorId: selectedQuickBookingOperator?.id ?? null,
    });
  }, [
    canScheduleServiceAtSlot,
    quickSlotDraft,
    selectedQuickBookingOperator,
    selectedQuickCustomer,
    selectedQuickService,
  ]);

  useEffect(() => {
    if (!quickBookingUsesOperators || quickBookingCompatibleOperators.length === 0) {
      setQuickBookingOperatorId('');
      return;
    }

    const nextOperator =
      quickBookingCompatibleOperators.find((item) => item.id === quickBookingOperatorId) ??
      quickBookingCompatibleOperators[0];

    if (nextOperator && nextOperator.id !== quickBookingOperatorId) {
      setQuickBookingOperatorId(nextOperator.id);
    }
  }, [quickBookingCompatibleOperators, quickBookingOperatorId, quickBookingUsesOperators]);

  const openQuickSlotModal = useCallback(
    (dateValue: string, slotTime: string, _operatorIdValue?: string | null) => {
      setQuickSlotDraft({
        date: dateValue,
        time: slotTime,
        preferredOperatorId: null,
      });
      setQuickBookingServiceId('');
      setQuickBookingCustomerId('');
      setQuickBookingOperatorId('');
      setShowQuickCustomerComposer(false);
      setQuickCustomerNameInput('');
      setQuickCustomerPhoneInput('');
      setQuickCustomerEmailInput('');
    },
    []
  );

  const closeQuickSlotModal = useCallback(() => {
    setQuickSlotDraft(null);
    setQuickBookingServiceId('');
    setQuickBookingCustomerId('');
    setQuickBookingOperatorId('');
    setQuickServiceSearchQuery('');
    setShowQuickCustomerComposer(false);
    setQuickCustomerNameInput('');
    setQuickCustomerPhoneInput('');
    setQuickCustomerEmailInput('');
  }, []);

  const closeWeekAppointmentDetails = useCallback(() => {
    setWeekAppointmentDetails(null);
    if (weekPendingAction !== null) {
      setWeekPendingAction(null);
    }
    if (isWeekPlannerDraggingRef.current || weekDragStateRef.current !== null) {
      resetWeekDrag();
    }
    weekLastLongPressAtRef.current = 0;
  }, [resetWeekDrag, weekPendingAction]);

  const weekAppointmentPendingRequestId = useMemo(() => {
    if (!weekAppointmentDetails?.id.startsWith('pending-')) {
      return null;
    }

    return weekAppointmentDetails.id.replace(/^pending-/, '');
  }, [weekAppointmentDetails]);

  const weekAppointmentPendingRequest = useMemo(() => {
    if (!weekAppointmentPendingRequestId) {
      return null;
    }

    return (
      richiestePrenotazione.find(
        (item) => item.id === weekAppointmentPendingRequestId && item.stato === 'In attesa'
      ) ?? null
    );
  }, [weekAppointmentPendingRequestId, richiestePrenotazione]);

  const weekAppointmentDetailsIsPast = useMemo(
    () => (weekAppointmentDetails ? !isAppointmentInFuture(weekAppointmentDetails, todayDate) : false),
    [todayDate, weekAppointmentDetails]
  );

  const weekAppointmentEditMoveOptions = useMemo(() => {
    if (!weekAppointmentEditDraft || !weekAppointmentEditDate) {
      return [] as Array<{
        time: string;
        replacedAppointmentId?: string;
        replacedAppointmentLabel?: string;
      }>;
    }

    const optionMap = new Map<
      string,
      {
        time: string;
        replacedAppointmentId?: string;
        replacedAppointmentLabel?: string;
      }
    >();

    buildDisplayTimeSlots(availabilitySettings, weekAppointmentEditDate).forEach((slotTime) => {
      const validation = validateWeekSwapTarget({
        sourceAppointment: weekAppointmentEditDraft,
        targetDate: weekAppointmentEditDate,
        targetTime: slotTime,
      });

      if (!validation.valid) {
        return;
      }

      const resolvedTime = validation.resolvedTargetTime ?? slotTime;
      if (
        weekAppointmentEditDate === (weekAppointmentEditDraft.data ?? todayDate) &&
        resolvedTime === weekAppointmentEditDraft.ora
      ) {
        return;
      }

      if (optionMap.has(resolvedTime)) {
        return;
      }

      optionMap.set(resolvedTime, {
        time: resolvedTime,
        replacedAppointmentId: validation.targetAppointment?.id,
        replacedAppointmentLabel: validation.targetAppointment
          ? `${validation.targetAppointment.cliente} · ${validation.targetAppointment.servizio}`
          : undefined,
      });
    });

    return Array.from(optionMap.values()).sort((first, second) =>
      timeToMinutes(first.time) - timeToMinutes(second.time)
    );
  }, [
    availabilitySettings,
    todayDate,
    validateWeekSwapTarget,
    weekAppointmentEditDate,
    weekAppointmentEditDraft,
  ]);

  const weekAppointmentEditAvailableSlots = useMemo(
    () => weekAppointmentEditMoveOptions.map((item) => item.time),
    [weekAppointmentEditMoveOptions]
  );

  useEffect(() => {
    if (!weekAppointmentEditDraft || !weekAppointmentEditDate) {
      return;
    }

    if (weekAppointmentEditAvailableSlots.length === 0) {
      if (weekAppointmentEditTime !== '') {
        setWeekAppointmentEditTime('');
      }
      return;
    }

    if (!weekAppointmentEditAvailableSlots.includes(weekAppointmentEditTime)) {
      setWeekAppointmentEditTime(weekAppointmentEditAvailableSlots[0]);
    }
  }, [
    weekAppointmentEditAvailableSlots,
    weekAppointmentEditDate,
    weekAppointmentEditDraft,
    weekAppointmentEditTime,
  ]);

  const closeWeekAppointmentEditModal = useCallback(() => {
    setWeekAppointmentEditDraft(null);
    setWeekAppointmentEditDate('');
    setWeekAppointmentEditTime('');
    if (calendarSelectionMode !== 'agenda') {
      setCalendarSelectionMode('agenda');
    }
  }, []);

  const editWeekAppointmentFromDetails = useCallback(() => {
    if (!weekAppointmentDetails || weekAppointmentPendingRequest) {
      return;
    }

    const appointmentDate = weekAppointmentDetails.data ?? todayDate;
    setWeekAppointmentEditDraft(weekAppointmentDetails);
    setWeekAppointmentEditDate(appointmentDate);
    setWeekAppointmentEditTime(weekAppointmentDetails.ora);
    closeWeekAppointmentDetails();
  }, [closeWeekAppointmentDetails, todayDate, weekAppointmentDetails, weekAppointmentPendingRequest]);

  const confirmWeekAppointmentEdit = useCallback(() => {
    if (!weekAppointmentEditDraft || !weekAppointmentEditDate || !weekAppointmentEditTime) {
      return;
    }

    const selectedMoveOption =
      weekAppointmentEditMoveOptions.find((item) => item.time === weekAppointmentEditTime) ?? null;

    if (!selectedMoveOption) {
      Alert.alert(
        'Slot non disponibile',
        'Questo appuntamento non entra nello slot selezionato. Scegli un altro giorno o un altro orario.'
      );
      return;
    }

    void moveOwnerAppointmentForSalon({
      salonCode: salonWorkspace.salonCode,
      appointmentId: weekAppointmentEditDraft.id,
      replacedAppointmentId: selectedMoveOption.replacedAppointmentId,
      currentDate: weekAppointmentEditDraft.data ?? todayDate,
      currentTime: weekAppointmentEditDraft.ora,
      nextDate: weekAppointmentEditDate,
      nextTime: weekAppointmentEditTime,
      customerName: weekAppointmentEditDraft.cliente,
      serviceName: weekAppointmentEditDraft.servizio,
    }).then((result) => {
      if (!result.ok) {
        Alert.alert('Spostamento non riuscito', result.error ?? "Non sono riuscito a spostare l'appuntamento.");
        return;
      }

      setData(weekAppointmentEditDate);
      setCalendarMonth(weekAppointmentEditDate);
      setWeekAppointmentDetails((current) =>
        current && current.id === weekAppointmentEditDraft.id
          ? {
              ...current,
              data: weekAppointmentEditDate,
              ora: weekAppointmentEditTime,
            }
          : current
      );
      closeWeekAppointmentEditModal();
      closeWeekAppointmentDetails();
      haptic.success().catch(() => null);
    });
  }, [
    closeWeekAppointmentDetails,
    closeWeekAppointmentEditModal,
    haptic,
    moveOwnerAppointmentForSalon,
    salonWorkspace.salonCode,
    todayDate,
    weekAppointmentEditDate,
    weekAppointmentEditDraft,
    weekAppointmentEditMoveOptions,
    weekAppointmentEditTime,
  ]);

  const updatePendingRequestFromWeekDetails = useCallback(
    async (status: 'Accettata' | 'Rifiutata', ignoreConflicts = false) => {
      if (!weekAppointmentPendingRequestId || weekPendingAction) {
        return;
      }

      setWeekPendingAction(status);

      try {
        const result = await updateBookingRequestStatusForSalon({
          salonCode: salonWorkspace.salonCode,
          requestId: weekAppointmentPendingRequestId,
          status,
          ignoreConflicts,
        });

        if (!result?.ok) {
          const errorText = (result?.error ?? '').toLowerCase();
          if (status === 'Accettata' && !ignoreConflicts && /accavalla|sovrapp|conflitt/.test(errorText)) {
            Alert.alert(
              'Conflitto orario',
              result?.error ?? 'Questa richiesta si accavalla con un appuntamento esistente.',
              [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: 'Accetta comunque',
                  style: 'destructive',
                  onPress: () => {
                    void updatePendingRequestFromWeekDetails('Accettata', true);
                  },
                },
              ]
            );
            return;
          }

          Alert.alert(
            'Aggiornamento non riuscito',
            result?.error ??
              (status === 'Accettata'
                ? 'Non sono riuscito ad accettare la richiesta.'
                : 'Non sono riuscito a rifiutare la richiesta.')
          );
          return;
        }

        haptic.success().catch(() => null);
        closeWeekAppointmentDetails();
      } catch {
        Alert.alert('Aggiornamento non riuscito', 'Si e verificato un errore imprevisto.');
      } finally {
        setWeekPendingAction(null);
      }
    },
    [
      closeWeekAppointmentDetails,
      salonWorkspace.salonCode,
      updateBookingRequestStatusForSalon,
      weekAppointmentPendingRequestId,
      weekPendingAction,
    ]
  );

  const commitAppointmentRecord = useCallback(
    async ({
      dateValue,
      timeValue,
      customerName,
      customerRecord,
      serviceName,
      priceValue,
      operatorIdValue,
      operatorNameValue,
      machineryIdsValue,
      machineryNamesValue,
    }: {
      dateValue: string;
      timeValue: string;
      customerName: string;
      customerRecord?: {
        telefono: string;
        email?: string;
        instagram?: string;
        nota?: string;
        fonte?: 'salone' | 'frontend';
      } | null;
      serviceName: string;
      priceValue: number;
      operatorIdValue?: string;
      operatorNameValue?: string;
      machineryIdsValue?: string[];
      machineryNamesValue?: string[];
    }) => {
      const usesOperatorSchedulingForAppointment =
        operatori.length > 0 && doesServiceUseOperators(serviceName.trim(), servizi);

      const hardConflict = findConflictingAppointment({
        appointmentDate: dateValue,
        startTime: timeValue,
        serviceName: serviceName.trim(),
        selectedOperatorId: usesOperatorSchedulingForAppointment ? operatorIdValue ?? null : null,
        selectedOperatorName:
          usesOperatorSchedulingForAppointment ? operatorNameValue ?? null : null,
      });

      if (hardConflict) {
        return {
          ok: false,
          error: `Questo appuntamento si accavalla con ${hardConflict.cliente} alle ${hardConflict.ora}.`,
        };
      }

      const normalizedMachineryIds = (machineryIdsValue ?? []).filter((item) =>
        activeMachineryMap.has(item)
      );

      if ((machineryIdsValue ?? []).length !== normalizedMachineryIds.length) {
        return {
          ok: false,
          error: 'Almeno un macchinario richiesto non e attivo. Riattivalo prima di salvare.',
        };
      }

      if (normalizedMachineryIds.length > 0) {
        const newStart = timeToMinutes(timeValue);
        const newEnd = newStart + getServiceDuration(serviceName.trim());
        const machineryConflict = appuntamenti.find((item) => {
          if ((item.data ?? todayDate) !== dateValue) return false;

          const existingStart = timeToMinutes(item.ora);
          const existingEnd =
            existingStart +
            (typeof item.durataMinuti === 'number'
              ? item.durataMinuti
              : getServiceDuration(item.servizio));

          if (!(newStart < existingEnd && newEnd > existingStart)) {
            return false;
          }

          const occupiedMachineryIds =
            (item.macchinarioIds ?? []).length > 0
              ? item.macchinarioIds ?? []
              : getServiceRequiredMachineryIds(item.servizio);

          return normalizedMachineryIds.some((machineryId) =>
            occupiedMachineryIds.includes(machineryId)
          );
        });

        if (machineryConflict) {
          return {
            ok: false,
            error: `Macchinario occupato da ${machineryConflict.cliente} alle ${machineryConflict.ora}. Scegli un altro orario.`,
          };
        }
      }

      const normalizedCustomerName = customerName.trim();
      const clienteRegistrato =
        customerRecord ??
        clienti.find(
          (item) =>
            item.nome.trim().toLowerCase() === normalizedCustomerName.toLowerCase()
        ) ??
        null;
      const createBookingRequest =
        clienteRegistrato?.fonte === 'frontend' &&
        !!clienteRegistrato.telefono.trim() &&
        !!(clienteRegistrato.email ?? '').trim();

      return createOwnerAppointmentForSalon({
        salonCode: salonWorkspace.salonCode,
        dateValue,
        timeValue,
        customerName: normalizedCustomerName,
        customerPhone: clienteRegistrato?.telefono ?? '',
        customerEmail: clienteRegistrato?.email ?? '',
        customerInstagram: clienteRegistrato?.instagram ?? '',
        customerNote: clienteRegistrato?.nota ?? '',
        customerSource: clienteRegistrato?.fonte ?? 'salone',
        createCustomerRecord: !!clienteRegistrato,
        createBookingRequest,
        serviceName: serviceName.trim(),
        priceValue,
        durationMinutes: getServiceDuration(serviceName.trim()),
        operatorId: operatorIdValue,
        operatorName: operatorNameValue,
        machineryIds: machineryIdsValue,
        machineryNames: machineryNamesValue,
      });
    },
    [
      activeMachineryMap,
      appuntamenti,
      clienti,
      createOwnerAppointmentForSalon,
      doesServiceUseOperators,
      findConflictingAppointment,
      getServiceDuration,
      getServiceRequiredMachineryIds,
      operatori.length,
      salonWorkspace.salonCode,
      todayDate,
      servizi,
    ]
  );

  const addCustomerFromQuickBooking = useCallback(() => {
    const invalidFields: string[] = [];
    const nextErrors: {
      nome?: string;
      telefono?: string;
      email?: string;
    } = {};

    if (!quickCustomerNameInput.trim()) {
      invalidFields.push('Nome cliente obbligatorio');
      nextErrors.nome = 'Nome cliente obbligatorio';
    }

    if (!quickCustomerPhoneInput.trim()) {
      invalidFields.push('Numero di telefono obbligatorio');
      nextErrors.telefono = 'Numero di telefono obbligatorio';
    } else if (!isValidPhone10(quickCustomerPhoneInput)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
      nextErrors.telefono = 'Numero di telefono errato (deve avere 10 cifre)';
    }

    if (quickCustomerEmailInput.trim() && !isValidEmail(quickCustomerEmailInput)) {
      invalidFields.push('Email non valida');
      nextErrors.email = 'Email non valida';
    }

    if (invalidFields.length > 0) {
      setQuickCustomerErrors(nextErrors);
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setQuickCustomerErrors({});

    const nextId = `cliente-${Date.now()}`;
    setClienti((current) => [
      {
        id: nextId,
        nome: quickCustomerNameInput.trim(),
        telefono: quickCustomerPhoneInput.trim(),
        email: quickCustomerEmailInput.trim(),
        instagram: '',
        birthday: '',
        nota: '',
        fonte: 'salone',
        viewedBySalon: true,
        annullamentiCount: 0,
        inibito: false,
      },
      ...current,
    ]);
    setQuickBookingCustomerId(nextId);
    setShowQuickCustomerComposer(false);
    setQuickCustomerNameInput('');
    setQuickCustomerPhoneInput('');
    setQuickCustomerEmailInput('');
  }, [quickCustomerEmailInput, quickCustomerNameInput, quickCustomerPhoneInput, setClienti]);

  const addCustomerFromAgenda = useCallback(() => {
    const invalidFields: string[] = [];
    const nextErrors: {
      nome?: string;
      telefono?: string;
      email?: string;
    } = {};

    if (!agendaCustomerNameInput.trim()) {
      invalidFields.push('Nome cliente obbligatorio');
      nextErrors.nome = 'Nome cliente obbligatorio';
    }

    if (!agendaCustomerPhoneInput.trim()) {
      invalidFields.push('Numero di telefono obbligatorio');
      nextErrors.telefono = 'Numero di telefono obbligatorio';
    } else if (!isValidPhone10(agendaCustomerPhoneInput)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
      nextErrors.telefono = 'Numero di telefono errato (deve avere 10 cifre)';
    }

    if (agendaCustomerEmailInput.trim() && !isValidEmail(agendaCustomerEmailInput)) {
      invalidFields.push('Email non valida');
      nextErrors.email = 'Email non valida';
    }

    if (invalidFields.length > 0) {
      setAgendaCustomerErrors(nextErrors);
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setAgendaCustomerErrors({});

    const nextCustomerName = agendaCustomerNameInput.trim();

    setClienti((current) => [
      {
        id: `cliente-${Date.now()}`,
        nome: nextCustomerName,
        telefono: agendaCustomerPhoneInput.trim(),
        email: agendaCustomerEmailInput.trim(),
        instagram: '',
        birthday: '',
        nota: '',
        fonte: 'salone',
        viewedBySalon: true,
        annullamentiCount: 0,
        inibito: false,
      },
      ...current,
    ]);

    setCliente(nextCustomerName);
    setCampoAttivo(null);
    setShowAgendaCustomerComposer(false);
    setAgendaCustomerNameInput('');
    setAgendaCustomerPhoneInput('');
    setAgendaCustomerEmailInput('');
    setTimeout(scrollAgendaToService, 120);
  }, [
    agendaCustomerEmailInput,
    agendaCustomerNameInput,
    agendaCustomerPhoneInput,
    scrollAgendaToService,
    setClienti,
  ]);

  const addServiceFromAgenda = useCallback(() => {
    if (!agendaServiceNameInput.trim() || !agendaServicePriceInput.trim() || !agendaServiceDurationInput.trim()) {
      Alert.alert('Dati mancanti', 'Inserisci nome, prezzo e durata del servizio.');
      return;
    }

    const nextPrice = Number(agendaServicePriceInput.replace(',', '.'));
    const nextOriginalPrice = agendaServiceOriginalPriceInput.trim()
      ? Number(agendaServiceOriginalPriceInput.replace(',', '.'))
      : null;
    const nextDuration = Number(agendaServiceDurationInput.replace(',', '.'));

    if (
      Number.isNaN(nextPrice) ||
      (nextOriginalPrice !== null && Number.isNaN(nextOriginalPrice)) ||
      Number.isNaN(nextDuration) ||
      nextPrice < 0 ||
      nextDuration <= 0
    ) {
      Alert.alert('Valori non validi', 'Controlla prezzo, prezzo pieno e durata del nuovo servizio.');
      return;
    }

    if (!agendaServiceRoleInput.trim()) {
      Alert.alert('Mestiere obbligatorio', 'Inserisci il mestiere richiesto del servizio.');
      return;
    }

    const normalizedName = normalizeServiceName(agendaServiceNameInput);
    const alreadyExists = servizi.some(
      (item) => normalizeServiceName(item.nome) === normalizedName
    );

    if (alreadyExists) {
      Alert.alert('Servizio gia presente', 'Esiste gia un servizio con questo nome.');
      return;
    }

    const roundedDuration = Math.round(nextDuration);
    const effectiveDateForSlotStep = quickSlotDraft?.date || data;
    const currentSlotInterval = getSlotIntervalForDate(availabilitySettings, effectiveDateForSlotStep);
    const compatibleSlotIntervals = SLOT_INTERVAL_OPTIONS.filter(
      (option) => roundedDuration % option === 0
    );
    const suggestedSlotInterval = compatibleSlotIntervals[0] ?? null;
    const lowerCompatibleDuration =
      Math.floor(roundedDuration / currentSlotInterval) * currentSlotInterval;
    const upperCompatibleDuration =
      Math.ceil(roundedDuration / currentSlotInterval) * currentSlotInterval;

    const finalizeServiceSave = () => {
      const nextServiceName = agendaServiceNameInput.trim();
      const nextServicePriceLabel = nextPrice.toFixed(2);
      const nextServiceId = `servizio-${Date.now()}`;
      const nextServiceRole = agendaServiceRoleInput.trim();
      const nextService = {
        id: nextServiceId,
        nome: nextServiceName,
        prezzo: nextPrice,
        prezzoOriginale:
          nextOriginalPrice !== null && nextOriginalPrice > nextPrice ? nextOriginalPrice : undefined,
        durataMinuti: roundedDuration,
        mestiereRichiesto: nextServiceRole,
      };

      setServizi((current) => [
        nextService,
        ...current,
      ]);

      if (servicePickerTarget === 'quick') {
        setQuickBookingServiceId(nextServiceId);
        setQuickBookingOperatorId('');
      } else {
        setServizio(nextServiceName);
        setPrezzo(nextServicePriceLabel);
      }

      closeServicePicker();
      setShowAgendaServiceComposer(false);
      setAgendaServiceNameInput('');
      setAgendaServicePriceInput('');
      setAgendaServiceOriginalPriceInput('');
      setAgendaServiceDurationInput('60');
      setAgendaServiceRoleInput('');

      if (
        shouldWarnAgendaAboutMissingOperatorsForRole({
          roleName: nextServiceRole,
          services: [
            ...servizi,
            {
              mestiereRichiesto: nextServiceRole,
            },
          ],
          operators: operatori,
        })
      ) {
        Alert.alert(
          'Operatore da collegare',
          `Hai salvato il servizio con mestiere "${nextServiceRole}" in un salone con più mestieri, ma non esiste ancora nessun operatore con quel mestiere. Se non lo imposti, dal frontend il cliente potrebbe non trovare slot prenotabili.`
        );
      }

      if (servicePickerTarget === 'quick') {
        haptic.success().catch(() => null);
        Alert.alert('Servizio aggiunto', 'Servizio aggiunto correttamente.');
        return;
      }

      Alert.alert('Servizio aggiunto', 'Servizio aggiunto correttamente.');
      setTimeout(scrollAgendaToTime, 120);
    };

    if (roundedDuration % currentSlotInterval !== 0) {
      const mismatchMessage =
        suggestedSlotInterval !== null
          ? `Hai inserito un servizio da ${roundedDuration} min, ma il passo slot attuale e di ${currentSlotInterval} min. Se lo aggiungi cosi vai fuori orario slot e la griglia non combacia.\n\nTi consiglio di impostare il passo slot a ${suggestedSlotInterval} min prima di salvare il servizio.`
          : `Hai inserito un servizio da ${roundedDuration} min, ma il passo slot attuale e di ${currentSlotInterval} min. Se lo aggiungi cosi vai fuori orario slot e la griglia non combacia.\n\nCon gli slot standard disponibili non c'e un passo che si allinea perfettamente a ${roundedDuration} min. Ti conviene cambiare la durata del servizio a ${lowerCompatibleDuration > 0 ? lowerCompatibleDuration : currentSlotInterval} min oppure ${upperCompatibleDuration} min.`;

      Alert.alert(
        'Durata fuori griglia slot',
        mismatchMessage,
        [
          {
            text: 'Annulla',
            style: 'cancel',
          },
          ...(suggestedSlotInterval !== null
            ? [
                {
                  text: `Metti slot ${suggestedSlotInterval} min`,
                  onPress: () => setShowSlotIntervalPicker(true),
                },
              ]
            : []),
        ]
      );
      return;
    }

    finalizeServiceSave();
  }, [
    agendaServiceDurationInput,
    agendaServiceNameInput,
    agendaServiceOriginalPriceInput,
    agendaServicePriceInput,
    agendaServiceRoleInput,
    availabilitySettings,
    closeServicePicker,
    data,
    haptic,
    operatori,
    quickSlotDraft,
    scrollAgendaToTime,
    servicePickerTarget,
    servizi,
    setServizi,
  ]);

  const confirmQuickSlotBooking = useCallback(() => {
    if (!quickSlotDraft || !selectedQuickService || !selectedQuickCustomer) {
      Alert.alert(
        'Dati mancanti',
        'Seleziona uno slot, un servizio e un cliente prima di confermare.'
      );
      return;
    }

    if (
      !canScheduleServiceAtSlot({
        dateValue: quickSlotDraft.date,
        startTime: quickSlotDraft.time,
        serviceName: selectedQuickService.nome,
        selectedOperatorId: selectedQuickBookingOperator?.id ?? null,
      })
    ) {
      Alert.alert(
        'Slot non disponibile',
        'Questo servizio non entra piu nello slot selezionato. Scegli un altro orario o un altro operatore.'
      );
      return;
    }

    void (async () => {
      const requiredMachineryIds = getServiceRequiredMachineryIds(selectedQuickService.nome).filter((item) =>
        activeMachineryMap.has(item)
      );
      const result = await commitAppointmentRecord({
        dateValue: quickSlotDraft.date,
        timeValue: quickSlotDraft.time,
        customerName: selectedQuickCustomer.nome,
        customerRecord: selectedQuickCustomer,
        serviceName: selectedQuickService.nome,
        priceValue: selectedQuickService.prezzo,
        operatorIdValue: selectedQuickBookingOperator?.id,
        operatorNameValue: selectedQuickBookingOperator?.nome,
        machineryIdsValue: requiredMachineryIds,
        machineryNamesValue: requiredMachineryIds
          .map((item) => activeMachineryMap.get(item)?.nome ?? '')
          .filter(Boolean),
      });

      if (!result?.ok) {
        Alert.alert(
          'Salvataggio non riuscito',
          result?.error ?? 'Non sono riuscito a creare l’appuntamento.'
        );
        return;
      }

      setData(quickSlotDraft.date);
      setCalendarMonth(quickSlotDraft.date);
      setAgendaView('week');
      closeQuickSlotModal();
    })();
  }, [
    activeMachineryMap,
    canScheduleServiceAtSlot,
    closeQuickSlotModal,
    commitAppointmentRecord,
    getServiceRequiredMachineryIds,
    quickSlotDraft,
    selectedQuickBookingOperator,
    selectedQuickCustomer,
    selectedQuickService,
  ]);

  const isDateFullyBooked = (dateValue: string) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
    if (availability.closed) return false;

    const dayDisplaySlots = buildDisplayTimeSlots(availabilitySettings, dateValue);

    const candidateSlots = dayDisplaySlots.filter((slotTime) => {
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return false;
      if (
        servizio.trim() &&
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio),
        })
      ) {
        return false;
      }
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return false;
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return false;
      return true;
    });

    if (candidateSlots.length === 0) return true;

    if (servizio.trim()) {
      return candidateSlots.every(
        (slotTime) =>
          getSlotAvailableCount({
            dateValue,
            startTime: slotTime,
            serviceName: servizio,
            selectedOperatorId: operatoreId || null,
          }) === 0
      );
    }

    const appointmentsForDate = appointmentsByDate[dateValue] ?? [];

    return candidateSlots.every((slotTime) =>
      appointmentsForDate.some((item) => doesAppointmentOccupySlot(item, slotTime))
    );
  };

  const applySlotIntervalChange = useCallback(
    (nextInterval: number) => {
      if (!canCustomizeSelectedDateHours()) {
        setShowSlotIntervalPicker(false);
        return;
      }

      const protectedDates = Array.from(protectedSlotIntervalDates);

      Alert.alert(
        'Conferma modifica passo slot',
        "Sei sicuro che per le giornate in cui non sono presenti appuntamenti vuoi modificare il passo slot orario? Le giornate con appuntamenti o richieste già accettate manterranno il passo attuale.",
        [
          {
            text: 'No',
            style: 'cancel',
          },
          {
            text: 'Sì',
            onPress: () => {
              setAvailabilitySettings((current) => {
                const nextProtectedOverrides = protectedDates.map((dateValue) => ({
                  date: dateValue,
                  slotIntervalMinutes: getSlotIntervalForDate(current, dateValue),
                }));

                const preservedPastOverrides = current.dateSlotIntervals.filter(
                  (item) => item.date < todayDate && !protectedSlotIntervalDates.has(item.date)
                );

                return {
                  ...current,
                  slotIntervalMinutes: nextInterval,
                  dateSlotIntervals: [...preservedPastOverrides, ...nextProtectedOverrides],
                };
              });
              setShowSlotIntervalPicker(false);
            },
          },
        ]
      );
    },
    [canCustomizeSelectedDateHours, protectedSlotIntervalDates, setAvailabilitySettings, todayDate]
  );

  const getAppuntamentiPerSlot = (slotTime: string) =>
    appuntamentiDelGiorno.filter((item) => doesAppointmentOccupySlot(item, slotTime));

  const appuntamentoInConflitto =
    data.trim() && ora.trim() && servizio.trim()
      ? findConflictingAppointment({
          appointmentDate: data,
          startTime: ora,
          serviceName: servizio,
          selectedOperatorId: serviceUsesOperatorScheduling ? operatoreId : null,
          selectedOperatorName: serviceUsesOperatorScheduling ? operatoreNome : null,
        })
      : null;

  const selectedDateAvailability = useMemo(
    () => getDateAvailabilityInfo(availabilitySettings, data),
    [availabilitySettings, data]
  );
  const agendaAvailableStartTimes = useMemo(() => {
    if (!data.trim() || !servizio.trim() || selectedDateAvailability.closed) {
      return [] as string[];
    }

    return getAvailableStartTimesForService({
      dateValue: data,
      serviceName: servizio,
      selectedOperatorId: serviceUsesOperatorScheduling ? operatoreId || null : null,
      selectedOperatorName: serviceUsesOperatorScheduling ? operatoreNome || null : null,
    });
  }, [
    data,
    getAvailableStartTimesForService,
    operatoreId,
    operatoreNome,
    selectedDateAvailability.closed,
    serviceUsesOperatorScheduling,
    servizio,
  ]);
  const isSelectedDateToday = data === todayDate;
  const currentTimeMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);
  const overlapsLunchBreakSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    doesServiceOverlapLunchBreak({
      settings: availabilitySettings,
      startTime: ora,
      durationMinutes: getServiceDuration(servizio.trim()),
    });
  const selectedServiceDuration = servizio.trim() ? getServiceDuration(servizio.trim()) : 0;
  const exceedsClosingTimeSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    !doesServiceFitWithinDaySchedule({
      settings: availabilitySettings,
      dateValue: data,
      startTime: ora,
      durationMinutes: selectedServiceDuration,
    });
  const isSelectedTimeInPast =
    !!ora.trim() && isSelectedDateToday && timeToMinutes(ora) < currentTimeMinutes;
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

  const canAdd = useMemo(() => {
    return (
      !selectedDateAvailability.closed &&
      data.trim() !== '' &&
      ora.trim() !== '' &&
      cliente.trim() !== '' &&
      servizio.trim() !== '' &&
      !exceedsClosingTimeSelection &&
      !isSelectedTimeInPast &&
      prezzo.trim() !== ''
    );
  }, [
    selectedDateAvailability.closed,
    data,
    ora,
    cliente,
    servizio,
    exceedsClosingTimeSelection,
    isSelectedTimeInPast,
    prezzo,
  ]);
  const canChooseAgendaClient = data.trim() !== '' && !selectedDateAvailability.closed;
  const canChooseAgendaService =
    canChooseAgendaClient &&
    cliente.trim() !== '' &&
    !selectedDateAvailability.closed;
  const canChooseAgendaTime =
    canChooseAgendaService &&
    servizio.trim() !== '' &&
    !selectedDateAvailability.closed;
  const canAddVacationRange =
    vacationStartInput.trim() !== '' &&
    vacationEndInput.trim() !== '' &&
    vacationStartInput.trim() <= vacationEndInput.trim();
  const orariNonDisponibiliAgenda = useMemo(
    () => new Set(displayTimeSlots.filter((slotTime) => !agendaAvailableStartTimes.includes(slotTime))),
    [agendaAvailableStartTimes, displayTimeSlots]
  );

  useEffect(() => {
    if (!servizio.trim()) return;
    if (!ora.trim()) return;
    if (agendaAvailableStartTimes.includes(ora)) return;
    setOra('');
  }, [agendaAvailableStartTimes, ora, servizio]);

  const meseCorrenteLabel = useMemo(
    () => formatMonthYearLabelLocalized(data, appLanguage),
    [appLanguage, data]
  );
  const meseCalendarioLabel = useMemo(
    () => formatMonthYearLabelLocalized(calendarMonth, appLanguage),
    [appLanguage, calendarMonth]
  );
  const canGoToPreviousMonth = useMemo(
    () => getMonthStart(calendarMonth).getTime() > getMonthStart(todayDate).getTime(),
    [calendarMonth, todayDate]
  );
  const calendarioMese = useMemo(
    () => buildMonthCalendar(calendarMonth, todayDate),
    [calendarMonth, todayDate]
  );

  const dayPickerSideInset = useMemo(
    () => Math.max(0, (dayPickerWidth - DAY_CARD_WIDTH) / 2),
    [dayPickerWidth]
  );
  const dayPickerSnapOffsets = useMemo(
    () => giorniDisponibili.map((_, index) => index * DAY_CARD_FULL_WIDTH),
    [giorniDisponibili]
  );
  const centerAgendaDayInPicker = useCallback(
    (dateValue: string, animated = false) => {
      const selectedIndex = giorniDisponibili.findIndex((item) => item.value === dateValue);
      if (selectedIndex < 0) return;

      const targetOffset = Math.max(0, selectedIndex * DAY_CARD_FULL_WIDTH);
      suppressDayPickerSettleRef.current = true;
      dayPickerRef.current?.scrollTo({
        x: targetOffset,
        animated,
      });
    },
    [giorniDisponibili]
  );

  const getDayPickerNearestIndex = useCallback(
    (offsetX: number) => {
      return Math.max(
        0,
        Math.min(giorniDisponibili.length - 1, Math.round(offsetX / DAY_CARD_FULL_WIDTH))
      );
    },
    [giorniDisponibili.length]
  );

  useEffect(() => {
    const selectedIndex = giorniDisponibili.findIndex((item) => item.value === data);
    if (selectedIndex < 0 || dayPickerWidth <= 0) return;

    const targetOffset = Math.max(0, selectedIndex * DAY_CARD_FULL_WIDTH);

    dayPickerLiveIndexRef.current = selectedIndex;
    lastDayPickerHapticIndexRef.current = selectedIndex;
    lastDayPickerHapticDateRef.current = data;

    if (dayPickerScrollTimeoutRef.current) {
      clearTimeout(dayPickerScrollTimeoutRef.current);
      dayPickerScrollTimeoutRef.current = null;
    }

    suppressDayPickerSettleRef.current = true;
    dayPickerLatestOffsetXRef.current = targetOffset;
    setDayPickerPreviewIndex((current) => (current === selectedIndex ? current : selectedIndex));

    dayPickerRef.current?.scrollTo({
      x: targetOffset,
      animated: false,
    });
  }, [data, dayPickerWidth, giorniDisponibili]);

  useFocusEffect(
    useCallback(() => {
      const interaction = InteractionManager.runAfterInteractions(() => {
        setData(todayDate);
        setCalendarMonth(todayDate);
        centerAgendaDayInPicker(todayDate, false);
      });

      return () => {
        interaction.cancel();
      };
    }, [centerAgendaDayInPicker, todayDate])
  );

  useEffect(() => {
    return () => {
      pendingAndroidDateSelectionRef.current?.cancel?.();
      if (dayPickerScrollTimeoutRef.current) {
        clearTimeout(dayPickerScrollTimeoutRef.current);
      }
      if (daySelectionScrollTimeoutRef.current) {
        clearTimeout(daySelectionScrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (lastDayPickerHapticDateRef.current === null) {
      lastDayPickerHapticDateRef.current = data;
    }
    const currentIndex = giorniDisponibili.findIndex((item) => item.value === data);
    if (currentIndex >= 0) {
      dayPickerLiveIndexRef.current = currentIndex;
      lastDayPickerHapticIndexRef.current = currentIndex;
    }
  }, [data, giorniDisponibili]);

  useEffect(() => {
    setSlotPreviewTime(null);
  }, [data]);

  const syncDayPickerScrollHaptic = useCallback(
    (offsetX: number) => {
      if (Platform.OS !== 'ios') return;

      const nextIndex = getDayPickerNearestIndex(offsetX);
      if (dayPickerLiveIndexRef.current === nextIndex) return;

      dayPickerLiveIndexRef.current = nextIndex;

      const nextDay = giorniDisponibili[nextIndex];
      if (!nextDay) return;

      lastDayPickerHapticDateRef.current = nextDay.value;
      lastDayPickerHapticIndexRef.current = nextIndex;
      haptic.light().catch(() => null);
    },
    [getDayPickerNearestIndex, giorniDisponibili]
  );

  const handleSelectDate = (
    nextDate: string,
    options?: {
      scrollToClient?: boolean;
      deepScrollToWeekPlanner?: boolean;
    }
  ) => {
    const shouldScrollToClient = options?.scrollToClient ?? true;
    const deepScrollToWeekPlanner = options?.deepScrollToWeekPlanner ?? false;
    const weekPlannerExtraOffset = deepScrollToWeekPlanner
      ? responsive.isDesktop
        ? 300
        : 500
      : 0;

    if (daySelectionScrollTimeoutRef.current) {
      clearTimeout(daySelectionScrollTimeoutRef.current);
      daySelectionScrollTimeoutRef.current = null;
    }

    if (nextDate === data) {
      if (shouldScrollToClient) {
        requestAnimationFrame(() => {
          scrollAgendaToWeekPlanner(weekPlannerExtraOffset);
        });
      }
      return;
    }

    Keyboard.dismiss();
    resetWeekDrag();
    setWeekSwapPreview(null);

    const orarioGiaOccupatoNelNuovoGiorno =
      ora.trim() !== '' &&
      appuntamenti.some(
        (item) =>
          (item.data ?? getTodayDateString()) === nextDate &&
          doesAppointmentOccupySlot(item, ora) &&
          (!serviceUsesOperatorScheduling ||
            !operatoreId ||
            !item.operatoreId ||
            item.operatoreId === operatoreId)
      );

    const applyDateSelection = () => {
      setWeekInteractionEpoch((current) => current + 1);
      setData(nextDate);
      setCalendarMonth(nextDate);
      setCampoAttivo(null);

      if (orarioGiaOccupatoNelNuovoGiorno) {
        setOra('');
      }
    };

    if (IS_ANDROID) {
      pendingAndroidDateSelectionRef.current?.cancel?.();
      React.startTransition(applyDateSelection);
    } else {
      applyDateSelection();
    }

    if (shouldScrollToClient) {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          scrollAgendaToWeekPlanner(weekPlannerExtraOffset);
        });
      });
    }
  };

  const handleJumpToToday = useCallback(() => {
    Keyboard.dismiss();
    handleSelectDate(todayDate, { scrollToClient: false });
  }, [handleSelectDate, todayDate]);

  const handleDayCardPress = useCallback(
    (nextDate: string) => {
      const now = Date.now();
      const lastTap = lastDayTapRef.current;
      const isDoubleTap =
        lastTap?.date === nextDate && now - lastTap.timestamp <= 420;

      lastDayTapRef.current = { date: nextDate, timestamp: now };

      if (isDoubleTap) {
        lastDayTapRef.current = null;
        Keyboard.dismiss();

        dayPickerPreviewIndexRef.current = giorniDisponibili.findIndex((item) => item.value === nextDate);
        if (dayPickerPreviewIndexRef.current >= 0) {
          setDayPickerPreviewIndex(dayPickerPreviewIndexRef.current);
        }

        handleSelectDate(nextDate, {
          scrollToClient: true,
          deepScrollToWeekPlanner: true,
        });

        requestAnimationFrame(() => {
          centerAgendaDayInPicker(nextDate, false);
        });
        requestAnimationFrame(() => {
          dayPickerPreviewIndexRef.current = null;
          setDayPickerPreviewIndex(null);
        });
        return;
      }

      Keyboard.dismiss();

      dayPickerPreviewIndexRef.current = giorniDisponibili.findIndex((item) => item.value === nextDate);
      if (dayPickerPreviewIndexRef.current >= 0) {
        setDayPickerPreviewIndex(dayPickerPreviewIndexRef.current);
      }

      handleSelectDate(nextDate, { scrollToClient: false });

      requestAnimationFrame(() => {
        centerAgendaDayInPicker(nextDate, false);
      });
      requestAnimationFrame(() => {
        dayPickerPreviewIndexRef.current = null;
        setDayPickerPreviewIndex(null);
      });
    },
    [centerAgendaDayInPicker, giorniDisponibili, handleSelectDate]
  );
  const settleAgendaDayPicker = useCallback(
    (offsetX?: number) => {
      const resolvedOffsetX = offsetX ?? dayPickerLatestOffsetXRef.current;

      if (suppressDayPickerSettleRef.current) {
        suppressDayPickerSettleRef.current = false;
        return;
      }
      const nextIndex = getDayPickerNearestIndex(resolvedOffsetX);

      const nextDay = giorniDisponibili[nextIndex];
      if (!nextDay) return;

      isDayPickerUserDraggingRef.current = false;
      isDayPickerMomentumRef.current = false;
      dayPickerLiveIndexRef.current = nextIndex;

      setDayPickerPreviewIndex((current) => (current === nextIndex ? current : nextIndex));

      if (nextDay.value !== data) {
        handleSelectDate(nextDay.value, { scrollToClient: false });
        return;
      }

      centerAgendaDayInPicker(nextDay.value, false);
    },
    [centerAgendaDayInPicker, data, getDayPickerNearestIndex, giorniDisponibili, handleSelectDate]
  );

  const upsertDateOverride = (
    dateValue: string,
    nextOverride: { forceOpen?: boolean; closed?: boolean } | null
  ) => {
    if (hasAcceptedAppointmentsOnDate(dateValue)) {
      showAcceptedAppointmentsCustomizationAlert();
      return;
    }

    setAvailabilitySettings((current) => ({
      ...current,
      dateOverrides: nextOverride
        ? [
            { date: dateValue, ...nextOverride },
            ...current.dateOverrides.filter((item) => item.date !== dateValue),
          ]
        : current.dateOverrides.filter((item) => item.date !== dateValue),
    }));
  };

  const handleDayLongPress = (dateValue: string) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
    const override =
      availabilitySettings.dateOverrides.find((item) => item.date === dateValue) ?? null;
    const dialogBody = availability.closed
      ? 'Questo giorno risulta chiuso o bloccato. Vuoi sbloccarlo?'
      : 'Questo giorno risulta disponibile. Vuoi bloccarlo?';

    Alert.alert(
      formatDateLongLocalized(dateValue, appLanguage),
      dialogBody,
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        availability.closed
          ? {
              text: tApp(appLanguage, 'agenda_unlock_day'),
              onPress: () => upsertDateOverride(dateValue, { forceOpen: true }),
            }
          : {
              text: tApp(appLanguage, 'agenda_close_day'),
              onPress: () => upsertDateOverride(dateValue, { closed: true }),
            },
        ...(override
          ? [
              {
                text: tApp(appLanguage, 'agenda_restore_automatic'),
                onPress: () => upsertDateOverride(dateValue, null),
              },
            ]
          : []),
      ]
    );
  };

  const toggleWeeklyDayClosed = (weekday: number) => {
    if (!canCustomizeSelectedDateHours()) return;

    setAvailabilitySettings((current) => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map((item) =>
        item.weekday === weekday ? { ...item, isClosed: !item.isClosed } : item
      ),
    }));
  };

  const updateWeeklyDayTime = (
    target: { scope: 'weekly' | 'lunch'; weekday?: number; field: 'startTime' | 'endTime' },
    value: string
  ) => {
    if (!canCustomizeSelectedDateHours()) {
      setTimeConfigTarget(null);
      return;
    }

    setAvailabilitySettings((current) => {
      if (target.scope === 'lunch') {
        const next = {
          ...current,
          [target.field === 'startTime' ? 'lunchBreakStart' : 'lunchBreakEnd']: value,
        };

        if (timeToMinutes(next.lunchBreakEnd) <= timeToMinutes(next.lunchBreakStart)) {
          if (target.field === 'startTime') {
            next.lunchBreakEnd = minutesToTime(timeToMinutes(value) + 30);
          } else {
            next.lunchBreakStart = minutesToTime(timeToMinutes(value) - 30);
          }
        }

        return next;
      }

      return {
        ...current,
        weeklySchedule: current.weeklySchedule.map((item) => {
          if (item.weekday !== target.weekday) return item;
          const nextItem = { ...item, [target.field]: value };

          if (timeToMinutes(nextItem.endTime) <= timeToMinutes(nextItem.startTime)) {
            if (target.field === 'startTime') {
              nextItem.endTime = minutesToTime(timeToMinutes(value) + 30);
            } else {
              const shiftedStart = timeToMinutes(value) - 30;
              nextItem.startTime = shiftedStart >= 0 ? minutesToTime(shiftedStart) : '00:00';
            }
          }

          return nextItem;
        }),
      };
    });
    setTimeConfigTarget(null);
  };

  const toggleSlotManualBlock = (slotTime: string) => {
    if (selectedDateAvailability.closed) return;
    if (!isTimeWithinDaySchedule(availabilitySettings, data, slotTime)) return;
    if (orariOccupati.has(slotTime)) return;
    if (hasAcceptedAppointmentsOnDate(data)) {
      showAcceptedAppointmentsCustomizationAlert();
      return;
    }

    haptic.light().catch(() => null);

    setAvailabilitySettings((current) => {
      const existing = current.slotOverrides.find(
        (item) => item.date === data && item.time === slotTime
      );

      return {
        ...current,
        slotOverrides: existing
          ? current.slotOverrides.filter(
              (item) => !(item.date === data && item.time === slotTime)
            )
          : [...current.slotOverrides, { date: data, time: slotTime, blocked: true }],
      };
    });
  };

  const aggiungiFerie = () => {
    if (!canAddVacationRange) return;
    const startDate = vacationStartInput.trim();
    const endDate = vacationEndInput.trim();
    const label = vacationLabelInput.trim();

    const impactedRequests = richiestePrenotazione.filter(
      (item) =>
        isDateInRange(item.data, startDate, endDate) &&
        item.stato !== 'Rifiutata' &&
        item.stato !== 'Annullata'
    );

    const applyVacationRange = async () => {
      setAvailabilitySettings((current) => ({
        ...current,
        vacationRanges: [
          {
            id: `ferie-${Date.now()}`,
            startDate,
            endDate,
            label,
          },
          ...current.vacationRanges,
        ],
      }));

      if (impactedRequests.length > 0) {
        for (const impactedRequest of impactedRequests) {
          await updateBookingRequestStatusForSalon({
            salonCode: salonWorkspace.salonCode,
            requestId: impactedRequest.id,
            status: 'Annullata',
          });
        }
      }

      setVacationStartInput('');
      setVacationEndInput('');
      setVacationLabelInput('');
    };

    if (impactedRequests.length > 0) {
      Alert.alert(
        'Conferma ferie salone',
        `Sei sicuro di programmare queste ferie? Ci sono ${impactedRequests.length} appuntamenti o richieste cliente tra queste date. Se confermi, verranno annullati e il cliente riceverà subito l’avviso nell’app.`,
        [
          { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
          {
            text: 'Conferma ferie',
            style: 'destructive',
            onPress: () => {
              void applyVacationRange();
            },
          },
        ]
      );
      return;
    }

    applyVacationRange();
  };

  const apriSelettoreFerie = (target: 'start' | 'end') => {
    setVacationPickerTarget(target);
  };

  const eliminaFerie = (id: string) => {
    setAvailabilitySettings((current) => ({
      ...current,
      vacationRanges: current.vacationRanges.filter((item) => item.id !== id),
    }));
  };

  const confermaSalvataggioAppuntamento = (forceOverlap = false) => {
    const valorePrezzo = Number(prezzo.replace(',', '.'));
    if (Number.isNaN(valorePrezzo)) {
      Alert.alert(
        tApp(appLanguage, 'agenda_invalid_price_title'),
        tApp(appLanguage, 'agenda_invalid_price_body')
      );
      return;
    }

    const hardConflict = findConflictingAppointment({
      appointmentDate: data,
      startTime: ora,
      serviceName: servizio.trim(),
      selectedOperatorId: serviceUsesOperatorScheduling ? operatoreId : null,
      selectedOperatorName: serviceUsesOperatorScheduling ? operatoreNome : null,
    });

    if (hardConflict) {
      Alert.alert(
        'Slot non disponibile',
        `Questo appuntamento si accavalla con ${hardConflict.cliente} alle ${hardConflict.ora}.\n\nSe inizi alle ${ora}, ${servizio} finisce alle ${minutesToTime(
          timeToMinutes(ora) + getServiceDuration(servizio.trim())
        )}. Scegli un altro orario.`
      );
      return;
    }

    void (async () => {
      const selectedCustomer =
        clienti.find((item) => item.nome.trim().toLowerCase() === cliente.trim().toLowerCase()) ??
        null;
      const requiredMachineryIds = getServiceRequiredMachineryIds(servizio.trim()).filter((item) =>
        activeMachineryMap.has(item)
      );
      const result = await commitAppointmentRecord({
        dateValue: data,
        timeValue: ora,
        customerName: cliente.trim(),
        customerRecord: selectedCustomer,
        serviceName: servizio.trim(),
        priceValue: valorePrezzo,
        operatorIdValue: operatoreId || undefined,
        operatorNameValue: operatoreNome || undefined,
        machineryIdsValue: requiredMachineryIds,
        machineryNamesValue: requiredMachineryIds
          .map((item) => activeMachineryMap.get(item)?.nome ?? '')
          .filter(Boolean),
      });

      if (!result?.ok) {
        Alert.alert(
          'Salvataggio non riuscito',
          result?.error ?? 'Non sono riuscito a creare l’appuntamento.'
        );
        return;
      }

      setData(todayDate);
      setCalendarMonth(todayDate);
      setOra('');
      setCliente('');
      setServizio('');
      setPrezzo('');
      setOperatoreId('');
      setOperatoreNome('');
      setCampoAttivo(null);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    })();
  };

  const aggiungiAppuntamento = () => {
    if (!canAdd) return;

    if (isSelectedTimeInPast) {
      Alert.alert(
        'Orario non prenotabile',
        "Non puoi inserire un appuntamento in un orario già passato rispetto all'ora attuale."
      );
      return;
    }

    if (appuntamentoInConflitto) {
      confermaSalvataggioAppuntamento();
      return;
    }

    if (exceedsClosingTimeSelection) {
      const daySchedule = availabilitySettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      Alert.alert(
        'Orario oltre chiusura',
        `Questo servizio supera l'orario di chiusura del salone${daySchedule ? `, fissato alle ${daySchedule.endTime}` : ''}. In agenda lo blocco automaticamente.`
      );
      return;
    }

    if (
      doesServiceOverlapLunchBreak({
        settings: availabilitySettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio.trim()),
      })
    ) {
      Alert.alert(
        tApp(appLanguage, 'agenda_lunch_force_title'),
        tApp(appLanguage, 'agenda_lunch_force_body'),
        [
          {
            text: tApp(appLanguage, 'agenda_delete_cancel'),
            style: 'cancel',
          },
          {
            text: tApp(appLanguage, 'common_yes'),
            onPress: () => confermaSalvataggioAppuntamento(),
          },
        ]
      );
      return;
    }
    confermaSalvataggioAppuntamento();
  };

  const selezionaServizio = (nome: string, valorePrezzo: number) => {
    setServizio(nome);
    setPrezzo(valorePrezzo.toString());
    setOperatoreId('');
    setOperatoreNome('');
    if (
      ora &&
      findConflictingAppointment({
        appointmentDate: data,
        startTime: ora,
        serviceName: nome,
        selectedOperatorId: null,
        selectedOperatorName: null,
      })
    ) {
      setOra('');
    }
    setCampoAttivo(null);
    setTimeout(scrollAgendaToTime, 120);
  };

  const selectServiceForTarget = useCallback(
    (serviceItem: { id: string; nome: string; prezzo: number }) => {
      if (servicePickerTarget === 'quick') {
        setQuickBookingServiceId(serviceItem.id);
        setQuickBookingOperatorId('');
        closeServicePicker();
        return;
      }

      selezionaServizio(serviceItem.nome, serviceItem.prezzo);
      closeServicePicker();
    },
    [closeServicePicker, selezionaServizio, servicePickerTarget]
  );

  const completaAppuntamento = (id: string) => {
    const appuntamento = appuntamenti.find((item) => item.id === id);
    if (!appuntamento) return;
    const appointmentDate = appuntamento.data ?? todayDate;
    const isFutureDayAppointment = appointmentDate > todayDate;

    if (isFutureDayAppointment) {
      Alert.alert(
        tApp(appLanguage, 'agenda_too_early_title'),
        `Puoi segnare come completato questo appuntamento solo dal giorno ${formatDateCompact(
          appointmentDate
        )}.`
      );
      return;
    }

    const movimentoEsistente = movimenti.some((item) => item.id === `agenda-${appuntamento.id}`);

    if (!movimentoEsistente) {
      setMovimenti([
        {
          id: `agenda-${appuntamento.id}`,
          descrizione: `${appuntamento.servizio} - ${appuntamento.cliente}`,
          importo: appuntamento.prezzo,
          createdAt: `${appointmentDate}T${appuntamento.ora}:00`,
        },
        ...movimenti,
      ]);
    }

    setAppuntamenti(
      appuntamenti.map((item) =>
        item.id === id
          ? { ...item, completato: true, nonEffettuato: false, incassato: true }
          : item
      )
    );
  };

  const segnaNonEffettuato = (id: string) => {
    setAppuntamenti(
      appuntamenti.map((item) =>
        item.id === id
          ? { ...item, completato: false, nonEffettuato: true, incassato: false }
          : item
      )
    );
  };

  const eliminaAppuntamentoFuturo = (item: AppuntamentoItem) => {
    const appointmentDate = item.data ?? todayDate;

    if (!isAppointmentInFuture(item, todayDate)) {
      Alert.alert(
        tApp(appLanguage, 'agenda_delete_unavailable_title'),
        tApp(appLanguage, 'agenda_delete_unavailable_body')
      );
      return;
    }

    Alert.alert(
      tApp(appLanguage, 'agenda_delete_title'),
      `Vuoi eliminare l'appuntamento di ${item.cliente} del ${formatDateCompact(
        appointmentDate
      )} alle ${item.ora}?\n\nLo slot tornerà disponibile in agenda.`,
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'agenda_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            const matchingAcceptedRequest = richiestePrenotazione.find((entry) => {
              const nomeCompleto = `${entry.nome} ${entry.cognome}`.trim().toLowerCase();
              const clienteCorrente = item.cliente.trim().toLowerCase();

              return (
                entry.stato === 'Accettata' &&
                entry.data === appointmentDate &&
                entry.ora === item.ora &&
                entry.servizio.trim().toLowerCase() === item.servizio.trim().toLowerCase() &&
                nomeCompleto === clienteCorrente
              );
            });

            if (matchingAcceptedRequest) {
              void updateBookingRequestStatusForSalon({
                salonCode: salonWorkspace.salonCode,
                requestId: matchingAcceptedRequest.id,
                status: 'Annullata',
              }).then((result) => {
                if (!result?.ok) {
                  Alert.alert(
                    'Aggiornamento non riuscito',
                    result?.error ?? 'Non sono riuscito ad annullare la prenotazione.'
                  );
                  return;
                }

                setRichiestePrenotazione((current) =>
                  current.map((entry) =>
                    entry.id === matchingAcceptedRequest.id
                      ? {
                          ...entry,
                          stato: 'Annullata',
                          viewedByCliente: false,
                          viewedBySalon: true,
                          cancellationSource: 'salone',
                        }
                      : entry
                  )
                );
                setAppuntamenti((current) =>
                  current.filter((appointment) => {
                    const currentDate = appointment.data ?? todayDate;
                    const sameComposite =
                      currentDate === appointmentDate &&
                      appointment.ora === item.ora &&
                      appointment.servizio.trim().toLowerCase() ===
                        item.servizio.trim().toLowerCase() &&
                      appointment.cliente.trim().toLowerCase() ===
                        item.cliente.trim().toLowerCase();

                    return !sameComposite;
                  })
                );
              });
              return;
            }

            void cancelOwnerAppointmentForSalon({
              salonCode: salonWorkspace.salonCode,
              appointmentId: item.id,
              appointmentDate,
              appointmentTime: item.ora,
              customerName: item.cliente,
              serviceName: item.servizio,
              operatorId: item.operatoreId,
              operatorName: item.operatoreNome,
            }).then((result) => {
              if (!result?.ok) {
                Alert.alert(
                  'Aggiornamento non riuscito',
                  result?.error ?? 'Non sono riuscito ad annullare l’appuntamento.'
                );
                return;
              }

              setAppuntamenti((current) =>
                current.filter((appointment) => {
                  const currentDate = appointment.data ?? todayDate;
                  const sameId = appointment.id === item.id;
                  const sameComposite =
                    currentDate === appointmentDate &&
                    appointment.ora === item.ora &&
                    appointment.servizio.trim().toLowerCase() ===
                      item.servizio.trim().toLowerCase() &&
                    appointment.cliente.trim().toLowerCase() ===
                      item.cliente.trim().toLowerCase();

                  return !(sameId || sameComposite);
                })
              );
            });
          },
        },
      ]
    );
  };

  const renderAppuntamentoCard = (item: AppuntamentoItem, compact = false) => {
    const accent = getAgendaServiceAccent(item.servizio);
    const isFutureAppointment = isAppointmentInFuture(item, todayDate);
    const appointmentDate = item.data ?? todayDate;
    const isCompletatoDisabled =
      item.completato || item.nonEffettuato || appointmentDate > todayDate;
    const card = (
      <Reanimated.View
        key={item.id}
        layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
        entering={FadeIn.duration(145).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
        style={[styles.timelineCard, compact && styles.timelineCardCompact]}
      >
        <View style={[styles.timelineTop, compact && styles.timelineTopCompact]}>
          <View style={styles.timelineHourPill}>
            <Text style={styles.timelineHourText}>{item.ora}</Text>
          </View>

          <View style={styles.timelineMain}>
            <View style={styles.timelineTitleRow}>
              <Text
                style={[styles.timelineClient, compact && styles.timelineClientCompact]}
                numberOfLines={1}
              >
                {item.cliente}
              </Text>
              <Reanimated.View
                style={[
                  styles.timelineServicePill,
                  { backgroundColor: accent.bg, borderColor: accent.border },
                ]}
                entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
              >
                <Text
                  style={[styles.timelineServicePillText, { color: accent.text }]}
                  numberOfLines={1}
                >
                  {item.servizio}
                </Text>
              </Reanimated.View>
            </View>

            <View style={styles.timelineMetaRow}>
              {item.operatoreNome ? (
                <Text
                  style={[styles.timelineOperator, compact && styles.timelineOperatorCompact]}
                  numberOfLines={1}
                >
                  Operatore: {item.operatoreNome}
                </Text>
              ) : null}
              <Text style={[styles.timelineMeta, compact && styles.timelineMetaCompact]}>
                {item.ora} - {getAppointmentEndTime(item)} · € {item.prezzo.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
          <Reanimated.View
            style={[
              styles.statusBadge,
              item.nonEffettuato
                ? styles.statusBadgeCancelled
                : item.completato
                  ? styles.statusBadgeDone
                  : styles.statusBadgePending,
            ]}
            entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
            layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
          >
            <Text
              style={[
                styles.statusBadgeText,
                item.nonEffettuato
                  ? styles.statusBadgeTextCancelled
                  : item.completato
                    ? styles.statusBadgeTextDone
                    : styles.statusBadgeTextPending,
              ]}
            >
              {item.nonEffettuato
                ? tApp(appLanguage, 'agenda_status_not_done')
                : item.completato
                  ? tApp(appLanguage, 'agenda_status_completed')
                  : tApp(appLanguage, 'agenda_status_to_complete')}
            </Text>
          </Reanimated.View>

          <Reanimated.View
            style={[
              styles.statusBadge,
              item.nonEffettuato ? styles.statusBadgePending : styles.statusBadgeDone,
            ]}
            entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
            layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
          >
            <Text
              style={[
                styles.statusBadgeText,
                item.nonEffettuato
                  ? styles.statusBadgeTextPending
                  : styles.statusBadgeTextDone,
              ]}
            >
              {item.nonEffettuato
                ? tApp(appLanguage, 'agenda_status_no_income')
                : tApp(appLanguage, 'agenda_status_in_cash')}
            </Text>
          </Reanimated.View>
        </View>

        <View style={[styles.actionsRow, compact && styles.actionsRowCompact]}>
          <HapticTouchable
            style={[styles.darkButton, isCompletatoDisabled && styles.darkButtonDisabled]}
            onPress={() => completaAppuntamento(item.id)}
            disabled={isCompletatoDisabled}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text
              style={[
                styles.darkButtonText,
                isCompletatoDisabled && styles.darkButtonTextDisabled,
              ]}
            >
              {tApp(appLanguage, 'agenda_status_completed')}
            </Text>
          </HapticTouchable>

          <HapticTouchable
            style={[
              styles.secondaryButton,
              (item.completato || item.nonEffettuato) && styles.secondaryButtonDisabled,
            ]}
            onPress={() => segnaNonEffettuato(item.id)}
            disabled={item.completato || item.nonEffettuato}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                (item.completato || item.nonEffettuato) &&
                  styles.secondaryButtonTextDisabled,
              ]}
            >
              {tApp(appLanguage, 'agenda_status_not_done')}
            </Text>
          </HapticTouchable>
        </View>
      </Reanimated.View>
    );

    if (!isFutureAppointment) {
      return card;
    }

    return (
      <Swipeable
        key={item.id}
        ref={(ref) => {
          swipeableRefs.current[item.id] = ref;
        }}
        renderRightActions={() => (
          <HapticTouchable
            style={styles.deleteSwipeAction}
            onPress={() => eliminaAppuntamentoFuturo(item)}
            pressScale={0.98}
            pressOpacity={0.98}
          >
            <Text style={styles.deleteSwipeText}>{tApp(appLanguage, 'common_delete')}</Text>
          </HapticTouchable>
        )}
        friction={1.03}
        overshootRight={false}
        overshootFriction={10}
        dragOffsetFromRightEdge={8}
        rightThreshold={22}
      >
        {card}
      </Swipeable>
    );
  };

  const renderAgendaDaySection = (item: AgendaDaySection, compactCards = false) => {
    const expanded = giornoEspanso === item.date;

    return (
      <View
        key={`section-${item.date}`}
        style={[
          styles.daySectionCard,
          styles.daySectionCardShell,
          compactCards && styles.daySectionCardCompact,
          { maxWidth: responsive.contentMaxWidth },
        ]}
      >
        <HapticTouchable
          style={styles.daySectionHeader}
          onPress={() => setGiornoEspanso((current) => (current === item.date ? '' : item.date))}
          pressScale={0.985}
          pressOpacity={0.98}
        >
          <View style={styles.daySectionHeaderLeft}>
            <Text style={styles.daySectionTitle}>
              {formatDateLongLocalized(item.date, appLanguage)}
            </Text>
            <Text style={styles.daySectionSubtitle}>
              {item.items.length === 0
                ? tApp(appLanguage, 'agenda_no_appointments')
                : item.items.length === 1
                  ? tApp(appLanguage, 'agenda_one_appointment')
                  : tApp(appLanguage, 'agenda_many_appointments', {
                      count: item.items.length,
                    })}
            </Text>
          </View>

          <View style={styles.daySectionHeaderRight}>
            <Reanimated.View
              style={styles.daySectionCount}
              entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
              layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
            >
              <Text style={styles.daySectionCountText}>{item.items.length}</Text>
            </Reanimated.View>
            <View style={styles.sectionChevronBadge}>
              <AnimatedChevron expanded={expanded} size={18} color="#111111" />
            </View>
          </View>
        </HapticTouchable>

        {expanded ? (
          <Reanimated.View
            style={styles.daySectionContent}
            entering={FadeIn.duration(180).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(130).easing(Easing.out(Easing.cubic))}
            layout={LinearTransition.duration(200).easing(Easing.out(Easing.cubic))}
          >
            {item.items.length > 0 ? (
              item.items.map((appointment) => renderAppuntamentoCard(appointment, compactCards))
            ) : (
              <View style={styles.daySectionEmpty}>
                <Text style={styles.daySectionEmptyTitle}>
                  {tApp(appLanguage, 'agenda_free_day_title')}
                </Text>
                <Text style={styles.daySectionEmptyText}>
                  {tApp(appLanguage, 'agenda_free_day_text')}
                </Text>
              </View>
            )}
          </Reanimated.View>
        ) : null}
      </View>
    );
  };

  const renderAgendaSectionGroupHeader = (item: AgendaDaySection, index: number) => {
    if (agendaView === 'today' || agendaView === 'week') {
      return null;
    }

    const previousItem = selectedAgendaSections[index - 1];
    const currentYear = String(parseIsoDate(item.date).getFullYear());
    const previousYear = previousItem ? String(parseIsoDate(previousItem.date).getFullYear()) : null;
    const currentMonthLabel = formatMonthYearLabelLocalized(item.date, appLanguage);
    const previousMonthLabel = previousItem
      ? formatMonthYearLabelLocalized(previousItem.date, appLanguage)
      : null;
    const showYear = previousYear !== currentYear;
    const showMonth = previousMonthLabel !== currentMonthLabel;

    if (!showYear && !showMonth) {
      return null;
    }

    const displayMonthLabel = `${currentMonthLabel.charAt(0).toUpperCase()}${currentMonthLabel.slice(1)}`;

    return (
      <View style={styles.agendaSectionGroupHeader}>
        {showYear ? (
          <View style={styles.agendaSectionYearChip}>
            <Text style={styles.agendaSectionYearChipText}>{currentYear}</Text>
          </View>
        ) : null}
        {showMonth ? <Text style={styles.agendaSectionMonthText}>{displayMonthLabel}</Text> : null}
      </View>
    );
  };

  const renderWeekBlockSection = (item: AgendaDaySection) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, item.date);
    const availableSlots = availability.closed
      ? 0
      : weekTimeSlots.filter((slotTime) => getWeekRenderCellState(item.date, slotTime) === 'available')
          .length;
    const hasAppointments = item.items.length > 0;
    const occupancyLabel = availability.closed
      ? 'Chiuso'
      : hasAppointments && availableSlots === 0
        ? 'Pieno'
        : hasAppointments
          ? 'Con spazio'
          : availableSlots > 0
            ? 'Libero'
            : 'Bloccato';

    return (
      <View key={`week-block-${item.date}`} style={styles.weekBlockDayCard}>
        <View style={styles.weekBlockDayHeader}>
          <View style={styles.weekBlockDayHeaderTextWrap}>
            <Text style={styles.weekBlockDayEyebrow}>Giorno settimana</Text>
            <Text style={styles.weekBlockDayTitle}>
              {formatDateLongLocalized(item.date, appLanguage)}
            </Text>
          </View>

          <View style={styles.weekBlockStatusWrap}>
            <View
              style={[
                styles.weekBlockStatusChip,
                availability.closed
                  ? styles.weekBlockStatusChipClosed
                  : availableSlots === 0 && hasAppointments
                    ? styles.weekBlockStatusChipFull
                    : styles.weekBlockStatusChipOpen,
              ]}
            >
              <Text
                style={[
                  styles.weekBlockStatusText,
                  availability.closed
                    ? styles.weekBlockStatusTextClosed
                    : availableSlots === 0 && hasAppointments
                      ? styles.weekBlockStatusTextFull
                      : styles.weekBlockStatusTextOpen,
                ]}
              >
                {occupancyLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.weekBlockStatsRow}>
          <View style={styles.weekBlockStatCard}>
            <Text style={styles.weekBlockStatValue}>{item.items.length}</Text>
            <Text style={styles.weekBlockStatLabel}>Appuntamenti</Text>
          </View>
          <View style={styles.weekBlockStatCard}>
            <Text style={styles.weekBlockStatValue}>{availableSlots}</Text>
            <Text style={styles.weekBlockStatLabel}>Slot liberi</Text>
          </View>
        </View>

        {hasAppointments ? (
          <View style={styles.weekBlockAppointmentsList}>
            {item.items.map((appointment) => renderAppuntamentoCard(appointment, true))}
          </View>
        ) : (
          <View style={styles.weekBlockEmptyCard}>
            <Text style={styles.weekBlockEmptyTitle}>
              {availability.closed ? 'Giornata non disponibile' : 'Nessun appuntamento'}
            </Text>
            <Text style={styles.weekBlockEmptyText}>
              {availability.closed
                ? 'Il giorno risulta chiuso o bloccato nella programmazione settimanale.'
                : availableSlots > 0
                  ? 'Hai ancora spazio disponibile per inserire nuove prenotazioni.'
                  : 'Non ci sono slot prenotabili in questa giornata.'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const weekPlannerPanel = useMemo(() => (
    <>
      <View style={styles.weekPlannerInlineNavRow}>
        <View style={styles.weekPlannerNavSide}>
          <HapticTouchable
            style={styles.weekPlannerNavButton}
            onPress={() => {
              Keyboard.dismiss();
              const desiredDays = weekEffectiveVisibleDays;
              handleSelectDate(addDaysToIso(data, desiredDays === 7 ? -7 : -1), { scrollToClient: false });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color="#0f172a" />
          </HapticTouchable>
        </View>

        <View style={styles.weekPlannerHeaderCenter}>
          <View style={styles.weekPlannerHeaderTextWrap}>
            <Text style={styles.weekPlannerTitle}>{weekRangeLabel}</Text>
            <Text style={styles.weekPlannerSubtitle}>
              Tocca + per prenotare · nei giorni con piu operatori usa Modifica · per eliminare trascina slot fuori tabella
            </Text>
          </View>

          <View style={styles.weekPlannerLegendRow}>
            <View style={styles.weekLegendItem}>
              <View style={[styles.weekLegendDot, styles.weekLegendDotAvailable]} />
              <Text
                style={styles.weekLegendText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.76}
              >
                Libero
              </Text>
            </View>
            <View style={styles.weekLegendItem}>
              <View style={[styles.weekLegendDot, styles.weekLegendDotBooked]} />
              <Text
                style={styles.weekLegendText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                Prenotato
              </Text>
            </View>
            <View style={styles.weekLegendItem}>
              <View style={[styles.weekLegendDot, styles.weekLegendDotBlocked]} />
              <Text
                style={styles.weekLegendText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.56}
              >
                Limite prenotazioni
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.weekPlannerNavSide}>
          <HapticTouchable
            style={styles.weekPlannerNavButton}
            onPress={() => {
              Keyboard.dismiss();
              const desiredDays = weekEffectiveVisibleDays;
              handleSelectDate(addDaysToIso(data, desiredDays === 7 ? 7 : 1), { scrollToClient: false });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-forward" size={22} color="#0f172a" />
          </HapticTouchable>
        </View>
      </View>

      <View
        ref={weekPlannerOverlayHostRef}
        style={styles.weekPlannerOverlayHost}
        onLayout={(e) => {
          setPlannerContainerWidth(e.nativeEvent.layout.width);
          requestAnimationFrame(updateWeekPlannerTableOrigin);
        }}
      >
        <View
          ref={weekPlannerTableShellRef}
          style={styles.weekPlannerTableShell}
        >
          <View style={styles.weekPlannerTimeColumn}>
          <View style={styles.weekPlannerCornerCell}>
            <View style={styles.weekPlannerHourGuide} />
            <Text
              style={[
                styles.weekPlannerTimeText,
                styles.weekPlannerCornerTimeText,
                weekStartBoundaryLabel.endsWith(':00')
                  ? styles.weekPlannerTimeTextHour
                  : styles.weekPlannerTimeTextMinor,
              ]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {weekStartBoundaryLabel}
            </Text>
          </View>
          {weekTimeSlots.map((slotTime, rowIndex) => {
            const slotBoundaryTime = minutesToTime(timeToMinutes(slotTime) + weekBaseSlotInterval);
            const isFullHourBoundary = slotBoundaryTime.endsWith(':00');

            return (
              <View key={`week-time-${slotTime}`} style={styles.weekPlannerTimeCell}>
                <View style={styles.weekPlannerHourGuide} />
                <Text
                  style={[
                    styles.weekPlannerTimeText,
                    isFullHourBoundary ? styles.weekPlannerTimeTextHour : styles.weekPlannerTimeTextMinor,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                >
                  {slotBoundaryTime}
                </Text>
              </View>
            );
          })}
          </View>

          <ScrollView
            ref={weekPlannerHorizontalRef}
            horizontal
            style={styles.weekPlannerGridScroller}
            pointerEvents="auto"
            showsHorizontalScrollIndicator={false}
            decelerationRate="normal"
            directionalLockEnabled
            nestedScrollEnabled={false}
            disableScrollViewPanResponder={isWeekPlannerDragging}
            scrollEventThrottle={16}
            bounces={false}
            alwaysBounceVertical={false}
            alwaysBounceHorizontal={false}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(event) => {
              const scrollX = event.nativeEvent.contentOffset.x;
              if (isWeekPlannerDraggingRef.current) {
                weekPlannerHorizontalRef.current?.scrollTo?.({
                  x: weekHorizontalScrollLockXRef.current,
                  animated: false,
                });
                return;
              }
              weekHorizontalScrollPosRef.current = scrollX;
            }}
            onScrollBeginDrag={() => {
              if (isWeekPlannerDraggingRef.current) {
                lockPageScrollForDrag();
                setIsWeekPlannerHorizontalScrolling(false);
                return;
              }
              closeWeekAppointmentDetails();
              closeActiveSuggestions();
              setIsWeekPlannerHorizontalScrolling(true);
            }}
            onScrollEndDrag={() => {
              requestAnimationFrame(() => {
                setIsWeekPlannerHorizontalScrolling(false);
              });
            }}
            onMomentumScrollBegin={() => {
              if (!isWeekPlannerDraggingRef.current) return;
              lockPageScrollForDrag();
            }}
            onMomentumScrollEnd={() => {
              setIsWeekPlannerHorizontalScrolling(false);
            }}
          >
            <View
              key={`week-grid-${data}-${weekEffectiveVisibleDays}-${weekInteractionEpoch}`}
              style={styles.weekPlannerGridShell}
            >
          {weekVisibleDates.map((day, dayIndex) => {
            const isSelectedDay = day.value === data;
            const pendingOnDay = pendingRequestsCountByDate[day.value] ?? 0;
            const isLastDayColumn = dayIndex === weekVisibleDates.length - 1;
            const dayAvailability = getDateAvailabilityInfo(availabilitySettings, day.value);
            const isClosedDay = dayAvailability.closed;
            const isHolidayLikeDay =
              dayAvailability.reason === 'holiday' || dayAvailability.reason === 'vacation';
            const weekOperatorLaneLayout = weekOperatorLaneLayoutByDate[day.value] ?? {
              lanes: [],
              appointmentLaneKeys: {},
            };
            const operatorLaneDefinitions = weekOperatorLaneLayout.lanes;
            const appointmentLaneKeys = weekOperatorLaneLayout.appointmentLaneKeys;
            const useOperatorLaneMode = operatorLaneDefinitions.length >= 2;
            const operatorLaneGap = useOperatorLaneMode ? WEEK_PLANNER_MIN_OPERATOR_LANE_GAP : 0;
            const operatorLaneWidth = useOperatorLaneMode
              ? Math.max(
                  WEEK_PLANNER_MIN_OPERATOR_LANE_WIDTH,
                  (weekVisibleColWidth - operatorLaneGap * (operatorLaneDefinitions.length - 1)) /
                    operatorLaneDefinitions.length
                )
              : weekVisibleColWidth;
            const dayRenderAppointments = getWeekRenderAppointmentsForDate(day.value);

            return (
              <View
                key={`week-day-column-${day.value}`}
                style={[
                  styles.weekPlannerDayColumn,
                  { width: weekVisibleColWidth },
                  pendingOnDay > 0 && styles.weekPlannerDayColumnWithBadge,
                  isSelectedDay && styles.weekPlannerDayColumnSelected,
                  isLastDayColumn && styles.weekPlannerDayColumnLast,
                ]}
              >
                <HapticTouchable
                  style={[
                    styles.weekPlannerDayHeader,
                    pendingOnDay > 0 && styles.weekPlannerDayHeaderWithBadge,
                    isClosedDay && !isSelectedDay && styles.weekPlannerDayHeaderClosed,
                    isHolidayLikeDay && !isSelectedDay && styles.weekPlannerDayHeaderHoliday,
                    isSelectedDay && styles.weekPlannerDayHeaderActive,
                  ]}
                  onPress={() => handleSelectDate(day.value)}
                  onLongPress={() => handleDayLongPress(day.value)}
                  activeOpacity={0.9}
                >
                  {pendingOnDay > 0 ? (
                    <View style={styles.weekPlannerDayPendingBadge}>
                      <Text style={styles.weekPlannerDayPendingBadgeText}>
                        {pendingOnDay > 9 ? '9+' : String(pendingOnDay)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.weekPlannerDayLabelStack}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                      style={[
                        styles.weekPlannerDayWeekLabel,
                        isClosedDay && !isSelectedDay && styles.weekPlannerDayWeekLabelClosed,
                        isSelectedDay && styles.weekPlannerDayWeekLabelActive,
                      ]}
                    >
                      {day.weekdayShort}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.76}
                      style={[
                        styles.weekPlannerDayNumberLabel,
                        isClosedDay && !isSelectedDay && styles.weekPlannerDayNumberLabelClosed,
                        isSelectedDay && styles.weekPlannerDayNumberLabelActive,
                      ]}
                    >
                      {day.dayNumber}
                    </Text>
                  </View>
                </HapticTouchable>

                {weekTimeSlots.map((slotTime, rowIndex) => {
                  const cellState = getWeekRenderCellState(day.value, slotTime);
                  const now = new Date();
                  const pastSlotThresholdMinutes = now.getHours() * 60 + now.getMinutes() - 60;
                  const isPastDay = day.value < todayDate;
                  const isPastSlotToday =
                    day.value === todayDate && timeToMinutes(slotTime) < pastSlotThresholdMinutes;
                  const isPastFreeSlot = isPastDay || isPastSlotToday;
                  const canQuickBook =
                    !isPastFreeSlot &&
                    cellState !== 'outside' &&
                    cellState !== 'occupied';
                  const appointmentStart = getWeekAppointmentStartingAt(day.value, slotTime);
                  const appointmentBlockHeight = appointmentStart
                    ? getWeekAppointmentBlockHeight(appointmentStart)
                    : 0;
                  const isPendingRequestBlock = appointmentStart?.id?.startsWith('pending-') ?? false;
                  const appointmentGesture = appointmentStart
                    ? buildWeekAppointmentGesture(appointmentStart, dayIndex, rowIndex, isPendingRequestBlock)
                    : null;
                  const isPastAppointmentBlock =
                    !!appointmentStart && !isAppointmentInFuture(appointmentStart, todayDate);
                  const pendingCountAtSlot = (blockingAppointmentsByDate[day.value] ?? []).filter(
                    (item) => item.id.startsWith('pending-') && item.ora === slotTime
                  ).length;
                  const isContinuation =
                    cellState === 'occupied' && appointmentStart === null;
                  const isFloatingDraggedBlock =
                    !isPendingRequestBlock && weekDragState?.appointmentId === appointmentStart?.id;
                  const isDragSource = isFloatingDraggedBlock;
                  const isDragTarget =
                    !!weekDragState &&
                    weekDragState.targetDate === day.value &&
                    weekDragState.targetTime === slotTime &&
                    weekDragState.appointmentId !== appointmentStart?.id;
                  const isSwapPreviewTarget =
                    !!weekSwapPreview &&
                    ((weekSwapPreview.targetAppointment?.id === appointmentStart?.id) ||
                      (!weekSwapPreview.targetAppointment &&
                        weekSwapPreview.targetDate === day.value &&
                        weekSwapPreview.targetTime === slotTime));
                  const isSwapPreviewSource =
                    weekSwapPreview?.sourceAppointment.id === appointmentStart?.id;
                  const isCompactAppointmentBlock = appointmentBlockHeight <= 38;

                  const isFirstDayColumn = dayIndex === 0;

                  return (
                    <View key={`week-cell-${day.value}-${slotTime}`} style={styles.weekPlannerCellWrap}>
                      {isFirstDayColumn ? (
                        <View style={styles.weekPlannerCellHourGuideLead} />
                      ) : null}
                      {useOperatorLaneMode ? (
                        <View
                          style={[
                            styles.weekPlannerOperatorLaneRow,
                            { gap: operatorLaneGap },
                          ]}
                        >
                          {operatorLaneDefinitions.map((lane) => {
                            const laneAppointments = dayRenderAppointments.filter(
                              (item) =>
                                (appointmentLaneKeys[item.id] ?? getWeekOperatorLaneKey(item)) === lane.key
                            );
                            const laneStartAppointment =
                              laneAppointments
                                .slice()
                                .sort((first, second) => first.ora.localeCompare(second.ora))
                                .find((item) => item.ora === slotTime) ?? null;
                            const laneOccupyingAppointment =
                              laneAppointments
                                .slice()
                                .sort((first, second) => first.ora.localeCompare(second.ora))
                                .find((item) => doesAppointmentOccupySlot(item, slotTime)) ?? null;
                            const laneContinuation =
                              !!laneOccupyingAppointment && laneStartAppointment === null;
                            const laneAppointmentBlockHeight = laneStartAppointment
                              ? getWeekAppointmentBlockHeight(laneStartAppointment)
                              : 0;
                            const lanePendingCountAtSlot = laneAppointments.filter(
                              (item) => item.id.startsWith('pending-') && item.ora === slotTime
                            ).length;
                            const laneIsPendingRequestBlock =
                              laneStartAppointment?.id?.startsWith('pending-') ?? false;
                            const laneAppointmentGesture = laneStartAppointment
                              ? buildWeekAppointmentGesture(
                                  laneStartAppointment,
                                  dayIndex,
                                  rowIndex,
                                  laneIsPendingRequestBlock
                                )
                              : null;
                            const laneQuickBookAvailable =
                              !isPastFreeSlot &&
                              cellState !== 'outside' &&
                              cellState !== 'blocked' &&
                              !laneOccupyingAppointment &&
                              (
                                servizio.trim()
                                  ? canScheduleServiceAtSlot({
                                      dateValue: day.value,
                                      startTime: slotTime,
                                      serviceName: servizio,
                                      selectedOperatorId: lane.operatorId ?? null,
                                    })
                                  : true
                              );

                            return (
                              <View
                                key={`week-lane-${day.value}-${slotTime}-${lane.key}`}
                                style={[
                                  styles.weekPlannerOperatorLaneCell,
                                  { width: operatorLaneWidth },
                                ]}
                              >
                                {laneContinuation ? null : laneStartAppointment ? (
                                  <View style={styles.weekPlannerBookedCell}>
                                    <GestureDetector gesture={laneAppointmentGesture!}>
                                      {(() => {
                                        const tone = getWeekAppointmentTone(laneStartAppointment);
                                        return (
                                      <View
                                        key={`week-lane-appointment-${laneStartAppointment.id}-${day.value}-${slotTime}-${weekInteractionEpoch}`}
                                        style={[
                                          styles.weekAppointmentBlock,
                                          laneAppointmentBlockHeight <= 38 && styles.weekAppointmentBlockCompact,
                                          {
                                            minHeight: laneAppointmentBlockHeight,
                                            backgroundColor: tone.bg,
                                            borderColor: tone.border,
                                          },
                                        ]}
                                      >
                                        {laneIsPendingRequestBlock ? (
                                          <View style={styles.weekPendingRequestBadge}>
                                            <Text style={styles.weekPendingRequestBadgeText}>
                                              {lanePendingCountAtSlot > 9
                                                ? '9+'
                                                : String(Math.max(1, lanePendingCountAtSlot))}
                                            </Text>
                                          </View>
                                        ) : null}
                                        {renderWeekAppointmentContent(
                                          laneStartAppointment,
                                          laneAppointmentBlockHeight,
                                          operatorLaneWidth,
                                          'lane'
                                        )}
                                      </View>
                                        );
                                      })()}
                                    </GestureDetector>
                                  </View>
                                ) : (
                                  <HapticTouchable
                                    style={[
                                      styles.weekPlannerCell,
                                      styles.weekPlannerOperatorLaneQuickCell,
                                      laneQuickBookAvailable && styles.weekPlannerCellAvailable,
                                      isPastFreeSlot && styles.weekPlannerCellPast,
                                      cellState === 'outside' && styles.weekPlannerCellOutside,
                                      isClosedDay && styles.weekPlannerCellClosedDay,
                                    ]}
                                    onPress={() =>
                                      openQuickSlotModal(day.value, slotTime, lane.operatorId ?? null)
                                    }
                                    activeOpacity={laneQuickBookAvailable ? 0.9 : 1}
                                    disabled={!laneQuickBookAvailable}
                                  >
                                    <Text
                                      numberOfLines={1}
                                      ellipsizeMode="clip"
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.64}
                                      style={[
                                        styles.weekPlannerCellText,
                                        styles.weekPlannerOperatorLaneText,
                                        laneQuickBookAvailable && styles.weekPlannerCellTextAvailable,
                                        isPastFreeSlot && styles.weekPlannerCellTextPast,
                                        cellState === 'outside' && styles.weekPlannerCellTextMuted,
                                      ]}
                                    >
                                      {laneQuickBookAvailable ? '+' : ''}
                                    </Text>
                                  </HapticTouchable>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ) : isContinuation ? null : appointmentStart ? (
                        <View style={styles.weekPlannerBookedCell}>
                          <GestureDetector gesture={appointmentGesture!}>
                            {(() => {
                              const tone = getWeekAppointmentTone(appointmentStart);
                              return (
                            <View
                              key={`week-appointment-${appointmentStart.id}-${day.value}-${slotTime}-${weekInteractionEpoch}`}
                              style={[
                                styles.weekAppointmentBlock,
                                isDragSource && styles.weekAppointmentBlockDragging,
                                isDragTarget &&
                                  (weekDragState?.invalidTarget
                                    ? styles.weekAppointmentBlockDropInvalid
                                    : styles.weekAppointmentBlockDropTarget),
                                (isSwapPreviewSource || isSwapPreviewTarget) &&
                                  styles.weekAppointmentBlockSwapPreview,
                                isCompactAppointmentBlock && styles.weekAppointmentBlockCompact,
                                {
                                  minHeight: appointmentBlockHeight,
                                  backgroundColor: tone.bg,
                                  borderColor: tone.border,
                                },
                              ]}
                            >
                              {isPendingRequestBlock ? (
                                <View style={styles.weekPendingRequestBadge}>
                                  <Text style={styles.weekPendingRequestBadgeText}>
                                    {pendingCountAtSlot > 9 ? '9+' : String(Math.max(1, pendingCountAtSlot))}
                                  </Text>
                                </View>
                              ) : null}
                              {renderWeekAppointmentContent(appointmentStart, appointmentBlockHeight)}
                            </View>
                              );
                            })()}
                          </GestureDetector>
                        </View>
                      ) : (
                        <HapticTouchable
                          style={[
                            styles.weekPlannerCell,
                            canQuickBook && styles.weekPlannerCellAvailable,
                            isPastFreeSlot && styles.weekPlannerCellPast,
                            cellState === 'outside' && styles.weekPlannerCellOutside,
                            isClosedDay && styles.weekPlannerCellClosedDay,
                            isDragTarget &&
                              (weekDragState?.invalidTarget
                                ? styles.weekPlannerCellDropInvalid
                                : styles.weekPlannerCellDropTarget),
                            isSwapPreviewTarget && styles.weekPlannerCellSwapPreview,
                          ]}
                          onPress={() => openQuickSlotModal(day.value, slotTime)}
                            activeOpacity={canQuickBook ? 0.9 : 1}
                            disabled={!canQuickBook}
                        >
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="clip"
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                            style={[
                              styles.weekPlannerCellText,
                              canQuickBook && styles.weekPlannerCellTextAvailable,
                              isPastFreeSlot && styles.weekPlannerCellTextPast,
                              cellState === 'outside' && styles.weekPlannerCellTextMuted,
                            ]}
                          >
                            {canQuickBook
                              ? '+'
                              : isPastFreeSlot
                                ? 'Passato'
                                : ''}
                          </Text>
                        </HapticTouchable>
                      )}
                    </View>
                  );
                })}
              </View>
            );
            })}
            </View>
          </ScrollView>
        </View>

      <View pointerEvents="none" style={styles.weekPlannerDragLayer}>
        {isWeekPlannerDragging && weekDragState && weekDragOverlayState ? (() => {
          const draggedAppointment = appointmentsById[weekDragState.appointmentId] ?? null;

          if (!draggedAppointment) {
            return null;
          }

          const tone = getWeekAppointmentTone(draggedAppointment);

          return (
            <>
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.weekAppointmentFloatingOverlay,
                  weekDragOverlayState.usesDenseOperatorDragUi &&
                    styles.weekAppointmentFloatingOverlayDense,
                  weekFloatingDragAnimatedStyle,
                  {
                    width: weekDragOverlayState.width,
                    height: weekDragOverlayState.height,
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                  },
                ]}
              >
                {renderWeekAppointmentContent(
                  draggedAppointment,
                  weekDragOverlayState.height,
                  weekDragOverlayState.width,
                  weekDragOverlayState.usesDenseOperatorDragUi ? 'default' : 'default'
                )}
              </Reanimated.View>

              <Animated.View
                style={[
                  styles.weekPlannerDeleteZoneOverlay,
                  {
                    opacity: weekDragDeleteZoneAnim,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.weekPlannerDeleteZoneIndicator}>
                  <Ionicons name="trash" size={48} color="#ef4444" style={{ opacity: 0.9 }} />
                  <Text style={styles.weekPlannerDeleteZoneText}>Rilascia per eliminare</Text>
                </View>
              </Animated.View>
            </>
          );
        })() : null}
      </View>
      </View>
    </>
  ), [
    appointmentsById,
    appLanguage,
    blockingAppointmentsByDate,
    buildWeekAppointmentGesture,
    closeActiveSuggestions,
    closeWeekAppointmentDetails,
    data,
    getAgendaServiceAccent,
    getWeekAppointmentBlockHeight,
    getWeekAppointmentStartingAt,
    getWeekCellState,
    handleDayLongPress,
    handleSelectDate,
    isWeekPlannerDragging,
    lockPageScrollForDrag,
    openQuickSlotModal,
    pendingRequestsCountByDate,
    renderWeekAppointmentContent,
    setIsWeekPlannerHorizontalScrolling,
    todayDate,
    weekBaseSlotInterval,
    weekDragDeleteZoneAnim,
    weekDragOverlayState,
    weekDragState,
    weekFloatingDragAnimatedStyle,
    weekInteractionEpoch,
    weekRangeLabel,
    weekStartBoundaryLabel,
    weekSwapPreview,
    weekTimeSlots,
    weekVisibleColWidth,
    weekVisibleDates,
  ]);

  const agendaOverviewPanel = (
    <View style={styles.agendaExplorerCard}>
      <View style={styles.agendaExplorerHeader}>
        <Text style={styles.agendaExplorerEyebrow}>Elenco agenda</Text>
        <Text style={styles.agendaExplorerTitleCompact}>Oggi, prossimi e archivio</Text>
      </View>

      <View style={styles.agendaViewGrid}>
        {agendaNavigatorCards.map((card) => {
          const selected = agendaView === card.key;
          const tone = AGENDA_VIEW_TONES[card.key];

          return (
            <HapticTouchable
              key={card.key}
              style={[
                styles.agendaViewCard,
                {
                  backgroundColor: tone.bg,
                  borderColor: selected ? tone.accent : PALETTE.BORDER_LIGHT,
                },
                selected && styles.agendaViewCardActive,
              ]}
              onPress={() => handleAgendaViewSelect(card.key)}
              pressScale={0.98}
              pressOpacity={0.98}
            >
              <View style={styles.agendaViewCardTextWrap}>
                <Text
                  style={[
                    styles.agendaViewEyebrow,
                    { color: tone.accent },
                    selected && styles.agendaViewEyebrowActive,
                  ]}
                >
                  {card.eyebrow}
                </Text>
                <Text style={[styles.agendaViewTitle, selected && styles.agendaViewTitleActive]}>
                  {card.title}
                </Text>
                <Text
                  style={[styles.agendaViewMeta, selected && styles.agendaViewMetaActive]}
                  numberOfLines={1}
                >
                  {card.note}
                </Text>
              </View>

              <View style={styles.agendaViewCardRight}>
                <Reanimated.View
                  style={[
                    styles.agendaViewCountBadge,
                    {
                      backgroundColor: selected ? tone.accent : PALETTE.CARD,
                      borderColor: selected ? tone.accent : PALETTE.BORDER_LIGHT,
                    },
                    selected && styles.agendaViewCountBadgeActive,
                  ]}
                  entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={[styles.agendaViewCountText, selected && styles.agendaViewCountTextActive]}>
                    {card.count}
                  </Text>
                </Reanimated.View>
                <AnimatedChevron
                  expanded={selected}
                  size={16}
                  color={selected ? tone.accent : PALETTE.TEXT_SECONDARY}
                  collapsedDeg={-90}
                  expandedDeg={0}
                />
              </View>
            </HapticTouchable>
          );
        })}
      </View>
    </View>
  );

  if (shouldOpenHome && !hasRedirectedToHomeRef.current) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={agendaView === 'week' ? [] : selectedAgendaSections}
        keyExtractor={(item) => item.date}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        scrollEnabled={!isWeekPlannerHorizontalScrolling && !isWeekPlannerDragging}
        nestedScrollEnabled
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: Math.max(10, responsive.horizontalPadding - 8) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(event) => {
          const offsetY = event.nativeEvent.contentOffset.y;
          if (isWeekPlannerDraggingRef.current) {
            listRef.current?.scrollToOffset?.({
              offset: agendaVerticalScrollLockYRef.current,
              animated: false,
            });
            return;
          }
          agendaVerticalScrollPosRef.current = offsetY;
        }}
        onScrollBeginDrag={() => {
          if (isWeekPlannerDraggingRef.current) {
            listRef.current?.scrollToOffset?.({
              offset: agendaVerticalScrollLockYRef.current,
              animated: false,
            });
            return;
          }
          closeWeekAppointmentDetails();
          closeActiveSuggestions();
          closeAllSwipeables();
        }}
        onMomentumScrollBegin={() => {
          if (!isWeekPlannerDraggingRef.current) return;
          listRef.current?.scrollToOffset?.({
            offset: agendaVerticalScrollLockYRef.current,
            animated: false,
          });
        }}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="agenda"
                title={tApp(appLanguage, 'tab_agenda')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
              />
            </View>

            <View style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <View style={styles.bookingHeaderLeft}>
                    <View style={styles.bookingHeadingRow}>
                      <Text
                        style={styles.bookingHeading}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.86}
                      >
                        Prenotazione appuntamento
                      </Text>
                    </View>
                  </View>

                  <HapticTouchable
                    style={styles.bookingBadge}
                    onPress={() => {
                      Keyboard.dismiss();
                      setCalendarMonth(data);
                      setShowCalendarModal(true);
                    }}
                    activeOpacity={0.9}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="grid" size={14} color="#4b5563" />
                      <Text style={styles.bookingBadgeText}>{meseCorrenteLabel}</Text>
                    </View>
                  </HapticTouchable>
                </View>

                <View style={styles.sectionBlock}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.sectionTitleMain}>
                      <Text style={styles.stepPill}>1</Text>
                      <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_day_of_month')}</Text>
                    </View>
                    <View style={styles.sectionTitleActionWrap}>
                      <HapticTouchable
                        style={[
                          styles.sectionMiniAction,
                          data === todayDate && styles.sectionMiniActionActive,
                        ]}
                        onPress={handleJumpToToday}
                        activeOpacity={0.88}
                      >
                        <Ionicons
                          name="today-outline"
                          size={15}
                          color={data === todayDate ? '#ffffff' : '#334155'}
                        />
                        <Text
                          style={[
                            styles.sectionMiniActionText,
                            data === todayDate && styles.sectionMiniActionTextActive,
                          ]}
                        >
                          Oggi
                        </Text>
                      </HapticTouchable>
                    </View>
                  </View>

                  <View style={styles.dayPickerBleedWrap}>
                    <AgendaDayPicker
                      giorniDisponibili={giorniDisponibili}
                      selectedDate={
                        calendarSelectionMode === 'weekAppointmentEdit' && weekAppointmentEditDate
                          ? weekAppointmentEditDate
                          : data
                      }
                      availabilitySettings={availabilitySettings}
                      pendingRequestsCountByDate={pendingRequestsCountByDate}
                      appLanguage={appLanguage}
                      onSelectDateFinal={(nextDate) => {
                        handleSelectDate(nextDate, { scrollToClient: false });
                      }}
                      onSelectDateDeep={(nextDate) => {
                        handleSelectDate(nextDate, {
                          scrollToClient: true,
                          deepScrollToWeekPlanner: true,
                        });
                      }}
                      onDayLongPress={handleDayLongPress}
                      onCloseActiveSuggestions={closeActiveSuggestions}
                    />
                  </View>

                  <Text style={styles.sectionHint}>
                    Un tap seleziona il giorno della settimana · due tap portano alla griglia calendario.
                  </Text>
                </View>

                <View
                  onLayout={(event) => {
                    agendaWeekPlannerSectionOffsetRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <View style={styles.inlinePlannerStepRow}>
                    <Text style={styles.stepPill}>2</Text>
                    <View style={styles.inlinePlannerStepTitleWrap}>
                      <Text style={styles.sectionTitle}>Panoramica Settimana su:</Text>
                      <HapticTouchable
                        style={styles.weekPlannerDaysButton}
                        onPress={() => setShowWeekVisibleDaysPicker(true)}
                        activeOpacity={0.88}
                      >
                        <Ionicons name="options-outline" size={15} color="#334155" />
                        <Text style={styles.weekPlannerDaysButtonText}>
                          {weekPlannerDaysBadgeLabel}
                        </Text>
                      </HapticTouchable>
                    </View>
                  </View>
                  {weekPlannerPanel}
                </View>
            </View>

            <View style={styles.searchCard}>
              <HapticTouchable
                style={[styles.sectionToggleButton, styles.utilityToggleButton]}
                onPress={() => setShowCustomizeHoursExpanded((current) => !current)}
                pressScale={0.985}
                pressOpacity={0.98}
              >
                <View style={styles.sectionToggleTextWrap}>
                  <Text style={styles.searchTitle}>{tApp(appLanguage, 'agenda_customize_hours')}</Text>
                  <Text style={styles.sectionHint}>
                    {tApp(appLanguage, 'agenda_customize_hint')}
                  </Text>
                </View>
                <View style={styles.sectionChevronBadge}>
                  <AnimatedChevron expanded={showCustomizeHoursExpanded} size={20} color="#111111" />
                </View>
              </HapticTouchable>

              {showCustomizeHoursExpanded ? (
                <Reanimated.View
                  entering={FadeIn.duration(185).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOut.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(210).easing(Easing.out(Easing.cubic))}
                >
                  {isSelectedDateHoursCustomizationLocked ? (
                    <View style={styles.customizationLockedHintRow}>
                      <Ionicons name="lock-closed" size={15} color="#c2410c" />
                      <Text style={styles.customizationLockedHint}>
                        Giornata bloccata. Ci sono gia appuntamenti accettati.
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.lunchBreakCard,
                      isSelectedDateHoursCustomizationLocked && styles.customizationLockedCard,
                    ]}
                  >
                    <View style={styles.scheduleRow}>
                      <View style={styles.scheduleDayInfo}>
                        <Text style={styles.scheduleDayLabel}>
                          {tApp(appLanguage, 'agenda_slot_interval_title')}
                        </Text>
                        <Text style={styles.scheduleDayMeta}>
                          {tApp(appLanguage, 'agenda_slot_interval_current', {
                            slotInterval: formatSlotInterval(availabilitySettings.slotIntervalMinutes),
                          })}
                        </Text>
                      </View>
                    </View>

                    <HapticTouchable
                      style={[
                        styles.slotIntervalField,
                        isSelectedDateHoursCustomizationLocked && styles.customizationLockedField,
                      ]}
                      onPress={() => {
                        if (!canCustomizeSelectedDateHours()) return;
                        setShowSlotIntervalPicker(true);
                      }}
                      pressScale={0.98}
                      pressOpacity={0.98}
                    >
                      <Text
                        style={[
                          styles.slotIntervalFieldText,
                          isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                        ]}
                      >
                        Slot {formatSlotInterval(availabilitySettings.slotIntervalMinutes)}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={isSelectedDateHoursCustomizationLocked ? '#94a3b8' : '#334155'}
                      />
                    </HapticTouchable>

                    <HapticTouchable
                      style={[
                        styles.slotIntervalField,
                        isSelectedDateHoursCustomizationLocked && styles.customizationLockedField,
                      ]}
                      onPress={() => {
                        if (!canCustomizeSelectedDateHours()) return;
                        setShowWeekVisibleDaysPicker(true);
                      }}
                      pressScale={0.98}
                      pressOpacity={0.98}
                    >
                      <Text
                        style={[
                          styles.slotIntervalFieldText,
                          isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                        ]}
                      >
                        Vista settimana {availabilitySettings.weekVisibleDays} giorni
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={isSelectedDateHoursCustomizationLocked ? '#94a3b8' : '#334155'}
                      />
                    </HapticTouchable>
                  </View>

                  <View
                    style={[
                      styles.lunchBreakCard,
                      isSelectedDateHoursCustomizationLocked && styles.customizationLockedCard,
                    ]}
                  >
                    <View style={styles.scheduleRow}>
                      <View style={styles.scheduleDayInfo}>
                        <Text style={styles.scheduleDayLabel}>Pausa pranzo</Text>
                        <Text style={styles.scheduleDayMeta}>
                          {availabilitySettings.lunchBreakEnabled
                            ? `${availabilitySettings.lunchBreakStart} - ${availabilitySettings.lunchBreakEnd}`
                            : 'Disattivata'}
                        </Text>
                      </View>

                      <View style={styles.lunchBreakControlsWrap}>
                        <HapticTouchable
                          style={[
                            styles.scheduleToggleChip,
                            availabilitySettings.lunchBreakEnabled
                              ? styles.scheduleToggleChipOpen
                              : styles.scheduleToggleChipClosed,
                            isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                          ]}
                          onPress={() => {
                            if (!canCustomizeSelectedDateHours()) return;
                            setAvailabilitySettings((current) => ({
                              ...current,
                              lunchBreakEnabled: !current.lunchBreakEnabled,
                            }));
                          }}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          <Text
                            style={[
                              styles.scheduleToggleText,
                              availabilitySettings.lunchBreakEnabled
                                ? styles.scheduleToggleTextOpen
                                : styles.scheduleToggleTextClosed,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                            ]}
                          >
                            {availabilitySettings.lunchBreakEnabled ? 'Attiva' : 'Disattivata'}
                          </Text>
                        </HapticTouchable>

                        <HapticTouchable
                          style={[
                            styles.scheduleTimeChip,
                            isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                          ]}
                          onPress={() => {
                            if (!availabilitySettings.lunchBreakEnabled) return;
                            if (!canCustomizeSelectedDateHours()) return;
                            setTimeConfigTarget({ scope: 'lunch', field: 'startTime' });
                          }}
                          pressScale={0.98}
                          pressOpacity={availabilitySettings.lunchBreakEnabled ? 0.98 : 1}
                        >
                          <Text
                            style={[
                              styles.scheduleTimeChipText,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                            ]}
                          >
                            {availabilitySettings.lunchBreakStart}
                          </Text>
                        </HapticTouchable>

                        <HapticTouchable
                          style={[
                            styles.scheduleTimeChip,
                            isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                          ]}
                          onPress={() => {
                            if (!availabilitySettings.lunchBreakEnabled) return;
                            if (!canCustomizeSelectedDateHours()) return;
                            setTimeConfigTarget({ scope: 'lunch', field: 'endTime' });
                          }}
                          pressScale={0.98}
                          pressOpacity={availabilitySettings.lunchBreakEnabled ? 0.98 : 1}
                        >
                          <Text
                            style={[
                              styles.scheduleTimeChipText,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                            ]}
                          >
                            {availabilitySettings.lunchBreakEnd}
                          </Text>
                        </HapticTouchable>
                      </View>
                    </View>
                  </View>

                  {availabilitySettings.weeklySchedule.map((item) => (
                    <View key={`weekday-${item.weekday}`} style={styles.scheduleRow}>
                      <View style={styles.scheduleDayInfo}>
                        <Text
                          style={styles.scheduleDayLabel}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {weekdayLabels[item.weekday]}
                          </Text>
                          <Text
                            style={styles.scheduleDayMeta}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {item.isClosed
                              ? tApp(appLanguage, 'agenda_schedule_closed')
                              : tApp(appLanguage, 'agenda_schedule_hours', {
                                  startTime: item.startTime,
                                  endTime: item.endTime,
                                })}
                          </Text>
                        </View>

                        <View style={styles.scheduleControlsRow}>
                          <HapticTouchable
                            style={[
                              styles.scheduleToggleChip,
                              item.isClosed
                                ? styles.scheduleToggleChipClosed
                                : styles.scheduleToggleChipOpen,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                            ]}
                            onPress={() => toggleWeeklyDayClosed(item.weekday)}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.scheduleToggleText,
                                item.isClosed
                                  ? styles.scheduleToggleTextClosed
                                  : styles.scheduleToggleTextOpen,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                            ]}
                          >
                              {item.isClosed
                                ? tApp(appLanguage, 'agenda_schedule_closed')
                                : 'Aperto'}
                            </Text>
                          </HapticTouchable>

                          <HapticTouchable
                            style={[
                              styles.scheduleTimeChip,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                            ]}
                            onPress={() => {
                              if (item.isClosed) return;
                              if (!canCustomizeSelectedDateHours()) return;
                              setTimeConfigTarget({
                                scope: 'weekly',
                                weekday: item.weekday,
                                field: 'startTime',
                              });
                            }}
                            pressScale={0.98}
                            pressOpacity={item.isClosed ? 1 : 0.98}
                            disabled={item.isClosed}
                          >
                            <Text
                              style={[
                                styles.scheduleTimeChipText,
                                isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                              ]}
                            >
                              {item.startTime}
                            </Text>
                          </HapticTouchable>

                          <HapticTouchable
                            style={[
                              styles.scheduleTimeChip,
                              isSelectedDateHoursCustomizationLocked && styles.customizationLockedChip,
                            ]}
                            onPress={() => {
                              if (item.isClosed) return;
                              if (!canCustomizeSelectedDateHours()) return;
                              setTimeConfigTarget({
                                scope: 'weekly',
                                weekday: item.weekday,
                                field: 'endTime',
                              });
                            }}
                            pressScale={0.98}
                            pressOpacity={item.isClosed ? 1 : 0.98}
                            disabled={item.isClosed}
                          >
                            <Text
                              style={[
                                styles.scheduleTimeChipText,
                                isSelectedDateHoursCustomizationLocked && styles.customizationLockedText,
                              ]}
                            >
                              {item.endTime}
                            </Text>
                          </HapticTouchable>
                        </View>
                      </View>
                    ))}

                    <View style={styles.vacationForm}>
                      <View style={styles.vacationFormHeader}>
                        <Text style={styles.scheduleDayLabel}>
                          {tApp(appLanguage, 'agenda_vacation_range_title')}
                        </Text>
                        <Text style={styles.scheduleDayMeta}>
                          {tApp(appLanguage, 'agenda_vacation_range_hint')}
                        </Text>
                      </View>

                      <View style={styles.vacationFieldRow}>
                        <View style={styles.vacationFieldWrap}>
                          <Text style={styles.vacationFieldLabel}>
                            {tApp(appLanguage, 'agenda_vacation_start_label')}
                          </Text>
                          <HapticTouchable
                            style={styles.vacationDateButton}
                            onPress={() => apriSelettoreFerie('start')}
                            pressScale={0.98}
                            pressOpacity={0.98}
                          >
                            <Text
                              style={[
                                styles.vacationDateButtonText,
                                !vacationStartInput && styles.vacationDateButtonPlaceholder,
                              ]}
                            >
                              {vacationStartInput
                                ? formatPickerButtonLabel(vacationStartInput)
                                : tApp(appLanguage, 'agenda_select_date')}
                            </Text>
                          </HapticTouchable>
                        </View>

                        <View style={styles.vacationFieldWrap}>
                          <Text style={styles.vacationFieldLabel}>
                            {tApp(appLanguage, 'agenda_vacation_end_label')}
                          </Text>
                          <HapticTouchable
                            style={styles.vacationDateButton}
                            onPress={() => apriSelettoreFerie('end')}
                            pressScale={0.98}
                            pressOpacity={0.98}
                          >
                            <Text
                              style={[
                                styles.vacationDateButtonText,
                                !vacationEndInput && styles.vacationDateButtonPlaceholder,
                              ]}
                            >
                              {vacationEndInput
                                ? formatPickerButtonLabel(vacationEndInput)
                                : tApp(appLanguage, 'agenda_select_date')}
                            </Text>
                          </HapticTouchable>
                        </View>
                      </View>

                      <ClearableTextInput
                        ref={vacationLabelInputRef}
                        style={styles.input}
                        placeholder={tApp(appLanguage, 'agenda_vacation_label_placeholder')}
                        placeholderTextColor="#8f8f8f"
                        value={vacationLabelInput}
                        onChangeText={setVacationLabelInput}
                        onFocus={() => scrollToField(vacationLabelInputRef)}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <HapticTouchable
                        style={[
                          styles.secondaryButtonWide,
                          !canAddVacationRange && styles.primaryButtonDisabled,
                        ]}
                        onPress={aggiungiFerie}
                        disabled={!canAddVacationRange}
                        pressScale={0.975}
                        pressOpacity={0.98}
                      >
                        <Text style={styles.secondaryButtonWideText}>
                          {tApp(appLanguage, 'agenda_add_vacation')}
                        </Text>
                      </HapticTouchable>
                    </View>

                  {availabilitySettings.vacationRanges.map((item) => (
                    <View key={item.id} style={styles.vacationRow}>
                      <View style={styles.vacationInfo}>
                        <Text style={styles.vacationTitle}>
                          {item.label?.trim() || tApp(appLanguage, 'agenda_salon_vacation')}
                        </Text>
                        <Text style={styles.vacationMeta}>
                          {formatDateCompact(item.startDate)} - {formatDateCompact(item.endDate)}
                        </Text>
                      </View>
                      <HapticTouchable
                        style={styles.vacationDeleteChip}
                        onPress={() => eliminaFerie(item.id)}
                        pressScale={0.98}
                        pressOpacity={0.98}
                      >
                        <Text style={styles.vacationDeleteText}>
                          {tApp(appLanguage, 'common_delete')}
                        </Text>
                      </HapticTouchable>
                    </View>
                  ))}
                </Reanimated.View>
              ) : null}
            </View>

            {agendaOverviewPanel}

            <View style={styles.searchCard}>
              <Text style={styles.searchTitle}>{tApp(appLanguage, 'agenda_search_title')}</Text>
              <Text style={styles.searchSubtitle}>Filtra per ora, cliente o servizio senza scorrere tutta l&apos;agenda.</Text>

              <ClearableTextInput
                ref={agendaSearchInputRef}
                style={[styles.input, styles.centeredInput]}
                placeholder={tApp(appLanguage, 'agenda_search_placeholder')}
                placeholderTextColor="#8f8f8f"
                value={ricerca}
                onChangeText={setRicerca}
                onFocus={() => {
                  scrollToField(agendaSearchInputRef);
                  setCampoAttivo('ricerca');
                }}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {campoAttivo === 'ricerca' && suggerimentiRicerca.length > 0 ? (
                <View style={styles.suggestionBox}>
                  {suggerimentiRicerca.map((item) => (
                    <HapticTouchable
                      key={`ricerca-${item.id}`}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setRicerca(item.cliente);
                        setCampoAttivo(null);
                      }}
                      pressScale={0.985}
                      pressOpacity={0.98}
                    >
                      <Text style={styles.suggestionText}>
                        {item.ora} · {item.cliente} · {item.servizio}
                      </Text>
                    </HapticTouchable>
                  ))}
                </View>
              ) : null}
            </View>

          </View>
        }
        renderItem={({ item, index }) => (
          <React.Fragment>
            {renderAgendaSectionGroupHeader(item, index)}
            {renderAgendaDaySection(item, true)}
          </React.Fragment>
        )}
        ListEmptyComponent={
          agendaView === 'week' ? null : (
            <View style={styles.emptyAgendaState}>
              <Text style={styles.emptyAgendaStateTitle}>
                {agendaView === 'today'
                  ? 'Nessun appuntamento per oggi'
                  : agendaView === 'upcoming'
                    ? 'Nessun appuntamento in arrivo'
                    : 'Archivio ancora vuoto'}
              </Text>
              <Text style={styles.emptyAgendaStateText}>
                {agendaView === 'today'
                  ? 'Puoi usare la parte alta della schermata per prenotare subito il prossimo cliente.'
                  : agendaView === 'upcoming'
                    ? 'Quando inserirai nuovi appuntamenti nei prossimi giorni li troverai qui, ordinati per data.'
                    : 'Appena completi le prime giornate di lavoro, qui comparira lo storico recente.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={styles.pastAppointmentsSection} />}
      />

      <Modal
        visible={!!quickSlotDraft}
        transparent
        animationType="fade"
        onRequestClose={closeQuickSlotModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalKeyboardAvoider}>
          <View style={styles.quickBookingModalCard}>
            <View style={styles.quickBookingHeaderRow}>
              <View style={styles.quickBookingHeaderTextWrap}>
                <Text
                  style={styles.calendarTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Prenota slot
                </Text>
                <Text style={styles.quickBookingDateTitle}>
                  {quickSlotDraft
                    ? `${formatDateLongLocalized(quickSlotDraft.date, appLanguage)} · ${quickSlotDraft.time}`
                    : ''}
                </Text>
              </View>

              <HapticTouchable
                style={styles.timeConfigCloseButton}
                onPress={closeQuickSlotModal}
                hapticType="none"
                pressInHapticType="light"
                activeOpacity={1}
              >
                <Text style={styles.timeConfigCloseButtonText}>×</Text>
              </HapticTouchable>
            </View>

            <ScrollView
              ref={quickBookingScrollRef}
              style={styles.quickBookingScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickBookingContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bounces={false}
            >
              <View style={styles.quickSectionBlock}>
              <View style={styles.quickSectionHeaderRow}>
                <Text
                  style={styles.quickBookingSectionTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Servizio
                </Text>
                <HapticTouchable
                  style={styles.quickInlineAddButton}
                  onPress={() => {
                        setServicePickerTarget('quick');
                        setShowServiceComposerInPicker((current) => !current);
                    if (!showServiceComposerInPicker) {
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          focusQuickBookingNextField(agendaServiceNameRef);
                        });
                      });
                    }
                  }}
                  hapticType="none"
                  pressInHapticType="light"
                  activeOpacity={1}
                >
                  <Text style={styles.quickInlineAddButtonText}>
                    {showServiceComposerInPicker ? 'Chiudi +' : '+ Servizio'}
                  </Text>
                </HapticTouchable>
              </View>

              {servizi.length === 0 ? (
                <View style={styles.quickEmptyServiceCard}>
                  <Text style={styles.quickEmptyServiceTitle}>Nessun servizio configurato</Text>
                  <Text style={styles.quickEmptyServiceText}>
                    Aggiungilo adesso direttamente da qui, poi sarà subito selezionabile.
                  </Text>
                  <HapticTouchable
                    style={styles.quickEmptyServiceButton}
                    onPress={() => {
                      setServicePickerTarget('quick');
                      setShowServiceComposerInPicker(true);
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          focusQuickBookingNextField(agendaServiceNameRef);
                        });
                      });
                    }}
                    hapticType="medium"
                    activeOpacity={0.9}
                  >
                    <Text style={styles.quickEmptyServiceButtonText}>+ Aggiungi servizio</Text>
                  </HapticTouchable>
                </View>
              ) : (
                <View style={styles.quickServiceSearchWrap}>
                  <ClearableTextInput
                    ref={quickServiceSearchRef}
                    style={[styles.input, styles.quickServiceSearchInput]}
                    placeholder="Cerca servizio"
                    placeholderTextColor="#8f8f8f"
                    value={quickServiceSearchQuery}
                    onChangeText={setQuickServiceSearchQuery}
                    onFocus={() => scrollQuickBookingField(quickServiceSearchRef)}
                    autoCapitalize="words"
                    returnKeyType="search"
                  />

                  {quickBookingServiceSearchResults.length === 0 ? (
                    <View style={styles.quickCustomerSearchEmptyCard}>
                      <Text style={styles.quickCustomerSearchEmptyTitle}>Nessun servizio trovato</Text>
                      <Text style={styles.quickCustomerSearchEmptyText}>
                        Prova con nome, mestiere, prezzo o durata.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.quickServiceColumnsScrollContent}
                    >
                      {quickBookingServiceColumns.map((column, columnIndex) => (
                        <View
                          key={`quick-service-column-${columnIndex}`}
                          style={[styles.quickServiceColumn, { width: quickServiceColumnWidth }]}
                        >
                          {column.map((item) => {
                            const selected = item.id === quickBookingServiceId;
                            const selectable = quickBookingAvailableServiceIds.has(item.id);
                            const accent = getAgendaServiceAccent(item.nome);
                            const unavailableReason = !selectable
                              ? getQuickBookingServiceUnavailableReason(item)
                              : '';

                            return (
                              <HapticTouchable
                                key={`quick-inline-service-${item.id}`}
                                style={[
                                  styles.quickServiceCard,
                                  {
                                    width: '100%',
                                    backgroundColor: accent.bg,
                                    borderColor: selected ? '#111827' : accent.border,
                                  },
                                  !selectable && styles.quickBookingChipDisabled,
                                  selected && styles.quickServiceCardSelected,
                                ]}
                                onPress={() => {
                                  if (!selectable) {
                                    haptic.error().catch(() => null);
                                    return;
                                  }
                                  setQuickBookingServiceId(item.id);
                                  setQuickBookingOperatorId('');
                                }}
                                hapticType="none"
                                pressInHapticType="light"
                                activeOpacity={selectable ? 1 : 1}
                                disabled={!selectable}
                              >
                                {selected ? (
                                  <View style={styles.quickServiceCardSelectedBadge}>
                                    <Text style={styles.quickServiceCardSelectedBadgeText}>Scelto</Text>
                                  </View>
                                ) : null}
                                <Text
                                  style={[
                                    styles.quickServiceCardTitle,
                                    selected && styles.quickServiceCardTitleSelected,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.64}
                                  ellipsizeMode="clip"
                                >
                                  {item.nome}
                                </Text>
                                <Text
                                  style={[
                                    styles.quickServiceRoleBadge,
                                    selected && styles.quickServiceRoleBadgeSelected,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.72}
                                  ellipsizeMode="clip"
                                >
                                  {item.mestiereRichiesto || 'Servizio'}
                                </Text>
                                <Text
                                  style={[
                                    styles.quickServiceDuration,
                                    selected && styles.quickServiceCardMetaSelected,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.68}
                                  ellipsizeMode="clip"
                                >
                                  Durata: {formatSlotInterval(item.durataMinuti ?? 60)}
                                </Text>
                                <Text
                                  style={[
                                    styles.quickServicePrice,
                                    selected && styles.quickServicePriceSelected,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.72}
                                  ellipsizeMode="clip"
                                >
                                  € {item.prezzo.toFixed(2)}
                                </Text>
                                {!selectable ? (
                                  <Text
                                    style={styles.quickServiceCardStatus}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.62}
                                    ellipsizeMode="clip"
                                  >
                                    {unavailableReason}
                                  </Text>
                                ) : null}
                              </HapticTouchable>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
              </View>

              {showServiceComposerInPicker ? (
                <View style={styles.inlineComposerCard}>
                  <ClearableTextInput
                    ref={agendaServiceNameRef}
                    style={[styles.input, styles.compactTopInput]}
                    placeholder="Nome servizio"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceNameInput}
                    onChangeText={setAgendaServiceNameInput}
                    onFocus={() => scrollQuickBookingField(agendaServiceNameRef)}
                    returnKeyType="next"
                    onSubmitEditing={() => focusQuickBookingNextField(agendaServicePriceRef)}
                    blurOnSubmit={false}
                  />
                  <ClearableTextInput
                    ref={agendaServicePriceRef}
                    style={styles.input}
                    placeholder="Prezzo"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServicePriceInput}
                    onChangeText={setAgendaServicePriceInput}
                    onFocus={() => scrollQuickBookingField(agendaServicePriceRef)}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => focusQuickBookingNextField(agendaServiceDurationRef)}
                    blurOnSubmit={false}
                  />
                  <ClearableTextInput
                    ref={agendaServiceDurationRef}
                    style={styles.input}
                    placeholder="Durata in minuti"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceDurationInput}
                    onChangeText={setAgendaServiceDurationInput}
                    onFocus={() => scrollQuickBookingField(agendaServiceDurationRef)}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => focusQuickBookingNextField(agendaServiceOriginalPriceRef)}
                    blurOnSubmit={false}
                  />
                  <HapticTouchable
                    style={[styles.input, styles.agendaRoleSelectorInput]}
                    onPress={() => setAgendaServiceRolePickerOpen((current) => !current)}
                    hapticType="none"
                    pressInHapticType="light"
                    activeOpacity={1}
                  >
                    <Text
                      style={[
                        styles.agendaRoleSelectorText,
                        !agendaServiceRoleInput && styles.agendaRoleSelectorPlaceholder,
                      ]}
                    >
                      {agendaServiceRoleInput || 'Mestiere richiesto obbligatorio'}
                    </Text>
                    <Text style={styles.agendaRoleChevron}>
                      {agendaServiceRolePickerOpen ? '▴' : '▾'}
                    </Text>
                  </HapticTouchable>

                  {agendaServiceRolePickerOpen ? (
                    <View style={styles.agendaRolePickerPanel}>
                      <Text style={styles.agendaRolePickerTitle}>Mestieri suggeriti</Text>
                      <View style={styles.agendaRoleChipsWrap}>
                        {PRESET_ROLE_OPTIONS.map((option) => {
                          const selected = agendaServiceRoleInput === option;
                          return (
                            <HapticTouchable
                              key={`agenda-role-quick-${option}`}
                              style={[styles.agendaRoleChip, selected && styles.agendaRoleChipSelected]}
                              onPress={() => {
                                setAgendaServiceRoleInput(option);
                                setAgendaServiceCustomRoleOpen(false);
                              }}
                              hapticType="none"
                              pressInHapticType="light"
                              activeOpacity={1}
                            >
                              <Text
                                style={[
                                  styles.agendaRoleChipText,
                                  selected && styles.agendaRoleChipTextSelected,
                                ]}
                              >
                                {option}
                              </Text>
                            </HapticTouchable>
                          );
                        })}
                        <HapticTouchable
                          style={[styles.agendaRoleChip, styles.agendaRoleChipCreate]}
                          onPress={() => setAgendaServiceCustomRoleOpen((current) => !current)}
                          hapticType="none"
                          pressInHapticType="light"
                          activeOpacity={1}
                        >
                          <Text style={styles.agendaRoleChipCreateText}>
                            {agendaServiceCustomRoleOpen ? 'Chiudi +' : '+ Nuovo mestiere'}
                          </Text>
                        </HapticTouchable>
                      </View>

                      {agendaServiceCustomRoleOpen ? (
                        <ClearableTextInput
                          style={[styles.input, styles.compactTopInput]}
                          placeholder="Nuovo mestiere"
                          placeholderTextColor="#8f8f8f"
                          value={agendaServiceRoleInput}
                          onChangeText={setAgendaServiceRoleInput}
                          onSubmitEditing={Keyboard.dismiss}
                          returnKeyType="done"
                        />
                      ) : null}
                    </View>
                  ) : null}

                  <ClearableTextInput
                    ref={agendaServiceOriginalPriceRef}
                    style={styles.input}
                    placeholder="Prezzo peino opzionale (Sconto)"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceOriginalPriceInput}
                    onChangeText={setAgendaServiceOriginalPriceInput}
                    onFocus={() => scrollQuickBookingField(agendaServiceOriginalPriceRef)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={false}
                  />

                  <HapticTouchable
                    style={styles.secondaryButtonWide}
                    onPress={addServiceFromAgenda}
                    hapticType="none"
                    pressInHapticType="medium"
                    activeOpacity={1}
                  >
                    <Text style={styles.secondaryButtonWideText}>Salva servizio</Text>
                  </HapticTouchable>
                </View>
              ) : null}

              {quickBookingUsesOperators ? (
                <View style={styles.quickSectionBlock}>
                  <View style={styles.quickSectionHeaderRow}>
                    <Text
                      style={styles.quickBookingSectionTitle}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      Operatore
                    </Text>
                  </View>

                  <View style={styles.quickBookingChipWrap}>
                    {quickBookingCompatibleOperators.map((item) => {
                      const selected = item.id === selectedQuickBookingOperator?.id;

                      return (
                        <HapticTouchable
                          key={`quick-operator-${item.id}`}
                          style={[
                            styles.quickBookingChip,
                            selected && styles.quickBookingChipActive,
                          ]}
                          onPress={() => setQuickBookingOperatorId(item.id)}
                          hapticType="none"
                          pressInHapticType="light"
                          activeOpacity={1}
                        >
                          <Text
                            style={[
                              styles.quickBookingChipTitle,
                              selected && styles.quickBookingChipTitleActive,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {item.nome}
                          </Text>
                          <Text
                            style={[
                              styles.quickBookingChipMeta,
                              selected && styles.quickBookingChipMetaActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.mestiere || 'Operatore'}
                          </Text>
                        </HapticTouchable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.quickSectionBlock}>
              <View style={styles.quickSectionHeaderRow}>
                <Text
                  style={styles.quickBookingSectionTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Cliente
                </Text>
                <View style={styles.quickSectionHeaderActions}>
                  <HapticTouchable
                    style={styles.quickInlineAddButton}
                    onPress={() => setShowQuickCustomerComposer((current) => !current)}
                    hapticType="none"
                    pressInHapticType="light"
                    activeOpacity={1}
                  >
                    <Text style={styles.quickInlineAddButtonText}>
                      {showQuickCustomerComposer ? 'Chiudi +' : '+ Cliente'}
                    </Text>
                  </HapticTouchable>
                </View>
              </View>

              <View style={styles.quickCustomerSearchInlineWrap}>
                  <ClearableTextInput
                    ref={quickCustomerSearchRef}
                    style={[styles.input, styles.quickCustomerSearchInput]}
                    placeholder="Cerca in tutti i clienti"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerSearchQuery}
                    onChangeText={setQuickCustomerSearchQuery}
                    onFocus={() => scrollQuickBookingField(quickCustomerSearchRef)}
                    autoCapitalize="words"
                    returnKeyType="search"
                  />

                  {quickCustomerSearchQuery.trim() ? (
                    <ScrollView
                      style={styles.quickCustomerSearchInlineResults}
                      contentContainerStyle={styles.quickCustomerSearchInlineResultsContent}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {quickBookingSearchResults.length > 0 ? (
                        quickBookingSearchResults.map((item) => {
                        const selected = item.id === quickBookingCustomerId;
                        const secondaryMeta = [item.telefono, item.email ?? '', item.instagram ? `@${item.instagram}` : '']
                          .filter((value) => value.trim().length > 0)
                          .join(' · ');

                        return (
                          <HapticTouchable
                            key={`quick-inline-search-customer-${item.id}`}
                            style={[
                              styles.quickCustomerSearchItem,
                              selected && styles.quickCustomerSearchItemActive,
                            ]}
                            onPress={() => {
                              setQuickBookingCustomerId(item.id);
                              setQuickCustomerSearchQuery(item.nome);
                            }}
                            hapticType="none"
                            pressInHapticType="light"
                            activeOpacity={1}
                          >
                            <Text
                              style={[
                                styles.quickCustomerSearchItemTitle,
                                selected && styles.quickCustomerSearchItemTitleActive,
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.78}
                            >
                              {item.nome}
                            </Text>
                            {secondaryMeta ? (
                              <Text
                                style={[
                                  styles.quickCustomerSearchItemMeta,
                                  selected && styles.quickCustomerSearchItemMetaActive,
                                ]}
                                numberOfLines={2}
                              >
                                {secondaryMeta}
                              </Text>
                            ) : null}
                          </HapticTouchable>
                        );
                        })
                      ) : (
                        <View style={styles.quickCustomerSearchEmptyCard}>
                          <Text style={styles.quickCustomerSearchEmptyTitle}>Nessun cliente trovato</Text>
                          <Text style={styles.quickCustomerSearchEmptyText}>
                            Inizia a scrivere nome, telefono, email o Instagram.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.quickCustomerColumnsScrollContent}
                    >
                      {quickBookingCustomerColumns.map((column, columnIndex) => (
                        <View
                          key={`quick-customer-column-${columnIndex}`}
                          style={[styles.quickCustomerColumn, { width: quickCustomerColumnWidth }]}
                        >
                          {column.map((item, itemIndex) => {
                            const selected = item.id === quickBookingCustomerId;

                            return (
                              <HapticTouchable
                                key={`quick-customer-${columnIndex}-${itemIndex}-${item.id}`}
                                style={[
                                  styles.quickCustomerChip,
                                  selected && styles.quickCustomerChipActive,
                                ]}
                                onPress={() => setQuickBookingCustomerId(item.id)}
                                hapticType="none"
                                pressInHapticType="light"
                                activeOpacity={1}
                              >
                                <Text
                                  style={[
                                    styles.quickCustomerChipText,
                                    selected && styles.quickCustomerChipTextActive,
                                  ]}
                                  numberOfLines={2}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.78}
                                >
                                  {item.nome}
                                </Text>
                              </HapticTouchable>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>

              {showQuickCustomerComposer ? (
                <View style={styles.quickCustomerComposer}>
                  <ClearableTextInput
                    ref={quickCustomerNameRef}
                    style={[
                      styles.input,
                      styles.compactTopInput,
                      quickCustomerErrors.nome && styles.inputError,
                    ]}
                    placeholder="Nome cliente"
                    placeholderTextColor="#8f8f8f"
                    autoCapitalize="characters"
                    value={quickCustomerNameInput}
                    onChangeText={(value) => {
                      setQuickCustomerNameInput(normalizeCustomerNameInput(value));
                      if (quickCustomerErrors.nome) {
                        setQuickCustomerErrors((current) => ({ ...current, nome: undefined }));
                      }
                    }}
                    onFocus={() => scrollQuickBookingField(quickCustomerNameRef)}
                    returnKeyType="next"
                    onSubmitEditing={() => focusQuickBookingNextField(quickCustomerPhoneRef)}
                    blurOnSubmit={false}
                  />
                  {quickCustomerErrors.nome ? (
                    <Text style={styles.fieldErrorText}>{quickCustomerErrors.nome}</Text>
                  ) : null}
                  <ClearableTextInput
                    ref={quickCustomerPhoneRef}
                    style={[styles.input, quickCustomerErrors.telefono && styles.inputError]}
                    placeholder="Telefono"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerPhoneInput}
                    onChangeText={(value) => {
                      setQuickCustomerPhoneInput(limitPhoneToTenDigits(value));
                      if (quickCustomerErrors.telefono) {
                        setQuickCustomerErrors((current) => ({ ...current, telefono: undefined }));
                      }
                    }}
                    onFocus={() => scrollQuickBookingField(quickCustomerPhoneRef)}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => focusQuickBookingNextField(quickCustomerEmailRef)}
                    blurOnSubmit={false}
                  />
                  {quickCustomerErrors.telefono ? (
                    <Text style={styles.fieldErrorText}>{quickCustomerErrors.telefono}</Text>
                  ) : null}
                  <ClearableTextInput
                    ref={quickCustomerEmailRef}
                    style={[styles.input, quickCustomerErrors.email && styles.inputError]}
                    placeholder="Email facoltativa"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerEmailInput}
                    onChangeText={(value) => {
                      setQuickCustomerEmailInput(value);
                      if (quickCustomerErrors.email) {
                        setQuickCustomerErrors((current) => ({ ...current, email: undefined }));
                      }
                    }}
                    onFocus={() => scrollQuickBookingField(quickCustomerEmailRef)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {quickCustomerErrors.email ? (
                    <Text style={styles.fieldErrorText}>{quickCustomerErrors.email}</Text>
                  ) : null}

                  <HapticTouchable
                    style={styles.secondaryButtonWide}
                    onPress={addCustomerFromQuickBooking}
                    hapticType="none"
                    pressInHapticType="medium"
                    activeOpacity={1}
                  >
                    <Text style={styles.secondaryButtonWideText}>Salva cliente rapido</Text>
                  </HapticTouchable>
                </View>
              ) : null}

              <View style={styles.quickBookingSummaryCard}>
                <Text style={styles.summaryTitle}>Riepilogo rapido</Text>
                <Text style={styles.summaryText}>
                  Servizio: {selectedQuickService?.nome || '—'}
                </Text>
                {quickBookingUsesOperators ? (
                  <Text style={styles.summaryText}>
                    Operatore: {selectedQuickBookingOperator?.nome || '—'}
                  </Text>
                ) : null}
                <Text style={styles.summaryText}>
                  Cliente: {selectedQuickCustomer?.nome || '—'}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={closeQuickSlotModal}
                activeOpacity={0.9}
              >
                <Text
                  style={styles.modalSecondaryButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.76}
                >
                  Annulla
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalPrimaryButton,
                  !quickBookingCanConfirm && styles.primaryButtonDisabled,
                ]}
                onPress={confirmQuickSlotBooking}
                activeOpacity={0.9}
              >
                <Text
                  style={styles.modalPrimaryButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  Conferma slot
                </Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!weekAppointmentDetails}
        transparent
        animationType="none"
        onRequestClose={closeWeekAppointmentDetails}
      >
        <View style={styles.modalOverlay}>
          <HapticTouchable
            style={styles.weekAppointmentDetailsBackdrop}
            activeOpacity={1}
            hapticType="none"
            pressInHapticType="light"
            onPress={closeWeekAppointmentDetails}
          />
          <View style={styles.weekAppointmentDetailsCard}>
            <View style={styles.weekAppointmentDetailsHeaderRow}>
              <View style={styles.weekAppointmentDetailsHeaderTextWrap}>
                <Text style={styles.weekAppointmentDetailsEyebrow}>Prenotazione</Text>
                <Text style={styles.weekAppointmentDetailsTitle} numberOfLines={2}>
                  {weekAppointmentDetails?.cliente ?? ''}
                </Text>
              </View>
              <HapticTouchable
                style={styles.weekAppointmentDetailsCloseButton}
                onPress={closeWeekAppointmentDetails}
                hapticType="none"
                pressInHapticType="light"
                activeOpacity={1}
              >
                <Text style={styles.weekAppointmentDetailsCloseButtonText}>×</Text>
              </HapticTouchable>
            </View>

            <View style={styles.weekAppointmentDetailsBody}>
              {weekAppointmentPendingRequest ? (
                <View style={styles.weekAppointmentDetailsPendingHintWrap}>
                  <Text style={styles.weekAppointmentDetailsPendingHintText}>
                    Richiesta in attesa: puoi accettare o rifiutare direttamente da qui.
                  </Text>
                </View>
              ) : null}
              <View style={styles.weekAppointmentDetailsRow}>
                <Text style={styles.weekAppointmentDetailsLabel}>Data e ora</Text>
                <Text style={styles.weekAppointmentDetailsValue}>
                  {weekAppointmentDetails
                    ? `${formatDateLongLocalized(weekAppointmentDetails.data ?? data, appLanguage)} · ${weekAppointmentDetails.ora}`
                    : ''}
                </Text>
              </View>
              <View style={styles.weekAppointmentDetailsRow}>
                <Text style={styles.weekAppointmentDetailsLabel}>Fine prevista</Text>
                <Text style={styles.weekAppointmentDetailsValue}>
                  {weekAppointmentDetails ? getAppointmentEndTime(weekAppointmentDetails) : ''}
                </Text>
              </View>
              <View style={styles.weekAppointmentDetailsRow}>
                <Text style={styles.weekAppointmentDetailsLabel}>Servizio</Text>
                <Text style={styles.weekAppointmentDetailsValue}>
                  {weekAppointmentDetails?.servizio ?? ''}
                </Text>
              </View>
              {weekAppointmentDetails && getServiceRequiredRoleLabel(weekAppointmentDetails.servizio) ? (
                <View style={styles.weekAppointmentDetailsRow}>
                  <Text style={styles.weekAppointmentDetailsLabel}>Mestiere</Text>
                  <Text style={styles.weekAppointmentDetailsValue}>
                    {getServiceRequiredRoleLabel(weekAppointmentDetails.servizio)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.weekAppointmentDetailsRow}>
                <Text style={styles.weekAppointmentDetailsLabel}>Prezzo</Text>
                <Text style={styles.weekAppointmentDetailsValue}>
                  {weekAppointmentDetails ? `€ ${weekAppointmentDetails.prezzo.toFixed(2)}` : ''}
                </Text>
              </View>
              {weekAppointmentDetails?.operatoreNome ? (
                <View style={styles.weekAppointmentDetailsRow}>
                  <Text style={styles.weekAppointmentDetailsLabel}>Operatore</Text>
                  <Text style={styles.weekAppointmentDetailsValue}>
                    {weekAppointmentDetails.operatoreNome}
                  </Text>
                </View>
              ) : null}
            </View>

            {weekAppointmentPendingRequest ? (
              <View style={styles.weekAppointmentDetailsActionsRow}>
                <HapticTouchable
                  style={[
                    styles.weekAppointmentDetailsActionButton,
                    styles.weekAppointmentDetailsActionButtonReject,
                    weekPendingAction !== null && styles.weekAppointmentDetailsActionButtonDisabled,
                  ]}
                  onPress={() => {
                    void updatePendingRequestFromWeekDetails('Rifiutata');
                  }}
                  hapticType="none"
                  pressInHapticType={weekPendingAction === null ? 'medium' : 'none'}
                  activeOpacity={1}
                  disabled={weekPendingAction !== null}
                >
                  <Text style={styles.weekAppointmentDetailsActionButtonRejectText}>
                    {weekPendingAction === 'Rifiutata' ? 'Rifiuto...' : 'Rifiuta'}
                  </Text>
                </HapticTouchable>

                <HapticTouchable
                  style={[
                    styles.weekAppointmentDetailsActionButton,
                    styles.weekAppointmentDetailsActionButtonAccept,
                    weekPendingAction !== null && styles.weekAppointmentDetailsActionButtonDisabled,
                  ]}
                  onPress={() => {
                    void updatePendingRequestFromWeekDetails('Accettata');
                  }}
                  hapticType="none"
                  pressInHapticType={weekPendingAction === null ? 'medium' : 'none'}
                  activeOpacity={1}
                  disabled={weekPendingAction !== null}
                >
                  <Text style={styles.weekAppointmentDetailsActionButtonAcceptText}>
                    {weekPendingAction === 'Accettata' ? 'Accetto...' : 'Accetta'}
                  </Text>
                </HapticTouchable>
              </View>
            ) : weekAppointmentDetails && !weekAppointmentDetailsIsPast ? (
              <View style={styles.weekAppointmentDetailsActionsRow}>
                <HapticTouchable
                  style={[
                    styles.weekAppointmentDetailsActionButton,
                    styles.weekAppointmentDetailsActionButtonAccept,
                  ]}
                  onPress={editWeekAppointmentFromDetails}
                  hapticType="none"
                  pressInHapticType="medium"
                  activeOpacity={1}
                >
                  <Text style={styles.weekAppointmentDetailsActionButtonAcceptText}>Modifica</Text>
                </HapticTouchable>

                <HapticTouchable
                  style={[
                    styles.weekAppointmentDetailsActionButton,
                    styles.weekAppointmentDetailsActionButtonReject,
                  ]}
                  onPress={() => {
                    const currentAppointment = weekAppointmentDetails;
                    closeWeekAppointmentDetails();
                    eliminaAppuntamentoFuturo(currentAppointment);
                  }}
                  hapticType="none"
                  pressInHapticType="medium"
                  activeOpacity={1}
                >
                  <Text style={styles.weekAppointmentDetailsActionButtonRejectText}>Elimina</Text>
                </HapticTouchable>
              </View>
            ) : null}

            <HapticTouchable
              style={styles.weekAppointmentDetailsPrimaryButton}
              onPress={closeWeekAppointmentDetails}
              hapticType="none"
              pressInHapticType="medium"
              activeOpacity={1}
            >
              <Text style={styles.weekAppointmentDetailsPrimaryButtonText}>Chiudi</Text>
            </HapticTouchable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!weekAppointmentEditDraft && !(showCalendarModal && calendarSelectionMode === 'weekAppointmentEdit')}
        transparent
        animationType="none"
        onRequestClose={closeWeekAppointmentEditModal}
      >
        <View style={styles.modalOverlay}>
          <HapticTouchable
            style={styles.weekAppointmentDetailsBackdrop}
            activeOpacity={1}
            hapticType="none"
            pressInHapticType="light"
            onPress={closeWeekAppointmentEditModal}
          />
          <View style={[styles.weekAppointmentDetailsCard, styles.weekAppointmentEditModalCard]}>
            <View style={styles.weekAppointmentDetailsHeaderRow}>
              <View style={styles.weekAppointmentDetailsHeaderTextWrap}>
                <Text style={styles.weekAppointmentDetailsEyebrow}>Modifica appuntamento</Text>
                <Text style={styles.weekAppointmentDetailsTitle} numberOfLines={2}>
                  {weekAppointmentEditDraft?.cliente ?? ''}
                </Text>
              </View>
              <HapticTouchable
                style={styles.weekAppointmentDetailsCloseButton}
                onPress={closeWeekAppointmentEditModal}
                hapticType="none"
                pressInHapticType="light"
                activeOpacity={1}
              >
                <Text style={styles.weekAppointmentDetailsCloseButtonText}>×</Text>
              </HapticTouchable>
            </View>

            <ScrollView
              style={styles.weekAppointmentEditScroll}
              contentContainerStyle={styles.weekAppointmentEditScrollContent}
              showsVerticalScrollIndicator
              indicatorStyle="black"
              bounces={false}
            >
              <View style={styles.weekAppointmentDetailsBody}>
                {weekAppointmentEditDraft && getServiceRequiredRoleLabel(weekAppointmentEditDraft.servizio) ? (
                  <View style={styles.weekAppointmentDetailsRow}>
                    <Text style={styles.weekAppointmentDetailsLabel}>Mestiere</Text>
                    <Text style={styles.weekAppointmentDetailsValue}>
                      {getServiceRequiredRoleLabel(weekAppointmentEditDraft.servizio)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.weekAppointmentDetailsRow}>
                  <Text style={styles.weekAppointmentDetailsLabel}>Giorno selezionato</Text>
                  <HapticTouchable
                    style={styles.weekAppointmentEditDateButton}
                    onPress={() => {
                      setCalendarSelectionMode('weekAppointmentEdit');
                      setCalendarMonth(weekAppointmentEditDate || (weekAppointmentEditDraft?.data ?? todayDate));
                      setShowCalendarModal(true);
                    }}
                    hapticType="none"
                    pressInHapticType="light"
                    activeOpacity={1}
                  >
                    <View style={styles.weekAppointmentEditDateButtonRow}>
                      <Ionicons name="calendar-outline" size={18} color="#475569" />
                      <Text style={styles.weekAppointmentEditDateButtonText}>
                        {weekAppointmentEditDate
                          ? formatDateLongLocalized(weekAppointmentEditDate, appLanguage)
                          : 'Scegli giorno'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#64748b" />
                    </View>
                  </HapticTouchable>
                </View>

                <View style={styles.weekAppointmentDetailsRow}>
                  <Text style={styles.weekAppointmentDetailsLabel}>Slot disponibili</Text>
                  {weekAppointmentEditMoveOptions.length > 0 ? (
                    <View style={styles.weekAppointmentEditSlotsWrap}>
                      {weekAppointmentEditMoveOptions.map((option) => {
                        const selected = option.time === weekAppointmentEditTime;
                        return (
                          <HapticTouchable
                            key={`edit-slot-${weekAppointmentEditDate}-${option.time}`}
                            style={[
                              styles.weekAppointmentEditSlotChip,
                              selected && styles.weekAppointmentEditSlotChipActive,
                            ]}
                            onPress={() => setWeekAppointmentEditTime(option.time)}
                            hapticType="none"
                            pressInHapticType="light"
                            activeOpacity={1}
                          >
                            <View style={styles.weekAppointmentEditSlotChipContent}>
                              <Text
                                numberOfLines={1}
                                ellipsizeMode="clip"
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                                style={[
                                  styles.weekAppointmentEditSlotChipText,
                                  selected && styles.weekAppointmentEditSlotChipTextActive,
                                ]}
                              >
                                {option.time}
                              </Text>
                              <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                style={[
                                  styles.weekAppointmentEditSlotChipHint,
                                  selected && styles.weekAppointmentEditSlotChipHintActive,
                                ]}
                              >
                                {option.replacedAppointmentLabel
                                  ? `Sostituisce ${option.replacedAppointmentLabel}`
                                  : 'Orario libero'}
                              </Text>
                            </View>
                          </HapticTouchable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.weekAppointmentEditEmptyText}>
                      Nessuno slot disponibile per questa giornata con le regole attuali dell'agenda.
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>

            <View style={styles.weekAppointmentDetailsActionsRow}>
              <HapticTouchable
                style={[
                  styles.weekAppointmentDetailsActionButton,
                  styles.weekAppointmentDetailsActionButtonReject,
                ]}
                onPress={closeWeekAppointmentEditModal}
                hapticType="none"
                pressInHapticType="light"
                activeOpacity={1}
              >
                <Text style={styles.weekAppointmentDetailsActionButtonRejectText}>Annulla</Text>
              </HapticTouchable>

              <HapticTouchable
                style={[
                  styles.weekAppointmentDetailsActionButton,
                  styles.weekAppointmentDetailsActionButtonAccept,
                  (!weekAppointmentEditTime || weekAppointmentEditMoveOptions.length === 0) &&
                    styles.weekAppointmentDetailsActionButtonDisabled,
                ]}
                onPress={confirmWeekAppointmentEdit}
                hapticType="none"
                pressInHapticType={
                  weekAppointmentEditTime && weekAppointmentEditMoveOptions.length > 0
                    ? 'medium'
                    : 'none'
                }
                activeOpacity={1}
                disabled={!weekAppointmentEditTime || weekAppointmentEditMoveOptions.length === 0}
              >
                <Text style={styles.weekAppointmentDetailsActionButtonAcceptText}>Sposta</Text>
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCalendarModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCalendarModal(false);
          setCalendarSelectionMode('agenda');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarHeaderRow}>
              <HapticTouchable
                style={[
                  styles.calendarNavButton,
                  !canGoToPreviousMonth && styles.calendarNavButtonDisabled,
                ]}
                onPress={() => {
                  if (!canGoToPreviousMonth) return;
                  setCalendarMonth(addMonthsToIso(calendarMonth, -1));
                }}
                disabled={!canGoToPreviousMonth}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text
                  style={[
                    styles.calendarNavButtonText,
                    !canGoToPreviousMonth && styles.calendarNavButtonTextDisabled,
                  ]}
                >
                  ‹
                </Text>
              </HapticTouchable>

              <Text style={styles.calendarTitle}>{meseCalendarioLabel}</Text>

              <HapticTouchable
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth(addMonthsToIso(calendarMonth, 1))}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.calendarNavButtonText}>›</Text>
              </HapticTouchable>
            </View>

            <View style={styles.calendarWeekRow}>
              {getLocalizedShortWeekdays(appLanguage).map((day) => (
                <Text key={day} style={styles.calendarWeekLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarioMese.map((day) => {
                const selected =
                  day.value ===
                  (calendarSelectionMode === 'weekAppointmentEdit' ? weekAppointmentEditDate : data);
                const closed = day.value
                  ? getDateAvailabilityInfo(availabilitySettings, day.value).closed
                  : false;
                const fullyBooked = day.value && !closed ? isDateFullyBooked(day.value) : false;

                return (
                  <HapticTouchable
                    key={day.key}
                    style={[
                      styles.calendarDayCell,
                      selected && styles.calendarDayCellActive,
                      day.isDisabled && styles.calendarDayCellDisabled,
                      closed && !selected && styles.calendarDayCellClosed,
                      fullyBooked && !selected && styles.calendarDayCellFull,
                      !day.isCurrentMonth && styles.calendarDayCellGhost,
                    ]}
                    onPress={() => {
                      if (!day.value || day.isDisabled || closed || fullyBooked) return;
                      if (calendarSelectionMode === 'weekAppointmentEdit') {
                        setWeekAppointmentEditDate(day.value);
                        setShowCalendarModal(false);
                        setCalendarSelectionMode('agenda');
                        return;
                      }
                      handleSelectDate(day.value, { deepScrollToWeekPlanner: true });
                      setShowCalendarModal(false);
                    }}
                    onLongPress={() => {
                      if (!day.value || day.isDisabled) return;
                      handleDayLongPress(day.value);
                    }}
                    pressScale={0.98}
                    pressOpacity={day.value && !day.isDisabled && !closed ? 0.98 : 1}
                    disabled={!day.value || day.isDisabled}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        selected && styles.calendarDayTextActive,
                        day.isDisabled && styles.calendarDayTextDisabled,
                        closed && !selected && styles.calendarDayTextClosed,
                        fullyBooked && !selected && styles.calendarDayTextFull,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </HapticTouchable>
                );
              })}
            </View>

            <Text style={styles.calendarFooterText}>
              {tApp(appLanguage, 'agenda_calendar_hint')}
            </Text>

            <View style={styles.modalActionsRow}>
              <HapticTouchable
                style={styles.modalSecondaryButton}
                onPress={() => {
                  setShowCalendarModal(false);
                  setCalendarSelectionMode('agenda');
                }}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  {tApp(appLanguage, 'common_close')}
                </Text>
              </HapticTouchable>

              <HapticTouchable
                style={styles.modalPrimaryButton}
                onPress={() => {
                  setCalendarMonth(todayDate);
                  if (calendarSelectionMode === 'weekAppointmentEdit') {
                    setWeekAppointmentEditDate(todayDate);
                    setShowCalendarModal(false);
                    setCalendarSelectionMode('agenda');
                    return;
                  }
                  handleSelectDate(todayDate);
                  setShowCalendarModal(false);
                }}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {calendarSelectionMode === 'weekAppointmentEdit' ? 'Oggi' : tApp(appLanguage, 'common_today')}
                </Text>
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSlotIntervalPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSlotIntervalPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.timeConfigModalCard}>
            <View style={styles.timeConfigHeaderRow}>
              <Text style={styles.calendarTitle}>{tApp(appLanguage, 'agenda_slot_interval_title')}</Text>
              <HapticTouchable
                style={styles.timeConfigCloseButton}
                onPress={() => setShowSlotIntervalPicker(false)}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.timeConfigCloseButtonText}>×</Text>
              </HapticTouchable>
            </View>
            <Text style={styles.modalHelperText}>
              Ogni cambio aggiorna automaticamente gli orari disponibili in agenda e frontend.
            </Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timeConfigList}
            >
              {SLOT_INTERVAL_OPTIONS.map((option) => {
                const selected = availabilitySettings.slotIntervalMinutes === option;

                return (
                  <HapticTouchable
                    key={`slot-interval-option-${option}`}
                    style={[
                      styles.timeConfigOption,
                      selected && styles.timeConfigOptionActive,
                    ]}
                    onPress={() => {
                      if (selected) {
                        setShowSlotIntervalPicker(false);
                        return;
                      }
                      applySlotIntervalChange(option);
                    }}
                    pressScale={0.98}
                    pressOpacity={0.98}
                  >
                    <Text
                      style={[
                        styles.timeConfigOptionText,
                        selected && styles.timeConfigOptionTextActive,
                      ]}
                    >
                      {formatSlotInterval(option)}
                    </Text>
                  </HapticTouchable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={servicePickerTarget !== null && servicePickerTarget !== 'quick'}
        transparent
        animationType="fade"
        onRequestClose={closeServicePicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalKeyboardAvoider}>
          <View style={styles.servicePickerModalCard}>
            <View style={styles.quickBookingHeaderRow}>
              <View style={styles.quickBookingHeaderTextWrap}>
                <Text style={styles.calendarTitle}>Tipo appuntamento</Text>
                <Text style={styles.modalHelperText}>
                  Scegli un servizio esistente oppure aggiungine uno nuovo senza uscire dal flusso agenda.
                </Text>
              </View>
              <HapticTouchable
                style={styles.timeConfigCloseButton}
                onPress={closeServicePicker}
                hapticType="error"
                activeOpacity={0.9}
              >
                <Text style={styles.timeConfigCloseButtonText}>×</Text>
              </HapticTouchable>
            </View>

            <ScrollView
              ref={servicePickerScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickBookingContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <View style={styles.servicePickerActionsRow}>
                <HapticTouchable
                  style={styles.quickCustomerAddChip}
                  onPress={() => setShowServiceComposerInPicker((current) => !current)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.quickCustomerAddChipText}>
                    {showServiceComposerInPicker ? 'Chiudi nuovo servizio' : '+ Nuovo servizio'}
                  </Text>
                </HapticTouchable>
              </View>

              <View style={styles.quickServiceSearchWrap}>
                <ClearableTextInput
                  style={[styles.input, styles.quickServiceSearchInput]}
                  placeholder="Cerca servizio"
                  placeholderTextColor="#8f8f8f"
                  value={quickServiceSearchQuery}
                  onChangeText={setQuickServiceSearchQuery}
                  autoCapitalize="words"
                  returnKeyType="search"
                />
              </View>

              {servicePickerSearchResults.length === 0 ? (
                <View style={styles.quickCustomerSearchEmptyCard}>
                  <Text style={styles.quickCustomerSearchEmptyTitle}>Nessun servizio trovato</Text>
                  <Text style={styles.quickCustomerSearchEmptyText}>
                    Prova con nome, mestiere, prezzo o durata.
                  </Text>
                </View>
              ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickServiceColumnsScrollContent}
              >
                {servicePickerServiceColumns.map((column, columnIndex) => (
                  <View
                    key={`service-picker-column-${columnIndex}`}
                    style={[styles.quickServiceColumn, { width: quickServiceColumnWidth }]}
                  >
                  {column.map((item) => {
                  const selected =
                    servicePickerTarget === 'quick'
                      ? item.id === quickBookingServiceId
                      : normalizeServiceName(item.nome) === normalizeServiceName(servizio);
                  const selectable =
                    servicePickerTarget !== 'quick' ||
                    !quickSlotDraft ||
                    ((item.durataMinuti ?? 60) <=
                      getContiguousFreeWindowMinutes(quickSlotDraft.date, quickSlotDraft.time) &&
                      canScheduleServiceAtSlot({
                        dateValue: quickSlotDraft.date,
                        startTime: quickSlotDraft.time,
                        serviceName: item.nome,
                        selectedOperatorId: null,
                      }));

                  return (
                    <HapticTouchable
                      key={`service-picker-${item.id}`}
                      style={[
                        styles.quickServiceCard,
                        selected && styles.quickBookingChipActive,
                        !selectable && styles.quickBookingChipDisabled,
                        { width: '100%' },
                      ]}
                      onPress={() => {
                        if (!selectable) {
                          haptic.error().catch(() => null);
                          return;
                        }
                        selectServiceForTarget(item);
                      }}
                      activeOpacity={selectable ? 0.9 : 1}
                      disabled={!selectable}
                    >
                      {selected ? (
                        <View style={styles.quickServiceCardSelectedBadge}>
                          <Text style={styles.quickServiceCardSelectedBadgeText}>Scelto</Text>
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.quickServiceCardTitle,
                          selected && styles.quickServiceCardTitleSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.64}
                        ellipsizeMode="clip"
                      >
                        {item.nome}
                      </Text>
                      <Text
                        style={[
                          styles.quickServiceRoleBadge,
                          selected && styles.quickServiceRoleBadgeSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        ellipsizeMode="clip"
                      >
                        {item.mestiereRichiesto || 'Servizio'}
                      </Text>
                      <Text
                        style={[
                          styles.quickServiceDuration,
                          selected && styles.quickServiceCardMetaSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.68}
                        ellipsizeMode="clip"
                      >
                        Durata: {formatSlotInterval(item.durataMinuti ?? 60)}
                      </Text>
                      <Text
                        style={[
                          styles.quickServicePrice,
                          selected && styles.quickServicePriceSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        ellipsizeMode="clip"
                      >
                        € {item.prezzo.toFixed(2)}
                      </Text>
                    </HapticTouchable>
                  );
                })}
                  </View>
                ))}
              </ScrollView>
              )}

              {showServiceComposerInPicker ? (
                <View style={styles.inlineComposerCard}>
                  <ClearableTextInput
                    ref={agendaServiceNameRef}
                    style={[styles.input, styles.compactTopInput]}
                    placeholder="Nome servizio"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceNameInput}
                    onChangeText={setAgendaServiceNameInput}
                    onFocus={() => scrollServicePickerField(agendaServiceNameRef)}
                    returnKeyType="next"
                    onSubmitEditing={() => focusServicePickerNextField(agendaServicePriceRef)}
                    blurOnSubmit={false}
                  />
                  <ClearableTextInput
                    ref={agendaServicePriceRef}
                    style={styles.input}
                    placeholder="Prezzo"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServicePriceInput}
                    onChangeText={setAgendaServicePriceInput}
                    onFocus={() => scrollServicePickerField(agendaServicePriceRef)}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => focusServicePickerNextField(agendaServiceDurationRef)}
                    blurOnSubmit={false}
                  />
                  <ClearableTextInput
                    ref={agendaServiceDurationRef}
                    style={styles.input}
                    placeholder="Durata in minuti"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceDurationInput}
                    onChangeText={setAgendaServiceDurationInput}
                    onFocus={() => scrollServicePickerField(agendaServiceDurationRef)}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => focusServicePickerNextField(agendaServiceOriginalPriceRef)}
                    blurOnSubmit={false}
                  />
                  <HapticTouchable
                    style={[styles.input, styles.agendaRoleSelectorInput]}
                    onPress={() => setAgendaServiceRolePickerOpen((current) => !current)}
                    pressScale={0.985}
                    pressOpacity={0.98}
                  >
                    <Text
                      style={[
                        styles.agendaRoleSelectorText,
                        !agendaServiceRoleInput && styles.agendaRoleSelectorPlaceholder,
                      ]}
                    >
                      {agendaServiceRoleInput || 'Mestiere richiesto obbligatorio'}
                    </Text>
                    <Text style={styles.agendaRoleChevron}>
                      {agendaServiceRolePickerOpen ? '▴' : '▾'}
                    </Text>
                  </HapticTouchable>

                  {agendaServiceRolePickerOpen ? (
                    <View style={styles.agendaRolePickerPanel}>
                      <Text style={styles.agendaRolePickerTitle}>Mestieri suggeriti</Text>
                      <View style={styles.agendaRoleChipsWrap}>
                        {PRESET_ROLE_OPTIONS.map((option) => {
                          const selected = agendaServiceRoleInput === option;
                          return (
                            <HapticTouchable
                              key={`agenda-role-picker-${option}`}
                              style={[styles.agendaRoleChip, selected && styles.agendaRoleChipSelected]}
                              onPress={() => {
                                setAgendaServiceRoleInput(option);
                                setAgendaServiceCustomRoleOpen(false);
                              }}
                              pressScale={0.98}
                              pressOpacity={0.98}
                            >
                              <Text
                                style={[
                                  styles.agendaRoleChipText,
                                  selected && styles.agendaRoleChipTextSelected,
                                ]}
                              >
                                {option}
                              </Text>
                            </HapticTouchable>
                          );
                        })}
                        <HapticTouchable
                          style={[styles.agendaRoleChip, styles.agendaRoleChipCreate]}
                          onPress={() => setAgendaServiceCustomRoleOpen((current) => !current)}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          <Text style={styles.agendaRoleChipCreateText}>
                            {agendaServiceCustomRoleOpen ? 'Chiudi +' : '+ Nuovo mestiere'}
                          </Text>
                        </HapticTouchable>
                      </View>

                      {agendaServiceCustomRoleOpen ? (
                        <ClearableTextInput
                          style={[styles.input, styles.compactTopInput]}
                          placeholder="Nuovo mestiere"
                          placeholderTextColor="#8f8f8f"
                          value={agendaServiceRoleInput}
                          onChangeText={setAgendaServiceRoleInput}
                          onSubmitEditing={Keyboard.dismiss}
                          returnKeyType="done"
                        />
                      ) : null}
                    </View>
                  ) : null}

                  <ClearableTextInput
                    ref={agendaServiceOriginalPriceRef}
                    style={styles.input}
                    placeholder="Prezzo peino opzionale (Sconto)"
                    placeholderTextColor="#8f8f8f"
                    value={agendaServiceOriginalPriceInput}
                    onChangeText={setAgendaServiceOriginalPriceInput}
                    onFocus={() => scrollServicePickerField(agendaServiceOriginalPriceRef)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={false}
                  />

                  <HapticTouchable
                    style={styles.secondaryButtonWide}
                    onPress={addServiceFromAgenda}
                    hapticType="medium"
                    activeOpacity={0.9}
                  >
                    <Text style={styles.secondaryButtonWideText}>Salva servizio</Text>
                  </HapticTouchable>
                </View>
              ) : null}
            </ScrollView>
          </View>
          </View>
        </View>
      </Modal>

      <NativeTimePickerModal
        visible={!!timeConfigTarget}
        title={
          timeConfigTarget?.field === 'startTime'
            ? tApp(appLanguage, 'agenda_time_config_open')
            : tApp(appLanguage, 'agenda_time_config_close')
        }
        initialValue={
          timeConfigTarget
            ? timeConfigTarget.scope === 'lunch'
              ? timeConfigTarget.field === 'startTime'
                ? availabilitySettings.lunchBreakStart
                : availabilitySettings.lunchBreakEnd
              : availabilitySettings.weeklySchedule.find(
                  (item) => item.weekday === timeConfigTarget.weekday
                )?.[timeConfigTarget.field]
            : undefined
        }
        onClose={() => setTimeConfigTarget(null)}
        onConfirm={(value) => {
          if (!timeConfigTarget) return;
          updateWeeklyDayTime(timeConfigTarget, value);
        }}
        minuteStep={15}
        gridMinuteStep={1}
      />

      <NativeDatePickerModal
        visible={!!vacationPickerTarget}
        title={
          vacationPickerTarget === 'start'
            ? tApp(appLanguage, 'agenda_vacation_picker_start')
            : tApp(appLanguage, 'agenda_vacation_picker_end')
        }
        initialValue={
          vacationPickerTarget === 'start'
            ? vacationStartInput || todayDate
            : vacationEndInput || vacationStartInput || todayDate
        }
        onClose={() => setVacationPickerTarget(null)}
        onConfirm={(value) => {
          if (vacationPickerTarget === 'start') {
            setVacationStartInput(value);
            if (vacationEndInput && vacationEndInput < value) {
              setVacationEndInput(value);
            }
          } else if (vacationPickerTarget === 'end') {
            setVacationEndInput(value);
            if (vacationStartInput && vacationStartInput > value) {
              setVacationStartInput(value);
            }
          }
          setVacationPickerTarget(null);
        }}
      />

      <NumberPickerModal
        visible={showSlotIntervalPicker}
        title={tApp(appLanguage, 'agenda_slot_interval_title')}
        initialValue={availabilitySettings.slotIntervalMinutes}
        onClose={() => setShowSlotIntervalPicker(false)}
        onConfirm={(value) => applySlotIntervalChange(Number(value))}
        min={15}
        max={300}
        step={15}
        gridStep={1}
        suffix=" min"
        presets={SLOT_INTERVAL_OPTIONS}
      />

      <NumberPickerModal
        visible={showWeekVisibleDaysPicker}
        title="Giorni visibili in settimana"
        initialValue={availabilitySettings.weekVisibleDays}
        onClose={() => setShowWeekVisibleDaysPicker(false)}
        onConfirm={(value) => {
          setAvailabilitySettings((current) => ({
            ...current,
            weekVisibleDays: Number(value),
          }));
          setShowWeekVisibleDaysPicker(false);
        }}
        min={1}
        max={7}
        step={1}
        gridStep={1}
        suffix=" giorni"
        presets={WEEK_VISIBLE_DAYS_OPTIONS}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 54,
    paddingBottom: 128,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8a8a8a',
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: IS_ANDROID ? 22 : 16,
    paddingTop: 0,
    paddingBottom: 4,
    marginBottom: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  screenHeaderRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
    gap: 3,
  },
  screenBrandChip: {
    maxWidth: '88%',
    marginTop: 6,
    marginBottom: 4,
    alignItems: 'center',
  },
  screenBrandChipText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: IS_ANDROID ? 0.8 : 1.6,
    color: PALETTE.TEXT_MUTED,
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  heroSubtitle: {
    maxWidth: 320,
    fontSize: 12,
    color: PALETTE.TEXT_SECONDARY,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: PALETTE.TEXT_PRIMARY,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: PALETTE.TEXT_SECONDARY,
    lineHeight: 20,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 18,
    marginTop: -6,
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  inlinePlannerCard: {
    backgroundColor: PALETTE.CARD,
    borderRadius: 26,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.17,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  inlinePlannerStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 0,
    paddingTop: 24,
    paddingBottom: 10,
  },
  inlinePlannerStepTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inlinePlannerStepRowCentered: {
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bookingHeaderLeft: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  bookingHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  bookingHeading: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: IS_ANDROID ? 0 : -0.4,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  bookingBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  monthTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'capitalize',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  sectionBlock: {
    marginBottom: 8,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sectionBlockLast: {
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  sectionBlockLocked: {
    opacity: 0.82,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  sectionTitleRowCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  sectionTitleActionWrap: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stepPill: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: '#111827',
    color: '#ffffff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 10,
    fontWeight: '800',
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    marginRight: 9,
    paddingTop: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'left',
    letterSpacing: IS_ANDROID ? 0 : -0.25,
    includeFontPadding: true,
  },
  sectionTitleCentered: {
    flex: 0,
    textAlign: 'center',
  },
  sectionAddChip: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderRadius: 999,
    minHeight: 36,
    minWidth: 146,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionAddChipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  sectionMiniAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.14)',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionMiniActionActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
    shadowOpacity: 0.1,
  },
  sectionMiniActionText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sectionMiniActionTextActive: {
    color: '#ffffff',
  },
  sectionHint: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 17,
    color: '#475569',
    fontWeight: '700',
    textAlign: 'left',
    width: '100%',
    paddingRight: IS_ANDROID ? 2 : 0,
  },
  lockedSectionText: {
    fontSize: 11,
    color: '#7a8597',
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 8,
    textAlign: 'left',
  },
  operatorAutoInfoCard: {
    marginBottom: 10,
    backgroundColor: '#eef6ff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#cfe0f5',
  },
  operatorAutoInfoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1d4d7a',
    marginBottom: 4,
    textAlign: 'left',
  },
  operatorAutoInfoText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#46627f',
    textAlign: 'left',
  },
  dayPickerRow: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  dayPickerWrap: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.04)',
    paddingHorizontal: 0,
    paddingTop: IS_ANDROID ? 2 : 4,
    paddingBottom: IS_ANDROID ? 20 : 18,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  dayPickerBleedWrap: {
    marginHorizontal: IS_ANDROID ? -18 : -12,
    marginBottom: IS_ANDROID ? 2 : 4,
  },
  dayPickerEdgeSpacer: {
    height: 1,
    flexShrink: 0,
  },
  dayPickerCenterOverlay: {
    position: 'absolute',
    top: IS_ANDROID ? -12 : -10,
    bottom: IS_ANDROID ? -9 : -6,
    left: '50%',
    marginLeft: -(DAY_CARD_WIDTH / 2 + (IS_ANDROID ? 8 : 16)),
    width: DAY_CARD_WIDTH + (IS_ANDROID ? 16 : 32),
    borderRadius: 28,
    overflow: 'visible',
    zIndex: 40,
  },
  dayPickerCenterFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: 'rgba(103, 116, 137, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.16)',
    shadowColor: '#334155',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dayPickerCenterHighlight: {
    position: 'absolute',
    top: 3,
    left: 12,
    right: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 41,
  },
  dayPickerCenterInnerGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.08)',
    zIndex: 41,
  },
  dayPickerCenterCard: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -(DAY_CARD_WIDTH / 2),
    marginTop: IS_ANDROID ? -61 : -62,
    zIndex: 42,
  },
  dayCardWrap: {
    marginRight: DAY_CARD_GAP,
    marginTop: IS_ANDROID ? 1 : 4,
    overflow: 'visible',
    position: 'relative',
  },
  dayCardWrapSelected: {
    zIndex: 12,
  },
  dayCard: {
    width: DAY_CARD_WIDTH,
    height: IS_ANDROID ? 122 : 124,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: IS_ANDROID ? 6 : 8,
    paddingBottom: IS_ANDROID ? 7 : 9,
    paddingHorizontal: IS_ANDROID ? 7 : 6,
    borderWidth: 1.2,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#B8C5D6',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  dayCardAvailable: {
    backgroundColor: '#DDF5E8',
    borderColor: '#B7E3C8',
    shadowColor: '#9ED8B6',
  },
  dayCardPendingBadge: {
    position: 'absolute',
    top: IS_ANDROID ? -9 : -8,
    right: IS_ANDROID ? -8 : -7,
    minWidth: IS_ANDROID ? 30 : 28,
    height: IS_ANDROID ? 26 : 24,
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 8 : 7,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    shadowColor: '#991b1b',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  dayCardPendingBadgeText: {
    fontSize: IS_ANDROID ? 12 : 11,
    lineHeight: IS_ANDROID ? 14 : 13,
    fontWeight: '900',
    color: '#ffffff',
  },
  dayCardActive: {
    backgroundColor: '#1A2238',
    borderColor: 'rgba(101,124,178,0.55)',
    borderWidth: 2.6,
  },
  dayCardActiveShadow: {
    shadowColor: '#23314F',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 11,
  },
  dayCardClosed: {
    backgroundColor: '#F9E2E4',
    borderColor: '#E8B7BC',
    shadowColor: '#E0B2B7',
  },
  dayCardClosedSelected: {
    borderColor: 'rgba(101,124,178,0.55)',
    borderWidth: 2.6,
    backgroundColor: '#1A2238',
    shadowColor: '#23314F',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 11,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: IS_ANDROID ? 14 : 14,
    marginBottom: IS_ANDROID ? 2 : 3,
  },
  dayWeek: {
    fontSize: IS_ANDROID ? 8.7 : 10.5,
    fontWeight: '900',
    color: '#101827',
    textAlign: 'center',
    letterSpacing: 0.1,
    paddingHorizontal: IS_ANDROID ? 4 : ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
  },
  dayStatusBadge: {
    borderRadius: 999,
    minHeight: IS_ANDROID ? 19 : 20,
    paddingHorizontal: IS_ANDROID ? 6 : 8,
    paddingVertical: IS_ANDROID ? 2 : 1,
    minWidth: IS_ANDROID ? 0 : 54,
    width: IS_ANDROID ? '100%' : undefined,
    maxWidth: IS_ANDROID ? '98%' : 64,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 2,
    shadowColor: '#F2B8BF',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dayStatusBadgeClosed: {
    backgroundColor: '#F7D5D9',
    borderWidth: 1.1,
    borderColor: '#E7AAB2',
  },
  dayStatusBadgeClosedSelected: {
    backgroundColor: '#F4D3D7',
    borderWidth: 1.1,
    borderColor: 'rgba(226,143,150,0.9)',
    minHeight: IS_ANDROID ? 19 : 20,
    minWidth: IS_ANDROID ? 0 : 56,
    width: IS_ANDROID ? '100%' : undefined,
    maxWidth: IS_ANDROID ? '98%' : 66,
    paddingHorizontal: IS_ANDROID ? 6 : 8,
    paddingVertical: IS_ANDROID ? 2 : 1,
    marginBottom: IS_ANDROID ? 2 : 2,
  },
  dayStatusBadgeHoliday: {
    backgroundColor: '#F7D5D9',
    borderColor: '#E7AAB2',
  },
  dayStatusBadgeText: {
    fontSize: IS_ANDROID ? 7 : 8.8,
    lineHeight: IS_ANDROID ? 8 : 9,
    fontWeight: '900',
    color: '#C64D57',
    letterSpacing: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
    paddingHorizontal: IS_ANDROID ? 0 : ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
  },
  dayStatusBadgeTextClosedSelected: {
    color: '#C64D57',
    fontSize: IS_ANDROID ? 6.9 : 8.8,
    lineHeight: IS_ANDROID ? 8 : 9,
    fontWeight: '900',
  },
  dayStatusBadgeSpacer: {
    height: IS_ANDROID ? 18 : 18,
    marginBottom: IS_ANDROID ? 2 : 2,
  },
  dayNumber: {
    fontSize: IS_ANDROID ? 18.8 : 24,
    fontWeight: '900',
    color: '#0B1220',
    marginBottom: IS_ANDROID ? 0 : 1,
    textAlign: 'center',
    lineHeight: IS_ANDROID ? 20 : 25,
    paddingHorizontal: IS_ANDROID ? 4 : ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
  },
  dayMonth: {
    fontSize: IS_ANDROID ? 8 : 10.5,
    fontWeight: '900',
    color: '#1F2937',
    textTransform: 'capitalize',
    marginBottom: IS_ANDROID ? 2 : 4,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 4 : ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
  },
  dayCardTextActive: {
    color: '#FFFFFF',
  },
  dayCardTextSelectedDark: {
    color: '#FFFFFF',
  },
  dayCardTextClosed: {
    color: '#334155',
  },
  dayCardFooter: {
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 6 : 8,
    paddingVertical: IS_ANDROID ? 4 : 4,
    minWidth: IS_ANDROID ? 0 : 46,
    width: IS_ANDROID ? '100%' : undefined,
    maxWidth: IS_ANDROID ? '98%' : '100%',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  dayCardFooterActive: {
    backgroundColor: '#243252',
    borderColor: 'transparent',
  },
  dayCardFooterClosed: {
    backgroundColor: '#F4D3D7',
  },
  dayCardFooterAvailable: {
    backgroundColor: '#CFEEDB',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  dayCardFooterText: {
    fontSize: IS_ANDROID ? 6.7 : 8,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 0 : ANDROID_TEXT_BREATHING_ROOM,
    lineHeight: IS_ANDROID ? 7 : undefined,
    width: IS_ANDROID ? '100%' : undefined,
  },
  dayCardFooterTextActive: {
    color: '#EAF1FF',
  },
  dayCardFooterTextClosed: {
    color: '#C64D57',
  },
  dayCardFooterTextAvailable: {
    color: '#1D8F57',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    overflow: 'visible',
  },
  timeChip: {
    width: IS_ANDROID ? '24%' : '22%',
    marginHorizontal: IS_ANDROID ? '0.5%' : '1.5%',
    marginBottom: 8,
    backgroundColor: 'rgba(34,197,94,0.09)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  timeChipActive: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'transparent',
  },
  timeChipDisabled: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'transparent',
  },
  timeChipWarning: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'transparent',
  },
  timeChipUnavailable: {
    backgroundColor: '#334155',
    borderColor: 'transparent',
  },
  timeChipLocked: {
    backgroundColor: '#F8FAFC',
    borderColor: 'transparent',
  },
  timeChipPreviewActive: {
    zIndex: 30,
    elevation: 12,
  },
  slotMiniBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.24)',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 7 : 4,
    paddingVertical: 1,
    minWidth: IS_ANDROID ? 50 : 38,
    maxWidth: IS_ANDROID ? 62 : 44,
    alignItems: 'center',
  },
  slotMiniBadgeText: {
    fontSize: IS_ANDROID ? 6.6 : 7,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.1,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
    textAlign: 'center',
  },
  slotMiniBadgeAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  slotMiniBadgeBusy: {
    backgroundColor: 'rgba(71, 85, 105, 0.16)',
    borderColor: 'rgba(100, 116, 139, 0.26)',
  },
  slotMiniBadgeTextAvailable: {
    color: '#047857',
  },
  slotMiniBadgeTextBusy: {
    color: '#475569',
  },
  timeChipText: {
    fontSize: IS_ANDROID ? 12 : 13,
    fontWeight: '800',
    color: '#111111',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
    width: IS_ANDROID ? '100%' : undefined,
    textAlign: 'center',
  },
  timeChipTextActive: {
    color: '#15803d',
  },
  timeChipTextDisabled: {
    color: '#b42318',
  },
  timeChipTextWarning: {
    color: '#a16207',
  },
  timeChipTextUnavailable: {
    color: '#f9fafb',
  },
  timeChipTextLocked: {
    color: '#9ca3af',
  },
  slotPreviewBubble: {
    position: 'absolute',
    left: '50%',
    bottom: '100%',
    transform: [{ translateX: -80 }],
    width: 150,
    backgroundColor: '#1f2937',
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 40,
    marginBottom: 24,
  },
  slotPreviewItem: {
    width: '100%',
  },
  slotPreviewItemDivider: {
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.18)',
  },
  slotPreviewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f9fafb',
    marginBottom: 4,
  },
  slotPreviewText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d1d5db',
    lineHeight: 17,
  },
  slotPreviewArrow: {
    position: 'absolute',
    bottom: -12,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    backgroundColor: '#1f2937',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#374151',
    transform: [{ rotate: '45deg' }],
  },
  errorText: {
    fontSize: 12,
    color: '#a16207',
    fontWeight: '700',
    marginTop: 4,
  },
  serviceRow: {
    paddingRight: 6,
  },
  operatorSelectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -4,
  },
  operatorSelectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 4,
    marginBottom: 6,
    minWidth: 116,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  operatorSelectionCardActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  operatorSelectionName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  operatorSelectionNameActive: {
    color: '#ffffff',
  },
  operatorSelectionRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  operatorSelectionRoleActive: {
    color: '#dbe4ec',
  },
  serviceCard: {
    width: 124,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 6,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  serviceCardActive: {
    borderWidth: 2.5,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  serviceCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'left',
  },
  serviceCardPrice: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'left',
  },
  serviceCardDuration: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'left',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  agendaRoleSelectorInput: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  agendaRoleSelectorText: {
    flex: 1,
    fontSize: 14,
    color: '#111111',
    fontWeight: '700',
    textAlign: 'center',
  },
  agendaRoleSelectorPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  agendaRoleChevron: {
    fontSize: 17,
    color: '#475569',
    fontWeight: '800',
    marginLeft: 8,
  },
  agendaRolePickerPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  agendaRolePickerTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 8,
  },
  agendaRoleChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  agendaRoleChip: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
  },
  agendaRoleChipSelected: {
    backgroundColor: '#161616',
    borderColor: '#161616',
  },
  agendaRoleChipText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  agendaRoleChipTextSelected: {
    color: '#ffffff',
  },
  agendaRoleChipCreate: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  agendaRoleChipCreateText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  centeredInput: {
    textAlign: 'center',
  },
  suggestionBox: {
    backgroundColor: PALETTE.CARD,
    borderRadius: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_LIGHT,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.BORDER_SOFT,
  },
  suggestionText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  quickClientsRow: {
    paddingTop: 8,
    paddingRight: 6,
  },
  quickClientChip: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
  },
  quickClientChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  warningInlineCard: {
    backgroundColor: PALETTE.WARNING_BG,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_LIGHT,
  },
  warningInlineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: PALETTE.WARNING,
    marginBottom: 4,
    textAlign: 'center',
  },
  warningInlineText: {
    fontSize: 12,
    lineHeight: 18,
    color: PALETTE.TEXT_SECONDARY,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: PALETTE.ACCENT_PURPLE_BG,
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: PALETTE.ACCENT_PURPLE,
    marginBottom: 6,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 13,
    color: PALETTE.TEXT_SECONDARY,
    lineHeight: 19,
    textAlign: 'center',
  },
  summaryWarningText: {
    fontSize: 12,
    color: PALETTE.WARNING,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  searchCard: {
    backgroundColor: PALETTE.CARD,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    alignItems: 'stretch',
  },
  searchTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: PALETTE.TEXT_PRIMARY,
    marginBottom: 6,
    textAlign: 'left',
  },
  searchSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: PALETTE.TEXT_SECONDARY,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'left',
  },
  agendaExplorerCard: {
    backgroundColor: PALETTE.CARD,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  weekListDockCard: {
    backgroundColor: PALETTE.CARD,
    borderRadius: 16,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  agendaExplorerHeader: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  agendaExplorerEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: PALETTE.TEXT_MUTED,
    letterSpacing: 0.5,
    textAlign: 'left',
    marginBottom: 3,
  },
  agendaExplorerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: PALETTE.TEXT_PRIMARY,
    textAlign: 'left',
    marginBottom: 6,
  },
  agendaExplorerTitleCompact: {
    fontSize: 16,
    fontWeight: '900',
    color: PALETTE.TEXT_PRIMARY,
    textAlign: 'left',
  },
  agendaExplorerText: {
    fontSize: 12,
    lineHeight: 17,
    color: PALETTE.TEXT_SECONDARY,
    textAlign: 'left',
  },
  agendaViewGrid: {
    gap: 8,
  },
  agendaViewCard: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 72,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  agendaViewCardActive: {
    borderWidth: 1,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  agendaViewCardTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  agendaViewCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  agendaViewEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: PALETTE.TEXT_MUTED,
    marginBottom: 2,
    textAlign: 'left',
  },
  agendaViewEyebrowActive: {
    color: PALETTE.TEXT_PRIMARY,
  },
  agendaViewTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: PALETTE.TEXT_PRIMARY,
    marginBottom: 2,
    textAlign: 'left',
  },
  agendaViewTitleActive: {
    color: PALETTE.TEXT_PRIMARY,
  },
  agendaViewMeta: {
    fontSize: 11,
    lineHeight: 15,
    color: PALETTE.TEXT_SECONDARY,
    fontWeight: '700',
    textAlign: 'left',
  },
  agendaViewMetaActive: {
    color: PALETTE.TEXT_SECONDARY,
  },
  agendaViewCountBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: PALETTE.CARD,
    borderWidth: 1.2,
    borderColor: PALETTE.BORDER_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  agendaViewCountBadgeActive: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  agendaViewCountText: {
    fontSize: 14,
    fontWeight: '900',
    color: PALETTE.TEXT_PRIMARY,
  },
  agendaViewCountTextActive: {
    color: PALETTE.CARD,
  },
  agendaViewNote: {
    fontSize: 10,
    lineHeight: 13,
    color: PALETTE.TEXT_SECONDARY,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 220,
  },
  agendaViewNoteActive: {
    color: PALETTE.TEXT_SECONDARY,
  },
  agendaFocusStrip: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  agendaFocusStripCompact: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  agendaFocusStripEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  agendaFocusStripEyebrowCompact: {
    fontSize: 10,
    marginBottom: 2,
  },
  agendaFocusStripTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  agendaFocusStripTitleCompact: {
    fontSize: 14,
    marginBottom: 3,
  },
  agendaFocusStripText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  agendaFocusStripTextCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  weekPlannerCard: {
    marginTop: 0,
    marginHorizontal: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  weekPlannerHeader: {
    marginBottom: 0,
  },
  weekPlannerInlineNavRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 8,
  },
  weekPlannerHeaderNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  weekPlannerHeaderCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekPlannerNavSide: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  weekPlannerHeaderActions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 0,
  },
  weekPlannerHeaderTextWrap: {
    width: '100%',
    marginBottom: 0,
    alignItems: 'center',
  },
  weekPlannerNavButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1.6,
    borderColor: '#cfdceb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  weekPlannerDaysButton: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d7e2ea',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  weekPlannerDaysButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
  },
  weekPlannerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 1,
    textAlign: 'center',
  },
  weekPlannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 2,
    textAlign: 'center',
  },
  weekPlannerSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  weekPlannerLegendRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: 0,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: PALETTE.CARD,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    borderRadius: 999,
  },
  weekLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 7 : 8,
    paddingVertical: 4,
    minWidth: 0,
    maxWidth: IS_ANDROID ? 132 : 156,
    justifyContent: 'center',
    flexShrink: 1,
  },
  weekLegendDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  weekLegendDotAvailable: {
    backgroundColor: '#34d399',
  },
  weekLegendDotBooked: {
    backgroundColor: '#111827',
  },
  weekLegendDotBlocked: {
    backgroundColor: '#f59e0b',
  },
  weekLegendText: {
    fontSize: IS_ANDROID ? 9.5 : 10,
    fontWeight: '700',
    color: PALETTE.TEXT_SECONDARY,
    width: 'auto',
    textAlign: 'center',
  },
  weekPlannerGridShell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weekPlannerOverlayHost: {
    width: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  weekPlannerDragLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    overflow: 'visible',
  },
  weekPlannerTableShell: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginLeft: -WEEK_PLANNER_EDGE_BLEED_LEFT,
    marginRight: -WEEK_PLANNER_EDGE_BLEED_RIGHT,
    overflow: 'visible',
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.BORDER_SOFT,
  },
  weekPlannerGridScroller: {
    flex: 1,
    minWidth: 0,
    marginRight: -WEEK_PLANNER_EDGE_BLEED_RIGHT,
    overflow: 'visible',
  },
  weekPlannerTimeColumn: {
    width: 43,
    marginRight: 0,
    flexShrink: 0,
    paddingLeft: 0,
    paddingRight: 0,
  },
  weekPlannerCornerCell: {
    height: WEEK_PLANNER_DAY_HEADER_TOTAL_HEIGHT,
    position: 'relative',
  },
  weekPlannerTimeCell: {
    height: WEEK_PLANNER_ROW_HEIGHT,
    marginBottom: WEEK_PLANNER_ROW_GAP,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingLeft: 0,
    paddingRight: 0,
  },
  weekPlannerHourGuide: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'transparent',
  },
  weekPlannerTimeText: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    textAlign: 'left',
    flexShrink: 1,
    width: '100%',
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  weekPlannerCornerTimeText: {
    bottom: -2,
  },
  weekPlannerTimeTextHour: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    color: '#334155',
  },
  weekPlannerTimeTextMinor: {
    fontSize: 8.5,
    lineHeight: 10.5,
    fontWeight: '800',
    color: '#64748b',
  },
  weekPlannerDayColumn: {
    width: WEEK_PLANNER_DAY_WIDTH,
    marginRight: WEEK_PLANNER_COLUMN_GAP,
    position: 'relative',
    overflow: 'visible',
    zIndex: 1,
  },
  weekPlannerDayColumnWithBadge: {
    zIndex: 18,
  },
  weekPlannerDayColumnSelected: {
    zIndex: 20,
  },
  weekPlannerDayColumnLast: {
    marginRight: 0,
  },
  weekPlannerDayHeader: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_LIGHT,
    paddingHorizontal: 2,
    paddingVertical: 3,
    marginBottom: 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  weekPlannerDayHeaderWithBadge: {
    zIndex: 22,
  },
  weekPlannerDayHeaderActive: {
    backgroundColor: PALETTE.PRIMARY,
    borderColor: PALETTE.BORDER_LIGHT,
  },
  weekPlannerDayHeaderClosed: {
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  weekPlannerDayHeaderHoliday: {
    backgroundColor: '#FFF7ED',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  weekPlannerDayLabelStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  weekPlannerDayWeekLabel: {
    width: '100%',
    fontSize: 8.6,
    lineHeight: 10,
    fontWeight: '900',
    color: PALETTE.TEXT_SECONDARY,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
    includeFontPadding: false,
  },
  weekPlannerDayWeekLabelActive: {
    color: '#ffffff',
    textShadowColor: 'rgba(15,23,42,0.35)',
  },
  weekPlannerDayWeekLabelClosed: {
    color: '#7C8AA0',
    textShadowColor: 'rgba(255,255,255,0.3)',
  },
  weekPlannerDayNumberLabel: {
    width: '100%',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    includeFontPadding: false,
  },
  weekPlannerDayNumberLabelActive: {
    color: '#ffffff',
  },
  weekPlannerDayNumberLabelClosed: {
    color: '#475569',
  },
  weekPlannerDayPendingBadge: {
    position: 'absolute',
    top: -10,
    right: -9,
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 7,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    shadowColor: '#991b1b',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  weekPlannerDayPendingBadgeText: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  weekPlannerDayMeta: {
    display: 'none',
  },
  weekPlannerDayMetaActive: {
    display: 'none',
  },
  weekPlannerCellWrap: {
    height: WEEK_PLANNER_ROW_HEIGHT,
    marginBottom: WEEK_PLANNER_ROW_GAP,
    position: 'relative',
  },
  weekPlannerCellHourGuide: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.12)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  weekPlannerCellHourGuideLead: {
    position: 'absolute',
    bottom: -1,
    left: -43,
    width: 43,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.24)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  weekPlannerCell: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: PALETTE.BORDER_SOFT,
    backgroundColor: PALETTE.CARD,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  weekPlannerCellAvailable: {
    backgroundColor: PALETTE.SUCCESS_BG,
    borderColor: PALETTE.BORDER_SOFT,
  },
  weekPlannerCellBlocked: {
    backgroundColor: PALETTE.WARNING_BG,
    borderColor: PALETTE.BORDER_SOFT,
  },
  weekPlannerCellPast: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderColor: PALETTE.BORDER_SOFT,
  },
  weekPlannerCellOutside: {
    backgroundColor: PALETTE.CARD_SECONDARY,
    borderColor: PALETTE.BORDER_SOFT,
  },
  weekPlannerCellClosedDay: {
    backgroundColor: '#F1F5F9',
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  weekPlannerCellDropTarget: {
    borderColor: PALETTE.BORDER_LIGHT,
    backgroundColor: PALETTE.ACCENT_TEAL_BG,
  },
  weekPlannerCellDropInvalid: {
    borderColor: PALETTE.BORDER_LIGHT,
    backgroundColor: PALETTE.DANGER_BG,
  },
  weekPlannerCellSwapPreview: {
    borderColor: PALETTE.BORDER_LIGHT,
    backgroundColor: PALETTE.PRIMARY_SOFT,
  },
  weekPlannerCellContinuation: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    opacity: 0.45,
  },
  weekPlannerCellText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16a34a',
    textAlign: 'center',
  },
  weekPlannerCellTextAvailable: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '400',
    color: '#17834b',
  },
  weekPlannerCellTextMuted: {
    color: '#94a3b8',
  },
  weekPlannerCellTextPast: {
    color: '#9ca3af',
  },
  weekPlannerBookedCell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'visible',
  },
  weekPlannerOperatorLaneRow: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  weekPlannerOperatorLaneCell: {
    height: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  weekPlannerOperatorLaneQuickCell: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 1,
  },
  weekPlannerOperatorLaneText: {
    fontSize: 18,
    lineHeight: 18,
  },
  weekAppointmentBlock: {
    width: '100%',
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'center',
    overflow: 'visible',
  },
  weekAppointmentBlockCompact: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  weekAppointmentPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: IS_ANDROID ? 4 : 5,
    paddingVertical: IS_ANDROID ? 3 : 5,
  },
  weekAppointmentPressableCompact: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  weekAppointmentPressableCompactOnlyName: {
    paddingHorizontal: IS_ANDROID ? 4 : 6,
    paddingVertical: IS_ANDROID ? 2 : 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  weekAppointmentPressableCompactOnlyNameNarrow: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  weekAppointmentPressableCompactOnlyNameWithBadge: {
    paddingTop: 24,
  },
  weekAppointmentPressableCompactOnlyNameRoomyLane: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },
  weekAppointmentPressableCompactStack: {
    paddingHorizontal: 4,
    paddingVertical: 5,
    justifyContent: 'center',
    gap: 4,
  },
  weekAppointmentPressableTall: {
    paddingHorizontal: 5,
    paddingVertical: 6,
    justifyContent: 'space-between',
  },
  weekAppointmentPressableTallDetailed: {
    flexDirection: 'column',
    paddingHorizontal: IS_ANDROID ? 3 : 6,
    paddingVertical: IS_ANDROID ? 2 : 6,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  weekAppointmentPressableTallDetailedWithBadge: {
    paddingTop: IS_ANDROID ? 16 : 18,
  },
  weekAppointmentPressableTallDetailedWithPhotoBadge: {
    paddingTop: IS_ANDROID ? 18 : 20,
  },
  weekAppointmentPressableTallDetailedNarrow: {
    paddingHorizontal: IS_ANDROID ? 2 : 4,
    paddingVertical: IS_ANDROID ? 1 : 4,
  },
  weekAppointmentPressableTallDetailedTight: {
    paddingHorizontal: IS_ANDROID ? 1.5 : 3,
    paddingVertical: 1,
  },
  weekAppointmentPressableTallDetailedUltraTight: {
    paddingHorizontal: 1,
    paddingVertical: 0.5,
  },
  weekAppointmentPressableHorizontalDetailed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  weekAppointmentPressableHorizontalDetailedWithBadge: {
    paddingTop: 22,
  },
  weekAppointmentUniversalPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  weekAppointmentUniversalPressableWithBadge: {
    paddingTop: 22,
  },
  weekAppointmentUniversalPressableLane: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  weekAppointmentUniversalVertical: {
    flexDirection: 'column',
  },
  weekAppointmentUniversalHorizontal: {
    flexDirection: 'row',
    gap: 8,
  },
  weekAppointmentUniversalHorizontalTimeWrap: {
    minWidth: 44,
    maxWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  weekAppointmentUniversalStack: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekAppointmentUniversalLine: {
    width: '100%',
    textAlign: 'center',
    color: '#111111',
    fontWeight: '800',
    includeFontPadding: false,
  },
  weekAppointmentUniversalTime: {
    fontWeight: '900',
    letterSpacing: 0.02,
  },
  weekAppointmentUniversalOperator: {
    color: '#1f2937',
    opacity: 0.96,
    textTransform: 'uppercase',
    letterSpacing: 0.02,
  },
  weekAppointmentUniversalClient: {
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  weekAppointmentUniversalMeta: {
    color: '#334155',
    opacity: 0.96,
    textTransform: 'uppercase',
    letterSpacing: 0.03,
  },
  weekAppointmentUniversalService: {
    color: '#111111',
    opacity: 0.94,
    textTransform: 'uppercase',
    letterSpacing: 0.03,
  },
  weekPendingRequestBadge: {
    position: 'absolute',
    top: -10,
    right: -9,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 18,
    shadowColor: '#991b1b',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  weekAppointmentSourceBadge: {
    position: 'relative',
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.96)',
  },
  weekAppointmentSourceBadgeWrap: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    pointerEvents: 'none',
  },
  weekAppointmentSourceBadgeSalon: {
    backgroundColor: '#0f172a',
  },
  weekAppointmentSourceBadgeOperator: {
    backgroundColor: '#ffffff',
  },
  weekAppointmentSourceBadgeOperatorPhoto: {
    width: 20,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  weekAppointmentSourceBadgeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    resizeMode: 'cover',
  },
  weekAppointmentSourceBadgeSalonText: {
    fontSize: 8.5,
    lineHeight: 9,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0,
  },
  weekPendingRequestBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  weekAppointmentBlockDragging: {
    zIndex: 50,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
    opacity: 0,
  },
  weekPlannerDragCaptureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 55,
  },
  weekAppointmentFloatingOverlay: {
    position: 'absolute',
    zIndex: 60,
    borderRadius: 6,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
    overflow: 'visible',
  },
  weekAppointmentFloatingOverlayDense: {
    borderRadius: 16,
    borderWidth: 2,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  weekAppointmentBlockDropTarget: {
    borderColor: '#0f766e',
    borderWidth: 2,
  },
  weekAppointmentBlockDropInvalid: {
    borderColor: '#b91c1c',
    borderWidth: 2,
  },
  weekAppointmentBlockSwapPreview: {
    borderColor: '#111827',
    borderWidth: 2,
  },
  weekAppointmentTime: {
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    width: '100%',
    textAlign: 'center',
    letterSpacing: 0.15,
    opacity: 0.9,
  },
  weekAppointmentTimeCompact: {
    fontSize: 9,
    lineHeight: 10,
    marginBottom: 2,
  },
  weekAppointmentClient: {
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 1,
    width: '100%',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  weekAppointmentClientTiny: {
    fontSize: 15,
    lineHeight: 15,
    marginBottom: 0,
  },
  weekAppointmentClientCompact: {
    fontSize: 14,
    lineHeight: 14,
    textAlign: 'left',
    marginBottom: 0,
  },
  weekAppointmentClientSurname: {
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '800',
    color: '#111111',
    marginTop: -1,
    marginBottom: 3,
    width: '100%',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.15,
    opacity: 0.94,
  },
  weekAppointmentClientSurnameMedium: {
    marginBottom: 2,
  },
  weekAppointmentService: {
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#111111',
    marginBottom: 0,
    opacity: 0.9,
    width: '100%',
    textAlign: 'left',
  },
  weekAppointmentServiceCompact: {
    fontSize: 10,
    lineHeight: 10,
  },
  weekAppointmentClientSurnameCompact: {
    fontSize: 11,
    lineHeight: 11,
    marginTop: -1,
    marginBottom: 2,
  },
  weekAppointmentOperator: {
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '700',
    color: '#64748b',
    opacity: 0.9,
    width: '100%',
    textAlign: 'left',
    marginTop: 3,
    letterSpacing: 0.15,
  },
  weekAppointmentOperatorCompact: {
    fontSize: 8,
    lineHeight: 9,
    marginTop: 2,
  },
  weekAppointmentClientInline: {
    width: '100%',
    fontSize: 13,
    lineHeight: 14,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.12,
  },
  weekAppointmentClientInlineTiny: {
    fontSize: 12,
    lineHeight: 13,
  },
  weekAppointmentClientInlineLarge: {
    width: '100%',
    fontSize: IS_ANDROID ? 13.5 : 15,
    lineHeight: IS_ANDROID ? 15 : 16,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0 : 0.04,
  },
  weekAppointmentClientInlineLargeNarrow: {
    fontSize: IS_ANDROID ? 11.5 : 12.5,
    lineHeight: IS_ANDROID ? 12.5 : 14,
  },
  weekAppointmentClientInlineLargeUltraTight: {
    fontSize: IS_ANDROID ? 9.6 : 10.4,
    lineHeight: IS_ANDROID ? 10.2 : 11,
  },
  weekAppointmentClientCompactSingle: {
    width: '100%',
    fontSize: 11.5,
    lineHeight: 12,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.08,
  },
  weekAppointmentClientInlineLaneOperator: {
    fontSize: IS_ANDROID ? 10.2 : 11.4,
    lineHeight: IS_ANDROID ? 11 : 12,
    letterSpacing: 0,
  },
  weekAppointmentClientInlineLaneOperatorVertical: {
    width: '100%',
    textAlign: 'center',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  weekAppointmentClientInlineLaneOperatorRoomy: {
    width: '100%',
    textAlign: 'center',
    letterSpacing: 0.02,
  },
  weekAppointmentCompactMetaCentered: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '800',
    color: '#475569',
    opacity: 0.92,
    letterSpacing: 0.02,
  },
  weekAppointmentHorizontalTimeWrap: {
    minWidth: 34,
    maxWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  weekAppointmentHorizontalTimePrimary: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '900',
    color: '#111111',
    letterSpacing: 0.02,
  },
  weekAppointmentHorizontalTimeSecondary: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '800',
    color: '#475569',
    opacity: 0.92,
    letterSpacing: 0.02,
  },
  weekAppointmentHorizontalMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    gap: 1,
  },
  weekAppointmentHorizontalClient: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '900',
    color: '#111111',
    textTransform: 'uppercase',
    letterSpacing: 0.02,
  },
  weekAppointmentHorizontalService: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '800',
    color: '#111111',
    opacity: 0.9,
    textTransform: 'uppercase',
    letterSpacing: 0.02,
  },
  weekAppointmentHorizontalOperator: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '800',
    color: '#334155',
    opacity: 0.94,
    textTransform: 'uppercase',
    letterSpacing: 0.02,
  },
  weekAppointmentClientStacked: {
    width: '100%',
    fontSize: 14,
    lineHeight: 15,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.12,
    marginBottom: 2,
  },
  weekAppointmentServiceStacked: {
    width: '100%',
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    fontStyle: 'italic',
    opacity: 0.92,
  },
  weekAppointmentTimeVertical: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 3,
    flexShrink: 0,
  },
  weekAppointmentTimeVerticalNarrow: {
    marginBottom: 2,
  },
  weekAppointmentTimeVerticalTight: {
    marginBottom: 1,
  },
  weekAppointmentTimeVerticalUltraTight: {
    marginBottom: 0,
  },
  weekAppointmentTimeHour: {
    fontSize: IS_ANDROID ? 9 : 10,
    lineHeight: IS_ANDROID ? 10 : 11,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    letterSpacing: 0.04,
    opacity: 0.95,
  },
  weekAppointmentTimeHourNarrow: {
    fontSize: IS_ANDROID ? 8 : 8.6,
    lineHeight: IS_ANDROID ? 9 : 10,
  },
  weekAppointmentTimeHourTight: {
    fontSize: IS_ANDROID ? 7 : 7.8,
    lineHeight: IS_ANDROID ? 8 : 8.8,
  },
  weekAppointmentTimeHourUltraTight: {
    fontSize: IS_ANDROID ? 6.2 : 6.8,
    lineHeight: IS_ANDROID ? 6.8 : 7.6,
  },
  weekAppointmentTimeMinute: {
    fontSize: IS_ANDROID ? 8.2 : 9,
    lineHeight: IS_ANDROID ? 9 : 10,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
    letterSpacing: 0.04,
    opacity: 0.92,
  },
  weekAppointmentTimeMinuteNarrow: {
    fontSize: IS_ANDROID ? 7.2 : 8,
    lineHeight: IS_ANDROID ? 8 : 9,
  },
  weekAppointmentTimeMinuteTight: {
    fontSize: IS_ANDROID ? 6.4 : 7,
    lineHeight: IS_ANDROID ? 7.2 : 8,
  },
  weekAppointmentTimeMinuteUltraTight: {
    fontSize: IS_ANDROID ? 5.8 : 6.4,
    lineHeight: IS_ANDROID ? 6.4 : 7.2,
  },
  weekAppointmentClientNameVertical: {
    width: '100%',
    fontSize: IS_ANDROID ? 12.4 : 14,
    lineHeight: IS_ANDROID ? 14 : 16,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0 : 0.04,
    marginBottom: 1,
    flexShrink: 0,
  },
  weekAppointmentClientNameVerticalNarrow: {
    fontSize: IS_ANDROID ? 10.6 : 11.8,
    lineHeight: IS_ANDROID ? 12 : 13,
    marginBottom: 0,
  },
  weekAppointmentClientNameVerticalTight: {
    fontSize: IS_ANDROID ? 9.2 : 10.2,
    lineHeight: IS_ANDROID ? 10.2 : 11.2,
    marginBottom: 0,
  },
  weekAppointmentClientNameVerticalUltraTight: {
    fontSize: IS_ANDROID ? 8 : 8.8,
    lineHeight: IS_ANDROID ? 8.8 : 9.6,
    marginBottom: 0,
  },
  weekAppointmentClientSurnameVertical: {
    width: '100%',
    fontSize: IS_ANDROID ? 9.6 : 11,
    lineHeight: IS_ANDROID ? 11 : 13,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0 : 0.04,
    marginTop: -1,
    marginBottom: 2,
    flexShrink: 0,
  },
  weekAppointmentClientSurnameVerticalNarrow: {
    fontSize: IS_ANDROID ? 8.2 : 9.2,
    lineHeight: IS_ANDROID ? 9.2 : 10.5,
    marginBottom: 1,
  },
  weekAppointmentClientSurnameVerticalTight: {
    fontSize: IS_ANDROID ? 7 : 7.8,
    lineHeight: IS_ANDROID ? 8 : 9,
    marginBottom: 1,
  },
  weekAppointmentClientSurnameVerticalUltraTight: {
    fontSize: IS_ANDROID ? 6 : 6.8,
    lineHeight: IS_ANDROID ? 6.8 : 7.6,
    marginBottom: 0,
  },
  weekAppointmentServiceVertical: {
    width: '100%',
    fontSize: IS_ANDROID ? 9.4 : 11,
    lineHeight: IS_ANDROID ? 11 : 13,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    textTransform: 'uppercase',
    fontStyle: 'italic',
    opacity: 0.9,
    marginBottom: 3,
    flexShrink: 0,
  },
  weekAppointmentServiceVerticalNarrow: {
    fontSize: IS_ANDROID ? 8 : 9,
    lineHeight: IS_ANDROID ? 9.2 : 10.2,
    marginBottom: 2,
  },
  weekAppointmentServiceVerticalTight: {
    fontSize: IS_ANDROID ? 6.8 : 7.6,
    lineHeight: IS_ANDROID ? 7.8 : 8.6,
    marginBottom: 1,
  },
  weekAppointmentServiceVerticalUltraTight: {
    fontSize: IS_ANDROID ? 5.8 : 6.6,
    lineHeight: IS_ANDROID ? 6.6 : 7.4,
    marginBottom: 0,
  },
  weekAppointmentOperatorPill: {
    minHeight: 18,
    paddingHorizontal: IS_ANDROID ? 7 : 5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  weekAppointmentOperatorPillWithPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekAppointmentOperatorPillNarrow: {
    minHeight: 16,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  weekAppointmentOperatorPillTight: {
    minHeight: 14,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  weekAppointmentOperatorPillText: {
    fontSize: IS_ANDROID ? 7.2 : 8,
    lineHeight: IS_ANDROID ? 9 : 10,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0 : 0.04,
    width: IS_ANDROID ? '100%' : undefined,
  },
  weekAppointmentOperatorPillAvatar: {
    borderRadius: 999,
  },
  weekAppointmentOperatorPillTextNarrow: {
    fontSize: IS_ANDROID ? 6.6 : 7.2,
    lineHeight: IS_ANDROID ? 8 : 9,
  },
  weekAppointmentOperatorPillTextTight: {
    fontSize: IS_ANDROID ? 6 : 6.6,
    lineHeight: IS_ANDROID ? 7 : 8,
  },
  operationalList: {
    marginTop: 12,
    gap: 10,
  },
  operationalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  operationalCardMain: {
    flex: 1,
  },
  operationalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  operationalMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  operationalSubmeta: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    fontWeight: '600',
  },
  operationalBadge: {
    minWidth: 78,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
  },
  operationalBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  operationalActionsColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  operationalStatusButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  operationalStatusButtonActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  operationalStatusButtonInactive: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  operationalStatusButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  operationalStatusButtonTextActive: {
    color: '#166534',
  },
  operationalStatusButtonTextInactive: {
    color: '#475569',
  },
  operationalDeleteButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
  },
  operationalDeleteButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
  },
  compactTopInput: {
    marginTop: 12,
  },
  quickBookingModalCard: {
    width: '96%',
    maxWidth: 760,
    height: '91%',
    maxHeight: '94%',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  modalKeyboardAvoider: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingBottom: 12,
  },
  quickBookingScroll: {
    flex: 1,
  },
  quickBookingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.05)',
  },
  quickBookingHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  quickBookingDateTitle: {
    fontSize: IS_ANDROID ? 14 : 15,
    lineHeight: 20,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 6,
    width: '100%',
  },
  quickBookingContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 220,
  },
  quickSectionBlock: {
    marginBottom: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.04)',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  quickBookingSectionTitle: {
    fontSize: IS_ANDROID ? 14 : 15,
    fontWeight: '900',
    color: '#111827',
    marginTop: 0,
    marginBottom: 0,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  quickSectionHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: IS_ANDROID ? 8 : 12,
    marginBottom: 8,
  },
  quickSectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  quickInlineAddButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 10 : 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    marginLeft: 'auto',
    minWidth: IS_ANDROID ? 94 : undefined,
  },
  quickInlineAddButtonText: {
    fontSize: IS_ANDROID ? 10 : 11,
    fontWeight: '800',
    color: '#334155',
  },
  quickServiceSearchWrap: {
    marginTop: 6,
    marginBottom: 4,
    gap: 10,
  },
  quickServiceSearchInput: {
    marginTop: 0,
  },
  quickServiceColumnsScrollContent: {
    gap: 8,
    paddingRight: 8,
    paddingLeft: 2,
    alignItems: 'flex-start',
  },
  quickServiceColumn: {
    gap: 6,
  },
  quickServiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    alignItems: 'stretch',
    paddingRight: 0,
  },
  quickServiceCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 90,
    maxHeight: 90,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  quickServiceCardSelected: {
    borderWidth: 2,
    borderColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  quickServiceCardSelectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  quickServiceCardSelectedBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  quickServiceCardTitleSelected: {
    color: '#020617',
  },
  quickServiceCardMetaSelected: {
    color: '#334155',
    fontWeight: '800',
  },
  quickServiceCardDisabled: {
    opacity: 0.42,
  },
  quickServiceCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12.5,
    color: '#111827',
    marginBottom: 3,
    textAlign: 'center',
    paddingTop: 0,
    width: '100%',
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  quickServiceRoleBadge: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '800',
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 3,
    textAlign: 'center',
    maxWidth: '100%',
    alignSelf: 'center',
    flexShrink: 1,
  },
  quickServiceRoleBadgeSelected: {
    color: '#334155',
  },
  quickServiceDuration: {
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 10,
    color: '#475569',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
    flexShrink: 1,
  },
  quickServiceCardMeta: {
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 10,
    color: '#475569',
    textAlign: 'center',
    width: '100%',
    flexShrink: 1,
  },
  quickServicePrice: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    width: '100%',
    flexShrink: 1,
  },
  quickServicePriceSelected: {
    color: '#020617',
  },
  quickServiceCardStatus: {
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 10,
    color: '#475569',
    textAlign: 'center',
    width: '100%',
    marginTop: 2,
    paddingHorizontal: 2,
    flexShrink: 1,
  },
  quickBookingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBookingChip: {
    minWidth: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 13,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  quickBookingChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  quickBookingChipDisabled: {
    opacity: 0.3,
  },
  quickBookingChipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  quickBookingChipTitleActive: {
    color: '#ffffff',
  },
  quickBookingChipMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  quickBookingChipMetaActive: {
    color: '#cbd5e1',
  },
  quickBookingInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  quickCustomerColumnsScrollContent: {
    gap: IS_ANDROID ? 4 : 6,
    paddingRight: 8,
    paddingLeft: 2,
    alignItems: 'flex-start',
  },
  quickCustomerColumn: {
    gap: IS_ANDROID ? 4 : 6,
  },
  quickCustomerChip: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: IS_ANDROID ? 14 : 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    minHeight: IS_ANDROID ? 50 : 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickCustomerChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  quickCustomerChipText: {
    fontSize: IS_ANDROID ? 11 : 11.5,
    fontWeight: '800',
    lineHeight: 16,
    color: '#334155',
    textAlign: 'center',
    width: '100%',
  },
  quickCustomerChipTextActive: {
    color: '#ffffff',
  },
  quickCustomerSearchInlineWrap: {
    marginTop: 6,
    gap: 10,
  },
  quickCustomerSearchInput: {
    marginTop: 0,
  },
  quickCustomerSearchInlineResults: {
    maxHeight: 220,
  },
  quickCustomerSearchInlineResultsContent: {
    gap: 8,
    paddingBottom: 4,
  },
  quickCustomerAddChip: {
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quickCustomerAddChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9a3412',
  },
  quickCustomerComposer: {
    marginTop: 12,
    marginBottom: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  quickCustomerSearchModalCard: {
    width: '94%',
    maxWidth: 560,
    maxHeight: '82%',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 16,
  },
  quickCustomerSearchResults: {
    marginTop: 12,
    flexGrow: 0,
  },
  quickCustomerSearchResultsContent: {
    gap: 8,
    paddingBottom: 8,
  },
  quickCustomerSearchItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    gap: 4,
  },
  quickCustomerSearchItemActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  quickCustomerSearchItemTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  quickCustomerSearchItemTitleActive: {
    color: '#ffffff',
  },
  quickCustomerSearchItemMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#64748b',
  },
  quickCustomerSearchItemMetaActive: {
    color: '#cbd5e1',
  },
  quickCustomerSearchEmptyCard: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  quickCustomerSearchEmptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
  },
  quickCustomerSearchEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748b',
  },
  quickEmptyServiceCard: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quickEmptyServiceTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9a3412',
    marginBottom: 4,
  },
  quickEmptyServiceText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#9a3412',
  },
  quickEmptyServiceButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickEmptyServiceButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  inlineComposerCard: {
    marginTop: 10,
    marginBottom: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  servicePickerModalCard: {
    width: '96%',
    maxWidth: 720,
    height: '88%',
    maxHeight: '93%',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
  },
  servicePickerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  servicePickerField: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  servicePickerFieldDisabled: {
    opacity: 0.6,
  },
  servicePickerFieldTextWrap: {
    flex: 1,
  },
  servicePickerLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  servicePickerPlaceholder: {
    color: '#64748b',
  },
  servicePickerMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748b',
  },
  quickBookingSummaryCard: {
    marginTop: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  sectionToggleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  sectionToggleTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingRight: IS_ANDROID ? 6 : 12,
  },
  utilityToggleButton: {
    alignItems: 'center',
  },
  sectionChevronBadge: {
    width: IS_ANDROID ? 30 : 34,
    height: IS_ANDROID ? 30 : 34,
    borderRadius: 999,
    backgroundColor: '#e8eef5',
    borderWidth: 1,
    borderColor: '#d2dbe5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: IS_ANDROID ? 6 : 10,
  },
  dayHeader: {
    marginBottom: 10,
  },
  dayHeaderLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  dayHeaderEyebrow: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '800',
    marginBottom: 3,
    textAlign: 'left',
    letterSpacing: 0.3,
  },
  dayHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
    textAlign: 'left',
  },
  dayHeaderCount: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 4,
  },
  dayHeaderCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  daySectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    marginBottom: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  daySectionCardCompact: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  daySectionToggleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  agendaSectionHeroButton: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.11,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  daySectionHeaderLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingRight: 12,
  },
  daySectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    right: 'auto',
    top: 'auto',
  },
  daySectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111111',
    textTransform: 'capitalize',
    marginBottom: 2,
    textAlign: 'left',
  },
  daySectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'left',
  },
  daySectionCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  daySectionCountText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111111',
  },
  daySectionChevron: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginLeft: 10,
    lineHeight: 20,
  },
  daySectionContent: {
    marginTop: 8,
  },
  agendaSectionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  agendaSectionYearChip: {
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  agendaSectionYearChipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
  },
  agendaSectionMonthText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'capitalize',
  },
  daySectionEmpty: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  daySectionEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  daySectionEmptyText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    textAlign: 'center',
  },
  weekListIntroCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  weekListIntroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
  },
  weekListIntroTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  weekListIntroText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  weekBlockListWrap: {
    marginTop: 8,
    gap: 6,
  },
  weekBlockDayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: '#000000',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  weekBlockDayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 7,
  },
  weekBlockDayHeaderTextWrap: {
    flex: 1,
  },
  weekBlockDayEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  weekBlockDayTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textTransform: 'capitalize',
  },
  weekBlockStatusWrap: {
    alignItems: 'flex-end',
  },
  weekBlockStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  weekBlockStatusChipOpen: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  weekBlockStatusChipFull: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  weekBlockStatusChipClosed: {
    backgroundColor: '#eef2f7',
    borderColor: '#cbd5e1',
  },
  weekBlockStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  weekBlockStatusTextOpen: {
    color: '#166534',
  },
  weekBlockStatusTextFull: {
    color: '#b91c1c',
  },
  weekBlockStatusTextClosed: {
    color: '#475569',
  },
  weekBlockStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  weekBlockStatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 7,
    paddingHorizontal: 9,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  weekBlockStatValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 2,
  },
  weekBlockStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
  },
  weekBlockAppointmentsList: {
    gap: 5,
  },
  weekBlockEmptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 10,
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  weekBlockEmptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  weekBlockEmptyText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#64748b',
    fontWeight: '600',
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  timelineCardCompact: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  deleteSwipeAction: {
    width: 110,
    backgroundColor: '#dc2626',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteSwipeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  timelineTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  timelineTopCompact: {
    marginBottom: 7,
  },
  timelineHourPill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    marginRight: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  timelineHourText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  timelineMain: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  timelineServicePill: {
    backgroundColor: '#FFE9E6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 0,
    maxWidth: '46%',
    alignSelf: 'flex-start',
  },
  timelineServicePillText: {
    color: '#D64545',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  timelineClient: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#0A0A0A',
    textAlign: 'left',
  },
  timelineClientCompact: {
    fontSize: 16,
  },
  timelineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  timelineOperator: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'left',
  },
  timelineOperatorCompact: {
    fontSize: 11,
  },
  timelineMeta: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
    textAlign: 'left',
  },
  timelineMetaCompact: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    justifyContent: 'flex-start',
    gap: 6,
  },
  statusRowCompact: {
    marginBottom: 7,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 0,
    marginBottom: 0,
  },
  statusBadgePending: {
    backgroundColor: '#F8FAFC',
  },
  statusBadgeDone: {
    backgroundColor: '#F8FAFC',
  },
  statusBadgeCancelled: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeTextPending: {
    color: '#6B7280',
  },
  statusBadgeTextDone: {
    color: '#6B7280',
  },
  statusBadgeTextCancelled: {
    color: '#991b1b',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  actionsRowCompact: {
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 0,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  secondaryButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryButtonTextDisabled: {
    color: '#666666',
  },
  secondaryButtonWide: {
    backgroundColor: '#EEF2F7',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  secondaryButtonWideText: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '800',
  },
  darkButton: {
    flex: 1,
    backgroundColor: '#0B132B',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  darkButtonDisabled: {
    backgroundColor: '#dddddd',
  },
  darkButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  darkButtonTextDisabled: {
    color: '#666666',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 21,
    textAlign: 'center',
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  bookingCardWide: {
    maxWidth: 980,
    alignSelf: 'center',
  },
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  desktopTopGridStack: {
    flexDirection: 'column',
    marginBottom: 0,
  },
  desktopBookingPane: {
    flex: 1.2,
    marginRight: 16,
    marginBottom: 0,
  },
  desktopSideColumn: {
    flex: 0.72,
  },
  desktopSideColumnStack: {
    flex: undefined,
    width: '100%',
  },
  searchCardWide: {
    maxWidth: undefined,
    alignSelf: 'stretch',
  },
  daySectionCardShell: {
    width: '100%',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  scheduleDayInfo: {
    flex: 0,
    width: 104,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  scheduleDayLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 3,
    textAlign: 'left',
  },
  scheduleDayMeta: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'left',
  },
  scheduleControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 6,
  },
  scheduleToggleChip: {
    minWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 0,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleToggleChipOpen: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  scheduleToggleChipClosed: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  scheduleToggleText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  scheduleToggleTextOpen: {
    color: '#166534',
  },
  scheduleToggleTextClosed: {
    color: '#b91c1c',
  },
  scheduleTimeChip: {
    backgroundColor: '#e8eef5',
    borderRadius: 999,
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 0,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d2dbe5',
  },
  scheduleTimeChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  customizationLockedHintRow: {
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  customizationLockedHint: {
    flexShrink: 1,
    marginTop: 2,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#9a3412',
    textAlign: 'center',
  },
  customizationLockedCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  customizationLockedField: {
    backgroundColor: '#fff3e6',
    borderColor: '#fdba74',
  },
  customizationLockedChip: {
    backgroundColor: '#fff3e6',
    borderWidth: 1,
    borderColor: '#fdba74',
    opacity: 0.92,
  },
  customizationLockedText: {
    color: '#9a3412',
  },
  slotIntervalField: {
    marginTop: 10,
    width: '100%',
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotIntervalFieldText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  vacationForm: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  vacationFormHeader: {
    marginBottom: 12,
    alignItems: 'center',
  },
  vacationFieldRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 10,
  },
  vacationFieldWrap: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  vacationFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 6,
    textAlign: 'center',
  },
  vacationDateButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    alignItems: 'center',
  },
  vacationDateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  vacationDateButtonPlaceholder: {
    color: '#8f8f8f',
  },
  lunchBreakCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginTop: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  lunchBreakHeaderRow: {
    width: '100%',
    marginBottom: 10,
  },
  lunchBreakControlsWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginLeft: -16,
  },
  pastAppointmentsSection: {
    marginTop: 10,
    paddingBottom: 8,
  },
  emptyAgendaState: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    marginTop: 4,
  },
  emptyAgendaStateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyAgendaStateText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  vacationRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vacationInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: 'center',
  },
  vacationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  vacationMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'center',
  },
  vacationDeleteChip: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  vacationDeleteText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  vacationPickerHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 12,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 356,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#f3f1ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavButtonDisabled: {
    opacity: 0.45,
  },
  calendarNavButtonText: {
    fontSize: 20,
    color: '#111111',
    fontWeight: '700',
    marginTop: -2,
  },
  calendarNavButtonTextDisabled: {
    color: '#8f8f8f',
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#8a8a8a',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 0.86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 4,
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
  calendarDayCellFull: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#374151',
  },
  calendarDayCellGhost: {
    backgroundColor: 'transparent',
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
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
  calendarDayTextFull: {
    color: '#f9fafb',
  },
  calendarFooterText: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 17,
    marginBottom: 12,
    fontWeight: '600',
  },
  timeConfigModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
  },
  timeConfigHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeConfigCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  timeConfigCloseButtonText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: '#475569',
    marginTop: -2,
  },
  timeConfigList: {
    paddingVertical: 8,
  },
  modalHelperText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  timeConfigOption: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  timeConfigOptionActive: {
    backgroundColor: '#111827',
  },
  timeConfigOptionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  timeConfigOptionTextActive: {
    color: '#ffffff',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.05)',
    gap: IS_ANDROID ? 10 : 0,
  },
  modalSecondaryButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: IS_ANDROID ? 0 : 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    minWidth: IS_ANDROID ? 128 : undefined,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
  },
  modalSecondaryButtonText: {
    fontSize: IS_ANDROID ? 14 : 15,
    fontWeight: '800',
    color: '#1F2937',
    width: '100%',
    textAlign: 'center',
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginLeft: IS_ANDROID ? 0 : 8,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
    minWidth: IS_ANDROID ? 144 : undefined,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  modalPrimaryButtonText: {
    fontSize: IS_ANDROID ? 14 : 15,
    fontWeight: '800',
    color: '#ffffff',
    width: '100%',
    textAlign: 'center',
  },
  weekAppointmentDetailsCard: {
    width: '92%',
    maxWidth: 440,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    marginBottom: 18,
  },
  weekAppointmentEditModalCard: {
    maxHeight: '84%',
  },
  weekAppointmentDetailsBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  weekAppointmentDetailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.05)',
  },
  weekAppointmentDetailsHeaderTextWrap: {
    flex: 1,
  },
  weekAppointmentDetailsEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  weekAppointmentDetailsTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#111827',
  },
  weekAppointmentDetailsCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  weekAppointmentDetailsCloseButtonText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: '#475569',
    marginTop: -2,
  },
  weekAppointmentDetailsBody: {
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 14,
  },
  weekAppointmentEditScroll: {
    flexGrow: 0,
    maxHeight: 560,
    marginBottom: 12,
  },
  weekAppointmentEditScrollContent: {
    paddingRight: 4,
  },
  weekAppointmentDetailsPendingHintWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.1)',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  weekAppointmentDetailsPendingHintText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#9f1239',
  },
  weekAppointmentDetailsRow: {
    gap: 2,
  },
  weekAppointmentDetailsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  weekAppointmentDetailsValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: '#111827',
  },
  weekAppointmentDetailsActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  weekAppointmentDetailsActionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  weekAppointmentDetailsActionButtonReject: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  weekAppointmentDetailsActionButtonAccept: {
    backgroundColor: '#ecfdf3',
    borderColor: '#86efac',
  },
  weekAppointmentDetailsActionButtonRejectText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#be123c',
  },
  weekAppointmentDetailsActionButtonAcceptText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  weekAppointmentDetailsActionButtonDisabled: {
    opacity: 0.55,
  },
  weekAppointmentDetailsPrimaryButton: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#111827',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  weekAppointmentDetailsPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  weekAppointmentEditDateButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  weekAppointmentEditDateButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  weekAppointmentEditDateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  weekAppointmentEditSlotsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekAppointmentEditSlotChip: {
    minWidth: 124,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekAppointmentEditSlotChipContent: {
    alignItems: 'center',
    gap: 3,
  },
  weekAppointmentEditSlotChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  weekAppointmentEditSlotChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  weekAppointmentEditSlotChipTextActive: {
    color: '#1e3a8a',
  },
  weekAppointmentEditSlotChipHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  weekAppointmentEditSlotChipHintActive: {
    color: '#1e3a8a',
  },
  weekAppointmentEditEmptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  weekPlannerDeleteZoneOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 20,
  },
  weekPlannerDeleteZoneIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  weekPlannerDeleteZoneText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 0.4,
  },
});
