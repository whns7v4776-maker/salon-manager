import {OwnerWebPageTitle} from '../../components/owner-web-page-title';
import { PremiumFitLabel } from '../../components/ui/premium-fit-label';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativePremiumScope, NativeReadableText as Text, NativePremiumIcon as Ionicons} from '../../components/owner-native-premium';
import { OwnerBrandMark } from '../../components/salon-brand-mark';
import { RequestsListDialog } from '../../components/requests-list-dialog';
import { RequestsArchiveBrowser } from '../../components/requests-archive-browser';
import { RequestsPremiumWorkspace } from '../../components/requests-premium-workspace';
import { OwnerPremiumSheetFrame } from '../../components/owner-premium-sheet';
import { NativeRequestsHeader, RequestsWebSummary, nativeRequestsStyles } from '../../components/owner-premium-requests';
import { NativeMedal } from '../../components/owner-premium-native-home';
import { useAccessAppearance } from '../../components/access-premium';
import { NativeSheetHandle } from '../../components/ui/native-sheet-drag';
import { DockedSheetSurface } from '../../components/ui/docked-sheet-surface';
import { CustomerCancellationSettings } from '../../components/customer-cancellation-settings';
import { NotificationArchiveSearch } from '../../components/notification-archive-search';

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  LinearTransition,
} from "react-native-reanimated";
import {
  SectionHowItWorksPanel,
} from "../../components/section-how-it-works";
import { HapticTouchable, HapticTouchableFastRegion } from "../../components/ui/haptic-touchable";
import { NumberPickerModal } from "../../components/ui/number-picker-modal";
import { MarkAllReadButton } from "../../components/ui/mark-all-read-button";
import { PremiumExpandButton } from "../../components/ui/premium-expand-button";
import { PremiumGuideDock } from "../../components/ui/premium-guide-dock";
import {
  getWebExpandableCardProps,
  getWebExpandableCardStyle,
} from "../../components/ui/web-expandable-card";
import { useAppContext } from "../../src/context/AppContext";
import {
  OwnerStartupSkeletonItem,
  OwnerStartupSkeletonPulse,
  useOwnerStartupLoading,
} from "../../src/context/OwnerStartupLoadingContext";
import { useUnreadBadges } from "../../src/context/UnreadBadgeContext";
import { buildOwnerViewedRequestSignature, markOwnerAcceptedBookingRequestsRead } from "../../src/lib/badges/owner-accepted-request-read";
import {
  formatDateLong,
  getManualAcceptanceOperatorOptions,
  getSlotIntervalForDate,
  getTodayDateString,
  minutesToTime,
  parseIsoDate,
  timeToMinutes,
  type AvailabilitySettings,
  normalizeAvailabilitySettings,
} from "../../src/lib/booking";
import { haptic } from "../../src/lib/haptics";
import { createOwnerRequestAlert, type OwnerRequestDialog } from "../../src/lib/owner-request-alert";
import { isUnworkedManualBookingRequest } from "../../src/lib/customer-online-booking-policy";
import { isUnsubmittedBookingPaymentHold } from "../../src/lib/booking-payment-flow";
import { activateIntelligentGuidedSlots } from "../../src/lib/intelligent-slot-cadence";
import { tApp } from "../../src/lib/i18n";
import { emitOwnerViewedNotificationChange } from "../../src/lib/notification-badge-sync";
import { buildArchiveSearchText } from "../../src/lib/notification-archive-search";
import { useResponsiveLayout } from "../../src/lib/responsive";
import { normalizeServicePhaseConfig } from "../../src/lib/service-phases";
import { supabase } from "../../src/lib/supabase";

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, "");
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, "");
  return normalized ? `https://wa.me/${normalized}` : "";
};
const buildInstagramUrl = (value?: string) => {
  const handle = value?.replace(/^@+/, "").trim();
  return handle ? `https://instagram.com/${handle}` : "";
};

const formatRequestDateKey = (value: string) => value || getTodayDateString();
const getRequestGroupPhaseLabel = (item: {
  appointmentGroupId?: string | null;
  appointmentGroupOrder?: number | null;
  appointmentGroupSize?: number | null;
}) =>
  item.appointmentGroupId?.trim() &&
  typeof item.appointmentGroupOrder === "number" &&
  typeof item.appointmentGroupSize === "number" &&
  item.appointmentGroupSize > 1
    ? ` · Fase ${item.appointmentGroupOrder + 1}/${item.appointmentGroupSize}`
    : "";
const AUTO_ACCEPT_DELAY_MS = 15000;
const IS_ANDROID = Platform.OS === "android";
const IS_WEB = Platform.OS === "web";
const ENABLE_ANDROID_BACKOFFICE_PERF_LOGS = false;
const logAndroidBackofficePerf = (
  event: string,
  payload: Record<string, unknown> = {},
) => {
  void event;
  void payload;
};
const PRENOTAZIONI_CONTROL_STABLE_MS = 4500;
const PRENOTAZIONI_CONTROL_INBOUND_COMMIT_MS = 420;
const PRENOTAZIONI_CONTROL_PENDING_CONFIRMATION_TIMEOUT_MS = 12000;
const AUTO_ACCEPT_AUTHORITY_RETRY_DELAYS_MS = [450, 1400] as const;
type RequestAppointmentGroupKind = "composition" | "dependency" | "combo";
const isUuidLike = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const buildViewedRequestSignature = buildOwnerViewedRequestSignature;
const isResolvedOperatorChangeResponseEvent = (item: {
  operatorChangeStatus?: string | null;
  operatorChangeRespondedAt?: string | null;
}) =>
  !!String(item.operatorChangeRespondedAt ?? "").trim() &&
  (item.operatorChangeStatus === "accepted" ||
    item.operatorChangeStatus === "rejected" ||
    item.operatorChangeStatus === "expired");
const buildViewedRequestSyncSignature = (
  requestIds: string[],
  viewedSignatures: string[],
) =>
  `${requestIds.slice().sort().join("|")}::${viewedSignatures.slice().sort().join("|")}`;
const buildAutoAcceptRequestKey = (item: {
  id: string;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) => {
  const normalizedEmail = String(item.email ?? "")
    .trim()
    .toLowerCase();
  const normalizedPhone = String(item.telefono ?? "").replace(/\D+/g, "");
  const normalizedName =
    `${String(item.nome ?? "").trim()} ${String(item.cognome ?? "").trim()}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const identity =
    normalizedEmail ||
    normalizedPhone ||
    normalizedName ||
    String(item.id ?? "").trim();

  return [
    String(item.data ?? "").trim(),
    String(item.ora ?? "").trim(),
    String(item.servizio ?? "")
      .trim()
      .toLowerCase(),
    identity,
  ].join("|");
};
const getAutoAcceptRemainingSeconds = (
  item: {
    createdAt?: string | null;
  },
  nowMs: number,
) => {
  const createdAtMs = Number.isFinite(Date.parse(item.createdAt ?? ""))
    ? Date.parse(item.createdAt ?? "")
    : 0;
  if (createdAtMs <= 0) {
    return Math.ceil(AUTO_ACCEPT_DELAY_MS / 1000);
  }

  return Math.max(
    0,
    Math.ceil((createdAtMs + AUTO_ACCEPT_DELAY_MS - nowMs) / 1000),
  );
};
const buildPendingRequestSyncKey = (item: {
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
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .join("|");
const getRequestDisplayStatusRank = (item: {
  stato?: "In attesa" | "Accettata" | "Rifiutata" | "Annullata";
  cancellationSource?: string | null;
}) => {
  const cancellationSource = String(item.cancellationSource ?? "")
    .trim()
    .toLowerCase();

  switch (item.stato) {
    case "Annullata":
      return cancellationSource === "cliente" ||
        cancellationSource === "customer"
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
const compareRequestDisplayPriority = <
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
  const leftCreatedAt = Date.parse(String(left.createdAt ?? "").trim()) || 0;
  const rightCreatedAt = Date.parse(String(right.createdAt ?? "").trim()) || 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  const statusDiff =
    getRequestDisplayStatusRank(left) - getRequestDisplayStatusRank(right);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
};
type BackofficeRequestAnnulledSection =
  | "cancelled_by_salon_recent"
  | "cancelled_by_client_recent"
  | "archive"
  | "ignore";
type PrenotazioneRequestItem = ReturnType<
  typeof useAppContext
>["richiestePrenotazione"][number];
type BackofficeAnnulledDebugEntry = {
  item: PrenotazioneRequestItem;
  section: BackofficeRequestAnnulledSection;
  key: string;
  duplicateKey: string;
  dedupeApplied: boolean;
  reasonIncluded: string;
  reasonExcluded: string;
  source: "appointments" | "notifications" | "merged";
  dedupeGroupSize: number;
  suppressedDuplicateCount: number;
  sourceIds: string[];
  stableCarriedFromPreviousFrame: boolean;
};
type StableClientCancelledEntry = {
  entry: BackofficeAnnulledDebugEntry;
};
type StableHistoryRequestEntry = {
  item: PrenotazioneRequestItem;
  lastSeenAt: number;
};

type BookingSettingsHelpSection = "auto_accept" | "guided_slots";

function BookingSettingsHowItWorks({
  section,
  onClose,
}: {
  section: BookingSettingsHelpSection;
  onClose: () => void;
}) {
  const {palette}=useAccessAppearance();
  const styles=useMemo(()=>nativeRequestsStyles(baseRequestStyles,palette),[palette]);
  const isAutoAccept = section === "auto_accept";
  const steps = isAutoAccept
    ? [
        {
          title: "Attiva l’accettazione automatica",
          description:
            "Premi il pulsante della sezione: ogni nuova richiesta resta visibile per 15 secondi e poi viene accettata automaticamente.",
        },
        {
          title: "Intervieni durante il conto alla rovescia",
          description:
            "Se vuoi decidere tu, apri la richiesta e gestiscila prima della scadenza. Il tempo rimanente compare direttamente nella sezione.",
        },
        {
          title: "Controlla disponibilità e operatore",
          description:
            "L’accettazione usa lo slot richiesto e le regole del salone. Se la richiesta necessita di una decisione o modifica manuale, resta nella gestione dell’operatore.",
        },
        {
          title: "Torna alla gestione manuale quando vuoi",
          description:
            "Disattivando la funzione, le richieste restano “In attesa” finché il salone sceglie di accettarle o rifiutarle.",
        },
      ]
    : [
        {
          title: "Attiva gli slot guidati",
          description:
            "Si attiva Consigliati intelligenti con Consigliati + tutti e un passo cliente adatto ai servizi online. Puoi scegliere una visualizzazione più restrittiva e cambiare il passo in Agenda. Uscendo dalla modalità torna il passo precedente, se non lo hai modificato a mano.",
        },
        {
          title: "Scegli la strategia",
          description:
            "Consigliati intelligenti offre una scelta più ampia preservando spazi utili al listino; Equilibrata bilancia l’agenda; Proteggi lunghi conserva blocchi consecutivi per i trattamenti lunghi; Riempi buchi privilegia gli orari che completano gli spazi liberi.",
        },
        {
          title: "Decidi cosa vede il cliente",
          description:
            "Consigliati + tutti è la scelta predefinita della modalità intelligente. Puoi scegliere Prima i consigliati per metterli in evidenza oppure Solo consigliati per limitare la scelta ai suggerimenti.",
        },
        {
          title: "Mantieni valide tutte le regole",
          description:
            "I suggerimenti rispettano orari, pause, eccezioni, operatori, durate, fasi, servizi collegati e disponibilità reali.",
        },
      ];

  return (
    <SectionHowItWorksPanel onClose={() => onClose()}
      premiumNative
      title={
        isAutoAccept
          ? "Gestisci le richieste senza attese"
          : "Guida il cliente verso gli orari migliori"
      }
      description={
        isAutoAccept
          ? "Scegli se lasciare la decisione al salone oppure confermare automaticamente le nuove richieste."
          : "Configura l’ordine degli orari proposti e il livello di scelta lasciato al cliente."
      }
      steps={steps}
      note="L’impostazione viene salvata per il salone ed è condivisa tra web e app."
      style={styles.bookingSettingsHelpPanel}
    />
  );
}

const normalizeBackofficeRequestText = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getBackofficeRequestEventMonthKey = (item: {
  createdAt?: string | null;
  data?: string | null;
}) => {
  const createdAtMs = Date.parse(String(item.createdAt ?? "").trim());
  if (Number.isFinite(createdAtMs)) {
    const eventDate = new Date(createdAtMs);
    return `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}`;
  }

  const fallbackDate = parseIsoDate(item.data || getTodayDateString());
  return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`;
};

const buildBackofficeRequestRecordKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  const cancellationSource = normalizeBackofficeRequestText(
    item.cancellationSource,
  );
  const status = normalizeBackofficeRequestText(item.stato);
  const normalizedEmail = normalizeBackofficeRequestText(item.email);
  const normalizedPhone = String(item.telefono ?? "").replace(/\D+/g, "");
  const normalizedName = normalizeBackofficeRequestText(
    `${String(item.nome ?? "").trim()} ${String(item.cognome ?? "").trim()}`,
  );
  const identity =
    normalizedEmail ||
    normalizedPhone ||
    normalizedName ||
    String(item.id ?? "").trim();
  const type =
    status === "rifiutata"
      ? "rejected_by_salon"
      : cancellationSource === "cliente" || cancellationSource === "customer"
        ? "cancelled_by_client"
        : cancellationSource === "salone" || cancellationSource === "salon"
          ? "cancelled_by_salon"
          : status || "unknown";

  return [
    type,
    String(item.data ?? "").trim(),
    String(item.ora ?? "")
      .trim()
      .slice(0, 5),
    normalizeBackofficeRequestText(item.servizio),
    identity,
  ].join("|");
};

const getBackofficeRequestOptionalString = (
  item: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const getBackofficeRequestEventType = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  const status = normalizeBackofficeRequestText(item.stato);
  const cancellationSource = normalizeBackofficeRequestText(
    item.cancellationSource,
  );

  if (status === "rifiutata") {
    return "appointment_rejected_by_salon";
  }

  if (cancellationSource === "cliente" || cancellationSource === "customer") {
    return "appointment_cancelled_by_client";
  }

  if (cancellationSource === "salone" || cancellationSource === "salon") {
    return "appointment_cancelled_by_salon";
  }

  return status || "unknown";
};

const isBackofficeCustomerCancellation = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  const status = normalizeBackofficeRequestText(item.stato);
  const cancellationSource = normalizeBackofficeRequestText(
    item.cancellationSource,
  );
  return (
    (status === "annullata" || status === "cancelled") &&
    (cancellationSource === "cliente" || cancellationSource === "customer")
  );
};

const getBackofficeRequestAppointmentId = (item: Record<string, unknown>) =>
  getBackofficeRequestOptionalString(item, [
    "appointmentId",
    "appointment_id",
    "appuntamentoId",
    "appuntamento_id",
  ]);

const getBackofficeRequestNotificationId = (item: Record<string, unknown>) =>
  getBackofficeRequestOptionalString(item, [
    "notificationId",
    "notification_id",
    "ownerNotificationId",
    "owner_notification_id",
  ]);

const getBackofficeRequestEventId = (item: Record<string, unknown>) =>
  getBackofficeRequestOptionalString(item, [
    "eventId",
    "event_id",
    "eventIdentity",
    "event_identity",
  ]);

const getBackofficeRequestIdentityKey = (item: {
  id?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
}) => {
  const normalizedEmail = normalizeBackofficeRequestText(item.email);
  const normalizedPhone = String(item.telefono ?? "").replace(/\D+/g, "");
  const normalizedName = normalizeBackofficeRequestText(
    `${String(item.nome ?? "").trim()} ${String(item.cognome ?? "").trim()}`,
  );

  return (
    normalizedEmail ||
    normalizedPhone ||
    normalizedName ||
    String(item.id ?? "").trim()
  );
};

const getBackofficeRequestAppointmentIdFromRecord = (
  item: Record<string, unknown>,
) => {
  const explicitAppointmentId = getBackofficeRequestAppointmentId(item);
  if (explicitAppointmentId) {
    return explicitAppointmentId;
  }

  const recordId = typeof item.id === "string" ? item.id.trim() : "";
  const syntheticOwnerBookingMatch = recordId.match(/^owner-booking-(.+)$/);
  return syntheticOwnerBookingMatch?.[1]?.trim() ?? "";
};

const isBackofficeSalonRescheduleRelatedRecord = (
  item: Record<string, unknown>,
) =>
  [
    item.note,
    item.status,
    item.statusCode,
    item.status_code,
    item.type,
    item.eventType,
    item.event_type,
    item.notificationType,
    item.notification_type,
    item._pushEventType,
  ]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .some(
      (value) =>
        value.includes("appointment_rescheduled_by_salon") ||
        value.includes("rescheduled:") ||
        value.includes("spostato il tuo appuntamento") ||
        value.includes("salone ha spost"),
    );

const buildBackofficeClientCancelledRescheduleSuppressionKey = (item: {
  data?: string | null;
  servizio?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
  id?: string | null;
}) =>
  [
    String(item.data ?? "").trim(),
    normalizeBackofficeRequestText(item.servizio),
    getBackofficeRequestIdentityKey(item),
  ].join("|");

const buildBackofficeClientCancelledCanonicalDuplicateKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  const record = item as Record<string, unknown>;
  const appointmentId = getBackofficeRequestAppointmentIdFromRecord(record);

  if (appointmentId) {
    return `cancelled_by_client|appointment:${appointmentId}`;
  }

  if (isBackofficeSalonRescheduleRelatedRecord(record)) {
    return [
      "cancelled_by_client_rescheduled",
      buildBackofficeClientCancelledRescheduleSuppressionKey(item),
    ].join("|");
  }

  return buildBackofficeRequestRecordKey(item);
};

