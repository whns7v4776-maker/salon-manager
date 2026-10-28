/** Request-scoped customer proof. Owner authentication and other RPCs are untouched. */
export const CUSTOMER_PORTAL_PROOF_HEADER = 'x-salonpro-customer-token';
export const CUSTOMER_PORTAL_PRIVATE_RPCS = new Set([
  'get_public_customer_communications', 'get_public_customer_communications_page_v1',
  'get_public_customer_communications_page_v2', 'get_public_customer_unread_communication_count_v1',
  'get_public_slot_waitlist_entries', 'get_public_customer_waitlist_alerts',
  'get_public_customer_waitlist_alerts_v2', 'get_public_customer_unread_booking_badge_rows',
  'get_public_customer_unread_waitlist_badge_rows', 'get_public_customer_online_booking_policy_v1',
  'get_public_customer_online_booking_policy_v2', 'get_public_customer_service_duration_overrides_v1',
  'get_public_customer_service_price_overrides_v1', 'find_public_booking_request_by_composite',
  'find_public_booking_dependency_by_idempotency_v1', 'get_public_booking_operator_changes_v1',
  'claim_public_customer_app_session', 'heartbeat_public_customer_app_session',
  'claim_public_customer_daily_reminder',
  'claim_public_customer_daily_reminder_v2', 'mark_public_customer_communication_read',
  'dismiss_public_customer_popup_v1', 'cancel_public_slot_waitlist_alerts',
  'mark_public_customer_waitlist_alerts_viewed', 'cancel_public_booking_request_or_group_v2',
  'cancel_public_booking_group_v1', 'join_public_slot_waitlist', 'join_public_slot_waitlist_v2',
  'mark_public_booking_requests_viewed', 'mark_public_booking_notification_events_viewed_v2',
  'get_public_customer_registration_status_v1',
  'get_customer_appearance_preference_v1', 'set_customer_appearance_preference_v1',
]);
type ProofResolver = (name: string, args: Record<string, unknown>, interactive: boolean) => Promise<string | null>;
type RejectionHandler = (name: string, args: Record<string, unknown>, token: string) => Promise<void>;
let resolver: ProofResolver | null = null;
let rejectionHandler: RejectionHandler | null = null;
export function setCustomerPortalProofRejectionHandler(next: RejectionHandler) { rejectionHandler = next; }
export function setCustomerPortalProofResolver(next: ProofResolver) { resolver = next; }

export async function withCustomerPortalProof(input: RequestInfo | URL, init?: RequestInit): Promise<RequestInit | undefined> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const match = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)(?:[?]|$)/i);
  const name = match?.[1] ?? '';
  if (!resolver || (!CUSTOMER_PORTAL_PRIVATE_RPCS.has(name) && name !== 'get_client_portal_snapshot' && name !== 'find_public_customer_by_password')) return init;
  let args: Record<string, unknown>;
  try { args = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return init; }
  const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
  // Never replace the owner JWT or start a customer challenge in the back
  // office. A cached proof can accompany a customer RPC when both areas are
  // open; server-side owner scope still takes precedence.
  const authorization = headers.get('authorization') ?? '';
  const jwtPayload = authorization.split('.')[1];
  let interactive = true;
  if (jwtPayload) {
    try {
      const payload = JSON.parse(atob(jwtPayload.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'authenticated' || payload.role === 'service_role') interactive = false;
    } catch { /* The server still validates malformed or expired authorization. */ }
  }
  const proof = await resolver(name, args, interactive);
  if (!proof) return init;
  headers.set(CUSTOMER_PORTAL_PROOF_HEADER, proof);
  return { ...init, headers };
}

/** Only a failed proof guard can be retried. Pending approval and application
 * failures must not reopen activation or repeat a successful mutation. */
export async function renewRejectedCustomerPortalProof(input: RequestInfo | URL, init: RequestInit | undefined, response: Response): Promise<RequestInit | null> {
  if (!rejectionHandler || (response.status !== 401 && response.status !== 403) || init?.signal?.aborted) return null;
  const headers = new Headers(init?.headers);
  const token = headers.get(CUSTOMER_PORTAL_PROOF_HEADER);
  if (!token) return null;
  let failure: { message?: string };
  try { failure = await response.clone().json(); } catch { return null; }
  if (failure?.message !== 'customer_portal_access_required') return null;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const name = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)(?:[?]|$)/i)?.[1];
  if (!name || (!CUSTOMER_PORTAL_PRIVATE_RPCS.has(name) && name !== 'get_client_portal_snapshot' && name !== 'find_public_customer_by_password')) return null;
  let args: Record<string, unknown>;
  try { args = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return null; }
  await rejectionHandler(name, args, token);
  if (init?.signal?.aborted) return null;
  headers.delete(CUSTOMER_PORTAL_PROOF_HEADER);
  const renewed = await withCustomerPortalProof(input, { ...init, headers });
  const nextToken = new Headers(renewed?.headers).get(CUSTOMER_PORTAL_PROOF_HEADER);
  return nextToken && nextToken !== token ? renewed! : null;
}
