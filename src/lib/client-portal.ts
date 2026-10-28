import { getServiceDuration, normalizeAvailabilitySettings, normalizeRoleName } from './booking';
import { normalizeWorkspace, type SalonWorkspace } from './platform';
import { normalizeServiceAccentKey } from './service-accents';
import { normalizeServicePromotionWeekdays } from './service-promotions';
import { normalizeServiceLinkConfig } from './service-compositions';
import {
  normalizeServicePhaseConfig,
  normalizeServicePhaseOperatorAssignments,
  normalizeServicePhaseOverlapOverrides,
  type ServicePhaseConfig,
  type ServicePhaseOperatorAssignments,
  type ServicePhaseOverlapOverrides,
} from './service-phases';
import { publicSupabase, supabase } from './supabase';
import { isUnsubmittedBookingPaymentHold, normalizeBookingPaymentHoldState } from './booking-payment-flow';

export type ClientPortalSnapshot = {
  workspace: SalonWorkspace;
  clienti: Record<string, unknown>[];
  appuntamenti: Record<string, unknown>[];
  servizi: Record<string, unknown>[];
  operatori: Record<string, unknown>[];
  richiestePrenotazione: Record<string, unknown>[];
  paymentHoldOccupancy?: PublicPaymentHoldOccupancyItem[];
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
  serviceCardColorOverrides?: Record<string, string>;
  roleCardColorOverrides?: Record<string, string>;
};

export type PublicBookingOccupancyItem = {
  id: string;
  bookingRequestId?: string;
  bookingOrigin?: 'frontend' | 'backoffice';
  data: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  phaseConfig?: ServicePhaseConfig;
  phaseOperatorAssignments?: ServicePhaseOperatorAssignments;
  phaseOverlapOverrides?: ServicePhaseOverlapOverrides;
  operatoreId?: string;
  operatoreNome?: string;
  macchinarioIds?: string[];
  macchinarioNomi?: string[];
};

export type PublicPaymentHoldOccupancyItem = PublicBookingOccupancyItem & {
  paymentHoldState: 'awaiting_payment';
  paymentHoldExpiresAt?: string;
  appointmentGroupId?: string;
  appointmentGroupOrder?: number;
  mestiereRichiesto?: string;
};

// Holds reserve capacity, but are not bookings. Keep their public shape
// allowlisted so customer contacts cannot enter the availability snapshot.
export const normalizePublicPaymentHoldOccupancy = (value: unknown): PublicPaymentHoldOccupancyItem[] =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .filter(item => normalizeBookingPaymentHoldState(item.paymentHoldState ?? item.payment_hold_state) === 'awaiting_payment')
    .map(item => ({
      id: String(item.id ?? '').trim(),
      data: String(item.data ?? item.appointment_date ?? '').trim(),
      ora: String(item.ora ?? item.appointment_time ?? '').trim().slice(0, 5),
      cliente: '',
      servizio: String(item.servizio ?? item.requested_service_name ?? '').trim(),
      prezzo: 0,
      durataMinuti: normalizeNumber(item.durataMinuti ?? item.requested_duration_minutes),
      phaseConfig: normalizeServicePhaseConfig(item.phaseConfig ?? item.phaseSnapshot ?? item.phase_snapshot),
      phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(item.phaseOperatorAssignments ?? item.phase_operator_assignments),
      phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(item.phaseOverlapOverrides ?? item.phase_overlap_overrides),
      operatoreId: String(item.operatoreId ?? item.requested_operator_id ?? '').trim() || undefined,
      operatoreNome: String(item.operatoreNome ?? item.requested_operator_name ?? '').trim() || undefined,
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
      macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi ?? item.machinery_names),
      mestiereRichiesto: String(item.mestiereRichiesto ?? item.requiredRole ?? item.required_role ?? '').trim() || undefined,
      appointmentGroupId: String(item.appointmentGroupId ?? item.appointment_group_id ?? '').trim() || undefined,
      appointmentGroupOrder: normalizeNumber(item.appointmentGroupOrder ?? item.appointment_group_order),
      paymentHoldState: 'awaiting_payment' as const,
      paymentHoldExpiresAt: String(item.paymentHoldExpiresAt ?? item.payment_hold_expires_at ?? '').trim() || undefined,
    }))
    .filter(item => !!item.id && !!item.data && !!item.ora && !!item.servizio);

const CLIENT_PORTAL_RPC_TIMEOUT_MS = 8000;
const CLIENT_PORTAL_SCHEMA_CACHE_RETRY_DELAYS_MS = [350, 700, 1200];
export const CLIENT_PORTAL_SCHEMA_CACHE_UNAVAILABLE_ERROR_CODE =
  'CLIENT_PORTAL_SCHEMA_CACHE_UNAVAILABLE';

const isSupabaseSchemaCacheLookupError = (error: unknown) => {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  const message =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return code === 'PGRST002' || /schema cache/i.test(message);
};

export const isClientPortalSchemaCacheUnavailableError = (error: unknown) => {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  const message =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return (
    code === CLIENT_PORTAL_SCHEMA_CACHE_UNAVAILABLE_ERROR_CODE ||
    /client_portal_schema_cache_unavailable/i.test(message)
  );
};

const buildClientPortalSchemaCacheUnavailableError = () => {
  const error = new Error('client_portal_schema_cache_unavailable') as Error & {
    code?: string;
  };
  error.code = CLIENT_PORTAL_SCHEMA_CACHE_UNAVAILABLE_ERROR_CODE;
  return error;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeStringIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
    : [];

const normalizeColorOverrideMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (accumulator, [key, entryValue]) => {
      const normalizedKey = String(key ?? '').trim();
      const normalizedValue = String(entryValue ?? '').trim();
      if (!normalizedKey || !normalizedValue) {
        return accumulator;
      }
      accumulator[normalizedKey] = normalizedValue;
      return accumulator;
    },
    {}
  );
};

