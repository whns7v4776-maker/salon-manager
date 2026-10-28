# Pacchetti e vantaggi

Accesso generale: Clienti → Pacchetti e vantaggi, card dedicata sopra Rubrica clienti, sia app sia web. La console gestisce regole e cataloghi senza richiedere un cliente. Ricerca cliente per assegnazioni e saldi. Resta disponibile anche l’accesso dal singolo cliente.

## Attivazioni

Ogni salone ha tre interruttori indipendenti, inizialmente spenti: Abbonamenti, Punti fedeltà e Gift card. Spegnere una funzione ferma nuove assegnazioni/emissioni o l'accumulo di nuovi punti. I diritti già acquistati e maturati restano utilizzabili.

## Pacchetti

- Catalogo modificabile: nome, servizi o combinazioni inclusi, numero di utilizzi, validità in mesi, prezzo totale e sconto prodotti indicativo. Un utilizzo copre uno dei servizi scelti; una combinazione completa conta una volta. Nessun limite mensile implicito.
- Assegnazione nominativa dopo pagamento già ricevuto (contanti, POS o bonifico). Si registra un solo incasso, non un nuovo addebito. La validità include la data finale mostrata; il calcolo è data iniziale + mesi − un giorno.
- L'acquisto conserva una copia delle condizioni. Modificare o archiviare il catalogo non modifica acquisti precedenti. Lo sconto prodotti viene mostrato, ma va applicato dal salone: non esiste un checkout prodotti collegato in questa modifica.
- Frontend: mostra copertura disponibile sulle card e nel riepilogo, con verifica dell'identità. Il server conferma validità, saldo e servizio nella stessa transazione della prenotazione. Gli extra sono pagati normalmente.
- Agenda: applicazione esplicita ai vecchi appuntamenti ancora non effettuati/incassati. Nessun aggiornamento retroattivo automatico. Un pagamento già avviato deve essere gestito prima.
- L'utilizzo viene riservato, consumato quando effettuato, restituito quando interamente annullato/non effettuato. Una combinazione parzialmente effettuata non restituisce un intero utilizzo quando le altre parti terminano annullate.
- Una prestazione consumata conserva lo storico; non è prevista qui una rettifica amministrativa di utilizzi consumati. Cambiare la composizione dei servizi sottostanti richiede verifica del salone: il sistema non sostituisce silenziosamente i componenti già acquistati.

## Punti

Numero di punti configurabile per servizio effettuato. Una combinazione completa guadagna una sola volta. Non si assegnano punti semplicemente prenotando o incassando e non viene eseguito un recupero automatico dello storico.

Il salone configura premi e soglie. La conferma “omaggio consegnato” scala i punti sul server senza creare un incasso. Correggere una prestazione erroneamente segnata effettuata rimuove i punti attribuiti; il saldo può diventare negativo se sono già stati spesi. Ripristinare la prestazione ripristina i punti originari senza ricalcolarli con nuove regole.

## Gift card

Gift card nominative per clienti presenti in rubrica, con mittente, messaggio e scadenza facoltativa. Distinzione tra acquisto già pagato e omaggio del salone: l'omaggio non crea ricavi fittizi. Il codice identifica il buono e non è una credenziale pubblica per spenderlo.

Il salone riserva l'importo su un appuntamento dall'agenda. Il prezzo residuo è l'unico nuovo importo da incassare. Il credito riservato viene consumato a prestazione effettuata e restituito su annullamento/non effettuato. Una gift card può coprire più appuntamenti, fino al saldo disponibile. Non sono inclusi trasferimento fra clienti o rimborso automatico delle gift card.

## Vendita futura nell'app

Predisposti `service_package_orders`, `prepare_service_package_order` e `activate_paid_service_package_order`: condizioni congelate all'ordine, controllo di sessione/importo/valuta e attivazione idempotente. Sono funzioni riservate al backend. **Nessun checkout pubblico o nuovo addebito online è abilitato**: serviranno un endpoint autenticato, il pagamento e la verifica della firma del webhook prima di esporre la vendita diretta.

## Verifiche

`node scripts/check-benefits-database.mjs --deployed` esegue prove reali in una transazione annullata: acquisti/idempotenza, condizioni congelate, interruttori, coperture, cancellazioni, scadenze, combinazioni, extra, premi, gift card, autorizzazioni e attivazione futura da pagamento. Non lascia clienti, prenotazioni, incassi o premi di prova. Senza opzioni applica anche le migrazioni nella transazione di prova, per database in cui non sono già presenti.

Le migrazioni sono registrate sul server; la distribuzione dei client web/iOS/Android è un passaggio distinto. Le prove web locali non sostituiscono il controllo su iPhone e Android.


## Console e consegna dei buoni (completamento 1 ottobre)

- Modelli gift card modificabili/archiviabili, con valore, mesi facoltativi e messaggio. Usare un modello precompila una nuova emissione; i buoni esistenti sono immutati.
- Ricerca codice dal server limitata al salone; lettura QR con fotocamera nell’app. La scansione non spende il credito: apre il cliente intestatario.
- Il cliente vede stato e validità dei pacchetti, iniziative attive/disattivate del salone, premi raggiungibili, saldi gift card e buono con QR. Aggiornamento su riapertura e ritorno nell’app; nessun saldo di un’altra identità resta nel riepilogo.
- In prenotazione si mostrano pacchetti compatibili con servizio/data, credito gift card valido e premi raggiungibili. Il pacchetto selezionato cambia il prezzo; la gift card è segnalata come disponibile da applicare dal salone, non come sconto già applicato né esenzione da un eventuale anticipo.
- Buono scaricabile/condivisibile come PDF su native, pagina stampabile dedicata sul web. Codice e QR identificano il buono, non autorizzano un addebito pubblico. Include salone, intestatario e valore iniziale; saldo aggiornato sempre dal server.
- Invio email esplicito dal salone all’email presente nella scheda del destinatario. Funzione `send-gift-card` autenticata; nessun indirizzo arbitrario accettato dal client. Logo SalonPro inline, nome salone, dedica, codice, scadenza e collegamento al salone. Nessuna email inviata durante la verifica.
- Invio separato dall’emissione: retry idempotente con payload congelato e stato accepted/uncertain. Dopo 23 ore un esito incerto richiede controllo, non un reinvio automatico. Accepted significa accettato dal provider, non conferma di recapito.
- Date tramite selettore condiviso web/iOS/Android; importi e nomi personalizzabili, metodi e servizi a selezione.

