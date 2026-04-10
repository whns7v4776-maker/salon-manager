# Project Status

Ultimo aggiornamento: 14 marzo 2026

## Stato attuale

L'app e divisa in due aree nello stesso progetto:

- `Back office salone`
- `Frontend cliente`

Per ora convivono nella stessa app, ma la struttura e gia pronta per essere separata piu avanti e collegata a Supabase.

## Cosa e gia fatto

### Back office

- Home migliorata e personalizzabile col nome salone
- Agenda con:
  - scelta giorno
  - scelta servizio
  - scelta orario
  - scelta cliente
  - calendario mensile
  - giorni festivi/chiusi/ferie
  - pausa pranzo configurabile
  - blocco manuale giorni e slot
  - popup preview sugli slot occupati
  - swipe per eliminare appuntamenti futuri
  - completato / non effettuato
- Clienti con:
  - schede compatte espandibili
  - email e instagram
  - swipe elimina
  - scorciatoie WhatsApp / mail / Instagram
  - sezione eventi
- Servizi con:
  - aggiunta
  - modifica
  - eliminazione con swipe
  - prezzo e durata personalizzabili
  - blocco duplicati per nome
- Cassa migliorata e collegata ai completamenti agenda
- Prenotazioni con richieste da approvare/rifiutare
- Notifiche badge rosse su richieste e clienti nuovi

### Frontend cliente

- Registrazione obbligatoria con:
  - nome
  - cognome
  - email
  - telefono
  - instagram opzionale
- Accesso al salone tramite:
  - codice salone
  - link salone
  - QR statico del salone
- Prenotazione guidata a blocchi
- Sezione "Le mie prenotazioni" con badge notifiche
- Aggiunta al calendario telefono per appuntamenti accettati

## Regole importanti gia decise

### Prenotazioni e approvazione

- Se il cliente prenota dal frontend, entra una richiesta in `Prenotazioni`
- Il salone deve accettare o rifiutare
- Se il salone inserisce lui un appuntamento:
  - se il cliente e registrato frontend, riceve la notifica
  - se non e registrato, resta solo nel back office

### Pausa pranzo

- Nel frontend:
  - se il servizio si accavalla con la pausa pranzo, la prenotazione viene bloccata
  - l'invio richiesta viene inibito
- Nel back office:
  - se il servizio si accavalla con la pausa pranzo, compare avviso
  - il parrucchiere puo comunque forzare con popup di conferma
- I badge `Pausa` restano visibili negli slot della fascia pausa

### Slot orari

- Gli slot occupati sono in rosso
- Gli slot selezionati sono verdi
- La selezione evidenzia tutta la durata del servizio:
  - 30 min = 1 slot
  - 60 min = 2 slot
  - 90 min = 3 slot

### Servizi

- Se un servizio viene eliminato dal listino, gli appuntamenti gia presi restano validi

### Multi-account saloni

- I dati sono separati per account/mail salone
- Ogni salone ha il proprio nome, indirizzo e codice
- La gestione cloud vera non e ancora attiva

## Struttura tecnica gia pronta

- `src/context/AppContext.tsx`
  Gestione dati principali dell'app

- `src/lib/booking.ts`
  Logica condivisa su:
  - disponibilita
  - durata servizi
  - conflitti
  - pausa pranzo
  - ferie
  - chiusure

- `src/lib/platform.ts`
  Dati del workspace salone:
  - nome
  - indirizzo
  - mail proprietario
  - codice salone
  - stato account

- `supabase/schema.sql`
  Base backend-ready gia preparata

## Cose da fare piu avanti

### Alta priorita

- Collegamento reale a Supabase
- Login vero per account salone
- Blocco trial/free anti-abuso con mail + telefono + provider auth + device fingerprint
- Separazione definitiva app salone / app cliente
- Pannello admin tuo per bloccare account e vedere tutti i saloni

- Etichetta visiva per appuntamenti "forzati" in pausa pranzo
- UI piu rifinita per stampa QR salone
- Migliorie visuali coerenti tra tutte le schede
- Scheda dettaglio cliente piu completa

### Bassa priorita

- Reminder piu evoluti
- Report e statistiche
- Offline/cache piu robusta

## Note operative

- Se si chiude la chat, questo file resta come riferimento
- Prima di fare il passaggio finale a Supabase possiamo continuare tranquillamente a migliorare l'app
- Quando ripartiamo, conviene sempre leggere prima questo file e poi aprire:
  - `app/(tabs)/agenda.tsx`
  - `app/cliente.tsx`
  - `src/context/AppContext.tsx`
  - `src/lib/booking.ts`
- Per la futura parte auth / anti-furbetti leggere anche:
  - `docs/trial-auth-antiabuse-plan.md`
