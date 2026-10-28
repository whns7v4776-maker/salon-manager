# Registro del rilascio server — SalonPro Premium

Aggiornato il 28 ottobre 2026. Registro richiesto da Marzio: mantenere qui le modifiche da portare sul server a fine implementazione. Questo documento non autorizza un rilascio.

## Stato attuale

**28 ottobre: revisione approvata pubblicata su server, web e OTA e verificata nella consegna.** Rapporto corrente: [RILASCIO.md](../work/premium-release-20261028/RILASCIO.md). Applicate esclusivamente le migrazioni `20261027190000` e `20261027193000`, funzione `send-push` versione 141, web promosso e quattro gruppi OTA per sei offerte compatibili. Il collaudo fisico dei telefoni rimane distinto dalla pubblicazione. Il resto del registro conserva le verifiche e le fasi storiche.

Codice nella copia isolata `/Volumes/SalonPro-Grafica-Premium/SalonPro`, anteprima web `localhost:8084`. Il 25 ottobre sono state applicate al backend reale le sole tre migrazioni selezionate per badge, targhetta e compatibilità; il sito verificato è stato promosso su `salonpro.dev` e `salon-manager-puce.vercel.app`. Con approvazione specifica del titolare aggiunto il solo origin `https://salonpro.dev` allo sblocco Cassa. Distribuzione app e controlli di consegna registrati in `work/premium-switch-20261025/`. Non confondere distribuzione, aggiornamento applicato sul telefono e collaudo fisico.

L'elenco operativo unico di tutte le aggiunte e dei flussi da conservare è [CHECKLIST-SWITCH-PREMIUM.md](CHECKLIST-SWITCH-PREMIUM.md): 8 voci server/configurazione e 16 aree funzionali. Comprende le due scelte indipendenti della targhetta, i badge, le prenotazioni con posa/collegamenti, notifiche, comunicazioni, slot, shop, vantaggi, impostazioni, accessi e Cassa. **Cassa sbloccata di default sia web sia app; protezione solo su attivazione volontaria del titolare.**

## 1. Badge clienti avanzati — BACKEND APPLICATO IL 25 OTTOBRE

- Migrazione: `supabase/migrations/20261023190000_owner_customer_premium_badge.sql`.
- Tabella `customer_badge_policies`; RPC `get_owner_customer_badge_summary` e `set_owner_customer_badge_policy`.
- Livelli Standard, Frequente, Premium, Top Premium. Configurazione del salone: visite completate, spesa netta, entrambe, una delle due oppure prenotazioni; periodo di osservazione e soglie personalizzabili.
- Annullamenti del cliente e assenze sono indicatori separati: non bloccano automaticamente prenotazioni e non modificano il livello.
- Conteggi e classificazione sul server, isolamento tra saloni, modifica riservata al titolare. Spesa netta e rimborsi, visite collegate e parziali trattati dal server.
- Frontend: `src/lib/customer-badge-policy.ts`, `src/lib/use-customer-premium.ts`, `components/customer-premium-settings.tsx`, rubrica e riepilogo cliente.
- Test isolato PASS: `scripts/test-customer-badge-server.cjs`; prova in `work/clienti-premium-20261023/advanced-badges-server-test.txt`. Non è collaudo del backend reale.
- Dopo migrazione: verificare caricamento, salvataggio e persistenza delle regole, aggiornamento badge, incassi/rimborsi e permessi con due saloni reali di prova; nessuna modifica a clienti reali per fare QA.

## 2. Targhetta IA al posto del marchio — BACKEND APPLICATO IL 25 OTTOBRE

- Migrazione: `supabase/migrations/20261023193000_salon_brand_placements.sql`.
- Tabella `salon_brand_placements`; RPC `get_salon_brand_placements` e `set_owner_salon_brand_placements`.
- Scelte indipendenti per back office e area clienti; disattivate di default.
- Solo targhetta IA approvata (`approved_source=ai`, `display_mode=logo`, percorso valido). Il semplice nome non sostituisce Salon Pro: rimane nella posizione esistente sopra “Il tuo salone, oggi”.
- Sotto la targhetta: dicitura esatta “Powered by Salon Pro”. Cornice arrotondata e adattiva; marchio originale se disattivata, assente, non idonea o immagine non caricabile.
- Riutilizzare creazione/approvazione IA esistenti; nessuna generazione o consumo crediti effettuato per questa implementazione.
- Frontend: `src/lib/salon-brand-placements.ts`, `components/salon-brand-mark.tsx`, `components/salon-brand-placement-settings.tsx`, Profilo salone, sidebar e intestazioni, area cliente.
- Dipendenze: schema precedente `salon_logo_plaques` con `approved_source`, `display_mode`, `approved_path`; storage approvato e flusso IA già esistente. Verificarne la presenza sull’ambiente destinazione.
- Test isolato PASS: `scripts/test-salon-brand-placements.cjs`; prova in `work/clienti-premium-20261023/brand-server-test.txt` (default, ammissibilità IA, destinazioni indipendenti, ripiego, isolamento titolari e permessi anonimi).
- Dopo migrazione: attivare/disattivare ogni destinazione su salone di prova, ricaricare e controllare persistenza, nome invariato, firma corretta, ridimensionamento, tema e ripiego in caso di immagine mancante.

## Preparazione del rilascio

- [x] Confrontare lo schema e lo storico migrazioni reali prima di applicare questi file; escluse le sei differenze già installate.
- [x] Congelare e tracciare il sorgente destinato al rilascio; manifest del candidato, senza includere segreti nel pacchetto pubblico.
- [x] Applicare le due migrazioni sopra e la sola compatibilità `20261025230700`, dopo verifica delle dipendenze e approvazione del rilascio.
- [x] Pubblicare il frontend compatibile; controllare contratti RPC e autorizzazioni.
- [ ] Fare collaudo reale end-to-end e annotare ambiente, versione, data, risultato e prove.
- [ ] Verificare web chiaro/scuro e larghezze diverse; collaudo app separato, ancora da completare.
- [x] Aggiornare questo registro con lo stato effettivo di ciascuna voce, distinguendo le prove locali dalla verifica di consegna reale.

Controlli del candidato del 25 ottobre: TypeScript del sorgente congelato superato, regressioni calendario/sessioni/navigazione superate, quattro pacchetti app scaricati dal CDN identici alle esportazioni verificate. Le note TypeScript nelle voci storiche sotto descrivono i controlli dell'epoca.

### Rilascio effettivo del 25 ottobre — prove e limiti

