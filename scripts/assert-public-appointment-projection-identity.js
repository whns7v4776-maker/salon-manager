/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const clientPortalSource = fs.readFileSync(
  path.join(root, "src/lib/client-portal.ts"),
  "utf8",
);
const migrationName =
  "20260901124500_project_public_appointment_identity.sql";
const migrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations", migrationName),
  "utf8",
);
const serviceProjectionMigrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260831233000_harden_service_realtime_and_portal_projection.sql",
  ),
  "utf8",
);

assert.ok(
  Number(migrationName.slice(0, 14)) > 20260901123000,
  "The appointment identity projection must run after every existing migration.",
);

const overlayMatch = migrationSource.match(
  /create or replace function public\.overlay_canonical_appointment_timing_v1[\s\S]*?\n\$\$;/,
);
assert.ok(
  overlayMatch,
  "The established canonical appointment overlay must be extended in place.",
);
const overlaySource = overlayMatch[0];

const entriesMatch = overlaySource.match(
  /with entries as \([\s\S]*?\n  \),\n  projected as \(/,
);
assert.ok(entriesMatch, "The snapshot identity aliases must be normalized once.");
assert.match(
  entriesMatch[0],
  /coalesce\(\s*nullif\(trim\(entry\.item ->> 'bookingRequestId'\), ''\),\s*nullif\(trim\(entry\.item ->> 'booking_request_id'\), ''\)\s*\) as snapshot_booking_request_id/,
  "A blank camel-case request id must fall through to the snake-case id.",
);
assert.match(
  entriesMatch[0],
  /coalesce\(\s*nullif\(trim\(entry\.item ->> 'appointmentGroupId'\), ''\),\s*nullif\(trim\(entry\.item ->> 'appointment_group_id'\), ''\)\s*\) as snapshot_appointment_group_id/,
  "A blank camel-case group id must fall through to the snake-case id.",
);
assert.match(
  entriesMatch[0],
  /coalesce\(\s*nullif\(trim\(entry\.item ->> 'appointmentGroupOrder'\), ''\),\s*nullif\(trim\(entry\.item ->> 'appointment_group_order'\), ''\)\s*\) as snapshot_appointment_group_order/,
  "A blank camel-case group order must fall through to the snake-case order.",
);

for (const canonicalField of [
  "'data', appointment.appointment_date::text",
  "'ora', to_char(appointment.appointment_time, 'HH24:MI')",
  "'cliente', trim(appointment.customer_name)",
  "'servizio', trim(appointment.service_name)",
  "'durataMinuti', appointment.duration_minutes",
  "'phaseConfig', appointment.phase_snapshot",
  "'phaseOperatorAssignments'",
  "'phaseOverlapOverrides'",
  "'mestiereRichiesto'",
  "'operatoreId'",
  "'operatoreNome'",
]) {
  assert.ok(
    overlaySource.includes(canonicalField),
    `Existing canonical field must remain projected: ${canonicalField}`,
  );
}

assert.match(
  overlaySource,
  /when appointment\.id is null then\s+case\s+when entries\.snapshot_appointment_group_id is null\s+then \(\s*entries\.item\s*- 'appointmentGroupOrder'\s*- 'appointmentGroupSize'\s*- 'appointment_group_order'\s*- 'appointment_group_size'/,
  "Local rows must retain group order/size when either normalized group alias is present.",
);

assert.match(
  overlaySource,
  /left join public\.booking_requests as booking_request[\s\S]*?booking_request\.id = appointment\.booking_request_id/,
  "bookingRequestId and bookingOrigin must be resolved from the linked authoritative request.",
);
assert.match(
  overlaySource,
  /'bookingRequestId', appointment\.booking_request_id[\s\S]*?'bookingOrigin',[\s\S]*?booking_request\.origin::text[\s\S]*?appointment\.created_by/,
  "Simple appointments must expose the request link and a canonical frontend/backoffice origin.",
);
assert.match(
  overlaySource,
  /left join public\.appointment_groups as appointment_group[\s\S]*?appointment_group\.id = appointment\.appointment_group_id/,
  "Group metadata must be joined only through the canonical appointment group id.",
);
assert.match(
  overlaySource,
  /'appointmentGroupId', appointment\.appointment_group_id[\s\S]*?'appointmentGroupOrder',[\s\S]*?appointment\.appointment_group_order[\s\S]*?'appointmentGroupSize',[\s\S]*?appointment\.appointment_group_size/,
  "Grouped appointments must preserve id, order and size from canonical columns.",
);
assert.match(
  overlaySource,
  /'compositionId', coalesce\(\s*nullif\(trim\(appointment_group\.metadata ->> 'compositionId'\), ''\),\s*nullif\(trim\(entries\.item ->> 'compositionId'\), ''\),\s*nullif\(trim\(entries\.item ->> 'composition_id'\), ''\)\s*\)/,
  "Composition identity must prefer group metadata while retaining older snapshot identity as fallback.",
);
assert.match(
  overlaySource,
  /'dependencyServiceId', coalesce\(\s*nullif\(trim\(appointment_group\.metadata ->> 'dependencyServiceId'\), ''\),\s*nullif\(trim\(entries\.item ->> 'dependencyServiceId'\), ''\),\s*nullif\(trim\(entries\.item ->> 'dependency_service_id'\), ''\)\s*\)/,
  "Dependency identity must prefer group metadata while retaining older snapshot identity as fallback.",
);

const identityMatch = overlaySource.match(
  /case\s+when entries\.item_id is not null[\s\S]*?end as identity_key/,
);
assert.ok(identityMatch, "The existing deterministic identity key must remain.");
assert.match(
  identityMatch[0],
  /case\s+when entries\.snapshot_booking_request_id is not null\s+then 'request:' \|\| entries\.snapshot_booking_request_id\s+when entries\.snapshot_appointment_group_id is null\s+then 'ungrouped'\s+else 'group:' \|\| entries\.snapshot_appointment_group_id\s+end,\s+case\s+when entries\.snapshot_booking_request_id is not null\s+then ''\s+when entries\.snapshot_appointment_group_id is null\s+then ''\s+else coalesce\(entries\.snapshot_appointment_group_order, ''\)\s+end,\s+trim\(coalesce\(entries\.item ->> 'data'/,
  "Legacy SQL identity must use request id first, clear group order for requests, then fall back to group id/order and visible slot fields.",
);
assert.match(
  overlaySource,
  /partition by projected\.identity_key/,
  "The established deterministic deduplication must remain active.",
);
assert.match(
  overlaySource,
  /where entries\.persisted_id is null\s+or appointment\.id is not null/,
  "Deleted persisted appointments must remain excluded while local-only rows survive.",
);

const publicSnapshotPatchMatch = migrationSource.match(
  /do \$migration\$[\s\S]*?'public\.get_client_portal_snapshot\(text\)'::regprocedure[\s\S]*?\$migration\$;/,
);
assert.ok(
  publicSnapshotPatchMatch,
  "The full public snapshot RPC must be patched without copying its established implementation.",
);
assert.match(
  publicSnapshotPatchMatch[0],
  /v_anchor text :=[\s\S]*?'appuntamenti', coalesce\(v_owner_payload -> 'appuntamenti', '\[\]'::jsonb\)[\s\S]*?v_replacement text :=[\s\S]*?'appuntamenti',[\s\S]*?overlay_canonical_appointment_timing_v1\([\s\S]*?v_workspace\.id,[\s\S]*?v_owner_payload -> 'appuntamenti'/,
  "Public reads must apply the canonical appointment overlay without waiting for another owner publish.",
);
assert.match(
  publicSnapshotPatchMatch[0],
  /if position\([\s\S]*?overlay_canonical_appointment_timing_v1[\s\S]*?replace\(v_definition, v_anchor, v_replacement\)[\s\S]*?public_appointment_projection_anchor_missing/,
  "The RPC patch must be idempotent and fail closed if the exact projection anchor drifts.",
);
assert.doesNotMatch(
  migrationSource,
  /create or replace function public\.get_public_portal_owner_payload/,
  "Hot availability/catalog callers must retain the existing lightweight owner-payload helper.",
);
const ownerPayloadHelperMatch = serviceProjectionMigrationSource.match(
  /create or replace function public\.get_public_portal_owner_payload[\s\S]*?\n\$\$;/,
);
assert.ok(
  ownerPayloadHelperMatch,
  "The preceding authoritative owner-payload helper must remain inspectable.",
);
assert.match(
  ownerPayloadHelperMatch[0],
  /snapshot_payload\.payload \|\| jsonb_build_object\(\s*'servizi',\s*public\.project_public_services_v1\(/,
  "Leaving the owner-payload helper untouched must preserve its complete canonical service overlay.",
);
assert.match(
  migrationSource,
  /revoke all on function public\.overlay_canonical_appointment_timing_v1\(uuid, jsonb\)[\s\S]*?from public, anon, authenticated/,
  "The internal appointment overlay must not become a direct public RPC.",
);
assert.match(
  migrationSource,
  /grant execute on function public\.get_client_portal_snapshot\(text\)[\s\S]*?to anon, authenticated/,
  "The intended public snapshot entrypoint must remain callable.",
);

assert.doesNotMatch(
  migrationSource,
  /\b(?:insert\s+into|update|delete\s+from|truncate)\s+public\.(?:appointments|booking_requests|appointment_groups|client_portals|owner_app_snapshots)\b/i,
  "Installing the projection migration must not mutate appointment or snapshot data.",
);

const text = (value) => String(value ?? "").trim();
const firstText = (...values) =>
  values.map(text).find((value) => value.length > 0) ?? "";
const projectCompositionIdentity = (item, groupMetadata = {}) => ({
  compositionId:
    text(groupMetadata.compositionId) ||
    text(item.compositionId ?? item.composition_id) ||
    undefined,
  dependencyServiceId:
    text(groupMetadata.dependencyServiceId) ||
    text(item.dependencyServiceId ?? item.dependency_service_id) ||
    undefined,
});
const legacyIdentityKey = (item) => {
  const id = text(item.id);
  if (id && !id.startsWith("appointment-")) {
    return `id:${id}`;
  }

  const groupId = firstText(
    item.appointmentGroupId,
    item.appointment_group_id,
  );
  const bookingRequestId = firstText(
    item.bookingRequestId,
    item.booking_request_id,
  );
  const groupOrder = groupId
    ? firstText(
        item.appointmentGroupOrder,
        item.appointment_group_order,
      )
    : "";
  return [
    "legacy",
    bookingRequestId
      ? `request:${bookingRequestId}`
      : groupId
        ? `group:${groupId}`
        : "ungrouped",
    bookingRequestId ? "" : groupOrder,
    text(item.data),
    text(item.ora).slice(0, 5),
    text(item.cliente).toLowerCase(),
    text(item.servizio).toLowerCase(),
    text(item.operatoreId),
  ].join("|");
};

assert.match(
  clientPortalSource,
  /if \(normalizedId && !normalizedId\.startsWith\('appointment-'\)\) \{[\s\S]*?return `id:\$\{normalizedId\}`;[\s\S]*?const appointmentGroupId =[\s\S]*?const bookingRequestId =[\s\S]*?const logicalIdentity = bookingRequestId[\s\S]*?`request:\$\{bookingRequestId\}`[\s\S]*?`group:\$\{appointmentGroupId\}`[\s\S]*?const appointmentGroupOrder =[\s\S]*?!bookingRequestId[\s\S]*?logicalIdentity,[\s\S]*?appointmentGroupOrder,/,
  "Client normalization must preserve stable UUID identity, prefer linked request identity, and use group/order only for older legacy rows.",
);

assert.deepEqual(
  projectCompositionIdentity({
    compositionId: "snapshot-composition",
    dependencyServiceId: "snapshot-dependency",
  }),
  {
    compositionId: "snapshot-composition",
    dependencyServiceId: "snapshot-dependency",
  },
  "Ungrouped snapshot composition/dependency identity must not be erased.",
);
assert.deepEqual(
  projectCompositionIdentity(
    {
      compositionId: "snapshot-composition",
      dependencyServiceId: "snapshot-dependency",
    },
    {
      compositionId: "canonical-composition",
      dependencyServiceId: "canonical-dependency",
    },
  ),
  {
    compositionId: "canonical-composition",
    dependencyServiceId: "canonical-dependency",
  },
  "Available canonical group metadata must override stale snapshot identity.",
);

const simple = {
  id: "appointment-local",
  data: "2026-09-01",
  ora: "11:50",
  cliente: "Cliente Test",
  servizio: "Taglio + Shampoo",
  operatoreId: "operator-edoardo",
};
assert.equal(
  legacyIdentityKey(simple),
  legacyIdentityKey({ ...simple }),
  "Equivalent simple legacy copies must still deduplicate.",
);
assert.equal(
  legacyIdentityKey(simple),
  "legacy|ungrouped||2026-09-01|11:50|cliente test|taglio + shampoo|operator-edoardo",
  "Pure owner legacy rows without request or group must retain the existing slot identity.",
);
assert.notEqual(
  legacyIdentityKey({ ...simple, bookingRequestId: "request-a" }),
  legacyIdentityKey({ ...simple, bookingRequestId: "request-b" }),
  "Distinct ungrouped request-linked bookings in the same slot must never be merged.",
);
assert.equal(
  legacyIdentityKey({
    ...simple,
    bookingRequestId: " ",
    booking_request_id: "request-snake",
    appointmentGroupId: "group-must-not-win",
  }).split("|")[1],
  "request:request-snake",
  "A blank camel-case request id must not hide a valid snake-case identity.",
);
assert.equal(
  legacyIdentityKey({ ...simple, id: "018f762f-86f0-7e71-bddd-629506092769" }),
  "id:018f762f-86f0-7e71-bddd-629506092769",
  "Persisted UUID appointments must retain their existing canonical identity.",
);

const firstGroup = {
  ...simple,
  appointmentGroupId: "group-a",
  appointmentGroupOrder: 1,
};
const secondGroup = {
  ...simple,
  appointmentGroupId: "group-b",
  appointmentGroupOrder: 1,
};
assert.equal(
  legacyIdentityKey({
    ...firstGroup,
    bookingRequestId: "request-group-a-member-1",
  }).split("|")[1],
  "request:request-group-a-member-1",
  "A linked request must take priority over group identity for legacy SQL rows.",
);
assert.notEqual(
  legacyIdentityKey({
    ...firstGroup,
    appointmentGroupOrder: undefined,
    bookingRequestId: "request-group-a-member-1",
  }),
  legacyIdentityKey({
    ...firstGroup,
    appointmentGroupOrder: undefined,
    bookingRequestId: "request-group-a-member-2",
  }),
  "Distinct linked members of one group must not merge when legacy group order is missing.",
);
assert.notEqual(
  legacyIdentityKey(firstGroup),
  legacyIdentityKey(secondGroup),
  "Distinct groups in the same visible slot must never be merged.",
);
assert.notEqual(
  legacyIdentityKey(firstGroup),
  legacyIdentityKey({ ...firstGroup, appointmentGroupOrder: 2 }),
  "Distinct members of one group must remain separate even in the same slot.",
);
assert.equal(
  legacyIdentityKey({
    ...simple,
    appointmentGroupId: "",
    appointment_group_id: "group-snake",
    appointmentGroupOrder: "",
    appointment_group_order: 2,
  }).split("|").slice(1, 3).join("|"),
  "group:group-snake|2",
  "Blank camel-case group aliases must not hide valid snake-case identity.",
);

const sameSlotRows = [simple, { ...simple }, firstGroup, secondGroup];
assert.equal(
  new Set(sameSlotRows.map(legacyIdentityKey)).size,
  3,
  "Only the ungrouped duplicate may collapse; both grouped bookings must survive.",
);

console.log("Public appointment projection identity contracts: OK");