const normalizeServiceColorOverrideMap = (value: unknown): Record<string, string> => {
  const rawOverrides = normalizeColorOverrideMap(value);
  const next: Record<string, string> = {};

  Object.entries(rawOverrides).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeServiceAccentKey(key);
    if (!normalizedKey) {
      return;
    }

    next[normalizedKey] = entryValue;
  });

  return next;
};

const normalizeRoleColorOverrideMap = (value: unknown): Record<string, string> => {
  const rawOverrides = normalizeColorOverrideMap(value);
  const next: Record<string, string> = {};

  Object.entries(rawOverrides).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeRoleName(key);
    if (!normalizedKey) {
      return;
    }

    next[normalizedKey] = entryValue;
  });

  return next;
};

const normalizeAppointmentRecord = (item: Record<string, any>) => {
  const appointmentGroupId =
    String(item.appointmentGroupId ?? item.appointment_group_id ?? '').trim() ||
    undefined;
  const bookingOriginValue = String(
    item.bookingOrigin ?? item.booking_origin ?? item.createdBy ?? item.created_by ?? '',
  )
    .trim()
    .toLowerCase();
  const bookingOrigin =
    bookingOriginValue === 'frontend' || bookingOriginValue === 'backoffice'
      ? bookingOriginValue
      : undefined;

  return {
    id:
      String(item.id ?? '').trim() ||
      `appointment-${String(item.ora ?? item.appointment_time ?? '').trim()}`,
    data: String(item.data ?? item.appointment_date ?? '').trim(),
    ora: String(item.ora ?? item.appointment_time ?? '').trim().slice(0, 5),
    cliente: String(item.cliente ?? item.customer_name ?? '').trim(),
    servizio: String(
      item.servizio ?? item.service_name ?? item.requested_service_name ?? '',
    ).trim(),
    prezzo:
      normalizeNumber(item.prezzo ?? item.price ?? item.requested_price) ?? 0,
    durataMinuti: normalizeNumber(item.durataMinuti ?? item.duration_minutes),
    phaseConfig: normalizeServicePhaseConfig(
      item.phaseConfig ?? item.phase_snapshot,
    ),
    phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(
      item.phaseOperatorAssignments ?? item.phase_operator_assignments,
    ),
    phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(
      item.phaseOverlapOverrides ?? item.phase_overlap_overrides,
    ),
    mestiereRichiesto: String(
      item.mestiereRichiesto ?? item.required_role ?? '',
    ).trim(),
    operatoreId:
      String(item.operatoreId ?? item.operator_id ?? '').trim() || undefined,
    operatoreNome:
      String(item.operatoreNome ?? item.operator_name ?? '').trim() || undefined,
    macchinarioIds: normalizeStringIdArray(
      item.macchinarioIds ?? item.machinery_ids,
    ),
    macchinarioNomi: normalizeStringIdArray(
      item.macchinarioNomi ?? item.machinery_names,
    ),
    appointmentGroupId: appointmentGroupId,
    // Un ordine senza gruppo non ha significato. Le vecchie copie potevano
    // conservarne uno mentre la tabella autorevole aveva gia NULL, alternando
    // per sempre due payload JSON equivalenti dal punto di vista Agenda.
    appointmentGroupOrder: appointmentGroupId
      ? normalizeNumber(
          item.appointmentGroupOrder ?? item.appointment_group_order,
        )
      : undefined,
    appointmentGroupSize: appointmentGroupId
      ? normalizeNumber(item.appointmentGroupSize ?? item.appointment_group_size)
      : undefined,
    bookingRequestId:
      String(item.bookingRequestId ?? item.booking_request_id ?? '').trim() ||
      undefined,
    bookingOrigin,
    compositionId:
      String(item.compositionId ?? item.composition_id ?? '').trim() ||
      undefined,
    dependencyServiceId:
      String(
        item.dependencyServiceId ?? item.dependency_service_id ?? '',
      ).trim() || undefined,
  };
};

type NormalizedPortalAppointment = ReturnType<
  typeof normalizeAppointmentRecord
>;

const compareCanonicalText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const buildPortalAppointmentIdentityKey = (
  item: NormalizedPortalAppointment,
) => {
  const normalizedId = String(item.id ?? '').trim();
  if (normalizedId && !normalizedId.startsWith('appointment-')) {
    return `id:${normalizedId}`;
  }

  const appointmentGroupId = String(item.appointmentGroupId ?? '').trim();
  const bookingRequestId = String(item.bookingRequestId ?? '').trim();
  const logicalIdentity = bookingRequestId
    ? `request:${bookingRequestId}`
    : appointmentGroupId
      ? `group:${appointmentGroupId}`
      : 'ungrouped';
  const appointmentGroupOrder =
    !bookingRequestId &&
    appointmentGroupId &&
    typeof item.appointmentGroupOrder === 'number'
      ? String(item.appointmentGroupOrder)
      : '';

  return [
    'legacy',
    logicalIdentity,
    appointmentGroupOrder,
    item.data,
    item.ora,
    item.cliente.toLowerCase(),
    item.servizio.toLowerCase(),
    item.operatoreId ?? '',
  ].join('|');
};