const buildBackofficeAnnulledDuplicateKey = (item: {
  id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome?: string | null;
  cognome?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  if (isBackofficeCustomerCancellation(item)) {
    return buildBackofficeClientCancelledCanonicalDuplicateKey(item);
  }

  const record = item as Record<string, unknown>;
  const type = getBackofficeRequestEventType(item);
  const appointmentId = getBackofficeRequestAppointmentId(record);

  if (appointmentId) {
    return `${appointmentId}:${type}`;
  }

  return buildBackofficeRequestRecordKey(item);
};

const compareBackofficeRequestRecordAuthority = <
  T extends {
    id?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  },
>(
  left: T,
  right: T,
) => {
  const leftIsBackend = isUuidLike(String(left.id ?? ""));
  const rightIsBackend = isUuidLike(String(right.id ?? ""));
  if (leftIsBackend !== rightIsBackend) {
    return leftIsBackend ? 1 : -1;
  }

  const leftUpdatedAt = Date.parse(String(left.updatedAt ?? "").trim()) || 0;
  const rightUpdatedAt = Date.parse(String(right.updatedAt ?? "").trim()) || 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  const leftCreatedAt = Date.parse(String(left.createdAt ?? "").trim()) || 0;
  const rightCreatedAt = Date.parse(String(right.createdAt ?? "").trim()) || 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
};

const buildBackofficeAnnulledSourceIds = (item: PrenotazioneRequestItem) => {
  const record = item as Record<string, unknown>;
  const appointmentId = getBackofficeRequestAppointmentIdFromRecord(record);
  const notificationId = getBackofficeRequestNotificationId(record);
  const eventId = getBackofficeRequestEventId(record);
  return Array.from(
    new Set(
      [
        String(item.id ?? "").trim()
          ? `record:${String(item.id ?? "").trim()}`
          : "",
        appointmentId ? `appointment:${appointmentId}` : "",
        notificationId ? `notification:${notificationId}` : "",
        eventId ? `event:${eventId}` : "",
      ].filter(Boolean),
    ),
  );
};

const mergeBackofficeAnnulledCanonicalItems = (
  existingItem: PrenotazioneRequestItem,
  incomingItem: PrenotazioneRequestItem,
): PrenotazioneRequestItem => {
  const preferredItem =
    compareBackofficeRequestRecordAuthority(existingItem, incomingItem) >= 0
      ? existingItem
      : incomingItem;
  const secondaryItem =
    preferredItem === existingItem ? incomingItem : existingItem;

  return {
    ...secondaryItem,
    ...preferredItem,
    viewedBySalon:
      existingItem.viewedBySalon === false ||
      incomingItem.viewedBySalon === false
        ? false
        : preferredItem.viewedBySalon === true ||
            secondaryItem.viewedBySalon === true
          ? true
          : (preferredItem.viewedBySalon ?? secondaryItem.viewedBySalon),
    viewedByCliente:
      preferredItem.viewedByCliente === false ||
      secondaryItem.viewedByCliente === false
        ? false
        : preferredItem.viewedByCliente === true ||
            secondaryItem.viewedByCliente === true
          ? true
          : (preferredItem.viewedByCliente ?? secondaryItem.viewedByCliente),
    cancellationSource:
      preferredItem.stato === "Annullata"
        ? (preferredItem.cancellationSource ?? secondaryItem.cancellationSource)
        : preferredItem.cancellationSource,
  };
};

type RequestGroup = {
  date: string;
  items: ReturnType<typeof useAppContext>["richiestePrenotazione"];
};
type RequestArchiveMonthGroup = {
  key: string;
  label: string;
  items: ReturnType<typeof useAppContext>["richiestePrenotazione"];
};

// System event notes are retained in storage; only authored notes belong in the card.
function visibleRequestNote(note?: string | null) {
  return (note ?? '').split(/\r?\n/).filter(line => !/^\s*appointment_(?:reorganized|rescheduled)_by_salon\b/i.test(line)).join('\n').trim();
}

export default function PrenotazioniScreen() {
  const isRequestsScreenFocused=useIsFocused();
  const {palette:premiumRequestsPalette,toggle:toggleRequestsTheme}=useAccessAppearance();
  const nativeScreenInsets=useSafeAreaInsets();
  const styles=useMemo(()=>nativeRequestsStyles(baseRequestStyles,premiumRequestsPalette),[premiumRequestsPalette]);
  const [ownerRequestDialog, setOwnerRequestDialog] = useState<OwnerRequestDialog | null>(null);
  const showOwnerRequestAlert = useMemo(
    () => createOwnerRequestAlert(setOwnerRequestDialog),
    [],
  );
  const closeOwnerRequestDialog = useCallback(() => {
    setOwnerRequestDialog(null);
    ownerRequestDialog?.onDismiss();
  }, [ownerRequestDialog]);
  const ownerStartupLoading = useOwnerStartupLoading();
  const prenotazioniPerfCountersRef = useRef({
    renderCount: 0,
    scrollEvents: 0,
    layoutEvents: 0,
    lastFlushAt: Date.now(),
  });
  if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
    const counters = prenotazioniPerfCountersRef.current;
    counters.renderCount += 1;
    const now = Date.now();
    if (now - counters.lastFlushAt >= 1000) {
      logAndroidBackofficePerf("prenotazioni_render_scroll_rate", {
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
  const { height } = useWindowDimensions();
  const routeParams = useLocalSearchParams<{
    section?: string | string[];
    requestId?: string | string[];
  }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const isScreenFocusedRef = useRef(false);
  const cancelledSectionYRef = useRef(0);
  const requestCardRefs = useRef(new Map<string, View | null>());
  const pendingVisibleRequestIdsRef = useRef(new Set<string>());
  const seenVisibleRequestIdsRef = useRef(new Set<string>());
  const lastClientCancelledMarkAsReadSignaturesRef = useRef(new Set<string>());
  const stableClientCancelledEntriesRef = useRef<
    Map<string, StableClientCancelledEntry>
  >(new Map());
  const stableHistoryRequestSectionsRef = useRef<
    Record<string, Map<string, StableHistoryRequestEntry>>
  >({});
  const scrolledRequestSectionKeysRef = useRef(new Set<string>());
  const requestVisualUnreadSnapshotsRef = useRef<Record<string, Set<string>>>(
    {},
  );
  const commitPendingRequestSectionsViewedRef = useRef<
    (sectionKeys?: string[]) => void
  >(() => undefined);
  const handledRouteTargetRef = useRef("");
  const pendingRequestsCountRef = useRef(0);
  const requestSnapshotsRef = useRef<
    Record<
      string,
      {
        stato: "In attesa" | "Accettata" | "Rifiutata" | "Annullata";
        viewedByCliente?: boolean;
        viewedBySalon?: boolean;
        cancellationSource?: "cliente" | "salone";
        durataMinuti?: number;
        operatoreId?: string;
        operatoreNome?: string;
        operatorChangeStatus?: "pending" | "accepted" | "rejected" | "expired";
        operatorChangeOriginalId?: string;
        operatorChangeOriginalName?: string;
        operatorChangeProposedId?: string;
        operatorChangeProposedName?: string;
        operatorChangeRequestedAt?: string;
        operatorChangeExpiresAt?: string;
        operatorChangeRespondedAt?: string;
      }
    >
  >({});
  const collapsedSections = useCallback(
    () => ({
      pending: false,
      customerConfirmation: false,
      cancelled: false,
      accepted: false,
      salonDeclined: false,
      archive: false,
    }),
    [],
  );
  const [expandedSections, setExpandedSections] =
    useState<Record<string, boolean>>(collapsedSections);
  const [workspaceSection,setWorkspaceSection]=useState("pending");
  const expandedSectionsRef = useRef(expandedSections);
  const [expandedDateGroups, setExpandedDateGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedArchiveMonths, setExpandedArchiveMonths] = useState<
    Record<string, boolean>
  >({});
  const [viewedRequestIds, setViewedRequestIds] = useState<string[]>([]);
  const [hasLoadedViewedRequestIds, setHasLoadedViewedRequestIds] =
    useState(false);
  const viewedRequestBackendSyncRef = useRef("");
  const {
    richiestePrenotazione,
    setRichiestePrenotazione,
    clienti,
    appuntamenti,
    servizi,
    operatori,
    availabilitySettings,
    updateAvailabilitySettingsPersisted,
    updateGuidedSlotsSettingsPersisted,
    salonWorkspace,
    refreshWorkspaceAutoAcceptBookingRequests,
    setWorkspaceAutoAcceptBookingRequestsPersisted,
    salonAccountEmail,
    appLanguage,
    updateBookingRequestStatusForSalon,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerWorkspaceSettingsHydrated,
    isAuthenticated,
    workspaceAccessAllowed,
  } = useAppContext();
  const { unreadCountsBySection, refreshBadges } = useUnreadBadges();
  const [selectedRequest, setSelectedRequest] = useState<
    (typeof richiestePrenotazione)[number] | null
  >(null);
  const [pendingStatusRequestIds, setPendingStatusRequestIds] = useState<
    string[]
  >([]);
  const [manualAcceptChoiceRequestId, setManualAcceptChoiceRequestId] =
    useState<string | null>(null);
  const [manualAcceptDurationRequestId, setManualAcceptDurationRequestId] =
    useState<string | null>(null);
  const [manualAcceptDurationPreview, setManualAcceptDurationPreview] =
    useState(0);
  const [manualAcceptOperatorId, setManualAcceptOperatorId] = useState("");
  const [
    remoteCancelledClientUnreadCount,
    setRemoteCancelledClientUnreadCount,
  ] = useState(0);
  const [bookingSettingsHelpOpen, setBookingSettingsHelpOpen] =
    useState<BookingSettingsHelpSection | null>(null);
  const requestAppointmentGroupIds = useMemo(
    () =>
      Array.from(
        new Set(
          richiestePrenotazione
            .map((item) => item.appointmentGroupId?.trim() ?? "")
            .filter(Boolean),
        ),
      ).sort(),
    [richiestePrenotazione],
  );
  const [requestAppointmentGroupKinds, setRequestAppointmentGroupKinds] =
    useState<Record<string, RequestAppointmentGroupKind>>({});

  useEffect(() => {
    const workspaceId = salonWorkspace.id?.trim() ?? "";
    let active = true;

    if (!workspaceId || requestAppointmentGroupIds.length === 0) {
      setRequestAppointmentGroupKinds({});
      return () => {
        active = false;
      };
    }

    void (async () => {
      const result = await supabase
        .from("appointment_groups")
        .select("id, metadata")
        .eq("workspace_id", workspaceId)
        .in("id", requestAppointmentGroupIds);
      if (!active) return;
      if (result.error) {
        console.log("Caricamento tipi appuntamenti collegati non riuscito:", result.error);
        return;
      }

      const nextKinds: Record<string, RequestAppointmentGroupKind> = {};
      ((result.data ?? []) as {
        id: string;
        metadata?: Record<string, unknown> | null;
      }[]).forEach((group) => {
        const metadata = group.metadata ?? {};
        nextKinds[group.id] =
          typeof metadata.compositionId === "string" && metadata.compositionId.trim()
            ? "composition"
            : (typeof metadata.dependencyServiceId === "string" &&
                  metadata.dependencyServiceId.trim()) ||
                (typeof metadata.dependencyParentServiceId === "string" &&
                  metadata.dependencyParentServiceId.trim())
              ? "dependency"
              : "combo";
      });
      setRequestAppointmentGroupKinds(nextKinds);
    })();

    return () => {
      active = false;
    };
  }, [requestAppointmentGroupIds, salonWorkspace.id]);

  useEffect(() => {
    expandedSectionsRef.current = expandedSections;
  }, [expandedSections]);
  const autoAcceptTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const richiesteDaAccettareRef = useRef<
    ReturnType<typeof useAppContext>["richiestePrenotazione"]
  >([]);
  const [guidedSlotsRemoteMirror, setGuidedSlotsRemoteMirror] =
    useState<AvailabilitySettings | null>(null);
  const [
    displayedAutoAcceptBookingRequests,
    setDisplayedAutoAcceptBookingRequests,
  ] = useState(() => salonWorkspace.autoAcceptBookingRequests === true);
  const [, setAutoAcceptServerChecking] = useState(true);
  const [autoAcceptSaving, setAutoAcceptSaving] = useState(false);
  const [autoAcceptAuthorityConfirmed, setAutoAcceptAuthorityConfirmed] =
    useState(() =>
      Boolean(salonWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim()),
    );
  const autoAcceptControlBusy = autoAcceptSaving;
  const refreshWorkspaceAutoAcceptRef = useRef(
    refreshWorkspaceAutoAcceptBookingRequests,
  );
  useEffect(() => {
    refreshWorkspaceAutoAcceptRef.current =
      refreshWorkspaceAutoAcceptBookingRequests;
  }, [refreshWorkspaceAutoAcceptBookingRequests]);
  const autoAcceptDisplaySyncTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const autoAcceptStableUntilRef = useRef(0);
  const autoAcceptPendingDesiredRef = useRef<boolean | null>(null);
  const autoAcceptPendingDesiredTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const autoAcceptLastAcceptedUpdatedAtRef = useRef(0);
  const autoAcceptConfirmOpenRef = useRef(false);
  const [autoAcceptNowMs, setAutoAcceptNowMs] = useState(() => Date.now());
  const [displayedGuidedAvailability, setDisplayedGuidedAvailability] =
    useState(() => normalizeAvailabilitySettings(availabilitySettings));
  const guidedDisplaySyncTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const guidedStableUntilRef = useRef(0);
  const guidedSaveLockRef = useRef(false);
  const guidedConfirmOpenRef = useRef(false);
  const [guidedSaving, setGuidedSaving] = useState(false);
  const guidedPendingDesiredRef = useRef<AvailabilitySettings | null>(null);
  const guidedPendingDesiredTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const guidedLastAcceptedUpdatedAtRef = useRef(Number.NEGATIVE_INFINITY);

  const getGuidedSlotsUpdatedAtMs = useCallback(
    (settings?: AvailabilitySettings | null) => {
      const rawValue = settings?.guidedSlotsUpdatedAt?.trim() ?? "";
      if (!rawValue) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(rawValue);
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    },
    [],
  );

  const effectiveGuidedAvailability = useMemo(() => {
    if (!guidedSlotsRemoteMirror) {
      return availabilitySettings;
    }

    const remoteTs = getGuidedSlotsUpdatedAtMs(guidedSlotsRemoteMirror);
    const localTs = getGuidedSlotsUpdatedAtMs(availabilitySettings);

    if (remoteTs !== Number.NEGATIVE_INFINITY && remoteTs >= localTs) {
      return {
        ...availabilitySettings,
        guidedSlotsEnabled: guidedSlotsRemoteMirror.guidedSlotsEnabled,
        guidedSlotsStrategy: guidedSlotsRemoteMirror.guidedSlotsStrategy,
        guidedSlotsVisibility: guidedSlotsRemoteMirror.guidedSlotsVisibility,
        guidedSlotsUpdatedAt: guidedSlotsRemoteMirror.guidedSlotsUpdatedAt,
      };
    }

    if (localTs === Number.NEGATIVE_INFINITY) {
      return {
        ...availabilitySettings,
        guidedSlotsEnabled: guidedSlotsRemoteMirror.guidedSlotsEnabled,
        guidedSlotsStrategy: guidedSlotsRemoteMirror.guidedSlotsStrategy,
        guidedSlotsVisibility: guidedSlotsRemoteMirror.guidedSlotsVisibility,
        guidedSlotsUpdatedAt: guidedSlotsRemoteMirror.guidedSlotsUpdatedAt,
      };
    }

    return availabilitySettings;
  }, [
    availabilitySettings,
    getGuidedSlotsUpdatedAtMs,
    guidedSlotsRemoteMirror,
  ]);

  const displayedGuidedSlotsEnabled =
    displayedGuidedAvailability.guidedSlotsEnabled;
  const displayedGuidedSlotsStrategy =
    displayedGuidedAvailability.guidedSlotsStrategy;
  const displayedGuidedSlotsVisibility =
    displayedGuidedAvailability.guidedSlotsVisibility;
  const autoAcceptWorkspaceUpdatedAtMs = useMemo(() => {
    const rawValue =
      salonWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim() || "";
    const parsed = Date.parse(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [salonWorkspace.autoAcceptBookingRequestsUpdatedAt]);

  useEffect(() => {
    if (autoAcceptDisplaySyncTimerRef.current) {
      clearTimeout(autoAcceptDisplaySyncTimerRef.current);
      autoAcceptDisplaySyncTimerRef.current = null;
    }
    if (autoAcceptPendingDesiredTimeoutRef.current) {
      clearTimeout(autoAcceptPendingDesiredTimeoutRef.current);
      autoAcceptPendingDesiredTimeoutRef.current = null;
    }

    autoAcceptPendingDesiredRef.current = null;
    autoAcceptStableUntilRef.current =
      Date.now() + PRENOTAZIONI_CONTROL_STABLE_MS;
    autoAcceptLastAcceptedUpdatedAtRef.current = 0;
    const hasPersistedAuthority = Boolean(
      salonWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim(),
    );
    setDisplayedAutoAcceptBookingRequests(
      salonWorkspace.autoAcceptBookingRequests === true,
    );
    setAutoAcceptAuthorityConfirmed(hasPersistedAuthority);
    setAutoAcceptServerChecking(Boolean(salonAccountEmail) && !hasPersistedAuthority);
  }, [salonAccountEmail]);

  useEffect(() => {
    let cancelled = false;

    const normalizedEmail = salonAccountEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const [storedAutoAcceptRaw, storedAutoAcceptUpdatedAtRaw] =
          await Promise.all([
            AsyncStorage.getItem(
              `salon_manager_workspace_auto_accept_booking_requests__${normalizedEmail}`,
            ),
            AsyncStorage.getItem(
              `salon_manager_workspace_auto_accept_booking_requests_updated_at__${normalizedEmail}`,
            ),
          ]);

        if (cancelled) {
          return;
        }

        if (storedAutoAcceptRaw === "true" || storedAutoAcceptRaw === "false") {
          const storedValue = storedAutoAcceptRaw === "true";
          const storedUpdatedAtMs = Number.isFinite(
            Date.parse(storedAutoAcceptUpdatedAtRaw ?? ""),
          )
            ? Date.parse(storedAutoAcceptUpdatedAtRaw ?? "")
            : 0;

          autoAcceptLastAcceptedUpdatedAtRef.current = Math.max(
            autoAcceptLastAcceptedUpdatedAtRef.current,
            storedUpdatedAtMs,
          );
          // Il valore locale serve solo come traccia temporale. Da questo
          // momento l'interruttore mostra e usa esclusivamente la conferma
          // riletta dal workspace remoto.
          void storedValue;
        }
      } catch (error) {
        console.log(
          "Errore reidratazione locale auto-accept richieste:",
          error,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [salonAccountEmail]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryIndex = 0;
      const workspaceId = salonWorkspace.id?.trim() ?? "";
      const salonCode = salonWorkspace.salonCode?.trim() ?? "";

      if (!isUuidLike(workspaceId) || !salonCode || !salonAccountEmail) {
        setAutoAcceptServerChecking(false);
        return () => {
          active = false;
        };
      }

      setAutoAcceptServerChecking(true);

      const verifyServerAuthority = async () => {
        try {
          const result = await refreshWorkspaceAutoAcceptRef.current();
          if (!active) return;
          if (result.ok && typeof result.value === "boolean") {
            if (autoAcceptDisplaySyncTimerRef.current) {
              clearTimeout(autoAcceptDisplaySyncTimerRef.current);
              autoAcceptDisplaySyncTimerRef.current = null;
            }
            if (autoAcceptPendingDesiredTimeoutRef.current) {
              clearTimeout(autoAcceptPendingDesiredTimeoutRef.current);
              autoAcceptPendingDesiredTimeoutRef.current = null;
            }
            autoAcceptPendingDesiredRef.current = null;
            const confirmedUpdatedAtMs = Date.parse(result.updatedAt ?? "");
            autoAcceptLastAcceptedUpdatedAtRef.current = Number.isFinite(
              confirmedUpdatedAtMs,
            )
              ? confirmedUpdatedAtMs
              : Date.now();
            autoAcceptStableUntilRef.current =
              Date.now() + PRENOTAZIONI_CONTROL_STABLE_MS;
            setDisplayedAutoAcceptBookingRequests(result.value);
            setAutoAcceptAuthorityConfirmed(true);
            setAutoAcceptServerChecking(false);
            return;
          }
        } catch (error) {
          console.log(
            "Verifica autorevole auto-accept richieste non riuscita:",
            error,
          );
        }

        if (!active) return;
        const retryDelay = AUTO_ACCEPT_AUTHORITY_RETRY_DELAYS_MS[retryIndex];
        if (typeof retryDelay === "number") {
          retryIndex += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void verifyServerAuthority();
          }, retryDelay);
          return;
        }

        const hasWorkspaceAuthority = Boolean(
          salonWorkspace.autoAcceptBookingRequestsUpdatedAt?.trim(),
        );
        if (hasWorkspaceAuthority) {
          setDisplayedAutoAcceptBookingRequests(
            salonWorkspace.autoAcceptBookingRequests === true,
          );
          setAutoAcceptAuthorityConfirmed(true);
        }
        setAutoAcceptServerChecking(false);
      };

      void verifyServerAuthority();

      return () => {
        active = false;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
      };
    }, [
      salonAccountEmail,
      salonWorkspace.id,
      salonWorkspace.salonCode,
      salonWorkspace.autoAcceptBookingRequests,
      salonWorkspace.autoAcceptBookingRequestsUpdatedAt,
    ]),
  );

  const areGuidedAvailabilityEquivalent = useCallback(
    (left?: AvailabilitySettings | null, right?: AvailabilitySettings | null) =>
      (left?.guidedSlotsEnabled ?? false) ===
        (right?.guidedSlotsEnabled ?? false) &&
      (left?.guidedSlotsStrategy ?? "balanced") ===
        (right?.guidedSlotsStrategy ?? "balanced") &&
      (left?.guidedSlotsVisibility ?? "recommended_first") ===
        (right?.guidedSlotsVisibility ?? "recommended_first") &&
      (left?.guidedSlotsUpdatedAt ?? "") ===
        (right?.guidedSlotsUpdatedAt ?? ""),
    [],
  );
  const areGuidedAvailabilitySelectionsEquivalent = useCallback(
    (left?: AvailabilitySettings | null, right?: AvailabilitySettings | null) =>
      (left?.guidedSlotsEnabled ?? false) ===
        (right?.guidedSlotsEnabled ?? false) &&
      (left?.guidedSlotsStrategy ?? "balanced") ===
        (right?.guidedSlotsStrategy ?? "balanced") &&
      (left?.guidedSlotsVisibility ?? "recommended_first") ===
        (right?.guidedSlotsVisibility ?? "recommended_first"),
    [],
  );

  useEffect(() => {
    const inboundValue = salonWorkspace.autoAcceptBookingRequests === true;
    const hasInboundAuthority =
      isUuidLike(salonWorkspace.id) && autoAcceptWorkspaceUpdatedAtMs > 0;

    if (!autoAcceptAuthorityConfirmed && hasInboundAuthority) {
      autoAcceptLastAcceptedUpdatedAtRef.current = autoAcceptWorkspaceUpdatedAtMs;
      setDisplayedAutoAcceptBookingRequests(inboundValue);
      setAutoAcceptAuthorityConfirmed(true);
      setAutoAcceptServerChecking(false);
      return;
    }

    if (!autoAcceptAuthorityConfirmed || autoAcceptControlBusy) {
      return;
    }

    if (
      !ownerWorkspaceSettingsHydrated &&
      (ownerInitialDataHydrating || !ownerServerSyncReady)
    ) {
      return;
    }

    if (IS_WEB) {
      if (autoAcceptDisplaySyncTimerRef.current) {
        clearTimeout(autoAcceptDisplaySyncTimerRef.current);
        autoAcceptDisplaySyncTimerRef.current = null;
      }
      if (autoAcceptPendingDesiredTimeoutRef.current) {
        clearTimeout(autoAcceptPendingDesiredTimeoutRef.current);
        autoAcceptPendingDesiredTimeoutRef.current = null;
      }
      autoAcceptPendingDesiredRef.current = null;
      autoAcceptLastAcceptedUpdatedAtRef.current =
        autoAcceptWorkspaceUpdatedAtMs;
      setDisplayedAutoAcceptBookingRequests(inboundValue);
      return;
    }

    if (autoAcceptPendingDesiredRef.current !== null) {
      if (inboundValue === autoAcceptPendingDesiredRef.current) {
        if (autoAcceptDisplaySyncTimerRef.current) {
          clearTimeout(autoAcceptDisplaySyncTimerRef.current);
          autoAcceptDisplaySyncTimerRef.current = null;
        }
        if (autoAcceptPendingDesiredTimeoutRef.current) {
          clearTimeout(autoAcceptPendingDesiredTimeoutRef.current);
          autoAcceptPendingDesiredTimeoutRef.current = null;
        }
        autoAcceptPendingDesiredRef.current = null;
        autoAcceptLastAcceptedUpdatedAtRef.current =
          autoAcceptWorkspaceUpdatedAtMs;
        autoAcceptStableUntilRef.current = Date.now() + 1200;
        if (displayedAutoAcceptBookingRequests !== inboundValue) {
          setDisplayedAutoAcceptBookingRequests(inboundValue);
        }
      }
      return;
    }

    const hasNewerInboundAutoAccept =
      autoAcceptWorkspaceUpdatedAtMs >
      autoAcceptLastAcceptedUpdatedAtRef.current;

    if (
      Date.now() < autoAcceptStableUntilRef.current &&
      !hasNewerInboundAutoAccept
    ) {
      return;
    }

    if (
      autoAcceptWorkspaceUpdatedAtMs <
        autoAcceptLastAcceptedUpdatedAtRef.current &&
      inboundValue !== displayedAutoAcceptBookingRequests
    ) {
      return;
    }

    if (displayedAutoAcceptBookingRequests === inboundValue) {
      if (autoAcceptDisplaySyncTimerRef.current) {
        clearTimeout(autoAcceptDisplaySyncTimerRef.current);
        autoAcceptDisplaySyncTimerRef.current = null;
      }
      autoAcceptLastAcceptedUpdatedAtRef.current = Math.max(
        autoAcceptLastAcceptedUpdatedAtRef.current,
        autoAcceptWorkspaceUpdatedAtMs,
      );
      return;
    }

    if (autoAcceptDisplaySyncTimerRef.current) {
      clearTimeout(autoAcceptDisplaySyncTimerRef.current);
    }

    autoAcceptDisplaySyncTimerRef.current = setTimeout(() => {
      autoAcceptDisplaySyncTimerRef.current = null;
      if (
        autoAcceptWorkspaceUpdatedAtMs <
          autoAcceptLastAcceptedUpdatedAtRef.current &&
        inboundValue !== displayedAutoAcceptBookingRequests
      ) {
        return;
      }
      autoAcceptStableUntilRef.current = Math.max(
        autoAcceptStableUntilRef.current,
        autoAcceptWorkspaceUpdatedAtMs > 0
          ? autoAcceptWorkspaceUpdatedAtMs + 1800
          : Date.now() + 1800,
      );
      autoAcceptLastAcceptedUpdatedAtRef.current = Math.max(
        autoAcceptLastAcceptedUpdatedAtRef.current,
        autoAcceptWorkspaceUpdatedAtMs,
      );
      setDisplayedAutoAcceptBookingRequests(inboundValue);
    }, PRENOTAZIONI_CONTROL_INBOUND_COMMIT_MS);
  }, [
    autoAcceptWorkspaceUpdatedAtMs,
    autoAcceptAuthorityConfirmed,
    autoAcceptControlBusy,
    displayedAutoAcceptBookingRequests,
    ownerInitialDataHydrating,
    ownerServerSyncReady,
    ownerWorkspaceSettingsHydrated,
    salonWorkspace.autoAcceptBookingRequests,
  ]);

  useEffect(() => {
    const nextGuidedAvailability = normalizeAvailabilitySettings(
      effectiveGuidedAvailability,
    );
    const nextGuidedUpdatedAtMs = getGuidedSlotsUpdatedAtMs(
      nextGuidedAvailability,
    );
    // The context is optimistic; do not expose its value before persistence
    // has completed. Ignore older mirrors after a successful local save.
    if (guidedSaveLockRef.current) return;
    if (nextGuidedUpdatedAtMs < guidedLastAcceptedUpdatedAtRef.current) return;

    if (IS_WEB) {
      if (guidedDisplaySyncTimerRef.current) {
        clearTimeout(guidedDisplaySyncTimerRef.current);
        guidedDisplaySyncTimerRef.current = null;
      }
      if (guidedPendingDesiredTimeoutRef.current) {
        clearTimeout(guidedPendingDesiredTimeoutRef.current);
        guidedPendingDesiredTimeoutRef.current = null;
      }
      guidedPendingDesiredRef.current = null;
      guidedLastAcceptedUpdatedAtRef.current = nextGuidedUpdatedAtMs;
      if (
        !areGuidedAvailabilityEquivalent(
          displayedGuidedAvailability,
          nextGuidedAvailability,
        )
      ) {
        setDisplayedGuidedAvailability(nextGuidedAvailability);
      }
      return;
    }

    if (guidedPendingDesiredRef.current) {
      if (
        areGuidedAvailabilitySelectionsEquivalent(
          guidedPendingDesiredRef.current,
          nextGuidedAvailability,
        )
      ) {
        if (guidedDisplaySyncTimerRef.current) {
          clearTimeout(guidedDisplaySyncTimerRef.current);
          guidedDisplaySyncTimerRef.current = null;
        }
        if (guidedPendingDesiredTimeoutRef.current) {
          clearTimeout(guidedPendingDesiredTimeoutRef.current);
          guidedPendingDesiredTimeoutRef.current = null;
        }
        guidedPendingDesiredRef.current = null;
        guidedLastAcceptedUpdatedAtRef.current = nextGuidedUpdatedAtMs;
        guidedStableUntilRef.current = Date.now() + 1200;
        if (
          !areGuidedAvailabilityEquivalent(
            displayedGuidedAvailability,
            nextGuidedAvailability,
          )
        ) {
          setDisplayedGuidedAvailability(nextGuidedAvailability);
        }
      }
      return;
    }

    if (Date.now() < guidedStableUntilRef.current) {
      return;
    }

    if (
      nextGuidedUpdatedAtMs < guidedLastAcceptedUpdatedAtRef.current &&
      !areGuidedAvailabilityEquivalent(
        displayedGuidedAvailability,
        nextGuidedAvailability,
      )
    ) {
      return;
    }

    if (
      areGuidedAvailabilityEquivalent(
        displayedGuidedAvailability,
        nextGuidedAvailability,
      )
    ) {
      if (guidedDisplaySyncTimerRef.current) {
        clearTimeout(guidedDisplaySyncTimerRef.current);
        guidedDisplaySyncTimerRef.current = null;
      }
      guidedLastAcceptedUpdatedAtRef.current = Math.max(
        guidedLastAcceptedUpdatedAtRef.current,
        nextGuidedUpdatedAtMs,
      );
      return;
    }

    if (guidedDisplaySyncTimerRef.current) {
      clearTimeout(guidedDisplaySyncTimerRef.current);
    }

    guidedDisplaySyncTimerRef.current = setTimeout(() => {
      guidedDisplaySyncTimerRef.current = null;
      const latestGuidedAvailability = normalizeAvailabilitySettings(
        effectiveGuidedAvailability,
      );
      const latestGuidedUpdatedAtMs = getGuidedSlotsUpdatedAtMs(
        latestGuidedAvailability,
      );
      if (
        latestGuidedUpdatedAtMs < guidedLastAcceptedUpdatedAtRef.current &&
        !areGuidedAvailabilityEquivalent(
          displayedGuidedAvailability,
          latestGuidedAvailability,
        )
      ) {
        return;
      }
      guidedLastAcceptedUpdatedAtRef.current = Math.max(
        guidedLastAcceptedUpdatedAtRef.current,
        latestGuidedUpdatedAtMs,
      );
      guidedStableUntilRef.current = Date.now() + 1800;
      setDisplayedGuidedAvailability(latestGuidedAvailability);
    }, PRENOTAZIONI_CONTROL_INBOUND_COMMIT_MS);
  }, [
    areGuidedAvailabilityEquivalent,
    areGuidedAvailabilitySelectionsEquivalent,
    displayedGuidedAvailability,
    effectiveGuidedAvailability,
    getGuidedSlotsUpdatedAtMs,
    guidedSaving,
  ]);

  useEffect(
    () => () => {
      if (autoAcceptDisplaySyncTimerRef.current) {
        clearTimeout(autoAcceptDisplaySyncTimerRef.current);
      }
      if (autoAcceptPendingDesiredTimeoutRef.current) {
        clearTimeout(autoAcceptPendingDesiredTimeoutRef.current);
      }
      if (guidedDisplaySyncTimerRef.current) {
        clearTimeout(guidedDisplaySyncTimerRef.current);
      }
      if (guidedPendingDesiredTimeoutRef.current) {
        clearTimeout(guidedPendingDesiredTimeoutRef.current);
      }
    },
    [],
  );

  useFocusEffect(useCallback(() => {
    if (!IS_WEB) {
      return;
    }

    const normalizedSalonCode =
      salonWorkspace.salonCode?.trim().toLowerCase() ?? "";
    if (!normalizedSalonCode) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestController: AbortController | null = null;

    const syncGuidedSlotsMirror = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) {
        return;
      }
      requestController = new AbortController();
      const { data, error } = await supabase.rpc(
        "get_client_portal_availability_settings",
        {
          p_salon_code: normalizedSalonCode,
        },
      ).abortSignal(requestController.signal);

      if (cancelled || error) {
        if (error && !cancelled) throw error;
        return;
      }

      const payload =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null;
      const nextAvailability = normalizeAvailabilitySettings(
        (payload?.availabilitySettings as
          Partial<AvailabilitySettings> | null | undefined) ?? {},
      );

      setGuidedSlotsRemoteMirror((current) => {
        const currentTs = getGuidedSlotsUpdatedAtMs(current);
        const nextTs = getGuidedSlotsUpdatedAtMs(nextAvailability);

        if (
          current &&
          nextTs !== Number.NEGATIVE_INFINITY &&
          currentTs !== Number.NEGATIVE_INFINITY &&
          nextTs < currentTs
        ) {
          return current;
        }

        if (
          current &&
          current.guidedSlotsEnabled === nextAvailability.guidedSlotsEnabled &&
          current.guidedSlotsStrategy ===
            nextAvailability.guidedSlotsStrategy &&
          current.guidedSlotsVisibility ===
            nextAvailability.guidedSlotsVisibility &&
          (current.guidedSlotsUpdatedAt ?? "") ===
            (nextAvailability.guidedSlotsUpdatedAt ?? "")
        ) {
          return current;
        }

        return nextAvailability;
      });
    };

    // Schedule only after settlement: slow responses must never accumulate
    // concurrent requests, including while this mounted tab is out of focus.
    const poll = async () => {
      let delay = 4000;
      const deadline = setTimeout(() => requestController?.abort(), 10000);
      try {
        await syncGuidedSlotsMirror();
      } catch {
        delay = 15000;
      } finally {
        clearTimeout(deadline);
        requestController = null;
        if (!cancelled) timer = setTimeout(() => void poll(), delay);
      }
    };
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      requestController?.abort();
    };
  }, [getGuidedSlotsUpdatedAtMs, salonWorkspace.salonCode]));

  const updateGuidedSlotsSettings = useCallback(
    async (updater: (current: typeof availabilitySettings) => typeof availabilitySettings) => {
      if (guidedSaveLockRef.current) return;
      guidedSaveLockRef.current = true;
      setGuidedSaving(true);
      if (guidedDisplaySyncTimerRef.current) {
        clearTimeout(guidedDisplaySyncTimerRef.current);
        guidedDisplaySyncTimerRef.current = null;
      }
      const previous = displayedGuidedAvailability;
      let confirmed = previous;
      try {
        await updateAvailabilitySettingsPersisted((current) => {
          confirmed = normalizeAvailabilitySettings({
            ...updater(current),
            guidedSlotsUpdatedAt: new Date().toISOString(),
          });
          return confirmed;
        }, { waitForServerPersistence: true, onServerConfirmed: (settings) => { confirmed = settings; } });
        guidedLastAcceptedUpdatedAtRef.current = getGuidedSlotsUpdatedAtMs(confirmed);
        guidedStableUntilRef.current = 0;
        setDisplayedGuidedAvailability(confirmed);
      } catch {
        setDisplayedGuidedAvailability(previous);
        if (IS_WEB && typeof window !== 'undefined') {
          window.alert('Impostazione non salvata. Controlla la connessione e riprova.');
        } else {
          Alert.alert('Impostazione non salvata', 'Controlla la connessione e riprova.');
        }
      } finally {
        guidedSaveLockRef.current = false;
        setGuidedSaving(false);
      }
    },
    [displayedGuidedAvailability, getGuidedSlotsUpdatedAtMs, updateAvailabilitySettingsPersisted],
  );

  const confirmOwnerWebAction = useCallback(
    (
      title: string,
      body: string,
      onConfirm: () => void | Promise<void>,
      onClose?: () => void,
    ) => {
      if (IS_WEB && typeof window !== "undefined") {
        const disabling = title.toLowerCase().includes("disattivare");
        showOwnerRequestAlert(title, body, [
          { text: "Annulla", style: "cancel", onPress: onClose },
          {
            text: disabling ? "Disattiva" : "Attiva",
            style: disabling ? "destructive" : "default",
            onPress: () => {
              void onConfirm();
              onClose?.();
            },
          },
        ], { onDismiss: onClose });
        return;
      }

      Alert.alert(
        title,
        body,
        [
          { text: "Annulla", style: "cancel", onPress: onClose },
          {
            text: title.toLowerCase().includes("disattivare")
              ? "Disattiva"
              : "Attiva",
            style: title.toLowerCase().includes("disattivare")
              ? "destructive"
              : "default",
            onPress: () => {
              void onConfirm();
              onClose?.();
            },
          },
        ],
        { onDismiss: onClose },
      );
    },
    [showOwnerRequestAlert],
  );

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const isCancelledBySalon = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const cancellationSource = String(item.cancellationSource ?? "")
        .trim()
        .toLowerCase();
      return (
        item.stato === "Annullata" &&
        (cancellationSource === "salone" || cancellationSource === "salon")
      );
    },
    [],
  );
  const isCancelledByCustomer = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const cancellationSource = String(item.cancellationSource ?? "")
        .trim()
        .toLowerCase();
      return (
        item.stato === "Annullata" &&
        (cancellationSource === "cliente" || cancellationSource === "customer")
      );
    },
    [],
  );
  const isUnworkedManualPendingRequest = useCallback(
    (item: (typeof richiestePrenotazione)[number]) =>
      isUnworkedManualBookingRequest({
        salonAutoAccept: displayedAutoAcceptBookingRequests,
        customers: clienti,
        request: item,
      }),
    [clienti, displayedAutoAcceptBookingRequests],
  );

  const canonicalFrontendRequests = useMemo<typeof richiestePrenotazione>(() => {
    const nextMap = new Map<string, (typeof richiestePrenotazione)[number]>();

    richiestePrenotazione.forEach((item) => {
      if (
        (item.origine ?? "frontend") !== "frontend" &&
        !isCancelledByCustomer(item) &&
        !isCancelledBySalon(item) &&
        !isResolvedOperatorChangeResponseEvent(item)
      ) {
        return;
      }

      const syncKey = buildPendingRequestSyncKey(item);
      if (!syncKey) {
        return;
      }

      const currentItem = nextMap.get(syncKey);
      if (
        !currentItem ||
        compareRequestDisplayPriority(currentItem, item) < 0
      ) {
        nextMap.set(syncKey, item);
      }
    });

    const groupedRequests = new Map<
      string,
      (typeof richiestePrenotazione)
    >();
    Array.from(nextMap.values()).forEach((item) => {
      const groupId = item.appointmentGroupId?.trim();
      const key = groupId ? `group:${groupId}` : `request:${item.id}`;
      const current = groupedRequests.get(key) ?? [];
      current.push(item);
      groupedRequests.set(key, current);
    });

    return Array.from(groupedRequests.values()).map((members) => {
      const ordered = [...members].sort(
        (left, right) =>
          (left.appointmentGroupOrder ?? 0) -
            (right.appointmentGroupOrder ?? 0) ||
          `${left.data} ${left.ora}`.localeCompare(`${right.data} ${right.ora}`),
      );
      const representative = ordered[0];
      return {
        ...representative,
        prezzo: ordered.reduce(
          (total, member) => total + Math.max(0, Number(member.prezzo) || 0),
          0,
        ),
        viewedBySalon: ordered.every((member) => member.viewedBySalon === true),
        appointmentGroupSize:
          representative.appointmentGroupSize ?? ordered.length,
      };
    });
  }, [isCancelledByCustomer, isCancelledBySalon, richiestePrenotazione]);

  const richiesteInAttesa = useMemo(
    () =>
      canonicalFrontendRequests.filter((item) => item.stato === "In attesa"),
    [canonicalFrontendRequests],
  );
  const richiesteAnnullateCliente = useMemo(
    () =>
      canonicalFrontendRequests.filter((item) => isCancelledByCustomer(item)),
    [canonicalFrontendRequests, isCancelledByCustomer],
  );
  const richiesteDaAccettare = useMemo(
    () =>
      richiesteInAttesa.filter(
        (item) =>
          item.stato === "In attesa" && item.operatorChangeStatus !== "pending",
      ),
    [richiesteInAttesa],
  );
  const richiesteInAttesaConfermaCliente = useMemo(
    () =>
      richiesteInAttesa.filter(
        (item) =>
          item.stato === "In attesa" && item.operatorChangeStatus === "pending",
      ),
    [richiesteInAttesa],
  );
  const richiesteGestite = useMemo(
    () =>
      canonicalFrontendRequests.filter((item) => item.stato === "Accettata"),
    [canonicalFrontendRequests],
  );
  const richiesteAccettate = useMemo(
    () => richiesteGestite.filter((item) => item.stato === "Accettata"),
    [richiesteGestite],
  );
  const richiesteCancellateORifiutateDalSalone = useMemo(
    () =>
      canonicalFrontendRequests.filter(
        (item) => item.stato === "Rifiutata" || isCancelledBySalon(item),
      ),
    [canonicalFrontendRequests, isCancelledBySalon],
  );
  const currentArchiveMonthKey = useMemo(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const getRequestArchiveMonthKey = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const parsedDate = parseIsoDate(item.data || getTodayDateString());
      return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
    },
    [],
  );
  const getRequestEventArchiveMonthKey = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const operatorChangeResolved =
        item.operatorChangeStatus === "accepted" ||
        item.operatorChangeStatus === "rejected" ||
        item.operatorChangeStatus === "expired";
      const eventTimestamp =
        operatorChangeResolved && item.operatorChangeRespondedAt
          ? item.operatorChangeRespondedAt
          : item.createdAt;
      const eventAtMs = Date.parse(String(eventTimestamp ?? "").trim());
      if (Number.isFinite(eventAtMs)) {
        const eventDate = new Date(eventAtMs);
        return `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}`;
      }

      return getRequestArchiveMonthKey(item);
    },
    [getRequestArchiveMonthKey],
  );
  const getStableRequestSection = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const usesEventMonth =
        isCancelledByCustomer(item) ||
        isCancelledBySalon(item) ||
        (!!item.operatorChangeRespondedAt &&
          (item.operatorChangeStatus === "accepted" ||
            item.operatorChangeStatus === "rejected" ||
            item.operatorChangeStatus === "expired"));
      const recent = usesEventMonth
        ? getRequestEventArchiveMonthKey(item) === currentArchiveMonthKey
        : getRequestArchiveMonthKey(item) === currentArchiveMonthKey;
      const unreadForSalon =
        item.viewedBySalon !== true &&
        !viewedRequestIds.includes(buildViewedRequestSignature(item));

      if (isUnworkedManualPendingRequest(item)) {
        return "pending";
      }

      if (!recent && !unreadForSalon) {
        return "archive";
      }

      if (isCancelledByCustomer(item)) {
        return "cancelled";
      }

      if (item.stato === "Rifiutata" || isCancelledBySalon(item)) {
        return "salonDeclined";
      }

      if (item.stato === "Accettata") {
        return "accepted";
      }

      if (item.stato === "In attesa") {
        return "pending";
      }

      return "archive";
    },
    [
      currentArchiveMonthKey,
      getRequestArchiveMonthKey,
      getRequestEventArchiveMonthKey,
      isCancelledByCustomer,
      isCancelledBySalon,
      isUnworkedManualPendingRequest,
      viewedRequestIds,
    ],
  );
  const stabilizeHistoryRequestSection = useCallback(
    (
      sectionKey: "accepted" | "salonDeclined" | "archive",
      currentItems: typeof richiestePrenotazione,
    ) => {
      const now = Date.now();
      const sectionMap =
        stableHistoryRequestSectionsRef.current[sectionKey] ??
        new Map<string, StableHistoryRequestEntry>();
      stableHistoryRequestSectionsRef.current[sectionKey] = sectionMap;

      const currentSignatures = new Set<string>();
      const liveSectionsBySyncKey = new Map<string, Set<string>>();

      richiestePrenotazione.forEach((item) => {
        const syncKey = buildPendingRequestSyncKey(item);
        if (!syncKey) {
          return;
        }

        const sections =
          liveSectionsBySyncKey.get(syncKey) ?? new Set<string>();
        sections.add(getStableRequestSection(item));
        liveSectionsBySyncKey.set(syncKey, sections);
      });

      currentItems.forEach((item) => {
        const signature = buildViewedRequestSignature(item);
        currentSignatures.add(signature);
        sectionMap.set(signature, { item, lastSeenAt: now });
      });

      sectionMap.forEach((entry, signature) => {
        if (currentSignatures.has(signature)) {
          return;
        }

        const syncKey = buildPendingRequestSyncKey(entry.item);
        const liveSections = syncKey
          ? liveSectionsBySyncKey.get(syncKey)
          : null;
        const movedToAnotherSection = liveSections
          ? !liveSections.has(sectionKey)
          : false;
        if (movedToAnotherSection) {
          sectionMap.delete(signature);
        }
      });

      return Array.from(sectionMap.values())
        .map((entry) => entry.item)
        .sort((left, right) => compareRequestDisplayPriority(left, right))
        .reverse();
    },
    [getStableRequestSection, richiestePrenotazione],
  );
  const classifyCancelledBackofficeRecord = useCallback(
    (
      item: (typeof richiestePrenotazione)[number],
    ): BackofficeRequestAnnulledSection => {
      const isRecent =
        getBackofficeRequestEventMonthKey(item) === currentArchiveMonthKey;
      const isCancelledByClient = isCancelledByCustomer(item);
      const isCancelledByOwner = isCancelledBySalon(item);
      const isRejectedByOwner = item.stato === "Rifiutata";
      const isUnreadAnnulledOrRejected =
        (isCancelledByClient || isCancelledByOwner || isRejectedByOwner) &&
        item.viewedBySalon !== true &&
        !viewedRequestIds.includes(buildViewedRequestSignature(item));

      if (!isCancelledByClient && !isCancelledByOwner && !isRejectedByOwner) {
        return "ignore";
      }

      if (!isRecent && !isUnreadAnnulledOrRejected) {
        return "archive";
      }

      if (isCancelledByClient) {
        return "cancelled_by_client_recent";
      }

      if (isCancelledByOwner || isRejectedByOwner) {
        return "cancelled_by_salon_recent";
      }

      return "ignore";
    },
    [
      currentArchiveMonthKey,
      isCancelledByCustomer,
      isCancelledBySalon,
      viewedRequestIds,
    ],
  );
  const backofficeAnnulledRequestSections = useMemo(() => {
    const canonicalByDuplicateKey = new Map<
      string,
      BackofficeAnnulledDebugEntry
    >();
    const entriesByDuplicateKey = new Map<
      string,
      BackofficeAnnulledDebugEntry[]
    >();
    const debugCandidates: BackofficeAnnulledDebugEntry[] = [];
    const cleanClientCancelledSuppressionKeys = new Set<string>();
    const suppressedRescheduleResidueDuplicateKeys = new Set<string>();

    richiestePrenotazione.forEach((item) => {
      if (
        classifyCancelledBackofficeRecord(item) !== "cancelled_by_client_recent"
      ) {
        return;
      }
      if (
        isBackofficeSalonRescheduleRelatedRecord(
          item as Record<string, unknown>,
        )
      ) {
        return;
      }

      cleanClientCancelledSuppressionKeys.add(
        buildBackofficeClientCancelledRescheduleSuppressionKey(item),
      );
    });

    richiestePrenotazione.forEach((item) => {
      const section = classifyCancelledBackofficeRecord(item);
      if (section === "ignore") {
        return;
      }

      const key = buildBackofficeRequestRecordKey(item);
      const duplicateKey = buildBackofficeAnnulledDuplicateKey(item);
      const isUnreadClientCancellationCarriedFromArchiveMonth =
        section === "cancelled_by_client_recent" &&
        getBackofficeRequestEventMonthKey(item) !== currentArchiveMonthKey &&
        item.viewedBySalon !== true &&
        !viewedRequestIds.includes(buildViewedRequestSignature(item));
      const isSuppressedRescheduleResidue =
        section === "cancelled_by_client_recent" &&
        isBackofficeSalonRescheduleRelatedRecord(
          item as Record<string, unknown>,
        ) &&
        cleanClientCancelledSuppressionKeys.has(
          buildBackofficeClientCancelledRescheduleSuppressionKey(item),
        );
      const reasonIncluded = isSuppressedRescheduleResidue
        ? ""
        : isUnreadClientCancellationCarriedFromArchiveMonth
          ? "unread_client_cancellation_kept_recent_until_read"
          : section === "cancelled_by_client_recent"
            ? "recent_event_month_and_cancelled_by_client"
            : section === "cancelled_by_salon_recent"
              ? item.stato === "Rifiutata"
                ? "recent_event_month_and_rejected_by_salon"
                : "recent_event_month_and_cancelled_by_salon"
              : section === "archive"
                ? "event_month_not_current"
                : "";
      const reasonExcluded = isSuppressedRescheduleResidue
        ? "suppressed_reschedule_residue_by_clean_client_cancellation"
        : section === "archive"
          ? "excluded_from_recent_sections_archived"
          : "";
      const debugEntry = {
        item,
        section,
        key,
        duplicateKey,
        dedupeApplied: false,
        reasonIncluded,
        reasonExcluded,
        source: "merged" as const,
        dedupeGroupSize: 1,
        suppressedDuplicateCount: 0,
        sourceIds: buildBackofficeAnnulledSourceIds(item),
        stableCarriedFromPreviousFrame: false,
      };
      debugCandidates.push(debugEntry);
      if (isSuppressedRescheduleResidue) {
        debugEntry.dedupeApplied = true;
        suppressedRescheduleResidueDuplicateKeys.add(duplicateKey);
        return;
      }
      entriesByDuplicateKey.set(duplicateKey, [
        ...(entriesByDuplicateKey.get(duplicateKey) ?? []),
        debugEntry,
      ]);

      const current = canonicalByDuplicateKey.get(duplicateKey);
      if (
        !current ||
        compareBackofficeRequestRecordAuthority(current.item, item) < 0
      ) {
        if (current) {
          debugEntry.dedupeApplied = true;
          current.dedupeApplied = true;
        }
        canonicalByDuplicateKey.set(duplicateKey, {
          ...debugEntry,
          item: current
            ? mergeBackofficeAnnulledCanonicalItems(current.item, item)
            : item,
        });
      } else {
        current.dedupeApplied = true;
        debugEntry.dedupeApplied = true;
        current.item = mergeBackofficeAnnulledCanonicalItems(
          current.item,
          item,
        );
      }
    });

    entriesByDuplicateKey.forEach((entries) => {
      const sourceIds = Array.from(
        new Set(entries.flatMap((entry) => entry.sourceIds)),
      );
      entries.forEach((entry) => {
        entry.dedupeGroupSize = entries.length;
        entry.suppressedDuplicateCount = Math.max(0, entries.length - 1);
        entry.sourceIds = sourceIds;
      });
      const canonicalEntry = canonicalByDuplicateKey.get(
        entries[0]?.duplicateKey ?? "",
      );
      if (canonicalEntry) {
        canonicalEntry.dedupeGroupSize = entries.length;
        canonicalEntry.suppressedDuplicateCount = Math.max(
          0,
          entries.length - 1,
        );
        canonicalEntry.sourceIds = sourceIds;
      }
    });

    const stableEntries = stableClientCancelledEntriesRef.current;
    suppressedRescheduleResidueDuplicateKeys.forEach((duplicateKey) => {
      stableEntries.delete(duplicateKey);
    });
    const sortedEntries = Array.from(canonicalByDuplicateKey.values())
      .sort((left, right) =>
        compareRequestDisplayPriority(left.item, right.item),
      )
      .reverse();
    const currentRecentAnnulledEntries = sortedEntries.filter(
      (entry) =>
        entry.section === "cancelled_by_client_recent" ||
        entry.section === "cancelled_by_salon_recent",
    );
    const currentRecentAnnulledKeys = new Set(
      currentRecentAnnulledEntries.map((entry) => entry.duplicateKey),
    );
    currentRecentAnnulledEntries.forEach((entry) => {
      stableEntries.set(entry.duplicateKey, {
        entry: {
          ...entry,
          stableCarriedFromPreviousFrame: false,
        },
      });
    });

    const carriedEntries: BackofficeAnnulledDebugEntry[] = [];
    stableEntries.forEach((stableEntry, duplicateKey) => {
      if (currentRecentAnnulledKeys.has(duplicateKey)) {
        return;
      }

      const currentCanonicalEntry = canonicalByDuplicateKey.get(duplicateKey);
      if (
        currentCanonicalEntry &&
        currentCanonicalEntry.section !== "cancelled_by_client_recent" &&
        currentCanonicalEntry.section !== "cancelled_by_salon_recent"
      ) {
        stableEntries.delete(duplicateKey);
        return;
      }

      const currentStableSection = classifyCancelledBackofficeRecord(
        stableEntry.entry.item,
      );
      const stillRecentAnnulledRequest =
        currentStableSection === "cancelled_by_client_recent" ||
        currentStableSection === "cancelled_by_salon_recent";
      if (!stillRecentAnnulledRequest) {
        stableEntries.delete(duplicateKey);
        return;
      }

      carriedEntries.push({
        ...stableEntry.entry,
        stableCarriedFromPreviousFrame: true,
      });
    });

    const stableSortedEntries =
      carriedEntries.length > 0
        ? [...sortedEntries, ...carriedEntries]
            .sort((left, right) =>
              compareRequestDisplayPriority(left.item, right.item),
            )
            .reverse()
        : sortedEntries;

    return {
      cancelledByClientRecent: stableSortedEntries
        .filter((entry) => entry.section === "cancelled_by_client_recent")
        .map((entry) => entry.item),
      cancelledBySalonRecent: stableSortedEntries
        .filter((entry) => entry.section === "cancelled_by_salon_recent")
        .map((entry) => entry.item),
      archived: stableSortedEntries
        .filter((entry) => entry.section === "archive")
        .map((entry) => entry.item),
      debugCandidates,
      includedEntries: stableSortedEntries,
    };
  }, [classifyCancelledBackofficeRecord, richiestePrenotazione]);
  const richiesteInAttesaRecenti = useMemo(
    () =>
      richiesteInAttesa.filter(
        (item) =>
          item.operatorChangeStatus !== "pending" &&
          getStableRequestSection(item) === "pending",
      ),
    [getStableRequestSection, richiesteInAttesa],
  );
  const richiesteAccettateRecenti = useMemo(
    () =>
      stabilizeHistoryRequestSection(
        "accepted",
        richiesteAccettate.filter(
          (item) => getStableRequestSection(item) === "accepted",
        ),
      ),
    [
      getStableRequestSection,
      richiesteAccettate,
      stabilizeHistoryRequestSection,
    ],
  );
  const cancelledClientVisibleItems = useMemo(
    () => backofficeAnnulledRequestSections.cancelledByClientRecent,
    [backofficeAnnulledRequestSections.cancelledByClientRecent],
  );
  const richiesteAnnullateClienteRecenti = useMemo<
    typeof richiestePrenotazione
  >(() => {
    const logicalItems = new Map<
      string,
      (typeof richiestePrenotazione)
    >();

    cancelledClientVisibleItems.forEach((item) => {
      const groupId = item.appointmentGroupId?.trim();
      const requestId = String(item.id ?? "").trim();
      const logicalKey = groupId
        ? `group:${groupId}`
        : requestId
          ? `request:${requestId}`
          : buildBackofficeAnnulledDuplicateKey(item);
      logicalItems.set(logicalKey, [
        ...(logicalItems.get(logicalKey) ?? []),
        item,
      ]);
    });

    return Array.from(logicalItems.values()).map((members) => {
      const ordered = [...members].sort(
        (left, right) =>
          (left.appointmentGroupOrder ?? 0) -
            (right.appointmentGroupOrder ?? 0) ||
          `${left.data} ${left.ora}`.localeCompare(`${right.data} ${right.ora}`),
      );
      const representative = ordered[0];
      return {
        ...representative,
        viewedBySalon: ordered.every((member) => member.viewedBySalon === true),
        appointmentGroupSize:
          representative.appointmentGroupSize ?? ordered.length,
      };
    });
  }, [cancelledClientVisibleItems]);
  const richiesteCancellateORifiutateDalSaloneRecenti = useMemo(
    () =>
      stabilizeHistoryRequestSection(
        "salonDeclined",
        backofficeAnnulledRequestSections.cancelledBySalonRecent,
      ),
    [
      backofficeAnnulledRequestSections.cancelledBySalonRecent,
      stabilizeHistoryRequestSection,
    ],
  );
  const richiesteArchivioStorico = useMemo(() => {
    const archivedAnnulledKeys = new Set(
      backofficeAnnulledRequestSections.archived.map((item) =>
        buildBackofficeAnnulledDuplicateKey(item),
      ),
    );
    const nonAnnulledArchiveItems = canonicalFrontendRequests.filter((item) => {
      if (classifyCancelledBackofficeRecord(item) !== "ignore") {
        return false;
      }

      return getStableRequestSection(item) === "archive";
    });

    return stabilizeHistoryRequestSection("archive", [
      ...nonAnnulledArchiveItems,
      ...backofficeAnnulledRequestSections.archived.filter((item) => {
        const duplicateKey = buildBackofficeAnnulledDuplicateKey(item);
        if (!archivedAnnulledKeys.has(duplicateKey)) {
          return false;
        }
        archivedAnnulledKeys.delete(duplicateKey);
        return true;
      }),
    ]);
  }, [
    backofficeAnnulledRequestSections.archived,
    canonicalFrontendRequests,
    classifyCancelledBackofficeRecord,
    getStableRequestSection,
    stabilizeHistoryRequestSection,
  ]);
  const richiesteArchivioPerMese = useMemo<RequestArchiveMonthGroup[]>(() => {
    const monthFormatter = new Intl.DateTimeFormat("it-IT", {
      month: "long",
      year: "numeric",
    });
    const groups = new Map<string, RequestArchiveMonthGroup>();

    richiesteArchivioStorico.forEach((item) => {
      const parsedDate = parseIsoDate(item.data || getTodayDateString());
      const monthDate = new Date(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        1,
      );
      const key = getRequestArchiveMonthKey(item);
      const current = groups.get(key);

      if (current) {
        current.items.push(item);
        return;
      }

      groups.set(key, {
        key,
        label: monthFormatter.format(monthDate),
        items: [item],
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          const leftKey = `${left.data ?? ""} ${left.ora ?? ""}`;
          const rightKey = `${right.data ?? ""} ${right.ora ?? ""}`;
          return rightKey.localeCompare(leftKey);
        }),
      }))
      .sort((first, second) => second.key.localeCompare(first.key));
  }, [getRequestArchiveMonthKey, richiesteArchivioStorico]);
  const richiesteArchivioPerAnno = useMemo(() => {
    const years = new Map<string, RequestArchiveMonthGroup[]>();

    richiesteArchivioPerMese.forEach((monthGroup) => {
      const year = monthGroup.key.split("-")[0] ?? "";
      const current = years.get(year) ?? [];
      current.push(monthGroup);
      years.set(year, current);
    });

    return Array.from(years.entries())
      .map(([year, months]) => ({
        year,
        months: months.sort((first, second) =>
          second.key.localeCompare(first.key),
        ),
        count: months.reduce((total, month) => total + month.items.length, 0),
      }))
      .sort((first, second) => second.year.localeCompare(first.year));
  }, [richiesteArchivioPerMese]);
  const archiveSearchTextById = useMemo(() => {
    const groups = new Map<string, string[]>();
    richiestePrenotazione.forEach((item) => {
      if (!item.appointmentGroupId?.trim()) return;
      const key = `${item.appointmentGroupId.trim()}:${item.stato}`;
      const values = groups.get(key) ?? [];
      values.push(buildArchiveSearchText(item));
      groups.set(key, values);
    });
    return new Map(richiesteArchivioStorico.map((item) => [
      item.id,
      item.appointmentGroupId?.trim()
        ? [buildArchiveSearchText(item), ...(groups.get(`${item.appointmentGroupId.trim()}:${item.stato}`) ?? [])].join(' ')
        : buildArchiveSearchText(item),
    ]));
  }, [richiesteArchivioStorico, richiestePrenotazione]);
  const getArchiveSearchText = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => archiveSearchTextById.get(item.id) ?? buildArchiveSearchText(item),
    [archiveSearchTextById],
  );
  const hasImmediateRequestStats =
    richiesteDaAccettare.length > 0 ||
    richiesteGestite.length > 0 ||
    richiesteCancellateORifiutateDalSalone.length > 0 ||
    richiesteAnnullateCliente.length > 0;
  const shouldHoldRequestStats =
    ownerStartupLoading ||
    ((ownerInitialDataHydrating || !ownerServerSyncReady) &&
      !hasImmediateRequestStats);

  const buildGroupedRequests = useCallback(
    (items: typeof richiestePrenotazione): RequestGroup[] => {
      const byDate = new Map<string, typeof richiestePrenotazione>();

      items.forEach((item) => {
        const key = formatRequestDateKey(item.data);
        const current = byDate.get(key) ?? [];
        current.push(item);
        byDate.set(key, current);
      });

      return Array.from(byDate.entries())
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([date, groupedItems]) => ({
          date,
          items: groupedItems.sort((left, right) =>
            right.ora.localeCompare(left.ora),
          ),
        }));
    },
    [],
  );

  const groupedPending = useMemo(
    () => buildGroupedRequests(richiesteInAttesa),
    [buildGroupedRequests, richiesteInAttesa],
  );
  const groupedPendingRecent = useMemo(
    () => buildGroupedRequests(richiesteInAttesaRecenti),
    [buildGroupedRequests, richiesteInAttesaRecenti],
  );
  const groupedCancelledRecent = useMemo(
    () => buildGroupedRequests(richiesteAnnullateClienteRecenti),
    [buildGroupedRequests, richiesteAnnullateClienteRecenti],
  );
  const groupedAcceptedRecent = useMemo(
    () => buildGroupedRequests(richiesteAccettateRecenti),
    [buildGroupedRequests, richiesteAccettateRecenti],
  );
  const groupedSalonDeclined = useMemo(
    () => buildGroupedRequests(richiesteCancellateORifiutateDalSalone),
    [buildGroupedRequests, richiesteCancellateORifiutateDalSalone],
  );
  const groupedSalonDeclinedRecent = useMemo(
    () => buildGroupedRequests(richiesteCancellateORifiutateDalSaloneRecenti),
    [buildGroupedRequests, richiesteCancellateORifiutateDalSaloneRecenti],
  );
  useEffect(() => {
    setExpandedArchiveMonths((current) => {
      const next: Record<string, boolean> = {};
      richiesteArchivioPerMese.forEach((group) => {
        next[group.key] = current[group.key] ?? false;
      });
      return next;
    });
  }, [richiesteArchivioPerMese]);
  const nextAutoAcceptRemainingSeconds = useMemo(() => {
    const autoAcceptableRequests = richiesteDaAccettare.filter(
      (item) => !item.appointmentGroupId?.trim(),
    );
    if (
      !displayedAutoAcceptBookingRequests ||
      autoAcceptableRequests.length === 0
    ) {
      return null;
    }

    return autoAcceptableRequests.reduce<number | null>(
      (minRemaining, item) => {
        const nextRemaining = getAutoAcceptRemainingSeconds(
          item,
          autoAcceptNowMs,
        );
        return minRemaining === null
          ? nextRemaining
          : Math.min(minRemaining, nextRemaining);
      },
      null,
    );
  }, [
    autoAcceptNowMs,
    displayedAutoAcceptBookingRequests,
    richiesteDaAccettare,
  ]);

  const persistViewedRequestIds = useCallback(
    async (requestSignatures: string[], backendRequestIds: string[]) => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail || requestSignatures.length === 0) return;

      const storageKey = `salon_manager_viewed_request_ids_v2__${normalizedEmail}`;
      const persistLocalViewedState = async () => {
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          const parsed = raw ? (JSON.parse(raw) as unknown) : [];
          const currentIds = Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
          const merged = Array.from(
            new Set([...currentIds, ...requestSignatures]),
          );
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
          setViewedRequestIds(merged);
        } catch {
          // Non bloccare UX notifiche in caso di errore storage locale.
        }
      };

      if (Platform.OS !== "web") {
        await persistLocalViewedState();
      }

      if (!salonWorkspace.id || backendRequestIds.length === 0) {
        return;
      }

      try {
        const { error } = await supabase
          .from("booking_requests")
          .update({ viewed_by_salon: true })
          .eq("workspace_id", salonWorkspace.id)
          .in("id", backendRequestIds);

        if (error) {
          throw error;
        }

        setRichiestePrenotazione((current) =>
          current.map((item) =>
            backendRequestIds.includes(item.id)
              ? { ...item, viewedBySalon: true }
              : item,
          ),
        );

        if (Platform.OS === "web") {
          await persistLocalViewedState();
          emitOwnerViewedNotificationChange({
            ownerEmail: salonAccountEmail,
            requestSignatures,
          });
          void refreshBadges();
        }
      } catch (error) {
        console.log("Errore sync viewed_by_salon richieste:", error);
      }
    },
    [
      refreshBadges,
      salonAccountEmail,
      salonWorkspace.id,
      setRichiestePrenotazione,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    const loadViewedRequestIds = async () => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
        }
        return;
      }

      const storageKey = `salon_manager_viewed_request_ids_v2__${normalizedEmail}`;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : [];

        if (!cancelled) {
          setViewedRequestIds(nextIds);
          setHasLoadedViewedRequestIds(true);
        }
      } catch {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
        }
      }
    };

    void loadViewedRequestIds();

    return () => {
      cancelled = true;
    };
  }, [salonAccountEmail]);

  const legacyViewedReadOwnerScope = `${salonWorkspace.id ?? ""}:${salonAccountEmail.trim().toLowerCase()}:${isAuthenticated && workspaceAccessAllowed}`;
  const legacyViewedReadOwnerScopeRef = useRef(legacyViewedReadOwnerScope);
  legacyViewedReadOwnerScopeRef.current = legacyViewedReadOwnerScope;

  useEffect(() => {
    if (!isAuthenticated || !workspaceAccessAllowed || !hasLoadedViewedRequestIds || viewedRequestIds.length === 0) {
      viewedRequestBackendSyncRef.current = "";
      return;
    }

    const matchingRequestIds = richiestePrenotazione
      .filter(
        (item) =>
          item.stato !== "In attesa" &&
          item.operatorChangeStatus !== "pending" &&
          item.viewedBySalon !== true &&
          viewedRequestIds.includes(buildViewedRequestSignature(item)),
      )
      .map((item) => item.id)
      .filter(Boolean);

    if (matchingRequestIds.length === 0) {
      viewedRequestBackendSyncRef.current = "";
      return;
    }

    const syncSignature = buildViewedRequestSyncSignature(
      matchingRequestIds,
      viewedRequestIds,
    );
    if (viewedRequestBackendSyncRef.current === syncSignature) {
      return;
    }
    viewedRequestBackendSyncRef.current = syncSignature;

    const backendRequestIds = Array.from(
      new Set(matchingRequestIds.filter((id) => isUuidLike(id))),
    );

    if (!salonWorkspace.id || backendRequestIds.length === 0) {
      return;
    }

    void (async () => {
      try {
        const statusByLabel = { Accettata: "accepted", Annullata: "cancelled", Rifiutata: "rejected" } as const;
        const readGroups = new Map<string, (typeof richiestePrenotazione)[number][]>();
        const backendRequestIdSet = new Set(backendRequestIds);
        richiestePrenotazione.forEach((item) => {
          if (!backendRequestIdSet.has(item.id) || item.stato === "In attesa") return;
          const key = JSON.stringify([
            item.stato, item.cancellationSource ?? null,
            item.operatorChangeStatus ?? null, item.operatorChangeRespondedAt ?? null,
          ]);
          readGroups.set(key, [...(readGroups.get(key) ?? []), item]);
        });
        const acknowledgedSignatures = new Map<string, string>();
        for (const items of readGroups.values()) {
          if (legacyViewedReadOwnerScopeRef.current !== legacyViewedReadOwnerScope) return;
          const expected = items[0];
          if (expected.stato === "In attesa") continue;
          let query = supabase.from("booking_requests")
            .update({ viewed_by_salon: true })
            .eq("workspace_id", salonWorkspace.id)
            .eq("status", statusByLabel[expected.stato])
            .in("id", items.map((item) => item.id));
          // A new cancellation or operator response must retain its unread state.
          for (const [column, value] of [
            ["cancellation_source", expected.cancellationSource],
            ["operator_change_status", expected.operatorChangeStatus],
            ["operator_change_responded_at", expected.operatorChangeRespondedAt],
          ] as const) {
            query = value == null ? query.is(column, null) : query.eq(column, value);
          }
          const { data, error } = await query.select("id");
          if (error) throw error;
          const acknowledgedIds = new Set((data ?? []).map((item) => item.id));
          items.forEach((item) => {
            if (acknowledgedIds.has(item.id)) acknowledgedSignatures.set(item.id, buildViewedRequestSignature(item));
          });
        }
        if (legacyViewedReadOwnerScopeRef.current !== legacyViewedReadOwnerScope) return;
        setRichiestePrenotazione((current) => current.map((item) =>
          acknowledgedSignatures.get(item.id) === buildViewedRequestSignature(item)
            ? { ...item, viewedBySalon: true }
            : item,
        ));
        void refreshBadges();
      } catch (error) {
        if (viewedRequestBackendSyncRef.current === syncSignature) viewedRequestBackendSyncRef.current = "";
        console.log("Errore riallineamento viewed_by_salon richieste:", error);
      }
    })();
  }, [
    hasLoadedViewedRequestIds,
    isAuthenticated,
    isUnworkedManualPendingRequest,
    legacyViewedReadOwnerScope,
    refreshBadges,
    richiestePrenotazione,
    salonWorkspace.id,
    setRichiestePrenotazione,
    viewedRequestIds,
    workspaceAccessAllowed,
  ]);

  const isFrontendRequest = useCallback(
    (item: (typeof richiestePrenotazione)[number]) =>
      (item.origine ?? "frontend") === "frontend",
    [],
  );

  const isUnreadRequest = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      if (isUnsubmittedBookingPaymentHold(item)) return false;
      return (
        isUnworkedManualPendingRequest(item) ||
        ((isFrontendRequest(item) || isCancelledByCustomer(item) ||
          isResolvedOperatorChangeResponseEvent(item)) &&
          item.operatorChangeStatus !== "pending" &&
          item.viewedBySalon !== true &&
          (item.stato === "Accettata" || !viewedRequestIds.includes(buildViewedRequestSignature(item))))
      );
    },
    [
      isCancelledByCustomer,
      isFrontendRequest,
      isUnworkedManualPendingRequest,
      viewedRequestIds,
    ],
  );
  const isReadOnlyHistorySection = useCallback(
    (sectionKey: string) =>
      sectionKey === "customerConfirmation" ||
      sectionKey === "salonDeclined" ||
      sectionKey === "archive",
    [],
  );
  const cancelledClientUnreadItems = useMemo(
    () => cancelledClientVisibleItems.filter(isUnreadRequest),
    [cancelledClientVisibleItems, isUnreadRequest],
  );
  const refreshRemoteCancelledClientUnreadCount = useCallback(async () => {
    const workspaceId = salonWorkspace.id?.trim();
    if (!workspaceId || !isUuidLike(workspaceId)) {
      setRemoteCancelledClientUnreadCount(0);
      return;
    }

    const { data: unreadRows, error } = await supabase
      .from("booking_requests")
      .select("id,appointment_group_id")
      .eq("workspace_id", workspaceId)
      .eq("viewed_by_salon", false)
      .eq("status", "cancelled")
      .in("cancellation_source", ["cliente", "customer"]);

    if (error) {
      console.log("Errore conteggio unread annullate cliente:", error);
      return;
    }

    const logicalUnreadKeys = new Set(
      (unreadRows ?? [])
        .map((item) => {
          const groupId = String(item.appointment_group_id ?? "").trim();
          const requestId = String(item.id ?? "").trim();
          return groupId
            ? `group:${groupId}`
            : requestId
              ? `request:${requestId}`
              : "";
        })
        .filter(Boolean),
    );
    setRemoteCancelledClientUnreadCount(logicalUnreadKeys.size);
  }, [salonWorkspace.id]);

  useEffect(() => {
    void refreshRemoteCancelledClientUnreadCount();
  }, [refreshRemoteCancelledClientUnreadCount, richiestePrenotazione]);

  const acceptedReadOwnerScope = `${salonWorkspace.id ?? ""}:${salonAccountEmail.trim().toLowerCase()}:${isAuthenticated && workspaceAccessAllowed}`;
  const acceptedReadOwnerScopeRef = useRef(acceptedReadOwnerScope);
  acceptedReadOwnerScopeRef.current = acceptedReadOwnerScope;

  const persistAcceptedRequestsAsViewed = useCallback(
    async (items: (typeof richiestePrenotazione)[number][]) => {
      if (!isAuthenticated || !workspaceAccessAllowed) return;
      const ownerScope = acceptedReadOwnerScope;
      try {
        const acknowledged = await markOwnerAcceptedBookingRequestsRead({
          workspaceId: salonWorkspace.id,
          requestIds: items.map((item) => item.id),
          includeOperatorChangeResponses: true,
        });
        if (acceptedReadOwnerScopeRef.current !== ownerScope || acknowledged.requestIds.length === 0) {
          return;
        }

        const acknowledgedIds = new Set(acknowledged.requestIds);
        const acknowledgedSignatures = new Set(acknowledged.requestSignatures);
        setRichiestePrenotazione((current) => current.map((item) =>
          acknowledgedIds.has(item.id) && item.stato === "Accettata" && item.operatorChangeStatus !== "pending" &&
          acknowledgedSignatures.has(buildViewedRequestSignature(item))
            ? { ...item, viewedBySalon: true }
            : item,
        ));
        setViewedRequestIds((current) => Array.from(new Set([
          ...current, ...acknowledged.requestSignatures,
        ])));
        emitOwnerViewedNotificationChange({
          ownerEmail: salonAccountEmail,
          requestSignatures: acknowledged.requestSignatures,
        });
        void refreshBadges();
      } catch (error) {
        console.log("Errore lettura conferme prenotazioni:", error);
      }
    },
    [acceptedReadOwnerScope, isAuthenticated, refreshBadges, salonAccountEmail, salonWorkspace.id, setRichiestePrenotazione, workspaceAccessAllowed],
  );

  const markRequestsAsViewed = useCallback(
    (items: (typeof richiestePrenotazione)[number][]) => {
      const requestedGroupIds = new Set(
        items
          .map((item) => item.appointmentGroupId?.trim() ?? "")
          .filter(Boolean),
      );
      const requestedIds = new Set(
        items.map((item) => String(item.id ?? "").trim()).filter(Boolean),
      );
      const matchingItems = richiestePrenotazione.filter(
        (item) =>
          Boolean(item?.id) &&
          !isUnsubmittedBookingPaymentHold(item) &&
          !isUnworkedManualPendingRequest(item) &&
          (requestedIds.has(String(item.id ?? "").trim()) ||
            (!!item.appointmentGroupId?.trim() &&
              requestedGroupIds.has(item.appointmentGroupId.trim()))),
      );
      const acceptedItems = matchingItems.filter((item) =>
        item.stato === "Accettata" && isUnreadRequest(item),
      );
      if (acceptedItems.length > 0) {
        void persistAcceptedRequestsAsViewed(acceptedItems);
      }
      const nextItems = matchingItems.filter((item) => item.stato !== "Accettata");
      if (nextItems.length === 0) return;

      const nextSignatures = Array.from(
        new Set(nextItems.map((item) => buildViewedRequestSignature(item))),
      );
      const backendRequestIds = Array.from(
        new Set(
          nextItems.map((item) => item.id).filter((id) => isUuidLike(id)),
        ),
      );

      if (Platform.OS !== "web") {
        setViewedRequestIds((current) =>
          Array.from(new Set([...current, ...nextSignatures])),
        );
        emitOwnerViewedNotificationChange({
          ownerEmail: salonAccountEmail,
          requestSignatures: nextSignatures,
        });
        void refreshBadges();
      }
      void persistViewedRequestIds(nextSignatures, backendRequestIds);
    },
    [
      persistViewedRequestIds,
      persistAcceptedRequestsAsViewed,
      isUnworkedManualPendingRequest,
      isUnreadRequest,
      refreshBadges,
      richiestePrenotazione,
      salonAccountEmail,
    ],
  );

  const markCancelledRequestsAsViewed = useCallback(() => {
    const markedCancelledItems = cancelledClientUnreadItems;
    const remoteCancelledUnreadFloor = Math.max(
      0,
      Math.trunc(remoteCancelledClientUnreadCount),
    );
    const visualFallbackItems =
      markedCancelledItems.length === 0 && remoteCancelledUnreadFloor > 0
        ? sortRequestsNewestFirst(richiesteAnnullateClienteRecenti).slice(
            0,
            remoteCancelledUnreadFloor,
          )
        : [];
    const itemsToMark =
      markedCancelledItems.length > 0
        ? markedCancelledItems
        : visualFallbackItems;

    lastClientCancelledMarkAsReadSignaturesRef.current = new Set(
      itemsToMark.map((item) => buildViewedRequestSignature(item)),
    );
    markRequestsAsViewed(itemsToMark);

    if (remoteCancelledUnreadFloor > 0) {
      void (async () => {
        const workspaceId = salonWorkspace.id?.trim();
        if (!workspaceId || !isUuidLike(workspaceId)) {
          return;
        }

        const { error } = await supabase
          .from("booking_requests")
          .update({ viewed_by_salon: true })
          .eq("workspace_id", workspaceId)
          .eq("viewed_by_salon", false)
          .eq("status", "cancelled")
          .in("cancellation_source", ["cliente", "customer"]);

        if (error) {
          console.log("Errore mark read annullate cliente:", error);
          return;
        }

        setRemoteCancelledClientUnreadCount(0);
        void refreshBadges();
      })();
    }
  }, [
    cancelledClientUnreadItems,
    markRequestsAsViewed,
    refreshBadges,
    remoteCancelledClientUnreadCount,
    richiesteAnnullateClienteRecenti,
    salonWorkspace.id,
  ]);
  const markCancelledRequestsAsViewedRef = useRef(
    markCancelledRequestsAsViewed,
  );

  useEffect(() => {
    markCancelledRequestsAsViewedRef.current = markCancelledRequestsAsViewed;
  }, [markCancelledRequestsAsViewed]);

  const markAcceptedRequestsAsViewed = useCallback(() => {
    const markedAcceptedItems = richiestePrenotazione.filter(
      (item) => isUnreadRequest(item) && item.stato === "Accettata",
    );

    markRequestsAsViewed(markedAcceptedItems);
  }, [isUnreadRequest, markRequestsAsViewed, richiestePrenotazione]);

  const markSalonDeclinedRequestsAsViewed = useCallback(() => {
    const markedDeclinedItems =
      richiesteCancellateORifiutateDalSaloneRecenti.filter(isUnreadRequest);

    markRequestsAsViewed(markedDeclinedItems);
  }, [
    isUnreadRequest,
    markRequestsAsViewed,
    richiesteCancellateORifiutateDalSaloneRecenti,
  ]);
  const markArchivedRequestsAsViewed = useCallback(() => {
    const markedArchiveItems = richiesteArchivioStorico.filter(isUnreadRequest);

    markRequestsAsViewed(markedArchiveItems);
  }, [isUnreadRequest, markRequestsAsViewed, richiesteArchivioStorico]);

  const getRequestSectionItems = useCallback(
    (sectionKey: string): typeof richiestePrenotazione => {
      switch (sectionKey) {
        case "pending":
          return richiesteInAttesaRecenti;
        case "customerConfirmation":
          return richiesteInAttesaConfermaCliente;
        case "accepted":
          return richiesteAccettateRecenti;
        case "cancelled":
          return richiesteAnnullateClienteRecenti;
        case "salonDeclined":
          return richiesteCancellateORifiutateDalSaloneRecenti;
        case "archive":
          return richiesteArchivioStorico;
        default:
          return [];
      }
    },
    [
      richiesteAccettateRecenti,
      richiesteAnnullateClienteRecenti,
      richiesteArchivioStorico,
      richiesteCancellateORifiutateDalSaloneRecenti,
      richiesteInAttesaConfermaCliente,
      richiesteInAttesaRecenti,
    ],
  );

  const getRequestSectionVisualUnreadSignatures = useCallback(
    (sectionKey: string) => {
      if (isReadOnlyHistorySection(sectionKey)) {
        return new Set<string>();
      }

      const sectionItems = getRequestSectionItems(sectionKey);
      const visualUnreadSignatures = new Set(
        sectionItems
          .filter((item) => isUnreadRequest(item))
          .map((item) => buildViewedRequestSignature(item)),
      );

      if (sectionKey !== "cancelled") {
        return visualUnreadSignatures;
      }

      const remoteCancelledUnreadFloor = Math.max(
        0,
        Math.trunc(remoteCancelledClientUnreadCount),
      );
      const missingVisualUnreadCount = Math.max(
        0,
        remoteCancelledUnreadFloor - visualUnreadSignatures.size,
      );

      if (missingVisualUnreadCount <= 0) {
        return visualUnreadSignatures;
      }

      sortRequestsNewestFirst(sectionItems)
        .filter(
          (item) =>
            !visualUnreadSignatures.has(buildViewedRequestSignature(item)),
        )
        .slice(0, missingVisualUnreadCount)
        .forEach((item) => {
          visualUnreadSignatures.add(buildViewedRequestSignature(item));
        });

      return visualUnreadSignatures;
    },
    [
      getRequestSectionItems,
      isUnreadRequest,
      isReadOnlyHistorySection,
      remoteCancelledClientUnreadCount,
    ],
  );

  const isMeasuredRequestCardVisibleEnough = useCallback(
    (y: number, measuredHeight: number) => {
      if (measuredHeight <= 0) {
        return false;
      }

      const topGuard = 72;
      const bottomGuard = 120;
      const viewportBottom = Math.max(0, height - bottomGuard);
      const visibleTop = Math.max(y, topGuard);
      const visibleBottom = Math.min(y + measuredHeight, viewportBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      return visibleHeight / measuredHeight >= 0.6;
    },
    [height],
  );

  const commitPendingRequestSectionViewed = useCallback(
    (sectionKey: string) => {
      if (sectionKey === "pending") {
        return;
      }

      const visualUnreadSignatures =
        getRequestSectionVisualUnreadSignatures(sectionKey);
      const itemsToCommit = getRequestSectionItems(sectionKey).filter(
        (item) => {
          const visibilityKey = buildViewedRequestSignature(item);
          return (
            visualUnreadSignatures.has(visibilityKey) &&
            pendingVisibleRequestIdsRef.current.has(visibilityKey)
          );
        },
      );

      if (itemsToCommit.length > 0) {
        if (sectionKey === "cancelled") {
          markCancelledRequestsAsViewedRef.current();
        } else {
          markRequestsAsViewed(itemsToCommit);
        }

        itemsToCommit.forEach((item) => {
          pendingVisibleRequestIdsRef.current.delete(
            buildViewedRequestSignature(item),
          );
          seenVisibleRequestIdsRef.current.delete(
            buildViewedRequestSignature(item),
          );
        });
      }
    },
    [
      getRequestSectionItems,
      getRequestSectionVisualUnreadSignatures,
      markRequestsAsViewed,
    ],
  );

  const commitPendingRequestSectionsViewed = useCallback(
    (sectionKeys?: string[]) => {
      const keys =
        sectionKeys ??
        Object.entries(expandedSectionsRef.current)
          .filter(([, isExpanded]) => isExpanded)
          .map(([sectionKey]) => sectionKey);

      keys.forEach((sectionKey) =>
        commitPendingRequestSectionViewed(sectionKey),
      );
    },
    [commitPendingRequestSectionViewed],
  );

  useEffect(() => {
    commitPendingRequestSectionsViewedRef.current =
      commitPendingRequestSectionsViewed;
  }, [commitPendingRequestSectionsViewed]);

  const markVisibleRequestSectionAsViewedOnClose = useCallback(
    (sectionKey: string) => {
      const sectionItems = getRequestSectionItems(sectionKey);
      const visualUnreadSignatures =
        getRequestSectionVisualUnreadSignatures(sectionKey);

      sectionItems.forEach((item) => {
        const requestId = String(item.id ?? "").trim();
        const visibilityKey = buildViewedRequestSignature(item) || requestId;
        if (
          !requestId ||
          !visualUnreadSignatures.has(visibilityKey) ||
          pendingVisibleRequestIdsRef.current.has(visibilityKey)
        ) {
          return;
        }

        const node = requestCardRefs.current.get(requestId);
        if (!node) {
          return;
        }

        node.measureInWindow((_x, y, _width, measuredHeight) => {
          const isVisible = isMeasuredRequestCardVisibleEnough(
            y,
            measuredHeight,
          );

          if (
            !isVisible &&
            !seenVisibleRequestIdsRef.current.has(visibilityKey)
          ) {
            return;
          }

          seenVisibleRequestIdsRef.current.delete(visibilityKey);
          pendingVisibleRequestIdsRef.current.add(visibilityKey);
        });
      });
    },
    [
      getRequestSectionItems,
      getRequestSectionVisualUnreadSignatures,
      isMeasuredRequestCardVisibleEnough,
    ],
  );
  const markVisibleRequestSectionAsViewedOnCloseRef = useRef(
    markVisibleRequestSectionAsViewedOnClose,
  );

  useEffect(() => {
    markVisibleRequestSectionAsViewedOnCloseRef.current =
      markVisibleRequestSectionAsViewedOnClose;
  }, [markVisibleRequestSectionAsViewedOnClose]);

  const markVisibleRequestSectionCardsAsSeenPending = useCallback(
    (sectionKey: string) => {
      const visualUnreadSignatures =
        getRequestSectionVisualUnreadSignatures(sectionKey);

      getRequestSectionItems(sectionKey).forEach((item) => {
        const requestId = String(item.id ?? "").trim();
        const visibilityKey = buildViewedRequestSignature(item) || requestId;
        if (
          !requestId ||
          !visualUnreadSignatures.has(visibilityKey) ||
          pendingVisibleRequestIdsRef.current.has(visibilityKey)
        ) {
          return;
        }

        const node = requestCardRefs.current.get(requestId);
        if (!node) {
          return;
        }

        node.measureInWindow((_x, y, _width, measuredHeight) => {
          if (!isMeasuredRequestCardVisibleEnough(y, measuredHeight)) {
            return;
          }

          seenVisibleRequestIdsRef.current.add(visibilityKey);
          pendingVisibleRequestIdsRef.current.add(visibilityKey);
        });
      });
    },
    [
      getRequestSectionItems,
      getRequestSectionVisualUnreadSignatures,
      isMeasuredRequestCardVisibleEnough,
    ],
  );

  const toggleSection = useCallback(
    (sectionKey: string) => {

      const isClosingSection = expandedSections[sectionKey];

      if (!isClosingSection) {
        scrolledRequestSectionKeysRef.current.delete(sectionKey);
        requestAnimationFrame(() => {
          markVisibleRequestSectionCardsAsSeenPending(sectionKey);
        });
      } else {
        markVisibleRequestSectionAsViewedOnClose(sectionKey);
        requestAnimationFrame(() => {
          commitPendingRequestSectionViewed(sectionKey);
        });
        scrolledRequestSectionKeysRef.current.delete(sectionKey);
      }

      setExpandedSections((current) => ({
        ...current,
        [sectionKey]: !current[sectionKey],
      }));

      if (isClosingSection) {
        delete requestVisualUnreadSnapshotsRef.current[sectionKey];
        setExpandedDateGroups((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([key]) => !key.startsWith(`${sectionKey}:`),
            ),
          ),
        );
      }
    },
    [
      commitPendingRequestSectionViewed,
      expandedSections,
      markVisibleRequestSectionCardsAsSeenPending,
      markVisibleRequestSectionAsViewedOnClose,
    ],
  );

  const unreadPendingCount = useMemo(
    () =>
      hasLoadedViewedRequestIds
        ? richiesteInAttesaRecenti.filter((item) => isUnreadRequest(item))
            .length
        : 0,
    [hasLoadedViewedRequestIds, isUnreadRequest, richiesteInAttesaRecenti],
  );
  const unreadAcceptedCount = useMemo(
    () =>
      hasLoadedViewedRequestIds
        ? richiesteAccettateRecenti.filter(
            (item) => item.operatorChangeStatus !== "pending" && isUnreadRequest(item),
          ).length
        : 0,
    [hasLoadedViewedRequestIds, isUnreadRequest, richiesteAccettateRecenti],
  );
  const unreadCancelledCount = useMemo(() => {
    const localCancelledUnreadCount = hasLoadedViewedRequestIds
      ? new Set(
          cancelledClientUnreadItems
            .map((item) => {
              const groupId = item.appointmentGroupId?.trim();
              const requestId = String(item.id ?? "").trim();
              return groupId
                ? `group:${groupId}`
                : requestId
                  ? `request:${requestId}`
                  : "";
            })
            .filter(Boolean),
        ).size
      : 0;
    const remoteCancelledUnreadFloor = Math.max(
      0,
      Math.trunc(remoteCancelledClientUnreadCount),
    );

    return Math.max(localCancelledUnreadCount, remoteCancelledUnreadFloor);
  }, [
    cancelledClientUnreadItems,
    hasLoadedViewedRequestIds,
    remoteCancelledClientUnreadCount,
  ]);
  useEffect(() => {
    const visibleCanonicalKeys = new Set(
      backofficeAnnulledRequestSections.includedEntries
        .filter((entry) => entry.section === "cancelled_by_client_recent")
        .map((entry) => entry.duplicateKey),
    );
    const visibleRecordIds = richiesteAnnullateClienteRecenti.map(
      (item) => item.id,
    );
    const markAsReadSignatures =
      lastClientCancelledMarkAsReadSignaturesRef.current;
    const currentDebugCanonicalKeys = new Set(
      backofficeAnnulledRequestSections.debugCandidates.map(
        (entry) => entry.duplicateKey,
      ),
    );
    const carriedDebugEntries =
      backofficeAnnulledRequestSections.includedEntries.filter(
        (entry) =>
          entry.stableCarriedFromPreviousFrame &&
          !currentDebugCanonicalKeys.has(entry.duplicateKey),
      );

    const records = [
      ...backofficeAnnulledRequestSections.debugCandidates,
      ...carriedDebugEntries,
    ]
      .filter((entry) => entry.item.stato === "Annullata")
      .map((entry) => {
        const item = entry.item;
        const record = item as Record<string, unknown>;
        const notificationId = getBackofficeRequestNotificationId(record);
        const eventId = getBackofficeRequestEventId(record);
        const appointmentId =
          getBackofficeRequestAppointmentIdFromRecord(record);
        const normalizedIdentity = [
          item.email,
          item.telefono,
          `${item.nome ?? ""} ${item.cognome ?? ""}`.trim(),
          item.id,
        ].some((value) => String(value ?? "").trim().length > 0);
        const visible =
          entry.section === "cancelled_by_client_recent" &&
          visibleCanonicalKeys.has(entry.duplicateKey);
        const reasonHidden = visible
          ? ""
          : !isCancelledByCustomer(item)
            ? "not_client_cancelled"
            : !normalizedIdentity
              ? "missing_required_identity"
              : entry.section === "archive"
                ? "archived_by_event_month"
                : entry.reasonExcluded
                  ? entry.reasonExcluded
                  : entry.dedupeApplied
                    ? "deduped_by_canonical_record"
                    : "not_in_visible_client_cancelled_section";

        return {
          recordId: item.id,
          appointmentId: appointmentId || item.id,
          notificationId: notificationId || null,
          eventId: eventId || null,
          canonicalDuplicateKey: entry.duplicateKey,
          dedupeGroupSize: entry.dedupeGroupSize,
          suppressedDuplicateCount: entry.suppressedDuplicateCount,
          sourceIds: entry.sourceIds,
          salonRescheduleRelated:
            isBackofficeSalonRescheduleRelatedRecord(record),
          read: !isUnreadRequest(item),
          status: item.stato,
          type: getBackofficeRequestEventType(item),
          assignedSection: entry.section,
          visible,
          reasonHidden,
          markAsReadTriggered: markAsReadSignatures.has(
            buildViewedRequestSignature(item),
          ),
          cancellationSource: item.cancellationSource ?? null,
          createdAt: item.createdAt,
          appointmentDate: item.data,
          duplicateKey: entry.duplicateKey,
          stableCarriedFromPreviousFrame: entry.stableCarriedFromPreviousFrame,
        };
      });
  }, [
    backofficeAnnulledRequestSections.debugCandidates,
    backofficeAnnulledRequestSections.includedEntries,
    cancelledClientUnreadItems.length,
    isCancelledByCustomer,
    isUnreadRequest,
    richiesteAnnullateClienteRecenti,
    remoteCancelledClientUnreadCount,
    unreadCancelledCount,
    unreadCountsBySection.prenotazioni,
  ]);
  const unreadArchiveCount = useMemo(() => {
    if (!hasLoadedViewedRequestIds) return 0;
    // History can contain an unread customer event after an old local read or
    // a delayed synchronization. Keep its read action reachable, counting a
    // composed appointment once, just as the navigation badge does.
    return new Set(richiesteArchivioStorico
      .filter((item) => isUnreadRequest(item) && (
        item.stato === "Accettata" ||
        (item.stato === "Annullata" && (
          isCancelledByCustomer(item) || isResolvedOperatorChangeResponseEvent(item)
        ))
      ))
      .map((item) => item.appointmentGroupId?.trim()
        ? `group:${item.appointmentGroupId.trim()}`
        : `request:${item.id}`)).size;
  }, [hasLoadedViewedRequestIds, isCancelledByCustomer, isUnreadRequest, richiesteArchivioStorico]);
  const unreadSalonDeclinedCount = useMemo(() => 0, []);

  const registerRequestCardRef = useCallback(
    (requestId: string, node: View | null) => {
      if (!requestId) {
        return;
      }
      if (node) {
        requestCardRefs.current.set(requestId, node);
      } else {
        requestCardRefs.current.delete(requestId);
      }
    },
    [],
  );

  const markVisibleOpenRequestCardsAsViewedAfterScroll = useCallback(
    (scrollY: number) => {
      if (scrollY < 24 || !hasLoadedViewedRequestIds) {
        return;
      }

      Object.entries(expandedSections).forEach(([sectionKey, isExpanded]) => {
        if (isExpanded) {
          scrolledRequestSectionKeysRef.current.add(sectionKey);
        }
      });

      const openItems: typeof richiestePrenotazione = [];
      if (expandedSections.pending) {
        openItems.push(...richiesteInAttesaRecenti);
      }
      if (expandedSections.accepted) {
        openItems.push(...richiesteAccettateRecenti);
      }
      if (expandedSections.cancelled) {
        openItems.push(...richiesteAnnullateClienteRecenti);
      }
      if (expandedSections.salonDeclined) {
        openItems.push(...richiesteCancellateORifiutateDalSaloneRecenti);
      }
      if (expandedSections.archive) {
        openItems.push(...richiesteArchivioStorico);
      }

      openItems.forEach((item) => {
        const requestId = String(item.id ?? "").trim();
        const visibilityKey = buildViewedRequestSignature(item) || requestId;
        const sectionKey =
          expandedSections.pending && richiesteInAttesaRecenti.includes(item)
            ? "pending"
            : expandedSections.accepted &&
                richiesteAccettateRecenti.includes(item)
              ? "accepted"
              : expandedSections.cancelled &&
                  richiesteAnnullateClienteRecenti.includes(item)
                ? "cancelled"
                : expandedSections.salonDeclined &&
                    richiesteCancellateORifiutateDalSaloneRecenti.includes(item)
                  ? "salonDeclined"
                  : expandedSections.archive &&
                      richiesteArchivioStorico.includes(item)
                    ? "archive"
                    : "";
        const visualUnreadSignatures = sectionKey
          ? getRequestSectionVisualUnreadSignatures(sectionKey)
          : new Set<string>();

        if (
          !requestId ||
          !visualUnreadSignatures.has(visibilityKey) ||
          pendingVisibleRequestIdsRef.current.has(visibilityKey)
        ) {
          return;
        }

        const node = requestCardRefs.current.get(requestId);
        if (!node) {
          return;
        }

        node.measureInWindow((_x, y, _width, measuredHeight) => {
          if (pendingVisibleRequestIdsRef.current.has(visibilityKey)) {
            return;
          }

          if (isMeasuredRequestCardVisibleEnough(y, measuredHeight)) {
            seenVisibleRequestIdsRef.current.add(visibilityKey);
            pendingVisibleRequestIdsRef.current.add(visibilityKey);
            return;
          }
        });
      });
    },
    [
      expandedSections.accepted,
      expandedSections.archive,
      expandedSections.cancelled,
      expandedSections.customerConfirmation,
      expandedSections.pending,
      expandedSections.salonDeclined,
      hasLoadedViewedRequestIds,
      getRequestSectionVisualUnreadSignatures,
      isMeasuredRequestCardVisibleEnough,
      richiesteAccettateRecenti,
      richiesteAnnullateClienteRecenti,
      richiesteArchivioStorico,
      richiesteCancellateORifiutateDalSaloneRecenti,
      richiesteInAttesaConfermaCliente,
      richiesteInAttesaRecenti,
    ],
  );

  const requestedSectionParam = Array.isArray(routeParams.section)
    ? routeParams.section[0]
    : routeParams.section;
  const requestedRequestIdParam = Array.isArray(routeParams.requestId)
    ? routeParams.requestId[0]
    : routeParams.requestId;

  useEffect(() => {
    if (requestedSectionParam !== "cancelled") {
      return;
    }

    const targetSignature = [
      requestedSectionParam,
      requestedRequestIdParam ?? "",
    ].join(":");
    if (handledRouteTargetRef.current === targetSignature) {
      return;
    }
    handledRouteTargetRef.current = targetSignature;

    runAccordionAnimation();
    setExpandedSections((current) => ({
      ...current,
      pending: false,
      accepted: false,
      salonDeclined: false,
      cancelled: true,
    }));

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, cancelledSectionYRef.current - 18),
          animated: true,
        });
      }, 80);
    });
  }, [requestedRequestIdParam, requestedSectionParam]);

  useEffect(() => {
    pendingRequestsCountRef.current = richiesteDaAccettare.length;
  }, [richiesteDaAccettare.length]);

  useEffect(() => {
    richiesteDaAccettareRef.current = richiesteDaAccettare;
  }, [richiesteDaAccettare]);

  useEffect(() => {
    if (
      (!IS_WEB && !isRequestsScreenFocused) ||
      !displayedAutoAcceptBookingRequests ||
      richiesteDaAccettare.length === 0
    ) {
      return;
    }

    setAutoAcceptNowMs(Date.now());
    const timer = setInterval(() => {
      setAutoAcceptNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isRequestsScreenFocused, displayedAutoAcceptBookingRequests, richiesteDaAccettare.length]);

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      setBookingSettingsHelpOpen(null);

      setExpandedSections({
        pending: false,
        customerConfirmation: false,
        cancelled: false,
        accepted: false,
        salonDeclined: false,
      });

      return () => {
        isScreenFocusedRef.current = false;
        setBookingSettingsHelpOpen(null);
        const expandedSectionKeys = Object.entries(expandedSectionsRef.current)
          .filter(([, isExpanded]) => isExpanded)
          .map(([sectionKey]) => sectionKey);

        expandedSectionKeys.forEach((sectionKey) => {
          markVisibleRequestSectionAsViewedOnCloseRef.current(sectionKey);
        });
        requestAnimationFrame(() => {
          commitPendingRequestSectionsViewedRef.current(expandedSectionKeys);
          seenVisibleRequestIdsRef.current.clear();
          scrolledRequestSectionKeysRef.current.clear();
        });
        requestVisualUnreadSnapshotsRef.current = {};
        setExpandedSections(collapsedSections());
      };
    }, [collapsedSections]),
  );

  const aggiornaStatoRichiesta = useCallback(
    async (
      id: string,
      stato: "Accettata" | "Rifiutata",
      ignoreConflicts = false,
      acceptedDurationMinutes?: number,
      acceptedOperatorId?: string,
      acceptedOperatorName?: string,
    ) => {
      return updateBookingRequestStatusForSalon({
        salonCode: salonWorkspace.salonCode,
        requestId: id,
        status: stato,
        acceptedDurationMinutes,
        acceptedOperatorId,
        acceptedOperatorName,
        ignoreConflicts,
      });
    },
    [salonWorkspace.salonCode, updateBookingRequestStatusForSalon],
  );

  const clearAutoAcceptTimer = useCallback((timerKey: string) => {
    const timer = autoAcceptTimersRef.current[timerKey];
    if (!timer) return;
    clearTimeout(timer);
    delete autoAcceptTimersRef.current[timerKey];
  }, []);

  const clearAllAutoAcceptTimers = useCallback(() => {
    Object.values(autoAcceptTimersRef.current).forEach((timer) =>
      clearTimeout(timer),
    );
    autoAcceptTimersRef.current = {};
  }, []);

  const clearAutoAcceptTimerForRequestId = useCallback(
    (requestId: string) => {
      const matchingRequest =
        richiestePrenotazione.find((item) => item.id === requestId) ??
        richiesteDaAccettareRef.current.find((item) => item.id === requestId);
      const timerKey = matchingRequest
        ? buildAutoAcceptRequestKey(matchingRequest)
        : requestId;
      clearAutoAcceptTimer(timerKey);
    },
    [clearAutoAcceptTimer, richiestePrenotazione],
  );

  const accettaRichiesta = useCallback(
    (
      id: string,
      acceptedDurationMinutes?: number,
      acceptedOperatorId?: string,
      acceptedOperatorName?: string,
    ) => {
      if (pendingStatusRequestIds.includes(id)) return;

      const currentRequest = richiestePrenotazione.find(
        (item) => item.id === id,
      );
      if (!currentRequest) return;
      const isCustomerOperatorChangeProposal =
        currentRequest.origine === "frontend" &&
        !!(
          currentRequest.operatoreId?.trim() ||
          currentRequest.operatoreNome?.trim()
        ) &&
        !!(acceptedOperatorId?.trim() || acceptedOperatorName?.trim()) &&
        (currentRequest.operatoreId?.trim() && acceptedOperatorId?.trim()
          ? currentRequest.operatoreId.trim() !== acceptedOperatorId.trim()
          : currentRequest.operatoreNome?.trim().toLowerCase() !==
            acceptedOperatorName?.trim().toLowerCase());

      requestSnapshotsRef.current[id] = {
        stato: currentRequest.stato,
        viewedByCliente: currentRequest.viewedByCliente,
        viewedBySalon: currentRequest.viewedBySalon,
        cancellationSource: currentRequest.cancellationSource,
        durataMinuti: currentRequest.durataMinuti,
        operatoreId: currentRequest.operatoreId,
        operatoreNome: currentRequest.operatoreNome,
        operatorChangeStatus: currentRequest.operatorChangeStatus,
        operatorChangeOriginalId: currentRequest.operatorChangeOriginalId,
        operatorChangeOriginalName: currentRequest.operatorChangeOriginalName,
        operatorChangeProposedId: currentRequest.operatorChangeProposedId,
        operatorChangeProposedName: currentRequest.operatorChangeProposedName,
        operatorChangeRequestedAt: currentRequest.operatorChangeRequestedAt,
        operatorChangeExpiresAt: currentRequest.operatorChangeExpiresAt,
        operatorChangeRespondedAt: currentRequest.operatorChangeRespondedAt,
      };

      markRequestsAsViewed([currentRequest]);
      setPendingStatusRequestIds((current) => [...current, id]);
      clearAutoAcceptTimerForRequestId(id);
      setRichiestePrenotazione((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                stato: isCustomerOperatorChangeProposal
                  ? "In attesa"
                  : "Accettata",
                durataMinuti: acceptedDurationMinutes ?? item.durataMinuti,
                operatoreId: acceptedOperatorId || item.operatoreId,
                operatoreNome: acceptedOperatorName || item.operatoreNome,
                viewedBySalon: true,
                viewedByCliente: false,
                operatorChangeStatus: isCustomerOperatorChangeProposal
                  ? "pending"
                  : item.operatorChangeStatus,
                operatorChangeOriginalId: isCustomerOperatorChangeProposal
                  ? item.operatoreId
                  : item.operatorChangeOriginalId,
                operatorChangeOriginalName: isCustomerOperatorChangeProposal
                  ? item.operatoreNome
                  : item.operatorChangeOriginalName,
                operatorChangeProposedId: isCustomerOperatorChangeProposal
                  ? acceptedOperatorId
                  : item.operatorChangeProposedId,
                operatorChangeProposedName: isCustomerOperatorChangeProposal
                  ? acceptedOperatorName
                  : item.operatorChangeProposedName,
              }
            : item,
        ),
      );

      aggiornaStatoRichiesta(
        id,
        "Accettata",
        false,
        acceptedDurationMinutes,
        acceptedOperatorId,
        acceptedOperatorName,
      )
        .then((result) => {
          if (!result?.ok) {
            const snapshot = requestSnapshotsRef.current[id];
            if (snapshot) {
              setRichiestePrenotazione((current) =>
                current.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        stato: snapshot.stato,
                        viewedByCliente: snapshot.viewedByCliente,
                        viewedBySalon: snapshot.viewedBySalon,
                        cancellationSource: snapshot.cancellationSource,
                        durataMinuti: snapshot.durataMinuti,
                        operatoreId: snapshot.operatoreId,
                        operatoreNome: snapshot.operatoreNome,
                        operatorChangeStatus: snapshot.operatorChangeStatus,
                        operatorChangeOriginalId:
                          snapshot.operatorChangeOriginalId,
                        operatorChangeOriginalName:
                          snapshot.operatorChangeOriginalName,
                        operatorChangeProposedId:
                          snapshot.operatorChangeProposedId,
                        operatorChangeProposedName:
                          snapshot.operatorChangeProposedName,
                        operatorChangeRequestedAt:
                          snapshot.operatorChangeRequestedAt,
                        operatorChangeExpiresAt:
                          snapshot.operatorChangeExpiresAt,
                        operatorChangeRespondedAt:
                          snapshot.operatorChangeRespondedAt,
                      }
                    : item,
                ),
              );
            }
            const errorText = (result?.error ?? "").toLowerCase();
            if (
              /accavalla|sovrapp|conflitt/.test(errorText) &&
              !acceptedOperatorId
            ) {
              showOwnerRequestAlert(
                "Conflitto orario",
                result?.error ??
                  "Questa richiesta si accavalla con un appuntamento esistente.",
                [
                  {
                    text: "Annulla",
                    style: "cancel",
                    onPress: () => {},
                  },
                  {
                    text: "Accetta comunque",
                    style: "destructive",
                    onPress: () => {
                      void aggiornaStatoRichiesta(
                        id,
                        "Accettata",
                        true,
                        acceptedDurationMinutes,
                        acceptedOperatorId,
                        acceptedOperatorName,
                      ).then((forcedResult) => {
                        if (!forcedResult?.ok) {
                          showOwnerRequestAlert(
                            "Aggiornamento non riuscito",
                            forcedResult?.error ??
                              "Non sono riuscito ad accettare la richiesta.",
                          );
                        }
                      });
                    },
                  },
                ],
              );
              return;
            }

            showOwnerRequestAlert(
              "Aggiornamento non riuscito",
              result?.error ?? "Non sono riuscito ad accettare la richiesta.",
            );
            return;
          }

          if (result.requiresCustomerConfirmation) {
            showOwnerRequestAlert(
              "Conferma inviata al cliente",
              `La richiesta resta in attesa. ${acceptedOperatorName || "Il nuovo operatore"} verrà assegnato solo se il cliente accetta il cambio.`,
            );
          }
        })
        .catch(() => null)
        .finally(() => {
          delete requestSnapshotsRef.current[id];
          setPendingStatusRequestIds((current) =>
            current.filter((item) => item !== id),
          );
        });
    },
    [
      showOwnerRequestAlert,
      clearAutoAcceptTimerForRequestId,
      pendingStatusRequestIds,
      richiestePrenotazione,
      setRichiestePrenotazione,
      aggiornaStatoRichiesta,
      markRequestsAsViewed,
    ],
  );

  const getManualAcceptanceConfig = useCallback(
    (requestId: string) => {
      const request = richiestePrenotazione.find(
        (item) => item.id === requestId,
      );
      if (!request) return null;

      const originalDuration = Math.max(
        5,
        Math.round(
          typeof request.durataMinuti === "number" &&
            Number.isFinite(request.durataMinuti)
            ? request.durataMinuti
            : 60,
        ),
      );
      const rawSlotStep = getSlotIntervalForDate(
        availabilitySettings,
        request.data,
      );
      const slotStep =
        Number.isFinite(rawSlotStep) &&
        rawSlotStep >= 5 &&
        rawSlotStep <= 300 &&
        Math.round(rawSlotStep) % 5 === 0
          ? Math.round(rawSlotStep)
          : 30;
      const reducedDurations: number[] = [];

      for (
        let candidate = originalDuration - slotStep;
        candidate >= 5;
        candidate -= slotStep
      ) {
        reducedDurations.push(candidate);
      }
      const operatorOptions = getManualAcceptanceOperatorOptions({
        request,
        durationMinutes: originalDuration,
        services: servizi,
        operators: operatori,
        appointments: appuntamenti,
        bookingRequests: richiestePrenotazione,
        settings: availabilitySettings,
      });

      return {
        request,
        originalDuration,
        slotStep,
        reducedDurations,
        defaultReducedDuration: reducedDurations[0] ?? 0,
        minimumReducedDuration:
          reducedDurations.length > 0
            ? reducedDurations[reducedDurations.length - 1]
            : 0,
        operatorOptions,
      };
    },
    [
      appuntamenti,
      availabilitySettings,
      operatori,
      richiestePrenotazione,
      servizi,
    ],
  );

  const openManualAcceptanceChoice = useCallback(
    (requestId: string) => {
      const groupedRequest = richiestePrenotazione.find(
        (item) => item.id === requestId,
      );
      if (
        displayedAutoAcceptBookingRequests &&
        !groupedRequest?.appointmentGroupId?.trim()
      ) {
        accettaRichiesta(requestId);
        return;
      }

      const config = getManualAcceptanceConfig(requestId);
      if (config?.request.operatorChangeStatus === "pending") {
        showOwnerRequestAlert(
          "In attesa del cliente",
          "Hai già proposto un cambio operatore. La richiesta verrà accettata solo dopo la conferma del cliente.",
        );
        return;
      }
      const hasOperatorChoice = (config?.operatorOptions.length ?? 0) > 1;
      if (
        !config ||
        (config.reducedDurations.length === 0 && !hasOperatorChoice)
      ) {
        accettaRichiesta(requestId);
        return;
      }
      const defaultOperator =
        config.operatorOptions.find(
          (item) =>
            item.available &&
            ((config.request.operatoreId &&
              item.operator.id === config.request.operatoreId) ||
              (!config.request.operatoreId &&
                config.request.operatoreNome &&
                item.operator.nome.trim().toLowerCase() ===
                  config.request.operatoreNome.trim().toLowerCase())),
        ) ??
        config.operatorOptions.find((item) => item.available) ??
        null;

      haptic.light();
      setSelectedRequest(null);
      setManualAcceptDurationRequestId(null);
      setManualAcceptDurationPreview(config.defaultReducedDuration);
      setManualAcceptOperatorId(defaultOperator?.operator.id ?? "");
      setManualAcceptChoiceRequestId(requestId);
    },
    [
      accettaRichiesta,
      displayedAutoAcceptBookingRequests,
      getManualAcceptanceConfig,
      richiestePrenotazione,
    ],
  );
  const shouldOfferAdvancedManualAcceptance = useCallback(
    (requestId: string) => {
      const groupedRequest = richiestePrenotazione.find(
        (item) => item.id === requestId,
      );
      if (
        displayedAutoAcceptBookingRequests &&
        !groupedRequest?.appointmentGroupId?.trim()
      ) {
        return false;
      }

      if (groupedRequest?.appointmentGroupId?.trim()) return false;

      const config = getManualAcceptanceConfig(requestId);
      return Boolean(
        config &&
        (config.operatorOptions.length > 1 ||
          config.reducedDurations.length > 0),
      );
    },
    [
      showOwnerRequestAlert,
      displayedAutoAcceptBookingRequests,
      getManualAcceptanceConfig,
      richiestePrenotazione,
    ],
  );

  const rifiutaRichiesta = useCallback(
    (id: string) => {
      if (pendingStatusRequestIds.includes(id)) return;

      showOwnerRequestAlert(
        "Rifiuta richiesta",
        "Vuoi davvero rifiutare questa richiesta di prenotazione?",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Rifiuta",
            style: "destructive",
            onPress: () => {
              clearAutoAcceptTimerForRequestId(id);
              const currentRequest = richiestePrenotazione.find(
                (item) => item.id === id,
              );
              if (!currentRequest) return;

              requestSnapshotsRef.current[id] = {
                stato: currentRequest.stato,
                viewedByCliente: currentRequest.viewedByCliente,
                viewedBySalon: currentRequest.viewedBySalon,
                cancellationSource: currentRequest.cancellationSource,
              };

              setPendingStatusRequestIds((current) => [...current, id]);
              markRequestsAsViewed([currentRequest]);

              aggiornaStatoRichiesta(id, "Rifiutata")
                .then((result) => {
                  if (!result?.ok) {
                    showOwnerRequestAlert(
                      "Aggiornamento non riuscito",
                      result?.error ??
                        "Non sono riuscito a rifiutare la richiesta.",
                    );
                  }
                })
                .catch(() => null)
                .finally(() => {
                  delete requestSnapshotsRef.current[id];
                  setPendingStatusRequestIds((current) =>
                    current.filter((item) => item !== id),
                  );
                });
            },
          },
        ],
      );
    },
    [
      showOwnerRequestAlert,
      aggiornaStatoRichiesta,
      clearAutoAcceptTimerForRequestId,
      markRequestsAsViewed,
      pendingStatusRequestIds,
      richiestePrenotazione,
    ],
  );

  function runAccordionAnimation() {
    if (Platform.OS === "ios") {
      LayoutAnimation.configureNext({
        duration: 180,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
      return;
    }

    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }

  const toggleDateGroup = useCallback((groupKey: string) => {
    setExpandedDateGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  }, []);

  useEffect(() => {
    // L'auto-accettazione owner viene gestita centralmente nel tab layout,
    // cosi Agenda, Richieste, banner e badge usano lo stesso clock.
    clearAllAutoAcceptTimers();

    if (!displayedAutoAcceptBookingRequests) {
      return;
    }
    return;
  }, [clearAllAutoAcceptTimers, displayedAutoAcceptBookingRequests]);

  useEffect(
    () => () => {
      clearAllAutoAcceptTimers();
    },
    [clearAllAutoAcceptTimers],
  );

  const openExternalUrl = useCallback(async (url: string) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (!supported) return;
    Linking.openURL(url).catch(() => null);
  }, []);

  const getRequestSortValue = useCallback(
    (item: (typeof richiestePrenotazione)[number]) => {
      const createdAtMs = Date.parse(String(item.createdAt ?? "").trim());
      if (Number.isFinite(createdAtMs)) {
        return createdAtMs;
      }

      const dateTimeMs = Date.parse(
        `${item.data ?? getTodayDateString()}T${item.ora || "00:00"}:00`,
      );
      return Number.isFinite(dateTimeMs) ? dateTimeMs : 0;
    },
    [],
  );

  const sortRequestsNewestFirst = useCallback(
    (items: typeof richiestePrenotazione) =>
      [...items].sort((left, right) => {
        const byTime = getRequestSortValue(right) - getRequestSortValue(left);
        if (byTime !== 0) return byTime;
        return String(right.id ?? "").localeCompare(String(left.id ?? ""));
      }),
    [getRequestSortValue],
  );

  React.useEffect(() => {
    return () => {
      Keyboard.dismiss();
    };
  }, []);

  const renderRequestCard = (
    item: (typeof richiestePrenotazione)[number],
    variant: "pending" | "history",
    isUnread: boolean,
  ) => {
    const logicalGroupId = item.appointmentGroupId?.trim() ?? "";
    const logicalMembers = (
      logicalGroupId
        ? richiestePrenotazione.filter(
            (candidate) =>
              candidate.appointmentGroupId?.trim() === logicalGroupId &&
              candidate.stato === item.stato,
          )
        : [item]
    ).sort(
      (left, right) =>
        (left.appointmentGroupOrder ?? 0) -
          (right.appointmentGroupOrder ?? 0) ||
        `${left.data} ${left.ora}`.localeCompare(`${right.data} ${right.ora}`),
    );
    const logicalHasPhases = logicalMembers.some((member) =>
      Boolean(normalizeServicePhaseConfig(member.phaseConfig)),
    );
    const logicalHasComposition = logicalMembers.some((member) =>
      Boolean(member.compositionId?.trim()),
    ) || requestAppointmentGroupKinds[logicalGroupId] === "composition";
    const logicalHasDependency = logicalMembers.some((member) =>
      Boolean(member.dependencyServiceId?.trim()),
    ) || requestAppointmentGroupKinds[logicalGroupId] === "dependency";
    const logicalKindLabel =
      logicalHasPhases
        ? logicalMembers.length > 1
          ? "PERCORSO CON POSA"
          : "SERVIZIO CON POSA"
        : logicalHasComposition
          ? "COMPOSIZIONE"
          : logicalHasDependency
            ? "SERVIZI COLLEGATI"
            : logicalMembers.length > 1
              ? "COMBO"
              : "";
    const logicalKindIcon = logicalHasPhases
      ? ("hourglass-outline" as const)
      : logicalHasComposition
        ? ("layers-outline" as const)
        : ("git-branch-outline" as const);
    const logicalTitle =
      logicalMembers.length > 1
        ? logicalMembers.map((member) => member.servizio).join(" + ")
        : item.servizio;
    const historyLabel =
      item.operatorChangeStatus === "pending"
        ? "Attesa conferma cliente"
        : item.operatorChangeStatus === "rejected"
          ? "Cambio operatore rifiutato"
          : item.operatorChangeStatus === "expired"
            ? "Conferma cambio scaduta"
            : item.stato === "Annullata"
              ? isCancelledBySalon(item)
                ? "Annullata dal salone"
                : "Annullata dal cliente"
              : item.stato;

    const historyDanger =
      item.stato === "Rifiutata" ||
      (item.stato === "Annullata" &&
        (variant === "history" || isCancelledBySalon(item)));
    const autoAcceptRemainingSeconds =
      variant === "pending" &&
      displayedAutoAcceptBookingRequests &&
      !item.appointmentGroupId?.trim()
        ? getAutoAcceptRemainingSeconds(item, autoAcceptNowMs)
        : null;

    const rp = premiumRequestsPalette;
    const goldInk = rp.night ? "#E2CFAA" : "#7A5F38";
    const statusLabel =
      variant === "pending"
        ? item.stato === "Annullata"
          ? "Annullata"
          : "In attesa"
        : historyLabel;
    // Status is a quiet dot + word: gold while waiting, muted when settled, rose when cancelled.
    const statusTone =
      variant === "pending" && item.stato !== "Annullata"
        ? goldInk
        : historyDanger || item.stato === "Annullata"
          ? (rp.night ? "#D9A3A8" : "#9A4B53")
          : rp.ink;
    const [weekdayLabel = "", dayLabel = "", monthLabel = ""] = formatDateLong(item.data).split(" ");
    const contactButton = (
      icon: React.ComponentProps<typeof Ionicons>["name"],
      label: string,
      onPress: () => void,
    ) => (
      <HapticTouchable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${item.nome} ${item.cognome}`.trim()}
        onPress={onPress}
        pressScale={0.94}
        pressOpacity={0.9}
        style={{ borderRadius: 20 }}
      >
        <NativeMedal icon={icon} size={40} iconSize={17} />
      </HapticTouchable>
    );

    return (
      <Animated.View
        key={item.id}
        ref={(node) =>
          registerRequestCardRef(
            String(item.id ?? "").trim(),
            node as unknown as View | null,
          )
        }
        {...(IS_WEB ? ({ dataSet: { premiumHoverCard: "true" } } as object) : {})}
        layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: isUnread ? (rp.night ? "rgba(216,194,155,.5)" : "rgba(150,118,72,.42)") : (rp.night ? "rgba(255,255,255,.12)" : "rgba(40,36,30,.12)"),
          backgroundColor: rp.night ? "#2E3133" : "#FFFDFA",
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: rp.night ? 0.38 : 0.1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }}
      >
        {/* Soft top sheen: the card catches light like the Home glass cards. */}
        <View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, height: IS_WEB ? "70%" : 1, borderTopLeftRadius: 17, borderTopRightRadius: 17, backgroundColor: rp.night ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.9)" }, IS_WEB ? ({ backgroundColor: "transparent", backgroundImage: rp.night ? "linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,0))" : "linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,0))" } as object) : null]} />
        <View style={{ flexDirection: "row", alignItems: "stretch" }}>
          <HapticTouchable
            {...(IS_WEB ? ({ dataSet: { premiumHoverPrimary: "true" } } as object) : {})}
            accessibilityRole="button"
            accessibilityLabel={`Apri ${item.nome} ${item.cognome}, ${logicalTitle}, ${formatDateLong(item.data)} ${item.ora}`}
            style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "stretch" }}
            onPress={() => {
              haptic.light();
              setSelectedRequest(item);
            }}
            pressScale={0.992}
            pressOpacity={0.96}
          >
            <View style={{ width: 76, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 14, margin: 6, marginRight: 0, borderRadius: 13, backgroundColor: rp.night ? "rgba(255,255,255,.06)" : "rgba(40,36,30,.05)", borderWidth: 1, borderColor: rp.night ? "rgba(255,255,255,.12)" : "rgba(40,36,30,.12)" }}>
              <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: "600", color: rp.ink, fontVariant: ["tabular-nums"] }}>{item.ora}</Text>
              <Text style={{ fontSize: 11, lineHeight: 14, color: rp.ink, fontWeight: "600", opacity: 0.8 }}>{weekdayLabel}</Text>
              <Text style={{ fontSize: 11, lineHeight: 14, color: rp.muted }}>{dayLabel} {monthLabel}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingVertical: 13, paddingLeft: 14, paddingRight: 10, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                {isUnread ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: goldInk }} /> : null}
                <Text style={{ flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, fontWeight: "600", color: rp.ink }} numberOfLines={1}>
                  {item.nome} {item.cognome}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusTone }} />
                  <Text style={{ fontSize: 11, lineHeight: 15, fontWeight: "600", color: statusTone }} numberOfLines={1}>{statusLabel}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 18, color: rp.ink, opacity: 0.86 }} numberOfLines={IS_WEB ? 2 : 1}>
                {logicalTitle}
              </Text>
              {logicalKindLabel ? (
                <View style={{ gap: 2, marginTop: 2 }}>
                  {logicalMembers.map((member) => {
                    const phaseConfig = normalizeServicePhaseConfig(member.phaseConfig);
                    return (
                      <View key={member.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name={logicalKindIcon} size={12} color={goldInk} />
                        <Text style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, color: rp.muted }} numberOfLines={1}>
                          {logicalMembers.length > 1 ? `${member.ora} · ${member.servizio}` : logicalKindLabel.charAt(0) + logicalKindLabel.slice(1).toLowerCase()}
                          {phaseConfig?.processingDurationMinutes ? ` · posa ${phaseConfig.processingDurationMinutes} min` : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                {item.operatoreNome ? (
                  <>
                    <Ionicons name="cut-outline" size={12} color={rp.muted} />
                    <Text style={{ fontSize: 12, lineHeight: 16, color: rp.muted, flexShrink: 1 }} numberOfLines={1}>{item.operatoreNome}</Text>
                    <Text style={{ fontSize: 12, color: rp.muted }}>·</Text>
                  </>
                ) : null}
                <Text style={{ fontSize: 12, lineHeight: 16, color: rp.ink, fontWeight: "600", fontVariant: ["tabular-nums"] }}>€ {item.prezzo.toFixed(2).replace(".", ",")}</Text>
                {autoAcceptRemainingSeconds !== null ? (
                  <Text style={{ fontSize: 12, lineHeight: 16, color: goldInk, fontWeight: "600" }}>· auto {autoAcceptRemainingSeconds}s</Text>
                ) : null}
              </View>
              {visibleRequestNote(item.note) ? (
                <Text style={{ fontSize: 12, lineHeight: 17, color: rp.muted, fontStyle: "italic", marginTop: 2 }} numberOfLines={IS_WEB ? undefined : 1}>
                  “{visibleRequestNote(item.note)}”
                </Text>
              ) : null}
            </View>
          </HapticTouchable>
          <View style={{ justifyContent: "center", gap: 8, paddingRight: 12, paddingLeft: 2, paddingVertical: 12 }}>
            {contactButton("call-outline", "Chiama", () => openExternalUrl(`tel:${buildDialablePhone(item.telefono)}`))}
            {contactButton("logo-whatsapp", "WhatsApp", () => openExternalUrl(buildWhatsappUrl(item.telefono)))}
            {item.instagram ? contactButton("logo-instagram", "Instagram", () => openExternalUrl(buildInstagramUrl(item.instagram))) : null}
          </View>
        </View>

        {variant === "pending" && item.stato !== "Annullata" ? (
          <View style={styles.compactDecisionBlock}>
            {autoAcceptRemainingSeconds !== null ? (
              <View style={styles.compactCountdownInlineCard}>
                <Text style={styles.compactCountdownInlineEyebrow}>
                  Auto-accettazione
                </Text>
                <Text style={styles.compactCountdownInlineText}>
                  Accettazione automatica tra {autoAcceptRemainingSeconds}{" "}
                  {autoAcceptRemainingSeconds === 1 ? "secondo" : "secondi"}
                </Text>
              </View>
            ) : null}
            <View style={styles.compactDecisionRow}>
              <HapticTouchable
                style={[
                  styles.compactDecisionPrimary,
                  pendingStatusRequestIds.includes(item.id) &&
                    styles.actionButtonDisabled,
                ]}
                onPress={() => {
                  if (shouldOfferAdvancedManualAcceptance(item.id)) {
                    accettaRichiesta(item.id);
                    return;
                  }
                  openManualAcceptanceChoice(item.id);
                }}
                disabled={pendingStatusRequestIds.includes(item.id)}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.compactDecisionPrimaryText}>
                  {tApp(appLanguage, "requests_accept")}
                </Text>
              </HapticTouchable>
              <HapticTouchable
                style={[
                  styles.compactDecisionSecondary,
                  pendingStatusRequestIds.includes(item.id) &&
                    styles.actionButtonDisabled,
                ]}
                onPress={() => rifiutaRichiesta(item.id)}
                disabled={pendingStatusRequestIds.includes(item.id)}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.compactDecisionSecondaryText}>
                  {tApp(appLanguage, "requests_reject")}
                </Text>
              </HapticTouchable>
            </View>
            {shouldOfferAdvancedManualAcceptance(item.id) ? (
              <HapticTouchable
                style={[
                  styles.compactDecisionAdvanced,
                  pendingStatusRequestIds.includes(item.id) &&
                    styles.actionButtonDisabled,
                ]}
                onPress={() => openManualAcceptanceChoice(item.id)}
                disabled={pendingStatusRequestIds.includes(item.id)}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <View style={styles.compactDecisionAdvancedCopy}>
                  <Text style={styles.compactDecisionAdvancedTitle}>
                    Accetta e modifica
                  </Text>
                  <Text style={styles.compactDecisionAdvancedHint}>
                    Cambia operatore o riduci orario
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={premiumRequestsPalette.ink} />
              </HapticTouchable>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    );
  };

  const renderDirectRequestList = (
    sectionKey: string,
    items: typeof richiestePrenotazione,
    variant: "pending" | "history",
    unreadCountFloor = 0,
  ) => {
    const forceReadOnly = isReadOnlyHistorySection(sectionKey);

    if (!requestVisualUnreadSnapshotsRef.current[sectionKey]) {
      requestVisualUnreadSnapshotsRef.current[sectionKey] = new Set(
        forceReadOnly
          ? []
          : items
              .filter((item) => isUnreadRequest(item))
              .map((item) => buildViewedRequestSignature(item)),
      );
    }

    const visualUnreadSignatures = forceReadOnly
      ? new Set<string>()
      : requestVisualUnreadSnapshotsRef.current[sectionKey];
    // The same request can arrive twice from sync; render it once so cards keep a unique identity.
    const seenRequestIds = new Set<string>();
    const sortedItems = sortRequestsNewestFirst(items).filter((item) => {
      const id = String(item.id ?? "");
      if (!id) return true;
      if (seenRequestIds.has(id)) return false;
      seenRequestIds.add(id);
      return true;
    });
    const exactUnreadItems = sortedItems.filter((item) =>
      visualUnreadSignatures.has(buildViewedRequestSignature(item)),
    );
    const unreadFloor = forceReadOnly
      ? 0
      : Math.max(0, Math.trunc(unreadCountFloor));
    const promotedUnreadItems =
      unreadFloor > exactUnreadItems.length
        ? sortedItems
            .filter(
              (item) =>
                !visualUnreadSignatures.has(buildViewedRequestSignature(item)),
            )
            .slice(0, unreadFloor - exactUnreadItems.length)
        : [];
    const stableUnreadItems = [...exactUnreadItems, ...promotedUnreadItems];
    const stableUnreadSignatures = new Set(
      stableUnreadItems.map((item) => buildViewedRequestSignature(item)),
    );
    const stableReadItems = sortedItems.filter(
      (item) => !stableUnreadSignatures.has(buildViewedRequestSignature(item)),
    );

    return (
      <View style={styles.directRequestList}>
        {stableUnreadItems.length > 0 ? (
          <View style={styles.requestVisualGroup}>
            <View style={styles.requestVisualGroupHeader}>
              <Text style={styles.requestVisualGroupTitle}>Da leggere</Text>
              <Text style={styles.requestVisualGroupCount}>
                {stableUnreadItems.length}
              </Text>
            </View>
            {stableUnreadItems.map((item) =>
              renderRequestCard(item, variant, true),
            )}
          </View>
        ) : null}

        {stableReadItems.length > 0 ? (
          <View style={styles.requestVisualGroup}>
            {stableUnreadItems.length > 0 ? (
              <View style={styles.requestVisualGroupHeader}>
                <Text style={styles.requestVisualGroupTitle}>Lette</Text>
                <Text style={styles.requestVisualGroupCount}>
                  {stableReadItems.length}
                </Text>
              </View>
            ) : null}
            {stableReadItems.map((item) =>
              renderRequestCard(item, variant, false),
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderDateGroups = (
    sectionKey: string,
    groups: RequestGroup[],
    variant: "pending" | "history",
  ) => (
    <View style={styles.groupedList}>
      {groups.map((group) => (
        <View key={group.date} style={styles.dateGroup}>
          {(() => {
            const groupKey = `${sectionKey}:${group.date}`;
            const isExpanded = expandedDateGroups[groupKey] ?? false;
            const previewItems = group.items.slice(0, 3);

            return (
              <Animated.View
                {...getWebExpandableCardProps(
                  () => toggleDateGroup(groupKey),
                  { expanded: isExpanded },
                )}
                layout={LinearTransition.duration(180).easing(
                  Easing.out(Easing.cubic),
                )}
                style={[
                  styles.dayClusterCard,
                  getWebExpandableCardStyle(isExpanded),
                ]}
              >
                <View style={styles.dayClusterHeader}>
                  <View style={styles.dayClusterHeaderText}>
                    <Text style={styles.dayClusterDate}>
                      {formatDateLong(group.date)}
                    </Text>
                    <Text style={styles.dayClusterMeta}>
                      {group.items.length}{" "}
                      {group.items.length === 1 ? "richiesta" : "richieste"} ·{" "}
                      {group.items[group.items.length - 1]?.ora} -{" "}
                      {group.items[0]?.ora}
                    </Text>
                  </View>
                  <View style={styles.dayClusterHeaderActions}>
                    <View style={styles.dayClusterBadge}>
                      <Text style={styles.dayClusterBadgeText}>
                        {group.items.length}
                      </Text>
                    </View>
    <PremiumExpandButton tone={{ink:premiumRequestsPalette.ink,fill:premiumRequestsPalette.field,border:premiumRequestsPalette.border}}
      salon
                      delicate
                      compact
                      expanded={isExpanded}
                      onPress={() => toggleDateGroup(groupKey)}
                      accessibilityLabel={
                        isExpanded
                          ? `Chiudi richieste del ${formatDateLong(group.date)}`
                          : `Apri richieste del ${formatDateLong(group.date)}`
                      }
                    />
                  </View>
                </View>

                {!isExpanded ? (
                  <View style={styles.dayClusterPreviewStack}>
                    {previewItems.map((item, index) => (
                      <View
                        key={`${groupKey}:${item.id}:preview`}
                        style={[
                          styles.dayClusterPreviewLayer,
                          index === 0 && styles.dayClusterPreviewLayerTop,
                          index === 1 && styles.dayClusterPreviewLayerMid,
                          index === 2 && styles.dayClusterPreviewLayerBottom,
                        ]}
                      >
                        <View style={styles.dayClusterPreviewTopRow}>
                          <View style={styles.dayClusterPreviewMain}>
                            <Text
                              style={styles.dayClusterPreviewName}
                              numberOfLines={1}
                            >
                              {item.nome} {item.cognome}
                            </Text>
                            <Text
                              style={styles.dayClusterPreviewService}
                              numberOfLines={1}
                            >
                              {item.servizio}
                              {getRequestGroupPhaseLabel(item)}
                            </Text>
                            {item.operatoreNome ? (
                              <Text
                                style={styles.dayClusterPreviewOperator}
                                numberOfLines={1}
                              >
                                {item.operatoreNome}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.dayClusterPreviewTime}>
                            {item.ora}
                          </Text>
                        </View>
                        {variant === "pending" && item.stato === "In attesa" ? (
                          <View style={styles.dayClusterPreviewDecisionBlock}>
                            <View style={styles.dayClusterPreviewDecisionRow}>
                              <HapticTouchable
                                style={[
                                  styles.dayClusterPreviewDecisionButton,
                                  styles.dayClusterPreviewDecisionAccept,
                                  pendingStatusRequestIds.includes(item.id) &&
                                    styles.actionButtonDisabled,
                                ]}
                                onPress={() => {
                                  if (
                                    shouldOfferAdvancedManualAcceptance(item.id)
                                  ) {
                                    accettaRichiesta(item.id);
                                    return;
                                  }
                                  openManualAcceptanceChoice(item.id);
                                }}
                                disabled={pendingStatusRequestIds.includes(
                                  item.id,
                                )}
                                pressScale={0.97}
                                pressOpacity={0.98}
                              >
                                <Text
                                  style={
                                    styles.dayClusterPreviewDecisionAcceptText
                                  }
                                >
                                  {tApp(appLanguage, "requests_accept")}
                                </Text>
                              </HapticTouchable>
                              <HapticTouchable
                                style={[
                                  styles.dayClusterPreviewDecisionButton,
                                  styles.dayClusterPreviewDecisionReject,
                                  pendingStatusRequestIds.includes(item.id) &&
                                    styles.actionButtonDisabled,
                                ]}
                                onPress={() => rifiutaRichiesta(item.id)}
                                disabled={pendingStatusRequestIds.includes(
                                  item.id,
                                )}
                                pressScale={0.97}
                                pressOpacity={0.98}
                              >
                                <Text
                                  style={
                                    styles.dayClusterPreviewDecisionRejectText
                                  }
                                >
                                  {tApp(appLanguage, "requests_reject")}
                                </Text>
                              </HapticTouchable>
                            </View>
                            {shouldOfferAdvancedManualAcceptance(item.id) ? (
                              <HapticTouchable
                                style={[
                                  styles.compactDecisionAdvanced,
                                  styles.dayClusterPreviewDecisionAdvanced,
                                  pendingStatusRequestIds.includes(item.id) &&
                                    styles.actionButtonDisabled,
                                ]}
                                onPress={() =>
                                  openManualAcceptanceChoice(item.id)
                                }
                                disabled={pendingStatusRequestIds.includes(
                                  item.id,
                                )}
                                pressScale={0.98}
                                pressOpacity={0.98}
                              >
                                <View
                                  style={styles.compactDecisionAdvancedCopy}
                                >
                                  <Text
                                    style={styles.compactDecisionAdvancedTitle}
                                  >
                                    Accetta e modifica
                                  </Text>
                                  <Text
                                    style={styles.compactDecisionAdvancedHint}
                                  >
                                    Operatore o durata
                                  </Text>
                                </View>
                                <Ionicons
                                  name="chevron-forward"
                                  size={16}
                                  color={premiumRequestsPalette.ink}
                                />
                              </HapticTouchable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {isExpanded ? (
                  <View style={styles.dayClusterExpanded}>
                    {group.items.map((item) => {
                      const historyLabel =
                        item.operatorChangeStatus === "pending"
                          ? "Attesa conferma cliente"
                          : item.operatorChangeStatus === "rejected"
                            ? "Cambio operatore rifiutato"
                            : item.operatorChangeStatus === "expired"
                              ? "Conferma cambio scaduta"
                              : item.stato === "Annullata"
                                ? isCancelledBySalon(item)
                                  ? "Annullata dal salone"
                                  : "Annullata dal cliente"
                                : item.stato;

                      const historyDanger =
                        item.stato === "Rifiutata" ||
                        (item.stato === "Annullata" &&
                          (variant === "history" || isCancelledBySalon(item)));
                      const autoAcceptRemainingSeconds =
                        variant === "pending" &&
                        displayedAutoAcceptBookingRequests &&
                        !item.appointmentGroupId?.trim()
                          ? getAutoAcceptRemainingSeconds(item, autoAcceptNowMs)
                          : null;

                      return (
                        <Animated.View
                          key={item.id}
                          ref={(node) =>
                            registerRequestCardRef(
                              String(item.id ?? "").trim(),
                              node as unknown as View | null,
                            )
                          }
                          layout={LinearTransition.duration(170).easing(
                            Easing.out(Easing.cubic),
                          )}
                          style={styles.compactRequestCard}
                        >
                          <View style={styles.compactRequestTopRow}>
                            <View style={styles.compactRequestTitleWrap}>
                              <Text
                                style={styles.compactRequestName}
                                numberOfLines={IS_WEB ? undefined : 1}
                              >
                                {item.nome} {item.cognome}
                              </Text>
                              <Text
                                style={styles.compactRequestService}
                                numberOfLines={IS_WEB ? undefined : 1}
                              >
                                {item.servizio}
                                {getRequestGroupPhaseLabel(item)}
                              </Text>
                              {item.operatoreNome ? (
                                <Text
                                  style={styles.compactRequestMeta}
                                  numberOfLines={1}
                                >
                                  {item.operatoreNome}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.compactStatusWrap}>
                              <View style={styles.compactTimePill}>
                                <Ionicons
                                  name="time-outline"
                                  size={13}
                                  color={premiumRequestsPalette.ink}
                                />
                                <Text style={styles.compactTimePillText}>
                                  {item.ora}
                                </Text>
                              </View>
                              {autoAcceptRemainingSeconds !== null ? (
                                <View style={styles.compactCountdownBadge}>
                                  <Ionicons
                                    name="timer-outline"
                                    size={12}
                                    color="#0f766e"
                                  />
                                  <Text
                                    style={styles.compactCountdownBadgeText}
                                  >
                                    {autoAcceptRemainingSeconds}s
                                  </Text>
                                </View>
                              ) : null}
                              <View
                                style={[
                                  styles.compactStatusBadge,
                                  variant === "pending" &&
                                  item.stato !== "Annullata"
                                    ? styles.compactStatusBadgePending
                                    : historyDanger
                                      ? styles.compactStatusBadgeDanger
                                      : styles.compactStatusBadgeSuccess,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.compactStatusBadgeText,
                                    variant === "pending" &&
                                    item.stato !== "Annullata"
                                      ? styles.compactStatusBadgeTextPending
                                      : historyDanger
                                        ? styles.compactStatusBadgeTextDanger
                                        : styles.compactStatusBadgeTextSuccess,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {variant === "pending"
                                    ? item.stato === "Annullata"
                                      ? "Annullata"
                                      : "In attesa"
                                    : historyLabel}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View style={styles.compactSummaryRow}>
                            <View style={styles.compactInfoPill}>
                              <Ionicons
                                name="calendar-outline"
                                size={13}
                                color={premiumRequestsPalette.ink}
                              />
                              <Text
                                style={styles.compactInfoPillValue}
                                numberOfLines={IS_WEB ? undefined : 1}
                              >
                                {formatDateLong(item.data)}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.compactInfoPill,
                                styles.compactInfoPillPrice,
                              ]}
                            >
                              <Ionicons
                                name="card-outline"
                                size={13}
                                color={premiumRequestsPalette.ink}
                              />
                              <Text style={styles.compactInfoPillValue}>
                                € {item.prezzo.toFixed(2)}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={styles.compactContactLine}
                            numberOfLines={1}
                          >
                            {item.telefono}
                            {item.email ? ` · ${item.email}` : ""}
                          </Text>

                          {visibleRequestNote(item.note) ? (
                            <View style={styles.compactNoteBox}>
                              <Ionicons
                                name="chatbubble-ellipses-outline"
                                size={13}
                                color={premiumRequestsPalette.ink}
                              />
                              <Text
                                style={styles.compactNoteText}
                                numberOfLines={2}
                              >
                                {visibleRequestNote(item.note)}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.compactActionsRow}>
                            <HapticTouchable
                              style={styles.compactActionChip}
                              onPress={() =>
                                openExternalUrl(
                                  `tel:${buildDialablePhone(item.telefono)}`,
                                )
                              }
                              pressScale={0.97}
                              pressOpacity={0.98}
                            >
                              <Text style={styles.compactActionChipText}>
                                Chiama
                              </Text>
                            </HapticTouchable>
                            <HapticTouchable
                              style={[
                                styles.compactActionChip,
                                styles.compactActionChipWhatsapp,
                              ]}
                              onPress={() =>
                                openExternalUrl(buildWhatsappUrl(item.telefono))
                              }
                              pressScale={0.97}
                              pressOpacity={0.98}
                            >
                              <Text
                                style={[
                                  styles.compactActionChipText,
                                  styles.compactActionChipWhatsappText,
                                ]}
                              >
                                WhatsApp
                              </Text>
                            </HapticTouchable>
                            {item.instagram ? (
                              <HapticTouchable
                                style={[
                                  styles.compactActionChip,
                                  styles.compactActionChipInstagram,
                                ]}
                                onPress={() =>
                                  openExternalUrl(
                                    buildInstagramUrl(item.instagram),
                                  )
                                }
                                pressScale={0.97}
                                pressOpacity={0.98}
                              >
                                <Text
                                  style={[
                                    styles.compactActionChipText,
                                    styles.compactActionChipInstagramText,
                                  ]}
                                >
                                  Instagram
                                </Text>
                              </HapticTouchable>
                            ) : null}
                          </View>

                          {variant === "pending" &&
                          item.stato !== "Annullata" ? (
                            <View style={styles.compactDecisionBlock}>
                              {autoAcceptRemainingSeconds !== null ? (
                                <View style={styles.compactCountdownInlineCard}>
                                  <Text
                                    style={styles.compactCountdownInlineEyebrow}
                                  >
                                    AUTO-ACCETTAZIONE LIVE
                                  </Text>
                                  <Text
                                    style={styles.compactCountdownInlineText}
                                  >
                                    Accettazione automatica tra{" "}
                                    {autoAcceptRemainingSeconds}{" "}
                                    {autoAcceptRemainingSeconds === 1
                                      ? "secondo"
                                      : "secondi"}
                                  </Text>
                                </View>
                              ) : null}
                              <View style={styles.compactDecisionRow}>
                                <HapticTouchable
                                  style={[
                                    styles.compactDecisionPrimary,
                                    pendingStatusRequestIds.includes(item.id) &&
                                      styles.actionButtonDisabled,
                                  ]}
                                  onPress={() => {
                                    if (
                                      shouldOfferAdvancedManualAcceptance(
                                        item.id,
                                      )
                                    ) {
                                      accettaRichiesta(item.id);
                                      return;
                                    }
                                    openManualAcceptanceChoice(item.id);
                                  }}
                                  disabled={pendingStatusRequestIds.includes(
                                    item.id,
                                  )}
                                  pressScale={0.975}
                                  pressOpacity={0.98}
                                >
                                  <Text
                                    style={styles.compactDecisionPrimaryText}
                                  >
                                    {tApp(appLanguage, "requests_accept")}
                                  </Text>
                                </HapticTouchable>
                                <HapticTouchable
                                  style={[
                                    styles.compactDecisionSecondary,
                                    pendingStatusRequestIds.includes(item.id) &&
                                      styles.actionButtonDisabled,
                                  ]}
                                  onPress={() => rifiutaRichiesta(item.id)}
                                  disabled={pendingStatusRequestIds.includes(
                                    item.id,
                                  )}
                                  pressScale={0.975}
                                  pressOpacity={0.98}
                                >
                                  <Text
                                    style={styles.compactDecisionSecondaryText}
                                  >
                                    {tApp(appLanguage, "requests_reject")}
                                  </Text>
                                </HapticTouchable>
                              </View>
                              {shouldOfferAdvancedManualAcceptance(item.id) ? (
                                <HapticTouchable
                                  style={[
                                    styles.compactDecisionAdvanced,
                                    pendingStatusRequestIds.includes(item.id) &&
                                      styles.actionButtonDisabled,
                                  ]}
                                  onPress={() =>
                                    openManualAcceptanceChoice(item.id)
                                  }
                                  disabled={pendingStatusRequestIds.includes(
                                    item.id,
                                  )}
                                  pressScale={0.98}
                                  pressOpacity={0.98}
                                >
                                  <View
                                    style={styles.compactDecisionAdvancedCopy}
                                  >
                                    <Text
                                      style={
                                        styles.compactDecisionAdvancedTitle
                                      }
                                    >
                                      Accetta e modifica
                                    </Text>
                                    <Text
                                      style={styles.compactDecisionAdvancedHint}
                                    >
                                      Cambia operatore o riduci orario
                                    </Text>
                                  </View>
                                  <Ionicons
                                    name="chevron-forward"
                                    size={17}
                                    color={premiumRequestsPalette.ink}
                                  />
                                </HapticTouchable>
                              ) : null}
                            </View>
                          ) : null}
                        </Animated.View>
                      );
                    })}
                  </View>
                ) : null}
              </Animated.View>
            );
          })()}
        </View>
      ))}
    </View>
  );

  const workspaceSectionMeta: Record<string, { title: string; count: number }> = {
    pending: { title: "Richieste recenti", count: richiesteInAttesaRecenti.filter(item => item.stato === "In attesa").length },
    customerConfirmation: { title: "In attesa conferma cliente", count: richiesteInAttesaConfermaCliente.length },
    accepted: { title: "Confermate recenti", count: richiesteAccettateRecenti.length },
    cancelled: { title: "Annullate cliente recenti", count: richiesteAnnullateClienteRecenti.length },
    salonDeclined: { title: "Annullate salone recenti", count: richiesteCancellateORifiutateDalSaloneRecenti.length },
  };
  const activeSectionMeta = workspaceSectionMeta[workspaceSection];
  // Reserve the hero, navigation and booking-rules card before allocating rows.
  const inlineRequestCapacity = Math.max(1, Math.floor((height - (responsive.width >= 1000 ? 480 : 820)) / 210));
  const requestListInPopup = IS_WEB && Boolean(expandedSections[workspaceSection]) && Boolean(activeSectionMeta && activeSectionMeta.count > inlineRequestCapacity);
  const requestSectionPanels:Record<string,()=>React.ReactNode>={};
  const selectWorkspaceSection=(key:string)=>{
    if(workspaceSection!==key&&expandedSections[workspaceSection])toggleSection(workspaceSection);
    setWorkspaceSection(key);
    toggleSection(key);
  };
  const renderAccordionSection = ({
    sectionKey,
    title,
    count,
    unreadCount = 0,
    groups,
    variant,
    emptyText,
    emptyHint,
    accent = "default",
    titleStyle,
    onMarkAllRead,
    children,
  }: {
    sectionKey: string;
    title: string;
    count: number;
    unreadCount?: number;
    groups: RequestGroup[];
    variant: "pending" | "history";
    emptyText: string;
    emptyHint: string;
    accent?: "default" | "danger" | "warning" | "success" | "info";
    titleStyle?: object;
    onMarkAllRead?: () => void | Promise<void>;
    children?: React.ReactNode | (() => React.ReactNode);
  }) => {
    const expanded = expandedSections[sectionKey] ?? false;

    const renderSectionContent = () => count === 0 ? (
      <View style={styles.accordionEmpty}>
        <Text style={styles.emptyTitle}>{emptyText}</Text>
        <Text style={styles.emptyText}>{emptyHint}</Text>
      </View>
    ) : typeof children === "function" ? children() : (children ?? renderDateGroups(sectionKey, groups, variant));

    requestSectionPanels[sectionKey]=renderSectionContent;

    if (ownerStartupLoading) {
      return (
        <View
          style={[
            styles.accordionSection,
            responsive.isDesktop && styles.wideCard,
            IS_WEB && styles.webAccordionSection,
          ]}
        >
          <OwnerStartupSkeletonPulse style={styles.ownerStartupRequestCard}>
            <OwnerStartupSkeletonItem style={styles.ownerStartupRequestTitle} />
            <OwnerStartupSkeletonItem style={styles.ownerStartupRequestCount} />
          </OwnerStartupSkeletonPulse>
        </View>
      );
    }

    return (
      <View
        {...(IS_WEB?({dataSet:{salonHoverGroup:"true"}} as any):{})}
        {...getWebExpandableCardProps(
          () => selectWorkspaceSection(sectionKey),
          { expanded },
        )}
        onLayout={
          sectionKey === "cancelled"
            ? (event) => {
                cancelledSectionYRef.current = event.nativeEvent.layout.y;
              }
            : undefined
        }
        style={[
          styles.accordionSection,
          responsive.isDesktop && styles.wideCard,
          IS_WEB && styles.webAccordionSection,
          {marginBottom:0,paddingHorizontal:8,paddingVertical:1,borderRadius:13,borderWidth:0,borderTopWidth:0,backgroundColor:workspaceSection===sectionKey&&expanded?premiumRequestsPalette.night?"rgba(216,194,155,.10)":"rgba(189,165,127,.16)":"transparent",minHeight:52,shadowOpacity:0,elevation:0},
        ]}
      >
        {unreadCount > 0 ? (
          <View pointerEvents="none" style={styles.accordionUnreadBadgeFloating}>
            <Text style={styles.accordionUnreadBadgeText}>+{unreadCount > 99 ? "99" : unreadCount}</Text>
          </View>
        ) : null}
        <View style={styles.nativeSectionHeader}>
            {onMarkAllRead && unreadCount > 0 ? (
              <MarkAllReadButton
                tone={{ink:premiumRequestsPalette.ink,fill:premiumRequestsPalette.field,border:premiumRequestsPalette.border}}
                count={unreadCount}
                onPress={onMarkAllRead}
                label="Segna come letti"
                iconOnly
              />
            ) : null}
            <HapticTouchable
              immediatePress
              onPress={() => selectWorkspaceSection(sectionKey)}
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? "Chiudi" : "Apri"} ${title}, ${count}`}
              accessibilityState={{ expanded }}
              style={styles.nativeSectionToggle}
            >
              <View style={[styles.nativeSectionHeading,{flexDirection:'row',alignItems:'center',gap:10}]}>
                <NativeMedal icon={({pending:'notifications-outline',customerConfirmation:'hourglass-outline',accepted:'checkmark-done-outline',cancelled:'person-remove-outline',salonDeclined:'storefront-outline',archive:'archive-outline'} as Record<string,React.ComponentProps<typeof Ionicons>['name']>)[sectionKey]??'albums-outline'} size={34} iconSize={16}/>
                <PremiumFitLabel fontSize={13} minFontSize={11} style={[styles.accordionTitle,{lineHeight:18,fontWeight:"500"}]}>{title}</PremiumFitLabel>
              </View>
              {unreadCount > 0 ? <Text style={styles.nativeSectionUnread}>{unreadCount} da leggere</Text> : null}
            </HapticTouchable>

                <Text style={[styles.nativeSectionCountText,{minWidth:24,textAlign:'right',fontSize:14,color:count>0&&sectionKey==='pending'?(premiumRequestsPalette.night?'#E2CFAA':'#7A5F38'):premiumRequestsPalette.muted}]}>{count}</Text>
            <HapticTouchable
              immediatePress
              onPress={() => selectWorkspaceSection(sectionKey)}
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? "Chiudi" : "Apri"} ${title}`}
              accessibilityState={{ expanded }}
              style={styles.nativeSectionChevron}
            >
              <Ionicons name="chevron-forward" size={18} color={premiumRequestsPalette.muted} />
            </HapticTouchable>
          </View>

      </View>
    );
  };

  const selectedLogicalMembers = selectedRequest
    ? (
        selectedRequest.appointmentGroupId?.trim()
          ? richiestePrenotazione.filter(
              (item) =>
                item.appointmentGroupId?.trim() ===
                  selectedRequest.appointmentGroupId?.trim() &&
                item.stato === selectedRequest.stato,
            )
          : [selectedRequest]
      ).sort(
        (left, right) =>
          (left.appointmentGroupOrder ?? 0) -
            (right.appointmentGroupOrder ?? 0) ||
          `${left.data} ${left.ora}`.localeCompare(`${right.data} ${right.ora}`),
      )
    : [];
  const selectedLogicalTitle =
    selectedLogicalMembers.length > 1
      ? selectedLogicalMembers.map((item) => item.servizio).join(" + ")
      : (selectedRequest?.servizio ?? "");
  const selectedLogicalHasPhases = selectedLogicalMembers.some((member) =>
    Boolean(normalizeServicePhaseConfig(member.phaseConfig)),
  );
  const selectedLogicalHasComposition = selectedLogicalMembers.some((member) =>
    Boolean(member.compositionId?.trim()),
  ) ||
    (!!selectedRequest?.appointmentGroupId?.trim() &&
      requestAppointmentGroupKinds[selectedRequest.appointmentGroupId.trim()] ===
        "composition");
  const selectedLogicalHasDependency = selectedLogicalMembers.some((member) =>
    Boolean(member.dependencyServiceId?.trim()),
  ) ||
    (!!selectedRequest?.appointmentGroupId?.trim() &&
      requestAppointmentGroupKinds[selectedRequest.appointmentGroupId.trim()] ===
        "dependency");
  const selectedLogicalKindLabel = selectedLogicalHasPhases
    ? "PERCORSO CON POSA"
    : selectedLogicalHasComposition
      ? "COMPOSIZIONE"
      : selectedLogicalHasDependency
        ? "SERVIZI COLLEGATI"
        : "COMBO";
  const selectedLogicalKindIcon = selectedLogicalHasPhases
    ? ("hourglass-outline" as const)
    : selectedLogicalHasComposition
      ? ("layers-outline" as const)
      : ("git-branch-outline" as const);
  const selectedRequestDuration = selectedRequest
    ? String(
        selectedLogicalMembers.reduce(
          (total, member) =>
            total + Math.max(0, Number(member.durataMinuti) || 0),
          0,
        ) ||
          (selectedRequest as {
            durata?: string | number;
            duration?: string | number;
          }).durata ||
          (selectedRequest as { duration?: string | number }).duration ||
          "",
      ).trim()
    : "";
  const selectedRequestStatus =
    selectedRequest?.operatorChangeStatus === "pending"
      ? "Attesa conferma cliente"
      : selectedRequest?.operatorChangeStatus === "rejected"
        ? "Cambio operatore rifiutato"
        : selectedRequest?.operatorChangeStatus === "expired"
          ? "Conferma cambio scaduta"
          : selectedRequest?.stato === "Annullata"
            ? selectedRequest && isCancelledBySalon(selectedRequest)
              ? "Annullata dal salone"
              : "Annullata dal cliente"
            : (selectedRequest?.stato ?? "");
  const manualAcceptChoiceConfig = manualAcceptChoiceRequestId
    ? getManualAcceptanceConfig(manualAcceptChoiceRequestId)
    : null;
  const manualAcceptDurationConfig = manualAcceptDurationRequestId
    ? getManualAcceptanceConfig(manualAcceptDurationRequestId)
    : null;
  const manualAcceptOperatorConfig =
    manualAcceptChoiceConfig ?? manualAcceptDurationConfig;
  const selectedManualAcceptOperator =
    manualAcceptOperatorConfig?.operatorOptions.find(
      (item) => item.available && item.operator.id === manualAcceptOperatorId,
    ) ?? null;
  const manualAcceptNeedsOperator =
    (manualAcceptOperatorConfig?.operatorOptions.length ?? 0) > 1;
  const manualAcceptPreviewEnd =
    manualAcceptDurationConfig && manualAcceptDurationPreview > 0
      ? minutesToTime(
          timeToMinutes(manualAcceptDurationConfig.request.ora) +
            manualAcceptDurationPreview,
        )
      : "";

  const bookingRulesContent=(<>
          <View style={[styles.heroCard, { marginTop: 0 }]}>
            <View style={styles.autoAcceptCard}>

              <View
                style={[
                  styles.autoAcceptHeaderRow,
                  !responsive.isDesktop && styles.autoAcceptHeaderRowCompact,
                ]}
              >
                <NativeMedal icon="flash-outline" size={40} iconSize={18}/>
                <View style={styles.autoAcceptHeaderTextWrap}>
                  <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
                  <Text
                    style={styles.autoAcceptTitle}
                    numberOfLines={IS_WEB?undefined:2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Accettazione automatica
                  </Text>
                  <HapticTouchable accessibilityRole="button" accessibilityLabel="Come funziona Accettazione automatica" hitSlop={8} onPress={() => setBookingSettingsHelpOpen((current) => current === "auto_accept" ? null : "auto_accept")} style={{width:24,height:24,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:premiumRequestsPalette.field}}><Ionicons name="information" size={14} color={premiumRequestsPalette.muted}/></HapticTouchable>
                  </View>
                  <Text
                    style={styles.autoAcceptHint}
                    numberOfLines={IS_WEB?undefined:3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Accetta automaticamente le richieste rimaste in attesa dopo
                    15 secondi.
                  </Text>
                  {autoAcceptAuthorityConfirmed &&
                  !autoAcceptControlBusy &&
                  displayedAutoAcceptBookingRequests &&
                  nextAutoAcceptRemainingSeconds !== null ? (
                    <View style={styles.autoAcceptLiveRow}>
                      <Ionicons
                        name="timer-outline"
                        size={14}
                        color="#0f766e"
                      />
                      <Text style={styles.autoAcceptLiveText}>
                        Prossima accettazione tra{" "}
                        {nextAutoAcceptRemainingSeconds}{" "}
                        {nextAutoAcceptRemainingSeconds === 1
                          ? "secondo"
                          : "secondi"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.autoAcceptBadge,
                    displayedAutoAcceptBookingRequests
                      ? styles.autoAcceptBadgeOn
                      : styles.autoAcceptBadgeOff,
                  ]}
                >
                  <Text
                    numberOfLines={IS_WEB?undefined:1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                    style={[
                      styles.autoAcceptBadgeText,
                      displayedAutoAcceptBookingRequests
                        ? styles.autoAcceptBadgeTextOn
                        : styles.autoAcceptBadgeTextOff,
                    ]}
                  >
                    {displayedAutoAcceptBookingRequests
                      ? "Attivo"
                      : "Disattivato"}
                  </Text>
                </View>
              </View>



              <HapticTouchable webHoverLift accessibilityRole="switch"
                style={[
                  styles.autoAcceptToggle,
                  autoAcceptAuthorityConfirmed &&
                  !autoAcceptControlBusy &&
                  displayedAutoAcceptBookingRequests
                    ? styles.autoAcceptToggleOn
                    : styles.autoAcceptToggleOff,
                  (autoAcceptControlBusy || !autoAcceptAuthorityConfirmed) &&
                    styles.autoAcceptToggleBusy,
                ]}
                onPress={() => {
                  if (
                    autoAcceptConfirmOpenRef.current ||
                    autoAcceptControlBusy ||
                    !autoAcceptAuthorityConfirmed
                  ) {
                    return;
                  }

                  autoAcceptConfirmOpenRef.current = true;
                  const nextValue = !displayedAutoAcceptBookingRequests;
                  const title = nextValue
                    ? "Attivare accettazione automatica?"
                    : "Disattivare accettazione automatica?";
                  const body = nextValue
                    ? "Le nuove richieste in attesa verranno accettate automaticamente dopo 15 secondi."
                    : "Le richieste torneranno in gestione manuale e non verranno piu accettate in automatico.";

                  confirmOwnerWebAction(
                    title,
                    body,
                    async () => {
                      setAutoAcceptSaving(true);
                      if (autoAcceptDisplaySyncTimerRef.current) {
                        clearTimeout(autoAcceptDisplaySyncTimerRef.current);
                        autoAcceptDisplaySyncTimerRef.current = null;
                      }
                      if (autoAcceptPendingDesiredTimeoutRef.current) {
                        clearTimeout(
                          autoAcceptPendingDesiredTimeoutRef.current,
                        );
                        autoAcceptPendingDesiredTimeoutRef.current = null;
                      }
                      autoAcceptPendingDesiredRef.current = null;
                      clearAllAutoAcceptTimers();

                      try {
                        const result =
                          await setWorkspaceAutoAcceptBookingRequestsPersisted(
                            nextValue,
                          );
                        const hasConfirmedValue =
                          typeof result.value === "boolean";
                        if (hasConfirmedValue) {
                          setDisplayedAutoAcceptBookingRequests(result.value!);
                          const confirmedUpdatedAtMs = Date.parse(
                            result.updatedAt ?? "",
                          );
                          autoAcceptLastAcceptedUpdatedAtRef.current =
                            Number.isFinite(confirmedUpdatedAtMs)
                              ? confirmedUpdatedAtMs
                              : Date.now();
                          autoAcceptStableUntilRef.current =
                            Date.now() + PRENOTAZIONI_CONTROL_STABLE_MS;
                        }
                        setAutoAcceptAuthorityConfirmed(hasConfirmedValue);

                        if (!result.ok) {
                          const errorMessage =
                            result.error ??
                            "Il server non ha confermato la modifica.";
                          if (IS_WEB && typeof window !== "undefined") {
                            window.alert(errorMessage);
                          } else {
                            Alert.alert(
                              "Impostazione non salvata",
                              errorMessage,
                            );
                          }
                          return;
                        }

                        haptic.light().catch(() => null);
                      } finally {
                        setAutoAcceptSaving(false);
                      }
                    },
                    () => {
                      autoAcceptConfirmOpenRef.current = false;
                    },
                  );
                }}
                disabled={autoAcceptControlBusy || !autoAcceptAuthorityConfirmed}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                {autoAcceptSaving ? <ActivityIndicator size="small" color={premiumRequestsPalette.ink} /> : <View style={{width:24,height:24,borderRadius:12,backgroundColor:displayedAutoAcceptBookingRequests?"#F4EFE6":premiumRequestsPalette.muted,alignSelf:displayedAutoAcceptBookingRequests?"flex-end":"flex-start",shadowColor:"#000",shadowOpacity:.25,shadowRadius:3,shadowOffset:{width:0,height:1}}} />}
              </HapticTouchable>
              {bookingSettingsHelpOpen === "auto_accept" ? (
                <View style={{marginTop:14}}><BookingSettingsHowItWorks section="auto_accept" onClose={() => setBookingSettingsHelpOpen(null)} /></View>
              ) : null}
            </View>

            <View style={styles.autoAcceptCard}>

              <View
                style={[
                  styles.autoAcceptHeaderRow,
                  !responsive.isDesktop && styles.autoAcceptHeaderRowCompact,
                ]}
              >
                <NativeMedal icon="sparkles-outline" size={40} iconSize={18}/>
                <View style={styles.autoAcceptHeaderTextWrap}>
                  <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
                  <Text
                    style={styles.autoAcceptTitle}
                    numberOfLines={IS_WEB?undefined:2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Slot guidati
                  </Text>
                  <HapticTouchable accessibilityRole="button" accessibilityLabel="Come funzionano gli Slot guidati" hitSlop={8} onPress={() => setBookingSettingsHelpOpen((current) => current === "guided_slots" ? null : "guided_slots")} style={{width:24,height:24,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:premiumRequestsPalette.field}}><Ionicons name="information" size={14} color={premiumRequestsPalette.muted}/></HapticTouchable>
                  </View>
                  <Text
                    style={styles.autoAcceptHint}
                    numberOfLines={IS_WEB?undefined:4}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Propone prima gli orari migliori, protegge lo spazio per i
                    servizi lunghi e inserisce meglio quelli brevi.
                  </Text>
                </View>
                <View
                  style={[
                    styles.autoAcceptBadge,
                    displayedGuidedSlotsEnabled
                      ? styles.autoAcceptBadgeOn
                      : styles.autoAcceptBadgeOff,
                  ]}
                >
                  <Text
                    numberOfLines={IS_WEB?undefined:1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                    style={[
                      styles.autoAcceptBadgeText,
                      displayedGuidedSlotsEnabled
                        ? styles.autoAcceptBadgeTextOn
                        : styles.autoAcceptBadgeTextOff,
                    ]}
                  >
                    {guidedSaving ? "Salvataggio…" : displayedGuidedSlotsEnabled ? "Attivi" : "Disattivati"}
                  </Text>
                </View>
              </View>



              <HapticTouchable webHoverLift accessibilityRole="switch"
                style={[
                  styles.autoAcceptToggle,
                  displayedGuidedSlotsEnabled
                    ? styles.autoAcceptToggleOn
                    : styles.autoAcceptToggleOff,
                ]}
                disabled={guidedSaving}
                accessibilityState={{ disabled: guidedSaving, busy: guidedSaving }}
                onPress={() => {
                  if (guidedSaveLockRef.current || guidedConfirmOpenRef.current) return;
                  guidedConfirmOpenRef.current = true;
                  const nextValue = !displayedGuidedSlotsEnabled;
                  const title = nextValue
                    ? "Attivare slot guidati?"
                    : "Disattivare slot guidati?";
                  const body = nextValue
                    ? "Si attiva Consigliati intelligenti con Consigliati + tutti e un passo cliente adatto ai servizi online, rispettando la griglia Agenda. Puoi cambiare la visualizzazione e il passo in seguito."
                    : "Il cliente torna agli orari standard. Il passo precedente viene ripristinato solo se non lo hai cambiato a mano.";

                  confirmOwnerWebAction(title, body, async () => {
                    await updateGuidedSlotsSettings((current) => nextValue
                      ? activateIntelligentGuidedSlots(current, servizi)
                      : { ...current, guidedSlotsEnabled: false });
                  }, () => { guidedConfirmOpenRef.current = false; });
                }}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                {guidedSaving ? <ActivityIndicator size="small" color={premiumRequestsPalette.ink} /> : <View style={{width:24,height:24,borderRadius:12,backgroundColor:displayedGuidedSlotsEnabled?"#F4EFE6":premiumRequestsPalette.muted,alignSelf:displayedGuidedSlotsEnabled?"flex-end":"flex-start",shadowColor:"#000",shadowOpacity:.25,shadowRadius:3,shadowOffset:{width:0,height:1}}} />}
              </HapticTouchable>
              {bookingSettingsHelpOpen === "guided_slots" ? (
                <View style={{marginTop:14}}><BookingSettingsHowItWorks section="guided_slots" onClose={() => setBookingSettingsHelpOpen(null)} /></View>
              ) : null}

              {(() => {
                // Two configuration panels as icon tiles: one row per panel on wide web, a compact list in the app.
                const rp = premiumRequestsPalette;
                const tilesInRow = IS_WEB && responsive.width >= 1000;
                // Muted bronze: the selection accent, neither yellow nor white.
                const bronze = rp.night ? "#9C8461" : "#7A6446";
                const disabled = !displayedGuidedSlotsEnabled || guidedSaving;
                type GuidedOption = { key: string; label: string; hint: string; icon: React.ComponentProps<typeof Ionicons>["name"]; recommended?: boolean };
                const strategyOptions: GuidedOption[] = [
                  { key: "intelligent", label: "Consigliati intelligenti", icon: "sparkles-outline", recommended: true, hint: "Confronta spazi liberi e durata dei servizi online per ridurre i buchi." },
                  { key: "balanced", label: "Equilibrata", icon: "git-compare-outline", hint: "Distribuisce gli appuntamenti in modo uniforme." },
                  { key: "protect_long_services", label: "Proteggi lunghi", icon: "hourglass-outline", hint: "Tiene spazio libero per i servizi lunghi." },
                  { key: "fill_gaps", label: "Riempi buchi", icon: "grid-outline", hint: "Privilegia gli spazi liberi tra gli appuntamenti." },
                ];
                const visibilityOptions: GuidedOption[] = [
                  { key: "recommended_and_all", label: "Consigliati + tutti", icon: "albums-outline", recommended: displayedGuidedSlotsStrategy === "intelligent", hint: "I consigliati in evidenza, insieme a tutti gli orari." },
                  { key: "recommended_first", label: "Prima i consigliati", icon: "trending-up-outline", hint: "Mostra per primi gli orari consigliati." },
                  { key: "recommended_only", label: "Solo consigliati", icon: "star-outline", hint: "Il cliente vede soltanto gli orari consigliati." },
                ];
                const tile = (option: GuidedOption, active: boolean, onSelect: () => void, count: number) => (
                  <HapticTouchable webHoverLift
                    key={option.key}
                    accessibilityRole="radio"
                    accessibilityLabel={`${option.label}. ${option.hint}`}
                    accessibilityState={{ checked: active, disabled }}
                    disabled={disabled}
                    onPress={() => { if (!disabled && !active) onSelect(); }}
                    pressScale={0.98}
                    pressOpacity={0.95}
                    style={{
                      flexBasis: tilesInRow ? `${100 / count - 2}%` : "100%",
                      flexGrow: 1,
                      minWidth: 0,
                      flexDirection: tilesInRow ? "column" : "row",
                      alignItems: tilesInRow ? "flex-start" : "center",
                      gap: tilesInRow ? 12 : 12,
                      padding: tilesInRow ? 16 : 13,
                      minHeight: tilesInRow ? 150 : 64,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? bronze : rp.line,
                      backgroundColor: active ? (rp.night ? "rgba(156,132,97,.10)" : "rgba(122,100,70,.07)") : (rp.night ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.4)"),
                      opacity: disabled ? 0.5 : 1,
                      shadowColor: "#000",
                      shadowOpacity: active ? (rp.night ? 0.35 : 0.08) : 0,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    <NativeMedal icon={option.icon} size={tilesInRow ? 40 : 36} iconSize={tilesInRow ? 18 : 16} />
                    <View style={{ flex: tilesInRow ? undefined : 1, minWidth: 0, gap: 3 }}>
                      <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "600", color: rp.ink }}>{option.label}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: rp.muted }}>{option.hint}</Text>
                      {option.recommended ? <Text style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.8, fontWeight: "600", color: rp.muted, textTransform: "uppercase", marginTop: 2 }}>Consigliata</Text> : null}
                    </View>
                    <View style={[{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: active ? bronze : rp.border }, tilesInRow ? { position: "absolute", top: 14, right: 14 } : null]}>
                      {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bronze }} /> : null}
                    </View>
                  </HapticTouchable>
                );
                const panel = (title: string, subtitle: string, options: GuidedOption[], activeKey: string, onSelect: (key: string) => void) => (
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: "600", color: rp.ink }}>{title}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: rp.muted }}>{subtitle}</Text>
                    </View>
                    <View style={{ flexDirection: tilesInRow ? "row" : "column", flexWrap: tilesInRow ? "nowrap" : "nowrap", gap: tilesInRow ? 12 : 8 }}>
                      {options.map((option) => tile(option, activeKey === option.key, () => onSelect(option.key), options.length))}
                    </View>
                  </View>
                );
                return (
                  <View style={{ marginTop: 18, paddingTop: 18, gap: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: rp.line }}>
                    {panel("Strategia del salone", "Come l’agenda sceglie gli orari da proporre ai clienti.", strategyOptions, displayedGuidedSlotsStrategy, (key) =>
                      updateGuidedSlotsSettings((current) => key === "intelligent"
                        ? activateIntelligentGuidedSlots(current, servizi)
                        : ({ ...current, guidedSlotsStrategy: key as typeof displayedGuidedSlotsStrategy })))}
                    {panel("Orari visibili al cliente", displayedGuidedSlotsStrategy === "intelligent" ? "Consigliati + tutti è la scelta predefinita; puoi renderla più restrittiva." : "Cosa vede il cliente quando sceglie l’orario.", visibilityOptions, displayedGuidedSlotsVisibility, (key) =>
                      updateGuidedSlotsSettings((current) => ({ ...current, guidedSlotsVisibility: key as typeof displayedGuidedSlotsVisibility })))}
                  </View>
                );
              })()}
            </View>
          </View>

          {/* Same frame as the rule cards above, so all three share one width. */}
          <View style={[styles.heroCard, { marginTop: 0 }]}>
            <CustomerCancellationSettings premiumNative key={salonWorkspace.salonCode} salonCode={salonWorkspace.salonCode} />
          </View>
</>);
  return (
    <NativePremiumScope.Provider value={true}><HapticTouchableFastRegion enabled={!IS_WEB}>
      <ScrollView
        {...(Platform.OS==='web'?({dataSet:{premiumPageScroll:"true"}} as any):{})}
        ref={scrollRef}
        style={styles.container}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          Platform.OS==='web'?{paddingBottom:responsive.width<1000?80:24,paddingTop:24,paddingHorizontal:24}:null,
          { paddingHorizontal: IS_WEB?24:responsive.horizontalPadding },
          Platform.OS!=='web'&&{paddingTop:Math.max(nativeScreenInsets.top,12),paddingBottom:nativeScreenInsets.bottom+112},
        ]}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={(event) => {
          if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
            prenotazioniPerfCountersRef.current.scrollEvents += 1;
          }
          markVisibleOpenRequestCardsAsViewedAfterScroll(
            event.nativeEvent.contentOffset.y,
          );
        }}
        scrollEventThrottle={128}
      >
        <View
          style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}
          onLayout={() => {
            if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
              prenotazioniPerfCountersRef.current.layoutEvents += 1;
            }
          }}
        >
          {!IS_WEB ? <NativeRequestsHeader today={getTodayDateString()} pending={shouldHoldRequestStats?'—':String(richiesteDaAccettare.length)} handled={shouldHoldRequestStats?'—':String(richiesteGestite.length)} cancelledBySalon={shouldHoldRequestStats?'—':String(richiesteCancellateORifiutateDalSaloneRecenti.length)} cancelledByClient={shouldHoldRequestStats?'—':String(richiesteAnnullateClienteRecenti.length)} cancelled={shouldHoldRequestStats?'—':String(richiesteCancellateORifiutateDalSaloneRecenti.length+richiesteAnnullateClienteRecenti.length)}/> : (
          <View style={styles.heroCard}>
            <View style={{gap:14,marginBottom:16}}>
              {Platform.OS!=='web'&&responsive.width<1000?<View style={{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><OwnerBrandMark compact/><HapticTouchable onPress={toggleRequestsTheme} accessibilityRole="button" accessibilityLabel={premiumRequestsPalette.night?'Attiva tema chiaro':'Attiva tema scuro'} style={{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:premiumRequestsPalette.border,backgroundColor:premiumRequestsPalette.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={premiumRequestsPalette.night?'sunny-outline':'moon-outline'} size={19} color={premiumRequestsPalette.ink}/></HapticTouchable></View>:null}
              <View style={{gap:7}}><OwnerWebPageTitle>Richieste</OwnerWebPageTitle><Text style={{fontSize:13,lineHeight:19,color:premiumRequestsPalette.muted}}>Le prenotazioni, sotto controllo.</Text></View>
            </View>

            <RequestsWebSummary
              pending={shouldHoldRequestStats?'—':String(richiesteDaAccettare.length)}
              handled={shouldHoldRequestStats?'—':String(richiesteGestite.length)}
              cancelledBySalon={shouldHoldRequestStats?'—':String(richiesteCancellateORifiutateDalSaloneRecenti.length)}
              cancelledByClient={shouldHoldRequestStats?'—':String(richiesteAnnullateClienteRecenti.length)}
            />
          </View>
          )}

          <RequestsPremiumWorkspace
            autoAccept={displayedAutoAcceptBookingRequests}
            guided={displayedGuidedSlotsEnabled}
            rules={bookingRulesContent}
            navigation={<View style={{gap:0}}>
            <View
              style={{gap:0}}
            >
              {renderAccordionSection({
                sectionKey: "pending",
                title: "Richieste recenti",
                count: richiesteInAttesaRecenti.filter(
                  (item) => item.stato === "In attesa",
                ).length,
                unreadCount: unreadPendingCount,
                groups: [],
                variant: "pending",
                emptyText: tApp(appLanguage, "requests_no_pending"),
                emptyHint: "Nessuna richiesta in attesa nel mese corrente.",
                accent: "warning",
                children: () =>
                  renderDirectRequestList(
                    "pending",
                    richiesteInAttesaRecenti.filter(
                      (item) => item.stato === "In attesa",
                    ),
                    "pending",
                    unreadPendingCount,
                  ),
              })}
              {renderAccordionSection({
                sectionKey: "customerConfirmation",
                title: "In attesa conferma cliente",
                count: richiesteInAttesaConfermaCliente.length,
                unreadCount: 0,
                groups: [],
                variant: "history",
                emptyText: "Nessuna conferma in attesa",
                emptyHint:
                  "Le proposte di cambio operatore ancora da confermare compariranno qui.",
                accent: "info",
                children: () =>
                  renderDirectRequestList(
                    "customerConfirmation",
                    richiesteInAttesaConfermaCliente,
                    "history",
                  ),
              })}
              {renderAccordionSection({
                sectionKey: "accepted",
                title: "Confermate recenti",
                count: richiesteAccettateRecenti.length,
                unreadCount: unreadAcceptedCount,
                groups: [],
                variant: "history",
                emptyText: "Nessuna richiesta accettata",
                emptyHint: "Le conferme del mese corrente compariranno qui.",
                accent: "success",
                onMarkAllRead: markAcceptedRequestsAsViewed,
                children: () =>
                  renderDirectRequestList(
                    "accepted",
                    richiesteAccettateRecenti,
                    "history",
                    unreadAcceptedCount,
                  ),
              })}
              {renderAccordionSection({
                sectionKey: "cancelled",
                title: "Annullate cliente recenti",
                count: richiesteAnnullateClienteRecenti.length,
                unreadCount: unreadCancelledCount,
                groups: [],
                variant: "pending",
                emptyText: "Nessun annullamento cliente",
                emptyHint:
                  "Qui compaiono solo gli appuntamenti annullati dal cliente nel mese corrente.",
                accent: "danger",
                onMarkAllRead: markCancelledRequestsAsViewed,
                children: () =>
                  renderDirectRequestList(
                    "cancelled",
                    richiesteAnnullateClienteRecenti,
                    "history",
                    unreadCancelledCount,
                  ),
              })}
            </View>

            <View
              style={{gap:0}}
            >
              {renderAccordionSection({
                sectionKey: "salonDeclined",
                title: "Annullate salone recenti",
                count: richiesteCancellateORifiutateDalSaloneRecenti.length,
                unreadCount: unreadSalonDeclinedCount,
                groups: [],
                variant: "history",
                emptyText: "Nessuna cancellazione dal salone",
                emptyHint:
                  "Qui trovi le richieste del mese corrente che hai rifiutato o annullato tu.",
                accent: "danger",
                onMarkAllRead: markSalonDeclinedRequestsAsViewed,
                children: () =>
                  renderDirectRequestList(
                    "salonDeclined",
                    richiesteCancellateORifiutateDalSaloneRecenti,
                    "history",
                    unreadSalonDeclinedCount,
                  ),
              })}
              {renderAccordionSection({
                sectionKey: "archive",
                title: "Archivio storico",
                count: richiesteArchivioStorico.length,
                unreadCount: unreadArchiveCount,
                groups: [],
                variant: "history",
                emptyText: "Archivio storico vuoto",
                emptyHint:
                  "I mesi precedenti compariranno qui, organizzati per anno e mese.",
                accent: "info",
                onMarkAllRead: markArchivedRequestsAsViewed,
                children: () => IS_WEB ? (
                  <RequestsArchiveBrowser
                    years={richiesteArchivioPerAnno}
                    getSearchText={getArchiveSearchText}
                    renderItems={(key, items) => renderDirectRequestList(`archive:${key}`, items, "history")}
                    onScroll={markVisibleOpenRequestCardsAsViewedAfterScroll}
                    onSelectMonth={(key) => {
                      Object.keys(expandedArchiveMonths).forEach((previous) => {
                        if (previous !== key) delete requestVisualUnreadSnapshotsRef.current[`archive:${previous}`];
                      });
                      setExpandedArchiveMonths(key ? { [key]: true } : {});
                    }}
                  />
                ) : (
                  <View style={styles.archiveYearList}>
                    {richiesteArchivioPerAnno.map((yearGroup) => (
                      <View
                        key={yearGroup.year}
                        style={styles.archiveYearSection}
                      >
                        <View style={styles.archiveYearHeader}>
                          <Text style={styles.archiveYearTitle}>
                            {yearGroup.year}
                          </Text>
                          <Text style={styles.archiveYearCount}>
                            {yearGroup.count}
                          </Text>
                        </View>
                        <NotificationArchiveSearch premium
                          key={`${salonWorkspace.id}:${yearGroup.year}`}
                          items={yearGroup.months.flatMap((month) => month.items)}
                          scope={yearGroup.year}
                          getSearchText={getArchiveSearchText}
                          onSearchChange={(matchingItems, searching) => {
                            const matchingIds = new Set(matchingItems.map((item) => item.id));
                            const openMonths = new Set(yearGroup.months
                              .filter((month) => searching && month.items.some((item) => matchingIds.has(item.id)))
                              .map((month) => month.key));
                            if (IS_WEB && openMonths.size > 1) {
                              const firstMatch = openMonths.values().next().value;
                              openMonths.clear();
                              if (firstMatch) openMonths.add(firstMatch);
                            }
                            yearGroup.months.forEach((month) => {
                              if (!openMonths.has(month.key)) {
                                delete requestVisualUnreadSnapshotsRef.current[`archive:${month.key}`];
                              }
                            });
                            setExpandedArchiveMonths((current) => {
                              const next = IS_WEB ? {} as Record<string, boolean> : { ...current };
                              yearGroup.months.forEach((month) => {
                                next[month.key] = openMonths.has(month.key);
                              });
                              return next;
                            });
                          }}
                        >
                          {(yearItems) => {
                            const visibleIds = new Set(yearItems.map((item) => item.id));
                            return (
                              <View style={styles.archiveMonthList}>
                                {yearGroup.months.map((monthGroup) => {
                                  const monthItems = monthGroup.items.filter((item) => visibleIds.has(item.id));
                                  if (monthItems.length === 0) return null;
                                  const expanded =
                                    expandedArchiveMonths[monthGroup.key] ?? false;
                                  const toggleArchiveMonth = () => {
                                    if (IS_WEB) {
                                      Object.keys(expandedArchiveMonths).forEach((key) => {
                                        if (key !== monthGroup.key || expanded) {
                                          delete requestVisualUnreadSnapshotsRef.current[`archive:${key}`];
                                        }
                                      });
                                    } else if (expanded) {
                                      delete requestVisualUnreadSnapshotsRef.current[`archive:${monthGroup.key}`];
                                    }
                                    setExpandedArchiveMonths((current) => ({
                                      ...(IS_WEB ? {} : current),
                                      [monthGroup.key]: !expanded,
                                    }));
                                  };

                                  return (
                                    <View
                                      key={monthGroup.key}
                                      {...getWebExpandableCardProps(
                                        toggleArchiveMonth,
                                        { expanded },
                                      )}
                                      style={[
                                        styles.archiveMonthSection,
                                        getWebExpandableCardStyle(expanded),
                                      ]}
                                    >
                                      <View style={styles.archiveMonthHeader}>
                                        <View style={styles.archiveMonthHeaderText}>
                                          <Text style={styles.archiveMonthTitle}>
                                            {monthGroup.label}
                                          </Text>
                                        </View>
                                        <View style={styles.archiveMonthHeaderActions}>
                                          <Text
                                            style={styles.archiveMonthChevronCount}
                                          >
                                            {monthGroup.items.length}
                                          </Text>
          <PremiumExpandButton tone={{ink:premiumRequestsPalette.ink,fill:premiumRequestsPalette.field,border:premiumRequestsPalette.border}}
            salon
                                            delicate
                                            compact
                                            expanded={expanded}
                                            onPress={toggleArchiveMonth}
                                            accessibilityLabel={
                                              expanded
                                                ? `Chiudi archivio ${monthGroup.label}`
                                                : `Apri archivio ${monthGroup.label}`
                                            }
                                          />
                                        </View>
                                      </View>
                                      {expanded ? (
                                        <NotificationArchiveSearch premium
                                          items={monthItems}
                                          scope={monthGroup.label}
                                          getSearchText={getArchiveSearchText}
                                        >
                                          {(visibleItems) => IS_WEB ? (
                                            <ScrollView
                                              accessibilityLabel={`Prenotazioni archiviate ${monthGroup.label}`}
                                              nestedScrollEnabled
                                              showsVerticalScrollIndicator
                                              style={{ maxHeight: Math.min(460, Math.max(220, height * 0.48)), minHeight: 0, flexShrink: 1, borderRadius: 14, ...({ overscrollBehaviorY: 'contain' } as any) }}
                                              contentContainerStyle={{ paddingBottom: 8, paddingRight: 5 }}
                                              scrollEventThrottle={100}
                                              onScroll={(event) => markVisibleOpenRequestCardsAsViewedAfterScroll(event.nativeEvent.contentOffset.y)}
                                            >
                                              {renderDirectRequestList(`archive:${monthGroup.key}`, visibleItems, "history")}
                                            </ScrollView>
                                          ) : renderDirectRequestList(
                                            `archive:${monthGroup.key}`,
                                            visibleItems,
                                            "history",
                                          )}
                                        </NotificationArchiveSearch>
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            );
                          }}
                        </NotificationArchiveSearch>
                      </View>
                    ))}
                  </View>
                ),
              })}
            </View>
          </View>}
            renderContent={()=>requestListInPopup ? <View style={{flex:1,minHeight:160,alignItems:'center',justifyContent:'center',gap:12,padding:20,...(!(IS_WEB&&responsive.width>=1000)?{borderWidth:1,borderColor:premiumRequestsPalette.border,borderRadius:19,backgroundColor:premiumRequestsPalette.night?'rgba(38,41,43,.9)':'rgba(255,253,250,.86)'}:{})}}><Ionicons name="documents-outline" size={34} color={premiumRequestsPalette.muted}/><Text style={{fontFamily:'Georgia',fontSize:23,color:premiumRequestsPalette.ink}}>{activeSectionMeta.title}</Text><Text style={{color:premiumRequestsPalette.muted,fontSize:13}}>{activeSectionMeta.count} prenotazioni · elenco aperto nel pannello</Text></View> : expandedSections[workspaceSection] ? requestSectionPanels[workspaceSection]?.() : <View style={{flex:1,minHeight:140,alignItems:'center',justifyContent:'center',gap:10,padding:22,...(!(IS_WEB&&responsive.width>=1000)?{borderWidth:1,borderColor:premiumRequestsPalette.border,borderRadius:19,backgroundColor:premiumRequestsPalette.night?'rgba(38,41,43,.9)':'rgba(255,253,250,.86)'}:{})}}><NativeMedal icon="calendar-outline" size={46} iconSize={21}/><Text style={{fontFamily:IS_WEB?'Georgia':(Platform.OS==='ios'?'Georgia':'serif'),fontSize:20,lineHeight:26,color:premiumRequestsPalette.ink,textAlign:'center'}}>{richiesteDaAccettare.length===0?'Nessuna richiesta in attesa':`${richiesteDaAccettare.length} ${richiesteDaAccettare.length===1?'richiesta da confermare':'richieste da confermare'}`}</Text><Text style={{fontSize:13,lineHeight:19,textAlign:'center',color:premiumRequestsPalette.muted}}>Scegli una sezione per vedere le prenotazioni.</Text></View>}
          />


        </View>
      </ScrollView>
      {IS_WEB ? <RequestsListDialog
        visible={requestListInPopup}
        title={activeSectionMeta?.title ?? "Prenotazioni"}
        count={activeSectionMeta?.count ?? 0}
        onClose={() => { if (expandedSections[workspaceSection]) toggleSection(workspaceSection); }}
        onScroll={markVisibleOpenRequestCardsAsViewedAfterScroll}
      >{requestListInPopup ? requestSectionPanels[workspaceSection]?.() : null}</RequestsListDialog> : null}
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={Boolean(selectedRequest)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedRequest(null)}
      >
        <View style={styles.requestDetailOverlay}>
          <HapticTouchable
            style={styles.requestDetailBackdrop}
            onPress={() => setSelectedRequest(null)}
            pressOpacity={1}
            pressScale={1}
          />
          {selectedRequest ? (
            <DockedSheetSurface onClose={() => setSelectedRequest(null)} animateEntrance style={styles.requestDetailSheet}>
              <NativeSheetHandle style={styles.requestDetailHandle} />
              <View style={styles.requestDetailHeader}>
                <View style={styles.requestDetailTitleWrap}>
                  <Text style={styles.requestDetailEyebrow}>
                    Dettaglio richiesta
                  </Text>
                  <Text style={styles.requestDetailTitle} numberOfLines={IS_WEB ? undefined : 1}>
                    {selectedRequest.nome} {selectedRequest.cognome}
                  </Text>
                  <Text style={styles.requestDetailSubtitle} numberOfLines={IS_WEB ? undefined : 1}>
                    {selectedLogicalTitle}
                  </Text>
                </View>
                <HapticTouchable
                  style={styles.requestDetailClose}
                  onPress={() => setSelectedRequest(null)}
                  pressScale={0.95}
                  pressOpacity={0.85}
                >
                  <Text style={{fontSize:12,color:premiumRequestsPalette.ink}}>Chiudi</Text>
                  <Ionicons name="close" size={IS_WEB?20:17} color={premiumRequestsPalette.ink} />
                </HapticTouchable>
              </View>

              <View style={styles.requestDetailHeroRow}>
                <View style={styles.requestDetailHeroPill}>
                  <Ionicons name="calendar-outline" size={14} color={premiumRequestsPalette.ink} />
                  <Text style={styles.requestDetailHeroText}>
                    {formatDateLong(selectedRequest.data)}
                  </Text>
                </View>
                <View style={styles.requestDetailHeroPill}>
                  <Ionicons name="time-outline" size={14} color={premiumRequestsPalette.ink} />
                  <Text style={styles.requestDetailHeroText}>
                    {selectedRequest.ora}
                  </Text>
                </View>
                <View style={styles.requestDetailHeroPill}>
                  <Ionicons name="card-outline" size={14} color={premiumRequestsPalette.ink} />
                  <Text style={styles.requestDetailHeroText}>
                    € {selectedRequest.prezzo.toFixed(2)}
                  </Text>
                </View>
              </View>

              {selectedLogicalMembers.length > 1 ||
              selectedLogicalMembers.some((member) =>
                Boolean(normalizeServicePhaseConfig(member.phaseConfig)),
              ) ? (
                <View style={styles.logicalRequestTimelineCard}>
                  <View style={styles.logicalRequestTimelineHeading}>
                    <Ionicons
                      name={selectedLogicalKindIcon}
                      size={15}
                      color={premiumRequestsPalette.night ? "#E2CFAA" : "#7A5F38"}
                    />
                    <Text style={styles.logicalRequestTimelineEyebrow}>
                      APPUNTAMENTO COMPLETO · {selectedLogicalKindLabel}
                    </Text>
                  </View>
                  {selectedLogicalMembers.map((member) => {
                    const phaseConfig = normalizeServicePhaseConfig(
                      member.phaseConfig,
                    );
                    return (
                      <View
                        key={member.id}
                        style={styles.logicalRequestTimelineRow}
                      >
                        <View style={styles.logicalRequestTimelineDot} />
                        <Text
                          style={styles.logicalRequestTimelineService}
                          numberOfLines={IS_WEB ? undefined : 1}
                        >
                          {member.servizio}
                        </Text>
                        <Text style={styles.logicalRequestTimelineTime}>
                          {member.ora}
                        </Text>
                        {phaseConfig?.processingDurationMinutes ? (
                          <Text style={styles.logicalRequestTimelinePause}>
                            Posa {phaseConfig.processingDurationMinutes} min
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.requestDetailGrid}>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Telefono</Text>
                  <Text style={styles.requestDetailValue}>
                    {selectedRequest.telefono || "-"}
                  </Text>
                </View>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Email</Text>
                  <Text style={styles.requestDetailValue} selectable numberOfLines={IS_WEB ? undefined : 1}>
                    {selectedRequest.email || "-"}
                  </Text>
                </View>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Operatore</Text>
                  <Text style={styles.requestDetailValue}>
                    {selectedRequest.operatoreNome || "-"}
                  </Text>
                </View>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Durata</Text>
                  <Text style={styles.requestDetailValue}>
                    {selectedRequestDuration
                      ? `${selectedRequestDuration} min`
                      : "-"}
                  </Text>
                </View>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Stato</Text>
                  <Text style={styles.requestDetailValue}>
                    {selectedRequestStatus || "-"}
                  </Text>
                </View>
                <View style={styles.requestDetailField}>
                  <Text style={styles.requestDetailLabel}>Origine</Text>
                  <Text style={styles.requestDetailValue}>
                    {selectedRequest.origine === "backoffice" ? "Inserita dal salone" : "Prenotazione online"}
                  </Text>
                </View>
              </View>

              <View style={styles.requestDetailNote}>
                <Text style={styles.requestDetailLabel}>Note</Text>
                <Text style={styles.requestDetailNoteText}>
                  {visibleRequestNote(selectedRequest.note) || "Nessuna nota presente."}
                </Text>
              </View>

              <View style={styles.requestDetailActions}>
                <HapticTouchable
                  style={styles.requestDetailPrimaryAction}
                  onPress={() =>
                    openExternalUrl(
                      `tel:${buildDialablePhone(selectedRequest.telefono)}`,
                    )
                  }
                  pressScale={0.97}
                  pressOpacity={0.95}
                >
                  <Ionicons name="call-outline" size={16} color={premiumRequestsPalette.actionText} />
                  <Text style={styles.requestDetailPrimaryActionText}>
                    Chiama
                  </Text>
                </HapticTouchable>
                <HapticTouchable
                  style={styles.requestDetailSecondaryAction}
                  onPress={() =>
                    openExternalUrl(buildWhatsappUrl(selectedRequest.telefono))
                  }
                  pressScale={0.97}
                  pressOpacity={0.95}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={premiumRequestsPalette.ink} />
                  <Text style={styles.requestDetailSecondaryActionText}>
                    WhatsApp
                  </Text>
                </HapticTouchable>
              </View>
            </DockedSheetSurface>
          ) : null}
        </View>
      </Modal>
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={Boolean(manualAcceptChoiceConfig)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setManualAcceptChoiceRequestId(null)}
      >
        <View style={styles.manualAcceptOverlay}>
          <HapticTouchable
            style={styles.requestDetailBackdrop}
            onPress={() => setManualAcceptChoiceRequestId(null)}
            pressOpacity={1}
            pressScale={1}
          />
          {manualAcceptChoiceConfig ? (
            <DockedSheetSurface onClose={() => setManualAcceptChoiceRequestId(null)} style={styles.manualAcceptSheet}>
              <NativeSheetHandle style={styles.requestDetailHandle} />
              <View style={styles.manualAcceptHeader}>
                <View style={styles.manualAcceptHeaderCopy}>
                  <Text style={styles.manualAcceptEyebrow}>
                    Accettazione manuale
                  </Text>
                  <Text style={styles.manualAcceptTitle}>
                    Come vuoi accettare?
                  </Text>
                  <Text style={styles.manualAcceptSubtitle}>
                    {manualAcceptChoiceConfig.request.nome}{" "}
                    {manualAcceptChoiceConfig.request.cognome} ·{" "}
                    {manualAcceptChoiceConfig.request.ora}
                  </Text>
                </View>
                <HapticTouchable
                  style={styles.requestDetailClose}
                  onPress={() => setManualAcceptChoiceRequestId(null)}
                  pressScale={0.95}
                  pressOpacity={0.85}
                >
                  <Text style={{fontSize:12,color:premiumRequestsPalette.ink}}>Chiudi</Text>
                  <Ionicons name="close" size={IS_WEB?20:17} color={premiumRequestsPalette.ink} />
                </HapticTouchable>
              </View>

              {manualAcceptChoiceConfig.operatorOptions.length > 1 ? (
                <View style={styles.manualAcceptOperatorSection}>
                  <View style={styles.manualAcceptOperatorHeading}>
                    <View>
                      <Text style={styles.manualAcceptOperatorEyebrow}>
                        Operatore
                      </Text>
                      <Text style={styles.manualAcceptOperatorHint}>
                        Scegli chi prenderà l’appuntamento
                      </Text>
                    </View>
                    <View style={styles.manualAcceptLiveBadge}>
                      <View style={styles.manualAcceptLiveDot} />
                      <Text style={styles.manualAcceptLiveText}>
                        Disponibilità live
                      </Text>
                    </View>
                  </View>
                  <ScrollView
                    horizontal={!IS_WEB}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!IS_WEB}
                    style={[
                      styles.manualAcceptOperatorScroll,
                      IS_WEB && styles.manualAcceptOperatorScrollWeb,
                    ]}
                    contentContainerStyle={[
                      styles.manualAcceptOperatorGrid,
                      IS_WEB && styles.manualAcceptOperatorGridWeb,
                    ]}
                  >
                    {manualAcceptChoiceConfig.operatorOptions.map((option) => {
                      const isSelected =
                        option.available &&
                        option.operator.id === manualAcceptOperatorId;
                      return (
                        <HapticTouchable
                          key={option.operator.id}
                          style={[
                            styles.manualAcceptOperatorChip,
                            IS_WEB && styles.manualAcceptOperatorChipWeb,
                            isSelected &&
                              styles.manualAcceptOperatorChipSelected,
                            !option.available &&
                              styles.manualAcceptOperatorChipDisabled,
                          ]}
                          onPress={() => {
                            if (option.available) {
                              setManualAcceptOperatorId(option.operator.id);
                            }
                          }}
                          disabled={!option.available}
                          pressScale={0.98}
                          pressOpacity={0.95}
                        >
                          <View
                            style={[
                              styles.manualAcceptOperatorAvatar,
                              isSelected &&
                                styles.manualAcceptOperatorAvatarSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.manualAcceptOperatorAvatarText,
                                isSelected &&
                                  styles.manualAcceptOperatorAvatarTextSelected,
                              ]}
                            >
                              {option.operator.nome
                                .trim()
                                .slice(0, 1)
                                .toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.manualAcceptOperatorCopy}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.manualAcceptOperatorName,
                                !option.available &&
                                  styles.manualAcceptOperatorNameDisabled,
                              ]}
                            >
                              {option.operator.nome}
                            </Text>
                            <Text
                              style={[
                                styles.manualAcceptOperatorStatus,
                                option.available
                                  ? styles.manualAcceptOperatorStatusAvailable
                                  : styles.manualAcceptOperatorStatusBusy,
                              ]}
                            >
                              {option.available ? "Libero" : "Occupato"}
                            </Text>
                          </View>
                          {isSelected ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color={premiumRequestsPalette.ink}
                            />
                          ) : null}
                        </HapticTouchable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <HapticTouchable
                style={[
                  styles.manualAcceptOption,
                  manualAcceptNeedsOperator &&
                    !selectedManualAcceptOperator &&
                    styles.manualAcceptOptionDisabled,
                ]}
                onPress={() => {
                  const requestId = manualAcceptChoiceConfig.request.id;
                  setManualAcceptChoiceRequestId(null);
                  accettaRichiesta(
                    requestId,
                    undefined,
                    selectedManualAcceptOperator?.operator.id,
                    selectedManualAcceptOperator?.operator.nome,
                  );
                  setManualAcceptOperatorId("");
                }}
                disabled={
                  manualAcceptNeedsOperator && !selectedManualAcceptOperator
                }
                pressScale={0.985}
                pressOpacity={0.98}
              >
                <View style={styles.manualAcceptOptionIcon}>
                  <Ionicons name="checkmark" size={20} color={premiumRequestsPalette.ink} />
                </View>
                <View style={styles.manualAcceptOptionCopy}>
                  <Text style={styles.manualAcceptOptionTitle}>
                    Accetta con durata richiesta
                  </Text>
                  <Text style={styles.manualAcceptOptionDescription}>
                    Conferma {manualAcceptChoiceConfig.originalDuration} min
                    senza modifiche.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </HapticTouchable>

              {manualAcceptChoiceConfig.reducedDurations.length > 0 ? (
                <HapticTouchable
                  style={[
                    styles.manualAcceptOption,
                    styles.manualAcceptOptionFeatured,
                    manualAcceptNeedsOperator &&
                      !selectedManualAcceptOperator &&
                      styles.manualAcceptOptionDisabled,
                  ]}
                  onPress={() => {
                    const requestId = manualAcceptChoiceConfig.request.id;
                    setManualAcceptDurationPreview(
                      manualAcceptChoiceConfig.defaultReducedDuration,
                    );
                    setManualAcceptChoiceRequestId(null);
                    setManualAcceptDurationRequestId(requestId);
                  }}
                  disabled={
                    manualAcceptNeedsOperator && !selectedManualAcceptOperator
                  }
                  pressScale={0.985}
                  pressOpacity={0.98}
                >
                  <View
                    style={[
                      styles.manualAcceptOptionIcon,
                      styles.manualAcceptOptionIconFeatured,
                    ]}
                  >
                    <Ionicons
                      name="contract-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                  <View style={styles.manualAcceptOptionCopy}>
                    <Text style={styles.manualAcceptOptionTitle}>
                      Accetta e riduci orario
                    </Text>
                    <Text style={styles.manualAcceptOptionDescription}>
                      Riduci solo l’orario di fine a passi di{" "}
                      {manualAcceptChoiceConfig.slotStep} min.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={premiumRequestsPalette.ink} />
                </HapticTouchable>
              ) : null}

              <View style={styles.manualAcceptPrivacyNote}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={16}
                  color={premiumRequestsPalette.ink}
                />
                <Text style={styles.manualAcceptPrivacyText}>
                  L’inizio resta invariato. Il nuovo spazio sarà prenotabile
                  solo se compatibile con agenda, operatore e disponibilità.
                </Text>
              </View>
            </DockedSheetSurface>
          ) : null}
        </View>
      </Modal>
      <NumberPickerModal premiumNative
        visible={Boolean(manualAcceptDurationConfig)}
        title="Accetta e riduci orario"
        initialValue={
          manualAcceptDurationPreview ||
          manualAcceptDurationConfig?.defaultReducedDuration ||
          5
        }
        min={manualAcceptDurationConfig?.minimumReducedDuration || 5}
        max={manualAcceptDurationConfig?.defaultReducedDuration || 5}
        step={5}
        gridStep={5}
        suffix=" min"
        presets={manualAcceptDurationConfig?.reducedDurations.slice(0, 4) ?? []}
        initialMode="grid"
        showModeToggle
        showStepper
        showValuePreview
        liveOnChange
        onLiveChange={(value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            setManualAcceptDurationPreview(parsed);
          }
        }}
        selectionHintOverride={
          manualAcceptDurationConfig
            ? `Passo agenda ${manualAcceptDurationConfig.slotStep} min · l’inizio non cambia`
            : undefined
        }
        selectionSummary={
          manualAcceptDurationConfig
            ? {
                currentLabel: "Fine richiesta",
                currentValue: minutesToTime(
                  timeToMinutes(manualAcceptDurationConfig.request.ora) +
                    manualAcceptDurationConfig.originalDuration,
                ),
                nextLabel: "Nuova fine",
                nextValue: manualAcceptPreviewEnd,
                detailLabel: "Spazio liberato",
                detailValue: `${
                  manualAcceptDurationConfig.originalDuration -
                  manualAcceptDurationPreview
                } min`,
              }
            : undefined
        }
        cancelLabel="Indietro"
        confirmLabel="Accetta"
        onClose={() => {
          const requestId = manualAcceptDurationRequestId;
          setManualAcceptDurationRequestId(null);
          if (requestId) {
            setManualAcceptChoiceRequestId(requestId);
          }
        }}
        onConfirm={(value) => {
          const requestId = manualAcceptDurationRequestId;
          const parsed = Number(value);
          setManualAcceptDurationRequestId(null);
          if (requestId && Number.isFinite(parsed)) {
            accettaRichiesta(
              requestId,
              parsed,
              selectedManualAcceptOperator?.operator.id,
              selectedManualAcceptOperator?.operator.nome,
            );
            setManualAcceptOperatorId("");
          }
        }}
      />
      {IS_WEB && ownerRequestDialog ? (
        <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent animationType="fade" visible onRequestClose={closeOwnerRequestDialog}>
          <View style={styles.manualAcceptOverlay}>
            <HapticTouchable
              style={styles.requestDetailBackdrop}
              accessibilityRole="button"
              accessibilityLabel="Chiudi avviso"
              onPress={closeOwnerRequestDialog}
              pressOpacity={1}
              pressScale={1}
            />
            <DockedSheetSurface onClose={closeOwnerRequestDialog} style={[styles.manualAcceptSheet, styles.ownerRequestDialogSheet]}>
              <View accessibilityRole="alert">
                <Text style={styles.manualAcceptEyebrow}>Richieste</Text>
                <Text style={styles.manualAcceptTitle}>{ownerRequestDialog.title}</Text>
                {ownerRequestDialog.message ? (
                  <Text style={styles.ownerRequestDialogMessage}>{ownerRequestDialog.message}</Text>
                ) : null}
                <View style={styles.ownerRequestDialogActions}>
                  {ownerRequestDialog.buttons.map((button, index) => (
                    <HapticTouchable
                      key={`${button.text ?? "OK"}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={button.text ?? "OK"}
                      style={[
                        styles.ownerRequestDialogButton,
                        button.style === "cancel" && styles.ownerRequestDialogCancel,
                        button.style === "destructive" && styles.ownerRequestDialogDestructive,
                      ]}
                      onPress={() => {
                        setOwnerRequestDialog(null);
                        button.onPress?.();
                      }}
                    >
                      <Text style={[
                        styles.ownerRequestDialogButtonText,
                        button.style === "cancel" && styles.ownerRequestDialogCancelText,
                        button.style === "destructive" && styles.ownerRequestDialogDestructiveText,
                      ]}>{button.text ?? "OK"}</Text>
                    </HapticTouchable>
                  ))}
                </View>
              </View>
            </DockedSheetSurface>
          </View>
        </Modal>
      ) : null}
    </HapticTouchableFastRegion></NativePremiumScope.Provider>
  );
}

