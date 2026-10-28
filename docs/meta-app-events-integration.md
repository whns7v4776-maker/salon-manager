# Meta App Events — preparazione, non rilascio

App Meta: `3228220230705821`. SDK React Native 13.4.3, Expo Tracking Transparency per SDK54.

## Configurazione prima della nuova build

- Configurazione completata il 9 settembre 2026: i profili EAS `production` e `store-fixed-version` includono `META_APP_EVENTS_ENABLED=true`. Il client token pubblico verificato in Meta Developers è in `config/meta-app-events.js`; non occorre aggiungere variabili prima della build. `META_CLIENT_TOKEN` rimane un override facoltativo per una futura rotazione. NON usare l'app secret o un token Instagram.
- Il flag rimane spento nelle esecuzioni locali senza variabile e sempre spento per APP_VARIANT=development. Non vengono creati dati di campagna dai normali test di sviluppo.
- La dipendenza nativa riceve sempre app ID e raccolta automatica disabilitata, anche a flag spento. Non abilitare da remoto autologging, advanced matching o raccolta automatica di acquisti.
- Le build abilitate hanno runtimeVersion `${appVersion}-meta1` su entrambe le piattaforme, separato dai vecchi binari. Anche futuri aggiornamenti OTA devono usare `META_APP_EVENTS_ENABLED=true` per raggiungere questo runtime. Nessun aggiornamento OTA è stato pubblicato.
- Piattaforma Android aggiunta e salvata in Meta: Google Play, pacchetto `com.marzix91.salonmanager`, classe di produzione `com.marzix91.salonmanager.MainActivity`; acquisti automatici OFF. iOS verificato: stesso bundle, Store ID `6760840153`, eventi automatici OFF. Account pubblicitario già collegato: `2287941474855232`. Nessuna modifica alle autorizzazioni Instagram o alle campagne.

## Comportamento implementato

Nella pagina Privacy nativa è presente il consenso facoltativo, raggiungibile dalla schermata iniziale e dalle impostazioni titolare/cliente. Nessun popup obbligatorio all'avvio; rifiutare non limita SalonPro. Su iOS serve anche ATT autorizzato. Consenso persistito sul dispositivo, revocabile dalla stessa pagina; il permesso iOS è ricontrollato prima degli eventi e al ritorno in primo piano. L'informativa locale include la sezione Meta; non è stata distribuita al sito pubblico.

Eventi manuali: `fb_mobile_activate_app` una volta per processo autorizzato e `fb_mobile_complete_registration` solo dopo nuova registrazione owner riuscita (non login, recupero account, vecchi account o registrazioni clienti). Nessun parametro personale aggiunto, nessun user ID/email/hash inviato dal codice applicativo. Il SDK può trattare identificativi pubblicitari e metadati tecnici dichiarati nel consenso. Nessun backfill di registrazioni precedenti al consenso. Le registrazioni con conferma email differita non sono conteggiate da questo primo hook.

Il modulo locale `modules/meta-install-events` completa il percorso nativo di installazione: iOS chiama `AppEvents.shared.activateApp()` (il SDK invia e deduplica MOBILE_APP_INSTALL); Android chiama `FacebookSdk.publishInstallAsync` ed emette l'apertura da JS. Su Android evitiamo `activateApp` perché registra listener di ciclo vita permanenti senza API pubblica di arresto. La funzione di installazione è pubblica ma destinata all'uso interno del SDK: Android è vincolato alla versione 18.0.3 verificata; rivalutare il bridge a ogni upgrade. iOS usa il ramo 18.0 del SDK richiesto da react-native-fbsdk-next. Autologging resta spento, anche dopo consenso.

Il SDK gestisce la deduplicazione dell'installazione; il bridge viene richiamato una volta per processo autorizzato. In caso di mancato invio il nuovo processo autorizzato torna a invocare il percorso nativo. Il fatto che il codice lo invochi NON dimostra ricezione o attribuzione in Meta: occorre la prova sul binario reale. I contatori non equivalgono al totale utenti: chi rifiuta e chi usa web non viene misurato. La revoca interrompe nuovi invii dal codice dell'app; non annulla richieste già in trasmissione.

## Controlli senza build

`npm run test:meta-app-events`: consenso, rifiuto/revoca ATT, revoca concorrente, errori storage, vecchi binari/modulo assente, invocazione bridge install, assenza di payload personali, configurazione dei profili e separazione runtime. Risoluzione autolinking Expo verificata per iOS e Android. TypeScript, lint mirato e controlli regressione auth/abbonamenti. Questi controlli NON compilano Swift/Kotlin e non sostituiscono i test su dispositivo.

## Verifiche prima di qualsiasi lancio

1. L'utente avvia la nuova build nativa e la installa su iPhone e Android; token e configurazione sono già presenti. La build deve includere i moduli locali via prebuild/autolinking EAS (le cartelle native locali sono escluse da .easignore).
2. Revisione informativa completa (inclusi Meta, trasferimenti/conservazione/diritti), App Store privacy e Google Data safety prima del rilascio; il testo in-app non sostituisce questa revisione.
3. Test fisico rete/eventi: nessun evento prima del consenso, ATT rifiutato, autorizzazione, revoca nell'app e nelle impostazioni iOS; registrazione nuova e login esistente.
4. Gestione eventi Meta: verificare ricezione reale dei due eventi, provenienza app corretta e diagnostica. Non scambiare il test locale per prova di attribuzione.
5. Verificare che iOS14+ sia selezionabile e che la pubblicazione della campagna non riporti più errori. Solo dopo approvazione procedere a store e campagna.

Non sono stati eseguiti build, upload store, aggiornamenti OTA o pubblicazione della pubblicità.

Riferimenti: https://github.com/thebergamo/react-native-fbsdk-next, https://docs.expo.dev/versions/v54.0.0/sdk/tracking-transparency/, https://github.com/facebook/facebook-ios-sdk/blob/v18.0.0/FBSDKCoreKit/FBSDKCoreKit/AppEvents/FBSDKAppEvents.m e https://github.com/facebook/facebook-android-sdk/blob/sdk-version-18.0.3/facebook-core/src/main/java/com/facebook/FacebookSdk.kt.