const comparePortalAppointmentsCanonicalOrder = (
  left: NormalizedPortalAppointment,
  right: NormalizedPortalAppointment,
) =>
  compareCanonicalText(left.data, right.data) ||
  compareCanonicalText(left.ora, right.ora) ||
  compareCanonicalText(
    left.appointmentGroupId ?? '',
    right.appointmentGroupId ?? '',
  ) ||
  (left.appointmentGroupOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.appointmentGroupOrder ?? Number.MAX_SAFE_INTEGER) ||
  compareCanonicalText(left.operatoreId ?? '', right.operatoreId ?? '') ||
  compareCanonicalText(left.id, right.id) ||
  compareCanonicalText(JSON.stringify(left), JSON.stringify(right));

const canonicalizePortalAppointments = (
  items: NormalizedPortalAppointment[],
) => {
  const canonicalByIdentity = new Map<string, NormalizedPortalAppointment>();

  items.forEach((item) => {
    const identityKey = buildPortalAppointmentIdentityKey(item);
    const current = canonicalByIdentity.get(identityKey);
    if (!current || JSON.stringify(item) < JSON.stringify(current)) {
      canonicalByIdentity.set(identityKey, item);
    }
  });

  return Array.from(canonicalByIdentity.values()).sort(
    comparePortalAppointmentsCanonicalOrder,
  );
};

const normalizeCancellationSource = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'salone' || normalized === 'salon' || normalized === 'owner') {
    return 'salone';
  }
  if (normalized === 'cliente' || normalized === 'client' || normalized === 'customer') {
    return 'cliente';
  }
  return undefined;
};

const normalizeRequestRecord = (item: Record<string, any>) => ({
  id: String(item.id ?? '').trim(),
  paymentHoldState: normalizeBookingPaymentHoldState(item.paymentHoldState ?? item.payment_hold_state),
  paymentHoldExpiresAt: String(item.paymentHoldExpiresAt ?? item.payment_hold_expires_at ?? '').trim() || undefined,
  paymentHoldBatchId: String(item.paymentHoldBatchId ?? item.payment_hold_batch_id ?? '').trim() || undefined,
  data: String(item.data ?? item.appointment_date ?? '').trim(),
  ora: String(item.ora ?? item.appointment_time ?? '').trim(),
  servizio: String(item.servizio ?? item.requested_service_name ?? '').trim(),
  prezzo: normalizeNumber(item.prezzo ?? item.requested_price) ?? 0,
  durataMinuti: normalizeNumber(item.durataMinuti ?? item.requested_duration_minutes),
  phaseConfig: normalizeServicePhaseConfig(item.phaseConfig ?? item.phase_snapshot),
  phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(
    item.phaseOperatorAssignments ?? item.phase_operator_assignments
  ),
  phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(
    item.phaseOverlapOverrides ?? item.phase_overlap_overrides
  ),
  nome: String(item.nome ?? item.customer_name ?? '').trim(),
  cognome: String(item.cognome ?? item.customer_surname ?? '').trim(),
  email: String(item.email ?? item.customer_email ?? '').trim(),
  telefono: String(item.telefono ?? item.customer_phone ?? '').trim(),
  instagram: String(item.instagram ?? item.customer_instagram ?? '').trim(),
  note: String(item.note ?? item.notes ?? '').trim(),
  // Keep the semantic event marker separate from the business status. The
  // customer UI uses it to distinguish a salon move from a newly-created
  // accepted appointment after the public snapshot has been refreshed.
  notificationType:
    String(item.notificationType ?? item.notification_type ?? '').trim() ||
    undefined,
  eventType:
    String(item.eventType ?? item.event_type ?? '').trim() || undefined,
  type: String(item.type ?? '').trim() || undefined,
  status: String(item.status ?? '').trim() || undefined,
  statusCode:
    String(item.statusCode ?? item.status_code ?? '').trim() || undefined,
  requestStatus:
    String(item.requestStatus ?? item.request_status ?? '').trim() ||
    undefined,
  operatoreId:
    String(item.operatoreId ?? item.operator_id ?? item.requested_operator_id ?? '').trim() ||
    undefined,
  operatoreNome:
    String(item.operatoreNome ?? item.operator_name ?? item.requested_operator_name ?? '').trim() ||
    undefined,
  macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
  macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi ?? item.machinery_names),
  origine: item.origine ?? item.origin,
  cancellationSource: normalizeCancellationSource(item.cancellationSource ?? item.cancellation_source),
  stato: String(item.stato ?? item.status ?? '').trim(),
  createdAt: String(item.createdAt ?? item.created_at ?? '').trim(),
  viewedByCliente: item.viewedByCliente ?? item.viewed_by_customer,
  viewedBySalon: item.viewedBySalon ?? item.viewed_by_salon,
  operatorChangeStatus:
    String(item.operatorChangeStatus ?? item.operator_change_status ?? '').trim() || undefined,
  operatorChangeOriginalId:
    String(item.operatorChangeOriginalId ?? item.operator_change_original_id ?? '').trim() ||
    undefined,
  operatorChangeOriginalName:
    String(item.operatorChangeOriginalName ?? item.operator_change_original_name ?? '').trim() ||
    undefined,
  operatorChangeProposedId:
    String(item.operatorChangeProposedId ?? item.operator_change_proposed_id ?? '').trim() ||
    undefined,
  operatorChangeProposedName:
    String(item.operatorChangeProposedName ?? item.operator_change_proposed_name ?? '').trim() ||
    undefined,
  operatorChangeRequestedAt:
    String(item.operatorChangeRequestedAt ?? item.operator_change_requested_at ?? '').trim() ||
    undefined,
  operatorChangeExpiresAt:
    String(item.operatorChangeExpiresAt ?? item.operator_change_expires_at ?? '').trim() ||
    undefined,
  operatorChangeRespondedAt:
    String(item.operatorChangeRespondedAt ?? item.operator_change_responded_at ?? '').trim() ||
    undefined,
  appointmentGroupId:
    String(item.appointmentGroupId ?? item.appointment_group_id ?? '').trim() || undefined,
  appointmentGroupOrder: normalizeNumber(
    item.appointmentGroupOrder ?? item.appointment_group_order
  ),
  appointmentGroupSize: normalizeNumber(item.appointmentGroupSize ?? item.appointment_group_size),
  compositionId:
    String(item.compositionId ?? item.composition_id ?? '').trim() || undefined,
  dependencyServiceId:
    String(item.dependencyServiceId ?? item.dependency_service_id ?? '').trim() || undefined,
});

