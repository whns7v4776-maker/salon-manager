import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    InteractionManager,
    Keyboard,
    LayoutAnimation,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../../components/ui/keyboard-next-toolbar';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { doesServiceUseOperators, getTodayDateString, normalizeRoleName } from '../../src/lib/booking';
import { focusNextInput, useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { haptic } from '../../src/lib/haptics';
import { AppLanguage, tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';
import {
  getCustomAccent,
  getServiceAccentByMeta,
  normalizeServiceAccentKey,
  resolveServiceAccent,
} from '../../src/lib/service-accents';

type ServizioItem = {
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

type OperatoreItem = {
  id: string;
  nome: string;
  mestiere: string;
  fotoUri?: string;
  availability?: {
    enabledWeekdays: number[];
    dateRanges: {
      id: string;
      startDate: string;
      endDate: string;
      label?: string;
    }[];
  };
};

const normalizeServiceName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');
const buildUniqueEntityId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeOperatorName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeMachineryName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const hasConfiguredOperatorsForRole = (
  roleName: string,
  operators: OperatoreItem[]
) => {
  const normalizedRole = normalizeRoleName(roleName);
  if (!normalizedRole) return false;

  return operators.some((item) => normalizeRoleName(item.mestiere ?? '') === normalizedRole);
};

const shouldWarnAboutMissingOperatorsForRole = ({
  roleName,
  services,
  operators,
}: {
  roleName: string;
  services: ServizioItem[];
  operators: OperatoreItem[];
}) => {
  const normalizedRole = normalizeRoleName(roleName);
  if (!normalizedRole) return false;
  if (hasConfiguredOperatorsForRole(roleName, operators)) return false;

  const distinctRoles = new Set(
    [...services.map((item) => item.mestiereRichiesto ?? ''), roleName]
      .map((item) => normalizeRoleName(item))
      .filter(Boolean)
  );

  return distinctRoles.size > 1;
};

const formatRoleLabelForDisplay = (value?: string | null) => {
  const trimmedValue = (value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }

  return trimmedValue
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lowerWord = word.toLocaleLowerCase('it-IT');
      return lowerWord.charAt(0).toLocaleUpperCase('it-IT') + lowerWord.slice(1);
    })
    .join(' ');
};

const buildRoleCoverageSummary = (
  services: ServizioItem[],
  operators: OperatoreItem[]
) => {
  const activeRoles = Array.from(
    new Set(
      services
        .map((item) => normalizeRoleName(item.mestiereRichiesto ?? ''))
        .filter(Boolean)
    )
  );

  const operatorCountByRole = new Map<string, number>();
  operators.forEach((item) => {
    const normalizedRole = normalizeRoleName(item.mestiere ?? '');
    if (!normalizedRole) return;
    operatorCountByRole.set(normalizedRole, (operatorCountByRole.get(normalizedRole) ?? 0) + 1);
  });

  const coveredRoles = activeRoles.filter((role) => (operatorCountByRole.get(role) ?? 0) > 0);
  const missingRoles = activeRoles.filter((role) => (operatorCountByRole.get(role) ?? 0) === 0);
  const orphanOperatorRoles = Array.from(operatorCountByRole.keys()).filter(
    (role) => !activeRoles.includes(role)
  );

  return {
    activeRoles,
    coveredRoles,
    missingRoles,
    orphanOperatorRoles,
    operatorCountByRole,
  };
};

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

const SLOT_INTERVAL_OPTIONS = Array.from({ length: 20 }, (_, index) => (index + 1) * 15);
const IS_ANDROID = Platform.OS === 'android';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Gio' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
];

const ALL_WEEKDAY_VALUES = WEEKDAY_OPTIONS.map((item) => item.value);
const DEFAULT_OPERATOR_WEEKDAY_VALUES = WEEKDAY_OPTIONS.filter((item) => item.value !== 0).map(
  (item) => item.value
);
const OPERATOR_PHOTO_QUALITY = 0.82;
const COLOR_SCALE = [
  '#ffd6d6',
  '#ffe2c7',
  '#fff0bf',
  '#eadfcb',
  '#e3d3bf',
  '#dcfce7',
  '#d1fae5',
  '#ccfbf1',
  '#dcfcef',
  '#cbeff0',
  '#d6e8ff',
  '#d9ddff',
  '#e6d6ff',
  '#f4d6ff',
  '#ffd9ee',
  '#ffdcd1',
  '#ffe8d9',
  '#f8f1cf',
];

const isIsoDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const formatWeekdaySummary = (enabledWeekdays: number[]) => {
  const normalized = [...enabledWeekdays].sort((first, second) => first - second);

  if (normalized.length === ALL_WEEKDAY_VALUES.length) {
    return 'Tutti i giorni';
  }

  return WEEKDAY_OPTIONS.filter((item) => normalized.includes(item.value))
    .map((item) => item.label)
    .join(' · ');
};

const formatAvailabilitySummary = (operator: OperatoreItem) => {
  const enabledWeekdays = operator.availability?.enabledWeekdays ?? ALL_WEEKDAY_VALUES;
  const ranges = operator.availability?.dateRanges ?? [];
  const weekdaySummary = formatWeekdaySummary(enabledWeekdays);

  if (ranges.length === 0) {
    return weekdaySummary;
  }

  if (ranges.length === 1) {
    const [range] = ranges;
    return `${weekdaySummary} · ${range.startDate} → ${range.endDate}`;
  }

  return `${weekdaySummary} · ${ranges.length} periodi`;
};

const formatPickerButtonLabel = (prefix: string, value: string) => {
  const [year, month, day] = value.split('-');
  const monthNumber = Number(month);
  const monthLabels = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${prefix} ${day} ${monthLabels[(monthNumber || 1) - 1] ?? month} ${year}`;
};

const formatNumericFieldLabel = (label: string, value: string, suffix = '') =>
  value.trim() !== '' ? `${label} ${value}${suffix}` : label;

const parseDurataInput = (value: string) => {
  const testo = value.trim().toLowerCase().replace(/\s+/g, '');

  if (!testo) return null;

  if (testo.includes(':')) {
    const [oreRaw, minutiRaw] = testo.split(':');
    const ore = Number(oreRaw);
    const minuti = Number(minutiRaw);
    if (Number.isNaN(ore) || Number.isNaN(minuti)) return null;
    return ore * 60 + minuti;
  }

  if (testo.includes('h')) {
    const [oreRaw, minutiRaw = '0'] = testo.split('h');
    const ore = Number(oreRaw.replace(',', '.'));
    const minuti = Number(minutiRaw);
    if (Number.isNaN(ore) || Number.isNaN(minuti)) return null;
    return Math.round(ore * 60) + minuti;
  }

  if (testo.includes(',') || testo.includes('.')) {
    const ore = Number(testo.replace(',', '.'));
    if (Number.isNaN(ore)) return null;
    return Math.round(ore * 60);
  }

  const valore = Number(testo);
  if (Number.isNaN(valore)) return null;

  return valore;
};

const formatDurata = (durataMinuti: number, appLanguage: AppLanguage) => {
  if (durataMinuti === 30) return '30 min';
  if (durataMinuti === 60) return appLanguage === 'it' ? '1 ora' : '1 h';
  if (durataMinuti === 90) return appLanguage === 'it' ? '1 ora e 30' : '1 h 30';

  const ore = Math.floor(durataMinuti / 60);
  const minuti = durataMinuti % 60;

  if (ore > 0 && minuti > 0) return `${ore}h ${minuti}m`;
  if (ore > 0) {
    if (appLanguage === 'it') {
      return ore === 1 ? '1 ora' : `${ore} ore`;
    }
    return ore === 1 ? '1 h' : `${ore} h`;
  }
  return `${durataMinuti} min`;
};

const parseHexColor = (hex: string) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const clampColor = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const adjustHexColor = (hex: string, delta: number) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#64748b';

  const nextR = clampColor(rgb.r + delta);
  const nextG = clampColor(rgb.g + delta);
  const nextB = clampColor(rgb.b + delta);

  return `#${nextR.toString(16).padStart(2, '0')}${nextG
    .toString(16)
    .padStart(2, '0')}${nextB.toString(16).padStart(2, '0')}`;
};

const getReadableTextColor = (hex: string) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#0f172a';

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.64 ? '#0f172a' : '#f8fafc';
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SOFT_LAYOUT_TRANSITION = LayoutAnimation.create(
  210,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity
);

const runSoftLayoutAnimation = () => {
  LayoutAnimation.configureNext(SOFT_LAYOUT_TRANSITION);
};

function AnimatedChevron({ expanded }: { expanded: boolean }) {
  const rotation = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${rotation.value * 180}deg`,
      },
    ],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name="chevron-down" size={20} color="#475569" />
    </Animated.View>
  );
}

