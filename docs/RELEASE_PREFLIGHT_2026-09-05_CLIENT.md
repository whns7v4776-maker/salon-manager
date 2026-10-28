# Preflight cliente — 5 settembre 2026

## Verifica finale dopo profilo salone e pulsanti iPhone

- 43/43 script `test:*` superati; TypeScript completo senza errori.
- Test aggiuntivi superati: requisiti invio prenotazione, ordine step/abbinamenti, permessi profilo, presentazione profilo, persistenza branding e roundtrip dei 19 font, pulsanti semplici iOS, annullamento tap e foto operatore.
- Lint dei quattro componenti nuovi/modificati per i pulsanti e il pannello clienti: nessun errore. `git diff --check` pulito.
- Due controlli testuali obsoleti aggiornati: la vecchia tendina font è ora un picker con anteprima; contatto servizio e abbinamenti seguono il layout step 1 richiesto. Nessun requisito di salvataggio indebolito.
- `supabase db push --dry-run`: database remoto aggiornato, nessuna migrazione pendente. Nessuna scrittura server eseguita in questo preflight.
- Export produzione iOS, Android e web completato con exit 0, 37 rotte web. Artefatti locali in `/tmp/salonpro-final-preflight-20260905` (88 MB); non è una build nativa firmata né un deploy.
- Configurazioni risolte: versione app 1.0.11, dev `com.marzix91.salonmanager.dev` / schema `salonmanager-dev`; produzione `com.marzix91.salonmanager` / schema `salonmanager`.
- Ultime build EAS lette: iOS 194 e Android 58, entrambe FINISHED, profilo production. Contatori remoti e stato effettivo dei due store da rileggere immediatamente prima di creare/sostituire release.
- Spazio disponibile iniziale: 34 GiB. Nessuna pulizia distruttiva, nuova build EAS, submission o pubblicazione web.
- Dipendenze compatibili con Expo (`expo install --check`). Expo Doctor 17/18: metadati Notifee segnalati come non mantenuti e nessun metadato per il modulo locale `expo-wheel-picker-haptics`. Nessuna sostituzione automatica di librerie.
- Avviso sulla validazione `fileMapCacheDirectory`: la proprietà è effettivamente letta dalla versione Metro installata; non alterata la gestione cache. L'export termina regolarmente.

Confine QA: il primo tap su Apri clienti è stato confermato funzionante dall'utente su iPhone prima dell'estensione ai pulsanti condivisi. L'estensione con aptica/animazione è coperta da test automatici di isolamento iOS, disabilitazione, cancellazione e singola attivazione; non è stata riprovata fisicamente su ogni pulsante. Prima delle build è consigliato un ultimo giro reale di tendine, chiusure e invio prenotazione, più smoke test Android/web. Stato App Store Connect e Play Console non verificato live in questo passaggio.

Nessuna nuova build EAS, submission o pubblicazione web avviata durante questo allineamento.

## Correzioni reali

- Evento tap cliente Android: uso di `onPressIn`, supportato dal componente condiviso; controllo TypeScript completo pulito dopo la correzione.
- Primo avvio Agenda Android: attesa di `agendaDensityPreferenceHydrated`, come iOS. Il flag one-shot impedisce di reintrodurre lo skeleton nei refresh successivi.
- Logout owner: attesa effettiva di `supabase.auth.signOut()` prima di liberare la barriera del login successivo. Il vecchio timeout Android poteva lasciare l'operazione attiva in background.

## Test riallineati dopo ispezione delle implementazioni

- Archivio operatori: identificazione del blocco aggiornato, mantenute tutte le verifiche su esclusione, ordine di applicazione e cache.
- Impostazioni: parametro `active` e host Android preparato, separati dalle rotte iOS/web.
- Bootstrap web: verifica eseguibile della condizione auth, anziché ricerca del testo di una schermata nativa. Sessioni autenticate non devono riaprire il bootstrap per un refresh dati; auth non risolta resta protetta.
- Agenda: guardia iniziale Android aggiuntiva, clipping esterno dei picker, misurazione testo con codice interposto e builder estratto delle selezioni servizi. Preservati i controlli di comportamento corrispondenti.
- Nuovo `assert-client-booking-release-guards.js`: stato completo e ciascun requisito mancante; disabilitazione dei due pulsanti invio, giorni passati, filtri e tap Android.

## Confini di verifica

Prima esportazione di produzione iOS/Android/web completata. Migrazioni: 563 allineate, fino a 20260905120000. Expo Doctor: 17/18, segnalazioni di metadati per Notifee e modulo picker locale; nessun aggiornamento di dipendenze effettuato.

Ripetizione finale completata: 43/43 script npm passati, test aggiuntivo cliente passato, TypeScript senza errori, git diff --check pulito, export produzione iOS/Android/web terminato con exit 0. Log `/tmp/salonpro-alignment-*.log`. I controlli automatici non sostituiscono la prova fisica di logout/login e avvio Agenda sui dispositivi.
