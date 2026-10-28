import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { publicSupabase, supabase } from '../supabase';
import { syncApplicationBadgeCount } from '../notification-badge-sync';

const logAndroidClientPush = (event: string, payload?: Record<string, unknown>) => {
  if (Platform.OS !== 'android') {
    return;
  }
};

export type BadgeAudience = 'owner' | 'client';
export type OwnerBadgeSection = 'prenotazioni' | 'clienti' | 'agenda';
export type ClientBadgeSection = 'prenotazioni' | 'waitlist' | 'communications';
export type BadgeSection = OwnerBadgeSection | ClientBadgeSection;

export type UnreadCountsBySection = Record<string, number>;

export type OwnerBadgeIdentity = {
  audience: 'owner';
  workspaceId: string;
};

export type ClientBadgeIdentity = {
  audience: 'client';
  workspaceId: string;
  salonCode?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

export type ClientBookingNotificationReadEvent = {
  requestId: string;
  appointmentGroupId?: string | null;
  expectedStatus?: string | null;
  expectedCancellationSource?: string | null;
  expectedAppointmentDate?: string | null;
  expectedAppointmentTime?: string | null;
  expectedServiceName?: string | null;
  expectedUpdatedAt?: string | null;
};

export type BadgeIdentity = OwnerBadgeIdentity | ClientBadgeIdentity;

export type BadgeSnapshot = {
  audience: BadgeAudience | null;
  unreadCountsBySection: UnreadCountsBySection;
  totalUnread: number;
  clientBookingUnreadLogicalKeys?: string[];
};

type OwnerBookingRequestBadgeRow = {
  id: string;
  appointment_group_id: string | null;
  origin: string | null;
  status: string | null;
  payment_hold_state?: string | null;
  operator_change_status: string | null;
  cancellation_source: string | null;
  viewed_by_salon: boolean | null;
  appointment_date: string | null;
  appointment_time: string | null;
  requested_service_name: string | null;
  customer_name: string | null;
  customer_surname: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ClientBookingRequestBadgeRow = {
  id: string;
  appointment_group_id: string | null;
  status: string | null;
  cancellation_source: string | null;
  viewed_by_customer: boolean | null;
  customer_email: string | null;
  customer_phone: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  requested_service_name: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type ClientWaitlistBadgeRow = {
  id: string;
  appointment_date?: string | null;
  appointment_time?: string | null;
  requested_service_name?: string | null;
  requested_operator_id?: string | null;
  requested_operator_name?: string | null;
  status?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notified_at?: string | null;
};

type ClientCommunicationBadgeRow = {
  communication_id?: unknown;
  read_at?: unknown;
};

const emptySnapshot: BadgeSnapshot = {
  audience: null,
  unreadCountsBySection: {},
  totalUnread: 0,
};

export const getEmptyBadgeSnapshot = () => emptySnapshot;

const normalizeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const normalizeText = (value?: string | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizePhone = (value?: string | null) => (value ?? '').replace(/\D+/g, '').slice(-10);

const normalizeSalonCode = (value?: string | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');

const isUuidLike = (value?: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const CLIENT_COMMUNICATION_UNREAD_COUNT_RPC =
  'get_public_customer_unread_communication_count_v1';

const isMissingClientCommunicationUnreadCountRpc = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const rpcError = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = String(rpcError.code ?? '').trim().toUpperCase();
  const errorText = [rpcError.message, rpcError.details, rpcError.hint]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (
      errorText.includes(CLIENT_COMMUNICATION_UNREAD_COUNT_RPC) &&
      (
        errorText.includes('schema cache') ||
        errorText.includes('could not find the function') ||
        errorText.includes('does not exist')
      )
    )
  );
};

const FRONTEND_WAITLIST_VIEWED_KEY = 'salon_manager_frontend_waitlist_viewed_v2';

const buildFrontendWaitlistViewedKey = ({
  salonCode,
  email,
  phone,
}: {
  salonCode?: string | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const normalizedSalonCode = normalizeSalonCode(salonCode);
  const normalizedEmail = normalizeText(email);
  const normalizedPhone = normalizePhone(phone);
  const identity = [normalizedSalonCode, normalizedEmail || normalizedPhone].filter(Boolean).join(':');
  return identity ? `${FRONTEND_WAITLIST_VIEWED_KEY}:${identity}` : FRONTEND_WAITLIST_VIEWED_KEY;
};

const getDerivedWaitlistAlertStatus = (item: ClientWaitlistBadgeRow) => {
  const normalizedStatus = normalizeText(item.status);

  if (normalizedStatus === 'cancelled') {
    return normalizedStatus;
  }

  const appointmentDate = String(item.appointment_date ?? '').trim();
  const appointmentTime = String(item.appointment_time ?? '').trim().slice(0, 5);
  const appointmentStamp =
    appointmentDate && appointmentTime ? new Date(`${appointmentDate}T${appointmentTime}:00`).getTime() : NaN;
  const expiresStamp = item.expires_at ? Date.parse(String(item.expires_at).trim()) : NaN;
  const now = Date.now();
  const appointmentIsKnown = Number.isFinite(appointmentStamp);
  const appointmentIsPast = appointmentIsKnown && appointmentStamp <= now;
  const appointmentIsFuture = appointmentIsKnown && appointmentStamp > now;
  const wasAlreadyNotified = normalizedStatus === 'notified' || !!String(item.notified_at ?? '').trim();

  if (appointmentIsPast) {
    return 'expired';
  }

  if (wasAlreadyNotified && appointmentIsFuture) {
    return 'notified';
  }

  if (normalizedStatus === 'expired') {
    return normalizedStatus;
  }

  if (Number.isFinite(expiresStamp) && expiresStamp <= now) {
    return 'expired';
  }

  return normalizedStatus || 'waiting';
};

const buildWaitlistViewedSignature = (item: ClientWaitlistBadgeRow) => {
  const stableAlertIdentity = [
    String(item.id ?? '').trim(),
    String(item.appointment_date ?? '').trim(),
    String(item.appointment_time ?? '').trim().slice(0, 5),
    normalizeText(item.requested_service_name),
    String(item.requested_operator_id ?? '').trim(),
    normalizeText(item.requested_operator_name),
  ]
    .filter(Boolean)
    .join('|');
  const notificationStamp = String(
    item.notified_at ?? item.expires_at ?? item.created_at ?? ''
  ).trim();

  return [stableAlertIdentity, notificationStamp].filter(Boolean).join(':');
};

const fetchClientWaitlistRows = async (
  identity: ClientBadgeIdentity,
  options?: { throwOnError?: boolean }
) => {
  const salonCode = normalizeSalonCode(identity.salonCode);
  const customerEmail = normalizeText(identity.customerEmail);
  const customerPhone = normalizePhone(identity.customerPhone);

  if (!salonCode || (!customerEmail && !customerPhone)) {
    return [] as ClientWaitlistBadgeRow[];
  }

  const { data, error } = await supabase.rpc('get_public_customer_waitlist_alerts', {
    p_salon_code: salonCode,
    p_customer_email: customerEmail,
    p_customer_phone: identity.customerPhone?.trim() ?? '',
  });

  if (error) {
    console.log('Errore conteggio badge waitlist cliente:', error);
    if (options?.throwOnError) {
      throw error;
    }
    return [];
  }

  return Array.isArray(data) ? (data as ClientWaitlistBadgeRow[]) : [];
};

const fetchClientWaitlistUnreadCount = async (identity: ClientBadgeIdentity) => {
  const salonCode = normalizeSalonCode(identity.salonCode);
  const customerEmail = normalizeText(identity.customerEmail);
  const customerPhone = normalizePhone(identity.customerPhone);

  if (!salonCode || (!customerEmail && !customerPhone)) {
    return 0;
  }

  const { data: authoritativeRows, error: authoritativeRowsError } = await supabase.rpc(
    'get_public_customer_unread_waitlist_badge_rows',
    {
      p_salon_code: salonCode,
      p_customer_email: customerEmail || null,
      p_customer_phone: identity.customerPhone?.trim() ?? '',
    }
  );

  if (!authoritativeRowsError) {
    const latestByIdentity = new Map<string, ClientWaitlistBadgeRow>();
    (Array.isArray(authoritativeRows) ? authoritativeRows : []).forEach((rawItem) => {
      const item = rawItem as ClientWaitlistBadgeRow;
      const identityKey = [
        String(item.appointment_date ?? '').trim(),
        String(item.appointment_time ?? '').trim().slice(0, 5),
        normalizeText(item.requested_service_name),
        String(item.requested_operator_id ?? '').trim() || normalizeText(item.requested_operator_name) || 'salone',
      ].join('|');
      if (!identityKey.trim()) {
        return;
      }

      const current = latestByIdentity.get(identityKey);
      const currentStamp = Date.parse(
        String(current?.updated_at ?? current?.notified_at ?? current?.created_at ?? '').trim()
      ) || 0;
      const nextStamp = Date.parse(
        String(item.updated_at ?? item.notified_at ?? item.created_at ?? '').trim()
      ) || 0;

      if (!current || nextStamp >= currentStamp) {
        latestByIdentity.set(identityKey, item);
      }
    });

    return latestByIdentity.size;
  }

  // Compatibility fallback for a bundle opened while the read-state migration
  // is still propagating. Once available, the database result above is the
  // only authority and keeps every device aligned.
  const rows = await fetchClientWaitlistRows(identity, { throwOnError: true });
  if (rows.length === 0) {
    return 0;
  }

  const viewedKey = buildFrontendWaitlistViewedKey({
    salonCode: identity.salonCode,
    email: identity.customerEmail,
    phone: identity.customerPhone,
  });
  const storedViewed = await AsyncStorage.getItem(viewedKey).catch(() => null);
  const viewedSignatures = new Set<string>();

  if (storedViewed) {
    try {
      const parsed = JSON.parse(storedViewed);
      if (Array.isArray(parsed)) {
        parsed
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
          .forEach((signature) => viewedSignatures.add(signature));
      }
    } catch {
      // Keep badge reads resilient if a legacy value is malformed.
    }
  }

  const latestByIdentity = new Map<string, ClientWaitlistBadgeRow>();
  rows.forEach((item) => {
    const identityKey = [
      String(item.appointment_date ?? '').trim(),
      String(item.appointment_time ?? '').trim().slice(0, 5),
      normalizeText(item.requested_service_name),
      String(item.requested_operator_id ?? '').trim() || normalizeText(item.requested_operator_name) || 'salone',
    ].join('|');
    if (!identityKey.trim()) {
      return;
    }

    const current = latestByIdentity.get(identityKey);
    const currentStamp = Date.parse(
      String(current?.updated_at ?? current?.notified_at ?? current?.expires_at ?? current?.created_at ?? '').trim()
    ) || 0;
    const nextStamp = Date.parse(
      String(item.updated_at ?? item.notified_at ?? item.expires_at ?? item.created_at ?? '').trim()
    ) || 0;

    if (!current || nextStamp >= currentStamp) {
      latestByIdentity.set(identityKey, item);
    }
  });

  return Array.from(latestByIdentity.values()).filter((item) => {
    if (getDerivedWaitlistAlertStatus(item) !== 'notified') {
      return false;
    }

    const signature = buildWaitlistViewedSignature(item);
    return !!signature && !viewedSignatures.has(signature);
  }).length;
};

const buildOwnerRequestBaseKey = (item: OwnerBookingRequestBadgeRow) => {
  const appointmentGroupId = String(item.appointment_group_id ?? '').trim().toLowerCase();
  if (appointmentGroupId) {
    return `group:${appointmentGroupId}`;
  }

  const normalizedId = String(item.id ?? '').trim().toLowerCase();
  if (normalizedId) {
    return `id:${normalizedId}`;
  }

  return [
    item.appointment_date,
    item.appointment_time,
    item.requested_service_name,
    `${item.customer_name ?? ''} ${item.customer_surname ?? ''}`,
  ]
    .map(normalizeText)
    .join('|');
};

const getOwnerRequestPriority = (item: OwnerBookingRequestBadgeRow) => {
  const status = normalizeText(item.status);
  const cancellationSource = normalizeText(item.cancellation_source);

  if (status === 'cancelled') {
    return cancellationSource === 'cliente' || cancellationSource === 'customer' ? 50 : 15;
  }

  if (status === 'accepted' || status === 'auto_accepted') return 40;
  if (status === 'pending') return 30;
  if (status === 'declined' || status === 'rejected') return 10;
  return 0;
};

const compareOwnerRequestPriority = (
  left: OwnerBookingRequestBadgeRow,
  right: OwnerBookingRequestBadgeRow
) => {
  const leftUpdatedAt = Date.parse(String(left.updated_at ?? left.created_at ?? '').trim()) || 0;
  const rightUpdatedAt = Date.parse(String(right.updated_at ?? right.created_at ?? '').trim()) || 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  const priorityDiff = getOwnerRequestPriority(left) - getOwnerRequestPriority(right);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const mergeOwnerLogicalRequestRows = (
  current: OwnerBookingRequestBadgeRow | undefined,
  next: OwnerBookingRequestBadgeRow
) => {
  if (!current) {
    return next;
  }

  const authoritative =
    compareOwnerRequestPriority(current, next) < 0 ? next : current;
  return {
    ...authoritative,
    viewed_by_salon:
      current.viewed_by_salon === true && next.viewed_by_salon === true,
  };
};

const isOwnerCountableRequest = (item: OwnerBookingRequestBadgeRow) => {
  if (item.viewed_by_salon === true) {
    return false;
  }

  const status = normalizeText(item.status);
  const operatorChangeStatus = normalizeText(item.operator_change_status);
  const cancellationSource = normalizeText(item.cancellation_source);

  if (status === 'pending') {
    return operatorChangeStatus !== 'pending';
  }

  if (status === 'accepted' || status === 'auto_accepted') {
    return operatorChangeStatus !== 'pending';
  }

  return (
    status === 'cancelled' &&
    (
      cancellationSource === 'cliente' ||
      cancellationSource === 'customer' ||
      operatorChangeStatus === 'rejected' ||
      operatorChangeStatus === 'expired'
    )
  );
};

export const calculateOwnerUnreadRequestCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    if (item.payment_hold_state && item.payment_hold_state !== 'paid') return;
    const status = normalizeText(item.status);
    const operatorChangeStatus = normalizeText(item.operator_change_status);
    const cancellationSource = normalizeText(item.cancellation_source);
    const origin = normalizeText(item.origin || 'frontend');
    const isCustomerCancellation =
      status === 'cancelled' &&
      (cancellationSource === 'cliente' || cancellationSource === 'customer');
    const isResolvedOperatorChange =
      (status === 'accepted' && operatorChangeStatus === 'accepted') ||
      (status === 'cancelled' &&
        (operatorChangeStatus === 'rejected' || operatorChangeStatus === 'expired'));

    if (origin !== 'frontend' && !isCustomerCancellation && !isResolvedOperatorChange) {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    canonicalByKey.set(
      key,
      mergeOwnerLogicalRequestRows(canonicalByKey.get(key), item)
    );
  });

  return Array.from(canonicalByKey.values()).filter(isOwnerCountableRequest).length;
};

export const calculateOwnerUnreadAgendaCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    if (item.payment_hold_state && item.payment_hold_state !== 'paid') return;
    const origin = normalizeText(item.origin || 'frontend');

    if (origin !== 'frontend') {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    canonicalByKey.set(
      key,
      mergeOwnerLogicalRequestRows(canonicalByKey.get(key), item)
    );
  });

  return Array.from(canonicalByKey.values()).filter((item) => {
    const status = normalizeText(item.status);
    if (normalizeText(item.operator_change_status) === 'pending') {
      return false;
    }
    // Pending requests remain actionable until handled. Accepted customer
    // bookings stay visible only until the salon reads the new booking.
    return status === 'pending' ||
      ((status === 'accepted' || status === 'auto_accepted') &&
        item.viewed_by_salon !== true);
  }).length;
};

export const calculateOwnerUnreadCancellationCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    if (item.payment_hold_state && item.payment_hold_state !== 'paid') return;
    const status = normalizeText(item.status);
    const cancellationSource = normalizeText(item.cancellation_source);
    const isCustomerCancellation =
      status === 'cancelled' &&
      (cancellationSource === 'cliente' || cancellationSource === 'customer');

    if (!isCustomerCancellation) {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    canonicalByKey.set(
      key,
      mergeOwnerLogicalRequestRows(canonicalByKey.get(key), item)
    );
  });

  return Array.from(canonicalByKey.values()).filter(
    (item) => item.viewed_by_salon !== true
  ).length;
};

