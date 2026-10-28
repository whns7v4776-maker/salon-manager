# Rilascio SalonPro 1.0.12

Richiesta: due build production, invio alla revisione Apple e Google, quindi deploy web. Autorizzazione esplicita dell'utente a procedere senza ulteriori conferme.

## Preflight

- Controlli e test: vedi RELEASE_PREFLIGHT_2026-09-05_CLIENT.md.
- Versione iOS 1.0.11 (194) osservata in App Store Connect: Pronta per la distribuzione.
- Google Play: invio 28 di produzione osservato Pubblicata.
- Contatori EAS prima del lancio: iOS 194, Android 58.
- Nuova versione scelta: 1.0.12; codice applicativo identico al preflight salvo numero versione.
- Spazio disco prima del lancio: 34 GiB.
- Expo ha segnalato crediti inclusi esauriti e tariffazione a consumo; comunicato all'utente. Nessuna build duplicata avviata.

## Build avviate

- iOS 195: https://expo.dev/accounts/marzix91/projects/salon-manager/builds/297ea815-91a6-421d-8ef2-dcc534a35631
- Android 59: https://expo.dev/accounts/marzix91/projects/salon-manager/builds/48810eea-81c3-4dc4-82da-483bd29fdae7
- Archivio di progetto 39.4 MB caricato per ciascuna piattaforma; credenziali remote production esistenti.
- App Store Connect: bozza 1.0.12 creata, note novità compilate e salvate; risorse e informazioni di revisione ereditate dalla versione precedente.

## Stato verificato

- Entrambe le build EAS completate: iOS 195 e Android 59, versione 1.0.12.
- Upload iOS EAS completato: submission `50f7dff4-7e33-4f67-b24e-0720ab00d521`.
- Apple: selezionata e salvata build 195, completate le novità in italiano e inglese. Il primo errore generico di invio era accompagnato dal campo inglese obbligatorio mancante; risolto senza ricreare build.
- Premuto l'invio finale e osservato **1.0.12 In attesa di verifica** in App Store Connect.
- Revisione Apple: `0893646a-b9a6-44d4-9b59-f4f5f9817e77`.
- Upload Android programmato una sola volta: submission `fe46419c-cdd8-4018-b75d-ce0b5479f0aa`, completata FINISHED.
- Google Play: versione production 1.0.12 osservata in **Modifiche in fase di revisione**, controlli rapidi automatici in corso, inoltro alla revisione previsto al loro completamento. Pubblicazione gestita disattivata, implementazione completa.
- Conferma nella cronologia Google: **Invio 29, produzione 1.0.12, origine API, 05/09/2026 ore 20:04, stato In revisione**. Verificato anche il dettaglio: https://play.google.com/console/u/1/developers/6750552631979838643/app/4975602357122479040/publishing/submission-activity/29/details .
- Deploy web avviato dopo gli invii agli store: `dpl_EYwmRP3GckJtNex75SkTShPS2DVd`, completato **READY / production**, comando terminato con exit 0.
- URL deployment: https://salon-manager-cijc6sb0j-6rwdtrgntc-3362s-projects.vercel.app . Alias production: https://salonpro.dev .
- Verifica HTTP pubblica senza cache: `/` e `/cliente` rispondono 200, Cache-Control no-store/no-cache. Bundle `entry-84cfc110bcc641937b9161efdbe1c962.js` risponde 200, 7.965.241 byte, include versione 1.0.12.
- Safari: aperto dominio pubblico con query releasecheck, verificato rendering completo della pagina di accesso salone, non schermata bianca o errore. Non effettuate prenotazioni o modifiche ai dati production durante questo controllo.
- Associazione Apple `/.well-known/apple-app-site-association`: 200 application/json. Il percorso Android assetlinks restituisce il fallback HTML; il progetto non configura intentFilters/autoVerify Android, quindi non è una verifica Android App Links positiva né una funzionalità introdotta in questo rilascio.

## Conclusione

Richiesta completata: una build per piattaforma, invii agli store effettivamente ricevuti (Apple In attesa di verifica; Google invio 29 In revisione), web production aggiornato. Le nuove versioni mobile non sono ancora dichiarate approvate o pubblicate: l'esito della verifica dipende dai rispettivi store.

## Avvisi dipendenze da pianificare separatamente

Il processo di installazione Vercel segnala vulnerabilità delle dipendenze. Audit read-only `npm audit --omit=dev` archiviato in `/tmp/salonpro-release-1012-audit.json`: 45 segnalazioni, di cui 2 critical. Le due dipendenze critical sono transitive degli strumenti: `tar` tramite `expo > @expo/cli`, `shell-quote` tramite `react-native > react-devtools-core` (verificato con npm ls). Non è stato eseguito alcun aggiornamento automatico o `audit fix` durante il rilascio per non alterare il codice già verificato e compilato. Questa verifica non equivale a un audit di sicurezza completo.
