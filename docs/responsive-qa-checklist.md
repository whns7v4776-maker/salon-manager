# Responsive QA Checklist

Ultimo aggiornamento: 14 marzo 2026

## Obiettivo

Verificare che il back office e il frontend cliente siano usabili bene su:

- telefono
- tablet iOS / Android
- web desktop Windows / macOS

## Breakpoint attuali

Base tecnica: [responsive.ts](/Users/marzio/Desktop/salon-manager/src/lib/responsive.ts)

- `phone` sotto `768`
- `tablet` da `768`
- `desktop` da `1180`

## Schermate gia adattate

- [index.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/index.tsx)
- [agenda.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/agenda.tsx)
- [clienti.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/clienti.tsx)
- [cassa.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/cassa.tsx)
- [prenotazioni.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/prenotazioni.tsx)
- [servizi.tsx](/Users/marzio/Desktop/salon-manager/app/(tabs)/servizi.tsx)
- [cliente.tsx](/Users/marzio/Desktop/salon-manager/app/cliente.tsx)

## Checklist generale

- Verificare che il contenuto non tocchi Dynamic Island / notch
- Verificare che il dock in basso non copra i contenuti
- Verificare che gli swipe delle tab funzionino ancora bene
- Verificare che tastiera + scroll non rompano layout o campi
- Verificare che nessuna card resti troppo larga o troppo stretta
- Verificare che testi lunghi non escano dai badge
- Verificare che i popup/modali restino centrati e leggibili

## Home

- Hero leggibile su tablet e desktop
- Metriche in alto non troppo stirate
- QR code ben centrato
- Sezione profilo salone leggibile anche su schermi larghi
- Sezione admin nascosta ancora usabile

## Agenda

- Colonna sinistra/destra ben bilanciate su desktop
- Giorni del mese visibili e cliccabili senza overlap
- Griglia orari leggibile su phone/tablet/desktop
- Selezione durata servizio evidenziata correttamente
- Badge `Pausa` visibile ma non invasivo
- Popup preview slot occupati sopra gli altri elementi
- Calendario mese grande ben centrato
- Modal orari apertura/chiusura con X visibile
- Sezione ferie e pause leggibile in colonna laterale

## Clienti

- Form nuovo cliente leggibile su desktop
- Ricerca cliente in colonna giusta
- Card cliente compatta ancora chiara
- Espansione scheda senza elementi tagliati
- Sezione eventi leggibile e ordinata
- Lista destinatari WhatsApp non troppo stretta su desktop

## Cassa

- Colonna operativa e colonna movimenti ben separate
- Card carte collegate ancora leggibili su tablet
- Metodi di pagamento ben allineati
- Movimenti lunghi non rompono la riga
- Sezione `Da chiudere` usabile su schermi larghi

## Prenotazioni

- Colonna `Da approvare` leggibile
- Colonna `Storico richieste` leggibile
- Badge stato non escono dal layout
- Pulsanti `Accetta / Rifiuta` non troppo stretti su tablet

## Servizi

- Form aggiunta/modifica ben leggibile
- Colonna note non troppo vuota
- Swipe modifica/elimina ancora funziona bene
- Riga servizio non taglia prezzo o durata

## Frontend cliente

- Flusso registrazione ancora chiaro su tablet
- Blocco step-by-step coerente
- Griglia orari leggibile
- Le mie prenotazioni con badge leggibile
- Conferma finale e bottone calendario ben allineati

## Priorita di fix quando testiamo

### Alta

- elementi coperti da dock o notch
- modali fuori schermo
- testi tagliati
- pulsanti non cliccabili
- campi coperti dalla tastiera

### Media

- spaziature brutte
- colonne sbilanciate
- card troppo larghe
- badge troppo lunghi

### Bassa

- rifinitura tipografica
- micro-allineamenti
- ottimizzazioni estetiche

## Come conviene procedere

1. test iPhone / Android phone
2. test iPad / tablet Android
3. test web desktop stretto
4. test web desktop largo
5. annotare i difetti qui o in `project-status.md`

## Nota pratica

Il prossimo blocco di lavoro ideale non e aggiungere nuove funzioni, ma:

- aprire l'app nei formati principali
- segnare cosa non regge bene
- sistemare quei punti uno alla volta

