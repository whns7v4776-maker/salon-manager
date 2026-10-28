const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const agenda = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);
const context = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260820225500_cancel_single_composition_phase.sql',
  ),
  'utf8',
);
const organizerEditMigration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260821120000_edit_linked_appointment_duration_and_price.sql',
  ),
  'utf8',
);

const requireContract = (condition, message) => {
  if (!condition) throw new Error(message);
};

const nextPose = ({ phase, sourceStart, initial, pose, target }) => {
  const finalStart = sourceStart + initial + pose;
  return phase === 'final'
    ? target - sourceStart - initial
    : finalStart - target - initial;
};

requireContract(
  nextPose({
    phase: 'final',
    sourceStart: 540,
    initial: 30,
    pose: 30,
    target: 615,
  }) === 45,
  'Moving the reprise later must lengthen only the pose.',
);
requireContract(
  nextPose({
    phase: 'final',
    sourceStart: 540,
    initial: 30,
    pose: 30,
    target: 585,
  }) === 15,
  'Moving the reprise earlier must shorten only the pose.',
);
requireContract(
  nextPose({
    phase: 'initial',
    sourceStart: 540,
    initial: 30,
    pose: 30,
    target: 525,
  }) === 45,
  'Moving the initial phase earlier must lengthen only the pose.',
);
requireContract(
  nextPose({
    phase: 'initial',
    sourceStart: 540,
    initial: 30,
    pose: 30,
    target: 555,
  }) === 15,
  'Moving the initial phase later must shorten only the pose.',
);
requireContract(
  nextPose({
    phase: 'final',
    sourceStart: 540,
    initial: 30,
    pose: 30,
    target: 565,
  }) < 0,
  'Crossing the other phase must produce an invalid negative pose.',
);