export const calculateOwnerUnreadOperatorChangeResponseCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    if (item.payment_hold_state && item.payment_hold_state !== 'paid') return;
    const status = normalizeText(item.status);
    const operatorChangeStatus = normalizeText(item.operator_change_status);
    const isResolvedOperatorChange =
      (status === 'accepted' && operatorChangeStatus === 'accepted') ||
      (
        status === 'cancelled' &&
        (operatorChangeStatus === 'rejected' || operatorChangeStatus === 'expired')
      );

    if (!isResolvedOperatorChange) {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    canonicalByKey.set(
      key,
      mergeOwnerLogicalRequestRows(canonicalByKey.get(key), item)
    );
  });

  return Array.from(canonicalByKey.values()).filter(
    (item) => item.viewed_by_salon !== true
  ).length;
};

const fetchOwnerUnreadCounts = async (workspaceId: string) => {
  const [requestsResult, customersResult] = await Promise.all([
    supabase
      .from('booking_requests')
      .select(
        'id,appointment_group_id,origin,status,payment_hold_state,operator_change_status,cancellation_source,viewed_by_salon,appointment_date,appointment_time,requested_service_name,customer_name,customer_surname,created_at,updated_at'
      )
      .eq('workspace_id', workspaceId),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('source', 'frontend')
      .eq('viewed_by_salon', false),
  ]);

  if (requestsResult.error) {
    throw requestsResult.error;
  }
  if (customersResult.error) {
    throw customersResult.error;
  }

  const prenotazioni = calculateOwnerUnreadRequestCount(
    (requestsResult.data ?? []) as OwnerBookingRequestBadgeRow[]
  );
  const agenda = calculateOwnerUnreadAgendaCount(
    (requestsResult.data ?? []) as OwnerBookingRequestBadgeRow[]
  );
  const cancellazioni = calculateOwnerUnreadCancellationCount(
    (requestsResult.data ?? []) as OwnerBookingRequestBadgeRow[]
  );
  const risposteCambioOperatore = calculateOwnerUnreadOperatorChangeResponseCount(
    (requestsResult.data ?? []) as OwnerBookingRequestBadgeRow[]
  );
  const clienti = normalizeCount(customersResult.count ?? 0);

  return {
    prenotazioni,
    clienti,
    agenda,
    cancellazioni,
    risposteCambioOperatore,
  };
};

