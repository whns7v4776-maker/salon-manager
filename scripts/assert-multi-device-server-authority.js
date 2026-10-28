const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const appContext = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const clientScreen = fs.readFileSync(
  path.join(root, 'app/cliente-screen.tsx'),
  'utf8',
);

const assertIncludes = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`Contratto multi-device mancante: ${label}`);
  }
};

assertIncludes(
  clientScreen,
  'applyPublicAvailabilitySettings(lightweightSettings, { authoritative: true })',
  'la disponibilita pubblica confermata dal server deve sostituire la cache del device',
);
assertIncludes(
  appContext,
  'remoteIsAuthoritative && remoteSettings',
  'la disponibilita owner deve supportare una risposta server autoritativa',
);
assertIncludes(
  appContext,
  'availabilitySettingsRemoteWritePendingRef.current > 0',
  'le sole scritture disponibilita ancora pendenti devono essere protette',
);
assertIncludes(
  appContext,
  'serviziAuthoritative: hasAuthoritativeRemoteServizi',
  'la tabella servizi deve dichiarare la propria autorita anche quando e vuota',
);
assertIncludes(
  appContext,
  'operatoriAuthoritative: hasAuthoritativeRemoteOperatori',
  'la tabella operatori deve dichiarare la propria autorita anche quando e vuota',
);
assertIncludes(
  appContext,
  'if (!servicesPersistenceDirtyRef.current) {\n          setServizi(normalizedRemoteServices);',
  'un refresh servizi deve essere remoto e non una modifica locale',
);
assertIncludes(
  appContext,
  'if (operatorsRemoteWritePendingRef.current === 0) {\n          setOperatori(normalizedRemoteOperators);',
  'gli operatori confermati dal server devono sostituire la cache',
);
assertIncludes(
  appContext,
  "cashResult.status === 'fulfilled' && !cashResult.value.error\n            ? remoteMovimenti",
  'una cassa server vuota deve cancellare la copia cache',
);
assertIncludes(
  appContext,
  "cardsResult.status === 'fulfilled' && !cardsResult.value.error\n            ? remoteCarte",
  'un elenco carte server vuoto deve cancellare la copia cache',
);
assertIncludes(
  appContext,
  "eventsResult.status === 'fulfilled' && !eventsResult.value.error\n            ? remoteEventi",
  'un elenco eventi server vuoto deve cancellare la copia cache',
);
assertIncludes(
  appContext,
  'setServiceCardColorOverridesFromRemote(remoteServiceOverrides);',
  'i colori servizio condivisi devono ricevere gli aggiornamenti remoti',
);
assertIncludes(
  appContext,
  'setRoleCardColorOverridesFromRemote(remoteRoleOverrides);',
  'i colori mestiere condivisi devono ricevere gli aggiornamenti remoti',
);

if (clientScreen.includes('const markFrontendNotificationsAsViewed =')) {
  throw new Error(
    'Contratto multi-device violato: e ancora presente il vecchio percorso che marcava le richieste lette prima della conferma server',
  );
}

console.log('Contratti multi-device server-authority verificati.');