Applicata sul progetto `mlzrtpqphsdfgsklacmu` la transazione verificata con le sole versioni `20261023190000`, `20261023193000`, `20261025230700`. Prima del commit confrontati 138 insiemi di dati esistenti e 716 routine: dati preesistenti e accessi invariati. Il catalogo successivo contiene 679 migrazioni, 135 tabelle pubbliche e 670 funzioni pubbliche. Nessun cliente, prenotazione o pagamento del tester usato per QA.

Confermati sul backend reale: zero regole badge/targhetta attivate dall'upgrade, RLS delle due tabelle, salvataggi anonimi negati e lettura pubblica limitata al marchio. Le 191 chiamate RPC letterali verificate trovano tutte una routine compatibile; zero nomi mancanti o argomenti sconosciuti. Le prove positive di salvataggio e rilettura restano quelle sulla copia isolata; nessuna configurazione del tester modificata per provarle.

Sito `dpl_JADzPLycuNLVbV9zVdwTZns27NbG` promosso e verificato sui due domini pubblici. Pacchetti iOS/Android distribuiti su `production` per i runtime `1.0.22-meta1` e `1.0.22-terminal2-meta1`, dagli stessi gruppi candidati già verificati. Consegna CDN controllata per hash; offerte delle versioni 1.0.17/20/21 e quattro avvisi 1.0.14/16 invariati.

**Cassa aperta di default su web e app**, senza attivazione automatica allo switch. Conservata un'eventuale protezione scelta dal titolare. Il comportamento corrente mantiene lo sblocco durante blur/cambio sezione: blocco manuale; dopo un ricaricamento una protezione già attivata richiede nuovamente lo sblocco. Questo sostituisce la precedente descrizione di blocco automatico per focus/scadenza.

Prova completa, ID effettivi, hash, inventario e ripristino: `work/premium-switch-20261025/PRODUCTION-RELEASE-VERIFIED.json`, `release-feature-inventory.json`, `RIPRISTINO.md`. In quella fase non erano stati ricostruiti binari store; la successiva richiesta di build e invio è registrata sotto. La verifica che ciascun telefono abbia applicato l'OTA e il collaudo fisico della produzione rimangono distinti. Nessuna promessa di copertura universale dei runtime obsoleti non verificati.

### Build store 1.0.23 — 26 ottobre

Su richiesta esplicita del titolare create entrambe le build dal sorgente Premium congelato in una copia separata. Bundle ID/package, backend, firma e account esistenti conservati. Nessun ulteriore intervento sul database, web o dati del tester. Otto controlli nativi superati; IPA e AAB verificati per integrità, versione, identificatore, runtime e firma, con controllo dei bundle per credenziali private. I runtime precedenti mantengono i pacchetti già distribuiti.

- iOS **1.0.23 (216)**, profilo `production`, runtime `1.0.23-meta1`: caricata, elaborata e **In attesa di verifica** in App Store Connect. Invio Apple `644c6cfc-9b98-4f77-bac1-15f8668dbe6e`; rilascio manuale.
- Android **1.0.23 (78)**, profilo `production-terminal`, runtime `1.0.23-terminal2-meta1`: upload EAS `c0d20569-bc60-432b-9395-ff857bb365ff` riuscito; release Google Play 39 salvata e inviata con l'azione finale. Console **Modifiche in fase di revisione**, controlli rapidi preliminari ancora in corso alla cattura. Pubblicazione gestita attivata. Nessun dispositivo perde il supporto rispetto a 77. L'avviso AD_ID è stato ignorato soltanto per questa release tramite l'azione Google prevista: la build 78 contiene il permesso; dichiarazioni generali e release precedenti conservate.

Dettagli e prove in `work/premium-switch-20261025/STORE-1.0.23.md`, `store-build-state.json` e `STORE-REVIEW-VERIFIED.json`, comprese le catture sicure delle console. Entrambi gli invii finali sono confermati. Nessuna delle due nuove versioni è dichiarata già approvata, pubblicata o collaudata fisicamente sulla base della compilazione o dell'invio.

## Altre richieste della sessione

Restyling Clienti/Richieste, popup e ricerca, scorrimento nativo, hover solo sui comandi, sidebar e Home sono modifiche frontend: non richiedono nuove RPC per il solo restyling. Conservare i flussi esistenti di salvataggio, notifiche, comunicazioni, vantaggi e sincronizzazione; verificarli prima del rilascio. La leggera attenuazione dello sfondo chiaro è ancora una prova da accettare o ripristinare.

Aggiungere qui ogni nuova dipendenza server emersa durante il resto del lavoro.

### 25 ottobre — inventario completo e origin Cassa

Richiesta del titolare: raccogliere tutte le funzioni implementate e i collegamenti server, inclusa la scelta di mostrare la targhetta nel gestionale oppure no. Consolidate nella checklist collegata sopra le modifiche vere al backend, le configurazioni già installate e le nuove interfacce che riusano le API esistenti. Per le targhette conservare `owner_enabled` e `frontend_enabled` separati, entrambi `false` di default; salvataggio riservato al titolare, lettura pubblica limitata al marchio.

Prima della modifica verificato che la configurazione origin esistente corrispondesse esattamente ai due indirizzi registrati. Con autorizzazione specifica del titolare aggiunto `https://salonpro.dev`, senza togliere `http://localhost:8084` o `https://salon-manager-puce.vercel.app`. Verificati tre preflight 204, origin estraneo 403 e POST senza accesso 401. Nessun redeploy della funzione, nessuna riga cliente/prenotazione/pagamento modificata. Non equivale a una registrazione fisica Face ID.

Ripetuti con esito positivo i test badge/targhetta sulla copia isolata e i test dei componenti Cassa web/app sul sorgente congelato: con storage vuoto la Cassa è aperta e non salva una preferenza di protezione. Attivazione soltanto volontaria; eventuale preferenza precedente conservata. Prove: `work/premium-switch-20261025/inventory-*-tests.log`, `inventory-cash-*-default.log`, `cash-passkey-origin-verification.json`.

Il badge disponibilità Home usa i dati operativi esistenti con toni champagne (ampia disponibilità), ambra (limitata), rosato (quasi piena/esaurita), neutro (chiuso/caricamento). Solo presentazione web, nessuna nuova migrazione.

## Servizi web — restyling del 23 ottobre 2026

Frontend in `components/owner-premium-services.tsx` e `app/(tabs)/servizi.tsx`: Listino / Operatori / Organizzazione, card compatte, ricerca e filtri esistenti, fasi e promozioni reali, creazione in finestre con altezza vincolata e scorrimento interno, palette chiaro/scuro. Archivio, cancellazione, foto, competenze, posa e composizioni mantengono i gestori esistenti. Nessuna nuova migrazione server per questo intervento. Non sono stati salvati servizi/operatori né avviati archivi o eliminazioni per il collaudo. Verificare comunque salvataggi reali e riordino su dati di prova prima del rilascio.

