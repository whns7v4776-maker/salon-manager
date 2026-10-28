# Cassa — collaudo Morph Hair Lab

## Ambito

La distribuzione Stripe resta privata: salone interno di collaudo e Morph Hair Lab
(`1f3ccfab-f5d8-4022-9064-ec7f133e65c3`). Nessuna apertura a tutti i saloni.
Nessuna nuova build nativa e nessun abbonamento fiscale attivato.

## Correzioni pubblicate

- Il contesto pagamento riconosce `is_internal_tester`, come il portale di prenotazione.
  Prima i tester gratuiti con stato abbonamento `expired` erano esclusi.
- Email, telefono e codice salone da soli non autorizzano quote personalizzate,
  riepilogo, verifica o creazione di un pagamento cliente.
- La password verificata dal database emette una sessione opaca, con scadenza a
  sette giorni e invalidazione quando cambia la password. Nel database si conserva
  solo l'hash del token. La tabella è inaccessibile al client.
- Il frontend acquisisce la sessione al login/registrazione. L'app può riconfermare
  tramite la password già nel portachiavi; in caso contrario propone la verifica.
  Gli account senza password devono impostarla tramite il recupero già esistente.
- Stato Stripe “Attivo” solo con incassi e accrediti abilitati. La segnalazione dei
  rimborsi usa una query limitata, senza scaricare tutti i pagamenti.
- Step 4: continuità del blocco bianco tra nota e riepilogo; nota in riquadro dedicato.
  Restano invariati i riferimenti e le coordinate di scorrimento dei due contenuti.

## Verifiche

- TypeScript ed esportazione web completati.
- Tutti i 16 test Cassa superati (movimenti, saldi, rimborsi, sincronizzazione,
  report Excel/PDF e archivio fiscale di prova).
- Test integrato prenotazioni: acconto/saldo, approvazione, idempotenza,
  notifiche in coda, importi server, rimborsi manuali e modifiche appuntamenti.
- Sessioni: assenza/token falso/scadenza/cambio password rifiutati; privilegi anonimi negati.
- Test stato Stripe: quattro combinazioni incassi/accrediti, errore di rete,
  query rimborsi limitata e filtrata sul salone.
- Sul server Morph, quote/summary/check/checkout con identità reale ma token falso
  restituiscono errore senza dettagli; tabella sessioni negata al client anonimo.
  Nessun pagamento creato e nessuna notifica inviata durante questa verifica.

## Prima degli incassi online reali

Alla verifica Morph non ha righe in `cash_stripe_accounts`: Edoardo deve usare
**Collega Stripe**, completare i dati del proprio salone e ottenere lo stato
**Attivo**. Non è corretto incassare sul collegamento del salone interno.
La registrazione degli incassi in salone resta distinta dall'incasso Stripe.

Le ricevute fiscali sono esclusivamente sandbox, senza validità fiscale. Il Tap
to Pay non è abilitato nel runtime installato e richiede una futura build autorizzata.
Non sono stati eseguiti addebiti reali, verifiche di consegna push su telefono,
né una prova simultanea su due dispositivi di Edoardo. I test automatici non
costituiscono prova di questi passaggi e non garantiscono assenza assoluta di bug.