const fetchClientCommunicationUnreadCount = async ({
  salonCode,
  customerEmail,
  customerPhone,
}: {
  salonCode: string;
  customerEmail: string | null;
  customerPhone: string;
}) => {
  const rpcParams = {
    p_salon_code: salonCode,
    p_customer_email: customerEmail,
    p_customer_phone: customerPhone,
  };
  const { data, error } = await publicSupabase.rpc(
    CLIENT_COMMUNICATION_UNREAD_COUNT_RPC,
    rpcParams,
  );

  if (!error) {
    return normalizeCount(Number(data ?? 0));
  }

  if (!isMissingClientCommunicationUnreadCountRpc(error)) {
    throw error;
  }

  const { data: legacyData, error: legacyError } = await publicSupabase.rpc(
    'get_public_customer_communications',
    rpcParams,
  );
  if (legacyError) {
    throw legacyError;
  }

  const unreadCommunicationIds = new Set<string>();
  (Array.isArray(legacyData) ? legacyData : []).forEach((rawRow) => {
    const row = rawRow as ClientCommunicationBadgeRow;
    const communicationId = String(row.communication_id ?? '').trim();
    const readAt = String(row.read_at ?? '').trim();
    if (communicationId && !readAt) {
      unreadCommunicationIds.add(communicationId);
    }
  });

  return unreadCommunicationIds.size;
};

