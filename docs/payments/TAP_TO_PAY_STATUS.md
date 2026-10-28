# Tap to Pay — stato aggiornato all'8 ottobre 2026

## Verifica Apple e preparazione store dell'8 ottobre

- Letta la risposta originale Apple Wallet Entitlements alla richiesta **22516876**, inviata il 28 settembre: concessa solo l'autorizzazione di **sviluppo**, per dispositivi registrati. L'autorizzazione di pubblicazione richiede tre video (nuovo salone, salone esistente, incasso) e la checklist ufficiale compilata. Nessuna email inviata né dichiarazione di conformità effettuata durante questa verifica.
- Il nuovo profilo App Store `SalonPro AppStore 2026-10-08 Terminal` (`PJ887NW9J6`) è stato generato e decodificato: ancora privo dell'entitlement Tap to Pay. Non avviare una build App Store Terminal con questo profilo e non considerare la capacità selezionata nell'App ID come approvazione alla distribuzione.
- Generato il profilo **Development** `SalonPro Development 2026-10-08 Tap to Pay`, UUID `8d862452-aebd-4d43-87c9-b3197cbff97d`, con il certificato di sviluppo già presente e i dispositivi Expo già registrati: entitlement Tap to Pay presente e iPhone di Marzio incluso. È utilizzabile per il collaudo locale, non per TestFlight/App Store. Nessun nuovo certificato o nuova chiave creati.
- Scaricate le istruzioni Apple v1.7 e la checklist originale. Compilazione del presenter Swift `ProximityReaderDiscovery` contro il SDK iPhone installato: superata. Non equivale alla compilazione/ installazione dell'intera app iOS.
- Corretto il primo tutorial: segue la connessione SDK e l'accettazione dei termini Apple; solo dopo la guida si riserva il pagamento. Aggiunto avanzamento della configurazione dal callback SDK e indicatore di attività. Test funzionali coprono connessione interrotta, uscita dalla guida e conferma del pagamento dal server.
- Preflight nativo Android Terminal (Kotlin, plugin effettivi, dipendenze SDK): **BUILD SUCCESSFUL**. Preparata la compilazione locale release che produce AAB e APK con versione `1.0.20 (74)`, chiave di caricamento già esistente e ambiente EAS production. `build:inspect` ha assegnato il numero 74; non è stata avviata una build cloud. Il completamento degli artefatti e il collaudo release sul Samsung devono essere registrati separatamente.
- Il Samsung ha `1.0.17 (68)` firmata da Google Play (`SHA-256 dfc0ab288d757e7774cd1b980fe9a89838ee79d1c6d1416190998615db939815`). La chiave di caricamento EAS è diversa: l'APK locale non può sostituire direttamente l'app Play senza cancellarne i dati. Usare il canale **Test interni** già esistente e la firma Play; non disinstallare l'app per aggirare questa differenza. Aggiunto profilo di invio `terminal-test`, senza modificare la pubblicazione di produzione.
- Google Play, verifica live: `1.0.20` precedente approvata e pronta per pubblicazione gestita; produzione ancora `1.0.17`. Non pubblicata durante questa preparazione.
- App Store Connect, verifica live: `1.0.20 (211)` approvata, **In attesa di rilascio da parte dello sviluppatore**; pubblica ancora `1.0.17`. Questo è lo stato della build precedente senza Terminal, distinto dall'approvazione Tap to Pay. Non rilasciata durante questa preparazione.
- La prima ottimizzazione locale Android ha rilevato `R8: OutOfMemoryError` con il budget Expo predefinito di 2 GiB. Il plugin Terminal ora garantisce almeno 6 GiB heap e 1 GiB metaspace conservando impostazioni utente superiori e altre opzioni JVM. Test di prebuild e idempotenza superati; ripresa la stessa compilazione/versione 74 con due worker, senza nuova build cloud.
- Completata la compilazione finale locale release Android AAB/APK 74 con R8 e riduzione risorse attivi e le correzioni notifiche recenti. Risolte anche le dipendenze runtime Tink mantenute dall'SDK (Google HTTP Client, Joda Time, Joda Convert) e uniti i relativi avvisi di dipendenza. Firma di caricamento esistente verificata, SDK Terminal/Tap to Pay presente, 63 librerie native a 64 bit e packaging APK compatibili con pagine da 16 KiB. Mappa R8 inclusa nell'AAB e bundle identico all'APK. TypeScript della copia app superato. Rapporto: `work/store-readiness-20261008/android-release-report.json`. Non equivale ancora al collaudo sul Samsung.
- Invio EAS `c6c8d899-f107-4716-852b-7c3e91729143` fallito per permessi mancanti dell'account di servizio Google. Completato il caricamento diretto dello stesso AAB 74 nella Console già autenticata: release interna 11, `74 (1.0.20) · Tap to Pay`, **Disponibile per i tester interni** dall'8 ottobre alle 13:22. Prova: `work/store-readiness-20261008/android-internal-release.png`. Non modificati permessi, credenziali o lista tester; nessuna build cloud, incremento aggiuntivo o promozione in produzione. `AD_ID` presente nei nuovi APK/AAB: l'errore su un artefatto attivo è stato ignorato tramite l'override Google per la sola release, senza cambiare dichiarazione globale o consenso. Installazione e collaudo sul Samsung restano aperti.
- L'iPhone di Marzio rilevato via cavo ha iOS **27.2, build 24B5089g**: è ancora la build beta rilevata prima. Disattivare gli aggiornamenti beta non sostituisce il sistema già installato. Stripe esclude Tap to Pay sulle beta iOS. Completata e installata la build locale Development **1.0.20 (1)**, runtime `1.0.20-terminal2-meta1`, firma ed entitlement Terminal verificati. Nessuna build cloud né incremento del numero store; dati app preservati.
- Risolti due crash distinti della nuova preparazione iPhone: avvio senza UIScene richiesto dal nuovo SDK Apple e pulizia credenziali Stripe prima dell'inizializzazione. Plugin iOS riutilizzabile con collegamenti, notifiche e callback in primo piano conservati; cleanup Terminal protetto anche con permessi mancanti, inizializzazione fallita/in corso e cambio account/sede. TypeScript e test funzionali superati. Home autenticata e pannello Cassa osservati sul dispositivo; il titolare conferma che apertura dall'icona, Cassa e Impostazioni restano aperte. Nessun nuovo rapporto di crash dopo la correzione. Rapporto: `work/store-readiness-20261008/ios-local-release-report.json`.
- In Cassa, il percorso iPhone mostra **Sede da configurare**: la sede Terminal italiana resta necessaria. Questa prova di stabilità dell'app non dimostra un pagamento contactless né l'approvazione Publishing Apple.

