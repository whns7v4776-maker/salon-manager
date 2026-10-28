const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const optionalColumnGuard = sliceBetween(
  'const isMissingOptionalCompositionColumnError =',
  'type OperatorAvailabilityRangeItem =',
  'optional composition column guard',
);
assert.match(
  optionalColumnGuard,
  /code !== '42703' && code !== 'PGRST204'/,
  'Compatibility fallbacks must run only for a confirmed missing-column error.',
);
assert.match(
  optionalColumnGuard,
  /optionalColumns\.some/,
  'A generic network error must not be mistaken for an old schema.',
);

const loader = sliceBetween(
  "  useEffect(() => {\n    const workspaceId = salonWorkspace.id?.trim() ?? '';\n    let active = true;",
  '  const setPublicCompositionActive = useCallback(',
  'saved composition loader',
);
assert.match(
  loader,
  /if \(result\.error \|\| itemsResult\.error\)/,
  'Compositions may be committed only after both catalogue and membership reads succeed.',
);
const errorStart = loader.indexOf('if (result.error || itemsResult.error)');
const errorEnd = loader.indexOf('const itemsByComposition', errorStart);
assert.ok(errorStart >= 0 && errorEnd > errorStart, 'Missing transient failure branch.');
assert.doesNotMatch(
  loader.slice(errorStart, errorEnd),
  /setPublicCompositionSettings\s*\(/,
  'A transient read failure must preserve the last known-good composition snapshot.',
);
assert.match(
  loader.slice(errorStart, errorEnd),
  /publicCompositionSettingsRetryAttemptRef\.current < 3[\s\S]*?setPublicCompositionSettingsRefreshToken/,
  'A transient first-load failure must retry without requiring a second user action.',
);
assert.match(
  loader,
  /\(itemsResult\.data \?\? \[\]\)/,
  'A successful canonical membership read must be used as the complete item source.',
);
assert.match(
  loader,
  /items: itemsByComposition\.get\(item\.id\) \?\? \[\]/,
  'A confirmed empty membership must stay empty instead of restoring deleted items.',
);
assert.match(
  loader,
  /publicCompositionSettingsWorkspaceRef\.current !== workspaceId[\s\S]*?setPublicCompositionSettings\(\[\]\)/,
  'Changing account/workspace must clear the previous account snapshot.',
);
assert.match(
  loader,
  /useFocusEffect\([\s\S]*?setPublicCompositionSettingsRefreshToken/,
  'Returning to Services must refresh the canonical snapshot.',
);
for (const table of ['service_compositions', 'service_composition_items']) {
  assert.match(
    loader,
    new RegExp(`table: '${table}'[\\s\\S]*?scheduleRefresh`),
    `Realtime changes from ${table} must invalidate and reread the canonical snapshot.`,
  );
}
assert.doesNotMatch(
  loader,
  /scheduleRefresh\s*=\s*\([^)]*payload/,
  'Realtime payloads must not reconstruct memberships; they only trigger a canonical reread.',
);

const applyCompleteSnapshot = (current, snapshot) => {
  if (snapshot.compositionsError || snapshot.itemsError) return current;
  const itemsByComposition = new Map();
  snapshot.items.forEach((item) => {
    const currentItems = itemsByComposition.get(item.compositionId) ?? [];
    currentItems.push({ serviceId: item.serviceId });
    itemsByComposition.set(item.compositionId, currentItems);
  });
  return snapshot.compositions.map((composition) => ({
    ...composition,
    items: itemsByComposition.get(composition.id) ?? [],
  }));
};

const lastKnownGood = [
  {
    id: 'combo-1',
    name: 'Taglio + Barba',
    items: [{ serviceId: 'taglio' }, { serviceId: 'barba' }],
  },
];
assert.strictEqual(
  applyCompleteSnapshot(lastKnownGood, {
    compositionsError: false,
    itemsError: true,
    compositions: lastKnownGood,
    items: [],
  }),
  lastKnownGood,
  'A transient membership failure must keep the exact last known-good state.',
);
assert.deepEqual(
  applyCompleteSnapshot(lastKnownGood, {
    compositionsError: false,
    itemsError: false,
    compositions: [{ id: 'combo-1', name: 'Taglio + Barba' }],
    items: [],
  }),
  [{ id: 'combo-1', name: 'Taglio + Barba', items: [] }],
  'A confirmed membership deletion must not be recreated from the old state.',
);
assert.deepEqual(
  applyCompleteSnapshot(lastKnownGood, {
    compositionsError: false,
    itemsError: false,
    compositions: [],
    items: [],
  }),
  [],
  'A confirmed composition deletion must remove it.',
);

console.log('Service composition loading resilience contracts passed.');
