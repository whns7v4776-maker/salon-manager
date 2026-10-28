import { OwnerNativeSidebar } from '../../components/owner-native-sidebar';
import { OwnerViewportContext, useOwnerViewport } from '../../src/context/OwnerViewportContext';
import { useOwnerNativeNavigation } from '../../src/lib/use-owner-native-navigation';
import { OwnerWebBackdrop } from '../../components/owner-web-backdrop';
import { OwnerWebPageSkeleton } from '../../components/owner-web-page-skeleton';
import { BlurView } from 'expo-blur';
import { NativeHomeBackdrop } from '../../components/owner-premium-native-home';
import { nativeBarStyles } from '../../components/owner-premium-native-style';
import { premiumNotificationBannerTone } from '../../components/premium-notification-banner';
import { AccessAppearanceProvider, useAccessAppearance } from '../../components/access-premium';
import { OWNER_RAIL_WIDTH, OwnerPremiumSidebar, OwnerPremiumCompactAppearance } from '../../components/owner-premium-web';
import { buildOwnerWebEventKey } from '../../src/lib/push/owner-web-event-key';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBarProps,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import {
  ParamListBase,
  TabActions,
  TabNavigationState,
} from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useRouter, useSegments, withLayoutContext } from "expo-router";
import React from "react";
import { Animated as RNAnimated, AppState, type AppStateStatus, Keyboard, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HapticNativePressable as Pressable } from '../../components/ui/haptic-native-controls';
import { AndroidTabBarSurface } from '../../components/ui/android-tab-bar-surface';
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOutUp,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useAppContext } from "../../src/context/AppContext";
import { OwnerStartupLoadingProvider } from "../../src/context/OwnerStartupLoadingContext";
import { TabSwipeLockProvider } from "../../src/context/TabSwipeLockContext";
import { useUnreadBadges } from "../../src/context/UnreadBadgeContext";
import { buildOwnerViewedRequestSignature } from "../../src/lib/badges/owner-accepted-request-read";
import { resolveBookingRequestAutoAccept } from "../../src/lib/customer-online-booking-policy";
import { tApp } from "../../src/lib/i18n";
import { playOwnerForegroundBannerSound } from "../../src/lib/push/push-notifications";
import {
  subscribeOwnerForegroundBannerPush,
  type OwnerForegroundBannerPushEvent,
} from "../../src/lib/push/owner-foreground-banner-events";
import {
  clearApplicationBadgeCountFloor,
  setApplicationBadgeCountFloor,
  syncApplicationBadgeCount,
  subscribeOwnerViewedNotificationChanges,
} from "../../src/lib/notification-badge-sync";
import { showWebNotification } from "../../src/lib/push/web-notifications";
import { SALON_MODULES, SalonModuleKey } from "../../src/lib/salon-modules";

const MaterialTopTabs = createMaterialTopTabNavigator();
type VisibleOwnerTabKey = SalonModuleKey;
const VISIBLE_OWNER_TAB_KEYS: VisibleOwnerTabKey[] = [
  "index",
  "agenda",
  "prenotazioni",
  "clienti",
  "cassa",
  "servizi",
  "settings",
];
const isVisibleOwnerTabKey = (value: string): value is VisibleOwnerTabKey =>
  VISIBLE_OWNER_TAB_KEYS.includes(value as VisibleOwnerTabKey);

const ExpoRouterMaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof MaterialTopTabs.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(
  MaterialTopTabs.Navigator,
  (screens) => screens,
  Platform.OS !== "web",
);

const IS_ANDROID = Platform.OS === "android";
// Android loads heavy scenes on demand and retains their React state.
const IS_IOS = Platform.OS === "ios";
const IS_WEB = Platform.OS === "web";
// Rimane valido per tutta la sessione JavaScript: un remount delle tab al
// ritorno dal background non deve riattivare lo skeleton del cold start.
let nativeOwnerColdStartTabsSettled = false;
const getCustomBarNavPerfNow = () =>
  globalThis.performance?.now?.() ?? Date.now();
const getAndroidTouchPerfNow = () =>
  globalThis.performance?.now?.() ?? Date.now();
const getIosTabPerfNow = () => globalThis.performance?.now?.() ?? Date.now();
const logIosBackofficeTabPerf = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  if (__DEV__ && IS_IOS) {
    const diagnostics = globalThis as typeof globalThis & {
      __salonTabTiming?: Array<Record<string, unknown>>;
    };
    const records = diagnostics.__salonTabTiming ?? (diagnostics.__salonTabTiming = []);
    records.push({ event, at: getIosTabPerfNow(), ...payload });
    if (records.length > 120) records.splice(0, records.length - 120);
  }
};
const logAndroidTouchPerfAudit = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const logAndroidBackofficeTabPerf = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const logCustomBarNavPerf = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const TAB_BAR_OUTER_BOTTOM_IOS = 26;
const ANDROID_TAB_BAR_SAFE_GAP = 10;
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;
const OWNER_AUTO_ACCEPT_DELAY_MS = 15000;
// Auto-accept is decided and executed only by the authoritative server policy.
// A device-local fallback can retain a stale preference across a bundle reload
// and accept a manual request without an owner action.
const OWNER_AUTO_ACCEPT_CLIENT_FALLBACK_ENABLED = false;
const OWNER_LIVE_REQUEST_BANNER_DURATION_MS = 5000;
const OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS = 10000;
const ANDROID_OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS = 60000;
const OWNER_CANCELLATION_PUSH_COALESCE_MS = 380;
const ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS = 15000;
const WEB_AUTO_ACCEPT_VISUAL_STATE_MS = ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS;

const AndroidLazyTabPlaceholder = React.memo(function AndroidLazyTabPlaceholder() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.androidLazyTabPlaceholder}
    >
      <View style={styles.androidLazyTabPlaceholderHero} />
      <View style={styles.androidLazyTabPlaceholderTitle} />
      <View style={styles.androidLazyTabPlaceholderCard} />
      <View style={styles.androidLazyTabPlaceholderCard} />
    </View>
  );
});

const renderAndroidLazyTabPlaceholder = () => <AndroidLazyTabPlaceholder />;
const buildOwnerPendingBannerShownStorageKey = (email?: string | null) =>
  `salon_manager_owner_pending_banner_shown_keys__${(email ?? "").trim().toLowerCase()}`;
const OWNER_RECENTLY_HANDLED_REQUEST_TTL_MS = 10 * 60 * 1000;
const OWNER_LIVE_REQUEST_BANNER_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS = 5 * 60 * 1000;
const logAndroidBackofficeAutoacceptNotif = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const logBackofficeForegroundParity = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const logAndroidAutoacceptVisualFlow = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
type OwnerBookingRequestItem = ReturnType<
  typeof useAppContext
>["richiestePrenotazione"][number];
const collapseOwnerLogicalBookingEvents = (
  items: OwnerBookingRequestItem[],
) => {
  const logicalItems = new Map<string, OwnerBookingRequestItem>();

  items.forEach((item) => {
    const groupId = item.appointmentGroupId?.trim();
    const requestId = item.id?.trim();
    const key = groupId
      ? `group:${groupId}`
      : requestId
        ? `request:${requestId}`
        : "";
    if (key && !logicalItems.has(key)) {
      logicalItems.set(key, item);
    }
  });

  return Array.from(logicalItems.values());
};
const countOwnerLogicalBookingEvents = (items: OwnerBookingRequestItem[]) =>
  collapseOwnerLogicalBookingEvents(items).length;
const shouldSuppressNativeSinglePendingBatchBanner = (
  items: OwnerBookingRequestItem[],
) => {
  if (IS_WEB || items.length === 0) {
    return false;
  }

  const logicalItems = collapseOwnerLogicalBookingEvents(items);
  return (
    logicalItems.length === 1 &&
    logicalItems.every(
      (item) =>
        item.stato === "In attesa" && !isCustomerCancellationRequestEvent(item),
    )
  );
};
const buildOwnerCustomerCancellationClaimKeys = (item: {
  id?: string | null;
  appointmentGroupId?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) => {
  const keys: string[] = [];
  const groupId = item.appointmentGroupId?.trim() ?? "";
  const requestId = item.id?.trim() ?? "";

  if (groupId) {
    keys.push(`group:${groupId}`);
  }
  if (requestId) {
    keys.push(`request:${requestId}`);
  }
  if (keys.length === 0) {
    const fallbackKey = buildFrontendRequestBaseSyncKey(item);
    if (fallbackKey) {
      keys.push(`slot:${fallbackKey}`);
    }
  }

  return keys;
};
const buildOwnerLiveRequestBatchSummary = (
  items: OwnerBookingRequestItem[],
) => {
  const logicalItems = collapseOwnerLogicalBookingEvents(items);
  const total = logicalItems.length;
  const cancellations = logicalItems.filter(
    isCustomerCancellationRequestEvent,
  ).length;
  const accepted = logicalItems.filter(
    (item) =>
      item.stato === "Accettata" && !isCustomerCancellationRequestEvent(item),
  ).length;
  const pending = Math.max(0, total - cancellations - accepted);
  const parts = [
    pending > 0 ? `${pending} nuove` : null,
    accepted > 0 ? `${accepted} auto-accettate` : null,
    cancellations > 0 ? `${cancellations} annullate` : null,
  ].filter(Boolean);
  const latest = logicalItems[0] ?? null;
  const latestService = latest?.servizio?.trim() ?? "";
  const latestDateTime = latest
    ? formatOwnerPushDateTimeLabel(latest.data, latest.ora)
    : "";

  return {
    title:
      cancellations === total
        ? `${total} richieste annullate`
        : pending === total
          ? `${total} nuove richieste`
          : `${total} aggiornamenti prenotazioni`,
    body: [
      parts.length > 0
        ? parts.join(" · ")
        : `${total} aggiornamenti dal frontend`,
      latestService ? `Ultima: ${latestService}` : null,
      latestDateTime ? latestDateTime : null,
    ]
      .filter(Boolean)
      .join(". "),
    targetTab:
      cancellations === total ? ("prenotazioni" as const) : ("agenda" as const),
    targetSection: cancellations === total ? ("cancelled" as const) : null,
  };
};
const buildViewedRequestSignature = buildOwnerViewedRequestSignature;
const formatOwnerPushDateLabel = (dateValue?: string | null) => {
  const normalizedDate = dateValue?.trim() ?? "";
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return normalizedDate;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
};
const formatOwnerPushDateTimeLabel = (
  dateValue?: string | null,
  timeValue?: string | null,
) => {
  const normalizedDate = formatOwnerPushDateLabel(dateValue);
  const normalizedTime = timeValue?.trim() ?? "";

  if (normalizedDate && normalizedTime) {
    return `${normalizedDate} alle ${normalizedTime}`;
  }

  return normalizedDate || normalizedTime || "dettaglio non disponibile";
};
const normalizeOwnerNotificationText = (value?: string | null) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeOwnerCancellationSource = (value?: string | null) =>
  normalizeOwnerNotificationText(value);
const isOwnerCustomerCancellationSource = (value?: string | null) => {
  const normalized = normalizeOwnerCancellationSource(value);
  return normalized === "cliente" || normalized === "customer";
};
const normalizeFrontendIdentityText = (value?: string | null) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeFrontendIdentityPhone = (value?: string | null) =>
  (value ?? "").replace(/\D+/g, "");
const buildFrontendRequestSyncKey = (item: {
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) =>
  [
    item.data ?? "",
    item.ora ?? "",
    item.servizio ?? "",
    `${item.nome ?? ""} ${item.cognome ?? ""}`.trim(),
  ]
    .map((value) => normalizeFrontendIdentityText(value))
    .join("|");
const buildFrontendRequestBaseSyncKey = (item: {
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) =>
  [
    item.data ?? "",
    item.ora ?? "",
    item.servizio ?? "",
    `${item.nome ?? ""} ${item.cognome ?? ""}`.trim(),
  ]
    .map((value) => normalizeFrontendIdentityText(value))
    .join("|");
const buildFrontendRequestCanonicalKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) => {
  const normalizedId = normalizeFrontendIdentityText(item.id);
  if (normalizedId) {
    return `id:${normalizedId}`;
  }

  return buildFrontendRequestBaseSyncKey(item);
};
const buildLiveRequestBannerEventKey = (item: {
  appointmentGroupId?: string | null;
  operatorChangeRespondedAt?: string | null;
  operatorChangeStatus?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
  createdAt?: string | null;
}) =>
  IS_WEB ? buildOwnerWebEventKey(item, buildFrontendRequestBaseSyncKey(item)) :
  [
    buildFrontendRequestSyncKey(item),
    item.stato ?? "unknown",
    item.cancellationSource ?? "none",
    String(item.createdAt ?? "").trim() || "no-created-at",
  ].join("::");
const buildOwnerPendingRequestTimerKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  createdAt?: string | null;
}) => buildFrontendRequestBaseSyncKey(item);
const buildOwnerPendingRequestInstanceKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  createdAt?: string | null;
  stato?: string | null;
}) =>
  [
    buildOwnerPendingRequestTimerKey(item),
    String(item.id ?? "").trim() || "no-id",
    String(item.createdAt ?? "").trim() || "no-created-at",
    String(item.stato ?? "").trim() || "no-status",
  ].join("::");
const buildOwnerForegroundStableBannerKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  createdAt?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
}) =>
  item.stato === "Annullata" &&
  isOwnerCustomerCancellationSource(item.cancellationSource)
    ? [
        buildFrontendRequestBaseSyncKey(item),
        item.stato ?? "unknown",
        item.cancellationSource ?? "none",
        String(item.createdAt ?? "").trim() || "no-created-at",
      ].join("::")
    : [
        buildOwnerPendingRequestTimerKey(item),
        String(item.id ?? "").trim() || "no-id",
        String(item.createdAt ?? "").trim() || "no-created-at",
      ].join("::");
const isCustomerCancellationRequestEvent = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) =>
  item.stato === "Annullata" &&
  isOwnerCustomerCancellationSource(item.cancellationSource);
const isResolvedOperatorChangeResponseEvent = (item: {
  operatorChangeStatus?: string | null;
  operatorChangeRespondedAt?: string | null;
}) =>
  !!String(item.operatorChangeRespondedAt ?? "").trim() &&
  (item.operatorChangeStatus === "accepted" ||
    item.operatorChangeStatus === "rejected" ||
    item.operatorChangeStatus === "expired");
const buildOwnerLiveRequestStatusMarker = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) => [item.stato ?? "unknown", item.cancellationSource ?? "none"].join(":");
const buildOwnerLiveBannerTimerKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
  createdAt?: string | null;
}) =>
  isCustomerCancellationRequestEvent(item)
    ? buildLiveRequestBannerEventKey(item)
    : buildOwnerPendingRequestTimerKey(item);
const buildOwnerLiveBannerShownKey = (item: {
  id?: string | null;
  appointmentGroupId?: string | null;
  operatorChangeRespondedAt?: string | null;
  operatorChangeStatus?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
  createdAt?: string | null;
}) =>
  IS_WEB ? buildOwnerWebEventKey(item, buildFrontendRequestBaseSyncKey(item)) :
  !isCustomerCancellationRequestEvent(item)
    ? IS_ANDROID
      ? [
          buildOwnerPendingRequestInstanceKey(item),
          item.stato === "Accettata" ? "accepted" : "pending",
        ].join("::")
      : buildOwnerPendingRequestInstanceKey(item)
    : [
        buildFrontendRequestBaseSyncKey(item),
        item.stato ?? "unknown",
        item.cancellationSource ?? "none",
      ].join("::");
const isOwnerLiveBannerEligibleRequestEvent = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) =>
  item.stato === "In attesa" ||
  (IS_ANDROID && item.stato === "Accettata") ||
  isCustomerCancellationRequestEvent(item);
const isOwnerCountableRequestNotification = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
  operatorChangeStatus?: string | null;
  operatorChangeRespondedAt?: string | null;
}) =>
  item.stato === "In attesa" ||
  item.stato === "Accettata" ||
  isResolvedOperatorChangeResponseEvent(item) ||
  isCustomerCancellationRequestEvent(item);
const getFrontendRequestDisplayStatusRank = (item: {
  stato?: "In attesa" | "Accettata" | "Rifiutata" | "Annullata";
  cancellationSource?: string | null;
}) => {
  switch (item.stato) {
    case "Annullata":
      return isOwnerCustomerCancellationSource(item.cancellationSource)
        ? 50
        : 15;
    case "Accettata":
      return 40;
    case "In attesa":
      return 30;
    case "Rifiutata":
      return 10;
    default:
      return 0;
  }
};
const compareFrontendRequestDisplayPriority = <
  T extends {
    id?: string | null;
    stato?: "In attesa" | "Accettata" | "Rifiutata" | "Annullata";
    cancellationSource?: string | null;
    createdAt?: string | null;
  },
>(
  left: T,
  right: T,
) => {
  const leftIsCustomerCancellation = isCustomerCancellationRequestEvent(left);
  const rightIsCustomerCancellation = isCustomerCancellationRequestEvent(right);
  if (leftIsCustomerCancellation !== rightIsCustomerCancellation) {
    return leftIsCustomerCancellation ? 1 : -1;
  }

  const leftCreatedAt = Date.parse(String(left.createdAt ?? "").trim()) || 0;
  const rightCreatedAt = Date.parse(String(right.createdAt ?? "").trim()) || 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  const statusDiff =
    getFrontendRequestDisplayStatusRank(left) -
    getFrontendRequestDisplayStatusRank(right);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
};

const matchesOwnerNotificationCustomerName = (
  appointmentCustomerName?: string | null,
  requestNome?: string | null,
  requestCognome?: string | null,
) => {
  const normalizedAppointmentName = normalizeOwnerNotificationText(
    appointmentCustomerName,
  );
  const normalizedRequestName = normalizeOwnerNotificationText(
    [requestNome, requestCognome].filter(Boolean).join(" "),
  );

  return (
    !!normalizedAppointmentName &&
    normalizedAppointmentName === normalizedRequestName
  );
};

const isOwnerRelevantFrontendRequestValue = (
  item: {
    origine?: "frontend" | "backoffice";
    stato?: "In attesa" | "Accettata" | "Rifiutata" | "Annullata";
    cancellationSource?: string | null;
    operatorChangeStatus?: string | null;
    operatorChangeRespondedAt?: string | null;
  },
  options: {
    isDeletedFrontendRequest: (item: any) => boolean;
    isSupersededCustomerCancellation: (item: any) => boolean;
  },
) =>
  (((item.origine ?? "frontend") === "frontend" &&
    item.stato === "In attesa") ||
    ((item.origine ?? "frontend") === "frontend" &&
      item.stato === "Accettata") ||
    isResolvedOperatorChangeResponseEvent(item) ||
    (item.stato === "Annullata" &&
      isOwnerCustomerCancellationSource(item.cancellationSource))) &&
  !options.isDeletedFrontendRequest(item) &&
  !options.isSupersededCustomerCancellation(item);

const parseOwnerLiveRequestBannerTimestamp = (item: {
  createdAt?: string | null;
  operatorChangeStatus?: string | null;
  operatorChangeRespondedAt?: string | null;
  data?: string | null;
  ora?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  const operatorChangeRespondedAt = String(
    item.operatorChangeRespondedAt ?? "",
  ).trim();
  if (
    operatorChangeRespondedAt &&
    item.operatorChangeStatus &&
    item.operatorChangeStatus !== "pending"
  ) {
    const parsedRespondedAt = Date.parse(operatorChangeRespondedAt);
    if (Number.isFinite(parsedRespondedAt)) {
      return parsedRespondedAt;
    }
  }

  const createdAt = String(item.createdAt ?? "").trim();
  if (createdAt) {
    const parsedCreatedAt = Date.parse(createdAt);
    if (Number.isFinite(parsedCreatedAt)) {
      return parsedCreatedAt;
    }
  }

  const isCustomerCancellation = isCustomerCancellationRequestEvent(item);
  if (!isCustomerCancellation) {
    return null;
  }

  const requestDate = String(item.data ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) {
    return null;
  }

  const requestTime = String(item.ora ?? "").trim();
  const normalizedTime = /^\d{2}:\d{2}$/.test(requestTime)
    ? requestTime
    : "00:00";
  const parsedRequestDate = Date.parse(`${requestDate}T${normalizedTime}:00`);

  return Number.isFinite(parsedRequestDate) ? parsedRequestDate : null;
};

const buildFrontendClientIdentityKey = (item: {
  id?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
}) => {
  const normalizedEmail = (item.email ?? "").trim().toLowerCase();
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedPhone = (item.telefono ?? "").replace(/\D+/g, "");
  if (normalizedPhone) return `phone:${normalizedPhone}`;

  const normalizedName = (item.nome ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (normalizedName) return `name:${normalizedName}`;

  return `id:${(item.id ?? "").trim()}`;
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
        buildFrontendClientIdentityKey(item),
        normalizeFrontendIdentityPhone(item.telefono)
          ? `phone:${normalizeFrontendIdentityPhone(item.telefono)}`
          : "",
        normalizeFrontendIdentityText(item.email)
          ? `email:${normalizeFrontendIdentityText(item.email)}`
          : "",
        normalizeFrontendIdentityText(item.nome)
          ? `name:${normalizeFrontendIdentityText(item.nome)}`
          : "",
        normalizeFrontendIdentityText(item.id)
          ? `id:${normalizeFrontendIdentityText(item.id)}`
          : "",
      ].filter(Boolean),
    ),
  );
const buildDeletedCustomerStorageKey = (email?: string | null) =>
  `salon_manager_recently_deleted_customers__${(email ?? "").trim().toLowerCase()}`;

type TabBarItemVisualProps = {
  index: number;
  label: string;
  activeIconName: React.ComponentProps<typeof Ionicons>["name"];
  inactiveIconName: React.ComponentProps<typeof Ionicons>["name"];
  tabIconSize: number;
  tabLabelFontSize: number;
  tabLabelMinScale: number;
  badgeCount?: number;
  badgePulseActive?: boolean;
  pagerPositionSV: SharedValue<number>;
  isBarDraggingSV: SharedValue<number>;
  previewIndexSV: SharedValue<number>;
  instantSelectionActiveSV: SharedValue<number>;
  nativePagerPosition:
    RNAnimated.Value | RNAnimated.AnimatedInterpolation<number>;
  useNativePagerHighlight: boolean;
};

