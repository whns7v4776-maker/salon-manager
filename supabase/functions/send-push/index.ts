import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ClaimedPushRow = {
  notification_id: string;
  expo_push_token: string;
  event_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
};

type PushBadgeRecipientInfo = {
  workspaceId: string | null;
  deviceId: string | null;
  platform: string | null;
  recipientKind: string;
  customerEmail: string | null;
  customerPhone: string | null;
  lastSeenAt: string | null;
  notificationCreatedAt: string | null;
};

type ExpoPushResult = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type PushDeviceRow = {
  workspace_id: string;
  audience: string;
  recipient_kind: string;
  is_active: boolean;
  expo_push_token: string | null;
  last_seen_at: string;
};

type PushNotificationRow = {
  workspace_id: string;
  status: string;
  event_type: string;
  last_error: string | null;
  created_at: string;
};

type OwnerBookingDedupeInfo = {
  key: string;
  workspaceId: string | null;
  deviceId: string | null;
  notificationCreatedAt: string | null;
  bookingRequestId: string | null;
  semanticKey: string;
};

type BadgeDebugInfo = {
  target: 'owner' | 'client' | 'unknown';
  pushType: string;
  calculationSucceeded: boolean;
  calculatedAbsoluteBadge: number;
  ownerPrenotazioniUnread: number;
  ownerClientiUnread: number;
  clientPrenotazioniUnread: number;
  clientWaitlistUnread: number;
  clientCommunicationsUnread: number;
  finalPayloadBadge: number;
  countedBookingRequestIds: string[];
  countedCustomerIds: string[];
  countedWaitlistIds: string[];
  countedCommunicationIds: string[];
};

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const ANDROID_VISIBLE_PUSH_CHANNEL_ID = 'salonpro-alerts';
const ANDROID_CLIENT_BOOKING_CHANNEL_ID = 'client-booking';
const OWNER_BOOKING_PUSH_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const baseHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders,
  });

const maskToken = (value: string | null) => {
  if (!value) return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const maskIdentity = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.includes('@')) {
    const [localPart = '', domain = ''] = normalized.split('@');
    return `${localPart.slice(0, 2)}***@${domain}`;
  }
  const digits = normalized.replace(/\D+/g, '');
  if (digits.length >= 6) {
    return `***${digits.slice(-4)}`;
  }
  if (normalized.length <= 3) return '***';
  return `${normalized.slice(0, 2)}***`;
};

const buildPushDiagnostic = (
  row: ClaimedPushRow,
  recipientInfo?: PushBadgeRecipientInfo | null,
  extra?: Record<string, unknown>
) => {
  const payload = row.payload ?? {};
  return {
    notificationId: row.notification_id,
    timestamp: new Date().toISOString(),
    dbEventType: row.event_type,
    title: row.title,
    body: row.body,
    payloadType: payload.type ?? null,
    payloadEventType: payload.event_type ?? null,
    payloadNotificationType: payload.notificationType ?? null,
    pushEventType: payload._pushEventType ?? null,
    pushTarget: payload._pushTarget ?? payload._pushAudience ?? null,
    originSource: payload.source ?? null,
    status: payload.status ?? null,
    statusCode: payload.statusCode ?? null,
    cancellationSource: payload.cancellationSource ?? null,
    bookingRequestId: payload.bookingRequestId ?? payload.requestId ?? null,
    appointmentId: payload.appointmentId ?? null,
    clientId: payload.customerId ?? payload.clientId ?? null,
    appointmentDate: payload.appointmentDate ?? null,
    appointmentTime: payload.appointmentTime ?? null,
    serviceName: payload.serviceName ?? null,
    customerEmail: maskIdentity(payload.customerEmail ?? recipientInfo?.customerEmail),
    customerPhone: maskIdentity(payload.customerPhone ?? recipientInfo?.customerPhone),
    functionName: 'send-push',
    fileName: 'supabase/functions/send-push/index.ts',
    deviceId: recipientInfo?.deviceId ?? null,
    devicePlatform: recipientInfo?.platform ?? null,
    recipientKind: recipientInfo?.recipientKind ?? null,
    expoToken: maskToken(row.expo_push_token),
    ...extra,
  };
};

const formatNotificationCopyDateText = (value: string) =>
  value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1');

const compactPushText = (value: unknown) =>
  String(value ?? '').trim().replace(/\s+/g, ' ');

const formatCompactPushDate = (value: unknown) => {
  const normalized = compactPushText(value);
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const italianMatch = normalized.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return italianMatch
    ? `${italianMatch[1]}/${italianMatch[2]}/${italianMatch[3]}`
    : normalized;
};

const formatCompactPushTime = (value: unknown) => {
  const normalized = compactPushText(value);
  const match = normalized.match(/^(\d{1,2}:\d{2})(?::\d{2})?/);
  return match?.[1] ?? normalized;
};

const buildCompactAppointmentPushBody = (
  row: ClaimedPushRow,
  recipientKind: string
) => {
  const payload = row.payload ?? {};
  const eventType = compactPushText(
    payload.event_type ??
      payload.notificationType ??
      payload._pushEventType ??
      payload.type ??
      row.event_type
  ).toLowerCase();
  const hasAppointmentIdentity = Boolean(
    compactPushText(payload.bookingRequestId ?? payload.requestId) ||
      compactPushText(payload.appointmentId)
  );
  const isAppointmentEvent =
    eventType.includes('appointment') ||
    eventType.includes('booking') ||
    eventType.includes('reminder') ||
    eventType.includes('operator_change') ||
    hasAppointmentIdentity;

  if (
    !isAppointmentEvent ||
    eventType.includes('waitlist') ||
    eventType === 'owner_badge_refresh'
  ) {
    return '';
  }

  const customerName = compactPushText(
    payload.customerName ?? payload.clientName ?? payload.customer_name
  );
  const serviceName = compactPushText(
    payload.displayServiceName ??
      payload.serviceName ??
      payload.requestedServiceName ??
      payload.requested_service_name
  );
  const appointmentDate = formatCompactPushDate(
    payload.appointmentDate ?? payload.appointment_date
  );
  const appointmentTime = formatCompactPushTime(
    payload.appointmentTime ?? payload.appointment_time
  );
  const operatorName = compactPushText(
    payload.operatorName ??
      payload.nextOperatorName ??
      payload.operator_name ??
      payload.assignedOperatorName
  );
  const isOwner = recipientKind.trim().toLowerCase() === 'owner';
  // The committed move/reorganization body contains the full phase timeline.
  // Do not replace it with the generic one-line appointment summary.
  if (!isOwner && (
    eventType === 'appointment_rescheduled_by_salon' ||
    eventType === 'appointment_reorganized_by_salon'
  ) && compactPushText(payload.bookingTimeline)) {
    const items = Array.isArray(payload.bookingTimelineItems) ? payload.bookingTimelineItems : [];
    const phases = items.flatMap((item: any) => Array.isArray(item?.phases) ? item.phases : []);
    const hasMultipleWorkPhases = phases.filter((phase: any) =>
      phase.phase !== 'processing' && phase.phase !== 'pause' &&
      /T\d{2}:\d{2}/.test(String(phase.startAt ?? '')) &&
      /T\d{2}:\d{2}/.test(String(phase.endAt ?? ''))
    ).length > 1;
    const names = [...new Set(phases.map((phase: any) => compactPushText(phase.operatorName)).filter(Boolean))];
    let phaseNumber = 0;
    const lines = phases.map((phase: any) => {
      const start = String(phase.startAt ?? '').match(/T(\d{2}:\d{2})/)?.[1];
      const end = String(phase.endAt ?? '').match(/T(\d{2}:\d{2})/)?.[1];
      if (!start || !end) return '';
      if (phase.phase === 'processing' || phase.phase === 'pause') {
        return `${phase.phase === 'processing' ? 'Posa' : 'Pausa'} · ${phase.durationMinutes} min`;
      }
      phaseNumber += 1;
      const label = compactPushText(phase.label);
      const name = compactPushText(phase.operatorName);
      return `${hasMultipleWorkPhases ? `${phaseNumber}ª fase · ` : ''}${label} ${start}–${end}${names.length > 1 && name ? ` · con ${name}` : ''}`;
    }).filter(Boolean);
    if (lines.length) return [
      [appointmentDate.replace(/\/(\d{2})(\d{2})$/, '/$2'),
        `ore ${(appointmentTime || String(phases[0]?.startAt ?? '').match(/T(\d{2}:\d{2})/)?.[1] || '').replace(/^0/, '')}`,
        names.length === 1 ? `con ${names[0]}` : '',
      ].filter(Boolean).join(' '),
      ...lines,
    ].filter(Boolean).join('\n');
    return compactPushText(payload.bookingTimeline);
  }
  const details = [
    isOwner ? customerName : '',
    serviceName,
    appointmentDate,
    appointmentTime,
    operatorName ? `con ${operatorName}` : '',
  ].filter(Boolean);

  return details.join(' · ');
};

const normalizePhoneDigits = (value: unknown) => String(value ?? '').replace(/\D+/g, '');

