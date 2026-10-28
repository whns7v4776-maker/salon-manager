/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const slotTouchable = sliceBetween(
  'function WeekPlannerSlotTouchable(',
  'function WeekDragTargetHighlight(',
  'week slot touchable',
);
assert.match(
  slotTouchable,
  /<HapticTouchable[\s\S]*?hapticType="none"[\s\S]*?pressInHapticType="none"/,
  'Native iOS slot cells must not emit feedback before the shared tap/scroll guard.',
);
assert.match(
  slotTouchable,
  /didTouchMove\(event\) \|\| shouldBlockPress\?\.\(\)/,
  'A slot press must still be rejected after movement or while scrolling.',
);

const horizontalGrid = sliceBetween(
  'const weekPlannerGridContainerProps = useMemo(',
  'const weekPlannerNeedsTimeColumnOverflow =',
  'horizontal week grid',
);
for (const callback of [
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
]) {
  assert.match(
    horizontalGrid,
    new RegExp(`${callback}: \\(\\) => \\{[\\s\\S]*?agendaSlotScrollGestureActiveRef\\.current`),
    `Horizontal grid must update the shared slot guard in ${callback}.`,
  );
}
assert.match(
  horizontalGrid,
  /onScrollEndDrag:[\s\S]*?agendaSlotScrollGestureEndedAtRef\.current = Date\.now\(\)[\s\S]*?onMomentumScrollEnd:[\s\S]*?agendaSlotScrollGestureEndedAtRef\.current = Date\.now\(\)/,
  'Horizontal drag and momentum release must retain the post-scroll tap guard.',
);

const quickSlotOpen = sliceBetween(
  'const openQuickSlotModal = useCallback(',
  'const releaseQuickSlotInteractionLocks = useCallback(',
  'quick slot open path',
);
assert.match(
  quickSlotOpen,
  /if \(!IS_WEB\) \{\s*haptic\.light\(\)\.catch\(\(\) => null\);/,
  'A confirmed native slot tap must emit one immediate centralized light haptic.',
);
assert.match(
  quickSlotOpen,
  /setQuickSlotModalShellDraft\(nextDraft\);[\s\S]*?if \(IS_WEB\) \{\s*runPendingQuickSlotDeferredWork\(\);\s*\}/,
  'Native open must commit only the light shell; web keeps its existing immediate form path.',
);
assert.equal(
  (quickSlotOpen.match(/runPendingQuickSlotDeferredWork\(\)/g) ?? []).length,
  1,
  'The native open path must not schedule the heavy form before Modal.onShow.',
);

const quickSlotModal = sliceBetween(
  '<QuickSlotModalHost ref={quickSlotModalHostRef} presentationKey={quickSlotModalShellDraft}',
  '<NativeDatePickerModal',
  'quick slot modal',
);
assert.match(
  quickSlotModal,
  /onShow=\{\(\) => \{\s*[\s\S]*?runPendingQuickSlotDeferredWork\(\);\s*const pendingQuickSlot = pendingQuickSlotPerfRef\.current;\s*if \(!pendingQuickSlot\)/,
  'The native Modal must schedule its full form after the shell is shown, independently from optional perf metrics.',
);

const blockedCustomerHelper = sliceBetween(
  'const buildBlockedQuickBookingCustomerIdentityKeys = (',
  'const DAY_CARD_WIDTH =',
  'blocked customer helper',
);
assert.ok(
  blockedCustomerHelper.indexOf('selectedDurationMinutes <= 0') <
    blockedCustomerHelper.indexOf('const customersByName = new Map'),
  'Opening an empty booking form must skip customer indexing before a service duration exists.',
);

assert.equal(
  (source.match(/<WeekPlannerSlotTouchable/g) ?? []).length,
  2,
  'Both Agenda free-slot render paths must keep the shared touch owner.',
);
assert.equal(
  (source.match(/shouldBlockPress=\{\s*shouldBlockAgendaSlotPress\s*\}/g) ?? [])
    .length,
  2,
  'Both Agenda free-slot render paths must keep the scroll guard.',
);

console.log('Agenda quick-slot tap contracts OK');