const baseRequestStyles = StyleSheet.create({
  ownerRequestDialogSheet: { width: "100%", maxWidth: 540, alignSelf: "center", paddingTop: 24 },
  ownerRequestDialogMessage: { marginTop: 12, fontSize: 15, lineHeight: 22, color: "#475569" },
  ownerRequestDialogActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  ownerRequestDialogButton: { flex: 1, minHeight: 50, borderRadius: 16, padding: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" },
  ownerRequestDialogButtonText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
  ownerRequestDialogCancel: { backgroundColor: "#F1F5F9" },
  ownerRequestDialogCancelText: { color: "#334155" },
  ownerRequestDialogDestructive: { backgroundColor: "#FFF1F2" },
  ownerRequestDialogDestructiveText: { color: "#9F1239" },
  container: {
    flex: 1,
    backgroundColor: "#F3F6FA",
  },
  content: {
    paddingTop: Platform.OS === 'web' ? 8 : 54,
    paddingBottom: 140,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
  },
  desktopColumns: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  desktopColumnsStack: {
    flexDirection: "column",
  },
  webDesktopColumnsStack: {
    gap: 16,
  },
  desktopColumnLeft: {
    flex: 1.08,
    marginRight: 16,
  },
  desktopColumnRight: {
    flex: 0.92,
  },
  desktopColumnStack: {
    flex: undefined,
    width: "100%",
    marginRight: 0,
  },
  webAccordionColumn: {
    gap: 16,
  },
  webAccordionColumnStack: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  },
  accordionSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 32,
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingVertical: 16,
    marginBottom: 16,
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(214, 224, 236, 0.82)",
    shadowColor: "#52657A",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  ownerStartupRequestCard: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  ownerStartupRequestTitle: {
    width: "58%",
    height: 18,
    borderRadius: 9,
    backgroundColor: "#D3DEEB",
  },
  ownerStartupRequestCount: {
    width: 58,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E0E7F0",
  },
  webAccordionSection: {
    marginBottom: 0,
    borderRadius: 34,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 42,
    position: "relative",
  },
  accordionHeaderText: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
    minHeight: 34,
    paddingRight: IS_ANDROID ? 98 : 108,
    paddingLeft: IS_WEB ? 108 : 0,
  },
  accordionReadAction: {
    alignItems: "flex-end",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  accordionHeaderActions: {
    position: "absolute",
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accordionCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.2,
    flex: 1,
    textAlign: "center",
  },
  accordionTitleDanger: {
    color: "#0F172A",
  },
  accordionCount: {
    minWidth: 28,
    paddingHorizontal: IS_ANDROID ? 16 : 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    maxWidth: IS_ANDROID ? 74 : undefined,
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  accordionCountDanger: {
    backgroundColor: "#FDECEC",
    color: "#0F172A",
  },
  accordionUnreadBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FF4D4F",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF4D4F",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accordionUnreadBadgeFloating: {
    position: "absolute",
    top: -10,
    right: IS_ANDROID ? 18 : 16,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FF4D4F",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF4D4F",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    zIndex: 3,
  },
  accordionUnreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
  },
  accordionChevronWrap: {
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#D9E2EC",
  },
  accordionChevronWrapDanger: {
    backgroundColor: "#FDECEC",
    borderColor: "#F3D5D8",
  },
  accordionChevronWrapWarning: {
    backgroundColor: "#FEF7D8",
    borderColor: "#F7E5A2",
  },
  accordionChevronWrapSuccess: {
    backgroundColor: "#EAF8EE",
    borderColor: "#CBEED6",
  },
  accordionChevronWrapInfo: {
    backgroundColor: "#EAF6FF",
    borderColor: "#C8E7FB",
  },
  accordionChevronCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    textAlign: "center",
    includeFontPadding: false,
  },
  accordionChevronCountTextDanger: {
    color: "#334155",
  },
  accordionChevronCountTextWarning: {
    color: "#92400E",
  },
  accordionChevronCountTextSuccess: {
    color: "#166534",
  },
  accordionChevronCountTextInfo: {
    color: "#075985",
  },
  accordionChevronWrapExpanded: {
    shadowOpacity: 0.18,
  },
  accordionEmpty: {
    paddingTop: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  groupedList: {
    marginTop: 8,
    gap: 8,
  },
  directRequestList: {
    marginTop: 8,
    gap: 12,
  },
  requestVisualGroup: {
    gap: 8,
  },
  requestVisualGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: 2,
    marginBottom: 2,
  },
  requestVisualGroupTitle: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "900",
    color: "#334155",
    letterSpacing: 0,
  },
  requestVisualGroupCount: {
    minWidth: 25,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#FFF1F2",
    color: "#BE123C",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  dateGroup: {
    gap: 0,
  },
  dayClusterCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3E9F1",
    paddingHorizontal: IS_ANDROID ? 10 : 12,
    paddingVertical: 8,
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 1,
    overflow: "hidden",
  },
  dayClusterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 44,
  },
  dayClusterHeaderText: {
    flex: 1,
    paddingRight: 8,
  },
  dayClusterHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  dayClusterDate: {
    fontSize: 12.8,
    lineHeight: 16,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: 0.2,
  },
  dayClusterMeta: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  dayClusterBadge: {
    minWidth: 54,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E2EE",
  },
  dayClusterBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
  },
  dayClusterPreviewStack: {
    marginTop: 7,
    gap: 5,
  },
  dayClusterPreviewLayer: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(203, 213, 225, 0.72)",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: IS_ANDROID ? 0 : 1,
  },
  dayClusterPreviewLayerTop: {
    zIndex: 3,
  },
  dayClusterPreviewLayerMid: {
    marginHorizontal: 6,
    opacity: 0.98,
    zIndex: 2,
  },
  dayClusterPreviewLayerBottom: {
    marginHorizontal: 12,
    opacity: 0.96,
    zIndex: 1,
  },
  dayClusterPreviewTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  dayClusterPreviewMain: {
    flex: 1,
    minWidth: 0,
  },
  dayClusterPreviewName: {
    fontSize: 12.8,
    lineHeight: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  dayClusterPreviewService: {
    marginTop: 2,
    fontSize: 11.2,
    lineHeight: 14,
    fontWeight: "800",
    color: "#334155",
  },
  dayClusterPreviewOperator: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  dayClusterPreviewTime: {
    minWidth: 58,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(203, 213, 225, 0.8)",
    fontSize: 11.5,
    fontWeight: "900",
    color: "#334155",
    textAlign: "center",
  },
  dayClusterPreviewDecisionRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  dayClusterPreviewDecisionBlock: {
    width: "100%",
    gap: 8,
  },
  dayClusterPreviewDecisionAdvanced: {
    marginTop: 0,
  },
  dayClusterPreviewDecisionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dayClusterPreviewDecisionAccept: {
    backgroundColor: "#0F172A",
  },
  dayClusterPreviewDecisionReject: {
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.22)",
  },
  dayClusterPreviewDecisionAcceptText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  dayClusterPreviewDecisionRejectText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#B91C1C",
  },
  dayClusterExpanded: {
    marginTop: 6,
    gap: 6,
  },
  compactRequestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.95)",
    paddingHorizontal: IS_ANDROID ? 10 : 12,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 1,
  },
  compactRequestCardUnread: {
    borderColor: "rgba(226, 232, 240, 0.95)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(226, 232, 240, 0.95)",
    backgroundColor: "#FFF8F8",
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.045,
    shadowRadius: 12,
  },
  requestCardTapArea: {
    width: "100%",
  },
  requestCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  requestUnreadDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#F43F5E",
  },
  requestUnreadInlineBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: "#FFF7F7",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  requestUnreadInlineDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#F43F5E",
  },
  requestUnreadInlineText: {
    fontSize: 9.2,
    lineHeight: 11,
    fontWeight: "900",
    color: "#BE123C",
  },
  compactRequestTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  compactStatusWrap: {
    alignItems: "flex-end",
    gap: 5,
    maxWidth: 112,
  },
  compactRequestTitleWrap: {
    flex: 1,
    paddingRight: 6,
  },
  compactRequestName: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  compactRequestService: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "800",
    color: "#334155",
  },
  compactRequestMeta: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  compactTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  compactTimePillText: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  compactStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  compactStatusBadgeInline: {
    alignSelf: "flex-start",
    marginTop: 5,
    maxWidth: "100%",
  },
  compactStatusBadgePending: {
    backgroundColor: "#F8FAFC",
    borderColor: "rgba(148, 163, 184, 0.28)",
  },
  compactStatusBadgeSuccess: {
    backgroundColor: "#ECFDF3",
    borderColor: "rgba(134, 239, 172, 0.5)",
  },
  compactStatusBadgeDanger: {
    backgroundColor: "#FFF1F2",
    borderColor: "rgba(248, 113, 113, 0.22)",
  },
  compactStatusBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    textAlign: "center",
    flexShrink: 1,
  },
  compactStatusBadgeTextPending: {
    color: "#334155",
  },
  compactStatusBadgeTextSuccess: {
    color: "#166534",
  },
  compactStatusBadgeTextDanger: {
    color: "#B91C1C",
  },
  compactCountdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.18)",
  },
  compactCountdownBadgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#0F766E",
  },
  logicalRequestTimelineCard: {
    width: "100%",
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    backgroundColor: "#F8F7FF",
    gap: 6,
  },
  logicalRequestTimelineEyebrow: {
    color: "#5B21B6",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.65,
    textAlign: "center",
  },
  logicalRequestTimelineHeading: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  logicalRequestTimelineRow: {
    width: "100%",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  logicalRequestTimelineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#7C3AED",
  },
  logicalRequestTimelineService: {
    flex: 1,
    minWidth: 0,
    color: "#1F2937",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "900",
  },
  logicalRequestTimelineTime: {
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "900",
  },
  logicalRequestTimelinePause: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "900",
  },
  compactSummaryRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 7,
  },
  compactInfoPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  compactInfoPillPrice: {
    maxWidth: 98,
  },
  compactInfoPillLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  compactInfoPillValue: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    color: "#334155",
  },
  compactContactLine: {
    marginTop: 6,
    fontSize: 10.3,
    lineHeight: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  compactNoteBox: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  compactNoteText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#475569",
  },
  requestCardInlineNote: {
    marginTop: 6,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  archiveYearList: {
    marginTop: 6,
    gap: 14,
  },
  archiveYearSection: {
    gap: 8,
  },
  archiveYearHeader: {
    minHeight: 34,
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 0,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  archiveYearTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  archiveYearCount: {
    minWidth: 30,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#EAF6FF",
    color: "#075985",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  archiveMonthList: {
    gap: 6,
    marginTop: 2,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(203, 213, 225, 0.72)",
    padding: 6,
  },
  archiveMonthSection: {
    borderRadius: 14,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    padding: 0,
    gap: 6,
  },
  archiveMonthHeader: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.96)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  archiveMonthHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  archiveMonthTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  archiveYearBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "#EAF6F2",
  },
  archiveYearBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: "#0F766E",
  },
  archiveMonthActionLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  archiveMonthTitle: {
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "900",
    color: "#0F172A",
    textTransform: "capitalize",
  },
  archiveMonthCount: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: "#64748B",
  },
  archiveMonthHeaderActions: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  archiveMonthChevronCount: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
    color: "#0F766E",
  },
  compactActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  compactActionChip: {
    minHeight: 29,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
    flexGrow: 1,
    flexBasis: "30%",
  },
  compactActionChipWhatsapp: {
    backgroundColor: "#ECFDF3",
  },
  compactActionChipInstagram: {
    backgroundColor: "#F5F3FF",
  },
  compactActionChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  compactActionChipWhatsappText: {
    color: "#166534",
  },
  compactActionChipInstagramText: {
    color: "#6D28D9",
  },
  compactDecisionRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  compactDecisionBlock: {
    marginTop: 6,
  },
  compactCountdownInlineCard: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(203, 213, 225, 0.9)",
    marginBottom: 6,
  },
  compactCountdownInlineEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    color: "#475569",
    marginBottom: 3,
  },
  compactCountdownInlineText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
  },
  compactDecisionPrimary: {
    flex: 1,
    minHeight: 32,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  compactDecisionPrimaryText: {
    fontSize: 10.2,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  compactDecisionSecondary: {
    flex: 1,
    minHeight: 32,
    borderRadius: 12,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  compactDecisionSecondaryText: {
    fontSize: 10.2,
    fontWeight: "900",
    color: "#B91C1C",
  },
  compactDecisionAdvanced: {
    width: "100%",
    minHeight: 46,
    marginTop: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  compactDecisionAdvancedCopy: {
    flex: 1,
    minWidth: 0,
  },
  compactDecisionAdvancedTitle: {
    color: "#1E3A8A",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "900",
  },
  compactDecisionAdvancedHint: {
    marginTop: 1,
    color: "#5B6F95",
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: IS_ANDROID ? 28 : 16,
    paddingTop: 0,
    paddingBottom: 14,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  overline: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#9a6b32",
    marginBottom: 8,
  },
  screenHeaderRow: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -2,
    gap: 4,
  },
  screenBrandChip: {
    maxWidth: "88%",
    marginTop: 4,
    marginBottom: 6,
    alignItems: "center",
  },
  screenBrandChipText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: "#64748B",
    textAlign: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    textAlign: "center",
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  subtitle: {
    maxWidth: 360,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 20,
    marginTop: 14,
    marginBottom: 2,
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  autoAcceptCard: {
    position: "relative",
    marginTop: 14,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.04)",
    paddingHorizontal: IS_ANDROID ? 14 : 18,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: "center",
    overflow: "hidden",
  },
  autoAcceptHeaderRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 0,
  },
  autoAcceptHeaderRowCompact: {
    paddingTop: 0,
  },
  autoAcceptHeaderTextWrap: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 0,
  },
  autoAcceptTitle: {
    paddingHorizontal: 28,
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  autoAcceptHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
    width: "100%",
  },
  autoAcceptLiveRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.18)",
  },
  autoAcceptLiveText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F766E",
    textAlign: "center",
  },
  autoAcceptBadge: {
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 18 : 12,
    paddingVertical: 6,
    minWidth: IS_ANDROID ? 104 : 92,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  autoAcceptBadgeOn: {
    backgroundColor: "#EAF7F0",
    borderColor: "transparent",
  },
  autoAcceptBadgeOff: {
    backgroundColor: "#FCEFE6",
    borderColor: "transparent",
  },
  autoAcceptBadgeNeutral: {
    backgroundColor: "#E2E8F0",
    borderColor: "transparent",
  },
  autoAcceptBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
    width: "100%",
    textAlign: "center",
  },
  autoAcceptBadgeTextOn: {
    color: "#0F172A",
  },
  autoAcceptBadgeTextOff: {
    color: "#0F172A",
  },
  autoAcceptBadgeTextNeutral: {
    color: "#475569",
  },
  autoAcceptToggle: {
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 14 : 18,
    paddingVertical: IS_ANDROID ? 12 : 13,
    alignItems: "center",
    justifyContent: "center",
    width: IS_ANDROID ? "100%" : undefined,
    maxWidth: IS_ANDROID ? 238 : undefined,
    minWidth: IS_ANDROID ? 0 : 270,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  autoAcceptToggleOn: {
    backgroundColor: "#16A34A",
    borderColor: "#15803D",
    borderWidth: 1,
    shadowColor: "#16A34A",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  autoAcceptToggleOff: {
    backgroundColor: "#0F172A",
    borderColor: "transparent",
  },
  autoAcceptToggleBusy: {
    backgroundColor: "#64748B",
    borderColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  autoAcceptToggleText: {
    fontSize: IS_ANDROID ? 12 : 13,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
  },
  autoAcceptToggleTextOn: {
    color: "#FFFFFF",
  },
  autoAcceptToggleTextOff: {
    color: "#FFFFFF",
  },
  bookingSettingsHelpButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bookingSettingsHelpButtonText: {
    color: "#1D4ED8",
    fontSize: 11.5,
    fontWeight: "900",
  },
  bookingSettingsHelpPanel: {
    width: "100%",
    maxWidth: 760,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DCE8F7",
    backgroundColor: "#F8FBFF",
    paddingHorizontal: IS_ANDROID ? 13 : 16,
    paddingVertical: 15,
  },
  bookingSettingsHelpIntroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bookingSettingsHelpIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bookingSettingsHelpIconAuto: {
    backgroundColor: "#DDF7EE",
  },
  bookingSettingsHelpIconGuided: {
    backgroundColor: "#E4EEFF",
  },
  bookingSettingsHelpIntroCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingSettingsHelpTitle: {
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  bookingSettingsHelpIntro: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  bookingSettingsHelpSteps: {
    marginTop: 13,
    gap: 11,
  },
  bookingSettingsHelpStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bookingSettingsHelpStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bookingSettingsHelpStepNumberText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  bookingSettingsHelpStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingSettingsHelpStepTitle: {
    color: "#1E293B",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "900",
  },
  bookingSettingsHelpStepDescription: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  bookingSettingsHelpSyncNote: {
    marginTop: 13,
    borderRadius: 14,
    backgroundColor: "#EEF2F7",
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  bookingSettingsHelpSyncText: {
    flexShrink: 1,
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  guidedSlotOptionGroup: {
    width: "100%", marginTop: 28, paddingTop: 22,
    borderTopWidth: 1, borderTopColor: "#E8EDF3",
  },
  guidedSlotOptionGroupTight: { marginTop: 26 },
  guidedSlotOptionLabel: {
    fontSize: 14, fontWeight: "800", color: "#0F172A",
    textAlign: "left", marginBottom: 10,
  },
  guidedSlotOptionGroupWebGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "stretch" },
  guidedSlotWebChoiceColumn: { width: "auto", flexBasis: "30%", flexGrow: 1, minWidth: 0, marginTop: 0 },
  guidedSlotExplicitRow: { width: "100%" },
  guidedSlotExplicitRowSingle: { marginTop: 8 },
  guidedSlotChoiceFull: { width: "100%" },
  guidedSlotChip: {
    minHeight: 72, borderRadius: 16, backgroundColor: "#FFFFFF",
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: "#E2E8F0",
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  guidedSlotChipActive: { backgroundColor: "#17365D", borderColor: "#17365D", shadowColor: "#17365D", shadowOpacity: 0.14, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  guidedSlotChipDisabled: { opacity: 0.45 },
  guidedSlotChoiceCopy: { flex: 1, minWidth: 0, gap: 5 },
  guidedSlotChoiceTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  guidedSlotRecommendedBadge: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#FFF3CF", paddingHorizontal: 8, paddingVertical: 3 },
  guidedSlotRecommendedBadgeText: { color: "#7A4B00", fontSize: 11, lineHeight: 14, fontWeight: "800" },
  guidedSlotChipText: { fontSize: 14, fontWeight: "800", color: "#334155", textAlign: "left" },
  guidedSlotChipTextActive: { color: "#FFFFFF" },
  guidedSlotChipTextDisabled: { color: "#64748B" },
  guidedSlotChoiceDescription: { fontSize: 12, lineHeight: 18, color: "#64748B", textAlign: "left" },
  guidedSlotChoiceDescriptionActive: { color: "#DCE7F5" },
  guidedSlotRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  guidedSlotRadioActive: { borderColor: "#C4D8F1", backgroundColor: "#244A78" },
  guidedSlotRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF" },
  heroStatsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 10,
    marginBottom: 6,
    gap: IS_ANDROID ? 8 : 10,
  },
  heroStatsColumn: {
    flex: 1,
    gap: 12,
  },
  heroStatCard: {
    borderRadius: 28,
    paddingHorizontal: IS_ANDROID ? 16 : 18,
    paddingVertical: 18,
    minHeight: 126,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatCardBlue: {
    backgroundColor: "#EAF1FB",
    borderColor: "transparent",
  },
  heroStatCardMint: {
    backgroundColor: "#EAF7F0",
    borderColor: "transparent",
  },
  heroStatCardOrange: {
    backgroundColor: "#FCEFE6",
    borderColor: "transparent",
  },
  heroStatCardRed: {
    backgroundColor: "#FDECEC",
    borderColor: "transparent",
  },
  heroStatNumber: {
    fontSize: 31,
    lineHeight: 35,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 9,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    width: "100%",
    textAlign: "center",
  },
  heroStatLabel: {
    fontSize: 15,
    lineHeight: 19,
    color: "#0F172A",
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 2,
    width: "100%",
  },
  heroStatLabelSalon: {
    color: "#0F172A",
  },
  heroStatLabelRed: {
    color: "#0F172A",
  },
  premiumStatSkeletonWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  premiumStatSkeletonNumber: {
    width: "46%",
    height: 34,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  premiumStatSkeletonLabel: {
    width: "72%",
    height: 14,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1a1816",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyCard: {
    backgroundColor: "#e8eef5",
    borderRadius: 26,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.85,
    borderColor: "#869fbc",
    borderTopWidth: 2.35,
    borderTopColor: "#dde7f2",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#666666",
    textAlign: "center",
  },
  requestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: IS_ANDROID ? 16 : 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 3,
  },
  wideCard: {
    maxWidth: 980,
    alignSelf: "center",
    width: "100%",
  },
  requestTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  requestHeaderText: {
    flex: 1,
    paddingRight: 6,
    alignItems: "flex-start",
  },
  requestName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "left",
    width: "100%",
  },
  requestMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "left",
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: "#EEF4FF",
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 4,
    minWidth: 66,
    maxWidth: IS_ANDROID ? "48%" : "44%",
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  pendingBadgeCancelled: {
    backgroundColor: "#FFF1F2",
    borderColor: "rgba(248, 113, 113, 0.2)",
  },
  pendingBadgeText: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: IS_ANDROID ? 4 : 0,
    width: "100%",
    textAlign: "center",
  },
  pendingBadgeTextCancelled: {
    color: "#B91C1C",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 0,
    marginBottom: 10,
  },
  infoBox: {
    flex: 1,
    backgroundColor: "#F8FBFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(191, 219, 254, 0.7)",
    alignItems: "flex-start",
    minHeight: 50,
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: "#64748B",
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 19,
    color: "#0F172A",
    fontWeight: "800",
    textAlign: "left",
  },
  requestDivider: {
    height: 1,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    marginBottom: 10,
  },
  contactPanel: {
    backgroundColor: "#FBFDFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  contactLine: {
    fontSize: 12.5,
    lineHeight: 17,
    color: "#64748B",
    textAlign: "left",
    marginTop: 0,
    marginBottom: 4,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 8,
    rowGap: 8,
    marginTop: 0,
  },
  quickActionChip: {
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingHorizontal: IS_ANDROID ? 14 : 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    minWidth: 0,
    flexGrow: 1,
    flexBasis: "47%",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionChipWhatsapp: {
    backgroundColor: "#ECFDF3",
    borderColor: "rgba(34, 197, 94, 0.18)",
  },
  quickActionChipInstagram: {
    backgroundColor: "#F5F3FF",
    borderColor: "rgba(167, 139, 250, 0.16)",
  },
  quickActionChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  quickActionChipWhatsappText: {
    color: "#166534",
  },
  quickActionChipInstagramText: {
    color: "#6D28D9",
  },
  noteText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#64748B",
    marginTop: 8,
    textAlign: "left",
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: 10,
    columnGap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  rejectButton: {
    flex: 1,
    backgroundColor: "#FFF1F2",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.18)",
  },
  rejectButtonText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  actionButtonDisabled: {
    opacity: 0.58,
  },
  historyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: IS_ANDROID ? 16 : 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 3,
  },
  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  historyHeaderText: {
    flex: 1,
    paddingRight: 6,
  },
  historyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "left",
    width: "100%",
  },
  historyMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
    fontWeight: "700",
    textAlign: "left",
    marginTop: 4,
  },
  historySummaryRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 0,
    marginBottom: 10,
  },
  historySummaryChip: {
    flex: 1,
    backgroundColor: "#F8FBFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(191, 219, 254, 0.7)",
    alignItems: "flex-start",
    minHeight: 50,
    justifyContent: "center",
  },
  historySummaryLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#64748B",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  historySummaryValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  historyBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 4,
    maxWidth: IS_ANDROID ? "48%" : "44%",
    borderWidth: 1,
  },
  historyBadgeAccepted: {
    backgroundColor: "#ECFDF3",
    borderColor: "rgba(34, 197, 94, 0.18)",
  },
  historyBadgeRejected: {
    backgroundColor: "#FFF1F2",
    borderColor: "rgba(248, 113, 113, 0.18)",
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    width: "100%",
    textAlign: "center",
  },
  historyBadgeTextAccepted: {
    color: "#166534",
  },
  historyBadgeTextRejected: {
    color: "#B91C1C",
  },
  requestDetailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: "rgba(15, 23, 42, 0.34)", paddingBottom: 0 },
  requestDetailBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  requestDetailSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: IS_ANDROID ? 18 : 20,
    paddingTop: 10,
    paddingBottom: IS_ANDROID ? 22 : 30,
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: IS_ANDROID ? 4 : 0,
  },
  requestDetailHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  requestDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  requestDetailTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  requestDetailEyebrow: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: "#64748B",
    marginBottom: 4,
  },
  requestDetailTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    color: "#0F172A",
  },
  requestDetailSubtitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#334155",
  },
  requestDetailClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  requestDetailHeroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  requestDetailHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  requestDetailHeroText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: "#334155",
  },
  requestDetailGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  requestDetailField: {
    width: "48.6%",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  requestDetailLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  requestDetailValue: {
    fontSize: 12.2,
    lineHeight: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  requestDetailNote: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  requestDetailNoteText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#334155",
  },
  requestDetailActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  requestDetailPrimaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },
  requestDetailPrimaryActionText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  requestDetailSecondaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF3",
  },
  requestDetailSecondaryActionText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    color: "#166534",
  },
  manualAcceptOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: "rgba(15, 23, 42, 0.46)", paddingBottom: 0 },
  manualAcceptSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: IS_ANDROID ? 18 : 20,
    paddingTop: 10,
    paddingBottom: IS_ANDROID ? 26 : 34,
    shadowColor: "#0F172A",
    shadowOpacity: IS_ANDROID ? 0 : 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -10 },
    elevation: IS_ANDROID ? 8 : 0,
  },
  manualAcceptHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18,
  },
  manualAcceptHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  manualAcceptEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#2563EB",
    marginBottom: 5,
  },
  manualAcceptTitle: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
    color: "#0F172A",
  },
  manualAcceptSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#64748B",
  },
  manualAcceptOperatorSection: {
    marginBottom: 14,
    borderRadius: 20,
    padding: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  manualAcceptOperatorHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 11,
  },
  manualAcceptOperatorEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  manualAcceptOperatorHint: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  manualAcceptLiveBadge: {
    minHeight: 25,
    borderRadius: 999,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
  },
  manualAcceptLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  manualAcceptLiveText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "900",
    color: "#166534",
  },
  manualAcceptOperatorScroll: {
    marginHorizontal: -13,
  },
  manualAcceptOperatorScrollWeb: {
    marginHorizontal: 0,
    width: "100%",
  },
  manualAcceptOperatorGrid: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 13,
  },
  manualAcceptOperatorGridWeb: {
    flexDirection: "column",
    width: "100%",
    paddingHorizontal: 0,
  },
  manualAcceptOperatorChip: {
    width: 150,
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#DCE4EE",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  manualAcceptOperatorChipWeb: {
    width: "100%",
  },
  manualAcceptOperatorChipSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  manualAcceptOperatorChipDisabled: {
    opacity: 0.55,
    backgroundColor: "#F1F5F9",
  },
  manualAcceptOperatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },
  manualAcceptOperatorAvatarSelected: {
    backgroundColor: "#2563EB",
  },
  manualAcceptOperatorAvatarText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    color: "#334155",
  },
  manualAcceptOperatorAvatarTextSelected: {
    color: "#FFFFFF",
  },
  manualAcceptOperatorCopy: {
    flex: 1,
    minWidth: 0,
  },
  manualAcceptOperatorName: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  manualAcceptOperatorNameDisabled: {
    color: "#64748B",
  },
  manualAcceptOperatorStatus: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "900",
  },
  manualAcceptOperatorStatusAvailable: {
    color: "#15803D",
  },
  manualAcceptOperatorStatusBusy: {
    color: "#B91C1C",
  },
  manualAcceptOptionDisabled: {
    opacity: 0.5,
  },
  manualAcceptOption: {
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  manualAcceptOptionFeatured: {
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
  },
  manualAcceptOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  manualAcceptOptionIconFeatured: {
    backgroundColor: "#0F172A",
  },
  manualAcceptOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  manualAcceptOptionTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: "#0F172A",
  },
  manualAcceptOptionDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#64748B",
  },
  manualAcceptPrivacyNote: {
    marginTop: 4,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  manualAcceptPrivacyText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#475569",
  },
});

const styles=baseRequestStyles;
