# Supabase load investigation — 9 September 2026

All times below are UTC unless explicitly marked Rome. No account, customer or booking data was deleted during this investigation.

## Confirmed findings

- A local Chrome tab at `localhost:8082/prenotazioni` reached 2.9 GB of browser memory. This is browser memory, not database RAM.
- Between 19:11:37 and 19:13:08, database counters increased by 68 owner snapshot upserts and 93 portal publications. Three reads of the affected owner's stored snapshot, eight seconds apart, showed no payload or timestamp change.
- After closing only the local test tab, counters at 19:14:18 and 19:15:14 were identical: 1,231 owner snapshot upserts and 3,764 portal publications. This isolates that session as a source of repeated writes, although it does not by itself identify the exact React dependency or establish the cause of every earlier incident error.
- Following a fresh opening, counters at 19:17:29 were 1,233 and 3,777 respectively. Startup work is included; this is not yet a sustained idle result.
- Since the restart, logo metadata reads consumed about 1.59 seconds across 121 calls, while owner snapshot upserts and portal publications consumed approximately 1,187 seconds combined. These are accumulated database execution times, not CPU percentages or wall-clock outage duration.

## Today's changes reviewed

The production migration registry contains versions `20260909150000`, `20260909150100`, `20260909180000`, `20260909193000`, `20260909194000`, `20260909200000`, `20260909210000`, and `20260909220000`.

- Occasional customers: two migrations wrap explicit appointment/customer operations. The second refreshes agenda state after those operations; it does not schedule a recurring task.
- Logo/plaque: dedicated metadata table and storage buckets, text/font/finish options, per-workspace generation lock and quota. No recurring database job or trigger on the logo table was found. Image generation calls the external provider from an Edge Function, not Postgres. Metadata polling has a 60-second successful-read cache and an in-flight guard; the editor polls only while open and generating (or retrying an error).
- Live `salon-logo-plaque` is version 12, updated at 17:15:52. The single current job row is ready and last updated at 17:28:37; it is not currently generating. Local source was reviewed; byte-for-byte comparison with the deployed bundle was not performed.
- OTP recovery: explicit verification/completion calls, no recurring job. No evidence currently identifies it as the main sustained load source.
- Local AppContext changes in the other task's September 9 edit history cover customer-save acknowledgement, occasional customers, and registration acknowledgement/deadlines. The repeated synchronization code predates those particular edits. Git HEAD dates to June, so a whole-working-tree diff cannot be described as today's changes.

## Recovery changes and scope

- Applied `20260909220000_lightweight_public_availability_settings.sql` to production. It avoids projecting the full service catalogue when only workspace or availability metadata is required. A rollback-only regression compared outputs for every workspace before applying it; results matched.
- Changed production Data API pool size from automatic to 10. This is the PostgREST API pool, not the Supavisor pool. To undo, clear the field in Data API settings and save. No compute upgrade was purchased.
- Local code: focused, bounded availability polling in the requests screen; automatic portal-publication deduplication extended beyond Android. These frontend edits have not been distributed to store builds or production web.
- Temporary diagnostic logging was removed after inspection.
- Added an in-flight map around owner snapshot persistence. Previously, duplicate calls could all pass the last-successful-signature check before any write completed. Identical concurrent calls now share their promise; different payloads still run and failed calls remain retryable. `node scripts/assert-owner-snapshot-inflight.cjs` verifies 20 overlapping identical calls produce one write, changed payloads save, and failures release the pending entry for retry. TypeScript passes. This is a local frontend fix, not a deployed backend change.

## Follow-up observations

The fresh-tab reduction was not sufficient to declare the loop resolved: later counters rose again. Temporary metadata-only diagnostics identified changes in operators, customers, requests, and movement ordering. These observations do not establish that every changed field was incorrect. No account data was logged by the diagnostic, and the instrumentation was removed.

At 19:27:04 counters were 1,343 owner snapshot writes and 3,901 portal publications. The logo counter was 132 calls and 1.60 seconds total. The browser later became unavailable to the computer-use tool, so final rendered verification of the new in-flight fix remains outstanding. Direct read-only database and Metrics API checks remain available.

