# SalonPro 1.0.14 — 10 settembre 2026

Richiesta autorizzata: configurare R8, verificare prima di consumare build, creare una build production per piattaforma, inviare Apple e Google alla revisione e pubblicare il web.

## Preflight

- Contatori iniziali EAS: iOS 199 (1.0.14), Android 62 (1.0.13). Entrambe le build precedono le modifiche di questa sessione e non sono riutilizzabili per questo rilascio.
- App Store: 1.0.13 distribuita; bozza 1.0.14 preparata con note italiano/inglese. Google Play: bundle 61 attivo, nessuna modifica pendente nella panoramica pubblicazione.
- Spazio libero verificato prima dell'archivio: 41 GiB, poi 37 GiB dopo la compilazione locale.
- Supabase dry-run: remoto aggiornato, nessuna migrazione pendente. Nessuna modifica al database durante il rilascio.
- Dipendenze Expo allineate; TypeScript completo e diff whitespace passati.
- 45 script test passati complessivamente. Tre aspettative testuali obsolete sono state aggiornate e rieseguite: SalonLogoEditor, normalizzazione nome da stato corrente, idoneità trial. Nessuna logica applicativa modificata per far passare questi test.
- Archivio EAS ispezionato: guida, Agenda, GutterScrollView e plugin R8 presenti e identici ai sorgenti.
- Prebuild production iOS e Android riuscito in copia temporanea: versione 1.0.14, identificativi com.marzix91.salonmanager, configurazione Meta coerente, R8 e shrink resources attivi, proguard-android-optimize.txt incluso.

## Verifica R8 locale

- assembleRelease riuscito in 35m 32s, tutte e quattro le architetture. Compilatore R8 8.11.18; generati mapping, configuration, seeds, usage e resources.
- Il progetto Android locale ignorato usa ancora l'identità DEV e la firma locale: questo APK serve esclusivamente a verificare compilazione e ottimizzazione, non è l'artefatto destinato allo store. Il prebuild production separato verifica la configurazione destinata a EAS.
- Regole ProGuard delle librerie e dell'app preservate. Avvisi della dipendenza Amazon Appstore SDK sulla stack map riguardano versioni future di R8; nessun errore di compilazione.
- Nessun dispositivo Android collegato: non è stata eseguita una prova runtime della release su telefono.

## Build e distribuzione

