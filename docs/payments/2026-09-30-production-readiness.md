> Aggiornamento successivo: per le correzioni e i limiti del collaudo Morph vedere [collaudo Morph](2026-09-30-morph-pilot.md). I risultati sotto fotografano l’audit precedente alle correzioni.

# Cassa — verifica di preparazione alla produzione

Verificato il 30 settembre 2026 sul codice locale e sul progetto Supabase collegato. Verifica conclusa alle 21:30 circa, ora italiana.

**Esito: non pronta per il rilascio completo a tutti i saloni.** La base gestionale supera i controlli automatici eseguiti, ma ci sono un problema di autenticazione da correggere, funzionalità ancora limitate al collaudo e prove complete su dispositivi reali ancora mancanti. Questo esito non equivale a dichiarare inutilizzabile la registrazione manuale degli incassi.

## Quadro delle funzionalità

| Area | Evidenza attuale | Giudizio di rilascio |
| --- | --- | --- |
| Incassi, collegamento con Agenda, acconti e saldo | Test SQL isolati e test applicativi superati | Base verificata automaticamente; manca accettazione completa sui dispositivi |
| Aggiornamento tra dispositivi | Test superati su revisioni, isolamento del salone, riconnessione, eventi simultanei e risposte obsolete | Non ancora provato dal vivo tra due dispositivi durante un pagamento |
| PDF, Excel e archivio ZIP | Test di generazione e contenuto superati | Funzioni presenti; distinguere report gestionale da documento fiscale |
| Stripe QR/link | Funzione server attiva; apertura pubblica disabilitata, un solo salone nella lista di rilascio | Mantenere rilascio limitato |
| Pagamento alla prenotazione | Funzione abilitata entro i limiti di rilascio; nessun ordine di pagamento prenotazione nel salone tester al momento della lettura | Correzione autenticazione e collaudo completo necessari |
| Push e banner di pagamento | Collegamenti presenti nel codice; nessun nuovo pagamento completo eseguito durante questo audit | Consegna e aggiornamento effettivi non certificati |
| Ricevute fiscali online | A-Cube sandbox, salone tester; invio PDF al tester | Non abilitate all'emissione fiscale reale |
| Registratore fisico | Salvataggio di marca/modello; interfaccia dichiara che il collegamento non è disponibile | Non integrato operativamente |
| Tap to Pay | Flag server assente; aggiornamento app pubblicato con modulo disabilitato | Non operativo nella configurazione verificata |

## Blocco 1 — autenticazione del cliente per i pagamenti

Priorità alta prima dell'apertura pubblica.

Il ramo `POST cash-stripe?action=booking` viene eseguito prima dell'autenticazione del proprietario e non verifica una sessione cliente. La funzione `publicBookingPayment` determina il cliente usando codice salone, email e telefono forniti nel corpo della richiesta. La funzione SQL `booking_payment_customer_context` effettua esclusivamente la corrispondenza di questi dati con un cliente attivo.

Chi conosce questi dati può quindi essere riconosciuto come quel cliente e accedere alle operazioni previste dal ramo, compreso il riepilogo dei pagamenti da effettuare. Questi dati identificano una persona ma non dimostrano che il chiamante sia quella persona. Non è stata eseguita alcuna impersonificazione di clienti reali e questo rilievo non dimostra un addebito arbitrario su carte salvate.

Evidenza:

- `supabase/functions/cash-stripe/index.ts:48`: ramo pubblico prima del controllo utente.
- `supabase/functions/_shared/booking-payment.ts:18`: identità ottenuta dal corpo richiesta; `summary` restituisce gli avvisi del cliente risolto.
- `supabase/migrations/20260930141000_booking_payment_ledger.sql:209`: corrispondenza codice salone/email/telefono.
- Il sorgente scaricato dalla funzione pubblicata è identico byte per byte sia per `cash-stripe/index.ts` sia per `_shared/booking-payment.ts`.
- Una richiesta senza credenziali, con identità sintetica inesistente e operazione `summary`, restituisce HTTP 200 e `enabled:false`. Questo conferma la raggiungibilità del ramo, senza accedere a dati di persone reali.

