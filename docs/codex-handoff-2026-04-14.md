# Codex Handoff - 2026-04-14

## Stato generale

Sessione salvata per riprendere il lavoro domani sul progetto `salon-manager`.

Workspace corrente:
- `/Users/marzio/Desktop/salon-manager`

## Ultime modifiche completate

### Home / accesso cliente
- Sistemato il blocco accesso cliente in [app/index.tsx](/Users/marzio/Desktop/salon-manager/app/index.tsx).
- Accesso diretto con email + telefono dalla home verso il frontend cliente.
- Accesso biometrico collegato alle impostazioni frontend cliente.
- Logout frontend non cancella piu' il profilo biometrico.
- Pulsante biometrico visibile quando esiste davvero il profilo biometrico.
- Badge verde biometria sotto il pulsante: ora solo testo, senza icona.
- Pulsante Face ID: icona cambiata in simbolo piu' simile al Face ID e centrata meglio nel quadrato.
- Pulsante QR salone lasciato separato con icona scanner.
- Footer `Privacy / Supporto / Contatti` agganciato ai dati del salone salvato sul dispositivo.

### Frontend cliente
- Tolto il blocco `Codice salone / Apri salone / Salone attivo` da [app/cliente.tsx](/Users/marzio/Desktop/salon-manager/app/cliente.tsx).
- Fix bug nel day picker: tap sul giorno non tornava piu' al giorno precedente.
- Badge notifiche frontend: lettura notifiche ora azzera i `+` anche nel caso locale/workspace.
- Slot orari selezionati migliorati visivamente:
  - background piu' chiaro e leggibile
  - bordo piu' deciso
  - testo blu scuro
  - badge `Selezionato` in alto

### Card servizi frontend
- Card servizio selezionata resa piu' larga.
- Card non selezionate rese piu' strette.
- Badge dentro le card non vengono piu' tagliati.
- Badge `Salone` cambiato in grigio chiaro per non confondersi con `Scelto`.

### Backend proprietario
- In [src/screens/OwnerAccessScreen.tsx](/Users/marzio/Desktop/salon-manager/src/screens/OwnerAccessScreen.tsx):
  - header migliorato
  - freccia back verso home
  - registrazione con selezione multipla attivita'
  - `+ Nuova categoria` in giallo opaco

## Backup aggiornati

Sono stati sovrascritti con la versione aggiornata:
- `/Users/marzio/Projects/Backup/salon-manager-completo-2026-04-12-2358.tar`
- `/Users/marzio/Projects/Backup/salon-manager-light-2026-04-12-2358.tar.gz`

## Nota importante sulle icone notifica

Verifica fatta:
- in [app.config.js](/Users/marzio/Desktop/salon-manager/app.config.js:43) l'icona notifiche Android punta gia' a `notification_android_96_refresh.png`
- per il web e' usato `/notification-light.png`

Conclusione:
- se l'icona vecchia compare ancora su dispositivo mobile, molto probabilmente e' una build vecchia installata
- non e' un problema di "server non aggiornato" per le notifiche native

## File toccati di recente

- [app/index.tsx](/Users/marzio/Desktop/salon-manager/app/index.tsx)
- [app/cliente.tsx](/Users/marzio/Desktop/salon-manager/app/cliente.tsx)
- [app/cliente-impostazioni.tsx](/Users/marzio/Desktop/salon-manager/app/cliente-impostazioni.tsx)
- [src/screens/OwnerAccessScreen.tsx](/Users/marzio/Desktop/salon-manager/src/screens/OwnerAccessScreen.tsx)

## Ultima domanda aperta

Nessun task tecnico rimasto a meta' in questa sessione.

Se domani riprendiamo, i punti piu' probabili da verificare sono:
- controllo finale UI frontend cliente su device reale
- verifica build/installata rispetto alle icone notifica aggiornate
- eventuale nuovo giro di rifiniture UX
