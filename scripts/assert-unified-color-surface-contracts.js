const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('.');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const agenda = read('app/(tabs)/agenda.tsx');
const services = read('app/(tabs)/servizi.tsx');
const frontend = read('app/cliente-screen.tsx');
const context = read('src/context/AppContext.tsx');
const colorEngine = read('src/lib/service-accents.ts');

const assertContains = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(`Contratto colori unificati violato: ${message}`);
  }
};

assertContains(
  colorEngine,
  /export const resolveServiceColorSource[\s\S]*?visitedIds[\s\S]*?services\.find/,
  'il motore centrale deve seguire la provenienza e proteggere dai cicli',
);
assertContains(
  colorEngine,
  /export const reconcileAutomaticServiceColorOverrides[\s\S]*?identityKey[\s\S]*?pickUnusedAutomaticServiceColor/,
  'gli accenti servizio devono essere persistenti e indipendenti dall’ordine',
);
assertContains(
  colorEngine,
  /export const reconcileAutomaticRoleColorOverrides[\s\S]*?canKeepExistingColor[\s\S]*?if \(!canKeepExistingColor\)/,
  'i colori mestiere esistenti devono restare stabili durante la riconciliazione',
);
assertContains(
  services,
  /const getOperatorRoleAccent = useCallback[\s\S]*?getAutomaticRoleAccentColor\(role\)[\s\S]*?preferRoleColor:\s*true/,
  'le card operatore devono dipendere soltanto dal colore stabile del mestiere',
);
assertContains(
  agenda,
  /resolveAgendaColorSourceService[\s\S]*?resolveServiceColorSource/,
  'Agenda deve risalire al servizio sorgente',
);
assertContains(
  agenda,
  /getAgendaServiceIdentityColor[\s\S]*?getServiceColorIdentityKey[\s\S]*?getStableServiceIdentityColor/,
  'il trattino Agenda deve usare la stessa identita stabile del servizio',
);
assertContains(
  agenda,
  /getAgendaServiceBadgeAccent[\s\S]*?colorSourceService[\s\S]*?preferRoleColor:\s*false/,
  'il badge servizio deve mantenere l’accento del servizio anche in multi-mestiere',
);
assertContains(
  frontend,
  /filteredFrontendServizi\.map[\s\S]*?resolveServiceColorSource[\s\S]*?getServiceCardTheme/,
  'le card frontend app e web devono usare la provenienza colore',
);
assertContains(
  frontend,
  /dependencyServiceOptions\.map[\s\S]*?resolveServiceColorSource[\s\S]*?getServiceCardTheme/,
  'anche le card dipendenza/composizione frontend devono usare la provenienza',
);
assertContains(
  services,
  /row\.items\.map[\s\S]*?resolveServiceColorSource[\s\S]*?getServiceCardTheme/,
  'le card gestione Servizi app e web devono usare la provenienza',
);
assertContains(
  context,
  /reconcileAutomaticServiceColorOverrides\([\s\S]*?reconcileAutomaticRoleColorOverrides\(/,
  'la sincronizzazione deve riconciliare sia servizi sia mestieri',
);
assertContains(
  context,
  /metadato cromatico degli appuntamenti[\s\S]*?!validServiceNames[\s\S]*?isUuidValue/,
  'gli appuntamenti orfani devono conservare il colore storico per nome',
);

console.log('Unified color surface contracts: OK');