### Rifacimento Servizi successivo al primo tentativo

Il primo restyling è stato rifiutato dall’utente: non considerarlo approvato. La nuova presentazione web è `components/services-web-workspace.tsx`: listino con ricerca e selettore mestiere nuovi, righe compatte e dettaglio affiancato (finestra a larghezza ridotta), nuovi profili operatori allineati a sinistra con ricerca/archivio, Organizzazione composta da quattro accessi ordinati a finestre dedicate. I moduli operativi riusano i gestori esistenti; nessuna nuova RPC o migrazione. Verificati apertura creazione, configurazione composizioni, ricerca, percorso posa, tema chiaro/scuro e dettaglio a 980 px. Non eseguiti salvataggi/archivi/eliminazioni su dati reali. Tre controlli di regressione servizi/operatori nuovamente passati. Lint pulito; resta TS7016 preesistente react-dom in Agenda.

Sfondo scuro web: attenuazione locale sfumata del riflesso in alto a destra in `components/owner-web-backdrop.tsx`, comune alle pagine del gestionale. Non modifica le trasparenze delle card delle altre schermate né il tema chiaro. Da valutare visivamente con l’utente, senza dichiarare accettazione anticipata.

### Nuovo editor servizio e rifiniture delle finestre web

Editor Modifica servizio ricostruito in `components/services-web-edit-form.tsx`: schede Dettagli / Prenotazione / Promozione, campi controllati nella draft boundary esistente, selettori mestiere/fase/etichetta personalizzati, fasi e collegamenti leggibili, interruttori neutri, riepilogo più grande. Finestre Servizi adattive all’altezza del viewport, fondo perla attenuato e fascia azioni continua fino al bordo inferiore. Menu condiviso `components/services-profession-filter.tsx` con stati hover e selezionato distinti; nessuna nuova dipendenza server.

Verifica locale nel browser: tema chiaro/scuro, passaggio schede con valori conservati e ricalcolo durata, attivazione del modulo promozione, ridimensionamento a 980×740 e 680×680 senza overflow orizzontale. Prove PNG in `work/clienti-premium-20261023/services-edit-booking-*.png`. Lint pulito e tre script di regressione Servizi/operatori passati; TypeScript mantiene la sola dichiarazione react-dom preesistente in Agenda. Nessun salvataggio di record reali; salvataggio/persistenza server e collaudo app rimangono prove separate prima del rilascio. Approvazione grafica ancora all’utente.

### Creazione Servizio / Composizione ricostruita

Nuovo servizio ora usa direttamente `ServicesWebEditForm`, lo stesso componente di Modifica servizio, con Dettagli / Prenotazione / Promozione e comandi fissi. Composizione usa un nuovo albero web `components/services-composition-web.tsx`: Scegli / Ordina / Salva; ricerca listino, percorsi salvati e fasi private separati; riordino tramite trascinamento o frecce, durata/prezzo/pausa per fase e riepilogo. I gestori canonici di selezione, dipendenze, fasi private, visibilità, shortcut e salvataggio restano collegati. Nessuna migrazione aggiuntiva. Vecchio albero mantenuto per app native.

Verifiche locali: selezione due servizi, riordino con frecce, percorso salvato trasformato in fasi, riepilogo con Salva abilitato, tema chiaro/scuro e viewport 980×740 senza overflow orizzontale. Nessun record salvato o fase privata creata sul server. Lint pulito; contratti native servizi, draft isolamento e persistenza operatori passati. TypeScript: solo TS7016 react-dom in Agenda già presente. Trascinamento HTML e salvataggio reale restano da collaudare su dati di prova prima del rilascio.

### Operatori e Organizzazione — editor web a step

Nuovo e Modifica operatore ora usano `OperatorWebEditor` in `components/services-step-editor.tsx`: Profilo / Competenze / Disponibilità, foto con gestore esistente, mestiere in selettore, ricerca competenze, giorni, date e periodi. La draft boundary della modifica resta isolata. Scheda riepilogo operatore ridisegnata con Riepilogo / Gestione e azioni esistenti.

Organizzazione usa lo stesso telaio a step, con nuovi controlli: Ordine del listino (Mestieri / Servizi, frecce e trascinamento); Colori (Ambito / Tonalità / Uniformità, HEX e colori salvati); Composizioni (Percorsi / Assegnazione); Servizi su misura (Visibilità / Messaggi / Contatti). Conservati i gestori canonici di salvataggio e conferma. Nessuna migrazione server aggiuntiva. Barra di scorrimento web con pista coordinata al tema anche nello stato attivo, senza sostituire lo scroll nativo.

Verifica nel browser locale: apertura dei quattro moduli Organizzazione, navigazione step, Nuovo e Modifica operatore, competenze reali di Martina e ricerca, tema perla/scuro, fascia inferiore continua, finestra 980×740 senza overflow. Nessun salvataggio, riordino persistente, cambio colore, archiviazione o contatto esterno eseguito durante QA. Lint pulito e tre contratti regressione servizi/operatori passati; TS mantiene soltanto TS7016 react-dom già presente in Agenda. Collaudo dei salvataggi reali e dei gesti drag-and-drop su dati di prova rimane richiesto prima del rilascio.

### Collaudo visivo dei pop-up — 23 ottobre

Matrice in `work/clienti-premium-20261023/popup-audit-matrix.json`: 172 controlli nel browser integrato su localhost:8084. Temi chiaro/scuro e viewport 1440×1000, 980×740 e 680×680. Inclusi tutti gli step dei quattro editor Organizzazione, Nuovo/Modifica servizio, composizione, Nuovo/Modifica operatore, scheda operatore, informazioni, dettaglio servizio compatto e tendine. Provati anche promozione con date e servizi collegati espansi. Nessun overflow orizzontale o controllo fuori dal bordo rilevato; campo attivo senza outline browser. Scrollbar con colori calcolati coerenti in entrambi i temi.

Rifiniture: `color-scheme` sul telaio dei popup, pista esplicita anche hover/active, stessa gestione per i menu a comparsa che vivono fuori dal telaio. Lint pulito; TS conserva soltanto TS7016 react-dom in Agenda. Nessun dato reale salvato. La matrice riguarda il browser integrato: non costituisce collaudo fisico su tutti i browser né prova dei salvataggi server.

### Colori agenda — guida e assegnazione diretta

Aggiunta la “i” sia accanto a Colori agenda in Organizzazione sia nella finestra colori, con spiegazione dell’automatismo di base e della personalizzazione facoltativa. Palette di 24 tonalità nominate e distinte, approvata dall’utente; colori già usati e codice HEX disponibili senza affollare la schermata iniziale.

