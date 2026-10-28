/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const agendaSource = fs.readFileSync(
  path.join(root, "app", "(tabs)", "agenda.tsx"),
  "utf8",
);

const sliceBetween = (startToken, endToken, label) => {
  const start = agendaSource.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = agendaSource.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return agendaSource.slice(start, end);
};

const agendaTree=ts.createSourceFile('agenda.tsx',agendaSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let laneBuilder='';
function findLaneBuilder(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(agendaTree)==='buildWeekOperatorLaneLayoutForDates')laneBuilder=node.getText(agendaTree);
  ts.forEachChild(node,findLaneBuilder);
}
findLaneBuilder(agendaTree);
assert.ok(laneBuilder,'Missing real lane builder callback');

const activeLaneSource = sliceBetween(
  "const activeAgendaLaneServices = useMemo(",
  "const agendaServices = useMemo(",
  "active Agenda lane service source",
);
const compositionLoader = sliceBetween(
  "const agendaServiceCompositionsWorkspaceIdRef = useRef",
  "const quickBookingCompositionServiceIdsByLauncherId = useMemo(",
  "Agenda composition loader",
);

assert.match(
  activeLaneSource,
  /disponibileOnline\s*!==\s*false/,
  "Archived services must not keep an Agenda profession lane active.",
);
assert.match(
  activeLaneSource,
  /soloComposizione\s*!==\s*true/,
  "Composition-only technical services must not keep an Agenda profession lane active.",
);
assert.match(
  activeLaneSource,
  /agendaCompositionLaunchers/,
  "Active salon-only/public composition launchers must still keep their profession lane active.",
);
assert.match(
  compositionLoader,
  /if \(workspaceChanged\) \{[\s\S]*?setAgendaServiceCompositions\(\[\]\)/,
  "Changing account/workspace must clear composition lanes immediately.",
);
const compositionErrorStart = compositionLoader.indexOf(
  "if (compositionsResult.error || itemsResult.error)",
);
const compositionErrorEnd = compositionLoader.indexOf(
  "const itemsByComposition",
  compositionErrorStart,
);
assert.ok(
  compositionErrorStart >= 0 && compositionErrorEnd > compositionErrorStart,
  "The Agenda composition error branch must remain explicit and testable.",
);
const compositionErrorBranch = compositionLoader.slice(
  compositionErrorStart,
  compositionErrorEnd,
);
assert.doesNotMatch(
  compositionErrorBranch,
  /setAgendaServiceCompositions\(\[\]\)/,
  "A transient same-workspace load error must preserve the last confirmed composition snapshot.",
);
assert.match(
  laneBuilder,
  /activeServiceRoleKeySet\.has\(normalizedRole\)/,
  "Configured operators must be admitted only for professions with an active service.",
);

const historicalLaneGuard = sliceBetween(
  "const isAgendaLaneHistoricalOrInactive = useCallback(",
  "const agendaServices = useMemo(",
  "historical Agenda lane guard",
);

assert.match(
  historicalLaneGuard,
  /activeAgendaLaneRoleKeySet/,
  "A lane must become historical when its profession has no active services, even if its operator still exists.",
);

assert.match(
  agendaSource,
  /const useArchivedLaneVisual =\s*isHistoricalLaneDisabled \|\|\s*\(!IS_WEB && isLaneOperatorUnavailableOnDay\)/,
  "Web Agenda must reserve the full archived-lane treatment for genuinely inactive professions.",
);
assert.match(
  agendaSource,
  /const useUnavailableWebVisual =\s*IS_WEB &&\s*isLaneOperatorUnavailableOnDay &&\s*!isHistoricalLaneDisabled/,
  "A web operator outside their working day must use a separate visual state.",
);
const premiumHeadingSource=fs.readFileSync(path.join(root,'components','agenda-premium.tsx'),'utf8');
assert.match(premiumHeadingSource,/historical\?'Archiviato':unavailable\?'Non attivo oggi':role/,'Premium headers must distinguish historical professions from an operator off today.');
assert.match(agendaSource,/unavailable=\{isLaneOperatorUnavailableOnDay\} historical=\{isHistoricalLaneDisabled\}/,'Premium headers must receive the original independent availability states.');

assert.match(
  agendaSource,
  /useUnavailableWebVisual &&\s*styles\.weekPlannerCellUnavailableWeb/,
  "Off-day web lanes must not look identical to archived-profession lanes.",
);

const inactiveRoleCheckIndex = Math.max(
  historicalLaneGuard.indexOf("activeAgendaLaneRoleKeySet"),
  -1,
);
const salonCapacityEarlyReturnIndex = historicalLaneGuard.indexOf(
  "if (isSalonCapacityOperatorId(normalizedOperatorId))",
);
assert.ok(
  inactiveRoleCheckIndex >= 0 &&
    (salonCapacityEarlyReturnIndex < 0 ||
      inactiveRoleCheckIndex < salonCapacityEarlyReturnIndex),
  "The inactive-profession guard must run before the salon-capacity shortcut so SAL. lanes can also become read-only.",
);

const stableLaneReconciliation = sliceBetween(
  "const effectiveWeekOperatorLaneLayoutByDate = useMemo(",
  "const getWeekAppointmentOccupiedVisualKeys = useCallback(",
  "stable Agenda lane reconciliation",
);

assert.doesNotMatch(
  stableLaneReconciliation,
  /hasAppointments\s*&&\s*currentLayout\.lanes\.length\s*<\s*2\s*&&\s*\(previousStableLayout\?\.lanes\.length\s*\?\?\s*0\)\s*>=\s*2/,
  "One unrelated appointment must not preserve every stale profession lane from the previous layout.",
);
assert.match(
  laneBuilder,
  /const hasSingleActiveCanonicalOperatorLane = !!\([\s\S]*?!isSalonCapacityOperatorId\(singleLaneOperatorId\)[\s\S]*?singleLane\.key === `operator-id:\$\{singleLaneOperatorId\}`[\s\S]*?activeOperatorIdSet\.has\(singleLaneOperatorId\)[\s\S]*?activeServiceRoleKeySet\.has\(singleLaneRoleKey\)[\s\S]*?!isAgendaLaneHistoricalOrInactive\(singleLane\)[\s\S]*?\);/,
  "A lone lane may become live only for one available canonical operator backed by an active profession.",
);
assert.match(
  laneBuilder,
  /lanes\.length\s*>=\s*2\s*\|\|[\s\S]*?hasHistoricalOrInactiveLane\s*\|\|[\s\S]*?hasSingleActiveCanonicalOperatorLane[\s\S]*?\?\s*lanes\s*:\s*\[\]/,
  "A valid single active operator lane and the existing historical lane path must remain visible.",
);

const laneModeGuard = sliceBetween(
  "const shouldUseWeekOperatorLaneMode = useCallback(",
  "const weekDenseOperatorModeByDate = useMemo(",
  "single orphan lane mode guard",
);
assert.match(
  laneModeGuard,
  /isWeekPlannerHistoricalOperatorLaneDisabled\(singleLane\)[\s\S]*?operatorId[\s\S]*?!isSalonCapacityOperatorId\(operatorId\)[\s\S]*?singleLane\.key === `operator-id:\$\{operatorId\}`/,
  "Single-lane mode must preserve historical lanes and admit only a canonical non-SAL operator lane.",
);

// The actual renderer is declared before the memo dependency object. Inspect
// the full source because app and web share the same slot branch.
const quickBookGuards = [
  ...agendaSource.matchAll(
    /const laneSalonCanQuickBook\s*=\s*([\s\S]{0,220}?);/g,
  ),
];
assert.ok(
  quickBookGuards.length > 0,
  "The operator-lane quick-booking guard must exist.",
);
quickBookGuards.forEach((match) => {
  assert.match(
    match[1],
    /!isHistoricalLaneDisabled/,
    "Historical/orphan lanes must reject new bookings.",
  );
  assert.doesNotMatch(
    match[1],
    /\|\|\s*!IS_WEB/,
    "Native and web must enforce the same read-only orphan-lane rule.",
  );
});

let dragTargetResolver='';
function findDragResolver(node){if(ts.isVariableDeclaration(node)&&node.name.getText(agendaTree)==='resolveWeekDragTarget')dragTargetResolver=node.getText(agendaTree);ts.forEachChild(node,findDragResolver);}
findDragResolver(agendaTree);
assert.ok(dragTargetResolver,'Missing real drag target resolver');
assert.match(
  dragTargetResolver,
  /isWeekPlannerHistoricalOperatorLaneDisabled\(targetLane\)/,
  "An orphan lane must reject drag/drop targets as well as new slot taps.",
);

assert.match(
  agendaSource,
  /return \(\s*<HapticTouchable\s*style=\{\s*IS_WEB\s*\?\s*styles\.weekPlannerHistoricalAppointmentTouchSurfaceWeb\s*:\s*undefined\s*\}[\s\S]{0,900}?handlePromptHistoricalLaneCleanup/,
  "The read-only appointment wrapper must use the dedicated full-size surface only on web.",
);
assert.match(
  agendaSource,
  /weekPlannerHistoricalAppointmentTouchSurfaceWeb:\s*\{[\s\S]{0,420}?width:\s*'100%'[\s\S]{0,160}?height:\s*'100%'/,
  "Archived-role web appointments must keep the full booked duration instead of collapsing to their text content.",
);
assert.doesNotMatch(
  agendaSource,
  /style=\{\s*styles\.weekPlannerHistoricalAppointmentTouchSurfaceWeb\s*\}/,
  "Native orphan appointments must not inherit the web full-size wrapper that disrupts their adaptive card layout.",
);
assert.match(
  agendaSource,
  /useArchivedLaneVisual\s*&&\s*!laneStartAppointment\s*&&\s*styles\.weekPlannerOperatorLaneCellDisabled/,
  "The disabled-lane treatment must stay on empty cells and must not fade or alter an existing orphan appointment card.",
);

assert.match(
  laneBuilder,
  /if \(firstRolePriority !== secondRolePriority\) \{\s*return firstRolePriority - secondRolePriority;\s*\}[\s\S]*?if \(firstRoleKey !== secondRoleKey\) \{\s*return firstRoleKey\.localeCompare\(secondRoleKey\);\s*\}/,
  "Lane sorting must group professions before comparing lane type or operator name.",
);

console.log("Agenda archived-role lane contracts passed.");
