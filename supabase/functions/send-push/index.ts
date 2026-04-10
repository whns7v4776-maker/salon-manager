import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ClaimedPushRow = {
  notification_id: string;
  expo_push_token: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
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

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

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

    const reminderQueueResult = await supabase.rpc('queue_due_appointment_push_reminders');

    if (reminderQueueResult.error) {
      return jsonResponse(
        {
          error: 'queue_due_reminders_failed',
          details: reminderQueueResult.error.message,
        },
        500
      );
    }

    const queuedReminders = Number(reminderQueueResult.data ?? 0) || 0;
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

    const expoPayload = claimedRows.map((row) => ({
      to: row.expo_push_token,
      sound: 'default',
      title: row.title,
      body: row.body,
      data: row.payload ?? {},
      priority: 'high',
    }));

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

    const results = expoJson.data ?? [];
    let sent = 0;
    let failed = 0;

    for (let index = 0; index < claimedRows.length; index += 1) {
      const row = claimedRows[index];
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
