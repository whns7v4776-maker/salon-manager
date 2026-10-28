// Only server-to-server RevenueCat data is accepted as evidence of access.
export const storePlatform = (store: unknown) => ['app_store', 'mac_app_store'].includes(String(store).toLowerCase()) ? 'ios' : String(store).toLowerCase() === 'play_store' ? 'android' : null;
export function selectVerifiedSubscription(payload: any, now = Date.now()) {
  const subscriber = payload?.subscriber;
  const entitlement = subscriber?.entitlements?.pro;
  const productId = entitlement?.product_identifier;
  const subscription = productId ? subscriber?.subscriptions?.[productId] : null;
  if (!subscription || typeof subscription.is_sandbox !== 'boolean') return null;
  const platform = storePlatform(subscription.store);
  if (!platform) return null;
  const endsAt = subscription.grace_period_expires_date || subscription.expires_date || entitlement.expires_date;
  if (!endsAt || !Number.isFinite(Date.parse(endsAt))) return null;
  return {
    productId, platform, environment: subscription.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
    endsAt, active: !subscription.refunded_at && Date.parse(endsAt) > now,
    trialUsed: subscription.period_type === 'trial',
    cancelAtPeriodEnd: !!subscription.unsubscribe_detected_at,
    founderOfferLocked: String(productId).includes('founder'),
    founderPaidAt: null as string | null,
  };
}
async function readSubscriber(appUserId: string, platform: string) {
  const key = Deno.env.get(platform === 'android' ? 'REVENUECAT_GOOGLE_PUBLIC_KEY' : 'REVENUECAT_APPLE_PUBLIC_KEY')?.trim();
  if (!key) throw new Error('revenuecat_read_key_missing');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`revenuecat_read_failed_${response.status}`);
  return await response.json();
}
export async function reconcileStoreWorkspace(supabase: any, workspaceId: string, event?: Record<string, any>) {
  const { data: workspace, error: workspaceError } = await supabase.from('workspaces').select('id,owner_email').eq('id',workspaceId).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) return { ignored: 'workspace_deleted' };
  const { data: existing, error: existingError } = await supabase.from('subscriptions').select('*').eq('workspace_id',workspaceId).maybeSingle();
  if (existingError) throw existingError;
  const platform = storePlatform(event?.store) || existing?.store_platform || 'ios';
  const verifiedAppUserId = typeof event?.app_user_id === 'string' && event.app_user_id.startsWith('owner:') ? event.app_user_id : `workspace:${workspaceId}`;
  const payload = await readSubscriber(verifiedAppUserId, platform);
  let snapshot = selectVerifiedSubscription(payload);
  if (!snapshot) {
    // No entitlement is not a new grant. Never invent an expiry or a trial.
    if (!existing || !existing.store_environment) return { active: false, ignored: 'no_verified_entitlement' };
    snapshot = { productId: existing.external_subscription_id, platform: existing.store_platform,
      environment: existing.store_environment, endsAt: new Date().toISOString(),active:false,
      trialUsed:existing.trial_used,cancelAtPeriodEnd:false,founderOfferLocked:existing.founder_offer_locked,founderPaidAt:null };
  }
  let originalTransactionId = (!existing?.store_environment || existing.store_environment === snapshot.environment) && existing?.external_subscription_id === snapshot.productId ? existing.original_transaction_id : null;
  const eventMatches = event?.product_id === snapshot.productId && event?.environment === snapshot.environment && storePlatform(event?.store) === snapshot.platform;
  if (eventMatches && event?.original_transaction_id) originalTransactionId=String(event.original_transaction_id);
  // TRANSFER contains IDs, not a receipt. Reuse a source receipt only when there is one unambiguous match.
  if (!originalTransactionId && event?.type === 'TRANSFER') {
    const sources = (Array.isArray(event.transferred_from) ? event.transferred_from : []).filter((id: unknown) => typeof id === 'string' && /^workspace:[0-9a-f-]{36}$/i.test(id)).map((id: string) => id.slice(10));
    if (sources.length) {
      const { data, error } = await supabase.from('subscriptions').select('*').in('workspace_id',sources).eq('store_platform',snapshot.platform).eq('external_subscription_id',snapshot.productId);
      if (error) throw error;
      const candidates=[];
      for (const row of data || []) {
        let environment=row.store_environment;
        if (!environment) {
          const old = await readSubscriber(row.store_customer_ref || `workspace:${row.workspace_id}`,row.store_platform);
          const sub=old?.subscriber?.subscriptions?.[row.external_subscription_id];
          if (typeof sub?.is_sandbox === 'boolean') environment=sub.is_sandbox?'SANDBOX':'PRODUCTION';
          else if (event.environment===snapshot.environment && snapshot.active && !(snapshot.environment==='SANDBOX' && row.founder_paid_at)) environment=snapshot.environment;
        }
        if (environment===snapshot.environment && row.original_transaction_id) candidates.push(row.original_transaction_id);
      }
      if (candidates.length===1) originalTransactionId=candidates[0];
      if (candidates.length>1) throw new Error('ambiguous_transfer_receipt');
    }
  }
  let verifiedLegacyEnvironment: string | null=null;
  if (originalTransactionId) {
    const { data: legacy, error }=await supabase.from('subscriptions').select('*').eq('store_platform',snapshot.platform).eq('original_transaction_id',originalTransactionId).is('store_environment',null).maybeSingle();
    if (error) throw error;
    if (legacy) {
      const source=legacy.workspace_id===workspaceId?payload:await readSubscriber(legacy.store_customer_ref || `workspace:${legacy.workspace_id}`,legacy.store_platform);
      const sub=source?.subscriber?.subscriptions?.[legacy.external_subscription_id];
      if (typeof sub?.is_sandbox === 'boolean') verifiedLegacyEnvironment=sub.is_sandbox?'SANDBOX':'PRODUCTION';
      else if (event?.type==='TRANSFER' && event.environment===snapshot.environment && snapshot.active && event.transferred_from?.includes(`workspace:${legacy.workspace_id}`) && !(snapshot.environment==='SANDBOX' && legacy.founder_paid_at)) verifiedLegacyEnvironment=snapshot.environment;
      else throw new Error('legacy_receipt_verification_required');
    }
  }
  if (eventMatches && snapshot.environment==='PRODUCTION' && ['INITIAL_PURCHASE','RENEWAL'].includes(event?.type) && ['NORMAL','INTRO','PREPAID'].includes(event?.period_type) && snapshot.founderOfferLocked) {
    snapshot.founderPaidAt = Number.isFinite(Number(event?.purchased_at_ms)) ? new Date(Number(event.purchased_at_ms)).toISOString() : null;
  }
  const verifiedAt = new Date(Number(payload.request_date_ms) || Date.now()).toISOString();
  const { data, error }=await supabase.rpc('reconcile_verified_store_snapshot',{
    p_workspace_id:workspaceId,p_snapshot:{...snapshot,originalTransactionId,verifiedLegacyEnvironment},
    p_event_id:event?.id ? `${event.id}:${verifiedAt}` : `reconcile:${workspaceId}:${verifiedAt}`,p_verified_at:verifiedAt,
  });
  if (error) throw error;
  return data;
}