Correzione richiesta: legare le operazioni a una sessione cliente verificabile sul server oppure a un'autorizzazione firmata e limitata al pagamento specifico. Il server deve ricavare il cliente dall'autorizzazione, non fidarsi dei dati di contatto inviati. Verificare rifiuto di sessioni mancanti/scadute, richieste per altro cliente o salone e riutilizzo di autorizzazioni.

## Blocco 2 — Stripe e prenotazioni senza prova completa di accettazione

Configurazione remota verificata confrontando i digest dei segreti con valori noti, senza leggere o pubblicare credenziali:

- `CASH_STRIPE_PUBLIC_ENABLED=false`.
- `CASH_BOOKING_PAYMENTS_ENABLED=true`.
- `CASH_STRIPE_ROLLOUT_WORKSPACE_IDS` corrisponde al solo salone tester.
- Credenziali Stripe e segreto webhook presenti; presenza non equivale a validità o corretto recapito degli eventi.

Nel database risultano tre associazioni Stripe complessive: due di prova e una reale. Il salone tester dispone di un'associazione di prova e di una reale. Non è stato verificato in questo audit lo stato corrente `charges_enabled`/`payouts_enabled` degli account su Stripe.

Nel registro `cash_stripe_payments` del tester risultano tre checkout scaduti, nessun pagamento registrato come riuscito e nessun pagamento collegato a una prenotazione. In `booking_payment_orders` risultano zero ordini. Questi dati non negano l'esistenza di transazioni in altri sistemi o test fiscali separati: indicano che questo registro non fornisce la prova del flusso completo richiesto.

Prima del rilascio servono prove complete in ambiente di test: acconto e saldo, pagamento intero, approvazione manuale prima della richiesta, rifiuto carta, interruzione e ripresa, doppio tap, evento Stripe duplicato o ritardato, cancellazione e rimborso deciso dal salone, modifica del servizio con conservazione degli importi ricevuti. Verificare contemporaneamente Agenda, Cassa, frontend cliente, push e banner su due dispositivi, anche dopo riconnessione. La successiva accettazione di un pagamento reale e del relativo rimborso richiede un'operazione consapevole del titolare.

## Blocco 3 — ricevute fiscali solo in collaudo gratuito

L'adattatore A-Cube rifiuta ambienti diversi da sandbox e usa esclusivamente l'endpoint sandbox. La funzione e il worker sono limitati al salone tester. L'interfaccia dichiara documenti privi di validità fiscale e configurazione di produzione da attivare separatamente.

Evidenze nel registro sandbox: sette prove, di cui due fallite; cinque documenti originali archiviati e due PDF di annullamento. Le email risultano `accepted` nelle prove riuscite: significa accettazione da parte del servizio, non prova di consegna alla casella del destinatario. Le prove fiscali con pagamento riuscito sono separate dal registro ordinario di Cassa.

Riferimenti: `supabase/functions/_shared/acube-receipts.ts:42`, `supabase/functions/cash-fiscal-sandbox/index.ts`, `components/cash-fiscal-panel.tsx:74`.

La presenza del segreto sandbox non certifica che l'accesso temporaneo A-Cube sia ancora valido. Il registratore fisico non ha un connettore operativo. Va rispettata la scelta dell'utente di mantenere solo il collaudo gratuito: non sono stati attivati contratti o servizi reali. Questa limitazione non impedisce da sola di rilasciare una Cassa gestionale con la fiscalità chiaramente indisponibile; impedisce di presentare la gestione fiscale come completa e operativa.

## Blocco 4 — contactless non abilitato nella configurazione attuale

`CASH_STRIPE_TERMINAL_ENABLED` è assente e il server lo interpreta come disabilitato. L'aggiornamento remoto pubblicato usa `terminalBuildEnabled=false`. Il componente nativo mostra esplicitamente che occorre una nuova versione quando manca il modulo Stripe Terminal o la relativa abilitazione.

