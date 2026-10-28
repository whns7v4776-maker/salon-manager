/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agendaSource = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);
const contextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationSources = fs
  .readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .map((fileName) => ({
    fileName,
    source: fs.readFileSync(path.join(migrationsDirectory, fileName), 'utf8'),
  }));

const organizerMigration = migrationSources.find(({ source }) =>
  /create or replace function public\.apply_owner_linked_reorganization_v6\s*\(/i.test(
    source,
  ),
);

const sourceBetween = (source, start, end, label) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${label}: start marker is missing.`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${label}: end marker is missing.`);
  return source.slice(startIndex, endIndex);
};

const organizerDraftSource = sourceBetween(
  agendaSource,
  'type WeekReorganizationDraft = {',
  'type WeekInteractionConfirmationButton',
  'Organizer draft',
);
const buildDraftSource = sourceBetween(
  agendaSource,
  'const buildWeekReorganizationDraft = useCallback(',
  'const getNativeLinkedMoveExternalConflict',
  'Organizer draft builder',
);
const reorderSource = sourceBetween(
  agendaSource,
  'const finishWeekReorganizationEditorReorder = useCallback(',
  'const adjustWeekReorganizationEditorPhase',
  'Organizer reorder',
);
const attachmentSource = sourceBetween(
  agendaSource,
  'const attachWeekReorganizationAppointments = useCallback(',
  'const beginWeekAppointmentDrag',
  'Organizer sequential attachment',
);
const applyDraftSource = sourceBetween(
  agendaSource,
  'const applyWeekReorganizationDraft = useCallback(',
  'const stageWeekReorganizationResize',
  'Organizer save',
);
const capacitySummarySource = sourceBetween(
  agendaSource,
  'const weekReorganizationCapacitySummary = useMemo(',
  '// La testata mobile operatori/mestieri',
  'Organizer live capacity summary',
);
const organizerModalSource = sourceBetween(
  agendaSource,
  'visible={weekReorganizationEditorOpen && !!weekReorganizationDraft}',
  'visible={\n          !!quickSlotModalShellDraft',
  'Organizer shared modal',
);
const contextReorganizationSource = sourceBetween(
  contextSource,
  'const reorganizeOwnerLinkedAppointmentsForSalon = async ({',
  'const swapOwnerAppointmentCompositionsForSalon = async ({',
  'Owner linked reorganization persistence',
);

