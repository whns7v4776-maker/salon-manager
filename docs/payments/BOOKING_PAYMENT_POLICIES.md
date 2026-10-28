# Pagamenti alla prenotazione — implementazione e attivazione tester, 30 settembre 2026

## Scelte concordate

- Predefinito: paga in salone.
- Alternative: pagamento completo oppure acconto con percentuale intera 1–99%.
- Il cliente eredita la regola generale oppure ha una regola specifica impostata dal salone.
- Nelle richieste manuali il pagamento si richiede solo dopo l'approvazione. L'approvazione automatica segue lo stesso stato autorevole `accepted`.
- Rimborsi esclusivamente decisi dal salone, senza automatismi. Un rimborso non genera da solo un nuovo debito verso il cliente.
- Nessuna nuova build nativa, nessun cambiamento ai motori di navigazione e nessun addebito reale durante lo sviluppo.

## Percorso

La Cassa contiene il pannello espandibile **Pagamento alla prenotazione**, dopo Stripe. Lo swipe cliente e il menu web offrono il pannello separato **Pagamento del cliente**, che aggiunge **Segui la regola del salone**. Il server verifica l'appartenenza del cliente al workspace, la revisione salvata e, per le regole online, l'abilitazione Stripe a incassi e accrediti. Una scrittura concorrente richiede una rilettura, senza sovrascrivere la bozza.

Il frontend presenta il riepilogo prima dell'invio e il pagamento nella prenotazione accettata. Per le prenotazioni composte, ogni servizio confermato mantiene il proprio accordo, importo e pagamento: non è un checkout cumulativo unico. I centesimi sono arrotondati per servizio, sia nel riepilogo sia nel registro. Importi da anticipare inferiori a 0,50 € restano pagabili in salone.

Le condizioni vengono fotografate sulla richiesta nuova, senza applicarle allo storico. Dopo l'approvazione vengono creati i movimenti: acconto e saldo separati, oppure un solo movimento per il pagamento completo. Il saldo conserva il collegamento univoco legacy all'appuntamento; l'acconto è collegato tramite `booking_payment_orders`. Nessun cambiamento al registro degli appuntamenti senza nuova policy. I report già esistenti leggono i singoli movimenti effettivi.

La prenotazione approvata resta presente mentre attende il pagamento; questa versione non introduce scadenze o annullamenti automatici per mancato pagamento. Il pagamento usa Stripe Checkout e la riconciliazione firmata già presente. Una chiusura del browser non vale come conferma. I retry riusano lo stesso pagamento e gli stessi parametri di creazione anche passando tra cliente e Cassa. Acconto e saldo devono essere entrambi ricevuti prima di segnare l'appuntamento incassato.

Annullare conserva le ricevute, nasconde dai totali i movimenti annullati non pagati e permette di rimuovere lo slot dal calendario. Un pagamento realmente concluso in concorrenza con l'annullamento viene registrato comunque: il salone decide il rimborso. Il link SalonPro verifica che la prenotazione sia ancora accettata e tenta di scadere il Checkout quando non lo è. Una pagina Stripe già aperta può comunque concludersi durante la corsa con l'annullamento; nessun importo viene ignorato o rimborsato automaticamente.

## Verifiche locali

- TypeScript applicazione e `deno check --node-modules-dir=none supabase/functions/cash-stripe/index.ts`.
- `scripts/test-booking-payment-ledger.cjs`: database PostgreSQL PGlite reale; rete Stripe simulata. Regole generali/cliente, ereditarietà, revisioni concorrenti, isolamento, approvazione, importi autorevoli, arrotondamento, snapshot, retry, acconto/saldo, rimborso, annullamento con FK reali, pagamento tardivo e flusso contactless legacy.
- `scripts/test-cash-pagination.cjs`: 1.201 righe, prima pagina interamente annullata, ripresa con cursore, errore a metà lettura.
- `scripts/test-cash-summary.cjs` e `scripts/test-cash-sync.cjs`.

Dipendenze di test fuori dal progetto, in `/tmp/salon-booking-payment-tests`. Esecuzione:

```sh
PGLITE_MODULE=/tmp/salon-booking-payment-tests/node_modules/@electric-sql/pglite node --import tsx scripts/test-booking-payment-ledger.cjs
```

## Stato verificato del rilascio, 30 settembre 2026

Dopo il confronto con le funzioni SQL remote di incasso e il dry-run, sono state applicate solo le migrazioni `20260930140000_booking_payment_policies.sql` e `20260930141000_booking_payment_ledger.sql`. La funzione `cash-stripe` è stata pubblicata e `CASH_BOOKING_PAYMENTS_ENABLED` abilitato. Il gate pubblico resta disattivato e la allowlist conserva esclusivamente il workspace tester preesistente; il nuovo flag non scavalca questi gate.

