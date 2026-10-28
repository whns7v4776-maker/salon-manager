const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.cwd());
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const migration = read(
  'supabase/migrations/20260826024500_sync_public_auto_accept_and_customer_policy.sql',
);
const ownerAuthorityMigration = read(
  'supabase/migrations/20260826033000_owner_auto_accept_server_authority.sql',
);
const appContext = read('src/context/AppContext.tsx');
const clientScreen = read('app/cliente-screen.tsx');
const clientPortal = read('src/lib/client-portal.ts');
const ownerBookings = read('app/(tabs)/prenotazioni.tsx');
const policy = read('src/lib/customer-online-booking-policy.ts');

assert(
  migration.includes(
    "workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active'')",
  ),
  'The public customer policy must include internal-tester workspaces.',
);
assert(
  migration.includes("'public.get_client_portal_snapshot(text)'::regprocedure") &&
    migration.includes("'public.get_client_portal_catalog(text)'::regprocedure"),
  'Both public portal read paths must expose the live auto-accept preference.',
);
assert(
  migration.includes(
    "'autoAcceptBookingRequests', coalesce(v_workspace.auto_accept_booking_requests, false)",
  ) &&
    migration.includes(
      "'autoAcceptBookingRequestsUpdatedAt', v_workspace.auto_accept_booking_requests_updated_at",
    ),
  'Public snapshots must read auto-accept directly from the workspace row.',
);
assert(
  /create or replace function public\.get_public_workspace_booking_preferences_v1[\s\S]*?security definer[\s\S]*?workspace\.auto_accept_booking_requests/.test(
    migration,
  ),
  'A live public workspace-preference endpoint must remain available.',
);
assert(
  /create or replace function public\.set_owner_workspace_auto_accept_booking_requests_v1[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?workspace\.slug = lower\(btrim\(coalesce\(p_salon_code[\s\S]*?auto_accept_booking_requests = p_enabled[\s\S]*?returning workspace\.\* into v_workspace[\s\S]*?select workspace\.\*[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?v_workspace\.auto_accept_booking_requests is distinct from p_enabled[\s\S]*?v_workspace\.auto_accept_booking_requests_updated_at is null/.test(
    ownerAuthorityMigration,
  ),
  'The owner write must target one exact workspace and re-read the stored value and timestamp.',
);
assert(
  /resolveCustomerAutoAccept[\s\S]*?normalizedMode === 'auto'[\s\S]*?normalizedMode === 'manual'[\s\S]*?return salonAutoAccept/.test(
    policy,
  ),
  'The inherit mode must resolve from the salon preference.',
);
assert(
  /resolvedAutoAcceptChanged[\s\S]*?auto_accept_booking_requests:[\s\S]*?auto_accept_booking_requests_updated_at:/.test(
    appContext,
  ),
  'The owner toggle must persist both the value and its authority timestamp.',
);
assert(
  /setWorkspaceAutoAcceptBookingRequestsPersisted[\s\S]*?set_owner_workspace_auto_accept_booking_requests_v1[\s\S]*?confirmedWorkspace\.autoAcceptBookingRequests !== enabled[\s\S]*?refreshWorkspaceAutoAcceptBookingRequests\(\)/.test(
    appContext,
  ),
  'The app must reject a mismatched acknowledgement and roll back from the server.',
);
assert(
  /setAutoAcceptSaving\(true\)[\s\S]*?setWorkspaceAutoAcceptBookingRequestsPersisted[\s\S]*?setDisplayedAutoAcceptBookingRequests\(result\.value!\)[\s\S]*?Salvataggio in corso/.test(
    ownerBookings,
  ) &&
    !/setAutoAcceptSaving\(true\);\s*setAutoAcceptAuthorityConfirmed\(false\)/.test(
      ownerBookings,
    ),
  'The owner UI must preserve the binary state while saving and apply only the server-confirmed value.',
);
assert(
  /const inboundValue =\s*salonWorkspace\.autoAcceptBookingRequests === true/.test(
    ownerBookings,
  ),
  'Undefined workspace state must be normalized fail-closed before entering the confirmed display state.',
);
assert(
  /setAutoAcceptServerChecking\(true\);[\s\S]*?const verifyServerAuthority = async \(\) =>/.test(
    ownerBookings,
  ) &&
    !/setAutoAcceptServerChecking\(true\);\s*setAutoAcceptAuthorityConfirmed\(false\)/.test(
      ownerBookings,
    ),
  'Focus verification must run silently without revoking the last confirmed binary state.',
);
assert(
  /AUTO_ACCEPT_AUTHORITY_RETRY_DELAYS_MS = \[450, 1400\][\s\S]*?const verifyServerAuthority = async \(\) =>[\s\S]*?refreshWorkspaceAutoAcceptRef\.current\(\)[\s\S]*?AUTO_ACCEPT_AUTHORITY_RETRY_DELAYS_MS\[retryIndex\][\s\S]*?void verifyServerAuthority\(\)/.test(
    ownerBookings,
  ),
  'A transient authority read failure must retry automatically while the screen remains focused.',
);
assert(
  /hasInboundAuthority[\s\S]*?setDisplayedAutoAcceptBookingRequests\(inboundValue\)[\s\S]*?setAutoAcceptAuthorityConfirmed\(true\)/.test(
    ownerBookings,
  ),
  'A timestamped workspace refresh must unlock and align the binary owner control.',
);
assert(
  !/Verifica impostazione|Non verificato|Impostazione non disponibile|"Verifica\.\.\."/.test(
    ownerBookings,
  ) && /\? "Attivo"\s*:\s*"Disattivato"/.test(ownerBookings),
  'The owner setting must expose only the two persisted business states.',
);
assert(
  /OWNER_AUTO_ACCEPT_AUTHORITY_TIMEOUT_MS = 8000[\s\S]*?withOwnerAutoAcceptAuthorityTimeout[\s\S]*?refreshWorkspaceAutoAcceptBookingRequests[\s\S]*?withOwnerAutoAcceptAuthorityTimeout\([\s\S]*?get_owner_workspace_auto_accept_booking_requests_v1[\s\S]*?setWorkspaceAutoAcceptBookingRequestsPersisted[\s\S]*?withOwnerAutoAcceptAuthorityTimeout\([\s\S]*?set_owner_workspace_auto_accept_booking_requests_v1/.test(
    appContext,
  ),
  'Owner reads and writes must have a bounded deadline instead of hanging forever.',
);
assert(
  /void enqueuePortalPublish\(\{[\s\S]*?return \{\s*ok: true as const,[\s\S]*?confirmedWorkspace\.autoAcceptBookingRequests/.test(
    appContext,
  ),
  'Portal publication must not keep the already-confirmed owner toggle in a saving state.',
);
assert(
  !/updateSalonWorkspacePersisted/.test(ownerBookings),
  'The auto-accept control must not use the optimistic generic workspace saver.',
);
assert(
  /autoAcceptBookingRequests: snapshot\.workspace\.autoAcceptBookingRequests[\s\S]*?autoAcceptBookingRequestsUpdatedAt:[\s\S]*?snapshot\.workspace\.autoAcceptBookingRequestsUpdatedAt/.test(
    clientPortal,
  ),
  'Portal publication must preserve the salon-wide preference and timestamp.',
);
assert(
  /update_customer_online_booking_policy_v2[\s\S]*?p_acceptance_mode: normalizedMode[\s\S]*?p_service_overrides: normalizedOverrides[\s\S]*?p_allow_same_day_same_service: allowSameDaySameService/.test(
    appContext,
  ),
  'Customer online-booking customizations must be persisted atomically.',
);
assert(
  /get_public_customer_online_booking_policy_v2[\s\S]*?setCustomerOnlineBookingPolicy\(resolvedPolicy\)/.test(
    clientScreen,
  ),
  'The client frontend must refresh and apply the authoritative customer policy.',
);
assert(
  /customerOnlineBookingPolicyConfirmedRef[\s\S]*?confirmed\?\.identityKey === identityKey[\s\S]*?confirmed\.policy\.acceptanceMode === 'inherit'[\s\S]*?fallbackAutoAccept[\s\S]*?setCustomerOnlineBookingPolicy\(preservedPolicy\)/.test(
    clientScreen,
  ),
  'A temporary policy read failure must preserve the last confirmed customer rules while inherit follows the live salon preference.',
);
assert(
  /confirmedCustomerPolicy\?\.identityKey === bookingCustomerPolicyIdentityKey[\s\S]*?confirmedCustomerPolicy\.confirmedAt <= FRONTEND_CUSTOMER_POLICY_WARM_MAX_AGE_MS[\s\S]*?warmCustomerPolicy[\s\S]*?Promise\.resolve\(warmCustomerPolicy\)[\s\S]*?refreshCustomerOnlineBookingPolicy\(\)/.test(clientScreen),
  'Booking submit may reuse only a recent, identity-matched confirmed policy and must otherwise re-read it.',
);
assert(
  /Parte mentre il cliente completa giorno\/operatore\/orario[\s\S]*?void refreshPublicSalonState\(\)[\s\S]*?void refreshCustomerOnlineBookingPolicy\(\)/.test(clientScreen),
  'Service selection must prefetch salon and customer-policy authority before submit.',
);

console.log('Customer online-booking sync contracts: OK');
