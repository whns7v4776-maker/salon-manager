/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agendaSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const globalCssSource = fs.readFileSync(
  path.join(root, 'app', 'global.css'),
  'utf8',
);
const appContextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const ongoingPhaseMigrationSource = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20261014101500_resize_ongoing_owner_bottom_edge.sql',
  ),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  assert.match(source, pattern, message);
};

// Before onLayout Safari must already know the real card height. Otherwise a
// zero-height threshold classifies any body/hand grab as a resize.
requirePattern(
  agendaSource,
  /const cardHeight = useSharedValue\(\s*IS_WEB \? \(resolvedContentHeight \?\? 0\) : 0,?\s*\);/,
  'Web appointment height must be initialized from its rendered content height.',
);
requirePattern(
  agendaSource,
  /const isResizeHandleTouch = \([\s\S]*?resolvedContentHeight \?\? cardHeight\.value[\s\S]*?localTouchY >=[\s\S]*?renderedHeight - resizeBottomBandHeight[\s\S]*?localTouchY <= renderedHeight \+ resizeTouchEdgeTolerance/,
  'Web resize ownership must use one shared bounded footer hit-test and the current rendered height.',
);
requirePattern(
  agendaSource,
  /const nativeResizeSingleRowTarget = !!\(\s*!IS_WEB &&[\s\S]*?resolvedContentHeight <= nativeResizeSnapStep \+ 1\s*\);[\s\S]*?const nativeCompactDurationTarget = !!\(\s*!IS_WEB &&[\s\S]*?Number\(renderedDurationMinutes\) <= NATIVE_COMPACT_SHARED_TAP_MAX_MINUTES[\s\S]*?const nativeResizeSharedSurfaceTarget =\s*nativeResizeSingleRowTarget \|\| nativeCompactDurationTarget;/,
  'The compact shared-tap exception must be impossible on web because both contributing flags are gated by !IS_WEB.',
);
requirePattern(
  agendaSource,
  /const tap = Gesture\.Tap\(\);[\s\S]*?if \(resizeEnabled && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?tap\.hitSlop\(\{ bottom: -resizeBottomBandHeight \}\);[\s\S]*?\.maxDuration\(nativeResizeSharedSurfaceTarget \? 350 : 220\)[\s\S]*?\.onTouchesDown\([\s\S]*?if \(isResizeHandleTouch\(touch\) && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?stateManager\.fail\(\);[\s\S]*?\.onEnd\([\s\S]*?if \(success\) runOnJS\(dispatchPress\)\(\);/,
  'A stationary click in the web footer must remain consumed before the appointment popup tap.',
);
requirePattern(
  agendaSource,
  /if \(IS_WEB\) \{\s*pan\.minDistance\(3\);\s*\} else if \(resizeEnabled\)[\s\S]*?if \(!IS_WEB\) \{[\s\S]*?pan\.activateAfterLongPress\(nativeCardDragIntentHoldMs\);/,
  'Web whole-card drag must retain its three-pixel path and never enter the compact native 360ms long-press branch.',
);

// In operator mode the whole transparent row must never be raised. Only the
// actual lane may overlap later rows, preserving same-lane card ownership while
// leaving unrelated lanes available for hit-testing.
assert.doesNotMatch(
  agendaSource,
  /laneRowHasAppointmentStart/,
  'A cross-lane row-wide appointment layer would steal the visible handle.',
);
requirePattern(
  agendaSource,
  /IS_WEB &&[\s\S]{0,80}!useOperatorLaneMode &&[\s\S]{0,80}!!appointmentStart\)\) &&[\s\S]{0,80}styles\.weekPlannerCellWrapAppointmentWeb/,
  'The row-wide web layer must be limited to the non-lane layout.',
);
requirePattern(
  agendaSource,
  /key=\{`week-cell-\$\{day\.value\}-\$\{slotTime\}`\}[\s\S]{0,180}IS_WEB && useOperatorLaneMode[\s\S]{0,80}'box-none'/,
  'Web operator rows must not intercept a card rendered from an earlier row.',
);
requirePattern(
  agendaSource,
  /const nativeLaneRowHasAppointmentStart =\s*!IS_WEB &&\s*useOperatorLaneMode &&/,
  'Native lane detection must remain explicitly outside the web branch.',
);
requirePattern(
  agendaSource,
  /\(\(!IS_WEB &&\s*\(!!appointmentStart \|\|\s*nativeLaneRowHasAppointmentStart\)\) \|\|/,
  'Native must keep the pre-existing row-wide layering contract.',
);
requirePattern(
  agendaSource,
  /useOperatorLaneMode \? \([\s\S]{0,120}<View[\s\S]{0,100}pointerEvents=\{IS_WEB \? 'box-none' : 'auto'\}/,
  'The web operator-lane container must remain a structural-only hit layer.',
);
requirePattern(
  agendaSource,
  /key=\{`week-lane-\$\{day\.value\}-\$\{slotTime\}-\$\{lane\.key\}`\}[\s\S]{0,180}IS_WEB && laneContinuation[\s\S]{0,80}'none'/,
  'A continuation cell must pass the pointer through to its visible appointment body and handle.',
);

// Keep the established real-handle and native gesture contracts intact.
requirePattern(
  agendaSource,
  /pointerEvents="auto"[\s\S]{0,220}salonCursor:\s*'resize-y'/,
  'Every real web handle must remain interactive and advertise the resize cursor.',
);
requirePattern(
  agendaSource,
  /salonResizeHandle:\s*'true'[\s\S]{0,1300}cursor:\s*'ns-resize'/,
  'The visible web resize handle must retain its native resize cursor style.',
);
requirePattern(
  globalCssSource,
  /\[data-salon-cursor='grab'\] \[data-salon-cursor='resize-y'\][\s\S]{0,280}cursor:\s*ns-resize !important/,
  'The resize cursor must continue to override the parent grab cursor.',
);
requirePattern(
  globalCssSource,
  /\[data-salon-cursor='pointer'\] \[data-salon-cursor='resize-y'\][\s\S]{0,220}cursor:\s*ns-resize !important/,
  'The live resize cursor must override the read-only pointer of its parent card.',
);
requirePattern(
  agendaSource,
  /return IS_WEB\s*\? Gesture\.Race\(pan, tap\)\s*:\s*Gesture\.Exclusive\(nativeResizePan, pan, tap\);/,
  'The native resize recognizer composition must remain unchanged.',
);
requirePattern(
  agendaSource,
  /const handleWebResizeVisualPointerDown = useCallback\([\s\S]{0,300}resizeHandleArmed\.value = 1;[\s\S]{0,220}const handleWebResizeVisualPointerRelease = useCallback\([\s\S]{0,220}resizeHandleArmed\.value = 0;/,
  'A normal web handle must illuminate on pointer-down before movement and clear on release.',
);
requirePattern(
  agendaSource,
  /onPointerDown=\{[\s\S]{0,180}handleWebResizeVisualPointerDown[\s\S]{0,420}onPointerUp=\{[\s\S]{0,180}handleWebResizeVisualPointerRelease/,
  'The immediate visual handlers must be attached to the real web resize handle.',
);
requirePattern(
  agendaSource,
  /const selected = resizeMode\.value > 0 \|\| resizeHandleArmed\.value > 0;[\s\S]{0,900}opacity:\s*1,[\s\S]{0,500}scale: withTiming\(selected \? \(IS_WEB \? 1\.105 : 1\.025\) : 1/,
  'Web and app must keep the grip visible and use their platform-specific armed enlargement without waiting for drag activation.',
);
requirePattern(
  agendaSource,
  /const resizeGripStyle = useAnimatedStyle\([\s\S]{0,750}scaleX: withTiming\(selected \? \(IS_WEB \? 1\.22 : 1\.06\) : 1[\s\S]{0,350}scaleY: withTiming\(selected \? \(IS_WEB \? 1\.12 : 1\.035\) : 1/,
  'The grip line must visibly widen inside the premium armed handle.',
);
requirePattern(
  agendaSource,
  /getWebWeekResizeIndicatorHeight[\s\S]{0,420}?safeContentHeight < 38[\s\S]{0,220}?safeContentHeight - 10[\s\S]*?resizeBottomBandHeight = IS_WEB[\s\S]{0,100}?webResizeIndicatorHeight[\s\S]*?weekAppointmentResizeIndicatorWeb,[\s\S]{0,160}?height: webResizeIndicatorHeight/,
  'The web hitbox and visible footer must share the same compact-only height.',
);

// The live cursor locks only the segment it actually crosses. A rendered final
// phase must therefore remain future/editable even after the initial phase has
// started.
requirePattern(
  agendaSource,
  /const getWeekAppointmentInteractionWindow = useCallback\([\s\S]{0,500}appointment\.renderedPhase[\s\S]{0,260}interval\.phase === appointment\.renderedPhase/,
  'Temporal policy must resolve the visible initial/final segment, not only the base appointment start.',
);
requirePattern(
  agendaSource,
  /const getWeekAppointmentTemporalState = useCallback\([\s\S]{0,500}if \(nowMs < startAtMs\) return 'future';[\s\S]{0,120}if \(nowMs < endAtMs\) return 'ongoing';[\s\S]{0,80}return 'past';/,
  'Agenda appointments must use one explicit future/ongoing/past policy.',
);

// An ongoing web card remains clickable, but the body Pan stays disabled.
// Its real lower handle owns a dedicated captured pointer path, avoiding the
// fragile child-relative hit test that can reject the visible footer.
requirePattern(
  agendaSource,
  /\.enabled\(!disabled && \(IS_WEB \|\| !nativeInteractionDisabled\)\)/,
  'The read-only body Pan must remain disabled for an ongoing appointment.',
);
requirePattern(
  agendaSource,
  /const handleProtectedWebResizePointerDown = useCallback\([\s\S]{0,900}setPointerCapture[\s\S]{0,900}dispatchResizeStart\(pageY\)/,
  'The live web handle must directly capture the pointer and start resize.',
);
requirePattern(
  agendaSource,
  /const handleProtectedWebResizePointerMove = useCallback\([\s\S]{0,900}clampProtectedWebResizeTranslation[\s\S]{0,280}dispatchResizeMove/,
  'The captured live pointer must keep updating only the protected resize path.',
);
requirePattern(
  agendaSource,
  /salonResizeHandle:\s*'true'[\s\S]{0,500}onPointerDown=\{[\s\S]{0,180}handleProtectedWebResizePointerDown/,
  'The pointer handlers must be attached to the real visible handle, not the card body.',
);
requirePattern(
  agendaSource,
  /const boundedResizeTranslationY = resizeOngoing[\s\S]{0,140}Math\.max\([\s\S]{0,90}minimumResizeTranslationY,[\s\S]{0,60}resizeFingerTranslationY/,
  'An ongoing gesture may change the bottom edge while respecting the minimum future end.',
);
requirePattern(
  agendaSource,
  /const releasedTemporalState =[\s\S]{0,260}const resizeOngoingSegment =[\s\S]{0,170}releasedTemporalState === 'past'/,
  'The release handler must reject an appointment that became past during the gesture.',
);
requirePattern(
  agendaSource,
  /appointmentWindow\.startAtMs \+ nearestDuration \* 60_000 <=[\s\S]{0,80}resizeReleasedAtMs/,
  'An ongoing resize must never commit an end at or before the live time.',
);

// The popup follows the same clock and exposes only the reminder while the
// selected visible segment is ongoing.
requirePattern(
  agendaSource,
  /const weekAppointmentDetailsTemporalState = useMemo\([\s\S]{0,320}getWeekAppointmentTemporalState\(weekAppointmentDetails\)/,
  'The details popup must refresh from the shared temporal state.',
);
requirePattern(
  agendaSource,
  /return weekAppointmentDetailsTemporalState === 'ongoing';/,
  'The late reminder must be restricted to the visible segment currently in progress.',
);
requirePattern(
  agendaSource,
  /weekAppointmentPendingRequest &&[\s\S]{0,80}weekAppointmentDetailsCanManage/,
  'Pending mutation actions must disappear once the selected segment has started.',
);

// Current October contract: the lower edge can extend or shorten an ongoing
// segment, while the start stays fixed and the new end remains in the future.
requirePattern(appContextSource,/shortenOnly[\s\S]{0,160}persistOngoingDuration/,'Ongoing simple appointments must use the dedicated live server guard.');
requirePattern(appContextSource,/resize_owner_ongoing_phased_segment_v1[\s\S]{0,500}p_next_phase_duration_minutes/,'Ongoing phased appointments must use the dedicated server guard.');
requirePattern(ongoingPhaseMigrationSource,/create or replace function public\.resize_owner_ongoing_phased_segment_v1\([\s\S]*ongoing_phase_not_active[\s\S]*duration_end_in_past/,'The live phase RPC must reject inactive phases and ends in the past.');
assert.doesNotMatch(ongoingPhaseMigrationSource,/ongoing_phase_can_only_be_shortened/,'The current live-edge contract must not silently restore the obsolete shorten-only policy.');
console.log('Web Agenda resize-handle contracts OK.');