const fetchClientUnreadCounts = async (identity: ClientBadgeIdentity) => {
  const salonCode = normalizeSalonCode(identity.salonCode);
  const customerEmail = normalizeText(identity.customerEmail);
  const customerPhone = normalizePhone(identity.customerPhone);

  if (!salonCode || (!customerEmail && !customerPhone)) {
    return {
      prenotazioni: 0,
      waitlist: 0,
      communications: 0,
      bookingLogicalKeys: [] as string[],
    };
  }

  const [requestsResult, waitlist, communications] = await Promise.all([
    supabase.rpc('get_public_customer_unread_booking_badge_rows', {
      p_salon_code: salonCode,
      p_customer_email: customerEmail || null,
      p_customer_phone: identity.customerPhone?.trim() ?? '',
    }),
    fetchClientWaitlistUnreadCount(identity),
    fetchClientCommunicationUnreadCount({
      salonCode,
      customerEmail: customerEmail || null,
      customerPhone: identity.customerPhone?.trim() ?? '',
    }),
  ]);

  if (requestsResult.error) {
    throw requestsResult.error;
  }

  const countableRows = (requestsResult.data ?? []) as ClientBookingRequestBadgeRow[];
  const unreadRequestIds = new Set(
    countableRows
      .map((item) => {
        const groupId = String(item.appointment_group_id ?? '').trim();
        const requestId = String(item.id ?? '').trim();
        return groupId
          ? `group:${groupId}`
          : requestId
            ? `request:${requestId}`
            : '';
      })
      .filter(Boolean)
  );
  const prenotazioni = unreadRequestIds.size;

  return {
    prenotazioni,
    waitlist,
    communications,
    bookingLogicalKeys: Array.from(unreadRequestIds),
  };
};

