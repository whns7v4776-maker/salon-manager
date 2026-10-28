/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const servicesScreenSource = fs.readFileSync(
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

const syncServices = sliceBetween(
  'const syncServicesTableForWorkspace = React.useCallback(',
  'const saveRoleCardColorOverridePersisted = React.useCallback(',
  'service catalogue persistence',
);

assert.match(
  syncServices,
  /const missingCurrentRows = currentRows\.filter\([\s\S]*?!matchedExistingIds\.has\(item\.id\)/,
  'A partial client payload must identify, not silently delete, server-only services.',
);
assert.match(
  syncServices,
  /if \(!options\?\.deletedService && missingCurrentRows\.length > 0\) \{[\s\S]*?cancellazione backend ignorata/,
  'Server-only services must remain untouched unless one exact deletion was requested.',
);

assert.match(
  syncServices,
  /const deleteRowsMatchingStableId =[\s\S]*?item\.id === deletedServiceId/,
  'An explicit service deletion must prefer the stable UUID.',
);
assert.match(
  syncServices,
  /const rowsToDelete = options\?\.deletedService[\s\S]*?deleteRowsMatchingStableId\.length > 0[\s\S]*?deleteRowsMatchingIdentity/,
  'Identity fallback may run only when the requested stable UUID is unavailable.',
);
assert.match(
  syncServices,
  /if \(options\?\.deletedService && rowsToDelete\.length > 1\)[\s\S]*?più servizi corrispondono alla richiesta/,
  'An ambiguous deletion must abort instead of removing multiple services.',
);
assert.match(
  syncServices,
  /\.from\('services'\)[\s\S]*?\.delete\(\)[\s\S]*?\.in\('id', rowsToDelete\)/,
  'The destructive write must target only the resolved service IDs.',
);
assert.match(
  syncServices,
  /const deletedTargetStillExists = activeCanonicalRows\.some\([\s\S]*?Eliminazione componente non confermata dal server/,
  'Deletion must be reported only after a canonical reread confirms target absence.',
);

const canonicalReconciliation = sliceBetween(
  'const { data: canonicalRows, error: canonicalRowsError } =',
  'lastServicesBackendSyncSignatureRef.current = syncSignature;',
  'canonical service reconciliation',
);

const canonicalSelectMatch = canonicalReconciliation.match(
  /\.select\(\s*(['"])([^'"]+)\1\s*,?\s*\)/,
);
assert.ok(
  canonicalSelectMatch,
  'The canonical service reread must expose an explicit field list.',
);
const canonicalSelectFields = new Set(
  canonicalSelectMatch[2].split(',').map((field) => field.trim()),
);
for (const field of [
  'id',
  'superseded_by_composition_id',
  'linked_service_config',
  'discount_weekdays',
  'name',
  'description',
  'price',
  'original_price',
  'discount_enabled',
  'discount_valid_from',
  'discount_valid_to',
  'discount_start_time',
  'discount_end_time',
  'duration_minutes',
  'required_role',
  'client_badge',
  'client_role_display_order',
  'client_display_order',
  'is_online',
  'composition_only',
  'composition_source_kind',
  'composition_source_service_id',
  'composition_source_phase',
  'phase_config',
]) {
  assert.ok(
    canonicalSelectFields.has(field),
    `The canonical service reread must include ${field}.`,
  );
}
assert.match(
  canonicalReconciliation,
  /const canonicalRequestedServices = normalizeServizi\([\s\S]*?normalizedServices\.map/,
  'The requested payload must be remapped to canonical server IDs.',
);
assert.match(
  canonicalReconciliation,
  /const canonicalServerServices = normalizeServizi\([\s\S]*?activeCanonicalRows\s*\.map/,
  'Every active row from the canonical server reread must enter reconciliation.',
);
assert.match(
  canonicalReconciliation,
  /const canonicalServerServices = normalizeServizi\([\s\S]*?buildOwnerServiceFromRealtimeRow/,
  'Canonical rows must use the complete shared server-row mapper.',
);
const realtimeServiceMapper = sliceBetween(
  'const buildOwnerServiceFromRealtimeRow =',
  'const buildOwnerCustomerFromRealtimeRow =',
  'canonical service row mapper',
);
assert.match(
  realtimeServiceMapper,
  /disponibileOnline:\s*typeof row\.is_online === 'boolean'\s*\? row\.is_online\s*:\s*true/,
  'Canonical server rows must preserve both online and archived services.',
);
assert.match(
  canonicalReconciliation,
  /const canonicalRequestedServiceUpdates =[\s\S]*?explicitlyChangedCanonicalServiceIds[\s\S]*?canonicalRequestedServices\.filter/,
  'An explicit save must overlay only the exact requested service IDs, never unrelated stale client rows.',
);
assert.match(
  canonicalReconciliation,
  /const reconciledCanonicalServices = normalizeServizi\(\s*mergeServiziCollections\(\s*canonicalRequestedServiceUpdates,\s*canonicalServerServices,?\s*\),?\s*\)/,
  'The final list must overlay only confirmed requested edits onto the complete canonical server catalogue.',
);
assert.match(
  syncServices,
  /return reconciledCanonicalServices;/,
  'Persistence must return the reconciled full catalogue, not the partial request payload.',
);

const persistedSave = sliceBetween(
  'const saveServicesPersisted = React.useCallback(',
  'const saveOperatorsPersisted = React.useCallback(',
  'persisted service save',
);
assert.match(
  persistedSave,
  /const canonicalServices =[\s\S]*?await syncServicesTableForWorkspace[\s\S]*?setServizi\(canonicalServices\)/,
  'The owner UI must adopt the full reconciled catalogue returned by persistence.',
);
assert.match(
  syncServices,
  /createdServiceIds\?: string\[\]/,
  'A missing canonical row may be inserted only through an explicit create contract.',
);
assert.match(
  persistedSave,
  /createdServiceIds:\s*options\?\.createdServiceIds/,
  'The public save helper must propagate the explicit create IDs unchanged.',
);
assert.match(
  syncServices,
  /explicitlyChangedServiceIds\.has\(item\.__requestedServiceId\)[\s\S]*?explicitlyCreatedServiceIds\.has\(item\.__requestedServiceId\)[\s\S]*?return true;/,
  'A targeted save may insert a missing row only when the same local ID is explicitly marked as newly created.',
);
assert.match(
  syncServices,
  /const changedServiceIdsMissingFromPayload = Array\.from\([\s\S]*?explicitlyChangedServiceIds[\s\S]*?!requestedPayloadServiceIds\.has\(serviceId\)[\s\S]*?throw new Error/,
  'An exact existing-ID update must fail closed when its target is missing from the submitted catalogue.',
);
assert.match(
  syncServices,
  /const writeRequested =\s*explicitlyChangedServiceIds !== null\s*&&\s*\(explicitlyChangedServiceIds\.has\(requestedServiceId\)/,
  'A no-scope refresh or lifecycle flush must be read-only instead of rewriting the whole canonical catalogue.',
);
assert.match(
  syncServices,
  /const canonicalRequestedServiceUpdates =\s*explicitlyChangedCanonicalServiceIds === null\s*\? \[\]/,
  'A no-scope canonical reread must not overlay stale local service values onto the server result.',
);
assert.doesNotMatch(
  syncServices,
  /return recentlyCreatedServiceKeys\.has/,
  'Insertion authority must not be inferred inside persistence from a stale local guard.',
);

const automaticServiceSync = sliceBetween(
  'const currentServicesSignature = buildServiziSignature(servizi);',
  'useEffect(() => {\n    if (\n      !isLoaded ||\n      ownerInitialDataHydrating ||\n      !ownerServerSyncReady ||\n      !isAuthenticated ||\n      !isWorkspaceAccessible(salonWorkspace)',
  'automatic service synchronization',
);
assert.match(
  automaticServiceSync,
  /const pendingCreatedServiceIds =\s*getPendingCreatedServiceIds\(servizi\)[\s\S]*?changedServiceIds:\s*pendingCreatedServiceIds,[\s\S]*?createdServiceIds:\s*pendingCreatedServiceIds/,
  'The Agenda-created catalogue item path must convert only fresh creations into an explicit scoped write.',
);
assert.match(
  automaticServiceSync,
  /:\s*syncServicesTableForWorkspace\(workspaceId, servizi\)/,
  'Automatic synchronization without a fresh creation must use the read-only no-scope path.',
);

const sliceServicesScreenBetween = (startToken, endToken, label) => {
  const start = servicesScreenSource.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = servicesScreenSource.indexOf(
    endToken,
    start + startToken.length,
  );
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return servicesScreenSource.slice(start, end);
};

const catalogueOrderSave = sliceServicesScreenBetween(
  'const persistCatalogOrder = useCallback(',
  'const reorderCatalogRoles = useCallback(',
  'catalogue order persistence',
);
assert.match(
  catalogueOrderSave,
  /const changedOrderServiceIds = nextServices[\s\S]*?previousOrder\.roleOrder !==[\s\S]*?previousOrder\.serviceOrder !==[\s\S]*?changedServiceIds:\s*changedOrderServiceIds,[\s\S]*?changedServiceFields:\s*\[[\s\S]*?'client_role_display_order'[\s\S]*?'client_display_order'[\s\S]*?\],[\s\S]*?requireExistingChangedServiceIds:\s*true/,
  'Reordering a stale catalogue must fail closed instead of recreating a deleted service.',
);

const singleServiceSave = sliceServicesScreenBetween(
  'const previousService = servizioInModifica',
  'const salvaOperatore =',
  'single service persistence',
);
assert.match(
  singleServiceSave,
  /servizioInModifica\s*\?\s*\{[\s\S]*?changedServiceFields:\s*changedExistingServiceFields,[\s\S]*?requireExistingChangedServiceIds:\s*true,[\s\S]*?\}\s*:\s*\{ createdServiceIds: \[nextServicePayload\.id\] \}/,
  'Editing must require an existing canonical ID while only a new form submission may declare a creation.',
);

const singleArchiveSave = sliceServicesScreenBetween(
  'const aggiornaDisponibilitaOnlineServizio = (',
  'const aggiornaDisponibilitaOnlineMestiere = (',
  'single service archive persistence',
);
assert.match(
  singleArchiveSave,
  /changedServiceIds:\s*\[item\.id\],\s*changedServiceFields:\s*\['is_online'\],\s*requireExistingChangedServiceIds:\s*true/,
  'Archiving or restoring one stale service must never recreate it.',
);

const realtimeServiceApply = sliceBetween(
  'const applyRealtimeServiceRow = (',
  'const applyRealtimeCustomerRow = (',
  'realtime service row application',
);
assert.match(
  realtimeServiceApply,
  /if \(servicesPersistenceDirtyRef\.current\) \{\s*return;\s*\}/,
  'Per-row Realtime echoes must not expose a half-saved bulk catalogue while a local service mutation is pending.',
);

const mergeHelpersSource = sliceBetween(
  'const buildServiceMergeKey =',
  'const filterRecentlyDeletedServices =',
  'service merge helpers',
);
const mergeHarnessSource = `
const normalizeIdentityText = (value) => String(value ?? '').trim().toLowerCase();
const normalizeRoleName = (value) => String(value ?? '').trim().toLowerCase();
const isUuidValue = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim());
const normalizeServicePhaseConfig = (value) => value ?? undefined;
const normalizeServiceLinkConfig = (value) => value ?? undefined;
const getPhasedServiceTotalDuration = (_item, fallback) => fallback;
const normalizeServicePromotionWeekdays = (value) => Array.isArray(value) ? value : [];
const normalizeServiceClientBadge = (value) => value;
const normalizeStringIdArray = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
  : [];
${mergeHelpersSource}
module.exports = { normalizeServizi, mergeServiziCollections };
`;
const transpiledMergeHarness = ts.transpileModule(mergeHarnessSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mergeHarnessModule = { exports: {} };
new Function('module', 'exports', transpiledMergeHarness)(
  mergeHarnessModule,
  mergeHarnessModule.exports,
);
const { normalizeServizi, mergeServiziCollections } = mergeHarnessModule.exports;

const ids = {
  barber: '11111111-1111-4111-8111-111111111111',
  archivedHair: '22222222-2222-4222-8222-222222222222',
  onlineHair: '33333333-3333-4333-8333-333333333333',
  deletedTarget: '44444444-4444-4444-8444-444444444444',
  sameNameOtherRole: '55555555-5555-4555-8555-555555555555',
  catalogTaglio: '66666666-6666-4666-8666-666666666666',
  privateTaglio: '77777777-7777-4777-8777-777777777777',
};
const service = ({ id, nome, role, online = true, price = 20, ...rest }) => ({
  id,
  nome,
  prezzo: price,
  durataMinuti: 30,
  mestiereRichiesto: role,
  disponibileOnline: online,
  ...rest,
});
const reconcile = (requested, server) =>
  normalizeServizi(mergeServiziCollections(requested, server));

const partialSaveResult = reconcile(
  [service({ id: ids.barber, nome: 'Barba premium', role: 'Barber', price: 27 })],
  [
    service({ id: ids.barber, nome: 'Barba premium', role: 'Barber', price: 20 }),
    service({
      id: ids.archivedHair,
      nome: 'Piega lunga',
      role: 'Hair Stylist',
      online: false,
    }),
    service({
      id: ids.onlineHair,
      nome: 'Colore',
      role: 'Hair Stylist',
      online: true,
    }),
  ],
);
assert.deepEqual(
  new Set(partialSaveResult.map((item) => item.id)),
  new Set([ids.barber, ids.archivedHair, ids.onlineHair]),
  'An unrelated partial save must retain every canonical server service.',
);
assert.equal(
  partialSaveResult.find((item) => item.id === ids.archivedHair)?.disponibileOnline,
  false,
  'An archived server service must remain archived and visible to the owner.',
);
assert.equal(
  partialSaveResult.find((item) => item.id === ids.onlineHair)?.disponibileOnline,
  true,
  'An omitted online server service must remain in the owner catalogue.',
);
assert.equal(
  partialSaveResult.find((item) => item.id === ids.barber)?.prezzo,
  27,
  'The requested edit must win while server-only services are preserved.',
);

const exactDeleteResult = reconcile(
  [service({ id: ids.barber, nome: 'Barba premium', role: 'Barber' })],
  [
    service({ id: ids.barber, nome: 'Barba premium', role: 'Barber' }),
    service({
      id: ids.sameNameOtherRole,
      nome: 'Taglio',
      role: 'Hair Stylist',
      online: false,
    }),
  ],
);
assert.equal(
  exactDeleteResult.some((item) => item.id === ids.deletedTarget),
  false,
  'The server-confirmed exact deletion must stay absent.',
);
assert.equal(
  exactDeleteResult.some((item) => item.id === ids.sameNameOtherRole),
  true,
  'Deleting one service must not remove a different profession or archived row.',
);

const namespaceResult = reconcile(
  [
    service({
      id: ids.privateTaglio,
      nome: 'Taglio',
      role: 'Hair Stylist',
      price: 18,
      soloComposizione: true,
      compositionSourceKind: 'custom',
    }),
  ],
  [
    service({
      id: ids.catalogTaglio,
      nome: 'Taglio',
      role: 'Hair Stylist',
      price: 25,
    }),
    service({
      id: ids.privateTaglio,
      nome: 'Taglio',
      role: 'Hair Stylist',
      price: 15,
      soloComposizione: true,
      compositionSourceKind: 'custom',
    }),
  ],
);
assert.deepEqual(
  new Set(namespaceResult.map((item) => item.id)),
  new Set([ids.catalogTaglio, ids.privateTaglio]),
  'Catalog and private composition services with the same name must remain distinct.',
);
assert.equal(
  namespaceResult.find((item) => item.id === ids.privateTaglio)?.prezzo,
  18,
  'A composition-component edit must update only its own stable identity.',
);

console.log('Service catalogue reconciliation contracts: OK');