const buildPortalRequestResolutionKey = (item: {
  id?: string | null;
  appointmentGroupId?: string | null;
  appointment_group_id?: string | null;
  data?: string | null;
  ora?: string | null;
  servizio?: string | null;
  nome?: string | null;
  cognome?: string | null;
  cliente?: string | null;
  operatoreId?: string | null;
  operatoreNome?: string | null;
}) =>
  [
    String(item.appointmentGroupId ?? item.appointment_group_id ?? '').trim()
      ? `group:${String(item.appointmentGroupId ?? item.appointment_group_id ?? '').trim()}`
      : String(item.id ?? '').trim()
        ? `request:${String(item.id ?? '').trim()}`
        : 'legacy',
    String(item.data ?? '').trim(),
    String(item.ora ?? '').trim().toLowerCase(),
    String(item.servizio ?? '').trim().toLowerCase(),
    String(item.cliente ?? `${String(item.nome ?? '').trim()} ${String(item.cognome ?? '').trim()}`)
      .trim()
      .toLowerCase(),
    String(item.operatoreId ?? '').trim() ||
      String(item.operatoreNome ?? '').trim().toLowerCase() ||
      'operatore-non-specificato',
  ].join('|');

const getPortalRequestTimelineRank = (item: {
  stato?: string | null;
  cancellationSource?: string | null;
}) => {
  switch (String(item.stato ?? '').trim()) {
    case 'Accettata':
      return 40;
    case 'In attesa':
      return 30;
    case 'Annullata':
      return String(item.cancellationSource ?? '').trim() === 'cliente' ? 20 : 15;
    case 'Rifiutata':
      return 10;
    default:
      return 0;
  }
};

const comparePortalRequestTimelinePrecedence = (
  left: Record<string, any>,
  right: Record<string, any>
) => {
  const leftCreatedAt = Date.parse(String(left.createdAt ?? left.created_at ?? '').trim()) || 0;
  const rightCreatedAt = Date.parse(String(right.createdAt ?? right.created_at ?? '').trim()) || 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  const leftRank = getPortalRequestTimelineRank(left);
  const rightRank = getPortalRequestTimelineRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const normalizeServiceRecord = (item: Record<string, any>) => ({
  ...item,
  id: String(item.id ?? '').trim(),
  nome: String(item.nome ?? item.name ?? '').trim(),
  descrizione: String(item.descrizione ?? item.description ?? '').trim(),
  prezzo: normalizeNumber(item.prezzo ?? item.price) ?? 0,
  prezzoOriginale:
    normalizeNumber(item.prezzoOriginale ?? item.original_price) ?? undefined,
  scontoAttivo:
    typeof (item.scontoAttivo ?? item.discount_enabled) === 'boolean'
      ? Boolean(item.scontoAttivo ?? item.discount_enabled)
      : undefined,
  scontoValidoDal: String(item.scontoValidoDal ?? item.discount_valid_from ?? '').trim() || undefined,
  scontoValidoAl: String(item.scontoValidoAl ?? item.discount_valid_to ?? '').trim() || undefined,
  scontoOraDalle:
    String(item.scontoOraDalle ?? item.discount_start_time ?? '').trim().slice(0, 5) || undefined,
  scontoOraAlle:
    String(item.scontoOraAlle ?? item.discount_end_time ?? '').trim().slice(0, 5) || undefined,
  scontoGiorniSettimana:
    normalizeServicePromotionWeekdays(
      item.scontoGiorniSettimana ?? item.discount_weekdays
    ).length > 0
      ? normalizeServicePromotionWeekdays(
          item.scontoGiorniSettimana ?? item.discount_weekdays
        )
      : undefined,
  durataMinuti: normalizeNumber(item.durataMinuti ?? item.duration_minutes),
  mestiereRichiesto: String(item.mestiereRichiesto ?? item.required_role ?? '').trim(),
  disponibileOnline:
    typeof (item.disponibileOnline ?? item.is_online) === 'boolean'
      ? Boolean(item.disponibileOnline ?? item.is_online)
      : true,
  soloComposizione:
    (item.soloComposizione ?? item.compositionOnly ?? item.composition_only) === true,
  phaseConfig: normalizeServicePhaseConfig(item.phaseConfig ?? item.phase_config),
  linkedServiceConfig: normalizeServiceLinkConfig(
    item.linkedServiceConfig ?? item.linked_service_config
  ),
  macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
  compositionId:
    String(item.compositionId ?? item.composition_id ?? '').trim() || undefined,
  compositionAllowSplitOperators:
    typeof (
      item.compositionAllowSplitOperators ?? item.composition_allow_split_operators
    ) === 'boolean'
      ? Boolean(
          item.compositionAllowSplitOperators ?? item.composition_allow_split_operators
        )
      : undefined,
  compositionItems: Array.isArray(item.compositionItems ?? item.composition_items)
    ? (item.compositionItems ?? item.composition_items)
        .filter((entry: unknown): entry is Record<string, unknown> =>
          !!entry && typeof entry === 'object' && !Array.isArray(entry)
        )
        .map((entry: Record<string, unknown>, index: number) => ({
          serviceId: String(entry.serviceId ?? entry.service_id ?? '').trim(),
          serviceName: String(entry.serviceName ?? entry.service_name ?? '').trim(),
          price: normalizeNumber(entry.price) ?? 0,
          durationMinutes:
            normalizeNumber(entry.durationMinutes ?? entry.duration_minutes) ?? 60,
          durationOverrideMinutes: normalizeNumber(
            entry.durationOverrideMinutes ?? entry.duration_override_minutes
          ),
          requiredRole: String(entry.requiredRole ?? entry.required_role ?? '').trim(),
          position: normalizeNumber(entry.position) ?? index,
        }))
        .filter((entry: { serviceId: string; serviceName: string }) =>
          !!entry.serviceId && !!entry.serviceName
        )
        .sort((first: { position: number }, second: { position: number }) =>
          first.position - second.position
        )
    : undefined,
});

const isServiceAvailableOnline = (item: Record<string, any>) =>
  (item.disponibileOnline ?? item.is_online) !== false &&
  (item.soloComposizione ?? item.compositionOnly ?? item.composition_only) !== true;

const normalizePortalSnapshot = (data: Record<string, any> | null): ClientPortalSnapshot | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const rawWorkspace = data.workspace ?? null;
  const workspace = normalizeWorkspace(rawWorkspace, rawWorkspace?.ownerEmail ?? '');

  // Lo snapshot pubblico non espone lo stato di tester interno. Manteniamo
  // l'assenza del campo, così un refresh pubblico non può trasformarla in un
  // `false` autorevole e revocare temporaneamente l'accesso owner.
  if (
    !rawWorkspace ||
    !Object.prototype.hasOwnProperty.call(rawWorkspace, 'isInternalTester')
  ) {
    delete (workspace as Partial<SalonWorkspace>).isInternalTester;
  }

  return {
    workspace,
    clienti: Array.isArray(data.clienti) ? data.clienti : [],
    appuntamenti: Array.isArray(data.appuntamenti)
      ? canonicalizePortalAppointments(
          data.appuntamenti
            .filter(
              (item): item is Record<string, any> =>
                !!item && typeof item === 'object',
            )
            .map(normalizeAppointmentRecord),
        )
      : [],
    servizi: Array.isArray(data.servizi)
      ? data.servizi
          .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
          .map(normalizeServiceRecord)
          .filter(isServiceAvailableOnline)
      : [],
    operatori: Array.isArray(data.operatori) ? data.operatori : [],
    richiestePrenotazione: Array.isArray(data.richiestePrenotazione)
      ? data.richiestePrenotazione
          .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
          .filter(item => !isUnsubmittedBookingPaymentHold(item))
          .map(normalizeRequestRecord)
      : [],
    paymentHoldOccupancy: normalizePublicPaymentHoldOccupancy([
      ...(Array.isArray(data.paymentHoldOccupancy) ? data.paymentHoldOccupancy : []),
      ...(Array.isArray(data.richiestePrenotazione) ? data.richiestePrenotazione : []),
    ]).filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index),
    availabilitySettings: normalizeAvailabilitySettings(data.availabilitySettings ?? {}),
    serviceCardColorOverrides: normalizeServiceColorOverrideMap(data.serviceCardColorOverrides),
    roleCardColorOverrides: normalizeRoleColorOverrideMap(data.roleCardColorOverrides),
  };
};

