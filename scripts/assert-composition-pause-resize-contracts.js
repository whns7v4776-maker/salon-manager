/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agendaSource = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);

const sourceBetween = (source, start, end, label) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${label}: start marker is missing.`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${label}: end marker is missing.`);
  return source.slice(startIndex, endIndex);
};

const pauseImpactSource = sourceBetween(
  agendaSource,
  'const resolveWeekCompositionPauseResizeImpact = ({',
  'type WeekAppointmentEditMoveOption',
  'Composition-pause resize impact',
);
const standaloneResizeSource = sourceBetween(
  agendaSource,
  'const saveWeekAppointmentResizeDuration = useCallback(',
  'const saveWeekPhasedResizeTimes = useCallback(',
  'Standalone resize save',
);
const compositionResizeSource = sourceBetween(
  agendaSource,
  'const saveWeekCompositionPauseResize = useCallback(',
  'const endWeekAppointmentResize = useCallback(',
  'Composition-pause resize save',
);
const resizeReleaseSource = sourceBetween(
  agendaSource,
  'const endWeekAppointmentResize = useCallback(',
  'const releaseActiveWeekPointerInteraction = () => {',
  'Resize release decision',
);
const previewSettlementSource = sourceBetween(
  agendaSource,
  'const appointmentsWithResizeVisualPreview = useMemo(() => {',
  'if (!weekReorganizationDraftRef.current) return;',
  'Resize visual-preview settlement',
);
const draftCompositionCreateSource = sourceBetween(
  agendaSource,
  'const applyWeekReorganizationDraft = useCallback(',
  'const stageWeekReorganizationResize = useCallback(',
  'Draft composition creation',
);
const directCompositionCreateSource = sourceBetween(
  agendaSource,
  'const confirmQuickBookingPackage = useCallback(',
  'const stageQuickBookingPackageDraft = useCallback(',
  'Direct composition creation',
);
const detailsWholeServiceSource = sourceBetween(
  agendaSource,
  'const weekAppointmentDetailsWholeServiceSummary = useMemo(() => {',
  'const weekAppointmentCanSendLateReminder = useMemo(() => {',
  'Whole-service appointment details',
);

