/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const context = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260829230000_align_linked_group_operator_service_capability.sql',
  ),
  'utf8',
);

const groupBranchStart = context.indexOf(
  'const hasGroupedAcceptanceOverride =',
);
const groupBranchEnd = context.indexOf(
  'const storedRequestPhaseConfig =',
  groupBranchStart,
);
assert.ok(groupBranchStart >= 0 && groupBranchEnd > groupBranchStart);
const groupBranch = context.slice(groupBranchStart, groupBranchEnd);

assert.match(
  groupBranch,
  /const groupStatusMutation = hasGroupedAcceptanceOverride[\s\S]*?accept_owner_booking_request_group_with_member_override_v1[\s\S]*?: await supabase\.rpc\('update_owner_booking_request_group_status_v1'/,
  'A linked group must choose exactly one RPC path from the presence of a manual override.',
);
assert.equal(
  (groupBranch.match(/supabase\.rpc\(/g) ?? []).length,
  2,
  'The group branch must contain only the two mutually exclusive RPC alternatives.',
);
assert.match(
  groupBranch,
  /p_target_request_id:\s*storedRequest\.id[\s\S]*?p_initial_operator_id:[\s\S]*?p_final_operator_id:[\s\S]*?p_next_duration_minutes:[\s\S]*?p_ignore_conflicts:\s*false/,
  'The override RPC must receive the exact target member and every supported manual choice.',
);
assert.match(
  groupBranch,
  /booking_request_conflict[\s\S]*?hasGroupedAcceptanceOverride[\s\S]*?La disponibilità è cambiata: scegli un altro orario o operatore per questa fase\./,
  'A linked manual override conflict must not advertise an unsupported force retry.',
);
assert.match(
  groupBranch,
  /La composizione non è più disponibile nell’orario scelto\. Aggiorna l’Agenda e riprova\./,
  'A status-only linked conflict must also remain server-authoritative instead of looping through force acceptance.',
);
assert.match(
  groupBranch,
  /projectGroupedRequestStatus[\s\S]*?item\.id === storedRequest\.id[\s\S]*?durataMinuti:[\s\S]*?operatoreId:[\s\S]*?phaseOperatorAssignments:/,
  'Only the selected member may receive the optimistic duration/operator projection.',
);

assert.match(
  migration,
  /create or replace function public\.accept_owner_booking_request_group_with_member_override_v1\([\s\S]*?p_appointment_group_id uuid[\s\S]*?p_target_request_id uuid[\s\S]*?p_next_duration_minutes integer default null[\s\S]*?p_ignore_conflicts boolean default false/,
  'The database contract must expose one target-member override entry point.',
);
assert.match(
  migration,
  /booking_request\.id = p_target_request_id[\s\S]*?booking_request\.appointment_group_id = p_appointment_group_id[\s\S]*?booking_request_not_in_group/,
  'The target request must be proven to belong to the authenticated workspace group.',
);
assert.match(
  migration,
  /perform group_request\.id[\s\S]*?appointment_group_id = p_appointment_group_id[\s\S]*?for update;/,
  'The complete linked group must be locked before its target is mutated.',
);
assert.match(
  migration,
  /phased_duration_override_not_supported[\s\S]*?phase_operator_assignments = v_assignments/,
  'Internally phased members must preserve their duration contract and save both operator assignments.',
);
assert.match(
  migration,
  /v_next_duration < v_previous_duration[\s\S]*?invalid_duration_step[\s\S]*?requested_duration_minutes = v_next_duration/,
  'Simple linked members may only be shortened with the configured agenda step.',
);
assert.match(
  migration,
  /if \([\s\S]*?phased_operator_interval_conflicts_v1[\s\S]*?raise exception 'booking_request_conflict'/,
  'The selected phased member must always pass authoritative operator-conflict validation.',
);
assert.equal(
  (migration.match(/p_ignore_conflicts/g) ?? []).length,
  1,
  'The legacy ignore parameter may remain in the RPC signature but must not bypass server validation.',
);
assert.match(
  migration,
  /for v_group_request in[\s\S]*?appointment_group_id = p_appointment_group_id[\s\S]*?perform public\.validate_booking_request_auto_accept_v1\([\s\S]*?v_group_request\.id[\s\S]*?end loop;/,
  'Every pending frontend sibling must be revalidated after the target override and before materialization.',
);
assert.match(
  migration,
  /when v_initial_operator_requested then[\s\S]*?p_initial_operator_id[\s\S]*?v_initial_lookup_id is null[\s\S]*?v_initial_lookup_name/,
  'A name-only phased override must resolve the requested name instead of falling back to the previous operator id.',
);
assert.equal(
  (migration.match(/public\.public_operator_can_book_service_v1\(/g) ?? [])
    .length,
  3,
  'Both phased operators and the simple-service operator must use the canonical service-capability contract.',
);
assert.doesNotMatch(
  migration,
  /v_initial_operator_role|v_final_operator_role|v_request_role/,
  'The override RPC must not fall back to strict role equality, which rejects valid selected-service assignments.',
);
assert.equal(
  (
    migration.match(
      /public\.update_owner_booking_request_group_status_v1\(\s*p_appointment_group_id,\s*'accepted'\s*\)/g,
    ) ?? []
  ).length,
  1,
  'The target override must finish with one and only one internal whole-group acceptance.',
);
assert.match(
  migration,
  /where workspace_id = v_workspace_id[\s\S]*?and id = v_request\.id[\s\S]*?and appointment_group_id = p_appointment_group_id;/,
  'The pre-acceptance update must stay scoped to the selected member.',
);

console.log('Linked group manual acceptance contracts: OK');