Riferimenti: `supabase/functions/cash-stripe/index.ts:178`, `components/cash-contactless.native.tsx:9`.

Per dichiararlo operativo occorrono una build compatibile, configurazioni/abilitazioni della piattaforma e prove su iPhone e Android supportati. L'esito attuale della richiesta Apple non è stato verificato durante questo audit. Non è stata creata alcuna build.

## Altre limitazioni rilevate

- I totali principali del report rappresentano importi registrati in Cassa. Commissioni Stripe, rimborsi, accrediti e IVA non sono riconciliati automaticamente in quel riepilogo, come dichiarato in `src/lib/cash-workbook.ts:38`. Non presentarlo come contabilità netta completa; l'eventuale estratto Stripe è separato.
- Lo stato Stripe UI usa `charges_enabled` per `ready`, mentre il pagamento alla prenotazione richiede anche `payouts_enabled`. Uniformare la comunicazione degli stati per evitare un salone indicato come pronto quando quella funzione non è disponibile. Lo scenario non è stato riprodotto su un account reale in questo audit.
- L'elenco pagamenti della risposta `status` Stripe non è paginato. Il consumatore attuale lo usa per il richiamo sui rimborsi; con archivi grandi quel richiamo potrebbe non vedere tutte le righe. Non è una prova che i singoli checkout smettano di funzionare.

## Verifiche effettuate e limiti delle prove

- **16/16 suite superate**: collegamento Agenda/Cassa, registro acconti, normalizzazione movimenti, paginazione, collegamento fiscale, PDF periodo, riferimenti, report, aggiornamento dati, riepiloghi, Stripe, revisioni di sincronizzazione, Terminal, Excel Cassa, ZIP fiscale ed Excel fiscale.
- I test includono SQL eseguito in PostgreSQL isolato tramite PGlite e verifiche applicative. Rete/Stripe e parte degli eventi sono simulati. Non sostituiscono i pagamenti su Stripe né le prove native.
- **621 versioni di migrazione corrispondenti** tra locale e registro remoto, incluse le 22 più recenti relative al periodo di sviluppo Cassa. Questo verifica il registro delle migrazioni, non ogni definizione remota dopo eventuali modifiche manuali.
- Funzioni pubblicate attive: `cash-stripe` v21, `cash-fiscal-sandbox` v12, `cash-fiscal-worker` v10, `send-push` v129.
- Tentativi anonimi di lettura diretta di `cash_stripe_payments`, `booking_payment_orders`, `cash_fiscal_sandbox` e `cash_sync_revisions`: HTTP 401. Non è una certificazione completa di tutte le policy.
- Test di sincronizzazione: revisioni su inserimento/modifica/eliminazione, soppressione degli aggiornamenti senza cambiamento, isolamento del salone, permessi di sola lettura, accorpamento delle letture, ripetizione dopo evento simultaneo, riconnessione/ripresa e rifiuto di risposte obsolete.
- Il controllo web pubblico precedente ha raggiunto la schermata di accesso. Non è stata completata in questo audit una sessione Cassa autenticata né un confronto dal vivo tra iOS, Android e web.

Evidenze ripetibili in `work/cassa-production-audit/`: `tests.json`, `server.json`, `flags.json`, `migration-summary.json`, `deployed-source.json`, `unauthenticated-probe.json`. Nessuna credenziale inclusa in questi risultati.

## Decisione proposta

Mantenere i limiti di rilascio esistenti. Correggere prima l'autenticazione dei pagamenti cliente e completare il collaudo end-to-end dei pagamenti e della sincronizzazione. La Cassa gestionale può essere valutata separatamente per un rilascio circoscritto; fiscalità reale e Tap to Pay devono restare dichiarati non disponibili finché non superano i rispettivi requisiti.

Audit in sola lettura sul server: nessuna modifica ai flag pubblici, nessun incasso/rimborso reale, nessun messaggio ai clienti, nessun abbonamento, nessuna nuova build e nessun deploy del backend effettuato durante questa verifica.
