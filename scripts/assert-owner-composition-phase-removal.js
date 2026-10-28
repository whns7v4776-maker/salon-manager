/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationName =
  "20260828140000_harden_owner_composition_phase_removal.sql";
const migrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations", migrationName),
  "utf8",
);
const dedupeMigrationName =
  "20260828153000_make_public_push_event_key_authoritative.sql";
const dedupeMigrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations", dedupeMigrationName),
  "utf8",
);

const phaseMatch = migrationSource.match(
  /create or replace function public\.cancel_owner_composition_phase_v1[\s\S]*?\n\$\$;/,
);
assert.ok(phaseMatch, "The hardened phase-removal RPC must be present.");
const phaseSource = phaseMatch[0];
const dedupeMatch = dedupeMigrationSource.match(
  /create or replace function public\.queue_public_customer_push[\s\S]*?\n\$\$;/,
);
assert.ok(dedupeMatch, "The authoritative customer-push dedupe RPC must be present.");
const dedupeSource = dedupeMatch[0];

assert.ok(
  Number(migrationName.slice(0, 14)) > 20260828133000,
  "The fix must be a new migration after the latest applied migration.",
);
assert.ok(
  Number(dedupeMigrationName.slice(0, 14)) > Number(migrationName.slice(0, 14)),
  "The dedupe fix must run after the phase-removal migration.",
);
assert.match(
  phaseSource,
  /appointment_group[\s\S]*?id = v_group_id[\s\S]*?for update;[\s\S]*?appointment_group_id = v_group_id[\s\S]*?for update;/,
  "The group must be locked before its component rows.",
);
assert.match(
  phaseSource,
  /order by appointment\.id\s+for update;[\s\S]*?order by request\.id\s+for update;/,
  "All sibling appointments and requests must use a deterministic lock order.",
);
assert.doesNotMatch(
  phaseSource,
  /row_number\(\)[\s\S]{0,180}-\s*1\s+as next_order/,
  "Composition rows are one-based; reindexing must never emit order zero.",
);
assert.ok(
  (phaseSource.match(/row_number\(\) over/g) ?? []).length >= 3,
  "Aggregate, appointment and request ordering must all be rebuilt.",
);
assert.match(
  phaseSource,
  /delete from public\.appointments[\s\S]*?delete from public\.booking_requests/,
  "The removed appointment and its technical request must both be deleted.",
);
assert.match(
  phaseSource,
  /request\.id = v_target\.booking_request_id\s+and request\.appointment_group_id = v_group_id;/,
  "A stale link must never delete a technical request from another group.",
);
assert.doesNotMatch(
  phaseSource,
  /update public\.booking_requests[\s\S]{0,260}status\s*=\s*'cancelled'|viewed_by_customer\s*=\s*false|cancellation_source\s*=\s*'salone'/,
  "A phase removal must not manufacture a cancelled or unread customer card.",
);
assert.match(
  phaseSource,
  /'removedBookingRequestId', v_removed_request\.id/,
  "The response and audit payload must expose the deleted technical request id.",
);
assert.match(
  phaseSource,
  /set title = v_remaining_title,[\s\S]*?total_price = v_remaining_total_price,[\s\S]*?'itemCount', v_remaining_count,[\s\S]*?'itemPauses', v_item_pauses,[\s\S]*?'customerCommitmentMinutes', v_customer_commitment_minutes/,
  "Group title, price, size, pauses and customer commitment must be recomputed together.",
);
assert.match(
  phaseSource,
  /metadata[\s\S]*?\? 'requestIds'[\s\S]*?'requestIds', v_remaining_request_ids[\s\S]*?\? 'operatorAssignments'[\s\S]*?'operatorAssignments', v_operator_assignments[\s\S]*?'splitOperators', v_split_operators/,
  "Legacy public-group request and operator arrays must be rebuilt only when those metadata keys already exist.",
);
assert.match(
  phaseSource,
  /appointment_group_order = ordered\.next_order,[\s\S]*?appointment_group_size = ordered\.next_size/,
  "Surviving appointments must be normalized to order 1..N and size N.",
);
assert.match(
  phaseSource,
  /request[\s\S]*?appointment_group_order = ordered\.next_order,[\s\S]*?appointment_group_size = ordered\.next_size/,
  "Surviving technical requests must use the same one-based group contract.",
);
assert.match(
  migrationSource,
  /skip_owner_composition_created_push[\s\S]*?return new;/,
  "The creation finalizer must honor the narrow local suppression guard.",
);
assert.match(
  migrationSource,
  /skip_booking_group_status_push[\s\S]*?return new;/,
  "The group-status finalizer must honor the narrow local suppression guard.",
);
assert.match(
  phaseSource,
  /set_config\('salonpro\.skip_owner_composition_created_push', 'on', true\)[\s\S]*?set_config\('salonpro\.skip_booking_group_status_push', 'on', true\)/,
  "Aggregate repair must suppress both collateral group push paths.",
);
assert.doesNotMatch(
  phaseSource,
  /skip_client_portal_snapshot_sync/,
  "Portal synchronization must remain enabled so the removed card disappears.",
);
assert.equal(
  (phaseSource.match(/queue_public_customer_push\(/g) ?? []).length,
  1,
  "The RPC must explicitly queue exactly one canonical customer push.",
);
assert.match(
  phaseSource,
  /'custom'::public\.push_event_type[\s\S]*?'type', 'appointment_updated'[\s\S]*?'event_type', 'appointment_updated'/,
  "The database enum must use custom while the semantic payload remains appointment_updated.",
);
assert.doesNotMatch(
  phaseSource,
  /'appointment_updated'::public\.push_event_type/,
  "appointment_updated is not a database push_event_type enum value.",
);
assert.match(
  phaseSource,
  /'appointmentId', v_first_remaining\.id[\s\S]*?'bookingRequestId', v_first_remaining_request\.id[\s\S]*?'removedAppointmentId', v_target\.id/,
  "The update push must anchor to the first survivor while identifying the removed phase separately.",
);
assert.match(
  phaseSource,
  /'appointmentTime', null,[\s\S]*?'anchorAppointmentTime',[\s\S]*?'serviceName', v_timeline,[\s\S]*?'operatorName', '',[\s\S]*?'bookingTimeline', v_timeline/,
  "The payload must keep each service/time/operator mapping in one ordered timeline.",
);
assert.match(
  phaseSource,
  /phase_operator_assignments #>> '\{initial,name\}'[\s\S]*?' con '[\s\S]*?phase_operator_assignments #>> '\{final,name\}'[\s\S]*?', ripresa con '/,
  "Initial and reprise operators must stay attached to their service.",
);
assert.doesNotMatch(
  migrationSource,
  /create or replace function public\.(cancel_owner_linked_appointment_v1|move_owner_appointment_direct_v1|reorganize_owner_linked_appointments_v1)/,
  "The surgical migration must not replace whole-group cancellation or drag RPCs.",
);
assert.match(
  dedupeSource,
  /v_dedupe_key is not null[\s\S]*?payload ->> '_dedupeKey'[\s\S]*?= v_dedupe_key/,
  "An explicit event key must still suppress an exact replay of that event.",
);
assert.match(
  dedupeSource,
  /v_dedupe_key is null\s+and v_booking_request_id is not null[\s\S]*?payload ->> 'bookingRequestId'/,
  "The booking-request fallback must run only when an event key is absent.",
);
assert.match(
  dedupeSource,
  /v_dedupe_key is null\s+and v_booking_request_id is null\s+and v_appointment_id is not null[\s\S]*?payload ->> 'appointmentId'/,
  "The appointment fallback must run only when an event key is absent.",
);
assert.doesNotMatch(
  dedupeMigrationSource,
  /create or replace function public\.(cancel_owner_composition_phase_v1|cancel_owner_linked_appointment_v1)/,
  "The dedupe migration must not replace phase or whole-group cancellation.",
);

const isDuplicateCustomerPush = (existing, incoming) => {
  const incomingKey = incoming.dedupeKey?.trim().toLowerCase() || null;
  if (incomingKey) {
    return existing.some(
      (item) => item.dedupeKey?.trim().toLowerCase() === incomingKey,
    );
  }

  return existing.some(
    (item) =>
      item.bookingRequestId === incoming.bookingRequestId &&
      (item.statusCode ?? null) === (incoming.statusCode ?? null) &&
      (item.cancellationSource ?? null) ===
        (incoming.cancellationSource ?? null),
  );
};

const firstRemovalPush = {
  dedupeKey: "workspace|composition_phase_removed|remove-balayage",
  bookingRequestId: "surviving-piega-request",
};
const secondRemovalPush = {
  dedupeKey: "workspace|composition_phase_removed|remove-colore",
  bookingRequestId: "surviving-piega-request",
};
assert.equal(
  isDuplicateCustomerPush([firstRemovalPush], secondRemovalPush),
  false,
  "Two different phase removals sharing one survivor must both be queued.",
);
assert.equal(
  isDuplicateCustomerPush([firstRemovalPush], { ...firstRemovalPush }),
  true,
  "A retry of the same phase-removal event must still be deduplicated.",
);

const rebuild = (items, removedIndex) =>
  items
    .filter((_, index) => index !== removedIndex)
    .map((item, index, surviving) => ({
      ...item,
      order: index + 1,
      size: surviving.length,
      pause: Math.max(0, Math.min(180, item.pause)),
    }));

const sample = [
  { service: "Piega", price: 25, duration: 30, pause: 0 },
  { service: "Colore", price: 25, duration: 15, pause: 5 },
  { service: "Balayage", price: 70, duration: 60, pause: 0 },
];

const withoutFirst = rebuild(sample, 0);
assert.deepEqual(
  withoutFirst.map(({ service, order, size, pause }) => ({
    service,
    order,
    size,
    pause,
  })),
  [
    { service: "Colore", order: 1, size: 2, pause: 5 },
    { service: "Balayage", order: 2, size: 2, pause: 0 },
  ],
  "Removing the first phase must shift survivors and their own pauses to 1..N.",
);
assert.equal(
  withoutFirst.reduce((total, item) => total + item.price, 0),
  95,
  "Removing the first phase must rebuild the group total.",
);
assert.equal(
  withoutFirst.reduce(
    (total, item) => total + item.duration + item.pause,
    0,
  ),
  80,
  "Removing the first phase must rebuild customer commitment from survivors.",
);

const withoutMiddle = rebuild(sample, 1);
assert.deepEqual(
  withoutMiddle.map(({ service, order, size }) => ({ service, order, size })),
  [
    { service: "Piega", order: 1, size: 2 },
    { service: "Balayage", order: 2, size: 2 },
  ],
  "Removing a middle phase must leave a contiguous one-based group.",
);

console.log("Owner composition phase-removal contracts: OK");