export const fetchUnreadBadgeSnapshot = async (
  identity: BadgeIdentity | null
): Promise<BadgeSnapshot> => {
  if (!identity?.workspaceId || !isUuidLike(identity.workspaceId)) {
    return getEmptyBadgeSnapshot();
  }

  if (identity.audience === 'owner') {
    const counts = await fetchOwnerUnreadCounts(identity.workspaceId);
    return {
      audience: 'owner',
      unreadCountsBySection: counts,
      totalUnread: normalizeCount(
        counts.prenotazioni + counts.clienti
      ),
    };
  }

  const clientCounts = await fetchClientUnreadCounts(identity);
  const {
    bookingLogicalKeys,
    ...counts
  } = clientCounts;
  const snapshot: BadgeSnapshot = {
    audience: 'client',
    unreadCountsBySection: counts,
    clientBookingUnreadLogicalKeys: bookingLogicalKeys,
    totalUnread: normalizeCount(
      counts.prenotazioni + counts.waitlist + counts.communications
    ),
  };
  logAndroidClientPush('badge_db_snapshot_client', {
    workspaceId: identity.workspaceId,
    salonCode: identity.salonCode ?? null,
    customerEmail: identity.customerEmail ?? null,
    customerPhone: identity.customerPhone ?? null,
    counts,
    totalUnread: snapshot.totalUnread,
    localIncrementUsed: false,
  });
  return snapshot;
};

