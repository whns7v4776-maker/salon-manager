/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationName = "20260828160000_filter_deleted_request_projections.sql";
const migrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations", migrationName),
  "utf8",
);
const phaseMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260828140000_harden_owner_composition_phase_removal.sql",
  ),
  "utf8",
);

assert.ok(
  Number(migrationName.slice(0, 14)) > 20260828153000,
  "The projection fix must run after the authoritative push-dedupe migration.",
);

const overlayMatch = migrationSource.match(
  /create or replace function public\.overlay_canonical_request_timing_v1[\s\S]*?\n\$\$;/,
);
assert.ok(overlayMatch, "The canonical request overlay must be replaced.");
const overlaySource = overlayMatch[0];

assert.match(
  overlaySource,
  /when nullif\(trim\(entry\.item ->> 'id'\), ''\) ~\*[\s\S]*?then trim\(entry\.item ->> 'id'\)::uuid[\s\S]*?else null[\s\S]*?end as persisted_id/,
  "Only syntactically persisted UUIDs may be resolved against booking_requests.",
);
assert.match(
  overlaySource,
  /left join public\.booking_requests[\s\S]*?request\.id = entries\.persisted_id[\s\S]*?where entries\.persisted_id is null\s+or request\.id is not null/,
  "Missing persisted UUIDs must be filtered while local IDs remain eligible.",
);
assert.match(
  overlaySource,
  /'data', request\.appointment_date::text[\s\S]*?'ora', to_char\(request\.appointment_time, 'HH24:MI'\)[\s\S]*?'durataMinuti', request\.requested_duration_minutes[\s\S]*?'phaseConfig', request\.phase_snapshot/,
  "Existing persisted requests must retain canonical server timing.",
);
assert.match(
  overlaySource,
  /entries\.item - 'mestiereRichiesto'[\s\S]*?'mestiereRichiesto', trim\(coalesce\(request\.required_role, ''\)\)/,
  "The required-role authority added by the previous migration must remain intact.",
);