### Flusso iPhone e server completati nel codice

- Sessione SDK iOS persistente per il salone autenticato: preparazione all'accesso e al ritorno in primo piano, riuso del lettore durante la navigazione, annullamento e pulizia credenziali al cambio account/salone. L'avvio silenzioso non richiede permessi né accetta termini; la connessione SDK verifica lo stato Apple invece di usare un consenso locale.
- Attivazione e guida in Impostazioni e nel pannello Cassa, fuori dal checkout. Termini affidati all'interfaccia Apple/Stripe e al titolare. La guida segue la connessione; il pagamento si riserva soltanto dopo la guida. La build ordinaria senza SDK, Android e web conservano il proprio percorso.
- Esiti basati sul server, mai sul solo errore o timeout SDK. Ricevuta condivisibile per approvazione/rifiuto, con i dati carta mascherati e i dati EMV disponibili; per l'approvazione si include il collegamento alla ricevuta Stripe. Anche il controllo Cassa di un movimento già saldato conserva ricevuta e canale Terminal. Non è un documento fiscale.
- Distribuita la migrazione privata `20261008143000_cash_terminal_decline_notification` e aggiornato il solo servizio `cash-stripe`. I rifiuti verificati generano un avviso al titolare senza registrare incassi, con deduplicazione per evento Stripe e isolamento salone. La consegna push effettiva ad app chiusa resta da provare sul dispositivo.
- Aggiornato l'endpoint Connect già esistente: **7 eventi**, aggiunto `payment_intent.payment_failed`, conservati i sei precedenti e l'URL. Sorgente scaricato dal server dopo il deploy uguale a quello locale. Endpoint live: accesso senza login **401**, webhook senza firma **400**. Nessun pagamento reale eseguito.
- Superati TypeScript, controllo Deno dell'intera funzione, test funzionali sessione iOS e configurazione contactless, prove provider/esiti/ricevute, regressioni contabili PGlite e instradamento delle notifiche. Il test del vero handler Cassa copre ricevuta dopo saldo, QR invariato, dati provider non corrispondenti e assenza di mutazioni sul controllo di un incasso già confermato.
- Safari locale: Home e Cassa riaperte correttamente dopo ricaricamento. La precedente schermata di errore durante Fast Refresh non si ripresenta al caricamento completo; nessuna modifica ai provider web richiesta.