At 19:28:38, two authenticated Metrics API samples 61 seconds apart showed CPU busy including IO wait at 9.85%, with 0.29% IO wait. Memory excluding free/cache/buffers was 68.91%; MemAvailable was 270.49 MiB and swap in use 320.68 MiB. These are a short-window observation, not sustained recovery proof. The latest database check had zero active API queries, zero blocked queries, and the incident booking still accepted.

## Remaining verification

Repeat idle measurements after a clean page load and after normal navigation. Investigate a recurring cycle if it reappears. A Healthy badge, an isolated lower CPU sample, and successful read requests do not prove complete booking submission, retry, auto-acceptance, or device recovery. Do not declare all historical incident causes resolved from this evidence alone.

## Recovery follow-up at 21:36 Rome

- Closed the heavy local Chrome tab again at the user's request. Other browser tabs were preserved.
- Corrected composition fetch/subscription guards in Agenda and Services to require a real workspace UUID on every platform. Chrome had shown HTTP 400 requests containing `workspace-unconfigured`; the old guards only excluded that placeholder on iOS.
- Added `scrollFrontendToY(0, true)` to the successful client-booking completion path, after resetting booking auto-scroll state and the form.
- TypeScript and the concurrent-owner-snapshot regression test pass. A complete production-mode web export succeeds at `/tmp/salonpro-incident-web`. The initial export had captured a transient edit error; it was corrected, and the full export was rerun successfully.
- Two consecutive 61-second resource samples: 19:34:54 UTC CPU 13.19%, RAM excluding cache 48.05%; 19:35:56 UTC CPU 2.76%, RAM excluding cache 44.94%. Available memory increased from 458 to 486 MiB. Swap remained at 328 MiB.
- At 19:36:37 UTC: zero blocked queries; the incident booking remains accepted. In the previous three minutes, 36 five-second auto-accept runs, three auto-accept catch-up runs, three push jobs, and three operator-change expiry jobs all succeeded.
- Frontend changes and the exported web build are prepared locally, not deployed to production web or app stores. Full authenticated device/browser booking acceptance remains a separate uncompleted verification; these idle recovery samples do not establish it.

## Aggiornamento distribuzione 22:10 Europe/Rome

Autorizzazione utente: «e aggiornali no?». Avviato deploy Vercel produzione D1dJVggf53PkxvgGRneKKBVr4vRY, ancora in compilazione al momento di questa nota.
Nuove build EAS production: iOS 198 `0e29b2e2-dccc-4442-803f-ab1771e6195c`, Android 62 `47123923-f64f-4514-906c-fdb2ae909f4a`, runtime `1.0.13-meta1` secondo configurazione production corrente. Entrambe IN_PROGRESS. Invii pianificati: iOS `4e38c310-deb1-4182-9a8a-4c46533ca7c0`, Android `e4bb3611-786a-4239-9e9f-f75814249e20`; pianificato non significa caricato o pubblicato. Nessun OTA eseguito.

Nuovo controllo Metrics API: 20:08:51Z CPU 9.09%, RAM esclusa cache 63.25%, disponibile 320 MiB, swap 445 MiB; 20:09:52Z CPU 9.06%, RAM 63.02%, disponibile 322 MiB, swap 445 MiB. A 20:08:11Z zero query bloccate, due attive inclusa diagnostica. CPU bassa nei campioni; RAM e swap più alti dei precedenti campioni, quindi non attribuiti automaticamente alla sola cache.

Deploy web completato READY e alias salonpro.dev aggiornato. Verifica pubblica senza cache: `/` e `/join/salonpro-lcom` HTTP 200, Cache-Control no-store, bundle `entry-d3c64342d33b67e8d4e276d3fd1db4e5.js`. App native ancora IN_PROGRESS all'ultimo controllo.

## Verifica dopo navigazione utente, 22:17–22:22 Rome

