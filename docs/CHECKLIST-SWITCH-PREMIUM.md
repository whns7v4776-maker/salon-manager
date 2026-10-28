# Inventario operativo dello switch Premium

Aggiornato il 25 ottobre 2026. Richiesto da Marzio per non perdere nessuna funzione da collegare al server. Il registro storico resta [REGISTRO-RILASCIO-SERVER-PREMIUM.md](REGISTRO-RILASCIO-SERVER-PREMIUM.md). Questa checklist distingue implementazione locale, backend installato, distribuzione e collaudo.

## Regole da rispettare

- Nessuna sostituzione del database, cancellazione di dati, rigenerazione degli utenti o invalidazione generale delle sessioni. Conservare ID, prenotazioni, credenziali, associazioni, consensi e pagamenti esistenti.
- Il salone tester non è un ambiente di collaudo: prove di scrittura soltanto sulla copia isolata con dati sintetici.
- Cassa **sbloccata di default su web e app**. La protezione è facoltativa, per dispositivo/salone/titolare; solo l'attivazione volontaria può richiedere password o biometria. Conservare una scelta di protezione già salvata, senza attivarla automaticamente allo switch.
- Targhetta: due scelte indipendenti, gestionale e area clienti, entrambe disattivate di default. Nessuna attivazione automatica per i saloni esistenti e nessuna rigenerazione IA.
- Conservare le API storiche. Le app compatibili che non aggiornano possono mantenere la vecchia grafica e usare gli stessi dati. Gli avvisi già distribuiti alle app obsolete non vanno sostituiti con JavaScript incompatibile.
- Il rollback del frontend deve conservare tutte le prenotazioni e i dati creati dopo lo switch.

## Aggiunte e configurazioni server

| ID | Funzione | Collegamento | Stato verificato e lavoro residuo |
| --- | --- | --- | --- |
| S01 | Badge clienti avanzati | `customer_badge_policies`; `get_owner_customer_badge_summary`, `set_owner_customer_badge_policy` | Backend installato il 25 ottobre. Casi positivi/negativi passati sulla copia isolata; accesso anonimo negato anche via HTTP reale. Nessuna regola attivata automaticamente. |
| S02 | Scelta targhetta nel backoffice | `salon_brand_placements.owner_enabled`; `set_owner_salon_brand_placements` | Backend installato e collegamento presente nel Profilo salone web. Persistenza e isolamento provati sulla copia isolata; default reale `false`, salone tester non modificato. |
| S03 | Scelta targhetta nell'area clienti | `salon_brand_placements.frontend_enabled`; `get_salon_brand_placements` | Backend installato. Indipendente da S02; lettura condivisa web/app. Default reale `false`, lettura pubblica e divieto di salvataggio anonimo verificati via HTTP. |
| S04 | Idoneità, asset e firma della targhetta | `salon_logo_plaques` e storage già esistenti; `SalonBrandMark`, `ClientSalonBrand` | Riutilizzare la targhetta IA approvata. Verificare ON/OFF separati, immagine mancante, nome del salone, firma e proporzioni su ciascuna superficie. Nessun nuovo credito IA consumato. |
| S05 | Compatibilità delle sessioni cliente storiche | Tre routine, stessa eccezione `customer_portal_access_required`, risposta esplicita HTTP 403 | Patch `20261025230700_customer_portal_legacy_http_compat.sql` installata. Cinque trasporti e privacy passati nella copia isolata; al commit verificati invariati controlli, firme e permessi delle routine preesistenti. |
| S06 | Cassa: password e passkey web | Edge Function `cash-passkey`, tabelle protette già installate | Backend già rilasciato il 23 ottobre. Il 25 ottobre aggiunto, con approvazione del titolare, il solo origin `https://salonpro.dev`; mantenuti localhost:8084 e salon-manager-puce.vercel.app. Tre preflight 204, origin estraneo 403, POST senza accesso 401. |
| S07 | Cassa: protezione facoltativa app | SecureStore e autenticazione locale; verifica password del titolare esistente | Preferenza locale, nessuna nuova migrazione. Default sbloccato verificato nel componente reale con I/O dispositivo simulato; Face ID fisico è una prova distinta. |
| S08 | Sei differenze storiche già presenti | Pacchetti, resize, fedeltà, registrazione, portale privato e JSON null posa | Definizioni confrontate con il server: escluderle dalla riapplicazione. Non usare `db push` o `migration repair` indiscriminati. |

## Funzioni nuove o ridisegnate che riusano il server esistente

Nessuna nuova migrazione per il solo restyling. Questo non sostituisce la verifica dei gestori, del risultato server e della rilettura dopo refresh.