const attachPublicServiceCompositions = async (
  snapshot: ClientPortalSnapshot | null,
  salonCode: string
): Promise<ClientPortalSnapshot | null> => {
  if (!snapshot) return null;

  const [compositionResponse, groupResponse, operatorResponse] = await Promise.all([
    publicSupabase.rpc('get_public_service_compositions_v1', {
      p_salon_code: salonCode,
    }),
    publicSupabase.rpc('get_public_booking_group_members_v1', {
      p_salon_code: salonCode,
    }),
    publicSupabase.rpc('get_public_operator_catalog_v1', {
      p_salon_code: salonCode,
    }),
  ]);
  const { data, error } = compositionResponse;

  if (error) {
    const errorText = [
      error.code,
      error.message,
      error.details,
      error.hint,
    ]
      .filter(Boolean)
      .join(' ');
    if (!/get_public_service_compositions_v1|schema cache|could not find the function/i.test(errorText)) {
      throw error;
    }
  }

  const compositions = !error && Array.isArray(data)
    ? data
        .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
        .map(normalizeServiceRecord)
        .filter(
          (item) =>
            !!item.compositionId &&
            Array.isArray(item.compositionItems) &&
            item.compositionItems.length >= 2
        )
    : [];
  const authoritativeOperators = !operatorResponse.error && Array.isArray(operatorResponse.data)
    ? operatorResponse.data.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item)
      )
    : null;
  const compositionNames = new Set(
    compositions.map((item) => item.nome.trim().toLowerCase()).filter(Boolean)
  );
  const groupPayload =
    !groupResponse.error &&
    groupResponse.data &&
    typeof groupResponse.data === 'object' &&
    !Array.isArray(groupResponse.data)
      ? (groupResponse.data as Record<string, unknown>)
      : null;
  const requestGroups =
    groupPayload?.requests &&
    typeof groupPayload.requests === 'object' &&
    !Array.isArray(groupPayload.requests)
      ? (groupPayload.requests as Record<string, Record<string, unknown>>)
      : {};
  const appointmentGroups =
    groupPayload?.appointments &&
    typeof groupPayload.appointments === 'object' &&
    !Array.isArray(groupPayload.appointments)
      ? (groupPayload.appointments as Record<string, Record<string, unknown>>)
      : {};

  return {
    ...snapshot,
    operatori: authoritativeOperators ?? snapshot.operatori,
    appuntamenti: snapshot.appuntamenti.map((item) => ({
      ...item,
      ...(appointmentGroups[String(item.id ?? '').trim()] ?? {}),
    })),
    richiestePrenotazione: snapshot.richiestePrenotazione.map((item) => ({
      ...item,
      ...(requestGroups[String(item.id ?? '').trim()] ?? {}),
    })),
    servizi: [
      ...snapshot.servizi.filter(
        (item) =>
          !String(item.compositionId ?? item.composition_id ?? '').trim() &&
          !compositionNames.has(String(item.nome ?? item.name ?? '').trim().toLowerCase()) &&
          !String(item.supersededByCompositionId ?? item.superseded_by_composition_id ?? '').trim()
      ),
      ...compositions,
    ],
  };
};

