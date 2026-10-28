/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const agendaPath = path.join(root, "app", "(tabs)", "agenda.tsx");
const agenda = fs.readFileSync(agendaPath, "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sourceBetween = (source, startMarker, endMarker, label) => {
  const startIndex = source.indexOf(startMarker);
  assert(startIndex >= 0, `${label}: missing start marker.`);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  assert(endIndex >= 0, `${label}: missing end marker.`);
  return source.slice(startIndex, endIndex);
};

const nativeGestureScrollViewSource = sourceBetween(
  agenda,
  "const NativeGestureScrollView = React.forwardRef<",
  "const WeekPlannerScrollContainer:",
  "Native Gesture ScrollView",
);
const nativeResizeAwareOverlayContentSource = sourceBetween(
  agenda,
  "function NativeWeekResizeAwareOverlayContent({",
  "function NativeWeekDragOverlay({",
  "Native resize-aware overlay content",
);
const nativeWeekDragOverlaySource = sourceBetween(
  agenda,
  "function NativeWeekDragOverlay({",
  "const formatDateLong = (value: string) => {",
  "Native drag/resize overlay",
);

assert(
  agenda.includes(
    "const resizeBottomBandHeight = IS_WEB\n      ? webResizeIndicatorHeight\n      : nativeResizeIndicatorHeight;",
  ),
  "Native resize hit-area must match the adaptive visible footer height.",
);
assert(
  /getNativeWeekResizeIndicatorHeight[\s\S]*?safeContentHeight < 30[\s\S]*?safeContentHeight - 11[\s\S]*?nativeResizeIndicatorHeight = getNativeWeekResizeIndicatorHeight\([\s\S]*?weekAppointmentResizeIndicatorNative,[\s\S]*?height: Math\.min\(14, nativeResizeIndicatorHeight\)/.test(
    agenda,
  ),
  "The 23px native row must compact its visible footer instead of covering the mandatory information row.",
);
assert(
  (nativeResizeAwareOverlayContentSource.match(/<Reanimated\.View/g) ?? [])
    .length === 2 &&
    (
      nativeResizeAwareOverlayContentSource.match(/pointerEvents="none"/g) ?? []
    ).length === 2 &&
    (
      nativeResizeAwareOverlayContentSource.match(
        /StyleSheet\.absoluteFillObject/g,
      ) ?? []
    ).length === 2 &&
    /<Reanimated\.View[\s\S]*?\{regularChildren\}[\s\S]*?<\/Reanimated\.View>[\s\S]*?<Reanimated\.View[\s\S]*?\{essentialResizeChildren\}[\s\S]*?<\/Reanimated\.View>/.test(
      nativeResizeAwareOverlayContentSource,
    ),
  "Native resize must keep both regular and essential pointer-free content layers pre-mounted.",
);
assert(
  (
    nativeResizeAwareOverlayContentSource.match(
      /const usesEssentialResizeContent = !!\([\s\S]*?activeResizeKey\.value === appointmentKey[\s\S]*?resizeHeight\.value < Math\.max\(18, sourceHeight - 6\)[\s\S]*?\);/g,
    ) ?? []
  ).length === 2 &&
    (
      nativeResizeAwareOverlayContentSource.match(/useAnimatedStyle\(\(\) =>/g) ??
      []
    ).length === 2 &&
    /return \{ opacity: usesEssentialResizeContent \? 0 : 1 \};/.test(
      nativeResizeAwareOverlayContentSource,
    ) &&
    /return \{ opacity: usesEssentialResizeContent \? 1 : 0 \};/.test(
      nativeResizeAwareOverlayContentSource,
    ) &&
    !/\brunOnJS\s*\(/.test(nativeResizeAwareOverlayContentSource) &&
    !/\bset[A-Z][A-Za-z0-9_]*\s*\(/.test(
      nativeResizeAwareOverlayContentSource,
    ),
  "The essential resize layer must switch only on UI-thread shrink, without React state or JS bridging.",
);
assert(
  /<NativeWeekResizeAwareOverlayContent[\s\S]*?regularChildren=\{renderWeekAppointmentContent\([\s\S]*?essentialResizeChildren=\{renderWeekAppointmentContent\(\s*candidate\.appointment,\s*18,\s*candidate\.blockWidth,\s*candidate\.contentMode,\s*candidate\.roleLabel,\s*false,\s*candidate\.slotTime,\s*null,\s*false,\s*\)\}/.test(
    agenda,
  ),
  "The resize clone must pre-mount its essential 18px content without reserving a second footer.",
);
assert(
  /const settledResizeHandleHeight = Math\.min\(14, Math\.max\(1, resizeHandleHeight\.value\)\);[\s\S]*?const liveResizeHandleHeight = Math\.min\(14, getNativeWeekResizeIndicatorHeight\([\s\S]*?const restingResizeHandleHeight = isActivelyResized\s*\? liveResizeHandleHeight\s*:\s*settledResizeHandleHeight;[\s\S]*?const activeResizeHandleHeight = Math\.min\(\s*16,\s*restingResizeHandleHeight \+ 2,\s*Math\.max\(restingResizeHandleHeight, resizeHeight\.value - 11\),?\s*\);[\s\S]*?height: isActivelyResized\s*\? activeResizeHandleHeight\s*:\s*restingResizeHandleHeight/.test(
    nativeWeekDragOverlaySource,
  ),
  "The active native handle must derive its height from the live clone and preserve the mandatory 11px information band.",
);
const minimumNativeResizeHeight = 23;
const essentialInformationBottom = 1 + 9;
const compactLiveHandleHeight = Math.max(
  9,
  Math.min(12, minimumNativeResizeHeight - 11),
);
const compactActiveHandleHeight = Math.min(
  16,
  compactLiveHandleHeight + 2,
  Math.max(
    compactLiveHandleHeight,
    minimumNativeResizeHeight - 11,
  ),
);
const compactActiveHandleVisualTop =
  minimumNativeResizeHeight -
  compactActiveHandleHeight -
  (compactActiveHandleHeight * (1.025 - 1)) / 2;
assert(
  /const agendaDensityRowHeight\s*=\s*agendaSlotRowHeight\(IS_WEB,agendaDensityScale\);/.test(
    agenda,
  ) &&
    /weekAppointmentPremiumNativeMinimalCardMicro:\s*\{[\s\S]*?gap:\s*1,[\s\S]*?weekAppointmentPremiumNativeMinimalServiceMicro:\s*\{[\s\S]*?minHeight:\s*10,[\s\S]*?maxHeight:\s*11,/.test(
      agenda,
    ) &&
    compactActiveHandleVisualTop > essentialInformationBottom,
  "At the 23px native minimum, the live enlarged handle must stay below the protected vertical micro content.",
);
assert(
  agenda.includes("const resizeBottomBandOvershoot = IS_WEB ? 8 : 0;"),
  "Native resize must not intercept touches outside the visible card.",
);
assert(
  /const isResizeHandleTouch = \([\s\S]*?resolvedContentHeight \?\? cardHeight\.value[\s\S]*?Number\.isFinite\(localTouchY\)[\s\S]*?const measuredCard = measure\(appointmentViewRef\)/.test(
    agenda,
  ),
  "Every recognizer must share the current rendered footer geometry, with measure used only as fallback.",
);
assert(
  /pan\.onTouchesDown\([\s\S]*?mainPanTouchStartedOnResizeHandle\.value = 0;[\s\S]*?if \(isResizeHandleTouch\(touch\)\) \{[\s\S]*?mainPanTouchStartedOnResizeHandle\.value = 1;[\s\S]*?stateManager\.fail\(\);/.test(
    agenda,
  ) &&
    /\.onStart\(\(event\) => \{[\s\S]*?mainPanTouchStartedOnResizeHandle\.value === 1[\s\S]*?mainPanStarted\.value = 0;[\s\S]*?return;/.test(
      agenda,
    ),
  "A touch born on the native handle must never be promoted to whole-card drag.",
);
assert(
  agenda.includes("cardHeight.value = resolvedContentHeight;"),
  "Native resize must synchronize its next hit-test height after commit.",
);
assert(
  agenda.includes(
    "!IS_WEB &&\n                                laneRowHasTrailingOverlap &&\n                                styles.weekPlannerCellWrapTrailingOverlapNative",
  ),
  "Native trailing overlaps must keep their visible resize handle on top.",
);
assert(
  /weekPlannerCellWrapTrailingOverlapNative:\s*\{[\s\S]*?zIndex:\s*60,[\s\S]*?elevation:\s*60,/.test(
    agenda,
  ),
  "Native overlap stacking must outrank the normal appointment row.",
);
assert(
  agenda.includes("Gesture.Exclusive(nativeResizePan, pan, tap)"),
  "Native resize, card drag and tap must retain one deterministic gesture owner.",
);
assert(
  agenda.includes("renderedDurationMinutes?: number;") &&
    (
      agenda.match(/renderedDurationMinutes=\{/g) ?? []
    ).length === 2 &&
    /const appointmentVisibleDurationMinutes\s*=\s*appointmentStart[\s\S]*?getAppointmentOperatorBusyIntervals\(\s*appointmentStart\s*,?\s*\)[\s\S]*?\?\.durationMinutes \?\?[\s\S]*?getAppointmentDurationMinutes\(appointmentStart\)[\s\S]*?renderedDurationMinutes=\{\s*appointmentVisibleDurationMinutes\s*\}/.test(
      agenda,
    ) &&
    /const laneAppointmentVisibleDuration\s*=[\s\S]*?getAppointmentOperatorBusyIntervals\(\s*laneStartAppointment\s*,?\s*\)[\s\S]*?\?\.durationMinutes \?\?[\s\S]*?getAppointmentDurationMinutes\(\s*laneStartAppointment\s*,?\s*\)[\s\S]*?renderedDurationMinutes=\{\s*laneAppointmentVisibleDuration\s*\}/.test(
      agenda,
    ),
  "Both native render paths must pass the duration of the rendered appointment segment into the gesture owner.",
);
assert(
  /if \(IS_WEB\) \{\s*pan\.minDistance\(3\);\s*\} else if \(resizeEnabled\) \{[\s\S]*?pan\.hitSlop\(\{ bottom: -resizeBottomBandHeight \}\);/.test(
    agenda,
  ) &&
    /nativeResizePan = Gesture\.Pan\(\)[\s\S]*?\.hitSlop\(\{ height: resizeBottomBandHeight, bottom: 0 \}\)/.test(
      agenda,
    ),
  "Native card drag and resize must have physically disjoint body/footer hit areas.",
);
assert(
  !agenda.includes(".minDistance(IS_WEB ? 3 : 2)"),
  "Native whole-card drag must not bypass its long press through a two-pixel distance threshold.",
);
assert(
  /const tap = Gesture\.Tap\(\);[\s\S]*?if \(resizeEnabled && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?tap\.hitSlop\(\{ bottom: -resizeBottomBandHeight \}\);[\s\S]*?\.maxDuration\(nativeResizeSharedSurfaceTarget \? 350 : 220\)[\s\S]*?if \(isResizeHandleTouch\(touch\) && !nativeResizeSharedSurfaceTarget\) \{[\s\S]*?stateManager\.fail\(\);[\s\S]*?\.onEnd\([\s\S]*?dispatchPress/.test(
    agenda,
  ),
  "Native cards up to 20 minutes or one rendered row must keep their full tap surface and 350ms window, while ordinary cards and web retain an exclusive resize footer.",
);
assert(
  agenda.includes("const NATIVE_RESIZE_INTENT_HOLD_MS = 160;") &&
    agenda.includes("const NATIVE_RESIZE_SCROLL_CANCEL_PX = 7;") &&
    agenda.includes("const NATIVE_SINGLE_ROW_RESIZE_ACTIVATION_PX = 4;") &&
    agenda.includes("const NATIVE_COMPACT_SHARED_TAP_MAX_MINUTES = 20;") &&
    agenda.includes("const NATIVE_COMPACT_CARD_DRAG_HOLD_MS = 360;"),
  "Compact and ordinary native gesture timing constants must remain explicit and independently guarded.",
);
assert(
  /const nativeResizeSingleRowTarget = !!\([\s\S]*?!IS_WEB[\s\S]*?resolvedContentHeight <= nativeResizeSnapStep \+ 1[\s\S]*?const nativeCompactDurationTarget = !!\([\s\S]*?!IS_WEB[\s\S]*?Number\.isFinite\(renderedDurationMinutes\)[\s\S]*?Number\(renderedDurationMinutes\) > 0[\s\S]*?Number\(renderedDurationMinutes\) <= NATIVE_COMPACT_SHARED_TAP_MAX_MINUTES[\s\S]*?const nativeResizeSharedSurfaceTarget =\s*nativeResizeSingleRowTarget \|\| nativeCompactDurationTarget;[\s\S]*?const nativeResizeIntentHoldMs = nativeResizeSharedSurfaceTarget\s*\? 100\s*:\s*NATIVE_RESIZE_INTENT_HOLD_MS;[\s\S]*?const nativeResizeScrollCancelPx = nativeResizeSharedSurfaceTarget\s*\? 10\s*:\s*NATIVE_RESIZE_SCROLL_CANCEL_PX;[\s\S]*?const nativeCardDragIntentHoldMs = nativeResizeSharedSurfaceTarget\s*\? NATIVE_COMPACT_CARD_DRAG_HOLD_MS\s*:\s*210;/.test(
    agenda,
  ),
  "The shared app-only gesture surface must cover a rendered duration up to 20 minutes or one row, while preserving ordinary resize and card-drag timing.",
);
assert(
  /if \(!IS_WEB\) \{[\s\S]*?pan\.activateAfterLongPress\(nativeCardDragIntentHoldMs\);[\s\S]*?pan\.onTouchesDown/.test(
    agenda,
  ),
  "Only compact native cards may defer whole-card drag to 360ms; ordinary native cards must retain 210ms and web must stay on its separate path.",
);
assert(
  /nativeResizePan = Gesture\.Pan\(\)[\s\S]*?\.failOffsetX\(\[\s*-nativeResizeScrollCancelPx,\s*nativeResizeScrollCancelPx,?\s*\]\)[\s\S]*?\.failOffsetY\(\[\s*-nativeResizeScrollCancelPx,\s*nativeResizeScrollCancelPx,?\s*\]\)/.test(
    agenda,
  ),
  "The native recognizer must consume the adaptive hold and slop values on both axes.",
);
assert(
  /\.onTouchesMove\(\(event, stateManager\) => \{[\s\S]*?if \(!nativeResizeSharedSurfaceTarget \|\| nativeResizePanStarted\.value\) \{[\s\S]*?return;[\s\S]*?const horizontalTravel = Math\.abs\([\s\S]*?const signedVerticalTravel =\s*touch\.absoluteY - nativeResizeTouchStartAbsoluteY\.value;[\s\S]*?const verticalTravel = Math\.abs\(signedVerticalTravel\);[\s\S]*?const heldForMs = Date\.now\(\) - nativeResizeTouchStartedAt\.value;[\s\S]*?if \(heldForMs < nativeResizeIntentHoldMs\) \{[\s\S]*?horizontalTravel > nativeResizeScrollCancelPx \|\|[\s\S]*?verticalTravel > nativeResizeScrollCancelPx[\s\S]*?stateManager\.fail\(\);[\s\S]*?return;[\s\S]*?if \(horizontalTravel > nativeResizeScrollCancelPx\) \{[\s\S]*?stateManager\.fail\(\);[\s\S]*?return;[\s\S]*?const hasIntentionalResizeTravel = nativeResizeSingleRowTarget\s*\? signedVerticalTravel >= NATIVE_SINGLE_ROW_RESIZE_ACTIVATION_PX\s*:\s*verticalTravel >= NATIVE_SINGLE_ROW_RESIZE_ACTIVATION_PX;[\s\S]*?if \(hasIntentionalResizeTravel\) \{[\s\S]*?stateManager\.activate\(\);/.test(
    agenda,
  ) &&
    /if \(nativeResizeSharedSurfaceTarget\) \{[\s\S]*?nativeResizePan\.manualActivation\(true\);[\s\S]*?\} else \{[\s\S]*?nativeResizePan\.activateAfterLongPress\(nativeResizeIntentHoldMs\);/.test(
      agenda,
    ),
  "Shared compact resize must activate manually after its hold: one-row cards only downward, compact two-row cards in either direction, with ordinary cards left on the established long-press path.",
);
assert(
  /const resizeHandleArmed = useSharedValue\(0\);[\s\S]*?\.onTouchesDown\([\s\S]*?resizeHandleArmed\.value = 1;[\s\S]*?\.onFinalize\([\s\S]*?resizeHandleArmed\.value = 0;/.test(
    agenda,
  ),
  "The native handle must illuminate on contact and always clear at finalize.",
);
assert(
  agenda.includes(
    "const nativeWeekResizeOverlayActiveKey = useSharedValue('');",
  ) &&
    agenda.includes("const nativeWeekResizeOverlayHeight = useSharedValue(0);"),
  "Native resize must own dedicated overlay state instead of reusing whole-card drag state.",
);

const resizeOverlayRootMatch = agenda.match(
  /const (agendaNativeResizeOverlayRootRef) = useAnimatedRef<View>\(\);/,
);
assert(
  !!resizeOverlayRootMatch,
  "The real native resize overlay host must expose an animated ref measurable on the UI thread.",
);
const resizeOverlayRootRef = resizeOverlayRootMatch?.[1] ?? "";
const resizeOverlayHostPattern = new RegExp(
  `<Reanimated\\.View\\s+ref=\\{${resizeOverlayRootRef}\\}\\s+collapsable=\\{false\\}[\\s\\S]{0,180}?style=\\{styles\\.agendaNativeDragOverlayRoot\\}[\\s\\S]*?<NativeWeekDragOverlay`,
);
assert(
  resizeOverlayHostPattern.test(agenda),
  "The animated ref must belong to the non-collapsible root that actually renders NativeWeekDragOverlay.",
);
assert(
  (
    agenda.match(
      /nativeResizeOverlayRootRef=\{\s*agendaNativeResizeOverlayRootRef\s*\}/g,
    ) ?? []
  ).length === 2,
  "Both native appointment render paths must measure the same real resize overlay host.",
);

const nativeResizeOverlayStageSource = sourceBetween(
  agenda,
  "const stageNativeResizeOverlayFromTouchAnchor = () => {",
  "const nativeResizePan = Gesture.Pan()",
  "Native resize overlay pickup",
);
assert(
  nativeResizeOverlayStageSource.includes("'worklet';") &&
    /const measuredCard = measure\(appointmentViewRef\);\s*const measuredOverlayRoot = measure\(nativeResizeOverlayRootRef\);/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /nativeDragOverlayOriginReady\.value !== 1/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /const measuredTouchY =\s*nativeResizeTouchStartAbsoluteY\.value - measuredCard\.pageY;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /const rootOriginIsStable =[\s\S]*?measuredOverlayRoot\.pageX - nativeDragOverlayOriginX\.value[\s\S]*?<=\s*3[\s\S]*?measuredOverlayRoot\.pageY - nativeDragOverlayOriginY\.value[\s\S]*?<=\s*3;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /const touchStillBelongsToMeasuredHandle =[\s\S]*?measuredTouchY >= measuredHandleTop - 3[\s\S]*?measuredTouchY <= resolvedMeasuredHeight \+ 3;[\s\S]*?if \(!rootOriginIsStable \|\| !touchStillBelongsToMeasuredHandle\) \{\s*return false;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /nativeResizeOverlayX\.value =\s*measuredCard\.pageX -\s*measuredOverlayRoot\.pageX \+\s*nativeResizeTouchStartWeekScrollX\.value;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /nativeResizeOverlayY\.value =\s*measuredCard\.pageY -\s*measuredOverlayRoot\.pageY \+\s*nativeResizeTouchStartAgendaScrollY\.value;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /nativeResizeOverlayActiveKey\.value = nativeResizeOverlayAppointmentKey;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    !/nativeResizeTouchStartAbsoluteY\.value - touchLocalY/.test(
      nativeResizeOverlayStageSource,
    ),
  "The first native pickup must reject stale geometry, use card/root coordinates from one worklet frame and store X/Y in scroll-content space.",
);

assert(
  agenda.includes(
    'const agendaNativeDragOverlayRootOriginReady = useSharedValue(0);',
  ) &&
    /updateAgendaNativeDragOverlayRootOrigin[\s\S]*?agendaNativeDragOverlayRootOriginReady\.value = 0;[\s\S]*?measureInWindow[\s\S]*?agendaNativeDragOverlayRootOriginReady\.value = 1;/.test(
      agenda,
    ) &&
    (
      agenda.match(
        /nativeDragOverlayOriginReady=\{\s*agendaNativeDragOverlayRootOriginReady\s*\}/g,
      ) ?? []
    ).length === 2,
  "Both native render paths must wait for a freshly measured shared overlay origin.",
);

const nativeResizePanSource = sourceBetween(
  agenda,
  "const nativeResizePan = Gesture.Pan()",
  "const tap = Gesture.Tap();",
  "Native resize recognizer",
);
const nativeResizeUpdateSource = sourceBetween(
  nativeResizePanSource,
  ".onUpdate((event) => {",
  ".onEnd((event, success) => {",
  "Native resize update",
);
const nativeResizeEndSource = sourceBetween(
  nativeResizePanSource,
  ".onEnd((event, success) => {",
  ".onFinalize(() => {",
  "Native resize release",
);
const nativeResizeFinalizeSource = nativeResizePanSource.slice(
  nativeResizePanSource.indexOf(".onFinalize(() => {"),
);
const beginWeekAppointmentResizeSource = sourceBetween(
  agenda,
  "const beginWeekAppointmentResize",
  "const moveWeekAppointmentResize",
  "Begin week appointment resize",
);
const moveWeekAppointmentResizeSource = sourceBetween(
  agenda,
  "const moveWeekAppointmentResize",
  "const cancelWeekAppointmentResize",
  "Move week appointment resize",
);
const cancelWeekAppointmentResizeSource = sourceBetween(
  agenda,
  "const cancelWeekAppointmentResize",
  "const stageWeekReorganizationResize",
  "Cancel week appointment resize",
);
const endWeekAppointmentResizeSource = sourceBetween(
  agenda,
  "const endWeekAppointmentResize",
  "\n\n  useEffect(() => {",
  "End week appointment resize",
);
const resizeAutoScrollSource = sourceBetween(
  agenda,
  "const resizeSource = weekResizeSourceRef.current;",
  "const sourceAppointment = weekDragSourceRef.current;",
  "Resize auto-scroll tick",
);
const resizeVisibleBoundsSource = sourceBetween(
  agenda,
  "const getWeekResizeVisibleVerticalBounds",
  "const scrollAgendaNativelyDuringResize",
  "Resize visible bounds",
);
const nativeResizeOverlaySharedStateSource = sourceBetween(
  agenda,
  "const nativeWeekResizeOverlayStartAgendaScrollY = useSharedValue(0);",
  "const agendaNativeResizeOverlayRootRef",
  "Native resize overlay shared state",
);
assert(
  /\.onTouchesDown\([\s\S]*?nativeResizeTouchStartAbsoluteX\.value = touch\.absoluteX;[\s\S]*?nativeResizeTouchStartAbsoluteY\.value = touch\.absoluteY;[\s\S]*?nativeResizeTouchStartLocalX\.value = Number\.isFinite\(touch\.x\)[\s\S]*?nativeResizeTouchStartLocalY\.value = Number\.isFinite\(touch\.y\)/.test(
    nativeResizePanSource,
  ) &&
    /\.onStart\([\s\S]*?stageNativeResizeOverlayFromTouchAnchor\(\);[\s\S]*?\.onUpdate\([\s\S]*?nativeResizeOverlayActiveKey\?\.value !==[\s\S]*?stageNativeResizeOverlayFromTouchAnchor\(\);/.test(
      nativeResizePanSource,
    ),
  "Native resize must capture the local/absolute touch anchor and retry only until the real host is measurable.",
);
assert(
  /const physicalResizeTranslationY = event\.absoluteY - startAbsoluteY;[\s\S]*?const boundedPhysicalResizeTranslationY = resizeOngoing[\s\S]*?: physicalResizeTranslationY;[\s\S]*?nativeResizeOverlayHeight\.value = Math\.max\([\s\S]*?cardHeight\.value \+ boundedPhysicalResizeTranslationY/.test(
    nativeResizeUpdateSource,
  ),
  "The native resize overlay base height must follow only physical finger movement on the UI thread.",
);
const nativeResizeMoveThrottleMatch = agenda.match(
  /const NATIVE_RESIZE_MOVE_JS_THROTTLE_MS\s*=\s*(\d+);/,
);
const nativeResizeMoveThrottleMs = Number(
  nativeResizeMoveThrottleMatch?.[1] ?? Number.NaN,
);
assert(
  Number.isFinite(nativeResizeMoveThrottleMs) &&
    nativeResizeMoveThrottleMs >= 40 &&
    nativeResizeMoveThrottleMs <= 64 &&
    /\.onStart\([\s\S]*?lastNativeResizeMoveDispatchAt\.value = 0;[\s\S]*?\.onUpdate/.test(
      nativeResizePanSource,
    ) &&
    /const dispatchAt = Date\.now\(\);[\s\S]*?dispatchAt - lastNativeResizeMoveDispatchAt\.value >=\s*NATIVE_RESIZE_MOVE_JS_THROTTLE_MS[\s\S]*?lastNativeResizeMoveDispatchAt\.value = dispatchAt;[\s\S]*?runOnJS\(dispatchResizeMove\)\(\s*physicalResizeTranslationY,\s*event\.absoluteY,\s*\);/.test(
      nativeResizeUpdateSource,
    ) &&
    (nativeResizeUpdateSource.match(/runOnJS\(/g) ?? []).length === 1 &&
    !/\bset[A-Z][A-Za-z0-9_]*\s*\(/.test(nativeResizeUpdateSource),
  "Native resize must bridge only one render-free pointer update approximately every 48ms.",
);
assert(
  /weekResizeTranslationYRef\.current = translationY;[\s\S]*?weekResizeLastPointerYRef\.current = pageY;/.test(
    moveWeekAppointmentResizeSource,
  ) &&
    !/\bset[A-Z][A-Za-z0-9_]*\s*\(/.test(moveWeekAppointmentResizeSource),
  "The throttled resize move callback must update pointer refs without React state.",
);
const nativeResizeBeginSource = beginWeekAppointmentResizeSource.slice(
  beginWeekAppointmentResizeSource.indexOf("} else {"),
);
assert(
  /hideNativeWeekDropPreview\(\);[\s\S]*?startNativeWeekAutoScrollRef\.current\(\);/.test(
    nativeResizeBeginSource,
  ) &&
    !/\bset[A-Z][A-Za-z0-9_]*\s*\(/.test(nativeResizeBeginSource),
  "Native resize begin must arm auto-scroll imperatively without a planner setState.",
);
assert(
  /if \(!IS_WEB\) \{\s*stopNativeWeekAutoScrollRef\.current\(\);\s*\}/.test(
    cancelWeekAppointmentResizeSource,
  ) &&
    /if \(!IS_WEB\) \{\s*stopNativeWeekAutoScrollRef\.current\(\);\s*\}/.test(
      endWeekAppointmentResizeSource,
    ) &&
    /if \(active\.value && !ended\.value\) \{\s*runOnJS\(dispatchResizeCancel\)\(\);\s*\}/.test(
      nativeResizeFinalizeSource,
    ),
  "Native resize must stop auto-scroll on end/cancel, including finalize through its cancellation path.",
);
assert(
  /if \(resizeSource && resizePointerY !== null\)[\s\S]*?if \(\s*!IS_WEB &&\s*nativeWeekResizeOverlayInteractionActive\.value <= 0\s*\) \{\s*return;\s*\}[\s\S]*?const resizeSourceIsOngoing =\s*getWeekAppointmentTemporalState\(resizeSource\) === 'ongoing';[\s\S]*?const nativePhysicalResizeDelta = IS_WEB[\s\S]*?: weekResizeTranslationYRef\.current;[\s\S]*?resizePointerY >= visibleBottom - bottomEdgeThreshold[\s\S]*?\(IS_WEB \|\| nativePhysicalResizeDelta > 2\)[\s\S]*?const resizeScrollStep = IS_WEB\s*\? 12 \+ proximity \* 20\s*:\s*2 \+ proximity \* 5;[\s\S]*?scrollAgendaNativelyDuringResize\(nextY\);/.test(
    resizeAutoScrollSource,
  ) &&
    !/visibleTop|resizePointerY\s*<=|previousY\s*-\s*resizeScrollStep|nextY\s*=\s*Math\.max/.test(
      resizeAutoScrollSource,
    ) &&
    /if \(IS_WEB\) \{[\s\S]*?bottomEdgeThreshold: 54[\s\S]*?const customBarTop = agendaViewportHeight - customBarBottomOffset - 64;[\s\S]*?bottom: Math\.min\(bounds\.bottom, customBarTop - 12\),[\s\S]*?bottomEdgeThreshold: 36/.test(
      resizeVisibleBoundsSource,
    ),
  "Web and native lower-handle resize must auto-scroll only downward, and native must reject a queued tick after release.",
);
assert(
  /if \(IS_WEB\) \{\s*startTimer\(\);\s*\} else \{[\s\S]*?startNativeWeekAutoScrollRef\.current = startTimer;[\s\S]*?stopNativeWeekAutoScrollRef\.current = stopTimer;[\s\S]*?weekDragSourceRef\.current \|\|\s*weekResizeSourceRef\.current[\s\S]*?startTimer\(\);/.test(
    agenda,
  ),
  "The native timer effect must resume an in-flight resize after a geometry-driven restart.",
);
assert(
  /const nativeWeekResizeOverlayStartAgendaScrollY = useSharedValue\(0\);[\s\S]*?const nativeWeekResizeOverlayInteractionActive = useSharedValue\(0\);/.test(
    nativeResizeOverlaySharedStateSource,
  ) &&
    /nativeResizeOverlayHeight\.value = resolvedMeasuredHeight;[\s\S]*?nativeResizeOverlayStartAgendaScrollY\.value =\s*nativeResizeTouchStartAgendaScrollY\.value;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /const isActivelyResized =\s*isResized && resizeInteractionActive\.value > 0;[\s\S]*?const activeResizeScrollDelta = isActivelyResized\s*\? Math\.max\(\s*0,\s*agendaVerticalScrollOffsetY\.value - resizeStartAgendaScrollY\.value,\s*\)\s*: 0;[\s\S]*?height: isDragged[\s\S]*?resizeHeight\.value \+ activeResizeScrollDelta/.test(
      nativeWeekDragOverlaySource,
    ) &&
    !/nativeWeekResizeOverlayHeight\.value\s*\+=/.test(agenda) &&
    !/nativeResizeOverlayHeight\.value\s*\+=/.test(nativeResizePanSource) &&
    (
      agenda.match(
        /nativeResizeOverlayStartAgendaScrollY=\{\s*nativeWeekResizeOverlayStartAgendaScrollY\s*\}/g,
      ) ?? []
    ).length === 2 &&
    (
      agenda.match(
        /nativeResizeOverlayInteractionActive=\{\s*nativeWeekResizeOverlayInteractionActive\s*\}/g,
      ) ?? []
    ).length === 2 &&
    /resizeStartAgendaScrollY=\{\s*nativeWeekResizeOverlayStartAgendaScrollY\s*\}/.test(
      agenda,
    ) &&
    /resizeInteractionActive=\{\s*nativeWeekResizeOverlayInteractionActive\s*\}/.test(
      agenda,
    ),
  "The active resize overlay must derive live-minus-start scroll compensation exactly once, without cumulative shared-value increments.",
);
assert(
  /const beginWeekAppointmentDrag[\s\S]*?startNativeWeekAutoScrollRef\.current\(\);[\s\S]*?const moveWeekAppointmentDrag/.test(
    agenda,
  ) &&
    /downwardActivationY = IS_WEB[\s\S]*?visibleBottom - 18[\s\S]*?upwardActivationY = IS_WEB[\s\S]*?visibleTop \+ 18/.test(
      agenda,
    ),
  "Whole-card native drag must retain its existing timer and both vertical edge branches.",
);

const terminalResizeDeltaMatch = nativeResizeEndSource.match(
  /const ([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^;]*event\.absoluteY\s*-\s*([A-Za-z][A-Za-z0-9_]*(?:\.value)?)[^;]*);/,
);
const terminalResizeDeltaName = terminalResizeDeltaMatch?.[1] ?? "";
const terminalResizeAnchorName = terminalResizeDeltaMatch?.[3] ?? "";
const terminalResizeUsesTouchAnchor =
  terminalResizeAnchorName === "nativeResizeTouchStartAbsoluteY.value" ||
  new RegExp(
    `const ${terminalResizeAnchorName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    )}\\s*=\\s*nativeResizeTouchStartAbsoluteY\\.value;`,
  ).test(nativeResizeEndSource);
const terminalResizeToReleasedFingerSource = terminalResizeDeltaName
  ? nativeResizeEndSource.slice(
      nativeResizeEndSource.indexOf(`const ${terminalResizeDeltaName}`),
      nativeResizeEndSource.indexOf("const releasedResizeTranslationY"),
    )
  : "";
const releasedFingerSource = sourceBetween(
  nativeResizeEndSource,
  "const releasedFingerTranslationY",
  "const releasedResizeTranslationY",
  "Native terminal finger delta",
);
assert(
  !!terminalResizeDeltaName &&
    terminalResizeUsesTouchAnchor &&
    terminalResizeToReleasedFingerSource.indexOf(terminalResizeDeltaName) !==
      terminalResizeToReleasedFingerSource.lastIndexOf(
        terminalResizeDeltaName,
      ) &&
    !releasedFingerSource.includes("resizeTranslationY.value"),
  "Native onEnd must recompute the terminal finger delta from event.absoluteY and the original touch anchor, never from the previous onUpdate frame.",
);

const keepReleasedResizeMatch = nativeResizeEndSource.match(
  /const ([A-Za-z][A-Za-z0-9_]*)\s*=\s*Math\.abs\(releasedResizeTranslationY\)\s*>\s*0\.01;/,
);
const releasedResizeDecisionName = keepReleasedResizeMatch?.[1] ?? "";
const escapedReleasedResizeDecisionName = releasedResizeDecisionName.replace(
  /[.*+?^${}()|[\]\\]/g,
  "\\$&",
);
const pendingByReleasedResizeDecision = releasedResizeDecisionName
  ? new RegExp(
      `resizeReleasePending\\.value\\s*=\\s*${escapedReleasedResizeDecisionName}\\s*\\?\\s*1\\s*:\\s*0;`,
    ).test(nativeResizeEndSource)
  : false;
const zeroResizeClearsOverlay = releasedResizeDecisionName
  ? new RegExp(
      `if \\(\\s*!${escapedReleasedResizeDecisionName}[\\s\\S]{0,320}?nativeResizeOverlayActiveKey\\?\\.value ===[\\s\\S]{0,180}?nativeResizeOverlayAppointmentKey[\\s\\S]{0,180}?nativeResizeOverlayActiveKey\\.value = '';`,
    ).test(nativeResizeEndSource)
  : false;
assert(
  pendingByReleasedResizeDecision &&
    zeroResizeClearsOverlay &&
    /const keepReleasedResizeHeight = resizeReleasePending\.value === 1;[\s\S]*?if \(!keepReleasedResizeHeight\) \{[\s\S]*?resizeMode\.value = 0;[\s\S]*?resizeTranslationY\.value = 0;[\s\S]*?resizeReleasePending\.value = 0;/.test(
      nativeResizePanSource,
    ),
  "A zero native snap must synchronously restore the source and clear its resize overlay on the UI thread, with release pending kept at zero.",
);
assert(
  pendingByReleasedResizeDecision &&
    /const previousResizeCommitEpochRef = useRef\(resizeCommitEpoch\);\s*useLayoutEffect\(\(\) => \{[\s\S]*?if \(!resizeReleasePending\.value\) return;[\s\S]*?nativeResizeOverlayActiveKey\.value = '';/.test(
      agenda,
    ),
  "A non-zero native snap must remain release-pending and keep its resize overlay until the matching layout commit.",
);
assert(
  /nativeResizeOverlayVisible[\s\S]*?opacity:[\s\S]*?nativeResizeOverlayVisible \|\| nativeDragOverlayVisible\s*\? 0/.test(
    agenda,
  ),
  "The in-grid source must disappear only while its dedicated resize overlay is visible.",
);
assert(
  /const previousResizeCommitEpochRef = useRef\(resizeCommitEpoch\);\s*useLayoutEffect\(\(\) => \{[\s\S]*?nativeResizeOverlayActiveKey\.value ===[\s\S]*?nativeResizeOverlayActiveKey\.value = '';/.test(
    agenda,
  ),
  "A successful non-zero native resize overlay must remain visible until the synchronous visual-duration commit handoff.",
);
assert(
  /\.onEnd\(\(event, success\) => \{[\s\S]*?nativeResizeOverlayInteractionActive\.value = 0;/.test(
    nativeResizePanSource,
  ) &&
    pendingByReleasedResizeDecision &&
    /const isActivelyResized =[\s\S]*?resizeInteractionActive\.value > 0;[\s\S]*?shadowOpacity: isResized \? \(isActivelyResized[\s\S]*?const resizeHandleAnimatedStyle[\s\S]*?isActivelyResized[\s\S]*?scaleX: isActivelyResized/.test(
      agenda,
    ) &&
    /elevation: isResized \? \(isActivelyResized \? 10000 : 4\) : 10000[\s\S]*?shadowOpacity: isActivelyResized \? 0\.2 : 0,[\s\S]*?shadowRadius: isActivelyResized \? 8 : 0,[\s\S]*?elevation: isActivelyResized \? 24 : 12/.test(
      agenda,
    ),
  "Release must clear Android elevation, glow and enlarged-handle state immediately while only a non-zero overlay remains owned until commit.",
);
assert(
  /const releasedOverlayHeight = Math\.max\([\s\S]*?cardHeight\.value \+ releasedResizeTranslationY[\s\S]*?nativeResizeOverlayHandleHeight\.value =\s*getNativeWeekResizeIndicatorHeight\(releasedOverlayHeight\)/.test(
    nativeResizePanSource,
  ),
  "The settled overlay handle must immediately match the resized card height instead of keeping its pre-resize size.",
);
assert(
  /nativeWeekDisplacedPreviewCandidates\.map[\s\S]*?<NativeWeekDragOverlay[\s\S]*?styles\.weekAppointmentBlock[\s\S]*?minHeight:\s*0,[\s\S]*?height:\s*'100%'/m.test(
    agenda,
  ),
  "The floating card body must follow the overlay height instead of preserving the pre-resize minimum height.",
);
assert(
  /const nativeAgendaVerticalScrollOffsetY = useSharedValue\(0\);/.test(
    agenda,
  ) &&
    /scrollViewOffset\?: SharedValue<number>;/.test(
      nativeGestureScrollViewSource,
    ) &&
    /const animatedScrollViewRef = useAnimatedRef<ScrollView>\(\);/.test(
      nativeGestureScrollViewSource,
    ) &&
    /React\.useImperativeHandle\(\s*ref,\s*\(\) => animatedScrollViewRef\.current as ScrollView,\s*\[animatedScrollViewRef\],?\s*\);/.test(
      nativeGestureScrollViewSource,
    ) &&
    /<Reanimated\.ScrollView\s*ref=\{animatedScrollViewRef as any\}[\s\S]*?scrollViewOffset=\{scrollViewOffset\}/.test(
      nativeGestureScrollViewSource,
    ) &&
    !/<Reanimated\.ScrollView\s*ref=\{ref as any\}/.test(
      nativeGestureScrollViewSource,
    ) &&
    /const renderAgendaNativeScrollComponent = useCallback\([\s\S]*?<NativeGestureScrollView[\s\S]*?scrollViewOffset=\{nativeAgendaVerticalScrollOffsetY\}/.test(
      agenda,
    ) &&
    /<FlatList[\s\S]*?ref=\{assignAgendaListRef\}[\s\S]*?renderScrollComponent=\{\s*IS_WEB \? undefined : renderAgendaNativeScrollComponent\s*\}/.test(
      agenda,
    ),
  "Native Agenda must give Reanimated its own observable AnimatedRef while exposing the ScrollView instance separately to FlatList.",
);
assert(
  /nativeResizeTouchStartWeekScrollX\.value =\s*nativeWeekHorizontalScrollOffsetX\?\.value \?\? 0;/.test(
    nativeResizePanSource,
  ) &&
    /nativeResizeTouchStartAgendaScrollY\.value =\s*nativeAgendaVerticalScrollOffsetY\?\.value \?\? 0;/.test(
      nativeResizePanSource,
    ) &&
    /nativeResizeOverlayX\.value =\s*measuredCard\.pageX -\s*measuredOverlayRoot\.pageX \+\s*nativeResizeTouchStartWeekScrollX\.value;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /nativeResizeOverlayY\.value =\s*measuredCard\.pageY -\s*measuredOverlayRoot\.pageY \+\s*nativeResizeTouchStartAgendaScrollY\.value;/.test(
      nativeResizeOverlayStageSource,
    ) &&
    /left: isDragged\s*\? dragX\.value\s*:\s*isResized\s*\? resizeX\.value - weekHorizontalScrollOffsetX\.value\s*:\s*0,/.test(
      nativeWeekDragOverlaySource,
    ) &&
    /top: isDragged\s*\? dragY\.value\s*:\s*isResized\s*\? resizeY\.value - agendaVerticalScrollOffsetY\.value\s*:\s*0,/.test(
      nativeWeekDragOverlaySource,
    ) &&
    (
      agenda.match(
        /nativeWeekHorizontalScrollOffsetX=\{\s*nativeWeekHorizontalScrollX\s*\}/g,
      ) ?? []
    ).length === 2 &&
    /weekHorizontalScrollOffsetX=\{\s*nativeWeekHorizontalScrollX\s*\}/.test(
      agenda,
    ),
  "The resize clone must store content-space X/Y and subtract both live UI-thread offsets, while whole-card drag keeps its viewport coordinates.",
);
const agendaListScrollSource = sourceBetween(
  agenda,
  "const handleAgendaListScroll = useCallback(",
  "const handleAgendaListScrollBeginDrag = useCallback(",
  "Agenda list scroll handler",
);
assert(
  !/nativeWeekResizeOverlayY\.value\s*[+\-=]/.test(agendaListScrollSource),
  "Released resize scroll tracking must not fall back to the JS thread during a heavy Agenda commit.",
);
assert(
  /<NativeWeekDragOverlay[\s\S]*?activeDragKey=\{nativeWeekDragOverlayActiveKey\}[\s\S]*?activeResizeKey=\{nativeWeekResizeOverlayActiveKey\}/.test(
    agenda,
  ),
  "The existing native candidate host must render resize above later slot rows without duplicating the candidate tree.",
);
assert(
  /weekAppointmentNativeResizeOverlayIndicator:\s*\{[\s\S]*?left:\s*3,[\s\S]*?right:\s*3,[\s\S]*?bottom:\s*-1,[\s\S]*?height:\s*14,[\s\S]*?backgroundColor:\s*'rgba\(255, 255, 255, 0\.4\)'/.test(
    agenda,
  ),
  "The active native resize handle must stay visually identical while becoming only slightly larger and brighter.",
);
assert(
  /weekAppointmentNativeGridDragOverlay:\s*\{[\s\S]*?overflow:\s*'visible'[\s\S]*?weekAppointmentNativeGridDragOverlayClip:\s*\{[\s\S]*?overflow:\s*'hidden'/.test(
    agenda,
  ),
  "The enlarged handle must escape the overlay while the appointment content remains clipped.",
);
assert(
  /borderWidth:\s*isResized \? 0 : 1\.5,[\s\S]*?backgroundColor:\s*isResized[\s\S]*?'rgba\(255, 255, 255, 0\)'/.test(
    agenda,
  ),
  "The active resize overlay must not recolor or outline the appointment card.",
);
assert(
  !/borderColor:\s*isResized[\s\S]{0,80}?'rgba\(245, 158, 11, 0\.96\)'/.test(
    agenda,
  ),
  "The rough full-card orange resize border must not return.",
);
assert(
  /const selected = resizeMode\.value > 0 \|\| resizeHandleArmed\.value > 0;[\s\S]*?opacity:\s*1,[\s\S]*?scale: withTiming\(selected \? 1\.105 : 1/.test(
    agenda,
  ),
  "App and web must keep the grip visible and clearly enlarge the unchanged handle as soon as it is armed.",
);
assert(
  /const resizeGripStyle = useAnimatedStyle\([\s\S]*?scaleX: withTiming\(selected \? 1\.22 : 1[\s\S]*?scaleY: withTiming\(selected \? 1\.12 : 1/.test(
    agenda,
  ),
  "The grip line must grow more than the handle shell while remaining inside it.",
);
assert(
  /transform:\s*\[\{ scale: 1 \}\][\s\S]*?const resizeHandleAnimatedStyle[\s\S]*?scaleX: isActivelyResized \? 1\.105 : 1[\s\S]*?scaleY: isActivelyResized \? 1\.095 : 1/.test(
    agenda,
  ),
  "Native resize may lift the card, but only the actively grabbed handle may inflate.",
);
assert(
  !agenda.includes('name="swap-vertical"') &&
    /weekAppointmentResizeGripBar:\s*\{[\s\S]*?width:\s*28,[\s\S]*?height:\s*3,/.test(
      agenda,
    ),
  "Resize handles must use one clear grip line without arrow icons.",
);
assert(
  (
    agenda.match(
      /clearWeekAppointmentResizeVisualPreview\(appointment\.id\);/g,
    ) ?? []
  ).length >= 8,
  "Abandoned native resize previews must be cleared instead of diverging from server data.",
);

console.log("Native Agenda resize gesture contracts: OK");
