import {OwnerWebSheetHeader} from '../../components/owner-web-page-title';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativePremiumScope } from '../../components/owner-native-premium';
import { PremiumSearchToolbar } from '../../components/ui/premium-search-toolbar';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {useCashDevicePrivacy} from '../../src/lib/cash-device-privacy';
import { SalonBrandPlacementSettings } from '../../components/salon-brand-placement-settings';
import { NativeHomeIndicators, NativeHomeInvite, NativeHomeResults, NativeHomeQuickAction, OwnerPremiumNativeHome } from '../../components/owner-premium-native-home';
import { nativeHomeStyles } from '../../components/owner-premium-native-style';
import { OwnerPremiumDashboard } from '../../components/owner-premium-dashboard';
import { useAccessAppearance } from '../../components/access-premium';
import { OwnerPremiumHomeHeading, OwnerPremiumHomeCss, OwnerPremiumHomeRegion, webHomePart, premiumHomeStyles } from '../../components/owner-premium-web';
import { ShopEntry } from "../../components/shop/shop-entry";
import { NativeSettingsPopup } from '../../components/native-settings-popup';
import { DockedSheetSurface } from '../../components/ui/docked-sheet-surface';
import { DirectoryReminder } from '../../components/salon-discovery/directory-reminder';
import { premiumFilterStyles } from '../../components/ui/premium-filter-styles';
import { isSameOperatorIdentity } from '../../src/lib/home-operator-identity';
import { lowerItalian, upperItalian } from '../../src/lib/italian-case';
import { selectLatestCustomer } from '../../src/lib/latest-customer';
import { Ionicons } from '@expo/vector-icons';
import { useSalonShortCode } from '../../src/lib/salon-short-code';
import { SalonCodeBadge } from '../../components/ui/salon-code-badge';
import { SalonLogoEditor } from '../../components/ui/salon-logo-editor';
import { SalonLogoPlaque } from '../../components/ui/salon-logo-plaque';
import { SalonActivityPicker } from '../../components/ui/salon-activity-picker';
import { CustomerInsightsOverlay } from '../../components/ui/customer-insights-overlay';
import { CustomerInsightsOpenButton } from '../../components/ui/customer-insights-open-button';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useRouter } from 'expo-router';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Animated,
    Easing as NativeEasing,
    Alert,
    FlatList,
    Image,
    InteractionManager,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable, HapticTouchableFastRegion } from '../../components/ui/haptic-touchable';