// A real composition pause is authoritative metadata. A visual gap alone must
// never turn an ordinary linked appointment into a pose-aware resize.
assert.match(
  resizeReleaseSource,
  /const persistedCompositionPause\s*=\s*[\s\S]*?resolveWeekLinkedPauseAfterMinutes\([\s\S]*?previousPauseMinutes:\s*persistedCompositionPause/,
  'Resize must pass the persisted group pause into the composition-pause calculation.',
);
assert.match(
  pauseImpactSource,
  /safePreviousPauseMinutes\s*<=\s*0[\s\S]*?return null/,
  'A zero persisted pause must not be inferred from the visual gap.',
);
assert.match(
  pauseImpactSource,
  /availablePauseMinutes[\s\S]*?Math\.min\([\s\S]*?safePreviousPauseMinutes/,
  'Only after a persisted pause exists may the remaining visual space cap it.',
);

// The salon must choose explicitly whether the extension consumes the pose or
// preserves it by shifting only the following composition items.
assert.match(
  resizeReleaseSource,
  /Accorciare la posa\?|Eliminare la posa\?/,
  'The resize prompt must identify a reduced or removed pose.',
);
assert.match(
  resizeReleaseSource,
  /text:\s*removesPause\s*\?\s*'Elimina posa'\s*:\s*'Accorcia posa'/,
  'The consuming choice must distinguish pose reduction from removal.',
);
assert.match(
  resizeReleaseSource,
  /text:\s*'Mantieni e slitta'[\s\S]*?nextPauseMinutes:\s*compositionPauseImpact\.previousPauseMinutes/,
  'The preserving choice must keep the original pause and shift following items.',
);

// Duration, downstream starts and every group pause must cross one atomic
// organizer mutation. A duration-only update would recreate stale state after
// realtime/refetch.
assert.match(
  compositionResizeSource,
  /await reorganizeOwnerLinkedAppointmentsForSalon\([\s\S]*?items:\s*nextAppointments\.map\([\s\S]*?durationMinutes:\s*item\.durataMinuti[\s\S]*?pauseAfterMinutes:\s*normalizeWeekReorganizationPauseMinutes/,
  'Composition resize must persist duration and pause in the same organizer plan.',
);
assert.match(
  compositionResizeSource,
  /if \(result\.ok\) \{[\s\S]*?setAgendaAppointmentGroupItemPauses\([\s\S]*?\[groupId\]:\s*canonicalPauses/,
  'Successful organizer save must immediately project canonical group pauses locally.',
);

// Forced overlap is still server-first: keep the confirmation mounted and
// busy until the atomic retry finishes.
assert.match(
  compositionResizeSource,
  /text:\s*'Forza comunque'[\s\S]*?awaitCompletion:\s*true[\s\S]*?busyText:\s*'Salvataggio…'[\s\S]*?onPress:\s*\(\)\s*=>\s*saveWeekCompositionPauseResize/,
  'Composition force-save must be awaitable and show a busy state.',
);

// A standalone resize may need a second server attempt after the overlap
// confirmation. Its visual preview must not bounce to the old duration between
// attempts or while the authoritative snapshot is still settling.
assert.match(
  standaloneResizeSource,
  /weekAppointmentResizePendingIdsRef\.current\.add\(appointment\.id\)[\s\S]*?stageWeekAppointmentResizeVisualPreview\(appointment, nextDurationMinutes\)[\s\S]*?await shortenOwnerAppointmentDurationForSalon/,
  'Standalone resize must mark the preview pending before awaiting the server.',
);
assert.match(
  standaloneResizeSource,
  /text:\s*'Forza comunque'[\s\S]*?awaitCompletion:\s*true[\s\S]*?busyText:\s*'Salvataggio…'[\s\S]*?saveWeekAppointmentResizeDuration\([\s\S]*?true,[\s\S]*?true/,
  'Standalone force retry must remain awaitable while the server settles.',
);
assert.match(
  previewSettlementSource,
  /weekAppointmentResizePendingIdsRef\.current\.has\(preview\.appointmentId\)[\s\S]*?continue/,
  'Preview settlement must ignore appointments whose resize request is still pending.',
);

// A newly created group must expose its persisted pause immediately. Waiting
// for the asynchronous group-metadata fetch creates a short window in which an
// immediate resize would incorrectly look like an ordinary visual gap.
assert.match(
  draftCompositionCreateSource,
  /if \(result\.ok\) \{[\s\S]*?result\.groupId[\s\S]*?setAgendaAppointmentGroupItemPauses\([\s\S]*?draft\.pauseAfterMinutesByAppointmentId\[item\.id\]/,
  'A stabilized draft must immediately project its group pauses after creation.',
);
assert.match(
  directCompositionCreateSource,
  /if \(result\.groupId\) \{[\s\S]*?setAgendaAppointmentGroupItemPauses\([\s\S]*?plannedItem\.pauseAfterMinutes/,
  'A directly created composition must immediately project its group pauses.',
);

// The details popup keeps the selected phase explicit while explaining the
// linked service as a whole, including every persisted inter-component pose.
assert.match(
  detailsWholeServiceSource,
  /phaseLabel:\s*`Fase \$\{phaseOrder\}\/\$\{phaseCount\}`/,
  'Appointment details must retain the selected phase number.',
);
assert.match(
  detailsWholeServiceSource,
  /resolveWeekLinkedPauseAfterMinutes\(item, linkedAppointments\)[\s\S]*?Posa \$\{pauseMinutes\} min dopo \$\{item\.servizio\}/,
  'Whole-service details must describe persisted pose after the correct component.',
);
assert.match(
  agendaSource,
  /weekAppointmentDetailsWholeServiceSummary[\s\S]*?>\s*Servizio intero\s*</,
  'The appointment popup must render the explicit Servizio intero section.',
);

const planPauseAwareExtension = ({
  sourceStartMinutes,
  currentDurationMinutes,
  nextDurationMinutes,
  persistedPauseMinutes,
  followingStartMinutes,
  preservePause,
}) => {
  assert.ok(persistedPauseMinutes > 0, 'The test plan requires real pose metadata.');
  assert.ok(nextDurationMinutes > currentDurationMinutes, 'The test plan extends the phase.');

  const remainingPause = Math.max(
    0,
    Math.min(
      persistedPauseMinutes,
      followingStartMinutes - (sourceStartMinutes + nextDurationMinutes),
    ),
  );
  const nextPauseMinutes = preservePause
    ? persistedPauseMinutes
    : remainingPause;
  const nextFollowingStartMinutes = preservePause
    ? sourceStartMinutes + nextDurationMinutes + nextPauseMinutes
    : followingStartMinutes;

  return { nextPauseMinutes, nextFollowingStartMinutes };
};

const phaseTwoStartMinutes = 10 * 60 + 45;
const phaseThreeStartMinutes = 11 * 60 + 20;

assert.deepEqual(
  planPauseAwareExtension({
    sourceStartMinutes: phaseTwoStartMinutes,
    currentDurationMinutes: 15,
    nextDurationMinutes: 20,
    persistedPauseMinutes: 20,
    followingStartMinutes: phaseThreeStartMinutes,
    preservePause: false,
  }),
  {
    nextPauseMinutes: 15,
    nextFollowingStartMinutes: phaseThreeStartMinutes,
  },
  'Extending phase 2 from 15 to 20 minutes must consume 5 minutes of its 20-minute pose and leave phase 3 fixed.',
);

assert.deepEqual(
  planPauseAwareExtension({
    sourceStartMinutes: phaseTwoStartMinutes,
    currentDurationMinutes: 15,
    nextDurationMinutes: 20,
    persistedPauseMinutes: 20,
    followingStartMinutes: phaseThreeStartMinutes,
    preservePause: true,
  }),
  {
    nextPauseMinutes: 20,
    nextFollowingStartMinutes: phaseThreeStartMinutes + 5,
  },
  'Keeping the 20-minute pose must shift phase 3 forward by exactly the 5-minute extension.',
);

console.log('Composition pause resize contracts: OK');