Assegnazione semplificata in `components/agenda-color-assignment.tsx`: destinatario e palette affiancati nella stessa schermata, impilati su finestra stretta; riepilogo destinatario → nome tonalità e pulsante “Applica a [nome]” nella fascia fissa. Scelta colore richiesta prima di applicare; cambiando ambito/mestiere si azzera il vecchio destinatario servizio. Automatici e uniformità restano in una sezione facoltativa. Gestori canonici e impostazioni automatiche esistenti conservati; nessuna migrazione aggiuntiva.

Verificati selettori, scelta colore, cambio destinatario, i informativa, temi chiaro/scuro e larghezza 680 px senza overflow. Non premuto Applica durante QA; nessun colore salvato cambiato. Lint pulito; TypeScript mantiene TS7016 react-dom già presente in Agenda. Anteprima: `work/clienti-premium-20261023/colors-assignment-final.png`.

### 23 ottobre 2026 — Pop-up Servizi a modulo unico (web)
- Eliminata navigazione a schede interna dagli editor servizi, operatori, composizioni e configurazioni: sezioni consecutive nello stesso scroll, footer e comandi di salvataggio invariati.
- Apri scheda operatore apre direttamente il modulo di modifica; foto e azioni archivio/eliminazione nel modulo. Nessun passaggio Riepilogo/Gestione per gli operatori attivi.
- Verificata apertura live operatore, modifica/nuovo servizio e composizione. Nessun dato salvato durante QA. Contratti isolamento bozze native, interazioni native e persistenza operatore superati; lint componenti superato. Typecheck globale non verde (include artefatti e progetti esterni con dipendenze mancanti).
- Nessuna migrazione o pubblicazione server richiesta da questo cambio di flusso web. Verifica colori verso Agenda ancora sospesa su richiesta dell'utente.

### 23 ottobre 2026 — Composizione web, percorso diretto
- Servizi e filtro mestiere a sinistra; percorso numerato a destra, con scroll indipendenti. Tonalità dei mestieri anche nel menu. Su finestra stretta percorso prima del catalogo.
- Fasi separate, durata/prezzo allineati, posa tra le fasi, sostituzione nella fase con conservazione della posizione e della pausa; rimozioni rosse. Nessuna scheda interna.
- Trascinamento pointer con card opaca sotto cursore, anteprima animata dello slittamento e aggiornamento ordine al rilascio; maniglia grab/grabbing anche contro regole globali pointer.
- QA live: aggiunta/rimozione, posa, sostituzione e ripristino, drag reale tra due fasi e rinumerazione; nessuna composizione salvata. Verificata assenza overflow orizzontale a 680px. Typecheck mirato superato; lint e contratti native superati. Nessun rilascio o modifica server.

### 23 ottobre 2026 — Composizione guidata, versione richiesta a quattro step
- Sostituita la vista simultanea con 1 Dati, 2 Servizi con checkbox, 3 Percorso (riordino/posa/sostituzione), 4 Conferma. Indietro/Continua mantengono la bozza; salvataggio solo alla conferma.
- Percorsi salvati e fasi private separati in due sezioni richiudibili con informazioni dedicate; privati esclusi dal listino ordinario del compositore.
- Prova reale salvata via save_service_composition_v2: TEST QA composizione 23-10-2026 (solo salone). Aggiunti Barba Uomo e Taglio Bambino, sostituito Barba Uomo con Barba, trascinato Taglio Bambino prima di Barba, posa intermedia 15 min. Totale 40 euro /105 min.
- Dopo refresh completo, percorso riletto dai percorsi salvati: Taglio Bambino 30min/15 euro, pausa15, Barba60min/25 euro; ordine e valori confermati. Evidenza work/clienti-premium-20261023/composition-refresh-proof.png. Record test lasciato identificabile per verifica.

### 23 ottobre 2026 — Regole online visibili durante la scelta (web)
- Ogni servizio/fase privata e percorso salvato mostra Compatibile online oppure Solo salone con motivo. Le voci incompatibili non sono aggiungibili con destinazione online; la rimozione di una voce già selezionata rimane possibile. Stessi controlli su sostituzioni e percorsi salvati; posa online spiegata prima dell'azione.
- Aggiunta i Regole della composizione in Dati/Servizi/Percorso: requisiti 2-20 servizi stesso mestiere, disponibilità online, posa, fasi private, percorsi salvati. Regole derivate dai controlli del compositore e save_service_composition_v2; nessuna modifica alle regole server/native.
- Numeri portati a 34px con testo17px ad alto contrasto; posa del riepilogo in fascia malva separata e non numerata; nome e disponibilità allineati (stesso top e altezza50px).
- QA live chiaro/scuro e viewport680x740: servizio offline bloccato online, abilitato solo salone; percorso con pausa bloccato online se non già selezionato; posa disabilitata online; riepilogo posa separato; un solo scroll lista e nessun overflow orizzontale. Nessun salvataggio server durante questo giro QA.
- Lint componenti, typecheck mirato e test comportamento eligibility superati; contratti private-phase e isolamento bozze native superati. Evidenze work/clienti-premium-20261023/composition-eligibility-*.png, composition-pause-review-night.png, composition-aligned-final.png.


### 23 ottobre 2026 — Cassa premium web e protezione facoltativa

Cassa web ricostruita in `components/cash-web-workspace.tsx`: quattro riepiloghi, Oggi/Settimana/Mese/Storico/Periodo, ricerca e paginazione dei movimenti, dettaglio aggiornato dai dati correnti, nuovo incasso, scelta servizi e suggerimenti, report PDF/Excel. Pannelli dedicati per Stripe, condizioni di pagamento, spese/report mensili, ricevute, archivio, rimborsi e riferimenti carta facoltativi (in Gestione Cassa). Entrata vendite prodotti collegata al modulo Shop esistente. Conservati i gestori canonici di registrazione, assegnazione metodo, report, riferimenti carta e configurazioni; nessun registro parallelo degli incassi.

Tonalità perla/scuro, icone sobrie, selettori condivisi, footer continuo, sfondo sfocato e altezza massima legata alla finestra. I moduli Cassa si aprono direttamente, senza una seconda finestra introduttiva. Tabella compatta e layout a colonne solo quando c'è spazio; periodi e comandi si dispongono su più righe nei formati stretti. Scrollbar con pista coordinata anche hover/active. Albero nativo Cassa conservato; i nuovi override dei pannelli restituiscono gli stili originali su native.

