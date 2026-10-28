const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src/context/AppContext.tsx'),
  'utf8',
);
const homeSource = fs.readFileSync(
  path.join(root, 'app/(tabs)/index.tsx'),
  'utf8',
);

const assertions = [
  {
    ok: homeSource.includes(
      '{ requireRemoteProfileConfirmation: true }',
    ),
    message:
      'Il salvataggio del profilo dalla Home deve richiedere la conferma remota.',
  },
  {
    ok: contextSource.includes('remoteWorkspaceMatchesOwnerProfile({'),
    message:
      'La risposta del server deve essere confrontata con tutti i campi del profilo salvato.',
  },
  {
    ok:
      contextSource.includes('const verifiedRegistrationWorkspace =') &&
      contextSource.includes(
        'Registrazione non confermata dal server. Controlla la connessione e riprova.',
      ),
    message:
      'Anche la prima registrazione deve rileggere e confermare il profilo canonico dal server.',
  },
  {
    ok: contextSource.includes(
      'const bootstrapResult = await syncOwnerProfile();',
    ),
    message:
      'Il profilo titolare deve essere confermato prima di mostrare il successo.',
  },
  {
    ok: contextSource.includes(
      'ownerProfileConfirmationRevisionRef.current += 1;',
    ),
    message:
      'Un salvataggio confermato deve invalidare i controlli profilo obsoleti.',
  },
  {
    ok:
      contextSource.match(
        /ownerProfileConfirmationRevisionRef\.current ===\s*profileConfirmationRevisionAtStart/g,
      )?.length === 2,
    message:
      'I due percorsi che richiedono il profilo devono ignorare un controllo precedente al salvataggio.',
  },
  {
    ok: contextSource.includes(
      'I dati non sono stati confermati dal server. Controlla la connessione e riprova.',
    ),
    message:
      'Un errore remoto non deve più essere trasformato in un falso salvataggio riuscito.',
  },
];

const failures = assertions.filter((assertion) => !assertion.ok);
if (failures.length > 0) {
  failures.forEach((failure) => console.error(`FAIL: ${failure.message}`));
  process.exit(1);
}

console.log('Owner profile save persistence contracts: OK');