const normalizeBadgeKeyText = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const buildOwnerRequestBadgeBaseKey = (item: Record<string, unknown>) => {
  const appointmentGroupId = String(item.appointment_group_id ?? '').trim().toLowerCase();
  if (appointmentGroupId) {
    return `group:${appointmentGroupId}`;
  }

  const requestId = String(item.id ?? '').trim().toLowerCase();
  if (requestId) {
    return `id:${requestId}`;
  }

  return [
    item.appointment_date ?? '',
    item.appointment_time ?? '',
    item.requested_service_name ?? '',
    `${item.customer_name ?? ''} ${item.customer_surname ?? ''}`.trim(),
  ]
    .map(normalizeBadgeKeyText)
    .join('|');
};

const buildClientRequestBadgeBaseKey = (item: Record<string, unknown>) => {
  const appointmentGroupId = String(item.appointment_group_id ?? '').trim();
  if (appointmentGroupId) {
    return `group:${appointmentGroupId}`;
  }

  const requestId = String(item.id ?? '').trim();
  if (requestId) {
    return `id:${requestId}`;
  }

  return '';
};

const buildClientWaitlistBadgeKey = (item: Record<string, unknown>) =>
  [
    item.appointment_date ?? '',
    String(item.appointment_time ?? '').trim().slice(0, 5),
    item.requested_service_name ?? '',
    String(item.requested_operator_id ?? '').trim() ||
      normalizeBadgeKeyText(item.requested_operator_name) ||
      'salone',
  ]
    .map(normalizeBadgeKeyText)
    .join('|');

const getOwnerRequestBadgeStatusRank = (item: Record<string, unknown>) => {
  const status = normalizeBadgeKeyText(item.status);
  const cancellationSource = normalizeBadgeKeyText(item.cancellation_source);

  if (status === 'cancelled') {
    return cancellationSource === 'cliente' || cancellationSource === 'customer' ? 50 : 15;
  }
  if (status === 'accepted' || status === 'auto_accepted') return 40;
  if (status === 'pending') return 30;
  if (status === 'declined' || status === 'rejected') return 10;
  return 0;
};

const compareOwnerRequestBadgePriority = (
  left: Record<string, unknown>,
  right: Record<string, unknown>
) => {
  const leftUpdatedAt =
    Date.parse(String(left.updated_at ?? left.created_at ?? '').trim()) || 0;
  const rightUpdatedAt =
    Date.parse(String(right.updated_at ?? right.created_at ?? '').trim()) || 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  const statusDiff = getOwnerRequestBadgeStatusRank(left) - getOwnerRequestBadgeStatusRank(right);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const getClientRequestBadgeStatusRank = (item: Record<string, unknown>) => {
  const status = normalizeBadgeKeyText(item.status);
  const cancellationSource = normalizeBadgeKeyText(item.cancellation_source);

  if (status === 'cancelled') {
    return cancellationSource === 'salone' ? 50 : 5;
  }
  if (status === 'accepted' || status === 'auto_accepted') return 40;
  if (status === 'declined' || status === 'rejected') return 30;
  return 0;
};

const compareClientRequestBadgePriority = (
  left: Record<string, unknown>,
  right: Record<string, unknown>
) => {
  const leftUpdatedAt =
    Date.parse(String(left.updated_at ?? left.created_at ?? '').trim()) || 0;
  const rightUpdatedAt =
    Date.parse(String(right.updated_at ?? right.created_at ?? '').trim()) || 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  const statusDiff = getClientRequestBadgeStatusRank(left) - getClientRequestBadgeStatusRank(right);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const countOwnerVisibleUnreadBookingRequests = (
  items: Record<string, unknown>[],
  options?: {
    currentCustomerCancellationRequestId?: string | null;
    includeAllCustomerCancellations?: boolean;
  }
) => {
  const currentCustomerCancellationRequestId =
    typeof options?.currentCustomerCancellationRequestId === 'string'
      ? options.currentCustomerCancellationRequestId.trim()
      : '';
  const includeAllCustomerCancellations = options?.includeAllCustomerCancellations === true;
  const canonicalByKey = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    if (item.payment_hold_state && item.payment_hold_state !== 'paid') continue;
    const status = normalizeBadgeKeyText(item.status);
    const operatorChangeStatus = normalizeBadgeKeyText(item.operator_change_status);
    const cancellationSource = normalizeBadgeKeyText(item.cancellation_source);
    const origin = normalizeBadgeKeyText(item.origin || 'frontend');
    const isCustomerCancellation =
      status === 'cancelled' &&
      (cancellationSource === 'cliente' || cancellationSource === 'customer');
    const isResolvedOperatorChange =
      (status === 'accepted' && operatorChangeStatus === 'accepted') ||
      (status === 'cancelled' &&
        (operatorChangeStatus === 'rejected' || operatorChangeStatus === 'expired'));

    if (origin !== 'frontend' && !isCustomerCancellation && !isResolvedOperatorChange) {
      continue;
    }

    const key = buildOwnerRequestBadgeBaseKey(item);
    if (!key) {
      continue;
    }

    const current = canonicalByKey.get(key);
    const authoritative =
      !current || compareOwnerRequestBadgePriority(current, item) < 0
        ? item
        : current;
    canonicalByKey.set(key, {
      ...authoritative,
      viewed_by_salon:
        current == null
          ? item.viewed_by_salon === true
          : current.viewed_by_salon === true && item.viewed_by_salon === true,
    });
  }

  const countedRows = Array.from(canonicalByKey.values()).filter((item) => {
    const status = normalizeBadgeKeyText(item.status);
    const operatorChangeStatus = normalizeBadgeKeyText(item.operator_change_status);
    const cancellationSource = normalizeBadgeKeyText(item.cancellation_source);
    const viewedBySalon = item.viewed_by_salon === true;
    const isResolvedOperatorChange =
      (status === 'accepted' && operatorChangeStatus === 'accepted') ||
      (
        status === 'cancelled' &&
        (operatorChangeStatus === 'rejected' || operatorChangeStatus === 'expired')
      );

    return (
      !viewedBySalon &&
      ((status === 'pending' && operatorChangeStatus !== 'pending') ||
        ((status === 'accepted' || status === 'auto_accepted') &&
          operatorChangeStatus !== 'pending') ||
        isResolvedOperatorChange ||
        (status === 'cancelled' &&
          (cancellationSource === 'cliente' || cancellationSource === 'customer') &&
          (includeAllCustomerCancellations ||
            (!!currentCustomerCancellationRequestId &&
              String(item.id ?? '').trim() === currentCustomerCancellationRequestId))))
    );
  });

  return {
    count: countedRows.length,
    ids: countedRows.map((item) => String(item.id ?? '').trim()).filter(Boolean),
  };
};

const getEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value?.trim()) {
      return value;
    }
  }

  return null;
};