export const fetchClientPortalSnapshot = async (salonCode: string, options?: { owner?: boolean }) => {
  const portalClient = options?.owner ? supabase : publicSupabase;
  let encounteredSchemaCacheIssue = false;
  const fetchAvailabilitySettingsDirect = async () => {
    const { data, error } = await publicSupabase.rpc('get_client_portal_availability_settings', {
      p_salon_code: salonCode,
    });

    if (error) {
      if (isSupabaseSchemaCacheLookupError(error)) {
        encounteredSchemaCacheIssue = true;
        return null;
      }

      throw error;
    }

    const payload =
      data && typeof data === 'object' ? (data as Record<string, any>) : null;
    return normalizeAvailabilitySettings(payload?.availabilitySettings ?? {});
  };

  const fetchCatalogFallback = async () => {
    const { data, error } = await portalClient.rpc('get_client_portal_catalog', {
      p_salon_code: salonCode,
    });

    if (error) {
      if (isSupabaseSchemaCacheLookupError(error)) {
        encounteredSchemaCacheIssue = true;
        return null;
      }

      throw error;
    }

    return normalizePortalSnapshot((data ?? null) as Record<string, any> | null);
  };

  for (let attempt = 0; attempt <= CLIENT_PORTAL_SCHEMA_CACHE_RETRY_DELAYS_MS.length; attempt += 1) {
    const rpcTask = Promise.resolve(
      portalClient.rpc('get_client_portal_snapshot', {
        p_salon_code: salonCode,
      })
    );
    const timeoutTask = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('client_portal_snapshot_timeout'));
      }, CLIENT_PORTAL_RPC_TIMEOUT_MS);

      rpcTask.finally(() => clearTimeout(timer)).catch(() => undefined);
    });

    let raceResult:
      | {
          data: unknown;
          error: unknown;
        }
      | null = null;

    try {
      raceResult = (await Promise.race([rpcTask, timeoutTask])) as {
        data: unknown;
        error: unknown;
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'client_portal_snapshot_timeout') {
        const catalogFallback = await fetchCatalogFallback();
        if (catalogFallback) {
          return attachPublicServiceCompositions(catalogFallback, salonCode);
        }

        if (encounteredSchemaCacheIssue) {
          throw buildClientPortalSchemaCacheUnavailableError();
        }

        return null;
      }

      throw error;
    }

    const { data, error } = raceResult ?? { data: null, error: null };

    if (!error) {
      const normalizedSnapshot = normalizePortalSnapshot((data ?? null) as Record<string, any> | null);
      const directAvailabilitySettings = await fetchAvailabilitySettingsDirect();
      const snapshotWithFreshAvailability =
        normalizedSnapshot && directAvailabilitySettings
          ? {
              ...normalizedSnapshot,
              availabilitySettings: directAvailabilitySettings,
            }
          : normalizedSnapshot;

      if (
        snapshotWithFreshAvailability &&
        snapshotWithFreshAvailability.workspace?.salonCode?.trim()
      ) {
        return attachPublicServiceCompositions(snapshotWithFreshAvailability, salonCode);
      }

      const catalogFallback = await fetchCatalogFallback();
      if (catalogFallback && directAvailabilitySettings) {
        return attachPublicServiceCompositions({
          ...catalogFallback,
          availabilitySettings: directAvailabilitySettings,
        }, salonCode);
      }

      return attachPublicServiceCompositions(
        catalogFallback ?? snapshotWithFreshAvailability,
        salonCode
      );
    }

    if (
      isSupabaseSchemaCacheLookupError(error) &&
      attempt < CLIENT_PORTAL_SCHEMA_CACHE_RETRY_DELAYS_MS.length
    ) {
      encounteredSchemaCacheIssue = true;
      await wait(CLIENT_PORTAL_SCHEMA_CACHE_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    const catalogFallback = await fetchCatalogFallback();
    if (catalogFallback) {
      return attachPublicServiceCompositions(catalogFallback, salonCode);
    }

    if (encounteredSchemaCacheIssue || isSupabaseSchemaCacheLookupError(error)) {
      throw buildClientPortalSchemaCacheUnavailableError();
    }

    throw error;
  }

  const finalCatalogFallback = await fetchCatalogFallback();
  if (finalCatalogFallback) {
    return attachPublicServiceCompositions(finalCatalogFallback, salonCode);
  }

  if (encounteredSchemaCacheIssue) {
    throw buildClientPortalSchemaCacheUnavailableError();
  }

  return null;
};

export const fetchClientPortalAvailabilitySettings = async (salonCode: string) => {
  const snapshot = await fetchClientPortalSnapshot(salonCode);
  return snapshot?.availabilitySettings ?? normalizeAvailabilitySettings();
};

