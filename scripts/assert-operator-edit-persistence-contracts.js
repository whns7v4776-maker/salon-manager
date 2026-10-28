const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const servicesSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);
const operatorAuthorityMigration = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260904092000_make_canonical_operators_authoritative.sql',
  ),
  'utf8',
);

const sliceBetween = (source, startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const operatorMerge = sliceBetween(
  contextSource,
  'const buildOperatorMergeKey =',
  'const applyAuthoritativeOperatorPublicServices =',
  'operator merge',
);
assert.match(
  operatorMerge,
  /isUuidValue\(normalizedId\)[\s\S]*?`id:\$\{normalizedId\}`/,
  'A rename must retain the canonical UUID as its merge identity.',
);
assert.match(
  operatorMerge,
  /itemId === candidateId[\s\S]*?itemNameKey === normalizeIdentityText\(candidate\.nome\)/,
  'Operator reconciliation must prefer stable IDs and retain a legacy name fallback.',
);

const operatorSync = sliceBetween(
  contextSource,
  'const syncOperatorsTableForWorkspace = React.useCallback',
  'const loadOwnerPrivateServerState = React.useCallback',
  'operator backend sync',
);
assert.match(
  operatorSync,
  /originalOperatorNameKey[\s\S]*?existingByName\.get\(originalOperatorNameKey\)/,
  'Legacy operator IDs must update the row found by the original name during a rename.',
);
assert.match(
  operatorSync,
  /\.eq\('id', id\)[\s\S]*?\.select\('id'\)[\s\S]*?updatedRows\.length !== 1/,
  'A targeted update must verify that exactly one operator row changed.',
);

const persistedSave = sliceBetween(
  contextSource,
  'const saveOperatorsPersisted = React.useCallback',
  'const processPublicSlotWaitlistAndFlush = React.useCallback',
  'persisted operator save',
);
assert.ok(
  persistedSave.indexOf('await syncOperatorsTableForWorkspace') <
    persistedSave.indexOf('setOperatori(() => confirmedOperators)'),
  'The visible operator list must change only after server confirmation.',
);
assert.doesNotMatch(
  contextSource,
  /syncOperatorsTableForWorkspace\(workspaceId, operatori\)/,
  'Hydration and gallery backgrounding must not enqueue a stale whole-catalog operator write.',
);

const photoPicker = sliceBetween(
  servicesSource,
  'const pickImageUriFromGallery = useCallback',
  'const pickOperatorPhotoFromGallery = useCallback',
  'operator photo picker',
);
assert.match(photoPicker, /base64: true/);
assert.match(photoPicker, /`data:\$\{mimeType\};base64,\$\{encodedPhoto\}`/);
assert.doesNotMatch(
  photoPicker,
  /withTimeout\([\s\S]*?launchImageLibraryAsync/,
  'Choosing a photo must not expire while the user is still browsing the gallery.',
);

const operatorSave = sliceBetween(
  servicesSource,
  'const salvaOperatore = async',
  'const avviaModificaOperatore =',
  'operator editor save',
);
assert.match(operatorSave, /originalOperatorName: originalOperator\?\.nome/);
assert.doesNotMatch(
  operatorSave,
  /setOperatori\([^)]*nextOperators[^)]*\)[\s\S]*?await saveOperatorsPersisted/,
  'The editor must not commit its draft before the server confirms it.',
);

const legacySnapshotSync = sliceBetween(
  operatorAuthorityMigration,
  'create or replace function public.sync_workspace_operators_from_portal_v1(',
  'revoke all on function public.sync_workspace_operators_from_portal_v1',
  'legacy snapshot operator sync',
);
assert.doesNotMatch(
  legacySnapshotSync,
  /update\s+public\.operators/i,
  'A stale snapshot must never overwrite an existing canonical operator.',
);
assert.match(
  legacySnapshotSync,
  /A UUID in a snapshot represents an already-known identity[\s\S]*?then\s+continue;/,
  'A stale UUID must not restore an archived operator.',
);
assert.match(
  operatorAuthorityMigration,
  /before insert or update of operatori on public\.client_portals[\s\S]*?protect_client_portal_operator_projection_v1/,
  'The public portal projection must be rebuilt from canonical operators before storage.',
);
assert.match(
  operatorAuthorityMigration,
  /before insert or update of payload on public\.owner_app_snapshots[\s\S]*?protect_owner_snapshot_operator_projection_v1/,
  'The owner snapshot projection must be rebuilt from canonical operators before storage.',
);

console.log('Operator edit persistence contracts: OK');

// Execute the actual normalizer and merge, so a cleared photo cannot silently
// turn into an absent property and recover an older snapshot's image.
const babel = require('@babel/core');
const vm = require('node:vm');
const normalizeSource = sliceBetween(contextSource, 'const normalizeOperatori =', 'const buildServiziSignature =', 'operator normalization');
const mergeSource = sliceBetween(contextSource, 'const mergeOperatoriCollections =', 'const applyAuthoritativeOperatorPublicServices =', 'operator photo merge');
const compiled = babel.transformSync(`${normalizeSource}\n${mergeSource}\nglobalThis.merge = mergeOperatoriCollections;`, {
  filename: 'photo-test.ts', configFile: false, babelrc: false,
  presets: ['@babel/preset-typescript'],
}).code;
const sandbox = {
  normalizeOperatorAvailability: (value) => value,
  normalizeStringIdArray: (value) => value,
  normalizeIdentityText: (value) => value.trim().toLowerCase(),
  resolvePreferredStableId: (remote, local) => local || remote,
};
vm.runInNewContext(compiled, sandbox);
const oldOperator = { id: 'same-operator', nome: 'Maria', mestiere: 'Hair Stylist', fotoUri: 'old-photo' };
const removed = JSON.parse(JSON.stringify({ ...oldOperator, fotoUri: '' }));
assert.equal(sandbox.merge([removed], [oldOperator])[0].fotoUri, '', 'Explicit removal must survive cache serialization and stale snapshots.');
assert.equal(sandbox.merge([{ ...oldOperator, fotoUri: 'new-photo' }], [removed])[0].fotoUri, 'new-photo', 'Replacing a removed photo must still work.');
assert.equal(sandbox.merge([{ ...oldOperator, fotoUri: undefined }], [oldOperator])[0].fotoUri, 'old-photo', 'Missing legacy photo fields must preserve known data.');
assert.match(persistedSave, /options\?\.photoOnly[\s\S]*?\.update\(\{ photo_uri: photoUri \|\| null \}\)[\s\S]*?\.eq\('workspace_id', workspaceId\)[\s\S]*?\.eq\('id', target.id\)[\s\S]*?\.select\('id, photo_uri'\)/);
assert.match(servicesSource, /setOperatorPhotoPreviews[\s\S]*?photoOnly: true/);
console.log('Operator photo removal and replacement regression: OK');