const hasValidDiagnosticsToken = (request: Request) => {
  const expectedToken = getEnvValue('PUSH_DIAGNOSTICS_TOKEN');

  if (!expectedToken) {
    return false;
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const headerToken = request.headers.get('x-diagnostics-token')?.trim() ?? '';

  return bearerToken === expectedToken || headerToken === expectedToken;
};

Deno.serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        status: 200,
        headers: baseHeaders,
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    const supabaseUrl = getEnvValue('SUPABASE_URL', 'URL');
    const serviceRoleKey = getEnvValue('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'missing_supabase_env',
          required: ['SUPABASE_URL or URL', 'SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY'],
        },
        500
      );
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 200);
    const diagnostics = body?.diagnostics === true;
    const workspaceId =
      typeof body?.workspaceId === 'string' && body.workspaceId.trim().length > 0
        ? body.workspaceId.trim()
        : null;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (diagnostics) {
      if (!hasValidDiagnosticsToken(request)) {
        return jsonResponse({ error: 'diagnostics_forbidden' }, 403);
      }

      let devicesQuery = supabase
        .from('push_devices')
        .select(
          'workspace_id,audience,recipient_kind,is_active,expo_push_token,last_seen_at'
        )
        .order('last_seen_at', { ascending: false })
        .limit(200);

      let notificationsQuery = supabase
        .from('push_notifications')
        .select('workspace_id,status,event_type,last_error,created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (workspaceId) {
        devicesQuery = devicesQuery.eq('workspace_id', workspaceId);
        notificationsQuery = notificationsQuery.eq('workspace_id', workspaceId);
      }

      const [devicesResult, notificationsResult] = await Promise.all([
        devicesQuery,
        notificationsQuery,
      ]);

      if (devicesResult.error || notificationsResult.error) {
        return jsonResponse(
          {
            error: 'diagnostics_query_failed',
            devicesError: devicesResult.error?.message ?? null,
            notificationsError: notificationsResult.error?.message ?? null,
          },
          500
        );
      }

      const devices = (devicesResult.data ?? []) as PushDeviceRow[];
      const notifications = (notificationsResult.data ?? []) as PushNotificationRow[];

      const devicesByRecipient = devices.reduce<Record<string, number>>((acc, row) => {
        const key = row.recipient_kind || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      const notificationsByStatus = notifications.reduce<Record<string, number>>((acc, row) => {
        const key = row.status || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      return jsonResponse({
        workspaceId,
        devicesTotal: devices.length,
        devicesByRecipient,
        notificationsTotal: notifications.length,
        notificationsByStatus,
        latestDevices: devices.slice(0, 10).map((row) => ({
          workspace_id: row.workspace_id,
          audience: row.audience,
          recipient_kind: row.recipient_kind,
          is_active: row.is_active,
          expo_push_token: maskToken(row.expo_push_token),
          last_seen_at: row.last_seen_at,
        })),
        latestNotifications: notifications.slice(0, 10),
      });
    }

    let queuedReminders = 0;
    const reminderQueueResult = await supabase.rpc('queue_due_appointment_push_reminders', {
      p_now: new Date().toISOString(),
      p_due_window: '15 minutes',
    });

    if (reminderQueueResult.error) {
      console.log('send-push reminder queue skipped', {
        error: reminderQueueResult.error.message,
      });
    } else {
      queuedReminders = Number(reminderQueueResult.data ?? 0) || 0;
    }

    const claimResult = await supabase.rpc('claim_push_notifications', { p_limit: limit });

    if (claimResult.error) {
      return jsonResponse(
        {
          error: 'claim_failed',
          details: claimResult.error.message,
        },
        500
      );
    }

    const claimedRows = (claimResult.data ?? []) as ClaimedPushRow[];
    if (claimedRows.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, queuedReminders });
    }

    const badgeRecipientInfoByNotificationId = new Map<string, PushBadgeRecipientInfo>();
    const notificationIds = claimedRows
      .map((row) => row.notification_id)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);

    if (notificationIds.length > 0) {
      const badgeRecipientInfoResult = await supabase
        .from('push_notifications')
        .select(
          'id,workspace_id,device_id,created_at,push_devices(id,platform,recipient_kind,customer_email,customer_phone,last_seen_at)'
        )
        .in('id', notificationIds);

      if (badgeRecipientInfoResult.error) {
        console.log('send-push badge recipient lookup skipped', {
          error: badgeRecipientInfoResult.error.message,
        });
      } else {
        for (const row of badgeRecipientInfoResult.data ?? []) {
          const rawDevice = Array.isArray(row.push_devices)
            ? row.push_devices[0]
            : row.push_devices;

          badgeRecipientInfoByNotificationId.set(String(row.id), {
            workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
            deviceId:
              typeof row.device_id === 'string'
                ? row.device_id
                : typeof rawDevice?.id === 'string'
                  ? rawDevice.id
                  : null,
            platform:
              typeof rawDevice?.platform === 'string'
                ? rawDevice.platform.trim().toLowerCase()
                : null,
            recipientKind:
              typeof rawDevice?.recipient_kind === 'string'
                ? rawDevice.recipient_kind.trim().toLowerCase()
                : '',
            customerEmail:
              typeof rawDevice?.customer_email === 'string'
                ? rawDevice.customer_email.trim().toLowerCase()
                : null,
            customerPhone:
              typeof rawDevice?.customer_phone === 'string'
                ? normalizePhoneDigits(rawDevice.customer_phone)
                : null,
            lastSeenAt:
              typeof rawDevice?.last_seen_at === 'string' ? rawDevice.last_seen_at : null,
            notificationCreatedAt:
              typeof row.created_at === 'string' ? row.created_at : null,
          });
        }
      }
    }

    const normalizeDedupeValue = (value: unknown) =>
      String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

    const workspaceSlugPromiseById = new Map<string, PromiseLike<string>>();
    const resolveWorkspaceSlug = (workspaceId: string) => {
      const cached = workspaceSlugPromiseById.get(workspaceId);
      if (cached) {
        return cached;
      }

      const pending = supabase
        .from('workspaces')
        .select('slug')
        .eq('id', workspaceId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            throw error;
          }
          return String(data?.slug ?? '').trim().toLowerCase();
        });
      workspaceSlugPromiseById.set(workspaceId, pending);
      return pending;
    };

    const resolveBadgeCountForRow = async (row: ClaimedPushRow): Promise<BadgeDebugInfo> => {
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const workspaceId =
        recipientInfo?.workspaceId ??
        (typeof row.payload?._pushWorkspaceId === 'string' ? row.payload._pushWorkspaceId : null);
      const pushType = String(row.payload?._pushEventType ?? row.payload?.type ?? row.event_type);
      const emptyDebug = (target: BadgeDebugInfo['target']): BadgeDebugInfo => ({
        target,
        pushType,
        calculationSucceeded: false,
        calculatedAbsoluteBadge: 0,
        ownerPrenotazioniUnread: 0,
        ownerClientiUnread: 0,
        clientPrenotazioniUnread: 0,
        clientWaitlistUnread: 0,
        clientCommunicationsUnread: 0,
        finalPayloadBadge: 0,
        countedBookingRequestIds: [],
        countedCustomerIds: [],
        countedWaitlistIds: [],
        countedCommunicationIds: [],
      });

      if (!workspaceId) {
        return emptyDebug('unknown');
      }

      const pushTarget = String(
        row.payload?._pushTarget ?? row.payload?._pushAudience ?? recipientInfo?.recipientKind ?? ''
      )
        .trim()
        .toLowerCase();
      const isOwnerPush = pushTarget === 'owner' || recipientInfo?.recipientKind === 'owner';
      const isClientPush = pushTarget === 'client' || recipientInfo?.recipientKind === 'client';

      try {
        if (isOwnerPush) {
          const [unreadRequestsResult, unreadCustomersResult] = await Promise.all([
            supabase
              .from('booking_requests')
              .select(
                'id,appointment_group_id,origin,status,payment_hold_state,operator_change_status,cancellation_source,viewed_by_salon,appointment_date,appointment_time,requested_service_name,customer_name,customer_surname,created_at,updated_at'
              )
              .eq('workspace_id', workspaceId),
            supabase
              .from('customers')
              .select('id')
              .eq('workspace_id', workspaceId)
              .eq('viewed_by_salon', false)
              .eq('source', 'frontend'),
          ]);

          if (unreadRequestsResult.error || unreadCustomersResult.error) {
            console.log('send-push owner total unread badge count lookup partially failed', {
              unreadRequestsError: unreadRequestsResult.error?.message ?? null,
              unreadCustomersError: unreadCustomersResult.error?.message ?? null,
            });
            return emptyDebug('owner');
          }

          const ownerRequests = countOwnerVisibleUnreadBookingRequests(
            unreadRequestsResult.data ?? [],
            {
              includeAllCustomerCancellations: true,
            }
          );
          const ownerClientIds = (unreadCustomersResult.data ?? [])
            .map((item) => String(item.id ?? '').trim())
            .filter(Boolean);
          const ownerPrenotazioniUnread = ownerRequests.count;
          const ownerClientiUnread = ownerClientIds.length;
          const calculatedAbsoluteBadge = Math.max(
            0,
            ownerPrenotazioniUnread + ownerClientiUnread
          );

          return {
            target: 'owner',
            pushType,
            calculationSucceeded: true,
            calculatedAbsoluteBadge,
            ownerPrenotazioniUnread,
            ownerClientiUnread,
            clientPrenotazioniUnread: 0,
            clientWaitlistUnread: 0,
            clientCommunicationsUnread: 0,
            finalPayloadBadge: calculatedAbsoluteBadge,
            countedBookingRequestIds: ownerRequests.ids,
            countedCustomerIds: ownerClientIds,
            countedWaitlistIds: [],
            countedCommunicationIds: [],
          };
        }

        if (isClientPush) {
          const payloadEmail =
            typeof row.payload?.customerEmail === 'string'
              ? row.payload.customerEmail.trim().toLowerCase()
              : '';
          const payloadPhone = normalizePhoneDigits(row.payload?.customerPhone);
          const customerEmail = payloadEmail || recipientInfo?.customerEmail || '';
          const customerPhone = payloadPhone || recipientInfo?.customerPhone || '';

          if (!customerEmail && !customerPhone) {
            return emptyDebug('client');
          }

          const salonCode = await resolveWorkspaceSlug(workspaceId);
          if (!salonCode) {
            return emptyDebug('client');
          }

          const [requestResult, waitlistResult, communicationsResult] = await Promise.all([
            supabase.rpc('get_public_customer_unread_booking_badge_rows', {
              p_salon_code: salonCode,
              p_customer_email: customerEmail || null,
              p_customer_phone: customerPhone || '',
            }),
            supabase.rpc('get_public_customer_unread_waitlist_badge_rows', {
              p_salon_code: salonCode,
              p_customer_email: customerEmail || null,
              p_customer_phone: customerPhone || '',
            }),
            supabase.rpc('get_public_customer_unread_communication_count_v1', {
              p_salon_code: salonCode,
              p_customer_email: customerEmail || null,
              p_customer_phone: customerPhone || '',
            }),
          ]);

          if (requestResult.error || waitlistResult.error || communicationsResult.error) {
            console.log('send-push client total unread badge count lookup failed', {
              requestsError: requestResult.error?.message ?? null,
              waitlistError: waitlistResult.error?.message ?? null,
              communicationsError: communicationsResult.error?.message ?? null,
            });
            return emptyDebug('client');
          }

          const unreadRows = (requestResult.data ?? []) as Record<string, unknown>[];
          const latestByBookingIdentity = new Map<string, (typeof unreadRows)[number]>();
          unreadRows.forEach((item) => {
            const identityKey = buildClientRequestBadgeBaseKey(item);
            if (!identityKey) {
              return;
            }

            const current = latestByBookingIdentity.get(identityKey);
            if (!current || compareClientRequestBadgePriority(current, item) < 0) {
              latestByBookingIdentity.set(identityKey, item);
            }
          });
          const latestByWaitlistIdentity = new Map<string, Record<string, unknown>>();
          ((waitlistResult.data ?? []) as Record<string, unknown>[]).forEach((item) => {
            const identityKey = buildClientWaitlistBadgeKey(item);
            if (!identityKey) {
              return;
            }

            const current = latestByWaitlistIdentity.get(identityKey);
            const currentStamp = Date.parse(
              String(current?.updated_at ?? current?.notified_at ?? current?.created_at ?? '').trim()
            ) || 0;
            const nextStamp = Date.parse(
              String(item.updated_at ?? item.notified_at ?? item.created_at ?? '').trim()
            ) || 0;
            if (!current || nextStamp >= currentStamp) {
              latestByWaitlistIdentity.set(identityKey, item);
            }
          });
          const clientPrenotazioniUnread = latestByBookingIdentity.size;
          const clientWaitlistUnread = latestByWaitlistIdentity.size;
          const clientCommunicationsUnread = Math.max(
            0,
            Math.trunc(Number(communicationsResult.data ?? 0) || 0)
          );
          const calculatedAbsoluteBadge = Math.max(
            0,
            clientPrenotazioniUnread + clientWaitlistUnread + clientCommunicationsUnread
          );

          return {
            target: 'client',
            pushType,
            calculationSucceeded: true,
            calculatedAbsoluteBadge,
            ownerPrenotazioniUnread: 0,
            ownerClientiUnread: 0,
            clientPrenotazioniUnread,
            clientWaitlistUnread,
            clientCommunicationsUnread,
            finalPayloadBadge: calculatedAbsoluteBadge,
            countedBookingRequestIds: Array.from(latestByBookingIdentity.values())
              .map((item) => String(item.id ?? '').trim())
              .filter(Boolean),
            countedCustomerIds: [],
            countedWaitlistIds: Array.from(latestByWaitlistIdentity.values())
              .map((item) => String(item.id ?? '').trim())
              .filter(Boolean),
            countedCommunicationIds: [],
          };
        }
      } catch (error) {
        console.log('send-push badge count lookup error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return emptyDebug(isOwnerPush ? 'owner' : isClientPush ? 'client' : 'unknown');
    };

    const badgeDebugByNotificationId = new Map<string, BadgeDebugInfo>();
    await Promise.all(
      claimedRows.map(async (row) => {
        badgeDebugByNotificationId.set(row.notification_id, await resolveBadgeCountForRow(row));
      })
    );

    console.log(
      'SALONPRO_PUSH_DIAG claimed_rows',
      claimedRows.map((row) =>
        buildPushDiagnostic(row, badgeRecipientInfoByNotificationId.get(row.notification_id), {
          phase: 'claimed',
        })
      )
    );

    const buildSendDedupeKey = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const pushEventType = normalizeDedupeValue(payload._pushEventType ?? payload.type ?? row.event_type);
      const bookingRequestId = normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId);
      const ownerBookingSemanticKey = [
        pushEventType,
        normalizeDedupeValue(payload.statusCode ?? payload.status),
        normalizeDedupeValue(payload.cancellationSource),
      ].join(':');
      const isOwnerBookingEvent =
        pushTarget === 'owner' &&
        [
          'booking_request_created',
          'booking_request_status_changed',
          'appointment_cancelled',
          'owner_badge_refresh',
        ].includes(pushEventType);

      if (isOwnerBookingEvent && bookingRequestId) {
        return [
          normalizeDedupeValue(payload._pushWorkspaceId),
          normalizeDedupeValue(row.expo_push_token),
          'owner-booking-request',
          bookingRequestId,
          ownerBookingSemanticKey,
        ].join('|');
      }

      if (isOwnerBookingEvent) {
        return [
          normalizeDedupeValue(payload._pushWorkspaceId),
          normalizeDedupeValue(row.expo_push_token),
          'owner-booking-fallback',
          normalizeDedupeValue(payload.appointmentDate),
          normalizeDedupeValue(payload.appointmentTime),
          normalizeDedupeValue(payload.customerName),
          normalizeDedupeValue(payload.serviceName),
          normalizeDedupeValue(row.body),
        ].join('|');
      }

      const explicitDedupeKey = normalizeDedupeValue(payload._dedupeKey);
      if (explicitDedupeKey) {
        const clientEventId = normalizeDedupeValue(payload.eventId ?? payload.notificationId);
        const isClientBookingEvent =
          pushTarget === 'client' &&
          [
            'booking_request_status_changed',
            'appointment_cancelled',
            'appointment_cancelled_by_salon',
            'appointment_created',
            'appointment_created_by_salon',
            'appointment_updated',
            'appointment_rescheduled',
            'appointment_rescheduled_by_salon',
          ].includes(pushEventType);

        if (isClientBookingEvent && clientEventId) {
          return [explicitDedupeKey, clientEventId].join('|');
        }

        return explicitDedupeKey;
      }

      return [
        normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience),
        normalizeDedupeValue(payload._pushEventType ?? payload.type),
        normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId),
        normalizeDedupeValue(payload.appointmentId),
        normalizeDedupeValue(payload.appointmentDate),
        normalizeDedupeValue(payload.appointmentTime),
        normalizeDedupeValue(payload.customerName),
        normalizeDedupeValue(payload.serviceName),
        normalizeDedupeValue(payload.statusCode ?? payload.status),
        normalizeDedupeValue(row.title),
        normalizeDedupeValue(row.body),
      ].join('|');
    };
    const buildOwnerBookingDedupeInfo = (
      row: ClaimedPushRow
    ): OwnerBookingDedupeInfo | null => {
      const payload = row.payload ?? {};
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const pushEventType = normalizeDedupeValue(payload._pushEventType ?? payload.type ?? row.event_type);
      const bookingRequestId = normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId);
      const ownerBookingSemanticKey = [
        pushEventType,
        normalizeDedupeValue(payload.statusCode ?? payload.status),
        normalizeDedupeValue(payload.cancellationSource),
      ].join(':');
      const isOwnerBookingEvent =
        (pushTarget === 'owner' || recipientInfo?.recipientKind === 'owner') &&
        [
          'booking_request_created',
          'booking_request_status_changed',
          'appointment_cancelled',
          'owner_badge_refresh',
        ].includes(pushEventType);

      if (!isOwnerBookingEvent) {
        return null;
      }

      const workspaceId =
        recipientInfo?.workspaceId ??
        (typeof payload._pushWorkspaceId === 'string' ? payload._pushWorkspaceId : null);
      const deviceId = recipientInfo?.deviceId ?? null;
      const fallbackKey = [
        normalizeDedupeValue(payload.appointmentDate),
        normalizeDedupeValue(payload.appointmentTime),
        normalizeDedupeValue(payload.customerName),
        normalizeDedupeValue(payload.serviceName),
        normalizeDedupeValue(row.body),
      ].join('|');
      const key = [
        workspaceId ?? '',
        deviceId ?? '',
        bookingRequestId ? 'booking' : 'fallback',
        bookingRequestId || fallbackKey,
        ownerBookingSemanticKey,
      ].join('|');

      return {
        key,
        workspaceId,
        deviceId,
        notificationCreatedAt: recipientInfo?.notificationCreatedAt ?? null,
        bookingRequestId: bookingRequestId || null,
        semanticKey: ownerBookingSemanticKey,
      };
    };
    const hasRecentSentOwnerBookingPush = async (info: OwnerBookingDedupeInfo) => {
      if (!info.workspaceId || !info.deviceId || !info.notificationCreatedAt) {
        return false;
      }

      const createdAtMs = Date.parse(info.notificationCreatedAt);
      if (!Number.isFinite(createdAtMs)) {
        return false;
      }

      const since = new Date(createdAtMs - OWNER_BOOKING_PUSH_DEDUPE_WINDOW_MS).toISOString();
      const until = info.notificationCreatedAt;
      const keyParts = info.key.split('|');
      const identityKind = keyParts[2] ?? '';

      const result = await supabase
        .from('push_notifications')
        .select('id,payload')
        .eq('workspace_id', info.workspaceId)
        .eq('device_id', info.deviceId)
        .in('status', ['sent', 'processing'])
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(20);
      if (result.error) {
        console.log('send-push owner recent duplicate lookup failed', {
          error: result.error.message,
        });
        return false;
      }

      if (identityKind !== 'booking' || !info.bookingRequestId) {
        return false;
      }

      return (result.data ?? []).some((candidate) => {
        const payload =
          typeof candidate.payload === 'object' && candidate.payload !== null
            ? (candidate.payload as Record<string, unknown>)
            : {};
        const candidatePushEventType = normalizeDedupeValue(
          payload._pushEventType ?? payload.type
        );
        const candidateSemanticKey = [
          candidatePushEventType,
          normalizeDedupeValue(payload.statusCode ?? payload.status),
          normalizeDedupeValue(payload.cancellationSource),
        ].join(':');
        return (
          (normalizeDedupeValue(payload.bookingRequestId) === info.bookingRequestId ||
            normalizeDedupeValue(payload.requestId) === info.bookingRequestId) &&
          candidateSemanticKey === info.semanticKey
        );
      });
    };
    const rowsToSend: ClaimedPushRow[] = [];
    const duplicateRows: ClaimedPushRow[] = [];
    const staleRows: ClaimedPushRow[] = [];
    const seenSendKeys = new Set<string>();
    const seenOwnerBookingKeys = new Set<string>();
    const androidClientBookingKeyIndexes = new Map<string, number>();
    const buildAndroidClientBookingBaseKey = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      const isClientRecipient = pushTarget === 'client' || recipientInfo?.recipientKind === 'client';
      const isClientBookingEvent =
        pushEventType === 'booking_request_status_changed' ||
        pushEventType === 'appointment_cancelled' ||
        pushEventType === 'appointment_cancelled_by_salon' ||
        pushEventType === 'appointment_created' ||
        pushEventType === 'appointment_created_by_salon' ||
        pushEventType === 'appointment_updated' ||
        pushEventType === 'appointment_rescheduled' ||
        pushEventType === 'appointment_rescheduled_by_salon' ||
        payloadType === 'booking_request_status_changed' ||
        payloadType === 'appointment_cancelled' ||
        payloadType === 'appointment_cancelled_by_salon' ||
        payloadType === 'appointment_created' ||
        payloadType === 'appointment_created_by_salon' ||
        payloadType === 'appointment_updated' ||
        payloadType === 'appointment_rescheduled' ||
        payloadType === 'appointment_rescheduled_by_salon';

      if (!isClientRecipient || !isClientBookingEvent) {
        return '';
      }

      return [
        recipientInfo?.workspaceId ?? normalizeDedupeValue(payload._pushWorkspaceId),
        recipientInfo?.deviceId ?? normalizeDedupeValue(row.expo_push_token),
        normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId),
        normalizeDedupeValue(payload.appointmentId),
        normalizeDedupeValue(payload.customerEmail ?? recipientInfo?.customerEmail),
        normalizePhoneDigits(payload.customerPhone ?? recipientInfo?.customerPhone),
        normalizeDedupeValue(payload.appointmentDate),
        normalizeDedupeValue(payload.appointmentTime),
        normalizeDedupeValue(payload.serviceName),
        normalizeDedupeValue(payload.eventId ?? payload.notificationId),
      ].join('|');
    };
    const buildAndroidClientBookingSemanticKey = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const baseKey = buildAndroidClientBookingBaseKey(row);
      if (!baseKey) {
        return '';
      }

      return [
        baseKey,
        normalizeDedupeValue(payload.statusCode ?? payload.status ?? pushEventType),
        normalizeDedupeValue(payload.cancellationSource),
        normalizeDedupeValue(payload.eventId ?? payload.notificationId),
      ].join('|');
    };
    const buildAndroidClientMoveConflictKey = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      const isClientRecipient = pushTarget === 'client' || recipientInfo?.recipientKind === 'client';
      const isMoveConflictCandidate =
        pushEventType === 'booking_request_status_changed' ||
        pushEventType === 'appointment_cancelled' ||
        pushEventType === 'appointment_cancelled_by_salon' ||
        pushEventType === 'appointment_created' ||
        pushEventType === 'appointment_created_by_salon' ||
        pushEventType === 'appointment_updated' ||
        pushEventType === 'appointment_rescheduled' ||
        pushEventType === 'appointment_rescheduled_by_salon' ||
        payloadType === 'booking_request_status_changed' ||
        payloadType === 'appointment_cancelled' ||
        payloadType === 'appointment_cancelled_by_salon' ||
        payloadType === 'appointment_created' ||
        payloadType === 'appointment_created_by_salon' ||
        payloadType === 'appointment_updated' ||
        payloadType === 'appointment_rescheduled' ||
        payloadType === 'appointment_rescheduled_by_salon';

      if (!isClientRecipient || !isMoveConflictCandidate) {
        return '';
      }

      const appointmentIdentity = normalizeDedupeValue(
        payload.appointmentId ?? payload.bookingRequestId ?? payload.requestId
      );
      const customerIdentity =
        normalizeDedupeValue(payload.customerEmail ?? recipientInfo?.customerEmail) ||
        normalizePhoneDigits(payload.customerPhone ?? recipientInfo?.customerPhone);
      const serviceName = normalizeDedupeValue(payload.serviceName);

      if (!appointmentIdentity && (!customerIdentity || !serviceName)) {
        return '';
      }

      return [
        recipientInfo?.workspaceId ?? normalizeDedupeValue(payload._pushWorkspaceId),
        recipientInfo?.deviceId ?? normalizeDedupeValue(row.expo_push_token),
        customerIdentity,
        appointmentIdentity,
        serviceName,
      ].join('|');
    };
    const getClientBookingPushStatus = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      return normalizeDedupeValue(payload.statusCode ?? payload.status ?? pushEventType);
    };
    const isAcceptedClientBookingPush = (row: ClaimedPushRow) => {
      const status = getClientBookingPushStatus(row);
      return status === 'accepted' || status === 'accettata' || status === 'auto_accepted';
    };
    const isRescheduledClientBookingPush = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      return (
        pushEventType === 'appointment_rescheduled' ||
        pushEventType === 'appointment_rescheduled_by_salon' ||
        payloadType === 'appointment_rescheduled' ||
        payloadType === 'appointment_rescheduled_by_salon'
      );
    };
    const isCreatedOrAcceptedClientBookingPush = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      return (
        pushEventType === 'appointment_created' ||
        pushEventType === 'appointment_created_by_salon' ||
        payloadType === 'appointment_created' ||
        payloadType === 'appointment_created_by_salon' ||
        isAcceptedClientBookingPush(row)
      );
    };
    const isAppointmentCreatedClientBookingPush = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      return (
        pushEventType === 'appointment_created' ||
        pushEventType === 'appointment_created_by_salon' ||
        payloadType === 'appointment_created' ||
        payloadType === 'appointment_created_by_salon'
      );
    };
    const isSalonAppointmentCancelledPush = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(
        payload.event_type ?? payload.notificationType ?? payload._pushEventType ?? payload.type ?? row.event_type
      );
      const payloadType = normalizeDedupeValue(payload.type);
      const cancellationSource = normalizeDedupeValue(payload.cancellationSource);
      const payloadSource = normalizeDedupeValue(payload.source);
      const status = normalizeDedupeValue(payload.statusCode ?? payload.status);

      return (
        pushEventType === 'appointment_cancelled_by_salon' ||
        payloadType === 'appointment_cancelled_by_salon' ||
        (
          (pushEventType === 'appointment_cancelled' ||
            payloadType === 'appointment_cancelled' ||
            pushEventType === 'booking_request_status_changed') &&
          (status === 'cancelled' || status === 'annullata') &&
          (cancellationSource === 'salone' ||
            payloadSource === 'owner' ||
            payloadSource === 'backoffice' ||
            payloadSource === 'salone')
        )
      );
    };
    const isSalonCancelledClientBookingPush = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const status = getClientBookingPushStatus(row);
      const cancellationSource = normalizeDedupeValue(payload.cancellationSource);
      const payloadSource = normalizeDedupeValue(payload.source);
      return (
        isSalonAppointmentCancelledPush(row) ||
        (status === 'cancelled' || status === 'annullata') &&
        (cancellationSource === 'salone' ||
          payloadSource === 'owner' ||
          payloadSource === 'backoffice' ||
          payloadSource === 'salone')
      );
    };
    const androidClientSalonCancellationBaseKeys = new Set(
      claimedRows
        .filter((row) => isSalonCancelledClientBookingPush(row))
        .map((row) => buildAndroidClientBookingBaseKey(row))
        .filter(Boolean)
    );
    const androidClientSalonCancellationConflictKeys = new Set(
      claimedRows
        .filter((row) => isSalonCancelledClientBookingPush(row))
        .map((row) => buildAndroidClientMoveConflictKey(row))
        .filter(Boolean)
    );
    const androidClientRescheduleConflictKeys = new Set(
      claimedRows
        .filter((row) => isRescheduledClientBookingPush(row))
        .map((row) => buildAndroidClientMoveConflictKey(row))
        .filter(Boolean)
    );
    const getAndroidClientBookingRichnessScore = (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushEventType = normalizeDedupeValue(payload._pushEventType ?? payload.type ?? row.event_type);
      let score = 0;

      if (normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId)) score += 8;
      if (normalizeDedupeValue(payload.appointmentId)) score += 3;
      if (normalizeDedupeValue(payload.operatorName ?? payload.operatorId)) score += 2;
      if (normalizeDedupeValue(payload.roleName ?? payload.mestiereRichiesto)) score += 2;
      if (pushEventType === 'appointment_cancelled') score += 5;
      if (pushEventType === 'booking_request_status_changed') score += 2;

      return score;
    };
    const isStaleClientBookingStatusPush = async (row: ClaimedPushRow) => {
      const payload = row.payload ?? {};
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const pushEventType = normalizeDedupeValue(payload._pushEventType ?? payload.type ?? row.event_type);
      const bookingRequestId = normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId);

      if (pushTarget !== 'client' || pushEventType !== 'booking_request_status_changed' || !bookingRequestId) {
        return false;
      }

      const expectedStatus = normalizeDedupeValue(payload.statusCode);
      if (!expectedStatus) {
        return false;
      }

      if (!UUID_PATTERN.test(bookingRequestId)) {
        return false;
      }

      const result = await supabase
        .from('booking_requests')
        .select('status,payment_hold_state,cancellation_source,viewed_by_customer')
        .eq('id', bookingRequestId)
        .maybeSingle();

      if (result.error || !result.data) {
        return true;
      }

      if (result.data.payment_hold_state && result.data.payment_hold_state !== 'paid') return true;

      const currentStatus = normalizeDedupeValue(result.data.status);
      const currentCancellationSource = normalizeDedupeValue(result.data.cancellation_source);
      const payloadSource = normalizeDedupeValue(payload.source);
      const expectedCancellationSource =
        normalizeDedupeValue(payload.cancellationSource) ||
        (expectedStatus === 'cancelled' &&
        (payloadSource === 'owner' || payloadSource === 'backoffice' || payloadSource === 'salone')
          ? 'salone'
          : '');

      if (result.data.viewed_by_customer === true) {
        return true;
      }

      if (currentStatus !== expectedStatus) {
        return true;
      }

      if (currentStatus === 'cancelled' && currentCancellationSource !== expectedCancellationSource) {
        return true;
      }

      return currentStatus === 'cancelled' && currentCancellationSource === 'cliente';
    };
    const isStaleCreatedOrAcceptedClientBookingPush = async (
      row: ClaimedPushRow
    ) => {
      if (!isCreatedOrAcceptedClientBookingPush(row)) {
        return false;
      }

      const payload = row.payload ?? {};
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const isClientRecipient = pushTarget === 'client' || recipientInfo?.recipientKind === 'client';
      const bookingRequestId = normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId);

      if (!isClientRecipient || !UUID_PATTERN.test(bookingRequestId)) {
        return false;
      }

      const result = await supabase
        .from('booking_requests')
        .select('status,payment_hold_state,origin,viewed_by_customer')
        .eq('id', bookingRequestId)
        .maybeSingle();

      if (result.error || !result.data) {
        return true;
      }

      if (result.data.payment_hold_state && result.data.payment_hold_state !== 'paid') return true;

      if (
        normalizeDedupeValue(result.data.status) !== 'accepted' ||
        result.data.viewed_by_customer === true
      ) {
        return true;
      }

      // "Aggiunto dal salone" is valid only for a real backoffice request.
      // A frontend request accepted by the salon must use the confirmation copy.
      if (
        isAppointmentCreatedClientBookingPush(row) &&
        normalizeDedupeValue(result.data.origin) !== 'backoffice'
      ) {
        return true;
      }

      // `booking_requests` has no `linked_appointment_id` column. The
      // authoritative relation lives on `appointments.booking_request_id`.
      // Querying the non-existent reverse column made every accepted/created
      // client push look stale, while cancellations kept working because they
      // follow a different validation path.
      const appointmentResult = await supabase
        .from('appointments')
        .select('id')
        .eq('booking_request_id', bookingRequestId)
        .limit(1)
        .maybeSingle();

      return !!appointmentResult.error || !appointmentResult.data;
    };
    const isLateCreatedPushAfterSalonCancellation = async (row: ClaimedPushRow) => {
      if (!isAppointmentCreatedClientBookingPush(row)) {
        return false;
      }

      const payload = row.payload ?? {};
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const pushTarget = normalizeDedupeValue(payload._pushTarget ?? payload._pushAudience);
      const isClientRecipient = pushTarget === 'client' || recipientInfo?.recipientKind === 'client';
      if (!isClientRecipient) {
        return false;
      }

      const workspaceId =
        recipientInfo?.workspaceId ??
        (typeof payload._pushWorkspaceId === 'string' ? payload._pushWorkspaceId : null);
      if (!workspaceId) {
        return false;
      }

      const bookingRequestId = normalizeDedupeValue(payload.bookingRequestId ?? payload.requestId);
      const appointmentId = normalizeDedupeValue(payload.appointmentId);
      const appointmentDate = normalizeDedupeValue(payload.appointmentDate);
      const appointmentTime = normalizeDedupeValue(payload.appointmentTime);
      const serviceName = normalizeDedupeValue(payload.serviceName);
      const customerEmail = normalizeDedupeValue(payload.customerEmail ?? recipientInfo?.customerEmail);
      const customerPhone = normalizePhoneDigits(payload.customerPhone ?? recipientInfo?.customerPhone);
      const customerName = normalizeDedupeValue(payload.customerName);

      if (appointmentId && UUID_PATTERN.test(appointmentId)) {
        const appointmentResult = await supabase
          .from('appointments')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('id', appointmentId)
          .maybeSingle();

        if (appointmentResult.error) {
          console.log('send-push late created appointment existence lookup failed', {
            error: appointmentResult.error.message,
          });
        } else if (!appointmentResult.data) {
          return true;
        }
      }

      const result = await supabase
        .from('booking_requests')
        .select('id,linked_appointment_id,status,cancellation_source,viewed_by_customer,customer_email,customer_phone,customer_name,customer_surname,appointment_date,appointment_time,requested_service_name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'cancelled')
        .eq('cancellation_source', 'salone')
        .eq('viewed_by_customer', false)
        .limit(25);

      if (result.error) {
        console.log('send-push late created cancellation lookup failed', {
          error: result.error.message,
        });
        return false;
      }

      return (result.data ?? []).some((requestRow) => {
        const requestId = normalizeDedupeValue(requestRow.id);
        const linkedAppointmentId = normalizeDedupeValue(requestRow.linked_appointment_id);
        if (bookingRequestId && requestId === bookingRequestId) {
          return true;
        }
        if (appointmentId && linkedAppointmentId === appointmentId) {
          return true;
        }

        const sameSlot =
          appointmentDate &&
          appointmentTime &&
          serviceName &&
          normalizeDedupeValue(requestRow.appointment_date) === appointmentDate &&
          normalizeDedupeValue(String(requestRow.appointment_time).slice(0, 5)) ===
            normalizeDedupeValue(appointmentTime.slice(0, 5)) &&
          normalizeDedupeValue(requestRow.requested_service_name) === serviceName;
        if (!sameSlot) {
          return false;
        }

        const requestEmail = normalizeDedupeValue(requestRow.customer_email);
        const requestPhone = normalizePhoneDigits(requestRow.customer_phone);
        const requestName = normalizeDedupeValue(
          `${requestRow.customer_name ?? ''} ${requestRow.customer_surname ?? ''}`
        );

        return (
          (!!customerEmail && requestEmail === customerEmail) ||
          (!!customerPhone && requestPhone === customerPhone) ||
          (!!customerName && requestName === customerName)
        );
      });
    };

    const timingEligibilityByKey = new Map<string, Promise<boolean>>();
    for (const row of claimedRows) {
      const timingEvents = ['appointment_reminder', 'appointment_rescheduled', 'appointment_rescheduled_by_salon'];
      const timingEvent = [row.payload?.event_type, row.payload?.notificationType, row.payload?._pushEventType, row.payload?.type, row.event_type]
        .map(value => String(value ?? '').toLowerCase()).find(value => timingEvents.includes(value));
      const timingPayload = { ...row.payload, event_type: timingEvent };
      if (timingEvent) {
        const workspaceId = badgeRecipientInfoByNotificationId.get(row.notification_id)?.workspaceId ?? row.payload?._pushWorkspaceId;
        const key = JSON.stringify([workspaceId, timingPayload]);
        let eligibility = timingEligibilityByKey.get(key);
        if (!eligibility) {
          eligibility = (async () => {
            if (typeof workspaceId !== 'string' || !workspaceId) return false;
            const result = await supabase.rpc('customer_timing_push_is_current_v1', { p_workspace_id: workspaceId, p_payload: timingPayload });
            // A lookup error retries the batch; it must never allow an obsolete notice through.
            if (result.error) throw result.error;
            return result.data === true;
          })();
          timingEligibilityByKey.set(key, eligibility);
        }
        if (!(await eligibility)) { staleRows.push(row); continue; }
      }
      if (row.payload?._serviceRevision === true) {
        const revision = await supabase.from('appointment_payment_revisions').select('revision').eq('appointment_id', row.payload.appointmentId).maybeSingle();
        const appointment = await supabase.from('appointments').select('no_show').eq('id', row.payload.appointmentId).maybeSingle();
        const request = row.payload.bookingRequestId ? await supabase.from('booking_requests').select('status').eq('id', row.payload.bookingRequestId).maybeSingle() : { data: null, error: null };
        if (revision.error || appointment.error || request.error) throw revision.error || appointment.error || request.error;
        if (!appointment.data || appointment.data.no_show || (row.payload.bookingRequestId && request.data?.status !== 'accepted') || Number(revision.data?.revision) !== Number(row.payload.revision)) { staleRows.push(row); continue; }
      }

      if (row.payload?.type === 'booking_payment_due') {
        const due = await supabase.rpc('booking_payment_notice_is_due', { p_request: row.payload.bookingRequestId });
        // A transient lookup failure must retry the batch, not lose a reminder.
        if (due.error) throw due.error;
        if (!due.data) { staleRows.push(row); continue; }
      }

      if (await isStaleClientBookingStatusPush(row)) {
        staleRows.push(row);
        continue;
      }
      if (await isStaleCreatedOrAcceptedClientBookingPush(row)) {
        staleRows.push(row);
        continue;
      }
      if (await isLateCreatedPushAfterSalonCancellation(row)) {
        staleRows.push(row);
        continue;
      }

      const androidClientBookingKey = buildAndroidClientBookingSemanticKey(row);
      const androidClientBookingBaseKey = buildAndroidClientBookingBaseKey(row);
      const androidClientMoveConflictKey = buildAndroidClientMoveConflictKey(row);
      if (
        androidClientMoveConflictKey &&
        androidClientSalonCancellationConflictKeys.has(androidClientMoveConflictKey) &&
        !isSalonCancelledClientBookingPush(row) &&
        isCreatedOrAcceptedClientBookingPush(row)
      ) {
        duplicateRows.push(row);
        continue;
      }

      if (
        androidClientMoveConflictKey &&
        androidClientRescheduleConflictKeys.has(androidClientMoveConflictKey) &&
        !isRescheduledClientBookingPush(row) &&
        isCreatedOrAcceptedClientBookingPush(row)
      ) {
        duplicateRows.push(row);
        continue;
      }

      if (
        androidClientBookingBaseKey &&
        androidClientSalonCancellationBaseKeys.has(androidClientBookingBaseKey) &&
        isCreatedOrAcceptedClientBookingPush(row)
      ) {
        duplicateRows.push(row);
        continue;
      }

      if (androidClientBookingKey) {
        const existingIndex = androidClientBookingKeyIndexes.get(androidClientBookingKey);
        if (typeof existingIndex === 'number') {
          const existingRow = rowsToSend[existingIndex];
          if (
            existingRow &&
            getAndroidClientBookingRichnessScore(row) > getAndroidClientBookingRichnessScore(existingRow)
          ) {
            duplicateRows.push(existingRow);
            rowsToSend[existingIndex] = row;
            continue;
          }

          duplicateRows.push(row);
          continue;
        }
      }

      const dedupeKey = buildSendDedupeKey(row);
      const ownerBookingDedupeInfo = buildOwnerBookingDedupeInfo(row);
      const ownerBookingDedupeKey = ownerBookingDedupeInfo?.key ?? '';
      if (
        seenSendKeys.has(dedupeKey) ||
        (!!ownerBookingDedupeKey && seenOwnerBookingKeys.has(ownerBookingDedupeKey)) ||
        (!!ownerBookingDedupeInfo &&
          (await hasRecentSentOwnerBookingPush(ownerBookingDedupeInfo)))
      ) {
        duplicateRows.push(row);
        continue;
      }

      seenSendKeys.add(dedupeKey);
      if (ownerBookingDedupeKey) {
        seenOwnerBookingKeys.add(ownerBookingDedupeKey);
      }
      rowsToSend.push(row);
      if (androidClientBookingKey) {
        androidClientBookingKeyIndexes.set(androidClientBookingKey, rowsToSend.length - 1);
      }
    }

    if (duplicateRows.length > 0) {
      console.log('send-push duplicate claimed rows suppressed', {
        duplicates: duplicateRows.length,
        processed: claimedRows.length,
      });
      console.log(
        'SALONPRO_PUSH_DIAG duplicate_rows_suppressed',
        duplicateRows.map((row) =>
          buildPushDiagnostic(row, badgeRecipientInfoByNotificationId.get(row.notification_id), {
            phase: 'suppressed_duplicate',
          })
        )
      );
    }
    if (staleRows.length > 0) {
      console.log('send-push stale client booking status rows suppressed', {
        stale: staleRows.length,
        processed: claimedRows.length,
      });
      console.log(
        'SALONPRO_PUSH_DIAG stale_rows_suppressed',
        staleRows.map((row) =>
          buildPushDiagnostic(row, badgeRecipientInfoByNotificationId.get(row.notification_id), {
            phase: 'suppressed_stale',
          })
        )
      );
    }

    console.log(
      'SALONPRO_PUSH_DIAG rows_to_expo',
      rowsToSend.map((row) =>
        buildPushDiagnostic(row, badgeRecipientInfoByNotificationId.get(row.notification_id), {
          phase: 'send_to_expo',
          finalBadge: badgeDebugByNotificationId.get(row.notification_id)?.calculationSucceeded
            ? badgeDebugByNotificationId.get(row.notification_id)?.finalPayloadBadge
            : null,
          badgeTarget: badgeDebugByNotificationId.get(row.notification_id)?.target ?? 'unknown',
          countedBookingRequestIds:
            badgeDebugByNotificationId.get(row.notification_id)?.countedBookingRequestIds ?? [],
        })
      )
    );

    const androidBadgeOnlyPayload: Array<Record<string, unknown>> = [];
    const expoPayload = rowsToSend.map((row) => {
      const isBadgeOnlyRefresh = row.payload?._badgeOnly === true;
      const recipientInfo = badgeRecipientInfoByNotificationId.get(row.notification_id);
      const isAndroidRecipient = recipientInfo?.platform === 'android';
      const isAndroidClientRecipient =
        isAndroidRecipient && recipientInfo?.recipientKind === 'client';
      const badgeDebug = badgeDebugByNotificationId.get(row.notification_id);
      const hasAbsoluteBadge = badgeDebug?.calculationSucceeded === true;
      const finalPayloadBadge = hasAbsoluteBadge ? (badgeDebug?.finalPayloadBadge ?? 0) : null;
      const isSalonCancellationPush = isSalonAppointmentCancelledPush(row);
      const isOwnerCustomerCancellationPush =
        recipientInfo?.recipientKind === 'owner' &&
        normalizeDedupeValue(row.payload?.statusCode ?? row.payload?.status) === 'cancelled' &&
        ['cliente', 'customer'].includes(
          normalizeDedupeValue(row.payload?.cancellationSource)
        );
      const cancellationDetailsBody = [
        row.payload?.serviceName ? `Servizio: ${row.payload.serviceName}` : '',
        row.payload?.appointmentDate ? `Data: ${row.payload.appointmentDate}` : '',
        row.payload?.appointmentTime ? `Ora: ${row.payload.appointmentTime}` : '',
      ]
        .filter(Boolean)
        .join('. ');
      const currentBody = String(row.body ?? '').trim();
      const isSalonRescheduledPush = isRescheduledClientBookingPush(row);
      const rescheduleStatusCode = normalizeDedupeValue(
        row.payload?.eventStatusCode ?? row.payload?.statusCode ?? row.payload?.status
      );
      const isSalonOperatorUpdatePush =
        isSalonRescheduledPush &&
        (
          rescheduleStatusCode.includes(':operator:') ||
          (
            normalizeDedupeValue(row.payload?.previousDate) ===
              normalizeDedupeValue(row.payload?.appointmentDate) &&
            formatCompactPushTime(row.payload?.previousTime) ===
              formatCompactPushTime(row.payload?.appointmentTime) &&
            Boolean(
              compactPushText(row.payload?.previousOperatorName) &&
                compactPushText(row.payload?.operatorName)
            )
          )
        );
      const isSalonCreatedPush = isAppointmentCreatedClientBookingPush(row);
      const rescheduleDetailsBody = [
        row.payload?.serviceName ? `Servizio: ${row.payload.serviceName}` : '',
        row.payload?.appointmentDate ? `Nuova data: ${row.payload.appointmentDate}` : '',
        row.payload?.appointmentTime ? `Nuovo orario: ${row.payload.appointmentTime}` : '',
      ]
        .filter(Boolean)
        .join('. ');
      const createdDetailsBody = [
        row.payload?.serviceName ? `Servizio: ${row.payload.serviceName}` : '',
        row.payload?.appointmentDate ? `Data: ${row.payload.appointmentDate}` : '',
        row.payload?.appointmentTime ? `Ora: ${row.payload.appointmentTime}` : '',
      ]
        .filter(Boolean)
        .join('. ');
      const shouldReplaceBody =
        isSalonCancellationPush &&
        (!currentBody ||
          /nuova richiesta|richiesta aggiunta|nuovo appuntamento|appuntamento aggiunto|appointment_created|booking_request_created/i.test(
            currentBody
          ));
      const visibleTitle = isSalonCancellationPush
        ? 'Appuntamento cancellato dal salone'
        : isSalonOperatorUpdatePush
          ? 'Aggiornamento appuntamento'
        : isSalonRescheduledPush
          ? 'Appuntamento spostato'
        : isSalonCreatedPush
          ? 'Appuntamento aggiunto dal salone'
        : isOwnerCustomerCancellationPush
          ? 'Richiesta annullata dal cliente'
        : row.title;
      const fallbackVisibleBody =
        isSalonCancellationPush && shouldReplaceBody
          ? cancellationDetailsBody || 'Il salone ha cancellato un appuntamento.'
          : isSalonRescheduledPush
            ? rescheduleDetailsBody || row.body || 'Il salone ha spostato un appuntamento.'
          : isSalonCreatedPush && !String(row.body ?? '').trim()
            ? createdDetailsBody || 'Il salone ha aggiunto un nuovo appuntamento.'
          : isOwnerCustomerCancellationPush && !String(row.body ?? '').trim()
            ? cancellationDetailsBody || 'Il cliente ha annullato una richiesta.'
          : row.body;
      const visibleBody = row.payload?.type === 'booking_payment_due' || row.payload?._serviceRevision === true ? row.body :
        (isSalonOperatorUpdatePush ? currentBody : '') ||
        buildCompactAppointmentPushBody(
          row,
          recipientInfo?.recipientKind ?? String(row.payload?._pushTarget ?? '')
        ) || fallbackVisibleBody;
      const payloadForExpo = isSalonCancellationPush
        ? {
            ...(row.payload ?? {}),
            type: 'appointment_cancelled_by_salon',
            event_type: 'appointment_cancelled_by_salon',
            notificationType: 'appointment_cancelled_by_salon',
            status: 'Annullata',
            statusCode: 'cancelled',
            cancellationSource: 'salone',
          }
        : isSalonRescheduledPush
          ? {
              ...(row.payload ?? {}),
              type: 'appointment_rescheduled_by_salon',
              event_type: 'appointment_rescheduled_by_salon',
              notificationType: 'appointment_rescheduled_by_salon',
              source: 'owner',
            }
        : isSalonCreatedPush
          ? {
              ...(row.payload ?? {}),
              type: 'appointment_created_by_salon',
              event_type: 'appointment_created_by_salon',
              notificationType: 'appointment_created_by_salon',
              source: 'owner',
            }
        : isOwnerCustomerCancellationPush
          ? {
              ...(row.payload ?? {}),
              type: 'booking_request_status_changed',
              event_type: 'booking_request_status_changed',
              notificationType: 'booking_request_status_changed',
              notificationId: row.payload?.notificationId ?? row.notification_id,
              eventId:
                row.payload?.eventId ??
                row.payload?._dedupeKey ??
                [
                  row.payload?._pushWorkspaceId,
                  row.payload?.bookingRequestId ?? row.payload?.requestId,
                  'cancelled',
                  'cliente',
                ]
                  .map((value) => String(value ?? '').trim())
                  .filter(Boolean)
                  .join(':'),
              status: 'Annullata',
              statusCode: 'cancelled',
              cancellationSource: 'cliente',
            }
        : row.payload ?? {};
      const recipientRole =
        badgeDebug?.target === 'owner' || badgeDebug?.target === 'client'
          ? badgeDebug.target
          : recipientInfo?.recipientKind || 'unknown';
      const payloadWithAbsoluteBadge = {
        ...payloadForExpo,
        notificationId: payloadForExpo.notificationId ?? row.notification_id,
        eventId:
          payloadForExpo.eventId ??
          payloadForExpo._dedupeKey ??
          payloadForExpo.bookingRequestId ??
          payloadForExpo.requestId ??
          row.notification_id,
        recipientRole,
        ...(hasAbsoluteBadge
          ? {
              unreadCount: finalPayloadBadge,
              badge: finalPayloadBadge,
              _badgeSource: 'db_absolute',
            }
          : { _badgeSource: 'db_unavailable' }),
      };
      console.log('send-push absolute badge debug', {
        target: badgeDebug?.target ?? 'unknown',
        pushType:
          badgeDebug?.pushType ??
          String(
            payloadForExpo.event_type ??
              payloadForExpo.notificationType ??
              payloadForExpo._pushEventType ??
              payloadForExpo.type ??
              row.event_type
          ),
        calculatedAbsoluteBadge: badgeDebug?.calculatedAbsoluteBadge ?? 0,
        ownerPrenotazioniUnread: badgeDebug?.ownerPrenotazioniUnread ?? 0,
        ownerClientiUnread: badgeDebug?.ownerClientiUnread ?? 0,
        clientPrenotazioniUnread: badgeDebug?.clientPrenotazioniUnread ?? 0,
        clientWaitlistUnread: badgeDebug?.clientWaitlistUnread ?? 0,
        clientCommunicationsUnread: badgeDebug?.clientCommunicationsUnread ?? 0,
        finalPayloadBadge,
        countedBookingRequestIds: badgeDebug?.countedBookingRequestIds ?? [],
        countedCustomerIds: badgeDebug?.countedCustomerIds ?? [],
        countedWaitlistIds: badgeDebug?.countedWaitlistIds ?? [],
        countedCommunicationIds: badgeDebug?.countedCommunicationIds ?? [],
      });
      if (isAndroidRecipient && !isBadgeOnlyRefresh && hasAbsoluteBadge) {
        androidBadgeOnlyPayload.push({
          to: row.expo_push_token,
          _contentAvailable: true,
          badge: finalPayloadBadge,
          data: {
            ...payloadWithAbsoluteBadge,
            _badgeOnly: true,
            _badgeRefreshForNotificationId: row.notification_id,
            _badgeRefreshSentAt: new Date().toISOString(),
          },
          priority: 'high',
        });
      }

      return {
        to: row.expo_push_token,
        ...(isBadgeOnlyRefresh
          ? { _contentAvailable: true }
          : {
              sound: 'default',
              title: formatNotificationCopyDateText(visibleTitle),
              body: formatNotificationCopyDateText(visibleBody),
            }),
        ...(hasAbsoluteBadge ? { badge: finalPayloadBadge } : {}),
        data: payloadWithAbsoluteBadge,
        ...(isAndroidRecipient && !isBadgeOnlyRefresh
          ? {
              channelId: isAndroidClientRecipient
                ? ANDROID_CLIENT_BOOKING_CHANNEL_ID
                : ANDROID_VISIBLE_PUSH_CHANNEL_ID,
            }
          : {}),
        priority: 'high',
      };
    });

    console.log(
      'send-push expo payload preview',
      expoPayload.map((item) => ({
        to: maskToken(item.to),
        title: 'title' in item ? item.title : undefined,
        body: 'body' in item ? item.body : undefined,
        badge: item.badge,
        channelId: item.channelId,
        priority: item.priority,
        dataType:
          typeof item.data === 'object' && item.data !== null && 'type' in item.data
            ? String((item.data as Record<string, unknown>).type ?? '')
            : null,
      }))
    );
    console.log(
      'SALONPRO_PUSH_DIAG expo_payload_final',
      expoPayload.map((item) => {
        const data =
          typeof item.data === 'object' && item.data !== null
            ? (item.data as Record<string, unknown>)
            : {};
        return {
          timestamp: new Date().toISOString(),
          to: maskToken(item.to),
          title: 'title' in item ? item.title : undefined,
          body: 'body' in item ? item.body : undefined,
          badge: item.badge,
          channelId: item.channelId ?? null,
          payloadType: data.type ?? null,
          payloadEventType: data.event_type ?? null,
          payloadNotificationType: data.notificationType ?? null,
          pushEventType: data._pushEventType ?? null,
          status: data.status ?? null,
          statusCode: data.statusCode ?? null,
          cancellationSource: data.cancellationSource ?? null,
          bookingRequestId: data.bookingRequestId ?? data.requestId ?? null,
          appointmentId: data.appointmentId ?? null,
          source: data.source ?? null,
          functionName: 'send-push',
          fileName: 'supabase/functions/send-push/index.ts',
        };
      })
    );

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPayload),
    });

    const expoJson = (await expoResponse.json().catch(() => ({ data: [] }))) as {
      data?: ExpoPushResult[];
      errors?: Array<{ message?: string }>;
    };

    let androidBadgeOnlyExpoJson: { data?: ExpoPushResult[]; errors?: Array<{ message?: string }> } = {
      data: [],
      errors: [],
    };
    if (androidBadgeOnlyPayload.length > 0) {
      const androidBadgeOnlyExpoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(androidBadgeOnlyPayload),
      });
      androidBadgeOnlyExpoJson = (await androidBadgeOnlyExpoResponse
        .json()
        .catch(() => ({ data: [] }))) as {
        data?: ExpoPushResult[];
        errors?: Array<{ message?: string }>;
      };
    }

    console.log('send-push expo response', {
      processed: claimedRows.length,
      sentToExpo: rowsToSend.length,
      androidBadgeOnlySentToExpo: androidBadgeOnlyPayload.length,
      suppressedDuplicates: duplicateRows.length,
      data: expoJson.data ?? [],
      errors: expoJson.errors ?? [],
    });
    console.log('SALONPRO_PUSH_DIAG expo_response', {
      timestamp: new Date().toISOString(),
      processed: claimedRows.length,
      sentToExpo: rowsToSend.length,
      suppressedDuplicates: duplicateRows.length,
      suppressedStale: staleRows.length,
      data: expoJson.data ?? [],
      errors: expoJson.errors ?? [],
      functionName: 'send-push',
      fileName: 'supabase/functions/send-push/index.ts',
    });

    const results = expoJson.data ?? [];
    let sent = 0;
    let failed = 0;

    for (let index = 0; index < rowsToSend.length; index += 1) {
      const row = rowsToSend[index];
      const result = results[index];

      const isOk = result?.status === 'ok';
      const status = isOk ? 'sent' : 'failed';
      const errorMessage =
        !isOk
          ? result?.message ??
            (typeof result?.details === 'object' ? JSON.stringify(result.details) : null) ??
            expoJson.errors?.[0]?.message ??
            'unknown_expo_error'
          : null;

      const markResult = await supabase.rpc('mark_push_notification_result', {
        p_notification_id: row.notification_id,
        p_status: status,
        p_error: errorMessage,
      });

      if (markResult.error) {
        failed += 1;
        continue;
      }

      if (isOk) {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    for (const row of duplicateRows) {
      const markResult = await supabase.rpc('mark_push_notification_result', {
        p_notification_id: row.notification_id,
        p_status: 'sent',
        p_error: 'duplicate_suppressed_before_expo_send',
      });

      if (markResult.error) {
        failed += 1;
      }
    }
    for (const row of staleRows) {
      const markResult = await supabase.rpc('mark_push_notification_result', {
        p_notification_id: row.notification_id,
        p_status: 'sent',
        p_error: 'stale_client_status_suppressed_before_expo_send',
      });

      if (markResult.error) {
        failed += 1;
      }
    }

    return jsonResponse({
      processed: claimedRows.length,
      sent,
      failed,
      queuedReminders,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'unexpected_error',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