**Protezione locale:** facoltativa, spenta di base, salvata per browser/salone/account. Password verificata con una sessione Supabase temporanea separata, senza sostituire la sessione dell'app e senza conservare la password. Sblocco solo in memoria: refresh, cambio account, uscita dalla sezione, perdita del focus e scadenza di cinque minuti richiedono una nuova verifica. Quando attiva, i riepiloghi economici della Home web sono riservati. Non è un confine di autorizzazione server fra titolare e dipendente che condividono lo stesso account: non cambia le RLS del registro Cassa e la preferenza locale può essere azzerata eliminando i dati del browser. Per una separazione effettiva occorrono identità e permessi distinti.

**Passkey preparate, NON rilasciate:**
- Migrazione `supabase/migrations/20261023235000_cash_owner_passkeys.sql`.
- Edge Function `supabase/functions/cash-passkey/index.ts` e relativa voce in `supabase/config.toml`.
- Variabile server `CASH_PASSKEY_ALLOWED_ORIGINS`: lista esatta degli origin ammessi, separati da virgola, senza percorsi o slash finale. Nessun origin ammesso automaticamente. Configurare soltanto gli ambienti autorizzati.
- L'endpoint controlla JWT tramite `getUser`, appartenenza al workspace con ruolo owner, password per registrare una passkey, origin/RP ID, verifica utente sul dispositivo, challenge monouso con durata cinque minuti e contatore della credenziale. Le nuove tabelle non sono leggibili direttamente da anon/authenticated.
- Prima del rilascio applicare la sola nuova migrazione dopo aver controllato le altre migrazioni pendenti, configurare gli origin e distribuire `cash-passkey`. `verify_jwt=false` non elimina il controllo utente: la funzione autentica esplicitamente ogni richiesta.
- Su browser/dispositivo non compatibile oppure server non disponibile la biometria non è proposta come attiva; rimane la password. Il dispositivo può usare Face ID, impronta o il proprio codice: l'app non raccoglie dati biometrici.

Verifiche: browser integrato in chiaro/scuro a 1440, 980, 680 e 390 px, inclusi moduli espansi e riferimenti carta; nessun campo o comando oltre il bordo nei controlli finali. Dopo refresh e completamento caricamento: 291 movimenti, totale confermato 296 euro, contanti 211, carta 85, da incassare 10; modulo nuovo incasso vuoto. Nessun incasso, rimborso, documento fiscale, cambio configurazione o riferimento carta salvato durante QA. Dettagli e immagini in `work/cash-premium-20261023/`.

Typecheck mirato web e Deno della funzione superati; lint pulito sui nuovi componenti/librerie. Restano avvisi preesistenti nei componenti Cassa legacy. Test mirati superati per riepiloghi, periodi/settimana/DST, PDF/CSV, paginazione, matching servizi, riferimenti atomici, password/preferenza locale, handler passkey e nuova migrazione SQL in database isolato. Firma WebAuthn simulata nel test handler: registrazione e sblocco con password reale, Face ID/impronta fisici e prova dopo distribuzione server restano da eseguire dal titolare. Nessuna pubblicazione, migrazione remota o modifica all'account reale eseguita.

### 23 ottobre 2026, 23:06 — aggiornamento sblocco Cassa: backend rilasciato

Questo aggiornamento sostituisce lo stato precedente “Passkey preparate, NON rilasciate”. Su richiesta del titolare applicata la sola migrazione `20261023235000_cash_owner_passkeys.sql` al progetto SalonPro `mlzrtpqphsdfgsklacmu`, configurati gli origin esatti `http://localhost:8084` e `https://salon-manager-puce.vercel.app`, pubblicata `cash-passkey` ACTIVE versione 1 con `verify_jwt=true` e controllo esplicito dell'utente/ruolo owner. Nessun `db push` delle altre migrazioni e nessuna pubblicazione frontend/OTA.

La password è ora verificata dall'endpoint autenticato tramite sessione temporanea separata; il client richiede `verified=true`. La preferenza rimane locale al browser/salone/account, facoltativa e spenta di base; sblocco esclusivamente in memoria. Corretto il comando biometrico diretto; anche gli importi economici nella scheda cliente della Home rispettano la preferenza web.

Confermati sul server: preflight consentito 204, origin estraneo 403, anonimo 401; accesso REST anonimo alle due tabelle negato 401/42501, RLS attiva e nessun grant diretto anon/authenticated. Snapshot aggregato dei movimenti invariato durante la distribuzione. Nessuna operazione finanziaria di prova.

Passati test del componente React con DOM isolato (blocco, zero render sensibili al refresh, password errata, verifica annullata, blur, uscita e scadenza), contratti client/server, migrazione in database isolato e verifica crittografica WebAuthn reale con autenticatore generato. Typecheck mirato e lint dei componenti/librerie di accesso puliti. Il browser integrato non supporta un autenticatore di piattaforma: la prova positiva con password reale e la registrazione/conferma Face ID/impronta rimangono affidate al titolare. Non presentare i test isolati come prova fisica o refresh del conto reale protetto.

Dettagli, limiti e riscontri: `work/cash-access-20261023/VERIFICA.md`. Il blocco del browser condiviso non sostituisce account/permessi distinti sul server; restano le RLS Cassa esistenti.


### 24 ottobre 2026 — affinamento web locale Cassa, card e vetro satinato

Solo frontend locale nella copia Premium: card adattive, finiture glass condivise dei pop-up, Movimenti espansi/riga cliccabile, nuovi pannelli Pagamenti e Gestione Cassa. Nessun nuovo intervento server o rilascio frontend/OTA.

### 25 ottobre 2026 — preparazione switch, fermata prima di modifiche remote

Il titolare richiede di preservare integralmente prenotazioni, dati e accessi del tester attivo e di fermarsi in presenza di dubbi. **NO-GO corrente per lo switch.** Nessuna migrazione remota, riparazione dello storico, pubblicazione web/OTA o modifica ai dati effettuata in questa preparazione.

Confronto remoto in transazione READ ONLY: 676 migrazioni registrate contro 684 file locali. Otto differenze: `20261003093000`, `20261014101500`, `20261015100000`, `20261017143000`, `20261018113000`, `20261022224500`, `20261023190000`, `20261023193000`. Le sei storiche toccano anche prenotazioni/accessi e diverse funzioni esistono già: occorre confrontare le definizioni e riconciliare la cronologia prima di selezionare qualsiasi SQL. L’elenco non autorizza l’applicazione di otto file.

Confermata l’assenza sul server delle quattro RPC dei nuovi badge/targhette. Test PostgreSQL isolati nuovamente superati; non sostituiscono il test di upgrade su copia rappresentativa dei dati né quello dei contratti RPC dinamici. Il frontend clienti, i relativi feedback e i banner aggiornati riusano i contratti operativi esistenti; nessuna nuova migrazione richiesta dal solo restyling.

