import {OwnerWebPageTitle} from '../../components/owner-web-page-title';
import {CustomerEditorPremiumHeader,CustomerEditorPremiumContent} from '../../components/customer-editor-premium';
import { customerFeedbackMessage } from '../../src/lib/customer-deletion-errors';
import { SkeletonSurface } from '../../components/ui/skeleton-shimmer';
import { NativeCustomerUtilityCard } from '../../components/native-customer-utility-card';
import { PremiumSectionHeading } from '../../components/ui/premium-section-heading';
import { PremiumSearchToolbar } from '../../components/ui/premium-search-toolbar';
import {InfoButton} from '../../components/ui/info-button';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {NativePremiumScope, NativeReadableText as Text, NativePremiumIcon as Ionicons} from '../../components/owner-native-premium';
import { OwnerBrandMark } from '../../components/salon-brand-mark';
import { useCustomerPremium } from '../../src/lib/use-customer-premium';
import { CustomerPremiumSettings } from '../../components/customer-premium-settings';
import { CustomerProfileSummary } from '../../components/customer-profile-summary';
import { CustomerDirectorySummary, CustomerDirectoryRow, CustomerDirectoryBoard, type DirectoryVisit } from '../../components/customer-directory-premium';
import { CustomerSelectionIndicator } from '../../components/customer-selection-indicator';
import { CustomerPopupHeader } from '../../components/customer-popup-header';
import { CustomerPopupClose } from '../../components/customer-popup-close';
import { FormResetLink } from '../../components/form-reset-link';
import { OwnerPremiumSheetFrame } from '../../components/owner-premium-sheet';
import { OWNER_RAIL_WIDTH } from '../../components/owner-premium-web';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'react-native';
import { NativeCustomersSkeleton } from '../../components/owner-premium-customers-skeleton';
import { CustomerPremiumScope, nativeCustomersStyles, useCustomerPremiumStyles } from '../../components/owner-premium-customers-style';
import { useAccessAppearance } from '../../components/access-premium';
import { CustomerNotificationPermission } from '../../components/customer-notification-permission';
import { CustomerRegistrationReview } from '../../components/customer-registration-review';
import { NativeSheetHandle } from '../../components/ui/native-sheet-drag';
import { BenefitsEntryCard } from "../../components/benefits-entry-card";
import { BenefitsConsole } from "../../components/benefits-console";
import { CreationSheet } from '../../components/creation-sheet';
import { CustomerSheetFrame, useCustomerSheetDockStyle } from '../../components/customer-sheet-frame';
import { CustomerCardBoundary } from '../../components/customer-card-render-boundary';
import { CustomerCardName } from '../../components/customer-card-name';
import { BookingPaymentPolicyEditor } from '../../components/booking-payment-policy-editor';
import { CustomerPackagesEditor } from '../../components/customer-packages-editor';
import { createCustomerCardExpansionStore } from '../../src/lib/customer-card-expansion';