import { PremiumExpandButton } from '../../components/ui/premium-expand-button';
import {
  getWebExpandableCardProps,
  getWebExpandableCardStyle,
} from '../../components/ui/web-expandable-card';
import { SkeletonShimmer } from '../../components/ui/skeleton-shimmer';
import { FilterCheckmark } from '../../components/ui/filter-checkmark';
import { useAppContext } from '../../src/context/AppContext';
import { formatCash, summarizeCashActivity } from '../../src/lib/cash-summary';
import { resolveBundledAssetUri } from '../../src/lib/bundled-asset-uri';
import { salonNameFontOptions } from '../../src/lib/fonts';
import { formatLeadingCapitalizedValue } from '../../src/lib/customer-name';
import { useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { tApp } from '../../src/lib/i18n';
import { ICON_ASSET_VERSION } from '../../src/lib/icon-asset-version';
import { formatSalonAddress, normalizeSalonCode } from '../../src/lib/platform';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { resolveServiceAccent } from '../../src/lib/service-accents';
import { buildSalonQrPrintHtml } from '../../src/lib/salon-qr-print';
import {
  buildDisplayTimeSlots,
  getDateAvailabilityInfo,
  buildSalonCapacityOperatorId,
  getAppointmentEndTime,
  isSlotBlockedByOverride,
  isTimeBlockedByLunchBreak,
  normalizeRoleName,
  timeToMinutes,
} from '../../src/lib/booking';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../../src/lib/validators';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateString?: string) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

const sanitizeFileNameSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'agenda';

type OperatorAgendaPrintScope = 'day' | 'week' | 'month';

const parseIsoDateValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const toIsoDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToIsoDate = (value: string, days: number) => {
  const baseDate = parseIsoDateValue(value);
  baseDate.setDate(baseDate.getDate() + days);
  return toIsoDateValue(baseDate);
};

const getWeekStartIsoDate = (value: string) => {
  const baseDate = parseIsoDateValue(value);
  const weekDay = baseDate.getDay();
  const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay;
  baseDate.setDate(baseDate.getDate() + mondayOffset);
  return toIsoDateValue(baseDate);
};

const getWeekEndIsoDate = (value: string) => addDaysToIsoDate(getWeekStartIsoDate(value), 6);

const getMonthStartIsoDate = (value: string) => {
  const baseDate = parseIsoDateValue(value);
  return toIsoDateValue(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
};

const getMonthEndIsoDate = (value: string) => {
  const baseDate = parseIsoDateValue(value);
  return toIsoDateValue(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0));
};

const buildInclusiveDateRange = (startValue: string, endValue: string) => {
  const dates: string[] = [];
  let currentValue = startValue;

  while (currentValue <= endValue) {
    dates.push(currentValue);
    currentValue = addDaysToIsoDate(currentValue, 1);
  }

  return dates;
};

const formatLongDateLabel = (dateString?: string) => {
  if (!dateString) return '—';

  try {
    const formatter = new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const rawLabel = formatter.format(parseIsoDateValue(dateString));
    return upperItalian(rawLabel.charAt(0)) + rawLabel.slice(1);
  } catch {
    return formatDateLabel(dateString);
  }
};

const formatOperatorAgendaScopeLabel = ({
  scope,
  startDate,
  endDate,
}: {
  scope: OperatorAgendaPrintScope;
  startDate: string;
  endDate: string;
}) => {
  if (scope === 'day') {
    return `Giornata · ${formatLongDateLabel(startDate)}`;
  }

  if (scope === 'week') {
    return `Settimana · ${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
  }

  return `Mese · ${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
};

const formatMinutes = (value?: number) => {
  if (!value) return '—';
  if (value === 30) return '30 min';
  if (value === 60) return '1 ora';

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  return hours > 0 ? `${hours}h` : `${minutes} min`;
};

const blendHexWithWhite = (hex: string, whiteWeight = 0.82) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return '#F8FAFC';
  }

  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const mixChannel = (channelHex: string) => {
    const channel = Number.parseInt(channelHex, 16);
    return clampChannel(channel * (1 - whiteWeight) + 255 * whiteWeight)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${mixChannel(normalized.slice(0, 2))}${mixChannel(normalized.slice(2, 4))}${mixChannel(normalized.slice(4, 6))}`;
};

const normalizeOperatorNameKey = (value?: string) =>
  lowerItalian((value ?? '').trim());


const normalizeCustomerNameKey = (value?: string) =>
  lowerItalian((value ?? '').trim());
const normalizeCustomerEmailKey = (value?: string | null) =>
  lowerItalian((value ?? '').trim());
const normalizeCustomerPhoneKey = (value?: string | null) =>
  (value ?? '').replace(/\D+/g, '').slice(-10);
const normalizeRoleKey = (value?: string) =>
  lowerItalian((value ?? '').trim());

const formatRoleDisplayLabel = (value?: string | null) =>
  (value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => upperItalian(word.charAt(0)) + lowerItalian(word.slice(1)))
    .join(' ');

const resolveAppointmentRoleLabel = ({
  appointment,
  services,
  operators,
}: {
  appointment: {
    servizio?: string;
    mestiereRichiesto?: string;
    operatoreId?: string;
    operatoreNome?: string;
  };
  services: { nome: string; mestiereRichiesto?: string | null }[];
  operators: { id: string; nome: string; mestiere: string }[];
}) => {
  const explicitRole = appointment.mestiereRichiesto?.trim();
  if (explicitRole) return explicitRole;

  const matchedOperator =
    (appointment.operatoreId?.trim()
      ? operators.find((item) => item.id.trim() === appointment.operatoreId?.trim())
      : undefined) ??
    (appointment.operatoreNome?.trim()
      ? operators.find(
          (item) => normalizeOperatorNameKey(item.nome) === normalizeOperatorNameKey(appointment.operatoreNome)
        )
      : undefined);
  if (matchedOperator?.mestiere?.trim()) {
    return matchedOperator.mestiere.trim();
  }

  const matchedService = services.find(
    (item) =>
      lowerItalian((item.nome ?? '').trim()) ===
      lowerItalian((appointment.servizio ?? '').trim())
  );

  if (matchedService?.mestiereRichiesto?.trim()) {
    return matchedService.mestiereRichiesto.trim();
  }

  const inferredCapacityId = buildSalonCapacityOperatorId(
    appointment.servizio ?? '',
    [],
    appointment.mestiereRichiesto
  );
  const inferredRoleKey = inferredCapacityId.replace(/^salon-capacity::/i, '').trim();

  return formatRoleDisplayLabel(inferredRoleKey);
};

const isSameCustomerIdentity = (
  appointment: { cliente?: string; customerEmail?: string; customerPhone?: string },
  customer: { nome: string; email?: string; telefono?: string }
) => {
  const appointmentEmail = normalizeCustomerEmailKey(appointment.customerEmail);
  const customerEmail = normalizeCustomerEmailKey(customer.email);
  const appointmentPhone = normalizeCustomerPhoneKey(appointment.customerPhone);
  const customerPhone = normalizeCustomerPhoneKey(customer.telefono);
  const hasAppointmentContact = !!appointmentEmail || !!appointmentPhone;
  const hasCustomerContact = !!customerEmail || !!customerPhone;

  if (appointmentEmail && customerEmail) {
    return appointmentEmail === customerEmail;
  }

  if (appointmentPhone && customerPhone) {
    return appointmentPhone === customerPhone;
  }

  if (hasAppointmentContact && hasCustomerContact) {
    return false;
  }

  return normalizeCustomerNameKey(appointment.cliente) === normalizeCustomerNameKey(customer.nome);
};

const buildCustomerInsightIdentityKey = (
  customer: { id?: string; nome: string; email?: string; telefono?: string },
  index: number
) =>
  [
    customer.id?.trim() ?? '',
    normalizeCustomerEmailKey(customer.email),
    normalizeCustomerPhoneKey(customer.telefono),
    normalizeCustomerNameKey(customer.nome),
    String(index),
  ]
    .filter(Boolean)
    .join('|');

const buildClientInviteMessage = ({
  brandName,
  salonClientLink,
}: {
  brandName: string;
  salonClientLink: string;
}) => {
  return `Apri l'app di ${brandName} e registrati nell'area cliente del salone.\n\nLink diretto: ${salonClientLink}`;
};

const toUppercaseField = (value: string) => formatLeadingCapitalizedValue(value);
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';
const IS_ANDROID = Platform.OS === 'android';
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parsePublicClientBaseUrl = (value: string) => {
  if (!value) return null;

  try {
    const normalizedValue = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalizedValue);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');

    return url;
  } catch {
    return null;
  }
};

const buildSalonClientLink = (baseUrl: URL | null, salonCode: string) => {
  if (!salonCode) {
    return '';
  }

  if (!baseUrl) {
    return '';
  }

  const link = new URL(`${Platform.OS==='web'?baseUrl.toString().replace(/\/+$/, ''):baseUrl.toString()}/join/${encodeURIComponent(salonCode)}`);
  link.searchParams.set('entry', 'client');
  link.searchParams.set('v', ICON_ASSET_VERSION);
  return link.toString();
};

const getPublicClientLinkStatus = ({
  baseUrl,
  salonCode,
  salonClientLink,
}: {
  baseUrl: URL | null;
  salonCode: string;
  salonClientLink: string;
}) => {
  if (!salonCode) {
    return {
      status: 'missing-salon-code' as const,
      canShare: false,
      message:
        "Il link cliente verra generato appena il salone ha un codice valido per aprire l'app nella pagina giusta.",
    };
  }

  if (!salonClientLink) {
    return {
      status: 'invalid-link' as const,
      canShare: false,
      message:
        "Non sono riuscito a costruire il deep link dell'app cliente. Controlla il codice salone e riprova.",
    };
  }

  return {
    status: 'ready' as const,
    canShare: true,
    message:
      "Link app pronto: il QR apre direttamente l'area cliente del salone nell'app.",
  };
};

function DashboardSkeletonBar({
  width,
  height = 24,
  radius = 999,
  style,
}: {
  width: ViewStyle['width'];
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  if(Platform.OS==='web')return <View style={[{width,height,borderRadius:radius},style,{backgroundColor:'transparent'}]}/>;
  return (
    <SkeletonShimmer
      style={[
        styles.dashboardSkeletonBar,
        { width, height, borderRadius: radius },
        style,
      ]}
    />
  );
}

type HomeMetricCopyProps = {
  text: string;
  textStyle: StyleProp<TextStyle>;
  viewportStyle?: StyleProp<ViewStyle>;
  scrolling?: boolean;
};

const HomeMetricMotionContext = createContext<{
  progress: Animated.Value;
  distance: number;
  reduceMotion: boolean;
  reportWidth: (width: number) => void;
} | null>(null);

/** One clock and one distance keep every metric description in exact sync. */
function HomeMetricMotion({ children }: { children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [distance, setDistance] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const focused = useIsFocused();
  const reportWidth = useCallback((width: number) => {
    if (Number.isFinite(width) && width > 0) {
      setDistance(current => Math.max(current, Math.ceil(width) + 28));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (mounted) setReduceMotion(enabled); })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!focused || reduceMotion || distance === 0) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(progress, {
        toValue: 1,
        duration: Math.max(6000, distance * 32),
        easing: NativeEasing.linear,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      }),
      Animated.delay(2000),
    ]), { resetBeforeIteration: true });
    animation.start();
    return () => { animation.stop(); progress.stopAnimation(); };
  }, [distance, focused, progress, reduceMotion]);

  const value = useMemo(() => ({ progress, distance, reduceMotion, reportWidth }),
    [progress, distance, reduceMotion, reportWidth]);
  return <HomeMetricMotionContext.Provider value={value}>{children}</HomeMetricMotionContext.Provider>;
}

const HomeMetricCopy = memo(function HomeMetricCopy({
  text, textStyle, viewportStyle, scrolling = false,
}: HomeMetricCopyProps) {
  const motion = useContext(HomeMetricMotionContext);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const flatStyle = StyleSheet.flatten(textStyle);
  const lineHeight = flatStyle?.lineHeight ?? 17;
  const translateX = useMemo(() => motion?.progress.interpolate({
    inputRange: [0, 1], outputRange: [0, -motion.distance],
  }) ?? 0, [motion?.progress, motion?.distance]);
  const measureStyle = [textStyle, { width: 'auto' as const, alignSelf: 'flex-start' as const, flexGrow: 0, minHeight: 0, marginBottom: 0, flexShrink: 0 }];
  const shouldScroll = Platform.OS !== 'web' || (viewportWidth > 0 && textWidth > viewportWidth + 1);
  useEffect(() => {
    if (Platform.OS === 'web' && scrolling && shouldScroll) {
      motion?.reportWidth(Math.max(viewportWidth, textWidth));
    }
  }, [motion?.reportWidth, scrolling, shouldScroll, textWidth, viewportWidth]);

  if (Platform.OS === 'web' || !scrolling || !motion || motion.reduceMotion) {
    return (
      <View style={[{ width: '100%' }, viewportStyle]}>
        <Text style={[textStyle, { width: '100%', marginBottom: 0 }]}>{text}</Text>
      </View>
    );
  }

  const offset = Math.max(0, (viewportWidth - textWidth) / 2);
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} pointerEvents="none"
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        setViewportWidth(width);
        if (Platform.OS !== 'web') motion.reportWidth(width);
      }}
      style={[{ width: '100%', height: lineHeight, overflow: 'hidden' }, viewportStyle]}>
      <View accessible={false} aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', opacity: 0, width: 10000, flexDirection: 'row' }}>
        <Text style={measureStyle} numberOfLines={1} onLayout={event => {
          const width = event.nativeEvent.layout.width;
          setTextWidth(width);
          if (Platform.OS !== 'web') motion.reportWidth(width);
        }}>{text}</Text>
      </View>
      <Animated.View accessible={false} aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ width: motion.distance * 2 + viewportWidth, height: lineHeight,
          opacity: textWidth > 0 && viewportWidth > 0 ? 1 : 0,
          transform: [{ translateX: shouldScroll ? translateX : 0 }] }}>
        {(shouldScroll ? [0, 1] : [0]).map(copy => (
          <Text key={copy} numberOfLines={1}
            style={[measureStyle, { position: 'absolute', left: offset + copy * motion.distance,
              width: Math.ceil(textWidth) + 2, textAlign: 'left' }]}>{text}</Text>
        ))}
      </Animated.View>
    </View>
  );
});

/** Fit the entire formatted value, including its currency, to the card width. */
const HomeMetricAmount = memo(function HomeMetricAmount({ value, style }: {
  value: string; style: StyleProp<TextStyle>;
}) {
  const [width, setWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const baseStyle = StyleSheet.flatten(style);
  const baseSize = baseStyle?.fontSize ?? 24;
  const fittedSize = width > 0 && naturalWidth > 0
    ? baseSize * Math.min(1, Math.max(0, width - 6) / naturalWidth) : baseSize;
  if (Platform.OS === 'web') return <View style={{width:'100%',minWidth:0,marginBottom:baseStyle?.marginBottom??0}}><Text style={[style,{width:'100%',marginBottom:0,whiteSpace:'nowrap'} as any]}>{value}</Text></View>;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={value}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ width: '100%', overflow: 'hidden', marginBottom: baseStyle?.marginBottom ?? 0 }}>
      <View accessible={false} aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', opacity: 0, width: 10000, flexDirection: 'row' }}>
        <Text numberOfLines={1} onLayout={event => setNaturalWidth(event.nativeEvent.layout.width)}
          style={[style, { width: 'auto', alignSelf: 'flex-start', flexGrow: 0, flexShrink: 0, marginBottom: 0 }]}>{value}</Text>
      </View>
      <Text accessible={false} aria-hidden={true} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.1}
        style={[style, { fontSize: fittedSize, width: '100%', marginBottom: 0 }]}>{value}</Text>
    </View>
  );
});

const CUSTOMER_INSIGHT_SEARCH_COMMIT_DELAY_MS = 90;

/**
 * Keeps the search field responsive without rerendering the whole Home screen
 * for every keystroke. The parent only receives the settled query used by the
 * expensive customer-board filter; blur and submit still commit immediately.
 */
const DeferredCustomerInsightSearchInput = memo(function DeferredCustomerInsightSearchInput({
  active,
  value,
  onCommit,
}: {
  active: boolean;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { palette: searchPalette } = useAccessAppearance();
  const [localValue, setLocalValue] = useState(value);
  const localValueRef = useRef(value);
  const committedValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const clearPendingCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const commitValue = useCallback(
    (nextValue: string) => {
      clearPendingCommit();
      if (nextValue === committedValueRef.current) return;
      committedValueRef.current = nextValue;
      onCommitRef.current(nextValue);
    },
    [clearPendingCommit]
  );

  const handleChangeText = useCallback(
    (nextValue: string) => {
      localValueRef.current = nextValue;
      setLocalValue(nextValue);
      clearPendingCommit();
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        commitValue(localValueRef.current);
      }, CUSTOMER_INSIGHT_SEARCH_COMMIT_DELAY_MS);
    },
    [clearPendingCommit, commitValue]
  );

  const flushPendingValue = useCallback(() => {
    commitValue(localValueRef.current);
  }, [commitValue]);

  useEffect(() => {
    if (value === committedValueRef.current) return;
    clearPendingCommit();
    committedValueRef.current = value;
    localValueRef.current = value;
    setLocalValue(value);
  }, [clearPendingCommit, value]);

  useEffect(() => {
    if (active) return;
    clearPendingCommit();
    committedValueRef.current = value;
    localValueRef.current = value;
    setLocalValue(value);
  }, [active, clearPendingCommit, value]);

  useEffect(() => clearPendingCommit, [clearPendingCommit]);

  return (
    <PremiumSearchToolbar><ClearableTextInput
      style={[styles.customerInsightSearchInput, Platform.OS !== 'web' && {minHeight:42,fontSize:13,lineHeight:19,fontWeight:'400',paddingVertical:9,paddingHorizontal:12,borderRadius:12,marginBottom:8,backgroundColor:searchPalette.field,color:searchPalette.ink,borderColor:searchPalette.border}, Platform.OS === 'web' && {backgroundColor:searchPalette.field,color:searchPalette.ink,borderColor:searchPalette.border,fontWeight:'400',boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)'}]}
      placeholder="Cerca cliente, telefono, email o servizio"
      placeholderTextColor={searchPalette.muted}
      value={localValue}
      onChangeText={handleChangeText}
      onBlur={flushPendingValue}
      onSubmitEditing={flushPendingValue}
      autoCapitalize="words"
      returnKeyType="search"
    /></PremiumSearchToolbar>
  );
});

export default function HomeScreen() {
  const homeSheetInsets = useSafeAreaInsets();
  const { palette: premiumPalette } = useAccessAppearance();
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const styles = useMemo(() => Platform.OS === 'web' ? premiumHomeStyles(baseHomeStyles, premiumPalette, responsive.width) : nativeHomeStyles(baseHomeStyles,premiumPalette), [premiumPalette, responsive.width]);
  const hasWideWebMetricCards = Platform.OS === 'web';
  const compactSalonTotals = Platform.OS !== 'web' || responsive.width < 640;
  const [showSalonTotalDetails, setShowSalonTotalDetails] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const profileSheetScrollRef = useRef<ScrollView | null>(null);
  const clientQrPrintRef = useRef<{ toDataURL: (callback: (data: string) => void) => void } | null>(null);
  const priorityScrollOffset = useSharedValue(0);
  const priorityIndicatorActive = useSharedValue(0);
  const [clientAccessSectionY, setClientAccessSectionY] = useState(0);
  const profileSectionYRef = useRef(0);
  const profileSectionElementRef = useRef<View | null>(null);
  const returnToProfileAfterSaveRef = useRef(false);
  const [priorityViewportHeight, setPriorityViewportHeight] = useState(0);
  const [priorityContentHeight, setPriorityContentHeight] = useState(0);
  const salonNameFieldRef = useRef<TextInput | null>(null);
  const businessPhoneFieldRef = useRef<TextInput | null>(null);
  const streetLineFieldRef = useRef<TextInput | null>(null);
  const cityFieldRef = useRef<TextInput | null>(null);
  const postalCodeFieldRef = useRef<TextInput | null>(null);
  const accountEmailFieldRef = useRef<TextInput | null>(null);
  const {
    clienti,
    appuntamenti: liveAppuntamenti,
    ownerFinancialAppointments,
    movimenti,
    servizi,
    operatori,
    richiestePrenotazione,
    availabilitySettings,
    salonAccountEmail,
    salonWorkspace,
    updateSalonWorkspacePersisted,
    switchSalonAccount,
    appLanguage,
    ownerProfileNeedsCompletion,
    consumeOwnerProfileNeedsCompletion,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerAppointmentsAuthoritative,
    ownerMobileSessionAccessReady,
    isAuthenticated,
    ownerExplicitLogout,
    setOwnerHomeReady,
    serviceCardColorOverrides,
    roleCardColorOverrides,
  } = useAppContext();
  const cashPrivacyScope=salonWorkspace.id&&salonAccountEmail?`${salonWorkspace.id}:${salonAccountEmail.toLowerCase()}`:'';
  const {enabled:cashPrivacyEnabled}=useCashDevicePrivacy(cashPrivacyScope);
  const reserveCashAmounts=cashPrivacyEnabled!==false;
  // Tutti i contatori e gli importi Home provengono dalla tabella privata del
  // workspace. La raccolta live resta disponibile solo durante l'idratazione,
  // quando la Home mostra comunque lo skeleton e non espone importi intermedi.
  const appuntamenti = ownerAppointmentsAuthoritative
    ? ownerFinancialAppointments
    : liveAppuntamenti;

  const [savingSalon, setSavingSalon] = useState(false);
  const hasConsumedOwnerProfileCompletionRef = useRef(false);

  const [accountEmailInput, setAccountEmailInput] = useState(salonAccountEmail);
  const [salonNameInput, setSalonNameInput] = useState(salonWorkspace.salonName);
  const [salonNameDisplayStyleInput, setSalonNameDisplayStyleInput] = useState<
    'corsivo' | 'stampatello' | 'minuscolo'
  >(
    salonWorkspace.salonNameDisplayStyle
  );
  const [salonNameFontVariantInput, setSalonNameFontVariantInput] = useState(
    salonWorkspace.salonNameFontVariant
  );
  const [additionalPhonesInput, setAdditionalPhonesInput] = useState<string[]>(salonWorkspace.additionalPhones?.length ? salonWorkspace.additionalPhones : ['']);
  const [businessPhoneInput, setBusinessPhoneInput] = useState(salonWorkspace.businessPhone);
  const [activityCategoryInput, setActivityCategoryInput] = useState(
    toUppercaseField(salonWorkspace.activityCategory)
  );
  const configuredActivityOptions = useMemo(() => [
    salonWorkspace.activityCategory,
    ...servizi.map((service) => service.mestiereRichiesto ?? ''),
    ...operatori.map((operator) => operator.mestiere ?? ''),
  ], [salonWorkspace.activityCategory, servizi, operatori]);
  const [streetLineInput, setStreetLineInput] = useState(
    [salonWorkspace.streetType, salonWorkspace.streetName].filter(Boolean).join(' ').trim()
  );
  const [cityInput, setCityInput] = useState(toUppercaseField(salonWorkspace.city));
  const [postalCodeInput, setPostalCodeInput] = useState(salonWorkspace.postalCode);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isEditingSalonProfile, setIsEditingSalonProfile] = useState(false);
  const [showProfileSection, setShowProfileSection] = useState(false);
  const toggleProfileSection = useCallback(() => {
    setShowProfileSection((current) => {
      const nextValue = !current;
      setIsEditingSalonProfile(nextValue);
      return nextValue;
    });
  }, []);
  const [showOperatorAgendaModal, setShowOperatorAgendaModal] = useState(false);
  const [selectedOperatorBoardId, setSelectedOperatorBoardId] = useState<string | null>(null);
  const [operatorAgendaPrintScope, setOperatorAgendaPrintScope] =
    useState<OperatorAgendaPrintScope>('day');
  const [isOperatorAgendaSystemDialogOpen, setIsOperatorAgendaSystemDialogOpen] = useState(false);
  const [showCustomerInsightsModal, setShowCustomerInsightsModal] = useState(false);
  const [selectedCustomerInsightId, setSelectedCustomerInsightId] = useState<string | null>(null);
  const [customerInsightSearchQuery, setCustomerInsightSearchQuery] = useState('');
  const [customerAppointmentFilter, setCustomerAppointmentFilter] = useState<
    'all' | 'today' | 'future' | 'past'
  >('all');
  const [profileFieldErrors, setProfileFieldErrors] = useState<{
    businessPhone?: string;
    accountEmail?: string;
  }>({});
  const [clockNow, setClockNow] = useState(() => Date.now());
  const isHomeScreenFocused = useIsFocused();
  useEffect(() => {
    if (!isHomeScreenFocused) {
      setShowCustomerInsightsModal(false);
    }
  }, [isHomeScreenFocused]);
  const shouldRunHomeClock =
    Platform.OS !== 'android' || isHomeScreenFocused;
  const [androidHomeSecondaryReady, setAndroidHomeSecondaryReady] = useState(
    !IS_ANDROID,
  );
  const [androidHomeQrReady, setAndroidHomeQrReady] = useState(!IS_ANDROID);
  const [ownerHomeDataSettled, setOwnerHomeDataSettled] = useState(false);
  const ownerHomeActiveAccountKeyRef = useRef('');
  const ownerHomeSettledAccountKeyRef = useRef('');
  const { focusField, scrollToField } = useKeyboardAwareScroll(Platform.OS === 'web' && showProfileSection ? profileSheetScrollRef : scrollRef, {
    topOffset: responsive.isDesktop ? 112 : 192,
    shouldScrollNode: () => Platform.OS === 'web' || !showProfileSection,
  });

  useEffect(() => {
    if (!shouldRunHomeClock) return;

    const intervalId = setInterval(() => {
      setClockNow(Date.now());
    }, 30000);

    return () => clearInterval(intervalId);
  }, [shouldRunHomeClock]);

  useEffect(() => {
    if (!IS_ANDROID || androidHomeSecondaryReady || !isHomeScreenFocused) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) {
          setAndroidHomeSecondaryReady(true);
        }
      }, 2500);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [androidHomeSecondaryReady, isHomeScreenFocused]);

  const scrollToQrSection = useCallback(() => {
    if (IS_ANDROID && !androidHomeQrReady) {
      setAndroidHomeQrReady(true);
    }
    scrollRef.current?.scrollTo({
      y: Math.max(clientAccessSectionY - 12, 0),
      animated: false,
    });
  }, [androidHomeQrReady, clientAccessSectionY]);

  const oggi = getTodayDateString();
  const numeroClienti = clienti.length;
  const numeroAppuntamenti = appuntamenti.length;
  const ownerDashboardHasFinancialPayload =
    numeroAppuntamenti > 0 ||
    movimenti.length > 0;
  useEffect(() => {
    const ownerKey = salonAccountEmail.trim().toLowerCase() || '__no-owner__';
    const accountChanged = ownerHomeActiveAccountKeyRef.current !== ownerKey;

    if (accountChanged) {
      ownerHomeActiveAccountKeyRef.current = ownerKey;
      ownerHomeSettledAccountKeyRef.current = '';
      setOwnerHomeDataSettled((current) => (current ? false : current));
    }

    if (
      (Platform.OS !== 'web' && (!isAuthenticated || ownerExplicitLogout)) ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !ownerAppointmentsAuthoritative
    ) {
      // Su app lo skeleton della Home appartiene solo al primo caricamento.
      // I refresh periodici devono conservare l'ultima dashboard valida invece
      // di rimettere le metriche in skeleton a ogni sincronizzazione.
      if (Platform.OS === 'web' || !isAuthenticated || ownerExplicitLogout) {
        ownerHomeSettledAccountKeyRef.current = '';
        setOwnerHomeDataSettled((current) => (current ? false : current));
      }
      return;
    }

    if (ownerHomeSettledAccountKeyRef.current === ownerKey) {
      setOwnerHomeDataSettled((current) => (current ? current : true));
      return;
    }

    // Nell'app lo skeleton rappresenta soltanto il caricamento reale. Appena
    // la tabella appuntamenti e' autorevole mostriamo la Home, senza aggiungere
    // un secondo ritardo artificiale dopo il bootstrap di sicurezza.
    if (Platform.OS !== 'web') {
      ownerHomeSettledAccountKeyRef.current = ownerKey;
      setOwnerHomeDataSettled(true);
      return;
    }

    const timeoutId = setTimeout(
      () => {
        ownerHomeSettledAccountKeyRef.current = ownerKey;
        setOwnerHomeDataSettled(true);
      },
      ownerDashboardHasFinancialPayload ? 750 : 1200
    );

    return () => clearTimeout(timeoutId);
  }, [
    ownerDashboardHasFinancialPayload,
    ownerAppointmentsAuthoritative,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    salonAccountEmail,
    isAuthenticated,
    ownerExplicitLogout,
  ]);

  const cashActivity = useMemo(
    () => summarizeCashActivity(movimenti),
    [movimenti]
  );

  const appuntamentiOggi = useMemo(
    () =>
      appuntamenti
        .filter((item) => item.data === oggi)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [appuntamenti, oggi]
  );
  const currentTimeMinutes = useMemo(() => {
    const now = new Date(clockNow);
    return now.getHours() * 60 + now.getMinutes();
  }, [clockNow]);

  // Editing profile fields must not rescan the appointment history on each tap.
  const appuntamentiIncassati = useMemo(
    () => appuntamenti.filter((item) => item.incassato).length,
    [appuntamenti]
  );
  const appuntamentiDaIncassare = useMemo(
    () => appuntamenti.filter((item) => !item.incassato && !item.nonEffettuato).length,
    [appuntamenti]
  );
  const quickFocusText = useMemo(() => {
    const pending = richiestePrenotazione.filter((item) => item.stato === 'In attesa' && item.data >= oggi).length;
    const toVerify = appuntamenti.filter((item) =>
      !item.incassato && !item.nonEffettuato && (
        (Boolean(item.data) && item.data! < oggi) || (item.data === oggi && timeToMinutes(getAppointmentEndTime(item, servizi)) <= currentTimeMinutes)
      )
    ).length;
    const remainingToday = appuntamenti.filter((item) =>
      !item.nonEffettuato && item.data === oggi && timeToMinutes(getAppointmentEndTime(item, servizi)) > currentTimeMinutes
    ).length;
    const tasks: string[] = [];
    if (pending > 0) tasks.push(`${pending} ${pending === 1 ? 'richiesta di prenotazione da gestire' : 'richieste di prenotazione da gestire'}.`);
    // A past scheduled end is not proof that a service was delivered or that
    // its full price is still due: deposits and payment ledgers live in Cassa.
    if (toVerify > 0) tasks.push(`${toVerify} ${toVerify === 1 ? 'appuntamento passato con incasso da verificare' : 'appuntamenti passati con incasso da verificare'} in Cassa.`);
    if (remainingToday > 0) tasks.push(`${remainingToday} ${remainingToday === 1 ? 'appuntamento ancora previsto' : 'appuntamenti ancora previsti'} oggi.`);
    return tasks.length ? tasks.join(' ') : 'Nessuna richiesta in attesa per oggi o i prossimi giorni, né incassi passati da verificare nei dati disponibili. Nessun altro appuntamento previsto oggi.';
  }, [appuntamenti, richiestePrenotazione, oggi, currentTimeMinutes, servizi]);

  const prossimiAppuntamentiOggi = useMemo(
    () =>
      appuntamentiOggi.filter((item) => {
        const appointmentStartMinutes = timeToMinutes(item.ora);
        const appointmentEndMinutes = timeToMinutes(getAppointmentEndTime(item, servizi));

        if (appointmentStartMinutes <= currentTimeMinutes && appointmentEndMinutes > currentTimeMinutes) {
          return false;
        }

        return appointmentStartMinutes > currentTimeMinutes;
      }),
    [appuntamentiOggi, currentTimeMinutes, servizi]
  );
  const prossimoSlotPrioritario = useMemo(() => {
    const nextTime = prossimiAppuntamentiOggi[0]?.ora ?? null;
    if (!nextTime) {
      return {
        time: null,
        appointments: [] as typeof prossimiAppuntamentiOggi,
        hasMultiRole: false,
        distinctRoleCount: 0,
      };
    }

    const appointments = prossimiAppuntamentiOggi.filter((item) => item.ora === nextTime);
    const distinctRoles = Array.from(
      new Set(
        appointments
          .map((item) =>
            resolveAppointmentRoleLabel({
              appointment: item,
              services: servizi,
              operators: operatori,
            }) || item.servizio.trim()
          )
          .map((item) => normalizeRoleKey(item))
          .filter(Boolean)
      )
    );

    return {
      time: nextTime,
      appointments,
      hasMultiRole: distinctRoles.length > 1,
      distinctRoleCount: distinctRoles.length,
    };
  }, [operatori, prossimiAppuntamentiOggi, servizi]);
  const prossimoAppuntamento = prossimoSlotPrioritario.appointments[0] ?? null;
  const ultimoCliente = useMemo(() => selectLatestCustomer(clienti), [clienti]);
  const getHomePriorityAccent = useCallback(
    (serviceName: string, roleNameOverride?: string | null) => {
      const matchedService = servizi.find(
        (item) => item.nome.trim().toLowerCase() === serviceName.trim().toLowerCase()
      );

      return resolveServiceAccent({
        serviceId: matchedService?.id,
        serviceName,
        roleName: roleNameOverride?.trim() || matchedService?.mestiereRichiesto,
        serviceColorOverrides: serviceCardColorOverrides,
        roleColorOverrides: roleCardColorOverrides,
      });
    },
    [roleCardColorOverrides, serviceCardColorOverrides, servizi]
  );

  const servizioTop = useMemo(() => {
    const counts = appuntamenti.reduce<Record<string, number>>((acc, item) => {
      acc[item.servizio] = (acc[item.servizio] ?? 0) + 1;
      return acc;
    }, {});

    const [nome, count] =
      Object.entries(counts).sort((first, second) => second[1] - first[1])[0] ?? [];
    if (!nome || !count) return null;

    const servizio = servizi.find((item) => item.nome === nome);
    return {
      nome,
      count,
      durataMinuti: servizio?.durataMinuti,
    };
  }, [appuntamenti, servizi]);

  const mediaScontrino = cashActivity.averageConfirmed;

  const statoOperativoGiornata = useMemo(() => {
    const availabilityInfo = getDateAvailabilityInfo(availabilitySettings, oggi);
    if (availabilityInfo.closed) {
      return {
        label: 'Salone chiuso oggi',
        tone: styles.statusCalm,
        textTone: styles.statusCalmText,
      };
    }

    const candidateSlots = buildDisplayTimeSlots(availabilitySettings, oggi).filter((slotTime) => {
      const slotMinutes = timeToMinutes(slotTime);
      return slotMinutes > currentTimeMinutes;
    });

    const bookableSlots = candidateSlots.filter((slotTime) => {
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime, { dateValue: oggi })) {
        return false;
      }

      if (isSlotBlockedByOverride(availabilitySettings, oggi, slotTime)) {
        return false;
      }

      return true;
    });

    const occupiedBookableSlots = bookableSlots.filter((slotTime) => {
      const slotMinutes = timeToMinutes(slotTime);
      return appuntamentiOggi.some((appointment) => {
        const appointmentStartMinutes = timeToMinutes(appointment.ora);
        const appointmentEndMinutes = timeToMinutes(getAppointmentEndTime(appointment, servizi));
        return slotMinutes >= appointmentStartMinutes && slotMinutes < appointmentEndMinutes;
      });
    }).length;

    const remainingBookableSlots = Math.max(bookableSlots.length - occupiedBookableSlots, 0);
    const occupancyRatio =
      bookableSlots.length > 0 ? occupiedBookableSlots / bookableSlots.length : 0;

    if (bookableSlots.length === 0) {
      return {
        label: appuntamentiOggi.length > 0 ? 'Nessuno slot libero' : 'Disponibilità terminata',
        tone: styles.statusHot,
        textTone: styles.statusHotText,
      };
    }

    if (remainingBookableSlots === 0) {
      return {
        label: 'Nessuno slot libero',
        tone: styles.statusHot,
        textTone: styles.statusHotText,
      };
    }

    if (occupancyRatio >= 0.85 || remainingBookableSlots <= 2) {
      return {
        label: 'Quasi piena',
        tone: styles.statusHot,
        textTone: styles.statusHotText,
      };
    }

    if (occupancyRatio >= 0.6 || remainingBookableSlots <= 5) {
      return {
        label: 'Disponibilità limitata',
        tone: styles.statusWarm,
        textTone: styles.statusWarmText,
      };
    }

    if (appuntamentiOggi.length === 0) {
      return {
        label: 'Giornata libera',
        tone: styles.statusCalm,
        textTone: styles.statusCalmText,
      };
    }

    return {
      label: 'Buona disponibilita',
      tone: styles.statusCalm,
      textTone: styles.statusCalmText,
    };
  }, [
    styles,
    appuntamentiOggi,
    availabilitySettings,
    currentTimeMinutes,
    oggi,
    servizi,
  ]);

  // Read-only Home indicators reuse the existing day-slot rules. They never authorize bookings.
  const premiumOperationalMetrics = useMemo(() => {
    const closed = getDateAvailabilityInfo(availabilitySettings, oggi).closed;
    const slots = closed ? [] : buildDisplayTimeSlots(availabilitySettings, oggi).filter(time =>
      !isTimeBlockedByLunchBreak(availabilitySettings, time, {dateValue:oggi}) &&
      !isSlotBlockedByOverride(availabilitySettings, oggi, time));
    const occupied = (time:string) => appuntamentiOggi.some(appointment => {
      const minute=timeToMinutes(time);
      return minute>=timeToMinutes(appointment.ora) && minute<timeToMinutes(getAppointmentEndTime(appointment,servizi));
    });
    const remaining = slots.filter(time=>timeToMinutes(time)>currentTimeMinutes && !occupied(time)).length;
    const occupancy = slots.length ? Math.round(slots.filter(occupied).length/slots.length*100) : null;
    const month=oggi.slice(0,7);
    const hasClientDates=clienti.every(client=>client.createdAt && Number.isFinite(Date.parse(client.createdAt)));
    const newClients=hasClientDates?clienti.filter(client=>{
      const date=new Date(client.createdAt!);
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`===month;
    }).length:null;
    return {pending:richiestePrenotazione.filter(request=>request.stato==='In attesa' && request.data>=oggi).length,remaining,occupancy,newClients,closed};
  },[availabilitySettings,oggi,appuntamentiOggi,servizi,currentTimeMinutes,clienti,richiestePrenotazione]);

  const livelloOperativo = useMemo(() => {
    return statoOperativoGiornata;
  }, [statoOperativoGiornata]);
  const dashboardStatusLabel = livelloOperativo.label;
  const shouldHoldOwnerHomeData =
    !ownerHomeDataSettled ||
    (Platform.OS !== 'web' && (
      !isAuthenticated || ownerExplicitLogout || ownerInitialDataHydrating ||
      !ownerServerSyncReady || !ownerAppointmentsAuthoritative ||
      !ownerMobileSessionAccessReady
    ));
  const shouldHoldDashboardSummaryMetrics = shouldHoldOwnerHomeData;
  const shouldHoldTotalIncomeMetric = shouldHoldOwnerHomeData;
  const shouldHoldAppointmentsTodayMetric = shouldHoldOwnerHomeData;
  const shouldHoldToCollectMetric = shouldHoldOwnerHomeData;
  const shouldHoldClientMetric = shouldHoldOwnerHomeData;
  const shouldHoldBottomSummaryMetrics = shouldHoldOwnerHomeData;
  const dashboardAppointmentsTodayLabel = String(appuntamentiOggi.length);
  const dashboardToCollectLabel = String(appuntamentiOggi.filter(item => !item.incassato && !item.nonEffettuato).length);
  const dashboardClientCountLabel = String(numeroClienti);
  const dashboardTotalIncomeLabel = formatCash(cashActivity.confirmed);
  const dashboardPendingCashLabel = formatCash(cashActivity.pending);
  const dashboardLegacyCashLabel = formatCash(cashActivity.legacy);
  const dashboardLastClientLabel = ultimoCliente
    ? `Ultimo: ${ultimoCliente.nome}`
    : clienti.length > 0 ? 'Ultima registrazione in sincronizzazione' : tApp(appLanguage, 'home_no_customer');
  const dashboardCollectedAppointmentsLabel = String(appuntamentiIncassati);
  const dashboardBookingsCountLabel = String(numeroAppuntamenti);
  const dashboardToCollectAppointmentsCountLabel = String(appuntamentiDaIncassare);
  const dashboardPriorityTitle = prossimoSlotPrioritario.hasMultiRole && prossimoSlotPrioritario.time
      ? `${prossimoSlotPrioritario.time} · ${prossimoSlotPrioritario.appointments.length} priorità`
    : prossimoAppuntamento
      ? `${prossimoAppuntamento.ora} · ${prossimoAppuntamento.cliente}`
      : 'Nessun prossimo appuntamento oggi';
  const dashboardPriorityHint = prossimoSlotPrioritario.hasMultiRole
      ? 'Stesso orario, mestieri diversi: scorri le priorità del prossimo slot.'
    : prossimoAppuntamento
      ? `${prossimoAppuntamento.servizio} · € ${prossimoAppuntamento.prezzo.toFixed(0)}`
      : 'Hai chiuso tutti gli appuntamenti in agenda per oggi';
  const priorityIndicatorScrollable = priorityContentHeight - priorityViewportHeight > 4;
  const priorityIndicatorTrackHeight = Math.max(priorityViewportHeight - 8, 64);
  const priorityIndicatorThumbHeight = priorityIndicatorScrollable
    ? Math.max(
        38,
        Math.min(
          priorityIndicatorTrackHeight,
          (priorityViewportHeight / Math.max(priorityContentHeight, 1)) * priorityIndicatorTrackHeight
        )
      )
    : Math.max(38, priorityIndicatorTrackHeight);
  const priorityIndicatorMaxTravel = Math.max(
    priorityIndicatorTrackHeight - priorityIndicatorThumbHeight,
    0
  );
  const priorityIndicatorScrollRange = Math.max(priorityContentHeight - priorityViewportHeight, 1);

  const priorityIndicatorThumbAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.max(
      0,
      Math.min(priorityScrollOffset.value / priorityIndicatorScrollRange, 1)
    );
    const translateY = priorityIndicatorMaxTravel * progress;
    const thumbWidth = priorityIndicatorActive.value > 0.5 ? 8 : 6;
    const centeredOffset = (4 - thumbWidth) / 2;

    return {
      width: withTiming(thumbWidth, {
        duration: 180,
        easing: Easing.out(Easing.quad),
      }),
      transform: [
        { translateY },
        {
          translateX: withTiming(centeredOffset, {
            duration: 180,
            easing: Easing.out(Easing.quad),
          }),
        },
      ],
      backgroundColor:
        priorityIndicatorActive.value > 0.5
          ? 'rgba(176, 182, 192, 0.94)'
          : 'rgba(198, 203, 212, 0.88)',
      shadowOpacity: withTiming(priorityIndicatorActive.value > 0.5 ? 0.24 : 0.12, {
        duration: 180,
        easing: Easing.out(Easing.quad),
      }),
      shadowRadius: withTiming(priorityIndicatorActive.value > 0.5 ? 10 : 6, {
        duration: 180,
        easing: Easing.out(Easing.quad),
      }),
      opacity: priorityIndicatorScrollable ? 1 : 0.65,
    };
  }, [
    priorityIndicatorMaxTravel,
    priorityIndicatorScrollRange,
    priorityIndicatorScrollable,
  ]);

  const operatorDailyBoards = useMemo(() => {
    if (IS_ANDROID && !androidHomeSecondaryReady) {
      return [];
    }

    const pendingRequestsToday = richiestePrenotazione
      .filter((item) => item.data === oggi && item.stato === 'In attesa')
      .sort((first, second) => first.ora.localeCompare(second.ora));

    return operatori
      .map((operator) => {
        const appointmentsToday = appuntamentiOggi.filter((item) =>
          isSameOperatorIdentity(item, operator)
        );
        const pendingRequests = pendingRequestsToday.filter((item) =>
          isSameOperatorIdentity(item, operator)
        );

        const timeline = [
          ...appointmentsToday.map((item) => ({
            id: `appointment-${item.id}`,
            ora: item.ora,
            title: item.cliente,
            subtitle: `${item.servizio} · € ${item.prezzo.toFixed(2)}`,
            badge: item.nonEffettuato
              ? 'Non effettuato'
              : item.completato
              ? 'Completato'
              : item.incassato
              ? 'Incassato'
              : 'Da fare',
            tone:
              item.nonEffettuato
                ? 'muted'
                : item.completato
                ? 'done'
                : item.incassato
                ? 'cash'
                : 'appointment',
          })),
          ...pendingRequests.map((item) => ({
            id: `request-${item.id}`,
            ora: item.ora,
            title: `${item.nome} ${item.cognome}`.trim(),
            subtitle: `Richiesta · ${item.servizio}`,
            badge: 'In attesa',
            tone: 'request',
          })),
        ].sort((first, second) => first.ora.localeCompare(second.ora));

        const remainingAppointments = appointmentsToday.filter(
          (item) => !item.completato && !item.nonEffettuato
        ).length;

        return {
          operator,
          appointmentsToday,
          pendingRequests,
          timeline,
          totalAssigned: appointmentsToday.length + pendingRequests.length,
          openTasks: remainingAppointments + pendingRequests.length,
          nextItem: timeline.find((entry) => { const [hours, minutes] = entry.ora.split(':').map(Number); return hours * 60 + minutes >= currentTimeMinutes && (entry.tone === 'appointment' || entry.tone === 'request'); }) ?? null,
        };
      })
      .sort((first, second) => {
        if (second.openTasks !== first.openTasks) {
          return second.openTasks - first.openTasks;
        }

        if (second.totalAssigned !== first.totalAssigned) {
          return second.totalAssigned - first.totalAssigned;
        }

        return first.operator.nome.localeCompare(second.operator.nome, 'it');
      });
  }, [
    currentTimeMinutes,
    androidHomeSecondaryReady,
    appuntamentiOggi,
    oggi,
    operatori,
    richiestePrenotazione,
  ]);

  const totalOperatorOpenTasks = operatorDailyBoards.reduce((total, item) => total + item.openTasks, 0);
  const totalOperatorPendingRequests = operatorDailyBoards.reduce(
    (total, item) => total + item.pendingRequests.length,
    0
  );
  const shouldHoldOperatorInsightMetrics = shouldHoldOwnerHomeData;
  const operatorBoardPreview = operatorDailyBoards.filter((item) => item.totalAssigned > 0).slice(0, 3);
  const visibleOperatorBoards = useMemo(
    () =>
      selectedOperatorBoardId
        ? operatorDailyBoards.filter((item) => item.operator.id === selectedOperatorBoardId)
        : operatorDailyBoards,
    [operatorDailyBoards, selectedOperatorBoardId]
  );

  const openOperatorAgendaModalForAll = useCallback(() => {
    setSelectedOperatorBoardId(null);
    setShowOperatorAgendaModal(true);
  }, []);

  const openOperatorAgendaModalForOperator = useCallback((operatorId: string) => {
    setSelectedOperatorBoardId(operatorId);
    setShowOperatorAgendaModal(true);
  }, []);

  const selectedOperatorBoard = useMemo(
    () => operatorDailyBoards.find((item) => item.operator.id === selectedOperatorBoardId) ?? null,
    [operatorDailyBoards, selectedOperatorBoardId]
  );
  const printableOperators = useMemo(
    () =>
      (selectedOperatorBoardId
        ? operatori.filter((item) => item.id === selectedOperatorBoardId)
        : operatori
      ).slice().sort((first, second) => {
        const firstRole = normalizeRoleName(first.mestiere ?? '');
        const secondRole = normalizeRoleName(second.mestiere ?? '');

        if (firstRole !== secondRole) {
          if (!firstRole) return 1;
          if (!secondRole) return -1;
          return firstRole.localeCompare(secondRole, 'it', { sensitivity: 'base' });
        }

        return first.nome.localeCompare(second.nome, 'it', { sensitivity: 'base' });
      }),
    [operatori, selectedOperatorBoardId]
  );
  const operatorAgendaPrintRange = useMemo(() => {
    if (operatorAgendaPrintScope === 'week') {
      const startDate = getWeekStartIsoDate(oggi);
      return {
        startDate,
        endDate: getWeekEndIsoDate(oggi),
        label: formatOperatorAgendaScopeLabel({
          scope: 'week',
          startDate,
          endDate: getWeekEndIsoDate(oggi),
        }),
      };
    }

    if (operatorAgendaPrintScope === 'month') {
      const startDate = getMonthStartIsoDate(oggi);
      const endDate = getMonthEndIsoDate(oggi);
      return {
        startDate,
        endDate,
        label: formatOperatorAgendaScopeLabel({
          scope: 'month',
          startDate,
          endDate,
        }),
      };
    }

    return {
      startDate: oggi,
      endDate: oggi,
      label: formatOperatorAgendaScopeLabel({
        scope: 'day',
        startDate: oggi,
        endDate: oggi,
      }),
    };
  }, [oggi, operatorAgendaPrintScope]);
  const operatorAgendaPrintDays = useMemo(() => {
    if (IS_ANDROID && !androidHomeSecondaryReady) {
      return [];
    }

    const rangeDates = buildInclusiveDateRange(
      operatorAgendaPrintRange.startDate,
      operatorAgendaPrintRange.endDate
    );

    const matchingAppointments = appuntamenti
      .filter((item) => {
        const itemDate = item.data ?? oggi;
        return (
          itemDate >= operatorAgendaPrintRange.startDate &&
          itemDate <= operatorAgendaPrintRange.endDate &&
          printableOperators.some((operator) => isSameOperatorIdentity(item, operator))
        );
      })
      .sort((first, second) => {
        const firstDate = first.data ?? oggi;
        const secondDate = second.data ?? oggi;
        return firstDate === secondDate
          ? first.ora.localeCompare(second.ora)
          : firstDate.localeCompare(secondDate);
      });

    const matchingPendingRequests = richiestePrenotazione
      .filter((item) => {
        return (
          item.stato === 'In attesa' &&
          item.data >= operatorAgendaPrintRange.startDate &&
          item.data <= operatorAgendaPrintRange.endDate &&
          printableOperators.some((operator) => isSameOperatorIdentity(item, operator))
        );
      })
      .sort((first, second) => {
        return first.data === second.data
          ? first.ora.localeCompare(second.ora)
          : first.data.localeCompare(second.data);
      });

    const datesWithActivity = Array.from(
      new Set([
        ...matchingAppointments.map((item) => item.data ?? oggi),
        ...matchingPendingRequests.map((item) => item.data),
      ])
    ).sort((first, second) => first.localeCompare(second));

    const datesToRender =
      operatorAgendaPrintScope === 'day'
        ? rangeDates
        : datesWithActivity.length > 0
          ? datesWithActivity
          : [operatorAgendaPrintRange.startDate];

    return datesToRender.map((dateValue) => {
      const dayAppointments = matchingAppointments.filter((item) => (item.data ?? oggi) === dateValue);
      const dayRequests = matchingPendingRequests.filter((item) => item.data === dateValue);

      const slots = Array.from(
        new Set([
          ...dayAppointments.map((item) => item.ora),
          ...dayRequests.map((item) => item.ora),
        ])
      ).sort((first, second) => first.localeCompare(second));

      const rows = slots.map((slotTime) => {
        const cells = printableOperators.map((operator) => {
          const appointmentBlocks = dayAppointments
            .filter((item) => item.ora === slotTime && isSameOperatorIdentity(item, operator))
            .map((item) => {
              const roleLabel = resolveAppointmentRoleLabel({
                appointment: item,
                services: servizi,
                operators: operatori,
              });
              const accent = getHomePriorityAccent(item.servizio, roleLabel);
              const durationMinutes =
                typeof item.durataMinuti === 'number' && item.durataMinuti > 0
                  ? item.durataMinuti
                  : servizi.find((service) => service.nome === item.servizio)?.durataMinuti ?? 30;
              return {
                id: `appointment-${item.id}`,
                title: item.cliente,
                serviceLabel: item.servizio,
                timeLabel: `${item.ora} - ${getAppointmentEndTime(item, servizi)}`,
                badge: item.nonEffettuato
                  ? 'Non effettuato'
                  : item.completato
                    ? 'Completato'
                    : item.incassato
                      ? 'Incassato'
                      : 'Da fare',
                accent,
                isRequest: false,
                durationMinutes,
              };
            });

          const requestBlocks = dayRequests
            .filter((item) => item.ora === slotTime && isSameOperatorIdentity(item, operator))
            .map((item) => {
              const roleLabel = resolveAppointmentRoleLabel({
                appointment: item,
                services: servizi,
                operators: operatori,
              });
              const accent = getHomePriorityAccent(item.servizio, roleLabel);
              const durationMinutes =
                typeof item.durataMinuti === 'number' && item.durataMinuti > 0
                  ? item.durataMinuti
                  : servizi.find((service) => service.nome === item.servizio)?.durataMinuti ?? 30;
              return {
                id: `request-${item.id}`,
                title: `${item.nome} ${item.cognome}`.trim(),
                serviceLabel: item.servizio,
                timeLabel: `${item.ora} - ${getAppointmentEndTime(item, servizi)}`,
                badge: 'In attesa',
                accent,
                isRequest: true,
                durationMinutes,
              };
            });

          const allBlocks = [...appointmentBlocks, ...requestBlocks];

          return {
            operator,
            blocks: allBlocks,
            slotAccent: allBlocks[0]?.accent ?? getHomePriorityAccent('', operator.mestiere),
          };
        });

        const estimateBlockHeight = ({
          durationMinutes,
          title,
          serviceLabel,
        }: {
          durationMinutes: number;
          title: string;
          serviceLabel: string;
        }) => {
          const normalizedDuration = Math.max(30, durationMinutes);
          const extraHalfHours = Math.max(0, Math.ceil((normalizedDuration - 30) / 30));
          const titleOverflowLines = Math.max(0, Math.ceil(title.length / 12) - 1);
          const serviceOverflowLines = Math.max(0, Math.ceil(serviceLabel.length / 13) - 1);
          return 68 + extraHalfHours * 16 + titleOverflowLines * 12 + serviceOverflowLines * 8;
        };

        return {
          slotTime,
          cells,
          rowHeight: Math.max(
            64,
            ...cells.map((cell) => {
              if (cell.blocks.length === 0) {
                return 86;
              }

              return cell.blocks.reduce((total, block, blockIndex) => {
                return (
                  total +
                  estimateBlockHeight({
                    durationMinutes: block.durationMinutes,
                    title: block.title,
                    serviceLabel: block.serviceLabel,
                  }) +
                  (blockIndex > 0 ? 8 : 0)
                );
              }, 0);
            })
          ),
        };
      });

      return {
        date: dateValue,
        rows,
        appointmentsCount: dayAppointments.length,
        requestsCount: dayRequests.length,
      };
    });
  }, [
    appuntamenti,
    androidHomeSecondaryReady,
    getHomePriorityAccent,
    oggi,
    operatorAgendaPrintRange.endDate,
    operatorAgendaPrintRange.startDate,
    operatorAgendaPrintScope,
    operatori,
    printableOperators,
    richiestePrenotazione,
    servizi,
  ]);

  const customerInsightBoards = useMemo(() => {
    if (IS_ANDROID && !androidHomeSecondaryReady) {
      return [];
    }

    return clienti
      .map((customer, customerIndex) => {
        const boardKey = buildCustomerInsightIdentityKey(customer, customerIndex);
        const customerAppointments = appuntamenti
          .filter((item) => isSameCustomerIdentity(item, customer))
          .sort((first, second) => {
            const firstDate = first.data ?? oggi;
            const secondDate = second.data ?? oggi;

            if (firstDate !== secondDate) {
              return secondDate.localeCompare(firstDate);
            }

            return second.ora.localeCompare(first.ora);
          });

        const pastAppointments = customerAppointments.filter((item) => (item.data ?? oggi) < oggi);
        const todayAppointments = customerAppointments.filter((item) => (item.data ?? oggi) === oggi);
        const futureAppointments = customerAppointments.filter((item) => (item.data ?? oggi) > oggi);
        const deliveredAppointments = customerAppointments.filter((item) => !item.nonEffettuato);
        const completedAppointments = customerAppointments.filter((item) => item.completato);
        const incassatoAppointments = customerAppointments.filter((item) => item.incassato);
        const totalSpent = deliveredAppointments.reduce((total, item) => total + item.prezzo, 0);
        const collectedSpent = incassatoAppointments.reduce((total, item) => total + item.prezzo, 0);
        const averageTicket =
          deliveredAppointments.length > 0 ? totalSpent / deliveredAppointments.length : 0;
        const nextAppointment =
          [...todayAppointments, ...futureAppointments]
            .sort((first, second) => {
              const firstDate = first.data ?? oggi;
              const secondDate = second.data ?? oggi;

              if (firstDate !== secondDate) {
                return firstDate.localeCompare(secondDate);
              }

              return first.ora.localeCompare(second.ora);
            })[0] ?? null;
        const latestAppointment = customerAppointments[0] ?? null;
        const serviceStats = Object.entries(
          deliveredAppointments.reduce<Record<string, { count: number; total: number }>>(
            (accumulator, item) => {
              const current = accumulator[item.servizio] ?? { count: 0, total: 0 };
              accumulator[item.servizio] = {
                count: current.count + 1,
                total: current.total + item.prezzo,
              };
              return accumulator;
            },
            {}
          )
        )
          .map(([serviceName, stats]) => ({
            serviceName,
            count: stats.count,
            total: stats.total,
          }))
          .sort((first, second) => {
            if (second.count !== first.count) {
              return second.count - first.count;
            }

            return second.total - first.total;
          });

        const timeline = customerAppointments.map((item, appointmentIndex) => {
          const appointmentDate = item.data ?? oggi;
          const dateLabel = formatDateLabel(appointmentDate);
          const phase =
            appointmentDate > oggi ? 'Futuro' : appointmentDate < oggi ? 'Passato' : 'Oggi';
          const badge = item.nonEffettuato
            ? 'Non effettuato'
            : item.completato
            ? 'Completato'
            : item.incassato
            ? 'Incassato'
            : appointmentDate > oggi
            ? 'Prenotato'
            : appointmentDate < oggi
            ? 'Svolto'
            : 'In corso';
          const tone =
            phase === 'Futuro'
              ? 'future'
              : phase === 'Oggi'
              ? 'today'
              : item.nonEffettuato
              ? 'muted'
              : 'past';

          return {
            id: [
              item.id,
              item.data ?? oggi,
              item.ora,
              item.servizio,
              String(appointmentIndex),
            ].join('|'),
            dateLabel,
            ora: item.ora,
            title: item.servizio,
            subtitle: `€ ${item.prezzo.toFixed(2)}${item.operatoreNome ? ` · ${item.operatoreNome}` : ''}`,
            badge,
            phase,
            tone,
          };
        });

        return {
          boardKey,
          customer,
          customerAppointments,
          timeline,
          totalAppointments: customerAppointments.length,
          pastAppointments: pastAppointments.length,
          todayAppointments: todayAppointments.length,
          futureAppointments: futureAppointments.length,
          completedAppointments: completedAppointments.length,
          collectedAppointments: incassatoAppointments.length,
          totalSpent,
          collectedSpent,
          averageTicket,
          nextAppointment,
          latestAppointment,
          serviceStats,
        };
      })
      .filter((item) => item.totalAppointments > 0)
      .sort((first, second) => {
        if (second.futureAppointments !== first.futureAppointments) {
          return second.futureAppointments - first.futureAppointments;
        }

        if (second.totalSpent !== first.totalSpent) {
          return second.totalSpent - first.totalSpent;
        }

        return first.customer.nome.localeCompare(second.customer.nome, 'it');
      });
  }, [androidHomeSecondaryReady, appuntamenti, clienti, oggi]);

  const totalCustomerDeliveredSpend = customerInsightBoards.reduce(
    (total, item) => total + item.totalSpent,
    0
  );
  const shouldHoldCustomerInsightMetrics = shouldHoldOwnerHomeData;
  const totalCustomerDeliveredSpendCompact = `€${Math.round(totalCustomerDeliveredSpend).toLocaleString(
    'it-IT'
  )}`;
  const filteredCustomerInsightBoards = useMemo(() => {
    const query = lowerItalian(customerInsightSearchQuery.trim());

    if (!query) {
      return customerInsightBoards;
    }

    return customerInsightBoards.filter(({ customer, serviceStats }) => {
      const searchableParts = lowerItalian([
        customer.nome,
        customer.telefono,
        customer.email ?? '',
        customer.instagram ?? '',
        ...serviceStats.map((item) => item.serviceName),
      ].join(' '));

      return searchableParts.includes(query);
    });
  }, [customerInsightBoards, customerInsightSearchQuery]);

  const selectedCustomerInsightBoard = useMemo(
    () =>
      filteredCustomerInsightBoards.find((item) => item.boardKey === selectedCustomerInsightId) ??
      customerInsightBoards.find((item) => item.boardKey === selectedCustomerInsightId) ??
      filteredCustomerInsightBoards[0] ??
      null,
    [customerInsightBoards, filteredCustomerInsightBoards, selectedCustomerInsightId]
  );

  const customerAppointmentFilterOptions = useMemo(
    () =>
      selectedCustomerInsightBoard
        ? [
            { key: 'all' as const, label: 'Tutti', count: selectedCustomerInsightBoard.totalAppointments },
            { key: 'today' as const, label: 'Oggi', count: selectedCustomerInsightBoard.todayAppointments },
            { key: 'future' as const, label: 'Futuri', count: selectedCustomerInsightBoard.futureAppointments },
            { key: 'past' as const, label: 'Passati', count: selectedCustomerInsightBoard.pastAppointments },
          ]
        : [],
    [selectedCustomerInsightBoard]
  );

  const visibleCustomerTimeline = useMemo(() => {
    if (!selectedCustomerInsightBoard) {
      return [];
    }

    return selectedCustomerInsightBoard.timeline.filter((entry) => {
      if (customerAppointmentFilter === 'today') return entry.phase === 'Oggi';
      if (customerAppointmentFilter === 'future') return entry.phase === 'Futuro';
      if (customerAppointmentFilter === 'past') return entry.phase === 'Passato';
      return true;
    });
  }, [customerAppointmentFilter, selectedCustomerInsightBoard]);

  useEffect(() => {
    const nextSelectedCustomerInsightId =
      filteredCustomerInsightBoards.length === 0
        ? null
        : !selectedCustomerInsightId ||
            !filteredCustomerInsightBoards.some(
              (item) => item.boardKey === selectedCustomerInsightId
            )
          ? filteredCustomerInsightBoards[0].boardKey
          : selectedCustomerInsightId;

    if (nextSelectedCustomerInsightId !== selectedCustomerInsightId) {
      setSelectedCustomerInsightId(nextSelectedCustomerInsightId);
    }
  }, [filteredCustomerInsightBoards, selectedCustomerInsightId]);

  useEffect(() => {
    setCustomerAppointmentFilter((current) => (current === 'all' ? current : 'all'));
  }, [selectedCustomerInsightId]);

  const openCustomerInsightsModalForAll = useCallback(() => {
    setCustomerInsightSearchQuery('');
    setCustomerAppointmentFilter('all');
    setSelectedCustomerInsightId(customerInsightBoards[0]?.boardKey ?? null);
    setShowCustomerInsightsModal(true);
  }, [customerInsightBoards]);

  const openCustomerInsightsModalForCustomer = useCallback((customerKey: string) => {
    setCustomerInsightSearchQuery('');
    setCustomerAppointmentFilter('all');
    setSelectedCustomerInsightId(customerKey);
    setShowCustomerInsightsModal(true);
  }, []);

  const buildOperatorAgendaPdfHtml = useCallback(() => {
    const title = selectedOperatorBoard
      ? `Plancia appuntamenti · ${selectedOperatorBoard.operator.nome}`
      : 'Plancia appuntamenti operatori';

    const resolveSlotTextScale = (value: string, thresholds: [number, number, number], sizes: [number, number, number, number]) => {
      if (value.length <= thresholds[0]) return sizes[0];
      if (value.length <= thresholds[1]) return sizes[1];
      if (value.length <= thresholds[2]) return sizes[2];
      return sizes[3];
    };

    const renderBlockBadgeClass = (badge: string) => {
      if (badge === 'In attesa') return 'is-request';
      if (badge === 'Completato') return 'is-done';
      if (badge === 'Incassato') return 'is-cash';
      if (badge === 'Non effettuato') return 'is-muted';
      return 'is-default';
    };
    const splitWordsForSlot = (value: string) => {
      const words = value
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean);

      if (words.length === 0) {
        return [''];
      }

      if (words.length === 1) {
        return [words[0]];
      }

      return [words[0], words.slice(1).join(' ')];
    };

    const sectionsHtml = operatorAgendaPrintDays
      .map((day) => {
        const operatorHeaders = printableOperators
          .map((operator) => {
            const accent = getHomePriorityAccent('', operator.mestiere);
            const nameFontSize = resolveSlotTextScale(operator.nome, [8, 12, 16], [12, 11, 10, 9]);
            const roleFontSize = resolveSlotTextScale(operator.mestiere || 'Operatore', [8, 12, 16], [9, 8.3, 7.6, 7]);
            return `
              <div class="operator-head" style="background:${escapeHtml(blendHexWithWhite(accent.bg, 0.24))};border-color:${escapeHtml(accent.border)};">
                <div class="operator-head-name" style="font-size:${nameFontSize}px;">${escapeHtml(operator.nome)}</div>
                <div class="operator-head-role" style="font-size:${roleFontSize}px;">${escapeHtml(operator.mestiere || 'Operatore')}</div>
              </div>
            `;
          })
          .join('');

        const rowsHtml =
          day.rows.length === 0
            ? `
                <div class="empty-grid">
                  Nessun appuntamento o richiesta nel periodo selezionato.
                </div>
              `
            : day.rows
                .map((row) => {
                  const cellsHtml = row.cells
                    .map((cell) => {
                      const cellBg = blendHexWithWhite(cell.slotAccent.bg, 0.94);
                      const cellEmptyBg = blendHexWithWhite(cell.slotAccent.bg, 0.9);
                      const cellEmptyBorder = blendHexWithWhite(cell.slotAccent.border, 0.52);
                      const blocksHtml = cell.blocks
                        .map((block) => {
                          const badgeFontSize = resolveSlotTextScale(block.badge, [8, 12, 18], [8, 7.5, 7, 6.5]);
                          const timeFontSize = resolveSlotTextScale(block.timeLabel, [11, 13, 16], [8, 7.4, 6.8, 6.3]);
                          const titleLines = splitWordsForSlot(block.title);
                          const serviceLines = splitWordsForSlot(block.serviceLabel);
                          const longestTitleLineLength = Math.max(...titleLines.map((line) => line.length));
                          const longestServiceLineLength = Math.max(...serviceLines.map((line) => line.length));
                          const titleFontSize = resolveSlotTextScale(
                            'x'.repeat(Math.max(1, longestTitleLineLength)),
                            [2, 4, 6],
                            [10, 9, 8, 7]
                          );
                          const serviceFontSize = resolveSlotTextScale(
                            'x'.repeat(Math.max(1, longestServiceLineLength)),
                            [2, 4, 6],
                            [8, 7.3, 6.7, 6.1]
                          );
                          return `
                            <div
                              class="slot-block ${renderBlockBadgeClass(block.badge)}"
                              style="background:${escapeHtml(blendHexWithWhite(block.accent.bg, 0.32))};border-color:${escapeHtml(block.accent.border)};"
                            >
                              <div class="slot-block-badge" style="font-size:${badgeFontSize}px;">${escapeHtml(block.badge)}</div>
                              <div class="slot-block-time" style="font-size:${timeFontSize}px;">${escapeHtml(block.timeLabel.split(' - ')[0] ?? row.slotTime)}</div>
                              <div class="slot-block-time" style="font-size:${timeFontSize}px;">${escapeHtml(block.timeLabel.split(' - ')[1] ?? '')}</div>
                              <div class="slot-block-title-group">
                                ${titleLines
                                  .map(
                                    (line) =>
                                      `<div class="slot-block-title" style="font-size:${titleFontSize}px;">${escapeHtml(line)}</div>`
                                  )
                                  .join('')}
                              </div>
                              <div class="slot-block-service-group">
                                ${serviceLines
                                  .map(
                                    (line) =>
                                      `<div class="slot-block-service" style="font-size:${serviceFontSize}px;">${escapeHtml(line)}</div>`
                                  )
                                  .join('')}
                              </div>
                            </div>
                          `;
                        })
                        .join('');

                      return `
                        <div class="grid-cell" style="min-height:${Math.max(86, row.rowHeight)}px;background:${escapeHtml(cellBg)};">
                          ${blocksHtml || `<div class="grid-cell-empty" style="background:${escapeHtml(cellEmptyBg)};border-color:${escapeHtml(cellEmptyBorder)};"></div>`}
                        </div>
                      `;
                    })
                    .join('');

                  return `
                    <div class="grid-row" style="min-height:${Math.max(86, row.rowHeight)}px;">
                      <div class="time-cell">${escapeHtml(row.slotTime)}</div>
                      ${cellsHtml}
                    </div>
                  `;
                })
                .join('');

        return `
          <section class="day-sheet">
            <div class="day-sheet-header">
              <div class="day-sheet-title">${escapeHtml(formatLongDateLabel(day.date))}</div>
              <div class="day-sheet-meta">${escapeHtml(formatDateLabel(day.date))}</div>
              <div class="day-sheet-stats">
                <div class="day-pill">${day.appointmentsCount} appuntamenti</div>
                <div class="day-pill">${day.requestsCount} richieste</div>
              </div>
            </div>
            <div class="agenda-grid">
              <div class="grid-header">
                <div class="time-head">Ora</div>
                ${operatorHeaders}
              </div>
              ${rowsHtml}
            </div>
          </section>
        `;
      })
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body { margin: 0; padding: 0; background: #ffffff; color: #17223b; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
            body { padding: 10px; }
            .report-shell { width: 100%; }
            .report-top { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: start; }
            .report-kicker { font-size: 10px; line-height: 1; font-weight: 900; letter-spacing: 0.28em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
            h1 { margin: 0; font-size: 31px; line-height: 0.98; letter-spacing: -0.06em; font-weight: 900; color: #16213e; max-width: 420px; }
            .report-meta { margin-top: 10px; font-size: 14px; line-height: 1.2; color: #475569; font-weight: 800; }
            .report-badges { display: grid; gap: 10px; justify-items: end; }
            .report-badge {
              min-width: 190px;
              border: 1px solid #d8e3f1;
              border-radius: 999px;
              padding: 10px 16px;
              font-size: 10px;
              line-height: 1.2;
              color: #334155;
              font-weight: 900;
              background: #ffffff;
              text-align: center;
            }
            .report-divider { margin: 14px 0 18px; height: 2px; background: #e2e8f0; }
            .day-sheet {
              border: 1px solid #d7e2ef;
              border-radius: 22px;
              overflow: hidden;
              background: #ffffff;
              break-inside: avoid;
              page-break-inside: avoid;
              margin-bottom: 18px;
            }
            .day-sheet-header {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 12px;
              align-items: center;
              padding: 16px 18px 14px;
              background: linear-gradient(180deg, #f4f8ff 0%, #edf4ff 100%);
              border-bottom: 1px solid #dce6f3;
            }
            .day-sheet-title { font-size: 24px; line-height: 1.05; font-weight: 900; color: #16213e; margin-bottom: 4px; }
            .day-sheet-meta { font-size: 12px; line-height: 1.2; color: #64748b; font-weight: 900; letter-spacing: 0.06em; }
            .day-sheet-stats { display: flex; gap: 10px; align-items: center; }
            .day-pill {
              border: 1px solid #d8e3f1;
              border-radius: 999px;
              padding: 10px 14px;
              background: #ffffff;
              color: #334155;
              font-size: 10px;
              line-height: 1.1;
              font-weight: 900;
              white-space: nowrap;
            }
            .agenda-grid { width: 100%; }
            .grid-header, .grid-row {
              display: grid;
              grid-template-columns: 62px repeat(${Math.max(1, printableOperators.length)}, 1fr);
            }
            .time-head, .time-cell {
              border-right: 1px solid #dce6f3;
              border-bottom: 1px solid #dce6f3;
              background: #ffffff;
              color: #16213e;
              font-weight: 900;
              display: flex;
              align-items: flex-start;
              justify-content: center;
              text-align: center;
              padding: 12px 6px;
              font-size: 12px;
            }
            .time-head { align-items: center; justify-content: center; font-size: 14px; }
            .operator-head {
              border-right: 1px solid #dce6f3;
              border-bottom: 1px solid #dce6f3;
              min-height: 50px;
              padding: 8px 7px 6px;
              text-align: center;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
            }
            .operator-head-name {
              line-height: 1.02;
              font-weight: 900;
              color: #16213e;
              margin-bottom: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .operator-head-role {
              line-height: 1;
              font-weight: 900;
              color: #334155;
              text-transform: uppercase;
              letter-spacing: 0.16em;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .grid-cell {
              border-right: 1px solid #dce6f3;
              border-bottom: 1px solid #dce6f3;
              padding: 7px 8px;
              overflow: hidden;
            }
            .grid-cell-empty {
              min-height: 100%;
              height: 100%;
              border-radius: 15px;
              border: 1px solid #ebeff5;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.95);
              width: 100%;
            }
            .slot-block {
              border: 1px solid;
              border-radius: 15px;
              padding: 7px 7px 7px;
              color: #16213e;
              margin-bottom: 6px;
              min-height: 78px;
              overflow: hidden;
              width: 100%;
              max-width: 100%;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
            }
            .slot-block:last-child { margin-bottom: 0; }
            .slot-block-badge {
              line-height: 1;
              font-weight: 900;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              margin-bottom: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .slot-block-time {
              line-height: 1;
              font-weight: 900;
              color: #16213e;
              margin-bottom: 1px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .slot-block-title {
              line-height: 1.02;
              font-weight: 900;
              color: #16213e;
              margin: 0 0 1px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: left;
            }
            .slot-block-service {
              line-height: 1.08;
              font-weight: 900;
              color: #16213e;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: left;
              margin: 0 0 1px;
            }
            .slot-block-title-group { margin: 4px 0 2px; }
            .slot-block-service-group { margin-top: 1px; }
            .slot-block.is-default .slot-block-badge { color: #16213e; }
            .slot-block.is-request .slot-block-badge { color: #92400e; }
            .slot-block.is-done .slot-block-badge { color: #166534; }
            .slot-block.is-cash .slot-block-badge { color: #3730a3; }
            .slot-block.is-muted .slot-block-badge { color: #4b5563; }
            .empty-grid {
              padding: 28px;
              text-align: center;
              color: #64748b;
              font-size: 13px;
              font-weight: 800;
              border-top: 1px solid #dce6f3;
            }
          </style>
        </head>
        <body>
          <div class="report-shell">
            <div class="report-top">
              <div>
                <div class="report-kicker">Agenda Operatori</div>
                <h1>${escapeHtml(title)}</h1>
                <div class="report-meta">${escapeHtml(salonWorkspace.salonName || 'Salon Pro')}</div>
              </div>
              <div class="report-badges">
                <div class="report-badge">${escapeHtml(operatorAgendaPrintRange.label)}</div>
                <div class="report-badge">${escapeHtml(printableOperators.length === 1 ? '1 operatore' : `${printableOperators.length} operatori`)}</div>
              </div>
            </div>
            <div class="report-divider"></div>
            ${sectionsHtml}
          </div>
        </body>
      </html>
    `;
  }, [
    getHomePriorityAccent,
    operatorAgendaPrintDays,
    operatorAgendaPrintRange.label,
    printableOperators,
    salonWorkspace.salonName,
    selectedOperatorBoard,
  ]);

  const exportOperatorAgendaPdf = useCallback(async () => {
    if (printableOperators.length === 0) {
      Alert.alert('Niente da esportare', 'Non ci sono appuntamenti operatori da esportare in questo momento.');
      return;
    }

    if (isOperatorAgendaSystemDialogOpen) {
      return;
    }

    setIsOperatorAgendaSystemDialogOpen(true);

    try {
      const html = buildOperatorAgendaPdfHtml();
      const fileName = [
        'agenda-operatori',
        selectedOperatorBoard ? sanitizeFileNameSegment(selectedOperatorBoard.operator.nome) : 'tutti',
        operatorAgendaPrintRange.startDate === operatorAgendaPrintRange.endDate
          ? operatorAgendaPrintRange.startDate
          : `${operatorAgendaPrintRange.startDate}-${operatorAgendaPrintRange.endDate}`,
      ]
        .filter(Boolean)
        .join('-')
        .concat('.pdf');

      if (Platform.OS === 'web') {
        const parser = new DOMParser();
        const parsedDocument = parser.parseFromString(html, 'text/html');
        const previewWindow = window.open('', '_blank');
        if (!previewWindow) {
          throw new Error('Preview window blocked');
        }

        const previewBody = parsedDocument.body.innerHTML;
        const previewStyles = parsedDocument.head.querySelector('style')?.textContent ?? '';

        previewWindow.document.open();
        previewWindow.document.write(`
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>${fileName}</title>
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  background: #edf3fb;
                }
                body {
                  min-height: 100vh;
                  display: flex;
                  justify-content: center;
                  padding: 24px 0 48px;
                }
                .preview-page {
                  width: 794px;
                  max-width: 100%;
                  background: #ffffff;
                  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14);
                }
                @media print {
                  html, body {
                    background: #ffffff;
                  }
                  body {
                    display: block;
                    padding: 0;
                  }
                  .preview-page {
                    width: auto;
                    max-width: none;
                    box-shadow: none;
                  }
                }
              </style>
              <style>${previewStyles}</style>
            </head>
            <body>
              <div class="preview-page">${previewBody}</div>
            </body>
          </html>
        `);
        previewWindow.document.close();
        return;
      }

      const result = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: selectedOperatorBoard
            ? `Condividi agenda di ${selectedOperatorBoard.operator.nome}`
            : 'Condividi agenda operatori',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({ message: result.uri });
      }
    } catch {
      Alert.alert('Export non riuscito', 'Non sono riuscito a creare il PDF. Riprova tra qualche secondo.');
    } finally {
      setIsOperatorAgendaSystemDialogOpen(false);
    }
  }, [
    buildOperatorAgendaPdfHtml,
    isOperatorAgendaSystemDialogOpen,
    operatorAgendaPrintRange.endDate,
    operatorAgendaPrintRange.startDate,
    printableOperators.length,
    selectedOperatorBoard,
  ]);

  const printOperatorAgenda = useCallback(async () => {
    if (printableOperators.length === 0) {
      Alert.alert('Niente da stampare', 'Non ci sono appuntamenti operatori da stampare in questo momento.');
      return;
    }

    if (isOperatorAgendaSystemDialogOpen) {
      return;
    }

    setIsOperatorAgendaSystemDialogOpen(true);

    try {
      const html = buildOperatorAgendaPdfHtml();
      if (Platform.OS === 'web') {
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.opacity = '0';
        printFrame.setAttribute('aria-hidden', 'true');

        const cleanup = () => {
          window.setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
          }, 300);
        };

        printFrame.onload = () => {
          const frameWindow = printFrame.contentWindow;
          if (!frameWindow) {
            cleanup();
            return;
          }

          frameWindow.onafterprint = cleanup;
          frameWindow.focus();
          frameWindow.print();
        };

        document.body.appendChild(printFrame);
        const frameDocument = printFrame.contentDocument;
        if (!frameDocument) {
          cleanup();
          throw new Error('Print frame unavailable');
        }

        frameDocument.open();
        frameDocument.write(html);
        frameDocument.close();
        return;
      }

      await Print.printAsync({ html });
    } catch {
      Alert.alert('Stampa non riuscita', 'Non sono riuscito ad aprire l’anteprima di stampa.');
    } finally {
      setIsOperatorAgendaSystemDialogOpen(false);
    }
  }, [buildOperatorAgendaPdfHtml, isOperatorAgendaSystemDialogOpen, printableOperators.length]);

  useEffect(() => {
    setAccountEmailInput((current) => (current === salonAccountEmail ? current : salonAccountEmail));
  }, [salonAccountEmail]);

  useEffect(() => {
    if (!ownerProfileNeedsCompletion) {
      hasConsumedOwnerProfileCompletionRef.current = false;
      return;
    }

    if (hasConsumedOwnerProfileCompletionRef.current) {
      return;
    }

    if (!consumeOwnerProfileNeedsCompletion()) {
      return;
    }

    hasConsumedOwnerProfileCompletionRef.current = true;
    setShowProfileSection(true);
    setIsEditingSalonProfile(true);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });

    Alert.alert(
      'Completa il profilo salone',
      'Per allineare il backend servono categoria attività, via e nome strada, comune e CAP. Ti ho aperto direttamente la sezione profilo.'
    );
  }, [consumeOwnerProfileNeedsCompletion, ownerProfileNeedsCompletion]);

  useEffect(() => {
    if (isEditingSalonProfile) {
      return;
    }

    const nextActivityCategory = toUppercaseField(salonWorkspace.activityCategory);
    const nextStreetLine = [salonWorkspace.streetType, salonWorkspace.streetName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const nextCity = toUppercaseField(salonWorkspace.city);

    setSalonNameInput((current) => (current === salonWorkspace.salonName ? current : salonWorkspace.salonName));
    setSalonNameDisplayStyleInput((current) =>
      current === salonWorkspace.salonNameDisplayStyle ? current : salonWorkspace.salonNameDisplayStyle
    );
    setSalonNameFontVariantInput((current) =>
      current === salonWorkspace.salonNameFontVariant ? current : salonWorkspace.salonNameFontVariant
    );
    setAdditionalPhonesInput(salonWorkspace.additionalPhones?.length ? salonWorkspace.additionalPhones : ['']);
    setBusinessPhoneInput((current) =>
      current === salonWorkspace.businessPhone ? current : salonWorkspace.businessPhone
    );
    setActivityCategoryInput((current) =>
      current === nextActivityCategory ? current : nextActivityCategory
    );
    setStreetLineInput((current) => (current === nextStreetLine ? current : nextStreetLine));
    setCityInput((current) => (current === nextCity ? current : nextCity));
    setPostalCodeInput((current) =>
      current === salonWorkspace.postalCode ? current : salonWorkspace.postalCode
    );
  }, [
    salonWorkspace.activityCategory,
    salonWorkspace.businessPhone,
    salonWorkspace.city,
    salonWorkspace.postalCode,
    salonWorkspace.salonName,
    salonWorkspace.salonNameDisplayStyle,
    salonWorkspace.salonNameFontVariant,
    salonWorkspace.streetName,
    salonWorkspace.streetType,
    isEditingSalonProfile,
  ]);

  const salvaDatiSalone = async () => {
    if (
      !salonNameInput.trim() ||
      !activityCategoryInput.trim() ||
      !businessPhoneInput.trim() ||
      !streetLineInput.trim() ||
      !cityInput.trim() ||
      !postalCodeInput.trim()
    ) {
      Alert.alert(
        'Profilo salone incompleto',
        'Compila nome salone, categoria attività, cellulare azienda, via e nome strada, comune e CAP prima di salvare.'
      );
      return;
    }

    const invalidFields: string[] = [];

    if (!isValidPhone10(businessPhoneInput)) {
      invalidFields.push('Numero di telefono errato (deve avere 9 o 10 cifre)');
    }

    if (invalidFields.length > 0) {
      setProfileFieldErrors({
        businessPhone: !isValidPhone10(businessPhoneInput)
          ? 'Numero di telefono errato (deve avere 9 o 10 cifre)'
          : undefined,
      });
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setProfileFieldErrors({});

    try {
      setSavingSalon(true);

      const formattedAddress = formatSalonAddress({
        streetType: '',
        streetName: streetLineInput,
        streetNumber: '',
        city: cityInput,
        postalCode: postalCodeInput,
        salonAddress: '',
      });

      await updateSalonWorkspacePersisted(
        (current) => ({
          ...current,
          salonName: salonNameInput.trim(),
          salonNameDisplayStyle: salonNameDisplayStyleInput,
          salonNameFontVariant: salonNameFontVariantInput,
          // Account identity is not editable through the salon profile.
          ownerEmail: current.ownerEmail,
          businessPhone: businessPhoneInput.trim(),
          additionalPhones: additionalPhonesInput.map((value) => value.trim()).filter((value, index) => index === 0 || !!value),
          activityCategory: toUppercaseField(activityCategoryInput.trim()),
          streetType: '',
          streetName: toUppercaseField(streetLineInput.trim()),
          streetNumber: '',
          city: toUppercaseField(cityInput.trim()),
          postalCode: postalCodeInput.trim(),
          salonAddress: formattedAddress,
          updatedAt: new Date().toISOString(),
        }),
        { requireRemoteProfileConfirmation: true },
      );

      setSavingSalon(false);

      Alert.alert(
        'Profilo salvato',
        'Dati salone aggiornati. La pubblicazione verso il portale cliente avviene automaticamente.'
      );
      setIsEditingSalonProfile(false);
      returnToProfileAfterSaveRef.current = true;
      setShowProfileSection(false);
    } catch (e: any) {
      setSavingSalon(false);
      Alert.alert(
        'Salvataggio non completato',
        e.message ?? 'Errore durante il salvataggio',
      );
    }
  };

  const salvaAccountSalone = async () => {
    if (!isValidEmail(accountEmailInput)) {
      setProfileFieldErrors((current) => ({ ...current, accountEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setProfileFieldErrors((current) => ({ ...current, accountEmail: undefined }));

    const success = await switchSalonAccount(accountEmailInput);

    if (!success) {
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    Alert.alert(
      'Account aggiornato',
      `Ora l'app usa il profilo ${accountEmailInput.trim().toLowerCase()}.`
    );
  };

  const aggiornaStatoWorkspace = (
    status: 'active' | 'suspended' | 'expired',
    plan: 'starter' | 'pro' =
      salonWorkspace.subscriptionPlan === 'pro' ? 'pro' : 'starter'
  ) => {
    const formattedAddress = formatSalonAddress({
      streetType: '',
      streetName: streetLineInput,
      streetNumber: '',
      city: cityInput,
      postalCode: postalCodeInput,
      salonAddress: '',
    });

    void updateSalonWorkspacePersisted((current) => ({
      ...current,
      ownerEmail: accountEmailInput.trim().toLowerCase(),
      businessPhone: businessPhoneInput.trim(),
      activityCategory: toUppercaseField(activityCategoryInput.trim()),
      streetType: '',
      streetName: toUppercaseField(streetLineInput.trim()),
      streetNumber: '',
      city: toUppercaseField(cityInput.trim()),
      postalCode: postalCodeInput.trim(),
      salonAddress: formattedAddress,
      subscriptionStatus: status,
      subscriptionPlan: plan,
      updatedAt: new Date().toISOString(),
    }));
  };

  const profiloSaloneCompleto =
    salonNameInput.trim() !== '' &&
    activityCategoryInput.trim() !== '' &&
    businessPhoneInput.trim() !== '' &&
    streetLineInput.trim() !== '' &&
    cityInput.trim() !== '' &&
    postalCodeInput.trim().length >= 5;

  const salonPreviewName = salonNameInput.trim() || 'Nome salone';
  const salonPreviewAddress = formatSalonAddress({
    streetType: '',
    streetName: streetLineInput,
    streetNumber: '',
    city: cityInput,
    postalCode: postalCodeInput,
    salonAddress: '',
  });
  const requiredFieldsFilled = [
    salonNameInput,
    activityCategoryInput,
    businessPhoneInput,
    streetLineInput,
    cityInput,
    postalCodeInput,
  ].filter((value) => value.trim() !== '').length;

  const profileSections = [
    {
      key: 'identity',
      title: 'Identita salone',
      subtitle: 'Nome, categoria e insegna del salone.',
      completed:
        salonNameInput.trim() !== '' &&
        activityCategoryInput.trim() !== '' &&
        salonNameFontVariantInput.trim() !== '',
    },
    {
      key: 'contacts',
      title: 'Contatti',
      subtitle: 'Numero aziendale per clienti e comunicazioni.',
      completed: businessPhoneInput.trim() !== '',
    },
    {
      key: 'address',
      title: 'Indirizzo',
      subtitle: 'Via, citta e CAP del salone.',
      completed:
        streetLineInput.trim() !== '' && cityInput.trim() !== '' && postalCodeInput.trim() !== '',
    },
    {
      key: 'account',
      title: 'Account e stato',
      subtitle: 'Profilo attivo e stato workspace.',
      completed: accountEmailInput.trim() !== '' && Boolean(salonWorkspace.subscriptionStatus),
    },
  ];

  const completedProfileSections = profileSections.filter((item) => item.completed).length;

  const brandName =
  salonNameInput.trim() ? toUppercaseField(salonNameInput) : 'SALON PRO';

const publicClientBaseUrl = useMemo(() => {
  const expoExtra =
    (Constants.expoConfig?.extra as { publicClientBaseUrl?: string } | undefined) ??
    undefined;
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

  return configuredBaseUrl.trim().replace(/\/+$/, '');
}, []);

const parsedPublicClientBaseUrl = useMemo(
  () => parsePublicClientBaseUrl(publicClientBaseUrl),
  [publicClientBaseUrl]
);
const normalizedSalonCode = useMemo(
  () => normalizeSalonCode(salonWorkspace.salonCode),
  [salonWorkspace.salonCode]
);
const displaySalonCode = useSalonShortCode(salonWorkspace.salonCode);
const clientAccessDisplayName = useMemo(
  () => {
    const explicitSalonName = salonWorkspace.salonName.trim();
    return explicitSalonName ? toUppercaseField(explicitSalonName) : brandName;
  },
  [brandName, salonWorkspace.salonName]
);

const canEditSalonProfile = isEditingSalonProfile;

const salonClientLink = useMemo(
  () => buildSalonClientLink(parsedPublicClientBaseUrl, normalizedSalonCode),
  [normalizedSalonCode, parsedPublicClientBaseUrl]
);
const publicClientLinkStatus = useMemo(
  () =>
    getPublicClientLinkStatus({
      baseUrl: parsedPublicClientBaseUrl,
      salonCode: normalizedSalonCode,
      salonClientLink,
    }),
  [normalizedSalonCode, parsedPublicClientBaseUrl, salonClientLink]
);
const publicClientLinkHealth = publicClientLinkStatus.status;
const clientQrValue =
  publicClientLinkHealth === 'ready'
    ? salonClientLink
    : 'https://configura-public-client-base-url.invalid';
  const salonQrWordmarkUri = useMemo(
    () => resolveBundledAssetUri(require('../../assets/images/salon-pro-logo-ui.png')),
    []
  );
  const canShareClientAccess = publicClientLinkStatus.canShare;
  const clientAccessStatusCopy = publicClientLinkStatus.message;
  const contentTopPadding = Platform.OS === 'web' ? 8 : 54;

const openFrontendPreviewForAdmin = useCallback(() => {
  router.push({
    pathname: '/cliente',
    params: { salon: salonWorkspace.salonCode },
  });
}, [router, salonWorkspace.salonCode]);

const openQrPrintPreview = useCallback(() => {
  if (!salonClientLink || !canShareClientAccess) {
    Alert.alert('QR non pronto', clientAccessStatusCopy);
    return;
  }

  if (Platform.OS === 'web') {
    router.push({
      pathname: '/stampa-qr',
      params: {
        salon: displaySalonCode,
        name: clientAccessDisplayName,
        link: salonClientLink,
      },
    });
    return;
  }

  if (!clientQrPrintRef.current) {
    Alert.alert('QR non pronto', 'Attendi un istante e riprova.');
    return;
  }

  clientQrPrintRef.current.toDataURL((qrImageBase64) => {
    const html = buildSalonQrPrintHtml({
      qrImageBase64,
      salonCode: displaySalonCode,
      salonName: clientAccessDisplayName,
      wordmarkUri: salonQrWordmarkUri,
    });

    Print.printAsync({ html }).catch(() => {
      Alert.alert('Stampa non riuscita', 'Non sono riuscito ad aprire la stampa. Riprova tra qualche secondo.');
    });
  });
}, [
  canShareClientAccess,
  clientAccessDisplayName,
  clientAccessStatusCopy,
  router,
  salonClientLink,
  salonQrWordmarkUri,
  displaySalonCode,
  salonWorkspace.salonCode,
]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        setShowProfileSection(false);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      };
    }, [])
  );

  const condividiAccessoCliente = async () => {
    if (!salonClientLink || !canShareClientAccess) {
      Alert.alert(
        'Link cliente non pronto',
        clientAccessStatusCopy
      );
      return;
    }

    try {
      await Share.share({
        title: `Prenota da ${brandName}`,
        message: buildClientInviteMessage({
          brandName: clientAccessDisplayName,
          salonClientLink,
        }),
      });
    } catch {
      Alert.alert(
        'Condivisione non riuscita',
        'Non è stato possibile aprire la condivisione. Riprova tra qualche secondo.'
      );
    }
  };


  const salonProfilePopup = (showProfileSection ? (
          <NativePremiumScope.Provider value={Platform.OS !== 'web'}>
          <NativeSettingsPopup premiumWeb scrollRef={profileSheetScrollRef} title="Profilo salone" icon="storefront-outline" onClose={() => { setShowProfileSection(false); setIsEditingSalonProfile(false); }}>
            <HapticTouchableFastRegion enabled={Platform.OS !== 'web'}>
            <Reanimated.View
              {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'editor' } } : {})} style={styles.profileEditorCard}
              entering={Platform.OS === 'web' ? FadeIn.duration(185).easing(Easing.out(Easing.cubic)) : undefined}
              exiting={Platform.OS === 'web' ? FadeOut.duration(130).easing(Easing.out(Easing.cubic)) : undefined}
              layout={Platform.OS === 'web' ? LinearTransition.duration(210).easing(Easing.out(Easing.cubic)) : undefined}
            >
              <Text style={styles.profileEditorTitle}>Il tuo salone, in ogni dettaglio</Text>
              <Text style={styles.profileEditorCaption}>
                Personalizza l’insegna e aggiorna i recapiti. Conferma tutto con Salva modifiche.
              </Text>

              <View {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'modules' } } : {})} style={styles.profileModuleStack}>
                <View {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'module' } } : {})} style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleEyebrow}>01 · IDENTITÀ</Text>
                      <Text style={styles.profileModuleTitle}>La tua insegna</Text>
                      <Text style={styles.profileModuleCaption}>Come ti riconoscono i clienti.</Text>
                    </View>
                    <Reanimated.View
                      style={[
                        styles.profileModuleBadge,
                        profileSections[0]?.completed
                          ? styles.profileModuleBadgeComplete
                          : styles.profileModuleBadgeIncomplete,
                      ]}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.profileModuleBadgeText,
                          profileSections[0]?.completed
                            ? styles.profileModuleBadgeTextComplete
                            : styles.profileModuleBadgeTextIncomplete,
                        ]}
                      >
                        {profileSections[0]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Nome salone</Text>
                    <ClearableTextInput
                      ref={salonNameFieldRef}
                      style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                      value={salonNameInput}
                      onChangeText={setSalonNameInput}
                      onFocus={() => scrollToField(salonNameFieldRef)}
                      placeholder={tApp(appLanguage, 'auth_salon_name_placeholder')}
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={Keyboard.dismiss}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Categoria attività</Text>
                    <OwnerPremiumHomeRegion part="activity-picker"><SalonActivityPicker
                      value={activityCategoryInput}
                      options={configuredActivityOptions}
                      disabled={!canEditSalonProfile}
                      onChange={setActivityCategoryInput}
                    /></OwnerPremiumHomeRegion>
                  </View>

                  <OwnerPremiumHomeRegion part="logo-editor"><SalonLogoEditor
                    workspaceId={salonWorkspace.id}
                    name={salonPreviewName}
                    disabled={!canEditSalonProfile}
                  /></OwnerPremiumHomeRegion>
                  {Platform.OS === 'web' ? <SalonBrandPlacementSettings workspaceId={salonWorkspace.id} disabled={!canEditSalonProfile} /> : null}
                </View>

                <View {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'module' } } : {})} style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleEyebrow}>02 · CONTATTI</Text>
                      <Text style={styles.profileModuleTitle}>Come contattarti</Text>
                      <Text style={styles.profileModuleCaption}>Cellulare, telefono e altri recapiti del salone.</Text>
                    </View>
                    <Reanimated.View
                      style={[
                        styles.profileModuleBadge,
                        profileSections[1]?.completed
                          ? styles.profileModuleBadgeComplete
                          : styles.profileModuleBadgeIncomplete,
                      ]}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.profileModuleBadgeText,
                          profileSections[1]?.completed
                            ? styles.profileModuleBadgeTextComplete
                            : styles.profileModuleBadgeTextIncomplete,
                        ]}
                      >
                        {profileSections[1]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Cellulare azienda</Text>
                    <ClearableTextInput
                      ref={businessPhoneFieldRef}
                      style={[
                        styles.accountInput,
                        profileFieldErrors.businessPhone && styles.accountInputError,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={businessPhoneInput}
                      onChangeText={(value) => {
                        setBusinessPhoneInput(limitPhoneToTenDigits(value));
                        if (profileFieldErrors.businessPhone) {
                          setProfileFieldErrors((current) => ({
                            ...current,
                            businessPhone: undefined,
                          }));
                        }
                      }}
                      onFocus={() => scrollToField(businessPhoneFieldRef)}
                      placeholder="Cellulare azienda"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(streetLineFieldRef)}
                      blurOnSubmit={false}
                    />
                    {profileFieldErrors.businessPhone ? (
                      <Text style={styles.fieldErrorText}>{profileFieldErrors.businessPhone}</Text>
                    ) : null}
                  </View>
                  {additionalPhonesInput.map((phone, index) => (
                    <View key={index} style={styles.compactFieldBlock}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{index === 0 ? 'Telefono' : `Altro numero ${index}`}</Text>
                        {index > 0 && canEditSalonProfile ? (
                          <HapticTouchable accessibilityRole="button" accessibilityLabel={`Rimuovi altro numero ${index}`} hitSlop={8} onPress={() => setAdditionalPhonesInput((current) => current.filter((_, i) => i !== index))} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF1F3', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F2D5DC', shadowColor: '#923C50', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 }}>
                            <Ionicons name="close" size={17} color="#B44960" />
                          </HapticTouchable>
                        ) : null}
                      </View>
                      <View style={{ width: '100%' }}>
                        <ClearableTextInput
                          style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                          value={phone}
                          onChangeText={(value) => setAdditionalPhonesInput((current) => current.map((item, i) => i === index ? value.replace(/[^0-9+() .-]/g, '') : item))}
                          placeholder={index === 0 ? 'Telefono del salone (facoltativo)' : 'Altro recapito'}
                          placeholderTextColor="#8f8f8f"
                          editable={canEditSalonProfile}
                          keyboardType="phone-pad"
                        />
                      </View>
                    </View>
                  ))}
                  {canEditSalonProfile ? <HapticTouchable {...webHomePart('add-phone')} onPress={() => setAdditionalPhonesInput((current) => [...current, ''])} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}><Ionicons name="add-circle-outline" size={21} color={Platform.OS === 'web' ? '#2563EB' : premiumPalette.ink} /><Text style={{ color: Platform.OS === 'web' ? '#2563EB' : premiumPalette.ink, fontWeight: Platform.OS === 'web' ? '700' : '500' }}>Aggiungi numero</Text></HapticTouchable> : null}
                </View>

                <View {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'module' } } : {})} style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleEyebrow}>03 · SEDE</Text>
                      <Text style={styles.profileModuleTitle}>Dove trovarti</Text>
                      <Text style={styles.profileModuleCaption}>L’indirizzo completo della tua attività.</Text>
                    </View>
                    <Reanimated.View
                      style={[
                        styles.profileModuleBadge,
                        profileSections[2]?.completed
                          ? styles.profileModuleBadgeComplete
                          : styles.profileModuleBadgeIncomplete,
                      ]}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.profileModuleBadgeText,
                          profileSections[2]?.completed
                            ? styles.profileModuleBadgeTextComplete
                            : styles.profileModuleBadgeTextIncomplete,
                        ]}
                      >
                        {profileSections[2]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Via, nome strada e civico</Text>
                    <ClearableTextInput
                      ref={streetLineFieldRef}
                      style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                      value={streetLineInput}
                      onChangeText={(value) => setStreetLineInput(toUppercaseField(value))}
                      onFocus={() => scrollToField(streetLineFieldRef)}
                      placeholder="Via Roma 1"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(cityFieldRef)}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_city')}</Text>
                      <ClearableTextInput
                        ref={cityFieldRef}
                        style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                        value={cityInput}
                        onChangeText={(value) => setCityInput(toUppercaseField(value))}
                        onFocus={() => scrollToField(cityFieldRef)}
                        placeholder={tApp(appLanguage, 'common_city')}
                        placeholderTextColor="#8f8f8f"
                        editable={canEditSalonProfile}
                        autoCapitalize="characters"
                        returnKeyType="next"
                        onSubmitEditing={() => focusField(postalCodeFieldRef)}
                        blurOnSubmit={false}
                      />
                    </View>

                    <View style={[styles.formColumn, styles.formColumnCompact]}>
                      <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_postal_code')}</Text>
                      <ClearableTextInput
                        ref={postalCodeFieldRef}
                        style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                        value={postalCodeInput}
                        onChangeText={setPostalCodeInput}
                        onFocus={() => scrollToField(postalCodeFieldRef)}
                        placeholder={tApp(appLanguage, 'common_postal_code')}
                        keyboardType="number-pad"
                        placeholderTextColor="#8f8f8f"
                        editable={canEditSalonProfile}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                  </View>
                </View>

                <View {...(Platform.OS === 'web' ? { dataSet: { homeProfile: 'module' } } : {})} style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleEyebrow}>04 · ACCOUNT PROTETTO</Text>
                      <Text style={styles.profileModuleTitle}>Accesso e abbonamento</Text>
                    </View>
                    <Reanimated.View
                      style={[
                        styles.profileModuleBadge,
                        profileSections[3]?.completed
                          ? styles.profileModuleBadgeComplete
                          : styles.profileModuleBadgeIncomplete,
                      ]}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.profileModuleBadgeText,
                          profileSections[3]?.completed
                            ? styles.profileModuleBadgeTextComplete
                            : styles.profileModuleBadgeTextIncomplete,
                        ]}
                      >
                        {profileSections[3]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.profileProtectedCaption}>Email di accesso e abbonamento · non modificabile</Text>
                    <ClearableTextInput
                      ref={accountEmailFieldRef}
                      style={[
                        styles.accountInput,
                        profileFieldErrors.accountEmail && styles.accountInputError,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={salonAccountEmail}
                      onFocus={() => scrollToField(accountEmailFieldRef)}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="email@salone.it"
                      placeholderTextColor="#8f8f8f"
                      editable={false}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    {profileFieldErrors.accountEmail ? (
                      <Text style={styles.fieldErrorText}>{profileFieldErrors.accountEmail}</Text>
                    ) : null}
                  </View>

                </View>
              </View>

              <HapticTouchable
                style={[styles.previewButton, styles.profileSaveButton, savingSalon && styles.buttonDisabled]}
                onPress={salvaDatiSalone}
                disabled={savingSalon}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.profileSaveButtonEyebrow}>{completedProfileSections}/4 sezioni complete</Text>
                <Text style={styles.previewButtonText}>
                  {savingSalon ? 'Salvataggio...' : 'Salva modifiche'}
                </Text>
              </HapticTouchable>
            </Reanimated.View>
            </HapticTouchableFastRegion>
          </NativeSettingsPopup>
          </NativePremiumScope.Provider>
          ) : null);

  // Presentation slots reuse the exact existing controls, metrics, refs and callbacks.
  const homePresentation = {
priority: (<View {...webHomePart("priority")}
            style={[
              styles.priorityCard,
              IS_ANDROID && styles.priorityCardAndroidPremium,
              styles.priorityCardGlassBlue,
              IS_ANDROID && styles.priorityCardGlassBlueAndroid,
              responsive.isDesktop && styles.desktopPriorityCard,
              Platform.OS === 'web' && styles.priorityCardWebFlat,
            ]}
          >
            <Text
              style={[
                styles.priorityEyebrow,
                styles.priorityEyebrowGlassBlue,
                IS_ANDROID && styles.priorityEyebrowAndroidPremium,
              ]}
            >
              {prossimoSlotPrioritario.hasMultiRole
                ? 'Prossime priorità'
                : tApp(appLanguage, 'home_next_priority')}
            </Text>
            {shouldHoldDashboardSummaryMetrics ? (
              <>
                <DashboardSkeletonBar
                  width="78%"
                  height={25}
                  style={styles.priorityTitleSkeleton}
                />
                <DashboardSkeletonBar
                  width="64%"
                  height={18}
                  style={styles.priorityTextSkeleton}
                />
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.priorityTitle,
                    IS_ANDROID && styles.priorityTitleAndroidPremium,
                    !prossimoAppuntamento && !shouldHoldDashboardSummaryMetrics && styles.priorityTitleFallback,
                    styles.priorityTitleGlassBlue,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.74}
                  ellipsizeMode="tail"
                >
                  {dashboardPriorityTitle}
                </Text>
                <Text
                  style={[
                    styles.priorityText,
                    IS_ANDROID && styles.priorityTextAndroidPremium,
                    styles.priorityTextGlassBlue,
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.88}
                  ellipsizeMode="tail"
                >
                  {dashboardPriorityHint}
                </Text>
                {prossimoSlotPrioritario.hasMultiRole ? (
                  <View style={styles.priorityMultiArea}>
                    <ScrollView
                      style={styles.priorityMultiList}
                      contentContainerStyle={styles.priorityMultiListContent}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                      onLayout={(event) => {
                        setPriorityViewportHeight(event.nativeEvent.layout.height);
                      }}
                      onContentSizeChange={(_, contentHeight) => {
                        setPriorityContentHeight(contentHeight);
                      }}
                      onScroll={(event) => {
                        priorityScrollOffset.value = event.nativeEvent.contentOffset.y;
                      }}
                      onScrollBeginDrag={() => {
                        priorityIndicatorActive.value = withTiming(1, {
                          duration: 160,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      onScrollEndDrag={() => {
                        priorityIndicatorActive.value = withTiming(0, {
                          duration: 260,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      onMomentumScrollBegin={() => {
                        priorityIndicatorActive.value = withTiming(1, {
                          duration: 160,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      onMomentumScrollEnd={() => {
                        priorityIndicatorActive.value = withTiming(0, {
                          duration: 260,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      scrollEventThrottle={16}
                    >
                      {prossimoSlotPrioritario.appointments.map((item, index) => {
                        const resolvedRoleLabel =
                          resolveAppointmentRoleLabel({
                            appointment: item,
                            services: servizi,
                            operators: operatori,
                          }) || 'Senza mestiere';
                        const accent = getHomePriorityAccent(item.servizio, resolvedRoleLabel);

                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.priorityMultiItem,
                              index < prossimoSlotPrioritario.appointments.length - 1 &&
                                styles.priorityMultiItemSpaced,
                            ]}
                          >
                            <View style={styles.priorityMultiTimeBadge}>
                              <Text style={styles.priorityMultiTime}>{item.ora}</Text>
                            </View>
                            <View style={styles.priorityMultiContent}>
                              <Text
                                style={styles.priorityMultiClient}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                              >
                                {item.cliente}
                              </Text>
                              <Text
                                style={styles.priorityMultiService}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                              >
                                {item.servizio}
                              </Text>
                              <Text
                                style={[styles.priorityMultiRole, { color: accent.text }]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                              >
                                {resolvedRoleLabel.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                    <View pointerEvents="none" style={styles.priorityScrollIndicatorWrap}>
                      <View
                        style={[
                          styles.priorityScrollIndicatorTrack,
                          { height: priorityIndicatorTrackHeight },
                        ]}
                      >
                        <Reanimated.View
                          style={[
                            styles.priorityScrollIndicatorThumb,
                            { height: priorityIndicatorThumbHeight },
                            priorityIndicatorThumbAnimatedStyle,
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>),
operators: (<View {...webHomePart("operators")}
          style={[
            styles.sectionCard,
            styles.operatorAgendaCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <View {...webHomePart("people-header")} style={styles.operatorAgendaCardHeader}>
            <View style={styles.operatorAgendaCardTextWrap}>
              <Text
                style={styles.operatorAgendaCardTitle}
              >
                {Platform.OS === 'web' ? 'Operatori' : 'Appuntamenti per operatore'}
              </Text>
            </View>
            <HapticTouchable
              style={styles.operatorAgendaCardAction}
              onPress={openOperatorAgendaModalForAll}
              accessibilityRole="button" accessibilityLabel="Apri agenda operatori"
              immediatePress
              pressScale={0.98}
              pressOpacity={0.96}
            >
              {Platform.OS!=='web'?<Text style={styles.operatorAgendaCardActionText}>Apri</Text>:null}
              <Ionicons name="chevron-forward" size={18} color={premiumPalette.ink} />
            </HapticTouchable>
          </View>
          <Text {...webHomePart("people-caption")} style={[styles.operatorAgendaCardText, styles.insightDescription]}>
            {Platform.OS === 'web' ? 'Il lavoro di oggi, per operatore.' : 'Il lavoro di oggi, operatore per operatore. Apri per vedere tutti i dettagli.'}
          </Text>

          <View {...webHomePart("people-stats")} style={styles.operatorAgendaStatsRow}>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillSky]}>
              {shouldHoldOperatorInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {operatori.length}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    Operatori
                  </Text>
                </>
              )}
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillMint]}>
              {shouldHoldOperatorInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {totalOperatorOpenTasks}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    Da fare
                  </Text>
                </>
              )}
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillLavender]}>
              {shouldHoldOperatorInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {totalOperatorPendingRequests}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    Richieste
                  </Text>
                </>
              )}
            </View>
          </View>

          {operatori.length === 0 ? (
            <View style={styles.operatorAgendaEmptyState}>
              <Text style={styles.operatorAgendaEmptyTitle}>Nessun operatore configurato</Text>
              <Text style={styles.operatorAgendaEmptyText}>
                Aggiungi gli operatori nella sezione servizi e qui vedrai subito carico e appuntamenti.
              </Text>
            </View>
          ) : operatorBoardPreview.length === 0 ? null : (
            <View style={styles.operatorAgendaPreviewStack}>
              {operatorBoardPreview.map((item) => (
                <HapticTouchable
                  key={item.operator.id}
                  style={[
                    styles.operatorAgendaPreviewRow,
                    Platform.OS === 'web' && styles.operatorAgendaPreviewRowWeb,
                    Platform.OS !== 'web' && styles.operatorAgendaPreviewRowNative,
                  ]}
                  onPress={() => openOperatorAgendaModalForOperator(item.operator.id)}
                  immediatePress
                  pressScale={0.987}
                  pressOpacity={0.98}
                >
                  {Platform.OS !== 'web' ? (
                    <View style={styles.operatorAgendaPreviewLeftNative}>
                      <View
                        style={[
                          styles.operatorAgendaPreviewAvatar,
                          styles.operatorAgendaPreviewAvatarNative,
                        ]}
                      >
                        {item.operator.fotoUri ? (
                          <Image
                            source={{ uri: item.operator.fotoUri }}
                            style={styles.operatorAgendaPreviewAvatarImage}
                          />
                        ) : (
                          <Ionicons name="person" size={17} color={premiumPalette.ink} />
                        )}
                      </View>
                      <View
                        style={[
                          styles.operatorAgendaPreviewIdentity,
                          styles.operatorAgendaPreviewIdentityNative,
                        ]}
                      >
                        <View
                          style={[
                            styles.operatorAgendaPreviewTextWrap,
                            styles.operatorAgendaPreviewTextWrapNative,
                          ]}
                        >
                          <Text
                            style={[
                              styles.operatorAgendaPreviewName,
                              styles.operatorAgendaPreviewNameNative,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {item.operator.nome}
                          </Text>
                          <Text
                            style={[
                              styles.operatorAgendaPreviewRole,
                              styles.operatorAgendaPreviewRoleNative,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {item.operator.mestiere}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.operatorAgendaPreviewLeftWeb}>
                      <View
                        style={[
                          styles.operatorAgendaPreviewAvatar,
                          styles.operatorAgendaPreviewAvatarWeb,
                        ]}
                      >
                        {item.operator.fotoUri ? (
                          <Image
                            source={{ uri: item.operator.fotoUri }}
                            style={styles.operatorAgendaPreviewAvatarImage}
                          />
                        ) : (
                          <Ionicons name="person-outline" size={20} color={Platform.OS === 'web' ? premiumPalette.ink : "#1E293B"} />
                        )}
                      </View>
                      <View
                        style={[
                          styles.operatorAgendaPreviewIdentity,
                          styles.operatorAgendaPreviewIdentityWeb,
                        ]}
                      >
                        <View
                          style={[
                            styles.operatorAgendaPreviewTextWrap,
                            styles.operatorAgendaPreviewTextWrapWeb,
                          ]}
                        >
                          <Text
                            style={[
                              styles.operatorAgendaPreviewName,
                              styles.operatorAgendaPreviewNameWeb,
                            ]}
                            numberOfLines={undefined}
                          >
                            {item.operator.nome}
                          </Text>
                          <Text
                            style={[
                              styles.operatorAgendaPreviewRole,
                              styles.operatorAgendaPreviewRoleWeb,
                            ]}
                            numberOfLines={undefined}
                          >
                            {item.operator.mestiere}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View
                    style={[
                      styles.operatorAgendaPreviewMetrics,
                      Platform.OS === 'web' && styles.operatorAgendaPreviewMetricsWeb,
                      Platform.OS !== 'web' && styles.operatorAgendaPreviewMetricsNative,
                    ]}
                  >
                    <Text
                      style={[
                        styles.operatorAgendaPreviewMetric,
                        Platform.OS === 'web' && styles.operatorAgendaPreviewMetricWeb,
                        Platform.OS !== 'web' && styles.operatorAgendaPreviewMetricNative,
                      ]}
                      numberOfLines={1}
                    >
                      {item.openTasks} da fare
                    </Text>
                    <Text
                      style={[
                        styles.operatorAgendaPreviewMetricSoft,
                        Platform.OS === 'web' && styles.operatorAgendaPreviewMetricSoftWeb,
                        Platform.OS !== 'web' && styles.operatorAgendaPreviewMetricSoftNative,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {item.nextItem ? `${item.nextItem.ora} prossimo` : 'nessun orario'}
                    </Text>
                  </View>
                </HapticTouchable>
              ))}
            </View>
          )}
        </View>),
customers: (<View {...webHomePart("customers")}
          style={[
            styles.sectionCard,
            styles.customerInsightsCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <View {...webHomePart("people-header")} style={styles.operatorAgendaCardHeader}>
            <View style={styles.operatorAgendaCardTextWrap}>
              <Text
                style={styles.operatorAgendaCardTitle}
              >
                {Platform.OS === 'web' ? 'Clienti' : 'Appuntamenti per cliente'}
              </Text>
            </View>
            <CustomerInsightsOpenButton
              style={styles.operatorAgendaCardAction}
              onPress={openCustomerInsightsModalForAll}
              accessibilityLabel="Apri dettagli clienti"
            >
              {Platform.OS!=='web'?<Text style={styles.operatorAgendaCardActionText}>Apri</Text>:null}
              <Ionicons name="chevron-forward" size={18} color={premiumPalette.ink} />
            </CustomerInsightsOpenButton>
          </View>
          <Text {...webHomePart("people-caption")} style={[styles.operatorAgendaCardText, styles.insightDescription]}>
            {Platform.OS === 'web' ? 'Storico, agenda e totale servizi.' : 'Cerca un cliente: appuntamenti passati e futuri, quelli di oggi e totale servizi.'}
          </Text>

          <View {...webHomePart("people-stats")} style={styles.operatorAgendaStatsRow}>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillPlum]}>
              {shouldHoldCustomerInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {customerInsightBoards.reduce((total, item) => total + item.pastAppointments, 0)}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    App. passati
                  </Text>
                </>
              )}
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillSun]}>
              {shouldHoldCustomerInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {customerInsightBoards.reduce((total, item) => total + item.futureAppointments, 0)}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    App. futuri
                  </Text>
                </>
              )}
            </View>
            <View
              style={[
                styles.operatorAgendaStatPill,
                styles.operatorAgendaStatPillRose,
              ]}
            >
              {shouldHoldCustomerInsightMetrics ? (
                <>
                  <></>
                  <></>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.operatorAgendaStatValue,
                      styles.operatorAgendaStatValueCompact,
                      hasWideWebMetricCards && styles.operatorAgendaStatValueWebWide,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {totalCustomerDeliveredSpendCompact}
                  </Text>
                  <Text
                    style={[
                      styles.operatorAgendaStatLabel,
                      hasWideWebMetricCards && styles.operatorAgendaStatLabelWebWide,
                    ]}
                    numberOfLines={Platform.OS === 'web' ? 1 : 2}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    Tot servizi
                  </Text>
                </>
              )}
            </View>
          </View>


        </View>),
focus: (<View {...webHomePart("focus")} style={[styles.sectionCardDark, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitleDark, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_quick_focus')}
          </Text>
          <Text style={[styles.sectionTextDark, styles.sectionTextCentered]}>
            {shouldHoldOwnerHomeData ? 'Sto aggiornando le attività del salone…' : quickFocusText}
          </Text>
        </View>),
indicators: (<View {...webHomePart("smart")}
          style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}
        >
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_smart_indicators')}
          </Text>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_service')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
              ellipsizeMode="clip"
            >
              {servizioTop
                ? `${servizioTop.nome} · ${servizioTop.count} volte`
                : 'Ancora nessun dato'}
            </Text>
          </View>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_duration')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="clip"
            >
              {servizioTop ? formatMinutes(servizioTop.durataMinuti) : '—'}
            </Text>
          </View>

          <View style={[styles.smartItemLast, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_average_ticket')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="clip"
            >
              {formatCash(mediaScontrino)}
            </Text>
          </View>
        </View>),
invite: (<View {...webHomePart("invite")}
          style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}
          onLayout={(event) => setClientAccessSectionY(event.nativeEvent.layout.y)}
        >
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Invita i tuoi clienti</Text>

          {publicClientLinkHealth !== 'ready' ? (
            <View {...webHomePart("access-warning")} style={styles.accessWarningCard}>
              <Text style={styles.accessWarningTitle}>
                {publicClientLinkHealth === 'missing-salon-code'
                  ? 'Codice salone non ancora pronto'
                  : 'Accesso cliente non pronto'}
              </Text>
              <Text style={styles.accessWarningText}>
                {clientAccessStatusCopy}
              </Text>
            </View>
          ) : null}

          <View {...webHomePart("link")} style={styles.accessCard}>
            <View {...webHomePart("invite-glow")} style={styles.accessCardGlow} />
            <Text {...webHomePart("invite-label")} style={styles.accessLabel}>{Platform.OS === 'web' ? 'Condividi il tuo salone' : 'Link da condividere'}</Text>
            <Text {...webHomePart("invite-name")} style={styles.accessCode}>{clientAccessDisplayName}</Text>{Platform.OS === 'web' ? <Text {...webHomePart("invite-description")}>Invita i clienti a prenotare nella tua area dedicata.</Text> : null}
            <View {...webHomePart("invite-url")} style={styles.accessLinkPlate}>
              <Text style={styles.accessLink} selectable>
                {salonClientLink || 'Configura publicClientBaseUrl per generare il link pubblico.'}
              </Text>
            </View>
          <HapticTouchable
            style={[
              styles.resetButton,
              styles.clientAccessPrimaryButton,
              !canShareClientAccess && styles.buttonDisabled,
            ]}
            {...webHomePart("invite-share")} onPress={condividiAccessoCliente}
            disabled={!canShareClientAccess}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Ionicons name="share-outline" size={18} color={Platform.OS === 'web' ? premiumPalette.actionText : "#FFFFFF"} />
            <Text style={[styles.resetButtonText, styles.clientAccessPrimaryButtonText]}>
              Condividi link cliente
            </Text>
          </HapticTouchable>
          </View>

          <View {...webHomePart("qr")} style={[styles.qrCard, responsive.isTablet && styles.qrCardResponsive]}>
            <View style={styles.qrCardGlow} />
            <Text {...webHomePart("qr-title")} style={styles.qrTitle}>{Platform.OS === 'web' ? 'Inquadra e prenota' : 'Inquadra e accedi'}</Text>
            <Text {...webHomePart("qr-subtitle")} style={[styles.qrText, { marginBottom: 18 }]}>Senza digitare il codice</Text>
            <View {...webHomePart("qr-frame")} style={styles.qrFrame}>
              <View style={styles.qrPlate}>
                {!IS_ANDROID || androidHomeQrReady ? (
                  <QRCode
                    getRef={(ref) => {
                      clientQrPrintRef.current = ref;
                    }}
                    value={clientQrValue}
                    size={196}
                    color="#111111"
                    backgroundColor="#ffffff"
                  />
                ) : (
                  <View style={styles.androidHomeQrPlaceholder}>
                    <Ionicons
                      name="qr-code-outline"
                      size={78}
                      color="#CBD5E1"
                    />
                  </View>
                )}
              </View>
            </View>
            <View {...webHomePart("qr-badge")} style={styles.qrSalonBadge}>
              <Text style={styles.manualCodeLabel}>CODICE IDENTIFICATIVO SALONE</Text>
              <SalonCodeBadge code={displaySalonCode} />
              <Text style={styles.manualCodeHint}>In alternativa al QR code, il cliente può inserire questo codice nell’app per associare il salone.</Text>
            </View>
          </View>



          <HapticTouchable
            {...webHomePart("print")}
            style={[
              styles.secondaryActionButton,
              styles.clientAccessSecondaryButton,
              !canShareClientAccess && styles.buttonDisabled,
            ]}
            onPress={openQrPrintPreview}
            disabled={!canShareClientAccess}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Ionicons name="print-outline" size={18} color={Platform.OS === 'web' ? premiumPalette.ink : "#17233A"} />
            <Text style={[styles.secondaryActionButtonText, styles.clientAccessSecondaryButtonText]}>
              Stampa e affiggi il QR in salone
            </Text>
          </HapticTouchable>
        </View>),
profile: (<View ref={profileSectionElementRef} {...webHomePart("profile")}
          {...getWebExpandableCardProps(toggleProfileSection, {
            expanded: showProfileSection,
          })}
          onLayout={(event) => {
            let sectionY = event.nativeEvent.layout.y;
            if (Platform.OS === 'web') {
              // Columns add layout parents: retain the original return-to-profile scroll target.
              const element = profileSectionElementRef.current as unknown as HTMLElement | null;
              const scrollElement = scrollRef.current?.getScrollableNode() as HTMLElement | undefined;
              if (element?.getBoundingClientRect && scrollElement?.getBoundingClientRect) {
                sectionY = element.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop;
              }
            }
            profileSectionYRef.current = sectionY;
            if (returnToProfileAfterSaveRef.current) {
              returnToProfileAfterSaveRef.current = false;
              scrollRef.current?.scrollTo({ y: Math.max(0, profileSectionYRef.current - 12), animated: false });
            }
          }}
          style={[
            styles.sectionCard,
            responsive.isDesktop && styles.desktopWideCard,
            getWebExpandableCardStyle(showProfileSection),
          ]}
        >
          {Platform.OS==='web'?<Pressable accessibilityRole="button" accessibilityLabel="Apri Profilo salone" onPress={toggleProfileSection} style={{position:'absolute',inset:0,zIndex:3,borderRadius:15}}/>:null}
          <View {...(Platform.OS==='web'?{dataSet:{homeProfileHeader:'true'}}:{})} pointerEvents={Platform.OS==='web'?'none':'auto'} style={styles.profileAccordionButton}>
            <View style={styles.profileAccordionTextWrap}>
              <Text
                style={[
                  styles.sectionTitle,
                  styles.profileAccordionTitle,
                ]}
              >
                Profilo salone
              </Text>
              <Text
                style={[
                  styles.sectionSubtext,
                  styles.profileAccordionSubtext,
                ]}
              >
                Insegna, recapiti e dati del tuo salone.
              </Text>
            </View>
            {Platform.OS !== 'web' ? (
              <HapticTouchable
                onPress={toggleProfileSection}
                accessibilityRole="button"
                accessibilityLabel="Modifica profilo salone"
                hapticType="light"
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="create-outline" size={23} color="#334B65" />
              </HapticTouchable>
            ) : (
            <View pointerEvents="none" style={{width:30,alignItems:'center'}}><Ionicons name="chevron-forward" size={18} color={premiumPalette.ink}/></View>
            )}
          </View>

          <View {...webHomePart("profile-preview")} style={styles.profilePreviewCard}>
            <View style={styles.profilePreviewHeader}>
              <Text style={styles.profilePreviewEyebrow}>LA TUA INSEGNA</Text>
              <Text style={styles.profilePreviewProgress}>
                {profiloSaloneCompleto
                  ? `${completedProfileSections}/4 sezioni complete`
                  : `${requiredFieldsFilled}/6 campi obbligatori`}
              </Text>
            </View>
            <OwnerPremiumHomeRegion part="plaque"><SalonLogoPlaque workspaceId={salonWorkspace.id} name={salonPreviewName}>
            <Text
              style={[
                styles.profilePreviewName,
                salonNameDisplayStyleInput === 'minuscolo' && styles.profilePreviewNameLower,
                salonNameDisplayStyleInput === 'stampatello' && styles.profilePreviewNameUpper,
                {
                  fontFamily: salonNameFontOptions.find(
                    (item) => item.key === salonNameFontVariantInput
                  )?.family,
                },
              ]}
            >
              {salonPreviewName}
            </Text>
            </SalonLogoPlaque></OwnerPremiumHomeRegion>
            <Text style={styles.profilePreviewMeta}>
              {activityCategoryInput.trim() || 'Categoria libera'}
            </Text>
            <View style={styles.profileProgressRow}>
              {profileSections.map((section) => (
                <View
                  key={section.key}
                  style={[
                    styles.profileProgressItem,
                    section.completed && styles.profileProgressItemCompleted,
                  ]}
                >
                  <Reanimated.View
                    style={[
                      styles.profileProgressDot,
                      section.completed && styles.profileProgressDotCompleted,
                    ]}
                    entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                    layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                  />
                  <Text style={styles.profileProgressLabel}>{section.title}</Text>
                </View>
              ))}
            </View>
            <View style={styles.profilePreviewInfoRow}>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="call-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText}>
                  {businessPhoneInput.trim() || 'Telefono'}
                </Text>
              </View>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="location-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText} numberOfLines={1}>
                  {salonPreviewAddress || 'Indirizzo salone'}
                </Text>
              </View>
            </View>

          </View>

          {Platform.OS === 'web' ? salonProfilePopup : null}
        </View>),
heading: (<OwnerPremiumHomeRegion part="heading">{Platform.OS === 'web' ? <OwnerPremiumHomeHeading salonName={salonNameInput || salonWorkspace.salonName} onLongPress={() => setShowAdminPanel((current) => !current)} /> : null}</OwnerPremiumHomeRegion>),
summary: (<OwnerPremiumHomeRegion part="summary">
          <Text accessibilityRole="header" style={styles.dashboardSectionHeading}>
            {tApp(appLanguage, 'home_appointments_summary')}
          </Text>
          <View style={styles.sectionRow}>
            <View style={[styles.infoCardSun, responsive.isTablet && styles.infoCardResponsive]}>
              <Text
                style={[styles.infoLabel, styles.infoLabelSun]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.66}
                maxFontSizeMultiplier={1}
              >
                {tApp(appLanguage, 'home_collected')}
              </Text>
              {shouldHoldBottomSummaryMetrics ? (
                <DashboardSkeletonBar
                  width="54%"
                  height={30}
                  style={styles.infoValueSkeleton}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[styles.infoValue, styles.infoValueSun]}
                >
                  {dashboardCollectedAppointmentsLabel}
                </Text>
              )}
            </View>

            <View
              style={[styles.infoCardLavender, responsive.isTablet && styles.infoCardResponsive]}
            >
              <Text
                style={[styles.infoLabel, styles.infoLabelLavender]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.66}
                maxFontSizeMultiplier={1}
              >
                {tApp(appLanguage, 'home_bookings')}
              </Text>
              {shouldHoldBottomSummaryMetrics ? (
                <DashboardSkeletonBar
                  width="54%"
                  height={30}
                  style={styles.infoValueSkeleton}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[styles.infoValue, styles.infoValueLavender]}
                >
                  {dashboardBookingsCountLabel}
                </Text>
              )}
            </View>

            <View style={[styles.infoCardPeach, responsive.isTablet && styles.infoCardResponsive]}>
              <Text
                style={[styles.infoLabel, styles.infoLabelPeach]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.66}
                maxFontSizeMultiplier={1}
              >
                {tApp(appLanguage, 'home_to_collect')}
              </Text>
              {shouldHoldBottomSummaryMetrics ? (
                <DashboardSkeletonBar
                  width="54%"
                  height={30}
                  style={styles.infoValueSkeleton}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[styles.infoValue, styles.infoValuePeach]}
                >
                  {dashboardToCollectAppointmentsCountLabel}
                </Text>
              )}
            </View>
          </View>
          </OwnerPremiumHomeRegion>),
shop: (<OwnerPremiumHomeRegion part="shop"><ShopEntry workspaceId={salonWorkspace.id} compact={Platform.OS === 'web'} /></OwnerPremiumHomeRegion>),
date: (<View style={[styles.heroMetaCard, styles.heroMetaCardToday]}>
              <Text style={[styles.heroDateLabel, styles.heroDateLabelToday]}>{tApp(appLanguage, 'common_today')}</Text>
              <Text
                style={[styles.heroDateValue, styles.heroDateValueToday]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {formatDateLabel(oggi)}
              </Text>
            </View>),
status: (<View {...(Platform.OS === 'web' ? {dataSet:{availabilityTone:shouldHoldDashboardSummaryMetrics?'neutral':dashboardStatusLabel==='Salone chiuso oggi'?'neutral':livelloOperativo.tone===styles.statusHot?'full':livelloOperativo.tone===styles.statusWarm?'limited':'available'}} : {})} style={[styles.heroMetaCard, styles.heroStatusCard, livelloOperativo.tone]}>
              {shouldHoldDashboardSummaryMetrics ? (
                <DashboardSkeletonBar width="68%" height={24} />
              ) : (
                <Text
                  style={[styles.statusPillText, livelloOperativo.textTone]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.74}
                >
                  {dashboardStatusLabel}
                </Text>
              )}
            </View>),
appointments: (<View style={styles.heroMetricCardBlue}>
              {shouldHoldAppointmentsTodayMetric ? (
                <DashboardSkeletonBar
                  width="42%"
                  height={34}
                  style={styles.heroMetricSkeleton}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[styles.heroMetricNumber, styles.heroMetricNumberBlue]}
                >
                  {dashboardAppointmentsTodayLabel}
                </Text>
              )}
              <Text
                style={[styles.heroMetricLabel, styles.heroMetricLabelBlue]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {tApp(appLanguage, 'home_appointments_today')}
              </Text>
            </View>),
unpaid: (<View style={styles.heroMetricCardRose}>
              {shouldHoldToCollectMetric ? (
                <DashboardSkeletonBar
                  width="56%"
                  height={34}
                  style={styles.heroMetricSkeleton}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[styles.heroMetricNumber, styles.heroMetricNumberRose]}
                >
                  {dashboardToCollectLabel}
                </Text>
              )}
              <Text
                style={[styles.heroMetricLabel, styles.heroMetricLabelRose]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {tApp(appLanguage, 'home_unpaid_appointments_today')}
              </Text>
            </View>),
clientTotal: (<View
              style={[
                styles.insightCard,
                responsive.isTablet && styles.halfWidthCard,
                responsive.isDesktop && styles.desktopThirdCard,
                compactSalonTotals && styles.insightCardCompact,
              ]}
            >
              <HomeMetricCopy
                text={tApp(appLanguage, 'tab_clients')}
                textStyle={[styles.insightTitle, styles.insightTitlePlum]}
                viewportStyle={styles.homeMetricTitleViewport}
              />
              {shouldHoldClientMetric ? (
                <>
                  <DashboardSkeletonBar
                    width="36%"
                    height={36}
                    style={styles.insightNumberSkeleton}
                  />
                  {!compactSalonTotals && <DashboardSkeletonBar
                    width="78%"
                    height={18}
                    style={styles.insightHintSkeleton}
                  />}
                </>
              ) : (
                <>
                  <HomeMetricAmount value={dashboardClientCountLabel} style={[styles.insightNumber, styles.insightNumberPlum]} />
                  {!compactSalonTotals && <HomeMetricCopy
                    scrolling
                    text={dashboardLastClientLabel}
                    textStyle={[styles.insightHint, styles.insightHintPlum]}
                  />}
                </>
              )}
            </View>),
income: (<View
              style={[
                styles.insightCardMint,
                responsive.isTablet && styles.halfWidthCard,
                responsive.isDesktop && styles.desktopThirdCard,
                compactSalonTotals && styles.insightCardCompact,
              ]}
            >
              <HomeMetricCopy
                  text={tApp(appLanguage, 'home_total_income')}
                  textStyle={[styles.insightTitle, styles.insightTitleMint]}
                  viewportStyle={styles.homeMetricTitleViewport}
                />
              {shouldHoldTotalIncomeMetric ? (
                <DashboardSkeletonBar
                  width="58%"
                  height={38}
                  style={styles.insightNumberSkeleton}
                />
              ) : (
                <HomeMetricAmount value={dashboardTotalIncomeLabel} style={[styles.insightNumber, styles.insightNumberMint]} />
              )}
              {!compactSalonTotals && <HomeMetricCopy
                  scrolling
                  text={tApp(appLanguage, 'home_registered_movements')}
                  textStyle={[styles.insightHint, styles.insightHintMint]}
                />}
            </View>),
finance: (([
              {
                title: 'home_pending_cash',
                compactTitle: 'Da saldare',
                hint: 'home_pending_cash_hint',
                value: dashboardPendingCashLabel,
                cardStyle: styles.insightCardPending,
                textStyle: styles.cashPendingText,
              },
              {
                title: 'home_legacy_cash',
                compactTitle: 'Da verificare',
                hint: 'home_legacy_cash_hint',
                value: dashboardLegacyCashLabel,
                cardStyle: styles.insightCardLegacy,
                textStyle: styles.cashLegacyText,
              },
            ] as const).map(metric => (
              <View
                key={metric.title}
                style={[
                  styles.insightCard,
                  metric.cardStyle,
                  responsive.isTablet && styles.halfWidthCard,
                  responsive.isDesktop && styles.desktopThirdCard,
                  compactSalonTotals && styles.insightCardCompact,
                ]}
              >
                <HomeMetricCopy
                  text={compactSalonTotals ? metric.compactTitle : tApp(appLanguage, metric.title)}
                  textStyle={[styles.insightTitle, metric.textStyle]}
                  viewportStyle={styles.homeMetricTitleViewport}
                />
                {shouldHoldTotalIncomeMetric ? (
                  <DashboardSkeletonBar width="58%" height={38} style={styles.insightNumberSkeleton} />
                ) : (
                  <HomeMetricAmount value={metric.value} style={styles.insightNumber} />
                )}
                {!compactSalonTotals && <HomeMetricCopy
                  scrolling
                  text={tApp(appLanguage, metric.hint)}
                  textStyle={[styles.insightHint, metric.textStyle]}
                />}
              </View>
            ))),
reminder: (<DirectoryReminder workspaceId={salonWorkspace.id} active={isHomeScreenFocused && isAuthenticated && !ownerInitialDataHydrating} />),
admin: (showAdminPanel ? (
          <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Admin account</Text>
            <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
              Pannello nascosto: qui puoi cambiare il profilo dati del salone senza mostrarlo agli utenti.
            </Text>

            <TextInput
              ref={accountEmailFieldRef}
              style={[styles.accountInput, profileFieldErrors.accountEmail && styles.accountInputError]}
              value={accountEmailInput}
              onChangeText={(value) => {
                setAccountEmailInput(value);
                if (profileFieldErrors.accountEmail) {
                  setProfileFieldErrors((current) => ({
                    ...current,
                    accountEmail: undefined,
                  }));
                }
              }}
              onFocus={() => scrollToField(accountEmailFieldRef)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email@salone.it"
              placeholderTextColor="#8f8f8f"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            {profileFieldErrors.accountEmail ? (
              <Text style={styles.fieldErrorText}>{profileFieldErrors.accountEmail}</Text>
            ) : null}

            <TextInput
              style={[styles.accountInput, styles.accountInputLocked]}
              value={formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: salonWorkspace.salonAddress,
              })}
              editable={false}
              placeholder="Indirizzo salone"
              placeholderTextColor="#8f8f8f"
            />

            <HapticTouchable
              style={styles.previewButton}
              onPress={salvaAccountSalone}
              pressScale={0.975}
              pressOpacity={0.98}
            >
              <Text style={styles.previewButtonText}>Salva account attivo</Text>
            </HapticTouchable>

            <HapticTouchable
              style={styles.previewButton}
              onPress={openFrontendPreviewForAdmin}
              pressScale={0.975}
              pressOpacity={0.98}
            >
              <Text style={styles.previewButtonText}>Anteprima frontend cliente (admin)</Text>
            </HapticTouchable>

            <Text style={styles.accountHint}>Attuale: {salonAccountEmail}</Text>
            <Text style={styles.accountHint}>Portale cliente: sincronizzazione automatica attiva</Text>
            <Text style={styles.accountHint}>Workspace: {salonWorkspace.id}</Text>
            <Text style={styles.accountHint}>
              Mail unica abbonamento: {salonWorkspace.ownerEmail}
            </Text>
            <Text style={styles.accountHint}>
              Salone: {salonNameInput || salonWorkspace.salonName}
            </Text>
            <Text style={styles.accountHint}>
              Categoria attività: {activityCategoryInput || 'Non impostata'}
            </Text>
            <Text style={styles.accountHint}>
              Cellulare azienda: {businessPhoneInput || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Indirizzo:{' '}
              {formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: '',
              }) || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Piano/Stato: {salonWorkspace.subscriptionPlan} ·{' '}
              {salonWorkspace.subscriptionStatus}
            </Text>

            <View style={styles.adminStatusRow}>
              <HapticTouchable
                style={styles.adminStatusChip}
                onPress={() => aggiornaStatoWorkspace('active', 'starter')}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.adminStatusChipText}>Attivo</Text>
              </HapticTouchable>

              <HapticTouchable
                style={styles.adminStatusChipDanger}
                onPress={() => aggiornaStatoWorkspace('suspended')}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.adminStatusChipDangerText}>Sospeso</Text>
              </HapticTouchable>
            </View>
          </View>
        ) : null),
  };
  return (
    <View
      style={styles.container}
      onLayout={() => {
        setOwnerHomeReady(true);
      }}
    >
      <ScrollView
        {...(Platform.OS==='web'?({dataSet:{premiumPageScroll:"true"}} as any):{})}
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          Platform.OS==='web'?{paddingBottom:responsive.width<1000?80:24}:null,
          { paddingTop: contentTopPadding },
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        showsVerticalScrollIndicator
        bounces
        alwaysBounceVertical
        overScrollMode="auto"
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={(event) => {
          if (
            IS_ANDROID &&
            androidHomeSecondaryReady &&
            !androidHomeQrReady &&
            clientAccessSectionY > 0 &&
            event.nativeEvent.contentOffset.y >= clientAccessSectionY - 900
          ) {
            setAndroidHomeQrReady(true);
          }
        }}
        scrollEventThrottle={32}
      >
        <OwnerPremiumHomeCss />
        <View {...webHomePart("dashboard-host")} style={[styles.pageShell, { maxWidth: Platform.OS === 'web' ? '100%' : responsive.contentMaxWidth }]}>{Platform.OS === 'web' ? <OwnerPremiumDashboard privacyScope={salonWorkspace.id&&salonAccountEmail?`${salonWorkspace.id}:${salonAccountEmail.toLowerCase()}`:''} secondaryMetrics={[
      {label:'Richieste da confermare',value:shouldHoldOwnerHomeData?'—':String(premiumOperationalMetrics.pending),hint:'Oggi e prossimi giorni',icon:'notifications-outline'},
      {label:'Fasce libere oggi',value:shouldHoldOwnerHomeData?'—':String(premiumOperationalMetrics.remaining),hint:premiumOperationalMetrics.closed?'Salone chiuso':'Fasce residue · stima agenda',icon:'calendar-clear-outline'},
      {label:'Occupazione agenda',value:shouldHoldOwnerHomeData||premiumOperationalMetrics.occupancy===null?'—':`${premiumOperationalMetrics.occupancy}%`,hint:'Fasce occupate della giornata',icon:'pie-chart-outline'},
      {label:'Nuovi clienti del mese',value:shouldHoldOwnerHomeData||premiumOperationalMetrics.newClients===null?'—':String(premiumOperationalMetrics.newClients),hint:premiumOperationalMetrics.newClients===null?'Date di creazione incomplete':'In base alla data di creazione',icon:'person-add-outline'}
    ]} today={oggi} slots={homePresentation} profileProgress={`${completedProfileSections}/4 sezioni complete`} profileOpen={showProfileSection} inviteLabel={clientAccessDisplayName} /> : <OwnerPremiumNativeHome
      today={oggi} income={reserveCashAmounts?'Riservato':shouldHoldTotalIncomeMetric?'—':dashboardTotalIncomeLabel}
      appointments={shouldHoldDashboardSummaryMetrics?'—':dashboardAppointmentsTodayLabel}
      unpaid={shouldHoldDashboardSummaryMetrics?'—':dashboardToCollectLabel}
      clients={shouldHoldDashboardSummaryMetrics?'—':dashboardClientCountLabel}
      pending={shouldHoldDashboardSummaryMetrics?'—':String(premiumOperationalMetrics.pending)}
      pendingCash={reserveCashAmounts?'Riservato':shouldHoldDashboardSummaryMetrics?'—':dashboardPendingCashLabel}
      legacyCash={reserveCashAmounts?'Riservato':shouldHoldDashboardSummaryMetrics?'—':dashboardLegacyCashLabel}
      available={shouldHoldDashboardSummaryMetrics||premiumOperationalMetrics.occupancy===null?null:100-premiumOperationalMetrics.occupancy}
      operatorSummary={shouldHoldOperatorInsightMetrics?'—':`${operatori.length} attivi · ${totalOperatorOpenTasks} da fare`}
      customerSummary={shouldHoldCustomerInsightMetrics?'—':`${customerInsightBoards.reduce((t,c)=>t+c.pastAppointments,0)} passati · ${customerInsightBoards.reduce((t,c)=>t+c.futureAppointments,0)} futuri`}
      onOperators={openOperatorAgendaModalForAll} onCustomers={openCustomerInsightsModalForAll}
      onAgenda={()=>router.navigate('/(tabs)/agenda')} onRequests={()=>router.navigate('/(tabs)/prenotazioni')}
      onAdmin={()=>setShowAdminPanel(current=>!current)}
      priority={homePresentation.priority} reminder={homePresentation.reminder}
      details={{results:reserveCashAmounts?<Text style={styles.sectionSubtext}>Apri Cassa per consultare gli importi riservati al titolare.</Text>:<NativeHomeResults pending={shouldHoldDashboardSummaryMetrics?'—':dashboardPendingCashLabel} legacy={shouldHoldDashboardSummaryMetrics?'—':dashboardLegacyCashLabel} settled={shouldHoldBottomSummaryMetrics?'—':dashboardCollectedAppointmentsLabel} bookings={shouldHoldBottomSummaryMetrics?'—':dashboardBookingsCountLabel} unpaid={shouldHoldBottomSummaryMetrics?'—':dashboardToCollectAppointmentsCountLabel} focus={homePresentation.focus}/>,indicators:<NativeHomeIndicators service={shouldHoldOwnerHomeData?'—':servizioTop?`${servizioTop.nome} · ${servizioTop.count} volte`:'Ancora nessun dato'} duration={shouldHoldOwnerHomeData?'—':servizioTop?formatMinutes(servizioTop.durataMinuti):'—'} average={reserveCashAmounts?'Riservato':shouldHoldOwnerHomeData?'—':formatCash(mediaScontrino)}/>,invite:<NativeHomeInvite name={clientAccessDisplayName} link={salonClientLink || 'Link cliente non ancora disponibile'} code={displaySalonCode} enabled={canShareClientAccess} warning={publicClientLinkHealth==='ready'?null:clientAccessStatusCopy} onShare={condividiAccessoCliente} onPrint={openQrPrintPreview} qr={<QRCode getRef={(ref)=>{clientQrPrintRef.current=ref;}} value={clientQrValue} size={196} color="#111111" backgroundColor="#FFFFFF"/>}/>}}
      profile={homePresentation.profile} admin={homePresentation.admin} onProfile={toggleProfileSection}
      onInvite={()=>setAndroidHomeQrReady(true)}
      onAvailability={()=>router.navigate({pathname:'/(tabs)/agenda',params:{availabilityToken:String(Date.now()),availabilityFrom:'home'}})}
      shop={<ShopEntry premiumNative workspaceId={salonWorkspace.id} renderTrigger={(onPress,attention)=><NativeHomeQuickAction title="Shop e magazzino" icon="bag-handle-outline" hint="Prodotti, ordini e scorte" onPress={onPress} attention={attention}/>}/>}
    />}
        </View>
      </ScrollView>

      {Platform.OS !== 'web' ? salonProfilePopup : null}

      {showOperatorAgendaModal ? (
      <HapticTouchableFastRegion>
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={showOperatorAgendaModal}
        transparent
        animationType="none"
        onRequestClose={() => {
          setShowOperatorAgendaModal(false);
        }}
      >
        <View style={styles.operatorModalBackdrop}>
          <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: () => {
          setShowOperatorAgendaModal(false);
        }, includeBottomSafeArea:false, bottomSafeAreaSpacing:0} : {})} style={styles.operatorModalCard}>
            {Platform.OS==='web'?<OwnerWebSheetHeader title={selectedOperatorBoard?`Appuntamenti di ${selectedOperatorBoard.operator.nome}`:'Agenda operatori'} subtitle="Appuntamenti, richieste e lavoro da chiudere." closeLabel="Chiudi agenda operatori" onClose={()=>setShowOperatorAgendaModal(false)}/>:(            <View style={[styles.operatorModalHeader, { marginBottom: 8 }]}>
              <View style={styles.operatorModalHeaderTextWrap}>
                <Text style={[styles.operatorModalEyebrow, { fontSize: 10, marginBottom: 3 }]}>Live operatori</Text>
                <Text style={[styles.operatorModalTitle, { fontSize: Platform.OS === 'web' ? 27 : 24, marginBottom: 3 }]}>
                  {selectedOperatorBoard
                    ? `Appuntamenti di ${selectedOperatorBoard.operator.nome}`
                    : 'Agenda operatori'}
                </Text>
                <Text style={styles.operatorModalText}>
                  Appuntamenti, richieste e lavoro da chiudere.
                </Text>
              </View>

              <HapticTouchable
                style={styles.operatorModalCloseButton}
                onPress={() => {
                  setShowOperatorAgendaModal(false);
                }}
                accessibilityLabel="Chiudi agenda operatori"
                accessibilityRole="button"
                pressScale={0.97}
                pressOpacity={0.96}
              >
                {Platform.OS === 'web' ? <Text style={{fontSize:12,color:premiumPalette.ink}}>Chiudi</Text> : null}<Ionicons name="close-outline" size={19} color={premiumPalette.ink} />
              </HapticTouchable>
            </View>

)}
            <View style={styles.operatorModalToolbar}>
              {Platform.OS !== 'web' ? <Text style={{width:'100%',fontSize:11,lineHeight:16,color:premiumPalette.muted}}>Periodo del report · PDF o stampa</Text> : null}
              <View style={styles.operatorModalScopeRow}>
                {([
                  { key: 'day', label: 'Giorno' },
                  { key: 'week', label: 'Settimana' },
                  { key: 'month', label: 'Mese' },
                ] as const).map((item) => {
                  const active = operatorAgendaPrintScope === item.key;
                  return (
                    <HapticTouchable
                      key={item.key}
                      style={[
                        styles.operatorModalScopeChip,
                        active && styles.operatorModalScopeChipActive,
                      ]}
                      onPress={() => setOperatorAgendaPrintScope(item.key)}
                      pressScale={0.98}
                      pressOpacity={0.96}
                    >
                      <Text
                        style={[
                          styles.operatorModalScopeChipText,
                          active && styles.operatorModalScopeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </HapticTouchable>
                  );
                })}
              </View>
              <HapticTouchable
                style={[
                  styles.operatorModalToolbarButton,
                  isOperatorAgendaSystemDialogOpen && styles.operatorModalToolbarButtonDisabled,
                ]}
                onPress={exportOperatorAgendaPdf}
                disabled={isOperatorAgendaSystemDialogOpen}
                pressScale={0.98}
                pressOpacity={0.96}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={isOperatorAgendaSystemDialogOpen ? '#94A3B8' : premiumPalette.ink}
                />
                <Text
                  style={[
                    styles.operatorModalToolbarButtonText,
                    isOperatorAgendaSystemDialogOpen && styles.operatorModalToolbarButtonTextDisabled,
                  ]}
                >
                  PDF
                </Text>
              </HapticTouchable>
              {Platform.OS !== 'web' ? (
                <HapticTouchable
                  style={[
                    styles.operatorModalToolbarButton,
                    isOperatorAgendaSystemDialogOpen && styles.operatorModalToolbarButtonDisabled,
                  ]}
                  onPress={printOperatorAgenda}
                  disabled={isOperatorAgendaSystemDialogOpen}
                  pressScale={0.98}
                  pressOpacity={0.96}
                >
                  <Ionicons
                    name="print-outline"
                    size={16}
                    color={isOperatorAgendaSystemDialogOpen ? '#94A3B8' : premiumPalette.ink}
                  />
                  <Text
                    style={[
                      styles.operatorModalToolbarButtonText,
                      isOperatorAgendaSystemDialogOpen && styles.operatorModalToolbarButtonTextDisabled,
                    ]}
                  >
                    Stampa
                  </Text>
                </HapticTouchable>
              ) : null}
            </View>

            <ScrollView
              style={styles.operatorModalScroll}
              {...webHomePart("insight-scroll")} contentContainerStyle={[styles.operatorModalScrollContent, Platform.OS !== 'web' && {paddingBottom:homeSheetInsets.bottom+8}]}
              showsVerticalScrollIndicator
              indicatorStyle="black"
            >
              {visibleOperatorBoards.length === 0 ? (
                <View style={styles.operatorModalEmptyCard}>
                  <Text style={styles.operatorModalEmptyTitle}>Nessun operatore disponibile</Text>
                  <Text style={styles.operatorModalEmptyText}>
                    Appena aggiungi gli operatori in servizi, qui comparira il loro punto operativo live.
                  </Text>
                </View>
              ) : (
                visibleOperatorBoards.map((item) => (
                  <View {...webHomePart("operator-detail")} key={item.operator.id} style={styles.operatorModalBoard}>
                    <View style={styles.operatorModalBoardHeader}>
                      <View style={styles.operatorModalBoardIdentity}>
                        <View style={styles.operatorModalBoardAvatar}>
                          {item.operator.fotoUri ? (
                            <Image source={{ uri: item.operator.fotoUri }} style={styles.operatorModalBoardAvatarImage} />
                          ) : (
                            <Ionicons name="person-outline" size={20} color={Platform.OS === 'web' ? premiumPalette.ink : "#1E293B"} />
                          )}
                        </View>
                        <View style={styles.operatorModalBoardTextWrap}>
                          <Text style={styles.operatorModalBoardName}>{item.operator.nome}</Text>
                          <Text style={styles.operatorModalBoardRole}>{item.operator.mestiere}</Text>
                        </View>
                      </View>

                      <View style={styles.operatorModalBoardCounters}>
                        <View style={styles.operatorModalCounterPill}>
                          <Text style={styles.operatorModalCounterValue}>{item.openTasks}</Text>
                          <Text style={styles.operatorModalCounterLabel}>da fare</Text>
                        </View>
                        <View style={styles.operatorModalCounterPillSoft}>
                          <Text style={styles.operatorModalCounterValueSoft}>{item.totalAssigned}</Text>
                          <Text style={styles.operatorModalCounterLabelSoft}>totali</Text>
                        </View>
                      </View>
                    </View>

                    {item.timeline.length === 0 ? (
                      <View style={styles.operatorModalBoardEmpty}>
                        <Text style={styles.operatorModalBoardEmptyTitle}>Agenda libera oggi</Text>
                        <Text style={styles.operatorModalBoardEmptyText}>
                          Nessun appuntamento o richiesta assegnata in questa giornata.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.operatorModalTimeline}>
                        {item.timeline.map((entry) => (
                          <View key={entry.id} style={styles.operatorModalTimelineRow}>
                            <View style={styles.operatorModalTimeBadge}>
                              <Text style={styles.operatorModalTimeBadgeText}>{entry.ora}</Text>
                            </View>

                            <View style={styles.operatorModalTimelineContent}>
                              <View style={styles.operatorModalTimelineTopRow}>
                                <Text style={styles.operatorModalTimelineTitle}>{entry.title}</Text>
                                <View
                                  style={[
                                    styles.operatorModalStatusPill,
                                    entry.tone === 'request' && styles.operatorModalStatusPillRequest,
                                    entry.tone === 'done' && styles.operatorModalStatusPillDone,
                                    entry.tone === 'cash' && styles.operatorModalStatusPillCash,
                                    entry.tone === 'muted' && styles.operatorModalStatusPillMuted,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.operatorModalStatusPillText,
                                      entry.tone === 'request' && styles.operatorModalStatusPillTextRequest,
                                      entry.tone === 'done' && styles.operatorModalStatusPillTextDone,
                                      entry.tone === 'cash' && styles.operatorModalStatusPillTextCash,
                                      entry.tone === 'muted' && styles.operatorModalStatusPillTextMuted,
                                    ]}
                                  >
                                    {entry.badge}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.operatorModalTimelineSubtitle}>{entry.subtitle}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </DockedSheetSurface>
        </View>
      </Modal>
      </HapticTouchableFastRegion>
      ) : null}

      <HapticTouchableFastRegion>
      <CustomerInsightsOverlay
        visible={showCustomerInsightsModal && isHomeScreenFocused}
        onClose={() => {
          setShowCustomerInsightsModal(false);
        }}
      >
        <View style={styles.operatorModalBackdrop}>
          <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: () => setShowCustomerInsightsModal(false), includeBottomSafeArea:false, bottomSafeAreaSpacing:0} : {})} style={styles.customerInsightModalCard}>
            {Platform.OS==='web'?<OwnerWebSheetHeader title="Clienti del salone" subtitle="Storico, agenda e servizi richiesti." closeLabel="Chiudi appuntamenti cliente" onClose={()=>setShowCustomerInsightsModal(false)}/>:(            <View style={styles.operatorModalHeader}>
              <View style={styles.operatorModalHeaderTextWrap}>
                <Text style={styles.operatorModalEyebrow}>Focus clienti</Text>
                <Text style={styles.operatorModalTitle}>{Platform.OS === 'web' ? 'Dettagli appuntamenti clienti' : 'Clienti del salone'}</Text>
                <Text style={styles.operatorModalText}>
                  {Platform.OS === 'web' ? 'Cerca il cliente e consulta storico, agenda attiva, spesa totale e servizi più richiesti.' : 'Storico, prossimi appuntamenti e servizi.'}
                </Text>
              </View>

              <HapticTouchable
                style={styles.operatorModalCloseButton}
                onPress={() => {
                  setShowCustomerInsightsModal(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Chiudi appuntamenti cliente"
                pressScale={0.97}
                pressOpacity={0.96}
              >
                {Platform.OS === 'web' ? <Text style={{fontSize:12,color:premiumPalette.ink}}>Chiudi</Text> : null}<Ionicons name="close-outline" size={19} color={premiumPalette.ink} />
              </HapticTouchable>
            </View>

)}
            <DeferredCustomerInsightSearchInput
              active={showCustomerInsightsModal}
              value={customerInsightSearchQuery}
              onCommit={setCustomerInsightSearchQuery}
            />

            <FlatList
              horizontal
              style={styles.customerInsightPickerScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.customerInsightPickerRow}
              data={filteredCustomerInsightBoards}
              extraData={selectedCustomerInsightBoard?.boardKey}
              keyExtractor={(item) => item.boardKey}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={3}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.boardKey === selectedCustomerInsightBoard?.boardKey;

                return (
                  <HapticTouchable
                    key={item.boardKey}
                    style={[
                      styles.customerInsightPickerChip,
                      selected && styles.customerInsightPickerChipActive,
                    ]}
                    onPress={() => setSelectedCustomerInsightId(item.boardKey)}
                    pressScale={0.98}
                    pressOpacity={0.98}
                  >
                    <Text
                      style={[
                        styles.customerInsightPickerChipTitle,
                        selected && styles.customerInsightPickerChipTitleActive,
                      ]}
                      numberOfLines={Platform.OS === 'web' ? 1 : 2}
                      adjustsFontSizeToFit={Platform.OS === 'web'}
                      minimumFontScale={0.78}
                      allowFontScaling={false}
                    >
                      {item.customer.nome}
                    </Text>
                    <Text
                      style={[
                        styles.customerInsightPickerChipMeta,
                        selected && styles.customerInsightPickerChipMetaActive,
                      ]}
                      numberOfLines={1}
                      allowFontScaling={false}
                    >
                      {item.totalAppointments} appunt.
                    </Text>
                  </HapticTouchable>
                );
              }}
            />

            <ScrollView
              style={styles.operatorModalScroll}
              contentContainerStyle={[styles.operatorModalScrollContent, Platform.OS !== 'web' && {paddingBottom:homeSheetInsets.bottom+8}]}
              showsVerticalScrollIndicator
              indicatorStyle="black"
            >
              {!selectedCustomerInsightBoard ? (
                <View style={styles.operatorModalEmptyCard}>
                  <Text style={styles.operatorModalEmptyTitle}>Nessun cliente trovato</Text>
                  <Text style={styles.operatorModalEmptyText}>
                    Prova con nome, telefono, email o uno dei servizi già fatti.
                  </Text>
                </View>
              ) : (
                <View {...webHomePart("customer-detail")} style={styles.customerInsightBoard}>
                  <View style={styles.customerInsightBoardHeader}>
                    <View style={styles.customerInsightBoardIdentity}>
                      <Text style={styles.customerInsightBoardName}>
                        {selectedCustomerInsightBoard.customer.nome}
                      </Text>
                      <Text style={styles.customerInsightBoardContacts}>
                        {[
                          selectedCustomerInsightBoard.customer.telefono,
                          selectedCustomerInsightBoard.customer.email ?? '',
                          selectedCustomerInsightBoard.customer.instagram
                            ? `@${selectedCustomerInsightBoard.customer.instagram}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Contatti non disponibili'}
                      </Text>
                    </View>
                    <View style={styles.customerInsightSpendBadge}>
                      <Text style={styles.customerInsightSpendBadgeValue}>
                        € {selectedCustomerInsightBoard.totalSpent.toFixed(2)}
                      </Text>
                      <Text style={styles.customerInsightSpendBadgeLabel}>spesa servizi</Text>
                    </View>
                  </View>

                  <View {...webHomePart("customer-stats")} style={styles.customerInsightStatsGrid}>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.pastAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Passati</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.todayAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Oggi</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.futureAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Futuri</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {reserveCashAmounts?'Riservato':`€ ${selectedCustomerInsightBoard.averageTicket.toFixed(0)}`}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Ticket medio</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.completedAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Completati</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {reserveCashAmounts?'Riservato':`€ ${selectedCustomerInsightBoard.collectedSpent.toFixed(0)}`}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Incassato</Text>
                    </View>
                  </View>

                  <View style={styles.customerInsightHighlightsRow}>
                    <View style={styles.customerInsightHighlightCard}>
                      <Text style={styles.customerInsightHighlightLabel}>Prossimo</Text>
                      <Text style={styles.customerInsightHighlightValue}>
                        {selectedCustomerInsightBoard.nextAppointment
                          ? `${formatDateLabel(
                              selectedCustomerInsightBoard.nextAppointment.data ?? oggi
                            )} · ${selectedCustomerInsightBoard.nextAppointment.ora}`
                          : 'Nessun futuro'}
                      </Text>
                      <Text style={styles.customerInsightHighlightSubvalue}>
                        {selectedCustomerInsightBoard.nextAppointment?.servizio ?? '—'}
                      </Text>
                    </View>

                    <View style={styles.customerInsightHighlightCard}>
                      <Text style={styles.customerInsightHighlightLabel}>Ultimo</Text>
                      <Text style={styles.customerInsightHighlightValue}>
                        {selectedCustomerInsightBoard.latestAppointment
                          ? `${formatDateLabel(
                              selectedCustomerInsightBoard.latestAppointment.data ?? oggi
                            )} · ${selectedCustomerInsightBoard.latestAppointment.ora}`
                          : 'Nessuno storico'}
                      </Text>
                      <Text style={styles.customerInsightHighlightSubvalue}>
                        {selectedCustomerInsightBoard.latestAppointment?.servizio ?? '—'}
                      </Text>
                    </View>
                  </View>

                  <View {...webHomePart("customer-services")} style={styles.customerInsightServicesCard}>
                    <Text style={styles.customerInsightSectionTitle}>Servizi fruiti</Text>
                    {selectedCustomerInsightBoard.serviceStats.length === 0 ? (
                      <Text style={styles.customerInsightSectionEmpty}>
                        Nessun servizio completato registrato.
                      </Text>
                    ) : (
                      <View style={styles.customerInsightServiceList}>
                        {selectedCustomerInsightBoard.serviceStats.slice(0, 6).map((item) => (
                          <View key={`${selectedCustomerInsightBoard.boardKey}-${item.serviceName}`} style={styles.customerInsightServiceRow}>
                            <Text style={styles.customerInsightServiceName}>{item.serviceName}</Text>
                            <Text style={styles.customerInsightServiceMeta}>
                              {item.count}x · € {item.total.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View {...webHomePart("customer-timeline")} style={styles.customerInsightTimelineCard}>
                    <Text style={styles.customerInsightSectionTitle}>Lista appuntamenti</Text>
                    <View style={premiumFilterStyles.panel}>
                      <View style={premiumFilterStyles.icon} accessibilityLabel="Filtri appuntamenti">
                        <Ionicons name="funnel-outline" size={18} color={premiumPalette.muted} />
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={premiumFilterStyles.viewport} contentContainerStyle={styles.customerInsightFilterRow} keyboardShouldPersistTaps="handled">
                      {customerAppointmentFilterOptions.map((option) => {
                        const active = customerAppointmentFilter === option.key;

                        return (
                          <HapticTouchable
            key={`${selectedCustomerInsightBoard.boardKey}-${option.key}`}
                            style={[
                              styles.customerInsightFilterChip,
                              active && styles.customerInsightFilterChipActive,
                            ]}
                            onPress={() => setCustomerAppointmentFilter(option.key)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            pressScale={0.98}
                            pressOpacity={0.98}
                          >
                            <Text
                              style={[
                                styles.customerInsightFilterChipText,
                                active && styles.customerInsightFilterChipTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.customerInsightFilterChipCount,
                                active && styles.customerInsightFilterChipCountActive,
                              ]}
                            >
                              {option.count}
                            </Text>
                            {active && (
                              <View style={styles.customerInsightFilterSeal} pointerEvents="none">
                                <FilterCheckmark />
                              </View>
                            )}
                          </HapticTouchable>
                        );
                      })}
                      </ScrollView>
                    </View>

                    {visibleCustomerTimeline.length === 0 ? (
                      <Text style={styles.customerInsightSectionEmpty}>
                        Nessun appuntamento in questo filtro.
                      </Text>
                    ) : (
                    <View style={styles.customerInsightTimeline}>
                      {visibleCustomerTimeline.map((entry) => (
                        <View key={`${selectedCustomerInsightBoard.boardKey}-${entry.id}`} style={styles.customerInsightTimelineRow}>
                          <View style={styles.customerInsightDateBadge}>
                            <Text style={styles.customerInsightDateBadgeDay}>{entry.dateLabel}</Text>
                            <Text style={styles.customerInsightDateBadgeTime}>{entry.ora}</Text>
                          </View>

                          <View style={styles.customerInsightTimelineContent}>
                            <View style={styles.customerInsightTimelineTopRow}>
                              <Text style={styles.customerInsightTimelineTitle}>{entry.title}</Text>
                              <View
                                style={[
                                  styles.customerInsightPhasePill,
                                  entry.tone === 'future' && styles.customerInsightPhasePillFuture,
                                  entry.tone === 'today' && styles.customerInsightPhasePillToday,
                                  entry.tone === 'past' && styles.customerInsightPhasePillPast,
                                  entry.tone === 'muted' && styles.customerInsightPhasePillMuted,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.customerInsightPhasePillText,
                                    entry.tone === 'future' && styles.customerInsightPhasePillTextFuture,
                                    entry.tone === 'today' && styles.customerInsightPhasePillTextToday,
                                    entry.tone === 'past' && styles.customerInsightPhasePillTextPast,
                                    entry.tone === 'muted' && styles.customerInsightPhasePillTextMuted,
                                  ]}
                                >
                                  {entry.phase}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.customerInsightTimelineSubtitle}>{entry.subtitle}</Text>
                            <Text style={styles.customerInsightTimelineStatus}>{entry.badge}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </DockedSheetSurface>
        </View>
      </CustomerInsightsOverlay>
      </HapticTouchableFastRegion>
    </View>
  );
}

const baseHomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'web' ? 24 : 100,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  androidHomeSecondaryPlaceholder: {
    minHeight: 520,
    paddingTop: 18,
    gap: 16,
  },
  androidHomeSecondaryPlaceholderRow: {
    height: 112,
    borderRadius: 24,
    backgroundColor: '#EEF3F8',
  },
  androidHomeSecondaryPlaceholderCard: {
    height: 280,
    borderRadius: 28,
    backgroundColor: '#F8FAFC',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
    position: 'relative',
    overflow: 'visible',
  },
  settingsIcon: {
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  dashboardSectionHeading: { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center', alignSelf: 'stretch', marginTop: 10, marginBottom: 10 },
  heroTopRow: {
    flexDirection: 'row',
    marginTop: 0,
    marginBottom: 14,
    gap: 14,
  },
  heroMetaCard: {
    flex: 1,
    backgroundColor: '#F3F1EA',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  heroMetaCardToday: {
    backgroundColor: '#FFF1C7',
  },
  heroStatusCard: {
    backgroundColor: '#F6EBEE',
  },
  heroDateLabelToday: {
    color: '#9A6A14',
  },
  heroDateValueToday: {
    color: '#0F172A',
  },
  heroDateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroDateValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  statusPillText: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusHot: {
    backgroundColor: '#FDEBEC',
    borderColor: 'rgba(220, 38, 38, 0.12)',
    borderTopColor: 'rgba(220, 38, 38, 0.12)',
  },
  statusWarm: {
    backgroundColor: '#ECF8F1',
    borderColor: 'rgba(22, 163, 74, 0.12)',
    borderTopColor: 'rgba(22, 163, 74, 0.12)',
  },
  statusCalm: {
    backgroundColor: '#EAF2FF',
    borderColor: 'rgba(37, 99, 235, 0.16)',
    borderTopColor: 'rgba(37, 99, 235, 0.16)',
  },
  statusHotText: {
    color: '#C1332B',
  },
  statusWarmText: {
    color: '#236B45',
  },
  statusCalmText: {
    color: '#2A5DB8',
  },
  dashboardSkeletonBar: {
    alignSelf: 'center',
    backgroundColor: 'rgba(232, 239, 248, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.42)',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  heroMetricCardBlue: {
    flex: 1,
    backgroundColor: '#EFE9FF',
    borderRadius: 26,
    paddingVertical: 18,
    paddingHorizontal: IS_ANDROID ? 20 : 10,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroMetricCardRose: {
    flex: 1,
    backgroundColor: '#FFF0E2',
    borderRadius: 26,
    paddingVertical: 18,
    paddingHorizontal: IS_ANDROID ? 20 : 10,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroMetricNumber: {
    fontSize: IS_ANDROID ? 26 : 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  heroMetricNumberBlue: {
    color: '#0F172A',
  },
  heroMetricNumberRose: {
    color: '#0F172A',
  },
  heroMetricSkeleton: {
    marginBottom: 7,
    marginTop: 1,
  },
  heroMetricLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  heroMetricLabelBlue: {
    color: '#6C58B8',
  },
  heroMetricLabelRose: {
    color: '#C46B26',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  insightCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F2E6DA',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  insightCardMint: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#ECF6D9',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  insightCardPending: {
    backgroundColor: '#FFF1E2',
  },
  insightGridCompact: {
    gap: 10,
    marginBottom: 4,
  },
  insightCardCompact: {
    minHeight: 84,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  salonTotalDetails: {
    marginBottom: 0,
  },
  salonTotalDetailsExpanded: {
    marginBottom: 10,
  },
  salonTotalDetailsButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  salonTotalDetailsButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  salonTotalDetailsBody: {
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  salonTotalDetailsText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  salonTotalDetailsEmphasis: {
    fontWeight: '700',
    color: '#334155',
  },
  insightCardLegacy: {
    backgroundColor: '#FDE8E7',
  },
  cashPendingText: {
    color: '#9A6225',
  },
  cashLegacyText: {
    color: '#A33D3A',
  },
  halfWidthCard: {
    minWidth: '48%',
  },
  desktopThirdCard: {
    minWidth: '48%',
  },
  insightTitle: {
    fontSize: 13,
    lineHeight: 17,
    minHeight: 0,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 3,
    textAlign: 'center',
    paddingHorizontal: 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  insightTitlePlum: {
    color: '#8A5A34',
  },
  insightTitleMint: {
    color: '#678126',
  },
  insightNumber: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  insightNumberPlum: {
    color: '#0F172A',
  },
  insightNumberMint: {
    color: '#0F172A',
  },
  insightNumberSkeleton: {
    marginTop: 2,
    marginBottom: 3,
  },
  insightHint: {
    fontSize: 12,
    lineHeight: 17,
    minHeight: 0,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  homeMetricTitleViewport: {
    marginBottom: 3,
  },
  insightHintPlum: {
    color: '#8A5A34',
  },
  insightHintMint: {
    color: '#7A8E3B',
  },
  insightHintSkeleton: {
    marginTop: 0,
  },
  priorityCard: {
    backgroundColor: 'rgba(248, 250, 253, 0.62)',
    borderRadius: 24,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 0,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  priorityCardWebFlat: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    boxShadow: 'none',
  },
  priorityCardAndroidPremium: {
    backgroundColor: '#F8FAFC',
    borderColor: 'rgba(203, 213, 225, 0.72)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  priorityCardGlassBlue: {
    backgroundColor: 'rgba(22, 117, 241, 0.26)',
    borderColor: 'rgba(74, 163, 255, 0.62)',
    shadowColor: '#0878E8',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 13 },
    elevation: 9,
  },
  priorityCardGlassBlueAndroid: {
    backgroundColor: '#C3DCFB',
    borderColor: '#70B1F5',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  desktopPriorityCard: {
    alignSelf: 'stretch',
  },
  priorityEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#556274',
    letterSpacing: 1.2,
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
    textTransform: 'uppercase',
  },
  priorityEyebrowGlassBlue: {
    color: '#28639D',
  },
  priorityEyebrowAndroidPremium: {
    backgroundColor: '#C3DCFB',
  },
  priorityTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 4,
    lineHeight: 24,
    paddingHorizontal: 0,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    flexShrink: 1,
  },
  priorityTitleAndroidPremium: {
    backgroundColor: '#C3DCFB',
    paddingHorizontal: 8,
  },
  priorityTitleGlassBlue: {
    color: '#0F3158',
  },
  priorityTitleFallback: {
    fontSize: 19,
    lineHeight: 23,
  },
  priorityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    lineHeight: 18,
    textAlign: 'center',
    width: '94%',
    maxWidth: '94%',
    alignSelf: 'center',
    flexShrink: 1,
  },
  priorityTextAndroidPremium: {
    backgroundColor: '#C3DCFB',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  priorityTextGlassBlue: {
    color: '#315D89',
  },
  priorityTitleSkeleton: {
    marginTop: 6,
    marginBottom: 8,
  },
  priorityTextSkeleton: {
    marginBottom: 3,
  },
  priorityMultiArea: {
    width: '100%',
    marginTop: 10,
    paddingRight: 14,
    position: 'relative',
    alignSelf: 'center',
  },
  priorityMultiList: {
    width: '100%',
    maxHeight: 156,
    marginTop: 0,
  },
  priorityMultiListContent: {
    gap: 0,
    paddingRight: 2,
    paddingBottom: 0,
  },
  priorityMultiItem: {
    width: '100%',
    minHeight: 74,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(241, 246, 253, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(216, 228, 243, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.46,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  priorityMultiItemSpaced: {
    marginBottom: 8,
    borderBottomWidth: 0,
  },
  priorityMultiTimeBadge: {
    width: 62,
    minWidth: 62,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(210, 221, 238, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(199, 213, 232, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityMultiTime: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  priorityMultiContent: {
    flex: 1,
    justifyContent: 'center',
  },
  priorityMultiClient: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  priorityMultiService: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: '#607086',
  },
  priorityMultiRole: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: '#4F46E5',
  },
  priorityScrollIndicatorWrap: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    right: -6,
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityScrollIndicatorTrack: {
    width: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 223, 236, 0.72)',
    overflow: 'visible',
    justifyContent: 'flex-start',
  },
  priorityScrollIndicatorThumb: {
    borderRadius: 999,
    height: '100%',
    backgroundColor: 'rgba(125, 146, 174, 0.86)',
    shadowColor: 'rgba(15,23,42,0.08)',
    shadowOffset: { width: 0, height: 1 },
  },
  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 8,
  },
  infoCardSun: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#EAF7EF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 8,
    paddingVertical: 18,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  infoCardLavender: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#F8EBD8',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 8,
    paddingVertical: 18,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  infoCardPeach: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#FCE7F3',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 8,
    paddingVertical: 18,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  infoCardResponsive: {
    minWidth: '31%',
  },
  infoLabel: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    minHeight: 14,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
    width: '100%',
    alignSelf: 'stretch',
    flexShrink: 1,
  },
  infoLabelSun: {
    color: '#2E8B72',
  },
  infoLabelLavender: {
    color: '#B86A1F',
  },
  infoLabelPeach: {
    color: '#C2388F',
  },
  infoValue: {
    fontSize: IS_ANDROID ? 26 : 24,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  infoValueSun: {
    color: '#0F172A',
  },
  infoValueLavender: {
    color: '#0F172A',
  },
  infoValuePeach: {
    color: '#0F172A',
  },
  infoValueSkeleton: {
    marginTop: 2,
  },
  operatorAgendaCard: {
    marginTop: 0,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  customerInsightsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  operatorAgendaCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 6,
    ...Platform.select({
      web: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
      },
    }),
  },
  operatorAgendaCardTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    alignItems: 'center',
    ...Platform.select({
      web: {
        width: '100%',
        paddingHorizontal: 104,
        paddingRight: 104,
      },
    }),
  },
  operatorAgendaCardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
    letterSpacing: -0.3,
    flexShrink: 1,
    textAlign: 'center',
  },
  operatorAgendaCardText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#4E5A68',
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  insightDescription: {
    width: '100%',
    marginBottom: 14,
    fontWeight: '500',
  },
  operatorAgendaCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D8D7D1',
    shadowColor: '#A8A096',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    ...Platform.select({
      web: {
        position: 'absolute',
        right: 0,
        top: 0,
      },
    }),
  },
  operatorAgendaCardActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorAgendaStatsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: Platform.OS === 'web' ? 16 : 4,
  },
  operatorAgendaStatPill: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: '31%',
    width: '31%',
    maxWidth: '31%',
    aspectRatio: Platform.OS === 'web' ? undefined : 1,
    height: Platform.OS === 'web' ? 132 : undefined,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DDDAD2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C2B9AD',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  operatorAgendaStatPillSky: {
    backgroundColor: '#ECFEFF',
    borderColor: '#A5F3FC',
  },
  operatorAgendaStatPillMint: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  operatorAgendaStatPillLavender: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  operatorAgendaStatPillPlum: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  operatorAgendaStatPillSun: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FDE68A',
  },
  operatorAgendaStatPillRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  operatorAgendaStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
    flexShrink: 1,
    width: '100%',
    textAlign: 'center',
    includeFontPadding: false,
  },
  operatorAgendaStatValueCompact: {
    fontSize: 18,
  },
  operatorAgendaStatValueWebWide: {
    fontSize: 30,
    lineHeight: 34,
    marginBottom: 5,
  },
  operatorAgendaStatLabel: {
    fontSize: Platform.OS === 'web' ? 9 : 12,
    fontWeight: '800',
    color: '#5E6876',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
    lineHeight: Platform.OS === 'web' ? 12 : 16,
    minHeight: Platform.OS === 'web' ? 12 : 32,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  operatorAgendaStatLabelWebWide: {
    fontSize: 14,
    lineHeight: 19,
    minHeight: 19,
  },
  operatorAgendaPreviewStack: {
    gap: 10,
  },
  operatorAgendaPreviewRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFD8CE',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#C6BCB0',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  operatorAgendaPreviewRowNative: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  operatorAgendaPreviewRowWeb: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  operatorAgendaPreviewLeftNative: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  operatorAgendaPreviewLeftWeb: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  operatorAgendaPreviewIdentity: {
    flex: 1,
    alignItems: 'center',
  },
  operatorAgendaPreviewIdentityNative: {
    minWidth: 0,
    alignItems: 'flex-start',
  },
  operatorAgendaPreviewIdentityWeb: {
    minWidth: 0,
    alignItems: 'flex-start',
  },
  operatorAgendaPreviewAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FBF8F2',
    borderWidth: 1,
    borderColor: '#E7DFD2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  operatorAgendaPreviewAvatarImage: {
    width: '100%',
    height: '100%',
  },
  operatorAgendaPreviewAvatarNative: {
    width: 44,
    height: 44,
    borderRadius: 15,
    flexShrink: 0,
  },
  operatorAgendaPreviewAvatarWeb: {
    width: 44,
    height: 44,
    borderRadius: 15,
    flexShrink: 0,
  },
  operatorAgendaPreviewTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  operatorAgendaPreviewTextWrapNative: {
    width: '100%',
    alignItems: 'flex-start',
  },
  operatorAgendaPreviewTextWrapWeb: {
    width: '100%',
    alignItems: 'flex-start',
  },
  operatorAgendaPreviewName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  operatorAgendaPreviewNameNative: {
    width: '100%',
    marginBottom: 1,
    textAlign: 'left',
  },
  operatorAgendaPreviewNameWeb: {
    width: '100%',
    marginBottom: 1,
    textAlign: 'left',
  },
  operatorAgendaPreviewRole: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6C6F78',
    textAlign: 'center',
  },
  operatorAgendaPreviewRoleNative: {
    width: '100%',
    textAlign: 'left',
  },
  operatorAgendaPreviewRoleWeb: {
    width: '100%',
    textAlign: 'left',
  },
  operatorAgendaPreviewMetrics: {
    alignItems: 'center',
    marginRight: 0,
    minWidth: 92,
  },
  operatorAgendaPreviewMetricsNative: {
    flexShrink: 0,
    minWidth: 88,
    maxWidth: 112,
    alignItems: 'flex-end',
    marginRight: 0,
  },
  operatorAgendaPreviewMetricsWeb: {
    flexShrink: 0,
    minWidth: 104,
    maxWidth: 140,
    alignItems: 'flex-end',
    marginRight: 0,
  },
  customerInsightPreviewRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E1D7C8',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#CBBEAA',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  qrJumpButton: {
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 999,
    backgroundColor: '#17233A',
    borderWidth: 1.5,
    borderColor: '#243552',
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0B1324',
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  qrJumpButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  customerInsightPreviewMain: {
    flex: 1,
    alignItems: 'center',
  },
  customerInsightPreviewMeta: {
    fontSize: 11,
    fontWeight: '800',
    color: '#696960',
    marginTop: 3,
    textAlign: 'center',
  },
  customerInsightPreviewMetrics: {
    alignItems: 'center',
    minWidth: 92,
  },
  customerInsightPreviewMetric: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6D5338',
    marginBottom: 2,
    textAlign: 'center',
  },
  customerInsightPreviewMetricSoft: {
    fontSize: 11,
    fontWeight: '800',
    color: '#756858',
    textAlign: 'center',
  },
  operatorAgendaPreviewMetric: {
    fontSize: 13,
    fontWeight: '900',
    color: '#33577d',
    marginBottom: 2,
    textAlign: 'center',
  },
  operatorAgendaPreviewMetricNative: {
    textAlign: 'right',
  },
  operatorAgendaPreviewMetricWeb: {
    width: '100%',
    textAlign: 'right',
  },
  operatorAgendaPreviewMetricSoft: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  operatorAgendaPreviewMetricSoftNative: {
    width: '100%',
    textAlign: 'right',
  },
  operatorAgendaPreviewMetricSoftWeb: {
    width: '100%',
    textAlign: 'right',
  },
  operatorAgendaEmptyState: {
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: 1,
    borderColor: '#DFD8CE',
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#C4B8AA',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  operatorAgendaEmptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  operatorAgendaEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: Platform.OS === 'web' ? 16 : 0,
    marginBottom: Platform.OS === 'web' ? 14 : 10,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  sectionCardMandatory: {
    backgroundColor: '#FFFBEB',
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  sectionCardDark: {
    backgroundColor: '#1f2937',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2b3647',
  },
  desktopWideCard: {
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  sectionTitleDark: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
  },
  sectionSubtext: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 14,
  },
  sectionSubtextCentered: {
    textAlign: 'center',
  },
  sectionTextDark: {
    fontSize: 14,
    lineHeight: 20,
    color: '#e2e8f0',
  },
  sectionTextCentered: {
    textAlign: 'center',
  },
  smartItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  smartItemLast: {
    paddingTop: 10,
  },
  smartItemCentered: {
    alignItems: 'center',
  },
  smartLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  smartValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111111',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  smartTextCentered: {
    textAlign: 'center',
  },
  operatorModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28, paddingBottom: 0 },
  operatorModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    minHeight: 420,
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  customerInsightModalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    minHeight: 520,
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  customerInsightSearchInput: {
    minHeight: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  customerInsightPickerScroll: {
    flexGrow: 0,
    minHeight: 82,
    marginBottom: 4,
  },
  customerInsightPickerRow: {
    gap: 10,
    alignItems: 'stretch',
    paddingBottom: 12,
    paddingRight: 8,
  },
  customerInsightPickerChip: {
    minWidth: 138,
    minHeight: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  customerInsightPickerChipActive: {
    backgroundColor: '#EAF4EA',
    borderColor: '#BFD2C0',
  },
  customerInsightPickerChipTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightPickerChipTitleActive: {
    color: '#163624',
  },
  customerInsightPickerChipMeta: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  customerInsightPickerChipMetaActive: {
    color: '#335b41',
  },
  customerInsightBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  customerInsightBoardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  customerInsightBoardIdentity: {
    flex: 1,
  },
  customerInsightBoardName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  customerInsightBoardContacts: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  customerInsightSpendBadge: {
    minWidth: 108,
    backgroundColor: '#ECFDF3',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CDEAD7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  customerInsightSpendBadgeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#166534',
    marginBottom: 2,
  },
  customerInsightSpendBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3F6B4B',
    textAlign: 'center',
  },
  customerInsightStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  customerInsightStatCard: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customerInsightStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  customerInsightHighlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  customerInsightHighlightCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  customerInsightHighlightLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#64748B',
    marginBottom: 5,
  },
  customerInsightHighlightValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightHighlightSubvalue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  customerInsightServicesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  customerInsightSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  customerInsightSectionEmpty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  customerInsightServiceList: {
    gap: 8,
  },
  customerInsightServiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5EBF2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerInsightServiceName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerInsightServiceMeta: {
    fontSize: 11,
    fontWeight: '900',
    color: '#33577D',
  },
  customerInsightTimelineCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  customerInsightFilterRow: {
    
    
    
    
    
    marginBottom: 12,
    ...premiumFilterStyles.row,
  },
  customerInsightFilterChip: {
    
    position: 'relative',
    
    
    
    
    
    
    
    
    
    ...premiumFilterStyles.card,
  },
  customerInsightFilterChipActive: {
    
    
    
    ...premiumFilterStyles.selected,
  },
  customerInsightFilterSeal: {
       zIndex: 1,
     
     
    ...premiumFilterStyles.check,
  },
  customerInsightFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  customerInsightFilterChipTextActive: {
    
    ...premiumFilterStyles.selectedText,
  },
  customerInsightFilterChipCount: {
    minWidth: 20,
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  customerInsightFilterChipCountActive: {
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  customerInsightTimeline: {
    gap: 10,
  },
  customerInsightTimelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customerInsightDateBadge: {
    width: 78,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInsightDateBadgeDay: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  customerInsightDateBadgeTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  customerInsightTimelineContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerInsightTimelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  customerInsightTimelineTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  customerInsightTimelineSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 4,
  },
  customerInsightTimelineStatus: {
    fontSize: 11,
    fontWeight: '800',
    color: '#33577D',
  },
  customerInsightPhasePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  customerInsightPhasePillFuture: {
    backgroundColor: '#E0F2FE',
  },
  customerInsightPhasePillToday: {
    backgroundColor: '#FEF3C7',
  },
  customerInsightPhasePillPast: {
    backgroundColor: '#ECFDF3',
  },
  customerInsightPhasePillMuted: {
    backgroundColor: '#F1F5F9',
  },
  customerInsightPhasePillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  customerInsightPhasePillTextFuture: {
    color: '#0C4A6E',
  },
  customerInsightPhasePillTextToday: {
    color: '#92400E',
  },
  customerInsightPhasePillTextPast: {
    color: '#166534',
  },
  customerInsightPhasePillTextMuted: {
    color: '#64748B',
  },
  operatorModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  operatorModalToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  operatorModalScopeRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    width: '100%',
  },
  operatorModalScopeChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 6,
    paddingVertical: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorModalScopeChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  operatorModalScopeChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalScopeChipTextActive: {
    color: '#F8FAFC',
  },
  operatorModalToolbarButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  operatorModalToolbarButtonDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  operatorModalToolbarButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalToolbarButtonTextDisabled: {
    color: '#94A3B8',
  },
  operatorModalHeaderTextWrap: {
    flex: 1,
  },
  operatorModalEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#64748B',
    marginBottom: 6,
  },
  operatorModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  operatorModalText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '700',
  },
  operatorModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorModalScroll: {
    flexGrow: 0,
    maxHeight: '100%',
  },
  operatorModalScrollContent: {
    gap: 12,
    paddingBottom: 18,
  },
  operatorModalEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
  },
  operatorModalEmptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  operatorModalEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '700',
  },
  operatorModalBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  operatorModalBoardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  operatorModalBoardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  operatorModalBoardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  operatorModalBoardAvatarImage: {
    width: '100%',
    height: '100%',
  },
  operatorModalBoardTextWrap: {
    flex: 1,
  },
  operatorModalBoardName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  operatorModalBoardRole: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  operatorModalBoardCounters: {
    flexDirection: 'row',
    gap: 8,
  },
  operatorModalCounterPill: {
    minWidth: 64,
    backgroundColor: '#EAFBF1',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  operatorModalCounterPillSoft: {
    minWidth: 64,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  operatorModalCounterValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#166534',
  },
  operatorModalCounterLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3F7A52',
    textTransform: 'uppercase',
  },
  operatorModalCounterValueSoft: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalCounterLabelSoft: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  operatorModalBoardEmpty: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  operatorModalBoardEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
  },
  operatorModalBoardEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '700',
  },
  operatorModalTimeline: {
    gap: 10,
  },
  operatorModalTimelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  operatorModalTimeBadge: {
    width: 62,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    alignItems: 'center',
  },
  operatorModalTimeBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalTimelineContent: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  operatorModalTimelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 5,
  },
  operatorModalTimelineTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalTimelineSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  operatorModalStatusPill: {
    borderRadius: 999,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  operatorModalStatusPillRequest: {
    backgroundColor: '#FEF3C7',
  },
  operatorModalStatusPillDone: {
    backgroundColor: '#DCFCE7',
  },
  operatorModalStatusPillCash: {
    backgroundColor: '#E0E7FF',
  },
  operatorModalStatusPillMuted: {
    backgroundColor: '#E5E7EB',
  },
  operatorModalStatusPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#075985',
    textTransform: 'uppercase',
  },
  operatorModalStatusPillTextRequest: {
    color: '#92400E',
  },
  operatorModalStatusPillTextDone: {
    color: '#166534',
  },
  operatorModalStatusPillTextCash: {
    color: '#3730A3',
  },
  operatorModalStatusPillTextMuted: {
    color: '#4B5563',
  },
  profileAccordionButton: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    gap: 12,
    paddingTop: 2,
    paddingBottom: 12,
    marginBottom: 4,
  },
  mandatoryIntroCard: {
    position: 'relative',
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginTop: 14,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  mandatoryIntroGlow: {
    position: 'absolute',
    top: -18,
    width: 180,
    height: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
  },
  mandatoryIntroBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  mandatoryIntroEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: IS_ANDROID ? 1 : 2.8,
    color: '#9a6700',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  mandatoryIntroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  mandatoryIntroText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    textAlign: 'center',
  },
  profileAccordionTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  profileAccordionTitle: {
    marginBottom: 4,
    textAlign: 'left',
    width: '100%',
  },
  profileAccordionSubtext: {
    marginBottom: 0,
    textAlign: 'left',
    width: '100%',
  },
  profileAccordionIconWrap: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 0,
  },
  profileEditorCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
  },
  profileEditorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#183451',
    textAlign: 'left',
    marginBottom: 6,
  },
  profileEditorCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'left',
    marginBottom: 18,
  },
  profileModuleStack: {
    gap: 12,
  },
  profileModuleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFE7EF',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
  },
  profileModuleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  profileModuleTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  profileModuleEyebrow: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#51769A',
    marginBottom: 4,
  },
  profileModuleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#182235',
    marginBottom: 3,
    letterSpacing: IS_ANDROID ? 0 : 0.3,
    includeFontPadding: true,
  },
  profileModuleCaption: {
    fontSize: 11,
    lineHeight: 16,
    color: '#6a7384',
    fontWeight: '500',
  },
  profileProtectedCaption: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    marginBottom: 6,
  },
  profileModuleBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  profileModuleBadgeComplete: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  profileModuleBadgeIncomplete: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  profileModuleBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#516173',
    letterSpacing: IS_ANDROID ? 0 : 0.2,
    includeFontPadding: true,
  },
  profileModuleBadgeTextComplete: {
    color: '#166534',
  },
  profileModuleBadgeTextIncomplete: {
    color: '#B91C1C',
  },
  compactFieldBlock: {
    width: '100%',
    marginBottom: 2,
  },
  profileSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.05)',
    marginVertical: 18,
  },
  profileSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileSectionCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  profileEditorWrap: {
    gap: 14,
  },
  profilePreviewCard: {
    backgroundColor: '#F0F5FA',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginTop: 16,
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOpacity: 0,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 0,
  },
  profilePreviewHeader: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  profilePreviewEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#51769A',
    textTransform: 'uppercase',
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  profilePreviewProgress: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
  },
  profilePreviewName: {
    fontSize: 30,
    color: '#183451',
    marginBottom: 6,
    textAlign: 'center',
  },
  profilePreviewNameUpper: {
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0.2 : 0.8,
  },
  profilePreviewNameLower: {
    textTransform: 'lowercase',
  },
  profilePreviewMeta: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0.2 : 0.8,
    includeFontPadding: true,
  },
  profileProgressRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  profileProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'rgba(248, 250, 252, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.72)',
    borderRadius: 999,
    shadowColor: '#94A3B8',
    shadowOpacity: 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  profileProgressItemCompleted: {
    backgroundColor: 'rgba(236, 253, 245, 0.96)',
    borderColor: 'rgba(20, 184, 166, 0.28)',
  },
  profileProgressDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  profileProgressDotCompleted: {
    backgroundColor: '#0f766e',
  },
  profileProgressLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#344257',
  },
  profilePreviewInfoRow: {
    width: '100%',
    gap: 8,
    alignItems: 'center',
  },
  profilePreviewInfoPill: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  profilePreviewInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  formGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  formGroupTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  formGroupCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
    marginBottom: 5,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  fontDropdownButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  fontDropdownTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  formColumn: {
    flex: 1,
    minWidth: 160,
  },
  formColumnCompact: {
    width: 120,
    minWidth: 120,
  },
  accountInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
    marginTop: 0,
    width: '100%',
    textAlign: 'left',
    textAlignVertical: IS_ANDROID ? 'center' : 'auto',
    includeFontPadding: true,
  },
  accountInputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  accountInputLocked: {
    opacity: 0.65,
  },
  profileFontSelectorGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  profileFontChip: {
    flex: 1,
    minWidth: 96,
    backgroundColor: '#F7FAFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d2dbe5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  profileFontChipActive: {
    backgroundColor: '#193B60',
    borderColor: '#193B60',
  },
  profileFontChipText: {
    fontSize: 13,
    color: '#334155',
  },
  profileFontChipTextActive: {
    color: '#ffffff',
  },
  previewButton: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  profileSaveButton: {
    marginTop: 14,
    paddingVertical: 13,
    backgroundColor: '#193B60',
    borderRadius: 16,
  },
  profileSaveButtonEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  accessWarningCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accessWarningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9a3412',
    textAlign: 'center',
    marginBottom: 4,
  },
  accessWarningText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#9a3412',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 8,
    backgroundColor: '#eef2f7',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  secondaryActionButton: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  secondaryActionButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
  },
  clientAccessPrimaryButton: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    minHeight: 54,
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#0B1324',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  clientAccessPrimaryButtonText: {
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  clientAccessSecondaryButton: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    minHeight: 54,
    marginTop: Platform.OS === 'web' ? 12 : 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(148, 163, 184, 0.34)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  clientAccessSecondaryButtonText: {
    color: '#17233A',
    letterSpacing: 0.15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  accountHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  adminStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  adminStatusChip: {
    backgroundColor: '#e8eef5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d2dbe5',
  },
  adminStatusChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#334155',
  },
  adminStatusChipDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  adminStatusChipDangerText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#b91c1c',
  },
  accessCard: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: 'rgba(248, 251, 255, 0.96)',
    borderRadius: 32,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(191, 219, 254, 0.72)',
    marginTop: 18,
    marginBottom: 18,
    alignItems: 'center',
    shadowColor: '#7AA7E8',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    position: 'relative',
  },
  accessCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  accessLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 1 : 3,
    textTransform: 'uppercase',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  accessCode: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0 : 0.2,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  accessLinkPlate: {
    width: '100%',
    maxWidth: 620,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#64748B',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  accessLink: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    color: '#334155',
    textAlign: 'center',
  },
  accessHealthBadge: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accessHealthBadgeReady: {
    backgroundColor: '#ECFDF5',
    borderColor: 'transparent',
  },
  accessHealthBadgeWarning: {
    backgroundColor: '#FFF7ED',
    borderColor: 'transparent',
  },
  accessHealthText: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  accessHealthTextReady: {
    color: '#166534',
  },
  accessHealthTextChecking: {
    color: '#0c4a6e',
  },
  accessHealthTextWarning: {
    color: '#9a3412',
  },
  qrCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 36,
    paddingVertical: Platform.OS === 'web' ? 30 : 18,
    paddingHorizontal: IS_ANDROID ? 26 : 28,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.96)',
    marginTop: 10,
    marginBottom: Platform.OS === 'web' ? 18 : 4,
    alignItems: 'center',
    shadowColor: '#8090A8',
    shadowOpacity: 0.18,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    position: 'relative',
  },
  qrCardGlow: {
    position: 'absolute',
    top: 0,
    left: 26,
    right: 26,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  qrCardResponsive: {
    alignSelf: 'center',
  },
  qrFrame: {
    borderRadius: 34,
    padding: 16,
    backgroundColor: 'rgba(241, 245, 249, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.88)',
    shadowColor: '#CBD5E1',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  qrPlate: {
    borderRadius: 30,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  androidHomeQrPlaceholder: {
    width: 196,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  qrSalonBadge: {
    marginTop: Platform.OS === 'web' ? 22 : 12,
    marginBottom: 0,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: Platform.OS === 'web' ? 18 : 10,
    paddingHorizontal: 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrSalonBadgeText: {
    fontSize: 30,
    lineHeight: 40,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    color: '#243957',
    textAlign: 'center',
  },
  manualCodeLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  manualCodeHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 10,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  qrText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    fontWeight: '700',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  mandatoryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mandatoryOverlayCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#eef2f7',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    alignItems: 'center',
  },
  mandatoryOverlayAccent: {
    position: 'absolute',
    top: -36,
    width: 210,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(96, 165, 250, 0.16)',
  },
  mandatoryOverlayBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: IS_ANDROID ? 1 : 2.6,
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  mandatoryOverlayTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  mandatoryOverlayButton: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 22,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mandatoryOverlayButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
});

// Auxiliary components retain their original platform styles.
const styles = baseHomeStyles;