requireContract(
  /const isIndependentPhasedCardMove = !!\(phaseConfig && renderedPhase\);/.test(
    agenda,
  ) &&
    /targetAppointmentCandidates = \(\s*isIndependentPhasedCardMove\s*\? \[\]/.test(
      agenda,
    ),
  'A phased-card move must bypass generic appointment swapping on app and web.',
);
requireContract(
  /const poseResolution = resolveWeekDraftPoseReductions\(draft, todayDate\);[\s\S]*?Confermi di voler accorciare la fase di posa[\s\S]*?Accorcia posa/.test(
    agenda,
  ) &&
    /confirmedPoseReductions\[reduction\.appointmentId\][\s\S]*?applyWeekReorganizationDraft\([\s\S]*?true/.test(
      agenda,
    ),
  'Stabilizing a draft must explicitly confirm and persist every pose reduction.',
);
requireContract(
  /engineVersion: 2[\s\S]*?Una bozza creata dal vecchio motore/.test(agenda),
  'Old dirty gesture drafts must be discarded without server writes.',
);
requireContract(
  /const canUseRelativeSnap = !!\(\s*usesMeasuredCardTop &&\s*startCardRect &&\s*sourceRowIndex >= 0\s*\);[\s\S]*?const rawRow = canUseRelativeSnap/.test(
    agenda,
  ) &&
    /if \(\s*Number\.isFinite\(measuredCardWidth\)[\s\S]*?weekDragStartCardRectRef\.current = \{/.test(
      agenda,
    ),
  'Web and native linked cards must snap from their measured starting row, including cards below a pose.',
);
requireContract(
  /weekDragOriginalPlacementRef\.current\?\.time/.test(agenda) &&
    /sourceVisualTime\?\.trim\(\)/.test(agenda) &&
    /beginWeekAppointmentDrag\([\s\S]*?grabOffsetX,[\s\S]*?slotTime/.test(
      agenda,
    ),
  'A reprise must snap from the exact grid row that rendered its card.',
);
requireContract(
  /isWholeMoveFromFinalPhase = !!\([\s\S]*?!isIndependentPhasedCardMove/.test(
    agenda,
  ),
  'An independently dragged reprise must keep its visual target row instead of being converted back to phase-one time.',
);
requireContract(
  /openWeekReorganizationEditor\(weekAppointmentDetails\)/.test(agenda) &&
    /visible=\{weekReorganizationEditorOpen && !!weekReorganizationDraft\}/.test(
      agenda,
    ) &&
    /Trascina per sostituire l’ordine e regola i tempi/.test(agenda) &&
    /Salva modifiche/.test(agenda),
  'The details action must open the dedicated phase editor, while direct Agenda drag retains the floating stabilization flow.',
);
requireContract(
  /adjustWeekReorganizationEditorDuration[\s\S]*?adjustWeekReorganizationEditorPrice[\s\S]*?selectWeekReorganizationEditorOperator/.test(
    agenda,
  ) &&
    /assessWeekReorganizationOperatorPlacement/.test(agenda) &&
    /operatorFree/.test(agenda) &&
    /customerFree/.test(agenda) &&
    /Disponibilità operatori[\s\S]*?Operatore libero[\s\S]*?Operatore occupato · forzabile/.test(
      agenda,
    ),
  'Every organizer card must expose duration, price, and operator-fit editing.',
);
requireContract(
  /apply_owner_linked_reorganization_v4/.test(context) &&
    /durationMinutes: item\.durataMinuti[\s\S]*?priceValue: item\.prezzo/.test(
      agenda,
    ) &&
    /set duration_minutes = coalesce\(v_duration[\s\S]*?price = coalesce\(v_price[\s\S]*?requested_duration_minutes[\s\S]*?requested_price/.test(
      organizerEditMigration,
    ),
  'Duration and price edits must persist atomically to appointments and linked booking requests.',
);
requireContract(
  /const preserveLocalDraftTiming\s*=\s*currentDraft\.dirty \|\| currentDraft\.saving;[\s\S]*?if \(preserveLocalDraftTiming\) return item;/.test(
    agenda,
  ),
  'Realtime reconciliation must never overwrite pose timing inside a dirty draft.',
);
requireContract(
  /const stageWeekReorganizationResize = useCallback\([\s\S]*?weekReorganizationDraftRef\.current = nextDraft;[\s\S]*?setWeekReorganizationDraft\(nextDraft\)/.test(
    agenda,
  ) &&
    /stageWeekReorganizationResize\(\{[\s\S]*?nextPhaseConfig[\s\S]*?\}\)[\s\S]*?const saveResize/.test(
      agenda,
    ),
  'Resizing a linked phase in an active draft must remain local until stabilization.',
);
requireContract(
  /const currentDraft = weekReorganizationDraftRef\.current \?\? activeDraft;[\s\S]*?weekReorganizationDraftRef\.current = nextDraft;[\s\S]*?setWeekReorganizationDraft\(nextDraft\);[\s\S]*?setWeekSwapPreview\(null\)/.test(
    agenda,
  ),
  'The final dropped position must reach the authoritative draft ref before stabilization can save.',
);
requireContract(
  /nextLinked\.forEach\(markRecentlyMovedAppointmentSnapshot\);[\s\S]*?updateOwnerFinancialAppointmentsForWorkspace\([\s\S]*?nextLinkedById\.get\(item\.id\) \?\? item/.test(
    context,
  ),
  'Every saved linked card must resist stale realtime and financial snapshots after the atomic commit.',
);
const resizeAutoScrollStart = agenda.indexOf(
  'const resizeSource = weekResizeSourceRef.current;',
);
const resizeAutoScrollSource = agenda.slice(
  resizeAutoScrollStart,
  agenda.indexOf(
    'const sourceAppointment = weekDragSourceRef.current;',
    resizeAutoScrollStart,
  ),
);
requireContract(
  /if \(resizeSource && resizePointerY !== null\)[\s\S]*?if \(\s*!IS_WEB &&\s*nativeWeekResizeOverlayInteractionActive\.value <= 0\s*\) \{\s*return;\s*\}[\s\S]*?const nativePhysicalResizeDelta = IS_WEB[\s\S]*?: weekResizeTranslationYRef\.current;[\s\S]*?resizePointerY >= visibleBottom - bottomEdgeThreshold[\s\S]*?\(IS_WEB \|\| nativePhysicalResizeDelta > 2\)[\s\S]*?const resizeScrollStep = IS_WEB\s*\? 12 \+ proximity \* 20\s*:\s*2 \+ proximity \* 5;[\s\S]*?previousY \+ resizeScrollStep[\s\S]*?scrollAgendaNativelyDuringResize\(nextY\)/.test(
    resizeAutoScrollSource,
  ) &&
    !/visibleTop|resizePointerY\s*<=|previousY\s*-\s*resizeScrollStep|nextY\s*=\s*Math\.max/.test(
      resizeAutoScrollSource,
    ) &&
    /const getWeekResizeVisibleVerticalBounds = useCallback\([\s\S]*?if \(IS_WEB\) \{[\s\S]*?bottomEdgeThreshold: 54[\s\S]*?const customBarTop = agendaViewportHeight - customBarBottomOffset - 64;[\s\S]*?customBarTop - 12[\s\S]*?bottomEdgeThreshold: 36/.test(
      agenda,
    ) &&
    /nativeResizeOverlayStartAgendaScrollY\.value =\s*nativeResizeTouchStartAgendaScrollY\.value;[\s\S]*?const boundedPhysicalResizeTranslationY = resizeShrinkOnly[\s\S]*?: physicalResizeTranslationY;[\s\S]*?nativeResizeOverlayHeight\.value = Math\.max\([\s\S]*?cardHeight\.value \+ boundedPhysicalResizeTranslationY/.test(
      agenda,
    ) &&
    /const activeResizeScrollDelta = isActivelyResized\s*\? Math\.max\(\s*0,\s*agendaVerticalScrollOffsetY\.value - resizeStartAgendaScrollY\.value,\s*\)\s*: 0;[\s\S]*?resizeHeight\.value \+ activeResizeScrollDelta/.test(
      agenda,
    ) &&
    !/nativeWeekResizeOverlayHeight\.value\s*\+=/.test(agenda) &&
    /downwardActivationY = IS_WEB[\s\S]*?visibleBottom - 18[\s\S]*?upwardActivationY = IS_WEB[\s\S]*?visibleTop \+ 18/.test(
      agenda,
    ),
  'Web and native lower-handle resize must use deterministic downward-only compensation, reject post-release ticks, and leave whole-card drag on both edges.',
);
requireContract(
  /weekAppointmentResizeActiveKey[\s\S]*?getWeekInteractionAppointmentKey\(appointment\)[\s\S]*?weekPlannerCellWrapActiveInteraction/.test(
    agenda,
  ),
  'The phase being resized must elevate its whole grid row above adjacent slots.',
);
requireContract(
  /Cosa vuoi eliminare\?[\s\S]*?Solo questa fase[\s\S]*?Tutta la composizione/.test(
    agenda,
  ),
  'Deleting a linked row must always offer phase-only or whole-composition scope.',
);
requireContract(
  /linkedCancellationScope === 'phase'[\s\S]*?cancel_owner_composition_phase_v1/.test(
    context,
  ),
  'Phase-only cancellation must use its dedicated atomic server operation.',
);
requireContract(
  /serverReturnedCancelledRequestId =[\s\S]*?cancelResponsePayload\?\.bookingRequestId[\s\S]*?serverConfirmedCanonicalCancellationRequest = isUuid\([\s\S]*?serverReturnedCancelledRequestId[\s\S]*?shouldQueueClientCancellationPushFromApp =\s*!serverHandledWholeGroup\s*&&\s*!serverConfirmedCanonicalCancellationRequest/.test(
    context,
  ),
  'A server-confirmed single or grouped cancellation must not enqueue a duplicate app push.',
);
requireContract(
  /delete from public\.appointments[\s\S]*?appointment\.id = v_target\.id[\s\S]*?appointment_updated[\s\S]*?removedServiceName/.test(
    migration,
  ),
  'The phase RPC must delete only one row and queue one composition update.',
);

console.log('Linked pose movement and cancellation contracts: OK');
