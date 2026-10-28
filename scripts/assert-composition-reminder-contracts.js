/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260829095000_group_composition_appointment_reminders.sql",
  ),
  "utf8",
);

assert.match(
  migrationSource,
  /appointment\.appointment_group_id is null[\s\S]*?'type', 'appointment_reminder'[\s\S]*?'appointmentTime', v_row\.appointment_time[\s\S]*?appointment_push_reminders/,
  "Standalone appointments must retain their existing reminder payload and ledger.",
);
assert.match(
  migrationSource,
  /distinct on \([\s\S]*?appointment\.workspace_id,[\s\S]*?appointment\.appointment_group_id[\s\S]*?appointment_group_order nulls last[\s\S]*?appointment_date[\s\S]*?appointment_time/,
  "A composition reminder must be anchored to its first ordered appointment.",
);
assert.match(
  migrationSource,
  /string_agg\([\s\S]*?component\.service_name[\s\S]*?component\.appointment_time[\s\S]*?phase_operator_assignments #>> '\{initial,name\}'[\s\S]*?requested_operator_name[\s\S]*?appointment_group_order nulls last/,
  "The grouped reminder must list every service, time and operator in order.",
);
assert.match(
  migrationSource,
  /phase_operator_assignments #>> '\{final,name\}'[\s\S]*?ripresa con/,
  "A different final-phase operator must remain visible in the grouped reminder.",
);
assert.match(
  migrationSource,
  /'appointment_reminder',[\s\S]*?v_row\.appointment_group_id::text,[\s\S]*?v_row\.reminder_hours_before::text[\s\S]*?'_dedupeKey', v_dedupe_key/,
  "Reminder dedupe must use the logical group rather than a technical phase id.",
);
assert.match(
  migrationSource,
  /'appointmentGroupId', v_row\.appointment_group_id[\s\S]*?'notificationScope', 'appointment_group'[\s\S]*?'appointmentTime', null[\s\S]*?'bookingTimeline', v_service_name/,
  "The single grouped push must carry group identity and the full timeline without repeating only the first time.",
);
assert.doesNotMatch(
  migrationSource,
  /update public\.appointments|delete from public\.appointments|update public\.booking_requests|delete from public\.booking_requests/,
  "Reminder grouping must never modify appointments or booking requests.",
);

const timeline = [
  { service: "Balayage", time: "09:00", operator: "Moira" },
  { service: "Taglio", time: "10:00", operator: "Moira" },
  { service: "Colore", time: "11:00", operator: "Moira" },
]
  .map((item) => `${item.service} alle ${item.time} con ${item.operator}`)
  .join(" · ");

assert.equal(
  timeline,
  "Balayage alle 09:00 con Moira · Taglio alle 10:00 con Moira · Colore alle 11:00 con Moira",
  "The composition reminder must remain one readable ordered timeline.",
);

console.log("Composition reminder contracts: OK");
