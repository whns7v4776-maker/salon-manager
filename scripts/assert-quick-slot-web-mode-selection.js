const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
const ast = ts.createSourceFile('agenda.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing ${name}`);
  return ts.transpileModule(`(${found.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const switchMode = callback('selectQuickBookingMode');
const selectService = callback('selectQuickBookingService');
const toggleComponent = callback('toggleQuickBookingPackageService');
let validateSelection;
function findValidation(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const effect = node.arguments[0];
    if (effect && effect.getText(ast).includes('setQuickBookingPendingServices([])') &&
        effect.getText(ast).includes('quickBookingSelectableServices.some')) {
      validateSelection = ts.transpileModule(`(${effect.getText(ast)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
    }
  }
  ts.forEachChild(node, findValidation);
}
findValidation(ast);
assert.ok(validateSelection, 'Missing catalog selection validation effect');
function session(web) {
  const state = {
    IS_WEB: web,
    quickBookingPackageMode: false,
    quickBookingModeChosen: true,
    quickBookingAutoPromotedModeRef: { current: false },
    quickBookingServiceId: 'single-a',
    quickBookingOperatorId: 'operator-a',
    quickBookingCustomerId: 'customer-a',
    quickSlotDraft: { dateValue: '2026-09-14', time: '09:30' },
    quickBookingPendingServices: [{ id: 'created-catalog-component' }],
    quickBookingPackageServiceIds: [],
    quickBookingPackagePauseMinutes: {},
    quickBookingPackageDurationOverrides: {},
    quickBookingPackagePriceOverrides: {},
    quickBookingPackageOperatorOverrides: {},
    quickBookingPackagePhaseOverrides: {},
    quickBookingPackageEditorAppliedServiceIds: new Set(),
    quickBookingPackageAutoFitOperators: true,
    quickBookingPackageDragPreviewRef: { current: null },
    quickBookingPackageIdempotencyRef: { current: 'previous' },
    Keyboard: { dismiss() {} },
    requestAnimationFrame: fn => fn(),
    releaseAgendaParentSwipe() {},
    resolveQuickBookingServiceSelection: id => ({ selectedService: { id, nome: id }, serviceIds: [id], autoFitOperators: true }),
  };
  for (const setter of source.matchAll(/\b(setQuick\w+)\(/g)) {
    const key = setter[1][3].toLowerCase() + setter[1].slice(4);
    state[setter[1]] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  const context = vm.createContext(state);
  const validate = () => vm.runInContext(validateSelection, context)();
  return {
    state,
    validate,
    mode(value) {
      vm.runInContext(switchMode, context)(value);
      state.quickBookingSelectableServices = (value
        ? ['component-b', 'component-c'] : ['single-a', 'single-d']).map(id => ({ id }));
      validate();
    },
    service: value => vm.runInContext(selectService, context)(value),
    component: value => vm.runInContext(toggleComponent, context)(value),
  };
}

for (const isWeb of [true, false]) {
  const current = session(isWeb);
  const sharedContext = JSON.stringify([
    current.state.quickBookingCustomerId,
    current.state.quickSlotDraft,
    current.state.quickBookingPendingServices,
  ]);
  current.mode(false);
  assert.equal(current.state.quickBookingServiceId, 'single-a', 'Tapping the active mode keeps the current choice');

  current.mode(true);
  assert.equal(current.state.quickBookingServiceId, '', 'Entering composition clears the single service');
  assert.equal(current.state.quickBookingOperatorId, '');
  assert.equal(current.state.quickBookingPackageServiceIds.length, 0, 'No single service is imported');
  current.component('component-b');
  current.component('component-c');
  assert.deepEqual(Array.from(current.state.quickBookingPackageServiceIds), ['component-b', 'component-c']);
  Object.assign(current.state, {
    quickBookingPackagePauseMinutes: { 'component-b': 10 },
    quickBookingPackageDurationOverrides: { 'component-b': 45 },
    quickBookingPackagePriceOverrides: { 'component-b': 25 },
    quickBookingPackageOperatorOverrides: { 'component-b': 'operator-b' },
    quickBookingPackagePhaseOverrides: { 'component-b': null },
    quickBookingPackageEditorAppliedServiceIds: new Set(['component-b']),
    quickBookingPackageEditorDraft: { serviceId: 'component-b' },
    quickBookingPackageAutoFitOperators: false,
  });
  current.mode(true);
  assert.equal(current.state.quickBookingPackageServiceIds.length, 2, 'Tapping the active composition must not clear its components');
  current.mode(false);
  assert.equal(current.state.quickBookingServiceId, '', 'Returning to single starts empty');
  assert.equal(current.state.quickBookingPackageServiceIds.length, 0, 'Leaving composition clears every component');
  for (const key of ['PauseMinutes', 'DurationOverrides', 'PriceOverrides', 'OperatorOverrides', 'PhaseOverrides']) {
    assert.equal(Object.keys(current.state['quickBookingPackage' + key]).length, 0, key + ' must not leak between modes');
  }
  assert.equal(current.state.quickBookingPackageEditorAppliedServiceIds.size, 0);
  assert.equal(current.state.quickBookingPackageEditorDraft, null);
  assert.equal(current.state.quickBookingPackageAutoFitOperators, true);
  for (let i = 0; i < 3; i++) {
    current.service('single-d');
    current.mode(true);
    assert.equal(current.state.quickBookingServiceId, '');
    assert.equal(current.state.quickBookingPackageServiceIds.length, 0);
    current.component('component-b');
    current.mode(false);
    assert.equal(current.state.quickBookingServiceId, '');
    assert.equal(current.state.quickBookingPackageServiceIds.length, 0);
  }
  assert.equal(JSON.stringify([current.state.quickBookingCustomerId, current.state.quickSlotDraft, current.state.quickBookingPendingServices]), sharedContext, 'Customer, slot and catalog records remain intact');
  current.service('single-a');
  current.state.quickBookingSelectableServices = [];
  current.validate();
  assert.equal(current.state.quickBookingServiceId, '', 'Unavailable catalog choices are still invalidated');
}
console.log('Quick-slot modes: web and native start empty on switching; active mode, customer, slot and catalog preserved.');

for (const isWeb of [true, false]) {
  const current = session(isWeb);
  current.state.resolveQuickBookingServiceSelection = id => ({
    selectedService: { id, nome: id }, serviceIds: ['linked-a', 'linked-b'],
    durationOverrides: {}, priceOverrides: {}, pauseMinutes: {}, phaseOverrides: {}, autoFitOperators: true,
  });
  current.service('linked-single');
  assert.equal(current.state.quickBookingPackageMode, true);
  assert.equal(current.state.quickBookingPackageServiceIds.length, 2);
  current.mode(true);
  assert.equal(current.state.quickBookingPackageServiceIds.length, 0, 'Explicit composition clears auto-expanded single service');
  current.state.resolveQuickBookingServiceSelection = id => ({ selectedService: { id }, serviceIds: [id] });
  current.component('component-b');
  current.component('component-c');
  assert.deepEqual(Array.from(current.state.quickBookingPackageServiceIds), ['component-b', 'component-c'], 'Visible components restart at phase 1 and 2, not 3 and 4');
  current.mode(true);
  assert.equal(current.state.quickBookingPackageServiceIds.length, 2, 'Subsequent taps on the chosen mode preserve edits');
}
console.log('Linked-service automatic promotion: explicit composition starts at phase 1 on web and native.');

for (const isWeb of [true, false]) {
 const current = session(isWeb);
 current.state.quickBookingModeChosen = false;
 current.state.quickBookingServiceId = '';
 current.mode(false);
 assert.equal(current.state.quickBookingModeChosen, true, 'First single tap enables booking');
 assert.equal(current.state.quickBookingPackageMode, false);
 current.service('single-d');
 current.mode(false);
 assert.equal(current.state.quickBookingServiceId, 'single-d', 'Chosen mode cannot deselect');
 current.mode(true);
 assert.equal(current.state.quickBookingServiceId, '');
 assert.equal(current.state.quickBookingModeChosen, true);
}
console.log('Initial mode choice and mutually exclusive selection OK.');
