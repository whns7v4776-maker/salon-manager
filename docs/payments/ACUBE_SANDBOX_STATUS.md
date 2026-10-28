# Cassa, Stripe e ricevute — verifica 27 settembre 2026

## Disponibilità

Funzioni nuove riservate al workspace tester SalonPro. Rollout pubblico Stripe non abilitato. Nessun abbonamento A-Cube, nessuna emissione fiscale reale e nessun addebito eseguiti durante il collaudo.

## Percorso implementato

1. Agenda: dettaglio di un appuntamento reale, non incassato e non segnato assente → **Incassa con Stripe**.
2. Il server prepara o recupera lo stesso movimento, usando prezzo e salone dell'appuntamento. Tentativi ripetuti non creano altri movimenti.
3. **Crea QR e link** genera il checkout Stripe. Il QR usa un collegamento breve; sul web si può aprire o copiare, sull'app condividere.
4. La conferma proviene da Stripe, con verifica di account, importo, valuta e sessione. Solo allora il movimento e l'appuntamento risultano incassati.
5. Per i nuovi tentativi, l'email del cliente viene fotografata dal collegamento appuntamento/cliente nello stesso salone. È passata a Stripe per la ricevuta di pagamento; non viene ricalcolata durante i retry. Senza cliente/email associati non viene inventato un destinatario.
6. Un link annullato non può più reindirizzare al checkout. Chiudere il popup, invece, non annulla il link.

La ricevuta Stripe è una conferma del pagamento: non è il documento fiscale italiano.

## Collaudo fiscale separato

- **Impostazioni Cassa → Ricevute fiscali** salva metodo (online/registratore), ragione sociale, partita IVA, modello e invio automatico.
- A-Cube sandbox collegato sul server, destinazione sandbox obbligatoria. Profilo fittizio `99926092711`.
- Prova sintetica da 25,50 €, IVA di prova 22%, senza modificare movimenti reali.
- Registro persistente degli invii, ID univoco e blocco degli esiti incerti: nessuna riemissione cieca.
- Elaborazione periodica server: controlla documento e, se abilitato, invia il PDF **solo** a salon.pro.app13@gmail.com anche con app chiusa.
- Invio email con acquisizione atomica e chiave idempotente. Stato accettato dal servizio distinto da consegnato; il secondo viene mostrato solo se confermato dal provider. Nessun reinvio dopo esito incerto.
- PDF scaricabile da web/condivisibile tramite il componente nativo. Il PDF sandbox A-Cube è un modello dimostrativo.
- Accesso A-Cube temporaneo: scade il 28 settembre 2026 alle 22:25 italiane. Il job `salonpro-fiscal-sandbox` si disattiva alla scadenza. Non è un'autenticazione di produzione permanente.

## Verifiche effettuate

- Safari autenticato: salvataggio configurazione, generazione documento, verifica stato `ready`, download PDF in Downloads.
- Ricevuta app `ACUBE2026/0422-9734`; email ricevuta nella casella Gmail del tester con allegato `ricevuta-collaudo.pdf`, verificata dalla ricerca Gmail alle 23:xx.
- Agenda Safari: apertura appuntamento tester, preparazione movimento da 25 €, checkout/QR creato e pagina Stripe aperta con importo corretto, annullamento verificato sul server (`expired`). Nessun pagamento eseguito.
- Test DB: isolamento saloni, importi, retry, doppia conferma, protezione modifiche, annullamento, autorizzazioni, snapshot email e mancata associazione tra saloni diversi.
- Test ricevute: solo sandbox, input, PDF, nessun retry automatico di emissione incerta.
- Test email: due richieste parallele inviano una sola volta; timeout conservato, nessun reinvio; conferma di consegna separata.
- Report CSV/XLSX/PDF: test passati per totali, periodo, storico, escaping e formule.
- TypeScript applicazione e controllo Deno delle funzioni passati.
- Il controllo generale `test:stable-owner-ui` fallisce sulla densità Agenda; riproducibile anche togliendo dal sorgente letto dal test le aggiunte di pagamento. Non è stato dichiarato superato né modificato il controllo.

## Ancora necessario prima del rilascio completo

- Collaudo di un pagamento reale concluso e riconciliazione/rimborso reali. Questa sessione ha creato e annullato link, non addebitato carte.
- Attivazione fiscale di produzione del fornitore, credenziali permanenti autorizzate, dati e regime IVA validati per ciascun salone. L'attuale adattatore emette **solo sandbox**.
- Collegamento del documento fiscale reale al movimento pagato e invio automatico al relativo cliente: non attivi in produzione. L'automazione verificata qui riguarda il documento sintetico sandbox.
- Resi/annullamenti fiscali e compatibilità dei singoli registratori: non implementati. Marca/modello sono una bozza, non un driver universale.
- Verifica sul dispositivo iOS/Android, pubblicazione frontend e poi abilitazione pubblica con collaudo di accettazione. Nessuna nuova build store è stata avviata in questa sessione.

## Riferimenti di prodotto e API

- Fresha, ricevute e checkout: https://www.fresha.com/help-center/knowledge-base/sales/133-customize-your-sales-receipt
- Treatwell, pagamenti integrati: https://www.treatwell.it/partners/soluzioni/pagamenti/
- Stripe receipt email: https://docs.stripe.com/api/payment_intents
- A-Cube autenticazione: https://docs.acubeapi.com/documentation/common/authentication
- A-Cube Smart Receipts sandbox: https://docs.acubeapi.com/documentation/italy/gov-it/smart-receipts/introduction
- Resend idempotenza: https://resend.com/docs/dashboard/emails/idempotency-keys

## Rifiniture del checkout