| ID | Area | Implementazione e collegamento da conservare | Verifica da tenere nel rilascio |
| --- | --- | --- | --- |
| F01 | Prenotazione guidata | `cliente-screen.tsx`, `client-booking-journey`, frame, step e navigazione; invio tramite gli stessi flussi server | Servizio → giorno → operatore → orario → riepilogo; avanti/indietro e bozza coerenti; nessun invio anticipato. |
| F02 | Giorni e orari liberi | RPC disponibilità giornaliera/batch già presenti; calendario facoltativo | Giorni consigliati e indicatori, scelta operatore, pieno/chiuso, refresh disponibilità e ricontrollo al submit. Griglia app compatta e leggibile. |
| F03 | Posa, abbinamenti e composizioni | RPC phased v4, dependency v1 e composition v1; regole e prezzi già installati | Ordine, lavoro/posa, operatori, durata e prezzo, inclusioni automatiche e riepilogo; nessun servizio duplicato. Casi SQL isolati passati. |
| F04 | Conferma invio e familiare/amico | `client-booking-dialog.tsx`; esito canonico dell'invio e conferma per altra persona | Popup di successo solo dopo invio riuscito, pulsante OK, errore/retry senza falsa conferma, chiusura delle conferme al cambio sessione. |
| F05 | Prenotazioni e notifiche cliente | `ClientNotificationsContext`, RPC lettura/visione esistenti, azioni appuntamento | Tutti gli stati letti/non letti, posa/collegati, annullamento e limiti temporali, calendario/telefono/WhatsApp senza modificare le destinazioni. Rosso soltanto sui contatori. |
| F06 | Comunicazioni del salone | `client-salon-communications.tsx`, `customer-communications.ts` e ricevute di lettura esistenti | Questo mese, archivio per anno/mese, testo e locandina leggibili, espansione, stato letto e contatore. Nessun messaggio inviato per QA. |
| F07 | Slot liberati e avvisi | `client-waitlist.tsx`, `client-booking-waitlist-choices.tsx`; join v2, lettura/cancellazione avvisi esistenti | Tutta la giornata/mattina/pomeriggio distinguibili, avviso già attivo, iscrizione/cancellazione, disponibilità sopraggiunta e sincronizzazione badge. |
| F08 | Shop | Catalogo, carrello, ordini, ritiro, scorte e RPC shop esistenti | Apertura compatta, ricerca, disponibilità, ordini precedenti e stato carrello; nessun ordine reale di prova. |
| F09 | Portafoglio cliente | Pacchetti, credito, regali, premi e fedeltà già installati | Lettura e utilizzo corretti; totali con servizi collegati/posa, saldo e storico conservati. |
| F10 | Impostazioni cliente e posizione | Impostazioni e consensi esistenti; directory/location native | Campi compatti, tutte le sezioni e temi, preferenze salvate, posizione facoltativa, comportamento con permesso negato. Nessuna richiesta di consenso reale durante QA automatica. |
| F11 | Accesso, logout e recupero | Supabase e protocollo portale privato esistenti; nessun cambio delle chiavi di storage | Ripristino accesso, sessioni, password/recovery, link e QR. Evitare il ritorno alla vecchia schermata dopo logout/refresh. |
| F12 | Banner di conferma cliente e backoffice | `premium-notification-banner` e gestori esistenti | Superficie scura su tema chiaro e chiara su scuro; testo leggibile e durata corretta, senza duplicare eventi. |
| F13 | Header, targhetta, custombar e scheletri | Componenti Premium condivisi; preferenze di aspetto esistenti | Web largo/stretto e app; safe area, fasce fisse, scroll interno, spazi inferiori liberi, hover della stessa misura della selezione. |
| F14 | Servizi e operatori backoffice | Editor e gestori canonici, salvataggi/composizioni/archivio esistenti | Non sostituire le API operative. Conservare draft, ordine, posa, prezzi, operatori archiviati e sincronizzazione. |
| F15 | Agenda e calendario backoffice | Motore e `AppContext` della produzione corrente | Inclusa la correzione già pubblicata il 23 ottobre: la riapertura del giorno non deve cancellare una chiusura parziale o l'assenza operatore. Diciannove regressioni passate; file `booking.ts` identico alla produzione corrente. |
| F16 | Cassa, movimenti e report | Dati economici, Stripe, spese, ricevute, report e API già esistenti | Nessun registro parallelo. Conservare totali, rimborsi e storico; importi visibili senza attivazione volontaria della protezione. Nessun pagamento di prova in produzione. |

## Evidenze e distribuzione