- Export produzione iOS, Android e web completato con exit 0 in `/tmp/salonpro-release-export`.
- Contatori remoti ricontrollati immediatamente prima dell'avvio: iOS 199, Android 62.
- Unico avvio EAS multipiattaforma, profilo production con invii automatici production; incrementi confermati a iOS 200 e Android 63.
- Android 63: `66d20c9e-0520-476a-8768-2788cedbd271`.
- iOS 200: `011fcb5a-6004-4476-adc9-d3d713055377`.
- Submission Android: `98b49bc8-10f1-4c18-8681-e976b176f976`.
- Submission iOS: `fbba8708-13f9-4eed-821b-ae241f314e79`.
- Credenziali remote esistenti verificate. Archivio 42.6 MB per piattaforma.
- iOS 200: build FINISHED, submission FINISHED. IPA firmata scaricata e Info.plist verificato: identificativo production, versione 1.0.14 e build 200.
- Apple: build 200 elaborata, associata e salvata; invio finale App Review confermato con “1 elemento inviato” e versione in attesa di verifica.
- Apple ha inizialmente bloccato l'aggiunta alla verifica per dichiarazione privacy non allineata a NSUserTrackingUsageDescription. Nessun problema di compilazione e nessuna nuova build creata.
- Verificati sorgenti Meta, consenso/ATT e manifest privacy dei framework realmente inclusi nell'IPA. Aggiornata la scheda Apple: ID dispositivo (funzionalità, analisi, marketing sviluppatore/pubblicità terzi, collegato e tracking); interazione con il prodotto (analisi, marketing sviluppatore/pubblicità terzi, collegato e tracking); altri dati tecnici (analisi, non collegati, senza tracking). Dati personali esistenti e crash mantenuti. La pagina pubblica mostra ora identificativi/dati d'uso utilizzati per monitoraggio. Riferimento: https://developer.apple.com/app-store/app-privacy-details/.
- Deploy Vercel production avviato dopo tutti i controlli locali.
- Android 63: build FINISHED al primo tentativo. AAB verificato: mapping R8 8.11.18 incluso in BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map e autorizzazione AD_ID presente.
- Primo invio Android fermato dalla vecchia dichiarazione Play “non usa ID pubblicità”. Corretta la dichiarazione a Sì, finalità Analisi e Pubblicità/marketing, senza disattivare i controlli sulla permission. Si riutilizza lo stesso AAB 63; non viene creata una nuova build.
- Play Data safety era impostato a nessuna raccolta. Corretto con i dati effettivi account/profilo (6 categorie), abbonamenti, foto, appuntamenti, contenuti inseriti, diagnostica, interazioni e identificativi. Distinte finalità di servizio, facoltatività dei contenuti e misurazione Meta. Trasferimento cifrato e creazione account password/OTP dichiarati; nessun badge di audit indipendente dichiarato.
- Link privacy Google aggiornato a `https://salonpro.dev/privacy`. Pagina per richieste manuali di cancellazione account/dati aggiunta in `public/delete-account.html`, coerente con il canale supporto già esistente; verificata HTTP 200 e nel browser.
- Seconda submission Android, stesso build ID e stesso versionCode 63: `ffa285a1-3c2f-4fe9-b40c-9f2ccb03be6d`. Nessuna ricompilazione.
- Seconda submission Android FINISHED: log “The app has been submitted successfully”.
- Completato anche l'allineamento delle categorie Apple preesistenti: indirizzo fisico, foto, contenuti/prenotazioni e cronologia acquisti collegati all'account per funzionalità, senza tracking; altri dati includono informazioni facoltative del profilo e metadati tecnici (funzionalità/analisi, collegati, senza tracking). Scheda con 12 categorie, nessuna configurazione pendente, versione ancora “In attesa di verifica”.

## Web

- Deploy `dpl_DqQgFyoDSc9gWtG4L2f7BRrMF3p6` completato con exit 0, alias `https://salonpro.dev` aggiornato.
- Deployment: `https://salon-manager-8tuqlw61g-6rwdtrgntc-3362s-projects.vercel.app`.
- Verifica HTTP senza cache: `/` e `/cliente` 200 con no-store/no-cache, associazione Apple 200 application/json.
- Bundle pubblico `entry-842e9768cc3555d38ac96ec1b614afea.js` 200, versione 1.0.14 e nuova guida presenti.
- Browser: percorso salone renderizzato; passaggio Lato cliente riuscito, pagina cliente verificata visivamente. Nessun login o modifica di dati production nello smoke test.
- Secondo deploy web, per aggiungere solo la pagina richiesta da Play: `dpl_GhvBjgH7BHuMfzkeKpARPJQ72xwd`, alias salonpro.dev, exit 0. URL `https://salon-manager-j89rvpkeq-6rwdtrgntc-3362s-projects.vercel.app`. I binari mobile non cambiano.

## Stato finale verificato nelle console

- Apple: versione 1.0.14, build 200, “In attesa di verifica”.
- Google Play: versione 1.0.14, codice 63, “Modifiche in fase di revisione”; controlli rapidi automatici ancora in corso. La console specifica che il passaggio alla revisione avviene al termine dei controlli. Inclusi rilascio production, Sicurezza dei dati, URL privacy e dichiarazione ID pubblicitario aggiornata.
- Esattamente due build EAS a pagamento avviate, entrambe riuscite al primo tentativo. Android ha richiesto soltanto un secondo invio dello stesso AAB dopo la correzione della dichiarazione in console.
- Web production pubblicato e verificato. Nessuna approvazione degli store ancora dichiarata; non è stata effettuata una verifica runtime completa sui dispositivi fisici.
