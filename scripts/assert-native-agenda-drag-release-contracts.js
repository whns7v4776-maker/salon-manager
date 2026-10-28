/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agenda = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  /const nativeDragReleasePending = useSharedValue\(0\);/.test(agenda) &&
    /nativeDragReleasePending\.value = 1;[\s\S]{0,1700}runOnJS\(dispatchDragEnd\)/.test(
      agenda,
    ),
  'Native drag release must freeze its overlay before dispatching the JS drop.',
);

assert(
  /nativeDragOverlayActiveKey\.value ===[\s\S]{0,180}nativeDragOverlayAppointmentKey[\s\S]{0,220}nativeDragReleasePending\.value === 0[\s\S]{0,180}nativeDragOverlayActiveKey\.value = '';/.test(
    agenda,
  ),
  'Finalize must not clear a native drag overlay that is waiting for React commit.',
);

assert(
  /const nativeDragOverlayVisible = [\s\S]{0,260}nativeDragOverlayActiveKey\?\.value === nativeDragOverlayAppointmentKey[\s\S]{0,180}nativeResizeOverlayVisible \|\| nativeDragOverlayVisible[\s\S]{0,40}\? 0/.test(
    agenda,
  ),
  'The source card must stay hidden while the released overlay owns its visual handoff.',
);

assert(
  /component-unmount-active[\s\S]{0,700}nativeDragOverlayActiveKey\.value === nativeDragOverlayAppointmentKey[\s\S]{0,420}nativeDragOverlayActiveKey\.value = '';/.test(
    agenda,
  ),
  'Unmounting the old cell during optimistic commit must atomically retire the overlay.',
);

assert(
  /type NativeWeekDragReleaseCommit =[\s\S]{0,500}buildNativeWeekDragReleasePlacementSignature/.test(
    agenda,
  ) &&
    /useLayoutEffect\(\(\) => \{[\s\S]{0,950}nativeWeekDragReleaseCommitRef\.current[\s\S]{0,950}buildNativeWeekDragReleasePlacementSignature\(committedAppointment\)[\s\S]{0,650}nativeWeekDragOverlayActiveKey\.value = '';/.test(
      agenda,
    ),
  'A layout-commit acknowledgement must clear the handoff without a timeout.',
);

assert(
  /stageNativeWeekDragReleaseCommit\([\s\S]{0,180}optimisticSourceAppointment[\s\S]{0,700}setAppuntamenti\(/.test(
    agenda,
  ) &&
    /stageNativeWeekDragReleaseCommit\([\s\S]{0,180}nextAppointments\[sourceIndex\][\s\S]{0,350}setWeekReorganizationDraft\(nextDraft\)/.test(
      agenda,
    ),
  'Direct moves and composition drafts must both hand off to their optimistic render.',
);

assert(
  /const cancelWeekAppointmentDrag = useCallback\(\(\) => \{[\s\S]{0,180}clearNativeWeekDragReleaseOverlay\(\)/.test(
    agenda,
  ) &&
    /if \(!preview\) \{[\s\S]{0,100}clearNativeWeekDragReleaseOverlay\(\)/.test(
      agenda,
    ),
  'Cancelled and invalid drops must release the frozen overlay immediately.',
);

assert(
  /if \(IS_IOS\) \{[\s\S]{0,420}weekDragRequiredBoundsMeasurementRef\.current =[\s\S]{0,180}weekPlannerBoundsMeasurementRequestRef\.current \+ 1;[\s\S]{0,120}updateWeekPlannerTableOrigin\(\);/.test(
    agenda,
  ) &&
    /IS_IOS &&[\s\S]{0,180}weekPlannerBoundsMeasurementCompletedRef\.current <[\s\S]{0,120}weekDragRequiredBoundsMeasurementRef\.current[\s\S]{0,80}return;/.test(
      agenda,
    ) &&
    !/weekDragRequiredBoundsMeasurementRef\.current =[\s\S]{0,900}weekDragAutoScrollingRef\.current = false;\s*weekDragRequiredBoundsMeasurementRef\.current = 0;\s*if \(!IS_WEB\) \{\s*startNativeWeekAutoScrollRef\.current\(\);/.test(
      agenda,
    ),
  'iOS drag auto-scroll must wait for bounds measured after the current pickup.',
);

assert(
  /const rollbackAppointmentsById = new Map\([\s\S]{0,500}movedAppointmentIds\.has\(appointment\.id\)[\s\S]*?if \(!result\.ok\) \{[\s\S]{0,1800}setAppuntamenti\(\(current\) =>[\s\S]{0,450}const rollback = rollbackAppointmentsById\.get\(appointment\.id\);[\s\S]{0,100}if \(!rollback\) return appointment;[\s\S]{0,550}resolveWeekAppointmentResizeVisualTiming\(rollback\)[\s\S]{0,60}: rollback;/.test(
    agenda,
  ),
  'A real persistence failure must roll back only the moved IDs and preserve unrelated realtime updates.',
);

// Execute the actual key builders and commit callback: matching source text
// alone cannot detect incompatible identifiers ("::" versus "|").
const ts = require('typescript');
const vm = require('node:vm');
const tree = ts.createSourceFile('agenda.tsx', agenda, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const requiredNames = new Set([
  'getWeekInteractionAppointmentKey',
  'buildNativeWeekPreviewAppointmentKey',
  'stageNativeWeekDragReleaseCommit',
]);
const declarations = [];
let directStageCall;
const collect = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && requiredNames.has(node.name.text)) {
    declarations.push(`const ${node.getText(tree)};`);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'runWeekSwap') {
    const collectDirectStage = (child) => {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === 'stageNativeWeekDragReleaseCommit') {
        directStageCall = child.getText(tree);
      }
      ts.forEachChild(child, collectDirectStage);
    };
    collectDirectStage(node);
  }
  ts.forEachChild(node, collect);
};
collect(tree);
assert(declarations.length === requiredNames.size, 'Expected actual handoff declarations.');
assert(directStageCall, 'Expected the actual direct-move handoff call site.');
const context = {
  IS_WEB: false,
  useCallback: (callback) => callback,
  nativeWeekDragReleaseCommitRef: { current: null },
  buildNativeWeekDragReleasePlacementSignature: (appointment) => appointment.ora,
};
vm.createContext(context);
vm.runInContext(ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
for (const phase of ['initial', 'final', 'whole']) {
  context.source = { id: 'appointment-test', renderedPhase: phase === 'whole' ? undefined : phase };
  context.expected = { ...context.source, ora: '10:15' };
  context.preview = { sourceAppointment: context.source };
  context.optimisticSourceAppointment = context.expected;
  vm.runInContext(`
    stageNativeWeekDragReleaseCommit(expected, source, buildNativeWeekPreviewAppointmentKey(source));
    globalThis.draftMatches = nativeWeekDragReleaseCommitRef.current.overlayKey === buildNativeWeekPreviewAppointmentKey(source);
    ${directStageCall};
    globalThis.directMatches = nativeWeekDragReleaseCommitRef.current.overlayKey === buildNativeWeekPreviewAppointmentKey(source);
  `, context);
  assert(context.draftMatches, `Draft must retire the visible ${phase} clone.`);
  assert(context.directMatches, `Direct ${phase} drag must retire its visible native clone.`);
}
assert(
  /stageNativeWeekDragReleaseCommit\(\s*nextAppointments\[sourceIndex\],\s*preview.sourceAppointment,\s*buildNativeWeekPreviewAppointmentKey\(preview.sourceAppointment\)/.test(agenda),
  'The existing draft handoff must retain its visible native overlay key.',
);
console.log('Native Agenda drag release contracts: OK');
