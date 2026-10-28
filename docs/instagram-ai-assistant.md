# Assistente AI Instagram Direct — SalonPro

## Stato operativo

L'integrazione dell'account SalonPro è pubblicata su Meta e il percorso reale
Instagram → webhook → CRM → OpenAI → bozza è stato verificato il 30 luglio 2026.
Parte comunque in sicurezza:

- `automation_enabled = false`
- `dry_run = true`
- nessun segreto Meta/OpenAI viene salvato nel database
- i messaggi non testuali e i casi incerti passano a una persona
- ogni messaggio Meta e ogni lavoro sono idempotenti

La pubblicazione attuale è limitata all'uso diretto di SalonPro con le attività
collegate allo stesso account business. Se in futuro l'app gestirà gli account
Instagram di saloni terzi, verificare nuovamente App Review, Advanced Access,
OAuth, separazione tenant e condizioni Meta.

## Architettura

1. Meta chiama `instagram-webhook`.
2. Il webhook verifica `X-Hub-Signature-256` sul corpo originale.
3. Contatto, conversazione, messaggio ed evento vengono salvati in Supabase.
4. Un lavoro idempotente viene inserito in `instagram_inbox_jobs`.
5. `instagram-assistant-worker` prende il lavoro con lock concorrente.
6. OpenAI Responses API restituisce una decisione strutturata:
   risposta, intento, fase CRM, riepilogo, confidenza e passaggio umano.
7. In modalità prova la risposta resta `draft`. In modalità attiva viene inviata
   tramite Instagram Send API.
8. La knowledge base `instagram_knowledge_items` limita le risposte a fatti
   approvati e versionabili.
9. I casi delicati compaiono in `/instagram` nel pannello privato, con storico,
   fase CRM, invio manuale e approvazione della bozza.

## Segreti Edge Function richiesti

Configurare in Supabase, mai nell'app Expo o nel database:

- `META_WEBHOOK_VERIFY_TOKEN`: stringa casuale scelta per la verifica del callback
- `META_APP_SECRET`: App Secret Meta
- `META_INSTAGRAM_ACCESS_TOKEN`: token server dell'account professionale
- `META_INSTAGRAM_ACCOUNT_ID`: ID account Instagram professionale
- `META_GRAPH_API_VERSION`: versione corrente in formato `vNN.N`
- `OPENAI_API_KEY`: chiave progetto OpenAI dedicata
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: già disponibili alle Edge Functions

Il pannello legge lo stato "Pronto/Manca" dall'azione protetta `health` della
Edge Function. I valori dei segreti non vengono restituiti al browser e non
devono essere duplicati nell'ambiente del pannello.

## Configurazione Meta

Callback:

`https://<project-ref>.supabase.co/functions/v1/instagram-webhook`

Usare `META_WEBHOOK_VERIFY_TOKEN` come verify token e sottoscrivere almeno il
campo `messages`. Il webhook gestisce anche gli echo ignorando `is_echo`.

Configurazione verificata per l'uso reale SalonPro:

1. collegare l'app Meta all'account Instagram professionale SalonPro;
2. ottenere i permessi di messaggistica richiesti dal flusso Meta scelto;
3. pubblicare l'app e completare App Review/Advanced Access quando richiesto
   dal tipo di accesso o dall'uso con account di terzi;
4. impostare esplicitamente la versione Graph corrente;
5. verificare le finestre e le politiche di messaggistica Meta;
6. inviare un messaggio reale e controllare contatto, conversazione, bozza e handoff.

## Funzioni del pannello privato

- stato dei collegamenti senza esposizione dei segreti;
- metriche di contatti, conversazioni, bozze, handoff e lavori falliti;
- attivazione separata di automazione e modalità prova;
- soglia di confidenza, lunghezza massima e allowlist degli intenti;
- modifica della knowledge base approvata;
- storico della conversazione e metadati della decisione AI;
- fase CRM, presa in carico, chiusura e riattivazione AI;
- approvazione/invio di una bozza e risposta manuale.

## Deploy iniziale

```sh
npx supabase db push
npx supabase functions deploy instagram-webhook --no-verify-jwt
npx supabase functions deploy instagram-assistant-worker --no-verify-jwt
```

Tenere `dry_run=true` per la prima settimana di collaudo. Rivedere le bozze e
ampliare `business_context` solo con informazioni confermate. Attivare l'invio
automatico soltanto dopo test di duplicazione, firma errata, allegati, errore
OpenAI, errore Meta, richiesta esplicita di operatore e risposta manuale.

## Piano a fasi

### Fase 1 — Ricezione e bozze (completata)

- webhook verificato, CRM e storico;
- classificazione e bozze AI;
- pannello con configurazione e passaggi umani;
- metriche tecniche e test con account amministratori/tester.

### Fase 2 — Invio controllato (implementata, attivazione sospesa)

- attivazione per intenti a basso rischio (funzioni generali e avvio prova);
- knowledge base SalonPro versionata e modificabile dal pannello;
- handoff visibile a Marzio nel pannello;
- risposta manuale dal pannello e audit dell'autore.

### Fase 3 — Follow-up e conversione

- consenso e regole temporali prima dei follow-up;
- automazioni 2/7/20 giorni annullate appena il cliente risponde o rifiuta;
- pipeline CRM e misurazione prova → abbonamento;
- limiti di frequenza, quiet hours e opt-out.

### Fase 4 — Prodotto multi-salone

- credenziali OAuth e dati separati per workspace;
- ruoli operatore, inbox condivisa e SLA;
- WhatsApp/Messenger come canali separati;
- fatturazione, retention configurabile e strumenti GDPR.

## Limiti intenzionali della prima versione

- non legge dati privati di un abbonamento SalonPro;
- non effettua rimborsi, cancellazioni o modifiche account;
- non interpreta immagini, audio o allegati;
- non invia follow-up programmati;
- non conserva token Meta nel database;
- non sostituisce App Review, informativa privacy e valutazione GDPR.
