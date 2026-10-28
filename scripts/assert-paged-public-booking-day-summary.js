/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826043000_paged_public_booking_day_summary.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  /create table if not exists public\.public_booking_consistency_revisions \([\s\S]*?revision bigint not null default 0,[\s\S]*?last_transaction_id bigint not null/.test(
    sql,
  ),
  'A private workspace-scoped monotonic consistency counter must exist.',
);
assert(
  /revoke all on table public\.public_booking_consistency_revisions[\s\S]*?from public, anon, authenticated/.test(
    sql,
  ),
  'The internal consistency table must not expose its rows to app roles.',
);
assert(
  /create or replace function public\.bump_public_booking_consistency_revision_v1\([\s\S]*?v_transaction_id bigint := txid_current\(\)[\s\S]*?on conflict \(workspace_id\) do update set[\s\S]*?revision = public\.public_booking_consistency_revisions\.revision \+ 1[\s\S]*?last_transaction_id[\s\S]*?is distinct from excluded\.last_transaction_id/.test(
    sql,
  ),
  'Every relevant transaction must increment the workspace counter atomically at most once.',
);
assert(
  !/alter table public\.public_availability_revisions[\s\S]*?add column/.test(sql) &&
    !/create or replace function public\.touch_public_availability_revision_v1\(/.test(sql) &&
    !/add table public\.public_booking_consistency_revisions/.test(sql),
  'The consistency fence must not alter or duplicate the existing Realtime availability signal.',
);

const revisionSources = [
  'workspaces',
  'owner_app_snapshots',
  'client_portals',
  'services',
  'operators',
  'customers',
  'appointments',
  'booking_requests',
  'appointment_groups',
  'service_compositions',
  'service_composition_items',
  'operator_public_booking_policies',
  'operator_public_service_links',
  'customer_service_duration_overrides',
  'customer_online_booking_policies',
  'customer_online_service_overrides',
  'customer_online_composition_overrides',
];
for (const tableName of revisionSources) {
  assert(
    new RegExp(`'${tableName}'`).test(sql),
    `The consistency revision must cover planner source ${tableName}.`,
  );
}
assert(
  /create constraint trigger %I after insert or update or delete on public\.%I '[\s\S]*?deferrable initially deferred for each row/.test(
    sql,
  ),
  'Source revision triggers must be deferred to preserve existing write lock ordering.',
);
assert(
  /tg_table_name = 'workspaces'[\s\S]*?'slug'[\s\S]*?'subscription_status'[\s\S]*?'is_internal_tester'[\s\S]*?tg_table_name = 'owner_app_snapshots'[\s\S]*?'appuntamenti'[\s\S]*?'richiestePrenotazione'[\s\S]*?'servizi'[\s\S]*?'operatori'[\s\S]*?'availabilitySettings'[\s\S]*?'macchinari'[\s\S]*?'clienti'[\s\S]*?tg_table_name = 'client_portals'[\s\S]*?'richieste_prenotazione'[\s\S]*?'availability_settings'/.test(
    sql,
  ),
  'Snapshot, portal and workspace updates must ignore unrelated UI, billing and notification state.',
);
assert(
  /alter table public\.appointments replica identity full;[\s\S]*?alter table public\.booking_requests replica identity full;/.test(
    sql,
  ),
  'Realtime must include complete old appointment/request rows so moved dates invalidate both sides.',
);

for (const signature of [
  'get_public_booking_slot_availability_batch(uuid,date,jsonb,text,text,text)',
  'get_public_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text)',
  'get_public_phased_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text,boolean)',
  'get_public_phased_booking_slot_availability_batch_v3(uuid,date,jsonb,text,text,text,text,boolean)',
  'resolve_public_composition_operator_plan_v1(uuid,uuid,date,time without time zone,text,text,text,text)',
]) {
  assert(
    sql.includes(`'public.${signature}'::regprocedure`),
    `The phase-aware writer parity patch must cover ${signature}.`,
  );
}
assert(
  /replace\([\s\S]*?'public\.is_public_booking_slot_available\('[\s\S]*?'public\.is_public_operator_interval_available_v1\('[\s\S]*?phase_aware_public_planner_not_installed/.test(
    sql,
  ),
  'Every effective read planner must use the same phase-aware interval guard as submit.',
);

assert(
  /create or replace function public\.public_customer_online_plan_allowed_v1\([\s\S]*?v_customer_email is null or v_customer_phone is null[\s\S]*?customer\.is_active is not false[\s\S]*?customer\.email::text[\s\S]*?regexp_replace\(coalesce\(customer\.phone[\s\S]*?customer_online_service_overrides[\s\S]*?p_dependency_service_id[\s\S]*?customer_online_composition_overrides[\s\S]*?service_composition_items/.test(
    sql,
  ),
  'Customer policy must use the writer exact identity and cover service, dependency and composition exclusions.',
);
assert(
  /create or replace function public\.build_public_false_slot_map_v1\([\s\S]*?jsonb_build_object\(v_slot_time, false\)[\s\S]*?revoke all on function public\.build_public_false_slot_map_v1\(jsonb, boolean\)[\s\S]*?from public, anon, authenticated/.test(
    sql,
  ),
  'A denied customer plan must return a complete false map without exposing the private helper.',
);
assert(
  /create or replace function public\.public_customer_atomic_day_service_allowed_v1\([\s\S]*?public\.customer_allows_delegated_booking_v1\(/.test(
    sql,
  ) &&
    /public_customer_atomic_day_service_allowed_v1[\s\S]*?terminal_request\.status::text in \('cancelled', 'rejected'\)[\s\S]*?newer_active_request\.status::text in \('pending', 'accepted'\)/.test(
      sql,
    ),
  'Atomic simple/phased policy must mirror the repeated-day switch and terminal precedence.',
);
assert(
  /public\.public_customer_booking_envelope_available_v1\(uuid,date,time without time zone,integer,text,text\)'::regprocedure[\s\S]*?public\.customer_terminal_pause_conflicts_v1\([\s\S]*?public_customer_terminal_pause_envelope_not_installed/.test(
    sql,
  ),
  'The hard customer envelope must include existing terminal composition pauses.',
);
assert(
  /verify_public_dependency_customer_envelope[\s\S]*?resolve_public_dependency_operator_plan_v1\(uuid,text,uuid,date,time without time zone,text,text,text,text\)[\s\S]*?public\.public_customer_booking_envelope_available_v1\([\s\S]*?public_dependency_customer_envelope_not_installed/.test(
    sql,
  ),
  'Dependency availability must retain the hard linked customer-envelope guard.',
);
assert(
  /create or replace function public\.public_composition_customer_duration_minutes_v1\([\s\S]*?resolve_customer_service_timing_v1\([\s\S]*?sum\(greatest|create or replace function public\.public_composition_customer_duration_minutes_v1\([\s\S]*?sum\(greatest[\s\S]*?resolve_customer_service_timing_v1\(/.test(
    sql,
  ) &&
    /get_public_composition_slot_availability_batch_v1[\s\S]*?public_composition_customer_duration_minutes_v1\([\s\S]*?public\.public_customer_booking_envelope_available_v1\(/.test(
      sql,
    ),
  'Composition availability must validate its complete customer-aware envelope before operator planning.',
);

for (const plannerName of [
  'get_public_booking_slot_availability_batch_v3',
  'get_public_phased_booking_slot_availability_batch_v4',
  'get_public_dependency_slot_availability_batch_v1',
  'get_public_composition_slot_availability_batch_v1',
]) {
  const plannerStart = sql.indexOf(`create or replace function public.${plannerName}(`);
  const plannerEnd = sql.indexOf('\n$$;', plannerStart);
  assert(plannerStart >= 0 && plannerEnd > plannerStart, `Missing planner body for ${plannerName}.`);
  const plannerBody = sql.slice(plannerStart, plannerEnd);
  assert(
    plannerBody.includes('public.public_customer_online_plan_allowed_v1(') &&
      plannerBody.includes('public.build_public_false_slot_map_v1('),
    `${plannerName} must apply customer online policy before advertising availability.`,
  );
}
for (const plannerName of [
  'get_public_booking_slot_availability_batch_v3',
  'get_public_phased_booking_slot_availability_batch_v4',
]) {
  const plannerStart = sql.indexOf(`create or replace function public.${plannerName}(`);
  const plannerEnd = sql.indexOf('\n$$;', plannerStart);
  const plannerBody = sql.slice(plannerStart, plannerEnd);
  assert(
    plannerBody.includes('public.public_customer_atomic_day_service_allowed_v1(') &&
      plannerBody.includes('public.filter_public_customer_slot_availability_v1('),
    `${plannerName} must keep hard overlap and apply the false repeated-day policy.`,
  );
}
{
  const plannerStart = sql.indexOf(
    'create or replace function public.get_public_composition_slot_availability_batch_v1(',
  );
  const plannerEnd = sql.indexOf('\n$$;', plannerStart);
  const plannerBody = sql.slice(plannerStart, plannerEnd);
  assert(
    plannerBody.includes('public.public_composition_customer_duration_minutes_v1(') &&
      plannerBody.includes('public.public_customer_booking_envelope_available_v1(') &&
      plannerBody.indexOf('public.public_customer_booking_envelope_available_v1(') <
        plannerBody.indexOf('public.resolve_public_composition_operator_plan_v1('),
    'Composition must reject customer-envelope overlap before resolving operators.',
  );
}
assert(
  /create or replace function public\.get_public_composition_slot_availability_batch_v1\([\s\S]*?workspace\.subscription_status in \('demo', 'active'\)[\s\S]*?or workspace\.is_internal_tester is true[\s\S]*?resolve_public_composition_operator_plan_v1/.test(
    sql,
  ),
  'Composition availability must support internal-tester workspaces without widening other workspace access.',
);
assert(
  /create or replace function public\.get_public_booking_consistency_token_v1\([\s\S]*?p_workspace_id uuid[\s\S]*?p_salon_code text default null[\s\S]*?returns text[\s\S]*?from public\.public_booking_consistency_revisions[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?workspace\.slug[\s\S]*?revision_row\.salon_code[\s\S]*?public_booking_consistency_workspace_mismatch[\s\S]*?return v_revision::text/.test(
    sql,
  ),
  'The minimal token RPC must fail closed on workspace/salon mismatch and return decimal text.',
);
assert(
  /revoke all on function public\.get_public_booking_consistency_token_v1\([\s\S]*?from public;[\s\S]*?grant execute on function public\.get_public_booking_consistency_token_v1\([\s\S]*?to anon, authenticated;/.test(
    sql,
  ),
  'Only the minimal consistency-token RPC may be executed by public app roles.',
);
assert(
  !/pg_current_wal_lsn|pg_current_snapshot/.test(sql) &&
    !/return[\s\S]{0,80}txid_current/i.test(sql),
  'The public token must expose only the workspace revision, not a global database token.',
);

assert(
  /create or replace function public\.get_public_booking_day_summary_page_v1\([\s\S]*?p_planner_kind text[\s\S]*?p_day_requests jsonb/.test(
    sql,
  ),
  'The paged day-summary RPC must expose one planner and one JSON page contract.',
);
assert(
  /v_page_size < 1 or v_page_size > 7[\s\S]*?day_summary_page_size_must_be_between_1_and_7/.test(
    sql,
  ),
  'The public RPC must hard-limit every page to seven dates.',
);
assert(
  /v_planner_kind not in \('simple', 'phased', 'dependency', 'composition'\)/.test(sql),
  'The page must accept only the four supported authoritative planner kinds.',
);
assert(
  /day_summary_workspace_identity_required[\s\S]*?select revision_row\.revision::text[\s\S]*?into v_consistency_token_before[\s\S]*?for v_page_item in[\s\S]*?select revision_row\.revision::text[\s\S]*?into v_consistency_token_after[\s\S]*?v_consistency_token_after is distinct from v_consistency_token_before[\s\S]*?errcode = '40001',[\s\S]*?message = 'day_summary_consistency_changed'[\s\S]*?jsonb_build_object\([\s\S]*?'consistencyToken', v_consistency_token_before,[\s\S]*?'statuses', v_result/.test(
    sql,
  ),
  'A successful page must return an envelope fenced by one unchanged workspace revision.',
);

for (const planner of [
  'get_public_booking_slot_availability_batch_v3',
  'get_public_phased_booking_slot_availability_batch_v4',
  'get_public_dependency_slot_availability_batch_v1',
  'get_public_composition_slot_availability_batch_v1',
]) {
  assert(sql.includes(`public.${planner}(`), `Missing authoritative planner: ${planner}.`);
}

assert(
  /day_summary_customer_identity_required[\s\S]*?get_public_phased_booking_slot_availability_batch_v4\([\s\S]*?p_customer_email,[\s\S]*?p_customer_phone,[\s\S]*?p_customer_name,[\s\S]*?p_customer_duration_minutes[\s\S]*?get_public_booking_slot_availability_batch_v3\([\s\S]*?p_customer_email,[\s\S]*?p_customer_phone,[\s\S]*?p_customer_name,[\s\S]*?p_customer_duration_minutes/.test(
    sql,
  ),
  'Simple and phased pages must require and forward the customer-aware contract.',
);
assert(
  /get_public_dependency_slot_availability_batch_v1\([\s\S]*?p_customer_email,[\s\S]*?p_customer_phone,[\s\S]*?get_public_composition_slot_availability_batch_v1\([\s\S]*?p_customer_email,[\s\S]*?p_customer_phone/.test(
    sql,
  ),
  'Dependency and composition pages must forward customer identity to their planners.',
);
assert(
  /v_first_chunk_size constant integer := 6[\s\S]*?v_followup_chunk_size constant integer := 24[\s\S]*?v_complex_followup_chunk_size constant integer := 6[\s\S]*?v_chunk_expected_slot_times[\s\S]*?jsonb_typeof\(v_slot_map -> v_expected_slot_time\) <> 'boolean'[\s\S]*?exit when v_has_available_slot[\s\S]*?v_scanned_all_slots/.test(
    sql,
  ),
  'Every day must use a six-slot early proof followed by complete chunks of at most 24.',
);
assert(
  /else v_followup_chunk_size[\s\S]*?into v_slot_request_chunk[\s\S]*?else v_complex_followup_chunk_size[\s\S]*?into v_slot_time_chunk/.test(
    sql,
  ),
  'Simple/phased may use 24-slot follow-ups, while measured slow complex planners must stay at six.',
);
assert(
  (sql.match(/while v_chunk_start < v_total_slot_count/g) ?? []).length === 2 &&
    (sql.match(/jsonb_typeof\(v_slot_map -> v_expected_slot_time\) <> 'boolean'/g) ?? [])
      .length === 2 &&
    /get_public_phased_booking_slot_availability_batch_v4\([\s\S]*?v_slot_request_chunk/.test(
      sql,
    ) &&
    /get_public_booking_slot_availability_batch_v3\([\s\S]*?v_slot_request_chunk/.test(sql) &&
    /get_public_dependency_slot_availability_batch_v1\([\s\S]*?v_slot_time_chunk/.test(sql) &&
    /get_public_composition_slot_availability_batch_v1\([\s\S]*?v_slot_time_chunk/.test(sql),
  'All four planners must consume only validated server chunks, never the full day payload.',
);
assert(
  /v_day_budget constant interval := interval '1600 milliseconds'[\s\S]*?v_page_budget constant interval := interval '2100 milliseconds'/.test(
    sql,
  ),
  'Planner work must use a fail-closed per-date and per-page budget.',
);
assert(
  (sql.match(/clock_timestamp\(\) - v_day_started_at >= v_day_budget/g) ?? []).length === 2 &&
    (sql.match(/clock_timestamp\(\) - v_page_started_at >= v_page_budget/g) ?? []).length === 2,
  'Regular, phased, dependency and composition chunks must all honor the timeout headroom.',
);
assert(
  /language plpgsql[\s\S]*?volatile[\s\S]*?security definer/.test(sql),
  'The clock-budgeted read-only RPC must not incorrectly claim stable volatility.',
);
assert(
  /jsonb_typeof\(v_page_item -> 'candidateSlotCount'\) = 'number'[\s\S]*?v_candidate_slot_count_text::integer = cardinality\(v_expected_slot_times\)[\s\S]*?when not v_complete_result then 'error'[\s\S]*?when v_has_available_slot then 'available'[\s\S]*?when v_scanned_all_slots[\s\S]*?and v_coverage_complete[\s\S]*?and v_candidate_slot_count_matches[\s\S]*?then 'full'[\s\S]*?else 'error'/.test(
    sql,
  ),
  'Partial maps must stay error and full must require matching complete candidate coverage.',
);
assert(
  /p_day_requests is null or jsonb_typeof\(p_day_requests\) <> 'array'[\s\S]*?v_slot_requests is null[\s\S]*?\(v_slot_request -> 'intervals'\) is null[\s\S]*?v_slot_times is null[\s\S]*?coalesce\(jsonb_typeof\(v_slot_map\) = 'object', false\)/.test(
    sql,
  ),
  'Null or missing arrays/maps must fail closed instead of becoming an empty full day.',
);
assert(
  /exception when others then[\s\S]*?v_status := 'error';[\s\S]*?jsonb_build_object\(v_date_text, v_status\)/.test(
    sql,
  ),
  'A planner failure must be isolated to its date and represented only as error.',
);
assert(
  !/sqlerrm|sqlstate/i.test(sql),
  'The anonymous result must not leak database error details.',
);
assert(
  /revoke all on function public\.get_public_booking_day_summary_page_v1\([\s\S]*?from public;[\s\S]*?grant execute on function public\.get_public_booking_day_summary_page_v1\([\s\S]*?to anon, authenticated;/.test(
    sql,
  ),
  'The security-definer RPC must expose only EXECUTE to app roles.',
);

const classify = ({
  complete,
  anyAvailable,
  scannedAllSlots,
  coverageComplete,
  candidateCountMatches,
}) => {
  if (!complete) return 'error';
  if (anyAvailable) return 'available';
  if (scannedAllSlots && coverageComplete && candidateCountMatches) return 'full';
  return 'error';
};

assert(
  classify({
    complete: false,
    anyAvailable: true,
    scannedAllSlots: false,
    coverageComplete: true,
    candidateCountMatches: true,
  }) === 'error',
  'A partial planner map must never become available.',
);
assert(
  classify({
    complete: true,
    anyAvailable: true,
    scannedAllSlots: false,
    coverageComplete: false,
    candidateCountMatches: false,
  }) === 'available',
  'One complete authoritative true is enough to prove availability.',
);
assert(
  classify({
    complete: true,
    anyAvailable: false,
    scannedAllSlots: false,
    coverageComplete: false,
    candidateCountMatches: false,
  }) === 'error',
  'An early negative chunk must never become a false full day.',
);
assert(
  classify({
    complete: true,
    anyAvailable: false,
    scannedAllSlots: true,
    coverageComplete: true,
    candidateCountMatches: false,
  }) === 'error',
  'A mismatched candidate count must never become a false full day.',
);
assert(
  classify({
    complete: true,
    anyAvailable: false,
    scannedAllSlots: false,
    coverageComplete: true,
    candidateCountMatches: true,
  }) === 'error',
  'Budget exhaustion before the final chunk must never become a false full day.',
);
assert(
  classify({
    complete: true,
    anyAvailable: false,
    scannedAllSlots: true,
    coverageComplete: true,
    candidateCountMatches: true,
  }) === 'full',
  'Only an exhaustive complete all-false result may become full.',
);

console.log('Paged public-booking day-summary contracts: OK');