function TabBarItemVisual({
  index,
  label,
  activeIconName,
  inactiveIconName,
  tabIconSize,
  tabLabelFontSize,
  tabLabelMinScale,
  badgeCount = 0,
  badgePulseActive = false,
  pagerPositionSV,
  isBarDraggingSV,
  previewIndexSV,
  instantSelectionActiveSV,
  nativePagerPosition,
  useNativePagerHighlight,
}: TabBarItemVisualProps) {
  const {palette:barPalette}=useAccessAppearance();
  const {width:barViewportWidth}=useWindowDimensions();
  const compactWebBar=IS_WEB && barViewportWidth<1000;
  const styles=React.useMemo(()=>nativeBarStyles(baseTabStyles,barPalette,compactWebBar),[barPalette,compactWebBar]);
  const activeLayerStyle = useAnimatedStyle(() => {
    const progress = isBarDraggingSV.value
      ? previewIndexSV.value === index
        ? 1
        : 0
      : interpolate(
          pagerPositionSV.value,
          [index - 1, index, index + 1],
          [0, 1, 0],
          Extrapolation.CLAMP,
        );

    return {
      opacity: progress,
      transform: [{ scale: 1.03 }],
    };
  });

  const inactiveLayerStyle = useAnimatedStyle(() => {
    const progress = isBarDraggingSV.value
      ? previewIndexSV.value === index
        ? 0
        : 1
      : interpolate(
          pagerPositionSV.value,
          [index - 1, index, index + 1],
          [1, 0, 1],
          Extrapolation.CLAMP,
        );

    return {
      opacity: progress,
    };
  });

  const nativeActiveLayerStyle = React.useMemo(
    () => ({
      opacity: nativePagerPosition.interpolate({
        inputRange: [index - 1, index, index + 1],
        outputRange: [0, 1, 0],
        extrapolate: "clamp",
      }),
      transform: [{ scale: 1.03 }],
    }),
    [index, nativePagerPosition],
  );

  const nativeInactiveLayerStyle = React.useMemo(
    () => ({
      opacity: nativePagerPosition.interpolate({
        inputRange: [index - 1, index, index + 1],
        outputRange: [1, 0, 1],
        extrapolate: "clamp",
      }),
    }),
    [index, nativePagerPosition],
  );

  const nativePagerVisualModeStyle = useAnimatedStyle(() => ({
    opacity:
      IS_WEB || (!isBarDraggingSV.value && !instantSelectionActiveSV.value)
        ? 1
        : 0,
  }));

  const instantSelectionVisualModeStyle = useAnimatedStyle(() => ({
    opacity:
      !IS_WEB && (isBarDraggingSV.value || instantSelectionActiveSV.value)
        ? 1
        : 0,
  }));

  return (
    <View style={styles.tabBarItemInner}>
      <Animated.View style={styles.tabBarItemContent}>
        <View {...(compactWebBar?{dataSet:{premiumBarIcon:"true"}}:{})} style={styles.tabBarIconStack}>
          {useNativePagerHighlight ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabBarVisualModeLayer,
                  nativePagerVisualModeStyle,
                ]}
              >
                <RNAnimated.View
                  style={[styles.tabBarIconLayer, nativeInactiveLayerStyle]}
                >
                  <Ionicons
                    name={inactiveIconName}
                    size={tabIconSize}
                    color={IS_WEB&&!compactWebBar?'#C0CADB':barPalette.muted}
                  />
                </RNAnimated.View>
                <RNAnimated.View
                  style={[
                    styles.tabBarIconLayer,
                    styles.tabBarIconLayerAbsolute,
                    nativeActiveLayerStyle,
                  ]}
                >
                  <Ionicons
                    name={activeIconName}
                    size={tabIconSize}
                    color={IS_WEB&&!compactWebBar?'#FFFFFF':!IS_WEB&&barPalette.night?'#FFFFFF':'#181A18'}
                  />
                </RNAnimated.View>
              </Animated.View>
              {!IS_WEB ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.tabBarVisualModeLayer,
                    instantSelectionVisualModeStyle,
                  ]}
                >
                  <Animated.View
                    style={[styles.tabBarIconLayer, inactiveLayerStyle]}
                  >
                    <Ionicons
                      name={inactiveIconName}
                      size={tabIconSize}
                      color={IS_WEB&&!compactWebBar?'#C0CADB':barPalette.muted}
                    />
                  </Animated.View>
                  <Animated.View
                    style={[
                      styles.tabBarIconLayer,
                      styles.tabBarIconLayerAbsolute,
                      activeLayerStyle,
                    ]}
                  >
                    <Ionicons
                      name={activeIconName}
                      size={tabIconSize}
                      color={IS_WEB&&!compactWebBar?'#FFFFFF':!IS_WEB&&barPalette.night?'#FFFFFF':'#181A18'}
                    />
                  </Animated.View>
                </Animated.View>
              ) : null}
            </>
          ) : (
            <>
              <Animated.View
                style={[styles.tabBarIconLayer, inactiveLayerStyle]}
              >
                <Ionicons
                  name={inactiveIconName}
                  size={tabIconSize}
                  color={IS_WEB&&!compactWebBar?'#C0CADB':barPalette.muted}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.tabBarIconLayer,
                  styles.tabBarIconLayerAbsolute,
                  activeLayerStyle,
                ]}
              >
                <Ionicons
                  name={activeIconName}
                  size={tabIconSize}
                  color={IS_WEB&&!compactWebBar?'#FFFFFF':!IS_WEB&&barPalette.night?'#FFFFFF':'#181A18'}
                />
              </Animated.View>
            </>
          )}

          {badgeCount > 0 ? (
            <View
              style={[
                styles.notificationBadge,
                badgePulseActive && styles.notificationBadgePulse,
              ]}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={styles.notificationBadgeText}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tabBarLabelStack}>
          {useNativePagerHighlight ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabBarVisualModeLayer,
                  nativePagerVisualModeStyle,
                ]}
              >
                <RNAnimated.View
                  style={[styles.tabBarLabelLayer, nativeInactiveLayerStyle]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={tabLabelMinScale}
                    style={[
                      styles.tabBarLabel,
                      { fontSize: tabLabelFontSize },
                      styles.tabBarLabelInactive,
                    ]}
                  >
                    {label}
                  </Text>
                </RNAnimated.View>
                <RNAnimated.View
                  style={[
                    styles.tabBarLabelLayer,
                    styles.tabBarLabelLayerAbsolute,
                    nativeActiveLayerStyle,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={tabLabelMinScale}
                    style={[
                      styles.tabBarLabel,
                      { fontSize: tabLabelFontSize },
                      styles.tabBarLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                </RNAnimated.View>
              </Animated.View>
              {!IS_WEB ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.tabBarVisualModeLayer,
                    instantSelectionVisualModeStyle,
                  ]}
                >
                  <Animated.View
                    style={[styles.tabBarLabelLayer, inactiveLayerStyle]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={tabLabelMinScale}
                      style={[
                        styles.tabBarLabel,
                        { fontSize: tabLabelFontSize },
                        styles.tabBarLabelInactive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Animated.View>
                  <Animated.View
                    style={[
                      styles.tabBarLabelLayer,
                      styles.tabBarLabelLayerAbsolute,
                      activeLayerStyle,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={tabLabelMinScale}
                      style={[
                        styles.tabBarLabel,
                        { fontSize: tabLabelFontSize },
                        styles.tabBarLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Animated.View>
                </Animated.View>
              ) : null}
            </>
          ) : (
            <>
              <Animated.View
                style={[styles.tabBarLabelLayer, inactiveLayerStyle]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={tabLabelMinScale}
                  style={[
                    styles.tabBarLabel,
                    { fontSize: tabLabelFontSize },
                    styles.tabBarLabelInactive,
                  ]}
                >
                  {label}
                </Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.tabBarLabelLayer,
                  styles.tabBarLabelLayerAbsolute,
                  activeLayerStyle,
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={tabLabelMinScale}
                  style={[
                    styles.tabBarLabel,
                    { fontSize: tabLabelFontSize },
                    styles.tabBarLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Animated.View>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

type BottomTabBarProps = MaterialTopTabBarProps & {
  onPagerMotionChange?: (moving: boolean) => void;
};

function BottomTabBar({
  state,
  descriptors,
  navigation,
  position,
  jumpTo,
  onPagerMotionChange,
}: BottomTabBarProps) {
  const nativeViewport = useOwnerViewport();
  const {palette:barPalette}=useAccessAppearance();
  const notificationBannerTone=premiumNotificationBannerTone(barPalette.night);
  const {width:barViewportWidth}=useWindowDimensions();
  const compactWebBar=IS_WEB && barViewportWidth<1000;
  const styles=React.useMemo(()=>nativeBarStyles(baseTabStyles,barPalette,compactWebBar),[barPalette,compactWebBar]);
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const {
    appuntamenti,
    richiestePrenotazione,
    clienti,
    salonWorkspace,
    appLanguage,
    salonAccountEmail,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    updateBookingRequestStatusForSalon,
  } = useAppContext();
  const { unreadCountsBySection, refreshBadges } = useUnreadBadges();
  const isOwnerRequestAutoAcceptEnabled = React.useCallback(
    (request: (typeof richiestePrenotazione)[number]) =>
      resolveBookingRequestAutoAccept({
        salonAutoAccept: salonWorkspace.autoAcceptBookingRequests === true,
        customers: clienti,
        request,
      }),
    [clienti, salonWorkspace.autoAcceptBookingRequests],
  );

  const [viewedRequestIds, setViewedRequestIds] = React.useState<string[]>([]);
  const [hasLoadedViewedRequestIds, setHasLoadedViewedRequestIds] =
    React.useState(false);
  const [deletedCustomerIdentityKeys, setDeletedCustomerIdentityKeys] =
    React.useState<string[]>([]);
  const [
    hasLoadedDeletedCustomerIdentityKeys,
    setHasLoadedDeletedCustomerIdentityKeys,
  ] = React.useState(false);
  const [
    hasLoadedOwnerPendingBannerShownState,
    setHasLoadedOwnerPendingBannerShownState,
  ] = React.useState(false);
  const [isBarDraggingJS, setIsBarDraggingJS] = React.useState(false);
  const [liveRequestBanner, setLiveRequestBanner] = React.useState<{
    eventKey: string;
    title: string;
    body: string;
    requestDate?: string | null;
    requestId?: string | null;
    requestTime?: string | null;
    targetTab?: "agenda" | "prenotazioni";
    targetSection?: "accepted" | "cancelled" | null;
    openDetails?: boolean;
  } | null>(null);
  const [queuedLiveBannerRequests, setQueuedLiveBannerRequests] =
    React.useState<typeof richiestePrenotazione>([]);
  const [androidForegroundBannerQueue, setAndroidForegroundBannerQueue] =
    React.useState<typeof richiestePrenotazione>([]);
  const [androidAutoacceptVisualRequests, setAndroidAutoacceptVisualRequests] =
    React.useState<Record<string, { expiresAt: number; requestId: string }>>(
      {},
    );
  const [webAutoacceptVisualRequests, setWebAutoacceptVisualRequests] =
    React.useState<Record<string, { expiresAt: number; requestId: string }>>(
      {},
    );
  const [isAndroidKeyboardVisible, setIsAndroidKeyboardVisible] =
    React.useState(false);
  const dragPressLockRef = React.useRef(false);
  const dragPressUnlockTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const liveRequestBannerTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const liveRequestBannerTimeoutTokenRef = React.useRef(0);
  const previousRouteIndexRef = React.useRef(state.index);
  const locallyHandledHapticIndexRef = React.useRef<number | null>(null);
  const pressInNavigatedIndexRef = React.useRef<number | null>(null);
  const immediateIndicatorTargetIndexRef = React.useRef<number | null>(null);
  const nativePagerPositionRef = React.useRef(state.index);
  const pagerMotionActiveRef = React.useRef(false);
  const androidTabTapGuardRef = React.useRef<{
    index: number;
    routeKey: string;
    startedAt: number;
  } | null>(null);
  const androidTabNavigationStartedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!IS_ANDROID) {
      return undefined;
    }

    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setIsAndroidKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setIsAndroidKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const swipePreviewHapticIndexRef = React.useRef(state.index);
  const liveBannerTranslateXSV = useSharedValue(0);
  const liveBannerTranslateYSV = useSharedValue(0);
  const loadedViewedRequestOwnerKeyRef = React.useRef<string | null>(null);
  const loadedOwnerPendingBannerOwnerKeyRef = React.useRef<string | null>(null);
  const [
    hasResolvedViewedRequestBaseline,
    setHasResolvedViewedRequestBaseline,
  ] = React.useState(false);
  const recentlyHandledOwnerRequestIdsRef = React.useRef<Map<string, number>>(
    new Map(),
  );
  const recentlyHandledOwnerRequestSyncKeysRef = React.useRef<
    Map<string, number>
  >(new Map());
  const recentlyBanneredOwnerRequestEventKeysRef = React.useRef<
    Map<string, number>
  >(new Map());
  const ownerKnownRequestEventStatusRef = React.useRef<Map<string, string>>(
    new Map(),
  );
  const ownerFreshCustomerCancellationEventKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const ownerPendingRequestInstanceKeysRef = React.useRef<Map<string, string>>(
    new Map(),
  );
  const ownerAutoAcceptTimersRef = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const ownerAutoAcceptInFlightIdsRef = React.useRef<Set<string>>(new Set());
  const ownerAutoAcceptedRequestSyncKeysRef = React.useRef<Map<string, number>>(
    new Map(),
  );
  const ownerAutoAcceptQueueRef = React.useRef<string[]>([]);
  const ownerAutoAcceptProcessingRef = React.useRef(false);
  const ownerPendingFirstSeenAtRef = React.useRef<Map<string, number>>(
    new Map(),
  );
  const ownerPendingBannerShownKeysRef = React.useRef<Set<string>>(new Set());
  const ownerForegroundPushBannerRequestIdsRef = React.useRef<
    Map<string, number>
  >(new Map());
  const ownerForegroundPushBannerLogicalEventsRef = React.useRef<
    Map<string, number>
  >(new Map());
  const ownerPresentedCancellationBannerRequestIdsRef = React.useRef<
    Map<string, number>
  >(new Map());
  const ownerCustomerCancellationBannerClaimsRef = React.useRef<
    Map<string, number>
  >(new Map());
  const ownerPendingCancellationPushesRef = React.useRef<
    Map<string, OwnerForegroundBannerPushEvent>
  >(new Map());
  const ownerPendingCancellationPushTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const ownerPendingFlowBootstrappedRef = React.useRef(false);
  const ownerLiveBannerBootstrappedRef = React.useRef(false);
  const ownerAppForegroundSinceRef = React.useRef(Date.now());
  const [ownerAppForegroundEpoch, setOwnerAppForegroundEpoch] = React.useState(
    () => Date.now(),
  );
  const ownerLivePendingFrontendRequestsRef = React.useRef<
    typeof richiestePrenotazione
  >([]);
  const ownerAutoAcceptPendingFrontendRequestsRef = React.useRef<
    typeof richiestePrenotazione
  >([]);
  const ownerUnreadFrontendRequestEventsRef = React.useRef<
    typeof richiestePrenotazione
  >([]);
  const androidForegroundShownBannerKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const androidForegroundKnownBannerKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const androidForegroundKnownStatusByBaseKeyRef = React.useRef<
    Map<string, string>
  >(new Map());
  const androidForegroundRecentlyBanneredKeysRef = React.useRef<
    Map<string, number>
  >(new Map());
  const androidForegroundFirstSeenAtRef = React.useRef<Map<string, number>>(
    new Map(),
  );
  const androidForegroundHasPrimedBannerKeysRef = React.useRef(false);
  const androidLiveBannerActiveItemsRef = React.useRef<
    typeof richiestePrenotazione
  >([]);
  const androidAutoacceptVisualRequestsRef = React.useRef<
    Record<string, { expiresAt: number; requestId: string }>
  >({});
  const androidAutoacceptVisualQueuedKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const androidAutoacceptVisualCompletedKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const androidAutoacceptVisualBadgeSnapshotRef = React.useRef({
    agenda: 0,
    richieste: 0,
  });
  const webAutoacceptVisualRequestsRef = React.useRef<
    Record<string, { expiresAt: number; requestId: string }>
  >({});
  const webAutoacceptVisualQueuedKeysRef = React.useRef<Set<string>>(new Set());
  const normalizedSalonAccountEmail = React.useMemo(
    () => salonAccountEmail.trim().toLowerCase(),
    [salonAccountEmail],
  );
  const [ownerBadgeDataSettled, setOwnerBadgeDataSettled] =
    React.useState(false);

  const registerWebAutoacceptVisualRequests = React.useCallback(
    (items: typeof richiestePrenotazione) => {
      if (!IS_WEB || items.length === 0) {
        return;
      }

      const now = Date.now();
      setWebAutoacceptVisualRequests((current) => {
        let changed = false;
        const next = { ...current };

        items.forEach((item) => {
          if (
            isCustomerCancellationRequestEvent(item) ||
            item.viewedBySalon === true
          ) {
            return;
          }

          const key =
            buildOwnerForegroundStableBannerKey(item) ||
            buildOwnerLiveBannerShownKey(item) ||
            buildLiveRequestBannerEventKey(item);
          if (!key) {
            return;
          }

          const existing = next[key];
          if (existing) {
            return;
          }

          next[key] = {
            expiresAt: now + WEB_AUTO_ACCEPT_VISUAL_STATE_MS,
            requestId: item.id,
          };
          webAutoacceptVisualQueuedKeysRef.current.add(key);
          changed = true;
        });

        return changed ? next : current;
      });
    },
    [],
  );

  const registerAndroidAutoacceptVisualRequests = React.useCallback(
    (items: typeof richiestePrenotazione, source: string) => {
      if (!IS_ANDROID || items.length === 0) {
        return;
      }

      const now = Date.now();
      setAndroidAutoacceptVisualRequests((current) => {
        let changed = false;
        const next = { ...current };

        items.forEach((item) => {
          if (isCustomerCancellationRequestEvent(item)) {
            return;
          }

          const key =
            buildOwnerForegroundStableBannerKey(item) ||
            buildOwnerLiveBannerShownKey(item) ||
            buildLiveRequestBannerEventKey(item);
          if (!key) {
            return;
          }

          const existing = next[key];
          const nextExpiresAt = now + ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS;
          if (!existing || existing.expiresAt < nextExpiresAt - 250) {
            next[key] = {
              expiresAt: nextExpiresAt,
              requestId: item.id,
            };
            changed = true;
          }

          if (!existing) {
            const pendingShownKey = buildOwnerLiveBannerShownKey({
              ...item,
              stato: "In attesa",
            });
            const acceptedShownKey = buildOwnerLiveBannerShownKey({
              ...item,
              stato: "Accettata",
            });
            [pendingShownKey, acceptedShownKey].forEach((shownKey) => {
              if (!shownKey) {
                return;
              }
              ownerPendingBannerShownKeysRef.current.add(shownKey);
              recentlyBanneredOwnerRequestEventKeysRef.current.set(
                shownKey,
                now,
              );
            });
            logAndroidAutoacceptVisualFlow("temporary_visual_state_start", {
              requestId: item.id,
              status: item.stato,
              source,
              durationMs: ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS,
            });
          }
        });

        return changed ? next : current;
      });
    },
    [],
  );

  const getAndroidOwnerBannerDurationMs = React.useCallback(
    (items: typeof richiestePrenotazione) => {
      if (!IS_ANDROID) {
        return OWNER_LIVE_REQUEST_BANNER_DURATION_MS;
      }

      const hasAutoacceptVisualItem = items.some((item) => {
        if (
          item.stato === "In attesa" &&
          isOwnerRequestAutoAcceptEnabled(item)
        ) {
          return true;
        }

        return (
          item.stato === "Accettata" &&
          ownerAutoAcceptedRequestSyncKeysRef.current.has(
            buildFrontendRequestSyncKey(item),
          )
        );
      });

      return hasAutoacceptVisualItem
        ? ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS
        : OWNER_LIVE_REQUEST_BANNER_DURATION_MS;
    },
    [isOwnerRequestAutoAcceptEnabled],
  );

  React.useEffect(() => {
    androidAutoacceptVisualRequestsRef.current =
      androidAutoacceptVisualRequests;
  }, [androidAutoacceptVisualRequests]);

  React.useEffect(() => {
    if (!IS_ANDROID) {
      return;
    }

    const entries = Object.entries(androidAutoacceptVisualRequests);
    if (entries.length === 0) {
      return;
    }

    const now = Date.now();
    const expiredKeys = entries
      .filter(([, value]) => value.expiresAt <= now)
      .map(([key]) => key);

    if (expiredKeys.length > 0) {
      setAndroidAutoacceptVisualRequests((current) => {
        let changed = false;
        const next = { ...current };
        expiredKeys.forEach((key) => {
          const item = next[key];
          if (!item || item.expiresAt > Date.now()) {
            return;
          }
          delete next[key];
          changed = true;
          androidAutoacceptVisualCompletedKeysRef.current.add(key);
          logAndroidAutoacceptVisualFlow("temporary_state_end_after_15s", {
            requestId: item.requestId,
            durationMs: ANDROID_AUTO_ACCEPT_VISUAL_STATE_MS,
          });
          logAndroidAutoacceptVisualFlow("definitive_state_applied", {
            requestId: item.requestId,
          });
        });
        return changed ? next : current;
      });
      return;
    }

    const nextExpiresAt = Math.min(
      ...entries.map(([, value]) => value.expiresAt),
    );
    const timeoutId = setTimeout(
      () => {
        setAndroidAutoacceptVisualRequests((current) => ({ ...current }));
      },
      Math.max(0, nextExpiresAt - now) + 50,
    );

    return () => {
      clearTimeout(timeoutId);
    };
  }, [androidAutoacceptVisualRequests]);

  React.useEffect(() => {
    webAutoacceptVisualRequestsRef.current = webAutoacceptVisualRequests;
  }, [webAutoacceptVisualRequests]);

  React.useEffect(() => {
    if (!IS_WEB) {
      return;
    }

    const entries = Object.entries(webAutoacceptVisualRequests);
    if (entries.length === 0) {
      return;
    }

    const now = Date.now();
    const expiredKeys = entries
      .filter(([, value]) => value.expiresAt <= now)
      .map(([key]) => key);

    if (expiredKeys.length > 0) {
      setWebAutoacceptVisualRequests((current) => {
        let changed = false;
        const next = { ...current };
        expiredKeys.forEach((key) => {
          const item = next[key];
          if (!item || item.expiresAt > Date.now()) {
            return;
          }
          delete next[key];
          changed = true;
        });
        return changed ? next : current;
      });
      return;
    }

    const nextExpiresAt = Math.min(
      ...entries.map(([, value]) => value.expiresAt),
    );
    const timeoutId = setTimeout(
      () => {
        setWebAutoacceptVisualRequests((current) => ({ ...current }));
      },
      Math.max(0, nextExpiresAt - now) + 50,
    );

    return () => {
      clearTimeout(timeoutId);
    };
  }, [webAutoacceptVisualRequests]);

  React.useEffect(() => {
    if (!IS_WEB) {
      return;
    }

    webAutoacceptVisualQueuedKeysRef.current.clear();
    webAutoacceptVisualRequestsRef.current = {};
    setWebAutoacceptVisualRequests({});
  }, [normalizedSalonAccountEmail]);

  const persistOwnerPendingBannerShownState = React.useCallback(async () => {
    if (!normalizedSalonAccountEmail) {
      return;
    }

    const now = Date.now();
    const nextEntries = Array.from(ownerPendingBannerShownKeysRef.current)
      .map((timerKey) => {
        const shownAt =
          recentlyBanneredOwnerRequestEventKeysRef.current.get(timerKey) ?? now;
        return [timerKey, shownAt] as const;
      })
      .filter(
        ([, shownAt]) =>
          Number.isFinite(shownAt) &&
          now - shownAt <= OWNER_LIVE_REQUEST_BANNER_MAX_AGE_MS,
      );

    try {
      if (nextEntries.length === 0) {
        await AsyncStorage.removeItem(
          buildOwnerPendingBannerShownStorageKey(normalizedSalonAccountEmail),
        );
        return;
      }

      await AsyncStorage.setItem(
        buildOwnerPendingBannerShownStorageKey(normalizedSalonAccountEmail),
        JSON.stringify(nextEntries),
      );
    } catch {
      // noop
    }
  }, [normalizedSalonAccountEmail]);
  const canonicalFrontendRequests = React.useMemo(() => {
    const nextBySyncKey = new Map<
      string,
      (typeof richiestePrenotazione)[number]
    >();

    richiestePrenotazione.forEach((item) => {
      const isCustomerCancellation = isCustomerCancellationRequestEvent(item);

      if (
        (item.origine ?? "frontend") !== "frontend" &&
        !isCustomerCancellation &&
        !isResolvedOperatorChangeResponseEvent(item)
      ) {
        return;
      }

      const syncKey = buildFrontendRequestCanonicalKey(item);
      if (!syncKey) {
        return;
      }

      const currentItem = nextBySyncKey.get(syncKey);
      if (
        !currentItem ||
        compareFrontendRequestDisplayPriority(currentItem, item) < 0
      ) {
        nextBySyncKey.set(syncKey, item);
      }
    });

    const nextByBaseKey = new Map<
      string,
      (typeof richiestePrenotazione)[number]
    >();

    Array.from(nextBySyncKey.values()).forEach((item) => {
      const baseKey = buildFrontendRequestCanonicalKey(item);
      if (!baseKey) {
        return;
      }

      const currentItem = nextByBaseKey.get(baseKey);
      if (
        !currentItem ||
        compareFrontendRequestDisplayPriority(currentItem, item) < 0
      ) {
        nextByBaseKey.set(baseKey, item);
      }
    });

    return Array.from(nextByBaseKey.values());
  }, [richiestePrenotazione]);
  const resolveOwnerCustomerCancellationClaimKeys = React.useCallback(
    (item: Partial<OwnerBookingRequestItem> & { id?: string | null }) => {
      const requestId = item.id?.trim() ?? "";
      const canonicalRequest = requestId
        ? canonicalFrontendRequests.find(
            (candidate) => candidate.id?.trim() === requestId,
          )
        : undefined;

      return buildOwnerCustomerCancellationClaimKeys(
        canonicalRequest ? { ...item, ...canonicalRequest } : item,
      );
    },
    [canonicalFrontendRequests],
  );
  const pruneOwnerCustomerCancellationBannerClaims = React.useCallback(
    (now = Date.now()) => {
      ownerCustomerCancellationBannerClaimsRef.current.forEach(
        (claimedAt, claimKey) => {
          if (now - claimedAt > OWNER_LIVE_REQUEST_BANNER_MAX_AGE_MS) {
            ownerCustomerCancellationBannerClaimsRef.current.delete(claimKey);
          }
        },
      );
    },
    [],
  );
  const isOwnerCustomerCancellationBannerClaimed = React.useCallback(
    (item: Partial<OwnerBookingRequestItem> & { id?: string | null }) => {
      const now = Date.now();
      pruneOwnerCustomerCancellationBannerClaims(now);
      return resolveOwnerCustomerCancellationClaimKeys(item).some((claimKey) =>
        ownerCustomerCancellationBannerClaimsRef.current.has(claimKey),
      );
    },
    [
      pruneOwnerCustomerCancellationBannerClaims,
      resolveOwnerCustomerCancellationClaimKeys,
    ],
  );
  const recordOwnerCustomerCancellationBannerClaim = React.useCallback(
    (
      item: Partial<OwnerBookingRequestItem> & { id?: string | null },
      claimedAt = Date.now(),
    ) => {
      resolveOwnerCustomerCancellationClaimKeys(item).forEach((claimKey) => {
        ownerCustomerCancellationBannerClaimsRef.current.set(
          claimKey,
          claimedAt,
        );
      });
    },
    [resolveOwnerCustomerCancellationClaimKeys],
  );
  const claimOwnerCustomerCancellationBanner = React.useCallback(
    (item: Partial<OwnerBookingRequestItem> & { id?: string | null }) => {
      if (isOwnerCustomerCancellationBannerClaimed(item)) {
        return false;
      }

      recordOwnerCustomerCancellationBannerClaim(item);
      return true;
    },
    [
      isOwnerCustomerCancellationBannerClaimed,
      recordOwnerCustomerCancellationBannerClaim,
    ],
  );
  const deletedCustomerIdentityKeySet = React.useMemo(
    () => new Set(deletedCustomerIdentityKeys),
    [deletedCustomerIdentityKeys],
  );
  const isDeletedFrontendIdentity = React.useCallback(
    (item: {
      id?: string | null;
      nome?: string | null;
      telefono?: string | null;
      email?: string | null;
    }) =>
      buildFrontendClientIdentityAliases(item).some((alias) =>
        deletedCustomerIdentityKeySet.has(alias),
      ),
    [deletedCustomerIdentityKeySet],
  );
  const isDeletedFrontendRequest = React.useCallback(
    (item: (typeof richiestePrenotazione)[number]) =>
      isDeletedFrontendIdentity({
        id: item.id,
        nome: `${item.nome} ${item.cognome}`.trim(),
        telefono: item.telefono,
        email: item.email,
      }),
    [isDeletedFrontendIdentity],
  );
  const isRequestEventViewed = React.useCallback(
    (
      item: {
        id: string;
        stato?: string | null;
        cancellationSource?: string | null;
        viewedBySalon?: boolean;
      },
      signatures: string[],
    ) => {
      // Accepted reads are confirmed by the server. An old device-only read
      // must not hide Agenda's badge while Notifications still counts it.
      if (item.stato === "Accettata" && item.viewedBySalon !== true) return false;
      const eventSignature = buildViewedRequestSignature(item);
      return signatures.includes(eventSignature);
    },
    [],
  );
  React.useEffect(() => {
    if (
      !IS_WEB ||
      Object.keys(webAutoacceptVisualRequestsRef.current).length === 0
    ) {
      return;
    }

    setWebAutoacceptVisualRequests((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(current).forEach(([key, visualRequest]) => {
        const request = canonicalFrontendRequests.find(
          (item) => item.id === visualRequest.requestId,
        );
        if (
          !request ||
          (request.viewedBySalon !== true &&
            !isRequestEventViewed(request, viewedRequestIds))
        ) {
          return;
        }

        delete next[key];
        changed = true;
      });

      return changed ? next : current;
    });
  }, [canonicalFrontendRequests, isRequestEventViewed, viewedRequestIds]);
  React.useEffect(() => {
    let cancelled = false;
    const ownerKey = normalizedSalonAccountEmail || "__no-owner__";

    if (loadedViewedRequestOwnerKeyRef.current === ownerKey) {
      return () => {
        cancelled = true;
      };
    }

    loadedViewedRequestOwnerKeyRef.current = ownerKey;
    setHasLoadedViewedRequestIds(false);
    setHasResolvedViewedRequestBaseline(false);

    const loadViewedRequestIds = async () => {
      if (!normalizedSalonAccountEmail) {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
          setHasResolvedViewedRequestBaseline(true);
        }
        return;
      }

      const storageKey = `salon_manager_viewed_request_ids_v2__${normalizedSalonAccountEmail}`;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : [];

        if (!cancelled) {
          setViewedRequestIds(nextIds);
          setHasLoadedViewedRequestIds(true);
          setHasResolvedViewedRequestBaseline(true);
        }
      } catch {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
          setHasResolvedViewedRequestBaseline(true);
        }
      }
    };

    void loadViewedRequestIds();

    return () => {
      cancelled = true;
    };
  }, [normalizedSalonAccountEmail]);

  React.useEffect(() => {
    let cancelled = false;
    const ownerKey = normalizedSalonAccountEmail || "__no-owner__";

    if (loadedOwnerPendingBannerOwnerKeyRef.current === ownerKey) {
      return () => {
        cancelled = true;
      };
    }

    loadedOwnerPendingBannerOwnerKeyRef.current = ownerKey;
    setHasLoadedOwnerPendingBannerShownState(false);
    ownerPendingBannerShownKeysRef.current.clear();
    recentlyBanneredOwnerRequestEventKeysRef.current.clear();

    const loadOwnerPendingBannerShownState = async () => {
      if (!normalizedSalonAccountEmail) {
        if (!cancelled) {
          setHasLoadedOwnerPendingBannerShownState(true);
        }
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(
          buildOwnerPendingBannerShownStorageKey(normalizedSalonAccountEmail),
        );
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const now = Date.now();
        const nextEntries = Array.isArray(parsed)
          ? parsed.filter(
              (entry): entry is [string, number] =>
                Array.isArray(entry) &&
                typeof entry[0] === "string" &&
                typeof entry[1] === "number" &&
                now - entry[1] <= OWNER_LIVE_REQUEST_BANNER_MAX_AGE_MS,
            )
          : [];

        if (cancelled) {
          return;
        }

        ownerPendingBannerShownKeysRef.current = new Set(
          nextEntries.map(([timerKey]) => timerKey),
        );
        recentlyBanneredOwnerRequestEventKeysRef.current = new Map(nextEntries);
        setHasLoadedOwnerPendingBannerShownState(true);
      } catch {
        if (cancelled) {
          return;
        }

        ownerPendingBannerShownKeysRef.current.clear();
        recentlyBanneredOwnerRequestEventKeysRef.current.clear();
        setHasLoadedOwnerPendingBannerShownState(true);
      }
    };

    void loadOwnerPendingBannerShownState();

    return () => {
      cancelled = true;
    };
  }, [normalizedSalonAccountEmail]);

  const isSupersededCustomerCancellation = React.useCallback(
    (request: (typeof richiestePrenotazione)[number]) => {
      if (!isCustomerCancellationRequestEvent(request)) {
        return false;
      }

      if (
        request.viewedBySalon !== true &&
        !isRequestEventViewed(request, viewedRequestIds)
      ) {
        return false;
      }

      return appuntamenti.some(
        (appointment) =>
          normalizeOwnerNotificationText(appointment.data) ===
            normalizeOwnerNotificationText(request.data) &&
          normalizeOwnerNotificationText(appointment.ora) ===
            normalizeOwnerNotificationText(request.ora) &&
          normalizeOwnerNotificationText(appointment.servizio) ===
            normalizeOwnerNotificationText(request.servizio) &&
          matchesOwnerNotificationCustomerName(
            appointment.cliente,
            request.nome,
            request.cognome,
          ),
      );
    },
    [appuntamenti, isRequestEventViewed, viewedRequestIds],
  );

  React.useEffect(() => {
    let cancelled = false;

    if (!normalizedSalonAccountEmail) {
      setDeletedCustomerIdentityKeys([]);
      setHasLoadedDeletedCustomerIdentityKeys(true);
      return () => {
        cancelled = true;
      };
    }

    setHasLoadedDeletedCustomerIdentityKeys(false);

    const loadDeletedCustomerIdentityKeys = async () => {
      try {
        const raw = await AsyncStorage.getItem(
          buildDeletedCustomerStorageKey(normalizedSalonAccountEmail),
        );
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const nextKeys = Array.isArray(parsed)
          ? parsed
              .filter(
                (entry): entry is [string, number] =>
                  Array.isArray(entry) &&
                  typeof entry[0] === "string" &&
                  typeof entry[1] === "number",
              )
              .map(([key]) => key)
          : [];

        if (!cancelled) {
          setDeletedCustomerIdentityKeys(nextKeys);
          setHasLoadedDeletedCustomerIdentityKeys(true);
        }
      } catch {
        if (!cancelled) {
          setDeletedCustomerIdentityKeys([]);
          setHasLoadedDeletedCustomerIdentityKeys(true);
        }
      }
    };

    void loadDeletedCustomerIdentityKeys();

    return () => {
      cancelled = true;
    };
  }, [
    normalizedSalonAccountEmail,
    richiestePrenotazione.length,
    clienti.length,
  ]);

  const supersededPendingRequestKeys = React.useMemo(() => {
    const handledKeys = new Set<string>();

    canonicalFrontendRequests.forEach((item) => {
      if ((item.origine ?? "frontend") !== "frontend") {
        return;
      }

      const handledBySalon =
        item.stato === "Accettata" ||
        item.stato === "Rifiutata" ||
        (item.stato === "Annullata" && item.cancellationSource === "salone");

      if (handledBySalon) {
        handledKeys.add(buildFrontendRequestSyncKey(item));
      }
    });

    return handledKeys;
  }, [canonicalFrontendRequests]);
  const ownerLivePendingFrontendRequests = React.useMemo(() => {
    if (
      !hasLoadedViewedRequestIds ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady
    ) {
      return [];
    }

    return canonicalFrontendRequests.filter(
      (item) =>
        isOwnerRelevantFrontendRequestValue(item, {
          isDeletedFrontendRequest,
          isSupersededCustomerCancellation,
        }) &&
        item.stato === "In attesa" &&
        item.operatorChangeStatus !== "pending" &&
        !recentlyHandledOwnerRequestIdsRef.current.has(item.id) &&
        !recentlyHandledOwnerRequestSyncKeysRef.current.has(
          buildFrontendRequestSyncKey(item),
        ) &&
        !supersededPendingRequestKeys.has(buildFrontendRequestSyncKey(item)),
    );
  }, [
    hasLoadedViewedRequestIds,
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    canonicalFrontendRequests,
    isDeletedFrontendRequest,
    isSupersededCustomerCancellation,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    supersededPendingRequestKeys,
  ]);
  const immediateAgendaPendingRequestTarget = React.useMemo(
    () =>
      [...ownerLivePendingFrontendRequests].sort((left, right) => {
        const leftTimestamp = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTimestamp = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTimestamp - leftTimestamp;
      })[0] ?? null,
    [ownerLivePendingFrontendRequests],
  );
  const ownerAutoAcceptPendingFrontendRequests = React.useMemo(() => {
    if (
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedDeletedCustomerIdentityKeys
    ) {
      return [];
    }

    return canonicalFrontendRequests.filter(
      (item) =>
        isOwnerRelevantFrontendRequestValue(item, {
          isDeletedFrontendRequest,
          isSupersededCustomerCancellation,
        }) &&
        item.stato === "In attesa" &&
        item.operatorChangeStatus !== "pending" &&
        isOwnerRequestAutoAcceptEnabled(item) &&
        !recentlyHandledOwnerRequestIdsRef.current.has(item.id) &&
        !recentlyHandledOwnerRequestSyncKeysRef.current.has(
          buildFrontendRequestSyncKey(item),
        ) &&
        !supersededPendingRequestKeys.has(buildFrontendRequestSyncKey(item)),
    );
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    canonicalFrontendRequests,
    isDeletedFrontendRequest,
    isSupersededCustomerCancellation,
    isOwnerRequestAutoAcceptEnabled,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    supersededPendingRequestKeys,
  ]);
  const ownerUnreadFrontendRequestEvents = React.useMemo(() => {
    if (
      !hasLoadedViewedRequestIds ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady
    ) {
      return [];
    }

    return canonicalFrontendRequests.filter((item) => {
      const isCustomerCancellation = isCustomerCancellationRequestEvent(item);
      const isOperatorChangeResponse =
        isResolvedOperatorChangeResponseEvent(item);
      const isSupersededPendingRequest =
        item.stato === "In attesa" &&
        supersededPendingRequestKeys.has(buildFrontendRequestSyncKey(item));
      const isFreshAutoAcceptedRequest =
        item.stato === "Accettata" &&
        ownerAutoAcceptedRequestSyncKeysRef.current.has(
          buildFrontendRequestSyncKey(item),
        );
      return (
        isOwnerRelevantFrontendRequestValue(item, {
          isDeletedFrontendRequest,
          isSupersededCustomerCancellation,
        }) &&
        item.operatorChangeStatus !== "pending" &&
        (isOwnerCountableRequestNotification(item) ||
          isFreshAutoAcceptedRequest) &&
        item.viewedBySalon !== true &&
        !isRequestEventViewed(item, viewedRequestIds) &&
        (isCustomerCancellation ||
          isOperatorChangeResponse ||
          item.stato === "Accettata" ||
          !recentlyHandledOwnerRequestIdsRef.current.has(item.id)) &&
        (isCustomerCancellation ||
          isOperatorChangeResponse ||
          item.stato === "Accettata" ||
          !recentlyHandledOwnerRequestSyncKeysRef.current.has(
            buildFrontendRequestSyncKey(item),
          )) &&
        !isSupersededPendingRequest
      );
    });
  }, [
    hasLoadedViewedRequestIds,
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    canonicalFrontendRequests,
    isDeletedFrontendRequest,
    isRequestEventViewed,
    isSupersededCustomerCancellation,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    supersededPendingRequestKeys,
    viewedRequestIds,
  ]);
  const ownerLiveBannerRequestEvents = React.useMemo(() => {
    const merged = new Map<string, (typeof richiestePrenotazione)[number]>();

    queuedLiveBannerRequests.forEach((item) => {
      if (isOwnerLiveBannerEligibleRequestEvent(item)) {
        merged.set(buildLiveRequestBannerEventKey(item), item);
      }
    });

    ownerUnreadFrontendRequestEvents
      .filter(isOwnerLiveBannerEligibleRequestEvent)
      .forEach((item) => {
        merged.set(buildLiveRequestBannerEventKey(item), item);
      });

    return Array.from(merged.values());
  }, [ownerUnreadFrontendRequestEvents, queuedLiveBannerRequests]);
  React.useEffect(() => {
    ownerLivePendingFrontendRequestsRef.current =
      ownerLivePendingFrontendRequests;
  }, [ownerLivePendingFrontendRequests]);
  React.useEffect(() => {
    ownerAutoAcceptPendingFrontendRequestsRef.current =
      ownerAutoAcceptPendingFrontendRequests;
  }, [ownerAutoAcceptPendingFrontendRequests]);
  React.useEffect(() => {
    if (
      !IS_WEB ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedViewedRequestIds ||
      !hasResolvedViewedRequestBaseline ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState
    ) {
      return;
    }

    const now = Date.now();
    const freshAutoAcceptRequests =
      ownerAutoAcceptPendingFrontendRequests.filter((item) => {
        if (
          item.viewedBySalon === true ||
          isRequestEventViewed(item, viewedRequestIds)
        ) {
          return false;
        }

        const key =
          buildOwnerForegroundStableBannerKey(item) ||
          buildOwnerLiveBannerShownKey(item) ||
          buildLiveRequestBannerEventKey(item);
        if (!key || webAutoacceptVisualQueuedKeysRef.current.has(key)) {
          return false;
        }

        const timestamp = parseOwnerLiveRequestBannerTimestamp(item);
        return (
          typeof timestamp === "number" &&
          Number.isFinite(timestamp) &&
          now - timestamp <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS
        );
      });

    if (freshAutoAcceptRequests.length > 0) {
      registerWebAutoacceptVisualRequests(freshAutoAcceptRequests);
    }
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    hasLoadedViewedRequestIds,
    hasResolvedViewedRequestBaseline,
    ownerAutoAcceptPendingFrontendRequests,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    isRequestEventViewed,
    registerWebAutoacceptVisualRequests,
    viewedRequestIds,
  ]);
  React.useEffect(() => {
    if (
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedViewedRequestIds ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState
    ) {
      setQueuedLiveBannerRequests((current) =>
        current.length === 0 ? current : [],
      );
      return;
    }

    const now = Date.now();
    setQueuedLiveBannerRequests((current) => {
      const nextByKey = new Map<
        string,
        (typeof richiestePrenotazione)[number]
      >();

      current.forEach((item) => {
        if (item.operatorChangeStatus === "pending") {
          return;
        }

        const eventKey = buildLiveRequestBannerEventKey(item);
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        const createdAt = parseOwnerLiveRequestBannerTimestamp(item) ?? now;

        if (
          bannerShownKey &&
          !ownerPendingBannerShownKeysRef.current.has(bannerShownKey) &&
          now - createdAt <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS
        ) {
          nextByKey.set(eventKey, item);
        }
      });

      ownerLivePendingFrontendRequests.forEach((item) => {
        const eventKey = buildLiveRequestBannerEventKey(item);
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);

        if (
          bannerShownKey &&
          !ownerPendingBannerShownKeysRef.current.has(bannerShownKey) &&
          !recentlyBanneredOwnerRequestEventKeysRef.current.has(bannerShownKey)
        ) {
          nextByKey.set(eventKey, item);
        }
      });

      if (IS_ANDROID) {
        ownerUnreadFrontendRequestEvents.forEach((item) => {
          if (item.stato !== "Accettata") {
            return;
          }

          const syncKey = buildFrontendRequestSyncKey(item);
          const eventKey = buildLiveRequestBannerEventKey(item);
          const bannerShownKey = buildOwnerLiveBannerShownKey(item);
          const stableVisualKey = buildOwnerForegroundStableBannerKey(item);
          const hasActivePendingVisual =
            !!stableVisualKey &&
            !!androidAutoacceptVisualRequestsRef.current[stableVisualKey];
          const hasCompletedPendingVisual =
            !!stableVisualKey &&
            androidAutoacceptVisualCompletedKeysRef.current.has(
              stableVisualKey,
            );
          const isTrackedAutoAccept =
            ownerAutoAcceptedRequestSyncKeysRef.current.has(syncKey);
          const isUnread =
            item.viewedBySalon !== true &&
            !isRequestEventViewed(item, viewedRequestIds);

          logAndroidBackofficeAutoacceptNotif("queue_check", {
            requestId: item.id,
            status: item.stato,
            syncKey,
            bannerShownKey,
            hasActivePendingVisual,
            hasCompletedPendingVisual,
            isTrackedAutoAccept,
            isUnread,
            alreadyShown: bannerShownKey
              ? ownerPendingBannerShownKeysRef.current.has(bannerShownKey)
              : true,
            recentlyBannered: bannerShownKey
              ? recentlyBanneredOwnerRequestEventKeysRef.current.has(
                  bannerShownKey,
                )
              : true,
          });

          if (
            bannerShownKey &&
            isTrackedAutoAccept &&
            isUnread &&
            !hasActivePendingVisual &&
            !hasCompletedPendingVisual &&
            !ownerPendingBannerShownKeysRef.current.has(bannerShownKey) &&
            !recentlyBanneredOwnerRequestEventKeysRef.current.has(
              bannerShownKey,
            )
          ) {
            nextByKey.set(eventKey, item);
            logAndroidBackofficeAutoacceptNotif("queue_enqueue", {
              requestId: item.id,
              eventKey,
              bannerShownKey,
            });
          }
        });
      }

      const next = Array.from(nextByKey.values());
      if (
        next.length === current.length &&
        next.every(
          (item, index) =>
            buildLiveRequestBannerEventKey(item) ===
            buildLiveRequestBannerEventKey(current[index]),
        )
      ) {
        return current;
      }

      return next;
    });
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    hasLoadedViewedRequestIds,
    isRequestEventViewed,
    ownerInitialDataHydrating,
    ownerLivePendingFrontendRequests,
    ownerServerSyncReady,
    ownerUnreadFrontendRequestEvents,
    viewedRequestIds,
  ]);
  React.useEffect(() => {
    if (!IS_ANDROID || queuedLiveBannerRequests.length === 0) {
      return;
    }

    const autoAcceptedQueuedRequests = queuedLiveBannerRequests.filter(
      (item) =>
        item.stato === "Accettata" &&
        ownerAutoAcceptedRequestSyncKeysRef.current.has(
          buildFrontendRequestSyncKey(item),
        ),
    );

    if (autoAcceptedQueuedRequests.length === 0) {
      return;
    }

    registerAndroidAutoacceptVisualRequests(
      autoAcceptedQueuedRequests,
      "shared_ios_queue",
    );
  }, [queuedLiveBannerRequests, registerAndroidAutoacceptVisualRequests]);
  React.useEffect(() => {
    if (
      !IS_ANDROID ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedDeletedCustomerIdentityKeys
    ) {
      return;
    }

    const now = Date.now();
    const bannerQueueWindowMs =
      ANDROID_OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS;
    const freshPendingRequests = ownerAutoAcceptPendingFrontendRequests.filter(
      (item) => {
        const key = buildOwnerForegroundStableBannerKey(item);
        if (!key || androidAutoacceptVisualQueuedKeysRef.current.has(key)) {
          return false;
        }

        const timestamp = parseOwnerLiveRequestBannerTimestamp(item);
        if (
          typeof timestamp === "number" &&
          Number.isFinite(timestamp) &&
          timestamp < ownerAppForegroundSinceRef.current
        ) {
          androidAutoacceptVisualQueuedKeysRef.current.add(key);
          return false;
        }

        return (
          typeof timestamp !== "number" ||
          !Number.isFinite(timestamp) ||
          now - timestamp <= bannerQueueWindowMs
        );
      },
    );

    if (freshPendingRequests.length === 0) {
      return;
    }

    freshPendingRequests.forEach((item) => {
      const key = buildOwnerForegroundStableBannerKey(item);
      if (key) {
        androidAutoacceptVisualQueuedKeysRef.current.add(key);
      }
    });
    registerAndroidAutoacceptVisualRequests(
      freshPendingRequests,
      "pending_arrival",
    );

    const mergedByKey = new Map<
      string,
      (typeof richiestePrenotazione)[number]
    >();
    androidLiveBannerActiveItemsRef.current.forEach((item) => {
      const key =
        buildOwnerForegroundStableBannerKey(item) ||
        buildLiveRequestBannerEventKey(item);
      if (key) {
        mergedByKey.set(key, item);
      }
    });
    freshPendingRequests.forEach((item) => {
      const key =
        buildOwnerForegroundStableBannerKey(item) ||
        buildLiveRequestBannerEventKey(item);
      if (!key) {
        return;
      }
      mergedByKey.set(key, item);

      const bannerShownKey = buildOwnerLiveBannerShownKey(item);
      if (bannerShownKey) {
        ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
        recentlyBanneredOwnerRequestEventKeysRef.current.set(
          bannerShownKey,
          now,
        );
      }
    });

    const mergedRequests = Array.from(mergedByKey.values()).sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    if (mergedRequests.length > 0) {
      // Il push autorevole mostra gia' il banner completo (cliente, servizio e
      // orario). Questo percorso serve soltanto a preparare lo stato visuale
      // dell'auto-accettazione: non deve anticiparlo con "1 nuove richieste".
      void persistOwnerPendingBannerShownState();
      logAndroidAutoacceptVisualFlow("generic_banner_suppressed", {
        requestId: mergedRequests[0]?.id ?? null,
        count: mergedRequests.length,
        mode: "pending_arrival_push_authoritative",
      });
    }

    logAndroidAutoacceptVisualFlow("pending_arrival_visual_batch", {
      count: freshPendingRequests.length,
      requestIds: freshPendingRequests.map((item) => item.id),
    });
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    ownerAutoAcceptPendingFrontendRequests,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    persistOwnerPendingBannerShownState,
    registerAndroidAutoacceptVisualRequests,
  ]);
  React.useEffect(() => {
    ownerUnreadFrontendRequestEventsRef.current =
      ownerUnreadFrontendRequestEvents;
  }, [ownerUnreadFrontendRequestEvents]);

  const getOrSeedOwnerPendingFirstSeenAt = React.useCallback(
    (
      item: (typeof richiestePrenotazione)[number],
      options?: {
        preferCreatedAt?: boolean;
      },
    ) => {
      const timerKey = buildOwnerLiveBannerTimerKey(item);
      if (!timerKey) {
        return Date.now();
      }

      const existingSeenAt = ownerPendingFirstSeenAtRef.current.get(timerKey);
      if (
        typeof existingSeenAt === "number" &&
        Number.isFinite(existingSeenAt)
      ) {
        return existingSeenAt;
      }

      const createdAtMs = parseOwnerLiveRequestBannerTimestamp(item);
      const seededSeenAt =
        options?.preferCreatedAt && createdAtMs && createdAtMs > 0
          ? createdAtMs
          : Date.now();

      ownerPendingFirstSeenAtRef.current.set(timerKey, seededSeenAt);
      return seededSeenAt;
    },
    [],
  );

  React.useEffect(() => {
    setOwnerBadgeDataSettled((current) => (current ? false : current));

    if (
      !normalizedSalonAccountEmail ||
      !hasLoadedViewedRequestIds ||
      !hasResolvedViewedRequestBaseline ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady
    ) {
      return;
    }

    setOwnerBadgeDataSettled((current) => (current ? current : true));
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    hasLoadedViewedRequestIds,
    hasResolvedViewedRequestBaseline,
    normalizedSalonAccountEmail,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
  ]);

  const ownerTabBadgeDataReady =
    !!normalizedSalonAccountEmail &&
    hasLoadedViewedRequestIds &&
    hasResolvedViewedRequestBaseline &&
    hasLoadedDeletedCustomerIdentityKeys &&
    hasLoadedOwnerPendingBannerShownState &&
    !ownerInitialDataHydrating &&
    ownerServerSyncReady &&
    ownerBadgeDataSettled;

  const androidAutoacceptVisualRequestsCount = IS_ANDROID
    ? Object.keys(androidAutoacceptVisualRequests).length
    : 0;
  const webAutoacceptVisualRequestsCount = IS_WEB
    ? Object.keys(webAutoacceptVisualRequests).length
    : 0;
  const isAndroidAutoacceptVisualTrackedEvent = (
    item: (typeof richiestePrenotazione)[number],
  ) => {
    if (!IS_ANDROID || isCustomerCancellationRequestEvent(item)) {
      return false;
    }

    if (
      item.id &&
      Object.values(androidAutoacceptVisualRequestsRef.current).some(
        (visualRequest) => visualRequest.requestId === item.id,
      )
    ) {
      return true;
    }

    const stableVisualKey =
      buildOwnerForegroundStableBannerKey(item) ||
      buildOwnerLiveBannerShownKey(item) ||
      buildLiveRequestBannerEventKey(item);

    if (
      stableVisualKey &&
      androidAutoacceptVisualRequestsRef.current[stableVisualKey]
    ) {
      return true;
    }

    return false;
  };
  const isWebAutoacceptVisualTrackedEvent = (
    item: (typeof richiestePrenotazione)[number],
  ) => {
    if (!IS_WEB || isCustomerCancellationRequestEvent(item)) {
      return false;
    }

    if (
      item.id &&
      Object.values(webAutoacceptVisualRequestsRef.current).some(
        (visualRequest) => visualRequest.requestId === item.id,
      )
    ) {
      return true;
    }

    const stableVisualKey =
      buildOwnerForegroundStableBannerKey(item) ||
      buildOwnerLiveBannerShownKey(item) ||
      buildLiveRequestBannerEventKey(item);
    return (
      !!stableVisualKey &&
      !!webAutoacceptVisualRequestsRef.current[stableVisualKey]
    );
  };
  const isAutoacceptVisualTrackedEvent = (
    item: (typeof richiestePrenotazione)[number],
  ) =>
    isAndroidAutoacceptVisualTrackedEvent(item) ||
    isWebAutoacceptVisualTrackedEvent(item);

  const localAgendaPendingRequestsCount = ownerTabBadgeDataReady
    ? countOwnerLogicalBookingEvents(
        [
          ...ownerLivePendingFrontendRequests,
          ...ownerUnreadFrontendRequestEvents.filter(
            (item) =>
              (item.origine ?? "frontend") === "frontend" &&
              item.stato === "Accettata",
          ),
        ].filter(
          (item) =>
            !isCustomerCancellationRequestEvent(item) &&
            !isAutoacceptVisualTrackedEvent(item) &&
            (!IS_WEB ||
              (item.viewedBySalon !== true &&
                !isRequestEventViewed(item, viewedRequestIds))),
        ),
      ) +
      androidAutoacceptVisualRequestsCount +
      webAutoacceptVisualRequestsCount
    : (unreadCountsBySection.agenda ?? 0);

  const remoteAgendaPendingRequestsCount = unreadCountsBySection.agenda ?? 0;
  const visualAgendaPendingRequestsCount =
    localAgendaPendingRequestsCount === 0
      ? 0
      : remoteAgendaPendingRequestsCount > 0
        ? Math.min(
            remoteAgendaPendingRequestsCount,
            localAgendaPendingRequestsCount,
          )
        : localAgendaPendingRequestsCount;
  const rawAndroidCustomBarAgendaPendingRequestsCount = ownerTabBadgeDataReady
    ? localAgendaPendingRequestsCount === 0
      ? 0
      : Math.max(
          localAgendaPendingRequestsCount,
          remoteAgendaPendingRequestsCount,
        )
    : remoteAgendaPendingRequestsCount;
  const [
    stableAndroidCustomBarAgendaBadgeCount,
    setStableAndroidCustomBarAgendaBadgeCount,
  ] = React.useState(0);
  const [
    hasStableAndroidCustomBarAgendaBadgeCount,
    setHasStableAndroidCustomBarAgendaBadgeCount,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!IS_ANDROID || !ownerTabBadgeDataReady) {
      return;
    }

    const nextCount = Math.max(
      0,
      Math.trunc(rawAndroidCustomBarAgendaPendingRequestsCount),
    );
    setStableAndroidCustomBarAgendaBadgeCount((current) =>
      current === nextCount ? current : nextCount,
    );
    setHasStableAndroidCustomBarAgendaBadgeCount((current) =>
      current ? current : true,
    );
  }, [ownerTabBadgeDataReady, rawAndroidCustomBarAgendaPendingRequestsCount]);
  const visualCustomBarAgendaPendingRequestsCount = IS_ANDROID
    ? ownerTabBadgeDataReady
      ? rawAndroidCustomBarAgendaPendingRequestsCount
      : hasStableAndroidCustomBarAgendaBadgeCount
        ? stableAndroidCustomBarAgendaBadgeCount
        : remoteAgendaPendingRequestsCount
    : visualAgendaPendingRequestsCount;

  const localOwnerUnreadRequestEventsCount = ownerTabBadgeDataReady
    ? countOwnerLogicalBookingEvents(
        ownerUnreadFrontendRequestEvents.filter(
          (item) => !isAutoacceptVisualTrackedEvent(item),
        ),
      ) + webAutoacceptVisualRequestsCount
    : 0;
  const remoteOwnerUnreadRequestsCount =
    unreadCountsBySection.prenotazioni ?? 0;
  const localCustomerCancellationUnreadCount = ownerTabBadgeDataReady
    ? countOwnerLogicalBookingEvents(
        ownerUnreadFrontendRequestEvents.filter(
          isCustomerCancellationRequestEvent,
        ),
      )
    : 0;
  const remoteCustomerCancellationUnreadCount =
    unreadCountsBySection.cancellazioni ?? 0;
  const visualCustomerCancellationUnreadCount =
    remoteCustomerCancellationUnreadCount;
  const [stableOwnerRequestsBadgeCount, setStableOwnerRequestsBadgeCount] =
    React.useState(0);
  const [
    hasStableOwnerRequestsBadgeCount,
    setHasStableOwnerRequestsBadgeCount,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!ownerTabBadgeDataReady) {
      return;
    }

    // During native refresh keep exactly the count that was displayed, not
    // the unrelated local event total (which can include composition phases).
    const nextCount = Math.max(0, Math.trunc(
      IS_WEB
        ? (localOwnerUnreadRequestEventsCount === 0 ? 0 : Math.max(localOwnerUnreadRequestEventsCount, remoteOwnerUnreadRequestsCount))
        : remoteOwnerUnreadRequestsCount,
    ));
    setStableOwnerRequestsBadgeCount((current) =>
      current === nextCount ? current : nextCount,
    );
    setHasStableOwnerRequestsBadgeCount((current) =>
      current ? current : true,
    );
  }, [
    localOwnerUnreadRequestEventsCount,
    ownerTabBadgeDataReady,
    remoteOwnerUnreadRequestsCount,
  ]);

  const visualRichiesteInAttesa = ownerTabBadgeDataReady
    ? remoteOwnerUnreadRequestsCount
    : hasStableOwnerRequestsBadgeCount
      ? stableOwnerRequestsBadgeCount
      : remoteOwnerUnreadRequestsCount;

  React.useEffect(() => {
    if (!ownerTabBadgeDataReady) {
      return;
    }

    const locallyUnreadEventKeys = new Set(
      ownerUnreadFrontendRequestEvents.map((item) =>
        buildLiveRequestBannerEventKey(item),
      ),
    );
    const cancellationRecords = canonicalFrontendRequests
      .filter((item) => item.stato === "Annullata")
      .map((item) => {
        const eventKey = buildLiveRequestBannerEventKey(item);
        const isCustomerCancellation = isCustomerCancellationRequestEvent(item);
        const isViewed =
          item.viewedBySalon === true ||
          isRequestEventViewed(item, viewedRequestIds);
        const isDeleted = isDeletedFrontendRequest(item);
        const isSuperseded = isSupersededCustomerCancellation(item);
        const isCountable = isOwnerCountableRequestNotification(item);
        const includedLocal = locallyUnreadEventKeys.has(eventKey);
        const reasonExcluded = includedLocal
          ? ""
          : !isCustomerCancellation
            ? "not_client_cancelled"
            : isViewed
              ? "read"
              : isDeleted
                ? "deleted_frontend_customer"
                : isSuperseded
                  ? "superseded_customer_cancellation"
                  : !isCountable
                    ? "not_countable_notification"
                    : "not_in_local_unread_events";

        return {
          requestId: item.id,
          eventKey,
          status: item.stato,
          cancellationSource: item.cancellationSource ?? null,
          viewedBySalon: item.viewedBySalon ?? null,
          includedLocal,
          reasonExcluded,
          createdAt: item.createdAt ?? null,
          date: item.data ?? null,
          time: item.ora ?? null,
        };
      });
  }, [
    canonicalFrontendRequests,
    isDeletedFrontendRequest,
    isRequestEventViewed,
    isSupersededCustomerCancellation,
    localCustomerCancellationUnreadCount,
    localOwnerUnreadRequestEventsCount,
    ownerTabBadgeDataReady,
    ownerUnreadFrontendRequestEvents,
    remoteOwnerUnreadRequestsCount,
    viewedRequestIds,
    visualRichiesteInAttesa,
  ]);

  React.useEffect(() => {
    if (!IS_ANDROID || !ownerTabBadgeDataReady) {
      return;
    }

    const previous = androidAutoacceptVisualBadgeSnapshotRef.current;
    if (visualAgendaPendingRequestsCount > previous.agenda) {
      logAndroidAutoacceptVisualFlow("agenda_plus_one_set", {
        previous: previous.agenda,
        next: visualAgendaPendingRequestsCount,
      });
    }
    if (visualRichiesteInAttesa > previous.richieste) {
      logAndroidAutoacceptVisualFlow("richieste_plus_one_set", {
        previous: previous.richieste,
        next: visualRichiesteInAttesa,
      });
    }
    androidAutoacceptVisualBadgeSnapshotRef.current = {
      agenda: visualAgendaPendingRequestsCount,
      richieste: visualRichiesteInAttesa,
    };
  }, [
    ownerTabBadgeDataReady,
    visualAgendaPendingRequestsCount,
    visualRichiesteInAttesa,
  ]);

  const visualClientiNonLetti = unreadCountsBySection.clienti ?? 0;

  React.useEffect(() => {
    if (IS_WEB || !ownerTabBadgeDataReady) {
      return;
    }

    const nextAppIconBadge = Math.max(
      0,
      Math.trunc(visualRichiesteInAttesa) + Math.trunc(visualClientiNonLetti),
    );

    if (nextAppIconBadge > 0) {
      setApplicationBadgeCountFloor(nextAppIconBadge);
      void syncApplicationBadgeCount(nextAppIconBadge);
      return;
    }

    clearApplicationBadgeCountFloor();
    void syncApplicationBadgeCount(0, {
      ignoreFloor: true,
      preserveAndroidNotificationOnZero: IS_ANDROID,
    });
  }, [ownerTabBadgeDataReady, visualClientiNonLetti, visualRichiesteInAttesa]);

  React.useEffect(() => {
    if (!ownerTabBadgeDataReady) {
      return;
    }

    void refreshBadges();
  }, [clienti, ownerTabBadgeDataReady, refreshBadges, richiestePrenotazione]);

  React.useEffect(() => {
    const unsubscribe = subscribeOwnerViewedNotificationChanges((payload) => {
      if (payload.ownerEmail !== normalizedSalonAccountEmail) {
        return;
      }

      if (payload.requestSignatures?.length) {
        setViewedRequestIds((current) =>
          Array.from(
            new Set([...current, ...(payload.requestSignatures ?? [])]),
          ),
        );
      }
    });

    return unsubscribe;
  }, [normalizedSalonAccountEmail]);

  React.useEffect(() => {
    const now = Date.now();
    const nextRecentlyHandled = new Map(
      recentlyHandledOwnerRequestIdsRef.current,
    );
    const nextRecentlyHandledSyncKeys = new Map(
      recentlyHandledOwnerRequestSyncKeysRef.current,
    );
    const nextAutoAcceptedSyncKeys = new Map(
      ownerAutoAcceptedRequestSyncKeysRef.current,
    );
    const nextPendingInstanceKeys = new Map(
      ownerPendingRequestInstanceKeysRef.current,
    );
    const nextKnownEventStatus = new Map(
      ownerKnownRequestEventStatusRef.current,
    );
    const activeEventStatusKeys = new Set<string>();
    const activePendingTimerKeys = new Set<string>();
    const activePendingSyncKeys = new Set<string>();
    let bannerStateChanged = false;

    richiestePrenotazione.forEach((item) => {
      if ((item.origine ?? "frontend") !== "frontend") {
        return;
      }

      const foregroundPushReceivedAt =
        ownerForegroundPushBannerRequestIdsRef.current.get(item.id) ?? 0;
      const wasHandledByFreshForegroundPush =
        IS_IOS &&
        foregroundPushReceivedAt > 0 &&
        now - foregroundPushReceivedAt <=
          OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS;
      if (wasHandledByFreshForegroundPush) {
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        if (bannerShownKey) {
          ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
          recentlyBanneredOwnerRequestEventKeysRef.current.set(
            bannerShownKey,
            foregroundPushReceivedAt,
          );
          bannerStateChanged = true;
        }
      }

      const syncKey = buildFrontendRequestSyncKey(item);
      if (syncKey) {
        activeEventStatusKeys.add(syncKey);
        const previousStatusKey = nextKnownEventStatus.get(syncKey);
        const nextStatusKey = [
          item.stato ?? "unknown",
          item.cancellationSource ?? "none",
          item.viewedBySalon === true ? "read" : "unread",
        ].join(":");

        if (
          isCustomerCancellationRequestEvent(item) &&
          item.viewedBySalon !== true
        ) {
          const bannerEventKey = buildLiveRequestBannerEventKey(item);
          const bannerShownKey = buildOwnerLiveBannerShownKey(item);
          const eventTimestamp = parseOwnerLiveRequestBannerTimestamp(item);
          const isRecentCancellationEvent =
            typeof eventTimestamp === "number" &&
            Number.isFinite(eventTimestamp) &&
            now - eventTimestamp <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS;
          const isNewCancellationTransition =
            (!!previousStatusKey &&
              !previousStatusKey.startsWith("Annullata:cliente")) ||
            (!previousStatusKey && isRecentCancellationEvent);
          const cancellationBannerAlreadyClaimed =
            isOwnerCustomerCancellationBannerClaimed(item);

          if (
            wasHandledByFreshForegroundPush ||
            cancellationBannerAlreadyClaimed
          ) {
            ownerFreshCustomerCancellationEventKeysRef.current.delete(
              bannerEventKey,
            );
          } else if (isNewCancellationTransition && isRecentCancellationEvent) {
            ownerFreshCustomerCancellationEventKeysRef.current.add(
              bannerEventKey,
            );
          } else if (
            isNewCancellationTransition &&
            bannerShownKey &&
            !isRecentCancellationEvent
          ) {
            ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
            recentlyBanneredOwnerRequestEventKeysRef.current.set(
              bannerShownKey,
              now,
            );
            bannerStateChanged = true;
          }
        }

        nextKnownEventStatus.set(syncKey, nextStatusKey);
      }

      if (item.stato === "In attesa") {
        const timerKey = buildOwnerPendingRequestTimerKey(item);
        const instanceKey = buildOwnerPendingRequestInstanceKey(item);

        if (syncKey) {
          activePendingSyncKeys.add(syncKey);
        }

        if (timerKey) {
          activePendingTimerKeys.add(timerKey);
          const previousInstanceKey = nextPendingInstanceKeys.get(timerKey);

          if (previousInstanceKey && previousInstanceKey !== instanceKey) {
            ownerPendingFirstSeenAtRef.current.delete(timerKey);
            if (ownerPendingBannerShownKeysRef.current.delete(timerKey)) {
              bannerStateChanged = true;
            }
            recentlyBanneredOwnerRequestEventKeysRef.current.delete(timerKey);
          }

          nextPendingInstanceKeys.set(timerKey, instanceKey);
        }
      }

      const handledBySalon =
        item.stato === "Accettata" ||
        item.stato === "Rifiutata" ||
        (item.stato === "Annullata" && item.cancellationSource === "salone");

      if (handledBySalon) {
        const handledSyncKey = buildFrontendRequestSyncKey(item);
        const wasAutoAccepted =
          item.stato === "Accettata" &&
          nextAutoAcceptedSyncKeys.has(handledSyncKey);

        if (IS_ANDROID && wasAutoAccepted) {
          const stableVisualKey =
            buildOwnerForegroundStableBannerKey(item) ||
            buildOwnerLiveBannerShownKey(item) ||
            buildLiveRequestBannerEventKey(item);

          if (
            stableVisualKey &&
            androidAutoacceptVisualRequestsRef.current[stableVisualKey]
          ) {
            logAndroidAutoacceptVisualFlow(
              "temporary_state_kept_until_shared_expiry",
              {
                requestId: item.id,
                stableVisualKey,
                expiresAt:
                  androidAutoacceptVisualRequestsRef.current[stableVisualKey]
                    .expiresAt,
              },
            );
          }
        }

        if (!wasAutoAccepted && item.id) {
          nextRecentlyHandled.set(item.id, now);
        }
        if (!wasAutoAccepted) {
          nextRecentlyHandledSyncKeys.set(handledSyncKey, now);
        }
      }
    });

    activePendingSyncKeys.forEach((syncKey) => {
      nextRecentlyHandledSyncKeys.delete(syncKey);
    });

    Array.from(nextPendingInstanceKeys.keys()).forEach((timerKey) => {
      if (!activePendingTimerKeys.has(timerKey)) {
        nextPendingInstanceKeys.delete(timerKey);
      }
    });
    Array.from(nextKnownEventStatus.keys()).forEach((syncKey) => {
      if (!activeEventStatusKeys.has(syncKey)) {
        nextKnownEventStatus.delete(syncKey);
      }
    });

    Array.from(nextRecentlyHandled.entries()).forEach(
      ([requestId, handledAt]) => {
        if (now - handledAt > OWNER_RECENTLY_HANDLED_REQUEST_TTL_MS) {
          nextRecentlyHandled.delete(requestId);
        }
      },
    );

    Array.from(nextRecentlyHandledSyncKeys.entries()).forEach(
      ([syncKey, handledAt]) => {
        if (now - handledAt > OWNER_RECENTLY_HANDLED_REQUEST_TTL_MS) {
          nextRecentlyHandledSyncKeys.delete(syncKey);
        }
      },
    );
    Array.from(nextAutoAcceptedSyncKeys.entries()).forEach(
      ([syncKey, acceptedAt]) => {
        if (now - acceptedAt > OWNER_RECENTLY_HANDLED_REQUEST_TTL_MS) {
          nextAutoAcceptedSyncKeys.delete(syncKey);
        }
      },
    );

    recentlyHandledOwnerRequestIdsRef.current = nextRecentlyHandled;
    recentlyHandledOwnerRequestSyncKeysRef.current =
      nextRecentlyHandledSyncKeys;
    ownerAutoAcceptedRequestSyncKeysRef.current = nextAutoAcceptedSyncKeys;
    ownerKnownRequestEventStatusRef.current = nextKnownEventStatus;
    ownerPendingRequestInstanceKeysRef.current = nextPendingInstanceKeys;

    if (bannerStateChanged) {
      void persistOwnerPendingBannerShownState();
    }
  }, [
    isOwnerCustomerCancellationBannerClaimed,
    persistOwnerPendingBannerShownState,
    richiestePrenotazione,
  ]);

  const dismissLiveRequestBanner = React.useCallback(() => {
    liveRequestBannerTimeoutTokenRef.current += 1;
    if (liveRequestBannerTimeoutRef.current) {
      clearTimeout(liveRequestBannerTimeoutRef.current);
      liveRequestBannerTimeoutRef.current = null;
    }
    androidLiveBannerActiveItemsRef.current = [];
    liveBannerTranslateXSV.value = 0;
    liveBannerTranslateYSV.value = 0;
    setLiveRequestBanner(null);
  }, [liveBannerTranslateXSV, liveBannerTranslateYSV]);

  React.useEffect(() => {
    const requestId = liveRequestBanner?.requestId?.trim() ?? "";
    if (!requestId || liveRequestBanner?.targetSection !== "cancelled") {
      return;
    }

    ownerPresentedCancellationBannerRequestIdsRef.current.set(
      requestId,
      Date.now(),
    );
  }, [liveRequestBanner]);

  React.useEffect(() => {
    if (!IS_IOS) {
      return undefined;
    }

    return subscribeOwnerForegroundBannerPush((event) => {
      const now = Date.now();
      ownerForegroundPushBannerLogicalEventsRef.current.forEach(
        (receivedAt, logicalEventKey) => {
          if (now - receivedAt > OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS) {
            ownerForegroundPushBannerLogicalEventsRef.current.delete(
              logicalEventKey,
            );
          }
        },
      );
      ownerForegroundPushBannerRequestIdsRef.current.forEach(
        (receivedAt, requestId) => {
          if (now - receivedAt > OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS) {
            ownerForegroundPushBannerRequestIdsRef.current.delete(requestId);
          }
        },
      );
      ownerForegroundPushBannerRequestIdsRef.current.set(
        event.requestId,
        event.receivedAt,
      );

      const normalizedStatus = (event.status ?? "").trim().toLowerCase();
      const normalizedCancellationSource = (event.cancellationSource ?? "")
        .trim()
        .toLowerCase();
      const logicalForegroundEventKey = [
        event.requestId.trim(),
        normalizedStatus || "unknown",
        normalizedCancellationSource || "none",
      ].join(":");
      const previousLogicalForegroundEventAt =
        ownerForegroundPushBannerLogicalEventsRef.current.get(
          logicalForegroundEventKey,
        ) ?? 0;
      if (
        previousLogicalForegroundEventAt > 0 &&
        now - previousLogicalForegroundEventAt <=
          OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS
      ) {
        return;
      }
      ownerForegroundPushBannerLogicalEventsRef.current.set(
        logicalForegroundEventKey,
        event.receivedAt,
      );
      const isCustomerCancellation =
        normalizedStatus === "cancelled" &&
        (normalizedCancellationSource === "cliente" ||
          normalizedCancellationSource === "customer");
      if (isCustomerCancellation) {
        // Push e realtime sono due trasporti dello stesso evento logico. Un
        // breve accodamento consente alle fasi di composizioni, pose e servizi
        // dipendenti di convergere in un solo banner senza perdere il fallback
        // push quando realtime e' in ritardo.
        ownerPendingCancellationPushesRef.current.set(event.requestId, event);
        if (!ownerPendingCancellationPushTimerRef.current) {
          ownerPendingCancellationPushTimerRef.current = setTimeout(() => {
            ownerPendingCancellationPushTimerRef.current = null;
            const pendingEvents = Array.from(
              ownerPendingCancellationPushesRef.current.values(),
            );
            ownerPendingCancellationPushesRef.current.clear();
            const unclaimedEvents = pendingEvents.filter(
              (pendingEvent) =>
                !isOwnerCustomerCancellationBannerClaimed({
                  id: pendingEvent.requestId,
                }),
            );

            if (unclaimedEvents.length === 0) {
              return;
            }

            const presentedAt = Date.now();
            unclaimedEvents.forEach((pendingEvent) => {
              recordOwnerCustomerCancellationBannerClaim(
                { id: pendingEvent.requestId },
                presentedAt,
              );
              ownerPresentedCancellationBannerRequestIdsRef.current.set(
                pendingEvent.requestId,
                presentedAt,
              );
              const canonicalRequest = canonicalFrontendRequests.find(
                (item) => item.id === pendingEvent.requestId,
              );
              if (canonicalRequest) {
                const shownKey = buildOwnerLiveBannerShownKey(canonicalRequest);
                if (shownKey) {
                  ownerPendingBannerShownKeysRef.current.add(shownKey);
                  recentlyBanneredOwnerRequestEventKeysRef.current.set(
                    shownKey,
                    presentedAt,
                  );
                }
                ownerFreshCustomerCancellationEventKeysRef.current.delete(
                  buildLiveRequestBannerEventKey(canonicalRequest),
                );
              }
            });

            const representativeEvent = unclaimedEvents[0];
            const isLinkedCancellation = unclaimedEvents.length > 1;
            const bannerDisplayKey = `ios-push-cancellation:${representativeEvent.eventKey}`;
            setLiveRequestBanner({
              eventKey: bannerDisplayKey,
              title: isLinkedCancellation
                ? "Prenotazione annullata dal cliente"
                : representativeEvent.title,
              body: representativeEvent.body,
              requestDate: representativeEvent.appointmentDate,
              requestId: representativeEvent.requestId,
              requestTime: representativeEvent.appointmentTime,
              targetTab: "prenotazioni",
              targetSection: "cancelled",
            });
            liveBannerTranslateXSV.value = 0;
            liveBannerTranslateYSV.value = 0;

            if (liveRequestBannerTimeoutRef.current) {
              clearTimeout(liveRequestBannerTimeoutRef.current);
              liveRequestBannerTimeoutRef.current = null;
            }
            const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
            liveRequestBannerTimeoutTokenRef.current = timeoutToken;
            liveRequestBannerTimeoutRef.current = setTimeout(() => {
              if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
                return;
              }
              dismissLiveRequestBanner();
            }, OWNER_LIVE_REQUEST_BANNER_DURATION_MS);
          }, OWNER_CANCELLATION_PUSH_COALESCE_MS);
        }
        return;
      }
      const matchingRequest = canonicalFrontendRequests.find(
        (item) => item.id === event.requestId,
      );
      const matchingBannerShownKey = matchingRequest
        ? buildOwnerLiveBannerShownKey(matchingRequest)
        : "";
      if (matchingRequest) {
        if (matchingBannerShownKey) {
          ownerPendingBannerShownKeysRef.current.add(matchingBannerShownKey);
          recentlyBanneredOwnerRequestEventKeysRef.current.set(
            matchingBannerShownKey,
            now,
          );
        }
      }

      const bannerDisplayKey = `ios-push:${event.eventKey}`;

      setLiveRequestBanner({
        eventKey: bannerDisplayKey,
        title: event.title,
        body: event.body,
        requestDate: event.appointmentDate,
        requestId: event.requestId,
        requestTime: event.appointmentTime,
        targetTab: isCustomerCancellation ? "prenotazioni" : "agenda",
        targetSection: isCustomerCancellation ? "cancelled" : null,
      });
      liveBannerTranslateXSV.value = 0;
      liveBannerTranslateYSV.value = 0;

      if (liveRequestBannerTimeoutRef.current) {
        clearTimeout(liveRequestBannerTimeoutRef.current);
        liveRequestBannerTimeoutRef.current = null;
      }
      const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
      liveRequestBannerTimeoutTokenRef.current = timeoutToken;
      liveRequestBannerTimeoutRef.current = setTimeout(() => {
        if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
          return;
        }
        dismissLiveRequestBanner();
      }, OWNER_LIVE_REQUEST_BANNER_DURATION_MS);
    });
  }, [
    canonicalFrontendRequests,
    dismissLiveRequestBanner,
    isOwnerCustomerCancellationBannerClaimed,
    liveBannerTranslateXSV,
    liveBannerTranslateYSV,
    recordOwnerCustomerCancellationBannerClaim,
  ]);

  React.useEffect(
    () => () => {
      if (ownerPendingCancellationPushTimerRef.current) {
        clearTimeout(ownerPendingCancellationPushTimerRef.current);
        ownerPendingCancellationPushTimerRef.current = null;
      }
      ownerPendingCancellationPushesRef.current.clear();
    },
    [],
  );

  React.useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== "active") {
        return;
      }

      const now = Date.now();
      ownerAppForegroundSinceRef.current = now;
      ownerLiveBannerBootstrappedRef.current = false;
      if (IS_ANDROID) {
        console.log("[BACKOFFICE_CUSTOMBAR_CLEANUP]", {
          action: "resume_keep_foreground_dedupe",
          shownKeys: androidForegroundShownBannerKeysRef.current.size,
          knownKeys: androidForegroundKnownBannerKeysRef.current.size,
        });
      }
      setOwnerAppForegroundEpoch(now);
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!liveRequestBanner) {
      return;
    }

    const matchingLiveRequest = ownerLiveBannerRequestEvents.some((item) => {
      if (
        liveRequestBanner.requestId?.trim() &&
        item.id === liveRequestBanner.requestId.trim()
      ) {
        return true;
      }

      return (
        buildLiveRequestBannerEventKey(item) === liveRequestBanner.eventKey
      );
    });

    if (!matchingLiveRequest) {
      return;
    }
  }, [
    dismissLiveRequestBanner,
    liveRequestBanner,
    ownerLiveBannerRequestEvents,
  ]);

  React.useEffect(() => {
    const ownerAutoAcceptInFlightIds = ownerAutoAcceptInFlightIdsRef.current;
    const ownerPendingFirstSeenAt = ownerPendingFirstSeenAtRef.current;
    const ownerPendingBannerShownKeys = ownerPendingBannerShownKeysRef.current;

    return () => {
      if (liveRequestBannerTimeoutRef.current) {
        clearTimeout(liveRequestBannerTimeoutRef.current);
        liveRequestBannerTimeoutRef.current = null;
      }
      Object.values(ownerAutoAcceptTimersRef.current).forEach((timer) =>
        clearTimeout(timer),
      );
      ownerAutoAcceptTimersRef.current = {};
      ownerAutoAcceptInFlightIds.clear();
      ownerAutoAcceptQueueRef.current = [];
      ownerAutoAcceptedRequestSyncKeysRef.current.clear();
      ownerAutoAcceptProcessingRef.current = false;
      ownerPendingFirstSeenAt.clear();
      ownerPendingBannerShownKeys.clear();
      ownerPendingFlowBootstrappedRef.current = false;
      ownerLiveBannerBootstrappedRef.current = false;
    };
  }, []);

  const processOwnerAutoAcceptQueue = React.useCallback(() => {
    if (ownerAutoAcceptProcessingRef.current) {
      return;
    }

    const salonCode = salonWorkspace.salonCode?.trim() ?? "";
    if (!salonCode) {
      ownerAutoAcceptQueueRef.current = [];
      return;
    }

    const runNext = () => {
      const nextTimerKey = ownerAutoAcceptQueueRef.current.shift();
      if (!nextTimerKey) {
        ownerAutoAcceptProcessingRef.current = false;
        return;
      }

      const latestMatchingRequest =
        ownerAutoAcceptPendingFrontendRequestsRef.current.find(
          (candidate) =>
            buildOwnerPendingRequestTimerKey(candidate) === nextTimerKey,
        );

      if (!latestMatchingRequest?.id?.trim()) {
        runNext();
        return;
      }

      ownerAutoAcceptProcessingRef.current = true;
      ownerAutoAcceptInFlightIdsRef.current.add(nextTimerKey);
      registerWebAutoacceptVisualRequests([latestMatchingRequest]);
      ownerAutoAcceptedRequestSyncKeysRef.current.set(
        buildFrontendRequestSyncKey(latestMatchingRequest),
        Date.now(),
      );
      void updateBookingRequestStatusForSalon({
        salonCode,
        requestId: latestMatchingRequest.id,
        status: "Accettata",
        markViewedBySalon: !IS_ANDROID,
      })
        .catch((error) => {
          console.log("Auto-accettazione richiesta non completata:", error);
        })
        .finally(() => {
          ownerAutoAcceptInFlightIdsRef.current.delete(nextTimerKey);
          void refreshBadges();
          setTimeout(runNext, 220);
        });
    };

    ownerAutoAcceptProcessingRef.current = true;
    runNext();
  }, [
    salonWorkspace.salonCode,
    refreshBadges,
    registerWebAutoacceptVisualRequests,
    updateBookingRequestStatusForSalon,
  ]);

  const enqueueOwnerAutoAcceptRequest = React.useCallback(
    (timerKey: string) => {
      if (
        ownerAutoAcceptInFlightIdsRef.current.has(timerKey) ||
        ownerAutoAcceptQueueRef.current.includes(timerKey)
      ) {
        return;
      }

      ownerAutoAcceptQueueRef.current.push(timerKey);
      processOwnerAutoAcceptQueue();
    },
    [processOwnerAutoAcceptQueue],
  );

  React.useEffect(() => {
    const autoAcceptEnabled = ownerAutoAcceptPendingFrontendRequests.length > 0;
    const salonCode = salonWorkspace.salonCode?.trim() ?? "";
    const activePendingTimerKeys = new Set<string>();
    const activeUnreadEventKeys = new Set<string>();
    if (
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedDeletedCustomerIdentityKeys
    ) {
      return;
    }

    const notificationStateReady =
      hasLoadedViewedRequestIds &&
      hasLoadedOwnerPendingBannerShownState &&
      ownerTabBadgeDataReady;

    if (notificationStateReady) {
      ownerUnreadFrontendRequestEvents.forEach((item) => {
        const eventKey = buildOwnerLiveBannerTimerKey(item);
        if (!eventKey) {
          return;
        }

        activeUnreadEventKeys.add(eventKey);
        const seededSeenAt = getOrSeedOwnerPendingFirstSeenAt(item);
        if (!Number.isFinite(seededSeenAt)) {
          ownerPendingFirstSeenAtRef.current.set(eventKey, Date.now());
        }
      });
    }

    ownerAutoAcceptPendingFrontendRequests.forEach((item) => {
      const timerKey = buildOwnerPendingRequestTimerKey(item);
      if (!timerKey) {
        return;
      }

      activePendingTimerKeys.add(timerKey);
      const seededSeenAt = getOrSeedOwnerPendingFirstSeenAt(item);
      if (!Number.isFinite(seededSeenAt)) {
        ownerPendingFirstSeenAtRef.current.set(timerKey, Date.now());
      }
    });

    ownerPendingFlowBootstrappedRef.current = true;

    if (notificationStateReady) {
      Array.from(ownerPendingFirstSeenAtRef.current.keys()).forEach(
        (timerKey) => {
          if (
            !activeUnreadEventKeys.has(timerKey) &&
            !activePendingTimerKeys.has(timerKey)
          ) {
            ownerPendingFirstSeenAtRef.current.delete(timerKey);
          }
        },
      );
      Array.from(
        recentlyBanneredOwnerRequestEventKeysRef.current.entries(),
      ).forEach(([eventKey, banneredAt]) => {
        if (Date.now() - banneredAt > OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS) {
          recentlyBanneredOwnerRequestEventKeysRef.current.delete(eventKey);
        }
      });
      void persistOwnerPendingBannerShownState();
    }

    if (
      !autoAcceptEnabled ||
      !salonCode ||
      !OWNER_AUTO_ACCEPT_CLIENT_FALLBACK_ENABLED
    ) {
      Object.values(ownerAutoAcceptTimersRef.current).forEach((timer) =>
        clearTimeout(timer),
      );
      ownerAutoAcceptTimersRef.current = {};
      ownerAutoAcceptQueueRef.current = [];
      ownerAutoAcceptProcessingRef.current = false;
      ownerAutoAcceptInFlightIdsRef.current.clear();
      return;
    }

    ownerAutoAcceptPendingFrontendRequests.forEach((item) => {
      const timerKey = buildOwnerPendingRequestTimerKey(item);
      if (!timerKey || ownerAutoAcceptInFlightIdsRef.current.has(timerKey)) {
        return;
      }

      if (ownerAutoAcceptTimersRef.current[timerKey]) {
        return;
      }

      const firstSeenAtMs = getOrSeedOwnerPendingFirstSeenAt(item);
      const remainingDelayMs =
        firstSeenAtMs > 0
          ? Math.max(
              0,
              OWNER_AUTO_ACCEPT_DELAY_MS -
                Math.max(0, Date.now() - firstSeenAtMs),
            )
          : OWNER_AUTO_ACCEPT_DELAY_MS;

      ownerAutoAcceptTimersRef.current[timerKey] = setTimeout(() => {
        delete ownerAutoAcceptTimersRef.current[timerKey];
        enqueueOwnerAutoAcceptRequest(timerKey);
      }, remainingDelayMs);
    });

    Object.keys(ownerAutoAcceptTimersRef.current).forEach((timerKey) => {
      if (!activePendingTimerKeys.has(timerKey)) {
        clearTimeout(ownerAutoAcceptTimersRef.current[timerKey]);
        delete ownerAutoAcceptTimersRef.current[timerKey];
      }
    });
    ownerAutoAcceptQueueRef.current = ownerAutoAcceptQueueRef.current.filter(
      (timerKey) => activePendingTimerKeys.has(timerKey),
    );
  }, [
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    hasLoadedViewedRequestIds,
    ownerInitialDataHydrating,
    ownerLivePendingFrontendRequests,
    ownerUnreadFrontendRequestEvents,
    ownerServerSyncReady,
    ownerTabBadgeDataReady,
    ownerAutoAcceptPendingFrontendRequests,
    salonWorkspace.salonCode,
    enqueueOwnerAutoAcceptRequest,
    getOrSeedOwnerPendingFirstSeenAt,
    persistOwnerPendingBannerShownState,
  ]);

  React.useEffect(() => {
    if (
      !IS_ANDROID ||
      !liveRequestBanner ||
      androidForegroundBannerQueue.length === 0
    ) {
      return;
    }

    const now = Date.now();
    const mergedByKey = new Map<
      string,
      (typeof richiestePrenotazione)[number]
    >();
    androidLiveBannerActiveItemsRef.current.forEach((item) => {
      const key =
        buildOwnerForegroundStableBannerKey(item) ||
        buildLiveRequestBannerEventKey(item);
      if (key) {
        mergedByKey.set(key, item);
      }
    });
    androidForegroundBannerQueue.forEach((item) => {
      const key =
        buildOwnerForegroundStableBannerKey(item) ||
        buildLiveRequestBannerEventKey(item);
      if (key) {
        mergedByKey.set(key, item);
        androidForegroundShownBannerKeysRef.current.add(key);
        androidForegroundKnownBannerKeysRef.current.add(key);
        androidForegroundRecentlyBanneredKeysRef.current.set(key, now);
      }
    });

    const mergedRequests = Array.from(mergedByKey.values()).sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    if (mergedRequests.length === 0) {
      setAndroidForegroundBannerQueue([]);
      return;
    }

    setAndroidForegroundBannerQueue([]);

    if (shouldSuppressNativeSinglePendingBatchBanner(mergedRequests)) {
      logBackofficeForegroundParity("android_generic_batch_suppressed", {
        count: mergedRequests.length,
        customBarEnqueue: false,
      });
      return;
    }

    androidLiveBannerActiveItemsRef.current = mergedRequests;
    const bannerDurationMs = getAndroidOwnerBannerDurationMs(mergedRequests);
    const summary = buildOwnerLiveRequestBatchSummary(mergedRequests);
    const bannerDisplayKey = `android-live-batch-${now}-${mergedRequests.length}`;
    setLiveRequestBanner({
      eventKey: bannerDisplayKey,
      title: summary.title,
      body: summary.body,
      requestDate:
        mergedRequests[0]?.data ?? liveRequestBanner.requestDate ?? null,
      requestId: mergedRequests[0]?.id ?? liveRequestBanner.requestId ?? null,
      requestTime:
        mergedRequests[0]?.ora ?? liveRequestBanner.requestTime ?? null,
      targetTab: summary.targetTab,
      targetSection: summary.targetSection,
    });

    logAndroidAutoacceptVisualFlow("banner_shown", {
      requestId: mergedRequests[0]?.id ?? null,
      count: mergedRequests.length,
      mode: "merged_live_batch",
      durationMs: bannerDurationMs,
    });
    logBackofficeForegroundParity("android_banner_update_batch", {
      count: mergedRequests.length,
      eventId: bannerDisplayKey,
      customBarEnqueue: true,
      durationMs: bannerDurationMs,
    });

    void playOwnerForegroundBannerSound({ dedupeKey: bannerDisplayKey }).catch(
      () => null,
    );
    liveBannerTranslateXSV.value = 0;
    liveBannerTranslateYSV.value = 0;
    if (liveRequestBannerTimeoutRef.current) {
      clearTimeout(liveRequestBannerTimeoutRef.current);
    }
    const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
    liveRequestBannerTimeoutTokenRef.current = timeoutToken;
    liveRequestBannerTimeoutRef.current = setTimeout(() => {
      if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
        return;
      }
      logAndroidAutoacceptVisualFlow("banner_hidden_after_5s", {
        requestId: mergedRequests[0]?.id ?? null,
        count: mergedRequests.length,
        durationMs: bannerDurationMs,
      });
      dismissLiveRequestBanner();
    }, bannerDurationMs);
  }, [
    androidForegroundBannerQueue,
    dismissLiveRequestBanner,
    getAndroidOwnerBannerDurationMs,
    liveBannerTranslateXSV,
    liveBannerTranslateYSV,
    liveRequestBanner,
  ]);

  React.useEffect(() => {
    if (
      !IS_ANDROID ||
      liveRequestBanner ||
      androidForegroundBannerQueue.length === 0
    ) {
      return;
    }

    const now = Date.now();
    const sortedQueuedRequests = [...androidForegroundBannerQueue].sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    const markShown = (item: (typeof richiestePrenotazione)[number]) => {
      const key = buildOwnerForegroundStableBannerKey(item);
      if (!key) return;
      androidForegroundShownBannerKeysRef.current.add(key);
      androidForegroundKnownBannerKeysRef.current.add(key);
      androidForegroundRecentlyBanneredKeysRef.current.set(key, now);
    };

    if (sortedQueuedRequests.length > 1) {
      const bannerDurationMs =
        getAndroidOwnerBannerDurationMs(sortedQueuedRequests);
      sortedQueuedRequests.forEach(markShown);
      setAndroidForegroundBannerQueue([]);
      if (shouldSuppressNativeSinglePendingBatchBanner(sortedQueuedRequests)) {
        logBackofficeForegroundParity("android_generic_batch_suppressed", {
          count: sortedQueuedRequests.length,
          customBarEnqueue: false,
        });
        return;
      }
      const summary = buildOwnerLiveRequestBatchSummary(sortedQueuedRequests);
      const bannerDisplayKey = `android-batch-${now}-${sortedQueuedRequests.length}`;
      androidLiveBannerActiveItemsRef.current = sortedQueuedRequests;

      setLiveRequestBanner({
        eventKey: bannerDisplayKey,
        title: summary.title,
        body: summary.body,
        requestDate: sortedQueuedRequests[0]?.data ?? null,
        requestId: sortedQueuedRequests[0]?.id ?? null,
        requestTime: sortedQueuedRequests[0]?.ora ?? null,
        targetTab: summary.targetTab,
        targetSection: summary.targetSection,
      });
      logBackofficeForegroundParity("android_banner_show_batch", {
        count: sortedQueuedRequests.length,
        eventId: bannerDisplayKey,
        customBarEnqueue: true,
        durationMs: bannerDurationMs,
      });
      logAndroidAutoacceptVisualFlow("banner_shown", {
        requestId: sortedQueuedRequests[0]?.id ?? null,
        appointmentId: null,
        count: sortedQueuedRequests.length,
        durationMs: bannerDurationMs,
      });
      void playOwnerForegroundBannerSound({
        dedupeKey: bannerDisplayKey,
      }).catch(() => null);
      liveBannerTranslateXSV.value = 0;
      liveBannerTranslateYSV.value = 0;
      if (liveRequestBannerTimeoutRef.current) {
        clearTimeout(liveRequestBannerTimeoutRef.current);
      }
      const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
      liveRequestBannerTimeoutTokenRef.current = timeoutToken;
      liveRequestBannerTimeoutRef.current = setTimeout(() => {
        if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
          return;
        }
        logAndroidAutoacceptVisualFlow("banner_hidden_after_5s", {
          requestId: sortedQueuedRequests[0]?.id ?? null,
          durationMs: bannerDurationMs,
        });
        dismissLiveRequestBanner();
      }, bannerDurationMs);
      return;
    }

    const nextBannerRequest = sortedQueuedRequests[0];
    const bannerKey = buildOwnerForegroundStableBannerKey(nextBannerRequest);
    if (!bannerKey) {
      setAndroidForegroundBannerQueue((current) => current.slice(1));
      return;
    }

    markShown(nextBannerRequest);
    androidLiveBannerActiveItemsRef.current = [nextBannerRequest];
    setAndroidForegroundBannerQueue((current) =>
      current.filter(
        (item) => buildOwnerForegroundStableBannerKey(item) !== bannerKey,
      ),
    );

    const isCustomerCancellation =
      isCustomerCancellationRequestEvent(nextBannerRequest);
    const isAcceptedOperatorChange =
      nextBannerRequest.stato === "Accettata" &&
      nextBannerRequest.operatorChangeStatus === "accepted";
    const bannerDurationMs = getAndroidOwnerBannerDurationMs([
      nextBannerRequest,
    ]);
    const customerLabel = [
      nextBannerRequest.nome?.trim(),
      nextBannerRequest.cognome?.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const serviceLabel = nextBannerRequest.servizio?.trim() || "Servizio";
    const datetimeLabel = formatOwnerPushDateTimeLabel(
      nextBannerRequest.data,
      nextBannerRequest.ora,
    );
    const operatorLabel = nextBannerRequest.operatoreNome?.trim() ?? "";
    const roleLabel = nextBannerRequest.mestiereRichiesto?.trim() ?? "";
    const bannerBodyParts = [
      customerLabel || "Cliente",
      serviceLabel ? `Servizio: ${serviceLabel}` : null,
      roleLabel ? `Mestiere: ${roleLabel}` : null,
      datetimeLabel ? `Appuntamento: ${datetimeLabel}` : null,
      operatorLabel ? `Operatore: ${operatorLabel}` : null,
    ].filter(Boolean);

    setLiveRequestBanner({
      eventKey: bannerKey,
      title: isCustomerCancellation
        ? "Richiesta annullata dal cliente"
        : isAcceptedOperatorChange
          ? "Cambio operatore accettato"
          : nextBannerRequest.stato === "Accettata"
            ? "Richiesta auto-accettata"
            : "Nuova richiesta prenotazione",
      body: bannerBodyParts.join(". "),
      requestDate: nextBannerRequest.data ?? null,
      requestId: nextBannerRequest.id ?? null,
      requestTime: nextBannerRequest.ora ?? null,
      targetTab:
        isCustomerCancellation || isAcceptedOperatorChange
          ? "prenotazioni"
          : "agenda",
      targetSection: isCustomerCancellation
        ? "cancelled"
        : isAcceptedOperatorChange
          ? "accepted"
          : null,
    });
    logBackofficeForegroundParity("android_banner_show", {
      platform: Platform.OS,
      role: "owner",
      requestId: nextBannerRequest.id,
      status: nextBannerRequest.stato,
      notificationId: bannerKey,
      eventId: bannerKey,
      customBarEnqueue: true,
      targetTab: isCustomerCancellation ? "prenotazioni" : "agenda",
      durationMs: bannerDurationMs,
    });
    logAndroidAutoacceptVisualFlow("banner_shown", {
      requestId: nextBannerRequest.id,
      appointmentId: null,
      receivedAt: nextBannerRequest.createdAt ?? null,
      status: nextBannerRequest.stato,
      durationMs: bannerDurationMs,
    });
    void playOwnerForegroundBannerSound({ dedupeKey: bannerKey }).catch(
      () => null,
    );
    liveBannerTranslateXSV.value = 0;
    liveBannerTranslateYSV.value = 0;
    if (liveRequestBannerTimeoutRef.current) {
      clearTimeout(liveRequestBannerTimeoutRef.current);
    }
    const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
    liveRequestBannerTimeoutTokenRef.current = timeoutToken;
    liveRequestBannerTimeoutRef.current = setTimeout(() => {
      if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
        return;
      }
      logAndroidAutoacceptVisualFlow("banner_hidden_after_5s", {
        requestId: nextBannerRequest.id,
        durationMs: bannerDurationMs,
      });
      dismissLiveRequestBanner();
    }, bannerDurationMs);
  }, [
    androidForegroundBannerQueue,
    dismissLiveRequestBanner,
    getAndroidOwnerBannerDurationMs,
    liveBannerTranslateXSV,
    liveBannerTranslateYSV,
    liveRequestBanner,
  ]);

  React.useEffect(() => {
    if (
      !IS_ANDROID ||
      !liveRequestBanner ||
      queuedLiveBannerRequests.length === 0
    ) {
      return;
    }

    const now = Date.now();
    const mergedByKey = new Map<
      string,
      (typeof richiestePrenotazione)[number]
    >();
    androidLiveBannerActiveItemsRef.current.forEach((item) => {
      mergedByKey.set(buildLiveRequestBannerEventKey(item), item);
    });
    queuedLiveBannerRequests.forEach((item) => {
      mergedByKey.set(buildLiveRequestBannerEventKey(item), item);
      const bannerShownKey = buildOwnerLiveBannerShownKey(item);
      if (bannerShownKey) {
        ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
        recentlyBanneredOwnerRequestEventKeysRef.current.set(
          bannerShownKey,
          now,
        );
      }
    });

    const mergedRequests = Array.from(mergedByKey.values()).sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    if (mergedRequests.length === 0) {
      setQueuedLiveBannerRequests([]);
      return;
    }

    setQueuedLiveBannerRequests([]);
    void persistOwnerPendingBannerShownState();

    if (shouldSuppressNativeSinglePendingBatchBanner(mergedRequests)) {
      logBackofficeForegroundParity("android_generic_batch_suppressed", {
        count: mergedRequests.length,
        customBarEnqueue: false,
      });
      return;
    }

    androidLiveBannerActiveItemsRef.current = mergedRequests;
    const bannerDurationMs = getAndroidOwnerBannerDurationMs(mergedRequests);

    const summary = buildOwnerLiveRequestBatchSummary(mergedRequests);
    const bannerDisplayKey = `android-shared-live-batch-${now}-${mergedRequests.length}`;
    setLiveRequestBanner({
      eventKey: bannerDisplayKey,
      title: summary.title,
      body: summary.body,
      requestDate:
        mergedRequests[0]?.data ?? liveRequestBanner.requestDate ?? null,
      requestId: mergedRequests[0]?.id ?? liveRequestBanner.requestId ?? null,
      requestTime:
        mergedRequests[0]?.ora ?? liveRequestBanner.requestTime ?? null,
      targetTab: summary.targetTab,
      targetSection: summary.targetSection,
    });

    logAndroidAutoacceptVisualFlow("banner_shown", {
      requestId: mergedRequests[0]?.id ?? null,
      count: mergedRequests.length,
      mode: "shared_queue_live_batch",
      durationMs: bannerDurationMs,
    });

    void playOwnerForegroundBannerSound({ dedupeKey: bannerDisplayKey }).catch(
      () => null,
    );
    liveBannerTranslateXSV.value = 0;
    liveBannerTranslateYSV.value = 0;
    if (liveRequestBannerTimeoutRef.current) {
      clearTimeout(liveRequestBannerTimeoutRef.current);
      liveRequestBannerTimeoutRef.current = null;
    }
    const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
    liveRequestBannerTimeoutTokenRef.current = timeoutToken;
    liveRequestBannerTimeoutRef.current = setTimeout(() => {
      if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
        return;
      }
      logAndroidAutoacceptVisualFlow("banner_hidden_after_5s", {
        requestId: mergedRequests[0]?.id ?? null,
        count: mergedRequests.length,
        durationMs: bannerDurationMs,
      });
      dismissLiveRequestBanner();
    }, bannerDurationMs);
  }, [
    dismissLiveRequestBanner,
    getAndroidOwnerBannerDurationMs,
    liveBannerTranslateXSV,
    liveBannerTranslateYSV,
    liveRequestBanner,
    persistOwnerPendingBannerShownState,
    queuedLiveBannerRequests,
  ]);

  React.useEffect(() => {
    if (
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !hasLoadedViewedRequestIds ||
      !hasLoadedDeletedCustomerIdentityKeys ||
      !hasLoadedOwnerPendingBannerShownState ||
      !ownerTabBadgeDataReady ||
      liveRequestBanner
    ) {
      return;
    }

    if (!ownerLiveBannerBootstrappedRef.current) {
      let bootstrappedShownState = false;
      const androidFreshForegroundRequests: typeof ownerLiveBannerRequestEvents =
        [];
      const bootstrapNow = Date.now();
      const bannerQueueWindowMs = IS_ANDROID
        ? ANDROID_OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS
        : OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS;
      ownerLiveBannerRequestEvents.forEach((item) => {
        const bannerEventKey = buildLiveRequestBannerEventKey(item);
        if (
          ownerFreshCustomerCancellationEventKeysRef.current.has(bannerEventKey)
        ) {
          return;
        }
        if (IS_ANDROID) {
          const bannerShownKey = buildOwnerLiveBannerShownKey(item);
          const eventTimestamp = parseOwnerLiveRequestBannerTimestamp(item);
          const isFreshForegroundEvent =
            typeof eventTimestamp === "number" &&
            Number.isFinite(eventTimestamp) &&
            eventTimestamp >= ownerAppForegroundSinceRef.current &&
            bootstrapNow - eventTimestamp <= bannerQueueWindowMs;
          const isUnread =
            item.viewedBySalon !== true &&
            !isRequestEventViewed(item, viewedRequestIds);

          if (
            bannerShownKey &&
            isFreshForegroundEvent &&
            isUnread &&
            !ownerPendingBannerShownKeysRef.current.has(bannerShownKey) &&
            !recentlyBanneredOwnerRequestEventKeysRef.current.has(
              bannerShownKey,
            )
          ) {
            androidFreshForegroundRequests.push(item);
            logBackofficeForegroundParity("bootstrap_keep_fresh_foreground", {
              requestId: item.id,
              status: item.stato,
              notificationId: bannerShownKey,
              eventId: bannerEventKey,
              customBarEnqueue: true,
              unreadRefreshCount: unreadCountsBySection.prenotazioni ?? null,
            });
            return;
          }
        }
        if (
          IS_ANDROID &&
          item.stato === "Accettata" &&
          item.viewedBySalon !== true &&
          ownerAutoAcceptedRequestSyncKeysRef.current.has(
            buildFrontendRequestSyncKey(item),
          )
        ) {
          logAndroidBackofficeAutoacceptNotif("bootstrap_keep_visible", {
            requestId: item.id,
            status: item.stato,
            syncKey: buildFrontendRequestSyncKey(item),
          });
          return;
        }

        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        if (!bannerShownKey) {
          return;
        }

        ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
        recentlyBanneredOwnerRequestEventKeysRef.current.set(
          bannerShownKey,
          Date.now(),
        );
        bootstrappedShownState = true;
      });
      ownerLiveBannerBootstrappedRef.current = true;
      if (androidFreshForegroundRequests.length > 0) {
        setQueuedLiveBannerRequests((current) => {
          const byKey = new Map<
            string,
            (typeof richiestePrenotazione)[number]
          >();
          current.forEach((item) => {
            byKey.set(buildLiveRequestBannerEventKey(item), item);
          });
          androidFreshForegroundRequests.forEach((item) => {
            byKey.set(buildLiveRequestBannerEventKey(item), item);
          });
          return Array.from(byKey.values());
        });
      }
      if (bootstrappedShownState) {
        if (androidFreshForegroundRequests.length === 0) {
          setQueuedLiveBannerRequests((current) =>
            current.length === 0 ? current : [],
          );
        }
        void persistOwnerPendingBannerShownState();
      }
      return;
    }

    const now = Date.now();
    const bannerQueueWindowMs = IS_ANDROID
      ? ANDROID_OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS
      : OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS;
    const webUniqueEvents = IS_WEB
      ? Array.from(new Map(ownerLiveBannerRequestEvents.map(item => [buildOwnerLiveBannerShownKey(item), item])).values())
      : ownerLiveBannerRequestEvents;
    const sortedPendingRequests = [...webUniqueEvents].sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    const rawEligibleBannerRequests = sortedPendingRequests.filter((item) => {
      const timerKey = buildOwnerLiveBannerTimerKey(item);
      const bannerShownKey = buildOwnerLiveBannerShownKey(item);
      const bannerEventKey = buildLiveRequestBannerEventKey(item);
      const eventTimestamp = parseOwnerLiveRequestBannerTimestamp(item);
      const isFreshCustomerCancellation =
        isCustomerCancellationRequestEvent(item) &&
        ownerFreshCustomerCancellationEventKeysRef.current.has(bannerEventKey);
      const stableVisualKey = buildOwnerForegroundStableBannerKey(item);
      const hasActivePendingVisual =
        IS_ANDROID &&
        item.stato === "Accettata" &&
        !!stableVisualKey &&
        !!androidAutoacceptVisualRequestsRef.current[stableVisualKey];
      const hasCompletedPendingVisual =
        IS_ANDROID &&
        item.stato === "Accettata" &&
        !!stableVisualKey &&
        androidAutoacceptVisualCompletedKeysRef.current.has(stableVisualKey);

      if (!timerKey || !bannerShownKey) {
        return false;
      }

      if (hasActivePendingVisual || hasCompletedPendingVisual) {
        logAndroidAutoacceptVisualFlow(
          "accepted_event_suppressed_during_visual_state",
          {
            requestId: item.id,
            stableVisualKey,
            completed: hasCompletedPendingVisual,
          },
        );
        return false;
      }

      if (
        typeof eventTimestamp === "number" &&
        Number.isFinite(eventTimestamp) &&
        eventTimestamp < ownerAppForegroundSinceRef.current
      ) {
        ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
        recentlyBanneredOwnerRequestEventKeysRef.current.set(
          bannerShownKey,
          now,
        );
        if (isFreshCustomerCancellation) {
          ownerFreshCustomerCancellationEventKeysRef.current.delete(
            bannerEventKey,
          );
        }
        return false;
      }

      if (
        ownerPendingBannerShownKeysRef.current.has(bannerShownKey) &&
        !isFreshCustomerCancellation
      ) {
        if (IS_ANDROID && item.stato === "Accettata") {
          logAndroidBackofficeAutoacceptNotif("eligible_skip_already_shown", {
            requestId: item.id,
            status: item.stato,
            bannerShownKey,
          });
        }
        return false;
      }

      const recentlyBanneredAt =
        recentlyBanneredOwnerRequestEventKeysRef.current.get(bannerShownKey) ??
        0;
      if (
        recentlyBanneredAt > 0 &&
        now - recentlyBanneredAt <= OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS &&
        !isFreshCustomerCancellation
      ) {
        if (IS_ANDROID && item.stato === "Accettata") {
          logAndroidBackofficeAutoacceptNotif(
            "eligible_skip_recently_bannered",
            {
              requestId: item.id,
              status: item.stato,
              bannerShownKey,
              recentlyBanneredAt,
            },
          );
        }
        return false;
      }

      const firstSeenAt = getOrSeedOwnerPendingFirstSeenAt(item);
      return (
        isFreshCustomerCancellation || now - firstSeenAt <= bannerQueueWindowMs
      );
    });
    const eligibleBannerRequests = rawEligibleBannerRequests.filter((item) => {
      if (!isCustomerCancellationRequestEvent(item)) {
        return true;
      }

      const bannerEventKey = buildLiveRequestBannerEventKey(item);
      if (!claimOwnerCustomerCancellationBanner(item)) {
        ownerFreshCustomerCancellationEventKeysRef.current.delete(
          bannerEventKey,
        );
        return false;
      }

      return true;
    });

    if (eligibleBannerRequests.length > 1) {
      eligibleBannerRequests.forEach((item) => {
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        const bannerEventKey = buildLiveRequestBannerEventKey(item);
        if (!bannerShownKey) return;
        ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
        recentlyBanneredOwnerRequestEventKeysRef.current.set(
          bannerShownKey,
          now,
        );
        ownerFreshCustomerCancellationEventKeysRef.current.delete(
          bannerEventKey,
        );
      });
      const groupedEventKeys = new Set(
        eligibleBannerRequests.map(buildLiveRequestBannerEventKey),
      );
      setQueuedLiveBannerRequests((current) =>
        current.filter(
          (item) => !groupedEventKeys.has(buildLiveRequestBannerEventKey(item)),
        ),
      );
      void persistOwnerPendingBannerShownState();

      if (
        shouldSuppressNativeSinglePendingBatchBanner(eligibleBannerRequests)
      ) {
        logBackofficeForegroundParity("native_generic_batch_suppressed", {
          platform: Platform.OS,
          count: eligibleBannerRequests.length,
          logicalCount: countOwnerLogicalBookingEvents(eligibleBannerRequests),
          customBarEnqueue: false,
        });
        return;
      }

      const summary = buildOwnerLiveRequestBatchSummary(eligibleBannerRequests);
      const bannerDisplayKey = `batch-${now}-${eligibleBannerRequests.length}`;
      const bannerDurationMs = getAndroidOwnerBannerDurationMs(
        eligibleBannerRequests,
      );
      if (IS_ANDROID) {
        androidLiveBannerActiveItemsRef.current = eligibleBannerRequests;
        logAndroidAutoacceptVisualFlow("banner_shown", {
          requestId: eligibleBannerRequests[0]?.id ?? null,
          count: eligibleBannerRequests.length,
          mode: "shared_queue_batch",
          durationMs: bannerDurationMs,
        });
      }
      setLiveRequestBanner({
        eventKey: bannerDisplayKey,
        title: summary.title,
        body: summary.body,
        requestDate: eligibleBannerRequests[0]?.data ?? null,
        requestId: eligibleBannerRequests[0]?.id ?? null,
        requestTime: eligibleBannerRequests[0]?.ora ?? null,
        targetTab: summary.targetTab,
        targetSection: summary.targetSection,
      });

      if (Platform.OS === "web") {
        showWebNotification({
          title: summary.title,
          body: summary.body,
          tag: `owner-live-batch-${eligibleBannerRequests.map(buildOwnerLiveBannerShownKey).sort().join('|')}`,
          onPress: () => navigation.dispatch(TabActions.jumpTo(summary.targetTab, {
            section: summary.targetSection ?? undefined,
            start: eligibleBannerRequests[0]?.data,
            requestId: eligibleBannerRequests[0]?.id,
            requestTime: eligibleBannerRequests[0]?.ora,
            openDetails: "true",
          })),
        });
      } else {
        void playOwnerForegroundBannerSound({
          dedupeKey: bannerDisplayKey,
        }).catch(() => null);
      }

      liveBannerTranslateXSV.value = 0;
      liveBannerTranslateYSV.value = 0;
      if (liveRequestBannerTimeoutRef.current) {
        clearTimeout(liveRequestBannerTimeoutRef.current);
        liveRequestBannerTimeoutRef.current = null;
      }
      const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
      liveRequestBannerTimeoutTokenRef.current = timeoutToken;
      liveRequestBannerTimeoutRef.current = setTimeout(() => {
        if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
          return;
        }
        if (IS_ANDROID) {
          logAndroidAutoacceptVisualFlow("banner_hidden_after_5s", {
            requestId: eligibleBannerRequests[0]?.id ?? null,
            count: eligibleBannerRequests.length,
            durationMs: bannerDurationMs,
          });
        }
        dismissLiveRequestBanner();
      }, bannerDurationMs);
      return;
    }

    const nextBannerRequest = eligibleBannerRequests[0];
    if (!nextBannerRequest) {
      return;
    }

    const timerKey = buildOwnerLiveBannerTimerKey(nextBannerRequest);
    const bannerShownKey = buildOwnerLiveBannerShownKey(nextBannerRequest);
    if (!timerKey || !bannerShownKey) {
      return;
    }

    ownerPendingBannerShownKeysRef.current.add(bannerShownKey);
    recentlyBanneredOwnerRequestEventKeysRef.current.set(bannerShownKey, now);
    setQueuedLiveBannerRequests((current) =>
      current.filter(
        (item) =>
          buildLiveRequestBannerEventKey(item) !==
          buildLiveRequestBannerEventKey(nextBannerRequest),
      ),
    );
    void persistOwnerPendingBannerShownState();

    const bannerEventKey = buildLiveRequestBannerEventKey(nextBannerRequest);
    const isCustomerCancellation =
      isCustomerCancellationRequestEvent(nextBannerRequest);
    const isAcceptedOperatorChange =
      nextBannerRequest.stato === "Accettata" &&
      nextBannerRequest.operatorChangeStatus === "accepted";
    const bannerDisplayKey = isCustomerCancellation
      ? bannerShownKey
      : bannerEventKey;
    const bannerDurationMs = getAndroidOwnerBannerDurationMs([
      nextBannerRequest,
    ]);
    if (IS_ANDROID) {
      androidLiveBannerActiveItemsRef.current = [nextBannerRequest];
    }
    if (isCustomerCancellation) {
      ownerFreshCustomerCancellationEventKeysRef.current.delete(bannerEventKey);
    }
    const customerLabel = [
      nextBannerRequest.nome?.trim(),
      nextBannerRequest.cognome?.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const serviceLabel = nextBannerRequest.servizio?.trim() || "Servizio";
    const datetimeLabel = formatOwnerPushDateTimeLabel(
      nextBannerRequest.data,
      nextBannerRequest.ora,
    );
    const operatorLabel = nextBannerRequest.operatoreNome?.trim() ?? "";
    const roleLabel = nextBannerRequest.mestiereRichiesto?.trim() ?? "";
    const bannerBodyParts = [
      customerLabel || "Cliente",
      serviceLabel ? `Servizio: ${serviceLabel}` : null,
      roleLabel ? `Mestiere: ${roleLabel}` : null,
      datetimeLabel ? `Appuntamento: ${datetimeLabel}` : null,
      operatorLabel ? `Operatore: ${operatorLabel}` : null,
    ].filter(Boolean);

    setLiveRequestBanner({
      eventKey: bannerDisplayKey,
      title: isCustomerCancellation
        ? "Richiesta annullata dal cliente"
        : isAcceptedOperatorChange
          ? "Cambio operatore accettato"
          : nextBannerRequest.stato === "Accettata"
            ? "Richiesta auto-accettata"
            : "Nuova richiesta prenotazione",
      body: bannerBodyParts.join(". "),
      requestDate: nextBannerRequest.data ?? null,
      requestId: nextBannerRequest.id ?? null,
      requestTime: nextBannerRequest.ora ?? null,
      targetTab:
        isCustomerCancellation || isAcceptedOperatorChange
          ? "prenotazioni"
          : "agenda",
      targetSection: isCustomerCancellation
        ? "cancelled"
        : isAcceptedOperatorChange
          ? "accepted"
          : null,
    });
    logBackofficeForegroundParity("banner_show", {
      platform: Platform.OS,
      role: "owner",
      requestId: nextBannerRequest.id,
      status: nextBannerRequest.stato,
      notificationId: bannerShownKey,
      eventId: bannerDisplayKey,
      payloadType:
        nextBannerRequest.cancellationSource ??
        nextBannerRequest.stato ??
        "unknown",
      customBarEnqueue: true,
      targetTab: isCustomerCancellation ? "prenotazioni" : "agenda",
      unreadRefreshCount: unreadCountsBySection.prenotazioni ?? null,
    });
    if (IS_ANDROID && nextBannerRequest.stato === "Accettata") {
      logAndroidBackofficeAutoacceptNotif("banner_show", {
        requestId: nextBannerRequest.id,
        status: nextBannerRequest.stato,
        eventKey: bannerDisplayKey,
        viewedBySalon: nextBannerRequest.viewedBySalon,
        targetTab: "agenda",
      });
    }

    if (Platform.OS === "web") {
      showWebNotification({
        title: isCustomerCancellation
          ? "Richiesta annullata dal cliente"
          : nextBannerRequest.stato === "Accettata"
            ? "Richiesta auto-accettata"
            : "Nuova richiesta prenotazione",
        body: bannerBodyParts.join(". "),
        tag: `owner-live-${bannerDisplayKey}`,
        onPress: () => navigation.dispatch(TabActions.jumpTo(
          isCustomerCancellation || isAcceptedOperatorChange ? "prenotazioni" : "agenda", {
            section: isCustomerCancellation ? "cancelled" : isAcceptedOperatorChange ? "accepted" : undefined,
            start: nextBannerRequest.data,
            requestId: nextBannerRequest.id,
            requestTime: nextBannerRequest.ora,
            openDetails: "true",
          })),
      });
    } else {
      void playOwnerForegroundBannerSound({
        dedupeKey: bannerDisplayKey,
      }).catch(() => null);
    }

    liveBannerTranslateXSV.value = 0;
    liveBannerTranslateYSV.value = 0;

    if (liveRequestBannerTimeoutRef.current) {
      clearTimeout(liveRequestBannerTimeoutRef.current);
      liveRequestBannerTimeoutRef.current = null;
    }
    const timeoutToken = liveRequestBannerTimeoutTokenRef.current + 1;
    liveRequestBannerTimeoutTokenRef.current = timeoutToken;
    liveRequestBannerTimeoutRef.current = setTimeout(() => {
      if (liveRequestBannerTimeoutTokenRef.current !== timeoutToken) {
        return;
      }
      dismissLiveRequestBanner();
    }, bannerDurationMs);
  }, [
    dismissLiveRequestBanner,
    claimOwnerCustomerCancellationBanner,
    getAndroidOwnerBannerDurationMs,
    getOrSeedOwnerPendingFirstSeenAt,
    hasLoadedDeletedCustomerIdentityKeys,
    hasLoadedOwnerPendingBannerShownState,
    hasLoadedViewedRequestIds,
    liveBannerTranslateXSV,
    liveBannerTranslateYSV,
    liveRequestBanner,
    ownerAppForegroundEpoch,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerLiveBannerRequestEvents,
    ownerTabBadgeDataReady,
    persistOwnerPendingBannerShownState,
    isRequestEventViewed,
    unreadCountsBySection.prenotazioni,
    viewedRequestIds,
  ]);

  const tabTitles = React.useMemo(
    (): Record<VisibleOwnerTabKey, string> => ({
      index: tApp(appLanguage, "tab_home"),
      agenda: tApp(appLanguage, "tab_agenda"),
      prenotazioni: tApp(appLanguage, "tab_requests"),
      clienti: tApp(appLanguage, "tab_clients"),
      cassa: tApp(appLanguage, "tab_cash"),
      servizi: tApp(appLanguage, "tab_services"),
      settings: tApp(appLanguage, "settings_title"),
    }),
    [appLanguage],
  );

  const visibleRoutes = React.useMemo(
    () =>
      state.routes.filter((route) => {
        if (!isVisibleOwnerTabKey(route.name)) {
          return false;
        }
        return true;
      }),
    [state.routes],
  );
  const stateDrivenActiveVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex(
      (route) => route.key === state.routes[state.index]?.key,
    ),
  );
  const activeVisibleIndex = stateDrivenActiveVisibleIndex;
  const tabCount = visibleRoutes.length || 1;
  // Android's native view applies the system inset before drawing its children,
  // including the first frame and changes between gestures and three buttons.
  const tabBarBottomOffset = IS_WEB ? (compactWebBar ? 6 : TAB_BAR_OUTER_BOTTOM_IOS) : IS_ANDROID ? ANDROID_TAB_BAR_SAFE_GAP : Math.max(safeAreaInsets.bottom, 8);
  const tabBarHorizontalPadding =
    compactWebBar ? 8 : IS_WEB ? 16 : 6;
  const availableBarWidth = Math.max(
    0,
    Math.min(viewportWidth - tabBarHorizontalPadding * 2 - (!IS_WEB ? safeAreaInsets.left + safeAreaInsets.right : 0), compactWebBar ? 620 : IS_WEB ? 560 : 620),
  );
  const tabSpacing = 0;
  const tabRowHorizontalPadding = compactWebBar ? 4 : 8;

  const tabItemWidth = Math.max(
    0,
    Math.floor(
      (availableBarWidth -
        tabRowHorizontalPadding * 2 -
        tabSpacing * Math.max(tabCount - 1, 0)) /
        Math.max(tabCount, 1),
    ),
  );

  const theoreticalItemWidth = tabItemWidth;
  const isUltraCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 56;
  const isCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 64;

  // Keep the bottom anchor unchanged; native owner bars grow upward only.
  const tabBarHeight = IS_WEB ? (compactWebBar ? 64 : isUltraCompact ? 58 : isCompact ? 62 : 64) : 62;
  const tabBarVerticalPadding = IS_WEB ? (isUltraCompact ? 6 : 6.5) : 4;
  const tabIconSize = !IS_WEB ? 24 : compactWebBar ? 24 : IS_WEB ? (isUltraCompact ? 27 : 29) : (isUltraCompact ? 28 : 30);
  const tabLabelFontSize = !IS_WEB ? 9 : compactWebBar ? (viewportWidth < 370 ? 9 : 10) : isUltraCompact ? 7.2 : 8;
  const tabLabelMinScale = !IS_WEB || compactWebBar ? 1 : 0.72;
  const tabItemVerticalPadding = 0;
  const indicatorWidth = compactWebBar
    ? Math.max(28, Math.min(44, tabItemWidth - 12))
    : IS_WEB
    ? Math.max(40, Math.min(52, tabItemWidth - 12))
    : Math.max(40, Math.min(60, tabItemWidth - 6));
  const indicatorRenderWidth = indicatorWidth;
  const indicatorInset =
    (tabItemWidth - indicatorRenderWidth) / 2 + tabRowHorizontalPadding;

  const indicatorTabOffsets = React.useMemo(
    () =>
      visibleRoutes.map(
        (_, index) => index * (tabItemWidth + tabSpacing) + indicatorInset,
      ),
    [indicatorInset, visibleRoutes, tabItemWidth, tabSpacing],
  );

  const pagerPositionSV = useSharedValue(activeVisibleIndex);
  const tabSelectionPositionSV = useSharedValue(activeVisibleIndex);
  const instantSelectionActiveSV = useSharedValue(0);
  const isBarDraggingSV = useSharedValue(0);
  const didBarDragSV = useSharedValue(0);
  const previewIndexSV = useSharedValue(activeVisibleIndex);
  const dragTranslateXSV = useSharedValue(
    indicatorTabOffsets[activeVisibleIndex] ?? indicatorInset,
  );
  // Lo swipe resta sul thread nativo; il livello shared interviene soltanto
  // per il feedback immediato del tap e per il trascinamento della barra.
  const useNativePagerHighlight = true;

  const minTranslateX = indicatorTabOffsets[0] ?? indicatorInset;
  const maxTranslateX =
    indicatorTabOffsets[indicatorTabOffsets.length - 1] ?? indicatorInset;

  const liveBannerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: liveBannerTranslateXSV.value },
      { translateY: liveBannerTranslateYSV.value },
    ],
    opacity: interpolate(
      Math.max(
        Math.abs(liveBannerTranslateXSV.value),
        Math.abs(liveBannerTranslateYSV.value),
      ),
      [0, 40, 160],
      [1, 0.92, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const liveBannerSwipeGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onUpdate((event) => {
          const verticalIntent =
            Math.abs(event.translationY) > Math.abs(event.translationX);
          liveBannerTranslateXSV.value = verticalIntent
            ? 0
            : event.translationX;
          liveBannerTranslateYSV.value = verticalIntent
            ? Math.min(0, event.translationY)
            : 0;
        })
        .onEnd((event) => {
          const shouldDismissHorizontal =
            Math.abs(event.translationX) > 96 ||
            Math.abs(event.velocityX) > 850;
          const shouldDismissUp =
            event.translationY < -46 || event.velocityY < -620;
          const shouldDismiss = shouldDismissHorizontal || shouldDismissUp;

          if (shouldDismiss) {
            liveBannerTranslateXSV.value = withSpring(
              shouldDismissUp ? 0 : event.translationX >= 0 ? 420 : -420,
              {
                stiffness: 260,
                damping: 24,
                mass: 0.7,
              },
            );
            liveBannerTranslateYSV.value = withSpring(
              shouldDismissUp ? -180 : 0,
              {
                stiffness: 260,
                damping: 24,
                mass: 0.7,
              },
              (finished) => {
                if (finished) {
                  runOnJS(dismissLiveRequestBanner)();
                }
              },
            );
            return;
          }

          liveBannerTranslateXSV.value = withSpring(0, {
            stiffness: 280,
            damping: 22,
            mass: 0.7,
          });
          liveBannerTranslateYSV.value = withSpring(0, {
            stiffness: 280,
            damping: 22,
            mass: 0.7,
          });
        }),
    [dismissLiveRequestBanner, liveBannerTranslateXSV, liveBannerTranslateYSV],
  );

  const openBannerTarget = React.useCallback(() => {
    const tapAt = getCustomBarNavPerfNow();
    const targetDate = liveRequestBanner?.requestDate;
    const targetRequestId = liveRequestBanner?.requestId ?? undefined;
    const targetRequestTime = liveRequestBanner?.requestTime ?? undefined;
    const targetTab = liveRequestBanner?.targetTab ?? "agenda";
    const targetSection = liveRequestBanner?.targetSection ?? undefined;
    const shouldOpenAgendaDetails = liveRequestBanner?.openDetails ?? true;

    logCustomBarNavPerf("owner_banner_tap", {
      targetTab,
      targetDate: targetDate ?? null,
      requestId: targetRequestId ?? null,
    });

    if (targetTab === "prenotazioni") {
      logCustomBarNavPerf("owner_banner_navigate_start", {
        targetTab,
        elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
      });
      navigation.dispatch(
        TabActions.jumpTo("prenotazioni", {
          section: targetSection,
          requestId: targetRequestId,
        }),
      );
      requestAnimationFrame(() => {
        dismissLiveRequestBanner();
        logCustomBarNavPerf("owner_banner_dismiss_after_nav", {
          targetTab,
          elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
        });
      });
      return;
    }

    if (!targetDate) {
      logCustomBarNavPerf("owner_banner_navigate_start", {
        targetTab: "prenotazioni",
        fallback: true,
        elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
      });
      navigation.dispatch(TabActions.jumpTo("prenotazioni"));
      requestAnimationFrame(() => {
        dismissLiveRequestBanner();
        logCustomBarNavPerf("owner_banner_dismiss_after_nav", {
          targetTab: "prenotazioni",
          fallback: true,
          elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
        });
      });
      return;
    }

    logCustomBarNavPerf("owner_banner_navigate_start", {
      targetTab: "agenda",
      elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
    });
    navigation.dispatch(
      TabActions.jumpTo("agenda", {
        start: targetDate,
        requestId: targetRequestId,
        requestTime: targetRequestTime,
        openDetails: shouldOpenAgendaDetails ? "true" : "false",
      }),
    );
    requestAnimationFrame(() => {
      dismissLiveRequestBanner();
      logCustomBarNavPerf("owner_banner_dismiss_after_nav", {
        targetTab: "agenda",
        elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
      });
    });
  }, [dismissLiveRequestBanner, liveRequestBanner, navigation]);

  const getNearestTabIndexFromTranslateX = React.useCallback(
    (translateX: number) => {
      "worklet";
      const clamped = Math.max(
        minTranslateX,
        Math.min(maxTranslateX, translateX),
      );
      const centerX = clamped + indicatorRenderWidth / 2;

      const rawIndex = Math.round(
        (centerX - tabRowHorizontalPadding - tabItemWidth / 2) /
          (tabItemWidth + tabSpacing),
      );

      return Math.max(0, Math.min(visibleRoutes.length - 1, rawIndex));
    },
    [
      indicatorRenderWidth,
      maxTranslateX,
      minTranslateX,
      tabItemWidth,
      tabRowHorizontalPadding,
      tabSpacing,
      visibleRoutes.length,
    ],
  );

  React.useEffect(() => {
    const listenerId = position.addListener(({ value }) => {
      nativePagerPositionRef.current = value;
      const pagerIsMoving = Math.abs(value - Math.round(value)) > 0.001;
      if (pagerMotionActiveRef.current !== pagerIsMoving) {
        pagerMotionActiveRef.current = pagerIsMoving;
        onPagerMotionChange?.(pagerIsMoving);
      }
      const clampedNativePosition = Math.max(
        0,
        Math.min(state.routes.length - 1, value),
      );
      const lowerNativeRouteIndex = Math.floor(clampedNativePosition);
      const upperNativeRouteIndex = Math.ceil(clampedNativePosition);
      const nativeRouteIndex = Math.round(clampedNativePosition);
      const nativeRouteKey = state.routes[nativeRouteIndex]?.key;
      const visibleIndex = Math.max(
        0,
        visibleRoutes.findIndex((route) => route.key === nativeRouteKey),
      );
      const lowerVisibleIndex = Math.max(
        0,
        visibleRoutes.findIndex(
          (route) => route.key === state.routes[lowerNativeRouteIndex]?.key,
        ),
      );
      const upperVisibleIndex = Math.max(
        0,
        visibleRoutes.findIndex(
          (route) => route.key === state.routes[upperNativeRouteIndex]?.key,
        ),
      );
      const nativeProgress = clampedNativePosition - lowerNativeRouteIndex;
      const continuousVisiblePosition =
        lowerVisibleIndex +
        (upperVisibleIndex - lowerVisibleIndex) * nativeProgress;

      if (isBarDraggingSV.value) {
        pagerPositionSV.value = visibleIndex;
        return;
      }

      if (!isBarDraggingSV.value) {
        const immediateTargetIndex = immediateIndicatorTargetIndexRef.current;
        if (immediateTargetIndex !== null) {
          const pagerSettledOnVisibleIndex =
            Math.abs(value - nativeRouteIndex) < 0.01;
          if (
            pagerSettledOnVisibleIndex &&
            visibleIndex !== immediateTargetIndex &&
            activeVisibleIndex === visibleIndex
          ) {
            // Un'inversione molto rapida puo interrompere un salto iniziato
            // dalla barra e far assestare il pager su un'altra pagina. In quel
            // caso la pagina nativa agganciata torna subito l'unica autorita:
            // non lasciare il feedback istantaneo bloccato sulla vecchia meta.
            immediateIndicatorTargetIndexRef.current = null;
            instantSelectionActiveSV.value = 0;
          } else {
            // Durante un jump lungo il pager puo pubblicare per un frame gli
            // indici intermedi. Il vetro e le icone devono restare ancorati alla
            // tab toccata fino a quando quella rotta diventa davvero attiva.
            pagerPositionSV.value = immediateTargetIndex;
            previewIndexSV.value = immediateTargetIndex;
            tabSelectionPositionSV.value = immediateTargetIndex;
            const immediateTargetRouteKey =
              visibleRoutes[immediateTargetIndex]?.key;
            const immediateTargetNativeIndex = state.routes.findIndex(
              (route) => route.key === immediateTargetRouteKey,
            );
            if (
              immediateTargetNativeIndex >= 0 &&
              Math.abs(value - immediateTargetNativeIndex) < 0.01
            ) {
              immediateIndicatorTargetIndexRef.current = null;
              instantSelectionActiveSV.value = 0;
            }
            return;
          }
        }
        pagerPositionSV.value = continuousVisiblePosition;
        previewIndexSV.value = visibleIndex;
        tabSelectionPositionSV.value = continuousVisiblePosition;
        if (
          visibleIndex !== activeVisibleIndex &&
          swipePreviewHapticIndexRef.current !== visibleIndex &&
          locallyHandledHapticIndexRef.current !== visibleIndex
        ) {
          swipePreviewHapticIndexRef.current = visibleIndex;
          locallyHandledHapticIndexRef.current = visibleIndex;
          Haptics.selectionAsync().catch(() => null);
        }
      }
    });

    return () => {
      position.removeListener(listenerId);
      if (pagerMotionActiveRef.current) {
        pagerMotionActiveRef.current = false;
        onPagerMotionChange?.(false);
      }
    };
  }, [
    activeVisibleIndex,
    isBarDraggingSV,
    instantSelectionActiveSV,
    onPagerMotionChange,
    pagerPositionSV,
    position,
    previewIndexSV,
    state.routes,
    tabSelectionPositionSV,
    visibleRoutes,
  ]);

  const nativePagerVisiblePosition = React.useMemo(() => {
    const nativeInputRange = visibleRoutes.map((visibleRoute, visibleIndex) => {
      const nativeIndex = state.routes.findIndex(
        (route) => route.key === visibleRoute.key,
      );
      return nativeIndex >= 0 ? nativeIndex : visibleIndex;
    });

    return position.interpolate({
      inputRange: nativeInputRange,
      outputRange: visibleRoutes.map((_, index) => index),
      extrapolate: "clamp",
    });
  }, [position, state.routes, visibleRoutes]);

  const nativePagerIndicatorStyle = React.useMemo(() => {
    const inputRange = visibleRoutes.map((_, index) => index);
    const outputRange = indicatorTabOffsets.length
      ? indicatorTabOffsets
      : visibleRoutes.map(
          (_, index) => index * (tabItemWidth + tabSpacing) + indicatorInset,
        );

    return {
      transform: [
        {
          translateX: nativePagerVisiblePosition.interpolate({
            inputRange,
            outputRange,
            extrapolate: "clamp",
          }),
        },
      ],
    };
  }, [
    indicatorInset,
    indicatorTabOffsets,
    nativePagerVisiblePosition,
    tabItemWidth,
    tabSpacing,
    visibleRoutes,
  ]);

  React.useEffect(() => {
    if (isBarDraggingSV.value) {
      return;
    }

    const routeDidChange =
      previousRouteIndexRef.current !== activeVisibleIndex;

    const immediateTargetIndex = immediateIndicatorTargetIndexRef.current;
    if (immediateTargetIndex !== null) {
      if (routeDidChange && activeVisibleIndex !== immediateTargetIndex) {
        // Il gesto ha realmente agganciato una pagina diversa dalla meta
        // richiesta: soltanto lo stato finale di navigazione puo annullare il
        // feedback immediato, mai gli indici attraversati durante il movimento.
        immediateIndicatorTargetIndexRef.current = null;
        instantSelectionActiveSV.value = 0;
      } else {
        const targetOffset =
          indicatorTabOffsets[immediateTargetIndex] ?? indicatorInset;
        pagerPositionSV.value = immediateTargetIndex;
        tabSelectionPositionSV.value = immediateTargetIndex;
        previewIndexSV.value = immediateTargetIndex;
        dragTranslateXSV.value = targetOffset;
        const immediateTargetRouteKey =
          visibleRoutes[immediateTargetIndex]?.key;
        const immediateTargetNativeIndex = state.routes.findIndex(
          (route) => route.key === immediateTargetRouteKey,
        );
        if (
          immediateTargetNativeIndex >= 0 &&
          Math.abs(
            nativePagerPositionRef.current - immediateTargetNativeIndex,
          ) < 0.01
        ) {
          immediateIndicatorTargetIndexRef.current = null;
          instantSelectionActiveSV.value = 0;
        }
        return;
      }
    }

    const syncedOffset =
      indicatorTabOffsets[activeVisibleIndex] ?? indicatorInset;
    pagerPositionSV.value = activeVisibleIndex;
    tabSelectionPositionSV.value = activeVisibleIndex;
    previewIndexSV.value = activeVisibleIndex;
    swipePreviewHapticIndexRef.current = activeVisibleIndex;
    dragTranslateXSV.value = syncedOffset;
    immediateIndicatorTargetIndexRef.current = null;
    instantSelectionActiveSV.value = 0;

  }, [
    activeVisibleIndex,
    dragTranslateXSV,
    indicatorInset,
    indicatorTabOffsets,
    isBarDraggingSV,
    instantSelectionActiveSV,
    pagerPositionSV,
    previewIndexSV,
    tabSelectionPositionSV,
    state.routes,
    visibleRoutes,
  ]);

  React.useEffect(() => {
    const previousIndex = previousRouteIndexRef.current;
    if (previousIndex === activeVisibleIndex) {
      return;
    }

    previousRouteIndexRef.current = activeVisibleIndex;
    if (IS_IOS) {
      const startedAt = androidTabNavigationStartedAtRef.current;
      logIosBackofficeTabPerf("screen_focused", {
        activeVisibleIndex,
        routeName: visibleRoutes[activeVisibleIndex]?.name ?? null,
        elapsedMs: startedAt
          ? Math.round(getIosTabPerfNow() - startedAt)
          : null,
      });
      androidTabNavigationStartedAtRef.current = null;
      androidTabTapGuardRef.current = null;
    }
    if (IS_ANDROID) {
      const startedAt = androidTabNavigationStartedAtRef.current;
      logAndroidBackofficeTabPerf("screen_focused", {
        activeVisibleIndex,
        routeName: visibleRoutes[activeVisibleIndex]?.name ?? null,
        elapsedMs: startedAt
          ? Math.round(getAndroidTouchPerfNow() - startedAt)
          : null,
      });
      androidTabNavigationStartedAtRef.current = null;
      androidTabTapGuardRef.current = null;
    }
    if (locallyHandledHapticIndexRef.current === activeVisibleIndex) {
      locallyHandledHapticIndexRef.current = null;
      return;
    }

    Haptics.selectionAsync().catch(() => null);
  }, [activeVisibleIndex, visibleRoutes]);

  const startBarDragJS = React.useCallback(() => {
    if (dragPressUnlockTimeoutRef.current) {
      clearTimeout(dragPressUnlockTimeoutRef.current);
      dragPressUnlockTimeoutRef.current = null;
    }

    dragPressLockRef.current = true;
    setIsBarDraggingJS(true);
  }, []);

  const finishBarDragJS = React.useCallback(() => {
    if (dragPressUnlockTimeoutRef.current) {
      clearTimeout(dragPressUnlockTimeoutRef.current);
    }

    dragPressUnlockTimeoutRef.current = setTimeout(() => {
      dragPressLockRef.current = false;
      setIsBarDraggingJS(false);
      dragPressUnlockTimeoutRef.current = null;
    }, 32);
  }, []);

  React.useEffect(() => {
    return () => {
      if (dragPressUnlockTimeoutRef.current) {
        clearTimeout(dragPressUnlockTimeoutRef.current);
      }
    };
  }, []);

  const navigateToIndex = React.useCallback(
    (nextIndex: number) => {
      if (nextIndex === activeVisibleIndex) {
        logAndroidTouchPerfAudit("tab_navigation_ignored", {
          reason: "already_active",
          nextIndex,
          activeVisibleIndex,
        });
        return;
      }

      logAndroidTouchPerfAudit("tab_navigation_called", {
        nextIndex,
        routeName: visibleRoutes[nextIndex]?.name ?? null,
        activeVisibleIndex,
        at: getAndroidTouchPerfNow(),
      });
      previewIndexSV.value = nextIndex;
      instantSelectionActiveSV.value = 1;
      pagerPositionSV.value = nextIndex;
      tabSelectionPositionSV.value = nextIndex;
      dragTranslateXSV.value = indicatorTabOffsets[nextIndex] ?? indicatorInset;
      immediateIndicatorTargetIndexRef.current = nextIndex;
      locallyHandledHapticIndexRef.current = nextIndex;
      navigation.dispatch(TabActions.jumpTo(visibleRoutes[nextIndex].name));
      if (!IS_WEB) {
        Haptics.selectionAsync().catch(() => null);
      }
    },
    [
      activeVisibleIndex,
      dragTranslateXSV,
      indicatorInset,
      indicatorTabOffsets,
      instantSelectionActiveSV,
      navigation,
      pagerPositionSV,
      previewIndexSV,
      tabSelectionPositionSV,
      visibleRoutes,
    ],
  );

  const primeTabSelection = React.useCallback(
    (index: number) => {
      instantSelectionActiveSV.value = 1;
      previewIndexSV.value = index;
      pagerPositionSV.value = index;
      tabSelectionPositionSV.value = index;
      dragTranslateXSV.value = indicatorTabOffsets[index] ?? indicatorInset;
    },
    [
      dragTranslateXSV,
      indicatorInset,
      indicatorTabOffsets,
      instantSelectionActiveSV,
      pagerPositionSV,
      previewIndexSV,
      tabSelectionPositionSV,
    ],
  );

  const startImmediateTabTapNavigation = React.useCallback(
    (
      routeKey: string,
      index: number,
      source: "touch_start" | "press_in" | "press",
    ) => {
      const tapStartedAt = getAndroidTouchPerfNow();
      const guardedTap = androidTabTapGuardRef.current;
      if (
        IS_ANDROID &&
        guardedTap &&
        guardedTap.routeKey === routeKey &&
        guardedTap.index === index &&
        tapStartedAt - guardedTap.startedAt < 700
      ) {
        logAndroidBackofficeTabPerf("duplicate_gesture_ignored", {
          routeKey,
          index,
          source,
          elapsedMs: Math.round(tapStartedAt - guardedTap.startedAt),
        });
        return;
      }
      if (
        IS_IOS &&
        guardedTap &&
        guardedTap.routeKey === routeKey &&
        guardedTap.index === index &&
        tapStartedAt - guardedTap.startedAt < 450
      ) {
        logIosBackofficeTabPerf("duplicate_gesture_ignored", {
          routeKey,
          index,
          source,
          elapsedMs: Math.round(tapStartedAt - guardedTap.startedAt),
        });
        return;
      }
      androidTabTapGuardRef.current = {
        routeKey,
        index,
        startedAt: tapStartedAt,
      };

      logIosBackofficeTabPerf("tap_start", {
        routeKey,
        index,
        source,
        activeVisibleIndex,
        at: tapStartedAt,
      });
      logAndroidBackofficeTabPerf("tap_start", {
        routeKey,
        index,
        source,
        activeVisibleIndex,
        at: tapStartedAt,
      });
      logAndroidTouchPerfAudit("tab_immediate_tap_start", {
        routeKey,
        index,
        activeVisibleIndex,
        isBarDraggingJS,
        pressInNavigatedIndex: pressInNavigatedIndexRef.current,
        at: getAndroidTouchPerfNow(),
      });
      if (isBarDraggingJS) {
        androidTabTapGuardRef.current = null;
        logAndroidTouchPerfAudit("tab_immediate_tap_ignored", {
          routeKey,
          index,
          reason: "bar_dragging",
        });
        logAndroidBackofficeTabPerf("tap_ignored", {
          routeKey,
          index,
          source,
          reason: "bar_dragging",
        });
        return;
      }

      // Il pager puo avere bisogno di un passaggio JS per applicare il jump,
      // mentre lo swipe aggiorna gia la barra sul thread UI. Porta quindi il
      // vetro sulla destinazione al primo contatto: il tap deve dare lo stesso
      // feedback istantaneo dello swipe anche quando la scena e impegnata.
      if (IS_ANDROID && index !== activeVisibleIndex) {
        immediateIndicatorTargetIndexRef.current = index;
        primeTabSelection(index);
      }

      const targetRouteName = visibleRoutes[index]?.name;
      if (
        IS_IOS &&
        targetRouteName === "agenda" &&
        immediateAgendaPendingRequestTarget?.data
      ) {
        pressInNavigatedIndexRef.current = index;
        locallyHandledHapticIndexRef.current = index;
        androidTabNavigationStartedAtRef.current = tapStartedAt;
        jumpTo(visibleRoutes[index].key);
        navigation.dispatch(
          TabActions.jumpTo("agenda", {
            start: immediateAgendaPendingRequestTarget.data,
            requestId: immediateAgendaPendingRequestTarget.id ?? undefined,
            requestTime: immediateAgendaPendingRequestTarget.ora ?? undefined,
            // Il tap della scheda deve solo portare allo slot pendente. Aprire
            // anche il popup mentre l'utente sta usando altri controlli rende
            // la navigazione invasiva; i dettagli restano su card/banner.
            openDetails: "false",
            requestOpenToken: `${Math.round(tapStartedAt)}-${
              immediateAgendaPendingRequestTarget.id ?? "pending"
            }`,
          }),
        );
        previewIndexSV.value = index;
        pagerPositionSV.value = index;
        tabSelectionPositionSV.value = index;
        dragTranslateXSV.value = indicatorTabOffsets[index] ?? indicatorInset;
        Haptics.selectionAsync().catch(() => null);
        return;
      }

      if (
        index !== activeVisibleIndex &&
        pressInNavigatedIndexRef.current !== index
      ) {
        pressInNavigatedIndexRef.current = index;
        locallyHandledHapticIndexRef.current = index;
      }

      if (
        index !== activeVisibleIndex &&
        pressInNavigatedIndexRef.current === index
      ) {
        logAndroidTouchPerfAudit("tab_immediate_navigation_dispatch", {
          routeKey,
          index,
          routeName: visibleRoutes[index]?.name ?? null,
          at: getAndroidTouchPerfNow(),
        });
        androidTabNavigationStartedAtRef.current = tapStartedAt;
        logIosBackofficeTabPerf("navigation_called", {
          routeKey,
          index,
          routeName: visibleRoutes[index]?.name ?? null,
          source,
          elapsedMs: Math.round(getIosTabPerfNow() - tapStartedAt),
        });
        logAndroidBackofficeTabPerf("navigation_called", {
          routeKey,
          index,
          routeName: visibleRoutes[index]?.name ?? null,
          source,
          elapsedMs: Math.round(getAndroidTouchPerfNow() - tapStartedAt),
        });
        if (IS_WEB) {
          navigation.dispatch(TabActions.jumpTo(visibleRoutes[index].name));
        } else {
          // Il tap ha gia la destinazione esatta: porta subito il PagerView
          // nativo su quella scena; onPageSelected sincronizza poi lo stato di
          // React Navigation, senza bloccare il comando visivo. Lo swipe continua
          // sul proprio percorso nativo e non passa da questa callback.
          // Non accodare il tap al prossimo frame JS: una scena pesante puo
          // ritardarlo e lasciare la barra sulla nuova tab con la vecchia pagina.
          jumpTo(visibleRoutes[index].key);
        }
      } else {
        logIosBackofficeTabPerf("navigation_skipped", {
          routeKey,
          index,
          source,
          reason:
            index === activeVisibleIndex
              ? "already_active"
              : "press_guard_not_set",
          elapsedMs: Math.round(getIosTabPerfNow() - tapStartedAt),
        });
        logAndroidBackofficeTabPerf("navigation_skipped", {
          routeKey,
          index,
          source,
          reason:
            index === activeVisibleIndex
              ? "already_active"
              : "press_guard_not_set",
          elapsedMs: Math.round(getAndroidTouchPerfNow() - tapStartedAt),
        });
      }

      previewIndexSV.value = index;
      pagerPositionSV.value = index;
      tabSelectionPositionSV.value = index;
      dragTranslateXSV.value = indicatorTabOffsets[index] ?? indicatorInset;
      logIosBackofficeTabPerf("selected_visual_updated", {
        routeKey,
        index,
        source,
        elapsedMs: Math.round(getIosTabPerfNow() - tapStartedAt),
      });
      logAndroidBackofficeTabPerf("selected_visual_updated", {
        routeKey,
        index,
        source,
        elapsedMs: Math.round(getAndroidTouchPerfNow() - tapStartedAt),
      });
      if (!IS_WEB) {
        Haptics.selectionAsync().catch(() => null);
      }
    },
    [
      activeVisibleIndex,
      dragTranslateXSV,
      indicatorInset,
      indicatorTabOffsets,
      isBarDraggingJS,
      immediateAgendaPendingRequestTarget,
      jumpTo,
      navigation,
      pagerPositionSV,
      primeTabSelection,
      previewIndexSV,
      tabSelectionPositionSV,
      visibleRoutes,
    ],
  );

  // DEV-only bridge for repeatable navigation measurements on the connected phone.
  React.useEffect(() => {
    if (!__DEV__ || IS_WEB) return;
    const testHost = globalThis as typeof globalThis & {
      __salonTabTest?: { revision: string; route: string; tap: (name: string) => boolean };
    };
    const test = {
      revision: 'premium-native-edge-bounce-7',
      route: visibleRoutes[activeVisibleIndex]?.name ?? '',
      tap: (name: string) => {
        const index = visibleRoutes.findIndex(route => route.name === name);
        if (index < 0) return false;
        startImmediateTabTapNavigation(visibleRoutes[index].key, index, 'press');
        return true;
      },
    };
    testHost.__salonTabTest = test;
    return () => { if (testHost.__salonTabTest === test) delete testHost.__salonTabTest; };
  }, [activeVisibleIndex, startImmediateTabTapNavigation, visibleRoutes]);

  const tabBarDragGesture = React.useMemo(() => {
    return Gesture.Pan()
      .enabled(!IS_WEB)
      .activeOffsetX([-14, 14])
      .failOffsetY([-24, 24])
      .onBegin(() => {
        didBarDragSV.value = 0;
      })
      .onStart((event) => {
        runOnJS(startBarDragJS)();
        didBarDragSV.value = 1;
        isBarDraggingSV.value = 1;

        const clampedTranslateX = Math.max(
          minTranslateX,
          Math.min(maxTranslateX, event.x - indicatorRenderWidth / 2),
        );

        dragTranslateXSV.value = clampedTranslateX;
        const nextPreviewIndex =
          getNearestTabIndexFromTranslateX(clampedTranslateX);
        previewIndexSV.value = nextPreviewIndex;
        tabSelectionPositionSV.value = nextPreviewIndex;
      })
      .onUpdate((event) => {
        const clampedTranslateX = Math.max(
          minTranslateX,
          Math.min(maxTranslateX, event.x - indicatorRenderWidth / 2),
        );

        dragTranslateXSV.value = clampedTranslateX;
        const nextPreviewIndex =
          getNearestTabIndexFromTranslateX(clampedTranslateX);
        previewIndexSV.value = nextPreviewIndex;
        tabSelectionPositionSV.value = nextPreviewIndex;
      })
      .onEnd(() => {
        const finalIndex = getNearestTabIndexFromTranslateX(
          dragTranslateXSV.value,
        );
        const snappedTranslateX =
          indicatorTabOffsets[finalIndex] ?? dragTranslateXSV.value;

        dragTranslateXSV.value = snappedTranslateX;
        previewIndexSV.value = finalIndex;
        pagerPositionSV.value = finalIndex;
        tabSelectionPositionSV.value = finalIndex;
        isBarDraggingSV.value = 0;
        didBarDragSV.value = 0;

        runOnJS(navigateToIndex)(finalIndex);
        runOnJS(finishBarDragJS)();
      })
      .onFinalize(() => {
        isBarDraggingSV.value = 0;
        if (didBarDragSV.value) {
          didBarDragSV.value = 0;
          runOnJS(finishBarDragJS)();
        }
      });
  }, [
    didBarDragSV,
    dragTranslateXSV,
    finishBarDragJS,
    getNearestTabIndexFromTranslateX,
    indicatorRenderWidth,
    indicatorTabOffsets,
    isBarDraggingSV,
    maxTranslateX,
    minTranslateX,
    navigateToIndex,
    pagerPositionSV,
    previewIndexSV,
    startBarDragJS,
    tabSelectionPositionSV,
  ]);

  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    const selectionTranslateX = interpolate(
      tabSelectionPositionSV.value,
      visibleRoutes.map((_, index) => index),
      indicatorTabOffsets,
      Extrapolation.CLAMP,
    );

    return {
      opacity:
        !IS_WEB && (isBarDraggingSV.value || instantSelectionActiveSV.value)
          ? 1
          : 0,
      transform: [
        {
          translateX: isBarDraggingSV.value
            ? dragTranslateXSV.value
            : selectionTranslateX,
        },
      ],
    };
  });

  const nativePagerIndicatorModeStyle = useAnimatedStyle(() => ({
    opacity:
      IS_WEB || (!isBarDraggingSV.value && !instantSelectionActiveSV.value)
        ? 1
        : 0,
  }));

  const tabBarSurface = (
    <View
      {...(compactWebBar?{dataSet:{premiumBottomBar:"true",premiumBarTheme:barPalette.night?"dark":"light"}}:{})}
      pointerEvents="box-none"
      style={[
        styles.tabBar,
        IS_ANDROID && styles.tabBarAndroid,
        {
          height: tabBarHeight,
          justifyContent: 'center',
          paddingTop: tabBarVerticalPadding,
          paddingBottom: tabBarVerticalPadding,
          ...(!IS_WEB ? {width:availableBarWidth,maxWidth:availableBarWidth,borderWidth:0,borderRadius:tabBarHeight/2,backgroundColor:IS_ANDROID?'transparent':barPalette.night?'rgba(30,33,35,.94)':'rgba(250,247,241,.46)'} : {}),
        },
      ]}
    >
      {!IS_WEB && !IS_ANDROID ? <><BlurView pointerEvents="none" intensity={35} tint={barPalette.night?'dark':'light'} style={StyleSheet.absoluteFillObject}/><View pointerEvents="none" style={[StyleSheet.absoluteFillObject,{borderRadius:tabBarHeight/2,borderWidth:1,borderColor:barPalette.border}]}/></> : null}
      {IS_ANDROID && <AndroidTabBarSurface premium={barPalette} width={availableBarWidth} height={tabBarHeight} />}
      <View
        pointerEvents="box-none"
        style={[
          styles.tabBarFixedRow,
          {
            width: availableBarWidth,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabBarIndicatorModeLayer,
            nativePagerIndicatorModeStyle,
          ]}
        >
          <RNAnimated.View
            style={[
              styles.animatedIndicator,
              IS_ANDROID && styles.animatedIndicatorAndroid,
              nativePagerIndicatorStyle,
              {
                width: compactWebBar ? tabItemWidth - 4 : indicatorRenderWidth + 10,
                marginLeft: compactWebBar ? (indicatorRenderWidth - tabItemWidth + 4) / 2 : -5,
                height: compactWebBar ? tabBarHeight - 4 : IS_WEB ? Math.min(tabBarHeight - 14, indicatorRenderWidth + 10) : tabBarHeight - 4,
                top: IS_WEB ? '50%' : 1 - tabBarVerticalPadding,
                ...(IS_WEB ? {
                  marginTop: -(compactWebBar ? tabBarHeight - 4 : Math.min(tabBarHeight - 14, indicatorRenderWidth + 10)) / 2,
                  marginBottom: 0,
                } : {}),
                ...(!IS_WEB ? {
                  height: Math.min(tabBarHeight - 8, indicatorRenderWidth + 18),
                  top: '50%' as const,
                  marginTop: -Math.min(tabBarHeight - 8, indicatorRenderWidth + 18) / 2,
                  marginBottom: 0,
                } : {}),
              },
            ]}
          >
            {IS_ANDROID ? <AndroidTabBarSurface premium={barPalette} selected width={indicatorRenderWidth + 10} height={Math.min(tabBarHeight - 8, indicatorRenderWidth + 18)} /> : <>
            {!IS_WEB ? <BlurView pointerEvents="none" intensity={22} tint={barPalette.night?'dark':'light'} style={StyleSheet.absoluteFillObject}/> : null}
            <View style={styles.animatedIndicatorGlow} />
            <View style={styles.animatedIndicatorGlass} />
            <View style={styles.animatedIndicatorHighlight} />
            <View style={styles.animatedIndicatorLowlight} />
            <View style={styles.animatedIndicatorInnerStroke} />
            </>}
          </RNAnimated.View>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.animatedIndicator,
            IS_ANDROID && styles.animatedIndicatorAndroid,
            indicatorAnimatedStyle,
            {
              width: compactWebBar ? tabItemWidth - 4 : indicatorRenderWidth + 10,
              marginLeft: compactWebBar ? (indicatorRenderWidth - tabItemWidth + 4) / 2 : -5,
              height: compactWebBar ? tabBarHeight - 4 : IS_WEB ? Math.min(tabBarHeight - 14, indicatorRenderWidth + 10) : tabBarHeight - 4,
              top: IS_WEB ? '50%' : 1 - tabBarVerticalPadding,
              ...(IS_WEB ? {
                marginTop: -(compactWebBar ? tabBarHeight - 4 : Math.min(tabBarHeight - 14, indicatorRenderWidth + 10)) / 2,
                marginBottom: 0,
              } : {}),
              ...(!IS_WEB ? {
                height: Math.min(tabBarHeight - 8, indicatorRenderWidth + 18),
                top: '50%' as const,
                marginTop: -Math.min(tabBarHeight - 8, indicatorRenderWidth + 18) / 2,
                marginBottom: 0,
              } : {}),
            },
          ]}
        >
          {IS_ANDROID ? <AndroidTabBarSurface premium={barPalette} selected width={indicatorRenderWidth + 10} height={Math.min(tabBarHeight - 8, indicatorRenderWidth + 18)} /> : <>
          {!IS_WEB ? <BlurView pointerEvents="none" intensity={22} tint={barPalette.night?'dark':'light'} style={StyleSheet.absoluteFillObject}/> : null}
            <View style={styles.animatedIndicatorGlow} />
          <View style={styles.animatedIndicatorGlass} />
          <View style={styles.animatedIndicatorHighlight} />
          <View style={styles.animatedIndicatorLowlight} />
          <View style={styles.animatedIndicatorInnerStroke} />
          </>}
        </Animated.View>

        {visibleRoutes.map((route, index) => {
          const routeKey = route.name as VisibleOwnerTabKey;
          const config = SALON_MODULES[routeKey];

          const label =
            descriptors[route.key]?.options.title ??
            descriptors[route.key]?.options.tabBarLabel ??
            tabTitles[routeKey];

          const onPress = () => {
            logAndroidTouchPerfAudit("tab_press", {
              routeKey: route.key,
              index,
              activeVisibleIndex,
              isBarDraggingJS,
              pressInNavigatedIndex: pressInNavigatedIndexRef.current,
              at: getAndroidTouchPerfNow(),
            });
            if (isBarDraggingJS) {
              logAndroidTouchPerfAudit("tab_press_ignored", {
                routeKey: route.key,
                index,
                reason: "bar_dragging",
              });
              return;
            }
            if (pressInNavigatedIndexRef.current === index) {
              logAndroidTouchPerfAudit("tab_press_ignored", {
                routeKey: route.key,
                index,
                reason: "already_navigated_on_press_in",
              });
              pressInNavigatedIndexRef.current = null;
              if (IS_ANDROID) {
                // Android conserva il percorso gia stabilizzato dal suo jump
                // nativo senza animazione.
                requestAnimationFrame(() => {
                  if (immediateIndicatorTargetIndexRef.current === index) {
                    immediateIndicatorTargetIndexRef.current = null;
                    instantSelectionActiveSV.value = 0;
                  }
                });
              }
              // Su iOS non spegnere qui il feedback immediato: il rilascio puo
              // precedere l'ultimo aggiornamento del pager, mostrando la vecchia
              // scheda sopra la nuova pagina. Sara il latch a concluderlo.
              return;
            }
            startImmediateTabTapNavigation(route.key, index, "press");
          };

          const badgeCount =
            route.name === "agenda"
              ? visualCustomBarAgendaPendingRequestsCount
              : route.name === "prenotazioni"
                ? visualRichiesteInAttesa
                : route.name === "clienti"
                  ? visualClientiNonLetti
                  : 0;
          const badgePulseActive = false;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tabTitles[routeKey]}
              accessibilityState={{ selected: index === activeVisibleIndex }}
              {...(IS_WEB
                ? ({
                    'data-salon-cursor': 'pointer',
                    'data-salon-press-feedback': 'true',
                    'aria-selected': index === activeVisibleIndex,
                  } as any)
                : {})}
              unstable_pressDelay={0}
              hitSlop={
                IS_ANDROID
                  ? { top: 12, bottom: 14, left: 6, right: 6 }
                  : IS_IOS
                    ? { top: 10, bottom: 12, left: 6, right: 6 }
                    : undefined
              }
              pressRetentionOffset={
                IS_ANDROID
                  ? { top: 18, bottom: 18, left: 10, right: 10 }
                  : IS_IOS
                    ? { top: 14, bottom: 14, left: 8, right: 8 }
                    : undefined
              }
              onPress={onPress}
              onTouchStart={
                IS_WEB
                  ? undefined
                  : (event) => {
                      logIosBackofficeTabPerf("tap_start_native", {
                        routeKey: route.key,
                        index,
                        pageX: Math.round(event.nativeEvent.pageX),
                        pageY: Math.round(event.nativeEvent.pageY),
                        locationX: Math.round(event.nativeEvent.locationX),
                        locationY: Math.round(event.nativeEvent.locationY),
                        at: getIosTabPerfNow(),
                      });
                      logAndroidTouchPerfAudit("tab_touch_start", {
                        routeKey: route.key,
                        index,
                        pageX: Math.round(event.nativeEvent.pageX),
                        pageY: Math.round(event.nativeEvent.pageY),
                        locationX: Math.round(event.nativeEvent.locationX),
                        locationY: Math.round(event.nativeEvent.locationY),
                        at: getAndroidTouchPerfNow(),
                      });

                      // Il vetro segue il dito dal primissimo contatto. Il
                      // comando al pager parte nel press-in, prima del rilascio,
                      // così tap e swipe hanno la stessa risposta percepita.
                      if (!IS_IOS && !isBarDraggingJS && index !== activeVisibleIndex) {
                        immediateIndicatorTargetIndexRef.current = index;
                        primeTabSelection(index);
                      }
                    }
              }
              onPressIn={() =>
                startImmediateTabTapNavigation(route.key, index, "press_in")
              }
              onTouchCancel={() => {
                if (pressInNavigatedIndexRef.current === index) {
                  pressInNavigatedIndexRef.current = null;
                }
                if (
                  !IS_WEB &&
                  immediateIndicatorTargetIndexRef.current === index
                ) {
                  immediateIndicatorTargetIndexRef.current = null;
                  instantSelectionActiveSV.value = 0;
                }
              }}
              style={({ pressed }) => [
                styles.tabBarItem,
                pressed && styles.tabBarItemPressed,
                {
                  ...(compactWebBar ? {
                    '--salon-tab-hover-width': `${tabItemWidth - 4}px`,
                    '--salon-tab-hover-height': `${tabBarHeight - 4}px`,
                    '--salon-tab-hover-radius': '19px',
                  } as any : {}),
                  width: tabItemWidth,
                  paddingVertical: tabItemVerticalPadding,
                  marginRight:
                    index === visibleRoutes.length - 1 ? 0 : tabSpacing,
                },
              ]}
            >
              <TabBarItemVisual
                index={index}
                label={compactWebBar && routeKey==='settings' && viewportWidth<480 ? 'Impost.' : !IS_WEB && routeKey==='settings' ? 'Impost.' : typeof label === 'string' ? label : tabTitles[routeKey]}
                activeIconName={config.icon.active}
                inactiveIconName={config.icon.active}
                tabIconSize={tabIconSize}
                tabLabelFontSize={tabLabelFontSize}
                tabLabelMinScale={tabLabelMinScale}
                badgeCount={badgeCount}
                badgePulseActive={badgePulseActive}
                pagerPositionSV={tabSelectionPositionSV}
                isBarDraggingSV={isBarDraggingSV}
                previewIndexSV={previewIndexSV}
                instantSelectionActiveSV={instantSelectionActiveSV}
                nativePagerPosition={nativePagerVisiblePosition}
                useNativePagerHighlight={useNativePagerHighlight}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View {...(IS_WEB?{dataSet:{premiumTabOverlay:"true"}}:{})} pointerEvents="box-none" style={styles.tabBarOverlay}>
      {liveRequestBanner && !IS_ANDROID ? (
        <GestureDetector gesture={liveBannerSwipeGesture}>
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOutUp.duration(240)}
            style={[styles.liveRequestBanner, liveBannerAnimatedStyle]}
          >
            <Pressable
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={openBannerTarget}
              onPressIn={() => {
                logCustomBarNavPerf("owner_banner_press_in", {
                  targetTab: liveRequestBanner.targetTab,
                  requestId: liveRequestBanner.requestId ?? null,
                });
              }}
              style={({ pressed }) => [
                styles.liveRequestBannerPressArea,
                pressed && styles.liveRequestBannerPressAreaPressed,
              ]}
            >
              <View style={styles.liveRequestBannerIconWrap}>
                <Ionicons name="notifications" size={18} color={notificationBannerTone.icon} />
              </View>
              <View style={styles.liveRequestBannerTextWrap}>
                <Text style={styles.liveRequestBannerTitle}>
                  {liveRequestBanner.title}
                </Text>
                <Text style={styles.liveRequestBannerBody} numberOfLines={2}>
                  {liveRequestBanner.body}
                </Text>
                <Text style={styles.liveRequestBannerHint}>
                  Tocca per aprire · swipe per chiudere
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      ) : null}
      {!IS_WEB ? <OwnerNativeSidebar items={visibleRoutes.map((route, index) => ({
        key: route.name as VisibleOwnerTabKey,
        label: String(descriptors[route.key]?.options.title ?? tabTitles[route.name as VisibleOwnerTabKey]),
        selected: index === activeVisibleIndex,
        badge: route.name === 'agenda' ? visualCustomBarAgendaPendingRequestsCount : route.name === 'prenotazioni' ? visualRichiesteInAttesa : route.name === 'clienti' ? visualClientiNonLetti : 0,
        onPress: () => startImmediateTabTapNavigation(route.key, index, 'press'),
      }))} /> : null}
      {IS_WEB && viewportWidth >= 1000 ? <OwnerPremiumSidebar items={visibleRoutes.map((route, index) => ({
        key: route.name as VisibleOwnerTabKey,
        label: String(descriptors[route.key]?.options.title ?? tabTitles[route.name as VisibleOwnerTabKey]),
        selected: index === activeVisibleIndex,
        badge: route.name === 'agenda' ? visualCustomBarAgendaPendingRequestsCount : route.name === 'prenotazioni' ? visualRichiesteInAttesa : route.name === 'clienti' ? visualClientiNonLetti : 0,
        onPress: () => startImmediateTabTapNavigation(route.key, index, 'press'),
      }))} /> : nativeViewport?.sidebar ? null : (
      <SafeAreaView
        edges={IS_ANDROID ? ["bottom", "left", "right"] : !IS_WEB ? ["left", "right"] : []}
        pointerEvents="box-none"
        style={[
          styles.tabBarOuter,
          IS_ANDROID && isAndroidKeyboardVisible ? {display:"none"} : null,
          {
            paddingHorizontal: tabBarHorizontalPadding,
            paddingBottom: tabBarBottomOffset,
            backgroundColor:'transparent',
          },
        ]}
      >
        {IS_WEB || IS_ANDROID ? (
          tabBarSurface
        ) : (
          <GestureDetector gesture={tabBarDragGesture}>
            {tabBarSurface}
          </GestureDetector>
        )}
      </SafeAreaView>
      )}
    </View>
  );
}

