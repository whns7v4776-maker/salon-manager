const fs = require('fs');
const path = require('path');
const { assertAgendaDensityStorageBoundary } = require('./assert-agenda-density-controls.cjs');

const root = path.resolve('.');
const appContext = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const agenda = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);
const tabsLayout = fs.readFileSync(
  path.join(root, 'app/(tabs)/_layout.tsx'),
  'utf8',
);
const preferenceTypes = fs.readFileSync(
  path.join(root, 'src/lib/agenda-density-preference.ts'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260830090000_persist_owner_agenda_density_preference.sql',
  ),
  'utf8',
);

const assertIncludes = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`Contratto densità Agenda mancante: ${label}`);
  }
};

const assertMatches = (source, pattern, label) => {
  if (!pattern.test(source)) {
    throw new Error(`Contratto densità Agenda mancante: ${label}`);
  }
};

assertIncludes(
  preferenceTypes,
  "app: 'massima',\n  web: 'compatta'",
  'app deve partire da 58% e web da Compatta (82%) solo senza preferenza remota',
);
assertIncludes(
  agenda,
  'getDefaultAgendaDensityId(',
  'la UI deve derivare il bootstrap dalla surface corrente',
);
assertIncludes(
  agenda,
  'option.id === agendaDensityPreference.densityId',
  'Agenda deve applicare la preferenza riconciliata del workspace',
);
// The web grid may wait for workspace hydration, but a density preference must
// never prolong the startup gate. Execute the actual initializer for both surfaces.
const ts = require('typescript');
const vm = require('vm');
const assert = require('node:assert/strict');
const startupTree = ts.createSourceFile('agenda.tsx', agenda, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let startupInitializer;
function findStartup(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(startupTree) === 'ownerStartupLoading') startupInitializer = node.initializer;
  ts.forEachChild(node, findStartup);
}
findStartup(startupTree);
assert.ok(startupInitializer, 'Agenda startup gate must exist');
const startupExpression = ts.transpileModule(`(${startupInitializer.getText(startupTree)})`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for (const web of [false,true]) for (const loading of [false,true]) for (const isLoaded of [false,true]) for (const hydrating of [false,true]) for (const densityHydrated of [false,true]) {
  const actual = vm.runInNewContext(startupExpression, {IS_WEB:web,useOwnerStartupLoading:()=>loading,appContext:{isLoaded,ownerInitialDataHydrating:hydrating,agendaDensityPreferenceHydrated:densityHydrated}});
  assert.equal(actual, loading || (web && (!isLoaded || hydrating)), 'Only workspace hydration may hold the web grid; density is reconciled independently');
}
assertMatches(
  tabsLayout,
  /const \{[\s\S]*?agendaDensityPreferenceHydrated,[\s\S]*?\} = useAppContext\(\);[\s\S]*?nativeOwnerColdStartTabsSettled[\s\S]*?!ownerAppointmentsAuthoritative \|\|\s*!agendaDensityPreferenceHydrated[\s\S]*?setShowNativeOwnerColdStartSkeleton\(false\);[\s\S]*?\}, \[\s*agendaDensityPreferenceHydrated,/,
  'il one-shot di cold start nativo deve attendere la hydration densità e dichiararla tra le dipendenze',
);
assertIncludes(
  agenda,
  'setAgendaDensityPreferencePersisted(nextDensity.id)',
  'ogni scelta esplicita deve usare il salvataggio remoto della surface corrente',
);
assertIncludes(
  preferenceTypes,
  "'massima',\n  'panorama',\n  'compatta',\n  'comoda',\n  'normale'",
  'i cinque valori condivisi app/web devono essere tipizzati',
);
assertIncludes(
  appContext,
  'agendaDensityPreference: AgendaDensityPreference;',
  'il context deve esporre la preferenza condivisa',
);
assertIncludes(
  appContext,
  'setAgendaDensityPreferencePersisted:',
  'il context deve esporre il salvataggio server',
);
assertIncludes(
  appContext,
  'refreshAgendaDensityPreference:',
  'il context deve permettere la riconciliazione esplicita',
);
assertIncludes(
  appContext,
  'salon_manager_workspace_agenda_density_preference_v3',
  'il fallback locale surface-aware deve avere una nuova versione',
);
assertIncludes(
  appContext,
  '}__${workspaceId.trim().toLowerCase()}__${surface}`',
  'il fallback locale deve essere confinato ad account workspace e surface',
);
assertIncludes(
  appContext,
  "Platform.OS === 'web' ? 'web' : 'app'",
  'iOS e Android devono convergere sulla stessa surface app',
);
assertIncludes(
  appContext,
  'p_surface: AGENDA_DENSITY_SURFACE',
  'lettura e scrittura RPC devono dichiarare la surface',
);
assertIncludes(
  appContext,
  'localCache.remoteUpdatedAt === remoteAuthority.updatedAt',
  'una scelta offline può essere riprovata solo sulla versione server nota',
);
assertIncludes(
  appContext,
  'await pendingPersistence.promise.catch(() => undefined)',
  'un eco realtime deve attendere il salvataggio e poi rileggere il server',
);
assertIncludes(
  appContext,
  'agendaDensityScopeGenerationRef.current === scopeGeneration',
  'una risposta del vecchio account o workspace non deve contaminare la nuova sessione',
);
assertIncludes(
  appContext,
  'agendaDensityScopeKeyRef.current === expectedScopeKey',
  'il guard di sessione deve controllare anche identita account e workspace',
);
assertIncludes(
  appContext,
  'rebaseUnknownRemoteVersion: true',
  'un tap live prima della hydration deve poter essere salvato con CAS',
);
assertIncludes(
  appContext,
  'localCache.pendingRemoteSync &&\n        !localCache.remoteUpdatedAt',
  'un valore remoto cancellato non deve essere ricreato da una cache gia sincronizzata',
);
assertIncludes(
  appContext,
  'buildAgendaDensityPreferenceStorageKey(\n            accountEmail,\n            workspaceId,\n            AGENDA_DENSITY_SURFACE',
  'il bootstrap autorevole deve eliminare una cache sincronizzata diventata obsoleta',
);
assertIncludes(
  appContext,
  "source: 'remote'",
  'una preferenza remota esistente deve diventare autorevole',
);
assertIncludes(
  appContext,
  'buildDefaultAgendaDensityPreference(workspaceId)',
  'il default per surface deve restare un bootstrap e non un reset remoto',
);
assertIncludes(
  migration,
  'add column if not exists agenda_density_app text;',
  'la preferenza app deve vivere sul workspace remoto',
);
assertIncludes(
  migration,
  'add column if not exists agenda_density_web text;',
  'la preferenza web deve essere indipendente da app',
);
assertIncludes(
  migration,
  'add column if not exists agenda_density_app_updated_at timestamptz;',
  'il server deve versionare la preferenza app',
);
assertIncludes(
  migration,
  'add column if not exists agenda_density_web_updated_at timestamptz;',
  'il server deve versionare la preferenza web separatamente',
);
assertIncludes(
  migration,
  'workspaces_agenda_density_app_version_pair_valid',
  'valore e token app devono essere entrambi NULL oppure entrambi presenti',
);
assertIncludes(
  migration,
  'workspaces_agenda_density_web_version_pair_valid',
  'valore e token web devono essere entrambi NULL oppure entrambi presenti',
);
assertIncludes(
  migration,
  "if v_surface not in ('app', 'web') then",
  'le RPC devono rifiutare surface non canoniche',
);
assertIncludes(
  migration,
  'p_expected_updated_at timestamptz default null',
  'la scrittura deve usare confronto versione',
);
assertIncludes(
  migration,
  'for update;',
  'le modifiche concorrenti devono serializzarsi sulla riga workspace',
);
assertIncludes(
  migration,
  'v_workspace.agenda_density_app_updated_at = p_expected_updated_at',
  'un dispositivo app non deve sovrascrivere una scelta app più recente',
);
assertIncludes(
  migration,
  'v_workspace.agenda_density_web_updated_at = p_expected_updated_at',
  'un browser non deve sovrascrivere una scelta web più recente',
);
assertIncludes(
  migration,
  "date_trunc('milliseconds', clock_timestamp())",
  'il token versione deve attraversare JavaScript senza perdere precisione',
);
assertIncludes(
  migration,
  "v_workspace.agenda_density_app_updated_at + interval '1 millisecond'",
  'due scritture app nello stesso millisecondo devono avere versioni distinte',
);
assertIncludes(
  migration,
  "v_workspace.agenda_density_web_updated_at + interval '1 millisecond'",
  'due scritture web nello stesso millisecondo devono avere versioni distinte',
);
assertIncludes(
  migration,
  'p_workspace_id is distinct from public.current_workspace_id()',
  'lettura e scrittura devono restare confinate al workspace autenticato',
);

if (/agenda_density_(?:app|web)\s+text\s+not null\s+default/i.test(migration)) {
  throw new Error(
    'Contratto densità Agenda violato: il database non deve preimpostare 58% sopra una scelta utente',
  );
}

// Visible-day count has its own reviewed local preference. Keep density on the
// shared workspace preference while still rejecting old or unknown local keys.
assertAgendaDensityStorageBoundary(agenda);

if ((appContext.match(/p_surface: AGENDA_DENSITY_SURFACE/g) ?? []).length < 2) {
  throw new Error(
    'Contratto densità Agenda violato: entrambe le RPC devono essere surface-aware',
  );
}

console.log('Contratti persistenza densità Agenda verificati.');