Baseline produzione web letta senza modifiche: `dpl_76WF7HaRY1jtHTCiU4dLWxgnSdHg` READY. Inventario, limiti e attività mancanti: `work/premium-switch-20261025/STATO.md` e relativi JSON. Prima del GO servono prova di compatibilità vecchio/nuovo client, ripristino verificabile e identificazione delle build/runtime app. Un rollback grafico deve conservare le nuove prenotazioni e i dati prodotti nel frattempo.

### 25 ottobre 2026 — otto differenze chiarite e prova su copia isolata

Su richiesta del titolare, copiate esclusivamente definizioni dello schema reale in PGlite: 135 tabelle, 668 routine applicative, 240 trigger, 155 policy e 729 vincoli; dataset interamente sintetico, nessuna riga cliente/tester esportata. Nessun cron/worker o integrazione esterna attivi. 35 gruppi di verifica e 435 casi SQL superati, inclusi confronto prima/dopo dei dati, credenziali e sessioni salvate, convivenza API legacy v2 / nuova v4, posa e operatori distinti, composizioni, pagamenti/rimborsi simulati, pacchetti, fedeltà, annullamento e ripristino della copia locale.

Le sei differenze storiche `20261003093000`, `20261014101500`, `20261015100000`, `20261017143000`, `20261018113000`, `20261022224500` corrispondono a definizioni già installate: nessuna variazione delle funzioni nel confronto isolato. Per la fedeltà la colonna esiste già: il file originale non è riapplicabile alla cieca. Escludere questi sei SQL dalla distribuzione; la mancanza delle voci nello storico va gestita separatamente, senza `db push`/`migration repair` automatici.

Le due nuove migrazioni badge/targhette superano la prova sullo schema reale copiato e mantengono intatti record, ID, credenziali, sessioni, colonne/default, RLS e permessi preesistenti. Nella migrazione badge NON rilasciata è stato rimosso l'indice aggiuntivo bloccante sulla tabella appuntamenti: riusati gli indici esistenti, la cui invarianza è verificata.

Confrontati i sorgenti 1.0.17/20/21/22, tutti i 244 riferimenti RPC riconosciuti esistono. Nei sorgenti 1.0.20/21 trovato un limite preesistente nel rinnovo della prova cliente dopo HTTP 401. Preparata soltanto come candidata locale `work/premium-switch-20261025/CANDIDATA-legacy-proof-status.sql`: stessa eccezione e stessi controlli, firma/permessi invariati; risposta PT403 per il messaggio di prova cliente scaduta in tre routine. Con questa candidata tutti e cinque i trasporti (quattro vecchie versioni e Premium) rinnovano e rileggono correttamente nella copia SQL; anche i 79 controlli di privacy rimangono passati. NON è una patch applicata al server.

**Rimane NO-GO per garantire tutte le app storiche senza aggiornamento.** I dati aggregati dei dispositivi includono anche versioni anteriori alla 1.0.17. Il bundle attualmente offerto al runtime Android 1.0.14-meta1 è stato letto e verificato per hash: contiene l'avviso di aggiornamento e non i riferimenti al protocollo di prova cliente. Il precedente rilascio del 20 ottobre già indicava aggiornamento store o portale web per quelle versioni, in attesa di un backport sicuro separatamente collaudato. Non ridurre le protezioni del portale per compatibilità. Non distribuire il nuovo JavaScript genericamente sui vecchi runtime.

Riscontri, limiti (simulazione della mappatura HTTP, nessun vecchio binario fisico/nuovo backup produzione), lista candidata e SHA-256 in `work/premium-switch-20261025/STATO.md` e `release-plan.json`. Produzione e tester rimangono invariati da questa preparazione. Il ripristino verificato è quello della copia sintetica; non è un backup di produzione.

### 25 ottobre — criterio chiarito: popup di aggiornamento per vecchie app incompatibili

Il titolare accetta di invitare all'aggiornamento le vecchie versioni incompatibili, usando il messaggio già preparato. Viene quindi superato il precedente requisito interpretato come funzionamento di ogni app storica senza aggiornamento. Le versioni compatibili mantengono il normale accesso.

L'avviso per 1.0.14-meta1 e 1.0.16-meta1 era già stato distribuito il 21 ottobre su iOS e Android: verificato il registro di rilascio e ricontrollati oggi tutti e quattro i manifest/bundle pubblici, con ID e SHA-256 identici ai pacchetti approvati e frase «Per continuare a utilizzare SalonPro, aggiorna l'app» presente. Indicazioni dello store specifiche per piattaforma. Prova attuale: `work/premium-switch-20261025/update-notice-current.json`.

Conservare questi avvisi; nessuna ripubblicazione effettuata o necessaria in questa verifica. Nessun cambiamento alle versioni attuali, ai dati o al tester. La distribuzione offerta non prova la ricezione su ogni dispositivo; per altri runtime storici senza codice/OTA compatibile non è possibile iniettare un popup tramite il solo server. Non trasformare indiscriminatamente errori di rete o password in richieste di aggiornamento.

La richiesta esplicita del titolare sostituisce il precedente comportamento di blocco automatico: una volta sbloccata, la Cassa resta aperta durante il lavoro e i cambi sezione/finestra, fino a Blocca Cassa. Refresh e cambio account richiedono nuovamente lo sblocco; protezione sempre facoltativa/spenta di base. Test e navigazione reale verificati, nessuna nuova prova biometrica fisica. Dettagli e limiti: `work/cash-refine-20261024/VERIFICA.md`.

### 26 ottobre 2026 — preferenza aspetto cliente, candidata locale

Richiesta del titolare: Automatico/Chiaro/Scuro nelle impostazioni cliente, conservando i cambi rapidi e la scelta sul server al successivo accesso. Preparata `20261026103000_customer_appearance_preference.sql`: tabella privata separata, RPC get/set con prova portale valida e identità cliente/salone, allowlist dei tre valori, niente accesso diretto o modifiche alle prenotazioni/credenziali. Integrati ripristino iniziale, coda delle scelte manuali e retry visibile; 25 asserzioni PostgreSQL isolate superate, con test React aggiuntivi per concorrenza/errore. Dipendenza: protocollo portale privato di `20261018113000`.

**Non applicata al server e non pubblicata**, rispettando la sospensione esplicita del rilascio. Occorre includere questa migrazione nel prossimo piano autorizzato e verificare un profilo isolato su due sessioni/dispositivi dopo l'installazione. Dettagli, controlli superati e limiti in `work/client-refinements-20261026/VERIFICA.md`. Nessun `db push` o riallineamento cronologia eseguito.

### 26 ottobre 2026 — rilascio effettivo delle migliorie