import { useCustomerIdentityColors } from '../../src/lib/use-customer-identity-colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, type StyleProp, StyleSheet, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { HapticNativePressable as Pressable } from '../../components/ui/haptic-native-controls';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';
import { CustomerCommunicationsModal } from '../../components/customer-communications-modal';
import { CustomerServiceSearch, type CustomerServiceSearchState } from '../../components/customer-service-search';
import { CustomerWelcomeSettingsCard } from '../../components/customer-welcome-settings-card';
import {
  SectionHowItWorksPanel,
} from '../../components/section-how-it-works';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../../components/ui/keyboard-next-toolbar';
import { MarkAllReadButton } from '../../components/ui/mark-all-read-button';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { PremiumExpandButton } from '../../components/ui/premium-expand-button';
import { PremiumGuideDock } from '../../components/ui/premium-guide-dock';
import {
  getWebExpandableCardProps,
  getWebExpandableCardStyle,
} from '../../components/ui/web-expandable-card';
import { useAppContext } from '../../src/context/AppContext';
import {
  OwnerStartupSkeletonItem,
  OwnerStartupSkeletonPulse,
  useOwnerStartupLoading,
} from '../../src/context/OwnerStartupLoadingContext';
import { useUnreadBadges } from '../../src/context/UnreadBadgeContext';
import { useTabSwipeLock } from '../../src/context/TabSwipeLockContext';
import { focusNextInput, useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { haptic } from '../../src/lib/haptics';
import { ICON_ASSET_VERSION } from '../../src/lib/icon-asset-version';
import {
  buildCustomerIdentityColorMap,
  getCustomerIdentityColor,
} from '../../src/lib/customer-identity-colors';
import { emitOwnerViewedNotificationChange } from '../../src/lib/notification-badge-sync';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { supabase } from '../../src/lib/supabase';
import {
  getCustomerServiceDurationOverride,
  resolveCustomerServiceTiming,
  type CustomerServiceDurationOverrideMap,
} from '../../src/lib/customer-service-durations';
import {
  getCustomerServicePriceOverride,
  resolveCustomerServicePrice,
  type CustomerServicePriceOverrideMap,
} from '../../src/lib/customer-service-prices';
import {
  buildCustomerOnlineBookingOverrideKey,
  normalizeCustomerBookingAcceptanceMode,
  normalizeCustomerOnlineServiceOverrides,
  resolveCustomerAutoAccept,
  type CustomerBookingAcceptanceMode,
  type CustomerOnlineServiceOverrideMap,
} from '../../src/lib/customer-online-booking-policy';
import { normalizeServicePhaseConfig } from '../../src/lib/service-phases';
import {
  buildPersonNameValidationError,
  formatCustomerFullNameValue,
  formatCustomerNamePart,
  isValidPersonNamePart,
  splitCustomerFullNameValue,
} from '../../src/lib/customer-name';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../../src/lib/validators';

type ClienteItem = {
  id: string;
  uiKey?: string;
  full_name: string;
  phone: string;
  email?: string | null;
  instagram?: string | null;
  birthday?: string | null;
  note?: string | null;
  is_active?: boolean;
  viewedBySalon?: boolean;
  registrationStatus?: 'approved' | 'pending';
  annullamentiCount?: number;
  maxFutureAppointments?: number | null;
  maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
  maxDailyAppointments?: number | null;
  serviceDurationOverrides?: CustomerServiceDurationOverrideMap;
  servicePriceOverrides?: CustomerServicePriceOverrideMap;
  onlineBookingAcceptanceMode?: CustomerBookingAcceptanceMode;
  allowSameDaySameService?: boolean;
  onlineServiceOverrides?: CustomerOnlineServiceOverrideMap;
  salon_id: string;
};

type CustomerOnlinePolicyCatalogItem = {
  id: string;
  policyKey: string;
  nome: string;
  mestiereRichiesto?: string;
  durataMinuti?: number;
  compositionId?: string;
  componentServiceIds: string[];
};

const countEffectiveBlockedOnlinePolicyServices = (
  overrides: CustomerOnlineServiceOverrideMap,
  services: readonly CustomerOnlinePolicyCatalogItem[]
) =>
  services.reduce((count, service) => {
    const directlyBlocked = overrides[service.policyKey] === false;
    const inheritedBlocked = service.componentServiceIds.some(
      (serviceId) => overrides[serviceId] === false
    );
    return count + (directlyBlocked || inheritedBlocked ? 1 : 0);
  }, 0);

type BookingLimitMode = 'total_future' | 'monthly' | 'daily';

function InstantSwipeAction({
  style,
  onActivate,
  accessibilityLabel,
  children,
}: {
  style: StyleProp<ViewStyle>;
  onActivate: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const activatedRef = useRef(false);

  const activate = useCallback(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    if (Platform.OS !== 'web') void haptic.medium().catch(() => null);
    onActivate();
    if (Platform.OS === 'web') void haptic.light().catch(() => null);
  }, [onActivate]);

  return (
    <Pressable
      style={({ pressed }) => [style, pressed && styles.swipeActionButtonPressed]}
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      onPress={activate}
      onTouchEnd={(event) => event.stopPropagation()}
      onTouchCancel={(event) => event.stopPropagation()}
      onPressOut={() => {
        setTimeout(() => {
          activatedRef.current = false;
        }, 0);
      }}
      unstable_pressDelay={0}
      hitSlop={4}
      pressRetentionOffset={{ top: 18, bottom: 18, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_disableSound
    >
      {children}
    </Pressable>
  );
}

type ClienteSection = {
  key: string;
  title: string;
  sortValue: number;
  items: ClienteItem[];
};

type ClientiUnifiedListItem = {
  key: string;
  sections: ClienteSection[];
};

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const normalizePhoneForIdentity = (value?: string | null) => (value ?? '').replace(/\D+/g, '');
const normalizeIdentityText = (value?: string | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}` : '';
};
const buildInstagramUrl = (value?: string | null) => {
  const handle = value?.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
};
const buildFrontendClientIdentityKey = (item: {
  id?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
}) => {
  const normalizedEmail = (item.email ?? '').trim().toLowerCase();
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedPhone = (item.telefono ?? '').replace(/\D+/g, '');
  if (normalizedPhone) return `phone:${normalizedPhone}`;

  const normalizedId = (item.id ?? '').trim();
  if (normalizedId) return `id:${normalizedId}`;

  return '';
};
const buildFrontendClientIdentityAliases = (item: {
  id?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
}) =>
  Array.from(
    new Set(
      [
        normalizeIdentityText(item.id) ? `id:${normalizeIdentityText(item.id)}` : '',
        normalizePhoneForIdentity(item.telefono)
          ? `phone:${normalizePhoneForIdentity(item.telefono)}`
          : '',
        normalizeIdentityText(item.email) ? `email:${normalizeIdentityText(item.email)}` : '',
      ].filter(Boolean)
    )
  );
const getFrontendClientCancellationCount = (
  item: {
    id?: string | null;
    nome?: string | null;
    telefono?: string | null;
    email?: string | null;
  },
  countsByIdentity: Map<string, number>
) =>
  buildFrontendClientIdentityAliases(item).reduce(
    (maxCount, alias) => Math.max(maxCount, countsByIdentity.get(alias) ?? 0),
    0
  );
const buildDeletedCustomerStorageKey = (email?: string | null) =>
  `salon_manager_recently_deleted_customers__${(email ?? '').trim().toLowerCase()}`;

const buildCancellationRequestStableKey = (item: {
  data?: string | null;
  ora?: string | null;
  customerId?: string | null;
  telefono?: string | null;
  email?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) => {
  const identity =
    normalizeIdentityText(item.email) ||
    normalizePhoneForIdentity(item.telefono) ||
    normalizeIdentityText(item.customerId) ||
    normalizeIdentityText(`${item.nome ?? ''} ${item.cognome ?? ''}`);

  return [
    String(item.data ?? '').trim(),
    String(item.ora ?? '').trim().slice(0, 5),
    identity,
  ].join('|');
};

const compareCancellationRequestAuthority = (
  left: { id?: string | null; createdAt?: string | null },
  right: { id?: string | null; createdAt?: string | null }
) => {
  const leftCreatedAt = Date.parse(String(left.createdAt ?? '').trim());
  const rightCreatedAt = Date.parse(String(right.createdAt ?? '').trim());

  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  if (Number.isFinite(leftCreatedAt) !== Number.isFinite(rightCreatedAt)) {
    return Number.isFinite(leftCreatedAt) ? 1 : -1;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const isUuidLike = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const IS_ANDROID = Platform.OS === 'android';
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';
const CUSTOMER_REMINDER_HOUR_OPTIONS = [0, 1, 2, 3, 6, 12, 24, 48] as const;
const CUSTOMER_BOOKING_LIMIT_VISUAL_OVERRIDE_TTL_MS = 20000;

const formatReminderHoursLabel = (hours: number) => {
  if (hours <= 0) {
    return 'Disattivati';
  }

  if (hours === 1) {
    return '1 ora prima';
  }

  return `${hours} ore prima`;
};

const getPrimaryBookingLimitBadgeLabel = (cliente: {
  maxFutureAppointments?: number | null;
  maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
}) => {
  if (typeof cliente.maxFutureAppointments === 'number') {
    return cliente.maxFutureAppointmentsMode === 'monthly'
      ? `Mese · ${cliente.maxFutureAppointments}`
      : `Future · ${cliente.maxFutureAppointments}`;
  }

  return 'Mese · illimitate';
};

const getDailyBookingLimitBadgeLabel = (cliente: {
  maxDailyAppointments?: number | null;
}) => {
  if (typeof cliente.maxDailyAppointments === 'number') {
    return `Giorno · ${cliente.maxDailyAppointments}`;
  }

  return 'Giorno · illimitate';
};

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

  const link = new URL(`${baseUrl.toString()}/join/${encodeURIComponent(salonCode)}`);
  link.searchParams.set('entry', 'client');
  link.searchParams.set('v', ICON_ASSET_VERSION);
  return link.toString();
};

const buildWhatsappTextUrl = (phone: string, text: string) => {
  const normalized = buildDialablePhone(phone).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}` : '';
};

const normalizeBirthdayValue = (value?: string | null) => {
  const trimmedValue = value?.trim() ?? '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const slashDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDateMatch) {
    const [, day, month, year] = slashDateMatch;
    return `${year}-${month}-${day}`;
  }

  return '';
};

const formatBirthdayLabel = (value?: string | null) => {
  const normalizedValue = normalizeBirthdayValue(value);
  if (!normalizedValue) return '';

  const [year, month, day] = normalizedValue.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

const buildClientMonogram = (fullName?: string | null) => {
  const tokens = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((item) => item.length > 0);

  if (tokens.length === 0) return '?';
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  const nome = tokens[0];
  const cognome = tokens[tokens.length - 1];
  return `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase();
};

const ENABLE_ANDROID_BACKOFFICE_PERF_LOGS = false;
const logAndroidBackofficePerf = (event: string, payload: Record<string, unknown> = {}) => {
  void event;
  void payload;
};

type CustomerFormErrors = {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
};

type CustomerEditorDraft = {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  instagram: string;
  notaCliente: string;
  birthday: string;
};

type CustomerEditorFormHandle = {
  setBirthday: (value: string) => void;
  setErrors: (errors: CustomerFormErrors) => void;
};

type CustomerCreatorFormHandle = CustomerEditorFormHandle & {
  reset: () => void;
  setNativeVisible: (visible: boolean) => void;
};

type CustomerCreatorFormProps = {
  onClose: () => void;
  nativeOverlays?: React.ReactNode;
  visible: boolean;
  saving: boolean;
  loadingInit: boolean;
  isDesktopWebLayout: boolean;
  nameFieldScrollTopOffset: number;
  nameInputRef: React.RefObject<TextInput | null>;
  surnameInputRef: React.RefObject<TextInput | null>;
  phoneInputRef: React.RefObject<TextInput | null>;
  emailInputRef: React.RefObject<TextInput | null>;
  instagramInputRef: React.RefObject<TextInput | null>;
  noteInputRef: React.RefObject<TextInput | null>;
  focusField: (inputRef: React.RefObject<TextInput | null>) => void;
  scrollToField: (
    inputRef: React.RefObject<TextInput | null>,
    options?: { topOffset?: number }
  ) => void;
  onBirthdayPress: (value: string) => void;
  onSubmit: (draft: CustomerEditorDraft) => void | Promise<void>;
};

type CustomerEditorFormProps = {
  customer: ClienteItem;
  saving: boolean;
  loadingInit: boolean;
  keyboardOpen: boolean;
  isDesktopWebLayout: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  nameInputRef: React.RefObject<TextInput | null>;
  surnameInputRef: React.RefObject<TextInput | null>;
  phoneInputRef: React.RefObject<TextInput | null>;
  emailInputRef: React.RefObject<TextInput | null>;
  instagramInputRef: React.RefObject<TextInput | null>;
  noteInputRef: React.RefObject<TextInput | null>;
  focusField: (inputRef: React.RefObject<TextInput | null>) => void;
  scrollToField: (inputRef: React.RefObject<TextInput | null>) => void;
  onBirthdayPress: (value: string) => void;
  onClose: () => void;
  onSubmit: (draft: CustomerEditorDraft) => void | Promise<void>;
};

const buildCustomerEditorDraft = (customer: ClienteItem): CustomerEditorDraft => {
  const splitName = splitCustomerFullNameValue(customer.full_name);
  return {
    nome: formatCustomerNamePart(splitName.nome),
    cognome: formatCustomerNamePart(splitName.cognome),
    telefono: customer.phone ?? '',
    email: customer.email ?? '',
    instagram: customer.instagram ?? '',
    notaCliente: customer.note ?? '',
    birthday: normalizeBirthdayValue(customer.birthday),
  };
};

const buildEmptyCustomerDraft = (): CustomerEditorDraft => ({
  nome: '',
  cognome: '',
  telefono: '',
  email: '',
  instagram: '',
  notaCliente: '',
  birthday: '',
});

/** Keeps new-customer keystrokes and validation feedback out of ClientiScreen. */
const CustomerCreatorForm = React.memo(
  React.forwardRef<CustomerCreatorFormHandle, CustomerCreatorFormProps>(
    function CustomerCreatorForm(
      {
        onClose,
        nativeOverlays,
        visible: webVisible,
        saving,
        loadingInit,
        isDesktopWebLayout,
        nameFieldScrollTopOffset,
        nameInputRef,
        surnameInputRef,
        phoneInputRef,
        emailInputRef,
        instagramInputRef,
        noteInputRef,
        focusField: focusPageField,
        scrollToField: scrollToPageField,
        onBirthdayPress,
        onSubmit,
      },
      forwardedRef
    ) {
      const {palette:formPalette}=useAccessAppearance();
      const styles=useMemo(()=>nativeCustomersStyles(baseCustomerStyles,formPalette),[formPalette]);
      const [draft, setDraft] = useState<CustomerEditorDraft>(buildEmptyCustomerDraft);
      const [nativeVisible, setNativeVisible] = useState(false);
      const visible = Platform.OS === 'web' ? webVisible : nativeVisible;
      const insets = useSafeAreaInsets();
      const creatorScrollRef = useRef<ScrollView | null>(null);
      const creatorContentRef = useRef<View | null>(null);
      const creatorFocusedInputRef = useRef<TextInput | null>(null);
      const revealCreatorField = useCallback(() => {
        requestAnimationFrame(() => {
          const input = creatorFocusedInputRef.current;
          const content = creatorContentRef.current;
          if (!input || !content || !input.isFocused()) return;
          input.measureLayout(content, (_x, y) => {
            creatorScrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
          }, () => {});
        });
      }, []);

      const scrollToField: CustomerCreatorFormProps['scrollToField'] = (inputRef, options) => {
        if (Platform.OS === 'web') {
          scrollToPageField(inputRef, options);
          return;
        }
        creatorFocusedInputRef.current = inputRef.current;
        revealCreatorField();
      };
      const focusField: CustomerCreatorFormProps['focusField'] = (inputRef) => {
        if (Platform.OS === 'web') focusPageField(inputRef);
        else {
          inputRef.current?.focus();
          scrollToField(inputRef);
        }
      };
      const draftRef = useRef(draft);
      const [errors, setErrors] = useState<CustomerFormErrors>({});

      const replaceDraft = useCallback((nextDraft: CustomerEditorDraft) => {
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }, []);

      const updateDraft = useCallback(
        <Key extends keyof CustomerEditorDraft,>(
          key: Key,
          value: CustomerEditorDraft[Key]
        ) => {
          replaceDraft({ ...draftRef.current, [key]: value });
        },
        [replaceDraft]
      );

      const reset = useCallback(() => {
        replaceDraft(buildEmptyCustomerDraft());
        setErrors({});
      }, [replaceDraft]);

      React.useImperativeHandle(
        forwardedRef,
        () => ({
          reset,
          setNativeVisible,
          setBirthday: (value: string) => updateDraft('birthday', value),
          setErrors,
        }),
        [reset, updateDraft]
      );

      const clearError = useCallback((key: keyof CustomerFormErrors) => {
        setErrors((current) =>
          current[key] ? { ...current, [key]: undefined } : current
        );
      }, []);

      const canClear =
        draft.nome.trim() !== '' ||
        draft.cognome.trim() !== '' ||
        draft.telefono.trim() !== '' ||
        draft.email.trim() !== '' ||
        draft.instagram.trim() !== '' ||
        draft.notaCliente.trim() !== '' ||
        draft.birthday.trim() !== '';

      if (!visible) return null;

      const content = (
        <Animated.View
          ref={creatorContentRef}
          collapsable={false}
          layout={Platform.OS === 'web' ? LinearTransition.duration(210).easing(Easing.out(Easing.cubic)) : undefined}
        >
          <View
            style={[
              styles.formFieldsWrap,
              isDesktopWebLayout && styles.formFieldsWrapDesktop,
            ]}
          >
            <Text style={{ color: formPalette.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 8, marginBottom: 5 }}>Nome</Text>
            <ClearableTextInput
              ref={nameInputRef}
              keepClearControlMounted
              reserveSymmetricClearSpace
              placeholder="Inserisci nome"
              placeholderTextColor="#9a9a9a"
              value={draft.nome}
              onChangeText={(value) => {
                updateDraft('nome', value);
                clearError('nome');
              }}
              onFocus={() =>
                scrollToField(nameInputRef, { topOffset: nameFieldScrollTopOffset })
              }
              editable={!saving && !loadingInit}
              style={[
                styles.input,
                isDesktopWebLayout && styles.inputDesktopWide,
                errors.nome && styles.inputError,
              ]}
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => focusField(surnameInputRef)}
              blurOnSubmit={false}
            />
            {errors.nome ? (
              <Text style={styles.fieldErrorText}>{errors.nome}</Text>
            ) : null}

            <Text style={{ color: formPalette.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 8, marginBottom: 5 }}>Cognome</Text>

            <ClearableTextInput
              ref={surnameInputRef}
              keepClearControlMounted
              reserveSymmetricClearSpace
              placeholder="Inserisci cognome"
              placeholderTextColor="#9a9a9a"
              value={draft.cognome}
              onChangeText={(value) => {
                updateDraft('cognome', value);
                clearError('cognome');
              }}
              onFocus={() => scrollToField(surnameInputRef)}
              editable={!saving && !loadingInit}
              style={[
                styles.input,
                isDesktopWebLayout && styles.inputDesktopWide,
                errors.cognome && styles.inputError,
              ]}
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => focusField(phoneInputRef)}
              blurOnSubmit={false}
            />
            {errors.cognome ? (
              <Text style={styles.fieldErrorText}>{errors.cognome}</Text>
            ) : null}

            <Text style={{ color: formPalette.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 8, marginBottom: 5 }}>Telefono</Text>

            <ClearableTextInput
              ref={phoneInputRef}
              keepClearControlMounted
              reserveSymmetricClearSpace
              placeholder="Inserisci numero di telefono"
              placeholderTextColor="#9a9a9a"
              value={draft.telefono}
              onChangeText={(value) => {
                updateDraft('telefono', limitPhoneToTenDigits(value));
                clearError('telefono');
              }}
              onFocus={() => scrollToField(phoneInputRef)}
              editable={!saving && !loadingInit}
              keyboardType="phone-pad"
              style={[
                styles.input,
                isDesktopWebLayout && styles.inputDesktopWide,
                errors.telefono && styles.inputError,
              ]}
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => focusField(emailInputRef)}
              blurOnSubmit={false}
            />
            {errors.telefono ? (
              <Text style={styles.fieldErrorText}>{errors.telefono}</Text>
            ) : null}

            <Text style={{ color: formPalette.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 8, marginBottom: 5 }}>Email · facoltativa</Text>

            <ClearableTextInput
              ref={emailInputRef}
              keepClearControlMounted
              reserveSymmetricClearSpace
              placeholder="Email (Opzionale)"
              placeholderTextColor="#9a9a9a"
              value={draft.email}
              onChangeText={(value) => {
                updateDraft('email', value);
                clearError('email');
              }}
              onFocus={() => scrollToField(emailInputRef)}
              editable={!saving && !loadingInit}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.input,
                isDesktopWebLayout && styles.inputDesktopWide,
                errors.email && styles.inputError,
              ]}
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => focusField(instagramInputRef)}
              blurOnSubmit={false}
            />
            {errors.email ? (
              <Text style={styles.fieldErrorText}>{errors.email}</Text>
            ) : null}
            <View style={styles.optionalEmailInfo}>
              <Ionicons name="mail-outline" size={18} color={styles.__premiumIcon.color} />
              <View style={styles.optionalEmailInfoText}>
                <Text style={styles.optionalEmailInfoTitle}>Email opzionale</Text>
                <Text style={styles.optionalEmailInfoBody}>
                  Se il salone non ne è in possesso, può lasciarla vuota. Al primo accesso il
                  cliente dovrà inserirla e verificarla tramite codice OTP prima di poter entrare.
                </Text>
              </View>
            </View>

            <Text style={{ color: formPalette.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 8, marginBottom: 5 }}>Instagram · facoltativo</Text>

            <ClearableTextInput
              ref={instagramInputRef}
              keepClearControlMounted
              reserveSymmetricClearSpace
              placeholder="Instagram (Opzionale)"
              placeholderTextColor="#9a9a9a"
              value={draft.instagram}
              onChangeText={(value) => updateDraft('instagram', value)}
              onFocus={() => scrollToField(instagramInputRef)}
              editable={!saving && !loadingInit}
              autoCapitalize="none"
              style={[styles.input, isDesktopWebLayout && styles.inputDesktopWide]}
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => focusField(noteInputRef)}
              blurOnSubmit={false}
            />

            <View style={styles.customerNoteFieldCard}>
              <View style={styles.customerNoteFieldHeader}>
                <View style={styles.customerNoteFieldIcon}>
                  <Ionicons name="information" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.customerNoteFieldCopy}>
                  <Text style={styles.customerNoteFieldTitle}>Note cliente</Text>
                  <Text style={styles.customerNoteFieldSubtitle}>
                    Informazioni interne visibili solo al salone.
                  </Text>
                </View>
              </View>
              <TextInput
                ref={noteInputRef}
                value={draft.notaCliente}
                onChangeText={(value) => updateDraft('notaCliente', value)}
                placeholder="Preferenze e informazioni utili"
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={1000}
                editable={!saving && !loadingInit}
                style={styles.customerNoteInput}
                textAlignVertical="top"
                onFocus={() => scrollToField(noteInputRef)}
                returnKeyType="default"
              />
            </View>

            <HapticTouchable
              style={[
                styles.input,
                styles.dateInputButton,
                styles.dateInputAfterCustomerNote,
                isDesktopWebLayout && styles.dateInputButtonDesktop,
                isDesktopWebLayout && styles.dateInputAfterCustomerNoteWeb,
                (saving || loadingInit) && styles.primaryButtonDisabled,
                {flex:0,alignSelf:'center',width:240,maxWidth:'100%',minHeight:46},
              ]}
              onPress={() => {
                Keyboard.dismiss();
                onBirthdayPress(draftRef.current.birthday);
              }}
              disabled={saving || loadingInit}
              pressScale={0.98}
              pressOpacity={0.98}
            >
              <Text
                style={[
                  styles.dateInputText,
                  !draft.birthday && styles.dateInputPlaceholder,
                ]}
              >
                {formatBirthdayLabel(draft.birthday) || 'Data di nascita (Opzionale)'}
              </Text>
            </HapticTouchable>

            {draft.birthday ? (
              <HapticTouchable
                style={styles.clearDateChip}
                onPress={() => updateDraft('birthday', '')}
                disabled={saving || loadingInit}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.clearDateChipText}>Rimuovi data</Text>
              </HapticTouchable>
            ) : null}
          </View>

          <Text style={styles.requiredFieldsHint}>
            Campi obbligatori: nome, cognome e numero di telefono.
          </Text>

          <View
            style={[[
              styles.actionRow,
              isDesktopWebLayout && styles.actionColumnDesktop,
            ], {width:'100%',flexDirection:'column',flexWrap:'nowrap',alignItems:'center',justifyContent:'center',gap:10}]}
          >
            <FormResetLink onPress={reset} disabled={saving || loadingInit || !canClear} pressScale={0.975} pressOpacity={0.98}>Svuota</FormResetLink>

            <HapticTouchable
              style={[
                styles.primaryButtonInline,
                isDesktopWebLayout && styles.primaryButtonInlineDesktop,
                (saving || loadingInit) && styles.primaryButtonDisabled,
              ]}
              onPress={() => void onSubmit(draftRef.current)}
              disabled={saving || loadingInit}
              pressScale={0.975}
              pressOpacity={0.98}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  (saving || loadingInit) && styles.primaryButtonTextDisabled,
                ]}
              >
                {saving ? 'Salvataggio...' : 'Aggiungi cliente'}
              </Text>
            </HapticTouchable>
          </View>
        </Animated.View>
      );
      if (Platform.OS === 'web') return (
        <Modal visible={visible} supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent animationType="fade" onRequestClose={onClose}>
          <OwnerPremiumSheetFrame kind="customer" title="Nuovo cliente" icon="person-add-outline" onClose={onClose} scrollRef={creatorScrollRef}>
            {content}
          </OwnerPremiumSheetFrame>
        </Modal>
      );
      return (
        <Modal visible={visible} supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent animationType="none" onRequestClose={onClose}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <CreationSheet premiumWeb title="Nuovo cliente" icon="person-add-outline" onClose={onClose} scrollRef={creatorScrollRef} onRevealFocusedField={revealCreatorField}>
              {content}
            </CreationSheet>
            {nativeOverlays}
          </GestureHandlerRootView>
        </Modal>
      );
    }
  )
);

/** Keeps edit keystrokes and validation feedback out of ClientiScreen. */
const CustomerEditorForm = React.memo(
  React.forwardRef<CustomerEditorFormHandle, CustomerEditorFormProps>(
    function CustomerEditorForm(
      {
        customer,
        saving,
        loadingInit,
        keyboardOpen,
        isDesktopWebLayout,
        scrollRef,
        nameInputRef,
        surnameInputRef,
        phoneInputRef,
        emailInputRef,
        instagramInputRef,
        noteInputRef,
        focusField,
        scrollToField,
        onBirthdayPress,
        onClose,
        onSubmit,
      },
      forwardedRef
    ) {
      const [draft, setDraft] = useState<CustomerEditorDraft>(() =>
        buildCustomerEditorDraft(customer)
      );
      const [errors, setErrors] = useState<CustomerFormErrors>({});

      React.useImperativeHandle(
        forwardedRef,
        () => ({
          setBirthday: (value: string) =>
            setDraft((current) => ({ ...current, birthday: value })),
          setErrors,
        }),
        []
      );

      const updateDraft = useCallback(
        <Key extends keyof CustomerEditorDraft,>(
          key: Key,
          value: CustomerEditorDraft[Key]
        ) => {
          setDraft((current) => ({ ...current, [key]: value }));
        },
        []
      );

      const clearError = useCallback((key: keyof CustomerFormErrors) => {
        setErrors((current) =>
          current[key] ? { ...current, [key]: undefined } : current
        );
      }, []);

      const canSubmit =
        isValidPersonNamePart(draft.nome) &&
        isValidPersonNamePart(draft.cognome) &&
        isValidPhone10(draft.telefono.trim()) &&
        (!draft.email.trim() || isValidEmail(draft.email.trim())) &&
        !(customer.email?.trim() && !draft.email.trim());

      return <CustomerEditorPremiumContent draft={draft} errors={errors} linkedEmail={!!customer.email?.trim()} saving={saving} loadingInit={loadingInit} canSubmit={canSubmit} keyboardOpen={keyboardOpen} scrollRef={scrollRef} nameInputRef={nameInputRef} surnameInputRef={surnameInputRef} phoneInputRef={phoneInputRef} emailInputRef={emailInputRef} instagramInputRef={instagramInputRef} noteInputRef={noteInputRef} focusField={focusField} scrollToField={scrollToField} onChange={(key,value)=>{updateDraft(key,value);if(key==='nome'||key==='cognome'||key==='telefono'||key==='email')clearError(key);}} onBirthdayPress={onBirthdayPress} birthdayLabel={formatBirthdayLabel(draft.birthday)||''} onSubmit={()=>void onSubmit(draft)}/>;
    }
  )
);

/** Keeps search echo and filtering inside the reachable online-policy sheet. */
const CustomerOnlinePolicyServiceSearch = React.memo(
  function CustomerOnlinePolicyServiceSearch({
    services,
    overrides,
    setOverrides,
  }: {
    services: CustomerOnlinePolicyCatalogItem[];
    overrides: CustomerOnlineServiceOverrideMap;
    setOverrides: React.Dispatch<
      React.SetStateAction<CustomerOnlineServiceOverrideMap>
    >;
  }) {
    const styles=useCustomerPremiumStyles(baseCustomerStyles);
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const serviceGroups = useMemo(() => {
      const search = deferredQuery.trim().toLocaleLowerCase('it');
      const groups = new Map<string, CustomerOnlinePolicyCatalogItem[]>();
      services.forEach((service) => {
        if (
          search &&
          !service.nome.toLocaleLowerCase('it').includes(search) &&
          !(service.mestiereRichiesto || '')
            .toLocaleLowerCase('it')
            .includes(search)
        ) {
          return;
        }
        const role = service.mestiereRichiesto?.trim() || 'Senza mestiere';
        groups.set(role, [...(groups.get(role) ?? []), service]);
      });
      return Array.from(groups.entries());
    }, [deferredQuery, services]);

    return (
      <>
        <PremiumSearchToolbar><View style={styles.onlinePolicySearchWrap}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.onlinePolicySearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca servizio o mestiere"
            placeholderTextColor="#94A3B8"
            autoCorrect={false}
            returnKeyType="done"
          />
          {query ? (
            <HapticTouchable
              style={styles.onlinePolicySearchClear}
              onPress={() => setQuery('')}
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </HapticTouchable>
          ) : null}
        </View></PremiumSearchToolbar>

        <View style={styles.onlinePolicyGroups}>
          {serviceGroups.map(([role, roleServices]) => (
            <View key={role} style={styles.onlinePolicyGroup}>
              <View style={styles.onlinePolicyGroupHeader}>
                <View style={styles.onlinePolicyGroupDot} />
                <Text style={styles.onlinePolicyGroupTitle}>{role}</Text>
                <Text style={styles.onlinePolicyGroupCount}>{roleServices.length}</Text>
              </View>
              {roleServices.map((service) => {
                const inheritedBlocked = service.componentServiceIds.some(
                  (serviceId) => overrides[serviceId] === false
                );
                const allowed =
                  !inheritedBlocked && overrides[service.policyKey] !== false;
                return (
                  <HapticTouchable
                    key={service.policyKey}
                    style={[
                      styles.onlinePolicyServiceRow,
                      !allowed && styles.onlinePolicyServiceRowBlocked,
                    ]}
                    onPress={() =>
                      setOverrides((current) => {
                        if (inheritedBlocked) return current;
                        if (current[service.policyKey] === false) {
                          const next = { ...current };
                          delete next[service.policyKey];
                          return next;
                        }
                        return { ...current, [service.policyKey]: false };
                      })
                    }
                    pressScale={0.992}
                    pressOpacity={0.98}
                  >
                    <View style={styles.onlinePolicyServiceCopy}>
                      <Text style={styles.onlinePolicyServiceName}>{service.nome}</Text>
                      <View style={styles.onlinePolicyServiceMetaRow}>
                        {service.compositionId ? (
                          <View style={styles.onlinePolicyCompositionBadge}>
                            <Ionicons name="layers-outline" size={13} color="#6D28D9" />
                            <Text style={styles.onlinePolicyCompositionBadgeText}>
                              Composizione
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.onlinePolicyServiceMeta}>
                          {service.durataMinuti ?? 60} min
                        </Text>
                        {inheritedBlocked ? (
                          <View style={styles.onlinePolicyInheritedBlockBadge}>
                            <Ionicons name="link-outline" size={12} color="#B45309" />
                            <Text style={styles.onlinePolicyInheritedBlockBadgeText}>
                              Esclusa da un servizio collegato
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.onlinePolicyToggle,
                        allowed && styles.onlinePolicyToggleAllowed,
                      ]}
                    >
                      <View
                        style={[
                          styles.onlinePolicyToggleThumb,
                          allowed && styles.onlinePolicyToggleThumbAllowed,
                        ]}
                      />
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>
          ))}
          {serviceGroups.length === 0 ? (
            <View style={styles.onlinePolicyEmpty}>
              <Ionicons name="search-outline" size={24} color="#94A3B8" />
              <Text style={styles.onlinePolicyEmptyText}>
                Nessun servizio corrisponde alla ricerca.
              </Text>
            </View>
          ) : null}
        </View>
      </>
    );
  }
);

export default function ClientiScreen() {
  const clientiIsFocused=useIsFocused();
  const {palette:customerPalette,toggle:toggleCustomerTheme}=useAccessAppearance();
  const nativeScreenInsets=useSafeAreaInsets();
  const styles=useMemo(()=>nativeCustomersStyles(baseCustomerStyles,customerPalette),[customerPalette]);
  const ownerStartupLoading = useOwnerStartupLoading();
  const clientiPerfCountersRef = useRef({
    renderCount: 0,
    scrollEvents: 0,
    layoutEvents: 0,
    lastFlushAt: Date.now(),
  });
  if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
    const counters = clientiPerfCountersRef.current;
    counters.renderCount += 1;
    const now = Date.now();
    if (now - counters.lastFlushAt >= 1000) {
      logAndroidBackofficePerf('clienti_render_scroll_rate', {
        rendersPerSec: counters.renderCount,
        scrollEventsPerSec: counters.scrollEvents,
        layoutEventsPerSec: counters.layoutEvents,
      });
      counters.renderCount = 0;
      counters.scrollEvents = 0;
      counters.layoutEvents = 0;
      counters.lastFlushAt = now;
    }
  }
  const responsive = useResponsiveLayout();
  const { height: windowHeight } = useWindowDimensions();
  const {
    salonWorkspace,
    updateSalonWorkspacePersisted,
    setCustomerReminderHoursPersisted,
    ownerWorkspaceSettingsHydrated,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    salonAccountEmail,
    clienti: localClienti,
    servizi,
    richiestePrenotazione,
    setClienti: setLocalClienti,
    createClientePersisted,
    updateClientePersisted,
    saveCustomerServiceDurationOverride,
    saveCustomerServicePriceOverride,
    saveCustomerOnlineBookingPolicy,
    deleteClientePersisted,
    decideCustomerRegistration,
  } = useAppContext();
  const customerPremium = useCustomerPremium(salonWorkspace.id);
  const customerPremiumStatuses = useMemo(()=>new Map(customerPremium.ready ? customerPremium.summary?.customers.map(item=>[item.customerId,item]) : []),[customerPremium.ready,customerPremium.summary]);
  const { refreshBadges } = useUnreadBadges();
  const listRef = useRef<FlatList<ClientiUnifiedListItem> | null>(null);
  const startupWasLoading = useRef(ownerStartupLoading);
  React.useEffect(() => {
    if (startupWasLoading.current && !ownerStartupLoading && Platform.OS === 'ios') {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    startupWasLoading.current = ownerStartupLoading;
  }, [ownerStartupLoading]);

  const swipeableRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({});
  const clientSwipeIntentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientSwipeOwnerRef = useRef<string | null>(null);
  const clientCardTouchActiveRef = useRef(false);
  const pendingClientSwipeResetRef = useRef<string | null>(null);
  const [swipeConfirmation, setSwipeConfirmation] = useState<{
    title: string; message: string; buttons: NonNullable<Parameters<typeof Alert.alert>[2]>;
  } | null>(null);
  const showSwipeConfirmation = useCallback((title: string, message: string,
    buttons: NonNullable<Parameters<typeof Alert.alert>[2]>) => {
    setSwipeConfirmation({ title, message, buttons });
  }, []);
  const pendingWebConfirmation = useRef<((confirmed: boolean) => void) | null>(null);
  React.useEffect(() => () => { pendingWebConfirmation.current?.(false); }, []);
  const confirmWebAction = useCallback((message: string, action = 'Conferma') => new Promise<boolean>(resolve => {
    pendingWebConfirmation.current?.(false);
    pendingWebConfirmation.current = resolve;
    const finish = (confirmed: boolean) => { pendingWebConfirmation.current = null; resolve(confirmed); };
    showSwipeConfirmation(action, message, [
      { text: 'Annulla', style: 'cancel', onPress: () => finish(false) },
      { text: action, style: action === 'Sblocca' || action === 'Salva nome' ? 'default' : 'destructive', onPress: () => finish(true) },
    ]);
  }), [showSwipeConfirmation]);
  const openClientSwipeRef = useRef<string | null>(null);
  const clientSwipeOpenedAtRef = useRef(0);
  const headerExpandTouchActiveRef = useRef(false);
  const headerExpandTouchResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerExpandSwipeCleanupFrameRef = useRef<number | null>(null);
  const deleteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableCancellationCountsByIdentityRef = useRef<Map<string, number>>(new Map());
  const stableCancellationCountsOwnerRef = useRef('');
  const nameInputRef = useRef<TextInput | null>(null);
  const surnameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const instagramInputRef = useRef<TextInput | null>(null);
  const noteInputRef = useRef<TextInput | null>(null);
  const editCustomerScrollRef = useRef<ScrollView | null>(null);
  const editNameInputRef = useRef<TextInput | null>(null);
  const editSurnameInputRef = useRef<TextInput | null>(null);
  const editPhoneInputRef = useRef<TextInput | null>(null);
  const editEmailInputRef = useRef<TextInput | null>(null);
  const editInstagramInputRef = useRef<TextInput | null>(null);
  const editNoteInputRef = useRef<TextInput | null>(null);
  const customerCreatorFormRef = useRef<CustomerCreatorFormHandle | null>(null);
  const nativeCustomerPanelOpenRef = useRef(false);
  const customerEditorFormRef = useRef<CustomerEditorFormHandle | null>(null);

  const [clienteInModifica, setClienteInModifica] = useState<ClienteItem | null>(null);
  const [limitConfigClient, setLimitConfigClient] = useState<ClienteItem | null>(null);
  const [limitTargetClient, setLimitTargetClient] = useState<ClienteItem | null>(null);
  const [limitTargetMode, setLimitTargetMode] = useState<BookingLimitMode | null>(null);
  const customerServiceSearchStateRef = useRef<Record<string, CustomerServiceSearchState>>({});
  const [durationConfigClient, setDurationConfigClient] = useState<ClienteItem | null>(null);
  const [durationPickerTarget, setDurationPickerTarget] = useState<{
    serviceId: string;
    field: 'duration' | 'initial' | 'processing' | 'final';
  } | null>(null);
  const [durationOverrideSavingServiceId, setDurationOverrideSavingServiceId] = useState('');
  const [pricePickerServiceId, setPricePickerServiceId] = useState('');
  const [priceOverrideSavingServiceId, setPriceOverrideSavingServiceId] = useState('');
  const [customerNoteClient, setCustomerNoteClient] = useState<ClienteItem | null>(null);
  const customerSheetDockStyle = useCustomerSheetDockStyle(16, true);
  const [paymentPolicyClient, setPaymentPolicyClient] = useState<ClienteItem | null>(null);
  const [benefitsConsoleOpen, setBenefitsConsoleOpen] = useState(false);
  const [benefitsInitialSection,setBenefitsInitialSection]=useState<"settings"|"packages"|"points"|"gifts">("settings");
  const [packageClient, setPackageClient] = useState<ClienteItem | null>(null);
  const [customerRulesSection, setCustomerRulesSection] = useState<'limits' | 'online'>('limits');
  const [onlinePolicyClient, setOnlinePolicyClient] = useState<ClienteItem | null>(null);
  const [onlinePolicyMode, setOnlinePolicyMode] =
    useState<CustomerBookingAcceptanceMode>('inherit');
  const [onlinePolicyAllowSameDaySameService, setOnlinePolicyAllowSameDaySameService] =
    useState(true);
  const [onlinePolicyOverrides, setOnlinePolicyOverrides] =
    useState<CustomerOnlineServiceOverrideMap>({});
  const [onlinePolicySaving, setOnlinePolicySaving] = useState(false);
  const [onlinePolicyError, setOnlinePolicyError] = useState('');
  const [onlinePolicyCompositions, setOnlinePolicyCompositions] = useState<
    CustomerOnlinePolicyCatalogItem[]
  >([]);
  const [bookingLimitVisualOverrides, setBookingLimitVisualOverrides] = useState<
    Record<
      string,
      {
        maxFutureAppointments: number | null;
        maxFutureAppointmentsMode: 'total_future' | 'monthly' | null;
        maxDailyAppointments: number | null;
        updatedAt: number;
      }
    >
  >({});

  const [createBirthdayPickerValue, setCreateBirthdayPickerValue] = useState<
    string | null
  >(null);
  const [editBirthdayPickerValue, setEditBirthdayPickerValue] = useState<
    string | null
  >(null);
  const [ricerca, setRicerca] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState<'all' | 'pending'>('all');
  const [registrationDecisions, setRegistrationDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const registrationDecisionsRef = useRef(new Set<string>());

  const [loadingInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [customerEditorKeyboardHeight, setCustomerEditorKeyboardHeight] = useState(0);
  const [pendingDeletedClient, setPendingDeletedClient] = useState<{
    item: (typeof localClienti)[number];
    previousIndex: number;
  } | null>(null);
  const [deletedClientIdentityKeys, setDeletedClientIdentityKeys] = useState<string[]>([]);
  const [deletedClientNormalizedNames, setDeletedClientNormalizedNames] = useState<string[]>([]);
  const [deletedClientIdentityKeysHydratedFor, setDeletedClientIdentityKeysHydratedFor] =
    useState('');
  const [deletedClientHydrationNonce, setDeletedClientHydrationNonce] = useState(0);
  const deletedClientMutationRevisionRef = useRef(0);
  const [openWebClientActionsId, setOpenWebClientActionsId] = useState<string | null>(null);
  const [rubricaGuideOpen, setRubricaGuideOpen] = useState(false);
  const [remindersGuideOpen, setRemindersGuideOpen] = useState(false);
  const [showNewCustomerExpanded, setShowNewCustomerExpanded] = useState(false);
  const [showCommunicationsModal, setShowCommunicationsModal] = useState(false);
  const [isUpdatingCustomerReminder, setIsUpdatingCustomerReminder] = useState(false);
  const [customerReminderSaveError, setCustomerReminderSaveError] = useState('');
  const [displayedCustomerReminderHours, setDisplayedCustomerReminderHours] = useState<number>(
    Math.max(0, Math.min(168, Math.round(salonWorkspace.customerReminderHoursBefore ?? 24)))
  );
  const webClientActionsTapRef = useRef<{ id: string | null; ts: number }>({
    id: null,
    ts: 0,
  });
  const [customerFeedbackDialog, setCustomerFeedbackDialog] = useState<{
    visible: boolean;
    kind: 'success' | 'error';
    eyebrow: string;
    title: string;
    message: string;
    buttonLabel: string;
  }>({
    visible: false,
    kind: 'success',
    eyebrow: 'Clienti',
    title: '',
    message: '',
    buttonLabel: 'Continua',
  });
  const openCustomerFeedbackDialog = useCallback(
    ({
      kind,
      title,
      message,
      eyebrow = 'Clienti',
      buttonLabel = kind === 'error' ? 'Ho capito' : 'Continua',
    }: {
      kind: 'success' | 'error';
      title: string;
      message: string;
      eyebrow?: string;
      buttonLabel?: string;
    }) => {
      setCustomerFeedbackDialog({
        visible: true,
        kind,
        eyebrow,
        title,
        message: kind === 'error' ? customerFeedbackMessage(message) : message,
        buttonLabel,
      });
    },
    []
  );
  const pendingEditCustomerFeedbackRef = useRef<{
    kind: 'success' | 'error';
    title: string;
    message: string;
    eyebrow?: string;
    buttonLabel?: string;
  } | null>(null);
  const paymentPolicyScrollRef = useRef<ScrollView | null>(null);
  useKeyboardAwareScroll(paymentPolicyScrollRef, { autoScrollOnKeyboardShow: !!paymentPolicyClient, topOffset: 20 });
  const onlinePolicyScrollRef = useRef<ScrollView | null>(null);
  useKeyboardAwareScroll(onlinePolicyScrollRef, { topOffset: 20, autoScrollOnKeyboardShow: !!onlinePolicyClient });
  const [clientDetailsId,setClientDetailsId]=useState<string|null>(null);
  const pendingClientDetailsActionRef = useRef<null | {kind: 'edit' | 'benefits' | 'options'; customer: ClienteItem}>(null);
  const customerSearchInputRef = useRef<TextInput | null>(null);
  const { focusField, scrollToField } = useKeyboardAwareScroll(listRef, {
    topOffset: responsive.isDesktop ? 72 : 176,
    autoScrollOnKeyboardShow: Platform.OS !== 'web',
    shouldScrollNode: (node) => !nativeCustomerPanelOpenRef.current && node === customerSearchInputRef.current,
  });
  const {
    focusField: focusCustomerEditorField,
    scrollToField: scrollToCustomerEditorField,
  } = useKeyboardAwareScroll(editCustomerScrollRef, {
    topOffset: 18,
    scrollDelay: 24,
    focusScrollDelay: 48,
    autoScrollOnKeyboardShow: showEditCustomerModal,
    onlyScrollWhenCovered: true,
  });
  const nameFieldScrollTopOffset = responsive.isDesktop ? 52 : 156;
  const isDesktopWebLayout = Platform.OS === 'web';
  const isDesktopWebClientActionsLayout = Platform.OS === 'web';
  const webClientGridAvailableWidth =
    Platform.OS === 'web'
      ? Math.max(
          0,
          Math.min(
            responsive.width - (responsive.width >= 1000 ? OWNER_RAIL_WIDTH : 0) - responsive.horizontalPadding * 2,
            responsive.contentMaxWidth ?? responsive.width,
          ) - 32,
        )
      : 0;
  const webClientGridColumnCount =
    webClientGridAvailableWidth >= 1260
      ? 4
      : webClientGridAvailableWidth >= 860
        ? 3
        : webClientGridAvailableWidth >= 580
          ? 2
          : 1;
  const webClientGridItemStyle = useMemo(
    () =>
      ({
        width:
          webClientGridColumnCount === 1
            ? '100%'
            : `calc(${100 / webClientGridColumnCount}% - ${
                (12 * (webClientGridColumnCount - 1)) /
                webClientGridColumnCount
              }px)`,
        minWidth: 0,
        flexGrow: 0,
        flexShrink: 0,
      }) as unknown as ViewStyle,
    [webClientGridColumnCount],
  );
  React.useEffect(() => {
    if (!showEditCustomerModal || Platform.OS === 'web') {
      setCustomerEditorKeyboardHeight(0);
      return;
    }

    const updateKeyboardHeight = (event: { endCoordinates?: { height?: number } }) => {
      const nextKeyboardHeight = Math.max(0, event.endCoordinates?.height ?? 0);
      setCustomerEditorKeyboardHeight((current) =>
        Math.abs(current - nextKeyboardHeight) >= 8 ? nextKeyboardHeight : current
      );
    };
    const resetKeyboardHeight = () => setCustomerEditorKeyboardHeight(0);

    const showSubscription = Keyboard.addListener('keyboardDidShow', updateKeyboardHeight);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', resetKeyboardHeight);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [showEditCustomerModal]);
  React.useEffect(() => {
    if (!showEditCustomerModal) {
      return;
    }

    requestAnimationFrame(() => {
      editCustomerScrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  }, [clienteInModifica?.id, showEditCustomerModal]);
  const customerEditorKeyboardOpen = customerEditorKeyboardHeight > 0;
  React.useEffect(() => {
    if (!isDesktopWebClientActionsLayout) {
      return;
    }

    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) {
      return;
    }

    const previousBodyOverflowX = doc.body.style.overflowX;
    const previousHtmlOverflowX = doc.documentElement.style.overflowX;
    const previousHtmlOverscrollBehaviorX = doc.documentElement.style.overscrollBehaviorX;

    doc.body.style.overflowX = 'hidden';
    doc.documentElement.style.overflowX = 'hidden';
    doc.documentElement.style.overscrollBehaviorX = 'none';

    return () => {
      doc.body.style.overflowX = previousBodyOverflowX;
      doc.documentElement.style.overflowX = previousHtmlOverflowX;
      doc.documentElement.style.overscrollBehaviorX = previousHtmlOverscrollBehaviorX;
    };
  }, [isDesktopWebClientActionsLayout]);
  const handleKeyboardNext = useCallback(() => {
    if (showEditCustomerModal) {
      focusNextInput(
        [
          editNameInputRef,
          editSurnameInputRef,
          editPhoneInputRef,
          editEmailInputRef,
          editInstagramInputRef,
          editNoteInputRef,
        ],
        focusCustomerEditorField
      );
      return;
    }

    focusNextInput(
      [nameInputRef, surnameInputRef, phoneInputRef, emailInputRef, instagramInputRef, noteInputRef],
      focusField
    );
  }, [focusCustomerEditorField, focusField, showEditCustomerModal]);
  const mapLocalClientsToScreen = useCallback(
    (items: typeof localClienti, fallbackSalonId: string) =>
      items.map((item) => ({
        id: item.id,
        full_name: item.nome,
        phone: item.telefono,
        email: item.email ?? null,
        instagram: item.instagram ?? null,
        birthday: item.birthday ?? null,
        note: item.nota ?? null,
        is_active: item.inibito !== true,
        viewedBySalon: item.viewedBySalon,
        registrationStatus: item.registrationStatus,
        annullamentiCount: item.annullamentiCount ?? 0,
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
        serviceDurationOverrides: item.serviceDurationOverrides,
        servicePriceOverrides: item.servicePriceOverrides,
        onlineBookingAcceptanceMode: normalizeCustomerBookingAcceptanceMode(
          item.onlineBookingAcceptanceMode
        ),
        allowSameDaySameService: item.allowSameDaySameService !== false,
        onlineServiceOverrides: normalizeCustomerOnlineServiceOverrides(
          item.onlineServiceOverrides
        ),
        salon_id: fallbackSalonId,
      })),
    []
  );

  const clientCancellationCountsByIdentity = useMemo(() => {
    const counts = new Map<string, number>();
    const canonicalCancelledRequests = new Map<string, (typeof richiestePrenotazione)[number]>();

    richiestePrenotazione.forEach((item) => {
      if (item.stato !== 'Annullata' || item.cancellationSource !== 'cliente') {
        return;
      }

      const stableKey = buildCancellationRequestStableKey(item);
      const current = canonicalCancelledRequests.get(stableKey);

      if (current && compareCancellationRequestAuthority(current, item) >= 0) {
        return;
      }

      canonicalCancelledRequests.set(stableKey, item);
    });

    canonicalCancelledRequests.forEach((item) => {
      buildFrontendClientIdentityAliases({
        id: item.customerId,
        telefono: item.telefono,
        email: item.email,
      }).forEach((alias) => {
        counts.set(alias, (counts.get(alias) ?? 0) + 1);
      });
    });

    return counts;
  }, [richiestePrenotazione]);

  const stableClientCancellationCountsByIdentity = useMemo(() => {
    const normalizedOwnerEmail = salonAccountEmail.trim().toLowerCase();

    if (stableCancellationCountsOwnerRef.current !== normalizedOwnerEmail) {
      stableCancellationCountsOwnerRef.current = normalizedOwnerEmail;
      stableCancellationCountsByIdentityRef.current = new Map();
    }

    const stableCounts = stableCancellationCountsByIdentityRef.current;
    const writeStableCountForAliases = (aliases: string[], count: number) => {
      if (aliases.length === 0 || count <= 0) {
        return;
      }

      const stableCount = aliases.reduce(
        (maxCount, alias) => Math.max(maxCount, stableCounts.get(alias) ?? 0),
        count
      );

      aliases.forEach((alias) => {
        stableCounts.set(alias, stableCount);
      });
    };

    clientCancellationCountsByIdentity.forEach((count, alias) => {
      writeStableCountForAliases([alias], count);
    });

    localClienti.forEach((item) => {
      const aliases = buildFrontendClientIdentityAliases(item);
      const liveCount = getFrontendClientCancellationCount(
        item,
        clientCancellationCountsByIdentity
      );
      writeStableCountForAliases(aliases, Math.max(item.annullamentiCount ?? 0, liveCount));
    });

    return new Map(stableCounts);
  }, [clientCancellationCountsByIdentity, localClienti, salonAccountEmail]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      const workspaceId = salonWorkspace.id?.trim() ?? '';
      const hydrationRevision = deletedClientMutationRevisionRef.current;
      if (!normalizedEmail) {
        setDeletedClientIdentityKeys([]);
        setDeletedClientNormalizedNames([]);
        setDeletedClientIdentityKeysHydratedFor('');
        return () => {
          active = false;
        };
      }

      setDeletedClientIdentityKeysHydratedFor('');

      const hydrateDeletedCustomers = async () => {
        const raw = await AsyncStorage.getItem(
          buildDeletedCustomerStorageKey(normalizedEmail),
        );
        const localEntries = raw ? (JSON.parse(raw) as [string, number][]) : [];
        const localKeys = localEntries
          .filter(
            (entry): entry is [string, number] =>
              Array.isArray(entry) &&
              typeof entry[0] === 'string' &&
              typeof entry[1] === 'number',
          )
          .map(([key]) => key.trim())
          .filter(Boolean);

        if (!isUuidLike(workspaceId)) {
          throw new Error('owner_workspace_not_ready');
        }

        const { data, error } = await supabase.rpc(
          'get_owner_customer_deletion_tombstones_v1',
          { p_workspace_id: workspaceId },
        );
        if (error) {
          throw error;
        }

        const result = data as {
          ok?: boolean;
          workspace_id?: string;
          tombstones?: {
            customer_id?: string | null;
            normalized_name?: string | null;
          }[];
        } | null;
        if (
          !result?.ok ||
          result.workspace_id?.trim().toLowerCase() !== workspaceId.toLowerCase() ||
          !Array.isArray(result.tombstones)
        ) {
          throw new Error('owner_customer_tombstones_not_confirmed');
        }

        const serverIdentityKeys: string[] = [];
        const serverNames: string[] = [];
        result.tombstones.forEach((tombstone) => {
          const customerId = normalizeIdentityText(tombstone.customer_id);
          const normalizedName = normalizeIdentityText(tombstone.normalized_name);
          if (customerId) {
            serverIdentityKeys.push(`id:${customerId}`);
          }
          if (normalizedName) {
            serverNames.push(normalizedName);
          }
        });

        if (
          !active ||
          deletedClientMutationRevisionRef.current !== hydrationRevision
        ) {
          return;
        }

        setDeletedClientIdentityKeys(
          Array.from(new Set([...localKeys, ...serverIdentityKeys])),
        );
        setDeletedClientNormalizedNames(Array.from(new Set(serverNames)));
        setDeletedClientIdentityKeysHydratedFor(normalizedEmail);
      };

      void hydrateDeletedCustomers().catch(() => {
        if (
          active &&
          deletedClientMutationRevisionRef.current === hydrationRevision
        ) {
          // Fail closed: mostriamo i clienti canonici gia filtrati dal
          // contesto, ma non ricreiamo identita dallo storico finche il server
          // non ha confermato i tombstone del workspace aperto.
          setDeletedClientIdentityKeysHydratedFor('');
        }
      });

      return () => {
        active = false;
      };
    }, [deletedClientHydrationNonce, salonAccountEmail, salonWorkspace.id]),
  );

  const effectiveLocalClienti = useMemo(() => {
    const normalizedOwnerEmail = salonAccountEmail.trim().toLowerCase();
    const deletionGuardReady =
      !normalizedOwnerEmail ||
      deletedClientIdentityKeysHydratedFor === normalizedOwnerEmail;
    const deletedKeySet = new Set(deletedClientIdentityKeys);
    const deletedNameSet = new Set(deletedClientNormalizedNames);
    const rawClienti = localClienti
      .filter((item) => {
        const normalizedId = normalizeIdentityText(item.id);
        if (isUuidLike(normalizedId)) {
          return !deletedKeySet.has(`id:${normalizedId}`);
        }

        return !buildFrontendClientIdentityAliases(item).some((alias) =>
          deletedKeySet.has(alias)
        );
      })
      .map((item) => {
        const derivedCancellationCount = getFrontendClientCancellationCount(
          item,
          stableClientCancellationCountsByIdentity
        );

        return {
          ...item,
          annullamentiCount: Math.max(item.annullamentiCount ?? 0, derivedCancellationCount),
        };
      });
    const nextClienti: typeof rawClienti = [];
    const seenKeyIndex = new Map<string, number>();

    rawClienti.forEach((item) => {
      const aliases = buildFrontendClientIdentityAliases(item);
      if (aliases.length === 0) {
        nextClienti.push(item);
        return;
      }

      const existingIndex = aliases
        .map((alias) => seenKeyIndex.get(alias))
        .find((index): index is number => index !== undefined);
      if (existingIndex === undefined) {
        aliases.forEach((alias) => {
          seenKeyIndex.set(alias, nextClienti.length);
        });
        nextClienti.push(item);
        return;
      }

      const existing = nextClienti[existingIndex];
      const itemIsPersisted = isUuidLike(item.id) || item.fonte !== 'frontend';
      const existingIsPersisted = isUuidLike(existing.id) || existing.fonte !== 'frontend';
      const shouldPreferItem = itemIsPersisted && !existingIsPersisted;

      nextClienti[existingIndex] = {
        ...(shouldPreferItem ? item : existing),
        annullamentiCount: Math.max(
          existing.annullamentiCount ?? 0,
          item.annullamentiCount ?? 0
        ),
        inibito: shouldPreferItem ? item.inibito : existing.inibito,
      };
      buildFrontendClientIdentityAliases(nextClienti[existingIndex]).forEach((alias) => {
        seenKeyIndex.set(alias, existingIndex);
      });
    });

    const seenKeys = new Set(
      nextClienti.flatMap((item) => buildFrontendClientIdentityAliases(item))
    );

    if (!deletionGuardReady) {
      return nextClienti;
    }

    richiestePrenotazione.forEach((item) => {
      const keepsCustomerAlive = item.stato === 'In attesa' || item.stato === 'Accettata';
      if ((item.origine ?? 'frontend') !== 'frontend' || !keepsCustomerAlive) {
        return;
      }

      const fullName = `${item.nome} ${item.cognome}`.trim();
      if (deletedNameSet.has(normalizeIdentityText(fullName))) {
        return;
      }
      const derivedClientId = buildFrontendClientIdentityKey({
        id: item.customerId,
        nome: fullName,
        telefono: item.telefono,
        email: item.email,
      });
      if (!derivedClientId) {
        return;
      }

      const derivedClient = {
        id: derivedClientId,
        nome: fullName,
        telefono: item.telefono ?? '',
        email: item.email ?? '',
        instagram: item.instagram ?? '',
        birthday: '',
        // Le note della richiesta restano nella prenotazione: non sono note
        // interne della scheda cliente.
        nota: '',
        fonte: 'frontend' as const,
        viewedBySalon: item.viewedBySalon ?? false,
        annullamentiCount: getFrontendClientCancellationCount(
          {
            id: item.customerId,
            telefono: item.telefono,
            email: item.email,
          },
          stableClientCancellationCountsByIdentity
        ),
        inibito: false,
        maxFutureAppointments: null,
        maxFutureAppointmentsMode: null,
        maxDailyAppointments: null,
      };

      if (
        buildFrontendClientIdentityAliases(derivedClient).some((alias) =>
          deletedKeySet.has(alias)
        )
      ) {
        return;
      }
      const aliases = buildFrontendClientIdentityAliases(derivedClient);
      if (aliases.some((alias) => seenKeys.has(alias))) {
        return;
      }

      aliases.forEach((alias) => {
        seenKeys.add(alias);
      });
      nextClienti.unshift(derivedClient);
    });

    return nextClienti;
  }, [
    deletedClientIdentityKeys,
    deletedClientNormalizedNames,
    deletedClientIdentityKeysHydratedFor,
    localClienti,
    richiestePrenotazione,
    salonAccountEmail,
    stableClientCancellationCountsByIdentity,
  ]);

  React.useEffect(() => {
    setBookingLimitVisualOverrides((current) => {
      const entries = Object.entries(current);
      if (entries.length === 0) {
        return current;
      }

      const now = Date.now();
      let hasChanges = false;
      const next = { ...current };

      entries.forEach(([key, override]) => {
        const isExpired = now - override.updatedAt > CUSTOMER_BOOKING_LIMIT_VISUAL_OVERRIDE_TTL_MS;

        if (isExpired) {
          delete next[key];
          hasChanges = true;
        }
      });

      return hasChanges ? next : current;
    });
  }, [effectiveLocalClienti]);

  const clienti = useMemo(
    () =>
      mapLocalClientsToScreen(
        effectiveLocalClienti.map((item) => {
          const override = bookingLimitVisualOverrides[buildFrontendClientIdentityKey(item)];
          if (!override) {
            return item;
          }

          return {
            ...item,
            maxFutureAppointments: override.maxFutureAppointments,
            maxFutureAppointmentsMode: override.maxFutureAppointmentsMode,
            maxDailyAppointments: override.maxDailyAppointments,
          };
        }),
        salonWorkspace.id
      ),
    [bookingLimitVisualOverrides, effectiveLocalClienti, mapLocalClientsToScreen, salonWorkspace.id]
  );
  const customerIdentityColorsByKey = useCustomerIdentityColors(
    salonWorkspace.id, salonAccountEmail, clienti.map(item => item.id),
  );
  const { setDisableParentSwipe } = useTabSwipeLock();

  const lockClientCardSwipe = useCallback((clientId: string) => {
    if (Platform.OS === 'web') return;
    if (clientSwipeIntentTimeoutRef.current) {
      clearTimeout(clientSwipeIntentTimeoutRef.current);
      clientSwipeIntentTimeoutRef.current = null;
    }
    clientSwipeOwnerRef.current = clientId;
    setDisableParentSwipe(true);
  }, [setDisableParentSwipe]);

  const markClientCardTouchStart = useCallback((clientId: string) => {
    if (Platform.OS === 'web') return;
    clientCardTouchActiveRef.current = true;
    lockClientCardSwipe(clientId);
    clientSwipeIntentTimeoutRef.current = setTimeout(() => {
      clientSwipeIntentTimeoutRef.current = null;
      if (clientSwipeOwnerRef.current === clientId) {
        clientSwipeOwnerRef.current = null;
        setDisableParentSwipe(false);
      }
    }, 220);
  }, [lockClientCardSwipe, setDisableParentSwipe]);

  const closeAllSwipeables = useCallback((exceptId?: string) => {
    Object.entries(swipeableRefs.current).forEach(([clientId, ref]) => {
      if (exceptId && clientId === exceptId) {
        return;
      }

      ref.current?.close();
    });
  }, []);

  const handleClientiScreenTouchEnd = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (clientCardTouchActiveRef.current) {
      clientCardTouchActiveRef.current = false;
      return;
    }
    if (
      openClientSwipeRef.current &&
      Date.now() - clientSwipeOpenedAtRef.current < 180
    ) {
      return;
    }
    clientSwipeOwnerRef.current = null;
    openClientSwipeRef.current = null;
    setDisableParentSwipe(false);
    closeAllSwipeables();
  }, [closeAllSwipeables, setDisableParentSwipe]);

  const clearHeaderExpandTouchMarker = useCallback(() => {
    headerExpandTouchActiveRef.current = false;
    if (headerExpandTouchResetRef.current) {
      clearTimeout(headerExpandTouchResetRef.current);
      headerExpandTouchResetRef.current = null;
    }
  }, []);

  const markHeaderExpandTouchStart = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }

    headerExpandTouchActiveRef.current = true;
    if (headerExpandTouchResetRef.current) {
      clearTimeout(headerExpandTouchResetRef.current);
    }
    headerExpandTouchResetRef.current = setTimeout(() => {
      headerExpandTouchActiveRef.current = false;
      headerExpandTouchResetRef.current = null;
    }, 180);
  }, []);

  const deferHeaderExpandSwipeableCleanup = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (headerExpandSwipeCleanupFrameRef.current !== null) {
      cancelAnimationFrame(headerExpandSwipeCleanupFrameRef.current);
    }
    headerExpandSwipeCleanupFrameRef.current = requestAnimationFrame(() => {
      headerExpandSwipeCleanupFrameRef.current = null;
      closeAllSwipeables();
    });
  }, [closeAllSwipeables]);

  const toggleNewCustomerExpanded = useCallback(() => {
    clearHeaderExpandTouchMarker();
    if (Platform.OS !== 'web') {
      const nextVisible = !nativeCustomerPanelOpenRef.current;
      nativeCustomerPanelOpenRef.current = nextVisible;
      customerCreatorFormRef.current?.setNativeVisible(nextVisible);
      return;
    }
    setShowNewCustomerExpanded((current) => !current);
    deferHeaderExpandSwipeableCleanup();
  }, [clearHeaderExpandTouchMarker, deferHeaderExpandSwipeableCleanup]);

  const closeNewCustomerPanel = useCallback(() => {
    Keyboard.dismiss();
    nativeCustomerPanelOpenRef.current = false;
    customerCreatorFormRef.current?.setNativeVisible(false);
    setCreateBirthdayPickerValue(null);
    setShowNewCustomerExpanded(false);
  }, []);

  const handleClientiHeaderTouchStart = useCallback(() => {
    if (Platform.OS !== 'web' && headerExpandTouchActiveRef.current) {
      return;
    }

    closeAllSwipeables();
  }, [closeAllSwipeables]);

  React.useEffect(
    () => () => {
      clearHeaderExpandTouchMarker();
      if (headerExpandSwipeCleanupFrameRef.current !== null) {
        cancelAnimationFrame(headerExpandSwipeCleanupFrameRef.current);
        headerExpandSwipeCleanupFrameRef.current = null;
      }
    },
    [clearHeaderExpandTouchMarker]
  );

  const releaseClientCardInteraction = useCallback(() => {
    Keyboard.dismiss();
    if (clientSwipeIntentTimeoutRef.current) {
      clearTimeout(clientSwipeIntentTimeoutRef.current);
      clientSwipeIntentTimeoutRef.current = null;
    }
    clientSwipeOwnerRef.current = null;
    setDisableParentSwipe(false);
    closeAllSwipeables();

    requestAnimationFrame(() => {
      if (clientSwipeOwnerRef.current) return;
      setDisableParentSwipe(false);
    });
  }, [closeAllSwipeables, setDisableParentSwipe]);

  React.useEffect(() => {
    if (showEditCustomerModal || !pendingEditCustomerFeedbackRef.current) {
      return;
    }

    const pendingFeedback = pendingEditCustomerFeedbackRef.current;
    const timeout = setTimeout(
      () => {
        if (pendingEditCustomerFeedbackRef.current !== pendingFeedback) {
          return;
        }

        pendingEditCustomerFeedbackRef.current = null;
        releaseClientCardInteraction();
        openCustomerFeedbackDialog(pendingFeedback);
      },
      Platform.OS === 'ios' ? 280 : 0
    );

    return () => clearTimeout(timeout);
  }, [openCustomerFeedbackDialog, releaseClientCardInteraction, showEditCustomerModal]);

  const triggerClientSwipeAction = useCallback(
    (clientId: string, action: () => void) => {
      Keyboard.dismiss();
      pendingClientSwipeResetRef.current = Platform.OS === 'web' ? null : clientId;
      if (Platform.OS === 'web') {
        swipeableRefs.current[clientId]?.current?.close();
      }
      action();
    },
    [setDisableParentSwipe]
  );

  const getSwipeableRef = useCallback((id: string) => {
    if (!swipeableRefs.current[id]) {
      swipeableRefs.current[id] = React.createRef<SwipeableMethods>();
    }

    return swipeableRefs.current[id];
  }, []);
  const resetClientSwipeAfterPopupShown = useCallback(() => {
    const id = pendingClientSwipeResetRef.current;
    pendingClientSwipeResetRef.current = null;
    if (id) swipeableRefs.current[id]?.current?.reset();
    openClientSwipeRef.current = null;
    clientSwipeOwnerRef.current = null;
    setDisableParentSwipe(false);
  }, [setDisableParentSwipe]);

  React.useEffect(
    () => () => {
      if (clientSwipeIntentTimeoutRef.current) {
        clearTimeout(clientSwipeIntentTimeoutRef.current);
        clientSwipeIntentTimeoutRef.current = null;
      }
      clientSwipeOwnerRef.current = null;
      setDisableParentSwipe(false);
    },
    [setDisableParentSwipe]
  );

  React.useEffect(() => {
    const hasBlockingClientLayer =
      !!swipeConfirmation ||
      !!durationConfigClient ||
      !!onlinePolicyClient ||
      showEditCustomerModal ||
      !!limitConfigClient ||
      (!!limitTargetClient && !!limitTargetMode) ||
      customerFeedbackDialog.visible;

    if (hasBlockingClientLayer) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (clientSwipeOwnerRef.current || pendingClientSwipeResetRef.current) return;
      setDisableParentSwipe(false);
      closeAllSwipeables();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    closeAllSwipeables,
    customerFeedbackDialog.visible,
    swipeConfirmation,
    durationConfigClient,
    onlinePolicyClient,
    limitConfigClient,
    limitTargetClient,
    limitTargetMode,
    setDisableParentSwipe,
    showEditCustomerModal,
  ]);

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

  const publicBookingLink = useMemo(
    () => buildSalonClientLink(parsedPublicClientBaseUrl, salonWorkspace.salonCode),
    [parsedPublicClientBaseUrl, salonWorkspace.salonCode]
  );
  const persistedCustomerReminderHoursBefore = Math.max(
    0,
    Math.min(168, Math.round(salonWorkspace.customerReminderHoursBefore ?? 24))
  );
  const customerReminderHoursBefore = displayedCustomerReminderHours;
  const hasImmediateCustomerReminderState =
    Number.isFinite(customerReminderHoursBefore) && customerReminderHoursBefore >= 0;
  const isCustomerReminderReady =
    Boolean(salonAccountEmail) &&
    ownerWorkspaceSettingsHydrated &&
    ownerServerSyncReady &&
    !ownerInitialDataHydrating &&
    hasImmediateCustomerReminderState;

  React.useEffect(() => {
    if (!isUpdatingCustomerReminder) {
      setDisplayedCustomerReminderHours(persistedCustomerReminderHoursBefore);
    }
  }, [isUpdatingCustomerReminder, persistedCustomerReminderHoursBefore]);

  const updateCustomerReminderHours = useCallback(
    async (hours: number) => {
      const normalizedHours = Math.max(0, Math.min(168, Math.round(hours)));
      if (
        !isCustomerReminderReady ||
        isUpdatingCustomerReminder ||
        normalizedHours === persistedCustomerReminderHoursBefore
      ) {
        return;
      }

      setCustomerReminderSaveError('');
      setDisplayedCustomerReminderHours(normalizedHours);
      setIsUpdatingCustomerReminder(true);

      const result = await setCustomerReminderHoursPersisted(normalizedHours);
      if (typeof result.hours === 'number') {
        setDisplayedCustomerReminderHours(result.hours);
      } else if (!result.ok) {
        setDisplayedCustomerReminderHours(persistedCustomerReminderHoursBefore);
      }

      setCustomerReminderSaveError(result.ok ? '' : result.error ?? 'Promemoria non salvato.');
      setIsUpdatingCustomerReminder(false);
    },
    [
      isCustomerReminderReady,
      isUpdatingCustomerReminder,
      persistedCustomerReminderHoursBefore,
      setCustomerReminderHoursPersisted,
    ]
  );

  const buildClientViewKey = useCallback((item: {
    id: string;
    nome?: string | null;
    telefono?: string | null;
    email?: string | null;
  }) => {
    const normalizedEmail = (item.email ?? '').trim().toLowerCase();
    if (normalizedEmail) return `email:${normalizedEmail}`;

    const normalizedPhone = (item.telefono ?? '').replace(/\D+/g, '');
    if (normalizedPhone) return `phone:${normalizedPhone}`;

    const normalizedId = item.id?.trim();
    if (normalizedId) return `id:${normalizedId}`;

    return '';
  }, []);

  const matchesClientIdentity = useCallback(
    (
      candidate: (typeof localClienti)[number],
      target: {
        id?: string | null;
        nome?: string | null;
        telefono?: string | null;
        email?: string | null;
      }
    ) => {
      const normalizedTargetId = (target.id ?? '').trim();
      if (normalizedTargetId && candidate.id === normalizedTargetId) {
        return true;
      }

      const candidateEmail = (candidate.email ?? '').trim().toLowerCase();
      const targetEmail = (target.email ?? '').trim().toLowerCase();
      if (candidateEmail && targetEmail && candidateEmail === targetEmail) {
        return true;
      }

      const candidatePhone = (candidate.telefono ?? '').replace(/\D+/g, '');
      const targetPhone = (target.telefono ?? '').replace(/\D+/g, '');
      if (candidatePhone && targetPhone && candidatePhone === targetPhone) {
        return true;
      }

      return false;
    },
    []
  );

  const markFrontendClientsAsViewed = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const idsSet = new Set(ids);
      const matchedViewedTargets = localClienti
        .concat(
          effectiveLocalClienti.filter(
            (effectiveItem) =>
              !localClienti.some((localItem) => localItem.id === effectiveItem.id)
          )
        )
        .filter(
          (item) =>
            item.fonte === 'frontend' &&
            item.viewedBySalon !== true &&
            idsSet.has(item.id)
        );
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (
        matchedViewedTargets.length === 0 ||
        !normalizedEmail ||
        !isUuidLike(salonWorkspace.id)
      ) {
        return;
      }
      const viewedKeys = Array.from(
        new Set(
          matchedViewedTargets
            .map((item) => buildClientViewKey(item))
            .filter((item) => item.length > 0)
        )
      );

      setLocalClienti((current) => {
        let hasChanges = false;

        const nextClients = current.map((item) => {
          if (
            item.fonte === 'frontend' &&
            item.viewedBySalon !== true &&
            matchedViewedTargets.some((target) => matchesClientIdentity(item, target))
          ) {
            hasChanges = true;
            return { ...item, viewedBySalon: true };
          }

          return item;
        });

        return hasChanges ? nextClients : current;
      });

      emitOwnerViewedNotificationChange({
        ownerEmail: normalizedEmail,
        clientIds: ids,
        clientKeys: viewedKeys,
      });

      const storageKey = `salon_manager_viewed_client_ids__${normalizedEmail}`;
      const storageKeyByFields = `salon_manager_viewed_client_keys__${normalizedEmail}`;

      Promise.all([AsyncStorage.getItem(storageKey), AsyncStorage.getItem(storageKeyByFields)])
        .then(([raw, rawByFields]) => {
          const parsed = raw ? (JSON.parse(raw) as unknown) : [];
          const parsedByFields = rawByFields ? (JSON.parse(rawByFields) as unknown) : [];
          const currentIds = Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string')
            : [];
          const currentKeys = Array.isArray(parsedByFields)
            ? parsedByFields.filter((item): item is string => typeof item === 'string')
            : [];
          const merged = Array.from(new Set([...currentIds, ...ids]));
          const mergedKeys = Array.from(new Set([...currentKeys, ...viewedKeys]));

          return Promise.all([
            AsyncStorage.setItem(storageKey, JSON.stringify(merged)),
            AsyncStorage.setItem(storageKeyByFields, JSON.stringify(mergedKeys)),
          ]);
        })
        .catch(() => {
          // Non bloccare UX notifiche in caso di errore storage locale.
        });

      const knownBackendClientIds = Array.from(
        new Set(
          matchedViewedTargets
            .map((item) => item.id)
            .filter((item) => isUuidLike(item))
        )
      );
      void (async () => {
        try {
          const { data: backendCustomers, error: lookupError } = await supabase
            .from('customers')
            .select('id, full_name, phone, email, source, viewed_by_salon')
            .eq('workspace_id', salonWorkspace.id)
            .eq('source', 'frontend');

          if (lookupError) {
            throw lookupError;
          }

          const resolvedBackendClientIds = ((backendCustomers ?? []) as {
            id: string;
            full_name: string | null;
            phone: string | null;
            email: string | null;
            source: string | null;
            viewed_by_salon: boolean | null;
          }[])
            .filter((backendCustomer) =>
              matchedViewedTargets.some((target) => {
                const targetId = target.id.trim();
                const targetEmail = (target.email ?? '').trim().toLowerCase();
                const targetPhone = normalizePhoneForIdentity(target.telefono);
                const backendEmail = (backendCustomer.email ?? '').trim().toLowerCase();
                const backendPhone = normalizePhoneForIdentity(backendCustomer.phone);

                return (
                  (isUuidLike(targetId) && backendCustomer.id === targetId) ||
                  (!!targetEmail && !!backendEmail && targetEmail === backendEmail) ||
                  (!!targetPhone && !!backendPhone && targetPhone === backendPhone)
                );
              })
            )
            .map((item) => item.id)
            .filter((item) => isUuidLike(item));
          const backendClientIds = Array.from(
            new Set([...knownBackendClientIds, ...resolvedBackendClientIds])
          );

          if (backendClientIds.length === 0) {
            throw new Error('Cliente frontend non trovato sul backend.');
          }

          const { error } = await supabase
            .from('customers')
            .update({ viewed_by_salon: true })
            .eq('workspace_id', salonWorkspace.id)
            .in('id', backendClientIds);

          if (error) {
            throw error;
          }

          await refreshBadges();
        } catch (error) {
          console.log('Errore sync viewed_by_salon clienti:', error);

          setLocalClienti((current) =>
            current.map((item) =>
              item.fonte === 'frontend' &&
              matchedViewedTargets.some((target) => matchesClientIdentity(item, target))
                ? { ...item, viewedBySalon: false }
                : item
            )
          );
          void refreshBadges();
        }
      })();
    },
    [
      buildClientViewKey,
      effectiveLocalClienti,
      localClienti,
      matchesClientIdentity,
      salonAccountEmail,
      salonWorkspace.id,
      setLocalClienti,
      refreshBadges,
    ]
  );

  const unreadFrontendClientIds = useMemo(
    () =>
      Array.from(
        new Set(
          effectiveLocalClienti
            .filter(
              (item) =>
                item.fonte === 'frontend' &&
                item.viewedBySalon !== true &&
                item.id.trim().length > 0
            )
            .map((item) => item.id)
        )
      ),
    [effectiveLocalClienti]
  );

  const markAllFrontendClientsAsViewed = useCallback(() => {
    markFrontendClientsAsViewed(unreadFrontendClientIds);
  }, [markFrontendClientsAsViewed, unreadFrontendClientIds]);

  const trackClientiScrollPerf = useCallback(() => {
    if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
      clientiPerfCountersRef.current.scrollEvents += 1;
    }
  }, []);

  const trackClientiLayoutPerf = useCallback(() => {
    if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
      clientiPerfCountersRef.current.layoutEvents += 1;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current) {
        clearTimeout(deleteUndoTimeoutRef.current);
        deleteUndoTimeoutRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      Object.values(swipeableRefs.current).forEach((ref) => ref.current?.close());

      return () => {
        setRubricaGuideOpen(false);
        setRemindersGuideOpen(false);
      };
    }, [])
  );

  const chiudiModificaClienteModal = useCallback(() => {
    setShowEditCustomerModal(false);
    setEditBirthdayPickerValue(null);
    setClienteInModifica(null);
    releaseClientCardInteraction();
  }, [releaseClientCardInteraction]);

  const closeCustomerFeedbackDialog = useCallback(() => {
    setCustomerFeedbackDialog((current) => ({
      ...current,
      visible: false,
    }));
    releaseClientCardInteraction();
  }, [releaseClientCardInteraction]);

  const apriModificaCliente = useCallback((cliente: ClienteItem) => {
    if (Platform.OS === 'web') swipeableRefs.current[cliente.id]?.current?.close();
    pendingEditCustomerFeedbackRef.current = null;
    setDisableParentSwipe(false);
    setClienteInModifica(cliente);
    setShowEditCustomerModal(true);
  }, [setDisableParentSwipe]);

  // iOS presents one native modal at a time. Hand off only after the
  // detail host has finished dismissing; no timer or stacked presentation.
  const finishClientDetailsDismiss = useCallback(() => {
    releaseClientCardInteraction();
    const pending = pendingClientDetailsActionRef.current;
    pendingClientDetailsActionRef.current = null;
    if (!pending) return;
    if (pending.kind === 'edit') apriModificaCliente(pending.customer);
    else if (pending.kind === 'benefits') setPackageClient(pending.customer);
    else setOpenWebClientActionsId(pending.customer.id);
  }, [apriModificaCliente, releaseClientCardInteraction]);
  const leaveClientDetailsFor = useCallback((kind: 'edit' | 'benefits' | 'options', customer: ClienteItem) => {
    pendingClientDetailsActionRef.current = {kind, customer};
    setClientDetailsId(null);
    if (Platform.OS === 'web') finishClientDetailsDismiss();
  }, [finishClientDetailsDismiss]);
  React.useEffect(() => {
    // Android does not emit Modal.onDismiss. Commit the host removal before
    // presenting the next surface; iOS waits for its dismissal callback.
    if (Platform.OS !== 'android' || clientDetailsId || !pendingClientDetailsActionRef.current) return;
    const frame = requestAnimationFrame(finishClientDetailsDismiss);
    return () => cancelAnimationFrame(frame);
  }, [clientDetailsId, finishClientDetailsDismiss]);

  const closeClientDetails = useCallback(() => {
    pendingClientDetailsActionRef.current = null;
    setClientDetailsId(null);
    releaseClientCardInteraction();
  }, [releaseClientCardInteraction]);

  React.useEffect(()=>{
    if(clientiIsFocused)return;
    pendingClientDetailsActionRef.current=null;
    setClientDetailsId(null);setPackageClient(null);setBenefitsConsoleOpen(false);
    setShowEditCustomerModal(false);setPaymentPolicyClient(null);
    setLimitConfigClient(null);setLimitTargetClient(null);setLimitTargetMode(null);
    releaseClientCardInteraction();
  },[clientiIsFocused,releaseClientCardInteraction]);

  const apriTempiPersonalizzatiCliente = useCallback((cliente: ClienteItem) => {
    if (Platform.OS === 'web') swipeableRefs.current[cliente.id]?.current?.close();
    setDisableParentSwipe(false);
    setDurationPickerTarget(null);
    setPricePickerServiceId('');
    setDurationConfigClient(cliente);
  }, [setDisableParentSwipe]);

  const chiudiTempiPersonalizzatiCliente = useCallback(() => {
    setDurationPickerTarget(null);
    setPricePickerServiceId('');
    setDurationConfigClient(null);
    releaseClientCardInteraction();
  }, [releaseClientCardInteraction]);

  const persistCustomerServiceTiming = useCallback(
    async (
      serviceId: string,
      override: Parameters<typeof saveCustomerServiceDurationOverride>[2] | null
    ) => {
      if (!durationConfigClient || durationOverrideSavingServiceId) return false;
      setDurationOverrideSavingServiceId(serviceId);
      const result = await saveCustomerServiceDurationOverride(
        durationConfigClient.id,
        serviceId,
        override
      );
      setDurationOverrideSavingServiceId('');

      if (!result.ok) {
        Alert.alert('Tempo non salvato', result.error ?? 'Riprova tra qualche secondo.');
        return false;
      }

      setDurationConfigClient((current) => {
        if (!current || current.id !== durationConfigClient.id) return current;
        const nextOverrides = { ...(current.serviceDurationOverrides ?? {}) };
        if (override) {
          nextOverrides[serviceId] = { ...override, serviceId };
        } else {
          delete nextOverrides[serviceId];
        }
        return { ...current, serviceDurationOverrides: nextOverrides };
      });
      return true;
    },
    [
      durationConfigClient,
      durationOverrideSavingServiceId,
      saveCustomerServiceDurationOverride,
    ]
  );

  const confirmCustomerServiceDuration = useCallback(
    async (value: string) => {
      if (!durationConfigClient || !durationPickerTarget) return;
      const service = servizi.find((item) => item.id === durationPickerTarget.serviceId);
      if (!service) {
        setDurationPickerTarget(null);
        return;
      }

      const minutes = Math.max(5, Math.min(480, Math.round(Number(value) / 5) * 5));
      const existingOverride = getCustomerServiceDurationOverride(
        durationConfigClient.serviceDurationOverrides,
        service.id
      );
      const defaultPhaseConfig = normalizeServicePhaseConfig(service.phaseConfig);
      const basePhaseConfig = existingOverride?.phaseConfig ?? defaultPhaseConfig;
      const override = basePhaseConfig
        ? {
            serviceId: service.id,
            phaseConfig: {
              ...basePhaseConfig,
              ...(durationPickerTarget.field === 'initial'
                ? { initialDurationMinutes: minutes }
                : durationPickerTarget.field === 'processing'
                  ? { processingDurationMinutes: minutes }
                  : durationPickerTarget.field === 'final'
                    ? { finalDurationMinutes: minutes }
                    : {}),
            },
          }
        : {
            serviceId: service.id,
            durationMinutes: minutes,
          };

      const saved = await persistCustomerServiceTiming(service.id, override);
      if (saved) setDurationPickerTarget(null);
    },
    [durationConfigClient, durationPickerTarget, persistCustomerServiceTiming, servizi]
  );

  const durationPickerService = durationPickerTarget
    ? servizi.find((item) => item.id === durationPickerTarget.serviceId) ?? null
    : null;
  const durationPickerOverride = durationPickerService
    ? getCustomerServiceDurationOverride(
        durationConfigClient?.serviceDurationOverrides,
        durationPickerService.id
      )
    : null;
  const durationPickerPhaseConfig =
    durationPickerOverride?.phaseConfig ??
    normalizeServicePhaseConfig(durationPickerService?.phaseConfig);
  const durationPickerInitialValue = durationPickerTarget
    ? durationPickerTarget.field === 'initial'
      ? durationPickerPhaseConfig?.initialDurationMinutes ?? 30
      : durationPickerTarget.field === 'processing'
        ? durationPickerPhaseConfig?.processingDurationMinutes ?? 30
        : durationPickerTarget.field === 'final'
          ? durationPickerPhaseConfig?.finalDurationMinutes ?? 30
          : durationPickerOverride?.durationMinutes ?? durationPickerService?.durataMinuti ?? 60
    : 30;

  const pricePickerService = pricePickerServiceId
    ? servizi.find((item) => item.id === pricePickerServiceId) ?? null
    : null;
  const pricePickerOverride = pricePickerService
    ? getCustomerServicePriceOverride(
        durationConfigClient?.servicePriceOverrides,
        pricePickerService.id
      )
    : null;
  const pricePickerInitialValue =
    pricePickerOverride?.price ?? pricePickerService?.prezzo ?? 0;

  const persistCustomerServicePrice = useCallback(
    async (serviceId: string, price: number | null) => {
      if (!durationConfigClient || priceOverrideSavingServiceId) return false;
      setPriceOverrideSavingServiceId(serviceId);
      const result = await saveCustomerServicePriceOverride(
        durationConfigClient.id,
        serviceId,
        price
      );
      setPriceOverrideSavingServiceId('');

      if (!result.ok) {
        Alert.alert('Prezzo non salvato', result.error ?? 'Riprova tra qualche secondo.');
        return false;
      }

      setDurationConfigClient((current) => {
        if (!current || current.id !== durationConfigClient.id) return current;
        const nextOverrides = { ...(current.servicePriceOverrides ?? {}) };
        if (price !== null) {
          nextOverrides[serviceId] = { serviceId, price };
        } else {
          delete nextOverrides[serviceId];
        }
        return { ...current, servicePriceOverrides: nextOverrides };
      });
      return true;
    },
    [
      durationConfigClient,
      priceOverrideSavingServiceId,
      saveCustomerServicePriceOverride,
    ]
  );

  const confirmCustomerServicePrice = useCallback(
    async (value: string) => {
      if (!pricePickerServiceId) return;
      const normalizedPrice = Math.max(
        0,
        Math.min(9999, Math.round(Number(value) * 100) / 100)
      );
      const saved = await persistCustomerServicePrice(
        pricePickerServiceId,
        normalizedPrice
      );
      if (saved) setPricePickerServiceId('');
    },
    [persistCustomerServicePrice, pricePickerServiceId]
  );

  const durationServiceGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; services: typeof servizi }
    >();

    servizi.forEach((service) => {
      const rawRole = service.mestiereRichiesto?.trim() ?? '';
      const key = rawRole.toLocaleLowerCase('it-IT') || '__other__';
      const current = groups.get(key) ?? {
        key,
        label: rawRole || 'Altri servizi',
        services: [],
      };
      current.services.push(service);
      groups.set(key, current);
    });

    return Array.from(groups.values());
  }, [servizi]);

  const apriSelettoreLimiteAppuntamenti = useCallback(
    (cliente: ClienteItem, mode: BookingLimitMode) => {
      setLimitTargetClient(cliente);
      setLimitTargetMode(mode);
      releaseClientCardInteraction();
    },
    [releaseClientCardInteraction]
  );

  const chiudiSelettoreLimiteAppuntamenti = useCallback(() => {
    setLimitTargetClient(null);
    setLimitTargetMode(null);
    releaseClientCardInteraction();
  }, [releaseClientCardInteraction]);

  const persistClienteBookingLimits = useCallback(
    async (
      cliente: ClienteItem,
      nextLimits: {
        maxFutureAppointments?: number | null;
        maxFutureAppointmentsMode?: 'total_future' | 'monthly' | null;
        maxDailyAppointments?: number | null;
      }
    ) => {
      const targetClient = localClienti.find((item) =>
        matchesClientIdentity(item, {
          id: cliente.id,
          nome: cliente.full_name,
          telefono: cliente.phone,
          email: cliente.email ?? '',
        })
      );

      const previousState = targetClient
        ? {
            maxFutureAppointments: targetClient.maxFutureAppointments ?? null,
            maxFutureAppointmentsMode: targetClient.maxFutureAppointmentsMode ?? null,
            maxDailyAppointments: targetClient.maxDailyAppointments ?? null,
          }
        : {
            maxFutureAppointments: cliente.maxFutureAppointments ?? null,
            maxFutureAppointmentsMode: cliente.maxFutureAppointmentsMode ?? null,
            maxDailyAppointments: cliente.maxDailyAppointments ?? null,
          };
      const nextVisualState = {
        maxFutureAppointments:
          nextLimits.maxFutureAppointments !== undefined
            ? nextLimits.maxFutureAppointments
            : previousState.maxFutureAppointments,
        maxFutureAppointmentsMode:
          nextLimits.maxFutureAppointmentsMode !== undefined
            ? nextLimits.maxFutureAppointmentsMode
            : previousState.maxFutureAppointmentsMode,
        maxDailyAppointments:
          nextLimits.maxDailyAppointments !== undefined
            ? nextLimits.maxDailyAppointments
            : previousState.maxDailyAppointments,
      };
      const clientIdentityKey = buildFrontendClientIdentityKey({
        id: cliente.id,
        nome: targetClient?.nome ?? cliente.full_name,
        telefono: targetClient?.telefono ?? cliente.phone,
        email: targetClient?.email ?? cliente.email ?? '',
      });
      const matchesLimitClient = (candidate: ClienteItem | null) => {
        if (!candidate) return false;
        const candidateId = candidate.id.trim();
        const targetId = cliente.id.trim();
        const candidateEmail = (candidate.email ?? '').trim().toLowerCase();
        const targetEmail = (cliente.email ?? '').trim().toLowerCase();
        const candidatePhone = (candidate.phone ?? '').replace(/\D+/g, '');
        const targetPhone = (cliente.phone ?? '').replace(/\D+/g, '');

        return (
          (!!candidateId && !!targetId && candidateId === targetId) ||
          (!!candidateEmail && !!targetEmail && candidateEmail === targetEmail) ||
          (!!candidatePhone && !!targetPhone && candidatePhone === targetPhone)
        );
      };

      setBookingLimitVisualOverrides((current) => ({
        ...current,
        [clientIdentityKey]: {
          ...nextVisualState,
          updatedAt: Date.now(),
        },
      }));
      setLimitConfigClient((current) =>
        current && matchesLimitClient(current)
          ? {
              ...current,
              maxFutureAppointments: nextVisualState.maxFutureAppointments,
              maxFutureAppointmentsMode: nextVisualState.maxFutureAppointmentsMode,
              maxDailyAppointments: nextVisualState.maxDailyAppointments,
            }
          : current
      );
      setLimitTargetClient((current) =>
        current && matchesLimitClient(current)
          ? {
              ...current,
              maxFutureAppointments: nextVisualState.maxFutureAppointments,
              maxFutureAppointmentsMode: nextVisualState.maxFutureAppointmentsMode,
              maxDailyAppointments: nextVisualState.maxDailyAppointments,
            }
          : current
      );

      setLocalClienti((current) =>
        current.map((item) =>
          matchesClientIdentity(item, {
            id: cliente.id,
            nome: cliente.full_name,
            telefono: cliente.phone,
            email: cliente.email ?? '',
          })
            ? {
                ...item,
                ...nextLimits,
              }
            : item
        )
      );

      try {
        const result = await updateClientePersisted(
          {
            id: cliente.id,
            nome: targetClient?.nome ?? cliente.full_name,
            telefono: targetClient?.telefono ?? cliente.phone,
            email: targetClient?.email ?? cliente.email ?? '',
          },
          {
            nome: targetClient?.nome ?? cliente.full_name,
            telefono: targetClient?.telefono ?? cliente.phone,
            email: targetClient?.email ?? cliente.email ?? '',
            instagram: targetClient?.instagram ?? cliente.instagram ?? '',
            birthday: targetClient?.birthday ?? cliente.birthday ?? '',
            inibito: targetClient ? targetClient.inibito : (cliente.is_active ?? true) === false,
            maxFutureAppointments: nextVisualState.maxFutureAppointments,
            maxFutureAppointmentsMode: nextVisualState.maxFutureAppointmentsMode,
            maxDailyAppointments: nextVisualState.maxDailyAppointments,
          }
        );

        if (!result.ok) {
          throw new Error(result.error || 'Non sono riuscito a salvare il limite cliente.');
        }
      } catch (error: any) {
        setBookingLimitVisualOverrides((current) => {
          if (!current[clientIdentityKey]) {
            return current;
          }

          const next = { ...current };
          delete next[clientIdentityKey];
          return next;
        });
        setLocalClienti((current) =>
          current.map((item) =>
            matchesClientIdentity(item, {
              id: cliente.id,
              nome: cliente.full_name,
              telefono: cliente.phone,
              email: cliente.email ?? '',
            })
              ? {
                  ...item,
                  ...previousState,
                }
              : item
          )
        );
        setLimitConfigClient((current) =>
          current && matchesLimitClient(current)
            ? {
                ...current,
                maxFutureAppointments: previousState.maxFutureAppointments,
                maxFutureAppointmentsMode: previousState.maxFutureAppointmentsMode,
                maxDailyAppointments: previousState.maxDailyAppointments,
              }
            : current
        );
        Alert.alert(
          'Errore',
          error?.message || 'Non sono riuscito a salvare il limite cliente.'
        );
      }
    },
    [localClienti, matchesClientIdentity, setLocalClienti, updateClientePersisted]
  );

  const salvaCliente = async (activeDraft: CustomerEditorDraft) => {
    const editingCustomer = clienteInModifica;
    const invalidFields: string[] = [];
    const nextErrors: CustomerFormErrors = {};

    if (!activeDraft.nome.trim()) {
      invalidFields.push('Nome obbligatorio');
      nextErrors.nome = 'Nome obbligatorio';
    } else if (!isValidPersonNamePart(activeDraft.nome)) {
      const error = buildPersonNameValidationError('Nome');
      invalidFields.push(error);
      nextErrors.nome = error;
    }

    if (!activeDraft.cognome.trim()) {
      invalidFields.push('Cognome obbligatorio');
      nextErrors.cognome = 'Cognome obbligatorio';
    } else if (!isValidPersonNamePart(activeDraft.cognome)) {
      const error = buildPersonNameValidationError('Cognome');
      invalidFields.push(error);
      nextErrors.cognome = error;
    }

    if (!activeDraft.telefono.trim()) {
      invalidFields.push('Numero di telefono obbligatorio');
      nextErrors.telefono = 'Numero di telefono obbligatorio';
    } else if (!isValidPhone10(activeDraft.telefono)) {
      invalidFields.push('Numero di telefono errato (deve avere 9 o 10 cifre)');
      nextErrors.telefono = 'Numero di telefono errato (deve avere 9 o 10 cifre)';
    }

    if (activeDraft.email.trim() && !isValidEmail(activeDraft.email)) {
      invalidFields.push('Email non valida');
      nextErrors.email = 'Email non valida';
    }

    if (editingCustomer?.email?.trim() && !activeDraft.email.trim()) {
      invalidFields.push('L’email già verificata non può essere rimossa');
      nextErrors.email = 'L’email già verificata non può essere rimossa';
    }

    if (invalidFields.length > 0) {
      if (editingCustomer) {
        customerEditorFormRef.current?.setErrors(nextErrors);
      } else {
        customerCreatorFormRef.current?.setErrors(nextErrors);
      }
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    if (editingCustomer) {
      customerEditorFormRef.current?.setErrors({});
    } else {
      customerCreatorFormRef.current?.setErrors({});
    }

    try {
      setSaving(true);
      const normalizedFirstName = formatCustomerNamePart(activeDraft.nome);
      const normalizedLastName = formatCustomerNamePart(activeDraft.cognome);
      const normalizedFullName = formatCustomerFullNameValue(
        `${normalizedFirstName} ${normalizedLastName}`
      );
      const normalizedPhone = activeDraft.telefono.trim();
      const normalizedEmail = activeDraft.email.trim().toLowerCase();
      const normalizedInstagram = activeDraft.instagram.trim();
      const normalizedBirthday = activeDraft.birthday.trim();
      const normalizedNote = activeDraft.notaCliente.trim();

      if (editingCustomer) {
        const didRenameCustomer =
          formatCustomerFullNameValue(editingCustomer.full_name).toLowerCase() !==
          normalizedFullName.toLowerCase();

        if (didRenameCustomer) {
          // React Native Web's Alert.alert is a no-op: use our visible web dialog
          // instead of awaiting a callback that can never run.
          const confirmedRename = Platform.OS === 'web'
            ? await confirmWebAction('Aggiornerò questo nome anche negli slot e nelle richieste collegate allo stesso cliente.', 'Salva nome')
            : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Conferma modifica nome',
              'Aggiornero questo nome anche negli slot e nelle richieste collegate allo stesso cliente.',
              [
                {
                  text: 'Annulla',
                  style: 'cancel',
                  onPress: () => resolve(false),
                },
                {
                  text: 'Conferma',
                  onPress: () => resolve(true),
                },
              ]
            );
          });

          if (!confirmedRename) {
            setSaving(false);
            return;
          }
        }

        const result = await updateClientePersisted(
          {
            id: editingCustomer.id,
            nome: editingCustomer.full_name,
            telefono: editingCustomer.phone,
            email: editingCustomer.email ?? '',
          },
          {
            nome: normalizedFullName,
            telefono: normalizedPhone,
            email: normalizedEmail || '',
            instagram: normalizedInstagram || '',
            birthday: normalizedBirthday || '',
            nota: normalizedNote,
          }
        );

        if (!result.ok) {
          setSaving(false);
          openCustomerFeedbackDialog({
            kind: 'error',
            title: 'Aggiornamento non completato',
            message: result.error || 'Non sono riuscito ad aggiornare il cliente.',
          });
          return;
        }

        setSaving(false);
        pendingEditCustomerFeedbackRef.current = {
          kind: 'success',
          title: 'Cliente aggiornato',
          message: 'Cliente salvato correttamente.',
        };
        chiudiModificaClienteModal();
        return;
      }

      const result = await createClientePersisted({
        nome: normalizedFullName,
        telefono: normalizedPhone,
        email: normalizedEmail || '',
        instagram: normalizedInstagram || '',
        birthday: normalizedBirthday || '',
        nota: normalizedNote,
        maxFutureAppointments: 4,
        maxFutureAppointmentsMode: 'monthly',
        maxDailyAppointments: 3,
      });

      if (!result.ok) {
        setSaving(false);
        openCustomerFeedbackDialog({
          kind: 'error',
          title: 'Creazione non completata',
          message: result.error || 'Non sono riuscito a creare il cliente.',
        });
        return;
      }

      if (result.customer) {
        const recreatedCustomerAliases = buildFrontendClientIdentityAliases({
          id: result.customer.id,
          nome: result.customer.nome,
          telefono: result.customer.telefono,
          email: result.customer.email ?? '',
        });
        setDeletedClientIdentityKeys((current) =>
          current.filter((key) => !recreatedCustomerAliases.includes(key)),
        );
      }

      setSaving(false);

      customerCreatorFormRef.current?.reset();
      if (Platform.OS !== 'web') closeNewCustomerPanel();
      openCustomerFeedbackDialog({
        kind: 'success',
        title: 'Cliente aggiunto',
        message: 'Cliente inserito correttamente nella rubrica.',
      });
    } catch (e: any) {
      setSaving(false);
      openCustomerFeedbackDialog({
        kind: 'error',
        title: 'Qualcosa non ha funzionato',
        message: e?.message || 'Si è verificato un errore imprevisto.',
      });
    }
  };

  const eliminaCliente = useCallback(async (id: string, nomeCliente: string) => {
    if (isDesktopWebClientActionsLayout) {
      if (!await confirmWebAction(`Vuoi eliminare ${nomeCliente}?`, 'Elimina')) {
        return;
      }

      const targetClient =
        localClienti.find((item) =>
          matchesClientIdentity(item, {
            id,
            nome: nomeCliente,
            telefono: '',
            email: '',
          })
        ) ?? null;

      const result = await deleteClientePersisted({
        id,
        nome: targetClient?.nome ?? nomeCliente,
        telefono: targetClient?.telefono ?? '',
        email: targetClient?.email ?? '',
      });

      if (!result.ok) {
        openCustomerFeedbackDialog({
          kind: 'error',
          title: 'Eliminazione non disponibile',
          message: result.error || 'Non sono riuscito a eliminare il cliente.',
        });
        return;
      }

      const deletedAliases = buildFrontendClientIdentityAliases({
        id,
        nome: targetClient?.nome ?? nomeCliente,
        telefono: targetClient?.telefono ?? '',
        email: targetClient?.email ?? '',
      });
      const deletedNormalizedName = normalizeIdentityText(
        targetClient?.nome ?? nomeCliente,
      );

      deletedClientMutationRevisionRef.current += 1;
      setDeletedClientIdentityKeys((current) => Array.from(new Set([...current, ...deletedAliases])));
      if (deletedNormalizedName) {
        setDeletedClientNormalizedNames((current) =>
          Array.from(new Set([...current, deletedNormalizedName])),
        );
      }
      setLocalClienti((current) =>
        current.filter(
          (entry) =>
            !buildFrontendClientIdentityAliases(entry).some((alias) => deletedAliases.includes(alias))
        )
      );
      setOpenWebClientActionsId((current) => (current === id ? null : current));

      if (clienteInModifica?.id === id) {
        chiudiModificaClienteModal();
      }
      setDeletedClientHydrationNonce((current) => current + 1);
      return;
    }

    showSwipeConfirmation('Conferma', `Vuoi eliminare ${nomeCliente}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const previousIndex = localClienti.findIndex((item) => item.id === id);
          if (previousIndex < 0) {
            return;
          }

          const item = localClienti[previousIndex];
          const deletedNormalizedName = normalizeIdentityText(item.nome);
          deletedClientMutationRevisionRef.current += 1;
          setPendingDeletedClient({ item, previousIndex });
          setDeletedClientIdentityKeys((current) =>
            Array.from(
              new Set([
                ...current,
                ...buildFrontendClientIdentityAliases(item),
              ])
            )
          );
          if (deletedNormalizedName) {
            setDeletedClientNormalizedNames((current) =>
              Array.from(new Set([...current, deletedNormalizedName])),
            );
          }

          if (deleteUndoTimeoutRef.current) {
            clearTimeout(deleteUndoTimeoutRef.current);
            deleteUndoTimeoutRef.current = null;
          }
          setLocalClienti((current) => current.filter((entry) => entry.id !== id));

          deleteUndoTimeoutRef.current = setTimeout(() => {
            void deleteClientePersisted({
              id,
              nome: item.nome,
              telefono: item.telefono,
              email: item.email,
            }).then((result) => {
              if (!result.ok) {
                setLocalClienti((current) => {
                  if (current.some((entry) => entry.id === item.id)) {
                    return current;
                  }

                  const next = [...current];
                  const insertIndex = Math.max(0, Math.min(previousIndex, next.length));
                  next.splice(insertIndex, 0, item);
                  return next;
                });
                setDeletedClientIdentityKeys((current) =>
                  current.filter(
                    (key) => !buildFrontendClientIdentityAliases(item).includes(key)
                  )
                );
                deletedClientMutationRevisionRef.current += 1;
                if (deletedNormalizedName) {
                  setDeletedClientNormalizedNames((current) =>
                    current.filter((name) => name !== deletedNormalizedName),
                  );
                }
                openCustomerFeedbackDialog({
                  kind: 'error',
                  title: 'Eliminazione non completata',
                  message: result.error || 'Non sono riuscito a eliminare il cliente.',
                });
              }
              setDeletedClientHydrationNonce((current) => current + 1);
            });

            setPendingDeletedClient(null);
            deleteUndoTimeoutRef.current = null;
          }, 3000);

          if (clienteInModifica?.id === id) {
            chiudiModificaClienteModal();
          }
        },
      },
    ]);
  }, [
    confirmWebAction,
    chiudiModificaClienteModal,
    clienteInModifica?.id,
    deleteClientePersisted,
    isDesktopWebClientActionsLayout,
    localClienti,
    matchesClientIdentity,
    openCustomerFeedbackDialog,
    setLocalClienti,
  ]);

  const annullaEliminazioneCliente = useCallback(() => {
    if (!pendingDeletedClient) {
      return;
    }

    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }

    setLocalClienti((current) => {
      if (current.some((item) => item.id === pendingDeletedClient.item.id)) {
        return current;
      }

      const next = [...current];
      const insertIndex = Math.max(0, Math.min(pendingDeletedClient.previousIndex, next.length));
      next.splice(insertIndex, 0, pendingDeletedClient.item);
      return next;
    });

    setPendingDeletedClient(null);
    deletedClientMutationRevisionRef.current += 1;
    setDeletedClientIdentityKeys((current) =>
      current.filter(
        (key) => !buildFrontendClientIdentityAliases(pendingDeletedClient.item).includes(key)
      )
    );
    const restoredNormalizedName = normalizeIdentityText(
      pendingDeletedClient.item.nome,
    );
    if (restoredNormalizedName) {
      setDeletedClientNormalizedNames((current) =>
        current.filter((name) => name !== restoredNormalizedName),
      );
    }
    setDeletedClientHydrationNonce((current) => current + 1);
  }, [pendingDeletedClient, setLocalClienti]);

  const handleDesktopWebClientActionsTrigger = useCallback((clientId: string) => {
    if (openWebClientActionsId === clientId) {
      setOpenWebClientActionsId(null);
      webClientActionsTapRef.current = { id: null, ts: 0 };
      return;
    }

    setOpenWebClientActionsId(clientId);
    webClientActionsTapRef.current = { id: null, ts: 0 };
  }, [openWebClientActionsId]);

  const toggleInibizioneCliente = useCallback(async (cliente: ClienteItem) => {
    const isCurrentlyActive = cliente.is_active ?? true;
    const nextIsActive = !isCurrentlyActive;
    const actionLabel = nextIsActive ? 'sbloccare' : 'inibire';
    const targetClient = localClienti.find((item) =>
      matchesClientIdentity(item, {
        id: cliente.id,
        nome: cliente.full_name,
        telefono: cliente.phone,
        email: cliente.email ?? '',
      })
    );

    if (isDesktopWebClientActionsLayout) {
      releaseClientCardInteraction();
      const confirmed = await confirmWebAction(
        nextIsActive
          ? `${cliente.full_name} tornerà a vedere gli slot disponibili e potrà prenotare di nuovo.`
          : `${cliente.full_name} vedrà tutti gli slot occupati finché non lo sblocchi.`,
        nextIsActive ? 'Sblocca' : 'Inibisci'
      );

      if (!confirmed) {
        return;
      }

      try {
        const result = await updateClientePersisted(
          {
            id: cliente.id,
            nome: targetClient?.nome ?? cliente.full_name,
            telefono: targetClient?.telefono ?? cliente.phone,
            email: targetClient?.email ?? cliente.email ?? '',
          },
          {
            nome: targetClient?.nome ?? cliente.full_name,
            telefono: targetClient?.telefono ?? cliente.phone,
            email: targetClient?.email ?? cliente.email ?? '',
            instagram: targetClient?.instagram ?? cliente.instagram ?? '',
            birthday: targetClient?.birthday ?? cliente.birthday ?? '',
            inibito: !nextIsActive,
          }
        );

        if (!result.ok) {
          throw new Error(result.error || `Non sono riuscito a ${actionLabel} il cliente.`);
        }
      } catch (error: any) {
        openCustomerFeedbackDialog({
          kind: 'error',
          title: `${nextIsActive ? 'Sblocco' : 'Blocco'} non completato`,
          message: error?.message || `Non sono riuscito a ${actionLabel} il cliente.`,
        });
      }
      return;
    }

    showSwipeConfirmation(
      'Conferma',
      nextIsActive
        ? `${cliente.full_name} tornerà a vedere gli slot disponibili e potrà prenotare di nuovo.`
        : `${cliente.full_name} vedrà tutti gli slot occupati finché non lo sblocchi.`,
      [
        {
          text: 'Annulla',
          style: 'cancel',
          onPress: () => {
            releaseClientCardInteraction();
          },
        },
        {
          text: nextIsActive ? 'Sblocca' : 'Inibisci',
          style: nextIsActive ? 'default' : 'destructive',
          onPress: async () => {
            try {
              releaseClientCardInteraction();
              const result = await updateClientePersisted(
                {
                  id: cliente.id,
                  nome: targetClient?.nome ?? cliente.full_name,
                  telefono: targetClient?.telefono ?? cliente.phone,
                  email: targetClient?.email ?? cliente.email ?? '',
                },
                {
                  nome: targetClient?.nome ?? cliente.full_name,
                  telefono: targetClient?.telefono ?? cliente.phone,
                  email: targetClient?.email ?? cliente.email ?? '',
                  instagram: targetClient?.instagram ?? cliente.instagram ?? '',
                  birthday: targetClient?.birthday ?? cliente.birthday ?? '',
                  inibito: !nextIsActive,
                }
              );

              if (!result.ok) {
                throw new Error(result.error || `Non sono riuscito a ${actionLabel} il cliente.`);
              }

              requestAnimationFrame(() => {
                releaseClientCardInteraction();
              });
            } catch (error: any) {
              openCustomerFeedbackDialog({
                kind: 'error',
                title: `${nextIsActive ? 'Sblocco' : 'Blocco'} non completato`,
                message: error?.message || `Non sono riuscito a ${actionLabel} il cliente.`,
              });
            }
          },
        },
      ]
    );
  }, [
    confirmWebAction,    isDesktopWebClientActionsLayout,
    localClienti,
    matchesClientIdentity,
    openCustomerFeedbackDialog,
    releaseClientCardInteraction,
    updateClientePersisted,
  ]);

  const pendingRegistrationCount = useMemo(
    () => clienti.filter(item => item.registrationStatus === 'pending').length,
    [clienti]
  );

  React.useEffect(() => {
    if (pendingRegistrationCount === 0) setRegistrationFilter('all');
  }, [pendingRegistrationCount]);
  React.useEffect(() => { setRegistrationFilter('all'); }, [salonWorkspace.id]);

  const performRegistrationDecision = useCallback(async (
    item: ClienteItem,
    decision: 'approved' | 'rejected'
  ) => {
    if (registrationDecisionsRef.current.has(item.id)) return;
    registrationDecisionsRef.current.add(item.id);
    setRegistrationDecisions(current => ({ ...current, [item.id]: decision }));
    try {
      const result = await decideCustomerRegistration(item.id, decision);
      if (!result.ok) throw new Error(result.detail || 'La decisione non è stata salvata. Riprova.');
    } catch (cause) {
      openCustomerFeedbackDialog({
        kind: 'error',
        title: decision === 'approved' ? 'Approvazione non completata' : 'Rifiuto non completato',
        message: cause instanceof Error ? cause.message : 'La decisione non è stata salvata. Riprova.',
      });
    } finally {
      registrationDecisionsRef.current.delete(item.id);
      setRegistrationDecisions(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }, [decideCustomerRegistration, openCustomerFeedbackDialog]);

  const requestRegistrationRejection = useCallback((item: ClienteItem) => {
    if (registrationDecisionsRef.current.has(item.id)) return;
    Keyboard.dismiss();
    showSwipeConfirmation(
      'Rifiuta registrazione',
      `Rifiutare ${item.full_name}? Il cliente sarà rimosso dalla rubrica di questo salone e non potrà prenotare qui.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Rifiuta', style: 'destructive', onPress: () => { void performRegistrationDecision(item, 'rejected'); } },
      ]
    );
  }, [performRegistrationDecision, showSwipeConfirmation]);

  const clientiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    const visibleClients = registrationFilter === 'pending'
      ? clienti.filter(item => item.registrationStatus === 'pending')
      : clienti;

    if (!testo) return visibleClients;

    return visibleClients.filter((item) => {
      const nomeMatch = item.full_name?.toLowerCase().includes(testo);
      const telefonoMatch = item.phone?.toLowerCase().includes(testo);
      const emailMatch = item.email?.toLowerCase().includes(testo);
      const instagramMatch = item.instagram?.toLowerCase().includes(testo);
      return nomeMatch || telefonoMatch || emailMatch || instagramMatch;
    });
  }, [clienti, ricerca, registrationFilter]);

  const clientiSections = useMemo(() => {
    const alphabetical = [...clientiFiltrati].sort((a, b) =>
      a.full_name.localeCompare(b.full_name, 'it', { sensitivity: 'base' })
    );
    const isPending = (item: ClienteItem) => item.registrationStatus === 'pending';
    const isNew = (item: ClienteItem) => !isPending(item) && item.viewedBySalon === false;
    return [
      { key: 'pending', title: 'Da approvare', sortValue: 2, items: alphabetical.filter(isPending) },
      { key: 'new', title: 'Nuovi clienti', sortValue: 1, items: alphabetical.filter(isNew) },
      { key: 'read', title: 'Clienti', sortValue: 0, items: alphabetical.filter((item) => !isPending(item) && !isNew(item)) },
    ].filter((section) => section.items.length > 0).map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, uiKey: item.id })),
    }));
  }, [clientiFiltrati]);

  const clientiUnifiedList = useMemo<ClientiUnifiedListItem[]>(
    () => [{ key: 'rubrica-unificata', sections: clientiSections }],
    [clientiSections]
  );

  const cancellationAlertsCount = useMemo(
    () => {
      const seenClientKeys = new Set<string>();

      return clienti.reduce((total, item) => {
        const clientKeys = buildFrontendClientIdentityAliases({
          id: item.id,
          telefono: item.phone,
          email: item.email,
        });
        const keysForDeduplication = clientKeys.length > 0 ? clientKeys : [item.id];

        if (keysForDeduplication.some((key) => seenClientKeys.has(key))) {
          return total;
        }

        keysForDeduplication.forEach((key) => {
          seenClientKeys.add(key);
        });
        const liveCancellationCount = getFrontendClientCancellationCount(
          {
            id: item.id,
            telefono: item.phone,
            email: item.email,
          },
          stableClientCancellationCountsByIdentity
        );

        return total + Math.max(item.annullamentiCount ?? 0, liveCancellationCount);
      }, 0);
    },
    [clienti, stableClientCancellationCountsByIdentity]
  );

  React.useEffect(() => {
    const salonCode = salonWorkspace.salonCode?.trim() ?? '';
    let active = true;

    if (!salonCode) {
      setOnlinePolicyCompositions([]);
      return () => {
        active = false;
      };
    }

    void supabase
      .rpc('get_public_service_compositions_v1', { p_salon_code: salonCode })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !Array.isArray(data)) {
          setOnlinePolicyCompositions([]);
          return;
        }

        setOnlinePolicyCompositions(
          data
            .filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item)
            )
            .map((item) => {
              const compositionId = String(item.composition_id ?? '').trim();
              const componentServiceIds = Array.isArray(item.composition_items)
                ? item.composition_items
                    .filter(
                      (entry): entry is Record<string, unknown> =>
                        !!entry && typeof entry === 'object' && !Array.isArray(entry)
                    )
                    .map((entry) => String(entry.serviceId ?? entry.service_id ?? '').trim())
                    .filter(Boolean)
                : [];
              return {
                id: String(item.id ?? `composition:${compositionId}`).trim(),
                policyKey: buildCustomerOnlineBookingOverrideKey({
                  serviceId: String(item.id ?? ''),
                  compositionId,
                }),
                nome: String(item.name ?? '').trim(),
                mestiereRichiesto: String(item.required_role ?? '').trim(),
                durataMinuti: Number(item.duration_minutes ?? 0) || undefined,
                compositionId,
                componentServiceIds,
              } satisfies CustomerOnlinePolicyCatalogItem;
            })
            .filter(
              (item) => !!item.policyKey && !!item.nome && !!item.compositionId
            )
        );
      });

    return () => {
      active = false;
    };
  }, [salonWorkspace.salonCode]);

  const onlinePolicyServices = useMemo(() => {
    const byPolicyKey = new Map<string, CustomerOnlinePolicyCatalogItem>();
    servizi
      .filter(
        (service) =>
          service.disponibileOnline !== false &&
          service.soloComposizione !== true &&
          !service.compositionId?.trim()
      )
      .forEach((service) => {
        const policyKey = buildCustomerOnlineBookingOverrideKey({
          serviceId: service.id,
          compositionId: service.compositionId,
        });
        if (!policyKey) return;
        byPolicyKey.set(policyKey, {
          id: service.id,
          policyKey,
          nome: service.nome,
          mestiereRichiesto: service.mestiereRichiesto,
          durataMinuti: service.durataMinuti,
          compositionId: service.compositionId,
          componentServiceIds: service.compositionItems?.map((item) => item.serviceId) ?? [],
        });
      });
    onlinePolicyCompositions.forEach((composition) => {
      byPolicyKey.set(composition.policyKey, composition);
    });

    return Array.from(byPolicyKey.values())
        .sort((left, right) => {
          const roleComparison = (left.mestiereRichiesto || 'Altro').localeCompare(
            right.mestiereRichiesto || 'Altro',
            'it'
          );
          return roleComparison || left.nome.localeCompare(right.nome, 'it');
        });
  }, [onlinePolicyCompositions, servizi]);

  // The salon total includes linked/composed cards too. Those can be blocked
  // implicitly by one of their component services even when no extra override
  // is stored for the composed card itself. Keep the badge truthful to the
  // effective frontend visibility, not just to the number of persisted keys.
  const onlinePolicyEffectiveCountServices = useMemo(() => {
    const byPolicyKey = new Map<string, CustomerOnlinePolicyCatalogItem>();
    servizi
      .filter((service) => service.disponibileOnline !== false && service.soloComposizione !== true)
      .forEach((service) => {
        const policyKey = buildCustomerOnlineBookingOverrideKey({
          serviceId: service.id,
          compositionId: service.compositionId,
        });
        if (!policyKey) return;
        byPolicyKey.set(policyKey, {
          id: service.id,
          policyKey,
          nome: service.nome,
          mestiereRichiesto: service.mestiereRichiesto,
          durataMinuti: service.durataMinuti,
          compositionId: service.compositionId,
          componentServiceIds: service.compositionItems?.map((item) => item.serviceId) ?? [],
        });
      });
    onlinePolicyServices.forEach((service) => byPolicyKey.set(service.policyKey, service));
    return Array.from(byPolicyKey.values());
  }, [onlinePolicyServices, servizi]);

  const onlinePolicyBlockedServiceCount = useMemo(
    () =>
      countEffectiveBlockedOnlinePolicyServices(
        onlinePolicyOverrides,
        onlinePolicyEffectiveCountServices
      ),
    [onlinePolicyEffectiveCountServices, onlinePolicyOverrides]
  );

  const openCustomerOnlinePolicy = useCallback((item: ClienteItem) => {
    closeAllSwipeables();
    setDisableParentSwipe(false);
    setOpenWebClientActionsId(null);
    setOnlinePolicyClient(item);
    setLimitConfigClient(item);
    setLimitTargetClient(null);
    setLimitTargetMode(null);
    setCustomerRulesSection('limits');
    setOnlinePolicyMode(
      normalizeCustomerBookingAcceptanceMode(item.onlineBookingAcceptanceMode)
    );
    setOnlinePolicyAllowSameDaySameService(item.allowSameDaySameService !== false);
    setOnlinePolicyOverrides(
      normalizeCustomerOnlineServiceOverrides(item.onlineServiceOverrides)
    );
    setOnlinePolicyError('');
  }, [closeAllSwipeables, setDisableParentSwipe]);

  const closeCustomerOnlinePolicy = useCallback(() => {
    if (onlinePolicySaving) return;
    setOnlinePolicyClient(null);
    setLimitConfigClient(null);
    setLimitTargetClient(null);
    setLimitTargetMode(null);
    setOnlinePolicyError('');
    releaseClientCardInteraction();
  }, [onlinePolicySaving, releaseClientCardInteraction]);

  const persistCustomerOnlinePolicy = useCallback(async () => {
    if (!onlinePolicyClient || onlinePolicySaving) return;
    setOnlinePolicySaving(true);
    setOnlinePolicyError('');
    const result = await saveCustomerOnlineBookingPolicy(
      onlinePolicyClient.id,
      onlinePolicyMode,
      onlinePolicyOverrides,
      onlinePolicyAllowSameDaySameService
    );
    setOnlinePolicySaving(false);
    if (!result.ok) {
      setOnlinePolicyError(result.error || 'Salvataggio non riuscito. Riprova.');
      return;
    }
    setOnlinePolicyClient(null);
    setLimitConfigClient(null);
    setLimitTargetClient(null);
    setLimitTargetMode(null);
    releaseClientCardInteraction();
  }, [
    onlinePolicyClient,
    onlinePolicyMode,
    onlinePolicyAllowSameDaySameService,
    onlinePolicyOverrides,
    onlinePolicySaving,
    releaseClientCardInteraction,
    saveCustomerOnlineBookingPolicy,
  ]);

  const buildOnlinePolicyCardLabel = useCallback((item: ClienteItem) => {
    const mode = normalizeCustomerBookingAcceptanceMode(item.onlineBookingAcceptanceMode);
    if (mode === 'auto') return 'Sempre automatica';
    if (mode === 'manual') return 'Sempre manuale';
    return resolveCustomerAutoAccept(
      salonWorkspace.autoAcceptBookingRequests === true,
      mode
    )
      ? 'Segue il salone · automatica'
      : 'Segue il salone · manuale';
  }, [salonWorkspace.autoAcceptBookingRequests]);

  const customerDirectoryVisits = useMemo(() => {
    const visits=new Map<string,DirectoryVisit>();
    const now=Date.now();
    for(const customer of clienti){
      const phone=normalizePhoneForIdentity(customer.phone);
      const email=normalizeIdentityText(customer.email);
      const records=richiestePrenotazione.filter(request=>request.stato==='Accettata' && (
        request.customerId===customer.id ||
        (!!phone && normalizePhoneForIdentity(request.telefono)===phone) ||
        (!!email && normalizeIdentityText(request.email)===email)
      )).map(request=>({request,time:new Date(`${request.data}T${request.ora || '00:00'}`).getTime()})).filter(entry=>Number.isFinite(entry.time)).sort((a,b)=>a.time-b.time);
      const past=records.filter(entry=>entry.time<now);
      const next=records.find(entry=>entry.time>=now);
      const date=(time:number,withTime=false)=>new Date(time).toLocaleDateString('it-IT',{day:'numeric',month:'short',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})});
      visits.set(customer.id,{last:past.length?date(past[past.length-1].time):'—',next:next?date(next.time,true):'—',recent:records.slice().reverse().map(entry=>({title:entry.request.servizio || 'Appuntamento',date:date(entry.time,true),searchDate:entry.request.data,price:entry.request.prezzo,operator:entry.request.operatoreNome,status:entry.request.stato}))});
    }
    return visits;
  },[clienti,richiestePrenotazione]);

  const customerCardExpansion = useMemo(
    () => createCustomerCardExpansionStore(),
    [salonWorkspace.id, salonAccountEmail],
  );

  const renderClienteCard = useCallback((item: ClienteItem, expanded: boolean, toggleExpanded: () => void, displayMode: 'card' | 'table' | 'detail' = 'card', selected = false) => {
    const useCompactCustomerCard = true;
    const isDesktopWeb = isDesktopWebClientActionsLayout;
    const customerIdentityKey = `id:${item.id}`.trim().toLowerCase();
    const customerIdentityColor =
      customerIdentityColorsByKey.get(customerIdentityKey) ??
      '#64748B'; // Neutral placeholder, never an unconfirmed identity color.
    const isDesktopWebActionsOpen = openWebClientActionsId === item.id;
    const isInibito = (item.is_active ?? true) === false;
    const instagramHandle = item.instagram?.replace(/^@+/, '') ?? '';
    const canOpenInstagram = instagramHandle.trim() !== '';
    const isUnreadFrontendClient = item.viewedBySalon === false;
    const isPendingRegistration = item.registrationStatus === 'pending';
    const registrationDecision = registrationDecisions[item.id];
    const liveCancellationCount = getFrontendClientCancellationCount(
      {
        id: item.id,
        telefono: item.phone,
        email: item.email,
      },
      stableClientCancellationCountsByIdentity
    );
    const cancellationCount = Math.max(item.annullamentiCount ?? 0, liveCancellationCount);
    const hasCancellationAlert = cancellationCount > 0;
    const clientBookingInviteText = publicBookingLink
      ? `Ciao ${item.full_name.split(' ')[0] || ''}, per prenotare dal frontend usa questo link: ${publicBookingLink}`
      : '';
    const qrShareUrl =
      publicBookingLink && item.phone
        ? buildWhatsappTextUrl(item.phone, clientBookingInviteText)
        : '';

    const renderSwipeActions = () => {
      const actions = [
<InstantSwipeAction key="0"
          style={[styles.swipeActionButton, styles.swipeActionEdit, Platform.OS !== 'web' && styles.swipeActionCompact]}
          onActivate={() =>
            triggerClientSwipeAction(item.id, () => apriModificaCliente(item))
          }
          accessibilityLabel={`Modifica ${item.full_name}`}
        >
          <Ionicons name="person-outline" size={17} color={customerPalette.ink} />
          <Text style={[styles.swipeActionLabel, styles.swipeActionLabelEdit]}>Modifica</Text>
        </InstantSwipeAction>,
<InstantSwipeAction key="1"
          style={[styles.swipeActionButton, styles.swipeActionTiming, Platform.OS !== 'web' && styles.swipeActionCompact]}
          onActivate={() =>
            triggerClientSwipeAction(item.id, () => apriTempiPersonalizzatiCliente(item))
          }
          accessibilityLabel={`Tempi e prezzi personalizzati di ${item.full_name}`}
        >
          <Ionicons name="time-outline" size={17} color={customerPalette.ink} />
          <Text style={[styles.swipeActionLabel, styles.swipeActionLabelTiming]}>Tempi e prezzi</Text>
        </InstantSwipeAction>,
<InstantSwipeAction key="2"
          style={[styles.swipeActionButton, styles.swipeActionLimit, Platform.OS !== 'web' && styles.swipeActionCompact]}
          onActivate={() =>
            triggerClientSwipeAction(item.id, () => openCustomerOnlinePolicy(item))
          }
          accessibilityLabel={`Regole di prenotazione di ${item.full_name}`}
        >
          <Ionicons name="options-outline" size={17} color={customerPalette.ink} />
          <Text
            style={[styles.swipeActionLabel, styles.swipeActionLabelLimit]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            Regole{'\n'}prenotazione
          </Text>
        </InstantSwipeAction>,
<InstantSwipeAction key="3"
          style={[
            styles.swipeActionButton,
            isInibito ? styles.swipeActionUnlock : styles.swipeActionBlock,
            Platform.OS !== 'web' && styles.swipeActionCompact,
          ]}
          onActivate={() =>
            triggerClientSwipeAction(item.id, () => toggleInibizioneCliente(item))
          }
          accessibilityLabel={`${isInibito ? 'Sblocca' : 'Inibisci'} ${item.full_name}`}
        >
          <Ionicons
            name={isInibito ? 'lock-open-outline' : 'ban-outline'}
            size={17}
            color={customerPalette.ink}
          />
          <Text
            style={[
              styles.swipeActionLabel,
              isInibito ? styles.swipeActionLabelUnlock : styles.swipeActionLabelBlock,
            ]}
          >
            {isInibito ? 'Sblocca' : 'Inibisci'}
          </Text>
        </InstantSwipeAction>,
<InstantSwipeAction key="payment"
          style={[styles.swipeActionButton, styles.swipeActionPayment, Platform.OS !== 'web' && styles.swipeActionCompact]}
          onActivate={() => triggerClientSwipeAction(item.id, () => setPaymentPolicyClient(item))}
          accessibilityLabel={`Pagamento di ${item.full_name}`}>
          <Ionicons name="wallet-outline" size={18} color={customerPalette.ink} />
          <Text style={[styles.swipeActionLabel, styles.swipeActionLabelPayment]}>Pagamento</Text>
        </InstantSwipeAction>,
<InstantSwipeAction key="4"
          style={[styles.swipeActionButton, styles.swipeActionDelete, Platform.OS !== 'web' && styles.swipeActionCompact, Platform.OS !== 'web' && { flexDirection: 'row' }]}
          onActivate={() =>
            triggerClientSwipeAction(item.id, () =>
              eliminaCliente(item.id, item.full_name)
            )
          }
          accessibilityLabel={`Elimina ${item.full_name}`}
        >
          <Ionicons name="trash-outline" size={18} color={customerPalette.ink} />
          <Text
            style={[styles.swipeActionLabel, styles.swipeActionLabelDelete]}
          >
            Elimina
          </Text>
        </InstantSwipeAction>
      ];
      if (Platform.OS !== 'web') return (
        <View style={{ width: 204, height: '100%', paddingHorizontal: 6, paddingTop: 2, paddingBottom: 12, gap: 5 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>{actions.slice(0, 2)}</View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>{actions[2]}{actions[4]}</View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>{actions[3]}{actions[5]}</View>
        </View>
      );
      return <View style={styles.swipeActionsColumnRight}>{actions}</View>;
    };

    const renderManagementActions = () => (
      <View style={styles.webManagementActionsRow}>
        <HapticTouchable webHoverLift accessibilityLabel={`Pacchetti e vantaggi di ${item.full_name}`} style={[styles.webManagementActionButton, styles.webManagementActionButtonBenefits]}
          onPress={() => { setOpenWebClientActionsId(null); setPackageClient(item); }}>
          <Ionicons name="layers-outline" size={20} color={customerPalette.ink} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelBenefits]}>Pacchetti e vantaggi</Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift style={[styles.webManagementActionButton, styles.webManagementActionButtonPayment]}
          onPress={() => { setOpenWebClientActionsId(null); setPaymentPolicyClient(item); }}>
          <Ionicons name="wallet-outline" size={20} color={customerPalette.ink} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelPayment]}>Pagamento</Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift
          style={[styles.webManagementActionButton, styles.webManagementActionButtonEdit]}
          onPress={() => {
            setOpenWebClientActionsId(null);
            apriModificaCliente(item);
          }}
          pressScale={0.97}
          pressOpacity={0.97}
        >
          <Ionicons name="person-outline" size={20} color={styles.__premiumIcon.color} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelEdit]}>Modifica</Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift
          style={[styles.webManagementActionButton, styles.webManagementActionButtonTiming]}
          onPress={() => {
            setOpenWebClientActionsId(null);
            apriTempiPersonalizzatiCliente(item);
          }}
          pressScale={0.97}
          pressOpacity={0.97}
        >
          <Ionicons name="time-outline" size={20} color={customerPalette.ink} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelTiming]}>
            Tempi e prezzi
          </Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift
          style={[styles.webManagementActionButton, styles.webManagementActionButtonLimit]}
          onPress={() => {
            setOpenWebClientActionsId(null);
            openCustomerOnlinePolicy(item);
          }}
          pressScale={0.97}
          pressOpacity={0.97}
        >
          <Ionicons name="options-outline" size={20} color={customerPalette.ink} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelLimit]}>
            Regole di prenotazione
          </Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift
          style={[
            styles.webManagementActionButton,
            isInibito ? styles.webManagementActionButtonUnlock : styles.webManagementActionButtonBlock,
          ]}
          onPress={() => {
            setOpenWebClientActionsId(null);
            toggleInibizioneCliente(item);
          }}
          pressScale={0.97}
          pressOpacity={0.97}
        >
          <Ionicons
            name={isInibito ? 'lock-open-outline' : 'ban-outline'}
            size={20}
            color={customerPalette.muted}
          />
          <Text
            style={[
              styles.webManagementActionLabel,
              isInibito ? styles.webManagementActionLabelUnlock : styles.webManagementActionLabelBlock,
            ]}
          >
            {isInibito ? 'Sblocca' : 'Inibisci'}
          </Text>
        </HapticTouchable>
        <HapticTouchable webHoverLift
          style={[styles.webManagementActionButton, styles.webManagementActionButtonDelete]}
          onPress={() => {
            setOpenWebClientActionsId(null);
            eliminaCliente(item.id, item.full_name);
          }}
          pressScale={0.97}
          pressOpacity={0.97}
        >
          <Ionicons name="trash-outline" size={20} color={customerPalette.ink} />
          <Text style={[styles.webManagementActionLabel, styles.webManagementActionLabelDelete]}>Elimina</Text>
        </HapticTouchable>
      </View>
    );

    const benefitsAction = (
      <HapticTouchable
              accessibilityRole="button"
              accessibilityLabel={`Pacchetti e vantaggi di ${item.full_name}`}
              onPress={() => setPackageClient(item)}
              style={[styles.customerBenefitsButton, useCompactCustomerCard && styles.customerBenefitsButtonCompact]}
              pressScale={0.98}
            >
              <View style={styles.customerBenefitsIcon}>
                <Ionicons name="gift-outline" size={17} color="#795773" />
              </View>
              <Text numberOfLines={useCompactCustomerCard ? 2 : undefined} style={[styles.customerBenefitsButtonText, useCompactCustomerCard && styles.customerBenefitsCompactText]}>Pacchetti e vantaggi</Text>
              <View style={[styles.customerBenefitsArrow, useCompactCustomerCard && { display: 'none' }]}>
                <Ionicons name="chevron-forward" size={15} color="#865A75" />
              </View>
            </HapticTouchable>
    );

    const legacyCardInner = (
      <>
        
                <InfoButton size={28} hitSlop={8} style={[
                    styles.customerInfoButton,
                    { position: 'absolute', right: 10, top: 10, zIndex: 5 },
                    item.note?.trim() && styles.customerInfoButtonHasNote,
                  ]} onPress={() => setCustomerNoteClient(item)} pressScale={0.94} pressOpacity={0.96} accessibilityRole="button" accessibilityLabel={`Informazioni e note di ${item.full_name}`} />
        <View
          style={[
            styles.clienteMain,
            { gap: 2 },
            isDesktopWeb && styles.clienteMainDesktop,
          ]}
        >
          <View
            style={[
              styles.clienteCardBody,
              { gap: 0 },
              isDesktopWeb && styles.clienteCardBodyDesktop,
              Platform.OS === 'web' && { flexDirection: 'column' },
            ]}
          >
            <View
              style={[
                styles.clientePrimaryColumn,
                { gap: 5 },
                isDesktopWeb && styles.clientePrimaryColumnDesktop,
              ]}
            >
          <View
            style={[
              styles.clienteTopRow,
              isDesktopWeb && styles.clienteTopRowDesktop,
            ]}
          >
            <View
              style={[
                styles.clienteInitialBadge,
                Platform.OS !== 'web' && { width: 48, height: 48 },
                isDesktopWeb && styles.clienteInitialBadgeDesktop,
                {
                  borderRadius: 999,
                  backgroundColor: `${customerIdentityColor}${customerPalette.night ? '30' : '25'}`,
                  borderColor: `${customerIdentityColor}${customerPalette.night ? '65' : '45'}`,
                  borderWidth: 1,
                  ...(Platform.OS === 'web' ? {boxShadow:'inset 0 1px 0 rgba(255,255,255,.18)',backdropFilter:'blur(10px)'} : {}), 
                  shadowColor: 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.clienteInitialText,
                  isDesktopWeb && styles.clienteInitialTextDesktop,
                  { color: customerPalette.ink },
                ]}
              >
                {buildClientMonogram(item.full_name)}
              </Text>
            </View>
            <View
              style={[
                styles.clienteContentColumn,
                Platform.OS !== 'web' && { gap: 0, paddingTop: 0 },
                isDesktopWeb && styles.clienteContentColumnDesktop,
              ]}
            >
              <View style={[styles.clienteNameRow, { paddingRight: isDesktopWeb ? 74 : 36 }, Platform.OS !== 'web' && { minHeight: 22 }]}>
                <View style={styles.clienteNomeWrap}>
                  <CustomerCardName
                    style={[
                      styles.clienteNome,
                      Platform.OS !== 'web' && { lineHeight: 22, includeFontPadding: false },
                      isDesktopWeb && styles.clienteNomeDesktop,
                    ]}
                  >
                    {item.full_name}
                  </CustomerCardName>
                </View>

                {isInibito ? (
                  <View style={styles.statusBadgeBlockedCentered}>
                    <Text style={styles.statusBadgeBlockedText}>Inibito</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.clienteContactStack, Platform.OS !== 'web' && { gap: 0, paddingRight: 36 }]}>
                <Text
                  style={styles.clienteTelefono}
                  numberOfLines={Platform.OS === 'web' ? undefined : 1}
                  adjustsFontSizeToFit
                >
                  {item.phone}
                </Text>
                <Text
                  style={styles.clienteEmailCompact}
                  numberOfLines={Platform.OS === 'web' ? undefined : 1}
                  adjustsFontSizeToFit
                >
                  {item.email || 'Nessuna email'}
                </Text>
              </View>
            </View>
          </View>
          {<View
            style={[
              styles.statusBadgesRow,
              isDesktopWeb && styles.statusBadgesRowDesktop,
              Platform.OS === 'web' && { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
            ]}
          >
            <View
              style={[
                styles.statusLimitsColumn,
                isDesktopWeb && styles.statusLimitsColumnDesktop,
              ]}
            >
              {isPendingRegistration ? (
                <CustomerRegistrationReview
                  name={item.full_name}
                  decision={registrationDecision}
                  onApprove={() => { void performRegistrationDecision(item, 'approved'); }}
                  onReject={() => requestRegistrationRejection(item)}
                />
              ) : isUnreadFrontendClient ? (
                <View style={Platform.OS === 'web' ? styles.statusBadgeNewClient : styles.newClientActionsNative}>
                  <View style={Platform.OS !== 'web' ? styles.newClientBadgeNative : { flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={styles.statusBadgeNewClientDot} />
                  <Text style={[styles.statusBadgeNewClientText, Platform.OS !== 'web' && styles.newClientTextNative]}>Nuovo</Text>
                  </View>
                  <HapticTouchable
                    onPress={() => markFrontendClientsAsViewed([item.id])}
                    accessibilityRole="button"
                    accessibilityLabel={`Segna ${item.full_name} come letto`}
                    hitSlop={Platform.OS !== 'web' ? 7 : undefined}
                    style={Platform.OS === 'web' ? { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } : styles.newClientReadNative}
                  >
                    <Ionicons name={Platform.OS === 'web' ? 'checkmark-circle-outline' : 'checkmark'} size={Platform.OS === 'web' ? 24 : 17} color={customerPalette.action} />
                    {Platform.OS !== 'web' && <Text style={styles.newClientReadTextNative}>Segna letto</Text>}
                  </HapticTouchable>
                </View>
              ) : null}
              <View style={[styles.customerRulesContent, useCompactCustomerCard && styles.customerRulesContentCompact]}>
                {useCompactCustomerCard ? benefitsAction : null}
                <CustomerNotificationPermission workspaceId={salonWorkspace.id} customerId={item.id} phone={item.phone ?? ''} name={item.full_name} detailsVisible={!useCompactCustomerCard || expanded} detailsRightInset={useCompactCustomerCard ? 124 : 0} />
                <View style={[styles.customerRuleLine, useCompactCustomerCard && styles.customerRuleCompactCopy]}>
                  <Ionicons name="calendar-outline" size={15} color={styles.__premiumIcon.color} />
                  <View style={styles.customerRuleCopy}>
                    {Platform.OS === 'web' && !useCompactCustomerCard ? <Text style={styles.customerRuleHeading}>Prenotazioni</Text> : null}
                    <Text style={[styles.customerRuleDescription, useCompactCustomerCard && styles.customerRuleCompactText]}>
                      {(!useCompactCustomerCard || expanded) ? <Text style={styles.customerRuleHeading}>Prenotazioni · </Text> : null}
                      {typeof item.maxFutureAppointments !== 'number' && typeof item.maxDailyAppointments !== 'number'
                        ? 'Senza limiti'
                        : [typeof item.maxFutureAppointments === 'number'
                          ? `${item.maxFutureAppointments} ${item.maxFutureAppointmentsMode === 'total_future' ? 'future' : 'al mese'}`
                          : 'Senza limite mensile',
                          typeof item.maxDailyAppointments === 'number' ? `${item.maxDailyAppointments} al giorno` : 'Senza limite giornaliero'].join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={[styles.customerRuleLine, { minHeight: 20 }, useCompactCustomerCard && styles.customerRuleCompactCopy]}>
                  <Ionicons name={hasCancellationAlert ? "calendar-clear-outline" : "checkmark-circle-outline"} size={15} color={hasCancellationAlert ? "#B85460" : "#637D79"} />
                  <Text style={[styles.customerCancellationSummary, !hasCancellationAlert && { color: '#637D79' }]}>
                    {useCompactCustomerCard && !expanded ? (hasCancellationAlert ? `${cancellationCount} annullati` : 'Nessun annullato') : hasCancellationAlert ? `${cancellationCount} ${cancellationCount === 1 ? 'appuntamento annullato' : 'appuntamenti annullati'}` : 'Nessun appuntamento annullato'}
                  </Text>
                </View>
              </View>
            </View>
          </View>}

          {!useCompactCustomerCard ? benefitsAction : null}
            </View>
          <View style={styles.customerContactFooter}>
          {!useCompactCustomerCard ? (<HapticTouchable
              onPress={toggleExpanded}
              accessibilityRole="button"
              accessibilityState={{ expanded: !!expanded }}
              accessibilityLabel={expanded ? "Chiudi contatti" : "Contatta cliente"}
              style={[styles.customerDetailsDisclosure, styles.customerContactDisclosure, styles.customerContactDisclosureIntegrated]}
            >
              {<View style={styles.customerContactIcon}><Ionicons name="chatbubble-ellipses-outline" size={16} color="#406A79" /></View>}
              <Text style={styles.customerContactText}>{expanded ? 'Chiudi contatti' : 'Contatta cliente'}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color="#386A78" />
            </HapticTouchable>) : null}
          {useCompactCustomerCard && expanded ? <View style={styles.customerExpandedContactHeading}><View style={styles.customerContactIcon}><Ionicons name="chatbubble-ellipses-outline" size={16} color="#406A79" /></View><Text style={styles.customerContactText}>Contatta cliente</Text></View> : null}

          {expanded ? <>
          <View
            style={[
              styles.quickActionsSurface,
              isDesktopWeb && styles.quickActionsSurfaceDesktop,
              Platform.OS === 'web' && { width: '100%' },
            ]}
          >
            <View
              style={[
                styles.quickActionsRow,
                isDesktopWeb && styles.quickActionsRowDesktop,
                Platform.OS === 'web' && { flexDirection: 'row', flexWrap: 'wrap', height: 'auto' },
              ]}
            >
              <HapticTouchable webHoverLift
                style={[
                  styles.quickActionChip,
                  isDesktopWeb && styles.quickActionChipDesktop,
                ]}
                onPress={() => Linking.openURL(`tel:${buildDialablePhone(item.phone)}`).catch(() => null)}
                pressScale={0.97}
                pressOpacity={0.97}
              >
                <Ionicons name="call-outline" size={16} color={styles.__premiumIcon.color} />
                <Text style={[styles.quickActionText, isDesktopWeb && styles.quickActionTextDesktop]} numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.76}>
                  Chiama
                </Text>
              </HapticTouchable>
              <HapticTouchable webHoverLift
                style={[styles.quickActionChip, isDesktopWeb && styles.quickActionChipDesktop, styles.quickActionChipWhatsapp]}
                onPress={() => Linking.openURL(buildWhatsappUrl(item.phone)).catch(() => null)}
                pressScale={0.97}
                pressOpacity={0.97}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                <Text style={[styles.quickActionText, isDesktopWeb && styles.quickActionTextDesktop, styles.quickActionTextWhatsapp]} numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  WhatsApp
                </Text>
              </HapticTouchable>
              <HapticTouchable webHoverLift
                style={[styles.quickActionChip, isDesktopWeb && styles.quickActionChipDesktop, styles.quickActionChipInstagram, !canOpenInstagram && styles.quickActionChipDisabled]}
                onPress={() => {
                  if (!canOpenInstagram) return;
                  Linking.openURL(buildInstagramUrl(item.instagram) || '').catch(() => null);
                }}
                pressScale={0.97}
                pressOpacity={0.97}
                disabled={!canOpenInstagram}
              >
                <Ionicons name="logo-instagram" size={16} color="#6D28D9" />
                <Text style={[styles.quickActionText, isDesktopWeb && styles.quickActionTextDesktop, styles.quickActionTextInstagram]} numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  Instagram
                </Text>
              </HapticTouchable>
              <HapticTouchable webHoverLift
                style={[styles.quickActionChip, isDesktopWeb && styles.quickActionChipDesktop, styles.quickActionChipQr, (!qrShareUrl || isInibito) && styles.quickActionChipDisabled]}
                onPress={() => {
                  if (!qrShareUrl || isInibito) return;
                  Linking.openURL(qrShareUrl).catch(() => null);
                }}
                pressScale={0.97}
                pressOpacity={0.97}
                disabled={!qrShareUrl || isInibito}
              >
                <Ionicons name="qr-code-outline" size={16} color="#7C5A30" />
                <Text style={[styles.quickActionText, isDesktopWeb && styles.quickActionTextDesktop, styles.quickActionTextQr]} numberOfLines={Platform.OS === 'web' ? undefined : 1} ellipsizeMode="clip" adjustsFontSizeToFit minimumFontScale={0.78}>
                  Invio QR
                </Text>
              </HapticTouchable>
            </View>
          </View>
          </> : null}
            {useCompactCustomerCard ? (<HapticTouchable onPress={toggleExpanded} accessibilityRole="button" accessibilityState={{ expanded: !!expanded }} accessibilityLabel={expanded ? "Comprimi scheda cliente" : "Espandi scheda cliente"} style={styles.customerCompactDisclosure} hitSlop={4}>
        <View pointerEvents="none" style={styles.customerCompactSwipeCopy}><Ionicons name={isDesktopWeb ? "ellipsis-horizontal" : "arrow-back"} size={12} color="#65758D" /><Text style={styles.customerCompactSwipeText}>{isDesktopWeb ? "Gestisci dal menu" : "Scorri per gestire"}</Text></View>
        <View style={styles.customerCompactDisclosureLabel}><Text numberOfLines={1} style={[styles.customerContactText, { flex: 0, flexBasis: 'auto', flexShrink: 0, fontSize: 12 }]}>{expanded ? 'Mostra meno' : 'Dettagli'}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#386A78" /></View>
      </HapticTouchable>) : null}
          </View>
          </View>
          

          
        </View>
      </>
    );

    const managementModal = displayMode !== 'detail' ? (isDesktopWebActionsOpen ? (
            <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent visible animationType="fade" onRequestClose={() => setOpenWebClientActionsId(null)}>
              <View style={styles.webManagementOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenWebClientActionsId(null)} />
                <Pressable onPress={(event) => event.stopPropagation()} style={[styles.webManagementSheet,{maxHeight:Math.max(240,windowHeight-48)}]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={styles.webManagementTitle}>{item.full_name}</Text>
                    <HapticTouchable accessibilityLabel="Chiudi gestione cliente" onPress={() => setOpenWebClientActionsId(null)} style={styles.webManagementClose}><Text style={{fontSize:12,color:customerPalette.ink}}>Chiudi</Text><Ionicons name="close" size={17} color={styles.__premiumIcon.color} /></HapticTouchable>
                  </View>
                  <ScrollView keyboardShouldPersistTaps="handled">{renderManagementActions()}</ScrollView>
                </Pressable>
              </View>
            </Modal>
          ) : null) : null;
    const directoryRow = <CustomerDirectoryRow premium={Platform.OS==='web'?customerPremiumStatuses.get(item.id):undefined} name={item.full_name} initials={buildClientMonogram(item.full_name)} color={customerIdentityColor} unread={isUnreadFrontendClient} status={isPendingRegistration?'Da approvare':isInibito?'Inibito':isUnreadFrontendClient?'Nuovo cliente':'Attivo'} visit={customerDirectoryVisits.get(item.id)} table={displayMode==='table'} selected={selected} onSelect={Platform.OS!=='web'?()=>setClientDetailsId(item.id):toggleExpanded} onOptions={() => setOpenWebClientActionsId(item.id)} onCall={() => Linking.openURL(`tel:${buildDialablePhone(item.phone)}`).catch(() => null)} onMessage={() => { const url=buildWhatsappUrl(item.phone); if(url) Linking.openURL(url).catch(() => null); }} />;
    const profileDetails = <CustomerProfileSummary premium={Platform.OS==='web'?customerPremiumStatuses.get(item.id):undefined} name={item.full_name} initials={buildClientMonogram(item.full_name)} color={customerIdentityColor} phone={item.phone??''} email={item.email??''} status={isPendingRegistration?'Da approvare':isInibito?'Inibito':'Attivo'} cancellations={cancellationCount} limits={[typeof item.maxFutureAppointments==='number'?`${item.maxFutureAppointments} ${item.maxFutureAppointmentsMode==='total_future'?'prenotazioni future':'prenotazioni al mese'}`:'Senza limite mensile',typeof item.maxDailyAppointments==='number'?`${item.maxDailyAppointments} al giorno`:'Senza limite giornaliero'].join(' · ')} onEdit={()=>leaveClientDetailsFor('edit',item)} onOptions={()=>leaveClientDetailsFor('options',item)} onBenefits={()=>leaveClientDetailsFor('benefits',item)} actions={[
      {label:'Chiama',icon:'call-outline',onPress:()=>{Linking.openURL(`tel:${buildDialablePhone(item.phone)}`).catch(()=>null);}},
      {label:'WhatsApp',icon:'chatbubble-outline',onPress:()=>{Linking.openURL(buildWhatsappUrl(item.phone)).catch(()=>null);}},
      {label:'Instagram',icon:'logo-instagram',disabled:!canOpenInstagram,onPress:()=>{if(canOpenInstagram)Linking.openURL(buildInstagramUrl(item.instagram)||'').catch(()=>null);}},
      {label:'Invia invito',icon:'qr-code-outline',disabled:!qrShareUrl||isInibito,onPress:()=>{if(qrShareUrl&&!isInibito)Linking.openURL(qrShareUrl).catch(()=>null);}}
    ]}>
      {isPendingRegistration?<CustomerRegistrationReview name={item.full_name} decision={registrationDecision} onApprove={()=>{void performRegistrationDecision(item,'approved');}} onReject={()=>requestRegistrationRejection(item)}/>:null}
      {isUnreadFrontendClient?<HapticTouchable accessibilityRole="button" onPress={()=>markFrontendClientsAsViewed([item.id])} style={{paddingVertical:9}}><Text style={{color:customerPalette.ink,fontSize:12}}>✓ Segna cliente come letto</Text></HapticTouchable>:null}
      <CustomerNotificationPermission workspaceId={salonWorkspace.id} customerId={item.id} phone={item.phone??''} name={item.full_name} detailsVisible detailsRightInset={0}/>
    </CustomerProfileSummary>;
    const cardInner = <>{Platform.OS==='web'&&expanded&&displayMode==='card'?<><View style={{padding:18}}>{profileDetails}</View><HapticTouchable accessibilityRole="button" accessibilityLabel="Riduci scheda cliente" onPress={toggleExpanded} style={{padding:14,alignItems:'center',borderTopWidth:1,borderTopColor:customerPalette.line}}><Text style={{color:customerPalette.muted,fontSize:12}}>Mostra meno</Text></HapticTouchable></>:<>{directoryRow}{expanded&&displayMode==='card'?legacyCardInner:null}</>}{managementModal}</>;
    if(displayMode==='table')return cardInner;
    if(displayMode==='detail')return profileDetails;

    const cardContent = isDesktopWeb ? (
      <View
        style={[
          styles.clienteCard,
          isUnreadFrontendClient && styles.clienteCardUnread,
          styles.clienteCardWebStatic,
          styles.clienteCardNativePremium,
          !isDesktopWebActionsOpen && styles.clienteCardWebClosed,
          isDesktopWebActionsOpen && styles.clienteCardWebActionsOpen,
          clienteInModifica?.id === item.id && styles.clienteCardSelected,
        ]}
      >
        {cardInner}
      </View>
    ) : (
      <View
        style={[
          styles.clienteCardNativeShadow,
          isUnreadFrontendClient && styles.clienteCardNativeShadowUnread,
          clienteInModifica?.id === item.id && styles.clienteCardNativeShadowSelected,
        ]}
      >
        <HapticTouchable
          activeOpacity={1}
          hapticType="none"
          pressScale={0.985}
          pressOpacity={0.985}
          style={[
            styles.clienteCard,
            styles.clienteCardNativePremium,
            isUnreadFrontendClient && styles.clienteCardUnread,
            clienteInModifica?.id === item.id && styles.clienteCardSelected,
          ]}
        >
          {cardInner}
        </HapticTouchable>
      </View>
    );

    if (isDesktopWeb) {
      return (
        <Animated.View
          style={isDesktopWebActionsOpen ? styles.clienteCardDesktopOpenLayer : undefined}
          layout={LinearTransition.duration(220).easing(Easing.out(Easing.cubic))}
          exiting={FadeOutUp.duration(180).easing(Easing.out(Easing.cubic))}
        >
          {cardContent}
        </Animated.View>
      );
    }

    return <Animated.View layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}>{cardContent}</Animated.View>;

  }, [
    leaveClientDetailsFor,
    windowHeight,
    apriTempiPersonalizzatiCliente,
    customerSheetDockStyle,
    salonWorkspace.id,
    buildOnlinePolicyCardLabel,
    stableClientCancellationCountsByIdentity,
    apriModificaCliente,
    clienteInModifica?.id,
    closeAllSwipeables,
    customerIdentityColorsByKey,
    customerDirectoryVisits,
    customerPremiumStatuses,
    eliminaCliente,
    getSwipeableRef,
    handleDesktopWebClientActionsTrigger,
    isDesktopWebClientActionsLayout,
    lockClientCardSwipe,
    markClientCardTouchStart,
    markFrontendClientsAsViewed,
    openWebClientActionsId,
    openCustomerOnlinePolicy,
    onlinePolicyEffectiveCountServices,
    publicBookingLink,
    setDisableParentSwipe,
    toggleInibizioneCliente,
    triggerClientSwipeAction,
    registrationDecisions,
    performRegistrationDecision,
    requestRegistrationRejection, styles, customerPalette
  ]);

  const clientiUnifiedListKeyExtractor = useCallback(
    (item: ClientiUnifiedListItem) => item.key,
    []
  );

  const handleClientiListScrollBeginDrag = useCallback(() => {
    Keyboard.dismiss();
    clientCardTouchActiveRef.current = false;
    clientSwipeOwnerRef.current = null;
    setDisableParentSwipe(false);
    Object.values(swipeableRefs.current).forEach((ref) => ref.current?.close());
  }, [setDisableParentSwipe]);

  const renderClientiUnifiedListItem = useCallback(
    ({ item }: { item: ClientiUnifiedListItem }) => (
      <View style={[styles.pageShell, styles.daySectionCardShell, { maxWidth: responsive.contentMaxWidth }]}>
        
        <View
          style={[styles.searchCard, getWebExpandableCardStyle(true)]}
        >
          <View {...(Platform.OS==='web'?{dataSet:{customerDirectoryHeading:'true'}}:{})} style={{flexDirection:'row',alignItems:'center',gap:12,paddingLeft:0,paddingRight:0,marginBottom:Platform.OS==='web'?16:5,minHeight:Platform.OS==='web'?44:32}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:9,flex:1,flexShrink:0,minWidth:0}}><Text {...(Platform.OS==='web'?{dataSet:{customerDirectoryTitle:'true'}}:{})} style={Platform.OS==='web'?[styles.searchTitle,{fontSize:17,lineHeight:23,fontWeight:'500',flexGrow:0,flexShrink:1,flexBasis:'auto',width:'auto'}]:{fontSize:17,lineHeight:23,fontWeight:'500',color:customerPalette.ink,textAlign:'left',flexShrink:0}} numberOfLines={Platform.OS==='web'?undefined:1}>{Platform.OS==='web'?'Rubrica clienti':'Clienti'}</Text><View style={{minWidth:27,height:25,borderRadius:8,paddingHorizontal:7,alignItems:'center',justifyContent:'center',backgroundColor:customerPalette.field,borderWidth:1,borderColor:customerPalette.border}}><Text style={{color:customerPalette.muted,fontSize:12,fontWeight:'600'}}>{clienti.length}</Text></View></View>
            <InfoButton size={Platform.OS==='web'?48:28} accessibilityLabel="Come funziona la Rubrica clienti" accessibilityState={{expanded:rubricaGuideOpen}} onPress={()=>{setRubricaGuideOpen(value=>!value);setRemindersGuideOpen(false);}}/>
          </View>

          {unreadFrontendClientIds.length > 0 ? (
            <View style={styles.markAllClientsReadRow}>
              <MarkAllReadButton
                count={unreadFrontendClientIds.length}
                label="Segna nuovi letti"
                onPress={markAllFrontendClientsAsViewed}
              />
            </View>
          ) : null}

          {rubricaGuideOpen ? (
            <SectionHowItWorksPanel premiumNative onClose={() => setRubricaGuideOpen(false)}
              title="Gestisci ogni cliente da un’unica card"
              description="Ricerca, contatti, regole di prenotazione e dati personali restano collegati allo stesso cliente su web e app."
              steps={[
                {
                  title: 'Trova e apri',
                  description:
                    'Cerca per nome, telefono, email o Instagram. Premi la spunta accanto al badge Nuovo per segnare il cliente come letto.',
                },
                {
                  title: 'Contatta subito',
                  description:
                    'Usa Chiamata, WhatsApp, Instagram e Invio QR senza entrare nella modifica completa.',
                },
                {
                  title: 'Regole di prenotazione',
                  description:
                    'Dallo swipe o dal menu Gestione cliente apri Regole di prenotazione: trovi limiti, approvazione e servizi consentiti.',
                },
                {
                  title: 'Limiti e inibizione',
                  description:
                    'Imposta un limite totale futuro o mensile, aggiungi il limite giornaliero separato oppure inibisci temporaneamente il cliente.',
                },
                {
                  title: 'Personalizzazioni',
                  description:
                    'Gestisci dati, note interne, compleanno, prezzi e durate dedicate, incluse lavorazione, posa e fase finale.',
                },
                {
                  title: 'Azioni della card',
                  description:
                    'Su app scorri la card verso sinistra: tutte le azioni si aprono a destra, con Elimina per ultima. Sul web apri il pannello in basso.',
                },
              ]}
              note="Lo stato Nuovo da vedere e le regole cliente sono persistenti: la conferma di lettura fatta su web si riflette anche nell’app, e viceversa."
            />
          ) : null}

          <Animated.View
              layout={
                Platform.OS === 'web'
                  ? undefined
                  : LinearTransition.duration(210).easing(Easing.out(Easing.cubic))
              }
            >
              <PremiumSearchToolbar style={Platform.OS==='web'?{marginBottom:14}:{marginBottom:2}}>
              <ClearableTextInput
                ref={customerSearchInputRef}
                onFocus={Platform.OS !== 'web' ? () => scrollToField(customerSearchInputRef) : undefined}
                placeholder={
                  Platform.OS === 'web'
                    ? 'Cerca per nome, telefono, email o Instagram'
                    : 'Cerca nome, telefono, email o Instagram'
                }
                placeholderTextColor="#8f8f8f"
                value={ricerca}
                onChangeText={setRicerca}
                style={[
                  styles.input,
                  styles.searchInput,
                  Platform.OS !== 'web' ? styles.searchInputNative : null,
                ]}
              />

              {pendingRegistrationCount > 0 ? (
                <View {...(Platform.OS==='web'?{dataSet:{premiumToolbarFilters:"true"}}:{})} style={styles.registrationFilters}>
                  <HapticTouchable
                    accessibilityRole="button"
                    accessibilityLabel="Mostra tutti i clienti"
                    accessibilityState={{ selected: registrationFilter === 'all' }}
                    aria-pressed={registrationFilter === 'all'}
                    onPress={() => setRegistrationFilter('all')}
                    style={[styles.registrationFilterChip, registrationFilter === 'all' && styles.registrationFilterSelected]}
                  >
                    <Text style={[styles.registrationFilterText, registrationFilter === 'all' && styles.registrationFilterTextSelected]}>Tutti</Text>
                  </HapticTouchable>
                  <HapticTouchable
                    accessibilityRole="button"
                    accessibilityLabel={`Mostra ${pendingRegistrationCount} clienti da approvare`}
                    accessibilityState={{ selected: registrationFilter === 'pending' }}
                    aria-pressed={registrationFilter === 'pending'}
                    onPress={() => setRegistrationFilter('pending')}
                    style={[styles.registrationFilterChip, registrationFilter === 'pending' && styles.registrationFilterSelected]}
                  >
                    <Ionicons name="person-add-outline" size={14} color={registrationFilter === 'pending' ? '#1D4ED8' : '#64748B'} />
                    <Text style={[styles.registrationFilterText, registrationFilter === 'pending' && styles.registrationFilterTextSelected]}>Da approvare · {pendingRegistrationCount}</Text>
                  </HapticTouchable>
                </View>
              ) : null}

              </PremiumSearchToolbar>

              {item.sections.length === 0 ? (
                <View style={styles.searchEmptyState}>
                  <Text style={styles.searchEmptyTitle}>
                    {ricerca.trim()
                      ? `Nessun cliente corrisponde a "${ricerca.trim()}"`
                      : 'Nessun cliente presente'}
                  </Text>
                  <Text style={styles.searchEmptyText}>
                    {ricerca.trim()
                      ? 'Tocca la X nella barra per annullare la ricerca.'
                      : 'Aggiungi il primo cliente usando il modulo qui sopra.'}
                  </Text>
                </View>
              ) : (
                Platform.OS === 'web' && responsive.width >= 1100 ? <CustomerDirectoryBoard items={item.sections.flatMap(section=>section.items)} visits={customerDirectoryVisits} renderRow={(customer,selected,onSelect)=>renderClienteCard(customer,false,onSelect,'table',selected)} renderDetails={customer=>renderClienteCard(customer,true,()=>setOpenWebClientActionsId(customer.id),'detail')} /> : (                <View style={styles.clientSectionsWrap}>
                  {item.sections.map((section) => (
                    <View key={section.key} style={styles.clientMonthSection}>
                      {section.title !== 'Data non disponibile' && section.title.toLocaleLowerCase('it') !== 'clienti' ? (
                        <View style={styles.clientMonthSectionHeader}>
                          <Animated.Text
                            style={styles.clientMonthSectionTitle}
                            layout={
                              Platform.OS === 'web'
                                ? undefined
                                : LinearTransition.duration(150).easing(Easing.out(Easing.cubic))
                            }
                          >
                            {section.title}
                          </Animated.Text>
                        </View>
                      ) : null}
                      {isDesktopWebLayout ? (
                        <View style={styles.clientMonthSectionGridWeb}>
                          {section.items.map((clienteItem) => (
                            <Animated.View
                              key={clienteItem.uiKey ?? clienteItem.id}
                              style={{width:'100%',marginBottom:8}}
                              layout={undefined}
                            >
                              <CustomerCardBoundary item={clienteItem} expansion={customerCardExpansion} renderCard={renderClienteCard} />
                            </Animated.View>
                          ))}
                        </View>
                      ) : (
                        section.items.map((clienteItem) => (
                          <Animated.View
                            key={clienteItem.uiKey ?? clienteItem.id}
                            layout={
                              Platform.OS === 'web'
                                ? undefined
                                : LinearTransition.duration(170).easing(Easing.out(Easing.cubic))
                            }
                          >
                            <CustomerCardBoundary item={clienteItem} expansion={customerCardExpansion} renderCard={renderClienteCard} />
                          </Animated.View>
                        ))
                      )}
                    </View>
                  ))}
                </View>)
              )}
            </Animated.View>
        </View>
      </View>
    ),
    [
      isDesktopWebLayout,
      clienti.length,
      markAllFrontendClientsAsViewed,
      markFrontendClientsAsViewed,
      ricerca,
      renderClienteCard,
      customerCardExpansion,
      customerDirectoryVisits,
      responsive.width,
      responsive.contentMaxWidth,
      webClientGridItemStyle,
      rubricaGuideOpen,
      markHeaderExpandTouchStart,
      unreadFrontendClientIds.length,
      pendingRegistrationCount,
      registrationFilter, styles, customerPalette
    ]
  );

  const renderCreateBirthdayPicker = () => (
      <NativeDatePickerModal
        bottomAnchored
        visible={createBirthdayPickerValue !== null}
        title="Data di nascita (Opzionale)"
        initialValue={createBirthdayPickerValue || undefined}
        onClose={() => setCreateBirthdayPickerValue(null)}
        onConfirm={(value) => {
          customerCreatorFormRef.current?.setBirthday(value);
          setCreateBirthdayPickerValue(null);
        }}
      />
  );
  const renderCustomerFeedback = () => (
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={customerFeedbackDialog.visible}
        onShow={resetClientSwipeAfterPopupShown}
        transparent
        animationType="fade"
        onRequestClose={closeCustomerFeedbackDialog}
        onDismiss={releaseClientCardInteraction}
      >
        <CustomerSheetFrame onClose={closeCustomerFeedbackDialog}>
          <View style={styles.successDialogBackdrop} />
          <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={styles.successDialogShell}
        >
            <View
              style={[
                styles.successDialogCard,
                customerSheetDockStyle,
                customerFeedbackDialog.kind === 'error'
                  ? styles.feedbackDialogCardError
                  : styles.successDialogCardClient,
              ]}
            >
              <NativeSheetHandle style={styles.successDialogHandle} />
              <View style={styles.successDialogIconRow}>
                <View
                  style={[
                    styles.successDialogIconWrap,
                    customerFeedbackDialog.kind === 'error'
                      ? styles.feedbackDialogIconWrapError
                      : styles.successDialogIconWrapClient,
                  ]}
                >
                  <Ionicons
                    name={customerFeedbackDialog.kind === 'error' ? 'alert-circle' : 'person-add'}
                    size={20}
                    color={customerFeedbackDialog.kind === 'error' ? (customerPalette.night ? '#D3B078' : '#946A36') : customerPalette.ink}
                  />
                </View>
                <View style={styles.successDialogTitleWrap}>
                  <Text
                    style={[
                      styles.successDialogEyebrow,
                      customerFeedbackDialog.kind === 'error' && styles.feedbackDialogEyebrowError,
                    ]}
                  >
                    {customerFeedbackDialog.eyebrow}
                  </Text>
                  <Text
                    style={[
                      styles.successDialogTitle,
                      customerFeedbackDialog.kind === 'error' && styles.feedbackDialogTitleError,
                    ]}
                  >
                    {customerFeedbackDialog.title}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.successDialogBody,
                  customerFeedbackDialog.kind === 'error' && styles.feedbackDialogBodyError,
                ]}
              >
                {customerFeedbackDialog.message}
              </Text>
              <HapticTouchable
                style={[
                  styles.successDialogButton,
                  customerFeedbackDialog.kind === 'error' && styles.feedbackDialogButtonError,
                ]}
                onPress={closeCustomerFeedbackDialog}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.successDialogButtonText}>{customerFeedbackDialog.buttonLabel}</Text>
              </HapticTouchable>
            </View>
          </Animated.View>
        </CustomerSheetFrame>
      </Modal>
  );

  const customerConfirmationModal = (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={!!swipeConfirmation} transparent animationType="fade"
        onShow={resetClientSwipeAfterPopupShown}
        onRequestClose={() => { pendingWebConfirmation.current?.(false); pendingWebConfirmation.current = null; setSwipeConfirmation(null); }}>
        <CustomerSheetFrame onClose={() => { pendingWebConfirmation.current?.(false); pendingWebConfirmation.current = null; setSwipeConfirmation(null); }}>
          <View style={[styles.successDialogShell, styles.successDialogCard, customerSheetDockStyle]}>
            <NativeSheetHandle style={styles.dialogHandle} />
            <View style={styles.confirmIcon}><Ionicons name={swipeConfirmation?.buttons.some(button => button.style === 'destructive') ? "alert-circle-outline" : "shield-checkmark-outline"} size={25} color={styles.__premiumIcon.color} /></View>
            <Text style={styles.successDialogTitle}>{swipeConfirmation?.title}</Text>
            <Text style={styles.successDialogBody}>{swipeConfirmation?.message}</Text>
            {swipeConfirmation?.buttons.map((button, index) => (
              <HapticTouchable key={index} style={[styles.confirmAction, button.style === 'cancel' ? styles.confirmCancel : button.style === 'destructive' ? styles.confirmDestructive : styles.confirmPrimary, {backgroundColor:button.style === 'cancel' ? customerPalette.field : button.style === 'destructive' ? '#A63B4D' : customerPalette.action}]}
                onPress={() => { setSwipeConfirmation(null); button.onPress?.(); }}>
                <Text style={[styles.confirmActionText, {color:button.style === 'cancel' ? customerPalette.ink : button.style === 'destructive' ? '#FFFFFF' : customerPalette.actionText}]}>{button.text}</Text>
              </HapticTouchable>
            ))}
          </View>
        </CustomerSheetFrame>
      </Modal>
  );

  const customerCommunicationsSection = (<>
            <View style={styles.customerRemindersGuideCard}>
              <PremiumGuideDock tone={{ink:customerPalette.ink,fill:customerPalette.field,border:customerPalette.border}}
                guideOpen={remindersGuideOpen}
                cutoutColor="#EEF2F6"
                onGuidePress={() => {
                  setRemindersGuideOpen((current) => !current);
                  setRubricaGuideOpen(false);
                }}
                guideAccessibilityLabel="Come funzionano promemoria e comunicazioni ai clienti"
              />
              <View style={styles.customerRemindersGuideHeader}>
                <View style={styles.customerRemindersGuideCopy}>
                  <Text style={styles.customerRemindersGuideTitle}>
                    Promemoria e comunicazioni
                  </Text>
                  <Text style={styles.customerRemindersGuideSubtitle}>
                    Gestisci memo appuntamenti, messaggi e benvenuto ai nuovi clienti.
                  </Text>
                </View>
              </View>
              {remindersGuideOpen ? (
                <SectionHowItWorksPanel premiumNative onClose={() => setRemindersGuideOpen(false)}
                  title="Resta in contatto con i clienti"
                  description="Le tre funzioni hanno scopi diversi e usano soltanto dispositivi correttamente registrati per le notifiche."
                  steps={[
                    {
                      title: 'Promemoria appuntamento',
                      description:
                        'Scegli Off oppure quante ore prima inviare il memo standard. La regola vale per tutti gli appuntamenti del salone.',
                    },
                    {
                      title: 'Comunicazioni push',
                      description:
                        'Promuovi offerte e prodotti dello shop, crea avvisi o chiusure e inviale a tutti i clienti oppure seleziona soltanto i contatti interessati.',
                    },
                    {
                      title: 'Benvenuto nuovi clienti',
                      description:
                        'Personalizza titolo e messaggio. Compare una sola volta, dopo notifiche e Face ID o impronta, se la funzione è attiva.',
                    },
                    {
                      title: 'Controlla prima di inviare',
                      description:
                        'Le impostazioni mostrano stato e riepilogo; le comunicazioni richiedono composizione e destinatari prima della conferma.',
                    },
                  ]}
                  note="Le preferenze vengono salvate per il salone. Disattivare il memo non disattiva comunicazioni push o messaggio di benvenuto."
                />
              ) : null}
            </View>

            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <Text style={styles.reminderTitle}>Promemoria push clienti</Text>
                <View
                  style={[
                    styles.reminderStatusBadge,
                    customerReminderHoursBefore > 0
                      ? styles.reminderStatusBadgeActive
                      : styles.reminderStatusBadgeDanger,
                  ]}
                >
                  <Text
                    style={[
                      styles.reminderStatusBadgeText,
                      customerReminderHoursBefore > 0
                        ? styles.reminderStatusBadgeTextActive
                        : styles.reminderStatusBadgeTextDanger,
                    ]}
                  >
                    {formatReminderHoursLabel(customerReminderHoursBefore)}
                  </Text>
                </View>
              </View>

              <Text style={styles.reminderDescription}>
                Il salone decide una sola regola per tutti gli appuntamenti. Il push memo parte
                solo per i clienti che hanno gia registrato il loro device.
              </Text>

              <View style={styles.reminderOptionsRow}>
                {CUSTOMER_REMINDER_HOUR_OPTIONS.map((hours) => {
                  const isActive = customerReminderHoursBefore === hours;
                  return (
                    <HapticTouchable webHoverLift
                      key={`reminder-hours-${hours}`}
                      style={[
                        styles.reminderOptionChip,
                        isActive && styles.reminderOptionChipActive,
                        !isCustomerReminderReady && styles.reminderOptionChipDisabled,
                      ]}
                      onPress={() => updateCustomerReminderHours(hours)}
                      disabled={!isCustomerReminderReady || isUpdatingCustomerReminder}
                      pressScale={1}
                      pressOpacity={0.92}
                    >
                      <Text
                        style={[
                          styles.reminderOptionChipText,
                          isActive && styles.reminderOptionChipTextActive,
                        ]}
                      >
                        {hours === 0 ? 'Off' : `${hours}h`}
                      </Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <View
                style={[
                  styles.reminderSummaryCard,
                  customerReminderHoursBefore > 0
                    ? styles.reminderSummaryCardActive
                    : styles.reminderSummaryCardDanger,
                ]}
              >
                <Text
                  style={[
                    styles.reminderSummaryText,
                    customerReminderHoursBefore > 0
                      ? styles.reminderSummaryTextActive
                      : styles.reminderSummaryTextDanger,
                  ]}
                >
                  {!isCustomerReminderReady
                    ? 'Carico la preferenza salvata...'
                    : isUpdatingCustomerReminder
                    ? `Sto riallineando il promemoria push su ${formatReminderHoursLabel(
                        customerReminderHoursBefore
                      )}...`
                    : customerReminderHoursBefore > 0
                    ? `Promemoria push attivi: ${formatReminderHoursLabel(customerReminderHoursBefore)}`
                    : 'Promemoria push disattivati per tutti gli appuntamenti'}
                </Text>
              </View>

              {customerReminderSaveError ? (
                <Text style={styles.reminderErrorText}>{customerReminderSaveError}</Text>
              ) : null}

              <Text style={styles.reminderHint}>
                Template usato: promemoria cliente standard del salone. Se imposti Off, il memo
                push non viene inviato.
              </Text>
            </View>

            {Platform.OS !== 'web' ? <NativeCustomerUtilityCard
              icon="megaphone-outline"
              title="Comunicazioni push"
              description="Promuovi offerte e prodotti dello shop, invia avvisi a tutti i clienti oppure scegli i singoli contatti."
              action="Crea"
              accessibilityLabel="Crea comunicazione push clienti"
              onPress={() => setShowCommunicationsModal(true)}
            /> : (
            <View
              style={[
                styles.communicationCard,
                isDesktopWebLayout && styles.communicationCardDesktop,
              ]}
            >
              <View
                style={[
                  styles.communicationLead,
                  isDesktopWebLayout && styles.communicationLeadDesktop,
                ]}
              >
                <View style={styles.communicationIcon}>
                  <Ionicons name="megaphone-outline" size={22} color={customerPalette.ink} />
                </View>
              </View>
              <View
                style={[
                  styles.communicationContent,
                  isDesktopWebLayout && styles.communicationContentDesktop,
                ]}
              >
                <Text
                  numberOfLines={undefined}
                  adjustsFontSizeToFit={isDesktopWebLayout}
                  minimumFontScale={0.86}
                  style={[
                    styles.communicationTitle,
                    isDesktopWebLayout && styles.communicationTextDesktop,
                  ]}
                >
                  Comunicazioni push
                </Text>
                <Text
                  numberOfLines={undefined}
                  adjustsFontSizeToFit={isDesktopWebLayout}
                  minimumFontScale={0.82}
                  style={[
                    styles.communicationDescription,
                    isDesktopWebLayout && styles.communicationTextDesktop,
                  ]}
                >
                  Promuovi offerte e prodotti dello shop, invia avvisi a tutti i clienti oppure scegli i singoli
                  contatti.
                </Text>
              </View>
              <View
                style={[
                  styles.communicationActionRail,
                  isDesktopWebLayout && styles.communicationActionRailDesktop,
                ]}
              >
                <HapticTouchable
                  style={styles.communicationButton}
                  onPress={() => setShowCommunicationsModal(true)}
                  pressScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Crea comunicazione push clienti"
                >
                  <Text style={styles.communicationButtonText}>Crea</Text>
                  <Ionicons name="arrow-forward" size={16} color={customerPalette.ink} />
                </HapticTouchable>
              </View>
            </View>
            )}

            <CustomerWelcomeSettingsCard
              workspace={salonWorkspace}
              ready={isCustomerReminderReady}
              wideWebLayout={isDesktopWebLayout}
              onSave={updateSalonWorkspacePersisted}
            />
  </>);

  return (
    <NativePremiumScope.Provider value={true}><CustomerPremiumScope.Provider value={true}>
    {Platform.OS !== 'web' && clientiIsFocused ? <StatusBar barStyle={customerPalette.night?'light-content':'dark-content'}/> : null}
    <View
      style={styles.container}
      onLayout={trackClientiLayoutPerf}
      onTouchEnd={handleClientiScreenTouchEnd}
      onTouchCancel={handleClientiScreenTouchEnd}
    >
      {Platform.OS !== 'web' ? customerConfirmationModal : null}
      <FlatList
        {...(Platform.OS==='web'?({dataSet:{premiumPageScroll:"true"}} as any):{})}
        ref={listRef}
        bounces
        alwaysBounceVertical
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        data={ownerStartupLoading ? [] : clientiUnifiedList}
        keyExtractor={clientiUnifiedListKeyExtractor}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: responsive.horizontalPadding },
          Platform.OS!=='web'&&{paddingTop:Math.max(nativeScreenInsets.top,12),paddingBottom:nativeScreenInsets.bottom+76},
          Platform.OS==='web'?{paddingBottom:responsive.width<1000?80:24,paddingTop:24,paddingHorizontal:24}:null,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={
          !paymentPolicyClient &&
          !packageClient && !benefitsConsoleOpen &&
          !swipeConfirmation &&
          !showEditCustomerModal &&
          !limitConfigClient &&
          !(limitTargetClient && limitTargetMode) &&
          !customerFeedbackDialog.visible
        }
        onScrollBeginDrag={handleClientiListScrollBeginDrag}
        onScroll={trackClientiScrollPerf}
        onMomentumScrollEnd={trackClientiScrollPerf}
        onScrollEndDrag={trackClientiScrollPerf}
        onContentSizeChange={trackClientiLayoutPerf}
        scrollEventThrottle={32}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={80}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View
            style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}
            onTouchStart={handleClientiHeaderTouchStart}
          >
            <View style={[styles.heroCard,Platform.OS!=='web'&&{paddingBottom:0,marginBottom:3}]} >
              <View style={{gap:Platform.OS==='web'?14:12,marginBottom:16,...(Platform.OS!=='web'?{marginTop:-9}:{})}}>
                  <View style={{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',...(Platform.OS === 'web' || responsive.sidebar ? {display:'none' as const}: {})}}>
                    <OwnerBrandMark compact />
                    <HapticTouchable accessibilityRole="button" accessibilityLabel={customerPalette.night?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggleCustomerTheme} style={{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:customerPalette.border,backgroundColor:customerPalette.field}}>
                      <Ionicons name={customerPalette.night?'sunny-outline':'moon-outline'} size={19} color={customerPalette.ink}/>
                    </HapticTouchable>
                  </View>
                  <View style={{gap:7}}>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
                      {Platform.OS==='web'?<OwnerWebPageTitle>Clienti</OwnerWebPageTitle>:<Text accessibilityRole="header" style={{fontFamily:'Georgia',fontSize:27,lineHeight:34,letterSpacing:-.6,color:customerPalette.ink}}>Clienti</Text>}
                      <HapticTouchable onPress={toggleNewCustomerExpanded} onTouchStart={markHeaderExpandTouchStart} immediatePress accessibilityRole="button" accessibilityLabel="Nuovo cliente" style={{flexDirection:'row',alignItems:'center',gap:6,minHeight:42,paddingHorizontal:12,borderRadius:13,backgroundColor:customerPalette.action}}>
                        <Ionicons name="add" size={18} color={customerPalette.actionText}/><Text style={{fontSize:12,fontWeight:'600',color:customerPalette.actionText}}>Nuovo cliente</Text>
                      </HapticTouchable>
                    </View>
                    <Text style={{fontSize:13,lineHeight:19,color:customerPalette.muted}}>Le persone, il loro percorso in salone.</Text>
                  </View>
                </View>

              <CustomerDirectorySummary total={clienti.length} cancelled={cancellationAlertsCount} loading={ownerStartupLoading} />

            </View>

            <View
              {...getWebExpandableCardProps(toggleNewCustomerExpanded, {
                expanded: showNewCustomerExpanded,
              })}
              style={[
                styles.bookingCard,
                isDesktopWebLayout && styles.bookingCardDesktop,
                Platform.OS === 'web' && styles.customerTopCardWeb,
                getWebExpandableCardStyle(showNewCustomerExpanded),
              ]}
            >
              

              <CustomerCreatorForm
                ref={customerCreatorFormRef}
                onClose={closeNewCustomerPanel}
                nativeOverlays={<>{renderCreateBirthdayPicker()}{renderCustomerFeedback()}</>}
                visible={showNewCustomerExpanded}
                saving={saving}
                loadingInit={loadingInit}
                isDesktopWebLayout={isDesktopWebLayout}
                nameFieldScrollTopOffset={nameFieldScrollTopOffset}
                nameInputRef={nameInputRef}
                surnameInputRef={surnameInputRef}
                phoneInputRef={phoneInputRef}
                emailInputRef={emailInputRef}
                instagramInputRef={instagramInputRef}
                noteInputRef={noteInputRef}
                focusField={focusField}
                scrollToField={scrollToField}
                onBirthdayPress={setCreateBirthdayPickerValue}
                onSubmit={salvaCliente}
              />
            </View>

            

          </View>
        }
        ListEmptyComponent={
          ownerStartupLoading ? (
            <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
              {Platform.OS !== 'web' ? <NativeCustomersSkeleton /> : <OwnerStartupSkeletonPulse style={styles.ownerStartupClientList}>
                {[0, 1, 2].map((index) => (
                  <SkeletonSurface key={`startup-client-card-${index}`} style={styles.ownerStartupClientCard}>
                    <OwnerStartupSkeletonItem style={styles.ownerStartupClientAvatar} />
                    <View style={styles.ownerStartupClientCopy}>
                      <OwnerStartupSkeletonItem style={styles.ownerStartupClientName} />
                      <OwnerStartupSkeletonItem style={styles.ownerStartupClientMeta} />
                    </View>
                  </SkeletonSurface>
                ))}
              </OwnerStartupSkeletonPulse>}
            </View>
          ) : null
        }
        renderItem={renderClientiUnifiedListItem}
        ListFooterComponent={<View style={[styles.pageShell,{maxWidth:responsive.contentMaxWidth}]}><><View style={Platform.OS==='web'&&responsive.width>=1100?{flexDirection:'row',alignItems:'stretch',gap:14,marginBottom:18}:undefined}>{Platform.OS==='web'?<View style={responsive.width>=1100?{flex:1,minWidth:0}:undefined}><CustomerPremiumSettings compact={responsive.width>=1100} model={customerPremium}/></View>:null}<View style={Platform.OS==='web'&&responsive.width>=1100?{flex:1,minWidth:0}:undefined}><BenefitsEntryCard compactWeb={Platform.OS==='web'&&responsive.width>=1100} onPress={(section="settings") => {setBenefitsInitialSection(section);setBenefitsConsoleOpen(true);}} /></View></View>{customerCommunicationsSection}</></View>}
      />

      {benefitsConsoleOpen ? <BenefitsConsole initialSection={benefitsInitialSection} workspaceId={salonWorkspace.id} customers={clienti} onShow={resetClientSwipeAfterPopupShown} onClose={() => {setBenefitsConsoleOpen(false);releaseClientCardInteraction();}} /> : null}
      {packageClient ? <CustomerPackagesEditor onShow={resetClientSwipeAfterPopupShown} key={packageClient.id} workspaceId={salonWorkspace.id} customerId={packageClient.id} customerName={packageClient.full_name} onClose={() => { setPackageClient(null); releaseClientCardInteraction(); }} /> : null}
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={!!paymentPolicyClient} transparent animationType="fade"
        onShow={resetClientSwipeAfterPopupShown} onDismiss={releaseClientCardInteraction}
        onRequestClose={() => setPaymentPolicyClient(null)}>
        <CustomerSheetFrame onClose={() => setPaymentPolicyClient(null)}>
          <View style={[styles.onlinePolicySheet, customerSheetDockStyle]}>
            <NativeSheetHandle style={styles.dialogHandle} />
            <CustomerPopupHeader title="Pagamento" subtitle={paymentPolicyClient?.full_name} icon="wallet-outline" onClose={() => setPaymentPolicyClient(null)} />
            <ScrollView ref={paymentPolicyScrollRef} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
              {paymentPolicyClient ? <BookingPaymentPolicyEditor standalone key={`${salonWorkspace.id}-${paymentPolicyClient.id}`} workspaceId={salonWorkspace.id} customerId={paymentPolicyClient.id} /> : null}
            </ScrollView>
          </View>
        </CustomerSheetFrame>
      </Modal>

      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={!!clientDetailsId} transparent animationType="fade" onDismiss={finishClientDetailsDismiss} onRequestClose={closeClientDetails}>
        <CustomerSheetFrame onClose={closeClientDetails}>
          <View style={[customerSheetDockStyle,{width:'100%',maxWidth:600,backgroundColor:customerPalette.night?'#202425':'#F5F1EB',borderRadius:24,borderWidth:1,borderColor:customerPalette.border,overflow:'hidden'}]}>
            <CustomerPopupHeader title="Scheda cliente" icon="person-outline" onClose={closeClientDetails}/>
            <ScrollView contentContainerStyle={{padding:20}}>{(()=>{const customer=clienti.find(c=>c.id===clientDetailsId);return customer?renderClienteCard(customer,true,closeClientDetails,'detail'):null;})()}</ScrollView>
          </View>
        </CustomerSheetFrame>
      </Modal>

      <CustomerCommunicationsModal
        visible={showCommunicationsModal}
        clients={effectiveLocalClienti.map((item) => ({
          id: item.id,
          name: item.nome,
          email: item.email,
          phone: item.telefono,
        }))}
        onClose={() => {
          setShowCommunicationsModal(false);
          releaseClientCardInteraction();
        }}
      />

      {Platform.OS === 'web' || !nativeCustomerPanelOpenRef.current ? renderCreateBirthdayPicker() : null}



      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={!!durationConfigClient && !durationPickerTarget && !pricePickerServiceId}
        onShow={resetClientSwipeAfterPopupShown}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={chiudiTempiPersonalizzatiCliente}
        onDismiss={releaseClientCardInteraction}
      >
        <CustomerSheetFrame onClose={chiudiTempiPersonalizzatiCliente}>
          <View
            style={[
              styles.customerTimingModalCard,
              customerSheetDockStyle,
              {
                height:
                  Platform.OS === 'web'
                    ? Math.min(760, Math.max(360, windowHeight - 64))
                    : undefined,
                ...(Platform.OS !== 'web' ? { flex: 1, minHeight: 0 } : {}),
              },
            ]}
          >
            <NativeSheetHandle style={styles.dialogHandle} />
            <CustomerPopupHeader title="Tempi e prezzi" subtitle={durationConfigClient?.full_name} icon="time-outline" onClose={chiudiTempiPersonalizzatiCliente} />

            <View style={styles.customerTimingNotice}>
              <View style={styles.customerTimingNoticeIcon}>
                <Ionicons name="shield-checkmark-outline" size={17} color={customerPalette.muted} />
              </View>
              <View style={styles.customerTimingNoticeCopy}>
                <Text style={styles.customerTimingNoticeText}>
                  Solo per i nuovi appuntamenti, in Agenda e online. Gli esistenti non cambiano.
                </Text>
              </View>
            </View>

            <CustomerServiceSearch key={salonWorkspace.id} groups={durationServiceGroups}
              stateStore={customerServiceSearchStateRef} persistenceKey={salonWorkspace.id}>
              {(filteredGroups, timingScrollRef) => (
            <ScrollView
              ref={timingScrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "web" ? "on-drag" : "none"}
              style={styles.customerTimingScroll}
              contentContainerStyle={styles.customerTimingScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredGroups.map((group) => (
                <View key={`customer-time-role-${group.key}`} style={styles.customerTimingRoleGroup}>
                  <View style={styles.customerTimingRoleHeader}>
                    <View style={styles.customerTimingRoleIcon}>
                      <Ionicons name="briefcase-outline" size={14} color={customerPalette.muted} />
                    </View>
                    <Text style={styles.customerTimingRoleTitle}>{group.label}</Text>
                    <View style={styles.customerTimingRoleCountBadge}>
                      <Text style={styles.customerTimingRoleCountText}>
                        {group.services.length}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.customerTimingRoleServices}>
              {group.services.map((service) => {
                const phaseConfig = normalizeServicePhaseConfig(service.phaseConfig);
                const override = getCustomerServiceDurationOverride(
                  durationConfigClient?.serviceDurationOverrides,
                  service.id
                );
                const resolved = resolveCustomerServiceTiming({
                  serviceId: service.id,
                  defaultDurationMinutes: service.durataMinuti ?? 60,
                  defaultPhaseConfig: phaseConfig,
                  overrides: durationConfigClient?.serviceDurationOverrides,
                });
                const resolvedPhase = resolved.phaseConfig;
                const priceOverride = getCustomerServicePriceOverride(
                  durationConfigClient?.servicePriceOverrides,
                  service.id
                );
                const resolvedPrice = resolveCustomerServicePrice({
                  serviceId: service.id,
                  defaultPrice: service.prezzo ?? 0,
                  overrides: durationConfigClient?.servicePriceOverrides,
                });
                const savingService =
                  durationOverrideSavingServiceId === service.id ||
                  priceOverrideSavingServiceId === service.id;
                const customizedService = Boolean(override || priceOverride);

                return (
                  <View key={`customer-time-${service.id}`} style={styles.customerTimingServiceCard}>
                    <View style={styles.customerTimingServiceHeader}>
                      <View style={styles.customerTimingServiceCopy}>
                        <Text style={styles.customerTimingServiceName}>{service.nome}</Text>
                        {service.soloComposizione === true ? (
                          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F3EEFF', borderWidth: 1, borderColor: '#E0D4FA', maxWidth: '100%' }}>
                            <Ionicons name="layers-outline" size={13} color={customerPalette.muted} />
                            <Text style={{ flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '700', color: '#6D28D9' }}>Componente · solo composizione</Text>
                          </View>
                        ) : null}
                        <View style={styles.customerTimingServiceDefaultRow}>
                          <View style={styles.customerTimingServiceDefaultChip}>
                            <Ionicons name="time-outline" size={12} color={styles.__premiumIcon.color} />
                            <Text style={styles.customerTimingServiceDefault}>
                              Listino · {service.durataMinuti ?? 60} min
                            </Text>
                          </View>
                          <View style={styles.customerTimingServiceDefaultChip}>
                            <Ionicons name="pricetag-outline" size={12} color={styles.__premiumIcon.color} />
                            <Text style={styles.customerTimingServiceDefault}>
                              € {(service.prezzo ?? 0).toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.customerTimingStandardBadge,
                          customizedService && styles.customerTimingCustomizedBadge,
                        ]}
                      >
                        <View
                          style={[
                            styles.customerTimingStatusDot,
                            customizedService && styles.customerTimingStatusDotCustomized,
                          ]}
                        />
                        <Text
                          style={[
                            styles.customerTimingStandardText,
                            customizedService && styles.customerTimingCustomizedText,
                          ]}
                        >
                          {customizedService ? 'Modificato' : 'Standard'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.customerTimingControlsLayout,
                        responsive.width < 350 &&
                          styles.customerTimingControlsLayoutCompact,
                        phaseConfig && resolvedPhase && styles.customerTimingControlsLayoutPhased,
                      ]}
                    >
                    {phaseConfig && resolvedPhase ? (
                      <View style={styles.customerTimingPhasePanel}>
                        <View style={styles.customerTimingControlHeadingRow}>
                          <View style={styles.customerTimingControlHeadingCopy}>
                            <View style={styles.customerTimingControlMiniIcon}>
                              <Ionicons name="hourglass-outline" size={13} color={customerPalette.muted} />
                            </View>
                            <Text style={styles.customerTimingControlHeading}>Durata per fase</Text>
                          </View>
                          {override ? (
                            <HapticTouchable
                              style={styles.customerTimingInlineReset}
                              immediatePress
                              disabled={savingService}
                              onPress={() => void persistCustomerServiceTiming(service.id, null)}
                              hapticType="error"
                              accessibilityLabel={`Ripristina i tempi di ${service.nome}`}
                            >
                              <Ionicons name="refresh-outline" size={14} color={customerPalette.muted} />
                              <Text style={styles.customerTimingInlineResetText}>Ripristina</Text>
                            </HapticTouchable>
                          ) : null}
                        </View>
                        <View style={styles.customerTimingPhasesRow}>
                          {(
                            [
                              ['initial', 'Lavoro', resolvedPhase.initialDurationMinutes],
                              ['processing', 'Posa', resolvedPhase.processingDurationMinutes],
                              ...(resolvedPhase.finalPhaseEnabled === false
                                ? []
                                : [['final', 'Finale', resolvedPhase.finalDurationMinutes]]),
                            ] as [
                              'initial' | 'processing' | 'final',
                              string,
                              number,
                            ][]
                          ).map(([field, label, minutes]) => (
                            <HapticTouchable
                              key={`${service.id}-${field}`}
                              style={styles.customerTimingPhaseButton}
                              immediatePress
                              disabled={savingService}
                              onPress={() =>
                                setDurationPickerTarget({ serviceId: service.id, field })
                              }
                              hapticType="light"
                            >
                              <Text style={styles.customerTimingPhaseLabel}>{label}</Text>
                              <Text style={styles.customerTimingPhaseValue}>{minutes} min</Text>
                            </HapticTouchable>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.customerTimingControlCard,
                          styles.customerTimingDurationControl,
                          override && styles.customerTimingControlCardCustomDuration,
                        ]}
                      >
                        <HapticTouchable
                          style={styles.customerTimingControlTap}
                          immediatePress
                          disabled={savingService}
                          onPress={() =>
                            setDurationPickerTarget({ serviceId: service.id, field: 'duration' })
                          }
                          accessibilityRole="button" accessibilityLabel={`Modifica durata di ${service.nome}`}
                          hapticType="light"
                        >
                          <View style={styles.customerTimingControlMiniIcon}>
                            <Ionicons name="time-outline" size={14} color={customerPalette.muted} />
                          </View>
                          <View style={styles.customerTimingControlCopy}>
                            <Text style={styles.customerTimingControlLabel}>Durata</Text>
                            <Text style={styles.customerTimingControlValue}>
                              {durationOverrideSavingServiceId === service.id
                                ? 'Salvo…'
                                : `${resolved.durationMinutes} min`}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={15} color={styles.__premiumIcon.color} />
                        </HapticTouchable>
                        {override ? (
                          <HapticTouchable
                            style={styles.customerTimingControlReset}
                            immediatePress
                            disabled={savingService}
                            onPress={() => void persistCustomerServiceTiming(service.id, null)}
                            hapticType="error"
                            accessibilityLabel={`Ripristina la durata di ${service.nome}`}
                          >
                            <Ionicons name="refresh-outline" size={14} color={customerPalette.muted} />
                          </HapticTouchable>
                        ) : null}
                      </View>
                    )}

                    <View
                      style={[
                        styles.customerTimingControlCard,
                        styles.customerTimingPriceControl,
                        priceOverride && styles.customerTimingControlCardCustomPrice,
                      ]}
                    >
                      <HapticTouchable
                        style={styles.customerTimingControlTap}
                        immediatePress
                        disabled={savingService}
                        onPress={() => setPricePickerServiceId(service.id)}
                        accessibilityRole="button" accessibilityLabel={`Modifica prezzo di ${service.nome}`}
                        hapticType="light"
                      >
                        <View style={styles.customerTimingControlMiniIconPrice}>
                          <Ionicons name="pricetag-outline" size={14} color={customerPalette.muted} />
                        </View>
                        <View style={styles.customerTimingControlCopy}>
                          <Text style={styles.customerTimingControlLabel}>Prezzo cliente</Text>
                          <Text style={styles.customerTimingControlValuePrice}>
                            {priceOverrideSavingServiceId === service.id
                              ? 'Salvo…'
                              : `€ ${resolvedPrice.price.toFixed(2)}`}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color={styles.__premiumIcon.color} />
                      </HapticTouchable>
                      {priceOverride ? (
                        <HapticTouchable
                          style={styles.customerTimingControlReset}
                          immediatePress
                          disabled={savingService}
                          onPress={() => void persistCustomerServicePrice(service.id, null)}
                          hapticType="error"
                          accessibilityLabel={`Ripristina prezzo di ${service.nome}`}
                        >
                          <Ionicons name="refresh-outline" size={14} color={customerPalette.muted} />
                        </HapticTouchable>
                      ) : null}
                    </View>
                    </View>
                  </View>
                );
              })}
                  </View>
                </View>
              ))}
            </ScrollView>

              )}
            </CustomerServiceSearch>
            <View style={styles.customerTimingFooter}>
              <View style={styles.customerTimingAutosaveNote}>
                <Ionicons name="cloud-done-outline" size={14} color={styles.__premiumIcon.color} />
                <Text style={styles.customerTimingAutosaveText}>Salvataggio automatico</Text>
              </View>
              <HapticTouchable
                style={styles.customerTimingDoneButton}
                onPress={chiudiTempiPersonalizzatiCliente}
                hapticType="medium"
                accessibilityRole="button"
                accessibilityLabel="Chiudi tempi e prezzi personalizzati"
              >
                <Ionicons name="checkmark" size={18} color={customerPalette.muted} />
                <Text style={styles.customerTimingDoneText}>Fatto</Text>
              </HapticTouchable>
            </View>
          </View>
        </CustomerSheetFrame>
      </Modal>

      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={!!onlinePolicyClient && !limitTargetMode}
        onShow={resetClientSwipeAfterPopupShown}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeCustomerOnlinePolicy}
        onDismiss={releaseClientCardInteraction}
      >
        <CustomerSheetFrame onClose={closeCustomerOnlinePolicy} dismissDisabled={onlinePolicySaving}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCustomerOnlinePolicy}
            disabled={onlinePolicySaving}
          />
          <View style={[styles.onlinePolicySheet, customerSheetDockStyle]}>
            <NativeSheetHandle style={styles.dialogHandle} />
            <CustomerPopupHeader title="Regole di prenotazione" subtitle={onlinePolicyClient?.full_name} icon="options-outline" onClose={closeCustomerOnlinePolicy} disabled={onlinePolicySaving} />

            <View style={styles.customerRulesTabs}>
              {([{ key: 'limits', label: 'Limiti' }, { key: 'online', label: 'Servizi e approvazione' }] as const).map(section => (
                <HapticTouchable key={section.key} accessibilityRole="tab"
                  accessibilityState={{ selected: customerRulesSection === section.key }}
                  disabled={onlinePolicySaving}
                  onPress={() => { Keyboard.dismiss(); setCustomerRulesSection(section.key); onlinePolicyScrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  style={[styles.customerRulesTab, customerRulesSection === section.key && styles.customerRulesTabSelected]}>
                  <Text style={[styles.customerRulesTabText, customerRulesSection === section.key && styles.customerRulesTabTextSelected]}>{section.label}</Text>
                </HapticTouchable>
              ))}
            </View>
            <ScrollView
              ref={onlinePolicyScrollRef}
              style={styles.onlinePolicyScroll}
              contentContainerStyle={styles.onlinePolicyScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {customerRulesSection === 'limits' ? <>
                <View style={styles.rulesGroup}>
                  <PremiumSectionHeading style={styles.rulesGroupTitle}>Prenotazioni future</PremiumSectionHeading>
                  <Text style={styles.rulesHint}>Scegli un limite complessivo oppure mensile.</Text>
                  {([
                    { key: 'none', label: 'Senza limite', icon: 'infinite-outline' },
                    { key: 'total_future', label: 'Totale future', icon: 'calendar-outline' },
                    { key: 'monthly', label: 'Ogni mese', icon: 'calendar-number-outline' },
                  ] as const).map(option => {
                    const selected = option.key === 'none' ? limitConfigClient?.maxFutureAppointments == null : limitConfigClient?.maxFutureAppointments != null && limitConfigClient.maxFutureAppointmentsMode === option.key;
                    return <HapticTouchable key={option.key} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                      style={[styles.rulesRow, selected && styles.rulesRowSelected]}
                      onPress={() => {
                        if (!limitConfigClient) return;
                        if (option.key === 'none') void persistClienteBookingLimits(limitConfigClient, { maxFutureAppointments: null, maxFutureAppointmentsMode: null });
                        else apriSelettoreLimiteAppuntamenti(limitConfigClient, option.key);
                      }}>
                      <Ionicons name={option.icon} size={20} color={selected ? '#20394F' : '#718096'} />
                      <Text style={styles.rulesRowLabel}>{option.label}</Text>
                      {selected && option.key !== 'none' ? <Text style={styles.rulesValue}>{limitConfigClient?.maxFutureAppointments}</Text> : null}
                      <CustomerSelectionIndicator selected={selected} />
                    </HapticTouchable>;
                  })}
                </View>
                <View style={styles.rulesGroup}>
                  <PremiumSectionHeading style={styles.rulesGroupTitle}>Prenotazioni giornaliere</PremiumSectionHeading>
                  <Text style={styles.rulesHint}>Limite aggiuntivo per lo stesso giorno e mestiere/servizio.</Text>
                  {(['none', 'daily'] as const).map(mode => {
                    const selected = mode === 'none' ? limitConfigClient?.maxDailyAppointments == null : limitConfigClient?.maxDailyAppointments != null;
                    return <HapticTouchable key={mode} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                      style={[styles.rulesRow, selected && styles.rulesRowSelected]}
                      onPress={() => {
                        if (!limitConfigClient) return;
                        if (mode === 'none') void persistClienteBookingLimits(limitConfigClient, { maxDailyAppointments: null });
                        else apriSelettoreLimiteAppuntamenti(limitConfigClient, 'daily');
                      }}>
                      <Ionicons name={mode === 'none' ? 'infinite-outline' : 'today-outline'} size={20} color={styles.__premiumIcon.color} />
                      <Text style={styles.rulesRowLabel}>{mode === 'none' ? 'Senza limite' : 'Ogni giorno'}</Text>
                      {selected && mode === 'daily' ? <Text style={styles.rulesValue}>{limitConfigClient?.maxDailyAppointments}</Text> : null}
                      <CustomerSelectionIndicator selected={selected} />
                    </HapticTouchable>;
                  })}
                </View>
                <Text style={styles.rulesFootnote}>I limiti si salvano alla selezione o alla conferma del numero.</Text>
              </> : <>
              <View style={styles.onlinePolicySection}>
                <View style={styles.onlinePolicySectionHeading}>
                  <View style={styles.onlinePolicySectionIcon}>
                    <Ionicons name="flash-outline" size={18} color={styles.__premiumIcon.color} />
                  </View>
                  <View style={styles.onlinePolicySectionHeadingCopy}>
                    <PremiumSectionHeading style={styles.onlinePolicySectionTitle}>Accettazione richieste</PremiumSectionHeading>
                    <Text style={styles.onlinePolicySectionHint}>
                      L&apos;eccezione del cliente prevale sulla regola generale del salone.
                    </Text>
                  </View>
                </View>

                <View style={styles.onlinePolicyModeList}>
                  {(
                    [
                      {
                        value: 'inherit' as const,
                        title: 'Segue il salone',
                        description:
                          salonWorkspace.autoAcceptBookingRequests === true
                            ? 'Attualmente: accettazione automatica'
                            : 'Attualmente: approvazione del salone',
                        icon: 'git-branch-outline' as const,
                      },
                      {
                        value: 'auto' as const,
                        title: 'Sempre automatica',
                        description: 'Le richieste ordinarie vengono accettate automaticamente.',
                        icon: 'checkmark-circle-outline' as const,
                      },
                      {
                        value: 'manual' as const,
                        title: 'Sempre con approvazione',
                        description: 'Il salone deve approvare ogni richiesta.',
                        icon: 'hand-left-outline' as const,
                      },
                    ]
                  ).map((option) => {
                    const selected = onlinePolicyMode === option.value;
                    return (
                      <HapticTouchable
                        key={option.value}
                        style={[
                          styles.onlinePolicyModeOption,
                          selected && styles.onlinePolicyModeOptionSelected,
                        ]}
                        onPress={() => setOnlinePolicyMode(option.value)}
                        pressScale={0.988}
                        pressOpacity={0.98}
                      >
                        <View
                          style={[
                            styles.onlinePolicyModeIcon,
                            selected && styles.onlinePolicyModeIconSelected,
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={19}
                            color={customerPalette.ink}
                          />
                        </View>
                        <View style={styles.onlinePolicyModeCopy}>
                          <Text
                            style={[
                              styles.onlinePolicyModeTitle,
                              selected && styles.onlinePolicyModeTitleSelected,
                            ]}
                          >
                            {option.title}
                          </Text>
                          <Text
                            style={[
                              styles.onlinePolicyModeDescription,
                              selected && styles.onlinePolicyModeDescriptionSelected,
                            ]}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <CustomerSelectionIndicator selected={selected} />
                      </HapticTouchable>
                    );
                  })}
                </View>

                <View style={styles.onlinePolicyCompositionNote}>
                  <Ionicons name="layers-outline" size={18} color={styles.__premiumIcon.color} />
                  <Text style={styles.onlinePolicyCompositionNoteText}>
                    Composizioni e servizi collegati restano sempre soggetti all&apos;OK del salone.
                  </Text>
                </View>
              </View>

              <View style={styles.onlinePolicySection}>
                <View style={styles.onlinePolicySectionHeading}>
                  <View style={styles.onlinePolicySectionIcon}>
                    <Ionicons name="repeat-outline" size={18} color={styles.__premiumIcon.color} />
                  </View>
                  <View style={styles.onlinePolicySectionHeadingCopy}>
                    <PremiumSectionHeading tone={1} style={styles.onlinePolicySectionTitle}>
                      Prenotazioni per familiari o amici
                    </PremiumSectionHeading>
                    <Text style={styles.onlinePolicySectionHint}>
                      Regola personale valida anche tra servizi, mestieri e rami diversi.
                    </Text>
                  </View>
                </View>

                <HapticTouchable
                  style={[
                    styles.onlinePolicyRepeatRule,
                    onlinePolicyAllowSameDaySameService &&
                      styles.onlinePolicyRepeatRuleActive,
                  ]}
                  onPress={() =>
                    setOnlinePolicyAllowSameDaySameService((current) => !current)
                  }
                  pressScale={0.992}
                  pressOpacity={0.98}
                >
                  <View style={styles.onlinePolicyRepeatRuleCopy}>
                    <Text style={styles.onlinePolicyRepeatRuleTitle}>
                      Consenti una seconda prenotazione
                    </Text>
                    <Text style={styles.onlinePolicyRepeatRuleDescription}>
                      {onlinePolicyAllowSameDaySameService
                        ? 'Consente una seconda prenotazione nella stessa giornata, ma gli orari sovrapposti restano sempre bloccati.'
                        : 'Le prenotazioni sovrapposte o ripetute a suo nome vengono bloccate.'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.onlinePolicyToggle,
                      onlinePolicyAllowSameDaySameService &&
                        styles.onlinePolicyToggleAllowed,
                    ]}
                  >
                    <View
                      style={[
                        styles.onlinePolicyToggleThumb,
                        onlinePolicyAllowSameDaySameService &&
                          styles.onlinePolicyToggleThumbAllowed,
                      ]}
                    />
                  </View>
                </HapticTouchable>

                <View style={styles.onlinePolicyCompositionNote}>
                  <Ionicons name="information-circle-outline" size={18} color={customerPalette.muted} />
                  <Text style={styles.onlinePolicyCompositionNoteText}>
                    Combo e servizi collegati non generano questo avviso. Il limite giornaliero
                    personale e le sovrapposizioni orarie restano comunque attivi.
                  </Text>
                </View>
              </View>

              <View style={styles.onlinePolicySection}>
                <View style={styles.onlinePolicyServiceHeader}>
                  <View style={styles.onlinePolicySectionHeadingCopy}>
                    <PremiumSectionHeading tone={2} style={styles.onlinePolicySectionTitle}>Servizi prenotabili</PremiumSectionHeading>
                    <Text style={styles.onlinePolicySectionHint}>
                      Per impostazione iniziale il cliente può prenotare tutti i servizi online.
                    </Text>
                  </View>
                  <View style={styles.onlinePolicyBlockedCount}>
                    <Text style={styles.onlinePolicyBlockedCountValue}>
                      {onlinePolicyBlockedServiceCount}
                    </Text>
                    <Text style={styles.onlinePolicyBlockedCountLabel}>esclusi</Text>
                  </View>
                </View>

                <View style={styles.onlinePolicyServiceRuleNote}>
                  <Ionicons name="link-outline" size={17} color={styles.__premiumIcon.color} />
                  <Text style={styles.onlinePolicyServiceRuleNoteText}>
                    Se escludi un servizio, vengono escluse anche le composizioni e le scelte
                    collegate che lo richiedono. I nuovi servizi restano consentiti di default.
                  </Text>
                </View>

                <View style={styles.onlinePolicyBulkActions}>
                  <HapticTouchable
                    style={styles.onlinePolicyBulkAllow}
                    onPress={() => setOnlinePolicyOverrides({})}
                  >
                    <Ionicons name="checkmark-done-outline" size={17} color={customerPalette.muted} />
                    <Text style={styles.onlinePolicyBulkAllowText}>Consenti tutti</Text>
                  </HapticTouchable>
                  <HapticTouchable
                    style={styles.onlinePolicyBulkBlock}
                    onPress={() =>
                      setOnlinePolicyOverrides(
                        Object.fromEntries(
                          onlinePolicyServices.map((service) => [service.policyKey, false])
                        )
                      )
                    }
                  >
                    <Ionicons name="remove-circle-outline" size={17} color={customerPalette.muted} />
                    <Text style={styles.onlinePolicyBulkBlockText}>Escludi tutti</Text>
                  </HapticTouchable>
                </View>

                {onlinePolicyClient ? (
                  <CustomerOnlinePolicyServiceSearch
                    key={onlinePolicyClient.id}
                    services={onlinePolicyServices}
                    overrides={onlinePolicyOverrides}
                    setOverrides={setOnlinePolicyOverrides}
                  />
                ) : null}
              </View>
              </>}
            </ScrollView>

            <View style={styles.onlinePolicyFooter}>
              {onlinePolicyError ? (
                <View style={styles.onlinePolicyError}>
                  <Ionicons name="alert-circle-outline" size={18} color={customerPalette.muted} />
                  <Text style={styles.onlinePolicyErrorText}>{onlinePolicyError}</Text>
                </View>
              ) : null}
              <View style={styles.onlinePolicyFooterActions}>
                <HapticTouchable
                  style={styles.onlinePolicyCancel}
                  onPress={closeCustomerOnlinePolicy}
                  disabled={onlinePolicySaving}
                >
                  <Text style={styles.onlinePolicyCancelText}>Chiudi</Text>
                </HapticTouchable>
                {customerRulesSection === 'online' ? (
                <HapticTouchable
                  style={[
                    styles.onlinePolicySave,
                    onlinePolicySaving && styles.onlinePolicySaveDisabled,
                  ]}
                  onPress={() => void persistCustomerOnlinePolicy()}
                  disabled={onlinePolicySaving}
                  hapticType="medium"
                >
                  <Ionicons
                    name={onlinePolicySaving ? 'hourglass-outline' : 'shield-checkmark-outline'}
                    size={19}
                    color={customerPalette.muted}
                  />
                  <Text style={styles.onlinePolicySaveText}>
                    {onlinePolicySaving ? 'Salvataggio…' : 'Salva servizi e approvazione'}
                  </Text>
                </HapticTouchable>
                ) : null}
              </View>
            </View>
          </View>
        </CustomerSheetFrame>
      </Modal>

      <NumberPickerModal premiumNative
        bottomAnchored
        visible={!!durationConfigClient && !!durationPickerTarget}
        lazyContent
        title={`${durationPickerService?.nome ?? 'Servizio'} · ${
          durationPickerTarget?.field === 'initial'
            ? 'Lavoro'
            : durationPickerTarget?.field === 'processing'
              ? 'Posa'
              : durationPickerTarget?.field === 'final'
                ? 'Finale'
                : 'Durata'
        }`}
        contextLabel={durationConfigClient?.full_name}
        initialValue={durationPickerInitialValue}
        min={5}
        max={480}
        step={5}
        gridStep={5}
        suffix=" min"
        presets={[15, 20, 30, 45, 60, 90, 120]}
        initialMode="wheel"
        onClose={() => setDurationPickerTarget(null)}
        onConfirm={(value) => void confirmCustomerServiceDuration(value)}
        onDismiss={releaseClientCardInteraction}
        confirmLabel="Salva tempo"
      />

      <NumberPickerModal premiumNative
        bottomAnchored
        visible={!!durationConfigClient && !!pricePickerServiceId}
        lazyContent
        title={`${pricePickerService?.nome ?? 'Servizio'} · Prezzo cliente`}
        contextLabel={durationConfigClient?.full_name}
        initialValue={pricePickerInitialValue}
        min={0}
        max={9999}
        step={1}
        gridStep={1}
        decimals={2}
        prefix="€ "
        presets={[10, 15, 20, 25, 30, 40, 50, 75, 100]}
        initialMode="wheel"
        onClose={() => setPricePickerServiceId('')}
        onConfirm={(value) => void confirmCustomerServicePrice(value)}
        onDismiss={releaseClientCardInteraction}
        confirmLabel="Salva prezzo"
      />

      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={showEditCustomerModal && !!clienteInModifica}
        onShow={resetClientSwipeAfterPopupShown}
        transparent
        animationType="fade"
        onRequestClose={chiudiModificaClienteModal}
        onDismiss={releaseClientCardInteraction}
      >
        <CustomerSheetFrame {...(Platform.OS !== 'web' ? {onClose: chiudiModificaClienteModal} : {})}>
          <View style={{width:'100%',maxWidth:680,height:Platform.OS==='web'?Math.min(750,windowHeight-40):'100%',maxHeight:'100%',flexShrink:1,minHeight:0}}>
            <View style={[customerSheetDockStyle,{width:'100%',height:'100%',maxHeight:'100%',minHeight:0,flex:1,padding:0,paddingBottom:0,backgroundColor:customerPalette.night?'#242D29':'#F7F5EE',borderWidth:1,borderColor:customerPalette.border,borderRadius:24,overflow:'hidden'}]}>
              <CustomerEditorPremiumHeader onClose={chiudiModificaClienteModal} disabled={saving||loadingInit} compact={customerEditorKeyboardOpen}/>

              {clienteInModifica ? (
                <CustomerEditorForm
                  key={clienteInModifica.id}
                  ref={customerEditorFormRef}
                  customer={clienteInModifica}
                  saving={saving}
                  loadingInit={loadingInit}
                  keyboardOpen={customerEditorKeyboardOpen}
                  isDesktopWebLayout={isDesktopWebLayout}
                  scrollRef={editCustomerScrollRef}
                  nameInputRef={editNameInputRef}
                  surnameInputRef={editSurnameInputRef}
                  phoneInputRef={editPhoneInputRef}
                  emailInputRef={editEmailInputRef}
                  instagramInputRef={editInstagramInputRef}
                  noteInputRef={editNoteInputRef}
                  focusField={focusCustomerEditorField}
                  scrollToField={scrollToCustomerEditorField}
                  onBirthdayPress={setEditBirthdayPickerValue}
                  onClose={chiudiModificaClienteModal}
                  onSubmit={salvaCliente}
                />
              ) : null}
            </View>
          </View>
        </CustomerSheetFrame>
      <NativeDatePickerModal
        bottomAnchored
        visible={editBirthdayPickerValue !== null}
        title="Data di nascita (Opzionale)"
        initialValue={editBirthdayPickerValue || undefined}
        onClose={() => setEditBirthdayPickerValue(null)}
        onConfirm={(value) => {
          customerEditorFormRef.current?.setBirthday(value);
          setEditBirthdayPickerValue(null);
        }}
      />
      </Modal>

      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={!!customerNoteClient}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerNoteClient(null)}
      >
        <CustomerSheetFrame {...(Platform.OS !== 'web' ? {onClose: () => setCustomerNoteClient(null)} : {})}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCustomerNoteClient(null)} />
          <Pressable style={[styles.customerNoteModalCard, customerSheetDockStyle]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.customerNoteModalHeader}>
              <View style={styles.customerNoteModalIcon}>
                <Ionicons name="information" size={22} color={customerPalette.ink} />
              </View>
              <View style={styles.customerNoteModalHeaderCopy}>
                <Text style={styles.customerNoteModalEyebrow}>SCHEDA CLIENTE</Text>
                <Text style={styles.customerNoteModalTitle} numberOfLines={2}>
                  {customerNoteClient?.full_name}
                </Text>
              </View>
              <CustomerPopupClose onPress={() => setCustomerNoteClient(null)} />
            </View>
            <ScrollView style={styles.customerNoteModalBody}>
              <Text style={styles.customerNoteModalLabel}>Note interne</Text>
              <Text style={styles.customerNoteModalText}>
                {customerNoteClient?.note?.trim() || 'Nessuna nota registrata per questo cliente.'}
              </Text>
            </ScrollView>
            <View style={styles.customerNoteModalActions}>
              <HapticTouchable
                style={styles.customerNoteModalSecondaryButton}
                onPress={() => setCustomerNoteClient(null)}
                hapticType="light"
              >
                <Text style={styles.customerNoteModalSecondaryText}>Chiudi</Text>
              </HapticTouchable>
              <HapticTouchable
                style={styles.customerNoteModalPrimaryButton}
                onPress={() => {
                  const client = customerNoteClient;
                  setCustomerNoteClient(null);
                  if (client) requestAnimationFrame(() => apriModificaCliente(client));
                }}
                hapticType="medium"
              >
                <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                <Text style={styles.customerNoteModalPrimaryText}>Modifica note</Text>
              </HapticTouchable>
            </View>
          </Pressable>
        </CustomerSheetFrame>
      </Modal>

      {Platform.OS === 'web' || !nativeCustomerPanelOpenRef.current ? renderCustomerFeedback() : null}

      <NumberPickerModal premiumNative
        bottomAnchored
        visible={!!limitTargetClient && !!limitTargetMode}
        title={
          limitTargetMode === 'monthly'
            ? `Limite mensile · ${limitTargetClient?.full_name ?? ''}`
            : limitTargetMode === 'daily'
              ? `Limite giornaliero · ${limitTargetClient?.full_name ?? ''}`
              : `Limite futuri · ${limitTargetClient?.full_name ?? ''}`
        }
        initialValue={
          limitTargetMode === 'daily'
            ? typeof limitTargetClient?.maxDailyAppointments === 'number'
              ? limitTargetClient.maxDailyAppointments
              : 1
            : typeof limitTargetClient?.maxFutureAppointments === 'number'
              ? limitTargetClient.maxFutureAppointments
              : 4
        }
        min={1}
        max={10}
        step={1}
        presets={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        suffix=" pren."
        selectionHintOverride={
          limitTargetMode === 'monthly'
            ? 'Imposta il limite in numero di prenotazioni mensili.'
            : limitTargetMode === 'daily'
              ? 'Imposta il limite in numero di prenotazioni per singolo giorno.'
              : 'Imposta il limite in numero di prenotazioni future.'
        }
        onClose={chiudiSelettoreLimiteAppuntamenti}
        onConfirm={(value) => {
          const numericValue = Number(value);
          if (!limitTargetClient || !limitTargetMode || !Number.isFinite(numericValue)) {
            chiudiSelettoreLimiteAppuntamenti();
            return;
          }

          void persistClienteBookingLimits(
            limitTargetClient,
            limitTargetMode === 'daily'
              ? {
                  maxDailyAppointments: numericValue,
                }
              : {
                  maxFutureAppointments: numericValue,
                  maxFutureAppointmentsMode: limitTargetMode,
                }
          );
          chiudiSelettoreLimiteAppuntamenti();
        }}
      />



      {pendingDeletedClient ? (
        <View style={styles.deleteUndoBanner}>
          <Text style={styles.deleteUndoBannerText}>Cliente eliminato definitivamente tra 3s</Text>
          <HapticTouchable
            style={styles.deleteUndoButton}
            onPress={annullaEliminazioneCliente}
            pressScale={0.98}
            pressOpacity={0.98}
          >
            <Text style={styles.deleteUndoButtonText}>Annulla</Text>
          </HapticTouchable>
        </View>
      ) : null}

      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />
      {/* Keep web confirmations last: all portals share the same z-index. */}
      {Platform.OS === 'web' && swipeConfirmation ? customerConfirmationModal : null}
    </View>
    </CustomerPremiumScope.Provider></NativePremiumScope.Provider>
  );
}

const baseCustomerStyles = StyleSheet.create({
  dialogHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D6DFE8', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  confirmIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  confirmAction: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  confirmCancel: { backgroundColor: '#F1F5F9' },
  confirmDestructive: { backgroundColor: '#BD3349' },
  confirmPrimary: { backgroundColor: '#20394F' },
  confirmActionText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  rulesGroup: { gap: 7 },
  rulesGroupTitle: { fontSize: 14, fontWeight: '600', color: '#172B40', textAlign: 'left' },
  rulesHint: { fontSize: 12, lineHeight: 17, color: '#718096', marginBottom: 3, textAlign: 'left' },
  rulesRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#E6ECF2' },
  rulesRowSelected: { backgroundColor: '#EDF4F8', borderColor: '#BCD0DF' },
  rulesRowLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#253B50', textAlign: 'left' },
  rulesValue: { fontSize: 14, fontWeight: '600', color: '#20394F', backgroundColor: '#DCE9F2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  rulesFootnote: { fontSize: 11, lineHeight: 16, color: '#718096', textAlign: 'left' },

  customerRulesTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  customerRulesTab: { flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#EEF2F6', alignItems: 'center', justifyContent: 'center' },
  customerRulesTabSelected: { backgroundColor: '#20394F' },
  customerRulesTabText: { color: '#52677E', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  customerRulesTabTextSelected: { color: '#FFFFFF' },

  container: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  listContent: {
    paddingTop: Platform.OS === 'web' ? 8 : 54,
    paddingBottom: 128,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: IS_ANDROID ? 28 : 16,
    paddingTop: 0,
    paddingBottom: 20,
    marginBottom: 12,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  clientOverviewRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },
  clientOverviewCard: {
    flex: 1,
    minHeight: 126,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  clientOverviewContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientOverviewCardSuccess: {
    backgroundColor: '#E9F9EF',
  },
  clientOverviewCardAlert: {
    backgroundColor: '#FCEAEA',
  },
  clientOverviewCount: {
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 9,
  },
  ownerStartupClientCount: {
    width: 56,
    height: 35,
    marginBottom: 9,
  },
  ownerStartupClientCountFill: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#C9D7E7',
  },
  ownerStartupClientList: {
    gap: 12,
    marginBottom: 12,
  },
  ownerStartupClientCard: {
    minHeight: 118,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7F1',
  },
  ownerStartupClientAvatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#D9E4F1',
  },
  ownerStartupClientCopy: {
    flex: 1,
    gap: 12,
  },
  ownerStartupClientName: {
    width: '58%',
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D2DEEC',
  },
  ownerStartupClientMeta: {
    width: '82%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E1E8F1',
  },
  clientOverviewLabel: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  clientOverviewLabelWrap: {
    minHeight: 44,
    marginTop: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroClientSubtitle: {
    marginTop: 18,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 10 : 4,
  },
  customerTopCardWeb: { width: '100%', maxWidth: '100%', alignSelf: 'center', paddingVertical: 10 },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 12,
    marginTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  bookingCardDesktop: {
    alignItems: 'center',
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: '100%', alignSelf: 'center' as const, paddingVertical: 12 } : {}),
  },
  customerRemindersGuideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingVertical: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    position: 'relative',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: '100%', alignSelf: 'center' as const, paddingVertical: 12 } : {}),
  },
  customerRemindersGuideHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: Platform.OS === 'web' ? 'center' : 'flex-start',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-start',
    gap: 12,
    position: 'relative',
    paddingHorizontal: 0,
  },
  customerRemindersGuideCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  customerRemindersGuideTitle: {
    paddingHorizontal: 24,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  customerRemindersGuideSubtitle: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  reminderHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 8 } : {}),
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  reminderDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  reminderStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reminderStatusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  reminderStatusBadgeDanger: {
    backgroundColor: '#FDECEC',
  },
  reminderStatusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  reminderStatusBadgeTextActive: {
    color: '#166534',
  },
  reminderStatusBadgeTextDanger: {
    color: '#B91C1C',
  },
  reminderOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    ...(Platform.OS === 'web' ? { marginTop: 10, gap: 6 } : {}),
  },
  reminderOptionChip: {
    minWidth: 66,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D7E0EA',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { minHeight: 40, minWidth: 58, paddingVertical: 8 } : {}),
  },
  reminderOptionChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  reminderOptionChipDisabled: {
    opacity: 0.6,
  },
  reminderOptionChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  reminderOptionChipTextActive: {
    color: '#FFFFFF',
  },
  reminderSummaryCard: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...Platform.select({
      web: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 860,
      },
    }),
    ...(Platform.OS === 'web' ? { maxWidth: 640, paddingVertical: 9, marginTop: 10 } : {}),
  },
  reminderSummaryCardActive: {
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  reminderSummaryCardDanger: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reminderSummaryText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  reminderSummaryTextActive: {
    color: '#166534',
  },
  reminderSummaryTextDanger: {
    color: '#B91C1C',
  },
  reminderHint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { marginTop: 8 } : {}),
  },
  reminderErrorText: {
    marginTop: 10,
    color: '#B42318',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  communicationCard: {
    marginBottom: 12,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: IS_ANDROID ? 14 : 15,
    paddingVertical: 13,
    borderRadius: 20,
    backgroundColor: '#F5F1FF',
    borderWidth: 1,
    borderColor: '#DED4FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: '100%', alignSelf: 'center' as const, paddingVertical: 12 } : {}),
  },
  communicationCardDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '100%',
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 24,
    position: 'relative',
  },
  communicationLead: {
    flexShrink: 0,
  },
  communicationActionRail: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  communicationLeadDesktop: {
    position: 'absolute',
    left: 18,
    top: 0,
    bottom: 0,
    width: 100,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  communicationActionRailDesktop: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    width: 100,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2,
  },
  communicationIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E8DFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  communicationContent: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  communicationContentDesktop: {
    position: 'absolute',
    left: 130,
    right: 130,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  communicationTextDesktop: {
    width: '100%',
    textAlign: 'center',
  },
  communicationTitle: {
    color: '#21163F',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'left',
  },
  communicationDescription: {
    marginTop: 3,
    color: '#675D7B',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'left',
  },
  communicationButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: '#6549C4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  communicationButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  reminderDebugCard: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    gap: 4,
  },
  reminderDebugTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9A3412',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reminderDebugText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#7C2D12',
  },
  bookingHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bookingHeaderTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  bookingHeaderLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 44,
    paddingRight: 12,
  },
  bookingHeadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  bookingHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  bookingBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 6,
    flexShrink: 0,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bookingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  bookingChevronWrap: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bookingChevronWrapExpanded: {
    shadowOpacity: 0.18,
  },
  bookingBadgeAlert: {
    backgroundColor: '#FDECEC',
    marginTop: 0,
  },
  bookingBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    marginTop: 0,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  bookingBadgeSuccessText: {
    color: '#15803D',
  },
  bookingBadgeAlertText: {
    color: '#B91C1C',
  },
  clientCancellationCornerBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7f1d1d',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 3,
  },
  clientCancellationCornerBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  formToggleChip: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c1cfde',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  formToggleChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  formFieldsWrap: {
    marginTop: 6,
    alignItems: 'center',
  },
  formFieldsWrapDesktop: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  sectionBlock: {
    marginBottom: 8,
    backgroundColor: '#e8eef5',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 14,
    borderWidth: 1.85,
    borderColor: '#869fbc',
    borderTopWidth: 2.35,
    borderTopColor: '#dde7f2',
    shadowColor: '#0f172a',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 13,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 8,
    width: '100%',
    maxWidth: 440,
  },
  inputDesktopWide: {
    maxWidth: 520,
  },
  inputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  successDialogOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 22, paddingBottom: 0 },
  successDialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
  },
  successDialogShell: {
    width: '100%',
    maxWidth: 560,
  },
  successDialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    shadowColor: '#020617',
    shadowOpacity: 0,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 },
    elevation: 0,
  },
  successDialogCardClient: {
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  feedbackDialogCardError: {
    backgroundColor: '#FFF7F7',
    borderColor: 'rgba(248, 113, 113, 0.22)',
    shadowColor: '#DC2626',
    shadowOpacity: 0.14,
  },
  successDialogHandle: {
    alignSelf: 'center',
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.16)',
    marginBottom: 16,
  },
  successDialogIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  successDialogIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  successDialogIconWrapClient: {
    backgroundColor: '#D9EAFE',
  },
  feedbackDialogIconWrapError: {
    backgroundColor: '#FEE2E2',
  },
  successDialogTitleWrap: {
    flex: 1,
  },
  successDialogEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#7C8594',
    marginBottom: 4,
  },
  feedbackDialogEyebrowError: {
    color: '#B91C1C',
  },
  successDialogTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    color: '#0B1220',
  },
  feedbackDialogTitleError: {
    color: '#111827',
  },
  successDialogBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    marginBottom: 20,
  },
  feedbackDialogBodyError: {
    color: '#475569',
  },
  successDialogButton: {
    minHeight: 54,
    borderRadius: 20,
    backgroundColor: '#0B1220',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackDialogButtonError: {
    backgroundColor: '#B91C1C',
    borderColor: 'rgba(185, 28, 28, 0.4)',
  },
  successDialogButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchInput: {
    marginTop: 10,
  },
  searchInputNative: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    fontStyle: 'normal',
    letterSpacing: 0,
    paddingHorizontal: 14,
  },
  dateInputButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInputAfterCustomerNote: {
    marginTop: 14,
  },
  dateInputAfterCustomerNoteWeb: {
    marginTop: 20,
  },
  dateInputButtonDesktop: {
    maxWidth: 360,
  },
  dateInputText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
  },
  dateInputPlaceholder: {
    color: '#9a9a9a',
  },
  clearDateChip: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  clearDateChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  requiredFieldsHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  optionalEmailInfo: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: -2,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.16)',
    backgroundColor: 'rgba(239, 246, 255, 0.82)',
  },
  optionalEmailInfoText: {
    flex: 1,
    gap: 2,
  },
  optionalEmailInfoTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  optionalEmailInfoBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#475569',
  },
  customerEditorSupportCardWeb: {
    maxWidth: 600,
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 19,
  },
  customerNoteFieldCard: {
    width: '100%',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#F8FAFF',
  },
  customerNoteFieldCardWeb: {
    maxWidth: 600,
    marginTop: 10,
    marginBottom: 12,
    padding: 18,
    gap: 14,
    borderRadius: 21,
  },
  customerNoteFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  customerNoteFieldIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  customerNoteFieldCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerNoteFieldTitle: {
    color: '#172554',
    fontSize: 12.5,
    fontWeight: '900',
  },
  customerNoteFieldSubtitle: {
    marginTop: 1,
    color: '#64748B',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
  },
  customerNoteInput: {
    width: '100%',
    minHeight: 92,
    maxHeight: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  actionColumnDesktop: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flexDirection: 'column',
  },
  primaryButtonInline: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryButtonInlineDesktop: {
    width: '100%',
    flex: 0,
  },
  primaryButtonDisabled: {
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  primaryButtonTextDisabled: {
    color: '#94A3B8',
  },
  secondaryButton: {
    flex: 0.84,
    minHeight: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  secondaryButtonDesktop: {
    width: '100%',
    flex: 0,
  },
  secondaryButtonDanger: {
    minHeight: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 5,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  secondaryButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: 'rgba(148,163,184,0.2)',
    opacity: 1,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  secondaryButtonDangerText: {
    color: '#B91C1C',
  },
  secondaryButtonTextDisabled: {
    color: '#94a3b8',
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 10,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  searchHeaderBlockTouchable: {
    width: '100%',
    borderRadius: 18,
    paddingVertical: 2,
    marginBottom: 2,
  },
  searchTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 0,
    lineHeight: 22,
    textAlign: 'center',
    width: 'auto',
  },
  searchHeaderRow: {
    position: 'relative',
    width: '100%',
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 40,
    paddingRight: 0,
  },
  searchHeaderRowWithGuide: {
    paddingLeft: 84,
    paddingRight: 84,
  },
  markAllClientsReadRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 4,
    marginTop: 10,
    marginBottom: 4,
  },
  registrationFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  registrationFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
  },
  registrationFilterSelected: { backgroundColor: '#EDF4FF', borderColor: '#AEC8F5' },
  registrationFilterText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  registrationFilterTextSelected: { color: '#1D4ED8' },
  searchChevronWrap: {
    position: 'absolute',
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchChevronWrapExpanded: {
    shadowOpacity: 0.18,
  },
  searchSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
  },
  newCustomerCardTitle: {
    letterSpacing: -0.25,
  },
  newCustomerCardSubtitle: {
    alignSelf: 'center',
    maxWidth: 330,
    paddingHorizontal: 10,
    ...(Platform.OS === 'web' ? { maxWidth: 640 } : {}),
  },
  clientSwipeHint: {
    minHeight: 28,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0,
    borderTopColor: 'rgba(100, 116, 139, 0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  clientSwipeHintText: {
    color: '#64748B',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  daySectionCardShell: {
    width: '100%',
  },
  clientSectionsWrap: {
    marginTop: 10,
    gap: 10,
  },
  searchEmptyState: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E1E7EE',
  },
  searchEmptyTitle: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  searchEmptyText: {
    marginTop: 5,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  clientMonthSection: {
    width: '100%',
  },
  clientMonthSectionGridWeb: {
    ...Platform.select({
      web: {
        width: '100%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 12,
      } as any,
    }),
  },
  clientMonthSectionHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 6,
  },
  clientMonthSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clienteCard: {
    position: 'relative',
    backgroundColor: '#EAF2FC',
    borderRadius: 20,
    paddingHorizontal: IS_ANDROID ? 16 : 18,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BDD0E6',
    shadowColor: '#294B73',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow:
          'none',
      } as any,
    }),
  },
  clienteCardNativePremium: {
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: 0,
    paddingHorizontal: 14,
    gap: 2,
    backgroundColor: '#F3F7FC',
    borderWidth: 1,
    borderColor: '#B5C9E2',
    borderTopColor: '#D5E3F4',
    borderRadius: 18,
    marginBottom: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(44, 74, 116, 0.10), inset 0 1px 0 rgba(255,255,255,0.9)' } as any : {}),
  },
  clienteCardNativeShadow: {
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  clienteCardNativeShadowSelected: {
    opacity: 0.99,
  },
  clienteCardNativeShadowUnread: {
    backgroundColor: 'transparent',
  },
  clienteCardDepthFar: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 8,
    bottom: -10,
    borderRadius: 30,
    backgroundColor: 'rgba(23, 59, 103, 0.018)',
  },
  clienteCardDepthSoft: {
    position: 'absolute',
    left: 7,
    right: 7,
    top: 6,
    bottom: -8,
    borderRadius: 30,
    backgroundColor: 'rgba(23, 59, 103, 0.024)',
  },
  clienteCardDepthMid: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    bottom: -6,
    borderRadius: 29,
    backgroundColor: 'rgba(23, 59, 103, 0.03)',
  },
  clienteCardDepthNear: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 2,
    bottom: -4,
    borderRadius: 29,
    backgroundColor: 'rgba(23, 59, 103, 0.04)',
  },
  clienteCardWebSwipeSurface: {
    ...Platform.select({
      web: {
      } as any,
    }),
  },
  clienteCardWebStatic: {
    ...Platform.select({
      web: {
        cursor: 'default',
        marginBottom: 0,
        borderRadius: 22,
        paddingHorizontal: 12,
        paddingVertical: 10,
      } as any,
    }),
  },
  clienteCardWebActionsOpen: {
    ...Platform.select({
      web: {
        zIndex: 28,
      } as any,
    }),
  },
  clienteCardWebClosed: {
    ...Platform.select({
      web: {} as any,
    }),
  },
  clienteCardDesktopOpenLayer: {
    ...Platform.select({
      web: {
        position: 'relative',
        zIndex: 28,
      } as any,
    }),
  },
  clienteCardSelected: {
    borderColor: '#B9C5D4',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 11 },
    elevation: 5,
  },
  clienteCardUnread: {
    borderColor: 'rgba(220, 38, 38, 0.38)',
    backgroundColor: '#FFFBFA',
    shadowColor: '#DC2626',
    ...(Platform.OS !== 'web' ? { borderColor: '#9DBADE', backgroundColor: '#EAF2FC', shadowColor: '#17365D' } : {}),
  },
  clienteCardTopHighlight: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    height: 2,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: 'rgba(96, 151, 218, 0.24)',
  },
  clienteCardTopHighlightNative: {
    left: 22,
    right: 22,
    height: 3,
    backgroundColor: 'rgba(94, 153, 224, 0.42)',
    shadowColor: '#60A5FA',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  clienteCardInnerStroke: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 3,
    bottom: 3,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  clienteCardInnerStrokeNative: {
    left: 4,
    right: 4,
    top: 4,
    bottom: 4,
    borderColor: 'rgba(255,255,255,0.94)',
  },
  clienteMain: {
    width: '100%',
    position: 'relative',
    paddingHorizontal: 0,
    gap: 9,
    alignSelf: 'stretch',
  },
  clienteMainDesktop: {
    ...Platform.select({
      web: {
        gap: 5,
      } as any,
    }),
  },
  clienteCardBody: {
    width: '100%',
    minWidth: 0,
    gap: 9,
  },
  clienteCardBodyDesktop: {
    ...Platform.select({
      web: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 8,
      } as any,
    }),
  },
  clientePrimaryColumn: {
    width: '100%',
    minWidth: 0,
    gap: 9,
  },
  clientePrimaryColumnDesktop: {
    ...Platform.select({
      web: {
        flex: 1,
        width: 'auto',
        gap: 6,
      } as any,
    }),
  },
  clienteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    minWidth: 0,
    gap: 10,
  },
  clienteTopRowDesktop: {
    ...Platform.select({
      web: {
        width: '100%',
        maxWidth: '100%',
        alignSelf: 'stretch',
        justifyContent: 'flex-start',
        gap: 8,
      } as any,
    }),
  },
  clienteInitialBadge: {
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: '#141B2D',
    borderWidth: 0,
    borderColor: '#141B2D',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#111827',
    shadowOpacity: 0,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 0,
  },
  clienteInitialText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  clienteInitialBadgeDesktop: {
    ...Platform.select({
      web: {
        width: 42,
        height: 42,
      } as any,
    }),
  },
  clienteInitialTextDesktop: {
    ...Platform.select({
      web: {
        fontSize: 15,
        lineHeight: 16,
      } as any,
    }),
  },
  clienteInfo: {
    width: '100%',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  clienteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  clienteContentColumn: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingTop: 1,
    alignItems: 'flex-start',
  },
  clienteContentColumnDesktop: {
    ...Platform.select({
      web: {
        flexGrow: 0,
        flexShrink: 1,
        flexBasis: 'auto',
        justifyContent: 'center',
        gap: 2,
        paddingTop: 0,
      } as any,
    }),
  },
  clienteNomeWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 0,
  },
  clienteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  clienteNome: {
    width: '100%',
    fontSize: 18,
    fontWeight: '600',
    color: '#151B2A',
    marginBottom: 0,
    textAlign: 'left',
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    paddingTop: 0,
    paddingRight: 2,
  },
  clienteNomeDesktop: {
    ...Platform.select({
      web: {
        overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none',
        fontSize: 15.5,
        lineHeight: 18,
      } as any,
    }),
  },
  customerInfoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F5FA',
    borderWidth: 0,
    borderColor: '#BFDBFE',
    flexShrink: 0,
  },
  customerInfoButtonHasNote: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  clienteContactStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 2,
    width: '100%',
    minWidth: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  clienteTelefono: {
    fontSize: IS_ANDROID ? 11.2 : 12,
    color: '#4F5D70',
    fontWeight: '500',
    textAlign: 'left',
    width: '100%',
    minWidth: 0,
    paddingRight: 0,
  },
  clienteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: IS_ANDROID ? 3 : 6,
    marginTop: 4,
    width: '100%',
    minWidth: 0,
  },
  clienteEmailCompact: {
    ...Platform.select({ web: { overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' } as any }),
    fontSize: IS_ANDROID ? 10 : 10.8,
    color: '#7A8798',
    fontWeight: '400',
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    width: '100%',
    flexGrow: 0,
    maxWidth: '100%',
    paddingRight: 0,
  },
  statusBadgesRow: {
    flexDirection: 'row',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    justifyContent: Platform.OS === 'web' ? 'center' : 'space-between',
    flexWrap: 'wrap',
    gap: Platform.OS === 'web' ? 12 : 10,
    width: '100%',
    minWidth: 0,
    marginTop: Platform.OS === 'web' ? 6 : 4,
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.62)' : 'transparent',
    borderWidth: Platform.OS === 'web' ? 1 : 0, borderColor: '#E0E7F0', borderTopColor: '#FFFFFF',
    shadowColor: '#425B7A', shadowOpacity: 0, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 0,
    borderRadius: Platform.OS === 'web' ? 12 : 0,
    paddingHorizontal: Platform.OS === 'web' ? 10 : 0,
    paddingVertical: Platform.OS === 'web' ? 8 : 5,
    
    alignSelf: 'stretch',
  },
  statusBadgesRowDesktop: {
    ...Platform.select({
      web: {
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        flexWrap: 'nowrap',
        gap: 6,
      } as any,
    }),
  },

  customerRulesContentCompact: { position: 'relative', minHeight: 77, paddingBottom: 2, gap: 3 },
  customerRuleCompactCopy: { paddingRight: 124 },
  customerRuleCompactText: { fontSize: 11, lineHeight: 15 },
  customerBenefitsButtonCompact: { position: 'absolute', right: 0, top: 28, width: 116, minHeight: 34, marginTop: 0, marginBottom: 0, paddingHorizontal: 7, paddingVertical: 3, gap: 5, borderRadius: 11, zIndex: 2 },
  customerBenefitsCompactText: { fontSize: 10.5, lineHeight: 12, fontWeight: '600' },
  customerCompactDisclosure: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  customerCompactSwipeCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  customerCompactSwipeText: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: '#65758D' },
  customerCompactDisclosureLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  customerExpandedContactHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 8 },
  customerRulesContent: { gap: Platform.OS === 'web' ? 8 : 3 },
  customerRuleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  customerRuleCopy: { flex: 1, minWidth: 0, gap: 2 },
  customerRuleHeading: { color: '#334155', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  customerRuleDescription: { color: '#64748B', fontSize: 11, lineHeight: 16, fontWeight: '400' },
  customerCancellationSummary: { color: '#A44D58', fontSize: 11, lineHeight: 16, fontWeight: '500', flex: 1, minWidth: 0 },
  customerDetailsDisclosure: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, paddingVertical: 4, marginTop: 2, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C9D9EC',
  },
  customerBenefitsButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 44, paddingHorizontal: 10, paddingVertical: 4,
    marginTop: 6, marginBottom: 3, marginHorizontal: 0,
    borderRadius: 13, borderWidth: 1, borderColor: '#DDD6E6',
    backgroundColor: '#FAF8FC',
  },
  customerBenefitsIcon: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: '#F0EAF4', borderWidth: 1, borderColor: '#E2D8E9',
    alignItems: 'center', justifyContent: 'center',
  },
  customerBenefitsArrow: {
    width: 20, height: 24, borderRadius: 10, backgroundColor: '#F0EAF4',
    alignItems: 'center', justifyContent: 'center',
  },
  customerBenefitsButtonText: {
    flex: 1, minWidth: 0, color: '#604B65', fontWeight: '600', fontSize: 13,
    textAlign: 'left',
  },
  customerContactDisclosure: {
    minHeight: 44, marginTop: 2, marginBottom: 4, marginHorizontal: 0,
    paddingHorizontal: 10, paddingVertical: 4, gap: 10,
    borderRadius: 13, borderWidth: 1, borderColor: '#D4E1E7',
    backgroundColor: '#F5F9FB',
  },
  customerContactFooter: {
    marginHorizontal: -14, marginTop: 3, paddingHorizontal: 14,
    backgroundColor: '#F1F6FB',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D7E3EF',
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  customerContactDisclosureIntegrated: {
    backgroundColor: 'transparent', borderWidth: 0, borderTopWidth: 0,
    borderRadius: 0, marginTop: 0, marginBottom: 0, paddingHorizontal: 0,
  },
  customerContactSwipeHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingTop: 3, paddingBottom: 6, backgroundColor: 'transparent',
  },
  customerContactIcon: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E8F0F4', borderRadius: 8, borderWidth: 1, borderColor: '#D6E4EA',
  },
  customerContactText: { color: '#395E6D', fontWeight: '600', fontSize: 13, flex: 1, textAlign: 'left' },
  customerLimitsSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  customerLimitMetric: { flexGrow: 1, flexBasis: 70, minWidth: 70, gap: 3 },
  customerMetricLabel: { color: '#788596', fontSize: 10, lineHeight: 14, fontWeight: '400' },
  customerMetricValue: { color: '#263448', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  statusLimitsColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  statusLimitsColumnDesktop: {
    ...Platform.select({
      web: {
        flex: 1,
        minWidth: 0,
        width: 'auto',
        maxWidth: 'none',
        alignItems: 'stretch',
        gap: 4,
      } as any,
    }),
  },
  newClientActionsNative: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 0, flexWrap: 'wrap' },
  newClientBadgeNative: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: '#E9D6AA', backgroundColor: '#FFF8E9' },
  newClientTextNative: { color: '#79551E', fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  newClientReadNative: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 7, minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: '#D7E3F1', backgroundColor: '#EEF4FC' },
  newClientReadTextNative: { color: '#17365D', fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  statusBadgeNewClient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'stretch',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.62)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    shadowColor: '#DC2626',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statusBadgeNewClientDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    ...(Platform.OS !== 'web' ? { backgroundColor: '#426A94', shadowOpacity: 0, width: 5, height: 5 } : {}),
  },
  statusBadgeNewClientText: {
    flexShrink: 1,
    fontSize: IS_ANDROID ? 10.2 : 10.6,
    lineHeight: IS_ANDROID ? 11.5 : 12.5,
    fontWeight: '900',
    color: '#9F1239',
    textAlign: 'center',
  },
  statusCancellationWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    flexShrink: 0,
  },
  statusMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 10,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    marginTop: 0,
    marginBottom: 4,
    paddingLeft: 0,
    alignSelf: 'stretch',
  },
  clientCancellationAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    alignSelf: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 0,
    borderColor: 'rgba(244, 205, 209, 0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 0,
    marginBottom: 0,
    flexShrink: 0,
    flexGrow: 0,
    flexBasis: 'auto',
    minWidth: 0,
    alignContent: 'center',
  },
  clientCancellationCountPill: {
    minWidth: 12,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    flexShrink: 0,
  },
  clientCancellationCountText: {
    fontSize: IS_ANDROID ? 9.4 : 9.8,
    lineHeight: IS_ANDROID ? 10 : 10.5,
    fontWeight: '600',
    color: '#B91C1C',
    textAlign: 'center',
  },
  clientCancellationAlertText: {
    flexShrink: 1,
    fontSize: IS_ANDROID ? 10 : 10.4,
    lineHeight: IS_ANDROID ? 11 : 12,
    fontWeight: '500',
    color: '#B91C1C',
    textAlign: 'center',
  },
  clienteInstagramCompact: {
    fontSize: IS_ANDROID ? 10 : 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: IS_ANDROID ? '34%' : undefined,
    paddingRight: IS_ANDROID ? 1 : 0,
  },
  clienteBirthdayCompact: {
    fontSize: IS_ANDROID ? 10 : 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: IS_ANDROID ? '34%' : undefined,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 9,
    marginTop: 0,
    width: '100%',
  },
  quickActionsRowDesktop: {
    ...Platform.select({
      web: {
        height: '100%',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 5,
      } as any,
    }),
  },
  quickActionsRowCompact: {
    gap: 5,
    marginTop: 5,
  },
  quickActionChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E1E7EE',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flexShrink: 1,
    flexGrow: 1,
    flexBasis: 0,
    shadowColor: '#111827',
    shadowOpacity: 0.015,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  quickActionChipDesktop: {
    ...Platform.select({
      web: {
        width: 'auto',
        minHeight: 36,
        flexBasis: '45%',
        flexGrow: 1,
        flexShrink: 0,
        flexDirection: 'row',
        gap: 4,
        borderRadius: 11,
        paddingHorizontal: 5,
        paddingVertical: 5,
      } as any,
    }),
  },
  quickActionChipCompact: {
    minWidth: IS_ANDROID ? 86 : 72,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quickActionChipWhatsapp: {
    backgroundColor: '#FBFDFB',
    borderColor: '#D7EDE0',
  },
  quickActionChipInstagram: {
    backgroundColor: '#FCFAFF',
    borderColor: '#E5DDFC',
  },
  quickActionChipQr: {
    backgroundColor: '#FDFBF8',
    borderColor: '#E8DDC8',
  },
  quickActionChipDisabled: {
    opacity: 0.38,
  },
  quickActionText: {
    fontSize: IS_ANDROID ? 9.4 : 10,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    paddingHorizontal: 0,
    width: '100%',
  },
  quickActionTextDesktop: {
    ...Platform.select({
      web: {
        width: 'auto',
        minWidth: 0,
        flexGrow: 1,
        flexShrink: 1,
        fontSize: 7.8,
        lineHeight: 9.5,
        letterSpacing: -0.08,
        textAlign: 'left',
      } as any,
    }),
  },
  quickActionTextCompact: {
    fontSize: IS_ANDROID ? 9 : 8,
  },
  quickActionTextWhatsapp: {
    color: '#166534',
  },
  quickActionTextInstagram: {
    color: '#6D28D9',
  },
  quickActionTextQr: {
    color: '#7C5A30',
  },
  quickActionsSurface: {
    backgroundColor: 'transparent',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: '#E9EEF4',
    paddingHorizontal: 0,
    paddingVertical: 5,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickActionsSurfaceDesktop: {
    ...Platform.select({
      web: {
        width: 92,
        flexShrink: 0,
        alignSelf: 'stretch',
        borderRadius: 15,
        paddingHorizontal: 5,
        paddingVertical: 5,
      } as any,
    }),
  },
  webClientActionsHintWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    marginBottom: 0,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(203, 213, 225, 0.55)',
  },
  webClientActionsHint: {
    minHeight: 26,
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignSelf: 'center',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  webClientActionsHintOpen: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
  },
  webClientActionsHintIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  webClientActionsHintContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    flex: 1,
    minWidth: 0,
  },
  webClientActionsHintText: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  webClientActionsHintTextOpen: {
    color: '#0F172A',
  },
  webClientActionsHintSubtext: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  webClientActionsHintSubtextOpen: {
    color: 'rgba(255,255,255,0.72)',
  },
  webManagementActionsWrap: {
    width: '100%',
    marginTop: 5,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(203, 213, 225, 0.55)',
  },
  webManagementActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginTop: 4,
    marginBottom: 4,
  },
  webManagementActionButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '46%',
    minWidth: 105,
    marginBottom: 0,
    minHeight: 56,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  webManagementActionButtonBenefits: { backgroundColor: '#FFF1F6', borderWidth: 1, borderColor: '#F2CDDC' },
  webManagementActionButtonPayment: { backgroundColor: '#FFF8E6', borderWidth: 1, borderColor: '#ECDCA8' },
  webManagementActionLabelBenefits: { color: '#A13662' },
  webManagementActionLabelPayment: { color: '#8A650C' },
  webManagementActionButtonEdit: {
    backgroundColor: '#E8F1FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  webManagementActionButtonLimit: {
    backgroundColor: '#F2EBFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  webManagementActionButtonTiming: {
    backgroundColor: '#E6FFFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  webManagementActionButtonBlock: {
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  webManagementActionButtonUnlock: {
    backgroundColor: '#EAF8EE',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  webManagementActionButtonDelete: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#FBCACA',
  },
  webManagementActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
  },
  webManagementActionLabelEdit: {
    color: '#1D4ED8',
  },
  webManagementActionLabelLimit: {
    color: '#6D28D9',
  },
  webManagementActionLabelTiming: {
    color: '#0F766E',
  },
  webManagementActionLabelBlock: {
    color: '#C2410C',
  },
  webManagementActionLabelUnlock: {
    color: '#166534',
  },
  webManagementActionLabelDelete: {
    color: '#B91C1C',
  },
  swipeActionsColumnRight: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    width: 132,
    marginBottom: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  swipeActionButton: {
    width: '100%',
    minHeight: 58,
    borderRadius: 20,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  swipeActionCompact: {
    flex: 1,
    width: 'auto',
    minHeight: 44,
    alignSelf: 'stretch',
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 3,
    shadowRadius: 4,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
  },
  swipeActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  swipeActionEdit: {
    backgroundColor: Platform.OS === 'web' ? '#2563EB' : 'rgba(37, 99, 235, 0.12)',
    borderColor: 'rgba(37, 99, 235, 0.23)',
  },
  swipeActionTiming: {
    backgroundColor: Platform.OS === 'web' ? '#0F766E' : 'rgba(250, 204, 21, 0.16)',
    borderColor: 'rgba(234, 179, 8, 0.28)',
  },
  swipeActionLimit: {
    backgroundColor: Platform.OS === 'web' ? '#7C3AED' : 'rgba(124, 58, 237, 0.12)',
    borderColor: 'rgba(124, 58, 237, 0.23)',
  },
  swipeActionBlock: {
    backgroundColor: Platform.OS === 'web' ? '#F97316' : 'rgba(249, 115, 22, 0.12)',
    borderColor: 'rgba(249, 115, 22, 0.23)',
  },
  swipeActionUnlock: {
    backgroundColor: Platform.OS === 'web' ? '#16A34A' : 'rgba(22, 163, 74, 0.12)',
    borderColor: 'rgba(22, 163, 74, 0.23)',
  },
  swipeActionDelete: {
    backgroundColor: Platform.OS === 'web' ? '#EF4444' : 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.23)',
    minHeight: 58,
  },
  swipeActionPayment: {
    backgroundColor: Platform.OS === 'web' ? '#0F766E' : 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.23)',
  },
  swipeActionLabelEdit: { color: Platform.OS === 'web' ? '#FFFFFF' : '#1D4ED8' },
  swipeActionLabelTiming: { color: Platform.OS === 'web' ? '#FFFFFF' : '#854D0E' },
  swipeActionLabelPayment: { color: Platform.OS === 'web' ? '#FFFFFF' : '#15803D' },
  swipeActionLabel: {
    fontSize: 11,
    fontWeight: Platform.OS === 'web' ? '900' : '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 12.5,
  },
  swipeActionLabelBlock: {
    color: Platform.OS === 'web' ? '#FFFFFF' : '#C2410C',
  },
  swipeActionLabelLimit: {
    color: Platform.OS === 'web' ? '#FFFFFF' : '#6D28D9',
    lineHeight: 12,
  },
  swipeActionLabelUnlock: {
    color: Platform.OS === 'web' ? '#FFFFFF' : '#15803D',
  },
  swipeActionLabelDelete: {
    color: Platform.OS === 'web' ? '#FFFFFF' : '#B91C1C',
  },
  statusBadgeBlockedCentered: {
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: IS_ANDROID ? 9 : 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 0,
    marginBottom: 0,
    minWidth: 0,
    flexShrink: 0,
  },
  statusBadgeBlockedText: {
    fontSize: IS_ANDROID ? 9.5 : 10,
    lineHeight: IS_ANDROID ? 12 : 13,
    fontWeight: '900',
    color: '#C2410C',
    width: 'auto',
    textAlign: 'center',
  },
  statusBadgeCancelled: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  statusBadgeLimit: {
    alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 3,
    flexShrink: Platform.OS === 'web' ? 0 : 1,
    flexGrow: 0,
    flexBasis: 'auto',
    minWidth: 0,
    width: Platform.OS === 'web' ? '100%' : undefined,
    maxWidth: Platform.OS === 'web' ? 360 : '100%',
    minHeight: 0,
    justifyContent: 'center',
    borderColor: '#E8DDBF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  statusBadgeLimitText: {
    fontSize: IS_ANDROID ? 10 : 10.4,
    lineHeight: IS_ANDROID ? 12 : 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'left',
    flexShrink: 1,
  },
  statusBadgeLimitPrimary: {
    backgroundColor: 'transparent',
  },
  statusBadgeLimitPrimaryText: {
    color: '#64748B',
  },
  statusBadgeLimitSecondary: {
    backgroundColor: 'transparent',
  },
  statusBadgeLimitSecondaryText: {
    color: '#64748B',
  },
  statusBadgeUnlimited: {
    backgroundColor: 'transparent',
  },
  statusBadgeUnlimitedText: {
    color: '#64748B',
  },
  deleteUndoBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: IS_ANDROID ? 108 : 104,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8b1b7',
    backgroundColor: '#f6e3e5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  deleteUndoBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#991b1b',
    textAlign: 'left',
  },
  deleteUndoButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteUndoButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
  customerEditorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 0,
  },
  customerEditorOverlayCentered: {
    justifyContent: 'flex-end',
    paddingTop: IS_ANDROID ? 54 : 72,
    paddingBottom: 0,
  },
  customerEditorOverlayKeyboardOpen: {
    justifyContent: 'flex-end',
    paddingTop: 42,
  },
  customerEditorKeyboardAvoider: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  customerEditorKeyboardAvoiderWeb: {
    maxWidth: 760,
  },
  customerEditorModalCard: {
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 0,
    maxHeight: '86%',
    overflow: 'hidden',
  },
  customerEditorModalCardWeb: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    borderRadius: 34,
  },
  customerNoteModalCard: {
    maxHeight: '100%',
    width: '100%',
    maxWidth: 510,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  customerNoteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerNoteModalIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  customerNoteModalHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerNoteModalEyebrow: {
    color: '#2563EB',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  customerNoteModalTitle: {
    marginTop: 3,
    color: '#0F172A',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
  },
  customerNoteModalBody: {
    marginTop: 15,
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    padding: 14,
  },
  customerNoteModalLabel: {
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  customerNoteModalText: {
    marginTop: 7,
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  customerNoteModalActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  customerNoteModalSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  customerNoteModalSecondaryText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '900',
  },
  customerNoteModalPrimaryButton: {
    flex: 1.35,
    minHeight: 50,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  customerNoteModalPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  customerTimingBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: IS_ANDROID ? 20 : 52,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    ...Platform.select({
      web: {
        justifyContent: 'center',
        paddingTop: 24,
        paddingBottom: 24,
      } as any,
    }),
  },
  customerTimingModalCard: {
    position: 'relative',
    width: '100%',
    maxWidth: 720,
    maxHeight: '100%',
    flexShrink: 1,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#F8FAFD',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 0,
    ...Platform.select({
      web: {
        boxShadow: '0 24px 64px rgba(15,23,42,0.24)',
      } as any,
    }),
  },
  customerTimingTopAccent: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 3,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: '#2563EB',
    zIndex: 2,
  },
  customerTimingHeader: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF6',
  },
  customerTimingHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3F8',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  customerTimingHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerTimingEyebrow: {
    color: '#2563EB',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 1.45,
  },
  customerTimingTitle: {
    color: '#0F172A',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  customerTimingSubtitle: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  customerTimingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: '#F1F5F9',
    borderWidth: 0,
    borderColor: '#FECACA',
  },
  customerTimingNotice: {
    marginTop: 8,
    marginBottom: 6,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF4FC',
    borderWidth: 1,
    borderColor: '#DAE6F6',
  },
  customerTimingNoticeIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: '#E1ECFA',
  },
  customerTimingNoticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerTimingNoticeTitle: {
    color: '#166534',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  customerTimingNoticeText: {
    marginTop: 0,
    color: '#46617D',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  customerTimingScroll: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
  },
  customerTimingScrollContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  customerTimingRoleGroup: {
    gap: 7,
  },
  customerTimingRoleHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    gap: 8,
  },
  customerTimingRoleIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#C7D9FF',
  },
  customerTimingRoleTitle: {
    flex: 1,
    color: '#0F172A',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.85,
  },
  customerTimingRoleCountBadge: {
    minWidth: 28,
    height: 23,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerTimingRoleCountText: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '600',
  },
  customerTimingRoleServices: {
    gap: 8,
  },
  customerTimingServiceCard: {
    borderRadius: 14,
    padding: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 0,
    ...Platform.select({
      web: {
        boxShadow: 'none',
      } as any,
    }),
  },
  customerTimingServiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerTimingServiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerTimingServiceName: {
    color: '#0F172A',
    fontSize: 14.5,
    lineHeight: 18.5,
    fontWeight: '600',
  },
  customerTimingServiceDefaultRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  customerTimingServiceDefaultChip: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerTimingServiceDefault: {
    color: '#64748B',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
  },
  customerTimingStandardBadge: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerTimingStandardText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  customerTimingCustomizedBadge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  customerTimingCustomizedText: {
    color: '#1D4ED8',
  },
  customerTimingStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  customerTimingStatusDotCustomized: {
    backgroundColor: '#2563EB',
  },
  customerTimingControlsLayout: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  customerTimingControlsLayoutPhased: {
    flexDirection: 'column',
  },
  customerTimingControlsLayoutCompact: {
    flexDirection: 'column',
  },
  customerTimingControlCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
  },
  customerTimingDurationControl: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
  },
  customerTimingPriceControl: {
    backgroundColor: '#EEF4FF',
    borderColor: '#D3E1F8',
  },
  customerTimingControlCardCustomDuration: {
    backgroundColor: '#E9FFFA',
    borderColor: '#2DD4BF',
  },
  customerTimingControlCardCustomPrice: {
    backgroundColor: '#E6EFFF',
    borderColor: '#7FA7EA',
  },
  customerTimingControlTap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  customerTimingControlMiniIcon: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.13)',
  },
  customerTimingControlMiniIconPrice: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(54,93,145,0.13)',
  },
  customerTimingControlCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerTimingControlLabel: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  customerTimingControlValue: {
    marginTop: 2,
    color: '#0F766E',
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  customerTimingControlValuePrice: {
    marginTop: 2,
    color: '#2355A1',
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  customerTimingControlReset: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 1,
    borderLeftColor: '#FECACA',
  },
  customerTimingPhasePanel: {
    width: '100%',
    borderRadius: 12,
    padding: 9,
    backgroundColor: '#F7F4FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  customerTimingControlHeadingRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customerTimingControlHeadingCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  customerTimingControlHeading: {
    color: '#5B21B6',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  customerTimingInlineReset: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  customerTimingInlineResetText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '600',
  },
  customerTimingPhasesRow: {
    marginTop: 7,
    flexDirection: 'row',
    gap: 6,
  },
  customerTimingPhaseButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  customerTimingPhaseLabel: {
    color: '#6D28D9',
    fontSize: 10,
    fontWeight: '600',
  },
  customerTimingPhaseValue: {
    marginTop: 2,
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '600',
  },
  customerTimingFooter: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EEF6',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -5 },
    elevation: 0,
  },
  customerTimingAutosaveNote: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  customerTimingAutosaveText: {
    flexShrink: 1,
    color: '#64748B',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  customerTimingDoneButton: {
    minWidth: 124,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  customerTimingDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  customerEditorModalCardCentered: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderRadius: 28,
  },
  customerEditorModalCardKeyboardOpen: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    maxWidth: 560,
    borderRadius: 26,
  },
  customerEditorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  customerEditorHeaderRowWeb: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.20)',
  },
  customerEditorHeaderRowKeyboardOpen: {
    alignItems: 'center',
    marginBottom: 10,
  },
  customerEditorHeaderTextWrap: {
    flex: 1,
    paddingTop: 2,
  },
  customerEditorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111111',
  },
  customerEditorTitleKeyboardOpen: {
    fontSize: 20,
    lineHeight: 23,
  },
  customerEditorSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: '#64748B',
  },
  customerEditorSubtitleKeyboardOpen: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
  },
  customerEditorCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 0,
    borderColor: '#FECACA',
  },
  customerEditorCloseButtonKeyboardOpen: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  customerEditorCloseButtonText: {
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '700',
    color: '#52677E',
    marginTop: -1,
  },
  customerEditorScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  customerEditorScrollContent: {
    paddingBottom: 14,
  },
  customerEditorScrollContentWeb: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  customerEditorFieldsWrap: {
    marginTop: 2,
  },
  customerEditorFieldsWrapWeb: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '100%',
    flexShrink: 1,
    alignSelf: 'center',
  },
  customerEditorInput: {
    maxWidth: 600,
    minHeight: 46,
    paddingVertical: 9,
    marginBottom: 7,
  },
  customerEditorInputWeb: {
    marginTop: 8,
    marginBottom: 10,
  },
  customerEditorInputKeyboardOpen: {
    minHeight: 46,
    paddingVertical: 8,
    marginBottom: 6,
    borderRadius: 15,
  },
  customerEditorFooter: {
    flexShrink: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: '#FFFFFF',
  },
  customerEditorFooterWeb: {
    paddingTop: 18,
    paddingHorizontal: 8,
  },
  customerEditorFooterKeyboardOpen: {
    paddingTop: 9,
  },
  customerOnlinePolicyCard: {
    minHeight: 48,
    marginTop: 8,
    alignSelf: 'center',
    width: '94%',
    maxWidth: 410,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D8FF',
    backgroundColor: '#F7FAFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  customerOnlinePolicyCardDesktop: {
    ...Platform.select({
      web: {
        width: '100%',
        maxWidth: '100%',
        minHeight: 42,
        marginTop: 0,
        alignSelf: 'stretch',
        borderRadius: 13,
        paddingHorizontal: 7,
        paddingVertical: 5,
        gap: 5,
      } as any,
    }),
  },
  customerOnlinePolicyCardNative: {
    width: '98%',
    maxWidth: 440,
    minHeight: 54,
    paddingHorizontal: 10,
    gap: 8,
  },
  customerOnlinePolicyLeading: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  customerOnlinePolicyLeadingDesktop: {
    ...Platform.select({
      web: {
        display: 'none',
      } as any,
    }),
  },
  customerOnlinePolicyIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EFFF',
  },
  customerOnlinePolicyCopy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerOnlinePolicyTitle: {
    width: '100%',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  customerOnlinePolicyTitleNative: {
    fontSize: 14,
    lineHeight: 17,
  },
  customerOnlinePolicyStatus: {
    width: '100%',
    marginTop: 0,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    color: '#5B6B82',
    textAlign: 'center',
  },
  customerOnlinePolicyStatusNative: {
    fontSize: 11,
    lineHeight: 14,
  },
  customerOnlinePolicyTrailing: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  customerOnlinePolicyCount: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  customerOnlinePolicyCountDesktop: {
    ...Platform.select({
      web: {
        minWidth: 26,
        height: 26,
        paddingHorizontal: 4,
        borderRadius: 13,
      } as any,
    }),
  },
  customerOnlinePolicyCountNative: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 6,
    borderRadius: 17,
  },
  customerOnlinePolicyCountActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  customerOnlinePolicyCountOffline: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  customerOnlinePolicyCountText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#B91C1C',
  },
  customerOnlinePolicyCountTextNative: {
    fontSize: 11.5,
  },
  customerOnlinePolicyCountActiveText: {
    color: '#15803D',
  },
  onlinePolicyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 24, paddingBottom: 0 },
  onlinePolicySheet: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 0,
  },
  onlinePolicyHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EDF5',
  },
  onlinePolicyHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3F8',
  },
  onlinePolicyHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlinePolicyEyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '600',
    color: '#2563EB',
  },
  onlinePolicyTitle: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: '#0F172A',
  },
  onlinePolicySubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  onlinePolicyClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 0,
    borderColor: '#FECACA',
  },
  onlinePolicyScroll: {
    flexShrink: 1,
  },
  onlinePolicyScrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 22,
  },
  onlinePolicySection: {
    borderRadius: 23,
    padding: 14,
    gap: 13,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#DCE7F5',
  },
  onlinePolicySectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  onlinePolicySectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EFFF',
  },
  onlinePolicySectionHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlinePolicySectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: '#0F172A',
  },
  onlinePolicySectionHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: '#64748B',
  },
  onlinePolicyModeList: {
    gap: 9,
  },
  onlinePolicyModeOption: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    backgroundColor: '#FFFFFF',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onlinePolicyModeOptionSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  onlinePolicyModeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
  },
  onlinePolicyModeIconSelected: {
    backgroundColor: '#2563EB',
  },
  onlinePolicyModeCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlinePolicyModeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  onlinePolicyModeTitleSelected: {
    color: '#FFFFFF',
  },
  onlinePolicyModeDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  onlinePolicyModeDescriptionSelected: {
    color: '#CBD5E1',
  },
  onlinePolicyRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#AAB8C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlinePolicyRadioSelected: {
    borderColor: '#60A5FA',
  },
  onlinePolicyRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60A5FA',
  },
  onlinePolicyCompositionNote: {
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F0FF',
    borderWidth: 1,
    borderColor: '#DDD0FF',
  },
  onlinePolicyCompositionNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#5B21B6',
  },
  onlinePolicyServiceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  onlinePolicyServiceRuleNote: {
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  onlinePolicyServiceRuleNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  onlinePolicyBlockedCount: {
    minWidth: 54,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  onlinePolicyBlockedCountValue: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
    color: '#B91C1C',
  },
  onlinePolicyBlockedCountLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#B91C1C',
  },
  onlinePolicyBulkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  onlinePolicyBulkAllow: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 9,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  onlinePolicyBulkAllowText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  onlinePolicyBulkBlock: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 9,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  onlinePolicyBulkBlockText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
  },
  onlinePolicySearchWrap: {
    minHeight: 48,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DEE9',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlinePolicySearchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  onlinePolicySearchClear: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlinePolicyGroups: {
    gap: 12,
  },
  onlinePolicyGroup: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0,
    ...Platform.select({
      web: {
        boxShadow:
          '0 11px 24px rgba(15,23,42,0.09), inset 0 1px 0 rgba(255,255,255,0.72)',
      } as any,
    }),
  },
  onlinePolicyGroupHeader: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F7FC',
  },
  onlinePolicyGroupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  onlinePolicyGroupTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  onlinePolicyGroupCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  onlinePolicyServiceRow: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#DCEAF4',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  onlinePolicyServiceRowBlocked: {
    backgroundColor: '#FFF7F7',
  },
  onlinePolicyServiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlinePolicyServiceName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  onlinePolicyServiceMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  onlinePolicyServiceMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  onlinePolicyCompositionBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F0FF',
  },
  onlinePolicyCompositionBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6D28D9',
  },
  onlinePolicyInheritedBlockBadge: {
    maxWidth: '100%',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7E6',
  },
  onlinePolicyInheritedBlockBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#B45309',
  },
  onlinePolicyRepeatRule: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onlinePolicyRepeatRuleActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  onlinePolicyRepeatRuleCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlinePolicyRepeatRuleTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  onlinePolicyRepeatRuleDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  onlinePolicyToggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: '#CBD5E1',
  },
  onlinePolicyToggleAllowed: {
    backgroundColor: '#10B981',
  },
  onlinePolicyToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  onlinePolicyToggleThumbAllowed: {
    alignSelf: 'flex-end',
  },
  onlinePolicyEmpty: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  onlinePolicyEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  onlinePolicyFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E6EDF5',
    backgroundColor: '#FFFFFF',
  },
  onlinePolicyError: {
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  onlinePolicyErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#B91C1C',
  },
  onlinePolicyFooterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  onlinePolicyCancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D9E3EF',
  },
  onlinePolicyCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  onlinePolicySave: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
  },
  onlinePolicySaveDisabled: {
    opacity: 0.58,
  },
  onlinePolicySaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  limitConfigBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 28, paddingBottom: 0 },
  limitConfigDismissArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  limitConfigSheet: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 2,
    elevation: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D9E3EF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    maxHeight: '86%',
  },
  limitConfigScrollContent: {
    gap: 14,
  },
  limitConfigHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  limitConfigHeaderSpacer: {
    width: 44,
    height: 44,
  },
  limitConfigTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    flex: 1,
  },
  limitConfigCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  limitConfigDescription: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  limitConfigSummaryRow: {
    gap: 10,
  },
  limitConfigSummaryChip: {
    position: 'relative',
    zIndex: 3,
    elevation: 1,
    minHeight: 52,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#C7D8FF',
  },
  limitConfigSummaryChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  limitConfigSummaryChipText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1D4ED8',
    textAlign: 'center',
  },
  limitConfigSummaryChipTextActive: {
    color: '#FFFFFF',
  },
  limitConfigSection: {
    backgroundColor: '#F8FBFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DCE7F5',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  limitConfigSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  limitConfigSectionHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  limitConfigOption: {
    position: 'relative',
    zIndex: 3,
    elevation: 1,
    backgroundColor: '#F3F7FC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#D4DEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitConfigOptionActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  limitConfigOptionText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
  },
  limitConfigOptionTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: IS_ANDROID ? 20 : 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    borderWidth: 0,
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    textAlign: 'center',
  },
});

const styles = baseCustomerStyles;