Safari localhost autenticato: il pannello Pagamento del cliente carica le condizioni remote e salva correttamente. Verifica eseguita risalvando la stessa regola `inherit`, senza cambiare condizioni né effettuare addebiti; persistenza controllata sul database (revision 1).

Frontend pubblicato il 30 settembre 2026: Vercel production `dpl_5pTqn3hcr5f7obPimeXokjWrD4uF` su salonpro.dev e gruppo OTA `181f74f4-acb6-471d-a31f-0236c7fccf24`, canale production, runtime `1.0.18-meta1`, iOS e Android. Manifest di consegna verificati per entrambe le piattaforme. Nessuna nuova build nativa. Non presentare i test con rete Stripe simulata come un pagamento Stripe reale o una prova su telefoni.

Restano da verificare prima del rilascio pubblico:

1. Controllo autenticato del frontend distribuito: approvazione manuale, più servizi e cambio account; primo avvio su telefoni fisici. La pagina pubblica e gli asset produzione sono verificati, Safari produzione richiede accesso.
2. Stripe di prova con webhook reale: acconto, saldo, retry, annullamento, rimborso manuale e sincronizzazione su due dispositivi, senza pagamenti reali.
3. Tastiera e ancoraggio dei pannelli sui dispositivi fisici iOS e Android.

Se si ritira la funzione dopo l'attivazione, riportare prima le regole delle nuove prenotazioni a pagamento in salone. Il flag UI non cancella accordi già registrati, che vanno conservati e gestiti.

Documentazione Stripe di riferimento: [Checkout Session e stato del pagamento](https://docs.stripe.com/api/checkout/sessions), [PaymentIntent e importi minimi](https://docs.stripe.com/api/payment_intents).

## Avvisi di pagamento — 30 settembre 2026

- Migrazione `20260930170000_booking_payment_notices.sql`: riepilogo persistente derivato dai movimenti e push `booking_payment_due`, una sola volta per nuovo ordine dopo approvazione. Le richieste precedenti restano visibili nel riepilogo senza inviare push retroattive.
- Il worker ricontrolla il debito prima di consegnare la push: acconto ricevuto, annullamento, rimozione dello slot o no-show sopprimono un avviso non più valido. Il testo del pagamento non viene sostituito dal testo generico della conferma.
- Banner su ogni pagina attiva del frontend, indipendente dal consenso push e dalla lettura delle notifiche. Il riepilogo è limitato al cliente e al salone verificati dal server. “Visualizza e paga” apre i pagamenti dei singoli servizi, mantenendo il saldo in salone.
- Rilettura all'apertura, al ritorno nell'app, alla push in primo piano e ogni 15 secondi mentre la pagina è attiva. I pagamenti aperti vengono ricontrollati anche nella singola scheda. Non è una sottoscrizione realtime al database: la verifica periodica copre anche gli incassi registrati su un altro dispositivo.
- Un errore iniziale nella scheda di pagamento mostra “Riprova”, anziché nascondere il pagamento. Nessuna conferma di incasso viene dedotta dalla chiusura di Stripe.
- Test PGlite ampliati: una sola push dopo retry, approvazione differita, isolamento cliente/salone, acconto e totale, incasso in contanti, annullamento e no-show. Stripe resta simulato nei test automatici.
- Server pubblicato: migrazione, `cash-stripe` e `send-push`. Controlli TypeScript e Deno superati. Il sorgente remoto precedente di `send-push` coincide con quello locale salvo le modifiche mirate di questa revisione.
- Limite riscontrato nel collaudo remoto: il workspace tester autorizzato ha `subscription_status=expired`; l'endpoint pubblico restituisce correttamente `enabled:false`. Non sono stati modificati abbonamenti o gate e non sono stati inviati pagamenti/push di prova a clienti reali. Il collaudo fisico con Stripe/webhook reale necessita di un account di prova attivo e configurazione Stripe test; non va dichiarato concluso.

Rilascio avvisi: Vercel `dpl_9rvE1T8h277G66mWWxhkpy6rXwmh`, HTML e font Ionicons verificati su salonpro.dev; aggiornamento remoto gruppo `ed79c383-48a9-410b-b519-991542764459`, production, runtime `1.0.18-meta1`, iOS e Android. Configurazione nativa identica a quella locale verificata per il precedente rilascio. Nessuna nuova build. Evidenze: `2026-09-30-payment-notices-verification.json`.