export const syncBadgeSnapshotToAppIcon = async (
  snapshot: BadgeSnapshot,
  options?: {
    preserveAndroidNotificationOnZero?: boolean;
    ignoreApplicationBadgeFloor?: boolean;
  }
) => {
  await syncApplicationBadgeCount(snapshot.totalUnread, {
    // On Android the client push count remains visible until the customer
    // explicitly reads a section. markSectionAsRead clears the floor first.
    ignoreFloor:
      options?.ignoreApplicationBadgeFloor === true ||
      (snapshot.audience === 'client' && Platform.OS !== 'android'),
    preserveAndroidNotificationOnZero:
      snapshot.audience === 'owner' &&
      snapshot.totalUnread <= 0 &&
      options?.preserveAndroidNotificationOnZero === true,
  });
};

export const markBadgeSectionAsRead = async (
  identity: BadgeIdentity | null,
  section: BadgeSection
) => {
  if (!identity?.workspaceId || !isUuidLike(identity.workspaceId)) {
    return;
  }

  if (identity.audience === 'owner') {
    if (section === 'prenotazioni' || section === 'agenda') {
      const { error } = await supabase
        .from('booking_requests')
        .update({ viewed_by_salon: true })
        .eq('workspace_id', identity.workspaceId)
        .eq('viewed_by_salon', false)
        .or(
          // The database stores automatic acceptance as request_status accepted.
          'and(or(origin.eq.frontend,origin.is.null),status.in.(pending,accepted),or(operator_change_status.is.null,operator_change_status.neq.pending)),and(status.eq.accepted,operator_change_status.eq.accepted),and(status.eq.cancelled,or(cancellation_source.in.(cliente,customer),operator_change_status.in.(rejected,expired)))'
        );

      if (error) {
        throw error;
      }
      return;
    }

    if (section === 'clienti') {
      const { error } = await supabase
        .from('customers')
        .update({ viewed_by_salon: true })
        .eq('workspace_id', identity.workspaceId)
        .eq('source', 'frontend')
        .eq('viewed_by_salon', false);

      if (error) {
        throw error;
      }
    }

    return;
  }

  if (section === 'prenotazioni') {
    const salonCode = normalizeSalonCode(identity.salonCode);
    const customerEmail = normalizeText(identity.customerEmail);
    const customerPhone = normalizePhone(identity.customerPhone);

    if (!salonCode || (!customerEmail && !customerPhone)) {
      return;
    }

    const { error } = await supabase.rpc('mark_public_booking_requests_viewed', {
      p_salon_code: salonCode,
      p_customer_email: customerEmail || null,
      p_customer_phone: identity.customerPhone?.trim() ?? '',
    });
    if (error) {
      throw error;
    }
    return;
  }

  if (section === 'waitlist') {
    const salonCode = normalizeSalonCode(identity.salonCode);
    const customerEmail = normalizeText(identity.customerEmail);
    const customerPhone = normalizePhone(identity.customerPhone);

    if (!salonCode || (!customerEmail && !customerPhone)) {
      return;
    }

    const { error: markServerViewedError } = await supabase.rpc(
      'mark_public_customer_waitlist_alerts_viewed',
      {
        p_salon_code: salonCode,
        p_customer_email: customerEmail || null,
        p_customer_phone: identity.customerPhone?.trim() ?? '',
        p_waitlist_ids: null,
      }
    );
    if (markServerViewedError) {
      throw markServerViewedError;
    }

    const rows = await fetchClientWaitlistRows(identity);
    const viewedSignatures = rows
      .filter((item) => getDerivedWaitlistAlertStatus(item) === 'notified')
      .map((item) => buildWaitlistViewedSignature(item))
      .filter(Boolean);

    if (viewedSignatures.length === 0) {
      return;
    }

    const viewedKey = buildFrontendWaitlistViewedKey({
      salonCode: identity.salonCode,
      email: identity.customerEmail,
      phone: identity.customerPhone,
    });
    const storedViewed = await AsyncStorage.getItem(viewedKey).catch(() => null);
    const merged = new Set<string>();

    if (storedViewed) {
      try {
        const parsed = JSON.parse(storedViewed);
        if (Array.isArray(parsed)) {
          parsed
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .forEach((signature) => merged.add(signature));
        }
      } catch {
        // Ignore malformed legacy values and rewrite the clean set below.
      }
    }

    viewedSignatures.forEach((signature) => merged.add(signature));
    await AsyncStorage.setItem(viewedKey, JSON.stringify(Array.from(merged)));
  }
};