// A composition pause belongs to a component identity, not to its transient
// visual index. This is what keeps the pause attached when components reorder.
assert.match(
  organizerDraftSource,
  /pauseAfterMinutesByAppointmentId:\s*Record<string, number>/,
  'The organizer draft must keep inter-component pauses by appointment id.',
);
assert.match(
  buildDraftSource,
  /pauseAfterMinutesByAppointmentId[\s\S]*?resolveWeekLinkedPauseAfterMinutes/,
  'Opening the organizer must hydrate persisted composition pauses.',
);
assert.match(
  organizerModalSource,
  /pauseAfterMinutesByAppointmentId\s*\[\s*item\.id\s*\]/,
  'The pause control must read the pause belonging to the rendered component.',
);
assert.match(
  organizerModalSource,
  /Posa dopo il servizio|Posa nella composizione/,
  'The organizer must identify the inter-component pause as belonging after the service.',
);
assert.match(
  organizerModalSource,
  /adjustWeekReorganizationEditorPause\([\s\S]*?-5[\s\S]*?adjustWeekReorganizationEditorPause\([\s\S]*?5/,
  'Every eligible component must expose compact remove/add pause controls.',
);
assert.match(
  organizerModalSource,
  /const renderCompositionPauseControl =/,
  'The composition-pause control must be shared by simple and internally phased services.',
);
assert.equal(
  (organizerModalSource.match(/renderCompositionPauseControl\(\)/g) ?? [])
    .length,
  2,
  'The shared pause control must render once in both the phased and simple component branches.',
);

// Reordering services with unequal durations cannot reuse the old card slots:
// all following starts must be rebuilt from duration + that component's pause.
assert.match(
  reorderSource,
  /appointmentGroupOrder:\s*index \+ 1[\s\S]*?attachWeekReorganizationAppointments\([\s\S]*?keepCurrentVisualOrder:\s*false[\s\S]*?pauseAfterMinutesByAppointmentId:\s*draft\.pauseAfterMinutesByAppointmentId/,
  'A reordered plan must be resequenced from its new order and current pauses.',
);
assert.match(
  attachmentSource,
  /getCustomerOccupiedDurationMinutes\(previous\)[\s\S]*?pausesByAppointmentId\.get\(previous\.id\)/,
  'Forward sequencing must add the previous component duration and pause.',
);
assert.match(
  attachmentSource,
  /getCustomerOccupiedDurationMinutes\(appointment\)[\s\S]*?pausesByAppointmentId\.get\(appointment\.id\)/,
  'Backward sequencing must subtract the component duration and pause.',
);

const layOutSequentially = ({ startMinutes, orderedIds, durations, pauses }) => {
  let cursor = startMinutes;
  return orderedIds.map((id) => {
    const start = cursor;
    cursor += durations[id] + (pauses[id] ?? 0);
    return { id, start };
  });
};

assert.deepEqual(
  layOutSequentially({
    startMinutes: 9 * 60,
    orderedIds: ['long', 'short', 'last'],
    durations: { long: 60, short: 15, last: 30 },
    pauses: { long: 10, short: 5, last: 0 },
  }),
  [
    { id: 'long', start: 540 },
    { id: 'short', start: 610 },
    { id: 'last', start: 630 },
  ],
  'A 60-minute phase plus 10-minute pause must place the next phase at 10:10, even after reorder.',
);

// The complete plan, including order and pause, must cross the client/server
// boundary. A local-only field would reappear in its old form after refresh.
assert.match(
  applyDraftSource,
  /const planItems = draft\.appointments\.map[\s\S]*?appointmentGroupOrder:\s*item\.appointmentGroupOrder[\s\S]*?pauseAfterMinutes:/,
  'The organizer payload must include stable order and pause for every item.',
);
assert.match(
  applyDraftSource,
  /if \(result\.ok\) \{[\s\S]*?setAgendaAppointmentGroupItemPauses\([\s\S]*?draft\.pauseAfterMinutesByAppointmentId\[item\.id\]/,
  'A successful save must refresh the local group-pause projection before the editor can reopen.',
);
assert.match(
  contextReorganizationSource,
  /appointmentGroupOrder\?:\s*number[\s\S]*?pauseAfterMinutes\?:\s*number|pauseAfterMinutes\?:\s*number[\s\S]*?appointmentGroupOrder\?:\s*number/,
  'The shared AppContext contract must accept order and pause from app and web.',
);
assert.match(
  contextReorganizationSource,
  /apply_owner_linked_reorganization_v6/,
  'Organizer saves carrying order or pause must use the atomic v6 contract.',
);
assert.match(
  contextReorganizationSource,
  /appointmentGroupOrder[\s\S]*?pauseAfterMinutes[\s\S]*?apply_owner_linked_reorganization_v6|pauseAfterMinutes[\s\S]*?appointmentGroupOrder[\s\S]*?apply_owner_linked_reorganization_v6/,
  'The v6 selection must be driven by the extended organizer fields.',
);
assert.match(
  contextReorganizationSource,
  /const requiresV6Contract = items\.some[\s\S]*?hasOwnProperty\.call\(item, 'pauseAfterMinutes'\)[\s\S]*?hasOwnProperty\.call\(item, 'appointmentGroupOrder'\)[\s\S]*?if \(requiresV6Contract\) \{[\s\S]*?return strictResult;/,
  'A server without v6 must fail visibly instead of silently dropping order or pause through a legacy fallback.',
);
assert.match(
  contextReorganizationSource,
  /appointmentGroupOrder:\s*plan\.appointmentGroupOrder \?\?[\s\S]*?appointment\.appointmentGroupOrder/,
  'The optimistic local projection must immediately retain the saved component order.',
);
assert.match(
  contextReorganizationSource,
  /persistedPlanPayload\.pauseChanged === true[\s\S]*?persistedPlanPayload\.orderChanged === true[\s\S]*?before\.appointmentGroupOrder !==[\s\S]*?JSON\.stringify\(beforePhaseConfig[\s\S]*?const notificationEntries[\s\S]*?persistedPauseChanged \|\| persistedOrderChanged/,
  'Order, inter-component pause and internal phase edits must all produce one grouped customer update.',
);
assert.equal(
  (contextReorganizationSource.match(/queueOwnerLogicalStartNotification\(\{/g) ?? [])
    .length,
  1,
  'A single organizer save must enqueue one grouped client push, not one push per phase.',
);
assert.equal(
  (contextReorganizationSource.match(/queueWorkspacePushNotification\(\{/g) ?? [])
    .length,
  0,
  'The organizer must not retain the former generic per-plan push beside the canonical notifier.',
);

assert.ok(
  organizerMigration,
  'The atomic apply_owner_linked_reorganization_v6 migration is missing.',
);
assert.equal(
  organizerMigration.fileName,
  '20260828163000_reorganize_linked_pauses_and_order_atomically.sql',
  'Keep a single canonical migration for the v6 organizer contract.',
);
assert.match(
  organizerMigration.source,
  /apply_owner_linked_reorganization_v5\s*\(/i,
  'v6 must preserve the proven strict-membership and overlap validation of v5.',
);
assert.match(
  organizerMigration.source,
  /pauseAfterMinutes[\s\S]*?between 0 and 180[\s\S]*?mod\([\s\S]*?5\)/i,
  'v6 must reject malformed or off-step pause values instead of silently clamping them.',
);
assert.match(
  organizerMigration.source,
  /incomplete_reorganization_order[\s\S]*?count\(distinct[\s\S]*?v_order_min\s*<>\s*1[\s\S]*?v_order_max\s*<>\s*v_item_count/i,
  'v6 must require one complete 1..N order permutation.',
);
assert.match(
  organizerMigration.source,
  /appointment_group_order/i,
  'v6 must persist the reordered appointment positions.',
);
assert.match(
  organizerMigration.source,
  /booking_requests[\s\S]*?appointment_group_order|appointment_group_order[\s\S]*?booking_requests/i,
  'v6 must keep booking-request order aligned with appointment order.',
);
assert.match(
  organizerMigration.source,
  /itemPauses/i,
  'v6 must persist inter-component pauses in authoritative group metadata.',
);
assert.match(
  organizerMigration.source,
  /when plan\.item \? 'pauseAfterMinutes'[\s\S]*?pause_item\.value ->> 'position'[\s\S]*?appointment\.appointment_group_order[\s\S]*?planned\.next_order[\s\S]*?planned\.pause_after_minutes/i,
  'When order changes, an omitted pause must follow its component identity instead of its old numeric position.',
);
assert.match(
  organizerMigration.source,
  /terminalPauseMinutes[\s\S]*?customerCommitmentMinutes|customerCommitmentMinutes[\s\S]*?terminalPauseMinutes/i,
  'v6 must recompute the customer commitment and terminal-pause metadata.',
);
assert.match(
  organizerMigration.source,
  /appointment_groups[\s\S]*?total_price|total_price[\s\S]*?appointment_groups/i,
  'v6 must keep the grouped total aligned after component price edits.',
);
assert.match(
  organizerMigration.source,
  /operatorAssignments[\s\S]*?splitOperators|splitOperators[\s\S]*?operatorAssignments/i,
  'v6 must refresh existing group operator-assignment metadata after reassignment.',
);
assert.match(
  organizerMigration.source,
  /refresh_workspace_agenda_state/i,
  'v6 must refresh the authoritative owner snapshot before the transaction commits.',
);
assert.match(
  organizerMigration.source,
  /'pauseChanged',\s*v_pause_changed[\s\S]*?'orderChanged',\s*v_order_changed/i,
  'v6 must report pause-only and order-only changes so the shared client can notify the customer.',
);

// Availability is a reasoned assessment. The UI must never call the operator
// "occupied" when the actual blocker is the client, salon schedule or machine.
assert.match(
  agendaSource,
  /const assessWeekReorganizationOperatorPlacement[\s\S]*?operatorDateAvailable[\s\S]*?operatorFree[\s\S]*?customerFree[\s\S]*?scheduleAllowed[\s\S]*?machineryAvailable/,
  'Organizer availability must retain separate operator, customer, schedule and machinery outcomes.',
);
assert.match(
  organizerModalSource,
  /Operatore libero[\s\S]*?Operatore occupato · forzabile/,
  'The operator chip must distinguish free from truly operator-occupied.',
);
assert.match(
  organizerModalSource,
  /Cliente già impegnato in un altro appuntamento · forzabile/,
  'A customer conflict needs its own explicit warning.',
);
assert.match(
  organizerModalSource,
  /Fuori dall’orario disponibile del salone · forzabile/,
  'A schedule conflict needs its own explicit warning.',
);
assert.match(
  organizerModalSource,
  /Macchinario occupato o non disponibile · forzabile/,
  'A machinery conflict needs its own explicit warning.',
);
assert.match(
  organizerModalSource,
  /getEligibleOperatorsForService\([\s\S]*?operators: operatori,[\s\S]*?\}\)[\s\S]*?isOperatorAvailableOnDate\([\s\S]*?Operatore assente quel giorno · forzabile/,
  'Service capability and operator day availability must remain distinct reasons.',
);

assert.match(
  organizerModalSource,
  /editorAppointmentGroupIds/,
  'Availability checks must identify every appointment group currently edited.',
);
assert.match(
  organizerModalSource,
  /editorBookingRequestIds/,
  'Availability checks must identify the current booking-request projections.',
);
assert.match(
  organizerModalSource,
  /if \(editorAppointmentIds\.has\(appointment\.id\)\) return false;[\s\S]*?editorAppointmentGroupIds\.has\(groupId\)[\s\S]*?return false;/,
  'The edited appointments and all projections of their groups must be excluded from self-conflict checks.',
);
assert.match(
  organizerModalSource,
  /requestId && editorBookingRequestIds\.has\(requestId\)/,
  'A booking-request projection of an edited phase must not conflict with itself.',
);

// The editor summary is display-only and must follow the same operator busy
// intervals as the Agenda while durations and pauses change the draft.
assert.match(
  capacitySummarySource,
  /weekReorganizationDraft\.appointments[\s\S]*?getAppointmentOperatorBusyIntervals\(appointment\)/,
  'The live capacity summary must recompute from the current draft and operator busy intervals.',
);
assert.match(
  capacitySummarySource,
  /plannedAppointmentIds[\s\S]*?plannedGroupIds[\s\S]*?plannedRequestIds[\s\S]*?externalAppointments/,
  'The live summary must exclude every projection of the group being edited.',
);
assert.match(
  capacitySummarySource,
  /doOperatorsMatch\([\s\S]*?hasExternalOverlap[\s\S]*?Il piano si sovrappone[\s\S]*?Forza comunque/,
  'A real same-operator overlap must explain that the save flow can still force the plan.',
);
assert.match(
  capacitySummarySource,
  /Vincolo successivo alle \$\{fixedTime\}[\s\S]*?appuntamento fisso[\s\S]*?Regola durate o pose/,
  'The next fixed same-operator appointment must expose its time as the capacity limit.',
);
assert.match(
  capacitySummarySource,
  /Spazio successivo libero[\s\S]*?Nessun appuntamento esterno limita il piano attuale/,
  'A plan without an external same-operator limit must report free following capacity.',
);
assert.match(
  organizerModalSource,
  /weekReorganizationCapacitySummary[\s\S]*?weekPhaseOrganizerCapacitySummary/,
  'The shared app/web organizer modal must render the compact live summary.',
);

// There is deliberately one organizer body. Native and web may style the
// shell differently, but duration, pose and availability logic stay shared.
assert.equal(
  (agendaSource.match(
    /visible=\{weekReorganizationEditorOpen && !!weekReorganizationDraft\}/g,
  ) ?? []).length,
  1,
  'App and web must render one shared phase-organizer implementation.',
);
assert.ok(
  organizerModalSource.includes('finishWeekReorganizationEditorReorder') &&
    organizerModalSource.includes('adjustWeekReorganizationEditorPause') &&
    organizerModalSource.includes(
      'assessWeekReorganizationOperatorPlacement',
    ),
  'The shared organizer must contain reorder, pause and reasoned operator placement together.',
);

console.log('Owner phase organizer contracts: OK');
