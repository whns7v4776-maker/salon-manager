# Frontend: riapertura giorno pieno e card servizi

## Modifica

Il publisher del riepilogo giornaliero revocava `hasConfirmedBookingDay` quando il server confermava il giorno selezionato come pieno. Lo stesso publisher serve sia risposte nuove sia risultati recuperati dalla cache: un refresh dopo la selezione poteva chiudere il passaggio orari e nascondere gli avvisi di disponibilità.

Ora conserva il giorno confermato e cancella soltanto l'eventuale orario selezionato. I controlli di prenotabilità, operatori, durate, chiusure e disponibilità non cambiano. Nessuna modifica ai motori nativi di navigazione o ai gesti.

La larghezza delle card servizi usa la base già presente (176 unità app, 196 web, adattamento esistente per schermi molto stretti), senza dipendere dalla parola più lunga delle altre card. `flexShrink: 0` e il componente del titolo restano invariati: parole intere, nessuna ellissi, lettura orizzontale per parole eccezionalmente lunghe. L'altezza può ancora adattarsi al testo per non nasconderlo.

## Verifica

- `scripts/test-client-full-day-reentry.cjs` esegue il publisher reale estratto dal sorgente. Falliva prima della correzione, passa dopo: prima apertura, uscita/rientro simulati, cambio giorno e ritorno, cache, giorni diversi e risposta obsoleta.
- `npx tsc --noEmit`: superato.
- `scripts/assert-paged-public-booking-day-summary.js`: superato.
- Anteprima browser isolata con il componente titolo reale e il calcolo della larghezza estratto: 1, 2 e 20 servizi mantengono circa 176 px nel layout app e 196 px nel layout web. Identica posizione verticale del contenitore titolo in tutti e sei i casi. Include i tre nomi degli screenshot e una parola molto lunga. Questa è evidenza del layout React Native Web, non una prova su telefono fisico.
- Due controlli legacy (`assert-client-multiphase-slot-loading.js`, `assert-public-booking-authority-contracts.js`) falliscono identicamente anche usando il file precedente alla modifica: rispettivamente contratto di skeleton già non corrispondente e contratto estraneo della pagina Clienti. Non sono stati alterati per nascondere gli errori.

Non è stata eseguita una prenotazione o una registrazione ad avvisi su un cliente reale. La sequenza completa nell'app installata del tester resta da verificare dopo la ricezione dell'aggiornamento.

## Pubblicazione

Vedere `2026-09-30-client-full-day-reentry-release.json` per gli identificativi e i riscontri dei rilasci. Nessuna nuova build nativa e nessuna modifica al backend.

## Successiva revisione in sviluppo (21:49)

Dopo il riscontro del tester, la larghezza app di 176 era ancora eccessiva: ridotta a 136, lasciando il desktop a 196. Il titolo ora occupa tre righe di altezza costante, misurando le parole intere. Quando non bastano tre righe, scorre solo il contenuto del titolo senza allargare la card, troncare o ridurre i caratteri. La scala accessibilità adatta l'altezza delle tre righe.

Verificati il mantenimento di tutte le parole, il limite di tre righe e gli spazi sufficienti nel lettore; nell'anteprima con componente reale, 1/2/20 card misurano tutte 136 (app) o 196 (web), con spazio titolo 66 alla scala standard. Aggiunta una riga separata `Operatore: nome` all'avviso disponibilità. Queste ultime modifiche sono in sviluppo e non fanno parte degli identificativi di rilascio riportati sopra.