### Controlli ancora necessari prima della richiesta di pubblicazione Apple

La checklist resta aperta: i percorsi sopra sono implementati e verificati con test locali, ma servono il collaudo nativo su iOS stabile, la prova della ricevuta e della notifica di rifiuto ad app chiusa, PIN/accessibilità/fallback per l'Italia e i tre video effettivi. La ripresa del checkout deve usare un altro dispositivo, perché la registrazione dello schermo nasconde l'interfaccia Tap to Pay. Non segnare questi requisiti come superati con soli test di sorgente, configurazione o firma. Il profilo Development non autorizza TestFlight/App Store: occorre la successiva approvazione Publishing Apple.

## Stato precedente e contesto

## Stato corrente

Su richiesta esplicita del titolare, Tap to Pay è aperto a tutti i saloni sul server. Verifica live del 07/10: `CASH_STRIPE_PUBLIC_ENABLED=true` e `CASH_STRIPE_TERMINAL_ENABLED=true`, entrambi aggiornati il 06/10/2026 alle 17:49:46 UTC. Nessuna restrizione alla sola lista tester per il percorso live. La disponibilità effettiva richiede comunque account Stripe del salone abilitato, sede Terminal italiana, telefono compatibile e SDK presente nella build installata.

- Morph Hair Lab: nessun account Stripe collegato al controllo del 07/10. Occorre completare il collegamento prima di incassare.
- Apple: salvata la capacità Tap to Pay nell'App ID `com.marzix91.salonmanager`, team `KZB5LP9K6T`. I vecchi profili sono stati invalidati dall'aggiornamento delle capacità.
- Rigenerato il profilo App Store `SalonPro AppStore 2026-08-23 EAS` (UUID `0c398cd0-54a0-420f-827c-9b37a6f34738`). Il file scaricato e decodificato il 07/10 **non contiene** `com.apple.developer.proximity-reader.payment.acceptance`. Non è quindi prova di autorizzazione alla distribuzione Tap to Pay e non è stato caricato in EAS come profilo Terminal.
- Apple richiede il permesso di distribuzione per TestFlight e App Store. La capacità selezionata nell'App ID da sola non lo dimostra. Non avviare build iOS Terminal finché il profilo destinato alla build non contiene l'entitlement richiesto.
- Integrata la guida Apple nativa `ProximityReaderDiscovery` su iOS 18+, con guida alternativa nelle versioni precedenti e possibilità di riapertura. Si mostra prima della prima raccolta; il ritorno dalla guida precede l'avvio del pagamento.
- Profilo EAS per la futura build: `production-terminal`. Runtime separato `1.0.20-terminal2-meta1`. Le build ordinarie già installate restano sul proprio runtime, senza ricevere codice che presuppone la presenza dell'SDK.
- Verificati TypeScript, API Swift della guida su SDK iPhoneOS 27, autolinking Expo del modulo locale e configurazione Terminal. Superati test Deno Terminal, suite PGlite Terminal e regressioni Cassa Stripe. Nessun pagamento reale eseguito e nessuna build Terminal completata o pubblicata in questa sessione.
- Build Android sospesa su istruzione esplicita: prima prova sul Samsung collegato. Galaxy A14 SM-A145R collegato via USB il 07/10, Android 15; app DEV caricata con il codice locale e accesso SalonPro completato dall'utente. Provati Home/Agenda/Clienti/Cassa, moduli cliente e riapertura shop; corretta e riprovata la gestione tastiera Android nei due moduli cliente dello slot. Pagamenti digitali mostra QR/link attivo e Tap to Pay `Sede da configurare` per SalonPro. NFC presente, ma compatibilità Stripe e raccolta contactless non ancora verificate; il contenitore DEV installato non prova la presenza dell'SDK Terminal. Nessuna nuova build avviata. Evidenze e limiti in `work/samsung-qa-20261007/README.md`.
- Configurazione Android Terminal completata localmente: SDK Android 5.8.2, artefatto Tap to Pay abilitato e API minima 26 per il modulo; Tap to Pay richiede Android 13+ e viene controllato separatamente a runtime. Il plugin locale assicura che il controllo del processo Tap to Pay preceda il delegate Stripe e l'avvio React, anche con l'ordine effettivo dei mod Expo. Preflight isolato con plugin Stripe reale, doppia generazione, permessi, autolinking e runtime separato: superato, senza prebuild nel checkout né build. Prerequisiti e messaggi Android coprono DEV, posizione disattivata, NFC e ambiente non sicuro; l'attestazione SDK resta decisiva. Per un pagamento reale occorre disattivare opzioni sviluppatore/debug USB sul telefono e usare la futura build Terminal release. Nessun pagamento reale o simulato dichiarato collaudato sul Samsung.
- Pubblicazione sugli store sospesa su richiesta del titolare. Le modifiche UI di questa sessione (omaggio/pacchetti compatti, conferma separata, orari Mattina/Pomeriggio) sono ancora locali.