Su autorizzazione del titolare applicata la sola migrazione `20261026103000` per l’aspetto cliente, con guardia transazionale su dati e funzioni/grant esistenti, storico 679→680 e risposte senza prova cliente 403 verificate. Web `dpl_AXf7j6T3HrX52FXSd6g5fAK9VTEw` promosso su entrambi i domini dopo 76 controlli del candidato; altri 76 controlli per ciascun dominio pubblico superati. Conservati 619 asset precedenti.

OTA production: quattro gruppi per sei combinazioni runtime/piattaforma compatibili: 1.0.22 normale e Terminal, entrambi iOS/Android; 1.0.23 normale iOS e Terminal Android. Verificati manifest/bundle CDN contro gli export congelati e 120 asset per pacchetto; dieci offerte delle versioni precedenti invariate. Incluse anche le ultime correzioni hover/pressione dei tre collegamenti del footer: nessuno spostamento nei nove cicli di verifica Safari. Nessuna nuova build o pubblicazione store.

Prova, limiti e ripristino in `work/premium-refinements-release-20261026/PRODUCTION-RELEASE-VERIFIED.json`, `RILASCIO.md` e `RIPRISTINO.md`. La verifica della consegna non attesta l’applicazione su ogni telefono o l’accettazione touch fisica; nessun dato di salone reale modificato per fare QA.

### 26 ottobre 2026 — ripristino IA logo e adattamento della targhetta

Su richiesta del titolare aggiornata soltanto la funzione `salon-logo-plaque` (versione finale 37, senza migrazioni SQL). Il modello immagine precedente `gpt-image-1` era disattivato dal fornitore; sostituito con `gpt-image-2.5-sunburst`, con controllo visivo preliminare `gpt-5.4-mini` e risposta strutturata. Le immagini già pulite e larghe vengono conservate; quelle compatte vengono adattate a un’insegna larga estendendo il materiale del fondo, mentre le fotografie vengono ripulite soltanto dalle parti esterne. Un risultato ancora quadrato viene scartato. Immagini dubbie conservate con avviso; logo pubblicato invariato fino all’approvazione del titolare. Quota, isolamento proprietario, bozze private e controlli sul job mantenuti.

L’approvazione svuota il job completato; la nuova interfaccia può riprendere un’anteprima pronta e salva la finitura scelta. La visualizzazione delle sole immagini già pubbliche nel bucket `salon-logo-approved` dispone di un endpoint GET che elimina esclusivamente margini alfa vuoti e lascia intatti i pixel dell’insegna. Percorso limitato a UUID/UUID.png, nessun accesso alle bozze; POST continua a richiedere l’autenticazione proprietario. Asset originali non modificati. Firma e proporzioni adattate alla larghezza disponibile, senza seconda cornice intorno alla targhetta.

Prove in `work/logo-ai-refinement-20261026`: test pixel, limiti formato, undici scenari del generatore con provider simulato, sei flussi editor web/iOS/Android, dieci configurazioni della marca e verifica dell’endpoint pubblico sull’immagine approvata (1089×341, HTTP 200). Il titolare ha confermato la generazione reale della nuova targhetta e ne ha segnalato il margine nella testata, successivamente corretto. Questi test non attestano l’applicazione dell’OTA sul dispositivo fisico. Distribuzione web/OTA e relativo stato finale nel registro `work/logo-complete-release-20261026/`.

Distribuzione completata e verificata per il flusso logo/targhetta: sei offerte OTA production e 120 asset per pacchetto, dieci offerte precedenti invariate, web su entrambi i domini. Successiva modifica dei soli nomi negli slot Agenda web (14→16 px quando c’è spazio) pubblicata separatamente, con presentazione iOS/Android invariata. Riferimenti finali, ID, limiti e ripristino in `work/agenda-web-type-release-20261026/FINAL-DELIVERY-STATE.json` e `RILASCIO.md`. La verifica pubblica del dominio alternativo è stata ripetuta dopo una breve differenza di propagazione; entrambi hanno superato tutti i 76 controlli.

### 26 ottobre 2026 — eliminazione clienti: storico collegato e controlli di ammissione

Indagati in sola lettura i due casi segnalati dal titolare nel salone SalonPro. Marzio Rossi ha un pacchetto nominativo, ordini e storico fedeltà; Ludovica B ha storico fedeltà e una prenotazione di pagamento collegata. Queste relazioni hanno FK che impediscono la cancellazione definitiva del cliente. Il tentativo arrivava però prima a FK `ON DELETE SET NULL` su appuntamenti/richieste, facendo scattare i controlli di registrazione o di intestazione del pacchetto con messaggi fuorvianti.

Applicata la sola migrazione `20261026170000_customer_deletion_retained_history.sql`: preflight sui riferimenti protetti, limitato agli ID appartenenti al salone autorizzato e prima di qualsiasi tombstone; messaggi italiani già leggibili dalle vecchie app. Il trigger di registrazione distingue la sola azione referenziale annidata di scollegamento da una vera modifica della prenotazione, verificando che il cliente sia stato rimosso e tutti gli altri campi siano invariati. Nessuna disattivazione di trigger, nessuna modifica alle FK o alle protezioni di pacchetti/pagamenti.

Riprodotto il difetto e verificata la correzione in PostgreSQL isolato con le migrazioni reali di pacchetti/fedeltà/shop. Provati eliminazione ammessa con prenotazione conservata, rimozione delle credenziali, retry idempotente, blocco atomico con storico, pacchetto nominativo, modifiche dirette ancora controllate e accesso ad altro salone negato. Sul server live verificati sorgenti iniziali, grant/owner/security-definer invariati e contatori delle tabelle business invariati prima/dopo la sostituzione delle due funzioni. Nessun cliente reale eliminato per fare QA.

Frontend condiviso app/web: messaggi tecnici tradotti, popup Clienti neutri in entrambi i temi e piccolo accento di attenzione sull’icona. Prove in `work/customer-delete-fix-20261026/`; distribuzione e verifica in `work/customer-delete-release-20261026/`. La conservazione dello storico non è stata sostituita da una cancellazione a cascata o da un’archiviazione implicita.

## 2026-10-27 — Spostamento di una fase in corso (da distribuire)

Richiesta: emergenze salone, anche trascinamento; nelle composizioni si muove solo la fase trascinata. Il frontend ora abilita le interazioni per appuntamenti attivi non completati, non incassati e non segnati non effettuati. Le altre fasi restano nella bozza atomica esistente.

Migrazione preparata: `20261027190000_allow_active_owner_phase_moves.sql`. Il writer v6 verifica e blocca le righe originali prima di delegare ai wrapper; righe concluse o finanziariamente definite devono restare invariate. L'eccezione al vecchio controllo di inizio è circoscritta al writer atomico autenticato; le chiamate dirette v1 conservano il controllo precedente. Sono mantenute le verifiche esistenti di membership, sovrapposizioni e salvataggio atomico. Patch idempotente delle definizioni installate, con errore su definizioni inattese.