function IosOwnerLiveRequestBannerHost({
  requests,
  ownerReady,
  viewedRequestIds,
  isDeletedFrontendRequest,
}: {
  requests: OwnerBookingRequestItem[];
  ownerReady: boolean;
  viewedRequestIds: string[];
  isDeletedFrontendRequest: (item: OwnerBookingRequestItem) => boolean;
}) {
  const {palette:barPalette}=useAccessAppearance();
  const notificationBannerTone=premiumNotificationBannerTone(barPalette.night);
  const styles=React.useMemo(()=>nativeBarStyles(baseTabStyles,barPalette),[barPalette]);
  const router = useRouter();
  const [liveRequestBanner, setLiveRequestBanner] = React.useState<{
    eventKey: string;
    title: string;
    body: string;
    requestDate: string | null;
    requestId: string | null;
    requestTime: string | null;
    targetTab: "agenda" | "prenotazioni";
    targetSection: string | null;
    openDetails?: boolean;
  } | null>(null);
  const [queuedLiveBannerRequests, setQueuedLiveBannerRequests] =
    React.useState<OwnerBookingRequestItem[]>([]);
  const shownBannerKeysRef = React.useRef<Set<string>>(new Set());
  const knownBannerKeysRef = React.useRef<Set<string>>(new Set());
  const knownRequestStatusByBaseKeyRef = React.useRef<Map<string, string>>(
    new Map(),
  );
  const recentlyBanneredKeysRef = React.useRef<Map<string, number>>(new Map());
  const firstSeenAtRef = React.useRef<Map<string, number>>(new Map());
  const hasPrimedBannerKeysRef = React.useRef(false);
  const appForegroundSinceRef = React.useRef(Date.now());
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissLiveRequestBanner = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLiveRequestBanner(null);
  }, []);

  React.useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== "active") {
        setQueuedLiveBannerRequests([]);
        dismissLiveRequestBanner();
        return;
      }

      appForegroundSinceRef.current = Date.now();
      shownBannerKeysRef.current.clear();
      knownBannerKeysRef.current.clear();
      knownRequestStatusByBaseKeyRef.current.clear();
      hasPrimedBannerKeysRef.current = false;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [dismissLiveRequestBanner]);

  React.useEffect(() => {
    if (!ownerReady) {
      setQueuedLiveBannerRequests([]);
      knownBannerKeysRef.current.clear();
      knownRequestStatusByBaseKeyRef.current.clear();
      hasPrimedBannerKeysRef.current = false;
      dismissLiveRequestBanner();
      return;
    }

    const now = Date.now();
    const previousStatusByBaseKey = knownRequestStatusByBaseKeyRef.current;
    const nextStatusByBaseKey = new Map(previousStatusByBaseKey);
    requests.forEach((item) => {
      const baseKey = buildFrontendRequestBaseSyncKey(item);
      if (baseKey) {
        nextStatusByBaseKey.set(
          baseKey,
          buildOwnerLiveRequestStatusMarker(item),
        );
      }
    });

    const eligibleRequests = requests.filter((item) => {
      if (
        !isOwnerRelevantFrontendRequestValue(item, {
          isDeletedFrontendRequest,
          isSupersededCustomerCancellation: () => false,
        }) ||
        item.viewedBySalon === true ||
        viewedRequestIds.includes(buildViewedRequestSignature(item))
      ) {
        return false;
      }

      const bannerShownKey = buildOwnerLiveBannerShownKey(item);
      if (
        !bannerShownKey ||
        shownBannerKeysRef.current.has(bannerShownKey) ||
        knownBannerKeysRef.current.has(bannerShownKey)
      ) {
        return false;
      }

      const isCustomerCancellation = isCustomerCancellationRequestEvent(item);
      if (isCustomerCancellation) {
        const baseKey = buildFrontendRequestBaseSyncKey(item);
        const previousStatus = baseKey
          ? previousStatusByBaseKey.get(baseKey)
          : undefined;
        const nextStatus = buildOwnerLiveRequestStatusMarker(item);
        const isLiveCancellationTransition =
          !!previousStatus && previousStatus !== nextStatus;

        if (!isLiveCancellationTransition) {
          knownBannerKeysRef.current.add(bannerShownKey);
          shownBannerKeysRef.current.add(bannerShownKey);
          return false;
        }
      }

      const recentlyBanneredAt =
        recentlyBanneredKeysRef.current.get(bannerShownKey) ?? 0;
      if (
        recentlyBanneredAt > 0 &&
        now - recentlyBanneredAt <= OWNER_LIVE_REQUEST_BANNER_EVENT_TTL_MS
      ) {
        return false;
      }

      const timestamp = parseOwnerLiveRequestBannerTimestamp(item);
      if (
        typeof timestamp === "number" &&
        Number.isFinite(timestamp) &&
        timestamp < appForegroundSinceRef.current
      ) {
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        if (bannerShownKey) {
          knownBannerKeysRef.current.add(bannerShownKey);
          shownBannerKeysRef.current.add(bannerShownKey);
        }
        return false;
      }

      const seededAt = firstSeenAtRef.current.get(bannerShownKey);
      const firstSeenAt =
        typeof timestamp === "number" &&
        now - timestamp <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS
          ? timestamp
          : (seededAt ?? now);
      firstSeenAtRef.current.set(bannerShownKey, firstSeenAt);

      return now - firstSeenAt <= OWNER_LIVE_REQUEST_BANNER_QUEUE_WINDOW_MS;
    });

    if (!hasPrimedBannerKeysRef.current) {
      eligibleRequests.forEach((item) => {
        const bannerShownKey = buildOwnerLiveBannerShownKey(item);
        if (bannerShownKey) {
          shownBannerKeysRef.current.add(bannerShownKey);
          knownBannerKeysRef.current.add(bannerShownKey);
        }
      });
      knownRequestStatusByBaseKeyRef.current = nextStatusByBaseKey;
      hasPrimedBannerKeysRef.current = true;
      return;
    }

    const nextRequests = eligibleRequests.filter((item) => {
      const bannerShownKey = buildOwnerLiveBannerShownKey(item);
      return (
        !!bannerShownKey && !shownBannerKeysRef.current.has(bannerShownKey)
      );
    });

    if (nextRequests.length === 0) {
      knownRequestStatusByBaseKeyRef.current = nextStatusByBaseKey;
      return;
    }

    knownRequestStatusByBaseKeyRef.current = nextStatusByBaseKey;
    setQueuedLiveBannerRequests((current) => {
      const byKey = new Map<string, OwnerBookingRequestItem>();
      current.forEach((item) => {
        const key = buildOwnerLiveBannerShownKey(item);
        if (key && !shownBannerKeysRef.current.has(key)) {
          byKey.set(key, item);
        }
      });
      nextRequests.forEach((item) => {
        const key = buildOwnerLiveBannerShownKey(item);
        if (key) {
          byKey.set(key, item);
        }
      });
      return Array.from(byKey.values());
    });
  }, [
    dismissLiveRequestBanner,
    isDeletedFrontendRequest,
    ownerReady,
    requests,
    viewedRequestIds,
  ]);

  React.useEffect(() => {
    if (
      !ownerReady ||
      liveRequestBanner ||
      queuedLiveBannerRequests.length === 0
    ) {
      return;
    }

    const now = Date.now();
    const sortedQueuedRequests = [...queuedLiveBannerRequests].sort(
      (left, right) => {
        const leftTs = parseOwnerLiveRequestBannerTimestamp(left) ?? 0;
        const rightTs = parseOwnerLiveRequestBannerTimestamp(right) ?? 0;
        return rightTs - leftTs;
      },
    );

    if (sortedQueuedRequests.length > 1) {
      sortedQueuedRequests.forEach((item) => {
        const key = buildOwnerLiveBannerShownKey(item);
        if (!key) return;
        shownBannerKeysRef.current.add(key);
        recentlyBanneredKeysRef.current.set(key, now);
      });
      setQueuedLiveBannerRequests([]);
      const summary = buildOwnerLiveRequestBatchSummary(sortedQueuedRequests);
      const bannerDisplayKey = `ios-batch-${now}-${sortedQueuedRequests.length}`;
      setLiveRequestBanner({
        eventKey: bannerDisplayKey,
        title: summary.title,
        body: summary.body,
        requestDate: sortedQueuedRequests[0]?.data ?? null,
        requestId: sortedQueuedRequests[0]?.id ?? null,
        requestTime: sortedQueuedRequests[0]?.ora ?? null,
        targetTab: summary.targetTab,
        targetSection: summary.targetSection,
      });
      void playOwnerForegroundBannerSound({
        dedupeKey: bannerDisplayKey,
      }).catch(() => null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        dismissLiveRequestBanner();
      }, OWNER_LIVE_REQUEST_BANNER_DURATION_MS);
      return;
    }

    const nextBannerRequest = sortedQueuedRequests[0];
    const bannerShownKey = buildOwnerLiveBannerShownKey(nextBannerRequest);
    if (!bannerShownKey) {
      setQueuedLiveBannerRequests((current) => current.slice(1));
      return;
    }

    shownBannerKeysRef.current.add(bannerShownKey);
    recentlyBanneredKeysRef.current.set(bannerShownKey, now);
    setQueuedLiveBannerRequests((current) =>
      current.filter(
        (item) => buildOwnerLiveBannerShownKey(item) !== bannerShownKey,
      ),
    );

    const bannerEventKey = buildLiveRequestBannerEventKey(nextBannerRequest);
    const isCustomerCancellation =
      isCustomerCancellationRequestEvent(nextBannerRequest);
    const isAcceptedOperatorChange =
      nextBannerRequest.stato === "Accettata" &&
      nextBannerRequest.operatorChangeStatus === "accepted";
    const bannerDisplayKey = isCustomerCancellation
      ? bannerShownKey
      : bannerEventKey;
    const customerLabel = [
      nextBannerRequest.nome?.trim(),
      nextBannerRequest.cognome?.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const serviceLabel = nextBannerRequest.servizio?.trim() || "Servizio";
    const datetimeLabel = formatOwnerPushDateTimeLabel(
      nextBannerRequest.data,
      nextBannerRequest.ora,
    );
    const operatorLabel = nextBannerRequest.operatoreNome?.trim() ?? "";
    const roleLabel = nextBannerRequest.mestiereRichiesto?.trim() ?? "";
    const bannerBodyParts = [
      customerLabel || "Cliente",
      serviceLabel ? `Servizio: ${serviceLabel}` : null,
      roleLabel ? `Mestiere: ${roleLabel}` : null,
      datetimeLabel ? `Appuntamento: ${datetimeLabel}` : null,
      operatorLabel ? `Operatore: ${operatorLabel}` : null,
    ].filter(Boolean);

    setLiveRequestBanner({
      eventKey: bannerDisplayKey,
      title: isCustomerCancellation
        ? "Richiesta annullata dal cliente"
        : isAcceptedOperatorChange
          ? "Cambio operatore accettato"
          : "Nuova richiesta prenotazione",
      body: bannerBodyParts.join(". "),
      requestDate: nextBannerRequest.data ?? null,
      requestId: nextBannerRequest.id ?? null,
      requestTime: nextBannerRequest.ora ?? null,
      targetTab:
        isCustomerCancellation || isAcceptedOperatorChange
          ? "prenotazioni"
          : "agenda",
      targetSection: isCustomerCancellation
        ? "cancelled"
        : isAcceptedOperatorChange
          ? "accepted"
          : null,
    });

    void playOwnerForegroundBannerSound({ dedupeKey: bannerDisplayKey }).catch(
      () => null,
    );

    timeoutRef.current = setTimeout(() => {
      dismissLiveRequestBanner();
    }, OWNER_LIVE_REQUEST_BANNER_DURATION_MS);
  }, [
    dismissLiveRequestBanner,
    liveRequestBanner,
    ownerReady,
    queuedLiveBannerRequests,
  ]);

  const openBannerTarget = React.useCallback(() => {
    const tapAt = getCustomBarNavPerfNow();
    const target = liveRequestBanner;

    if (!target) {
      return;
    }

    logCustomBarNavPerf("owner_ios_banner_tap", {
      targetTab: target.targetTab,
      targetDate: target.requestDate ?? null,
      requestId: target.requestId ?? null,
    });

    if (target.targetTab === "prenotazioni") {
      logCustomBarNavPerf("owner_ios_banner_navigate_start", {
        targetTab: target.targetTab,
        elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
      });
      router.push({
        pathname: "/(tabs)/prenotazioni",
        params: {
          section: target.targetSection ?? undefined,
          requestId: target.requestId ?? undefined,
        },
      });
      requestAnimationFrame(() => {
        dismissLiveRequestBanner();
        logCustomBarNavPerf("owner_ios_banner_dismiss_after_nav", {
          targetTab: target.targetTab,
          elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
        });
      });
      return;
    }

    logCustomBarNavPerf("owner_ios_banner_navigate_start", {
      targetTab: target.targetTab,
      elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
    });
    router.push({
      pathname: "/(tabs)/agenda",
      params: {
        start: target.requestDate ?? undefined,
        requestId: target.requestId ?? undefined,
        requestTime: target.requestTime ?? undefined,
        openDetails: (target.openDetails ?? true) ? "true" : "false",
      },
    });
    requestAnimationFrame(() => {
      dismissLiveRequestBanner();
      logCustomBarNavPerf("owner_ios_banner_dismiss_after_nav", {
        targetTab: target.targetTab,
        elapsedMs: Math.round(getCustomBarNavPerfNow() - tapAt),
      });
    });
  }, [dismissLiveRequestBanner, liveRequestBanner, router]);

  if (!liveRequestBanner) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.tabBarOverlay}>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOutUp.duration(240)}
        style={styles.liveRequestBanner}
      >
        <Pressable
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={openBannerTarget}
          onPressIn={() => {
            logCustomBarNavPerf("owner_ios_banner_press_in", {
              targetTab: liveRequestBanner.targetTab,
              requestId: liveRequestBanner.requestId ?? null,
            });
          }}
          style={({ pressed }) => [
            styles.liveRequestBannerPressArea,
            pressed && styles.liveRequestBannerPressAreaPressed,
          ]}
        >
          <View style={styles.liveRequestBannerIconWrap}>
            <Ionicons name="notifications" size={18} color={notificationBannerTone.icon} />
          </View>
          <View style={styles.liveRequestBannerTextWrap}>
            <Text style={styles.liveRequestBannerTitle}>
              {liveRequestBanner.title}
            </Text>
            <Text style={styles.liveRequestBannerBody} numberOfLines={2}>
              {liveRequestBanner.body}
            </Text>
            <Text style={styles.liveRequestBannerHint}>Tocca per aprire</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  return <AccessAppearanceProvider><OwnerTabLayout /></AccessAppearanceProvider>;
}

