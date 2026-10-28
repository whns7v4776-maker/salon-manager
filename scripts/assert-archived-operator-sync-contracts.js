const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const archiveFilter = sliceBetween(
  'const excludeArchivedOperators =',
  'const filterRecentlyDeletedOperators =',
  'archived operator filter',
);
assert.match(
  archiveFilter,
  /archivedIds[\s\S]*?archivedNameKeys[\s\S]*?normalizeIdentityText\(item\.nome\)/,
  'Archived operators must be recognized by canonical ID and normalized name.',
);
assert.match(
  archiveFilter,
  /!archivedIds\.has\(item\.id\.trim\(\)\)[\s\S]*?!archivedNameKeys\.has\(normalizeIdentityText\(item\.nome\)\)/,
  'A stale local UUID must not bypass an archived name.',
);

const archivedSetter = sliceBetween(
  'const setOperatoriArchiviati = useCallback',
  'const pendingOperatorPublicServiceAssignmentsRef =',
  'archived operator setter',
);
assert.match(
  archivedSetter,
  /recentlyCreatedOperatorItemsRef\.current\.forEach[\s\S]*?excludeArchivedOperators\(\[entry\.item\], normalizedNextValue\)[\s\S]*?\.delete\(key\)/,
  'Applying an archive must remove only matching entries from the recent-create guard.',
);
assert.ok(
  archivedSetter.indexOf('operatoriArchiviatiRef.current = normalizedNextValue') <
    archivedSetter.indexOf('setOperatoriArchiviatiState(normalizedNextValue)'),
  'The archive ref must become authoritative before queued active state updates run.',
);

const activeSetter = sliceBetween(
  'const setOperatori = useCallback',
  'const [macchinari, setMacchinari]',
  'active operator setter',
);
assert.match(
  activeSetter,
  /excludeArchivedOperators\(\s*guardedNextValue,\s*operatoriArchiviatiRef\.current,\s*\)/,
  'Every active operator update must pass through the current archive guard.',
);

const accountReset = sliceBetween(
  'const clearRuntimeDataForAccount = React.useCallback',
  'const syncAuthenticatedWorkspace = React.useCallback',
  'account runtime reset',
);
[
  'recentlyCreatedServiceItemsRef.current.clear()',
  'recentlyCreatedOperatorItemsRef.current.clear()',
  'recentlyDeletedServiceKeysRef.current.clear()',
  'recentlyDeletedOperatorKeysRef.current.clear()',
  'previousOperatorMergeKeysRef.current.clear()',
  "servicesInboundSignatureRef.current = ''",
  'serviziRef.current = normalizeServizi([])',
  'operatoriRef.current = normalizeOperatori([])',
  'operatoriArchiviatiRef.current = normalizeOperatori([])',
].forEach((contract) => {
  assert.ok(
    accountReset.includes(contract),
    `Account changes must reset transient catalog state: ${contract}`,
  );
});

const backgroundRefine = sliceBetween(
  'const refreshedPrivateServerState =',
  '} catch (portalSyncError)',
  'authenticated background refine',
);
assert.match(
  backgroundRefine,
  /const refreshedArchivedOperatori = normalizeOperatori\([\s\S]*?operatoriArchiviati[\s\S]*?restoredOperatoriArchiviati/,
  'The background refine must load the latest authoritative archive.',
);
assert.match(
  backgroundRefine,
  /const mergedOperatori = excludeArchivedOperators\([\s\S]*?refreshedArchivedOperatori/,
  'The background merge must remove archived operators before cache or state.',
);
assert.match(
  backgroundRefine,
  /STORAGE_KEYS\.operatori_archiviati[\s\S]*?JSON\.stringify\(refreshedArchivedOperatori\)/,
  'The confirmed archive must replace the device archive cache.',
);
assert.ok(
  backgroundRefine.indexOf(
    'setOperatoriArchiviati(refreshedArchivedOperatori)',
  ) < backgroundRefine.indexOf('setOperatori(mergedOperatori)'),
  'The archive must be applied before the active operator collection.',
);

const normalizeName = (value) => value.trim().toLocaleLowerCase('it-IT');
const excludeArchivedFixture = (activeItems, archivedItems) => {
  const archivedIds = new Set(archivedItems.map((item) => item.id.trim()));
  const archivedNames = new Set(
    archivedItems.map((item) => normalizeName(item.nome)),
  );
  return activeItems.filter(
    (item) =>
      !archivedIds.has(item.id.trim()) &&
      !archivedNames.has(normalizeName(item.nome)),
  );
};

const fixtureResult = excludeArchivedFixture(
  [
    { id: 'edoardo-id', nome: 'Edoardo' },
    { id: 'stale-local-giorgia-id', nome: ' GIORGIA ' },
    { id: 'new-local-luca-id', nome: 'Luca' },
  ],
  [{ id: 'canonical-giorgia-id', nome: 'Giorgia' }],
);
assert.deepEqual(
  fixtureResult.map((item) => item.nome.trim()),
  ['Edoardo', 'Luca'],
  'A stale archived duplicate must disappear while an unrelated unsynced operator remains.',
);

console.log('Archived operator sync contracts passed.');