export default function ServiziScreen() {
  const responsive = useResponsiveLayout();
  const {
    servizi,
    setServizi,
    appuntamenti,
    richiestePrenotazione,
    operatori,
    setOperatori,
    macchinari,
    setMacchinari,
    salonWorkspace,
    appLanguage,
    serviceCardColorOverrides,
    setServiceCardColorOverrides,
    roleCardColorOverrides,
    setRoleCardColorOverrides,
    availabilitySettings,
  } =
    useAppContext();

  const [nome, setNome] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [prezzoOriginale, setPrezzoOriginale] = useState('');
  const [serviceDiscountStartDate, setServiceDiscountStartDate] = useState('');
  const [serviceDiscountEndDate, setServiceDiscountEndDate] = useState('');
  const [durata, setDurata] = useState('');
  const [mestiereRichiesto, setMestiereRichiesto] = useState('');
  const [selectedServiceMachineryIds, setSelectedServiceMachineryIds] = useState<string[]>([]);
  const [serviceRolePickerOpen, setServiceRolePickerOpen] = useState(false);
  const [serviceCustomRoleOpen, setServiceCustomRoleOpen] = useState(false);
  const [servizioInModifica, setServizioInModifica] = useState<string | null>(null);
  const [nomeOperatore, setNomeOperatore] = useState('');
  const [mestiereOperatore, setMestiereOperatore] = useState('');
  const [operatorPhotoUri, setOperatorPhotoUri] = useState('');
  const [operatorRolePickerOpen, setOperatorRolePickerOpen] = useState(false);
  const [operatorCustomRoleOpen, setOperatorCustomRoleOpen] = useState(false);
  const [operatoreInModifica, setOperatoreInModifica] = useState<string | null>(null);
  const [operatorEnabledWeekdays, setOperatorEnabledWeekdays] = useState<number[]>(
    DEFAULT_OPERATOR_WEEKDAY_VALUES
  );
  const [operatorAvailabilityRanges, setOperatorAvailabilityRanges] = useState<
    { id: string; startDate: string; endDate: string; label?: string }[]
  >([]);
  const [availabilityStartDate, setAvailabilityStartDate] = useState('');
  const [availabilityEndDate, setAvailabilityEndDate] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<
    'start' | 'end' | 'discount-start' | 'discount-end' | null
  >(null);
  const [nomeMacchinario, setNomeMacchinario] = useState('');
  const [mestiereMacchinario, setMestiereMacchinario] = useState('');
  const [categoriaMacchinario, setCategoriaMacchinario] = useState('');
  const [noteMacchinario, setNoteMacchinario] = useState('');
  const [machineryRolePickerOpen, setMachineryRolePickerOpen] = useState(false);
  const [machineryCustomRoleOpen, setMachineryCustomRoleOpen] = useState(false);
  const [isServiceFormExpanded, setIsServiceFormExpanded] = useState(false);
  const [isOperatorFormExpanded, setIsOperatorFormExpanded] = useState(false);
  const [isMachineryFormExpanded, setIsMachineryFormExpanded] = useState(false);
  const [cardColorMode, setCardColorMode] = useState<'service' | 'role'>('service');
  const [selectedServiceColorTargetId, setSelectedServiceColorTargetId] = useState('');
  const [selectedRoleColorTarget, setSelectedRoleColorTarget] = useState('');
  const [serviceNumberPickerTarget, setServiceNumberPickerTarget] = useState<
    'price' | 'originalPrice' | 'duration' | null
  >(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const listRef = useRef<FlatList<ServizioItem> | null>(null);
  const serviceFormOffsetRef = useRef(0);
  const operatorFormOffsetRef = useRef(0);
  const serviceNameRef = useRef<TextInput | null>(null);
  const serviceSubmitButtonRef = useRef<View | null>(null);
  const serviceCustomRoleRef = useRef<TextInput | null>(null);
  const operatorNameRef = useRef<TextInput | null>(null);
  const operatorCustomRoleRef = useRef<TextInput | null>(null);
  const operatorAvailabilityPanelRef = useRef<View | null>(null);
  const machineryNameRef = useRef<TextInput | null>(null);
  const machineryNotesRef = useRef<TextInput | null>(null);
  const machineryCustomRoleRef = useRef<TextInput | null>(null);
  const machineryCategoryRef = useRef<TextInput | null>(null);
  const { focusField, scrollToField, scrollToNode } = useKeyboardAwareScroll(listRef, {
    topOffset: responsive.isDesktop ? 44 : 28,
  });
  const openServicePricePicker = useCallback(() => {
    Keyboard.dismiss();
    setServiceNumberPickerTarget('price');
  }, []);
  const openOperatorRolePicker = useCallback(() => {
    Keyboard.dismiss();
    runSoftLayoutAnimation();
    setOperatorRolePickerOpen((current) => {
      const next = !current;

      if (next) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: Math.max(
                0,
                operatorFormOffsetRef.current + (responsive.isDesktop ? 180 : 250)
              ),
              animated: true,
            });
          }, 130);
        });
      }

      return next;
    });
  }, [responsive.isDesktop]);
  const openServiceRolePicker = useCallback(() => {
    Keyboard.dismiss();
    runSoftLayoutAnimation();
    setServiceRolePickerOpen((current) => {
      const next = !current;

      if (next) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: Math.max(
                0,
                serviceFormOffsetRef.current + (responsive.isDesktop ? 250 : 320)
              ),
              animated: true,
            });
          }, 130);
        });
      }

      return next;
    });
  }, [responsive.isDesktop]);
  const handleOperatorNameSubmit = useCallback(() => {
    if (operatorCustomRoleOpen) {
      focusField(operatorCustomRoleRef);
      return;
    }

    Keyboard.dismiss();
  }, [focusField, operatorCustomRoleOpen]);
  const handleKeyboardNext = useCallback(() => {
    const focusedInput = (
      TextInput.State as unknown as {
        currentlyFocusedInput?: () => TextInput | null;
      }
    ).currentlyFocusedInput?.();

    if (focusedInput === serviceNameRef.current && !serviceCustomRoleOpen) {
      openServicePricePicker();
      return;
    }

    if (focusedInput === operatorNameRef.current && !operatorCustomRoleOpen) {
      openOperatorRolePicker();
      return;
    }

    focusNextInput(
      [
        serviceNameRef,
        serviceCustomRoleRef,
        operatorNameRef,
        operatorCustomRoleRef,
        machineryNameRef,
        machineryNotesRef,
        machineryCustomRoleRef,
        machineryCategoryRef,
      ],
      focusField
    );
  }, [
    focusField,
    openOperatorRolePicker,
    openServicePricePicker,
    operatorCustomRoleOpen,
    serviceCustomRoleOpen,
  ]);

  const closeAllSwipeables = useCallback(() => {
    Object.values(swipeableRefs.current).forEach((ref) => ref?.close());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setServiceCardColorOverrides((current) => ({ ...current }));
      setRoleCardColorOverrides((current) => ({ ...current }));

      return () => {
        Keyboard.dismiss();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        closeAllSwipeables();
      };
    }, [closeAllSwipeables, setRoleCardColorOverrides, setServiceCardColorOverrides])
  );

  const canSubmit = useMemo(() => {
    const parsedPrice = Number(prezzo.replace(',', '.'));
    const parsedDuration = parseDurataInput(durata);

    return (
      nome.trim() !== '' &&
      prezzo.trim() !== '' &&
      !Number.isNaN(parsedPrice) &&
      parsedPrice >= 0 &&
      durata.trim() !== '' &&
      parsedDuration !== null &&
      !Number.isNaN(parsedDuration) &&
      parsedDuration > 0 &&
      mestiereRichiesto.trim() !== ''
    );
  }, [durata, mestiereRichiesto, nome, prezzo]);

  const canSubmitOperatore = useMemo(
    () => nomeOperatore.trim() !== '' && mestiereOperatore.trim() !== '',
    [mestiereOperatore, nomeOperatore]
  );
  const canSubmitMacchinario = useMemo(() => nomeMacchinario.trim() !== '', [nomeMacchinario]);
  const canAddAvailabilityRange = useMemo(
    () =>
      isIsoDateInput(availabilityStartDate) &&
      isIsoDateInput(availabilityEndDate) &&
      availabilityStartDate.trim() <= availabilityEndDate.trim(),
    [availabilityEndDate, availabilityStartDate]
  );
  const hasDiscountModuleEnabled = useMemo(() => prezzoOriginale.trim() !== '', [prezzoOriginale]);

  const roleOptions = useMemo(() => {
    const merged = [
      ...PRESET_ROLE_OPTIONS,
      ...servizi.map((item) => item.mestiereRichiesto ?? ''),
      ...operatori.map((item) => item.mestiere),
    ];

    return merged
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((entry) => normalizeRoleName(entry) === normalizeRoleName(item)) === index);
  }, [operatori, servizi]);

  const sortedServizi = useMemo(
    () =>
      [...servizi].sort((first, second) => {
        const firstRole = normalizeRoleName(first.mestiereRichiesto ?? '');
        const secondRole = normalizeRoleName(second.mestiereRichiesto ?? '');

        if (firstRole !== secondRole) {
          if (!firstRole) return 1;
          if (!secondRole) return -1;
          return firstRole.localeCompare(secondRole, 'it', { sensitivity: 'base' });
        }

        return first.nome.localeCompare(second.nome, 'it', { sensitivity: 'base' });
      }),
    [servizi]
  );

  const missingOperatorRoles = useMemo(
    () =>
      Array.from(
        new Set(
          servizi
            .map((item) => (item.mestiereRichiesto ?? '').trim())
            .filter(Boolean)
            .filter((roleName) => !hasConfiguredOperatorsForRole(roleName, operatori))
        )
      ),
    [operatori, servizi]
  );

  const shouldShowMultiRoleNoOperatorWarning = missingOperatorRoles.length > 0;

  const roleCoverageSummary = useMemo(
    () => buildRoleCoverageSummary(servizi, operatori),
    [operatori, servizi]
  );
  const orphanOperatorRoles = roleCoverageSummary.orphanOperatorRoles;
  const shouldShowRoleAlignmentWarning =
    shouldShowMultiRoleNoOperatorWarning || orphanOperatorRoles.length > 0;

  const hasMatchingServiceTarget = useCallback(
    (roleName: string) => {
      const normalizedRole = normalizeRoleName(roleName);
      if (!normalizedRole) return true;

      return servizi.some(
        (item) => normalizeRoleName(item.mestiereRichiesto ?? '') === normalizedRole
      );
    },
    [servizi]
  );

  const resetForm = () => {
    setNome('');
    setPrezzo('');
    setPrezzoOriginale('');
    setServiceDiscountStartDate('');
    setServiceDiscountEndDate('');
    setDurata('');
    setMestiereRichiesto('');
    setSelectedServiceMachineryIds([]);
    setServiceRolePickerOpen(false);
    setServiceCustomRoleOpen(false);
    setServizioInModifica(null);
  };

  const resetOperatoreForm = () => {
    setNomeOperatore('');
    setMestiereOperatore('');
    setOperatorPhotoUri('');
    setOperatorRolePickerOpen(false);
    setOperatorCustomRoleOpen(false);
    setOperatoreInModifica(null);
    setOperatorEnabledWeekdays(DEFAULT_OPERATOR_WEEKDAY_VALUES);
    setOperatorAvailabilityRanges([]);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
    setDatePickerTarget(null);
    setServiceNumberPickerTarget(null);
  };

  const resetMacchinarioForm = () => {
    setNomeMacchinario('');
    setMestiereMacchinario('');
    setCategoriaMacchinario('');
    setNoteMacchinario('');
    setMachineryRolePickerOpen(false);
    setMachineryCustomRoleOpen(false);
  };

  const pickImageUriFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Accesso foto necessario',
        'Per caricare una foto operatore devi consentire l’accesso alla galleria.'
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: OPERATOR_PHOTO_QUALITY,
      selectionLimit: 1,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      return result.assets[0].uri;
    }

    return null;
  }, []);

  const pickOperatorPhotoFromGallery = useCallback(async () => {
    const nextPhotoUri = await pickImageUriFromGallery();
    if (nextPhotoUri) {
      setOperatorPhotoUri(nextPhotoUri);
    }
  }, [pickImageUriFromGallery]);

  const handleOperatorPhotoPress = useCallback(() => {
    if (!operatorPhotoUri) {
      pickOperatorPhotoFromGallery().catch(() => {
        Alert.alert('Foto non caricata', 'Non sono riuscito ad aprire la galleria. Riprova.');
      });
      return;
    }

    Alert.alert('Foto operatore', 'Puoi cambiare o rimuovere la foto di questo operatore.', [
      {
        text: 'Scegli nuova',
        onPress: () => {
          pickOperatorPhotoFromGallery().catch(() => {
            Alert.alert('Foto non caricata', 'Non sono riuscito ad aprire la galleria. Riprova.');
          });
        },
      },
      {
        text: 'Rimuovi foto',
        style: 'destructive',
        onPress: () => setOperatorPhotoUri(''),
      },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }, [operatorPhotoUri, pickOperatorPhotoFromGallery]);

  const handleOperatorListPhotoPress = useCallback(
    (item: OperatoreItem) => {
      const applyPhotoUri = (nextPhotoUri?: string) => {
        setOperatori((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, fotoUri: nextPhotoUri || undefined } : currentItem
          )
        );
      };

      if (!item.fotoUri) {
        pickImageUriFromGallery()
          .then((nextPhotoUri) => {
            if (nextPhotoUri) {
              applyPhotoUri(nextPhotoUri);
            }
          })
          .catch(() => {
            Alert.alert('Foto non caricata', 'Non sono riuscito ad aprire la galleria. Riprova.');
          });
        return;
      }

      Alert.alert('Foto operatore', `Vuoi cambiare o rimuovere la foto di ${item.nome}?`, [
        {
          text: 'Cambia foto',
          onPress: () => {
            pickImageUriFromGallery()
              .then((nextPhotoUri) => {
                if (nextPhotoUri) {
                  applyPhotoUri(nextPhotoUri);
                }
              })
              .catch(() => {
                Alert.alert('Foto non caricata', 'Non sono riuscito ad aprire la galleria. Riprova.');
              });
          },
        },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: () => applyPhotoUri(undefined),
        },
        { text: 'Annulla', style: 'cancel' },
      ]);
    },
    [pickImageUriFromGallery, setOperatori]
  );

  const salvaServizio = () => {
    if (!canSubmit) return;

    const isEditingService = !!servizioInModifica;
    const valorePrezzo = Number(prezzo.replace(',', '.'));
    const valorePrezzoOriginale = prezzoOriginale.trim()
      ? Number(prezzoOriginale.replace(',', '.'))
      : null;
    const durataMinuti = parseDurataInput(durata);
    const nomeNormalizzato = normalizeServiceName(nome);

    if (
      Number.isNaN(valorePrezzo) ||
      (valorePrezzoOriginale !== null && Number.isNaN(valorePrezzoOriginale)) ||
      durataMinuti === null ||
      Number.isNaN(durataMinuti) ||
      durataMinuti <= 0
    ) {
      return;
    }

    const duplicato = servizi.some(
      (item) =>
        item.id !== servizioInModifica &&
        normalizeServiceName(item.nome) === nomeNormalizzato
    );

    if (duplicato) {
      Alert.alert(
        tApp(appLanguage, 'services_duplicate_title'),
        tApp(appLanguage, 'services_duplicate_body')
      );
      return;
    }

    const nextPrezzoOriginale =
      valorePrezzoOriginale !== null && valorePrezzoOriginale > valorePrezzo
        ? valorePrezzoOriginale
        : undefined;
    const hasAnyDiscountDate =
      serviceDiscountStartDate.trim() !== '' || serviceDiscountEndDate.trim() !== '';
    const hasCompleteDiscountDateRange =
      isIsoDateInput(serviceDiscountStartDate) && isIsoDateInput(serviceDiscountEndDate);

    if (hasDiscountModuleEnabled && hasAnyDiscountDate && !hasCompleteDiscountDateRange) {
      Alert.alert(
        'Periodo sconto incompleto',
        'Se vuoi impostare la validita dello sconto devi selezionare sia la data inizio che la data fine.'
      );
      return;
    }

    if (
      hasDiscountModuleEnabled &&
      hasCompleteDiscountDateRange &&
      serviceDiscountStartDate.trim() > serviceDiscountEndDate.trim()
    ) {
      Alert.alert(
        'Periodo sconto non valido',
        'La data fine dello sconto deve essere uguale o successiva alla data inizio.'
      );
      return;
    }

    const nextDiscountStartDate =
      nextPrezzoOriginale && hasCompleteDiscountDateRange ? serviceDiscountStartDate.trim() : undefined;
    const nextDiscountEndDate =
      nextPrezzoOriginale && hasCompleteDiscountDateRange ? serviceDiscountEndDate.trim() : undefined;
    const nextMestiereRichiesto = mestiereRichiesto.trim();

    if (!nextMestiereRichiesto) {
      Alert.alert(
        'Mestiere obbligatorio',
        'Per salvare il servizio devi selezionare o scrivere il mestiere richiesto.'
      );
      return;
    }

    const currentSlotInterval = Math.max(15, availabilitySettings.slotIntervalMinutes || 30);
    const compatibleSlotIntervals = SLOT_INTERVAL_OPTIONS.filter(
      (option) => durataMinuti % option === 0
    );
    const suggestedSlotInterval = compatibleSlotIntervals[0] ?? null;
    const lowerCompatibleDuration =
      Math.floor(durataMinuti / currentSlotInterval) * currentSlotInterval;
    const upperCompatibleDuration =
      Math.ceil(durataMinuti / currentSlotInterval) * currentSlotInterval;

    if (durataMinuti % currentSlotInterval !== 0) {
      const mismatchMessage =
        suggestedSlotInterval !== null
          ? `Hai gli slot impostati a ${currentSlotInterval} min, ma questo servizio dura ${durataMinuti} min. Cosi va fuori griglia slot e non puo essere salvato.\n\nPrima cambia il passo slot a ${suggestedSlotInterval} min nella configurazione agenda, poi salva il servizio.`
          : `Hai gli slot impostati a ${currentSlotInterval} min, ma questo servizio dura ${durataMinuti} min. Cosi va fuori griglia slot e non puo essere salvato.\n\nTi conviene cambiare la durata del servizio a ${lowerCompatibleDuration > 0 ? lowerCompatibleDuration : currentSlotInterval} min oppure ${upperCompatibleDuration} min.`;

      Alert.alert('Durata fuori griglia slot', mismatchMessage);
      return;
    }

    if (servizioInModifica) {
      setServizi(
        servizi.map((item) =>
          item.id === servizioInModifica
            ? {
                ...item,
                nome: nome.trim(),
                prezzo: valorePrezzo,
                prezzoOriginale: nextPrezzoOriginale,
                scontoValidoDal: nextDiscountStartDate,
                scontoValidoAl: nextDiscountEndDate,
                durataMinuti,
                mestiereRichiesto: nextMestiereRichiesto,
                macchinarioIds: [],
              }
            : item
        )
      );
    } else {
      setServizi([
        {
          id: buildUniqueEntityId('servizio'),
          nome: nome.trim(),
          prezzo: valorePrezzo,
          prezzoOriginale: nextPrezzoOriginale,
          scontoValidoDal: nextDiscountStartDate,
          scontoValidoAl: nextDiscountEndDate,
          durataMinuti,
          mestiereRichiesto: nextMestiereRichiesto,
          macchinarioIds: [],
        },
        ...servizi,
      ]);
    }

    const missingOperatorWarning = shouldWarnAboutMissingOperatorsForRole({
      roleName: nextMestiereRichiesto,
      services: servizioInModifica
        ? servizi.map((item) =>
            item.id === servizioInModifica
              ? { ...item, mestiereRichiesto: nextMestiereRichiesto }
              : item
          )
        : [
            ...servizi,
            {
              id: '__preview__',
              nome: nome.trim(),
              prezzo: valorePrezzo,
              durataMinuti,
              mestiereRichiesto: nextMestiereRichiesto,
            },
          ],
      operators: operatori,
    });

    resetForm();

    if (!isEditingService) {
      Alert.alert(
        'Servizio aggiunto',
        missingOperatorWarning
          ? `Servizio inserito correttamente.\n\nOperatore da collegare:\nHai salvato il servizio con mestiere "${nextMestiereRichiesto}" in un salone con più mestieri, ma non esiste ancora nessun operatore con quel mestiere. Se non lo imposti, dal frontend il cliente potrebbe non trovare slot prenotabili.`
          : 'Servizio inserito correttamente.'
      );
    }
  };

  const avviaModifica = (item: ServizioItem) => {
    closeAllSwipeables();
    Keyboard.dismiss();
    setServizioInModifica(item.id);
    setNome(item.nome);
    setPrezzo(item.prezzo.toString());
    setPrezzoOriginale(item.prezzoOriginale ? item.prezzoOriginale.toString() : '');
    setServiceDiscountStartDate(item.scontoValidoDal ?? '');
    setServiceDiscountEndDate(item.scontoValidoAl ?? '');
    setDurata(String(item.durataMinuti ?? 60));
    setMestiereRichiesto(item.mestiereRichiesto ?? '');
    setSelectedServiceMachineryIds([]);
    setServiceCustomRoleOpen(!!item.mestiereRichiesto);
    setServiceRolePickerOpen(false);
    setIsServiceFormExpanded(true);
    setTimeout(() => {
      scrollToField(serviceNameRef);
      focusField(serviceNameRef);
    }, 180);
  };

  const salvaOperatore = () => {
    if (!canSubmitOperatore) return;

    const normalizedOperatorName = normalizeOperatorName(nomeOperatore);
    const duplicateOperator = operatori.some(
      (item) =>
        item.id !== operatoreInModifica &&
        normalizeOperatorName(item.nome) === normalizedOperatorName
    );

    if (duplicateOperator) {
      Alert.alert(
        tApp(appLanguage, 'services_operator_duplicate_title'),
        tApp(appLanguage, 'services_operator_duplicate_body')
      );
      return;
    }

    if (!hasMatchingServiceTarget(mestiereOperatore.trim())) {
      Alert.alert(
        'Target servizio mancante',
        'Puoi salvare questo operatore solo se esiste già almeno un servizio con lo stesso target/mestiere scritto in modo identico.'
      );
      return;
    }

    if (operatoreInModifica) {
      setOperatori((current) =>
        current.map((item) =>
          item.id === operatoreInModifica
            ? {
                ...item,
                nome: nomeOperatore.trim(),
                mestiere: mestiereOperatore.trim(),
                fotoUri: operatorPhotoUri.trim() || undefined,
                availability: {
                  enabledWeekdays: [...operatorEnabledWeekdays].sort(
                    (first, second) => first - second
                  ),
                  dateRanges: operatorAvailabilityRanges,
                },
              }
            : item
        )
      );
      Alert.alert('Operatore aggiornato', 'Operatore salvato correttamente.');
    } else {
      setOperatori((current) => [
        {
          id: `operatore-${Date.now()}`,
          nome: nomeOperatore.trim(),
          mestiere: mestiereOperatore.trim(),
          fotoUri: operatorPhotoUri.trim() || undefined,
          availability: {
            enabledWeekdays: [...operatorEnabledWeekdays].sort(
              (first, second) => first - second
            ),
            dateRanges: operatorAvailabilityRanges,
          },
        },
        ...current,
      ]);
      Alert.alert('Operatore aggiunto', 'Operatore inserito correttamente.');
    }

    resetOperatoreForm();
  };

  const avviaModificaOperatore = (item: OperatoreItem) => {
    closeAllSwipeables();
    Keyboard.dismiss();
    setOperatoreInModifica(item.id);
    setNomeOperatore(item.nome);
    setMestiereOperatore(item.mestiere);
    setOperatorPhotoUri(item.fotoUri ?? '');
    setOperatorCustomRoleOpen(true);
    setOperatorRolePickerOpen(false);
    setOperatorEnabledWeekdays(
      item.availability?.enabledWeekdays ?? DEFAULT_OPERATOR_WEEKDAY_VALUES
    );
    setOperatorAvailabilityRanges(item.availability?.dateRanges ?? []);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
    setDatePickerTarget(null);
    setIsOperatorFormExpanded(true);
    setTimeout(() => {
      scrollToField(operatorNameRef);
      focusField(operatorNameRef);
    }, 180);
  };

  const toggleOperatorWeekday = (weekday: number) => {
    setOperatorEnabledWeekdays((current) => {
      const exists = current.includes(weekday);
      if (exists && current.length === 1) {
        return current;
      }

      return exists
        ? current.filter((item) => item !== weekday)
        : [...current, weekday].sort((first, second) => first - second);
    });
  };

  const addOperatorAvailabilityRange = () => {
    if (!canAddAvailabilityRange) return;

    setOperatorAvailabilityRanges((current) => [
      ...current,
      {
        id: `range-${Date.now()}`,
        startDate: availabilityStartDate.trim(),
        endDate: availabilityEndDate.trim(),
      },
    ]);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
  };

  const removeOperatorAvailabilityRange = (id: string) => {
    setOperatorAvailabilityRanges((current) => current.filter((item) => item.id !== id));
  };

  const salvaMacchinario = () => {
    if (!canSubmitMacchinario) return;

    const normalizedMachineryName = normalizeMachineryName(nomeMacchinario);
    const duplicateMachinery = macchinari.some(
      (item) => normalizeMachineryName(item.nome) === normalizedMachineryName
    );

    if (duplicateMachinery) {
      Alert.alert(
        'Macchinario duplicato',
        'Esiste gia un macchinario con questo nome. Usa un nome diverso o aggiorna quello esistente.'
      );
      return;
    }

    setMacchinari((current) => [
      {
        id: `macchinario-${Date.now()}`,
        nome: nomeMacchinario.trim(),
        mestiereRichiesto: mestiereMacchinario.trim(),
        categoria: categoriaMacchinario.trim(),
        note: noteMacchinario.trim(),
        attivo: true,
      },
      ...current,
    ]);

    resetMacchinarioForm();
  };

  const toggleMacchinarioAttivo = (id: string) => {
    setMacchinari((current) =>
      current.map((item) =>
        item.id === id ? { ...item, attivo: item.attivo === false ? true : false } : item
      )
    );
  };

  const eliminaMacchinario = (id: string) => {
    const macchinario = macchinari.find((item) => item.id === id);
    if (!macchinario) return;

    Alert.alert(
      'Elimina macchinario',
      `Vuoi rimuovere ${macchinario.nome} dalla configurazione servizi?`,
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'common_delete'),
          style: 'destructive',
          onPress: () => {
            setMacchinari((current) => current.filter((item) => item.id !== id));
            setServizi((current) =>
              current.map((item) => ({
                ...item,
                macchinarioIds: (item.macchinarioIds ?? []).filter((entry) => entry !== id),
              }))
            );
          },
        },
      ]
    );
  };

  const toggleServiceMachinery = useCallback(
    (machineryId: string) => {
      const machinery = macchinari.find((item) => item.id === machineryId);
      if (!machinery) return;

      if (machinery.attivo === false) {
        Alert.alert(
          'Macchinario disattivo',
          'Riattiva prima questo macchinario se vuoi usarlo dentro il servizio.'
        );
        return;
      }

      setSelectedServiceMachineryIds((current) =>
        current.includes(machineryId)
          ? current.filter((item) => item !== machineryId)
          : [...current, machineryId]
      );
    },
    [macchinari]
  );

  const selectServiceRole = (role: string) => {
    setMestiereRichiesto(role);
    setServiceRolePickerOpen(false);
    setServiceCustomRoleOpen(false);
  };

  const selectOperatorRole = (role: string) => {
    setMestiereOperatore(role);
    setOperatorRolePickerOpen(false);
    setOperatorCustomRoleOpen(false);

    requestAnimationFrame(() => {
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: Math.max(
            0,
            operatorFormOffsetRef.current + (responsive.isDesktop ? 340 : 430)
          ),
          animated: true,
        });
      }, 130);
    });
  };

  const selectMachineryRole = (role: string) => {
    setMestiereMacchinario(role);
    setMachineryRolePickerOpen(false);
    setMachineryCustomRoleOpen(false);
  };

  const currentColorTarget =
    cardColorMode === 'service'
      ? normalizeServiceAccentKey(
          servizi.find((item) => item.id === selectedServiceColorTargetId)?.nome ?? ''
        )
      : normalizeRoleName(selectedRoleColorTarget);

  const currentServiceColorLegacyKey =
    cardColorMode === 'service' ? selectedServiceColorTargetId.trim() : '';

  const clearCardColorOverride = () => {
    if (!currentColorTarget) return;

    if (cardColorMode === 'service') {
      setServiceCardColorOverrides((current) => {
        const next = { ...current };
        delete next[currentColorTarget];
        if (currentServiceColorLegacyKey) {
          delete next[currentServiceColorLegacyKey];
        }
        return next;
      });
      return;
    }

    setRoleCardColorOverrides((current) => {
      const next = { ...current };
      delete next[currentColorTarget];
      return next;
    });
  };

  const resetAutomaticServiceColors = useCallback(() => {
    setCardColorMode('service');
    setSelectedRoleColorTarget('');
    setSelectedServiceColorTargetId('');
    setRoleCardColorOverrides({});
    setServiceCardColorOverrides({});
  }, [setRoleCardColorOverrides, setServiceCardColorOverrides]);

  const handleProtectedResetPress = useCallback(() => {
    Alert.alert(
      'Reset protetto',
      'Per evitare reset accidentali, tieni premuto il pulsante per ripristinare i colori automatici.'
    );
  }, []);

  const selectedColorPreview = useMemo(() => {
    if (!currentColorTarget) return '';

    return cardColorMode === 'service'
      ? serviceCardColorOverrides[currentColorTarget] ??
          (currentServiceColorLegacyKey
            ? serviceCardColorOverrides[currentServiceColorLegacyKey] ?? ''
            : '')
      : roleCardColorOverrides[currentColorTarget] ?? '';
  }, [
    cardColorMode,
    currentColorTarget,
    currentServiceColorLegacyKey,
    roleCardColorOverrides,
    serviceCardColorOverrides,
  ]);

  const applyCardColorOverride = (hex: string) => {
    if (!currentColorTarget) return;

    if (cardColorMode === 'service') {
      setServiceCardColorOverrides((current) => ({
        ...current,
        [currentColorTarget]: hex,
        ...(currentServiceColorLegacyKey ? { [currentServiceColorLegacyKey]: hex } : {}),
      }));
      return;
    }

    setRoleCardColorOverrides((current) => ({
      ...current,
      [currentColorTarget]: hex,
    }));
  };

  const eliminaOperatore = (id: string) => {
    const operatoreDaEliminare = operatori.find((item) => item.id === id);
    if (!operatoreDaEliminare) return;

    const normalizedOperatorName = normalizeOperatorName(operatoreDaEliminare.nome);
    const today = getTodayDateString();
    const appuntamentiCollegati = appuntamenti.filter(
      (item) =>
        item.operatoreId === id ||
        normalizeOperatorName(item.operatoreNome ?? '') === normalizedOperatorName
    );
    const appuntamentiFuturiCollegati = appuntamentiCollegati.filter(
      (item) => (item.data ?? today) >= today
    );
    const richiesteCollegate = richiestePrenotazione.filter(
      (item) =>
        item.stato !== 'Rifiutata' &&
        (item.operatoreId === id ||
          normalizeOperatorName(item.operatoreNome ?? '') === normalizedOperatorName)
    );
    const richiesteAccettateFutureCollegate = richiesteCollegate.filter(
      (item) => item.stato === 'Accettata' && (item.data ?? today) >= today
    );
    const hasLinkedEntries =
      appuntamentiCollegati.length > 0 || richiesteCollegate.length > 0;
    const hasFutureEntries =
      appuntamentiFuturiCollegati.length > 0 || richiesteAccettateFutureCollegate.length > 0;

    Alert.alert(
      tApp(appLanguage, 'services_operator_delete_title'),
      hasFutureEntries
        ? `${operatoreDaEliminare.nome} verra rimosso dagli operatori attivi. Gli appuntamenti e le richieste gia salvati resteranno nello storico e in agenda come corsia orfana finche non li riassegni o li chiudi.`
        : hasLinkedEntries
          ? tApp(appLanguage, 'services_operator_delete_body_linked', {
              operatorName: operatoreDaEliminare.nome,
            })
        : tApp(appLanguage, 'services_operator_delete_body_simple', {
            operatorName: operatoreDaEliminare.nome,
          }),
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'common_delete'),
          style: 'destructive',
          onPress: () => {
            setOperatori((current) => current.filter((item) => item.id !== id));
            if (operatoreInModifica === id) {
              resetOperatoreForm();
            }
          },
        },
      ]
    );
  };

  const confermaElimina = (item: ServizioItem) => {
    const nomeServizio = normalizeServiceName(item.nome);
    const appuntamentiCollegati = appuntamenti.filter(
      (entry) => normalizeServiceName(entry.servizio) === nomeServizio
    );
    const richiesteCollegate = richiestePrenotazione.filter(
      (entry) =>
        normalizeServiceName(entry.servizio) === nomeServizio && entry.stato !== 'Rifiutata'
    );

    const hasLinkedBookings =
      appuntamentiCollegati.length > 0 || richiesteCollegate.length > 0;

    Alert.alert(
      tApp(appLanguage, 'services_delete_title'),
      hasLinkedBookings
        ? tApp(appLanguage, 'services_delete_body_linked', { serviceName: item.nome })
        : tApp(appLanguage, 'services_delete_body_simple', { serviceName: item.nome }),
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'agenda_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            setServizi(servizi.filter((servizio) => servizio.id !== item.id));
            if (servizioInModifica === item.id) {
              resetForm();
            }
          },
        },
      ]
    );
  };

  const quickNotesCard = (
    <View style={styles.formCard}>
      <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {tApp(appLanguage, 'services_quick_notes')}
      </Text>
      <Text style={styles.helperTextInline}>
        {tApp(appLanguage, 'services_notes_duration')}
      </Text>
      <Text style={styles.helperTextInline}>
        {tApp(appLanguage, 'services_notes_swipe')}
      </Text>
      <Text style={styles.helperTextInline}>
        {tApp(appLanguage, 'services_notes_existing')}
      </Text>
      <Text style={styles.helperTextInline}>
        {tApp(appLanguage, 'services_notes_discount')}
      </Text>
      <Text style={styles.helperTextInline}>
        {tApp(appLanguage, 'services_notes_operator_match')}
      </Text>
      <Text style={styles.helperTextInline}>
        Ogni mestiere attivo deve avere almeno un operatore compatibile, altrimenti l&apos;avviso giallo resta visibile.
      </Text>
      <Text style={styles.helperTextInline}>
        Se aggiungi dopo un operatore per un mestiere, anche gli appuntamenti vecchi nati come salone vengono riallineati automaticamente a lui.
      </Text>
      <Text style={styles.helperTextInline}>
        In agenda resta sempre una sola colonna libera oltre quelle occupate, per lasciare spazio a nuovi inserimenti senza aprire rami vuoti in eccesso.
      </Text>
      <Text style={styles.helperTextInline}>
        I colori card personalizzati per servizio o mestiere ora restano salvati anche dopo la sincronizzazione del portale cliente.
      </Text>
    </View>
  );

  const multiRoleNoOperatorWarningCard = shouldShowRoleAlignmentWarning ? (
    <View style={[styles.formCard, styles.warningCard]}>
      <Text style={styles.cardTitle} adjustsFontSizeToFit minimumFontScale={0.72}>
        Attenzione allineamento mestieri
      </Text>
      {shouldShowMultiRoleNoOperatorWarning ? (
        <Text style={styles.warningCardText}>
          Finche anche un solo mestiere attivo non ha almeno un operatore compatibile assegnato,
          questo avviso resta visibile.
        </Text>
      ) : null}
      {roleCoverageSummary.coveredRoles.length > 0 ? (
        <Text style={styles.warningCardText}>
          Mestieri gia coperti: {roleCoverageSummary.coveredRoles
            .map((role) => {
              const count = roleCoverageSummary.operatorCountByRole.get(role) ?? 0;
              return `${role} (${count})`;
            })
            .join(' · ')}.
        </Text>
      ) : null}
      {missingOperatorRoles.length > 0 ? (
        <Text style={styles.warningCardText}>
          Mestieri ancora scoperti: {missingOperatorRoles.join(' · ')}.
        </Text>
      ) : null}
      {orphanOperatorRoles.length > 0 ? (
        <Text style={styles.warningCardText}>
          Operatori assegnati a mestieri non piu presenti nei servizi: {orphanOperatorRoles
            .map((role) => `${role} (${roleCoverageSummary.operatorCountByRole.get(role) ?? 0})`)
            .join(' · ')}.
        </Text>
      ) : null}
      {missingOperatorRoles.length > 0 ? (
        <Text style={styles.warningCardText}>
          Se un mestiere resta scoperto, il ramo frontend puo esistere comunque come salone: quindi
          hai piu rami prenotabili ma meno operatori effettivi. Meglio assegnare un operatore per
          ogni mestiere attivo.
        </Text>
      ) : null}
      {orphanOperatorRoles.length > 0 ? (
        <Text style={styles.warningCardText}>
          Se cancelli un mestiere dai servizi ma lasci operatori collegati a quel mestiere, conviene
          riallinearli o cambiare il loro mestiere per evitare configurazioni incoerenti.
        </Text>
      ) : null}
    </View>
  ) : null;

  const operatorsListCard = (
    <View style={styles.formCard}>
      <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        Lista Operatori
      </Text>
      <Animated.View layout={LinearTransition.duration(180)} style={styles.operatorsList}>
        {operatori.length === 0 ? (
          <Text style={styles.helperTextInline}>
            {tApp(appLanguage, 'services_no_operators')}
          </Text>
        ) : (
          operatori.map((item) => {
            const normalizedRole = normalizeRoleName(item.mestiere);
            const roleOverride = roleCardColorOverrides[normalizedRole];
            const accent = roleOverride
              ? getCustomAccent(roleOverride)
              : getServiceAccentByMeta({ roleName: item.mestiere });

            return (
              <Animated.View
                key={item.id}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(150)}
                layout={LinearTransition.duration(180)}
              >
                <Swipeable
                  ref={(ref) => {
                    swipeableRefs.current[`operator-${item.id}`] = ref;
                  }}
                  renderRightActions={() => (
                    <View style={styles.swipeActions}>
                      <HapticTouchable
                        style={styles.editSwipeAction}
                        onPress={() => avviaModificaOperatore(item)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.editSwipeText}>Modifica</Text>
                      </HapticTouchable>

                      <HapticTouchable
                        style={styles.deleteSwipeAction}
                        onPress={() => eliminaOperatore(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.deleteSwipeText}>Elimina</Text>
                      </HapticTouchable>
                    </View>
                  )}
                  friction={1.05}
                  overshootRight={false}
                  overshootFriction={10}
                  dragOffsetFromRightEdge={10}
                  rightThreshold={28}
                >
                  <View
                    style={[
                      styles.operatorCard,
                      {
                        backgroundColor: accent.bg,
                        borderColor: accent.border,
                      },
                    ]}
                  >
                    <View style={styles.operatorCardMainRow}>
                      <View style={styles.operatorCardTextWrap}>
                        <Text
                          style={[styles.operatorName, { color: accent.text }]}
                          numberOfLines={1}
                        >
                          {item.nome}
                        </Text>
                        <Animated.Text
                          entering={FadeIn.duration(170)}
                          style={[styles.operatorRole, { color: accent.text }]}
                          numberOfLines={1}
                        >
                          {formatRoleLabelForDisplay(item.mestiere)}
                        </Animated.Text>
                        <Text style={[styles.operatorAvailabilitySummary, { color: accent.text }]}>
                          {formatAvailabilitySummary(item)}
                        </Text>
                      </View>
                      <View
                        style={[styles.operatorPhotoActionButton, { borderColor: accent.border }]}
                      >
                        {item.fotoUri ? (
                          <Image source={{ uri: item.fotoUri }} style={styles.operatorPhotoActionImage} />
                        ) : (
                          <Ionicons name="person" size={34} color={accent.text} />
                        )}
                        <HapticTouchable
                          style={[styles.operatorPhotoActionPlusBadge, { backgroundColor: accent.text }]}
                          onPress={() => handleOperatorListPhotoPress(item)}
                          activeOpacity={0.92}
                        >
                          <Ionicons
                            name={item.fotoUri ? 'create-outline' : 'add'}
                            size={15}
                            color="#ffffff"
                          />
                        </HapticTouchable>
                      </View>
                    </View>
                    <View style={styles.operatorCardBottomRow}>
                      <View style={styles.operatorSwipeHintWrap}>
                        <Ionicons name="arrow-back" size={14} color={accent.text} />
                        <Text style={[styles.operatorSwipeHintText, { color: accent.text }]}>
                          Scorri per modificare o eliminare
                        </Text>
                      </View>
                    </View>
                  </View>
                </Swipeable>
              </Animated.View>
            );
          })
        )}
      </Animated.View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={sortedServizi}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          closeAllSwipeables();
        }}
        columnWrapperStyle={styles.serviceGridRow}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="servizi"
                title={tApp(appLanguage, 'tab_services')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
              />

              <View style={styles.heroStatsRow}>
                <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition.duration(180)} style={styles.heroStatCardBlue}>
                  <Text style={styles.heroStatNumber}>{servizi.length}</Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'services_active')}</Text>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.duration(180)} style={styles.heroStatCardRose}>
                  <Text style={styles.heroStatNumber}>
                    € {(servizi[0]?.prezzo ?? 0).toFixed(0)}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'services_last_price')}</Text>
                </Animated.View>
              </View>
              <Text style={styles.subtitle}>{tApp(appLanguage, 'services_subtitle')}</Text>
            </View>

            <View
              style={[
                styles.desktopTopGrid,
                !responsive.isDesktop && styles.desktopTopGridStack,
              ]}
            >
              <View
                style={[styles.formCard, responsive.isDesktop && styles.desktopLeftPane]}
                onLayout={(event) => {
                  serviceFormOffsetRef.current = event.nativeEvent.layout.y;
                }}
              >
                <HapticTouchable
                  style={styles.expandHeaderButton}
                  onPress={() => {
                    runSoftLayoutAnimation();
                    setIsServiceFormExpanded((current) => !current);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    Aggiungi Servizi
                  </Text>
                  <View style={styles.expandHeaderChevron}>
                    <AnimatedChevron expanded={isServiceFormExpanded} />
                  </View>
                </HapticTouchable>

                {isServiceFormExpanded ? (
                  <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(180)}>

              <ClearableTextInput
                ref={serviceNameRef}
                style={styles.input}
                placeholder={tApp(appLanguage, 'services_name_placeholder')}
                placeholderTextColor="#9a9a9a"
                value={nome}
                onChangeText={setNome}
                onFocus={() => scrollToField(serviceNameRef)}
                returnKeyType="next"
                onSubmitEditing={() =>
                  serviceCustomRoleOpen
                    ? focusField(serviceCustomRoleRef)
                    : openServicePricePicker()
                }
                blurOnSubmit={!serviceCustomRoleOpen}
                  />

                  <HapticTouchable
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setServiceNumberPickerTarget('price')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !prezzo && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {formatNumericFieldLabel('Prezzo', prezzo, prezzo ? ' €' : '')}
                    </Text>
                  </HapticTouchable>

                  <HapticTouchable
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setServiceNumberPickerTarget('duration')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !durata && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {formatNumericFieldLabel('Durata', durata, durata ? ' min' : '')}
                    </Text>
                  </HapticTouchable>

                  <HapticTouchable
                    style={[styles.input, styles.roleSelectorInput]}
                    onPress={openServiceRolePicker}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.roleSelectorText,
                        !mestiereRichiesto && styles.roleSelectorPlaceholder,
                      ]}
                    >
                      {mestiereRichiesto || tApp(appLanguage, 'services_required_role_placeholder')}
                    </Text>
                    <Text style={styles.roleSelectorChevron}>
                      {serviceRolePickerOpen ? '▴' : '▾'}
                    </Text>
                  </HapticTouchable>

                  {serviceRolePickerOpen ? (
                    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(180)} style={styles.rolePickerPanel}>
                      <Text style={styles.rolePickerTitle}>Mestieri suggeriti</Text>
                      <View style={styles.roleChipsWrap}>
                        {roleOptions.map((role) => {
                          const selected =
                            normalizeRoleName(role) === normalizeRoleName(mestiereRichiesto);
                          return (
                            <HapticTouchable
                              key={`service-role-${role}`}
                              style={[styles.roleChip, selected && styles.roleChipSelected]}
                              onPress={() => selectServiceRole(role)}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  styles.roleChipText,
                                  selected && styles.roleChipTextSelected,
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                              >
                                {role}
                              </Text>
                            </HapticTouchable>
                          );
                        })}
                        <HapticTouchable
                          style={[styles.roleChip, styles.roleChipCreate]}
                          onPress={() => {
                            runSoftLayoutAnimation();
                            setServiceCustomRoleOpen(true);
                            setServiceRolePickerOpen(false);
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.roleChipCreateText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>+ Crea nuovo mestiere</Text>
                        </HapticTouchable>
                      </View>
                    </Animated.View>
                  ) : null}

                  {serviceCustomRoleOpen ? (
                    <ClearableTextInput
                      ref={serviceCustomRoleRef}
                      style={styles.input}
                      placeholder="Nuovo mestiere personalizzato"
                      placeholderTextColor="#9a9a9a"
                      value={mestiereRichiesto}
                      onChangeText={setMestiereRichiesto}
                      onFocus={() => scrollToField(serviceCustomRoleRef)}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  ) : null}

                  <View style={styles.discountFieldRow}>
                    <HapticTouchable
                      style={[styles.input, styles.numericPickerField, styles.discountFieldMain]}
                      onPress={() => setServiceNumberPickerTarget('originalPrice')}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.numericPickerFieldText,
                          !prezzoOriginale && styles.numericPickerFieldPlaceholder,
                        ]}
                      >
                        {formatNumericFieldLabel(
                          'Prezzo pieno opzionale sconto',
                          prezzoOriginale,
                          prezzoOriginale ? ' €' : ''
                        )}
                      </Text>
                    </HapticTouchable>

                    {prezzoOriginale ? (
                      <HapticTouchable
                        style={styles.discountFieldClearButton}
                        onPress={() => {
                          setPrezzoOriginale('');
                          setServiceDiscountStartDate('');
                          setServiceDiscountEndDate('');
                        }}
                        activeOpacity={0.9}
                        hapticType="error"
                      >
                        <Text style={styles.discountFieldClearButtonText}>X</Text>
                      </HapticTouchable>
                    ) : null}
                  </View>

                  {hasDiscountModuleEnabled ? (
                    <Animated.View
                      entering={FadeIn.duration(180)}
                      exiting={FadeOut.duration(150)}
                      layout={LinearTransition.duration(180)}
                      style={styles.serviceDiscountValidityPanel}
                    >
                      <Text style={styles.rolePickerTitle}>Validita sconto (facoltativa)</Text>
                      <Text style={styles.helperTextInline}>
                        Se imposti queste date, lo sconto resta valido solo nel periodo selezionato.
                      </Text>

                      <View
                        style={[
                          styles.operatorAvailabilityRangeRow,
                          !responsive.isDesktop && styles.operatorAvailabilityRangeColumn,
                        ]}
                      >
                        <HapticTouchable
                          style={[
                            styles.input,
                            styles.operatorAvailabilityInput,
                            styles.operatorAvailabilityDateButton,
                            !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                          ]}
                          onPress={() => setDatePickerTarget('discount-start')}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.operatorAvailabilityDateButtonText,
                              !serviceDiscountStartDate &&
                                styles.operatorAvailabilityDateButtonPlaceholder,
                            ]}
                          >
                            {serviceDiscountStartDate
                              ? formatPickerButtonLabel('Dal', serviceDiscountStartDate)
                              : 'Inizio validita sconto'}
                          </Text>
                        </HapticTouchable>

                        <HapticTouchable
                          style={[
                            styles.input,
                            styles.operatorAvailabilityInput,
                            styles.operatorAvailabilityDateButton,
                            !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                          ]}
                          onPress={() => setDatePickerTarget('discount-end')}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.operatorAvailabilityDateButtonText,
                              !serviceDiscountEndDate &&
                                styles.operatorAvailabilityDateButtonPlaceholder,
                            ]}
                          >
                            {serviceDiscountEndDate
                              ? formatPickerButtonLabel('Al', serviceDiscountEndDate)
                              : 'Fine validita sconto'}
                          </Text>
                        </HapticTouchable>
                      </View>
                    </Animated.View>
                  ) : null}

                  <HapticTouchable
                    style={styles.buttonLightDanger}
                    onPress={resetForm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonLightDangerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      Svuota campi
                    </Text>
                  </HapticTouchable>

                  <View ref={serviceSubmitButtonRef} collapsable={false}>
                    <HapticTouchable
                      style={[styles.buttonDark, !canSubmit && styles.buttonDisabled]}
                      onPress={salvaServizio}
                      activeOpacity={0.9}
                      disabled={!canSubmit}
                    >
                      <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                        {servizioInModifica
                          ? tApp(appLanguage, 'services_save_changes')
                          : tApp(appLanguage, 'services_add')}
                      </Text>
                    </HapticTouchable>
                  </View>

                {servizioInModifica ? (
                  <HapticTouchable
                    style={styles.buttonLight}
                    onPress={resetForm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonLightText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'services_cancel_edit')}</Text>
                  </HapticTouchable>
                ) : null}
                  </Animated.View>
                ) : null}

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'price'}
                  title="Prezzo servizio"
                  initialValue={prezzo ? Number(prezzo.replace(',', '.')) : 25}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setPrezzo(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={0}
                  max={500}
                  step={1}
                  gridStep={1}
                  decimals={0}
                  suffix=" €"
                  presets={[15, 20, 25, 30, 35, 40, 50, 60, 80, 100]}
                />

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'originalPrice'}
                  title="Prezzo pieno"
                  initialValue={prezzoOriginale ? Number(prezzoOriginale.replace(',', '.')) : 35}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setPrezzoOriginale(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={0}
                  max={500}
                  step={1}
                  gridStep={1}
                  decimals={0}
                  suffix=" €"
                  presets={[20, 25, 30, 35, 40, 50, 60, 80, 100, 120]}
                />

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'duration'}
                  title="Durata servizio"
                  initialValue={durata ? Number(durata) : 60}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setDurata(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={15}
                  max={360}
                  step={15}
                  gridStep={1}
                  decimals={0}
                  suffix=" min"
                  presets={[15, 30, 45, 60, 75, 90, 120, 150, 180]}
                />
              </View>

              <View
                style={[styles.formCard, responsive.isDesktop && styles.desktopRightPane]}
                onLayout={(event) => {
                  operatorFormOffsetRef.current = event.nativeEvent.layout.y;
                }}
              >
                <HapticTouchable
                  style={styles.expandHeaderButton}
                  onPress={() => {
                    runSoftLayoutAnimation();
                    setIsOperatorFormExpanded((current) => !current);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    Aggiungi Operatori
                  </Text>
                  <View style={styles.expandHeaderChevron}>
                    <AnimatedChevron expanded={isOperatorFormExpanded} />
                  </View>
                </HapticTouchable>

                {isOperatorFormExpanded ? (
                  <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(180)}>
                <Text style={styles.helperTextInline}>
                  {tApp(appLanguage, 'services_operators_hint')}
                </Text>
                <View style={styles.operatorPhotoEditorButton}>
                  <View style={styles.operatorPhotoEditorAvatarWrap}>
                    <View style={styles.operatorPhotoEditorAvatar}>
                      {operatorPhotoUri ? (
                        <Image source={{ uri: operatorPhotoUri }} style={styles.operatorPhotoEditorAvatarImage} />
                      ) : (
                        <Ionicons name="person" size={34} color="#0f172a" />
                      )}
                    </View>
                    <HapticTouchable
                      style={styles.operatorPhotoEditorPlusBadge}
                      onPress={handleOperatorPhotoPress}
                      activeOpacity={0.92}
                    >
                      <Ionicons name={operatorPhotoUri ? 'create-outline' : 'add'} size={14} color="#ffffff" />
                    </HapticTouchable>
                  </View>
                  <View style={styles.operatorPhotoEditorTextWrap}>
                    <Text style={styles.operatorPhotoEditorTitle}>
                      {operatorPhotoUri ? 'Foto operatore pronta' : 'Aggiungi foto operatore'}
                    </Text>
                    <Text style={styles.operatorPhotoEditorHint}>
                      {operatorPhotoUri
                        ? 'Usa il tasto + per cambiare o rimuovere la foto. La ritaglio in formato quadrato e la adatto al badge.'
                        : 'Usa il tasto + per scegliere una foto dalla galleria e adattarla al badge.'}
                    </Text>
                  </View>
                </View>
                <ClearableTextInput
                  ref={operatorNameRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'services_operator_name_placeholder')}
                  placeholderTextColor="#9a9a9a"
                  value={nomeOperatore}
                  onChangeText={setNomeOperatore}
                  onFocus={() => scrollToField(operatorNameRef)}
                  returnKeyType="next"
                  onSubmitEditing={handleOperatorNameSubmit}
                  blurOnSubmit={!operatorCustomRoleOpen}
                />
                <HapticTouchable
                  style={[styles.input, styles.roleSelectorInput]}
                  onPress={openOperatorRolePicker}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.roleSelectorText,
                      !mestiereOperatore && styles.roleSelectorPlaceholder,
                    ]}
                  >
                    {mestiereOperatore || tApp(appLanguage, 'services_operator_role_placeholder')}
                  </Text>
                  <Text style={styles.roleSelectorChevron}>
                    {operatorRolePickerOpen ? '▴' : '▾'}
                  </Text>
                </HapticTouchable>

                {operatorRolePickerOpen ? (
                  <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(180)} style={styles.rolePickerPanel}>
                    <Text style={styles.rolePickerTitle}>Mestieri disponibili</Text>
                    <View style={styles.roleChipsWrap}>
                      {roleOptions.map((role) => {
                        const selected =
                          normalizeRoleName(role) === normalizeRoleName(mestiereOperatore);
                        return (
                          <HapticTouchable
                            key={`operator-role-${role}`}
                            style={[styles.roleChip, selected && styles.roleChipSelected]}
                            onPress={() => selectOperatorRole(role)}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.roleChipText,
                                selected && styles.roleChipTextSelected,
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.72}
                            >
                              {role}
                            </Text>
                          </HapticTouchable>
                        );
                      })}
                      <HapticTouchable
                        style={[styles.roleChip, styles.roleChipCreate]}
                        onPress={() => {
                          runSoftLayoutAnimation();
                          setOperatorCustomRoleOpen(true);
                          setOperatorRolePickerOpen(false);
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.roleChipCreateText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>+ Crea nuovo mestiere</Text>
                      </HapticTouchable>
                    </View>
                  </Animated.View>
                ) : null}

                {operatorCustomRoleOpen ? (
                  <ClearableTextInput
                    ref={operatorCustomRoleRef}
                    style={styles.input}
                    placeholder="Nuovo mestiere personalizzato"
                    placeholderTextColor="#9a9a9a"
                    value={mestiereOperatore}
                    onChangeText={setMestiereOperatore}
                    onFocus={() => scrollToField(operatorCustomRoleRef)}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                ) : null}

                <View ref={operatorAvailabilityPanelRef} collapsable={false} style={styles.operatorAvailabilityPanel}>
                  <Text style={styles.operatorAvailabilityTitle}>Disponibilita settimanale</Text>
                  <Text style={styles.operatorAvailabilityHint}>
                    Scegli i giorni in cui questo operatore puo comparire in agenda e nelle prenotazioni.
                  </Text>
                  <View style={styles.weekdayChipsWrap}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = operatorEnabledWeekdays.includes(day.value);
                      return (
                        <HapticTouchable
                          key={`weekday-${day.value}`}
                          style={[styles.weekdayChip, selected && styles.weekdayChipActive]}
                          onPress={() => toggleOperatorWeekday(day.value)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.weekdayChipText,
                              selected && styles.weekdayChipTextActive,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                          >
                            {day.label}
                          </Text>
                        </HapticTouchable>
                      );
                    })}
                  </View>

                  <Text style={styles.operatorAvailabilityTitle}>Periodo attivo da-a</Text>
                  <Text style={styles.operatorAvailabilityHint}>
                    Se lasci vuoto, l&apos;operatore resta valido tutto l&apos;anno nei giorni selezionati.
                  </Text>

                  <View
                    style={[
                      styles.operatorAvailabilityRangeRow,
                      !responsive.isDesktop && styles.operatorAvailabilityRangeColumn,
                    ]}
                  >
                    <HapticTouchable
                      style={[
                        styles.input,
                        styles.operatorAvailabilityInput,
                        styles.operatorAvailabilityDateButton,
                        !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                      ]}
                      onPress={() => setDatePickerTarget('start')}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.operatorAvailabilityDateButtonText,
                          !availabilityStartDate && styles.operatorAvailabilityDateButtonPlaceholder,
                        ]}
                      >
                        {availabilityStartDate
                          ? formatPickerButtonLabel('Dal', availabilityStartDate)
                          : 'Seleziona inizio'}
                      </Text>
                    </HapticTouchable>
                    <HapticTouchable
                      style={[
                        styles.input,
                        styles.operatorAvailabilityInput,
                        styles.operatorAvailabilityDateButton,
                        !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                      ]}
                      onPress={() => setDatePickerTarget('end')}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.operatorAvailabilityDateButtonText,
                          !availabilityEndDate && styles.operatorAvailabilityDateButtonPlaceholder,
                        ]}
                      >
                        {availabilityEndDate
                          ? formatPickerButtonLabel('Al', availabilityEndDate)
                          : 'Seleziona fine'}
                      </Text>
                    </HapticTouchable>
                  </View>

                  <HapticTouchable
                    style={[
                      styles.operatorAvailabilityAddButton,
                      !canAddAvailabilityRange && styles.buttonDisabled,
                    ]}
                    onPress={addOperatorAvailabilityRange}
                    activeOpacity={0.9}
                    disabled={!canAddAvailabilityRange}
                  >
                    <Text style={styles.operatorAvailabilityAddText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Aggiungi periodo</Text>
                  </HapticTouchable>

                  {operatorAvailabilityRanges.length > 0 ? (
                    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(180)} style={styles.operatorRangeList}>
                      {operatorAvailabilityRanges.map((range) => (
                        <Animated.View key={range.id} entering={FadeIn.duration(170)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(180)} style={styles.operatorRangeCard}>
                          <Text style={styles.operatorRangeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                            {range.startDate} → {range.endDate}
                          </Text>
                          <HapticTouchable
                            onPress={() => removeOperatorAvailabilityRange(range.id)}
                            activeOpacity={0.9}
                            hapticType="error"
                            style={styles.operatorRangeDelete}
                          >
                            <Text style={styles.operatorRangeDeleteText}>X</Text>
                          </HapticTouchable>
                        </Animated.View>
                      ))}
                    </Animated.View>
                  ) : (
                    <Text style={styles.operatorAvailabilityEmpty}>
                      Nessun periodo specifico: vale tutto l&apos;anno.
                    </Text>
                  )}
                </View>

                <NativeDatePickerModal
                  visible={datePickerTarget !== null}
                  title={
                    datePickerTarget === 'start'
                      ? 'Seleziona data inizio'
                      : datePickerTarget === 'end'
                        ? 'Seleziona data fine'
                        : datePickerTarget === 'discount-start'
                          ? 'Seleziona inizio validita sconto'
                          : 'Seleziona fine validita sconto'
                  }
                  initialValue={
                    datePickerTarget === 'start'
                      ? availabilityStartDate
                      : datePickerTarget === 'end'
                        ? availabilityEndDate
                        : datePickerTarget === 'discount-start'
                          ? serviceDiscountStartDate
                          : datePickerTarget === 'discount-end'
                            ? serviceDiscountEndDate
                        : undefined
                  }
                  onClose={() => setDatePickerTarget(null)}
                  onConfirm={(value) => {
                    if (datePickerTarget === 'start') {
                      setAvailabilityStartDate(value);
                      if (availabilityEndDate && availabilityEndDate < value) {
                        setAvailabilityEndDate(value);
                      }
                    }

                    if (datePickerTarget === 'end') {
                      setAvailabilityEndDate(value);
                      if (availabilityStartDate && availabilityStartDate > value) {
                        setAvailabilityStartDate(value);
                      }
                    }

                    if (datePickerTarget === 'discount-start') {
                      setServiceDiscountStartDate(value);
                      if (serviceDiscountEndDate && serviceDiscountEndDate < value) {
                        setServiceDiscountEndDate(value);
                      }
                    }

                    if (datePickerTarget === 'discount-end') {
                      setServiceDiscountEndDate(value);
                      if (serviceDiscountStartDate && serviceDiscountStartDate > value) {
                        setServiceDiscountStartDate(value);
                      }
                    }

                    setDatePickerTarget(null);
                  }}
                />

                <HapticTouchable
                  style={styles.buttonLightDanger}
                  onPress={resetOperatoreForm}
                  activeOpacity={0.9}
                >
                  <Text style={styles.buttonLightDangerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    Svuota campi
                  </Text>
                </HapticTouchable>

                <HapticTouchable
                  style={[styles.buttonDark, !canSubmitOperatore && styles.buttonDisabled]}
                  onPress={salvaOperatore}
                  activeOpacity={0.9}
                  disabled={!canSubmitOperatore}
                >
                  <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {operatoreInModifica
                      ? tApp(appLanguage, 'services_save_operator')
                      : tApp(appLanguage, 'services_add_operator')}
                  </Text>
                </HapticTouchable>
                {operatoreInModifica ? (
                  <HapticTouchable
                    style={styles.buttonLight}
                    onPress={resetOperatoreForm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonLightText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {tApp(appLanguage, 'services_cancel_edit')}
                    </Text>
                  </HapticTouchable>
                ) : null}
                  </Animated.View>
                ) : null}
              </View>
            </View>

            {multiRoleNoOperatorWarningCard}

            <View style={styles.formCard}>
              <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                Personalizza Colori Card
              </Text>
              <Text style={styles.helperTextInline}>
                Configura colore card per singolo servizio o per mestiere assegnato, senza cambiare layout.
              </Text>

              <View style={styles.colorModeRow}>
                <HapticTouchable
                  style={[styles.colorModeChip, cardColorMode === 'service' && styles.colorModeChipActive]}
                  onPress={() => setCardColorMode('service')}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.colorModeChipText, cardColorMode === 'service' && styles.colorModeChipTextActive]}>
                    Per Servizio
                  </Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.colorModeChip, cardColorMode === 'role' && styles.colorModeChipActive]}
                  onPress={() => setCardColorMode('role')}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.colorModeChipText, cardColorMode === 'role' && styles.colorModeChipTextActive]}>
                    Per Mestiere
                  </Text>
                </HapticTouchable>
              </View>

              {cardColorMode === 'service' ? (
                <View style={styles.colorTargetWrap}>
                  {servizi.map((item, index) => {
                    const selected = selectedServiceColorTargetId === item.id;
                    return (
                      <HapticTouchable
                        key={`card-color-service-${item.id}-${item.nome}-${index}`}
                        style={[styles.colorTargetChip, selected && styles.colorTargetChipActive]}
                        onPress={() => setSelectedServiceColorTargetId(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.colorTargetChipText, selected && styles.colorTargetChipTextActive]} numberOfLines={1}>
                          {item.nome}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.colorTargetWrap}>
                  {roleOptions.map((role) => {
                    const selected = normalizeRoleName(selectedRoleColorTarget) === normalizeRoleName(role);
                    return (
                      <HapticTouchable
                        key={`card-color-role-${role}`}
                        style={[styles.colorTargetChip, selected && styles.colorTargetChipActive]}
                        onPress={() => setSelectedRoleColorTarget(role)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.colorTargetChipText, selected && styles.colorTargetChipTextActive]} numberOfLines={1}>
                          {role}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              )}

              <View style={styles.colorPaletteWrap}>
                {COLOR_SCALE.map((hex) => {
                  const isSelected = selectedColorPreview === hex;
                  return (
                    <HapticTouchable
                      key={`card-color-${hex}`}
                      style={[styles.colorDot, isSelected && styles.colorDotSelected]}
                      onPress={() => applyCardColorOverride(hex)}
                      activeOpacity={0.9}
                      disabled={!currentColorTarget}
                    >
                      <View style={[styles.colorDotInner, { backgroundColor: hex }]} />
                    </HapticTouchable>
                  );
                })}
              </View>

              <HapticTouchable
                style={styles.buttonLight}
                onPress={handleProtectedResetPress}
                onLongPress={resetAutomaticServiceColors}
                delayLongPress={650}
                activeOpacity={0.9}
              >
                <Text style={styles.buttonLightText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  Reimposta colori automatici
                </Text>
              </HapticTouchable>
              <Text style={styles.helperTextInline}>
                Tieni premuto per ripristinare i colori automatici.
              </Text>
            </View>

            <Text style={styles.listTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'services_list')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.serviceGridItem}>
          <Swipeable
            ref={(ref) => {
              swipeableRefs.current[item.id] = ref;
            }}
            renderRightActions={() => (
              <View style={styles.swipeActions}>
                <HapticTouchable
                  style={styles.editSwipeAction}
                  onPress={() => avviaModifica(item)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.editSwipeText}>Modifica</Text>
                </HapticTouchable>

                <HapticTouchable
                  style={styles.deleteSwipeAction}
                  onPress={() => confermaElimina(item)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.deleteSwipeText}>Elimina</Text>
                </HapticTouchable>
              </View>
            )}
            friction={1.05}
            overshootRight={false}
            overshootFriction={10}
            dragOffsetFromRightEdge={10}
            rightThreshold={28}
          >
            {(() => {
              const normalizedRole = normalizeRoleName(item.mestiereRichiesto ?? '');
              const accent = resolveServiceAccent({
                serviceId: item.id,
                serviceName: item.nome,
                roleName: item.mestiereRichiesto,
                serviceColorOverrides: serviceCardColorOverrides,
                roleColorOverrides: roleCardColorOverrides,
              });
              const serviceUsesOperators = doesServiceUseOperators(item.nome, servizi);
              const serviceHasAssignedOperators =
                !!normalizedRole &&
                operatori.some(
                  (operator) => normalizeRoleName(operator.mestiere) === normalizedRole
                );
              const showOperatorBadge = serviceUsesOperators && serviceHasAssignedOperators;
              const showSalonBadge = !showOperatorBadge;

              return (
            <Animated.View
              style={[
                styles.itemCard,
                styles.itemCardShell,
                {
                  maxWidth: responsive.contentMaxWidth,
                  backgroundColor: accent.bg,
                  borderColor: accent.border,
                },
              ]}
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.duration(180)}
            >
              <View style={styles.itemLeft}>
                <Text
                  style={[styles.serviceName, { color: '#111111' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  {item.nome}
                </Text>
                <View style={styles.serviceMetaRow}>
                  {item.mestiereRichiesto ? (
                    <Animated.Text
                      entering={FadeIn.duration(160)}
                      style={[
                        styles.serviceRoleBadge,
                        {
                          backgroundColor: 'rgba(255,255,255,0.72)',
                          color: accent.text,
                          borderColor: accent.border,
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.74}
                    >
                      {formatRoleLabelForDisplay(item.mestiereRichiesto)}
                    </Animated.Text>
                  ) : null}
                  {showOperatorBadge ? (
                    <View style={[styles.serviceOperatorInlineBadge, { borderColor: accent.border }]}>
                      <Ionicons name="person" size={12} color={accent.text} />
                    </View>
                  ) : null}
                  {showSalonBadge ? (
                    <View style={styles.serviceSalonInlineBadge}>
                      <Text style={styles.serviceSalonInlineBadgeText}>Salone</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.serviceHint, { color: '#111111' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {tApp(appLanguage, 'services_duration_label')}: {formatDurata(item.durataMinuti ?? 60, appLanguage)}
                </Text>
                {item.prezzoOriginale &&
                item.prezzoOriginale > item.prezzo &&
                item.scontoValidoDal &&
                item.scontoValidoAl ? (
                  <Text
                    style={[styles.serviceHint, { color: '#111111' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.64}
                  >
                    Sconto valido: {item.scontoValidoDal} → {item.scontoValidoAl}
                  </Text>
                ) : null}
              </View>

              <View style={styles.priceWrap}>
                {item.prezzoOriginale && item.prezzoOriginale > item.prezzo ? (
                  <>
                    <Animated.View entering={FadeIn.duration(160)} style={styles.discountBadge}>
                      <Text
                        style={styles.discountBadgeText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        Sconto
                      </Text>
                    </Animated.View>
                    <Text
                      style={[styles.servicePriceOriginal, { color: '#111111' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      € {item.prezzoOriginale.toFixed(2)}
                    </Text>
                  </>
                ) : null}
                <Text
                  style={[styles.servicePrice, { color: '#111111' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.74}
                >
                  € {item.prezzo.toFixed(2)}
                </Text>
              </View>
              <View
                style={[
                  styles.serviceSwipeHintRow,
                  { backgroundColor: accent.border },
                ]}
              >
                <View
                  style={[
                    styles.serviceSwipeHintInline,
                  ]}
                >
                  <Ionicons name="arrow-back-outline" size={13} color={accent.text} />
                  <Text style={[styles.serviceSwipeHintText, { color: accent.text }]}>
                    Scorri per azioni rapide
                  </Text>
                </View>
              </View>
            </Animated.View>
              );
            })()}
          </Swipeable>
          </View>
        )}
        ListFooterComponent={
          <View>
            {operatorsListCard}
            {quickNotesCard}
            <View style={{ height: 18 }} />
          </View>
        }
      />
      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    paddingTop: 54,
    paddingBottom: 140,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 22 : 16,
    paddingTop: 0,
    paddingBottom: 14,
    marginBottom: 10,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#9a6b32',
    marginBottom: 8,
  },
  screenHeaderRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
    gap: 4,
  },
  screenBrandChip: {
    maxWidth: '88%',
    marginTop: 2,
    marginBottom: 4,
    alignItems: 'center',
  },
  screenBrandChipText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#52627a',
    textAlign: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 4,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 0,
    textAlign: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 12,
    gap: 12,
  },
  heroStatCardBlue: {
    flex: 1,
    backgroundColor: '#EAF1FB',
    borderRadius: 18,
    paddingHorizontal: IS_ANDROID ? 18 : 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatCardRose: {
    flex: 1,
    backgroundColor: '#FDECEF',
    borderRadius: 18,
    paddingHorizontal: IS_ANDROID ? 18 : 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  formCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    borderWidth: 0,
  },
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  desktopTopGridStack: {
    flexDirection: 'column',
    marginBottom: 0,
  },
  desktopLeftPane: {
    flex: 1.05,
    marginRight: 16,
    marginBottom: 0,
  },
  desktopRightPane: {
    flex: 0.95,
    marginBottom: 0,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  expandHeaderButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginBottom: 12,
    minHeight: 44,
    position: 'relative',
  },
  expandHeaderChevron: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -10,
  },
  colorModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
    backgroundColor: '#F7F3EE',
    borderRadius: 22,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(109, 76, 52, 0.08)',
    shadowColor: '#6B4A2F',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  colorModeChip: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 0,
    flex: 1,
  },
  colorModeChipActive: {
    backgroundColor: '#0F172A',
  },
  colorModeChipText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  colorModeChipTextActive: {
    color: '#ffffff',
  },
  colorTargetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  colorTargetChip: {
    backgroundColor: '#FEFCFA',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(109, 76, 52, 0.10)',
    paddingHorizontal: IS_ANDROID ? 18 : 16,
    paddingVertical: 6,
    minHeight: 42,
    marginHorizontal: 0,
    marginBottom: 0,
    maxWidth: '48.5%',
    shadowColor: '#6B4A2F',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  colorTargetChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  colorTargetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    paddingHorizontal: 0,
  },
  colorTargetChipTextActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
    color: '#0F172A',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  numericPickerField: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericPickerFieldText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
  },
  numericPickerFieldPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  discountFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discountFieldMain: {
    flex: 1,
  },
  discountFieldClearButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountFieldClearButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#991B1B',
  },
  roleSelectorInput: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleSelectorText: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
  },
  roleSelectorPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  roleSelectorChevron: {
    fontSize: 18,
    color: '#475569',
    fontWeight: '800',
    marginLeft: 8,
  },
  rolePickerPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    marginBottom: 8,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  rolePickerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  roleChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 15 : 11,
    paddingVertical: 7,
    marginHorizontal: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  roleChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  roleChipText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  roleChipTextSelected: {
    color: '#ffffff',
  },
  roleChipCreate: {
    backgroundColor: '#FCEFE6',
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  roleChipCreateText: {
    color: '#8a4f31',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  buttonDark: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonDarkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonLight: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  buttonLightText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonLightDanger: {
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  buttonLightDangerText: {
    color: '#991B1B',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 8,
    fontWeight: '600',
  },
  helperTextInline: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningCard: {
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.34)',
    backgroundColor: '#FFF7E6',
  },
  warningCardText: {
    fontSize: 13,
    color: '#8A5A00',
    lineHeight: 20,
    marginBottom: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  serviceDiscountValidityPanel: {
    marginTop: 2,
    marginBottom: 4,
    paddingTop: 4,
  },
  serviceMachineryPanel: {
    marginTop: 6,
    marginBottom: 6,
  },
  serviceMachineryChipInactive: {
    opacity: 0.45,
  },
  serviceMachineryChipTextInactive: {
    color: '#64748B',
  },
  operatorAvailabilityPanel: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 12,
    borderWidth: 0,
  },
  operatorAvailabilityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  operatorAvailabilityHint: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  weekdayChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
  weekdayChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: IS_ANDROID ? 15 : 11,
    paddingVertical: 7,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  weekdayChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  weekdayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  weekdayChipTextActive: {
    color: '#ffffff',
  },
  operatorAvailabilityRangeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
  operatorAvailabilityRangeColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  operatorAvailabilityInput: {
    flex: 1,
    minWidth: 0,
  },
  operatorAvailabilityInputFull: {
    width: '100%',
  },
  operatorAvailabilityDateButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorAvailabilityDateButtonText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
  },
  operatorAvailabilityDateButtonPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  operatorAvailabilityAddButton: {
    backgroundColor: '#FCEFE6',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  operatorAvailabilityAddText: {
    color: '#8c5c3b',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  operatorRangeList: {
    marginTop: 2,
  },
  operatorRangeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  operatorRangeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'left',
  },
  operatorRangeDelete: {
    marginLeft: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  operatorRangeDeleteText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  operatorAvailabilityEmpty: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'center',
  },
  swipeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: IS_ANDROID ? 4 : 6,
    marginBottom: 10,
    width: '100%',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
  },
  swipeHintRowBottom: {
    marginTop: 4,
    marginBottom: 4,
  },
  swipeHintText: {
    fontSize: IS_ANDROID ? 10 : 11,
    color: '#64748B',
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  serviceGridRow: {
    justifyContent: 'space-between',
    width: '100%',
  },
  serviceGridItem: {
    width: '48.9%',
  },
  swipeActions: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  editSwipeAction: {
    backgroundColor: '#eadfd4',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    width: 78,
  },
  editSwipeText: {
    color: '#8c5c3b',
    fontSize: 13,
    fontWeight: '800',
  },
  deleteSwipeAction: {
    backgroundColor: '#c93c3c',
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    width: 84,
  },
  deleteSwipeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    minHeight: 132,
    paddingHorizontal: IS_ANDROID ? 16 : 14,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0,
    position: 'relative',
  },
  itemCardShell: {
    width: '100%',
  },
  itemLeft: {
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    minWidth: 0,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    width: '100%',
  },
  serviceHint: {
    fontSize: IS_ANDROID ? 11 : 12,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  },
  serviceRoleBadge: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    color: '#64748B',
    fontSize: IS_ANDROID ? 10 : 11,
    fontWeight: '800',
    paddingHorizontal: IS_ANDROID ? 18 : 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 0,
    textAlign: 'center',
    borderWidth: 0,
    minWidth: IS_ANDROID ? 92 : undefined,
    maxWidth: '78%',
    alignSelf: 'center',
  },
  serviceOperatorInlineBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceSalonInlineBadge: {
    minWidth: 68,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  serviceSalonInlineBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  priceWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
  },
  serviceSwipeHintRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
    minHeight: 22,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  serviceSwipeHintInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  serviceSwipeHintText: {
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  discountBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 12 : 9,
    paddingVertical: 4,
    marginBottom: 3,
    minWidth: IS_ANDROID ? 72 : undefined,
  },
  discountBadgeText: {
    color: '#991b1b',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  servicePriceOriginal: {
    fontSize: IS_ANDROID ? 11 : 12,
    color: '#94a3b8',
    fontWeight: '700',
    textDecorationLine: 'line-through',
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
  },
  servicePrice: {
    fontSize: IS_ANDROID ? 16 : 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    width: '100%',
  },
  operatorsList: {
    marginTop: 8,
  },
  operatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  operatorCardMainRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  operatorCardTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  operatorName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'left',
    marginBottom: 8,
  },
  operatorRole: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'left',
    marginBottom: 4,
  },
  operatorAvailabilitySummary: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'left',
    opacity: 0.82,
    lineHeight: 18,
  },
  operatorPhotoActionButton: {
    width: 116,
    height: 116,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    flexShrink: 0,
    marginTop: -18,
    position: 'relative',
  },
  operatorPhotoActionImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  operatorPhotoActionPlusBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 2,
  },
  colorPaletteWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  colorDot: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  colorDotSelected: {
    borderColor: '#0f172a',
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
  },
  colorDotInner: {
    width: 40,
    height: 40,
    borderRadius: 999,
  },
  operatorSwipeHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.44)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  operatorCardBottomRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  operatorSwipeHintText: {
    fontSize: 11,
    fontWeight: '800',
  },
  operatorPhotoEditorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    marginBottom: 12,
  },
  operatorPhotoEditorAvatarWrap: {
    width: 76,
    height: 76,
    position: 'relative',
    flexShrink: 0,
  },
  operatorPhotoEditorAvatar: {
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  operatorPhotoEditorAvatarImage: {
    width: '100%',
    height: '100%',
  },
  operatorPhotoEditorPlusBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  operatorPhotoEditorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  operatorPhotoEditorTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
  },
  operatorPhotoEditorHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    fontWeight: '700',
  },
  machineryCardInactive: {
    opacity: 0.72,
    backgroundColor: '#F8FAFC',
  },
  machineryStatusChipActive: {
    backgroundColor: '#f1e4d7',
    borderColor: '#d6bca0',
  },
  machineryStatusChipInactive: {
    backgroundColor: '#EAF1FB',
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  machineryStatusTextActive: {
    color: '#8a4f31',
  },
  machineryStatusTextInactive: {
    color: '#475569',
  },
  machineryCategory: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'left',
    marginBottom: 6,
  },
  machineryNote: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'left',
    lineHeight: 18,
  },
});
