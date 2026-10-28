# Rilascio SalonPro 1.0.13 — 6 settembre 2026

Richiesta: due nuove build production, invio alla verifica Apple e Google, poi deploy web. Autorizzazione esplicita a procedere senza conferme aggiuntive.

## Preflight

- Safari: Apple 1.0.12 pronta per la distribuzione, build 195. Google invio 29, produzione 1.0.12, stato Pubblicata.
- Contatori EAS remoti verificati prima del lancio: iOS 195, Android 59.
- Versione impostata a 1.0.13. Nessuna modifica funzionale introdotta nel preflight.
- Spazio disponibile: 32 GiB. Nessuna pulizia distruttiva.
- Supabase dry-run: database remoto aggiornato, nessuna migrazione pendente; nessuna scrittura DB.
- TypeScript completo passato; test giorni disponibili, intervalli slot, derivazione clienti e colori persistenti passati.
- Suite npm: 41 controlli passati inizialmente; due script con aspettative testuali obsolete riallineati dopo verifica del codice e passati. Verificano colori persistenti con fallback neutro, barriera Home estesa e ordine listino con servizi piu usati in testa. Nessuna logica app cambiata per adattarla ai test.
- Ripetizione completa dopo riallineamento: 43/43 script npm passati; dipendenze Expo allineate.
- Export produzione iOS, Android e web completato con exit 0, 37 rotte web: `/tmp/salonpro-release-1013-export`.
- Avviso Expo crediti inclusi esauriti e tariffazione a consumo comunicato all'utente.

## Build e invii

- Android 60: `7477e1ad-3f8d-478f-bed2-43508d4bc940`.
- iOS 196: `95f54b95-a721-4fac-90e4-52bdb8b8a6ee`.
- Archivio 39.4 MB per piattaforma, credenziali remote production esistenti.
- Bozza Apple 1.0.13 creata; novita italiano e inglese compilate e salvate.
- Note Apple verificate persistenti dopo reload, entrambe le lingue.
- Submission iOS pianificata: `f5ba28f5-7cd3-4aac-bc65-301ac1c000ba`.
- Submission Android pianificata: `5d2da29f-e5f6-4b90-ab50-1ecc3c6fbfe7`, production, changesNotSentForReview=false.
- iOS 196: build FINISHED, archivio Xcode riuscito; submission iOS conclusa con exit 0 e upload Apple confermato.
- Apple: build 196 selezionata e salvata, aggiunta alla verifica e invio finale completato. Stato visibile **1.0.13 In attesa di verifica**, conferma **1 elemento inviato**.
- Revisione Apple: `02ebfef1-746d-459b-8594-e3a89cfce001`.
- Android 60: build FINISHED e submission conclusa con exit 0, upload Google Play confermato.
- Google Play: verifica live del dettaglio **Invio 30**, produzione **1.0.13**, origine API, **In revisione**, implementazione completa. Controlli rapidi automatici iniziali mostrati nel riepilogo; pubblicazione gestita disattivata.
- Deploy web avviato solo dopo la conferma dei due invii store.

## Web e conclusione

- Vercel `dpl_71MWhd25ZoMopT7gfYDJU4W8MiSr`: READY, target production, exit 0, alias `https://salonpro.dev`.
- Deployment: `https://salon-manager-3gu1y8t71-6rwdtrgntc-3362s-projects.vercel.app`.
- HTTP pubblico senza cache: `/` e `/cliente` 200, Cache-Control no-store/no-cache; associazione Apple 200 application/json.
- Bundle pubblico `entry-d5547368cd32787ffc2acaa451e34848.js`: 200, 7.984.431 byte, versione 1.0.13 presente.
- Safari sul dominio pubblico con releasecheck=1.0.13: pagina salone renderizzata con campi di accesso; selezione Lato cliente renderizza ingresso e scelta salone. Nessun login, prenotazione o modifica di dati production effettuati nello smoke test.
- Richiesta completata: una nuova build per piattaforma, Apple In attesa di verifica, Google invio 30 In revisione, web pubblicato per ultimo e verificato. Approvazione e pubblicazione mobile dipendono dai rispettivi store e non sono dichiarate completate.

## Avvisi non bloccanti

- Installazione Vercel: audit segnala 77 vulnerabilita di dipendenze (2 low, 33 moderate, 40 high, 2 critical). Nessun audit fix o aggiornamento di dipendenze durante il rilascio; richiede valutazione separata, non equivale a un audit di sicurezza.
- Browserslist segnala database non aggiornato; nessuna modifica automatica.
- Le verifiche pubbliche sono smoke test di apertura e distribuzione, non una nuova prova completa di prenotazione sulle build firmate.
