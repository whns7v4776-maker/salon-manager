import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { syncApplicationBadgeCount } from '../notification-badge-sync';

const logAndroidClientPush = (event: string, payload?: Record<string, unknown>) => {
  if (Platform.OS !== 'android') {
    return;
  }
};

export type BadgeAudience = 'owner' | 'client';
export type OwnerBadgeSection = 'prenotazioni' | 'clienti' | 'agenda';
export type ClientBadgeSection = 'prenotazioni' | 'waitlist';
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

export type BadgeIdentity = OwnerBadgeIdentity | ClientBadgeIdentity;

export type BadgeSnapshot = {
  audience: BadgeAudience | null;
  unreadCountsBySection: UnreadCountsBySection;
  totalUnread: number;
};

type OwnerBookingRequestBadgeRow = {
  id: string;
  origin: string | null;
  status: string | null;
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

const FRONTEND_WAITLIST_VIEWED_KEY = 'salon_manager_frontend_waitlist_viewed';

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

const fetchClientWaitlistRows = async (identity: ClientBadgeIdentity) => {
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
    return [];
  }

  return Array.isArray(data) ? (data as ClientWaitlistBadgeRow[]) : [];
};

const fetchClientWaitlistUnreadCount = async (identity: ClientBadgeIdentity) => {
  const rows = await fetchClientWaitlistRows(identity);
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

const buildOwnerRequestBaseKey = (item: OwnerBookingRequestBadgeRow) =>
  [
    item.appointment_date,
    item.appointment_time,
    item.requested_service_name,
    `${item.customer_name ?? ''} ${item.customer_surname ?? ''}`,
  ]
    .map(normalizeText)
    .join('|');

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

const isOwnerCountableRequest = (item: OwnerBookingRequestBadgeRow) => {
  if (item.viewed_by_salon === true) {
    return false;
  }

  const status = normalizeText(item.status);
  const cancellationSource = normalizeText(item.cancellation_source);

  if (status === 'pending') {
    return true;
  }

  return (
    status === 'cancelled' &&
    (cancellationSource === 'cliente' || cancellationSource === 'customer')
  );
};

export const calculateOwnerUnreadRequestCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    const status = normalizeText(item.status);
    const cancellationSource = normalizeText(item.cancellation_source);
    const origin = normalizeText(item.origin || 'frontend');
    const isCustomerCancellation =
      status === 'cancelled' &&
      (cancellationSource === 'cliente' || cancellationSource === 'customer');

    if (origin !== 'frontend' && !isCustomerCancellation) {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    const current = canonicalByKey.get(key);
    if (!current || compareOwnerRequestPriority(current, item) < 0) {
      canonicalByKey.set(key, item);
    }
  });

  return Array.from(canonicalByKey.values()).filter(isOwnerCountableRequest).length;
};

export const calculateOwnerUnreadAgendaCount = (
  rows: OwnerBookingRequestBadgeRow[]
) => {
  const canonicalByKey = new Map<string, OwnerBookingRequestBadgeRow>();

  rows.forEach((item) => {
    const origin = normalizeText(item.origin || 'frontend');

    if (origin !== 'frontend') {
      return;
    }

    const key = buildOwnerRequestBaseKey(item);
    if (!key) {
      return;
    }

    const current = canonicalByKey.get(key);
    if (!current || compareOwnerRequestPriority(current, item) < 0) {
      canonicalByKey.set(key, item);
    }
  });

  return Array.from(canonicalByKey.values()).filter((item) => {
    if (item.viewed_by_salon === true) {
      return false;
    }

    return normalizeText(item.status) === 'pending';
  }).length;
};

const fetchOwnerUnreadCounts = async (workspaceId: string) => {
  const [requestsResult, customersResult] = await Promise.all([
    supabase
      .from('booking_requests')
      .select(
        'id,origin,status,cancellation_source,viewed_by_salon,appointment_date,appointment_time,requested_service_name,customer_name,customer_surname,created_at,updated_at'
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
  const clienti = normalizeCount(customersResult.count ?? 0);

  return {
    prenotazioni,
    clienti,
    agenda,
  };
};

const fetchClientUnreadCounts = async (identity: ClientBadgeIdentity) => {
  const salonCode = normalizeSalonCode(identity.salonCode);
  const customerEmail = normalizeText(identity.customerEmail);
  const customerPhone = normalizePhone(identity.customerPhone);

  if (!salonCode || (!customerEmail && !customerPhone)) {
    return {
      prenotazioni: 0,
      waitlist: 0,
    };
  }

  const [requestsResult, waitlist] = await Promise.all([
    supabase.rpc('get_public_customer_unread_booking_badge_rows', {
      p_salon_code: salonCode,
      p_customer_email: customerEmail || null,
      p_customer_phone: identity.customerPhone?.trim() ?? '',
    }),
    fetchClientWaitlistUnreadCount(identity),
  ]);

  if (requestsResult.error) {
    throw requestsResult.error;
  }

  const countableRows = (requestsResult.data ?? []) as ClientBookingRequestBadgeRow[];
  const unreadRequestIds = new Set(
    countableRows
      .map((item) => String(item.id ?? '').trim())
      .filter(Boolean)
  );
  const prenotazioni = unreadRequestIds.size;

  return {
    prenotazioni,
    waitlist,
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
      totalUnread: normalizeCount(counts.prenotazioni + counts.clienti),
    };
  }

  const counts = await fetchClientUnreadCounts(identity);
  const snapshot: BadgeSnapshot = {
    audience: 'client',
    unreadCountsBySection: counts,
    totalUnread: normalizeCount(counts.prenotazioni + counts.waitlist),
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

export const syncBadgeSnapshotToAppIcon = async (snapshot: BadgeSnapshot) => {
  await syncApplicationBadgeCount(snapshot.totalUnread, {
    ignoreFloor: snapshot.audience === 'client',
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
        .or('status.eq.pending,and(status.eq.cancelled,cancellation_source.in.(cliente,customer))');

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