La console, la ricerca, i modelli e la funzione email sono pubblicati sul backend. La nuova UI resta nel codice e nell’anteprima locale fino alla distribuzione web/native. Scanner, condivisione PDF e selettori nativi richiedono ancora prova su dispositivo. L’anteprima HTML dell’email è dimostrativa, non una prova di recapito nei client di posta.

## Interfaccia guidata

Panoramica, Abbonamenti, Fedeltà e Gift card sono viste separate. La scelta del cliente conserva la sezione aperta; la ricerca di un buono apre direttamente Gift card. Le opzioni del salone restano indipendenti dalle assegnazioni.

Il pacchetto viene preparato in tre passi: servizi raggruppati per mestiere con gli stessi colori del listino (incluse personalizzazioni), condizioni con proposte 3/6/12 modificabili, riepilogo prima del salvataggio. Il nome viene suggerito solo se ancora vuoto e un unico servizio è selezionato. Nessun prezzo viene inventato. Premi, regola punti, modelli e buoni mostrano i campi solo quando richiesti. Gift card: importi rapidi, personalizzazione e riepilogo prima dell'emissione.

Verifica Safari: apertura delle viste, separazione dei contenuti, selezione servizi Barber/Hair Stylist, avanzamento fino al riepilogo senza salvare. TypeScript ed ESLint completati. Nessuna migrazione o modifica ai motori di saldo/prenotazione in questa rifinitura.

## Premi fedeltà in Cassa — 1 ottobre 2026

`20261001210000_loyalty_checkout_rewards.sql` aggiunge quattro tipi: regalo personalizzato, sconto fisso, percentuale e servizio omaggio. Nome, descrizione, punti, servizi validi e scadenza sono configurabili. La cumulabilità autorizza l'applicazione su prezzi personalizzati/promozionali; coperture pacchetto/gift card e pagamenti avviati restano protetti. Gli appuntamenti legacy identificano il servizio per nome: in caso di nomi ambigui il server non concede automaticamente un premio vincolato a uno specifico servizio.

Cassa e dettaglio appuntamento mostrano automaticamente le opzioni valide; il salone sceglie il premio e conferma. Nessun punto viene speso al semplice caricamento della pagina. Il server ricalcola importo e disponibilità sotto lock, aggiorna appuntamento/richiesta/incasso e scala i punti nella stessa transazione. Un solo premio per appuntamento, idempotenza per appuntamento, snapshot immutabile delle condizioni. Il regalo libero richiede la conferma di consegna e non modifica il prezzo.

I premi monetari prenotati vengono consumati alla prestazione/incasso, oppure restituiti in punti in caso di annullamento prima dell'utilizzo; i premi consumati preservano lo storico. Il frontend cliente mostra valori, descrizioni e scadenza. Nessuna modifica alla regola di accumulo esistente.

Verifica: `node scripts/check-loyalty-checkout.mjs --deployed` esegue in rollback sia i test precedenti dei vantaggi sia sconti percentuali/fissi, servizio gratuito, saldo di Cassa, doppio utilizzo, condizioni congelate, punti insufficienti, scadenze, cumulabilità, annullamento, prestazioni già effettuate, incassi già ricevuti e isolamento del salone. Migrazione applicata e registrata sul server. Modulo verificato in Safari locale senza salvare premi fittizi; resta da collaudare su dispositivi iOS/Android e da distribuire il frontend aggiornato.

## Interfaccia e notifiche vantaggi

`benefits-design.ts` definisce campi delimitati con testo leggibile, superfici rosa neutre, azioni principali bordeaux e azioni secondarie discrete. Applicato ai modelli gift card, ai campi di abbonamenti/fedeltà, ricerca/assegnazione e console. Verificato il modulo gift card in Safari senza salvare dati di prova; verifica nativa ancora necessaria.

`20261001220000_benefit_notifications.sql` registra eventi deduplicati per cliente e mette le push nella coda esistente solo per dispositivi cliente attivi. Eventi: assegnazione pacchetto, emissione gift card, premio utilizzato, punti restituiti e soglia premio raggiunta. Nessuna notifica cliente per modifiche ai modelli o alle regole. Nessun invio retroattivo. La scheda frontend Notifiche contiene uno storico autenticato dei vantaggi (ultimi 100 eventi), aggiornato alla riapertura/ritorno nell'app e alla ricezione push. Non modifica il conteggio delle prenotazioni non lette.

`node scripts/check-benefit-notifications.mjs --deployed`: prove in rollback di vantaggi esistenti, premi, storico, duplicati, soglie, restituzioni, mancato invio senza dispositivo e singola push accodata al dispositivo destinatario. Non è una prova di consegna iOS/Android: nessuna push reale è stata inviata durante il collaudo. Migrazione applicata e registrata; interfaccia ancora da distribuire.