assert.match(
  migrationSource,
  /after delete on public\.appointments[\s\S]*?execute function public\.prune_deleted_agenda_projection_v1\(\)/,
  "Appointment deletion must prune owner and portal projections in the same transaction.",
);
assert.match(
  migrationSource,
  /after delete on public\.booking_requests[\s\S]*?execute function public\.prune_deleted_agenda_projection_v1\(\)/,
  "Technical request deletion must prune owner and portal projections in the same transaction.",
);
assert.match(
  migrationSource,
  /set appuntamenti = portal\.appuntamenti[\s\S]*?set payload = snapshot\.payload[\s\S]*?set richieste_prenotazione = portal\.richieste_prenotazione[\s\S]*?set payload = snapshot\.payload/,
  "Deletion cleanup must self-update both derived stores so their canonical triggers run.",
);
assert.match(
  migrationSource,
  /update public\.client_portals[\s\S]*?overlay_canonical_request_timing_v1[\s\S]*?update public\.owner_app_snapshots[\s\S]*?overlay_canonical_request_timing_v1/,
  "Current portal and owner snapshot ghosts must be repaired once.",
);
assert.doesNotMatch(
  migrationSource,
  /create or replace function public\.cancel_owner_composition_phase_v1|queue_public_customer_push\(/,
  "Projection hardening must not replace the proven phase-removal push transaction.",
);
assert.match(
  phaseMigrationSource,
  /delete from public\.appointments[\s\S]*?delete from public\.booking_requests/,
  "The phase-removal RPC must keep driving both atomic DELETE barriers.",
);

const reorganizationMatch = migrationSource.match(
  /create or replace function public\.apply_owner_linked_reorganization_v5[\s\S]*?\n\$\$;/,
);
assert.ok(
  reorganizationMatch,
  "A strict v5 reorganization wrapper must guard stale group plans.",
);
const reorganizationSource = reorganizationMatch[0];
assert.match(
  reorganizationSource,
  /select appointment\.\*[\s\S]*?where appointment\.id = p_anchor_appointment_id;[\s\S]*?from public\.appointment_groups[\s\S]*?for update;[\s\S]*?appointment_group_id is not distinct from v_group_id[\s\S]*?for update;/,
  "v5 must resolve the anchor, then lock group and re-read/lock the anchor.",
);
assert.match(
  reorganizationSource,
  /order by appointment\.id\s+for update;[\s\S]*?array_agg\(appointment\.id::text order by appointment\.id::text\)/,
  "v5 must lock every authoritative sibling in deterministic order.",
);
assert.match(
  reorganizationSource,
  /count\(distinct lower\(trim\(plan_item\.value ->> 'appointmentId'\)\)\)[\s\S]*?v_plan_distinct_count <> v_plan_count[\s\S]*?v_plan_ids is distinct from v_current_ids[\s\S]*?raise exception 'group_plan_changed'/,
  "Duplicate, omitted, extra or stale plan IDs must all fail as group_plan_changed.",
);
assert.match(
  reorganizationSource,
  /return public\.apply_owner_linked_reorganization_v4\([\s\S]*?p_anchor_appointment_id,[\s\S]*?p_items,[\s\S]*?p_allow_operator_overlap,[\s\S]*?p_allow_customer_overlap/,
  "Only an exact authoritative plan may delegate to the proven v4 transaction.",
);
assert.match(
  migrationSource,
  /grant execute on function public\.apply_owner_linked_reorganization_v5\([\s\S]*?uuid, jsonb, boolean, boolean[\s\S]*?\) to authenticated/,
  "Only authenticated owners receive the v5 RPC grant.",
);
assert.doesNotMatch(
  migrationSource,
  /create or replace function public\.apply_owner_linked_reorganization_v4/,
  "The strict wrapper must not alter v4 or its established behavior.",
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const overlayModel = (items, canonicalById) =>
  items.flatMap((item) => {
    const id = String(item.id ?? "").trim();
    const persistedId = UUID_PATTERN.test(id) ? id.toLowerCase() : null;
    if (persistedId && !canonicalById.has(persistedId)) return [];
    if (!persistedId) return [item];

    const request = canonicalById.get(persistedId);
    return [
      {
        ...item,
        data: request.date,
        ora: request.time,
        durataMinuti: request.duration,
        phaseConfig: request.phaseConfig,
        mestiereRichiesto: request.requiredRole,
      },
    ];
  });

const existingId = "11111111-1111-4111-8111-111111111111";
const deletedId = "22222222-2222-4222-8222-222222222222";
const local = { id: "request-local-7", ora: "09:15", servizio: "Piega" };
const canonical = new Map([
  [
    existingId,
    {
      date: "2026-08-29",
      time: "10:00",
      duration: 30,
      phaseConfig: { version: 1 },
      requiredRole: "Hair Stylist",
    },
  ],
]);
const result = overlayModel(
  [
    local,
    { id: deletedId, ora: "10:30", servizio: "Colore" },
    { id: existingId, ora: "08:00", durataMinuti: 99 },
  ],
  canonical,
);

assert.equal(
  result.length,
  2,
  "Exactly the deleted persisted UUID is removed.",
);
assert.deepEqual(
  result[0],
  local,
  "A local/non-UUID request survives unchanged.",
);
assert.deepEqual(
  result[1],
  {
    id: existingId,
    ora: "10:00",
    durataMinuti: 30,
    data: "2026-08-29",
    phaseConfig: { version: 1 },
    mestiereRichiesto: "Hair Stylist",
  },
  "An existing UUID is overlaid from canonical booking_requests timing.",
);

const exactPlanMatches = (currentIds, planIds) => {
  const normalized = planIds.map((id) => String(id).trim().toLowerCase());
  return (
    normalized.every((id) => UUID_PATTERN.test(id)) &&
    new Set(normalized).size === normalized.length &&
    [...normalized].sort().join("|") ===
      currentIds
        .map((id) => id.toLowerCase())
        .sort()
        .join("|")
  );
};

const groupIds = [existingId, deletedId];
assert.equal(
  exactPlanMatches(groupIds, [deletedId, existingId]),
  true,
  "The same authoritative group is valid regardless of item order.",
);
assert.equal(
  exactPlanMatches(groupIds, [existingId]),
  false,
  "A plan captured after hiding one current phase is incomplete.",
);
assert.equal(
  exactPlanMatches([existingId], [existingId, deletedId]),
  false,
  "A plan captured before phase deletion is stale and must be rejected.",
);
assert.equal(
  exactPlanMatches(groupIds, [existingId, existingId]),
  false,
  "Duplicate plan IDs must never pass the exact-set barrier.",
);

console.log("Deleted request projection authority contracts: OK");
