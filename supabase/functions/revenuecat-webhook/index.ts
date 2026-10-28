import { reconcileStoreWorkspace } from '../_shared/store-reconciliation.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const baseHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: baseHeaders });

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readAuthToken = (request: Request) => {
  const raw = request.headers.get('authorization') ?? '';
  return raw.replace(/^Bearer\s+/i, '').trim();
};

const parseRevenueCatDate = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
};

const parseFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveStorePlatform = (store: unknown) => {
  const normalized = String(store ?? '').trim().toUpperCase();
  if (normalized === 'APP_STORE' || normalized === 'MAC_APP_STORE') return 'ios';
  if (normalized === 'PLAY_STORE') return 'android';
  return 'manual';
};

const resolveSubscriptionStatus = ({
  type,
  expirationAt,
}: {
  type: string;
  expirationAt: string | null;
}) => {
  if (type === 'EXPIRATION') return 'expired';

  if (type === 'CANCELLATION') {
    if (!expirationAt) return 'expired';
    return new Date(expirationAt).getTime() > Date.now() ? 'active' : 'expired';
  }

  return 'active';
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN')?.trim();
  if (!expectedToken) {
    return jsonResponse({ ok: false, error: 'missing_webhook_auth_configuration' }, 500);
  }

  if (readAuthToken(request) !== expectedToken) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'missing_supabase_env' }, 500);
  }

  const payload = await request.json().catch(() => null) as {
    event?: Record<string, unknown>;
  } | null;
  const event = payload?.event;

  if (!event) {
    return jsonResponse({ ok: false, error: 'missing_event' }, 400);
  }

  const type = String(event.type ?? '').trim().toUpperCase();
  const ignoredTypes = new Set(['TEST', 'NON_RENEWING_PURCHASE', 'INVOICE_ISSUANCE']);

  if (ignoredTypes.has(type)) {
    return jsonResponse({ ok: true, ignored: type });
  }

  const eventId = String(event.id ?? '').trim();
  const eventAt = parseRevenueCatDate(event.event_timestamp_ms);
  if (!eventId || !eventAt) {
    return jsonResponse({ ok: false, error: 'missing_event_identity' }, 400);
  }

  const appUserId = String(event.app_user_id ?? event.original_app_user_id ?? '').trim();
  const normalizedOwnerEmail = appUserId.startsWith('owner:')
    ? normalizeEmail(appUserId.slice('owner:'.length))
    : '';
  const workspaceId = appUserId.startsWith('workspace:') ? appUserId.slice('workspace:'.length) : '';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (type === 'TRANSFER') {
    const destinations = [...new Set((Array.isArray(event.transferred_to) ? event.transferred_to : []).filter((value): value is string => typeof value === 'string' && value.startsWith('workspace:')).map(value => value.slice(10)).filter(value => UUID_PATTERN.test(value)))];
    if (destinations.length !== 1) return jsonResponse({ ok: false, error: 'ambiguous_transfer_destination' }, 409);
    try {
      const result = await reconcileStoreWorkspace(supabase, destinations[0], event);
      return jsonResponse({ ok: true, reconciliation: result });
    } catch (error) {
      return jsonResponse({ ok: false, error: 'transfer_reconciliation_failed', detail: String(error instanceof Error ? error.message : (error as any)?.message || error) }, 500);
    }
  }

  let workspace: { id: string; owner_email: string } | null = null;

  if (UUID_PATTERN.test(workspaceId)) {
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, owner_email')
      .eq('id', workspaceId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ ok: false, error: 'workspace_lookup_failed', detail: error.message }, 500);
    }
    workspace = data;
  }

  if (!workspace && normalizedOwnerEmail) {
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, owner_email')
      .eq('owner_email', normalizedOwnerEmail)
      .maybeSingle();

    if (error) {
      return jsonResponse({ ok: false, error: 'workspace_lookup_failed', detail: error.message }, 500);
    }
    workspace = data;
  }

  if (!workspace) {
    return jsonResponse({ ok: true, ignored: 'workspace_not_found' });
  }

  const expirationAt = parseRevenueCatDate(event.expiration_at_ms);
  const status = resolveSubscriptionStatus({ type, expirationAt });
  const productId = String(event.product_id ?? '').trim();
  const presentedOfferingId = String(event.presented_offering_id ?? '').trim().toLowerCase();
  const founderOfferLocked =
    presentedOfferingId === 'founder' || productId.toLowerCase().includes('founder');
  const periodType = String(event.period_type ?? '').trim().toUpperCase();
  const environment = String(event.environment ?? '').trim().toUpperCase();
  const paidPeriodTypes = new Set(['NORMAL', 'INTRO', 'PREPAID']);
  const paidEventTypes = new Set(['INITIAL_PURCHASE', 'RENEWAL']);
  const founderPaidAt =
    founderOfferLocked &&
    environment === 'PRODUCTION' &&
    paidEventTypes.has(type) &&
    paidPeriodTypes.has(periodType)
      ? parseRevenueCatDate(event.purchased_at_ms) ??
        parseRevenueCatDate(event.event_timestamp_ms) ??
        new Date().toISOString()
      : null;
  const cancelAtPeriodEnd =
    type === 'CANCELLATION' && expirationAt !== null && new Date(expirationAt).getTime() > Date.now();

  try {
    await reconcileStoreWorkspace(supabase, workspace.id, event);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'subscription_sync_failed', detail: String(error instanceof Error ? error.message : (error as any)?.message || error) }, 500);
  }

  const purchasedCurrencyAmount = parseFiniteNumber(event.price_in_purchased_currency);
  const usdAmount = parseFiniteNumber(event.price);
  const amount = purchasedCurrencyAmount ?? usdAmount;
  const parsedCurrency =
    purchasedCurrencyAmount !== null
      ? String(event.currency ?? '').trim().toUpperCase()
      : usdAmount !== null
        ? 'USD'
        : null;
  const currency =
    parsedCurrency !== null && /^[A-Z]{3}$/.test(parsedCurrency)
      ? parsedCurrency
      : null;
  const cancelReason = String(event.cancel_reason ?? '').trim().toUpperCase();
  const isCharge =
    environment === 'PRODUCTION' &&
    paidEventTypes.has(type) &&
    paidPeriodTypes.has(periodType) &&
    (amount === null || amount > 0);
  const isRefund =
    environment === 'PRODUCTION' &&
    ((amount !== null && amount < 0) ||
      (type === 'CANCELLATION' && cancelReason === 'CUSTOMER_SUPPORT'));
  const isRefundReversal =
    environment === 'PRODUCTION' &&
    type === 'REFUND_REVERSED' &&
    amount !== null &&
    amount > 0;

  if (isCharge || isRefund || isRefundReversal) {
    const eventId =
      String(event.id ?? '').trim() ||
      [
        type,
        String(event.transaction_id ?? '').trim(),
        String(event.purchased_at_ms ?? event.event_timestamp_ms ?? '').trim(),
      ].join(':');
    const purchasedAt =
      parseRevenueCatDate(event.purchased_at_ms) ??
      parseRevenueCatDate(event.event_timestamp_ms) ??
      new Date().toISOString();
    const eventKind = isRefund ? 'refund' : isRefundReversal ? 'refund_reversal' : 'charge';

    const { error: paymentError } = await supabase
      .from('subscription_payments')
      .upsert(
        {
          revenuecat_event_id: eventId,
          workspace_id: workspace.id,
          event_kind: eventKind,
          event_type: type,
          store_platform: resolveStorePlatform(event.store),
          transaction_id: String(event.transaction_id ?? '').trim() || null,
          original_transaction_id:
            String(event.original_transaction_id ?? '').trim() || null,
          product_id: productId || null,
          purchased_at: purchasedAt,
          amount,
          currency,
          amount_usd: usdAmount,
          tax_percentage: parseFiniteNumber(event.tax_percentage),
          commission_percentage: parseFiniteNumber(event.commission_percentage),
          environment,
        },
        { onConflict: 'revenuecat_event_id' },
      );

    if (paymentError) {
      return jsonResponse(
        { ok: false, error: 'payment_ledger_write_failed', detail: paymentError.message },
        500,
      );
    }
  }

  return jsonResponse({
    ok: true,
    type,
    workspaceId: workspace.id,
    status,
    paymentRecorded: isCharge || isRefund || isRefundReversal,
  });
});