function OwnerTabLayout() {
  const premiumViewport = useWindowDimensions();
  const nativeNavigation = useOwnerNativeNavigation();
  const ownerViewport = React.useMemo(() => ({width:nativeNavigation.contentWidth,sidebar:nativeNavigation.sidebar,railWidth:nativeNavigation.railWidth}), [nativeNavigation.contentWidth,nativeNavigation.sidebar,nativeNavigation.railWidth]);
  const [disableParentSwipe, setDisableParentSwipe] = React.useState(false);
  const pagerMotionActiveRef = React.useRef(false);
  const pendingParentSwipeLockRef = React.useRef<boolean | null>(null);
  const {
    showOnboarding,
    salonAccountEmail,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerAppointmentsAuthoritative,
    ownerMobileSessionAccessReady,
    agendaDensityPreferenceHydrated,
  } = useAppContext();
  const segments = useSegments();
  const activeTabSegment = segments.slice(1, 2)[0] ?? "";
  React.useEffect(() => {
    if (!IS_WEB || typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-salon-agenda-visible', activeTabSegment === 'agenda' ? 'true' : 'false');
    return () => document.documentElement.removeAttribute('data-salon-agenda-visible');
  }, [activeTabSegment]);
  const [
    showNativeOwnerColdStartSkeleton,
    setShowNativeOwnerColdStartSkeleton,
  ] = React.useState(() => !IS_WEB && !nativeOwnerColdStartTabsSettled);
  const effectiveDisableParentSwipe = IS_WEB
    ? false
    : disableParentSwipe;
  const safeSetDisableParentSwipe = React.useCallback((value: boolean) => {
    if (IS_WEB) {
      return;
    }
    if (pagerMotionActiveRef.current) {
      pendingParentSwipeLockRef.current = value;
      return;
    }
    setDisableParentSwipe(value);
  }, []);

  const handlePagerMotionChange = React.useCallback((moving: boolean) => {
    pagerMotionActiveRef.current = moving;
    if (moving) {
      return;
    }

    const pendingLock = pendingParentSwipeLockRef.current;
    pendingParentSwipeLockRef.current = null;
    // Un lock richiesto da una scena mentre il pager era in transizione non
    // deve sopravvivere al gesto. Un rilascio, invece, resta sempre sicuro.
    if (pendingLock === false) {
      setDisableParentSwipe(false);
    }
  }, []);

  React.useEffect(() => {
    if (IS_WEB) {
      return;
    }

    setDisableParentSwipe(false);
  }, [activeTabSegment]);

  React.useEffect(() => {
    if (
      !IS_WEB ||
      showOnboarding ||
      !salonAccountEmail.trim() ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady
    ) {
      return;
    }

    // Le route web restano asincrone per non appesantire la Home. Quando il
    // browser e libero, scarichiamo un modulo alla volta senza montare la
    // relativa pagina: i tap successivi non devono attendere rete + parsing.
    const loaders = [
      () => import("./agenda"),
      () => import("./prenotazioni"),
      () => import("./clienti"),
      () => import("./servizi"),
      () => import("./cassa"),
      () => import("./settings"),
    ];
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const webWindow = globalThis as typeof globalThis & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const warmNext = () => {
      if (cancelled) return;
      const load = loaders.shift();
      if (!load) return;
      void load().finally(() => {
        if (cancelled) return;
        timeoutId = setTimeout(scheduleNext, 80);
      });
    };
    const scheduleNext = () => {
      if (cancelled) return;
      if (webWindow.requestIdleCallback) {
        idleId = webWindow.requestIdleCallback(warmNext, { timeout: 900 });
      } else {
        timeoutId = setTimeout(warmNext, 160);
      }
    };

    timeoutId = setTimeout(scheduleNext, 250);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId !== null) webWindow.cancelIdleCallback?.(idleId);
    };
  }, [
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    salonAccountEmail,
    showOnboarding,
  ]);

  React.useEffect(() => {
    if (!__DEV__ || IS_ANDROID || IS_WEB) {
      return;
    }

    console.log("[ios-owner-tabs-startup-state]", {
      activeTabSegment,
      showOnboarding,
      hasSalonAccount: !!salonAccountEmail.trim(),
      ownerMobileSessionAccessReady,
      ownerInitialDataHydrating,
      ownerServerSyncReady,
      ownerAppointmentsAuthoritative,
      agendaDensityPreferenceHydrated,
      showNativeOwnerColdStartSkeleton,
    });
  }, [
    activeTabSegment,
    agendaDensityPreferenceHydrated,
    ownerAppointmentsAuthoritative,
    ownerInitialDataHydrating,
    ownerMobileSessionAccessReady,
    ownerServerSyncReady,
    salonAccountEmail,
    showNativeOwnerColdStartSkeleton,
    showOnboarding,
  ]);

  React.useEffect(() => {
    if (
      IS_WEB ||
      nativeOwnerColdStartTabsSettled ||
      showOnboarding ||
      !salonAccountEmail.trim() ||
      !ownerMobileSessionAccessReady ||
      ownerInitialDataHydrating ||
      !ownerServerSyncReady ||
      !ownerAppointmentsAuthoritative ||
      !agendaDensityPreferenceHydrated
    ) {
      return;
    }

    if (__DEV__ && !IS_ANDROID && activeTabSegment === "agenda") {
      console.log("[ios-agenda-startup] skeleton_released", {
        ownerAppointmentsAuthoritative,
        ownerServerSyncReady,
        agendaDensityPreferenceHydrated,
      });
    }
    nativeOwnerColdStartTabsSettled = true;
    setShowNativeOwnerColdStartSkeleton(false);
  }, [
    agendaDensityPreferenceHydrated,
    ownerAppointmentsAuthoritative,
    ownerInitialDataHydrating,
    ownerMobileSessionAccessReady,
    ownerServerSyncReady,
    salonAccountEmail,
    showOnboarding,
  ]);

  const screenOptions = React.useMemo<MaterialTopTabNavigationOptions>(
    () => ({
      // Native scenes follow the finger on both iOS and Android.
      // Existing screen locks still protect controls and horizontal card gestures.
      swipeEnabled: !IS_WEB && !effectiveDisableParentSwipe && !showOnboarding,
      animationEnabled: false,
      lazy: IS_WEB,
      // Android loads each heavy scene on first use and retains its React
      // state. Background scene mounting must not block the visible page.
      lazyPreloadDistance: 0,
      tabBarScrollEnabled: false,
      tabBarStyle: {
        display: "none",
      },
      sceneStyle: {
        backgroundColor: "transparent",
        paddingLeft: nativeNavigation.railWidth,
      },
    }),
    [
      effectiveDisableParentSwipe,
      showOnboarding,
      nativeNavigation.railWidth,
    ],
  );
  const renderOwnerTabBar = React.useCallback(
    (props: MaterialTopTabBarProps) => (
      <BottomTabBar {...props} onPagerMotionChange={handlePagerMotionChange} />
    ),
    [handlePagerMotionChange],
  );

  const nativeSwipeLockContextValue = React.useMemo(() => ({
    disableParentSwipe: effectiveDisableParentSwipe,
    setDisableParentSwipe: safeSetDisableParentSwipe,
    isAndroidTabSwipeLocked: effectiveDisableParentSwipe,
    setIsAndroidTabSwipeLocked: safeSetDisableParentSwipe,
  }), [effectiveDisableParentSwipe, safeSetDisableParentSwipe]);

  return (
    <OwnerViewportContext.Provider value={ownerViewport}>
    <OwnerStartupLoadingProvider active={showNativeOwnerColdStartSkeleton}>
      <TabSwipeLockProvider
        value={nativeSwipeLockContextValue}
      >
        <View
          {...(IS_WEB
            ? ({ 'data-salon-web-tab-pager': 'true' } as any)
            : {})}
          style={[styles.tabPagerShell, IS_WEB && premiumViewport.width >= 1000 ? { paddingLeft: OWNER_RAIL_WIDTH } : null]}
          collapsable={false}
        >
          {IS_WEB ? <OwnerWebBackdrop /> : <NativeHomeBackdrop/>}
          {IS_WEB && premiumViewport.width < 1000 && activeTabSegment !== 'agenda' ? <OwnerPremiumCompactAppearance /> : null}
          <ExpoRouterMaterialTopTabs
            tabBar={renderOwnerTabBar}
            overdrag={!IS_WEB}
            overScrollMode={IS_WEB ? "never" : "always"}
            offscreenPageLimit={
              IS_ANDROID ? 1 : undefined
            }
            screenOptions={screenOptions}
          >
            <ExpoRouterMaterialTopTabs.Screen
              name="index"
              options={{ title: "Home" }}
            />
            <ExpoRouterMaterialTopTabs.Screen
              name="agenda"
              options={{
                title: "Agenda",
                lazy: IS_WEB || IS_ANDROID,
                lazyPlaceholder: IS_ANDROID
                  ? renderAndroidLazyTabPlaceholder
                  : undefined,
              }}
            />
            <ExpoRouterMaterialTopTabs.Screen
              name="prenotazioni"
              options={{
                title: "Richieste",
                lazy: IS_WEB || IS_ANDROID,
                lazyPlaceholder: IS_ANDROID
                  ? renderAndroidLazyTabPlaceholder
                  : undefined,
              }}
            />
            <ExpoRouterMaterialTopTabs.Screen
              name="clienti"
              options={{
                title: "Clienti",
                lazy: IS_WEB || IS_ANDROID,
                lazyPlaceholder: IS_ANDROID
                  ? renderAndroidLazyTabPlaceholder
                  : undefined,
              }}
            />
            <ExpoRouterMaterialTopTabs.Screen
              name="servizi"
              options={{
                title: "Servizi",
                lazy: IS_WEB || IS_ANDROID,
                lazyPlaceholder: IS_ANDROID
                  ? renderAndroidLazyTabPlaceholder
                  : undefined,
              }}
            />
            <ExpoRouterMaterialTopTabs.Screen name="cassa" options={{ title: "Cassa", lazy: IS_ANDROID, lazyPlaceholder: IS_ANDROID ? renderAndroidLazyTabPlaceholder : undefined }} />
            <ExpoRouterMaterialTopTabs.Screen name="settings" options={{ title: "Impostazioni", lazy: IS_ANDROID, lazyPlaceholder: IS_ANDROID ? renderAndroidLazyTabPlaceholder : undefined }} />
          </ExpoRouterMaterialTopTabs>
          <OwnerWebPageSkeleton active={IS_WEB && !showOnboarding && !!salonAccountEmail.trim() && (ownerInitialDataHydrating || !ownerServerSyncReady || !ownerAppointmentsAuthoritative)}/>
        </View>
      </TabSwipeLockProvider>
    </OwnerStartupLoadingProvider>
    </OwnerViewportContext.Provider>
  );
}

