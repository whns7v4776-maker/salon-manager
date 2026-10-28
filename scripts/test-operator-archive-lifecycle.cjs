const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const between = (start, end) => {
  const offset = source.indexOf(start);
  assert.notEqual(offset, -1, `Missing ${start}`);
  const limit = source.indexOf(end, offset + start.length);
  assert.notEqual(limit, -1, `Missing ${end}`);
  return source.slice(offset, limit);
};
const snippet = between(
  '  const saveOperatorsPersisted = React.useCallback(',
  '  const processPublicSlotWaitlistAndFlush = React.useCallback(',
);
const compiled = ts.transpileModule(snippet, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const A = { id: '11111111-1111-4111-8111-111111111111', nome: 'Demo A' };
const B = { id: '22222222-2222-4222-8222-222222222222', nome: 'Demo B' };
const clone = (v) => JSON.parse(JSON.stringify(v));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(active, archived) {
  const writes = [], canonicalCalls = [];
  const canonical = deferred();
  const env = {
    React: { useCallback: (fn) => fn },
    salonWorkspaceRef: { current: { id: 'workspace', ownerEmail: 'test@example.invalid' } },
    salonAccountEmail: 'test@example.invalid', isAuthenticated: true, hasInitializedAuth: true,
    normalizeAccountEmail: (v) => v, isWorkspaceAccessible: () => true,
    isUuidValue: (v) => /^[a-f0-9-]{36}$/.test(v) || v === 'workspace',
    normalizeOperatori: clone, mergeOperatoriCollections: (_, items) => items,
    operatoriRef: { current: clone(active) }, operatoriArchiviatiRef: { current: clone(archived) },
    operatorsBackendSyncDebounceRef: { current: null }, portalPublishDebounceRef: { current: null },
    ownerSnapshotSyncDebounceRef: { current: null },
    colorOverridesSyncDebounceRef: { current: null },
    pendingOwnerSnapshotSyncRef: { current: new Map() },
    operatorsPersistenceQueueRef: { current: Promise.resolve() },
    operatorsRemoteWritePendingRef: { current: 0 }, operatorsMutationRevisionRef: { current: 0 },
    clientiRef: { current: [] }, appuntamentiRef: { current: [] }, serviziRef: { current: [] },
    richiestePrenotazioneRef: { current: [] }, availabilitySettingsRef: { current: {} },
    serviceCardColorOverridesRef: { current: {} }, roleCardColorOverridesRef: { current: {} },
    movimenti: [], macchinari: [], carteCollegate: [], eventi: [], messaggioEventoTemplate: '',
    AsyncStorage: { setItem: async () => {} }, buildScopedStorageKey: (key) => key,
    STORAGE_KEYS: { operatori: 'active', operatori_archiviati: 'archived' },
    shouldSilenceTransientSyncError: () => true, console,
    syncOperatorsTableForWorkspace: (...args) => { canonicalCalls.push(args); return canonical.promise; },
    syncOwnerSnapshotForWorkspace: (_, payload) => {
      const pending = deferred(); writes.push({ payload: clone(payload), ...pending });
      return pending.promise;
    },
    enqueuePortalPublish: async () => {},
  };
  env.setOperatoriArchiviati = (items) => { env.operatoriArchiviatiRef.current = clone(items); };
  env.setOperatori = (updater) => {
    const items = typeof updater === 'function' ? updater(env.operatoriRef.current) : updater;
    env.operatoriRef.current = clone(items.filter((item) =>
      !env.operatoriArchiviatiRef.current.some((archivedItem) => archivedItem.id === item.id)));
  };
  const fn = new Function(...Object.keys(env), `${compiled}; return saveOperatorsPersisted;`)(...Object.values(env));
  return { fn, env, writes, canonical, canonicalCalls };
}

(async () => {
  // Archiving may remove the active row only after the recovery copy is durable.
  const h = harness([A, B], [A]);
  const archive = h.fn([B], { archivedOperatorId: A.id, archivedOperatorName: A.nome, archivedOperators: [A] });
  await tick();
  assert.equal(h.writes.length, 1, 'Persist the recovery archive before deleting the active row');
  assert.equal(h.canonicalCalls.length, 0, 'No canonical removal before archive confirmation');
  assert.deepEqual(h.writes[0].payload.operatoriArchiviati, [A]);
  h.writes[0].resolve(); await tick();
  assert.equal(h.canonicalCalls.length, 1);
  h.canonical.resolve(); await tick();
  assert.equal(h.writes.length, 2);
  assert.equal(h.env.operatorsRemoteWritePendingRef.current, 1, 'Hold refresh protection through archive persistence');
  h.writes[1].resolve(); assert.equal((await archive).ok, true);
  assert.deepEqual(h.env.operatoriRef.current, [B]);
  assert.deepEqual(h.env.operatoriArchiviatiRef.current, [A]);

  const failed = harness([A, B], [A]);
  const rejectedArchive = failed.fn([B], { archivedOperatorId: A.id, archivedOperators: [A] });
  await tick(); failed.writes[0].reject(new Error('offline'));
  assert.equal((await rejectedArchive).ok, false);
  assert.equal(failed.canonicalCalls.length, 0, 'A failed recovery copy must not remove the operator');

  // Restore must save the archive *without* A, then release the active-list guard.
  const r = harness([B], [A]);
  const restore = r.fn([A, B], { targetOperatorId: A.id, targetOperatorName: A.nome, archivedOperators: [] });
  await tick(); r.canonical.resolve(); await tick();
  assert.equal(r.writes.length, 1);
  assert.deepEqual(r.writes[0].payload.operatoriArchiviati, []);
  assert.equal(r.env.operatorsRemoteWritePendingRef.current, 1);
  r.writes[0].resolve(); assert.equal((await restore).ok, true);
  assert.deepEqual(r.env.operatoriArchiviatiRef.current, []);
  assert.deepEqual(r.env.operatoriRef.current, [A, B], 'Restored identity must survive the archive filter');

  const failedRestore = harness([B], [A]);
  const rejectedRestore = failedRestore.fn([A, B], { targetOperatorId: A.id, archivedOperators: [] });
  await tick(); failedRestore.canonical.resolve(); await tick();
  failedRestore.writes[0].reject(new Error('offline'));
  assert.equal((await rejectedRestore).ok, false);
  assert.deepEqual(failedRestore.env.operatoriArchiviatiRef.current, [A], 'Failed restoration retains the recovery entry');
  assert.deepEqual(failedRestore.env.operatoriRef.current, [B]);

  // Execute the screen rollback with the same archive filter as the provider.
  const screen = fs.readFileSync('app/(tabs)/servizi.tsx', 'utf8');
  const rollbackStart = screen.indexOf('      if (!result.ok) {', screen.indexOf('  const archiveOperatorPersisted = useCallback('));
  const rollbackEnd = screen.indexOf('        throw new Error(', rollbackStart);
  const rollback = screen.slice(rollbackStart + '      if (!result.ok) {'.length, rollbackEnd);
  const localArchive = harness([B], [A]);
  new Function('setOperatori', 'setOperatoriArchiviati', 'operatori', 'previousArchivedOperators', rollback)(
    localArchive.env.setOperatori, localArchive.env.setOperatoriArchiviati, [A, B], [],
  );
  assert.deepEqual(localArchive.env.operatoriRef.current, [A, B], 'Rollback must clear the archive filter before recovering the active card');

  // Execute the actual row classification: an archived canonical UUID is an INSERT.
  const operatorSyncStart = source.indexOf('  const syncOperatorsTableForWorkspace = React.useCallback(');
  const planStart = source.indexOf('        const rowsToInsert = rowsToUpsert', operatorSyncStart);
  const planEnd = source.indexOf('        const archivedOperatorIds = new Set(', planStart);
  const plans = source.slice(planStart, planEnd);
  const planCode = ts.transpileModule(plans, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const plan = new Function('rowsToUpsert', 'matchedExistingIds', `${planCode}; return {rowsToInsert, rowsToUpdate};`);
  const result = plan([A, B, { nome: 'New local' }], new Set([B.id]));
  assert.deepEqual(result.rowsToInsert.map((item) => item.nome), ['Demo A', 'New local']);
  assert.equal(result.rowsToInsert[0].id, A.id, 'Restoration must retain the stable UUID and service policies');
  assert.deepEqual(result.rowsToUpdate.map((item) => item.id), [B.id]);

  // Execute the refresh guard used by both archive and active collections.
  const guardMatch = source.match(/const canApplyFetchedOperators =([\s\S]*?);/);
  assert.ok(guardMatch, 'Protect both collections from an older in-flight refresh');
  const guard = new Function('operatorsRemoteWritePendingRef', 'operatorsMutationRevisionRef', 'operatorMutationRevisionAtStart', `return (${guardMatch[1]});`);
  assert.equal(guard({ current: 1 }, { current: 2 }, 2), false);
  assert.equal(guard({ current: 0 }, { current: 2 }, 1), false);
  assert.equal(guard({ current: 0 }, { current: 2 }, 2), true);
  console.log('PASS: archive durability, failure before removal, restore identity, stale refresh guard.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