L'utente conferma di avere usato Agenda/Richieste e cambiato servizio/giorno. I contatori owner/portal restano 1352/3953 fra 20:17 e 20:19:27Z: nessuna nuova scrittura dei due percorsi nel periodo. Sei letture disponibilità alternate fra due giorni: HTTP 200, 182/183/165/182/117/99 ms. Tutti i cron degli ultimi cinque minuti riusciti (60 autoaccept, 5 catchup, 5 push, 5 expiry).
CPU successiva alla prova 7.10% e 7.06%; RAM esclusa cache 68.54% e 68.33%; disponibile 222/223 MiB; swap 285/286 MiB. A 20:21:35Z zero query bloccate, zero idle-in-transaction, nessuna altra query client attiva. Nel successivo intervallo di 61 secondi: swap-out zero pagine, swap-in 12 pagine; IOwait totale 0.30 secondi sui due core (circa 0.25%). Questi campioni supportano recupero operativo nel test, non una garanzia assoluta di assenza di regressioni.
Frontend pubblico renderizzato tramite link QR e Continua sul Web; ingresso salone funzionante. Console rileva hydration React #418 recuperata e avviso istanze GoTrue multiple, non diagnosticati come causa del sovraccarico; non dichiarare console pulita. Nessuna prenotazione creata dal controllo.

iOS 198 build FINISHED ma submission ERRORED con SUBMISSION_SERVICE_IOS_OLD_APP_VERSION: 1.0.13 già utilizzata. Incrementata versione sorgente a 1.0.14 e avviata nuova build iOS production con auto-submit. Android 62 prosegue separatamente su 1.0.13; nessuna duplicazione avviata.

Nuova build iOS 1.0.14 (199) avviata: `1d4b3702-27ae-4961-b20f-8e3c19b90ee0`, submission automatica pianificata `547057b4-b6a8-4c60-85ec-b961c57a12ac`. Non ancora completata/verificata in TestFlight. Android 62 ancora in compilazione all'ultimo controllo.

## Indagine memoria e significato delle percentuali, 22:33–22:39 Rome

Verificato il codice pubblico ufficiale Supabase: `ComputeMetricsFooter.tsx` usa `useComputeMetrics.ts`, che fissa startDate/endDate al mount, finestra un'ora, interval 1h; `DatabaseInfrastructureSection.utils.ts` visualizza `series.avg_cpu_usage.totalAverage` e `series.ram_usage.totalAverage`. I valori del riquadro non sono campioni istantanei. Prima della nuova navigazione il riquadro mostrava CPU37/RAM71; dopo la nuova navigazione CPU37/RAM60. Questo spiega la non confrontabilità diretta con campioni Metrics API di 61 secondi; non dimostra da solo la causa di ogni differenza di RAM. Fonti https://github.com/supabase/supabase/blob/master/apps/studio/hooks/analytics/useComputeMetrics.ts e https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Observability/DatabaseInfrastructureSection.utils.ts .

Postgres ha shared_buffers256MiB, work_mem3500kB, maxconnections60. Dieci connessioni API più listener; sei avviate alle20:17:28Z. Letture ripetute del portale continuano ma snapshot writes owner1352/portal3953 ancora invariati alle20:34:49Z. Probe su una sola connessione temporanea, nessun dato persistente: pg_backend_memory_contexts totale1.90MB prima,4.56MB dopo una lettura portale,4.73MB dopo sei; non evidenzia crescita lineare e non basta a spiegare centinaia di MB. Accesso a memoria di altri backend e file /proc non disponibile al ruolo corrente: can_log_memory=false,can_read_server_files=false. Nessun tentativo di escalation, nessun backend terminato.

Metrics espone RSS per exporter postgresql e GoTrue, non una ripartizione completa di tutti i processi. Non attribuire RSS exporter a tutta la memoria di Postgres. Log cron2,326,465righe dal8aprile,488MB su disco: accumulo storico separato, non prova della causa RAM; nessun log cancellato.

Submission iOS1.0.14(199) FINISHED, Android62 IN_PROGRESS al20:39circa. Submission riuscita non prova approvazione AppStore.

Android submission ERRORED: Google Play rifiuta AD_ID perché dichiarazione console attuale nega l'uso dell'identificativo pubblicitario, mentre la build production corrente include il nuovo SDK Meta. Non è un errore di server/Supabase; non dichiarare Android pubblicato. iOS upload completato, stato review non verificato.

## Riduzione pool API a 5, 23:17 Europe/Rome

