/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260828133000_group_owner_composition_push_by_actor.sql",
  ),
  "utf8",
);
const sendPushSource = fs.readFileSync(
  path.join(root, "supabase/functions/send-push/index.ts"),
  "utf8",
);
const ownerStatusSuppressionSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260829094000_suppress_owner_composition_confirmation_push.sql",
  ),
  "utf8",
);
const appContextSource = fs.readFileSync(
  path.join(root, "src/context/AppContext.tsx"),
  "utf8",
);

assert.match(
  appContextSource,
  /id: appointmentId,[\s\S]*?bookingRequestId:\s*createdRow\?\.bookingRequestId\?\.trim\(\) \|\| undefined,[\s\S]*?bookingOrigin: 'backoffice',[\s\S]*?customerId: appointmentCustomerId/,
  "The persisted owner-created appointment must retain the returned booking request identity and backoffice origin.",
);
assert.match(
  appContextSource,
  /id: appointmentId,[\s\S]*?bookingRequestId: bookingRequestId \?\? undefined,[\s\S]*?bookingOrigin: 'backoffice',[\s\S]*?customerId: customerId \?\? undefined/,
  "The direct owner-created appointment must retain the RPC booking request identity and backoffice origin.",
);
assert.match(
  appContextSource,
  /const rawBookingRequestIds\s*=\s*created\.bookingRequestIds\s*\?\?\s*created\.booking_request_ids;[\s\S]*?const bookingRequestIds = Array\.isArray\(rawBookingRequestIds\)[\s\S]*?rawBookingRequestIds\.map\(\(item\) => String\(item \?\? ''\)\.trim\(\)\)[\s\S]*?const bookingRequestId = createBookingRequests\s*\?\s*bookingRequestIds\[index\] \|\| undefined\s*:\s*undefined;[\s\S]*?bookingRequestId,[\s\S]*?bookingOrigin: bookingRequestId \? 'backoffice' : undefined,[\s\S]*?appointmentGroupId: groupId,[\s\S]*?appointmentGroupOrder: index \+ 1,[\s\S]*?appointmentGroupSize: normalizedItems\.length/,
  "Each optimistic owner-composition member must retain its same-position booking request identity and backoffice origin without changing group ordering.",
);

assert.match(
  migrationSource,
  /create or replace function public\.queue_owner_composition_created_push_v1[\s\S]*?request\.origin::text = 'backoffice'[\s\S]*?v_backoffice_request_count <> v_request_count[\s\S]*?return;/,
  "Only a complete group whose technical rows were created by the backoffice may become a salon-created composition push.",
);
assert.doesNotMatch(
  migrationSource,
  /v_group\.source\s*<>\s*'salon'|new\.source\s*=\s*'salon'/,
  "Customer provenance must not be reused as the appointment creation actor.",
);
assert.match(
  migrationSource,
  /string_agg[\s\S]*?requested_service_name[\s\S]*?appointment_time[\s\S]*?requested_operator_name[\s\S]*?appointment_group_order nulls last/,
  "The ordered component timeline must retain each service, time and operator mapping.",
);
assert.match(
  migrationSource,
  /finalPhaseEnabled[\s\S]*?phase_operator_assignments #>> '\{final,name\}'[\s\S]*?ripresa con/,
  "A phased component with a different final operator must identify the reprise operator.",
);
assert.match(
  migrationSource,
  /notification\.status = 'queued'[\s\S]*?notificationScope'[\s\S]*?<>[\s\S]*?'appointment_group'[\s\S]*?from unnest\(v_request_ids\)/,
  "Finalization may remove only unsent per-component pushes for the exact group.",
);
assert.doesNotMatch(
  migrationSource,
  /delete from public\.(appointments|booking_requests)/,
  "Push batching must never modify appointments or booking requests.",
);
assert.match(
  migrationSource,
  /'appointmentGroupId', p_appointment_group_id[\s\S]*?'notificationScope', 'appointment_group'[\s\S]*?'appointmentTime', null[\s\S]*?'serviceName', v_timeline[\s\S]*?'operatorName', ''[\s\S]*?'bookingTimeline', v_timeline/,
  "The single payload must carry its group identity and the full operator-aware timeline without repeating only the first time.",
);
assert.match(
  migrationSource,
  /create or replace function public\.finalize_owner_composition_created_push_v1[\s\S]*?if new\.status = 'active'[\s\S]*?queue_owner_composition_created_push_v1/,
  "The active group finalizer must delegate actor and completeness checks to the queue helper.",
);
assert.doesNotMatch(
  migrationSource,
  /old\.customer_id is null[\s\S]*?new\.customer_id is not null/,
  "A missing customer-id transition must not leave per-component pushes ungrouped.",
);
assert.match(
  sendPushSource,
  /const serviceName = compactPushText\([\s\S]*?payload\.serviceName[\s\S]*?const appointmentTime = formatCompactPushTime[\s\S]*?const operatorName = compactPushText[\s\S]*?details\.join\(' · '\)/,
  "The native sender must continue to render the operator-aware service timeline supplied by the grouped payload.",
);

assert.match(
  ownerStatusSuppressionSource,
  /count\(\*\) filter \(where request\.origin::text = 'backoffice'\)[\s\S]*?if v_total > 0 and v_accepted = v_total then[\s\S]*?if v_backoffice <> v_total then[\s\S]*?queue_booking_group_status_push_v1/,
  "An all-backoffice composition must not enqueue the customer-request confirmation push.",
);
assert.match(
  ownerStatusSuppressionSource,
  /if v_backoffice <> v_total then[\s\S]*?'accepted'::public\.request_status/,
  "Accepted customer-created or mixed groups must retain their confirmation path.",
);
assert.match(
  ownerStatusSuppressionSource,
  /elsif v_total > 0 and v_rejected = v_total[\s\S]*?'rejected'::public\.request_status[\s\S]*?elsif v_total > 0 and v_cancelled = v_total[\s\S]*?'cancelled'::public\.request_status/,
  "Reject and cancellation group notifications must stay unchanged.",
);
assert.doesNotMatch(
  ownerStatusSuppressionSource,
  /delete from public\.(appointments|booking_requests)|update public\.(appointments|booking_requests)/,
  "Notification suppression must never mutate appointments or booking requests.",
);

const formatExpectedTimeline = (items) =>
  items
    .map(({ service, time, operator }) =>
      [service, time ? `alle ${time}` : "", operator ? `con ${operator}` : ""]
        .filter(Boolean)
        .join(" "),
    )
    .join(" · ");

assert.equal(
  formatExpectedTimeline([
    { service: "Piega", time: "09:00", operator: "Roby" },
    { service: "Colore", time: "09:30", operator: "Moira" },
    { service: "Balayage", time: "10:00", operator: "Sara" },
  ]),
  "Piega alle 09:00 con Roby · Colore alle 09:30 con Moira · Balayage alle 10:00 con Sara",
  "Every component must retain its own operator in the visible timeline.",
);
assert.equal(
  formatExpectedTimeline([
    { service: "Piega", time: "09:00", operator: "Roby" },
    { service: "Posa", time: "09:30", operator: "" },
  ]),
  "Piega alle 09:00 con Roby · Posa alle 09:30",
  "A component without an operator must not inherit another component's operator.",
);

console.log("Single owner composition client push contracts: OK");