- Baseline remota prima dello switch: 676 migrazioni, 665 funzioni pubbliche, 133 tabelle pubbliche. Dopo il commit selezionato: 679 migrazioni, 670 funzioni pubbliche, 135 tabelle pubbliche. Aggiunte soltanto le due tabelle e le cinque funzioni previste; le tre risposte di compatibilità sono l'unico cambiamento ammesso nelle routine precedenti.
- Suite isolata: 35 gruppi e 435 verifiche SQL. Transazione protetta: altri 8 casi, inclusi annullamento integrale per una modifica imprevista ai dati o ai permessi. Il backup ripristinato nei test è sintetico, non quello di produzione.
- Targhetta e badge: test PostgreSQL mirati ripetuti positivamente il 25 ottobre. Controllare sempre salvataggio e rilettura; un valore ottimistico nell'interfaccia non prova persistenza.
- Cassa: componenti web e app del sorgente congelato provati con storage vuoto; nessuna preferenza creata automaticamente, protezione soltanto dopo scelta e conferma del titolare. Restano rispettate le protezioni già salvate.
- Sito `dpl_JADzPLycuNLVbV9zVdwTZns27NbG` promosso su `salonpro.dev` e `salon-manager-puce.vercel.app`. Verificati 7 percorsi, 24 font, 39 JavaScript e 4 asset storici sul deployment; sui due domini pubblici verificati HTML, collegamenti cliente e font Ionicons contro il pacchetto congelato. Conservati 611 file immutabili precedenti per le schede già aperte.
- App: pacchetti congelati iOS/Android provati sul ramo separato e poi ripubblicati su `production`, runtime `1.0.22-meta1` e `1.0.22-terminal2-meta1`. Gruppi `d21ca404-df43-4ee8-b968-338b26baa166` e `c6eb8511-dc9d-427e-9d33-29540a3e90df` rispettivamente. Gli ID effettivi e le prove di consegna fanno fede in `PRODUCTION-RELEASE-VERIFIED.json`; un aggiornamento offerto non prova l'applicazione sul singolo telefono.
- Avvisi legacy 1.0.14/1.0.16: quattro bundle iOS/Android già pubblicati il 21 ottobre e ricontrollati per hash; mantenerli. Non promettere copertura universale dei vecchi dispositivi non verificati.
- Build store del 26 ottobre: **1.0.23 iOS (216)** e **Android (78)**, stesso sorgente Premium in copia isolata, identificatori/firme/backend conservati, otto controlli nativi e verifica dei due artefatti superati. Entrambi gli invii finali confermati: Apple **In attesa di verifica**, rilascio manuale; Google **Modifiche in fase di revisione**, controlli rapidi preliminari ancora in corso alla prova e pubblicazione gestita attiva. Supporto dispositivi Android invariato. Prove in `work/premium-switch-20261025/STORE-REVIEW-VERIFIED.json`, `STORE-1.0.23.md` e `store-build-state.json`. Nessun cambiamento aggiuntivo al tester o alla produzione server/web per queste build; approvazione, pubblicazione e collaudo fisico non sono dichiarati completati.

Artefatti di dettaglio in `work/premium-switch-20261025/`: `release-plan.json`, `guarded-upgrade-manifest.json`, `guarded-upgrade-isolated-results.json`, `isolated-compatibility-results.json`, `inventory-server-metadata.json`, `inventory-brand-tests.log`, `inventory-badge-tests.log`, `inventory-cash-web-default.log`, `inventory-cash-native-default.log`, `cash-passkey-origin-verification.json`. Non distribuire snapshot privati, segreti o backup con gli asset pubblici.

## Chiusura richiesta prima di segnare lo switch completato

- [x] Applicare soltanto la transazione server selezionata e verificare il commit, le quattro RPC nuove, i permessi e i valori di default.
- [x] Terminare i controlli sul pacchetto web congelato e promuovere lo stesso deployment verificato; verificare i domini pubblici, i font e i link precedenti.
- [x] Verificare il runtime nativo e distribuire il pacchetto esatto; mantenere gli aggiornamenti degli altri runtime.
- [x] Distinguere pacchetto disponibile, aggiornamento applicato e collaudo fisico su telefono. La consegna è verificata; applicazione sul singolo dispositivo e prova fisica della produzione non sono dichiarate completate.
- [x] Annotare per ogni rilascio ID, data, prove, limiti e ripristino. Riferimento: `PRODUCTION-RELEASE-VERIFIED.json` e `RIPRISTINO.md` nella cartella del rilascio.
- [ ] Accettazione fisica della produzione sul telefono dopo l'applicazione dell'aggiornamento, e prova positiva delle nuove preferenze su un salone di collaudo dedicato, senza usare il tester attivo.
