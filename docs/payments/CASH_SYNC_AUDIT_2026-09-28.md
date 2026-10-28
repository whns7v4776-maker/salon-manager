# Cassa: verifica server e sincronizzazione — 28 settembre 2026

## Correzioni

- Segnale `cash_sync_revisions` pubblicato in Realtime, leggibile esclusivamente dal workspace autorizzato; non espone dati di carte, Stripe o documenti fiscali.
- Invalidazione per movimenti, riferimenti, pagamenti/account Stripe, archivio/configurazione fiscale e abilitazione Cassa. Le modifiche al solo timestamp non generano nuovi segnali.
- Lettura autorevole Cassa su web e native, indipendente dal salvataggio del catalogo. Gli eventi durante una lettura vengono accodati; riconnessione, ritorno in primo piano e fallback di 30 secondi recuperano gli eventi persi. Nessuna promessa di realtime durante assenza di rete o sospensione OS.
- Normalizzazione del registro: due ID server diversi restano due movimenti anche con descrizione, importo e ora identici; prima potevano essere nascosti dai totali. Lo storico automatico resta separato dagli incassi confermati.
- Lettura paginata con cursore oltre il limite API di 1.000 righe. Una lettura fallita non sostituisce lo stato con un elenco vuoto.
- Rimosse dalla sincronizzazione legacy le riscritture/cancellazioni di record già persistiti; UUID assenti dal server non vengono ricreati. Restano gli inserimenti legacy non ancora persistiti.
- Riallineamento del flag incassato degli appuntamenti collegati ai movimenti, senza modificare gesti, navigazione, drag o motori nativi.
- Stripe conserva l’ultimo stato verificato durante il controllo, separandolo dal caricamento dell’azione. Cache per workspace; errore di collegamento esplicito; protezione dalle risposte dopo cambio workspace.
- Archivio fiscale aggiornato mentre aperto; configurazione fiscale aggiornata senza sovrascrivere la bozza in modifica.
- Attivazione Cassa mobile: gli aggiornamenti ricevuti nella finestra di stabilizzazione vengono differiti, non scartati.
- Riferimenti carta: creazione, predefinito ed eliminazione atomici sul server, con lock del workspace e autorizzazione esplicita. Aggiornamento UI dopo conferma.
- Inserimento manuale: ID riutilizzato al retry nella stessa sessione per evitare duplicazioni dopo una risposta persa. Non è una coda offline persistente.

## Verifiche eseguite

- TypeScript senza errori.
- Test database: Stripe, appuntamenti, Tap to Pay, duplicati, importi, workspace, stato pagato, annullamento, protezione da metodi simultanei.
- Test nuove revisioni: insert/update/delete, esclusione no-op, RLS tra workspace e nessuna scrittura client diretta.
- Test riferimenti atomici: default unico nella transazione, validazione, eliminazione con sostituzione del predefinito, isolamento.
- Test coordinatore: lettura iniziale anche in tab web in background, nessuna sovrapposizione, evento accodato, riconnessione/ritorno attivo, risposta tardiva scartata dopo smontaggio.
- Test paginazione: 1.201 righe, archivio vuoto, errore a metà lettura.
- Test riepilogo, CSV, periodi/DST, PDF, workbook XLSX, archivio fiscale XLSX e ZIP.
- Server reale: due connessioni WebSocket indipendenti hanno ricevuto la stessa revisione. Questa prova usa connessioni di test server, non due telefoni fisici.
- Riferimento temporaneo di collaudo creato e rimosso dal server; nessun riferimento di test rimasto. Visto in Safari dopo caricamento; la verifica visiva della rimozione senza reload non è conclusiva perché il browser è stato ripreso dall’utente.
- Safari: Cassa caricata con Stripe Attivo; premendo Aggiorna stato cambia il pulsante ma il badge Attivo rimane confermato.

## Limiti / gate rimasti

- Nessuna nuova build o pubblicazione store. Necessario collaudo su due dispositivi fisici con versione aggiornata prima di dichiarare conclusa l’accettazione mobile.
- Il test generale `test:stable-owner-ui` si arresta sul contratto del selettore densità Agenda; il relativo motore non è stato modificato in questo intervento. Non considerare tutta la suite generale verde.
- Nessun pagamento reale, invio a clienti o emissione fiscale di produzione durante questi controlli.
- Stripe resta nel rollout tester; fiscalità resta nel collaudo gratuito. Tap to Pay resta soggetto a build compatibile, abilitazione e collaudo telefono.