export const markClientBookingNotificationAsRead = async (
  identity: ClientBadgeIdentity | null,
  event: ClientBookingNotificationReadEvent | null
) => {
  const salonCode = normalizeSalonCode(identity?.salonCode);
  const customerEmail = normalizeText(identity?.customerEmail);
  const customerPhone = identity?.customerPhone?.trim() ?? '';
  const requestId = String(event?.requestId ?? '').trim();
  const appointmentGroupId = String(event?.appointmentGroupId ?? '').trim();
  const expectedStatus = normalizeText(event?.expectedStatus);
  const expectedCancellationSource = normalizeText(event?.expectedCancellationSource);
  const expectedAppointmentDate = String(event?.expectedAppointmentDate ?? '').trim();
  const expectedAppointmentTime = String(event?.expectedAppointmentTime ?? '').trim().slice(0, 5);
  const expectedServiceName = String(event?.expectedServiceName ?? '').trim();
  const expectedUpdatedAt = String(event?.expectedUpdatedAt ?? '').trim();

  if (
    !identity ||
    !salonCode ||
    (!customerEmail && !normalizePhone(customerPhone)) ||
    !isUuidLike(requestId) ||
    !expectedStatus ||
    !expectedAppointmentDate ||
    !expectedAppointmentTime ||
    !expectedServiceName ||
    !expectedUpdatedAt
  ) {
    return 0;
  }

  const { data, error } = await supabase.rpc(
    'mark_public_booking_notification_events_viewed_v2',
    {
      p_salon_code: salonCode,
      p_customer_email: customerEmail || null,
      p_customer_phone: customerPhone,
      p_events: [
        {
          requestId,
          appointmentGroupId: isUuidLike(appointmentGroupId) ? appointmentGroupId : null,
          expectedStatus,
          expectedCancellationSource,
          expectedAppointmentDate,
          expectedAppointmentTime,
          expectedServiceName,
          expectedUpdatedAt,
        },
      ],
    }
  );

  if (error) {
    throw error;
  }

  return normalizeCount(data);
};
