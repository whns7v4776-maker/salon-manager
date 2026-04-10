# Trial, Auth e Anti-Abuso

Ultimo aggiornamento: 14 marzo 2026

## Obiettivo

Impostare una registrazione piu solida per evitare che uno stesso salone crei piu account demo/free cambiando solo mail o facendo il furbo con nuove registrazioni.

Questo piano e pensato per il momento in cui collegheremo l'app a Supabase e agli store.

## Punto chiave

Non possiamo leggere la carta di debito o credito associata ad Apple ID o Google account.

Quello che possiamo usare davvero e:

- `email`
- `numero telefono`
- `provider auth id`
  - Sign in with Apple
  - Sign in with Google
- `device fingerprint`
- `workspace/salone`
- `stato abbonamento store`
- `ricevuta subscription`

## Strategia consigliata

### 1. Registrazione forte

Campi obbligatori:

- nome
- cognome
- nome salone
- cellulare azienda
- email

Autenticazione consigliata:

- `Sign in with Apple`
- `Sign in with Google`
- `email + password` come fallback

Verifiche consigliate:

- verifica email
- OTP SMS sul numero aziendale

### 2. Un solo trial reale per soggetto

Il trial va bloccato se troviamo match su uno o piu segnali forti:

- stessa email
- stesso numero telefono verificato
- stesso account Apple
- stesso account Google
- stesso device fingerprint
- stesso nome salone + numero + citta molto simili

Non serve che coincidano tutti.

Regola pratica consigliata:

- blocco sicuro se coincide `telefono`
- blocco sicuro se coincide `provider_user_id`
- review / blocco se coincidono `device_fingerprint + nome salone simile`

### 3. Store subscription vera

Quando passeremo al modello definitivo:

- iOS: `App Store subscription`
- Android: `Google Play subscription`

Il backend dovra validare:

- ricevuta acquisto
- stato rinnovo
- scadenza
- trial gia usato

### 4. Ruolo del backend

Il backend dovra decidere:

- se il trial e consentito
- se un account e sospetto
- se un account e bloccato
- se un abbonamento e attivo
- se un dispositivo puo fare login biometrico locale dopo login valido

## Dati da salvare

### Tabella `profiles`

- `id`
- `workspace_id`
- `email`
- `phone`
- `first_name`
- `last_name`
- `auth_provider`
- `provider_user_id`
- `email_verified`
- `phone_verified`
- `created_at`

### Tabella `workspaces`

- `id`
- `owner_profile_id`
- `salon_name`
- `business_phone`
- `address_line`
- `city`
- `postal_code`
- `country_code`
- `status`
- `created_at`

### Tabella `trial_usage`

- `id`
- `workspace_id`
- `email`
- `phone`
- `provider`
- `provider_user_id`
- `device_fingerprint`
- `ip_hash`
- `started_at`
- `ended_at`
- `blocked_reason`

### Tabella `device_fingerprints`

- `id`
- `profile_id`
- `device_fingerprint`
- `platform`
- `first_seen_at`
- `last_seen_at`
- `biometric_enabled`

### Tabella `subscriptions`

- `id`
- `workspace_id`
- `platform`
- `product_id`
- `original_transaction_id`
- `store_customer_ref`
- `status`
- `trial_used`
- `started_at`
- `expires_at`
- `last_validated_at`

## Regole anti-abuso consigliate

### Blocco trial automatico

Niente nuovo free se:

- `phone_verified` gia usato
- `provider_user_id` gia usato
- `subscription` gia esistita sullo stesso soggetto

### Blocco trial sospetto

Mandiamo in review o blocchiamo se:

- stesso `device_fingerprint`
- nome salone quasi uguale
- stessa citta + stesso numero
- piu tentativi in poco tempo

### Un solo proprietario per abbonamento

Per il tuo modello attuale:

- `1 abbonamento = 1 mail proprietaria principale`
- eventuali utenti futuri saranno secondari e non proprietari

## Flusso consigliato

### Fase 1

- utente si registra
- verifica email
- verifica cellulare
- backend controlla trial

### Fase 2

Se tutto ok:

- crea `workspace`
- assegna stato `demo`
- salva `trial_usage`

Se non ok:

- blocca demo
- mostra messaggio: `demo gia usata su questo numero/account`

### Fase 3

Quando compra:

- store ritorna subscription
- backend valida ricevuta
- workspace passa a `active`

## Cosa faremo nel progetto

### Step backend-ready successivo

Quando inizieremo Supabase:

1. aggiungere tabelle `profiles`, `trial_usage`, `device_fingerprints`, `subscriptions`
2. introdurre `provider_user_id`
3. aggiungere `phone_verified`
4. salvare un `device_fingerprint`
5. bloccare trial in backend, non in frontend

### Step auth consigliato

Ordine migliore:

1. `email + password` attuale
2. `Sign in with Apple`
3. `Sign in with Google`
4. `OTP telefono`
5. `Store subscription validation`

## Decisione consigliata

La soluzione piu robusta per evitare account demo furbi e questa:

- `Apple/Google login`
- `telefono verificato`
- `backend trial guard`
- `subscription store validata`

Questa combinazione e molto piu affidabile di qualunque tentativo di identificare la carta bancaria dell'utente, che l'app non puo leggere.