Utente chiede esplicitamente di sistemare la RAM. Prima della modifica: rilevazione diretta21:16:28Z RAM53.86%,409MiBdisponibili; pool massimo10,cinqueconnessioni operative+listener; precedente campione21:17:14Z RAM57.92%,373MiB,swap349MiB. Le connessioni create20:17:28Z risultano sostituite20:47:28Z, coerente con ricambio periodico del pool (non prova esclusiva di tutta la differenza RAM).

Modifica produzione: Data API Pool size10→5, salvato e confermato dopo ricarica UI. Metrics API conferma pgrst_db_pool_max5, timeouts_total0. Nessuna modifica a Supavisor, dati, account, prenotazioni o max_connectionsDB. Rollback: riportare Pool size10 e Save.
Dieci letture disponibilità simultanee su due giorni:10/10HTTP200,303–583ms. Campione successivo21:18:15Z e scrape21:19:01Z: RAM48.82%,455MiBdisponibili,swap293MiB,CPU11.49%. Il calo osservato coincide con la riconfigurazione/ricambio del servizio; durata e traffico non isolano una causa unica. Non promettere RAM fissa49% con qualsiasi carico.
Campione finale21:20:02Z: CPU9.44%,RAM50.08%,443MiBdisponibili,swap293MiB. RAM resta circa49–50% dopo prova concorrente; nessuna garanzia assoluta sui carichi futuri.

## Polling residuo corretto, 23:22–23:29 Rome

Nuova segnalazione utente RAM63% a riposo. Lettura diretta21:22:06Z: RAM51.95% esclusa cache,426MiBdisponibili,AnonPages300MiB,cache342MiB,buffer16MiB,swap293MiB. Pool5available5waiting0timeouts0. UI overview mostrava63%; aperto Observability/Database con Last10minutes per rendere visibile la finestra recente invece della media del riquadro iniziale. Non equiparare il63% della overview al campione corrente.

Identificati ricaricamenti completi residui: owner web ogni2s, client passive ogni4s, native booking ogni1.2s. Modifiche:
- owner full portal fallback15s, mantenuto fallback leggero booking1.6s e realtime;
- client passive15s, controlli periodici saltati quando documento nascosto/app background o inactive;
- native live tick1.2s ora legge solo impostazioni e occupazione del giorno, con guardia contro richieste sovrapposte; full catalogue resta su passive/realtime/azioni;
- test esecutivo scripts/assert-background-refresh.cjs conferma pausa/ripresa e assenza di full portal sul tick live, oltre alla coalescenza; tsc e regressione owner in-flight passano.

Web deploy in corso `Acrn3A9e5iEj7mBVA6YvpHswAmQa` con i cambiamenti web; ultimo miglioramento del tick solo-native successivo all'upload web, non rilevante per il ramo web che esce prima di quel timer. iOS OTA mirato a runtime1.0.14-meta1: fingerprint attuale4906421b512f84d849c4e2a936bc10e688d56ea7 identico alla build199. Primo export OTA interrotto prima della pubblicazione per includere il tick nativo leggero; nuovo export in corso. Non pubblicato OTA per vecchi runtime o Android. Android resta bloccato da dichiarazioneAD_ID come annotato sopra.

Campioni21:26:40 e21:27:41Z: CPU9.32/9.71%,RAM52.45/52.36%,disponibile422/423MiB,swap292MiB. Prima della nuova distribuzione frontend: non attribuirli già alla nuova patch.
Web nuovo deploy READY e salonpro.dev verificatoHTTP200senza cache su/ e/join/salonpro-lcom, bundleentry-e665eb19340042994775c2015a710cf0.js. iOS OTA pubblicato suproduction runtime1.0.14-meta1, group97a3d636-c693-43c5-9395-a741b909a0b6, update01a08813-fc0b-7904-be01-90b60adc628b. Non prova applicazione sul dispositivo, né raggiunge runtimevecchi1.0.13. Richiesta all'utente informazione su superficie e build effettivamente usate per la prova.
Campioni successivi alla pubblicazione21:31:07/21:32:08Z: RAM52.06/52.37%,disponibile426/423MiB,swap292MiB;CPU7.81/18.37%. Nessuna conferma ancora dei runtime dei telefoni: non attribuire causalmente a questa patch l'intera variazione RAM o dichiarare raggiunti tutti i dispositivi. Domanda asincrona su web/appAndroid e DEV/TestFlight/store ancora senza risposta al momento.
