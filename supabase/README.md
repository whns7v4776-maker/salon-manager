# Supabase Setup

Questa cartella contiene la base dati consigliata per portare `salon-manager` da storage locale a backend reale con:

- isolamento totale per salone/workspace
- una sola mail proprietaria per abbonamento
- stato account `demo / active / suspended / expired`
- base pronta per trial anti-abuso e controlli free/demo
- blocco accesso quando l'abbonamento non e attivo
- base pronta per backup, admin panel e billing

## File

- `schema.sql`
  Crea tabelle, enum, trigger `updated_at`, helper SQL e policy RLS.
- `migrations/20260314190000_initial_schema.sql`
  Migration iniziale pronta da applicare con Supabase CLI o da usare come baseline storica del progetto.
- `config.toml`
  Config standard Supabase CLI per sviluppo locale e futuro link al progetto remoto.
- `seed.sql`
  Placeholder opzionale per dati seed locali.

## Modello dati

Le entita principali sono:

- `workspaces`
  Un salone = un workspace.
- `workspace_members`
  Collega l'utente auth al workspace. In questa versione il ruolo previsto e solo `owner`.
- `owner_profiles`
  Profilo proprietario con provider auth, stato verifica mail/telefono e riferimenti di identita.
- `subscriptions`
  Stato dell'abbonamento, piano, platform store e riferimenti ricevuta.
- `device_fingerprints`
  Storico dispositivi e biometria locale per account proprietario.
- `trial_checks`
  Controlli di ammissibilita del trial prima della creazione workspace.
- `trial_usage`
  Storico reale dei trial usati o bloccati.
- `services`
  Servizi del salone.
- `customers`
  Rubrica clienti del salone.
- `booking_requests`
  Richieste arrivate dal frontend cliente.
- `appointments`
  Appuntamenti accettati o inseriti dal back office.
- `cash_movements`
  Incassi e movimenti di cassa.
- `connected_cards`
  Carte/metodi salvati dal salone.
- `events`
  Eventi marketing/iniziative.
- `message_templates`
  Template persistenti per messaggi.
- `backup_runs`
  Storico dei backup eseguiti dal sistema.

## Regole gia coperte

- ogni workspace ha una sola `owner_email`
- ogni workspace ha un solo `workspace_member`
- i dati applicativi sono tutti legati a `workspace_id`
- i trial possono essere controllati su `email`, `phone`, `provider_user_id` e `device_fingerprint`
- le subscription sono pronte per `ios / android / manual`
- le policy RLS leggono il workspace dell'utente autenticato
- se il workspace e `suspended` o `expired`, la mutazione dati viene bloccata dalle policy

## Cosa manca ancora

Questo schema non crea da solo:

- signup/login lato app
- provisioning automatico di workspace + member dopo la registrazione
- Sign in with Apple / Google lato frontend
- OTP telefono
- validazione ricevute App Store / Google Play
- backup reali su storage esterno
- pannello admin web

Queste parti vanno aggiunte sopra lo schema.

## Flusso consigliato

1. Crei il progetto Supabase.
2. Applichi `migrations/20260314190000_initial_schema.sql` come baseline iniziale.
3. In alternativa, se stai solo esplorando lo schema, puoi eseguire `schema.sql` nello SQL editor.
4. Alla creazione di un nuovo abbonamento:
   - crei `workspaces`
   - crei `owner_profiles`
   - crei `workspace_members`
   - crei `subscriptions`
   - crei `message_templates`
   - registri `trial_usage`
5. L'app mobile usa `auth.uid()` per accedere solo al workspace corretto.
6. Tu, da admin panel/server, usi service role per:
   - vedere tutti i workspace
   - sospendere/riattivare account
   - eseguire backup
   - forzare reset o migrazioni dati
   - bloccare trial furbetti

## Migrazioni da ora in avanti

La baseline iniziale e pronta. Da qui in poi la regola giusta e:

- non riscrivere la migration iniziale
- aggiungere solo file nuovi in `supabase/migrations/`
- usare `schema.sql` come spec completa leggibile

Guida rapida: [../docs/supabase-migrations-guide.md](../docs/supabase-migrations-guide.md)

## Trial anti-abuso

Questo schema e pronto per bloccare demo duplicate usando segnali forti:

- `email`
- `telefono`
- `auth_provider + provider_user_id`
- `device_fingerprint`
- identita salone simile

La logica consigliata resta lato backend:

1. arriva tentativo registrazione
2. backend crea riga in `trial_checks`
3. backend decide `allowed / blocked / review`
4. solo se `allowed` crea `workspace` e `trial_usage`

## Backup veri

Per i backup seri non basta iCloud e non basta il device.

La strada corretta e:

- database Supabase PostgreSQL
- backup pianificati lato server
- salvataggio su storage esterno o dump cifrati
- registrazione esito in `backup_runs`

Esempi pratici:

- dump giornaliero con GitHub Actions / cron server
- upload su S3 / Backblaze / storage privato
- aggiornamento `workspaces.last_backup_at`
- inserimento riga in `backup_runs`

## Nota admin

L'app attuale ha gia una base locale `workspace/account` nel context.
Quando collegheremo Supabase, quella parte andra sostituita con:

- sessione auth vera
- lettura `workspaces` e `subscriptions`
- sync dati da tabelle remote invece di AsyncStorage