const baseTabStyles = StyleSheet.create({
  tabPagerShell: {
    flex: 1,
    position: "relative",
  },
  androidLazyTabPlaceholder: {
    flex: 1,
    backgroundColor: "#F4F7FB",
    paddingHorizontal: 24,
    paddingTop: 64,
    gap: 18,
  },
  androidLazyTabPlaceholderHero: {
    height: 190,
    borderRadius: 34,
    backgroundColor: "#FFFFFF",
  },
  androidLazyTabPlaceholderTitle: {
    width: "56%",
    height: 34,
    marginTop: 10,
    borderRadius: 17,
    backgroundColor: "#E2EAF5",
  },
  androidLazyTabPlaceholderCard: {
    height: 150,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  liveRequestBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    top: IS_WEB ? 18 : Platform.OS === "ios" ? 58 : 28,
    zIndex: 80,
    borderRadius: 24,
    backgroundColor: "rgba(15,23,42,0.96)",
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#020617",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  liveRequestBannerPressArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
  },
  liveRequestBannerPressAreaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  liveRequestBannerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(37,99,235,0.92)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  liveRequestBannerTextWrap: {
    flex: 1,
  },
  liveRequestBannerTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  liveRequestBannerBody: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  liveRequestBannerHint: {
    marginTop: 4,
    color: "rgba(191,219,254,0.86)",
    fontSize: 11,
    fontWeight: "700",
  },
  animatedIndicator: {
    position: "absolute",
    top: 0,
    borderRadius: 22,
    zIndex: 1,
    marginVertical: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  animatedIndicatorHidden: {
    opacity: 0,
  },
  animatedIndicatorAndroid: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  tabBarIndicatorModeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  animatedIndicatorGlow: {
    ...StyleSheet.absoluteFillObject,
    left: -4,
    right: -4,
    top: -4,
    bottom: -4,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.025)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  animatedIndicatorGlass: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: 0.8,
    borderColor: "rgba(255,255,255,0.18)",
  },
  animatedIndicatorHighlight: {
    position: "absolute",
    top: 0,
    left: 2,
    right: 2,
    height: "28%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  animatedIndicatorLowlight: {
    position: "absolute",
    bottom: 0,
    left: 2,
    right: 2,
    height: "22%",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  animatedIndicatorInnerStroke: {
    position: "absolute",
    top: 1,
    left: -2,
    right: -2,
    bottom: 1,
    borderRadius: 22,
    borderWidth: 0.6,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
    elevation: 20,
    backgroundColor: "transparent",
  },
  tabBarOuter: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  tabBar: {
    width: "100%",
    maxWidth: 560,
    minWidth: 320,
    backgroundColor: "rgba(18, 22, 30, 0.78)",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    overflow: "hidden",
    position: "relative",
  },
  tabBarFixedRow: {
    paddingHorizontal: 8,
    width: "100%",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-start",
    position: "relative",
  },
  tabBarAndroid: {
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    boxShadow: '0 6px 16px rgba(9,16,28,0.20)',
  },
  tabBarItem: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    zIndex: 2,
    minHeight: 46,
  },
  tabBarItemPressed: {
    transform: [{ scale: 0.985 }],
  },
  tabBarItemInner: {
    width: "100%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabBarItemContent: {
    width: "100%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
  },
  tabBarIconStack: {
    width: 34,
    height: 30,
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  tabBarIconLayer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarIconLayerAbsolute: {
    position: "absolute",
  },
  tabBarVisualModeLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarItemActive: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
  },
  notificationBadge: {
    position: "absolute",
    top: IS_ANDROID ? -6 : -5,
    right: IS_ANDROID ? -4 : -5,
    minWidth: IS_ANDROID ? 16 : 18,
    height: IS_ANDROID ? 16 : 18,
    borderRadius: 999,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: IS_ANDROID ? 4 : 5,
    shadowColor: "#FF3B30",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
  },
  notificationBadgePulse: {
    transform: [{ scale: 1.18 }],
    shadowOpacity: 0.46,
    shadowRadius: 10,
    elevation: 8,
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: IS_ANDROID ? 7.5 : 8.5,
    fontWeight: "800",
    letterSpacing: 0,
    paddingHorizontal: 0,
  },
  tabBarLabel: {
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  tabBarLabelStack: {
    display: "none",
    width: "100%",
    minHeight: IS_ANDROID ? 14 : 12,
    marginTop: 2,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabBarLabelLayer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarLabelLayerAbsolute: {
    position: "absolute",
  },
  tabBarLabelActive: {
    color: "#FFFFFF",
  },
  tabBarLabelInactive: {
    color: "#A8B2C7",
  },
});

const styles = baseTabStyles;