export const derivePublicBookingOccupancyFromSnapshot = (
  snapshot: ClientPortalSnapshot | null,
  dateValue: string
): PublicBookingOccupancyItem[] => {
  if (!snapshot) {
    return [];
  }

  const appointments = Array.isArray(snapshot.appuntamenti) ? snapshot.appuntamenti : [];
  const services = Array.isArray(snapshot.servizi) ? snapshot.servizi : [];
  const requests = Array.isArray(snapshot.richiestePrenotazione)
    ? snapshot.richiestePrenotazione
    : [];

  const normalizedAppointments = appointments
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .filter((item) => String(item.data ?? '').trim() === dateValue)
    .map((item) => ({
      id: String(item.id ?? `appointment-${String(item.ora ?? '').trim()}`),
      data: dateValue,
      ora: String(item.ora ?? '').trim(),
      cliente: String(item.cliente ?? '').trim(),
      servizio: String(item.servizio ?? '').trim(),
      prezzo: Number(item.prezzo ?? 0),
      durataMinuti:
        typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(String(item.servizio ?? '').trim(), services as any[]),
      phaseConfig: normalizeServicePhaseConfig(item.phaseConfig ?? item.phase_snapshot),
      phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(
        item.phaseOperatorAssignments ?? item.phase_operator_assignments
      ),
      phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(
        item.phaseOverlapOverrides ?? item.phase_overlap_overrides
      ),
      operatoreId: String(item.operatoreId ?? '').trim() || undefined,
      operatoreNome: String(item.operatoreNome ?? '').trim() || undefined,
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
      macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    }))
    .filter((item) => item.ora && item.servizio);

  const appointmentKeys = new Set(
    normalizedAppointments.map((item) =>
      [item.data, item.ora.toLowerCase(), item.cliente.toLowerCase(), item.servizio.toLowerCase()].join('|')
    )
  );
  const seenRequestKeys = new Set<string>();

  const materializedRequests = requests
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .filter((item) => String(item.data ?? '').trim() === dateValue)
    .filter((item) => {
      const stato = String(item.stato ?? '').trim();
      return stato === 'In attesa' || stato === 'Accettata';
    })
    .filter((item) => {
      const requestKey = [
        dateValue,
        String(item.ora ?? '').trim().toLowerCase(),
        `${String(item.nome ?? '').trim()} ${String(item.cognome ?? '').trim()}`
          .trim()
          .toLowerCase(),
        String(item.servizio ?? '').trim().toLowerCase(),
      ].join('|');

      if (appointmentKeys.has(requestKey)) {
        return false;
      }

      if (seenRequestKeys.has(requestKey)) {
        return false;
      }

      seenRequestKeys.add(requestKey);
      return true;
    })
    .map((item) => ({
      id: `${String(item.stato ?? '').trim() === 'Accettata' ? 'accepted' : 'pending'}-${String(item.id ?? '').trim()}`,
      data: dateValue,
      ora: String(item.ora ?? '').trim(),
      cliente: `${String(item.nome ?? '').trim()} ${String(item.cognome ?? '').trim()}`.trim(),
      servizio: String(item.servizio ?? '').trim(),
      prezzo: Number(item.prezzo ?? 0),
      durataMinuti:
        typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(String(item.servizio ?? '').trim(), services as any[]),
      phaseConfig: normalizeServicePhaseConfig(item.phaseConfig ?? item.phase_snapshot),
      phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(
        item.phaseOperatorAssignments ?? item.phase_operator_assignments
      ),
      phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(
        item.phaseOverlapOverrides ?? item.phase_overlap_overrides
      ),
      operatoreId:
        String(item.operatoreId ?? item.operator_id ?? item.requested_operator_id ?? '').trim() ||
        undefined,
      operatoreNome:
        String(item.operatoreNome ?? item.operator_name ?? item.requested_operator_name ?? '').trim() ||
        undefined,
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
      macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    }))
    .filter((item) => item.ora && item.servizio);

  const heldCapacity = normalizePublicPaymentHoldOccupancy(snapshot.paymentHoldOccupancy)
    .filter(item => item.data === dateValue)
    .map(item => ({ ...item, id: `payment-hold:${item.id}` }));
  return [...normalizedAppointments, ...materializedRequests, ...heldCapacity];
};

export const fetchPublicBookingOccupancy = async (
  salonCode: string,
  dateValue: string
): Promise<PublicBookingOccupancyItem[]> => {
  const normalizedSalonCode = salonCode.trim().toLowerCase();
  const normalizedDate = dateValue.trim();

  if (normalizedSalonCode && normalizedDate) {
    let { data, error } = await publicSupabase.rpc('get_public_booking_occupancy_phased_v1', {
      p_salon_code: normalizedSalonCode,
      p_date: normalizedDate,
    });

    if (error) {
      const fallback = await publicSupabase.rpc('get_public_booking_occupancy_live', {
        p_salon_code: normalizedSalonCode,
        p_date: normalizedDate,
      });
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && Array.isArray(data)) {
      return data
        .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
        .map((item) => ({
          id: String(item.id ?? `occupancy-${String(item.ora ?? '').trim()}`),
          data: String(item.data ?? normalizedDate).trim(),
          ora: String(item.ora ?? '').trim().slice(0, 5),
          cliente: String(item.cliente ?? '').trim(),
          servizio: String(item.servizio ?? '').trim(),
          prezzo: normalizeNumber(item.prezzo) ?? 0,
          durataMinuti: normalizeNumber(item.durata_minuti ?? item.durataMinuti),
          phaseConfig: normalizeServicePhaseConfig(
            item.phase_snapshot ?? item.phaseConfig
          ),
          phaseOperatorAssignments: normalizeServicePhaseOperatorAssignments(
            item.phase_operator_assignments ?? item.phaseOperatorAssignments
          ),
          phaseOverlapOverrides: normalizeServicePhaseOverlapOverrides(
            item.phase_overlap_overrides ?? item.phaseOverlapOverrides
          ),
          operatoreId: String(item.operatore_id ?? item.operatoreId ?? '').trim() || undefined,
          operatoreNome:
            String(item.operatore_nome ?? item.operatoreNome ?? '').trim() || undefined,
          macchinarioIds: normalizeStringIdArray(item.macchinario_ids ?? item.macchinarioIds),
          macchinarioNomi: normalizeStringIdArray(item.macchinario_nomi ?? item.macchinarioNomi),
        }))
        .filter((item) => item.data === normalizedDate && item.ora && item.servizio);
    }
  }

  const snapshot = await fetchClientPortalSnapshot(salonCode);
  return derivePublicBookingOccupancyFromSnapshot(snapshot, dateValue);
};

