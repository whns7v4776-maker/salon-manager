# Push Notifications (Frontend + Backend)

Questa base implementa le push Expo con coda backend su Supabase.

## Cosa e stato aggiunto

- Frontend Expo:
  - Registrazione token push (`expo-notifications`, `expo-device`)
  - Richiesta permessi utente
  - Salvataggio token locale
  - Sync token su backend tramite RPC `upsert_push_device` oppure `upsert_public_push_device`
- Backend Supabase:
  - Tabelle:
    - `public.push_devices`
    - `public.push_notifications`
    - `public.client_portals`
  - RPC:
    - `public.upsert_push_device(...)`
    - `public.upsert_public_push_device(...)`
    - `public.queue_workspace_push(...)`
    - `public.queue_public_workspace_push(...)`
    - `public.claim_push_notifications(...)`
    - `public.mark_push_notification_result(...)`
  - Trigger su `public.booking_requests`:
    - Insert da frontend in stato `pending`
    - Update cambio stato richiesta
  - Edge Function:
    - `supabase/functions/send-push/index.ts`

## Flusso

1. L'app registra il token Expo sul device.
2. L'app tenta la sincronizzazione token su Supabase.
  - Se esiste una sessione auth usa le RPC protette.
  - Se non esiste una sessione auth ma il workspace id e valido UUID usa le RPC pubbliche.
3. Eventi backend (es. booking requests) entrano in coda (`push_notifications`).
4. Edge Function `send-push` legge la coda, invia a Expo Push API e marca `sent`/`failed`.

## Deploy backend

1. Applica migration:
   - `supabase db push`
2. Deploy edge function:
   - `supabase functions deploy send-push`
3. Configura secret (se mancanti):
  - `SUPABASE_URL` oppure `URL`
  - `SUPABASE_SERVICE_ROLE_KEY` oppure `SERVICE_ROLE_KEY`

## Esecuzione periodica invio push

La function va chiamata periodicamente (es. ogni 1 minuto) con POST.

Esempio payload:

```json
{ "limit": 50 }
```

Puoi usare:
- Scheduled Job Supabase
- Cron esterno
- GitHub Action schedulata

## Note importanti

- La sync backend richiede sempre un `workspace_id` valido UUID.
- Se il workspace e ancora locale-only (id non UUID), il token resta registrato sul device ma non viene scritto su backend.
- Le nuove RPC pubbliche servono a sostenere il flusso cliente reale e il backoffice locale senza dipendere obbligatoriamente da una sessione Supabase autenticata.
- La function `send-push` accetta sia i secret con prefisso `SUPABASE_` sia i nomi brevi `URL` e `SERVICE_ROLE_KEY`.
- In produzione, assicurati di configurare correttamente i certificati/APNs/FCM nel progetto Expo/EAS.
