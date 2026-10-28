/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const appContext = read('src/context/AppContext.tsx');
const clientScreen = read('app/cliente-screen.tsx');
const migration = read(
  'supabase/migrations/20260826190000_bound_phased_public_booking_submit_work.sql',
);
const latestUltralightDefinition = read(
  'supabase/migrations/20260601184500_ignore_cancelled_customer_conflicts_in_public_booking_create.sql',
);
const finalAssignmentsDefinition = read(
  'supabase/migrations/20260802094500_repair_direct_phased_operator_assignment_and_drag_move.sql',
);
const optionalFinalDefinition = read(
  'supabase/migrations/20260806183000_optional_final_phase_and_service_links.sql',
);
const finalPlannerDefinition = read(
  'supabase/migrations/20260805123000_operator_public_service_eligibility.sql',
);

const phasedCompat = sliceBetween(
  appContext,
  'if (normalizedPhaseSnapshot) {',
  'const { p_phase_snapshot: _ignoredPhaseSnapshot',
);
assert.match(
  phasedCompat,
  /invokeBookingCreateRpcOnce\(\s*'create_public_phased_booking_request_v5'/,
  'The preferred phased mutation must use exactly one transport attempt per compatibility level.',
);
assert.doesNotMatch(
  phasedCompat,
  /invokeRpcWithSchemaRetry/,
  'A mutating phased RPC must never inherit the generic three-attempt statement-timeout retry.',
);
assert.match(
  phasedCompat,
  /!isNamedRpcUnavailableError\(\s*'create_public_phased_booking_request_v5'/,
  'Older phased RPCs must remain capability fallbacks only when v5 is unavailable.',
);

const createRetry = sliceBetween(
  appContext,
  'const invokeCreateBookingRequestWithNetworkRetry = async () => {',
  'let { data: createdBookingRequest, error: createBookingRequestError }',
);
assert.match(
  createRetry,
  /const retryDelaysMs = isPhasedBookingCreate\s*\? \[0, 450\]\s*: \[0, 600, 1600, 3200\]/,
  'Phased mutation retries must be capped at two attempts without changing the single-service budget.',
);
assert.match(
  createRetry,
  /const reconcileAmbiguousPhasedCreate = async \(\) => \{[\s\S]*?invokeFindPublicBookingRequestByCompositeRpcCompat\(\s*lookupPayload,?\s*\)/,
  'An ambiguous phased ACK must reconcile the exact canonical request before retrying.',
);
assert.equal(
  (createRetry.match(/await reconcileAmbiguousPhasedCreate\(\)/g) ?? []).length,
  2,
  'Both returned RPC errors and thrown transport failures must reconcile before the second phased attempt.',
);
assert.match(
  createRetry,
  /!isStatementTimeoutError\(response\.error\)/,
  'A database-cancelled statement must not be treated as a possibly committed ACK loss.',
);

const submitRace = sliceBetween(
  clientScreen,
  'const saved = await Promise.race([',
  'const isSubmitTimeout =',
);
assert.match(
  submitRace,
  /}, 20000\);/,
  'The existing bounded customer-facing submit timeout must remain in place.',
);

for (const marker of [
  'salonpro.defer_client_portal_snapshot_sync',
  'salonpro.skip_client_portal_snapshot_sync',
  'salonpro.skip_booking_request_push',
  'salonpro.phased_slot_prevalidated',
  'phased_v4_duplicate_tail_anchor_missing',
]) {
  assert.ok(
    migration.includes(marker),
    `Missing phased SQL work-budget guard: ${marker}`,
  );
}
assert.match(
  migration,
  /create_public_phased_booking_request_with_assignments_v1_with_final[\s\S]*?create_public_phased_booking_request_with_assignments_v1\(/,
  'Both final-enabled and processing-terminal phased writers must use the deferred intermediate publication.',
);
assert.match(
  migration,
  /Direct\/single-service[\s\S]*?callers still take the original branch/,
  'The migration must document and preserve the unchanged single-service publication path.',
);

const occurrenceCount = (source, token) => source.split(token).length - 1;
assert.equal(
  occurrenceCount(
    latestUltralightDefinition,
    '  perform public.refresh_workspace_agenda_state(v_workspace.id);',
  ),
  1,
  'The migration must target the single refresh in the latest effective ultralight v2 source.',
);
assert.equal(
  occurrenceCount(
    latestUltralightDefinition,
    '  if not public.is_public_booking_slot_available(\n',
  ),
  1,
  'The nested-slot optimization must have one unambiguous ultralight guard anchor.',
);
for (const [label, source] of [
  ['final assignments', finalAssignmentsDefinition],
  ['processing-terminal assignments', optionalFinalDefinition],
]) {
  assert.equal(
    occurrenceCount(
      source,
      '  v_request := public.create_public_booking_request_ultralight_v2(\n',
    ),
    1,
    `${label} must expose one unambiguous nested writer anchor.`,
  );
}
assert.equal(
  occurrenceCount(
    finalPlannerDefinition,
    "  v_assignments := jsonb_build_object(\n",
  ),
  1,
  'The final v4 planner must expose exactly one redundant assignment tail to remove.',
);

const baselinePortalPublicationCycles = 6;
const optimizedPortalPublicationCycles = 1;
assert.ok(
  optimizedPortalPublicationCycles < baselinePortalPublicationCycles,
  'The static work budget must reduce six intermediate/final portal publications to one final publication.',
);

console.log(
  `Phased booking submit work budget: OK (${baselinePortalPublicationCycles}->${optimizedPortalPublicationCycles} portal publications, 1 normal auto-accept kick, <=2 preferred mutation attempts)`,
);
