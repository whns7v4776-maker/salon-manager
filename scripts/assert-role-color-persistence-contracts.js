const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const appContext = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const servicesScreen = fs.readFileSync(
  path.join(root, 'app/(tabs)/servizi.tsx'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260829232000_persist_owner_role_card_colors_atomically.sql',
  ),
  'utf8',
);

const assertIncludes = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`Contratto colori mestiere mancante: ${label}`);
  }
};

assertIncludes(
  appContext,
  'saveRoleCardColorOverridePersisted',
  'il context deve esporre un salvataggio remoto esplicito',
);
assertIncludes(
  appContext,
  "'set_owner_role_card_color_v1'",
  'la preferenza deve usare la scrittura atomica server',
);
assertIncludes(
  appContext,
  ".from('owner_app_snapshots')\n          .select('payload')",
  'il salvataggio deve rileggere lo snapshot autorevole',
);
assertIncludes(
  appContext,
  'setRoleCardColorOverridesFromRemote(previousOverrides);',
  'un errore server deve ripristinare lo stato confermato',
);
assertIncludes(
  migration,
  "'{roleCardColorOverrides}'",
  'la migration deve aggiornare soltanto la mappa mestieri',
);
assertIncludes(
  migration,
  'p_workspace_id is distinct from public.current_workspace_id()',
  'la scrittura deve restare confinata al workspace autenticato',
);
assertIncludes(
  servicesScreen,
  'premiumRoleColorPanel',
  'web e app devono usare il nuovo editor mestiere condiviso',
);
assertIncludes(
  servicesScreen,
  "effectiveCardColorMode === 'service' && savedCardColors.length > 0",
  'i vecchi comandi della tavolozza devono restare confinati ai servizi',
);
assertIncludes(
  servicesScreen,
  'ogni servizio conserva il proprio colore',
  'la UI deve esplicitare che il colore dei servizi viene conservato',
);

const operatorAccentStart = servicesScreen.indexOf(
  'const getOperatorRoleAccent = useCallback',
);
const operatorAccentEnd = servicesScreen.indexOf(
  'const applyCardColorOverride =',
  operatorAccentStart,
);
if (operatorAccentStart < 0 || operatorAccentEnd <= operatorAccentStart) {
  throw new Error(
    'Contratto colori mestiere mancante: risoluzione colore card operatori',
  );
}
const operatorAccentSource = servicesScreen.slice(
  operatorAccentStart,
  operatorAccentEnd,
);
assertIncludes(
  operatorAccentSource,
  'getAutomaticRoleAccentColor(role)',
  'il colore operatore deve avere un fallback deterministico per mestiere',
);
assertIncludes(
  operatorAccentSource,
  'preferRoleColor: true',
  'le card operatore devono usare sempre il colore mestiere salvato',
);
if (
  operatorAccentSource.includes('operatorGroups.length') ||
  operatorAccentSource.includes('linkedService') ||
  operatorAccentSource.includes('serviceCardColorOverrides') ||
  operatorAccentSource.includes('cardColorMode')
) {
  throw new Error(
    'Contratto colori mestiere violato: le card operatore dipendono ancora da stato transitorio o colori servizio',
  );
}

if (servicesScreen.includes('scheduleRoleColorReapply')) {
  throw new Error(
    'Contratto colori mestiere violato: e ancora presente la riapplicazione a timer',
  );
}

console.log('Contratti palette e persistenza colori mestiere verificati.');