Verifica: `work/ongoing-actions-20261027/server-tests.json` PASS in PostgreSQL isolato (PGlite): migrazione ripetibile sulle definizioni originali, fase attiva consentita, membro storico invariato accettato, modifica orario/prezzo di righe concluse rifiutata, incassato rifiutato, altro workspace rifiutato. Test del preflight e delle definizioni, non prova dell'intero stack remoto o della concorrenza reale. Nessuna scrittura di dati di saloni e nessuna migrazione remota eseguita in questo intervento. Questa funzionalità nelle composizioni richiede la migrazione prima del rilascio coordinato web/OTA.

### Aggiornamento della regola approvata — 27 ottobre

Il salone ha approvato che un appuntamento non completato/non incassato rimanga spostabile anche dopo essere stato appoggiato nel passato. Supera quindi la limitazione temporale della nota precedente: nel preflight di `20261027190000_allow_active_owner_phase_moves.sql` sono protetti gli esiti espliciti, non il semplice superamento dell'ora. Il ramo di eliminazione resta più restrittivo e non viene esteso allo storico.

Aggiunta migrazione `20261027193000_guard_historical_customer_timing_push.sql` con funzione service-role `customer_timing_push_is_current_v1`; richiesta dal dispatch `supabase/functions/send-push/index.ts` prima di Expo, per sopprimere anche i vecchi promemoria in coda dopo uno spostamento nel passato. La coda ordinaria già esclude gli appuntamenti passati dalla programmazione (`queue_due_appointment_push_reminders`); la nuova guardia copre l'intervallo fra accodamento e invio. Errori di verifica producono retry e non invii permissivi. Test isolati e sintassi PASS; nessuna distribuzione remota eseguita. Dettagli e limiti in `work/ongoing-actions-20261027/ESITO.md`.


## 2026-10-27 — Nove gruppi approvati, integrazione locale

Marzio ha approvato l’integrazione dei punti 1–9 dalla galleria locale 8772. Il `+` su Chiuso è nascosto a riposo: compare accanto al testo durante l’interazione; le righe decorative spariscono e ricompaiono all’uscita. Custom bar e moduli condivisi del feedback aptico invariati. Rapporto: [ESITO.md](../work/premium-all-approved-20261027/ESITO.md).

- Inserimento nel passato: dopo conferma del server viene conservato l’ID canonico, poi si sceglie completamento/incasso con i controller esistenti. Errori successivi non ricreano la prenotazione. La registrazione Cassa conserva la data effettiva dell’operazione, senza nuova API di retrodatazione.
- Chiuso: filtro locale e ricontrollo prima del salvataggio per durata effettiva, operatore, cliente, macchinari e sovrapposizioni. Il writer server esistente resta l’autorità; nessuna nuova eccezione al controllo sovrapposizioni. Pausa conserva la forzatura esplicita già disponibile.
- Promemoria manuale: lettura di `customer_communications` limitata a salone, appuntamento e comunicazioni accodate; timestamp server e conferma di reinvio. Accodamento non equivale a consegna. Nessuna nuova tabella o allargamento RLS.
- Sessione mobile: errori temporanei di claim/rete restano in verifica con retry limitato; conflitto reale conserva il vincolo esistente e il logout locale. Nessun accesso concesso prima della conferma del claim. La causa storica dello specifico incidente delle 17:43 non è stata verificata nei log remoti.
- Protezione Cassa: usa la password dell’account, attivazione esplicita e recupero tramite il flusso account esistente; nessuna password aggiuntiva o modifica della politica di accesso. Recupero e invio email non eseguiti per QA.
- Clienti, Servizi/Operatori, regole, Cassa, pagamenti, Shop e targhetta riusano API e callback esistenti. Per il solo restyling non occorrono altre migrazioni. Tap to Pay rimane soggetto ad abilitazione e verifica del telefono.

**Stato:** implementato e verificato localmente con componenti reali e fixture isolate, TypeScript senza errori, lint senza errori (33 avvisi), test funzionali e checkout isolati PASS. Nessuna scrittura, incasso o notifica su dati reali; nessun deploy web/OTA o migrazione remota di questa revisione. La prova fisica iOS/Android, la persistenza completa sui dati isolati e il rilascio coordinato restano distinti. Le migrazioni `20261027190000` e `20261027193000` più `send-push` della sezione precedente sono ancora dipendenze da distribuire, non risultano applicate da questo intervento.


## 2026-10-28 — Pubblicazione della revisione approvata

Autorizzazione esplicita «pubblica tutto»; pausa richiesta rispettata prima della promozione web e pubblicazione OTA; ripresa con «continua».

- Server: sole migrazioni `20261027190000_allow_active_owner_phase_moves.sql` e `20261027193000_guard_historical_customer_timing_push.sql` applicate atomicamente e registrate, storico 681→683. Confrontati nella transazione hash delle funzioni/grant estranei e dei dati cliente/prenotazione: 115 clienti, 434 appuntamenti e 551 richieste invariati. Test PostgreSQL isolati ripetuti sulle definizioni appena lette dal server.
- `send-push`: versione 140→141; sorgente remoto scaricato prima/dopo, nuovo sorgente identico al candidato; cambiamento limitato alla guardia temporale. Configurazione JWT invariata, helper privati non accessibili ad anon/authenticated.
- Web: `dpl_34HjjTQZ4maJUd3pHeNVpx62sVpJ` promosso su `salonpro.dev` e `salon-manager-puce.vercel.app`. 76 confronti sul candidato e su ciascun dominio. Bootstrap versionato in base al contenuto per evitare il riuso di una mappa chunk differente con lo stesso nome immutabile; asset precedenti conservati.
- App: quattro gruppi OTA ripubblicati dagli stessi candidati verificati per sei combinazioni compatibili iOS/Android, runtime 1.0.22/1.0.23 con/senza Terminal. Bundle scaricati nuovamente dalla produzione identici agli export; 120 asset per manifesto confrontati per hash. Dieci offerte legacy della baseline invariate. Nessuna build o pubblicazione store.
- Browser pubblico: Home e Servizi caricati, informazioni nella pagina senza popup, nessun overflow orizzontale a 1280 px o errore console catturato. Nessun incasso, modifica di dati o push di QA. Non è accettazione touch su iPhone/Android.

Report, identificativi, prove e piano di ripristino: `work/premium-release-20261028/`. Le note del 27 ottobre «da distribuire» descrivono lo stato precedente a questa pubblicazione.
