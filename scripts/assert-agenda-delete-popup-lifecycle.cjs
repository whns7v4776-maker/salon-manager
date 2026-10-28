const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const ast = ts.createSourceFile('agenda.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      ['deleteWeekAppointmentFromDetails', 'closeWeekAppointmentDetails'].includes(node.name.text)) {
    callbacks[node.name.text] = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(Object.keys(callbacks).length, 2);
assert.match(callbacks.closeWeekAppointmentDetails, /if \(weekAppointmentDeleteInFlightRef.current\) return/);
assert.match(source, /weekAppointmentDeleteVisualCommitRef.current = null;\s*resolve\?\.\(\);\s*\}, \[weekClearedSlotSettleEpoch\]\)/);
const js = ts.transpileModule(`globalThis.remove = ${callbacks.deleteWeekAppointmentFromDetails}`, {
  compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));

async function scenario({group = false, scope = 'group', result = {ok: true}, throws = false, unmount = false} = {}) {
  const events = [];
  let resolveServer, rejectServer;
  const server = new Promise((resolve, reject) => { resolveServer = resolve; rejectServer = reject; });
  const target = {id: 'a', appointmentGroupId: group ? 'g' : '', servizio: 'Taglio'};
  const context = {
    weekAppointmentDeleteInFlightRef: {current: false},
    weekAppointmentDeleteMountedRef: {current: true},
    weekAppointmentDeleteVisualCommitRef: {current: null},
    weekReorganizationDraftRef: {current: null},
    appuntamenti: group ? [target, {id: 'b', appointmentGroupId: 'g'}] : [target],
    getWeekAppointmentTemporalState: () => 'future',
    Alert: {alert: () => events.push('error')},
    setWeekAppointmentDeletePendingId: value => events.push(typeof value === 'function' ? 'idle' : 'busy'),
    cancelAgendaAppointmentItem: async (_, options) => {
      events.push(`server:${options.linkedCancellationScope}`);
      return server;
    },
    closeWeekAppointmentDetails: () => {
      assert.equal(context.weekAppointmentDeleteInFlightRef.current, false);
      events.push('closed');
    },
    setWeekClearedSlotSettleEpoch: () => events.push('render-requested'),
    presentWeekInteractionConfirmation: (_, __, buttons) => { context.buttons = buttons; },
  };
  vm.createContext(context);
  vm.runInContext(js, context);
  let task = context.remove(target);
  if (group) {
    await task;
    assert.deepEqual(events, [], 'Choosing a scope must not close the details');
    const button = context.buttons[scope === 'phase' ? 1 : 2];
    assert.equal(button.awaitCompletion, true);
    task = button.onPress();
  }
  assert.deepEqual(events, ['busy', `server:${scope}`]);
  await context.remove(target);
  assert.equal(events.filter(e => e.startsWith('server:')).length, 1, 'Double tap cannot launch another deletion');
  if (unmount) context.weekAppointmentDeleteMountedRef.current = false;
  if (throws) rejectServer(new Error('offline')); else resolveServer(result);
  await flush();
  if (result.ok && !throws && !unmount) {
    assert.equal(events.includes('closed'), false, 'Server success alone must not uncover the stale planner');
    assert.equal(context.weekAppointmentDeleteInFlightRef.current, true);
    assert.equal(events.at(-1), 'render-requested');
    events.push('planner-committed');
    context.weekAppointmentDeleteVisualCommitRef.current();
    await task;
    assert.deepEqual(events.slice(-3), ['planner-committed', 'closed', 'idle']);
  } else {
    await task;
    assert.equal(events.includes('closed'), false, 'Failure leaves details open');
    assert.equal(events.includes('render-requested'), false, 'Failure does not suppress the appointment');
    assert.equal(context.weekAppointmentDeleteInFlightRef.current, false, 'Retry is possible');
  }
}
(async () => {
  await scenario();
  await scenario({group: true, scope: 'phase'});
  await scenario({group: true});
  await scenario({result: {ok: false}});
  await scenario({throws: true});
  await scenario({unmount: true});
  console.log('Agenda deletion popup lifecycle: 6 scenarios passed (server wait, render commit, scopes, errors, double tap, unmount).');
})().catch(error => { console.error(error); process.exitCode = 1; });