export const publishClientPortalSnapshot = async (snapshot: ClientPortalSnapshot) => {
  const normalizedRequests = Array.isArray(snapshot.richiestePrenotazione)
    ? snapshot.richiestePrenotazione
        .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
        .filter(item => !isUnsubmittedBookingPaymentHold(item))
        .map(normalizeRequestRecord)
    : [];
  const normalizedAppointments = Array.isArray(snapshot.appuntamenti)
    ? snapshot.appuntamenti
        .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
        .map(normalizeAppointmentRecord)
    : [];
  const canonicalRequestByResolutionKey = new Map<string, Record<string, any>>();
  normalizedRequests.forEach((item) => {
    const resolutionKey = buildPortalRequestResolutionKey(item);
    const current = canonicalRequestByResolutionKey.get(resolutionKey);
    if (!current || comparePortalRequestTimelinePrecedence(current, item) < 0) {
      canonicalRequestByResolutionKey.set(resolutionKey, item);
      return;
    }

    const currentRequestId = String(current.id ?? '').trim();
    const itemRequestId = String(item.id ?? '').trim();
    const samePersistedRequestId = currentRequestId.length > 0 && currentRequestId === itemRequestId;
    const hasCustomerStatusUpdate =
      String(current.stato ?? '').trim() !== 'In attesa' ||
      String(item.stato ?? '').trim() !== 'In attesa';
    if (
      samePersistedRequestId &&
      hasCustomerStatusUpdate &&
      (current.viewedByCliente === false || item.viewedByCliente === false)
    ) {
      canonicalRequestByResolutionKey.set(resolutionKey, {
        ...current,
        viewedByCliente: false,
      });
    }
  });

  const sanitizedRequests = Array.from(canonicalRequestByResolutionKey.values());
  const terminalRequestKeys = new Set(
    sanitizedRequests
      .filter((item) => item.stato === 'Annullata' || item.stato === 'Rifiutata')
      .map((item) => buildPortalRequestResolutionKey(item))
  );
  const sanitizedAppointments = canonicalizePortalAppointments(
    normalizedAppointments.filter(
      (item) => !terminalRequestKeys.has(buildPortalRequestResolutionKey(item)),
    ),
  );
  const payload = {
    workspace: {
      id: snapshot.workspace.id,
      ownerEmail: snapshot.workspace.ownerEmail,
      salonCode: snapshot.workspace.salonCode,
      salonName: snapshot.workspace.salonName,
      salonNameDisplayStyle: snapshot.workspace.salonNameDisplayStyle,
      salonNameFontVariant: snapshot.workspace.salonNameFontVariant,
      businessPhone: snapshot.workspace.businessPhone,
      activityCategory: snapshot.workspace.activityCategory,
      salonAddress: snapshot.workspace.salonAddress,
      streetType: snapshot.workspace.streetType,
      streetName: snapshot.workspace.streetName,
      streetNumber: snapshot.workspace.streetNumber,
      city: snapshot.workspace.city,
      postalCode: snapshot.workspace.postalCode,
      subscriptionPlan: snapshot.workspace.subscriptionPlan,
      subscriptionStatus: snapshot.workspace.subscriptionStatus,
      cashSectionDisabled: snapshot.workspace.cashSectionDisabled,
      autoAcceptBookingRequests: snapshot.workspace.autoAcceptBookingRequests,
      autoAcceptBookingRequestsUpdatedAt: snapshot.workspace.autoAcceptBookingRequestsUpdatedAt,
      clientWelcomeEnabled: snapshot.workspace.clientWelcomeEnabled,
      clientWelcomeTitle: snapshot.workspace.clientWelcomeTitle,
      clientWelcomeMessage: snapshot.workspace.clientWelcomeMessage,
      createdAt: snapshot.workspace.createdAt,
      updatedAt: snapshot.workspace.updatedAt,
    },
    clienti: snapshot.clienti,
    appuntamenti: sanitizedAppointments,
    servizi: snapshot.servizi
      .filter((item) => !!item && typeof item === 'object')
      .map((item) => normalizeServiceRecord(item as Record<string, any>))
      .filter(isServiceAvailableOnline),
    operatori: snapshot.operatori,
    richiestePrenotazione: sanitizedRequests,
    paymentHoldOccupancy: normalizePublicPaymentHoldOccupancy(snapshot.paymentHoldOccupancy),
    availabilitySettings: snapshot.availabilitySettings,
    serviceCardColorOverrides: snapshot.serviceCardColorOverrides ?? {},
    roleCardColorOverrides: snapshot.roleCardColorOverrides ?? {},
  };

  const { data, error } = await supabase.rpc('upsert_client_portal_snapshot', {
    p_payload: payload,
  });

  if (error) {
    throw error;
  }

  return typeof data === 'string' ? data : null;
};