Fonti per i requisiti di distribuzione e formazione:
- https://developer.apple.com/documentation/proximityreader/setting-up-the-entitlement-for-tap-to-pay-on-iphone
- https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios&terminal-sdk-platform=react-native

Le sezioni sotto conservano lo stato storico del 28/09; i precedenti vincoli tester-only sono superati dall'autorizzazione esplicita successiva e dallo stato corrente sopra.

## Implementato

- Scelta QR/link e contactless nel checkout condiviso da Cassa e slot Agenda.
- SDK ufficiale Stripe Terminal React Native 0.0.1-beta.33; controllo modulo nativo prima del caricamento per proteggere le build già installate.
- Provider attivato soltanto nel pannello contactless; autorizzazione posizione, verifica telefono, selezione sede Terminal e interfaccia nativa Stripe per carta/wallet.
- PaymentIntent `card_present` creato esclusivamente dal server, importo/email dal movimento persistito; capture automatico, conferma verificata dal server.
- Un'unica prenotazione per movimento tra QR e Terminal; stessi parametri e chiave idempotente dopo timeout/rifiuto. Nessun nuovo tentativo dopo una creazione incerta oltre la finestra sicura.
- Webhook di successo/annullamento Terminal aggiunti a quello Connect esistente; aggiornamento atomico movimento e appuntamento.
- Pannello Agenda aperto sincronizzato con `incassato` dello snapshot; eventi realtime esistenti aggiornano Agenda/Cassa sugli altri dispositivi.
- Incassi manuali sui movimenti collegati aggiornano lo stato dello slot. Nessuna riscrittura dello storico.
- Pagamenti in prova non possono passare dal percorso Terminal che contabilizza gli appuntamenti reali.

