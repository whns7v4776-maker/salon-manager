const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the normalizer as well as the rendering boundary: a stale app can
// receive the correct server choice and still replace it before rendering.
const previousTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
let normalizeAvailabilitySettings;
try {
  ({ normalizeAvailabilitySettings } = require('../src/lib/booking.ts'));
} finally {
  if (previousTsLoader) require.extensions['.ts'] = previousTsLoader;
  else delete require.extensions['.ts'];
}

const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const start = source.indexOf('  const hasGuidedRecommendations =');
const end = source.indexOf('  const frontendTimeSlotUnavailableReasonMap =', start);
assert.ok(start >= 0 && end > start, 'Customer slot visibility boundary exists');
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const defaults = {
  guidedRecommendedTimeSlots: ['09:00', '10:00'],
  guidedSlotsActive: true,
  guidedSlotsStrategy: 'intelligent',
  guidedSlotsVisibility: 'recommended_and_all',
  ora: '09:15',
  isCurrentWorkspaceSalon: false,
  isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery: true,
  bookableFrontendTimeSlots: ['09:00', '09:15', '10:00'],
  displayTimeSlots: ['09:00', '09:15', '09:30', '10:00'],
  selectedUnavailableFrontendSlot: null,
  showAllGuidedSlots: false,
  shouldShowLiveSlotLoadingState: false,
};
function run(changes = {}) {
  const values = { ...defaults, ...changes };
  values.visibleGuidedRecommendedTimeSlots = changes.visibleGuidedRecommendedTimeSlots ?? values.guidedRecommendedTimeSlots;
  let cleared = false;
  values.useMemo = (callback) => callback();
  values.useEffect = (callback) => callback();
  values.setOra = (value) => { cleared = value === ''; };
  values.isFrontendSlotBookable = (time) => values.bookableFrontendTimeSlots.includes(time);
  const result = new Function(...Object.keys(values), `${compiled}
    return { shouldShowGuidedRecommendations, shouldShowOnlyRecommendedSlots,
      shouldShowExpandedTimeGrid, visibleExpandedFrontendTimeSlots, presentedExpandedTimeSlots, shouldRenderExpandedTimeGrid };`
  )(...Object.values(values));
  return { ...result, cleared };
}
assert.deepEqual(run().visibleExpandedFrontendTimeSlots, defaults.bookableFrontendTimeSlots,
  'Recommendations plus all keeps every available start and hides occupied starts');
assert.equal(run().shouldShowGuidedRecommendations, true);
assert.deepEqual(run().presentedExpandedTimeSlots, ['09:15'], 'The additional list omits duplicated recommendations without losing valid starts');
assert.equal(run().cleared, false, 'An available nonrecommended choice stays valid in full visibility');
assert.equal(run({ guidedSlotsVisibility: 'recommended_first' }).shouldShowExpandedTimeGrid, false);
assert.deepEqual(run({ guidedSlotsVisibility: 'recommended_first', showAllGuidedSlots: true }).visibleExpandedFrontendTimeSlots,
  defaults.bookableFrontendTimeSlots, 'Recommendations first can open all bookable starts');
assert.equal(run({ guidedSlotsVisibility: 'recommended_first' }).cleared, false);
assert.equal(run({ guidedSlotsVisibility: 'recommended_only' }).shouldShowOnlyRecommendedSlots, true);
assert.deepEqual(run({ guidedSlotsVisibility: 'recommended_only' }).visibleExpandedFrontendTimeSlots, []);
assert.equal(run({ guidedSlotsVisibility: 'recommended_only' }).cleared, true,
  'Strict visibility removes only a live available selection outside recommendations');
assert.equal(run({ guidedSlotsVisibility: 'recommended_only', ora: '09:00' }).cleared, false);
assert.equal(run({ guidedSlotsVisibility: 'recommended_only', isLivePublicSlotAvailabilityAuthoritativeForCurrentQuery: false }).cleared, false,
  'Loading authority cannot prematurely erase the selection');
for (const visibility of ['recommended_and_all', 'recommended_first', 'recommended_only']) {
  assert.deepEqual(run({ guidedSlotsActive: false, guidedSlotsVisibility: visibility }).visibleExpandedFrontendTimeSlots,
    defaults.bookableFrontendTimeSlots, 'Disabling recommendations preserves ordinary availability');
}
assert.deepEqual(run({ guidedRecommendedTimeSlots: [] }).visibleExpandedFrontendTimeSlots, defaults.bookableFrontendTimeSlots);
assert.deepEqual(run({ selectedUnavailableFrontendSlot: '09:30' }).visibleExpandedFrontendTimeSlots, defaults.displayTimeSlots,
  'Only the selected stale slot remains visible to explain its unavailability');

for (const strategy of ['intelligent', 'balanced', 'fill_gaps', 'protect_long_services']) {
  for (const visibility of ['recommended_and_all', 'recommended_first', 'recommended_only']) {
    const serverSettings = { guidedSlotsEnabled: true, guidedSlotsStrategy: strategy, guidedSlotsVisibility: visibility };
    const loadedSettings = normalizeAvailabilitySettings(JSON.parse(JSON.stringify(serverSettings)));
    const cachedSettings = normalizeAvailabilitySettings(JSON.parse(JSON.stringify(loadedSettings)));
    assert.equal(cachedSettings.guidedSlotsVisibility, visibility,
      'Server and cached visibility must survive normalization for every recommendation strategy');
    const result = run({ guidedSlotsStrategy: cachedSettings.guidedSlotsStrategy,
      guidedSlotsVisibility: cachedSettings.guidedSlotsVisibility });
    assert.equal(result.shouldShowExpandedTimeGrid, visibility === 'recommended_and_all',
      'The actual server choice must reach the customer grid');
  }
}

const ownerSource = fs.readFileSync('app/(tabs)/prenotazioni.tsx', 'utf8');
const disabledExpression = ownerSource.match(/const choiceDisabled = ([^;]+);/)?.[1];
assert.ok(disabledExpression, 'Owner visibility controls exist');
for (const strategy of ['intelligent', 'balanced', 'fill_gaps', 'protect_long_services']) {
  for (const key of ['recommended_and_all', 'recommended_first', 'recommended_only']) {
    const disabled = new Function('displayedGuidedSlotsEnabled', 'guidedSaving', 'displayedGuidedSlotsStrategy', 'option',
      `return ${disabledExpression}`);
    assert.equal(disabled(true, false, strategy, { key }), false, 'All choices can be selected');
    assert.equal(disabled(true, true, strategy, { key }), true, 'Saving prevents overlapping writes');
    assert.equal(disabled(false, false, strategy, { key }), true, 'Inactive guidance keeps controls disabled');
  }
}
console.log('PASS: actual customer visibility covers all/first/only, availability authority, stale choices, inactive guidance and all owner controls.');