QR accorciato tramite redirect senza cache e senza dati personali nel collegamento; link scaduti bloccati. Rimossa la URL lunga dalla scheda e aggiunta copia con conferma. Controllo automatico in background con scarto delle risposte precedenti alle azioni dell’utente, senza disabilitare periodicamente i pulsanti.

L’incasso nell’Agenda è ora incorporato nel dettaglio dell’appuntamento, per evitare popup annidati. Le richieste hanno timeout espliciti. I pannelli Cassa si reinizializzano al cambio del salone/account durante il caricamento. Verifica finale nativa e responsive ancora da completare.

### Ultima verifica Safari

Ripristinata l’anteprima dopo aver liberato la seconda sessione locale bloccata e riaperto la Home: dati del salone caricati, Cassa con 203 movimenti e 25 € da chiudere, Stripe attivo, configurazione fiscale ed esito email conservati. Non è stata modificata l’autenticazione. Verificata visivamente la scheda di incasso incorporata nell’Agenda: importo 25 €, comando Crea QR e link, ritorno all’appuntamento distinto dalla chiusura del dettaglio; eliminato il pulsante di apertura duplicato. Non sono stati creati ulteriori link o addebiti per questa verifica.

## Aggiornamento 28 settembre — collaudo gratuito completo

Il titolare ha confermato di mantenere **solo il collaudo gratuito**, senza attivazione fiscale di produzione. Nessun abbonamento, addebito reale o apertura pubblica.

### Nuovo percorso collegato

In Impostazioni Cassa → Ricevute fiscali sono disponibili «Esegui pagamento di prova» e «Prova carta rifiutata». Il server usa esclusivamente una chiave Stripe `sk_test_`, l’account Connect di prova del tester e metodi di pagamento sintetici Stripe. L’importo è fisso a 25,50 € e non accede ai clienti né modifica `cash_movements`.

- Una singola riga persistente collega pagamento, ricevuta, email, rimborso e annullamento.
- Importo, valuta, modalità test, identificativo del tentativo e workspace sono controllati prima dell’emissione.
- Il worker completa il percorso anche senza pagina aperta. Le richieste Stripe hanno chiavi idempotenti; oltre la finestra sicura non si ricrea un pagamento sconosciuto. Le emissioni A-Cube incerte non vengono ripetute automaticamente.
- Il rimborso di prova genera un documento di annullamento separato. Originale e storico restano conservati, con PDF ed email separati.
- L’accesso A-Cube gratuito è temporaneo: la scadenza viene mostrata nella schermata. Non è un collegamento fiscale permanente.

### Riscontri effettivi dei provider

- Tentativo `e2af1dd4-3389-4f00-915c-96ed849d0ea1`: Stripe `livemode=false`, pagamento `succeeded`, 2550 centesimi.
- Ricevuta `ACUBE2026/0422-9735`, stato `ready`, email `accepted` dal servizio d’invio.
- Rimborso `succeeded`; annullamento `ACUBE2026/0422-9736`, stato `ready`, seconda email `accepted`. PDF scaricato e verificato, `artifacts/acube-sandbox/annullamento-collaudo.pdf`.
- Tentativo rifiutato `62fb2707-043f-40a5-99f0-da801acc7884`: pagamento `failed`, nessun documento creato, nessuna email.
- L’accettazione email non è equiparata a consegna: in questa sessione la casella Gmail non è stata riaperta perché il Mac si è bloccato.

### Validazione e limite del completamento

Sette test Deno passati (concorrenza, duplicati, importi/ambiente, rifiuto, esito incerto, rimborso, email separate), test PostgreSQL locale passato (unicità del tentativo pendente e autorizzazioni), controlli TypeScript/Deno passati. Funzioni e migrazioni distribuite sul server; frontend aggiornato in DEV. Non è stato effettuato un nuovo deploy pubblico o avviata una build.

La verifica visiva dei **nuovi** pulsanti è ancora da terminare: Safari non è controllabile con Mac bloccato; richiesto lo sblocco al titolare. Non è stata dichiarata eseguita la prova sui dispositivi iOS/Android. Il percorso fiscale di produzione e i driver dei registratori restano fuori da questo collaudo gratuito.

### Verifica interfaccia completata dopo lo sblocco

Safari DEV autenticato, 28 settembre mattina: eseguiti i pulsanti pagamento di prova, carta rifiutata, rimborso/annullamento e download PDF. Ricevuta `ACUBE2026/0422-9740` e annullamento `ACUBE2026/0422-9741` pronti. Nuova prova dopo la correzione: `ACUBE2026/0422-9742` pronta senza errore. Il pagamento non modifica i 203 movimenti reali o gli incassi confermati.

Corretto un falso errore: immediatamente dopo l’emissione, i dettagli A-Cube possono non essere ancora disponibili. Creazione pagamento e annullamento restituiscono lo stato in elaborazione; il worker verifica successivamente. Aggiunto aggiornamento automatico della schermata durante gli stati pendenti. Sette test Deno ripassati e TypeScript passato.

Download reali dalla UI verificati: `Downloads/ricevuta-prova.pdf` e `Downloads/annullamento-prova.pdf`, entrambi PDF validi da 27910 byte. Gmail del tester mostra le email ricevuta (ultima 07:22) e annullamento (07:14) con i rispettivi allegati. L’arrivo in casella è verificato visivamente; lo stato persistito rimane correttamente `accepted` finché il provider non restituisce una conferma di consegna.

Il precedente impedimento del Mac bloccato è superato. Verifica effettuata su Safari DEV; non equivale a una nuova build o a un collaudo fisico iOS/Android. Restano invariati sandbox fiscale, accesso temporaneo e restrizione al tester.