## Distribuito sul server

Migrazione `20260928010000_cash_terminal` e funzione `cash-stripe`. Webhook Connect conserva gli eventi preesistenti e riceve anche `payment_intent.succeeded` / `payment_intent.canceled`.

Gate pubblico Stripe invariato, tester-only. `CASH_STRIPE_TERMINAL_ENABLED` deve rimanere disabilitato finché manca la qualificazione sul dispositivo. La disabilitazione blocca nuove raccolte, non verifica/annullamento di tentativi già esistenti.

## Verificato

- TypeScript e Deno check.
- Tre test server: identità/importo/modalità, gate chiuso, nessuna contabilizzazione per pagamenti rifiutati/in elaborazione.
- PGlite: esclusione QR/contactless, retry idempotente, movimento e appuntamento entrambi pagati, rifiuto secondo incasso, annullamento, incassi manuali, isolamento account e permessi.
- Regressione registro Stripe precedente superata.
- Safari DEV: Cassa carica e riapre correttamente il QR già associato al movimento; nessun addebito eseguito.
- Configurazione ordinaria senza SDK nativo; configurazione opt-in con runtime diverso `1.0.18-terminal1` (eventuale suffisso `-meta1`) e entitlement Apple.

## Non ancora operativo / prerequisiti

I profili di provisioning locali di SalonPro e SalonPro DEV NON contengono `com.apple.developer.proximity-reader.payment.acceptance` (verificato il 28/09). Occorre ottenere l'abilitazione Apple per gli App ID necessari e rigenerare i profili, poi compilare con `STRIPE_TERMINAL_BUILD=true`. Non avviare una build iOS a pagamento prima di questo preflight.

Serve una sede italiana in Stripe Terminal dell'account del salone. Il telefono deve superare i requisiti Stripe (NFC/OS/integrità/autorizzazioni); nessun Android collegato al controllo del 28/09. Non è stata eseguita una build Terminal né verificato un pagamento fisico su iOS/Android. Nessuna pubblicazione sugli store.

Prima dell'attivazione: collaudo SDK simulato isolato dai movimenti reali, compilazione nativa, verifica carta rifiutata/interruzione/riapertura e sincronizzazione su due dispositivi, poi un pagamento reale eseguito dal titolare e riconciliazione. Non aprire il gate pubblico automaticamente.

La fiscalizzazione A-Cube rimane solo sandbox gratuita, separata dal pagamento.

## Fonti ufficiali

- https://docs.stripe.com/terminal/payments/setup-integration?terminal-sdk-platform=react-native
- https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=react-native
- https://github.com/stripe/stripe-terminal-react-native

## Aggiornamento: richiesta Apple inviata

Il 28/09/2026, dopo autorizzazione esplicita dell’utente, inviato il modulo Apple Tap to Pay per SalonPro (App Store ID 6760840153), Stripe, Italia e pilot stimato sotto 100 dispositivi. Safari ha mostrato “Thank you for your submission” e revisione della richiesta in attesa. Nessun pagamento richiesto dal modulo. Questo NON equivale a entitlement approvato.

Vincolo esplicito: NON creare nuove build iOS o Android fino a nuova istruzione dell’utente. Nessuna build avviata. Nessuna integrazione di POS di altri fornitori: mantenere Tap to Pay, QR/link e semplice registrazione POS esterno.

Corretto il controllo dei permessi Android: l’SDK restituisce `{error}`, non un booleano; un rifiuto ora interrompe il percorso con una spiegazione. TypeScript, tre test Deno e suite PGlite Terminal superati. Il collaudo nativo resta da eseguire dopo la build autorizzata. Gate Terminal e pubblico invariati.
